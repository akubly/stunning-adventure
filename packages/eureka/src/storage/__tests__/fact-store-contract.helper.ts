/**
 * FactStore contract test helper — shared suite definition.
 *
 * ## Purpose
 *
 * `runFactStoreContract` is a shared test helper. Any FactStore implementation
 * can be verified by calling it with a factory that produces a fresh harness per
 * test. Adding a new implementation requires only one new call — no test duplication.
 *
 * ## Pattern
 *
 * Mirrors the FactReader and TrustUpdater contract helpers in this directory.
 * Non-test file (no `.test.ts`); vitest does not auto-pick it up.
 * `@internal` exports: monorepo-only until a `@akubly/eureka/testing` subpath exists.
 * Fully async-tolerant harness (`makeHarness` may return a Promise).
 *
 * ## Contract invariants covered
 *
 * FS-1  Happy-path search        — matching facts are returned
 * FS-2  No-match query           — empty results for unmatched query
 * FS-3  minTrust floor           — below-threshold facts excluded
 * FS-4  Composite sort lock      — equal-trust higher-freq fact ranks first (BM25 footgun lock)
 * FS-5  Cursor pagination        — nextCursor returned when more rows exist; round-trip yields next page
 * FS-5b Bad cursor (garbage/restart)  — structurally-invalid cursor restarts from page 1
 * FS-6  Cross-session isolation  — search in sessionA MUST NOT return sessionB facts
 * FS-7  Tie-breaker pagination   — equal composite scores paginate without skip or dup
 * FS-8  Invalid limit            — limit ≤ 0 / NaN throws TypeError
 * FS-9  Invalid minTrust         — NaN / Infinity / out-of-range throws TypeError
 * FS-10a v1 cursor correct scope  — pagination advances; nextCursor is keyset v1 format (lastSort/lastId)
 * FS-10b v1 cursor wrong query    — throws CursorScopeMismatchError
 * FS-10c v1 cursor wrong session  — throws CursorScopeMismatchError
 * FS-10d v1 cursor wrong minTrust — throws CursorScopeMismatchError
 * FS-10e v1 cursor wrong limit    — throws CursorScopeMismatchError
 * FS-10f DELETED                  — v0 backward-compat removed (Slice D++); v-absent = garbage = restart
 * FS-10g unknown version v:99     — throws CursorVersionUnsupportedError
 * FS-10h empty query + bad cursor version — cursor decoded before empty-query short-circuit
 * FS-11  FSE-2 closure (insert-safe)  — concurrent insert between pages does NOT cause dup (keyset safety).
 *                                        Trust mutations of already-returned rows are an explicit out-of-scope
 *                                        case: callers needing strict stability under concurrent trust writes
 *                                        should restart pagination.
 * FS-12  Attention-column read-through — non-default attentionTier/importance/lastAccessed seeded
 *                                         via SeedFact opts surface unchanged from search() for ALL impls.
 * FS-13  Attention-column defaults     — a fact seeded without attention opts returns attentionTier 'warm',
 *                                         importance 0, lastAccessed absent (undefined).
 *
 * ## Export visibility
 *
 * @internal — monorepo-internal until a `@akubly/eureka/testing` subpath is established.
 * External consumers should duplicate the suite. Promote when external implementations materialize.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FactStore } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';
import { CursorScopeMismatchError, CursorVersionUnsupportedError } from '../errors.js';

// ---------------------------------------------------------------------------
// Shared contract harness type
// ---------------------------------------------------------------------------

/**
 * Side-channel seed function: write a fact into storage so `search()` can find it.
 *
 * `factId`    — unique identifier within the session
 * `sessionId` — session scope
 * `content`   — searchable text content
 * `trust`     — trust score ∈ [0,1]
 * `attention` — optional attention-column overrides (migration 002 columns).
 *   When omitted, defaults apply: importance=0, lastAccessed=null→undefined, attentionTier='warm'.
 *   `lastAccessed: null` explicitly stores SQL NULL (→ undefined in results); omitting the key
 *   is equivalent. Both impls must honour these values in their seed logic.
 *
 * Always async so both in-memory and I/O-backed harnesses share the same signature.
 *
 * @internal
 */
