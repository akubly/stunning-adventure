import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Session, SessionKind } from '../types/index.js';

/** Sentinel repo key used for system-generated events that are not tied to a user session. */
export const SYSTEM_SESSION_REPO_KEY = '__system__';

function mapSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    repoKey: row.repo_key as string,
    branch: (row.branch as string | null) ?? undefined,
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string | null) ?? undefined,
    status: row.status as string,
    kind: row.session_kind as SessionKind,
  };
}

function createSessionWithDb(
  db: Database.Database,
  repoKey: string,
  branch?: string,
  kind: SessionKind = 'user',
): string {
  const id = randomUUID();
  db.prepare('INSERT INTO sessions (id, repo_key, branch, session_kind) VALUES (?, ?, ?, ?)').run(
    id,
    repoKey,
    branch ?? null,
    kind,
  );
  return id;
}

function getActiveSessionWithDb(
  db: Database.Database,
  repoKey: string,
  kind?: SessionKind,
): Session | undefined {
  const kindClause = kind ? ' AND session_kind = ?' : '';
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind
       FROM sessions WHERE repo_key = ? AND status = 'active'${kindClause}
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(...(kind ? [repoKey, kind] : [repoKey])) as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
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

/** Return the most recent active user session for a repo, or undefined. */
export function getActiveUserSession(db: Database.Database, repoKey: string): Session | undefined {
  return getActiveSessionWithDb(db, repoKey, 'user');
}

/** Return the most recent active session across all repos, or undefined. */
export function getMostRecentActiveSession(db: Database.Database): Session | undefined {
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind
       FROM sessions WHERE status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
}

/** Return the most recent active user session across all repos, or undefined. */
export function getMostRecentUserSession(db: Database.Database): Session | undefined {
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind
       FROM sessions WHERE status = 'active' AND session_kind = 'user'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
}

function ensureSystemSessionInTransaction(db: Database.Database, repoKey: string): string {
  const session = getActiveSessionWithDb(db, repoKey, 'system');
  if (session) return session.id;
  return createSessionWithDb(db, repoKey, 'main', 'system');
}

/**
 * Ensures a system session exists for logging system-level events (hint state transitions, profile bumps).
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
