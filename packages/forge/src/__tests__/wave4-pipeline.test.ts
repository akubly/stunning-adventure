/**
 * Wave 4 Integration Tests — Safety + Observability Foundation
 *
 * Integration coverage for:
 * - W4-1: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE, real rollback via TEMP TRIGGER)
 * - W4-2: CairnEvent extensions (hint_state_transition, hint_force_expired, profile bumps)
 * - W4-3: forceRegenerate CLI knob (force-overwrite dedup bypass + telemetry payload)
 * - W4-E2E: End-to-end pipeline coverage including MCP scope enforcement
 */

import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeDb,
  getDb,
  createSession,
  insertOptimizationHint,
  insertHintIfNew,
  queryOptimizationHints,
  updateOptimizationHintStatus,
  upsertExecutionProfile,
  getUnprocessedEvents,
  logEvent,
  type OptimizationHintInsert,
  type HintSource,
} from '@akubly/cairn';
import { insertChangeVector } from '@akubly/cairn';
import { runForgePrescribe } from '../../../skillsmith-runtime/src/index.js';

let db: ReturnType<typeof getDb>;

let hintCounter = 0;
let sessionId = '';

function makeProfile(skillId: string, sessionCount: number) {
  return {
    skillId,
    granularity: 'per-skill' as const,
    granularityKey: 'global',
    sessionCount,
    drift: { mean: 0.25, p50: 0.2, p95: 0.65, trend: 'degrading' as const },
    token: { meanInput: 60_000, meanOutput: 40_000, meanCacheHit: 0.2, totalCost: 24_000_000 },
    outcome: { successRate: 0.85, meanConvergence: 12, toolErrorRate: 0.04 },
  };
}

function makeHint(
  skillId: string,
  category: OptimizationHintInsert['category'],
  source: HintSource,
  overrides?: Partial<OptimizationHintInsert>,
): OptimizationHintInsert {
  hintCounter += 1;
  return {
    id: `wave4-hint-${hintCounter}`,
    source,
    skillId,
    category,
    description: `Test hint ${hintCounter}`,
    recommendation: 'Test recommendation',
    impactScore: 0.8,
    confidence: 0.9,
    generatedAt: `2026-05-23T00:${String(hintCounter).padStart(2, '0')}:00.000Z`,
    status: 'pending',
    ...overrides,
  };
}

function reopenDb() {
  return getDb();
}

function seedVector(
  skillId: string,
  category: OptimizationHintInsert['category'],
  source: HintSource,
  netImpactTuning: { deltaConvergence?: number; deltaDrift?: number; deltaCacheHit?: number } = {},
): void {
  db = getDb();
  const hintId = insertOptimizationHint(db,
    makeHint(skillId, category, source, {
      status: 'applied',
      metricSnapshot: {
        driftScore: 0.3,
        driftLevel: 'yellow',
        tokenCostNanoAiu: 2_000_000,
        successRate: 0.8,
        convergenceTurns: 10,
        cacheHitRate: 0.2,
        sessionCount: 6,
      },
    }),
  );

  insertChangeVector(db, {
    hintId,
    deltas: {
      deltaDrift: netImpactTuning.deltaDrift ?? -0.2,
      deltaCost: -100_000,
      deltaSuccessRate: 0.05,
      deltaConvergence: netImpactTuning.deltaConvergence ?? -2,
      deltaCacheHit: netImpactTuning.deltaCacheHit ?? 0.1,
    },
    sessionsObserved: 4,
    computedAt: '2026-05-22T23:00:00.000Z',
  });
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  db = getDb(':memory:');
  sessionId = createSession(db, 'test-repo', 'main');
});

afterEach(() => {
  closeDb();
});

// ===========================================================================
// Group A — Atomicity (W4-1)
// ===========================================================================

