---

# Archived: 2026-05-22T20:05:10Z
# Squad Decisions

## Active Decisions


# Phase 4.6 Kickoff — Change Vector Learning

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-03  
**Status:** Kickoff — ready for team spawn  
**Branch:** `squad/phase4.6-change-vectors`

---

## 1. Branch Decision

**Decision:** New branch `squad/phase4.6-change-vectors` from `squad/phase4-export-pipeline`.

**Rationale:**
- Phase 4.5 is complete (1012 tests, review-hardened). Clean phase boundary.
- PR-per-phase pattern established in Phases 3, 4, 4.5.
- Keeps the diff reviewable — Phase 4.6 is ~200 LOC, but will have its own test surface.
- If Phase 4.6 needs to bake longer, it doesn't block Phase 4.5 merge to main.

**Alternative rejected:** Continue on current branch. Would blur the PR boundary and make rollback harder if change vectors need iteration.

---

## 2. Spec Clarifications (Resolved)

### 2.1 Migration 012 Placement

**Resolved:** `packages/cairn/src/db/migrations/012-change-vectors.ts`, registered in `schema.ts` (version 12). Follows exact pattern of migrations 010/011.

### 2.2 Where `change_vectors` Writes Happen

**Resolved:** New CRUD module `packages/cairn/src/db/changeVectors.ts` owns reads/writes. The **computation trigger** is the Curator sweep — when aggregating profiles, if a hint with status `'applied'` has a subsequent metric snapshot available (from a later execution_profile update), the Curator computes and inserts the change vector. This is NOT in the prescriber or applier — it's a post-hoc observation.

**Rationale:** The Curator already owns cursor-based aggregation sweeps. Adding vector computation to the sweep is O(applied_hints) per sweep, naturally rate-limited, and consistent with the "observe, don't block" principle.

### 2.3 `historicalVectors` Integration with Prescriber Signatures

**Resolved:** Add optional third parameter to both prescribers:

```typescript
// Before (Phase 4.5):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig): PrescriberResult

// After (Phase 4.6):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig, historicalVectors?: ChangeVectorSummary[]): PrescriberResult
```

**Type definition** (in `prescribers/types.ts`):
```typescript
export interface ChangeVectorSummary {
  category: OptimizationCategory;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  confidence: number; // log-scaled boost
}
```

**Why optional param, not config:** Config is static per-invocation. Vectors are dynamic data queried per-skill. Semantic distinction matters for testability — tests can pass vectors directly without mocking a DB query.

### 2.4 "Before/After Metric Snapshots" — Concrete Meaning

**Resolved:**
- **Before:** `optimization_hints.metric_snapshot` JSON column (captured at hint generation time, already exists in migration 011).
- **After:** The `execution_profiles` row for the same `skill_id` at the time the Curator sweep runs (post-application).
- **Delta:** `after_value - before_value` for each of the 5 metric fields in `MetricSnapshot`.

No new "snapshot" table needed — the before is already stored, the after is the live profile.

### 2.5 Min `sessions_observed` Window

**Decision:** Configurable with sensible default.

```typescript
export interface ChangeVectorConfig {
  /** Minimum sessions between before/after to consider vector valid. Default: 3. */
  minSessionsObserved?: number;
}
```

**Rationale:** Fixed value is too rigid. A skill used 100x/day needs fewer sessions than one used 2x/week. Default 3 matches the prompt optimizer's `minSessions` canary threshold.

### 2.6 Net Impact Weighting

**Decision:** Same weights as drift score (from `telemetry/drift.ts`).

The roadmap spec explicitly states: `net_impact = Σ(delta_i × weight_i) // same weights as drift score`. This means:
- convergence: 0.30
- toolEntropy: 0.25 (maps to `delta_drift` since drift subsumes entropy)
- promptStability: 0.15
- cacheHit: 0.15
- cost: 0.15

**Import the weight constants** from `telemetry/drift.ts` rather than duplicating. Single source of truth.

---

## 3. Work Decomposition

### Wave 1 — Foundation (Alexander, parallel with Rosella type work)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| A1 | Alexander | Migration 012 | `012-change-vectors.ts` — CREATE TABLE + indices per roadmap §1.2 | — |
| A2 | Alexander | Schema registration | Import + register migration012 in `schema.ts`, version bump to 12 | A1 |
| A3 | Alexander | CRUD module | `packages/cairn/src/db/changeVectors.ts` — insert, getByHintId, getByCategory, computeNetImpact | A1 |
| A4 | Alexander | Curator integration | Add vector computation to Curator sweep: for each `applied` hint with sufficient post-application sessions, compute + insert vector | A3 |

### Wave 2 — Prescriber Enhancement (Rosella)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| R1 | Rosella | Types | `ChangeVectorSummary` interface in `prescribers/types.ts` | — |
| R2 | Rosella | Confidence scaling | `computeConfidenceBoost(vectorCount, minVectors)` utility in `prescribers/utils.ts` | R1 |
| R3 | Rosella | Prompt prescriber integration | Add `historicalVectors?` param to `analyzePromptOptimizations`, apply confidence boost + predicted impact ranking | R1, R2 |
| R4 | Rosella | Token prescriber integration | Same for `analyzeTokenOptimizations` | R1, R2 |
| R5 | Rosella | Weight import | Import drift weights from `telemetry/drift.ts` for `computeNetImpact` — ensure single source of truth | — |

### Wave 3 — Tests (Laura)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| L1 | Laura | Migration tests | 012 applies cleanly, idempotent re-run, table/index existence | A1 |
| L2 | Laura | CRUD tests | Insert/query/net-impact-computation for changeVectors module | A3 |
| L3 | Laura | Prescriber integration tests | Both prescribers with/without historicalVectors — verify confidence boost, ranking changes, edge cases (empty vectors, single vector, negative impact) | R3, R4 |
| L4 | Laura | Curator vector computation test | End-to-end: applied hint → profile update → sweep → vector appears | A4 |
| L5 | Laura | Weight consistency test | Assert net_impact weights match drift score weights (regression guard) | R5 |

### Critical Path

```
A1 → A2 (trivial)
A1 → A3 → A4
R1 → R2 → R3/R4
A3 + R3/R4 → L3
A4 → L4
```

**Estimated scope:** ~200 LOC production, ~150 LOC tests, 15-20 new tests. 1-day sprint for the team.

---

## 4. ADRs for This Phase

### ADR-P4.6-001: Curator owns vector computation (not prescriber, not applier)

Vectors are post-hoc observations about prescription efficacy. The Curator already sweeps periodically. Adding computation here keeps the prescriber pure (stateless analysis) and the applier focused on writes.

**Alternative rejected:** Compute in the applier after applying a hint. Problem: the "after" snapshot isn't available yet at application time — you need subsequent sessions to measure the effect.

### ADR-P4.6-002: Optional parameter over config object for historicalVectors

Keeps the prescriber testable without mocking a database. Tests pass vectors directly. Production code queries them from CRUD and passes in.

**Alternative rejected:** Add `vectorSource: () => ChangeVectorSummary[]` to config. Over-abstracted for a single call site.

### ADR-P4.6-003: Same weights as drift score

Single source of truth for "what matters" (Determinism > Cost). No independent weight tuning for net impact — if drift weights change, net impact changes too. Avoids divergent optimization signals.

---

## 5. Open Questions for Aaron

1. **Vector TTL:** Should old change vectors expire? The roadmap doesn't specify. My recommendation: no TTL for now — vectors are small and historical accuracy improves with data. Revisit if table exceeds 10K rows.

2. **Negative vectors:** If a prescription made things worse (negative net_impact), should it influence future confidence negatively (reduce confidence below baseline)? My recommendation: yes — `confidence_boost = log(1 + vectors_count) / log(1 + min_vectors)` only handles positive correlation. We should also apply a penalty multiplier when `meanNetImpact < 0`. But this is an enhancement we can add in Wave 2 without blocking Wave 1.

---

## 6. Ready to Spawn

**Status: YES — ready to spawn.**

All ambiguities resolved. Work items are concrete. No blockers.


# Decision: Weight Constants in Cairn (ADR-P4.6-003 Implementation)

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-03  
**Status:** Decided  
**Relates to:** ADR-P4.6-003 (same weights as drift score, single source of truth)

---

## Context

The `computeNetImpact` function in `packages/cairn/src/db/changeVectors.ts` requires the
same drift-signal weights used by `DRIFT_WEIGHTS` in `packages/forge/src/telemetry/drift.ts`.

ADR-P4.6-003 mandates a single source of truth: if drift weights change, net_impact must
change with them.

## Problem

Cairn cannot import from Forge. The dependency graph constraint is acyclic: Forge never
imports Cairn, and Cairn has no `@akubly/forge` dependency in its `package.json`. Adding
one would introduce a circular dependency (`@akubly/cairn` ← `@akubly/forge` ← ... ← back).

The kickoff doc §2.3/A3 explicitly acknowledged this risk and provided the fallback:
> "If there's a circular dep risk between cairn and forge, instead define the weight constants
> in cairn AND add a Laura-checked regression test (L5) confirming they match."

## Decision

**Mirror the constants in Cairn with explicit mapping documentation.**

`packages/cairn/src/db/changeVectors.ts` exports `CHANGE_VECTOR_WEIGHTS` with values
mirrored from `DRIFT_WEIGHTS`, with the delta-field → drift-signal mapping documented inline:

```typescript
export const CHANGE_VECTOR_WEIGHTS = Object.freeze({
  deltaDrift:        0.25,  // DRIFT_WEIGHTS.toolEntropy (drift subsumes entropy)
  deltaCost:         0.15,  // DRIFT_WEIGHTS.contextBloat (cost ↔ context utilization)
  deltaSuccessRate:  0.15,  // DRIFT_WEIGHTS.promptStability
  deltaConvergence:  0.30,  // DRIFT_WEIGHTS.convergence
  deltaCacheHit:     0.15,  // DRIFT_WEIGHTS.tokenPressure (cache ↔ token efficiency)
});
```

## Net-Impact Sign Convention

Deltas are stored as `after - before`. For lower-is-better metrics (drift, cost, convergence),
a negative delta = improvement. `computeNetImpact` negates these before weighting so that
**positive net_impact = prescription was beneficial**:

```
net_impact = -deltaDrift * 0.25
           + -deltaCost * 0.15
           + deltaSuccessRate * 0.15
           + -deltaConvergence * 0.30
           + deltaCacheHit * 0.15
```

This makes `meanNetImpact` in `ChangeVectorSummary` directly comparable: positive = good,
negative = prescription made things worse (Wave 2 penalty hook point).

## Rationale for Rejection of Alternatives

| Alternative | Rejection reason |
|-------------|-----------------|
| Import DRIFT_WEIGHTS from forge into cairn | Creates circular dep |
| Extract weights to `@akubly/types` | Adds coupling for no composability gain; types pkg is for shared types, not algorithmic constants |
| Pass weights as parameter to computeNetImpact | Over-abstracted; only one caller, weights are stable constants |

## Regression Guard

Laura's **L5 test** (`curatorVectors.test.ts` or dedicated file) must assert:
```typescript
// cairn CHANGE_VECTOR_WEIGHTS values match forge DRIFT_WEIGHTS values
expect(CHANGE_VECTOR_WEIGHTS.deltaConvergence).toBe(DRIFT_WEIGHTS.convergence);    // 0.30
expect(CHANGE_VECTOR_WEIGHTS.deltaDrift).toBe(DRIFT_WEIGHTS.toolEntropy);          // 0.25
expect(CHANGE_VECTOR_WEIGHTS.deltaSuccessRate).toBe(DRIFT_WEIGHTS.promptStability); // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCacheHit).toBe(DRIFT_WEIGHTS.tokenPressure);     // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCost).toBe(DRIFT_WEIGHTS.contextBloat);          // 0.15
```

This test imports from both packages from the monorepo root and will fail if either set
of constants drifts. It is the enforcement mechanism for ADR-P4.6-003.

## Sessions-Observed Proxy

A secondary decision: the Curator sweep uses `execution_profiles.session_count` as the
proxy for "sessions since hint applied". The `metric_snapshot` stored at hint-generation
time does not include session count (not in `MetricSnapshot`), so exact delta is not
available. Using total session count as the minimum guard (≥ minSessionsObserved = 3) is
conservative and safe: it means vectors are only computed once a skill has at least 3
sessions, which is the same threshold the prompt optimizer uses for canary decisions.
The `sessions_observed` field in the inserted row records the actual total session count
at computation time, giving downstream consumers full context.


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


# Defect Flag: `summarizeChangeVectors` confidence=0 inconsistency

**From:** Laura (Tester)  
**Date:** 2026-05-03  
**Phase:** 4.6 — Change Vector Learning  
**Severity:** Latent risk (not a production path today)  
**Assigned to:** Team (Graham to triage)

---

## Summary

`summarizeChangeVectors` returns `confidence: 0` when `vectorCount === 0`,
but `computeConfidenceBoost(0)` returns `1.0`. These two are inconsistent,
and the inconsistency can cause silent confidence zeroing if a zero-vector
summary is ever passed to a prescriber.

---

## Details

### `computeConfidenceBoost(n: number)` (forge, Rosella R1)

```ts
export function computeConfidenceBoost(vectorCount: number): number {
  // returns 1.0 when vectorCount === 0 (no evidence → no change)
  if (vectorCount === 0) return 1.0;
  // ...
}
```

Rosella's design intent: absence of evidence = neutral (multiply by 1.0,
no modification to existing confidence).

### `summarizeChangeVectors(...)` (cairn, Alexander A3)

```ts
if (rows.length === 0) {
  return { vectorCount: 0, meanNetImpact: 0, confidence: 0 };
}
```

Alexander's current behavior: absence of vectors → `confidence: 0`.

### The conflict

If a prescriber receives a summary with `confidence: 0` and applies the
confidence boost formula:

```ts
hint.confidence *= summary.confidence; // 0 → zeroes out all confidence
```

Every hint's confidence would be zeroed. This is **not a current production
path** — the prescribers currently only call `computeConfidenceBoost(summary.vectorCount)`,
not `hint.confidence *= summary.confidence`. But the inconsistency is a
latent trap for future developers.

---

## Expected behavior (my read)

When `vectorCount === 0`, `summarizeChangeVectors` should return
`confidence: 1.0` to match `computeConfidenceBoost(0)`.

OR: the field name should be changed to make the zero-default semantics
explicit (e.g., `rawConfidence` vs `boost`).

---

## Impact

- **Current production:** No impact. Prescribers call `computeConfidenceBoost(vectorCount)`,
  not `summary.confidence`.
- **Latent risk:** Any future code that does `hint.confidence *= summary.confidence`
  will silently zero confidence when there are no vectors.
- **Test coverage:** `changeVectors.test.ts` L2 has an `it.todo` for
  `'summarizeChangeVectors — confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)'`
  which documents this expected fix.

---

## Suggested resolution

Option A (minimal): Change `confidence: 0` to `confidence: 1.0` in the
zero-vector branch of `summarizeChangeVectors`.

Option B (clarifying): Rename the field to make the semantic explicit, and
document the "no vectors = no change" contract in JSDoc.

Option C (defer): Accept the inconsistency as intentional (zero confidence
= "we have no data, don't trust this hint") and update `computeConfidenceBoost`
to also return 0 for vectorCount=0. Then the prescriber logic becomes "if
confidence=0, skip the hint."

---

## Next action

Graham to decide between A/B/C in the next decision meeting. If Option A or
B is chosen, Alexander to patch `changeVectors.ts` and Laura to upgrade the
`it.todo` in `changeVectors.test.ts`.


# Verdict: `summarizeChangeVectors` confidence=0 inconsistency

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-03
**Phase:** 4.6 — Change Vector Learning
**Triggered by:** Laura's defect flag (`laura-phase4.6-summarize-confidence-zero.md`)
**Status:** DECIDED

---

## Verdict: B — Rename field to `confidenceBoost`

### Rationale

Aaron's analysis is correct and I'm adopting it. A confidence *level* and a
confidence *boost* occupy different mathematical spaces:

- **Level** ∈ [0, 1]: "how sure are we?" — 0 = no confidence, 1 = full confidence.
- **Boost** ∈ ℝ⁺ (multiplicative): "how much should we scale existing confidence?" — 1.0 = identity (no change), >1.0 = amplify, <1.0 = attenuate.

The field is named `confidence` but the JSDoc (my own kickoff doc, §2.3) says
"log-scaled boost" and `computeConfidenceBoost(0)` returns `1.0`. The field
name lies about what it contains. That is the root cause — Alexander's `0`
makes perfect sense *if* confidence is a level, and Rosella's `1.0` makes
perfect sense *if* confidence is a boost. Both implementations are internally
consistent; the bug is the ambiguous type definition.

Option A (patch value to 1.0) would fix the symptom but leave the misleading
name in place — the next developer who reads `confidence: number` will assume
level semantics and write `if (summary.confidence === 0)` instead of
`if (summary.confidenceBoost === 1.0)`.

Option C is rejected outright: returning 0 for zero vectors would zero out
every hint's confidence at cold start (no vectors yet), which defeats the
canary bootstrap from Phase 4.5. That's a functional regression, not a fix.

### New field name: `confidenceBoost`

Alternatives considered:

| Name | Pros | Cons | Decision |
|------|------|------|----------|
| `confidenceBoost` | Self-documenting, matches `computeConfidenceBoost()` function name | Slightly long | **Chosen** |
| `boostFactor` | Short | Generic — doesn't say *what* it boosts | Rejected |
| `vectorBoost` | Ties to source data | Doesn't communicate that it scales *confidence* | Rejected |

`confidenceBoost` wins because it mirrors the existing function name
`computeConfidenceBoost()` — one name, one concept, zero ambiguity.

---

## Files to change

| # | File | Change | Current owner |
|---|------|--------|---------------|
| 1 | `packages/forge/src/prescribers/types.ts` | `confidence` → `confidenceBoost` in `ChangeVectorSummary`; update JSDoc | Rosella (R1) |
| 2 | `packages/cairn/src/db/changeVectors.ts` | `confidence` → `confidenceBoost` in local `ChangeVectorSummary` + `summarizeChangeVectors` return; fix zero-vector case from `0` → `1.0` | Alexander (A3) |
| 3 | `packages/forge/src/prescribers/promptOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R3) |
| 4 | `packages/forge/src/prescribers/tokenOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R4) |
| 5 | Tests (multiple files) | Update all references to `.confidence` on `ChangeVectorSummary` objects | Laura (L2, L3) |

---

## Fix routing (Reviewer Rejection Protocol §lockout)

The lockout rule: the author of the buggy code may NOT be the one to fix it.
A different agent must make the correction.

| Code to fix | Written by | Fixed by | Rationale |
|-------------|-----------|----------|-----------|
| `packages/cairn/src/db/changeVectors.ts` — rename field + fix `0` → `1.0` | Alexander (A3) | **Rosella** | Alexander wrote the zero-default; lockout applies |
| `packages/forge/src/prescribers/types.ts` — rename field in interface | Rosella (R1) | **Alexander** | Rosella defined the type; lockout applies |
| `packages/forge/src/prescribers/promptOptimizer.ts` — update reference | Rosella (R3) | **Alexander** | Same author, same lockout |
| `packages/forge/src/prescribers/tokenOptimizer.ts` — update reference | Rosella (R4) | **Alexander** | Same author, same lockout |
| Tests (`changeVectors.test.ts`, `prescribers-vectors.test.ts`, etc.) | Laura | **Laura** | Test updates are Laura's domain regardless of lockout |

**Summary:**
- **Alexander** fixes: `types.ts`, `promptOptimizer.ts`, `tokenOptimizer.ts` (Rosella's code)
- **Rosella** fixes: `changeVectors.ts` (Alexander's code)
- **Laura** fixes: all affected test files

---

## ADR reference

This verdict extends ADR-P4.6-002 (§4 of kickoff doc): the `ChangeVectorSummary`
type's `confidenceBoost` field carries boost-multiplier semantics with identity
value 1.0. Prescribers apply it as `hint.confidence *= summary.confidenceBoost`.

---

## Verification criteria

1. `computeConfidenceBoost(0)` returns `1.0` ✓ (already correct, no change needed)
2. `summarizeChangeVectors(db, cat, skill)` returns `confidenceBoost: 1.0` when vectorCount === 0
3. No remaining references to `summary.confidence` in prescriber or CRUD code
4. All existing tests pass after rename
5. Laura's `it.todo` for "confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)" is upgraded to a passing test



### 2026-05-01: Phase 4 Export Pipeline Architecture

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 introduces the Export Pipeline — the third integration seam from the Forge build kickoff. It converts persisted `CairnBridgeEvent`s into certified SKILL.md files with DBOM provenance in YAML frontmatter.

**Key Decisions:**

#### ADR-P4-001: Fixed pure-function pipeline (not plugin architecture)
Four stages: Extract → Strip → Attach → QualityGate. Pure functions composed by `runExportPipeline()`. Dynamic stage registration rejected as YAGNI.

#### ADR-P4-002: Quality gate as injected function
`ExportQualityGate` is a function type in Forge. Cairn satisfies it at the call site. Consistent with `createModelCatalog(listFn)` pattern. Forge never imports Cairn.

#### ADR-P4-003: DBOM upsert (replace) semantics
One DBOM per session. Re-export replaces. Versioned history rejected — no current consumer.

#### ADR-P4-004: Soft quality gate failure
Gate failure returns `success: false` with the compiled skill still included. Caller decides write policy. DBOM persistence failures are fail-open.

#### ADR-P4-005: No new shared types
All Phase 4 types stay package-internal. Continues ADR-P3-004 precedent.

**Impact:**
- **New files:** `packages/forge/src/export/` (5 files), `packages/cairn/src/db/migrations/010-dbom-artifacts.ts`, `packages/cairn/src/db/dbomArtifacts.ts`
- **Modified files:** `packages/cairn/src/db/schema.ts` (register migration), `packages/forge/src/index.ts` (barrel update)
- **Tests:** 99 total (62 contract + 37 production)

**Specification:** Full spec at `docs/forge-phase4-spec.md`.

---

### 2026-05-01: Export Pipeline — Function Types over Shared Interfaces

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 export pipeline needs a quality gate that runs Cairn's linter/validator on compiled SKILL.md content. Forge must never import @akubly/cairn directly (acyclic dependency graph constraint).

**Decision:**
Quality gate is a simple function type `(skillContent: string) => QualityGateResult` defined in `forge/export/types.ts`. The caller (Cairn MCP tool or CLI) wires Cairn's functions into this shape. No shared interface in `@akubly/types`.

All Phase 4 types (`ExportDiagnostic`, `QualityGateResult`, `CompiledSkill`, `SkillFrontmatterInput`, `StageContext`, pipeline config/result types) stay package-internal in forge.

**Rationale:**
- Only one call site needs this contract — a shared interface in @akubly/types adds coupling for no composability gain.
- Function types are the simplest contract. If the quality gate signature changes, only forge and the one wiring site update.
- Consistent with Phase 3 pattern (`createModelCatalog(listFn)`).
- No new shared types means zero risk of cross-package type churn.

**Impact:**
- 5 new files in `packages/forge/src/export/`
- 32 new unit tests, 99 total export tests
- Forge test count: 326 → 388

---

### 2026-05-01: Export Pipeline Quality Gate Semantics

**Author:** Laura (Tester)  
**Type:** Test Contract  
**Status:** Implemented  
**Date:** 2026-05-01 (updated from 2026-04-30)

Phase 4 export pipeline uses quality gates before emitting a compiled SKILL.md. Now aligned with `docs/forge-phase4-spec.md` §4.4, §4.5, §7.

**Decision (spec-aligned):**
- Quality gate is an injected `ExportQualityGate = (skillContent: string) => QualityGateResult`
- `QualityGateResult.passed === false` → `ExportPipelineResult.success = false`
- Quality gate failure is **fail-closed but soft**: compiled skill is still returned for inspection, `qualityGatePassed = false`
- DBOM persistence failure is **fail-open**: warning diagnostic, pipeline continues
- Gate results propagate: `lintErrors`, `lintWarnings`, `validationScore` flow to pipeline result
- If the quality gate function **throws**, spec §7.1 says catch + diagnostic. Current inline implementation propagates — Roger should add try/catch in production (implemented by Coordinator).

**Key Finding:**
`validateStage` did NOT catch exceptions from the injected quality gate. Spec §7.1 explicitly says "Catch + diagnostic" for this case. Test documents this gap — production `validateStage` must wrap the gate call in try/catch. **Coordinator fixed in production implementation.**

**Impact:**
- 62 contract tests + 37 production tests in `export.test.ts` (99 total)
- `ExportQualityGate` replaces the old `CairnToolkit` interface (simpler, one function vs five)
- Forge never imports `@akubly/cairn` — gate is wired at call site per §5.2
- All 99 tests passing (100%)

---

### 2026-04-30: Event Dedup Guard — bridgeAttached flag

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Defensive Correctness
**Status:** Implemented

ADR-P3-005 defines dual event paths: `SessionConfig.onEvent` captures events during `createSession()` (before `session.on()` is wired), and `session.on()` captures events after `ForgeSession` construction. Design reviewers independently flagged that if the SDK fires events via `onEvent` after `createSession` resolves — during the gap before `ForgeSession` wires `session.on()` — both paths would emit the same event, causing duplicate `CairnBridgeEvent`s. This corrupts `TokenTracker` accumulation and `DBOM` reconstruction.

Added a `bridgeAttached` boolean flag in `ForgeClient.createSession()`. The `onEvent` closure checks this flag and returns early if `true`. The flag is set immediately before `ForgeSession` construction (which wires `session.on()` in its constructor).

**Alternatives Considered:**
1. Hash-based dedup (eventId or type+timestamp LRU) — More robust against unknown overlap patterns, but adds complexity (LRU cache, hash computation) for a problem that has a clean temporal boundary. Rejected as over-engineering for a Technical Preview SDK.
2. No guard — Relies on SDK honoring the non-overlapping window contract. Rejected because the SDK has shipped 52 versions in 3 months — behavioral contracts are unstable.

**Impact:**
- `packages/forge/src/runtime/client.ts` — ~4 LOC added (flag declaration, check, set)
- `packages/forge/src/__tests__/runtime.test.ts` — 2 new tests (overlap prevention + pre-bridge capture confirmation)
- All 289 tests pass, zero regressions

---

### 2026-04-29: Mock Session Unsubscribe Semantics

**Author:** Laura (Tester)
**Type:** Test Infrastructure
**Status:** Observation

While writing L6 Token Tracker integration tests, the shared mock session's `on()` returns a no-op unsubscribe function. This works fine for ForgeSession's bridge wiring (which only uses unsubscribe at disconnect time, where the whole session is torn down), but breaks any test that needs to verify real unsubscribe behavior — the handler keeps firing after "unsubscribing."

For tests requiring real unsubscribe semantics, build a dedicated `EventSource` adapter with `Set<handler>`-based subscribe/unsubscribe rather than trying to enhance the mock session. The mock session is designed for ForgeSession/ForgeClient lifecycle testing; the EventSource interface is the correct abstraction for lower-level eventing tests.

**Impact:** No changes to shared helpers needed. This is a documented pattern for future test authors: when testing event unsubscription, build a standalone EventSource, don't use `createMockSession()`.

---

### 2026-04-29: HookComposer Uses Live Observer Set

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Architecture
**Status:** Implemented

HookComposer class holds a live `Set<HookObserver>`. The `compose()` method returns hooks that reference the live set, so add/remove after composition takes effect on the next hook invocation without re-registering with the SDK.

**Tradeoffs:**
- **Pro:** Dynamic observer management without SDK re-registration — critical for decision gates added/removed mid-session.
- **Pro:** Each `add()` returns a dispose function — clean RAII-style cleanup.
- **Con:** Slightly more complex than a pure function; the composed hooks capture `this`.
- **Accepted:** Complexity justified because Cairn's architecture requires dynamic gate registration.

**Affects:**
- `packages/forge/src/hooks/index.ts`
- Any future code that registers decision gates or telemetry observers mid-session

---

### 2026-04-28: Forge Test Infrastructure Pattern

**Author:** Roger Wilco (Platform Dev)
**Type:** Infrastructure
**Status:** Implemented

Forge test infrastructure uses SDK mocks rather than live CLI integration for all unit tests.

**Three Test Helper Modules:**
1. **mock-sdk** — `createMockSession()` / `createMockClient()` with `vi.fn()` stubs and `_emit()` for event dispatch testing.
2. **event-factory** — Type-safe `SessionEvent` builders for all 6 core event types.
3. **type-assertions** — Runtime shape validation for `CairnBridgeEvent` conformance.

**Rationale:**
- SDK requires running Copilot CLI process for real sessions — unit tests must be offline.
- Event factory ensures tests use correctly-typed SDK events without fragile manual construction.
- Type assertion helpers serve double duty: test validation now, production runtime guards later.

**Rule:** All Forge tests must import from `./helpers/index.js`. No test may instantiate `CopilotClient` or `CopilotSession` directly.

---

### 2026-04-28: Hook Composer Must Isolate Observer Errors

**Author:** Laura (Tester)
**Type:** Implementation Requirement
**Status:** Implemented

The production `composeHooks` implementation MUST wrap each observer call in try/catch, logging errors but continuing to the next observer.

**Context:**
Spike's `composeHooks` propagates errors — if one observer's `onPreToolUse` throws, subsequent observers never run. This is dangerous in production: a buggy telemetry observer would kill the decision gate observer, silently removing safety checks.

**Implementation:**
Each observer call wrapped in try/catch. Errors logged but don't prevent subsequent observers from running.

**Test Coverage:**
- `"one observer throwing does not kill others"` — verifies isolated behavior (passing)
- `"spike composeHooks propagates errors"` — documents the spike's known gap (baseline)

**Impact:**
Telemetry observers are now safe in production. Error in one observer cannot cascade to disable decision gates or other critical observers.

---

### 2026-04-28: Alexander — SDK Interface Types for Runtime Module

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Architecture  
**Status:** Implemented

ForgeClient and ForgeSession depend on thin interface types (`SDKClient`, `SDKSession`) rather than importing CopilotClient/CopilotSession classes directly.

**Rationale:**
1. **Testability** — Mock objects from the test helpers satisfy the interface without needing the real SDK classes (which require a running Copilot CLI process).
2. **SDK churn isolation** — If the SDK adds/removes methods, only the interface definitions need updating, not every consumer.
3. **Dependency inversion** — The runtime module is constructor-injected with an `SDKClient`, making it composable and mockable at every level.

**Tradeoffs:**
- **Pro:** Tests run offline, no SDK instantiation needed.
- **Pro:** SDK method additions don't break existing code until we choose to adopt them.
- **Con:** Must manually keep interfaces in sync with the SDK surface we actually use.
- **Accepted:** The interface surface is small (~5 methods on SDKClient, ~5 on SDKSession), so maintenance cost is negligible.

**Affects:**
- `packages/forge/src/runtime/client.ts` — `SDKClient` interface
- `packages/forge/src/runtime/session.ts` — `SDKSession` interface
- All test code that uses `createMockClient()` / `createMockSession()`

---

### 2026-05-01T18:14:00Z: Phase 4.5 Local Feedback Loop — Aaron's Scope Decisions

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-05-01T18:14:00Z  
**Type:** Direction / Scope  
**Status:** Active

Phase 4.5 brainstorm Round 2 follow-up captured six major decisions:

#### 1. Loop Trigger Model
- **Forge:** Feedback loop is deliberate (manual) — user-initiated review of prescriptions
- **Cairn:** Feedback loop is automatic — pattern detection triggers prescription generation

#### 2. Profile Granularity
All four levels are viable and serve different purposes:
- **Per-skill:** Improves artifacts directly
- **Per-user:** Surfaces human insights (Cairn's core mission)
- **Per-model:** Exploratory/feedback data for determining best model per task
- **Global:** Dashboard of overall trends ("proving our pudding")

#### 3. Cold Start Strategy
Canary bootstrap is the natural choice. Training sessions deferred to Phase 4.75.

#### 4. Ancestry Graph Optimization Exploration
- Track prescription ancestry (which changes caused which drift)
- Derive heuristics about what types of changes cause directional drift
- Long-term: graph math for intelligent exploration of metric space
- Detect local optima via convergence patterns
- When wild cards come online (self-annealing, genetic programming), use graph to introduce evolutions and escape local maxima

#### 5. Feedback Loop Frequency — Maximum Detail Preferred
Aaron's prior stance: "Why would we not want as much detail as possible?" The tradeoffs need to be articulated explicitly before any future pruning decisions.

#### 6. Wild Card Ideas
All six wild cards from brainstorm are approved as future backlog items:
1. Time-Travel Debugging (rewind state to any decision point, replay with different model/parameters)
2. Predictive Cache Warming (pre-fetch likely-needed artifacts before user requests)
3. Self-Annealing Prescriptions (feedback loop automatically re-ranks prescriptions)
4. Genetic Programming Ancestry (crossover + mutation of decision graphs)
5. Karpathy Wiki Integration (encode knowledge graph as executable wiki)
6. Adaptive Skill Ranking (vector-based skill retrieval with user feedback)

**Rationale:** Team decisions from Phase 4.5 brainstorm follow-up — captured for team memory. Cascades to Phase 4.5 implementation planning, Phase 5 canary configuration, and Phase 6+ feature backlog.

**Impact:**
- Ancestry tracking: 200 LOC MVP planned for Phase 4.5
- Caching strategy: 4-layer hierarchy (L1 in-memory → L2 session → L3 short-TTL → L4 long-TTL)
- Vector search: Deferred to Phase 4.75 (non-blocking)
- Graph storage: Recursive CTEs in SQLite for ancestry queries
- Max detail: Capture everything, filter on read (downstream filtering strategy)

---

### 2026-04-30T22:25:00Z: Phase 5 (PGO Telemetry) Deferred — Budget & Data Protection

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-04-30T22:25:00Z  
**Type:** Scope / Risk  
**Status:** Active

Phase 5 (PGO Telemetry) is deferred as future work.

**Reasons:**
1. **Azure budget constraints** — Application Insights is expensive. Cost-benefit unclear until Phase 4.5 canary metrics available.
2. **Corporate data protection** — Requirements for emitting telemetry from work environments must be resolved before telemetry collection begins. Legal review pending.

**Timeline:** Revisit for Phase 4.75 (post-canary) if budget approved and compliance cleared.

**Impact:** Phase 5 planning deferred. Phase 4.5 canary proceeds without integrated telemetry pipeline; manual metrics collection via CLI query tools only.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---
### 2026-05-02: Phase 4.5 Architecture — Local Feedback Loop

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-02  
**Type:** Architecture  
**Status:** Proposed

Phase 4.5 introduces the Local Feedback Loop — a profile-guided optimization engine that runs entirely on local SQLite. Sessions produce telemetry → collectors aggregate signals → prescribers generate optimization hints → the applier writes improved SKILL.md v2 artifacts.

**Key Decisions:**

#### ADR-P4.5-001: Collectors as HookObservers, not a separate event bus
Telemetry collectors implement `HookObserver` and register via `ForgeSession.addObserver()`. No separate telemetry pipeline. Collectors see the same event stream as decision gates. O(1) per event, defer analysis to flush.

#### ADR-P4.5-002: Three tables, not one universal signal table
Separate `signal_samples`, `execution_profiles`, and `optimization_hints` tables. Each has different access patterns and indexes. Same reasoning as Phase 4's separate `dbom_artifacts`/`dbom_decisions`.

#### ADR-P4.5-003: TTL and row caps enforced by Curator, not DB triggers
7-day TTL and 10K row cap on `signal_samples` managed by Curator's existing sweep mechanism. Consistent with existing patterns, avoids synchronous trigger overhead on INSERT.

#### ADR-P4.5-004: Fixed drift weights, not learned
Drift signal weights are constants (convergence: 0.30, toolEntropy: 0.25, tokenPressure: 0.15, contextBloat: 0.15, promptStability: 0.15). Determinism signals get 70% total weight per Aaron's "Determinism > Token Cost" constraint.

#### ADR-P4.5-005: FeedbackSource as new shared type
`FeedbackSource` added to `@akubly/types`. First new shared type since Phase 2. Justified: both Forge (session start) and Cairn (Curator) consume this contract.

#### ADR-P4.5-006: Manual loop trigger in Forge, Curator-driven in Cairn
Forge caller controls `compute()` and `getSink()` invocation timing. Cairn's Curator drives feedback loops via session start + periodic checks. Manual in Forge (library control), autonomous in Cairn (always-on platform).

---

## Phase 4.5 Implementation Decisions (Session 2026-05-02T04:35:00Z)

### 2026-05-02: Phase 4.5 DB CRUD modules use the singleton `getDb()` pattern

**Author:** Alexander (SDK/Runtime Dev)
**Date:** 2026-05-02
**Type:** Convention
**Status:** Implemented

#### Context

The Phase 4.5 spec asked for three new CRUD modules in `packages/cairn/src/db/`
covering signal samples, execution profiles, and optimization hints. The task
brief suggested each module export pure functions accepting a
`Database.Database` parameter. Every existing CRUD module in `packages/cairn/src/db/`
(including the named reference, `dbomArtifacts.ts`) uses the singleton
`getDb()` pattern, and the test harness depends on it via
`beforeEach: closeDb(); getDb(':memory:')`.

#### Decision

The three new modules — `signalSamples.ts`, `executionProfiles.ts`,
`optimizationHints.ts` — call `getDb()` internally rather than accepting a
`Database.Database` argument. This matches every other CRUD module in the
package and lets the existing test harness work unmodified.

#### Rationale

- **Consistency** — Mixing two patterns in `packages/cairn/src/db/` would force
  every future contributor to ask which one applies.
- **Test reuse** — The `closeDb(); getDb(':memory:')` lifecycle is the package
  convention. New tests for these modules use it directly, no plumbing.
- **Reversibility** — If we ever need DI for cross-DB scenarios, refactoring
  the whole `db/` layer in one pass is cleaner than gradually drifting toward
  it module-by-module.

#### Impact

- 3 new CRUD modules + migration 011 + 40 new tests, all green.
- Existing tests asserting `schema_version` count/max (`db.test.ts`,
  `discovery.test.ts`, `prescriptions.test.ts`) bumped from 10 → 11.
- **Note for downstream consumers (Curator):** TTL sweep and row cap
  enforcement live on the Curator, not in the DB. `sweepSignalSamples(cutoffIso)`
  and `enforceSignalSampleCap(cap)` are the primitives to schedule.

---

### 2026-05-02: Phase 4.5 feedback-loop test strategy

**Author:** Laura (Tester)
**Date:** 2026-05-02
**Status:** Implemented

#### Context

Phase 4.5 ships a closed feedback loop: collectors → sink → aggregator →
prescribers → applier → (operator updates skill) → improved next cycle. The
loop is causally complete only when an operator actually edits a SKILL.md and
re-runs sessions. In tests, we cannot close that loop with real model calls.

#### Decision

Adopt **process-invariant testing** for the feedback loop, codified in
`feedback-loop.test.ts`:

1. **Convergence is asserted by *response curve*, not by terminal state.**
   We assert that hint count is monotone non-increasing as profile drift
   decreases across simulated cycles, and that the maximum impact score is
   likewise non-increasing. We do not assert "the system reaches GREEN" —
   that depends on the operator.

2. **The operator's effect is simulated at the profile level.** Each "next
   cycle" feeds the prescriber a profile whose drift mean is lower than the
   previous cycle's. We are testing the system's *response* to improving
   inputs, not the operator's quality.

3. **Efficiency bounds are intentionally generous.** Hot-path collectors are
   capped at 250ms / 10k events (vs. spec implication of ~25µs/event). Tight
   enough to catch O(N) regressions, loose enough to survive CI variability.

4. **Property-based tests use an in-file LCG, not fast-check.** Keeps the
   test suite zero-dep and reproducible. Coverage is sufficient for the
   small-dimensional invariants we care about (drift score bounds,
   classification monotonicity, aggregator commutativity).

#### Implications for Other Agents

- **Alexander / runtime:** if any collector implementation regresses to per-
  event O(N) (e.g., recomputing entropy from a growing list), the L5 tests
  will catch it before it ships.
- **Roger / sink:** the L2 integration test exercises `enqueueSample` at
  buffer-size 1 and 16 and asserts every sample reaches `persistSample`.
  Future sinks (e.g., AppInsightsSink) should pass the same shape of test.
- **Anyone touching the drift gate:** §11.4 metamorphic test pins the gate
  at >= 0.3 and probes 0.1 / 0.3 / 0.5. Moving the threshold requires
  updating that test in lockstep.

#### Alternatives Considered

- **Run real Copilot CLI sessions in CI:** rejected — too slow, too flaky,
  and would obscure regressions in the loop logic itself behind model noise.
- **Add fast-check for property tests:** rejected for now — current
  invariants are simple enough that an LCG suffices, and the dependency
  cost outweighs the marginal coverage gain.
- **Snapshot the applier output:** rejected — snapshots would lock in
  *artifacts* (hint text, counts) rather than *processes*. A snapshot would
  fire on every recommendation-string tweak.

---

### 2026-05-02: Promote ExecutionProfile / ProfileGranularity to @akubly/types alongside FeedbackSource

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-05-02
**Type:** Architecture
**Status:** Implemented (Phase 4.5)

#### Context

Spec §9.3 declares `FeedbackSource` as the first new shared type in
`@akubly/types` since Phase 2. The interface signature references
`ExecutionProfile`, `ProfileGranularity`, `OptimizationHint`, and
`StrategyParameters` — types the spec otherwise defines inside
`packages/forge/src/telemetry/` and `packages/forge/src/prescribers/`.

`@akubly/types` cannot depend on `@akubly/forge` (acyclic dependency graph,
ADR-P4-002), so `FeedbackSource` cannot literally use forge-private types.

#### Decision

Two of the four referenced types are now defined in `@akubly/types`:

- `ProfileGranularity` — string union, fully shared.
- `ExecutionProfile` — full structural definition (drift / tokens / outcomes
  blocks). `packages/forge/src/telemetry/types.ts` re-exports them so forge
  code retains a single import path.

The remaining two are defined as **open-shaped** interfaces in `@akubly/types`:

- `OptimizationHint` — required keys (`id`, `source`, `skillId`, `category`,
  `description`) plus `[key: string]: unknown` for prescriber-specific fields.
- `StrategyParameters` — pure `[key: string]: unknown` map.

Concrete prescribers extend these without forcing schema changes in
`@akubly/types`.

#### Rationale

- `ExecutionProfile` is genuinely shared: Cairn's curator and prescribers
  both need to read profiles produced by Forge. Putting it in `@akubly/types`
  matches its actual lifetime as a cross-package contract.
- Open-shaped `OptimizationHint` / `StrategyParameters` honour the
  ADR-P4-005 "minimum shared types" instinct. The required keys are the
  invariant identity (every hint has an id, source, skill, category,
  description); everything else varies by prescriber.
- This avoids two anti-patterns: (1) widening `FeedbackSource` to use
  `unknown` everywhere (kills compile-time safety), and (2) duplicating the
  hint/strategy schemas across packages (kills the contract).

#### Impact

- `packages/types/src/index.ts` — +5 exports (`ProfileGranularity`,
  `ExecutionProfile`, `OptimizationHint`, `StrategyParameters`,
  `FeedbackSource`). No removals, no breaking changes.
- Forge's `telemetry/types.ts` re-exports `ProfileGranularity` and
  `ExecutionProfile` so `import { ExecutionProfile } from "../telemetry/types.js"` keeps working.
- Tests: 826 baseline → 954 passing (forge 476 + cairn 478). Telemetry
  module contributes 56 of the new tests.

#### Follow-ups for the team

1. **Spec event-type mismatch (for Graham / wiring task):** spec §9.4 names
   `tool_call_started`, `usage_reported`, `turn_completed`,
   `session_completed`, `tool_call_failed`. The bridge `EVENT_MAP` uses
   `tool_use`, `model_call`, `turn_end`, `session_end`. The collectors are
   coded to the spec strings; wiring will need either a remapper at the
   collector boundary or an `EVENT_MAP` extension.
2. **Convergence formula (for Graham):** `convergedTurn / turnCount` is
   degenerate at typical session shapes (always 1.0 when `session_completed`
   arrives last). Worth a redesign before Phase 5 — perhaps
   `convergedTurn / expectedTurns` against a per-skill expected-turns
   parameter from `StrategyParameters`.

---

### 2026-05-02: Phase 4.5 Prescribers + Applier — Determinism Mechanisms

**Author:** Princess Rosella (Plugin Dev)
**Date:** 2026-05-02
**Type:** Architecture / Implementation
**Status:** Implemented (S1–S8)

#### Context

The Phase 4.5 spec (§3–§4) prescribes the prescriber → applier pipeline and
states the ordering rule "Determinism > Token Cost (Aaron's constraint)" as
prose. While implementing, I had to choose how strongly to encode that
constraint. Two options:

1. **Soft prioritization** — token optimizer always runs, but its hints carry
   lower impact scores than prompt-optimizer hints.
2. **Hard gate** — token optimizer returns an empty hint set entirely when
   drift is RED, regardless of cache/cost signals.

#### Decision

I chose **(2) hard gate**, exposed as ``TokenOptimizerConfig.driftGate``
(default ``0.3``). ``analyzeTokenOptimizations`` exits early with no hints when
``profile.drift.mean >= driftGate``. This matches the spec text at line 933
("Guard: Don't optimize tokens if drift is RED — fix determinism first") and
makes the constraint structurally enforced rather than score-balancing
dependent.

I also made the **applier order-stable**: sort key is
``(impactScore desc, id asc)``. Without the id tiebreaker, two hints with
identical impact scores could swap positions across runs depending on input
order, breaking SKILL.md compilation reproducibility.

#### Other team-relevant choices

- ``DEFAULT_STRATEGY_PARAMS`` is ``Object.freeze``-d. Cross-package consumers
  (Cairn, runtime, future loop-driver) cannot mutate it accidentally.
- ``EXPLORATION_FLOOR = 0.15`` is a module constant, not a config knob.
  Aaron's directive ("diminishing returns worth it when scaled across future
  of software engineering") means this is policy, not preference.
- ``ApplierConfig.now: () => Date`` is injectable for deterministic tests of
  ``frontmatterPatch.optimizationHints[].appliedAt``. The export pipeline can
  use this to thread its own clock if it ever needs to backdate patches.
- ``cacheableTools`` extraction reads from ``evidence.triggerMetrics`` keys
  prefixed with ``tool:`` and an optional ``evidence.cacheableTools`` array.
  Forward-compatible with telemetry adding tool-level signals — Roger and I
  should align on which path becomes canonical when the loop-driver lands.

#### Implications

- **Cairn / loop-driver:** When feeding hints back through the loop, expect
  zero token-optimization hints during RED drift periods — this is by design,
  not a bug. Test fixtures should not assume token hints are always present.
- **Export pipeline (Phase 4):** ``SkillFrontmatterPatch`` is the contract
  between applier and ``attachStage``. Adding new patch fields requires
  coordinated changes here.
- **Telemetry team (Roger):** ``ExecutionProfile`` shape is now relied upon
  by both telemetry and prescribers. Changes to drift/tokens/outcomes nesting
  will ripple into 27 prescriber tests.

#### Verification

- ``npm run build --workspace=@akubly/forge`` passes.
- 27 new tests in ``packages/forge/src/__tests__/prescribers-applier.test.ts``
  all pass (mechanism × determinism × metamorphic).
- 475/476 forge tests pass overall. The one unrelated failure
  (``telemetry-collectors.test.ts > classifies ... as GREEN``) is in
  Roger's collectors module and predates my work.
Forge is the development tool (human in loop). Cairn is autonomous (Curator decides). Shared analysis logic, two trigger paths.

#### ADR-P4.5-007: Determinism > Token Cost ordering
All prescriber priority, drift weights, and optimization ordering enforces determinism first. Token optimizer gates on drift level — won't prescribe if drift is RED. This is Aaron's design constraint, not a decision.

**Impact:**
- **New files:** `packages/forge/src/telemetry/` (6 files), `packages/forge/src/prescribers/` (4 files), `packages/forge/src/applier/` (3 files), `packages/cairn/src/db/migrations/011-telemetry-feedback.ts`, 3 new CRUD modules
- **Modified files:** `packages/cairn/src/db/schema.ts`, `packages/forge/src/index.ts`, `packages/types/src/index.ts` (FeedbackSource)
- **Estimated LOC:** ~1200 production + ~600-800 tests
- **Estimated tests:** 61-80

**Specification:**
- Full spec: `docs/forge-phase4.5-spec.md`
- Roadmap (4.6/5): `docs/forge-phase5-roadmap.md`
  title: 'List Prescriptions',
  description:
    'List improvement suggestions the Prescriber has generated from detected patterns. ' +
    'Filter by lifecycle status or see all. Each result includes confidence level in plain ' +
    'language and a hint about pending suggestions worth reviewing. ' +
    'Use this after completing a task to check for improvement opportunities.',
  inputSchema: {
    status: z.enum([
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    ]).optional()
      .describe('Filter by lifecycle status. Omit to return all statuses.'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results to return (default 10).'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `get_prescription`

```typescript
server.registerTool('get_prescription', {
  title: 'Get Prescription',
  description:
    'Get full detail about a specific improvement suggestion, including the pattern ' +
    'that triggered it, what Cairn observed, the suggested change, where it would be ' +
    'applied, and a diff preview. Use this to understand a suggestion before deciding.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription ID to retrieve.'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `resolve_prescription`

```typescript
server.registerTool('resolve_prescription', {
  title: 'Resolve Prescription',
  description:
    'Act on an improvement suggestion: accept (applies the change), reject (dismisses ' +
    'permanently), or defer (revisit later). Rejection is the simplest action — no reason ' +
    'required. Acceptance applies the change to a sidecar instruction file. ' +
    'Deferral sets a cooldown before the suggestion resurfaces.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription to act on.'),
    disposition: z.enum(['accept', 'reject', 'defer'])
      .describe('How to resolve: accept (apply change), reject (dismiss), defer (revisit later).'),
    reason: z.string().optional()
      .describe('Optional reason for rejection or deferral. Helps Cairn learn preferences.'),
  },
  annotations: { readOnlyHint: false },
}, handler);
```

#### New Tool: `show_growth`

```typescript
server.registerTool('show_growth', {
  title: 'Show Growth',
  description:
    'See a summary of patterns Cairn has helped resolve and overall improvement trends. ' +
    'Leads with wins — shows resolved patterns first, then active ones. ' +
    'Uses natural language, not percentages. Use this to reflect on progress.',
  annotations: { readOnlyHint: true },
}, handler);
```

#### Modified Tool: `run_curate` (DP1)

Updated description:
```typescript
description:
  'Trigger the curator to process unprocessed events and discover patterns. ' +
  'The curator scans the event stream for recurring errors, error sequences, ' +
  'and skip frequency, then creates or reinforces insights with prescriptions. ' +
  'Also generates new improvement suggestions when insights are created or reinforced. ' +
  'Returns the number of events processed, insights discovered, and any new suggestions. ' +
  'Use this when you want fresh analysis of recent activity.',
```

---

## Dependency Graph

```
7A ─────────────────────────────────────────────────┐
│                                                    │
├──→ 7B (Artifact Discovery) ──┬──→ 7D (Prescription Engine) ──┐
│                               │                                │
├──→ 7C (Infrastructure) ──────┤──→ 7E (Apply Engine) ──────────┤
│                               │                                │
└───────────────────────────────┘               7F (MCP + UX) ◄─┘
```

- **7A** has no dependencies (foundation)
- **7B, 7C** depend only on 7A (can run in parallel)
- **7D, 7E** depend on 7A + 7B (can run in parallel after 7B)
- **7F** depends on 7C + 7D + 7E (final integration phase)

**Critical path:** 7A → 7B → 7D → 7F  
**Parallel opportunities:** 7B ∥ 7C, then 7D ∥ 7E

---

## Execution Schedule

| Phase | Owner | Depends On | Parallel With | Est. New Tests |
|-------|-------|------------|---------------|----------------|
| 7A | Roger | — | — | ~25 |
| 7B | Rosella | 7A | 7C | ~20 |
| 7C | Gabriel | 7A | 7B | ~10 |
| 7D | Roger | 7A, 7B | 7E | ~25 |
| 7E | Rosella | 7A, 7B | 7D | ~15 |
| 7F | Roger + Valanice | 7C, 7D, 7E | — | ~20 |
| **Total** | | | | **~115** |

**Final test count target:** ~250 (134 existing + ~115 new)

---

## Acceptance Criteria

The Prescriber is complete when:

1. ✅ `run_curate` chains `prescribe()` automatically when insights change
2. ✅ `preToolUse` chains `prescribe()` at session start when insights change
3. ✅ `curate()` respects 3-second time budget
4. ✅ 8-state lifecycle enforced in DB and code
5. ✅ 4 new MCP tools registered and functional
6. ✅ Full 4-phase artifact scanner with 5-minute SQLite cache
7. ✅ All 10 UX principles verifiable in tool output
8. ✅ Sidecar instruction files written (not user-owned files modified)
9. ✅ managed_artifacts tracks all Prescriber-written files
10. ✅ Rollback capability functional
11. ✅ Drift detection via checksum comparison
12. ✅ 7 preference keys configurable
13. ✅ Deferral cooldown (3 sessions default)
14. ✅ Auto-suppression after 3 deferrals
15. ✅ Growth tracking via `show_growth`
16. ✅ All existing 134 tests still pass
17. ✅ ~115 new tests pass
18. ✅ Clean build, clean lint
19. ✅ Dogfooded: Aaron has accepted ≥1 real prescription


---

## Phase 7D Decisions — Roger

### recencyWeight Capped at 1.0

The spec formula Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15)) produces values >1.0 when sessionsAgo < 5. Added Math.min(1.0, ...) to match the spec description "1.0 within 5 sessions, decays to 0.5 by 20 sessions."

**Impact:** Priority scores are bounded [0, 1.0] as expected. No bonus for very recent insights.

### Event Logging is Fail-Soft

logEvent() requires a FK-valid session ID. The prescriber looks up the most recent active session from the DB. If none exists (e.g., during sessionStart before the new session is created), event logging is silently skipped.

**Rationale:** Prescriber runs in two contexts: (1) sessionStart (before new session exists) and (2) MCP run_curate (session may exist). Logging is informational, not critical. Fail-soft is consistent with the project's fail-open philosophy.

**Impact:** Phase 7F tools that read prescription events should be aware that some prescription_generated events may be missing for prescriptions generated during session startup.

### shouldResurface Compensates for Session Counter Timing

incrementSessionCounter() runs AFTER prescribe() in sessionStart.ts. The shouldResurface() function uses currentSession + 1 >= deferUntilSession to compensate, so deferral cooldowns are honored correctly.

**Impact:** Deferral cooldowns are accurate. Phase 7F should use the same shouldResurface() function if needed.

### Rejected Prescriptions Block Re-Prescription

'rejected' is added to the set of statuses that prevent generating a new prescription from the same insight. An insight with a rejected prescription won't be re-prescribed until the rejected prescription is manually expired or the insight itself changes.

**Rationale:** Rejected is terminal per the spec. Without this, rejected insights would get re-prescribed on every prescribe() run, spamming the user.

**Impact:** If a user rejects a prescription but later wants to reconsider, they'll need to explicitly re-enable (possibly via unsuppress or manual expiration in Phase 7F).

### checkAutoSuppress Exported for Phase 7F

The auto-suppression check (deferCount >= threshold → suppress) is exported as checkAutoSuppress(prescriptionId, deferCount). Phase 7F's resolve_prescription MCP tool should call this after each deferral.

**Impact:** Phase 7F must call checkAutoSuppress() after deferPrescription() in the defer flow.

---

## Phase 7E Decisions — Rosella

### LIFO Rollback for Multi-Prescription Sidecars

**Context:** managed_artifacts has UNIQUE(path). Multiple prescriptions can append to the same sidecar file, but only one row can exist per path.

**Decision:** When appending, remove the old managed_artifact row and re-track with the latest prescription's ID. Rollback only supports the latest writer (LIFO). Rolling back a middle prescription in a multi-append stack is not supported in this phase.

**Rationale:** The existing schema supports this cleanly. Full multi-level undo would require a separate history table — overkill for Phase 7E scope. If needed later, we add a managed_artifact_history table.

### File-Based Drift Detection

**Context:** The DAL's detectDrift() compares original_checksum vs current_checksum in the DB only — it doesn't read disk.

**Decision:** checkDrift() in applier.ts reads the actual file, computes SHA-256, and compares to stored current_checksum. This is the on-disk drift check. The DAL function is for DB-internal consistency.

**Rationale:** Users need to know if someone hand-edited the sidecar file. That requires a disk read, not a DB lookup.

### Apply Blocks on Drift

**Context:** Should pplyPrescription proceed if the sidecar has drifted since last write?

**Decision:** Block with error. The user must resolve drift before new content is applied.

**Rationale:** Silently overwriting user edits violates the "safe defaults" principle from DP6. The user should explicitly acknowledge changes before Cairn writes again.

---

## Phase 8D — Skill Test Harness

### 2026-04-30: Phase 3 Architecture — ForgeClient & SDK Abstraction (Graham)

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Active

# Graham — Phase 3 Architecture Decisions

**Date:** 2026-04-30  
**Author:** Graham Knight (Lead / Architect)  
**Context:** Phase 3 architecture specification for `@akubly/forge` — live SDK integration

---

## ADR-P3-001: ForgeClient wraps CopilotClient 1:1

**Decision:** Each ForgeClient owns exactly one CopilotClient. No shared instances.

**Alternatives:**
1. Shared client singleton — lifecycle confusion, race conditions on concurrent session creation.
2. No wrapper / expose CopilotClient directly — breaks "SDK types don't leak" contract.
3. **1:1 wrapper (chosen)** — clear ownership, deterministic cleanup.

**Trade-off:** Slightly more memory if multiple ForgeClients exist. Clear lifecycle wins.

---

## ADR-P3-002: EventSource interface over direct CopilotSession coupling

**Decision:** `attachBridge()` and `createTokenTracker()` accept `EventSource { on(handler): () => void }` rather than `CopilotSession`.

**Alternatives:**
1. Accept CopilotSession directly — simpler types, but couples to SDK and complicates testing.
2. **EventSource interface (chosen)** — enables mock event sources, keeps Phase 2 bridge SDK-free.

**Trade-off:** One extra interface definition for massive test simplification.

---

## ADR-P3-003: ModelCatalog uses injection over ForgeClient reference

**Decision:** `createModelCatalog()` takes a `listFn: () => Promise<ModelSnapshot[]>` rather than a ForgeClient reference.

**Alternatives:**
1. Pass ForgeClient — simpler call site, untestable without live client.
2. **Injection (chosen)** — testable with static array, matches Phase 2 pattern.

**Trade-off:** Caller wires one line of glue for full testability.

---

## ADR-P3-004: No new shared types in @akubly/types

**Decision:** Phase 3 types (ForgeClientOptions, ForgeSessionConfig, TokenBudget, ModelCatalog) stay Forge-internal.

**Rationale:** Cairn consumes CairnBridgeEvent, not TokenBudget. Types graduate to shared only when two packages actually import them.

**Trade-off:** If Cairn needs TokenBudget later, one PR to migrate. Smaller shared surface now.

---

## ADR-P3-005: Dual event paths — onEvent for setup, attachBridge for runtime

**Decision:** Use SessionConfig.onEvent for events during createSession(), attachBridge() after session exists. No dedup needed.

**Rationale:** SDK guarantees non-overlapping windows. Matches spike pattern.

**Trade-off:** Relies on SDK behavior guarantee. Low risk.

---

## ADR-P3-006: Strategies as plain functions, not class hierarchy

**Decision:** ModelStrategy is a function type. Built-in strategies are a Record<string, ModelStrategy>.

**Alternatives:**
1. Strategy class hierarchy — overkill for 3 strategies, adds constructor ceremony.
2. **Function type (chosen)** — easy to test, compose, override.

**Trade-off:** No runtime type-checking of strategy names. Acceptable for developer-facing API.


---

### 2026-04-29: Phase 3 Test Strategy — Inline Contract Testing (Laura)

**Author:** Laura (Tester)  
**Type:** Testing  
**Status:** Active

# Laura — Phase 3 Test Strategy: Inline Contract Testing

**Author:** Laura (Tester)
**Type:** Test Strategy
**Status:** Proposed
**Date:** 2026-04-29

## Decision

Phase 3 test contracts use **inline implementations** of the expected API surface (ForgeClient, ForgeSession, ModelCatalog, ModelSwitcher, TokenBudgetTracker) rather than importing from non-existent modules. Each inline class defines the behavioral contract. When Alexander builds the production modules, tests switch imports — any divergence breaks tests immediately.

## Rationale

1. **TDD red-phase compatibility:** Tests must be runnable NOW, before production code exists. Importing from `../runtime/index.js` would produce compile errors.
2. **Contract precision:** Inline implementations encode expected behavior (e.g., "disconnect is idempotent", "bridge events are returned as copies") that pure type signatures cannot express.
3. **Proven pattern:** Phase 2 used the same approach (inline bridge/hooks) and the migration to production imports was smooth — documented in history.md.

## Migration Path

When production modules are built:
1. Delete inline class definitions from test files
2. Replace TODO import comments with real imports
3. Run tests — failures reveal behavioral divergence
4. Resolve divergence (fix production code or update contract if intentional)

## Mock SDK Extensions

Extended `helpers/mock-sdk.ts` for Phase 3 needs:
- **MockCopilotSession:** Added `setModel`, typed event handler map, unsubscribe returns
- **MockCopilotClient:** Added `resumeSession`, `listModels`, `listSessions`, `getAuthStatus`, `getStatus`
- **makeModelInfo:** Shared factory for constructing valid `ModelInfo` objects

These extensions are backward-compatible — existing Phase 2 tests continue to pass unchanged.

## Test Coverage Summary

| Module | Tests | Key Behaviors |
|--------|-------|---------------|
| runtime.test.ts | 35 | Session lifecycle, bridge wiring, hook composition, decision gates, disconnect semantics |
| models.test.ts | 52 | Model catalog CRUD, snapshot extraction, mid-session switching, token budget tracking, selection strategies |

## Risks

- Inline implementations may drift from what Alexander builds. Mitigation: clear TODO markers and documented migration path.
- Mock SDK extensions add maintenance surface. Mitigation: centralized in helpers/, barrel-exported.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Runtime (Alexander)

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

Addressed 7 persona review findings for `packages/forge/src/runtime/`. 6 accepted with fixes, 1 partially rejected (spec-vs-implementation gap with no test contracts).

## Key Decisions

**Spec Surface Gap — Partial Reject (F2)**

Rejected: `listModels`, `listSessions`, `getAuthStatus`, `getStatus` — these are in the architecture spec but have no test contracts and no consumers. They can be added when a consumer needs them.

Accepted from same finding: `onEvent` bridge for pre-session events and `model_change` tracking — these are correctness concerns with spec backing.

**Session Map Lifecycle (F6)**

Added `onDisconnect` callback pattern: ForgeClient passes a cleanup callback when creating ForgeSession. On disconnect, the session auto-removes itself from the client's tracking map. This means `sessionCount` stays accurate without manual cleanup.

**decisionGate Removed from Config (F5)**

`decisionGate` predicate was defined in `ForgeSessionConfig` but never wired. Decision gating is already handled through the observer pattern (`HookObserver.onPreToolUse`). Removed to avoid misleading API surface.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F1 | stop() error isolation | Added try/catch per session; errors logged separately |
| F3 | onEvent bridge missing | Wired pre-session event bridge (ADR-P3-005) |
| F4 | model_change tracking | Integrated into ModelChangeRecord[], persisted in events |
| F5 | decisionGate config field | Removed (not wired; gating handled by HookObserver) |
| F6 | Bridge handler guards | Added _disconnected guard + try/catch wrapper |
| F7 | Session map lifecycle | Added onDisconnect callback; auto-removal on disconnect |

## Files Changed

- `packages/forge/src/runtime/client.ts`
- `packages/forge/src/runtime/session.ts`

## Test Impact

All 268 tests pass. Zero regressions.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Models (Roger)

**Author:** Roger (Platform Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

9 persona reviewers surfaced 5 findings against the models/ module. Triaged as:
- **4 accepted and fixed** (F2–F5)
- **1 rejected** (F1)

## Key Decisions

**Rejected: F1 — sort() Mutates Input Array**

The Architect flagged `sort()` in `cheapest`/`smartest` strategies as mutating the input `models` array. This is a false positive: `filter()` already returns a new array, so `sort()` only mutates the filtered copy. No caller's data is affected.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F2 | readonly bypass on TokenBudget.contextWindow | Introduced MutableContextWindow internal type; external API stays readonly |
| F3 | Dual EventSource subscriptions | Merged into single source.on() handler with if/else on event.type |
| F4 | Test field drift (reasoningEffort vs newReasoningEffort) | Updated test's ModelChangeRecord, makeModelChangeEvent, and assertions |
| F5 | Division by zero in budgetAware | Added guard: `if (context.budgetLimitNanoAiu <= 0) return cheapest(...)` |

## Files Changed

- `packages/forge/src/models/strategy.ts`
- `packages/forge/src/models/token-budget.ts`
- `packages/forge/src/__tests__/models.test.ts`

## Test Impact

- `npm run build` — clean
- `npx vitest run` — 268/268 tests pass



### 2026-05-01: Telemetry Collector ↔ Bridge Event-Name Contract

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Contract + Telemetry  
**Status:** Implemented

Context: Persona review F4 caught that telemetry collectors checked for event type strings that never appear in the bridge's EVENT_MAP. Bridge maps SDK events to different vocabulary (	ool_use vs 	ool_call_started, etc.). Result: collectors silently received nothing in production.

**Key Decisions:**

#### ADR-TLM-001: Single source of truth for collector event interest
New exported COLLECTOR_BRIDGE_EVENTS const in packages/forge/src/telemetry/collectors.ts names every Cairn event type collectors react to.

#### ADR-TLM-002: Contract test enforces bridge alignment
New test packages/forge/src/__tests__/telemetry-bridge-contract.test.ts enumerates COLLECTOR_BRIDGE_EVENTS and asserts every value is in EVENT_MAP. CI fails fast if either side drifts.

#### ADR-TLM-003: F2 early-convergence semantics
convergedTurn set on FIRST occurrence of successful 	ool_result or plan_changed event. If neither fires, convergence stays at 1.0 (legitimate "no early progress" rather than phantom 0.30 floor).

#### ADR-TLM-004: F5 streaming quantiles via histogram sketch
Stored as optional drift.sketch on ExecutionProfile; backward compatible.

#### ADR-TLM-005: F6a per-signal means
New optional signals field on ExecutionProfile carries individual means for convergence, 	okenPressure, 	oolEntropy, contextBloat, promptStability.

**Impact:**
- Bridge owners: if you remove/rename a value in COLLECTOR_BRIDGE_EVENTS, contract test fails.
- Prescriber authors: ExecutionProfile.signals populated; targeting specific signals now mechanical.
- Persisted-profile readers: drift.sketch and signals optional; old rows keep working.
- Sink consumers: LocalDBOMSink now exposes droppedCount.

---

### 2026-05-01: Persona Review Fixes — Prescribers + Applier (F3, F6b, F9, F10)

**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-01  
**Type:** Implementation  
**Status:** Implemented

Four findings from Phase 4.5 persona review.

**Key Decisions:**

#### ADR-PSC-001: tuneParameters gains context argument
Third arg context: TuneContext carries udgetLimitNanoAiu. Defaults to DEFAULT_BUDGET_LIMIT_NANO_AIU = 1_000_000 so existing call-sites don't break. 	okenPressure normalized to [0,1] against this limit.

#### ADR-PSC-002: Prescribers consume signal-level entropy
Prescribers use profile.signals.toolEntropy (Roger's new field) for tool-guidance trigger, with fallback to drift.p95 for legacy profiles. Composite drift never masquerades as single-signal threshold.

#### ADR-PSC-003: Shared buildSnapshot utility
uildSnapshot lives in packages/forge/src/prescribers/utils.ts, sources driftLevel from classifyDriftLevel(). Single source of truth for GREEN/YELLOW/RED boundaries.

#### ADR-PSC-004: Adaptive exploration budget
GREEN → * 0.9 (decay), RED → * 1.1 (grow), YELLOW → hold. Hard floor EXPLORATION_FLOOR = 0.15, ceiling 1.0.

**Cross-team implications:**
- Roger: Aggregator writes profile.signals from metadata.signals on drift samples.
- 	uneParameters third arg optional; no caller updates required.
- Pre-existing gap: packages/forge/src/telemetry/collectors.ts missing on disk; 15 tests fail (outside this scope).

**Verification:** prescribers-applier.test.ts 36/36 pass (+8 new tests). Forge suite 514/529; 15 failures pre-date this work.

---

### 2026-05-02: Phase 4.5 Persona Review — All 11 Findings Fixed

**Author:** Scribe (Session Log)  
**Date:** 2026-05-02  
**Type:** Meta  
**Status:** Complete

Phase 4.5 persona review findings consolidated and resolved across three team members:

- **Roger (Platform Dev):** F1 (weighted means), F2 (convergence), F4 (contract), F5 (sketch), F6a (signals), F7 (sink warn), F11 (typeof). +24 tests → 534 Forge tests.
- **Rosella (Plugin Dev):** F3 (budgetContext), F6b (prescriber entropy), F9 (buildSnapshot), F10 (adaptive budget). +8 tests → 478 Cairn tests.
- **Alexander (SDK Dev):** F8 (granularityKey in FeedbackSource).

**Result:** 1,012 total tests passing (Forge 534 + Cairn 478), up from 990 pre-review. Build clean. All persona review findings hardened and deployed.

---

# Phase 4.6 — Cycle 1 Triage (Code Panel Findings)

**Lead:** Graham (Architect)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Trigger:** 15-finding Code Panel review, Aaron selected squad-mode autonomous triage.

---

## Architectural Decisions

### ADR-P4.6-004: Edit migration 012 in place (Finding #4)

**Decision:** Edit migration 012 to add `UNIQUE(hint_id)` — do NOT create migration 013.

**Rationale:** Migration immutability is a *production safety* convention. Phase 4.6 lives
on a feature branch with no production data and no downstream consumers of the migration
sequence. Adding a 013 that only exists to patch a 012 that never shipped creates dead
weight in the migration history. The sweep should also switch to `INSERT OR IGNORE` to
rely on the constraint rather than the read-check-then-write pattern.

**Trade-off named:** If another branch concurrently builds on migration 012, this edit
creates a merge conflict. Risk is low — Phase 4.6 is the only active consumer.

**Alternative rejected:** Migration 013 (immutability convention). Convention exists to
protect deployed schemas; pre-ship, it's ceremony without safety benefit.

---

### ADR-P4.6-005: Mirror ChangeVectorSummary with regression test (Finding #7)

**Decision:** Do NOT promote `ChangeVectorSummary` to `@akubly/types`. Mirror the type
in both packages and add a regression test that asserts structural compatibility.

**Rationale:** Same pattern as ADR-P4.6-003 (drift weight mirroring). `OptimizationCategory`
is a prescriber-internal concept — promoting it to the shared types package couples that
package to prescriber domain semantics. The regression test (Laura's L5 suite) already
validates shape; extend it to assert that all category values returned by
`summarizeChangeVectors` are valid `OptimizationCategory` members.

**Cost lands in:** Phase 4.6 (test addition). Promotion to `@akubly/types` deferred to
Phase 5 if a third consumer emerges.

**Trade-off named:** Duck-typing can drift silently between releases if the regression test
is skipped. Mitigation: test runs in CI on every PR.

**Alternative rejected:** Promote to `@akubly/types` now — premature coupling for a
single cross-package consumer.

---

### ADR-P4.6-006: Ship primitives only; defer runtime wiring (Finding #9)

**Decision:** Ship Phase 4.6 as "primitives only." The Curator sweep, CRUD layer,
`computeNetImpact`, `summarizeChangeVectors`, and prescriber ranking integration are
independently testable and correct. Runtime wiring (connecting Curator output to
prescriber input in the live loop) is deferred to a tracked follow-up issue.

**Rationale:** Phase 4.6 scope was always the computation and ranking primitives.
Wiring requires runtime orchestration changes (Curator → prescriber pipeline in the
session lifecycle) that expand scope, risk, and review surface significantly. The
primitives are the hard part; wiring is mechanical once the contract is stable.

**Trade-off named:** Phase 4.6 code is dormant at runtime until wiring lands. Tests
prove correctness, but no production validation until the follow-up ships.

**Follow-up issue:**
- **Title:** `Wire Curator change vectors to prescriber historicalVectors at runtime`
- **Body:** Phase 4.6 (ADR-P4.6-006) shipped computation primitives and prescriber
  ranking support, but no production caller passes `historicalVectors` to
  `analyzePromptOptimizations` / `analyzeTokenOptimizations`. The Curator sweep
  computes vectors and `summarizeChangeVectors` aggregates them, but nothing in the
  runtime session lifecycle queries summaries and feeds them to prescribers.
  Scope: add the orchestration glue in the Curator's periodic sweep or a new
  runtime hook that queries summaries and passes them to prescriber invocations.
  Depends on: Phase 4.6 merged.

---

## Per-Finding Triage

| # | Sev | Disposition | Fix Agent | Notes |
|---|-----|------------|-----------|-------|
| 1 | 🔴 | **ACCEPT** | Rosella | `deltaCost` uses cumulative `token_total_cost` (monotonic). Normalize to per-session cost before computing delta. Curator.ts is Alexander's code → Rosella fixes per lockout. |
| 2 | 🟡 | **ACCEPT** | Alexander (utils.ts) + Rosella (changeVectors.ts) | Confidence cliff: `vectorCount=1, minVectors=3` → boost 0.5, which *halves* confidence. Contradicts Wave 1 "positive boost only" policy. Fix: clamp to `Math.max(1.0, log(…)/log(…))` so vectors only amplify, never attenuate. Split across packages per lockout. |
| 3 | 🟡 | **ACCEPT** | Rosella | `sessionsObserved` stores cumulative `session_count` but migration comment says "between before/after." The proxy was a deliberate decision (see decisions.md §Sessions-Observed Proxy), but column docs are misleading. Fix: update column comment in migration 012 (being edited per ADR-P4.6-004 anyway) to say "cumulative session count at vector computation time." |
| 4 | 🟡 | **ACCEPT** | Rosella | Add `UNIQUE(hint_id)` to migration 012 per ADR-P4.6-004. Switch sweep to `INSERT OR IGNORE`. Both are Alexander's code → Rosella per lockout. |
| 5 | 🟡 | **ACCEPT** | Alexander | Sort bug: unmatched hints (predictedImpact undefined → 0) outrank matched hints with negative impact. Fix: partition matched/unmatched; sort matched by predictedImpact desc; append unmatched in original impactScore order. Both optimizers are Rosella's → Alexander per lockout. |
| 6 | 🟡 | **ACCEPT** | Rosella | `sweepChangeVectors` returns a single counter conflating 4 skip reasons. Add structured diagnostic: `{ eligible, skippedInsufficientSessions, skippedMalformed, alreadyComputed, computed }`. Curator.ts is Alexander's → Rosella per lockout. |
| 7 | 🟡 | **ACCEPT** | Laura | Per ADR-P4.6-005: add regression test asserting Cairn's `ChangeVectorSummary.category` values are valid `OptimizationCategory` members. Laura owns tests; lockout N/A. |
| 8 | 🟡 | **ACCEPT** | Alexander | `ChangeVectorSummary` missing from `@akubly/forge` root barrel re-export. Add to the prescribers re-export block in `forge/src/index.ts`. Adjacent to Rosella's module → Alexander per lockout. |
| 9 | 🟡 | **DEFER** | — | Per ADR-P4.6-006: ship primitives only. Follow-up issue: "Wire Curator change vectors to prescriber historicalVectors at runtime." |
| 10 | ⚪ | **ACCEPT** | Rosella | `computeNetImpact` inline negations are fragile. Extract named contributions: `const driftContrib = -deltaDrift * weights.deltaDrift;` etc. changeVectors.ts is Alexander's → Rosella per lockout. |
| 11 | ⚪ | **REJECT** | — | ADR-P4.6-002 explicitly chose the optional positional parameter over a config/options object. Finding contradicts an existing architectural decision. If the pattern proves painful at more call sites, revisit in Phase 5. |
| 12 | ⚪ | **DEFER** | — | DB injection style (explicit `db` param vs `getDb()`) is a repo-wide convention question, not Phase 4.6 scope. Follow-up issue: "Standardize DB access pattern: explicit injection vs internal getDb()." |
| 13 | ⚪ | **ACCEPT** | Laura | Describe block says "cross-module weight consistency" but test only validates local `DRIFT_WEIGHTS`. Rename to reflect actual scope; `it.todo` already marks the cross-module aspiration. Laura owns tests; lockout N/A. |
| 14 | ⚪ | **ACCEPT** | Alexander | `computeConfidenceBoost` re-exported publicly from `prescribers/index.ts` but it's an internal helper (Cairn mirrors the formula, can't import). Drop from public re-export. prescribers/index.ts is Rosella's → Alexander per lockout. |
| 15 | ⚪ | **ACCEPT** | Alexander (forge) + Rosella (cairn) | Four sites use `?? 3` for minSessions default. Extract `DEFAULT_MIN_SESSIONS = 3` constant. Rosella defines it in cairn's changeVectors.ts (Alexander's code → lockout). Alexander updates forge's utils.ts + optimizers (Rosella's code → lockout). |

---

## Summary

- **Accepted:** 12 findings
- **Rejected:** 1 (finding #11 — contradicts ADR-P4.6-002)
- **Deferred:** 2 (findings #9 and #12 — follow-up issues)
- **Escalated:** 0

### Agent Dispatch

| Agent | Finding #s | Count |
|-------|-----------|-------|
| Rosella | 1, 2 (changeVectors.ts), 3, 4, 6, 10, 15 (cairn) | 7 |
| Alexander | 2 (utils.ts), 5, 8, 14, 15 (forge) | 5 |
| Laura | 7, 13 | 2 |

### Cycle 2 Concerns

1. **Rosella's load is heavy** (7 items). Findings 1, 3, 4 all touch curator.ts — they
   should be batched in a single pass to avoid merge churn. Finding 4 (migration edit)
   and finding 3 (column comment) are the same file change.
2. **Finding #1 is the only blocker.** Rosella should prioritize it. The deltaCost bug
   produces materially wrong net_impact values that cascade into ranking.
3. **Finding #2 (confidence clamp) touches both packages.** Alexander and Rosella must
   coordinate — the formula change should be identical in both locations.
4. **Finding #15 (constant extraction) is low-risk but cross-package.** Can be done last.

---

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

---

# Decision: MetricSnapshot.sessionCount is optional (not required)

**Author:** Rosella (Plugin Dev)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Context:** Phase 4.6 cycle 2, Finding #1 — deltaCost normalization requires sessionCount in MetricSnapshot.

---

## Decision

`MetricSnapshot.sessionCount` is declared as **optional** (`sessionCount?: number`) rather than required.

## Rationale

1. **Backward compatibility with stored JSON.** `MetricSnapshot` is serialized to `optimization_hints.metric_snapshot` (a JSON column). Hints created before Phase 4.6 cycle 2 will not have `sessionCount` in their stored JSON. Making the field required would silently cause `undefined` at runtime for those rows — worse than a `?? 0` fallback.

2. **Test fixture compatibility.** Laura's test fixtures (`feedback-loop.test.ts`, `prescribers-applier.test.ts`) use inline `metricSnapshot` objects built before this field existed. Making the field required broke the build (2 TS errors). Optional avoids forcing Laura to update fixtures just to unblock the build, while letting her add `sessionCount` values in her cycle-2 test updates naturally.

3. **Safe fallback exists.** `sweepChangeVectors` in curator.ts already handles missing `sessionCount` via `snapshot.sessionCount ?? 0`. When sessionCount is absent, the cost delta falls back to `tokenCostNanoAiu` (raw cumulative, no per-session normalization) — identical to pre-cycle-2 behavior. This is a graceful degradation, not a correctness cliff.

4. **`buildSnapshot()` always populates it.** New hints created after this cycle will always have `sessionCount`, so the fallback only fires for historical data.

## Alternative Rejected

Making `sessionCount: number` required (which was the initial implementation). This caused 2 TypeScript compilation errors in test files owned by Laura. Forcing her to update fixtures just to accommodate my type change violates the "each agent owns their scope" principle and would serialize our parallel work.

## Trade-off

The optional field means the type doesn't enforce the invariant at compile time. Mitigation: `buildSnapshot()` is the only factory for `MetricSnapshot` in production paths, and it always sets `sessionCount`. The `?? 0` fallback is documented in the type JSDoc.


# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Decision filed  
**Related to:** Phase 4.6 Wave 2 — Wiring Curator change vectors → prescriber `historicalVectors`

---

## Problem

Wave 1 ships with two disconnected halves:
- **Producer:** Curator computes `summarizeChangeVectors()` but doesn't expose it to callers
- **Consumer:** Prescribers accept optional `historicalVectors?: ChangeVectorSummary[]` but nothing passes them

**Missing:** An orchestration adapter that queries Cairn and injects vectors into Forge prescriber calls, while respecting "Forge never imports Cairn" acyclic dependency constraint.

---

## Decision: `ChangeVectorProvider` Port + Cairn Adapter

Define a new interface in `@akubly/types`:

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): ChangeVectorSummary[];
}
```

Cairn implements `SqliteChangeVectorProvider: ChangeVectorProvider` with a single method that:
1. Queries change_vectors table by skill_id
2. Aggregates rows into `ChangeVectorSummary` objects
3. Returns the array

Forge receives the provider as an injected dependency. Prescriber call sites invoke `provider.getSummaries(skillId)` and pass the result to `historicalVectors`.

---

## Alternatives Considered

### Option A: Direct DB query in applier/prescriber call site

The caller imports `summarizeChangeVectors` from Cairn and calls it inline.

| Pro | Con |
|-----|-----|
| Simplest. No new abstractions. | **Violates "Forge never imports Cairn" constraint.** Tightly couples. |
| Zero new code. | Cannot unit-test call site without real DB. |

**Verdict:** Ruled out — breaks acyclic dependency.

### Option B: Extend `FeedbackSource` with `getChangeVectorSummaries` method

Couple vectors to the existing feedback interface.

| Pro | Con |
|-----|-----|
| No new interface. | **Conflates two concerns.** Vectors are observations; feedback is input signal. |
| Single dependency injection. | Less composable for Phase 5 (cloud vectors) without touching FeedbackSource. |

**Verdict:** Ruled out — poor separation of concerns.

---

## Why This Option

- **Acyclic dependency:** Respects "Forge never imports Cairn." Provider is abstracted in types.
- **Established pattern:** Mirrors `FeedbackSource` injection pattern already used.
- **Independent evolution:** Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`.
- **Type promotion:** `ChangeVectorSummary` moves from being dual-copied (guarded only by Laura's test) to a single definition in `@akubly/types`.
- **Small contract surface:** One type + one method interface.

---

## Trade-off Named

Slightly more wiring than extending `FeedbackSource` (adding a new interface, new adapter), but the architectural return is worth it: better separation of concerns and independently evolvable subsystems for future phases.

---

## Implementation Ownership

- **@akubly/types:** Alexander defines `ChangeVectorProvider` interface + promotes `ChangeVectorSummary` type
- **Cairn:** Alexander/Roger implement `SqliteChangeVectorProvider` adapter
- **Forge:** Rosella integrates provider injection + updates prescriber call sites
- **Tests:** Laura covers provider contract, prescriber integration with mocked provider


---

# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port + PrescriberOrchestrator Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2

---

## ChangeVectorProvider

**Decision:** Use a `ChangeVectorProvider` interface in `@akubly/types` with a Cairn-side `SqliteChangeVectorProvider` adapter.

**Alternatives considered:**
1. Direct DB query in applier (violates "Forge never imports Cairn")
2. Extend `FeedbackSource` with `getChangeVectorSummaries` method (couples prediction concern to observation concern; less composable for Phase 5 cloud vectors)

**Why this option:**
- Follows the established injection pattern (`FeedbackSource` precedent)
- Respects acyclic dependency constraint
- Independently evolvable — Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`
- `ChangeVectorSummary` type promoted to `@akubly/types` eliminates the dual-copy maintenance burden
- Small contract surface: one type + one single-method interface

## PrescriberOrchestrator

**Decision:** Add a `PrescriberOrchestrator` interface in `@akubly/types`. Forge implements it (wraps both prescribers). Cairn's Curator calls it via injection after the vector sweep.

**Alternatives considered:**
1. Cairn imports Forge prescribers directly (violates acyclic dep constraint)
2. Forge-only manual invocation, defer Cairn-side (contradicts Phase 4.5 spec §ADR-P4.5-006 which designates Cairn as the autonomous trigger path)

**Why this option:**
- The Phase 4.5 spec explicitly designed two trigger paths: manual in Forge, Curator-driven in Cairn. The Curator is the primary production invocation path.
- Prescribers are pure functions in Forge. Cairn needs to call them but can't import Forge. A port resolves this cleanly — same pattern as `FeedbackSource` and `ExportQualityGate`.
- Single-method interface, minimal surface.

## Negative-Impact Attenuation

**Decision:** Implement attenuation in Wave 2 (not defer). When `meanNetImpact < 0`, `confidenceBoost` drops below 1.0 (clamped to ≥ 0.3). Without this, wiring would allow auto-apply of historically harmful prescriptions.

**Trade-off named:** Adds ~5 lines of logic + 4 tests across two packages. Small scope increase for eliminating a known-bad production behavior.

---

# ADR: Wave 2 v3 — Wiring Shape + Scope Split + Safety Gates

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-21  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2 v3 (revision of 2026-05-20 ADR, incorporates duck critique and scope refinement)

---

## ChangeVectorProvider Port

**Decision:** `ChangeVectorProvider` interface in `@akubly/types` with async return type (`Promise<ChangeVectorSummary[]>`). Cairn implements via `SqliteChangeVectorProvider`.

**Reasoning:** Same as v1 (follows FeedbackSource pattern, respects acyclic deps). v3 adds `Promise` return type for Phase 5 readiness — avoids interface churn when cloud providers land.

## Wave 2/3 Split

**Decision:** Wave 2 = data plumbing + manual invocation via top-level composition script. Wave 3 = Curator-driven automatic orchestration.

**Reasoning:** `curate()` is a module-level function in Cairn with no injection points, called from Cairn-only entrypoints (hooks, MCP). Injecting a Forge-implemented orchestrator requires a composition root that imports both packages. No such root exists today. Creating one is a package boundary decision that deserves its own ADR, not a wiring detail buried in Wave 2.

**Trade-off named:** Wave 2 only delivers manual invocation. The autonomous Curator path (primary production trigger per Phase 4.5 spec) is deferred. But the hard parts (type promotion, safety gates, provider adapter) ship in Wave 2; Wave 3 is pure wiring once composition ownership is decided.

## Hint Deduplication

**Decision:** `(skillId, source, category)` dedup key with active-status filter (`pending`, `accepted`, `deferred`). Skip insertion if match exists. No upsert — preserves audit trail.

**Reasoning:** Prescribers generate fresh UUIDs every invocation. Without dedup, repeated runs create unbounded duplicate hints. The existing Cairn prescriber uses `hasActivePrescription(insightId)` for the same purpose. Same pattern, different key.

## Negative-Impact Attenuation

**Decision:** Two-layer defense:
1. Confidence scaling: `confidenceBoost = max(0.1, 1.0 + meanNetImpact)` when mature evidence + negative impact. Sparse evidence: no attenuation (boost stays 1.0).
2. Eligibility flag: `autoApplyEligible = false` when `meanNetImpact < -0.2` and `vectorCount >= minVectors`.

**Reasoning:** Confidence scaling alone with a floor of 0.3 (v2) could still pass permissive auto-apply thresholds. The `autoApplyEligible` flag is defense-in-depth — the applier checks it independently of confidence math. Strongly negative categories cannot auto-apply regardless of threshold configuration.



---

# ADR: Wave 2 Wiring Shape — ChangeVectorProvider + Safety Gates

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-05 (v3.1)
**Status:** Proposed
**Scope:** Phase 4.6 Wave 2

## Context

Wave 1 shipped change-vector computation (Cairn) and prescriber ranking (Forge) as independent primitives. No runtime code connects them. Wave 2 wires them together.

## Decisions

### 1. Wiring Shape: ChangeVectorProvider Port

`ChangeVectorProvider` interface in `@akubly/types` with async `getSummaries(skillId): Promise<ChangeVectorSummary[]>`. Cairn implements (`SqliteChangeVectorProvider`). Forge consumes via parameter injection. Follows `FeedbackSource` precedent.

### 2. Wave 2/3 Split

**Wave 2:** Data plumbing, safety gates, manual CLI invocation (`scripts/optimize-skill.ts`).
**Wave 3:** Composition root ADR, Curator integration, MCP tool exposure.

**Rationale:** No composition root today imports both packages. Creating one is a package boundary decision requiring its own ADR, not a "wiring detail."

### 3. Hint Dedup Policy

Key: `(skillId, source, category)` with active-status filter (`pending`, `accepted`, `deferred`). Skip insertion when active hint exists for same key. Follows `hasActivePrescription` precedent.

### 4. Two-Layer Attenuation

**Layer 1 — Confidence scaling:** `confidenceBoost = max(ATTENUATION_FLOOR, 1.0 + meanNetImpact)` when negative + mature evidence. `ATTENUATION_FLOOR = 0.1`.

**Layer 2 — Auto-apply gate:** `autoApplyEligible = false` when `meanNetImpact < NEGATIVE_IMPACT_AUTO_APPLY_GATE` (-0.2) + mature evidence. Defense-in-depth — even if confidence thresholds are reconfigured, strongly negative categories can't auto-apply.

### 5. autoApplyEligible Propagation

Full path: `ChangeVectorSummary` (computed at summary time) → prescriber copies onto `OptimizationHint` field → persisted in `evidence` JSON blob → applier checks `hint.autoApplyEligible === false` before auto-apply.

`OptimizationHint` gains `autoApplyEligible?: boolean` (optional, backward-compatible). Absent/undefined treated as `true`.

### 6. Named Constants

- `NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2` — in `@akubly/types`, next to `ChangeVectorSummary`
- `ATTENUATION_FLOOR = 0.1` — in both `forge/prescribers/utils.ts` and `cairn/db/changeVectors.ts`

`-0.2` chosen because it matches the drift tier boundary (GREEN < 0.2). A prescription that shifts metrics by one drift tier in the wrong direction is "noticeably harmful."

## Consequences

- `ChangeVectorSummary` promoted from two copies to `@akubly/types` (eliminates duplication risk)
- One new port interface + one constant exported from shared types
- No new cross-package dependencies (composition script lives at repo root)
- Wave 3 inherits clean primitives and only needs to solve composition ownership

# Squad Decisions

## Active Decisions


# Phase 4.6 Kickoff — Change Vector Learning

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-03  
**Status:** Kickoff — ready for team spawn  
**Branch:** `squad/phase4.6-change-vectors`

---

## 1. Branch Decision

**Decision:** New branch `squad/phase4.6-change-vectors` from `squad/phase4-export-pipeline`.

**Rationale:**
- Phase 4.5 is complete (1012 tests, review-hardened). Clean phase boundary.
- PR-per-phase pattern established in Phases 3, 4, 4.5.
- Keeps the diff reviewable — Phase 4.6 is ~200 LOC, but will have its own test surface.
- If Phase 4.6 needs to bake longer, it doesn't block Phase 4.5 merge to main.

**Alternative rejected:** Continue on current branch. Would blur the PR boundary and make rollback harder if change vectors need iteration.

---

## 2. Spec Clarifications (Resolved)

### 2.1 Migration 012 Placement

**Resolved:** `packages/cairn/src/db/migrations/012-change-vectors.ts`, registered in `schema.ts` (version 12). Follows exact pattern of migrations 010/011.

### 2.2 Where `change_vectors` Writes Happen

**Resolved:** New CRUD module `packages/cairn/src/db/changeVectors.ts` owns reads/writes. The **computation trigger** is the Curator sweep — when aggregating profiles, if a hint with status `'applied'` has a subsequent metric snapshot available (from a later execution_profile update), the Curator computes and inserts the change vector. This is NOT in the prescriber or applier — it's a post-hoc observation.

**Rationale:** The Curator already owns cursor-based aggregation sweeps. Adding vector computation to the sweep is O(applied_hints) per sweep, naturally rate-limited, and consistent with the "observe, don't block" principle.

### 2.3 `historicalVectors` Integration with Prescriber Signatures

**Resolved:** Add optional third parameter to both prescribers:

```typescript
// Before (Phase 4.5):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig): PrescriberResult

// After (Phase 4.6):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig, historicalVectors?: ChangeVectorSummary[]): PrescriberResult
```

**Type definition** (in `prescribers/types.ts`):
```typescript
export interface ChangeVectorSummary {
  category: OptimizationCategory;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  confidence: number; // log-scaled boost
}
```

**Why optional param, not config:** Config is static per-invocation. Vectors are dynamic data queried per-skill. Semantic distinction matters for testability — tests can pass vectors directly without mocking a DB query.

### 2.4 "Before/After Metric Snapshots" — Concrete Meaning

**Resolved:**
- **Before:** `optimization_hints.metric_snapshot` JSON column (captured at hint generation time, already exists in migration 011).
- **After:** The `execution_profiles` row for the same `skill_id` at the time the Curator sweep runs (post-application).
- **Delta:** `after_value - before_value` for each of the 5 metric fields in `MetricSnapshot`.

No new "snapshot" table needed — the before is already stored, the after is the live profile.

### 2.5 Min `sessions_observed` Window

**Decision:** Configurable with sensible default.

```typescript
export interface ChangeVectorConfig {
  /** Minimum sessions between before/after to consider vector valid. Default: 3. */
  minSessionsObserved?: number;
}
```

**Rationale:** Fixed value is too rigid. A skill used 100x/day needs fewer sessions than one used 2x/week. Default 3 matches the prompt optimizer's `minSessions` canary threshold.

### 2.6 Net Impact Weighting

**Decision:** Same weights as drift score (from `telemetry/drift.ts`).

The roadmap spec explicitly states: `net_impact = Σ(delta_i × weight_i) // same weights as drift score`. This means:
- convergence: 0.30
- toolEntropy: 0.25 (maps to `delta_drift` since drift subsumes entropy)
- promptStability: 0.15
- cacheHit: 0.15
- cost: 0.15

**Import the weight constants** from `telemetry/drift.ts` rather than duplicating. Single source of truth.

---

## 3. Work Decomposition

### Wave 1 — Foundation (Alexander, parallel with Rosella type work)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| A1 | Alexander | Migration 012 | `012-change-vectors.ts` — CREATE TABLE + indices per roadmap §1.2 | — |
| A2 | Alexander | Schema registration | Import + register migration012 in `schema.ts`, version bump to 12 | A1 |
| A3 | Alexander | CRUD module | `packages/cairn/src/db/changeVectors.ts` — insert, getByHintId, getByCategory, computeNetImpact | A1 |
| A4 | Alexander | Curator integration | Add vector computation to Curator sweep: for each `applied` hint with sufficient post-application sessions, compute + insert vector | A3 |

### Wave 2 — Prescriber Enhancement (Rosella)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| R1 | Rosella | Types | `ChangeVectorSummary` interface in `prescribers/types.ts` | — |
| R2 | Rosella | Confidence scaling | `computeConfidenceBoost(vectorCount, minVectors)` utility in `prescribers/utils.ts` | R1 |
| R3 | Rosella | Prompt prescriber integration | Add `historicalVectors?` param to `analyzePromptOptimizations`, apply confidence boost + predicted impact ranking | R1, R2 |
| R4 | Rosella | Token prescriber integration | Same for `analyzeTokenOptimizations` | R1, R2 |
| R5 | Rosella | Weight import | Import drift weights from `telemetry/drift.ts` for `computeNetImpact` — ensure single source of truth | — |

### Wave 3 — Tests (Laura)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| L1 | Laura | Migration tests | 012 applies cleanly, idempotent re-run, table/index existence | A1 |
| L2 | Laura | CRUD tests | Insert/query/net-impact-computation for changeVectors module | A3 |
| L3 | Laura | Prescriber integration tests | Both prescribers with/without historicalVectors — verify confidence boost, ranking changes, edge cases (empty vectors, single vector, negative impact) | R3, R4 |
| L4 | Laura | Curator vector computation test | End-to-end: applied hint → profile update → sweep → vector appears | A4 |
| L5 | Laura | Weight consistency test | Assert net_impact weights match drift score weights (regression guard) | R5 |

### Critical Path

```
A1 → A2 (trivial)
A1 → A3 → A4
R1 → R2 → R3/R4
A3 + R3/R4 → L3
A4 → L4
```

**Estimated scope:** ~200 LOC production, ~150 LOC tests, 15-20 new tests. 1-day sprint for the team.

---

## 4. ADRs for This Phase

### ADR-P4.6-001: Curator owns vector computation (not prescriber, not applier)

Vectors are post-hoc observations about prescription efficacy. The Curator already sweeps periodically. Adding computation here keeps the prescriber pure (stateless analysis) and the applier focused on writes.

**Alternative rejected:** Compute in the applier after applying a hint. Problem: the "after" snapshot isn't available yet at application time — you need subsequent sessions to measure the effect.

### ADR-P4.6-002: Optional parameter over config object for historicalVectors

Keeps the prescriber testable without mocking a database. Tests pass vectors directly. Production code queries them from CRUD and passes in.

**Alternative rejected:** Add `vectorSource: () => ChangeVectorSummary[]` to config. Over-abstracted for a single call site.

### ADR-P4.6-003: Same weights as drift score

Single source of truth for "what matters" (Determinism > Cost). No independent weight tuning for net impact — if drift weights change, net impact changes too. Avoids divergent optimization signals.

---

## 5. Open Questions for Aaron

1. **Vector TTL:** Should old change vectors expire? The roadmap doesn't specify. My recommendation: no TTL for now — vectors are small and historical accuracy improves with data. Revisit if table exceeds 10K rows.

2. **Negative vectors:** If a prescription made things worse (negative net_impact), should it influence future confidence negatively (reduce confidence below baseline)? My recommendation: yes — `confidence_boost = log(1 + vectors_count) / log(1 + min_vectors)` only handles positive correlation. We should also apply a penalty multiplier when `meanNetImpact < 0`. But this is an enhancement we can add in Wave 2 without blocking Wave 1.

---

## 6. Ready to Spawn

**Status: YES — ready to spawn.**

All ambiguities resolved. Work items are concrete. No blockers.


# Decision: Weight Constants in Cairn (ADR-P4.6-003 Implementation)

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-03  
**Status:** Decided  
**Relates to:** ADR-P4.6-003 (same weights as drift score, single source of truth)

---

## Context

The `computeNetImpact` function in `packages/cairn/src/db/changeVectors.ts` requires the
same drift-signal weights used by `DRIFT_WEIGHTS` in `packages/forge/src/telemetry/drift.ts`.

ADR-P4.6-003 mandates a single source of truth: if drift weights change, net_impact must
change with them.

## Problem

Cairn cannot import from Forge. The dependency graph constraint is acyclic: Forge never
imports Cairn, and Cairn has no `@akubly/forge` dependency in its `package.json`. Adding
one would introduce a circular dependency (`@akubly/cairn` ← `@akubly/forge` ← ... ← back).

The kickoff doc §2.3/A3 explicitly acknowledged this risk and provided the fallback:
> "If there's a circular dep risk between cairn and forge, instead define the weight constants
> in cairn AND add a Laura-checked regression test (L5) confirming they match."

## Decision

**Mirror the constants in Cairn with explicit mapping documentation.**

`packages/cairn/src/db/changeVectors.ts` exports `CHANGE_VECTOR_WEIGHTS` with values
mirrored from `DRIFT_WEIGHTS`, with the delta-field → drift-signal mapping documented inline:

```typescript
export const CHANGE_VECTOR_WEIGHTS = Object.freeze({
  deltaDrift:        0.25,  // DRIFT_WEIGHTS.toolEntropy (drift subsumes entropy)
  deltaCost:         0.15,  // DRIFT_WEIGHTS.contextBloat (cost ↔ context utilization)
  deltaSuccessRate:  0.15,  // DRIFT_WEIGHTS.promptStability
  deltaConvergence:  0.30,  // DRIFT_WEIGHTS.convergence
  deltaCacheHit:     0.15,  // DRIFT_WEIGHTS.tokenPressure (cache ↔ token efficiency)
});
```

## Net-Impact Sign Convention

Deltas are stored as `after - before`. For lower-is-better metrics (drift, cost, convergence),
a negative delta = improvement. `computeNetImpact` negates these before weighting so that
**positive net_impact = prescription was beneficial**:

```
net_impact = -deltaDrift * 0.25
           + -deltaCost * 0.15
           + deltaSuccessRate * 0.15
           + -deltaConvergence * 0.30
           + deltaCacheHit * 0.15
```

This makes `meanNetImpact` in `ChangeVectorSummary` directly comparable: positive = good,
negative = prescription made things worse (Wave 2 penalty hook point).

## Rationale for Rejection of Alternatives

| Alternative | Rejection reason |
|-------------|-----------------|
| Import DRIFT_WEIGHTS from forge into cairn | Creates circular dep |
| Extract weights to `@akubly/types` | Adds coupling for no composability gain; types pkg is for shared types, not algorithmic constants |
| Pass weights as parameter to computeNetImpact | Over-abstracted; only one caller, weights are stable constants |

## Regression Guard

Laura's **L5 test** (`curatorVectors.test.ts` or dedicated file) must assert:
```typescript
// cairn CHANGE_VECTOR_WEIGHTS values match forge DRIFT_WEIGHTS values
expect(CHANGE_VECTOR_WEIGHTS.deltaConvergence).toBe(DRIFT_WEIGHTS.convergence);    // 0.30
expect(CHANGE_VECTOR_WEIGHTS.deltaDrift).toBe(DRIFT_WEIGHTS.toolEntropy);          // 0.25
expect(CHANGE_VECTOR_WEIGHTS.deltaSuccessRate).toBe(DRIFT_WEIGHTS.promptStability); // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCacheHit).toBe(DRIFT_WEIGHTS.tokenPressure);     // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCost).toBe(DRIFT_WEIGHTS.contextBloat);          // 0.15
```

This test imports from both packages from the monorepo root and will fail if either set
of constants drifts. It is the enforcement mechanism for ADR-P4.6-003.

## Sessions-Observed Proxy

A secondary decision: the Curator sweep uses `execution_profiles.session_count` as the
proxy for "sessions since hint applied". The `metric_snapshot` stored at hint-generation
time does not include session count (not in `MetricSnapshot`), so exact delta is not
available. Using total session count as the minimum guard (≥ minSessionsObserved = 3) is
conservative and safe: it means vectors are only computed once a skill has at least 3
sessions, which is the same threshold the prompt optimizer uses for canary decisions.
The `sessions_observed` field in the inserted row records the actual total session count
at computation time, giving downstream consumers full context.


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


# Defect Flag: `summarizeChangeVectors` confidence=0 inconsistency

**From:** Laura (Tester)  
**Date:** 2026-05-03  
**Phase:** 4.6 — Change Vector Learning  
**Severity:** Latent risk (not a production path today)  
**Assigned to:** Team (Graham to triage)

---

## Summary

`summarizeChangeVectors` returns `confidence: 0` when `vectorCount === 0`,
but `computeConfidenceBoost(0)` returns `1.0`. These two are inconsistent,
and the inconsistency can cause silent confidence zeroing if a zero-vector
summary is ever passed to a prescriber.

---

## Details

### `computeConfidenceBoost(n: number)` (forge, Rosella R1)

```ts
export function computeConfidenceBoost(vectorCount: number): number {
  // returns 1.0 when vectorCount === 0 (no evidence → no change)
  if (vectorCount === 0) return 1.0;
  // ...
}
```

Rosella's design intent: absence of evidence = neutral (multiply by 1.0,
no modification to existing confidence).

### `summarizeChangeVectors(...)` (cairn, Alexander A3)

```ts
if (rows.length === 0) {
  return { vectorCount: 0, meanNetImpact: 0, confidence: 0 };
}
```

Alexander's current behavior: absence of vectors → `confidence: 0`.

### The conflict

If a prescriber receives a summary with `confidence: 0` and applies the
confidence boost formula:

```ts
hint.confidence *= summary.confidence; // 0 → zeroes out all confidence
```

Every hint's confidence would be zeroed. This is **not a current production
path** — the prescribers currently only call `computeConfidenceBoost(summary.vectorCount)`,
not `hint.confidence *= summary.confidence`. But the inconsistency is a
latent trap for future developers.

---

## Expected behavior (my read)

When `vectorCount === 0`, `summarizeChangeVectors` should return
`confidence: 1.0` to match `computeConfidenceBoost(0)`.

OR: the field name should be changed to make the zero-default semantics
explicit (e.g., `rawConfidence` vs `boost`).

---

## Impact

- **Current production:** No impact. Prescribers call `computeConfidenceBoost(vectorCount)`,
  not `summary.confidence`.
- **Latent risk:** Any future code that does `hint.confidence *= summary.confidence`
  will silently zero confidence when there are no vectors.
- **Test coverage:** `changeVectors.test.ts` L2 has an `it.todo` for
  `'summarizeChangeVectors — confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)'`
  which documents this expected fix.

---

## Suggested resolution

Option A (minimal): Change `confidence: 0` to `confidence: 1.0` in the
zero-vector branch of `summarizeChangeVectors`.

Option B (clarifying): Rename the field to make the semantic explicit, and
document the "no vectors = no change" contract in JSDoc.

Option C (defer): Accept the inconsistency as intentional (zero confidence
= "we have no data, don't trust this hint") and update `computeConfidenceBoost`
to also return 0 for vectorCount=0. Then the prescriber logic becomes "if
confidence=0, skip the hint."

---

## Next action

Graham to decide between A/B/C in the next decision meeting. If Option A or
B is chosen, Alexander to patch `changeVectors.ts` and Laura to upgrade the
`it.todo` in `changeVectors.test.ts`.


# Verdict: `summarizeChangeVectors` confidence=0 inconsistency

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-03
**Phase:** 4.6 — Change Vector Learning
**Triggered by:** Laura's defect flag (`laura-phase4.6-summarize-confidence-zero.md`)
**Status:** DECIDED

---

## Verdict: B — Rename field to `confidenceBoost`

### Rationale

Aaron's analysis is correct and I'm adopting it. A confidence *level* and a
confidence *boost* occupy different mathematical spaces:

- **Level** ∈ [0, 1]: "how sure are we?" — 0 = no confidence, 1 = full confidence.
- **Boost** ∈ ℝ⁺ (multiplicative): "how much should we scale existing confidence?" — 1.0 = identity (no change), >1.0 = amplify, <1.0 = attenuate.

The field is named `confidence` but the JSDoc (my own kickoff doc, §2.3) says
"log-scaled boost" and `computeConfidenceBoost(0)` returns `1.0`. The field
name lies about what it contains. That is the root cause — Alexander's `0`
makes perfect sense *if* confidence is a level, and Rosella's `1.0` makes
perfect sense *if* confidence is a boost. Both implementations are internally
consistent; the bug is the ambiguous type definition.

Option A (patch value to 1.0) would fix the symptom but leave the misleading
name in place — the next developer who reads `confidence: number` will assume
level semantics and write `if (summary.confidence === 0)` instead of
`if (summary.confidenceBoost === 1.0)`.

Option C is rejected outright: returning 0 for zero vectors would zero out
every hint's confidence at cold start (no vectors yet), which defeats the
canary bootstrap from Phase 4.5. That's a functional regression, not a fix.

### New field name: `confidenceBoost`

Alternatives considered:

| Name | Pros | Cons | Decision |
|------|------|------|----------|
| `confidenceBoost` | Self-documenting, matches `computeConfidenceBoost()` function name | Slightly long | **Chosen** |
| `boostFactor` | Short | Generic — doesn't say *what* it boosts | Rejected |
| `vectorBoost` | Ties to source data | Doesn't communicate that it scales *confidence* | Rejected |

`confidenceBoost` wins because it mirrors the existing function name
`computeConfidenceBoost()` — one name, one concept, zero ambiguity.

---

## Files to change

| # | File | Change | Current owner |
|---|------|--------|---------------|
| 1 | `packages/forge/src/prescribers/types.ts` | `confidence` → `confidenceBoost` in `ChangeVectorSummary`; update JSDoc | Rosella (R1) |
| 2 | `packages/cairn/src/db/changeVectors.ts` | `confidence` → `confidenceBoost` in local `ChangeVectorSummary` + `summarizeChangeVectors` return; fix zero-vector case from `0` → `1.0` | Alexander (A3) |
| 3 | `packages/forge/src/prescribers/promptOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R3) |
| 4 | `packages/forge/src/prescribers/tokenOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R4) |
| 5 | Tests (multiple files) | Update all references to `.confidence` on `ChangeVectorSummary` objects | Laura (L2, L3) |

---

## Fix routing (Reviewer Rejection Protocol §lockout)

The lockout rule: the author of the buggy code may NOT be the one to fix it.
A different agent must make the correction.

| Code to fix | Written by | Fixed by | Rationale |
|-------------|-----------|----------|-----------|
| `packages/cairn/src/db/changeVectors.ts` — rename field + fix `0` → `1.0` | Alexander (A3) | **Rosella** | Alexander wrote the zero-default; lockout applies |
| `packages/forge/src/prescribers/types.ts` — rename field in interface | Rosella (R1) | **Alexander** | Rosella defined the type; lockout applies |
| `packages/forge/src/prescribers/promptOptimizer.ts` — update reference | Rosella (R3) | **Alexander** | Same author, same lockout |
| `packages/forge/src/prescribers/tokenOptimizer.ts` — update reference | Rosella (R4) | **Alexander** | Same author, same lockout |
| Tests (`changeVectors.test.ts`, `prescribers-vectors.test.ts`, etc.) | Laura | **Laura** | Test updates are Laura's domain regardless of lockout |

**Summary:**
- **Alexander** fixes: `types.ts`, `promptOptimizer.ts`, `tokenOptimizer.ts` (Rosella's code)
- **Rosella** fixes: `changeVectors.ts` (Alexander's code)
- **Laura** fixes: all affected test files

---

## ADR reference

This verdict extends ADR-P4.6-002 (§4 of kickoff doc): the `ChangeVectorSummary`
type's `confidenceBoost` field carries boost-multiplier semantics with identity
value 1.0. Prescribers apply it as `hint.confidence *= summary.confidenceBoost`.

---

## Verification criteria

1. `computeConfidenceBoost(0)` returns `1.0` ✓ (already correct, no change needed)
2. `summarizeChangeVectors(db, cat, skill)` returns `confidenceBoost: 1.0` when vectorCount === 0
3. No remaining references to `summary.confidence` in prescriber or CRUD code
4. All existing tests pass after rename
5. Laura's `it.todo` for "confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)" is upgraded to a passing test



### 2026-05-01: Phase 4 Export Pipeline Architecture

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 introduces the Export Pipeline — the third integration seam from the Forge build kickoff. It converts persisted `CairnBridgeEvent`s into certified SKILL.md files with DBOM provenance in YAML frontmatter.

**Key Decisions:**

#### ADR-P4-001: Fixed pure-function pipeline (not plugin architecture)
Four stages: Extract → Strip → Attach → QualityGate. Pure functions composed by `runExportPipeline()`. Dynamic stage registration rejected as YAGNI.

#### ADR-P4-002: Quality gate as injected function
`ExportQualityGate` is a function type in Forge. Cairn satisfies it at the call site. Consistent with `createModelCatalog(listFn)` pattern. Forge never imports Cairn.

#### ADR-P4-003: DBOM upsert (replace) semantics
One DBOM per session. Re-export replaces. Versioned history rejected — no current consumer.

#### ADR-P4-004: Soft quality gate failure
Gate failure returns `success: false` with the compiled skill still included. Caller decides write policy. DBOM persistence failures are fail-open.

#### ADR-P4-005: No new shared types
All Phase 4 types stay package-internal. Continues ADR-P3-004 precedent.

**Impact:**
- **New files:** `packages/forge/src/export/` (5 files), `packages/cairn/src/db/migrations/010-dbom-artifacts.ts`, `packages/cairn/src/db/dbomArtifacts.ts`
- **Modified files:** `packages/cairn/src/db/schema.ts` (register migration), `packages/forge/src/index.ts` (barrel update)
- **Tests:** 99 total (62 contract + 37 production)

**Specification:** Full spec at `docs/forge-phase4-spec.md`.

---

### 2026-05-01: Export Pipeline — Function Types over Shared Interfaces

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 export pipeline needs a quality gate that runs Cairn's linter/validator on compiled SKILL.md content. Forge must never import @akubly/cairn directly (acyclic dependency graph constraint).

**Decision:**
Quality gate is a simple function type `(skillContent: string) => QualityGateResult` defined in `forge/export/types.ts`. The caller (Cairn MCP tool or CLI) wires Cairn's functions into this shape. No shared interface in `@akubly/types`.

All Phase 4 types (`ExportDiagnostic`, `QualityGateResult`, `CompiledSkill`, `SkillFrontmatterInput`, `StageContext`, pipeline config/result types) stay package-internal in forge.

**Rationale:**
- Only one call site needs this contract — a shared interface in @akubly/types adds coupling for no composability gain.
- Function types are the simplest contract. If the quality gate signature changes, only forge and the one wiring site update.
- Consistent with Phase 3 pattern (`createModelCatalog(listFn)`).
- No new shared types means zero risk of cross-package type churn.

**Impact:**
- 5 new files in `packages/forge/src/export/`
- 32 new unit tests, 99 total export tests
- Forge test count: 326 → 388

---

### 2026-05-01: Export Pipeline Quality Gate Semantics

**Author:** Laura (Tester)  
**Type:** Test Contract  
**Status:** Implemented  
**Date:** 2026-05-01 (updated from 2026-04-30)

Phase 4 export pipeline uses quality gates before emitting a compiled SKILL.md. Now aligned with `docs/forge-phase4-spec.md` §4.4, §4.5, §7.

**Decision (spec-aligned):**
- Quality gate is an injected `ExportQualityGate = (skillContent: string) => QualityGateResult`
- `QualityGateResult.passed === false` → `ExportPipelineResult.success = false`
- Quality gate failure is **fail-closed but soft**: compiled skill is still returned for inspection, `qualityGatePassed = false`
- DBOM persistence failure is **fail-open**: warning diagnostic, pipeline continues
- Gate results propagate: `lintErrors`, `lintWarnings`, `validationScore` flow to pipeline result
- If the quality gate function **throws**, spec §7.1 says catch + diagnostic. Current inline implementation propagates — Roger should add try/catch in production (implemented by Coordinator).

**Key Finding:**
`validateStage` did NOT catch exceptions from the injected quality gate. Spec §7.1 explicitly says "Catch + diagnostic" for this case. Test documents this gap — production `validateStage` must wrap the gate call in try/catch. **Coordinator fixed in production implementation.**

**Impact:**
- 62 contract tests + 37 production tests in `export.test.ts` (99 total)
- `ExportQualityGate` replaces the old `CairnToolkit` interface (simpler, one function vs five)
- Forge never imports `@akubly/cairn` — gate is wired at call site per §5.2
- All 99 tests passing (100%)

---

### 2026-04-30: Event Dedup Guard — bridgeAttached flag

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Defensive Correctness
**Status:** Implemented

ADR-P3-005 defines dual event paths: `SessionConfig.onEvent` captures events during `createSession()` (before `session.on()` is wired), and `session.on()` captures events after `ForgeSession` construction. Design reviewers independently flagged that if the SDK fires events via `onEvent` after `createSession` resolves — during the gap before `ForgeSession` wires `session.on()` — both paths would emit the same event, causing duplicate `CairnBridgeEvent`s. This corrupts `TokenTracker` accumulation and `DBOM` reconstruction.

Added a `bridgeAttached` boolean flag in `ForgeClient.createSession()`. The `onEvent` closure checks this flag and returns early if `true`. The flag is set immediately before `ForgeSession` construction (which wires `session.on()` in its constructor).

**Alternatives Considered:**
1. Hash-based dedup (eventId or type+timestamp LRU) — More robust against unknown overlap patterns, but adds complexity (LRU cache, hash computation) for a problem that has a clean temporal boundary. Rejected as over-engineering for a Technical Preview SDK.
2. No guard — Relies on SDK honoring the non-overlapping window contract. Rejected because the SDK has shipped 52 versions in 3 months — behavioral contracts are unstable.

**Impact:**
- `packages/forge/src/runtime/client.ts` — ~4 LOC added (flag declaration, check, set)
- `packages/forge/src/__tests__/runtime.test.ts` — 2 new tests (overlap prevention + pre-bridge capture confirmation)
- All 289 tests pass, zero regressions

---

### 2026-04-29: Mock Session Unsubscribe Semantics

**Author:** Laura (Tester)
**Type:** Test Infrastructure
**Status:** Observation

While writing L6 Token Tracker integration tests, the shared mock session's `on()` returns a no-op unsubscribe function. This works fine for ForgeSession's bridge wiring (which only uses unsubscribe at disconnect time, where the whole session is torn down), but breaks any test that needs to verify real unsubscribe behavior — the handler keeps firing after "unsubscribing."

For tests requiring real unsubscribe semantics, build a dedicated `EventSource` adapter with `Set<handler>`-based subscribe/unsubscribe rather than trying to enhance the mock session. The mock session is designed for ForgeSession/ForgeClient lifecycle testing; the EventSource interface is the correct abstraction for lower-level eventing tests.

**Impact:** No changes to shared helpers needed. This is a documented pattern for future test authors: when testing event unsubscription, build a standalone EventSource, don't use `createMockSession()`.

---

### 2026-04-29: HookComposer Uses Live Observer Set

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Architecture
**Status:** Implemented

HookComposer class holds a live `Set<HookObserver>`. The `compose()` method returns hooks that reference the live set, so add/remove after composition takes effect on the next hook invocation without re-registering with the SDK.

**Tradeoffs:**
- **Pro:** Dynamic observer management without SDK re-registration — critical for decision gates added/removed mid-session.
- **Pro:** Each `add()` returns a dispose function — clean RAII-style cleanup.
- **Con:** Slightly more complex than a pure function; the composed hooks capture `this`.
- **Accepted:** Complexity justified because Cairn's architecture requires dynamic gate registration.

**Affects:**
- `packages/forge/src/hooks/index.ts`
- Any future code that registers decision gates or telemetry observers mid-session

---

### 2026-04-28: Forge Test Infrastructure Pattern

**Author:** Roger Wilco (Platform Dev)
**Type:** Infrastructure
**Status:** Implemented

Forge test infrastructure uses SDK mocks rather than live CLI integration for all unit tests.

**Three Test Helper Modules:**
1. **mock-sdk** — `createMockSession()` / `createMockClient()` with `vi.fn()` stubs and `_emit()` for event dispatch testing.
2. **event-factory** — Type-safe `SessionEvent` builders for all 6 core event types.
3. **type-assertions** — Runtime shape validation for `CairnBridgeEvent` conformance.

**Rationale:**
- SDK requires running Copilot CLI process for real sessions — unit tests must be offline.
- Event factory ensures tests use correctly-typed SDK events without fragile manual construction.
- Type assertion helpers serve double duty: test validation now, production runtime guards later.

**Rule:** All Forge tests must import from `./helpers/index.js`. No test may instantiate `CopilotClient` or `CopilotSession` directly.

---

### 2026-04-28: Hook Composer Must Isolate Observer Errors

**Author:** Laura (Tester)
**Type:** Implementation Requirement
**Status:** Implemented

The production `composeHooks` implementation MUST wrap each observer call in try/catch, logging errors but continuing to the next observer.

**Context:**
Spike's `composeHooks` propagates errors — if one observer's `onPreToolUse` throws, subsequent observers never run. This is dangerous in production: a buggy telemetry observer would kill the decision gate observer, silently removing safety checks.

**Implementation:**
Each observer call wrapped in try/catch. Errors logged but don't prevent subsequent observers from running.

**Test Coverage:**
- `"one observer throwing does not kill others"` — verifies isolated behavior (passing)
- `"spike composeHooks propagates errors"` — documents the spike's known gap (baseline)

**Impact:**
Telemetry observers are now safe in production. Error in one observer cannot cascade to disable decision gates or other critical observers.

---

### 2026-04-28: Alexander — SDK Interface Types for Runtime Module

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Architecture  
**Status:** Implemented

ForgeClient and ForgeSession depend on thin interface types (`SDKClient`, `SDKSession`) rather than importing CopilotClient/CopilotSession classes directly.

**Rationale:**
1. **Testability** — Mock objects from the test helpers satisfy the interface without needing the real SDK classes (which require a running Copilot CLI process).
2. **SDK churn isolation** — If the SDK adds/removes methods, only the interface definitions need updating, not every consumer.
3. **Dependency inversion** — The runtime module is constructor-injected with an `SDKClient`, making it composable and mockable at every level.

**Tradeoffs:**
- **Pro:** Tests run offline, no SDK instantiation needed.
- **Pro:** SDK method additions don't break existing code until we choose to adopt them.
- **Con:** Must manually keep interfaces in sync with the SDK surface we actually use.
- **Accepted:** The interface surface is small (~5 methods on SDKClient, ~5 on SDKSession), so maintenance cost is negligible.

**Affects:**
- `packages/forge/src/runtime/client.ts` — `SDKClient` interface
- `packages/forge/src/runtime/session.ts` — `SDKSession` interface
- All test code that uses `createMockClient()` / `createMockSession()`

---

### 2026-05-01T18:14:00Z: Phase 4.5 Local Feedback Loop — Aaron's Scope Decisions

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-05-01T18:14:00Z  
**Type:** Direction / Scope  
**Status:** Active

Phase 4.5 brainstorm Round 2 follow-up captured six major decisions:

#### 1. Loop Trigger Model
- **Forge:** Feedback loop is deliberate (manual) — user-initiated review of prescriptions
- **Cairn:** Feedback loop is automatic — pattern detection triggers prescription generation

#### 2. Profile Granularity
All four levels are viable and serve different purposes:
- **Per-skill:** Improves artifacts directly
- **Per-user:** Surfaces human insights (Cairn's core mission)
- **Per-model:** Exploratory/feedback data for determining best model per task
- **Global:** Dashboard of overall trends ("proving our pudding")

#### 3. Cold Start Strategy
Canary bootstrap is the natural choice. Training sessions deferred to Phase 4.75.

#### 4. Ancestry Graph Optimization Exploration
- Track prescription ancestry (which changes caused which drift)
- Derive heuristics about what types of changes cause directional drift
- Long-term: graph math for intelligent exploration of metric space
- Detect local optima via convergence patterns
- When wild cards come online (self-annealing, genetic programming), use graph to introduce evolutions and escape local maxima

#### 5. Feedback Loop Frequency — Maximum Detail Preferred
Aaron's prior stance: "Why would we not want as much detail as possible?" The tradeoffs need to be articulated explicitly before any future pruning decisions.

#### 6. Wild Card Ideas
All six wild cards from brainstorm are approved as future backlog items:
1. Time-Travel Debugging (rewind state to any decision point, replay with different model/parameters)
2. Predictive Cache Warming (pre-fetch likely-needed artifacts before user requests)
3. Self-Annealing Prescriptions (feedback loop automatically re-ranks prescriptions)
4. Genetic Programming Ancestry (crossover + mutation of decision graphs)
5. Karpathy Wiki Integration (encode knowledge graph as executable wiki)
6. Adaptive Skill Ranking (vector-based skill retrieval with user feedback)

**Rationale:** Team decisions from Phase 4.5 brainstorm follow-up — captured for team memory. Cascades to Phase 4.5 implementation planning, Phase 5 canary configuration, and Phase 6+ feature backlog.

**Impact:**
- Ancestry tracking: 200 LOC MVP planned for Phase 4.5
- Caching strategy: 4-layer hierarchy (L1 in-memory → L2 session → L3 short-TTL → L4 long-TTL)
- Vector search: Deferred to Phase 4.75 (non-blocking)
- Graph storage: Recursive CTEs in SQLite for ancestry queries
- Max detail: Capture everything, filter on read (downstream filtering strategy)

---

### 2026-04-30T22:25:00Z: Phase 5 (PGO Telemetry) Deferred — Budget & Data Protection

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-04-30T22:25:00Z  
**Type:** Scope / Risk  
**Status:** Active

Phase 5 (PGO Telemetry) is deferred as future work.

**Reasons:**
1. **Azure budget constraints** — Application Insights is expensive. Cost-benefit unclear until Phase 4.5 canary metrics available.
2. **Corporate data protection** — Requirements for emitting telemetry from work environments must be resolved before telemetry collection begins. Legal review pending.

**Timeline:** Revisit for Phase 4.75 (post-canary) if budget approved and compliance cleared.

**Impact:** Phase 5 planning deferred. Phase 4.5 canary proceeds without integrated telemetry pipeline; manual metrics collection via CLI query tools only.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---
### 2026-05-02: Phase 4.5 Architecture — Local Feedback Loop

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-02  
**Type:** Architecture  
**Status:** Proposed

Phase 4.5 introduces the Local Feedback Loop — a profile-guided optimization engine that runs entirely on local SQLite. Sessions produce telemetry → collectors aggregate signals → prescribers generate optimization hints → the applier writes improved SKILL.md v2 artifacts.

**Key Decisions:**

#### ADR-P4.5-001: Collectors as HookObservers, not a separate event bus
Telemetry collectors implement `HookObserver` and register via `ForgeSession.addObserver()`. No separate telemetry pipeline. Collectors see the same event stream as decision gates. O(1) per event, defer analysis to flush.

#### ADR-P4.5-002: Three tables, not one universal signal table
Separate `signal_samples`, `execution_profiles`, and `optimization_hints` tables. Each has different access patterns and indexes. Same reasoning as Phase 4's separate `dbom_artifacts`/`dbom_decisions`.

#### ADR-P4.5-003: TTL and row caps enforced by Curator, not DB triggers
7-day TTL and 10K row cap on `signal_samples` managed by Curator's existing sweep mechanism. Consistent with existing patterns, avoids synchronous trigger overhead on INSERT.

#### ADR-P4.5-004: Fixed drift weights, not learned
Drift signal weights are constants (convergence: 0.30, toolEntropy: 0.25, tokenPressure: 0.15, contextBloat: 0.15, promptStability: 0.15). Determinism signals get 70% total weight per Aaron's "Determinism > Token Cost" constraint.

#### ADR-P4.5-005: FeedbackSource as new shared type
`FeedbackSource` added to `@akubly/types`. First new shared type since Phase 2. Justified: both Forge (session start) and Cairn (Curator) consume this contract.

#### ADR-P4.5-006: Manual loop trigger in Forge, Curator-driven in Cairn
Forge caller controls `compute()` and `getSink()` invocation timing. Cairn's Curator drives feedback loops via session start + periodic checks. Manual in Forge (library control), autonomous in Cairn (always-on platform).

---

## Phase 4.5 Implementation Decisions (Session 2026-05-02T04:35:00Z)

### 2026-05-02: Phase 4.5 DB CRUD modules use the singleton `getDb()` pattern

**Author:** Alexander (SDK/Runtime Dev)
**Date:** 2026-05-02
**Type:** Convention
**Status:** Implemented

#### Context

The Phase 4.5 spec asked for three new CRUD modules in `packages/cairn/src/db/`
covering signal samples, execution profiles, and optimization hints. The task
brief suggested each module export pure functions accepting a
`Database.Database` parameter. Every existing CRUD module in `packages/cairn/src/db/`
(including the named reference, `dbomArtifacts.ts`) uses the singleton
`getDb()` pattern, and the test harness depends on it via
`beforeEach: closeDb(); getDb(':memory:')`.

#### Decision

The three new modules — `signalSamples.ts`, `executionProfiles.ts`,
`optimizationHints.ts` — call `getDb()` internally rather than accepting a
`Database.Database` argument. This matches every other CRUD module in the
package and lets the existing test harness work unmodified.

#### Rationale

- **Consistency** — Mixing two patterns in `packages/cairn/src/db/` would force
  every future contributor to ask which one applies.
- **Test reuse** — The `closeDb(); getDb(':memory:')` lifecycle is the package
  convention. New tests for these modules use it directly, no plumbing.
- **Reversibility** — If we ever need DI for cross-DB scenarios, refactoring
  the whole `db/` layer in one pass is cleaner than gradually drifting toward
  it module-by-module.

#### Impact

- 3 new CRUD modules + migration 011 + 40 new tests, all green.
- Existing tests asserting `schema_version` count/max (`db.test.ts`,
  `discovery.test.ts`, `prescriptions.test.ts`) bumped from 10 → 11.
- **Note for downstream consumers (Curator):** TTL sweep and row cap
  enforcement live on the Curator, not in the DB. `sweepSignalSamples(cutoffIso)`
  and `enforceSignalSampleCap(cap)` are the primitives to schedule.

---

### 2026-05-02: Phase 4.5 feedback-loop test strategy

**Author:** Laura (Tester)
**Date:** 2026-05-02
**Status:** Implemented

#### Context

Phase 4.5 ships a closed feedback loop: collectors → sink → aggregator →
prescribers → applier → (operator updates skill) → improved next cycle. The
loop is causally complete only when an operator actually edits a SKILL.md and
re-runs sessions. In tests, we cannot close that loop with real model calls.

#### Decision

Adopt **process-invariant testing** for the feedback loop, codified in
`feedback-loop.test.ts`:

1. **Convergence is asserted by *response curve*, not by terminal state.**
   We assert that hint count is monotone non-increasing as profile drift
   decreases across simulated cycles, and that the maximum impact score is
   likewise non-increasing. We do not assert "the system reaches GREEN" —
   that depends on the operator.

2. **The operator's effect is simulated at the profile level.** Each "next
   cycle" feeds the prescriber a profile whose drift mean is lower than the
   previous cycle's. We are testing the system's *response* to improving
   inputs, not the operator's quality.

3. **Efficiency bounds are intentionally generous.** Hot-path collectors are
   capped at 250ms / 10k events (vs. spec implication of ~25µs/event). Tight
   enough to catch O(N) regressions, loose enough to survive CI variability.

4. **Property-based tests use an in-file LCG, not fast-check.** Keeps the
   test suite zero-dep and reproducible. Coverage is sufficient for the
   small-dimensional invariants we care about (drift score bounds,
   classification monotonicity, aggregator commutativity).

#### Implications for Other Agents

- **Alexander / runtime:** if any collector implementation regresses to per-
  event O(N) (e.g., recomputing entropy from a growing list), the L5 tests
  will catch it before it ships.
- **Roger / sink:** the L2 integration test exercises `enqueueSample` at
  buffer-size 1 and 16 and asserts every sample reaches `persistSample`.
  Future sinks (e.g., AppInsightsSink) should pass the same shape of test.
- **Anyone touching the drift gate:** §11.4 metamorphic test pins the gate
  at >= 0.3 and probes 0.1 / 0.3 / 0.5. Moving the threshold requires
  updating that test in lockstep.

#### Alternatives Considered

- **Run real Copilot CLI sessions in CI:** rejected — too slow, too flaky,
  and would obscure regressions in the loop logic itself behind model noise.
- **Add fast-check for property tests:** rejected for now — current
  invariants are simple enough that an LCG suffices, and the dependency
  cost outweighs the marginal coverage gain.
- **Snapshot the applier output:** rejected — snapshots would lock in
  *artifacts* (hint text, counts) rather than *processes*. A snapshot would
  fire on every recommendation-string tweak.

---

### 2026-05-02: Promote ExecutionProfile / ProfileGranularity to @akubly/types alongside FeedbackSource

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-05-02
**Type:** Architecture
**Status:** Implemented (Phase 4.5)

#### Context

Spec §9.3 declares `FeedbackSource` as the first new shared type in
`@akubly/types` since Phase 2. The interface signature references
`ExecutionProfile`, `ProfileGranularity`, `OptimizationHint`, and
`StrategyParameters` — types the spec otherwise defines inside
`packages/forge/src/telemetry/` and `packages/forge/src/prescribers/`.

`@akubly/types` cannot depend on `@akubly/forge` (acyclic dependency graph,
ADR-P4-002), so `FeedbackSource` cannot literally use forge-private types.

#### Decision

Two of the four referenced types are now defined in `@akubly/types`:

- `ProfileGranularity` — string union, fully shared.
- `ExecutionProfile` — full structural definition (drift / tokens / outcomes
  blocks). `packages/forge/src/telemetry/types.ts` re-exports them so forge
  code retains a single import path.

The remaining two are defined as **open-shaped** interfaces in `@akubly/types`:

- `OptimizationHint` — required keys (`id`, `source`, `skillId`, `category`,
  `description`) plus `[key: string]: unknown` for prescriber-specific fields.
- `StrategyParameters` — pure `[key: string]: unknown` map.

Concrete prescribers extend these without forcing schema changes in
`@akubly/types`.

#### Rationale

- `ExecutionProfile` is genuinely shared: Cairn's curator and prescribers
  both need to read profiles produced by Forge. Putting it in `@akubly/types`
  matches its actual lifetime as a cross-package contract.
- Open-shaped `OptimizationHint` / `StrategyParameters` honour the
  ADR-P4-005 "minimum shared types" instinct. The required keys are the
  invariant identity (every hint has an id, source, skill, category,
  description); everything else varies by prescriber.
- This avoids two anti-patterns: (1) widening `FeedbackSource` to use
  `unknown` everywhere (kills compile-time safety), and (2) duplicating the
  hint/strategy schemas across packages (kills the contract).

#### Impact

- `packages/types/src/index.ts` — +5 exports (`ProfileGranularity`,
  `ExecutionProfile`, `OptimizationHint`, `StrategyParameters`,
  `FeedbackSource`). No removals, no breaking changes.
- Forge's `telemetry/types.ts` re-exports `ProfileGranularity` and
  `ExecutionProfile` so `import { ExecutionProfile } from "../telemetry/types.js"` keeps working.
- Tests: 826 baseline → 954 passing (forge 476 + cairn 478). Telemetry
  module contributes 56 of the new tests.

#### Follow-ups for the team

1. **Spec event-type mismatch (for Graham / wiring task):** spec §9.4 names
   `tool_call_started`, `usage_reported`, `turn_completed`,
   `session_completed`, `tool_call_failed`. The bridge `EVENT_MAP` uses
   `tool_use`, `model_call`, `turn_end`, `session_end`. The collectors are
   coded to the spec strings; wiring will need either a remapper at the
   collector boundary or an `EVENT_MAP` extension.
2. **Convergence formula (for Graham):** `convergedTurn / turnCount` is
   degenerate at typical session shapes (always 1.0 when `session_completed`
   arrives last). Worth a redesign before Phase 5 — perhaps
   `convergedTurn / expectedTurns` against a per-skill expected-turns
   parameter from `StrategyParameters`.

---

### 2026-05-02: Phase 4.5 Prescribers + Applier — Determinism Mechanisms

**Author:** Princess Rosella (Plugin Dev)
**Date:** 2026-05-02
**Type:** Architecture / Implementation
**Status:** Implemented (S1–S8)

#### Context

The Phase 4.5 spec (§3–§4) prescribes the prescriber → applier pipeline and
states the ordering rule "Determinism > Token Cost (Aaron's constraint)" as
prose. While implementing, I had to choose how strongly to encode that
constraint. Two options:

1. **Soft prioritization** — token optimizer always runs, but its hints carry
   lower impact scores than prompt-optimizer hints.
2. **Hard gate** — token optimizer returns an empty hint set entirely when
   drift is RED, regardless of cache/cost signals.

#### Decision

I chose **(2) hard gate**, exposed as ``TokenOptimizerConfig.driftGate``
(default ``0.3``). ``analyzeTokenOptimizations`` exits early with no hints when
``profile.drift.mean >= driftGate``. This matches the spec text at line 933
("Guard: Don't optimize tokens if drift is RED — fix determinism first") and
makes the constraint structurally enforced rather than score-balancing
dependent.

I also made the **applier order-stable**: sort key is
``(impactScore desc, id asc)``. Without the id tiebreaker, two hints with
identical impact scores could swap positions across runs depending on input
order, breaking SKILL.md compilation reproducibility.

#### Other team-relevant choices

- ``DEFAULT_STRATEGY_PARAMS`` is ``Object.freeze``-d. Cross-package consumers
  (Cairn, runtime, future loop-driver) cannot mutate it accidentally.
- ``EXPLORATION_FLOOR = 0.15`` is a module constant, not a config knob.
  Aaron's directive ("diminishing returns worth it when scaled across future
  of software engineering") means this is policy, not preference.
- ``ApplierConfig.now: () => Date`` is injectable for deterministic tests of
  ``frontmatterPatch.optimizationHints[].appliedAt``. The export pipeline can
  use this to thread its own clock if it ever needs to backdate patches.
- ``cacheableTools`` extraction reads from ``evidence.triggerMetrics`` keys
  prefixed with ``tool:`` and an optional ``evidence.cacheableTools`` array.
  Forward-compatible with telemetry adding tool-level signals — Roger and I
  should align on which path becomes canonical when the loop-driver lands.

#### Implications

- **Cairn / loop-driver:** When feeding hints back through the loop, expect
  zero token-optimization hints during RED drift periods — this is by design,
  not a bug. Test fixtures should not assume token hints are always present.
- **Export pipeline (Phase 4):** ``SkillFrontmatterPatch`` is the contract
  between applier and ``attachStage``. Adding new patch fields requires
  coordinated changes here.
- **Telemetry team (Roger):** ``ExecutionProfile`` shape is now relied upon
  by both telemetry and prescribers. Changes to drift/tokens/outcomes nesting
  will ripple into 27 prescriber tests.

#### Verification

- ``npm run build --workspace=@akubly/forge`` passes.
- 27 new tests in ``packages/forge/src/__tests__/prescribers-applier.test.ts``
  all pass (mechanism × determinism × metamorphic).
- 475/476 forge tests pass overall. The one unrelated failure
  (``telemetry-collectors.test.ts > classifies ... as GREEN``) is in
  Roger's collectors module and predates my work.
Forge is the development tool (human in loop). Cairn is autonomous (Curator decides). Shared analysis logic, two trigger paths.

#### ADR-P4.5-007: Determinism > Token Cost ordering
All prescriber priority, drift weights, and optimization ordering enforces determinism first. Token optimizer gates on drift level — won't prescribe if drift is RED. This is Aaron's design constraint, not a decision.

**Impact:**
- **New files:** `packages/forge/src/telemetry/` (6 files), `packages/forge/src/prescribers/` (4 files), `packages/forge/src/applier/` (3 files), `packages/cairn/src/db/migrations/011-telemetry-feedback.ts`, 3 new CRUD modules
- **Modified files:** `packages/cairn/src/db/schema.ts`, `packages/forge/src/index.ts`, `packages/types/src/index.ts` (FeedbackSource)
- **Estimated LOC:** ~1200 production + ~600-800 tests
- **Estimated tests:** 61-80

**Specification:**
- Full spec: `docs/forge-phase4.5-spec.md`
- Roadmap (4.6/5): `docs/forge-phase5-roadmap.md`
  title: 'List Prescriptions',
  description:
    'List improvement suggestions the Prescriber has generated from detected patterns. ' +
    'Filter by lifecycle status or see all. Each result includes confidence level in plain ' +
    'language and a hint about pending suggestions worth reviewing. ' +
    'Use this after completing a task to check for improvement opportunities.',
  inputSchema: {
    status: z.enum([
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    ]).optional()
      .describe('Filter by lifecycle status. Omit to return all statuses.'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results to return (default 10).'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `get_prescription`

```typescript
server.registerTool('get_prescription', {
  title: 'Get Prescription',
  description:
    'Get full detail about a specific improvement suggestion, including the pattern ' +
    'that triggered it, what Cairn observed, the suggested change, where it would be ' +
    'applied, and a diff preview. Use this to understand a suggestion before deciding.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription ID to retrieve.'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `resolve_prescription`

```typescript
server.registerTool('resolve_prescription', {
  title: 'Resolve Prescription',
  description:
    'Act on an improvement suggestion: accept (applies the change), reject (dismisses ' +
    'permanently), or defer (revisit later). Rejection is the simplest action — no reason ' +
    'required. Acceptance applies the change to a sidecar instruction file. ' +
    'Deferral sets a cooldown before the suggestion resurfaces.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription to act on.'),
    disposition: z.enum(['accept', 'reject', 'defer'])
      .describe('How to resolve: accept (apply change), reject (dismiss), defer (revisit later).'),
    reason: z.string().optional()
      .describe('Optional reason for rejection or deferral. Helps Cairn learn preferences.'),
  },
  annotations: { readOnlyHint: false },
}, handler);
```

#### New Tool: `show_growth`

```typescript
server.registerTool('show_growth', {
  title: 'Show Growth',
  description:
    'See a summary of patterns Cairn has helped resolve and overall improvement trends. ' +
    'Leads with wins — shows resolved patterns first, then active ones. ' +
    'Uses natural language, not percentages. Use this to reflect on progress.',
  annotations: { readOnlyHint: true },
}, handler);
```

#### Modified Tool: `run_curate` (DP1)

Updated description:
```typescript
description:
  'Trigger the curator to process unprocessed events and discover patterns. ' +
  'The curator scans the event stream for recurring errors, error sequences, ' +
  'and skip frequency, then creates or reinforces insights with prescriptions. ' +
  'Also generates new improvement suggestions when insights are created or reinforced. ' +
  'Returns the number of events processed, insights discovered, and any new suggestions. ' +
  'Use this when you want fresh analysis of recent activity.',
```

---

## Dependency Graph

```
7A ─────────────────────────────────────────────────┐
│                                                    │
├──→ 7B (Artifact Discovery) ──┬──→ 7D (Prescription Engine) ──┐
│                               │                                │
├──→ 7C (Infrastructure) ──────┤──→ 7E (Apply Engine) ──────────┤
│                               │                                │
└───────────────────────────────┘               7F (MCP + UX) ◄─┘
```

- **7A** has no dependencies (foundation)
- **7B, 7C** depend only on 7A (can run in parallel)
- **7D, 7E** depend on 7A + 7B (can run in parallel after 7B)
- **7F** depends on 7C + 7D + 7E (final integration phase)

**Critical path:** 7A → 7B → 7D → 7F  
**Parallel opportunities:** 7B ∥ 7C, then 7D ∥ 7E

---

## Execution Schedule

| Phase | Owner | Depends On | Parallel With | Est. New Tests |
|-------|-------|------------|---------------|----------------|
| 7A | Roger | — | — | ~25 |
| 7B | Rosella | 7A | 7C | ~20 |
| 7C | Gabriel | 7A | 7B | ~10 |
| 7D | Roger | 7A, 7B | 7E | ~25 |
| 7E | Rosella | 7A, 7B | 7D | ~15 |
| 7F | Roger + Valanice | 7C, 7D, 7E | — | ~20 |
| **Total** | | | | **~115** |

**Final test count target:** ~250 (134 existing + ~115 new)

---

## Acceptance Criteria

The Prescriber is complete when:

1. ✅ `run_curate` chains `prescribe()` automatically when insights change
2. ✅ `preToolUse` chains `prescribe()` at session start when insights change
3. ✅ `curate()` respects 3-second time budget
4. ✅ 8-state lifecycle enforced in DB and code
5. ✅ 4 new MCP tools registered and functional
6. ✅ Full 4-phase artifact scanner with 5-minute SQLite cache
7. ✅ All 10 UX principles verifiable in tool output
8. ✅ Sidecar instruction files written (not user-owned files modified)
9. ✅ managed_artifacts tracks all Prescriber-written files
10. ✅ Rollback capability functional
11. ✅ Drift detection via checksum comparison
12. ✅ 7 preference keys configurable
13. ✅ Deferral cooldown (3 sessions default)
14. ✅ Auto-suppression after 3 deferrals
15. ✅ Growth tracking via `show_growth`
16. ✅ All existing 134 tests still pass
17. ✅ ~115 new tests pass
18. ✅ Clean build, clean lint
19. ✅ Dogfooded: Aaron has accepted ≥1 real prescription


---

## Phase 7D Decisions — Roger

### recencyWeight Capped at 1.0

The spec formula Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15)) produces values >1.0 when sessionsAgo < 5. Added Math.min(1.0, ...) to match the spec description "1.0 within 5 sessions, decays to 0.5 by 20 sessions."

**Impact:** Priority scores are bounded [0, 1.0] as expected. No bonus for very recent insights.

### Event Logging is Fail-Soft

logEvent() requires a FK-valid session ID. The prescriber looks up the most recent active session from the DB. If none exists (e.g., during sessionStart before the new session is created), event logging is silently skipped.

**Rationale:** Prescriber runs in two contexts: (1) sessionStart (before new session exists) and (2) MCP run_curate (session may exist). Logging is informational, not critical. Fail-soft is consistent with the project's fail-open philosophy.

**Impact:** Phase 7F tools that read prescription events should be aware that some prescription_generated events may be missing for prescriptions generated during session startup.

### shouldResurface Compensates for Session Counter Timing

incrementSessionCounter() runs AFTER prescribe() in sessionStart.ts. The shouldResurface() function uses currentSession + 1 >= deferUntilSession to compensate, so deferral cooldowns are honored correctly.

**Impact:** Deferral cooldowns are accurate. Phase 7F should use the same shouldResurface() function if needed.

### Rejected Prescriptions Block Re-Prescription

'rejected' is added to the set of statuses that prevent generating a new prescription from the same insight. An insight with a rejected prescription won't be re-prescribed until the rejected prescription is manually expired or the insight itself changes.

**Rationale:** Rejected is terminal per the spec. Without this, rejected insights would get re-prescribed on every prescribe() run, spamming the user.

**Impact:** If a user rejects a prescription but later wants to reconsider, they'll need to explicitly re-enable (possibly via unsuppress or manual expiration in Phase 7F).

### checkAutoSuppress Exported for Phase 7F

The auto-suppression check (deferCount >= threshold → suppress) is exported as checkAutoSuppress(prescriptionId, deferCount). Phase 7F's resolve_prescription MCP tool should call this after each deferral.

**Impact:** Phase 7F must call checkAutoSuppress() after deferPrescription() in the defer flow.

---

## Phase 7E Decisions — Rosella

### LIFO Rollback for Multi-Prescription Sidecars

**Context:** managed_artifacts has UNIQUE(path). Multiple prescriptions can append to the same sidecar file, but only one row can exist per path.

**Decision:** When appending, remove the old managed_artifact row and re-track with the latest prescription's ID. Rollback only supports the latest writer (LIFO). Rolling back a middle prescription in a multi-append stack is not supported in this phase.

**Rationale:** The existing schema supports this cleanly. Full multi-level undo would require a separate history table — overkill for Phase 7E scope. If needed later, we add a managed_artifact_history table.

### File-Based Drift Detection

**Context:** The DAL's detectDrift() compares original_checksum vs current_checksum in the DB only — it doesn't read disk.

**Decision:** checkDrift() in applier.ts reads the actual file, computes SHA-256, and compares to stored current_checksum. This is the on-disk drift check. The DAL function is for DB-internal consistency.

**Rationale:** Users need to know if someone hand-edited the sidecar file. That requires a disk read, not a DB lookup.

### Apply Blocks on Drift

**Context:** Should pplyPrescription proceed if the sidecar has drifted since last write?

**Decision:** Block with error. The user must resolve drift before new content is applied.

**Rationale:** Silently overwriting user edits violates the "safe defaults" principle from DP6. The user should explicitly acknowledge changes before Cairn writes again.

---

## Phase 8D — Skill Test Harness

### 2026-04-30: Phase 3 Architecture — ForgeClient & SDK Abstraction (Graham)

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Active

# Graham — Phase 3 Architecture Decisions

**Date:** 2026-04-30  
**Author:** Graham Knight (Lead / Architect)  
**Context:** Phase 3 architecture specification for `@akubly/forge` — live SDK integration

---

## ADR-P3-001: ForgeClient wraps CopilotClient 1:1

**Decision:** Each ForgeClient owns exactly one CopilotClient. No shared instances.

**Alternatives:**
1. Shared client singleton — lifecycle confusion, race conditions on concurrent session creation.
2. No wrapper / expose CopilotClient directly — breaks "SDK types don't leak" contract.
3. **1:1 wrapper (chosen)** — clear ownership, deterministic cleanup.

**Trade-off:** Slightly more memory if multiple ForgeClients exist. Clear lifecycle wins.

---

## ADR-P3-002: EventSource interface over direct CopilotSession coupling

**Decision:** `attachBridge()` and `createTokenTracker()` accept `EventSource { on(handler): () => void }` rather than `CopilotSession`.

**Alternatives:**
1. Accept CopilotSession directly — simpler types, but couples to SDK and complicates testing.
2. **EventSource interface (chosen)** — enables mock event sources, keeps Phase 2 bridge SDK-free.

**Trade-off:** One extra interface definition for massive test simplification.

---

## ADR-P3-003: ModelCatalog uses injection over ForgeClient reference

**Decision:** `createModelCatalog()` takes a `listFn: () => Promise<ModelSnapshot[]>` rather than a ForgeClient reference.

**Alternatives:**
1. Pass ForgeClient — simpler call site, untestable without live client.
2. **Injection (chosen)** — testable with static array, matches Phase 2 pattern.

**Trade-off:** Caller wires one line of glue for full testability.

---

## ADR-P3-004: No new shared types in @akubly/types

**Decision:** Phase 3 types (ForgeClientOptions, ForgeSessionConfig, TokenBudget, ModelCatalog) stay Forge-internal.

**Rationale:** Cairn consumes CairnBridgeEvent, not TokenBudget. Types graduate to shared only when two packages actually import them.

**Trade-off:** If Cairn needs TokenBudget later, one PR to migrate. Smaller shared surface now.

---

## ADR-P3-005: Dual event paths — onEvent for setup, attachBridge for runtime

**Decision:** Use SessionConfig.onEvent for events during createSession(), attachBridge() after session exists. No dedup needed.

**Rationale:** SDK guarantees non-overlapping windows. Matches spike pattern.

**Trade-off:** Relies on SDK behavior guarantee. Low risk.

---

## ADR-P3-006: Strategies as plain functions, not class hierarchy

**Decision:** ModelStrategy is a function type. Built-in strategies are a Record<string, ModelStrategy>.

**Alternatives:**
1. Strategy class hierarchy — overkill for 3 strategies, adds constructor ceremony.
2. **Function type (chosen)** — easy to test, compose, override.

**Trade-off:** No runtime type-checking of strategy names. Acceptable for developer-facing API.


---

### 2026-04-29: Phase 3 Test Strategy — Inline Contract Testing (Laura)

**Author:** Laura (Tester)  
**Type:** Testing  
**Status:** Active

# Laura — Phase 3 Test Strategy: Inline Contract Testing

**Author:** Laura (Tester)
**Type:** Test Strategy
**Status:** Proposed
**Date:** 2026-04-29

## Decision

Phase 3 test contracts use **inline implementations** of the expected API surface (ForgeClient, ForgeSession, ModelCatalog, ModelSwitcher, TokenBudgetTracker) rather than importing from non-existent modules. Each inline class defines the behavioral contract. When Alexander builds the production modules, tests switch imports — any divergence breaks tests immediately.

## Rationale

1. **TDD red-phase compatibility:** Tests must be runnable NOW, before production code exists. Importing from `../runtime/index.js` would produce compile errors.
2. **Contract precision:** Inline implementations encode expected behavior (e.g., "disconnect is idempotent", "bridge events are returned as copies") that pure type signatures cannot express.
3. **Proven pattern:** Phase 2 used the same approach (inline bridge/hooks) and the migration to production imports was smooth — documented in history.md.

## Migration Path

When production modules are built:
1. Delete inline class definitions from test files
2. Replace TODO import comments with real imports
3. Run tests — failures reveal behavioral divergence
4. Resolve divergence (fix production code or update contract if intentional)

## Mock SDK Extensions

Extended `helpers/mock-sdk.ts` for Phase 3 needs:
- **MockCopilotSession:** Added `setModel`, typed event handler map, unsubscribe returns
- **MockCopilotClient:** Added `resumeSession`, `listModels`, `listSessions`, `getAuthStatus`, `getStatus`
- **makeModelInfo:** Shared factory for constructing valid `ModelInfo` objects

These extensions are backward-compatible — existing Phase 2 tests continue to pass unchanged.

## Test Coverage Summary

| Module | Tests | Key Behaviors |
|--------|-------|---------------|
| runtime.test.ts | 35 | Session lifecycle, bridge wiring, hook composition, decision gates, disconnect semantics |
| models.test.ts | 52 | Model catalog CRUD, snapshot extraction, mid-session switching, token budget tracking, selection strategies |

## Risks

- Inline implementations may drift from what Alexander builds. Mitigation: clear TODO markers and documented migration path.
- Mock SDK extensions add maintenance surface. Mitigation: centralized in helpers/, barrel-exported.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Runtime (Alexander)

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

Addressed 7 persona review findings for `packages/forge/src/runtime/`. 6 accepted with fixes, 1 partially rejected (spec-vs-implementation gap with no test contracts).

## Key Decisions

**Spec Surface Gap — Partial Reject (F2)**

Rejected: `listModels`, `listSessions`, `getAuthStatus`, `getStatus` — these are in the architecture spec but have no test contracts and no consumers. They can be added when a consumer needs them.

Accepted from same finding: `onEvent` bridge for pre-session events and `model_change` tracking — these are correctness concerns with spec backing.

**Session Map Lifecycle (F6)**

Added `onDisconnect` callback pattern: ForgeClient passes a cleanup callback when creating ForgeSession. On disconnect, the session auto-removes itself from the client's tracking map. This means `sessionCount` stays accurate without manual cleanup.

**decisionGate Removed from Config (F5)**

`decisionGate` predicate was defined in `ForgeSessionConfig` but never wired. Decision gating is already handled through the observer pattern (`HookObserver.onPreToolUse`). Removed to avoid misleading API surface.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F1 | stop() error isolation | Added try/catch per session; errors logged separately |
| F3 | onEvent bridge missing | Wired pre-session event bridge (ADR-P3-005) |
| F4 | model_change tracking | Integrated into ModelChangeRecord[], persisted in events |
| F5 | decisionGate config field | Removed (not wired; gating handled by HookObserver) |
| F6 | Bridge handler guards | Added _disconnected guard + try/catch wrapper |
| F7 | Session map lifecycle | Added onDisconnect callback; auto-removal on disconnect |

## Files Changed

- `packages/forge/src/runtime/client.ts`
- `packages/forge/src/runtime/session.ts`

## Test Impact

All 268 tests pass. Zero regressions.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Models (Roger)

**Author:** Roger (Platform Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

9 persona reviewers surfaced 5 findings against the models/ module. Triaged as:
- **4 accepted and fixed** (F2–F5)
- **1 rejected** (F1)

## Key Decisions

**Rejected: F1 — sort() Mutates Input Array**

The Architect flagged `sort()` in `cheapest`/`smartest` strategies as mutating the input `models` array. This is a false positive: `filter()` already returns a new array, so `sort()` only mutates the filtered copy. No caller's data is affected.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F2 | readonly bypass on TokenBudget.contextWindow | Introduced MutableContextWindow internal type; external API stays readonly |
| F3 | Dual EventSource subscriptions | Merged into single source.on() handler with if/else on event.type |
| F4 | Test field drift (reasoningEffort vs newReasoningEffort) | Updated test's ModelChangeRecord, makeModelChangeEvent, and assertions |
| F5 | Division by zero in budgetAware | Added guard: `if (context.budgetLimitNanoAiu <= 0) return cheapest(...)` |

## Files Changed

- `packages/forge/src/models/strategy.ts`
- `packages/forge/src/models/token-budget.ts`
- `packages/forge/src/__tests__/models.test.ts`

## Test Impact

- `npm run build` — clean
- `npx vitest run` — 268/268 tests pass



### 2026-05-01: Telemetry Collector ↔ Bridge Event-Name Contract

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Contract + Telemetry  
**Status:** Implemented

Context: Persona review F4 caught that telemetry collectors checked for event type strings that never appear in the bridge's EVENT_MAP. Bridge maps SDK events to different vocabulary (	ool_use vs 	ool_call_started, etc.). Result: collectors silently received nothing in production.

**Key Decisions:**

#### ADR-TLM-001: Single source of truth for collector event interest
New exported COLLECTOR_BRIDGE_EVENTS const in packages/forge/src/telemetry/collectors.ts names every Cairn event type collectors react to.

#### ADR-TLM-002: Contract test enforces bridge alignment
New test packages/forge/src/__tests__/telemetry-bridge-contract.test.ts enumerates COLLECTOR_BRIDGE_EVENTS and asserts every value is in EVENT_MAP. CI fails fast if either side drifts.

#### ADR-TLM-003: F2 early-convergence semantics
convergedTurn set on FIRST occurrence of successful 	ool_result or plan_changed event. If neither fires, convergence stays at 1.0 (legitimate "no early progress" rather than phantom 0.30 floor).

#### ADR-TLM-004: F5 streaming quantiles via histogram sketch
Stored as optional drift.sketch on ExecutionProfile; backward compatible.

#### ADR-TLM-005: F6a per-signal means
New optional signals field on ExecutionProfile carries individual means for convergence, 	okenPressure, 	oolEntropy, contextBloat, promptStability.

**Impact:**
- Bridge owners: if you remove/rename a value in COLLECTOR_BRIDGE_EVENTS, contract test fails.
- Prescriber authors: ExecutionProfile.signals populated; targeting specific signals now mechanical.
- Persisted-profile readers: drift.sketch and signals optional; old rows keep working.
- Sink consumers: LocalDBOMSink now exposes droppedCount.

---

### 2026-05-01: Persona Review Fixes — Prescribers + Applier (F3, F6b, F9, F10)

**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-01  
**Type:** Implementation  
**Status:** Implemented

Four findings from Phase 4.5 persona review.

**Key Decisions:**

#### ADR-PSC-001: tuneParameters gains context argument
Third arg context: TuneContext carries udgetLimitNanoAiu. Defaults to DEFAULT_BUDGET_LIMIT_NANO_AIU = 1_000_000 so existing call-sites don't break. 	okenPressure normalized to [0,1] against this limit.

#### ADR-PSC-002: Prescribers consume signal-level entropy
Prescribers use profile.signals.toolEntropy (Roger's new field) for tool-guidance trigger, with fallback to drift.p95 for legacy profiles. Composite drift never masquerades as single-signal threshold.

#### ADR-PSC-003: Shared buildSnapshot utility
uildSnapshot lives in packages/forge/src/prescribers/utils.ts, sources driftLevel from classifyDriftLevel(). Single source of truth for GREEN/YELLOW/RED boundaries.

#### ADR-PSC-004: Adaptive exploration budget
GREEN → * 0.9 (decay), RED → * 1.1 (grow), YELLOW → hold. Hard floor EXPLORATION_FLOOR = 0.15, ceiling 1.0.

**Cross-team implications:**
- Roger: Aggregator writes profile.signals from metadata.signals on drift samples.
- 	uneParameters third arg optional; no caller updates required.
- Pre-existing gap: packages/forge/src/telemetry/collectors.ts missing on disk; 15 tests fail (outside this scope).

**Verification:** prescribers-applier.test.ts 36/36 pass (+8 new tests). Forge suite 514/529; 15 failures pre-date this work.

---

### 2026-05-02: Phase 4.5 Persona Review — All 11 Findings Fixed

**Author:** Scribe (Session Log)  
**Date:** 2026-05-02  
**Type:** Meta  
**Status:** Complete

Phase 4.5 persona review findings consolidated and resolved across three team members:

- **Roger (Platform Dev):** F1 (weighted means), F2 (convergence), F4 (contract), F5 (sketch), F6a (signals), F7 (sink warn), F11 (typeof). +24 tests → 534 Forge tests.
- **Rosella (Plugin Dev):** F3 (budgetContext), F6b (prescriber entropy), F9 (buildSnapshot), F10 (adaptive budget). +8 tests → 478 Cairn tests.
- **Alexander (SDK Dev):** F8 (granularityKey in FeedbackSource).

**Result:** 1,012 total tests passing (Forge 534 + Cairn 478), up from 990 pre-review. Build clean. All persona review findings hardened and deployed.

---

# Phase 4.6 — Cycle 1 Triage (Code Panel Findings)

**Lead:** Graham (Architect)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Trigger:** 15-finding Code Panel review, Aaron selected squad-mode autonomous triage.

---

## Architectural Decisions

### ADR-P4.6-004: Edit migration 012 in place (Finding #4)

**Decision:** Edit migration 012 to add `UNIQUE(hint_id)` — do NOT create migration 013.

**Rationale:** Migration immutability is a *production safety* convention. Phase 4.6 lives
on a feature branch with no production data and no downstream consumers of the migration
sequence. Adding a 013 that only exists to patch a 012 that never shipped creates dead
weight in the migration history. The sweep should also switch to `INSERT OR IGNORE` to
rely on the constraint rather than the read-check-then-write pattern.

**Trade-off named:** If another branch concurrently builds on migration 012, this edit
creates a merge conflict. Risk is low — Phase 4.6 is the only active consumer.

**Alternative rejected:** Migration 013 (immutability convention). Convention exists to
protect deployed schemas; pre-ship, it's ceremony without safety benefit.

---

### ADR-P4.6-005: Mirror ChangeVectorSummary with regression test (Finding #7)

**Decision:** Do NOT promote `ChangeVectorSummary` to `@akubly/types`. Mirror the type
in both packages and add a regression test that asserts structural compatibility.

**Rationale:** Same pattern as ADR-P4.6-003 (drift weight mirroring). `OptimizationCategory`
is a prescriber-internal concept — promoting it to the shared types package couples that
package to prescriber domain semantics. The regression test (Laura's L5 suite) already
validates shape; extend it to assert that all category values returned by
`summarizeChangeVectors` are valid `OptimizationCategory` members.

**Cost lands in:** Phase 4.6 (test addition). Promotion to `@akubly/types` deferred to
Phase 5 if a third consumer emerges.

**Trade-off named:** Duck-typing can drift silently between releases if the regression test
is skipped. Mitigation: test runs in CI on every PR.

**Alternative rejected:** Promote to `@akubly/types` now — premature coupling for a
single cross-package consumer.

---

### ADR-P4.6-006: Ship primitives only; defer runtime wiring (Finding #9)

**Decision:** Ship Phase 4.6 as "primitives only." The Curator sweep, CRUD layer,
`computeNetImpact`, `summarizeChangeVectors`, and prescriber ranking integration are
independently testable and correct. Runtime wiring (connecting Curator output to
prescriber input in the live loop) is deferred to a tracked follow-up issue.

**Rationale:** Phase 4.6 scope was always the computation and ranking primitives.
Wiring requires runtime orchestration changes (Curator → prescriber pipeline in the
session lifecycle) that expand scope, risk, and review surface significantly. The
primitives are the hard part; wiring is mechanical once the contract is stable.

**Trade-off named:** Phase 4.6 code is dormant at runtime until wiring lands. Tests
prove correctness, but no production validation until the follow-up ships.

**Follow-up issue:**
- **Title:** `Wire Curator change vectors to prescriber historicalVectors at runtime`
- **Body:** Phase 4.6 (ADR-P4.6-006) shipped computation primitives and prescriber
  ranking support, but no production caller passes `historicalVectors` to
  `analyzePromptOptimizations` / `analyzeTokenOptimizations`. The Curator sweep
  computes vectors and `summarizeChangeVectors` aggregates them, but nothing in the
  runtime session lifecycle queries summaries and feeds them to prescribers.
  Scope: add the orchestration glue in the Curator's periodic sweep or a new
  runtime hook that queries summaries and passes them to prescriber invocations.
  Depends on: Phase 4.6 merged.

---

## Per-Finding Triage

| # | Sev | Disposition | Fix Agent | Notes |
|---|-----|------------|-----------|-------|
| 1 | 🔴 | **ACCEPT** | Rosella | `deltaCost` uses cumulative `token_total_cost` (monotonic). Normalize to per-session cost before computing delta. Curator.ts is Alexander's code → Rosella fixes per lockout. |
| 2 | 🟡 | **ACCEPT** | Alexander (utils.ts) + Rosella (changeVectors.ts) | Confidence cliff: `vectorCount=1, minVectors=3` → boost 0.5, which *halves* confidence. Contradicts Wave 1 "positive boost only" policy. Fix: clamp to `Math.max(1.0, log(…)/log(…))` so vectors only amplify, never attenuate. Split across packages per lockout. |
| 3 | 🟡 | **ACCEPT** | Rosella | `sessionsObserved` stores cumulative `session_count` but migration comment says "between before/after." The proxy was a deliberate decision (see decisions.md §Sessions-Observed Proxy), but column docs are misleading. Fix: update column comment in migration 012 (being edited per ADR-P4.6-004 anyway) to say "cumulative session count at vector computation time." |
| 4 | 🟡 | **ACCEPT** | Rosella | Add `UNIQUE(hint_id)` to migration 012 per ADR-P4.6-004. Switch sweep to `INSERT OR IGNORE`. Both are Alexander's code → Rosella per lockout. |
| 5 | 🟡 | **ACCEPT** | Alexander | Sort bug: unmatched hints (predictedImpact undefined → 0) outrank matched hints with negative impact. Fix: partition matched/unmatched; sort matched by predictedImpact desc; append unmatched in original impactScore order. Both optimizers are Rosella's → Alexander per lockout. |
| 6 | 🟡 | **ACCEPT** | Rosella | `sweepChangeVectors` returns a single counter conflating 4 skip reasons. Add structured diagnostic: `{ eligible, skippedInsufficientSessions, skippedMalformed, alreadyComputed, computed }`. Curator.ts is Alexander's → Rosella per lockout. |
| 7 | 🟡 | **ACCEPT** | Laura | Per ADR-P4.6-005: add regression test asserting Cairn's `ChangeVectorSummary.category` values are valid `OptimizationCategory` members. Laura owns tests; lockout N/A. |
| 8 | 🟡 | **ACCEPT** | Alexander | `ChangeVectorSummary` missing from `@akubly/forge` root barrel re-export. Add to the prescribers re-export block in `forge/src/index.ts`. Adjacent to Rosella's module → Alexander per lockout. |
| 9 | 🟡 | **DEFER** | — | Per ADR-P4.6-006: ship primitives only. Follow-up issue: "Wire Curator change vectors to prescriber historicalVectors at runtime." |
| 10 | ⚪ | **ACCEPT** | Rosella | `computeNetImpact` inline negations are fragile. Extract named contributions: `const driftContrib = -deltaDrift * weights.deltaDrift;` etc. changeVectors.ts is Alexander's → Rosella per lockout. |
| 11 | ⚪ | **REJECT** | — | ADR-P4.6-002 explicitly chose the optional positional parameter over a config/options object. Finding contradicts an existing architectural decision. If the pattern proves painful at more call sites, revisit in Phase 5. |
| 12 | ⚪ | **DEFER** | — | DB injection style (explicit `db` param vs `getDb()`) is a repo-wide convention question, not Phase 4.6 scope. Follow-up issue: "Standardize DB access pattern: explicit injection vs internal getDb()." |
| 13 | ⚪ | **ACCEPT** | Laura | Describe block says "cross-module weight consistency" but test only validates local `DRIFT_WEIGHTS`. Rename to reflect actual scope; `it.todo` already marks the cross-module aspiration. Laura owns tests; lockout N/A. |
| 14 | ⚪ | **ACCEPT** | Alexander | `computeConfidenceBoost` re-exported publicly from `prescribers/index.ts` but it's an internal helper (Cairn mirrors the formula, can't import). Drop from public re-export. prescribers/index.ts is Rosella's → Alexander per lockout. |
| 15 | ⚪ | **ACCEPT** | Alexander (forge) + Rosella (cairn) | Four sites use `?? 3` for minSessions default. Extract `DEFAULT_MIN_SESSIONS = 3` constant. Rosella defines it in cairn's changeVectors.ts (Alexander's code → lockout). Alexander updates forge's utils.ts + optimizers (Rosella's code → lockout). |

---

## Summary

- **Accepted:** 12 findings
- **Rejected:** 1 (finding #11 — contradicts ADR-P4.6-002)
- **Deferred:** 2 (findings #9 and #12 — follow-up issues)
- **Escalated:** 0

### Agent Dispatch

| Agent | Finding #s | Count |
|-------|-----------|-------|
| Rosella | 1, 2 (changeVectors.ts), 3, 4, 6, 10, 15 (cairn) | 7 |
| Alexander | 2 (utils.ts), 5, 8, 14, 15 (forge) | 5 |
| Laura | 7, 13 | 2 |

### Cycle 2 Concerns

1. **Rosella's load is heavy** (7 items). Findings 1, 3, 4 all touch curator.ts — they
   should be batched in a single pass to avoid merge churn. Finding 4 (migration edit)
   and finding 3 (column comment) are the same file change.
2. **Finding #1 is the only blocker.** Rosella should prioritize it. The deltaCost bug
   produces materially wrong net_impact values that cascade into ranking.
3. **Finding #2 (confidence clamp) touches both packages.** Alexander and Rosella must
   coordinate — the formula change should be identical in both locations.
4. **Finding #15 (constant extraction) is low-risk but cross-package.** Can be done last.

---

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

---

# Decision: MetricSnapshot.sessionCount is optional (not required)

**Author:** Rosella (Plugin Dev)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Context:** Phase 4.6 cycle 2, Finding #1 — deltaCost normalization requires sessionCount in MetricSnapshot.

---

## Decision

`MetricSnapshot.sessionCount` is declared as **optional** (`sessionCount?: number`) rather than required.

## Rationale

1. **Backward compatibility with stored JSON.** `MetricSnapshot` is serialized to `optimization_hints.metric_snapshot` (a JSON column). Hints created before Phase 4.6 cycle 2 will not have `sessionCount` in their stored JSON. Making the field required would silently cause `undefined` at runtime for those rows — worse than a `?? 0` fallback.

2. **Test fixture compatibility.** Laura's test fixtures (`feedback-loop.test.ts`, `prescribers-applier.test.ts`) use inline `metricSnapshot` objects built before this field existed. Making the field required broke the build (2 TS errors). Optional avoids forcing Laura to update fixtures just to unblock the build, while letting her add `sessionCount` values in her cycle-2 test updates naturally.

3. **Safe fallback exists.** `sweepChangeVectors` in curator.ts already handles missing `sessionCount` via `snapshot.sessionCount ?? 0`. When sessionCount is absent, the cost delta falls back to `tokenCostNanoAiu` (raw cumulative, no per-session normalization) — identical to pre-cycle-2 behavior. This is a graceful degradation, not a correctness cliff.

4. **`buildSnapshot()` always populates it.** New hints created after this cycle will always have `sessionCount`, so the fallback only fires for historical data.

## Alternative Rejected

Making `sessionCount: number` required (which was the initial implementation). This caused 2 TypeScript compilation errors in test files owned by Laura. Forcing her to update fixtures just to accommodate my type change violates the "each agent owns their scope" principle and would serialize our parallel work.

## Trade-off

The optional field means the type doesn't enforce the invariant at compile time. Mitigation: `buildSnapshot()` is the only factory for `MetricSnapshot` in production paths, and it always sets `sessionCount`. The `?? 0` fallback is documented in the type JSDoc.


# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Decision filed  
**Related to:** Phase 4.6 Wave 2 — Wiring Curator change vectors → prescriber `historicalVectors`

---

## Problem

Wave 1 ships with two disconnected halves:
- **Producer:** Curator computes `summarizeChangeVectors()` but doesn't expose it to callers
- **Consumer:** Prescribers accept optional `historicalVectors?: ChangeVectorSummary[]` but nothing passes them

**Missing:** An orchestration adapter that queries Cairn and injects vectors into Forge prescriber calls, while respecting "Forge never imports Cairn" acyclic dependency constraint.

---

## Decision: `ChangeVectorProvider` Port + Cairn Adapter

Define a new interface in `@akubly/types`:

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): ChangeVectorSummary[];
}
```

Cairn implements `SqliteChangeVectorProvider: ChangeVectorProvider` with a single method that:
1. Queries change_vectors table by skill_id
2. Aggregates rows into `ChangeVectorSummary` objects
3. Returns the array

Forge receives the provider as an injected dependency. Prescriber call sites invoke `provider.getSummaries(skillId)` and pass the result to `historicalVectors`.

---

## Alternatives Considered

### Option A: Direct DB query in applier/prescriber call site

The caller imports `summarizeChangeVectors` from Cairn and calls it inline.

| Pro | Con |
|-----|-----|
| Simplest. No new abstractions. | **Violates "Forge never imports Cairn" constraint.** Tightly couples. |
| Zero new code. | Cannot unit-test call site without real DB. |

**Verdict:** Ruled out — breaks acyclic dependency.

### Option B: Extend `FeedbackSource` with `getChangeVectorSummaries` method

Couple vectors to the existing feedback interface.

| Pro | Con |
|-----|-----|
| No new interface. | **Conflates two concerns.** Vectors are observations; feedback is input signal. |
| Single dependency injection. | Less composable for Phase 5 (cloud vectors) without touching FeedbackSource. |

**Verdict:** Ruled out — poor separation of concerns.

---

## Why This Option

- **Acyclic dependency:** Respects "Forge never imports Cairn." Provider is abstracted in types.
- **Established pattern:** Mirrors `FeedbackSource` injection pattern already used.
- **Independent evolution:** Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`.
- **Type promotion:** `ChangeVectorSummary` moves from being dual-copied (guarded only by Laura's test) to a single definition in `@akubly/types`.
- **Small contract surface:** One type + one method interface.

---

## Trade-off Named

Slightly more wiring than extending `FeedbackSource` (adding a new interface, new adapter), but the architectural return is worth it: better separation of concerns and independently evolvable subsystems for future phases.

---

## Implementation Ownership

- **@akubly/types:** Alexander defines `ChangeVectorProvider` interface + promotes `ChangeVectorSummary` type
- **Cairn:** Alexander/Roger implement `SqliteChangeVectorProvider` adapter
- **Forge:** Rosella integrates provider injection + updates prescriber call sites
- **Tests:** Laura covers provider contract, prescriber integration with mocked provider


---

# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port + PrescriberOrchestrator Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2

---

## ChangeVectorProvider

**Decision:** Use a `ChangeVectorProvider` interface in `@akubly/types` with a Cairn-side `SqliteChangeVectorProvider` adapter.

**Alternatives considered:**
1. Direct DB query in applier (violates "Forge never imports Cairn")
2. Extend `FeedbackSource` with `getChangeVectorSummaries` method (couples prediction concern to observation concern; less composable for Phase 5 cloud vectors)

**Why this option:**
- Follows the established injection pattern (`FeedbackSource` precedent)
- Respects acyclic dependency constraint
- Independently evolvable — Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`
- `ChangeVectorSummary` type promoted to `@akubly/types` eliminates the dual-copy maintenance burden
- Small contract surface: one type + one single-method interface

## PrescriberOrchestrator

**Decision:** Add a `PrescriberOrchestrator` interface in `@akubly/types`. Forge implements it (wraps both prescribers). Cairn's Curator calls it via injection after the vector sweep.

**Alternatives considered:**
1. Cairn imports Forge prescribers directly (violates acyclic dep constraint)
2. Forge-only manual invocation, defer Cairn-side (contradicts Phase 4.5 spec §ADR-P4.5-006 which designates Cairn as the autonomous trigger path)

**Why this option:**
- The Phase 4.5 spec explicitly designed two trigger paths: manual in Forge, Curator-driven in Cairn. The Curator is the primary production invocation path.
- Prescribers are pure functions in Forge. Cairn needs to call them but can't import Forge. A port resolves this cleanly — same pattern as `FeedbackSource` and `ExportQualityGate`.
- Single-method interface, minimal surface.

## Negative-Impact Attenuation

**Decision:** Implement attenuation in Wave 2 (not defer). When `meanNetImpact < 0`, `confidenceBoost` drops below 1.0 (clamped to ≥ 0.3). Without this, wiring would allow auto-apply of historically harmful prescriptions.

**Trade-off named:** Adds ~5 lines of logic + 4 tests across two packages. Small scope increase for eliminating a known-bad production behavior.

---

# ADR: Wave 2 v3 — Wiring Shape + Scope Split + Safety Gates

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-21  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2 v3 (revision of 2026-05-20 ADR, incorporates duck critique and scope refinement)

---

## ChangeVectorProvider Port

**Decision:** `ChangeVectorProvider` interface in `@akubly/types` with async return type (`Promise<ChangeVectorSummary[]>`). Cairn implements via `SqliteChangeVectorProvider`.

**Reasoning:** Same as v1 (follows FeedbackSource pattern, respects acyclic deps). v3 adds `Promise` return type for Phase 5 readiness — avoids interface churn when cloud providers land.

## Wave 2/3 Split

**Decision:** Wave 2 = data plumbing + manual invocation via top-level composition script. Wave 3 = Curator-driven automatic orchestration.

**Reasoning:** `curate()` is a module-level function in Cairn with no injection points, called from Cairn-only entrypoints (hooks, MCP). Injecting a Forge-implemented orchestrator requires a composition root that imports both packages. No such root exists today. Creating one is a package boundary decision that deserves its own ADR, not a wiring detail buried in Wave 2.

**Trade-off named:** Wave 2 only delivers manual invocation. The autonomous Curator path (primary production trigger per Phase 4.5 spec) is deferred. But the hard parts (type promotion, safety gates, provider adapter) ship in Wave 2; Wave 3 is pure wiring once composition ownership is decided.

## Hint Deduplication

**Decision:** `(skillId, source, category)` dedup key with active-status filter (`pending`, `accepted`, `deferred`). Skip insertion if match exists. No upsert — preserves audit trail.

**Reasoning:** Prescribers generate fresh UUIDs every invocation. Without dedup, repeated runs create unbounded duplicate hints. The existing Cairn prescriber uses `hasActivePrescription(insightId)` for the same purpose. Same pattern, different key.

## Negative-Impact Attenuation

**Decision:** Two-layer defense:
1. Confidence scaling: `confidenceBoost = max(0.1, 1.0 + meanNetImpact)` when mature evidence + negative impact. Sparse evidence: no attenuation (boost stays 1.0).
2. Eligibility flag: `autoApplyEligible = false` when `meanNetImpact < -0.2` and `vectorCount >= minVectors`.

**Reasoning:** Confidence scaling alone with a floor of 0.3 (v2) could still pass permissive auto-apply thresholds. The `autoApplyEligible` flag is defense-in-depth — the applier checks it independently of confidence math. Strongly negative categories cannot auto-apply regardless of threshold configuration.

---

# Archived: 2026-05-24T06:25:04Z
# Squad Decisions

## Active Decisions

### W2-1: ChangeVectorSummary Category Field (Roger)

**Scope:** Type consolidation for shared `ChangeVectorSummary` contract

**Decision:** Use stricter `OptimizationCategory` union (six-value string union from Forge) for `category` field in canonical `@akubly/types` definition.

**Rationale:** Forge already encodes the domain's real category set. Making the union canonical now ensures type safety for W2-2/W2-7 follow-on work while remaining additive (no existing duplicates switched yet).

**Impact:** Both Forge and Cairn gain shared, stricter type contract; future category additions go through Forge's enum.

### W2-7: Category Narrowing at SQLite Boundary (Rosella)

**Scope:** Cairn data layer type safety for ChangeVectorSummary contract

**Decision:** Narrow raw `optimization_hints.category` strings at Cairn's SQLite read boundary instead of widening the shared contract back to `string`.

**Implementation:** `getAllCategories()` filters DB values through the canonical `OptimizationCategory` union from `@akubly/types`. `summarizeChangeVectors()` only accepts narrowed categories. `SqliteChangeVectorProvider.getSummaries()` drops summaries where `vectorCount === 0`.

**Rationale:** DB schema remains permissive for backward compatibility, but cross-package `ChangeVectorSummary` contract is strict. Narrowing once at boundary keeps rest of Cairn aligned with Forge's canonical union without unsafe casts. Zero-vector summaries provide no historical signal and trigger Phase 4.5 fallback mode.

**Impact:** Cairn data layer now type-safe; empty summaries filtered at provider output.

### W2-5: Negative Impact Gate + autoApplyEligible Semantics (Alexander)

**Scope:** Attenuation boundary and hint eligibility signal for negative-impact vectors

**Decision:** Gate boundary is **inclusive** (`<=`) at `-0.2`. Mature negative vectors attenuate and disable auto-apply when `meanNetImpact <= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (value: `-0.2`). A summary at exactly `-0.2` triggers auto-apply disable.

**Rationale:** Safety asymmetry + FP fragility. Inclusive boundary prevents false positives at the exact threshold and provides stronger guard against brittle boundary conditions. Dual-layer testing locks behavior: unit test (alexander-2 maturity-gradient) expects gating at exactly -0.2; E2E canary (laura-1 wave2-pipeline) uses constant directly for drift-proof coverage.

**Implementation:** Gate comparison changed from `<` to `<=` in Forge prescribers and Cairn gate logic. Safety-boundary comment added at comparison site. Maturity-gradient test updated to expect gating at exactly -0.2. E2E pipeline canary uses `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant directly (prevents configuration drift).

**Impact:** Negative-impact gate boundary now locked by dual-layer testing (unit + E2E); Applier receives explicit attenuation signal for hints at and below threshold; safety margin increased. Decided by Aaron 2026-05-22.

### W2-8: Active Status Set for Optimization Hints (Rosella)

**Scope:** Deduplication logic for `(skillId, source, category)` tuples

**Decision:** Use `pending`, `accepted`, and `deferred` as the active statuses for optimization-hint dedup. Terminal statuses (`applied`, `rejected`, `expired`, `suppressed`, `failed`) do not block reinsertion of same semantic recommendation.

**Rationale:** Active set represents hints still live in operator workflow: waiting to be reviewed, explicitly approved but not yet applied, or intentionally postponed. A second hint during those states duplicates work and pollutes category history. Terminal statuses no longer represent live hints, so they should not block fresh inserts—allows operators to retry after rejection or expiration.

**Implementation:** `packages/cairn/src/db/optimizationHints.ts` encodes `ACTIVE_HINT_STATUSES` constant and uses in both `insertHintIfNew()` and `hasActiveOptimizationHint()`.

**Impact:** Deduplication now enforced at Cairn DB layer; Forge applier receives deduplicated hint stream; zero-vector summaries filtered at provider boundary.

### W2-9: Manual CLI Surface Location (Roger)

**Scope:** Composition root for Wave 2 manual orchestration

**Decision:** Created new `packages/runtime-cli/` workspace package with bin entry `forge-prescribe`. This package is the explicit composition root that can legally import both `@akubly/cairn` and `@akubly/forge`.

**Rationale:** Repo already exposes binaries from package-level `bin` entries (e.g., `@akubly/cairn`). Wave 2 needs composition root without creating package cycles. `packages/runtime-cli` keeps boundary honest and buildable. Local invocation: `npx forge-prescribe --skill <id> [--db <path>]`.

**Implementation Details:**
- Per-skill → global profile fallback: Try canonical `(granularity='per-skill', granularity_key='global')` first, then fall back to `global/global`
- Exit codes: `0` on success (including zero hints or dedup skips), `1` when no profile found, `2` for arg/DB/persistence errors
- CLI tests: 4 passing (happy path, no-profile, empty result, mixed)

**Impact:** Wave 2 has manual trigger surface independent of Curator. Wave 3 will migrate to Curator-driven automatic orchestration. Package boundary preserved for future Phase 5 cloud wiring.

### W2-6: E2E Pipeline Test Location + Spec Ambiguity Note (Laura)

**Scope:** Integration test placement and discovered spec mismatch

**Decision:** Placed Wave 2 end-to-end pipeline test in `packages/forge/src/__tests__/wave2-pipeline.test.ts`. Forge is focal point because `runForgePrescribers()` is consumer ingesting Cairn summaries and emitting final hints applier sees.

**Spec Ambiguity Discovered:** `docs/forge-phase4.6-wave2-scope.md` §6.1 says `meanNetImpact = -0.2` should yield `autoApplyEligible = false`, but live Forge/Cairn logic and Alexander's W2-5 tests treat boundary as still eligible (`meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE`). Test kept aligned with implementation + §4.5 semantics. **Action item:** Reconcile boundary explicitly in Wave 3 (pending ADR).

**Rationale:** Forge already hosts substantive integration coverage under `packages/forge/src/__tests__/`. New test stays with existing cross-module surface instead of one-off harness. To avoid production dependency from Forge to Cairn, test imports Cairn source directly and Forge's `tsconfig.json` excludes test files from package build.

**Test Coverage:** Full maturity gradient (0 vectors → mature catastrophic), dedup regression on repeated persistence, provider omission, fail-open behavior, shared `ChangeVectorSummary` contract flow.

**Impact:** Real SQLite path fully validated; attenuation + `autoApplyEligible` propagation verified end-to-end; provider fail-open semantics confirmed.

### W3-D1: Composition Root → R2 (`@akubly/skillsmith-runtime`)

**Scope:** Where should the runtime that imports both `@akubly/cairn` and `@akubly/forge` live?

**Decision:** Adopt R2 — new `@akubly/skillsmith-runtime` library package (composition layer importing both) plus thin `@akubly/runtime-cli` wrapper.

**Rationale:** Clean separation of concerns, best test isolation, zero build-order risks, Phase 5-portable. Roger and Alexander independently converged on this architecture.

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Unblocks all Wave 3 work items

### W3-D2: Package Name → `@akubly/skillsmith-runtime`

**Scope:** What name for the new composition library package?

**Decision:** Use `@akubly/skillsmith-runtime` (domain-specific, not generic `@akubly/runtime`).

**Rationale:** Domain-specific naming (a) fits the cairn/forge metaphor, (b) describes what operates on (skills), (c) leaves room for future additions (scheduler, dashboard, policy engine).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Naming locked; packaging can proceed

### W3-D3: MCP Tool Exposure → Dropped from Wave 3

**Scope:** Should Wave 3 include an MCP tool for manual prescriber invocation?

**Decision:** No — Wave 3 ships with no MCP tool exposure. Curator hook is autonomous surface; CLI is manual surface.

**Rationale:** Proposed `run_prescriber_optimization` tool offers no net-new capability over existing CLI. Defer to later wave when concrete operator need surfaces. Removes W3-6, W3-7, ~2 MCP scenarios from W3-9 (~7 items, ~18 tests).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Wave 3 scope reduced; MCP tool re-opens only when operator need materializes

### W3-D4: Curator Hook Invocation → Always-On

**Scope:** Should Curator automatically invoke prescriber orchestration in v1?

**Decision:** Yes — automatic invocation always enabled. No opt-in flag in v1.

**Rationale:** Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) are sufficient. Opt-in flag adds config without meaningful safety benefit.

**Status:** Accepted by Aaron 2026-05-22

**Locked Design:** Hint persistence stays in orchestrator; fail-open codified; profile selection trigger-driven only (global fallback deferred to Wave 4).

**Impact:** Unlocks automatic hint flow; enables Wave 3 implementation

### W3-Impl-1: Workspace Dependencies via Existing Pattern (Roger)

**Scope:** How should `@akubly/skillsmith-runtime` declare dependencies on Cairn/Forge/Types?

**Decision:** Use existing internal dependency specifier pattern (`"*"`) instead of `workspace:*`. Root monorepo workspace glob `packages/*` covers new package; no redundant root `workspaces` entry needed.

**Rationale:** Environment npm rejects `workspace:*` with `EUNSUPPORTEDPROTOCOL`. Repository already uses `"*"` pattern consistently; new package integrates cleanly with existing convention.

**Implementation:** `skillsmith-runtime/package.json` declares `"@akubly/types": "*"`, `"@akubly/cairn": "*"`, `"@akubly/forge": "*"`. Root `tsconfig.json` references updated.

**Impact:** Workspace registration consistent across all packages; new package installs and builds cleanly.

### W3-Impl-2: Thin Runtime-CLI via Composition Migration (Roger)

**Scope:** How to refactor `runtime-cli` while preserving CLI contract?

**Decision:** Move entire `runForgePrescribe()` composition body from `runtime-cli` to `skillsmith-runtime/src/index.ts`. Reduce `runtime-cli` to thin facade: arg parsing, console formatting, exit-code mapping, top-level error reporting.

**Rationale:** Implements W3-D1 (R2 architecture) immediately instead of carrying temporary inline composition forward. Moved code is the old implementation, relocated intact — smallest behavioral risk. Avoids asking Alexander to re-migrate same code in W3-5.

**Implementation:** `skillsmith-runtime` owns `runForgePrescribe()` (profile load, vector provider, Forge invocation, dedup, persistence). `runtime-cli` owns CLI concerns only. CLI contract (`npx forge-prescribe --skill <id>`) unchanged.

**Impact:** Composition root established; CLI behavior identical; foundation ready for W3-5 Curator factory.

### W3-Impl-3: ExecutionProfile Reuse in Types (Alexander)

**Scope:** How to define `PrescriberOrchestrationConfig` and `PrescriberRunResult` in `@akubly/types`?

**Decision:** Keep `ExecutionProfile` in canonical location (`@akubly/types`); reference directly from `PrescriberOrchestrationConfig`. Keep `loadProfile` **synchronous** in Wave 3.

**Rationale:** `ExecutionProfile` already stable in `@akubly/types`; re-declaring structurally creates duplicate truth. Synchronous `loadProfile` matches current reality (Cairn SQLite-backed accessors are sync). Async deferrable to Phase 5 if cloud profile loading surfaces.

**Implementation:** Added `PrescriberOrchestrationConfig` and `PrescriberRunResult` to `packages/types/src/index.ts`. `skillsmith-runtime` re-exports canonical types. No Cairn compatibility shim required.

**Impact:** Wave 3 Curator-facing port has stable, reusable type contracts. No Cairn-to-types inversion. Foundation for W3-4 and W3-5.

### W3-Impl-4: Curate Async Transition + Trigger-Driven Skills (Alexander)

**Scope:** How should `curate()` accept and orchestrate the prescriber config?

**Decision:** 
1. `curate()` is now `async`, returns `Promise<CurateResult>`
2. Qualifying skills sourced from `ChangeVectorSweepResult.computedSkillIds` — distinct, sorted skill IDs whose vectors were newly inserted this cycle
3. Per-skill `runForSkill(skillId, minSessions)` receives `minSessions` from existing Curator chain: `changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS`

**Rationale:** `runForSkill()` is async by contract; keeping `curate()` sync would lie or drop orchestration results. `computedSkillIds` is smallest signal matching accepted trigger-driven rule. Reusing `minSessionsObserved` aligns vector-sweep and prescriber gates.

**Implementation:** All sync call sites updated to `await curate()`. Per-skill exceptions log `console.warn`, produce error-shaped `PrescriberRunResult`, do not abort cycle (fail-open).

**Impact:** Async Curator orchestration ready for W3-5/W3-6. Fail-open semantics locked. All 32 call sites updated and tested. Cairn 576/576 passing.

### W3-Impl-5: Shared Prescriber Execution Helper (Alexander)

**Scope:** How to avoid duplicating the Cairn+Forge composition pipeline between manual CLI (`runForgePrescribe`) and Curator factory?

**Decision:** Extract shared `executePrescriberRun()` helper inside `packages/skillsmith-runtime/src/index.ts` that owns the per-skill execution body:
1. Instantiate `SqliteChangeVectorProvider`
2. Call `runForgePrescribers()`
3. Persist hints via Cairn `insertHintIfNew()` dedup
4. Return generation / inserted / duplicated / error counts

`runForgePrescribe()` (manual CLI) keeps existing operator-facing result contract and global profile fallback. `createPrescriberOrchestrationConfig()` (Curator factory) adapts to Curator-facing `PrescriberRunResult` contract.

**Rationale:** Single-sourced composition body while allowing different consumers to apply different profile-selection policy and result shaping. Makes W3-6 hook wiring smaller.

**Implementation:** Extracted `executePrescriberRun()` helper. `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` both call shared helper. Cairn gains `getExecutionProfileWithDb()` convenience.

**Impact:** Composition logic centralized, no duplication. Factory ready for W3-6 hook wiring. Per-skill Curator orchestration fully realized. Skillsmith-Runtime 6/6 passing.

### W3-Impl-6: Curator Hook Wiring via Injected Config (Roger)

**Scope:** How to wire always-on Curator prescriber orchestration at session start without violating W3-D1 boundary?

**Decision:** Pick **R-Hook-A (inject config into hook)**. `packages/cairn/src/hooks/sessionStart.ts` accepts optional `PrescriberOrchestrationConfig` and forwards to `curate(undefined, prescriberOrchestrationConfig)`. Production bootstrap moved to `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, which calls Cairn's hook runner with factory that constructs `createPrescriberOrchestrationConfig({ db })` from already-open SQLite handle.

**Rationale:** Smallest change preserving W3-D1 boundary. Cairn owns hook mechanics and Curator invocation but does not import `skillsmith-runtime`, avoiding cairn ↔ skillsmith-runtime cycle. Always-on guaranteed by composition root bootstrap logic.

**Implementation:** 
- Cairn hook runner: optional `PrescriberOrchestrationConfig` parameter
- `skillsmith-runtime/src/hooks/sessionStart.ts`: production bootstrap wrapper
- `.github/hooks/cairn/curate.ps1`: updated to prefer runtime hook for both global-install and repo-checkout paths
- Tests call `runSessionStart(repoKey)` with `undefined` for backward compatibility

**Impact:** Always-on Curator orchestration wired. Composition boundary preserved. Tests and production use same hook path. Cairn 576/576 passing.

### W3-Impl-7: E2E Integration Test — Auto Trigger, Dedup, Fail-Open (Laura)

**Scope:** Validate Wave 3 end-to-end: auto trigger for computed skills, dedup confirmation, fail-open behavior, profile miss handling.

**Decision:** Place `wave3-pipeline.test.ts` in `packages/forge/src/__tests__/` covering four scenarios:
1. Auto trigger: new vectors computed → prescribers run → hints inserted
2. Dedup (trigger-driven): second pass with newly-qualified vectors → re-checked via eligibility → duplicates blocked
3. Fail-open: per-skill exception → logged, continued
4. No profile: skill skipped without error

**Rationale:** Forge is focal point (ingests Cairn summaries, emits final hints). Test location aligns with existing cross-module coverage. Real SQLite path fully validated. To avoid production dependency from Forge to Cairn, test imports Cairn source directly; Forge's `tsconfig.json` excludes test files from package build.

**Key Behavioral Finding:** Accepted W3-D4 (trigger-driven orchestration) only reruns for skills with newly-computed vectors (`computedSkillIds`). This means unchanged DB state cannot produce dedup rerun on back-to-back invocations. Test adapted to realistic scenario: second pass with newly-qualified existing vectors triggering dedup-visible behavior.

**Implementation:** 4 scenarios, bootstrap via `runSessionStart`, assertions on `PrescriberRunResult` counts and DB state. Forge 630/630 passing.

**Impact:** Wave 3 end-to-end integration validated. Dedup and auto-trigger mechanics confirmed. Real Cairn+Forge persistence path exercised.

---

## Open Questions

### W3-7 Trigger-Driven Dedup Semantics (Laura)

**Status:** FLAGGED FOR AARON'S DIRECTION

**Observation:** Wave 3's accepted trigger-driven orchestration (W3-D4) means Curator only calls prescribers for skills in `changeVectorSweep.computedSkillIds` — i.e., skills whose change vectors were newly inserted this cycle.

**Implication:** If the same skill's vectors remain unchanged across two consecutive session starts, the prescriber does not run on the second start, and no dedup-visible result is produced. This is correct by the trigger-driven design, but it differs from a "rerun on every session start" behavior.

**Question:** Should Wave 4+ introduce a broader trigger mechanism to allow reruns for skills with existing (non-new) summaries? Examples:
- Always rerun skills that have any vector summaries (regardless of new-this-cycle)
- Expose a manual scheduler or `force=true` flag for operator-initiated reruns
- Defer to Phase 5 when MCP/cloud integration allows finer control

**Current Design:** Trigger-driven only (W3-D4). This prevents unnecessary prescriber invocations and aligns with the "on new signal" principle, but it limits dedup visibility to cycles where vectors are genuinely computed.

**Recommendation:** Clarify with product whether current trigger semantics are intentional, or if dedup should be visible on *every* session start regardless of new vectors.

### Addendum (2026-05-23): Curator Observability Gap

Investigation into Laura's flagged ambiguity surfaced a deeper architectural finding worth recording for Wave 4 planning.

**Finding:** Curator (`packages/cairn/src/agents/curator.ts`) has no read surface into:

- `optimization_hints` table — Curator writes hints through the orchestrator but never reads them back. No awareness of hint state transitions (pending → applied / rejected / expired / suppressed / failed).
- Prescriber config or profile schema versioning — there is no version field tracked anywhere. If prescriber logic or category sets change, Curator has no signal.
- `execution_profiles` change history — Curator only reads "current" via `loadProfile(skillId)` inside `runForSkill`, no concept of "this profile is newer than last time I prescribed against it."

**Implication:** The trigger-driven gap Laura flagged is not just a scoping choice — it is the leading edge of a broader observability gap. Even if Wave 4 wanted to add richer triggers ("rerun when a hint gets rejected", "rerun when prescriber config bumps", "rerun stale profiles"), Curator currently cannot observe any of those signals.

**Wave 4 design options (for future planning, no decision yet):**

1. **Add new triggers as CairnEvents.** Hint state transitions and profile/config bumps become events appended to the existing CairnEvent stream Curator already processes via cursor. Smallest architectural delta — Curator's input model stays event-driven; new event types are additive.
2. **Give Curator a read surface plus "diff vs. last seen" state.** Curator gains direct queries into hint and profile tables, persists a watermark per skill of "what I last prescribed against," and recomputes on diff. More plumbing; needs a new derived state table.
3. **Externalize the trigger entirely.** A separate scheduler (cloud or local) decides which skills to re-prescribe and invokes the orchestration config directly. Curator stays leading-edge only; re-evaluation is owned elsewhere.

**Recommendation:** Option 1 aligns best with the existing architecture. Curator already loves event streams; hint state transitions are a natural fit. Defer the decision to Wave 4 — no action in Wave 3.

**Verified by:** Read of `packages/cairn/src/agents/curator.ts` lines 152–260 confirming the curate() input surface is strictly `CairnEvent` stream + `ChangeVectorConfig` + `PrescriberOrchestrationConfig`. No reads of `optimization_hints` or `execution_profiles` change history. Confirmed 2026-05-22 by Aaron + Squad.

---

## Wave 3 Research Notes

### Research: Composition Root Audit (Roger)

**Date:** 2026-05-23  
**Status:** Research input, delivered to ADR synthesis

**Scope:** Five options for where the runtime that imports both `@akubly/cairn` and `@akubly/forge` should live.

**Option Summary:**

| Option | Package Structure | Build Risk | Test Isolation | Phase 5 Portability | Recommendation |
|--------|-------------------|------------|-----------------|-------------------|-----------------|
| R1 | Forge imports Cairn | Medium | Medium | Low | Do not use |
| R2 | New runtime package | Low | High | High | ✓ Recommended |
| R3 | Optional Cairn import of Forge | Medium | Medium | Medium | Fallback |
| R4 | Runtime-cli dual-mode | Low | Medium | High | Alternative |
| R5 | New curator package | Low | High | High | Alternative |

**Recommendation:** **R2** — Separate `@akubly/runtime` (composition library) + thin `@akubly/runtime-cli` (CLI wrapper).

**Why:** Clean roles, best test isolation, zero build risks, Phase 5-ready. Library stays portable.

**Fallback:** R4 (new `@akubly/curator` package) if team prefers explicit orchestrator semantics.

**Do not use:** R3 (inject Forge into Cairn hooks). Test coupling + build-order risks unacceptable.

**Full Audit:** `docs/wave3-composition-root-audit.md`

---

### Research: Curator/MCP Integration Surface (Alexander)

**Date:** 2026-05-22  
**Status:** Research input, delivered to ADR synthesis

**Scope:** Wave 3 Curator–MCP integration requirements, architectural decisions, and open questions.

**Key Findings:**

1. **Composition Root Location:** New `@akubly/runtime` package (aligns with Roger's R2 recommendation).
2. **Invocation Strategy:** Hybrid — automatic via Curator hook + manual via MCP tool.
3. **Profile Selection (v1):** Trigger-driven only; defer global tier fallback to Wave 4.

**Secondary Decisions:**
- Eager Forge import (both packages co-deployed by assumption)
- `force=true` behavior: skip dedup (matches Wave 2 intent)
- Observable metrics: skills processed/skipped, hints generated/inserted/dedup'd, categories matched/attenuated
- Profile selection override: low-priority for v1; defer to Wave 4

**Curator API Changes:**
```typescript
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) 
    => Promise<{ skillId, hintsGenerated, hintsInserted, hintsDuplicated, hintsError }>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): CurateResult {
  // Signature is backward compatible (new param optional)
}
```

**MCP Tool:** `run_prescriber_optimization` (triggers orchestrator, returns structured output).

**Full Analysis:** `.squad/agents/alexander/wave3-integration-analysis.md`

---

## Cycle 1 — Wave 3 Persona Review Fixes + Wave 4 Planning

### C1-Triage: Wave 3 Persona Review Dispatch (2026-05-23)

**Summary:** 20 findings from 8-persona review (4 Code Panel, 4 Design Panel) across Wave 3 codebase. Disposition: 14 accepted, 3 rejected, 3 escalated.

**Escalated Items (Aaron's Decision Required):**

1. **I5 — MCP scope reopen timing:** "No net-new capability vs CLI" is too narrow; MCP serves a different operational surface. Recommendation: Document local-shell assumption in scope doc. Don't reopen MCP implementation.

2. **I6 — Security threat model:** No security threat model or explicit waiver. Recommendation: Brief Security Considerations section in ADR (3 sentences: local-only, trusted user, revisit at Phase 5). Not a full STRIDE.

3. **I4 — Always-on migration visibility:** Pre-Wave 3 prescribers were manual-only; now fire automatically every session. No changelog/opt-out. Recommendation: Add INFO log on first auto-run + release note.

**Rejected Items:**

- **B1:** Async breaking change compat layer — no external consumers in workspace-internal monorepo
- **M4:** stdin Object.defineProperty guard — test infrastructure only, no demonstrated failure mode
- **M5:** sqliteChangeVectorProvider sync-behind-async comment — noise that will need removal; contract is the interface

**Accepted Items — Summary by Owner:** See full triage file for details (11 fixes applied per `graham-cycle1-fixes.md` and `graham-cycle1-triage.md`).

**Sequencing:** See triage doc for recommended batch plan and dependencies.

### C1-Fixes: Alexander — Curator Time Budget + Fail-Open Logging (2026-05-23)

**Scope:** Batch 2 persona-review follow-up for Curator and Forge.

**Changes:**

- Added dedicated Curator prescriber-loop time budget guard in `packages/cairn/src/agents/curator.ts`
- Added optional `skippedReason?: string` to `PrescriberRunResult` in `packages/types/src/index.ts` for timeout skip reporting
- Added Forge warning-only logging at vector-provider fail-open path in `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts`
- Verified fail-open claim in scope doc: `runForgePrescribers()` already catches `provider.getSummaries()` errors locally, sets `historicalVectors = undefined`, continues
- Added regression test coverage in Cairn and Forge tests

**Decision:** No semantic doc/code fork needed. Implementation already matches scope doc's fail-open claim. Added missing operator warning log.

**Risk Note:** `skippedReason` is optional; existing `toEqual` assertions stay shape-compatible.

### C1-Fixes: Graham — Wave 3 ADR + Scope Doc Edits (2026-05-23)

**Scope:** Batch 1 persona-review follow-up for ADR refinement and scope documentation.

**Changes:** 11 fixes applied to `docs/adr/0001-composition-root.md` and `docs/forge-phase4.6-wave3-scope.md`:

- **I3:** Fixed factually wrong dependency claim in ADR Consequences
- **B2:** Rewrote Phase 5 portability overclaim; added local-SQLite constraint
- **I6:** Added Security Considerations section (3 sentences)
- **M8, M9, M10, M11:** Added inline citations, References section, post-decision notes
- **M6:** Added JSDoc on `createPrescriberOrchestrationConfig` factory scope
- **I5:** Expanded MCP rationale with local-shell assumption

**Verification:** `npm run build` ✅ green. Code changes limited to single doc-comment.

**Patterns Applied:** Security Considerations template, CHANGELOG hook, inline citations, Constraints vs Consequences distinction, Invariant notes, Post-decision notes.

### C1-Fixes: Laura — Test Fixture Deduplication + Minor Refactor (2026-05-23)

**Scope:** Batch 1 persona-review follow-up for test infrastructure.

**Changes:**

- Extracted `makeProfile()` and `seedQualifyingSkill()` helpers into `packages/cairn/src/__tests__/testFixtures.ts`
- Updated imports in orchestrationConfig.test.ts, wave3-pipeline.test.ts, sessionStart.test.ts
- Fixed hidden fixture drift: `sessionStart.test.ts` profile was missing `token.totalCost`
- Added `continue;` after `result.sessionCountReset++` to prevent double-counting bug in `curator.ts`
- Promoted `upsertExecutionProfileWithDb()` from internal use to reduce SQL duplication
- Stripped needless `async` keywords from ~15 synchronous test functions

**Verification:** `npm test --workspace=@akubly/cairn`, `@akubly/forge`, `@akubly/skillsmith-runtime` all passing.

**Notes:** Hidden fixture drift discovered during consolidation; promoted to Fuller Wave 3 shape rather than masking.

### C1-Fixes: Roger — Fail-Open Logging + Automatic Prescriber Summaries (2026-05-23)

**Scope:** Batch 2 persona-review follow-up for skillsmith-runtime and Cairn wiring.

**Changes:**

- Added fail-open `console.warn` logging at three Roger-owned swallow sites:
  - `packages/skillsmith-runtime/src/index.ts` per-hint persistence failures
  - `packages/cairn/src/hooks/sessionStart.ts` orchestration factory creation failures
  - `packages/skillsmith-runtime/src/hooks/sessionStart.ts` bootstrap-level failures
- Hardened Cairn post-curate callback seam so callback failures warn and do not skip remaining side effects
- Added automatic prescriber summary logging (aggregates `CurateResult.prescribers` into one stderr line)
- Removed duplicate `CreatePrescriberOrchestrationConfigOptions` alias
- Extended tests for new logging contract

**Verification:** `npm run build` ✅ green. All workspaces passing.

### C1-Proposal: Graham — Wave 4 Safety + Observability Foundation (2026-05-23)

**Status:** Proposal awaiting Aaron's approval

**Wave 4 Deliverables (3 items + integration tests):**

1. **insertHintIfNew atomicity fix** — partial UNIQUE index + BEGIN IMMEDIATE wrap (publicly committed in PR #21)
2. **Curator observability gap** — CairnEvent extensions for hint state transitions and profile bumps (Option 1 recommended)
3. **Force-overwrite knob** — `forceRegenerate` parameter for operators to bypass dedup

**Deferred to Wave 5+:**
- Global tier fallback (needs cross-granularity category matching)
- Staleness check (needs UX design)
- Observable metrics/dashboard (needs product clarity)
- DB Convention Standardization (repo-wide architectural question)

**Work Items:** W4-1 (UNIQUE index), W4-2 (CairnEvent extensions), W4-3 (forceRegenerate knob), W4-4 (integration tests). ~14 tests total, ~200 LOC incremental.

**Team Ownership:** Roger (W4-1, W4-2), Rosella (W4-3), Laura (W4-4).

**Key Design Decisions Needed:**

- **D1:** CairnEvent Observability Option — which of three observability options? (Recommendation: Option 1, add new triggers as CairnEvents)
- **D2:** forceRegenerate Surface — CLI only or both CLI+MCP? (Recommendation: CLI only for Wave 4)

**Wave 4 Shape:** Tight, foundational. Sets up Wave 5 for richer triggers, global tier fallback, dashboard, automatic prescriber scheduling.

### Decision: Harness Vision Document Drafted (2026-05-23)

**Author:** Graham Knight (Lead / Architect)  
**Status:** Awaiting Aaron's review

**Artifact:** `docs/harness-vision.md` (3,200+ words, 14 sections)

**Summary:** Comprehensive project vision for the Skillsmith Harness (foundational pre-PRD artifact). Covers six chambers (Harness, Cairn, Forge, Geneticist, Curator, Narrator), five session primitives, auditable decision ledger, genetic engineering loop, trust model, phasing, and 10 open questions for PRD authoring.

**Context:** Aaron requested pre-Wave-4 vision seeding. Squad identified Skillsmith Harness as bigger than Forge Wave 4 — distinct system requiring six specialized subsystems with defined chamber boundaries and interaction contracts.

**Key Architectural Decisions Embedded:**

- Working name: Skillsmith Harness (pending Aaron approval)
- Chamber boundaries: Six specialized subsystems
- Primitive taxonomy: Request, Artifact, Observation, Decision, Question
- Ledger model: Hash-linked append-only Merkle-chain in Cairn
- Genetic loop: Selection via change vectors, mutation of skill parameters, fitness = meanNetImpact × confidence
- Trust anchor: Narrator digests + confidence scoring + failed experiment surfacing + provenance links

**What's NOT in Doc (Intentionally):**
- PRD-level detail (work items, test specifications, API contracts)
- Implementation design (specific schemas, hash algorithms, CLI argument parsing)
- Resolved design choices (those belong in ADRs)
- Timeline estimates (vision is direction, not schedule)

**Open Questions Flagged (Hardest 3):**

1. Agent decision authority model — Can agents autonomously approve decisions within delegated scopes?
2. Genetic loop fitness weighting — How to weight token cost vs. drift vs. convergence vs. user acceptance?
3. Deficiency awareness UX — How to surface self-awareness without annoying the user?

**Tension Flagged:** Scope ambiguity between "learning runtime" and "CLI shell." Vision frames both as composable chambers, but chamber interaction contracts are still fuzzy. Specifically: does Harness chamber include slash-command extensibility, agent loading, model routing?

**Next Steps:**
- Aaron reviews/iterates on vision doc
- PRD authoring session (Wave A scope, work item decomposition)
- User story drafting (persona-driven scenarios)
- ADR for Harness/Cairn refactor boundary

---

# Archived: 2026-05-22T20:05:10Z
# Squad Decisions

## Active Decisions


# Phase 4.6 Kickoff — Change Vector Learning

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-03  
**Status:** Kickoff — ready for team spawn  
**Branch:** `squad/phase4.6-change-vectors`

---

## 1. Branch Decision

**Decision:** New branch `squad/phase4.6-change-vectors` from `squad/phase4-export-pipeline`.

**Rationale:**
- Phase 4.5 is complete (1012 tests, review-hardened). Clean phase boundary.
- PR-per-phase pattern established in Phases 3, 4, 4.5.
- Keeps the diff reviewable — Phase 4.6 is ~200 LOC, but will have its own test surface.
- If Phase 4.6 needs to bake longer, it doesn't block Phase 4.5 merge to main.

**Alternative rejected:** Continue on current branch. Would blur the PR boundary and make rollback harder if change vectors need iteration.

---

## 2. Spec Clarifications (Resolved)

### 2.1 Migration 012 Placement

**Resolved:** `packages/cairn/src/db/migrations/012-change-vectors.ts`, registered in `schema.ts` (version 12). Follows exact pattern of migrations 010/011.

### 2.2 Where `change_vectors` Writes Happen

**Resolved:** New CRUD module `packages/cairn/src/db/changeVectors.ts` owns reads/writes. The **computation trigger** is the Curator sweep — when aggregating profiles, if a hint with status `'applied'` has a subsequent metric snapshot available (from a later execution_profile update), the Curator computes and inserts the change vector. This is NOT in the prescriber or applier — it's a post-hoc observation.

**Rationale:** The Curator already owns cursor-based aggregation sweeps. Adding vector computation to the sweep is O(applied_hints) per sweep, naturally rate-limited, and consistent with the "observe, don't block" principle.

### 2.3 `historicalVectors` Integration with Prescriber Signatures

**Resolved:** Add optional third parameter to both prescribers:

```typescript
// Before (Phase 4.5):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig): PrescriberResult

// After (Phase 4.6):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig, historicalVectors?: ChangeVectorSummary[]): PrescriberResult
```

**Type definition** (in `prescribers/types.ts`):
```typescript
export interface ChangeVectorSummary {
  category: OptimizationCategory;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  confidence: number; // log-scaled boost
}
```

**Why optional param, not config:** Config is static per-invocation. Vectors are dynamic data queried per-skill. Semantic distinction matters for testability — tests can pass vectors directly without mocking a DB query.

### 2.4 "Before/After Metric Snapshots" — Concrete Meaning

**Resolved:**
- **Before:** `optimization_hints.metric_snapshot` JSON column (captured at hint generation time, already exists in migration 011).
- **After:** The `execution_profiles` row for the same `skill_id` at the time the Curator sweep runs (post-application).
- **Delta:** `after_value - before_value` for each of the 5 metric fields in `MetricSnapshot`.

No new "snapshot" table needed — the before is already stored, the after is the live profile.

### 2.5 Min `sessions_observed` Window

**Decision:** Configurable with sensible default.

```typescript
export interface ChangeVectorConfig {
  /** Minimum sessions between before/after to consider vector valid. Default: 3. */
  minSessionsObserved?: number;
}
```

**Rationale:** Fixed value is too rigid. A skill used 100x/day needs fewer sessions than one used 2x/week. Default 3 matches the prompt optimizer's `minSessions` canary threshold.

### 2.6 Net Impact Weighting

**Decision:** Same weights as drift score (from `telemetry/drift.ts`).

The roadmap spec explicitly states: `net_impact = Σ(delta_i × weight_i) // same weights as drift score`. This means:
- convergence: 0.30
- toolEntropy: 0.25 (maps to `delta_drift` since drift subsumes entropy)
- promptStability: 0.15
- cacheHit: 0.15
- cost: 0.15

**Import the weight constants** from `telemetry/drift.ts` rather than duplicating. Single source of truth.

---

## 3. Work Decomposition

### Wave 1 — Foundation (Alexander, parallel with Rosella type work)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| A1 | Alexander | Migration 012 | `012-change-vectors.ts` — CREATE TABLE + indices per roadmap §1.2 | — |
| A2 | Alexander | Schema registration | Import + register migration012 in `schema.ts`, version bump to 12 | A1 |
| A3 | Alexander | CRUD module | `packages/cairn/src/db/changeVectors.ts` — insert, getByHintId, getByCategory, computeNetImpact | A1 |
| A4 | Alexander | Curator integration | Add vector computation to Curator sweep: for each `applied` hint with sufficient post-application sessions, compute + insert vector | A3 |

### Wave 2 — Prescriber Enhancement (Rosella)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| R1 | Rosella | Types | `ChangeVectorSummary` interface in `prescribers/types.ts` | — |
| R2 | Rosella | Confidence scaling | `computeConfidenceBoost(vectorCount, minVectors)` utility in `prescribers/utils.ts` | R1 |
| R3 | Rosella | Prompt prescriber integration | Add `historicalVectors?` param to `analyzePromptOptimizations`, apply confidence boost + predicted impact ranking | R1, R2 |
| R4 | Rosella | Token prescriber integration | Same for `analyzeTokenOptimizations` | R1, R2 |
| R5 | Rosella | Weight import | Import drift weights from `telemetry/drift.ts` for `computeNetImpact` — ensure single source of truth | — |

### Wave 3 — Tests (Laura)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| L1 | Laura | Migration tests | 012 applies cleanly, idempotent re-run, table/index existence | A1 |
| L2 | Laura | CRUD tests | Insert/query/net-impact-computation for changeVectors module | A3 |
| L3 | Laura | Prescriber integration tests | Both prescribers with/without historicalVectors — verify confidence boost, ranking changes, edge cases (empty vectors, single vector, negative impact) | R3, R4 |
| L4 | Laura | Curator vector computation test | End-to-end: applied hint → profile update → sweep → vector appears | A4 |
| L5 | Laura | Weight consistency test | Assert net_impact weights match drift score weights (regression guard) | R5 |

### Critical Path

```
A1 → A2 (trivial)
A1 → A3 → A4
R1 → R2 → R3/R4
A3 + R3/R4 → L3
A4 → L4
```

**Estimated scope:** ~200 LOC production, ~150 LOC tests, 15-20 new tests. 1-day sprint for the team.

---

## 4. ADRs for This Phase

### ADR-P4.6-001: Curator owns vector computation (not prescriber, not applier)

Vectors are post-hoc observations about prescription efficacy. The Curator already sweeps periodically. Adding computation here keeps the prescriber pure (stateless analysis) and the applier focused on writes.

**Alternative rejected:** Compute in the applier after applying a hint. Problem: the "after" snapshot isn't available yet at application time — you need subsequent sessions to measure the effect.

### ADR-P4.6-002: Optional parameter over config object for historicalVectors

Keeps the prescriber testable without mocking a database. Tests pass vectors directly. Production code queries them from CRUD and passes in.

**Alternative rejected:** Add `vectorSource: () => ChangeVectorSummary[]` to config. Over-abstracted for a single call site.

### ADR-P4.6-003: Same weights as drift score

Single source of truth for "what matters" (Determinism > Cost). No independent weight tuning for net impact — if drift weights change, net impact changes too. Avoids divergent optimization signals.

---

## 5. Open Questions for Aaron

1. **Vector TTL:** Should old change vectors expire? The roadmap doesn't specify. My recommendation: no TTL for now — vectors are small and historical accuracy improves with data. Revisit if table exceeds 10K rows.

2. **Negative vectors:** If a prescription made things worse (negative net_impact), should it influence future confidence negatively (reduce confidence below baseline)? My recommendation: yes — `confidence_boost = log(1 + vectors_count) / log(1 + min_vectors)` only handles positive correlation. We should also apply a penalty multiplier when `meanNetImpact < 0`. But this is an enhancement we can add in Wave 2 without blocking Wave 1.

---

## 6. Ready to Spawn

**Status: YES — ready to spawn.**

All ambiguities resolved. Work items are concrete. No blockers.


# Decision: Weight Constants in Cairn (ADR-P4.6-003 Implementation)

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-03  
**Status:** Decided  
**Relates to:** ADR-P4.6-003 (same weights as drift score, single source of truth)

---

## Context

The `computeNetImpact` function in `packages/cairn/src/db/changeVectors.ts` requires the
same drift-signal weights used by `DRIFT_WEIGHTS` in `packages/forge/src/telemetry/drift.ts`.

ADR-P4.6-003 mandates a single source of truth: if drift weights change, net_impact must
change with them.

## Problem

Cairn cannot import from Forge. The dependency graph constraint is acyclic: Forge never
imports Cairn, and Cairn has no `@akubly/forge` dependency in its `package.json`. Adding
one would introduce a circular dependency (`@akubly/cairn` ← `@akubly/forge` ← ... ← back).

The kickoff doc §2.3/A3 explicitly acknowledged this risk and provided the fallback:
> "If there's a circular dep risk between cairn and forge, instead define the weight constants
> in cairn AND add a Laura-checked regression test (L5) confirming they match."

## Decision

**Mirror the constants in Cairn with explicit mapping documentation.**

`packages/cairn/src/db/changeVectors.ts` exports `CHANGE_VECTOR_WEIGHTS` with values
mirrored from `DRIFT_WEIGHTS`, with the delta-field → drift-signal mapping documented inline:

```typescript
export const CHANGE_VECTOR_WEIGHTS = Object.freeze({
  deltaDrift:        0.25,  // DRIFT_WEIGHTS.toolEntropy (drift subsumes entropy)
  deltaCost:         0.15,  // DRIFT_WEIGHTS.contextBloat (cost ↔ context utilization)
  deltaSuccessRate:  0.15,  // DRIFT_WEIGHTS.promptStability
  deltaConvergence:  0.30,  // DRIFT_WEIGHTS.convergence
  deltaCacheHit:     0.15,  // DRIFT_WEIGHTS.tokenPressure (cache ↔ token efficiency)
});
```

## Net-Impact Sign Convention

Deltas are stored as `after - before`. For lower-is-better metrics (drift, cost, convergence),
a negative delta = improvement. `computeNetImpact` negates these before weighting so that
**positive net_impact = prescription was beneficial**:

```
net_impact = -deltaDrift * 0.25
           + -deltaCost * 0.15
           + deltaSuccessRate * 0.15
           + -deltaConvergence * 0.30
           + deltaCacheHit * 0.15
```

This makes `meanNetImpact` in `ChangeVectorSummary` directly comparable: positive = good,
negative = prescription made things worse (Wave 2 penalty hook point).

## Rationale for Rejection of Alternatives

| Alternative | Rejection reason |
|-------------|-----------------|
| Import DRIFT_WEIGHTS from forge into cairn | Creates circular dep |
| Extract weights to `@akubly/types` | Adds coupling for no composability gain; types pkg is for shared types, not algorithmic constants |
| Pass weights as parameter to computeNetImpact | Over-abstracted; only one caller, weights are stable constants |

## Regression Guard

Laura's **L5 test** (`curatorVectors.test.ts` or dedicated file) must assert:
```typescript
// cairn CHANGE_VECTOR_WEIGHTS values match forge DRIFT_WEIGHTS values
expect(CHANGE_VECTOR_WEIGHTS.deltaConvergence).toBe(DRIFT_WEIGHTS.convergence);    // 0.30
expect(CHANGE_VECTOR_WEIGHTS.deltaDrift).toBe(DRIFT_WEIGHTS.toolEntropy);          // 0.25
expect(CHANGE_VECTOR_WEIGHTS.deltaSuccessRate).toBe(DRIFT_WEIGHTS.promptStability); // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCacheHit).toBe(DRIFT_WEIGHTS.tokenPressure);     // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCost).toBe(DRIFT_WEIGHTS.contextBloat);          // 0.15
```

This test imports from both packages from the monorepo root and will fail if either set
of constants drifts. It is the enforcement mechanism for ADR-P4.6-003.

## Sessions-Observed Proxy

A secondary decision: the Curator sweep uses `execution_profiles.session_count` as the
proxy for "sessions since hint applied". The `metric_snapshot` stored at hint-generation
time does not include session count (not in `MetricSnapshot`), so exact delta is not
available. Using total session count as the minimum guard (≥ minSessionsObserved = 3) is
conservative and safe: it means vectors are only computed once a skill has at least 3
sessions, which is the same threshold the prompt optimizer uses for canary decisions.
The `sessions_observed` field in the inserted row records the actual total session count
at computation time, giving downstream consumers full context.


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


# Defect Flag: `summarizeChangeVectors` confidence=0 inconsistency

**From:** Laura (Tester)  
**Date:** 2026-05-03  
**Phase:** 4.6 — Change Vector Learning  
**Severity:** Latent risk (not a production path today)  
**Assigned to:** Team (Graham to triage)

---

## Summary

`summarizeChangeVectors` returns `confidence: 0` when `vectorCount === 0`,
but `computeConfidenceBoost(0)` returns `1.0`. These two are inconsistent,
and the inconsistency can cause silent confidence zeroing if a zero-vector
summary is ever passed to a prescriber.

---

## Details

### `computeConfidenceBoost(n: number)` (forge, Rosella R1)

```ts
export function computeConfidenceBoost(vectorCount: number): number {
  // returns 1.0 when vectorCount === 0 (no evidence → no change)
  if (vectorCount === 0) return 1.0;
  // ...
}
```

Rosella's design intent: absence of evidence = neutral (multiply by 1.0,
no modification to existing confidence).

### `summarizeChangeVectors(...)` (cairn, Alexander A3)

```ts
if (rows.length === 0) {
  return { vectorCount: 0, meanNetImpact: 0, confidence: 0 };
}
```

Alexander's current behavior: absence of vectors → `confidence: 0`.

### The conflict

If a prescriber receives a summary with `confidence: 0` and applies the
confidence boost formula:

```ts
hint.confidence *= summary.confidence; // 0 → zeroes out all confidence
```

Every hint's confidence would be zeroed. This is **not a current production
path** — the prescribers currently only call `computeConfidenceBoost(summary.vectorCount)`,
not `hint.confidence *= summary.confidence`. But the inconsistency is a
latent trap for future developers.

---

## Expected behavior (my read)

When `vectorCount === 0`, `summarizeChangeVectors` should return
`confidence: 1.0` to match `computeConfidenceBoost(0)`.

OR: the field name should be changed to make the zero-default semantics
explicit (e.g., `rawConfidence` vs `boost`).

---

## Impact

- **Current production:** No impact. Prescribers call `computeConfidenceBoost(vectorCount)`,
  not `summary.confidence`.
- **Latent risk:** Any future code that does `hint.confidence *= summary.confidence`
  will silently zero confidence when there are no vectors.
- **Test coverage:** `changeVectors.test.ts` L2 has an `it.todo` for
  `'summarizeChangeVectors — confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)'`
  which documents this expected fix.

---

## Suggested resolution

Option A (minimal): Change `confidence: 0` to `confidence: 1.0` in the
zero-vector branch of `summarizeChangeVectors`.

Option B (clarifying): Rename the field to make the semantic explicit, and
document the "no vectors = no change" contract in JSDoc.

Option C (defer): Accept the inconsistency as intentional (zero confidence
= "we have no data, don't trust this hint") and update `computeConfidenceBoost`
to also return 0 for vectorCount=0. Then the prescriber logic becomes "if
confidence=0, skip the hint."

---

## Next action

Graham to decide between A/B/C in the next decision meeting. If Option A or
B is chosen, Alexander to patch `changeVectors.ts` and Laura to upgrade the
`it.todo` in `changeVectors.test.ts`.


# Verdict: `summarizeChangeVectors` confidence=0 inconsistency

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-03
**Phase:** 4.6 — Change Vector Learning
**Triggered by:** Laura's defect flag (`laura-phase4.6-summarize-confidence-zero.md`)
**Status:** DECIDED

---

## Verdict: B — Rename field to `confidenceBoost`

### Rationale

Aaron's analysis is correct and I'm adopting it. A confidence *level* and a
confidence *boost* occupy different mathematical spaces:

- **Level** ∈ [0, 1]: "how sure are we?" — 0 = no confidence, 1 = full confidence.
- **Boost** ∈ ℝ⁺ (multiplicative): "how much should we scale existing confidence?" — 1.0 = identity (no change), >1.0 = amplify, <1.0 = attenuate.

The field is named `confidence` but the JSDoc (my own kickoff doc, §2.3) says
"log-scaled boost" and `computeConfidenceBoost(0)` returns `1.0`. The field
name lies about what it contains. That is the root cause — Alexander's `0`
makes perfect sense *if* confidence is a level, and Rosella's `1.0` makes
perfect sense *if* confidence is a boost. Both implementations are internally
consistent; the bug is the ambiguous type definition.

Option A (patch value to 1.0) would fix the symptom but leave the misleading
name in place — the next developer who reads `confidence: number` will assume
level semantics and write `if (summary.confidence === 0)` instead of
`if (summary.confidenceBoost === 1.0)`.

Option C is rejected outright: returning 0 for zero vectors would zero out
every hint's confidence at cold start (no vectors yet), which defeats the
canary bootstrap from Phase 4.5. That's a functional regression, not a fix.

### New field name: `confidenceBoost`

Alternatives considered:

| Name | Pros | Cons | Decision |
|------|------|------|----------|
| `confidenceBoost` | Self-documenting, matches `computeConfidenceBoost()` function name | Slightly long | **Chosen** |
| `boostFactor` | Short | Generic — doesn't say *what* it boosts | Rejected |
| `vectorBoost` | Ties to source data | Doesn't communicate that it scales *confidence* | Rejected |

`confidenceBoost` wins because it mirrors the existing function name
`computeConfidenceBoost()` — one name, one concept, zero ambiguity.

---

## Files to change

| # | File | Change | Current owner |
|---|------|--------|---------------|
| 1 | `packages/forge/src/prescribers/types.ts` | `confidence` → `confidenceBoost` in `ChangeVectorSummary`; update JSDoc | Rosella (R1) |
| 2 | `packages/cairn/src/db/changeVectors.ts` | `confidence` → `confidenceBoost` in local `ChangeVectorSummary` + `summarizeChangeVectors` return; fix zero-vector case from `0` → `1.0` | Alexander (A3) |
| 3 | `packages/forge/src/prescribers/promptOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R3) |
| 4 | `packages/forge/src/prescribers/tokenOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R4) |
| 5 | Tests (multiple files) | Update all references to `.confidence` on `ChangeVectorSummary` objects | Laura (L2, L3) |

---

## Fix routing (Reviewer Rejection Protocol §lockout)

The lockout rule: the author of the buggy code may NOT be the one to fix it.
A different agent must make the correction.

| Code to fix | Written by | Fixed by | Rationale |
|-------------|-----------|----------|-----------|
| `packages/cairn/src/db/changeVectors.ts` — rename field + fix `0` → `1.0` | Alexander (A3) | **Rosella** | Alexander wrote the zero-default; lockout applies |
| `packages/forge/src/prescribers/types.ts` — rename field in interface | Rosella (R1) | **Alexander** | Rosella defined the type; lockout applies |
| `packages/forge/src/prescribers/promptOptimizer.ts` — update reference | Rosella (R3) | **Alexander** | Same author, same lockout |
| `packages/forge/src/prescribers/tokenOptimizer.ts` — update reference | Rosella (R4) | **Alexander** | Same author, same lockout |
| Tests (`changeVectors.test.ts`, `prescribers-vectors.test.ts`, etc.) | Laura | **Laura** | Test updates are Laura's domain regardless of lockout |

**Summary:**
- **Alexander** fixes: `types.ts`, `promptOptimizer.ts`, `tokenOptimizer.ts` (Rosella's code)
- **Rosella** fixes: `changeVectors.ts` (Alexander's code)
- **Laura** fixes: all affected test files

---

## ADR reference

This verdict extends ADR-P4.6-002 (§4 of kickoff doc): the `ChangeVectorSummary`
type's `confidenceBoost` field carries boost-multiplier semantics with identity
value 1.0. Prescribers apply it as `hint.confidence *= summary.confidenceBoost`.

---

## Verification criteria

1. `computeConfidenceBoost(0)` returns `1.0` ✓ (already correct, no change needed)
2. `summarizeChangeVectors(db, cat, skill)` returns `confidenceBoost: 1.0` when vectorCount === 0
3. No remaining references to `summary.confidence` in prescriber or CRUD code
4. All existing tests pass after rename
5. Laura's `it.todo` for "confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)" is upgraded to a passing test



### 2026-05-01: Phase 4 Export Pipeline Architecture

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 introduces the Export Pipeline — the third integration seam from the Forge build kickoff. It converts persisted `CairnBridgeEvent`s into certified SKILL.md files with DBOM provenance in YAML frontmatter.

**Key Decisions:**

#### ADR-P4-001: Fixed pure-function pipeline (not plugin architecture)
Four stages: Extract → Strip → Attach → QualityGate. Pure functions composed by `runExportPipeline()`. Dynamic stage registration rejected as YAGNI.

#### ADR-P4-002: Quality gate as injected function
`ExportQualityGate` is a function type in Forge. Cairn satisfies it at the call site. Consistent with `createModelCatalog(listFn)` pattern. Forge never imports Cairn.

#### ADR-P4-003: DBOM upsert (replace) semantics
One DBOM per session. Re-export replaces. Versioned history rejected — no current consumer.

#### ADR-P4-004: Soft quality gate failure
Gate failure returns `success: false` with the compiled skill still included. Caller decides write policy. DBOM persistence failures are fail-open.

#### ADR-P4-005: No new shared types
All Phase 4 types stay package-internal. Continues ADR-P3-004 precedent.

**Impact:**
- **New files:** `packages/forge/src/export/` (5 files), `packages/cairn/src/db/migrations/010-dbom-artifacts.ts`, `packages/cairn/src/db/dbomArtifacts.ts`
- **Modified files:** `packages/cairn/src/db/schema.ts` (register migration), `packages/forge/src/index.ts` (barrel update)
- **Tests:** 99 total (62 contract + 37 production)

**Specification:** Full spec at `docs/forge-phase4-spec.md`.

---

### 2026-05-01: Export Pipeline — Function Types over Shared Interfaces

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 export pipeline needs a quality gate that runs Cairn's linter/validator on compiled SKILL.md content. Forge must never import @akubly/cairn directly (acyclic dependency graph constraint).

**Decision:**
Quality gate is a simple function type `(skillContent: string) => QualityGateResult` defined in `forge/export/types.ts`. The caller (Cairn MCP tool or CLI) wires Cairn's functions into this shape. No shared interface in `@akubly/types`.

All Phase 4 types (`ExportDiagnostic`, `QualityGateResult`, `CompiledSkill`, `SkillFrontmatterInput`, `StageContext`, pipeline config/result types) stay package-internal in forge.

**Rationale:**
- Only one call site needs this contract — a shared interface in @akubly/types adds coupling for no composability gain.
- Function types are the simplest contract. If the quality gate signature changes, only forge and the one wiring site update.
- Consistent with Phase 3 pattern (`createModelCatalog(listFn)`).
- No new shared types means zero risk of cross-package type churn.

**Impact:**
- 5 new files in `packages/forge/src/export/`
- 32 new unit tests, 99 total export tests
- Forge test count: 326 → 388

---

### 2026-05-01: Export Pipeline Quality Gate Semantics

**Author:** Laura (Tester)  
**Type:** Test Contract  
**Status:** Implemented  
**Date:** 2026-05-01 (updated from 2026-04-30)

Phase 4 export pipeline uses quality gates before emitting a compiled SKILL.md. Now aligned with `docs/forge-phase4-spec.md` §4.4, §4.5, §7.

**Decision (spec-aligned):**
- Quality gate is an injected `ExportQualityGate = (skillContent: string) => QualityGateResult`
- `QualityGateResult.passed === false` → `ExportPipelineResult.success = false`
- Quality gate failure is **fail-closed but soft**: compiled skill is still returned for inspection, `qualityGatePassed = false`
- DBOM persistence failure is **fail-open**: warning diagnostic, pipeline continues
- Gate results propagate: `lintErrors`, `lintWarnings`, `validationScore` flow to pipeline result
- If the quality gate function **throws**, spec §7.1 says catch + diagnostic. Current inline implementation propagates — Roger should add try/catch in production (implemented by Coordinator).

**Key Finding:**
`validateStage` did NOT catch exceptions from the injected quality gate. Spec §7.1 explicitly says "Catch + diagnostic" for this case. Test documents this gap — production `validateStage` must wrap the gate call in try/catch. **Coordinator fixed in production implementation.**

**Impact:**
- 62 contract tests + 37 production tests in `export.test.ts` (99 total)
- `ExportQualityGate` replaces the old `CairnToolkit` interface (simpler, one function vs five)
- Forge never imports `@akubly/cairn` — gate is wired at call site per §5.2
- All 99 tests passing (100%)

---

### 2026-04-30: Event Dedup Guard — bridgeAttached flag

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Defensive Correctness
**Status:** Implemented

ADR-P3-005 defines dual event paths: `SessionConfig.onEvent` captures events during `createSession()` (before `session.on()` is wired), and `session.on()` captures events after `ForgeSession` construction. Design reviewers independently flagged that if the SDK fires events via `onEvent` after `createSession` resolves — during the gap before `ForgeSession` wires `session.on()` — both paths would emit the same event, causing duplicate `CairnBridgeEvent`s. This corrupts `TokenTracker` accumulation and `DBOM` reconstruction.

Added a `bridgeAttached` boolean flag in `ForgeClient.createSession()`. The `onEvent` closure checks this flag and returns early if `true`. The flag is set immediately before `ForgeSession` construction (which wires `session.on()` in its constructor).

**Alternatives Considered:**
1. Hash-based dedup (eventId or type+timestamp LRU) — More robust against unknown overlap patterns, but adds complexity (LRU cache, hash computation) for a problem that has a clean temporal boundary. Rejected as over-engineering for a Technical Preview SDK.
2. No guard — Relies on SDK honoring the non-overlapping window contract. Rejected because the SDK has shipped 52 versions in 3 months — behavioral contracts are unstable.

**Impact:**
- `packages/forge/src/runtime/client.ts` — ~4 LOC added (flag declaration, check, set)
- `packages/forge/src/__tests__/runtime.test.ts` — 2 new tests (overlap prevention + pre-bridge capture confirmation)
- All 289 tests pass, zero regressions

---

### 2026-04-29: Mock Session Unsubscribe Semantics

**Author:** Laura (Tester)
**Type:** Test Infrastructure
**Status:** Observation

While writing L6 Token Tracker integration tests, the shared mock session's `on()` returns a no-op unsubscribe function. This works fine for ForgeSession's bridge wiring (which only uses unsubscribe at disconnect time, where the whole session is torn down), but breaks any test that needs to verify real unsubscribe behavior — the handler keeps firing after "unsubscribing."

For tests requiring real unsubscribe semantics, build a dedicated `EventSource` adapter with `Set<handler>`-based subscribe/unsubscribe rather than trying to enhance the mock session. The mock session is designed for ForgeSession/ForgeClient lifecycle testing; the EventSource interface is the correct abstraction for lower-level eventing tests.

**Impact:** No changes to shared helpers needed. This is a documented pattern for future test authors: when testing event unsubscription, build a standalone EventSource, don't use `createMockSession()`.

---

### 2026-04-29: HookComposer Uses Live Observer Set

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Architecture
**Status:** Implemented

HookComposer class holds a live `Set<HookObserver>`. The `compose()` method returns hooks that reference the live set, so add/remove after composition takes effect on the next hook invocation without re-registering with the SDK.

**Tradeoffs:**
- **Pro:** Dynamic observer management without SDK re-registration — critical for decision gates added/removed mid-session.
- **Pro:** Each `add()` returns a dispose function — clean RAII-style cleanup.
- **Con:** Slightly more complex than a pure function; the composed hooks capture `this`.
- **Accepted:** Complexity justified because Cairn's architecture requires dynamic gate registration.

**Affects:**
- `packages/forge/src/hooks/index.ts`
- Any future code that registers decision gates or telemetry observers mid-session

---

### 2026-04-28: Forge Test Infrastructure Pattern

**Author:** Roger Wilco (Platform Dev)
**Type:** Infrastructure
**Status:** Implemented

Forge test infrastructure uses SDK mocks rather than live CLI integration for all unit tests.

**Three Test Helper Modules:**
1. **mock-sdk** — `createMockSession()` / `createMockClient()` with `vi.fn()` stubs and `_emit()` for event dispatch testing.
2. **event-factory** — Type-safe `SessionEvent` builders for all 6 core event types.
3. **type-assertions** — Runtime shape validation for `CairnBridgeEvent` conformance.

**Rationale:**
- SDK requires running Copilot CLI process for real sessions — unit tests must be offline.
- Event factory ensures tests use correctly-typed SDK events without fragile manual construction.
- Type assertion helpers serve double duty: test validation now, production runtime guards later.

**Rule:** All Forge tests must import from `./helpers/index.js`. No test may instantiate `CopilotClient` or `CopilotSession` directly.

---

### 2026-04-28: Hook Composer Must Isolate Observer Errors

**Author:** Laura (Tester)
**Type:** Implementation Requirement
**Status:** Implemented

The production `composeHooks` implementation MUST wrap each observer call in try/catch, logging errors but continuing to the next observer.

**Context:**
Spike's `composeHooks` propagates errors — if one observer's `onPreToolUse` throws, subsequent observers never run. This is dangerous in production: a buggy telemetry observer would kill the decision gate observer, silently removing safety checks.

**Implementation:**
Each observer call wrapped in try/catch. Errors logged but don't prevent subsequent observers from running.

**Test Coverage:**
- `"one observer throwing does not kill others"` — verifies isolated behavior (passing)
- `"spike composeHooks propagates errors"` — documents the spike's known gap (baseline)

**Impact:**
Telemetry observers are now safe in production. Error in one observer cannot cascade to disable decision gates or other critical observers.

---

### 2026-04-28: Alexander — SDK Interface Types for Runtime Module

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Architecture  
**Status:** Implemented

ForgeClient and ForgeSession depend on thin interface types (`SDKClient`, `SDKSession`) rather than importing CopilotClient/CopilotSession classes directly.

**Rationale:**
1. **Testability** — Mock objects from the test helpers satisfy the interface without needing the real SDK classes (which require a running Copilot CLI process).
2. **SDK churn isolation** — If the SDK adds/removes methods, only the interface definitions need updating, not every consumer.
3. **Dependency inversion** — The runtime module is constructor-injected with an `SDKClient`, making it composable and mockable at every level.

**Tradeoffs:**
- **Pro:** Tests run offline, no SDK instantiation needed.
- **Pro:** SDK method additions don't break existing code until we choose to adopt them.
- **Con:** Must manually keep interfaces in sync with the SDK surface we actually use.
- **Accepted:** The interface surface is small (~5 methods on SDKClient, ~5 on SDKSession), so maintenance cost is negligible.

**Affects:**
- `packages/forge/src/runtime/client.ts` — `SDKClient` interface
- `packages/forge/src/runtime/session.ts` — `SDKSession` interface
- All test code that uses `createMockClient()` / `createMockSession()`

---

### 2026-05-01T18:14:00Z: Phase 4.5 Local Feedback Loop — Aaron's Scope Decisions

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-05-01T18:14:00Z  
**Type:** Direction / Scope  
**Status:** Active

Phase 4.5 brainstorm Round 2 follow-up captured six major decisions:

#### 1. Loop Trigger Model
- **Forge:** Feedback loop is deliberate (manual) — user-initiated review of prescriptions
- **Cairn:** Feedback loop is automatic — pattern detection triggers prescription generation

#### 2. Profile Granularity
All four levels are viable and serve different purposes:
- **Per-skill:** Improves artifacts directly
- **Per-user:** Surfaces human insights (Cairn's core mission)
- **Per-model:** Exploratory/feedback data for determining best model per task
- **Global:** Dashboard of overall trends ("proving our pudding")

#### 3. Cold Start Strategy
Canary bootstrap is the natural choice. Training sessions deferred to Phase 4.75.

#### 4. Ancestry Graph Optimization Exploration
- Track prescription ancestry (which changes caused which drift)
- Derive heuristics about what types of changes cause directional drift
- Long-term: graph math for intelligent exploration of metric space
- Detect local optima via convergence patterns
- When wild cards come online (self-annealing, genetic programming), use graph to introduce evolutions and escape local maxima

#### 5. Feedback Loop Frequency — Maximum Detail Preferred
Aaron's prior stance: "Why would we not want as much detail as possible?" The tradeoffs need to be articulated explicitly before any future pruning decisions.

#### 6. Wild Card Ideas
All six wild cards from brainstorm are approved as future backlog items:
1. Time-Travel Debugging (rewind state to any decision point, replay with different model/parameters)
2. Predictive Cache Warming (pre-fetch likely-needed artifacts before user requests)
3. Self-Annealing Prescriptions (feedback loop automatically re-ranks prescriptions)
4. Genetic Programming Ancestry (crossover + mutation of decision graphs)
5. Karpathy Wiki Integration (encode knowledge graph as executable wiki)
6. Adaptive Skill Ranking (vector-based skill retrieval with user feedback)

**Rationale:** Team decisions from Phase 4.5 brainstorm follow-up — captured for team memory. Cascades to Phase 4.5 implementation planning, Phase 5 canary configuration, and Phase 6+ feature backlog.

**Impact:**
- Ancestry tracking: 200 LOC MVP planned for Phase 4.5
- Caching strategy: 4-layer hierarchy (L1 in-memory → L2 session → L3 short-TTL → L4 long-TTL)
- Vector search: Deferred to Phase 4.75 (non-blocking)
- Graph storage: Recursive CTEs in SQLite for ancestry queries
- Max detail: Capture everything, filter on read (downstream filtering strategy)

---

### 2026-04-30T22:25:00Z: Phase 5 (PGO Telemetry) Deferred — Budget & Data Protection

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-04-30T22:25:00Z  
**Type:** Scope / Risk  
**Status:** Active

Phase 5 (PGO Telemetry) is deferred as future work.

**Reasons:**
1. **Azure budget constraints** — Application Insights is expensive. Cost-benefit unclear until Phase 4.5 canary metrics available.
2. **Corporate data protection** — Requirements for emitting telemetry from work environments must be resolved before telemetry collection begins. Legal review pending.

**Timeline:** Revisit for Phase 4.75 (post-canary) if budget approved and compliance cleared.

**Impact:** Phase 5 planning deferred. Phase 4.5 canary proceeds without integrated telemetry pipeline; manual metrics collection via CLI query tools only.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---
### 2026-05-02: Phase 4.5 Architecture — Local Feedback Loop

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-02  
**Type:** Architecture  
**Status:** Proposed

Phase 4.5 introduces the Local Feedback Loop — a profile-guided optimization engine that runs entirely on local SQLite. Sessions produce telemetry → collectors aggregate signals → prescribers generate optimization hints → the applier writes improved SKILL.md v2 artifacts.

**Key Decisions:**

#### ADR-P4.5-001: Collectors as HookObservers, not a separate event bus
Telemetry collectors implement `HookObserver` and register via `ForgeSession.addObserver()`. No separate telemetry pipeline. Collectors see the same event stream as decision gates. O(1) per event, defer analysis to flush.

#### ADR-P4.5-002: Three tables, not one universal signal table
Separate `signal_samples`, `execution_profiles`, and `optimization_hints` tables. Each has different access patterns and indexes. Same reasoning as Phase 4's separate `dbom_artifacts`/`dbom_decisions`.

#### ADR-P4.5-003: TTL and row caps enforced by Curator, not DB triggers
7-day TTL and 10K row cap on `signal_samples` managed by Curator's existing sweep mechanism. Consistent with existing patterns, avoids synchronous trigger overhead on INSERT.

#### ADR-P4.5-004: Fixed drift weights, not learned
Drift signal weights are constants (convergence: 0.30, toolEntropy: 0.25, tokenPressure: 0.15, contextBloat: 0.15, promptStability: 0.15). Determinism signals get 70% total weight per Aaron's "Determinism > Token Cost" constraint.

#### ADR-P4.5-005: FeedbackSource as new shared type
`FeedbackSource` added to `@akubly/types`. First new shared type since Phase 2. Justified: both Forge (session start) and Cairn (Curator) consume this contract.

#### ADR-P4.5-006: Manual loop trigger in Forge, Curator-driven in Cairn
Forge caller controls `compute()` and `getSink()` invocation timing. Cairn's Curator drives feedback loops via session start + periodic checks. Manual in Forge (library control), autonomous in Cairn (always-on platform).

---

## Phase 4.5 Implementation Decisions (Session 2026-05-02T04:35:00Z)

### 2026-05-02: Phase 4.5 DB CRUD modules use the singleton `getDb()` pattern

**Author:** Alexander (SDK/Runtime Dev)
**Date:** 2026-05-02
**Type:** Convention
**Status:** Implemented

#### Context

The Phase 4.5 spec asked for three new CRUD modules in `packages/cairn/src/db/`
covering signal samples, execution profiles, and optimization hints. The task
brief suggested each module export pure functions accepting a
`Database.Database` parameter. Every existing CRUD module in `packages/cairn/src/db/`
(including the named reference, `dbomArtifacts.ts`) uses the singleton
`getDb()` pattern, and the test harness depends on it via
`beforeEach: closeDb(); getDb(':memory:')`.

#### Decision

The three new modules — `signalSamples.ts`, `executionProfiles.ts`,
`optimizationHints.ts` — call `getDb()` internally rather than accepting a
`Database.Database` argument. This matches every other CRUD module in the
package and lets the existing test harness work unmodified.

#### Rationale

- **Consistency** — Mixing two patterns in `packages/cairn/src/db/` would force
  every future contributor to ask which one applies.
- **Test reuse** — The `closeDb(); getDb(':memory:')` lifecycle is the package
  convention. New tests for these modules use it directly, no plumbing.
- **Reversibility** — If we ever need DI for cross-DB scenarios, refactoring
  the whole `db/` layer in one pass is cleaner than gradually drifting toward
  it module-by-module.

#### Impact

- 3 new CRUD modules + migration 011 + 40 new tests, all green.
- Existing tests asserting `schema_version` count/max (`db.test.ts`,
  `discovery.test.ts`, `prescriptions.test.ts`) bumped from 10 → 11.
- **Note for downstream consumers (Curator):** TTL sweep and row cap
  enforcement live on the Curator, not in the DB. `sweepSignalSamples(cutoffIso)`
  and `enforceSignalSampleCap(cap)` are the primitives to schedule.

---

### 2026-05-02: Phase 4.5 feedback-loop test strategy

**Author:** Laura (Tester)
**Date:** 2026-05-02
**Status:** Implemented

#### Context

Phase 4.5 ships a closed feedback loop: collectors → sink → aggregator →
prescribers → applier → (operator updates skill) → improved next cycle. The
loop is causally complete only when an operator actually edits a SKILL.md and
re-runs sessions. In tests, we cannot close that loop with real model calls.

#### Decision

Adopt **process-invariant testing** for the feedback loop, codified in
`feedback-loop.test.ts`:

1. **Convergence is asserted by *response curve*, not by terminal state.**
   We assert that hint count is monotone non-increasing as profile drift
   decreases across simulated cycles, and that the maximum impact score is
   likewise non-increasing. We do not assert "the system reaches GREEN" —
   that depends on the operator.

2. **The operator's effect is simulated at the profile level.** Each "next
   cycle" feeds the prescriber a profile whose drift mean is lower than the
   previous cycle's. We are testing the system's *response* to improving
   inputs, not the operator's quality.

3. **Efficiency bounds are intentionally generous.** Hot-path collectors are
   capped at 250ms / 10k events (vs. spec implication of ~25µs/event). Tight
   enough to catch O(N) regressions, loose enough to survive CI variability.

4. **Property-based tests use an in-file LCG, not fast-check.** Keeps the
   test suite zero-dep and reproducible. Coverage is sufficient for the
   small-dimensional invariants we care about (drift score bounds,
   classification monotonicity, aggregator commutativity).

#### Implications for Other Agents

- **Alexander / runtime:** if any collector implementation regresses to per-
  event O(N) (e.g., recomputing entropy from a growing list), the L5 tests
  will catch it before it ships.
- **Roger / sink:** the L2 integration test exercises `enqueueSample` at
  buffer-size 1 and 16 and asserts every sample reaches `persistSample`.
  Future sinks (e.g., AppInsightsSink) should pass the same shape of test.
- **Anyone touching the drift gate:** §11.4 metamorphic test pins the gate
  at >= 0.3 and probes 0.1 / 0.3 / 0.5. Moving the threshold requires
  updating that test in lockstep.

#### Alternatives Considered

- **Run real Copilot CLI sessions in CI:** rejected — too slow, too flaky,
  and would obscure regressions in the loop logic itself behind model noise.
- **Add fast-check for property tests:** rejected for now — current
  invariants are simple enough that an LCG suffices, and the dependency
  cost outweighs the marginal coverage gain.
- **Snapshot the applier output:** rejected — snapshots would lock in
  *artifacts* (hint text, counts) rather than *processes*. A snapshot would
  fire on every recommendation-string tweak.

---

### 2026-05-02: Promote ExecutionProfile / ProfileGranularity to @akubly/types alongside FeedbackSource

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-05-02
**Type:** Architecture
**Status:** Implemented (Phase 4.5)

#### Context

Spec §9.3 declares `FeedbackSource` as the first new shared type in
`@akubly/types` since Phase 2. The interface signature references
`ExecutionProfile`, `ProfileGranularity`, `OptimizationHint`, and
`StrategyParameters` — types the spec otherwise defines inside
`packages/forge/src/telemetry/` and `packages/forge/src/prescribers/`.

`@akubly/types` cannot depend on `@akubly/forge` (acyclic dependency graph,
ADR-P4-002), so `FeedbackSource` cannot literally use forge-private types.

#### Decision

Two of the four referenced types are now defined in `@akubly/types`:

- `ProfileGranularity` — string union, fully shared.
- `ExecutionProfile` — full structural definition (drift / tokens / outcomes
  blocks). `packages/forge/src/telemetry/types.ts` re-exports them so forge
  code retains a single import path.

The remaining two are defined as **open-shaped** interfaces in `@akubly/types`:

- `OptimizationHint` — required keys (`id`, `source`, `skillId`, `category`,
  `description`) plus `[key: string]: unknown` for prescriber-specific fields.
- `StrategyParameters` — pure `[key: string]: unknown` map.

Concrete prescribers extend these without forcing schema changes in
`@akubly/types`.

#### Rationale

- `ExecutionProfile` is genuinely shared: Cairn's curator and prescribers
  both need to read profiles produced by Forge. Putting it in `@akubly/types`
  matches its actual lifetime as a cross-package contract.
- Open-shaped `OptimizationHint` / `StrategyParameters` honour the
  ADR-P4-005 "minimum shared types" instinct. The required keys are the
  invariant identity (every hint has an id, source, skill, category,
  description); everything else varies by prescriber.
- This avoids two anti-patterns: (1) widening `FeedbackSource` to use
  `unknown` everywhere (kills compile-time safety), and (2) duplicating the
  hint/strategy schemas across packages (kills the contract).

#### Impact

- `packages/types/src/index.ts` — +5 exports (`ProfileGranularity`,
  `ExecutionProfile`, `OptimizationHint`, `StrategyParameters`,
  `FeedbackSource`). No removals, no breaking changes.
- Forge's `telemetry/types.ts` re-exports `ProfileGranularity` and
  `ExecutionProfile` so `import { ExecutionProfile } from "../telemetry/types.js"` keeps working.
- Tests: 826 baseline → 954 passing (forge 476 + cairn 478). Telemetry
  module contributes 56 of the new tests.

#### Follow-ups for the team

1. **Spec event-type mismatch (for Graham / wiring task):** spec §9.4 names
   `tool_call_started`, `usage_reported`, `turn_completed`,
   `session_completed`, `tool_call_failed`. The bridge `EVENT_MAP` uses
   `tool_use`, `model_call`, `turn_end`, `session_end`. The collectors are
   coded to the spec strings; wiring will need either a remapper at the
   collector boundary or an `EVENT_MAP` extension.
2. **Convergence formula (for Graham):** `convergedTurn / turnCount` is
   degenerate at typical session shapes (always 1.0 when `session_completed`
   arrives last). Worth a redesign before Phase 5 — perhaps
   `convergedTurn / expectedTurns` against a per-skill expected-turns
   parameter from `StrategyParameters`.

---

### 2026-05-02: Phase 4.5 Prescribers + Applier — Determinism Mechanisms

**Author:** Princess Rosella (Plugin Dev)
**Date:** 2026-05-02
**Type:** Architecture / Implementation
**Status:** Implemented (S1–S8)

#### Context

The Phase 4.5 spec (§3–§4) prescribes the prescriber → applier pipeline and
states the ordering rule "Determinism > Token Cost (Aaron's constraint)" as
prose. While implementing, I had to choose how strongly to encode that
constraint. Two options:

1. **Soft prioritization** — token optimizer always runs, but its hints carry
   lower impact scores than prompt-optimizer hints.
2. **Hard gate** — token optimizer returns an empty hint set entirely when
   drift is RED, regardless of cache/cost signals.

#### Decision

I chose **(2) hard gate**, exposed as ``TokenOptimizerConfig.driftGate``
(default ``0.3``). ``analyzeTokenOptimizations`` exits early with no hints when
``profile.drift.mean >= driftGate``. This matches the spec text at line 933
("Guard: Don't optimize tokens if drift is RED — fix determinism first") and
makes the constraint structurally enforced rather than score-balancing
dependent.

I also made the **applier order-stable**: sort key is
``(impactScore desc, id asc)``. Without the id tiebreaker, two hints with
identical impact scores could swap positions across runs depending on input
order, breaking SKILL.md compilation reproducibility.

#### Other team-relevant choices

- ``DEFAULT_STRATEGY_PARAMS`` is ``Object.freeze``-d. Cross-package consumers
  (Cairn, runtime, future loop-driver) cannot mutate it accidentally.
- ``EXPLORATION_FLOOR = 0.15`` is a module constant, not a config knob.
  Aaron's directive ("diminishing returns worth it when scaled across future
  of software engineering") means this is policy, not preference.
- ``ApplierConfig.now: () => Date`` is injectable for deterministic tests of
  ``frontmatterPatch.optimizationHints[].appliedAt``. The export pipeline can
  use this to thread its own clock if it ever needs to backdate patches.
- ``cacheableTools`` extraction reads from ``evidence.triggerMetrics`` keys
  prefixed with ``tool:`` and an optional ``evidence.cacheableTools`` array.
  Forward-compatible with telemetry adding tool-level signals — Roger and I
  should align on which path becomes canonical when the loop-driver lands.

#### Implications

- **Cairn / loop-driver:** When feeding hints back through the loop, expect
  zero token-optimization hints during RED drift periods — this is by design,
  not a bug. Test fixtures should not assume token hints are always present.
- **Export pipeline (Phase 4):** ``SkillFrontmatterPatch`` is the contract
  between applier and ``attachStage``. Adding new patch fields requires
  coordinated changes here.
- **Telemetry team (Roger):** ``ExecutionProfile`` shape is now relied upon
  by both telemetry and prescribers. Changes to drift/tokens/outcomes nesting
  will ripple into 27 prescriber tests.

#### Verification

- ``npm run build --workspace=@akubly/forge`` passes.
- 27 new tests in ``packages/forge/src/__tests__/prescribers-applier.test.ts``
  all pass (mechanism × determinism × metamorphic).
- 475/476 forge tests pass overall. The one unrelated failure
  (``telemetry-collectors.test.ts > classifies ... as GREEN``) is in
  Roger's collectors module and predates my work.
Forge is the development tool (human in loop). Cairn is autonomous (Curator decides). Shared analysis logic, two trigger paths.

#### ADR-P4.5-007: Determinism > Token Cost ordering
All prescriber priority, drift weights, and optimization ordering enforces determinism first. Token optimizer gates on drift level — won't prescribe if drift is RED. This is Aaron's design constraint, not a decision.

**Impact:**
- **New files:** `packages/forge/src/telemetry/` (6 files), `packages/forge/src/prescribers/` (4 files), `packages/forge/src/applier/` (3 files), `packages/cairn/src/db/migrations/011-telemetry-feedback.ts`, 3 new CRUD modules
- **Modified files:** `packages/cairn/src/db/schema.ts`, `packages/forge/src/index.ts`, `packages/types/src/index.ts` (FeedbackSource)
- **Estimated LOC:** ~1200 production + ~600-800 tests
- **Estimated tests:** 61-80

**Specification:**
- Full spec: `docs/forge-phase4.5-spec.md`
- Roadmap (4.6/5): `docs/forge-phase5-roadmap.md`
  title: 'List Prescriptions',
  description:
    'List improvement suggestions the Prescriber has generated from detected patterns. ' +
    'Filter by lifecycle status or see all. Each result includes confidence level in plain ' +
    'language and a hint about pending suggestions worth reviewing. ' +
    'Use this after completing a task to check for improvement opportunities.',
  inputSchema: {
    status: z.enum([
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    ]).optional()
      .describe('Filter by lifecycle status. Omit to return all statuses.'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results to return (default 10).'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `get_prescription`

```typescript
server.registerTool('get_prescription', {
  title: 'Get Prescription',
  description:
    'Get full detail about a specific improvement suggestion, including the pattern ' +
    'that triggered it, what Cairn observed, the suggested change, where it would be ' +
    'applied, and a diff preview. Use this to understand a suggestion before deciding.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription ID to retrieve.'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `resolve_prescription`

```typescript
server.registerTool('resolve_prescription', {
  title: 'Resolve Prescription',
  description:
    'Act on an improvement suggestion: accept (applies the change), reject (dismisses ' +
    'permanently), or defer (revisit later). Rejection is the simplest action — no reason ' +
    'required. Acceptance applies the change to a sidecar instruction file. ' +
    'Deferral sets a cooldown before the suggestion resurfaces.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription to act on.'),
    disposition: z.enum(['accept', 'reject', 'defer'])
      .describe('How to resolve: accept (apply change), reject (dismiss), defer (revisit later).'),
    reason: z.string().optional()
      .describe('Optional reason for rejection or deferral. Helps Cairn learn preferences.'),
  },
  annotations: { readOnlyHint: false },
}, handler);
```

#### New Tool: `show_growth`

```typescript
server.registerTool('show_growth', {
  title: 'Show Growth',
  description:
    'See a summary of patterns Cairn has helped resolve and overall improvement trends. ' +
    'Leads with wins — shows resolved patterns first, then active ones. ' +
    'Uses natural language, not percentages. Use this to reflect on progress.',
  annotations: { readOnlyHint: true },
}, handler);
```

#### Modified Tool: `run_curate` (DP1)

Updated description:
```typescript
description:
  'Trigger the curator to process unprocessed events and discover patterns. ' +
  'The curator scans the event stream for recurring errors, error sequences, ' +
  'and skip frequency, then creates or reinforces insights with prescriptions. ' +
  'Also generates new improvement suggestions when insights are created or reinforced. ' +
  'Returns the number of events processed, insights discovered, and any new suggestions. ' +
  'Use this when you want fresh analysis of recent activity.',
```

---

## Dependency Graph

```
7A ─────────────────────────────────────────────────┐
│                                                    │
├──→ 7B (Artifact Discovery) ──┬──→ 7D (Prescription Engine) ──┐
│                               │                                │
├──→ 7C (Infrastructure) ──────┤──→ 7E (Apply Engine) ──────────┤
│                               │                                │
└───────────────────────────────┘               7F (MCP + UX) ◄─┘
```

- **7A** has no dependencies (foundation)
- **7B, 7C** depend only on 7A (can run in parallel)
- **7D, 7E** depend on 7A + 7B (can run in parallel after 7B)
- **7F** depends on 7C + 7D + 7E (final integration phase)

**Critical path:** 7A → 7B → 7D → 7F  
**Parallel opportunities:** 7B ∥ 7C, then 7D ∥ 7E

---

## Execution Schedule

| Phase | Owner | Depends On | Parallel With | Est. New Tests |
|-------|-------|------------|---------------|----------------|
| 7A | Roger | — | — | ~25 |
| 7B | Rosella | 7A | 7C | ~20 |
| 7C | Gabriel | 7A | 7B | ~10 |
| 7D | Roger | 7A, 7B | 7E | ~25 |
| 7E | Rosella | 7A, 7B | 7D | ~15 |
| 7F | Roger + Valanice | 7C, 7D, 7E | — | ~20 |
| **Total** | | | | **~115** |

**Final test count target:** ~250 (134 existing + ~115 new)

---

## Acceptance Criteria

The Prescriber is complete when:

1. ✅ `run_curate` chains `prescribe()` automatically when insights change
2. ✅ `preToolUse` chains `prescribe()` at session start when insights change
3. ✅ `curate()` respects 3-second time budget
4. ✅ 8-state lifecycle enforced in DB and code
5. ✅ 4 new MCP tools registered and functional
6. ✅ Full 4-phase artifact scanner with 5-minute SQLite cache
7. ✅ All 10 UX principles verifiable in tool output
8. ✅ Sidecar instruction files written (not user-owned files modified)
9. ✅ managed_artifacts tracks all Prescriber-written files
10. ✅ Rollback capability functional
11. ✅ Drift detection via checksum comparison
12. ✅ 7 preference keys configurable
13. ✅ Deferral cooldown (3 sessions default)
14. ✅ Auto-suppression after 3 deferrals
15. ✅ Growth tracking via `show_growth`
16. ✅ All existing 134 tests still pass
17. ✅ ~115 new tests pass
18. ✅ Clean build, clean lint
19. ✅ Dogfooded: Aaron has accepted ≥1 real prescription


---

## Phase 7D Decisions — Roger

### recencyWeight Capped at 1.0

The spec formula Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15)) produces values >1.0 when sessionsAgo < 5. Added Math.min(1.0, ...) to match the spec description "1.0 within 5 sessions, decays to 0.5 by 20 sessions."

**Impact:** Priority scores are bounded [0, 1.0] as expected. No bonus for very recent insights.

### Event Logging is Fail-Soft

logEvent() requires a FK-valid session ID. The prescriber looks up the most recent active session from the DB. If none exists (e.g., during sessionStart before the new session is created), event logging is silently skipped.

**Rationale:** Prescriber runs in two contexts: (1) sessionStart (before new session exists) and (2) MCP run_curate (session may exist). Logging is informational, not critical. Fail-soft is consistent with the project's fail-open philosophy.

**Impact:** Phase 7F tools that read prescription events should be aware that some prescription_generated events may be missing for prescriptions generated during session startup.

### shouldResurface Compensates for Session Counter Timing

incrementSessionCounter() runs AFTER prescribe() in sessionStart.ts. The shouldResurface() function uses currentSession + 1 >= deferUntilSession to compensate, so deferral cooldowns are honored correctly.

**Impact:** Deferral cooldowns are accurate. Phase 7F should use the same shouldResurface() function if needed.

### Rejected Prescriptions Block Re-Prescription

'rejected' is added to the set of statuses that prevent generating a new prescription from the same insight. An insight with a rejected prescription won't be re-prescribed until the rejected prescription is manually expired or the insight itself changes.

**Rationale:** Rejected is terminal per the spec. Without this, rejected insights would get re-prescribed on every prescribe() run, spamming the user.

**Impact:** If a user rejects a prescription but later wants to reconsider, they'll need to explicitly re-enable (possibly via unsuppress or manual expiration in Phase 7F).

### checkAutoSuppress Exported for Phase 7F

The auto-suppression check (deferCount >= threshold → suppress) is exported as checkAutoSuppress(prescriptionId, deferCount). Phase 7F's resolve_prescription MCP tool should call this after each deferral.

**Impact:** Phase 7F must call checkAutoSuppress() after deferPrescription() in the defer flow.

---

## Phase 7E Decisions — Rosella

### LIFO Rollback for Multi-Prescription Sidecars

**Context:** managed_artifacts has UNIQUE(path). Multiple prescriptions can append to the same sidecar file, but only one row can exist per path.

**Decision:** When appending, remove the old managed_artifact row and re-track with the latest prescription's ID. Rollback only supports the latest writer (LIFO). Rolling back a middle prescription in a multi-append stack is not supported in this phase.

**Rationale:** The existing schema supports this cleanly. Full multi-level undo would require a separate history table — overkill for Phase 7E scope. If needed later, we add a managed_artifact_history table.

### File-Based Drift Detection

**Context:** The DAL's detectDrift() compares original_checksum vs current_checksum in the DB only — it doesn't read disk.

**Decision:** checkDrift() in applier.ts reads the actual file, computes SHA-256, and compares to stored current_checksum. This is the on-disk drift check. The DAL function is for DB-internal consistency.

**Rationale:** Users need to know if someone hand-edited the sidecar file. That requires a disk read, not a DB lookup.

### Apply Blocks on Drift

**Context:** Should pplyPrescription proceed if the sidecar has drifted since last write?

**Decision:** Block with error. The user must resolve drift before new content is applied.

**Rationale:** Silently overwriting user edits violates the "safe defaults" principle from DP6. The user should explicitly acknowledge changes before Cairn writes again.

---

## Phase 8D — Skill Test Harness

### 2026-04-30: Phase 3 Architecture — ForgeClient & SDK Abstraction (Graham)

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Active

# Graham — Phase 3 Architecture Decisions

**Date:** 2026-04-30  
**Author:** Graham Knight (Lead / Architect)  
**Context:** Phase 3 architecture specification for `@akubly/forge` — live SDK integration

---

## ADR-P3-001: ForgeClient wraps CopilotClient 1:1

**Decision:** Each ForgeClient owns exactly one CopilotClient. No shared instances.

**Alternatives:**
1. Shared client singleton — lifecycle confusion, race conditions on concurrent session creation.
2. No wrapper / expose CopilotClient directly — breaks "SDK types don't leak" contract.
3. **1:1 wrapper (chosen)** — clear ownership, deterministic cleanup.

**Trade-off:** Slightly more memory if multiple ForgeClients exist. Clear lifecycle wins.

---

## ADR-P3-002: EventSource interface over direct CopilotSession coupling

**Decision:** `attachBridge()` and `createTokenTracker()` accept `EventSource { on(handler): () => void }` rather than `CopilotSession`.

**Alternatives:**
1. Accept CopilotSession directly — simpler types, but couples to SDK and complicates testing.
2. **EventSource interface (chosen)** — enables mock event sources, keeps Phase 2 bridge SDK-free.

**Trade-off:** One extra interface definition for massive test simplification.

---

## ADR-P3-003: ModelCatalog uses injection over ForgeClient reference

**Decision:** `createModelCatalog()` takes a `listFn: () => Promise<ModelSnapshot[]>` rather than a ForgeClient reference.

**Alternatives:**
1. Pass ForgeClient — simpler call site, untestable without live client.
2. **Injection (chosen)** — testable with static array, matches Phase 2 pattern.

**Trade-off:** Caller wires one line of glue for full testability.

---

## ADR-P3-004: No new shared types in @akubly/types

**Decision:** Phase 3 types (ForgeClientOptions, ForgeSessionConfig, TokenBudget, ModelCatalog) stay Forge-internal.

**Rationale:** Cairn consumes CairnBridgeEvent, not TokenBudget. Types graduate to shared only when two packages actually import them.

**Trade-off:** If Cairn needs TokenBudget later, one PR to migrate. Smaller shared surface now.

---

## ADR-P3-005: Dual event paths — onEvent for setup, attachBridge for runtime

**Decision:** Use SessionConfig.onEvent for events during createSession(), attachBridge() after session exists. No dedup needed.

**Rationale:** SDK guarantees non-overlapping windows. Matches spike pattern.

**Trade-off:** Relies on SDK behavior guarantee. Low risk.

---

## ADR-P3-006: Strategies as plain functions, not class hierarchy

**Decision:** ModelStrategy is a function type. Built-in strategies are a Record<string, ModelStrategy>.

**Alternatives:**
1. Strategy class hierarchy — overkill for 3 strategies, adds constructor ceremony.
2. **Function type (chosen)** — easy to test, compose, override.

**Trade-off:** No runtime type-checking of strategy names. Acceptable for developer-facing API.


---

### 2026-04-29: Phase 3 Test Strategy — Inline Contract Testing (Laura)

**Author:** Laura (Tester)  
**Type:** Testing  
**Status:** Active

# Laura — Phase 3 Test Strategy: Inline Contract Testing

**Author:** Laura (Tester)
**Type:** Test Strategy
**Status:** Proposed
**Date:** 2026-04-29

## Decision

Phase 3 test contracts use **inline implementations** of the expected API surface (ForgeClient, ForgeSession, ModelCatalog, ModelSwitcher, TokenBudgetTracker) rather than importing from non-existent modules. Each inline class defines the behavioral contract. When Alexander builds the production modules, tests switch imports — any divergence breaks tests immediately.

## Rationale

1. **TDD red-phase compatibility:** Tests must be runnable NOW, before production code exists. Importing from `../runtime/index.js` would produce compile errors.
2. **Contract precision:** Inline implementations encode expected behavior (e.g., "disconnect is idempotent", "bridge events are returned as copies") that pure type signatures cannot express.
3. **Proven pattern:** Phase 2 used the same approach (inline bridge/hooks) and the migration to production imports was smooth — documented in history.md.

## Migration Path

When production modules are built:
1. Delete inline class definitions from test files
2. Replace TODO import comments with real imports
3. Run tests — failures reveal behavioral divergence
4. Resolve divergence (fix production code or update contract if intentional)

## Mock SDK Extensions

Extended `helpers/mock-sdk.ts` for Phase 3 needs:
- **MockCopilotSession:** Added `setModel`, typed event handler map, unsubscribe returns
- **MockCopilotClient:** Added `resumeSession`, `listModels`, `listSessions`, `getAuthStatus`, `getStatus`
- **makeModelInfo:** Shared factory for constructing valid `ModelInfo` objects

These extensions are backward-compatible — existing Phase 2 tests continue to pass unchanged.

## Test Coverage Summary

| Module | Tests | Key Behaviors |
|--------|-------|---------------|
| runtime.test.ts | 35 | Session lifecycle, bridge wiring, hook composition, decision gates, disconnect semantics |
| models.test.ts | 52 | Model catalog CRUD, snapshot extraction, mid-session switching, token budget tracking, selection strategies |

## Risks

- Inline implementations may drift from what Alexander builds. Mitigation: clear TODO markers and documented migration path.
- Mock SDK extensions add maintenance surface. Mitigation: centralized in helpers/, barrel-exported.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Runtime (Alexander)

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

Addressed 7 persona review findings for `packages/forge/src/runtime/`. 6 accepted with fixes, 1 partially rejected (spec-vs-implementation gap with no test contracts).

## Key Decisions

**Spec Surface Gap — Partial Reject (F2)**

Rejected: `listModels`, `listSessions`, `getAuthStatus`, `getStatus` — these are in the architecture spec but have no test contracts and no consumers. They can be added when a consumer needs them.

Accepted from same finding: `onEvent` bridge for pre-session events and `model_change` tracking — these are correctness concerns with spec backing.

**Session Map Lifecycle (F6)**

Added `onDisconnect` callback pattern: ForgeClient passes a cleanup callback when creating ForgeSession. On disconnect, the session auto-removes itself from the client's tracking map. This means `sessionCount` stays accurate without manual cleanup.

**decisionGate Removed from Config (F5)**

`decisionGate` predicate was defined in `ForgeSessionConfig` but never wired. Decision gating is already handled through the observer pattern (`HookObserver.onPreToolUse`). Removed to avoid misleading API surface.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F1 | stop() error isolation | Added try/catch per session; errors logged separately |
| F3 | onEvent bridge missing | Wired pre-session event bridge (ADR-P3-005) |
| F4 | model_change tracking | Integrated into ModelChangeRecord[], persisted in events |
| F5 | decisionGate config field | Removed (not wired; gating handled by HookObserver) |
| F6 | Bridge handler guards | Added _disconnected guard + try/catch wrapper |
| F7 | Session map lifecycle | Added onDisconnect callback; auto-removal on disconnect |

## Files Changed

- `packages/forge/src/runtime/client.ts`
- `packages/forge/src/runtime/session.ts`

## Test Impact

All 268 tests pass. Zero regressions.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Models (Roger)

**Author:** Roger (Platform Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

9 persona reviewers surfaced 5 findings against the models/ module. Triaged as:
- **4 accepted and fixed** (F2–F5)
- **1 rejected** (F1)

## Key Decisions

**Rejected: F1 — sort() Mutates Input Array**

The Architect flagged `sort()` in `cheapest`/`smartest` strategies as mutating the input `models` array. This is a false positive: `filter()` already returns a new array, so `sort()` only mutates the filtered copy. No caller's data is affected.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F2 | readonly bypass on TokenBudget.contextWindow | Introduced MutableContextWindow internal type; external API stays readonly |
| F3 | Dual EventSource subscriptions | Merged into single source.on() handler with if/else on event.type |
| F4 | Test field drift (reasoningEffort vs newReasoningEffort) | Updated test's ModelChangeRecord, makeModelChangeEvent, and assertions |
| F5 | Division by zero in budgetAware | Added guard: `if (context.budgetLimitNanoAiu <= 0) return cheapest(...)` |

## Files Changed

- `packages/forge/src/models/strategy.ts`
- `packages/forge/src/models/token-budget.ts`
- `packages/forge/src/__tests__/models.test.ts`

## Test Impact

- `npm run build` — clean
- `npx vitest run` — 268/268 tests pass



### 2026-05-01: Telemetry Collector ↔ Bridge Event-Name Contract

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Contract + Telemetry  
**Status:** Implemented

Context: Persona review F4 caught that telemetry collectors checked for event type strings that never appear in the bridge's EVENT_MAP. Bridge maps SDK events to different vocabulary (	ool_use vs 	ool_call_started, etc.). Result: collectors silently received nothing in production.

**Key Decisions:**

#### ADR-TLM-001: Single source of truth for collector event interest
New exported COLLECTOR_BRIDGE_EVENTS const in packages/forge/src/telemetry/collectors.ts names every Cairn event type collectors react to.

#### ADR-TLM-002: Contract test enforces bridge alignment
New test packages/forge/src/__tests__/telemetry-bridge-contract.test.ts enumerates COLLECTOR_BRIDGE_EVENTS and asserts every value is in EVENT_MAP. CI fails fast if either side drifts.

#### ADR-TLM-003: F2 early-convergence semantics
convergedTurn set on FIRST occurrence of successful 	ool_result or plan_changed event. If neither fires, convergence stays at 1.0 (legitimate "no early progress" rather than phantom 0.30 floor).

#### ADR-TLM-004: F5 streaming quantiles via histogram sketch
Stored as optional drift.sketch on ExecutionProfile; backward compatible.

#### ADR-TLM-005: F6a per-signal means
New optional signals field on ExecutionProfile carries individual means for convergence, 	okenPressure, 	oolEntropy, contextBloat, promptStability.

**Impact:**
- Bridge owners: if you remove/rename a value in COLLECTOR_BRIDGE_EVENTS, contract test fails.
- Prescriber authors: ExecutionProfile.signals populated; targeting specific signals now mechanical.
- Persisted-profile readers: drift.sketch and signals optional; old rows keep working.
- Sink consumers: LocalDBOMSink now exposes droppedCount.

---

### 2026-05-01: Persona Review Fixes — Prescribers + Applier (F3, F6b, F9, F10)

**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-01  
**Type:** Implementation  
**Status:** Implemented

Four findings from Phase 4.5 persona review.

**Key Decisions:**

#### ADR-PSC-001: tuneParameters gains context argument
Third arg context: TuneContext carries udgetLimitNanoAiu. Defaults to DEFAULT_BUDGET_LIMIT_NANO_AIU = 1_000_000 so existing call-sites don't break. 	okenPressure normalized to [0,1] against this limit.

#### ADR-PSC-002: Prescribers consume signal-level entropy
Prescribers use profile.signals.toolEntropy (Roger's new field) for tool-guidance trigger, with fallback to drift.p95 for legacy profiles. Composite drift never masquerades as single-signal threshold.

#### ADR-PSC-003: Shared buildSnapshot utility
uildSnapshot lives in packages/forge/src/prescribers/utils.ts, sources driftLevel from classifyDriftLevel(). Single source of truth for GREEN/YELLOW/RED boundaries.

#### ADR-PSC-004: Adaptive exploration budget
GREEN → * 0.9 (decay), RED → * 1.1 (grow), YELLOW → hold. Hard floor EXPLORATION_FLOOR = 0.15, ceiling 1.0.

**Cross-team implications:**
- Roger: Aggregator writes profile.signals from metadata.signals on drift samples.
- 	uneParameters third arg optional; no caller updates required.
- Pre-existing gap: packages/forge/src/telemetry/collectors.ts missing on disk; 15 tests fail (outside this scope).

**Verification:** prescribers-applier.test.ts 36/36 pass (+8 new tests). Forge suite 514/529; 15 failures pre-date this work.

---

### 2026-05-02: Phase 4.5 Persona Review — All 11 Findings Fixed

**Author:** Scribe (Session Log)  
**Date:** 2026-05-02  
**Type:** Meta  
**Status:** Complete

Phase 4.5 persona review findings consolidated and resolved across three team members:

- **Roger (Platform Dev):** F1 (weighted means), F2 (convergence), F4 (contract), F5 (sketch), F6a (signals), F7 (sink warn), F11 (typeof). +24 tests → 534 Forge tests.
- **Rosella (Plugin Dev):** F3 (budgetContext), F6b (prescriber entropy), F9 (buildSnapshot), F10 (adaptive budget). +8 tests → 478 Cairn tests.
- **Alexander (SDK Dev):** F8 (granularityKey in FeedbackSource).

**Result:** 1,012 total tests passing (Forge 534 + Cairn 478), up from 990 pre-review. Build clean. All persona review findings hardened and deployed.

---

# Phase 4.6 — Cycle 1 Triage (Code Panel Findings)

**Lead:** Graham (Architect)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Trigger:** 15-finding Code Panel review, Aaron selected squad-mode autonomous triage.

---

## Architectural Decisions

### ADR-P4.6-004: Edit migration 012 in place (Finding #4)

**Decision:** Edit migration 012 to add `UNIQUE(hint_id)` — do NOT create migration 013.

**Rationale:** Migration immutability is a *production safety* convention. Phase 4.6 lives
on a feature branch with no production data and no downstream consumers of the migration
sequence. Adding a 013 that only exists to patch a 012 that never shipped creates dead
weight in the migration history. The sweep should also switch to `INSERT OR IGNORE` to
rely on the constraint rather than the read-check-then-write pattern.

**Trade-off named:** If another branch concurrently builds on migration 012, this edit
creates a merge conflict. Risk is low — Phase 4.6 is the only active consumer.

**Alternative rejected:** Migration 013 (immutability convention). Convention exists to
protect deployed schemas; pre-ship, it's ceremony without safety benefit.

---

### ADR-P4.6-005: Mirror ChangeVectorSummary with regression test (Finding #7)

**Decision:** Do NOT promote `ChangeVectorSummary` to `@akubly/types`. Mirror the type
in both packages and add a regression test that asserts structural compatibility.

**Rationale:** Same pattern as ADR-P4.6-003 (drift weight mirroring). `OptimizationCategory`
is a prescriber-internal concept — promoting it to the shared types package couples that
package to prescriber domain semantics. The regression test (Laura's L5 suite) already
validates shape; extend it to assert that all category values returned by
`summarizeChangeVectors` are valid `OptimizationCategory` members.

**Cost lands in:** Phase 4.6 (test addition). Promotion to `@akubly/types` deferred to
Phase 5 if a third consumer emerges.

**Trade-off named:** Duck-typing can drift silently between releases if the regression test
is skipped. Mitigation: test runs in CI on every PR.

**Alternative rejected:** Promote to `@akubly/types` now — premature coupling for a
single cross-package consumer.

---

### ADR-P4.6-006: Ship primitives only; defer runtime wiring (Finding #9)

**Decision:** Ship Phase 4.6 as "primitives only." The Curator sweep, CRUD layer,
`computeNetImpact`, `summarizeChangeVectors`, and prescriber ranking integration are
independently testable and correct. Runtime wiring (connecting Curator output to
prescriber input in the live loop) is deferred to a tracked follow-up issue.

**Rationale:** Phase 4.6 scope was always the computation and ranking primitives.
Wiring requires runtime orchestration changes (Curator → prescriber pipeline in the
session lifecycle) that expand scope, risk, and review surface significantly. The
primitives are the hard part; wiring is mechanical once the contract is stable.

**Trade-off named:** Phase 4.6 code is dormant at runtime until wiring lands. Tests
prove correctness, but no production validation until the follow-up ships.

**Follow-up issue:**
- **Title:** `Wire Curator change vectors to prescriber historicalVectors at runtime`
- **Body:** Phase 4.6 (ADR-P4.6-006) shipped computation primitives and prescriber
  ranking support, but no production caller passes `historicalVectors` to
  `analyzePromptOptimizations` / `analyzeTokenOptimizations`. The Curator sweep
  computes vectors and `summarizeChangeVectors` aggregates them, but nothing in the
  runtime session lifecycle queries summaries and feeds them to prescribers.
  Scope: add the orchestration glue in the Curator's periodic sweep or a new
  runtime hook that queries summaries and passes them to prescriber invocations.
  Depends on: Phase 4.6 merged.

---

## Per-Finding Triage

| # | Sev | Disposition | Fix Agent | Notes |
|---|-----|------------|-----------|-------|
| 1 | 🔴 | **ACCEPT** | Rosella | `deltaCost` uses cumulative `token_total_cost` (monotonic). Normalize to per-session cost before computing delta. Curator.ts is Alexander's code → Rosella fixes per lockout. |
| 2 | 🟡 | **ACCEPT** | Alexander (utils.ts) + Rosella (changeVectors.ts) | Confidence cliff: `vectorCount=1, minVectors=3` → boost 0.5, which *halves* confidence. Contradicts Wave 1 "positive boost only" policy. Fix: clamp to `Math.max(1.0, log(…)/log(…))` so vectors only amplify, never attenuate. Split across packages per lockout. |
| 3 | 🟡 | **ACCEPT** | Rosella | `sessionsObserved` stores cumulative `session_count` but migration comment says "between before/after." The proxy was a deliberate decision (see decisions.md §Sessions-Observed Proxy), but column docs are misleading. Fix: update column comment in migration 012 (being edited per ADR-P4.6-004 anyway) to say "cumulative session count at vector computation time." |
| 4 | 🟡 | **ACCEPT** | Rosella | Add `UNIQUE(hint_id)` to migration 012 per ADR-P4.6-004. Switch sweep to `INSERT OR IGNORE`. Both are Alexander's code → Rosella per lockout. |
| 5 | 🟡 | **ACCEPT** | Alexander | Sort bug: unmatched hints (predictedImpact undefined → 0) outrank matched hints with negative impact. Fix: partition matched/unmatched; sort matched by predictedImpact desc; append unmatched in original impactScore order. Both optimizers are Rosella's → Alexander per lockout. |
| 6 | 🟡 | **ACCEPT** | Rosella | `sweepChangeVectors` returns a single counter conflating 4 skip reasons. Add structured diagnostic: `{ eligible, skippedInsufficientSessions, skippedMalformed, alreadyComputed, computed }`. Curator.ts is Alexander's → Rosella per lockout. |
| 7 | 🟡 | **ACCEPT** | Laura | Per ADR-P4.6-005: add regression test asserting Cairn's `ChangeVectorSummary.category` values are valid `OptimizationCategory` members. Laura owns tests; lockout N/A. |
| 8 | 🟡 | **ACCEPT** | Alexander | `ChangeVectorSummary` missing from `@akubly/forge` root barrel re-export. Add to the prescribers re-export block in `forge/src/index.ts`. Adjacent to Rosella's module → Alexander per lockout. |
| 9 | 🟡 | **DEFER** | — | Per ADR-P4.6-006: ship primitives only. Follow-up issue: "Wire Curator change vectors to prescriber historicalVectors at runtime." |
| 10 | ⚪ | **ACCEPT** | Rosella | `computeNetImpact` inline negations are fragile. Extract named contributions: `const driftContrib = -deltaDrift * weights.deltaDrift;` etc. changeVectors.ts is Alexander's → Rosella per lockout. |
| 11 | ⚪ | **REJECT** | — | ADR-P4.6-002 explicitly chose the optional positional parameter over a config/options object. Finding contradicts an existing architectural decision. If the pattern proves painful at more call sites, revisit in Phase 5. |
| 12 | ⚪ | **DEFER** | — | DB injection style (explicit `db` param vs `getDb()`) is a repo-wide convention question, not Phase 4.6 scope. Follow-up issue: "Standardize DB access pattern: explicit injection vs internal getDb()." |
| 13 | ⚪ | **ACCEPT** | Laura | Describe block says "cross-module weight consistency" but test only validates local `DRIFT_WEIGHTS`. Rename to reflect actual scope; `it.todo` already marks the cross-module aspiration. Laura owns tests; lockout N/A. |
| 14 | ⚪ | **ACCEPT** | Alexander | `computeConfidenceBoost` re-exported publicly from `prescribers/index.ts` but it's an internal helper (Cairn mirrors the formula, can't import). Drop from public re-export. prescribers/index.ts is Rosella's → Alexander per lockout. |
| 15 | ⚪ | **ACCEPT** | Alexander (forge) + Rosella (cairn) | Four sites use `?? 3` for minSessions default. Extract `DEFAULT_MIN_SESSIONS = 3` constant. Rosella defines it in cairn's changeVectors.ts (Alexander's code → lockout). Alexander updates forge's utils.ts + optimizers (Rosella's code → lockout). |

---

## Summary

- **Accepted:** 12 findings
- **Rejected:** 1 (finding #11 — contradicts ADR-P4.6-002)
- **Deferred:** 2 (findings #9 and #12 — follow-up issues)
- **Escalated:** 0

### Agent Dispatch

| Agent | Finding #s | Count |
|-------|-----------|-------|
| Rosella | 1, 2 (changeVectors.ts), 3, 4, 6, 10, 15 (cairn) | 7 |
| Alexander | 2 (utils.ts), 5, 8, 14, 15 (forge) | 5 |
| Laura | 7, 13 | 2 |

### Cycle 2 Concerns

1. **Rosella's load is heavy** (7 items). Findings 1, 3, 4 all touch curator.ts — they
   should be batched in a single pass to avoid merge churn. Finding 4 (migration edit)
   and finding 3 (column comment) are the same file change.
2. **Finding #1 is the only blocker.** Rosella should prioritize it. The deltaCost bug
   produces materially wrong net_impact values that cascade into ranking.
3. **Finding #2 (confidence clamp) touches both packages.** Alexander and Rosella must
   coordinate — the formula change should be identical in both locations.
4. **Finding #15 (constant extraction) is low-risk but cross-package.** Can be done last.

---

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

---

# Decision: MetricSnapshot.sessionCount is optional (not required)

**Author:** Rosella (Plugin Dev)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Context:** Phase 4.6 cycle 2, Finding #1 — deltaCost normalization requires sessionCount in MetricSnapshot.

---

## Decision

`MetricSnapshot.sessionCount` is declared as **optional** (`sessionCount?: number`) rather than required.

## Rationale

1. **Backward compatibility with stored JSON.** `MetricSnapshot` is serialized to `optimization_hints.metric_snapshot` (a JSON column). Hints created before Phase 4.6 cycle 2 will not have `sessionCount` in their stored JSON. Making the field required would silently cause `undefined` at runtime for those rows — worse than a `?? 0` fallback.

2. **Test fixture compatibility.** Laura's test fixtures (`feedback-loop.test.ts`, `prescribers-applier.test.ts`) use inline `metricSnapshot` objects built before this field existed. Making the field required broke the build (2 TS errors). Optional avoids forcing Laura to update fixtures just to unblock the build, while letting her add `sessionCount` values in her cycle-2 test updates naturally.

3. **Safe fallback exists.** `sweepChangeVectors` in curator.ts already handles missing `sessionCount` via `snapshot.sessionCount ?? 0`. When sessionCount is absent, the cost delta falls back to `tokenCostNanoAiu` (raw cumulative, no per-session normalization) — identical to pre-cycle-2 behavior. This is a graceful degradation, not a correctness cliff.

4. **`buildSnapshot()` always populates it.** New hints created after this cycle will always have `sessionCount`, so the fallback only fires for historical data.

## Alternative Rejected

Making `sessionCount: number` required (which was the initial implementation). This caused 2 TypeScript compilation errors in test files owned by Laura. Forcing her to update fixtures just to accommodate my type change violates the "each agent owns their scope" principle and would serialize our parallel work.

## Trade-off

The optional field means the type doesn't enforce the invariant at compile time. Mitigation: `buildSnapshot()` is the only factory for `MetricSnapshot` in production paths, and it always sets `sessionCount`. The `?? 0` fallback is documented in the type JSDoc.


# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Decision filed  
**Related to:** Phase 4.6 Wave 2 — Wiring Curator change vectors → prescriber `historicalVectors`

---

## Problem

Wave 1 ships with two disconnected halves:
- **Producer:** Curator computes `summarizeChangeVectors()` but doesn't expose it to callers
- **Consumer:** Prescribers accept optional `historicalVectors?: ChangeVectorSummary[]` but nothing passes them

**Missing:** An orchestration adapter that queries Cairn and injects vectors into Forge prescriber calls, while respecting "Forge never imports Cairn" acyclic dependency constraint.

---

## Decision: `ChangeVectorProvider` Port + Cairn Adapter

Define a new interface in `@akubly/types`:

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): ChangeVectorSummary[];
}
```

Cairn implements `SqliteChangeVectorProvider: ChangeVectorProvider` with a single method that:
1. Queries change_vectors table by skill_id
2. Aggregates rows into `ChangeVectorSummary` objects
3. Returns the array

Forge receives the provider as an injected dependency. Prescriber call sites invoke `provider.getSummaries(skillId)` and pass the result to `historicalVectors`.

---

## Alternatives Considered

### Option A: Direct DB query in applier/prescriber call site

The caller imports `summarizeChangeVectors` from Cairn and calls it inline.

| Pro | Con |
|-----|-----|
| Simplest. No new abstractions. | **Violates "Forge never imports Cairn" constraint.** Tightly couples. |
| Zero new code. | Cannot unit-test call site without real DB. |

**Verdict:** Ruled out — breaks acyclic dependency.

### Option B: Extend `FeedbackSource` with `getChangeVectorSummaries` method

Couple vectors to the existing feedback interface.

| Pro | Con |
|-----|-----|
| No new interface. | **Conflates two concerns.** Vectors are observations; feedback is input signal. |
| Single dependency injection. | Less composable for Phase 5 (cloud vectors) without touching FeedbackSource. |

**Verdict:** Ruled out — poor separation of concerns.

---

## Why This Option

- **Acyclic dependency:** Respects "Forge never imports Cairn." Provider is abstracted in types.
- **Established pattern:** Mirrors `FeedbackSource` injection pattern already used.
- **Independent evolution:** Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`.
- **Type promotion:** `ChangeVectorSummary` moves from being dual-copied (guarded only by Laura's test) to a single definition in `@akubly/types`.
- **Small contract surface:** One type + one method interface.

---

## Trade-off Named

Slightly more wiring than extending `FeedbackSource` (adding a new interface, new adapter), but the architectural return is worth it: better separation of concerns and independently evolvable subsystems for future phases.

---

## Implementation Ownership

- **@akubly/types:** Alexander defines `ChangeVectorProvider` interface + promotes `ChangeVectorSummary` type
- **Cairn:** Alexander/Roger implement `SqliteChangeVectorProvider` adapter
- **Forge:** Rosella integrates provider injection + updates prescriber call sites
- **Tests:** Laura covers provider contract, prescriber integration with mocked provider


---

# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port + PrescriberOrchestrator Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2

---

## ChangeVectorProvider

**Decision:** Use a `ChangeVectorProvider` interface in `@akubly/types` with a Cairn-side `SqliteChangeVectorProvider` adapter.

**Alternatives considered:**
1. Direct DB query in applier (violates "Forge never imports Cairn")
2. Extend `FeedbackSource` with `getChangeVectorSummaries` method (couples prediction concern to observation concern; less composable for Phase 5 cloud vectors)

**Why this option:**
- Follows the established injection pattern (`FeedbackSource` precedent)
- Respects acyclic dependency constraint
- Independently evolvable — Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`
- `ChangeVectorSummary` type promoted to `@akubly/types` eliminates the dual-copy maintenance burden
- Small contract surface: one type + one single-method interface

## PrescriberOrchestrator

**Decision:** Add a `PrescriberOrchestrator` interface in `@akubly/types`. Forge implements it (wraps both prescribers). Cairn's Curator calls it via injection after the vector sweep.

**Alternatives considered:**
1. Cairn imports Forge prescribers directly (violates acyclic dep constraint)
2. Forge-only manual invocation, defer Cairn-side (contradicts Phase 4.5 spec §ADR-P4.5-006 which designates Cairn as the autonomous trigger path)

**Why this option:**
- The Phase 4.5 spec explicitly designed two trigger paths: manual in Forge, Curator-driven in Cairn. The Curator is the primary production invocation path.
- Prescribers are pure functions in Forge. Cairn needs to call them but can't import Forge. A port resolves this cleanly — same pattern as `FeedbackSource` and `ExportQualityGate`.
- Single-method interface, minimal surface.

## Negative-Impact Attenuation

**Decision:** Implement attenuation in Wave 2 (not defer). When `meanNetImpact < 0`, `confidenceBoost` drops below 1.0 (clamped to ≥ 0.3). Without this, wiring would allow auto-apply of historically harmful prescriptions.

**Trade-off named:** Adds ~5 lines of logic + 4 tests across two packages. Small scope increase for eliminating a known-bad production behavior.

---

# ADR: Wave 2 v3 — Wiring Shape + Scope Split + Safety Gates

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-21  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2 v3 (revision of 2026-05-20 ADR, incorporates duck critique and scope refinement)

---

## ChangeVectorProvider Port

**Decision:** `ChangeVectorProvider` interface in `@akubly/types` with async return type (`Promise<ChangeVectorSummary[]>`). Cairn implements via `SqliteChangeVectorProvider`.

**Reasoning:** Same as v1 (follows FeedbackSource pattern, respects acyclic deps). v3 adds `Promise` return type for Phase 5 readiness — avoids interface churn when cloud providers land.

## Wave 2/3 Split

**Decision:** Wave 2 = data plumbing + manual invocation via top-level composition script. Wave 3 = Curator-driven automatic orchestration.

**Reasoning:** `curate()` is a module-level function in Cairn with no injection points, called from Cairn-only entrypoints (hooks, MCP). Injecting a Forge-implemented orchestrator requires a composition root that imports both packages. No such root exists today. Creating one is a package boundary decision that deserves its own ADR, not a wiring detail buried in Wave 2.

**Trade-off named:** Wave 2 only delivers manual invocation. The autonomous Curator path (primary production trigger per Phase 4.5 spec) is deferred. But the hard parts (type promotion, safety gates, provider adapter) ship in Wave 2; Wave 3 is pure wiring once composition ownership is decided.

## Hint Deduplication

**Decision:** `(skillId, source, category)` dedup key with active-status filter (`pending`, `accepted`, `deferred`). Skip insertion if match exists. No upsert — preserves audit trail.

**Reasoning:** Prescribers generate fresh UUIDs every invocation. Without dedup, repeated runs create unbounded duplicate hints. The existing Cairn prescriber uses `hasActivePrescription(insightId)` for the same purpose. Same pattern, different key.

## Negative-Impact Attenuation

**Decision:** Two-layer defense:
1. Confidence scaling: `confidenceBoost = max(0.1, 1.0 + meanNetImpact)` when mature evidence + negative impact. Sparse evidence: no attenuation (boost stays 1.0).
2. Eligibility flag: `autoApplyEligible = false` when `meanNetImpact < -0.2` and `vectorCount >= minVectors`.

**Reasoning:** Confidence scaling alone with a floor of 0.3 (v2) could still pass permissive auto-apply thresholds. The `autoApplyEligible` flag is defense-in-depth — the applier checks it independently of confidence math. Strongly negative categories cannot auto-apply regardless of threshold configuration.



---

# ADR: Wave 2 Wiring Shape — ChangeVectorProvider + Safety Gates

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-05 (v3.1)
**Status:** Proposed
**Scope:** Phase 4.6 Wave 2

## Context

Wave 1 shipped change-vector computation (Cairn) and prescriber ranking (Forge) as independent primitives. No runtime code connects them. Wave 2 wires them together.

## Decisions

### 1. Wiring Shape: ChangeVectorProvider Port

`ChangeVectorProvider` interface in `@akubly/types` with async `getSummaries(skillId): Promise<ChangeVectorSummary[]>`. Cairn implements (`SqliteChangeVectorProvider`). Forge consumes via parameter injection. Follows `FeedbackSource` precedent.

### 2. Wave 2/3 Split

**Wave 2:** Data plumbing, safety gates, manual CLI invocation (`scripts/optimize-skill.ts`).
**Wave 3:** Composition root ADR, Curator integration, MCP tool exposure.

**Rationale:** No composition root today imports both packages. Creating one is a package boundary decision requiring its own ADR, not a "wiring detail."

### 3. Hint Dedup Policy

Key: `(skillId, source, category)` with active-status filter (`pending`, `accepted`, `deferred`). Skip insertion when active hint exists for same key. Follows `hasActivePrescription` precedent.

### 4. Two-Layer Attenuation

**Layer 1 — Confidence scaling:** `confidenceBoost = max(ATTENUATION_FLOOR, 1.0 + meanNetImpact)` when negative + mature evidence. `ATTENUATION_FLOOR = 0.1`.

**Layer 2 — Auto-apply gate:** `autoApplyEligible = false` when `meanNetImpact < NEGATIVE_IMPACT_AUTO_APPLY_GATE` (-0.2) + mature evidence. Defense-in-depth — even if confidence thresholds are reconfigured, strongly negative categories can't auto-apply.

### 5. autoApplyEligible Propagation

Full path: `ChangeVectorSummary` (computed at summary time) → prescriber copies onto `OptimizationHint` field → persisted in `evidence` JSON blob → applier checks `hint.autoApplyEligible === false` before auto-apply.

`OptimizationHint` gains `autoApplyEligible?: boolean` (optional, backward-compatible). Absent/undefined treated as `true`.

### 6. Named Constants

- `NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2` — in `@akubly/types`, next to `ChangeVectorSummary`
- `ATTENUATION_FLOOR = 0.1` — in both `forge/prescribers/utils.ts` and `cairn/db/changeVectors.ts`

`-0.2` chosen because it matches the drift tier boundary (GREEN < 0.2). A prescription that shifts metrics by one drift tier in the wrong direction is "noticeably harmful."

## Consequences

- `ChangeVectorSummary` promoted from two copies to `@akubly/types` (eliminates duplication risk)
- One new port interface + one constant exported from shared types
- No new cross-package dependencies (composition script lives at repo root)
- Wave 3 inherits clean primitives and only needs to solve composition ownership

# Squad Decisions

## Active Decisions


# Phase 4.6 Kickoff — Change Vector Learning

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-03  
**Status:** Kickoff — ready for team spawn  
**Branch:** `squad/phase4.6-change-vectors`

---

## 1. Branch Decision

**Decision:** New branch `squad/phase4.6-change-vectors` from `squad/phase4-export-pipeline`.

**Rationale:**
- Phase 4.5 is complete (1012 tests, review-hardened). Clean phase boundary.
- PR-per-phase pattern established in Phases 3, 4, 4.5.
- Keeps the diff reviewable — Phase 4.6 is ~200 LOC, but will have its own test surface.
- If Phase 4.6 needs to bake longer, it doesn't block Phase 4.5 merge to main.

**Alternative rejected:** Continue on current branch. Would blur the PR boundary and make rollback harder if change vectors need iteration.

---

## 2. Spec Clarifications (Resolved)

### 2.1 Migration 012 Placement

**Resolved:** `packages/cairn/src/db/migrations/012-change-vectors.ts`, registered in `schema.ts` (version 12). Follows exact pattern of migrations 010/011.

### 2.2 Where `change_vectors` Writes Happen

**Resolved:** New CRUD module `packages/cairn/src/db/changeVectors.ts` owns reads/writes. The **computation trigger** is the Curator sweep — when aggregating profiles, if a hint with status `'applied'` has a subsequent metric snapshot available (from a later execution_profile update), the Curator computes and inserts the change vector. This is NOT in the prescriber or applier — it's a post-hoc observation.

**Rationale:** The Curator already owns cursor-based aggregation sweeps. Adding vector computation to the sweep is O(applied_hints) per sweep, naturally rate-limited, and consistent with the "observe, don't block" principle.

### 2.3 `historicalVectors` Integration with Prescriber Signatures

**Resolved:** Add optional third parameter to both prescribers:

```typescript
// Before (Phase 4.5):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig): PrescriberResult

// After (Phase 4.6):
analyzePromptOptimizations(profile: ExecutionProfile, config?: PromptOptimizerConfig, historicalVectors?: ChangeVectorSummary[]): PrescriberResult
```

**Type definition** (in `prescribers/types.ts`):
```typescript
export interface ChangeVectorSummary {
  category: OptimizationCategory;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  confidence: number; // log-scaled boost
}
```

**Why optional param, not config:** Config is static per-invocation. Vectors are dynamic data queried per-skill. Semantic distinction matters for testability — tests can pass vectors directly without mocking a DB query.

### 2.4 "Before/After Metric Snapshots" — Concrete Meaning

**Resolved:**
- **Before:** `optimization_hints.metric_snapshot` JSON column (captured at hint generation time, already exists in migration 011).
- **After:** The `execution_profiles` row for the same `skill_id` at the time the Curator sweep runs (post-application).
- **Delta:** `after_value - before_value` for each of the 5 metric fields in `MetricSnapshot`.

No new "snapshot" table needed — the before is already stored, the after is the live profile.

### 2.5 Min `sessions_observed` Window

**Decision:** Configurable with sensible default.

```typescript
export interface ChangeVectorConfig {
  /** Minimum sessions between before/after to consider vector valid. Default: 3. */
  minSessionsObserved?: number;
}
```

**Rationale:** Fixed value is too rigid. A skill used 100x/day needs fewer sessions than one used 2x/week. Default 3 matches the prompt optimizer's `minSessions` canary threshold.

### 2.6 Net Impact Weighting

**Decision:** Same weights as drift score (from `telemetry/drift.ts`).

The roadmap spec explicitly states: `net_impact = Σ(delta_i × weight_i) // same weights as drift score`. This means:
- convergence: 0.30
- toolEntropy: 0.25 (maps to `delta_drift` since drift subsumes entropy)
- promptStability: 0.15
- cacheHit: 0.15
- cost: 0.15

**Import the weight constants** from `telemetry/drift.ts` rather than duplicating. Single source of truth.

---

## 3. Work Decomposition

### Wave 1 — Foundation (Alexander, parallel with Rosella type work)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| A1 | Alexander | Migration 012 | `012-change-vectors.ts` — CREATE TABLE + indices per roadmap §1.2 | — |
| A2 | Alexander | Schema registration | Import + register migration012 in `schema.ts`, version bump to 12 | A1 |
| A3 | Alexander | CRUD module | `packages/cairn/src/db/changeVectors.ts` — insert, getByHintId, getByCategory, computeNetImpact | A1 |
| A4 | Alexander | Curator integration | Add vector computation to Curator sweep: for each `applied` hint with sufficient post-application sessions, compute + insert vector | A3 |

### Wave 2 — Prescriber Enhancement (Rosella)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| R1 | Rosella | Types | `ChangeVectorSummary` interface in `prescribers/types.ts` | — |
| R2 | Rosella | Confidence scaling | `computeConfidenceBoost(vectorCount, minVectors)` utility in `prescribers/utils.ts` | R1 |
| R3 | Rosella | Prompt prescriber integration | Add `historicalVectors?` param to `analyzePromptOptimizations`, apply confidence boost + predicted impact ranking | R1, R2 |
| R4 | Rosella | Token prescriber integration | Same for `analyzeTokenOptimizations` | R1, R2 |
| R5 | Rosella | Weight import | Import drift weights from `telemetry/drift.ts` for `computeNetImpact` — ensure single source of truth | — |

### Wave 3 — Tests (Laura)

| # | Owner | Item | Description | Depends On |
|---|-------|------|-------------|------------|
| L1 | Laura | Migration tests | 012 applies cleanly, idempotent re-run, table/index existence | A1 |
| L2 | Laura | CRUD tests | Insert/query/net-impact-computation for changeVectors module | A3 |
| L3 | Laura | Prescriber integration tests | Both prescribers with/without historicalVectors — verify confidence boost, ranking changes, edge cases (empty vectors, single vector, negative impact) | R3, R4 |
| L4 | Laura | Curator vector computation test | End-to-end: applied hint → profile update → sweep → vector appears | A4 |
| L5 | Laura | Weight consistency test | Assert net_impact weights match drift score weights (regression guard) | R5 |

### Critical Path

```
A1 → A2 (trivial)
A1 → A3 → A4
R1 → R2 → R3/R4
A3 + R3/R4 → L3
A4 → L4
```

**Estimated scope:** ~200 LOC production, ~150 LOC tests, 15-20 new tests. 1-day sprint for the team.

---

## 4. ADRs for This Phase

### ADR-P4.6-001: Curator owns vector computation (not prescriber, not applier)

Vectors are post-hoc observations about prescription efficacy. The Curator already sweeps periodically. Adding computation here keeps the prescriber pure (stateless analysis) and the applier focused on writes.

**Alternative rejected:** Compute in the applier after applying a hint. Problem: the "after" snapshot isn't available yet at application time — you need subsequent sessions to measure the effect.

### ADR-P4.6-002: Optional parameter over config object for historicalVectors

Keeps the prescriber testable without mocking a database. Tests pass vectors directly. Production code queries them from CRUD and passes in.

**Alternative rejected:** Add `vectorSource: () => ChangeVectorSummary[]` to config. Over-abstracted for a single call site.

### ADR-P4.6-003: Same weights as drift score

Single source of truth for "what matters" (Determinism > Cost). No independent weight tuning for net impact — if drift weights change, net impact changes too. Avoids divergent optimization signals.

---

## 5. Open Questions for Aaron

1. **Vector TTL:** Should old change vectors expire? The roadmap doesn't specify. My recommendation: no TTL for now — vectors are small and historical accuracy improves with data. Revisit if table exceeds 10K rows.

2. **Negative vectors:** If a prescription made things worse (negative net_impact), should it influence future confidence negatively (reduce confidence below baseline)? My recommendation: yes — `confidence_boost = log(1 + vectors_count) / log(1 + min_vectors)` only handles positive correlation. We should also apply a penalty multiplier when `meanNetImpact < 0`. But this is an enhancement we can add in Wave 2 without blocking Wave 1.

---

## 6. Ready to Spawn

**Status: YES — ready to spawn.**

All ambiguities resolved. Work items are concrete. No blockers.


# Decision: Weight Constants in Cairn (ADR-P4.6-003 Implementation)

**Author:** Alexander (SDK/Runtime Dev)  
**Date:** 2026-05-03  
**Status:** Decided  
**Relates to:** ADR-P4.6-003 (same weights as drift score, single source of truth)

---

## Context

The `computeNetImpact` function in `packages/cairn/src/db/changeVectors.ts` requires the
same drift-signal weights used by `DRIFT_WEIGHTS` in `packages/forge/src/telemetry/drift.ts`.

ADR-P4.6-003 mandates a single source of truth: if drift weights change, net_impact must
change with them.

## Problem

Cairn cannot import from Forge. The dependency graph constraint is acyclic: Forge never
imports Cairn, and Cairn has no `@akubly/forge` dependency in its `package.json`. Adding
one would introduce a circular dependency (`@akubly/cairn` ← `@akubly/forge` ← ... ← back).

The kickoff doc §2.3/A3 explicitly acknowledged this risk and provided the fallback:
> "If there's a circular dep risk between cairn and forge, instead define the weight constants
> in cairn AND add a Laura-checked regression test (L5) confirming they match."

## Decision

**Mirror the constants in Cairn with explicit mapping documentation.**

`packages/cairn/src/db/changeVectors.ts` exports `CHANGE_VECTOR_WEIGHTS` with values
mirrored from `DRIFT_WEIGHTS`, with the delta-field → drift-signal mapping documented inline:

```typescript
export const CHANGE_VECTOR_WEIGHTS = Object.freeze({
  deltaDrift:        0.25,  // DRIFT_WEIGHTS.toolEntropy (drift subsumes entropy)
  deltaCost:         0.15,  // DRIFT_WEIGHTS.contextBloat (cost ↔ context utilization)
  deltaSuccessRate:  0.15,  // DRIFT_WEIGHTS.promptStability
  deltaConvergence:  0.30,  // DRIFT_WEIGHTS.convergence
  deltaCacheHit:     0.15,  // DRIFT_WEIGHTS.tokenPressure (cache ↔ token efficiency)
});
```

## Net-Impact Sign Convention

Deltas are stored as `after - before`. For lower-is-better metrics (drift, cost, convergence),
a negative delta = improvement. `computeNetImpact` negates these before weighting so that
**positive net_impact = prescription was beneficial**:

```
net_impact = -deltaDrift * 0.25
           + -deltaCost * 0.15
           + deltaSuccessRate * 0.15
           + -deltaConvergence * 0.30
           + deltaCacheHit * 0.15
```

This makes `meanNetImpact` in `ChangeVectorSummary` directly comparable: positive = good,
negative = prescription made things worse (Wave 2 penalty hook point).

## Rationale for Rejection of Alternatives

| Alternative | Rejection reason |
|-------------|-----------------|
| Import DRIFT_WEIGHTS from forge into cairn | Creates circular dep |
| Extract weights to `@akubly/types` | Adds coupling for no composability gain; types pkg is for shared types, not algorithmic constants |
| Pass weights as parameter to computeNetImpact | Over-abstracted; only one caller, weights are stable constants |

## Regression Guard

Laura's **L5 test** (`curatorVectors.test.ts` or dedicated file) must assert:
```typescript
// cairn CHANGE_VECTOR_WEIGHTS values match forge DRIFT_WEIGHTS values
expect(CHANGE_VECTOR_WEIGHTS.deltaConvergence).toBe(DRIFT_WEIGHTS.convergence);    // 0.30
expect(CHANGE_VECTOR_WEIGHTS.deltaDrift).toBe(DRIFT_WEIGHTS.toolEntropy);          // 0.25
expect(CHANGE_VECTOR_WEIGHTS.deltaSuccessRate).toBe(DRIFT_WEIGHTS.promptStability); // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCacheHit).toBe(DRIFT_WEIGHTS.tokenPressure);     // 0.15
expect(CHANGE_VECTOR_WEIGHTS.deltaCost).toBe(DRIFT_WEIGHTS.contextBloat);          // 0.15
```

This test imports from both packages from the monorepo root and will fail if either set
of constants drifts. It is the enforcement mechanism for ADR-P4.6-003.

## Sessions-Observed Proxy

A secondary decision: the Curator sweep uses `execution_profiles.session_count` as the
proxy for "sessions since hint applied". The `metric_snapshot` stored at hint-generation
time does not include session count (not in `MetricSnapshot`), so exact delta is not
available. Using total session count as the minimum guard (≥ minSessionsObserved = 3) is
conservative and safe: it means vectors are only computed once a skill has at least 3
sessions, which is the same threshold the prompt optimizer uses for canary decisions.
The `sessions_observed` field in the inserted row records the actual total session count
at computation time, giving downstream consumers full context.


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


# Defect Flag: `summarizeChangeVectors` confidence=0 inconsistency

**From:** Laura (Tester)  
**Date:** 2026-05-03  
**Phase:** 4.6 — Change Vector Learning  
**Severity:** Latent risk (not a production path today)  
**Assigned to:** Team (Graham to triage)

---

## Summary

`summarizeChangeVectors` returns `confidence: 0` when `vectorCount === 0`,
but `computeConfidenceBoost(0)` returns `1.0`. These two are inconsistent,
and the inconsistency can cause silent confidence zeroing if a zero-vector
summary is ever passed to a prescriber.

---

## Details

### `computeConfidenceBoost(n: number)` (forge, Rosella R1)

```ts
export function computeConfidenceBoost(vectorCount: number): number {
  // returns 1.0 when vectorCount === 0 (no evidence → no change)
  if (vectorCount === 0) return 1.0;
  // ...
}
```

Rosella's design intent: absence of evidence = neutral (multiply by 1.0,
no modification to existing confidence).

### `summarizeChangeVectors(...)` (cairn, Alexander A3)

```ts
if (rows.length === 0) {
  return { vectorCount: 0, meanNetImpact: 0, confidence: 0 };
}
```

Alexander's current behavior: absence of vectors → `confidence: 0`.

### The conflict

If a prescriber receives a summary with `confidence: 0` and applies the
confidence boost formula:

```ts
hint.confidence *= summary.confidence; // 0 → zeroes out all confidence
```

Every hint's confidence would be zeroed. This is **not a current production
path** — the prescribers currently only call `computeConfidenceBoost(summary.vectorCount)`,
not `hint.confidence *= summary.confidence`. But the inconsistency is a
latent trap for future developers.

---

## Expected behavior (my read)

When `vectorCount === 0`, `summarizeChangeVectors` should return
`confidence: 1.0` to match `computeConfidenceBoost(0)`.

OR: the field name should be changed to make the zero-default semantics
explicit (e.g., `rawConfidence` vs `boost`).

---

## Impact

- **Current production:** No impact. Prescribers call `computeConfidenceBoost(vectorCount)`,
  not `summary.confidence`.
- **Latent risk:** Any future code that does `hint.confidence *= summary.confidence`
  will silently zero confidence when there are no vectors.
- **Test coverage:** `changeVectors.test.ts` L2 has an `it.todo` for
  `'summarizeChangeVectors — confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)'`
  which documents this expected fix.

---

## Suggested resolution

Option A (minimal): Change `confidence: 0` to `confidence: 1.0` in the
zero-vector branch of `summarizeChangeVectors`.

Option B (clarifying): Rename the field to make the semantic explicit, and
document the "no vectors = no change" contract in JSDoc.

Option C (defer): Accept the inconsistency as intentional (zero confidence
= "we have no data, don't trust this hint") and update `computeConfidenceBoost`
to also return 0 for vectorCount=0. Then the prescriber logic becomes "if
confidence=0, skip the hint."

---

## Next action

Graham to decide between A/B/C in the next decision meeting. If Option A or
B is chosen, Alexander to patch `changeVectors.ts` and Laura to upgrade the
`it.todo` in `changeVectors.test.ts`.


# Verdict: `summarizeChangeVectors` confidence=0 inconsistency

**Author:** Graham Knight (Lead / Architect)
**Date:** 2026-05-03
**Phase:** 4.6 — Change Vector Learning
**Triggered by:** Laura's defect flag (`laura-phase4.6-summarize-confidence-zero.md`)
**Status:** DECIDED

---

## Verdict: B — Rename field to `confidenceBoost`

### Rationale

Aaron's analysis is correct and I'm adopting it. A confidence *level* and a
confidence *boost* occupy different mathematical spaces:

- **Level** ∈ [0, 1]: "how sure are we?" — 0 = no confidence, 1 = full confidence.
- **Boost** ∈ ℝ⁺ (multiplicative): "how much should we scale existing confidence?" — 1.0 = identity (no change), >1.0 = amplify, <1.0 = attenuate.

The field is named `confidence` but the JSDoc (my own kickoff doc, §2.3) says
"log-scaled boost" and `computeConfidenceBoost(0)` returns `1.0`. The field
name lies about what it contains. That is the root cause — Alexander's `0`
makes perfect sense *if* confidence is a level, and Rosella's `1.0` makes
perfect sense *if* confidence is a boost. Both implementations are internally
consistent; the bug is the ambiguous type definition.

Option A (patch value to 1.0) would fix the symptom but leave the misleading
name in place — the next developer who reads `confidence: number` will assume
level semantics and write `if (summary.confidence === 0)` instead of
`if (summary.confidenceBoost === 1.0)`.

Option C is rejected outright: returning 0 for zero vectors would zero out
every hint's confidence at cold start (no vectors yet), which defeats the
canary bootstrap from Phase 4.5. That's a functional regression, not a fix.

### New field name: `confidenceBoost`

Alternatives considered:

| Name | Pros | Cons | Decision |
|------|------|------|----------|
| `confidenceBoost` | Self-documenting, matches `computeConfidenceBoost()` function name | Slightly long | **Chosen** |
| `boostFactor` | Short | Generic — doesn't say *what* it boosts | Rejected |
| `vectorBoost` | Ties to source data | Doesn't communicate that it scales *confidence* | Rejected |

`confidenceBoost` wins because it mirrors the existing function name
`computeConfidenceBoost()` — one name, one concept, zero ambiguity.

---

## Files to change

| # | File | Change | Current owner |
|---|------|--------|---------------|
| 1 | `packages/forge/src/prescribers/types.ts` | `confidence` → `confidenceBoost` in `ChangeVectorSummary`; update JSDoc | Rosella (R1) |
| 2 | `packages/cairn/src/db/changeVectors.ts` | `confidence` → `confidenceBoost` in local `ChangeVectorSummary` + `summarizeChangeVectors` return; fix zero-vector case from `0` → `1.0` | Alexander (A3) |
| 3 | `packages/forge/src/prescribers/promptOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R3) |
| 4 | `packages/forge/src/prescribers/tokenOptimizer.ts` | `summary.confidence` → `summary.confidenceBoost` | Rosella (R4) |
| 5 | Tests (multiple files) | Update all references to `.confidence` on `ChangeVectorSummary` objects | Laura (L2, L3) |

---

## Fix routing (Reviewer Rejection Protocol §lockout)

The lockout rule: the author of the buggy code may NOT be the one to fix it.
A different agent must make the correction.

| Code to fix | Written by | Fixed by | Rationale |
|-------------|-----------|----------|-----------|
| `packages/cairn/src/db/changeVectors.ts` — rename field + fix `0` → `1.0` | Alexander (A3) | **Rosella** | Alexander wrote the zero-default; lockout applies |
| `packages/forge/src/prescribers/types.ts` — rename field in interface | Rosella (R1) | **Alexander** | Rosella defined the type; lockout applies |
| `packages/forge/src/prescribers/promptOptimizer.ts` — update reference | Rosella (R3) | **Alexander** | Same author, same lockout |
| `packages/forge/src/prescribers/tokenOptimizer.ts` — update reference | Rosella (R4) | **Alexander** | Same author, same lockout |
| Tests (`changeVectors.test.ts`, `prescribers-vectors.test.ts`, etc.) | Laura | **Laura** | Test updates are Laura's domain regardless of lockout |

**Summary:**
- **Alexander** fixes: `types.ts`, `promptOptimizer.ts`, `tokenOptimizer.ts` (Rosella's code)
- **Rosella** fixes: `changeVectors.ts` (Alexander's code)
- **Laura** fixes: all affected test files

---

## ADR reference

This verdict extends ADR-P4.6-002 (§4 of kickoff doc): the `ChangeVectorSummary`
type's `confidenceBoost` field carries boost-multiplier semantics with identity
value 1.0. Prescribers apply it as `hint.confidence *= summary.confidenceBoost`.

---

## Verification criteria

1. `computeConfidenceBoost(0)` returns `1.0` ✓ (already correct, no change needed)
2. `summarizeChangeVectors(db, cat, skill)` returns `confidenceBoost: 1.0` when vectorCount === 0
3. No remaining references to `summary.confidence` in prescriber or CRUD code
4. All existing tests pass after rename
5. Laura's `it.todo` for "confidence behavior with vectorCount 0 matches computeConfidenceBoost(0)" is upgraded to a passing test



### 2026-05-01: Phase 4 Export Pipeline Architecture

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 introduces the Export Pipeline — the third integration seam from the Forge build kickoff. It converts persisted `CairnBridgeEvent`s into certified SKILL.md files with DBOM provenance in YAML frontmatter.

**Key Decisions:**

#### ADR-P4-001: Fixed pure-function pipeline (not plugin architecture)
Four stages: Extract → Strip → Attach → QualityGate. Pure functions composed by `runExportPipeline()`. Dynamic stage registration rejected as YAGNI.

#### ADR-P4-002: Quality gate as injected function
`ExportQualityGate` is a function type in Forge. Cairn satisfies it at the call site. Consistent with `createModelCatalog(listFn)` pattern. Forge never imports Cairn.

#### ADR-P4-003: DBOM upsert (replace) semantics
One DBOM per session. Re-export replaces. Versioned history rejected — no current consumer.

#### ADR-P4-004: Soft quality gate failure
Gate failure returns `success: false` with the compiled skill still included. Caller decides write policy. DBOM persistence failures are fail-open.

#### ADR-P4-005: No new shared types
All Phase 4 types stay package-internal. Continues ADR-P3-004 precedent.

**Impact:**
- **New files:** `packages/forge/src/export/` (5 files), `packages/cairn/src/db/migrations/010-dbom-artifacts.ts`, `packages/cairn/src/db/dbomArtifacts.ts`
- **Modified files:** `packages/cairn/src/db/schema.ts` (register migration), `packages/forge/src/index.ts` (barrel update)
- **Tests:** 99 total (62 contract + 37 production)

**Specification:** Full spec at `docs/forge-phase4-spec.md`.

---

### 2026-05-01: Export Pipeline — Function Types over Shared Interfaces

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Architecture  
**Status:** Implemented

Phase 4 export pipeline needs a quality gate that runs Cairn's linter/validator on compiled SKILL.md content. Forge must never import @akubly/cairn directly (acyclic dependency graph constraint).

**Decision:**
Quality gate is a simple function type `(skillContent: string) => QualityGateResult` defined in `forge/export/types.ts`. The caller (Cairn MCP tool or CLI) wires Cairn's functions into this shape. No shared interface in `@akubly/types`.

All Phase 4 types (`ExportDiagnostic`, `QualityGateResult`, `CompiledSkill`, `SkillFrontmatterInput`, `StageContext`, pipeline config/result types) stay package-internal in forge.

**Rationale:**
- Only one call site needs this contract — a shared interface in @akubly/types adds coupling for no composability gain.
- Function types are the simplest contract. If the quality gate signature changes, only forge and the one wiring site update.
- Consistent with Phase 3 pattern (`createModelCatalog(listFn)`).
- No new shared types means zero risk of cross-package type churn.

**Impact:**
- 5 new files in `packages/forge/src/export/`
- 32 new unit tests, 99 total export tests
- Forge test count: 326 → 388

---

### 2026-05-01: Export Pipeline Quality Gate Semantics

**Author:** Laura (Tester)  
**Type:** Test Contract  
**Status:** Implemented  
**Date:** 2026-05-01 (updated from 2026-04-30)

Phase 4 export pipeline uses quality gates before emitting a compiled SKILL.md. Now aligned with `docs/forge-phase4-spec.md` §4.4, §4.5, §7.

**Decision (spec-aligned):**
- Quality gate is an injected `ExportQualityGate = (skillContent: string) => QualityGateResult`
- `QualityGateResult.passed === false` → `ExportPipelineResult.success = false`
- Quality gate failure is **fail-closed but soft**: compiled skill is still returned for inspection, `qualityGatePassed = false`
- DBOM persistence failure is **fail-open**: warning diagnostic, pipeline continues
- Gate results propagate: `lintErrors`, `lintWarnings`, `validationScore` flow to pipeline result
- If the quality gate function **throws**, spec §7.1 says catch + diagnostic. Current inline implementation propagates — Roger should add try/catch in production (implemented by Coordinator).

**Key Finding:**
`validateStage` did NOT catch exceptions from the injected quality gate. Spec §7.1 explicitly says "Catch + diagnostic" for this case. Test documents this gap — production `validateStage` must wrap the gate call in try/catch. **Coordinator fixed in production implementation.**

**Impact:**
- 62 contract tests + 37 production tests in `export.test.ts` (99 total)
- `ExportQualityGate` replaces the old `CairnToolkit` interface (simpler, one function vs five)
- Forge never imports `@akubly/cairn` — gate is wired at call site per §5.2
- All 99 tests passing (100%)

---

### 2026-04-30: Event Dedup Guard — bridgeAttached flag

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Defensive Correctness
**Status:** Implemented

ADR-P3-005 defines dual event paths: `SessionConfig.onEvent` captures events during `createSession()` (before `session.on()` is wired), and `session.on()` captures events after `ForgeSession` construction. Design reviewers independently flagged that if the SDK fires events via `onEvent` after `createSession` resolves — during the gap before `ForgeSession` wires `session.on()` — both paths would emit the same event, causing duplicate `CairnBridgeEvent`s. This corrupts `TokenTracker` accumulation and `DBOM` reconstruction.

Added a `bridgeAttached` boolean flag in `ForgeClient.createSession()`. The `onEvent` closure checks this flag and returns early if `true`. The flag is set immediately before `ForgeSession` construction (which wires `session.on()` in its constructor).

**Alternatives Considered:**
1. Hash-based dedup (eventId or type+timestamp LRU) — More robust against unknown overlap patterns, but adds complexity (LRU cache, hash computation) for a problem that has a clean temporal boundary. Rejected as over-engineering for a Technical Preview SDK.
2. No guard — Relies on SDK honoring the non-overlapping window contract. Rejected because the SDK has shipped 52 versions in 3 months — behavioral contracts are unstable.

**Impact:**
- `packages/forge/src/runtime/client.ts` — ~4 LOC added (flag declaration, check, set)
- `packages/forge/src/__tests__/runtime.test.ts` — 2 new tests (overlap prevention + pre-bridge capture confirmation)
- All 289 tests pass, zero regressions

---

### 2026-04-29: Mock Session Unsubscribe Semantics

**Author:** Laura (Tester)
**Type:** Test Infrastructure
**Status:** Observation

While writing L6 Token Tracker integration tests, the shared mock session's `on()` returns a no-op unsubscribe function. This works fine for ForgeSession's bridge wiring (which only uses unsubscribe at disconnect time, where the whole session is torn down), but breaks any test that needs to verify real unsubscribe behavior — the handler keeps firing after "unsubscribing."

For tests requiring real unsubscribe semantics, build a dedicated `EventSource` adapter with `Set<handler>`-based subscribe/unsubscribe rather than trying to enhance the mock session. The mock session is designed for ForgeSession/ForgeClient lifecycle testing; the EventSource interface is the correct abstraction for lower-level eventing tests.

**Impact:** No changes to shared helpers needed. This is a documented pattern for future test authors: when testing event unsubscription, build a standalone EventSource, don't use `createMockSession()`.

---

### 2026-04-29: HookComposer Uses Live Observer Set

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Architecture
**Status:** Implemented

HookComposer class holds a live `Set<HookObserver>`. The `compose()` method returns hooks that reference the live set, so add/remove after composition takes effect on the next hook invocation without re-registering with the SDK.

**Tradeoffs:**
- **Pro:** Dynamic observer management without SDK re-registration — critical for decision gates added/removed mid-session.
- **Pro:** Each `add()` returns a dispose function — clean RAII-style cleanup.
- **Con:** Slightly more complex than a pure function; the composed hooks capture `this`.
- **Accepted:** Complexity justified because Cairn's architecture requires dynamic gate registration.

**Affects:**
- `packages/forge/src/hooks/index.ts`
- Any future code that registers decision gates or telemetry observers mid-session

---

### 2026-04-28: Forge Test Infrastructure Pattern

**Author:** Roger Wilco (Platform Dev)
**Type:** Infrastructure
**Status:** Implemented

Forge test infrastructure uses SDK mocks rather than live CLI integration for all unit tests.

**Three Test Helper Modules:**
1. **mock-sdk** — `createMockSession()` / `createMockClient()` with `vi.fn()` stubs and `_emit()` for event dispatch testing.
2. **event-factory** — Type-safe `SessionEvent` builders for all 6 core event types.
3. **type-assertions** — Runtime shape validation for `CairnBridgeEvent` conformance.

**Rationale:**
- SDK requires running Copilot CLI process for real sessions — unit tests must be offline.
- Event factory ensures tests use correctly-typed SDK events without fragile manual construction.
- Type assertion helpers serve double duty: test validation now, production runtime guards later.

**Rule:** All Forge tests must import from `./helpers/index.js`. No test may instantiate `CopilotClient` or `CopilotSession` directly.

---

### 2026-04-28: Hook Composer Must Isolate Observer Errors

**Author:** Laura (Tester)
**Type:** Implementation Requirement
**Status:** Implemented

The production `composeHooks` implementation MUST wrap each observer call in try/catch, logging errors but continuing to the next observer.

**Context:**
Spike's `composeHooks` propagates errors — if one observer's `onPreToolUse` throws, subsequent observers never run. This is dangerous in production: a buggy telemetry observer would kill the decision gate observer, silently removing safety checks.

**Implementation:**
Each observer call wrapped in try/catch. Errors logged but don't prevent subsequent observers from running.

**Test Coverage:**
- `"one observer throwing does not kill others"` — verifies isolated behavior (passing)
- `"spike composeHooks propagates errors"` — documents the spike's known gap (baseline)

**Impact:**
Telemetry observers are now safe in production. Error in one observer cannot cascade to disable decision gates or other critical observers.

---

### 2026-04-28: Alexander — SDK Interface Types for Runtime Module

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Architecture  
**Status:** Implemented

ForgeClient and ForgeSession depend on thin interface types (`SDKClient`, `SDKSession`) rather than importing CopilotClient/CopilotSession classes directly.

**Rationale:**
1. **Testability** — Mock objects from the test helpers satisfy the interface without needing the real SDK classes (which require a running Copilot CLI process).
2. **SDK churn isolation** — If the SDK adds/removes methods, only the interface definitions need updating, not every consumer.
3. **Dependency inversion** — The runtime module is constructor-injected with an `SDKClient`, making it composable and mockable at every level.

**Tradeoffs:**
- **Pro:** Tests run offline, no SDK instantiation needed.
- **Pro:** SDK method additions don't break existing code until we choose to adopt them.
- **Con:** Must manually keep interfaces in sync with the SDK surface we actually use.
- **Accepted:** The interface surface is small (~5 methods on SDKClient, ~5 on SDKSession), so maintenance cost is negligible.

**Affects:**
- `packages/forge/src/runtime/client.ts` — `SDKClient` interface
- `packages/forge/src/runtime/session.ts` — `SDKSession` interface
- All test code that uses `createMockClient()` / `createMockSession()`

---

### 2026-05-01T18:14:00Z: Phase 4.5 Local Feedback Loop — Aaron's Scope Decisions

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-05-01T18:14:00Z  
**Type:** Direction / Scope  
**Status:** Active

Phase 4.5 brainstorm Round 2 follow-up captured six major decisions:

#### 1. Loop Trigger Model
- **Forge:** Feedback loop is deliberate (manual) — user-initiated review of prescriptions
- **Cairn:** Feedback loop is automatic — pattern detection triggers prescription generation

#### 2. Profile Granularity
All four levels are viable and serve different purposes:
- **Per-skill:** Improves artifacts directly
- **Per-user:** Surfaces human insights (Cairn's core mission)
- **Per-model:** Exploratory/feedback data for determining best model per task
- **Global:** Dashboard of overall trends ("proving our pudding")

#### 3. Cold Start Strategy
Canary bootstrap is the natural choice. Training sessions deferred to Phase 4.75.

#### 4. Ancestry Graph Optimization Exploration
- Track prescription ancestry (which changes caused which drift)
- Derive heuristics about what types of changes cause directional drift
- Long-term: graph math for intelligent exploration of metric space
- Detect local optima via convergence patterns
- When wild cards come online (self-annealing, genetic programming), use graph to introduce evolutions and escape local maxima

#### 5. Feedback Loop Frequency — Maximum Detail Preferred
Aaron's prior stance: "Why would we not want as much detail as possible?" The tradeoffs need to be articulated explicitly before any future pruning decisions.

#### 6. Wild Card Ideas
All six wild cards from brainstorm are approved as future backlog items:
1. Time-Travel Debugging (rewind state to any decision point, replay with different model/parameters)
2. Predictive Cache Warming (pre-fetch likely-needed artifacts before user requests)
3. Self-Annealing Prescriptions (feedback loop automatically re-ranks prescriptions)
4. Genetic Programming Ancestry (crossover + mutation of decision graphs)
5. Karpathy Wiki Integration (encode knowledge graph as executable wiki)
6. Adaptive Skill Ranking (vector-based skill retrieval with user feedback)

**Rationale:** Team decisions from Phase 4.5 brainstorm follow-up — captured for team memory. Cascades to Phase 4.5 implementation planning, Phase 5 canary configuration, and Phase 6+ feature backlog.

**Impact:**
- Ancestry tracking: 200 LOC MVP planned for Phase 4.5
- Caching strategy: 4-layer hierarchy (L1 in-memory → L2 session → L3 short-TTL → L4 long-TTL)
- Vector search: Deferred to Phase 4.75 (non-blocking)
- Graph storage: Recursive CTEs in SQLite for ancestry queries
- Max detail: Capture everything, filter on read (downstream filtering strategy)

---

### 2026-04-30T22:25:00Z: Phase 5 (PGO Telemetry) Deferred — Budget & Data Protection

**Author:** Aaron Kubly (via Copilot)  
**Date:** 2026-04-30T22:25:00Z  
**Type:** Scope / Risk  
**Status:** Active

Phase 5 (PGO Telemetry) is deferred as future work.

**Reasons:**
1. **Azure budget constraints** — Application Insights is expensive. Cost-benefit unclear until Phase 4.5 canary metrics available.
2. **Corporate data protection** — Requirements for emitting telemetry from work environments must be resolved before telemetry collection begins. Legal review pending.

**Timeline:** Revisit for Phase 4.75 (post-canary) if budget approved and compliance cleared.

**Impact:** Phase 5 planning deferred. Phase 4.5 canary proceeds without integrated telemetry pipeline; manual metrics collection via CLI query tools only.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---
### 2026-05-02: Phase 4.5 Architecture — Local Feedback Loop

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-02  
**Type:** Architecture  
**Status:** Proposed

Phase 4.5 introduces the Local Feedback Loop — a profile-guided optimization engine that runs entirely on local SQLite. Sessions produce telemetry → collectors aggregate signals → prescribers generate optimization hints → the applier writes improved SKILL.md v2 artifacts.

**Key Decisions:**

#### ADR-P4.5-001: Collectors as HookObservers, not a separate event bus
Telemetry collectors implement `HookObserver` and register via `ForgeSession.addObserver()`. No separate telemetry pipeline. Collectors see the same event stream as decision gates. O(1) per event, defer analysis to flush.

#### ADR-P4.5-002: Three tables, not one universal signal table
Separate `signal_samples`, `execution_profiles`, and `optimization_hints` tables. Each has different access patterns and indexes. Same reasoning as Phase 4's separate `dbom_artifacts`/`dbom_decisions`.

#### ADR-P4.5-003: TTL and row caps enforced by Curator, not DB triggers
7-day TTL and 10K row cap on `signal_samples` managed by Curator's existing sweep mechanism. Consistent with existing patterns, avoids synchronous trigger overhead on INSERT.

#### ADR-P4.5-004: Fixed drift weights, not learned
Drift signal weights are constants (convergence: 0.30, toolEntropy: 0.25, tokenPressure: 0.15, contextBloat: 0.15, promptStability: 0.15). Determinism signals get 70% total weight per Aaron's "Determinism > Token Cost" constraint.

#### ADR-P4.5-005: FeedbackSource as new shared type
`FeedbackSource` added to `@akubly/types`. First new shared type since Phase 2. Justified: both Forge (session start) and Cairn (Curator) consume this contract.

#### ADR-P4.5-006: Manual loop trigger in Forge, Curator-driven in Cairn
Forge caller controls `compute()` and `getSink()` invocation timing. Cairn's Curator drives feedback loops via session start + periodic checks. Manual in Forge (library control), autonomous in Cairn (always-on platform).

---

## Phase 4.5 Implementation Decisions (Session 2026-05-02T04:35:00Z)

### 2026-05-02: Phase 4.5 DB CRUD modules use the singleton `getDb()` pattern

**Author:** Alexander (SDK/Runtime Dev)
**Date:** 2026-05-02
**Type:** Convention
**Status:** Implemented

#### Context

The Phase 4.5 spec asked for three new CRUD modules in `packages/cairn/src/db/`
covering signal samples, execution profiles, and optimization hints. The task
brief suggested each module export pure functions accepting a
`Database.Database` parameter. Every existing CRUD module in `packages/cairn/src/db/`
(including the named reference, `dbomArtifacts.ts`) uses the singleton
`getDb()` pattern, and the test harness depends on it via
`beforeEach: closeDb(); getDb(':memory:')`.

#### Decision

The three new modules — `signalSamples.ts`, `executionProfiles.ts`,
`optimizationHints.ts` — call `getDb()` internally rather than accepting a
`Database.Database` argument. This matches every other CRUD module in the
package and lets the existing test harness work unmodified.

#### Rationale

- **Consistency** — Mixing two patterns in `packages/cairn/src/db/` would force
  every future contributor to ask which one applies.
- **Test reuse** — The `closeDb(); getDb(':memory:')` lifecycle is the package
  convention. New tests for these modules use it directly, no plumbing.
- **Reversibility** — If we ever need DI for cross-DB scenarios, refactoring
  the whole `db/` layer in one pass is cleaner than gradually drifting toward
  it module-by-module.

#### Impact

- 3 new CRUD modules + migration 011 + 40 new tests, all green.
- Existing tests asserting `schema_version` count/max (`db.test.ts`,
  `discovery.test.ts`, `prescriptions.test.ts`) bumped from 10 → 11.
- **Note for downstream consumers (Curator):** TTL sweep and row cap
  enforcement live on the Curator, not in the DB. `sweepSignalSamples(cutoffIso)`
  and `enforceSignalSampleCap(cap)` are the primitives to schedule.

---

### 2026-05-02: Phase 4.5 feedback-loop test strategy

**Author:** Laura (Tester)
**Date:** 2026-05-02
**Status:** Implemented

#### Context

Phase 4.5 ships a closed feedback loop: collectors → sink → aggregator →
prescribers → applier → (operator updates skill) → improved next cycle. The
loop is causally complete only when an operator actually edits a SKILL.md and
re-runs sessions. In tests, we cannot close that loop with real model calls.

#### Decision

Adopt **process-invariant testing** for the feedback loop, codified in
`feedback-loop.test.ts`:

1. **Convergence is asserted by *response curve*, not by terminal state.**
   We assert that hint count is monotone non-increasing as profile drift
   decreases across simulated cycles, and that the maximum impact score is
   likewise non-increasing. We do not assert "the system reaches GREEN" —
   that depends on the operator.

2. **The operator's effect is simulated at the profile level.** Each "next
   cycle" feeds the prescriber a profile whose drift mean is lower than the
   previous cycle's. We are testing the system's *response* to improving
   inputs, not the operator's quality.

3. **Efficiency bounds are intentionally generous.** Hot-path collectors are
   capped at 250ms / 10k events (vs. spec implication of ~25µs/event). Tight
   enough to catch O(N) regressions, loose enough to survive CI variability.

4. **Property-based tests use an in-file LCG, not fast-check.** Keeps the
   test suite zero-dep and reproducible. Coverage is sufficient for the
   small-dimensional invariants we care about (drift score bounds,
   classification monotonicity, aggregator commutativity).

#### Implications for Other Agents

- **Alexander / runtime:** if any collector implementation regresses to per-
  event O(N) (e.g., recomputing entropy from a growing list), the L5 tests
  will catch it before it ships.
- **Roger / sink:** the L2 integration test exercises `enqueueSample` at
  buffer-size 1 and 16 and asserts every sample reaches `persistSample`.
  Future sinks (e.g., AppInsightsSink) should pass the same shape of test.
- **Anyone touching the drift gate:** §11.4 metamorphic test pins the gate
  at >= 0.3 and probes 0.1 / 0.3 / 0.5. Moving the threshold requires
  updating that test in lockstep.

#### Alternatives Considered

- **Run real Copilot CLI sessions in CI:** rejected — too slow, too flaky,
  and would obscure regressions in the loop logic itself behind model noise.
- **Add fast-check for property tests:** rejected for now — current
  invariants are simple enough that an LCG suffices, and the dependency
  cost outweighs the marginal coverage gain.
- **Snapshot the applier output:** rejected — snapshots would lock in
  *artifacts* (hint text, counts) rather than *processes*. A snapshot would
  fire on every recommendation-string tweak.

---

### 2026-05-02: Promote ExecutionProfile / ProfileGranularity to @akubly/types alongside FeedbackSource

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-05-02
**Type:** Architecture
**Status:** Implemented (Phase 4.5)

#### Context

Spec §9.3 declares `FeedbackSource` as the first new shared type in
`@akubly/types` since Phase 2. The interface signature references
`ExecutionProfile`, `ProfileGranularity`, `OptimizationHint`, and
`StrategyParameters` — types the spec otherwise defines inside
`packages/forge/src/telemetry/` and `packages/forge/src/prescribers/`.

`@akubly/types` cannot depend on `@akubly/forge` (acyclic dependency graph,
ADR-P4-002), so `FeedbackSource` cannot literally use forge-private types.

#### Decision

Two of the four referenced types are now defined in `@akubly/types`:

- `ProfileGranularity` — string union, fully shared.
- `ExecutionProfile` — full structural definition (drift / tokens / outcomes
  blocks). `packages/forge/src/telemetry/types.ts` re-exports them so forge
  code retains a single import path.

The remaining two are defined as **open-shaped** interfaces in `@akubly/types`:

- `OptimizationHint` — required keys (`id`, `source`, `skillId`, `category`,
  `description`) plus `[key: string]: unknown` for prescriber-specific fields.
- `StrategyParameters` — pure `[key: string]: unknown` map.

Concrete prescribers extend these without forcing schema changes in
`@akubly/types`.

#### Rationale

- `ExecutionProfile` is genuinely shared: Cairn's curator and prescribers
  both need to read profiles produced by Forge. Putting it in `@akubly/types`
  matches its actual lifetime as a cross-package contract.
- Open-shaped `OptimizationHint` / `StrategyParameters` honour the
  ADR-P4-005 "minimum shared types" instinct. The required keys are the
  invariant identity (every hint has an id, source, skill, category,
  description); everything else varies by prescriber.
- This avoids two anti-patterns: (1) widening `FeedbackSource` to use
  `unknown` everywhere (kills compile-time safety), and (2) duplicating the
  hint/strategy schemas across packages (kills the contract).

#### Impact

- `packages/types/src/index.ts` — +5 exports (`ProfileGranularity`,
  `ExecutionProfile`, `OptimizationHint`, `StrategyParameters`,
  `FeedbackSource`). No removals, no breaking changes.
- Forge's `telemetry/types.ts` re-exports `ProfileGranularity` and
  `ExecutionProfile` so `import { ExecutionProfile } from "../telemetry/types.js"` keeps working.
- Tests: 826 baseline → 954 passing (forge 476 + cairn 478). Telemetry
  module contributes 56 of the new tests.

#### Follow-ups for the team

1. **Spec event-type mismatch (for Graham / wiring task):** spec §9.4 names
   `tool_call_started`, `usage_reported`, `turn_completed`,
   `session_completed`, `tool_call_failed`. The bridge `EVENT_MAP` uses
   `tool_use`, `model_call`, `turn_end`, `session_end`. The collectors are
   coded to the spec strings; wiring will need either a remapper at the
   collector boundary or an `EVENT_MAP` extension.
2. **Convergence formula (for Graham):** `convergedTurn / turnCount` is
   degenerate at typical session shapes (always 1.0 when `session_completed`
   arrives last). Worth a redesign before Phase 5 — perhaps
   `convergedTurn / expectedTurns` against a per-skill expected-turns
   parameter from `StrategyParameters`.

---

### 2026-05-02: Phase 4.5 Prescribers + Applier — Determinism Mechanisms

**Author:** Princess Rosella (Plugin Dev)
**Date:** 2026-05-02
**Type:** Architecture / Implementation
**Status:** Implemented (S1–S8)

#### Context

The Phase 4.5 spec (§3–§4) prescribes the prescriber → applier pipeline and
states the ordering rule "Determinism > Token Cost (Aaron's constraint)" as
prose. While implementing, I had to choose how strongly to encode that
constraint. Two options:

1. **Soft prioritization** — token optimizer always runs, but its hints carry
   lower impact scores than prompt-optimizer hints.
2. **Hard gate** — token optimizer returns an empty hint set entirely when
   drift is RED, regardless of cache/cost signals.

#### Decision

I chose **(2) hard gate**, exposed as ``TokenOptimizerConfig.driftGate``
(default ``0.3``). ``analyzeTokenOptimizations`` exits early with no hints when
``profile.drift.mean >= driftGate``. This matches the spec text at line 933
("Guard: Don't optimize tokens if drift is RED — fix determinism first") and
makes the constraint structurally enforced rather than score-balancing
dependent.

I also made the **applier order-stable**: sort key is
``(impactScore desc, id asc)``. Without the id tiebreaker, two hints with
identical impact scores could swap positions across runs depending on input
order, breaking SKILL.md compilation reproducibility.

#### Other team-relevant choices

- ``DEFAULT_STRATEGY_PARAMS`` is ``Object.freeze``-d. Cross-package consumers
  (Cairn, runtime, future loop-driver) cannot mutate it accidentally.
- ``EXPLORATION_FLOOR = 0.15`` is a module constant, not a config knob.
  Aaron's directive ("diminishing returns worth it when scaled across future
  of software engineering") means this is policy, not preference.
- ``ApplierConfig.now: () => Date`` is injectable for deterministic tests of
  ``frontmatterPatch.optimizationHints[].appliedAt``. The export pipeline can
  use this to thread its own clock if it ever needs to backdate patches.
- ``cacheableTools`` extraction reads from ``evidence.triggerMetrics`` keys
  prefixed with ``tool:`` and an optional ``evidence.cacheableTools`` array.
  Forward-compatible with telemetry adding tool-level signals — Roger and I
  should align on which path becomes canonical when the loop-driver lands.

#### Implications

- **Cairn / loop-driver:** When feeding hints back through the loop, expect
  zero token-optimization hints during RED drift periods — this is by design,
  not a bug. Test fixtures should not assume token hints are always present.
- **Export pipeline (Phase 4):** ``SkillFrontmatterPatch`` is the contract
  between applier and ``attachStage``. Adding new patch fields requires
  coordinated changes here.
- **Telemetry team (Roger):** ``ExecutionProfile`` shape is now relied upon
  by both telemetry and prescribers. Changes to drift/tokens/outcomes nesting
  will ripple into 27 prescriber tests.

#### Verification

- ``npm run build --workspace=@akubly/forge`` passes.
- 27 new tests in ``packages/forge/src/__tests__/prescribers-applier.test.ts``
  all pass (mechanism × determinism × metamorphic).
- 475/476 forge tests pass overall. The one unrelated failure
  (``telemetry-collectors.test.ts > classifies ... as GREEN``) is in
  Roger's collectors module and predates my work.
Forge is the development tool (human in loop). Cairn is autonomous (Curator decides). Shared analysis logic, two trigger paths.

#### ADR-P4.5-007: Determinism > Token Cost ordering
All prescriber priority, drift weights, and optimization ordering enforces determinism first. Token optimizer gates on drift level — won't prescribe if drift is RED. This is Aaron's design constraint, not a decision.

**Impact:**
- **New files:** `packages/forge/src/telemetry/` (6 files), `packages/forge/src/prescribers/` (4 files), `packages/forge/src/applier/` (3 files), `packages/cairn/src/db/migrations/011-telemetry-feedback.ts`, 3 new CRUD modules
- **Modified files:** `packages/cairn/src/db/schema.ts`, `packages/forge/src/index.ts`, `packages/types/src/index.ts` (FeedbackSource)
- **Estimated LOC:** ~1200 production + ~600-800 tests
- **Estimated tests:** 61-80

**Specification:**
- Full spec: `docs/forge-phase4.5-spec.md`
- Roadmap (4.6/5): `docs/forge-phase5-roadmap.md`
  title: 'List Prescriptions',
  description:
    'List improvement suggestions the Prescriber has generated from detected patterns. ' +
    'Filter by lifecycle status or see all. Each result includes confidence level in plain ' +
    'language and a hint about pending suggestions worth reviewing. ' +
    'Use this after completing a task to check for improvement opportunities.',
  inputSchema: {
    status: z.enum([
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    ]).optional()
      .describe('Filter by lifecycle status. Omit to return all statuses.'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results to return (default 10).'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `get_prescription`

```typescript
server.registerTool('get_prescription', {
  title: 'Get Prescription',
  description:
    'Get full detail about a specific improvement suggestion, including the pattern ' +
    'that triggered it, what Cairn observed, the suggested change, where it would be ' +
    'applied, and a diff preview. Use this to understand a suggestion before deciding.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription ID to retrieve.'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `resolve_prescription`

```typescript
server.registerTool('resolve_prescription', {
  title: 'Resolve Prescription',
  description:
    'Act on an improvement suggestion: accept (applies the change), reject (dismisses ' +
    'permanently), or defer (revisit later). Rejection is the simplest action — no reason ' +
    'required. Acceptance applies the change to a sidecar instruction file. ' +
    'Deferral sets a cooldown before the suggestion resurfaces.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription to act on.'),
    disposition: z.enum(['accept', 'reject', 'defer'])
      .describe('How to resolve: accept (apply change), reject (dismiss), defer (revisit later).'),
    reason: z.string().optional()
      .describe('Optional reason for rejection or deferral. Helps Cairn learn preferences.'),
  },
  annotations: { readOnlyHint: false },
}, handler);
```

#### New Tool: `show_growth`

```typescript
server.registerTool('show_growth', {
  title: 'Show Growth',
  description:
    'See a summary of patterns Cairn has helped resolve and overall improvement trends. ' +
    'Leads with wins — shows resolved patterns first, then active ones. ' +
    'Uses natural language, not percentages. Use this to reflect on progress.',
  annotations: { readOnlyHint: true },
}, handler);
```

#### Modified Tool: `run_curate` (DP1)

Updated description:
```typescript
description:
  'Trigger the curator to process unprocessed events and discover patterns. ' +
  'The curator scans the event stream for recurring errors, error sequences, ' +
  'and skip frequency, then creates or reinforces insights with prescriptions. ' +
  'Also generates new improvement suggestions when insights are created or reinforced. ' +
  'Returns the number of events processed, insights discovered, and any new suggestions. ' +
  'Use this when you want fresh analysis of recent activity.',
```

---

## Dependency Graph

```
7A ─────────────────────────────────────────────────┐
│                                                    │
├──→ 7B (Artifact Discovery) ──┬──→ 7D (Prescription Engine) ──┐
│                               │                                │
├──→ 7C (Infrastructure) ──────┤──→ 7E (Apply Engine) ──────────┤
│                               │                                │
└───────────────────────────────┘               7F (MCP + UX) ◄─┘
```

- **7A** has no dependencies (foundation)
- **7B, 7C** depend only on 7A (can run in parallel)
- **7D, 7E** depend on 7A + 7B (can run in parallel after 7B)
- **7F** depends on 7C + 7D + 7E (final integration phase)

**Critical path:** 7A → 7B → 7D → 7F  
**Parallel opportunities:** 7B ∥ 7C, then 7D ∥ 7E

---

## Execution Schedule

| Phase | Owner | Depends On | Parallel With | Est. New Tests |
|-------|-------|------------|---------------|----------------|
| 7A | Roger | — | — | ~25 |
| 7B | Rosella | 7A | 7C | ~20 |
| 7C | Gabriel | 7A | 7B | ~10 |
| 7D | Roger | 7A, 7B | 7E | ~25 |
| 7E | Rosella | 7A, 7B | 7D | ~15 |
| 7F | Roger + Valanice | 7C, 7D, 7E | — | ~20 |
| **Total** | | | | **~115** |

**Final test count target:** ~250 (134 existing + ~115 new)

---

## Acceptance Criteria

The Prescriber is complete when:

1. ✅ `run_curate` chains `prescribe()` automatically when insights change
2. ✅ `preToolUse` chains `prescribe()` at session start when insights change
3. ✅ `curate()` respects 3-second time budget
4. ✅ 8-state lifecycle enforced in DB and code
5. ✅ 4 new MCP tools registered and functional
6. ✅ Full 4-phase artifact scanner with 5-minute SQLite cache
7. ✅ All 10 UX principles verifiable in tool output
8. ✅ Sidecar instruction files written (not user-owned files modified)
9. ✅ managed_artifacts tracks all Prescriber-written files
10. ✅ Rollback capability functional
11. ✅ Drift detection via checksum comparison
12. ✅ 7 preference keys configurable
13. ✅ Deferral cooldown (3 sessions default)
14. ✅ Auto-suppression after 3 deferrals
15. ✅ Growth tracking via `show_growth`
16. ✅ All existing 134 tests still pass
17. ✅ ~115 new tests pass
18. ✅ Clean build, clean lint
19. ✅ Dogfooded: Aaron has accepted ≥1 real prescription


---

## Phase 7D Decisions — Roger

### recencyWeight Capped at 1.0

The spec formula Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15)) produces values >1.0 when sessionsAgo < 5. Added Math.min(1.0, ...) to match the spec description "1.0 within 5 sessions, decays to 0.5 by 20 sessions."

**Impact:** Priority scores are bounded [0, 1.0] as expected. No bonus for very recent insights.

### Event Logging is Fail-Soft

logEvent() requires a FK-valid session ID. The prescriber looks up the most recent active session from the DB. If none exists (e.g., during sessionStart before the new session is created), event logging is silently skipped.

**Rationale:** Prescriber runs in two contexts: (1) sessionStart (before new session exists) and (2) MCP run_curate (session may exist). Logging is informational, not critical. Fail-soft is consistent with the project's fail-open philosophy.

**Impact:** Phase 7F tools that read prescription events should be aware that some prescription_generated events may be missing for prescriptions generated during session startup.

### shouldResurface Compensates for Session Counter Timing

incrementSessionCounter() runs AFTER prescribe() in sessionStart.ts. The shouldResurface() function uses currentSession + 1 >= deferUntilSession to compensate, so deferral cooldowns are honored correctly.

**Impact:** Deferral cooldowns are accurate. Phase 7F should use the same shouldResurface() function if needed.

### Rejected Prescriptions Block Re-Prescription

'rejected' is added to the set of statuses that prevent generating a new prescription from the same insight. An insight with a rejected prescription won't be re-prescribed until the rejected prescription is manually expired or the insight itself changes.

**Rationale:** Rejected is terminal per the spec. Without this, rejected insights would get re-prescribed on every prescribe() run, spamming the user.

**Impact:** If a user rejects a prescription but later wants to reconsider, they'll need to explicitly re-enable (possibly via unsuppress or manual expiration in Phase 7F).

### checkAutoSuppress Exported for Phase 7F

The auto-suppression check (deferCount >= threshold → suppress) is exported as checkAutoSuppress(prescriptionId, deferCount). Phase 7F's resolve_prescription MCP tool should call this after each deferral.

**Impact:** Phase 7F must call checkAutoSuppress() after deferPrescription() in the defer flow.

---

## Phase 7E Decisions — Rosella

### LIFO Rollback for Multi-Prescription Sidecars

**Context:** managed_artifacts has UNIQUE(path). Multiple prescriptions can append to the same sidecar file, but only one row can exist per path.

**Decision:** When appending, remove the old managed_artifact row and re-track with the latest prescription's ID. Rollback only supports the latest writer (LIFO). Rolling back a middle prescription in a multi-append stack is not supported in this phase.

**Rationale:** The existing schema supports this cleanly. Full multi-level undo would require a separate history table — overkill for Phase 7E scope. If needed later, we add a managed_artifact_history table.

### File-Based Drift Detection

**Context:** The DAL's detectDrift() compares original_checksum vs current_checksum in the DB only — it doesn't read disk.

**Decision:** checkDrift() in applier.ts reads the actual file, computes SHA-256, and compares to stored current_checksum. This is the on-disk drift check. The DAL function is for DB-internal consistency.

**Rationale:** Users need to know if someone hand-edited the sidecar file. That requires a disk read, not a DB lookup.

### Apply Blocks on Drift

**Context:** Should pplyPrescription proceed if the sidecar has drifted since last write?

**Decision:** Block with error. The user must resolve drift before new content is applied.

**Rationale:** Silently overwriting user edits violates the "safe defaults" principle from DP6. The user should explicitly acknowledge changes before Cairn writes again.

---

## Phase 8D — Skill Test Harness

### 2026-04-30: Phase 3 Architecture — ForgeClient & SDK Abstraction (Graham)

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Active

# Graham — Phase 3 Architecture Decisions

**Date:** 2026-04-30  
**Author:** Graham Knight (Lead / Architect)  
**Context:** Phase 3 architecture specification for `@akubly/forge` — live SDK integration

---

## ADR-P3-001: ForgeClient wraps CopilotClient 1:1

**Decision:** Each ForgeClient owns exactly one CopilotClient. No shared instances.

**Alternatives:**
1. Shared client singleton — lifecycle confusion, race conditions on concurrent session creation.
2. No wrapper / expose CopilotClient directly — breaks "SDK types don't leak" contract.
3. **1:1 wrapper (chosen)** — clear ownership, deterministic cleanup.

**Trade-off:** Slightly more memory if multiple ForgeClients exist. Clear lifecycle wins.

---

## ADR-P3-002: EventSource interface over direct CopilotSession coupling

**Decision:** `attachBridge()` and `createTokenTracker()` accept `EventSource { on(handler): () => void }` rather than `CopilotSession`.

**Alternatives:**
1. Accept CopilotSession directly — simpler types, but couples to SDK and complicates testing.
2. **EventSource interface (chosen)** — enables mock event sources, keeps Phase 2 bridge SDK-free.

**Trade-off:** One extra interface definition for massive test simplification.

---

## ADR-P3-003: ModelCatalog uses injection over ForgeClient reference

**Decision:** `createModelCatalog()` takes a `listFn: () => Promise<ModelSnapshot[]>` rather than a ForgeClient reference.

**Alternatives:**
1. Pass ForgeClient — simpler call site, untestable without live client.
2. **Injection (chosen)** — testable with static array, matches Phase 2 pattern.

**Trade-off:** Caller wires one line of glue for full testability.

---

## ADR-P3-004: No new shared types in @akubly/types

**Decision:** Phase 3 types (ForgeClientOptions, ForgeSessionConfig, TokenBudget, ModelCatalog) stay Forge-internal.

**Rationale:** Cairn consumes CairnBridgeEvent, not TokenBudget. Types graduate to shared only when two packages actually import them.

**Trade-off:** If Cairn needs TokenBudget later, one PR to migrate. Smaller shared surface now.

---

## ADR-P3-005: Dual event paths — onEvent for setup, attachBridge for runtime

**Decision:** Use SessionConfig.onEvent for events during createSession(), attachBridge() after session exists. No dedup needed.

**Rationale:** SDK guarantees non-overlapping windows. Matches spike pattern.

**Trade-off:** Relies on SDK behavior guarantee. Low risk.

---

## ADR-P3-006: Strategies as plain functions, not class hierarchy

**Decision:** ModelStrategy is a function type. Built-in strategies are a Record<string, ModelStrategy>.

**Alternatives:**
1. Strategy class hierarchy — overkill for 3 strategies, adds constructor ceremony.
2. **Function type (chosen)** — easy to test, compose, override.

**Trade-off:** No runtime type-checking of strategy names. Acceptable for developer-facing API.


---

### 2026-04-29: Phase 3 Test Strategy — Inline Contract Testing (Laura)

**Author:** Laura (Tester)  
**Type:** Testing  
**Status:** Active

# Laura — Phase 3 Test Strategy: Inline Contract Testing

**Author:** Laura (Tester)
**Type:** Test Strategy
**Status:** Proposed
**Date:** 2026-04-29

## Decision

Phase 3 test contracts use **inline implementations** of the expected API surface (ForgeClient, ForgeSession, ModelCatalog, ModelSwitcher, TokenBudgetTracker) rather than importing from non-existent modules. Each inline class defines the behavioral contract. When Alexander builds the production modules, tests switch imports — any divergence breaks tests immediately.

## Rationale

1. **TDD red-phase compatibility:** Tests must be runnable NOW, before production code exists. Importing from `../runtime/index.js` would produce compile errors.
2. **Contract precision:** Inline implementations encode expected behavior (e.g., "disconnect is idempotent", "bridge events are returned as copies") that pure type signatures cannot express.
3. **Proven pattern:** Phase 2 used the same approach (inline bridge/hooks) and the migration to production imports was smooth — documented in history.md.

## Migration Path

When production modules are built:
1. Delete inline class definitions from test files
2. Replace TODO import comments with real imports
3. Run tests — failures reveal behavioral divergence
4. Resolve divergence (fix production code or update contract if intentional)

## Mock SDK Extensions

Extended `helpers/mock-sdk.ts` for Phase 3 needs:
- **MockCopilotSession:** Added `setModel`, typed event handler map, unsubscribe returns
- **MockCopilotClient:** Added `resumeSession`, `listModels`, `listSessions`, `getAuthStatus`, `getStatus`
- **makeModelInfo:** Shared factory for constructing valid `ModelInfo` objects

These extensions are backward-compatible — existing Phase 2 tests continue to pass unchanged.

## Test Coverage Summary

| Module | Tests | Key Behaviors |
|--------|-------|---------------|
| runtime.test.ts | 35 | Session lifecycle, bridge wiring, hook composition, decision gates, disconnect semantics |
| models.test.ts | 52 | Model catalog CRUD, snapshot extraction, mid-session switching, token budget tracking, selection strategies |

## Risks

- Inline implementations may drift from what Alexander builds. Mitigation: clear TODO markers and documented migration path.
- Mock SDK extensions add maintenance surface. Mitigation: centralized in helpers/, barrel-exported.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Runtime (Alexander)

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

Addressed 7 persona review findings for `packages/forge/src/runtime/`. 6 accepted with fixes, 1 partially rejected (spec-vs-implementation gap with no test contracts).

## Key Decisions

**Spec Surface Gap — Partial Reject (F2)**

Rejected: `listModels`, `listSessions`, `getAuthStatus`, `getStatus` — these are in the architecture spec but have no test contracts and no consumers. They can be added when a consumer needs them.

Accepted from same finding: `onEvent` bridge for pre-session events and `model_change` tracking — these are correctness concerns with spec backing.

**Session Map Lifecycle (F6)**

Added `onDisconnect` callback pattern: ForgeClient passes a cleanup callback when creating ForgeSession. On disconnect, the session auto-removes itself from the client's tracking map. This means `sessionCount` stays accurate without manual cleanup.

**decisionGate Removed from Config (F5)**

`decisionGate` predicate was defined in `ForgeSessionConfig` but never wired. Decision gating is already handled through the observer pattern (`HookObserver.onPreToolUse`). Removed to avoid misleading API surface.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F1 | stop() error isolation | Added try/catch per session; errors logged separately |
| F3 | onEvent bridge missing | Wired pre-session event bridge (ADR-P3-005) |
| F4 | model_change tracking | Integrated into ModelChangeRecord[], persisted in events |
| F5 | decisionGate config field | Removed (not wired; gating handled by HookObserver) |
| F6 | Bridge handler guards | Added _disconnected guard + try/catch wrapper |
| F7 | Session map lifecycle | Added onDisconnect callback; auto-removal on disconnect |

## Files Changed

- `packages/forge/src/runtime/client.ts`
- `packages/forge/src/runtime/session.ts`

## Test Impact

All 268 tests pass. Zero regressions.

---

### 2026-04-30: Phase 3 Persona Review Fixes — Models (Roger)

**Author:** Roger (Platform Dev)  
**Type:** Implementation  
**Status:** Implemented  
**Date:** 2026-04-30

## Summary

9 persona reviewers surfaced 5 findings against the models/ module. Triaged as:
- **4 accepted and fixed** (F2–F5)
- **1 rejected** (F1)

## Key Decisions

**Rejected: F1 — sort() Mutates Input Array**

The Architect flagged `sort()` in `cheapest`/`smartest` strategies as mutating the input `models` array. This is a false positive: `filter()` already returns a new array, so `sort()` only mutates the filtered copy. No caller's data is affected.

## Fixes Applied

| Finding | Description | Fix |
|---------|-------------|-----|
| F2 | readonly bypass on TokenBudget.contextWindow | Introduced MutableContextWindow internal type; external API stays readonly |
| F3 | Dual EventSource subscriptions | Merged into single source.on() handler with if/else on event.type |
| F4 | Test field drift (reasoningEffort vs newReasoningEffort) | Updated test's ModelChangeRecord, makeModelChangeEvent, and assertions |
| F5 | Division by zero in budgetAware | Added guard: `if (context.budgetLimitNanoAiu <= 0) return cheapest(...)` |

## Files Changed

- `packages/forge/src/models/strategy.ts`
- `packages/forge/src/models/token-budget.ts`
- `packages/forge/src/__tests__/models.test.ts`

## Test Impact

- `npm run build` — clean
- `npx vitest run` — 268/268 tests pass



### 2026-05-01: Telemetry Collector ↔ Bridge Event-Name Contract

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-05-01  
**Type:** Contract + Telemetry  
**Status:** Implemented

Context: Persona review F4 caught that telemetry collectors checked for event type strings that never appear in the bridge's EVENT_MAP. Bridge maps SDK events to different vocabulary (	ool_use vs 	ool_call_started, etc.). Result: collectors silently received nothing in production.

**Key Decisions:**

#### ADR-TLM-001: Single source of truth for collector event interest
New exported COLLECTOR_BRIDGE_EVENTS const in packages/forge/src/telemetry/collectors.ts names every Cairn event type collectors react to.

#### ADR-TLM-002: Contract test enforces bridge alignment
New test packages/forge/src/__tests__/telemetry-bridge-contract.test.ts enumerates COLLECTOR_BRIDGE_EVENTS and asserts every value is in EVENT_MAP. CI fails fast if either side drifts.

#### ADR-TLM-003: F2 early-convergence semantics
convergedTurn set on FIRST occurrence of successful 	ool_result or plan_changed event. If neither fires, convergence stays at 1.0 (legitimate "no early progress" rather than phantom 0.30 floor).

#### ADR-TLM-004: F5 streaming quantiles via histogram sketch
Stored as optional drift.sketch on ExecutionProfile; backward compatible.

#### ADR-TLM-005: F6a per-signal means
New optional signals field on ExecutionProfile carries individual means for convergence, 	okenPressure, 	oolEntropy, contextBloat, promptStability.

**Impact:**
- Bridge owners: if you remove/rename a value in COLLECTOR_BRIDGE_EVENTS, contract test fails.
- Prescriber authors: ExecutionProfile.signals populated; targeting specific signals now mechanical.
- Persisted-profile readers: drift.sketch and signals optional; old rows keep working.
- Sink consumers: LocalDBOMSink now exposes droppedCount.

---

### 2026-05-01: Persona Review Fixes — Prescribers + Applier (F3, F6b, F9, F10)

**Author:** Rosella (Plugin Dev)  
**Date:** 2026-05-01  
**Type:** Implementation  
**Status:** Implemented

Four findings from Phase 4.5 persona review.

**Key Decisions:**

#### ADR-PSC-001: tuneParameters gains context argument
Third arg context: TuneContext carries udgetLimitNanoAiu. Defaults to DEFAULT_BUDGET_LIMIT_NANO_AIU = 1_000_000 so existing call-sites don't break. 	okenPressure normalized to [0,1] against this limit.

#### ADR-PSC-002: Prescribers consume signal-level entropy
Prescribers use profile.signals.toolEntropy (Roger's new field) for tool-guidance trigger, with fallback to drift.p95 for legacy profiles. Composite drift never masquerades as single-signal threshold.

#### ADR-PSC-003: Shared buildSnapshot utility
uildSnapshot lives in packages/forge/src/prescribers/utils.ts, sources driftLevel from classifyDriftLevel(). Single source of truth for GREEN/YELLOW/RED boundaries.

#### ADR-PSC-004: Adaptive exploration budget
GREEN → * 0.9 (decay), RED → * 1.1 (grow), YELLOW → hold. Hard floor EXPLORATION_FLOOR = 0.15, ceiling 1.0.

**Cross-team implications:**
- Roger: Aggregator writes profile.signals from metadata.signals on drift samples.
- 	uneParameters third arg optional; no caller updates required.
- Pre-existing gap: packages/forge/src/telemetry/collectors.ts missing on disk; 15 tests fail (outside this scope).

**Verification:** prescribers-applier.test.ts 36/36 pass (+8 new tests). Forge suite 514/529; 15 failures pre-date this work.

---

### 2026-05-02: Phase 4.5 Persona Review — All 11 Findings Fixed

**Author:** Scribe (Session Log)  
**Date:** 2026-05-02  
**Type:** Meta  
**Status:** Complete

Phase 4.5 persona review findings consolidated and resolved across three team members:

- **Roger (Platform Dev):** F1 (weighted means), F2 (convergence), F4 (contract), F5 (sketch), F6a (signals), F7 (sink warn), F11 (typeof). +24 tests → 534 Forge tests.
- **Rosella (Plugin Dev):** F3 (budgetContext), F6b (prescriber entropy), F9 (buildSnapshot), F10 (adaptive budget). +8 tests → 478 Cairn tests.
- **Alexander (SDK Dev):** F8 (granularityKey in FeedbackSource).

**Result:** 1,012 total tests passing (Forge 534 + Cairn 478), up from 990 pre-review. Build clean. All persona review findings hardened and deployed.

---

# Phase 4.6 — Cycle 1 Triage (Code Panel Findings)

**Lead:** Graham (Architect)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Trigger:** 15-finding Code Panel review, Aaron selected squad-mode autonomous triage.

---

## Architectural Decisions

### ADR-P4.6-004: Edit migration 012 in place (Finding #4)

**Decision:** Edit migration 012 to add `UNIQUE(hint_id)` — do NOT create migration 013.

**Rationale:** Migration immutability is a *production safety* convention. Phase 4.6 lives
on a feature branch with no production data and no downstream consumers of the migration
sequence. Adding a 013 that only exists to patch a 012 that never shipped creates dead
weight in the migration history. The sweep should also switch to `INSERT OR IGNORE` to
rely on the constraint rather than the read-check-then-write pattern.

**Trade-off named:** If another branch concurrently builds on migration 012, this edit
creates a merge conflict. Risk is low — Phase 4.6 is the only active consumer.

**Alternative rejected:** Migration 013 (immutability convention). Convention exists to
protect deployed schemas; pre-ship, it's ceremony without safety benefit.

---

### ADR-P4.6-005: Mirror ChangeVectorSummary with regression test (Finding #7)

**Decision:** Do NOT promote `ChangeVectorSummary` to `@akubly/types`. Mirror the type
in both packages and add a regression test that asserts structural compatibility.

**Rationale:** Same pattern as ADR-P4.6-003 (drift weight mirroring). `OptimizationCategory`
is a prescriber-internal concept — promoting it to the shared types package couples that
package to prescriber domain semantics. The regression test (Laura's L5 suite) already
validates shape; extend it to assert that all category values returned by
`summarizeChangeVectors` are valid `OptimizationCategory` members.

**Cost lands in:** Phase 4.6 (test addition). Promotion to `@akubly/types` deferred to
Phase 5 if a third consumer emerges.

**Trade-off named:** Duck-typing can drift silently between releases if the regression test
is skipped. Mitigation: test runs in CI on every PR.

**Alternative rejected:** Promote to `@akubly/types` now — premature coupling for a
single cross-package consumer.

---

### ADR-P4.6-006: Ship primitives only; defer runtime wiring (Finding #9)

**Decision:** Ship Phase 4.6 as "primitives only." The Curator sweep, CRUD layer,
`computeNetImpact`, `summarizeChangeVectors`, and prescriber ranking integration are
independently testable and correct. Runtime wiring (connecting Curator output to
prescriber input in the live loop) is deferred to a tracked follow-up issue.

**Rationale:** Phase 4.6 scope was always the computation and ranking primitives.
Wiring requires runtime orchestration changes (Curator → prescriber pipeline in the
session lifecycle) that expand scope, risk, and review surface significantly. The
primitives are the hard part; wiring is mechanical once the contract is stable.

**Trade-off named:** Phase 4.6 code is dormant at runtime until wiring lands. Tests
prove correctness, but no production validation until the follow-up ships.

**Follow-up issue:**
- **Title:** `Wire Curator change vectors to prescriber historicalVectors at runtime`
- **Body:** Phase 4.6 (ADR-P4.6-006) shipped computation primitives and prescriber
  ranking support, but no production caller passes `historicalVectors` to
  `analyzePromptOptimizations` / `analyzeTokenOptimizations`. The Curator sweep
  computes vectors and `summarizeChangeVectors` aggregates them, but nothing in the
  runtime session lifecycle queries summaries and feeds them to prescribers.
  Scope: add the orchestration glue in the Curator's periodic sweep or a new
  runtime hook that queries summaries and passes them to prescriber invocations.
  Depends on: Phase 4.6 merged.

---

## Per-Finding Triage

| # | Sev | Disposition | Fix Agent | Notes |
|---|-----|------------|-----------|-------|
| 1 | 🔴 | **ACCEPT** | Rosella | `deltaCost` uses cumulative `token_total_cost` (monotonic). Normalize to per-session cost before computing delta. Curator.ts is Alexander's code → Rosella fixes per lockout. |
| 2 | 🟡 | **ACCEPT** | Alexander (utils.ts) + Rosella (changeVectors.ts) | Confidence cliff: `vectorCount=1, minVectors=3` → boost 0.5, which *halves* confidence. Contradicts Wave 1 "positive boost only" policy. Fix: clamp to `Math.max(1.0, log(…)/log(…))` so vectors only amplify, never attenuate. Split across packages per lockout. |
| 3 | 🟡 | **ACCEPT** | Rosella | `sessionsObserved` stores cumulative `session_count` but migration comment says "between before/after." The proxy was a deliberate decision (see decisions.md §Sessions-Observed Proxy), but column docs are misleading. Fix: update column comment in migration 012 (being edited per ADR-P4.6-004 anyway) to say "cumulative session count at vector computation time." |
| 4 | 🟡 | **ACCEPT** | Rosella | Add `UNIQUE(hint_id)` to migration 012 per ADR-P4.6-004. Switch sweep to `INSERT OR IGNORE`. Both are Alexander's code → Rosella per lockout. |
| 5 | 🟡 | **ACCEPT** | Alexander | Sort bug: unmatched hints (predictedImpact undefined → 0) outrank matched hints with negative impact. Fix: partition matched/unmatched; sort matched by predictedImpact desc; append unmatched in original impactScore order. Both optimizers are Rosella's → Alexander per lockout. |
| 6 | 🟡 | **ACCEPT** | Rosella | `sweepChangeVectors` returns a single counter conflating 4 skip reasons. Add structured diagnostic: `{ eligible, skippedInsufficientSessions, skippedMalformed, alreadyComputed, computed }`. Curator.ts is Alexander's → Rosella per lockout. |
| 7 | 🟡 | **ACCEPT** | Laura | Per ADR-P4.6-005: add regression test asserting Cairn's `ChangeVectorSummary.category` values are valid `OptimizationCategory` members. Laura owns tests; lockout N/A. |
| 8 | 🟡 | **ACCEPT** | Alexander | `ChangeVectorSummary` missing from `@akubly/forge` root barrel re-export. Add to the prescribers re-export block in `forge/src/index.ts`. Adjacent to Rosella's module → Alexander per lockout. |
| 9 | 🟡 | **DEFER** | — | Per ADR-P4.6-006: ship primitives only. Follow-up issue: "Wire Curator change vectors to prescriber historicalVectors at runtime." |
| 10 | ⚪ | **ACCEPT** | Rosella | `computeNetImpact` inline negations are fragile. Extract named contributions: `const driftContrib = -deltaDrift * weights.deltaDrift;` etc. changeVectors.ts is Alexander's → Rosella per lockout. |
| 11 | ⚪ | **REJECT** | — | ADR-P4.6-002 explicitly chose the optional positional parameter over a config/options object. Finding contradicts an existing architectural decision. If the pattern proves painful at more call sites, revisit in Phase 5. |
| 12 | ⚪ | **DEFER** | — | DB injection style (explicit `db` param vs `getDb()`) is a repo-wide convention question, not Phase 4.6 scope. Follow-up issue: "Standardize DB access pattern: explicit injection vs internal getDb()." |
| 13 | ⚪ | **ACCEPT** | Laura | Describe block says "cross-module weight consistency" but test only validates local `DRIFT_WEIGHTS`. Rename to reflect actual scope; `it.todo` already marks the cross-module aspiration. Laura owns tests; lockout N/A. |
| 14 | ⚪ | **ACCEPT** | Alexander | `computeConfidenceBoost` re-exported publicly from `prescribers/index.ts` but it's an internal helper (Cairn mirrors the formula, can't import). Drop from public re-export. prescribers/index.ts is Rosella's → Alexander per lockout. |
| 15 | ⚪ | **ACCEPT** | Alexander (forge) + Rosella (cairn) | Four sites use `?? 3` for minSessions default. Extract `DEFAULT_MIN_SESSIONS = 3` constant. Rosella defines it in cairn's changeVectors.ts (Alexander's code → lockout). Alexander updates forge's utils.ts + optimizers (Rosella's code → lockout). |

---

## Summary

- **Accepted:** 12 findings
- **Rejected:** 1 (finding #11 — contradicts ADR-P4.6-002)
- **Deferred:** 2 (findings #9 and #12 — follow-up issues)
- **Escalated:** 0

### Agent Dispatch

| Agent | Finding #s | Count |
|-------|-----------|-------|
| Rosella | 1, 2 (changeVectors.ts), 3, 4, 6, 10, 15 (cairn) | 7 |
| Alexander | 2 (utils.ts), 5, 8, 14, 15 (forge) | 5 |
| Laura | 7, 13 | 2 |

### Cycle 2 Concerns

1. **Rosella's load is heavy** (7 items). Findings 1, 3, 4 all touch curator.ts — they
   should be batched in a single pass to avoid merge churn. Finding 4 (migration edit)
   and finding 3 (column comment) are the same file change.
2. **Finding #1 is the only blocker.** Rosella should prioritize it. The deltaCost bug
   produces materially wrong net_impact values that cascade into ranking.
3. **Finding #2 (confidence clamp) touches both packages.** Alexander and Rosella must
   coordinate — the formula change should be identical in both locations.
4. **Finding #15 (constant extraction) is low-risk but cross-package.** Can be done last.

---

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

---

# Decision: MetricSnapshot.sessionCount is optional (not required)

**Author:** Rosella (Plugin Dev)
**Date:** 2026-05-03
**Branch:** `squad/phase4.6-change-vectors`
**Context:** Phase 4.6 cycle 2, Finding #1 — deltaCost normalization requires sessionCount in MetricSnapshot.

---

## Decision

`MetricSnapshot.sessionCount` is declared as **optional** (`sessionCount?: number`) rather than required.

## Rationale

1. **Backward compatibility with stored JSON.** `MetricSnapshot` is serialized to `optimization_hints.metric_snapshot` (a JSON column). Hints created before Phase 4.6 cycle 2 will not have `sessionCount` in their stored JSON. Making the field required would silently cause `undefined` at runtime for those rows — worse than a `?? 0` fallback.

2. **Test fixture compatibility.** Laura's test fixtures (`feedback-loop.test.ts`, `prescribers-applier.test.ts`) use inline `metricSnapshot` objects built before this field existed. Making the field required broke the build (2 TS errors). Optional avoids forcing Laura to update fixtures just to unblock the build, while letting her add `sessionCount` values in her cycle-2 test updates naturally.

3. **Safe fallback exists.** `sweepChangeVectors` in curator.ts already handles missing `sessionCount` via `snapshot.sessionCount ?? 0`. When sessionCount is absent, the cost delta falls back to `tokenCostNanoAiu` (raw cumulative, no per-session normalization) — identical to pre-cycle-2 behavior. This is a graceful degradation, not a correctness cliff.

4. **`buildSnapshot()` always populates it.** New hints created after this cycle will always have `sessionCount`, so the fallback only fires for historical data.

## Alternative Rejected

Making `sessionCount: number` required (which was the initial implementation). This caused 2 TypeScript compilation errors in test files owned by Laura. Forcing her to update fixtures just to accommodate my type change violates the "each agent owns their scope" principle and would serialize our parallel work.

## Trade-off

The optional field means the type doesn't enforce the invariant at compile time. Mitigation: `buildSnapshot()` is the only factory for `MetricSnapshot` in production paths, and it always sets `sessionCount`. The `?? 0` fallback is documented in the type JSDoc.


# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Decision filed  
**Related to:** Phase 4.6 Wave 2 — Wiring Curator change vectors → prescriber `historicalVectors`

---

## Problem

Wave 1 ships with two disconnected halves:
- **Producer:** Curator computes `summarizeChangeVectors()` but doesn't expose it to callers
- **Consumer:** Prescribers accept optional `historicalVectors?: ChangeVectorSummary[]` but nothing passes them

**Missing:** An orchestration adapter that queries Cairn and injects vectors into Forge prescriber calls, while respecting "Forge never imports Cairn" acyclic dependency constraint.

---

## Decision: `ChangeVectorProvider` Port + Cairn Adapter

Define a new interface in `@akubly/types`:

```typescript
export interface ChangeVectorProvider {
  getSummaries(skillId: string): ChangeVectorSummary[];
}
```

Cairn implements `SqliteChangeVectorProvider: ChangeVectorProvider` with a single method that:
1. Queries change_vectors table by skill_id
2. Aggregates rows into `ChangeVectorSummary` objects
3. Returns the array

Forge receives the provider as an injected dependency. Prescriber call sites invoke `provider.getSummaries(skillId)` and pass the result to `historicalVectors`.

---

## Alternatives Considered

### Option A: Direct DB query in applier/prescriber call site

The caller imports `summarizeChangeVectors` from Cairn and calls it inline.

| Pro | Con |
|-----|-----|
| Simplest. No new abstractions. | **Violates "Forge never imports Cairn" constraint.** Tightly couples. |
| Zero new code. | Cannot unit-test call site without real DB. |

**Verdict:** Ruled out — breaks acyclic dependency.

### Option B: Extend `FeedbackSource` with `getChangeVectorSummaries` method

Couple vectors to the existing feedback interface.

| Pro | Con |
|-----|-----|
| No new interface. | **Conflates two concerns.** Vectors are observations; feedback is input signal. |
| Single dependency injection. | Less composable for Phase 5 (cloud vectors) without touching FeedbackSource. |

**Verdict:** Ruled out — poor separation of concerns.

---

## Why This Option

- **Acyclic dependency:** Respects "Forge never imports Cairn." Provider is abstracted in types.
- **Established pattern:** Mirrors `FeedbackSource` injection pattern already used.
- **Independent evolution:** Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`.
- **Type promotion:** `ChangeVectorSummary` moves from being dual-copied (guarded only by Laura's test) to a single definition in `@akubly/types`.
- **Small contract surface:** One type + one method interface.

---

## Trade-off Named

Slightly more wiring than extending `FeedbackSource` (adding a new interface, new adapter), but the architectural return is worth it: better separation of concerns and independently evolvable subsystems for future phases.

---

## Implementation Ownership

- **@akubly/types:** Alexander defines `ChangeVectorProvider` interface + promotes `ChangeVectorSummary` type
- **Cairn:** Alexander/Roger implement `SqliteChangeVectorProvider` adapter
- **Forge:** Rosella integrates provider injection + updates prescriber call sites
- **Tests:** Laura covers provider contract, prescriber integration with mocked provider


---

# ADR: Wave 2 Wiring Shape — ChangeVectorProvider Port + PrescriberOrchestrator Port

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-20  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2

---

## ChangeVectorProvider

**Decision:** Use a `ChangeVectorProvider` interface in `@akubly/types` with a Cairn-side `SqliteChangeVectorProvider` adapter.

**Alternatives considered:**
1. Direct DB query in applier (violates "Forge never imports Cairn")
2. Extend `FeedbackSource` with `getChangeVectorSummaries` method (couples prediction concern to observation concern; less composable for Phase 5 cloud vectors)

**Why this option:**
- Follows the established injection pattern (`FeedbackSource` precedent)
- Respects acyclic dependency constraint
- Independently evolvable — Phase 5 can add `CloudChangeVectorProvider` without touching `FeedbackSource`
- `ChangeVectorSummary` type promoted to `@akubly/types` eliminates the dual-copy maintenance burden
- Small contract surface: one type + one single-method interface

## PrescriberOrchestrator

**Decision:** Add a `PrescriberOrchestrator` interface in `@akubly/types`. Forge implements it (wraps both prescribers). Cairn's Curator calls it via injection after the vector sweep.

**Alternatives considered:**
1. Cairn imports Forge prescribers directly (violates acyclic dep constraint)
2. Forge-only manual invocation, defer Cairn-side (contradicts Phase 4.5 spec §ADR-P4.5-006 which designates Cairn as the autonomous trigger path)

**Why this option:**
- The Phase 4.5 spec explicitly designed two trigger paths: manual in Forge, Curator-driven in Cairn. The Curator is the primary production invocation path.
- Prescribers are pure functions in Forge. Cairn needs to call them but can't import Forge. A port resolves this cleanly — same pattern as `FeedbackSource` and `ExportQualityGate`.
- Single-method interface, minimal surface.

## Negative-Impact Attenuation

**Decision:** Implement attenuation in Wave 2 (not defer). When `meanNetImpact < 0`, `confidenceBoost` drops below 1.0 (clamped to ≥ 0.3). Without this, wiring would allow auto-apply of historically harmful prescriptions.

**Trade-off named:** Adds ~5 lines of logic + 4 tests across two packages. Small scope increase for eliminating a known-bad production behavior.

---

# ADR: Wave 2 v3 — Wiring Shape + Scope Split + Safety Gates

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-21  
**Status:** Approved — ready for implementation  
**Phase:** 4.6 Wave 2 v3 (revision of 2026-05-20 ADR, incorporates duck critique and scope refinement)

---

## ChangeVectorProvider Port

**Decision:** `ChangeVectorProvider` interface in `@akubly/types` with async return type (`Promise<ChangeVectorSummary[]>`). Cairn implements via `SqliteChangeVectorProvider`.

**Reasoning:** Same as v1 (follows FeedbackSource pattern, respects acyclic deps). v3 adds `Promise` return type for Phase 5 readiness — avoids interface churn when cloud providers land.

## Wave 2/3 Split

**Decision:** Wave 2 = data plumbing + manual invocation via top-level composition script. Wave 3 = Curator-driven automatic orchestration.

**Reasoning:** `curate()` is a module-level function in Cairn with no injection points, called from Cairn-only entrypoints (hooks, MCP). Injecting a Forge-implemented orchestrator requires a composition root that imports both packages. No such root exists today. Creating one is a package boundary decision that deserves its own ADR, not a wiring detail buried in Wave 2.

**Trade-off named:** Wave 2 only delivers manual invocation. The autonomous Curator path (primary production trigger per Phase 4.5 spec) is deferred. But the hard parts (type promotion, safety gates, provider adapter) ship in Wave 2; Wave 3 is pure wiring once composition ownership is decided.

## Hint Deduplication

**Decision:** `(skillId, source, category)` dedup key with active-status filter (`pending`, `accepted`, `deferred`). Skip insertion if match exists. No upsert — preserves audit trail.

**Reasoning:** Prescribers generate fresh UUIDs every invocation. Without dedup, repeated runs create unbounded duplicate hints. The existing Cairn prescriber uses `hasActivePrescription(insightId)` for the same purpose. Same pattern, different key.

## Negative-Impact Attenuation

**Decision:** Two-layer defense:
1. Confidence scaling: `confidenceBoost = max(0.1, 1.0 + meanNetImpact)` when mature evidence + negative impact. Sparse evidence: no attenuation (boost stays 1.0).
2. Eligibility flag: `autoApplyEligible = false` when `meanNetImpact < -0.2` and `vectorCount >= minVectors`.

**Reasoning:** Confidence scaling alone with a floor of 0.3 (v2) could still pass permissive auto-apply thresholds. The `autoApplyEligible` flag is defense-in-depth — the applier checks it independently of confidence math. Strongly negative categories cannot auto-apply regardless of threshold configuration.

---

# Archived: 2026-05-24T06:25:04Z
# Squad Decisions

## Active Decisions

### W2-1: ChangeVectorSummary Category Field (Roger)

**Scope:** Type consolidation for shared `ChangeVectorSummary` contract

**Decision:** Use stricter `OptimizationCategory` union (six-value string union from Forge) for `category` field in canonical `@akubly/types` definition.

**Rationale:** Forge already encodes the domain's real category set. Making the union canonical now ensures type safety for W2-2/W2-7 follow-on work while remaining additive (no existing duplicates switched yet).

**Impact:** Both Forge and Cairn gain shared, stricter type contract; future category additions go through Forge's enum.

### W2-7: Category Narrowing at SQLite Boundary (Rosella)

**Scope:** Cairn data layer type safety for ChangeVectorSummary contract

**Decision:** Narrow raw `optimization_hints.category` strings at Cairn's SQLite read boundary instead of widening the shared contract back to `string`.

**Implementation:** `getAllCategories()` filters DB values through the canonical `OptimizationCategory` union from `@akubly/types`. `summarizeChangeVectors()` only accepts narrowed categories. `SqliteChangeVectorProvider.getSummaries()` drops summaries where `vectorCount === 0`.

**Rationale:** DB schema remains permissive for backward compatibility, but cross-package `ChangeVectorSummary` contract is strict. Narrowing once at boundary keeps rest of Cairn aligned with Forge's canonical union without unsafe casts. Zero-vector summaries provide no historical signal and trigger Phase 4.5 fallback mode.

**Impact:** Cairn data layer now type-safe; empty summaries filtered at provider output.

### W2-5: Negative Impact Gate + autoApplyEligible Semantics (Alexander)

**Scope:** Attenuation boundary and hint eligibility signal for negative-impact vectors

**Decision:** Gate boundary is **inclusive** (`<=`) at `-0.2`. Mature negative vectors attenuate and disable auto-apply when `meanNetImpact <= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (value: `-0.2`). A summary at exactly `-0.2` triggers auto-apply disable.

**Rationale:** Safety asymmetry + FP fragility. Inclusive boundary prevents false positives at the exact threshold and provides stronger guard against brittle boundary conditions. Dual-layer testing locks behavior: unit test (alexander-2 maturity-gradient) expects gating at exactly -0.2; E2E canary (laura-1 wave2-pipeline) uses constant directly for drift-proof coverage.

**Implementation:** Gate comparison changed from `<` to `<=` in Forge prescribers and Cairn gate logic. Safety-boundary comment added at comparison site. Maturity-gradient test updated to expect gating at exactly -0.2. E2E pipeline canary uses `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant directly (prevents configuration drift).

**Impact:** Negative-impact gate boundary now locked by dual-layer testing (unit + E2E); Applier receives explicit attenuation signal for hints at and below threshold; safety margin increased. Decided by Aaron 2026-05-22.

### W2-8: Active Status Set for Optimization Hints (Rosella)

**Scope:** Deduplication logic for `(skillId, source, category)` tuples

**Decision:** Use `pending`, `accepted`, and `deferred` as the active statuses for optimization-hint dedup. Terminal statuses (`applied`, `rejected`, `expired`, `suppressed`, `failed`) do not block reinsertion of same semantic recommendation.

**Rationale:** Active set represents hints still live in operator workflow: waiting to be reviewed, explicitly approved but not yet applied, or intentionally postponed. A second hint during those states duplicates work and pollutes category history. Terminal statuses no longer represent live hints, so they should not block fresh inserts—allows operators to retry after rejection or expiration.

**Implementation:** `packages/cairn/src/db/optimizationHints.ts` encodes `ACTIVE_HINT_STATUSES` constant and uses in both `insertHintIfNew()` and `hasActiveOptimizationHint()`.

**Impact:** Deduplication now enforced at Cairn DB layer; Forge applier receives deduplicated hint stream; zero-vector summaries filtered at provider boundary.

### W2-9: Manual CLI Surface Location (Roger)

**Scope:** Composition root for Wave 2 manual orchestration

**Decision:** Created new `packages/runtime-cli/` workspace package with bin entry `forge-prescribe`. This package is the explicit composition root that can legally import both `@akubly/cairn` and `@akubly/forge`.

**Rationale:** Repo already exposes binaries from package-level `bin` entries (e.g., `@akubly/cairn`). Wave 2 needs composition root without creating package cycles. `packages/runtime-cli` keeps boundary honest and buildable. Local invocation: `npx forge-prescribe --skill <id> [--db <path>]`.

**Implementation Details:**
- Per-skill → global profile fallback: Try canonical `(granularity='per-skill', granularity_key='global')` first, then fall back to `global/global`
- Exit codes: `0` on success (including zero hints or dedup skips), `1` when no profile found, `2` for arg/DB/persistence errors
- CLI tests: 4 passing (happy path, no-profile, empty result, mixed)

**Impact:** Wave 2 has manual trigger surface independent of Curator. Wave 3 will migrate to Curator-driven automatic orchestration. Package boundary preserved for future Phase 5 cloud wiring.

### W2-6: E2E Pipeline Test Location + Spec Ambiguity Note (Laura)

**Scope:** Integration test placement and discovered spec mismatch

**Decision:** Placed Wave 2 end-to-end pipeline test in `packages/forge/src/__tests__/wave2-pipeline.test.ts`. Forge is focal point because `runForgePrescribers()` is consumer ingesting Cairn summaries and emitting final hints applier sees.

**Spec Ambiguity Discovered:** `docs/forge-phase4.6-wave2-scope.md` §6.1 says `meanNetImpact = -0.2` should yield `autoApplyEligible = false`, but live Forge/Cairn logic and Alexander's W2-5 tests treat boundary as still eligible (`meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE`). Test kept aligned with implementation + §4.5 semantics. **Action item:** Reconcile boundary explicitly in Wave 3 (pending ADR).

**Rationale:** Forge already hosts substantive integration coverage under `packages/forge/src/__tests__/`. New test stays with existing cross-module surface instead of one-off harness. To avoid production dependency from Forge to Cairn, test imports Cairn source directly and Forge's `tsconfig.json` excludes test files from package build.

**Test Coverage:** Full maturity gradient (0 vectors → mature catastrophic), dedup regression on repeated persistence, provider omission, fail-open behavior, shared `ChangeVectorSummary` contract flow.

**Impact:** Real SQLite path fully validated; attenuation + `autoApplyEligible` propagation verified end-to-end; provider fail-open semantics confirmed.

### W3-D1: Composition Root → R2 (`@akubly/skillsmith-runtime`)

**Scope:** Where should the runtime that imports both `@akubly/cairn` and `@akubly/forge` live?

**Decision:** Adopt R2 — new `@akubly/skillsmith-runtime` library package (composition layer importing both) plus thin `@akubly/runtime-cli` wrapper.

**Rationale:** Clean separation of concerns, best test isolation, zero build-order risks, Phase 5-portable. Roger and Alexander independently converged on this architecture.

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Unblocks all Wave 3 work items

### W3-D2: Package Name → `@akubly/skillsmith-runtime`

**Scope:** What name for the new composition library package?

**Decision:** Use `@akubly/skillsmith-runtime` (domain-specific, not generic `@akubly/runtime`).

**Rationale:** Domain-specific naming (a) fits the cairn/forge metaphor, (b) describes what operates on (skills), (c) leaves room for future additions (scheduler, dashboard, policy engine).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Naming locked; packaging can proceed

### W3-D3: MCP Tool Exposure → Dropped from Wave 3

**Scope:** Should Wave 3 include an MCP tool for manual prescriber invocation?

**Decision:** No — Wave 3 ships with no MCP tool exposure. Curator hook is autonomous surface; CLI is manual surface.

**Rationale:** Proposed `run_prescriber_optimization` tool offers no net-new capability over existing CLI. Defer to later wave when concrete operator need surfaces. Removes W3-6, W3-7, ~2 MCP scenarios from W3-9 (~7 items, ~18 tests).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Wave 3 scope reduced; MCP tool re-opens only when operator need materializes

### W3-D4: Curator Hook Invocation → Always-On

**Scope:** Should Curator automatically invoke prescriber orchestration in v1?

**Decision:** Yes — automatic invocation always enabled. No opt-in flag in v1.

**Rationale:** Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) are sufficient. Opt-in flag adds config without meaningful safety benefit.

**Status:** Accepted by Aaron 2026-05-22

**Locked Design:** Hint persistence stays in orchestrator; fail-open codified; profile selection trigger-driven only (global fallback deferred to Wave 4).

**Impact:** Unlocks automatic hint flow; enables Wave 3 implementation

### W3-Impl-1: Workspace Dependencies via Existing Pattern (Roger)

**Scope:** How should `@akubly/skillsmith-runtime` declare dependencies on Cairn/Forge/Types?

**Decision:** Use existing internal dependency specifier pattern (`"*"`) instead of `workspace:*`. Root monorepo workspace glob `packages/*` covers new package; no redundant root `workspaces` entry needed.

**Rationale:** Environment npm rejects `workspace:*` with `EUNSUPPORTEDPROTOCOL`. Repository already uses `"*"` pattern consistently; new package integrates cleanly with existing convention.

**Implementation:** `skillsmith-runtime/package.json` declares `"@akubly/types": "*"`, `"@akubly/cairn": "*"`, `"@akubly/forge": "*"`. Root `tsconfig.json` references updated.

**Impact:** Workspace registration consistent across all packages; new package installs and builds cleanly.

### W3-Impl-2: Thin Runtime-CLI via Composition Migration (Roger)

**Scope:** How to refactor `runtime-cli` while preserving CLI contract?

**Decision:** Move entire `runForgePrescribe()` composition body from `runtime-cli` to `skillsmith-runtime/src/index.ts`. Reduce `runtime-cli` to thin facade: arg parsing, console formatting, exit-code mapping, top-level error reporting.

**Rationale:** Implements W3-D1 (R2 architecture) immediately instead of carrying temporary inline composition forward. Moved code is the old implementation, relocated intact — smallest behavioral risk. Avoids asking Alexander to re-migrate same code in W3-5.

**Implementation:** `skillsmith-runtime` owns `runForgePrescribe()` (profile load, vector provider, Forge invocation, dedup, persistence). `runtime-cli` owns CLI concerns only. CLI contract (`npx forge-prescribe --skill <id>`) unchanged.

**Impact:** Composition root established; CLI behavior identical; foundation ready for W3-5 Curator factory.

### W3-Impl-3: ExecutionProfile Reuse in Types (Alexander)

**Scope:** How to define `PrescriberOrchestrationConfig` and `PrescriberRunResult` in `@akubly/types`?

**Decision:** Keep `ExecutionProfile` in canonical location (`@akubly/types`); reference directly from `PrescriberOrchestrationConfig`. Keep `loadProfile` **synchronous** in Wave 3.

**Rationale:** `ExecutionProfile` already stable in `@akubly/types`; re-declaring structurally creates duplicate truth. Synchronous `loadProfile` matches current reality (Cairn SQLite-backed accessors are sync). Async deferrable to Phase 5 if cloud profile loading surfaces.

**Implementation:** Added `PrescriberOrchestrationConfig` and `PrescriberRunResult` to `packages/types/src/index.ts`. `skillsmith-runtime` re-exports canonical types. No Cairn compatibility shim required.

**Impact:** Wave 3 Curator-facing port has stable, reusable type contracts. No Cairn-to-types inversion. Foundation for W3-4 and W3-5.

### W3-Impl-4: Curate Async Transition + Trigger-Driven Skills (Alexander)

**Scope:** How should `curate()` accept and orchestrate the prescriber config?

**Decision:** 
1. `curate()` is now `async`, returns `Promise<CurateResult>`
2. Qualifying skills sourced from `ChangeVectorSweepResult.computedSkillIds` — distinct, sorted skill IDs whose vectors were newly inserted this cycle
3. Per-skill `runForSkill(skillId, minSessions)` receives `minSessions` from existing Curator chain: `changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS`

**Rationale:** `runForSkill()` is async by contract; keeping `curate()` sync would lie or drop orchestration results. `computedSkillIds` is smallest signal matching accepted trigger-driven rule. Reusing `minSessionsObserved` aligns vector-sweep and prescriber gates.

**Implementation:** All sync call sites updated to `await curate()`. Per-skill exceptions log `console.warn`, produce error-shaped `PrescriberRunResult`, do not abort cycle (fail-open).

**Impact:** Async Curator orchestration ready for W3-5/W3-6. Fail-open semantics locked. All 32 call sites updated and tested. Cairn 576/576 passing.

### W3-Impl-5: Shared Prescriber Execution Helper (Alexander)

**Scope:** How to avoid duplicating the Cairn+Forge composition pipeline between manual CLI (`runForgePrescribe`) and Curator factory?

**Decision:** Extract shared `executePrescriberRun()` helper inside `packages/skillsmith-runtime/src/index.ts` that owns the per-skill execution body:
1. Instantiate `SqliteChangeVectorProvider`
2. Call `runForgePrescribers()`
3. Persist hints via Cairn `insertHintIfNew()` dedup
4. Return generation / inserted / duplicated / error counts

`runForgePrescribe()` (manual CLI) keeps existing operator-facing result contract and global profile fallback. `createPrescriberOrchestrationConfig()` (Curator factory) adapts to Curator-facing `PrescriberRunResult` contract.

**Rationale:** Single-sourced composition body while allowing different consumers to apply different profile-selection policy and result shaping. Makes W3-6 hook wiring smaller.

**Implementation:** Extracted `executePrescriberRun()` helper. `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` both call shared helper. Cairn gains `getExecutionProfileWithDb()` convenience.

**Impact:** Composition logic centralized, no duplication. Factory ready for W3-6 hook wiring. Per-skill Curator orchestration fully realized. Skillsmith-Runtime 6/6 passing.

### W3-Impl-6: Curator Hook Wiring via Injected Config (Roger)

**Scope:** How to wire always-on Curator prescriber orchestration at session start without violating W3-D1 boundary?

**Decision:** Pick **R-Hook-A (inject config into hook)**. `packages/cairn/src/hooks/sessionStart.ts` accepts optional `PrescriberOrchestrationConfig` and forwards to `curate(undefined, prescriberOrchestrationConfig)`. Production bootstrap moved to `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, which calls Cairn's hook runner with factory that constructs `createPrescriberOrchestrationConfig({ db })` from already-open SQLite handle.

**Rationale:** Smallest change preserving W3-D1 boundary. Cairn owns hook mechanics and Curator invocation but does not import `skillsmith-runtime`, avoiding cairn ↔ skillsmith-runtime cycle. Always-on guaranteed by composition root bootstrap logic.

**Implementation:** 
- Cairn hook runner: optional `PrescriberOrchestrationConfig` parameter
- `skillsmith-runtime/src/hooks/sessionStart.ts`: production bootstrap wrapper
- `.github/hooks/cairn/curate.ps1`: updated to prefer runtime hook for both global-install and repo-checkout paths
- Tests call `runSessionStart(repoKey)` with `undefined` for backward compatibility

**Impact:** Always-on Curator orchestration wired. Composition boundary preserved. Tests and production use same hook path. Cairn 576/576 passing.

### W3-Impl-7: E2E Integration Test — Auto Trigger, Dedup, Fail-Open (Laura)

**Scope:** Validate Wave 3 end-to-end: auto trigger for computed skills, dedup confirmation, fail-open behavior, profile miss handling.

**Decision:** Place `wave3-pipeline.test.ts` in `packages/forge/src/__tests__/` covering four scenarios:
1. Auto trigger: new vectors computed → prescribers run → hints inserted
2. Dedup (trigger-driven): second pass with newly-qualified vectors → re-checked via eligibility → duplicates blocked
3. Fail-open: per-skill exception → logged, continued
4. No profile: skill skipped without error

**Rationale:** Forge is focal point (ingests Cairn summaries, emits final hints). Test location aligns with existing cross-module coverage. Real SQLite path fully validated. To avoid production dependency from Forge to Cairn, test imports Cairn source directly; Forge's `tsconfig.json` excludes test files from package build.

**Key Behavioral Finding:** Accepted W3-D4 (trigger-driven orchestration) only reruns for skills with newly-computed vectors (`computedSkillIds`). This means unchanged DB state cannot produce dedup rerun on back-to-back invocations. Test adapted to realistic scenario: second pass with newly-qualified existing vectors triggering dedup-visible behavior.

**Implementation:** 4 scenarios, bootstrap via `runSessionStart`, assertions on `PrescriberRunResult` counts and DB state. Forge 630/630 passing.

**Impact:** Wave 3 end-to-end integration validated. Dedup and auto-trigger mechanics confirmed. Real Cairn+Forge persistence path exercised.

---

## Open Questions

### W3-7 Trigger-Driven Dedup Semantics (Laura)

**Status:** FLAGGED FOR AARON'S DIRECTION

**Observation:** Wave 3's accepted trigger-driven orchestration (W3-D4) means Curator only calls prescribers for skills in `changeVectorSweep.computedSkillIds` — i.e., skills whose change vectors were newly inserted this cycle.

**Implication:** If the same skill's vectors remain unchanged across two consecutive session starts, the prescriber does not run on the second start, and no dedup-visible result is produced. This is correct by the trigger-driven design, but it differs from a "rerun on every session start" behavior.

**Question:** Should Wave 4+ introduce a broader trigger mechanism to allow reruns for skills with existing (non-new) summaries? Examples:
- Always rerun skills that have any vector summaries (regardless of new-this-cycle)
- Expose a manual scheduler or `force=true` flag for operator-initiated reruns
- Defer to Phase 5 when MCP/cloud integration allows finer control

**Current Design:** Trigger-driven only (W3-D4). This prevents unnecessary prescriber invocations and aligns with the "on new signal" principle, but it limits dedup visibility to cycles where vectors are genuinely computed.

**Recommendation:** Clarify with product whether current trigger semantics are intentional, or if dedup should be visible on *every* session start regardless of new vectors.

### Addendum (2026-05-23): Curator Observability Gap

Investigation into Laura's flagged ambiguity surfaced a deeper architectural finding worth recording for Wave 4 planning.

**Finding:** Curator (`packages/cairn/src/agents/curator.ts`) has no read surface into:

- `optimization_hints` table — Curator writes hints through the orchestrator but never reads them back. No awareness of hint state transitions (pending → applied / rejected / expired / suppressed / failed).
- Prescriber config or profile schema versioning — there is no version field tracked anywhere. If prescriber logic or category sets change, Curator has no signal.
- `execution_profiles` change history — Curator only reads "current" via `loadProfile(skillId)` inside `runForSkill`, no concept of "this profile is newer than last time I prescribed against it."

**Implication:** The trigger-driven gap Laura flagged is not just a scoping choice — it is the leading edge of a broader observability gap. Even if Wave 4 wanted to add richer triggers ("rerun when a hint gets rejected", "rerun when prescriber config bumps", "rerun stale profiles"), Curator currently cannot observe any of those signals.

**Wave 4 design options (for future planning, no decision yet):**

1. **Add new triggers as CairnEvents.** Hint state transitions and profile/config bumps become events appended to the existing CairnEvent stream Curator already processes via cursor. Smallest architectural delta — Curator's input model stays event-driven; new event types are additive.
2. **Give Curator a read surface plus "diff vs. last seen" state.** Curator gains direct queries into hint and profile tables, persists a watermark per skill of "what I last prescribed against," and recomputes on diff. More plumbing; needs a new derived state table.
3. **Externalize the trigger entirely.** A separate scheduler (cloud or local) decides which skills to re-prescribe and invokes the orchestration config directly. Curator stays leading-edge only; re-evaluation is owned elsewhere.

**Recommendation:** Option 1 aligns best with the existing architecture. Curator already loves event streams; hint state transitions are a natural fit. Defer the decision to Wave 4 — no action in Wave 3.

**Verified by:** Read of `packages/cairn/src/agents/curator.ts` lines 152–260 confirming the curate() input surface is strictly `CairnEvent` stream + `ChangeVectorConfig` + `PrescriberOrchestrationConfig`. No reads of `optimization_hints` or `execution_profiles` change history. Confirmed 2026-05-22 by Aaron + Squad.

---

## Wave 3 Research Notes

### Research: Composition Root Audit (Roger)

**Date:** 2026-05-23  
**Status:** Research input, delivered to ADR synthesis

**Scope:** Five options for where the runtime that imports both `@akubly/cairn` and `@akubly/forge` should live.

**Option Summary:**

| Option | Package Structure | Build Risk | Test Isolation | Phase 5 Portability | Recommendation |
|--------|-------------------|------------|-----------------|-------------------|-----------------|
| R1 | Forge imports Cairn | Medium | Medium | Low | Do not use |
| R2 | New runtime package | Low | High | High | ✓ Recommended |
| R3 | Optional Cairn import of Forge | Medium | Medium | Medium | Fallback |
| R4 | Runtime-cli dual-mode | Low | Medium | High | Alternative |
| R5 | New curator package | Low | High | High | Alternative |

**Recommendation:** **R2** — Separate `@akubly/runtime` (composition library) + thin `@akubly/runtime-cli` (CLI wrapper).

**Why:** Clean roles, best test isolation, zero build risks, Phase 5-ready. Library stays portable.

**Fallback:** R4 (new `@akubly/curator` package) if team prefers explicit orchestrator semantics.

**Do not use:** R3 (inject Forge into Cairn hooks). Test coupling + build-order risks unacceptable.

**Full Audit:** `docs/wave3-composition-root-audit.md`

---

### Research: Curator/MCP Integration Surface (Alexander)

**Date:** 2026-05-22  
**Status:** Research input, delivered to ADR synthesis

**Scope:** Wave 3 Curator–MCP integration requirements, architectural decisions, and open questions.

**Key Findings:**

1. **Composition Root Location:** New `@akubly/runtime` package (aligns with Roger's R2 recommendation).
2. **Invocation Strategy:** Hybrid — automatic via Curator hook + manual via MCP tool.
3. **Profile Selection (v1):** Trigger-driven only; defer global tier fallback to Wave 4.

**Secondary Decisions:**
- Eager Forge import (both packages co-deployed by assumption)
- `force=true` behavior: skip dedup (matches Wave 2 intent)
- Observable metrics: skills processed/skipped, hints generated/inserted/dedup'd, categories matched/attenuated
- Profile selection override: low-priority for v1; defer to Wave 4

**Curator API Changes:**
```typescript
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) 
    => Promise<{ skillId, hintsGenerated, hintsInserted, hintsDuplicated, hintsError }>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): CurateResult {
  // Signature is backward compatible (new param optional)
}
```

**MCP Tool:** `run_prescriber_optimization` (triggers orchestrator, returns structured output).

**Full Analysis:** `.squad/agents/alexander/wave3-integration-analysis.md`

---

## Cycle 1 — Wave 3 Persona Review Fixes + Wave 4 Planning

### C1-Triage: Wave 3 Persona Review Dispatch (2026-05-23)

**Summary:** 20 findings from 8-persona review (4 Code Panel, 4 Design Panel) across Wave 3 codebase. Disposition: 14 accepted, 3 rejected, 3 escalated.

**Escalated Items (Aaron's Decision Required):**

1. **I5 — MCP scope reopen timing:** "No net-new capability vs CLI" is too narrow; MCP serves a different operational surface. Recommendation: Document local-shell assumption in scope doc. Don't reopen MCP implementation.

2. **I6 — Security threat model:** No security threat model or explicit waiver. Recommendation: Brief Security Considerations section in ADR (3 sentences: local-only, trusted user, revisit at Phase 5). Not a full STRIDE.

3. **I4 — Always-on migration visibility:** Pre-Wave 3 prescribers were manual-only; now fire automatically every session. No changelog/opt-out. Recommendation: Add INFO log on first auto-run + release note.

**Rejected Items:**

- **B1:** Async breaking change compat layer — no external consumers in workspace-internal monorepo
- **M4:** stdin Object.defineProperty guard — test infrastructure only, no demonstrated failure mode
- **M5:** sqliteChangeVectorProvider sync-behind-async comment — noise that will need removal; contract is the interface

**Accepted Items — Summary by Owner:** See full triage file for details (11 fixes applied per `graham-cycle1-fixes.md` and `graham-cycle1-triage.md`).

**Sequencing:** See triage doc for recommended batch plan and dependencies.

### C1-Fixes: Alexander — Curator Time Budget + Fail-Open Logging (2026-05-23)

**Scope:** Batch 2 persona-review follow-up for Curator and Forge.

**Changes:**

- Added dedicated Curator prescriber-loop time budget guard in `packages/cairn/src/agents/curator.ts`
- Added optional `skippedReason?: string` to `PrescriberRunResult` in `packages/types/src/index.ts` for timeout skip reporting
- Added Forge warning-only logging at vector-provider fail-open path in `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts`
- Verified fail-open claim in scope doc: `runForgePrescribers()` already catches `provider.getSummaries()` errors locally, sets `historicalVectors = undefined`, continues
- Added regression test coverage in Cairn and Forge tests

**Decision:** No semantic doc/code fork needed. Implementation already matches scope doc's fail-open claim. Added missing operator warning log.

**Risk Note:** `skippedReason` is optional; existing `toEqual` assertions stay shape-compatible.

### C1-Fixes: Graham — Wave 3 ADR + Scope Doc Edits (2026-05-23)

**Scope:** Batch 1 persona-review follow-up for ADR refinement and scope documentation.

**Changes:** 11 fixes applied to `docs/adr/0001-composition-root.md` and `docs/forge-phase4.6-wave3-scope.md`:

- **I3:** Fixed factually wrong dependency claim in ADR Consequences
- **B2:** Rewrote Phase 5 portability overclaim; added local-SQLite constraint
- **I6:** Added Security Considerations section (3 sentences)
- **M8, M9, M10, M11:** Added inline citations, References section, post-decision notes
- **M6:** Added JSDoc on `createPrescriberOrchestrationConfig` factory scope
- **I5:** Expanded MCP rationale with local-shell assumption

**Verification:** `npm run build` ✅ green. Code changes limited to single doc-comment.

**Patterns Applied:** Security Considerations template, CHANGELOG hook, inline citations, Constraints vs Consequences distinction, Invariant notes, Post-decision notes.

### C1-Fixes: Laura — Test Fixture Deduplication + Minor Refactor (2026-05-23)

**Scope:** Batch 1 persona-review follow-up for test infrastructure.

**Changes:**

- Extracted `makeProfile()` and `seedQualifyingSkill()` helpers into `packages/cairn/src/__tests__/testFixtures.ts`
- Updated imports in orchestrationConfig.test.ts, wave3-pipeline.test.ts, sessionStart.test.ts
- Fixed hidden fixture drift: `sessionStart.test.ts` profile was missing `token.totalCost`
- Added `continue;` after `result.sessionCountReset++` to prevent double-counting bug in `curator.ts`
- Promoted `upsertExecutionProfileWithDb()` from internal use to reduce SQL duplication
- Stripped needless `async` keywords from ~15 synchronous test functions

**Verification:** `npm test --workspace=@akubly/cairn`, `@akubly/forge`, `@akubly/skillsmith-runtime` all passing.

**Notes:** Hidden fixture drift discovered during consolidation; promoted to Fuller Wave 3 shape rather than masking.

### C1-Fixes: Roger — Fail-Open Logging + Automatic Prescriber Summaries (2026-05-23)

**Scope:** Batch 2 persona-review follow-up for skillsmith-runtime and Cairn wiring.

**Changes:**

- Added fail-open `console.warn` logging at three Roger-owned swallow sites:
  - `packages/skillsmith-runtime/src/index.ts` per-hint persistence failures
  - `packages/cairn/src/hooks/sessionStart.ts` orchestration factory creation failures
  - `packages/skillsmith-runtime/src/hooks/sessionStart.ts` bootstrap-level failures
- Hardened Cairn post-curate callback seam so callback failures warn and do not skip remaining side effects
- Added automatic prescriber summary logging (aggregates `CurateResult.prescribers` into one stderr line)
- Removed duplicate `CreatePrescriberOrchestrationConfigOptions` alias
- Extended tests for new logging contract

**Verification:** `npm run build` ✅ green. All workspaces passing.

### C1-Proposal: Graham — Wave 4 Safety + Observability Foundation (2026-05-23)

**Status:** Proposal awaiting Aaron's approval

**Wave 4 Deliverables (3 items + integration tests):**

1. **insertHintIfNew atomicity fix** — partial UNIQUE index + BEGIN IMMEDIATE wrap (publicly committed in PR #21)
2. **Curator observability gap** — CairnEvent extensions for hint state transitions and profile bumps (Option 1 recommended)
3. **Force-overwrite knob** — `forceRegenerate` parameter for operators to bypass dedup

**Deferred to Wave 5+:**
- Global tier fallback (needs cross-granularity category matching)
- Staleness check (needs UX design)
- Observable metrics/dashboard (needs product clarity)
- DB Convention Standardization (repo-wide architectural question)

**Work Items:** W4-1 (UNIQUE index), W4-2 (CairnEvent extensions), W4-3 (forceRegenerate knob), W4-4 (integration tests). ~14 tests total, ~200 LOC incremental.

**Team Ownership:** Roger (W4-1, W4-2), Rosella (W4-3), Laura (W4-4).

**Key Design Decisions Needed:**

- **D1:** CairnEvent Observability Option — which of three observability options? (Recommendation: Option 1, add new triggers as CairnEvents)
- **D2:** forceRegenerate Surface — CLI only or both CLI+MCP? (Recommendation: CLI only for Wave 4)

**Wave 4 Shape:** Tight, foundational. Sets up Wave 5 for richer triggers, global tier fallback, dashboard, automatic prescriber scheduling.

### Decision: Harness Vision Document Drafted (2026-05-23)

**Author:** Graham Knight (Lead / Architect)  
**Status:** Awaiting Aaron's review

**Artifact:** `docs/harness-vision.md` (3,200+ words, 14 sections)

**Summary:** Comprehensive project vision for the Skillsmith Harness (foundational pre-PRD artifact). Covers six chambers (Harness, Cairn, Forge, Geneticist, Curator, Narrator), five session primitives, auditable decision ledger, genetic engineering loop, trust model, phasing, and 10 open questions for PRD authoring.

**Context:** Aaron requested pre-Wave-4 vision seeding. Squad identified Skillsmith Harness as bigger than Forge Wave 4 — distinct system requiring six specialized subsystems with defined chamber boundaries and interaction contracts.

**Key Architectural Decisions Embedded:**

- Working name: Skillsmith Harness (pending Aaron approval)
- Chamber boundaries: Six specialized subsystems
- Primitive taxonomy: Request, Artifact, Observation, Decision, Question
- Ledger model: Hash-linked append-only Merkle-chain in Cairn
- Genetic loop: Selection via change vectors, mutation of skill parameters, fitness = meanNetImpact × confidence
- Trust anchor: Narrator digests + confidence scoring + failed experiment surfacing + provenance links

**What's NOT in Doc (Intentionally):**
- PRD-level detail (work items, test specifications, API contracts)
- Implementation design (specific schemas, hash algorithms, CLI argument parsing)
- Resolved design choices (those belong in ADRs)
- Timeline estimates (vision is direction, not schedule)

**Open Questions Flagged (Hardest 3):**

1. Agent decision authority model — Can agents autonomously approve decisions within delegated scopes?
2. Genetic loop fitness weighting — How to weight token cost vs. drift vs. convergence vs. user acceptance?
3. Deficiency awareness UX — How to surface self-awareness without annoying the user?

**Tension Flagged:** Scope ambiguity between "learning runtime" and "CLI shell." Vision frames both as composable chambers, but chamber interaction contracts are still fuzzy. Specifically: does Harness chamber include slash-command extensibility, agent loading, model routing?

**Next Steps:**
- Aaron reviews/iterates on vision doc
- PRD authoring session (Wave A scope, work item decomposition)
- User story drafting (persona-driven scenarios)
- ADR for Harness/Cairn refactor boundary


---

### 2026-05-04: Design Decision D1 — CairnEvent Observability (Roger)

**Status:** Γ£à Resolved ΓÇö Option 1 (additive CairnEvents) ratified by Aaron

**Resolution:** New event types appended to existing `event_log` table:
1. **hint_state_transition** ΓÇö Emitted on hint insert and status updates with `{skill_id, hint_id, from_state, to_state, timestamp}`
2. **profile_bump** ΓÇö Emitted on profile create/update with `{skill_id, profile_id, bump_kind, granularity, timestamp}`

**Events logged to:** `__system__` session via `ensureSystemSession()` helper

**Rationale:**
- Smallest delta, fully backward-compatible, preserves existing events, zero compatibility risk
- Solves observability gap blocking Wave 5 re-prescribe triggers (on rejection, on profile bump, on staleness)
- Richer alternatives (Option 2: dedicated channel; Option 3: unified refactor) deferred to Wave 5+

**Test Coverage:** Γ£à 5/5 integration tests passing (Group B)
- Hint state transition on insert
- Hint state transition on status update
- Profile bump on create/update
- Forward-compat with unknown event types
- Transactional integrity

**Files Modified:**
- `packages/cairn/src/db/optimizationHints.ts`
- `packages/cairn/src/db/executionProfiles.ts`
- `packages/cairn/src/db/sessions.ts` (ensureSystemSession helper)
- `packages/cairn/src/__tests__/cairnEvents.test.ts` (5 new tests)

---

### 2026-05-04: Design Decision W4-1 — insertHintIfNew Atomicity (Roger)

**Status:** Γ£à Implemented

**Context:** Wave 3 deferred insertHintIfNew atomicity race. Current check-then-insert allows concurrent callers to both insert duplicates for same (skill_id, source, category).

**Resolution:** Migration 013 with partial UNIQUE index + BEGIN IMMEDIATE transaction.

**Index Schema:**
`sql
CREATE UNIQUE INDEX idx_optimization_hints_active_dedup
  ON optimization_hints(skill_id, source, category)
  WHERE status IN ('pending', 'accepted', 'deferred');
`

**Rationale:**
- Partial index only enforces uniqueness for active statuses (pending, accepted, deferred)
- Terminal statuses (applied, rejected, expired, suppressed, failed) excluded ΓåÆ historical hints coexist
- Matches existing ACTIVE_HINT_STATUSES constant

**Transaction Isolation:** `db.transaction().immediate()` acquires write lock upfront before reads, preventing concurrent duplicates.

**Behavior on Conflict:** UNIQUE constraint violation treated as duplicate; fetch existing hint ID via `findActiveHintId()`.

**Test Coverage:** Γ£à 3/3 integration tests passing (Group A)
- Single insert succeeds normally
- Duplicate insert returns existing hint ID
- Concurrent inserts via immediate transactions ΓåÆ only one wins

**Files Modified:**
- `packages/cairn/src/db/migrations/013-hint-atomicity.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/optimizationHints.ts` (transaction wrapper)
- `packages/cairn/src/__tests__/optimizationHints.test.ts` (3 new tests)



# Archived: 2026-05-31T06:05:26Z

### 2026-05-22: Eureka Project Kickoff — Name + Repo Placement Decided

**Status:** ✅ CLOSED (Aaron decided)  
**Date:** 2026-05-22  
**Decision:** Project named **Eureka**; built in `packages/eureka/` (monorepo); 3 specialists hired into existing squad

**What Was Decided:**
1. The agentic brain/memory/thinking/learning system is named **Eureka**
2. Location: `packages/eureka/` in this monorepo (not separate repo)
3. New squad members: Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)
4. Existing squad continues Cairn/Forge; Valanice shifts 60% to Eureka UX

**Why:**
- User decision after 4 rounds of deliberation (Rounds 1–2: repo placement; Round 3: squad fit assessment)
- Cross-repo coordination overhead exceeded bounded-context benefit at this scale (3 new hires, solo orchestrator)
- Package-level boundary is sufficient enforcement; can extract to separate repo in Phase 5+ if org-tier federation needs backend service
- New specialists bring epistemology/cognitive systems expertise that current squad lacked

**Key insight from Round 3 (Squad Fit):**
- Current squad (Graham, Roger, Alexander, Valanice) correctly identified expertise gaps: cognitive science, knowledge graphs, agentic learning loops, epistemology
- Recommendation: Hire domain specialists (✅ DONE) rather than stretch current platform team
- Existing squad continues advisory roles on boundaries/UX (Graham 2-3 hrs/week, Valanice 40% Cairn)

**Artifacts:**
- Orchestration log: `.squad/orchestration-log/2026-05-22T20-49-46-onboarding-eureka-hires.md`
- Session log: `.squad/log/2026-05-22T20-49-46-eureka-hires.md`
- Decision directive (merged here): the Eureka naming directive
- New agent folders: `.squad/agents/{genesta,crispin,edgar}/` with charters + history
- Team roster updated: 14 members (was 11)

---

## Active Decisions

# Open Question: Brain/Memory/Learning System — Repo Placement

**Status:** Deliberation (Round 2 consulting, no final decision)  
**Date:** 2026-05-22  
**Requestor:** Aaron  
**Consulting Agents:** Graham Knight (Lead), Roger Wilco (Platform), Alexander (SDK/Runtime), Valanice (UX)
### Wave 4 Scope Approved (Graham, 2026-05-23)

**Status:** Γ£à Ratified by Aaron

**Wave 4 Deliverables:**
1. **W4-1** ΓÇö insertHintIfNew atomicity fix (partial UNIQUE index + BEGIN IMMEDIATE) ΓÇö Roger Γ£à
2. **W4-2** ΓÇö Curator observability gap (CairnEvent extensions for hint state transitions + profile bumps) ΓÇö Roger Γ£à
3. **W4-3** ΓÇö Force-overwrite knob (--force CLI flag for forceRegenerate) ΓÇö Rosella Γ£à
4. **W4-4** ΓÇö Integration tests (~14 tests, ~200 LOC) ΓÇö Laura (9/14 passing; test infra gaps identified)

**Team Ownership:** All work items assigned and implemented on phase-4.6/wave-4 branch (commits 978d7a0..1808d8f).

## The Question

Should a new agentic brain/memory/thinking/learning system be:
1. **NEW REPO** (@akubly/cortex, @akubly/synapse, etc.) — standalone product with independent release cadence
2. **NEW PACKAGE in this repo** (packages/mem/) — satellite package alongside Cairn/Forge
3. **EXTEND CAIRN** (same package) — Curator extension for pattern learning

## Agent Recommendations (Round 2, Refined)

### Graham Knight — NEW REPO (High conviction)

**Key insight:** Five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) confirms system boundary shift.

**Why:**
- User-memory tier is cross-repo infrastructure (cwd-aware hooks outside this monorepo)
- Brain is a **runtime** with control loops (meditate, dream, pray), not a library
- KINDS are ontological (practical, semantic, linguistic, symbolic, philosophical) — no overlap with Cairn's types
- PROPERTIES (recency, trustworthiness, plasticity) are learning primitives, not event signals
- REPRESENTATION (graph + versioning) differs from Cairn's SQLite + event log

**Verdict:** This isn't a Cairn extension. It's a product with zero hard dependencies on Cairn/Forge.

---

### Roger Wilco — NEW PACKAGE in Monorepo (Medium conviction, pragmatic)

**Key insight:** FLIPPED from "extend Curator." Multi-tier + polyglot system can't fit in Curator, but can fit as separate package.

**Why:**
- Monorepo velocity (shared build, shared types, single test suite)
- Cairn stays focused (project-level knowledge, not multi-scope router)
- Clean delegation: packages/mem/src/tiers/project.ts wraps Cairn Curator
- Tier/kind federation avoids schema conflicts and package boundary violations

**Trade-off:** Org-tier federation (multi-writer shared memory) still wants backend service later, but Phase 1-3 can use SQLite + Git.

**Verdict:** NEW PACKAGE as pragmatic step; extract to separate repo in Phase 5+ if org-tier backend service is needed.

---

### Alexander — NEW REPO (High conviction)

**Key insight:** FLIPPED from monorepo. Q3 (org-tier federation) reveals backend/deployment boundary.

**Why:**
- **Q1 (Runtime coupling):** Brain is Forge sibling, not layer on Forge — separate repo avoids confusion
- **Q2 (User-tier distribution):** CAN work from monorepo via npm, BUT separate repo enforces "no accidental Forge deps"
- **Q3 (Org-tier federation):** Wants Postgres + Azure Functions as separate deployment unit — this is the decisive factor

**Key argument:** The 5-dimension expansion is 10x scope increase. Original analysis (monorepo works) was correct for narrow scope; Graham's position is correct for expanded scope.

**Verdict:** If brain's org tier needs Postgres + backend service, it's a separate system boundary. Matches deployment boundaries, not just code boundaries.

---

### Valanice — NEW REPO with Phased Extraction (Medium conviction)

**Key insight:** Infrastructure positioning determines repo choice; mental model boundaries matter for discoverability.

**Why:**
- Brain is **infrastructure** (like Git, Redis) that follows the user globally and hooks per-repo
- Installation story: 
pm install -g @akubly/brain (not embedded in Cairn)
- Branding independence signals "infrastructure for any agentic system," not "Cairn feature"
- UX principle: Mental model boundaries should match repo boundaries

**Phased approach:**
- **MVP (Prototype in monorepo):** xperiments/brain/ or packages/brain/
- **Extract when:** Brain has independent CLI, MCP server, test suite, branding decision
- **Branding options:** Synapse, Mneme, Cortex, Engram

**Verdict:** Lean toward separate repo, but prototype in monorepo first to validate scope.

---

## Summary of Positions

| Agent | Position | Conviction | Reasoning Core |
|-------|----------|-----------|-----------------|
| **Graham** | NEW REPO | 🟢 High | System boundary (5 dimensions) |
| **Roger** | NEW PACKAGE | 🟡 Medium | Pragmatic: monorepo velocity, can extract later |
| **Alexander** | NEW REPO | 🟢 High | Org-tier backend service = deployment boundary |
| **Valanice** | NEW REPO (phased) | 🟡 Medium | Infrastructure positioning + phased extraction |

**Consensus:** 3 agents recommend NEW REPO (Graham, Alexander, Valanice); 1 recommends NEW PACKAGE (Roger, pragmatic compromise).

---

## Open Questions for Aaron

1. **Is brain Cairn/Forge-exclusive, or infrastructure for any agentic system?**
   - If exclusive: NEW PACKAGE makes sense; Roger's approach is solid
   - If infrastructure: NEW REPO makes sense; Graham + Alexander + Valanice alignment is strong

2. **What's the MVP scope?**
   - If 2-week prototype: Keep in xperiments/brain/ for now
   - If 2-month full system: Decide repo placement before implementation

3. **Who is the primary user?**
   - If agents (LX-first): Infrastructure positioning → NEW REPO
   - If humans (UX-first): Could be either, but tooling/discovery favors NEW REPO

4. **How soon is org-tier federation needed?**
   - If Phase 1-2 MVP: SQLite + Git works, monorepo packaging is OK (Roger path)
   - If Phase 3+ scaling: Postgres + backend needed, repo boundary matters (Alexander path)

5. **Backend service story?**
   - If Postgres + sync service: Separate repo is cleaner (deployment boundary)
   - If stay local (SQLite + cwd-aware hooks): Either repo works

---

## Impact Analysis

### If NEW REPO
- **Coordination:** Separate squad, separate release cadence
- **Squad changes:** Forge + Types must publish to npm; Cairn depends on Brain
- **Timeline:** Phase 0-4 for brain squad (parallel to Phase 5 PGO)
- **Risk:** Version skew between Cairn and Brain

### If NEW PACKAGE in Monorepo
- **Coordination:** Same squad, shared build/test/types
- **Squad changes:** Create packages/mem/, implement tier delegation to Cairn
- **Timeline:** Integrate into main roadmap (maybe Phase 5 stretch goal)
- **Risk:** Org-tier federation later wants backend service (deployment boundary mismatch)

### If Extend Cairn
- **Rejected by all agents** — violates single responsibility, schema conflicts, architectural mismatch

---

## Session Log

See .squad/log/2026-05-22T20-25-51-brain-repo-deliberation.md for full Round 1 + Round 2 synthesis.

See .squad/orchestration-log/2026-05-22T20-25-51-*.md for individual agent analyses (4 files).

---

## Artifact Status

- **Inbox files:** 7 files to be archived after decision
  - graham-brain-repo-placement.md (Round 1)
  - oger-curator-overlap-analysis.md (Round 1)
  - graham-brain-refined.md (Round 2)
  - oger-brain-refined.md (Round 2)
  - lexander-brain-refined.md (Round 2)
  - lexander-forge-coupling-analysis.md (analysis)
  - alanice-brain-ux.md (Round 2)

- **Orchestration logs:** 4 files created (2026-05-22T20-25-51-*.md)

- **Session log:** 1 file created (2026-05-22T20-25-51-brain-repo-deliberation.md)

---

**Status:** Deliberation ongoing. Aaron to decide. Once decision is made, this section will either close as a decision or pivot to implementation planning.

---

# R5 PRD v3: Eureka v1 Product Requirements Document (Canonical Specification)

**Author:** Cassima (Product Manager)  
**Date:** 2026-05-24  
**Status:** Draft v3 — incorporates Aaron's 9 R5 round-3 OQ resolutions  
**Ceremony Context:** R5 (Requirements) round 3 — supersedes v2 on every point of conflict  
**Canonical note:** This specification is preserved verbatim as the ground truth for R6 reconciliation work. See R6 sections below for substrate reconciliation findings.

*[Full PRD v3 text preserved below]*

---

# Open Question: Squad Fit for Brain/Memory/Learning System

**Status:** Self-assessment complete (Round 3)  
**Date:** 2026-05-22  
**Requestor:** Aaron  
**Self-Assessing Agents:** Graham Knight (Lead), Roger Wilco (Platform), Alexander (SDK/Runtime), Valanice (UX)

---

## Summary: Does This Squad Fit?

**Unanimous honest verdict: NO. This squad is NOT the right primary owner for the brain project.**

**Recommendation:** New squad with epistemology + knowledge-graph expertise. Current squad continues Cairn/Forge; offers advisory roles.

---

## The Core Mismatch

**This squad was assembled for:** Cairn (observability/event pipeline) + Forge (SDK deterministic runtime) — a platform team  
**Brain needs:** Cognitive infrastructure, knowledge representation, agentic reasoning loops, epistemology — a cognitive systems team

**These are orthogonal problem domains.** Adding brain to this squad splits focus and dooms both Cairn/Forge stabilization and brain delivery.

---

## Graham Knight (Lead) — NEW SQUAD REQUIRED

**Honest verdict:** NO for brain leadership.

**Reason:** Graham excels at platform architecture (boundaries, technology trade-offs, systems design). Brain requires **epistemology-first** leadership. No shipping experience with ontologies, reasoning loops, or knowledge consolidation.

**Can contribute:** Advisory role on system boundaries and technology selection (2-3 hrs/week).

**Key finding:** Graham's brain recommendations so far focus on repo placement and scope boundaries (classic platform thinking). Brain's harder problems — "What makes knowledge durable?" "How do tiers consolidate learning?" — require someone with cognitive systems expertise.

**Leadership profile needed:**
- Epistemology/knowledge representation theorist (PhD-level)
- Shipped graph-based learning systems or similar
- Thinks in ontologies, not layers
- Comfortable with uncertainty and probabilistic models

---

## Roger Wilco (Platform Dev) — PARTIAL FIT (PHASE 1-3 INFRASTRUCTURE)

**Honest verdict:** YES for infrastructure, NO for cognition.

**Energy breakdown:**
- 🟢 HIGH: TIERS, PROPERTIES, REPRESENTATION, ACQUISITION (Cairn patterns transfer)
- 🔴 LOW: ACTIVITIES (dream/meditate/pray), KINDS (semantic/linguistic/symbolic) — unfamiliar

**Recommendation:** Stay as Platform Lead for Phase 1–3 infrastructure (storage, federation, acquisition). Hand off reasoning + ontology to specialists.

**Can contribute:** Phase 1-3 infrastructure build. Phase 3+ transition to Cairn as brain's backend service needs emerge.

**Needed alongside:** LLM/agentic specialist + knowledge ontology specialist + graph DB specialist (optional).

---

## Alexander (SDK/Runtime Dev) — BOUNDARY SPECIALIST ONLY

**Honest verdict:** NO for core work. YES for boundaries and integration.

**Design philosophy mismatch:**
- Forge: "How do I make non-determinism safe?" (containment, control)
- Brain: "How do I make non-determinism useful?" (autonomy, discovery)

These are opposing philosophies. Knowledge representation, learning loops, agentic coordination — these are outside Alexander's expertise.

**Can contribute:** Boundary specialist — design Brain ↔ Forge adapter, npm publishing strategy, type safety proofs.

**Needed alongside:** Agentic systems architect + knowledge representation designer.

---

## Valanice (UX/Human Factors) — 70% YES, 30% NO

**Honest verdict:** YES for UX/LX, NO for cognitive science.

**Strong transfer (🟢 HIGH):**
- Mental model boundaries (repo placement mirrors mental models)
- Interaction design (pull-based, max 1 proactive insight per session)
- LX optimization (MCP tools, context budgets, signal density)
- Config surfaces (trust thresholds, recency gradients, plasticity policies)
- Observable vs invisible design

**Critical gaps (🔴 LOW):**
- Cognitive science fundamentals (what does "meditation" mean neurologically?)
- Knowledge ontology (are the five kinds exhaustive? mutually exclusive?)
- Graph information architecture (traversal algorithms, semantic linking)
- Learning primitives semantics (recency decay, trustworthiness measurement)

**Recommendation:** Lead interaction design. Bring cognitive scientist + information architect alongside.

**Can contribute:** 70% of team. Other 30% is cognitive science + knowledge management expertise. Without them, brain has beautiful UX on shaky assumptions.

---

## Squad Composition: Recommended Path

**Current Squad Role:**
- ✅ **Graham, Roger, Gabriel, Alexander, Rosella, Laura** — Continue Cairn/Forge
- 🟡 **Graham + Valanice** — Advisory roles on brain (2-3 hrs/week) for boundaries/UX
- 🟡 **Roger** — OPTIONAL: Phase 1-3 infrastructure if assigned

**New Squad for Brain:**
1. **Lead:** Epistemology/Knowledge Systems architect (PhD-level, shipped graph-based systems)
2. **Graph/Vector Specialist:** neo4j/PostgreSQL + vector stores, ontology design
3. **Distributed Systems Engineer:** Federation, conflict resolution, versioning
4. **Agentic Learning Systems Engineer:** Reinforcement learning, meta-learning, reasoning loops
5. **Observability/Testing Bridge:** Interface with Laura/Gabriel (observation-focused testing)

---

## Missing Expertise Clusters

| Expertise | Current Squad | Brain Needs | Severity |
|-----------|---------------|-------------|----------|
| **Knowledge Graph Architecture** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Vector/ML Systems** | ❌ None | ✅ Important | 🔴 BLOCKER |
| **Epistemology/Knowledge Representation** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Distributed Systems (federation)** | ❌ None | ✅ Important | 🔴 BLOCKER |
| **Cognitive Systems/Agentic Loops** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Backend/Services** | ✅ Roger | ✅ Useful Phase 2+ | 🟡 SECONDARY |
| **Testing/Verification** | ✅ Laura | ✅ Useful | 🟡 SECONDARY |
| **DevOps/Deployment** | ✅ Gabriel | ✅ Useful Phase 3+ | 🟡 SECONDARY |

---

## Per-Member Recommendation

### Can Stay on Cairn/Forge
- ✅ Graham (architecture, boundaries)
- ✅ Roger (backend, data layer)
- ✅ Gabriel (deployment, CI/CD)
- ✅ Laura (testing, verification)
- ✅ Rosella (plugin architecture, SDK integration)
- ✅ Alexander (SDK runtime, Forge coupling)

### Can Contribute to Brain (Advisory Only)
- 🟡 Graham — System boundaries, technology selection (not leadership)
- 🟡 Valanice — Interaction design, LX optimization (60% contribution rate)

### Should NOT Work on Brain (Wrong Domain)
- ❌ Rosella — Plugin architecture is orthogonal
- ❌ Alexander (core) — SDK abstraction is orthogonal (keep as boundary specialist)

---

## Three Options for Aaron

### Option A: Fresh Squad (🟢 RECOMMENDED)
**Brain gets its own squad** with epistemology + graph DB + distributed systems expertise.
- **Outcome:** Brain gets undivided focus and right expertise. Cairn/Forge stabilization uninterrupted.
- **Timeline:** Parallel to Phase 5 PGO work
- **Risk:** New team ramp-up, version skew between brain and Cairn

### Option B: Current Squad + 3 Specialists (❌ NOT RECOMMENDED)
**Graft epistemology, graph DB, and distributed systems engineers** onto existing squad.
- **Risk:** Graham still leads a domain he doesn't have DNA for. Cairn/Forge work stalls. Hybrid squads split focus and underdeliver both.

### Option C: Keep Everything in Current Squad (❌ REJECT)
**Suicide by overcommit.** Cairn/Forge doesn't stabilize, brain never ships.

---

## Open Questions for Aaron

1. **Is brain Copilot-specific infrastructure or general agentic infrastructure?**
   - If Copilot-specific → maybe this squad could own it (bad idea, but possible)
   - If general → definitely needs new squad

2. **What's the MVP timeline?**
   - If 2 weeks → prototype in current squad (risky, rush job)
   - If 2+ months → new squad (recommended)

3. **How important is the epistemology layer?**
   - If "storage only" → current squad could do it (still not ideal)
   - If "learning system" → new squad required

4. **Budget for 3–5 new hires?**
   - If yes → new squad (go)
   - If no → delay brain until Cairn/Forge done, then hire for it

---

## Artifacts

**Orchestration logs (4 files):** `.squad/orchestration-log/2026-05-22T20-32-55Z-{agent}.md`
- Graham: HIGH conviction, NEW SQUAD required
- Roger: HIGH confidence, Phase 1-3 infrastructure only
- Alexander: HIGH conviction, keep as boundary specialist
- Valanice: MEDIUM conviction, 70% UX/LX yes, 30% cognitive science no

**Session log (1 file):** `.squad/log/2026-05-22T20-32-55Z-brain-squad-fit.md`

**Merged source analyses:**
- Graham's squad-fit analysis
- Roger's self-fit analysis
- Alexander's self-fit analysis
- Valanice's self-fit analysis

**Status:** OPEN QUESTION — Strong recommendation toward fresh squad, awaiting Aaron's input on budget, timeline, and scope.


---

## R5 PRD v3 Full Specification (Canonical)

[Full PRD v3 text — 48KB, preserved verbatim]

### Changelog from v2

Every delta below cites the OQ directive that drove it.

- **Attention tier transitions:** Minimal v1 rules locked: default=warm; commit→hot; retire→warm; sweep-aged demotion only (no auto-promotion); session-count hysteresis; precedence explicit > commit > sweep-aged > default. N/M placeholders R6-tunable.
- **Storage primitive (OQ-2):** v1 strawman locked: SQLite + sqlite-vec, per-tier uniform .db files at FR-7.2 paths; embedder injected. Flagged "pending R6 review against Cairn."
- **Commit follow-through (OQ-3):** Three-stage evolution locked: v1 = pull-with-boost only; v1.5 = list_active_commitments(scope) caller-initiated; retire() explicit-only + sweep emits stale-flag (never auto-retires); v2 = opt-in commit_floor?.
- **Decide schema (OQ-4):** Full structured schema locked: {question, options:[{id, label, rationale?, rejected_for?}], chosen, rationale, principal_id, confidence?, supersedes_decision_id?, revisit_at?, timestamp}. Decider renamed to principal_id.
- **Edge types (OQ-5):** Restructured into three tiers. Tier 1 eager (10): derived_from, references, contradicts, supersedes, part_of, instance_of, precedes, defined_in, decided_by, committed_in. Tier 2 sweep (2): similar_to, co_accessed_with. Tier 3 parking lot (6): caused_by, useful_for, equivalent_to, responds_to, requires, analogous_to. Tags explicitly excluded.
- **Contemplate in v1 (OQ-6):** Omitted from v1 exports entirely — no callable export, no type export, no stub. Reserved in FR-10 vocabulary table only.
- **Trust decay (OQ-7):** No automatic trust decay in v1. Trust is event-driven only. Time_since_last_verification derived field (not stored). Sweep emits stale_trust flag (does not mutate trust). T2 RESOLVED.
- **Ranker weights/formula (OQ-8):** Locked: raw = 0.5·rel + 0.2·imp + 0.2·trust + 0.1·rec; final = raw × attention_multiplier (hot=1.20, warm=1.00, cold=0.80); trust floor 0.15 (gate, configurable). T3 RESOLVED.
- **Session model (OQ-9):** Replaced. Sessions are kind=session facts (NOT a sibling table, NOT a field on every entry). New FR-13 specifies schema; FR-9 edge enum gains originated_in, modified_in, referenced_in (Tier 1) and recalled_in (Tier 2, per-session dedup).

---

## 2026-05-24: Aaron's R6 Signals (Post-Trio Reconciliation)

**By:** Aaron Kubly (via Copilot)  
**Date:** 2026-05-24  
**What:** After reading Genesta/Crispin/Edgar's R6 reconciliation reports, Aaron contributed four signals to fold into Cassima's synthesis

### Four R6 Signals

1. **"Session" is the Copilot nomenclature — converge on it.** PRD v3 has `kind=session` facts. Cairn has a `sessions` table. Aaron's position: these *are* both describing the same thing. Don't rename PRD's `kind=session` to `kind=conversation` (Genesta's proposed patch). Instead, treat the collision as a signal that we need ONE session concept across the stack. Cassima/Crispin to figure out the mechanics — table vs fact vs both — but the *name* stays `session`.

2. **Decisions in Cairn/Forge already include human decisions.** Worth keeping in mind: the existing `DecisionRecord` is about auditing the reasoning chain and building trust, not just an agent log. PRD v3's `decide` schema and the existing one are closer in spirit than Crispin's "flat vs structured, irreconcilable" framing suggests.

3. **Aaron likes the substrate overlap.** Curator≈sweep, confidence≈trust, decision records — these convergent designs are a *feature*, not a problem. Lean into the overlap rather than around it.

4. **Path D probe — design with Cairn in mind, don't force Cairn to adopt yet.** Is there a fourth strategy beyond Genesta's extend-Cairn (Path C), Crispin's clean-slate (Path A), and Edgar's shared-kernel-extract (Path B)? Specifically: design Eureka's graph model and storage **as if** the shared kernel existed and Cairn used it, but **don't** force Cairn to migrate now. Eureka ships standalone but kernel-shaped. Cairn migrates later when there's a reason. Decouples timeline pressure from architectural correctness.

### Rationale for Four Signals

These signals come from Aaron's product judgment about:
- (a) Copilot ecosystem alignment
- (b) what Cairn/Forge decisions actually mean
- (c) where the substrate convergence is doing real work
- (d) how to avoid Edgar's "refactor everything first" timeline trap without falling into Crispin's "throw it all away" disconnection

### Direction to Cassima

Aaron's four signals serve as constraints + a new Path D to evaluate, combined with the three trio reports. Cassima inherits these as input for recommending v3.1 (if reconciliation is clean) or v4 (if a path change is warranted). She holds the pen.

---

## 2026-05-25: Cassima R6 Synthesis — Path D Vindicated, v3.1 Patch Recommended

[Detailed synthesis pending — see `.squad/decisions/archive/` for full R6 closure]

---

## 2026-05-27: OQ-1 Resolved — Monorepo Accepted (ADR-0002)

**Status:** ✅ DECIDED  
**Date:** 2026-05-27  
**Decided By:** Aaron  
**Documented By:** Graham (Lead/Architect)

**Decision:** Merge `mem/` and `harness/` into a single `@akubly/` monorepo with shared `packages/{cairn,forge,types}` and project-specific `packages/{eureka,crucible}`.

**Trade-off accepted:** One-time migration cost (repo merge, CI consolidation, workspace rewiring) over ongoing coordination overhead of synchronising shared types across two repositories.

**Cross-references:**
- [ADR-0002](../../docs/eureka/adrs/0002-shared-substrate-ownership.md) — full decision record with options analysis
- FR-12 mechanism #8 — ESLint cross-system session-type import ban; trivially enforceable in monorepo
- FR-13 — `SessionId` branded primitive; single source of truth by construction
- §70 T7 — shared substrate ownership tension (now resolved)

**Implications for London-school TDD:** The mock seams for `@akubly/types` `SessionId` brand are now stable. Laura can rely on a single resolved shared substrate when designing outside-in tests — the `SessionId` import path will not change shape based on substrate topology. Mock contracts authored against `@akubly/types` in the monorepo are final; no seam drift risk from OQ-1 remains.

**Signed:** Graham (Architecture)

---

## 2026-05-27: §55 Review Discovered §30 Updates (Edgar Follow-ups)

**Date:** 2026-05-27  
**Author:** Edgar (Learning Systems Specialist)  
**Context:** Review of Laura's §55 TDD Strategy against §30 Learning Systems  
**Status:** Three non-blocking improvements identified for §30

### Background

Laura authored §55 (London-school TDD strategy) without reading §30 (anti-anchoring discipline). Review verdict: **APPROVED WITH NOTES**. Three seam mismatches discovered where §30 should evolve to match what outside-in tests revealed, not the other way around.

### Decision Items

#### 1. Add Time-Mocking Guidance to §30

**What:** Add subsection "2.4 Time Injection for Testability" to §30 Property Dynamics.

**Why:** §30's recency formula `(now() - last_accessed) / 86400` is time-dependent. Tests need deterministic clock. §55 correctly mocks storage I/O but is silent on time. §30 should document the seam.

**Proposed §30 addition:**

```markdown
### 2.4 Time Injection for Testability

**Testing Requirement:** Recency calculations depend on `now()`. Tests must inject a deterministic clock.

**Interface (extraction-ready):**
```typescript
// packages/eureka/src/learning/properties/clock.ts
export interface ClockProvider {
  now(): number;  // Unix epoch ms
### Design Decision D2: forceRegenerate Surface (Rosella, 2026-05-23)

**Status:** Γ£à Resolved ΓÇö CLI only for Wave 4 per Aaron's D2 decision

**Resolution:** --force CLI flag for forge-prescribe to bypass hint deduplication and force re-emission.

**Implementation:**
- Flag name: `--force` (boolean, default: false)
- Semantics: UPDATE active hints to `status = 'expired'` before calling `insertHintIfNew()`
- MCP surface: **EXCLUDED** from Wave 4 per Aaron's D2 decision (deferred to Wave 5 with full Phase 5 scope clarity)
- Call path: CLI ΓåÆ `runForgePrescribe()` ΓåÆ `executePrescriberRun({ forceRegenerate })` ΓåÆ `expireActiveHints()` + `insertHintIfNew()`

**Rationale:**
- Closes critical operator workflow gap (recovery from hint rejection storms)
- CLI surface immediate relief for documented operator need
- MCP generalization (confirmation prompts, safety guards) defers to Wave 5

**Trade-off Accepted:**
- Gain: Operator escape hatch live immediately via CLI
- Trade-off: Operators stay in manual-override mode longer; MCP automation deferred to Wave 5

**Test Coverage:** Γ£à Unit tests 8/8 passing; integration group C 1/4 (3 failures = test infra)
- forceRegenerate reduces skipped count when duplicates exist
- Only expires hints matching (skill_id, source, category)
- Does NOT expire terminal-status hints
- MCP surface correctly excluded

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts`
- `packages/runtime-cli/src/cli.ts`
- `packages/runtime-cli/src/__tests__/forgePrescribe.test.ts` (4 new tests)

### Integration Test Pattern: Monorepo Singletons (Laura, 2026-05-24)

**Status:** Γ£à Resolved ΓÇö Module import standardization + `:memory:` DB pattern

**Root Cause Identified:** TypeScript module singleton fragmentation from mixed import paths in integration tests.

**Problem:** Test setup imported from source paths (`../../../cairn/src/...`); implementation from package barrels (`@akubly/cairn`). These resolved to different module instances in TypeScript's dependency graph, each maintaining separate singleton state. Test beforeEach seeded DB in one instance; runForgePrescribe opened DB in the other.

**Decision:** Standardize integration test pattern to match wave2/wave3 conventions:

1. **Import from package barrels only** ΓÇö No source path imports
   - `import { getDb, closeDb, ... } from '@akubly/cairn'` Γ£à
   - NOT `import { getDb } from '../../../cairn/src/db/index.js'` Γ¥î

2. **Use `:memory:` DB singleton pattern**
   ```typescript
   beforeEach(() => {
     closeDb();
     getDb(':memory:');  // Creates singleton
   });
   
   afterEach(() => {
     closeDb();  // No file cleanup needed
   });
   ```

3. **Pass `dbPath: ':memory:'` to functions** ΓÇö Reuses singleton from beforeEach

4. **Test helper functions** for setting up test data with seeded vectors

**Rationale:**
- Singleton behavior only guaranteed if all code imports from the same module path
- `:memory:` DBs auto-close; eliminates Windows EBUSY cleanup errors
- Matches established patterns in wave2-pipeline/wave3-pipeline/runtime-cli tests
- Faster test execution (in-memory vs file-backed)

**Implementation:** Commit 472e77d

**Test Results Before Fix:** 9/14 passing (5 infrastructure failures in Groups C & D)  
**Test Results After Fix:** 14/14 passing Γ£à  
**Repo-wide:** 644/647 tests passing

**Files Modified:**
- `packages/forge/src/__tests__/wave4-pipeline.test.ts` ΓÇö Imports fixed, DB pattern standardized, all tests green

**Consequences:**
- Γ£à Wave 4 integration tests now fully passing
- Γ£à All three work items (W4-1, W4-2, W4-3) validated end-to-end
- Γ£à Windows EBUSY cleanup issue eliminated
- Γ£à Pattern documented for future test authors
- Trade-off: Cannot test file-based DB persistence in integration suite (acceptable; unit tests can cover if needed)

**Related Evidence:**
- wave2-pipeline.test.ts (established pattern)
- wave3-pipeline.test.ts (reference implementation)
- runtime-cli forgePrescribe.test.ts (unit test reference)

### Raw-SQL Constraint Test Pattern for DB Invariants (Laura, 2026-05-24)

**Status:** Γ£à Implemented in PR #22 cloud review cycle

**Context:** PR #22 Copilot review (Thread 3) flagged that the "concurrent inserts" test in `optimizationHints.test.ts` ran both transactions sequentially and relied on `insertHintIfNew`'s internal dedupe logic, never proving the partial UNIQUE index fired independently.

**Decision:** For any DB constraint that is the subject of a test (not just a side effect), the test should bypass the business-logic wrapper and assert the constraint directly via raw SQL. This applies to:
- Partial UNIQUE indexes
- CHECK constraints
- Foreign key constraints

**Rationale:** Functional wrappers can mask constraint failures. If `insertHintIfNew` is refactored to check existence differently, the old "concurrent inserts" test would still pass even if the UNIQUE index was accidentally dropped.

**Implementation:** 
- Added `'partial UNIQUE index rejects a raw duplicate active-status insert'` test in `packages/cairn/src/__tests__/optimizationHints.test.ts`
- Uses raw `db.prepare().run()` to insert a second active-status row for the same `(skill_id, source, category)` tuple and asserts `UNIQUE constraint failed`
- Also verifies terminal-status rows bypass the partial index

**Commit:** 81fd6a8 (cycle 3)

### forceRegenerate Test Must Exercise Both Branches (Laura, 2026-05-24)

**Status:** Γ£à Implemented in PR #22 cloud review cycle

**Context:** PR #22 Copilot review (Thread 1) flagged that the forceRegenerate test only exercised the `false` path. The `true` path (which calls `replaceActiveHintAtomically`) was unexercised.

**Decision:** Any feature with a boolean fork (`forceRegenerate: true/false`) should have assertions on both branches in the same test or closely related tests. For the `true` path specifically, assert behavioral consequences (state change) not just return values.

**Implementation:** 
- Extended the existing test to add a second call with `forceRegenerate: true`, capturing the previously-active hint ID
- Asserts `status === 'expired'` post-run, plus `skipped === 0` and `inserted > 0`

**Commit:** 81fd6a8 (cycle 3)

### Narrow UNIQUE Constraint Catches in Cairn DB Layer (Roger Wilco, 2026-01-31; merged 2026-05-25)

**Status:** Γ£à Ratified and implemented in PR #22

**Decision:** For all UNIQUE constraint error handling in the cairn db layer, use a two-part check:

1. `(err as any).code === 'SQLITE_CONSTRAINT_UNIQUE'` ΓÇö confirms the error is a UNIQUE constraint violation (not a foreign key, CHECK, or NOT NULL constraint)
2. Column-tuple check on the specific index columns ΓÇö confirms it's the intended index, not the PK or another UNIQUE index

**Do NOT use** a bare `err.message.includes('UNIQUE constraint failed')` check. That string prefix matches ALL UNIQUE violations on the table, including PK collisions on `.id`, which are real bugs that should propagate.

**Context:** PR #22 review (Thread 1) identified that the original `insertHintIfNewWithinTransaction` catch block used:
```typescript
if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
```
This swallows PK collisions on `optimization_hints.id`, masking potential bugs.

**Correct Pattern (active-dedup index in optimizationHints.ts):**
```typescript
if (
  err instanceof Error &&
  (err as any).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
  err.message.includes('optimization_hints.skill_id') &&
  err.message.includes('optimization_hints.source') &&
  err.message.includes('optimization_hints.category')
) {
  // Treat as concurrent duplicate ΓÇö fetch existing hint id
} else {
  throw err;  // PK collision or unexpected constraint ΓÇö propagate
}

export const systemClock: ClockProvider = {
  now: () => Date.now()
};
```

**Test pattern:**
```typescript
const mockClock = { now: vi.fn().mockReturnValue(1609459200000) };  // 2021-01-01
const recency = computeRecency(fact.last_accessed, mockClock);
expect(recency).toBe(0.5);  // 1-day-old at formula parameters
```

**Design note:** This is FR-12 mechanism #1 (extraction-ready boundary). ClockProvider has no Eureka-specific types.
```

**Impact:** Low — doesn't change algorithm, just documents testability boundary.
The active-dedup partial index is `idx_optimization_hints_active_dedup` on `(skill_id, source, category) WHERE status IN ('pending', 'accepted', 'deferred')`. SQLite error message format: `UNIQUE constraint failed: optimization_hints.skill_id, optimization_hints.source, optimization_hints.category`.

**Rationale:**
- Avoids silently discarding PK collisions or violations from future UNIQUE indexes on other column tuples
- `SQLITE_CONSTRAINT_UNIQUE` code confirms constraint class before inspecting the message
- Column-tuple check is the precise discriminator between the active-dedup index and the PK
- Pattern is consistent and testable: PK collision test confirms the error propagates

**Commit:** dcdcd26 (cycle 4)


### Decision: Harness Vision Document Drafted (Graham, 2026-05-23)

**Status:** Awaiting Aaron's review

**Artifact:** docs/harness-vision.md (3,200+ words, 14 sections)

**Next Steps:** PRD authoring session (Wave 5 scope)

### Wave 5 Shape Approved (Graham, 2026-05-25)

**Status:** Γ£à Ratified by Aaron ΓÇö Shape B (Foundation + Safety)

**Wave 5 Scope:**
1. **W5-1** ΓÇö Session-kind separation (MCP fallback correctness fix) ΓÇö Roger Γ£à
2. **W5-3** ΓÇö Global tier fallback for profile selection (expand from per-skill only) ΓÇö Rosella (pending)
3. **W5-2** ΓÇö DB convention standardization (explicit injection, testability) ΓÇö Roger (pending)
4. **W5-4** ΓÇö Profile staleness check + confidence attenuation ΓÇö Rosella (pending)
**Status:** ✅ Ratified by Aaron — Shape B (Foundation + Safety)

**Wave 5 Scope:**
1. **W5-1** — Session-kind separation (MCP fallback correctness fix) — Roger ✅
2. **W5-3** — Global tier fallback for profile selection (expand from per-skill only) — Rosella (pending)
3. **W5-2** — DB convention standardization (explicit injection, testability) — Roger (pending)
4. **W5-4** — Profile staleness check + confidence attenuation — Rosella (pending)

**Wave 5 Deferred to Wave 6:**
- W5-5: MCP surface for forceRegenerate (needs W5-1 prerequisite + UX policy)
- W5-6: Metrics dashboard (product shape undefined; needs Aaron's surface decision)

**Wave 5 Timeline:** Four parallel/sequential items, ~3-4 work sessions. Phase 4.6 completes upon Wave A landing (W5-1, W5-3 concurrent; then W5-2, W5-4).

**Rationale:**
- **W5-1 (correctness):** CLI `--force` shipped in Wave 4. MCP fallback currently returns `__system__` session to user-facing tools ΓÇö this is a bug blocking safe MCP expansion.
- **W5-3 (functionality):** `loadExecutionProfile()` only walks `per-skill` ΓåÆ `global`, skipping `per-model` and `per-user` tiers. Wave 4's observability (profile_bump events) surfaces this gap when operators see bumps that never influence prescriptions.
- **W5-1 (correctness):** CLI `--force` shipped in Wave 4. MCP fallback currently returns `__system__` session to user-facing tools — this is a bug blocking safe MCP expansion.
- **W5-3 (functionality):** `loadExecutionProfile()` only walks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. Wave 4's observability (profile_bump events) surfaces this gap when operators see bumps that never influence prescriptions.
- **W5-2 (maintainability):** 12+ Cairn functions use internal `getDb()` calls; new code uses explicit injection. Standardizing now prevents test infrastructure failures in future waves (proven by Wave 4 integration test debugging).
- **W5-4 (trust):** Profiles have `updatedAt` but nothing checks it. Stale profiles generate misleading prescriber confidence without a safety gate.

**Wave 6 Scope (backlog):**
- I10: Curator system-event handling (depends on W5-1; better addressed when Phase 5 architecture is concrete)
- W5-5: MCP forceRegenerate surface (confirmation UX + safety guards need Aaron's policy input)
- W5-6: Metrics dashboard (TBD: CLI report vs. MCP resource vs. new package)

### Design Decision W5-1: Session-Kind Separation (Roger, 2026-05-25)

**Status:** Γ£à Implemented ΓÇö Migration 014 landed; MCP fallback corrected

**Context:** Phase 4's `ensureSystemSession()` creates system sessions on every prescriber run. MCP endpoints (`resolve_prescription`, `lint_skill`, `test_skill`) currently fall back to `__system__` session when no repo key is available ΓÇö a correctness bug that pollutes user-facing attribution.
**Status:** ✅ Implemented — Migration 014 landed; MCP fallback corrected

**Context:** Phase 4's `ensureSystemSession()` creates system sessions on every prescriber run. MCP endpoints (`resolve_prescription`, `lint_skill`, `test_skill`) currently fall back to `__system__` session when no repo key is available — a correctness bug that pollutes user-facing attribution.

**Resolution:** Migration 014 with `session_kind` column (enum: 'user' | 'system').

**Schema Changes:**
```sql
ALTER TABLE sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'user' 
  CHECK (session_kind IN ('user', 'system'));
```

**Backfill:** Existing rows with `repo_key = '__system__'` set to `session_kind = 'system'`. All others default to 'user'.

**API Changes:**
- Added `getMostRecentUserSession()` ΓÇö falls back only to user sessions
- Added `getActiveUserSession(repoKey)` ΓÇö user-scoped variant
- Kept `getMostRecentActiveSession()` and `getActiveSession(repoKey)` for internal/system-aware callers
- Created `getUserSessionForMcpFallback()` ΓÇö wrapper for all MCP call sites

**MCP Call Sites Updated:**
1. `resolve_prescription` ΓÇö accept/apply attribution
2. `lint_skill` ΓÇö telemetry event logging
3. `test_skill` ΓÇö scenario-path telemetry and result persistence
4. `test_skill` ΓÇö direct validation telemetry and result persistence

**Test Coverage:** Γ£à 100/100 passing (db.test.ts + mcp.test.ts)
- Added `getMostRecentUserSession()` — falls back only to user sessions
- Added `getActiveUserSession(repoKey)` — user-scoped variant
- Kept `getMostRecentActiveSession()` and `getActiveSession(repoKey)` for internal/system-aware callers
- Created `getUserSessionForMcpFallback()` — wrapper for all MCP call sites

**MCP Call Sites Updated:**
1. `resolve_prescription` — accept/apply attribution
2. `lint_skill` — telemetry event logging
3. `test_skill` — scenario-path telemetry and result persistence
4. `test_skill` — direct validation telemetry and result persistence

**Test Coverage:** ✅ 100/100 passing (db.test.ts + mcp.test.ts)
- Migration schema validation
- `getMostRecentUserSession()` filtering excludes system sessions
- MCP fallback with `__system__` as most-recent returns user session instead
- All four MCP endpoints attribute correctly

**Files Modified:**
- `packages/cairn/src/db/migrations/014-session-kind.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/sessions.ts` (new API functions, ensureSystemSession update)
- `packages/cairn/src/mcp/server.ts` (four call sites using getUserSessionForMcpFallback)
- `packages/cairn/src/__tests__/db.test.ts` and `mcp.test.ts` (new tests)

**Commit:** 8b0a69a (phase-4.6/w5-1-session-kind)

**Deferred:** I10 (Curator system-event filtering) ΓÇö depends on W5-1 but is a cloud telemetry design decision (Phase 5).

### Design Decision W5-3: Global Tier Fallback Semantics (Graham, 2026-05-25)

**Status:** Γ£à Spec locked; implementation complete ΓÇö Rosella drop landed (2026-05-25)

**Context:** `loadExecutionProfile()` only checks `per-skill` ΓåÆ `global`, skipping `per-model` and `per-user` tiers. DB schema (migration 011) already supports all four granularities; the read path is incomplete.

**Resolution:** Extend fallback chain from `per-skill` ΓåÆ `global` to `per-skill` ΓåÆ `per-model` ΓåÆ `per-user` ΓåÆ `global`.

**Fallback Semantics (Five Decisions):**

1. **Trigger:** Profile absence only (no row exists). Staleness does NOT trigger fallback ΓÇö W5-4 handles staleness via confidence attenuation instead.

2. **Payload:** Complete `ExecutionProfile` from first non-null tier. No blending across tiers ΓÇö full replacement only. The `source` field on `LoadedExecutionProfile` tells downstream code which tier was actually used.

3. **Composition:** Strictly first-match-wins down the chain. No blending (would require empirical weight parameters we don't have). Blending can be added as a separate feature in Phase 5 without changing the chain.

4. **Identity Keys:** New optional `TierFallbackContext` with `modelId?`, `userId?`. Tiers with unknown keys are skipped (not queried with 'global'). No migration required ΓÇö `execution_profiles` schema already complete.
**Deferred:** I10 (Curator system-event filtering) — depends on W5-1 but is a cloud telemetry design decision (Phase 5).

### Design Decision W5-3: Global Tier Fallback Semantics (Graham, 2026-05-25)

**Status:** ✅ Spec locked; implementation complete — Rosella drop landed (2026-05-25)

**Context:** `loadExecutionProfile()` only checks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. DB schema (migration 011) already supports all four granularities; the read path is incomplete.

**Resolution:** Extend fallback chain from `per-skill` → `global` to `per-skill` → `per-model` → `per-user` → `global`.

**Fallback Semantics (Five Decisions):**

1. **Trigger:** Profile absence only (no row exists). Staleness does NOT trigger fallback — W5-4 handles staleness via confidence attenuation instead.

2. **Payload:** Complete `ExecutionProfile` from first non-null tier. No blending across tiers — full replacement only. The `source` field on `LoadedExecutionProfile` tells downstream code which tier was actually used.

3. **Composition:** Strictly first-match-wins down the chain. No blending (would require empirical weight parameters we don't have). Blending can be added as a separate feature in Phase 5 without changing the chain.

4. **Identity Keys:** New optional `TierFallbackContext` with `modelId?`, `userId?`. Tiers with unknown keys are skipped (not queried with 'global'). No migration required — `execution_profiles` schema already complete.

   ```typescript
   interface TierFallbackContext {
     modelId?: string;      // Enables per-model tier lookup
     userId?: string;       // Enables per-user tier lookup
   }
   
   function loadExecutionProfile(
     db: RuntimeDb,
     skillId: string,
     options: { fallback?: TierFallbackContext }
   ): LoadedExecutionProfile | null;
   ```

5. **Staleness Interaction:** Staleness attenuates confidence on the selected profile post-fallback. Never triggers fallback. See W5-4 for details.

**Chain Behavior with Partial Context:**

| modelId   | userId  | Chain walked |
|-----------|---------|-------------|
| undefined | undefined | `per-skill` ΓåÆ `global` (backward compatible) |
| 'gpt-5'   | undefined | `per-skill` ΓåÆ `per-model('gpt-5')` ΓåÆ `global` |
| undefined | 'alice'   | `per-skill` ΓåÆ `per-user('alice')` ΓåÆ `global` |
| 'gpt-5'   | 'alice'   | `per-skill` ΓåÆ `per-model('gpt-5')` ΓåÆ `per-user('alice')` ΓåÆ `global` |

**Backward Compatibility:** Existing call sites with no context fall back to today's `per-skill` ΓåÆ `global` chain.
| undefined | undefined | `per-skill` → `global` (backward compatible) |
| 'gpt-5'   | undefined | `per-skill` → `per-model('gpt-5')` → `global` |
| undefined | 'alice'   | `per-skill` → `per-user('alice')` → `global` |
| 'gpt-5'   | 'alice'   | `per-skill` → `per-model('gpt-5')` → `per-user('alice')` → `global` |

**Backward Compatibility:** Existing call sites with no context fall back to today's `per-skill` → `global` chain.

**Updated `LoadedProfileSource` type:**
```typescript
export type LoadedProfileSource =
  | 'per-skill'
  | 'per-model'
  | 'per-user'
  | 'global'
  | 'global fallback';  // deprecated, kept for compat
```

**Files Touched:**
- `packages/skillsmith-runtime/src/index.ts` ΓÇö `loadExecutionProfile()`, types, two call sites
- Tests ΓÇö tier chain unit tests with mock profiles at each level, integration test with per-model profile

**Files NOT Touched:** No Cairn changes. No Forge prescriber changes. No DB migration.

**Test Coverage:** Γ£à 18/18 passing in skillsmith-runtime (10 tier-fallback specific)
- `packages/skillsmith-runtime/src/index.ts` — `loadExecutionProfile()`, types, two call sites
- Tests — tier chain unit tests with mock profiles at each level, integration test with per-model profile

**Files NOT Touched:** No Cairn changes. No Forge prescriber changes. No DB migration.

**Test Coverage:** ✅ 18/18 passing in skillsmith-runtime (10 tier-fallback specific)
- Per-skill tier selection
- Per-model tier fallback when per-skill missing
- Per-user tier fallback when per-model missing
- Global tier fallback as final chain
- Partial context (modelId only, userId only, both)
- Missing identity keys skip their tiers
- Staleness intentionally ignored by selection (W5-4 handles post-selection)

**Full Repo Test Status:** Skillsmith-runtime 18/18 Γ£à; Forge 644/647; runtime-cli 9/9; build clean.

**Commit:** c74463f (phase-4.6/w5-3-tier-fallback)

---

### Design Decision W5-2: Explicit DB Threading Hard Cut (Roger Wilco, 2026-05-25)

**Status:** ✅ Implemented — All 50+ files refactored; explicit db parameter threaded through Cairn/Forge/runtime

**Context:** Wave 5 test infrastructure revealed fragile coupling: 12+ Cairn public helpers relied on singleton `getDb()` fallback. Tests passed locally but failed in concurrent/worktree scenarios due to ambient global state. Standardizing to explicit db parameter enables deterministic test setups and future parallelization.

**Resolution:** Hard-cut public DB helpers to accept explicit `db: Database.Database` parameter as first positional argument. Removed all singleton fallback overloads.

**Signature Changes (Pattern):**
```typescript
// Before
export function getPreference(key: string, sessionId?: string): string | undefined {
  const db = getDb();
  // ...
}

// After
export function getPreference(
  db: Database.Database,
  key: string,
  sessionId?: string,
): string | undefined {
  // ...
}
```

**Helpers Killed:**
- `logEventWithDefaultDb()` — removed
- Deprecated `logEvent(sessionId, ...)` overload — removed
- `getExecutionProfileWithDb()` — collapsed into `getExecutionProfile(db, ...)`
- Deprecated fallback overload from `ensureSystemSession()` — removed

**Call Sites Updated:**
- Cairn agents: `curate()`, `prescriber()`, `archivist()`, `applier()`, `sessionState()` — all capture db once and pass through
- Hooks: `runSessionStart()` — passes db to stale-session checks and DB counters
- MCP server: Stores explicit db handle after `ensureDb()`
- Tests: All 50+ test files updated to pass db explicitly; removed ambient singleton reads
- Forge integration: `wave2-pipeline.test.ts`, `wave3-pipeline.test.ts`, `wave4-pipeline.test.ts` updated
- Runtime CLI: `forgePrescribe.test.ts`, `orchestrationConfig.test.ts` updated
- Skillsmith-runtime: `index.ts` updated for tier fallback integration

**Test Coverage:** ✅ All tests passing across all workspaces
- `@akubly/cairn`: All unit tests green
- `@akubly/forge`: 644/647 passing (no new failures from refactor)
- `@akubly/runtime-cli`: 9/9 passing
- `@akubly/skillsmith-runtime`: 24/24 passing (includes W5-3 tier fallback + W5-2 integration)

**Files Modified:** 50 files
- Cairn db layer: 15+ modules (preferences, events, profiles, hints, prescriptions, sessions, insights, etc.)
- Cairn agents: 5 files (curate, prescribe, archive, apply, sessionState)
- Cairn tests: 20+ test files (100+ test assertions tightened)
- Forge integration tests: 3 files
- Runtime CLI tests: 2 files
- Skillsmith-runtime: 1 file
- Skills/support: 1 skill doc update

**Rationale:**
- Eliminates ambient global state in tests → enables parallelization and worktree safety
- Explicit dependency injection simplifies reasoning about who owns the DB connection
- Catches refactoring bugs: if a helper forgot to thread db, TypeScript errors immediately
- Prepares for future architectural changes (e.g., connection pooling, transaction scoping)

**Deferred Follow-ups:**
- `getDb()` remains as connection factory for process entry points (CLI, server startup)
- Root `npm test` stalls under shared CLI TTY (npm + Vitest interaction); direct workspace tests pass; no product code fix needed unless CI reproduces
- Some test scenarios still use singleton factory to create db, then pass handle explicitly (acceptable pattern)

**Commit:** 963a0aa (phase-4.6/w5-2-db-hard-cut)

### Design Decision W5-4: Profile Staleness Confidence Attenuation (Rosella, 2026-05-25)

**Status:** ✅ Implemented — Runtime profiles now carry staleness annotation + confidence scaling

**Context:** Execution profiles carry `updatedAt` but nothing checks it. Prescriber confidence reflects profile quality, yet stale profiles (unchanged for 50+ sessions or 7+ days) still emit `confidence: 1`. Safety gate needed to prevent misleading trust in outdated data.

**Resolution:** `loadExecutionProfile()` returns profiles with staleness annotation and attenuates confidence.

**Staleness Shape:**
```typescript
staleness: {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
}
```

Fresh profiles (not stale): `confidence: 1` (unchanged).  
Stale profiles: `confidence * 0.5` (attenuated exactly once, even when both thresholds trip).

**Threshold Defaults:**
- **Count threshold:** Stale when `sessions_since_install - profile.sessionCount > 50`
- **Age threshold:** Stale when `now - profile.updatedAt > 7 days`
- Either threshold triggers staleness; both produce `reason: 'count+age'`
- Attenuation factor: `0.5` exactly once

**Composition with W5-3 (Tier Fallback):**
- W5-3 tier selection runs first: `per-skill` → optional `per-model` → optional `per-user` → `global`, first match wins
- W5-4 staleness check runs post-selection on the chosen profile
- Staleness does NOT trigger fallback; confidence attenuation only
- `LoadedExecutionProfile.source` preserved (tells downstream code which tier was used)

**Test Coverage:** ✅ 16/16 passing in `profileFallback.test.ts`
- Fresh profile → confidence: 1
- Stale (count only) → confidence: 0.5
- Stale (age only) → confidence: 0.5
- Stale (both count + age) → confidence: 0.5 (single attenuation)
- Custom attenuation option and clamping behavior
- No profile → no error
- W5-3 staleness does not trigger fallback behavior
- Full repo: Forge 644/647 tests passing (no new failures)

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts` — `loadExecutionProfile()` implementation, types, threshold constants
- `packages/skillsmith-runtime/src/__tests__/profileFallback.test.ts` — 16 tests covering staleness scenarios

**Rationale:**
- Closes trust gap: Prescriber confidence now reflects profile recency, not just structure
- Configurable thresholds (50 sessions, 7 days) balance staleness detection with profile lifecycle
- Confidence attenuation (0.5×) is conservative — allows fallback via W5-3 if available, or lets consumer decide to refresh
- No Cairn schema changes — uses existing `updatedAt` and session counter relationship
- No auto-refresh or notification surface added; those remain future product decisions

**Deferred Follow-ups:**
- Explicit profile last-update session counter would strengthen count-threshold semantics; deferred to future Cairn schema work
- Auto-refresh, notification surface, or Forge prescriber behavior changes deferred to Phase 5 Curator work
- Confidence attenuation factor (0.5) is hardcoded; making it configurable deferred to product input

**Commit:** 96f7d6e (phase-4.6/w5-4-staleness-attenuation)

### Phase 4.6 Wave 5 Wave B Complete (2026-05-25)

**Status:** ✅ Wave A (W5-1, W5-3) landed + Wave B (W5-2, W5-4) landed locally on isolated branches

**Wave A Completion:**
- ✅ **W5-1 (commit 8b0a69a):** Session-kind separation → MCP fallback correctness fixed; 100/100 tests passing
- ✅ **W5-3 (commit c74463f):** Tier fallback chain extended (per-skill → per-model → per-user → global); 18/18 tests passing; W5-3 does NOT trigger on staleness (W5-4 handles)

**Wave B Completion:**
- ✅ **W5-2 (commit 963a0aa):** Explicit DB threading hard cut (50 files, 1496 LOC refactored); all workspaces green; removes ambient global state
- ✅ **W5-4 (commit 96f7d6e):** Staleness confidence attenuation (16 tests covering count/age/both scenarios); confidence scaled 0.5× when stale

**Phase 4.6 Completion Criterion Met:**
- Wave 5 Shape approved (2026-05-25)
- Wave A landed on isolated branches (W5-1, W5-3)
- Wave B landed on isolated branches (W5-2, W5-4)
- All four commits ready for Aaron to review and merge (PR creation deferred per wave-4 pattern)

**Next Step:** Aaron to review and open PRs:
1. W5-1 base=main
2. W5-3 base=main
3. W5-4 base=W5-3 (depends on tier fallback selection logic)
4. W5-2 base=main (can merge independently; no functional dependencies)

**Wave 6 Backlog (on hold until Wave 5 PRs land):**
- W5-5: MCP surface for forceRegenerate (needs W5-1 prerequisite + Aaron's UX policy input on confirmation prompts)
- W5-6: Metrics dashboard (product shape undefined; needs Aaron's surface decision: CLI report vs. MCP resource vs. new package)

**Test Status Summary:**
- `@akubly/cairn`: All unit tests ✅
- `@akubly/forge`: 644/647 (no new failures from W5 work)
- `@akubly/runtime-cli`: 9/9 ✅
- `@akubly/skillsmith-runtime`: 24/24 ✅ (includes W5-1, W5-3, W5-4 integration)
- **Repo-wide:** All targeted tests green; Windows worktree safety validated

**Full Repo Test Status:** Skillsmith-runtime 18/18 ✅; Forge 644/647; runtime-cli 9/9; build clean.

**Commit:** c74463f (phase-4.6/w5-3-tier-fallback)

### Design Decision W5-1: Session-Kind Separation (Roger, 2026-05-25)

**Status:** ✅ Implemented — Migration 014 landed; MCP fallback corrected

**Context:** Phase 4's `ensureSystemSession()` creates system sessions on every prescriber run. MCP endpoints (`resolve_prescription`, `lint_skill`, `test_skill`) currently fall back to `__system__` session when no repo key is available — a correctness bug that pollutes user-facing attribution.

**Resolution:** Migration 014 with `session_kind` column (enum: 'user' | 'system').

**Schema Changes:**
```sql
ALTER TABLE sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'user' 
  CHECK (session_kind IN ('user', 'system'));
```

**Backfill:** Existing rows with `repo_key = '__system__'` set to `session_kind = 'system'`. All others default to 'user'.

**API Changes:**
- Added `getMostRecentUserSession()` — falls back only to user sessions
- Added `getActiveUserSession(repoKey)` — user-scoped variant
- Kept `getMostRecentActiveSession()` and `getActiveSession(repoKey)` for internal/system-aware callers
- Created `getUserSessionForMcpFallback()` — wrapper for all MCP call sites

**MCP Call Sites Updated:**
1. `resolve_prescription` — accept/apply attribution
2. `lint_skill` — telemetry event logging
3. `test_skill` — scenario-path telemetry and result persistence
4. `test_skill` — direct validation telemetry and result persistence

**Test Coverage:** ✅ 100/100 passing
- Migration schema validation
- `getMostRecentUserSession()` filtering excludes system sessions
- MCP fallback with `__system__` as most-recent returns user session instead
- All four MCP endpoints attribute correctly
- Full Cairn: 597/597 passing
- Skillsmith runtime: 8/8 passing
- Wave 4 integration: 14/14 passing

**Files Modified:**
- `packages/cairn/src/db/migrations/014-session-kind.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/sessions.ts` (new API functions, ensureSystemSession update)
- `packages/cairn/src/mcp/server.ts` (four call sites using getUserSessionForMcpFallback)
- `packages/cairn/src/__tests__/db.test.ts` and `mcp.test.ts` (new tests)

**Deferred:** I10 (Curator system-event filtering) — depends on W5-1 but is a cloud telemetry design decision (Phase 5).

### Design Decision W5-2: Explicit DB Threading Hard Cut (Roger, 2026-05-25)

**Status:** ✅ Implemented — All 50+ files refactored; explicit db parameter threaded through Cairn/Forge/runtime

**Context:** Wave 5 test infrastructure revealed fragile coupling: 12+ Cairn public helpers relied on singleton `getDb()` fallback. Tests passed locally but failed in concurrent/worktree scenarios due to ambient global state. Standardizing to explicit db parameter enables deterministic test setups and future parallelization.

**Resolution:** Hard-cut public DB helpers to accept explicit `db: Database.Database` parameter as first positional argument. Removed all singleton fallback overloads.

**Signature Pattern:**
```typescript
// Before
export function getPreference(key: string, sessionId?: string): string | undefined {
  const db = getDb();
  // ...
}

// After
export function getPreference(
  db: Database.Database,
  key: string,
  sessionId?: string,
): string | undefined {
  // ...
}
```

**Helpers Killed:**
- `logEventWithDefaultDb()` — removed
- Deprecated `logEvent(sessionId, ...)` overload — removed
- `getExecutionProfileWithDb()` — collapsed into `getExecutionProfile(db, ...)`
- Deprecated fallback overload from `ensureSystemSession()` — removed

**Structural Changes:**
- `curate()` captures one db handle and passes it into detector helpers
- `runSessionStart()` passes db into stale-session checks and DB counters
- MCP server initialization stores explicit db handle after `ensureDb()`
- Tests keep explicit per-test db handles instead of relying on ambient singleton reads

**Files Modified:** 50+ files across Cairn, Forge, runtime-cli, skillsmith-runtime

**Test Coverage:** All workspaces green
- Cairn: 597/597 passing
- Forge: 644/647 (3 pre-existing todos)
- Runtime-CLI: 9/9 passing
- Skillsmith-runtime: 24/24 passing

**Deferred Follow-ups:**
- `getDb()` remains as connection factory for process entry points and test setup
- Some tests still use singleton factory to create db, then pass handle explicitly
- Root `npm test` stalls under shared CLI TTY when npm wraps Vitest; direct workspace tests pass

### Design Decision W5-3: Global Tier Fallback Semantics (Rosella, 2026-05-25)

**Status:** ✅ Implemented — Tier fallback chain extended; all tests passing

**Context:** `loadExecutionProfile()` only checks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. DB schema (migration 011) already supports all four granularities; the read path is incomplete.

**Resolution:** Extend fallback chain from `per-skill` → `global` to `per-skill` → `per-model` → `per-user` → `global`.

**Final API Surface:**
```typescript
export interface TierFallbackContext {
  modelId?: string;
  userId?: string;
}

function loadExecutionProfile(
  db: RuntimeDb,
  skillId: string,
  fallbackContext?: TierFallbackContext
): LoadedExecutionProfile | null;

export type LoadedProfileSource = 
  | 'per-skill'
  | 'per-model'
  | 'per-user'
  | 'global';
```

**Chain-Walking Algorithm:**
1. Always query `per-skill` first
2. If `modelId` present, query `per-model` 
3. If `userId` present, query `per-user`
4. Always query `global` last
5. Return first non-null row as complete profile; do not blend tiers
6. Missing identity keys skip their tiers
7. Staleness intentionally ignored by selection (W5-4 handles post-selection)

**Test Coverage:** ✅ 18 passing tests
- Per-skill tier selection
- Per-model tier fallback when per-skill missing
- Per-user tier fallback when per-model missing
- Global tier fallback as final chain
- Partial context (modelId only, userId only, both)
- Missing identity keys skip their tiers
- Staleness intentionally ignored by selection

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts` — loadExecutionProfile() and types
- Tests — tier fallback unit tests

**Scope Notes:** No Cairn schema, migration, or Forge prescriber changes required.

### Design Decision W5-4: Profile Staleness Confidence Attenuation (Rosella, 2026-05-25)

**Status:** ✅ Implemented — Runtime profiles now carry staleness annotation + confidence scaling

**Context:** Execution profiles carry `updatedAt` but nothing checks it. Prescriber confidence reflects profile quality, yet stale profiles (unchanged for 50+ sessions or 7+ days) still emit `confidence: 1`. Safety gate needed to prevent misleading trust in outdated data.

**Resolution:** `loadExecutionProfile()` returns profiles with staleness annotation and attenuates confidence.

**Staleness Shape:**
```typescript
staleness: {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
}
```

Fresh profiles: `confidence: 1` (unchanged).  
Stale profiles: `confidence * 0.5` (attenuated exactly once, even when both thresholds trip).

**Threshold Defaults:**
- **Count threshold:** Stale when `sessions_since_install - profile.sessionCount > 50`
- **Age threshold:** Stale when `now - profile.updatedAt > 7 days`
- Either threshold triggers staleness; both produce `reason: 'count+age'`
- Attenuation factor: `0.5` exactly once

**Composition with W5-3:**
- W5-3 tier selection runs first (per-skill → per-model → per-user → global)
- W5-4 staleness check runs post-selection on chosen profile
- Staleness does NOT trigger fallback; confidence attenuation only
- `LoadedExecutionProfile.source` preserved

**Test Coverage:** ✅ 24 passing tests in skillsmith-runtime
- Fresh profile → confidence: 1
- Stale (count only) → confidence: 0.5
- Stale (age only) → confidence: 0.5
- Stale (both count + age) → confidence: 0.5 (single attenuation)
- Custom attenuation option and clamping
- No profile → no error
- W5-3 staleness does not trigger fallback behavior

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts` — loadExecutionProfile() staleness logic, types, thresholds
- `packages/skillsmith-runtime/src/__tests__/profileFallback.test.ts` — 16 staleness tests

**Deferred Follow-ups:**
- Explicit profile last-update session counter would strengthen count-threshold semantics (future Cairn work)
- Auto-refresh, notification surface, or Forge prescriber behavior changes deferred to Phase 5

### Wave 5 Integration & Merge Strategy (Roger, 2026-05-26)

**Status:** ✅ Integration branch resolves all inter-dependencies

**Integration Branch:** `phase-4.6/wave-5-integration`

**Recommended Merge Order:**
1. **W5-1 session-kind** (clean merge)
2. **W5-3 tier fallback** (clean merge)
3. **W5-4 staleness attenuation** (depends on W5-3 tier fallback logic; stacks cleanly)
4. **W5-2 explicit DB hard-cut** (cross-cutting; apply last to thread new APIs once)

**Conflict Resolution Summary:**
- **W5-1:** Clean merge
- **W5-3:** Clean merge
- **W5-4:** Conflict in `.squad/identity/now.md` — kept main's completed Wave 5 status (newer, reflected all four isolated branches)
- **W5-2:** Code conflicts in:
  - migration 012 tests
  - `packages/cairn/src/db/sessions.ts`
  - `packages/cairn/src/mcp/server.ts`
  - `packages/skillsmith-runtime/src/index.ts`
  - Root cause: stale W5-3 test under W5-2's public API hard-cut; fixed by passing explicit `db` parameter

**Test Validation (Post-Integration):**
- `npm run build`: clean ✅
- `npm test`: green across all workspaces ✅
- Cairn: 597/597 passing
- Forge: 644 passed + 3 pre-existing todo = 647 total
- Runtime-CLI: 9/9 passing
- Skillsmith-runtime: 24/24 passing

**Note on Forge "644/647":** Not failures. Three are pre-existing `it.todo` placeholders:
- `prescribers-vectors.test.ts`: prompt-optimizer negative meanNetImpact confidence penalty (todo)
- `prescribers-vectors.test.ts`: token-optimizer negative meanNetImpact confidence penalty (todo)
- `weight-consistency.test.ts`: cross-package weight consistency (todo)

**PR Strategy Recommendation:**
Prefer one integration PR from `phase-4.6/wave-5-integration`. The isolated branches were green, but value is in resolved interaction between W5-1's session APIs, W5-3/W5-4 runtime profile behavior, and W5-2's explicit DB hard-cut. If separate review units desired, use four PRs in same order and include runtime-cli test fix on W5-2 PR.

#### 2. Map Latency Targets to Test Assertions

**What:** Cross-reference §30 §4.1 (Synchronous Scheduling) latency targets with §55 test examples.

**Why:** §30 has latency targets (<100ms recall, <5s sweep). §55 has test examples. They don't currently reference each other. Tests should assert against targets.

**Proposed §30 change in §4.1:**

```diff
 **Measurable Latency:**
 - integrate: < 10ms (single fact insert)
 - recall: < 100ms (BM25 query + scoring for 10 results)
+  Test assertion: `expect(recallDuration).toBeLessThan(100)`
 - rerank: < 50ms (rescore 10 facts)
 - decide: < 10ms (single-pass selection)
 - commit: < 500ms (batch persist for typical session of 50 facts)
```

**Impact:** Low — documentation hygiene, doesn't change spec.

#### 3. Adopt Laura's `CuratorStore.retrieve(sessionId, query)` Signature

**What:** Update §30 §1.2 (recall algorithm) to use `CuratorStore.retrieve(sessionId, query)` instead of implicit "search global then filter by session."

**Current §30 pseudocode (line 86):**
```
candidates = searchBM25(query)
if tier_filter is provided:
  candidates = candidates.filter(f => f.tier in tier_filter)
```

## Cycle 1 Review Disposition — recall.ts (ea05e62)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-29  
**Review source:** 5-persona Code Panel, commit ea05e62  
**Branch:** eureka/v1-m1-m4

---

### Summary

7 of 9 findings accepted and implemented. 1 escalated (spec gap). 1 deferred with comment.
All tests pass; build clean.

---

### Finding Dispositions

#### F1 — NaN on future last_accessed · **ACCEPTED**

- **Change:** `Math.max(0, (nowMs - fact.last_accessed) / 86_400_000)` — clamps negative
  tDays to zero so future-dated `last_accessed` values cannot produce NaN in `Math.pow`.
- **Location:** `recall.ts:compositeScore()` — tDays computation.
- **Regression tests added:**
  - `compositeScore returns finite value when last_accessed is in the future (F1 — NaN guard)` — direct unit test on `compositeScore`.
  - `recall with a future-dated fact produces sane ordering, not NaN-corrupted (F1)` — end-to-end ordering test with future `last_accessed`.

---

#### F2 — attention_tier typed as `string` · **ACCEPTED**

- **Change:** `attention_tier: 'hot' | 'warm' | 'cold'` in `RecallResult`. `ATTENTION_MULTIPLIERS`
  keyed as `Record<'hot' | 'warm' | 'cold', number>`. Removed `?? 1.00` fallback (now unnecessary
  since the union type makes the lookup exhaustive at compile time).
- **Regression test added:**
  - `compositeScore produces finite positive scores for all attention_tier values (F2 exhaustiveness)` — runtime exhaustiveness check confirming all three tier values produce finite, positive scores with no `?? 1.00` fallback path.

---

#### F3 — tDays=0 fallback gives unaccessed facts MAX recency · **ACCEPTED**

- **Change:** `last_accessed` absent → `tDays = Infinity` → `recency = 0.1` (floor). Previously
  used `tDays = 0` which gave `recency = 1.0`, treating never-accessed facts as just-accessed.
- **Comment added:** Inline explanation: "never-accessed treated as very stale, not just-accessed".
- **Regression test added:**
  - `fact with no last_accessed ranks below identical fact with recent last_accessed (F3)` — verifies
    a never-accessed fact ranks below an identical fact with `last_accessed = BASE_MS`.

---

#### F4 — compositeScore not exported + scores discarded · **ACCEPTED**

- **Design choice: option (a) — sibling `recallWithScores` function.**
  `recallWithScores(options, deps): Promise<ScoredResult[]>` is the underlying function that
  returns facts paired with their FR-2 scores. `recall(options, deps): Promise<RecallResult[]>`
  becomes a thin convenience wrapper that calls `recallWithScores` and strips scores.
  
  **Rationale for (a) over (b):**  
  Option (b) (debug flag: `RecallOptions.debug?: boolean`) conflates the return type contract
  with a runtime flag, creating a union return type `Fact[] | ScoredResult[]` that callers must
  narrow. Option (a) gives each concern its own function with a clear, stable type signature.
  Separation of concerns is stronger: `recallWithScores` is the computational truth; `recall`
  is the convenience alias. Adding a debug flag later is still possible without breaking either.

- **New exports:** `compositeScore` (named), `ScoredResult` (interface), `recallWithScores` (named).
- **Barrel updated:** `packages/eureka/src/index.ts` exports `recallWithScores`, `compositeScore`,
  `ScoredResult`, `Ranker`.
- **Existing test contract preserved:** All three existing tests use `recall()` — interface unchanged.

---

#### F5 — Stale JSDoc bullet · **ACCEPTED**

- **Change:** Removed `- Recency-gradient decay over time (ClockProvider seam — §30 §2.4)` from
  the `recall()` JSDoc "Not yet implemented" list. M4 wired the ClockProvider seam; the bullet
  was stale. The two remaining deferred bullets are preserved:
  - `lastAccessedAt / accessCount side effects (§10 §10.1)`
  - `Trust score updates from feedback (§30 §2.1)`
- **Note:** JSDoc was moved to `recallWithScores` (the new underlying function). `recall` gets
  a shorter doc pointing callers to `recallWithScores`.

---

#### F6 — Trust filter undersupply · **ESCALATED**

- **Action:** Researched §30 §1.2, §30 §2.3, §40. Spec is silent on overfetch policy — genuine
  spec gap, not a §-tension.
- **Decision drop:** `.squad/decisions/F6-recall-undersupply-escalation.md` (see below)
- **Recommendation in drop:** Option (b) or (d) — push `trustFloor` into `FactStore.search()`.
  Filtering belongs at the storage seam, not post-retrieval.
- **Awaiting:** Cassima (product semantics), Crispin (FactStore contract).

---

#### F9 — Reserve `ranker?: Ranker` placeholder · **ACCEPTED**

- **New type:** `Ranker = (facts: RecallResult[], deps: { nowMs: number }) => ScoredResult[]`
- **Added to `RecallDeps`:** `ranker?: Ranker` (optional).
- **Wired conditional in `recallWithScores`:**
  ```typescript
  const scored = ranker
    ? ranker(trusted, { nowMs })
    : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }));
  ```
- **No test added** for the injection path (no consumer needs it yet — seam is non-breaking).
- **Barrel updated:** `Ranker` exported from `packages/eureka/src/index.ts`.

---

#### F10 — Remove `[key: string]: unknown` from RecallResult · **ACCEPTED**

- **Change:** Removed index signature from `RecallResult`. The interface now has explicit typed
  fields only: `content`, `trust`, `attention_tier` (union), `relevance?`, `importance?`, `last_accessed?`.
- **Verification:** All test fixtures use only these explicitly typed fields — no fixture relied
  on the index signature for extra fields. The stale schema comment in M3 test (referencing the
  old `[key: string]: unknown` as a pass-through mechanism) was also removed.

---

#### F12 — Trust floor hardcoded · **DEFERRED WITH COMMENT**

- **Change:** Added inline TODO comment at `TRUST_FLOOR`:
  ```typescript
  // TODO(M5+): configurable per-call trustFloor via RecallOptions. See decision drop edgar-recall-undersupply-escalation if filed.
  ```
- **No value change.** Connected to F6's resolution path (if (b)/(d) chosen, trustFloor becomes
  a pass-through from `RecallOptions` which also resolves this).

---

### Build + Test Results

**Build:** `npm run build` (tsc --build) → exit 0 ✅

**Eureka (7 tests):**
```
✓ src/activities/__tests__/recall.test.ts (7 tests) 5ms
  ✓ recall > surfaces keyword-overlapping entries at ≥80% precision
  ✓ recall > ranks results by FR-2 composite formula descending (§30 §1.2)
  ✓ recall > ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4)
  ✓ recall > compositeScore returns finite value when last_accessed is in the future (F1 — NaN guard)
  ✓ recall > recall with a future-dated fact produces sane ordering, not NaN-corrupted (F1)
  ✓ recall > compositeScore produces finite positive scores for all attention_tier values (F2 exhaustiveness)
  ✓ recall > fact with no last_accessed ranks below identical fact with recent last_accessed (F3)
Test Files  1 passed (1)
     Tests  7 passed (7)
```

**Cairn (609 tests):** 609 passed ✅  
**Forge (647 tests):** 644 passed | 3 todo ✅

---

### §-Tensions Discovered During F6 Research

- §30 §1.2, §30 §2.3, §40 are uniformly silent on overfetch policy. Not a tension between
  two spec clauses — a genuine gap. The spec assumed a healthy corpus where sub-floor facts
  are rare. No existing guardrail.

---

### Commit

All changes in one commit on `eureka/v1-m1-m4`.  
Commit message: `Eureka review cycle 1 fixes: F1,F2,F3,F4,F5,F9,F10,F12`  
SHA: 0f83dcf

---

## F6 Escalation — recall() Trust-Filter Undersupply

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-29  
**Origin:** F6 — Trust filter undersupply (Correctness+Craft finding, cycle 1 review of ea05e62)  
**Status:** ESCALATED — awaiting PM (Cassima) + Knowledge Rep (Crispin) input  
**Reviewers needed:** Cassima (product semantics), Crispin (FactStore contract)

---

### Problem

`recall()` fetches exactly `k` candidates from `FactStore.search({ limit: k })`, then applies
a trust floor filter (`trust >= 0.15`). When multiple candidates fall below the floor, the
returned set silently shrinks to fewer than `k` results.

```typescript
// packages/eureka/src/activities/recall.ts:109,113
const candidates = await factStore.search({ query, sessionId, limit: k });
// ...
const trusted = candidates.filter(f => f.trust >= TRUST_FLOOR); // may yield < k
```

Neither §30 §1.2 (recall algorithm) nor §30 §2.3 (trust dynamics) nor §40 specifies
an overfetch policy. The spec documents the trust floor predicate but is silent on what
`recall()` must do when that predicate thins the candidate set below `k`.

**Observed failure mode:** A caller requests `k=5` and receives 2 results without any
signal that the shortfall occurred. No error, no partial-result flag, no retry. The caller
cannot distinguish "only 2 relevant facts exist" from "3 more facts exist but fell below
the trust floor."

---

### Options

#### (a) Overfetch with buffer: `limit: k * 3`

Pass `limit: k * 3` to `FactStore.search()`. After trust filtering, slice to `k`.

**Pros:** Simple. Likely yields full `k` in practice (low-trust facts are rare at steady state).  
**Cons:** Wastes storage I/O (fetches 3× what is needed in the happy path). The multiplier
`3` is a magic number with no principled derivation. Brittle if the corpus is dominated by
low-trust facts (post-contemplate penalties, Path 2 ingest). Over-fetching obscures the
real semantics of `k`.

#### (b) Push trust floor into `FactStore.search()` as a query parameter

Extend the search interface: `search({ query, sessionId, limit, trustFloor? })`.
The storage layer (SQLite BM25 index) applies `WHERE trust >= trustFloor` before
ranking and returning `k` results. The filter happens where the data lives.

**Pros:** Semantically cleanest — storage returns exactly `k` post-filter results.
Enables future index optimization (partial index on `trust >= 0.15`). Eliminates the
over-fetch problem at source. Aligns with London-school seam discipline: FactStore.search()
owns its own filtering contract.  
**Cons:** Requires a FactStore interface change → Crispin's domain (§20 storage contract).
Requires a FactStore contract test update (§55 §3.3).

#### (c) Document as caller contract: "recall may return < k"

Add JSDoc: `@returns up to k results; may return fewer if trust floor filters candidates`.
No code change.

**Pros:** Minimal. Honest about current behavior.  
**Cons:** Callers cannot tell how many results were suppressed. UX: if the agent asks for
`k=5` and gets 2, it has no signal to retry with lower trust floor or fallback. Brittle
for downstream pipelines that assume exactly-k semantics.

#### (d) Widen FactStore search interface to accept `trustFloor`

Same as (b) but as an optional parameter: `search({ ..., trustFloor?: number })`. The
storage layer applies it as a `WHERE` predicate only when provided.

**Pros:** Backwards compatible — existing calls without `trustFloor` continue to work.
FactStore implementors can choose to filter at SQL level or fall back to application-level
filter for implementations that don't support it.  
**Cons:** Optional parameter creates two code paths; implementors may implement inconsistently.
Less precise than (b)'s mandatory contract.

---

### Recommendation

**Option (b) or (d) — push the filter to where the data lives.**

Layering rationale: trust filtering is a storage-level predicate (`WHERE trust >= 0.15`),
not a post-retrieval concern. Doing it after `search()` returns results means we always
fetch more than we need and silently discard. The correct seam is at `FactStore.search()`.

Between (b) and (d): prefer **(b)** if Crispin can update the FactStore contract in the
same sprint (clean, mandatory, testable via contract test). Prefer **(d)** as a temporary
bridge if FactStore interface is frozen and backwards compatibility is required.

Option (c) is the minimum viable mitigation if the sprint gate prohibits interface changes —
at least it documents the behavior honestly so callers can handle partial results.

Option (a) is discouraged: the multiplier is arbitrary, and the over-fetch cost compounds
for callers with large `k` values (e.g., sweep pipelines).

---

### Inputs Needed Before Implementation

1. **Cassima (PM):** Is "recall may return < k" acceptable caller contract for v1, or does
   the product require exact-k semantics? Does user-facing UX depend on a full result set?

2. **Crispin (Knowledge Rep / FactStore contract):** Can `FactStore.search()` accept a
   `trustFloor` parameter in the next sprint? Would the SQLite implementation apply it as
   a `WHERE` predicate before returning results? Contract test surface?

3. **Laura (TDD):** If we go with (b)/(d), a new M5-adjacent RED beat is needed:
   `recallWithScores()` with trust-depleted corpus still returns exactly `k` results.

---

### §-Tensions Discovered

None — §30 §1.2, §30 §2.3, and §40 are uniformly silent on overfetch policy. This is a
genuine spec gap, not a tension between two existing spec clauses. The silence likely
reflects v1 assuming a healthy corpus where low-trust facts are uncommon.

---

### Related

- F12: `TRUST_FLOOR` is currently hardcoded at 0.15. If this decision resolves toward
  option (b)/(d), `trustFloor` becomes a pass-through from `RecallOptions`, which
  also resolves F12's per-call configurability TODO.
- `recall.ts:60`: `// TODO(M5+): configurable per-call trustFloor via RecallOptions.`

---

## Archived 2026-06-01 Decisions

Entries older than 7 days.

### 2026-05-25: Eureka PRD v4-final LOCKED — R7 8-Reviewer Lock-In Panel

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-25  
**Locked By:** 8-reviewer panel (4 Squad domain + 4 persona-review Design Panel personas)  
**Lock Status:** DO NOT EDIT — implementation phase begins

**Decision:** Eureka PRD v4-final is ratified as canonical, shippable specification after R7 lock-in. All 4 blockers resolved. All 9 important findings synthesized. Ready for implementation phase. R7 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (555 lines, 69.5 KB) — canonical stable location
- **Lineage:** v3 (R5) → v3.1 patches (R6) → v4-final (R7 amendments + Aaron finalization) → v4-final rev-2 (4 blockers + 9 importants resolved)
- **Panel:** Graham Knight (Architect), Genesta (Storage), Crispin (Schema), Edgar (Enforcement), + 4 persona-review personas (Architect, Skeptic, Pragmatist, Compliance)

**Blockers Resolved:**
1. **B1** — DecisionSource adapter mapping (verified against packages/types/src/index.ts:47) ✅ RESOLVED
2. **B2** — FR-14 Path 2 cadence, idempotency, dedup, initial trust ✅ RESOLVED
3. **B3** — FR-7.4 ↔ FR-7.2 contradiction (bridge_ledger + offline CLI coexistence) ✅ RESOLVED
4. **B4** — Security Threat Model (§14a added with attack vectors + mitigations) ✅ RESOLVED

**Important Findings (I1–I9):**
- Scope rightsize across 5 v1 + 2 v1.5 mechanisms
- Sequential fan-out specification
- US-2 flush helper scoping
- Agent-tier-only wiring constraints
- Production opt-in policy
- Citation + decision-log registers
- input_trust_avg → input_trust_min analysis
- Confidence/trust orthogonality enforcement (branded types)
- Extraction-readiness mechanism verification (7 mechanisms, not 5)

**Reviewer Verdicts:**
- **Graham Knight (Architect):** APPROVE-FOR-LOCK — bidirectional adapter framework structurally sound, all R7 amendments integrated, 3 documentation nits (non-blocking)
- **Genesta (Storage/Substrate):** APPROVE-FOR-LOCK — dual-axis schema (input_trust_avg + reasoning_confidence) correct, adapter lossy contracts justified
- **Crispin (Schema):** APPROVE-FOR-LOCK — all 5 R7 schema risks mitigated, branded-type enforcement adequate to prevent confidence/trust collapse
- **Edgar (Enforcement):** APPROVE-WITH-MINOR-NITS — all 5 R7 mechanisms integrated + 2 additions (branded types, DESIGN.md), Path D preserved via manual-only triggers
- **Persona Architect:** Found B1 (DecisionSource mapping)
- **Persona Skeptic:** Found B2 (FR-14 gaps) + multiple I-findings
- **Persona Pragmatist:** Found B3 (FR-7 contradiction) + feasibility I-findings
- **Persona Compliance:** Found B4 (missing security model) + compliance I-findings

**Key Architectural Decisions Locked:**

1. **Bidirectional Adapter Framework** (resolves Aaron's R7 directive):
   - **Path 1 (Eureka → Forge):** Contemplative decisions. Agent uses Eureka facts/edges to reason, decision stored as `kind=decision` fact AND emitted to Forge via `toDecisionRecord()` for audit trail.
   - **Path 2 (Forge → Eureka):** In-flow decisions. Agent decides during normal LLM exchange, Forge captures `DecisionRecord`, Eureka ingests via `fromDecisionRecord()` to learn decision patterns.
   - **Both are load-bearing:** Eureka-assisted reasoning needs Path 1. Retrospective learning from observed decisions needs Path 2. No circular dependency (contexts non-overlapping).

2. **Confidence/Trust Orthogonality:**
   - `Confidence` (Cairn): epistemic strength of derived conclusions
   - `Trust` (Eureka): provenance reliability of stored facts
   - NOT interchangeable — TypeScript branded types enforce separation at compile time
   - Composition explicit and documented when needed

3. **Extraction-Readiness Enforcement (7 mechanisms, FR-12):**
   1. TypeScript subpath export (`./learning` firewall)
   2. Folder layout enforcement (no parent imports)
   3. Interface ban on domain types (signatures only primitives/shared vocab)
   4. Plain-data test pattern
   5. Lint + CI enforcement (`no-restricted-imports` + canary test)
   6. DESIGN.md living architectural contract
   7. Branded types for `Confidence` and `Trust`

4. **Boundary Discipline (no FK, no JOIN):**
   - Eureka and Cairn are peer systems with complementary purposes
   - Session namespace isolation: Eureka has `kind=session` facts, Cairn owns `sessions` table
   - Correlation via opaque `cairn_session_id` only (one-way reference, not FK)
   - Each system authoritative for own domain (sweep/ranker/trust → Eureka; observability → Cairn)

5. **Path D Preservation (Kernel Extraction Ready):**
   - Eureka ships standalone in v1 with no new dependencies on Cairn
   - Manual-only Cairn→Eureka session triggers (via explicit `remember()` call)
   - Auto-promotion heuristics deferred to v1.5+ pending usage patterns
   - Three-phase adoption playbook for Cairn if/when it adopts learning modules

**User Directives Locked (from Aaron Kubly):**
- **2026-05-24T23:43Z:** v4-final revision #2 scope — resolve ALL 4 persona blockers AND consensus-strength important findings
- **2026-05-25T05:48:00Z:** Eureka↔Forge decision flow is bidirectional by design (contemplative path + in-flow path, both load-bearing)

**Why This Approach:**
- Panel-first design prevented implementation surprises (dual-panel caught issues Squad-only missed)
- Persona review augmented domain expertise with cross-cutting risk/feasibility/compliance analysis
- Bidirectional adapter framework resolved architectural disagreement while honoring both workflows
- Branded types + seven-mechanism extraction-readiness provide concrete enforcement, not aspirational promises
- Boundary discipline between Eureka/Cairn preserves each system's autonomy while enabling collaboration

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v4-final.md` (stable location, do not edit)
- **Lock-in Orchestration:** `.squad/orchestration-log/2026-05-25T06-54-22Z-*` (9 entries: Cassima revision + 4 Squad reviewers + 4 personas)
- **Session Log:** `.squad/log/2026-05-25T06-54-22Z-r7-eureka-v4-final-lock.md`
- **Reviewer Verdicts:** Graham blessing + all four lock-in verdicts at `.squad/orchestration-log/2026-05-25T06-54-22Z-*-lock-verdict.md`

**Implementation Readiness:**
- PRD is self-contained (no external doc required for implementation)
- All [v4: <reason>] annotations mark deltas from v3 for lineage traceability
- Three lock-in nits (FR-7.4 reconciliation query, FR-14 ingestion cadence, §7.5 kernel versioning) are documentation polish, addressable during v1 implementation or v1.1 pass
- No architectural risks identified

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms as specified
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface)
- Path D Extraction: Kernel extraction readiness enforced from Day 1, extraction happens post-v1 pending org-scale federation needs

---

## Archived Active Decisions (2026-06-01)

### W2-1: ChangeVectorSummary Category Field (Roger)

**Scope:** Type consolidation for shared `ChangeVectorSummary` contract

**Decision:** Use stricter `OptimizationCategory` union (six-value string union from Forge) for `category` field in canonical `@akubly/types` definition.

**Rationale:** Forge already encodes the domain's real category set. Making the union canonical now ensures type safety for W2-2/W2-7 follow-on work while remaining additive (no existing duplicates switched yet).

**Impact:** Both Forge and Cairn gain shared, stricter type contract; future category additions go through Forge's enum.

### W2-7: Category Narrowing at SQLite Boundary (Rosella)

**Scope:** Cairn data layer type safety for ChangeVectorSummary contract

**Decision:** Narrow raw `optimization_hints.category` strings at Cairn's SQLite read boundary instead of widening the shared contract back to `string`.

**Implementation:** `getAllCategories()` filters DB values through the canonical `OptimizationCategory` union from `@akubly/types`. `summarizeChangeVectors()` only accepts narrowed categories. `SqliteChangeVectorProvider.getSummaries()` drops summaries where `vectorCount === 0`.

**Rationale:** DB schema remains permissive for backward compatibility, but cross-package `ChangeVectorSummary` contract is strict. Narrowing once at boundary keeps rest of Cairn aligned with Forge's canonical union without unsafe casts. Zero-vector summaries provide no historical signal and trigger Phase 4.5 fallback mode.

**Impact:** Cairn data layer now type-safe; empty summaries filtered at provider output.

### W2-5: Negative Impact Gate + autoApplyEligible Semantics (Alexander)

**Scope:** Attenuation boundary and hint eligibility signal for negative-impact vectors

**Decision:** Gate boundary is **inclusive** (`<=`) at `-0.2`. Mature negative vectors attenuate and disable auto-apply when `meanNetImpact <= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (value: `-0.2`). A summary at exactly `-0.2` triggers auto-apply disable.

**Rationale:** Safety asymmetry + FP fragility. Inclusive boundary prevents false positives at the exact threshold and provides stronger guard against brittle boundary conditions. Dual-layer testing locks behavior: unit test (alexander-2 maturity-gradient) expects gating at exactly -0.2; E2E canary (laura-1 wave2-pipeline) uses constant directly for drift-proof coverage.

**Implementation:** Gate comparison changed from `<` to `<=` in Forge prescribers and Cairn gate logic. Safety-boundary comment added at comparison site. Maturity-gradient test updated to expect gating at exactly -0.2. E2E pipeline canary uses `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant directly (prevents configuration drift).

**Impact:** Negative-impact gate boundary now locked by dual-layer testing (unit + E2E); Applier receives explicit attenuation signal for hints at and below threshold; safety margin increased. Decided by Aaron 2026-05-22.

### W2-8: Active Status Set for Optimization Hints (Rosella)

**Scope:** Deduplication logic for `(skillId, source, category)` tuples

**Decision:** Use `pending`, `accepted`, and `deferred` as the active statuses for optimization-hint dedup. Terminal statuses (`applied`, `rejected`, `expired`, `suppressed`, `failed`) do not block reinsertion of same semantic recommendation.

**Rationale:** Active set represents hints still live in operator workflow: waiting to be reviewed, explicitly approved but not yet applied, or intentionally postponed. A second hint during those states duplicates work and pollutes category history. Terminal statuses no longer represent live hints, so they should not block fresh inserts—allows operators to retry after rejection or expiration.

**Implementation:** `packages/cairn/src/db/optimizationHints.ts` encodes `ACTIVE_HINT_STATUSES` constant and uses in both `insertHintIfNew()` and `hasActiveOptimizationHint()`.

**Impact:** Deduplication now enforced at Cairn DB layer; Forge applier receives deduplicated hint stream; zero-vector summaries filtered at provider boundary.

### W2-9: Manual CLI Surface Location (Roger)

**Scope:** Composition root for Wave 2 manual orchestration

**Decision:** Created new `packages/runtime-cli/` workspace package with bin entry `forge-prescribe`. This package is the explicit composition root that can legally import both `@akubly/cairn` and `@akubly/forge`.

**Rationale:** Repo already exposes binaries from package-level `bin` entries (e.g., `@akubly/cairn`). Wave 2 needs composition root without creating package cycles. `packages/runtime-cli` keeps boundary honest and buildable. Local invocation: `npx forge-prescribe --skill <id> [--db <path>]`.

**Implementation Details:**
- Per-skill → global profile fallback: Try canonical `(granularity='per-skill', granularity_key='global')` first, then fall back to `global/global`
- Exit codes: `0` on success (including zero hints or dedup skips), `1` when no profile found, `2` for arg/DB/persistence errors
- CLI tests: 4 passing (happy path, no-profile, empty result, mixed)

**Impact:** Wave 2 has manual trigger surface independent of Curator. Wave 3 will migrate to Curator-driven automatic orchestration. Package boundary preserved for future Phase 5 cloud wiring.

### W2-6: E2E Pipeline Test Location + Spec Ambiguity Note (Laura)

**Scope:** Integration test placement and discovered spec mismatch

**Decision:** Placed Wave 2 end-to-end pipeline test in `packages/forge/src/__tests__/wave2-pipeline.test.ts`. Forge is focal point because `runForgePrescribers()` is consumer ingesting Cairn summaries and emitting final hints applier sees.

**Spec Ambiguity Discovered:** `docs/forge-phase4.6-wave2-scope.md` §6.1 says `meanNetImpact = -0.2` should yield `autoApplyEligible = false`, but live Forge/Cairn logic and Alexander's W2-5 tests treat boundary as still eligible (`meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE`). Test kept aligned with implementation + §4.5 semantics. **Action item:** Reconcile boundary explicitly in Wave 3 (pending ADR).

**Rationale:** Forge already hosts substantive integration coverage under `packages/forge/src/__tests__/`. New test stays with existing cross-module surface instead of one-off harness. To avoid production dependency from Forge to Cairn, test imports Cairn source directly and Forge's `tsconfig.json` excludes test files from package build.

**Test Coverage:** Full maturity gradient (0 vectors → mature catastrophic), dedup regression on repeated persistence, provider omission, fail-open behavior, shared `ChangeVectorSummary` contract flow.

**Impact:** Real SQLite path fully validated; attenuation + `autoApplyEligible` propagation verified end-to-end; provider fail-open semantics confirmed.

### W3-D1: Composition Root → R2 (`@akubly/skillsmith-runtime`)

**Scope:** Where should the runtime that imports both `@akubly/cairn` and `@akubly/forge` live?

**Decision:** Adopt R2 — new `@akubly/skillsmith-runtime` library package (composition layer importing both) plus thin `@akubly/runtime-cli` wrapper.

**Rationale:** Clean separation of concerns, best test isolation, zero build-order risks, Phase 5-portable. Roger and Alexander independently converged on this architecture.

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Unblocks all Wave 3 work items

### W3-D2: Package Name → `@akubly/skillsmith-runtime`

**Scope:** What name for the new composition library package?

**Decision:** Use `@akubly/skillsmith-runtime` (domain-specific, not generic `@akubly/runtime`).

**Rationale:** Domain-specific naming (a) fits the cairn/forge metaphor, (b) describes what operates on (skills), (c) leaves room for future additions (scheduler, dashboard, policy engine).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Naming locked; packaging can proceed

### W3-D3: MCP Tool Exposure → Dropped from Wave 3

**Scope:** Should Wave 3 include an MCP tool for manual prescriber invocation?

**Decision:** No — Wave 3 ships with no MCP tool exposure. Curator hook is autonomous surface; CLI is manual surface.

**Rationale:** Proposed `run_prescriber_optimization` tool offers no net-new capability over existing CLI. Defer to later wave when concrete operator need surfaces. Removes W3-6, W3-7, ~2 MCP scenarios from W3-9 (~7 items, ~18 tests).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Wave 3 scope reduced; MCP tool re-opens only when operator need materializes

### W3-D4: Curator Hook Invocation → Always-On

**Scope:** Should Curator automatically invoke prescriber orchestration in v1?

**Decision:** Yes — automatic invocation always enabled. No opt-in flag in v1.

**Rationale:** Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) are sufficient. Opt-in flag adds config without meaningful safety benefit.

**Status:** Accepted by Aaron 2026-05-22

**Locked Design:** Hint persistence stays in orchestrator; fail-open codified; profile selection trigger-driven only (global fallback deferred to Wave 4).

**Impact:** Unlocks automatic hint flow; enables Wave 3 implementation

### W3-Impl-1: Workspace Dependencies via Existing Pattern (Roger)

**Scope:** How should `@akubly/skillsmith-runtime` declare dependencies on Cairn/Forge/Types?

**Decision:** Use existing internal dependency specifier pattern (`"*"`) instead of `workspace:*`. Root monorepo workspace glob `packages/*` covers new package; no redundant root `workspaces` entry needed.

**Rationale:** Environment npm rejects `workspace:*` with `EUNSUPPORTEDPROTOCOL`. Repository already uses `"*"` pattern consistently; new package integrates cleanly with existing convention.

**Implementation:** `skillsmith-runtime/package.json` declares `"@akubly/types": "*"`, `"@akubly/cairn": "*"`, `"@akubly/forge": "*"`. Root `tsconfig.json` references updated.

**Impact:** Workspace registration consistent across all packages; new package installs and builds cleanly.

### W3-Impl-2: Thin Runtime-CLI via Composition Migration (Roger)

**Scope:** How to refactor `runtime-cli` while preserving CLI contract?

**Decision:** Move entire `runForgePrescribe()` composition body from `runtime-cli` to `skillsmith-runtime/src/index.ts`. Reduce `runtime-cli` to thin facade: arg parsing, console formatting, exit-code mapping, top-level error reporting.

**Rationale:** Implements W3-D1 (R2 architecture) immediately instead of carrying temporary inline composition forward. Moved code is the old implementation, relocated intact — smallest behavioral risk. Avoids asking Alexander to re-migrate same code in W3-5.

**Implementation:** `skillsmith-runtime` owns `runForgePrescribe()` (profile load, vector provider, Forge invocation, dedup, persistence). `runtime-cli` owns CLI concerns only. CLI contract (`npx forge-prescribe --skill <id>`) unchanged.

**Impact:** Composition root established; CLI behavior identical; foundation ready for W3-5 Curator factory.

### W3-Impl-3: ExecutionProfile Reuse in Types (Alexander)

**Scope:** How to define `PrescriberOrchestrationConfig` and `PrescriberRunResult` in `@akubly/types`?

**Decision:** Keep `ExecutionProfile` in canonical location (`@akubly/types`); reference directly from `PrescriberOrchestrationConfig`. Keep `loadProfile` **synchronous** in Wave 3.

**Rationale:** `ExecutionProfile` already stable in `@akubly/types`; re-declaring structurally creates duplicate truth. Synchronous `loadProfile` matches current reality (Cairn SQLite-backed accessors are sync). Async deferrable to Phase 5 if cloud profile loading surfaces.

**Implementation:** Added `PrescriberOrchestrationConfig` and `PrescriberRunResult` to `packages/types/src/index.ts`. `skillsmith-runtime` re-exports canonical types. No Cairn compatibility shim required.

**Impact:** Wave 3 Curator-facing port has stable, reusable type contracts. No Cairn-to-types inversion. Foundation for W3-4 and W3-5.

### W3-Impl-4: Curate Async Transition + Trigger-Driven Skills (Alexander)

**Scope:** How should `curate()` accept and orchestrate the prescriber config?

**Decision:** 
1. `curate()` is now `async`, returns `Promise<CurateResult>`
2. Qualifying skills sourced from `ChangeVectorSweepResult.computedSkillIds` — distinct, sorted skill IDs whose vectors were newly inserted this cycle
3. Per-skill `runForSkill(skillId, minSessions)` receives `minSessions` from existing Curator chain: `changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS`

**Rationale:** `runForSkill()` is async by contract; keeping `curate()` sync would lie or drop orchestration results. `computedSkillIds` is smallest signal matching accepted trigger-driven rule. Reusing `minSessionsObserved` aligns vector-sweep and prescriber gates.

**Implementation:** All sync call sites updated to `await curate()`. Per-skill exceptions log `console.warn`, produce error-shaped `PrescriberRunResult`, do not abort cycle (fail-open).

**Impact:** Async Curator orchestration ready for W3-5/W3-6. Fail-open semantics locked. All 32 call sites updated and tested. Cairn 576/576 passing.

### W3-Impl-5: Shared Prescriber Execution Helper (Alexander)

**Scope:** How to avoid duplicating the Cairn+Forge composition pipeline between manual CLI (`runForgePrescribe`) and Curator factory?

**Decision:** Extract shared `executePrescriberRun()` helper inside `packages/skillsmith-runtime/src/index.ts` that owns the per-skill execution body:
1. Instantiate `SqliteChangeVectorProvider`
2. Call `runForgePrescribers()`
3. Persist hints via Cairn `insertHintIfNew()` dedup
4. Return generation / inserted / duplicated / error counts

`runForgePrescribe()` (manual CLI) keeps existing operator-facing result contract and global profile fallback. `createPrescriberOrchestrationConfig()` (Curator factory) adapts to Curator-facing `PrescriberRunResult` contract.

**Rationale:** Single-sourced composition body while allowing different consumers to apply different profile-selection policy and result shaping. Makes W3-6 hook wiring smaller.

**Implementation:** Extracted `executePrescriberRun()` helper. `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` both call shared helper. Cairn gains `getExecutionProfileWithDb()` convenience.

**Impact:** Composition logic centralized, no duplication. Factory ready for W3-6 hook wiring. Per-skill Curator orchestration fully realized. Skillsmith-Runtime 6/6 passing.

### W3-Impl-6: Curator Hook Wiring via Injected Config (Roger)

**Scope:** How to wire always-on Curator prescriber orchestration at session start without violating W3-D1 boundary?

**Decision:** Pick **R-Hook-A (inject config into hook)**. `packages/cairn/src/hooks/sessionStart.ts` accepts optional `PrescriberOrchestrationConfig` and forwards to `curate(undefined, prescriberOrchestrationConfig)`. Production bootstrap moved to `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, which calls Cairn's hook runner with factory that constructs `createPrescriberOrchestrationConfig({ db })` from already-open SQLite handle.

**Rationale:** Smallest change preserving W3-D1 boundary. Cairn owns hook mechanics and Curator invocation but does not import `skillsmith-runtime`, avoiding cairn ↔ skillsmith-runtime cycle. Always-on guaranteed by composition root bootstrap logic.

**Implementation:** 
- Cairn hook runner: optional `PrescriberOrchestrationConfig` parameter
- `skillsmith-runtime/src/hooks/sessionStart.ts`: production bootstrap wrapper
- `.github/hooks/cairn/curate.ps1`: updated to prefer runtime hook for both global-install and repo-checkout paths
- Tests call `runSessionStart(repoKey)` with `undefined` for backward compatibility

**Impact:** Always-on Curator orchestration wired. Composition boundary preserved. Tests and production use same hook path. Cairn 576/576 passing.

### W3-Impl-7: E2E Integration Test — Auto Trigger, Dedup, Fail-Open (Laura)

**Scope:** Validate Wave 3 end-to-end: auto trigger for computed skills, dedup confirmation, fail-open behavior, profile miss handling.

**Decision:** Place `wave3-pipeline.test.ts` in `packages/forge/src/__tests__/` covering four scenarios:
1. Auto trigger: new vectors computed → prescribers run → hints inserted
2. Dedup (trigger-driven): second pass with newly-qualified vectors → re-checked via eligibility → duplicates blocked
3. Fail-open: per-skill exception → logged, continued
4. No profile: skill skipped without error

**Rationale:** Forge is focal point (ingests Cairn summaries, emits final hints). Test location aligns with existing cross-module coverage. Real SQLite path fully validated. To avoid production dependency from Forge to Cairn, test imports Cairn source directly; Forge's `tsconfig.json` excludes test files from package build.

**Key Behavioral Finding:** Accepted W3-D4 (trigger-driven orchestration) only reruns for skills with newly-computed vectors (`computedSkillIds`). This means unchanged DB state cannot produce dedup rerun on back-to-back invocations. Test adapted to realistic scenario: second pass with newly-qualified existing vectors triggering dedup-visible behavior.

**Implementation:** 4 scenarios, bootstrap via `runSessionStart`, assertions on `PrescriberRunResult` counts and DB state. Forge 630/630 passing.

**Impact:** Wave 3 end-to-end integration validated. Dedup and auto-trigger mechanics confirmed. Real Cairn+Forge persistence path exercised.

### Crucible-TDD-1: London-School TDD Strategy for Agentic Runtime (Laura)

**Date:** 2026-05-27  
**Author:** Laura Bow (Tester)  
**Status:** DRAFT (Awaiting Aaron Review — 8 Open Questions)  
**Artifact:** `docs/crucible-tdd-strategy.md`

**Scope:** Define outside-in London-school TDD discipline for Crucible runtime, PRD-derived, firewalled from technical design.

**Decision:** Authored comprehensive TDD strategy (120KB, 12 sections, 28 pages) covering:
- **12 acceptance scenarios (A1–A12):** Session forking, hermetic replay, pre-commit hook veto, causal slicing, Aperture notifications, plugin pinning, Curator orchestration, Pareto fitness, determinism conformance, Router policy escalation, bisect, marketplace trust gradient
- **18 collaborator contract roles:** SessionBootstrapper, ObservationCaptureStore, AppendProtocol, PreCommitHookBus, ReadSetHasher, LedgerProjector, QueryExecutor, PrescriberOrchestrator, ChangeVectorProvider, ParetoFitnessEvaluator, PolicyEngine, EscalationQueue, CausalSliceEngine, BisectOrchestrator, PluginRegistry, CLIRenderer (each with defined contract test strategy)
- **5-tier test pyramid:** Unit (500–1000 tests) → Component (200–400) → Contract (30–60) → Integration (50–100) → Acceptance (12)
- **8 invariant property tests:** Append-only, hash-chain determinism, replay equivalence, fork lineage, hook verdict determinism, projection purity, trust-tier monotonicity (via fast-check)
- **5-layer mock drift defense:** Contract tests (PR-time), shared fixture builders (build-time), golden files (nightly), CI double-check (PR-time), interface stability tracking

**Rationale:** 
1. London-school (outside-in) forces explicit interface design (matches immutable primitives)
2. Tell-don't-ask interaction pattern aligns with event-ledger semantics
3. Collaborator contracts enforce L0–L5 layer boundaries (prevents accidental coupling)
4. Acceptance tests anchor user workflows (prevents over-engineering the substrate)
5. Mock drift is tractable in greenfield with contract-test discipline + fixture builders

**8 Open Questions Flagged for Aaron (§11):**
- **Q1:** Session-end hook observation capture granularity (per-tool-call vs per-primitive vs per-turn)
- **Q2:** Eureka prescriber integration path (standalone L3 vs library vs deferred to v1.5)
- **Q3:** Structural proposal approval UX (blocking modal vs Aperture notification vs separate review CLI)
- **Q4:** Plugin pinning scope (direct deps vs transitive vs full environment)
- **Q5:** Bisect test execution environment (shell out vs isolated subprocess vs in-process runner)
- **Q6:** Determinism conformance timestamp normalization (excluded vs deterministic sequence vs non-deterministic field)
- **Q7:** Mock drift detection failure threshold (zero-tolerance vs ≥3 in layer vs ≥10% total)
- **Q8:** Pareto fitness contract with missing axes (reject comparison vs zero-fill vs partial dominance)

**Recommendations:** Provided for each question (favor simplicity + v1 MVM scope).

**Testing Blockers Identified:**
- Q1 blocks A2 (hermetic replay acceptance test)
- Q2 affects test layering (separate tier vs shared orchestration)
- Q3 blocks A10 (Router policy escalation test assertions)
- Q4 affects `SessionMetadata` fixture builders
- Q5 blocks bisect integration test design
- Q6 affects determinism conformance suite implementation

**Firewall Compliance:** ✅ Zero references to CTD artifacts; PRD-only vocabulary; no implementation details (file paths, class names, function signatures).

**Impact:** TDD strategy locked for PRD scope (12 acceptance scenarios), collaborator contract inventory complete, test layering blueprint ready. Implementation awaits Aaron resolution of Q1–Q8.

**Next Steps:** 
1. Aaron reviews strategy, resolves 8 open questions
2. Laura updates strategy based on resolutions
3. Decision merges to decisions.md
4. Laura updates `.squad/agents/laura/history.md` with learnings
5. Optional: Extract `london-tdd-for-agentic-runtimes` skill if reusable pattern emerges

### Crucible-CTD-1: Technical Design Plan Decomposition + Sequencing (Graham)

**Date:** 2026-05-27 (Updated after Aaron locks blocking questions)  
**Author:** Graham Knight (Lead / Architect)  
**Status:** ACTIVE (Approved for fan-out; blocking questions resolved)  
**Artifact:** `docs/crucible-technical-design-plan.md`

**Scope:** Decompose full technical design into 19 sections, 7 team members + 2 consultants, 4 authoring phases + 1 review round (~9 working days).

**Decision:** Produced comprehensive CTD plan with resolved blocking questions:

1. **DB file placement:** ✅ FORK to `~/.crucible/crucible.db` — clean separation from Cairn (decided by Aaron 2026-05-27)
2. **Cairn/Forge coexistence:** ✅ FULL COEXIST FOREVER — independent live products with own roadmaps. Crucible greenfield alongside. No delegation, no shim packages, no absorption (decided by Aaron 2026-05-27)
3. **Eureka status:** ✅ EXTERNAL LIBRARY VIA OPTIONAL ADAPTER — not a Crucible chamber (decided by Aaron 2026-05-27)

**Fan-Out Manifest (Appendix C of plan):**
- **Phase 0 (serial):** 2 sections (Graham) — L0/L1 boundary + primitive taxonomy
- **Phase 1 (parallel):** 8 sections, 5 lanes — Roger, Rosella, Alexander, Laura, Gabriel, Graham
- **Phase 2 (parallel):** 6 sections, 6 lanes — Roger, Valanice, Graham, Laura
- **Phase 3 (parallel):** 3 sections, 2 lanes — Gabriel, Graham
- **Review round:** All 19 sections cross-reviewed per ownership map

**Section structure:** `docs/crucible-technical-design/` folder, one numbered file per section + README index, each with owner, output file, input artifacts, dependencies, acceptance criteria.

**Rationale:** Three blocking questions cleared path for team-wide fan-out without discovery looping. Architecture locked. Sequencing respects Layer dependencies (L0→L1→L2/L3→L4/L5) and authoring parallelism (some sections can proceed concurrently after their inputs are available).

**Impact:** Technical design ready for parallel authoring sprint. Team assignments clarified. Acceptance criteria explicit per section. Estimated completion: ~9 working days post-fan-out.

**Cross-Link:** Crucible-TDD-1 (Laura, parallel track) is firewalled from CTD to preserve test-design independence; TDD strategy is PRD-only, CTD is implementation-specific. Both feed Crucible delivery but remain architecturally separate.

### Phase 4 Synthesis — CTD CLOSE GREEN-FINAL (2026-05-28)

**Date:** 2026-05-28 (Synthesis Review completed 2026-05-29T072142Z)  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL — CTD v1 STRUCTURALLY COMPLETE  
**Artifact:** Merged from the Phase 4 synthesis draft into this archive.

**Scope:** Final pre-close interface-coherence synthesis across the four Phase 4 authoring lanes (Graham framing §1/§6/§19; Roger CALL/RET + Scheduler WAL §3/§10; Gabriel L3.5 Scheduler §5/§5.A/§17; Laura reproducibility honesty §11.10 + §16.5/§16.7a). Two minor errata resolved inline during synthesis gate.

**Verdict:** **GREEN-FINAL — CTD is complete.** Coherence matrix: 8 CLEAN / 0 MINOR / 0 STRUCTURAL / 2 APPLIED. Final inventory: 377,794 bytes across 21 files (19 numbered sections + Phase 1/Phase 2 synthesis reviews); 19 ADRs indexed and ready for post-CTD authoring.

**Coherence Checks (All CLEAN):**
- §1.2 L3.5 row aligns with §5.A spec aligns with §17 catalog aligns with §3.3.5 WAL acceptance
- §3.3.4 CALL/RET body fields are read verbatim by §10.6.1 stack-frame reconstruction
- Trace-vs-behavioral vocabulary (§11.10 ↔ §16.7a) is identical across both sections
- Streaming `stream_open/delta/close` sub-kinds are additive per §6.5
- §19 ADR-0019 + ADR-0024 index rows are accurate one-liners
- (Two errata applied; see below)

**Errata Applied (Graham Authority):**

1. **InvocationId Canonical Lock** (§3.3.4)
   - **Decision:** `invocationId = BLAKE3(sessionId || taskId || commitOffset)`, mandatory in L0
   - **Rationale:** Hermetic-replay invariant (ADR-0008; §11.6 byte-equivalence) is non-negotiable. §10.6.1 reconstruction keys off `invocationId`. Structural-compute cost in L0 is one BLAKE3 over three small inputs at TaskStart-emit time. L0 flexibility on this field had no compelling driver against an invariant this load-bearing.
   - **Ripple:** None — change strictly strengthens existing properties. No impact to §10, §11, or other sections.

2. **§7.D Supersede Contract Amendment** (§7.D clause 6 + conformance check C-9)
   - **Decision:** Replacement proposals that the Scheduler will cancel with `reason='superseded'` MUST set `envelope.parentId` to the EventId of the obsoleted proposal
   - **Rationale:** Scheduler uses that lineage edge to populate `scheduler_cancelled.body.supersededBy` deterministically. Contract violation caught at generator boundary (§7.A C-9), not at Scheduler. Closes Gabriel's Phase 4 flag.
   - **Ripple:** None — no change to §5.A.2 body shape; §6.4 `parentId` vocabulary unchanged; §3 and §17 unaffected.

**Newly-Surfaced Ambiguity:** None — CTD is complete. One informational note (non-blocking): Laura's `stream_open` / `stream_delta` / `stream_close` Observation sub-kinds are correctly additive per §6.5 evolution rule, but the §6.3 enumeration table does not yet list them. This is the right boundary for post-CTD §6.3 housekeeping pass (Laura owns streaming sub-kind authoring in §16; table updates land at sync pass exactly per §6.5 rule).

**Impact:** This is the final architecture-design gate. Post-CTD authoring is unblocked:
- Nineteen ADR files under `docs/adr/`
- §13 CLI implementation scaffolding
- §16 test-strategy scaffolding
- Greenfield package work under `@akubly/crucible-*`

No Phase 5 spawn required. No new open question requires Aaron triage.

---

### PR #33 Cycle 5: Fork Resume Schema + Predicate Timing Honesty (Graham)

**Date:** 2026-05-31
**Author:** Graham Knight (Architecture Lead)
**Status:** APPROVED (Merged in commit 40d39d3)
**Scope:** Address three Copilot findings from PR #33 cycle 5 review round

**Status:** Inbox — Scribe merge pending

## Decision

PR #33 cycle 5 applies two governance clarifications:

1. §6.3 sub-kind registration is incomplete unless the sub-kind has an authoritative payload schema. `fork_resume` now has the same registry-level schema treatment as `fork_origin` and `fork.collision_choice`.
2. v1 Hook Bus predicate timing is cooperative measurement, not hard preemption. `PredicateRegistration.evaluate` remains synchronous; over-budget predicates produce post-hoc telemetry and retry-budget quarantine for future rows. True hard preemption is deferred to v1.5+ worker/process isolation or an async cancellable predicate API.

## Rationale

The first clarification prevents conformance tests from accepting enum-only vocabulary with no payload contract. The second prevents §18 from overstating `Promise.race()` as a sandboxing primitive for CPU-bound synchronous JavaScript.

## Files touched

- `docs/crucible-technical-design/04-hook-bus.md`
- `docs/crucible-technical-design/06-primitive-taxonomy.md`
- `docs/crucible-technical-design/10-session-branching.md`
- `docs/crucible-technical-design/18-security-permissions.md`
- `docs/adr/0019-childsid-collision-hybrid.md`

---

## Open Questions

### W3-7 Trigger-Driven Dedup Semantics (Laura)

**Status:** FLAGGED FOR AARON'S DIRECTION

**Observation:** Wave 3's accepted trigger-driven orchestration (W3-D4) means Curator only calls prescribers for skills in `changeVectorSweep.computedSkillIds` — i.e., skills whose change vectors were newly inserted this cycle.

**Implication:** If the same skill's vectors remain unchanged across two consecutive session starts, the prescriber does not run on the second start, and no dedup-visible result is produced. This is correct by the trigger-driven design, but it differs from a "rerun on every session start" behavior.

**Question:** Should Wave 4+ introduce a broader trigger mechanism to allow reruns for skills with existing (non-new) summaries? Examples:
- Always rerun skills that have any vector summaries (regardless of new-this-cycle)
- Expose a manual scheduler or `force=true` flag for operator-initiated reruns
- Defer to Phase 5 when MCP/cloud integration allows finer control

**Current Design:** Trigger-driven only (W3-D4). This prevents unnecessary prescriber invocations and aligns with the "on new signal" principle, but it limits dedup visibility to cycles where vectors are genuinely computed.

**Recommendation:** Clarify with product whether current trigger semantics are intentional, or if dedup should be visible on *every* session start regardless of new vectors.


# [ARCHIVED SECTIONS BEFORE 2026-05-24]

Entries from 2026-05-23 and 2026-05-22 have been archived to decisions/archive/archive-2026-05-23.md


**Area 5 — MCP surfaces** (`worktreeMcp.test.ts`):
- `get_status` handler returns `sessions:` key (flat array shape, not `session:`)
- No `primary:` / `siblings:` shape (locked decision: flat array only)
- `get_session` identity matches `(repo_key, workdir)` pair
- `get_session` with mismatched workdir returns not-found
- No `console.log` leak in server.ts
- Structural source-reading tests as shape tripwires

**Migration 015** (`migration015.test.ts`):
- `workdir` column exists after migration
- Column is nullable TEXT with no default value
- Existing sessions are backfilled with `workdir = NULL` (lazy NULL backfill)
- Schema version advances to 15
- Migration is idempotent (double-apply is safe)

---

## Flag for Roger: No-Workdir Backcompat Behavior

The locked decision says: `getActiveSession(repoKey)` with NO workdir "must still match NULL rows for backcompat."

Roger's implementation interprets this as **"no filter = returns most recent any-workdir"** — i.e., `getActiveSessionWithDb` adds no `workdir IS NULL` clause. Old callers get the most-recent active session regardless of its workdir value.

This means: an old caller that never passes workdir will now potentially see a worktree session's ID returned. This is a trade-off, not a bug. I've documented it in the test and in my history.

If the intent was stricter — old callers ONLY see NULL-workdir sessions — then `getActiveSessionWithDb` should add `AND workdir IS NULL`. That would be a change to Roger's implementation. I'm flagging it; Aaron should adjudicate if the current behavior is the wrong interpretation.

Current test `'getActiveSession without workdir arg returns most recent active session (no workdir filter applied)'` asserts the current (no-filter) behavior. If the decision flips to strict-NULL behavior, that test assertion changes from `toBeDefined()` to `toBeUndefined()` (for a workdir-populated session).

---

## Notes

- All tests written against Roger's actual implementation (which landed before tests were complete — convergence scenario)
- Structural tests in `worktreeMcp.test.ts` read `server.ts` source to assert shape contracts as tripwires
- One test showed a flaky full-suite failure (passes consistently in isolation and on repeated full-suite runs). Not a real defect — non-deterministic OS scheduling of vitest VM forks.


---

# Roger → Laura: WI-A API Shapes (Issue #11)

**Date:** 2026-05-27  
**From:** Roger  
**To:** Laura  

## What shipped in WI-A source files

### `db/sessions.ts` — new/changed exports

```typescript
// Updated signature — workdir is 4th optional arg (branch is 3rd)
export function createSession(
  db: Database.Database,
  repoKey: string,
  branch?: string,
  workdir?: string,  // NEW — NULL when omitted
): string

// Updated signature — workdir scopes the lookup
// When workdir is omitted: no workdir filter (returns most recent active session)
// When workdir is provided: adds `AND workdir IS ?` (IS handles both NULL and string)
export function getActiveSession(
  db: Database.Database,
  repoKey: string,
  workdir?: string,  // NEW
): Session | undefined

// NEW — returns all active user sessions for the repo (used by get_status flat array)
export function listActiveSessionsForRepo(
  db: Database.Database,
  repoKey: string,
): Session[]
```

### `hooks/gitContext.ts` — new export

```typescript
// NEW — git rev-parse --show-toplevel in cwd; returns undefined on failure
export function getWorkdir(cwd?: string): string | undefined
```

### `types/index.ts` — Session type

```typescript
export interface Session {
  // ... existing fields ...
  workdir?: string;  // NEW — undefined for NULL rows
}
```

### `agents/archivist.ts` — updated signatures

```typescript
// workdir threaded through — session_start and session_resume payloads now include workdir
export function startSession(repoRemoteOrKey: string, branch?: string, workdir?: string): string
export function catchUpPreviousSession(repoKey: string, workdir?: string): { recovered: boolean; sessionId?: string }

// tool_use payload now includes workdir field (null when unknown)
export function recordToolUse(
  sessionId: string,
  toolName: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
  workdir?: string,  // NEW
): number
```

### `hooks/sessionStart.ts` — updated signature

```typescript
// workdir added as 4th optional param (after existing afterCurate callback)
export async function runSessionStart(
  repoKey: string,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
  afterCurate?: (curateResult: CurateResult) => void,
  workdir?: string,  // NEW
): Promise<{ fastPath: boolean }>
```

### `agents/sessionState.ts` — SessionSummary type

```typescript
export interface SessionSummary {
  // ... existing fields ...
  workdir?: string;  // NEW — undefined for NULL rows
}
```

### MCP `get_status` shape (BREAKING)

Old: `{ session: Session | null, curator: CuratorStatus }`  
New: `{ sessions: Session[], curator: CuratorStatus }`

New input params:
- `repo_key?: string` (unchanged)
- `workdir?: string` (NEW — filters to specific worktree when provided)

### MCP `get_session` shape

Old input: `{ session_id: string }` (required)  
New input: 
- `session_id?: string` (now optional)
- `repo_key?: string` (NEW — alternative lookup)
- `workdir?: string` (NEW — used with repo_key for (repo_key, workdir) identity lookup)

At least one of `session_id` OR `repo_key` must be provided.

## Note on `getActiveSession` behavior

After back-and-forth with your updated test, the final semantic is:
- No workdir arg → no workdir filter (returns most recent active session regardless of workdir)  
- Workdir string arg → `AND workdir IS ?` filter (exact worktree match)

Your test `"getActiveSession without workdir arg returns most recent active session"` captures this correctly.

The `getActiveSessionByWorkdir` internal helper exists for when you need `IS NULL` matching explicitly (not exported, used internally for the workdir-scoped path).


---

# WI-A Implementation Summary — Issue #11

**Author:** Roger  
**Date:** 2026-05-27  
**Branch:** `squad/11-worktree-aware-sessions`  
**Status:** Complete — build green, 647/647 tests passing

## What Shipped

### Migration

**Number:** 015 (as locked by Graham — issue body is stale at "005")  
**File:** `packages/cairn/src/db/migrations/015-workdir-sessions.ts`  
**Changes:**
- Adds `workdir TEXT` column to `sessions` table (NULL-tolerant, no DEFAULT needed)  
- Creates partial index `idx_sessions_repo_workdir ON sessions (repo_key, workdir) WHERE status = 'active'` to support `getActiveSession` and `listActiveSessionsForRepo` efficiently
- Wired into `packages/cairn/src/db/schema.ts` alongside migration014

**Schema version:** 14 → 15

### DB API (`packages/cairn/src/db/sessions.ts`)

```typescript
createSession(db, repoKey, branch?, workdir?)  // workdir 4th optional arg
getActiveSession(db, repoKey, workdir?)         // updated: when workdir provided, adds `AND workdir IS ?`
listActiveSessionsForRepo(db, repoKey)          // NEW: all active user sessions for repo
```

**`getActiveSession` semantics (final — Aaron-confirmed Q1 locked decision):**
- No workdir arg → `AND workdir IS NULL` → only NULL-workdir rows (backcompat; old callers cannot pick up worktree sessions)
- Workdir string arg → `AND workdir IS workdir` → exact worktree match  

> **Correction applied 2026-05-27:** The initial WI-A commit used "no filter" for the no-arg path (per Laura's reconciled test). Aaron confirmed the correct semantic per the locked Q1 decision is `AND workdir IS NULL`. Fixed in commit `ea9ab58` — `getActiveSession` now delegates to `getActiveSessionByWorkdir(db, repoKey, null)` when workdir is `undefined`. `worktreeSessions.test.ts` updated accordingly (18 tests all green).

Internal helper `getActiveSessionByWorkdir(db, repoKey, workdir: string | null)` added for explicit IS-NULL matching.

`listActiveSessionsForRepo` returns only `session_kind = 'user'` sessions ordered by `started_at DESC`.

### `getWorkdir()` (`packages/cairn/src/hooks/gitContext.ts`)

New export — `git rev-parse --show-toplevel` via execSync, same stdio/timeout pattern as `getRepoKey()`. Returns `undefined` on failure (non-git dirs, bare repos, git not on PATH).

### Workdir Threading

- **`archivist.ts`**: `startSession(remote, branch?, workdir?)` + `catchUpPreviousSession(repoKey, workdir?)` + `recordToolUse(sessionId, tool, args?, result?, workdir?)`
- `session_start` event payload: includes `workdir` field (null when unknown)
- `session_resume` event payload: includes `workdir` field
- `tool_use` event payload: includes `workdir` field
- **`postToolUse.ts`**: resolves workdir via `getWorkdir(hookData.cwd)`, threads through
- **`sessionStart.ts`**: `runSessionStart(repoKey, config?, afterCurate?, workdir?)` — workdir is 4th optional param so existing callers pass unchanged

### Types

`Session.workdir?: string` added to `packages/cairn/src/types/index.ts`  
`SessionSummary.workdir?: string` added to `packages/cairn/src/agents/sessionState.ts`  
`getSessionSummary` queries `workdir` from sessions table

### MCP (`packages/cairn/src/mcp/server.ts`)

**`get_status` (BREAKING — Aaron-approved):**
- Old: `{ session: Session | null, curator: ... }`
- New: `{ sessions: Session[], curator: ... }` — flat array always
- New input: `workdir?: string` added alongside `repo_key`
- With workdir: filters to single worktree session (still in array)
- Without workdir: `listActiveSessionsForRepo` — all active user sessions
- `readOnlyHint: true` preserved

**`get_session`:**
- Old: `{ session_id: string }` (required)
- New: `{ session_id?: string, repo_key?: string, workdir?: string }`
- Either `session_id` OR `repo_key` must be provided; error if neither
- Workdir-based lookup via `getActiveSession(db, repo_key, workdir)`
- `readOnlyHint: true` preserved

**stdio rule compliance:** No `console.log/info/debug` in any code reachable from `get_status` or `get_session` handlers.

### Test Updates (existing tests broken by v15)

Updated schema version assertions from 14 → 15 in:
- `src/__tests__/db.test.ts` (3 assertions)
- `src/__tests__/discovery.test.ts` (1 assertion)
- `src/__tests__/migration012.test.ts` (2 assertions)
- `src/__tests__/prescriptions.test.ts` (1 assertion)

## Validation

- `npm run build --workspace=@akubly/cairn`: ✅ clean  
- `npm test --workspace=@akubly/cairn` (direct vitest run): ✅ 647/647 passed  
- `@akubly/types` untouched (no shared types changed; `Session` is cairn-internal)

## Coordination

- API shapes summary handed off to Laura
- WI-B (Gabriel, coordinator dispatch policy) holds until this branch merges





## laura-m5-trust-feedback-red
# Decision Drop: M5 RED — Trust Feedback Mutation Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M5 RED — trust mutation from feedback event  
**Next owner:** Edgar — M5 GREEN  
**Status:** LANDED — RED  

---

## Contract Under Test

§30 §2.3 specifies event-driven trust mutation:

| Event | Formula |
|---|---|
| Corroboration | `trust = min(1.0, trust + 0.10)` |
| Contradiction | `trust = max(0.0, trust - 0.10)` |
| User correction | `trust = min(1.0, trust ± 0.30)` |

**Test file:** `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`

**Failure observed (correct RED):**
```
TypeError: (0 , applyFeedback) is not a function
```
All 4 M5 tests fail for this reason. All 18 M1–M4 tests pass.

---

## Collaborator Shape Chosen

### Seam Driven: `TrustUpdater`

Inline structural mock (London-school pattern; contract test for real impl deferred to Crispin):

```typescript
const trustUpdater = {
  update: vi.fn().mockResolvedValue(undefined),
};
```

**Interface shape (Edgar to formalize in GREEN):**
```typescript
interface TrustUpdater {
  update(args: {
    factId:    string;
    sessionId: SessionId;
    trust:     number;   // new trust value, already clamped to [0.0, 1.0]
  }): Promise<void>;
}
```

### Activity Signature (Edgar to implement in GREEN)

```typescript
async function applyFeedback(
  options: {
    factId:       string;
    sessionId:    SessionId;
    event:        'corroboration' | 'contradiction' | 'user_correction';
    currentTrust: number;
    /** Required when event is 'user_correction'. Sign indicates direction (+0.30 or -0.30). */
    correctionDelta?: number;
  },
  deps: {
    trustUpdater: TrustUpdater;
    clock:        ClockProvider;   // REQUIRED per §55 §1.2 (no optional default)
  },
): Promise<void>
```

### Design Rationale

1. **`applyFeedback` is separate from `recall()`** — trust mutation is a write operation; recall is read-only. Separation of concerns.
2. **`currentTrust` is caller-provided** — keeps the M5 RED focused on the trust-write seam only. A read-seam (FactStore or FactReader) will be needed for round-trip use cases but is separate scope.
3. **`clock` is required in deps** — consistent with M1–M4 pattern (§55 §1.2); the implementation may timestamp when feedback was applied.
4. **TrustUpdater receives the computed new trust value** (not the delta) — the activity owns delta computation; the updater owns persistence. Clean separation.

---

## §-Level Ambiguities

### Ambiguity 1: §30 §2.3 does not exist as a section (SPEC GAP)

**Issue:** decisions.md cites "§30 §2.3 'Trust Dynamics Beyond the Static Floor'" as the contract source, but this section does NOT exist in `docs/eureka/sections/30-learning-systems.md`. Section numbering jumps from `2.2 Recency` directly to `2.4 Time Injection for Testability`.

**Resolution chosen:** decisions.md Named M5 Target is authoritative for delta values (+0.10, -0.10, ±0.30). The spec gap should be escalated to Edgar/Cassima to add the missing §2.3 section.

**Action item:** Request Cassima (or Edgar) add §30 §2.3 to the learning-systems spec.

### Ambiguity 2: user_correction ± sign source (DEFERRED)

**Issue:** "trust = min(1.0, trust ± 0.30)" — the ± means correction can increase or decrease trust. The sign must come from somewhere. Options:
- (a) Separate event types: `'user_correction_positive'` / `'user_correction_negative'`
- (b) Caller-provided signed delta: `correctionDelta: +0.30 | -0.30`
- (c) Single magnitude, direction inferred from context (e.g., "was the correction toward truth?")

**Resolution chosen for RED:** Option (b) — `correctionDelta` in options. Test for user_correction deferred to M5 GREEN; Edgar confirms interface shape.

**Deferred test (for Edgar's GREEN):**
```typescript
it('applies user-correction delta (+0.30) clamped to 1.0 ceiling (§30 §2.3)', async () => {
  // currentTrust=0.80, correctionDelta=+0.30 → min(1.0, 0.80 + 0.30) = 1.0
  await applyFeedback(
    { factId: 'fact-001', sessionId, event: 'user_correction', currentTrust: 0.80, correctionDelta: +0.30 },
    { trustUpdater, clock: fixedClock },
  );
  expect(trustUpdater.update).toHaveBeenCalledWith(expect.objectContaining({ trust: 1.0 }));
});
```

### Ambiguity 3: where does currentTrust come from in production? (DEFERRED)

**Issue:** The test provides `currentTrust` as an option. In production, the caller must read the current trust before calling `applyFeedback`. This requires either:
- (a) Extending `FactStore` with a `read(factId)` method
- (b) A separate `FactReader` interface
- (c) Callers always have `currentTrust` in context (e.g., from a preceding `recall()`)

**Resolution chosen for RED:** Caller-provided `currentTrust`. M5 GREEN can resolve the read-seam question.

---

## Tests Written (M5 RED)

| Test | Event | currentTrust | Expected new trust | Clamped? |
|---|---|---|---|---|
| M5-C1 corroboration | `'corroboration'` | 0.60 | 0.70 | No |
| M5-C1 ceiling clamp | `'corroboration'` | 0.95 | 1.00 | Yes (min 1.0) |
| M5-C2 contradiction | `'contradiction'` | 0.50 | 0.40 | No |
| M5-C2 floor clamp   | `'contradiction'` | 0.05 | 0.00 | Yes (max 0.0) |

---

## What Edgar Implements (M5 GREEN)

1. Export `applyFeedback` from `packages/eureka/src/activities/recall.ts`
2. Export `TrustUpdater` interface from same file
3. Implement delta computation:
   - `'corroboration'`: `Math.min(1.0, currentTrust + 0.10)`
   - `'contradiction'`: `Math.max(0.0, currentTrust - 0.10)`
   - `'user_correction'`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))` (clamp both ends)
4. Call `deps.trustUpdater.update({ factId, sessionId, trust: newTrust })`
5. Confirm user_correction interface shape and write the deferred test (or hand back to Laura)
6. Verify: all 4 M5 RED tests pass; all 18 M1–M4 tests still pass

---

## Related

- Named M5 Target: decisions.md line ~276
- Team Norm TDD Ownership: decisions.md line ~295
- Contract: `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`
- §30 §2.1 domain invariants (trust ∈ [0.0, 1.0]; zombie-fact semantics at trust=0.0)
- Backlog: Crispin needs TrustUpdater contract test when real implementation ships

---

## edgar-m5-green
# Decision Drop: M5 GREEN — Trust Feedback Mutation Implementation

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M5 GREEN — `applyFeedback` + `TrustUpdater` landed in `recall.ts`  
**Status:** COMPLETE  

---

## What Landed

### Implementation

- **`TrustUpdater` interface** exported from `packages/eureka/src/activities/recall.ts`
  - Shape: `update(args: { factId: string; sessionId: SessionId; trust: number }): Promise<void>`
  - `trust` is the already-clamped new value — activity owns delta math, seam owns persistence

- **`applyFeedback` activity** exported from same file
  - Signature matches Laura's M5 RED spec exactly
  - Delta computation:
    - `corroboration`: `Math.min(1.0, currentTrust + 0.10)`
    - `contradiction`: `Math.max(0.0, currentTrust - 0.10)`
    - `user_correction`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))`
  - `clock` dep: REQUIRED, consistent with M1–M4 pattern (§55 §1.2). Not called yet — reserved for future feedback timestamping.

### Test Counts

| Suite | Tests | Status |
|---|---|---|
| `recall-feedback.test.ts` (M5) | 4 | ✅ GREEN |
| `recall.test.ts` (M1–M4) | 18 | ✅ still GREEN |
| **Total** | **22** | **✅ all pass** |

Build: `tsc` clean, exit 0.

---

## Decisions Made

### user_correction Interface (Ambiguity 2)

**Confirmed: Option (b) — caller-provided signed `correctionDelta`.**

Rationale:
- Avoids event-type proliferation (`user_correction_positive` / `user_correction_negative`)
- Caller has precise magnitude control
- Sign encodes direction cleanly — no inference needed
- Consistent with Laura's test design in the decision drop

### Read-Seam Question (Ambiguity 3) — DEFERRED

The question of where `currentTrust` comes from in production (FactStore read vs. FactReader vs. caller-has-it-from-recall) does **not affect this beat**. `applyFeedback` is a pure write activity; `currentTrust` is caller-provided. Deferring this keeps M5 focused.

**Disposition:** Deferred. Named as next RED target below.

### §30 §2.3 Spec Gap

Laura flagged that §30 §2.3 ("Trust Dynamics Beyond the Static Floor") was cited in decisions.md but did not exist in the doc. I wrote it directly (it was fully derivable from decisions.md Named M5 Target). No Cassima escalation needed — scope-appropriate for Edgar to close.

Section added to `docs/eureka/sections/30-learning-systems.md` between §2.2.1 and §2.4, covering:
- Event-delta table (corroboration / contradiction / user_correction)
- Domain invariant (trust ∈ [0.0, 1.0])
- Interface contract (applyFeedback, TrustUpdater, caller-provided currentTrust)
- User correction sign convention (Option b, signed delta)
- Measurable outcomes (the 4 M5 test fixtures documented as spec evidence)

---

## Named Next RED Targets

### M6-A: `user_correction` event test (deferred from M5)

**Beat:** user_correction delta with ceiling clamp  
**Owner:** Laura (RED)  
**Contract:** `applyFeedback` with `event: 'user_correction'`, `currentTrust: 0.80`, `correctionDelta: +0.30` → `trust: 1.0`  
**Also needed:** floor-clamp case (e.g., `currentTrust: 0.05`, `correctionDelta: -0.30` → `trust: 0.0`)  
**Note:** The activity implementation already handles `user_correction` correctly — these tests verify the shape is wired and clamped at both ends.

### M6-B: Read-seam (currentTrust source in production)

**Beat:** How does a caller obtain `currentTrust` before calling `applyFeedback`?  
**Owner:** Laura (RED) — after design decision  
**Decision needed first:** Option (a) extend FactStore.read(), (b) FactReader interface, or (c) callers always have it from recall()  
**Recommendation:** Option (c) first — callers that just ran recall() already have the trust value. Extend FactStore only when a non-recall pathway (e.g., scheduled trust decay) needs it.

---

## Backlog Items

- **Crispin:** Contract test for real `TrustUpdater` implementation when it ships (M5+ backlog, per Laura's RED decision drop)
- **Future:** Timestamp feedback application via `clock` dep in `applyFeedback` (dep slot reserved)
- **Future:** Per-call `trustFloor` override via `RecallOptions` (existing TODO in recall.ts, separate track)

---

## edgar-pr30-cycle2-runtime-tier-guard
# Decision: Runtime attentionTier Guard — Compile-time Union Strictness + Runtime Stderr-Warning Fallback

**Date:** 2026-05-29
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 2, Thread PRRT_kwDORy1V9M6F2hAP
**Status:** Resolved — implemented option (a)

---

## Context

`compositeScore()` in `recall.ts` looks up `ATTENTION_MULTIPLIERS[fact.attentionTier]`. The
lookup is keyed on the TypeScript union `'hot' | 'warm' | 'cold'`. TypeScript narrows
compile-time callers correctly, but `RecallResult` values are produced by `FactStore.search()`
whose runtime origin is SQLite. A row with an unrecognised tier string (legacy casing like
`'Hot'`, a future migration value, or a malformed row) causes the lookup to return `undefined`,
which propagates as `NaN` into the sort comparator — the same failure mode as the F1 negative-
tDays guard.

**Cycle 1 / F2 context:** F2 deliberately removed the `?? 1.00` silent fallback because Skeptic
correctly argued it hid typo drift at the TypeScript boundary. That decision was right for
compile-time callers. Copilot's Cycle 2 finding is that runtime data from SQLite bypasses TS
narrowing entirely — a separate concern.

---

## Decision

**Option (a) chosen:** Default unknown tiers to `1.0` multiplier at the `compositeScore()`
call site, with a `console.warn` to stderr.

**Option (b) deferred:** Validating the tier at the FactStore boundary is architecturally
correct (belt-and-suspenders) but requires a concrete FactStore implementation that does not yet
exist (Crispin's domain). Option (a) is self-contained and survives any future FactStore impl.

### Rationale

- Compile-time strictness (no `?? 1.00` on the type-safe path) and runtime defensiveness (warn
  + default on the SQLite-origin path) are complementary, not contradictory. They operate at
  different seams.
- `console.warn` (stderr) preserves MCP stdio compatibility — MCP transport uses stdout for
  JSON-RPC frames; stdout noise corrupts the protocol. All eureka activity diagnostics must use
  stderr.
- The 1.0 default is the warm-tier identity value — the most conservative safe default (no
  amplification, no suppression).

---

## Implementation

- `recall.ts` `compositeScore()`: `let multiplier = ATTENTION_MULTIPLIERS[fact.attentionTier];`
  followed by `if (multiplier === undefined) { console.warn(...); multiplier = 1.0; }`.
- `recall.test.ts`: two new regression tests in `describe('runtime attentionTier guard (F7)')`:
  1. `compositeScore` unit test with `'Hot' as any` — verifies finite score + warn emitted once.
  2. `recall()` integration test — verifies non-NaN ordering and warn fires once.
  Both use `vi.spyOn(console, 'warn')` restored in `afterEach`.

---

## Note for Crispin

When the concrete `FactStore` implementation lands, add boundary validation that rejects (or
normalises) unrecognised `attention_tier` values before they surface as `RecallResult`. The
option (a) guard in `compositeScore()` remains as defense-in-depth; option (b) adds belt-and-
suspenders at the seam where data crosses from SQLite into the activity layer.

---

## edgar-pr30-cloud-review-threads-2-3-4
# Decision Drop — PR #30 Copilot Cloud Review (Threads 2, 3, 4)

**Agent:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-29
**Branch:** eureka/v1-m1-m4
**Commit:** a28f1f3
**PR:** #30

---

## Decision 1 — Activity-layer types use camelCase (Thread 3)

**Context:** `RecallResult` had mixed naming: `attentionTier` and `lastAccessed` were
originally spelled `attention_tier` and `last_accessed` (snake_case), mirroring DB column
names. However, `RecallResult` is the activity-layer return type — not a row mapper — and
the rest of the workspace consistently uses camelCase for TypeScript types.

**Decision:** Activity-layer types use camelCase. The FactStore storage seam is responsible
for snake↔camel mapping at the data boundary (one mapping point, not spread across activity
code and tests).

**Norm established:** `RecallResult.attentionTier` and `RecallResult.lastAccessed` are the
canonical field names. Any concrete FactStore implementation (Crispin's concern) must map
from DB column names to this camelCase shape before returning results to the activity layer.

**Files changed:** `recall.ts`, `recall.test.ts`

---

## Decision 2 — Ranker BM25-truncation constraint documented, overfetch deferred (Thread 2)

**Context:** `recallWithScores` passes `limit: k` to `factStore.search()`, so a custom
`Ranker` only receives at most `k` BM25-pre-ranked candidates. It cannot surface facts the
storage layer ranked at positions k+1..k+m. This is a real constraint for non-trivial rankers
(recency-weighted, attention-tier-aware, etc.).

**Decision:** Document the constraint on the `Ranker` JSDoc rather than implementing
overfetch. No production `Ranker` consumer exists yet; overfetching now would be speculative.
If a future `Ranker` needs broader candidate visibility, the fix is `limit: k * overfetchFactor`
in `recallWithScores` when a ranker is injected. Tracked as future work in the JSDoc.

---

## Decision 3 — Remove fragile §50 line-number citation from source (Thread 4)

**Context:** The `ATTENTION_MULTIPLIERS` JSDoc contained: *"§50 line 211 contains incorrect
values — §30 §1.2 is the authoritative source."* Embedding external document line-number
claims in production source is fragile: the document will be edited, the line number will
shift, and the comment becomes misleading.

**Decision:** Trim to cite only the authoritative source: *"Authoritative source: §30 §1.2."*
The §50 inconsistency is tracked in decisions.md from Cycle 1 (the tension Laura flagged at
M3). It does not need to be re-litigated in production source code.

**Anti-pattern named:** Fragile-doc-cite — embedding external document line-number assertions
in source comments.

---

## edgar-pr30-cycle3-c1-c4
# Decision Drop: PR #30 Cycle 3 — C1 Warn Dedupe + C2 Ranker Order Trust + C3 Overfetch + C4 k Validation

**Date:** 2026-05-30
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 3
**Threads:** PRRT_kwDORy1V9M6F2kGT (C1), PRRT_kwDORy1V9M6F2kGW (C2), PRRT_kwDORy1V9M6F2kGY (C3), PRRT_kwDORy1V9M6F2kGa (C4)
**Status:** Resolved — all four implemented in a single commit on eureka/v1-m1-m4

---

## C1 — Warn Dedupe via Per-Call Set

### Problem
`compositeScore` emitted one `console.warn` per fact with an unrecognised `attentionTier`. A recall
call returning k=10 facts with a legacy tier string produced 10 identical log lines per query. This
is noise amplification — a single bad row's tier multiplies into k lines per call.

### Decision
Move warn emission out of `compositeScore` entirely. `compositeScore` now silently defaults unknown
tiers to `1.0` (warm-tier identity) via `?? 1.0`. `recallWithScores` collects unknown tier strings
into a `Set<string>` during its pre-scoring iteration over `trusted` candidates, then emits ONE
`console.warn` at the end of the call if the set is non-empty. Message format:

> `[eureka.recall] Unknown attention_tier values encountered: Hot. Defaulted to 1.0 multiplier. Validate at FactStore boundary.`

The Set naturally deduplicates repeated instances of the same bad tier across multiple facts.

### Rationale
- Diagnostic emission belongs at the call boundary, not in a per-item pure function.
- `compositeScore` is now a pure function (no side effects) — easier to test, no spy required.
- The warn still fires even on the ranker path (Set is populated before the ranker/inline fork).

### Test impact
- `compositeScore` F7 test: removed `warnSpy` setup and warn assertions (function is now pure).
- `recall()` F7 test: spy still verifies `toHaveBeenCalledOnce()` + message contains tier value.

---

## C2 — Ranker Order Trust (no re-sort after ranker)

### Problem
`recallWithScores` always re-sorted the result of `ranker(trusted, { nowMs })` by score descending.
This silently defeated any deliberate non-score-monotonic ordering a Ranker might express (diversity
reranking, MMR, explicit position weighting). The JSDoc contradicted itself on this point.

### Decision
**Option (b) chosen**: when a Ranker is injected, trust its returned order — do NOT re-sort.
Only the inline path (no ranker) sorts. Code shape:

```typescript
const scored = ranker
  ? ranker(trusted, { nowMs })                                        // trust ranker's order
  : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }))
           .sort((a, b) => b.score - a.score);
```

The Ranker JSDoc was rewritten to be unambiguous: the Ranker owns final ordering; if it wants
score-monotonic output, it sorts internally. `recallWithScores` only slices to k.

### Rationale
- Option (a) (document-only) was rejected: the contradiction in the JSDoc was a bug waiting to
  happen in any real diversity ranker.
- Option (b) is a one-line structural change with a clear contract: Ranker = final authority on order.
- The C6 guard test was updated: the no-op ranker now sorts internally, remaining a valid equivalence
  test between the ranker and inline paths.

### Test impact
- C6 no-op ranker: updated `noOpRanker` to include `.sort((a, b) => b.score - a.score)`.
- New C2 regression test: reverse-order Ranker; verify recall() preserves ascending order (not re-sorted).

---

## C3 — Overfetch Factor (F6 Arc Closed)

### Problem
`recallWithScores` called `FactStore.search({ limit: k })`. The composite ranker (or any custom
Ranker) could only reorder within the BM25-truncated top-k. Tier and trust components of FR-2 were
largely cosmetic relative to BM25 — the ranker had no visibility beyond the k facts BM25 surfaced.

This was the open residual from the F6 escalation: Cassima+Crispin chose to push trust filtering to
the store (F6 resolution); the BM25-truncation aspect (ranker candidate starvation) remained open.

### Decision
Add `const RANKER_OVERFETCH_FACTOR = 3` and change the search call to `limit: k * RANKER_OVERFETCH_FACTOR`.
The final `scored.slice(0, k)` still trims to k — overfetch is internal-only; the caller contract is
unchanged.

**Why 3?** Small constant. Conservative: 3× gives the ranker meaningful surface without excessive
storage load. Can be revisited when concrete FactStore performance data is available. Named const makes
the intent clear and makes future tuning a one-line change.

### Rationale
This closes the F6 arc entirely:
- F6 (Cassima/Crispin): trust floor at data layer → resolved in Cycle 2
- F6 residual (ranker candidate starvation): `limit: k` → resolved here with `limit: k * 3`

### Test impact
- F6 regression test (Laura's): `limit: 5` updated to `limit: 15` (k=5 × RANKER_OVERFETCH_FACTOR=3).
- New C3 test: verifies `factStore.search` receives `limit: 15` when k=5.

---

## C4 — k Input Validation

### Problem
`RecallOptions.k` had no validation. Negative, zero, fractional, NaN, or Infinity values were passed
directly to `factStore.search({ limit: k })` and `slice(0, k)`. The SQLite `LIMIT` behavior for
these values is implementation-defined; JavaScript's `Array.prototype.slice(0, NaN)` returns `[]`
silently, hiding the bug.

### Decision
Validate at the entry point of `recallWithScores` before any I/O:

- `k === 0`: valid — return `[]` immediately without calling factStore. Avoids `LIMIT 0` edge cases.
- `!Number.isFinite(k)`: throws `TypeError` (handles NaN, +Infinity, -Infinity).
- `!Number.isInteger(k)`: throws `TypeError` (handles 1.5, etc.).
- `k < 0`: throws `TypeError`.

Since `recall()` is a thin wrapper delegating to `recallWithScores`, validation in `recallWithScores`
suffices for both entry points.

### Rationale
- Fail-fast at the boundary: the error appears at the call site, not buried in SQLite or a silent
  empty result.
- `k === 0 → []` is the right semantic: "give me zero results" is a valid (if unusual) request.
- `k < 0` and non-integers are programming errors; TypeError is the appropriate JS error type.

### Test impact
Five new tests in `describe('k input validation (C4)')`:
- `k = 0` → `[]`, factStore.search NOT called.
- `k = -1` → TypeError.
- `k = 1.5` → TypeError.
- `k = NaN` → TypeError.
- `k = Infinity` → TypeError.

---

## Summary

| Finding | Change | Behaviour preserved |
|---------|--------|---------------------|
| C1 | `compositeScore` pure; `recallWithScores` emits ONE Set-deduped warn | 1.0 fallback for unknown tiers unchanged |
| C2 | Ranker path skips re-sort; Ranker owns final order | Inline path still sorts descending |
| C3 | `limit: k * 3` overfetch; caller still gets k results | trust floor (`minTrust: 0.15`) unchanged |
| C4 | k validated at entry; `k=0 → []`; invalid → TypeError | Valid positive-integer k unchanged |

**Test count:** 11 → 18 (7 new regression tests added across C2, C3, C4; F7 compositeScore test simplified).
**Commit:** bde6416 on eureka/v1-m1-m4

---

## roger-issue-11-implementation
# WI-A Implementation Log — Issue #11: Worktree-aware sessions

**Author:** Roger (Platform Dev)  
**Branch:** `squad/11-worktree-aware-sessions`  
**Worktree:** `D:\git\stunning-adventure-11`  
**Status:** Cloud review cycle 5 applied — ready for push

---

## Cloud Review Cycle 1 Fixes (commits 8537f48, 13080af)

### F1 — `get_session` error message clarity (commit 8537f48)

Old message: `'Provide either session_id or repo_key (with optional workdir).'`
was misleading because `workdir` is required (not optional) when using `repo_key`.

Changed to: `'Provide either session_id, or both repo_key and workdir.'`

`workdir` inputSchema description was already correct from cycle 2:
`'Required when using repo_key. Optional when using session_id.'`

Updated `worktreeMcp.test.ts` assertion to match the new message.

### F2 — Rejected (no change)

Reviewer suggested collapsing the `repo_key`-without-`workdir` branch into the
no-input branch. Decision: keep the two branches separate — they represent
distinct caller mistakes (no input vs. partial input) and deserve distinct,
actionable error messages.

### F3 — Atomic `startSession` + UNIQUE partial index (commit 13080af)

**F3a — Immediate transaction in `archivist.startSession()`:**

The find-or-create sequence (`getActiveSession → claimLegacyActiveSession →
createSession`) is now wrapped in `db.transaction(fn).immediate()`. Using
`IMMEDIATE` acquires the write lock at transaction start, preventing two
concurrent callers from both observing "no active session" and both INSERTing
a new row.

Note: `fn.immediate()` calls the function and returns its result directly.
A draft with `fn.immediate()()` would have tried to call the return value
as a function — corrected before committing.

**F3b — Migration 016: dedup + UNIQUE partial index:**

New migration `016-active-session-unique.ts`:

1. **Dedup pass**: For each `(repo_key, workdir)` group with >1 active user
   session, keep the most-recently started row, complete the rest. Runs
   before index creation to avoid constraint violation on pre-existing data.

2. **UNIQUE partial index**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir
     ON sessions (repo_key, workdir)
     WHERE status = 'active' AND session_kind = 'user';
   ```
   Partial index covers only active user sessions; completed/system sessions
   are unaffected.

Schema version bumped to 16. Version assertions in `db.test.ts`,
`migration012.test.ts`, `prescriptions.test.ts`, and `discovery.test.ts`
updated 15 → 16. `migration015.test.ts` assertions changed to check
`WHERE version = 15` (presence) rather than `MAX(version)` so they remain
stable as more migrations are added.

---

## Cloud Review Cycle 2 Fix (commit cd47409)

### G1 — `normalizeWorkdir` applies transforms to untrimmed input

`normalizeWorkdir` checked `input.trim()` for emptiness but then passed the
original (untrimmed) `input` to all subsequent transforms. A path like `' /'`
would slip past the empty guard and produce `' '` (a whitespace-only string)
instead of `'/'`.

Fix: assign `const trimmed = input.trim()` first, return `undefined` if it is
empty, then base all path transforms on `trimmed`.

Regression tests added:
- `normalizeWorkdir(' /')` → `'/'`
- `normalizeWorkdir('  D:/proj  ')` → `'D:/proj'`
- `normalizeWorkdir('\t')` → `undefined`

---

## Cloud Review Cycle 3 Fixes (commit e4002c1)

### H1 — Migration 016 UNIQUE index doesn't cover NULL-workdir case

SQLite UNIQUE indexes treat each NULL as distinct — a single index on
`(repo_key, workdir)` allows multiple rows with `workdir = NULL` to coexist
for the same `repo_key`. The original migration 016 index was therefore
ineffective at preventing duplicate active NULL-workdir sessions.

Fix: Replace the single index with two separate partial indexes:

```sql
-- Non-NULL workdir: unique per (repo_key, workdir) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_nonnull
  ON sessions (repo_key, workdir)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NOT NULL;

-- NULL workdir: at most one legacy active session per repo_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_null
  ON sessions (repo_key)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NULL;
```

The dedup pass (`GROUP BY repo_key, workdir`) was already correct — SQLite
groups NULLs together in `GROUP BY`, so no change was needed there.

Test changes:
- Removed two `claimLegacyActiveSession` orphan-cleanup tests that relied
  on inserting duplicate NULL-workdir sessions (now DB-prevented; the scenario
  they tested is handled at migration time by the dedup pass)
- Added "UNIQUE index rejects duplicate active NULL-workdir sessions" test
- Added Area 10b: migration 016 dedup test using a synthetic pre-016 DB to
  verify the NULL-workdir dedup pass correctly keeps the most-recent row

### H2 — `@internal` helpers exported from `index.ts`

`claimLegacyActiveSession` was exported from `packages/cairn/src/index.ts`
(line 52) despite being tagged `@internal`. It is an implementation detail of
the session start hook and must not be part of the public package API.

Fix: Removed `claimLegacyActiveSession` from the `sessions.js` export block
in `index.ts`.

Audit of other `@internal` symbols: `normalizeWorkdir` and
`getSkillToolWorkdir` (both in `utils/workdir.ts`) were not exported from
`index.ts` — no change needed.

Tests use deep imports (`from '../db/sessions.js'`) throughout — no test
changes required for H2.

---

## Summary

Makes Cairn's session resolution workdir-aware so concurrent worktrees on the
same repo don't collide on a single active session.

Core mechanism: `(repo_key, workdir)` session identity pair stored in a new
`workdir TEXT` column (migration 015). NULL workdir = legacy/pre-worktree
sessions. `getActiveSession(db, repoKey, workdir?)` uses `AND workdir IS ?`
(NULL-IS semantics) so NULL is a first-class identity value.

---

## Cycle 3 Skeptic Fixes (commit 19deef2)

### Item 1a — `getSkillToolWorkdir()` helper

`normalizeWorkdir(process.env.CAIRN_WORKDIR)` was inlined at all three
skill-tool call sites in `server.ts`. Centralised into `getSkillToolWorkdir()`
in `utils/workdir.ts` — env-var name and normalisation live in one place.

### Item 1b — Multi-session ambiguity warning

`getUserSessionForMcpFallback` gained an optional `source: 'env-var' | 'explicit'`
parameter. When `source === 'env-var'` and `workdir` is absent but the repo has
multiple active sessions, a `process.stderr.write` warning is emitted. All
three skill-tool call sites pass `'env-var'`.

### Item 2 — Safe orphan cleanup with 5-minute grace window

The old Step 3 in `claimLegacyActiveSession` used a single bulk `UPDATE` to
complete all other NULL-workdir orphans. Replaced with a per-session loop:

1. Fetch orphan candidates (SELECT with id != winner).
2. For each: `getLastEventTime` (falls back to `started_at`).
3. If idle < 5 min → skip + `process.stderr.write` warning.
4. If idle ≥ 5 min → `UPDATE status = 'completed'`.

SQLite timestamps (`YYYY-MM-DD HH:MM:SS` UTC) are converted to ISO-8601 with
`'Z'` suffix before `new Date()` parsing to avoid host-timezone errors.

Test updated: orphan timestamp changed from `-2 seconds` to `-10 minutes`.
New test added: orphan within grace window is preserved.

---

## Key Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| `getActiveSession` no-arg → NULL-only | `AND workdir IS NULL` | Matches only sessions without a workdir; not "most recent regardless" |
| Orphan grace window | 5 minutes | Conservative enough to protect live concurrent archivist startups |
| UTC parsing of SQLite timestamps | `.replace(' ', 'T') + 'Z'` | SQLite `datetime()` is always UTC; JS `new Date()` needs explicit Z |
| Skill-tool env-var source tag | `'env-var'` literal | Lets sessionFallback distinguish orchestrator-injected vs caller-supplied workdirs |

| `fn.immediate()` call pattern | Call without extra `()` | `db.transaction(fn).immediate()` calls fn and returns its result; `().()` would try to call the return value |

---

## Test Coverage

- 1405/1405 tests green (60 test files)
- New Area 10 tests: race regression (two startSession calls → one session),
  UNIQUE constraint enforcement, completed-session allows new active session

---

## Cloud Review Cycle 5 Fixes (commit 469b741)

### J1 — Remove unused `randomUUID` import

`worktreeSessions.test.ts` had `import { randomUUID } from 'node:crypto'` left
over from orphan-cleanup tests removed in cycle-3 H1. Dropped the import;
ESLint `no-unused-vars` now clean.

### J2 — Tighten `claimLegacyActiveSession` CAS UPDATE predicate

The outer `UPDATE` in the CAS step only guarded `AND workdir IS NULL`, leaving
a theoretical race where a session that changed status or kind between the
SELECT and the UPDATE would still have its workdir overwritten.

Added `AND status = 'active' AND session_kind = 'user'` to the outer UPDATE so
the CAS is self-contained: the guard predicates match exactly the conditions
used to select the candidate.

Regression test added in Area 7: creates a NULL-workdir session, completes it
between selection and claim, asserts claim returns `undefined` and the row's
`status` remains `'completed'` with `workdir` still NULL.

**Status:** Cloud review cycle 5 applied — ready for push


When `workdir !== undefined` is passed but `normalizeWorkdir(workdir)` returns
`undefined` (e.g. `'   '` or `'\t'`), the old code silently fell through to
`listActiveSessionsForRepo`, returning the all-sessions list — wrong shape
and wrong semantics.

Fix: after normalization, if `nwd === undefined` return `isError` with message:
`'Invalid workdir: empty or whitespace-only string. Omit workdir to list all sessions, or provide a non-empty path.'`

Added Area 5f regression test in `worktreeMcp.test.ts` asserting the guard
and message text are present in the `get_status` handler body.

### I2 — Over-indented error payload in `get_session`

In the `!repo_key` early-return block, the `error:` line inside
`JSON.stringify({ error: '...' })` had extra indentation vs sibling blocks.
Cosmetic fix only.

### I3 — `getActiveSession` JSDoc missing user-sessions-only note

Added `@remarks` tag to the JSDoc: "Returns ONLY user sessions
(`session_kind = 'user'`). System sessions are excluded. For system-session
lookup, use a dedicated helper."

---

---

## WI-B Decisions Merge (2026-05-30T12:26:16Z)



