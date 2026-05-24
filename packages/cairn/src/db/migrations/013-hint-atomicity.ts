import type { Migration } from '../schema.js';

export const migration013: Migration = {
  version: 13,
  description: 'Wave 4.1: partial UNIQUE index for insertHintIfNew atomicity',
  up(db) {
    db.exec(`
      -- Partial UNIQUE index on active hints to enforce atomicity.
      -- Prevents race conditions when multiple callers try to insert
      -- the same (skill_id, source, category) at once.
      CREATE UNIQUE INDEX idx_optimization_hints_active_dedup
        ON optimization_hints(skill_id, source, category)
        WHERE status IN ('pending', 'accepted', 'deferred');
    `);
  },
};
