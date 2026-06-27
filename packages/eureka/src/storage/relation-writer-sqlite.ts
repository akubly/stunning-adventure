/**
 * SqliteRelationWriter — SQLite-backed RelationWriter for `@akubly/eureka`.
 *
 * Writes edges to the `fact_relations` table introduced by migration 003.
 * Uses `ON CONFLICT(session_id, from_fact_id, to_fact_id, relation_kind)
 * DO NOTHING` for first-write-wins idempotency scoped to the UNIQUE
 * constraint only — mirrors SqliteFactWriter F1.
 *
 * ## Idempotency mechanism
 *
 * Only the UNIQUE constraint violation is suppressed. CHECK violations on
 * `relation_kind` (invalid vocabulary) and NOT NULL violations still throw.
 *
 * ## DB lifecycle
 *
 * Caller injects an already-opened, migration-applied Database handle. This
 * class does not open or close the database.
 */

import type Database from 'better-sqlite3';
import type { RelationWriter } from './relation-writer.types.js';
import type { Relation, RelationEdge } from '../representation/relation.js';
import { validateRelation, edgeToRelation } from '../representation/relation.js';

export class SqliteRelationWriter implements RelationWriter {
  private readonly db: Database.Database;
  private readonly stmt: Database.Statement<{
    from_fact_id: string;
    to_fact_id: string;
    relation_kind: string;
    session_id: string;
    weight: number;
    confidence: number;
  }>;

  constructor(db: Database.Database) {
    this.db = db;
    this.stmt = db.prepare(`
      INSERT INTO fact_relations
        (from_fact_id, to_fact_id, relation_kind, session_id, weight, confidence)
      VALUES
        ($from_fact_id, $to_fact_id, $relation_kind, $session_id, $weight, $confidence)
      ON CONFLICT(session_id, from_fact_id, to_fact_id, relation_kind) DO NOTHING
    `);
  }

  async link(rel: Relation): Promise<void> {
    validateRelation(rel);

    this.stmt.run({
      from_fact_id: rel.fromFactId as string,
      to_fact_id: rel.toFactId as string,
      relation_kind: rel.relationKind,
      session_id: rel.sessionId as string,
      weight: rel.weight ?? 1.0,
      confidence: rel.confidence ?? 1.0,
    });
  }

  /**
   * Batch-persist edges from the activity layer. Wraps the per-edge INSERT
   * in a single transaction so an invalid edge mid-batch rolls the whole
   * batch back (parity with InMemoryRelationWriter's all-or-nothing validation).
   * Returns the sum of `changes` from each statement — i.e. the count of
   * rows actually inserted after `ON CONFLICT DO NOTHING` swallows duplicates.
   */
  async writeEdges(edges: ReadonlyArray<RelationEdge>): Promise<number> {
    // Validate every edge BEFORE running any statement — same pre-await
    // posture as InMemoryRelationWriter.writeEdges. Uses the shared
    // `edgeToRelation` helper so both writer impls translate identically.
    const relations: Relation[] = edges.map(edgeToRelation);
    for (const rel of relations) validateRelation(rel);

    const stmt = this.stmt;
    const runBatch = this.db.transaction((rels: Relation[]): number => {
      let inserted = 0;
      for (const rel of rels) {
        const r = stmt.run({
          from_fact_id: rel.fromFactId as string,
          to_fact_id: rel.toFactId as string,
          relation_kind: rel.relationKind,
          session_id: rel.sessionId as string,
          weight: rel.weight ?? 1.0,
          confidence: rel.confidence ?? 1.0,
        });
        // r.changes === 1 on insert, 0 when ON CONFLICT DO NOTHING fired.
        inserted += r.changes;
      }
      return inserted;
    });

    return runBatch(relations);
  }
}
