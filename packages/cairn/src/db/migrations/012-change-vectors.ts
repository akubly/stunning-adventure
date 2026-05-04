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
        hint_id TEXT NOT NULL REFERENCES optimization_hints(id),
        -- Metric deltas (after - before)
        delta_drift REAL NOT NULL,
        delta_cost REAL NOT NULL,
        delta_success_rate REAL NOT NULL,
        delta_convergence REAL NOT NULL,
        delta_cache_hit REAL NOT NULL,
        -- Weighted impact (positive = prescription improved things)
        net_impact REAL NOT NULL,
        -- Sessions between before/after snapshot
        sessions_observed INTEGER NOT NULL,
        computed_at TEXT NOT NULL
      );

      CREATE INDEX idx_change_vectors_hint ON change_vectors(hint_id);
      CREATE INDEX idx_change_vectors_impact ON change_vectors(net_impact);
    `);
  },
};
