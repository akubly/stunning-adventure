import type Database from 'better-sqlite3';
import type { CairnEvent } from '../types/index.js';

/** Append an event to the log. Returns the new event id. */
export function logEvent(
  db: Database.Database,
  sessionId: string,
  eventType: string,
  payload: object,
): number {
  if (payload == null) {
    throw new Error(`logEvent payload is required for event type ${eventType}`);
  }

  const result = db
    .prepare('INSERT INTO event_log (session_id, event_type, payload) VALUES (?, ?, ?)')
    .run(sessionId, eventType, JSON.stringify(payload));
  return Number(result.lastInsertRowid);
}

/** Return the timestamp of the most recent event for a session, or undefined. */
export function getLastEventTime(db: Database.Database, sessionId: string): string | undefined {
  const row = db
    .prepare(
      'SELECT created_at AS last_at FROM event_log WHERE session_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(sessionId) as { last_at: string | null } | undefined;
  return row?.last_at ?? undefined;
}

/** Cursor-based retrieval: return events with id > lastProcessedId. */
export function getUnprocessedEvents(
  db: Database.Database,
  lastProcessedId: number,
  limit?: number,
): CairnEvent[] {
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
