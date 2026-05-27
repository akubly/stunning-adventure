# Crucible Technical Design Plan

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-27
**Status:** READY FOR FAN-OUT — All blocking questions resolved (2026-05-27)

---

## ✅ Resolved Decisions (Formerly Blocking — All Locked 2026-05-27)

1. **Database file placement: FORK.** L1 WAL lives at `~/.crucible/crucible.db`. Clean separation from Cairn's `~/.cairn/knowledge.db`. No shared DB, no cross-DB foreign keys.

2. **Cairn/Forge strategy: FULL COEXIST FOREVER.** Aaron's rationale verbatim: *"Cairn and Forge were their own value-adds that we can still bring to CLI consumers that don't need or want the heavy hammer of Crucible."* Cairn and Forge remain **independent live products** with their own roadmaps, shipping as Copilot CLI plugins for the lightweight-harness audience. Crucible is greenfield alongside, on its own substrate. **No delegation, no shim packages, no harness-in-harness.** T5-consistent: T5 governs Aaron's daily-driver shell, not the broader product portfolio. Accepted tax: two implementations of overlapping concepts (Cairn `event_log` vs Crucible L1 WAL; Forge prescribers vs L3 Generators). Bounded because the audiences differ.

3. **Eureka status: EXTERNAL LIBRARY VIA OPTIONAL ADAPTER.** Graham's overlap-analysis recommendation stands. Eureka is not a Crucible chamber. Integration via optional Eureka-aware L3 generator that calls Eureka's public surface and emits standard ProposalGenerator proposals.

---

## 1. Design Document Structure

The Crucible Technical Design (CTD) is organized into 19 sections. Each section lists its purpose, expected depth, key questions answered, primary owner, and secondary contributors.

### Section Index

| # | Section | Depth | Primary Owner | Secondary |
|---|---------|-------|--------------|-----------|
| 1 | Architectural Overview | 3 pp | Graham | Erasmus (review) |
| 2 | L0/L1 Boundary Contract | 3 pp | Graham | Alexander, Roger |
| 3 | L1 WAL Substrate | 10 pp | Roger | Laura, Gabriel |
| 4 | Hook Bus | 3 pp | Roger | Gabriel, Laura |
| 5 | Router Design (L4) | 3 pp | Gabriel | Graham, Rosella |
| 6 | Router Taxonomy (5 Primitives) | 1 pp | Graham | Valanice |
| 7 | Generators (L3) | 3 pp | Rosella | Graham, Laura |
| 8 | Applier + DecisionGate (L4) | 3 pp | Alexander | Gabriel, Graham |
| 9 | Aperture (L5-adjacent) | 3 pp | Valanice | Sonny (review) |
| 10 | Session Model + Branching | 3 pp | Roger | Alexander, Graham |
| 11 | Hermetic Replay | 3 pp | Laura | Alexander, Roger |
| 12 | Copilot SDK Integration | 3 pp | Alexander | Graham |
| 13 | Crucible CLI Shell | 3 pp | Valanice | Alexander |
| 14 | Eureka Integration Surface | 1 pp | Graham | Rosella |
| 15 | Coexistence & Shared Types | 3 pp | Roger | Alexander, Rosella |
| 16 | Test Strategy + Invariants | 3 pp | Laura | Gabriel |
| 17 | Observability / Telemetry | 1 pp | Gabriel | Roger |
| 18 | Security & Permissions | 1 pp | Gabriel | Graham |
| 19 | ADR Set | 1 pp | Graham | all |

**Total estimated CTD size: ~50 pages.**

---

### Section Details

#### §1 — Architectural Overview (3 pp)

