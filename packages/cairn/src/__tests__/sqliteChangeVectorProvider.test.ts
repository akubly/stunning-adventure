import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.js';
import { insertOptimizationHint } from '../db/optimizationHints.js';
import { insertChangeVector, computeNetImpact } from '../db/changeVectors.js';
import { SqliteChangeVectorProvider } from '../db/sqliteChangeVectorProvider.js';
import type { OptimizationHintInsert } from '../db/optimizationHints.js';
import type { OptimizationCategory } from '@akubly/types';

let hintCounter = 0;

function makeHint(overrides: Partial<OptimizationHintInsert> = {}): OptimizationHintInsert {
  hintCounter += 1;
  return {
    id: `hint-sqlite-provider-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-provider',
    category: 'convergence',
    description: 'Provider test hint',
    recommendation: 'Try it',
    generatedAt: '2026-05-22T13:30:00.000Z',
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

function insertVectorFor(category: OptimizationCategory, skillId: string, netTweaks: { deltaConvergence?: number; deltaDrift?: number } = {}): number {
  const db = getDb();
  const hintId = insertOptimizationHint(makeHint({ category, skillId }));
  const deltas = {
    deltaDrift: netTweaks.deltaDrift ?? -0.1,
    deltaCost: -20_000,
    deltaSuccessRate: 0.05,
    deltaConvergence: netTweaks.deltaConvergence ?? -2,
    deltaCacheHit: 0.05,
  };
  insertChangeVector(db, {
    hintId,
    deltas,
    sessionsObserved: 4,
    computedAt: '2026-05-22T13:30:00.000Z',
  });
  return computeNetImpact(deltas);
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('SqliteChangeVectorProvider', () => {
  it('returns [] for an empty DB', async () => {
    const provider = new SqliteChangeVectorProvider(getDb());

    await expect(provider.getSummaries('skill-provider')).resolves.toEqual([]);
  });

  it('returns one summary for a single category with vectors and filters categories with zero vectors', async () => {
    const db = getDb();
    const expectedImpact = insertVectorFor('convergence', 'skill-single');
    insertOptimizationHint(makeHint({ skillId: 'skill-single', category: 'tool-guidance' }));
    const provider = new SqliteChangeVectorProvider(db);

    await expect(provider.getSummaries('skill-single')).resolves.toEqual([
      {
        category: 'convergence',
        skillId: 'skill-single',
        meanNetImpact: expectedImpact,
        vectorCount: 1,
        confidenceBoost: 1,
      },
    ]);
  });

  it('returns one summary per category that has vectors', async () => {
    const db = getDb();
    insertVectorFor('cache-optimization', 'skill-multi');
    insertVectorFor('convergence', 'skill-multi', { deltaConvergence: -4 });
    insertVectorFor('tool-guidance', 'skill-multi', { deltaDrift: -0.2 });
    insertOptimizationHint(makeHint({ skillId: 'skill-multi', category: 'prompt-structure' }));
    const provider = new SqliteChangeVectorProvider(db);

    const summaries = await provider.getSummaries('skill-multi');

    expect(summaries).toHaveLength(3);
    expect(summaries.map((summary) => summary.category)).toEqual([
      'cache-optimization',
      'convergence',
      'tool-guidance',
    ]);
    expect(summaries.every((summary) => summary.vectorCount > 0)).toBe(true);
  });

  it('returns [] for an unknown skill ID', async () => {
    insertVectorFor('convergence', 'skill-known');
    const provider = new SqliteChangeVectorProvider(getDb());

    await expect(provider.getSummaries('skill-unknown')).resolves.toEqual([]);
  });
});
