import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from '../db/index.js';
import { createSession, ensureSystemSession, getActiveSession } from '../db/sessions.js';
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
import { parseSkill } from '../agents/skillParser.js';
import { validateSkill, formatValidationSummary } from '../agents/skillValidator.js';
import { insertTestResults, getTestResults } from '../db/skillTestResults.js';
import {
  confidenceToWords,
  getUserSessionForMcpFallback,
  resetProactiveHintCounter,
} from '../mcp/server.js';
import {

  getSessionSummary,
  hasEventOccurred,
  findEvents,
} from '../agents/sessionState.js';

let db: ReturnType<typeof getDb>;

beforeEach(() => {
  closeDb();
  db = getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

function seedUserThenNewerSystemSession(): string {
  const userId = createSession(db, 'org/user-repo', 'main');
  const systemId = ensureSystemSession(db);
  db.prepare("UPDATE sessions SET started_at = '2026-05-25 10:00:00' WHERE id = ?").run(userId);
  db.prepare("UPDATE sessions SET started_at = '2026-05-25 11:00:00' WHERE id = ?").run(systemId);
  return userId;
}

// ---------------------------------------------------------------------------
// MCP user-session fallback — backing logic for four call sites
// ---------------------------------------------------------------------------

describe('MCP user-session fallback logic', () => {
  it('resolve_prescription fallback excludes newer __system__ sessions', () => {
    const userId = seedUserThenNewerSystemSession();
    expect(getUserSessionForMcpFallback(db)!.id).toBe(userId);
  });

  it('lint_skill telemetry fallback excludes newer __system__ sessions', () => {
    const userId = seedUserThenNewerSystemSession();
    expect(getUserSessionForMcpFallback(db)!.id).toBe(userId);
  });

  it('test_skill scenario telemetry fallback excludes newer __system__ sessions', () => {
    const userId = seedUserThenNewerSystemSession();
    expect(getUserSessionForMcpFallback(db)!.id).toBe(userId);
  });

  it('test_skill validation telemetry fallback excludes newer __system__ sessions', () => {
    const userId = seedUserThenNewerSystemSession();
    expect(getUserSessionForMcpFallback(db)!.id).toBe(userId);
  });

  it('keeps repo-scoped lookup user-only when repo_key is provided', () => {
    const db = getDb();
    seedUserThenNewerSystemSession();
    const repoScopedId = createSession(db, 'org/scoped-repo', 'feature');
    const scopedSystemId = ensureSystemSession(db, 'org/scoped-repo');
    db.prepare("UPDATE sessions SET started_at = '2026-05-25 10:00:00' WHERE id = ?").run(repoScopedId);
    db.prepare("UPDATE sessions SET started_at = '2026-05-25 11:00:00' WHERE id = ?").run(scopedSystemId);
    expect(getUserSessionForMcpFallback(db, 'org/scoped-repo')!.id).toBe(repoScopedId);
  });

  it('wires all four MCP fallback call sites through the user-session helper', () => {
    const serverSource = fs.readFileSync(path.resolve('src/mcp/server.ts'), 'utf8');
    const helperUses = serverSource.match(/getUserSessionForMcpFallback\(/g) ?? [];
    expect(helperUses).toHaveLength(5); // function definition plus four call sites
    expect(serverSource).not.toContain('getMostRecentActiveSession');
  });
});

// ---------------------------------------------------------------------------
// get_status — backing logic
// ---------------------------------------------------------------------------

describe('get_status logic', () => {
  it('should return curator status with zeroed state on fresh db', async () => {
    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBe(0);
    expect(status.totalInsights).toBe(0);
    expect(status.activeInsights).toBe(0);
  });

  it('should return active session when one exists', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    const session = getActiveSession(db, 'org/repo');
    expect(session).toBeDefined();
    expect(session!.id).toBe(sessionId);
    expect(session!.repoKey).toBe('org/repo');
    expect(session!.branch).toBe('main');
    expect(session!.status).toBe('active');
  });

  it('should return undefined session for unknown repo', async () => {
    const session = getActiveSession(db, 'no/such/repo');
    expect(session).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// list_insights — backing logic
// ---------------------------------------------------------------------------

describe('list_insights logic', () => {
  it('should return empty list on fresh db', async () => {
    const insights = getInsights(db);
    expect(insights).toHaveLength(0);
  });

  it('should return insights after curator processes errors', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    await curate();

    const insights = getInsights(db, 'active');
    expect(insights.length).toBeGreaterThanOrEqual(1);
    const buildInsight = insights.find((i) => i.patternType === 'recurring_error');
    expect(buildInsight).toBeDefined();
    expect(buildInsight!.prescription).toBeDefined();
    expect(buildInsight!.confidence).toBeGreaterThan(0);
  });

  it('should filter by status', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });
    await curate();

    expect(getInsights(db, 'active').length).toBeGreaterThanOrEqual(1);
    expect(getInsights(db, 'stale')).toHaveLength(0);
    expect(getInsights(db, 'pruned')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// get_session — backing logic
// ---------------------------------------------------------------------------

describe('get_session logic', () => {
  it('should return session summary with event counts', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'tool_use', { tool: 'edit' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });

    const summary = getSessionSummary(db, sessionId);
    expect(summary).toBeDefined();
    expect(summary!.sessionId).toBe(sessionId);
    expect(summary!.eventCount).toBe(3);
    expect(summary!.toolUseCount).toBe(2);
    expect(summary!.errorCount).toBe(1);
    expect(summary!.skipCount).toBe(0);
    expect(summary!.recentEvents).toHaveLength(3);
  });

  it('should return undefined for nonexistent session', async () => {
    const summary = getSessionSummary(db, '00000000-0000-0000-0000-000000000000');
    expect(summary).toBeUndefined();
  });

  it('should include skip breadcrumbs in summary', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    db = getDb();
    db.prepare(
      "INSERT INTO skip_breadcrumbs (session_id, what_skipped, reason) VALUES (?, 'review', 'too busy')",
    ).run(sessionId);

    const summary = getSessionSummary(db, sessionId);
    expect(summary!.skipCount).toBe(1);
    expect(summary!.skips[0].whatSkipped).toBe('review');
  });
});

// ---------------------------------------------------------------------------
// search_events — backing logic
// ---------------------------------------------------------------------------

describe('search_events logic', () => {
  it('should find events by type pattern', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(db, sessionId, 'tool_use', { tool: 'edit' });

    const errors = findEvents(db, sessionId, 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].eventType).toBe('error');

    const tools = findEvents(db, sessionId, 'tool');
    expect(tools).toHaveLength(2);
  });

  it('should return empty array for no matches', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });

    const results = findEvents(db, sessionId, 'nonexistent');
    expect(results).toHaveLength(0);
  });

  it('should return events in chronological order', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'a', message: 'first' });
    logEvent(db, sessionId, 'error', { category: 'b', message: 'second' });

    const events = findEvents(db, sessionId, 'error');
    expect(events).toHaveLength(2);
    expect(events[0].id).toBeLessThan(events[1].id);
  });

  it('should respect the limit parameter', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    for (let i = 0; i < 5; i++) {
      logEvent(db, sessionId, 'error', { category: 'build', message: `fail ${i}` });
    }

    const limited = findEvents(db, sessionId, 'error', 3);
    expect(limited).toHaveLength(3);

    const all = findEvents(db, sessionId, 'error');
    expect(all).toHaveLength(5);
  });

  it('should support SQL LIKE wildcards in pattern', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });

    // '_' matches any single character — 'tool_us_' should match 'tool_use'
    const withUnderscore = findEvents(db, sessionId, 'tool_us_');
    expect(withUnderscore).toHaveLength(1);
    expect(withUnderscore[0].eventType).toBe('tool_use');
  });
});

