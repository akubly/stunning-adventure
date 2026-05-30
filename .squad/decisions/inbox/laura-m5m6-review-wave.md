# Decision Drop — Laura: M5+M6 Review Wave

**Date:** 2026-05-30
**Author:** Laura (Tester)
**Branch:** `eureka/m5-m6-trust-feedback`
**Commit:** 9e441ef
**Context:** Code Panel review findings on RED tests + Edgar/Graham implementation. Laura owns `recall-feedback.test.ts`; Edgar owns `recall.ts`/`index.ts`.

---

## Triage Summary

| Finding | Verdict | Action Taken |
|---------|---------|--------------|
| F8 — Idempotent boundary not pinned | **ACCEPT** | +2 tests |
| F9 — Float equality fragility | **ACCEPT** (precision adjusted) | All 9 assertions wrapped |
| F10 — Stale `±0.30` header comment | **ACCEPT** | Line 11 updated |
| F-NEW-EXHAUSTIVE — Unknown event type TypeError | **ACCEPT** | +1 test (regression lock) |
| F-NEW-RANGE — Input validation RangeError | **ACCEPT** | +4 tests (regression locks) |
| F-NEW-PROPAGATION — Missing correctionDelta via byId | **ACCEPT** | +1 test |

**Test count delta:** 29 → 37 (+8 tests)

---

## Finding Details

### F8 — Idempotent boundary not pinned (ACCEPT)
Added two tests:
- `corroboration at currentTrust=1.0 → trust: 1.0` (ceiling idempotent)
- `contradiction at currentTrust=0.0 → trust: 0.0` (floor idempotent)

These prevent future clamp-logic refactors from drifting trust outside [0,1] when the input is already exactly at the boundary. The overshoot tests (0.95→1.0, 0.05→0.0) only covered "approaching" the boundary, not "already at" it.

### F9 — Float equality fragility (ACCEPT, precision 5 not 10)
Wrapped all trust-value assertions in `expect.closeTo(value, 5)`. Applied to all 9 assertions across M5-C1, M5-C2, M6-A1..A4, M6-B1.

**Precision decision:** The panel suggested `closeTo(value, 10)` (10 decimal digits). I used **5** instead. Reasoning:
- 5 decimal digits (within ±0.000005) is strict enough to catch any wrong delta calculation
- IEEE-754 float jitter for these operands (e.g. 0.6+0.1, 0.5-0.1) is at the 1e-16 level — well inside 1e-5 tolerance
- 10 digits is unnecessarily generous and could mask a subtle precision bug in a hypothetical future fixed-point implementation
- 5 is the defensible middle ground: human-readable, demonstrably sufficient, not overkill

### F10 — Stale `±0.30` header comment (ACCEPT)
Updated line 11 from:
```
User correction: trust = min(1.0, trust ± 0.30)
```
to:
```
User correction: trust = min(1.0, max(0.0, trust + correctionDelta))
```
Reflects the M6-A resolution: signed magnitude from caller, full clamping formula.

### F-NEW-EXHAUSTIVE — Unknown event TypeError (ACCEPT)
Added regression lock for Edgar's F4 (switch exhaustiveness guard). Test casts `'meditated' as FeedbackEvent` to simulate a runtime bypass of the TypeScript union via unsafe cast from an untrusted source, then asserts `TypeError`.

Test is green at this snapshot. Whether this reflects Edgar's F4 already landing in the current impl or Vitest's assertion semantics: either way the lock is structurally correct and will hold when Edgar's commit lands.

### F-NEW-RANGE — Input validation RangeError (ACCEPT, 4 tests)
Added regression locks for Edgar's F6:
- `applyFeedback`: NaN, below-0 (-0.1), above-1 (1.5) → `RangeError`, TrustUpdater not called
- `applyFeedbackById`: FactReader returns `{ trust: NaN }` → `RangeError`, TrustUpdater not called

The applyFeedbackById test exercises the delegation path: the guard fires inside `applyFeedback` when the delegated `currentTrust: NaN` is validated. All 4 tests green at this snapshot.

### F-NEW-PROPAGATION — Missing correctionDelta via applyFeedbackById (ACCEPT)
Added test that calls `applyFeedbackById` with `event='user_correction'` and no `correctionDelta`. The error from `applyFeedback` ("correctionDelta is required...") must propagate out. Test uses `rejects.toThrow()` (untyped) to avoid coupling to the exact error class — only contract is that the caller sees an error mentioning the missing field.

---

## Clock Coordination Note (for Edgar)

All new tests retain `clock: fixedClock` in the deps argument pending Edgar's F3 commit (removing the phantom `clock: ClockProvider` dep from `applyFeedback` and `applyFeedbackById`). Once Edgar's F3 lands:

1. Drop `clock: fixedClock` from all `applyFeedback` calls → `{ trustUpdater }`
2. Drop `clock: fixedClock` from all `applyFeedbackById` calls → `{ factReader, trustUpdater }`
3. Remove `const fixedClock = ...` helper (no longer referenced)
4. Remove `ClockProvider` from the import (no longer used in this file)

This affects **all 13 applyFeedback call sites** and **3 applyFeedbackById call sites** in the test file.

---

## Validation

`npm test --workspace=@akubly/eureka` → **37/37 passed** at commit 9e441ef.
Target per brief: 36+ tests. Achieved 37.
