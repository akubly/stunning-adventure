/**
 * Decision Gates — Hook observers that gate and record tool-call decisions.
 *
 * Two complementary patterns:
 *   1. **Active gating** (`createDecisionGate`) — evaluates a predicate for
 *      each tool call and returns `permissionDecision: "ask"` to trigger the
 *      SDK's native permission flow when the predicate matches.
 *   2. **Passive recording** (`createDecisionRecorder`) — observes pre/post
 *      tool hooks to build a decision audit trail without altering control flow.
 *
 * Both return a `HookObserver` that plugs directly into the hook composer.
 *
 * Error isolation: decision recording failures are caught and logged — they
 * must never kill tool execution. This matches the hook composer's isolation
 * contract.
 *
 * Phase 2 boundary: no CopilotClient or CopilotSession dependencies. These
 * are pure factories that produce hook observers.
 *
 * @module
 */

import type { DecisionRecord, DecisionSource } from "@akubly/types";
import type { HookObserver } from "../hooks/index.js";
import type {
  PreToolUseInput,
  PreToolUseOutput,
  PostToolUseInput,
  HookInvocation,
} from "../types.js";

// ---------------------------------------------------------------------------
// makeDecisionRecord — construct well-formed DecisionRecord objects
// ---------------------------------------------------------------------------

/**
 * Construct a well-formed `DecisionRecord` with generated ID and timestamp.
 * Callers provide the semantic fields; this helper fills structural boilerplate.
 */
export function makeDecisionRecord(
  fields: Omit<DecisionRecord, "id" | "timestamp"> & {
    id?: string;
    timestamp?: string;
  },
): DecisionRecord {
  return {
    id:
      fields.id ??
      `dec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: fields.timestamp ?? new Date().toISOString(),
    question: fields.question,
    chosenOption: fields.chosenOption,
    alternatives: fields.alternatives,
    evidence: fields.evidence,
    confidence: fields.confidence,
    source: fields.source,
    toolName: fields.toolName,
    toolArgs: fields.toolArgs,
    provenanceTier: fields.provenanceTier,
  };
}

// ---------------------------------------------------------------------------
// createDecisionGate — active gating via hook observer
// ---------------------------------------------------------------------------

/**
 * Factory that returns a `HookObserver` for actively gating tool calls.
 *
 * When `shouldGate` returns true for a tool call, the observer:
 *   1. Records a `DecisionRecord` via the `onDecision` callback
 *   2. Returns `{ permissionDecision: "ask" }` to trigger the SDK's
 *      native permission handler flow
 *
 * When `shouldGate` returns false, the observer is a no-op (pass-through).
 *
 * @param shouldGate  Predicate — return true for tools that need gating
 * @param onDecision  Callback to persist/emit the decision record
 */
export function createDecisionGate(
  shouldGate: (toolName: string, args: unknown) => boolean,
  onDecision: (record: DecisionRecord) => void,
): HookObserver {
  return {
    onPreToolUse: async (
      input: PreToolUseInput,
      invocation: HookInvocation,
    ): Promise<PreToolUseOutput> => {
      if (!shouldGate(input.toolName, input.toolArgs)) {
        return {};
      }

      try {
        const record = makeDecisionRecord({
          question: `Should tool '${input.toolName}' be allowed to execute?`,
          chosenOption: "deferred_to_permission_handler",
          alternatives: ["allow", "deny", "ask"],
          evidence: [
            `Tool: ${input.toolName}`,
            `Args: ${JSON.stringify(input.toolArgs)}`,
            `Session: ${invocation.sessionId}`,
          ],
          confidence: "medium",
          source: "automated_rule" as DecisionSource,
          toolName: input.toolName,
          toolArgs: input.toolArgs,
          provenanceTier: "certification",
          timestamp: new Date(input.timestamp).toISOString(),
        });

        onDecision(record);
      } catch (err) {
        console.warn(
          `[DecisionGate] Failed to record decision (tool=${input.toolName}):`,
          err,
        );
      }

      return {
        permissionDecision: "ask",
        permissionDecisionReason: `Decision gate triggered for ${input.toolName}`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createDecisionRecorder — passive recording via hook observer
// ---------------------------------------------------------------------------

/**
 * Factory that returns a `HookObserver` for passively recording decisions
 * from tool permission events without altering control flow.
 *
 * The observer watches `onPreToolUse` to capture tool invocation intent and
 * `onPostToolUse` to capture outcomes. No `permissionDecision` is returned,
 * so tool execution proceeds unimpeded.
 *
 * @param onDecision  Callback to persist/emit each decision record
 */
export function createDecisionRecorder(
  onDecision: (record: DecisionRecord) => void,
): HookObserver {
  return {
    onPreToolUse: async (
      input: PreToolUseInput,
      invocation: HookInvocation,
    ): Promise<PreToolUseOutput> => {
      try {
        const record = makeDecisionRecord({
          question: `Tool '${input.toolName}' invoked`,
          chosenOption: "observed",
          alternatives: [],
          evidence: [
            `Tool: ${input.toolName}`,
            `Args: ${JSON.stringify(input.toolArgs)}`,
            `Session: ${invocation.sessionId}`,
          ],
          confidence: "high",
          source: "automated_rule" as DecisionSource,
          toolName: input.toolName,
          toolArgs: input.toolArgs,
          provenanceTier: "internal",
          timestamp: new Date(input.timestamp).toISOString(),
        });

        onDecision(record);
      } catch (err) {
        console.warn(
          `[DecisionRecorder] Failed to record pre-tool decision (tool=${input.toolName}):`,
          err,
        );
      }

      // Passive — no permission decision, no control flow alteration
      return {};
    },

    onPostToolUse: async (
      input: PostToolUseInput,
      invocation: HookInvocation,
    ): Promise<Record<string, never>> => {
      try {
        const record = makeDecisionRecord({
          question: `Tool '${input.toolName}' completed`,
          chosenOption: "completed",
          alternatives: [],
          evidence: [
            `Tool: ${input.toolName}`,
            `Args: ${JSON.stringify(input.toolArgs)}`,
            `Session: ${invocation.sessionId}`,
            `Result type: ${typeof input.toolResult}`,
          ],
          confidence: "high",
          source: "automated_rule" as DecisionSource,
          toolName: input.toolName,
          toolArgs: input.toolArgs,
          provenanceTier: "internal",
          timestamp: new Date(input.timestamp).toISOString(),
        });

        onDecision(record);
      } catch (err) {
        console.warn(
          `[DecisionRecorder] Failed to record post-tool decision (tool=${input.toolName}):`,
          err,
        );
      }

      return {};
    },
  };
}
