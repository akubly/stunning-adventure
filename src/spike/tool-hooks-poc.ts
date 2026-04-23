/**
 * SPIKE CODE — Experimental, not for production use.
 *
 * Proof-of-concept: Tool call interception via SDK hooks.
 * Answers Q2 (Tool Call Interception) from the spike scope.
 *
 * KEY FINDINGS:
 *   1. `registerHooks()` is a real method on CopilotSession — confirmed from types
 *   2. `onPreToolUse` receives toolName + toolArgs, can return permissionDecision
 *   3. `onPostToolUse` receives toolName + toolArgs + toolResult
 *   4. Hooks can BLOCK execution via `permissionDecision: "deny"`
 *   5. Hooks fire `hook.start` and `hook.end` events in the event stream
 *   6. Multiple hook registrations: `registerHooks()` replaces (not appends)
 *      — must compose handlers manually if multiple observers needed
 *
 * NOTE: This code compiles against SDK types but requires a running Copilot
 * CLI process to execute. The value is proving the API surface and patterns.
 */

import {
  CopilotClient,
  CopilotSession,
  approveAll,
  type SessionConfig,
  type SessionEvent,
  type ToolResultObject,
} from "@github/copilot-sdk";

// These types are defined in the SDK but not re-exported from the index.
// We mirror them here for use in spike code. In production, we'd use
// SessionConfig["hooks"] and let TypeScript infer the rest.
type SessionHooks = NonNullable<SessionConfig["hooks"]>;

interface PreToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
}

interface PreToolUseHookOutput {
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  modifiedArgs?: unknown;
  additionalContext?: string;
  suppressOutput?: boolean;
}

interface PostToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
  toolResult: ToolResultObject;
}

interface PostToolUseHookOutput {
  modifiedResult?: ToolResultObject;
  additionalContext?: string;
  suppressOutput?: boolean;
}

// ---------------------------------------------------------------------------
// Q2 Answer: Tool Hook Interception — The Core Pattern
// ---------------------------------------------------------------------------

/**
 * Collected telemetry from tool hook observations.
 * This is the data shape that would flow into Cairn's event_log.
 */
interface ToolCallTelemetry {
  toolName: string;
  args: unknown;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  success?: boolean;
  result?: unknown;
  blocked: boolean;
  blockReason?: string;
}

/**
 * Demonstrates non-invasive tool call observation using SDK hooks.
 *
 * This is the simplest useful pattern: observe every tool call without
 * modifying behavior. The hooks return `{}` (empty object), which means
 * "I saw it, but don't change anything."
 */
function createObservationHooks(
  onTelemetry: (telemetry: ToolCallTelemetry) => void,
): SessionHooks {
  // Track in-flight tool calls by name (timestamps for duration calc)
  const inFlight = new Map<string, ToolCallTelemetry>();

  return {
    onPreToolUse: async (
      input: PreToolUseHookInput,
      _invocation: { sessionId: string },
    ): Promise<PreToolUseHookOutput> => {
      const telemetry: ToolCallTelemetry = {
        toolName: input.toolName,
        args: input.toolArgs,
        startedAt: input.timestamp,
        blocked: false,
      };

      // Track for duration calculation when post-hook fires
      inFlight.set(input.toolName, telemetry);

      // Return empty object = observe only, don't modify behavior
      return {};
    },

    onPostToolUse: async (
      input: PostToolUseHookInput,
      _invocation: { sessionId: string },
    ): Promise<PostToolUseHookOutput> => {
      const telemetry = inFlight.get(input.toolName);
      if (telemetry) {
        telemetry.completedAt = input.timestamp;
        telemetry.durationMs = input.timestamp - telemetry.startedAt;
        telemetry.result = input.toolResult;
        telemetry.success = true; // toolResult presence implies success
        inFlight.delete(input.toolName);
        onTelemetry(telemetry);
      }

      // Return empty object = observe only, don't modify result
      return {};
    },
  };
}

// ---------------------------------------------------------------------------
// Q2 Bonus: Hook Composition Pattern
// ---------------------------------------------------------------------------

/**
 * Since `registerHooks()` REPLACES hooks (doesn't append), we need a
 * composition pattern when multiple subsystems want to observe tool calls.
 *
 * This combiner merges multiple SessionHooks into one, calling each in order.
 * For pre-tool hooks, the LAST non-empty output wins (last-writer-wins).
 * For post-tool hooks, results are merged shallowly.
 */
