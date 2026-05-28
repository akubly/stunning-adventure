# Laura — History (Summarized)

## Summary

**Total entries:** 5 major contributions spanning Phase 2-4.6 testing + Round 2 brain system consulting + Round 2 roster proposal

| Date | Event | Status |
|------|-------|--------|
| 2026-04-28 | Phase 2 Runtime Verification | ✅ Completed |
| 2026-04-29 | Phase 3 Cross-Module Integration | ✅ Completed |
| 2026-05-02–2026-05-04 | Phase 4.5–4.6 Review Cycle (Feedback Loop + Change Vectors) | ✅ Completed |
| 2026-05-22 | Brain System Consulting (Test Architecture Lens) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (Test Advisor Role) | 🟡 Proposal pending Aaron |

**Key themes:**
- Contract-first testing: Inline implementations before real modules, switch imports with zero test changes
- Phase 4.6 lifecycle: 15 findings consolidated, 3-cycle review with Lockout-compliant cross-assignment
- Brain project: Proposed on-call Test Advisor role, applying contract-first patterns to stochastic/agentic testing
- Brain roster: Proposed Test Advisor (advisory, on-call) for Brain project with primary Cairn commitment

**Recent decision:** Laura positioned as on-call test architect for Brain; contract-first patterns and coordinated testing expertise directly applicable to learning/memory activities validation. Primary focus: Cairn.

## Project Context

- **Project:** Cairn + Forge — an agentic software engineering platform
- **Tech Stack:** TypeScript, Node.js 20+, npm workspaces monorepo, Vitest, SQLite (better-sqlite3), MCP SDK, Copilot SDK
- **User:** Aaron Kubly
- **Joined:** 2026-04-28

## Test Architecture Patterns

**Existing test patterns (from @akubly/cairn):**
- Framework: Vitest with itest run
- Config: packages/cairn/vitest.config.ts
- Test location: packages/cairn/src/__tests__/
- DB tests: In-memory SQLite via getDb(':memory:')
- 427 tests across 15 domains

**Contract-first testing approach:**
- Inline contract implementations establish behavioral expectations
- When real modules built, tests switch from inline to real imports
- Any behavioral divergence immediately surfaces as test failures
- Phase 3 pattern: define expected API types, inline implementations, then swap imports

**Key testing decisions:**
- Mock SDK for unit tests, live CLI for integration tests
- Bridge event type discovery: always verify names against production EVENT_MAP
- Mock session unsubscribe semantics: fire-and-forget wiring ≠ testing unsubscribe
- ForgeClient.stop() wraps in try/catch (resilient), ForgeSession.disconnect() throws directly

## Phase-by-Phase Summary

### Phase 2 Runtime Verification (2026-04-28)

- 32 contract tests: CairnBridgeEvent shapes, ProvenanceTier, DecisionRecord, SessionIdentity, DBOMArtifact, TelemetrySink
- 22 bridge tests: EVENT_MAP (22 entries), provenance classification, unmapped event handling, edge cases

### Phase 3 Cross-Module Integration (2026-04-29)

- 87 new tests: ForgeClient session lifecycle, bridge wiring, hook composition, message sending, disconnect lifecycle, model switching, token budget tracking
- Full forge suite: 268 tests passing
- Key finding: mock session returns no-op unsubscribe stub (only fire-and-forget wiring)

### Phase 4.5 Feedback Loop (2026-05-02)

- Delivered: 36 integration/convergence/regression/efficiency tests in eedback-loop.test.ts
- Design: convergence asserted by monotone response curves (hint count ↓ as drift ↓), not terminal states
- Process-invariant testing: simulate operator effect at profile level
- L5 tests catch O(N) regressions
- **Total: 990 tests passing (512 forge, 478 cairn)**

### Phase 4 Export Pipeline (2026-05-01)

- Rewrote 62 contract tests to match spec API surface
- Test groups: renderFrontmatter (8), compileSkill (6), extractStage (4), stripStage (5), attachStage (3), validateStage (4), runExportPipeline (15), persistence (3), integration (5), edge cases (9)
- Key discovery: stripStage preserves relative paths, only strips absolute paths
- 37 production tests from Roger's modules also in file

### Phase 4.6 Change Vector Learning (2026-05-03)

**Wave 1:**
- L1–L5: Migration 012 tests, CRUD tests, prescriber integration, Curator e2e, weight consistency regression
- 93 new tests across 5 files; total: 1099 passing

**Wave 2:**
- Flagged inconsistency: summarizeChangeVectors returns confidence=0 vs computeConfidenceBoost(0) = 1.0
- Analysis: contract ambiguity (level vs boost semantics), not logic error
- Status: SATISFIED WITH CAVEAT

