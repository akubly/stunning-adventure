/**
 * SqliteRelationReader — read-only SQLite counterpart to SqliteRelationWriter.
 *
 * Queries `fact_relations` for `relation_kind = 'duplicate_of'` edges
 * scoped to a session. Used by `recallWithScores` to suppress non-canonical
 * duplicates before ranking (D-INT-9: storage stays lossless — no rows are
 * mutated; only the activity-layer view is collapsed).
 *
 * DB lifecycle: caller injects an already-opened, migration-applied Database
 * handle. This class does not open or close the database.
 */

import type Database from 'better-sqlite3';
import type { SessionId, FactId } from '@akubly/types';
import type { RelationReader } from '../representation/relation.js';

interface DupRow {
  from_fact_id: string;
  to_fact_id: string;
}

export class SqliteRelationReader implements RelationReader {
  private readonly stmt: Database.Statement<{ session_id: string }, DupRow>;

  constructor(db: Database.Database) {
    this.stmt = db.prepare<{ session_id: string }, DupRow>(
      "SELECT from_fact_id, to_fact_id FROM fact_relations WHERE session_id = $session_id AND relation_kind = 'duplicate_of'",
    );
  }

  async listDuplicateOf(
    args: { sessionId: SessionId },
  ): Promise<ReadonlyArray<{ from: FactId; to: FactId }>> {
    const rows = this.stmt.all({ session_id: args.sessionId as string });
    return rows.map(r => ({
      from: r.from_fact_id as FactId,
      to: r.to_fact_id as FactId,
    }));
  }
}
