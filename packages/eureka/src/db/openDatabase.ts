import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { applyMigrations } from './schema.js';

/**
 * Open (or create) the Eureka SQLite database at `dbPath`.
 *
 * - Creates the parent directory if it does not exist.
 * - Enables WAL journal mode for concurrent read performance.
 * - Runs all pending migrations via `applyMigrations`.
 *
 * Default path: `~/.eureka/eureka.db` (Aaron's Q3 decision).
 */
export function openDatabase(
  dbPath: string = path.join(os.homedir(), '.eureka', 'eureka.db'),
): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  applyMigrations(db);
  return db;
}
