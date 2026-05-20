# Phase 4.6 Wave 2 — Wire Curator Change Vectors → Prescriber `historicalVectors`

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-05  
**Status:** Scoping — approved for implementation  
**Depends on:** Phase 4.6 Wave 1 merged (computation primitives + prescriber ranking)

---

## 1. The Gap

Wave 1 shipped two halves that don't talk to each other:

| Side | What exists | Where |
|------|------------|-------|
| **Producer** | `sweepChangeVectors()` computes change vectors for applied hints. `summarizeChangeVectors(db, category, skillId)` aggregates them into `ChangeVectorSummary` objects. | `cairn/src/agents/curator.ts`, `cairn/src/db/changeVectors.ts` |
| **Consumer** | `analyzePromptOptimizations(profile, config?, historicalVectors?)` and `analyzeTokenOptimizations(...)` accept an optional `ChangeVectorSummary[]` to boost confidence and rank by predicted impact. | `forge/src/prescribers/promptOptimizer.ts`, `tokenOptimizer.ts` |

**What does NOT exist:** No runtime code path queries `summarizeChangeVectors` and passes the result as the `historicalVectors` argument. The prescribers are always called with `historicalVectors` omitted — they run in Phase 4.5 mode at runtime.

The missing piece is an **orchestration adapter** that:
1. Accepts a skill ID (and optionally a category list)
2. Queries the Cairn DB for all relevant change vector summaries
3. Returns `ChangeVectorSummary[]` in the shape Forge prescribers expect
4. Is callable from the site(s) that invoke prescribers

---

## 2. Wiring Shape — Architectural Decision

### Option A: Direct DB query inside the applier/prescriber call site

The caller (wherever prescribers are invoked) imports `summarizeChangeVectors` from Cairn and calls it inline before passing results to the prescriber.

| Pro | Con |
|-----|-----|
| Simplest. No new abstractions. | **Violates "Forge never imports Cairn" constraint.** The call site is in Forge or in a runtime orchestrator that links both. Direct coupling. |
| Zero new code. | Cannot unit-test the prescriber call site without a real Cairn DB. |

**Verdict:** Ruled out — breaks the acyclic dependency constraint.

### Option B: `ChangeVectorProvider` port in `@akubly/types` + Cairn adapter

Define a new interface in `@akubly/types`:

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): ChangeVectorSummary[];
}
```

Cairn implements this interface (adapter around `summarizeChangeVectors`). Forge's prescriber call site receives the provider via injection and calls it before invoking prescribers.

| Pro | Con |
|-----|-----|
| Respects acyclic deps — Forge depends on `@akubly/types`, Cairn implements. | Requires `ChangeVectorSummary` to move to (or be re-exported from) `@akubly/types`. |
| Testable: Forge tests inject a mock provider. | One more interface in the shared contract (but it's small). |
| Natural extension of `FeedbackSource` pattern (already in `@akubly/types`). | Slightly more wiring. |

**Verdict:** ✅ Recommended.

### Option C: Extend `FeedbackSource` with a `getChangeVectorSummaries` method

Add the method directly to the existing `FeedbackSource` interface rather than creating a new port.

| Pro | Con |
|-----|-----|
| No new interface — extends existing cross-package contract. | `FeedbackSource` is already 3 methods; adding a 4th keeps it cohesive (all are "read historical data for prescribing") but couples vector wiring to the same lifecycle. |
| Cairn already implements `FeedbackSource` (or will). | Harder to make optional — existing `FeedbackSource` implementations must add the method or it becomes optional with `?`. |
| Single injection point. | Less composable if vectors need to be sourced from a different provider in Phase 5. |

**Verdict:** Viable, but Option B is better. `FeedbackSource` answers "what happened?" while `ChangeVectorProvider` answers "what do we predict?" — different concerns. Separate ports keep them independently evolvable for Phase 5 (cloud vectors from a different source).

### ✅ Decision: Option B — `ChangeVectorProvider` port

**Reasoning:** Follows the established injection pattern (Forge never imports Cairn). Small contract surface. Composable — Phase 5 can add a `CloudChangeVectorProvider` without touching `FeedbackSource`. The `ChangeVectorSummary` type needs to move to `@akubly/types` anyway (it's the cross-package contract shape).

---

## 3. Work Decomposition

| # | Item | Owner | Est. Tests | Depends On | Parallel? |
|---|------|-------|-----------|------------|-----------|
| W2-1 | Add `ChangeVectorSummary` type + `ChangeVectorProvider` interface to `@akubly/types` | Roger | 0 (type-only) | — | Yes |
| W2-2 | Update Forge's `ChangeVectorSummary` in prescribers/types.ts to re-export from `@akubly/types` (or alias) | Alexander | 2 (contract tests) | W2-1 | Yes (after W2-1) |
| W2-3 | Implement `SqliteChangeVectorProvider` in Cairn — adapter around `summarizeChangeVectors` that implements the `@akubly/types` port | Rosella | 4 (unit: empty DB, single category, multi-category, unknown skill) | W2-1 | Yes (after W2-1) |
| W2-4 | Add `getAllCategories()` helper to Cairn's changeVectors CRUD — returns distinct categories from `optimization_hints` for a skill (the provider needs to know which categories to summarize) | Rosella | 3 (empty, single, multi) | — | Yes |
| W2-5 | Wire provider into prescriber call site — wherever `analyzePromptOptimizations` / `analyzeTokenOptimizations` are called at runtime, inject the provider and pass summaries | Alexander | 3 (with provider, without provider, provider returns empty) | W2-2, W2-3 | No (serial) |
| W2-6 | Integration test: end-to-end scenario from applied hint → sweep → summarize → prescribe with vector-boosted confidence | Laura | 5 (happy path, no vectors, sparse vectors, negative impact, legacy snapshot) | W2-5 | No (serial) |
| W2-7 | Update Cairn's `ChangeVectorSummary` to import from `@akubly/types` (remove duplicate type, use canonical source) | Rosella | 1 (regression) | W2-1 | Yes (after W2-1) |

**Total: 7 items, ~18 tests, critical path = W2-1 → W2-2/W2-3/W2-7 → W2-5 → W2-6.**

Items W2-1, W2-4 can start immediately. W2-2, W2-3, W2-7 can run in parallel after W2-1. W2-5 is the convergence point. W2-6 is the validation gate.

---

## 4. Boundary Watch

### Cross-package type movement

`ChangeVectorSummary` currently exists as **two independent copies** with identical shapes:
- `forge/src/prescribers/types.ts` (lines 18-30)
- `cairn/src/db/changeVectors.ts` (lines 90-101)

Laura's L5 regression test guards shape consistency, but this is the wrong long-term answer. Wave 2 must promote the canonical shape to `@akubly/types` and have both packages import from there.

### "Forge never imports Cairn" rule

**Not violated.** The `ChangeVectorProvider` interface lives in `@akubly/types`. Forge imports the interface; Cairn implements it. The runtime caller injects the Cairn adapter at the composition root (wherever the session lifecycle wires dependencies). This is the same pattern used for `FeedbackSource`.

### New shared type in `@akubly/types`

Two additions:
1. `ChangeVectorSummary` (type — promoted from forge/cairn duplicates)
2. `ChangeVectorProvider` (interface — new port)

Minimal surface. No breaking changes to existing exports.

---

## 5. Test Strategy

### Integration test scenario (W2-6)

```
Given: A Cairn DB with:
  - 1 skill ("skill-alpha") with execution profile (sessionCount=20)
  - 3 applied optimization_hints (categories: convergence, prompt-structure, cache-optimization)
  - Change vectors computed by sweepChangeVectors (sessionCount > minSessions)

