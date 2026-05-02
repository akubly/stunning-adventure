/**
 * Self-tuning strategy parameters.
 *
 * Conservative: parameters drift toward observed optima with ±10% dampening
 * per cycle to prevent oscillation. Exploration budget is floored per Aaron's
 * directive — "diminishing returns worth it when scaled across future of
 * software engineering."
 */

import { classifyDriftLevel } from "../telemetry/drift.js";
import type { ExecutionProfile } from "../telemetry/types.js";

export interface StrategyParameters {
  /** Token budget threshold before triggering model downgrade (0–1). */
  budgetThreshold: number;
  /** Context pressure limit before triggering context pruning (0–1). */
  contextPressureLimit: number;
  /** Maximum model switches per session. */
  maxModelSwitches: number;
  /** Exploration budget — willingness to try suboptimal paths (0–1). */
  explorationBudget: number;
}

/**
 * Tuning context — runtime knobs that the tuner needs but that don't belong
 * on the profile itself. Today this is just the per-session budget limit
 * (in nanoAIU), shared with the model-selection {@link
 * import("../models/strategy.js").StrategyContext} so a single budget number
 * drives both routing and self-tuning.
 */
export interface TuneContext {
  /** Per-session budget in nanoAIU (matches `StrategyContext.budgetLimitNanoAiu`). */
  budgetLimitNanoAiu: number;
}

/**
 * Default per-session budget used when no explicit context is supplied.
 * Mirrors the value used in the model-selection PoC and tests
 * (`packages/cairn/src/spike/model-selection-poc.ts`).
 */
export const DEFAULT_BUDGET_LIMIT_NANO_AIU = 1_000_000;

/** Conservative defaults. */
export const DEFAULT_STRATEGY_PARAMS: Readonly<StrategyParameters> = Object.freeze({
  budgetThreshold: 0.8,
  contextPressureLimit: 0.7,
  maxModelSwitches: 3,
  explorationBudget: 0.2,
});

const DAMPENING = 0.1;
const EXPLORATION_FLOOR = 0.15;
const EXPLORATION_CEILING = 1.0;
const EXPLORATION_DECAY = 0.9;
const EXPLORATION_GROWTH = 1.1;

export function tuneParameters(
  current: StrategyParameters,
  profile: ExecutionProfile,
  context: TuneContext = { budgetLimitNanoAiu: DEFAULT_BUDGET_LIMIT_NANO_AIU },
): StrategyParameters {
  // Token pressure is normalized against the per-session budget so it lives
  // in the same [0, 1] space as `budgetThreshold`. Without normalization the
  // raw cost-per-session hovers around 1e-4 of any reasonable threshold and
  // the budget knob only ever relaxes (F3).
  const budgetLimit =
    context.budgetLimitNanoAiu > 0
      ? context.budgetLimitNanoAiu
      : DEFAULT_BUDGET_LIMIT_NANO_AIU;
  const costPerSession =
    profile.sessionCount > 0
      ? profile.tokens.totalCostNanoAiu / profile.sessionCount
      : 0;
  const tokenPressure = clamp(costPerSession / budgetLimit, 0, 1);

  const budgetDelta = tokenPressure > current.budgetThreshold
    ? -DAMPENING
    : tokenPressure < current.budgetThreshold * 0.5
      ? DAMPENING * 0.5
      : 0;

  const contextDelta = profile.drift.mean > 0.2
    ? -DAMPENING
    : profile.drift.mean < 0.05
      ? DAMPENING * 0.5
      : 0;

  const switchDelta = profile.outcomes.successRate < 0.7
    ? -1
    : profile.outcomes.successRate > 0.95
      ? 1
      : 0;

  // Adaptive exploration (F10): when drift is GREEN we have evidence the
  // current playbook is working, so decay exploration toward the floor;
  // when RED we need to widen the search. YELLOW = hold steady. The hard
  // floor protects Aaron's "exploration is worth it at scale" directive.
  const driftLevel = classifyDriftLevel(profile.drift.mean);
  const explorationScale =
    driftLevel === "GREEN"
      ? EXPLORATION_DECAY
      : driftLevel === "RED"
        ? EXPLORATION_GROWTH
        : 1;
  const explorationBudget = clamp(
    current.explorationBudget * explorationScale,
    EXPLORATION_FLOOR,
    EXPLORATION_CEILING,
  );

  return {
    budgetThreshold: clamp(current.budgetThreshold + budgetDelta, 0.5, 0.95),
    contextPressureLimit: clamp(current.contextPressureLimit + contextDelta, 0.4, 0.9),
    maxModelSwitches: clamp(current.maxModelSwitches + switchDelta, 1, 10),
    explorationBudget,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
