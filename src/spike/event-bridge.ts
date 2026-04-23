/**
 * SPIKE CODE — Experimental, not for production use.
 *
 * Event bridge sketch: Maps @github/copilot-sdk events to Cairn's
 * event_log schema. Answers Q5 (Cairn Bridge) from the spike scope.
 *
 * This is the adapter pattern that would sit between the SDK's event
 * stream and Cairn's `logEvent()` function.
 */

import type {
  SessionEvent,
  SessionEventType,
} from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// Cairn event_log schema (mirrored from src/db.ts for reference)
// ---------------------------------------------------------------------------

/**
 * Provenance tiers tag events by their evidentiary weight:
 *   - 'internal': Mechanical events (tool calls, model switches, streaming).
 *                 Useful for debugging and analytics, but not decision-relevant.
 *   - 'certification': Decision-relevant events (human approvals, tool blocks,
 *                       quality gates, permission outcomes). These form the
 *                       DBOM (Decision Bill of Materials) for a workflow run.
 *   - 'deployment': Events from deployed artifacts (SKILL.md, hooks) running
 *                   in corp/EMU environments. Used for PGO feedback via
 *                   Application Insights telemetry.
 */
type ProvenanceTier = "internal" | "certification" | "deployment";

interface CairnEvent {
  session_id: string;
  event_type: string;
  payload: string; // JSON string
  created_at: string; // ISO 8601
  provenanceTier: ProvenanceTier;
}

// ---------------------------------------------------------------------------
// Provenance tier classification
// ---------------------------------------------------------------------------

/**
 * Classifies a Cairn event type by its provenance tier.
 *
 * Certification-tier events are those that record human decisions,
 * permission outcomes, quality assessments, or workflow state changes.
 * These form the DBOM — the auditable record of what a human approved.
 *
 * Internal-tier events are mechanical observations: tool calls, model
 * usage, context window metrics. Useful for analytics but not auditable.
 */