**Wave 3:**
- Upgraded all tests per defect verdict (renamed .confidence → .confidenceBoost)
- Replaced it.todo with passing test
- Added ChangeVectorSummary schema regression suite
- **Final: 1102 passing tests**

**Wave 4 (Cycle 2 — Phase 4.6, 2026-05-03):**
- 15 findings from code-panel review assigned; Rosella + Alexander fixes landed first
- Pre-existing failing test: UNIQUE constraint caused "returns multiple vectors" to fail → fixed
- New tests: 548 cairn + 585 forge (1133 total)
  - #1 deltaCost per-session normalization (curatorVectors.test.ts)
  - #2 confidence clamp / never-attenuate (changeVectors, weight-consistency, prescribers-vectors)
  - #3 sessionsObserved as delta (curatorVectors.test.ts)
  - #4 UNIQUE(hint_id) constraint (migration012.test.ts)
  - #5 two-tier sort — matched before unmatched (prescribers-vectors.test.ts)
  - #6 structured ChangeVectorSweepResult diagnostics (curatorVectors.test.ts)
  - #7 category regression guard — duck-typed boundary (new: changeVectorCategoryRegression.test.ts)
  - #8 ChangeVectorSummary root re-export smoke test (contracts.test.ts)
  - #13 describe rename (weight-consistency.test.ts)
  - #14 computeConfidenceBoost removed from prescribers/index.ts — compile-time guard (implicit)
  - #15 DEFAULT_MIN_SESSIONS regression pin, both sides (changeVectors, weight-consistency)
- Two commits: one for curator/migration/prescribers; one for category regression/weight-consistency/contracts
- **Lesson:** UNIQUE constraint adds `sqlite_autoindex_*` — excluded by `NOT LIKE 'sqlite_%'` filter, so explicit index count tests are unaffected. Always check filter criteria when migration schema changes.

## Core Context

**Load-bearing patterns for future work:**
- **Contract-first testing:** Inline contract implementations before real modules. Switch imports with zero test changes; behavioral divergence surfaces immediately.
- **Field-level immutability (Eureka v1):** Committed facts have immutable content/kind/sources/provenance/created_at; mutable trust/importance/access_count/retired. Row-level "read-only" was false abstraction.
- **London-school side-effect assertions:** Return-value tests miss side-effects (accessCount++, lastAccessedAt, attention). Explicit side-effect assertions force learning contracts to be honored.
- **Metamorphic regression testing:** Test response curves (hint↓ as drift↓), not terminal states. L5 tests catch O(N) regressions; constant alignment tests prevent silent divergence.
- **Lockout rule for defects:** Author cannot fix own defect. Three-phase triage (find/decide/fix) divides ownership, improves quality.
- **Cross-boundary contracts:** Type arrays at compile time (forge category renames trigger CI errors); runtime round-trip assertions verify bidirectional consistency.
- **Cursor state tracking:** INSERT OR IGNORE idempotence: assert `alreadyComputed` on _second_ curate() call, not first.
- **SDK testing:** Unit tests use mocks; integration tests require live Copilot CLI process.

**Dependencies:** Eureka design package locked (2026-05-28); §55 TDD strategy now canonical. M1 implementation depends on side-effect test patterns taught in §55 §2.6.

## Historical Context (Phase 2–4.6)

Phases 2–4.6 testing wave (2026-04-28 to 2026-05-03):
- Phase 2: 54 contract tests (bridge, events, records)
- Phase 3: 87 integration tests (forge session lifecycle, 268 total forge tests)
- Phase 4.5: 36 feedback-loop tests (convergence curves, 990 total)
- Phase 4 Export: 62 rewritten contract tests (renderFrontmatter, compileSkill, etc., 37 production tests from Roger)
- Phase 4.6 Wave 1–3: 15 findings consolidated → 1102 total tests
- Phase 4.6 Wave 4 (Cycle 2): 15 code-panel findings landed → 1133 tests (548 cairn, 585 forge)

Key learnings consolidated into § Core Patterns above.

## Learnings

## Cycle 2 Fix Wave — Field-Level Immutability + Side-Effect Testing (2026-05-28)

**Assignment:** Land 4 findings from cycle 1 persona-review across §50 and §55:
- **I1 (§55):** Updated file paths in worked examples from forge/cairn to eureka package structure
- **B2 (§50):** Fixed committed=true immutability contradiction — replaced row-level "read-only" with field-level immutability (content/kind/sources/provenance immutable; trust/importance/access_count/retired always mutable)
- **M1 (§55):** Added §2.6 side-effect test example (accessCount, lastAccessedAt mutations)
- **M5 (§55):** Added "Alternatives Considered" subsection explaining why London-school TDD over Detroit-school

