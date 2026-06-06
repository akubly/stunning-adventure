import Database from 'better-sqlite3';
import type { InMemoryDB } from './in-memory-db.js';
import type { Primitive } from './types.js';

/**
 * createSQLiteDB — real SQLite adapter for Crucible's own two-table schema.
 *
 * OQ-2 FEDERATE (locked 2026-06-06): Crucible owns this schema entirely.
 * Zero Cairn imports, zero coupling to packages/cairn's event_log.
 *
 * Schema:
 *   sessions (id, parent_session_id, fork_point_event_id, plugin_versions, created_at)
 *   events   (session_id, offset, primitive_kind, primitive_payload, causal_read_set)
 *
 * Satisfies the full InMemoryDB interface:
 *   - DB base methods (async): getSession, insertSession, queryEvents
 *   - InMemoryDB extensions (sync): insertRootSession, pushEvent, getOwnEvents, getMetadata, clear
 */
export function createSQLiteDB(path: ':memory:' | string): InMemoryDB {
  const db = new Database(path);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id                  TEXT    PRIMARY KEY,
      parent_session_id   TEXT,
      fork_point_event_id INTEGER,
      plugin_versions     TEXT,
      created_at          INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      session_id          TEXT    NOT NULL REFERENCES sessions(id),
      "offset"            INTEGER NOT NULL,
      primitive_kind      TEXT    NOT NULL,
      primitive_payload   TEXT    NOT NULL,
      causal_read_set     TEXT    NOT NULL,
      PRIMARY KEY (session_id, "offset")
    );
  `);

  // ── Prepared statements ───────────────────────────────────────────────────

  const stmtGetSession = db.prepare<[string], {
    id: string;
    fork_point_event_id: number | null;
    plugin_versions: string | null;
  }>(`
    SELECT id, fork_point_event_id, plugin_versions
    FROM sessions WHERE id = ?
  `);

  const stmtCountOwnEvents = db.prepare<[string], { cnt: number }>(`
    SELECT COUNT(*) AS cnt FROM events WHERE session_id = ?
  `);

  const stmtInsertSession = db.prepare(`
    INSERT INTO sessions (id, parent_session_id, fork_point_event_id, plugin_versions, created_at)
    VALUES (@id, @parentSessionId, @forkPointEventId, @pluginVersions, @createdAt)
  `);

  const stmtQueryEvents = db.prepare<[string, number, number], {
    primitive_kind: string;
    primitive_payload: string;
    causal_read_set: string;
    offset: number;
  }>(`
    SELECT primitive_kind, primitive_payload, causal_read_set, "offset"
    FROM events
    WHERE session_id = ? AND "offset" >= ? AND "offset" <= ?
    ORDER BY "offset" ASC
  `);

  const stmtInsertEvent = db.prepare(`
    INSERT INTO events (session_id, "offset", primitive_kind, primitive_payload, causal_read_set)
    VALUES (@sessionId, @offset, @primitiveKind, @primitivePayload, @causalReadSet)
  `);

  const stmtGetAllEvents = db.prepare<[string], {
    primitive_kind: string;
    primitive_payload: string;
    causal_read_set: string;
    offset: number;
  }>(`
    SELECT primitive_kind, primitive_payload, causal_read_set, "offset"
    FROM events WHERE session_id = ?
    ORDER BY "offset" ASC
  `);

  const stmtGetMetadata = db.prepare<[string], {
    parent_session_id: string | null;
    fork_point_event_id: number | null;
    created_at: number;
  }>(`
    SELECT parent_session_id, fork_point_event_id, created_at
    FROM sessions WHERE id = ?
  `);

  const stmtClearEvents = db.prepare(`DELETE FROM events`);
  const stmtClearSessions = db.prepare(`DELETE FROM sessions`);

  // ── Row-to-Primitive helper ───────────────────────────────────────────────

  function rowToPrimitive(row: {
    primitive_kind: string;
    primitive_payload: string;
    causal_read_set: string;
    offset: number;
  }): Primitive {
    return {
      primitiveKind: row.primitive_kind as Primitive['primitiveKind'],
      primitivePayload: JSON.parse(row.primitive_payload) as unknown,
      causalReadSet: JSON.parse(row.causal_read_set) as string[],
      offset: row.offset,
    };
  }

  // ── DB base methods (async) ───────────────────────────────────────────────

  return {
    async getSession(id) {
      const row = stmtGetSession.get(id);
      if (!row) return null;

      const { cnt } = stmtCountOwnEvents.get(id)!;
      const ledgerSize =
        row.fork_point_event_id === null
          ? cnt
          : row.fork_point_event_id + 1 + cnt;

      const pluginVersions = row.plugin_versions
        ? (JSON.parse(row.plugin_versions) as Record<string, string>)
        : undefined;

      return { id, ledgerSize, pluginVersions };
    },

    async insertSession(session) {
      stmtInsertSession.run({
        id: session.id,
        parentSessionId: session.parentSessionId ?? null,
        forkPointEventId: session.forkPointEventId ?? null,
        pluginVersions: session.pluginVersions
          ? JSON.stringify(session.pluginVersions)
          : null,
        createdAt: session.createdAt,
      });
    },

    async queryEvents(id, { range: [a, b] }) {
      const rows = stmtQueryEvents.all(id, a, b);
      return rows.map(rowToPrimitive);
    },

    // ── InMemoryDB extensions (synchronous) ────────────────────────────────

    insertRootSession(id, createdAt) {
      stmtInsertSession.run({
        id,
        parentSessionId: null,
        forkPointEventId: null,
        pluginVersions: null,
        createdAt,
      });
    },

    pushEvent(sessionId, event) {
      stmtInsertEvent.run({
        sessionId,
        offset: event.offset,
        primitiveKind: event.primitiveKind,
        primitivePayload: JSON.stringify(event.primitivePayload),
        causalReadSet: JSON.stringify(event.causalReadSet),
      });
    },

    getOwnEvents(sessionId) {
      return stmtGetAllEvents.all(sessionId).map(rowToPrimitive);
    },

    getMetadata(sessionId) {
      const row = stmtGetMetadata.get(sessionId);
      if (!row) return null;
      return {
        parentSessionId: row.parent_session_id,
        forkPointEventId: row.fork_point_event_id,
        createdAt: row.created_at,
      };
    },

    clear() {
      stmtClearEvents.run();
      stmtClearSessions.run();
    },
  };
}
