import type { Migration } from '../schema.js';

export const migration003: Migration = {
  version: 3,
  description: 'Insights table for Curator pattern detection',
  up(db) {
    db.exec(`
      CREATE TABLE insights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL CHECK (pattern_type IN ('recurring_error', 'error_sequence', 'skip_frequency')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        evidence TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stale', 'pruned')),
        occurrence_count INTEGER NOT NULL DEFAULT 1,
        prescription TEXT,
        first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX idx_insights_pattern_title ON insights(pattern_type, title);
      CREATE INDEX idx_insights_status ON insights(status);
    `);
  },
};
