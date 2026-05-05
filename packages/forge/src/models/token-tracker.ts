/**
 * Token Budget Tracker — Accumulates per-model usage and context window metrics.
 *
 * Subscribes to `assistant.usage` and `session.usage_info` events via the
 * EventSource interface (ADR-P3-002), not direct CopilotSession coupling.
 *
 * Promoted from spike: `packages/cairn/src/spike/model-selection-poc.ts`
 *
 * @module
 */

import type { EventSource } from "../bridge/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Accumulated token usage for a single model. */
export interface ModelUsageAccumulator {
  callCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  totalNanoAiu: number;
  totalDurationMs: number;
}

/** Full token budget state for a session. */
export interface TokenBudget {
  readonly sessionId: string;
  readonly modelUsage: Map<string, ModelUsageAccumulator>;
  readonly contextWindow: {
    tokenLimit?: number;
    peakTokens: number;
    lastTokens: number;
  };
}

/** Token tracker handle with budget access and cleanup. */
export interface TokenTracker {
  readonly budget: TokenBudget;
  unsubscribe(): void;
}

/** Internal mutable context window state. */
interface MutableContextWindow {
  tokenLimit?: number;
  peakTokens: number;
  lastTokens: number;
}

// ---------------------------------------------------------------------------
// createTokenTracker — factory function
// ---------------------------------------------------------------------------

/**
 * Create a token tracker that subscribes to assistant.usage and
 * session.usage_info events from the given source.
 */
export function createTokenTracker(
  source: EventSource,
  sessionId: string,
): TokenTracker {
  const contextWindow: MutableContextWindow = { peakTokens: 0, lastTokens: 0 };

  const budget: TokenBudget = {
    sessionId,
    modelUsage: new Map(),
    contextWindow,
  };

  // Single subscription handles both event types
  const unsub = source.on((event) => {
    if (event.type === "assistant.usage") {
      const d = event.data as {
        model?: string;
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        duration?: number;
        copilotUsage?: { totalNanoAiu?: number };
      };

      const model = d.model ?? "unknown";
      const existing = budget.modelUsage.get(model) ?? {
        callCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
        totalNanoAiu: 0,
        totalDurationMs: 0,
      };

      existing.callCount++;
      existing.totalInputTokens += d.inputTokens ?? 0;
      existing.totalOutputTokens += d.outputTokens ?? 0;
      existing.totalCacheReadTokens += d.cacheReadTokens ?? 0;
      existing.totalCacheWriteTokens += d.cacheWriteTokens ?? 0;
      existing.totalNanoAiu += d.copilotUsage?.totalNanoAiu ?? 0;
      existing.totalDurationMs += d.duration ?? 0;

      budget.modelUsage.set(model, existing);
    } else if (event.type === "session.usage_info") {
      const d = event.data as {
        tokenLimit?: number;
        currentTokens?: number;
      };

      if (d.tokenLimit) {
        contextWindow.tokenLimit = d.tokenLimit;
      }
      const current = d.currentTokens ?? 0;
      contextWindow.lastTokens = current;
      if (current > contextWindow.peakTokens) {
        contextWindow.peakTokens = current;
      }
    }
  });

  return {
    budget,
    unsubscribe(): void {
      unsub();
    },
  };
}

// ---------------------------------------------------------------------------
// formatBudgetReport — human-readable output
// ---------------------------------------------------------------------------

/** Format a human-readable budget report string. */
export function formatBudgetReport(budget: TokenBudget): string {
  const lines: string[] = ["=== Token Budget Report ==="];

  lines.push(`Session: ${budget.sessionId}`);
  lines.push("");

  for (const [model, usage] of budget.modelUsage.entries()) {
    lines.push(`Model: ${model}`);
    lines.push(`  Calls: ${usage.callCount}`);
    lines.push(`  Input tokens: ${usage.totalInputTokens.toLocaleString()}`);
    lines.push(`  Output tokens: ${usage.totalOutputTokens.toLocaleString()}`);
    lines.push(`  Cache read: ${usage.totalCacheReadTokens.toLocaleString()}`);
    lines.push(`  Cache write: ${usage.totalCacheWriteTokens.toLocaleString()}`);
    lines.push(`  Total nano-AIU: ${usage.totalNanoAiu.toLocaleString()}`);
    lines.push(`  Total duration: ${usage.totalDurationMs.toLocaleString()}ms`);
    lines.push("");
  }

  lines.push("Context Window:");
  if (budget.contextWindow.tokenLimit) {
    lines.push(`  Limit: ${budget.contextWindow.tokenLimit.toLocaleString()} tokens`);
    const utilization =
      (budget.contextWindow.peakTokens / budget.contextWindow.tokenLimit) * 100;
    lines.push(`  Peak utilization: ${utilization.toFixed(1)}%`);
  }
  lines.push(`  Peak tokens: ${budget.contextWindow.peakTokens.toLocaleString()}`);
  lines.push(`  Current tokens: ${budget.contextWindow.lastTokens.toLocaleString()}`);

  return lines.join("\n");
}
