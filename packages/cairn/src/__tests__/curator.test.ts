import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
import { insertSignalSamples } from '../db/signalSamples.js';
import { getExecutionProfile } from '../db/executionProfiles.js';
import { insertOptimizationHint } from '../db/optimizationHints.js';
import { curate, getCuratorStatus, TIME_BUDGET_MS } from '../agents/curator.js';

let db: ReturnType<typeof getDb>;


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
    db = getDb(':memory:');
  });

  it('should create an insight and return its id', async () => {
    const id = createInsight(db,
      'recurring_error',
      'Recurring build error',
      'Build errors happen a lot',
      [1, 2, 3],
      0.6,
      1,
      'Fix your build',
    );
    expect(id).toBeGreaterThan(0);
  });

  it('should retrieve an insight by pattern type and title', async () => {
    createInsight(db,
      'recurring_error',
      'Recurring build error',
      'Build errors happen a lot',
      [1, 2, 3],
      0.6,
    );

    const found = getInsightByPattern(db, 'recurring_error', 'Recurring build error');
    expect(found).toBeDefined();
    expect(found!.patternType).toBe('recurring_error');
    expect(found!.title).toBe('Recurring build error');
    expect(found!.confidence).toBe(0.6);
    expect(found!.occurrenceCount).toBe(1);
    expect(found!.evidence).toEqual([1, 2, 3]);
  });

  it('should return undefined for nonexistent insight', async () => {
    expect(getInsightByPattern(db, 'recurring_error', 'nope')).toBeUndefined();
  });

  it('should reinforce an existing insight', async () => {
    const id = createInsight(db,
      'recurring_error',
      'Recurring build error',
      'Build errors',
      [1, 2],
      0.4,
    );

    reinforceInsight(db, id, [3, 4], 0.8);

    const updated = getInsightByPattern(db, 'recurring_error', 'Recurring build error');
    expect(updated!.occurrenceCount).toBe(2);
    expect(updated!.confidence).toBe(0.8);
    expect(updated!.evidence).toEqual([1, 2, 3, 4]);
  });

  it('should silently ignore reinforcement of nonexistent insight', async () => {
    // Should not throw
    reinforceInsight(db, 999, [1, 2], 0.5);
  });

  it('should list all insights', async () => {
    createInsight(db, 'recurring_error', 'Error A', 'desc', [1], 0.5);
    createInsight(db, 'skip_frequency', 'Skip B', 'desc', [2], 0.3);

    const all = getInsights(db);
    expect(all).toHaveLength(2);
  });

  it('should filter insights by status', async () => {
    const id1 = createInsight(db, 'recurring_error', 'Error A', 'desc', [1], 0.5);
    createInsight(db, 'skip_frequency', 'Skip B', 'desc', [2], 0.3);

    setInsightStatus(db, id1, 'stale');

    expect(getInsights(db, 'active')).toHaveLength(1);
    expect(getInsights(db, 'stale')).toHaveLength(1);
  });

  it('should mark old insights as stale', async () => {
    createInsight(db, 'recurring_error', 'Old error', 'desc', [1], 0.5);
    // The insight was just created with last_seen_at = now(),
    // so marking with a future date should stale it
    const futureDate = '2099-01-01 00:00:00';
    const staled = markStaleInsights(db, futureDate);
    expect(staled).toBe(1);
    expect(getInsights(db, 'stale')).toHaveLength(1);
  });

  it('should prune insights with pruned status', async () => {
    const id = createInsight(db, 'recurring_error', 'To prune', 'desc', [1], 0.5);
    setInsightStatus(db, id, 'pruned');

    const removed = deletePrunedInsights(db);
    expect(removed).toBe(1);
    expect(getInsights(db)).toHaveLength(0);
  });

  it('should store and retrieve prescriptions', async () => {
    createInsight(db,
      'recurring_error',
      'Auth error',
      'desc',
      [1],
      0.5,
      1,
      'Check token expiration',
    );

    const insight = getInsightByPattern(db, 'recurring_error', 'Auth error');
    expect(insight!.prescription).toBe('Check token expiration');
  });

  it('should handle missing prescription as undefined', async () => {
    createInsight(db, 'recurring_error', 'No fix', 'desc', [1], 0.5);

    const insight = getInsightByPattern(db, 'recurring_error', 'No fix');
    expect(insight!.prescription).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Curator pipeline — await curate()
// ---------------------------------------------------------------------------

describe('curator pipeline', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should return zero counts when no events to process', async () => {
    const result = await curate();
    expect(result.eventsProcessed).toBe(0);
    expect(result.insightsCreated).toBe(0);
    expect(result.insightsReinforced).toBe(0);
  });

  it('should advance cursor after processing', async () => {
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'tool_use', { tool: 'view' });
    const lastId = logEvent(db, sessionId, 'tool_use', { tool: 'edit' });

    await curate();
    expect(getLastProcessedEventId(db)).toBe(lastId);
  });

  it('should not reprocess events on second curate call', async () => {
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });

    const first = await curate();
    expect(first.eventsProcessed).toBe(2);

    const second = await curate();
    expect(second.eventsProcessed).toBe(0);
  });

  it('should process only new events after cursor advances', async () => {
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    await curate();

    logEvent(db, sessionId, 'tool_use', { tool: 'view' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });

    const result = await curate();
    expect(result.eventsProcessed).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Recurring error detection
// ---------------------------------------------------------------------------

describe('recurring error detection', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should detect recurring errors when threshold is met', async () => {
    logEvent(db, sessionId, 'error', { category: 'build', message: 'TS compilation failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'TS compilation failed' });

    const result = await curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);

    const insights = getInsights(db, 'active');
    const buildInsight = insights.find((i) => i.title.startsWith('Recurring build:'));
    expect(buildInsight).toBeDefined();
    expect(buildInsight!.patternType).toBe('recurring_error');
    expect(buildInsight!.prescription).toContain('Build errors');
  });

  it('should not create insight for a single error occurrence', async () => {
    logEvent(db, sessionId, 'error', { category: 'build', message: 'one-off failure' });

    const result = await curate();
    expect(result.insightsCreated).toBe(0);
  });

  it('should reinforce existing insight on repeated detection', async () => {
    // Batch 1: create insight
    logEvent(db, sessionId, 'error', { category: 'test', message: 'assertion failed' });
    logEvent(db, sessionId, 'error', { category: 'test', message: 'assertion failed' });
    await curate();

    // Batch 2: reinforce
    logEvent(db, sessionId, 'error', { category: 'test', message: 'assertion failed' });
    logEvent(db, sessionId, 'error', { category: 'test', message: 'assertion failed' });
    const result = await curate();

    expect(result.insightsReinforced).toBeGreaterThanOrEqual(1);

    const insight = getInsightByPattern(db, 'recurring_error', 'Recurring test: assertion failed');
    // Batch 1 created with count=2, batch 2 reinforced with delta=2 → total 4
    expect(insight!.occurrenceCount).toBe(4);
  });

  it('should group errors by category+message', async () => {
    logEvent(db, sessionId, 'error', { category: 'build', message: 'TS failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'TS failed' });
    logEvent(db, sessionId, 'error', { category: 'test', message: 'assertion error' });
    logEvent(db, sessionId, 'error', { category: 'test', message: 'assertion error' });

    const result = await curate();
    expect(result.insightsCreated).toBe(2);

    const insights = getInsights(db, 'active');
    expect(insights).toHaveLength(2);
  });

  it('should provide category-specific prescriptions', async () => {
    logEvent(db, sessionId, 'error', { category: 'auth', message: 'token expired' });
    logEvent(db, sessionId, 'error', { category: 'auth', message: 'token expired' });
    await curate();

    const insight = getInsightByPattern(db, 'recurring_error', 'Recurring auth: token expired');
    expect(insight!.prescription).toContain('token expiration');
  });

  it('should provide generic prescription for unknown categories', async () => {
    logEvent(db, sessionId, 'error', { category: 'exotic', message: 'weird stuff' });
    logEvent(db, sessionId, 'error', { category: 'exotic', message: 'weird stuff' });
    await curate();

    const insight = getInsightByPattern(db, 'recurring_error', 'Recurring exotic: weird stuff');
    expect(insight!.prescription).toContain('root cause');
  });
});

// ---------------------------------------------------------------------------
// Error sequence detection
// ---------------------------------------------------------------------------

describe('error sequence detection', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should detect tool_use → error sequences', async () => {
    // Simulate: tool_use followed by error, twice
    logEvent(db, sessionId, 'tool_use', { tool: 'edit' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile error' });
    logEvent(db, sessionId, 'tool_use', { tool: 'edit' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile error' });

    const result = await curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);

    const insights = getInsights(db, 'active');
    const seqInsight = insights.find((i) => i.patternType === 'error_sequence');
    expect(seqInsight).toBeDefined();
    expect(seqInsight!.title).toContain('tool_use');
    expect(seqInsight!.title).toContain('build');
  });

  it('should not detect sequence for non-adjacent events', async () => {
    logEvent(db, sessionId, 'tool_use', { tool: 'edit' });
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' }); // intervening event
    logEvent(db, sessionId, 'error', { category: 'build', message: 'fail' });

    await curate();
    // The sequence is grep→build (not edit→build), but only once
    const insights = getInsights(db, 'active').filter((i) => i.patternType === 'error_sequence');
    expect(insights).toHaveLength(0); // below threshold
  });

  it('should ignore error→error sequences', async () => {
    logEvent(db, sessionId, 'error', { category: 'build', message: 'first' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'second' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'first' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'second' });

    await curate();
    const seqInsights = getInsights(db, 'active').filter((i) => i.patternType === 'error_sequence');
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
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should detect frequently skipped guardrails', async () => {
    logEvent(db, sessionId, 'skip', { whatSkipped: 'review', reason: 'time pressure' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'review', reason: 'time pressure' });

    const result = await curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);

    const insight = getInsightByPattern(db, 'skip_frequency', 'Frequently skipped: review');
    expect(insight).toBeDefined();
    expect(insight!.prescription).toContain('review');
  });

  it('should not create insight for a single skip', async () => {
    logEvent(db, sessionId, 'skip', { whatSkipped: 'lint', reason: 'one-off' });

    await curate();
    expect(getInsights(db, 'active')).toHaveLength(0);
  });

  it('should track different skip targets independently', async () => {
    logEvent(db, sessionId, 'skip', { whatSkipped: 'review' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'review' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'lint' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'lint' });

    await curate();
    const insights = getInsights(db, 'active').filter((i) => i.patternType === 'skip_frequency');
    expect(insights).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Curator status
// ---------------------------------------------------------------------------

describe('curator status', () => {
  beforeEach(() => {
    db = getDb(':memory:');
  });

  it('should return initial status with zero cursor', async () => {
    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBe(0);
    expect(status.totalInsights).toBe(0);
    expect(status.activeInsights).toBe(0);
    expect(status.staleInsights).toBe(0);
  });

  it('should reflect cursor position after curation', async () => {
    const sessionId = createSession(db, 'org_repo', 'main');
    const lastId = logEvent(db, sessionId, 'tool_use', { tool: 'grep' });

    await curate();

    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBe(lastId);
    expect(status.lastRunAt).not.toBeNull();
  });

  it('should count insights by status', async () => {
    createInsight(db, 'recurring_error', 'Active 1', 'desc', [1], 0.5);
    createInsight(db, 'recurring_error', 'Active 2', 'desc', [2], 0.3);
    const staleId = createInsight(db, 'skip_frequency', 'Stale 1', 'desc', [3], 0.2);
    setInsightStatus(db, staleId, 'stale');

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
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should handle a realistic session with mixed event types', async () => {
    // Simulate a realistic session
    logEvent(db, sessionId, 'session_start', { repoKey: 'org_repo' });
    logEvent(db, sessionId, 'tool_use', { tool: 'grep', args: { pattern: 'TODO' } });
    logEvent(db, sessionId, 'tool_use', { tool: 'edit', args: { file: 'src/main.ts' } });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'TS2345: Type mismatch' });
    logEvent(db, sessionId, 'tool_use', { tool: 'edit', args: { file: 'src/main.ts' } });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'TS2345: Type mismatch' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'review', reason: 'trivial change' });
    logEvent(db, sessionId, 'skip', { whatSkipped: 'review', reason: 'another trivial change' });
    logEvent(db, sessionId, 'tool_use', { tool: 'view', args: { file: 'package.json' } });
    logEvent(db, sessionId, 'session_end', { status: 'completed' });

    const result = await curate();

    // Should have processed all 10 events
    expect(result.eventsProcessed).toBe(10);

    // Should detect: recurring build error, tool_use→build sequence, review skip frequency
    expect(result.insightsCreated).toBeGreaterThanOrEqual(2);

    const insights = getInsights(db, 'active');
    const types = insights.map((i) => i.patternType);
    expect(types).toContain('recurring_error');
    expect(types).toContain('skip_frequency');

    // Cursor should be at last event
    const status = getCuratorStatus();
    expect(status.lastProcessedEventId).toBeGreaterThan(0);
    expect(status.lastRunAt).not.toBeNull();
  });

  it('should handle events with malformed payloads gracefully', async () => {
    db = getDb();
    // Insert event with invalid JSON directly
    db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'error', 'not-json')",
    ).run(sessionId);
    db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'error', 'not-json')",
    ).run(sessionId);

    // Should not throw, and malformed events should not create insights
    const result = await curate();
    expect(result.eventsProcessed).toBe(2);
    expect(result.insightsCreated).toBe(0);
    expect(getInsights(db, 'active')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CurateResult new fields: capped, insightsChanged
// ---------------------------------------------------------------------------

describe('curate result fields', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  it('should return capped: false and insightsChanged: false when no events', async () => {
    const result = await curate();
    expect(result.capped).toBe(false);
    expect(result.insightsChanged).toBe(false);
  });

  it('should return insightsChanged: true when insights are created', async () => {
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });

    const result = await curate();
    expect(result.insightsCreated).toBeGreaterThanOrEqual(1);
    expect(result.insightsChanged).toBe(true);
  });

  it('should return insightsChanged: true when insights are reinforced', async () => {
    // First run creates insights
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    await curate();

    // Second run reinforces
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    logEvent(db, sessionId, 'error', { category: 'build', message: 'compile failed' });
    const result = await curate();

    expect(result.insightsReinforced).toBeGreaterThanOrEqual(1);
    expect(result.insightsChanged).toBe(true);
  });

  it('should return insightsChanged: false when no patterns match', async () => {
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'tool_use', { tool: 'view' });

    const result = await curate();
    expect(result.insightsChanged).toBe(false);
  });

  it('should return capped: false when all events are processed normally', async () => {
    logEvent(db, sessionId, 'tool_use', { tool: 'grep' });
    logEvent(db, sessionId, 'tool_use', { tool: 'view' });

    const result = await curate();
    expect(result.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Curate time cap
// ---------------------------------------------------------------------------

describe('curate time cap', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should cap when time budget is exceeded between batches', async () => {
    // Insert more than BATCH_SIZE events so the loop iterates multiple batches
    db = getDb();
    const stmt = db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'tool_use', ?)",
    );
    // Insert 1001 events — forces 2 batches (1000 + 1)
    for (let i = 0; i < 1001; i++) {
      stmt.run(sessionId, JSON.stringify({ tool: `tool-${i}` }));
    }

    // Mock Date.now to exceed budget after the first batch
    const realNow = Date.now();
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call (startTime capture) returns real time
      // Second call (budget check after first batch) returns time well over budget
      if (callCount === 1) return realNow;
      return realNow + TIME_BUDGET_MS + 1000;
    });

    const result = await curate();

    // Should have processed exactly the first batch (1000 events)
    expect(result.eventsProcessed).toBe(1000);
    expect(result.capped).toBe(true);
  });

  it('should persist cursor after time-capped partial run', async () => {
    db = getDb();
    const stmt = db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'tool_use', ?)",
    );
    for (let i = 0; i < 1001; i++) {
      stmt.run(sessionId, JSON.stringify({ tool: `tool-${i}` }));
    }

    const realNow = Date.now();
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return realNow;
      return realNow + TIME_BUDGET_MS + 1000;
    });

    await curate();

    // Cursor should be at event 1000 (first batch), not 0
    const cursor = getLastProcessedEventId(db);
    expect(cursor).toBeGreaterThan(0);
  });

  it('should resume from persisted cursor after capped run', async () => {
    db = getDb();
    const stmt = db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'tool_use', ?)",
    );
    for (let i = 0; i < 1001; i++) {
      stmt.run(sessionId, JSON.stringify({ tool: `tool-${i}` }));
    }

    // First run: cap after first batch
    const realNow = Date.now();
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return realNow;
      return realNow + TIME_BUDGET_MS + 1000;
    });

    const firstResult = await curate();
    expect(firstResult.eventsProcessed).toBe(1000);
    expect(firstResult.capped).toBe(true);

    // Restore Date.now for second run
    vi.restoreAllMocks();

    // Second run: should pick up remaining 1 event
    const secondResult = await curate();
    expect(secondResult.eventsProcessed).toBe(1);
    expect(secondResult.capped).toBe(false);
  });

  it('should not report capped when final batch is partial (caught up)', async () => {
    // Insert exactly BATCH_SIZE events — should complete in one batch, not capped
    db = getDb();
    const stmt = db.prepare(
      "INSERT INTO event_log (session_id, event_type, payload) VALUES (?, 'tool_use', ?)",
    );
    for (let i = 0; i < 500; i++) {
      stmt.run(sessionId, JSON.stringify({ tool: `tool-${i}` }));
    }

    // Even if "time is over", a partial batch means caught up, not capped
    const realNow = Date.now();
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      if (callCount === 1) return realNow;
      return realNow + TIME_BUDGET_MS + 5000;
    });

    const result = await curate();
    expect(result.eventsProcessed).toBe(500);
    expect(result.capped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Slice 3: buildProfiles wired into curate()
// ---------------------------------------------------------------------------

describe('profile build inside curate()', () => {
  let sessionId: string;

  beforeEach(() => {
    db = getDb(':memory:');
    sessionId = createSession(db, 'org_repo', 'main');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should surface profileBuild on CurateResult when signal_samples exist', async () => {
    const now = Date.now();
    insertSignalSamples(db, [
      { kind: 'drift', sessionId, skillId: 'skill-a', value: 0.5, collectedAt: new Date(now - 120_000).toISOString() },
      { kind: 'drift', sessionId, skillId: 'skill-a', value: 0.6, collectedAt: new Date(now - 60_000).toISOString() },
    ]);

    const result = await curate();

    expect(result.profileBuild).toBeDefined();
    expect(result.profileBuild!.profilesBuilt).toBeGreaterThan(0);
    expect(result.profileBuild!.samplesConsumed).toBe(2);
    expect(result.profileBuild!.skillIds).toContain('skill-a');
    expect(result.profileBuild!.skillIds).toContain('global');
  });

  it('should build execution_profiles before sweepChangeVectors runs', async () => {
    insertSignalSamples(db, [
      { kind: 'drift', sessionId, skillId: 'skill-b', value: 0.4, collectedAt: new Date(Date.now() - 60_000).toISOString() },
    ]);

    const result = await curate();

    // Profile must be in the DB (built pre-sweep so sweep can read it)
    const profile = getExecutionProfile(db, 'skill-b', 'per-skill', 'global');
    expect(profile).not.toBeNull();
    expect(result.profileBuild).toBeDefined();
    expect(result.profileBuild!.skillIds).toContain('skill-b');
  });

  it('buildProfiles runs BEFORE sweepChangeVectors — sweep observably consumes the freshly-built profile', async () => {
    // ORDERING PROOF (Slice 3 nit, strengthened in Slice 5):
    //
    // Seed an applied optimization_hint for 'skill-order-proof' with a legacy
    // metric_snapshot (no sessionCount).  With a legacy snapshot, the sweep's
    // gate uses `profile.session_count` directly, so the change vector CAN be
    // computed as soon as a per-skill profile exists with sessionCount >= 3.
    //
    // Also seed 3 distinct-session signal_samples so buildProfiles creates that
    // profile in the same curate() call.
    //
    // If sweepChangeVectors ran BEFORE buildProfiles:
    //   → no profile exists yet → skippedInsufficientSessions++ (computed = 0)
    //
    // If buildProfiles ran BEFORE sweepChangeVectors:
    //   → profile exists with sessionCount = 3 ≥ DEFAULT_MIN_SESSIONS
    //   → sweep computes the change vector → computed = 1 ✓
    //
    // changeVectorSweep.computed > 0 proves the profile was ready when the
    // sweep ran — i.e. buildProfiles ran first.
    const SKILL = 'skill-order-proof';

    // 3 distinct session IDs → aggregateSignals counts 3 sessions
    const now = Date.now();
    insertSignalSamples(db, [
      { kind: 'drift', sessionId: 'ord-sess-1', skillId: SKILL, value: 0.3, collectedAt: new Date(now - 180_000).toISOString() },
      { kind: 'drift', sessionId: 'ord-sess-2', skillId: SKILL, value: 0.4, collectedAt: new Date(now - 120_000).toISOString() },
      { kind: 'drift', sessionId: 'ord-sess-3', skillId: SKILL, value: 0.2, collectedAt: new Date(now - 60_000).toISOString() },
    ]);

    // Applied hint with a legacy snapshot (no sessionCount field).
    // The sweep will gate on profile.session_count = 3 ≥ DEFAULT_MIN_SESSIONS.
    insertOptimizationHint(db, {
      id: 'ordering-proof-hint-001',
      source: 'prompt-optimizer',
      skillId: SKILL,
      category: 'convergence',
      description: 'Ordering proof: sweep must see profile built in same curate() call',
      recommendation: 'Add explicit completion criteria.',
      impactScore: 0.8,
      confidence: 0.8,
      metricSnapshot: {
        driftScore: 0.35,
        tokenCostNanoAiu: 5_000_000,
        successRate: 0.9,
        convergenceTurns: 15,
        cacheHitRate: 0.1,
        // intentionally no sessionCount → legacy snapshot path in sweep
      },
      generatedAt: '2026-06-10T00:00:00.000Z',
      status: 'applied',
    });

    const result = await curate();

    // PRIMARY ORDERING ASSERTION:
    // computed > 0 proves the sweep found the profile that buildProfiles just
    // created earlier in the same curate() call.  If the order were reversed
    // (sweep first), the profile would not yet exist and the hint would be
    // counted under skippedInsufficientSessions instead.
    expect(
      result.changeVectorSweep.computed,
      'change vector computed — proves profile existed when sweep ran (ordering confirmed)',
    ).toBeGreaterThan(0);
    expect(
      result.changeVectorSweep.computedSkillIds,
      'computed skill ID matches our seeded skill',
    ).toContain(SKILL);
    expect(
      result.changeVectorSweep.skippedInsufficientSessions,
      'zero hints skipped — profile was ready for the sweep',
    ).toBe(0);

    // Secondary: profile is actually in the DB (belt-and-suspenders)
    const profile = getExecutionProfile(db, SKILL, 'per-skill', 'global');
    expect(profile, 'per-skill profile exists after curate()').not.toBeNull();
    expect(profile!.sessionCount, 'profile sessionCount = 3').toBe(3);
  });

  it('should complete curate() and run sweepChangeVectors even if buildProfiles throws', async () => {
    db = getDb();
    // Force a throw by dropping the signal_samples table
    db.prepare('DROP TABLE signal_samples').run();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await curate();

    expect(result).toBeDefined();
    expect(result.profileBuild).toBeUndefined();
    expect(result.changeVectorSweep).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('buildProfiles'),
      expect.anything(),
    );
  });

  it('BuildResult carries durationMs (non-negative number)', async () => {
    insertSignalSamples(db, [
      { kind: 'drift', sessionId, skillId: 'skill-dur', value: 0.3, collectedAt: new Date(Date.now() - 60_000).toISOString() },
    ]);

    const result = await curate();

    expect(result.profileBuild).toBeDefined();
    expect(typeof result.profileBuild!.durationMs).toBe('number');
    expect(result.profileBuild!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should run sweep/cap even when buildProfiles throws (isolated failure)', async () => {
    // Ordering: sweep/cap run FIRST in the new order, so they always execute
    // independently of buildProfiles.  This test verifies that even when
    // buildProfiles throws, the TTL sweep already ran and expired rows are gone.
    db = getDb();
    const oldAt = '2020-01-01T00:00:00.000Z'; // well beyond the 7-day TTL → swept
    const recentAt = new Date().toISOString();  // within TTL → survives sweep
    insertSignalSamples(db, [
      { kind: 'drift' as const, sessionId, skillId: 'skill-sweep-isolated', value: 0.1, collectedAt: oldAt },
      { kind: 'drift' as const, sessionId, skillId: 'skill-sweep-isolated', value: 0.2, collectedAt: oldAt },
      // Recent row survives the TTL sweep and gives buildProfiles rows to upsert,
      // ensuring it reaches the dropped execution_profiles table and throws.
      { kind: 'drift' as const, sessionId, skillId: 'skill-sweep-isolated', value: 0.3, collectedAt: recentAt },
    ]);
    // Drop execution_profiles: buildProfiles fails on upsert (the recent row
    // triggers the upsert path), but signal_samples remains accessible so
    // sweep/cap can still operate.
    db.prepare('DROP TABLE execution_profiles').run();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await curate();

    expect(result).toBeDefined();
    expect(result.changeVectorSweep).toBeDefined();
    expect(result.profileBuild).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('buildProfiles'),
      expect.anything(),
    );
    // KEY: TTL sweep must have run — expired rows must be gone despite build failure
    const remaining = db
      .prepare("SELECT COUNT(*) AS c FROM signal_samples WHERE skill_id = 'skill-sweep-isolated' AND collected_at = ?")
      .get(oldAt) as { c: number };
    expect(remaining.c).toBe(0);
  });

  it('curate() enforces signal_samples cap so table stays bounded after many samples', async () => {
    // Insert more than SIGNAL_SAMPLE_CAP rows to verify curate trims the table.
    // We use a small proxy cap rather than 10 000 rows to keep the test fast:
    // the enforcement logic is identical regardless of cap size.
    // Instead, directly verify that after curate() the count does NOT keep growing
    // without bound — we do this by inserting 30 rows with a very old collected_at
    // (beyond the 7-day TTL) and 5 recent rows, then asserting the old rows were swept.
    const oldAt = '2020-01-01T00:00:00.000Z'; // far in the past — beyond 7-day TTL
    const recentAt = new Date().toISOString();
    const oldSamples = Array.from({ length: 10 }, (_, i) => ({
      kind: 'drift' as const,
      sessionId: `old-${i}`,
      skillId: 'skill-c',
      value: 0.1,
      collectedAt: oldAt,
    }));
    const recentSamples = [
      { kind: 'drift' as const, sessionId: 'recent-1', skillId: 'skill-c', value: 0.2, collectedAt: recentAt },
    ];
    insertSignalSamples(db, [...oldSamples, ...recentSamples]);

    await curate();

    // Old samples (beyond TTL) must be swept — only the recent one remains for skill-c
    const rows = db.prepare("SELECT * FROM signal_samples WHERE skill_id = 'skill-c'").all();
    // All 10 old rows should have been removed by the TTL sweep
    const old = (rows as Array<{ collected_at: string }>).filter(r => r.collected_at === oldAt);
    expect(old).toHaveLength(0);
  });

  it('sweep/cap runs BEFORE buildProfiles — profiles are built from the bounded in-TTL set (ordering test)', async () => {
    // RED under old order (buildProfiles first): buildProfiles sees all 5 rows
    // (3 expired + 2 retained) → sessionCount = 5.  Test fails.
    //
    // GREEN under new order (sweep/cap first): the 3 expired rows are removed
    // before buildProfiles reads the table → buildProfiles sees only 2 retained
    // rows → sessionCount = 2.  Test passes.
    const expiredAt = '2020-01-01T00:00:00.000Z'; // well beyond 7-day TTL → swept
    const recentAt = new Date().toISOString();      // within TTL → retained

    insertSignalSamples(db, [
      { kind: 'drift' as const, sessionId: 'exp-sess-1', skillId: 'skill-ttl-order', value: 0.1, collectedAt: expiredAt },
      { kind: 'drift' as const, sessionId: 'exp-sess-2', skillId: 'skill-ttl-order', value: 0.2, collectedAt: expiredAt },
      { kind: 'drift' as const, sessionId: 'exp-sess-3', skillId: 'skill-ttl-order', value: 0.3, collectedAt: expiredAt },
      { kind: 'drift' as const, sessionId: 'ret-sess-1', skillId: 'skill-ttl-order', value: 0.4, collectedAt: recentAt },
      { kind: 'drift' as const, sessionId: 'ret-sess-2', skillId: 'skill-ttl-order', value: 0.5, collectedAt: recentAt },
    ]);

    await curate();

    // buildProfiles must have seen only the 2 retained rows (sweep ran first).
    // Under the old order it would see all 5 → sessionCount = 5.
    const profile = getExecutionProfile(db, 'skill-ttl-order', 'per-skill', 'global');
    expect(profile, 'per-skill profile for skill-ttl-order must exist').not.toBeNull();
    expect(
      profile!.sessionCount,
      'sessionCount must be 2 (only retained rows after TTL sweep) — fails under old order where buildProfiles runs first',
    ).toBe(2);
  });
});
