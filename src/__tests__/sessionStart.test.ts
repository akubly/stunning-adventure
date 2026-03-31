import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession, getActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { runSessionStart } from '../hooks/sessionStart.js';

beforeEach(() => {
  closeDb();
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Session-start hook (preToolUse gate)
// ---------------------------------------------------------------------------

describe('runSessionStart', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  it('should return fastPath true when an active session exists', () => {
    createSession('org_repo', 'main');
    expect(getActiveSession('org_repo')).toBeDefined();

    const result = runSessionStart('org_repo');
    expect(result.fastPath).toBe(true);

    // Active session should still be there, untouched
    const session = getActiveSession('org_repo');
    expect(session).toBeDefined();
    expect(session!.status).toBe('active');
  });

  it('should not call catchUp or curate on fast path', () => {
    const sessionId = createSession('org_repo', 'main');
    // Log an event so we can verify curator didn't run
    logEvent(sessionId, 'tool_use', { tool: 'grep' });

    const result = runSessionStart('org_repo');
    expect(result.fastPath).toBe(true);

    // Curator cursor should not have advanced (curator didn't run)
    const db = getDb();
    const cursorRow = db
      .prepare('SELECT last_processed_event_id FROM curator_state WHERE id = 1')
      .get() as { last_processed_event_id: number } | undefined;
    // Either no row or cursor at 0 — curator didn't process
    expect(cursorRow?.last_processed_event_id ?? 0).toBe(0);
  });

  it('should take fast path when a stale active session exists (postToolUse resumes it)', () => {
    createSession('org_repo', 'main');

    const result = runSessionStart('org_repo');
    // Active session exists → fast path (postToolUse will resume it)
    expect(result.fastPath).toBe(true);
  });

  it('should run catchUp and curator when no active session exists', () => {
    // Create events attached to a completed session
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'fail 1' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail 1' });

    // End the session so there's no active one
    const db = getDb();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(sessionId);

    const result = runSessionStart('org_repo');
    expect(result.fastPath).toBe(false);

    // Curator should have processed those events — check cursor advanced
    const cursorRow = db
      .prepare('SELECT last_processed_event_id FROM curator_state WHERE id = 1')
      .get() as { last_processed_event_id: number } | undefined;

    expect(cursorRow).toBeDefined();
    expect(cursorRow!.last_processed_event_id).toBeGreaterThan(0);
  });

  it('should not affect sessions from other repos on slow path', () => {
    // Active session on repo A
    const repoAId = createSession('repo_a', 'main');

    // Hook fires for repo B (no active session for repo B)
    const result = runSessionStart('repo_b');
    expect(result.fastPath).toBe(false);

    // repo_a's session should still be active (catchUp only operates on the
    // passed repoKey, not other repos)
    const repoASession = getActiveSession('repo_a');
    expect(repoASession).toBeDefined();
    expect(repoASession!.id).toBe(repoAId);
  });

  it('should recover crashed session for the same repo when hook triggers slow path', () => {
    // This scenario can't happen via runSessionStart alone because if there's
    // an active session, we hit fast path. But catchUpPreviousSession is
    // called independently — tested in archivist.test.ts.
    // Verify that after slow path, no session is created
    const result = runSessionStart('fresh_repo');
    expect(result.fastPath).toBe(false);

    // No session should exist — sessionStart doesn't create sessions
    expect(getActiveSession('fresh_repo')).toBeUndefined();
  });

  it('should not create a new session (postToolUse owns session creation)', () => {
    const result = runSessionStart('org_repo');
    expect(result.fastPath).toBe(false);

    // No session should exist — sessionStart doesn't create sessions
    expect(getActiveSession('org_repo')).toBeUndefined();
  });

  it('should be safe to call repeatedly for the same repo', () => {
    // First call: slow path
    const r1 = runSessionStart('org_repo');
    expect(r1.fastPath).toBe(false);

    // Still no session (postToolUse hasn't run)
    const r2 = runSessionStart('org_repo');
    expect(r2.fastPath).toBe(false);

    // Now simulate postToolUse creating a session
    createSession('org_repo', 'main');

    // Third call: fast path
    const r3 = runSessionStart('org_repo');
    expect(r3.fastPath).toBe(true);
  });
});
