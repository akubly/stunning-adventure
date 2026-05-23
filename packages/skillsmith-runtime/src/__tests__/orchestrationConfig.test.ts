import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cairn from '@akubly/cairn';
import type { OptimizationHintInsert } from '@akubly/cairn';
import { createPrescriberOrchestrationConfig } from '@akubly/skillsmith-runtime';

let hintCounter = 0;

type ProfileSeed = Parameters<typeof cairn.upsertExecutionProfile>[0];

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
    id: `factory-hint-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-alpha',
    category: 'convergence',
    description: 'Seed hint',
    recommendation: 'Do the thing',
    impactScore: 0.8,
    confidence: 0.9,
    evidence: { existing: true },
    metricSnapshot: { driftScore: 0.2 },
    generatedAt: '2026-05-23T00:00:00.000Z',
    ...overrides,
  };
}

function seedVector(
  skillId: string,
  category: OptimizationHintInsert['category'],
  source: OptimizationHintInsert['source'],
  netImpactTuning: { deltaConvergence?: number; deltaDrift?: number; deltaCacheHit?: number } = {},
): void {
  const db = cairn.getDb();
  const hintId = cairn.insertOptimizationHint(
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

  cairn.insertChangeVector(db, {
    hintId,
    deltas: {
      deltaDrift: netImpactTuning.deltaDrift ?? -0.2,
      deltaCost: -100_000,
      deltaSuccessRate: 0.05,
      deltaConvergence: netImpactTuning.deltaConvergence ?? -2,
      deltaCacheHit: netImpactTuning.deltaCacheHit ?? 0.1,
    },
    sessionsObserved: 4,
    computedAt: '2026-05-23T00:00:00.000Z',
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  cairn.closeDb();
  hintCounter = 0;
  cairn.getDb(':memory:');
});

afterEach(() => {
  vi.restoreAllMocks();
  cairn.closeDb();
});

describe('createPrescriberOrchestrationConfig', () => {
  it('runs prescribers for a profiled skill and persists generated hints', async () => {
    cairn.upsertExecutionProfile(makeProfile('skill-alpha'));
    seedVector('skill-alpha', 'convergence', 'prompt-optimizer');
    seedVector('skill-alpha', 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const config = createPrescriberOrchestrationConfig({ db: cairn.getDb() });
    expect(config.loadProfile?.('skill-alpha')?.skillId).toBe('skill-alpha');

    const result = await config.runForSkill('skill-alpha', 3);
    const pendingHints = cairn.queryOptimizationHints({ skillId: 'skill-alpha', status: 'pending' });

    expect(result.hintsGenerated).toBeGreaterThan(0);
    expect(result.hintsInserted).toBe(result.hintsGenerated);
    expect(result.hintsDuplicated).toBe(0);
    expect(result.hintsError).toBe(0);
    expect(pendingHints).toHaveLength(result.hintsInserted);
  });

  it('deduplicates a second run against the same active hints', async () => {
    cairn.upsertExecutionProfile(makeProfile('skill-beta'));
    seedVector('skill-beta', 'convergence', 'prompt-optimizer');
    seedVector('skill-beta', 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });

    const config = createPrescriberOrchestrationConfig({ db: cairn.getDb() });
    const firstRun = await config.runForSkill('skill-beta', 3);
    const secondRun = await config.runForSkill('skill-beta', 3);

    expect(firstRun.hintsInserted).toBeGreaterThan(0);
    expect(secondRun.hintsGenerated).toBe(firstRun.hintsGenerated);
    expect(secondRun.hintsInserted).toBe(0);
    expect(secondRun.hintsDuplicated).toBe(secondRun.hintsGenerated);
    expect(secondRun.hintsError).toBe(0);
  });

  it('treats a missing profile as a zero-count skip', async () => {
    const config = createPrescriberOrchestrationConfig({ db: cairn.getDb() });

    expect(config.loadProfile?.('missing-skill')).toBeNull();
    await expect(config.runForSkill('missing-skill', 3)).resolves.toEqual({
      skillId: 'missing-skill',
      hintsGenerated: 0,
      hintsInserted: 0,
      hintsDuplicated: 0,
      hintsError: 0,
    });
  });

  it('fails open on hint persistence errors by returning counts instead of throwing', async () => {
    cairn.upsertExecutionProfile(makeProfile('skill-gamma'));
    seedVector('skill-gamma', 'convergence', 'prompt-optimizer');
    seedVector('skill-gamma', 'cache-optimization', 'token-optimizer', { deltaCacheHit: 0.2 });
    vi.spyOn(cairn, 'insertHintIfNew').mockImplementation(() => {
      throw new Error('boom');
    });

    const config = createPrescriberOrchestrationConfig({ db: cairn.getDb() });
    const result = await config.runForSkill('skill-gamma', 3);

    expect(result.hintsGenerated).toBeGreaterThan(0);
    expect(result.hintsInserted).toBe(0);
    expect(result.hintsDuplicated).toBe(0);
    expect(result.hintsError).toBe(result.hintsGenerated);
    expect(cairn.queryOptimizationHints({ skillId: 'skill-gamma', status: 'pending' })).toHaveLength(0);
  });
});
