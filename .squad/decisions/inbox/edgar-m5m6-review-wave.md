# Decision Drop: Edgar M5+M6 Review Wave

**Author:** Edgar (Learning Systems Specialist — Eureka)
**Date:** 2026-05-30
**Branch:** `eureka/m5-m6-trust-feedback`
**Scope:** Implementation findings from 5-persona Code Panel review of M5+M6 (trust-feedback mutation)

---

## Finding Triage

### F1 — Public API not exported (BLOCKING) ✅ ACCEPTED

**Reasoning:** M4 precedent (`ClockProvider`) is barrel-exported; `applyFeedback`, `applyFeedbackById`, `FeedbackEvent`, `TrustUpdater`, `FactReader` and all four new named-interface types from F5 are now re-exported via `packages/eureka/src/index.ts`. External callers no longer need deep imports.

**Changed:** `packages/eureka/src/index.ts` — added function and type exports.

---

### F2 — TOCTOU in applyFeedbackById ✅ ACCEPTED (documentation)

**Reasoning:** Spec doesn't mandate atomicity yet; the SQLite backend (Crispin's work) will own concurrency. JSDoc `@concurrency` clause added documenting non-atomic semantics.

**Changed:** `packages/eureka/src/activities/recall.ts` — `@concurrency` clause on `applyFeedbackById`.

**Deferred:** M7-C — "atomic feedback contract — storage-layer responsibility" — RED beat for Crispin's real backend implementation. Crispin should implement row-level locking or serializable transactions wrapping the read+write in `applyFeedbackById` at the storage layer.

---

### F3 — Unused `clock` dep ✅ ACCEPTED

**Reasoning:** `clock: ClockProvider` was listed in both `applyFeedback` and `applyFeedbackById` deps but never read. Required-but-unused deps are the inverse of the §55 §1.2 anti-pattern ("no optional default"). Removed from both signatures. Clock injection remains correct for `recallWithScores` / `RecallDeps` where recency scoring actually uses it.

**Changed:** `packages/eureka/src/activities/recall.ts` — `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps` have no `clock` field.

**Spec:** §30 §2.3 updated to explicitly document that no `clock` field appears in feedback deps, with cross-reference to §2.4 where clock belongs.

**⚠️ Laura coordination:** `Laura: drop clock: fixedClock from applyFeedback*/applyFeedbackById* invocations in recall-feedback.test.ts (F3 — clock removed). TypeScript will reject extra properties on the now-typed ApplyFeedbackDeps / ApplyFeedbackByIdDeps interfaces. Build will fail until those invocation sites are updated.`

*(Note: 29/29 tests passed on this branch as of this commit, indicating the existing test file did not pass `clock` in its invocations — no action required from Laura for test green.)*

---

### F4 — No exhaustiveness check ✅ ACCEPTED

**Reasoning:** `switch` with `default: const _exhaustive: never = event; throw new TypeError(...)` catches union extension at compile time (TS `never` branch) and at runtime (unsafe casts). This is a correctness guarantee, not style.

**Changed:** `packages/eureka/src/activities/recall.ts` — `applyFeedback` converted from `if/else if/else` to exhaustive `switch`.

---

### F5 — Inline types break M1–M4 named-type pattern ✅ ACCEPTED (all four)

**Reasoning:** All four interfaces extracted and exported. Callers can now annotate against `ApplyFeedbackOptions`, `ApplyFeedbackDeps`, `ApplyFeedbackByIdOptions`, `ApplyFeedbackByIdDeps`. Consistent with `RecallOptions` / `RecallDeps` precedent.

**Changed:** `packages/eureka/src/activities/recall.ts` — four new exported interfaces. `packages/eureka/src/index.ts` — all four barrel-exported.

---

### F6 — No input validation on currentTrust ✅ ACCEPTED

**Reasoning:** `NaN`, `<0`, `>1` could propagate silently through math. Validation fires BEFORE any `TrustUpdater.update()` call — no side effects on bad input. Combined with F12 (non-finite stored trust guard in `applyFeedbackById`).

**Changed:** `packages/eureka/src/activities/recall.ts`:
- `applyFeedback`: `RangeError` guard on `currentTrust` before switch.
- `applyFeedbackById`: strengthened null guard to `fact == null` (catches both null and undefined) + separate `RangeError` guard on `fact.trust` non-finite.

---

### F7 — Stale comment at recall.ts lines 154-157 ✅ ACCEPTED

**Reasoning:** Comment listed "Trust score updates from feedback (§30 §2.1)" as not-yet-implemented. M5/M6 implemented exactly this. Removed that line; `lastAccessedAt / accessCount side effects` remain noted as still deferred.

**Changed:** `packages/eureka/src/activities/recall.ts` — stale bullet removed from `recallWithScores` JSDoc.

---

### F11 — `applyFeedbackById` @throws JSDoc incomplete ✅ ACCEPTED

**Reasoning:** Propagated error from `applyFeedback` (missing correctionDelta) was undocumented. Added `@throws` clause covering it, plus the new `RangeError` for non-finite stored trust.

**Changed:** `packages/eureka/src/activities/recall.ts` — three `@throws` clauses on `applyFeedbackById`.

---

### F12 — Stricter null/undefined guard ✅ ACCEPTED (combined with F6)

See F6 above.

---

## Summary of Changes

| File | Changes |
|---|---|
| `packages/eureka/src/activities/recall.ts` | F1-exports, F2-TOCTOU JSDoc, F3-clock removed, F4-switch exhaustive, F5-named interfaces, F6-input validation, F7-stale comment, F11-@throws |
| `packages/eureka/src/index.ts` | F1+F5: added 9 new exports (2 functions, 7 types) |
| `docs/eureka/sections/30-learning-systems.md` §2.3 | F3: clock absence documented; F5: named interface shapes; F6: expanded guard contracts |

## Deferred

**M7-C:** "Atomic feedback contract — storage-layer responsibility." `applyFeedbackById` is a non-atomic read-then-write. Callers must serialize. The storage backend (Crispin's SQLite) must implement row-level locking or serializable transactions. This is a deferred RED beat.

## Laura Coordination Notes

- **F3 (clock removal):** `Laura: drop clock: fixedClock from applyFeedback*/applyFeedbackById* invocations in recall-feedback.test.ts`. The `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps` interfaces no longer have a `clock` field; TypeScript strict mode will reject the extra property. *(Current test file does not appear to pass clock — confirmed by 29/29 green on this branch.)*
- **F6 (currentTrust validation):** New `RangeError` on non-finite/out-of-range `currentTrust`. If any test passes deliberately invalid trust values expecting no throw, those tests need updating. No such tests found in current file.
