/**
 * L2 — CRUD tests for the change_vectors module (Alexander A3).
 *
 * Tests cover `computeNetImpact`, `insertChangeVector`, `getChangeVectorsByHintId`,
 * `getChangeVectorsByCategoryAndSkill`, and `summarizeChangeVectors` from
 * `packages/cairn/src/db/changeVectors.ts`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  insertChangeVector,
  getChangeVectorsByHintId,
  getChangeVectorsByCategoryAndSkill,
  summarizeChangeVectors,
  computeNetImpact,
  CHANGE_VECTOR_WEIGHTS,
  type ChangeVectorDeltas,
} from '../db/changeVectors.js';
import { insertOptimizationHint } from '../db/optimizationHints.js';
import type { OptimizationHintInsert } from '../db/optimizationHints.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let hintCounter = 0;

function makeHint(overrides: Partial<OptimizationHintInsert> = {}): OptimizationHintInsert {
  hintCounter += 1;
  return {
    id: `hint-cv-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-a',
    category: 'convergence',
    description: 'Test hint',
    recommendation: 'Do something',
    generatedAt: '2026-05-03T20:59:53.000Z',
    status: 'applied',
    metricSnapshot: {
      driftScore: 0.3,
      tokenCostNanoAiu: 100_000,
      successRate: 0.8,
      convergenceTurns: 8,
      cacheHitRate: 0.4,
    },
    ...overrides,
  };
}

function makeDeltas(overrides: Partial<ChangeVectorDeltas> = {}): ChangeVectorDeltas {
  return {
    deltaDrift: -0.1,      // improved (lower drift is better)
    deltaCost: -50_000,    // improved (lower cost is better)
    deltaSuccessRate: 0.1, // improved (higher is better)
    deltaConvergence: -2,  // improved (lower turns is better)
    deltaCacheHit: 0.1,    // improved (higher cache hit is better)
    ...overrides,
  };
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
// computeNetImpact — pure function
// ---------------------------------------------------------------------------

describe('computeNetImpact', () => {
  it('returns 0 when all deltas are 0', () => {
    const result = computeNetImpact({
      deltaDrift: 0,
      deltaCost: 0,
      deltaSuccessRate: 0,
      deltaConvergence: 0,
      deltaCacheHit: 0,
    });
    expect(result).toBe(0);
  });

  it('matches the weighted formula: negate lower-is-better deltas, sum with weights', () => {
    const deltas = makeDeltas();
    const expected =
      -deltas.deltaDrift * CHANGE_VECTOR_WEIGHTS.deltaDrift +
      -deltas.deltaCost * CHANGE_VECTOR_WEIGHTS.deltaCost +
      deltas.deltaSuccessRate * CHANGE_VECTOR_WEIGHTS.deltaSuccessRate +
      -deltas.deltaConvergence * CHANGE_VECTOR_WEIGHTS.deltaConvergence +
      deltas.deltaCacheHit * CHANGE_VECTOR_WEIGHTS.deltaCacheHit;
    expect(computeNetImpact(deltas)).toBeCloseTo(expected, 10);
  });

  it('returns positive net_impact when a prescription improves all metrics', () => {
    // Improving = drift ↓, cost ↓, successRate ↑, convergence ↓, cacheHit ↑
    const result = computeNetImpact(makeDeltas());
    expect(result).toBeGreaterThan(0);
  });

  it('returns negative net_impact when a prescription worsens all metrics', () => {
    const result = computeNetImpact({
      deltaDrift: 0.1,       // worse
      deltaCost: 50_000,     // worse
      deltaSuccessRate: -0.1, // worse
      deltaConvergence: 2,   // worse
      deltaCacheHit: -0.1,   // worse
    });
    expect(result).toBeLessThan(0);
  });

  it('convergence weight (0.30) dominates — a convergence improvement alone yields positive result', () => {
    const result = computeNetImpact({
      deltaDrift: 0,
      deltaCost: 0,
      deltaSuccessRate: 0,
      deltaConvergence: -5, // significant improvement in convergence
      deltaCacheHit: 0,
    });
    expect(result).toBeCloseTo(5 * CHANGE_VECTOR_WEIGHTS.deltaConvergence, 10);
    expect(result).toBeGreaterThan(0);
  });

  it('does not produce NaN for extreme delta values', () => {
    const result = computeNetImpact({
      deltaDrift: 1e10,
      deltaCost: -1e10,
      deltaSuccessRate: 1e10,
      deltaConvergence: -1e10,
      deltaCacheHit: 1e10,
    });
    expect(Number.isNaN(result)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CHANGE_VECTOR_WEIGHTS — regression pin
// ---------------------------------------------------------------------------

describe('CHANGE_VECTOR_WEIGHTS', () => {
  it('deltaConvergence is 0.30 (matches DRIFT_WEIGHTS.convergence)', () => {
    expect(CHANGE_VECTOR_WEIGHTS.deltaConvergence).toBe(0.30);
  });

  it('deltaDrift is 0.25 (matches DRIFT_WEIGHTS.toolEntropy)', () => {
    expect(CHANGE_VECTOR_WEIGHTS.deltaDrift).toBe(0.25);
  });

  it('deltaSuccessRate, deltaCost, deltaCacheHit are each 0.15', () => {
    expect(CHANGE_VECTOR_WEIGHTS.deltaSuccessRate).toBe(0.15);
    expect(CHANGE_VECTOR_WEIGHTS.deltaCost).toBe(0.15);
    expect(CHANGE_VECTOR_WEIGHTS.deltaCacheHit).toBe(0.15);
  });

  it('all 5 weights sum to 1.0', () => {
    const sum = Object.values(CHANGE_VECTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// insertChangeVector
// ---------------------------------------------------------------------------

describe('insertChangeVector', () => {
  it('inserts a change vector and returns a positive integer id', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint());
    const id = insertChangeVector(db, {
      hintId,
      deltas: makeDeltas(),
      sessionsObserved: 5,
      computedAt: '2026-05-03T20:59:53.000Z',
    });
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

  it('round-trips all delta fields and net_impact correctly', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint());
    const deltas = makeDeltas();
    const id = insertChangeVector(db, {
      hintId,
      deltas,
      sessionsObserved: 7,
      computedAt: '2026-05-03T21:00:00.000Z',
    });

    const rows = getChangeVectorsByHintId(db, hintId);
    expect(rows.length).toBe(1);
    const row = rows[0]!;
    expect(row.id).toBe(id);
    expect(row.hintId).toBe(hintId);
    expect(row.deltaDrift).toBeCloseTo(deltas.deltaDrift, 10);
    expect(row.deltaCost).toBeCloseTo(deltas.deltaCost, 10);
    expect(row.deltaSuccessRate).toBeCloseTo(deltas.deltaSuccessRate, 10);
    expect(row.deltaConvergence).toBeCloseTo(deltas.deltaConvergence, 10);
    expect(row.deltaCacheHit).toBeCloseTo(deltas.deltaCacheHit, 10);
    expect(row.sessionsObserved).toBe(7);
    expect(row.netImpact).toBeCloseTo(computeNetImpact(deltas), 10);
  });

  it('throws (FK violation) when hint_id does not reference an existing optimization_hints row', () => {
    const db = getDb();
    expect(() =>
      insertChangeVector(db, {
        hintId: 'nonexistent-hint-id',
        deltas: makeDeltas(),
        sessionsObserved: 5,
        computedAt: '2026-05-03T20:59:53.000Z',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// getChangeVectorsByHintId
// ---------------------------------------------------------------------------

describe('getChangeVectorsByHintId', () => {
  it('returns empty array when no vectors exist for the given hint_id', () => {
    const db = getDb();
    insertOptimizationHint(makeHint({ id: 'h-exists' }));
    const result = getChangeVectorsByHintId(db, 'h-exists');
    expect(result).toEqual([]);
  });

  it('returns a single vector for a hint that has one change vector', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint());
    insertChangeVector(db, { hintId, deltas: makeDeltas(), sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });

    const rows = getChangeVectorsByHintId(db, hintId);
    expect(rows.length).toBe(1);
    expect(rows[0]!.hintId).toBe(hintId);
  });

  it('returns multiple vectors when a hint has more than one change vector', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint());
    insertChangeVector(db, { hintId, deltas: makeDeltas(), sessionsObserved: 3, computedAt: '2026-05-03T20:00:00.000Z' });
    insertChangeVector(db, { hintId, deltas: makeDeltas({ deltaDrift: -0.2 }), sessionsObserved: 6, computedAt: '2026-05-03T21:00:00.000Z' });

    const rows = getChangeVectorsByHintId(db, hintId);
    expect(rows.length).toBe(2);
  });

  it('does not return vectors belonging to a different hint_id', () => {
    const db = getDb();
    const hint1 = insertOptimizationHint(makeHint());
    const hint2 = insertOptimizationHint(makeHint());
    insertChangeVector(db, { hintId: hint2, deltas: makeDeltas(), sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });

    const rows = getChangeVectorsByHintId(db, hint1);
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getChangeVectorsByCategoryAndSkill
// ---------------------------------------------------------------------------

describe('getChangeVectorsByCategoryAndSkill', () => {
  it('returns empty array when no vectors match the given category and skill_id', () => {
    const db = getDb();
    const result = getChangeVectorsByCategoryAndSkill(db, 'convergence', 'skill-a');
    expect(result).toEqual([]);
  });

  it('returns vectors whose parent hint matches category and skill_id', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint({ skillId: 'skill-a', category: 'convergence' }));
    insertChangeVector(db, { hintId, deltas: makeDeltas(), sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });

    const rows = getChangeVectorsByCategoryAndSkill(db, 'convergence', 'skill-a');
    expect(rows.length).toBe(1);
    expect(rows[0]!.hintId).toBe(hintId);
  });

  it('does not return vectors for a different category', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint({ skillId: 'skill-a', category: 'convergence' }));
    insertChangeVector(db, { hintId, deltas: makeDeltas(), sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });

    const rows = getChangeVectorsByCategoryAndSkill(db, 'prompt-structure', 'skill-a');
    expect(rows).toEqual([]);
  });

  it('does not return vectors for a different skill_id', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint({ skillId: 'skill-a', category: 'convergence' }));
    insertChangeVector(db, { hintId, deltas: makeDeltas(), sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });

    const rows = getChangeVectorsByCategoryAndSkill(db, 'convergence', 'skill-OTHER');
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// summarizeChangeVectors
// ---------------------------------------------------------------------------

describe('summarizeChangeVectors', () => {
  it('returns vectorCount=0 and meanNetImpact=0 when no vectors exist for the category+skillId', () => {
    const db = getDb();
    const summary = summarizeChangeVectors(db, 'convergence', 'skill-a');
    expect(summary.vectorCount).toBe(0);
    expect(summary.meanNetImpact).toBe(0);
  });

  it('returns correct meanNetImpact for a single vector', () => {
    const db = getDb();
    const hintId = insertOptimizationHint(makeHint({ skillId: 'skill-a', category: 'convergence' }));
    const deltas = makeDeltas();
    insertChangeVector(db, { hintId, deltas, sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });

    const summary = summarizeChangeVectors(db, 'convergence', 'skill-a');
    expect(summary.vectorCount).toBe(1);
    expect(summary.meanNetImpact).toBeCloseTo(computeNetImpact(deltas), 5);
  });

  it('computes meanNetImpact as arithmetic mean across multiple vectors', () => {
    const db = getDb();
    const hint1 = insertOptimizationHint(makeHint({ skillId: 'skill-a', category: 'convergence' }));
    const hint2 = insertOptimizationHint(makeHint({ skillId: 'skill-a', category: 'convergence' }));
    const d1 = makeDeltas({ deltaConvergence: -4 }); // high improvement
    const d2 = makeDeltas({ deltaConvergence: -1 }); // low improvement
    insertChangeVector(db, { hintId: hint1, deltas: d1, sessionsObserved: 5, computedAt: '2026-05-03T20:00:00.000Z' });
    insertChangeVector(db, { hintId: hint2, deltas: d2, sessionsObserved: 5, computedAt: '2026-05-03T21:00:00.000Z' });

    const summary = summarizeChangeVectors(db, 'convergence', 'skill-a');
    expect(summary.vectorCount).toBe(2);
    const expectedMean = (computeNetImpact(d1) + computeNetImpact(d2)) / 2;
    expect(summary.meanNetImpact).toBeCloseTo(expectedMean, 5);
  });

  it('returns category and skillId on the summary object', () => {
    const db = getDb();
    const summary = summarizeChangeVectors(db, 'cache-optimization', 'skill-x');
    expect(summary.category).toBe('cache-optimization');
    expect(summary.skillId).toBe('skill-x');
  });

  it('confidenceBoost is log-scaled: log(1+vc)/log(1+mv) — equals 1.0 at vectorCount=minVectors', () => {
    const db = getDb();
    const hint1 = insertOptimizationHint(makeHint({ skillId: 'skill-b', category: 'convergence' }));
    const hint2 = insertOptimizationHint(makeHint({ skillId: 'skill-b', category: 'convergence' }));
    const hint3 = insertOptimizationHint(makeHint({ skillId: 'skill-b', category: 'convergence' }));
    for (const hintId of [hint1, hint2, hint3]) {
      insertChangeVector(db, { hintId, deltas: makeDeltas(), sessionsObserved: 5, computedAt: '2026-05-03T20:59:53.000Z' });
    }

    const summary = summarizeChangeVectors(db, 'convergence', 'skill-b', 3);
    // vectorCount=3, minVectors=3 → log(4)/log(4) = 1.0
    expect(summary.vectorCount).toBe(3);
    expect(summary.confidenceBoost).toBeCloseTo(1.0, 10);
  });

  it('summarizeChangeVectors — confidenceBoost is 1.0 when vectorCount is 0 (matches computeConfidenceBoost(0))', () => {
    // Phase 4.6 / ADR-P4.6-002: absence of vectors = neutral = identity multiplier.
    // computeConfidenceBoost(0) in forge returns 1.0; this test locks in the same
    // contract for the Cairn side without introducing a cross-package import.
    const db = getDb();
    const summary = summarizeChangeVectors(db, 'convergence', 'skill-a');

    expect(summary).toMatchObject({ vectorCount: 0, meanNetImpact: 0, confidenceBoost: 1.0 });
    // Cross-check: the identity value 1.0 is the same value computeConfidenceBoost(0) returns.
    expect(summary.confidenceBoost).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Policy placeholder
// ---------------------------------------------------------------------------

describe('change vector policy', () => {
  it.todo(
    'penalizes confidence on negative meanNetImpact (Wave 2 — deferred per Aaron policy 2026-05-03)',
  );
});
