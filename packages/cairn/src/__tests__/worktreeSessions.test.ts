/**
 * Worktree-aware session tests — issue #11 WI-A
 *
 * Covers test areas 1–4:
 *   1. Worktree-aware lookup: getActiveSession(db, repoKey, workdir) resolves
 *      the correct session for a (repoKey, workdir) pair without collision.
 *   2. Collision prevention: two sessions for the same repo in different
 *      workdirs are distinct rows; listActiveSessionsForRepo returns both.
 *   3. NULL-workdir backcompat: pre-migration sessions (workdir = NULL) remain
 *      findable via getActiveSession(db, repoKey) with no workdir arg. Mixed
 *      scenario (NULL + non-NULL) retrieves each correctly.
 *   4. getWorkdir() happy path: returns the workdir root inside a git repo;
 *      returns undefined (does NOT throw) outside a git repo.
 *
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { getDb, closeDb } from '../db/index.js';
import {
  createSession,
  getActiveSession,
  listActiveSessionsForRepo,
  claimLegacyActiveSession,
} from '../db/sessions.js';
import { getWorkdir } from '../hooks/gitContext.js';
import { logEvent } from '../db/events.js';
import { runSessionStart } from '../hooks/sessionStart.js';

let db: ReturnType<typeof getDb>;

const REPO_KEY = 'org/worktree-test-repo';
const WORKDIR_A = '/repos/project';
const WORKDIR_B = '/repos/project-worktrees/feature-branch';

beforeEach(() => {
  closeDb();
  db = getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Area 1: Worktree-aware lookup
// ---------------------------------------------------------------------------

describe('worktree-aware lookup — getActiveSession with workdir', () => {
  it('returns the session matching the specified workdir', () => {
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);

    const sessionA = getActiveSession(db, REPO_KEY, WORKDIR_A);
    const sessionB = getActiveSession(db, REPO_KEY, WORKDIR_B);

    expect(sessionA).toBeDefined();
    expect(sessionA!.id).toBe(idA);
    expect(sessionB).toBeDefined();
    expect(sessionB!.id).toBe(idB);
  });

  it('does not return a session from a different workdir', () => {
    // Querying with an unknown workdir must not bleed into another worktree's session.
    createSession(db, REPO_KEY, 'main', WORKDIR_A);

    const result = getActiveSession(db, REPO_KEY, '/repos/project-worktrees/other');
    expect(result).toBeUndefined();
  });

  it('session carries workdir in its fields', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);

    expect(session).toBeDefined();
    expect((session as Record<string, unknown>).workdir).toBe(WORKDIR_A);
  });

  it('returns the most recent active session when multiple exist for the same workdir', () => {
    // End the first session, create a second; should find the newer one.
    const idFirst = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(idFirst);
    const idSecond = createSession(db, REPO_KEY, 'main', WORKDIR_A);

    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(session).toBeDefined();
    expect(session!.id).toBe(idSecond);
  });
});

// ---------------------------------------------------------------------------
// Area 2: Collision prevention
// ---------------------------------------------------------------------------

describe('collision prevention — two workdirs for the same repo', () => {
  it('creates two distinct session rows for different workdirs', () => {
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);
    expect(idA).not.toBe(idB);
  });

  it('neither session overrides the other — both remain active', () => {
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);

    expect(getActiveSession(db, REPO_KEY, WORKDIR_A)!.id).toBe(idA);
    expect(getActiveSession(db, REPO_KEY, WORKDIR_B)!.id).toBe(idB);
  });

  it('listActiveSessionsForRepo returns all active sessions across workdirs', () => {
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
  });

  it('listActiveSessionsForRepo excludes sessions from other repos', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A);
    createSession(db, 'org/other-repo', 'main', '/repos/other');

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as { id: string }).id).toBeDefined();
  });

  it('listActiveSessionsForRepo excludes ended sessions', () => {
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);

    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(idA);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as { id: string }).id).toBe(idB);
  });
});

// ---------------------------------------------------------------------------
// Area 3: NULL-workdir backward compatibility
// ---------------------------------------------------------------------------

describe('NULL-workdir backward compatibility', () => {
  it('a NULL-workdir session is findable via getActiveSession with no workdir arg', () => {
    //
    // Simulate a pre-migration row: createSession without workdir inserts NULL.
    // Old callers that pass no workdir must still find it.
    const id = createSession(db, REPO_KEY, 'main'); // workdir = NULL
    const session = getActiveSession(db, REPO_KEY);  // no workdir arg

    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
  });

  it('getActiveSession with no workdir argument returns ONLY NULL-workdir sessions, not workdir-populated ones', () => {
    // Aaron-confirmed semantic (2026-05-27): the locked decision Q1 ("no workdir arg matches NULL rows
    // for backward compat") means ONLY NULL rows, not "most recent regardless of workdir."
    // This prevents old callers from silently picking up a sibling worktree's session —
    // the exact collision issue #11 is designed to prevent.
    createSession(db, REPO_KEY, 'main', WORKDIR_A); // workdir = WORKDIR_A (non-NULL)

    const session = getActiveSession(db, REPO_KEY); // no workdir arg → AND workdir IS NULL
    expect(session).toBeUndefined(); // no NULL-workdir session exists → undefined
  });

  it('mixed scenario: NULL session and workdir session coexist and are independently retrievable', () => {
    // Decision: session identity = (repo_key, workdir). Both NULL and non-NULL workdir
    // sessions for the same repo must be independently retrievable via explicit lookup.
    const nullId = createSession(db, REPO_KEY, 'main');                // workdir = NULL
    const wdId   = createSession(db, REPO_KEY, 'feature', WORKDIR_A); // workdir = WORKDIR_A

    // No-arg call finds only the NULL-workdir session (locked Q1 backcompat semantic)
    const nullSession = getActiveSession(db, REPO_KEY);
    expect(nullSession).toBeDefined();
    expect(nullSession!.id).toBe(nullId);

    // Workdir-scoped lookup finds the correct session
    const wdSession = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(wdSession).toBeDefined();
    expect(wdSession!.id).toBe(wdId);

    // listActiveSessionsForRepo sees both — full picture
    const all = listActiveSessionsForRepo(db, REPO_KEY);
    expect(all).toHaveLength(2);
    const ids = all.map((s: { id: string }) => s.id);
    expect(ids).toContain(nullId);
    expect(ids).toContain(wdId);
  });

  it('listActiveSessionsForRepo includes both NULL-workdir and workdir-populated sessions', () => {
    const nullId = createSession(db, REPO_KEY, 'main');
    const wdId   = createSession(db, REPO_KEY, 'feature', WORKDIR_A);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(nullId);
    expect(ids).toContain(wdId);
  });

  it('raw DB row for a NULL-workdir session has workdir = NULL after migration 015', () => {
    // Verifies the column itself is NULL — not an empty string or missing.
    const id = createSession(db, REPO_KEY, 'main'); // no workdir
    const row = db
      .prepare('SELECT workdir FROM sessions WHERE id = ?')
      .get(id) as { workdir: string | null };
    expect(row.workdir).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Area 4: getWorkdir() happy path
// ---------------------------------------------------------------------------

describe('getWorkdir — git worktree context resolution', () => {
  it('returns a non-empty string inside the current git repo', () => {
    // Test environment is a git worktree (D:\git\stunning-adventure-11).
    const result = getWorkdir();
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('returns a string when called with an explicit git-repo cwd', () => {
    // Mirrors the getRepoKey(cwd?) pattern: cwd param forwards to execSync.
    const result = getWorkdir(process.cwd());
    expect(typeof result).toBe('string');
  });

  it('returns undefined (not throw) when cwd is not inside a git repo', () => {
    // getWorkdir must swallow the execSync error gracefully, just like getRepoKey.
    // Use the filesystem root (e.g. D:\ on Windows) — guaranteed not a git repo.
    const fsRoot = path.parse(process.cwd()).root;
    expect(() => getWorkdir(fsRoot)).not.toThrow();
    const result = getWorkdir(fsRoot);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Area 5: Workdir isolation — NULL-workdir session unaffected by workdir sessionStart
// (T1 regression: orphan-claim was NOT implemented — Roger chose strict isolation)
// ---------------------------------------------------------------------------

describe('workdir isolation — runSessionStart does not cross workdir boundaries', () => {
  it('runSessionStart with a workdir does not crash a fresh NULL-workdir session', async () => {
    // A NULL-workdir session (pre-migration or no-cwd tool call) must survive
    // unharmed when sessionStart fires for a different workdir. The workdir IS
    // filter ensures the two are completely invisible to each other.
    const nullId = createSession(db, REPO_KEY, 'main'); // workdir = NULL
    logEvent(db, nullId, 'session_start', { repoKey: REPO_KEY });

    await runSessionStart(REPO_KEY, { workdir: WORKDIR_A });

    const row = db
      .prepare('SELECT status FROM sessions WHERE id = ?')
      .get(nullId) as { status: string };
    expect(row.status).toBe('active'); // not crashed
  });

  it('runSessionStart with a workdir takes the fast path when a fresh matching session exists', async () => {
    const wdId = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    logEvent(db, wdId, 'session_start', { repoKey: REPO_KEY });

    const result = await runSessionStart(REPO_KEY, { workdir: WORKDIR_A });
    expect(result.fastPath).toBe(true);
  });

  it('runSessionStart with a workdir takes the slow path when only a NULL-workdir session exists', async () => {
    // The NULL-workdir session does not satisfy the workdir match → slow path.
    const nullId = createSession(db, REPO_KEY, 'main');
    logEvent(db, nullId, 'session_start', { repoKey: REPO_KEY });

    const result = await runSessionStart(REPO_KEY, { workdir: WORKDIR_A });
    expect(result.fastPath).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Area 6: Path normalization contract — workdir lookup uses exact string matching
// ---------------------------------------------------------------------------

describe('path normalization contract — no implicit normalization', () => {
  it('exact-match path finds the session', () => {
    const id = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
  });

  it('path with trailing slash does not match a session stored without it', () => {
    // Workdir identity is an exact string. '/repos/project/' ≠ '/repos/project'.
    // Callers are responsible for normalizing before storage and lookup.
    createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const session = getActiveSession(db, REPO_KEY, `${WORKDIR_A}/`);
    expect(session).toBeUndefined();
  });

  it('different casing does not match (case-sensitive exact match)', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const session = getActiveSession(db, REPO_KEY, WORKDIR_A.toUpperCase());
    expect(session).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Area 7: Kind-filter regression — getActiveSession returns USER sessions only
// ---------------------------------------------------------------------------

describe('kind-filter regression — getActiveSession scoped to user sessions', () => {
  it('a SYSTEM session with the same workdir does not shadow a USER session', () => {
    // Inserts a system session with the same (repo, workdir) via raw SQL to
    // simulate a theoretical future misuse. getActiveSession must return the
    // USER session, not the system one. This guards against losing the kind
    // filter in getActiveSessionByWorkdir.
    const userId = createSession(db, REPO_KEY, 'main', WORKDIR_A); // user kind
    // Insert a SYSTEM session with the same workdir (not possible via public API,
    // but the query must handle it correctly regardless).
    const systemId = 'test-system-session-kind-regression';
    db.prepare(
      'INSERT INTO sessions (id, repo_key, branch, session_kind, workdir) VALUES (?, ?, ?, ?, ?)',
    ).run(systemId, REPO_KEY, 'main', 'system', WORKDIR_A);

    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(session).toBeDefined();
    expect(session!.id).toBe(userId);
    expect(session!.kind).toBe('user');
  });

  it('listActiveSessionsForRepo excludes SYSTEM sessions even when they share a workdir', () => {
    const userId = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const systemId = 'test-system-kind-filter-list';
    db.prepare(
      'INSERT INTO sessions (id, repo_key, branch, session_kind, workdir) VALUES (?, ?, ?, ?, ?)',
    ).run(systemId, REPO_KEY, 'main', 'system', WORKDIR_A);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.id).toBe(userId);
  });
});

// ---------------------------------------------------------------------------
// Area 8: Legacy session claiming (B1)
// ---------------------------------------------------------------------------

describe('legacy session claiming — claimLegacyActiveSession', () => {
  it('adopts a NULL-workdir session for the given workdir and updates the DB row', () => {
    const id = createSession(db, REPO_KEY, 'main'); // workdir = NULL

    const claimed = claimLegacyActiveSession(db, REPO_KEY, WORKDIR_A);

    expect(claimed).toBeDefined();
    expect(claimed!.id).toBe(id);
    expect(claimed!.workdir).toBe(WORKDIR_A);

    // The DB row now carries the workdir — findable via workdir-scoped lookup
    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
  });

  it('returns undefined when no NULL-workdir session exists', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A); // already has a workdir
    const claimed = claimLegacyActiveSession(db, REPO_KEY, WORKDIR_B);
    expect(claimed).toBeUndefined();
  });

  it('does not claim a session belonging to another repo', () => {
    createSession(db, 'org/other-repo', 'main'); // NULL workdir but wrong repo
    const claimed = claimLegacyActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(claimed).toBeUndefined();
  });

  it('does not claim a session that is not active', () => {
    const id = createSession(db, REPO_KEY, 'main'); // NULL workdir, active
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(id);
    const claimed = claimLegacyActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(claimed).toBeUndefined();
  });
});

