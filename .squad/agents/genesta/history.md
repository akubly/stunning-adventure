# Genesta — History (Summarized)

## Core Context

**Project:** Eureka — agentic brain/memory/learning system for `packages/eureka/` in stunning-adventure monorepo.
**Role:** Lead Eureka + Substrate/Storage specialist. Co-lead with Graham.
**Current status:** Eureka v5-final LOCKED. R8 design cycle CLOSED.

---

## Design Ceremony Summary (R1–R8)

**R1–R6 Foundation:** First-principles design through v1 PRD. Path D chosen (Eureka standalone, kernel-shaped). Prior art surveyed. Cross-pollination with Crispin/Edgar. Key crystallizations: activities are verbs, recency is gradient, kinds are tags, confidence/trust orthogonal.

**R7 Lock:** v4-final locked as canonical. Dual-axis DecisionPayload correct. Both adapter paths sound. Branded types prevent confidence/trust collapse.

**R8 Amendment:** Aaron relaxed FR-13 "isolated by design" → shared `SessionId` brand. Principle: honest design + explicit guardrails (lens framing, ESLint enforcement, schema comments) > defensive design hiding identifiers.

---

## Recent Work

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL
**Verdict:** APPROVE-FOR-LOCK
- Both adapter paths (Eureka→Forge + Forge→Eureka) correctly model confidence/trust orthogonality
- Dual-axis DecisionPayload schema correct: input_trust_avg (provenance) + reasoning_confidence (analytic)
- Path 2 asymmetry (lossy Forge→Eureka) acceptable for learning-pattern use case

**Status:** v4-final locked. Implementation ready.

### 2026-05-25: R8 Session Identity — Fold with Grace + 5 Guardrails
**Verdict:** FOLD WITH CONSTRAINTS
- Shared `SessionId` brand acceptable if guardrailed
- G1: Lens framing normative (schema comments: "DO NOT JOIN")
- G2: No runtime traversal API (Session.getEurekaFacts() forbidden)
- G3: SessionId lives in neutral @akubly/types
- G4: session_id required in both schemas
- G5: cairn_session_id → session_id (honest naming)

**Key learning:** Honest design beats defensive design when explicit guardrails exist.

