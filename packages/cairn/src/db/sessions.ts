import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { Session, SessionKind } from '../types/index.js';
import { getLastEventTime } from './events.js';

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
 * Inner helper for workdir-scoped user-session lookup. Always applies `workdir IS ?`:
 *   - `workdir = null`   → matches rows where workdir IS NULL (pre-migration backcompat)
 *   - `workdir = 'path'` → matches rows where workdir = 'path' (worktree-specific)
 *
 * Restricts to `session_kind = 'user'` so system sessions are never returned
 * through the workdir path, keeping identity semantics clean.
 */
function getActiveSessionByWorkdir(
  db: Database.Database,
  repoKey: string,
  workdir: string | null,
): Session | undefined {
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
       FROM sessions
       WHERE repo_key = ? AND status = 'active' AND session_kind = 'user' AND workdir IS ?
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
 * When workdir is omitted: queries `AND workdir IS NULL`, matching only pre-migration
 * rows (backward compat — old callers can't accidentally pick up a worktree session).
 * When workdir is provided as a string: queries `AND workdir IS workdir` (exact worktree match).
 *
 * For any-active-session lookup regardless of worktree, use getActiveUserSession (no workdir filter).
 */
export function getActiveSession(
  db: Database.Database,
  repoKey: string,
  workdir?: string,
): Session | undefined {
  // undefined → null so SQLite IS NULL matches pre-migration (NULL-workdir) rows.
  return getActiveSessionByWorkdir(db, repoKey, workdir ?? null);
}

/**
 * Claim a NULL-workdir active user session for the given worktree path.
 *
 * Called when starting a new worktree session and no (repo_key, workdir)
 * session exists — promotes the legacy NULL-workdir row to carry the
 * worktree identity instead of creating a duplicate session.
 *
 * Returns the updated session, or undefined if no unclaimed NULL-workdir
 * user session exists for this repo.
 *
 * @remarks The claim is atomic: a single `UPDATE … WHERE … AND workdir IS NULL`
 * ensures two concurrent worktree starts cannot both adopt the same legacy row.
 * Any additional NULL-workdir active user sessions for the same repo (orphans
 * from abnormal exits) are completed as a cleanup side-effect so they do not
 * accumulate.
 *
 * The session's full event history is retained — only the workdir column and
 * (for orphans) status/ended_at are updated.
 *
 * @internal Not part of the public API surface — called only by archivist.startSession.
 */
export function claimLegacyActiveSession(
  db: Database.Database,
  repoKey: string,
  workdir: string,
): Session | undefined {
  // Step 1: Identify the candidate row (most recently started NULL-workdir user session).
  const candidate = db
    .prepare(
      `SELECT id FROM sessions
       WHERE repo_key = ? AND status = 'active' AND session_kind = 'user' AND workdir IS NULL
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(repoKey) as { id: string } | undefined;

  if (!candidate) return undefined;

  // Step 2: CAS claim — atomically set workdir only if still NULL.
  // result.changes === 0 means another concurrent caller won the race.
  const result = db
    .prepare(`UPDATE sessions SET workdir = ? WHERE id = ? AND workdir IS NULL`)
    .run(workdir, candidate.id);

  if (result.changes !== 1) return undefined;

  // Step 3: Orphan cleanup — complete NULL-workdir active user sessions for the
  // same repo that are not the winner, provided they have been inactive long
  // enough to be considered stale. Sessions with activity in the last 5 minutes
  // are skipped with a warning: they may belong to a concurrent archivist that
  // hasn't had a chance to claim yet.
  const ORPHAN_GRACE_MS = 5 * 60 * 1000; // 5 minutes
  const orphans = db
    .prepare(
      `SELECT id, started_at FROM sessions
       WHERE repo_key = ? AND status = 'active' AND session_kind = 'user'
         AND workdir IS NULL AND id != ?`,
    )
    .all(repoKey, candidate.id) as Array<{ id: string; started_at: string }>;

  for (const orphan of orphans) {
    const lastActivity = getLastEventTime(db, orphan.id) ?? orphan.started_at;
    // SQLite datetime() returns 'YYYY-MM-DD HH:MM:SS' in UTC without a 'Z'
    // suffix. Appending 'Z' forces correct UTC parsing in JavaScript so the
    // idle duration comparison is correct regardless of host timezone.
    const lastActivityIso = lastActivity.includes('T')
      ? lastActivity
      : lastActivity.replace(' ', 'T') + 'Z';
    const idleMs = Date.now() - new Date(lastActivityIso).getTime();
    if (idleMs < ORPHAN_GRACE_MS) {
      process.stderr.write(
        `[cairn] claimLegacyActiveSession: skipping orphan session ${orphan.id} ` +
        `(last activity ${Math.round(idleMs / 1000)}s ago — within 5-minute grace window). ` +
        `It will be cleaned up on the next claim cycle.\n`,
      );
      continue;
    }
    db.prepare(
      `UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?`,
    ).run(orphan.id);
  }

  // Step 4: Read back the updated row.
  const row = db
    .prepare(
      `SELECT id, repo_key, branch, started_at, ended_at, status, session_kind, workdir
       FROM sessions WHERE id = ?`,
    )
    .get(candidate.id) as Record<string, unknown> | undefined;

  return row ? mapSession(row) : undefined;
}

/**
 * Return the most recent active user session for a repo, or undefined.
 *
 * @remarks Does not filter by workdir — returns the most recently started active
 * user session for the repo regardless of which worktree it belongs to. In a
 * multi-worktree setup multiple active sessions may exist for the same repo; this
 * function returns only the most recent one. Prefer getActiveSession with an
 * explicit workdir when worktree isolation is required.
 */
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
 * Returns both NULL-workdir and worktree-specific sessions so callers can
 * distinguish sessions by workdir.
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

