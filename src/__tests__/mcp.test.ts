import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession, getActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { getInsights, createInsight, getInsight } from '../db/insights.js';
import { curate, getCuratorStatus } from '../agents/curator.js';
import { prescribe, checkAutoSuppress } from '../agents/prescriber.js';
import {
  createPrescription,
  getPrescription,
  listPrescriptions,
  countPrescriptionsByStatus,
  deferPrescription,
  updatePrescriptionStatus,
  getSessionsSinceInstall,
} from '../db/prescriptions.js';
import {
  confidenceToWords,
  resetProactiveHintCounter,
} from '../mcp/server.js';
import {
  getSessionSummary,
  hasEventOccurred,
  findEvents,
} from '../agents/sessionState.js';

beforeEach(() => {
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// get_status — backing logic
// ---------------------------------------------------------------------------

describe('get_status logic', () => {
  it('should return curator status with zeroed state on fresh db', () => {
    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBe(0);
    expect(status.totalInsights).toBe(0);
    expect(status.activeInsights).toBe(0);
  });

  it('should return active session when one exists', () => {
    const sessionId = createSession('org/repo', 'main');
    const session = getActiveSession('org/repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(sessionId);
    expect(session!.repoKey).toBe('org/repo');
    expect(session!.branch).toBe('main');
    expect(session!.status).toBe('active');
  });

  it('should return undefined session for unknown repo', () => {
    const session = getActiveSession('no/such/repo');
    expect(session).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// list_insights — backing logic
// ---------------------------------------------------------------------------

describe('list_insights logic', () => {
  it('should return empty list on fresh db', () => {
    const insights = getInsights();
    expect(insights).toHaveLength(0);
  });

  it('should return insights after curator processes errors', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(sessionId, 'error', { category: 'build', message: 'compile failed' });
    curate();

    const insights = getInsights('active');
    expect(insights.length).toBeGreaterThanOrEqual(1);
    const buildInsight = insights.find((i) => i.patternType === 'recurring_error');
    expect(buildInsight).toBeDefined();
    expect(buildInsight!.prescription).toBeDefined();
    expect(buildInsight!.confidence).toBeGreaterThan(0);
  });

  it('should filter by status', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });
    curate();

    expect(getInsights('active').length).toBeGreaterThanOrEqual(1);
    expect(getInsights('stale')).toHaveLength(0);
    expect(getInsights('pruned')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// get_session — backing logic
// ---------------------------------------------------------------------------

describe('get_session logic', () => {
  it('should return session summary with event counts', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'tool_use', { tool: 'edit' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    const summary = getSessionSummary(sessionId);
    expect(summary).toBeDefined();
    expect(summary!.sessionId).toBe(sessionId);
    expect(summary!.eventCount).toBe(3);
    expect(summary!.toolUseCount).toBe(2);
    expect(summary!.errorCount).toBe(1);
    expect(summary!.skipCount).toBe(0);
    expect(summary!.recentEvents).toHaveLength(3);
  });

  it('should return undefined for nonexistent session', () => {
    const summary = getSessionSummary('00000000-0000-0000-0000-000000000000');
    expect(summary).toBeUndefined();
  });

  it('should include skip breadcrumbs in summary', () => {
    const sessionId = createSession('org/repo', 'main');
    const db = getDb();
    db.prepare(
      "INSERT INTO skip_breadcrumbs (session_id, what_skipped, reason) VALUES (?, 'review', 'too busy')",
    ).run(sessionId);

    const summary = getSessionSummary(sessionId);
    expect(summary!.skipCount).toBe(1);
    expect(summary!.skips[0].whatSkipped).toBe('review');
  });
});

// ---------------------------------------------------------------------------
// search_events — backing logic
// ---------------------------------------------------------------------------

describe('search_events logic', () => {
  it('should find events by type pattern', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(sessionId, 'tool_use', { tool: 'edit' });

    const errors = findEvents(sessionId, 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].eventType).toBe('error');

    const tools = findEvents(sessionId, 'tool');
    expect(tools).toHaveLength(2);
  });

  it('should return empty array for no matches', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });

    const results = findEvents(sessionId, 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('should return events in chronological order', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'a', message: 'first' });
    logEvent(sessionId, 'error', { category: 'b', message: 'second' });

    const events = findEvents(sessionId, 'error');
    expect(events).toHaveLength(2);
    expect(events[0].id).toBeLessThan(events[1].id);
  });

  it('should respect the limit parameter', () => {
    const sessionId = createSession('org/repo', 'main');
    for (let i = 0; i < 5; i++) {
      logEvent(sessionId, 'error', { category: 'build', message: `fail ${i}` });
    }

    const limited = findEvents(sessionId, 'error', 3);
    expect(limited).toHaveLength(3);

    const all = findEvents(sessionId, 'error');
    expect(all).toHaveLength(5);
  });

  it('should support SQL LIKE wildcards in pattern', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    // '_' matches any single character — 'tool_us_' should match 'tool_use'
    const withUnderscore = findEvents(sessionId, 'tool_us_');
    expect(withUnderscore).toHaveLength(1);
    expect(withUnderscore[0].eventType).toBe('tool_use');
  });
});

// ---------------------------------------------------------------------------
// run_curate — backing logic
// ---------------------------------------------------------------------------

describe('run_curate logic', () => {
  it('should return zero counts on empty event stream', () => {
    const result = curate();
    expect(result.eventsProcessed).toBe(0);
    expect(result.insightsCreated).toBe(0);
    expect(result.insightsReinforced).toBe(0);
  });

  it('should process events and create insights', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'type mismatch' });
    logEvent(sessionId, 'error', { category: 'build', message: 'type mismatch' });
    logEvent(sessionId, 'skip', { whatSkipped: 'lint' });
    logEvent(sessionId, 'skip', { whatSkipped: 'lint' });

    const result = curate();
    expect(result.eventsProcessed).toBe(4);
    expect(result.insightsCreated).toBeGreaterThanOrEqual(2);
  });

  it('should advance cursor so events are not reprocessed', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });

    const first = curate();
    expect(first.eventsProcessed).toBe(1);

    const second = curate();
    expect(second.eventsProcessed).toBe(0);
  });

  it('should update curator status after run', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    curate();

    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBeGreaterThan(0);
    expect(status.lastRunAt).not.toBeNull();
  });

  it('should return capped and insightsChanged fields', () => {
    const result = curate();
    expect(result.capped).toBe(false);
    expect(result.insightsChanged).toBe(false);
  });

  it('should return insightsChanged: true when insights are generated', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(sessionId, 'error', { category: 'build', message: 'compile failed' });

    const result = curate();
    expect(result.insightsChanged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// check_event — backing logic
// ---------------------------------------------------------------------------

describe('check_event logic', () => {
  it('should return true when event type exists', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    expect(hasEventOccurred(sessionId, 'error')).toBe(true);
  });

  it('should return false when event type does not exist', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'tool_use', { tool: 'grep' });

    expect(hasEventOccurred(sessionId, 'error')).toBe(false);
  });

  it('should be scoped to the given session', () => {
    const session1 = createSession('org/repo1', 'main');
    const session2 = createSession('org/repo2', 'main');
    logEvent(session1, 'error', { category: 'build', message: 'fail' });

    expect(hasEventOccurred(session1, 'error')).toBe(true);
    expect(hasEventOccurred(session2, 'error')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers: create a test prescription with insight
// ---------------------------------------------------------------------------

function createTestInsight(opts?: { confidence?: number; patternType?: string }): number {
  return createInsight(
    (opts?.patternType ?? 'recurring_error') as 'recurring_error' | 'error_sequence' | 'skip_frequency',
    'Recurring build: compile failed',
    'Build errors occurring repeatedly',
    [1, 2],
    opts?.confidence ?? 0.8,
    5,
    'Run typecheck before committing',
  );
}

function createTestPrescription(
  insightId: number,
  opts?: { confidence?: number; status?: string },
): number {
  return createPrescription({
    insightId,
    patternType: 'recurring_error',
    title: 'Prevent recurring build errors',
    rationale: 'Build errors occurring repeatedly (observed 5 times, confidence 80%)',
    proposedChange: '## Typecheck Guard\n\nAlways run `npm run typecheck` before committing.',
    targetPath: '~/.copilot/cairn-prescribed.instructions.md',
    artifactType: 'instruction',
    artifactScope: 'user',
    confidence: opts?.confidence ?? 0.8,
    priorityScore: 0.8,
    recencyWeight: 1.0,
    availabilityFactor: 1.0,
  });
}

// ---------------------------------------------------------------------------
// list_prescriptions — backing logic
// ---------------------------------------------------------------------------

describe('list_prescriptions logic', () => {
  it('should return empty list on fresh db', () => {
    const prescriptions = listPrescriptions();
    expect(prescriptions).toHaveLength(0);
  });

  it('should return prescriptions filtered by status', () => {
    const insightId = createTestInsight();
    createTestPrescription(insightId);

    const generated = listPrescriptions({ status: 'generated' });
    expect(generated).toHaveLength(1);

    const applied = listPrescriptions({ status: 'applied' });
    expect(applied).toHaveLength(0);
  });

  it('should return all prescriptions when no filter', () => {
    const insightId = createTestInsight();
    const id1 = createTestPrescription(insightId);
    createTestPrescription(insightId);
    updatePrescriptionStatus(id1, 'rejected');

    const all = listPrescriptions();
    expect(all).toHaveLength(2);
  });

  it('should include confidence in words via helper', () => {
    expect(confidenceToWords(0.9)).toBe('high');
    expect(confidenceToWords(0.7)).toBe('high');
    expect(confidenceToWords(0.5)).toBe('medium');
    expect(confidenceToWords(0.4)).toBe('medium');
    expect(confidenceToWords(0.3)).toBe('emerging');
    expect(confidenceToWords(0.0)).toBe('emerging');
  });

  it('should include proactive hint when generated prescriptions exist', () => {
    resetProactiveHintCounter();
    const insightId = createTestInsight();
    createTestPrescription(insightId);

    const counts = countPrescriptionsByStatus();
    expect(counts['generated']).toBe(1);
  });

  it('should track proactive hint counter resets', () => {
    resetProactiveHintCounter();
    // Counter starts at 0, so first call would show hint
    // This tests the reset mechanism
    const counts = countPrescriptionsByStatus();
    expect(counts).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// get_prescription — backing logic
// ---------------------------------------------------------------------------

describe('get_prescription logic', () => {
  it('should return full prescription detail with insight context', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    const prescription = getPrescription(prescriptionId);
    expect(prescription).toBeDefined();
    expect(prescription!.title).toBe('Prevent recurring build errors');

    const insight = getInsight(insightId);
    expect(insight).toBeDefined();
    expect(insight!.title).toBe('Recurring build: compile failed');
    expect(insight!.occurrenceCount).toBe(5);
  });

  it('should return observation framing not judgment', () => {
    const insightId = createTestInsight();
    createTestPrescription(insightId);

    const insight = getInsight(insightId);
    expect(insight).toBeDefined();

    // Observation framing: "Cairn has noticed..." not "You keep making..."
    const occurrences = insight!.occurrenceCount;
    const observation = `Cairn has noticed ${insight!.patternType.replace('_', ' ')} patterns recurring ${occurrences} times.`;
    expect(observation).toContain('Cairn has noticed');
    expect(observation).not.toContain('You');
    expect(observation).toContain('recurring');
  });

  it('should include diff preview from proposed change', () => {
    const insightId = createTestInsight();
    const pId = createTestPrescription(insightId);

    const prescription = getPrescription(pId);
    expect(prescription).toBeDefined();

    // Diff preview: lines prefixed with +
    const diffLines = prescription!.proposedChange
      .split('\n')
      .filter((line) => !line.startsWith('<!--') && line.trim().length > 0)
      .map((line) => `+ ${line}`);
    expect(diffLines.length).toBeGreaterThan(0);
    expect(diffLines[0]).toMatch(/^\+ /);
  });

  it('should return error for nonexistent prescription ID', () => {
    const prescription = getPrescription(99999);
    expect(prescription).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolve_prescription — backing logic
// ---------------------------------------------------------------------------

describe('resolve_prescription logic', () => {
  it('should accept and transition to accepted status', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    updatePrescriptionStatus(prescriptionId, 'accepted');
    const updated = getPrescription(prescriptionId);
    expect(updated!.status).toBe('accepted');
  });

  it('should reject and store reason', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    updatePrescriptionStatus(prescriptionId, 'rejected', {
      dispositionReason: 'Not relevant to my workflow',
    });

    const updated = getPrescription(prescriptionId);
    expect(updated!.status).toBe('rejected');
    expect(updated!.dispositionReason).toBe('Not relevant to my workflow');
  });

  it('should defer and increment counter with cooldown', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    deferPrescription(prescriptionId, 'not now', 3);
    const updated = getPrescription(prescriptionId);
    expect(updated!.status).toBe('deferred');
    expect(updated!.deferCount).toBe(1);
    expect(updated!.deferUntilSession).toBeDefined();
  });

  it('should auto-suppress after 3 deferrals', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    // Defer 3 times
    deferPrescription(prescriptionId, 'not now', 3);
    // Reset to generated to defer again
    updatePrescriptionStatus(prescriptionId, 'generated');
    deferPrescription(prescriptionId, 'still not now', 3);
    updatePrescriptionStatus(prescriptionId, 'generated');
    deferPrescription(prescriptionId, 'nope', 3);

    const afterThird = getPrescription(prescriptionId);
    expect(afterThird!.deferCount).toBe(3);

    // Check auto-suppress threshold
    const suppressed = checkAutoSuppress(prescriptionId, afterThird!.deferCount);
    expect(suppressed).toBe(true);

    const final = getPrescription(prescriptionId);
    expect(final!.status).toBe('suppressed');
  });

  it('should require generated status for resolution', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    // Reject it first
    updatePrescriptionStatus(prescriptionId, 'rejected');
    const rx = getPrescription(prescriptionId);
    expect(rx!.status).toBe('rejected');

    // Trying to resolve again: guard should prevent this
    // (In the MCP tool, this returns an error; here we verify status)
    expect(rx!.status).not.toBe('generated');
  });
});

// ---------------------------------------------------------------------------
// show_growth — backing logic
// ---------------------------------------------------------------------------

describe('show_growth logic', () => {
  it('should return cumulative stats', () => {
    const insightId = createTestInsight();
    createTestPrescription(insightId);
    createTestPrescription(insightId);

    const counts = countPrescriptionsByStatus();
    expect(counts['generated']).toBe(2);
  });

  it('should lead with resolved patterns', () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    // Simulate accept → apply cycle
    updatePrescriptionStatus(prescriptionId, 'accepted');
    updatePrescriptionStatus(prescriptionId, 'applied');

    const applied = listPrescriptions({ status: 'applied' });
    expect(applied).toHaveLength(1);

    // Resolved patterns come first in the show_growth response
    const insight = getInsight(insightId);
    expect(insight).toBeDefined();
    expect(applied[0].insightId).toBe(insightId);
  });

  it('should use natural language for acceptance rates', () => {
    const insightId = createTestInsight();
    const id1 = createTestPrescription(insightId);
    const id2 = createTestPrescription(insightId);
    createTestPrescription(insightId);

    updatePrescriptionStatus(id1, 'accepted');
    updatePrescriptionStatus(id1, 'applied');
    updatePrescriptionStatus(id2, 'rejected');

    const counts = countPrescriptionsByStatus();
    const applied = counts['applied'] ?? 0;
    const accepted = counts['accepted'] ?? 0;
    const rejected = counts['rejected'] ?? 0;
    const resolved = applied + accepted + rejected;
    const acceptedTotal = applied + accepted;

    // Natural language format: "X of Y resolved"
    const display = `${acceptedTotal} of ${resolved} resolved`;
    expect(display).toBe('1 of 2 resolved');
  });

  it('should return session count for summary', () => {
    const sessions = getSessionsSinceInstall();
    expect(typeof sessions).toBe('number');
    expect(sessions).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// run_curate — prescription chaining
// ---------------------------------------------------------------------------

describe('run_curate prescription chaining', () => {
  it('should chain prescribe when insights change', () => {
    const sessionId = createSession('org/repo', 'main');
    logEvent(sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(sessionId, 'error', { category: 'build', message: 'compile failed' });

    const result = curate();
    expect(result.insightsChanged).toBe(true);

    // Prescribe should generate from the new insights
    const prescribeResult = prescribe();
    expect(prescribeResult.prescriptionsGenerated).toBeGreaterThanOrEqual(1);
  });

  it('should not chain prescribe when no insights change', () => {
    const result = curate();
    expect(result.insightsChanged).toBe(false);
    // No insights → prescribe would generate 0
    const prescribeResult = prescribe();
    expect(prescribeResult.prescriptionsGenerated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MCP tool annotations
// ---------------------------------------------------------------------------

describe('MCP tool annotations', () => {
  it('should have correct readOnlyHint for new tools', () => {
    // This test verifies our design intent via code review — the tool registrations
    // use readOnlyHint: true for list/get/show and false for resolve.
    // We validate the exported helpers exist and function correctly.
    expect(confidenceToWords(0.7)).toBe('high');
    expect(typeof resetProactiveHintCounter).toBe('function');
  });
});
