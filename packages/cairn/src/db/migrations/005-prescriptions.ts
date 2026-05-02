import type { Migration } from '../schema.js';

export const migration005: Migration = {
  version: 5,
  description: 'Prescriptions table with 8-state lifecycle and prescriber_state singleton',
  up(db) {
    db.exec(`
      CREATE TABLE prescriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        -- Source
        insight_id INTEGER NOT NULL REFERENCES insights(id),
        pattern_type TEXT NOT NULL CHECK (pattern_type IN ('recurring_error', 'error_sequence', 'skip_frequency')),

        -- Content
        title TEXT NOT NULL,
        rationale TEXT NOT NULL,
        proposed_change TEXT NOT NULL,
        target_path TEXT,
        artifact_type TEXT,
        artifact_scope TEXT CHECK (artifact_scope IN ('user', 'project', 'plugin')),

        -- Lifecycle (DP2: 8 states)
        status TEXT NOT NULL DEFAULT 'generated'
          CHECK (status IN (
            'generated', 'accepted', 'rejected', 'deferred',
            'applied', 'failed', 'expired', 'suppressed'
          )),

        -- Scoring (DP5: priority formula)
        confidence REAL NOT NULL DEFAULT 0.0
          CHECK (confidence >= 0.0 AND confidence <= 1.0),
        priority_score REAL NOT NULL DEFAULT 0.0,
        recency_weight REAL NOT NULL DEFAULT 1.0,
        availability_factor REAL NOT NULL DEFAULT 1.0,

        -- Disposition tracking
        disposition_reason TEXT,
        defer_count INTEGER NOT NULL DEFAULT 0,
        defer_until_session INTEGER,

        -- Timestamps
        generated_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        applied_at TEXT,
        expires_at TEXT
      );

      CREATE INDEX idx_prescriptions_status ON prescriptions(status);
      CREATE INDEX idx_prescriptions_insight ON prescriptions(insight_id);
      CREATE INDEX idx_prescriptions_priority ON prescriptions(status, priority_score DESC);

      CREATE TABLE prescriber_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_generated_at TEXT,
        pending_count INTEGER NOT NULL DEFAULT 0,
        sessions_since_install INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      INSERT INTO prescriber_state (id) VALUES (1);
    `);
  },
};
