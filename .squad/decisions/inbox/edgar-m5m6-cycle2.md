# Decision Drop — Edgar · M5+M6 Cycle 2 Review Findings

**Author:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-30
**Branch:** eureka/m5-m6-trust-feedback
**Triggered by:** review-cycle cycle 2 (Skeptic + Architect panels)

---

## F-C2-1 — correctionDelta unvalidated for NaN/Infinity

**Triage: ACCEPT**

Added a `RangeError` guard inside `case 'user_correction':` immediately after the `undefined`
check and before the trust math:

```typescript
if (!Number.isFinite(correctionDelta)) {
  throw new RangeError(
    `applyFeedback: correctionDelta must be a finite number; received ${correctionDelta}`,
  );
}
```

**Reasoning:** Cycle 1 validated `currentTrust` pre-math; the `correctionDelta` path was an
oversight. `NaN` delta produces `NaN` new trust which then propagates silently into
`TrustUpdater.update`. Rejecting non-finite delta before any arithmetic is consistent with the
established validation pattern and the "all guards fire before the first await" rule documented
in Edgar's learnings.

**Ordering preserved:** The new guard fires AFTER the `undefined` check — the existing
"missing-delta" `Error` path is unchanged.

---

## F-C2-2 — @concurrency JSDoc overpromises

**Triage: ACCEPT**

Rewrote the `@concurrency` clause on `applyFeedbackById` to accurately present both options:

1. **Caller-side serialization (recommended for v1):** per-factId queue/mutex/promise-chain at
   the activity layer. No API changes required.
2. **Backend-side atomicity (deferred to M7-C):** requires either:
   - (a) Widening `TrustUpdater.update` to accept `expectedTrust` / version token for CAS; or
   - (b) Changing to `mutate(factId, fn: trust => newTrust)` callback-style mutation.

**M7-C reference updated:** The deferred RED beat is no longer "wait for storage backend to add
atomicity" but "design the atomicity contract: caller serialization (default v1 path) vs.
API widening (CAS token or mutate callback)." Storage-layer responsibility language removed
because `TrustUpdater.update` only accepts an absolute trust value — the backend literally
cannot enforce CAS without the API change described.

**Trade-off considered:** Caller serialization is sufficient for v1 throughput; API widening
blocks on broader seam design decisions (version tokens, callback semantics). The JSDoc now
makes this explicit so M7-C has a concrete scope.

---

## F-C2-3 — FactReader contract drift

**Triage: ACCEPT · Chose Option A (strict null)**

Three-layer misalignment:
- Interface: `Promise<{trust:number}|null>` — typed null only
- Impl guard: `fact == null` — accepted undefined too
- Spec §2.3: "null or undefined"

**Decision: Option A — strict null is the contract.**

Changes:
- Interface stays `Promise<{trust:number}|null>` (source of truth, unchanged)
- `applyFeedbackById` guard changed to `fact === null` (strict equality)
- `@throws` JSDoc updated: "null or undefined" → "null"
- Spec §2.3 guard contract updated: "null or undefined" → "null"

**Trade-off considered:** Option A's risk is that an implementer who returns `undefined` via
`Map.get()` without a `?? null` coercion will see a confusing miss — the check falls through
to the `isFinite` guard which would throw a `RangeError` (wrong error type, misleading message).
However, the TypeScript interface is the contract; implementers who violate the return type own
the resulting failure. Widening the interface to `null|undefined` (Option B) would legitimize
sloppy implementations and make the union uglier for all consumers. Strict null wins.

**Existing M6-B null tests** (Laura's `recall-feedback.test.ts`) use `null` in their mocks —
they remain GREEN after this change.

---

## Coordination Notes for Laura

**New test needed (low priority, can land with Laura's current wave):**

`correctionDelta` NaN guard — suggest adding to `recall-feedback.test.ts`:

```typescript
it('throws RangeError when correctionDelta is NaN (§30 §2.3 finite guard)', async () => {
  await expect(
    applyFeedback(
      { factId: 'f1', sessionId, event: 'user_correction', currentTrust: 0.5, correctionDelta: NaN },
      { trustUpdater: { update: vi.fn() } },
    ),
  ).rejects.toThrow(RangeError);
  // trustUpdater must NOT be called
  expect(trustUpdater.update).not.toHaveBeenCalled();
});
```

And similarly for `correctionDelta: Infinity` / `-Infinity`.

**F-C2-3 impact on Laura's tests:** Zero — all existing `applyFeedbackById` null tests use
`mockResolvedValue(null)` which strict `=== null` handles correctly.

---

## Build / Test Status

- `npm run build --workspace=@akubly/eureka`: ✅ clean (exit 0)
- `npm test --workspace=@akubly/eureka`: ✅ 37/37 passing
