/**
 * FactStore contract test suite — implementation wirings.
 *
 * ## Design
 *
 * This file wires concrete implementations into the shared contract helper.
 * The helper definition (runFactStoreContract + FactStoreHarness) lives in:
 *   ./fact-store-contract.helper.ts
 *
 * Each call to runFactStoreContract adds 29 tests (FS-1..FS-13 + FS-12c; FS-5b×3, FS-8×3, FS-9×4, FS-10a–h×7 via it/it.each).
 * InMemoryFactStore wired below → 29 contract tests.
 * SqliteFactStore wired below   → 29 contract tests.
 * Total: 58 (25 pre-attention × 2 impls + 8 attention-column contract tests × 2 impls)
 */

import Database from 'better-sqlite3';
import type { FactStore, RecallResult } from '../../activities/recall.js';
import type { SessionId } from '@akubly/types';
import { SqliteFactStore, applyMigrations } from '../../sqlite/index.js';
import { runFactStoreContract, type FactStoreHarness } from './fact-store-contract.helper.js';
import { scopeFingerprint, encodeCursor, decodeCursor } from '../cursor.js';
import { CursorScopeMismatchError } from '../errors.js';

// ---------------------------------------------------------------------------
// InMemoryFactStore — reference implementation (test-only, not exported)
// ---------------------------------------------------------------------------
//
// Simple keyword search: splits query into tokens, counts occurrences in
// content (case-insensitive), multiplies by trust for composite score.
// Pagination via base64-JSON keyset cursor (mirrors SqliteFactStore's format).
//
// Satisfies all 11 contract invariants using pure in-memory computation —
// no SQLite required. Serves as the substitutability reference for FS-1..FS-8.

interface StoredFact {
  factId: string;
  sessionId: string;
  content: string;
  trust: number;
  /** Monotonically-increasing insertion index — mirrors f.id (autoincrement) in SQLite. */
  insertionOrder: number;
  importance: number;
  lastAccessed: number | undefined;
  attentionTier: 'hot' | 'warm' | 'cold';
}

/** Composite key — null-byte separator prevents accidental collisions. */
function storeKey(sessionId: SessionId, factId: string): string {
  return `${sessionId}\0${factId}`;
}

// Cursor helpers are shared with SqliteFactStore via storage/cursor.ts.
// InMemoryFactStore uses identical v1 encoding + scope fingerprint logic.

function makeInMemoryFactStore(): { impl: FactStore; seed: FactStoreHarness['seed'] } {
  const store = new Map<string, StoredFact>();
  let insertionCounter = 1; // 1-based to match SQLite autoincrement (decodeCursor requires lastId > 0)

  const impl: FactStore = {
    async search(args) {
      const { query, sessionId, limit, minTrust = 0.15, cursor } = args;

      // F4: validate limit — mirrors SqliteFactStore validation.
      if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
        throw new TypeError(`InMemoryFactStore.search: limit must be a positive integer, got ${limit}`);
      }

      // Validate minTrust when explicitly provided — mirrors SqliteFactStore validation.
      if (args.minTrust !== undefined && (!Number.isFinite(minTrust) || minTrust < 0 || minTrust > 1)) {
        throw new TypeError(`InMemoryFactStore.search: minTrust must be a finite number in [0, 1], got ${minTrust}`);
      }

      // Fix J: scopeFingerprint is computed lazily — only when needed (v1 scope
      // check or emitting nextCursor).  Cursor decode still precedes empty-query
      // short-circuit (Fix E ordering preserved).
      let keysetLastSort: number | undefined;
      let keysetLastId: number | undefined;
      let computedScope: string | undefined;
      if (cursor !== undefined) {
        const decoded = decodeCursor(cursor); // may throw CursorVersionUnsupportedError
        if (decoded.version === 1) {
          computedScope = scopeFingerprint(query, sessionId as string, minTrust, limit);
          if (decoded.scope !== computedScope) {
            throw new CursorScopeMismatchError(decoded.scope, computedScope);
          }
          keysetLastSort = decoded.lastSort;
          keysetLastId = decoded.lastId;
        }
        // version 0 (restart sentinel) → no keyset → first page
      }

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
          // score = composite (termCount × trust) — used for ordering only.
          // termCount = pure text-match signal — used for relevance normalization only.
          // Mirrors SQLite: ORDER BY (-bm25 × trust) but relevance = pure -bm25.
          return { ...f, score: termCount * f.trust, termCount };
        })
        .sort((a, b) => b.score - a.score || a.insertionOrder - b.insertionOrder);

      // Apply keyset filter: only rows strictly after (keysetLastSort, keysetLastId).
      // Mirrors the SQL predicate: score < lastSort OR (score = lastSort AND id > lastId).
      const afterCursor = (keysetLastSort !== undefined && keysetLastId !== undefined)
        ? scored.filter(f =>
            f.score < keysetLastSort! ||
            (f.score === keysetLastSort! && f.insertionOrder > keysetLastId!)
          )
        : scored;

      const page = afterCursor.slice(0, limit);
      const hasMore = afterCursor.length > limit;

      const termCounts = page.map(f => f.termCount);
      const minTC = Math.min(...termCounts);
      const maxTC = Math.max(...termCounts);

      const results: RecallResult[] = page.map((f) => ({
        content: f.content,
        trust: f.trust,
        attentionTier: f.attentionTier,
        importance: f.importance,
        lastAccessed: f.lastAccessed,
        relevance:
          termCounts.length <= 1 || maxTC === minTC
            ? 1.0
            : (f.termCount - minTC) / (maxTC - minTC),
      }));

      let nextCursor: string | undefined;
      if (hasMore) {
        const lastRow = page[page.length - 1];
        const scope = computedScope ?? scopeFingerprint(query, sessionId as string, minTrust, limit);
        nextCursor = encodeCursor({ lastSort: lastRow.score, lastId: lastRow.insertionOrder, scope });
      }
      return { results, nextCursor };
    },
  };

  const seed: FactStoreHarness['seed'] = async (factId, sessionId, content, trust, attention) => {
    store.set(storeKey(sessionId, factId), {
      factId,
      sessionId: sessionId as string,
      content,
      trust,
      insertionOrder: insertionCounter++,
      importance: attention?.importance ?? 0,
      lastAccessed: attention?.lastAccessed ?? undefined,
      attentionTier: attention?.attentionTier ?? 'warm',
    });
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
  // attention opts (migration 002 columns) are honoured when provided.
  const insertStmt = db.prepare(
    `INSERT OR REPLACE INTO facts
       (fact_id, session_id, content, trust, importance, last_accessed, attention_tier)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const impl = new SqliteFactStore(db);

  const harness: FactStoreHarness = {
    impl,
    seed: async (factId: string, sessionId: SessionId, content: string, trust: number, attention?) => {
      insertStmt.run(
        factId,
        sessionId as string,
        content,
        trust,
        attention?.importance ?? 0,
        attention?.lastAccessed ?? null,
        attention?.attentionTier ?? 'warm',
      );
    },
    cleanup: () => db.close(),
  };

  return harness;
});