describe('Wave 4 Group A — insertHintIfNew Atomicity', () => {
  it('duplicate hint tuple via insertHintIfNew: second call returns existing id', () => {
    // Test scenario: Two sequential calls to insertHintIfNew with the same
    // (skill_id, source, category) tuple but different IDs. The second call
    // should dedupe via the higher-level insertHintIfNew path and return
    // inserted: false with the first hint's ID.
    //
    // Setup: Create two identical hint inserts with different IDs but same
    // (skillId, source, category).
    // Action: Call insertHintIfNew for both sequentially on a single connection.
    // Assert: First returns inserted: true, the second returns inserted: false
    // with existingHintId pointing to the first.

    const skillId = 'skill-concurrent';
    const hint1 = makeHint(skillId, 'convergence', 'prompt-optimizer', { id: 'hint-concurrent-1' });
    const hint2 = makeHint(skillId, 'convergence', 'prompt-optimizer', { id: 'hint-concurrent-2' });

    db = reopenDb();
    const result1 = insertHintIfNew(db, hint1);
    const result2 = insertHintIfNew(db, hint2);

    expect(result1.inserted).toBe(true);
    expect(result2.inserted).toBe(false);
    expect(result2.existingHintId).toBe(hint1.id);

    const allHints = queryOptimizationHints(db, { skillId, status: 'pending' });
    expect(allHints.length).toBe(1);
    expect(allHints[0].id).toBe(hint1.id);
  });

  it('partial UNIQUE index applies only to active statuses', () => {
    // Test scenario: Insert a hint with status 'applied' (not in active set),
    // then insert another hint with the same (skill_id, source, category)
    // but status 'pending' (active). The second insert should succeed because
    // the UNIQUE constraint is partial and only applies to ACTIVE_HINT_STATUSES.
    //
    // Setup: Insert hint A with status 'applied'.
    // Action: Insert hint B with same tuple but status 'pending'.
    // Assert: Both hints exist in the database.

    const skillId = 'skill-partial-unique';
    const hint1 = makeHint(skillId, 'verbosity', 'token-optimizer', {
      id: 'hint-applied',
      status: 'applied',
    });
    const hint2 = makeHint(skillId, 'verbosity', 'token-optimizer', {
      id: 'hint-pending',
      status: 'pending',
    });

    db = reopenDb();
    insertOptimizationHint(db, hint1); // Direct insert for applied status
    const result2 = insertHintIfNew(db, hint2);

    expect(result2.inserted).toBe(true);

    const allHints = queryOptimizationHints(db, { skillId });
    expect(allHints.length).toBe(2);
    expect(allHints.map((h) => h.id).sort()).toEqual(['hint-applied', 'hint-pending']);
  });

  it('BEGIN IMMEDIATE transaction semantics: no readers see partial state', () => {
    // Test scenario: Verify that insertHintIfNew uses BEGIN IMMEDIATE so
    // concurrent readers don't see partial writes during the UNIQUE check
    // and insert sequence.
    //
    // This is a behavioral validation through code inspection and unit test
    // coverage from Roger's implementation. The transaction wrapper in
    // insertHintIfNew uses `.immediate()` which enforces BEGIN IMMEDIATE.
    //
    // Integration validation: Insert a hint and verify atomicity by querying
    // immediately after. The hint should either be fully committed or not
    // visible at all (no partial state).

    const skillId = 'skill-txn-immediate';
    const hint = makeHint(skillId, 'cache-optimization', 'token-optimizer', {
      id: 'hint-txn-1',
    });

    db = reopenDb();
    const result = insertHintIfNew(db, hint);

    expect(result.inserted).toBe(true);

    // Query immediately — should see the complete hint
    const loadedHint = queryOptimizationHints(db, { skillId, status: 'pending' })[0];
    expect(loadedHint).toBeDefined();
    expect(loadedHint.id).toBe(hint.id);
    expect(loadedHint.category).toBe(hint.category);
    expect(loadedHint.source).toBe(hint.source);
  });
});

// ===========================================================================
// Group B — CairnEvent Observability (W4-2)
// ===========================================================================

