/**
 * TrustUpdater contract test suite — shared helper + implementation wirings.
 *
 * ## Design
 *
 * `runTrustUpdaterContract` is a shared exported test helper. Any TrustUpdater
 * implementation can be verified by calling it with a factory that produces a
 * fresh harness per test. Adding a new implementation requires only one new
 * `runTrustUpdaterContract(...)` call — no test duplication.
 *
 * ## Contract invariants covered
 *
 * C-1  Happy-path mutation        — fn(currentTrust) result is written to storage
 * C-2  fn throws                  — write aborted, state unchanged, error propagates
 * C-3  fn returns NaN             — InvalidTrustValueError(source:'storage'), storage unchanged
 * C-4  Fact missing               — FactNotFoundError before fn is called
 * C-5  Concurrent mutations       — same (sessionId, factId) serialized, no lost writes
 * C-6  Different factIds          — independent, each reaches correct final value
 * C-7  Cross-session isolation    — mutate on sessionB does not affect sessionA
 *
 * ## Baseline test count
 *
 * Each call to runTrustUpdaterContract adds 7 tests.
 * InMemoryTrustUpdater wired below → 7 contract tests.
 * SqliteTrustUpdater wired below   → 7 contract tests.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { TrustUpdater } from '../../activities/recall.js';
import { FactNotFoundError, InvalidTrustValueError } from '../../activities/errors.js';
import type { SessionId } from '@akubly/types';
import { SqliteTrustUpdater, applyMigrations } from '../../sqlite/index.js';

// ---------------------------------------------------------------------------
// Shared contract harness type
// ---------------------------------------------------------------------------

/**
 * Test harness for TrustUpdater contract tests.
 *
 * `impl`     — The TrustUpdater implementation under test.
 * `setTrust` — Side-channel: seed (sessionId, factId) → trust in storage (sync or async).
 * `getTrust` — Side-channel: inspect stored trust; returns undefined when fact absent.
 * `cleanup`  — Optional teardown for native handles (e.g. db.close() for SQLite).
 */
export interface TrustUpdaterHarness {
  impl: TrustUpdater;
  setTrust(sessionId: SessionId, factId: string, trust: number): void | Promise<void>;
  getTrust(sessionId: SessionId, factId: string): number | undefined;
  cleanup?: () => void;
}

// ---------------------------------------------------------------------------
// Shared contract suite
// ---------------------------------------------------------------------------

const SESSION: SessionId = 'session-contract-001' as SessionId;
const FACT_ID = 'fact-contract-001';

/**
 * Run the full TrustUpdater contract suite against a given implementation factory.
 *
 * @param implName    Human-readable label shown in test output (e.g. 'SqliteTrustUpdater').
 * @param makeHarness Factory called once per test to produce a fresh, isolated harness.
 *   Real implementations should wrap the storage-backed impl with setTrust/getTrust
 *   side-channel access (INSERT / SELECT) and register cleanup for db.close().
 */
export function runTrustUpdaterContract(
  implName: string,
  makeHarness: () => TrustUpdaterHarness,
): void {
  describe(`TrustUpdater contract — ${implName}`, () => {
    let impl: TrustUpdater;
    let setTrust: TrustUpdaterHarness['setTrust'];
    let getTrust: TrustUpdaterHarness['getTrust'];
    let harness: TrustUpdaterHarness;

    beforeEach(() => {
      harness = makeHarness();
      impl = harness.impl;
      setTrust = harness.setTrust.bind(harness);
      getTrust = harness.getTrust.bind(harness);
    });

    afterEach(() => {
      harness?.cleanup?.();
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
        fn: t => t + 0.10,
      });

      expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(0.60, 5);
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

      expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
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

      expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(0.50, 5);
    });

    // -----------------------------------------------------------------------
    // C-4 — Fact missing: FactNotFoundError before fn is called
    // -----------------------------------------------------------------------

    it('C-4: missing fact → FactNotFoundError, fn is never invoked', async () => {
      // No setTrust call — fact does not exist
      let fnCalled = false;
      await expect(
        impl.mutate({
          factId: FACT_ID,
          sessionId: SESSION,
          fn: t => { fnCalled = true; return t; },
        }),
      ).rejects.toMatchObject({ code: 'FACT_NOT_FOUND', factId: FACT_ID });

      expect(fnCalled).toBe(false);
    });

    // -----------------------------------------------------------------------
    // C-5 — Concurrent mutate() on same (sessionId, factId) is serialized
    //
    // Drive N concurrent mutate() calls. Serialization means all N mutations
    // are applied, and the final value equals startTrust + N * delta (no writes
    // were lost). The order of execution is implementation-defined; only the
    // final value and the absence of lost writes are asserted.
    //
    // Note: per-factId parallelism is implementation-defined. A globally-
    // serialized impl (e.g., single-connection SQLite) satisfies this invariant.
    // The InMemory impl uses a per-(sessionId,factId) promise chain.
    // -----------------------------------------------------------------------

    it('C-5: concurrent mutate() calls on the same factId are serialized (no interleave)', async () => {
      await setTrust(SESSION, FACT_ID, 0.0);

      const N = 5;
      const log: string[] = [];
      const mutations = Array.from({ length: N }, (_, i) =>
        impl.mutate({
          factId: FACT_ID,
          sessionId: SESSION,
          fn: t => { log.push(String(i)); return t + 0.1; },
        }),
      );

      await Promise.all(mutations);

      expect(log).toHaveLength(N);
      expect(getTrust(SESSION, FACT_ID)).toBeCloseTo(N * 0.1, 5);
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
        impl.mutate({ factId: FACT_A, sessionId: SESSION, fn: t => t + 0.10 }),
        impl.mutate({ factId: FACT_B, sessionId: SESSION, fn: t => t - 0.10 }),
      ]);

      expect(getTrust(SESSION, FACT_A)).toBeCloseTo(0.60, 5);
      expect(getTrust(SESSION, FACT_B)).toBeCloseTo(0.60, 5);
    });

    // -----------------------------------------------------------------------
    // C-7 — Cross-session isolation: mutate on sessionA MUST NOT affect sessionB
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

      await impl.mutate({ factId: FACT_ID, sessionId: SESSION_B, fn: t => t + 0.10 });

      expect(getTrust(SESSION_A, FACT_ID)).toBeCloseTo(0.50, 5);
      expect(getTrust(SESSION_B, FACT_ID)).toBeCloseTo(0.80, 5);
    });
  });
}

