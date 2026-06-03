import { randomUUID } from 'node:crypto';
import type { PrimitiveInput, Primitive, Session, SessionMetadata } from './types.js';
import { SessionManager } from './session-manager.js';
import { createInMemoryDB } from './in-memory-db.js';

/**
 * Default singleton DB + manager for the module-level public API.
 *
 * Callers that need a different DB backend (e.g. real SQLite) should
 * instantiate SessionManager directly with their own DB implementation.
 * This keeps createSession/fork backward-compatible for acceptance tests.
 *
 * Sprint 0 only — real SQLite integration is deferred to Refactor 3.
 *
 * NOTE — InMemoryDB coupling: This module calls InMemoryDB's extended
 * methods (getOwnEvents, getMetadata, insertRootSession, pushEvent),
 * NOT the narrow DB interface used by SessionManager. When a real SQLite
 * adapter lands at Refactor 3, it must either satisfy InMemoryDB's
 * extended surface or session.ts must be restructured to use DB.queryEvents
 * with explicit parent lookups. Intentional for Sprint 0 simplicity.
 */
const db = createInMemoryDB();
const manager = new SessionManager(db);

function buildSession(id: string, metadata: SessionMetadata): Session {
  return {
    id,
    metadata,

    async append(p: PrimitiveInput): Promise<void> {
      const ownEvents = db.getOwnEvents(id);
      // Child sessions start their own offsets at forkPointEventId + 1.
      // Root sessions (forkPointEventId === null) start at 0 (null → base 0).
      const baseOffset = metadata.forkPointEventId === null ? 0 : metadata.forkPointEventId + 1;
      const offset = baseOffset + ownEvents.length;
      db.pushEvent(id, { ...p, offset });
    },

    /**
     * Inclusive-inclusive range query: [a, b] returns offsets a..b.
     * Examples: [0, 46] → 47 events; [0, 23] → 24 events.
     *
     * Child sessions transparently delegate the inherited prefix
     * ([0..forkPointEventId]) to the parent's own-event list so the parent
     * remains unmodified and the child appears to logically extend from it.
     */
    async query({ range: [a, b] }): Promise<Primitive[]> {
      const forkPoint = metadata.forkPointEventId;
      const ownEvents = db.getOwnEvents(id);

      if (forkPoint === null) {
        // Root session — all events are own events, already at their final offsets.
        return ownEvents.filter((e) => e.offset >= a && e.offset <= b);
      }

      // Child session: prefix [0..forkPoint] lives in the parent's own-event list.
      const result: Primitive[] = [];

      if (a <= forkPoint) {
        const parentEvents = db.getOwnEvents(metadata.parentSessionId!);
        const cap = Math.min(b, forkPoint);
        result.push(...parentEvents.filter((e) => e.offset >= a && e.offset <= cap));
      }

      if (b > forkPoint) {
        const childStart = Math.max(a, forkPoint + 1);
        result.push(...ownEvents.filter((e) => e.offset >= childStart && e.offset <= b));
      }

      return result;
    },
  };
}

/** Reset the module-level singleton DB — for test isolation only. */
export function resetInMemoryDb(): void {
  db.clear();
}

/** Create a new root session with no parent lineage. */
export async function createSession(): Promise<Session> {
  const id = randomUUID();
  const createdAt = Date.now();
  const metadata: SessionMetadata = {
    parentSessionId: null,
    forkPointEventId: null,
    createdAt,
  };
  db.insertRootSession(id, createdAt);
  return buildSession(id, metadata);
}

/**
 * Fork an existing session at the given offset.
 *
 * The returned child session logically inherits the parent's prefix [0..atOffset].
 * Its own events (appended after fork) begin at offset atOffset + 1.
 * The parent session is not modified.
 *
 * Delegates invariant validation (non-negative offset, offset ≤ ledger size,
 * parent exists) to SessionManager, then builds the full Session object.
 */
export async function fork(
  parentId: string,
  opts: { atOffset: number },
): Promise<Session> {
  const childId = await manager.forkSession(parentId, opts.atOffset);
  const meta = db.getMetadata(childId)!;
  const metadata: SessionMetadata = {
    parentSessionId: meta.parentSessionId,
    forkPointEventId: meta.forkPointEventId,
    createdAt: meta.createdAt,
  };
  return buildSession(childId, metadata);
}
