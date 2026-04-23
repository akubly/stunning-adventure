/**
 * SPIKE CODE — Experimental, not for production use.
 *
 * Proof-of-concept: Model selection and token budgeting via SDK.
 * Answers Q7 (Model Selection & Token Budgeting) from the spike scope.
 *
 * KEY FINDINGS:
 *   1. `session.setModel(model, options?)` changes model mid-session — async, awaitable
 *   2. `client.listModels()` returns `ModelInfo[]` with capabilities, billing, policy
 *   3. `session.model_change` event fires on model switch with previousModel/newModel
 *   4. `assistant.usage` events carry model, tokens, cost, cache metrics per LLM call
 *   5. `session.usage_info` events give context window utilization snapshot
 *   6. Token budget CONFIG is per-model via ModelCapabilities.limits — no runtime setter
 *   7. `setModel` accepts optional `{ reasoningEffort }` for models that support it
 *
 * NOTE: This code compiles against SDK types but requires a running Copilot
 * CLI process to execute.
 */

import {
  CopilotClient,
  CopilotSession,
  approveAll,
  type ModelInfo,
  type ModelCapabilities,
  type ModelBilling,
  type SessionEvent,
} from "@github/copilot-sdk";

// ReasoningEffort is defined in the SDK but not re-exported from index
type ReasoningEffort = "low" | "medium" | "high" | "xhigh";

// ---------------------------------------------------------------------------
// Q7: Model Selection — Listing, switching, event tracking
// ---------------------------------------------------------------------------

/**
 * Model selection data extracted from the SDK's ModelInfo type.
 * This is the shape we'd store in Cairn for model comparison and costing.
 */
interface ModelSnapshot {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsVision: boolean;
  supportsReasoning: boolean;
  billingMultiplier?: number;
  policyState?: string;
  supportedReasoningEfforts?: ReasoningEffort[];
  defaultReasoningEffort?: ReasoningEffort;
}

/**
 * Extract a ModelSnapshot from the SDK's ModelInfo.
 * Strips internal fields, keeps what Cairn needs for analytics.
 */
function toModelSnapshot(info: ModelInfo): ModelSnapshot {
  return {
    id: info.id,
    name: info.name,
    contextWindow: info.capabilities.limits.max_context_window_tokens,
    maxOutputTokens: info.capabilities.limits.max_prompt_tokens,
    supportsVision: info.capabilities.supports.vision,
    supportsReasoning: info.capabilities.supports.reasoningEffort,
    billingMultiplier: info.billing?.multiplier,
    policyState: info.policy?.state,
    supportedReasoningEfforts: info.supportedReasoningEfforts,
    defaultReasoningEffort: info.defaultReasoningEffort,
  };
}

/**
 * Demonstrates listing available models and inspecting their capabilities.
 * This is the foundation for intelligent model selection.
 */