export type SeedFact = (
  factId: string,
  sessionId: SessionId,
  content: string,
  trust: number,
  attention?: {
    importance?: number;
    lastAccessed?: number | null;
    attentionTier?: 'hot' | 'warm' | 'cold';
  },
) => Promise<void>;

/**
 * Test harness for FactStore contract tests.
 *
 * `impl`     — The FactStore implementation under test.
 * `seed`     — Side-channel: write a fact into storage before `search()`.
 * `cleanup`  — Optional teardown for native handles (e.g. db.close() for SQLite).
 *
 * @internal
 */
export interface FactStoreHarness {
  impl: FactStore;
  seed: SeedFact;
  cleanup?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

const SESSION_A = 'fs-contract-session-A' as SessionId;
const SESSION_B = 'fs-contract-session-B' as SessionId;

/**
 * Run the full FactStore contract suite against a given implementation factory.
 *
 * Slice D++ update: FS-10f deleted (v0 backward-compat removed); FS-11 added (FSE-2
 * concurrent-insert safety). FS-5b gains a third RED case (v0-with-valid-offset).
 * Attention-column contract (FS-12/FS-13) added: SeedFact extended with optional `attention`
 * opts; both InMemoryFactStore and SqliteFactStore seeds honour them.
 * Each call adds 27 tests (FS-1..FS-13; FS-5b×3, FS-8×3, FS-9×4, FS-10a–h×7 via it/it.each).
 *
 * @param implName    Human-readable label shown in test output (e.g. 'SqliteFactStore').
 * @param makeHarness Factory called once per test (via beforeEach) to produce a fresh,
 *   isolated harness. May be async to accommodate I/O-backed setup.
 *
 * @internal
 */
export function runFactStoreContract(
  implName: string,
  makeHarness: () => FactStoreHarness | Promise<FactStoreHarness>,
): void {
  describe(`FactStore contract — ${implName}`, () => {
    let impl: FactStore;
    let seed: SeedFact;
    let harness: FactStoreHarness;

    beforeEach(async () => {
      harness = await makeHarness();
      impl = harness.impl;
      seed = harness.seed;
    });

    afterEach(async () => {
      await harness?.cleanup?.();
    });

    // -----------------------------------------------------------------------
    // FS-1 — Happy-path search
    //
    // Seed a fact whose content includes the query keyword. search() must
    // return at least that fact in results. Proves basic FTS wiring works.
    // -----------------------------------------------------------------------

    it('FS-1: returns matching fact for a keyword present in seeded content', async () => {
      await seed('fs1-fact', SESSION_A, 'machine learning neural network', 0.8);

      const { results } = await impl.search({
        query: 'machine',
        sessionId: SESSION_A,
        limit: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find(r => r.content.includes('machine learning'));
      expect(found).toBeDefined();
      expect(found!.trust).toBeCloseTo(0.8, 5);
    });

    // -----------------------------------------------------------------------
    // FS-2 — Empty result for no-match query
    //
    // No seeded fact contains the query keyword → results must be empty.
    // Verifies the store does not return unrelated facts.
    // -----------------------------------------------------------------------

    it('FS-2: returns empty results when no fact matches the query', async () => {
      await seed('fs2-fact', SESSION_A, 'database indexes and performance', 0.8);

      const { results } = await impl.search({
        query: 'quantum physics',
        sessionId: SESSION_A,
        limit: 10,
      });

      expect(results).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // FS-3 — minTrust floor excludes below-threshold facts
    //
    // Seed two matching facts: one above threshold (trust=0.8), one below
    // (trust=0.10, below default floor 0.15). Only the above-threshold fact
    // must appear in results when minTrust=0.15.
    // Also covers the NULL-trust (NaN sentinel) exclusion path — NULL facts
    // must never surface regardless of minTrust.
    // -----------------------------------------------------------------------

    it('FS-3: minTrust floor excludes facts with trust below threshold', async () => {
      await seed('fs3-above', SESSION_A, 'authentication security protocol', 0.8);
      await seed('fs3-below', SESSION_A, 'authentication tokens below floor', 0.10);

      const { results } = await impl.search({
        query: 'authentication',
        sessionId: SESSION_A,
        limit: 10,
        minTrust: 0.15,
      });

      const contents = results.map(r => r.content);
      // above-threshold fact must be included
      expect(contents.some(c => c.includes('security protocol'))).toBe(true);
      // below-threshold fact must be excluded
      expect(contents.some(c => c.includes('below floor'))).toBe(false);
      // all returned facts respect the floor
      expect(results.every(r => r.trust >= 0.15)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // FS-4 — Result ordering: composite sort lock (BM25 footgun regression lock)
    //
    // With equal trust, the composite score `-bm25 × trust` preserves BM25
    // ordering, so the higher-frequency-term fact sorts first. This is the
    // primary regression lock against the BM25 sign-convention footgun.
    //
    // NOTE: relevance scores are NOT asserted to be in non-increasing order here.
    // Relevance is pure BM25 quality; result ORDER is composite (-bm25 × trust).
    // With equal trust they coincide — but that is coincidental, not a contract.
    // The heterogeneous-trust invariant (FS-SE-x in edges test) locks the
    // distinction: relevance ≠ sort position when trust varies.
    // -----------------------------------------------------------------------

    it('FS-4: results ordered by composite sort — higher-frequency term match ranks first (BM25 footgun lock)', async () => {
      // fact-high has the keyword 3 times → higher term frequency → better BM25 score.
      await seed('fs4-high', SESSION_A, 'network security network network', 0.8);
      // fact-low has the keyword once → lower term frequency.
      await seed('fs4-low',  SESSION_A, 'network firewall',                 0.8);

      const { results } = await impl.search({
        query: 'network',
        sessionId: SESSION_A,
        limit: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      // Higher-frequency fact must rank above lower-frequency fact (equal trust → BM25 dominates).
      const highIdx = results.findIndex(r => r.content.includes('security network network'));
      const lowIdx  = results.findIndex(r => r.content.includes('firewall'));
      expect(highIdx).not.toBe(-1);
      expect(lowIdx).not.toBe(-1);
      expect(highIdx).toBeLessThan(lowIdx);
    });

    // -----------------------------------------------------------------------
    // FS-5 — Cursor pagination round-trip
    //
    // Seed 3 facts all containing the query keyword. Fetch with limit=1 three
    // times via cursor chain. Each page must return exactly one unique fact;
    // the final page must have no nextCursor. No duplicates across pages.
    // -----------------------------------------------------------------------

    it('FS-5: cursor pagination round-trip — nextCursor present when more rows exist, absent on last page', async () => {
      await seed('fs5-a', SESSION_A, 'pagination alpha data point', 0.8);
      await seed('fs5-b', SESSION_A, 'pagination beta data point',  0.7);
      await seed('fs5-c', SESSION_A, 'pagination gamma data point', 0.6);

      const page1 = await impl.search({ query: 'pagination', sessionId: SESSION_A, limit: 1 });
      expect(page1.results).toHaveLength(1);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await impl.search({ query: 'pagination', sessionId: SESSION_A, limit: 1, cursor: page1.nextCursor });
      expect(page2.results).toHaveLength(1);
      expect(page2.nextCursor).toBeDefined();

      const page3 = await impl.search({ query: 'pagination', sessionId: SESSION_A, limit: 1, cursor: page2.nextCursor });
      expect(page3.results).toHaveLength(1);
      expect(page3.nextCursor).toBeUndefined();

      // No duplicates across pages.
      const allContents = [
        page1.results[0].content,
        page2.results[0].content,
        page3.results[0].content,
      ];
      const unique = new Set(allContents);
      expect(unique.size).toBe(3);
    });

    // -----------------------------------------------------------------------
    // FS-5b — Structurally-valid cursor falls back to page 1 (restart)
    //
    // Slice D++ semantics:
    //   - A v0 cursor (absent `v` key) with any offset value must NOT have
    //     its offset honored — it is now treated as garbage → restart page 1.
    //   - The existing negative/NaN cases still restart (they were garbage
    //     before too), but a v0 cursor with a VALID positive offset (e.g.
    //     offset:5) previously advanced the page — it must now restart.
    //
    // RED (third case only): current impl honors `{ offset: 5 }` in v0 cursors
    // and returns page 2. New contract: v0 absent → restart → page 1.
    // -----------------------------------------------------------------------

    it.each([
      ['negative offset',          Buffer.from(JSON.stringify({ offset: -5 })).toString('base64')],
      ['NaN offset (serialised null)', Buffer.from(JSON.stringify({ offset: null })).toString('base64')],
      // ↓ RED: current impl honors this v0 offset and skips to page 2 (empty with 1 fact);
      //   keyset contract: v0 absent = garbage → restart = same as no cursor.
      ['v0 valid-offset-5 (now garbage)', Buffer.from(JSON.stringify({ offset: 5 })).toString('base64')],
    ])(
      'FS-5b: cursor with %s falls back to page-1 results (restart, no crash)',
      async (_label, badCursor) => {
        await seed('fs5b-a', SESSION_A, 'fallback cursor alpha content', 0.8);

        const withoutCursor = await impl.search({ query: 'fallback', sessionId: SESSION_A, limit: 10 });
        const withBadCursor = await impl.search({ query: 'fallback', sessionId: SESSION_A, limit: 10, cursor: badCursor });

        // Bad/v0 cursor falls back to page 1 → identical content and order as no-cursor baseline.
        expect(withBadCursor.results.map(r => r.content)).toEqual(withoutCursor.results.map(r => r.content));
      },
    );

    // -----------------------------------------------------------------------
    // FS-6 — Cross-session isolation
    //
    // Seed a fact under SESSION_A. A search under SESSION_B must return empty
    // results — facts are NEVER shared across session boundaries.
    // -----------------------------------------------------------------------

    it('FS-6: cross-session isolation — sessionA facts not visible in sessionB search', async () => {
      await seed('fs6-fact', SESSION_A, 'authentication security protocol', 0.8);

      const { results } = await impl.search({
        query: 'authentication',
        sessionId: SESSION_B,
        limit: 10,
      });

      expect(results).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // FS-7 — Deterministic tie-breaker pagination (no skip / no dup on ties)
    //
    // Seed 3 facts with distinct-but-equal-score content in non-lexicographic
    // insertion order (tie-c, tie-a, tie-b). Equal composite scores must be
    // broken by insertion order so OFFSET pagination never skips or duplicates
    // a row. The content is distinguishable so a dup would fail the Set check.
    // -----------------------------------------------------------------------

    it('FS-7: pagination across tied composite scores — no gaps or duplicates', async () => {
      // Insert in non-lexicographic order so the test fails if either impl
      // falls back to lexicographic (factId) rather than insertion-order sort.
      await seed('tie-c', SESSION_A, 'tiebreak pagination fact-c', 0.8);
      await seed('tie-a', SESSION_A, 'tiebreak pagination fact-a', 0.8);
      await seed('tie-b', SESSION_A, 'tiebreak pagination fact-b', 0.8);

      const page1 = await impl.search({ query: 'tiebreak', sessionId: SESSION_A, limit: 2 });
      expect(page1.results).toHaveLength(2);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await impl.search({ query: 'tiebreak', sessionId: SESSION_A, limit: 2, cursor: page1.nextCursor });
      expect(page2.results).toHaveLength(1);
      expect(page2.nextCursor).toBeUndefined();

      // Exactly 3 distinct facts across both pages — no skip, no dup.
      const all = [...page1.results, ...page2.results];
      expect(all).toHaveLength(3);
      expect(new Set(all.map(r => r.content)).size).toBe(3);
    });

    // -----------------------------------------------------------------------
    // FS-8 — Invalid limit throws TypeError
    //
    // limit <= 0 (or non-finite / non-integer) causes a non-advancing cursor
    // that could produce an infinite pagination loop. Must throw TypeError.
    // -----------------------------------------------------------------------

    it.each([0, -1, NaN])(
      'FS-8 (limit=%s): invalid limit throws TypeError',
      async (badLimit) => {
        await expect(
          impl.search({ query: 'test', sessionId: SESSION_A, limit: badLimit }),
        ).rejects.toThrow(TypeError);
      },
    );

    // -----------------------------------------------------------------------
    // FS-9 — Invalid minTrust throws TypeError
    //
    // minTrust is optional (default 0.15, always valid). When explicitly
    // supplied, NaN / Infinity / out-of-range values silently make WHERE
    // trust >= ? filter out everything — masking upstream bugs. Must throw.
    // -----------------------------------------------------------------------

    it.each([NaN, Infinity, -0.1, 1.1])(
      'FS-9 (minTrust=%s): invalid minTrust throws TypeError',
      async (badMinTrust) => {
        await expect(
          impl.search({ query: 'test', sessionId: SESSION_A, limit: 10, minTrust: badMinTrust }),
        ).rejects.toThrow(TypeError);
      },
    );

    // =======================================================================
    // FS-10 — Cursor versioning + scope fingerprint (Slice D+, GREEN)
    //
    // Implemented: encodeCursor emits { v:1, lastSort, lastId, scope }; decodeCursor
    // throws CursorVersionUnsupportedError for any present v ≠ 1; search()
    // checks scope fingerprint on v1 cursors and throws CursorScopeMismatchError
    // on mismatch. InMemoryFactStore reference impl lives in
    // `fact-store.contract.test.ts` (not in this file).
    //
    // Strategy for scope-mismatch tests (FS-10b–e):
    //   • Get a real cursor by calling search() with params A → nextCursor.
    //   • Call search() again with one param changed (params B) + that cursor.
    //   • Expect CursorScopeMismatchError.
    // This avoids hard-coding the internal fingerprint format.
    // =======================================================================

    // -----------------------------------------------------------------------
    // FS-10a — v1 cursor with correct scope → pagination advances normally
    //
    // Verify that the opaque round-trip still works AND that the cursor emitted
    // is in v1 format (has `v:1` and a `scope` field).
    // -----------------------------------------------------------------------

    it('FS-10a: v1 cursor with correct scope fingerprint → pagination advances normally', async () => {
      await seed('fs10a-1', SESSION_A, 'versioning cursor alpha data point', 0.8);
      await seed('fs10a-2', SESSION_A, 'versioning cursor beta data point',  0.8);
      await seed('fs10a-3', SESSION_A, 'versioning cursor gamma data point', 0.7);

      const p1 = await impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1 });
      expect(p1.results).toHaveLength(1);
      expect(p1.nextCursor).toBeDefined();

      // Slice D++ keyset format: v:1, lastSort (composite score), lastId (row id), scope.
      // No `offset` field — keyset cursor carries sort anchor, not a positional offset.
      const decoded = JSON.parse(Buffer.from(p1.nextCursor!, 'base64').toString('utf8')) as Record<string, unknown>;
      expect(decoded).toMatchObject({
        v: 1,
        lastSort: expect.any(Number),
        lastId: expect.any(Number),
        scope: expect.any(String),
      });
      expect(decoded).not.toHaveProperty('offset');

      // Pass the cursor back with identical params → must advance to page 2.
      const p2 = await impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1, cursor: p1.nextCursor });
      expect(p2.results).toHaveLength(1);
      expect(p2.results[0].content).not.toBe(p1.results[0].content);
    });

    // -----------------------------------------------------------------------
    // FS-10b — v1 cursor, different query → throws CursorScopeMismatchError
    //
    // Get a cursor from a 'versioning' search. Re-use it in a 'different'
    // search. Scope fingerprint includes query → mismatch → throw.
    // -----------------------------------------------------------------------

    it('FS-10b: v1 cursor with wrong query scope → throws CursorScopeMismatchError', async () => {
      await seed('fs10b-1', SESSION_A, 'versioning cursor scope mismatch alpha', 0.8);
      await seed('fs10b-2', SESSION_A, 'versioning cursor scope mismatch beta',  0.8);
      await seed('fs10b-3', SESSION_A, 'versioning cursor scope mismatch gamma', 0.7);

      // Obtain a real cursor whose scope fingerprint encodes query='versioning'.
      const p1 = await impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1 });
      expect(p1.nextCursor).toBeDefined();

      // Pass that cursor to a search with a different query → scope mismatch.
      await expect(
        impl.search({ query: 'different', sessionId: SESSION_A, limit: 1, cursor: p1.nextCursor }),
      ).rejects.toThrow(CursorScopeMismatchError);
    });

    // -----------------------------------------------------------------------
    // FS-10c — v1 cursor, different sessionId → throws CursorScopeMismatchError
    //
    // Scope fingerprint includes sessionId (defense-in-depth against accidental
    // cross-session cursor sharing). Mismatch must throw.
    // -----------------------------------------------------------------------

    it('FS-10c: v1 cursor with wrong sessionId scope → throws CursorScopeMismatchError', async () => {
      await seed('fs10c-1', SESSION_A, 'versioning session mismatch alpha data', 0.8);
      await seed('fs10c-2', SESSION_A, 'versioning session mismatch beta data',  0.8);
      await seed('fs10c-3', SESSION_A, 'versioning session mismatch gamma data', 0.7);

      // Cursor scope encodes sessionId=SESSION_A.
      const p1 = await impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1 });
      expect(p1.nextCursor).toBeDefined();

      // Pass that cursor to a search under SESSION_B → sessionId mismatch.
      await expect(
        impl.search({ query: 'versioning', sessionId: SESSION_B, limit: 1, cursor: p1.nextCursor }),
      ).rejects.toThrow(CursorScopeMismatchError);
    });

    // -----------------------------------------------------------------------
    // FS-10d — v1 cursor, different minTrust → throws CursorScopeMismatchError
    //
    // minTrust changes the WHERE predicate; a cursor from minTrust=0.15 is not
    // safe to reuse with minTrust=0.5 (different result set). Must throw.
    // -----------------------------------------------------------------------

    it('FS-10d: v1 cursor with wrong minTrust scope → throws CursorScopeMismatchError', async () => {
      await seed('fs10d-1', SESSION_A, 'versioning trust mismatch alpha data', 0.8);
      await seed('fs10d-2', SESSION_A, 'versioning trust mismatch beta data',  0.8);
      await seed('fs10d-3', SESSION_A, 'versioning trust mismatch gamma data', 0.7);

      // Cursor scope encodes minTrust=0.15 (default).
      const p1 = await impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1, minTrust: 0.15 });
      expect(p1.nextCursor).toBeDefined();

      // Pass that cursor to a search with minTrust=0.5 → minTrust mismatch.
      await expect(
        impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1, minTrust: 0.5, cursor: p1.nextCursor }),
      ).rejects.toThrow(CursorScopeMismatchError);
    });

    // -----------------------------------------------------------------------
    // FS-10e — v1 cursor, different limit → throws CursorScopeMismatchError
    //
    // limit changes the page stride; reusing a limit=1 cursor with limit=2
    // would skip every other row. Scope fingerprint includes limit → must throw.
    // -----------------------------------------------------------------------

    it('FS-10e: v1 cursor with wrong limit scope → throws CursorScopeMismatchError', async () => {
      await seed('fs10e-1', SESSION_A, 'versioning limit mismatch alpha data', 0.8);
      await seed('fs10e-2', SESSION_A, 'versioning limit mismatch beta data',  0.8);
      await seed('fs10e-3', SESSION_A, 'versioning limit mismatch gamma data', 0.7);
      await seed('fs10e-4', SESSION_A, 'versioning limit mismatch delta data', 0.6);

      // Cursor scope encodes limit=1.
      const p1 = await impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1 });
      expect(p1.nextCursor).toBeDefined();

      // Pass that cursor to a search with limit=2 → limit mismatch.
      await expect(
        impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 2, cursor: p1.nextCursor }),
      ).rejects.toThrow(CursorScopeMismatchError);
    });

    // -----------------------------------------------------------------------
    // FS-10f — DELETED (Slice D++)
    //
    // v0 backward-compat is removed: a cursor with no `v` field is now treated
    // as garbage (restart), not as a legacy offset cursor.  The FS-10f test
    // that validated v0-cursor offset-honoring is intentionally absent.
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // FS-10g — Cursor with `v: 99` (unknown future version) → throws
    //
    // A cursor carrying an unrecognised version number must be rejected so
    // that a stale (old) implementation doesn't silently misinterpret a
    // future (new) cursor format. Must throw CursorVersionUnsupportedError.
    // -----------------------------------------------------------------------

    it('FS-10g: cursor with v:99 (unknown future version) → throws CursorVersionUnsupportedError', async () => {
      await seed('fs10g-1', SESSION_A, 'versioning future cursor content', 0.8);

      // Construct a syntactically valid cursor carrying an unknown version tag.
      const futureCursor = Buffer.from(
        JSON.stringify({ v: 99, offset: 0, scope: 'deadbeefcafe0000' }),
      ).toString('base64');

      await expect(
        impl.search({ query: 'versioning', sessionId: SESSION_A, limit: 1, cursor: futureCursor }),
      ).rejects.toThrow(CursorVersionUnsupportedError);
    });

    // -----------------------------------------------------------------------
    // FS-10h — empty query + unsupported cursor version → consistent throw
    //
    // Both impls MUST validate/decode the cursor BEFORE the empty-query
    // short-circuit so that an invalid cursor version always throws —
    // regardless of whether the query string is empty or not.
    // -----------------------------------------------------------------------

    it('FS-10h: empty query + v:99 cursor → throws CursorVersionUnsupportedError (cursor validated before query check)', async () => {
      const futureCursor = Buffer.from(
        JSON.stringify({ v: 99, offset: 0, scope: 'deadbeefcafe0001' }),
      ).toString('base64');

      // Both impls must throw — cursor validation must precede empty-query short-circuit.
      await expect(
        impl.search({ query: '', sessionId: SESSION_A, limit: 10, cursor: futureCursor }),
      ).rejects.toThrow(CursorVersionUnsupportedError);
    });

    // =======================================================================
    // FS-11 — FSE-2 closure: concurrent insert between pages does NOT cause
    //         a duplicate row in subsequent pages (keyset safety guarantee)
    //
    // This is the core safety property that keyset pagination provides over
    // offset pagination.  With offset, inserting a higher-ranked row between
    // page fetches shifts all subsequent rows down by 1 — the next OFFSET call
    // returns the row that was already returned on page 1 (duplicate).  With
    // keyset, the WHERE clause anchors on (lastSort, lastId), so previously
    // returned rows can never re-appear regardless of concurrent inserts.
    //
    // Setup:
    //   A: 'fse2-safety alpha'  × 3 occurrences  trust=0.8  (score ≈ 2.4)
    //   B: 'fse2-safety beta'   × 1 occurrence   trust=0.8  (score ≈ 0.8)
    //
    // Sequence:
    //   1. Page 1 (limit=1): returns [A]; cursor encodes lastSort=composite(A), lastId=A.id
    //   2. Seed C:  'fse2-safety gamma'  × 4 occurrences  trust=0.8  (score ≈ 3.2 > A)
    //   3. Page 2 with cursor:
    //      - Offset impl: new sort order [C, A, B]; OFFSET 1 → returns A (DUPLICATE!)
    //      - Keyset impl: WHERE composite < composite(A) → returns B (correct, no dup)
    //
    // FSE-2 insert-safe guarantee: the keyset WHERE clause anchors on (lastSort, lastId),
    // so rows scored above the cursor anchor (C) are excluded and no previously-seen row
    // (A) can re-appear regardless of concurrent inserts — page 2 returns B, no skip or dup.
    // =======================================================================

    it('FS-11: FSE-2 — inserting a higher-ranked fact between page fetches does NOT produce a duplicate', async () => {
      // Seed A (moderate score) and B (low score).
      await seed('fse2-a', SESSION_A, 'fse2safety fse2safety fse2safety alpha', 0.8);
      await seed('fse2-b', SESSION_A, 'fse2safety beta', 0.8);

      // Page 1: must return A (highest score before insert).
      const page1 = await impl.search({ query: 'fse2safety', sessionId: SESSION_A, limit: 1 });
      expect(page1.results).toHaveLength(1);
      expect(page1.results[0].content).toContain('alpha');
      expect(page1.nextCursor).toBeDefined();

      // Insert C with a HIGHER score than A between page 1 and page 2.
      // With offset impl: this shifts A to index 1, causing OFFSET-1 to re-return A (dup).
      // With keyset impl:  C is above the cursor anchor → excluded; B is below → returned.
      await seed('fse2-c', SESSION_A, 'fse2safety fse2safety fse2safety fse2safety gamma', 0.8);

      // Page 2: must contain B (lower score), NOT A (already seen) or C (newly inserted above anchor).
      const page2 = await impl.search({ query: 'fse2safety', sessionId: SESSION_A, limit: 1, cursor: page1.nextCursor });
      expect(page2.results).toHaveLength(1);

      // FSE-2 keyset guarantee: page 2 must return B, not A.
      // Failure here means the offset impl shifted A into page 2 (duplicate).
      expect(page2.results[0].content).toContain('beta');
      expect(page2.results[0].content).not.toContain('alpha');

      // Complete coverage: verify the three facts together cover A and B (no skip of B either).
      const allContents = [page1.results[0].content, page2.results[0].content];
      expect(new Set(allContents).size).toBe(2);
    });

    // =======================================================================
    // FS-12 — Attention-column read-through (migration 002 columns)
    //
    // A fact seeded with non-default attention values (attentionTier 'hot'/'cold',
    // importance > 0, non-null lastAccessed) MUST surface those exact values from
    // search() in ALL FactStore implementations.
    //
    // Previously FS-SE-16a–d lived in fact-store-sqlite-edges.test.ts because
    // SeedFact had no attention params and InMemoryFactStore did not model them.
    // SeedFact is now extended with an optional `attention` opts argument and
    // InMemoryFactStore stores/returns all three columns — so this invariant is
    // promoted to the shared contract and enforced for every implementation.
    //
    // Placement rationale: attention-column read-through is now a contract-level
    // concern, not a SQLite-specific SELECT-mapping concern. Both impls must
    // honour the full RecallResult shape when these columns are populated.
    // =======================================================================

    it('FS-12: hot-tier fact seeded with importance and lastAccessed surfaces those values via search()', async () => {
      const epochMs = 1_749_600_000_000; // 2025-06-11T00:00:00.000Z — fixed, not Date.now()
      await seed('fs12-hot', SESSION_A, 'attention contract hot tier signal beacon', 0.8, {
        attentionTier: 'hot',
        importance: 0.9,
        lastAccessed: epochMs,
      });

      const { results } = await impl.search({ query: 'attention', sessionId: SESSION_A, limit: 10 });

      const found = results.find(r => r.content.includes('hot tier signal beacon'));
      expect(found).toBeDefined();
      expect(found!.attentionTier).toBe('hot');
      expect(found!.importance).toBeCloseTo(0.9, 5);
      expect(found!.lastAccessed).toBe(epochMs);
    });

    it('FS-12b: cold-tier fact surfaces attentionTier cold via search()', async () => {
      await seed('fs12-cold', SESSION_A, 'attention contract cold tier archive signal', 0.8, {
        attentionTier: 'cold',
      });

      const { results } = await impl.search({ query: 'attention', sessionId: SESSION_A, limit: 10 });

      const found = results.find(r => r.content.includes('cold tier archive signal'));
      expect(found).toBeDefined();
      expect(found!.attentionTier).toBe('cold');
    });

    // =======================================================================
    // FS-13 — Attention-column defaults
    //
    // A fact seeded without any attention opts (the common case) must return
    // attentionTier 'warm', importance 0, and lastAccessed absent (undefined).
    // Previously locked in FS-SE-16e (SQLite-edges). Now enforced here for all
    // impls to prevent regressions in the default-tier path.
    // =======================================================================

    it('FS-13: default-seeded fact (no attention opts) returns attentionTier warm, importance 0, lastAccessed absent', async () => {
      await seed('fs13-default', SESSION_A, 'attention default warm baseline tier fact', 0.8);

      const { results } = await impl.search({ query: 'attention', sessionId: SESSION_A, limit: 10 });

      const found = results.find(r => r.content.includes('warm baseline tier fact'));
      expect(found).toBeDefined();
      expect(found!.attentionTier).toBe('warm');
      expect(found!.importance).toBe(0);
      expect(found!.lastAccessed).toBeUndefined();
    });
  });
}
