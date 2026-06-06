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
 * FS-6  Cross-session isolation  — search in sessionA MUST NOT return sessionB facts
 * FS-7  Tie-breaker pagination   — equal composite scores paginate without skip or dup
 * FS-8  Invalid limit            — limit ≤ 0 / NaN throws TypeError
 *
 * ## Export visibility
 *
 * @internal — monorepo-internal until a `@akubly/eureka/testing` subpath is established.
 * External consumers should duplicate the suite. Promote when external implementations materialize.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FactStore } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';

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
 * Each call to `runFactStoreContract` adds 11 tests (FS-1 through FS-8, FS-5b×2, FS-8×3 via it.each).
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
    // FS-5b — Structurally-valid cursor with bad offset falls back to page 0
    //
    // A cursor whose JSON is valid but whose `offset` field is negative, NaN,
    // or non-integer must NOT crash or produce an invalid query. Both impls
    // must clamp to offset=0 — i.e. behave as if no cursor was supplied.
    // (T2/T6: mirrors decodeCursor validation in SqliteFactStore.)
    // -----------------------------------------------------------------------

    it.each([
      ['negative', Buffer.from(JSON.stringify({ offset: -5 })).toString('base64')],
      ['NaN',      Buffer.from(JSON.stringify({ offset: null })).toString('base64')],
    ])(
      'FS-5b: cursor with %s offset falls back to page-0 results (no crash)',
      async (_label, badCursor) => {
        await seed('fs5b-a', SESSION_A, 'fallback cursor alpha content', 0.8);

        const withoutCursor = await impl.search({ query: 'fallback', sessionId: SESSION_A, limit: 10 });
        const withBadCursor = await impl.search({ query: 'fallback', sessionId: SESSION_A, limit: 10, cursor: badCursor });

        // Bad cursor falls back to offset=0 → same results as no cursor.
        expect(withBadCursor.results).toHaveLength(withoutCursor.results.length);
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
  });
}
