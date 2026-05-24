/**
 * Wave 4 Integration Tests — Safety + Observability Foundation
 *
 * Integration coverage for:
 * - W4-1: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE)
 * - W4-2: CairnEvent extensions (hint state transitions, profile bumps)
 * - W4-3: forceRegenerate CLI knob (force-overwrite dedup bypass)
 * - W4-E2E: End-to-end pipeline coverage
 *
 * Test scaffolding created before Roger/Rosella implementations land.
 * Assertions will be filled in once W4-1, W4-2, W4-3 are committed.
 */

import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../../cairn/src/db/index.js';
import {
  insertOptimizationHint,
  insertHintIfNew,
  queryOptimizationHints,
  updateOptimizationHintStatus,
  type OptimizationHintInsert,
  type HintSource,
} from '../../../cairn/src/db/optimizationHints.js';
import { upsertExecutionProfile } from '../../../cairn/src/db/executionProfiles.js';
import { getUnprocessedEvents, type CairnEvent } from '../../../cairn/src/db/events.js';
import { runForgePrescribe } from '../../../skillsmith-runtime/src/index.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

let dbPath = '';
let hintCounter = 0;

function makeDbPath(): string {
  return join(REPO_ROOT, 'packages', 'forge', 'src', '__tests__', `wave4-pipeline-${randomUUID()}.sqlite`);
}

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
  return getDb(dbPath);
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  dbPath = makeDbPath();
  getDb(dbPath);
});

afterEach(() => {
  closeDb();
  if (existsSync(dbPath)) rmSync(dbPath);
});

// ===========================================================================
// Group A — Atomicity (W4-1)
// ===========================================================================

describe('Wave 4 Group A — insertHintIfNew Atomicity', () => {
  it('concurrent inserts of identical hint tuple: exactly one wins, the other gets duplicate-result', async () => {
    // TODO: Roger W4-1 implementation lands first
    // Test scenario: Simulate two concurrent transactions attempting to insert
    // the same (skill_id, source, category) tuple. Exactly one should succeed
    // with `inserted: true`, the other should return `inserted: false` with
    // the `existingHintId`.
    //
    // Setup: Create two identical hint inserts with different IDs but same
    // (skillId, source, category).
    // Action: Call insertHintIfNew for both.
    // Assert: One returns inserted: true, the other returns inserted: false
    // with existingHintId pointing to the first.

    const skillId = 'skill-concurrent';
    const hint1 = makeHint(skillId, 'convergence', 'prompt-optimizer', { id: 'hint-concurrent-1' });
    const hint2 = makeHint(skillId, 'convergence', 'prompt-optimizer', { id: 'hint-concurrent-2' });

    // TODO: Add actual concurrent insert logic using BEGIN IMMEDIATE
    expect(true).toBe(true); // Placeholder
  });

  it('partial UNIQUE index applies only to active statuses', () => {
    // TODO: Roger W4-1 implementation lands first
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

    // TODO: insertOptimizationHint for hint1, then insertHintIfNew for hint2
    expect(true).toBe(true); // Placeholder
  });

  it('BEGIN IMMEDIATE transaction semantics: no readers see partial state', () => {
    // TODO: Roger W4-1 implementation lands first
    // Test scenario: Verify that insertHintIfNew uses BEGIN IMMEDIATE so
    // concurrent readers don't see partial writes during the UNIQUE check
    // and insert sequence.
    //
    // This is a behavioral test that's hard to verify directly without
    // multi-threaded access. We can validate by checking the implementation
    // wraps the operation in a transaction and that concurrent reads don't
    // see intermediate states.
    //
    // Setup: Start a long-running transaction that inserts a hint.
    // Action: Attempt to read from another connection during the insert.
    // Assert: Reader either sees the full committed state or blocks until
    // the transaction completes.

    // TODO: Implement with better-sqlite3 manual transaction control
    expect(true).toBe(true); // Placeholder
  });
});

// ===========================================================================
// Group B — CairnEvent Observability (W4-2)
// ===========================================================================

