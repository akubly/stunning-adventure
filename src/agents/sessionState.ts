import { getDb } from '../db/index.js';
import { getSkips } from '../db/skipBreadcrumbs.js';
import type { CairnEvent, SkipBreadcrumb } from '../types/index.js';

export interface SessionSummary {
  sessionId: string;
  repoKey: string;
  status: string;
  startedAt: string;
  eventCount: number;
  toolUseCount: number;
  errorCount: number;
  skipCount: number;
  recentEvents: CairnEvent[];
  skips: SkipBreadcrumb[];
}

/** Get a summary of a session's current state. */
export function getSessionSummary(sessionId: string): SessionSummary | undefined {
  const db = getDb();

  const session = db
    .prepare('SELECT id, repo_key, status, started_at FROM sessions WHERE id = ?')
    .get(sessionId) as Record<string, unknown> | undefined;

  if (!session) return undefined;

  const eventCount = (
    db.prepare('SELECT COUNT(*) as count FROM event_log WHERE session_id = ?').get(sessionId) as {
      count: number;
    }
  ).count;

  const toolUseCount = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM event_log WHERE session_id = ? AND event_type = 'tool_use'",
      )
      .get(sessionId) as { count: number }
  ).count;

  const errorCount = (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM event_log WHERE session_id = ? AND event_type = 'error'",
      )
      .get(sessionId) as { count: number }
  ).count;

  const skips = getSkips(sessionId);

  const recentEvents = (
    db
      .prepare(
        'SELECT id, event_type, payload, session_id, created_at FROM event_log WHERE session_id = ? ORDER BY id DESC LIMIT 10',
      )
      .all(sessionId) as Array<Record<string, unknown>>
  ).map((row) => ({
    id: row.id as number,
    eventType: row.event_type as string,
    payload: row.payload as string,
    sessionId: row.session_id as string,
    createdAt: row.created_at as string,
  }));

  return {
    sessionId: session.id as string,
    repoKey: session.repo_key as string,
    status: session.status as string,
    startedAt: session.started_at as string,
    eventCount,
    toolUseCount,
    errorCount,
    skipCount: skips.length,
    recentEvents,
    skips,
  };
}

/** Lightweight check: does a session with this ID exist? */
export function sessionExists(sessionId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM sessions WHERE id = ? LIMIT 1').get(sessionId);
  return row !== undefined;
}

/** Check whether a specific event type has occurred in this session. */
export function hasEventOccurred(sessionId: string, eventType: string): boolean {
  const db = getDb();
  const row = db
    .prepare('SELECT 1 FROM event_log WHERE session_id = ? AND event_type = ? LIMIT 1')
    .get(sessionId, eventType);
  return row !== undefined;
}

/** Search events by type pattern (e.g., 'review', 'test'). */
export function findEvents(sessionId: string, typePattern: string): CairnEvent[] {
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT id, event_type, payload, session_id, created_at FROM event_log WHERE session_id = ? AND event_type LIKE ? ORDER BY id ASC',
    )
    .all(sessionId, `%${typePattern}%`) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as number,
    eventType: row.event_type as string,
    payload: row.payload as string,
    sessionId: row.session_id as string,
    createdAt: row.created_at as string,
  }));
}
