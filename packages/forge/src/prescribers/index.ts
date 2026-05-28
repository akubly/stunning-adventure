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

export {
  runForgePrescribers,
  type ForgePrescriberOrchestratorOptions,
} from "./forgePrescriberOrchestrator.js";

export type {
  ChangeVectorSummary,
  MetricSnapshot,
  OptimizationCategory,
  OptimizationEvidence,
  OptimizationHint,
  PrescriberConfig,
  PrescriberResult,
} from "./types.js";

export { buildSnapshot } from "./utils.js";
