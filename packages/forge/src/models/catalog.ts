/**
 * Model Catalog — Listing, querying, and comparing available models.
 *
 * Uses injection (ADR-P3-003): takes a `listFn` instead of holding a
 * ForgeClient reference. Testable without an SDK instance.
 *
 * Promoted from spike: `packages/cairn/src/spike/model-selection-poc.ts`
 *
 * @module
 */

import type { ModelSnapshot } from "../session/index.js";
import type { ModelStrategy, StrategyContext } from "./strategy.js";

// ---------------------------------------------------------------------------
// ModelComparison — side-by-side model comparison result
// ---------------------------------------------------------------------------

export interface ModelComparison {
  modelA: ModelSnapshot;
  modelB: ModelSnapshot;
  contextWindowDelta: number;
  billingDelta: number;
  capabilityDiff: {
    vision: [boolean, boolean];
    reasoning: [boolean, boolean];
  };
}

// ---------------------------------------------------------------------------
// ModelCatalog interface
// ---------------------------------------------------------------------------

export interface ModelCatalog {
  /** All available models, cached from last refresh() call. */
  readonly models: readonly ModelSnapshot[];

  /** Number of models in the catalog. */
  readonly size: number;

  /** Refresh the catalog by calling the injected listFn. */
  refresh(): Promise<void>;

  /** Find a model by ID. Returns undefined if not in catalog. */
  get(modelId: string): ModelSnapshot | undefined;

  /** Filter models by capability predicate. */
  filter(predicate: (m: ModelSnapshot) => boolean): ModelSnapshot[];

  /** Compare two models side-by-side. Returns null if either ID is not found. */
  compare(a: string, b: string): ModelComparison | null;

  /** Select a model using a strategy function. */
  selectByStrategy(strategy: ModelStrategy, context: StrategyContext): ModelSnapshot | null;
}

// ---------------------------------------------------------------------------
// createModelCatalog — factory function
// ---------------------------------------------------------------------------

/**
 * Create a ModelCatalog backed by the given list function.
 * The listFn is called on each `refresh()` to fetch available models.
 */
export function createModelCatalog(
  listFn: () => Promise<ModelSnapshot[]>,
): ModelCatalog {
  let snapshots: ModelSnapshot[] = [];

  return {
    get models(): readonly ModelSnapshot[] {
      return snapshots;
    },

    get size(): number {
      return snapshots.length;
    },

    async refresh(): Promise<void> {
      snapshots = await listFn();
    },

    get(modelId: string): ModelSnapshot | undefined {
      return snapshots.find((m) => m.id === modelId);
    },

    filter(predicate: (m: ModelSnapshot) => boolean): ModelSnapshot[] {
      return snapshots.filter(predicate);
    },

    compare(a: string, b: string): ModelComparison | null {
      const modelA = snapshots.find((m) => m.id === a);
      const modelB = snapshots.find((m) => m.id === b);
      if (!modelA || !modelB) return null;

      return {
        modelA,
        modelB,
        contextWindowDelta: modelA.contextWindow - modelB.contextWindow,
        billingDelta: (modelA.billingMultiplier ?? 1) - (modelB.billingMultiplier ?? 1),
        capabilityDiff: {
          vision: [modelA.supportsVision, modelB.supportsVision],
          reasoning: [modelA.supportsReasoning, modelB.supportsReasoning],
        },
      };
    },

    selectByStrategy(
      strategy: ModelStrategy,
      context: StrategyContext,
    ): ModelSnapshot | null {
      return strategy(snapshots, context);
    },
  };
}
