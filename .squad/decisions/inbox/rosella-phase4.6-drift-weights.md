# R5 — Drift Weight Export Verification + Alexander Coordination

**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-03  
**Status:** Decision documented — no code change needed

---

## Finding

`DRIFT_WEIGHTS` is **already exported** as a named `const` from
`packages/forge/src/telemetry/drift.ts`:

```typescript
export const DRIFT_WEIGHTS: Readonly<Record<keyof DriftSignals, number>> = Object.freeze({
  convergence:    0.30,
  tokenPressure:  0.15,
  toolEntropy:    0.25,
  contextBloat:   0.15,
  promptStability: 0.15,
});
```

No changes required on my side — the single source of truth is in place.

---

## Weight Mapping Note (for Alexander)

The kickoff §2.6 lists net-impact weights as:
> convergence: 0.30, toolEntropy: 0.25, promptStability: 0.15, cacheHit: 0.15, cost: 0.15

These map to `DRIFT_WEIGHTS` fields as follows:

| net_impact term  | DRIFT_WEIGHTS key | Weight |
|------------------|-------------------|--------|
| convergence      | convergence       | 0.30   |
| toolEntropy      | toolEntropy       | 0.25   |
| promptStability  | promptStability   | 0.15   |
| cacheHit         | contextBloat      | 0.15   |
| cost             | tokenPressure     | 0.15   |

> ⚠️ Note: `cacheHit` delta maps to `contextBloat` weight, and `cost` delta maps
> to `tokenPressure` weight. The drift score uses context bloat and token pressure
> as proxies for cache efficiency and cost respectively. Alexander should use the
> same key ordering in `computeNetImpact` to maintain the single source of truth.

---

## Dependency Decision: cairn↔forge import

**Question:** Should `packages/cairn` import `DRIFT_WEIGHTS` directly from
`packages/forge`, or duplicate the constants?

**Recommendation:** **Import from forge** if the package dependency already
exists (cairn uses forge types). If adding a cairn→forge dep creates a circular
graph, **duplicate the constants** in cairn and rely on Laura's L5 regression
test to flag divergence.

Alexander should check `packages/cairn/package.json` for the existing dep graph
before deciding. If he duplicates, he should add a comment pointing at the forge
source of truth:

```typescript
// Mirrors DRIFT_WEIGHTS from packages/forge/src/telemetry/drift.ts.
// Laura's L5 regression test asserts these match — do not edit independently.
```

---

## Action Items

- **Alexander:** Decide import-vs-duplicate. Either path is acceptable; document
  in your own inbox decision.
- **Laura:** L5 regression test should assert that the weights in `computeNetImpact`
  match `DRIFT_WEIGHTS` from drift.ts — this is the guard regardless of import strategy.
- **Rosella:** No further action. `DRIFT_WEIGHTS` is exported, discoverable, frozen.