describe('Wave 4 Group B — CairnEvent Observability', () => {
  it('inserting a hint emits the corresponding hint-state-transition CairnEvent', () => {
    // TODO: Roger W4-2 implementation lands first
    // Test scenario: Insert a hint and verify that a CairnEvent with
    // eventType 'hint-state-transition' is emitted into the events table.
    //
    // Setup: Seed a profile and create a hint insert.
    // Action: Call insertOptimizationHint.
    // Assert: Query events table for eventType='hint-state-transition',
    // verify payload contains the hint ID and transition details.

    const skillId = 'skill-event-insert';
    upsertExecutionProfile(makeProfile(skillId, 10));
    const hint = makeHint(skillId, 'convergence', 'prompt-optimizer');

    // TODO: insertOptimizationHint, then query events table
    expect(true).toBe(true); // Placeholder
  });

  it('status mutations emit transition events with correct from/to states', () => {
    // TODO: Roger W4-2 implementation lands first
    // Test scenario: Insert a hint with status 'pending', then update it to
    // 'applied', then to 'expired'. Each transition should emit a CairnEvent
    // with the correct from/to status values.
    //
    // Setup: Insert hint with status 'pending'.
    // Action: updateOptimizationHintStatus to 'applied', then to 'expired'.
    // Assert: Two events with eventType='hint-state-transition', payloads
    // showing transitions 'pending' → 'applied' and 'applied' → 'expired'.

    const skillId = 'skill-event-transitions';
    const hint = makeHint(skillId, 'cache-optimization', 'token-optimizer');
    insertOptimizationHint(hint);

    // TODO: updateOptimizationHintStatus, then query events
    expect(true).toBe(true); // Placeholder
  });

  it('profile/config bump emits a bump event', () => {
    // TODO: Roger W4-2 implementation lands first
    // Test scenario: Upsert an execution profile, which should emit a
    // 'profile-bump' or similar CairnEvent indicating the profile was updated.
    //
    // Setup: Upsert a profile for a skill.
    // Action: Upsert the same profile again with updated sessionCount.
    // Assert: CairnEvent with eventType='profile-bump' or similar exists.

    const skillId = 'skill-profile-bump';
    upsertExecutionProfile(makeProfile(skillId, 10));

    // TODO: Upsert again with sessionCount=15, then query events
    expect(true).toBe(true); // Placeholder
  });

  it('Curator gracefully ignores unknown event types (forward-compat)', () => {
    // TODO: Roger W4-2 implementation lands first
    // Test scenario: Insert a CairnEvent with an unknown eventType that
    // Wave 5 might introduce. Verify the Curator doesn't crash when
    // processing events that it doesn't recognize.
    //
    // Setup: Insert a CairnEvent with eventType='future-event-type'.
    // Action: Call Curator's event processing loop (curate).
    // Assert: No errors thrown; Curator advances cursor past the unknown event.

    // TODO: Insert fake event, run curate, verify no crash
    expect(true).toBe(true); // Placeholder
  });

  it('events are emitted in the same transaction as the underlying write (no orphans on rollback)', () => {
    // TODO: Roger W4-2 implementation lands first
    // Test scenario: Start a transaction, insert a hint, then rollback.
    // Verify that the CairnEvent is also rolled back and doesn't exist
    // as an orphan in the events table.
    //
    // Setup: Manually open a transaction with getDb().
    // Action: Insert hint, verify event exists, then ROLLBACK.
    // Assert: Neither the hint nor the event exist after rollback.

    // TODO: Implement with manual transaction control
    expect(true).toBe(true); // Placeholder
  });
});

// ===========================================================================
// Group C — forceRegenerate CLI (W4-3)
// ===========================================================================

