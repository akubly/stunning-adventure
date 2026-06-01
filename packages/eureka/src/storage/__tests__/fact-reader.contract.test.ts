/**
 * FactReader contract test suite (M7-C — Crispin).
 *
 * ## Design
 *
 * `runFactReaderContract` is a shared test helper. Any FactReader implementation
 * can be verified by calling it with a factory that produces a fresh harness
 * (reader + seed function) per test. Adding a new implementation requires only
 * one new `runFactReaderContract(...)` call block — no test duplication.
 *
 * ## Contract invariants covered
 *
 * CL-1  Read existing fact           — returns {trust} for a seeded fact
 * CL-2  Read missing fact            — returns null for unknown factId
 * CL-3  Read wrong-session fact      — returns null for correct factId, wrong session
 * CL-4  Trust passthrough (corrupt)  — NaN trust is returned unchanged; read layer does not validate
 * CL-5  Result shape                 — returned value has a numeric `trust` field
 *
 * ## Baseline test count
 *
 * Each call to runFactReaderContract adds 5 tests.
 * InMemoryFactReader wired below → 5 contract tests total.
 * Baseline (pre-M7-C): 62 tests across 4 files.
 * Post-M7-C total: 67 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { FactReader } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';
import { InMemoryFactReader } from '../fact-reader.js';

// ---------------------------------------------------------------------------
// Shared contract harness type
// ---------------------------------------------------------------------------

type SeedFact = (factId: string, sessionId: SessionId, trust: number) => Promise<void>;

interface FactReaderHarness {
  /** The FactReader implementation under test. */
  reader: FactReader;
  /**
   * Seed a fact into storage so that `reader.read(...)` can find it.
   * Must be async to accommodate both in-memory and I/O-backed implementations.
   */
  seed: SeedFact;
}

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

/**
 * Run the shared FactReader contract suite against any implementation.
 *
 * @param implName  Human-readable label shown in test output (e.g. 'InMemoryFactReader')
 * @param makeHarness  Factory called once per test to produce a fresh, isolated harness
 */
export function runFactReaderContract(
  implName: string,
  makeHarness: () => FactReaderHarness,
): void {
  describe(`FactReader contract — ${implName}`, () => {
    let reader: FactReader;
    let seed: SeedFact;

    beforeEach(() => {
      const harness = makeHarness();
      reader = harness.reader;
      seed = harness.seed;
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
    // -----------------------------------------------------------------------

    it('CL-4: returns {trust: NaN} for a NaN-seeded fact — read layer does NOT validate', async () => {
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
  });
}

// ---------------------------------------------------------------------------
// Wire contract suite to InMemoryFactReader
// ---------------------------------------------------------------------------

runFactReaderContract('InMemoryFactReader', () => {
  const impl = new InMemoryFactReader();
  return {
    reader: impl,
    seed: async (factId, sessionId, trust) => {
      impl.seed(factId, sessionId, trust);
    },
  };
});