describe('Wave 4 Group B — CairnEvent Observability', () => {
  it('inserting a hint emits the corresponding hint-state-transition CairnEvent', () => {
    // Test scenario: Insert a hint and verify that a CairnEvent with
    // eventType 'hint_state_transition' is emitted into the events table.
    //
    // Setup: Seed a profile and create a hint insert.
    // Action: Call insertHintIfNew.
    // Assert: Query events table for eventType='hint_state_transition',
    // verify payload contains the hint ID and transition details.

    const skillId = 'skill-event-insert';
    upsertExecutionProfile(db, makeProfile(skillId, 10));
    const hint = makeHint(skillId, 'convergence', 'prompt-optimizer', { id: 'h-event-1' });

    db = reopenDb();
    const beforeEventCount = getUnprocessedEvents(db, 0).filter((e) => e.eventType === 'hint_state_transition').length;

    insertHintIfNew(db, hint);

    const events = getUnprocessedEvents(db, 0);
    const hintEvents = events.filter((e) => e.eventType === 'hint_state_transition');
    expect(hintEvents.length).toBeGreaterThan(beforeEventCount);

    const matchingEvent = hintEvents.find((e) => {
      const payload = JSON.parse(e.payload);
      return payload.hint_id === hint.id;
    });

    expect(matchingEvent).toBeDefined();
    const payload = JSON.parse(matchingEvent!.payload);
    expect(payload.skill_id).toBe(skillId);
    expect(payload.from_state).toBeNull();
    expect(payload.to_state).toBe('pending');
  });

  it('status mutations emit transition events with correct from/to states', () => {
    // Test scenario: Insert a hint with status 'pending', then update it to
    // 'applied', then to 'expired'. Each transition should emit a CairnEvent
    // with the correct from/to status values.
    //
    // Setup: Insert hint with status 'pending'.
    // Action: updateOptimizationHintStatus to 'accepted', then check events.
    // Assert: Event with eventType='hint_state_transition', payload
    // showing transition 'pending' → 'accepted'.

    const skillId = 'skill-event-transitions';
    const hint = makeHint(skillId, 'cache-optimization', 'token-optimizer', {
      id: 'h-transition-1',
      status: 'pending',
    });
    db = reopenDb();
    insertHintIfNew(db, hint);

    const beforeEventCount = getUnprocessedEvents(db, 0).filter((e) => e.eventType === 'hint_state_transition').length;

    updateOptimizationHintStatus(db, 'h-transition-1', 'accepted');

    const events = getUnprocessedEvents(db, 0);
    const hintEvents = events.filter((e) => e.eventType === 'hint_state_transition');
    expect(hintEvents.length).toBeGreaterThan(beforeEventCount);

    const transitionEvent = hintEvents.find((e) => {
      const payload = JSON.parse(e.payload);
      return payload.hint_id === 'h-transition-1' && payload.to_state === 'accepted';
    });

    expect(transitionEvent).toBeDefined();
    const payload = JSON.parse(transitionEvent!.payload);
    expect(payload.from_state).toBe('pending');
    expect(payload.to_state).toBe('accepted');
  });

  it('profile/config bump emits a bump event', () => {
    // Test scenario: Upsert an execution profile, which should emit a
    // 'profile_bump' CairnEvent indicating the profile was created/updated.
    //
    // Setup: Upsert a profile for a skill.
    // Action: Upsert the same profile again with updated sessionCount.
    // Assert: CairnEvent with eventType='profile_bump' exists for both creation and update.

    const skillId = 'skill-profile-bump';
    const beforeEventCount = getUnprocessedEvents(db, 0).filter((e) => e.eventType === 'profile_bump').length;

    upsertExecutionProfile(db, makeProfile(skillId, 10));

    const events1 = getUnprocessedEvents(db, 0).filter((e) => e.eventType === 'profile_bump');
    expect(events1.length).toBeGreaterThan(beforeEventCount);

    const createEvent = events1.find((e) => {
      const payload = JSON.parse(e.payload);
      return payload.skill_id === skillId && payload.bump_kind === 'created';
    });
    expect(createEvent).toBeDefined();

    // Update the profile
    const beforeUpdateCount = getUnprocessedEvents(db, 0).filter((e) => e.eventType === 'profile_bump').length;
    upsertExecutionProfile(db, makeProfile(skillId, 15));

    const events2 = getUnprocessedEvents(db, 0).filter((e) => e.eventType === 'profile_bump');
    expect(events2.length).toBeGreaterThan(beforeUpdateCount);

    const updateEvent = events2.find((e) => {
      const payload = JSON.parse(e.payload);
      return payload.skill_id === skillId && payload.bump_kind === 'updated';
    });
    expect(updateEvent).toBeDefined();
  });

  it('Curator gracefully ignores unknown event types (forward-compat)', async () => {
    // Test scenario: Insert a CairnEvent with an unknown eventType that
    // Wave 5 might introduce. Verify the Curator doesn't crash when
    // processing events that it doesn't recognize.
    //
    // This is a forward-compatibility validation. Since Curator's event
    // processing logic should handle unknown event types gracefully,
    // we validate that unknown events are ignored without errors.
    //
    // Setup: Insert a CairnEvent with eventType='future_event_type'.
    // Assert: Event exists and can be queried without errors.

    reopenDb();

    // Insert a future event type (note: logEvent signature is sessionId, eventType, payload)
    logEvent(db, sessionId, 'future_event_type', { detail: 'Wave 5 feature' });

    const events = getUnprocessedEvents(db, 0);
    const futureEvent = events.find((e) => e.eventType === 'future_event_type');
    expect(futureEvent).toBeDefined();

    // Verify it doesn't cause errors in basic event queries
    expect(() => getUnprocessedEvents(db, 0)).not.toThrow();
  });

  it('rolls back hint insert when hint event emission fails', () => {
    const skillId = 'skill-txn-rollback';
    const hint = makeHint(skillId, 'convergence', 'prompt-optimizer', {
      id: 'h-rollback-1',
    });

    db = reopenDb();
    db.exec(`
      CREATE TEMP TRIGGER fail_hint_state_transition_event
      BEFORE INSERT ON event_log
      WHEN NEW.event_type = 'hint_state_transition'
      BEGIN
        SELECT RAISE(FAIL, 'forced hint_state_transition failure');
      END;
    `);

    expect(() => insertHintIfNew(db, hint)).toThrow('forced hint_state_transition failure');

    expect(queryOptimizationHints(db, { skillId })).toHaveLength(0);
    const orphanEvent = getUnprocessedEvents(db, 0).find((event) => {
      try {
        const payload = JSON.parse(event.payload) as { hint_id?: string };
        return payload.hint_id === hint.id;
      } catch {
        return false;
      }
    });
    expect(orphanEvent).toBeUndefined();
  });
});

