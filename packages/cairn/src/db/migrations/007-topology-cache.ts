import type { Migration } from '../schema.js';

export const migration007: Migration = {
  version: 7,
  description: 'Topology cache table for artifact discovery scanner',
  up(db) {
    db.exec(`
      CREATE TABLE topology_cache (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        topology_json TEXT NOT NULL,
        scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
        scan_duration_ms INTEGER NOT NULL DEFAULT 0
      );
    `);
  },
};
