import type Database from 'better-sqlite3';
import type { DispositionSummary, HintDispositionProvider, OptimizationCategory } from '@akubly/types';
import {
  HINT_STATE_TRANSITION_EVENT_TYPE,
  HINT_TRANSITION_SOURCE_MCP,
  HINT_TRANSITION_PAYLOAD_KEYS as K,
  HINT_RESOLUTION_DISMISSED,
  HINT_RESOLUTION_RESOLVED,
} from './hintStateTransitionConstants.js';

interface DispositionRow {
  category: string;
  dismissed_count: number;
  resolved_count: number;
}

// SQL is built at module load time so the constants are inlined once and the
// prepared statement is re-used on every call.
const DISPOSITION_SQL = `
  SELECT
    h.category,
    SUM(CASE WHEN json_extract(e.payload, '$.${K.RESOLUTION_DISPOSITION}') = '${HINT_RESOLUTION_DISMISSED}' THEN 1 ELSE 0 END) AS dismissed_count,
    SUM(CASE WHEN json_extract(e.payload, '$.${K.RESOLUTION_DISPOSITION}') = '${HINT_RESOLUTION_RESOLVED}'  THEN 1 ELSE 0 END) AS resolved_count
  FROM event_log e
  JOIN optimization_hints h
    ON json_extract(e.payload, '$.${K.HINT_ID}') = h.id
  WHERE e.event_type = '${HINT_STATE_TRANSITION_EVENT_TYPE}'
    AND json_extract(e.payload, '$.${K.SKILL_ID}') = ?
    AND json_extract(e.payload, '$.${K.SOURCE}') = '${HINT_TRANSITION_SOURCE_MCP}'
    AND json_extract(e.payload, '$.${K.RESOLUTION_DISPOSITION}') IS NOT NULL
  GROUP BY h.category
`;

/**
 * SQLite-backed HintDispositionProvider.
 *
 * Reads `hint_state_transition` events from the event_log, joining with
 * `optimization_hints` to obtain each hint's category.  Only events where
 * `source = 'mcp'` (i.e. user-driven via the Cairn resolve MCP tool) are
 * counted — system-generated transitions must NOT drive suppression.
 *
 * The JOIN on `optimization_hints` means a `deleteOptimizationHint` call on a
 * previously dismissed hint will cause the dismissal to be invisible to this
 * provider (the JOIN match disappears).  This is a known limitation:
 * `deleteOptimizationHint` is a low-level CRUD function not exposed in the
 * primary MCP resolve path — hints resolved via MCP are transitioned to
 * `rejected` status (row kept) rather than deleted.  If a hard-delete path
 * is ever added to the public API, the payload should carry `category`
 * directly so the JOIN dependency can be removed.
 */
export class SqliteHintDispositionProvider implements HintDispositionProvider {
  constructor(private readonly db: Database.Database) {}

  async getDispositions(skillId: string): Promise<DispositionSummary[]> {
    const rows = this.db.prepare<[string], DispositionRow>(DISPOSITION_SQL).all(skillId);

    return rows.map((row) => ({
      skillId,
      // Cast is safe: category values are written by our own prescribers and
      // constrained to OptimizationCategory by the hint insert layer.
      category: row.category as OptimizationCategory,
      dismissedCount: row.dismissed_count,
      resolvedCount: row.resolved_count,
    }));
  }
}
