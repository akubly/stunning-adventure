/**
 * integrate — post-imprint consolidation activity.
 *
 * Activity: integrate (§10 §10.1 — Jungian post-imprint consolidation)
 * Seams:
 *   - SessionFactLister.listBySession() — read the session's facts
 *   - RelationWriter.writeEdges()       — persist `duplicate_of` edges
 *
 * ## What integrate does (v1)
 *
 * 1. Validate sessionId synchronously (throws `InvalidIntegrateError` pre-await).
 * 2. List the session's facts via `SessionFactLister`.
 * 3. Enforce the documented scope bound `MAX_SESSION_FACTS` BEFORE sorting:
 *    a session larger than the bound throws `IntegrateScopeError` rather than
 *    silently embarking on an O(n²) scan. A DB-side GROUP BY consolidation
 *    path is reserved for v1.5+ and will obsolete this guard.
 * 4. Bucket facts by `.trim()`-equal content — semantically identical text
 *    is treated as a duplicate. Future v1.5+ widens this to embedding-distance
 *    or BM25-similarity; the activity boundary stays the same.
 * 5. For each duplicate bucket, the OLDEST fact (smallest createdAt) is the
 *    canonical; every newer duplicate gets a `duplicate_of` edge pointing back
 *    to that canonical. N-way duplicates form a STAR-TO-CANONICAL topology
 *    (all newer dups point to the single oldest) — NOT a chain.
 * 6. Batch-write the edges via `RelationWriter.writeEdges`; the count returned
 *    is the number ACTUALLY inserted (idempotent re-runs return 0 even though
 *    the algorithm proposes the same edges).
 * 7. Facts table is never mutated — consolidation is expressed entirely as
 *    new `fact_relations` rows. Append-only invariant locked in D-INT-9.
 *
 * ## Complexity
 *
 * The algorithm is **O(n log n) sort-dominated**, with an O(n) hash-bucket
 * pass over the sorted facts. The pair-scan is *conceptually* O(n²) over
 * any single duplicate bucket, but the bucketing-by-content collapses it
 * to a single linear walk: bucket[0] is canonical and every later element
 * emits one edge. (Earlier review noted contradictory header/inline comments;
 * the bucketing approach is the actual implementation.) The `MAX_SESSION_FACTS`
 * guard exists because edge count is still O(n) in the worst case (all-dups
 * session) and the sort cost is unbounded without it.
 *
 * ## SQLite createdAt precision
 *
 * SQLite stores `created_at` as `TEXT` with second precision
 * (`YYYY-MM-DD HH:MM:SS`, UTC). The in-memory backend preserves the original
 * epoch ms. Two facts imprinted within the same UTC second therefore tie on
 * `createdAt` after the sqlite round-trip and fall through to the `factId`
 * tie-breaker — deterministic, but the canonical winner may differ between
 * backends for sub-second duplicates. Wave-2 trade-off; no schema change.
 */

import type { SessionId, FactId } from '@akubly/types';
import type { SessionFactLister } from './recall.js';
import type { RelationEdge } from '../representation/relation.js';
import { InvalidIntegrateError, IntegrateScopeError } from './errors.js';

// ---------------------------------------------------------------------------
// Back-compat aliases for the integrate activity contract suite
// ---------------------------------------------------------------------------
//
// The activity contract helper imports `FactReader` / `RelationWriter` /
// `RelationEdge` from this module under the *narrow* meaning used inside
// integrate (just the slice integrate needs). To keep that test file
// frozen during the fix wave we re-export the canonical seam types under
// those names. The broader `FactReader` (single-fact read) lives in
// `./recall.js`; the broader `RelationWriter` (single-edge `link`) lives
// in `../storage/relation-writer.types.js`.
export type { SessionFactLister as FactReader } from './recall.js';
export type { RelationEdge } from '../representation/relation.js';

// ---------------------------------------------------------------------------
// Scope bound (D-R2 review guard)
// ---------------------------------------------------------------------------

/**
 * Maximum number of facts `integrate()` will pair-scan in a single pass.
 *
 * Chosen at 10,000:
 *   - The pair-scan is O(n²) over each duplicate bucket; the algorithm itself
 *     is O(n log n) overall, but operators expect predictable wall time. At
 *     10k facts a hot V8 sort completes in low milliseconds; the bucket walk
 *     stays linear; total memory footprint of the in-flight arrays remains
 *     well under 100 MB.
 *   - Real Eureka sessions are typically agent conversations — single-digit-
 *     thousands of facts is already exceptional. Multi-session knowledge
 *     graphs are out of v1 scope (the relations table is session-local).
 *   - A larger session likely indicates either a long-running session that
 *     should be partitioned, or a v1.5+ workload that wants the planned
 *     DB-side GROUP BY consolidation path instead of in-memory pair-scan.
 *
 * Bump this only after measuring against the actual workload; the right
 * fix at scale is the v1.5 DB-side path, not a larger constant.
 */
export const MAX_SESSION_FACTS = 10_000;

// ---------------------------------------------------------------------------
// Narrow seam type matching Genesta's locked contract
// ---------------------------------------------------------------------------

/**
 * The slice of `RelationWriter` integrate actually needs. Structural so
 * test doubles can implement just `writeEdges`. Aliased as `RelationWriter`
 * for the activity contract suite (see top-of-file note).
 */
export interface RelationWriterBatch {
  writeEdges(edges: ReadonlyArray<RelationEdge>): Promise<number>;
}

export type { RelationWriterBatch as RelationWriter };

// ---------------------------------------------------------------------------
// Public contract types
// ---------------------------------------------------------------------------

export interface IntegrateOptions {
  sessionId: SessionId;
}

/**
 * Dependency bundle for `integrate()`.
 *
 * `clock` was removed during the fix-wave review (A4): the activity body
 * never read `deps.clock`, and the storage layer stamps `created_at` itself
 * via injected clocks on the writers. Leaving an unused required dep would
 * make the API misleading. If a future report field needs the activity's
 * wall-clock, re-introduce `clock` only with a code-side use site.
 */
export interface IntegrateDeps {
  factReader: SessionFactLister;
  relationWriter: RelationWriterBatch;
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
 *
 * @throws  {InvalidIntegrateError}  on missing/blank `sessionId` (sync, pre-await).
 * @throws  {IntegrateScopeError}    when the session size exceeds
 *                                   `MAX_SESSION_FACTS` (BEFORE sorting).
 */
export async function integrate(
  options: IntegrateOptions,
  deps: IntegrateDeps,
): Promise<IntegrationReport> {
  validateOptions(options);

  const { sessionId } = options;
  const facts = await deps.factReader.listBySession({ sessionId });

  // D-R2 guard — refuse unbounded scans BEFORE the sort.
  if (facts.length > MAX_SESSION_FACTS) {
    throw new IntegrateScopeError(sessionId as string, facts.length, MAX_SESSION_FACTS);
  }

  // Canonical ordering: ascending createdAt, factId as tie-breaker for
  // determinism when two facts share a millisecond (or share a second under
  // the sqlite second-precision round-trip — see header).
  const sorted = [...facts].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return (a.factId as string).localeCompare(b.factId as string);
  });

  const pairs: DuplicatePair[] = [];
  const edges: RelationEdge[] = [];

  // Bucket facts by trim()-equal content. After the bucketing scan, for each
  // bucket of size ≥ 2, the FIRST element is the canonical (oldest by the
  // sort above) and every later element emits one duplicate_of edge back
  // to it — STAR-TO-CANONICAL topology, NOT a chain.
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
