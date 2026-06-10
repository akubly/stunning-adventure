/**
 * SqliteFactStore — SQLite-backed FactStore implementation for `@akubly/eureka`.
 * Implements the `FactStore` interface; verified by the shared contract suite in
 * `storage/__tests__/fact-store.contract.test.ts`.
 *
 * ## BM25 sign convention
 *
 * SQLite FTS5 `bm25(facts_fts)` returns NEGATIVE scores where more-negative = better
 * match. This is the primary footgun. This implementation:
 *   1. Orders by `(-bm25(facts_fts)) * trust DESC, f.id ASC` — composite primary sort
 *      (positive larger = better × trust weight), with f.id as a deterministic
 *      tie-breaker so offset pagination can't skip/dup when composite scores tie.
 *   2. `relevance` = pure BM25 text-match quality; normalized per-page via min-max.
 *      This is INDEPENDENT of result order: page order uses the composite heuristic;
 *      relevance uses only the BM25 component. A high-trust/low-BM25 fact can sort
 *      ahead of a low-trust/high-BM25 fact while carrying a lower relevance — by design.
 *   The ordering footgun lock is FS-4 in runFactStoreContract.
 *
 * ## Schema gaps (Slice C deferred fields)
 *
 * The `facts` table (migration 001) does not yet carry `attentionTier`,
 * `importance`, or `lastAccessed`. Until a future migration adds them:
 *   - `attentionTier` defaults to 'warm' (warm-tier identity multiplier = 1.0).
 *   - `importance` is omitted (undefined → compositeScore uses 0).
 *   - `lastAccessed` is omitted (undefined → compositeScore uses Infinity → recency floor 0.1).
 * See `.squad/decisions.md` (M8 Slice C section) for the full record.
 *
 * ## Cursor design (v1 — Slice D+)
 *
 * Cursors are base64-encoded JSON in one of two formats:
 *   v0 (legacy): `{ offset: number }` — accepted as-is, no scope check.
 *   v1 (current): `{ v: 1, offset: number, scope: string }` — scope is a
 *     SHA-256 hex (first 16 chars) of the canonical param string:
 *       `query=${q}\nsessionId=${sid}\nminTrust=${mt}\nlimit=${lim}`
 *
 * Version dispatch: see storage/cursor.ts.  Key rules:
 *   - v0 cursors are accepted without scope validation (backward compat).
 *   - v1 cursors whose scope fingerprint mismatches the current params throw
 *     `CursorScopeMismatchError` (fail fast — caller contract violation).
 *   - Unknown future version (v > 1) throws `CursorVersionUnsupportedError`.
 *   - Structurally garbage cursors still fall back to offset 0 (FS-SE-3).
 *
 * Offset-based pagination is deterministic within a request (same params, no writes
 * between pages). It is NOT stable under concurrent writes between pages — the
 * composite + f.id order can shift if new facts are inserted or trust is mutated.
 * A keyset cursor (last rank + last f.id) would resist concurrent writes; that
 * migration is deferred to Slice D++.
 *
 * ## Session scoping
 *
 * Every search is filtered `AND f.session_id = $session_id`. Facts from one session
 * are NEVER returned in another session's search results (FS-6 invariant).
 *
 * ## NULL trust handling
 *
 * Facts with NULL trust (NaN sentinel per CL-4, Slice A) are excluded at the SQL
 * layer via `f.trust IS NOT NULL`. They will never surface in search results
 * regardless of the minTrust floor.
 *
 * ## DB lifecycle
 *
 * The caller injects an already-opened `Database` handle (Cairn/Eureka convention).
 * This class does not open or close the database.
 */

import type Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import type { FactStore, RecallResult } from '../activities/recall.js';
import { scopeFingerprint, encodeCursor, decodeCursor } from './cursor.js';
import { CursorScopeMismatchError } from './errors.js';

// ---------------------------------------------------------------------------
// Internal row type returned by the FTS5 + facts JOIN
// ---------------------------------------------------------------------------

interface SearchRow {
  id: number;
  content: string;
  trust: number | null;
  bm25_score: number;
}

type SearchBindParams = {
  query: string;
  session_id: string;
  min_trust: number;
  limit: number;
  offset: number;
};

// ---------------------------------------------------------------------------
// BM25 relevance normalization
//
// bm25() returns negative values; flip sign for ascending positive scores,
// then min-max normalize to [0,1] across the current page.
// ---------------------------------------------------------------------------

function normalizeRelevance(bm25Scores: number[]): number[] {
  if (bm25Scores.length === 0) return [];
  const raw = bm25Scores.map(s => -s); // flip: higher = better match
  let min = raw[0];
  let max = raw[0];
  for (let i = 1; i < raw.length; i++) {
    if (raw[i] < min) min = raw[i];
    if (raw[i] > max) max = raw[i];
  }
  if (max === min) return raw.map(() => 1.0); // all equal → top score
  return raw.map(s => (s - min) / (max - min));
}

// ---------------------------------------------------------------------------
// SqliteFactStore
// ---------------------------------------------------------------------------

export class SqliteFactStore implements FactStore {
  private readonly stmt: Database.Statement<SearchBindParams, SearchRow>;

