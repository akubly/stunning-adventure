/**
 * Model Selection Strategies — Plain functions for intelligent model routing.
 *
 * Strategies are plain functions (ADR-P3-006), not a class hierarchy.
 * The ModelStrategy type is the extension point — consumers can register
 * custom strategies without modifying Forge.
 *
 * Promoted from spike: `packages/cairn/src/spike/model-selection-poc.ts`
 *
 * @module
 */

import type { ModelSnapshot } from "../session/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Context passed to strategy functions for budget-aware decisions. */
export interface StrategyContext {
  currentBudgetNanoAiu: number;
  budgetLimitNanoAiu: number;
}

/**
 * A model selection strategy function.
 * Takes available models and budget context, returns the best match or null.
 */
export type ModelStrategy = (
  models: ModelSnapshot[],
  context: StrategyContext,
) => ModelSnapshot | null;

// ---------------------------------------------------------------------------
// Built-in strategies
// ---------------------------------------------------------------------------

/** Select the model with the lowest billing multiplier. */
const cheapest: ModelStrategy = (models) => {
  const enabled = models.filter((m) => m.policyState !== "disabled");
  return (
    enabled.sort(
      (a, b) => (a.billingMultiplier ?? 1) - (b.billingMultiplier ?? 1),
    )[0] ?? null
  );
};

/** Select the most capable model (reasoning first, then context window). */
const smartest: ModelStrategy = (models) => {
  const enabled = models.filter((m) => m.policyState !== "disabled");
  return (
    enabled.sort((a, b) => {
      if (a.supportsReasoning !== b.supportsReasoning) {
        return b.supportsReasoning ? 1 : -1;
      }
      return b.contextWindow - a.contextWindow;
    })[0] ?? null
  );
};

/** Use smartest when under 80% budget, cheapest when over. */
const budgetAware: ModelStrategy = (models, context) => {
  if (context.budgetLimitNanoAiu <= 0) return cheapest(models, context);
  const budgetUsed = context.currentBudgetNanoAiu / context.budgetLimitNanoAiu;
  if (budgetUsed > 0.8) {
    return cheapest(models, context);
  }
  return smartest(models, context);
};

// ---------------------------------------------------------------------------
// Exported strategy record
// ---------------------------------------------------------------------------

/** Built-in model selection strategies. */
export const MODEL_STRATEGIES: Readonly<Record<string, ModelStrategy>> =
  Object.freeze({
    cheapest,
    smartest,
    budgetAware,
  });
