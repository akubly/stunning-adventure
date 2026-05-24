import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession } from '../db/sessions.js';
import { insertHintIfNew, updateOptimizationHintStatus } from '../db/optimizationHints.js';
import { upsertExecutionProfile } from '../db/executionProfiles.js';
import { getUnprocessedEvents } from '../db/events.js';
import type { OptimizationHintInsert } from '../db/optimizationHints.js';
import type { ExecutionProfileUpsert } from '../db/executionProfiles.js';

let counter = 0;
let sessionId: string;

function hint(overrides?: Partial<OptimizationHintInsert>): OptimizationHintInsert {
  counter += 1;
  return {
    id: `hint-${counter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-a',
    category: 'verbosity',
    description: 'Prompt is too long',
    recommendation: 'Trim preamble',
    impactScore: 0.5,
    confidence: 0.8,
    evidence: { tokens_saved: 320 },
    metricSnapshot: { drift_mean: 0.2 },
    generatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function profile(overrides?: Partial<ExecutionProfileUpsert>): ExecutionProfileUpsert {
  return {
    skillId: 'skill-a',
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 10,
    drift: { mean: 0.15, p50: 0.12, p95: 0.25, trend: 'stable' },
    token: { meanInput: 1000, meanOutput: 500, meanCacheHit: 0.5, totalCost: 0.05 },
    outcome: { successRate: 0.95, meanConvergence: 0.9, toolErrorRate: 0.02 },
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  counter = 0;
  getDb(':memory:');
  sessionId = createSession('test-repo', 'main');
});

afterEach(() => {
  closeDb();
});

describe('W4-2: CairnEvent extensions for hint state transitions', () => {
  it('emits hint_state_transition event on insertHintIfNew', () => {
    const db = getDb();
    
    insertHintIfNew(db, hint({ id: 'h-event-1', category: 'verbosity-event' }));
    
    const allEvents = getUnprocessedEvents(0);
    const hintEvents = allEvents.filter((e) => e.eventType === 'hint_state_transition');
    
    expect(hintEvents.length).toBeGreaterThan(0);
    
    const lastEvent = hintEvents[hintEvents.length - 1];
    const payload = JSON.parse(lastEvent.payload);
    expect(payload.hint_id).toBe('h-event-1');
    expect(payload.skill_id).toBe('skill-a');
    expect(payload.from_state).toBeNull();
    expect(payload.to_state).toBe('pending');
    expect(payload.timestamp).toBeDefined();
  });

  it('emits hint_state_transition event on updateOptimizationHintStatus', () => {
    const db = getDb();
    insertHintIfNew(db, hint({ id: 'h-status-1', status: 'pending' }));
    
    const beforeEventCount = getUnprocessedEvents(0).filter((e) => e.eventType === 'hint_state_transition').length;
    
    updateOptimizationHintStatus('h-status-1', 'accepted');
    
    const events = getUnprocessedEvents(0).filter((e) => e.eventType === 'hint_state_transition');
    expect(events.length).toBeGreaterThan(beforeEventCount);
    
    const lastEvent = events[events.length - 1];
    const payload = JSON.parse(lastEvent.payload);
    expect(payload.hint_id).toBe('h-status-1');
    expect(payload.from_state).toBe('pending');
    expect(payload.to_state).toBe('accepted');
  });

  it('does not emit event when status update is a no-op (same status)', () => {
    const db = getDb();
    insertHintIfNew(db, hint({ id: 'h-noop', status: 'pending' }));
    
    const beforeEventCount = getUnprocessedEvents(0).filter((e) => e.eventType === 'hint_state_transition').length;
    
    updateOptimizationHintStatus('h-noop', 'pending');
    
    const events = getUnprocessedEvents(0).filter((e) => e.eventType === 'hint_state_transition');
    expect(events.length).toBe(beforeEventCount); // No new event
  });
});

describe('W4-2: CairnEvent extensions for profile bumps', () => {
  it('emits profile_bump event on profile creation', () => {
    const beforeEventCount = getUnprocessedEvents(0).length;
    
    upsertExecutionProfile(profile({ skillId: 'skill-new' }));
    
    const events = getUnprocessedEvents(0);
    const profileEvents = events.filter((e) => e.eventType === 'profile_bump');
    expect(profileEvents.length).toBeGreaterThan(beforeEventCount);
    
    const lastEvent = profileEvents[profileEvents.length - 1];
    const payload = JSON.parse(lastEvent.payload);
    expect(payload.skill_id).toBe('skill-new');
    expect(payload.profile_id).toBeGreaterThan(0);
    expect(payload.bump_kind).toBe('created');
    expect(payload.granularity).toBe('per-skill');
    expect(payload.timestamp).toBeDefined();
  });

  it('emits profile_bump event on profile update', () => {
    upsertExecutionProfile(profile({ skillId: 'skill-update', sessionCount: 5 }));
    
    const beforeEventCount = getUnprocessedEvents(0).filter((e) => e.eventType === 'profile_bump').length;
    
    upsertExecutionProfile(profile({ skillId: 'skill-update', sessionCount: 10 }));
    
    const events = getUnprocessedEvents(0).filter((e) => e.eventType === 'profile_bump');
    expect(events.length).toBeGreaterThan(beforeEventCount);
    
    const lastEvent = events[events.length - 1];
    const payload = JSON.parse(lastEvent.payload);
    expect(payload.skill_id).toBe('skill-update');
    expect(payload.bump_kind).toBe('updated');
  });
});
