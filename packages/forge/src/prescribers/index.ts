/**
 * Prescribers — analyse execution profiles, emit optimization hints.
 */

export {
  analyzePromptOptimizations,
  type PromptOptimizerConfig,
} from "./promptOptimizer.js";

export {
  analyzeTokenOptimizations,
  type TokenOptimizerConfig,
} from "./tokenOptimizer.js";

export type {
  MetricSnapshot,
  OptimizationCategory,
  OptimizationEvidence,
  OptimizationHint,
  PrescriberResult,
} from "./types.js";