When: The runtime prescriber orchestration runs:
  1. SqliteChangeVectorProvider.getSummaries("skill-alpha") returns 3 ChangeVectorSummary objects
  2. analyzePromptOptimizations(profile, config, summaries) is called
  3. analyzeTokenOptimizations(profile, config, summaries) is called

Then:
  - Hints with matching category+skillId have predictedImpact set
  - Hints with matching category+skillId have confidence boosted (> baseline)
  - Hints are sorted by predicted impact (matched first, unmatched after)
  - With no vectors: behavior identical to Phase 4.5 (backward compat)
  - With sparse vectors (< minSessions): confidenceBoost = 1.0 (no penalty)
```

### Negative/edge test scenarios

| Scenario | Expected |
|----------|----------|
| No change vectors in DB | Provider returns `[]`, prescribers run in Phase 4.5 mode |
| All vectors have negative net_impact | predictedImpact is negative, hints sort lower but still present |
| Legacy snapshots (no sessionCount) | deltaCost = 0 in vectors; summaries still computed from remaining deltas |
| Unknown skill ID | Provider returns `[]` |
| Provider injection omitted (optional) | Prescribers called without historicalVectors — no regression |

---

## 6. Risks & Open Questions

### Needs Aaron's input

1. **Category enumeration strategy.** The provider needs to know which categories to summarize for a skill. Option A: query distinct categories from `optimization_hints` table (W2-4). Option B: hardcode the `OptimizationCategory` union members. **Recommendation:** Option A (data-driven), but confirm.

2. **Performance budget.** `summarizeChangeVectors` runs one SQL query per (category, skillId) pair. With 6 categories that's 6 queries per prescriber invocation. Acceptable for local SQLite (~1ms each), but should we batch into a single query? **Recommendation:** Ship simple (per-category queries), optimize if profiling shows >10ms total.

3. **Negative-impact attenuation.** Wave 1 deferred "vectors with negative impact should attenuate confidence." Wave 2 wires vectors to prescribers — should we also implement the attenuation multiplier, or keep it deferred? **Recommendation:** Keep deferred (Wave 1 policy was Aaron's call). Wire first, tune later.

4. **Call site location.** Where exactly do prescribers get called at runtime? Currently they're only called from tests and exported from the barrel. The runtime call site needs to be identified or created. If it's the Curator's `curate()` function, that means Cairn calls Forge prescribers — which reverses the dependency direction. More likely: the call site is in a session lifecycle hook in Forge that receives a `ChangeVectorProvider` via injection. **Recommendation:** Prescriber invocation stays in Forge; Cairn provides the data via the port.

### Known risks

| Risk | Mitigation |
|------|-----------|
| Type promotion to `@akubly/types` breaks existing test imports | Roger/Alexander coordinate — Forge and Cairn tests update imports in the same PR |
| Provider injection requires a new composition root or wiring point | Identify the session lifecycle hook where prescribers will be called; may need a lightweight orchestrator function |
| Performance regression from 6 extra DB queries at prescriber time | Benchmark; batch query available as follow-up optimization |

---

*This scoping document covers the architecture and decomposition. Implementation begins after Aaron confirms the open questions above.*
