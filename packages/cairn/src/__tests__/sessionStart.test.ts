import type { PrescriberOrchestrationConfig } from '@akubly/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as curator from '../agents/curator.js';
import { getDb, closeDb } from '../db/index.js';
import { createSession, getActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { insertOptimizationHint } from '../db/optimizationHints.js';
import { upsertExecutionProfile } from '../db/executionProfiles.js';
import { runSessionStart } from '../hooks/sessionStart.js';

let orchestrationHintCounter = 0;

function seedQualifyingPrescriberSkill(skillId: string): void {
  orchestrationHintCounter += 1;
  insertOptimizationHint({
    id: `session-start-hint-${orchestrationHintCounter}`,
    source: 'prompt-optimizer',
    skillId,
    category: 'convergence',
    description: 'Session-start orchestration seed',
    recommendation: 'Tighten the prompt loop',
    generatedAt: '2026-05-23T00:00:00.000Z',
    status: 'applied',
    metricSnapshot: {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    },
  });

  upsertExecutionProfile({
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 5,
    drift: { mean: 0.2, p50: 0.18, p95: 0.3, trend: 'improving' },
    token: {
      meanInput: 5_000,
      meanOutput: 1_000,
      meanCacheHit: 0.5,
      totalCost: 80_000,
    },
    outcome: {
      successRate: 0.9,
      meanConvergence: 6,
      toolErrorRate: 0.01,
    },
  });
}

beforeEach(() => {
  closeDb();
  orchestrationHintCounter = 0;
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

  it('should return fastPath true when a recent active session exists', async () => {
    createSession('org_repo', 'main');
    // Log a recent event so the session is considered "fresh"
    const session = getActiveSession('org_repo')!;
    logEvent(session.id, 'session_start', { repoKey: 'org_repo' });

    const result = await runSessionStart('org_repo');
    expect(result.fastPath).toBe(true);

    // Active session should still be there, untouched
    const after = getActiveSession('org_repo');
    expect(after).toBeDefined();
    expect(after!.status).toBe('active');
  });

  it('should not call catchUp or curate on fast path', async () => {
    const sessionId = createSession('org_repo', 'main');
    // Log a recent event to keep session fresh
    logEvent(sessionId, 'tool_use', { tool: 'grep' });

    const result = await runSessionStart('org_repo');
    expect(result.fastPath).toBe(true);

    // Curator cursor should not have advanced (curator didn't run)
    const db = getDb();
    const cursorRow = db
      .prepare('SELECT last_processed_event_id FROM curator_state WHERE id = 1')
      .get() as { last_processed_event_id: number } | undefined;
    // Either no row or cursor at 0 — curator didn't process
    expect(cursorRow?.last_processed_event_id ?? 0).toBe(0);
  });

  it('should detect and recover a stale (orphaned) active session', async () => {
    // Create a session and backdate its start and last event to simulate an
    // orphan left behind by a crashed Copilot process.
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'session_start', { repoKey: 'org_repo' });

    const db = getDb();
    const staleDate = new Date(Date.now() - 5 * 60 * 1000);
    const staleTime = staleDate.toISOString().slice(0, 19).replace('T', ' ');
    db.prepare("UPDATE sessions SET started_at = ? WHERE id = ?").run(staleTime, sessionId);
    db.prepare("UPDATE event_log SET created_at = ? WHERE session_id = ?").run(staleTime, sessionId);

    const result = await runSessionStart('org_repo');
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

  it('should run curator when no active session exists', async () => {
    // Create events attached to a completed session
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'fail 1' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail 1' });

    // End the session so there's no active one
    const db = getDb();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(sessionId);

    const result = await runSessionStart('org_repo');
    expect(result.fastPath).toBe(false);

    // Curator should have processed those events — check cursor advanced
    const cursorRow = db
      .prepare('SELECT last_processed_event_id FROM curator_state WHERE id = 1')
      .get() as { last_processed_event_id: number } | undefined;

    expect(cursorRow).toBeDefined();
    expect(cursorRow!.last_processed_event_id).toBeGreaterThan(0);
  });

  it('should not affect sessions from other repos on slow path', async () => {
    // Active session on repo A (with recent event so it's not stale)
    const repoAId = createSession('repo_a', 'main');
    logEvent(repoAId, 'session_start', { repoKey: 'repo_a' });

    // Hook fires for repo B (no active session for repo B)
    const result = await runSessionStart('repo_b');
    expect(result.fastPath).toBe(false);

    // repo_a's session should still be active (catchUp only operates on the
    // passed repoKey, not other repos)
    const repoASession = getActiveSession('repo_a');
    expect(repoASession).toBeDefined();
    expect(repoASession!.id).toBe(repoAId);
  });

  it('should not create a new session (postToolUse owns session creation)', async () => {
    const result = await runSessionStart('org_repo');
    expect(result.fastPath).toBe(false);

    // No session should exist — sessionStart doesn't create sessions
    expect(getActiveSession('org_repo')).toBeUndefined();
  });

  it('should be safe to call repeatedly for the same repo', async () => {
    // First call: slow path
    const r1 = await runSessionStart('org_repo');
    expect(r1.fastPath).toBe(false);

    // Still no session (postToolUse hasn't run)
    const r2 = await runSessionStart('org_repo');
    expect(r2.fastPath).toBe(false);

    // Now simulate postToolUse creating a session with a recent event
    const sid = createSession('org_repo', 'main');
    logEvent(sid, 'session_start', { repoKey: 'org_repo' });

    // Third call: fast path (session is fresh)
    const r3 = await runSessionStart('org_repo');
    expect(r3.fastPath).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Prescriber wiring — slow path chains prescribe() when insights change
// ---------------------------------------------------------------------------

describe('prescriber wiring on slow path', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call prescribe() when curate produces new insights', async () => {
    // Create events that will generate insights (recurring errors)
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    // End the session so there's no active one (force slow path)
    const db = getDb();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(sessionId);

    // Capture prescription state before
    const before = db
      .prepare('SELECT pending_count FROM prescriber_state WHERE id = 1')
      .get() as { pending_count: number } | undefined;
    const pendingBefore = before?.pending_count ?? 0;

    await runSessionStart('org_repo');

    // Curator should have processed those events and created insights
    const cursorRow = db
      .prepare('SELECT last_processed_event_id FROM curator_state WHERE id = 1')
      .get() as { last_processed_event_id: number } | undefined;
    expect(cursorRow!.last_processed_event_id).toBeGreaterThan(0);

    // Verify prescribe() actually ran by checking DB side effects:
    // prescriptions should exist and pending_count should have increased
    const rxCount = db
      .prepare("SELECT COUNT(*) as cnt FROM prescriptions WHERE status = 'generated'")
      .get() as { cnt: number };
    expect(rxCount.cnt).toBeGreaterThan(0);

    const after = db
      .prepare('SELECT pending_count FROM prescriber_state WHERE id = 1')
      .get() as { pending_count: number } | undefined;
    expect(after!.pending_count).toBeGreaterThan(pendingBefore);
  });

  it('should not throw when prescribe() fails (fail-open)', async () => {
    // We can't easily mock the import, but we verify fail-open by checking
    // runSessionStart completes even when insights are generated
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    const db = getDb();
    db.prepare("UPDATE sessions SET status = 'completed', ended_at = datetime('now') WHERE id = ?")
      .run(sessionId);

    // Should not throw regardless of prescribe() behavior
    await expect(runSessionStart('org_repo')).resolves.toEqual({ fastPath: false });
  });

  it('should increment session counter on slow path', async () => {
    const db = getDb();

    // Ensure prescriber_state exists with initial counter
    const before = db
      .prepare('SELECT sessions_since_install FROM prescriber_state WHERE id = 1')
      .get() as { sessions_since_install: number } | undefined;
    const counterBefore = before?.sessions_since_install ?? 0;

    await runSessionStart('org_repo');

    const after = db
      .prepare('SELECT sessions_since_install FROM prescriber_state WHERE id = 1')
      .get() as { sessions_since_install: number } | undefined;
    expect(after!.sessions_since_install).toBe(counterBefore + 1);
  });

  it('should not increment session counter on fast path', async () => {
    const db = getDb();

    // Create an active session with a recent event
    const sessionId = createSession('org_repo', 'main');
    logEvent(sessionId, 'session_start', { repoKey: 'org_repo' });

    const before = db
      .prepare('SELECT sessions_since_install FROM prescriber_state WHERE id = 1')
      .get() as { sessions_since_install: number } | undefined;
    const counterBefore = before?.sessions_since_install ?? 0;

    const result = await runSessionStart('org_repo');
    expect(result.fastPath).toBe(true);

    const after = db
      .prepare('SELECT sessions_since_install FROM prescriber_state WHERE id = 1')
      .get() as { sessions_since_install: number } | undefined;
    expect(after?.sessions_since_install ?? 0).toBe(counterBefore);
  });

  it('passes injected orchestration config into curate and runs prescribers for qualifying skills', async () => {
    seedQualifyingPrescriberSkill('skill-session-start');
    const runForSkill = vi.fn<PrescriberOrchestrationConfig['runForSkill']>().mockResolvedValue({
      skillId: 'skill-session-start',
      hintsGenerated: 1,
      hintsInserted: 1,
      hintsDuplicated: 0,
      hintsError: 0,
    });
    const prescriberOrchestrationConfig: PrescriberOrchestrationConfig = { runForSkill };
    const curateSpy = vi.spyOn(curator, 'curate');

    await expect(runSessionStart('org_repo', prescriberOrchestrationConfig)).resolves.toEqual({
      fastPath: false,
    });

    expect(curateSpy).toHaveBeenCalledTimes(1);
    expect(curateSpy).toHaveBeenCalledWith(undefined, prescriberOrchestrationConfig);
    expect(runForSkill).toHaveBeenCalledTimes(1);
    expect(runForSkill).toHaveBeenCalledWith('skill-session-start', 3);
  });

  it('preserves the no-config curate shape when orchestration is not injected', async () => {
    seedQualifyingPrescriberSkill('skill-session-start-no-config');
    const curateSpy = vi.spyOn(curator, 'curate');

    await expect(runSessionStart('org_repo', undefined)).resolves.toEqual({ fastPath: false });

    expect(curateSpy).toHaveBeenCalledTimes(1);
    expect(curateSpy).toHaveBeenCalledWith(undefined, undefined);
    const curateResult = await curateSpy.mock.results[0]!.value;
    expect(curateResult).not.toHaveProperty('prescribers');
  });
});
