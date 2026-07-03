/**
 * @akubly/eureka/sqlite — SQLite storage subpath.
 *
 * Import from this subpath to access SQLite-backed storage. Importing from
 * the main `@akubly/eureka` entry point does NOT pull in SQLite or
 * better-sqlite3, keeping the core package lightweight for in-memory consumers.
 *
 * Requires `better-sqlite3` (optionalDependency). If not installed,
 * `openDatabase` throws with a clear installation message.
 */

export { SqliteFactReader } from '../storage/fact-reader-sqlite.js';
export { SqliteTrustUpdater } from '../storage/trust-updater-sqlite.js';
export { SqliteFactStore } from '../storage/fact-store-sqlite.js';
export { SqliteFactWriter } from '../storage/fact-writer-sqlite.js';
export { SqliteRelationWriter } from '../storage/relation-writer-sqlite.js';
export { openDatabase } from '../db/openDatabase.js';
export { applyMigrations } from '../db/schema.js';
export { createSqliteRecallDeps, createSqliteFeedbackDeps, createSqliteImprintDeps, createSqliteRelationWriter, createSqliteIntegrateDeps } from './deps.js';
export { CursorScopeMismatchError, CursorVersionUnsupportedError } from '../storage/errors.js';
