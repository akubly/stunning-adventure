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
import type { ImprintDeps, FactId } from '../activities/imprint.js';
import { SqliteFactStore } from '../storage/fact-store-sqlite.js';
import { SqliteTrustUpdater } from '../storage/trust-updater-sqlite.js';
import { SqliteFactWriter } from '../storage/fact-writer-sqlite.js';
import { randomUUID } from 'node:crypto';

/** System wall-clock — delegates to Date.now() (milliseconds). */
const systemClock = { now: (): number => Date.now() };

/**
 * Assemble production SQLite `RecallDeps`.
 *
 * Returns `{ factStore: SqliteFactStore, clock: ClockProvider }` — pass directly
 * to `recall()` / `recallWithScores()`.
 *
 * @param db       An already-opened, migration-applied `Database` handle from
 *                 `openDatabase()`.  This factory does not open or close the DB.
 * @param options  Optional overrides; `logger` is forwarded to `SqliteFactStore`
 *                 and set on the returned `RecallDeps` so the same logger handles
 *                 both FTS parse-error warnings and attention-tier warnings.
 */
export function createSqliteRecallDeps(
  db: Database.Database,
  options?: { logger?: { warn(msg: string): void } },
): RecallDeps {
  const logger = options?.logger;
  return {
    factStore: new SqliteFactStore(db, logger),
    clock: systemClock,
    ...(logger ? { logger } : {}),
  };
}

/**
 * Assemble production SQLite `ApplyFeedbackDeps`.
 *
 * Also structurally satisfies `ApplyFeedbackByIdDeps` (same shape today).
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

/** Production IdProvider — crypto.randomUUID() branded as FactId. */
const cryptoIdProvider = { next: (): FactId => randomUUID() as FactId };

/**
 * Assemble production SQLite `ImprintDeps`.
 *
 * @param db  An already-opened, migration-applied Database handle from openDatabase().
 */
export function createSqliteImprintDeps(db: Database.Database): ImprintDeps {
  return {
    factWriter: new SqliteFactWriter(db),
    clock: systemClock,
    idProvider: cryptoIdProvider,
  };
}