**Key learning:**
- **Field-level immutability is load-bearing for learning systems:** Committed facts need stable semantics (content can't mutate) but mutable learning signals (trust decay, attention promotion, retirement). The old "committed=true → read-only" rule was a false abstraction — it conflated two concerns (content integrity vs learning dynamics).
- **London-school forces side-effect discovery:** Return-value tests alone let side-effects (accessCount++, lastAccessedAt updates, attention promotion) go untested. Explicit side-effect assertions (§2.6 pattern) force implementers to honor the learning contracts documented in §10/§30.
- **Path corrections early = cleaner canon:** The file paths in §55 worked examples (packages/forge/src/__tests__/recall.test.ts) were pre-substrate-decision placeholders. Fixing them now (→ packages/eureka/src/activities/__tests__/recall.test.ts) prevents copy-paste errors during M0 implementation.

**Evidence of success:**
- All 4 findings landed cleanly; no deviations required
- §50 length growth: 3.2% (well under 15% budget)
- §55 length growth: 9.8% (well under 15% budget)
- §50 now correctly states field-level immutability in 6 locations (line 33, 96, 183, 188, 255, 473)
- §55 now teaches side-effect testing pattern with two worked examples (accessCount, lastAccessedAt)

## R6 Ceremony — Source-Reading Rule Lifted (2026-05-24)

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate).

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.


## Learnings

**Test isolation + cursor state:** INSERT OR IGNORE idempotence tests must assert `alreadyComputed` on the _second_ curate() call — the first sweep has changes=1, the second has changes=0 (INSERT OR IGNORE does nothing). Always track which sweep call you're asserting on.

**Cross-boundary category contract:** cairn stores `category: string`; forge uses `OptimizationCategory` union. Regression test uses `readonly OptimizationCategory[]` array — TypeScript enforces membership at compile time, runtime asserts round-trip. If forge renames a category, the array gets a type error in CI.

**Defect resolution pattern:** Lockout rule (author cannot fix own defect) prevents blind spots. Three-phase triage (find → decide → fix) divides ownership, improves quality.

**Regression guards:** L5 tests catch O(N) complexity regressions. Weight consistency tests (e.g., cairn/forge constant alignment) prevent silent divergence. Schema regression suites catch structural drift.

**Metamorphic testing:** Response curves, not terminal states. Operator effects simulated at profile level. Generic bounds catch regressions without hardcoding expected values.

**SDK testing constraint:** SDK requires running Copilot CLI process for full integration tests. Unit tests use mocks, integration tests require live CLI.

**Test organization:** Inline contract implementations before real modules exist. Switch from inline to real imports with zero test changes (only implementation changes).

## Eureka Testability Strategy (2026-05-26)

**Assignment:** Authored comprehensive test strategy document (`docs/eureka/sections/50-testability.md`, 27KB) for Eureka v1 knowledge retention system.

**Strategy pillars:**
1. **Contract-first**: Acceptance criteria (AC-1 through AC-6 from PRD v5-final) as test contract
2. **Property-based**: Trust/recency/importance dynamics tested across continuous ranges with metamorphic properties
3. **Tier boundaries**: v1 agent.db fully wired, user.db/project.db stubs (throw on write, empty on read)
4. **Integration**: Cairn↔Eureka (SessionId brand), Forge↔Eureka (bridge ledger append-only), types contract validation

**Critical edge cases prioritized:**
- Empty graph (zero facts) — FTS5 on empty index
- Conflicting trust scores — deterministic tie-breaker required
- Recency at boundary (t=0, t=now-1ms, t=now+1ms) — off-by-one risk
- Plasticity escalation — committed=true write protection enforcement
- Tier cycles — cross-tier resolution with unwired stubs (no panic, graceful empty results)
- Activity scheduling under load — concurrent recall+integrate, SQLite WAL mode validation

**Test infrastructure:**
- **Framework**: Vitest (following cairn pattern), in-memory SQLite for isolation
- **Time travel**: `vi.useFakeTimers()` for recency decay testing
- **Deterministic seeds**: For v1.5 stochastic activities (meditate, dream, ideate)
- **Fixtures**: fact-empty-graph.json, fact-1000-load.json, decision-forge-ingestion.json

**Acceptance criteria mapping (M0 readiness):**
- ✅ Testable in M0: AC-1.1, AC-1.2, AC-1.4, AC-2.1, AC-2.2, AC-2.3, AC-2.5, AC-6.1, AC-6.2, AC-6.3
- 🔲 Blocked in M0: AC-1.3 (no precision dataset), AC-2.4 (checkpoint schema undefined)

