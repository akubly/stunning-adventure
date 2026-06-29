/**
 * InMemoryFactReader — in-memory FactReader + SessionFactLister implementation
 * for testing and development environments.
 *
 * Lives in `fact-reader-inmemory.ts` (file name matches content) — superseded
 * the earlier `fact-reader.ts` + re-export shim during the integrate-slice
 * fix wave (F5/S6: "no dangling indirection"). External importers should use
 * this path directly.
 *
 * ## Wave-2 (integrate substrate) + Fix Wave (D-R1 seam split)
 *
 * Internal records carry `content` and `createdAt` so `listBySession` can
 * return the shape the integrate consolidation pass needs. The class
 * implements both `FactReader` (single-fact read seam) and
 * `SessionFactLister` (session enumeration seam, split out of `FactReader`
 * during the D-R1 review).
 *
 * The constructor accepts an optional `InMemoryFactWriter` for a shared
 * backing-store mode — used by the integrate activity harness so a single
 * imprint→integrate pipeline does not need to mirror state between the
 * writer and the reader. When constructed WITHOUT a writer, the reader
 * uses its own internal store populated via the test-only `seed()` helper.
 */

import type { SessionId, FactId } from '@akubly/types';
import type { FactReader, SessionFactLister } from '../activities/recall.js';
import type { InMemoryFactWriter } from './fact-writer.js';

interface FactRecord {
  factId: FactId;
  content: string;
  trust: number;
  sessionId: SessionId;
  createdAt: number;
}

export class InMemoryFactReader implements FactReader, SessionFactLister {
  private readonly store = new Map<string, FactRecord[]>();
  private readonly writer?: InMemoryFactWriter;
  /** Monotonic counter used as a createdAt fallback when callers omit it. */
  private nextCreatedAt = 1;

  /**
   * @param writer  Optional InMemoryFactWriter to share state with. When
   *                provided, `read()` and `listBySession()` delegate to the
   *                writer's internal store so an `imprint → integrate` pipeline
   *                sees a single source of truth. `seed()` is REJECTED in this
   *                mode (see F6 guard below).
   */
  constructor(writer?: InMemoryFactWriter) {
    this.writer = writer;
  }

  /**
   * Seed a fact for a specific session. Not part of any public seam — this
   * is a test/dev helper.
   *
   * If a record for the same (factId, sessionId) pair already exists, it is
   * replaced. Different sessions may hold different trust values for the same
   * factId without interfering with each other.
   *
   * @param createdAt  Unix epoch ms; defaults to a monotonically increasing
   *                   counter so contract tests that don't care about the
   *                   value still get deterministic ascending order.
   *
   * @throws Error when this reader was constructed with a shared
   *         `InMemoryFactWriter`. In shared-store mode the writer is the
   *         single source of truth; seeding the reader's private store would
   *         silently diverge from what `read()`/`listBySession()` return.
   *         Use `writer.write(...)` in shared-store mode. (F6 review fix.)
   */
  seed(
    factId: string,
    sessionId: SessionId,
    trust: number,
    content: string = '',
    createdAt: number = this.nextCreatedAt++,
  ): void {
    if (this.writer !== undefined) {
      throw new Error(
        'InMemoryFactReader.seed: cannot seed when constructed with a shared InMemoryFactWriter — ' +
          'use writer.write({ factId, sessionId, content, trust, ... }) instead. ' +
          'In shared-store mode the writer is the single source of truth.',
      );
    }
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
