/**
 * SQLite-specific edge-case regression tests for SqliteFactStore.
 *
 * ## Purpose
 *
 * These tests cover failure modes unique to the SQLite / FTS5 implementation
 * that the cross-impl contract suite (fact-store.contract.test.ts / FS-1..FS-6)
 * cannot or does not cover: BM25 normalization math, cursor safety, minTrust
 * boundary precision, NULL-trust exclusion, FTS5 query sanitization gaps, and
 * per-page normalization distortion across pages.
 *
 * ## Invariants locked
 *
 *   FS-SE-1  BM25 normalization — top result gets relevance=1.0; descending order
 *   FS-SE-2  BM25 normalization — single matching result always gets relevance=1.0
 *   FS-SE-3  Garbage cursor → safe fallback to offset=0 (no crash, no reject)
 *   FS-SE-4  Cursor with negative offset field → fallback to offset=0
 *   FS-SE-5  minTrust exact floor boundary — trust=floor is INCLUDED (>= not >)
 *   FS-SE-6  minTrust just-below floor — fact with trust < floor is excluded
 *   FS-SE-7  NULL trust never surfaces even at minTrust=0
 *   FS-SE-8  Default minTrust=0.15 when omitted — trust=0.14 excluded
 *   FS-SE-9  Whitespace-only query → empty results, no crash
 *   FS-SE-10 Final page → nextCursor absent
 *   FS-SE-11 FTS5 unclosed quote → rejects with parse error [FINDING: no sanitization]
 *   FS-SE-12 Per-page normalization distortion: sole result on sparse page gets relevance=1.0
 *
 * All tests use :memory: databases (no disk I/O needed — disk/WAL edges are
 * already covered by fact-reader-sqlite-edges.test.ts).
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import { applyMigrations } from '../../db/schema.js';
import { SqliteFactStore } from '../fact-store-sqlite.js';

// ---------------------------------------------------------------------------
// Session IDs
// ---------------------------------------------------------------------------

const SESSION = 'fs-edges-main' as SessionId;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SqliteFactStore — SQLite-specific edge cases', () => {
  let db: Database.Database;
  let impl: SqliteFactStore;
  let insertStmt: Database.Statement;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    impl = new SqliteFactStore(db);
    insertStmt = db.prepare(
      'INSERT OR REPLACE INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
    );
  });

  afterEach(() => {
    db.close();
  });

  /** Seed a fact into the underlying facts table (triggers facts_fts via facts_ai). */
  function seed(factId: string, content: string, trust: number | null, sessionId: SessionId = SESSION): void {
    insertStmt.run(factId, sessionId as string, content, trust);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-1: BM25 normalization — top result gets relevance=1.0
  //
  // When multiple results are returned, min-max normalization must assign
  // relevance=1.0 to the highest-scoring result. All results must be in
  // non-increasing relevance order.
  //
  // This locks the normalization math independently of the ordering lock in
  // FS-4 (which verifies rank ordering but does not assert relevance=1.0 for
  // the top result).
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-1: BM25 normalization — top result gets relevance=1.0 and all results are in descending relevance order', async () => {
    // Seed with very different term frequencies for the query keyword so BM25
    // score differences are large enough to distinguish top from bottom.
    seed('se1-high', 'cache cache cache cache cache cache', 0.8); // 6× — high BM25
    seed('se1-med',  'cache performance configuration',     0.8); // 1× in short doc
    seed('se1-low',  'cache allocation strategy optimization throughput bottleneck latency pipeline overhead', 0.8); // 1× in long doc → BM25 penalizes length

    const { results } = await impl.search({ query: 'cache', sessionId: SESSION, limit: 10 });

    expect(results.length).toBeGreaterThanOrEqual(3);

    // Top result must have relevance=1.0 (max of normalized range).
    expect(results[0].relevance).toBe(1.0);

    // All relevance scores must be ∈ [0,1] and in non-increasing order.
    for (const r of results) {
      expect(r.relevance).toBeGreaterThanOrEqual(0);
      expect(r.relevance).toBeLessThanOrEqual(1.0);
    }
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].relevance!).toBeGreaterThanOrEqual(results[i + 1].relevance!);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-2: BM25 normalization — single matching result always gets 1.0
  //
  // When exactly one fact matches, all-equal branch in normalizeRelevance
  // must fire: `(max === min) → return raw.map(() => 1.0)`.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-2: BM25 normalization — single matching result always gets relevance=1.0', async () => {
    seed('se2-only', 'unique xylophone melody solo', 0.5);

    const { results } = await impl.search({ query: 'xylophone', sessionId: SESSION, limit: 10 });

    expect(results).toHaveLength(1);
    expect(results[0].relevance).toBe(1.0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-3: Garbage cursor → safe fallback to offset=0 (no crash)
  //
  // decodeCursor() catches JSON.parse() failures and returns 0.
  // An invalid base64/JSON cursor MUST NOT crash search() — it must behave
  // as if no cursor was provided (i.e., start from offset 0).
  //
  // Verified by asserting: results with garbage cursor == results with no cursor.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-3: garbage cursor (invalid base64/JSON) → safe fallback to offset=0, no crash', async () => {
    seed('se3-a', 'resilient distributed consensus algorithm', 0.8);
    seed('se3-b', 'resilient fault tolerance recovery protocol', 0.7);

    const baseline = await impl.search({ query: 'resilient', sessionId: SESSION, limit: 10 });

    // Definitely-invalid cursor (non-base64, won't decode to JSON)
    const withGarbage = await impl.search({
      query: 'resilient',
      sessionId: SESSION,
      limit: 10,
      cursor: '!!!not-valid-base64-at-all!!!',
    });

    // Garbage cursor must fall back to offset=0 → identical results to no-cursor baseline.
    expect(withGarbage.results.map(r => r.content)).toEqual(
      baseline.results.map(r => r.content),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-4: Cursor with negative offset field → fallback to offset=0
  //
  // decodeCursor() guards: `payload.offset >= 0 ? payload.offset : 0`.
  // A cursor encoding { offset: -5 } must NOT be honored — it falls back to 0.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-4: cursor with negative offset field → fallback to offset=0', async () => {
    seed('se4-fact', 'topology graph traversal breadth first', 0.8);

    // Encode a cursor with a negative offset manually.
    const negativeOffsetCursor = Buffer.from(JSON.stringify({ offset: -5 })).toString('base64');

    const baseline = await impl.search({ query: 'topology', sessionId: SESSION, limit: 10 });
    const withNegCursor = await impl.search({
      query: 'topology',
      sessionId: SESSION,
      limit: 10,
      cursor: negativeOffsetCursor,
    });

    // Negative offset falls back to 0 → same results as no-cursor call.
    expect(withNegCursor.results.map(r => r.content)).toEqual(
      baseline.results.map(r => r.content),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-5: minTrust exact floor boundary — trust=floor is INCLUDED
  //
  // The WHERE clause is `f.trust >= $min_trust`, not `f.trust > $min_trust`.
  // A fact with trust exactly equal to the floor MUST appear in results.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-5: minTrust exact boundary — fact with trust exactly at floor is included', async () => {
    seed('se5-exact', 'authorization token validation middleware', 0.15);

    const { results } = await impl.search({
      query: 'authorization',
      sessionId: SESSION,
      limit: 10,
      minTrust: 0.15,
    });

    const found = results.find(r => r.content.includes('authorization'));
    expect(found).toBeDefined();
    // Trust must be preserved accurately.
    expect(found!.trust).toBeCloseTo(0.15, 5);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-6: minTrust just-below floor — fact is excluded
  //
  // A fact at trust=0.149 (just below default 0.15 floor) must NOT appear
  // when minTrust=0.15. Verifies the >= comparison is tight.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-6: minTrust just-below floor — trust=0.149 excluded at minTrust=0.15', async () => {
    seed('se6-below', 'encryption cipher symmetric key derivation', 0.149);
    seed('se6-above', 'encryption protocol handshake negotiation',   0.151);

    const { results } = await impl.search({
      query: 'encryption',
      sessionId: SESSION,
      limit: 10,
      minTrust: 0.15,
    });

    const contents = results.map(r => r.content);
    expect(contents.some(c => c.includes('symmetric key derivation'))).toBe(false); // below floor
    expect(contents.some(c => c.includes('handshake negotiation'))).toBe(true);    // above floor
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-7: NULL trust never surfaces, even at minTrust=0
  //
  // The WHERE clause is `f.trust IS NOT NULL AND f.trust >= $min_trust`.
  // Even passing minTrust=0 must NOT allow NULL-trust facts through —
  // NULL is excluded by the IS NOT NULL predicate before the >= check.
  //
  // NULL trust is the NaN sentinel (CL-4, Slice A). This test verifies the
  // dual guard: IS NOT NULL fires before >=, regardless of floor value.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-7: NULL trust fact never surfaces even at minTrust=0', async () => {
    // Insert directly with NULL trust to bypass the seed helper's type.
    db.prepare(
      'INSERT INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, NULL)',
    ).run('se7-null', SESSION as string, 'profiling telemetry observability tracing');

    // Also seed a normal fact with trust=0.0 to confirm that zero IS allowed.
    seed('se7-zero', 'profiling metrics dashboard monitoring', 0.0);

    const { results } = await impl.search({
      query: 'profiling',
      sessionId: SESSION,
      limit: 10,
      minTrust: 0,
    });

    // NULL-trust fact must NOT appear.
    const contents = results.map(r => r.content);
    expect(contents.some(c => c.includes('observability tracing'))).toBe(false);

    // Zero-trust fact IS allowed at minTrust=0 (0 >= 0 is true).
    expect(contents.some(c => c.includes('metrics dashboard'))).toBe(true);

    // No result must have NaN trust (defense-in-depth).
    for (const r of results) {
      expect(Number.isNaN(r.trust)).toBe(false);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-8: Default minTrust=0.15 applied when minTrust is omitted
  //
  // search() defaults minTrust to 0.15. A fact at trust=0.14 must be excluded
  // even when the caller does not pass an explicit minTrust.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-8: default minTrust=0.15 — trust=0.14 fact excluded when minTrust is omitted', async () => {
    seed('se8-below', 'indexing btree lsm storage engine', 0.14);
    seed('se8-above', 'indexing hash map lookup retrieval',  0.8);

    // No minTrust arg → defaults to 0.15.
    const { results } = await impl.search({ query: 'indexing', sessionId: SESSION, limit: 10 });

    const contents = results.map(r => r.content);
    expect(contents.some(c => c.includes('btree lsm'))).toBe(false);    // 0.14 < default 0.15
    expect(contents.some(c => c.includes('hash map lookup'))).toBe(true); // 0.8 ≥ 0.15
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-9: Whitespace-only query → empty results, no crash
  //
  // search() short-circuits on `!query.trim()` before hitting FTS5.
  // A whitespace-only string (spaces, tabs, newlines) must return
  // { results: [] } without a rejected promise.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-9: whitespace-only query → empty results, no crash', async () => {
    seed('se9-fact', 'pipeline orchestration workflow scheduler', 0.8);

    for (const q of ['   ', '\t', '\n ', '  \n\t  ']) {
      const result = await impl.search({ query: q, sessionId: SESSION, limit: 10 });
      expect(result.results).toHaveLength(0);
      expect(result.nextCursor).toBeUndefined();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-10: Final page → nextCursor absent
  //
  // When the entire result set fits within the limit (rows.length <= limit),
  // nextCursor must be undefined. Regression lock on the limit+1 sentinel logic.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-10: single-page result set — nextCursor absent on final (only) page', async () => {
    seed('se10-a', 'sharding partition key consistent hashing', 0.8);
    seed('se10-b', 'sharding replication factor write quorum',   0.7);

    const { results, nextCursor } = await impl.search({
      query: 'sharding',
      sessionId: SESSION,
      limit: 10, // limit > number of seeded facts
    });

    expect(results.length).toBe(2);
    expect(nextCursor).toBeUndefined();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-11: FTS5 unclosed-quote query → rejects with SQLite parse error
  //
  // FINDING FSE-1 (MEDIUM): SqliteFactStore passes queries directly to the
  // FTS5 MATCH operator without sanitization. A query containing an unclosed
  // double-quote (e.g., `"unclosed phrase`) triggers an FTS5 syntax error
  // in SQLite, which propagates as a rejected Promise rather than a graceful
  // empty-results response.
  //
  // Current behavior: rejects. Desired behavior: return { results: [] }.
  //
  // Recommend follow-up: wrap stmt.all() in a try/catch; on any FTS5 parse
  // error (SQLite error code SQLITE_ERROR / message contains "fts5"), return
  // { results: [] }. This prevents user-supplied query strings that contain
  // FTS5 operator characters (", AND, OR, NOT, NEAR) from crashing callers.
  //
  // Severity: MEDIUM — crash path for user-supplied queries, but not a data-
  // correctness or isolation issue. File as follow-up, not a blocker.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-11: FTS5 unclosed-quote query — rejects with SQLite parse error [FINDING FSE-1: no sanitization]', async () => {
    seed('se11-fact', 'relevant content for fts query test', 0.8);

    // An unclosed double-quote is an FTS5 syntax error.
    await expect(
      impl.search({ query: '"unclosed phrase', sessionId: SESSION, limit: 10 }),
    ).rejects.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-12: Per-page normalization distortion — sparse last page
  //
  // DOCUMENTED BEHAVIOR (NOT a bug for v1, but must be understood):
  //   SqliteFactStore normalizes relevance ∈ [0,1] using min-max across the
  //   CURRENT PAGE only. A sole result on a sparse last page always receives
  //   relevance=1.0 — even if it is a weak match far below page-1 results.
  //
  // This test locks that behavior as intentional and documents the cross-page
  // incomparability. Callers that need cross-page comparison must not rely on
  // the absolute relevance value.
  //
  // Roger acknowledged this in his decision drop §2: "The downside is that
  // relevance scores are not comparable across pages." This test makes that
  // statement machine-verifiable.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-12: per-page normalization — sparse last page sole result always gets relevance=1.0 (cross-page values are not comparable)', async () => {
    // Seed 4 facts with very different term densities.
    // Three facts are strong matches; one is a weak match in a longer doc.
    seed('se12-strong-1', 'lambda lambda lambda lambda lambda lambda', 0.9); // 6× — very strong
    seed('se12-strong-2', 'lambda lambda lambda lambda',               0.9); // 4× — strong
    seed('se12-strong-3', 'lambda lambda lambda',                      0.9); // 3× — moderate-strong
    seed('se12-weak',     'lambda architecture serverless event-driven compute platform overhead', 0.9); // 1× in long doc

    // Page 1: fetch 3, expect nextCursor present.
    const page1 = await impl.search({ query: 'lambda', sessionId: SESSION, limit: 3 });
    expect(page1.results).toHaveLength(3);
    expect(page1.nextCursor).toBeDefined();
    // Top result on page 1 is the best match → relevance=1.0.
    expect(page1.results[0].relevance).toBe(1.0);

    // Page 2: single weak result — per-page normalization assigns it relevance=1.0.
    const page2 = await impl.search({
      query: 'lambda',
      sessionId: SESSION,
      limit: 3,
      cursor: page1.nextCursor,
    });
    expect(page2.results).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();

    // Documented behavior: sole result on sparse page gets relevance=1.0
    // even though it is the weakest match in the full result set.
    expect(page2.results[0].relevance).toBe(1.0);

    // The weak match content should be the long-doc fact (weakest BM25 match).
    expect(page2.results[0].content).toContain('serverless');
  });
});
