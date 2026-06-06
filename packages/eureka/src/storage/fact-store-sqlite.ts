/**
 * SqliteFactStore — SQLite-backed FactStore implementation for `@akubly/eureka`.
 * Implements the `FactStore` interface; verified by the shared contract suite in
 * `storage/__tests__/fact-store.contract.test.ts`.
 *
 * ## BM25 sign convention
 *
 * SQLite FTS5 `bm25(facts_fts)` returns NEGATIVE scores where more-negative = better
 * match. This is the primary footgun. This implementation:
 *   1. Orders by `(-bm25(facts_fts)) * trust DESC` — composite score where
 *      `-bm25(...)` is positive (larger = better) multiplied by trust weight.
 *   2. Normalizes to `relevance ∈ [0,1]` via min-max across the result page:
 *      `(rawScore - min) / (max - min)`. All-equal scores → relevance 1.0.
 *   The ordering column is the regression lock (FS-4 in runFactStoreContract).
 *
 * ## Schema gaps (Slice C deferred fields)
 *
 * The `facts` table (migration 001) does not yet carry `attentionTier`,
 * `importance`, or `lastAccessed`. Until a future migration adds them:
 *   - `attentionTier` defaults to 'warm' (warm-tier identity multiplier = 1.0).
 *   - `importance` is omitted (undefined → compositeScore uses 0).
 *   - `lastAccessed` is omitted (undefined → compositeScore uses Infinity → recency floor 0.1).
 * See decision drop roger-m8-slice-c.md §Schema Gaps for the full record.
 *
 * ## Cursor design
 *
 * v1 uses a base64-encoded JSON offset cursor: `{ offset: number }`.
 * Offset-based pagination is deterministic for a given query + session + minTrust
 * combination when the underlying data does not change between pages. Cross-session
 * keyset cursors (rank+rowid form) are a Slice D+ concern.
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
// Cursor encoding (opaque base64 JSON — consumers MUST NOT parse internals)
// ---------------------------------------------------------------------------

interface CursorPayload {
  offset: number;
}

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset } satisfies CursorPayload)).toString('base64');
}

function decodeCursor(cursor: string): number {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) as CursorPayload;
    return typeof payload.offset === 'number' && payload.offset >= 0 ? payload.offset : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// BM25 relevance normalization
//
// bm25() returns negative values; flip sign for ascending positive scores,
// then min-max normalize to [0,1] across the current page.
// ---------------------------------------------------------------------------

function normalizeRelevance(bm25Scores: number[]): number[] {
  if (bm25Scores.length === 0) return [];
  const raw = bm25Scores.map(s => -s); // flip: higher = better match
  const min = Math.min(...raw);
  const max = Math.max(...raw);
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
    // ORDER BY (-bm25(facts_fts)) * f.trust DESC gives composite descending sort.
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
      ORDER BY (-bm25(facts_fts)) * f.trust DESC
      LIMIT $limit
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

    // FTS5 MATCH with an empty string throws — short-circuit to empty results.
    if (!query.trim()) {
      return { results: [] };
    }

    const offset = cursor !== undefined ? decodeCursor(cursor) : 0;

    // Fetch limit+1 rows to detect whether a next page exists without a
    // separate COUNT query. The extra row is never returned to the caller.
    //
    // FSE-1: FTS5 parse guard — user-supplied query strings may contain FTS5
    // operators (unclosed `"`, bare `*`, `-`, `NEAR`, etc.) that SQLite rejects
    // at parse time. We catch SQLITE_ERROR (the code SQLite uses for all query-
    // parse failures) and return empty results rather than propagating a rejected
    // Promise. Non-parse failures use distinct codes (SQLITE_CORRUPT=11,
    // SQLITE_IOERR=10, SQLITE_BUSY=5, …) and are rethrown unchanged.
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
        (err as { code: string }).code === 'SQLITE_ERROR'
      ) {
        // SQLITE_ERROR (code 1) covers FTS5 parse/syntax failures from
        // user-supplied query text (unclosed quotes, bare operators, malformed
        // NEAR expressions, etc.). Storage/IO failures use different codes
        // (SQLITE_CORRUPT=11, SQLITE_IOERR=10, SQLITE_BUSY=5, …) and are
        // still rethrown so genuine bugs remain visible.
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

    const nextCursor = hasMore ? encodeCursor(offset + limit) : undefined;
    return { results, nextCursor };
  }
}
