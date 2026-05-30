/**
 * MCP surface tests for worktree-aware sessions — issue #11 WI-A
 *
 * Area 5: Verifies the backing logic and structural shape for get_status and
 * get_session after the worktree-aware response schema change.
 *
 *   5a. get_status without workdir arg → returns { sessions: [...], curator }
 *       with ALL active sessions for the repo.
 *   5b. get_status with workdir arg → results filtered to that workdir only
 *       (still inside the sessions array).
 *   5c. Response shape is always { sessions: Array, curator } — never
 *       { session: ... } (old singular) or { primary, siblings }.
 *   5d. get_session with workdir arg resolves the correct session via
 *       (repo_key, workdir) identity.
 *   5e. Sanity: no console.log/info/debug leak in server.ts (stdio corruption
 *       guard; tripwire for new handler additions).
 *
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../db/index.js';
import {
  createSession,
  getActiveSession,
  listActiveSessionsForRepo,
} from '../db/sessions.js';
import { getCuratorStatus } from '../agents/curator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, '..', 'mcp', 'server.ts');

let db: ReturnType<typeof getDb>;

const REPO_KEY = 'org/worktree-mcp-test';
const WORKDIR_A = '/repos/proj';
const WORKDIR_B = '/repos/proj-worktrees/issue-42';

beforeEach(() => {
  closeDb();
  db = getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Area 5a: get_status backing logic — listActiveSessionsForRepo (no workdir filter)
// ---------------------------------------------------------------------------

describe('get_status backing logic — listActiveSessionsForRepo', () => {
  it('returns a flat array of all active sessions for the repo', () => {
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    const idB = createSession(db, REPO_KEY, 'fix', WORKDIR_B);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(2);
    const ids = sessions.map((s: { id: string }) => s.id);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
  });

  it('returns an empty array when no active sessions exist', () => {
    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(0);
  });

  it('each session in the array includes a workdir field', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A);

    const sessions = listActiveSessionsForRepo(db, REPO_KEY);
    expect(sessions).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(sessions[0], 'workdir')).toBe(true);
    expect((sessions[0] as Record<string, unknown>).workdir).toBe(WORKDIR_A);
  });

  it('getCuratorStatus() is compatible with the { sessions, curator } payload shape', () => {
    // Curator status is independent of worktree changes — confirms the curator
    // half of the get_status response still builds correctly alongside new sessions array.
    const status = getCuratorStatus();
    expect(typeof status.lastProcessedEventId).toBe('number');
    expect(typeof status.totalInsights).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// Area 5b: get_status backing logic — filtered by workdir
// ---------------------------------------------------------------------------

describe('get_status backing logic — workdir filter via getActiveSession', () => {
  it('getActiveSession with workdir returns only the matching session', () => {
    // Backing logic when get_status is called with a workdir param: build a
    // single-element sessions array from the (repo_key, workdir) lookup.
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    createSession(db, REPO_KEY, 'fix', WORKDIR_B);

    const session = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(session).toBeDefined();
    expect(session!.id).toBe(idA);
  });

  it('workdir-filtered lookup returns undefined when that workdir has no session', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A);

    const session = getActiveSession(db, REPO_KEY, '/repos/no-such-workdir');
    expect(session).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Area 5c: Structural — get_status response shape (server.ts source)
// ---------------------------------------------------------------------------

describe('get_status structural shape (server.ts source)', () => {
  it('get_status handler uses sessions (plural array) not session (singular)', () => {
    //
    // Decision: get_status always returns { sessions: [...], curator }.
    // The old singular { session: ..., curator } shape must be gone.
    const source = fs.readFileSync(serverPath, 'utf8');

    const handlerStart = source.indexOf("'get_status'");
    expect(handlerStart).toBeGreaterThan(-1);
    // Slice to the next // Tool: section marker
    const handlerEnd = source.indexOf('// Tool:', handlerStart + 1);
    const handlerBody = handlerStart > -1 && handlerEnd > -1
      ? source.slice(handlerStart, handlerEnd)
      : source.slice(handlerStart);

    // Must use 'sessions:' (array) in the response
    expect(handlerBody).toContain('sessions:');

    // Must NOT use old singular 'session:' key (strip comment lines before checking)
    const nonCommentLines = handlerBody
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');
    expect(nonCommentLines).not.toMatch(/\bsession:/);
  });

  it('get_status handler does not return a primary/siblings shape', () => {
    // Decision: flat array only; no primary/siblings split.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_status'");
    const handlerEnd = source.indexOf('// Tool:', handlerStart + 1);
    const handlerBody = handlerStart > -1 && handlerEnd > -1
      ? source.slice(handlerStart, handlerEnd)
      : source.slice(handlerStart);

    expect(handlerBody).not.toContain('primary:');
    expect(handlerBody).not.toContain('siblings:');
  });

  it('get_status inputSchema accepts an optional workdir param', () => {
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_status'");
    const handlerEnd = source.indexOf('// Tool:', handlerStart + 1);
    const handlerBody = handlerStart > -1 && handlerEnd > -1
      ? source.slice(handlerStart, handlerEnd)
      : source.slice(handlerStart);

    expect(handlerBody).toContain('workdir');
  });
});

// ---------------------------------------------------------------------------
// Area 5d: get_session DB-layer behavior
// (handler-level invocation not possible in unit tests — handler uses ensureDb()
//  which binds to the real on-disk DB; invoke via MCP integration tests instead)
// ---------------------------------------------------------------------------

describe('get_session: DB-layer behavior', () => {
  // TODO: replace with handler-level invocation when handler is exported
  it('getActiveSession resolves the correct session when repo_key + workdir match', () => {
    // get_session handler delegates to getActiveSession(db, repo_key, workdir).
    // This exercises the same query the handler calls on the session-found path.
    const idA = createSession(db, REPO_KEY, 'main', WORKDIR_A);
    createSession(db, REPO_KEY, 'fix', WORKDIR_B);

    const resolved = getActiveSession(db, REPO_KEY, WORKDIR_A);
    expect(resolved).toBeDefined();
    expect(resolved!.id).toBe(idA);
  });

  it('getActiveSession returns undefined for an unknown workdir (handler would return isError)', () => {
    createSession(db, REPO_KEY, 'main', WORKDIR_A);

    const resolved = getActiveSession(db, REPO_KEY, WORKDIR_B);
    expect(resolved).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Area 5d-err: get_session handler — structural error path (source guard)
// ---------------------------------------------------------------------------

describe('get_session structural error paths (server.ts source)', () => {
  it('handler returns isError when no session_id and no repo_key — error message is in source', () => {
    // The handler at the top of the no-ID branch:
    //   if (!repo_key) { return { ..., isError: true } }
    // This structural test guards against the error message being removed or
    // the branch being collapsed. Full handler invocation requires MCP integration tests.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_session'");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerBody = source.slice(handlerStart);

    expect(handlerBody).toContain('Provide either session_id, or both repo_key and workdir');
    expect(handlerBody).toContain('isError: true');
  });

  it('handler returns isError when repo_key is provided without workdir (I2 guard)', () => {
    // Roger I2: repo_key + no workdir is rejected with an actionable error
    // directing callers to supply workdir or use session_id directly.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_session'");
    const handlerBody = source.slice(handlerStart);

    expect(handlerBody).toContain('Provide workdir with repo_key for worktree-scoped lookup');
  });

  it('handler returns isError when no active session found for the given repo_key/workdir', () => {
    // Guards the "no session found" error branch in the handler.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_session'");
    const handlerBody = source.slice(handlerStart);

    expect(handlerBody).toContain('No active session found for repo_key');
  });
});

// ---------------------------------------------------------------------------
// Area 5f: Threading guard — workdir flows through normalizeWorkdir in handlers
// ---------------------------------------------------------------------------

describe('handler workdir threading — normalizeWorkdir applied before DB lookup', () => {
  it('get_session handler passes workdir through normalizeWorkdir before calling getActiveSession', () => {
    // Guards against the normalization call being accidentally removed while
    // editing the handler. The workdir value must be normalized before it
    // reaches the DB query so paths with trailing slashes or backslashes still
    // resolve to the correct session.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_session'");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerBody = source.slice(handlerStart);

    expect(handlerBody).toContain('normalizeWorkdir(workdir)');
  });

  it('get_status handler passes workdir through normalizeWorkdir before calling getActiveSession', () => {
    // Same guard for the get_status workdir-filter path.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_status'");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerBody = source.slice(handlerStart);

    expect(handlerBody).toContain('normalizeWorkdir(workdir)');
  });
});

// ---------------------------------------------------------------------------
// Area 5f: get_status invalid-workdir guard (I1 regression)
// ---------------------------------------------------------------------------

describe('get_status invalid-workdir guard', () => {
  it('server.ts returns isError when workdir normalizes to undefined (whitespace-only)', () => {
    // If callers pass a workdir that collapses to nothing after normalization
    // (e.g. '   ' or '\t'), the handler must return an explicit isError rather
    // than silently falling back to the all-sessions list.
    const source = fs.readFileSync(serverPath, 'utf8');
    const handlerStart = source.indexOf("'get_status'");
    expect(handlerStart).toBeGreaterThan(-1);
    const handlerEnd = source.indexOf('// Tool:', handlerStart + 1);
    const handlerBody = handlerStart > -1 && handlerEnd > -1
      ? source.slice(handlerStart, handlerEnd)
      : source.slice(handlerStart);

    // The guard must be present: isError + an empty/whitespace message
    expect(handlerBody).toContain('isError');
    expect(handlerBody).toContain('Invalid workdir');
  });
});

// ---------------------------------------------------------------------------
// Area 5e: Sanity — no console.log/info/debug leaks in server.ts
// ---------------------------------------------------------------------------

describe('MCP server stdio sanity — no console leaks', () => {
  it('server.ts has no console.log, console.info, or console.debug calls', () => {
    // console.* on stdout/stderr corrupts the MCP stdio protocol.
    // This is a standing tripwire: catches console leaks introduced during
    // worktree handler additions or future edits.
    const source = fs.readFileSync(serverPath, 'utf8');

    // Strip single-line comments before checking (allow commented-out examples)
    const nonCommentLines = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    expect(nonCommentLines).not.toMatch(/\bconsole\.(log|info|debug)\s*\(/);
  });
});
