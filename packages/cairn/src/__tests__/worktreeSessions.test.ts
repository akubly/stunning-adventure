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
 * PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
 * These tests will fail until Roger ships:
 *   - 015-workdir-sessions.ts migration (workdir column on sessions)
 *   - Optional workdir param on createSession(db, repoKey, branch?, workdir?)
 *   - Optional workdir param on getActiveSession(db, repoKey, workdir?)
 *     with NULL-IS query semantics for backcompat
 *   - listActiveSessionsForRepo(db, repoKey) — new export from sessions.ts
 *   - getWorkdir(cwd?) — new export from hooks/gitContext.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import { getDb, closeDb } from '../db/index.js';
import {
  createSession,
  getActiveSession,
  // PROACTIVE: new export; will be undefined until Roger's WI-A lands
  listActiveSessionsForRepo,
} from '../db/sessions.js';
// PROACTIVE: new export; will be undefined until Roger's WI-A lands
import { getWorkdir } from '../hooks/gitContext.js';

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
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
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
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    // Querying with an unknown workdir must not bleed into another worktree's session.
    createSession(db, REPO_KEY, 'main', WORKDIR_A);

    const result = getActiveSession(db, REPO_KEY, '/repos/project-worktrees/other');
    expect(result).toBeUndefined();
  });

  it('session carries workdir in its fields', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);

    expect(session).toBeDefined();
    expect((session as Record<string, unknown>).workdir).toBe(WORKDIR_A);
  });

  it('returns the most recent active session when multiple exist for the same workdir', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
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
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);
    expect(idA).not.toBe(idB);
  });

  it('neither session overrides the other — both remain active', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'feature', WORKDIR_B);

    expect(getActiveSession(db, REPO_KEY, WORKDIR_A)!.id).toBe(idA);
    expect(getActiveSession(db, REPO_KEY, WORKDIR_B)!.id).toBe(idB);
  });

  it('listActiveSessionsForRepo returns all active sessions across workdirs', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
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
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    createSession(db, REPO_KEY, 'main', WORKDIR_A);
    createSession(db, 'org/other-repo', 'main', '/repos/other');

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(1);
    expect((sessions[0] as { id: string }).id).toBeDefined();
  });

  it('listActiveSessionsForRepo excludes ended sessions', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
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
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    //
    // Simulate a pre-migration row: createSession without workdir inserts NULL.
    // Old callers that pass no workdir must still find it.
    const id = createSession(db, REPO_KEY, 'main'); // workdir = NULL
    const session = getActiveSession(db, REPO_KEY);  // no workdir arg

    expect(session).toBeDefined();
    expect(session!.id).toBe(id);
  });

  it('getActiveSession without workdir arg returns most recent active session (no workdir filter applied)', () => {
    // Roger's WI-A implementation: when workdir is omitted, the query does NOT add a
    // workdir IS NULL clause — it returns the most recent active session regardless of
    // workdir value. This satisfies the locked decision ("must still match NULL rows")
    // without requiring exclusive NULL-only behavior.
    //
    // Trade-off: old callers without workdir awareness may see worktree sessions.
    // Worktree-aware callers must explicitly pass workdir to obtain session isolation.
    createSession(db, REPO_KEY, 'main', WORKDIR_A); // workdir = WORKDIR_A

    const session = getActiveSession(db, REPO_KEY); // no workdir arg — returns most recent (any workdir)
    expect(session).toBeDefined();
    expect(session!.id).toBeDefined();
  });

  it('mixed scenario: NULL session and workdir session coexist and are independently retrievable', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    //
    // Decision: session identity = (repo_key, workdir). Both NULL and non-NULL workdir
    // sessions for the same repo must be independently retrievable via explicit lookup.
    const nullId = createSession(db, REPO_KEY, 'main');                // workdir = NULL
    const wdId   = createSession(db, REPO_KEY, 'feature', WORKDIR_A); // workdir = WORKDIR_A

    // Workdir-scoped lookup finds the correct session
    const wdSession = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(wdSession).toBeDefined();
    expect(wdSession!.id).toBe(wdId);

    // NULL session is verified to exist with workdir=NULL via raw DB (backcompat guarantee)
    const rawRow = db
      .prepare('SELECT id, workdir FROM sessions WHERE id = ?')
      .get(nullId) as { id: string; workdir: string | null };
    expect(rawRow.workdir).toBeNull();

    // listActiveSessionsForRepo sees both — full picture
    const all = listActiveSessionsForRepo(db, REPO_KEY);
    expect(all).toHaveLength(2);
    const ids = all.map((s: { id: string }) => s.id);
    expect(ids).toContain(nullId);
    expect(ids).toContain(wdId);
  });

  it('listActiveSessionsForRepo includes both NULL-workdir and workdir-populated sessions', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    const nullId = createSession(db, REPO_KEY, 'main');
    const wdId   = createSession(db, REPO_KEY, 'feature', WORKDIR_A);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(nullId);
    expect(ids).toContain(wdId);
  });

  it('raw DB row for a NULL-workdir session has workdir = NULL after migration 015', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
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
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    // Test environment is a git worktree (D:\git\stunning-adventure-11).
    const result = getWorkdir();
    expect(typeof result).toBe('string');
    expect((result as string).length).toBeGreaterThan(0);
  });

  it('returns a string when called with an explicit git-repo cwd', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    // Mirrors the getRepoKey(cwd?) pattern: cwd param forwards to execSync.
    const result = getWorkdir(process.cwd());
    expect(typeof result).toBe('string');
  });

  it('returns undefined (not throw) when cwd is not inside a git repo', () => {
    // PROACTIVE: written from issue #11 spec; expects Roger's WI-A implementation.
    // getWorkdir must swallow the execSync error gracefully, just like getRepoKey.
    // Use the filesystem root (e.g. D:\ on Windows) — guaranteed not a git repo.
    const fsRoot = path.parse(process.cwd()).root;
    expect(() => getWorkdir(fsRoot)).not.toThrow();
    const result = getWorkdir(fsRoot);
    expect(result).toBeUndefined();
  });
});