**Open questions flagged for responsible agents:**
- Precision dataset (AC-1.3): Where do relevance labels come from? → Cassima + Laura to curate from Cairn/Forge decision logs
- Checkpoint schema (AC-2.4): What is Checkpoint interface? → Cassima or Emma
- Eviction policy scope: v1 or v1.5? → Cassima
- BM25 failure mode acceptance: Empty results on lexical mismatch acceptable? → Cassima (document as known v1 limitation, deferred to v1.5 with sqlite-vec)

**Key learnings:**
- **Recall scoring formula**: `rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency`, then multiply by attention tier (hot=1.0, warm=0.5, cold=0.1). Trust floor: facts with trust < 0.15 excluded.
- **Bridge ledger hard rule**: No runtime ATTACH queries (FR-7.2). Offline reconciliation via `eureka reconcile` CLI.
- **Plasticity irreversibility**: committed=false → committed=true allowed, reverse blocked. Write protection on committed facts critical.
- **v1 tier scope**: Only agent.db wired. user.db/project.db stubs must gracefully degrade (throw on write, empty on read) — no panics.

**Document structure:**
1. Test layers (unit, integration, e2e, property-based, human-in-loop)
2. Per-activity verification (recall, integrate, rerank, decide, commit, retire, evict)
3. Property dynamics (trust, recency, plasticity, attention tier)
4. Tier boundary tests (cross-tier resolution, write authority, federation conflicts deferred to v1.5)
5. Integration tests (Cairn↔Eureka, Forge↔Eureka, types contract)
6. Test infrastructure (fixtures, time travel, deterministic seeds, in-memory SQLite)
7. Acceptance criteria mapping table (AC → test category → M0/M1/M2 status)
8. Edge cases to write first (6 critical cases)
9. Test commands (`npm test -- eureka`, load tests, property tests)
10. Open questions (4 blockers for M0, proposals for responsible agents)

**Next steps identified:**
- Cassima to resolve open questions (precision dataset, checkpoint schema, eviction policy, BM25 failure mode acceptance)
- Laura to implement unit tests for recall scoring formula and trust floor filtering (highest risk)
- Emma to wire test fixtures and load test harness (AC-1.2 P95 < 500ms, AC-2.3 P95 < 200ms)

## §55 TDD Strategy Acceptance + §50 Reframe (2026-05-27)

**Milestone:** §55 (London-School TDD Strategy) accepted as the implementation spine; §50 reframed as complementary layer.

**§55 Acceptance:**
- **Context:** After reviewing reviewer notes (5 specialists across 2 rounds), Aaron accepted §55 as the canonical TDD workflow doc for Eureka v1.
- **Positioning:** §55 defines the outside-in TDD spine (red/green/refactor rhythm, mock discipline, AC-to-test mapping). §50 repositioned as complementary layer (property-based tests, integration contract tests, edge-case checklists).

**§50 Reframe Assignment:**
- **Task:** §50's content still read as if it were the spine (pre-§55 framing). Aaron requested in-place reframe to position §50 as complementary to §55, not parallel to or above it.
- **Approach:** Per §55 §4 (Reconciliation table), §50 content splits into:
  - **Carried forward as complementary:** Property-based tests for trust/recency invariants, edge-case checklists, integration boundary tests (storage/bridge seams), contract tests for mocked collaborators
  - **Reframed/superseded:** General testability heuristics (mocking guidelines, fixture patterns) superseded by §55's London-school specifics

**What I did:**
1. **Front-matter reframe:** Added overview paragraph positioning §50 as complementary to §55 (outside-in drives structure; §50 validates invariants)
2. **Section orientation markers:** For each major section (Test Layers, Property Dynamics, Tier Boundary, Integration Tests, Test Infrastructure, Acceptance Criteria, Critical Edge Cases), added "Complementary to §55" status headers and cross-references to relevant §55 sections
3. **No deletions:** Superseded patterns left as historical record, just clearly marked
4. **Length discipline:** 8.99% increase (322 words added to 3,581-word doc), well under 15% budget

**Cross-references added:**
- §55 §1 (outside-in workflow)
- §55 §2 (worked recall example)
- §55 §2.5 (tier fan-out cycle)
- §55 §3 (Vitest mock patterns)
- §55 §3.3 (contract test discipline)
- §55 §5 (AC-to-test mapping table)

**Key learnings:**
- **Positioning matters more than content** — the same property-based tests are valuable, but their framing shifted from "primary strategy" to "complementary validation layer"
- **Reframe ≠ rewrite** — the task was to adjust framing, not rework test patterns. Lightweight orientation markers (status headers, cross-refs) achieved the goal without content churn
- **Reconciliation tables drive reframe decisions** — §55 §4's explicit "Carried forward" vs "Dropped" breakdown made it clear what to preserve vs supersede
- **Historical preservation** — even superseded patterns (e.g., fixture guidelines now covered in §55) stay in §50 as historical record, just marked as such
- **Length discipline** — 8.99% increase proves reframing can be surgical, not expansive

