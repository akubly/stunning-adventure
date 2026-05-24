/**
 * L4 — Curator vector computation end-to-end tests.
 *
 * Tests the full flow: insert an applied optimization hint with a before
 * metric_snapshot, upsert an execution profile (the "after" state) with
 * enough post-application sessions, call await curate(), and assert that a
 * change_vector row is inserted with correct deltas and net_impact.
 *
 * Depends on Alexander A3 (changeVectors.ts) + A4 (curator integration).
 * Updated in cycle 2 for:
 *   - #1 deltaCost per-session normalization (Rosella)
 *   - #3 sessionsObserved as delta (Rosella)
 *   - #4 UNIQUE + INSERT OR IGNORE idempotence (Rosella)
 *   - #6 structured ChangeVectorSweepResult diagnostics (Rosella)
 *
 * Updated in cycle 3 for:
 *   - Legacy snapshot deltaCost skip (legacyCostSkipped counter) (Rosella)
 *   - sessions_observed clamp via Math.max(0, ...) — sessionCountReset counter (Rosella)
 *   - Migrated deprecated result.vectorsComputed → result.changeVectorSweep.computed (Laura)
 */

import type { PrescriberOrchestrationConfig, PrescriberRunResult } from '@akubly/types';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { insertOptimizationHint } from '../db/optimizationHints.js';
import { upsertExecutionProfile } from '../db/executionProfiles.js';
import { getChangeVectorsByHintId, computeNetImpact } from '../db/changeVectors.js';
import { curate } from '../agents/curator.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let hintCounter = 0;

