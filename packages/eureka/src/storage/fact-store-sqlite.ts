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
 *      tie-breaker so keyset pagination can't skip/dup when composite scores tie.
 *   2. `relevance` = pure BM25 text-match quality; normalized per-page via min-max.
 *      This is INDEPENDENT of result order: page order uses the composite heuristic;
 *      relevance uses only the BM25 component. A high-trust/low-BM25 fact can sort
 *      ahead of a low-trust/high-BM25 fact while carrying a lower relevance — by design.
 *   The ordering footgun lock is FS-4 in runFactStoreContract.
 *
 * ## Schema columns (migration 002)
 *
 * The `facts` table carries `importance`, `last_accessed`, and `attention_tier`
 * as of migration 002.  The sort key is UNCHANGED (D2 locked):
 *   ORDER BY (-bm25_score) * f.trust DESC, f.id ASC
 * importance/last_accessed/attention_tier are NOT in the sort key — they are
 * consumed by the recall-layer compositeScore at query time, not at SQL time.
 * SqliteFactStore now reads `attention_tier` → `attentionTier`, `importance` →
 * `importance`, and `last_accessed` → `lastAccessed` (SQL NULL mapped to `undefined`).
 * The migration-002 defaults (attention_tier='warm', importance 0, last_accessed NULL)
 * reproduce the pre-wiring behaviour exactly.
 *
 * ## Cursor design (v1 keyset — Slice D++)
 *
 * Cursors are base64-encoded JSON: `{ v: 1, lastSort: number, lastId: number, scope: string }`
 *   lastSort = (-bm25_score) * trust of the last row on the current page
 *   lastId   = f.id (autoincrement) of the last row on the current page
 *   scope    = SHA-256 hex (first 16 chars) of JSON-serialised param object:
 *                `JSON.stringify({ query, sessionId, minTrust, limit })`
 *
 * Keyset predicate on continuation pages (evaluated via CTE — single bm25 evaluation):
 *   WHERE composite < $last_sort
 *      OR (composite = $last_sort AND id > $last_id)
 *
 * Keyset eliminates the OFFSET-shift duplication/skip mechanism (the original FSE-2
 * problem: a new higher-ranked insert shifting row offsets so a previously-returned
 * row re-appears on the next page, or a row is silently skipped). This is NOT a
 * blanket "any concurrent insert is safe" guarantee — a residual second-order effect
 * remains: bm25() IDF is corpus-dependent, so inserts between pages can shift some
 * rows' recomputed composite vs the stored lastSort anchor (see IDF-drift caveat
 * below). Trust mutations of already-returned rows can also cause re-appearance: if
 * a row's trust changes after page 1, its composite may re-cross the lastSort anchor
 * and reappear on a later page. Callers needing strict stability under concurrent
 * mutations should restart pagination.
 * Two prepared statements: stmtFirst (no keyset, first page) and stmtKeyset (keyset
 * predicate, continuation pages) — better-sqlite3 binds are fixed to the SQL string.
 *
 * ## IDF-drift caveat
 *
 * bm25() IDF weights are corpus-dependent: inserting new facts between pages changes
 * the IDF for shared terms, which shifts some rows' recomputed composite scores vs the
 * stored lastSort anchor. This is the residual insert-induced effect that keyset does
 * not eliminate — structural OFFSET-shift is gone, but IDF perturbation of the
 * composite boundary remains as a second-order edge case for typical workloads. Future
 * mitigation: snapshot composite as a stored column in the facts table.
 *
 * Version dispatch: see storage/cursor.ts.  Key rules:
 *   - v1 (v === 1): scope fingerprint checked against current params;
 *     mismatch throws `CursorScopeMismatchError` (fail fast — caller contract violation).
 *     Valid lastSort/lastId → keyset predicate applied.
 *     Invalid lastSort/lastId → restart sentinel → first page (no keyset predicate).
 *   - v-absent / garbage: restart sentinel → first page (v0 backward-compat deleted).
 *   - Any present v not exactly 1: throws `CursorVersionUnsupportedError`.
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
 *
 * ## Logger seam
 *
 * Constructor accepts an optional `logger` (default: `console`). FTS5 parse-error
 * warnings are emitted via `this.logger.warn(...)` for testability.
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
  importance: number;
  last_accessed: number | null;
  attention_tier: string;
}

type SearchBindFirst = {
  query: string;
  session_id: string;
  min_trust: number;
  limit: number;
};