### 2026-05-26: R8 Lock-Review — v5-final CANONICAL
**Verdict:** LOCK
- All 5 guardrails verified and correctly integrated
- ESLint rule (FR-12 #8) enforces boundary at build time
- v4-final "isolated by design" sentence deleted + replaced with lens framing
- Zero new architectural concerns
- Implementation ready

**Status:** v5-final canonical. R8 design cycle CLOSED.

---

## Learnings

### 2026-05-26: Crucible–Eureka Overlap Analysis
**Task:** Pre-implementation architectural coordination for two simultaneous PRDs (Crucible v1-DRAFT + Eureka v5-final)

**Key Findings:**
1. **Event Schema Collision (HIGH RISK)** — Crucible's 5 primitives (Request/Artifact/Observation/Decision/Question) vs Cairn's existing `event_log` creates dual append-only logs in same monorepo. Resolution needed: merge Crucible WAL into Cairn substrate OR federate via separate repo. Unresolved dual-write is a trap.

2. **SessionId Brand Collision (BLOCKER)** — Both PRDs mandate `SessionId` branded type in `@akubly/types`. Eureka ships first (R8 locked). Resolution: Crucible MUST import Eureka's `SessionId` brand (not define its own). Type is shared ID format; usage remains independent (ESLint guardrails prevent coupling).

3. **Decision Schema Triple Ownership** — Three decision schemas: Forge `DecisionRecord` (audit), Eureka `DecisionPayload` (deliberation), Crucible `Decision` primitive (event). Resolution: Crucible `Decision` must emit Forge `DecisionRecord` at write time (bridge for Eureka Path 2 ingestion). Without bridge, Eureka cannot learn from Crucible sessions.

4. **Prescriber Pattern Convergence (SAFE)** — Crucible's "prescribers + Router" is algorithmically identical to Forge's existing prescriber family + Eureka's sweep. Convergent substrate by design; can share `learning-kernel` in v1.5+. No v1 coordination needed.

5. **Sweep Mechanics Kinship (SAFE)** — Crucible Curator, Cairn Curator, Eureka sweep all use opportunistic background maintenance pattern. Different data models (events vs facts), same algorithm family. Can share decay formulas when kernel extraction happens (v1.5+).

**Three Coordination Gates (Pre-Crucible Sprint 2):**
- G1: Graham convenes event-substrate topology lock (merge vs federate)
- G2: Cassima updates Crucible PRD §1 to reference shared `SessionId`
- G3: Graham + Cassima lock Crucible `Decision` schema mappability to `DecisionRecord`

**Architectural Verdict:** Systems are compatible IF coordinated before Crucible's L1 WAL lands (sprint 2). All three gates must close before parallel implementation. Deferred coordination = expensive retrofit.

**Interesting-to-Eureka Findings:**
- Crucible's Coordinator-equivalent (sub-task fan-out) is reference architecture for Eureka v2 multi-agent learning
- Aperture push/pull model (notification + dashboard) is prior art for Eureka v1.5 commitment surfacing UX
- Conformance corpus infrastructure (curated sessions + CI replay + drift measurement) is exactly what Eureka US-1 eval needs — reuse, don't rebuild

**Memo Location:** `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md`

**Key Learning:** When two PRDs land simultaneously, substrate-level coordination MUST happen before sprint 2 (when storage layers lock). Waiting until "both ship, then integrate" guarantees one system's retrofit. The coordination cost is O(hours); the retrofit cost is O(weeks). Front-load the hard decisions.

### 2026-05-26: Shared Substrate Revision — G4 Coordination Protocol
**Task:** Revise three critical gates (G1/G2/G3 from overlap memo) in light of Aaron's shared-substrate directives.

**Context:**
- Original overlap memo assumed mem/ and harness/ were separate repos → substrate extraction needed
- Aaron clarified: same repo (`akubly/stunning-adventure`), two clones
- New directives: (1) same repo, (2) plan to share Cairn/Forge/Types from start, (3) separate v1s, (4) dogfood timing open

**Revised Gates:**

1. **G4: Cross-Project Coordination Protocol (NEW — TOP CONCERN)**
   - Problem: When Crucible changes cairn/forge/types, Eureka must know. When Eureka changes, Crucible must know.
   - Mechanism: (a) Shared CHANGELOG per package, (b) GitHub label `shared-substrate` triggers dual-Lead review, (c) Pre-merge Slack handoff in #squad-coordination, (d) Breaking changes require 15-min sync
   - Status: Unblocked (design ready). Graham configures tooling (<1h).
   - Owner: Graham (tooling) + Cassima + Genesta (enforce protocol).
   - **This is now the single most important gate** — operational risk starting sprint 2.

2. **G1: Event Schema Co-Design (REVISED — MEDIUM RISK)**
   - Original: Dual append-only logs (Crucible WAL vs Cairn event_log) in separate repos → collision
   - Revised: Single table, discriminator column. `EventType` enum with namespace convention (`crucible:request`, `eureka:recall`, etc.).
   - Concrete shape: Single `events` table with `event_type` discriminator. Crucible's 5 primitives → 5 enum values. Eureka future events added without migration.
   - Alternative (rejected): Two tables → loses total ordering, complicates Eureka Path 2 ingestion.
   - Gate: Before sprint 2, 15-min sync (Roger + Graham + Genesta) to lock EventType namespace.
   - Status: Unblocked (design ready).

3. **G2: SessionId Brand (REVISED — TRIVIALLY SOLVED)**
   - Original: Both PRDs mandate `SessionId` in `@akubly/types` → collision if separate repos.
   - Revised: **CLOSED.** Same repo = same file. Eureka v5 already defined it (FR-13, R8). Crucible imports as-is.
   - Nuance: Eureka's lens-framing guardrails (schema comments, ESLint) are Eureka-internal. Crucible ignores them; brand is neutral.
   - Status: Closed. No coordination needed.
   - Owner: Cassima (update Crucible PRD to reference existing type, not define new).

4. **G3: Decision Schema Triple Ownership (REVISED — STILL REAL)**
   - Original: Three schemas (Forge DecisionRecord, Eureka DecisionPayload, Crucible Decision primitive) → bridge needed.
   - Revised: Still correct, now simpler. Crucible must emit Forge `DecisionRecord` at write time (bridge pattern) so Eureka Path 2 can learn from Crucible sessions.
   - Concrete shape: `recordDecision` function writes both (a) Crucible event to cairn, (b) Forge DecisionRecord with `{source: 'crucible'}` metadata.
   - Key invariant: Forge DecisionRecord is shared decision vocabulary. Crucible writes, Eureka reads. Crucible event is internal.
   - Gate: Before sprint 3, 15-min sync (Cassima + Graham + Genesta) to review Forge API.
   - Status: Unblocked (design ready).

**Revised Verdict:**
- G2 closed (same-repo directive solved it).
- G1/G3 unblocked (designs ready, need coordination meetings).
- G4 new top concern: operational risk without coordination protocol. Must land before sprint 2.

**Recommendation:**
1. This week: Graham configures `shared-substrate` label + webhook (1h).
2. Before sprint 2: Lock EventType namespace (15-min sync).
3. Before sprint 3: Review Forge DecisionRecord API (15-min sync).

**Key Learning:** Shared-from-start is architecturally simpler than extract-later (no migration), but operationally requires active coordination. G4 protocol is the price of parallel dev on shared substrate. Without it, one team breaks the other. With it, cost is <30min/week. Coordination is cheap; retrofit is expensive.

**Memo Location:** `.squad/decisions/inbox/genesta-shared-substrate-revision.md`

### 2026-05-26T19:30:00-07:00: Shared-substrate revision round merged — G4 protocol is load-bearing, dogfood timing and schema freeze pending Aaron
