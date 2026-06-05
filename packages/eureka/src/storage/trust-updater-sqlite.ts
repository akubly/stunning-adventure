/**
 * SqliteTrustUpdater — SQLite-backed TrustUpdater implementation for
 * `@akubly/eureka`. Implements the `TrustUpdater` interface; verified by the
 * shared contract suite in `storage/__tests__/trust-updater.contract.test.ts`.
 *
 * ## Atomicity — BEGIN IMMEDIATE
 *
 * `better-sqlite3`'s `db.transaction(fn)` uses a DEFERRED BEGIN by default,
 * which can cause SQLITE_BUSY_SNAPSHOT errors when a concurrent writer has
 * already upgraded to a write lock after our read. To serialize writes
 * correctly we use `.immediate()` — this issues BEGIN IMMEDIATE, acquiring
 * the write lock at the start of the transaction rather than at first write.
 * Combined with `busy_timeout=5000ms` (set in `openDatabase`), concurrent
 * callers will wait and retry rather than fail immediately.
 *
 * WAL mode (enabled in `openDatabase`) is single-writer: at most one writer
 * holds the lock at a time. BEGIN IMMEDIATE ensures our read-modify-write
 * cycle is fully serialized, satisfying C-5 at the database level rather than
 * via a JS-layer lock (contrast with InMemoryTrustUpdater's promise-chain lock).
 *
 * ## NaN handling
 *
 * SQLite has no NaN literal; the `trust` column stores NULL for NaN (per CL-4
 * convention established in Slice A). On SELECT: `row.trust === null ? NaN : row.trust`.
 * On INSERT: if fn returns NaN we throw InvalidTrustValueError before committing,
 * so a NaN result never reaches the DB. The NULL read-path is for pre-existing
 * corrupt rows seeded externally (e.g., test harness or legacy data).
 *
 * ## DB lifecycle
 *
 * The caller injects an already-opened `Database` handle (Cairn/Eureka convention
 * — see openDatabase.ts). This class does not open or close the database.
 */

import type Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import type { TrustUpdater } from '../activities/recall.js';
import { FactNotFoundError, InvalidTrustValueError } from '../activities/errors.js';

interface FactRow {
  trust: number | null;
}

type MutateArgs = { factId: string; sessionId: SessionId; fn: (t: number) => number };

export class SqliteTrustUpdater implements TrustUpdater {
  // Stored as a closure so the prepared statements are reused across calls.
  private readonly runTxn: (args: MutateArgs) => void;

  constructor(db: Database.Database) {
    const selectStmt = db.prepare<[string, string], FactRow>(
      'SELECT trust FROM facts WHERE fact_id = ? AND session_id = ?',
    );
    const updateStmt = db.prepare<[number | null, string, string]>(
      "UPDATE facts SET trust = ?, updated_at = datetime('now') WHERE fact_id = ? AND session_id = ?",
    );

    // BEGIN IMMEDIATE serializes read-modify-write at the DB lock level.
    // See module JSDoc for rationale over DEFERRED.
    const rawTxn = db.transaction((args: MutateArgs) => {
      const row = selectStmt.get(args.factId, args.sessionId);
      if (row === undefined) {
        throw new FactNotFoundError(args.factId);
      }

      // NULL in storage represents NaN (Slice A CL-4 convention).
      const currentTrust = row.trust === null ? NaN : row.trust;

      // fn may throw — transaction rolls back; error propagates unchanged (C-2).
      const newTrust = args.fn(currentTrust);

      // Validate before committing. throw here → transaction rolls back → C-3.
      if (!Number.isFinite(newTrust) || newTrust < 0 || newTrust > 1) {
        throw new InvalidTrustValueError(
          newTrust,
          'storage',
          `SqliteTrustUpdater.mutate: fn returned an out-of-range trust value (${newTrust}); expected a finite number in [0, 1]`,
        );
      }

      updateStmt.run(newTrust, args.factId, args.sessionId);
    });

    // Bind the immediate variant so each call gets BEGIN IMMEDIATE semantics.
    this.runTxn = (args: MutateArgs) => rawTxn.immediate(args);
  }

  async mutate(args: {
    factId: string;
    sessionId: SessionId;
    fn: (currentTrust: number) => number;
  }): Promise<void> {
    // better-sqlite3 is synchronous; wrap in async to satisfy the TrustUpdater interface.
    // Errors thrown inside the transaction (FactNotFoundError, InvalidTrustValueError,
    // or any fn-thrown error) propagate out of this call unchanged — no wrapping.
    this.runTxn(args);
  }
}
