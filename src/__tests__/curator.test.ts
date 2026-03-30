import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { getLastProcessedEventId } from '../db/curatorState.js';
import {
  createInsight,
  reinforceInsight,
  getInsightByPattern,
  getInsights,
  markStaleInsights,
  deletePrunedInsights,
  setInsightStatus,
} from '../db/insights.js';
import { curate, getCuratorStatus } from '../agents/curator.js';

beforeEach(() => {
  closeDb();
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Insights DAL
// ---------------------------------------------------------------------------

describe('insights DAL', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  it('should create an insight and return its id', () => {
    const id = createInsight(
      'recurring_error',
      'Recurring build error',
      'Build errors happen a lot',
      [1, 2, 3],
      0.6,
      'Fix your build',
    );
    expect(id).toBeGreaterThan(0);
  });

  it('should retrieve an insight by pattern type and title', () => {
    createInsight(
      'recurring_error',
      'Recurring build error',
      'Build errors happen a lot',
      [1, 2, 3],
      0.6,
    );

    const found = getInsightByPattern('recurring_error', 'Recurring build error');
    expect(found).toBeDefined();
    expect(found!.patternType).toBe('recurring_error');
    expect(found!.title).toBe('Recurring build error');
    expect(found!.confidence).toBe(0.6);
    expect(found!.occurrenceCount).toBe(1);
    expect(found!.evidence).toEqual([1, 2, 3]);
  });

  it('should return undefined for nonexistent insight', () => {
    expect(getInsightByPattern('recurring_error', 'nope')).toBeUndefined();
  });

  it('should reinforce an existing insight', () => {
    const id = createInsight(
      'recurring_error',
      'Recurring build error',
      'Build errors',
      [1, 2],
      0.4,
    );

    reinforceInsight(id, [3, 4], 0.8);

    const updated = getInsightByPattern('recurring_error', 'Recurring build error');
    expect(updated!.occurrenceCount).toBe(2);
    expect(updated!.confidence).toBe(0.8);
    expect(updated!.evidence).toEqual([1, 2, 3, 4]);
  });

  it('should silently ignore reinforcement of nonexistent insight', () => {
    // Should not throw
    reinforceInsight(999, [1, 2], 0.5);
  });

  it('should list all insights', () => {
    createInsight('recurring_error', 'Error A', 'desc', [1], 0.5);
    createInsight('skip_frequency', 'Skip B', 'desc', [2], 0.3);

    const all = getInsights();
    expect(all).toHaveLength(2);
  });

  it('should filter insights by status', () => {
    const id1 = createInsight('recurring_error', 'Error A', 'desc', [1], 0.5);
    createInsight('skip_frequency', 'Skip B', 'desc', [2], 0.3);

    setInsightStatus(id1, 'stale');

    expect(getInsights('active')).toHaveLength(1);
    expect(getInsights('stale')).toHaveLength(1);
  });

  it('should mark old insights as stale', () => {
    createInsight('recurring_error', 'Old error', 'desc', [1], 0.5);
    // The insight was just created with last_seen_at = now(),
    // so marking with a future date should stale it
    const futureDate = '2099-01-01 00:00:00';
    const staled = markStaleInsights(futureDate);
    expect(staled).toBe(1);
    expect(getInsights('stale')).toHaveLength(1);
  });

  it('should prune insights with pruned status', () => {
    const id = createInsight('recurring_error', 'To prune', 'desc', [1], 0.5);
    setInsightStatus(id, 'pruned');

    const removed = deletePrunedInsights();
    expect(removed).toBe(1);
    expect(getInsights()).toHaveLength(0);
  });

  it('should store and retrieve prescriptions', () => {
    createInsight(
      'recurring_error',
      'Auth error',
      'desc',
      [1],
      0.5,
      'Check token expiration',
    );

    const insight = getInsightByPattern('recurring_error', 'Auth error');
    expect(insight!.prescription).toBe('Check token expiration');
  });

  it('should handle missing prescription as undefined', () => {
    createInsight('recurring_error', 'No fix', 'desc', [1], 0.5);

    const insight = getInsightByPattern('recurring_error', 'No fix');
    expect(insight!.prescription).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Curator pipeline — curate()
// ---------------------------------------------------------------------------

describe('curator pipeline', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should return zero counts when no events to process', () => {
    const result = curate();
    expect(result.eventsProcessed).toBe(0);
    expect(result.insightsCreated).toBe(0);
    expect(result.insightsReinforced).toBe(0);
  });

  it('should advance cursor after processing', () => {
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    logEvent(sessionId, 'tool_use', { tool: 'view' });
    const lastId = logEvent(sessionId, 'tool_use', { tool: 'edit' });

    curate();
    expect(getLastProcessedEventId()).toBe(lastId);
  });

  it('should not reprocess events on second curate call', () => {
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    const first = curate();
    expect(first.eventsProcessed).toBe(2);

    const second = curate();
    expect(second.eventsProcessed).toBe(0);
  });

  it('should process only new events after cursor advances', () => {
    logEvent(sessionId, 'tool_use', { tool: 'grep' });
    curate();

    logEvent(sessionId, 'tool_use', { tool: 'view' });
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    const result = curate();
    expect(result.eventsProcessed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Recurring error detection
// ---------------------------------------------------------------------------

describe('recurring error detection', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should detect recurring errors when threshold is met', () => {
    logEvent(sessionId, 'error', { category: 'build', message: 'TS compilation failed' });
    logEvent(sessionId, 'error', { category: 'build', message: 'TS compilation failed' });

    const result = curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);

    const insights = getInsights('active');
    const buildInsight = insights.find((i) => i.title.startsWith('Recurring build:'));
    expect(buildInsight).toBeDefined();
    expect(buildInsight!.patternType).toBe('recurring_error');
    expect(buildInsight!.prescription).toContain('Build errors');
  });

  it('should not create insight for a single error occurrence', () => {
    logEvent(sessionId, 'error', { category: 'build', message: 'one-off failure' });

    const result = curate();
    expect(result.insightsCreated).toBe(0);
  });

  it('should reinforce existing insight on repeated detection', () => {
    // Batch 1: create insight
    logEvent(sessionId, 'error', { category: 'test', message: 'assertion failed' });
    logEvent(sessionId, 'error', { category: 'test', message: 'assertion failed' });
    curate();

    // Batch 2: reinforce
    logEvent(sessionId, 'error', { category: 'test', message: 'assertion failed' });
    logEvent(sessionId, 'error', { category: 'test', message: 'assertion failed' });
    const result = curate();

    expect(result.insightsReinforced).toBeGreaterThanOrEqual(1);

    const insight = getInsightByPattern('recurring_error', 'Recurring test: assertion failed');
    // Batch 1 created with count=2, batch 2 reinforced with delta=2 → total 4
    expect(insight!.occurrenceCount).toBe(4);
  });

  it('should group errors by category+message', () => {
    logEvent(sessionId, 'error', { category: 'build', message: 'TS failed' });
    logEvent(sessionId, 'error', { category: 'build', message: 'TS failed' });
    logEvent(sessionId, 'error', { category: 'test', message: 'assertion error' });
    logEvent(sessionId, 'error', { category: 'test', message: 'assertion error' });

    const result = curate();
    expect(result.insightsCreated).toBe(2);

    const insights = getInsights('active');
    expect(insights).toHaveLength(2);
  });

  it('should provide category-specific prescriptions', () => {
    logEvent(sessionId, 'error', { category: 'auth', message: 'token expired' });
    logEvent(sessionId, 'error', { category: 'auth', message: 'token expired' });
    curate();

    const insight = getInsightByPattern('recurring_error', 'Recurring auth: token expired');
    expect(insight!.prescription).toContain('token expiration');
  });

  it('should provide generic prescription for unknown categories', () => {
    logEvent(sessionId, 'error', { category: 'exotic', message: 'weird stuff' });
    logEvent(sessionId, 'error', { category: 'exotic', message: 'weird stuff' });
    curate();

    const insight = getInsightByPattern('recurring_error', 'Recurring exotic: weird stuff');
    expect(insight!.prescription).toContain('root cause');
  });
});

// ---------------------------------------------------------------------------
// Error sequence detection
// ---------------------------------------------------------------------------

describe('error sequence detection', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should detect tool_use → error sequences', () => {
    // Simulate: tool_use followed by error, twice
    logEvent(sessionId, 'tool_use', { tool: 'edit' });
    logEvent(sessionId, 'error', { category: 'build', message: 'compile error' });
    logEvent(sessionId, 'tool_use', { tool: 'edit' });
    logEvent(sessionId, 'error', { category: 'build', message: 'compile error' });

    const result = curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);

    const insights = getInsights('active');
    const seqInsight = insights.find((i) => i.patternType === 'error_sequence');
    expect(seqInsight).toBeDefined();
    expect(seqInsight!.title).toContain('tool_use');
    expect(seqInsight!.title).toContain('build');
  });

  it('should not detect sequence for non-adjacent events', () => {
    logEvent(sessionId, 'tool_use', { tool: 'edit' });
    logEvent(sessionId, 'tool_use', { tool: 'grep' }); // intervening event
    logEvent(sessionId, 'error', { category: 'build', message: 'fail' });

    curate();
    // The sequence is grep→build (not edit→build), but only once
    const insights = getInsights('active').filter((i) => i.patternType === 'error_sequence');
    expect(insights).toHaveLength(0); // below threshold
  });

  it('should ignore error→error sequences', () => {
    logEvent(sessionId, 'error', { category: 'build', message: 'first' });
    logEvent(sessionId, 'error', { category: 'build', message: 'second' });
    logEvent(sessionId, 'error', { category: 'build', message: 'first' });
    logEvent(sessionId, 'error', { category: 'build', message: 'second' });

    curate();
    const seqInsights = getInsights('active').filter((i) => i.patternType === 'error_sequence');
    // error→error pairs are skipped by design
    expect(seqInsights).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Skip frequency detection
// ---------------------------------------------------------------------------

describe('skip frequency detection', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should detect frequently skipped guardrails', () => {
    logEvent(sessionId, 'skip', { whatSkipped: 'review', reason: 'time pressure' });
    logEvent(sessionId, 'skip', { whatSkipped: 'review', reason: 'time pressure' });

    const result = curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);

    const insight = getInsightByPattern('skip_frequency', 'Frequently skipped: review');
    expect(insight).toBeDefined();
    expect(insight!.prescription).toContain('review');
  });

  it('should not create insight for a single skip', () => {
    logEvent(sessionId, 'skip', { whatSkipped: 'lint', reason: 'one-off' });

    curate();
    expect(getInsights('active')).toHaveLength(0);
  });

  it('should track different skip targets independently', () => {
    logEvent(sessionId, 'skip', { whatSkipped: 'review' });
    logEvent(sessionId, 'skip', { whatSkipped: 'review' });
    logEvent(sessionId, 'skip', { whatSkipped: 'lint' });
    logEvent(sessionId, 'skip', { whatSkipped: 'lint' });

    curate();
    const insights = getInsights('active').filter((i) => i.patternType === 'skip_frequency');
    expect(insights).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Curator status
// ---------------------------------------------------------------------------

describe('curator status', () => {
  beforeEach(() => {
    getDb(':memory:');
  });

  it('should return initial status with zero cursor', () => {
    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBe(0);
    expect(status.totalInsights).toBe(0);
    expect(status.activeInsights).toBe(0);
    expect(status.staleInsights).toBe(0);
  });

  it('should reflect cursor position after curation', () => {
    const sessionId = createSession('org_repo', 'main');
    const lastId = logEvent(sessionId, 'tool_use', { tool: 'grep' });

    curate();

    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBe(lastId);
    expect(status.lastRunAt).not.toBeNull();
  });

  it('should count insights by status', () => {
    createInsight('recurring_error', 'Active 1', 'desc', [1], 0.5);
    createInsight('recurring_error', 'Active 2', 'desc', [2], 0.3);
    const staleId = createInsight('skip_frequency', 'Stale 1', 'desc', [3], 0.2);
    setInsightStatus(staleId, 'stale');

    const status = getCuratorStatus();
    expect(status.totalInsights).toBe(3);
    expect(status.activeInsights).toBe(2);
    expect(status.staleInsights).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Integration: full curate cycle
// ---------------------------------------------------------------------------

describe('full curate cycle', () => {
  let sessionId: string;

  beforeEach(() => {
    getDb(':memory:');
    sessionId = createSession('org_repo', 'main');
  });

  it('should handle a realistic session with mixed event types', () => {
    // Simulate a realistic session
    logEvent(sessionId, 'session_start', { repoKey: 'org_repo' });
    logEvent(sessionId, 'tool_use', { tool: 'grep', args: { pattern: 'TODO' } });
    logEvent(sessionId, 'tool_use', { tool: 'edit', args: { file: 'src/main.ts' } });
    logEvent(sessionId, 'error', { category: 'build', message: 'TS2345: Type mismatch' });
    logEvent(sessionId, 'tool_use', { tool: 'edit', args: { file: 'src/main.ts' } });
    logEvent(sessionId, 'error', { category: 'build', message: 'TS2345: Type mismatch' });
    logEvent(sessionId, 'skip', { whatSkipped: 'review', reason: 'trivial change' });
    logEvent(sessionId, 'skip', { whatSkipped: 'review', reason: 'another trivial change' });
    logEvent(sessionId, 'tool_use', { tool: 'view', args: { file: 'package.json' } });
    logEvent(sessionId, 'session_end', { status: 'completed' });

    const result = curate();

    // Should have processed all 10 events
    expect(result.eventsProcessed).toBe(10);

    // Should detect: recurring build error, tool_use→build sequence, review skip frequency
    expect(result.insightsCreated).toBeGreaterThanOrEqual(2);

    const insights = getInsights('active');
    const types = insights.map((i) => i.patternType);
    expect(types).toContain('recurring_error');
    expect(types).toContain('skip_frequency');

    // Cursor should be at last event
    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBeGreaterThan(0);
    expect(status.lastRunAt).not.toBeNull();
  });

  it('should handle events with malformed payloads gracefully', () => {
    const db = getDb();
    // Insert event with invalid JSON directly
    db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'error', 'not-json')",
    ).run(sessionId);
    db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'error', 'not-json')",
    ).run(sessionId);

    // Should not throw, and malformed events should not create insights
    const result = curate();
    expect(result.eventsProcessed).toBe(2);
    expect(result.insightsCreated).toBe(0);
    expect(getInsights('active')).toHaveLength(0);
  });
});
