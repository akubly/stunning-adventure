import type { Migration } from '../schema.js';

export const migration010: Migration = {
  version: 10,
  description: 'DBOM artifact persistence for export pipeline',
  up(db) {
    db.exec(`
      CREATE TABLE dbom_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '0.1.0',
        root_hash TEXT NOT NULL,
        total_decisions INTEGER NOT NULL,
        human_gated_decisions INTEGER NOT NULL,
        machine_decisions INTEGER NOT NULL,
        ai_recommended_decisions INTEGER NOT NULL,
        chain_depth INTEGER NOT NULL,
        chain_roots INTEGER NOT NULL,
        decision_types TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE dbom_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dbom_id INTEGER NOT NULL REFERENCES dbom_artifacts(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        hash TEXT NOT NULL,
        parent_hash TEXT,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('human', 'automated_rule', 'ai_recommendation')),
        summary TEXT NOT NULL,
        details TEXT NOT NULL
      );

      CREATE UNIQUE INDEX idx_dbom_session ON dbom_artifacts(session_id);
      CREATE INDEX idx_dbom_root_hash ON dbom_artifacts(root_hash);
      CREATE INDEX idx_dbom_decisions_dbom_id ON dbom_decisions(dbom_id);
      CREATE UNIQUE INDEX idx_dbom_decisions_seq ON dbom_decisions(dbom_id, seq);
    `);
  },
};
