# Orchestration Log: cassima-prd-alignment

**Agent:** Cassima (Product Manager / PRD Alignment Lead)  
**Model:** claude-haiku-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/70-prd-alignment.md` | ✅ Created | 23.2 | §70: Acceptance criteria traceability, v1/v1.5 scope mapping, risk register |
| `.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md` | ✅ Created | 19.8 | **CRITICAL:** Shared substrate ownership unresolved (SessionId brand, Cairn/Forge duplication) |

**Total authorship:** ~43KB (section + critical blocker memo)

## Key Outcomes

1. **PRD acceptance criteria fully traced** — §70 maps all Eureka v5-final ACs to technical design sections:
   - **US-1 (search):** 12 ACs → §40 (Roger integration)
   - **US-2 (sessions):** 12 ACs → §60 (Valanice UX) + §13 (session-facts schema, deferred)
   - **FR-10–FR-14:** All FR acceptance criteria → §20–§40 (cross-section trace)
   - **Traceability:** 100% of PRD acceptance criteria have corresponding design section + responsible agent

2. **v1/v1.5 scope boundary validated** — §70 confirms:
   - **v1 ship criteria:** US-1 fully testable (12/12 ACs), US-2 partially testable (10/12 ACs, 2 deferred to v1.5)
   - **v1.5 backlog:** 4 deferred ACs (multi-process sessions, auto-promotion from session-end events, sweep-coupled triggers, bridge ledger reconciliation)
   - **Risk acceptance:** Ship v1 with 10/12 US-2 ACs testable; document remaining ACs as v1.5 commitment

3. **Risk register established** — §70 documents:
   - **Risk 1 (CRITICAL):** Shared substrate ownership unresolved (SessionId brand, Cairn/Forge duplication)
     - Mitigation: Three options (A=monorepo, B=submodule, C=npm), awaiting Aaron decision
     - Impact if unresolved: Cannot finalize Forge adapter; blocks Eureka + Crucible implementation
   - **Risk 2 (HIGH):** Event schema collision (Crucible's L1 WAL vs Cairn's event_log)
     - Mitigation: Pre-sprint-2 sync (Graham/Genesta/Roger) to lock event-substrate topology
     - Impact if unresolved: Dual-write trap; bridge ledger reconciliation logic changes
   - **Risk 3 (HIGH):** Decision schema dual ownership (Crucible Decision vs Forge DecisionRecord vs Eureka DecisionPayload)
     - Mitigation: Naming clarification (Crucible rename to ChoiceEvent); freeze DecisionRecord in v1
     - Impact if unresolved: Namespace collision in shared codebases; adapter re-implementation
   - **Risk 4 (MEDIUM):** Performance baseline missing (recall latency untested)
     - Mitigation: Informal latency checks in E2E tests; formal baseline in v1.5
     - Impact if unresolved: v1 dogfood reveals slowness; users perceive poor performance

4. **Cross-project contingency planning** — §70 acknowledges:
   - Eureka v1 ships independently of Crucible v1 (parallel but decoupled)
   - If Crucible slips, Eureka v1 ships with "Crucible adapter" stubbed (DecisionRecords manually provided, or omitted)
   - If substrate ownership isn't resolved by sprint start, Eureka v1 ships with single Forge instance (assumes monorepo path A)

5. **Crucible overlap analyses synthesized** — §70 summarizes findings from Genesta, Crispin, Edgar, Roger:
   - **Structural independence:** Crucible's L1 WAL and Eureka's fact store are orthogonal (different tables, different schemas)
   - **Shared substrate:** SessionId brand is only load-bearing integration point (Cairn sessions.id = Eureka session-fact session_id = Copilot CLI UUID)
   - **Safe parallelization:** Both projects can implement in parallel with storage fork directive (Crucible-only Cairn, Eureka-only fact storage)
   - **Risk concentration:** Event schema topology is highest-risk decision for v1.5 Path 2 ingestion (WAL consumption)

## Tensions Raised

1. **CRITICAL: Shared substrate ownership blocker** — §70 + cassima-t7 memo expose:
   - **Problem:** Eureka v5 mandates SessionId brand in `@akubly/types`. Crucible also needs it. But both repos have their own `packages/types/`. Duplication or ownership?
   - **Options:**
     - **Option A (Monorepo):** Merge `mem/` and `harness/` into one `@akubly/` monorepo. Single source of truth.
     - **Option B (Submodule):** Extract `cairn/`, `forge/`, `types/` into third repo (`akubly-substrate`). Both repos submodule it.
     - **Option C (NPM):** Publish `@akubly/types`, `@akubly/cairn`, `@akubly/forge` as versioned npm packages.
   - **Cassima's recommendation:** Option A (monorepo) or Option B (submodule) in that order. Option C is over-engineered for v1.
   - **Impact:** **BLOCKS Eureka implementation day 1.** Cannot start coding without knowing whether to import `mem/packages/types` or follow a different pattern.
   - **Action required:** Aaron chooses A/B/C and documents it before sprint start.

2. **HIGH: Event schema collision (pre-sprint-2 coordination gate)** — §70 notes:
   - **Problem:** Crucible's L1 WAL (mandatory) vs Cairn's event_log (existing). Two append-only logs in same monorepo create dual-write trap.
   - **Options:**
     - **Option A (Merge):** Crucible's primitives become eventType values in Cairn's event_log
     - **Option B (Federate):** Crucible ships in harness/ repo; federation boundary is explicit
   - **Current status:** Genesta's overlap analysis recommends "do NOT ship dual logs in same repo"
   - **Action required:** Pre-sprint-2 sync (Graham/Genesta/Roger) to lock event-substrate topology. Decision feeds into Eureka bridge_ledger design (FR-7.4).

3. **HIGH: Activity vocabulary discrepancy** — §70 flags:
   - **Problem:** Eureka PRD v5 names 9 activities; §10 specifies only 4 are v1 (rest deferred to v1.5). Is this correct?
   - **Genesta's validation:** Yes, PRD-compliant. v1 ships with integrate/recall/rerank/commit; sweep/contemplate/evict/retire/evolve are v1.5+.
   - **Cassima's confirmation:** Acceptance criteria for v1 are achievable with 4 activities (no AC depends on sweep or contemplate in v1).
   - **Status:** Resolved. Documented in §70 as approved scope boundary.

4. **MEDIUM: Performance baseline missing** — §70 acknowledges:
   - **Problem:** No benchmark suite for recall latency. v1 dogfood may reveal slowness.
   - **Mitigation:** Informal latency checks in E2E tests. Formal baseline in v1.5.
   - **Risk:** Users perceive poor performance; affects v1 adoption.
   - **Cassima's recommendation:** Accept this risk for v1. Prioritize v1 ship over performance polish.

## Cross-Section Dependencies

- Depends on: 
  - **All sections (§00–§70)** for acceptance criteria traceability
  - **Genesta (§10)** for activity scope validation
  - **Laura (§50)** for testability assessment (37/41 ACs testable v1)
  - **Crucible PRD analysis** (cross-project, not cross-section)

- Enables:
  - **Graham (assembly phase)** — risk register and PRD traceability can inform release notes + v1.5 planning
  - **Aaron (sprint planning)** — v1 scope locked; substrate ownership decision needed pre-sprint

- Blocks: **Substrate ownership decision (Aaron) — cannot finalize Forge adapter without repo topology clarity**

## Liaison Notes

- **PRD alignment: 100% trace** — All ACs mapped to design sections; responsible agents identified
- **v1 scope validated:** US-1 fully (12/12), US-2 partial (10/12 deferred); ~37/41 ACs testable v1
- **CRITICAL blocker:** Substrate ownership (SessionId brand, Cairn/Forge duplication) unresolved. Three options documented; awaiting Aaron decision.
- **HIGH blocker:** Event schema topology (Crucible WAL vs Cairn event_log) requires pre-sprint-2 sync.
- **HIGH tension:** Decision schema dual ownership (naming collision). Recommendation: Crucible rename to ChoiceEvent.
- **Risk register:** Four risks documented; three blockers require immediate coordination decisions.

---

**Signed:** Cassima  
**Confidence:** HIGH on PRD traceability; HIGH on v1 scope boundary; BLOCKED on substrate ownership (Aaron decision) and event schema topology (pre-sprint-2 sync)  
**Next step:** Round 2 assembly (parallel) + Aaron decides substrate ownership (A/B/C) + Graham convenes pre-sprint-2 sync (event schema topology)
