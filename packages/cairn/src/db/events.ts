import type Database from 'better-sqlite3';
import { getDb } from './index.js';
import type { CairnEvent } from '../types/index.js';

function isDatabase(value: unknown): value is Database.Database {
  return (
    typeof value === 'object' &&
    value !== null &&
    'prepare' in value &&
    'pragma' in value &&
    'transaction' in value
  );
}

/** Append an event to the log using an explicit database handle. Returns the new event id. */
export function logEvent(
  db: Database.Database,
  sessionId: string,
  eventType: string,
  payload: object,
): number;
/** @deprecated Prefer logEvent(db, ...) or logEventWithDefaultDb(...) to avoid hidden DB coupling. */
export function logEvent(sessionId: string, eventType: string, payload: object): number;
export function logEvent(
  dbOrSessionId: Database.Database | string,
  sessionIdOrEventType: string,
  eventTypeOrPayload: string | object,
  maybePayload?: object,
): number {
  const [db, sessionId, eventType, payload]: [
    Database.Database,
    string,
    string,
    object | undefined,
  ] = isDatabase(dbOrSessionId)
    ? [dbOrSessionId, sessionIdOrEventType, eventTypeOrPayload as string, maybePayload]
    : [getDb(), dbOrSessionId, sessionIdOrEventType, eventTypeOrPayload as object | undefined];

  if (payload == null) {
    throw new Error(`logEvent payload is required for event type ${eventType}`);
  }

  const result = db
    .prepare('INSERT INTO event_log (session_id, event_type, payload) VALUES (?, ?, ?)')
    .run(sessionId, eventType, JSON.stringify(payload));
  return Number(result.lastInsertRowid);
}

/** Append an event using the process default database. Prefer logEvent(db, ...) in DB-layer code. */
export function logEventWithDefaultDb(
  sessionId: string,
  eventType: string,
  payload: object,
): number {
  return logEvent(getDb(), sessionId, eventType, payload);
}

/** Return the timestamp of the most recent event for a session, or undefined.
 *  The value is in SQLite datetime format (`YYYY-MM-DD HH:MM:SS` UTC).
 *  Uses ORDER BY / LIMIT 1 to leverage the (session_id, created_at) index. */
export function getLastEventTime(sessionId: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT created_at AS last_at FROM event_log WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(sessionId) as { last_at: string | null } | undefined;
  return row?.last_at ?? undefined;
}

/** Cursor-based retrieval: return events with id > lastProcessedId. */
export function getUnprocessedEvents(lastProcessedId: number, limit?: number): CairnEvent[] {
  const db = getDb();
  const hasLimit = limit !== undefined && limit > 0;
  const sql = hasLimit
    ? `SELECT id, event_type, payload, session_id, created_at
       FROM event_log WHERE id > ? ORDER BY id ASC LIMIT ?`
    : `SELECT id, event_type, payload, session_id, created_at
       FROM event_log WHERE id > ? ORDER BY id ASC`;
  const rows = (hasLimit
    ? db.prepare(sql).all(lastProcessedId, limit)
    : db.prepare(sql).all(lastProcessedId)) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as number,
    eventType: row.event_type as string,
    payload: row.payload as string,
    sessionId: row.session_id as string,
    createdAt: row.created_at as string,
  }));
}
