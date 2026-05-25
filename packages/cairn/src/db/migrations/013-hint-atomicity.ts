import type { Migration } from '../schema.js';

export const migration013: Migration = {
  version: 13,
  description: 'Wave 4.1: partial UNIQUE index for insertHintIfNew atomicity',
  up(db) {
    db.exec(`
      -- Deployed databases may already contain duplicate active hints from the
      -- race this migration closes. Expire all but the newest row per active
      -- (skill_id, source, category) tuple before creating the unique index.
      WITH ranked_active_hints AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY skill_id, source, category
            ORDER BY created_at DESC, id DESC
          ) AS active_rank
        FROM optimization_hints
        -- KEEP IN SYNC: ACTIVE_HINT_STATUSES in packages/cairn/src/db/optimizationHints.ts. Future status additions MUST update both.
        WHERE status IN ('pending', 'accepted', 'deferred')
      )
      UPDATE optimization_hints
         SET status = 'expired'
       WHERE id IN (
         SELECT id FROM ranked_active_hints WHERE active_rank > 1
       );

      -- Partial UNIQUE index on active hints to enforce atomicity.
      -- Prevents race conditions when multiple callers try to insert
      -- the same (skill_id, source, category) at once.
      CREATE UNIQUE INDEX idx_optimization_hints_active_dedup
        ON optimization_hints(skill_id, source, category)
        -- KEEP IN SYNC: ACTIVE_HINT_STATUSES in packages/cairn/src/db/optimizationHints.ts. Future status additions MUST update both.
        WHERE status IN ('pending', 'accepted', 'deferred');
    `);
  },
};
