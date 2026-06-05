import type Database from 'better-sqlite3';
import { migration001 } from './migrations/001-facts.js';

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [migration001];

export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT
    )
  `);

  // BEGIN IMMEDIATE serializes two simultaneous first-opens on the same DB file:
  // both processes see schema_version created above, but only one wins the
  // IMMEDIATE lock and applies pending migrations; the second reads version=N
  // and finds nothing to do.
  db.transaction(() => {
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as
      | { version: number | null }
      | undefined;
    const currentVersion = row?.version ?? 0;

    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)').run(
          migration.version,
          migration.description,
        );
      }
    }
  }).immediate();
}
