/**
 * Applier — turn optimization hints into SKILL.md v2 patches and tune
 * strategy parameters from execution profiles.
 */

export {
  applyOptimizations,
  type ApplierConfig,
  type AppliedOptimization,
  type OptimizationApplierResult,
  type SkillFrontmatterPatch,
} from "./optimizer.js";

export {
  DEFAULT_STRATEGY_PARAMS,
  DEFAULT_BUDGET_LIMIT_NANO_AIU,
  tuneParameters,
  type StrategyParameters,
  type TuneContext,
} from "./selfTuning.js";
