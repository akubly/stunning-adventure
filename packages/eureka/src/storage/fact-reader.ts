/**
 * In-memory FactReader — real (non-mock) FactReader implementation for
 * testing and development environments.
 *
 * This is the v1 FactReader implementation. A future persistence-backed
 * implementation (e.g., SQLite) should implement the same FactReader interface
 * and can be verified using the shared contract suite in
 * `storage/__tests__/fact-reader.contract.test.ts`.
 */

import type { SessionId } from '@akubly/types';
import type { FactReader } from '../activities/recall.js';

interface FactRecord {
  trust: number;
  sessionId: SessionId;
}

/**
 * In-memory FactReader backed by a `Map<factId, FactRecord[]>`.
 *
 * **SessionId scoping:** a fact is always scoped to the session it was seeded
 * with. `read({ factId, sessionId })` with a sessionId that differs from the
 * seeded session returns `null` — the fact is treated as not-found from that
 * session's perspective. This mirrors the contract requirement that storage
 * isolation is per-session.
 *
 * **Trust passthrough:** the read layer does NOT validate trust values. If a
 * fact was seeded with `NaN` or an out-of-range trust, `read()` returns that
 * raw value unchanged. Callers (e.g., `applyFeedbackById`) are responsible for
 * validating and throwing `InvalidTrustValueError(source:'storage')`.
 *
 * **Connection lifecycle:** this class owns its own in-memory store. In
 * production wiring, if a persistence-backed FactReader is introduced, it
 * should accept a db handle as a constructor argument rather than managing the
 * connection lifecycle internally.
 */
export class InMemoryFactReader implements FactReader {
  private readonly store = new Map<string, FactRecord[]>();

  /**
   * Seed a fact for a specific session. Not part of the FactReader interface
   * contract — this is a test/dev helper.
   *
   * If a record for the same (factId, sessionId) pair already exists, it is
   * replaced. Different sessions may hold different trust values for the same
   * factId without interfering with each other.
   */
  seed(factId: string, sessionId: SessionId, trust: number): void {
    const records = this.store.get(factId) ?? [];
    const idx = records.findIndex(r => r.sessionId === sessionId);
    if (idx >= 0) {
      records[idx] = { trust, sessionId };
    } else {
      records.push({ trust, sessionId });
    }
    this.store.set(factId, records);
  }

  /**
   * Read the trust value for a fact in a specific session.
   *
   * Returns `null` (never `undefined`) if:
   * - the factId was never seeded, OR
   * - the factId exists but belongs to a different sessionId
   *
   * Trust values are returned as-is — no clamping, no validation.
   */
  async read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null> {
    const records = this.store.get(args.factId);
    if (!records) return null;
    const record = records.find(r => r.sessionId === args.sessionId);
    return record !== undefined ? { trust: record.trust } : null;
  }
}
