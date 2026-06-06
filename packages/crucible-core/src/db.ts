import type { Primitive } from './types.js';

/**
 * DB — persistence port for crucible-core.
 *
 * SessionManager uses a subset of this interface: getSession (validation) and
 * insertSession (fork creation). queryEvents is retained for session-level query
 * needs and the forthcoming SQLite adapter (Refactor 3); it is not called by
 * SessionManager today but is part of the intended port contract.
 */
export interface DB {
  getSession(
    id: string,
  ): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;

  insertSession(session: {
    id: string;
    parentSessionId: string | null;
    forkPointEventId: number | null;
    pluginVersions?: Record<string, string>;
    createdAt: number;
  }): Promise<void>;

  queryEvents(id: string, opts: { range: [number, number] }): Promise<Primitive[]>;
}
