import type { Migration } from '../schema.js';

export const migration006: Migration = {
  version: 6,
  description: 'Managed artifacts table for rollback and drift detection',
  up(db) {
    db.exec(`
      CREATE TABLE managed_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        logical_id TEXT,
        scope TEXT NOT NULL CHECK (scope IN ('user', 'project', 'plugin')),
        prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
        original_checksum TEXT,
        current_checksum TEXT,
        rollback_content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE UNIQUE INDEX idx_managed_artifacts_path ON managed_artifacts(path);
      CREATE INDEX idx_managed_artifacts_prescription ON managed_artifacts(prescription_id);
    `);
  },
};
