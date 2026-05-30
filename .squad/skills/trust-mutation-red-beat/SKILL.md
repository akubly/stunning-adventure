# Skill: trust-mutation-red-beat

**Author:** Laura (Tester)  
**Created:** 2026-05-30  
**Status:** ACTIVE  
**Context:** Eureka v1 — but pattern is reusable for any event-driven trust/score mutation seam

---

## Purpose

How to write a focused RED beat for a trust (or any scalar-property) mutation seam, where:
- A feedback event triggers a delta computation
- The delta is applied via an injected write-seam collaborator
- The domain has clamping invariants (e.g., trust ∈ [0.0, 1.0])

The skill produces 4 tests that cover: the happy path, the ceiling clamp, the inverse event, and the floor clamp. This is the minimum set that proves both the delta logic AND the domain bounds.

---

## Pattern

### 1. Identify the contract

Read the spec section for delta rules. Confirm:
- What event types trigger which delta magnitudes (+0.10, -0.10, etc.)
- What the domain bounds are ([0.0, 1.0] for trust)
- Whether any event types have ambiguous direction (e.g., "±0.30") — document and defer if ambiguous

### 2. Design the write-seam collaborator (London-school)

The activity under test owns **delta computation only**. A separate collaborator owns the **write side**.

```typescript
// Inline structural mock — discover the interface from the test
const writeSideSeam = {
  update: vi.fn().mockResolvedValue(undefined),
};
```

Pass the NEW (post-delta, post-clamp) value to the updater — not the raw delta. This keeps the updater stateless and ignorant of domain clamping rules.

### 3. Design the activity signature

```typescript
async function applyMutation(
  options: {
    entityId:     string;       // ID of the entity whose property is mutated
    sessionId:    SessionId;    // branded primitive — always required
    event:        EventUnion;   // discriminated union of event types
    currentValue: number;       // caller-provided current value (read seam deferred)
  },
  deps: {
    updater: WriteSideSeam;
    clock:   ClockProvider;     // REQUIRED per §55 §1.2; no optional default
  },
): Promise<void>
```

**Key design decisions:**
- `currentValue` is caller-provided for the RED beat. The read seam (how to get currentValue from storage) is a separate concern; defer it.
- `clock` is always in deps even if not immediately used — maintains consistency with M1–M4 pattern; production impl may timestamp the event.

### 4. Write exactly 4 tests

| Test # | Purpose | Fixture | Expected result | Clamped? |
|---|---|---|---|---|
| 1 | Happy path, positive delta | `currentValue = mid-range` | `currentValue + delta` | No |
| 2 | Ceiling clamp | `currentValue near max` | `max (1.0)` | Yes — min(1.0, ...) |
| 3 | Happy path, negative delta | `currentValue = mid-range` | `currentValue - delta` | No |
| 4 | Floor clamp | `currentValue near 0` | `0.0` | Yes — max(0.0, ...) |

The ceiling and floor clamp tests are critical — they prove domain invariants hold, not just algorithm logic.

### 5. Assert on updater call (not on activity return value)

The activity returns `void`. Assert that:
- `updater.update` was called exactly once (`toHaveBeenCalledOnce()`)
- The call received the correct arguments including the clamped new value

```typescript
expect(updater.update).toHaveBeenCalledOnce();
expect(updater.update).toHaveBeenCalledWith({
  entityId: 'entity-001',
  sessionId,
  value: 0.70,  // post-delta, post-clamp
});
```

For clamp tests, use `expect.objectContaining` to focus on the value:
```typescript
expect(updater.update).toHaveBeenCalledWith(
  expect.objectContaining({ value: 1.0 }),
);
```

### 6. File placement

Put in a NEW test file (not the existing recall.test.ts) to avoid module-level import errors from the missing export breaking existing tests:

```
packages/eureka/src/activities/__tests__/recall-feedback.test.ts
```

The import of the not-yet-exported function produces `undefined` at runtime (not a module load error), so all 4 new tests fail with "not a function" while the existing test file passes cleanly.

---

## RED Failure Signature

```
TypeError: (0 , applyFeedback) is not a function
```

This is the correct RED failure — **missing collaborator/missing wiring**, not a typo or import error. Existing tests in other files are unaffected.

---

## GREEN Handoff to Edgar

When handing off to Edgar (GREEN), the decision drop must specify:

1. The function name to export from the activity module
2. The interface shape for the write-seam collaborator  
3. The delta computation rules (clamped formulas)
4. Any deferred ambiguities (e.g., user_correction ± sign)
5. The verify command: `npm test --workspace=@akubly/eureka`

---

## Checklist

- [ ] Spec confirms delta magnitudes unambiguously
- [ ] Write-seam collaborator uses `vi.fn().mockResolvedValue(undefined)`
- [ ] `clock: ClockProvider` in deps (required, no default)
- [ ] `sessionId` uses `as SessionId` brand cast
- [ ] 4 tests: happy positive, ceiling clamp, happy negative, floor clamp
- [ ] Assert on `.toHaveBeenCalledOnce()` + `.toHaveBeenCalledWith()` (not on return value)
- [ ] New test file to isolate from existing tests
- [ ] Run: existing tests pass, new tests fail "is not a function"
- [ ] Decision drop documents deferred ambiguities + names Edgar as GREEN owner

---

## Applied In

- M5 RED: `packages/eureka/src/activities/__tests__/recall-feedback.test.ts` (2026-05-30)
  - `applyFeedback` with `TrustUpdater` seam
  - corroboration (+0.10) and contradiction (−0.10) events
  - user_correction (±0.30) deferred — ambiguous sign

- M6 RED: `packages/eureka/src/activities/__tests__/recall-feedback.test.ts` (2026-05-30)
  - **Regression-lock variation** (M6-A1–A4): 4 arithmetic user_correction tests wrote AFTER implementation. Tests passed on first run. Still valid as regression guards; document §55 deviation in test comments. The beat still needs at least one genuine RED (M6-A5 provides it).
  - **Required-field contract test** (M6-A5): `correctionDelta` is required for `user_correction`. Drives a throw-on-missing-delta guard into existence. Tests `rejects.toThrow()` against an impl that uses `?? 0` — clean RED.
  - **Read-seam orchestrator** (M6-B): `applyFeedbackById` with `FactReader` collaborator. New top-level function (not a mutation of existing `applyFeedback`). Pattern: higher-level orchestrator gets its own function to keep lower-level functions pure and independently testable.

---

## Regression-Lock Pattern (Contract-After-Implementation)

When the implementation arrives before the contract test:

1. Write the tests anyway — they lock the contract against future regressions.
2. Document the §55 deviation in test comments (inline; not hidden).
3. Check whether any contract question was left genuinely unanswered by the implementation. If yes, that question IS a proper RED beat.
4. Name the distinction clearly in the describe/it labels: "regression lock" vs. the genuine RED.

**Signature of a healthy regression-lock beat:**
- Multiple tests pass GREEN on first run (regression locks)
- At least one test fails RED (the genuine contract question the implementation didn't answer)
- All three categories documented in the decision drop
