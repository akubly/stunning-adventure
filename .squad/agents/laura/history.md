# Laura — History

**Role:** Tester (Contract-first patterns, integration testing, test architecture)
**Status:** M3 baseline preserved. Eureka M2 GREEN landed 2026-05-28. Cycle 2 composite-ranker + F6 resolution verified.
**Last update:** 2026-05-29

**Key milestones:**
- Phase 2-4.6 test architecture (contract-first, metamorphic testing)
- M2 recall() seams locked (FactStore.search injection, SessionId brand)
- M3 composite-ranker baseline (FR-2 formula validation)
- Issue #17 async-sweep: 0 required fixes, 12 tests added
- Cycle 2 findings: 8 addressed in combo pass

**See history-archive.md for detailed entries.**

## Learnings

### 2026-05-30: M6 RED — user_correction contract lock + read-seam (FactReader)

**Two RED beats landed:**

**M6-A** — `user_correction` event contract (5 tests in `describe('applyFeedback', ...)`):
- M6-A1–A4: 4 arithmetic tests (positive/negative delta, ceiling/floor clamp). All 4 passed GREEN on first run — Edgar's M5 GREEN had already implemented the `user_correction` branch correctly. These are regression locks, not proper RED. Mild §55 contract-after-implementation deviation documented in test comments.
- M6-A5: Missing `correctionDelta` when `event='user_correction'` → should throw. This IS the true RED beat. Edgar's impl uses `correctionDelta ?? 0` (silent fallback), so the test fails correctly: "promise resolved undefined instead of rejecting."

**M6-B** — `applyFeedbackById` read-seam (2 tests in new `describe('applyFeedbackById (read-seam)', ...)`):
- Chose a NEW `applyFeedbackById` function (higher-level orchestrator) over mutating `applyFeedback`. Preserves M5 contract stability; separation of concerns.
- `FactReader` interface driven: `read(args: { factId, sessionId }): Promise<{ trust: number } | null>`.
- M6-B1: happy path — FactReader supplies trust, delta applied, TrustUpdater called with correct value. RED: `applyFeedbackById is not a function`.
- M6-B2: FactReader returns null → must throw; TrustUpdater not called. RED: same.

**Final counts:** 29 tests total. 26 pass (18 M1–M4 + 8 M6-A pass/regression-lock). 3 fail RED: M6-A5 + M6-B1 + M6-B2.

**New pattern learned:** Contract-after-implementation regression-lock. When implementation arrives before contract tests, the correct response is: write the tests anyway (they lock the contract), document the §55 deviation in comments, and ensure at least one test in the beat is genuinely RED (drives undefined behavior). Mechanical passing tests still have value as regression guards.

**Read-seam shape decision:** New function (`applyFeedbackById`) over extending existing (`applyFeedback`) because: (a) `applyFeedback` has a stable M5 contract, (b) orchestration (read + compute + write) is a different responsibility from pure compute + write, (c) keeps `applyFeedback` unit-testable without storage deps.

**Next owner:** Edgar — M6 GREEN. See `.squad/decisions/inbox/laura-m6-red.md`.

### 2026-05-30: M5 RED — Trust Feedback Mutation Contract
