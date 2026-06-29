/**
 * TrustUpdater contract test suite — implementation wirings.
 *
 * ## Design
 *
 * This file wires concrete implementations into the shared contract helper.
 * The helper definition (runTrustUpdaterContract + TrustUpdaterHarness) lives in:
 *   ./trust-updater-contract.helper.ts
 *
 * Each call to runTrustUpdaterContract adds 9 tests (C-1 through C-7, C-3 + C-3b×2).
 * InMemoryTrustUpdater wired below → 9 contract tests.
 * SqliteTrustUpdater wired below   → 9 contract tests.
 * Total: 18
 */

import Database from 'better-sqlite3';
import { FactNotFoundError, InvalidTrustValueError } from '../../activities/errors.js';
import type { TrustUpdater } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';
import { SqliteTrustUpdater, applyMigrations } from '../../sqlite/index.js';
import { runTrustUpdaterContract, type TrustUpdaterHarness } from './trust-updater-contract.helper.js';

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

// Reference InMemory impl lives inline here by design — test-only, not exported from any production module.
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
    cleanup: () => { db.close(); },
  };
});