async function listModelsDemo(client: CopilotClient): Promise<ModelSnapshot[]> {
  const models = await client.listModels();
  const snapshots = models.map(toModelSnapshot);

  console.log("--- Available Models ---");
  for (const m of snapshots) {
    console.log(`  ${m.id} (${m.name})`);
    console.log(`    Context window: ${m.contextWindow} tokens`);
    console.log(`    Vision: ${m.supportsVision}, Reasoning: ${m.supportsReasoning}`);
    console.log(`    Billing multiplier: ${m.billingMultiplier ?? "n/a"}`);
    console.log(`    Policy: ${m.policyState ?? "n/a"}`);
    if (m.supportedReasoningEfforts?.length) {
      console.log(`    Reasoning efforts: ${m.supportedReasoningEfforts.join(", ")}`);
    }
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Q7: Mid-Session Model Switching
// ---------------------------------------------------------------------------

/**
 * Tracked model change event data — what the event stream gives us.
 */
interface ModelChangeEvent {
  timestamp: string;
  previousModel?: string;
  newModel: string;
  previousReasoningEffort?: string;
  reasoningEffort?: string;
}

/**
 * Demonstrates switching models mid-session and capturing the events.
 *
 * Key insight: `setModel()` is async and fires a `session.model_change` event.
 * The event includes both the previous and new model, so we can track
 * model switching patterns without maintaining state ourselves.
 */
async function modelSwitchingDemo(): Promise<void> {
  const client = new CopilotClient();
  const modelChanges: ModelChangeEvent[] = [];

  const session = await client.createSession({
    model: "gpt-4",
    onPermissionRequest: approveAll,
  });

  // Subscribe to model change events
  session.on("session.model_change", (event: SessionEvent) => {
    const data = event.data as {
      previousModel?: string;
      newModel: string;
      previousReasoningEffort?: string;
      reasoningEffort?: string;
    };
    modelChanges.push({
      timestamp: event.timestamp,
      ...data,
    });
    console.log(`[model_change] ${data.previousModel ?? "none"} → ${data.newModel}`);
  });

  // Switch models with different reasoning efforts
  await session.setModel("claude-sonnet-4.6", { reasoningEffort: "high" });
  console.log("Switched to claude-sonnet-4.6 with high reasoning");

  await session.setModel("gpt-4.1");
  console.log("Switched to gpt-4.1 with default reasoning");

  // Report
  console.log("\n--- Model Changes ---");
  for (const change of modelChanges) {
    console.log(`  ${change.previousModel ?? "initial"} → ${change.newModel}`);
    if (change.reasoningEffort) {
      console.log(`    Reasoning: ${change.previousReasoningEffort ?? "default"} → ${change.reasoningEffort}`);
    }
  }

  await session.disconnect();
  await client.stop();
}

// ---------------------------------------------------------------------------
// Q7: Token Budget Tracking
// ---------------------------------------------------------------------------

/**
 * Token usage accumulator — tracks cumulative token spend across a session.
 * This is the data Cairn would materialize into a `cost_summary` table.
 */
interface TokenBudget {
  sessionId: string;
  modelUsage: Map<
    string,
    {
      callCount: number;
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCacheReadTokens: number;
      totalCacheWriteTokens: number;
      totalNanoAiu: number;
      totalDurationMs: number;
    }
  >;
  contextWindow: {
    tokenLimit?: number;
    peakTokens: number;
    lastTokens: number;
  };
}

/**
 * Creates a token budget tracker that subscribes to the relevant events.
 * Returns the tracker and an unsubscribe function.
 *
 * Two event types feed the tracker:
 *   1. `assistant.usage` — per-LLM-call token and cost data
 *   2. `session.usage_info` — context window utilization snapshots
 */
function createTokenTracker(
  session: CopilotSession,
  sessionId: string,
): { budget: TokenBudget; unsubscribe: () => void } {
  const budget: TokenBudget = {
    sessionId,
    modelUsage: new Map(),
    contextWindow: { peakTokens: 0, lastTokens: 0 },
  };

  const unsubUsage = session.on("assistant.usage", (event: SessionEvent) => {
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
  });

  const unsubContext = session.on("session.usage_info", (event: SessionEvent) => {
    const d = event.data as {
      tokenLimit?: number;
      currentTokens?: number;
    };

    if (d.tokenLimit) budget.contextWindow.tokenLimit = d.tokenLimit;
    const current = d.currentTokens ?? 0;
    budget.contextWindow.lastTokens = current;
    if (current > budget.contextWindow.peakTokens) {
      budget.contextWindow.peakTokens = current;
    }
  });

  return {
    budget,
    unsubscribe: () => {
      unsubUsage();
      unsubContext();
    },
  };
}

/**
 * Generates a human-readable budget report.
 */
function formatBudgetReport(budget: TokenBudget): string {
  const lines: string[] = ["=== Token Budget Report ==="];

  lines.push(`Session: ${budget.sessionId}`);
  lines.push("");

  // Per-model breakdown
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

  // Context window
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

// ---------------------------------------------------------------------------
// Model Selection Strategy — Intelligent model routing
// ---------------------------------------------------------------------------

/**
 * A model selection strategy that chooses the best model for a task.
 *
 * In Forge, this would be a workflow-configurable strategy:
 *   - "cheapest" → lowest billing multiplier
 *   - "fastest" → lowest context window (correlates with speed)
 *   - "smartest" → highest capability (reasoning + vision)
 *   - "budget-aware" → switch to cheaper model when nearing budget limit
 */
type ModelStrategy = (
  models: ModelSnapshot[],
  context: { currentBudgetNanoAiu: number; budgetLimitNanoAiu: number },
) => ModelSnapshot | null;

const MODEL_STRATEGIES: Record<string, ModelStrategy> = {
  cheapest: (models) => {
    const enabled = models.filter((m) => m.policyState !== "disabled");
    return enabled.sort((a, b) => (a.billingMultiplier ?? 1) - (b.billingMultiplier ?? 1))[0] ?? null;
  },

  smartest: (models) => {
    const enabled = models.filter((m) => m.policyState !== "disabled");
    // Prefer reasoning-capable models, then largest context window
    return enabled.sort((a, b) => {
      if (a.supportsReasoning !== b.supportsReasoning) {
        return b.supportsReasoning ? 1 : -1;
      }
      return b.contextWindow - a.contextWindow;
    })[0] ?? null;
  },

  budgetAware: (models, context) => {
    const budgetUsed = context.currentBudgetNanoAiu / context.budgetLimitNanoAiu;
    const enabled = models.filter((m) => m.policyState !== "disabled");

    if (budgetUsed > 0.8) {
      // >80% budget used → switch to cheapest model
      return enabled.sort((a, b) =>
        (a.billingMultiplier ?? 1) - (b.billingMultiplier ?? 1),
      )[0] ?? null;
    }
    // Under budget → use the smartest model
    return MODEL_STRATEGIES.smartest(models, context);
  },
};

// ---------------------------------------------------------------------------
// Demo: Full model selection + token tracking flow
// ---------------------------------------------------------------------------

async function modelSelectionDemo(): Promise<void> {
  const client = new CopilotClient();

  // Step 1: List available models
  const snapshots = await listModelsDemo(client);

  // Step 2: Create session with token tracking
  const session = await client.createSession({
    model: snapshots[0]?.id ?? "gpt-4",
    onPermissionRequest: approveAll,
  });

  const { budget, unsubscribe } = createTokenTracker(session, session.sessionId);

  // Step 3: Use the session
  await session.sendAndWait({ prompt: "What is 2+2?" }, 30_000);

  // Step 4: Apply a model strategy based on budget
  const cheapest = MODEL_STRATEGIES.cheapest(snapshots, {
    currentBudgetNanoAiu: 0,
    budgetLimitNanoAiu: 1_000_000,
  });
  if (cheapest && cheapest.id !== snapshots[0]?.id) {
    await session.setModel(cheapest.id);
    console.log(`Switched to cheapest model: ${cheapest.id}`);
  }

  // Step 5: Report budget
  unsubscribe();
  console.log("\n" + formatBudgetReport(budget));

  await session.disconnect();
  await client.stop();
}

// ---------------------------------------------------------------------------
// Cairn Event Bridge: Model events
// ---------------------------------------------------------------------------

/**
 * Maps model-related SDK events to Cairn event_log payloads.
 * These supplement the generic event bridge from Day 1.
 */
function bridgeModelChangeEvent(
  cairnSessionId: string,
  event: SessionEvent & { type: "session.model_change" },
): {
  session_id: string;
  event_type: string;
  payload: string;
  created_at: string;
} {
  const data = event.data as {
    previousModel?: string;
    newModel: string;
    previousReasoningEffort?: string;
    reasoningEffort?: string;
  };

  return {
    session_id: cairnSessionId,
    event_type: "model_change",
    payload: JSON.stringify({
      previousModel: data.previousModel,
      newModel: data.newModel,
      previousReasoningEffort: data.previousReasoningEffort,
      reasoningEffort: data.reasoningEffort,
    }),
    created_at: event.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  listModelsDemo,
  modelSwitchingDemo,
  modelSelectionDemo,
  createTokenTracker,
  formatBudgetReport,
  bridgeModelChangeEvent,
  toModelSnapshot,
  MODEL_STRATEGIES,
  type ModelSnapshot,
  type ModelChangeEvent,
  type TokenBudget,
  type ModelStrategy,
};
