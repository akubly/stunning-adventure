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

  it('should return fastPath true when a recent active session exists', () => {
    createSession('org_repo', 'main');
    // Log a recent event so the session is considered "fresh"
    const session = getActiveSession('org_repo')!;
    logEvent(session.id, 'session_start', { repoKey: 'org_repo' });

    const result = runSessionStart('org_repo');
    expect(result.fastPath).toBe(true);

    // Active session should still be there, untouched
    const after = getActiveSession('org_repo');
    expect(after).toBeDefined();
    expect(after!.status).toBe('active');
  });

  it('should not call catchUp or curate on fast path', () => {
    const sessionId = createSession('org_repo', 'main');
    // Log a recent event to keep session fresh
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

  it('should detect and recover a stale (orphaned) active session', () => {
    // Create a session and backdate its start and last event to simulate an
    // orphan left behind by a crashed Copilot process.
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'session_start', { repoKey: 'org_repo' });

    const db = getDb();
    const staleTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare("UPDATE sessions SET started_at = ? WHERE id = ?").run(staleTime, sessionId);
    db.prepare("UPDATE event_log SET created_at = ? WHERE session_id = ?").run(staleTime, sessionId);

    const result = runSessionStart('org_repo');
    expect(result.fastPath).toBe(false);

    // The orphan session should now be marked as crashed
    const row = db.prepare("SELECT status FROM sessions WHERE id = ?").get(sessionId) as { status: string };
    expect(row.status).toBe('crashed');

    // A session_crash_detected event should have been logged
    const crashEvent = db
      .prepare("SELECT id FROM event_log WHERE session_id = ? AND event_type = 'session_crash_detected'")
      .get(sessionId);
    expect(crashEvent).toBeDefined();
  });

  it('should run curator when no active session exists', () => {
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
    // Active session on repo A (with recent event so it's not stale)
    const repoAId = createSession('repo_a', 'main');
    logEvent(repoAId, 'session_start', { repoKey: 'repo_a' });

    // Hook fires for repo B (no active session for repo B)
    const result = runSessionStart('repo_b');
    expect(result.fastPath).toBe(false);

    // repo_a's session should still be active (catchUp only operates on the
    // passed repoKey, not other repos)
    const repoASession = getActiveSession('repo_a');
    expect(repoASession).toBeDefined();
    expect(repoASession!.id).toBe(repoAId);
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

    // Now simulate postToolUse creating a session with a recent event
    const sid = createSession('org_repo', 'main');
    logEvent(sid, 'session_start', { repoKey: 'org_repo' });

    // Third call: fast path (session is fresh)
    const r3 = runSessionStart('org_repo');
    expect(r3.fastPath).toBe(true);
  });
});
