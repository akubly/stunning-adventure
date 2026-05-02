import type { Migration } from '../schema.js';

export const migration008: Migration = {
  version: 8,
  description: 'Make managed_artifacts.prescription_id nullable for rollback orphan state',
  up(db) {
    // SQLite doesn't support ALTER COLUMN, so recreate the table.
    db.exec(`
      CREATE TABLE managed_artifacts_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        logical_id TEXT,
        scope TEXT NOT NULL CHECK (scope IN ('user', 'project', 'plugin')),
        prescription_id INTEGER REFERENCES prescriptions(id),
        original_checksum TEXT,
        current_checksum TEXT,
        rollback_content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO managed_artifacts_new
        SELECT * FROM managed_artifacts;

      DROP TABLE managed_artifacts;

      ALTER TABLE managed_artifacts_new RENAME TO managed_artifacts;

      CREATE UNIQUE INDEX idx_managed_artifacts_path ON managed_artifacts(path);
      CREATE INDEX idx_managed_artifacts_prescription ON managed_artifacts(prescription_id);
    `);
  },
};
