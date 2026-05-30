# Crucible Technical Design Plan

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-28 (rev. 3 — R2 lock bake-in)
**Version:** 3.0
**Status:** READY FOR FAN-OUT — All R2 locks resolved 2026-05-28

> **Revision note (rev. 3):** Tight bake-in pass over rev. 2. All six R2 open
> questions resolved by Aaron (interactive Decision-Point gate via coordinator,
> 2026-05-28). The former "New Open Questions" section is now "Resolved R2
> Decisions" — a lock record. Section detail text throughout §2, §3, §5, §7,
> §8, §9, §10, §11, §13, §15, §16, §17 is now declarative (no more "if Aaron
> accepts the defaults"). Two coordinator-added expansions baked in:
> `commitmentMethod: 'declared' | 'fallback'` on Decision rows (§2, §3, §11)
> and `nonDominatedReason: 'optimal' | 'incomparable'` on `PrescriptionResult`
> (§7/§8, §9 UI badge). No section ownership, count, or wave-structure changes.
> No prior locks re-litigated.

---

## ✅ Resolved R2 Decisions (locked 2026-05-28)

All six open questions surfaced by the TDD-strategy reconciliation pass were
resolved interactively by Aaron. Two coordinator-added expansions (R2-1 tag,
R2-5 data-model field) were also accepted. Authoritative source:
`.squad/decisions/inbox/coordinator-ctd-r2-resolutions.md`.

| OQ | Topic | Resolution |
|----|-------|------------|
| R2-1 | Context-window bound on Decision Merkle commitment | **B-with-A-fallback** — L0 declares `causalContextWindow` per Decision; L1 falls back to the full ledger prefix if not declared. Decision row carries `commitmentMethod: 'declared' \| 'fallback'` tag for traceability. |
| R2-2 | BootstrapPayload schema scope | **Literal payload + named-source manifest** — `literalContext` (system prompt, tool defs, injected memory fragments) plus `memoryManifest` (named queryable sources). |
| R2-3 | Structural-proposal queue persistence | **Pure projection over L1** — queue is recomputed from L1 structural-proposal-state events on every Aperture boot. No write-stateful queue storage. |
| R2-4 | Bisect output env-snapshot stamping | **Per-row stamp** — every bisect result row includes the env-snapshot hash (16-char abbreviation acceptable). |
| R2-5 | Pareto incomparable UI surface | **Both UI and data model** — `[incomparable-axes]` badge in leaderboard + `nonDominatedReason: 'optimal' \| 'incomparable'` on `PrescriptionResult` (optionally `incomparableWith: string[]`). |
| R2-6 | Transitive dep resolution timing | **Install / fork-snapshot / session-start-load** — Plugin Registry resolves at install (lockfile), fork copies lockfile into `SessionMetadata.pluginVersions` verbatim, session start loads exactly those pinned versions (pure load, no resolution). |

**Cross-section coordination (NOT decisions — sync pairs during Phase 2 authoring):**
- **Gabriel ↔ Valanice** — Aperture `StructuralApprovalQueue` ↔ Router pause/resume handshake (Q3 mechanics).
- **Rosella ↔ Roger** — Plugin Registry install-time lockfile algorithm ↔ `SessionMetadata.pluginVersions` snapshot field shape (R2-6).

---

## ✅ Resolved Decisions (Formerly Blocking — All Locked 2026-05-27)

1. **Database file placement: FORK.** L1 WAL lives at `~/.crucible/crucible.db`. Clean separation from Cairn's `~/.cairn/knowledge.db`. No shared DB, no cross-DB foreign keys.

2. **Cairn/Forge strategy: FULL COEXIST FOREVER.** Aaron's rationale verbatim: *"Cairn and Forge were their own value-adds that we can still bring to CLI consumers that don't need or want the heavy hammer of Crucible."* Cairn and Forge remain **independent live products** with their own roadmaps, shipping as Copilot CLI plugins for the lightweight-harness audience. Crucible is greenfield alongside, on its own substrate. **No delegation, no shim packages, no harness-in-harness.** T5-consistent: T5 governs Aaron's daily-driver shell, not the broader product portfolio. Accepted tax: two implementations of overlapping concepts (Cairn `event_log` vs Crucible L1 WAL; Forge prescribers vs L3 Generators). Bounded because the audiences differ.

3. **Eureka status: EXTERNAL LIBRARY VIA OPTIONAL ADAPTER.** Graham's overlap-analysis recommendation stands. Eureka is not a Crucible chamber. Integration via optional Eureka-aware L3 generator that calls Eureka's public surface and emits standard ProposalGenerator proposals.

4. **TDD-strategy Q1-Q8 (locked 2026-05-27 — Laura's strategy is FINAL).** These were authored blind to this plan and merged after the fact; the CTD now honors them as design constraints, not as questions:
   - **Q1.** Observation is a first-class L1 primitive type (one of 5). Decision primitives carry a Merkle hash over the **causal-context window** (all prior visible ledger rows, any type). Primitive scale = per-tool-call boundary. M3 side-effect-only tool calls emit Artifact with synthetic output. **NEW INVARIANT — Bootstrap-Capture-Completeness:** extra-ledger context (system prompts, tool definitions, cross-session memory) MUST be captured as Observation primitives at session offset 0.
   - **Q2.** Generic L3 adapter conformance suite in v1. Eureka adapter deferred to v1.5. Forge-as-L3 must conform to the generic contract.
   - **Q3.** Structural proposals route through Aperture as async notification + queue, **default-not-applied-until-acked**. Router pauses dependent paths until ack.
   - **Q4.** Transitive plugin dependency graph pinned at fork (recorded in `SessionMetadata.pluginVersions`).
   - **Q5.** Bisect snapshots env at start, shells out with fixed snapshot env per iteration — internally consistent, not externally hermetic.
   - **Q6.** Conformance suite excludes timestamps from byte-equality. **NEW INVARIANT — Monotonic-Timestamps-Within-Session:** every row's timestamp ≥ previous row's, enforced by a separate property test.
   - **Q7.** Zero-tolerance mock-drift gate in CI (agentic-cost framing — drift cost compounds, fix cost is near-zero).
   - **Q8.** Pareto incomparable prescriptions both remain non-dominated (no zero-fill, no partial dominance).

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
- **NEW (TDD-Q1 + R2-2 LOCK):** `BootstrapPayload` carries the extra-ledger context the L1 materializes as offset-0 Observation primitives. Schema is `literalContext` (`systemPrompt: string`, `toolDefinitions: ToolDefinition[]`, `injectedMemoryFragments: Array<{ sourceManifestId, content }>`) plus `memoryManifest: Array<{ id, kind, versionHash, accessSurface }>` (named queryable sources NOT injected at bootstrap). Boundary rule: capture what L0 literally hands across; later tool-call memory queries are normal Observation primitives at query time.
- **NEW (R2-1 LOCK):** `BootstrapPayload` and the per-Decision emission contract include an OPTIONAL `causalContextWindow: EventId[]` slice that L0 may declare. When declared, L1 hashes only those rows; when absent, L1 falls back to the full ledger prefix. L0 providers without attention metadata (today: Copilot SDK first cut) MAY omit the field — fallback is graceful.
- **NEW (TDD-Q1):** How does the L0 provider signal per-tool-call boundaries so the L1 enforces "one primitive per tool-call" granularity? How are side-effect-only tool calls (M3) tagged so L1 knows to materialize a synthetic-output Artifact?
- **NEW (Laura §3.1):** Map this section's interfaces to Laura's `SessionBootstrapper` and `LedgerWindowReader` collaborator contracts. Both names must appear (or a documented alias) so London-school component tests can mock against the same names her test surface expects.

**Depth guidance:** TypeScript interface signatures (pseudocode-level, not final impl). Dependency-cruiser rule specification. Migration checklist for the 5 production files that move to `l0-provider/`. **NEW:** `BootstrapPayload` schema must list every extra-ledger context source it carries plus a manifest-of-named-sources field. **NEW:** explicit interface alias table (Graham name ↔ Laura collaborator name).

**Owner:** Graham
**Secondary:** Alexander (SDK-side contract), Roger (WAL-side contract)

**References:** `decisions.md` — Phase B #1, `graham-opens-1-and-3`, TDD strategy Q1, §3.1 (SessionBootstrapper, LedgerWindowReader)

**Laura A-scenarios this section enables:** A2 (hermetic replay — bootstrap capture), A6 (plugin pinning at fork — SessionMetadata flow).
**Laura invariants this section enforces:** Bootstrap-Capture-Completeness (§6.8).

---

#### §3 — L1 WAL Substrate (10 pp)

**Purpose:** Full specification of the custom pure-TS append-only WAL — the load-bearing storage primitive. This is the deepest section because every upper layer depends on it. **Storage location locked:** `~/.crucible/crucible.db` (clean fork from Cairn's `~/.cairn/knowledge.db`; no shared DB, no cross-DB foreign keys).

**Key questions answered:**
- WAL row schema — must now accommodate the 5 primitive kinds with **Observation as a first-class row type** (not envelope metadata on Decision rows). Per-row fields include primitiveKind, primitivePayload, causalReadSet, hookVerdict, hookVerdictWitness, commitOffset, timestamp, hashChain, plus the NEW `contextWindowCommitment` field on Decision rows (32-byte BLAKE3 over CBOR-canonicalized causal-context window per Q1) and the NEW `commitmentMethod: 'declared' | 'fallback'` tag (R2-1) indicating which window-resolution path the hybrid took.
- Storage layout on disk — `~/.crucible/crucible.db` file format, segment rotation, fsync strategy?
- Group-commit protocol (batch boundaries, seal-and-split for pause verdicts)?
- Content addressing per row (CBOR + BLAKE3)?
- Hash chain linking (append-only, self-audit)?
- Commit offset exposure for L1Subscriber interface?
- L1Subscriber contract (`onCommit(offset, rows[])`)?
- **NEW (TDD-Q1 + R2-1 LOCK):** The causal-context window for Decision commitment is materialized by the `ContextWindowResolver` seam using the **B-with-A-fallback** rule: if the Decision emission carries an explicit `causalContextWindow` slice from L0, hash exactly those rows; otherwise hash the full ledger prefix up to (excluding) the Decision row's offset. Every Decision row carries a `commitmentMethod: 'declared' | 'fallback'` tag so investigation can trace which path was taken. Edge case: a declared window referencing rows OUTSIDE the ledger prefix is a Bootstrap-Capture-Completeness violation (caught by §6.8 invariant, not silently absorbed by the commitment hash). Cross-reference Laura's `ReadSetHasher` collaborator (CBOR + BLAKE3, 32-byte hash, deterministic).
- **NEW (TDD-Q1):** Per-tool-call primitive scale enforcement — how does the WAL reject malformed batches that pack multiple tool calls into one row?
- **NEW (TDD-Q1 / Bootstrap-Capture-Completeness):** Offset-0 bootstrap semantics. The WAL must accept a batch of Observation primitives at session offset 0 atomically (single group-commit) so subsequent replays start from a complete bootstrap snapshot. Replay loaders must refuse to advance past offset 0 if the bootstrap manifest declared by the L0 provider does not match the offset-0 row set (Laura §6.8 failure-mode).
- **NEW (TDD-Q6 / Monotonic-Timestamps invariant):** Spec the timestamp assignment rule (monotonically non-decreasing per session; tie-break by commitOffset) and the runtime validator that surfaces violations as Aperture attention-tier events. Forked sessions inherit a non-decreasing constraint relative to their fork-point parent timestamp.
- **NEW (Laura §3.2 mappings):** Name the WAL append surface `AppendProtocol` (or document the alias). Name the pre-commit hook surface `PreCommitHookBus`. Name the prefix reader `LedgerWindowReader`. These are the test-surface seams Laura's component tier mocks against.
- **NEW (Laura §3.1):** Define `ContextWindowHasher` / `ReadSetHasher` as a real, contract-tested service (not a free function); component tests use a deterministic stub, contract tests run the real implementation against golden CBOR vectors.

**Depth guidance:** Schema definitions (TypeScript types + on-disk binary layout). Pseudocode for critical paths (append, group-commit, seal-and-split, bootstrap-batch, decision-commit-with-context-window). Performance envelope (≤1ms p99 append, 80µs predicate budget). Storage volume projections. **NEW:** explicit subsection on "Observation as primitive" (storage cost, query patterns, Aperture projection implications). **NEW:** explicit subsection on "Bootstrap offset-0 semantics." **NEW:** seam map showing which internals are unit-testable, which are component-testable behind `AppendProtocol`/`PreCommitHookBus`/`LedgerWindowReader`, and which require the file-backed integration tier (Laura §5.2).

**Owner:** Roger
**Secondary:** Laura (conformance assertions A1-A4 + new bootstrap/monotonic invariants), Gabriel (CI harness for WAL invariants + zero-tolerance mock-drift gate)

**References:** `decisions.md` — A.3 hybrid lock, v1 commitment #10, Open #5 (CBOR+BLAKE3), TDD-Q1 (context-window commitment, primitive scale, M3, Bootstrap-Capture), TDD-Q6 (monotonic timestamps), Laura §3.2 (`AppendProtocol`, `PreCommitHookBus`, `ReadSetHasher`)

**Laura A-scenarios this section enables:** A1 (fork lineage at WAL level), A2 (hermetic replay byte-equality), A3 (hook bus pre-commit), A4 (causal slice reads ledger prefix), A9 (determinism conformance).
**Laura invariants this section enforces:** Append-Only (§6.1), Hash-Chain Integrity / Context-Window Commitment (§6.2), Replay Equivalence (§6.3), Bootstrap-Capture-Completeness (§6.8), Monotonic-Timestamps (§6.9).

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
- Policy table structure (`(category, confidence, source, user-pref, tier) → action`)?
- Verdict ack budget (50ms transit)?
- `RouterDecision` event shape emitted back to bus (closing the loop for replay)?
- How Router state is replayable from recorded verdict stream + policy versions alone?
- Extension point for debugger verdicts (continue, step, step-into, step-out, abort, edit-and-continue)?
- **NEW (TDD-Q3):** StructuralProposal handling — Router classifies structural vs data proposals, routes structural ones to Aperture's async approval queue with verdict `ESCALATE_USER_REVIEW`, and **pauses all dependent downstream paths until the user acks**. Spec the "dependent path" identification (causalReadSet membership? explicit dependency declaration on the proposal?) and the resumption protocol on ack/reject.
- **NEW (TDD-Q3):** Default-not-applied semantics — structural proposals never auto-apply, regardless of confidence. Policy table must encode this as a hard constraint, not a configurable threshold.
- **NEW (TDD-Q8 + R2-5 LOCK):** Fitness comparator behavior — when Router consults the Alchemist's leaderboard for tie-breaking, **all** Pareto-non-dominated prescriptions surface together (both `nonDominatedReason: 'optimal'` and `nonDominatedReason: 'incomparable'` variants per R2-5). Router MUST NOT silently pick one over the other; it returns the full non-dominated set tagged by reason, escalating to user when tiebreak is required.
- **NEW (TDD-Q7 / agentic-cost framing):** Document why Router policy changes are versioned and replay-bound — policy drift would invalidate replay equivalence (Laura §6.3). Capture the agentic-cost rationale so future contributors don't add "live policy reload" without understanding the cost.
- **NEW (Laura §3.5):** Map Router seams to `PolicyEngine` and `EscalationQueue` collaborator contracts. PolicyEngine returns `{verdict, reason}`; EscalationQueue supports priority + timeout-to-default-deny.

**Depth guidance:** Policy table schema. Interface signatures. State machine for proposal lifecycle including the **paused-dependent-path** sub-state. Integration point with Aperture (Router decisions → ApertureEvent + Router enqueue → Aperture approval queue). **NEW:** explicit subsection on structural-vs-data classification and pause-dependent-paths semantics. **NEW:** Pareto-incomparable handling.

**Owner:** Gabriel
**Secondary:** Graham (policy architecture), Rosella (generator-side proposal submission contract — both Data and Structural)

**References:** `decisions.md` — Gabriel Hook Bus Router Verdict §6, Tension #2 resolution, L4 verdict extensibility prerequisite, TDD-Q3 (structural async queue), TDD-Q7 (zero-tolerance gate rationale), TDD-Q8 (Pareto incomparable), Laura §3.5

**Laura A-scenarios this section enables:** A3 (hook veto → router policy), A10 (router escalates structural to Aperture review), A12 (tier-based policy gradient).
**Laura invariants this section enforces:** Hook Verdict Consistency (§6.5), Trust-Tier Monotonicity (§6.7 — Router enforces tier policy without downgrading).

---

#### §6 — Router Taxonomy: 5 Primitives (1 pp)

**Purpose:** Define the canonical 5-primitive vocabulary that all layers speak: Request, Artifact, Observation, Decision, Question. Lock sub-types and schema shapes.

**Key questions answered:**
- What fields does each primitive carry (common envelope + per-kind payload)?
- What are the sub-types (e.g., TaskStart/TaskEnd on Request/Observation)?
- How are parent/child links represented (content-addressed references)?
- What is the schema-versioning strategy for primitives?
- **NEW (TDD-Q1):** Observation is explicitly a **first-class L1 row type**, not envelope metadata on another row. Sub-types of Observation include: `tool_output`, `llm_response`, `system_prompt` (bootstrap), `tool_definitions` (bootstrap), `cross_session_memory` (bootstrap), `context_truncation` (pruning signal), `external_input`.
- **NEW (TDD-Q1):** Artifact sub-types include `synthetic_output` (M3 — side-effect-only tool calls produce one of these so the per-tool-call invariant holds).
- **NEW (TDD-Q1 + R2-1 LOCK):** Decision payload schema includes the `contextWindowCommitment` field (32-byte BLAKE3), the OPTIONAL `causalContextWindowSlice: EventId[]` declaration, and the REQUIRED `commitmentMethod: 'declared' | 'fallback'` tag recording which resolution path L1 used.

**Depth guidance:** TypeScript type definitions for each primitive. Sub-type enumeration including the new Observation/Artifact sub-types above. One-paragraph rationale for each primitive's role. Cross-reference to L1 WAL row schema.

**Owner:** Graham
**Secondary:** Valanice (user-facing primitive semantics — Question and Decision are interaction primitives)

**Laura A-scenarios this section enables:** A2, A4, A8, A9, A10 (every scenario touches primitive shape).
**Laura invariants this section enforces:** vocabulary backbone for §6.1–§6.9 (all invariants reference primitive kinds).

---

#### §7 — Generators (L3) (3 pp)

**Purpose:** Specify the `ProposalGenerator` interface and the generator ecosystem. Forge, Curator, Alchemist, and third-party generators all implement this contract.

**Key questions answered:**
- `ProposalGenerator` interface (the 8-field schema: category, confidence, rationale, preview, fitnessContract, evidence, costEstimate, reversibility + determinismClass + causalReadSet)?
- Dual-interface split: `DataProposalGenerator` (85% case) vs `StructuralProposalGenerator` (Alchemist, skill-induction)?
- Forge-as-generator: how existing prescribers map to the ProposalGenerator contract?
- Curator-as-generator: detection + proposal authority, never approval?
- Plugin lifecycle contract (discovery, registration, trust-tier stamping)?
- `ReadSetBuilder` helper for Salsa-mediated reads?

**NEW STRUCTURE per TDD-Q2:**
- **§7.A — Generic L3 Adapter Conformance Contract (NEW, primary subsection).** Define the abstract `GenericL3AdapterContract` (Laura §3.4) that *every* L3 generator adapter must satisfy: interface compliance (discovery, invocation, aggregation), fail-open on adapter crash, hint attribution (emitted primitives tagged with adapter ID), lifecycle hooks (init/shutdown, per-skill setup/teardown), registration/discovery against the plugin registry. This contract ships as a reusable conformance test suite in v1 CI.
- **§7.B — Forge-as-L3 (worked example).** Show Forge prescribers mapped to the conformance contract; Forge must pass the suite in v1.
- **§7.C — Curator-as-L3 (charter).** Detection + proposal authority, never approval.
- **§7.D — StructuralProposalGenerator emission contract.** Spec what a structural proposal carries (proposal kind, schema-change shape, dependent-path declaration so Router can pause downstream — TDD-Q3).
- **§7.E — Pareto fitness emission (TDD-Q8 + R2-5 LOCK).** `fitnessContract` schema must allow non-overlapping axes; generators MUST NOT zero-fill missing axes (Pareto incomparable handling). The emitted `PrescriptionResult` carries `nonDominatedReason: 'optimal' | 'incomparable'` (set by the leaderboard at evaluation time, not by the generator) and optionally `incomparableWith: string[]` listing prescription IDs the comparison was incomparable against. Both surfaces (data model + UI badge in §9) honor the distinction.
- **§7.F — Eureka adapter (thinner; deferred to v1.5 per Q2).** Move detailed Eureka adapter content to a v1.5 roadmap appendix; in v1 §7 retains only a one-paragraph note that Eureka will conform to the §7.A contract when it lands.

**Depth guidance:** Interface signatures (TypeScript). Generator registration protocol. Trust-tier attribution table (`builtin`/`adopted`/`community`/`external`). One worked example: Forge prescriber adapted to ProposalGenerator. **NEW:** Generic adapter conformance test catalog (what tests Forge, marketplace plugins, and future Eureka adapter must pass). **NEW:** structural-proposal emission shape with dependent-path declaration. **NEW (Laura §3.4 alias map):** Document mapping of `PrescriberOrchestrator`, `ChangeVectorProvider`, `ParetoFitnessEvaluator` collaborator names.

**Owner:** Rosella
**Secondary:** Graham (contract shape authority), Laura (fitnessContract + causalReadSet fields + Generic Adapter Conformance suite shape)

**References:** `decisions.md` — Phase A 8-field schema lock, Rosella dual-interface proposal, Round 2.3 trust-tier vocabulary, TDD-Q2 (Generic L3 Adapter Conformance + Eureka v1.5 defer), TDD-Q3 (structural emission), TDD-Q8 (Pareto incomparable), Laura §3.4

**Laura A-scenarios this section enables:** A7 (Curator auto-trigger), A8 (Pareto fitness), A10 (structural proposal emission), A12 (trust-tier attribution).
**Laura invariants this section enforces:** Trust-Tier Monotonicity (§6.7 — generators stamp tier on emission, never downgrade). Generic L3 Adapter Conformance suite (Laura §5.3) is itself an invariant-enforcement mechanism.

---

#### §8 — Applier + DecisionGate (L4) (3 pp)

**Purpose:** Specify how approved proposals become mutations. The Applier executes approved proposals; the DecisionGate is the human-in-the-loop surface for proposals requiring explicit ACK.

**Key questions answered:**
- How does the Applier receive approved proposals from the Router?
- What is the apply protocol (transactional with ledger-position fence)?
- DecisionGate UX: how does Aaron see and approve/reject/defer proposals?
- How are applied decisions recorded as Decision primitives in L1?
- Rollback/revert semantics for applied proposals?
- **NEW (TDD-Q3):** Structural-proposal ACK pathway — when a queued structural proposal is acked through Aperture, how does the Applier resume the dependent paths the Router paused? Spec the resume-protocol handshake (Aperture ack → Router unpause → Applier executes → Decision primitive recorded with link back to the StructuralProposal id).
- **NEW (TDD-Q1):** Each applied Decision the Applier writes must include the `contextWindowCommitment` Merkle hash computed over the causal context window visible at apply time. Spec how the Applier obtains the window slice from the L1 (`LedgerWindowReader`) and the `ReadSetHasher` (Laura §3.2) used to compute the commitment.
- **NEW (TDD-Q8 + R2-5 LOCK):** When the Applier picks among Pareto-non-dominated prescriptions surfaced by the Router (per §5 + §7 revisions), it must record the tiebreak rationale on the Decision primitive's evidence field for later auditability, and must propagate the source `PrescriptionResult.nonDominatedReason` so downstream consumers (CLI, Aperture leaderboard, replay) see whether the chosen prescription was *proved* optimal or merely *unchallenged* (incomparable).

**Depth guidance:** Interface signatures. State machine (proposed → approved → applying → applied | failed), with new **paused-awaiting-structural-ack** sub-state. Integration with Aperture notifications and Aperture approval queue. Pseudocode for ledger-position fence check **and** for context-window-commitment computation at apply time.

**Owner:** Alexander
**Secondary:** Gabriel (Router handoff contract — including paused-path resume), Graham (transactional guarantee review)

**Laura A-scenarios this section enables:** A10 (structural ACK → apply path), A1 (fork-with-altered-verdict re-apply on child session).
**Laura invariants this section enforces:** Append-Only (§6.1 — Applier never UPDATEs/DELETEs), Hash-Chain Integrity (§6.2 — Applier-written Decision commitments).

---

#### §9 — Aperture (L5-adjacent) (3 pp)

**Purpose:** Specify the investigation + trust-building surface. Aperture subsumes the old Mirror/Narrator concepts. Two render modes: Notifications (push) and Dashboard (pull). Investigation tools: bisect, causal slice, time-travel. **NEW per TDD-Q3:** Aperture is also the locked approval surface for **StructuralProposal** queue (async notification + queue, default-not-applied-until-acked).

**Key questions answered:**
- `ApertureEvent` schema (id, ts, sessionId, producerLayer, category, level, title, bodyMarkdown, refs, state, payload, schemaVersion)?
- `aperture_events` projection table in L2 SQLite?
- Notification policy (urgent → inline, attention → badge, notice → badge, info → dashboard-only)?
- CLI verbs: `crucible aperture watch` (tail), `crucible aperture show` (dashboard)?
- Investigation tools interface (bisect, causal-slice, delta-debug)?
- Breakpoint / watchpoint / logpoint registries?
- DAP sidecar integration surface?
- **NEW (TDD-Q3 + R2-3 LOCK):** **StructuralApprovalQueue mechanics.** The queue is a **pure projection over L1** — recomputed on every Aperture boot by scanning L1 for structural-proposal-state events (emitted, acked, rejected, expired) and presenting all with `latest_state = pending`. No separate persistent queue state; no re-emission ceremony on restart. Queue entry shape: `(proposalId, kind, dependentPaths[], submittedAt, state ∈ {pending, acked, rejected, expired})`. User-action verbs: `crucible aperture approve <proposalId>`, `... reject`, `... defer`. Router handshake on ack/reject: re-emit RouterDecision; Applier resumes paused paths.
- **NEW (TDD-Q3):** Notification level for structural proposals is `attention` (badge + dashboard entry), NEVER `urgent` (no blocking modal — that contradicts the agentic premise).
- **NEW (TDD-Q5 + R2-4 LOCK):** Bisect output rendering — every bisect result row stamped with the env-snapshot hash (16-char abbreviation acceptable) so reports remain readable days later when sliced/grep'd/copied in isolation.
- **NEW (TDD-Q8 + R2-5 LOCK):** Leaderboard rendering — all Pareto-non-dominated prescriptions surface; those with `nonDominatedReason === 'incomparable'` carry an `[incomparable-axes]` badge distinguishing "unchallenged on a different axis set" from "proved optimal on shared axes."
- **NEW (Laura §3.3):** Map the projection seam to `LedgerProjector` (pure function (ledgerPrefix, pluginVersions) → ProjectionState) and `QueryExecutor` collaborator names.

**Depth guidance:** Schema definitions. CLI verb table (now including `aperture approve/reject/defer`). UX wireframes (text-mode) for notification badges, structural-approval queue view, leaderboard with incomparability badge, bisect report with env-snapshot stamp. Investigation tool signatures (pseudocode). Sonny advisory review on debugger semantics. **NEW:** explicit StructuralApprovalQueue subsection.

**Owner:** Valanice
**Secondary:** Sonny (advisory review on debugger/investigation UX patterns), **Gabriel (StructuralApprovalQueue ↔ Router resume protocol — cross-section data dependency)**

**References:** `decisions.md` — Round 2.1 Aperture rename, Open #3 Mirror resolution, Sonny L5 proposal, TDD-Q3 (Aperture async approval queue), TDD-Q5 (bisect env-snapshot stamping), TDD-Q8 (leaderboard surface), Laura §3.3, §3.6 (`CausalSliceEngine`, `BisectOrchestrator`)

**Laura A-scenarios this section enables:** A5 (attention-tier badge), A10 (structural review queue), A11 (bisect output rendering), A12 (revocation attention notification), A4 (causal-slice rendering — `crucible why`).
**Laura invariants this section enforces:** Projection Purity (§6.6 — Aperture projector identical input → identical output, including the approval queue projection).

---

#### §10 — Session Model + Branching (3 pp)

**Purpose:** Specify session lifecycle, fork semantics, and branch metadata. Sessions are first-class with parent/child lineage. **Note:** Crucible sessions live in `~/.crucible/crucible.db`, entirely separate from Cairn's `sessions` table in `~/.cairn/knowledge.db`.

**Key questions answered:**
- `sessions` table schema: `parent_session_id`, `fork_point_event_id`, **`pluginVersions` (resolved transitive dep graph — TDD-Q4 + R2-6)**, `bootstrapManifest` (named-source manifest for offset-0 observations — R2-2 LOCK)?
- Fork protocol: `crucible fork --at <event_id>` creates child session with COW snapshot **AND inherits parent's `pluginVersions` transitive graph verbatim (TDD-Q4)**?
- Branch metadata as Cairn primitives (queryable, comparable)?
- How does branching interact with the WAL (new WAL segment per fork, or shared prefix)?
- Multi-path comparison (token cost, quality, time across sibling branches)?
- Sub-task model: `task_id` field on WAL rows, TaskStart/TaskEnd primitives, serial v1 execution?
- **NEW (TDD-Q4 + R2-6 LOCK):** `SessionMetadata.pluginVersions` schema — flat `Map<packageName, lockedVersion>` (lockfile-derived). Three-phase lifecycle: **install** (Plugin Registry computes full transitive dep graph and writes the lockfile — owner `@akubly/crucible-plugin-registry`), **fork** (lockfile contents copied verbatim into child session's `SessionMetadata.pluginVersions` — owner L1 WAL fork semantics), **session start** (runtime reads `SessionMetadata.pluginVersions` and loads exactly those versions — pure load, no resolution). Mid-session installs are a v1.5+ story with their own ledger ceremony and are NOT a bootstrap concern.
- **NEW (TDD-Q1 / Bootstrap-Capture-Completeness):** Session bootstrap semantics extended — `crucible new-session` must invoke `ledger.bootstrap(bootstrapContext)` which atomically appends one Observation primitive per named source (system_prompt, tool_definitions, cross_session_memory entries) at offset 0 before any other primitive can append. Fork inheritance: child sessions inherit parent's bootstrap manifest by reference (no re-bootstrap), so replay of the child reconstructs the same offset-0 prefix.
- **NEW (TDD-Q6):** Forked-session timestamp constraint — child session's first row timestamp ≥ parent's `fork_point_event_id` row timestamp.

**Depth guidance:** Schema definitions (SQL migration shape) — must show the **`plugin_versions` JSON column + `bootstrap_manifest` JSON column** on the sessions table. Fork protocol pseudocode including transitive-dep-graph snapshot step. COW snapshot mechanics. Worked example: fork at Decision, explore alternative, compare outcomes — **plus** worked example showing transitive-dep inheritance preserves replay determinism even when a globally newer version is installed.

**Owner:** Roger
**Secondary:** Alexander (session bootstrap from SDK — Bootstrap-Capture-Completeness handshake with L0 provider), Graham (branching architecture), **Rosella (Plugin Registry install-time lockfile algorithm — R2-6 cross-section sync pair: lockfile format must copy cleanly into `SessionMetadata.pluginVersions`)**

**References:** `decisions.md` — Phase B #2 (2a: wrap SDK at L1), Aaron Insight #1 (branching is v1 functional requirement), §2.8 sub-task model, TDD-Q4 (transitive deps), TDD-Q1 (Bootstrap-Capture-Completeness)

**Laura A-scenarios this section enables:** A1 (fork from arbitrary offset), A6 (plugin pinning at fork — transitive graph inheritance).
**Laura invariants this section enforces:** Fork Lineage Transitivity (§6.4), Bootstrap-Capture-Completeness on fork (§6.8), Monotonic Timestamps across fork boundary (§6.9).

**References:** `decisions.md` — Phase B #2 (2a: wrap SDK at L1), Aaron Insight #1 (branching is v1 functional requirement), §2.8 sub-task model

---

#### §11 — Hermetic Replay (3 pp)

**Purpose:** Specify the capture spine and re-feed semantics. Every external call emits an Observation carrying request hash + response payload. Replay re-feeds Observations, never re-executes. **REVISED per TDD-Q1:** Observation is a first-class L1 primitive (not envelope metadata); replay equivalence is verified by recomputing Decision context-window Merkle commitments and comparing.

**Key questions answered:**
- What is captured (LLM calls, MCP tool calls, web, filesystem reads)?
- CAS observation store: content-addressed, ~5-10× ledger volume?
- Replay protocol: load captured Observations, feed into session at matching request hashes?
- Determinism conformance suite: A1 (hash integrity), A2 (reference resolvability), A3 (replay equivalence — load-bearing), A4 (population completeness)?
- What is explicitly NOT deterministic (LLM temperature, external state changes)?
- Replay doctrine wording for user understanding?
- **NEW (TDD-Q1 + Q6):** Replay equivalence oracle — **byte-equality on the ledger excluding wall-clock timestamps** (Q6 lock). Spec the `normalizeTimestamps()` helper and the comparison shape (deep equal on (primitiveKind, primitivePayload, causalReadSet, hookVerdict, contextWindowCommitment, hashChain) — timestamps and wall-clock-derived fields are informational, not structural).
- **NEW (TDD-Q1):** Replay refuses to start if the offset-0 bootstrap manifest in the source ledger does not match the offset-0 row set (Bootstrap-Capture-Completeness violation surfaces as a hard error, not silent drift).
- **NEW (TDD-Q1 + R2-1 LOCK):** Context-window reconstruction protocol — for each Decision row, replay reads the `commitmentMethod` tag to choose the reconstruction path: `declared` → load the rows listed in `causalContextWindowSlice`; `fallback` → load the full ledger prefix up to (excluding) the Decision row's offset. Either path then recomputes the BLAKE3 commitment via `ReadSetHasher` and asserts equality with the stored `contextWindowCommitment`.
- **NEW (TDD-Q4):** Replay loads `SessionMetadata.pluginVersions` and refuses to start if any pinned version cannot be rehydrated from the local plugin cache.
- **NEW (Laura §3.1 + §3.2):** Use `LedgerWindowReader` (prefix queries) and `ReadSetHasher` (CBOR + BLAKE3) collaborator names. Replay loop is testable at the component tier by mocking these.

**Depth guidance:** Interface signatures for capture + replay. Conformance assertion specifications (A1-A4 with test pseudocode) **AND** explicit reference to Laura's `normalizeTimestamps()` helper. Storage volume analysis. Explicit non-determinism acknowledgment section. **NEW:** subsection on replay-equivalence-oracle shape (what fields are structural vs informational). **NEW:** subsection on context-window reconstruction.

**Owner:** Laura
**Secondary:** Alexander (LLM-boundary capture implementation — Bootstrap-Capture handshake), Roger (CAS store integration with L1 — `LedgerWindowReader` interface)

**References:** `decisions.md` — v1 commitment #2, #4; Aaron Insight #3; US-G-NEW-2; TDD-Q1 (context-window commitment, Bootstrap-Capture); TDD-Q6 (timestamp exclusion + monotonic invariant), Laura §3.1, §3.2, §6.3, §6.8, §6.9

**Laura A-scenarios this section enables:** A2 (hermetic replay byte-identity), A9 (determinism conformance suite passes).
**Laura invariants this section enforces:** Replay Equivalence (§6.3 — primary), Hash-Chain Integrity (§6.2 — context-window commitment recomputed on replay), Bootstrap-Capture-Completeness (§6.8 — replay refuses to start without complete offset-0), Monotonic-Timestamps (§6.9 — replay validates source ledger before re-feeding).

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
- **NEW (R2-4 + R2-5 LOCKS):** CLI JSON output for bisect includes the per-row `envSnapshotHash` column; CLI JSON output for leaderboard exposes `nonDominatedReason: 'optimal' | 'incomparable'` (and optional `incomparableWith[]`) so JSON consumers see the same distinction the Aperture UI badges (§9).

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
- `@akubly/types` co-evolution: what new Crucible types land (e.g., `CrucibleEvent`, `BootstrapPayload`, WAL row types, **`SessionMetadata` including `pluginVersions` resolved transitive graph + `bootstrapManifest` per TDD-Q1/Q4**), what existing types are shared (e.g., `SessionId` brand, `DecisionRecord`), governance model (CODEOWNERS co-ownership)?
- Package namespace: Crucible packages are `@akubly/crucible-*` (runtime, cli, types). Cairn/Forge packages remain `@akubly/cairn`, `@akubly/forge`, `@akubly/skillsmith-runtime`. No rename, no absorption.
- Accepted tax: two implementations of overlapping concepts. Cairn `event_log` vs Crucible L1 WAL. Forge prescribers vs Crucible L3 Generators. Bounded because audiences differ.
- What Crucible borrows from Cairn/Forge: *patterns* only.
- `skillsmith-runtime` disposition: remains as-is.
- Monorepo layout: Crucible packages live alongside Cairn/Forge in `packages/` with zero cross-deps (enforced by dep-cruiser).
- **NEW (TDD-Q4 + R2-6 LOCK):** Transitive dep resolution timing — Plugin Registry resolves at install (lockfile), `SessionMetadata.pluginVersions` is a verbatim copy of the lockfile snapshotted at fork, session start is a pure load (no resolution). `@akubly/crucible-plugin-registry` owns the install-time resolution algorithm and lockfile format. Rosella ↔ Roger sync pair coordinates the lockfile-format ↔ snapshot-field handshake during Phase 2 authoring.

**Depth guidance:** Coexistence boundary table (what's shared, what's private). `@akubly/types` evolution plan (new types — explicitly list `SessionMetadata`, `BootstrapPayload`, `ContextWindowCommitment`, `StructuralProposal`, `PluginVersionLock` — + versioning protocol). Monorepo layout diagram (before/after). No migration SQL — Crucible starts from an empty `~/.crucible/crucible.db`. **NEW:** subsection on transitive-dep-resolution lifecycle (install → fork-snapshot → session-start-rehydrate).

**Owner:** Roger
**Secondary:** Alexander (Crucible runtime package), Rosella (plugin discovery + transitive resolution — Crucible has its own registry)

**References:** Aaron's coexistence lock (2026-05-27), `decisions.md` — Cross-PRD Coordination, TDD-Q4 (transitive deps lifecycle)

**Laura A-scenarios this section enables:** A6 (plugin pinning lifecycle).
**Laura invariants this section enforces:** Replay Equivalence (§6.3 — transitive dep snapshot prevents version drift).

---

#### §16 — Test Strategy + Invariants (3 pp)

**Purpose:** Specify the testing approach for the CTD. Covers unit, integration, property/fuzz, conformance, and acceptance testing. **REVISED:** This section is now a *thin* CTD-side reference to Laura's authoritative `docs/crucible-tdd-strategy.md`. The CTD describes the *mechanisms the design enables*; the strategy doc owns test counts, fixture patterns, mock-drift defenses, and CI policy. §16 must point readers to the strategy doc and avoid duplicating it.

**Key questions answered:**
- How does the CTD-specified module decomposition (per §1, §15) align with Laura's 5-tier pyramid (unit / contract / component / integration / acceptance)? Which seams expose unit-testable leaf logic, which expose component-mockable collaborators?
- How are the 12 Laura acceptance scenarios (A1-A12) executed? Acceptance harness shape, fixture bootstrap, file-backed DB lifecycle in `.test-sessions/`.
- How are the 9 Laura invariants (§6.1-§6.9) enforced in CI? Property test runner (`fast-check`), nightly cadence, counterexample bisect.
- Generic L3 Adapter Conformance suite execution (Q2) — which CI stage, what passes/fails, how new adapters opt in.
- Determinism conformance suite execution (A1-A4 + Bootstrap-Capture-Completeness).
- **NEW (TDD-Q5):** Bisect, replay, and other tooling CLIs as testable surfaces — covered in new "Tooling" subsection (or §17 cross-ref).
- **NEW (TDD-Q7 — agentic-cost framing, CAPTURE IN DESIGN):** Document the agentic-cost rationale for zero-tolerance mock-drift gate. Future contributors must not downgrade the gate without understanding that agentic systems make many decisions per session against a drifted model — drift cost compounds while fix cost is near-zero (spawn agent → fix). This is a design constraint, not just a CI policy.
- **NEW:** "Tooling" subsection covering bisect (env-snapshot at start per Q5, per-row env-snapshot-hash stamp on output per R2-4), replay CLI (per §11), and why they exist.
- **NEW:** Explicit alignment matrix: for each Laura collaborator contract (§3 of strategy), which CTD section defines the real implementation and at which test tier (component / contract / integration).

**Depth guidance:** Test category table (category → scope → runner → CI stage). Invariant specifications (testable propositions — cross-ref Laura §6.1-§6.9, do not re-author). Fixture strategy (point to Laura §7.2 fixture builders). Target test counts per layer (point to Laura §5.1 pyramid). **NEW:** Tooling subsection. **NEW:** Agentic-cost framing for zero-tolerance gate. **NEW:** Collaborator-contract → CTD-section alignment matrix.

**Owner:** Laura
**Secondary:** Gabriel (CI integration, conformance harness runner, zero-tolerance gate enforcement)

**References:** `docs/crucible-tdd-strategy.md` (authoritative — all sections), TDD-Q2 (Generic L3 conformance), TDD-Q5 (bisect tooling), TDD-Q7 (zero-tolerance + agentic-cost)

**Laura A-scenarios this section enables:** All 12 (this section is the test-harness contract).
**Laura invariants this section enforces:** All 9 (this section runs them).

---

#### §17 — Observability / Telemetry (1 pp)

**Purpose:** Specify what Crucible emits for operational visibility. Covers structured logging, metrics, and trace correlation.

**Key questions answered:**
- What structured events does each layer emit?
- Trace correlation: how does a session's telemetry correlate across layers?
- Per-call telemetry substrate fields (Roger's Sprint 6 0.5d scope)?
- What telemetry does Aperture consume vs what goes to external sinks?
- **NEW (TDD-Q7 — CI policy as observability):** Mock-drift detection signals — contract-test-failure events surface in CI as a distinct telemetry channel that **blocks the PR**, never just warns. Document the agentic-cost framing here too so the gate is defended in both the test-strategy and observability sections.
- **NEW (TDD-Q6):** Monotonic-timestamp-violation detection — runtime emits an Aperture attention-tier event when a violation is detected (clock skew, fork-time bug). Cross-ref §3 (WAL) for the validator and §9 (Aperture) for the rendering.

**Depth guidance:** Event catalog table (event → layer → severity → fields). One paragraph on trace correlation strategy. No external observability infra in v1 (single-user — Aperture IS the observability surface). **NEW:** subsection on CI gates as telemetry signals (mock-drift, conformance failures, invariant violations).

**Owner:** Gabriel
**Secondary:** Roger (per-call telemetry fields, monotonic-timestamp validator emission)

**Laura A-scenarios this section enables:** A5 (Aperture push-notification path traces through telemetry).
**Laura invariants this section enforces:** Monotonic-Timestamps (§6.9 — runtime emission of violation events).

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
- **ADR-0011 (NEW — TDD-Q1):** Observation as First-Class L1 Primitive + Structural Context-Window Commitment Model. Locks: Observation is one of 5 primitive types, Decision carries a Merkle hash over its causal-context window, primitive scale = per-tool-call, M3 side-effect-only calls emit synthetic Artifact, Bootstrap-Capture-Completeness invariant.
- **ADR-0012 (NEW — TDD-Q2):** Generic L3 Adapter Conformance in v1; Eureka Adapter Deferred to v1.5. Locks: every L3 generator must pass the generic conformance suite; Forge passes in v1; Eureka adapter is a v1.5 deliverable.
- **ADR-0013 (NEW — TDD-Q3):** Aperture Async Approval Queue for Structural Proposals. Locks: structural proposals default-not-applied-until-acked; Router pauses dependent paths; no blocking modal.
- **ADR-0014 (NEW — TDD-Q4):** Transitive Plugin Dependency Graph Pinned at Fork. Locks: `SessionMetadata.pluginVersions` carries the resolved transitive graph; install-time resolution, fork-time snapshot, session-start rehydration.
- **ADR-0015 (NEW — TDD-Q5):** Bisect Execution Model — Env-Snapshot at Start. Locks: env snapshotted at bisect start, all iterations use fixed snapshot; internally consistent, not externally hermetic; output stamps env-snapshot hash.
- **ADR-0016 (NEW — TDD-Q6):** Timestamp Treatment — Excluded from Replay Byte-Equality + Monotonic-Within-Session Invariant. Locks: replay equivalence oracle normalizes timestamps; separate property test enforces monotonicity.
- **ADR-0017 (NEW — TDD-Q7):** Zero-Tolerance Mock-Drift Gate (Agentic-Cost Framing). Locks: single contract-test failure blocks all PRs; rationale: agentic cost functions invert human-team trade-off; preserves this as a design constraint not a CI preference.
- **ADR-0018 (NEW — TDD-Q8):** Pareto Incomparable Prescriptions Both Non-Dominated. Locks: no zero-fill on missing axes; no partial dominance heuristic in v1; both incomparable prescriptions surface to user.

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
| §9 Aperture | Valanice | Gabriel (queue↔Router resume — Q3) | Graham | Sonny |
| §10 | Roger | Alexander, Graham, **Rosella (Q4 timing)** | Laura | — |
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

### Phase 0.5 — Walking Skeleton (gates Phase 1 fan-out)

Before Phase 1 fan-out, a minimal end-to-end walking skeleton MUST pass.
This proves the substrate is alive before the team invests in parallel
section authoring against it.

**Skeleton scope (minimum viable vertical slice):**

1. **One LLM call** through the `SdkProvider` boundary (§12) — a single
   user prompt → model response round-trip.
2. **L0 bootstrap** — `BootstrapPayload` materialized as offset-0
   Observation rows in the WAL (§2, §3).
3. **WAL append** — the LLM response committed as at least one
   Observation + one Decision row with hash-chain linking (§3.2).
4. **`crucible status`** reads back the session from the WAL and reports
   session ID, row count, and last commit offset (§13 — minimal verb).
5. **`crucible replay`** passes the A2 conformance assertion (§11.8) —
   byte-equivalent replay ledger from the captured session.

**Gate rule:** Phase 1 fan-out is blocked until all 5 skeleton checks
pass in CI on a single green run. The skeleton is intentionally minimal —
no hook bus, no Router, no generators, no Aperture. It validates only the
L0→L1→replay vertical.

**Owner:** Graham (orchestration) + Roger (WAL) + Alexander (SDK provider).
**Estimated effort:** 2–3 days.

### Phase 1 — Core Stack (parallel fan-out, depends on Phase 0.5)

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
┌─ §10 Session + Branching (Roger) [depends on §3 WAL format AND §7 Plugin Registry timing — NEW Q4]
│
├─ §9 Aperture (Valanice) [depends on §5 Router (queue + resume protocol — NEW Q3), §4 Hook Bus]
│
├─ §13 CLI Shell (Valanice) [depends on §8 Applier, §12 SDK for interaction model]
│
├─ §15 Coexistence & Types (Roger) [depends on §3 WAL, §7 Generators for target state]
│
├─ §14 Eureka Integration (Graham) [depends on §7 Generators for Generic L3 Conformance Contract]
│
└─ §16 Test Strategy (Laura) [depends on §3, §4, §11 for invariant surface]
```

**NEW cross-section data dependencies (surfaced by TDD reconciliation):**
- §10 ↔ §7 (Q4 transitive-dep timing — Roger + Rosella must align on install/fork/session-start lifecycle)
- §9 ↔ §5 (Q3 StructuralApprovalQueue ↔ Router resume protocol — Valanice + Gabriel must align on ack handshake)
- §16 references the entire TDD strategy doc (Laura authors as cross-ref, not duplication)

### Phase 3 — Cross-Cutting (depends on Phase 2)

```
┌─ §17 Observability (Gabriel)
├─ §18 Security (Gabriel)
└─ §19 ADR Set (Graham) [synthesizes all sections]
```

### Dependency Summary

```
Phase 0 (1 day)  →  Phase 0.5 (2-3 days)  →  Phase 1 (3 days parallel)  →  Phase 2 (2 days parallel)  →  Phase 3 (1 day)
                          ↑                         ↑                                                           ↓
                    walking skeleton          Gate 1.5: ADR bodies                                    Review Round (2 days)
                    gates fan-out             (0002, 0011, 0024)
```

**Critical path:** §2 → §6 → skeleton → ADR-0002 body → §3 → §10 → §15 → §19 (Roger's chain remains the longest serial dependency; skeleton + ADR gate add ~3–4 days up front but de-risk Phase 1).

**Total elapsed time:** ~10 working days (1 day Phase 0 + 2–3 days skeleton + 5 days Phases 1–3 + 2 days review). Net addition of ~3 days vs. rev. 3 estimate; amortized by reduced rework risk.

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

### Gate 1.5 — ADR-Body Gate (before Phase 1 implementation begins)

**What:** Authored ADR bodies for the three load-bearing substrate decisions
must land in `docs/adr/` before any Phase 1 implementation code is written.

| ADR | Title | Author | Why gated |
|---|---|---|---|
| ADR-0002 | L1 WAL Substrate Selection | Roger | Substrate choice is non-reversible once WAL code exists; ADR body must include "Why not SQLite WAL-mode" section (§19.2 guidance). |
| ADR-0011 | Observation as First-Class Primitive + Context-Window Commitment | Graham | Replay doctrine shapes every L1 row; implementation without the argued rationale risks silent scope drift. |
| ADR-0024 | Explicit L3.5 Scheduler Tier | Gabriel | Scheduler is retained in v1 (Aaron ruling); dispatch contract must be argued before Router + Scheduler code begins. |

**Trigger for rejection:** ADR body missing any of: Context, Options Considered,
Decision, Rationale, Consequences (per §19.3 body shape). "Why not" sections
for rejected alternatives are mandatory — the panel (I13) specifically flagged
that reviewers need to see rejected options, not just outcomes.

**Remaining ADRs (ADR-0003–ADR-0019 excluding 0002/0011/0024):** may be authored
in parallel with Phase 1 implementation. They are not gated because their
decisions are either downstream of Phase 1 outputs or have sufficient rationale
already visible in the CTD section body.

**Turnaround:** ≤2 days per ADR body.

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

Roger's L1 contract, Rosella's L3 contract, and Alexander's L0 contract all define interfaces that must interlock. Parallel authoring risks incompatible signatures. **Q1-Q8 reconciliation adds two new cross-section seams: (a) the Q3 StructuralApprovalQueue handshake between Gabriel's §5 Router and Valanice's §9 Aperture; (b) the Q4 transitive-dep-resolution timing between Roger's §10/§15 and Rosella's §7.** These are now explicit secondary-contributor cross-references in the manifest.

**Mitigation:** §2 (L0/L1 boundary) is Phase 0 and provides the canonical shape. Laura's collaborator names (`SessionBootstrapper`, `LedgerWindowReader`, `AppendProtocol`, `PreCommitHookBus`, `ReadSetHasher`, `PolicyEngine`, `EscalationQueue`, `LedgerProjector`, `QueryExecutor`, `PrescriberOrchestrator`, `GenericL3AdapterContract`, `ChangeVectorProvider`, `ParetoFitnessEvaluator`, `CausalSliceEngine`, `BisectOrchestrator`, `PluginRegistry`, `CLIRenderer`) are the test-surface names — section owners must adopt them as canonical or document an explicit alias map. Secondary contributors on each section are the adjacent-layer owners. Gate 2 cross-review catches mismatches. Graham Phase 3 synthesis runs the full collaborator-name conformance check.

### ~~Risk 6 (TDD reconciliation): Six New Open Questions~~ (RESOLVED 2026-05-28)

All six R2 open questions resolved by Aaron via the coordinator's interactive Decision-Point gate (2026-05-28). Locks recorded in the "Resolved R2 Decisions" section above and in `.squad/decisions/inbox/coordinator-ctd-r2-resolutions.md`. Two coordinator-added expansions (R2-1 `commitmentMethod` tag; R2-5 `nonDominatedReason` field) baked into the affected section specs (§2, §3, §7/§8, §9, §11). Fan-out is unblocked.

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
| **Input artifacts** | `.squad/decisions.md` (Phase B #1 L0 boundary, Open #1 graham-opens-1-and-3, TDD Q1-Q8 Resolutions §); `docs/crucible-tdd-strategy.md` §3.1 (`SessionBootstrapper`, `LedgerWindowReader`), §6.8 (Bootstrap-Capture-Completeness); §2 of `docs/crucible-technical-design-plan.md` (this spec, rev. 2) |
| **Hard dependencies** | None (first section authored) |
| **Acceptance criteria** | ✅ TypeScript interface signatures for `BootstrapPayload` (R2-2 LOCK shape: `literalContext` { systemPrompt, toolDefinitions, injectedMemoryFragments } + `memoryManifest`), `CrucibleEvent`, `OutboundPrompt`, control enum. ✅ OPTIONAL `causalContextWindow: EventId[]` field on Decision-emission contract (R2-1 LOCK). ✅ Explicit NOT-cross list. ✅ Per-tool-call boundary signaling + M3 side-effect tagging. ✅ Dependency-cruiser rule specification. ✅ Interface alias table (Graham name ↔ Laura collaborator name: `SessionBootstrapper`, `LedgerWindowReader`). ✅ Laura can write A2 + A6 acceptance tests against this spec. ✅ Laura can write the Bootstrap-Capture-Completeness invariant test (§6.8) against this spec. ✅ ≤3 pages. ✅ No locked decisions re-litigated. |

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
| **Secondary** | Laura (A1-A4 + bootstrap/monotonic conformance integration), Gabriel (CI harness for WAL invariants + zero-tolerance gate enforcement) |
| **Output** | `docs/crucible-technical-design/03-l1-wal-substrate.md` |
| **Input artifacts** | `.squad/decisions.md` (A.3 hybrid lock, v1 commitment #10, Open #5 CBOR+BLAKE3, Roger Hook Bus Signoff WAL schema extension, **TDD-Q1 context-window commitment + primitive scale + M3 + Bootstrap-Capture**, **TDD-Q6 monotonic timestamps**); `docs/crucible-tdd-strategy.md` §3.2 (`AppendProtocol`, `PreCommitHookBus`, `ReadSetHasher`), §6.1, §6.2, §6.8, §6.9 invariants; Phase 0 outputs (§2 boundary contract, §6 primitive types); `docs/crucible-technical-design-plan.md` §3 spec (rev. 2) |
| **Hard dependencies** | Phase 0 (§2 L0/L1 boundary — defines what L1 receives from L0, including Bootstrap-Capture handshake) |
| **Acceptance criteria** | ✅ WAL row schema as TypeScript types — explicit subsection on Observation as first-class primitive, Decision `contextWindowCommitment` field + `commitmentMethod: 'declared' \| 'fallback'` tag (R2-1 LOCK), Artifact `synthetic_output` sub-type. ✅ On-disk binary layout specification. ✅ Append + group-commit + seal-and-split + **bootstrap-batch + decision-commit-with-context-window (`ContextWindowResolver` honoring R2-1 hybrid rule)** pseudocode. ✅ Performance envelope. ✅ Storage volume projections including offset-0 bootstrap rows. ✅ L1Subscriber contract. ✅ Content addressing + hash chain. ✅ Per-tool-call primitive-scale enforcement. ✅ Monotonic-timestamp assignment rule + violation-detection emission to Aperture. ✅ Seam map (which internals are unit-testable, component-testable behind `AppendProtocol`/`PreCommitHookBus`/`LedgerWindowReader`, or require integration tier). ✅ Laura can write A1, A2, A3, A4, A9 acceptance tests against this spec. ✅ Laura can write Append-Only (§6.1), Hash-Chain Integrity (§6.2), Replay Equivalence (§6.3), Bootstrap-Capture-Completeness (§6.8), Monotonic-Timestamps (§6.9) invariant tests against this spec. ✅ ≤10 pages. |

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
| **Secondary** | Graham (contract shape authority), Laura (fitnessContract + causalReadSet fields + **GenericL3AdapterContract shape**) |
| **Output** | `docs/crucible-technical-design/07-generators-l3.md` |
| **Input artifacts** | `.squad/decisions.md` (Phase A 8-field schema lock, Rosella dual-interface proposal, Round 2.3 trust-tier vocabulary, **TDD-Q2 Generic L3 adapter conformance + Eureka v1.5 defer**, **TDD-Q3 structural emission contract**, **TDD-Q8 Pareto incomparable**); `docs/crucible-tdd-strategy.md` §3.4 (`PrescriberOrchestrator`, `GenericL3AdapterContract`, `ChangeVectorProvider`, `ParetoFitnessEvaluator`); Phase 0 outputs (§6 primitive types); `docs/crucible-technical-design-plan.md` §7 spec (rev. 2) |
| **Hard dependencies** | Phase 0 (§6 primitive types, §2 boundary) |
| **Acceptance criteria** | ✅ `ProposalGenerator` TypeScript interface (all 8 fields). ✅ `DataProposalGenerator` vs `StructuralProposalGenerator` split — **structural variant declares `dependentPaths[]` for Router pause semantics**. ✅ **NEW: §7.A Generic L3 Adapter Conformance Contract — reusable conformance test suite definition (interface compliance, fail-open, hint attribution, lifecycle, registration).** ✅ Forge-as-generator worked example demonstrating Forge passes the conformance suite. ✅ Curator-as-generator charter. ✅ **Eureka adapter content moved to v1.5 appendix; v1 retains one-paragraph forward reference.** ✅ Plugin lifecycle contract. ✅ `ReadSetBuilder` helper interface. ✅ Trust-tier attribution table. ✅ Pareto fitness emission rules (no zero-fill on missing axes). ✅ **`PrescriptionResult.nonDominatedReason: 'optimal' \| 'incomparable'` field defined (R2-5 LOCK), with optional `incomparableWith: string[]`. Coordinate field/affordance naming with Valanice (§9 leaderboard badge).** ✅ Collaborator name alias map (Laura §3.4). ✅ Laura can write A7, A8, A10, A12 acceptance tests against this spec. ✅ Laura can run the Generic L3 Adapter Conformance suite (§5.3) against Forge using only this spec. ✅ ≤3 pages (Eureka v1.5 appendix is separate). |

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
| **Acceptance criteria** | ✅ Apply protocol interface. ✅ State machine (proposed → approved → applying → applied | failed) with **paused-awaiting-structural-ack** sub-state (R2-3 LOCK handshake with §9 queue + §5 Router). ✅ Ledger-position fence pseudocode. ✅ **Applier-written Decision includes `contextWindowCommitment` + `commitmentMethod` (R2-1 LOCK), computed from `LedgerWindowReader` + `ReadSetHasher`.** ✅ **Applier propagates source `PrescriptionResult.nonDominatedReason` onto Decision evidence when picking among non-dominated prescriptions (R2-5 LOCK); tiebreak rationale recorded for auditability.** ✅ DecisionGate UX specification. ✅ Rollback/revert semantics. ✅ Integration point with Aperture notifications. ✅ ≤3 pages. |

#### Lane 4: §11 (Laura)

**§11 — Hermetic Replay**

| Field | Value |
|-------|-------|
| **Owner** | Laura |
| **Secondary** | Alexander (LLM-boundary capture — Bootstrap-Capture handshake), Roger (CAS store integration — `LedgerWindowReader`) |
| **Output** | `docs/crucible-technical-design/11-hermetic-replay.md` |
| **Input artifacts** | `.squad/decisions.md` (v1 commitment #2, #4; Aaron Insight #3; US-G-NEW-2; **TDD-Q1 context-window commitment + Bootstrap-Capture**; **TDD-Q6 timestamp exclusion + monotonic invariant**); `docs/crucible-tdd-strategy.md` §3.1 (`LedgerWindowReader`), §3.2 (`ReadSetHasher`), §6.3 (Replay Equivalence), §6.8, §6.9; Phase 0 outputs (§6 primitives); `docs/crucible-technical-design-plan.md` §11 spec (rev. 2) |
| **Hard dependencies** | Phase 0 (§6 Observation primitive definition) |
| **Acceptance criteria** | ✅ Capture scope. ✅ CAS store interface + volume projections. ✅ Replay protocol (request-hash matching, re-feed semantics). ✅ A1-A4 conformance assertion specifications with test pseudocode. ✅ **Replay-equivalence-oracle shape: which fields are structural (byte-equal) vs informational (timestamps, wall-clock-derived) per Q6**. ✅ **`normalizeTimestamps()` helper spec (Laura §6.3)**. ✅ **Context-window reconstruction protocol (R2-1 LOCK): replay reads `commitmentMethod` tag, reconstructs via declared `causalContextWindowSlice` or full ledger prefix accordingly, recomputes BLAKE3 commitment, asserts equality**. ✅ **Replay refuses to start on Bootstrap-Capture-Completeness violation or missing transitive-dep rehydration**. ✅ Non-determinism doctrine. ✅ Laura can write A2 + A9 acceptance tests against this spec. ✅ Laura can write §6.3 (Replay Equivalence), §6.8 (Bootstrap-Capture-Completeness in replay path) invariant tests against this spec. ✅ ≤3 pages. |

#### Lane 5: §5 (Gabriel)

**§5 — Router Design (L4)**

| Field | Value |
|-------|-------|
| **Owner** | Gabriel |
| **Secondary** | Graham (policy architecture), Rosella (generator-side proposal submission — Data + Structural) |
| **Output** | `docs/crucible-technical-design/05-router-design.md` |
| **Input artifacts** | `.squad/decisions.md` (Gabriel Hook Bus Router Verdict §6, Tension #2, L4 verdict extensibility, Curator authority model, **TDD-Q3 structural async queue + pause-dependent-paths**, **TDD-Q7 zero-tolerance gate rationale**, **TDD-Q8 Pareto incomparable**); `docs/crucible-tdd-strategy.md` §3.5 (`PolicyEngine`, `EscalationQueue`), §6.5 (Hook Verdict Consistency), §6.7 (Trust-Tier Monotonicity); Phase 0 outputs; `docs/crucible-technical-design-plan.md` §5 spec (rev. 2) |
| **Hard dependencies** | Phase 0 (§6 primitive types — Router policy table indexes by primitive kind) |
| **Acceptance criteria** | ✅ Policy table schema (now includes tier dimension). ✅ Proposal lifecycle state machine **with paused-dependent-path sub-state**. ✅ Verdict ack protocol. ✅ `RouterDecision` event shape. ✅ Replayability rationale (no live policy reload — agentic-cost framing). ✅ Debugger verdict extension point. ✅ **Structural-vs-data classification + pause-dependent-paths spec including resume handshake with Aperture's queue projection (R2-3 LOCK; Gabriel ↔ Valanice sync pair on event shape during Phase 2)**. ✅ **Pareto-non-dominated handling: Router surfaces the full non-dominated set tagged by `nonDominatedReason` (R2-5 LOCK); never silently picks**. ✅ Collaborator name alias map (`PolicyEngine`, `EscalationQueue`). ✅ Laura can write A3, A10, A12 acceptance tests against this spec. ✅ Laura can write §6.5 (Hook Verdict Consistency) and §6.7 (Trust-Tier Monotonicity) invariant tests against this spec. ✅ ≤3 pages. |

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
| **Secondary** | Alexander (session bootstrap from SDK — Bootstrap-Capture handshake), Graham (branching architecture), **Rosella (Plugin Registry install-time lockfile algorithm — R2-6 sync pair: lockfile format must copy cleanly into snapshot field)** |
| **Output** | `docs/crucible-technical-design/10-session-branching.md` |
| **Input artifacts** | §3 output (WAL format — bootstrap-batch + monotonic-timestamp constraint); `.squad/decisions.md` (Phase B #2, Aaron Insight #1, §2.8 sub-task model, **TDD-Q1 Bootstrap-Capture**, **TDD-Q4 transitive deps**, **TDD-Q6 monotonic across fork**); `docs/crucible-tdd-strategy.md` A1, A6 acceptance scenarios, §6.4 (Fork Lineage Transitivity), §6.8, §6.9; `docs/crucible-technical-design-plan.md` §10 spec (rev. 2) |
| **Hard dependencies** | §3 (WAL format), **§7 (Generator-side Plugin Registry contract — R2-6 lockfile-format alignment with Rosella)** |
| **Acceptance criteria** | ✅ `sessions` table schema with `plugin_versions` JSON column + `bootstrap_manifest` JSON column. ✅ Fork protocol pseudocode incl. **verbatim lockfile copy into `SessionMetadata.pluginVersions` (R2-6 LOCK fork phase)**. ✅ COW snapshot mechanics. ✅ Sub-task model. ✅ **Bootstrap protocol — `ledger.bootstrap(bootstrapContext)` semantics, atomic offset-0 append per named source, fork inheritance of bootstrap manifest by reference; `bootstrapManifest` shape per R2-2 LOCK (`literalContext` + `memoryManifest`)**. ✅ **Transitive-dep lifecycle (R2-6 LOCK): install (Rosella's `@akubly/crucible-plugin-registry` resolves and writes lockfile) → fork (verbatim copy into snapshot field) → session-start (pure load, no resolution). Rosella ↔ Roger sync pair coordinates lockfile-format ↔ snapshot-field handshake.** ✅ **Forked-timestamp monotonicity constraint (≥ parent fork-point row timestamp)**. ✅ Multi-path comparison sketch. ✅ Laura can write A1 + A6 acceptance tests against this spec. ✅ Laura can write §6.4 (Fork Lineage Transitivity) invariant test against this spec. ✅ ≤3 pages. |

#### §9 — Aperture (Valanice)

| Field | Value |
|-------|-------|
| **Owner** | Valanice |
| **Secondary** | **Gabriel (StructuralApprovalQueue ↔ Router resume protocol — cross-section data dependency on §5)** |
| **Output** | `docs/crucible-technical-design/09-aperture.md` |
| **Input artifacts** | §5 output (Router — Aperture receives RouterDecision events + structural-proposal enqueues); §4 output (Hook Bus — Aperture subscribes to observe verdicts); `.squad/decisions.md` (Round 2.1 Aperture rename, Open #3, Sonny L5 proposal, ApertureEvent schema, **TDD-Q3 async approval queue**, **TDD-Q5 bisect env-snapshot stamping**, **TDD-Q8 leaderboard incomparability surface**); `docs/crucible-tdd-strategy.md` §3.3 (`LedgerProjector`, `QueryExecutor`), §3.6 (`CausalSliceEngine`, `BisectOrchestrator`), §6.6 (Projection Purity); `docs/crucible-technical-design-plan.md` §9 spec (rev. 2) |
| **Hard dependencies** | §5 (Router event shape + structural-queue enqueue protocol + paused-path resume handshake), §4 (Hook Bus subscriber model) |
| **Acceptance criteria** | ✅ `ApertureEvent` schema. ✅ `aperture_events` projection table. ✅ Notification policy (4 levels) — structural proposals MUST land at `attention`, never `urgent`. ✅ CLI verbs (`crucible aperture watch/show/approve/reject/defer`). ✅ Investigation tool interfaces. ✅ Breakpoint/watchpoint/logpoint registry sketch. ✅ **NEW: StructuralApprovalQueue subsection — entry shape, queue is a pure projection over L1 structural-proposal-state events recomputed on every Aperture boot (R2-3 LOCK), Router resume handshake, default-not-applied semantics**. ✅ **Bisect output rendering with per-row env-snapshot-hash stamp (R2-4 LOCK)**. ✅ **Leaderboard rendering of all Pareto-non-dominated prescriptions with `[incomparable-axes]` badge on those with `nonDominatedReason === 'incomparable'` (R2-5 LOCK — matches `PrescriptionResult` field in §7/§8)**. ✅ Collaborator name alias map. ✅ Laura can write A5, A10, A11, A12, A4 acceptance tests against this spec. ✅ Laura can write §6.6 (Projection Purity) invariant test against this spec. ✅ ≤3 pages. |
| **Consultant** | Sonny (advisory review after draft) |

#### §13 — Crucible CLI Shell (Valanice)

| Field | Value |
|-------|-------|
| **Owner** | Valanice |
| **Secondary** | Alexander (runtime integration) |
| **Output** | `docs/crucible-technical-design/13-crucible-cli-shell.md` |
| **Input artifacts** | §8 output (Applier — CLI interaction model); §12 output (SDK — runtime composition); `.squad/decisions.md` (T5 resolution, UX metaphor discipline, Round 2.1 CLI verbs); `docs/crucible-technical-design-plan.md` §13 spec |
| **Hard dependencies** | §8 (DecisionGate UX — CLI must surface approval prompts), §12 (runtime — CLI is thin shell around it) |
| **Acceptance criteria** | ✅ Command vocabulary table (verb, args, description). ✅ REPL interaction model (thick turns, progressive disclosure). ✅ Composition with `@akubly/crucible-runtime`. ✅ Saved queries / `@lobby`. ✅ UX principles. ✅ **CLI JSON output schema for bisect carries per-row `envSnapshotHash` (R2-4 LOCK).** ✅ **CLI JSON output for leaderboard exposes `nonDominatedReason: 'optimal' \| 'incomparable'` (and optional `incomparableWith[]`) so JSON consumers see what the Aperture UI badges in §9 (R2-5 LOCK).** ✅ ≤3 pages. |
| **Consultant** | Sonny (advisory review after draft) |

#### §15 — Coexistence & Shared Types (Roger)

| Field | Value |
|-------|-------|
| **Owner** | Roger |
| **Secondary** | Alexander (Crucible runtime package), Rosella (plugin discovery + transitive resolution) |
| **Output** | `docs/crucible-technical-design/15-coexistence-shared-types.md` |
| **Input artifacts** | §3 output (WAL format — Crucible storage contract); §7 output (Generators — overlap boundary with Forge + Generic L3 Conformance); `.squad/decisions.md` (Cross-PRD Coordination, @akubly/types governance, **TDD-Q4 transitive deps lifecycle**); Aaron's coexistence lock verbatim; `docs/crucible-technical-design-plan.md` §15 spec (rev. 2) |
| **Hard dependencies** | §3, §7 |
| **Acceptance criteria** | ✅ Two-product coexistence boundary table. ✅ `@akubly/types` evolution plan — explicitly enumerates new types: `SessionMetadata` (with `pluginVersions` + `bootstrapManifest`), `BootstrapPayload` (R2-2 LOCK shape: `literalContext` + `memoryManifest`), `ContextWindowCommitment` (+ `commitmentMethod` per R2-1 LOCK), `StructuralProposal`, `PluginVersionLock` (R2-6 LOCK lockfile entry shape), `PrescriptionResult` (with `nonDominatedReason` per R2-5 LOCK). ✅ Monorepo layout diagram. ✅ Accepted tax enumeration. ✅ `skillsmith-runtime` stays as-is. ✅ **Transitive-dep-resolution lifecycle subsection (R2-6 LOCK: install / fork-snapshot / session-start-load) — owns the algorithm package (`@akubly/crucible-plugin-registry`) + lockfile format. Rosella ↔ Roger sync pair coordinates lockfile-format ↔ `SessionMetadata.pluginVersions` snapshot during Phase 2.** ✅ Laura can write A6 acceptance test against this spec. ✅ ≤3 pages. |

#### §14 — Eureka Integration Surface (Graham)

| Field | Value |
|-------|-------|
| **Owner** | Graham |
| **Secondary** | Rosella (generator contract alignment + Generic L3 Conformance) |
| **Output** | `docs/crucible-technical-design/14-eureka-integration-surface.md` |
| **Input artifacts** | §7 output (Generators — Eureka adapter must conform to `GenericL3AdapterContract` when it lands); `.squad/decisions.md` (Eureka PRD Overlap Analysis, Cassima reply, Eureka status lock, **TDD-Q2 Eureka adapter deferred to v1.5**); `.squad/decisions/inbox/graham-eureka-crucible-overlap.md`; `docs/crucible-technical-design-plan.md` §14 spec |
| **Hard dependencies** | §7 (ProposalGenerator contract + Generic L3 Conformance Contract — Eureka adapter must conform when it lands in v1.5) |
| **Acceptance criteria** | ✅ Contract table (shared: SessionId, DecisionRecord; private: everything else). ✅ One-paragraph note: Eureka adapter is a v1.5 deliverable that must pass the §7.A Generic L3 Adapter Conformance suite — no v1 Eureka-specific test infra. ✅ Explicit boundary: Eureka ↔ Cairn bridges are Eureka's concern. ✅ ≤1 page. |

#### §16 — Test Strategy + Invariants (Laura)

| Field | Value |
|-------|-------|
| **Owner** | Laura |
| **Secondary** | Gabriel (CI integration, conformance harness runner, zero-tolerance gate enforcement) |
| **Output** | `docs/crucible-technical-design/16-test-strategy-invariants.md` |
| **Input artifacts** | §3, §4, §11 outputs (invariant surfaces); `docs/crucible-tdd-strategy.md` (AUTHORITATIVE — all 12 sections, do not re-author); `.squad/decisions.md` (v1 commitments, **TDD-Q2 Generic L3 Conformance**, **TDD-Q5 bisect tooling**, **TDD-Q7 zero-tolerance + agentic-cost framing**); `docs/crucible-technical-design-plan.md` §16 spec (rev. 2) |
| **Hard dependencies** | §3, §4, §11 |
| **Acceptance criteria** | ✅ Test category table (category → scope → runner → CI stage). ✅ Invariant specifications — **CROSS-REF Laura §6.1-§6.9, do not duplicate**. ✅ Fixture strategy — cross-ref Laura §7.2 + §9. ✅ Test pyramid — cross-ref Laura §5.1, do not re-author counts. ✅ "One-week productivity loop" bar test specification. ✅ **NEW: Tooling subsection (bisect with env-snapshot per Q5, replay CLI per §11)**. ✅ **NEW: Agentic-cost framing for zero-tolerance mock-drift gate captured as design constraint (Q7)**. ✅ **NEW: Collaborator-contract → CTD-section alignment matrix (for each Laura §3 collaborator, which CTD section defines real impl, at which test tier)**. ✅ Generic L3 Adapter Conformance suite execution spec (CI stage, new-adapter opt-in). ✅ ≤3 pages. |

**Phase 2 Synthesis:** Graham reviews all Phase 2 outputs. Specific checks: (a) §10 branching uses §3's WAL segment model correctly and inherits bootstrap manifest + transitive-dep graph per Q1/Q4; (b) §9 Aperture subscribes to §4's bus per the subscriber contract AND implements the StructuralApprovalQueue handshake with §5's Router resume protocol (Q3 cross-section dependency); (c) §13 CLI verbs cover all §8 DecisionGate interaction surfaces plus the new `aperture approve/reject/defer` verbs; (d) §15 coexistence boundary is consistent with §7's generator contract and §10's transitive-dep timing (Q4 cross-section dependency); (e) §16 test invariants reference (not duplicate) Laura's TDD strategy and include the new collaborator-contract→CTD-section alignment matrix.

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
| 1 | §1, §3, §4, §5, §7, §8, §11, §12 | 5 (Roger, Rosella, Alexander, Laura, Gabriel + Graham) | 7 | 3–4 days (§3 grew per Q1 rev.) |
| 2 | §9, §10, §13, §14, §15, §16 | 6 (Roger, Valanice, Graham, Laura) | 4 + consultants + Gabriel sync (§9↔§5 Q3) + Rosella sync (§10↔§7 Q4) | 2 days |
| 3 | §17, §18, §19 | 2 (Gabriel, Graham) | 2 | 1 day (§19 grew from 9 ADRs to 17 ADRs — index-only, still ≤1 page) |
| Review | All 19 | Per ownership map | All + consultants | 2 days |
| **Total** | **19 sections** | — | **9 agents** | **~9–10 days** |

**Rev. 3 net delta vs. rev. 2:** No new sections, no owner reassignments, no wave-structure changes. All six R2 open questions baked in as declarative locks (R2-1 through R2-6). Two coordinator-added expansions woven into affected section specs: `commitmentMethod: 'declared' | 'fallback'` on Decision row metadata (§2, §3, §11) and `nonDominatedReason: 'optimal' | 'incomparable'` on `PrescriptionResult` (§7/§8) with matching `[incomparable-axes]` UI badge (§9) and JSON surface (§13). Two cross-section sync pairs made explicit as coordination touchpoints during Phase 2 authoring: Gabriel ↔ Valanice (R2-3 queue ↔ Router resume handshake) and Rosella ↔ Roger (R2-6 lockfile-format ↔ snapshot-field handshake). Status: READY FOR FAN-OUT — Phase 2 unblocked.

**Rev. 2 net delta vs. rev. 1:** No new sections, no owner reassignments. §3 (WAL) and §7 (Generators) gained the most depth. Two new explicit cross-section sync points (§9↔§5 Q3 queue/resume; §10↔§7 Q4 transitive-dep timing). §16 (Test Strategy) shrank from independent authoring to cross-ref-of-Laura's-strategy. ADR count grew from 9 to 17 (still index-only).
