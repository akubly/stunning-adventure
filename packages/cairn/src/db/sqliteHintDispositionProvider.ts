import type Database from 'better-sqlite3';
import type { DispositionSummary, HintDispositionProvider } from '@akubly/types';

interface DispositionRow {
  category: string;
  dismissed_count: number;
  resolved_count: number;
}

/**
 * SQLite-backed HintDispositionProvider.
 *
 * Reads `hint_state_transition` events from the event log, joining with
 * `optimization_hints` to obtain each hint's category.  Only events where
 * `source = 'mcp'` (i.e. user-driven via the Cairn resolve MCP tool) are
 * counted — system-generated transitions must NOT drive suppression.
 */
export class SqliteHintDispositionProvider implements HintDispositionProvider {
  constructor(private readonly db: Database.Database) {}

  async getDispositions(skillId: string): Promise<DispositionSummary[]> {
    const rows = this.db.prepare<[string], DispositionRow>(`
      SELECT
        h.category,
        SUM(CASE WHEN json_extract(e.payload, '$.resolution_disposition') = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count,
        SUM(CASE WHEN json_extract(e.payload, '$.resolution_disposition') = 'resolved'  THEN 1 ELSE 0 END) AS resolved_count
      FROM event_log e
      JOIN optimization_hints h
        ON json_extract(e.payload, '$.hint_id') = h.id
      WHERE e.event_type = 'hint_state_transition'
        AND json_extract(e.payload, '$.skill_id') = ?
        AND json_extract(e.payload, '$.source') = 'mcp'
        AND json_extract(e.payload, '$.resolution_disposition') IS NOT NULL
      GROUP BY h.category
    `).all(skillId);

    return rows.map((row) => ({
      skillId,
      category: row.category,
      dismissedCount: row.dismissed_count,
      resolvedCount: row.resolved_count,
    }));
  }
}