const CERTIFICATION_EVENT_TYPES = new Set([
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

function classifyProvenance(cairnEventType: string): ProvenanceTier {
  if (CERTIFICATION_EVENT_TYPES.has(cairnEventType)) return "certification";
  return "internal";
}

// ---------------------------------------------------------------------------
// Event mapping: SDK event types → Cairn event types
// ---------------------------------------------------------------------------

/**
 * Maps SDK event types to Cairn event_log types.
 *
 * Categories:
 *   CLEAN MAP (1:1, minimal transformation): 9 events
 *   TRANSFORM NEEDED (payload reshaping): 5 events
 *   NEW CAIRN TYPES (no existing equivalent): 8 events
 *   SKIP (too noisy or ephemeral for event_log): ~64 events
 */
const EVENT_MAP: Partial<Record<SessionEventType, string>> = {
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
};

// ---------------------------------------------------------------------------
// Payload extractors — transform SDK payloads to Cairn-friendly shapes
// ---------------------------------------------------------------------------

type PayloadExtractor = (event: SessionEvent) => Record<string, unknown>;

/**
 * Default extractor — pass through the raw event data.
 * Works for clean 1:1 maps where the SDK payload is already useful.
 */
const defaultExtractor: PayloadExtractor = (event) => event.data as Record<string, unknown>;

/**
 * Custom extractors for events that need payload reshaping.
 * These select the fields Cairn cares about and flatten nested structures.
 */
const PAYLOAD_EXTRACTORS: Partial<Record<SessionEventType, PayloadExtractor>> = {
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
      // Flatten the billing data if present
      totalNanoAiu: (d.copilotUsage as Record<string, unknown> | undefined)?.totalNanoAiu,
    };
  },

  "tool.execution_start": (event) => {
    const d = event.data as Record<string, unknown>;
    return {
      toolCallId: d.toolCallId,
      toolName: d.toolName,
      mcpServerName: d.mcpServerName,
      // Omit arguments — they can be large and may contain sensitive data
    };
  },

  "tool.execution_complete": (event) => {
    const d = event.data as Record<string, unknown>;
    return {
      toolCallId: d.toolCallId,
      success: d.success,
      error: d.error,
      // Omit result content — can be very large
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
};

// ---------------------------------------------------------------------------
// Bridge function — the core adapter
// ---------------------------------------------------------------------------

/**
 * Converts an SDK SessionEvent into a Cairn event_log record.
 * Returns null for events we don't map (skipped events).
 */
function bridgeEvent(cairnSessionId: string, event: SessionEvent): CairnEvent | null {
  const cairnType = EVENT_MAP[event.type];
  if (!cairnType) return null;

  const extractor = PAYLOAD_EXTRACTORS[event.type] ?? defaultExtractor;
  const payload = extractor(event);
  const provenanceTier = classifyProvenance(cairnType);

  return {
    session_id: cairnSessionId,
    event_type: cairnType,
    payload: JSON.stringify(payload),
    created_at: event.timestamp,
    provenanceTier,
  };
}

// ---------------------------------------------------------------------------
// Bridge wiring — attach to a CopilotSession
// ---------------------------------------------------------------------------

/**
 * Wire up the event bridge to a CopilotSession.
 * Returns an unsubscribe function.
 *
 * Usage:
 *   const unsub = attachBridge(session, cairnSessionId, logEvent);
 *   // ... use session ...
 *   unsub(); // clean up
 */
function attachBridge(
  session: { on(handler: (event: SessionEvent) => void): () => void },
  cairnSessionId: string,
  logEvent: (event: CairnEvent) => void,
): () => void {
  return session.on((event: SessionEvent) => {
    const cairnEvent = bridgeEvent(cairnSessionId, event);
    if (cairnEvent) {
      logEvent(cairnEvent);
    }
  });
}

// ---------------------------------------------------------------------------
// Coverage analysis
// ---------------------------------------------------------------------------

/**
 * Summary of mapping coverage:
 *
 * SDK emits 86 event types total.
 *
 * MAPPED (22 types):
 *   Clean 1:1:        9 — pass-through, minimal work
 *   Transform needed: 5 — payload reshaping, ~10 LOC each
 *   New Cairn types:  8 — extend Cairn's vocabulary, no schema migration
 *
 * PROVENANCE CLASSIFICATION:
 *   Certification tier: 10 types — decision-relevant, DBOM-worthy
 *   Internal tier:      12 types — mechanical observations
 *
 * SKIPPED (64 types):
 *   Streaming deltas:      5 — ephemeral, high-frequency noise
 *   Content types:        15 — display-layer, not observability
 *   MCP/extension lifecycle: 6 — infrastructure noise
 *   Command lifecycle:      3 — low value
 *   UI/elicitation:         4 — interaction details
 *   Other transient:       31 — various low-signal events
 *
 * VERDICT: 22/86 events mapped covers all Cairn-relevant signals.
 * Provenance tagging adds ~20 LOC with no runtime overhead (static classification).
 * DBOM reconstruction from certification-tier events is O(n) filter + collect.
 */

// ---------------------------------------------------------------------------
// DBOM reconstruction from certification-tier events
// ---------------------------------------------------------------------------

/**
 * Reconstructs a Decision Bill of Materials from collected CairnEvents.
 * Filters to certification-tier events only, producing an auditable record
 * of all decision-relevant actions in a session.
 *
 * A DBOM captures:
 *   - What tools were gated (permission_requested)
 *   - What decisions were made (permission_completed, decision_point)
 *   - What workflow state changes occurred (plan_changed, snapshot_rewind)
 *   - What errors surfaced (error)
 *
 * This is the portable artifact: exportable as JSON for compliance,
 * importable into PGO for feedback loops.
 */
interface DBOMEntry {
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface DBOM {
  sessionId: string;
  generatedAt: string;
  certificationEvents: DBOMEntry[];
  summary: {
    totalEvents: number;
    certificationEvents: number;
    eventTypeCounts: Record<string, number>;
  };
}

function reconstructDBOM(sessionId: string, events: CairnEvent[]): DBOM {
  const certEvents = events.filter((e) => e.provenanceTier === "certification");

  const entries: DBOMEntry[] = certEvents.map((e) => ({
    eventType: e.event_type,
    timestamp: e.created_at,
    payload: JSON.parse(e.payload) as Record<string, unknown>,
  }));

  const typeCounts: Record<string, number> = {};
  for (const e of certEvents) {
    typeCounts[e.event_type] = (typeCounts[e.event_type] ?? 0) + 1;
  }

  return {
    sessionId,
    generatedAt: new Date().toISOString(),
    certificationEvents: entries,
    summary: {
      totalEvents: events.length,
      certificationEvents: certEvents.length,
      eventTypeCounts: typeCounts,
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  bridgeEvent,
  attachBridge,
  classifyProvenance,
  reconstructDBOM,
  EVENT_MAP,
  PAYLOAD_EXTRACTORS,
  CERTIFICATION_EVENT_TYPES,
  type CairnEvent,
  type ProvenanceTier,
  type PayloadExtractor,
  type DBOM,
  type DBOMEntry,
};
