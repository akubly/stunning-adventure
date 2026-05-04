# Laura — History (Summarized)

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

## Core Patterns Established

**Test organization:** Inline contract implementations before real modules exist. Switch from inline to real imports with zero test changes (only implementation changes).

**SDK testing constraint:** SDK requires running Copilot CLI process for full integration tests. Unit tests use mocks, integration tests require live CLI.

**Metamorphic testing:** Response curves, not terminal states. Operator effects simulated at profile level. Generic bounds catch regressions without hardcoding expected values.

**Regression guards:** L5 tests catch O(N) complexity regressions. Weight consistency tests (e.g., cairn/forge constant alignment) prevent silent divergence. Schema regression suites catch structural drift.

**Defect resolution pattern:** Lockout rule (author cannot fix own defect) prevents blind spots. Three-phase triage (find → decide → fix) divides ownership, improves quality.

**Cross-boundary category contract:** cairn stores `category: string`; forge uses `OptimizationCategory` union. Regression test uses `readonly OptimizationCategory[]` array — TypeScript enforces membership at compile time, runtime asserts round-trip. If forge renames a category, the array gets a type error in CI.

**Test isolation + cursor state:** INSERT OR IGNORE idempotence tests must assert `alreadyComputed` on the _second_ curate() call — the first sweep has changes=1, the second has changes=0 (INSERT OR IGNORE does nothing). Always track which sweep call you're asserting on.

## Learnings

### 2026-05-04 — Cycle-3 Advisory Fixes

**Items delivered:**
- **ITEM A** (alias cleanup): Migrated 6 `result.vectorsComputed` calls → `result.changeVectorSweep.computed` across curatorVectors.test.ts. Dropped the deprecated `vectorsComputed` field from `CurateResult` interface and return object in curator.ts. Clean removal — no other callers.
- **ITEM B** (contracts relabel): Reordered the two tests in `ChangeVectorSummary — root re-export smoke test`. Shape-guard test now runs first (renamed "ChangeVectorSummary is exported as a type from forge root index"). Barrel smoke test now second (renamed "@akubly/forge barrel resolves without runtime error" with comment clarifying it's not a type assertion).

**New tests for cycle-3 production changes (+20 total):**
- `curatorVectors.test.ts` +6: Legacy snapshot deltaCost=0 (no sessionCount / sessionCount=0 / other deltas still computed / sessionCount>0 normal path), session count reset clamp (sessionsObserved=0), equal counts edge case.
- `changeVectors.test.ts` +2: `summarizeChangeVectors(db, cat, skill, 0)` → finite, >=1.0 (safeMin guard); vectorCount=0 with minVectors=0 still returns 1.0 (early-exit path).
- `weight-consistency.test.ts` +4: `computeConfidenceBoost(vc, 0)` returns finite >= 1.0 for vc=0, 1, large, and all across a sweep.
- `prescribers-vectors.test.ts` +8: `applyHistoricalVectorOrdering` imported directly from utils.ts; verified matched-first / predictedImpact-desc / unmatched-impactScore-desc contract; non-mutation; empty array; all-matched / all-unmatched edge cases.

**Defect scan — no production defects found.** All cycle-3 changes (Rosella's legacy snapshot guard, sessions_observed clamp, safeMin in summarizeChangeVectors; Alexander's safeMin in computeConfidenceBoost, applyHistoricalVectorOrdering extraction) were already in place. The view tool returned a cached version of changeVectors.ts that lacked the safeMin guard — Get-Content confirmed the guard was present. Lesson: when a test passes unexpectedly, verify live source with Get-Content, not view.

**Totals: 1153 passing (556 cairn + 597 forge), 4 todos. Baseline was 1133 (+20).**

## 2026-05-04: Phase 4.6 Review Cycle — 3-Cycle Complete

**Role:** Wave 1 test author (L1–L5), Wave 2 defect finder (confidence inconsistency), Wave 3 cycle-3 test & code updates (L3, L4, L5)

**Final Outcome:**
- 1153 tests passing (baseline 990 + 163 new)
- Branch review-clean, all persona findings resolved
- Delivered 20 new tests in cycle 3 (L5)

**Review Cycle Scope:**
- Cycle 1: 15 findings; L1–L5 tests executed (93 new), 1099 → 1102 passing
- Cycle 2: Laura flagged `summarizeChangeVectors` confidence=0 vs `computeConfidenceBoost(0)` inconsistency
  - Analysis: contract ambiguity (level vs boost), not logic error
  - Verdict (Option B): rename field to `confidenceBoost`, re-opened test as passing
- Cycle 3: Updated all tests per cycle-1/2 fixes; added 20 edge-case tests (1133 → 1153)

**Cycle 3 Test Additions:**
- `curatorVectors.test.ts` +6: legacy snapshot handling (deltaCost=0), session count reset clamp
- `changeVectors.test.ts` +2: safeMin guard at 1, minVectors=0 edge case
- `weight-consistency.test.ts` +4: computeConfidenceBoost with safeMin
- `prescribers-vectors.test.ts` +8: applyHistoricalVectorOrdering partition & sort semantics
- Contracts + naming updates: dropped deprecated `vectorsComputed` alias, reordered shape-guard tests

**Key Pattern (Cycle 1):** Contract-first test architecture paid off. L1–L5 established expected behavior *before* fixes were known. When cycle-1 findings emerged, tests already captured the happy path; adding cycle-2/3 edge cases was incremental, not rework. UNIQUE constraint tests reveal SQLite auto-indexes (filtered out); schema changes require explicit test re-verification.

**Defect Surface (Cycle 2):** The `confidence` field ambiguity exposed a real risk: 
- Alexander's zero-default was consistent with "confidence level" semantics (0 = no data).
- Rosella's 1.0 return was consistent with "confidence boost" semantics (1.0 = identity).
- Without naming discipline, the next developer writes either `if (summary.confidence === 0) hint.skip()` or `hint.confidence *= summary.confidence`, and one silently breaks. Renaming to `confidenceBoost` collapsed the ambiguity at the type level.

**Lesson (Cycle 3 integration):** When running test suites after fixes land, always verify live source (Get-Content) if a test passes unexpectedly — cached views can mask live-source changes. Additionally, cycle-3 advisory tests revealed that safeMin guards needed validation across all formula call sites. A single missing guard in any prescriber would silently pass test boundaries but fail in production. Pattern: enumerate all formula call sites and apply the guard consistently.

**Lockout Observation:** Test updates for findings in both forge and cairn required coordination across Alexander and Rosella's fixes. Laura ran tests after each fix wave, preventing integration gaps. Tests became the integration contract between parallel implementations.
