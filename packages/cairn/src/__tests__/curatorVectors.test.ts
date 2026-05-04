/**
 * L4 — Curator vector computation end-to-end tests.
 *
 * Tests the full flow: insert an applied optimization hint with a before
 * metric_snapshot, upsert an execution profile (the "after" state) with
 * enough post-application sessions, call curate(), and assert that a
 * change_vector row is inserted with correct deltas and net_impact.
 *
 * Depends on Alexander A3 (changeVectors.ts) + A4 (curator integration).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  closeDb();
});

// ---------------------------------------------------------------------------
// Curator sweep — change vector insertion
// ---------------------------------------------------------------------------

describe('Curator sweep — change vector computation', () => {
  it('inserts a change_vector after an applied hint has sufficient sessions (≥ minSessionsObserved default 3)', () => {
    const hintId = insertAppliedHint('skill-a', 'convergence', {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-a', 5, { driftMean: 0.2, tokenTotalCost: 80_000, successRate: 0.9, meanConvergence: 6, cacheHitRate: 0.5 });

    const result = curate();

    expect(result.vectorsComputed).toBe(1);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors.length).toBe(1);
  });

  it('does NOT insert a change_vector when sessions are below minSessionsObserved (default 3)', () => {
    const hintId = insertAppliedHint('skill-b', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-b', 2); // only 2 sessions — below minimum of 3

    const result = curate();

    expect(result.vectorsComputed).toBe(0);
    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors.length).toBe(0);
  });

  it('respects configurable minSessionsObserved', () => {
    const hintId = insertAppliedHint('skill-c', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-c', 5);

    const result = curate({ minSessionsObserved: 5 });

    expect(result.vectorsComputed).toBe(1);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId).length).toBe(1);
  });

  it('is idempotent — running curate() twice inserts at most one change_vector per hint', () => {
    const hintId = insertAppliedHint('skill-d', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    upsertAfterProfile('skill-d', 5);

    curate();
    const result2 = curate();

    expect(result2.vectorsComputed).toBe(0);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId).length).toBe(1);
  });

  it('processes multiple applied hints in one sweep — one change_vector per eligible hint', () => {
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

    const result = curate();

    expect(result.vectorsComputed).toBe(2);
  });

  it('correctly computes delta_drift as after.drift_mean − before.driftScore', () => {
    const before = { driftScore: 0.3, tokenCostNanoAiu: 100_000, successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4 };
    const hintId = insertAppliedHint('skill-g', 'convergence', before);
    upsertAfterProfile('skill-g', 5, { driftMean: 0.2 });

    curate();

    const db = getDb();
    const vectors = getChangeVectorsByHintId(db, hintId);
    expect(vectors[0]!.deltaDrift).toBeCloseTo(0.2 - 0.3, 5); // after - before = -0.1 (improvement)
  });

  it('net_impact is the weighted sum of deltas using CHANGE_VECTOR_WEIGHTS', () => {
    const before = { driftScore: 0.3, tokenCostNanoAiu: 100_000, successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4 };
    const hintId = insertAppliedHint('skill-h', 'convergence', before);
    upsertAfterProfile('skill-h', 5, { driftMean: 0.2, tokenTotalCost: 80_000, successRate: 0.9, meanConvergence: 6, cacheHitRate: 0.5 });

    curate();

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
  it('does not insert a change_vector for a hint with status pending', () => {
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

    curate();

    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('does not insert a change_vector for a hint with status rejected', () => {
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

    curate();

    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('does not insert a change_vector for a hint with status accepted (not yet applied)', () => {
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

    curate();

    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });

  it('does not insert a change_vector for an applied hint with no execution profile', () => {
    const hintId = insertAppliedHint('skill-no-profile', 'convergence', {
      driftScore: 0.3, tokenCostNanoAiu: 100_000,
      successRate: 0.8, convergenceTurns: 8, cacheHitRate: 0.4,
    });
    // No upsertAfterProfile — no execution profile exists

    const result = curate();

    expect(result.vectorsComputed).toBe(0);
    const db = getDb();
    expect(getChangeVectorsByHintId(db, hintId)).toEqual([]);
  });
});