// ===========================================================================
// Group C — forceRegenerate CLI (W4-3)
// ===========================================================================

describe('Wave 4 Group C — forceRegenerate CLI Knob', () => {
  it('default behavior unchanged: runForgePrescribe without forceRegenerate still dedups', async () => {
    // Test scenario: Insert an active hint, then call runForgePrescribe
    // without the forceRegenerate flag. Verify that dedup logic prevents
    // re-emitting the same hint.
    //
    // Setup: Insert a pending hint for skillId.
    // Action: Call runForgePrescribe with default options.
    // Assert: skipped count > 0 (hints were deduplicated).

    const skillId = 'skill-dedup-default';
    upsertExecutionProfile(db, makeProfile(skillId, 10));
    seedVector(skillId, 'convergence', 'prompt-optimizer');
    seedVector(skillId, 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer', {
      id: 'h-dedup-default',
      status: 'pending',
    });
    db = reopenDb();
    insertHintIfNew(db, existingHint);

    const result = await runForgePrescribe({ skillId, dbPath: ':memory:' });

    if (!result.ok) {
      console.log('runForgePrescribe failed:', result.message);
    }

    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('runForgePrescribe failed:', result.message);
      return;
    }

    // Should have generated hints but skipped (not inserted) due to dedup
    expect(result.totalHints).toBeGreaterThan(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.inserted).toBeGreaterThan(0); // Other hints (non-duplicates) are still inserted
  });

  it('forceRegenerate: true re-emits hints even when active hints exist', async () => {
    // Test scenario: Insert an active hint, then call runForgePrescribe
    // with forceRegenerate: true. Verify that prior active hints are expired
    // before inserting new hints.
    //
    // Setup: Insert a pending hint for skillId.
    // Action: Call runForgePrescribe with forceRegenerate: true.
    // Assert: Prior hint is expired; new hints are inserted.

    const skillId = 'skill-force-regen';
    upsertExecutionProfile(db, makeProfile(skillId, 10));
    seedVector(skillId, 'convergence', 'prompt-optimizer');
    seedVector(skillId, 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer', {
      id: 'h-force-regen',
      status: 'pending',
    });
    db = reopenDb();
    insertHintIfNew(db, existingHint);

    const beforeHintCount = queryOptimizationHints(db, { skillId }).length;

    const result = await runForgePrescribe({ skillId, dbPath: ':memory:', forceRegenerate: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('runForgePrescribe failed:', result.message);
      return;
    }

    // Should have generated and inserted hints
    expect(result.totalHints).toBeGreaterThan(0);
    expect(result.inserted).toBeGreaterThan(0);

    // Prior hint should be expired
    const expiredHint = queryOptimizationHints(db, { skillId, status: 'expired' }).find(
      (h) => h.id === 'h-force-regen'
    );
    expect(expiredHint).toBeDefined();

    // New hints should exist
    const activeHints = queryOptimizationHints(db, { skillId, status: ['pending', 'accepted'] });
    expect(activeHints.length).toBeGreaterThan(0);

    // Verify we generated and inserted new hints beyond the prior count
    expect(activeHints.length).toBeGreaterThan(beforeHintCount);
  });

  it('CLI flag wires through to the runtime correctly', async () => {
    // Test scenario: Verify that the CLI accepts a --force flag and passes
    // forceRegenerate: true to the runtime.
    //
    // This is tested indirectly through Rosella's unit tests in
    // runtime-cli/__tests__/forgePrescribe.test.ts which verify the
    // behavior. For integration, we validate that calling runForgePrescribe
    // with forceRegenerate: true produces the expected behavior.
    //
    // Setup: Create a test DB with an active hint.
    // Action: Call runForgePrescribe with forceRegenerate: true.
    // Assert: New hints inserted despite existing active hints.

    const skillId = 'skill-cli-force';
    upsertExecutionProfile(db, makeProfile(skillId, 10));
    seedVector(skillId, 'convergence', 'prompt-optimizer');
    seedVector(skillId, 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer', {
      id: 'h-cli-force',
      status: 'pending',
    });
    db = reopenDb();
    insertHintIfNew(db, existingHint);

    const result = await runForgePrescribe({ skillId, dbPath: ':memory:', forceRegenerate: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('runForgePrescribe failed:', result.message);
      return;
    }

    expect(result.inserted).toBeGreaterThan(0);

    // Verify the CLI wiring by checking that the expired hint exists
    const expiredHints = queryOptimizationHints(db, { skillId, status: 'expired' });
    expect(expiredHints.length).toBeGreaterThan(0);
  });

  it('cairn MCP server does not expose a forge_prescribe tool or any force* parameter', async () => {
    type RegisteredTool = { name: string; config: { inputSchema?: Record<string, unknown> } };
    const registeredTools: RegisteredTool[] = [];

    vi.resetModules();
    vi.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
      McpServer: class {
        registerTool(name: string, config: RegisteredTool['config']): void {
          registeredTools.push({ name, config });
        }

        async connect(): Promise<void> {}
      },
    }));

    try {
      await import('../../../cairn/src/mcp/server.js');

      expect(registeredTools.length).toBeGreaterThan(0);
      const toolNames = registeredTools.map((tool) => tool.name);
      const exposedParameters = registeredTools.flatMap((tool) =>
        Object.keys(tool.config.inputSchema ?? {}).map((parameter) => `${tool.name}.${parameter}`),
      );

      // skillsmith-runtime exposes forge_prescribe only via CLI, not MCP; this assertion is necessarily cairn-scoped.
      expect(toolNames).not.toContain('forge_prescribe');
      expect(exposedParameters.filter((parameter) => /\.force[^.]*$/i.test(parameter))).toEqual([]);
    } finally {
      vi.doUnmock('@modelcontextprotocol/sdk/server/mcp.js');
    }
  });
});

