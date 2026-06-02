/**
 * DB — minimal storage collaborator interface required by SessionManager.
 *
 * Both production implementations (e.g. SQLite via Refactor 3) and unit-test
 * mocks satisfy this shape. The interface is intentionally narrow — only the
 * operations SessionManager actually needs.
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

  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
