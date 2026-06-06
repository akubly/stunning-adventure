/**
 * TrustUpdater contract test helper — shared suite definition.
 *
 * ## Purpose
 *
 * `runTrustUpdaterContract` is a shared test helper. Any TrustUpdater
 * implementation can be verified by calling it with a factory that produces
 * a fresh harness per test. Adding a new implementation requires only one
 * new call — no test duplication.
 *
 * ## Invariants covered
 *
 * C-1   Happy-path mutation          — fn(currentTrust) result is written to storage
 * C-2   fn throws                    — write aborted, state unchanged, error propagates
 * C-3   fn returns NaN               — InvalidTrustValueError(source:'storage'), unchanged
 * C-3b  fn returns out-of-range      — InvalidTrustValueError(source:'storage'), unchanged
 * C-4   Fact missing                 — FactNotFoundError before fn is called
 * C-5   Concurrent mutations         — same (sessionId, factId) serialized, no lost writes
 * C-6   Different factIds            — independent, each reaches correct final value
 * C-7   Cross-session isolation      — mutate on sessionB does not affect sessionA
 *
 * ## Export visibility
 *
 * @internal — monorepo-internal until a `@akubly/eureka/testing` subpath is established.
 * External consumers should duplicate the suite (~50 lines). Promote when external
 * implementations materialize.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TrustUpdater } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Shared contract harness type
// ---------------------------------------------------------------------------

/**
 * Test harness for TrustUpdater contract tests.
 *
 * `impl`     — The TrustUpdater implementation under test.
 * `setTrust` — Side-channel: seed (sessionId, factId) → trust in storage.
 * `getTrust` — Side-channel: inspect stored trust; undefined when fact absent.
 * `cleanup`  — Optional teardown for native handles (e.g. db.close() for SQLite).
 *
 * All side-channel methods are async-tolerant so SQLite (and future I/O-backed)
 * harnesses can use async seed/inspect operations without signature changes.
 *
 * @internal
 */