function composeHooks(...hookSets: SessionHooks[]): SessionHooks {
  return {
    onPreToolUse: async (input: PreToolUseHookInput, invocation: { sessionId: string }) => {
      let merged: PreToolUseHookOutput = {};
      for (const hooks of hookSets) {
        if (hooks.onPreToolUse) {
          const result = await hooks.onPreToolUse(input, invocation);
          if (result) merged = { ...merged, ...result };
        }
      }
      return merged;
    },

    onPostToolUse: async (input: PostToolUseHookInput, invocation: { sessionId: string }) => {
      let merged: PostToolUseHookOutput = {};
      for (const hooks of hookSets) {
        if (hooks.onPostToolUse) {
          const result = await hooks.onPostToolUse(input, invocation);
          if (result) merged = { ...merged, ...result };
        }
      }
      return merged;
    },

    onSessionStart: async (input: { timestamp: number; cwd: string; source: string; initialPrompt?: string }, invocation: { sessionId: string }) => {
      for (const hooks of hookSets) {
        if (hooks.onSessionStart) {
          await hooks.onSessionStart(input as never, invocation);
        }
      }
      return {};
    },

    onSessionEnd: async (input: { timestamp: number; cwd: string; reason: string }, invocation: { sessionId: string }) => {
      for (const hooks of hookSets) {
        if (hooks.onSessionEnd) {
          await hooks.onSessionEnd(input as never, invocation);
        }
      }
      return {};
    },

    onUserPromptSubmitted: async (input: { timestamp: number; cwd: string; prompt: string }, invocation: { sessionId: string }) => {
      for (const hooks of hookSets) {
        if (hooks.onUserPromptSubmitted) {
          await hooks.onUserPromptSubmitted(input as never, invocation);
        }
      }
      return {};
    },

    onErrorOccurred: async (input: { timestamp: number; cwd: string; error: string; errorContext: string; recoverable: boolean }, invocation: { sessionId: string }) => {
      for (const hooks of hookSets) {
        if (hooks.onErrorOccurred) {
          await hooks.onErrorOccurred(input as never, invocation);
        }
      }
      return {};
    },
  };
}

// ---------------------------------------------------------------------------
// Q2 → Q3 Bridge: Decision Gate via Hooks (Blocking Pattern)
// ---------------------------------------------------------------------------

/**
 * Demonstrates that `onPreToolUse` can BLOCK tool execution by returning
 * `permissionDecision: "deny"`. This is the foundation for decision gates.
 *
 * The SDK's PreToolUseHookOutput supports three permission decisions:
 *   - "allow"  → tool executes normally
 *   - "deny"   → tool execution is blocked, error returned to LLM
 *   - "ask"    → defer to the permission handler (onPermissionRequest)
 *
 * This means we can implement decision gates WITHOUT wrapping tools —
 * the hook system natively supports blocking.
 */
function createGateHooks(
  shouldBlock: (toolName: string, args: unknown) => boolean,
  blockReason: string = "Blocked by decision gate",
): SessionHooks {
  return {
    onPreToolUse: async (
      input: PreToolUseHookInput,
    ): Promise<PreToolUseHookOutput> => {
      if (shouldBlock(input.toolName, input.toolArgs)) {
        return {
          permissionDecision: "deny",
          permissionDecisionReason: blockReason,
        };
      }
      // Allow all non-blocked tools
      return { permissionDecision: "allow" };
    },
  };
}

// ---------------------------------------------------------------------------
// Demo: Full hook lifecycle with event stream correlation
// ---------------------------------------------------------------------------

/**
 * Wires up hooks and event listeners to show the complete lifecycle:
 *
 *   1. tool.execution_start event fires
 *   2. hook.start event fires (type: "preToolUse")
 *   3. onPreToolUse hook executes (our code)
 *   4. hook.end event fires
 *   5. [tool executes or is blocked]
 *   6. hook.start event fires (type: "postToolUse")
 *   7. onPostToolUse hook executes (our code)
 *   8. hook.end event fires
 *   9. tool.execution_complete event fires
 *
 * The hook.start/hook.end events include a `hookInvocationId` for correlation.
 */
