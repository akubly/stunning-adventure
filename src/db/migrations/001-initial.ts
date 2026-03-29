import type { Migration } from '../schema.js';

export const migration001: Migration = {
  version: 1,
  description: 'Initial schema: sessions, preferences, skip_breadcrumbs, errors, event_log',
  up(db) {
    db.exec(`
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        repo_key TEXT NOT NULL,
        branch TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        status TEXT NOT NULL DEFAULT 'active'
      );

      CREATE TABLE preferences (
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT 'user',
        session_id TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (key, scope, session_id)
      );

      CREATE TABLE skip_breadcrumbs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        what_skipped TEXT NOT NULL,
        reason TEXT,
        agent TEXT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        root_cause TEXT,
        prescription TEXT,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  },
};