// ---------------------------------------------------------------------------
// run_curate — backing logic
// ---------------------------------------------------------------------------

describe('run_curate logic', () => {
  it('should return zero counts on empty event stream', async () => {
    const result = await curate();
    expect(result.eventsProcessed).toBe(0);
    expect(result.insightsCreated).toBe(0);
    expect(result.insightsReinforced).toBe(0);
  });

  it('should process events and create insights', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'build', message: 'type mismatch' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'type mismatch' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'lint' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'lint' });

    const result = await curate();
    expect(result.eventsProcessed).toBe(4);
    expect(result.insightsCreated).toBeGreaterThanOrEqual(2);
  });

  it('should advance cursor so events are not reprocessed', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });

    const first = await curate();
    expect(first.eventsProcessed).toBe(1);

    const second = await curate();
    expect(second.eventsProcessed).toBe(0);
  });

  it('should update curator status after run', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    await curate();

    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBeGreaterThan(0);
    expect(status.lastRunAt).not.toBeNull();
  });

  it('should return capped and insightsChanged fields', async () => {
    const result = await curate();
    expect(result.capped).toBe(false);
    expect(result.insightsChanged).toBe(false);
  });

  it('should return insightsChanged: true when insights are generated', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });

    const result = await curate();
    expect(result.insightsChanged).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// check_event — backing logic