**Purpose:** Present the 5-layer stack (L0 Provider → L1 WAL → L2 Derived Query → L3 Generators → L4 Router) plus Aperture as L5-adjacent investigation surface. Establish layer responsibilities, data-flow direction, and package-boundary mapping. **Crucible is greenfield** — Cairn and Forge persist as independent live products serving the Copilot CLI lightweight-harness audience (per Aaron's coexistence lock). The architectural overview must clearly delineate Crucible's own package namespace (`@akubly/crucible-*`) as separate from the existing `@akubly/cairn` / `@akubly/forge` packages.

**Key questions answered:**
- What are the exact responsibilities of each layer?
- How do layers communicate (event flow, query flow, control flow)?
- What is the package decomposition (`@akubly/crucible-*` namespace)?
- How does the 5-layer stack relate to the Crucible chambers (Crucible, Curator, Alchemist, Aperture)?
- How does Crucible coexist with Cairn/Forge as separate products (shared `@akubly/types` only)?

**Depth guidance:** Prose + one canonical diagram (layer cake with data-flow arrows). Reference locked decisions only — no re-litigation. Include chamber-to-layer mapping table.

**Owner:** Graham
**Secondary:** Erasmus (advisory review for agentic-harness pattern coherence)

---

#### §2 — L0/L1 Boundary Contract (3 pp)

**Purpose:** Specify the hermetic pure-data interface between the SDK Provider (L0) and the WAL (L1). This is the locked boundary from `graham-opens-1-and-3` — the CTD codifies it with interface signatures.

**Key questions answered:**
- What types cross the L0→L1 boundary (up): `BootstrapPayload`, `CrucibleEvent`?
- What types cross L1→L0 (down): `OutboundPrompt`, control signals?
- What does NOT cross: SDK types, promises, iterators?
- How is the boundary enforced (dependency-cruiser rules)?

**Depth guidance:** TypeScript interface signatures (pseudocode-level, not final impl). Dependency-cruiser rule specification. Migration checklist for the 5 production files that move to `l0-provider/`.

**Owner:** Graham
**Secondary:** Alexander (SDK-side contract), Roger (WAL-side contract)

**References:** `decisions.md` — Phase B #1, `graham-opens-1-and-3`

---

#### §3 — L1 WAL Substrate (10 pp)

**Purpose:** Full specification of the custom pure-TS append-only WAL — the load-bearing storage primitive. This is the deepest section because every upper layer depends on it. **Storage location locked:** `~/.crucible/crucible.db` (clean fork from Cairn's `~/.cairn/knowledge.db`; no shared DB, no cross-DB foreign keys).

**Key questions answered:**
- WAL row schema (the 8+2 fields: primitives, read-set hash, hook verdict, hook witness)?
- Storage layout on disk — `~/.crucible/crucible.db` file format, segment rotation, fsync strategy?
- Group-commit protocol (batch boundaries, seal-and-split for pause verdicts)?
- Content addressing per row (CBOR + BLAKE3)?
- Hash chain linking (append-only, self-audit)?
- Commit offset exposure for L1Subscriber interface?
- L1Subscriber contract (`onCommit(offset, rows[])`)?

**Depth guidance:** Schema definitions (TypeScript types + on-disk binary layout). Pseudocode for critical paths (append, group-commit, seal-and-split). Performance envelope (≤1ms p99 append, 80µs predicate budget). Storage volume projections.

**Owner:** Roger
**Secondary:** Laura (conformance assertions A1-A4 integration points), Gabriel (CI harness for WAL invariants)

**References:** `decisions.md` — A.3 hybrid lock, v1 commitment #10, Open #5 (CBOR+BLAKE3)

---

#### §4 — Hook Bus (3 pp)

**Purpose:** Specify the pre-commit per-row verdict system that provides Crucible's real-time safety floor.

**Key questions answered:**
- Verdict enum: `{continue, observe, pause}` — semantics of each?
- Where in the group-commit window does the bus fire (after read-set hash, before seal)?
- Seal-and-split protocol on pause (rows 1..N seal, N+1..end restage)?
- Predicate registration, compilation, kind-indexed dispatch?
- Subscriber model (per-verdict-type opt-in, bounded queues, backpressure)?
- WAL fields: `hook_verdict: u8?`, `hook_verdict_witness: blake3?`?
- Replay recording of non-continue verdicts (predicate_id, policy_version, candidate_hash)?

**Depth guidance:** Interface signatures for predicate registration. Pseudocode for bus dispatch loop. Performance budget breakdown (80µs envelope, ~50 predicates safe). Backpressure policy.

**Owner:** Roger
**Secondary:** Gabriel (Router-side contract for pause receipt), Laura (P1-P5 property/fuzz assertions)

**References:** `decisions.md` — Roger Hook Bus Signoff, Gabriel Hook Bus Router Verdict, Phase A locks

---

#### §5 — Router Design (L4) (3 pp)

**Purpose:** Specify the single safety/policy choke-point. The Router receives all pause verdicts from the hook bus and all proposals from L3 generators, applying policy to produce approval/rejection/escalation decisions.

**Key questions answered:**
- Router's input sources (hook bus pause verdicts + L3 proposal queue)?
- Policy table structure (`(category, confidence, source, user-pref) → action`)?
- Verdict ack budget (50ms transit)?
- `RouterDecision` event shape emitted back to bus (closing the loop for replay)?
- How Router state is replayable from recorded verdict stream + policy versions alone?
- Extension point for debugger verdicts (continue, step, step-into, step-out, abort, edit-and-continue)?

**Depth guidance:** Policy table schema. Interface signatures. State machine for proposal lifecycle. Integration point with Aperture (Router decisions → ApertureEvent).

**Owner:** Gabriel
**Secondary:** Graham (policy architecture), Rosella (generator-side proposal submission contract)

**References:** `decisions.md` — Gabriel Hook Bus Router Verdict §6, Tension #2 resolution, L4 verdict extensibility prerequisite

---

#### §6 — Router Taxonomy: 5 Primitives (1 pp)

**Purpose:** Define the canonical 5-primitive vocabulary that all layers speak: Request, Artifact, Observation, Decision, Question. Lock sub-types and schema shapes.

**Key questions answered:**
- What fields does each primitive carry (common envelope + per-kind payload)?
- What are the sub-types (e.g., TaskStart/TaskEnd on Request/Observation)?
- How are parent/child links represented (content-addressed references)?
- What is the schema-versioning strategy for primitives?

**Depth guidance:** TypeScript type definitions for each primitive. Sub-type enumeration. One-paragraph rationale for each primitive's role. Cross-reference to L1 WAL row schema.

**Owner:** Graham
**Secondary:** Valanice (user-facing primitive semantics — Question and Decision are interaction primitives)

---

#### §7 — Generators (L3) (3 pp)

**Purpose:** Specify the `ProposalGenerator` interface and the generator ecosystem. Forge, Curator, Alchemist, and third-party generators all implement this contract.

**Key questions answered:**
- `ProposalGenerator` interface (the 8-field schema: category, confidence, rationale, preview, fitnessContract, evidence, costEstimate, reversibility + determinismClass + causalReadSet)?
- Dual-interface split: `DataProposalGenerator` (85% case) vs `StructuralProposalGenerator` (Alchemist, skill-induction)?
- Forge-as-generator: how existing prescribers map to the ProposalGenerator contract?
- Curator-as-generator: detection + proposal authority, never approval?
- Optional Eureka-aware generator: adapter pattern, calls Eureka public surface, emits normal proposals?
- Plugin lifecycle contract (discovery, registration, trust-tier stamping)?
- `ReadSetBuilder` helper for Salsa-mediated reads?

**Depth guidance:** Interface signatures (TypeScript). Generator registration protocol. Trust-tier attribution table (`builtin`/`adopted`/`community`/`external`). One worked example: Forge prescriber adapted to ProposalGenerator.

**Owner:** Rosella
**Secondary:** Graham (contract shape authority), Laura (fitnessContract + causalReadSet fields)

**References:** `decisions.md` — Phase A 8-field schema lock, Rosella dual-interface proposal, Round 2.3 trust-tier vocabulary

---

#### §8 — Applier + DecisionGate (L4) (3 pp)

**Purpose:** Specify how approved proposals become mutations. The Applier executes approved proposals; the DecisionGate is the human-in-the-loop surface for proposals requiring explicit ACK.

**Key questions answered:**
- How does the Applier receive approved proposals from the Router?
- What is the apply protocol (transactional with ledger-position fence)?
- DecisionGate UX: how does Aaron see and approve/reject/defer proposals?
- How are applied decisions recorded as Decision primitives in L1?
- Rollback/revert semantics for applied proposals?

**Depth guidance:** Interface signatures. State machine (proposed → approved → applying → applied | failed). Integration with Aperture notifications. Pseudocode for ledger-position fence check.

**Owner:** Alexander
**Secondary:** Gabriel (Router handoff contract), Graham (transactional guarantee review)

---

#### §9 — Aperture (L5-adjacent) (3 pp)

**Purpose:** Specify the investigation + trust-building surface. Aperture subsumes the old Mirror/Narrator concepts. Two render modes: Notifications (push) and Dashboard (pull). Investigation tools: bisect, causal slice, time-travel.

**Key questions answered:**
- `ApertureEvent` schema (id, ts, sessionId, producerLayer, category, level, title, bodyMarkdown, refs, state, payload, schemaVersion)?
- `aperture_events` projection table in L2 SQLite?
- Notification policy (urgent → inline, attention → badge, notice → badge, info → dashboard-only)?
- CLI verbs: `crucible aperture watch` (tail), `crucible aperture show` (dashboard)?
- Investigation tools interface (bisect, causal-slice, delta-debug)?
- Breakpoint / watchpoint / logpoint registries?
- DAP sidecar integration surface?

**Depth guidance:** Schema definitions. CLI verb table. UX wireframes (text-mode). Investigation tool signatures (pseudocode). Sonny advisory review on debugger semantics.

**Owner:** Valanice
**Secondary:** Sonny (advisory review on debugger/investigation UX patterns)

**References:** `decisions.md` — Round 2.1 Aperture rename, Open #3 Mirror resolution, Sonny L5 proposal

---

#### §10 — Session Model + Branching (3 pp)

**Purpose:** Specify session lifecycle, fork semantics, and branch metadata. Sessions are first-class with parent/child lineage. **Note:** Crucible sessions live in `~/.crucible/crucible.db`, entirely separate from Cairn's `sessions` table in `~/.cairn/knowledge.db`.

**Key questions answered:**
- `sessions` table schema: `parent_session_id`, `fork_point_event_id`?
- Fork protocol: `cairn fork --at <event_id>` creates child session with COW snapshot?
- Branch metadata as Cairn primitives (queryable, comparable)?
- How does branching interact with the WAL (new WAL segment per fork, or shared prefix)?
- Multi-path comparison (token cost, quality, time across sibling branches)?
- Sub-task model: `task_id` field on WAL rows, TaskStart/TaskEnd primitives, serial v1 execution?

**Depth guidance:** Schema definitions (SQL migration shape). Fork protocol pseudocode. COW snapshot mechanics. Worked example: fork at Decision, explore alternative, compare outcomes.

**Owner:** Roger
**Secondary:** Alexander (session bootstrap from SDK), Graham (branching architecture)

**References:** `decisions.md` — Phase B #2 (2a: wrap SDK at L1), Aaron Insight #1 (branching is v1 functional requirement), §2.8 sub-task model

---

#### §11 — Hermetic Replay (3 pp)

**Purpose:** Specify the capture spine and re-feed semantics. Every external call emits an Observation carrying request hash + response payload. Replay re-feeds Observations, never re-executes.

**Key questions answered:**
- What is captured (LLM calls, MCP tool calls, web, filesystem reads)?
- CAS observation store: content-addressed, ~5-10× ledger volume?
- Replay protocol: load captured Observations, feed into session at matching request hashes?
- Determinism conformance suite: A1 (hash integrity), A2 (reference resolvability), A3 (replay equivalence — load-bearing), A4 (population completeness)?
- What is explicitly NOT deterministic (LLM temperature, external state changes)?
- Replay doctrine wording for user understanding?

**Depth guidance:** Interface signatures for capture + replay. Conformance assertion specifications (A1-A4 with test pseudocode). Storage volume analysis. Explicit non-determinism acknowledgment section.

**Owner:** Laura
**Secondary:** Alexander (LLM-boundary capture implementation), Roger (CAS store integration with L1)

**References:** `decisions.md` — v1 commitment #2, #4; Aaron Insight #3; US-G-NEW-2

---

#### §12 — Copilot SDK Integration (3 pp)

**Purpose:** Specify how Crucible builds on the Copilot SDK. Crucible owns the trunk (message loop, ledger, Router); Copilot SDK provides model/tool substrate.

**Key questions answered:**
- How does Crucible bootstrap a session via the SDK?
- `SdkProvider` (née `ForgeClient`): the L0 provider implementation?
- What SDK surface does L0 expose (model calls, tool calls) and what does it hide?
- Session bootstrap sequence: SDK session → BootstrapPayload → L1 WAL initialized?
- How are multiple providers supported (Copilot SDK as one, future providers as others)?
- T5 resolution: Crucible owns trunk, Copilot CLI is one provider?
- How does `@akubly/crucible-runtime` relate to existing `@akubly/skillsmith-runtime`? (Answer: they are independent — `skillsmith-runtime` stays with Cairn/Forge; `crucible-runtime` is greenfield.)

**Depth guidance:** Sequence diagram (session bootstrap). Interface signatures. Provider registration protocol. Worked example: Crucible session with Copilot SDK provider.

**Owner:** Alexander
**Secondary:** Graham (T5 architecture framing)

**References:** `decisions.md` — T5 Resolution, Phase B #1, Open #1 (l0-provider/)

---

#### §13 — Crucible CLI Shell (3 pp)

**Purpose:** Specify the CLI that replaces Copilot CLI as Aaron's daily driver. Command vocabulary, interaction patterns, REPL semantics.

**Key questions answered:**
- Command vocabulary: `crucible` top-level, sub-commands (aperture, fork, adopt, market, etc.)?
- REPL interaction model: thick turns with intra-turn primitives revealable on demand?
- How does the CLI compose with the runtime (thin shell around `@akubly/crucible-runtime`)?
- Saved queries / `@lobby` default landing surface?
- Progressive disclosure: Ctrl+E / Ctrl+T reveal internals?

**Depth guidance:** Command table with verb, arguments, description. Interaction flow diagrams (text-mode). UX principles document (Valanice's metaphor discipline: rewind/what-if > debugger language).

**Owner:** Valanice
**Secondary:** Alexander (runtime integration)

**References:** `decisions.md` — T5 resolution, Valanice UX metaphor discipline, Round 2.1 CLI verb examples

---

#### §14 — Eureka Integration Surface (1 pp)

**Purpose:** Specify the narrow post-acceptance integration contract. **Locked:** Eureka is an external library consumed via optional adapter — NOT a Crucible chamber. Assumes Eureka team accepted our proposal (storage fork, narrowed contract surface).

**Key questions answered:**
- Shared contracts: `SessionId` brand, `DecisionRecord` schemaVersion in `@akubly/types`?
- Optional Eureka-aware generator: adapter pattern — Crucible-owned L3 generator calls Eureka's public surface, emits standard ProposalGenerator proposals. Eureka never imports Crucible types.
- Bridge telemetry: what telemetry does Crucible expose that Eureka may consume?
- What Crucible does NOT expose to Eureka: WAL internals, hook bus, L1 storage layout, `~/.crucible/` filesystem?
- How does the coexistence model affect Eureka? (Eureka bridges target Cairn, not Crucible — they remain independent consumers of `@akubly/types`.)

**Depth guidance:** Prose-only, referencing overlap analysis consensus. Contract table (shared vs private). One-paragraph adapter pattern sketch. Explicit boundary: Eureka ↔ Cairn bridges are Eureka's concern, not Crucible's.

**Owner:** Graham
**Secondary:** Rosella (generator contract alignment)

**References:** `decisions.md` — Eureka PRD Overlap Analysis consensus, Cross-PRD Coordination (Cassima reply), Aaron Eureka status lock (2026-05-27)

---

#### §15 — Coexistence & Shared Types Plan (3 pp)

**Purpose:** Specify how Crucible (greenfield, `~/.crucible/`) coexists with Cairn/Forge (independent products, `~/.cairn/`). **No Cairn restructure, no skillsmith-runtime absorption into Crucible.** The two product families share only `@akubly/types` and evolve independently. This section replaces the prior "Migration Plan" — there is no migration because Crucible is greenfield.

**Key questions answered:**
- **Two-product coexistence model:** Crucible owns `~/.crucible/crucible.db` (L1 WAL + L2 derived SQLite). Cairn owns `~/.cairn/knowledge.db`. No shared DB, no cross-DB foreign keys, no runtime `ATTACH`. Both consume `@akubly/types` as their shared contract surface.
- `@akubly/types` co-evolution: what new Crucible types land (e.g., `CrucibleEvent`, `BootstrapPayload`, WAL row types), what existing types are shared (e.g., `SessionId` brand, `DecisionRecord`), governance model (CODEOWNERS co-ownership)?
- Package namespace: Crucible packages are `@akubly/crucible-*` (runtime, cli, types). Cairn/Forge packages remain `@akubly/cairn`, `@akubly/forge`, `@akubly/skillsmith-runtime`. No rename, no absorption.
- Accepted tax: two implementations of overlapping concepts. Cairn `event_log` vs Crucible L1 WAL. Forge prescribers vs Crucible L3 Generators. Bounded because audiences differ (Copilot CLI lightweight users vs Aaron's daily-driver Crucible).
- What Crucible borrows from Cairn/Forge: *patterns* only (canonical JSON hashing, fail-open hook doctrine, injection-port pattern, async Curator with cursor polling, SQLite WAL + migration discipline). No code import, no package dependency Crucible → Cairn.
- `skillsmith-runtime` disposition: remains as-is in the Cairn/Forge product family. Not renamed, not absorbed. If Alexander's CTD §12 needs a Crucible composition root, it is a NEW package (`@akubly/crucible-runtime`), not a rename.
- Monorepo layout: Crucible packages live alongside Cairn/Forge in `packages/` but have zero package-level dependencies on each other (enforced by dep-cruiser or workspace isolation).

**Depth guidance:** Coexistence boundary table (what's shared, what's private). `@akubly/types` evolution plan (new types + versioning protocol). Monorepo layout diagram (before/after). No migration SQL — Crucible starts from an empty `~/.crucible/crucible.db`.

**Owner:** Roger
**Secondary:** Alexander (Crucible runtime package), Rosella (plugin discovery — Crucible has its own, Cairn keeps existing)

**References:** Aaron's coexistence lock (2026-05-27), `decisions.md` — Cross-PRD Coordination (Cassima reply, `@akubly/types` governance)

---

#### §16 — Test Strategy + Invariants (3 pp)

**Purpose:** Specify the testing approach for the CTD. Covers unit, integration, property/fuzz, conformance, and acceptance testing.

**Key questions answered:**
- Determinism conformance suite (A1-A4 assertions) — how is it run in CI?
- Property/fuzz regime for hook bus (P1-P5)?
- Snapshot → replay → snapshot deep-equal invariant test?
- Acceptance test harness for the agentic-debugger thesis?
- What is the "one-week productivity loop" bar test?
- Test pyramid: unit (majority), integration (L-boundary crossings), E2E (full session replay)?

**Depth guidance:** Test category table (category → scope → runner → CI stage). Invariant specifications (testable propositions). Fixture strategy. Target test counts per layer.

**Owner:** Laura
**Secondary:** Gabriel (CI integration, conformance harness runner)

---

#### §17 — Observability / Telemetry (1 pp)

**Purpose:** Specify what Crucible emits for operational visibility. Covers structured logging, metrics, and trace correlation.

**Key questions answered:**
- What structured events does each layer emit?
- Trace correlation: how does a session's telemetry correlate across layers?
- Per-call telemetry substrate fields (Roger's Sprint 6 0.5d scope)?
- What telemetry does Aperture consume vs what goes to external sinks?

**Depth guidance:** Event catalog table (event → layer → severity → fields). One paragraph on trace correlation strategy. No external observability infra in v1 (single-user — Aperture IS the observability surface).

**Owner:** Gabriel
**Secondary:** Roger (per-call telemetry fields)

---

#### §18 — Security & Permissions (1 pp)

**Purpose:** Specify Crucible's security model. The hook bus verdicts are the safety floor; the Router is the policy enforcement point.

**Key questions answered:**
- How do hook bus verdicts provide real-time safety (pause before dangerous operations)?
- Plugin sandboxing: subprocess + capability-token isolation?
- Trust-tier policy (`builtin`/`adopted`/`community`/`external` → Router policy defaults)?
- Secret handling: Tension #6 capture-vs-privacy (flagged for v1.5)?
- What is out of scope for v1 security (multi-user, external attestation, Sigstore)?

**Depth guidance:** Threat model summary (single-user, self-audit). Policy defaults table. One paragraph on Tension #6 deferral.

**Owner:** Gabriel
**Secondary:** Graham (policy architecture)

---

#### §19 — ADR Set (1 pp)

**Purpose:** Enumerate the Architectural Decision Records that must land alongside the CTD. Each ADR locks a design choice that would be expensive to reverse.

**Key questions answered:**
- Which decisions from `decisions.md` need formal ADRs?
- What new decisions will the CTD surface that need ADRs?
- ADR format (reference: `docs/adr/0001-composition-root.md`)?

**Candidate ADR list:**
- ADR-0002: L1 Substrate Selection (A.3 hybrid)
- ADR-0003: L0/L1 Boundary Hermetic Contract
- ADR-0004: Canonical Serialization (CBOR + BLAKE3)
- ADR-0005: Hook Bus Verdict Model (continue/observe/pause)
- ADR-0006: Router as Single Policy Choke-Point
- ADR-0007: Session Branching Model (parent_session_id + fork_point_event_id)
- ADR-0008: Hermetic Replay Doctrine (re-feed, never re-execute)
- ADR-0009: T5 Resolution (Crucible owns trunk, SDK is provider)
- ADR-0010: Cairn/Forge Coexistence (independent products, shared types only)

**Depth guidance:** Table only (ADR number → title → status → author). Actual ADR authoring happens post-CTD.

**Owner:** Graham
**Secondary:** All section owners author their relevant ADRs

---

## 2. Ownership Map

| Section | Primary Owner | Secondary Contributors | Reviewer | Consultant |
|---------|--------------|----------------------|----------|------------|
| §1 Arch Overview | Graham | — | Erasmus | — |
| §2 L0/L1 Boundary | Graham | Alexander, Roger | Laura | — |
| §3 L1 WAL Substrate | Roger | Laura, Gabriel | Graham | — |
| §4 Hook Bus | Roger | Gabriel, Laura | Graham | — |
| §5 Router Design | Gabriel | Graham, Rosella | Alexander | — |
| §6 5 Primitives | Graham | Valanice | Roger | — |
| §7 Generators (L3) | Rosella | Graham, Laura | Gabriel | — |
| §8 Applier + DecisionGate | Alexander | Gabriel, Graham | Valanice | — |
| §9 Aperture | Valanice | — | Graham | Sonny |
| §10 Session + Branching | Roger | Alexander, Graham | Laura | — |
| §11 Hermetic Replay | Laura | Alexander, Roger | Graham | — |
| §12 SDK Integration | Alexander | Graham | Roger | — |
| §13 CLI Shell | Valanice | Alexander | Graham | Sonny |
| §14 Eureka Integration | Graham | Rosella | Alexander | — |
| §15 Coexistence & Types | Roger | Alexander, Rosella | Graham | — |
| §16 Test Strategy | Laura | Gabriel | Graham | — |
| §17 Observability | Gabriel | Roger | Alexander | — |
| §18 Security | Gabriel | Graham | Roger | — |
| §19 ADR Set | Graham | all | Aaron | — |

**Roster binding:**
- **Graham** (Lead/Architect): 6 primary sections (§1, §2, §6, §14, §19 + cross-section synthesis)
- **Roger** (Platform Dev): 4 primary sections (§3, §4, §10, §15) — heaviest load, deepest section (§3)
- **Rosella** (Plugin Dev): 1 primary section (§7) — focused depth on generator contract
- **Alexander** (SDK/Runtime): 2 primary sections (§8, §12) — SDK integration authority
- **Gabriel** (Infra/Safety): 3 primary sections (§5, §17, §18) — Router + observability + security
- **Laura** (Eval/QA): 2 primary sections (§11, §16) — determinism + test strategy
- **Valanice** (UX): 2 primary sections (§9, §13) — Aperture + CLI shell
- **Erasmus** (Consultant): Advisory review on §1, pulled in after first draft
- **Sonny** (Consultant): Advisory review on §9, §13, pulled in after Valanice's first draft

---

## 3. Sequencing & Dependency Graph

### Phase 0 — Foundation (must land first, serial)

```
§2 L0/L1 Boundary Contract (Graham)
  ↓
§6 Router Taxonomy / 5 Primitives (Graham)
```

**Rationale:** Every other section references the L0/L1 boundary and the primitive vocabulary. These two sections are Graham-authored and can be drafted in rapid sequence (~1 day).

### Phase 1 — Core Stack (parallel fan-out, depends on Phase 0)

```
┌─ §3 L1 WAL Substrate (Roger)
│  └─ §4 Hook Bus (Roger) [sequential after §3]
│
├─ §7 Generators / L3 (Rosella)
│
├─ §12 SDK Integration (Alexander)
│  └─ §8 Applier + DecisionGate (Alexander) [sequential after §12]
│
├─ §11 Hermetic Replay (Laura)
│
├─ §5 Router Design (Gabriel)
│
└─ §1 Architectural Overview (Graham) [parallel with all; synthesizes]
```

**Parallel lanes:** 5 independent lanes. Roger's §3→§4 and Alexander's §12→§8 are internally serial but parallel with each other.

### Phase 2 — Dependent Sections (depends on Phase 1 outputs)

```
┌─ §10 Session + Branching (Roger) [depends on §3 WAL format]
│
├─ §9 Aperture (Valanice) [depends on §5 Router, §4 Hook Bus for event sources]
│
├─ §13 CLI Shell (Valanice) [depends on §8 Applier, §12 SDK for interaction model]
│
├─ §15 Coexistence & Types (Roger) [depends on §3 WAL, §7 Generators for target state]
│
├─ §14 Eureka Integration (Graham) [depends on §7 Generators for adapter contract]
│
└─ §16 Test Strategy (Laura) [depends on §3, §4, §11 for invariant surface]
```

### Phase 3 — Cross-Cutting (depends on Phase 2)

```
┌─ §17 Observability (Gabriel)
├─ §18 Security (Gabriel)
└─ §19 ADR Set (Graham) [synthesizes all sections]
```

### Dependency Summary

```
Phase 0 (1 day)  →  Phase 1 (3 days parallel)  →  Phase 2 (2 days parallel)  →  Phase 3 (1 day)
                                                                                        ↓
                                                                              Review Round (2 days)
```

**Critical path:** §2 → §3 → §10 → §15 → §19 (Roger's chain is the longest serial dependency).

**Total elapsed time:** ~7 working days (1 authoring round of ~5 days + 1 review round of ~2 days).

---

## 4. Depth Calibration

| Section | Pages | Detail Level | Deliverable Shape |
|---------|-------|-------------|-------------------|
| §1 Arch Overview | 3 | Prose + diagram | Layer-cake diagram, chamber mapping table, package list |
| §2 L0/L1 Boundary | 3 | Interface signatures | TypeScript interfaces, dependency-cruiser rules |
| §3 L1 WAL Substrate | 10 | Schema + pseudocode | On-disk format, TypeScript types, append/commit pseudocode, perf envelope |
| §4 Hook Bus | 3 | Interface + pseudocode | Predicate interface, dispatch pseudocode, backpressure policy |
| §5 Router Design | 3 | Schema + state machine | Policy table SQL, proposal state machine, verdict ack protocol |
| §6 5 Primitives | 1 | TypeScript types | Type definitions, sub-type enum, one-line rationales |
| §7 Generators (L3) | 3 | Interface + worked example | ProposalGenerator interface, Forge adapter example, trust-tier table |
| §8 Applier + DecisionGate | 3 | Interface + state machine | Apply protocol, ledger-position fence pseudocode, rollback semantics |
| §9 Aperture | 3 | Schema + UX wireframes | ApertureEvent schema, CLI verb table, text-mode wireframes, investigation tool sigs |
| §10 Session + Branching | 3 | Schema + pseudocode | Migration SQL, fork protocol pseudocode, COW mechanics |
| §11 Hermetic Replay | 3 | Interface + test specs | Capture/replay interfaces, A1-A4 assertion specs, non-determinism doctrine |
| §12 SDK Integration | 3 | Sequence diagram + interface | Bootstrap sequence, SdkProvider interface, provider registration |
| §13 CLI Shell | 3 | Command table + UX flows | Verb table, interaction flow diagrams, progressive disclosure spec |
| §14 Eureka Integration | 1 | Prose only | Contract table (shared vs private), adapter sketch |
| §15 Coexistence & Types | 3 | Boundary table + layout diagram | Coexistence boundary table, @akubly/types evolution plan, monorepo layout |
| §16 Test Strategy | 3 | Test matrix + invariants | Category table, invariant propositions, fixture strategy |
| §17 Observability | 1 | Event catalog | Event table (event → layer → fields), trace correlation paragraph |
| §18 Security | 1 | Threat model + policy table | Threat model summary, trust-tier defaults, Tension #6 deferral |
| §19 ADR Set | 1 | ADR index table | Number → title → status → author |

---

## 5. Review Gates

### Gate 1 — Phase 0 Review (before fan-out)

**What:** §2 (L0/L1 Boundary) + §6 (5 Primitives) reviewed by Roger + Alexander.
**Trigger for rejection:** Interface signature incompatible with locked Phase A decisions.
**Turnaround:** Same day.

### Gate 2 — Phase 1 Section Reviews (cross-review)

Each Phase 1 section is reviewed by its designated reviewer (see Ownership Map §2).
**Lockout rule:** If a reviewer rejects, a DIFFERENT agent must revise (the original author cannot self-fix a rejected section without a third-party re-review).
**Turnaround:** 1 day.

### Gate 3 — Consultant Pull-In (after Phase 2 drafts)

- **Erasmus:** Reviews §1 (Architectural Overview) for agentic-harness pattern coherence. Advisory — can flag concerns but cannot block.
- **Sonny:** Reviews §9 (Aperture) + §13 (CLI Shell) for debugger/investigation UX patterns. Advisory — can flag concerns but cannot block.

**Trigger:** Pull consultants after Valanice's Phase 2 drafts are complete.

### Gate 4 — Cross-Section Synthesis Review (Phase 3)

**What:** Graham synthesizes all sections, checking for interface mismatches, vocabulary drift, and dependency-graph inconsistencies.
**Output:** §19 (ADR Set) + any cross-section errata filed back to section owners.
**Reviewer:** Aaron (final approval on ADR set and overall coherence).

### Gate 5 — Final Approval

**What:** Complete CTD presented to Aaron.
**Trigger for rejection:** Scope exceeds v1 bar ("Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible"), or locked decisions violated.
**Turnaround:** Aaron's discretion.

---

## 6. Out-of-Scope

The CTD will **NOT** cover the following. Each is explicitly deferred with a named destination:

### Deferred to v1.5+

- **Federation / multi-tenant Cairn** — Solo-v1 locked (Tension #1). Tenant_id column exists from day 1 but federation infra is deferred.
- **Sigstore keyless signing** — v1 uses manual SHA-256 verification; Sigstore matters when third parties submit extensions.
- **Witness/notary tamper-evidence infrastructure** — Hash-linking stays; witness/notary deferred per Aaron Q4 resolution.
- **True parallel sub-task execution** — v1 is serial (§2.8 architecture lock). Batched ergonomics only.
- **Salsa-grade incremental query system** — v1 uses stateless cached projections with coarse-grained invalidation. Named as deferred architectural debt.
- **Curated extension catalog** — v1 catalog is auto-by-recency; curated deferred to v1.5.
- **Cross-session pattern mining at scale** — Ships as plugin, not core.
- **Secret redaction in observation capture** — Tension #6, flagged for Wave 4+.

### Deferred to Implementation Tickets

- **Actual dependency-cruiser rule authoring** — CTD specifies the rules; implementation is a ticket.
- **Migration SQL authoring** — CTD specifies migration shapes; actual SQL is implementation.
- **CLI command implementation** — CTD specifies verbs and UX; implementation is per-verb tickets.
- **Conformance test implementation** — CTD specifies A1-A4 + P1-P5; test code is implementation.
- **Aperture Projector implementation** — CTD specifies schema + event flow; projector code is implementation.

### Deferred to Separate ADRs (post-CTD)

- **Fitness function policy (Pareto vs scalarize)** — Multi-objective optimization strategy; Aaron must decide.
- **Plugin sandboxing implementation details** — Subprocess + capability-token; ADR for specific isolation mechanism.
- **Observation capture compression strategy** — Storage volume optimization for CAS store.
- **`harness-vision.md` Narrator→Aperture terminology pass** — 8 locations flagged, separate editorial PR.

---

## 7. Risks to the Design Effort

### Risk 1: Roger's Chain Is the Critical Path (HIGH)

Roger owns 4 primary sections including the deepest (§3, 10 pages). His chain (§3 → §4 → §10 → §15) is the longest serial dependency. If Roger's §3 slips, everything downstream slips. Note: §15 is now lighter (coexistence boundary, not full migration plan) which de-risks the tail.

**Mitigation:** Graham authors §2 (L0/L1 boundary) early to unblock Roger. Roger starts §3 immediately on Phase 1 kickoff. §4 (Hook Bus) can begin before §3 is fully complete (they share author; bus is an extension of WAL semantics).

### Risk 2: Vocabulary Drift Between Sections (MEDIUM)

With 7 authors writing 19 sections in parallel, terminology drift is likely (e.g., "proposal" vs "prescription," "Mirror" vs "Aperture").

**Mitigation:** §6 (Primitives vocabulary) lands in Phase 0 as the canonical glossary. Graham's Phase 3 cross-section synthesis catches remaining drift. Vocabulary table from `decisions.md` is the authority.

### Risk 3: Interface Signatures Diverge at Boundaries (MEDIUM)

Roger's L1 contract, Rosella's L3 contract, and Alexander's L0 contract all define interfaces that must interlock. Parallel authoring risks incompatible signatures.

**Mitigation:** §2 (L0/L1 boundary) is Phase 0 and provides the canonical shape. Secondary contributors on each section are the adjacent-layer owners (e.g., Roger is secondary on §2; Alexander is secondary on §3 indirectly via §12). Gate 2 cross-review catches mismatches.

### Risk 4: CTD Scope Creep Beyond ~50 Pages (LOW)

The 10-page allocation for §3 is generous. If other sections expand to match, the CTD becomes a novel.

**Mitigation:** Depth calibration (§4 above) is a contract. Review gates enforce page limits. "Prose only" sections (§14, §17, §18, §19) are capped at 1 page.

### ~~Risk 5: Open Questions Block Fan-Out~~ (RESOLVED)

All three blocking questions locked by Aaron (2026-05-27): DB file fork to `~/.crucible/crucible.db`, full coexist forever, Eureka as external library via adapter. Fan-out is unblocked.

---

## Appendix: Locked Decisions Referenced

This plan assumes and does not re-litigate:

- **T5 Resolution:** Crucible owns trunk, replaces Copilot CLI (2026-05-24)
- **L1 Substrate:** A.3 hybrid — custom TS append-log + SQLite for derived (2026-05-25)
- **L0/L1 Boundary:** Hermetic pure-data interface, dependency-cruiser enforced (2026-05-25)
- **Phase A Schema:** 8-field ProposalGenerator / prescription schema (2026-05-24)
- **Hook Bus:** Pre-commit per-row verdicts: continue/observe/pause (2026-05-24)
- **Canonical Serialization:** CBOR + BLAKE3 for L1; SHA-256 for DBOM (2026-05-25)
- **Aperture Rename:** Mirror → Aperture (2026-05-26)
- **Trust-Tier Vocabulary:** builtin / adopted / community / external (2026-05-26)
- **Eureka Coordination:** Storage fork, narrowed contract surface, optional adapter (2026-05-27)
- **Sub-task Execution:** Serial in v1 with batched ergonomics (2026-05-26)
- **5 Primitives:** Request, Artifact, Observation, Decision, Question (2026-05-24)
- **Vocabulary Locks:** prescription (not proposal), trail (not breadcrumb), causal_read_set (not provenance) (2026-05-25)
- **DB File Placement:** L1 WAL at `~/.crucible/crucible.db`, forked from Cairn (2026-05-27)
- **Cairn/Forge Coexistence:** Full coexist forever — independent live products, shared `@akubly/types` only (2026-05-27)
- **Eureka Status:** External library via optional adapter, not a Crucible chamber (2026-05-27)

---

## Appendix B: Section File Layout Decision

**Decision: Folder with per-section files.**

Layout: `docs/crucible-technical-design/` with one numbered file per section plus an index.

```
docs/crucible-technical-design/
├── README.md                           # Index — TOC with links, status badges per section
├── 01-architectural-overview.md
├── 02-l0-l1-boundary-contract.md
├── 03-l1-wal-substrate.md
├── 04-hook-bus.md
├── 05-router-design.md
├── 06-primitive-taxonomy.md
├── 07-generators-l3.md
├── 08-applier-decision-gate.md
├── 09-aperture.md
├── 10-session-branching.md
├── 11-hermetic-replay.md
├── 12-copilot-sdk-integration.md
├── 13-crucible-cli-shell.md
├── 14-eureka-integration-surface.md
├── 15-coexistence-shared-types.md
├── 16-test-strategy-invariants.md
├── 17-observability-telemetry.md
├── 18-security-permissions.md
└── 19-adr-set.md
```

**Rationale:** (i) Parallel authoring — different agents write different files with zero merge conflicts. (ii) Review granularity — each section can be reviewed independently. (iii) Cross-referencing — sections link to each other by relative path. (iv) This plan (`docs/crucible-technical-design-plan.md`) remains the meta-document; the folder holds the actual CTD.

---

## Appendix C: Fan-Out Spawn Manifest

This manifest tells the coordinator exactly what to spawn for each phase. Each section entry includes: owner agent, secondary contributors (advisory input — they are available for questions, not co-authors), output file path, input artifacts, hard dependencies, and acceptance criteria.

### Phase 0 — Foundation (serial, Graham-authored)

**Spawn:** 2 sections, both Graham. Can be authored as a single agent task or two sequential tasks.

#### §2 — L0/L1 Boundary Contract

| Field | Value |
|-------|-------|
| **Owner** | Graham |
| **Secondary** | Alexander (SDK-side review), Roger (WAL-side review) |
| **Output** | `docs/crucible-technical-design/02-l0-l1-boundary-contract.md` |
| **Input artifacts** | `.squad/decisions.md` (Phase B #1 L0 boundary, Open #1 graham-opens-1-and-3); `docs/crucible-technical-design-plan.md` §2 spec |
| **Hard dependencies** | None (first section authored) |
| **Acceptance criteria** | ✅ TypeScript interface signatures for `BootstrapPayload`, `CrucibleEvent`, `OutboundPrompt`, control enum. ✅ Explicit NOT-cross list (SDK types, promises, iterators). ✅ Dependency-cruiser rule specification (`no-sdk-outside-l0`, `no-sdk-in-crucible`). ✅ ≤3 pages. ✅ No locked decisions re-litigated. |

#### §6 — Primitive Taxonomy (5 Primitives)

| Field | Value |
|-------|-------|
| **Owner** | Graham |
| **Secondary** | Valanice (user-facing semantics of Question/Decision) |
| **Output** | `docs/crucible-technical-design/06-primitive-taxonomy.md` |
| **Input artifacts** | `.squad/decisions.md` (vocabulary locks, 5 primitives, §2.8 sub-task model TaskStart/TaskEnd); `docs/crucible-technical-design-plan.md` §6 spec |
| **Hard dependencies** | None (can be authored parallel with §2 if desired) |
| **Acceptance criteria** | ✅ TypeScript type definitions for Request, Artifact, Observation, Decision, Question (common envelope + per-kind payload). ✅ Sub-type enumeration (TaskStart, TaskEnd, etc.). ✅ Parent/child link representation. ✅ Schema-versioning strategy. ✅ ≤1 page. |

**Phase 0 Synthesis:** Graham self-reviews for internal consistency between §2 and §6 (do the primitives flow cleanly through the L0/L1 boundary types?). Roger + Alexander quick-review before Phase 1 fan-out (Gate 1, same day).

---

### Phase 1 — Core Stack (parallel fan-out, 5 lanes)

**Spawn:** 7 sections across 6 agents. 5 independent parallel lanes; 2 lanes have internal serial pairs (Roger §3→§4, Alexander §12→§8).

**Hard dependency for all Phase 1 sections:** Phase 0 outputs (§2 + §6 must be reviewed and approved).

#### Lane 1: §3 → §4 (Roger)

**§3 — L1 WAL Substrate**

| Field | Value |
|-------|-------|
| **Owner** | Roger |
| **Secondary** | Laura (A1-A4 conformance integration points), Gabriel (CI harness for WAL invariants) |
| **Output** | `docs/crucible-technical-design/03-l1-wal-substrate.md` |
| **Input artifacts** | `.squad/decisions.md` (A.3 hybrid lock, v1 commitment #10, Open #5 CBOR+BLAKE3, Roger Hook Bus Signoff WAL schema extension); Phase 0 outputs (§2 boundary contract, §6 primitive types); `docs/crucible-technical-design-plan.md` §3 spec |
| **Hard dependencies** | Phase 0 (§2 L0/L1 boundary — defines what L1 receives from L0) |
| **Acceptance criteria** | ✅ WAL row schema (8+2 fields) as TypeScript types. ✅ On-disk binary layout specification. ✅ Append + group-commit + seal-and-split pseudocode. ✅ Performance envelope (≤1ms p99 append, 80µs predicate budget). ✅ Storage volume projections for `~/.crucible/crucible.db`. ✅ L1Subscriber contract (`onCommit(offset, rows[])`). ✅ Content addressing per row (CBOR + BLAKE3). ✅ Hash chain linking. ✅ ≤10 pages. |

**§4 — Hook Bus**

| Field | Value |
|-------|-------|
| **Owner** | Roger |
| **Secondary** | Gabriel (Router-side pause receipt contract), Laura (P1-P5 property/fuzz assertions) |
| **Output** | `docs/crucible-technical-design/04-hook-bus.md` |
| **Input artifacts** | `.squad/decisions.md` (Roger Hook Bus Signoff, Gabriel Hook Bus Router Verdict, Phase A locks); §3 output (WAL schema — bus fires inside group-commit); `docs/crucible-technical-design-plan.md` §4 spec |
| **Hard dependencies** | §3 (bus fires inside group-commit window; needs WAL row schema for verdict fields) |
| **Acceptance criteria** | ✅ Verdict enum semantics (continue/observe/pause). ✅ Predicate registration + kind-indexed dispatch interface. ✅ Bus dispatch pseudocode with 80µs budget breakdown. ✅ Seal-and-split protocol. ✅ Backpressure policy (per-verdict-type subscription, bounded queues). ✅ WAL fields `hook_verdict` + `hook_verdict_witness` cross-referenced to §3. ✅ Replay recording spec for non-continue verdicts. ✅ ≤3 pages. |

#### Lane 2: §7 (Rosella)

**§7 — Generators (L3)**

| Field | Value |
|-------|-------|
| **Owner** | Rosella |
| **Secondary** | Graham (contract shape authority), Laura (fitnessContract + causalReadSet fields) |
| **Output** | `docs/crucible-technical-design/07-generators-l3.md` |
| **Input artifacts** | `.squad/decisions.md` (Phase A 8-field schema lock, Rosella dual-interface proposal, Round 2.3 trust-tier vocabulary, Round 2.2 marketplace governance); Phase 0 outputs (§6 primitive types — generators emit proposals referencing primitives); `docs/crucible-technical-design-plan.md` §7 spec |
| **Hard dependencies** | Phase 0 (§6 primitive types, §2 boundary — generators must know what types flow through L1) |
| **Acceptance criteria** | ✅ `ProposalGenerator` TypeScript interface (all fields). ✅ `DataProposalGenerator` vs `StructuralProposalGenerator` split. ✅ Forge-as-generator worked example. ✅ Curator-as-generator charter (detection + proposal, never approval). ✅ Optional Eureka-aware generator sketch. ✅ Plugin lifecycle contract (discovery, registration, trust-tier stamping). ✅ `ReadSetBuilder` helper interface. ✅ Trust-tier attribution table. ✅ ≤3 pages. |

#### Lane 3: §12 → §8 (Alexander)

**§12 — Copilot SDK Integration**

| Field | Value |
|-------|-------|
| **Owner** | Alexander |
| **Secondary** | Graham (T5 architecture framing) |
| **Output** | `docs/crucible-technical-design/12-copilot-sdk-integration.md` |
| **Input artifacts** | `.squad/decisions.md` (T5 Resolution, Phase B #1, Open #1 l0-provider/); Phase 0 outputs (§2 L0/L1 boundary — SDK provider implements L0 side); `docs/crucible-technical-design-plan.md` §12 spec |
| **Hard dependencies** | Phase 0 (§2 L0/L1 boundary — SdkProvider must conform to L0 contract) |
| **Acceptance criteria** | ✅ Session bootstrap sequence diagram. ✅ `SdkProvider` interface signatures. ✅ Provider registration protocol. ✅ `@akubly/crucible-runtime` vs `@akubly/skillsmith-runtime` independence. ✅ Worked example: Crucible session with Copilot SDK provider. ✅ Multiple-provider support sketch. ✅ ≤3 pages. |

**§8 — Applier + DecisionGate**

| Field | Value |
|-------|-------|
| **Owner** | Alexander |
| **Secondary** | Gabriel (Router handoff contract), Graham (transactional guarantee review) |
| **Output** | `docs/crucible-technical-design/08-applier-decision-gate.md` |
| **Input artifacts** | §12 output (runtime composition — Applier lives in runtime); `.squad/decisions.md` (Phase B, transactional contract); `docs/crucible-technical-design-plan.md` §8 spec |
| **Hard dependencies** | §12 (Applier is part of the runtime; needs composition root shape) |
| **Acceptance criteria** | ✅ Apply protocol interface. ✅ State machine (proposed → approved → applying → applied | failed). ✅ Ledger-position fence pseudocode. ✅ DecisionGate UX specification. ✅ Rollback/revert semantics. ✅ Integration point with Aperture notifications. ✅ ≤3 pages. |

#### Lane 4: §11 (Laura)

**§11 — Hermetic Replay**

| Field | Value |
|-------|-------|
| **Owner** | Laura |
| **Secondary** | Alexander (LLM-boundary capture implementation), Roger (CAS store integration) |
| **Output** | `docs/crucible-technical-design/11-hermetic-replay.md` |
| **Input artifacts** | `.squad/decisions.md` (v1 commitment #2, #4; Aaron Insight #3; US-G-NEW-2; Open #5 CBOR+BLAKE3); Phase 0 outputs (§6 primitives — Observation primitive carries captured content); `docs/crucible-technical-design-plan.md` §11 spec |
| **Hard dependencies** | Phase 0 (§6 Observation primitive definition) |
| **Acceptance criteria** | ✅ Capture scope (LLM calls, MCP tool calls, web, filesystem). ✅ CAS store interface (content-addressed, volume projections). ✅ Replay protocol (request-hash matching, re-feed semantics). ✅ A1-A4 conformance assertion specifications with test pseudocode. ✅ Non-determinism doctrine (explicit acknowledgment section). ✅ ≤3 pages. |

#### Lane 5: §5 (Gabriel)

**§5 — Router Design (L4)**

| Field | Value |
|-------|-------|
| **Owner** | Gabriel |
| **Secondary** | Graham (policy architecture), Rosella (generator-side proposal submission) |
| **Output** | `docs/crucible-technical-design/05-router-design.md` |
| **Input artifacts** | `.squad/decisions.md` (Gabriel Hook Bus Router Verdict §6, Tension #2 resolution, L4 verdict extensibility prerequisite, Curator authority model); Phase 0 outputs (§6 primitives — Router routes by primitive kind, §2 boundary); `docs/crucible-technical-design-plan.md` §5 spec |
| **Hard dependencies** | Phase 0 (§6 primitive types — Router policy table indexes by primitive kind) |
| **Acceptance criteria** | ✅ Policy table schema. ✅ Proposal lifecycle state machine. ✅ Verdict ack protocol (50ms budget). ✅ `RouterDecision` event shape. ✅ Replayability from verdict stream + policy versions. ✅ Debugger verdict extension point. ✅ ≤3 pages. |

#### Lane 6: §1 (Graham, parallel synthesis)

**§1 — Architectural Overview**

| Field | Value |
|-------|-------|
| **Owner** | Graham |
| **Secondary** | — |
| **Output** | `docs/crucible-technical-design/01-architectural-overview.md` |
| **Input artifacts** | All Phase 0 outputs; `.squad/decisions.md` (full document — synthesizes all locked decisions); all Phase 1 section drafts (consumes as they land); `docs/crucible-technical-design-plan.md` §1 spec |
| **Hard dependencies** | Phase 0 (§2, §6). Soft dependency on Phase 1 drafts (can start structure early, refine as sections land). |
| **Acceptance criteria** | ✅ 5-layer stack diagram with data-flow arrows. ✅ Layer responsibility table. ✅ Chamber-to-layer mapping table. ✅ Package decomposition (`@akubly/crucible-*` namespace). ✅ Coexistence stance (Crucible greenfield, Cairn/Forge independent). ✅ ≤3 pages. |

**Phase 1 Synthesis:** Graham reviews all Phase 1 outputs for interface coherence (does §3's WAL accept §2's `CrucibleEvent`? does §5's Router consume §4's pause verdicts correctly? does §7's generator contract produce proposals that §5's Router can route?). Flag mismatches before Phase 2.

---

### Phase 2 — Dependent Sections (parallel fan-out, 6 lanes)

**Spawn:** 6 sections across 4 agents.

#### §10 — Session Model + Branching (Roger)

| Field | Value |
|-------|-------|
| **Owner** | Roger |
| **Secondary** | Alexander (session bootstrap from SDK), Graham (branching architecture) |
| **Output** | `docs/crucible-technical-design/10-session-branching.md` |
| **Input artifacts** | §3 output (WAL format — branching interacts with WAL segments); `.squad/decisions.md` (Phase B #2, Aaron Insight #1, §2.8 sub-task model); `docs/crucible-technical-design-plan.md` §10 spec |
| **Hard dependencies** | §3 (WAL format determines how branching interacts with storage) |
| **Acceptance criteria** | ✅ `sessions` table schema (`parent_session_id`, `fork_point_event_id`, stored in `~/.crucible/crucible.db`). ✅ Fork protocol pseudocode. ✅ COW snapshot mechanics. ✅ Sub-task model (`task_id` field, TaskStart/TaskEnd). ✅ Multi-path comparison sketch. ✅ ≤3 pages. |

#### §9 — Aperture (Valanice)

| Field | Value |
|-------|-------|
| **Owner** | Valanice |
| **Secondary** | — |
| **Output** | `docs/crucible-technical-design/09-aperture.md` |
| **Input artifacts** | §5 output (Router — Aperture receives RouterDecision events); §4 output (Hook Bus — Aperture subscribes to observe verdicts); `.squad/decisions.md` (Round 2.1 Aperture rename, Open #3, Sonny L5 proposal, ApertureEvent schema); `docs/crucible-technical-design-plan.md` §9 spec |
| **Hard dependencies** | §5 (Router event shape), §4 (Hook Bus subscriber model) |
| **Acceptance criteria** | ✅ `ApertureEvent` schema. ✅ `aperture_events` projection table. ✅ Notification policy (4 levels). ✅ CLI verbs (`crucible aperture watch/show`). ✅ Investigation tool interfaces (bisect, causal-slice, delta-debug). ✅ Breakpoint/watchpoint/logpoint registry sketch. ✅ ≤3 pages. |
| **Consultant** | Sonny (advisory review after draft) |

#### §13 — Crucible CLI Shell (Valanice)

| Field | Value |
|-------|-------|
| **Owner** | Valanice |
| **Secondary** | Alexander (runtime integration) |
| **Output** | `docs/crucible-technical-design/13-crucible-cli-shell.md` |
| **Input artifacts** | §8 output (Applier — CLI interaction model); §12 output (SDK — runtime composition); `.squad/decisions.md` (T5 resolution, UX metaphor discipline, Round 2.1 CLI verbs); `docs/crucible-technical-design-plan.md` §13 spec |
| **Hard dependencies** | §8 (DecisionGate UX — CLI must surface approval prompts), §12 (runtime — CLI is thin shell around it) |
| **Acceptance criteria** | ✅ Command vocabulary table (verb, args, description). ✅ REPL interaction model (thick turns, progressive disclosure). ✅ Composition with `@akubly/crucible-runtime`. ✅ Saved queries / `@lobby`. ✅ UX principles. ✅ ≤3 pages. |
| **Consultant** | Sonny (advisory review after draft) |

#### §15 — Coexistence & Shared Types (Roger)

| Field | Value |
|-------|-------|
| **Owner** | Roger |
| **Secondary** | Alexander (Crucible runtime package), Rosella (plugin discovery) |
| **Output** | `docs/crucible-technical-design/15-coexistence-shared-types.md` |
| **Input artifacts** | §3 output (WAL format — defines Crucible's storage contract); §7 output (Generators — defines Crucible's L3 vs Forge's prescribers); `.squad/decisions.md` (Cross-PRD Coordination, @akubly/types governance); Aaron's coexistence lock verbatim; `docs/crucible-technical-design-plan.md` §15 spec |
| **Hard dependencies** | §3 (Crucible storage shape), §7 (generator contract — needed to articulate the overlap boundary with Forge) |
| **Acceptance criteria** | ✅ Two-product coexistence boundary table (shared vs private). ✅ `@akubly/types` evolution plan (new Crucible types, shared types, versioning protocol). ✅ Monorepo layout diagram (Crucible packages alongside Cairn/Forge, zero cross-dependencies). ✅ Accepted tax enumeration (overlapping concepts). ✅ `skillsmith-runtime` stays as-is. ✅ ≤3 pages. |

#### §14 — Eureka Integration Surface (Graham)

| Field | Value |
|-------|-------|
| **Owner** | Graham |
| **Secondary** | Rosella (generator contract alignment) |
| **Output** | `docs/crucible-technical-design/14-eureka-integration-surface.md` |
| **Input artifacts** | §7 output (Generators — Eureka adapter is an L3 generator); `.squad/decisions.md` (Eureka PRD Overlap Analysis, Cassima reply, Eureka status lock); `.squad/decisions/inbox/graham-eureka-crucible-overlap.md`; `docs/crucible-technical-design-plan.md` §14 spec |
| **Hard dependencies** | §7 (ProposalGenerator contract — adapter must conform to it) |
| **Acceptance criteria** | ✅ Contract table (shared: SessionId, DecisionRecord; private: everything else). ✅ Optional Eureka-aware generator adapter sketch. ✅ Explicit boundary: Eureka ↔ Cairn bridges are Eureka's concern. ✅ ≤1 page. |

#### §16 — Test Strategy + Invariants (Laura)

| Field | Value |
|-------|-------|
| **Owner** | Laura |
| **Secondary** | Gabriel (CI integration, conformance harness runner) |
| **Output** | `docs/crucible-technical-design/16-test-strategy-invariants.md` |
| **Input artifacts** | §3 output (WAL invariants), §4 output (Hook Bus P1-P5), §11 output (A1-A4 conformance); `.squad/decisions.md` (v1 commitments, property/fuzz regime); `docs/crucible-technical-design-plan.md` §16 spec |
| **Hard dependencies** | §3 (WAL invariant surface), §4 (hook bus properties), §11 (replay conformance assertions) |
| **Acceptance criteria** | ✅ Test category table (category → scope → runner → CI stage). ✅ Invariant specifications (testable propositions). ✅ Fixture strategy (Crucible uses `~/.crucible/` test fixtures, not Cairn's). ✅ "One-week productivity loop" bar test specification. ✅ Test pyramid. ✅ ≤3 pages. |

**Phase 2 Synthesis:** Graham reviews all Phase 2 outputs. Specific checks: (a) §10 branching uses §3's WAL segment model correctly; (b) §9 Aperture subscribes to §4's bus per the subscriber contract; (c) §13 CLI verbs cover all §8 DecisionGate interaction surfaces; (d) §15 coexistence boundary is consistent with §7's generator contract (no Crucible→Cairn dependency); (e) §16 test invariants cover all §3/§4/§11 invariant surfaces.

**Consultant pull-in (Gate 3):** After §9 and §13 are drafted, pull Sonny for advisory review. After §1 is drafted, pull Erasmus for advisory review.

---

### Phase 3 — Cross-Cutting (3 sections, 2 agents)

**Spawn:** 3 sections (Gabriel: §17, §18; Graham: §19). Can be parallel.

#### §17 — Observability / Telemetry (Gabriel)

| Field | Value |
|-------|-------|
| **Owner** | Gabriel |
| **Secondary** | Roger (per-call telemetry fields) |
| **Output** | `docs/crucible-technical-design/17-observability-telemetry.md` |
| **Input artifacts** | All prior section outputs (event catalog spans all layers); `.squad/decisions.md` (per-call telemetry substrate); `docs/crucible-technical-design-plan.md` §17 spec |
| **Hard dependencies** | All Phase 1 + Phase 2 sections (observability spans all layers) |
| **Acceptance criteria** | ✅ Event catalog table (event → layer → severity → fields). ✅ Trace correlation strategy. ✅ Aperture-as-observability-surface (no external infra in v1). ✅ ≤1 page. |

#### §18 — Security & Permissions (Gabriel)

| Field | Value |
|-------|-------|
| **Owner** | Gabriel |
| **Secondary** | Graham (policy architecture) |
| **Output** | `docs/crucible-technical-design/18-security-permissions.md` |
| **Input artifacts** | §4 output (Hook Bus safety floor), §5 output (Router policy enforcement), §7 output (trust-tier attribution); `.squad/decisions.md` (Tension #6, marketplace governance); `docs/crucible-technical-design-plan.md` §18 spec |
| **Hard dependencies** | §4, §5, §7 (security model depends on hook bus + Router + trust tiers) |
| **Acceptance criteria** | ✅ Threat model summary (single-user, self-audit). ✅ Policy defaults table. ✅ Plugin sandboxing sketch. ✅ Tension #6 deferral. ✅ ≤1 page. |

#### §19 — ADR Set (Graham)

| Field | Value |
|-------|-------|
| **Owner** | Graham |
| **Secondary** | All section owners |
| **Output** | `docs/crucible-technical-design/19-adr-set.md` |
| **Input artifacts** | All section outputs; `.squad/decisions.md` (full document); `docs/crucible-technical-design-plan.md` §19 spec |
| **Hard dependencies** | All prior sections (ADR set synthesizes the full CTD) |
| **Acceptance criteria** | ✅ ADR index table (number → title → status → author) covering ADR-0002 through ADR-0010. ✅ Each ADR has a one-line decision statement. ✅ No ADR content — just the index for post-CTD authoring. ✅ ≤1 page. |

**Phase 3 Synthesis:** Graham performs full cross-section synthesis (Gate 4). Checks vocabulary consistency, interface compatibility, dependency-graph correctness. Files errata back to section owners if needed. Assembles `docs/crucible-technical-design/README.md` (index with status badges).

---

### Review Round (after Phase 3)

| Reviewer | Sections Reviewed | Type |
|----------|------------------|------|
| Graham | §3, §4, §5, §7, §8, §9, §10, §11, §13, §15, §16 | Primary reviewer (per Ownership Map) |
| Roger | §6, §12, §18 | Primary reviewer |
| Alexander | §5, §14, §17 | Primary reviewer |
| Laura | §2, §10 | Primary reviewer |
| Gabriel | §7 | Primary reviewer |
| Valanice | §8 | Primary reviewer |
| Erasmus | §1 | Consultant (advisory) |
| Sonny | §9, §13 | Consultant (advisory) |
| Aaron | §19 (ADR Set), full CTD | Final approval (Gate 5) |

**Lockout rule enforced:** If any reviewer rejects, a DIFFERENT agent revises. Original author cannot self-fix without third-party re-review.

---

### Spawn Summary

| Phase | Sections | Parallel Lanes | Agents Active | Estimated Duration |
|-------|----------|---------------|---------------|-------------------|
| 0 | §2, §6 | 1 (serial, Graham) | 1 | 1 day |
| 1 | §1, §3, §4, §5, §7, §8, §11, §12 | 5 (Roger, Rosella, Alexander, Laura, Gabriel + Graham) | 7 | 3 days |
| 2 | §9, §10, §13, §14, §15, §16 | 6 (Roger, Valanice, Graham, Laura) | 4 + consultants | 2 days |
| 3 | §17, §18, §19 | 2 (Gabriel, Graham) | 2 | 1 day |
| Review | All 19 | Per ownership map | All + consultants | 2 days |
| **Total** | **19 sections** | — | **9 agents** | **~9 days** |
