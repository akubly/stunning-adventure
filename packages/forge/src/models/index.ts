/**
 * Models module — Model catalog, token tracking, and selection strategies.
 *
 * @module
 */

// --- Catalog ---
export {
  createModelCatalog,
  type ModelCatalog,
  type ModelComparison,
} from "./catalog.js";

// --- Token Tracker ---
export {
  createTokenTracker,
  formatBudgetReport,
  type ModelUsageAccumulator,
  type TokenBudget,
  type TokenTracker,
} from "./token-tracker.js";

// --- Strategies ---
export {
  MODEL_STRATEGIES,
  type ModelStrategy,
  type StrategyContext,
} from "./strategy.js";
