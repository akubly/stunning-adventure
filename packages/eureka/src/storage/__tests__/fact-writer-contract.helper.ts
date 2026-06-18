/**
 * FactWriter contract test helper — shared suite definition.
 *
 * ## Purpose
 *
 * `runFactWriterContract` is a shared test helper. Any FactWriter implementation
 * can be verified by calling it with a factory that produces a fresh harness per
 * test. Adding a new implementation requires only one new call — no test duplication.
 *
 * ## Pattern
 *
 * Mirrors the FactStore / TrustUpdater / FactReader contract helpers in this directory.
 * Non-test file (no `.test.ts`); vitest does not auto-pick it up.
 * `@internal` exports: monorepo-only until a `@akubly/eureka/testing` subpath exists.
 * Fully async-tolerant harness (`makeHarness` may return a Promise).
 *
 * ## Contract invariants covered
 *
 * IM-1   Happy path               — imprint resolves with a non-empty FactId
 * IM-2   IdProvider wiring        — returned FactId matches idProvider.next() output
 * IM-3   Default trust            — omitted trust stored as 0.5
 * IM-4   Default importance       — omitted importance stored as 0
 * IM-5   Default attentionTier    — omitted attentionTier stored as 'warm'
 * IM-6   Custom values            — explicit trust/importance/attentionTier stored verbatim
 * IM-7   Empty content            — throws InvalidImprintError(field:'content'), no write
 * IM-8   Whitespace content       — throws InvalidImprintError(field:'content'), no write
 * IM-9   Invalid trust ×5         — throws InvalidImprintError(field:'trust'), no write
 * IM-10  Invalid importance ×5    — throws InvalidImprintError(field:'importance'), no write
 * IM-11  Invalid attentionTier ×4 — throws InvalidImprintError(field:'attentionTier'), no write
 * IM-12  Session isolation        — sessionA fact invisible to sessionB, visible in sessionA
 * IM-13  Idempotent re-write      — same factId is a no-op; first-write-wins
 * IM-14  Round-trip with recall   — imprinted fact findable via FactStore.search()
 *
 * ## Test count
 *
 * Each wiring call adds 25 tests:
 *   IM-1..IM-8, IM-12..IM-14 = 11 singular tests
 *   IM-9 = 5 parameterized cases
 *   IM-10 = 5 parameterized cases
 *   IM-11 = 4 parameterized cases
 *
 * ## Export visibility
 *
 * @internal — monorepo-internal until a `@akubly/eureka/testing` subpath is established.
 * External consumers should duplicate the suite. Promote when external implementations materialize.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// RED: ../../activities/imprint.ts does not exist until Crispin's GREEN phase.
import { imprint as imprintActivity } from '../../activities/imprint.js';
import type {
  FactWriter,
  ImprintOptions,
  FactId,
  AttentionTier,
  IdProvider,
  ClockProvider,
} from '../../activities/imprint.js';
import type { FactStore } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Shared contract types
// ---------------------------------------------------------------------------

/**
 * Shape of a fact as stored in the underlying store.
 * Return type of the `readFact` side-channel on FactWriterHarness.
 * Mirrors the schema columns written by imprint() (contract §4 schema table).
 *
 * @internal
 */
export interface StoredFact {
  factId: FactId;
  sessionId: SessionId;
  content: string;
  trust: number;
  importance: number;
  attentionTier: AttentionTier;
  /** SQL NULL maps to null (not undefined). */
  lastAccessed: number | null;
  /** ISO 8601 datetime string as stored in SQLite. */
  createdAt: string;
}

/**
 * Test harness for FactWriter contract tests.
 * Mirrors FactStoreHarness / TrustUpdaterHarness / FactReaderHarness.
 *
 * `imprint`     — Pre-wired activity: factWriter + deterministic clock + sequential idProvider.
 * `readFact`    — Side-channel: read a stored fact by (factId, sessionId) without going through
 *                 the activity layer.
 * `factStore`   — FactStore backed by the SAME underlying store as factWriter (for IM-12 isolation
 *                 and IM-14 recall round-trip). Must share state with the writer.
 * `factWriter`  — Direct FactWriter seam, exposed so IM-2 / IM-13 can supply custom IdProviders.
 * `cleanup`     — Optional teardown for native handles (e.g. db.close() for SQLite).
 *
 * `makeHarness` MUST return a fresh isolated instance per test (called via beforeEach).
 * Shared state between tests produces false positives and ordering dependencies.
 *
 * @internal
 */
