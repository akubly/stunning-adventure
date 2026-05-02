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

**Coordination notes:**
- Roger had already added `ProfileSignals` and `signals?: ProfileSignals` to `ExecutionProfile` in `packages/types/src/index.ts` — no schema collision; my code consumes his contract.
- Pre-existing build state: `packages/forge/src/telemetry/collectors.ts` is missing on disk (referenced by `telemetry/index.ts` and two test files). 15 of 529 tests fail because of this; all failures are in `telemetry-collectors.test.ts` and `feedback-loop.test.ts` and are unrelated to this fix-set. Flagged for whoever owns collectors implementation.

**Verification:** `npx vitest run src/__tests__/prescribers-applier.test.ts` → 36/36 green. Full suite: 514/529 (only the pre-existing collectors-related failures remain).


## 2026-05-02: Phase 4.5 Persona Review — Prescribers + Applier Integration

**Findings Fixed:** F3 (budgetContext), F6b (signal entropy consumption), F9 (buildSnapshot utility), F10 (adaptive exploration).

**Key Outputs:**
- 	uneParameters() gains optional context: TuneContext carrying per-session budget limits
- Prescribers consume profile.signals.toolEntropy for tool-guidance decision instead of composite drift
- Shared uildSnapshot() utility with unified drift classification (GREEN/YELLOW/RED)
- Adaptive exploration budget: GREEN decay (×0.9), RED grow (×1.1), YELLOW stable

**Tests:** +8 new tests → Cairn prescriber: 478 passing

**Integration:** Ready to consume Roger's per-signal means; prescribers can now target specific drivers independent of overall drift.


