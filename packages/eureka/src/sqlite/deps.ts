/**
 * Production wiring factory for SQLite-backed Eureka deps.
 *
 * Consumers import from `@akubly/eureka/sqlite` to get batteries-included
 * RecallDeps and ApplyFeedbackDeps assembled from the SQLite storage impls.
 * The core `@akubly/eureka` entry does NOT re-export these — that boundary
 * keeps better-sqlite3 out of the main package surface (Slice A, PR #43).
 *
 * Usage:
 *   import { openDatabase, createSqliteRecallDeps } from '@akubly/eureka/sqlite';
 *   const db = openDatabase();               // opens ~/.eureka/eureka.db
 *   const deps = createSqliteRecallDeps(db); // RecallDeps ready to use
 *   const results = await recall(options, deps);
 */

import type Database from 'better-sqlite3';
import type { RecallDeps, ApplyFeedbackDeps } from '../activities/recall.js';
import { SqliteFactStore } from '../storage/fact-store-sqlite.js';
import { SqliteTrustUpdater } from '../storage/trust-updater-sqlite.js';

/** System wall-clock — delegates to Date.now() (milliseconds). */
const systemClock = { now: (): number => Date.now() };

/**
 * Assemble production SQLite `RecallDeps`.
 *
 * Returns `{ factStore: SqliteFactStore, clock: systemClock }` — pass directly
 * to `recall()` / `recallWithScores()`.
 *
 * @param db  An already-opened, migration-applied `Database` handle from
 *            `openDatabase()`.  This factory does not open or close the DB.
 */
export function createSqliteRecallDeps(db: Database.Database): RecallDeps {
  return {
    factStore: new SqliteFactStore(db),
    clock: systemClock,
  };
}

/**
 * Assemble production SQLite `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps`.
 *
 * Returns `{ trustUpdater: SqliteTrustUpdater }` — pass directly to
 * `applyFeedback()` / `applyFeedbackById()`.
 *
 * @param db  An already-opened, migration-applied `Database` handle from
 *            `openDatabase()`.  This factory does not open or close the DB.
 */
export function createSqliteFeedbackDeps(db: Database.Database): ApplyFeedbackDeps {
  return {
    trustUpdater: new SqliteTrustUpdater(db),
  };
}
