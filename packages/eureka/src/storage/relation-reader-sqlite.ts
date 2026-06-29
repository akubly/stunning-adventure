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
    let rows: DupRow[];

    if (args.candidateIds && args.candidateIds.length > 0) {
      // Narrow query: only fetch edges where from_fact_id is a current candidate.
      // Avoids a full-session edge scan when the candidate set is small.
      const placeholders = args.candidateIds.map(() => '?').join(',');
      const stmt = this.db.prepare<unknown[], DupRow>(
        `SELECT from_fact_id, to_fact_id FROM fact_relations WHERE session_id = ? AND relation_kind = 'duplicate_of' AND from_fact_id IN (${placeholders})`,
      );
      rows = stmt.all(args.sessionId as string, ...(args.candidateIds as unknown as string[]));
    } else {
      rows = this.stmtAll.all({ session_id: args.sessionId as string });
    }

    return rows.map(r => ({
      from: r.from_fact_id as FactId,
      to:   r.to_fact_id as FactId,
    }));
  }
}
