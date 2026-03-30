import { getDb } from './index.js';
import type { CairnEvent } from '../types/index.js';

/** Append an event to the log. Returns the new event id. */
export function logEvent(sessionId: string, eventType: string, payload: object): number {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO event_log (session_id, event_type, payload) VALUES (?, ?, ?)')
    .run(sessionId, eventType, JSON.stringify(payload));
  return Number(result.lastInsertRowid);
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
