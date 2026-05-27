# Project Context

- **Owner:** {user name}
- **Project:** {project description}
- **Stack:** {languages, frameworks, tools}
- **Created:** {timestamp}

## Team Updates

### 2026-05-26: Crucible ↔ Eureka Architectural Coordination (Graham Knight, Genesta, Crispin, Edgar, Cassima)

**Cross-Project Overlap Analysis Completed.** Four specialists (Genesta=Cognitive Systems, Crispin=KR, Edgar=Learning, Cassima=PM) analyzed Crucible PRD v1-DRAFT against Eureka PRD v5-final. Convergent finding: both depend on shared substrate (Cairn, Forge, types) and both define overlapping session/decision/improvement semantics. Eureka is Crucible's future memory layer, but undeclared repository dependency exists (Crucible assumes Forge in `harness` but Forge lives in `mem`).

**Three blockers require immediate architectural coordination before implementation:**

1. **Repository ownership** — Crucible cannot ship v1 without resolving Cairn/Forge duplication vs. centralization.
2. **Event schema topology** — Crucible's L1 WAL vs Cairn's existing event_log creates dual-write trap (Option A: merge to Cairn; Option B: federate in harness).
3. **Decision/SessionId schema** — Both mandate Decision and SessionId types; Crucible needs renames (Decision → ChoiceEvent, Artifact → ContentBlob) to avoid namespace collisions.

**Safe convergences identified:** Prescriber pattern mirrors existing Forge family (share substrate). Learning loops are complementary (Crucible's recorded sessions are Eureka's training data; wiring Path 2 ingestion before dogfood prevents manual friction).

**Action Required:** Aaron locks (Q1) repository topology, (Q2) v1 scope boundary, (Q3) dogfood sequencing. Graham convenes with Genesta + Roger pre-sprint-2 to lock event-substrate path (Merge vs Federate). Detailed findings in `.squad/decisions.md` § Open Decisions + `.squad/decisions/inbox/` (4 agent analyses).

---

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->
