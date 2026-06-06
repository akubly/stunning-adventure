/**
 * FactStore contract test suite — implementation wirings.
 *
 * ## Design
 *
 * This file wires concrete implementations into the shared contract helper.
 * The helper definition (runFactStoreContract + FactStoreHarness) lives in:
 *   ./fact-store-contract.helper.ts
 *
 * Each call to runFactStoreContract adds 11 tests (FS-1 through FS-8, FS-5b×2, FS-8 contributing 3 via it.each).
 * InMemoryFactStore wired below → 11 contract tests.
 * SqliteFactStore wired below   → 11 contract tests.
 * Total: 22
 */

import Database from 'better-sqlite3';
import type { FactStore, RecallResult } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';
import { SqliteFactStore, applyMigrations } from '../../sqlite/index.js';
import { runFactStoreContract, type FactStoreHarness } from './fact-store-contract.helper.js';

// ---------------------------------------------------------------------------
// InMemoryFactStore — reference implementation (test-only, not exported)
// ---------------------------------------------------------------------------
//
// Simple keyword search: splits query into tokens, counts occurrences in
// content (case-insensitive), multiplies by trust for composite score.
// Pagination via base64-JSON offset cursor (mirrors SqliteFactStore's format).
//
// Satisfies all 6 contract invariants using pure in-memory computation —
// no SQLite required. Serves as the substitutability reference for FS-1..FS-6.

interface StoredFact {
  factId: string;
  sessionId: string;
  content: string;
  trust: number;
  /** Monotonically-increasing insertion index — mirrors f.id (autoincrement) in SQLite. */
  insertionOrder: number;
}

/** Composite key — null-byte separator prevents accidental collisions. */
function storeKey(sessionId: SessionId, factId: string): string {
  return `${sessionId}\0${factId}`;
}

function encodeCursorInMemory(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString('base64');
}

function decodeCursorInMemory(cursor: string): number {
  try {
    const payload = JSON.parse(Buffer.from(cursor, 'base64').toString()) as { offset: number };
    return typeof payload.offset === 'number' && Number.isFinite(payload.offset) && Number.isInteger(payload.offset) && payload.offset >= 0
      ? payload.offset
      : 0;
  } catch {
    return 0;
  }
}

function makeInMemoryFactStore(): { impl: FactStore; seed: FactStoreHarness['seed'] } {
  const store = new Map<string, StoredFact>();
  let insertionCounter = 0;

  const impl: FactStore = {
    async search(args) {
      const { query, sessionId, limit, minTrust = 0.15, cursor } = args;

      // F4: validate limit — mirrors SqliteFactStore validation.
      if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
        throw new TypeError(`InMemoryFactStore.search: limit must be a positive integer, got ${limit}`);
      }

      const offset = cursor !== undefined ? decodeCursorInMemory(cursor) : 0;

      if (!query.trim()) return { results: [] };

      const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

      const scored = [...store.values()]
        .filter(f => f.sessionId === (sessionId as string))
        .filter(f => f.trust >= minTrust)
        .filter(f => tokens.some(t => f.content.toLowerCase().includes(t)))
        .map(f => {
          const termCount = tokens.reduce((sum, t) => {
            const matches = (f.content.toLowerCase().match(new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
            return sum + matches;
          }, 0);
          return { ...f, score: termCount * f.trust };
        })
        .sort((a, b) => b.score - a.score || a.insertionOrder - b.insertionOrder);

      const page = scored.slice(offset, offset + limit);
      const hasMore = scored.length > offset + limit;

      const scores = page.map(f => f.score);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);

      const results: RecallResult[] = page.map((f, i) => ({
        content: f.content,
        trust: f.trust,
        attentionTier: 'warm',
        relevance:
          scores.length <= 1 || maxScore === minScore
            ? 1.0
            : (scores[i] - minScore) / (maxScore - minScore),
      }));

      const nextCursor = hasMore ? encodeCursorInMemory(offset + limit) : undefined;
      return { results, nextCursor };
    },
  };

  const seed: FactStoreHarness['seed'] = async (factId, sessionId, content, trust) => {
    store.set(storeKey(sessionId, factId), { factId, sessionId: sessionId as string, content, trust, insertionOrder: insertionCounter++ });
  };

  return { impl, seed };
}

// ---------------------------------------------------------------------------
// Wire contract suite to InMemoryFactStore
// ---------------------------------------------------------------------------

runFactStoreContract('InMemoryFactStore', () => {
  const { impl, seed } = makeInMemoryFactStore();
  return { impl, seed };
});

// ---------------------------------------------------------------------------
// Wire contract suite to SqliteFactStore
// ---------------------------------------------------------------------------

runFactStoreContract('SqliteFactStore', () => {
  const db = new Database(':memory:');
  applyMigrations(db);

  // Seed via direct INSERT into the facts table. The facts_ai trigger
  // (migration 001) automatically updates facts_fts, so FTS search works.
  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
  );

  const impl = new SqliteFactStore(db);

  const harness: FactStoreHarness = {
    impl,
    seed: async (factId: string, sessionId: SessionId, content: string, trust: number) => {
      insertStmt.run(factId, sessionId as string, content, trust);
    },
    cleanup: () => db.close(),
  };

  return harness;
});
