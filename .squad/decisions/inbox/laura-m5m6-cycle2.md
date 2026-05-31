# Decision Drop — Laura · M5+M6 Cycle 2 · 2026-05-30

## Summary

Cycle 2 review consensus (Correctness C5 + Craft Cf8 + Compliance) identified stale
`clock: fixedClock` injections carried through all feedback-path call sites after Edgar
removed `ClockProvider` from `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` in cycle 1.
The `__tests__` dir is excluded from tsc, so excess-property checking never fired —
the stale fields were silently swallowed at runtime.

## Changes (recall-feedback.test.ts only)

| Item | Detail |
|------|--------|
| `applyFeedback` call sites cleaned | 15 |
| `applyFeedbackById` call sites cleaned | 4 |
| `fixedClock` const removed | yes — fully unused after cleanup |
| `FIXED_NOW_MS` const removed | yes — only referenced by `fixedClock` |
| `ClockProvider` import removed | N/A — was never imported in this file |
| Block comment ("ClockProvider REQUIRED in all deps") | Replaced with accurate scope note: clock required for recall/recallWithScores path only, NOT feedback path (§30 §2.3, §55 §1.2) |
| Inline signature sketch (M6-B section) | `clock: ClockProvider` dropped from `applyFeedbackById` deps shape |

## Edgar inbox check

`.squad/decisions/inbox/edgar-m5m6-cycle2.md` was not present at time of commit.
No `correctionDelta` NaN/Infinity regression-lock test added (no named beat provided).

## Validation

`npm test --workspace=@akubly/eureka` → 37/37 passed.
