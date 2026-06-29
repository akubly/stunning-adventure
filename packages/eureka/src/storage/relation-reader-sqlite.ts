/**
 * SqliteRelationReader — read-only SQLite counterpart to SqliteRelationWriter.
 *
 * Queries `fact_relations` for `relation_kind = 'duplicate_of'` edges
 * scoped to a session. Used by `recallWithScores` to suppress non-canonical
 * duplicates before ranking (D-INT-9: storage stays lossless — no rows are
 * mutated; only the activity-layer view is collapsed).
 *
 * When `candidateIds` are provided, the query is narrowed to edges whose
 * `from_fact_id` is in the candidate set — avoids a full-session scan (D fix,
 * persona-review fix wave).
 *
 * DB lifecycle: caller injects an already-opened, migration-applied Database
 * handle. This class does not open or close the database.
 */

import type Database from 'better-sqlite3';
import type { SessionId, FactId } from '@akubly/types';
import type { RelationReader } from './relation-reader.types.js';

interface DupRow {
  from_fact_id: string;
  to_fact_id: string;
}

/** Maximum candidateIds per SQLite statement — conservative bound that stays under
 * SQLITE_LIMIT_VARIABLE_NUMBER (default 999) after accounting for the session_id param. */
const SQLITE_VARIABLE_CHUNK = 900;

export class SqliteRelationReader implements RelationReader {
  private readonly db: Database.Database;
  private readonly stmtAll: Database.Statement<{ session_id: string }, DupRow>;

  constructor(db: Database.Database) {
    this.db = db;
    this.stmtAll = db.prepare<{ session_id: string }, DupRow>(
      "SELECT from_fact_id, to_fact_id FROM fact_relations WHERE session_id = $session_id AND relation_kind = 'duplicate_of'",
    );
  }

  async listDuplicateOf(
    args: { sessionId: SessionId; candidateIds?: ReadonlyArray<FactId> },
  ): Promise<ReadonlyArray<{ from: FactId; to: FactId }>> {
    if (args.candidateIds !== undefined) {
      // candidateIds provided (even if empty) → restrict to that set.
      // Empty array → no edges possible (no candidates to be non-canonical). Return [].
      if (args.candidateIds.length === 0) return [];

      // Chunk to stay under SQLite's variable limit for large overfetch pages.
      const ids = args.candidateIds as unknown as readonly string[];
      const allRows: DupRow[] = [];
      for (let i = 0; i < ids.length; i += SQLITE_VARIABLE_CHUNK) {
        const chunk = ids.slice(i, i + SQLITE_VARIABLE_CHUNK);
        const placeholders = chunk.map(() => '?').join(',');
        const stmt = this.db.prepare<unknown[], DupRow>(
          `SELECT from_fact_id, to_fact_id FROM fact_relations WHERE session_id = ? AND relation_kind = 'duplicate_of' AND from_fact_id IN (${placeholders})`,
        );
        allRows.push(...stmt.all(args.sessionId as string, ...chunk));
      }
      return allRows.map(r => ({ from: r.from_fact_id as FactId, to: r.to_fact_id as FactId }));
    }

    // No candidateIds → full session scan (backward compat for direct callers).
    return this.stmtAll
      .all({ session_id: args.sessionId as string })
      .map(r => ({ from: r.from_fact_id as FactId, to: r.to_fact_id as FactId }));
  }
}