/** Insert an optimization hint with status='applied' and a before metric snapshot. */
function insertAppliedHint(
  skillId: string,
  category: string,
  beforeSnapshot: {
    driftScore: number;
    tokenCostNanoAiu: number;
    successRate: number;
    convergenceTurns: number;
    cacheHitRate: number;
    /** Optional: session count at snapshot time (for per-session cost delta, cycle-2 #1). */
    sessionCount?: number;
  },
): string {
  hintCounter += 1;
  return insertOptimizationHint({
    id: `hint-e2e-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId,
    category,
    description: 'E2E test hint',
    recommendation: 'Do something',
    generatedAt: '2026-05-03T20:00:00.000Z',
    status: 'applied',
    metricSnapshot: beforeSnapshot,
  });
}

/** Upsert a per-skill 'global' execution profile (the "after" state). */
function upsertAfterProfile(
  skillId: string,
  sessionCount: number,
  metrics: {
    driftMean?: number;
    tokenTotalCost?: number;
    successRate?: number;
    meanConvergence?: number;
    cacheHitRate?: number;
  } = {},
): void {
  upsertExecutionProfile({
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount,
    drift: { mean: metrics.driftMean ?? 0.2, p50: 0.18, p95: 0.3, trend: 'improving' },
    token: {
      meanInput: 5_000,
      meanOutput: 1_000,
      meanCacheHit: metrics.cacheHitRate ?? 0.5,
      totalCost: metrics.tokenTotalCost ?? 80_000,
    },
    outcome: {
      successRate: metrics.successRate ?? 0.9,
      meanConvergence: metrics.meanConvergence ?? 6,
      toolErrorRate: 0.01,
    },
  });
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  getDb(':memory:');
});

afterEach(() => {
  vi.restoreAllMocks();
  closeDb();
});

// ---------------------------------------------------------------------------
// Curator sweep — change vector insertion
// ---------------------------------------------------------------------------

describe('Curator sweep — change vector computation', () => {
  it('inserts a change_vector after an applied hint has sufficient sessions (≥ minSessionsObserved default 3)', async () => {
    const hintId = insertAppliedHint('skill-a', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-a', 5, { driftMean: 0.2, tokenTotalCost: 80_000, successRate: 0.9, meanConvergence: 6, cacheHitRate: 0.5 });

    const result = await curate();

    expect(result.changeVectorSweep.computed).toBe(1);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors.length).toBe(1);
  });

  it('does NOT insert a change_vector when sessions are below minSessionsObserved (default 3)', async () => {
    const hintId = insertAppliedHint('skill-b', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-b', 2); // only 2 sessions — below minimum of 3

    const result = await curate();

    expect(result.changeVectorSweep.computed).toBe(0);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors.length).toBe(0);
  });

  it('respects configurable minSessionsObserved', async () => {
    const hintId = insertAppliedHint('skill-c', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-c', 5);

    const result = await curate({ minSessionsObserved: 5 });

    expect(result.changeVectorSweep.computed).toBe(1);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId).length).toBe(1);
  });

  it('is idempotent — running await curate() twice inserts at most one change_vector per hint', async () => {
    const hintId = insertAppliedHint('skill-d', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-d', 5);

    await curate();
    const result2 = await curate();

    expect(result2.changeVectorSweep.computed).toBe(0);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId).length).toBe(1);
  });

  it('processes multiple applied hints in one sweep — one change_vector per eligible hint', async () => {
    insertAppliedHint('skill-e', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    insertAppliedHint('skill-f', 'prompt-structure', {
      driftScore: 0.25, tokenCostNanoAiu: 90_000,
      successRate: 0.75, convergenceTurns: 10, cacheHitRate: 0.35,
    });
    upsertAfterProfile('skill-e', 5);
    upsertAfterProfile('skill-f', 4);

    const result = await curate();

    expect(result.changeVectorSweep.computed).toBe(2);
  });

  it('correctly computes delta_drift as after.drift_mean − before.driftScore', async () => {
    const before = { driftScore: 0.3, tokenCostNanoAiu: 100_000, successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4 };
    const hintId = insertAppliedHint('skill-g', 'convergence', before);
    upsertAfterProfile('skill-g', 5, { driftMean: 0.2 });

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors[0]!.deltaDrift).toBeCloseTo(0.2 - 0.3, 5); // after - before = -0.1 (improvement)
  });

  it('net_impact is the weighted sum of deltas using CHANGE_VECTOR_WEIGHTS', async () => {
    const before = { driftScore: 0.3, tokenCostNanoAiu: 100_000, successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4 };
    const hintId = insertAppliedHint('skill-h', 'convergence', before);
    upsertAfterProfile('skill-h', 5, { driftMean: 0.2, tokenTotalCost: 80_000, successRate: 0.9, meanConvergence: 6, cacheHitRate: 0.5 });

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    const v = vectors[0]!;

    const expectedNetImpact = computeNetImpact({
      deltaDrift: v.deltaDrift,
      deltaCost: v.deltaCost,
      deltaSuccessRate: v.deltaSuccessRate,
      deltaConvergence: v.deltaConvergence,
      deltaCacheHit: v.deltaCacheHit,
    });
    expect(v.netImpact).toBeCloseTo(expectedNetImpact, 5);
  });
});

// ---------------------------------------------------------------------------
// Curator sweep — only processes applied hints
// ---------------------------------------------------------------------------

describe('Curator sweep — only processes applied hints', () => {
  it('does not insert a change_vector for a hint with status pending', async () => {
    const hintId = insertOptimizationHint({
      id: 'hint-pending',
      source: 'prompt-optimizer',
      skillId: 'skill-i',
      category: 'convergence',
      description: 'pending hint',
      recommendation: 'do nothing',
      generatedAt: '2026-05-03T20:00:00.000Z',
      status: 'pending',
      metricSnapshot: { driftScore: 0.3 },
    });
    upsertAfterProfile('skill-i', 5);

    await curate();

    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('does not insert a change_vector for a hint with status rejected', async () => {
    const hintId = insertOptimizationHint({
      id: 'hint-rejected',
      source: 'prompt-optimizer',
      skillId: 'skill-j',
      category: 'convergence',
      description: 'rejected hint',
      recommendation: 'rejected',
      generatedAt: '2026-05-03T20:00:00.000Z',
      status: 'rejected',
      metricSnapshot: { driftScore: 0.3 },
    });
    upsertAfterProfile('skill-j', 5);

    await curate();

    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('does not insert a change_vector for a hint with status accepted (not yet applied)', async () => {
    const hintId = insertOptimizationHint({
      id: 'hint-accepted',
      source: 'prompt-optimizer',
      skillId: 'skill-k',
      category: 'convergence',
      description: 'accepted but not applied hint',
      recommendation: 'pending application',
      generatedAt: '2026-05-03T20:00:00.000Z',
      status: 'accepted',
      metricSnapshot: { driftScore: 0.3 },
    });
    upsertAfterProfile('skill-k', 5);

    await curate();

    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('does not insert a change_vector for an applied hint with no execution profile', async () => {
    const hintId = insertAppliedHint('skill-no-profile', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    // No upsertAfterProfile — no execution profile exists

    const result = await curate();

    expect(result.changeVectorSweep.computed).toBe(0);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Structured sweep result — Finding #6 (Phase 4.6 cycle 2)
// ---------------------------------------------------------------------------

describe('Curator sweep — structured ChangeVectorSweepResult diagnostics', () => {
  it('returns eligible=1, computed=1, all skip counts=0 for a single eligible hint', async () => {
    insertAppliedHint('skill-sr1', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-sr1', 5);

    const result = await curate();

    expect(result.changeVectorSweep.eligible).toBe(1);
    expect(result.changeVectorSweep.computed).toBe(1);
    expect(result.changeVectorSweep.computedSkillIds).toEqual(['skill-sr1']);
    expect(result.changeVectorSweep.skippedInsufficientSessions).toBe(0);
    expect(result.changeVectorSweep.skippedMalformedSnapshot).toBe(0);
    expect(result.changeVectorSweep.alreadyComputed).toBe(0);
  });

  it('skippedInsufficientSessions increments when profile has fewer than minSessions', async () => {
    insertAppliedHint('skill-sr2', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-sr2', 2); // below default minSessions=3

    const result = await curate();

    expect(result.changeVectorSweep.eligible).toBe(1);
    expect(result.changeVectorSweep.computed).toBe(0);
    expect(result.changeVectorSweep.skippedInsufficientSessions).toBe(1);
  });

  it('skippedMalformedSnapshot increments when metric_snapshot cannot be parsed', async () => {
    // Insert a hint with a malformed metric_snapshot directly via SQL (bypassing CRUD helper)
    hintCounter += 1;
    const db = getDb();
    db.prepare(
      `INSERT INTO optimization_hints (id, source, skill_id, category, description, recommendation, generated_at, status, metric_snapshot)
       VALUES (?, 'prompt-optimizer', 'skill-malformed', 'convergence', 'test', 'test', '2026-05-03T20:00:00.000Z', 'applied', ?)`
    ).run(`hint-malformed-${hintCounter}`, 'not valid JSON {{{');
    upsertAfterProfile('skill-malformed', 5);

    const result = await curate();

    expect(result.changeVectorSweep.skippedMalformedSnapshot).toBeGreaterThanOrEqual(1);
    expect(result.changeVectorSweep.computed).toBe(0);
  });

  it('second sweep skips hints that already have a change_vector — eligible=0, computed=0', async () => {
    insertAppliedHint('skill-sr3', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-sr3', 5);

    await curate(); // first sweep: computes the vector
    const result2 = await curate(); // second sweep: hint filtered out by LEFT JOIN

    // Post-fix: the LEFT JOIN excludes hints that already have a vector,
    // so they don't even appear in `eligible`. This keeps sweep cost
    // proportional to *new* work rather than the full historical applied
    // set. `alreadyComputed` is now reserved for the rare race where two
    // concurrent sweeps both pass the JOIN filter and INSERT OR IGNORE
    // resolves the tie.
    expect(result2.changeVectorSweep.eligible).toBe(0);
    expect(result2.changeVectorSweep.computed).toBe(0);
    expect(result2.changeVectorSweep.alreadyComputed).toBe(0);
    // DB still has only one vector per hint
    const db = getDb();
    const vectors = db.prepare('SELECT COUNT(*) as n FROM change_vectors WHERE hint_id LIKE ?').get('hint-e2e-%') as { n: number };
    expect(vectors.n).toBe(1);
  });

  it('eligible only counts applied hints WITHOUT an existing change_vector', async () => {
    insertAppliedHint('skill-sr4', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-sr4', 5);

    await curate(); // computes one vector
    const result2 = await curate(); // second sweep — vector exists, hint excluded

    // Post-fix: re-reading every applied hint on every await curate() call would
    // grow session-start latency linearly with total historical applied
    // hints. The LEFT JOIN filter makes eligible reflect only outstanding work.
    expect(result2.changeVectorSweep.eligible).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// curate() prescriber orchestration — Wave 3 W3-4
// ---------------------------------------------------------------------------

describe('curate prescriber orchestration', () => {
  it('preserves existing observable output when no prescriber config is passed', async () => {
    insertAppliedHint('skill-preserve', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-preserve', 5);

    // NOTE: W4-2 added system-level events (hint_state_transition, profile_bump),
    // so eventsProcessed is now >0 even when no user events exist
    await expect(curate()).resolves.toMatchObject({
      eventsProcessed: expect.any(Number), // System events are emitted
      insightsCreated: 0,
      insightsReinforced: 0,
      capped: false,
      insightsChanged: false,
      changeVectorSweep: {
        eligible: 1,
        computed: 1,
        computedSkillIds: ['skill-preserve'],
        skippedInsufficientSessions: 0,
        skippedMalformedSnapshot: 0,
        alreadyComputed: 0,
        legacyCostSkipped: 1,
        sessionCountReset: 0,
      },
    });
  });

  it('runs runForSkill once per qualifying skill and accumulates results', async () => {
    insertAppliedHint('skill-orchestrated-a', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    insertAppliedHint('skill-orchestrated-a', 'cache-optimization', {
      driftScore: 0.28,
      tokenCostNanoAiu: 90_000,
      successRate: 0.82,
      convergenceTurns: 7,
      cacheHitRate: 0.45,
    });
    insertAppliedHint('skill-orchestrated-b', 'convergence', {
      driftScore: 0.26,
      tokenCostNanoAiu: 95_000,
      successRate: 0.81,
      convergenceTurns: 7,
      cacheHitRate: 0.43,
    });
    upsertAfterProfile('skill-orchestrated-a', 5);
    upsertAfterProfile('skill-orchestrated-b', 5);

    const runForSkill = vi.fn<PrescriberOrchestrationConfig['runForSkill']>()
      .mockResolvedValueOnce({
        skillId: 'skill-orchestrated-a',
        hintsGenerated: 2,
        hintsInserted: 1,
        hintsDuplicated: 1,
        hintsError: 0,
      })
      .mockResolvedValueOnce({
        skillId: 'skill-orchestrated-b',
        hintsGenerated: 1,
        hintsInserted: 1,
        hintsDuplicated: 0,
        hintsError: 0,
      });

    const result = await curate(undefined, { runForSkill });

    expect(result.changeVectorSweep.computed).toBe(3);
    expect(result.changeVectorSweep.computedSkillIds).toEqual([
      'skill-orchestrated-a',
      'skill-orchestrated-b',
    ]);
    expect(runForSkill).toHaveBeenCalledTimes(2);
    expect(runForSkill).toHaveBeenNthCalledWith(1, 'skill-orchestrated-a', 3);
    expect(runForSkill).toHaveBeenNthCalledWith(2, 'skill-orchestrated-b', 3);
    expect(result.prescribers).toEqual([
      {
        skillId: 'skill-orchestrated-a',
        hintsGenerated: 2,
        hintsInserted: 1,
        hintsDuplicated: 1,
        hintsError: 0,
      },
      {
        skillId: 'skill-orchestrated-b',
        hintsGenerated: 1,
        hintsInserted: 1,
        hintsDuplicated: 0,
        hintsError: 0,
      },
    ] satisfies PrescriberRunResult[]);
  });

  it('fails open when one skill throws and continues processing the rest', async () => {
    insertAppliedHint('skill-fail-open-a', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    insertAppliedHint('skill-fail-open-b', 'convergence', {
      driftScore: 0.27,
      tokenCostNanoAiu: 92_000,
      successRate: 0.83,
      convergenceTurns: 7,
      cacheHitRate: 0.44,
    });
    upsertAfterProfile('skill-fail-open-a', 5);
    upsertAfterProfile('skill-fail-open-b', 5);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runForSkill = vi.fn<PrescriberOrchestrationConfig['runForSkill']>(async (skillId) => {
      if (skillId === 'skill-fail-open-a') {
        throw new Error('boom');
      }
      return {
        skillId,
        hintsGenerated: 1,
        hintsInserted: 1,
        hintsDuplicated: 0,
        hintsError: 0,
      };
    });

    const result = await curate(undefined, { runForSkill });

    expect(runForSkill).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      'curate: prescriber orchestration failed for skill skill-fail-open-a: boom',
    );
    expect(result.prescribers).toEqual([
      {
        skillId: 'skill-fail-open-a',
        hintsGenerated: 0,
        hintsInserted: 0,
        hintsDuplicated: 0,
        hintsError: 1,
      },
      {
        skillId: 'skill-fail-open-b',
        hintsGenerated: 1,
        hintsInserted: 1,
        hintsDuplicated: 0,
        hintsError: 0,
      },
    ]);
  });

  it('does not invoke runForSkill when the sweep finds no qualifying skills', async () => {
    const runForSkill = vi.fn<PrescriberOrchestrationConfig['runForSkill']>().mockResolvedValue({
      skillId: 'unused-skill',
      hintsGenerated: 0,
      hintsInserted: 0,
      hintsDuplicated: 0,
      hintsError: 0,
    });

    const result = await curate(undefined, { runForSkill });

    expect(result.changeVectorSweep.computed).toBe(0);
    expect(result.changeVectorSweep.computedSkillIds).toEqual([]);
    expect(runForSkill).not.toHaveBeenCalled();
    expect(result.prescribers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deltaCost per-session normalization — Finding #1 (Phase 4.6 cycle 2)
// ---------------------------------------------------------------------------

describe('Curator sweep — deltaCost per-session normalization', () => {
  it('deltaCost is (afterCost/afterSessions) - (beforeCost/beforeSessions), not raw total delta', async () => {
    // Pre-fix: deltaCost = total_cost_after - total_cost_before (cumulative, biased by session count).
    // Post-fix: deltaCost = perSessionCostAfter - perSessionCostBefore (normalized).
    const beforeCost = 100_000;
    const beforeSessions = 5;
    const afterCost = 200_000; // total went up (more sessions) but per-session may have improved
    const afterSessions = 10;

    const hintId = insertAppliedHint('skill-dc1', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: beforeCost,
      sessionCount: beforeSessions,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-dc1', afterSessions, { tokenTotalCost: afterCost });

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    const expectedDeltaCost = (afterCost / afterSessions) - (beforeCost / beforeSessions);
    // both per-session costs are equal (20_000 each) → deltaCost = 0
    expect(vectors[0]!.deltaCost).toBeCloseTo(expectedDeltaCost, 5);
  });

  it('deltaCost reflects improvement when per-session cost decreased even if total cost rose', async () => {
    // e.g., before: 100_000 total / 2 sessions = 50_000/session
    //        after: 120_000 total / 10 sessions = 12_000/session → improvement
    const hintId = insertAppliedHint('skill-dc2', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      sessionCount: 2,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-dc2', 10, { tokenTotalCost: 120_000 });

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    // 12_000 - 50_000 = -38_000 (improvement → negative delta → positive net_impact contribution)
    expect(vectors[0]!.deltaCost).toBeCloseTo(-38_000, 0);
  });
});

// ---------------------------------------------------------------------------
// sessionsObserved as delta — Finding #3 (Phase 4.6 cycle 2)
// ---------------------------------------------------------------------------

describe('Curator sweep — sessionsObserved is a delta (after - before session count)', () => {
  it('sessionsObserved equals (profile.session_count - snapshot.sessionCount)', async () => {
    const beforeSessions = 3;
    const afterSessions = 8;

    const hintId = insertAppliedHint('skill-so1', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      sessionCount: beforeSessions,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-so1', afterSessions);

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors[0]!.sessionsObserved).toBe(afterSessions - beforeSessions); // 5
  });

  it('sessionsObserved equals profile.session_count when snapshot has no sessionCount (legacy)', async () => {
    // Legacy snapshots without sessionCount: snapshotSessionCount defaults to 0.
    // sessionsObserved = profile.session_count - 0 = profile.session_count.
    const hintId = insertAppliedHint('skill-so2', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      // no sessionCount field
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-so2', 7);

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors[0]!.sessionsObserved).toBe(7); // 7 - 0 = 7
  });
});

// ---------------------------------------------------------------------------
// Legacy snapshot cost-delta skip — cycle-3 (Rosella)
//
// Snapshots from Phase 4.5 and earlier do not carry `sessionCount`. Without it,
// per-session cost normalization is impossible. sweepChangeVectors sets deltaCost=0
// and increments legacyCostSkipped for these hints. Other deltas remain valid.
// ---------------------------------------------------------------------------

describe('Curator sweep — legacy snapshot deltaCost handling', () => {
  it('snapshot WITHOUT sessionCount field → deltaCost=0 and legacyCostSkipped increments', async () => {
    const hintId = insertAppliedHint('skill-lc1', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      // no sessionCount field — legacy snapshot
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-lc1', 5, { tokenTotalCost: 200_000 });

    const result = await curate();

    expect(result.changeVectorSweep.legacyCostSkipped).toBe(1);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors.length).toBe(1);
    // deltaCost must be 0 — cumulative cost subtraction would be meaningless
    expect(vectors[0]!.deltaCost).toBe(0);
  });

  it('snapshot WITH sessionCount=0 → same handling as undefined (deltaCost=0, legacyCostSkipped++)', async () => {
    const hintId = insertAppliedHint('skill-lc2', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      sessionCount: 0, // explicitly zero — treated as legacy
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-lc2', 5, { tokenTotalCost: 200_000 });

    const result = await curate();

    expect(result.changeVectorSweep.legacyCostSkipped).toBe(1);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors.length).toBe(1);
    expect(vectors[0]!.deltaCost).toBe(0);
  });

  it('other deltas (drift, successRate, convergence, cacheHit) are still computed when cost is skipped', async () => {
    // Even with a legacy snapshot, non-cost deltas are rates/means that remain meaningful.
    const hintId = insertAppliedHint('skill-lc3', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      // no sessionCount — legacy
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-lc3', 5, {
      driftMean: 0.15,
      successRate: 0.9,
      meanConvergence: 5,
      cacheHitRate: 0.6,
    });

    await curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    const v = vectors[0]!;
    expect(v.deltaCost).toBe(0);
    expect(v.deltaDrift).toBeCloseTo(0.15 - 0.3, 5);     // -0.15 (improved)
    expect(v.deltaSuccessRate).toBeCloseTo(0.9 - 0.8, 5); // +0.1 (improved)
    expect(v.deltaConvergence).toBeCloseTo(5 - 8, 5);     // -3 (improved)
    expect(v.deltaCacheHit).toBeCloseTo(0.6 - 0.4, 5);   // +0.2 (improved)
  });

  it('snapshot WITH sessionCount > 0 → cost delta computed normally (not skipped)', async () => {
    // Regression guard: modern snapshots with sessionCount must not trigger legacyCostSkipped.
    const hintId = insertAppliedHint('skill-lc4', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      sessionCount: 5,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-lc4', 10, { tokenTotalCost: 120_000 });

    const result = await curate();

    expect(result.changeVectorSweep.legacyCostSkipped).toBe(0);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    // afterPerSession = 120_000/10 = 12_000; beforePerSession = 100_000/5 = 20_000
    // deltaCost = 12_000 - 20_000 = -8_000 (improvement)
    expect(vectors[0]!.deltaCost).toBeCloseTo(-8_000, 0);
  });
});

// ---------------------------------------------------------------------------
// sessions_observed clamp — cycle-3 (Rosella)
//
// When profile.session_count < snapshot.sessionCount (counter reset or data anomaly),
// sessionsObserved is clamped to 0 via Math.max(0, ...) and sessionCountReset increments.
// ---------------------------------------------------------------------------

describe('Curator sweep — sessions_observed clamp on counter reset', () => {
  it('profile.session_count < snapshot.sessionCount → sessionCountReset increments and hint is skipped', async () => {
    // Scenario: snapshot recorded at 100 sessions; profile reset to 50 sessions.
    // Post-fix (Copilot review #3): the reliability gate now compares
    // post-hint sessions (profile - snapshot) against minSessionsObserved.
    // A counter reset yields a negative delta, which can never satisfy any
    // non-negative threshold — the hint is skipped as insufficient sessions.
    // sessionCountReset is still incremented as a diagnostic so operators
    // can see the anomaly.
    const hintId = insertAppliedHint('skill-scr1', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      sessionCount: 100, // snapshot taken at 100 sessions
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    // Profile now shows only 50 sessions — counter reset or data anomaly
    upsertAfterProfile('skill-scr1', 50);

    const result = await curate();

    expect(result.changeVectorSweep.sessionCountReset).toBe(1);
    expect(result.changeVectorSweep.skippedInsufficientSessions).toBe(1);
    expect(result.changeVectorSweep.computed).toBe(0);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('profile.session_count === snapshot.sessionCount → 0 post-hint sessions, hint skipped', async () => {
    // Edge: equal counts → 0 post-hint sessions → below default minSessions=3.
    // Post-fix the hint is skipped; sessionCountReset does NOT fire (delta = 0, not negative).
    const hintId = insertAppliedHint('skill-scr2', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      sessionCount: 5,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-scr2', 5);

    const result = await curate();

    expect(result.changeVectorSweep.sessionCountReset).toBe(0);
    expect(result.changeVectorSweep.skippedInsufficientSessions).toBe(1);
    expect(result.changeVectorSweep.computed).toBe(0);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });
});
