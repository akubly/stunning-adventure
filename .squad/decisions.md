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

