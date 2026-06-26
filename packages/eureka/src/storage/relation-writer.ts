/**
 * InMemoryRelationWriter — in-memory RelationWriter implementation.
 *
 * Used by tests where SQLite is unnecessary overhead and by the in-memory
 * wiring of `runRelationWriterContract`. Mirrors `InMemoryFactWriter`:
 *
 * - First-write-wins on (sessionId, fromFactId, toFactId, relationKind).
 * - Session-scoped reads via the test-only `listBySession` side-channel.
 * - Validation runs synchronously before the first await, identically to the
 *   activity-layer pattern (imprint.ts).
 */

import type { SessionId } from '@akubly/types';
import type { RelationWriter } from './relation-writer.types.js';
import type { Relation, RelationKind, RelationEdge } from '../representation/relation.js';
import { validateRelation, edgeToRelation } from '../representation/relation.js';
import { epochMsToSqliteDateTime } from './datetime.js';

/**
 * @internal — test-only side-channel return type, matches the columns the
 * sqlite writer persists. Stable shape so the shared contract harness can
 * assert against either backend.
 */
export interface StoredRelation {
  fromFactId: string;
  toFactId: string;
  relationKind: RelationKind;
  sessionId: string;
  weight: number;
  confidence: number;
  /** SQLite datetime TEXT ('YYYY-MM-DD HH:MM:SS', UTC; not ISO-8601 — no 'T'/offset) for parity with sqlite. */
  createdAt: string;
}

function storeKey(
  sessionId: string,
  fromFactId: string,
  toFactId: string,
  relationKind: string,
): string {
  return `${sessionId}\0${fromFactId}\0${toFactId}\0${relationKind}`;
}

export class InMemoryRelationWriter implements RelationWriter {
  private readonly store = new Map<string, StoredRelation>();
  /** Injected wall-clock for deterministic createdAt in tests. */
  private readonly nowMs: () => number;

  constructor(nowMs: () => number = () => Date.now()) {
    this.nowMs = nowMs;
  }

  async link(rel: Relation): Promise<void> {
    validateRelation(rel);

    const key = storeKey(
      rel.sessionId as string,
      rel.fromFactId as string,
      rel.toFactId as string,
      rel.relationKind,
    );

    // First-write-wins idempotency — mirrors SQL ON CONFLICT DO NOTHING.
    if (this.store.has(key)) return;

    this.store.set(key, {
      fromFactId: rel.fromFactId as string,
      toFactId: rel.toFactId as string,
      relationKind: rel.relationKind,
      sessionId: rel.sessionId as string,
      weight: rel.weight ?? 1.0,
      confidence: rel.confidence ?? 1.0,
      createdAt: epochMsToSqliteDateTime(this.nowMs()),
    });
  }

  /**
   * Test-only side-channel: read a single relation by its composite key.
   * Returns null when no such relation exists.
   */
  async readRelation(args: {
    fromFactId: string;
    toFactId: string;
    relationKind: RelationKind;
    sessionId: SessionId;
  }): Promise<StoredRelation | null> {
    const key = storeKey(
      args.sessionId as string,
      args.fromFactId,
      args.toFactId,
      args.relationKind,
    );
    return this.store.get(key) ?? null;
  }

  /**
   * Test-only side-channel: list all relations scoped to a session. Mirrors
   * what SqliteRelationWriter could provide via a SELECT; lets the contract
   * harness assert isolation and counts.
   */
  async listBySession(sessionId: SessionId): Promise<StoredRelation[]> {
    return [...this.store.values()].filter(r => r.sessionId === (sessionId as string));
  }

  /**
   * Test-only side-channel mirroring the SQL view of the relations table —
   * used by the integrate-activity in-memory harness. Returns one row per
   * stored edge with the activity-facing field names (`fromFactId`,
   * `toFactId`, `edgeType`, `sessionId`). Ordered by (toFactId, fromFactId)
   * to match the sqlite harness's deterministic ORDER BY.
   */
  async listEdges(
    sessionId: SessionId,
  ): Promise<ReadonlyArray<{ fromFactId: string; toFactId: string; sessionId: SessionId; edgeType: 'duplicate_of' }>> {
    const sid = sessionId as string;
    return [...this.store.values()]
      .filter(r => r.sessionId === sid && r.relationKind === 'duplicate_of')
      .sort((a, b) =>
        a.toFactId === b.toFactId
          ? a.fromFactId.localeCompare(b.fromFactId)
          : a.toFactId.localeCompare(b.toFactId),
      )
      .map(r => ({
        fromFactId: r.fromFactId,
        toFactId: r.toFactId,
        sessionId: r.sessionId as SessionId,
        edgeType: 'duplicate_of' as const,
      }));
  }

  /**
   * Batch-persist edges from the activity layer (integrate). Maps the
   * `RelationEdge` shape (from/to/edgeType) to the internal `Relation` shape
   * (fromFactId/toFactId/relationKind) via the shared `edgeToRelation` helper,
   * validates each edge, and inserts.
   * Returns the COUNT of edges actually inserted (post-idempotency).
   */
  async writeEdges(edges: ReadonlyArray<RelationEdge>): Promise<number> {
    // Validate every edge BEFORE persisting any — mirrors the imprint F1
    // pre-await validation posture so an invalid edge in position N does not
    // leave 0..N-1 persisted.
    const relations: Relation[] = edges.map(edgeToRelation);
    for (const rel of relations) validateRelation(rel);

    let inserted = 0;
    for (const rel of relations) {
      const key = storeKey(
        rel.sessionId as string,
        rel.fromFactId as string,
        rel.toFactId as string,
        rel.relationKind,
      );
      if (this.store.has(key)) continue; // first-write-wins → no count bump
      this.store.set(key, {
        fromFactId: rel.fromFactId as string,
        toFactId: rel.toFactId as string,
        relationKind: rel.relationKind,
        sessionId: rel.sessionId as string,
        weight: 1.0,
        confidence: 1.0,
        createdAt: epochMsToSqliteDateTime(this.nowMs()),
      });
      inserted++;
    }
    return inserted;
  }
}
