import { getDb } from './index.js';
import type { SkipBreadcrumb } from '../types/index.js';

/** Record that something was intentionally skipped. Returns the new row id. */
export function recordSkip(
  sessionId: string,
  whatSkipped: string,
  reason?: string,
  agent?: string,
): number {
  const db = getDb();
  const result = db
    .prepare(
      'INSERT INTO skip_breadcrumbs (session_id, what_skipped, reason, agent) VALUES (?, ?, ?, ?)',
    )
    .run(sessionId, whatSkipped, reason ?? null, agent ?? null);
  return Number(result.lastInsertRowid);
}

/** Get all skip breadcrumbs for a session, ordered by id. */
export function getSkips(sessionId: string): SkipBreadcrumb[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, what_skipped, reason, agent, session_id, created_at
       FROM skip_breadcrumbs WHERE session_id = ? ORDER BY id ASC`,
    )
    .all(sessionId) as Array<Record<string, unknown>>;

  return rows.map((row) => ({
    id: row.id as number,
    whatSkipped: row.what_skipped as string,
    reason: (row.reason as string | null) ?? undefined,
    agent: (row.agent as string | null) ?? undefined,
    sessionId: row.session_id as string,
    createdAt: row.created_at as string,
  }));
}
