# Rosella — History

## 2026-05-01: Persona Review Fixes — Prescribers + Applier (F3, F6b, F9, F10)

**Task:** Resolve four findings from persona review on the Phase 4.5 prescribers + applier modules.

**Changes:**

1. **F3 (BLOCKING) — Self-tuning `tokenPressure` normalization.** `packages/forge/src/applier/selfTuning.ts`:
   - Added third arg `context: TuneContext` carrying `budgetLimitNanoAiu` (mirrors `StrategyContext` from `models/strategy.ts`).
   - `tokenPressure = clamp(costPerSession / budgetLimitNanoAiu, 0, 1)`. Now lives in 0-1 space matching `budgetThreshold`, so the budget knob can both tighten and relax.
   - Added `DEFAULT_BUDGET_LIMIT_NANO_AIU = 1_000_000` (matches model-selection PoC) and a guard for non-positive limits.

2. **F6b (IMPORTANT) — Prescribers consume signal components.** `promptOptimizer.ts`:
   - Tool-guidance trigger now reads `profile.signals?.toolEntropy` (Roger's new field on `ExecutionProfile`), falling back to `profile.drift.p95` only for legacy profiles.
   - Updated trigger metric in evidence to `toolEntropy` (was `driftP95`).
   - Kept `toolEntropyThreshold` config name — now semantically accurate. Doc-comment notes the fallback path.
   - `tokenOptimizer.ts`: no signal-misuse there; only the shared snapshot extraction.

3. **F9 (MINOR) — Shared `buildSnapshot` utility.** Created `packages/forge/src/prescribers/utils.ts`. Both prescribers import from it. Snapshot now sources `driftLevel` from `classifyDriftLevel()` instead of inline thresholds — single source of truth for GREEN/YELLOW/RED.

4. **F10 (MINOR) — Adaptive `explorationBudget`.** `selfTuning.ts`:
   - GREEN drift → multiply by `EXPLORATION_DECAY = 0.9` (decay toward floor as confidence grows).
   - RED drift → multiply by `EXPLORATION_GROWTH = 1.1` (widen the search).
   - YELLOW → no change. Clamped to `[EXPLORATION_FLOOR, EXPLORATION_CEILING]` so Aaron's hard floor still holds.

5. **Aggregator support.** `packages/forge/src/telemetry/aggregator.ts`: now folds `metadata.signals` from drift samples into `profile.signals` using the same prevCount-weighted mean pattern as `drift.mean`. `signals` stays absent when no drift sample carries it (backward-compatible).

6. **Tests.** Added 8 new tests to `prescribers-applier.test.ts` covering: budget-relative tokenPressure (tighten + relax), default fallback, non-positive guard, exploration decay/grow/hold under GREEN/RED/YELLOW, and signal-driven tool-guidance preference. Updated `StrategyParameters` import to include `TuneContext`. All 36 tests pass.

## 2026-05-03: Phase 4.6 Wave 1 & 3 — Prescriber Types + Lockout Fixes

**Wave 1 (parallel):**
- R1–R5: ChangeVectorSummary type definition, computeConfidenceBoost utility, prescriber integration for both optimizers (historicalVectors param), drift weight export verification
- Decision on weight constants: confirmed DRIFT_WEIGHTS already exported from forge/telemetry/drift.ts (mapping documented)
- 5 test suites created (migration, CRUD, prescriber integration, Curator end-to-end, weight consistency regression)
- Laura upgraded 1099 → 1102 passing tests

**Wave 2 (defect triage):**
- Laura flagged inconsistency: `summarizeChangeVectors` returns confidence=0 but `computeConfidenceBoost(0)` returns 1.0
- Three options analyzed; verdict: rename field to `confidenceBoost` for semantic clarity (Option B)
- Fix routing assigned me: lockout rule prohibits Alexander from fixing his own changeVectors.ts, so I do it

**Wave 3 (lockout):**
- Changed Alexander's changeVectors.ts: rename confidence → confidenceBoost, fix zero-vector case from 0 → 1.0, update JSDoc
- Commit: d592838 — confident lockout enforcement worked. Both our implementations were correct; the bug was the contract ambiguity

**Lesson:** Lockout rule as a learning device. When I first designed ChangeVectorSummary with confidence as a "boost" (identity = 1.0), it looked right in isolation. Alexander's zero-initialization looked right in isolation. Neither caught the other's assumption. Cross-review under lockout surfaces these blind spots before they compound.

**Coordination notes:**
- Roger had already added `ProfileSignals` and `signals?: ProfileSignals` to `ExecutionProfile` in `packages/types/src/index.ts` — no schema collision; my code consumes his contract.
- Pre-existing build state: `packages/forge/src/telemetry/collectors.ts` is missing on disk (referenced by `telemetry/index.ts` and two test files). 15 of 529 tests fail because of this; all failures are in `telemetry-collectors.test.ts` and `feedback-loop.test.ts` and are unrelated to this fix-set. Flagged for whoever owns collectors implementation.

**Verification:** `npx vitest run src/__tests__/prescribers-applier.test.ts` → 36/36 green. Full suite: 514/529 (only the pre-existing collectors-related failures remain).


## 2026-05-03: Phase 4.6 — Change Vector Prescriber Integration (R1–R5)

**Task:** Implement Wave 2 prescriber enhancements for change vector learning.

**Changes:**

1. **R1 — `ChangeVectorSummary` type.** Added to `prescribers/types.ts`:
   - New interface with `category`, `skillId`, `meanNetImpact`, `vectorCount`, `confidence`.
   - Added `predictedImpact?: number` to `OptimizationHint` for vector-informed ranking.
   - Updated file-level doc comment to reference Phase 4.6 additions.

2. **R2 — `computeConfidenceBoost` utility.** Added to `prescribers/utils.ts`:
   - Formula: `log(1 + vectorCount) / log(1 + minVectors)`, default minVectors = 3.
   - Edge case: vectorCount ≤ 0 → returns 1.0 (neutral, no boost/penalty).
   - Wave 1 policy (Aaron confirmed): positive boost only, negative penalty deferred to Wave 2.

3. **R3/R4 — Prescriber integration.** Both `analyzePromptOptimizations` and
   `analyzeTokenOptimizations` gain optional third param `historicalVectors?: ChangeVectorSummary[]`.
   - When provided: confidence boosted, `predictedImpact` set, hints sorted by predicted impact desc.
   - When omitted: identical to Phase 4.5 — backward compat preserved, all 534 existing tests pass.

4. **R5 — Drift weight audit.** `DRIFT_WEIGHTS` was already exported as a frozen named const
   from `telemetry/drift.ts`. No code change needed. Filed
   `rosella-phase4.6-drift-weights.md` in the decision inbox with weight mapping table
   and cairn↔forge dependency guidance for Alexander.

5. **Index update.** Exported `ChangeVectorSummary`, `computeConfidenceBoost`, and `buildSnapshot`
   from `prescribers/index.ts` for Laura's tests and future callers.

**Commits:** 2 (R1+R2 foundation, R3+R4+index integration). R5 was documentation only.

**Tests:** 534/534 passing (baseline unchanged — all Phase 4.5 tests green).

## 2026-05-03: Phase 4.6 — Reviewer Rejection Fix: changeVectors confidenceBoost

**Task:** Fix `packages/cairn/src/db/changeVectors.ts` per Graham's Option B verdict
(lockout: Alexander authored the file, so Rosella fixes it).

**Changes:**
1. Renamed `confidence` → `confidenceBoost` in the local `ChangeVectorSummary` interface.
2. Fixed zero-vector branch: `confidence: 0` → `confidenceBoost: 1.0` (multiplicative identity).
3. Updated JSDoc on `summarizeChangeVectors` to document the vectorCount===0 contract and
   its alignment with `computeConfidenceBoost(0)`.

**Build status:** 9 type errors remain in `prescribers-vectors.test.ts` — those files still
reference `.confidence` and are Laura's responsibility to update. Alexander's `types.ts`
rename has already landed, which is why the type errors surface. Expected mid-flight.

**Commit:** `d592838` — Phase 4.6: fix changeVectors confidenceBoost (rename + 0→1.0)

---

## Learnings

- **Value vs name: the multiplicative identity is 1.0, not 0.** When a field carries
  boost-multiplier semantics (ℝ⁺, multiplicative), the "no evidence" default must be 1.0
  (identity element), not 0. Returning 0 silently zeroes every downstream calculation.
  Returning 1.0 means "no change" — exactly what absence of evidence should produce.

- **A misnamed type field invites divergent implementations.** `confidence: number` is
  ambiguous — a level-space thinker writes `0` (no confidence), a boost-space thinker
  writes `1.0` (identity). Both are internally consistent; the bug is the name.
  Renaming to `confidenceBoost` collapses the ambiguity: there is only one sensible
  default (1.0) and one sensible formula (log-scaled ratio). The rename fixed the root
  cause; the value fix fixed the symptom. You need both.

- **Optional param vs config** is the right call for dynamic query-time data like vectors.
  It keeps prescribers pure (stateless) and trivially testable without mocking a DB.
- **Export early, freeze constants.** `DRIFT_WEIGHTS` being a frozen exported const
  meant R5 was a verification task, not a code task. Freezing at the source prevents
  accidental mutation across package boundaries.
- **Predict + sort** is the right UX for ranked hints — callers get highest-predicted
  impact first without needing to re-sort themselves. The `predictedImpact` field
  on the hint also lets callers display the rationale.
- **Wave 1 / Wave 2 discipline.** Aaron confirmed: positive boost only for Wave 1.
  The `computeConfidenceBoost` function is intentionally neutral when vectorCount ≤ 0
  (returns 1.0) — Wave 2 can add a penalty multiplier path without changing the signature.



**Findings Fixed:** F3 (budgetContext), F6b (signal entropy consumption), F9 (buildSnapshot utility), F10 (adaptive exploration).

**Key Outputs:**
- 	uneParameters() gains optional context: TuneContext carrying per-session budget limits
- Prescribers consume profile.signals.toolEntropy for tool-guidance decision instead of composite drift
- Shared uildSnapshot() utility with unified drift classification (GREEN/YELLOW/RED)
- Adaptive exploration budget: GREEN decay (×0.9), RED grow (×1.1), YELLOW stable

**Tests:** +8 new tests → Cairn prescriber: 478 passing

**Integration:** Ready to consume Roger's per-signal means; prescribers can now target specific drivers independent of overall drift.