**Evidence of success:**
- Each subsection now has clear "Complementary to §55" status markers
- Cross-references added to §55 §1 (outside-in workflow), §2 (worked example), §3 (mock patterns), §5 (AC mapping)
- No conflicting guidance — §50 now defers to §55 for workflow, focuses on invariant validation
- TOC already updated by Graham to mark §50 as "complementary to §55"

## Core Patterns Established

- **Lesson:** UNIQUE constraint adds `sqlite_autoindex_*` — excluded by `NOT LIKE 'sqlite_%'` filter, so explicit index count tests are unaffected. Always check filter criteria when migration schema changes.
- Two commits: one for curator/migration/prescribers; one for category regression/weight-consistency/contracts
  - #15 DEFAULT_MIN_SESSIONS regression pin, both sides (changeVectors, weight-consistency)
  - #14 computeConfidenceBoost removed from prescribers/index.ts — compile-time guard (implicit)
  - #13 describe rename (weight-consistency.test.ts)
  - #8 ChangeVectorSummary root re-export smoke test (contracts.test.ts)
  - #7 category regression guard — duck-typed boundary (new: changeVectorCategoryRegression.test.ts)
  - #6 structured ChangeVectorSweepResult diagnostics (curatorVectors.test.ts)
  - #5 two-tier sort — matched before unmatched (prescribers-vectors.test.ts)
  - #4 UNIQUE(hint_id) constraint (migration012.test.ts)
  - #3 sessionsObserved as delta (curatorVectors.test.ts)
  - #2 confidence clamp / never-attenuate (changeVectors, weight-consistency, prescribers-vectors)
  - #1 deltaCost per-session normalization (curatorVectors.test.ts)
- New tests: 548 cairn + 585 forge (1133 total)
- Pre-existing failing test: UNIQUE constraint caused "returns multiple vectors" to fail → fixed
- 15 findings from code-panel review assigned; Rosella + Alexander fixes landed first
**Wave 4 (Cycle 2 — Phase 4.6, 2026-05-03):**

- **Final: 1102 passing tests**
- Added ChangeVectorSummary schema regression suite
- Replaced it.todo with passing test
- Upgraded all tests per defect verdict (renamed .confidence → .confidenceBoost)
**Wave 3:**

- Status: SATISFIED WITH CAVEAT
- Analysis: contract ambiguity (level vs boost semantics), not logic error
- Flagged inconsistency: summarizeChangeVectors returns confidence=0 vs computeConfidenceBoost(0) = 1.0
**Wave 2:**

- 93 new tests across 5 files; total: 1099 passing
- L1–L5: Migration 012 tests, CRUD tests, prescriber integration, Curator e2e, weight consistency regression
**Wave 1:**

### Phase 4.6 Change Vector Learning (2026-05-03)

- 37 production tests from Roger's modules also in file
- Key discovery: stripStage preserves relative paths, only strips absolute paths
- Test groups: renderFrontmatter (8), compileSkill (6), extractStage (4), stripStage (5), attachStage (3), validateStage (4), runExportPipeline (15), persistence (3), integration (5), edge cases (9)
- Rewrote 62 contract tests to match spec API surface

### Phase 4 Export Pipeline (2026-05-01)

- **Total: 990 tests passing (512 forge, 478 cairn)**
- L5 tests catch O(N) regressions
- Process-invariant testing: simulate operator effect at profile level
- Design: convergence asserted by monotone response curves (hint count ↓ as drift ↓), not terminal states
- Delivered: 36 integration/convergence/regression/efficiency tests in eedback-loop.test.ts

### Phase 4.5 Feedback Loop (2026-05-02)

- Key finding: mock session returns no-op unsubscribe stub (only fire-and-forget wiring)
- Full forge suite: 268 tests passing
- 87 new tests: ForgeClient session lifecycle, bridge wiring, hook composition, message sending, disconnect lifecycle, model switching, token budget tracking

### Phase 3 Cross-Module Integration (2026-04-29)

- 22 bridge tests: EVENT_MAP (22 entries), provenance classification, unmapped event handling, edge cases
- 32 contract tests: CairnBridgeEvent shapes, ProvenanceTier, DecisionRecord, SessionIdentity, DBOMArtifact, TelemetrySink

### Phase 2 Runtime Verification (2026-04-28)

## Phase-by-Phase Summary

