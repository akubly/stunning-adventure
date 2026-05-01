import type Database from 'better-sqlite3';
import { migration001 } from './migrations/001-initial.js';
import { migration002 } from './migrations/002-curator-state.js';
import { migration003 } from './migrations/003-insights.js';
import { migration004 } from './migrations/004-event-log-index.js';
import { migration005 } from './migrations/005-prescriptions.js';
import { migration006 } from './migrations/006-managed-artifacts.js';
import { migration007 } from './migrations/007-topology-cache.js';
import { migration008 } from './migrations/008-nullable-prescription-id.js';
import { migration009 } from './migrations/009-skill-test-results.js';
import { migration010 } from './migrations/010-dbom-artifacts.js';

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [migration001, migration002, migration003, migration004, migration005, migration006, migration007, migration008, migration009, migration010];

export function applyMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      description TEXT
    )
  `);

  const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as
    | { version: number | null }
    | undefined;
  const currentVersion = row?.version ?? 0;

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version, description) VALUES (?, ?)').run(
          migration.version,
          migration.description,
        );
      })();
    }
  }
}