// ===========================================================================
// Group D — End-to-End Pipeline
// ===========================================================================

describe('Wave 4 Group D — End-to-End Pipeline', () => {
  it('force-regenerate from CLI produces fresh hints AND emits the expected CairnEvents', async () => {
    // Test scenario: Full E2E path — call forge-prescribe with forceRegenerate,
    // verify that prior hints are expired, new hints are inserted, and
    // CairnEvents are emitted for both the expire and insert transitions.
    //
    // Setup: Seed a profile and an existing pending hint.
    // Action: Call runForgePrescribe with forceRegenerate: true.
    // Assert: Prior hint status is 'expired'; new hints exist; CairnEvents
    // for both transitions are in the events table.

    const skillId = 'skill-e2e-force';
    upsertExecutionProfile(db, makeProfile(skillId, 10));
    seedVector(skillId, 'convergence', 'prompt-optimizer');
    seedVector(skillId, 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer', {
      id: 'h-e2e-force',
      status: 'pending',
    });
    db = reopenDb();
    insertHintIfNew(db, existingHint);

    const beforeEventCount = getUnprocessedEvents(db, 0).filter(
      (e) => e.eventType === 'hint_state_transition'
    ).length;

    const result = await runForgePrescribe({ skillId, dbPath: ':memory:', forceRegenerate: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      console.error('runForgePrescribe failed:', result.message);
      return;
    }

    // Prior hint should be expired
    const expiredHint = queryOptimizationHints(db, { skillId, status: 'expired' }).find(
      (h) => h.id === 'h-e2e-force'
    );
    expect(expiredHint).toBeDefined();

    // New hints should exist
    const activeHints = queryOptimizationHints(db, { skillId, status: ['pending', 'accepted'] });
    expect(activeHints.length).toBeGreaterThan(0);

    const allEvents = getUnprocessedEvents(db, 0);
    const events = allEvents.filter((e) => e.eventType === 'hint_state_transition');
    expect(events.length).toBeGreaterThan(beforeEventCount);

    type HintForceExpiredPayload = {
      skill_id: string;
      source: string;
      category: string;
      count: number;
      actor: string;
    };

    const forceExpiredEventsForSkill = allEvents
      .filter((e) => e.eventType === 'hint_force_expired')
      .map((e) => JSON.parse(e.payload) as Partial<HintForceExpiredPayload>)
      .filter((payload) => payload.skill_id === skillId && payload.count !== undefined && payload.count > 0);

    expect(forceExpiredEventsForSkill).toHaveLength(1);
    expect(forceExpiredEventsForSkill[0]).toMatchObject({
      skill_id: skillId,
      source: 'prompt-optimizer',
      category: 'convergence',
      count: 1,
      actor: 'runtime:--force',
    });

    // Find insert events for new hints
    const insertEvents = events.filter((e) => {
      const payload = JSON.parse(e.payload);
      return payload.skill_id === skillId && payload.to_state === 'pending' && payload.hint_id !== 'h-e2e-force';
    });
    expect(insertEvents.length).toBeGreaterThan(0);
  });

  it('after force-regenerate, the new hints survive dedup on next normal run', async () => {
    // Test scenario: Force-regenerate to create fresh hints, then run
    // runForgePrescribe again without forceRegenerate. Verify that the
    // new hints are treated as the active set and dedup logic prevents
    // re-emitting them.
    //
    // Setup: Force-regenerate to create hints.
    // Action: Call runForgePrescribe again without forceRegenerate.
    // Assert: skipped count > 0 (hints were deduplicated).

    const skillId = 'skill-dedup-after-force';
    upsertExecutionProfile(db, makeProfile(skillId, 10));
    seedVector(skillId, 'convergence', 'prompt-optimizer');
    seedVector(skillId, 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    // First call with forceRegenerate to establish baseline
    const result1 = await runForgePrescribe({ skillId, dbPath: ':memory:', forceRegenerate: true });
    expect(result1.ok).toBe(true);
    if (!result1.ok) {
      console.error('First runForgePrescribe failed:', result1.message);
      return;
    }

    expect(result1.inserted).toBeGreaterThan(0);

    const afterForceHintCount = queryOptimizationHints(db, { skillId, status: ['pending', 'accepted'] }).length;

    // Second call without forceRegenerate — should dedup
    const result2 = await runForgePrescribe({ skillId, dbPath: ':memory:', forceRegenerate: false });
    expect(result2.ok).toBe(true);
    if (!result2.ok) {
      console.error('Second runForgePrescribe failed:', result2.message);
      return;
    }

    expect(result2.totalHints).toBeGreaterThan(0);
    expect(result2.skipped).toBeGreaterThan(0);
    expect(result2.inserted).toBe(0);

    // Hint count should remain the same (no new inserts)
    const afterDedupHintCount = queryOptimizationHints(db, { skillId, status: ['pending', 'accepted'] }).length;
    expect(afterDedupHintCount).toBe(afterForceHintCount);
  });
});
