/**
 * InMemoryFactWriter — in-memory FactWriter + FactStore implementation.
 *
 * Implements both interfaces backed by a shared Map so that facts written
 * via write() are immediately searchable via search(). Used in tests where
 * SQLite is unnecessary overhead.
 *
 * Idempotency: first-write-wins on (factId, sessionId). Re-writes are no-ops.
 * Session-scoped: search() only returns facts for the requested sessionId.
 *
 * ## search() alignment note
 *
 * The FactStore.search() implementation here mirrors the InMemoryFactStore
 * reference in fact-store.contract.test.ts (same keyword-matching logic,
 * cursor handling, and validation). That reference impl is test-file-local
 * and cannot be imported, so this class maintains its own copy. Both MUST
 * stay aligned on validation (limit, minTrust) and scoring behavior.
 */

import type { SessionId } from '@akubly/types';
import type { FactWriter, FactId, AttentionTier } from '../activities/imprint.js';
import type { FactStore, RecallResult } from '../activities/recall.js';
import { scopeFingerprint, encodeCursor, decodeCursor } from './cursor.js';
import { CursorScopeMismatchError } from './errors.js';
import { epochMsToSqliteDateTime } from './datetime.js';

// ---------------------------------------------------------------------------
// Internal stored fact shape
// ---------------------------------------------------------------------------

interface InternalFact {
  factId: string;
  sessionId: string;
  content: string;
  trust: number;
  importance: number;
  attentionTier: AttentionTier;
  lastAccessed: number | null;
  createdAt: string;
  insertionOrder: number;
}

// ---------------------------------------------------------------------------
// StoredFact — test side-channel return type (matches contract helper)
// ---------------------------------------------------------------------------

/** @internal — test-only return type for readFact side-channel. */
export interface StoredFact {
  factId: FactId;
  sessionId: SessionId;
  content: string;
  trust: number;
  importance: number;
  attentionTier: AttentionTier;
  lastAccessed: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Composite key helper
// ---------------------------------------------------------------------------

function storeKey(sessionId: string, factId: string): string {
  return `${sessionId}\0${factId}`;
}

// ---------------------------------------------------------------------------
// InMemoryFactWriter
// ---------------------------------------------------------------------------

export class InMemoryFactWriter implements FactWriter, FactStore {
  private readonly store = new Map<string, InternalFact>();
  private insertionCounter = 1;

  // -------------------------------------------------------------------------
  // FactWriter.write()
  // -------------------------------------------------------------------------

  async write(args: {
    factId: FactId;
    sessionId: SessionId;
    content: string;
    trust: number;
    importance: number;
    attentionTier: AttentionTier;
    createdAt: number;
  }): Promise<void> {
    const key = storeKey(args.sessionId as string, args.factId as string);

    // First-write-wins idempotency
    if (this.store.has(key)) return;

    const createdAtStr = epochMsToSqliteDateTime(args.createdAt);

    this.store.set(key, {
      factId: args.factId as string,
      sessionId: args.sessionId as string,
      content: args.content,
      trust: args.trust,
      importance: args.importance,
      attentionTier: args.attentionTier,
      lastAccessed: null,
      createdAt: createdAtStr,
      insertionOrder: this.insertionCounter++,
    });
  }

  // -------------------------------------------------------------------------
  // FactStore.search() — simple keyword matching
  //
  // Mirrors the InMemoryFactStore reference in fact-store.contract.test.ts.
  // Validation aligned with SqliteFactStore and the FS-9 contract.
  // -------------------------------------------------------------------------

  async search(args: {
    query: string;
    sessionId: SessionId;
    limit: number;
    minTrust?: number;
    cursor?: string;
  }): Promise<{ results: RecallResult[]; nextCursor?: string }> {
    const { query, sessionId, limit, minTrust = 0.15, cursor } = args;

    // Validate limit — mirrors SqliteFactStore / FS-4
    if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
      throw new TypeError(`InMemoryFactWriter.search: limit must be a positive integer, got ${limit}`);
    }

    // Validate minTrust when explicitly provided — mirrors SqliteFactStore / FS-9
    if (args.minTrust !== undefined && (!Number.isFinite(minTrust) || minTrust < 0 || minTrust > 1)) {
      throw new TypeError(`InMemoryFactWriter.search: minTrust must be a finite number in [0, 1], got ${minTrust}`);
    }

    // Cursor handling
    let keysetLastSort: number | undefined;
    let keysetLastId: number | undefined;
    let computedScope: string | undefined;
    if (cursor !== undefined) {
      const decoded = decodeCursor(cursor);
      if (decoded.version === 1) {
        computedScope = scopeFingerprint(query, sessionId as string, minTrust, limit);
        if (decoded.scope !== computedScope) {
          throw new CursorScopeMismatchError(decoded.scope, computedScope);
        }
        keysetLastSort = decoded.lastSort;
        keysetLastId = decoded.lastId;
      }
    }

    if (!query.trim()) return { results: [] };

    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = [...this.store.values()]
      .filter(f => f.sessionId === (sessionId as string))
      .filter(f => f.trust >= minTrust)
      .filter(f => tokens.some(t => f.content.toLowerCase().includes(t)))
      .map(f => {
        const termCount = tokens.reduce((sum, t) => {
          const matches = (f.content.toLowerCase().match(
            new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          ) ?? []).length;
          return sum + matches;
        }, 0);
        return { ...f, score: termCount * f.trust, termCount };
      })
      .sort((a, b) => b.score - a.score || a.insertionOrder - b.insertionOrder);

    // Keyset filter
    const afterCursor = (keysetLastSort !== undefined && keysetLastId !== undefined)
      ? scored.filter(f =>
          f.score < keysetLastSort! ||
          (f.score === keysetLastSort! && f.insertionOrder > keysetLastId!),
        )
      : scored;

    const page = afterCursor.slice(0, limit);
    const hasMore = afterCursor.length > limit;

    // Relevance normalization — guard against empty page (Math.min/max on empty → ±Infinity)
    const termCounts = page.map(f => f.termCount);
    const minTC = termCounts.length > 0 ? Math.min(...termCounts) : 0;
    const maxTC = termCounts.length > 0 ? Math.max(...termCounts) : 0;

    const results: RecallResult[] = page.map(f => ({
      content: f.content,
      trust: f.trust,
      attentionTier: f.attentionTier,
      importance: f.importance,
      lastAccessed: f.lastAccessed === null ? undefined : f.lastAccessed,
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
  }

  // -------------------------------------------------------------------------
  // readFact — test-only side-channel
  // -------------------------------------------------------------------------

  async readFact(factId: FactId, sessionId: SessionId): Promise<StoredFact | null> {
    const key = storeKey(sessionId as string, factId as string);
    const f = this.store.get(key);
    if (!f) return null;
    return {
      factId: f.factId as FactId,
      sessionId: f.sessionId as SessionId,
      content: f.content,
      trust: f.trust,
      importance: f.importance,
      attentionTier: f.attentionTier,
      lastAccessed: f.lastAccessed,
      createdAt: f.createdAt,
    };
  }
}
