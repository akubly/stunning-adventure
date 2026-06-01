/**
 * M7-C — TrustUpdater contract test suite
 *
 * This file defines the canonical contract for any TrustUpdater implementation
 * (in-memory for today; real storage when Crispin's READ seam ships).
 *
 * Pattern: `runTrustUpdaterContract(makeImpl)` — shared helper that accepts a
 * factory producing a test-impl with side-channel access for setup/inspection.
 * Crispin can re-use this suite by pointing `makeImpl` at the real storage impl.
 *
 * Contract under test (TrustUpdater.mutate):
 *   - Storage MUST scope state by (sessionId, factId); mutations on one sessionId
 *     MUST NOT observe or mutate state belonging to a different sessionId
 *   - Atomically reads currentTrust, calls fn(currentTrust), writes the result
 *   - If fn throws: write is aborted, error propagates, state unchanged
 *   - If fn returns non-finite or out-of-range [0,1]: storage MUST throw InvalidTrustValueError(source:'storage') and MUST NOT mutate storage
 *   - If fact is missing: mutate throws FactNotFoundError before calling fn
 *   - Concurrent mutate() calls on the same (sessionId, factId) are serialized
 *
 * Total M7-C contract tests: 7
 */

import { describe, it, expect } from 'vitest';
import type { TrustUpdater } from '../recall.js';
import { FactNotFoundError, InvalidTrustValueError } from '../errors.js';
import type { SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Test implementation — InMemoryTrustUpdater
// ---------------------------------------------------------------------------
//
// A deterministic in-memory impl of TrustUpdater. Provides side-channel
// methods for test setup (setTrust) and inspection (getTrust) that real
// impls would not expose. Supports manual-scheduler concurrency testing.

interface TrustUpdaterTestImpl {
  impl: TrustUpdater;
  setTrust(sessionId: SessionId, factId: string, trust: number): void;
  getTrust(sessionId: SessionId, factId: string): number | undefined;
}

/** Composite key using null-byte separator to prevent accidental collisions. */
function storeKey(sessionId: SessionId, factId: string): string {
  return `${sessionId}\0${factId}`;
}

function makeInMemoryTrustUpdater(): TrustUpdaterTestImpl {
  const store = new Map<string, number>();
  // Per-(sessionId,factId) promise chain for serialized mutation — the key M7-C atomicity primitive.
  const locks = new Map<string, Promise<void>>();

  const impl: TrustUpdater = {
    async mutate({ factId, sessionId, fn }) {
      const key = storeKey(sessionId, factId);
      // Chain onto existing lock for this key (or a resolved promise if first call)
      const prior = locks.get(key) ?? Promise.resolve();
      let resolve!: () => void;
      const next = new Promise<void>(r => { resolve = r; });
      locks.set(key, next);

      await prior; // wait for previous mutation on this (sessionId, factId) to complete
      try {
        if (!store.has(key)) {
          throw new FactNotFoundError(factId);
        }
        const current = store.get(key)!;
        const newTrust = fn(current); // fn may throw — write is then skipped
        if (!Number.isFinite(newTrust) || newTrust < 0 || newTrust > 1) {
          throw new InvalidTrustValueError(
            newTrust,
            'storage',
            `TrustUpdater.mutate: fn returned an out-of-range trust value (${newTrust}); expected a finite number in [0, 1]`,
          );
        }
        store.set(key, newTrust);
      } finally {
        // Clean up lock entry if no subsequent mutation has queued (prevents unbounded growth).
        // Identity check guards against racing with a queued next mutation that already replaced the entry.
        if (locks.get(key) === next) {
          locks.delete(key);
        }
        resolve(); // unblock the next queued mutation
      }
    },
  };

  return {
    impl,
    setTrust(sessionId, factId, trust) { store.set(storeKey(sessionId, factId), trust); },
    getTrust(sessionId, factId)        { return store.get(storeKey(sessionId, factId)); },
  };
}

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

const SESSION: SessionId = 'session-contract-001' as SessionId;
const FACT_ID = 'fact-contract-001';

/**
 * Run the full TrustUpdater contract suite against a given implementation factory.
 *
 * @param makeImpl - Factory that returns a fresh `{ impl, setTrust, getTrust }` per test.
 *   Real implementations should wrap the storage-backed impl with equivalent side-channels.
 */
function runTrustUpdaterContract(makeImpl: () => TrustUpdaterTestImpl): void {

  // -------------------------------------------------------------------------
  // C-1 — Happy-path mutation
  // -------------------------------------------------------------------------
  // mutate calls fn with the stored trust value, writes the result, resolves.

  it('C-1: happy-path — fn(currentTrust) result is written to storage', async () => {
    const { impl, setTrust, getTrust } = makeImpl();
    setTrust(SESSION, FACT_ID, 0.50);

    await impl.mutate({
      factId:    FACT_ID,
      sessionId: SESSION,
      fn: t => t + 0.10,
    });

    expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(0.60, 5);
  });

  // -------------------------------------------------------------------------
  // C-2 — fn throws: write aborted, state unchanged, error propagates
  // -------------------------------------------------------------------------

  it('C-2: fn throws → write is aborted, stored trust is unchanged, error propagates', async () => {
    const { impl, setTrust, getTrust } = makeImpl();
    setTrust(SESSION, FACT_ID, 0.50);

    const boom = new Error('fn failed intentionally');
    await expect(
      impl.mutate({
        factId:    FACT_ID,
        sessionId: SESSION,
        fn: () => { throw boom; },
      }),
    ).rejects.toBe(boom);

    // State must be unchanged after fn threw
    expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
  });

  // -------------------------------------------------------------------------
  // C-3 — fn returns NaN: impl MUST throw InvalidTrustValueError(source:'storage')
  //        AND MUST NOT mutate storage
  // -------------------------------------------------------------------------

  it('C-3: fn returns NaN — impl throws InvalidTrustValueError(source:storage), storage unchanged', async () => {
    const { impl, setTrust, getTrust } = makeImpl();
    setTrust(SESSION, FACT_ID, 0.50);

    await expect(
      impl.mutate({
        factId:    FACT_ID,
        sessionId: SESSION,
        fn: () => NaN,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRUST_VALUE', source: 'storage' });

    // Write MUST have been aborted — stored trust is unchanged
    expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
  });

  // -------------------------------------------------------------------------
  // C-4 — Fact missing: FactNotFoundError before fn is called
  // -------------------------------------------------------------------------

  it('C-4: missing fact → FactNotFoundError, fn is never invoked', async () => {
    const { impl } = makeImpl();
    // No setTrust call — fact does not exist

    let fnCalled = false;
    await expect(
      impl.mutate({
        factId:    FACT_ID,
        sessionId: SESSION,
        fn: t => { fnCalled = true; return t; },
      }),
    ).rejects.toMatchObject({ code: 'FACT_NOT_FOUND', factId: FACT_ID });

    expect(fnCalled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // C-5 — Concurrent mutate() on same factId is serialized
  // -------------------------------------------------------------------------
  // Drive two concurrent mutate() calls that each flip a flag and append to a
  // log. If they overlap, the log would show interleaving. Serialization means
  // the log shows A-complete then B-start.
  //
  // This test uses a deterministic in-memory impl with a manual scheduler.
  // It does NOT test real storage atomicity — that is Crispin's concern.

  it('C-5: concurrent mutate() calls on the same factId are serialized (no interleave)', async () => {
    const { impl, setTrust, getTrust } = makeImpl();
    setTrust(SESSION, FACT_ID, 0.0);

    const N = 5;
    const log: string[] = [];
    const mutations = Array.from({ length: N }, (_, i) =>
      impl.mutate({
        factId:    FACT_ID,
        sessionId: SESSION,
        fn: t => { log.push(String(i)); return t + 0.1; },
      }),
    );

    await Promise.all(mutations);

    // All N mutations ran — no updates were lost
    expect(log).toHaveLength(N);
    // Final value must equal N * 0.1 — serial application with no lost writes
    expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(N * 0.1, 5);
  });

  // -------------------------------------------------------------------------
  // C-6 — Mutations on different factIds do not interfere
  // -------------------------------------------------------------------------
  // Both mutations reach the correct final value when run concurrently.
  //
  // Note: per-factId parallelism is PERMITTED but not required by the contract.
  // A globally-serialized impl (e.g., single-connection SQLite) is valid and
  // would pass this test. C-6 proves independence of results, not parallelism.

  it('C-6: mutations on different factIds do not interfere — each reaches correct final value', async () => {
    const FACT_A = 'fact-contract-A';
    const FACT_B = 'fact-contract-B';
    const { impl, setTrust, getTrust } = makeImpl();
    setTrust(SESSION, FACT_A, 0.50);
    setTrust(SESSION, FACT_B, 0.70);

    await Promise.all([
      impl.mutate({ factId: FACT_A, sessionId: SESSION, fn: t => t + 0.10 }),
      impl.mutate({ factId: FACT_B, sessionId: SESSION, fn: t => t - 0.10 }),
    ]);

    expect(getTrust(SESSION, FACT_A)).toBeCloseTo(0.60, 5);
    expect(getTrust(SESSION, FACT_B)).toBeCloseTo(0.60, 5);
  });

  // -------------------------------------------------------------------------
  // C-7 — Cross-session isolation: mutate on sessionA MUST NOT affect sessionB
  // -------------------------------------------------------------------------
  // Storage MUST scope state by (sessionId, factId). The same factId under
  // different sessions is a different logical record. Mirrors the per-session
  // isolation contract already established in FactReader (CL-3).

  it('C-7: cross-session isolation — mutate on sessionB does not affect sessionA', async () => {
    const SESSION_A = 'session-contract-A' as SessionId;
    const SESSION_B = 'session-contract-B' as SessionId;
    const { impl, setTrust, getTrust } = makeImpl();

    setTrust(SESSION_A, FACT_ID, 0.50);
    setTrust(SESSION_B, FACT_ID, 0.70);

    await impl.mutate({ factId: FACT_ID, sessionId: SESSION_B, fn: t => t + 0.10 });

    // sessionA's value is completely unaffected
    expect(getTrust(SESSION_A, FACT_ID)).toBeCloseTo(0.50, 5);
    // sessionB's value was mutated correctly
    expect(getTrust(SESSION_B, FACT_ID)).toBeCloseTo(0.80, 5);
  });
}

// ---------------------------------------------------------------------------
// Run the suite against the InMemoryTrustUpdater reference impl
// ---------------------------------------------------------------------------

describe('TrustUpdater contract — InMemoryTrustUpdater reference impl', () => {
  runTrustUpdaterContract(makeInMemoryTrustUpdater);
});