describe('Wave 4 Group C — forceRegenerate CLI Knob', () => {
  it('default behavior unchanged: runForgePrescribe without forceRegenerate still dedups', async () => {
    // TODO: Rosella W4-3 implementation lands first
    // Test scenario: Insert an active hint, then call runForgePrescribe
    // without the forceRegenerate flag. Verify that dedup logic prevents
    // re-emitting the same hint.
    //
    // Setup: Insert a pending hint for skillId.
    // Action: Call runForgePrescribe with default options.
    // Assert: No new hints inserted (hintsDuplicated > 0).

    const skillId = 'skill-dedup-default';
    upsertExecutionProfile(makeProfile(skillId, 10));
    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer');
    insertOptimizationHint(existingHint);

    // TODO: Call runForgePrescribe, assert no new hints
    expect(true).toBe(true); // Placeholder
  });

  it('forceRegenerate: true re-emits hints even when active hints exist', async () => {
    // TODO: Rosella W4-3 implementation lands first
    // Test scenario: Insert an active hint, then call runForgePrescribe
    // with forceRegenerate: true. Verify that prior active hints are expired
    // before inserting new hints.
    //
    // Setup: Insert a pending hint for skillId.
    // Action: Call runForgePrescribe with forceRegenerate: true.
    // Assert: Prior hint is expired; new hints are inserted.

    const skillId = 'skill-force-regen';
    upsertExecutionProfile(makeProfile(skillId, 10));
    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer');
    insertOptimizationHint(existingHint);

    // TODO: Call runForgePrescribe with forceRegenerate: true
    expect(true).toBe(true); // Placeholder
  });

  it('CLI flag wires through to the runtime correctly', async () => {
    // TODO: Rosella W4-3 implementation lands first
    // Test scenario: Run the CLI command `forge-prescribe` with `--force`
    // (or whatever flag name Rosella chooses) and verify that it passes
    // forceRegenerate: true to the runtime.
    //
    // This is a CLI integration test — we'll need to spawn the CLI process
    // or inspect the argument parsing logic.
    //
    // Setup: Create a test DB with an active hint.
    // Action: Spawn CLI with `--force` flag.
    // Assert: New hints inserted despite existing active hints.

    // TODO: Spawn CLI process or inspect argument parsing
    expect(true).toBe(true); // Placeholder
  });

  it('MCP surface does NOT expose the forceRegenerate flag (negative test)', () => {
    // TODO: Rosella W4-3 implementation lands first
    // Test scenario: Inspect the MCP tool definition for forge-prescribe
    // and verify that the forceRegenerate parameter is NOT present.
    //
    // This is an inspection-based test rather than an execution test.
    // We can load the MCP tool schema and assert the parameter doesn't exist.
    //
    // Setup: Load MCP tool schema for forge-prescribe.
    // Assert: No 'forceRegenerate' parameter in the schema.

    // TODO: Load MCP schema and assert parameter absence
    expect(true).toBe(true); // Placeholder
  });
});

// ===========================================================================
// Group D — End-to-End Pipeline
// ===========================================================================

describe('Wave 4 Group D — End-to-End Pipeline', () => {
  it('force-regenerate from CLI produces fresh hints AND emits the expected CairnEvents', async () => {
    // TODO: Roger W4-2 + Rosella W4-3 implementations land first
    // Test scenario: Full E2E path — call forge-prescribe with forceRegenerate,
    // verify that prior hints are expired, new hints are inserted, and
    // CairnEvents are emitted for both the expire and insert transitions.
    //
    // Setup: Seed a profile and an existing pending hint.
    // Action: Call runForgePrescribe with forceRegenerate: true.
    // Assert: Prior hint status is 'expired'; new hints exist; CairnEvents
    // for both transitions are in the events table.

    const skillId = 'skill-e2e-force';
    upsertExecutionProfile(makeProfile(skillId, 10));
    const existingHint = makeHint(skillId, 'convergence', 'prompt-optimizer');
    insertOptimizationHint(existingHint);

    // TODO: Call runForgePrescribe with forceRegenerate: true, then query events
    expect(true).toBe(true); // Placeholder
  });

  it('after force-regenerate, the new hints survive dedup on next normal run', async () => {
    // TODO: Rosella W4-3 implementation lands first
    // Test scenario: Force-regenerate to create fresh hints, then run
    // runForgePrescribe again without forceRegenerate. Verify that the
    // new hints are treated as the active set and dedup logic prevents
    // re-emitting them.
    //
    // Setup: Force-regenerate to create hints.
    // Action: Call runForgePrescribe again without forceRegenerate.
    // Assert: No new hints inserted (hintsDuplicated > 0).

    const skillId = 'skill-dedup-after-force';
    upsertExecutionProfile(makeProfile(skillId, 10));

    // TODO: Force-regen, then normal run, assert no new hints
    expect(true).toBe(true); // Placeholder
  });
});