- ForgeClient.stop() wraps in try/catch (resilient), ForgeSession.disconnect() throws directly
- Mock session unsubscribe semantics: fire-and-forget wiring ≠ testing unsubscribe
- Bridge event type discovery: always verify names against production EVENT_MAP
- Mock SDK for unit tests, live CLI for integration tests
**Key testing decisions:**

- Phase 3 pattern: define expected API types, inline implementations, then swap imports
- Any behavioral divergence immediately surfaces as test failures
- When real modules built, tests switch from inline to real imports
- Inline contract implementations establish behavioral expectations
**Contract-first testing approach:**

- 427 tests across 15 domains
- DB tests: In-memory SQLite via getDb(':memory:')
- Test location: packages/cairn/src/__tests__/
- Config: packages/cairn/vitest.config.ts

---

### 2026-05-27: TD Re-Pass Batch Complete — §50 Testability Reframe

**Event:** Part of Aaron's 6-agent TD re-pass batch (audits + follow-up executions across §20/§30/§40/§50).

**Phase 1 — Reframe §50 Testability as Complementary to §55 London-School TDD:**
- **Task:** Position §50 (Testability) as design-time discipline complementary to §55's implementation-time TDD practice
- **Scope:** Update all §50 subsections with explicit cross-refs to §55 where patterns overlap
- **Verdict:** ✅ §50 ORIENTED AS COMPLEMENTARY LAYER
- **Key insight:** §55 defines TDD workflows and mock boundaries (how to write tests); §50 defines testability design principles and seam identification (how to design for TDD)
- **Deliverable:** Edited `docs/eureka/sections/50-testability.md` (+9% content with framing, cross-refs, sidebar mapping)
- **Status:** ✅ COMPLETE

**Changes Applied:**
1. ✅ Added framing paragraph §50 §0: "Relationship to §55 London-School TDD" — establishes complementary pair
2. ✅ Updated subsection introductions — clarified design-time role for each seam
3. ✅ Marked all seams with §55 cross-references — shows where patterns apply
4. ✅ Added sidebar mapping boxes — visual guide to §50→§55 correspondence

**Subsections Marked:**
- §50 §1 "Seam Identification" → cross-refs §55 §1.2 mock boundaries
- §50 §2 "Abstraction Layers" → cross-refs §55 §2 worked example
- §50 §3 "Test Doubles" → cross-refs §55 §3 mock contracts
- §50 §4 "Determinism" → cross-refs §55 §4 non-determinism section
- §50 §5 "Contract Tests" → cross-refs §55 §5 AC-mapping

**Key Insight:** §55 (London-school TDD) and §50 (testability design) form a coherent pair. Design principles enable TDD discipline; TDD discipline validates design principles. Making this relationship explicit helps future readers navigate both sections without treating them as sequential stages (which they're not — they're complementary perspectives).

**Learnings:**
1. **Complementary != Sequential.** §50 isn't "before" §55 or "after" §55 — they're orthogonal lenses on the same design. Design-time (§50) and test-time (§55) choices happen in parallel, inform each other.
2. **Cross-refs are documentation discipline.** Explicit pointers prevent readers from missing the connection between design principles and test strategy.
3. **Sidebar mapping clarifies scope.** Showing which §50 patterns support which §55 sections prevents confusion about coverage.

**Coordination:**
- Verified no conflicts with parallel Crispin §20 audit, Roger §40 audit, Edgar §30 follow-ups
- All agents' work is complementary; §50 reframing contextualizes the entire batch

**Confidence:** HIGH — reframing adds clarity without changing content; no algorithm/design changes needed.

**Deliverables:**
- 1 orchestration log (§50 reframe)
- Updated `.squad/agents/laura/history.md` (this entry)

**Timeline:** Complete. §50 now positioned as design-time discipline; readers understand how it enables §55 implementation-time TDD.

**Team Update:** §50 (Testability Design) and §55 (London-School TDD) are now explicitly framed as complementary. Design for testability (§50) enables test-driven development (§55). Future documentation should cross-ref between them to reinforce the relationship.

- Framework: Vitest with itest run
**Existing test patterns (from @akubly/cairn):**

## Test Architecture Patterns

- **Joined:** 2026-04-28
- **User:** Aaron Kubly
- **Tech Stack:** TypeScript, Node.js 20+, npm workspaces monorepo, Vitest, SQLite (better-sqlite3), MCP SDK, Copilot SDK
- **Project:** Cairn + Forge — an agentic software engineering platform

## Project Context

**Recent decision:** Laura positioned as on-call test architect for Brain; contract-first patterns and coordinated testing expertise directly applicable to learning/memory activities validation. Primary focus: Cairn.

