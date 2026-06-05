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

interface FactRow {
  trust: number | null;
}

export class SqliteFactReader implements FactReader {
  private readonly stmt: ReturnType<Database.Database['prepare']>;

  constructor(db: Database.Database) {
    this.stmt = db.prepare(
      'SELECT trust FROM facts WHERE fact_id = $fact_id AND session_id = $session_id',
    );
  }

  async read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null> {
    const row = this.stmt.get({ fact_id: args.factId, session_id: args.sessionId }) as FactRow | undefined;
    if (row === undefined) return null;
    // NULL in storage represents NaN (CL-4 round-trip).
    const trust = row.trust === null ? NaN : row.trust;
    return { trust };
  }
}