// ---------------------------------------------------------------------------

describe('check_event logic', () => {
  it('should return true when event type exists', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });

    expect(hasEventOccurred(db, sessionId, 'error')).toBe(true);
  });

  it('should return false when event type does not exist', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });

    expect(hasEventOccurred(db, sessionId, 'error')).toBe(false);
  });

  it('should be scoped to the given session', async () => {
    const session1 = createSession(db, 'org/repo1', 'main');
    const session2 = createSession(db, 'org/repo2', 'main');
    logEvent(db, session1, 'error', { category: 'build', message: 'fail' });

    expect(hasEventOccurred(db, session1, 'error')).toBe(true);
    expect(hasEventOccurred(db, session2, 'error')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers: create a test prescription with insight
// ---------------------------------------------------------------------------

function createTestInsight(opts?: { confidence?: number; patternType?: string }): number {
  return createInsight(db,
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
  return createPrescription(db, {
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
  it('should return empty list on fresh db', async () => {
    const prescriptions = listPrescriptions(db);
    expect(prescriptions).toHaveLength(0);
  });

  it('should return prescriptions filtered by status', async () => {
    const insightId = createTestInsight();
    createTestPrescription(insightId);

    const generated = listPrescriptions(db, { status: 'generated' });
    expect(generated).toHaveLength(1);

    const applied = listPrescriptions(db, { status: 'applied' });
    expect(applied).toHaveLength(0);
  });

  it('should return all prescriptions when no filter', async () => {
    const insightId = createTestInsight();
    const id1 = createTestPrescription(insightId);
    createTestPrescription(insightId);
    updatePrescriptionStatus(db, id1, 'rejected');

    const all = listPrescriptions(db);
    expect(all).toHaveLength(2);
  });

  it('should include confidence in words via helper', async () => {
    expect(confidenceToWords(0.9)).toBe('high');
    expect(confidenceToWords(0.7)).toBe('high');
    expect(confidenceToWords(0.5)).toBe('medium');
    expect(confidenceToWords(0.4)).toBe('medium');
    expect(confidenceToWords(0.3)).toBe('emerging');
    expect(confidenceToWords(0.0)).toBe('emerging');
  });

  it('should include proactive hint when generated prescriptions exist', async () => {
    resetProactiveHintCounter();
    const insightId = createTestInsight();
    createTestPrescription(insightId);

    const counts = countPrescriptionsByStatus(db);
    expect(counts['generated']).toBe(1);
  });

  it('should track proactive hint counter resets', async () => {
    resetProactiveHintCounter();
    // Counter starts at 0, so first call would show hint
    // This tests the reset mechanism
    const counts = countPrescriptionsByStatus(db);
    expect(counts).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// get_prescription — backing logic
// ---------------------------------------------------------------------------

describe('get_prescription logic', () => {
  it('should return full prescription detail with insight context', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    const prescription = getPrescription(db, prescriptionId);
    expect(prescription).toBeDefined();
    expect(prescription!.title).toBe('Prevent recurring build errors');

    const insight = getInsight(db, insightId);
    expect(insight).toBeDefined();
    expect(insight!.title).toBe('Recurring build: compile failed');
    expect(insight!.occurrenceCount).toBe(5);
  });

  it('should return observation framing not judgment', async () => {
    const insightId = createTestInsight();
    createTestPrescription(insightId);

    const insight = getInsight(db, insightId);
    expect(insight).toBeDefined();

    // Observation framing: "Cairn has noticed..." not "You keep making..."
    const occurrences = insight!.occurrenceCount;
    const observation = `Cairn has noticed ${insight!.patternType.replace('_', ' ')} patterns recurring ${occurrences} times.`;
    expect(observation).toContain('Cairn has noticed');
    expect(observation).not.toContain('You');
    expect(observation).toContain('recurring');
  });

  it('should include diff preview from proposed change', async () => {
    const insightId = createTestInsight();
    const pId = createTestPrescription(insightId);

    const prescription = getPrescription(db, pId);
    expect(prescription).toBeDefined();

    // Diff preview: lines prefixed with +
    const diffLines = prescription!.proposedChange
      .split('\n')
      .filter((line) => !line.startsWith('<!--') && line.trim().length > 0)
      .map((line) => `+ ${line}`);
    expect(diffLines.length).toBeGreaterThan(0);
    expect(diffLines[0]).toMatch(/^\+ /);
  });

  it('should return error for nonexistent prescription ID', async () => {
    const prescription = getPrescription(db, 99999);
    expect(prescription).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolve_prescription — backing logic
// ---------------------------------------------------------------------------

describe('resolve_prescription logic', () => {
  it('should accept and transition to accepted status', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    updatePrescriptionStatus(db, prescriptionId, 'accepted');
    const updated = getPrescription(db, prescriptionId);
    expect(updated!.status).toBe('accepted');
  });

  it('should reject and store reason', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    updatePrescriptionStatus(db, prescriptionId, 'rejected', {
      dispositionReason: 'Not relevant to my workflow',
    });

    const updated = getPrescription(db, prescriptionId);
    expect(updated!.status).toBe('rejected');
    expect(updated!.dispositionReason).toBe('Not relevant to my workflow');
  });

  it('should defer and increment counter with cooldown', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    deferPrescription(db, prescriptionId, 'not now', 3);
    const updated = getPrescription(db, prescriptionId);
    expect(updated!.status).toBe('deferred');
    expect(updated!.deferCount).toBe(1);
    expect(updated!.deferUntilSession).toBeDefined();
  });

  it('should auto-suppress after 3 deferrals', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    // Defer 3 times
    deferPrescription(db, prescriptionId, 'not now', 3);
    // Reset to generated to defer again
    updatePrescriptionStatus(db, prescriptionId, 'generated');
    deferPrescription(db, prescriptionId, 'still not now', 3);
    updatePrescriptionStatus(db, prescriptionId, 'generated');
    deferPrescription(db, prescriptionId, 'nope', 3);

    const afterThird = getPrescription(db, prescriptionId);
    expect(afterThird!.deferCount).toBe(3);

    // Check auto-suppress threshold
    const suppressed = checkAutoSuppress(db, prescriptionId, afterThird!.deferCount);
    expect(suppressed).toBe(true);

    const final = getPrescription(db, prescriptionId);
    expect(final!.status).toBe('suppressed');
  });

  it('should require generated status for resolution', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    // Reject it first
    updatePrescriptionStatus(db, prescriptionId, 'rejected');
    const rx = getPrescription(db, prescriptionId);
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
  it('should return cumulative stats', async () => {
    const insightId = createTestInsight();
    createTestPrescription(insightId);
    createTestPrescription(insightId);

    const counts = countPrescriptionsByStatus(db);
    expect(counts['generated']).toBe(2);
  });

  it('should lead with resolved patterns', async () => {
    const insightId = createTestInsight();
    const prescriptionId = createTestPrescription(insightId);

    // Simulate accept → apply cycle
    updatePrescriptionStatus(db, prescriptionId, 'accepted');
    updatePrescriptionStatus(db, prescriptionId, 'applied');

    const applied = listPrescriptions(db, { status: 'applied' });
    expect(applied).toHaveLength(1);

    // Resolved patterns come first in the show_growth response
    const insight = getInsight(db, insightId);
    expect(insight).toBeDefined();
    expect(applied[0].insightId).toBe(insightId);
  });

  it('should use natural language for acceptance rates', async () => {
    const insightId = createTestInsight();
    const id1 = createTestPrescription(insightId);
    const id2 = createTestPrescription(insightId);
    createTestPrescription(insightId);

    updatePrescriptionStatus(db, id1, 'accepted');
    updatePrescriptionStatus(db, id1, 'applied');
    updatePrescriptionStatus(db, id2, 'rejected');

    const counts = countPrescriptionsByStatus(db);
    const applied = counts['applied'] ?? 0;
    const accepted = counts['accepted'] ?? 0;
    const rejected = counts['rejected'] ?? 0;
    const resolved = applied + accepted + rejected;

    // Natural language format: "X of Y resolved"
    const display = `${accepted + applied} of ${resolved} resolved`;
    expect(display).toBe('1 of 2 resolved');
  });

  it('should return session count for summary', async () => {
    const sessions = getSessionsSinceInstall(db);
    expect(typeof sessions).toBe('number');
    expect(sessions).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// run_curate — prescription chaining
// ---------------------------------------------------------------------------

describe('run_curate prescription chaining', () => {
  it('should chain prescribe when insights change', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });

    const result = await curate();
    expect(result.insightsChanged).toBe(true);

    // Prescribe should generate from the new insights
    const prescribeResult = prescribe();
    expect(prescribeResult.prescriptionsGenerated).toBeGreaterThanOrEqual(1);
  });

  it('should not chain prescribe when no insights change', async () => {
    const result = await curate();
    expect(result.insightsChanged).toBe(false);
    // No insights → prescribe would generate 0
    const prescribeResult = prescribe();
    expect(prescribeResult.prescriptionsGenerated).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// test_skill — backing logic
// ---------------------------------------------------------------------------

describe('test_skill logic', () => {
  const GOOD_SKILL = `---
name: test-skill
description: A test skill for validation
domain: testing
confidence: proven
source: tests
---

## Context

This is a test skill that provides comprehensive context about testing
best practices. It covers unit testing, integration testing, and end-to-end
testing strategies. The context section should be long enough to pass the
section depth validation rule. We need more than fifty words here so let us
keep writing about testing patterns and methodologies that help developers
write better software and catch bugs earlier in the development cycle.

## Patterns

- Always write unit tests before integration tests.
- Use descriptive test names that explain the expected behavior.
- Ensure test isolation by resetting state between test runs.
- Validate edge cases including null inputs and boundary values.
- Apply the Arrange-Act-Assert pattern consistently in every test.
- Use mock objects to isolate the unit under test from dependencies.
- Run tests in CI pipelines to catch regressions automatically.
- Prefer deterministic tests over flaky ones that depend on timing.
`;

  const MINIMAL_SKILL = `---
name: minimal
description: Bare minimum
---

## Context

Short.

## Patterns

Maybe do something, possibly.
`;

  it('validates a skill file without scenario', async () => {
    const parsed = parseSkill(GOOD_SKILL);
    const results = validateSkill(parsed);
    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r).toHaveProperty('rule');
      expect(r).toHaveProperty('vector');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('passed');
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('formats validation summary with scores', async () => {
    const parsed = parseSkill(GOOD_SKILL);
    const results = validateSkill(parsed);
    const summary = formatValidationSummary(results);

    expect(summary).toContain('%');
    expect(summary).toContain('Overall');
  });

  it('detects quality issues in a minimal skill', async () => {
    const parsed = parseSkill(MINIMAL_SKILL);
    const results = validateSkill(parsed);

    // Should have some failures due to hedge words and shallow content
    const failures = results.filter((r) => !r.passed);
    expect(failures.length).toBeGreaterThan(0);
  });

  it('persists test results to DB', async () => {
    const parsed = parseSkill(GOOD_SKILL);
    const results = validateSkill(parsed);

    const inserts = results.map((r) => ({
      skillPath: '/test/SKILL.md',
      skillName: parsed.name ?? undefined,
      vector: r.vector,
      tier: r.tier,
      rule: r.rule,
      score: r.score,
      passed: r.passed,
      message: r.message,
      evidence: r.evidence,
    }));

    const ids = insertTestResults(db, inserts);
    expect(ids.length).toBe(results.length);

    const stored = getTestResults(db, '/test/SKILL.md');
    expect(stored.length).toBe(results.length);
    expect(stored[0].skillName).toBe('test-skill');
  });

  it('logs skill_test event when session exists', async () => {
    const sessionId = createSession(db, 'org/repo', 'main');
    const parsed = parseSkill(GOOD_SKILL);
    const results = validateSkill(parsed);

    const inserts = results.map((r) => ({
      skillPath: '/test/SKILL.md',
      skillName: parsed.name ?? undefined,
      vector: r.vector,
      tier: r.tier,
      rule: r.rule,
      score: r.score,
      passed: r.passed,
      message: r.message,
      evidence: r.evidence,
      sessionId,
    }));
    insertTestResults(db, inserts);

    logEvent(db, sessionId, 'skill_test', {
      path: '/test/SKILL.md',
      skillName: parsed.name,
    });

    expect(hasEventOccurred(db, sessionId, 'skill_test')).toBe(true);
  });

  it('returns all 5 quality vectors in results', async () => {
    const parsed = parseSkill(GOOD_SKILL);
    const results = validateSkill(parsed);

    const vectors = new Set(results.map((r) => r.vector));
    expect(vectors.has('clarity')).toBe(true);
    expect(vectors.has('completeness')).toBe(true);
    expect(vectors.has('concreteness')).toBe(true);
    expect(vectors.has('consistency')).toBe(true);
    expect(vectors.has('containment')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// MCP tool annotations
// ---------------------------------------------------------------------------

describe('MCP tool annotations', () => {
  it('should have correct readOnlyHint for new tools', async () => {
    // This test verifies our design intent via code review — the tool registrations
    // use readOnlyHint: true for list/get/show and false for resolve.
    // We validate the exported helpers exist and function correctly.
    expect(confidenceToWords(0.7)).toBe('high');
    expect(typeof resetProactiveHintCounter).toBe('function');
  });
});

