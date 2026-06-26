/**
 * FactReader contract test helper — shared suite definition.
 *
 * ## Purpose
 *
 * `runFactReaderContract` is a shared test helper. Any FactReader implementation
 * can be verified by calling it with a factory that produces a fresh harness per
 * test. Adding a new implementation requires only one new call — no test duplication.
 *
 * ## Pattern
 *
 * Mirrors the TrustUpdater contract helper at `./trust-updater-contract.helper.ts`.
 * Both helpers use the same structure:
 *   - Non-test file (no `.test.ts`; vitest does not auto-pick it up)
 *   - `@internal` exports: monorepo-only until a `@akubly/eureka/testing` subpath exists
 *   - Fully async-tolerant harness (`makeHarness` may return a Promise)
 *   - `cleanup?: () => void | Promise<void>` for native-handle teardown
 *   - `beforeEach(async)` / `afterEach(async)` await both
 *
 * ## Contract invariants covered
 *
 * CL-1  Read existing fact           — returns {trust} for a seeded fact
 * CL-2  Read missing fact            — returns null for unknown factId
 * CL-3  Read wrong-session fact      — returns null for correct factId, wrong session
 * CL-4  Trust passthrough (corrupt)  — NaN trust returned unchanged; read layer does not validate
 * CL-5  Result shape                 — returned value has a numeric `trust` field
 *
 * ## Export visibility
 *
 * @internal — monorepo-internal until a `@akubly/eureka/testing` subpath is established.
 * External consumers should duplicate the suite (~30 lines). Promote when external
 * implementations materialize.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FactReader } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Shared contract harness type
// ---------------------------------------------------------------------------

type SeedFact = (
  factId: string,
  sessionId: SessionId,
  trust: number,
  content?: string,
  createdAt?: number,
) => Promise<void>;

/**
 * Test harness for FactReader contract tests.
 *
 * `reader`  — The FactReader implementation under test.
 * `seed`    — Side-channel: write a fact into storage before `reader.read(...)`.
 *             Always async so both in-memory and I/O-backed harnesses share the signature.
 * `cleanup` — Optional teardown for native handles (e.g. db.close() for SQLite).
 *
 * @internal
 */
