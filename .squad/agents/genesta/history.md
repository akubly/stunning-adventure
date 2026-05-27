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