- Brain roster: Proposed Test Advisor (advisory, on-call) for Brain project with primary Cairn commitment
- Brain project: Proposed on-call Test Advisor role, applying contract-first patterns to stochastic/agentic testing
- Phase 4.6 lifecycle: 15 findings consolidated, 3-cycle review with Lockout-compliant cross-assignment
- Contract-first testing: Inline implementations before real modules, switch imports with zero test changes
**Key themes:**

| 2026-05-22 | Brain Project Roster Proposal (Test Advisor Role) | 🟡 Proposal pending Aaron |
| 2026-05-22 | Brain System Consulting (Test Architecture Lens) | ✅ Completed |
| 2026-05-02–2026-05-04 | Phase 4.5–4.6 Review Cycle (Feedback Loop + Change Vectors) | ✅ Completed |
| 2026-04-29 | Phase 3 Cross-Module Integration | ✅ Completed |
| 2026-04-28 | Phase 2 Runtime Verification | ✅ Completed |
|------|-------|--------|
| Date | Event | Status |

**Total entries:** 5 major contributions spanning Phase 2-4.6 testing + Round 2 brain system consulting + Round 2 roster proposal

## Summary

# Laura — History (Summarized)


---

### 2026-05-27: London-School TDD Directive — Next Task Assigned
**Team Update:** Aaron issued London-school (outside-in mockist) red/green TDD as team default for all packages. **Laura assigned:** Author docs/eureka/sections/55-tdd-strategy.md next session (read §10 only, ignore §20/30/40/50 per outside-in discipline). Genesta + Edgar review. Open blocker: OQ-1 substrate ownership resolution (Aaron to decide).

### 2026-05-27: §55 TDD Strategy Document Completed

**Assignment completed:** Authored comprehensive London-school TDD strategy document (`docs/eureka/sections/55-tdd-strategy.md`) following handoff brief `.squad/handoffs/2026-05-27-london-tdd-kickoff.md`.

**Document structure (8 sections):**
1. **London-School TDD Spine**: Outside-in from 9 activity verbs, red/green/refactor cadence, mock vs sociable rubric
2. **Worked Example**: Complete `recall` test-first cycle showing collaborator discovery (CuratorStore, Ranker) from failing tests
3. **Mock Contract Style**: Vitest patterns, interaction vs state testing, contract test discipline (every vi.fn() mock requires contract test)
4. **Reconciliation with §50**: Table showing what carried forward (contract-first API, type-driven interfaces) vs superseded (general mocking heuristics)
5. **AC Mapping Table**: 31 acceptance criteria → first failing test descriptions → 23 test files
6. **OQ-Dependent Seams**: 6 open questions flagged with test impact assessment (OQ-1 resolved/stable, OQ-2/3/5 volatile)
7. **Implementation Checklist**: Pre/during/after workflow gates
8. **Appendices**: Glossary, references, change log

**Key patterns established:**
- **Outside-in entry points**: Start from activity signatures (`integrate`, `recall`, `rerank`, `decide`, `commit`, `retire`, `evict`), not internal design
- **Collaborator discovery**: Tests force collaborators into existence (CuratorStore discovered when hardcoded stubs fail k-limit test)
- **Mock discipline**: Mock at I/O seams (storage, network, FS, time), use real pure functions (rankers, scorers, value objects)
- **Contract test coverage**: Every mocked interface must have contract test validating real implementation honors mock assumptions

**Worked example (§2):**
- AC-1.3 (keyword-scoped precision) → first failing test → hardcoded 5-result stub → passes
- AC-1.4 (k-limit) → second test → fails (hardcoded) → forces `CuratorStore` collaborator discovery
- Refactor: Extract interfaces, introduce real ranker, mock storage seam
- Pattern: red (express AC) → green (minimal stub) → refactor (extract collaborator) → red (next AC)

**Mock contract style:**
- Prefer state assertions over interaction testing
- Use interaction mocks only when state isn't observable or failure modes critical
- Vitest patterns codified: vi.fn(), vi.mock(), vi.spyOn()
- Contract discipline: activity tests use mocks; collaborator tests validate real implementations

**AC coverage:**
- 31 acceptance criteria (from PRD v5-final §70 table) mapped to 23 test files
- Each AC drives at least one red/green/refactor cycle
- Test naming: `describe("activity-name", ...)` + `it("AC wording", ...)`

**OQ-dependent seam analysis:**
- OQ-1 (substrate ownership): ✅ Stable after ADR-0002 (monorepo, shared `@akubly/types`)
- OQ-2 (embedding strategy): HIGH volatility - abstract behind interface, contract test service client
- OQ-3 (attention model): MEDIUM volatility - parameterize multipliers
- OQ-5 (decay function): MEDIUM volatility - extract to `DecayFunction` interface
- OQ-4/6 (trust init, k-defaults): LOW volatility - extract constants but don't over-abstract

