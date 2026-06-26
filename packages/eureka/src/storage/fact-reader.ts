/**
 * In-memory FactReader — real (non-mock) FactReader implementation for
 * testing and development environments.
 *
 * This is the v1 FactReader implementation. A future persistence-backed
 * implementation (e.g., SQLite) should implement the same FactReader interface
 * and can be verified using the shared contract suite in
 * `storage/__tests__/fact-reader.contract.test.ts`.
 *
 * ## Wave-2 (integrate substrate)
 *
 * Internal records now carry `content` and `createdAt` so `listBySession`
 * can return the shape the integrate consolidation pass needs.
 *
 * The constructor accepts an optional `InMemoryFactWriter` for a shared
 * backing-store mode — used by the integrate activity harness so a single
 * imprint→integrate pipeline does not need to mirror state between the
 * writer and the reader. When constructed without a writer, the reader
 * uses its own internal store and the `seed()` helper.
 */

import type { SessionId } from '@akubly/types';
import type { FactReader } from '../activities/recall.js';
import type { FactId } from '../activities/imprint.js';
import type { InMemoryFactWriter } from './fact-writer.js';

interface FactRecord {
  factId: FactId;
  content: string;
  trust: number;
  sessionId: SessionId;
  createdAt: number;
}

export class InMemoryFactReader implements FactReader {
  private readonly store = new Map<string, FactRecord[]>();
  private readonly writer?: InMemoryFactWriter;
  /** Monotonic counter used as a createdAt fallback when callers omit it. */
  private nextCreatedAt = 1;

  /**
   * @param writer  Optional InMemoryFactWriter to share state with. When
   *                provided, `read()` and `listBySession()` delegate to the
   *                writer's internal store so an `imprint → integrate` pipeline
   *                sees a single source of truth. `seed()` still uses the
   *                reader's own store (test side-channel only).
   */
  constructor(writer?: InMemoryFactWriter) {
    this.writer = writer;
  }

  /**
   * Seed a fact for a specific session. Not part of the FactReader interface
   * contract — this is a test/dev helper.
   *
   * If a record for the same (factId, sessionId) pair already exists, it is
   * replaced. Different sessions may hold different trust values for the same
   * factId without interfering with each other.
   *
   * @param createdAt  Unix epoch ms; defaults to a monotonically increasing
   *                   counter so contract tests that don't care about the
   *                   value still get deterministic ascending order.
   */
  seed(
    factId: string,
    sessionId: SessionId,
    trust: number,
    content: string = '',
    createdAt: number = this.nextCreatedAt++,
  ): void {
    if (createdAt >= this.nextCreatedAt) this.nextCreatedAt = createdAt + 1;
    const records = this.store.get(factId) ?? [];
    const idx = records.findIndex(r => r.sessionId === sessionId);
    const rec: FactRecord = { factId: factId as FactId, content, trust, sessionId, createdAt };
    if (idx >= 0) {
      records[idx] = rec;
    } else {
      records.push(rec);
    }
    this.store.set(factId, records);
  }

  /**
   * Read the trust value for a fact in a specific session.
   *
   * When constructed with a shared writer, delegates to the writer's
   * `readFact()` side-channel. Otherwise reads from the reader's own
   * `seed()`-populated store.
   *
   * Trust values are returned as-is — no clamping, no validation.
   */
  async read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null> {
    if (this.writer !== undefined) {
      const stored = await this.writer.readFact(args.factId as FactId, args.sessionId);
      return stored === null ? null : { trust: stored.trust };
    }
    const records = this.store.get(args.factId);
    if (!records) return null;
    const record = records.find(r => r.sessionId === args.sessionId);
    return record !== undefined ? { trust: record.trust } : null;
  }

  /**
   * Enumerate facts in a session — substrate seam for integrate's pair-scan.
   * Skips records whose stored trust is NaN to mirror SqliteFactReader's
   * `WHERE trust IS NOT NULL` posture. Returns an empty array (never null) for
   * an unseeded session. Order is insertion-order (oldest createdAt first when
   * createdAt was supplied) within each factId bucket; callers needing strict
   * ordering must sort themselves.
   */
  async listBySession(
    args: { sessionId: SessionId },
  ): Promise<ReadonlyArray<{ factId: FactId; content: string; createdAt: number }>> {
    if (this.writer !== undefined) {
      return this.writer.listBySession(args.sessionId);
    }
    const out: Array<{ factId: FactId; content: string; createdAt: number }> = [];
    for (const records of this.store.values()) {
      for (const r of records) {
        if (r.sessionId !== args.sessionId) continue;
        if (Number.isNaN(r.trust)) continue;
        out.push({ factId: r.factId, content: r.content, createdAt: r.createdAt });
      }
    }
    return out;
  }
}

// (Legacy duplicate class body removed in wave-2 — superseded by the
// shared-store variant above.)