export interface FactWriterHarness {
  imprint: (options: ImprintOptions) => Promise<FactId>;
  readFact: (factId: FactId, sessionId: SessionId) => Promise<StoredFact | null>;
  factStore: FactStore;
  factWriter: FactWriter;
  cleanup?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Suite-level constants
// ---------------------------------------------------------------------------

const SESSION_A = 'fw-contract-session-A' as SessionId;
const SESSION_B = 'fw-contract-session-B' as SessionId;

/** Fixed timestamp injected for IM-2 / IM-13 custom-deps tests. */
const FIXED_CLOCK: ClockProvider = { now: () => 1_000_000 };

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

/**
 * Run the full FactWriter contract suite against a given implementation factory.
 *
 * Each call adds 24 tests (IM-1..IM-14 with IM-9×5, IM-10×4, IM-11×4 via it.each).
 *
 * @param implName    Human-readable label shown in test output (e.g. 'SqliteFactWriter').
 * @param makeHarness Factory called once per test (via beforeEach) to produce a fresh,
 *   isolated harness. May be async to accommodate I/O-backed setup.
 *
 * @internal
 */
export function runFactWriterContract(
  implName: string,
  makeHarness: () => FactWriterHarness | Promise<FactWriterHarness>,
): void {
  describe(`FactWriter contract — ${implName}`, () => {
    let harness: FactWriterHarness;

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(async () => {
      await harness?.cleanup?.();
    });

    // -----------------------------------------------------------------------
    // IM-1 — Happy path: imprint resolves with a FactId
    //
    // Minimal valid call: content + sessionId only, no optional fields.
    // Proves basic wiring from imprint() → FactWriter → storage works.
    // -----------------------------------------------------------------------

    it('IM-1: happy path — imprint resolves with a non-empty FactId', async () => {
      const id = await harness.imprint({
        content: 'TypeScript uses structural typing',
        sessionId: SESSION_A,
      });

      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    // -----------------------------------------------------------------------
    // IM-2 — Returned FactId matches IdProvider output
    //
    // Calls imprintActivity directly with a fixed idProvider to prove the
    // returned FactId comes from idProvider.next(), not from any other source.
    // Uses harness.factWriter so the same underlying store is used.
    // -----------------------------------------------------------------------

    it('IM-2: returned FactId matches IdProvider output', async () => {
      const EXPECTED_ID = 'test-uuid-001' as FactId;
      const fixedIdProvider: IdProvider = { next: () => EXPECTED_ID };

      const id = await imprintActivity(
        { content: 'fact content for id verification', sessionId: SESSION_A },
        { factWriter: harness.factWriter, clock: FIXED_CLOCK, idProvider: fixedIdProvider },
      );

      expect(id).toBe(EXPECTED_ID);
    });

    // -----------------------------------------------------------------------
    // IM-3 — Default trust is 0.5
    //
    // When trust is omitted, the activity must default to 0.5 (neutral midpoint).
    // Verified via readFact side-channel — confirms storage received the default.
    // -----------------------------------------------------------------------

    it('IM-3: default trust is 0.5 when trust option is omitted', async () => {
      const id = await harness.imprint({ content: 'default trust fact', sessionId: SESSION_A });
      const stored = await harness.readFact(id, SESSION_A);

      expect(stored).not.toBeNull();
      expect(stored!.trust).toBeCloseTo(0.5, 5);
    });

    // -----------------------------------------------------------------------
    // IM-4 — Default importance is 0
    //
    // When importance is omitted, the activity must default to 0 (unscored).
    // Matches migration 002 column DEFAULT 0.
    // -----------------------------------------------------------------------

    it('IM-4: default importance is 0 when importance option is omitted', async () => {
      const id = await harness.imprint({ content: 'default importance fact', sessionId: SESSION_A });
      const stored = await harness.readFact(id, SESSION_A);

      expect(stored).not.toBeNull();
      expect(stored!.importance).toBe(0);
    });

    // -----------------------------------------------------------------------
    // IM-5 — Default attentionTier is 'warm'
    //
    // When attentionTier is omitted, the activity must default to 'warm'.
    // Matches migration 002 column DEFAULT 'warm' (identity multiplier 1.0).
    // -----------------------------------------------------------------------

    it("IM-5: default attentionTier is 'warm' when attentionTier option is omitted", async () => {
      const id = await harness.imprint({
        content: 'default attention tier fact',
        sessionId: SESSION_A,
      });
      const stored = await harness.readFact(id, SESSION_A);

      expect(stored).not.toBeNull();
      expect(stored!.attentionTier).toBe('warm');
    });

    // -----------------------------------------------------------------------
    // IM-6 — Custom values stored verbatim
    //
    // Explicit trust/importance/attentionTier must reach storage exactly as
    // given. No clamping, normalization, or rounding by the storage layer.
    // -----------------------------------------------------------------------

    it('IM-6: custom trust/importance/attentionTier are stored verbatim', async () => {
      const id = await harness.imprint({
        content: 'custom values fact',
        sessionId: SESSION_A,
        trust: 0.9,
        importance: 0.7,
        attentionTier: 'hot',
      });
      const stored = await harness.readFact(id, SESSION_A);

      expect(stored).not.toBeNull();
      expect(stored!.trust).toBeCloseTo(0.9, 5);
      expect(stored!.importance).toBeCloseTo(0.7, 5);
      expect(stored!.attentionTier).toBe('hot');
    });

    // -----------------------------------------------------------------------
    // IM-7 — Empty content throws InvalidImprintError
    //
    // content === '' must reject before any write. code='INVALID_IMPRINT',
    // field='content'. Fresh harness → search must return empty after the error.
    // -----------------------------------------------------------------------

    it('IM-7: empty content throws InvalidImprintError with field=content', async () => {
      await expect(
        harness.imprint({ content: '', sessionId: SESSION_A }),
      ).rejects.toMatchObject({ code: 'INVALID_IMPRINT', field: 'content' });

      const { results } = await harness.factStore.search({
        query: 'anythingAtAll',
        sessionId: SESSION_A,
        limit: 10,
      });
      expect(results).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // IM-8 — Whitespace-only content throws InvalidImprintError
    //
    // content.trim().length === 0 must reject before any write.
    // code='INVALID_IMPRINT', field='content'.
    // -----------------------------------------------------------------------

    it('IM-8: whitespace-only content throws InvalidImprintError with field=content', async () => {
      await expect(
        harness.imprint({ content: '   \t\n  ', sessionId: SESSION_A }),
      ).rejects.toMatchObject({ code: 'INVALID_IMPRINT', field: 'content' });

      const { results } = await harness.factStore.search({
        query: 'anythingAtAll',
        sessionId: SESSION_A,
        limit: 10,
      });
      expect(results).toHaveLength(0);
    });

    // -----------------------------------------------------------------------
    // IM-9 — Out-of-range trust throws InvalidImprintError
    //
    // Parameterized: 1.5, -0.1, NaN, Infinity, -Infinity
    // Each must throw before any write. Validated via factStore.search.
    // -----------------------------------------------------------------------

    it.each([1.5, -0.1, NaN, Infinity, -Infinity])(
      'IM-9: trust=%s throws InvalidImprintError with field=trust',
      async (badTrust) => {
        await expect(
          harness.imprint({
            content: 'im9validcontent trustrangetest',
            sessionId: SESSION_A,
            trust: badTrust,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_IMPRINT', field: 'trust' });

        const { results } = await harness.factStore.search({
          query: 'im9validcontent',
          sessionId: SESSION_A,
          limit: 10,
        });
        expect(results).toHaveLength(0);
      },
    );

    // -----------------------------------------------------------------------
    // IM-10 — Out-of-range importance throws InvalidImprintError
    //
    // Parameterized: 2.0, -0.5, NaN, Infinity
    // Each must throw before any write. Validated via factStore.search.
    // -----------------------------------------------------------------------

    it.each([2.0, -0.5, NaN, Infinity, -Infinity])(
      'IM-10: importance=%s throws InvalidImprintError with field=importance',
      async (badImportance) => {
        await expect(
          harness.imprint({
            content: 'im10validcontent importancerangetest',
            sessionId: SESSION_A,
            importance: badImportance,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_IMPRINT', field: 'importance' });

        const { results } = await harness.factStore.search({
          query: 'im10validcontent',
          sessionId: SESSION_A,
          limit: 10,
        });
        expect(results).toHaveLength(0);
      },
    );

    // -----------------------------------------------------------------------
    // IM-11 — Invalid attentionTier throws InvalidImprintError
    //
    // Parameterized: 'lukewarm', 'HOT' (wrong case), '' (empty string), 'freeze'
    // Cast to bypass TypeScript compile-time check (runtime validation is what's tested).
    // Each must throw before any write. Validated via factStore.search.
    // -----------------------------------------------------------------------

    it.each(['lukewarm', 'HOT', '', 'freeze'])(
      "IM-11: attentionTier='%s' throws InvalidImprintError with field=attentionTier",
      async (badTier) => {
        await expect(
          harness.imprint({
            content: 'im11validcontent attentiontiertest',
            sessionId: SESSION_A,
            attentionTier: badTier as unknown as AttentionTier,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_IMPRINT', field: 'attentionTier' });

        const { results } = await harness.factStore.search({
          query: 'im11validcontent',
          sessionId: SESSION_A,
          limit: 10,
        });
        expect(results).toHaveLength(0);
      },
    );

    // -----------------------------------------------------------------------
    // IM-12 — Session isolation
    //
    // A fact written in sessionA must NOT appear in searches scoped to sessionB,
    // but MUST appear in searches scoped to sessionA.
    // Uses a unique keyword to eliminate cross-test interference.
    // -----------------------------------------------------------------------

    it('IM-12: session isolation — fact from sessionA is invisible to sessionB', async () => {
      const KEYWORD = 'im12isolationuniquekeyword';
      await harness.imprint({
        content: `${KEYWORD} session isolation test fact`,
        sessionId: SESSION_A,
      });

      const { results: resultsB } = await harness.factStore.search({
        query: KEYWORD,
        sessionId: SESSION_B,
        limit: 10,
      });
      expect(resultsB).toHaveLength(0);

      const { results: resultsA } = await harness.factStore.search({
        query: KEYWORD,
        sessionId: SESSION_A,
        limit: 10,
      });
      expect(resultsA.length).toBeGreaterThanOrEqual(1);
    });

    // -----------------------------------------------------------------------
    // IM-13 — Idempotent re-write (same factId + sessionId, first-write-wins)
    //
    // When the same (factId, sessionId) is written twice:
    //   - Second call does NOT throw
    //   - Fact exists exactly once in storage (no duplicate rows)
    //   - Content/trust/importance from FIRST write are preserved
    //
    // Uses a fixed IdProvider that always returns the same FactId, injected via
    // harness.factWriter to exercise the underlying seam's idempotency guarantee.
    // -----------------------------------------------------------------------

    it('IM-13: idempotent re-write — same factId is a no-op; first-write-wins', async () => {
      const FIXED_FACT_ID = 'im13-fixed-fact-id' as FactId;
      const fixedIdProvider: IdProvider = { next: () => FIXED_FACT_ID };

      const id1 = await imprintActivity(
        { content: 'im13firstcontentwins first write', sessionId: SESSION_A },
        { factWriter: harness.factWriter, clock: FIXED_CLOCK, idProvider: fixedIdProvider },
      );

      // Second call: same factId, different content — must NOT throw
      const id2 = await imprintActivity(
        { content: 'im13firstcontentwins second write loses', sessionId: SESSION_A },
        { factWriter: harness.factWriter, clock: FIXED_CLOCK, idProvider: fixedIdProvider },
      );

      expect(id1).toBe(FIXED_FACT_ID);
      expect(id2).toBe(FIXED_FACT_ID);

      // First-write-wins: content from first call preserved
      const stored = await harness.readFact(FIXED_FACT_ID, SESSION_A);
      expect(stored).not.toBeNull();
      expect(stored!.content).toBe('im13firstcontentwins first write');

      // Not duplicated: exactly one result for the unique keyword
      const { results } = await harness.factStore.search({
        query: 'im13firstcontentwins',
        sessionId: SESSION_A,
        limit: 100,
      });
      expect(results).toHaveLength(1);
    });

    // -----------------------------------------------------------------------
    // IM-14 — Round-trip invariant with recall
    //
    // imprint → FTS5 trigger (or in-memory equivalent) → FactStore.search() pipeline.
    // Verifies the full write-to-read round-trip including default value mapping:
    //   - content matches the trimmed imprinted content
    //   - trust === 0.5 (default)
    //   - importance === 0 (default)
    //   - attentionTier === 'warm' (default)
    //   - lastAccessed === undefined (SQL NULL → undefined, per FS-13 convention)
    // -----------------------------------------------------------------------

    it('IM-14: recall round-trip — imprinted fact is findable via FactStore.search()', async () => {
      const KEYWORD = 'im14roundtripuniquekeyword';
      await harness.imprint({
        content: `${KEYWORD} explains particle behavior in quantum mechanics`,
        sessionId: SESSION_A,
      });

      const { results } = await harness.factStore.search({
        query: KEYWORD,
        sessionId: SESSION_A,
        limit: 10,
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      const found = results.find(r => r.content.includes(KEYWORD));
      expect(found).toBeDefined();
      expect(found!.content).toContain(KEYWORD);
      expect(found!.trust).toBeCloseTo(0.5, 5);
      expect(found!.importance).toBe(0);
      expect(found!.attentionTier).toBe('warm');
      expect(found!.lastAccessed).toBeUndefined();
    });
  });
}
