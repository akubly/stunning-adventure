import type { Migration } from '../schema.js';

export const migration012: Migration = {
  version: 12,
  description: 'Phase 4.6: change_vectors table for prescription learning',
  up(db) {
    db.exec(`
      -- Prescription change vectors: delta between metric snapshots before/after a hint is applied.
      -- Computed by the Curator sweep; consumed by prescribers for impact ranking and confidence boost.
      CREATE TABLE change_vectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hint_id TEXT NOT NULL REFERENCES optimization_hints(id) ON DELETE CASCADE,
        -- Metric deltas (after - before), cost normalized to per-session
        delta_drift REAL NOT NULL,
        delta_cost REAL NOT NULL,
        delta_success_rate REAL NOT NULL,
        delta_convergence REAL NOT NULL,
        delta_cache_hit REAL NOT NULL,
        -- Weighted impact (positive = prescription improved things)
        net_impact REAL NOT NULL,
        -- Sessions between hint application and vector computation (delta, not cumulative)
        sessions_observed INTEGER NOT NULL,
        computed_at TEXT NOT NULL,
        UNIQUE(hint_id)
      );

      -- No explicit index on hint_id: UNIQUE(hint_id) above already creates an
      -- implicit sqlite_autoindex covering the same lookup path.
      CREATE INDEX idx_change_vectors_impact ON change_vectors(net_impact);
    `);
  },
};
