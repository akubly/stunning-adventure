import type { Migration } from '../schema.js';

export const migration011: Migration = {
  version: 11,
  description: 'Telemetry feedback loop: signal samples, execution profiles, optimization hints',
  up(db) {
    db.exec(`
      -- Raw signal samples (7-day TTL, capped at 10K rows; sweep + cap enforced by Curator)
      CREATE TABLE signal_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('drift', 'token', 'outcome')),
        session_id TEXT NOT NULL,
        skill_id TEXT,
        value REAL NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        collected_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_signal_samples_kind ON signal_samples(kind);
      CREATE INDEX idx_signal_samples_session ON signal_samples(session_id);
      CREATE INDEX idx_signal_samples_skill ON signal_samples(skill_id);
      CREATE INDEX idx_signal_samples_collected ON signal_samples(collected_at);

      -- Aggregated execution profiles (PGO equivalent)
      CREATE TABLE execution_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        granularity TEXT NOT NULL CHECK (
          granularity IN ('per-skill', 'per-user', 'per-model', 'global')
        ),
        granularity_key TEXT NOT NULL DEFAULT 'global',
        session_count INTEGER NOT NULL DEFAULT 0,
        drift_mean REAL NOT NULL DEFAULT 0,
        drift_p50 REAL NOT NULL DEFAULT 0,
        drift_p95 REAL NOT NULL DEFAULT 0,
        drift_trend TEXT NOT NULL DEFAULT 'stable'
          CHECK (drift_trend IN ('improving', 'stable', 'degrading')),
        token_mean_input REAL NOT NULL DEFAULT 0,
        token_mean_output REAL NOT NULL DEFAULT 0,
        token_mean_cache_hit REAL NOT NULL DEFAULT 0,
        token_total_cost INTEGER NOT NULL DEFAULT 0,
        outcome_success_rate REAL NOT NULL DEFAULT 0,
        outcome_mean_convergence REAL NOT NULL DEFAULT 0,
        outcome_tool_error_rate REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE UNIQUE INDEX idx_execution_profiles_key
        ON execution_profiles(skill_id, granularity, granularity_key);

      -- Optimization hints (prescriptions with impact scoring)
      CREATE TABLE optimization_hints (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('prompt-optimizer', 'token-optimizer')),
        skill_id TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        impact_score REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        evidence TEXT NOT NULL DEFAULT '{}',
        parent_prescription_id TEXT,
        metric_snapshot TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending', 'accepted', 'applied', 'rejected',
            'deferred', 'expired', 'suppressed', 'failed'
          )),
        generated_at TEXT NOT NULL,
        applied_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_optimization_hints_skill ON optimization_hints(skill_id);
      CREATE INDEX idx_optimization_hints_status ON optimization_hints(status);
      CREATE INDEX idx_optimization_hints_source ON optimization_hints(source);
      CREATE INDEX idx_optimization_hints_parent ON optimization_hints(parent_prescription_id);
    `);
  },
};
