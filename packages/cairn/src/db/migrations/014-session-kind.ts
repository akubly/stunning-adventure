import type { Migration } from '../schema.js';

// Deliberately inlined: migrations are historical snapshots and should not import mutable runtime constants.
const SYSTEM_SESSION_REPO_KEY = '__system__';

export const migration014: Migration = {
  version: 14,
  description: 'Wave 5.1: separate user and system sessions',
  up(db) {
    db.exec(`
      ALTER TABLE sessions
        ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'user'
        CHECK (session_kind IN ('user', 'system'));
    `);

    db.prepare('UPDATE sessions SET session_kind = ? WHERE repo_key = ?').run(
      'system',
      SYSTEM_SESSION_REPO_KEY,
    );
  },
};
