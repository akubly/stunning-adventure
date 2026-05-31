# Project Context

- **Owner:** {user name}
- **Project:** {project description}
- **Stack:** {languages, frameworks, tools}
- **Created:** {timestamp}

## Team Updates

### 2026-05-27: Eureka v0.1 Technical Design — Assembled with 4 Critical Blockers (Graham, Genesta, Crispin, Edgar, Roger, Laura, Valanice, Cassima)

**Eureka v0.1 technical design assembled.** Eight domain specialists authored 8 sections (§00–§70) + 3 ADRs spanning architecture, schema, learning systems, integration, testability, UX, and PRD alignment. Total: ~198KB design content, 100% PRD acceptance criteria traced, 37/41 ACs testable in v1 (90% coverage).

**Four critical blockers identified; require immediate Aaron decisions:**

1. **OQ-1 (CRITICAL) — Shared substrate ownership** — `@akubly/types`, `cairn/`, `forge/` duplicated in `mem/` and `harness/` repos. Three options: A=monorepo (recommended), B=submodule, C=npm packages. **Decision required THIS WEEK before M0 scaffolding.**
   - **Update 2026-05-27 — RESOLVED:** Aaron accepted Option A (Monorepo). See ADR-0002 (`docs/eureka/adrs/0002-shared-substrate-ownership.md`) and the merged decision in `.squad/decisions.md`. M0 scaffolding unblocked.

2. **OQ-2 (MEDIUM) — Event schema topology** — Crucible's L1 WAL vs Cairn's event_log create dual-write trap. Options: A=merge to Cairn (Crucible primitives as eventType values), B=federate (Crucible in harness isolation). **Pre-sprint-2 sync required (Graham/Genesta/Roger).**

3. **OQ-3 (MEDIUM) — Decision/SessionId schema dual ownership** — Crucible's Decision primitive vs Forge DecisionRecord vs Eureka DecisionPayload. Recommendation: Crucible rename Decision → ChoiceEvent; freeze DecisionRecord v0 with tolerance contract (forward/backward-compatible).

4. **OQ-4 (MEDIUM) — Dogfood sequencing** — Crucible-first or Eureka-first? Parallel or staggered? **Aaron clarifies timeline.**

**Safe convergences confirmed:** Prescriber pattern (Crucible Router mirrors Forge family; can share substrate). Learning loops (Crucible's recorded sessions = Eureka's training data; Path 2 ingestion wiring enables productive relationship). Structural independence verified; parallel implementation is safe with storage fork directive.

**Round 2 status:** Graham's assembly complete. 8 orchestration logs document each agent's outcomes, tensions, and cross-section dependencies. Session log at `.squad/log/2026-05-27T08-13-25Z-eureka-tech-design-v01.md`. All section work merged into canonical `docs/eureka/technical-design.md`.

**Next actions:** (1) Aaron decides OQ-1–OQ-4. (2) Graham convenes pre-sprint-2 event-schema sync. (3) M0 scaffolding can begin once OQ-1 is locked.

---

### 2026-05-26: Crucible ↔ Eureka Architectural Coordination (Graham Knight, Genesta, Crispin, Edgar, Cassima)

**Cross-Project Overlap Analysis Completed.** Four specialists (Genesta=Cognitive Systems, Crispin=KR, Edgar=Learning, Cassima=PM) analyzed Crucible PRD v1-DRAFT against Eureka PRD v5-final. Convergent finding: both depend on shared substrate (Cairn, Forge, types) and both define overlapping session/decision/improvement semantics. Eureka is Crucible's future memory layer, but undeclared repository dependency exists (Crucible assumes Forge in `harness` but Forge lives in `mem`).

**Three blockers require immediate architectural coordination before implementation:**

1. **Repository ownership** — Crucible cannot ship v1 without resolving Cairn/Forge duplication vs. centralization.
2. **Event schema topology** — Crucible's L1 WAL vs Cairn's existing event_log creates dual-write trap (Option A: merge to Cairn; Option B: federate in harness).
3. **Decision/SessionId schema** — Both mandate Decision and SessionId types; Crucible needs renames (Decision → ChoiceEvent, Artifact → ContentBlob) to avoid namespace collisions.

**Safe convergences identified:** Prescriber pattern mirrors existing Forge family (share substrate). Learning loops are complementary (Crucible's recorded sessions are Eureka's training data; wiring Path 2 ingestion before dogfood prevents manual friction).

**Action Required:** Aaron locks (Q1) repository topology, (Q2) v1 scope boundary, (Q3) dogfood sequencing. Graham convenes with Genesta + Roger pre-sprint-2 to lock event-substrate path (Merge vs Federate). Detailed findings in `.squad/decisions.md` § Open Decisions.

---

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