// ---------------------------------------------------------------------------
// InMemoryTrustUpdater — reference implementation
// ---------------------------------------------------------------------------
//
// Deterministic in-memory impl of TrustUpdater. Provides side-channel
// methods for test setup (setTrust) and inspection (getTrust). Uses a
// per-(sessionId,factId) promise chain for serialized mutation (C-5).

/** Composite key — null-byte separator prevents accidental collisions. */
function storeKey(sessionId: SessionId, factId: string): string {
  return `${sessionId}\0${factId}`;
}

function makeInMemoryTrustUpdaterHarness(): TrustUpdaterHarness {
  const store = new Map<string, number>();
  const locks = new Map<string, Promise<void>>();

  const impl: TrustUpdater = {
    async mutate({ factId, sessionId, fn }) {
      const key = storeKey(sessionId, factId);
      const prior = locks.get(key) ?? Promise.resolve();
      let resolve!: () => void;
      const next = new Promise<void>(r => { resolve = r; });
      locks.set(key, next);

      await prior;
      try {
        if (!store.has(key)) {
          throw new FactNotFoundError(factId);
        }
        const current = store.get(key)!;
        const newTrust = fn(current);
        if (!Number.isFinite(newTrust) || newTrust < 0 || newTrust > 1) {
          throw new InvalidTrustValueError(
            newTrust,
            'storage',
            `TrustUpdater.mutate: fn returned an out-of-range trust value (${newTrust}); expected a finite number in [0, 1]`,
          );
        }
        store.set(key, newTrust);
      } finally {
        if (locks.get(key) === next) {
          locks.delete(key);
        }
        resolve();
      }
    },
  };

  return {
    impl,
    setTrust(sessionId, factId, trust) { store.set(storeKey(sessionId, factId), trust); },
    getTrust(sessionId, factId) { return store.get(storeKey(sessionId, factId)); },
  };
}

// ---------------------------------------------------------------------------
// Wire contract suite to InMemoryTrustUpdater
// ---------------------------------------------------------------------------

runTrustUpdaterContract('InMemoryTrustUpdater', makeInMemoryTrustUpdaterHarness);

// ---------------------------------------------------------------------------
// Wire contract suite to SqliteTrustUpdater
// ---------------------------------------------------------------------------

runTrustUpdaterContract('SqliteTrustUpdater', () => {
  const db = new Database(':memory:');
  applyMigrations(db);

  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO facts (fact_id, session_id, trust) VALUES (?, ?, ?)',
  );
  const selectStmt = db.prepare(
    'SELECT trust FROM facts WHERE fact_id = ? AND session_id = ?',
  );

  const impl = new SqliteTrustUpdater(db);

  return {
    impl,
    setTrust(sessionId: SessionId, factId: string, trust: number) {
      // NaN → NULL (mirrors CL-4 round-trip convention from Slice A).
      const stored = Number.isNaN(trust) ? null : trust;
      insertStmt.run(factId, sessionId, stored);
    },
    getTrust(sessionId: SessionId, factId: string): number | undefined {
      const row = selectStmt.get(factId, sessionId) as { trust: number | null } | undefined;
      if (row === undefined) return undefined;
      // NULL re-hydrates as NaN (mirrors SqliteFactReader CL-4 convention).
      return row.trust === null ? NaN : row.trust;
    },
    cleanup: () => db.close(),
  };
});