export interface FactReaderHarness {
  reader: FactReader;
  seed: SeedFact;
  cleanup?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

/**
 * Run the shared FactReader contract suite against any implementation.
 *
 * Each call to `runFactReaderContract` adds 5 tests (CL-1 through CL-5).
 *
 * @param implName    Human-readable label shown in test output (e.g. 'InMemoryFactReader').
 * @param makeHarness Factory called once per test (via beforeEach) to produce a fresh,
 *   isolated harness. May be async to accommodate I/O-backed setup.
 *
 * @internal
 */
export function runFactReaderContract(
  implName: string,
  makeHarness: () => FactReaderHarness | Promise<FactReaderHarness>,
): void {
  describe(`FactReader contract — ${implName}`, () => {
    let reader: FactReader;
    let seed: SeedFact;
    let harness: FactReaderHarness;

    beforeEach(async () => {
      harness = await makeHarness();
      reader = harness.reader;
      seed = harness.seed;
    });

    afterEach(async () => {
      await harness?.cleanup?.();
    });

    // -----------------------------------------------------------------------
    // CL-1 — Read existing fact
    //
    // Seed a fact with trust=0.5, read it back → must return {trust: 0.5}.
    // Validates the happy path: a seeded fact is retrievable from the same session.
    // -----------------------------------------------------------------------

    it('CL-1: returns {trust} for a seeded fact', async () => {
      const sessionId = 'session-contract-A' as SessionId;
      await seed('fact-cl1', sessionId, 0.5);

      const result = await reader.read({ factId: 'fact-cl1', sessionId });

      expect(result).toEqual({ trust: 0.5 });
    });

    // -----------------------------------------------------------------------
    // CL-2 — Read missing fact
    //
    // Read a factId that was never seeded → must return null (not undefined).
    // The interface contract prohibits returning undefined.
    // -----------------------------------------------------------------------

    it('CL-2: returns null for a fact that was never seeded', async () => {
      const sessionId = 'session-contract-A' as SessionId;

      const result = await reader.read({ factId: 'fact-nonexistent', sessionId });

      expect(result).toBeNull();
    });

    // -----------------------------------------------------------------------
    // CL-3 — Read wrong-session fact
    //
    // Seed a fact under sessionA, read it under sessionB → must return null.
    // Facts are session-scoped; a different session cannot see another session's facts.
    // -----------------------------------------------------------------------

    it('CL-3: returns null when factId exists but belongs to a different session', async () => {
      const sessionA = 'session-contract-A' as SessionId;
      const sessionB = 'session-contract-B' as SessionId;
      await seed('fact-cl3', sessionA, 0.7);

      const result = await reader.read({ factId: 'fact-cl3', sessionId: sessionB });

      expect(result).toBeNull();
    });

    // -----------------------------------------------------------------------
    // CL-4 — Trust passthrough: corrupt value (NaN)
    //
    // Seed a fact with trust=NaN → read must return {trust: NaN}.
    // The read layer is NOT responsible for validating trust; that is the
    // caller's job (applyFeedbackById throws InvalidTrustValueError(source:'storage')).
    // Silently clamping or filtering at read time would hide storage corruption.
    //
    // Storage round-trip requirement: the harness `seed` function MUST write
    // NaN to the backing store before `read` is called — not cache it in memory.
    // For SQLite implementations, NaN has no native literal and is stored as NULL;
    // `read` must re-hydrate NULL → NaN. This test is the primary regression lock
    // for that NaN→NULL→NaN conversion path.
    // -----------------------------------------------------------------------

    it('CL-4: NaN trust round-trips through the storage write/read cycle — read layer does NOT validate', async () => {
      const sessionId = 'session-contract-A' as SessionId;
      await seed('fact-cl4-corrupt', sessionId, NaN);

      const result = await reader.read({ factId: 'fact-cl4-corrupt', sessionId });

      expect(result).not.toBeNull();
      expect(Number.isNaN(result!.trust)).toBe(true);
    });

    // -----------------------------------------------------------------------
    // CL-5 — Result shape
    //
    // The returned object must have a numeric `trust` field. No extra required
    // fields; implementations may return additional fields but {trust} is the
    // minimum contract shape.
    // -----------------------------------------------------------------------

    it('CL-5: result shape carries a numeric trust field', async () => {
      const sessionId = 'session-contract-A' as SessionId;
      await seed('fact-cl5-shape', sessionId, 0.75);

      const result = await reader.read({ factId: 'fact-cl5-shape', sessionId });

      expect(result).not.toBeNull();
      expect(typeof result!.trust).toBe('number');
    });

    // -----------------------------------------------------------------------
    // CL-6 — listBySession on an unseeded session returns []
    //
    // An empty session must yield an empty array, never null/undefined. This
    // is the substrate guarantee integrate's pair-scan relies on to skip the
    // consolidation pass cleanly when there are no candidates.
    // -----------------------------------------------------------------------

    it('CL-6: listBySession returns [] for an unseeded session', async () => {
      const sessionId = 'session-contract-empty' as SessionId;

      const rows = await reader.listBySession({ sessionId });

      expect(rows).toEqual([]);
    });

    // -----------------------------------------------------------------------
    // CL-7 — listBySession returns seeded facts with {factId, content, createdAt}
    //
    // Substrate shape lock (wave-2): integrate needs factId + content + createdAt
    // per row. trust / attentionTier / importance / lastAccessed are deliberately
    // NOT surfaced — those belong to ranking, not pair-scanning. createdAt is
    // Unix epoch ms so the activity layer can sort canonically (oldest wins).
    // -----------------------------------------------------------------------

    it('CL-7: listBySession returns seeded facts with {factId, content, createdAt} shape', async () => {
      const sessionId = 'session-contract-A' as SessionId;
      const t1 = 1_700_000_000_000; // 2023-11-14T22:13:20Z
      const t2 = 1_700_000_060_000; // 60s later
      await seed('fact-cl7-a', sessionId, 0.6, 'alpha content', t1);
      await seed('fact-cl7-b', sessionId, 0.8, 'beta content', t2);

      const rows = await reader.listBySession({ sessionId });

      expect(rows).toHaveLength(2);
      const byId = new Map(rows.map(r => [r.factId, r]));
      expect(byId.get('fact-cl7-a')).toEqual({ factId: 'fact-cl7-a', content: 'alpha content', createdAt: t1 });
      expect(byId.get('fact-cl7-b')).toEqual({ factId: 'fact-cl7-b', content: 'beta content', createdAt: t2 });
    });

    // -----------------------------------------------------------------------
    // CL-8 — listBySession is session-isolated
    //
    // Facts from session A must not surface in a listBySession call for
    // session B. Mirrors the per-session isolation invariant from CL-3.
    // -----------------------------------------------------------------------

    it('CL-8: listBySession does not leak facts across sessions', async () => {
      const sessionA = 'session-contract-A' as SessionId;
      const sessionB = 'session-contract-B' as SessionId;
      await seed('fact-cl8-a', sessionA, 0.5, 'only A');
      await seed('fact-cl8-b', sessionB, 0.5, 'only B');

      const rowsA = await reader.listBySession({ sessionId: sessionA });
      const rowsB = await reader.listBySession({ sessionId: sessionB });

      expect(rowsA.map(r => r.factId)).toEqual(['fact-cl8-a']);
      expect(rowsB.map(r => r.factId)).toEqual(['fact-cl8-b']);
    });
  });
}
