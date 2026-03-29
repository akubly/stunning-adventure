import { randomUUID } from 'node:crypto';
import { getDb } from './index.js';
import type { Session } from '../types/index.js';

/** Create a new active session. Returns the generated session id. */
export function createSession(repoKey: string, branch?: string): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare('INSERT INTO sessions (id, repo_key, branch) VALUES (?, ?, ?)').run(
    id,
    repoKey,
    branch ?? null,
  );
  return id;
}

/** Mark a session as ended with the given status (default: 'completed'). */
export function endSession(id: string, status: string = 'completed'): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET ended_at = datetime('now'), status = ? WHERE id = ?").run(
    status,
    id,
  );
}

/** Return the most recent active session for a repo, or undefined. */
export function getActiveSession(repoKey: string): Session | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status
       FROM sessions WHERE repo_key = ? AND status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(repoKey) as Record<string, unknown> | undefined;

  if (!row) return undefined;

  return {
    id: row.id as string,
    repoKey: row.repo_key as string,
    branch: (row.branch as string | null) ?? undefined,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string | null) ?? undefined,
    status: row.status as string,
  };
}
