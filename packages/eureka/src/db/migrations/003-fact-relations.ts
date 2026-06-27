import type { Migration } from '../schema.js';

/**
 * Migration 003 — fact_relations table.
 *
 * Adds the cross-reference substrate for the `integrate` consolidation activity
 * (Genesta wave 2). v1 only ever WRITES `duplicate_of`, but the CHECK vocabulary
 * is locked at the four kinds the design panel agreed on so future relation
 * kinds can land without a schema migration.
 *
 * ## Design
 *
 * - Append-only graph. Facts table stays untouched — never mutate facts.content.
 * - Directed edge: `from_fact_id` → `to_fact_id`. Session-scoped (every v1
 *   invariant is session-local).
 * - Idempotency: UNIQUE(session_id, from_fact_id, to_fact_id, relation_kind)
 *   lets RelationWriter use `ON CONFLICT … DO NOTHING` for first-write-wins —
 *   the same F1 discipline as SqliteFactWriter for `facts`.
 * - Two predicate indices for cheap 1-hop traversal in either direction.
 * - `weight` and `confidence` REAL DEFAULT 1.0 — present in the schema (per
 *   §20 §2.2) but every v1 writer can rely on the default.
 * - No FK constraints — better-sqlite3 best practice (and we already follow it
 *   for facts.fact_id ↔ trust_history.fact_id). Orphan cleanup is a sweep
 *   concern (§30 §3.4), not a constraint concern.
 *
 * ## Relation kinds (CHECK constraint vocabulary)
 *
 *   duplicate_of  — fact A is a duplicate of fact B (v1: the only kind integrate writes)
 *   supersedes    — fact A supersedes fact B (newer, more correct version)
 *   contradicts   — fact A contradicts fact B (logical conflict)
 *   supports      — fact A supports fact B (evidential corroboration)
 *
 * Note the deliberate naming distinction from the existing FeedbackEvent
 * vocabulary (`corroboration` / `contradiction`) in activities/recall.ts:
 * those are single-fact trust deltas; these are inter-fact directed edges.
 */
export const migration003: Migration = {
  version: 3,
  description: 'fact_relations table (cross-reference substrate for integrate)',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fact_relations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        from_fact_id    TEXT    NOT NULL,
        to_fact_id      TEXT    NOT NULL,
        relation_kind   TEXT    NOT NULL
          CHECK (relation_kind IN ('duplicate_of', 'supersedes', 'contradicts', 'supports')),
        session_id      TEXT    NOT NULL,
        weight          REAL    NOT NULL DEFAULT 1.0,
        confidence      REAL    NOT NULL DEFAULT 1.0,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE (session_id, from_fact_id, to_fact_id, relation_kind)
      );

      CREATE INDEX IF NOT EXISTS idx_fact_relations_from
        ON fact_relations (session_id, from_fact_id, relation_kind);

      CREATE INDEX IF NOT EXISTS idx_fact_relations_to
        ON fact_relations (session_id, to_fact_id, relation_kind);
    `);
  },
};
