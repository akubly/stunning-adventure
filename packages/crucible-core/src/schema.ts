/**
 * SCHEMA_V1_SQL — canonical Crucible two-table DDL (single authoritative source).
 *
 * OQ-2 FEDERATE (locked 2026-06-06): Crucible owns these tables entirely.
 * Zero coupling to Cairn's event_log.
 *
 * TODO(follow-up): add PRAGMA user_version / migration seam when schema evolution is needed.
 */
export const SCHEMA_V1_SQL = `
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
`;