type SearchBindKeyset = SearchBindFirst & {
  last_sort: number;
  last_id: number;
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

// CTE base query — bm25(facts_fts) is called exactly once per row here.
// The outer keyset query derives composite from the fetched bm25_score column
// (pure arithmetic, no second bm25 call) so the boundary is bit-exact.
const SQL_CTE_BASE = `
  WITH base AS (
    SELECT
      f.id,
      f.content,
      f.trust,
      bm25(facts_fts) AS bm25_score,
      f.importance,
      f.last_accessed,
      f.attention_tier
    FROM facts_fts
    JOIN facts f ON f.id = facts_fts.rowid
    WHERE facts_fts MATCH $query
      AND f.session_id = $session_id
      AND f.trust IS NOT NULL
      AND f.trust >= $min_trust
  ),
  ranked AS (
    -- ⚠️ INVARIANT: (-bm25_score) * trust MUST mirror the ORDER BY expression in stmtFirst.
    -- If importance or other signals are ever folded into the sort key, update both here
    -- and in stmtFirst's ORDER BY simultaneously, or the keyset boundary silently breaks.
    SELECT id, content, trust, bm25_score,
           (-bm25_score) * trust AS composite,
           importance, last_accessed, attention_tier
    FROM base
  )
`;

// ---------------------------------------------------------------------------
// SqliteFactStore
// ---------------------------------------------------------------------------

export class SqliteFactStore implements FactStore {
  private readonly stmtFirst: Database.Statement<SearchBindFirst, SearchRow>;
  private readonly stmtKeyset: Database.Statement<SearchBindKeyset, SearchRow>;
  private readonly logger: { warn(msg: string): void };

  constructor(db: Database.Database, logger?: { warn(msg: string): void }) {
    this.logger = logger ?? console;

    // ⚠️ BM25 footgun: bm25(facts_fts) is NEGATIVE (more negative = better match).
    // ORDER BY (-bm25_score) * f.trust DESC gives composite descending sort.
    // bm25_score is a SELECT alias — SQLite expands it in ORDER BY.
    // f.id ASC is the deterministic tie-breaker for keyset stability.
    this.stmtFirst = db.prepare<SearchBindFirst, SearchRow>(`
      SELECT
        f.id,
        f.content,
        f.trust,
        bm25(facts_fts) AS bm25_score,
        f.importance,
        f.last_accessed,
        f.attention_tier
      FROM facts_fts
      JOIN facts f ON f.id = facts_fts.rowid
      WHERE facts_fts MATCH $query
        AND f.session_id = $session_id
        AND f.trust IS NOT NULL
        AND f.trust >= $min_trust
      ORDER BY (-bm25_score) * f.trust DESC, f.id ASC
      LIMIT $limit
    `);

    // CTE computes bm25 once (in `base`) then derives composite in `ranked`.
    // The outer SELECT filters on pre-computed composite — no second bm25 call.
    this.stmtKeyset = db.prepare<SearchBindKeyset, SearchRow>(`
      ${SQL_CTE_BASE}
      SELECT id, content, trust, bm25_score, importance, last_accessed, attention_tier
      FROM ranked
      WHERE composite < $last_sort
         OR (composite = $last_sort AND id > $last_id)
      ORDER BY composite DESC, id ASC
      LIMIT $limit
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

    // Decode the cursor BEFORE the empty-query short-circuit so that an
    // invalid/unsupported cursor version always throws — even when query is empty.
    // Fix J: scopeFingerprint is computed lazily — only when needed (v1 scope
    // check, or emitting nextCursor). Avoids hashing on empty-query calls.

    let keysetParams: { last_sort: number; last_id: number } | undefined;
    let computedScope: string | undefined;

    if (cursor !== undefined) {
      const decoded = decodeCursor(cursor); // may throw CursorVersionUnsupportedError
      if (decoded.version === 1) {
        computedScope = scopeFingerprint(query, sessionId as string, minTrust, limit);
        if (decoded.scope !== computedScope) {
          throw new CursorScopeMismatchError(decoded.scope, computedScope);
        }
        keysetParams = { last_sort: decoded.lastSort, last_id: decoded.lastId };
      }
      // version 0 (restart sentinel — v0/garbage/invalid-keyset-fields) → no keyset params → first page
    }

    // FTS5 MATCH with an empty string throws — short-circuit to empty results.
    if (!query.trim()) {
      return { results: [] };
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
      const baseParams = {
        query,
        session_id: sessionId as string,
        min_trust: minTrust,
        limit: limit + 1,
      };
      rows = keysetParams !== undefined
        ? this.stmtKeyset.all({ ...baseParams, ...keysetParams })
        : this.stmtFirst.all(baseParams);
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
        this.logger.warn(
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
      attentionTier: row.attention_tier as 'hot' | 'warm' | 'cold',
      importance: row.importance,
      lastAccessed: row.last_accessed ?? undefined,
      relevance: relevances[i],
    }));

    let nextCursor: string | undefined;
    if (hasMore) {
      const lastRow = pageRows[pageRows.length - 1];
      // f.trust IS NOT NULL in SQL makes null impossible here; the NaN fallback
      // produces a non-finite lastSort → decodeCursor returns restart on the next call.
      const lastRowComposite = (-lastRow.bm25_score) * (lastRow.trust ?? NaN);
      const scope = computedScope ?? scopeFingerprint(query, sessionId as string, minTrust, limit);
      nextCursor = encodeCursor({ lastSort: lastRowComposite, lastId: lastRow.id, scope });
    }

    return { results, nextCursor };
  }
}
