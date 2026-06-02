import type { DB } from './db.js';
import type { Primitive } from './types.js';

interface InternalEntry {
  id: string;
  parentSessionId: string | null;
  forkPointEventId: number | null;
  pluginVersions?: Record<string, string>;
  createdAt: number;
  ownEvents: Primitive[];
}

/**
 * InMemoryDB extends the public DB interface with internal helpers
 * used by session.ts to compose append/query operations without a
 * second storage layer. These internal methods are NOT part of the
 * DB contract and are not accessible to SessionManager.
 */
export interface InMemoryDB extends DB {
  /** Register a new root session (no parent, no fork point). */
  insertRootSession(id: string, createdAt: number): void;
  /** Append a committed primitive to a session's own-event list. */
  pushEvent(sessionId: string, event: Primitive): void;
  /** Return the own-event list for a session (mutable reference). */
  getOwnEvents(sessionId: string): Primitive[];
  /** Return fork metadata + createdAt for building Session objects. */
  getMetadata(
    sessionId: string,
  ): { parentSessionId: string | null; forkPointEventId: number | null; createdAt: number } | null;
}

/**
 * createInMemoryDB — factory for the Sprint 0 in-memory DB adapter.
 *
 * Backs the module-level createSession/fork API in session.ts so the
 * acceptance test continues to pass unchanged. Real SQLite integration
 * is deferred to Refactor 3 (next cycle).
 */
export function createInMemoryDB(): InMemoryDB {
  const store = new Map<string, InternalEntry>();

  return {
    async getSession(id) {
      const s = store.get(id);
      if (!s) return null;
      // ledgerSize = own events for root; prefix + own events for children.
      const ledgerSize =
        s.forkPointEventId === null
          ? s.ownEvents.length
          : s.forkPointEventId + 1 + s.ownEvents.length;
      return { id: s.id, ledgerSize, pluginVersions: s.pluginVersions };
    },

    async insertSession(session) {
      store.set(session.id, {
        ...session,
        forkPointEventId: session.forkPointEventId ?? null,
        ownEvents: [],
      });
    },

    async queryEvents(id, { range: [a, b] }) {
      const s = store.get(id);
      if (!s) return [];
      return s.ownEvents.filter((e) => e.offset >= a && e.offset <= b);
    },

    insertRootSession(id, createdAt) {
      store.set(id, {
        id,
        parentSessionId: null,
        forkPointEventId: null,
        createdAt,
        ownEvents: [],
      });
    },

    pushEvent(sessionId, event) {
      store.get(sessionId)?.ownEvents.push(event);
    },

    getOwnEvents(sessionId) {
      return store.get(sessionId)?.ownEvents ?? [];
    },

    getMetadata(sessionId) {
      const s = store.get(sessionId);
      if (!s) return null;
      return {
        parentSessionId: s.parentSessionId,
        forkPointEventId: s.forkPointEventId,
        createdAt: s.createdAt,
      };
    },
  };
}
