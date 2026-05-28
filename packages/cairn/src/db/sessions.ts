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
    workdir: (row.workdir as string | null) ?? undefined,
  };
}

function createSessionWithDb(
  db: Database.Database,
  repoKey: string,
  branch?: string,
  kind: SessionKind = 'user',
  workdir?: string,
): string {
  const id = randomUUID();
  db.prepare(
    'INSERT INTO sessions (id, repo_key, branch, session_kind, workdir) VALUES (?, ?, ?, ?, ?)',
  ).run(id, repoKey, branch ?? null, kind, workdir ?? null);
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
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
       FROM sessions WHERE repo_key = ? AND status = 'active'${kindClause}
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(...(kind ? [repoKey, kind] : [repoKey])) as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
}

/**
 * Inner helper for workdir-scoped lookup. Always applies `workdir IS ?`:
 *   - `workdir = null`   → matches rows where workdir IS NULL (pre-migration backcompat)
 *   - `workdir = 'path'` → matches rows where workdir = 'path' (worktree-specific)
 */
function getActiveSessionByWorkdir(
  db: Database.Database,
  repoKey: string,
  workdir: string | null,
): Session | undefined {
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
       FROM sessions WHERE repo_key = ? AND status = 'active' AND workdir IS ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(repoKey, workdir) as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
}

/** Create a new active session. Returns the generated session id. */
export function createSession(
  db: Database.Database,
  repoKey: string,
  branch?: string,
  workdir?: string,
): string {
  return createSessionWithDb(db, repoKey, branch, 'user', workdir);
}

/** Mark a session as ended with the given status (default: 'completed'). */
export function endSession(db: Database.Database, id: string, status: string = 'completed'): void {
  db.prepare("UPDATE sessions SET ended_at = datetime('now'), status = ? WHERE id = ?").run(
    status,
    id,
  );
}

/**
 * Return the most recent active session for a repo scoped by workdir identity.
 *
 * When workdir is omitted: no workdir filter applied — returns the most recent
 * active session regardless of workdir (backward compat for pre-migration callers).
 * When workdir is provided: filters with `workdir IS ?` (SQLite IS handles NULL
 * correctly, so passing undefined coerced to null matches NULL-workdir rows).
 *
 * For MCP fallback paths that always need a user session, use getActiveUserSession.
 */
export function getActiveSession(
  db: Database.Database,
  repoKey: string,
  workdir?: string,
): Session | undefined {
  if (workdir !== undefined) {
    return getActiveSessionByWorkdir(db, repoKey, workdir);
  }
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
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
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
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
       FROM sessions WHERE status = 'active' AND session_kind = 'user'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
}

/**
 * List all active user sessions for a repo, ordered by start time descending.
 * Used by the get_status MCP tool to return a flat array of all active sessions
 * so callers can distinguish sessions by workdir.
 */
export function listActiveSessionsForRepo(db: Database.Database, repoKey: string): Session[] {
  const rows = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
       FROM sessions
       WHERE repo_key = ? AND status = 'active' AND session_kind = 'user'
       ORDER BY started_at DESC`,
    )
    .all(repoKey) as Array<Record<string, unknown>>;

  return rows.map(mapSession);
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

