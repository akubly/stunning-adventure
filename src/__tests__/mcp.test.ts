import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession, getActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { getInsights } from '../db/insights.js';
import { curate, getCuratorStatus } from '../agents/curator.js';
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