**Supersession:**
- §55 supersedes §50 as primary implementation guide
- §50 remains authoritative for API boundary decisions (e.g., "should recall accept filter param?")
- §55 authoritative for workflow (e.g., "write failing test before implementing filter")

**Reading discipline followed:**
- ✅ Read: §10 (activities), §70 (AC table), ADR-0002 (substrate seam), PRD v5-final (user stories/FRs)
- ❌ Avoided: §20 (Crispin's schema), §30 (Edgar's algorithms), §40 (Roger's integration), §50 (testability)
- Rationale: Outside-in TDD should discover collaborator shape from tests, not confirm predetermined design

**Key learnings:**
- **London-school spine adoption**: Outside-in mockist TDD now team default for all Eureka v1 work
- **Anti-anchoring for implementation**: Reading internal design sections before TDD would anchor implementation, violating outside-in discipline
- **Contract test coverage rule**: Every vi.fn() mock in activity tests MUST have corresponding contract test in collaborator suite
- **Mock vs sociable rubric**: Mock when failure modes matter more than algorithm; test sociably when algorithm correctness matters more than I/O resilience
- **AC-driven test naming**: Use exact AC wording as test case names to maintain PRD traceability

**Unresolved decisions deferred to responsible agents:**
- Mock library choice: Vitest ecosystem (vi.fn/vi.mock) sufficient or introduce dedicated mocking library? (Cassima or tech lead decision)
- Interaction testing granularity: How prescriptive should mock contracts be? (Resolved by convention: prefer state, use interaction sparingly)
- Worked example fidelity: TypeScript syntax vs pseudocode? (Resolved: TypeScript with comments, executable patterns)

**Next steps:**
- Genesta + Edgar to review §55 draft
- Implementation agents (Crispin, Edgar, Roger) use §55 as TDD workflow spine starting with first `recall` test
- Laura available for clarifications on mock discipline or contract test patterns

### Cycle 3 — §50/§55 Canonical Alignment (2026-05-28)

**Assignment:** Close out B1 PARTIAL residue + 2 advisory findings from Cycle 2 verification (commit f68873d).

**Fixes delivered:**
1. **§50 tier multipliers (B1 PARTIAL residue):** Replaced incorrect values hot=1.0, warm=0.5, cold=0.1 with canonical hot=1.20, warm=1.00, cold=0.80 per §30 §2.2.1 (attention-budgeting rationale). Fixed in 5 locations (lines 35, 100, 131, 267, plus Critical Invariants block).
2. **§50 decay model wording (B1 PARTIAL residue):** Replaced "exponential decay" with "power-law (ACT-R, exponent 0.5 per Anderson 1990)" per §30 §2 canonical source. Fixed in 2 locations (lines 87, 244).
3. **§55 tier fan-out clarification (advisory):** Added v1 vs v1.5 scoping note at §2.5 — v1 is hardwired to agent tier per I7; tier fan-out tests illustrate v1.5 semantics, not v1 contract. Clarified comment in worked example.
4. **§55 §2.6 side-effect coverage (advisory):** Extended side-effect test section to cover all 3 side-effects (accessCount, lastAccessedAt, attention tier promotion). Added new it('promotes attention tier when access threshold met', ...) test block.

**Key learnings:**
- **Canonical parameter anchoring:** When multiple sections reference the same parametric values (tier multipliers, decay exponents), they must all point to the canonical definition (§30) or hard-code the same values. Divergence across sections causes confusion during implementation.
- **Version scoping in worked examples:** Test examples that exercise future-version features (like tier fan-out across user/project in v1.5) must explicitly scope the version, or implementers will treat them as v1 acceptance criteria.
- **Side-effect testing completeness:** When a spec (§10/§30) documents N side-effects for an activity, test examples (§55) must cover all N, not a representative subset. Partial coverage signals "optional" when all side-effects are mandatory.
- **Pointer vs duplication trade-off:** For stable parametric values (like tier multipliers), a pointer to the canonical section (per §30 §2.2.1) is safer than duplication — changes propagate automatically. For volatile design elements, duplication with version scoping is clearer.

**Evidence of success:**
- All 4 fixes landed cleanly; no deviations required
- §50: 5 occurrences of tier multipliers now match §30 canonical values
- §50: 2 occurrences of decay model now reference ACT-R power-law per §30
- §55: Tier fan-out test explicitly scoped to v1.5, with v1 hardwiring caveat
- §55: §2.6 now demonstrates all 3 side-effects (accessCount, lastAccessedAt, tier promotion)
- Length growth: §50 ~2.5% (well under 10% budget), §55 ~4.8% (well under 10% budget)

**Next steps:**
- No deviations logged — inbox clean
- Learnings appended to history.md
