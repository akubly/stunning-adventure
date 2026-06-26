/**
 * Database connection manager for knowledge.db.
 *
 * Uses better-sqlite3 for synchronous, high-performance SQLite access.
 * WAL mode is enabled for concurrent read support.
 * busy_timeout is set to 5 s so a second writer (e.g. forge-run-session running
 * concurrently with an interactive Copilot session) retries rather than throwing
 * SQLITE_BUSY immediately.
 */

import Database from 'better-sqlite3';
import { getKnowledgeDbPath } from '../config/paths.js';
import { applyMigrations } from './schema.js';
import fs from 'node:fs';
import path from 'node:path';

let db: Database.Database | null = null;

/**
 * Get the singleton database connection. Creates and initialises it on first call.
 * Pass a custom `dbPath` (e.g. `':memory:'`) for testing.
 */
export function getDb(dbPath?: string): Database.Database {
  if (!db) {
    const resolvedPath = dbPath ?? getKnowledgeDbPath();

    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }

    db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    // Applied globally — affects ALL opens including the migration runner. That is
    // acceptable because migrations are fast and idempotent; 5 s covers typical
    // interleaved forge-run-session/interactive usage without hanging indefinitely.
    // If startup hangs ~5 s, revisit this global default (configurability deferred).
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');

    // T1 threat mitigation — restrict file permissions on Unix
    if (resolvedPath !== ':memory:' && process.platform !== 'win32') {
      fs.chmodSync(resolvedPath, 0o600);
    }

    applyMigrations(db);
  }
  return db;
}

/** Close the database connection and reset the singleton. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
