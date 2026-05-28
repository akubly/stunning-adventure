# Orchestration Log: genesta-activities-tiers

**Agent:** Genesta (Cognitive Systems / Activities Lead)  
**Model:** claude-sonnet-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/10-activities-and-tiers.md` | ✅ Created | 24.1 | §10: Activities lifecycle, tier semantics, attention budget, integration pathway |
| `.squad/decisions/inbox/genesta-erasmus-evaluation.md` | ✅ Created | 26.8 | Evaluation of Erasmus's narrower substrate freeze proposal (SessionId + DecisionRecord only) |
| `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md` | ✅ Created | 18.5 | Architectural overlap analysis: five critical overlaps, three require immediate coordination |

**Total authorship:** ~69KB (section + two decision memos)

## Key Outcomes

1. **Activities lifecycle documented** — §10 specifies:
   - **v1 activities:** `integrate`, `recall`, `rerank`, `commit` (first-class)
   - **v1.5+ deferred:** `contemplate`, `sweep`, `evolve`, `evict`, `retire` (stubbed; depends on M2+ release)
   - Activity vocabulary aligned with Eureka v5-final (9 activities total across v1+v1.5)

2. **Tier semantics locked** — Three-tier storage model (agent/user/project) with:
   - Tier 1 (agent): Personal session facts, integrated decisions
   - Tier 2 (user): Cross-session patterns, Copilot-user-wide generalities
   - Tier 3 (project): Codebase facts, project-wide decisions
   - Recall fans out agent → user → project with early exit (k=10 default)

3. **PRD alignment verified** — All Eureka v5-final acceptance criteria (US-1, US-2, FR-*) mapped to §10 implementation paths.

4. **Crucible coordination initiated** — Overlap analysis identifies:
   - **HIGH RISK:** Event schema collision (Crucible's L1 WAL vs Cairn's event_log)
   - **BLOCKER:** SessionId brand collision (same primitive, different repos)
   - **HIGH:** Decision schema dual ownership (Crucible Decision vs Forge DecisionRecord vs Eureka DecisionPayload)
   - **CONVERGENT:** Prescriber pattern convergence (can share substrate)
   - **CONVERGENT:** Sweep mechanics kinship (same algorithm family, different data)

5. **Narrower substrate freeze evaluated** — Genesta's detailed analysis of Erasmus's proposal:
   - ✅ **ACCEPT with three amendments:**
     - A1: Eureka-aware prescriber must be opt-in (not default-wired)
     - A2: SessionId validation rules frozen (UUID v4 format + validators)
     - A3: DecisionRecord tolerance contract frozen (forward/backward-compatible)
   - ✅ G4-lite sufficient (CODEOWNERS + CHANGELOG + Slack handoff)

## Tensions Raised

1. **Activity vocabulary discrepancy — v1 scope** — Eureka PRD v5 specifies 9 activities; §10 as authored includes only 4 v1 activities (rest deferred to v1.5). Genesta validates this is correct per PRD, but **flagged for downstream confirmation** (Roger, Laura, Cassima) that v1 acceptance criteria are achievable with 4 activities.

2. **Event schema collision (HIGHEST PRIORITY)** — Crucible's mandatory L1 WAL (§A.2, hybrid CBOR + BLAKE3 CAS) collides with Cairn's existing event_log. Two pathways:
   - **Option A (Merge):** Crucible primitives become eventType values in Cairn's event_log
   - **Option B (Federate):** Crucible lives in harness/ repo isolation; federation boundary is explicit
   - **Action required:** Graham convenes pre-sprint-2 sync to lock event-substrate topology

3. **SessionId brand collision (BLOCKER)** — Both Eureka v1 and Crucible need SessionId in @akubly/types. Eureka ships first; Crucible may assume different validation/schema. Three options (A=monorepo, B=submodule, C=npm) need Aaron's decision before Eureka or Crucible implementation starts.

4. **Decision schema dual ownership (HIGH)** — Naming collision on "Decision" (Crucible primitive vs Forge DecisionRecord vs Eureka DecisionPayload). Recommend: Crucible rename to ChoiceEvent; Eureka avoid "artifact" in public API.

## Cross-Section Dependencies

- Depends on: 
  - **§00 (Graham)** for milestone boundaries validation
  - **Cassima (§70)** for PRD acceptance criteria scope
  - **Crucible PRD analysis** (cross-project, not cross-section)

- Enables:
  - **Roger (§40)** — activity vocabulary confirmed; BM25 ranker scope locked
  - **Laura (§50)** — testability scope aligned with 4 v1 activities
  - **Cassima (§70)** — PRD alignment section can reference activities inventory

- Blocks: None (ready for team feedback)

## Liaison Notes

- **Activity vocabulary confirmed:** 9 total across v1+v1.5 (PRD-compliant)
- **Tier semantics locked:** Agent/user/project with recall fan-out + early exit
- **Two cross-project decision memos** sent to Aaron + Graham for scheduling coordination sync pre-sprint-2
- **Narrower substrate freeze:** Genesta recommends ACCEPT with A1/A2/A3 amendments; forwarded to Cassima for PM alignment

---

**Signed:** Genesta  
**Confidence:** HIGH on §10 content; HIGH on overlap analysis; MEDIUM on timeline for coordination decisions (depends on Aaron schedule)  
**Next step:** Round 2 assembly (parallel) + pre-sprint-2 Graham/Genesta/Roger sync to lock event-substrate path
