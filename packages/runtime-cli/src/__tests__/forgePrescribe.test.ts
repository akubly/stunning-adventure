import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  getDb,
  insertChangeVector,
  insertOptimizationHint,
  upsertExecutionProfile,
} from '@akubly/cairn';
import type { OptimizationHintInsert } from '@akubly/cairn';
import { runForgePrescribe } from '../index.js';

let hintCounter = 0;

type ProfileSeed = Parameters<typeof upsertExecutionProfile>[0];

function makeProfile(skillId: string, overrides: Partial<ProfileSeed> = {}): ProfileSeed {
  return {
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 12,
    drift: { mean: 0.25, p50: 0.2, p95: 0.65, trend: 'degrading' },
    token: { meanInput: 60_000, meanOutput: 40_000, meanCacheHit: 0.2, totalCost: 24_000_000 },
    outcome: { successRate: 0.85, meanConvergence: 12, toolErrorRate: 0.04 },
    ...overrides,
  };
}

function makeHint(overrides: Partial<OptimizationHintInsert> = {}): OptimizationHintInsert {
  hintCounter += 1;
  return {
    id: `persisted-hint-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-alpha',
    category: 'convergence',
    description: 'Existing hint',
    recommendation: 'Do the thing',
    impactScore: 0.8,
    confidence: 0.9,
    evidence: { existing: true },
    metricSnapshot: { driftScore: 0.2 },
    generatedAt: '2026-05-22T23:00:00.000Z',
    ...overrides,
  };
}

function seedVector(
  skillId: string,
  category: OptimizationHintInsert['category'],
  source: OptimizationHintInsert['source'],
  netImpactTuning: { deltaConvergence?: number; deltaDrift?: number; deltaCacheHit?: number } = {},
): void {
  const db = getDb();
  const hintId = insertOptimizationHint(
    makeHint({
      skillId,
      category,
      source,
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
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('runForgePrescribe', () => {
  it('uses the global fallback profile, runs prescribers, and persists generated hints', async () => {
    upsertExecutionProfile(makeProfile('skill-alpha', { granularity: 'global' }));
    seedVector('skill-alpha', 'convergence', 'prompt-optimizer');
    seedVector('skill-alpha', 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const result = await runForgePrescribe({ skillId: 'skill-alpha', dbPath: ':memory:' });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.profileSource).toBe('global fallback');
    expect(result.totalHints).toBe(7);
    expect(result.inserted).toBe(7);
    expect(result.skipped).toBe(0);
    expect(result.errored).toBe(0);
    expect(result.hints.some((hint) => hint.predictedImpact !== undefined)).toBe(true);
  });

  it('returns a no-profile error when neither per-skill nor global fallback profiles exist', async () => {
    const result = await runForgePrescribe({ skillId: 'missing-skill', dbPath: ':memory:' });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('No execution profile');
  });

  it('returns zero counts when no hints are generated and the provider has no vectors', async () => {
    upsertExecutionProfile(
      makeProfile('skill-calm', {
        sessionCount: 8,
        drift: { mean: 0.05, p50: 0.04, p95: 0.1, trend: 'stable' },
        token: { meanInput: 1_000, meanOutput: 200, meanCacheHit: 0.9, totalCost: 500_000 },
        outcome: { successRate: 0.98, meanConvergence: 4, toolErrorRate: 0.01 },
      }),
    );

    const result = await runForgePrescribe({ skillId: 'skill-calm', dbPath: ':memory:' });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.profileSource).toBe('per-skill');
    expect(result.totalHints).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errored).toBe(0);
  });

  it('counts inserted and skipped hints when active duplicates already exist', async () => {
    upsertExecutionProfile(makeProfile('skill-beta'));
    insertOptimizationHint(
      makeHint({
        skillId: 'skill-beta',
        source: 'prompt-optimizer',
        category: 'convergence',
        status: 'pending',
      }),
    );
    insertOptimizationHint(
      makeHint({
        skillId: 'skill-beta',
        source: 'token-optimizer',
        category: 'cache-optimization',
        status: 'accepted',
      }),
    );

    const result = await runForgePrescribe({ skillId: 'skill-beta', dbPath: ':memory:' });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.totalHints).toBe(7);
    expect(result.inserted).toBe(5);
    expect(result.skipped).toBe(2);
    expect(result.errored).toBe(0);
  });
});
