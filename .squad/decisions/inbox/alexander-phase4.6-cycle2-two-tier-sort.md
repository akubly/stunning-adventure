# Decision: Two-Tier Sort Formulation for Matched vs Unmatched Hints (Finding #5)

**Author:** Alexander (SDK/Runtime Dev)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Finding:** #5 — sort fallback for unmatched hints

---

## Problem

When `historicalVectors` are provided, hints were sorted with:

```ts
hints.sort((a, b) => (b.predictedImpact ?? 0) - (a.predictedImpact ?? 0));
```

This conflates two cases:
- **Unmatched hints** — no summary found; `predictedImpact` remains `undefined`, coerced to `0`.
- **Matched hints with negative impact** — summary found; `predictedImpact` is set to a negative `meanNetImpact`.

Result: an unmatched hint (0) outranks a matched hint with measured negative impact (e.g., -0.1). This is a behavioral regression — measured-bad evidence is treated as worse than no evidence at all.

---

## Options Considered

### Option A: Stable-sort comparator with undefined as a separate equivalence class

```ts
hints.sort((a, b) => {
  const aMatched = a.predictedImpact !== undefined;
  const bMatched = b.predictedImpact !== undefined;
  if (aMatched && bMatched) return b.predictedImpact! - a.predictedImpact!;
  if (aMatched) return -1;  // matched before unmatched
  if (bMatched) return 1;
  return b.impactScore - a.impactScore;  // both unmatched: Phase 4.5 order
});
```

**Pro:** Single pass, no array copy.  
**Con:** The four-branch comparator obscures the semantic intent. The sort guarantee for unmatched items requires understanding that `b.impactScore - a.impactScore` preserves Phase 4.5 order *only* when input is already sorted by impactScore — which it is in the current implementation, but that's an implicit assumption.

### Option B: Explicit partition then concatenate ✅ CHOSEN

```ts
const matched = hints.filter((h) => h.predictedImpact !== undefined);
const unmatched = hints.filter((h) => h.predictedImpact === undefined);
matched.sort((a, b) => b.predictedImpact! - a.predictedImpact!);
unmatched.sort((a, b) => b.impactScore - a.impactScore);
hints.length = 0;
hints.push(...matched, ...unmatched);
```

**Pro:** The invariant is explicit and self-documenting — matched first, unmatched after, each with its own clear sort key. No implicit reliance on pre-existing hint order.  
**Con:** Two filter passes + two sorts + array reassignment. At the scale of prescriber hints (≤10 items typically), this is not a performance concern.

---

## Decision

**Option B** (explicit partition). The prescriber hint lists are small (≤10 items in typical profiles), so there is no performance argument for a single-pass comparator. The partition approach makes the invariant self-documenting and eliminates the implicit assumption about pre-existing hint order that Option A carries.

**Modified-in-place via `hints.length = 0; hints.push(...)` pattern** instead of returning a new array, because the surrounding code pattern (`const hints: OptimizationHint[] = []`) mutates and returns the same reference — maintaining that pattern avoids any possibility of the result reference diverging.

---

## Impact

- Both `promptOptimizer.ts` and `tokenOptimizer.ts` receive the identical fix.
- Laura's L3 "ranking with predicted impact" test continues to pass.
- The new edge case (unmatched-hint vs negative-matched-hint ordering) is covered by Laura's forthcoming addition.
