import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Session } from '../types/index.js';

/** Sentinel repo key used for system-generated events that are not tied to a user session. */
export const SYSTEM_SESSION_REPO_KEY = '__system__';

function createSessionWithDb(db: Database.Database, repoKey: string, branch?: string): string {
  const id = randomUUID();
  db.prepare('INSERT INTO sessions (id, repo_key, branch) VALUES (?, ?, ?)').run(
    id,
    repoKey,
    branch ?? null,
  );
  return id;
}

function getActiveSessionWithDb(db: Database.Database, repoKey: string): Session | undefined {
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

/** Create a new active session. Returns the generated session id. */
export function createSession(db: Database.Database, repoKey: string, branch?: string): string {
  return createSessionWithDb(db, repoKey, branch);
}

/** Mark a session as ended with the given status (default: 'completed'). */
export function endSession(db: Database.Database, id: string, status: string = 'completed'): void {
  db.prepare("UPDATE sessions SET ended_at = datetime('now'), status = ? WHERE id = ?").run(
    status,
    id,
  );
}

/** Return the most recent active session for a repo, or undefined. */
export function getActiveSession(db: Database.Database, repoKey: string): Session | undefined {
  return getActiveSessionWithDb(db, repoKey);
}

/** Return the most recent active session across all repos, or undefined. */
export function getMostRecentActiveSession(db: Database.Database): Session | undefined {
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status
       FROM sessions WHERE status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

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

function ensureSystemSessionInTransaction(db: Database.Database, repoKey: string): string {
  const session = getActiveSessionWithDb(db, repoKey);
  if (session) return session.id;
  return createSessionWithDb(db, repoKey, 'main');
}

/**
 * Ensures a system session exists for logging system-level events (hint state transitions, profile bumps).
 * Known issue: system sessions created here can be returned by MCP's getMostRecentActiveSession() fallback. See cycle-1 review I5; Wave 5 should add session_kind and user-only fallback lookup.
 * Returns the session ID to use for system events.
 */
export function ensureSystemSession(
  db: Database.Database,
  repoKey: string = SYSTEM_SESSION_REPO_KEY,
): string {
  if (db.inTransaction) {
    return ensureSystemSessionInTransaction(db, repoKey);
  }

  return db.transaction(() => ensureSystemSessionInTransaction(db, repoKey)).immediate();
}
