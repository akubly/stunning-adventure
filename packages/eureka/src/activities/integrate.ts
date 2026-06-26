/**
 * integrate — post-imprint consolidation activity.
 *
 * Activity: integrate (§10 §10.1 — Jungian post-imprint consolidation)
 * Seams:
 *   - FactReader.listBySession()  — read the session's facts (oldest first by createdAt)
 *   - RelationWriter.writeEdges() — persist duplicate_of edges
 *   - ClockProvider.now()         — wall-clock (reserved for future report metadata)
 *
 * ## What integrate does (v1)
 *
 * 1. Validate sessionId synchronously (throws InvalidIntegrateError pre-await).
 * 2. List the session's facts.
 * 3. O(n²) pair-scan on `.trim()`-equal content — semantically identical text
 *    is treated as a duplicate. Future v1.5+ widens this to embedding-distance
 *    or BM25-similarity; the activity boundary stays the same.
 * 4. For each duplicate group, the OLDEST fact (smallest createdAt) is the
 *    canonical; every newer duplicate gets a `duplicate_of` edge pointing back
 *    to that canonical. N-way duplicates form a STAR-TO-CANONICAL topology
 *    (all newer dups point to the single oldest) — NOT a chain.
 * 5. Batch-write the edges via `RelationWriter.writeEdges`; the count returned
 *    is the number ACTUALLY inserted (idempotent re-runs return 0 even though
 *    the algorithm proposes the same edges).
 * 6. Facts table is never mutated — consolidation is expressed entirely as
 *    new `fact_relations` rows. Append-only invariant locked in D-INT-9.
 */

import type { SessionId } from '@akubly/types';
import type { FactId } from './imprint.js';
import type { ClockProvider } from './clock.js';
import type { RelationEdge } from '../representation/relation.js';
import { InvalidIntegrateError } from './errors.js';

// ---------------------------------------------------------------------------
// Narrow seam types matching Genesta's locked contract
// ---------------------------------------------------------------------------

/**
 * The slice of `FactReader` integrate actually needs. Declared structurally
 * so test doubles can implement just `listBySession` without standing up
 * the full reader.
 */
export interface FactReaderListSession {
  listBySession(args: { sessionId: SessionId }): Promise<ReadonlyArray<{
    factId: FactId;
    content: string;
    createdAt: number;
  }>>;
}

/**
 * The slice of `RelationWriter` integrate actually needs. Structural so
 * test doubles can implement just `writeEdges`.
 */
export interface RelationWriterBatch {
  writeEdges(edges: ReadonlyArray<RelationEdge>): Promise<number>;
}

// ---------------------------------------------------------------------------
// Public contract types
// ---------------------------------------------------------------------------

export interface IntegrateOptions {
  sessionId: SessionId;
}

export interface IntegrateDeps {
  factReader: FactReaderListSession;
  relationWriter: RelationWriterBatch;
  clock: ClockProvider;
}

/** Pair of facts identified as duplicates: the canonical (kept) + the newer dup. */
export interface DuplicatePair {
  keptFactId: FactId;
  duplicateFactId: FactId;
}

/**
 * Per-run summary returned from `integrate()`. `edgesWritten` reflects
 * rows actually inserted by `RelationWriter.writeEdges` (post-idempotency).
 */
export interface IntegrationReport {
  sessionId: SessionId;
  factsScanned: number;
  duplicatesFound: number;
  edgesWritten: number;
  pairs: ReadonlyArray<DuplicatePair>;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate caller-supplied options. Synchronous, throws BEFORE any await
 * so dependency-failure paths cannot fire on bad input.
 */
function validateOptions(options: IntegrateOptions): void {
  const sid = options.sessionId;
  if (typeof sid !== 'string' || (sid as string).trim().length === 0) {
    throw new InvalidIntegrateError(
      'sessionId',
      sid,
      'integrate: sessionId must be a non-empty, non-blank string',
    );
  }
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/**
 * Run a post-imprint consolidation pass over the given session.
 *
 * @returns IntegrationReport summarising the scan: total facts scanned,
 *          duplicate pairs identified, and edges actually written.
 */
export async function integrate(
  options: IntegrateOptions,
  deps: IntegrateDeps,
): Promise<IntegrationReport> {
  validateOptions(options);

  const { sessionId } = options;
  const facts = await deps.factReader.listBySession({ sessionId });

  // Canonical ordering: ascending createdAt, factId as tie-breaker for
  // determinism when two facts share a millisecond.
  const sorted = [...facts].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return (a.factId as string).localeCompare(b.factId as string);
  });

  const pairs: DuplicatePair[] = [];
  const edges: RelationEdge[] = [];

  // O(n²) pair-scan. For each fact i, the canonical for any duplicate is the
  // earliest fact (in sorted order) whose trim()-content matches. By walking
  // i then j > i and emitting only when j's content matches some k ≤ i, we
  // get the STAR-TO-CANONICAL topology required by the locked contract:
  // all newer duplicates point to the single oldest matching fact.
  //
  // Implementation: pre-bucket by trim()-content; for each bucket of size
  // ≥ 2, the first element is the canonical and every later element gets
  // an edge back to it. O(n) after the O(n) bucketing scan.
  const buckets = new Map<string, Array<{ factId: FactId; createdAt: number }>>();
  for (const f of sorted) {
    const key = f.content.trim();
    const bucket = buckets.get(key);
    if (bucket === undefined) {
      buckets.set(key, [{ factId: f.factId, createdAt: f.createdAt }]);
    } else {
      bucket.push({ factId: f.factId, createdAt: f.createdAt });
    }
  }

  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const canonical = bucket[0];
    for (let i = 1; i < bucket.length; i++) {
      const dup = bucket[i];
      pairs.push({ keptFactId: canonical.factId, duplicateFactId: dup.factId });
      edges.push({
        from: dup.factId,        // newer dup → from
        to: canonical.factId,    // older canonical → to
        edgeType: 'duplicate_of',
        sessionId,
      });
    }
  }

  const edgesWritten = edges.length === 0
    ? 0
    : await deps.relationWriter.writeEdges(edges);

  return {
    sessionId,
    factsScanned: facts.length,
    duplicatesFound: pairs.length,
    edgesWritten,
    pairs,
  };
}
