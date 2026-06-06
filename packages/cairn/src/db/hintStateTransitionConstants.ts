/**
 * Shared constants for the hint_state_transition event format.
 *
 * BOTH the producer (emitHintTransitionEvent in optimizationHints.ts) AND the
 * consumer (SqliteHintDispositionProvider SQL in sqliteHintDispositionProvider.ts)
 * MUST reference these constants. Any rename here will cause compile-time failures
 * in both files simultaneously, preventing silent drift between the two sides.
 */

/** Event type identifier written by the producer and read by the consumer's SQL WHERE clause. */
export const HINT_STATE_TRANSITION_EVENT_TYPE = 'hint_state_transition' as const;

/**
 * The source value that marks a user-driven transition via the Cairn MCP tool.
 * Only transitions with this source drive suppression/boost in the prescriber.
 * System-generated transitions use 'system' and must NOT influence feedback.
 */
export const HINT_TRANSITION_SOURCE_MCP = 'mcp' as const;

/**
 * Payload key names for hint_state_transition events.
 *
 * The string values here appear literally in:
 *   - The object passed to logEvent() in emitHintTransitionEvent (producer)
 *   - json_extract() path expressions in SqliteHintDispositionProvider SQL (consumer)
 *
 * A key rename here produces a compile error in both callsites.
 */
export const HINT_TRANSITION_PAYLOAD_KEYS = {
  SKILL_ID: 'skill_id',
  HINT_ID: 'hint_id',
  FROM_STATE: 'from_state',
  TO_STATE: 'to_state',
  TIMESTAMP: 'timestamp',
  RESOLUTION_DISPOSITION: 'resolution_disposition',
  RESOLUTION_NOTE: 'resolution_note',
  SOURCE: 'source',
} as const;
