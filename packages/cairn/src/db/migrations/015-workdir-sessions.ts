import type { Migration } from '../schema.js';

export const migration015: Migration = {
  version: 15,
  description: 'Wave 7.1: workdir-aware sessions',
  up(db) {
    db.exec(`ALTER TABLE sessions ADD COLUMN workdir TEXT`);

    // Partial index on active sessions by (repo_key, workdir) — used by
    // getActiveSession when a workdir is provided, and by listActiveSessionsForRepo.
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_repo_workdir
        ON sessions (repo_key, workdir)
        WHERE status = 'active';
    `);
  },
};
