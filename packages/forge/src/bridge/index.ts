/**
 * Event Bridge — Maps @github/copilot-sdk SessionEvent types to CairnBridgeEvent.
 *
 * This is the single adapter between the SDK's event stream and Cairn's
 * observability layer. All SDK event → Cairn event translation is isolated here
 * so that SDK API churn affects ~one file, never Cairn internals.
 *
 * @module
 */

import type { SessionEvent, SessionEventType } from "@github/copilot-sdk";
import type { CairnBridgeEvent, ProvenanceTier } from "@akubly/types";

// ---------------------------------------------------------------------------
// Provenance classification
// ---------------------------------------------------------------------------

/**
 * Certification-tier events record human decisions, permission outcomes,
 * quality assessments, or workflow state changes. These form the DBOM —
 * the auditable record of what a human approved.
 *
 * Everything else is internal-tier: mechanical observations useful for
 * analytics but not part of the audit trail.
 */
const CERTIFICATION_EVENT_TYPES: ReadonlySet<string> = new Set([
  "permission_requested",
  "permission_completed",
  "decision_point",
  "plan_changed",
  "error",
  "subagent_start",
  "subagent_complete",
  "subagent_failed",
  "skill_invoked",
  "snapshot_rewind",
]);

/**
 * Classify a Cairn event type by its provenance tier.
 * Exported for testing and for downstream consumers that need
 * to reason about provenance without going through the full bridge.
 */
export function classifyProvenance(cairnEventType: string): ProvenanceTier {
  if (CERTIFICATION_EVENT_TYPES.has(cairnEventType)) return "certification";
  return "internal";
}

// ---------------------------------------------------------------------------
// Event mapping: SDK event types → Cairn event types
// ---------------------------------------------------------------------------

/**
 * Maps SDK SessionEventType values to Cairn event_log type strings.
 *
 * Categories:
 *   CLEAN MAP (1:1, minimal transformation): 9 events
 *   TRANSFORM NEEDED (payload reshaping):    5 events
 *   NEW CAIRN TYPES (no existing equivalent): 8 events
 *   SKIPPED (~64 events): Too noisy or ephemeral for event_log.
 *
 * Exported as a frozen object so downstream code can inspect the mapping
 * without risking mutation.
 */
export const EVENT_MAP: Readonly<Partial<Record<SessionEventType, string>>> = Object.freeze({
  // --- Clean 1:1 maps ---
  "session.start": "session_start",
  "session.idle": "session_idle",
  "session.error": "error",
  "session.shutdown": "session_end",
  "user.message": "user_message",
  "tool.execution_start": "tool_use",
  "tool.execution_complete": "tool_result",
  "assistant.message": "assistant_message",
  "assistant.usage": "model_call",

  // --- Maps requiring payload transformation ---
  "session.usage_info": "context_window",
  "session.compaction_complete": "compaction",
  "session.model_change": "model_change",
  "assistant.turn_start": "turn_start",
  "assistant.turn_end": "turn_end",

  // --- New Cairn event types (SDK provides data we don't capture today) ---
  "subagent.started": "subagent_start",
  "subagent.completed": "subagent_complete",
  "subagent.failed": "subagent_failed",
  "permission.requested": "permission_requested",
  "permission.completed": "permission_completed",
  "session.plan_changed": "plan_changed",
  "skill.invoked": "skill_invoked",
  "session.snapshot_rewind": "snapshot_rewind",
});

// ---------------------------------------------------------------------------
// Payload extractors
// ---------------------------------------------------------------------------

/** Extracts a Cairn-friendly payload from an SDK event. */
export type PayloadExtractor = (event: SessionEvent) => Record<string, unknown>;

/** Default: pass through the raw event data unchanged. */
const defaultExtractor: PayloadExtractor = (event) =>
  (event.data as Record<string, unknown>) ?? {};

/**
 * Custom extractors for events that need payload reshaping.
 * These select the fields Cairn cares about and flatten nested structures,
 * omitting large or sensitive data (tool args, result content).
 */
export const PAYLOAD_EXTRACTORS: Readonly<
  Partial<Record<SessionEventType, PayloadExtractor>>
> = Object.freeze({
  "assistant.usage": (event) => {
    const d = event.data as Record<string, unknown>;
    return {
      model: d.model,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheReadTokens: d.cacheReadTokens,
      cacheWriteTokens: d.cacheWriteTokens,
      cost: d.cost,
      duration: d.duration,
      ttftMs: d.ttftMs,
      totalNanoAiu: (d.copilotUsage as Record<string, unknown> | undefined)
        ?.totalNanoAiu,
    };
  },

  "tool.execution_start": (event) => {
    const d = event.data as Record<string, unknown>;
    return {
      toolCallId: d.toolCallId,
      toolName: d.toolName,
      mcpServerName: d.mcpServerName,
    };
  },

  "tool.execution_complete": (event) => {
    const d = event.data as Record<string, unknown>;
    return {
      toolCallId: d.toolCallId,
      success: d.success,
      error: d.error,
    };
  },

  "session.usage_info": (event) => {
    const d = event.data as Record<string, unknown>;
    return {
      tokenLimit: d.tokenLimit,
      currentTokens: d.currentTokens,
      messagesLength: d.messagesLength,
      systemTokens: d.systemTokens,
      conversationTokens: d.conversationTokens,
      toolDefinitionsTokens: d.toolDefinitionsTokens,
    };
  },
});

// ---------------------------------------------------------------------------
// Bridge function — core adapter
// ---------------------------------------------------------------------------

/**
 * Convert an SDK SessionEvent into a CairnBridgeEvent.
 * Returns `null` for unmapped event types (the ~64 we intentionally skip).
 */
export function bridgeEvent(
  sessionId: string,
  event: SessionEvent,
): CairnBridgeEvent | null {
  const cairnType = EVENT_MAP[event.type];
  if (!cairnType) return null;

  const extractor = PAYLOAD_EXTRACTORS[event.type] ?? defaultExtractor;
  const payload = extractor(event);

  return {
    sessionId,
    eventType: cairnType,
    payload: JSON.stringify(payload),
    createdAt: event.timestamp,
    provenanceTier: classifyProvenance(cairnType),
  };
}

// ---------------------------------------------------------------------------
// Bridge wiring — attach to a CopilotSession's event stream
// ---------------------------------------------------------------------------

/** Minimal event-source interface so we don't couple to the full CopilotSession type. */
export interface EventSource {
  on(handler: (event: SessionEvent) => void): () => void;
}

/**
 * Wire the event bridge to an EventSource (typically a CopilotSession).
 * Every mapped SDK event is translated and forwarded to the `sink` callback.
 * Returns an unsubscribe function for cleanup.
 */
export function attachBridge(
  source: EventSource,
  sessionId: string,
  sink: (event: CairnBridgeEvent) => void,
): () => void {
  return source.on((event: SessionEvent) => {
    const bridged = bridgeEvent(sessionId, event);
    if (bridged) {
      try {
        sink(bridged);
      } catch (err) {
        console.warn(
          `[EventBridge] sink threw for session=${sessionId} event=${bridged.eventType}:`,
          err,
        );
      }
    }
  });
}
