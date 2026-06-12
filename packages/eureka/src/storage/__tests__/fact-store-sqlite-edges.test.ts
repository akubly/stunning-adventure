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
 *   FS-SE-1  BM25 normalization — top result gets relevance=1.0; all results ∈ [0,1]
 *   FS-SE-1b Heterogeneous trust — high-trust/low-BM25 sorts before low-trust/high-BM25 (relevance ≠ order by design)
 *   FS-SE-2  BM25 normalization — single matching result always gets relevance=1.0
 *   FS-SE-3  Garbage cursor → restart to page 1 (no crash, no reject)
 *   FS-SE-4  v1 cursor with bad keyset field values (bad lastSort/lastId) → restart to page 1
 *   FS-SE-5  minTrust exact floor boundary — trust=floor is INCLUDED (>= not >)
 *   FS-SE-6  minTrust just-below floor — fact with trust < floor is excluded
 *   FS-SE-7  NULL trust never surfaces even at minTrust=0
 *   FS-SE-8  Default minTrust=0.15 when omitted — trust=0.14 excluded
 *   FS-SE-9  Whitespace-only query → empty results, no crash
 *   FS-SE-10 Final page → nextCursor absent
 *   FS-SE-11 FTS5 unclosed quote → graceful empty results (FSE-1 fix applied)
 *   FS-SE-12 Per-page normalization distortion: sole result on sparse page gets relevance=1.0
 *   FS-SE-13 Non-FTS SQLITE_ERROR (e.g. missing table) propagates as rejected Promise
 *   FS-SE-15 Cursor stays under 256 bytes; keyset fields (lastSort/lastId) present (Slice D++)
 *
 * All tests use :memory: databases (no disk I/O needed — disk/WAL edges are
 * already covered by fact-reader-sqlite-edges.test.ts).
 */

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import type { SessionId } from '@akubly/types';
import { applyMigrations } from '../../db/schema.js';
import { SqliteFactStore } from '../fact-store-sqlite.js';
import { scopeFingerprint } from '../cursor.js';

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
  // relevance=1.0 to the highest-scoring result. All relevance values must
  // be ∈ [0,1]. Relevance order is NOT asserted here — relevance is pure
  // BM25 quality, independent of the composite (-bm25 × trust) sort order.
  // See FS-SE-1b for the heterogeneous-trust ordering lock.
  //
  // This locks the normalization math independently of the ordering lock in
  // FS-4 (which verifies rank ordering but does not assert relevance=1.0 for
  // the top result).
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-1: BM25 normalization — top result gets relevance=1.0; all results ∈ [0,1]', async () => {
    // Seed with very different term frequencies for the query keyword so BM25
    // score differences are large enough to distinguish top from bottom.
    seed('se1-high', 'cache cache cache cache cache cache', 0.8); // 6× — high BM25
    seed('se1-med',  'cache performance configuration',     0.8); // 1× in short doc
    seed('se1-low',  'cache allocation strategy optimization throughput bottleneck latency pipeline overhead', 0.8); // 1× in long doc → BM25 penalizes length

    const { results } = await impl.search({ query: 'cache', sessionId: SESSION, limit: 10 });

    expect(results.length).toBeGreaterThanOrEqual(3);

    // Top result must have relevance=1.0 (max of normalized range).
    expect(results[0].relevance).toBe(1.0);

    // All relevance scores must be ∈ [0,1].
    for (const r of results) {
      expect(r.relevance).toBeGreaterThanOrEqual(0);
      expect(r.relevance).toBeLessThanOrEqual(1.0);
    }
    // NOTE: relevance order is NOT asserted here. Page ORDER uses the composite
    // heuristic (-bm25 × trust); relevance is pure BM25 quality. With equal trust
    // they coincide — but that is coincidental, not a contract. See FS-SE-1b.
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-1b: Heterogeneous trust — high-trust/low-BM25 fact sorts ahead of
  //           low-trust/high-BM25, but carries lower relevance.
  //
  // Locks the F1 design decision: relevance = pure BM25 quality; result ORDER
  // = composite (-bm25 × trust). These are INDEPENDENT signals. When trust
  // varies, a fact can sort first in page order while scoring lower on relevance.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-1b: high-trust/low-BM25 fact sorts before low-trust/high-BM25 — but carries lower relevance (relevance ≠ sort order by design)', async () => {
    // Fact A: 6× "delta" → very high BM25, but low trust (0.20).
    // Fact B: 1× "delta" → lower BM25,     but high trust (0.90).
    // Composite: -bm25_B × 0.90 > -bm25_A × 0.20 → Fact B sorts FIRST.
    // Relevance:  -bm25_A > -bm25_B (BM25 only, no trust) → Fact A has higher relevance.
    //
    // Why the 6× repetition doesn't overcome the 4.5× trust gap:
    // BM25 TF saturation (k1≈1.2 in SQLite FTS5) caps the 6× repetition
    // advantage to ~1.3× on this corpus; the 4.5× trust ratio dominates.
    // If trust values or content change, re-verify the composite ordering.
    seed('se1b-a', 'delta delta delta delta delta delta', 0.20);
    seed('se1b-b', 'delta baseline',                     0.90);

    const { results } = await impl.search({ query: 'delta', sessionId: SESSION, limit: 10 });

    expect(results).toHaveLength(2);
    const bIdx = results.findIndex(r => r.content === 'delta baseline');
    const aIdx = results.findIndex(r => r.content.includes('delta delta delta'));
    expect(bIdx).not.toBe(-1);
    expect(aIdx).not.toBe(-1);

    // High-trust Fact B must sort first in page order (composite advantage).
    expect(bIdx).toBeLessThan(aIdx);
    // High-BM25 Fact A must carry higher relevance (BM25 quality signal).
    expect(results[aIdx].relevance!).toBeGreaterThan(results[bIdx].relevance!);
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
  // FS-SE-3: Garbage cursor → restart to page 1 (no crash)
  //
  // decodeCursor() catches JSON.parse() failures and returns the restart
  // sentinel { version: 0 }.  An invalid base64/JSON cursor MUST NOT crash
  // search() — it must behave as if no cursor was provided (restart = page 1).
  //
  // Verified by asserting: results with garbage cursor == results with no cursor.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-3: garbage cursor (invalid base64/JSON) → restart to page 1, no crash', async () => {
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

    // Garbage cursor must restart (page 1) → identical results to no-cursor baseline.
    expect(withGarbage.results.map(r => r.content)).toEqual(
      baseline.results.map(r => r.content),
    );
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-4: v1 cursor with bad keyset field values → restart to page 1
  //
  // Slice D++ keyset contract: decodeCursor validates lastSort (must be a
  // finite number) and lastId (must be a positive integer).  Bad values in
  // an otherwise well-formed v1 cursor with correct scope must NOT crash or
  // skip rows — they fall back to the restart sentinel (page 1).
  //
  // Each bad cursor also carries `offset:1` so the current offset-based impl
  // honors that offset and returns page 2 (empty, 1 fact seeded).  This makes
  // all three cases RED against the current impl:
  //   current: honors offset=1 → page 2 → empty → ≠ baseline (RED)
  //   keyset:  bad lastSort/lastId → restart → page 1 = baseline (GREEN)
  //
  // Replaced: the old FS-SE-4 tested bad offset in v0 cursors (negative,
  // Infinity, float).  Those cases still behave correctly in Slice D++
  // (v0 absent = garbage = restart) but the primary test surface is now the
  // v1 keyset field validation path.
  // ─────────────────────────────────────────────────────────────────────────

  it.each([
    ['NaN lastSort (null in JSON)',   { lastSort: NaN,  lastId: 5,   offset: 1 }],
    ['negative lastId',               { lastSort: 1.0,  lastId: -1,  offset: 1 }],
    ['non-integer lastId (float)',    { lastSort: 1.0,  lastId: 1.5, offset: 1 }],
  ])(
    'FS-SE-4: v1 cursor with %s → restart to page 1 (no crash)',
    async (_label, fields) => {
      seed('se4-fact', 'topology graph traversal breadth first', 0.8);

      const baseline      = await impl.search({ query: 'topology', sessionId: SESSION, limit: 10 });

      // Compute the matching scope so decodeCursor sees a valid string scope field.
      // Bad lastSort/lastId are caught by decodeCursor's keyset-field validation and
      // return the restart sentinel — the scope fingerprint check in search() is never reached.
      const scope = scopeFingerprint('topology', SESSION as string, 0.15, 10);
      const payload = { v: 1, scope, ...fields };
      const badCursor = Buffer.from(JSON.stringify(payload)).toString('base64');

      const withBadCursor = await impl.search({ query: 'topology', sessionId: SESSION, limit: 10, cursor: badCursor });

      // Bad keyset fields → restart → same results as no-cursor baseline.
      expect(withBadCursor.results.map(r => r.content)).toEqual(
        baseline.results.map(r => r.content),
      );
    },
  );

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
  // FS-SE-11: FTS5 unclosed-quote query → graceful empty results (FSE-1 fix)
  //
  // FIXED (FSE-1): SqliteFactStore now wraps stmt.all() in a try/catch that
  // catches FTS5 parse errors (code==='SQLITE_ERROR' && message matches
  // /fts5|unterminated|syntax error|malformed MATCH/i) and returns
  // { results: [] } instead of propagating the rejected Promise.
  //
  // This prevents user-supplied query strings containing FTS5 operator chars
  // (unclosed `"`, bare `*`, `-`, `NEAR`, etc.) from crashing callers.
  // Non-FTS errors (DB corruption, schema mismatch) are still rethrown.
  //
  // Previous behavior: rejects with parse error.
  // New behavior:      resolves to { results: [], nextCursor: undefined }.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-11: FTS5 unclosed-quote query — resolves to empty results, does not reject (FSE-1 fix)', async () => {
    seed('se11-fact', 'relevant content for fts query test', 0.8);

    // An unclosed double-quote is an FTS5 syntax error.
    // After FSE-1 fix: must resolve gracefully to empty results, not reject.
    const result = await impl.search({ query: '"unclosed phrase', sessionId: SESSION, limit: 10 });
    expect(result.results).toHaveLength(0);
    expect(result.nextCursor).toBeUndefined();
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

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-13: Non-FTS SQLITE_ERROR propagates (F2 narrowing regression lock)
  //
  // FSE-1 fix narrows the catch to FTS5-pattern errors only. A non-FTS
  // SQLITE_ERROR — here caused by dropping facts_fts to induce a schema
  // mismatch — must NOT be swallowed and must reject the search() Promise.
  //
  // This locks that SqliteFactStore.search() does not silently eat real errors.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-13: non-FTS SQLITE_ERROR (e.g. missing table) propagates as rejected Promise', async () => {
    seed('se13-fact', 'observable telemetry metrics tracing', 0.8);

    // Drop the FTS virtual table to force a SQLITE_ERROR on the next search.
    // This simulates a schema corruption / migration mismatch — a real bug,
    // not an FTS parse error.
    db.prepare('DROP TABLE IF EXISTS facts_fts').run();

    await expect(
      impl.search({ query: 'observable', sessionId: SESSION, limit: 10 }),
    ).rejects.toThrow();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-14: Scope fingerprint is deterministic across calls (Slice D+)
  //
  // Two search() calls with identical parameters must produce nextCursors
  // whose decoded `scope` field is identical. This locks that
  // scopeFingerprint() is a pure function with no random/time component.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-14: scope fingerprint deterministic — same params produce same fingerprint across calls', async () => {
    seed('se14-1', 'fingerprint deterministic alpha scope content', 0.8);
    seed('se14-2', 'fingerprint deterministic beta scope content',  0.8);

    const params = { query: 'fingerprint', sessionId: SESSION, limit: 1 } as const;

    const p1a = await impl.search(params);
    const p1b = await impl.search(params);

    expect(p1a.nextCursor).toBeDefined();
    expect(p1b.nextCursor).toBeDefined();

    const decodedA = JSON.parse(Buffer.from(p1a.nextCursor!, 'base64').toString('utf8')) as Record<string, unknown>;
    const decodedB = JSON.parse(Buffer.from(p1b.nextCursor!, 'base64').toString('utf8')) as Record<string, unknown>;

    expect(decodedA.scope).toBeDefined();
    expect(typeof decodedA.scope).toBe('string');
    expect(decodedA.scope).toBe(decodedB.scope);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FS-SE-15: Cursor string stays under 256 bytes for typical params
  //
  // Base64-encoded v1 cursor must not grow unboundedly with longer queries or
  // session IDs. 16-hex-char SHA-256 truncation keeps the scope field short;
  // even with a 60-char query + 40-char session, total cursor stays < 256 B.
  //
  // This is a safety guardrail against accidentally encoding the full canonical
  // scope string (pre-hash) inside the cursor rather than its digest.
  // ─────────────────────────────────────────────────────────────────────────

  it('FS-SE-15: cursor string stays under 256 bytes for typical params (no unbounded growth)', async () => {
    // Use a realistic-length query and session ID to exercise the scope hash.
    const longSession = 'se15-long-session-identifier-for-typical-use-case' as SessionId;
    const longQuery = 'fingerprint cursor versioning scope deterministic limit offset pagination';

    seed('se15-1', 'fingerprint cursor versioning scope deterministic limit offset pagination alpha', 0.8, longSession);
    seed('se15-2', 'fingerprint cursor versioning scope deterministic limit offset pagination beta',  0.8, longSession);

    const result = await impl.search({ query: longQuery, sessionId: longSession, limit: 1 });

    expect(result.nextCursor).toBeDefined();

    // Safety guardrail: cursor must not grow unboundedly even with long params.
    expect(result.nextCursor!.length).toBeLessThan(256);

    const decoded = JSON.parse(Buffer.from(result.nextCursor!, 'base64').toString('utf8')) as Record<string, unknown>;
    // Slice D++ keyset format: must carry v:1, lastSort (composite score), lastId (row id).
    // RED until keyset implementation ships — current cursor carries `offset` not `lastSort`/`lastId`.
    expect(decoded).toMatchObject({
      v: 1,
      lastSort: expect.any(Number),
      lastId: expect.any(Number),
    });
  });
});
