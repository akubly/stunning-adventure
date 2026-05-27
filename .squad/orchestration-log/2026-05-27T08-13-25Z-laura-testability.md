# Orchestration Log: laura-testability

**Agent:** Laura (Testability / QA Specialist)  
**Model:** claude-sonnet-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/50-testability.md` | ✅ Created | 27.2 | §50: Test strategy, acceptance criteria coverage, integration testing approach, known gaps |

**Total authorship:** ~27.2KB (section)

## Key Outcomes

1. **v1 acceptance criteria testability assessed** — §50 evaluates all Eureka PRD acceptance criteria:
   - **US-1 (search):** 12/12 ACs testable immediately (all unit-level, no integration gate)
   - **US-2 (sessions):** 10/12 ACs testable immediately; 2 deferred to v1.5+ (continuous session context requires M3+ schema)
   - **FR-10 (decision facts):** 8/10 ACs testable immediately; 2 deferred to Forge adapter availability
   - **FR-13 (shared SessionId):** 4/4 ACs testable immediately (brand validation, type inference)
   - **FR-14 (Forge ingestion):** 3/3 ACs testable immediately (once Forge Courier provides test fixtures)
   - **Overall v1 readiness:** 37/41 ACs testable immediately (90% coverage), 4 ACs deferred to v1.5+

2. **Test pyramid defined** — §50 specifies:
   - **Unit tests (60%):** Fact schema, ranker scoring, trust mutations, edge traversal, tier filtering
   - **Integration tests (25%):** SQLite fact store, FTS5 indexing, sweep simulation, trust event streams
   - **End-to-end tests (15%):** CLI recall, ingest-decisions adapter, session fact creation, cross-tier queries
   - **Test infrastructure:** Jest (unit/integration), custom CLI harness (E2E), snapshot testing for schema changes

3. **Integration testing strategy specified** — §50 defines:
   - **Fact store mock:** In-memory SQLite (`:memory:`) for rapid test cycles
   - **Sweep simulation:** Deterministic clock (fake timers) for cadence-based sweep
   - **Trust events:** Mock event stream (confirm/contradict/verify) for trust mutation testing
   - **Forge adapter:** Fixture-based DecisionRecords (JSON test files) for Path 1 ingestion
   - **Session facts:** Fixture-based session structures for tier-scoped recall testing

4. **Known test gaps documented** — §50 lists:
   - **Gap 1: Distributed session observability** — No test coverage for multi-process sessions (Copilot CLI spawns worker processes). Deferred to v1.5+ with session-instrumentation work.
   - **Gap 2: Crucible integration** — No test coverage for Crucible DecisionRecords (Crucible not shipping until v1 dogfood later). Forge adapter fixtures are Eureka-only. Path 2 (future Crucible bridge) untested.
   - **Gap 3: Performance testing** — No benchmark suite for recall latency (k=10, full tier fan-out). Deferred to v1.5 with metric baseline.
   - **Gap 4: Offline reconciliation** — bridge_ledger reconciliation logic untested (placeholder schema in v1, logic deferred to v1.5+).

5. **Continuous integration planned** — §50 specifies:
   - **GitHub Actions workflow:** Run on every PR (unit+integration), daily full-suite run (unit+integration+E2E)
   - **Coverage targets:** 85% line coverage (unit+integration combined), exceptions documented in .nycrc
   - **Regression testing:** Snapshot tests for schema changes, manual review gate for breaking fact-store migrations

## Tensions Raised

1. **10/12 US-2 acceptance criteria have deferred testability** — §50 flags:
   - **Problem:** US-2 (sessions) mandates "continuous session context" (FR-13 line 373–393). Two ACs require:
     - AC-1.3: "Session facts persist across CLI process boundaries" (multi-process observability)
     - AC-2.2: "Session facts auto-promoted from session close events" (requires M3 session-end hooks)
   - **Current status:** M3 (sessions) is scheduled for post-M2, but US-2 is v1 acceptance criteria
   - **Options:**
     - **Option A:** Delay US-2 to v1.5+ (ship v1 with sessions stubbed; use `kind=session` but no cross-process correlation)
     - **Option B:** Pull M3 into M1/M2 (prioritize sessions over sweep/decision bridges)
     - **Option C:** Accept reduced test coverage for US-2 v1 (implement sessions, ship with 10/12 ACs testable, 2 ACs gated on v1.5)
   - **Recommendation:** Option C (current decision) — ship US-2 v1 with 10/12 testable; 2 ACs deferred. Document risk in release notes.

2. **Forge adapter testability blocked by Crucible** — §50 notes:
   - **Problem:** Path 1 (Forge DecisionRecords) is v1 scope, but test fixtures depend on Crucible's DecisionRecord format
   - **Current status:** Crucible PRD v1-DRAFT is finalized, but Crucible repo is `harness/` (not shipped to Eureka team yet)
   - **Workaround:** Laura will use Eureka v5 example DecisionRecords (manually authored) for fixture-based tests; upgrade to real Crucible fixtures in v1.5 once Crucible lands
   - **Action:** Cassima to provide Crucible DecisionRecord schema snapshot for Eureka test fixtures (shared via Forge package, once substrate ownership is resolved)

3. **Multi-process session observability untested** — §50 identifies:
   - **Problem:** Copilot CLI may spawn worker processes during session. Eureka session-facts should correlate across processes (same `session_id`). No test harness for multi-process sessions.
   - **Current status:** Single-process testing is comprehensive; multi-process gap is known and deferred to v1.5+
   - **Impact:** v1 dogfood may reveal edge cases (process boundaries, inter-process fact correlation) that tests don't cover
   - **Recommendation:** Instrument Aaron's v1 dogfood to capture multi-process session patterns; inform v1.5 test strategy

4. **Performance baseline missing** — §50 flags:
   - **Problem:** No benchmark suite for recall latency (FTS5 query time, tier fan-out cost, BM25 scoring)
   - **Current status:** Deferred to v1.5 with metric baseline (establish v1 performance envelope, then optimize for v1.5)
   - **Risk:** v1 recall may be slower than expected; users discover performance issues in dogfood rather than in test lab
   - **Recommendation:** Add informal latency checks in E2E tests (warn if single recall takes >500ms); document as future benchmark baseline

## Cross-Section Dependencies

- Depends on: 
  - **All sections (§00–§70)** for acceptance criteria mapping
  - **Cassima (§70)** for PRD acceptance criteria alignment + Crucible fixture schema
  - **Roger (§40)** for search+integration API stability (finalized before test authorship)

- Enables:
  - **Graham (assembly phase)** — testability assessment can inform milestone risk assessment
  - **Aaron (dogfood planning)** — 37/41 ACs testable v1, 4 ACs gated on v1.5; can adjust expectations

- Blocks: **Crucible DecisionRecord schema — needed for Forge adapter test fixtures (Cassima to provide)**

## Liaison Notes

- **V1 AC testability: 37/41 (90%)** — high coverage; 4 ACs deferred to v1.5+ (multi-process sessions + reconciliation)
- **Test pyramid defined:** 60% unit, 25% integration, 15% E2E
- **Known gaps documented:** Distributed session observability, Crucible integration, performance testing, bridge ledger reconciliation
- **US-2 risk noted:** 10/12 ACs testable v1; 2 ACs gated on session-end hooks (M3+). Documented as acceptable deferral.
- **Forge adapter gap:** Test fixtures need Crucible DecisionRecord schema (once Cassima provides via Forge)
- **Multi-process session testing:** Deferred to v1.5; dogfood will inform test strategy

---

**Signed:** Laura  
**Confidence:** HIGH on test strategy; HIGH on unit/integration coverage; MEDIUM on E2E coverage (depends on fixture availability); BLOCKED on Crucible DecisionRecord schema  
**Next step:** Round 2 assembly (parallel) + await Cassima's Crucible fixture schema + finalize E2E test harness design with Graham
