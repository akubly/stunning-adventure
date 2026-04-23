import type { Migration } from '../schema.js';

export const migration002: Migration = {
  version: 2,
  description: 'Curator state: singleton cursor for event processing',
  up(db) {
    db.exec(`
      CREATE TABLE curator_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_processed_event_id INTEGER NOT NULL DEFAULT 0,
        last_run_at TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO curator_state (id, last_processed_event_id) VALUES (1, 0);
    `);
  },
};
