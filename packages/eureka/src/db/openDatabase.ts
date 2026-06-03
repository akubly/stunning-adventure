import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import { applyMigrations } from './schema.js';

const _require = createRequire(import.meta.url);

/**
 * Open (or create) the Eureka SQLite database at `dbPath`.
 *
 * - Creates the parent directory if it does not exist.
 * - Enables WAL journal mode for concurrent read performance; warns to stderr if unavailable.
 * - Sets busy_timeout=5000ms so concurrent writers retry before failing.
 * - Runs all pending migrations via `applyMigrations`.
 *
 * Default path: `~/.eureka/eureka.db` — mirrors Cairn's ~/.cairn/cairn.db convention;
 * each Eureka instance owns its own DB file.
 *
 * Requires `better-sqlite3` (optionalDependency). Throws with a clear message if missing.
 */
export function openDatabase(
  dbPath: string = path.join(os.homedir(), '.eureka', 'eureka.db'),
): Database.Database {
  let DatabaseCtor: typeof Database;
  try {
    DatabaseCtor = _require('better-sqlite3') as typeof Database;
  } catch {
    throw new Error(
      '[eureka] better-sqlite3 is not installed. SQLite storage requires this native ' +
        'module. Install it with: npm install better-sqlite3',
    );
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseCtor(dbPath);
  const walMode = db.pragma('journal_mode = WAL', { simple: true }) as string;
  if (walMode !== 'wal') {
    process.stderr.write(
      `[eureka] WAL mode not available (got '${walMode}'); database opened in ${walMode} journal mode\n`,
    );
  }
  db.pragma('busy_timeout = 5000');
  applyMigrations(db);
  return db;
}