  constructor(db: Database.Database) {
    // ⚠️ BM25 footgun: bm25(facts_fts) is NEGATIVE (more negative = better match).
    // ORDER BY (-bm25_score) * f.trust DESC gives composite descending sort.
    // bm25_score is the SELECT alias — reused here to avoid recomputing bm25().
    // f.id ASC is a deterministic tie-breaker: when composite scores are equal,
    // pagination is stable (no skip/dup on page boundaries).
    this.stmt = db.prepare<SearchBindParams, SearchRow>(`
      SELECT
        f.id,
        f.content,
        f.trust,
        bm25(facts_fts) AS bm25_score
      FROM facts_fts
      JOIN facts f ON f.id = facts_fts.rowid
      WHERE facts_fts MATCH $query
        AND f.session_id = $session_id
        AND f.trust IS NOT NULL
        AND f.trust >= $min_trust
      ORDER BY (-bm25_score) * f.trust DESC, f.id ASC
      LIMIT $limit
      -- OFFSET-based pagination is stable under a no-concurrent-writes assumption.
      -- If trust mutations or new inserts occur between pages, the composite order
      -- can shift and OFFSET may skip or duplicate rows. Keyset pagination (last
      -- rank + last f.id as cursor) would resist this; deferred to Slice D+.
      OFFSET $offset
    `);
  }

  async search(args: {
    query: string;
    sessionId: SessionId;
    limit: number;
    minTrust?: number;
    cursor?: string;
  }): Promise<{ results: RecallResult[]; nextCursor?: string }> {
    const { query, sessionId, limit, minTrust = 0.15, cursor } = args;

    // F4: validate limit — non-positive or non-integer causes a non-advancing
    // cursor (infinite-loop risk for callers that paginate until nextCursor absent).
    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
      throw new TypeError(`SqliteFactStore.search: limit must be a positive integer, got ${limit}`);
    }

    // Validate minTrust when explicitly provided — NaN/Infinity silently makes
    // WHERE trust >= ? filter out everything, masking upstream bugs.
    if (args.minTrust !== undefined && (!Number.isFinite(minTrust) || minTrust < 0 || minTrust > 1)) {
      throw new TypeError(`SqliteFactStore.search: minTrust must be a finite number in [0, 1], got ${minTrust}`);
    }

    // FTS5 MATCH with an empty string throws — short-circuit to empty results.
    if (!query.trim()) {
      return { results: [] };
    }

    const currentScope = scopeFingerprint(query, sessionId as string, minTrust, limit);

    let offset = 0;
    if (cursor !== undefined) {
      const decoded = decodeCursor(cursor); // may throw CursorVersionUnsupportedError
      if (decoded.version === 1) {
        if (decoded.scope !== currentScope) {
          throw new CursorScopeMismatchError();
        }
        offset = decoded.offset;
      } else {
        // v0 — honor offset as-is, no scope check (backward compat)
        offset = decoded.offset;
      }
    }

    // Fetch limit+1 rows to detect whether a next page exists without a
    // separate COUNT query. The extra row is never returned to the caller.
    //
    // FSE-1 / F2: FTS5 parse guard — user-supplied query strings may contain FTS5
    // operators that SQLite rejects at parse time (unclosed `"`, bare `*`, `-`,
    // `NEAR`, etc.). We catch those errors and return empty results rather than
    // propagating a rejected Promise. Narrowing: code === SQLITE_ERROR AND message
    // matches the known FTS5 parse-error patterns below. Other SQLITE_ERROR
    // messages ("no such table", "CHECK constraint failed", etc.) still rethrow.
    let rows: SearchRow[];
    try {
      rows = this.stmt.all({
        query,
        session_id: sessionId as string,
        min_trust: minTrust,
        limit: limit + 1,
        offset,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'SQLITE_ERROR' &&
        /fts5|unterminated|syntax error|malformed MATCH/i.test(err.message)
      ) {
        // FTS5 parse/syntax error from user-supplied query text. Known patterns:
        //   "fts5: syntax error near ..."   — operator/token syntax failures
        //   "unterminated string"           — unclosed double-quote in phrase query
        //   "syntax error" / "malformed MATCH" — other FTS5 parser rejections
        // Non-FTS SQLITE_ERROR messages ("no such table", "CHECK constraint", etc.)
        // do NOT match and fall through to the rethrow below.
        // TODO: replace console.warn with an injected logger once one exists.
        console.warn(
          `[SqliteFactStore] FTS5 query parse error (returning empty results): ${err.message}`,
        );
        return { results: [] };
      }
      throw err;
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const relevances = normalizeRelevance(pageRows.map(r => r.bm25_score));

    const results: RecallResult[] = pageRows.map((row, i) => ({
      content: row.content,
      // NULL trust is excluded by the WHERE clause but guard defensively.
      trust: row.trust === null ? NaN : row.trust,
      // attentionTier not yet in schema — default to 'warm' (identity multiplier).
      attentionTier: 'warm',
      relevance: relevances[i],
      // importance and lastAccessed omitted — not in schema yet (Slice C gap).
    }));

    const nextCursor = hasMore ? encodeCursor(offset + limit, currentScope) : undefined;
    return { results, nextCursor };
  }
}