export interface TrustUpdaterHarness {
  impl: TrustUpdater;
  setTrust(sessionId: SessionId, factId: string, trust: number): void | Promise<void>;
  getTrust(sessionId: SessionId, factId: string): number | undefined | Promise<number | undefined>;
  cleanup?: () => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

const SESSION: SessionId = 'session-contract-001' as SessionId;
const FACT_ID = 'fact-contract-001';

/**
 * Run the full TrustUpdater contract suite against a given implementation factory.
 *
 * Each call to `runTrustUpdaterContract` adds 9 tests (C-1 through C-7, with C-3b
 * contributing 2 cases via it.each([1.5, -0.1])).
 *
 * @param implName    Human-readable label shown in test output (e.g. 'SqliteTrustUpdater').
 * @param makeHarness Factory called once per test (via beforeEach) to produce a fresh,
 *   isolated harness. May be async to accommodate I/O-backed setup.
 *
 * @internal
 */
export function runTrustUpdaterContract(
  implName: string,
  makeHarness: () => TrustUpdaterHarness | Promise<TrustUpdaterHarness>,
): void {
  describe(`TrustUpdater contract — ${implName}`, () => {
    let impl: TrustUpdater;
    let setTrust: TrustUpdaterHarness['setTrust'];
    let getTrust: TrustUpdaterHarness['getTrust'];
    let harness: TrustUpdaterHarness;

    beforeEach(async () => {
      harness = await makeHarness();
      impl = harness.impl;
      setTrust = harness.setTrust;
      getTrust = harness.getTrust;
    });

    afterEach(async () => {
      await harness?.cleanup?.();
    });

    // -----------------------------------------------------------------------
    // C-1 — Happy-path mutation
    //
    // mutate calls fn with the stored trust value, writes the result, resolves.
    // -----------------------------------------------------------------------

    it('C-1: happy-path — fn(currentTrust) result is written to storage', async () => {
      await setTrust(SESSION, FACT_ID, 0.50);

      await impl.mutate({
        factId: FACT_ID,
        sessionId: SESSION,
        fn: currentTrust => currentTrust + 0.10,
      });

      expect(await getTrust(SESSION, FACT_ID)).toBeCloseTo(0.60, 5);
    });

    // -----------------------------------------------------------------------
    // C-2 — fn throws: write aborted, state unchanged, error propagates
    // -----------------------------------------------------------------------

    it('C-2: fn throws → write is aborted, stored trust is unchanged, error propagates', async () => {
      await setTrust(SESSION, FACT_ID, 0.50);

      const boom = new Error('fn failed intentionally');
      await expect(
        impl.mutate({
          factId: FACT_ID,
          sessionId: SESSION,
          fn: () => { throw boom; },
        }),
      ).rejects.toBe(boom);

      expect(await getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
    });

    // -----------------------------------------------------------------------
    // C-3 — fn returns NaN: impl MUST throw InvalidTrustValueError(source:'storage')
    //        AND MUST NOT mutate storage
    // -----------------------------------------------------------------------

    it('C-3: fn returns NaN — impl throws InvalidTrustValueError(source:storage), storage unchanged', async () => {
      await setTrust(SESSION, FACT_ID, 0.50);

      await expect(
        impl.mutate({
          factId: FACT_ID,
          sessionId: SESSION,
          fn: () => NaN,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_TRUST_VALUE', source: 'storage' });

      expect(await getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
    });

    // -----------------------------------------------------------------------
    // C-3b — fn returns out-of-range value (above/below [0,1]):
    //         impl MUST throw InvalidTrustValueError(source:'storage')
    //         AND MUST NOT mutate storage
    //
    // Covers the finite-but-out-of-range case not exercised by C-3 (NaN).
    // Each parameterization (1.5, -0.1) runs as a separate test case so a
    // first-failure on one bound doesn't shadow the other.
    // -----------------------------------------------------------------------

    it.each([1.5, -0.1])(
      'C-3b (%f): fn returns out-of-range value — InvalidTrustValueError(source:storage), storage unchanged',
      async (badValue) => {
        await setTrust(SESSION, FACT_ID, 0.50);

        await expect(
          impl.mutate({
            factId: FACT_ID,
            sessionId: SESSION,
            fn: () => badValue,
          }),
        ).rejects.toMatchObject({ code: 'INVALID_TRUST_VALUE', source: 'storage' });

        expect(await getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
      },
    );

    // -----------------------------------------------------------------------
    // C-4 — Fact missing: FactNotFoundError before fn is called
    // -----------------------------------------------------------------------

    it('C-4: missing fact → FactNotFoundError, fn is never invoked', async () => {
      let fnCalled = false;
      await expect(
        impl.mutate({
          factId: FACT_ID,
          sessionId: SESSION,
          fn: currentTrust => { fnCalled = true; return currentTrust; },
        }),
      ).rejects.toMatchObject({ code: 'FACT_NOT_FOUND', factId: FACT_ID });

      expect(fnCalled).toBe(false);
    });

    // -----------------------------------------------------------------------
    // C-5 — Concurrent mutate() on same (sessionId, factId) is serialized
    //
    // Verifies arithmetic correctness under concurrent Promise.all: all N
    // mutations are applied and the final value equals startTrust + N * delta
    // (no writes were lost). The order of execution is implementation-defined.
    //
    // What C-5 DOES verify: the impl's per-key serialization mechanism
    // (promise-chain for InMemory; BEGIN IMMEDIATE write-lock for SQLite)
    // prevents lost writes under same-process concurrency.
    //
    // What C-5 does NOT verify: SQLite's BEGIN IMMEDIATE behaviour under
    // contention from a *separate* Database connection or OS process. That
    // requires two separate Database handles pointing at the same file —
    // a multi-connection integration test outside this contract suite.
    // -----------------------------------------------------------------------

    it('C-5: concurrent mutate() calls on the same factId are serialized (no interleave)', async () => {
      await setTrust(SESSION, FACT_ID, 0.0);

      const N = 5;
      const log: string[] = [];
      const mutations = Array.from({ length: N }, (_, i) =>
        impl.mutate({
          factId: FACT_ID,
          sessionId: SESSION,
          fn: currentTrust => { log.push(String(i)); return currentTrust + 0.1; },
        }),
      );

      await Promise.all(mutations);

      expect(log).toHaveLength(N);
      expect(await getTrust(SESSION, FACT_ID)).toBeCloseTo(N * 0.1, 5);
    });

    // -----------------------------------------------------------------------
    // C-6 — Mutations on different factIds do not interfere
    //
    // Both mutations reach the correct final value when run concurrently.
    // A globally-serialized impl (SQLite) is valid here — C-6 proves
    // independence of results, not parallelism.
    // -----------------------------------------------------------------------

    it('C-6: mutations on different factIds do not interfere — each reaches correct final value', async () => {
      const FACT_A = 'fact-contract-A';
      const FACT_B = 'fact-contract-B';
      await setTrust(SESSION, FACT_A, 0.50);
      await setTrust(SESSION, FACT_B, 0.70);

      await Promise.all([
        impl.mutate({ factId: FACT_A, sessionId: SESSION, fn: currentTrust => currentTrust + 0.10 }),
        impl.mutate({ factId: FACT_B, sessionId: SESSION, fn: currentTrust => currentTrust - 0.10 }),
      ]);

      expect(await getTrust(SESSION, FACT_A)).toBeCloseTo(0.60, 5);
      expect(await getTrust(SESSION, FACT_B)).toBeCloseTo(0.60, 5);
    });

    // -----------------------------------------------------------------------
    // C-7 — Cross-session isolation: mutate on sessionB MUST NOT affect sessionA
    //
    // Storage MUST scope state by (sessionId, factId). The same factId under
    // different sessions is a different logical record. Mirrors CL-3 in the
    // FactReader contract.
    // -----------------------------------------------------------------------

    it('C-7: cross-session isolation — mutate on sessionB does not affect sessionA', async () => {
      const SESSION_A = 'session-contract-A' as SessionId;
      const SESSION_B = 'session-contract-B' as SessionId;
      await setTrust(SESSION_A, FACT_ID, 0.50);
      await setTrust(SESSION_B, FACT_ID, 0.70);

      await impl.mutate({ factId: FACT_ID, sessionId: SESSION_B, fn: currentTrust => currentTrust + 0.10 });

      expect(await getTrust(SESSION_A, FACT_ID)).toBeCloseTo(0.50, 5);
      expect(await getTrust(SESSION_B, FACT_ID)).toBeCloseTo(0.80, 5);
    });
  });
}