async function toolHookLifecycleDemo(): Promise<void> {
  const client = new CopilotClient({ logLevel: "info" });

  const telemetryLog: ToolCallTelemetry[] = [];
  const hookEvents: Array<{ type: string; hookType?: string; timestamp: string }> = [];

  // Create observation hooks
  const observerHooks = createObservationHooks((telemetry) => {
    telemetryLog.push(telemetry);
    console.log(`[telemetry] ${telemetry.toolName}: ${telemetry.durationMs}ms`);
  });

  // Create a gate that blocks "dangerous" tools
  const gateHooks = createGateHooks(
    (toolName) => toolName === "powershell" || toolName === "bash",
    "Shell commands require explicit approval",
  );

  // Compose both hook sets — observer + gate
  const composedHooks = composeHooks(observerHooks, gateHooks);

  const session = await client.createSession({
    model: "gpt-4",
    onPermissionRequest: approveAll,
    hooks: composedHooks,
  });

  // Subscribe to hook lifecycle events in the event stream
  session.on("hook.start", (event: SessionEvent) => {
    const data = event.data as { hookType: string; hookInvocationId: string };
    hookEvents.push({
      type: "hook.start",
      hookType: data.hookType,
      timestamp: event.timestamp,
    });
    console.log(`[event] hook.start: ${data.hookType} (${data.hookInvocationId})`);
  });

  session.on("hook.end", (event: SessionEvent) => {
    const data = event.data as { hookType: string; hookInvocationId: string; success: boolean };
    hookEvents.push({
      type: "hook.end",
      hookType: data.hookType,
      timestamp: event.timestamp,
    });
    console.log(`[event] hook.end: ${data.hookType} success=${data.success}`);
  });

  // Subscribe to tool events for correlation
  session.on("tool.execution_start", (event) => {
    console.log(`[event] tool.start: ${event.data.toolName}`);
  });
  session.on("tool.execution_complete", (event) => {
    console.log(`[event] tool.complete: ${event.data.toolCallId} success=${event.data.success}`);
  });

  // Send a prompt that will trigger tool use
  await session.sendAndWait({ prompt: "List the files in the current directory" }, 30_000);

  // Report
  console.log("\n--- Tool Telemetry ---");
  for (const t of telemetryLog) {
    console.log(`  ${t.toolName}: ${t.durationMs}ms, blocked=${t.blocked}`);
  }
  console.log("\n--- Hook Events ---");
  for (const e of hookEvents) {
    console.log(`  ${e.type}: ${e.hookType} @ ${e.timestamp}`);
  }

  await session.disconnect();
  await client.stop();
}

// ---------------------------------------------------------------------------
// Demo: Dynamic hook registration via registerHooks()
// ---------------------------------------------------------------------------

/**
 * Shows that hooks can be registered AFTER session creation using
 * `session.registerHooks()`. This is important for:
 *   - Adding instrumentation to sessions created by other code
 *   - Swapping hook sets at runtime (e.g., entering/leaving a gate zone)
 *   - Testing hook behavior without recreating sessions
 *
 * CAVEAT: registerHooks() REPLACES all hooks. To add without losing
 * existing hooks, use the composeHooks() pattern above.
 */
async function dynamicHookRegistrationDemo(): Promise<void> {
  const client = new CopilotClient();
  const session = await client.createSession({
    model: "gpt-4",
    onPermissionRequest: approveAll,
    // No hooks initially
  });

  console.log("Phase 1: No hooks — tools run freely");

  // Phase 2: Add observation hooks dynamically
  const observations: string[] = [];
  session.registerHooks({
    onPreToolUse: async (input) => {
      observations.push(`pre: ${input.toolName}`);
      return {};
    },
    onPostToolUse: async (input) => {
      observations.push(`post: ${input.toolName}`);
      return {};
    },
  });
  console.log("Phase 2: Observation hooks registered");

  // Phase 3: Replace with blocking hooks
  session.registerHooks(
    createGateHooks(() => true, "All tools blocked for safety"),
  );
  console.log("Phase 3: All tools now blocked");

  // Phase 4: Remove all hooks
  session.registerHooks(undefined);
  console.log("Phase 4: Hooks cleared — back to default behavior");

  console.log("Observations:", observations);

  await session.disconnect();
  await client.stop();
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  createObservationHooks,
  createGateHooks,
  composeHooks,
  toolHookLifecycleDemo,
  dynamicHookRegistrationDemo,
  type ToolCallTelemetry,
};
