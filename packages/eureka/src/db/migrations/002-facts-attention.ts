import type { Migration } from '../schema.js';

export const migration002: Migration = {
  version: 2,
  description: 'attention tier columns (importance, last_accessed, attention_tier)',
  up(db) {
    db.exec(`
      -- M8 Slice D++: add attention-tier columns to facts.
      --
      -- Defaults match SqliteFactStore hard-coded Slice-C behaviour exactly:
      --   importance     = 0        → compositeScore importance term = 0
      --   last_accessed  = NULL     → tDays=Infinity → recency floors to 0.1 (F3)
      --   attention_tier = 'warm'   → ATTENTION_MULTIPLIERS['warm'] = 1.0 (identity)
      --
      -- ORDER BY is unchanged: (-bm25_score) * f.trust DESC, f.id ASC (D2, locked).
      -- No backfill needed: existing rows receive defaults that reproduce current behaviour.
      --
      -- SQLite ADD COLUMN supports CHECK with a constant default (verified).
      -- The CHECK is enforced on all future INSERTs/UPDATEs; existing rows are not
      -- validated at ALTER time (safe: 'warm' would pass anyway).
      ALTER TABLE facts ADD COLUMN importance     REAL    NOT NULL DEFAULT 0;
      ALTER TABLE facts ADD COLUMN last_accessed  INTEGER          DEFAULT NULL;
      ALTER TABLE facts ADD COLUMN attention_tier TEXT    NOT NULL DEFAULT 'warm'
        CHECK (attention_tier IN ('hot', 'warm', 'cold'));
    `);
  },
};
