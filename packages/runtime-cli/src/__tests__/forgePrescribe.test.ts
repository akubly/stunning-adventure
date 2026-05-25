import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  getDb,
  insertChangeVector,
  insertOptimizationHint,
  upsertExecutionProfile,
} from '@akubly/cairn';
import { runForgePrescribe as skillsmithRunForgePrescribe } from '@akubly/skillsmith-runtime';
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
  it('delegates to @akubly/skillsmith-runtime', () => {
    expect(runForgePrescribe).toBe(skillsmithRunForgePrescribe);
  });

  it('uses the global fallback profile, runs prescribers, and persists generated hints', async () => {
    upsertExecutionProfile(makeProfile('skill-alpha', { granularity: 'global' }));
    seedVector('skill-alpha', 'convergence', 'prompt-optimizer');
    seedVector('skill-alpha', 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const result = await runForgePrescribe({ skillId: 'skill-alpha', dbPath: ':memory:' });

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.profileSource).toBe('global');
    expect(result.totalHints).toBe(7);
    expect(result.inserted).toBe(7);
    expect(result.skipped).toBe(0);
    expect(result.errored).toBe(0);
    expect(result.hints.some((hint) => hint.predictedImpact !== undefined)).toBe(true);
  });

  it('forwards fallbackContext to use an intermediate per-model profile', async () => {
    upsertExecutionProfile(makeProfile('skill-model', { granularity: 'per-model', granularityKey: 'gpt-5' }));

    const result = await runForgePrescribe({
      skillId: 'skill-model',
      dbPath: ':memory:',
      fallbackContext: { modelId: 'gpt-5' },
    });

    expect(result.ok).toBe(true);
    expect(result.profileSource).toBe('per-model');
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

  it('forceRegenerate allows re-inserting hints (tested via reduced skipped count)', async () => {
    const db = getDb();
    upsertExecutionProfile(makeProfile('skill-zeta'));
    seedVector('skill-zeta', 'convergence', 'prompt-optimizer');

    // Insert an existing active hint that would be skipped under normal dedup
    const activeHintId = insertOptimizationHint(
      makeHint({
        skillId: 'skill-zeta',
        source: 'prompt-optimizer',
        category: 'convergence',
        status: 'pending',
      }),
    );

    // Without force, the active hint is a duplicate and gets skipped
    const normalResult = await runForgePrescribe({
      skillId: 'skill-zeta',
      dbPath: ':memory:',
      forceRegenerate: false,
    });

    expect(normalResult.ok).toBe(true);
    expect(normalResult.skipped).toBeGreaterThanOrEqual(1);

    // With force, active hints are expired first — no skips, and the
    // previously-active hint should now carry status 'expired'
    const forceResult = await runForgePrescribe({
      skillId: 'skill-zeta',
      dbPath: ':memory:',
      forceRegenerate: true,
    });

    expect(forceResult.ok).toBe(true);
    expect(forceResult.skipped).toBe(0);
    expect(forceResult.inserted).toBeGreaterThan(0);
    // The old pending hint must have been expired by the force path
    const expiredHint = db
      .prepare('SELECT status FROM optimization_hints WHERE id = ?')
      .get(activeHintId) as { status: string } | undefined;
    expect(expiredHint?.status).toBe('expired');
  });

  it('forceRegenerate only expires hints matching skill, source, and category', async () => {
    const db = getDb();
    upsertExecutionProfile(makeProfile('skill-delta'));
    seedVector('skill-delta', 'convergence', 'prompt-optimizer');

    // Seed hints with different combinations
    const differentSkillHint = insertOptimizationHint(
      makeHint({
        id: 'different-skill',
        skillId: 'skill-other',
        source: 'prompt-optimizer',
        category: 'convergence',
        status: 'pending',
      }),
    );
    const differentSourceHint = insertOptimizationHint(
      makeHint({
        id: 'different-source',
        skillId: 'skill-delta',
        source: 'token-optimizer',
        category: 'convergence',
        status: 'pending',
      }),
    );
    const differentCategoryHint = insertOptimizationHint(
      makeHint({
        id: 'different-category',
        skillId: 'skill-delta',
        source: 'prompt-optimizer',
        category: 'cache-optimization',
        status: 'pending',
      }),
    );

    await runForgePrescribe({
      skillId: 'skill-delta',
      dbPath: ':memory:',
      forceRegenerate: true,
    });

    // Verify only matching hints were expired
    const hint1 = db
      .prepare('SELECT status FROM optimization_hints WHERE id = ?')
      .get(differentSkillHint) as { status: string } | undefined;
    const hint2 = db
      .prepare('SELECT status FROM optimization_hints WHERE id = ?')
      .get(differentSourceHint) as { status: string } | undefined;
    const hint3 = db
      .prepare('SELECT status FROM optimization_hints WHERE id = ?')
      .get(differentCategoryHint) as { status: string } | undefined;

    expect(hint1?.status).toBe('pending');
    expect(hint2?.status).toBe('pending');
    expect(hint3?.status).toBe('pending');
  });

  it('forceRegenerate does not expire terminal status hints', async () => {
    const db = getDb();
    upsertExecutionProfile(makeProfile('skill-epsilon'));
    seedVector('skill-epsilon', 'convergence', 'prompt-optimizer');

    // Seed terminal status hints
    const appliedHint = insertOptimizationHint(
      makeHint({
        id: 'applied-hint',
        skillId: 'skill-epsilon',
        source: 'prompt-optimizer',
        category: 'convergence',
        status: 'applied',
      }),
    );
    const rejectedHint = insertOptimizationHint(
      makeHint({
        id: 'rejected-hint',
        skillId: 'skill-epsilon',
        source: 'prompt-optimizer',
        category: 'convergence',
        status: 'rejected',
      }),
    );

    await runForgePrescribe({
      skillId: 'skill-epsilon',
      dbPath: ':memory:',
      forceRegenerate: true,
    });

    // Verify terminal status hints were not modified
    const hint1 = db
      .prepare('SELECT status FROM optimization_hints WHERE id = ?')
      .get(appliedHint) as { status: string } | undefined;
    const hint2 = db
      .prepare('SELECT status FROM optimization_hints WHERE id = ?')
      .get(rejectedHint) as { status: string } | undefined;

    expect(hint1?.status).toBe('applied');
    expect(hint2?.status).toBe('rejected');
  });
});
