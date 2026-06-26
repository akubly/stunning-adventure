/**
 * SqliteFactReader — SQLite-backed FactReader implementation for
 * `@akubly/eureka`. Implements the same `FactReader` interface as
 * `InMemoryFactReader`; verified by the shared contract suite in
 * `storage/__tests__/fact-reader.contract.test.ts`.
 *
 * **NaN handling:** SQLite has no NaN literal. The `trust` column is
 * NULLABLE REAL. NaN is stored as NULL and re-hydrated on read:
 *   `row.trust === null ? NaN : row.trust`
 * This satisfies CL-4 (trust passthrough). The caller (applyFeedbackById)
 * is responsible for detecting and rejecting corrupt trust values.
 *
 * **DB lifecycle:** the caller injects an already-opened `Database` handle
 * (Cairn convention — see openDatabase.ts). This class does not open or
 * close the database.
 */

import type Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import type { FactReader } from '../activities/recall.js';
import type { FactId } from '../activities/imprint.js';
import { sqliteDateTimeToEpochMs } from './datetime.js';

interface FactRow {
  trust: number | null;
}

interface ListRow {
  fact_id: string;
  content: string;
  created_at: string;
}

export class SqliteFactReader implements FactReader {
  private readonly stmt: Database.Statement<{ fact_id: string; session_id: string }, FactRow>;
  private readonly stmtList: Database.Statement<{ session_id: string }, ListRow>;

  constructor(db: Database.Database) {
    this.stmt = db.prepare<{ fact_id: string; session_id: string }, FactRow>(
      'SELECT trust FROM facts WHERE fact_id = $fact_id AND session_id = $session_id',
    );
    // listBySession: skip rows with NULL trust (corrupt / NaN-stored) to mirror
    // SqliteFactStore.search's `trust IS NOT NULL` posture — integrate's pair-scan
    // should never see corrupt rows. created_at is the schema TEXT format
    // (`YYYY-MM-DD HH:MM:SS`, UTC) — converted to epoch ms before surfacing.
    this.stmtList = db.prepare<{ session_id: string }, ListRow>(
      'SELECT fact_id, content, created_at FROM facts WHERE session_id = $session_id AND trust IS NOT NULL',
    );
  }

  async read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null> {
    const row = this.stmt.get({ fact_id: args.factId, session_id: args.sessionId });
    if (row === undefined) return null;
    // NULL in storage represents NaN (CL-4 round-trip).
    const trust = row.trust === null ? NaN : row.trust;
    return { trust };
  }

  async listBySession(
    args: { sessionId: SessionId },
  ): Promise<ReadonlyArray<{ factId: FactId; content: string; createdAt: number }>> {
    const rows = this.stmtList.all({ session_id: args.sessionId as string });
    return rows.map(r => ({
      factId: r.fact_id as FactId,
      content: r.content,
      createdAt: sqliteDateTimeToEpochMs(r.created_at),
    }));
  }
}
