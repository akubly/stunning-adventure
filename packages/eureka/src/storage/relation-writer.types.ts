/**
 * RelationWriter — write seam for fact-to-fact edges (§20 §2.2).
 *
 * Implementations: SqliteRelationWriter, InMemoryRelationWriter.
 * Verified by: runRelationWriterContract() shared suite.
 *
 * ## Contract guarantees
 *
 * - `link()` MUST persist the edge durably before resolving.
 * - `link()` MUST be idempotent on (sessionId, fromFactId, toFactId, relationKind):
 *   first write wins; subsequent identical writes are no-ops, no errors.
 * - `link()` MUST scope state by sessionId — relations are session-local in v1.
 * - `link()` MUST validate inputs via `validateRelation()` BEFORE any storage
 *   call (mirrors the FactWriter / imprint pre-await validation discipline).
 * - When `weight` or `confidence` are omitted, the underlying storage default
 *   (1.0, per migration 003) is applied.
 *
 * ## writeEdges (wave-2 integrate seam)
 *
 * `writeEdges(edges)` is the batch, activity-facing form. It accepts the
 * narrower `RelationEdge` shape (from/to/edgeType/sessionId), maps it to a
 * `Relation`, validates each edge, and returns the COUNT OF ROWS ACTUALLY
 * INSERTED — that is, rows whose UNIQUE-key did NOT already exist. The
 * caller (integrate) uses this count for its `edgesWritten` report so a
 * clean re-run reports 0 even though the algorithm proposed the same edges.
 *
 * ## Idempotency mechanism (parity with FactWriter F1)
 *
 * Sqlite: `INSERT … ON CONFLICT(session_id, from_fact_id, to_fact_id, relation_kind)
 * DO NOTHING`. Only the UNIQUE-constraint violation is suppressed; CHECK
 * (relation_kind vocabulary) and NOT NULL violations still throw.
 *
 * In-memory: composite-key Map with first-write-wins on `Map.has(key)`.
 */

import type { Relation, RelationEdge } from '../representation/relation.js';

export interface RelationWriter {
  /**
   * Persist a single relation. Validates inputs first; throws
   * InvalidRelationError on bad input (synchronous, pre-await). Idempotent
   * on the UNIQUE key.
   */
  link(rel: Relation): Promise<void>;

  /**
   * Batch-persist edges from the activity layer (integrate). Returns the
   * number of rows ACTUALLY inserted (post-ON CONFLICT) — a clean re-run
   * of an idempotent operation returns 0.
   *
   * Validation runs per-edge before the batch write begins; an invalid
   * edge throws and aborts the batch (no partial writes for sqlite, which
   * wraps the loop in a transaction).
   */
  writeEdges(edges: ReadonlyArray<RelationEdge>): Promise<number>;
}
