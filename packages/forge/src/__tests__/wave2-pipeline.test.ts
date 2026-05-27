import {
  ATTENUATION_FLOOR,
  NEGATIVE_IMPACT_AUTO_APPLY_GATE,
  type ChangeVectorSummary as SharedChangeVectorSummary,
  type ExecutionProfile,
} from '@akubly/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { curate } from '../../../cairn/src/agents/curator.js';
import { closeDb, getDb } from '../../../cairn/src/db/index.js';
import {
  insertHintIfNew,
  insertOptimizationHint,
  queryOptimizationHints,
  type OptimizationHintInsert,
} from '../../../cairn/src/db/optimizationHints.js';
import { SqliteChangeVectorProvider } from '../../../cairn/src/db/sqliteChangeVectorProvider.js';
import { upsertExecutionProfile } from '../../../cairn/src/db/executionProfiles.js';
import { applyOptimizations } from '../applier/index.js';
import { runForgePrescribers, type ChangeVectorSummary as ForgeChangeVectorSummary } from '../prescribers/index.js';
import { DEFAULT_MIN_SESSIONS } from '../prescribers/utils.js';
import type { OptimizationHint } from '../prescribers/types.js';

let db: ReturnType<typeof getDb>;

const CONVERGENCE_WEIGHT = 0.30;
const BASELINE_AUTO_APPLY_THRESHOLD = 0.7;

let hintCounter = 0;

function makeProfile(overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  return {
    skillId: 'skill-wave2',
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 8,
    drift: { mean: 0.1, p50: 0.08, p95: 0.12, trend: 'stable' },
    tokens: {
      meanInputTokens: 1_000,
      meanOutputTokens: 300,
      meanCacheHitRate: 0.1,
      totalCostNanoAiu: 2_400_000,
    },
    outcomes: {
      successRate: 0.9,
      meanConvergenceTurns: 12,
      toolErrorRate: 0.02,
    },
    signals: {
      convergence: 0.3,
      tokenPressure: 0.4,
      toolEntropy: 0.1,
      contextBloat: 0.2,
      promptStability: 0.8,
    },
    updatedAt: '2026-05-22T21:00:00.000Z',
    ...overrides,
  };
}

function profileToUpsert(profile: ExecutionProfile) {
  return {
    skillId: profile.skillId,
    granularity: 'per-skill' as const,
    granularityKey: 'global',
    sessionCount: profile.sessionCount,
    drift: {
      mean: profile.drift.mean,
      p50: profile.drift.p50,
      p95: profile.drift.p95,
      trend: profile.drift.trend,
    },
    token: {
      meanInput: profile.tokens.meanInputTokens,
      meanOutput: profile.tokens.meanOutputTokens,
      meanCacheHit: profile.tokens.meanCacheHitRate,
      totalCost: profile.tokens.totalCostNanoAiu,
    },
    outcome: {
      successRate: profile.outcomes.successRate,
      meanConvergence: profile.outcomes.meanConvergenceTurns,
      toolErrorRate: profile.outcomes.toolErrorRate,
    },
  };
}

function makeAppliedHint(
  skillId: string,
  category: string,
  snapshot: OptimizationHintInsert['metricSnapshot'],
): OptimizationHintInsert {
  hintCounter += 1;
  return {
    id: `wave2-hint-${hintCounter}`,
    source: 'prompt-optimizer',
    skillId,
    category,
    description: 'Historical convergence hint',
    recommendation: 'Use explicit completion criteria.',
    impactScore: 0.8,
    confidence: 0.8,
    metricSnapshot: snapshot,
    generatedAt: `2026-05-22T20:${String(hintCounter).padStart(2, '0')}:00.000Z`,
    status: 'applied',
  };
}

function findHint(hints: OptimizationHint[], category: string): OptimizationHint {
  const hint = hints.find((candidate) => candidate.category === category);
  expect(hint, `expected ${category} hint`).toBeDefined();
  return hint!;
}

async function runBaseline(profile: ExecutionProfile): Promise<OptimizationHint> {
  const baselineHints = await runForgePrescribers(profile, profile.skillId);
  return findHint(baselineHints, 'convergence');
}

function persistHint(hint: OptimizationHint) {
  return insertHintIfNew(getDb(), {
    id: hint.id,
    source: hint.source,
    skillId: hint.skillId,
    category: hint.category,
    description: hint.description,
    recommendation: hint.recommendation,
    impactScore: hint.impactScore,
    confidence: hint.confidence,
    evidence: hint.evidence,
    autoApplyEligible: hint.autoApplyEligible,
    metricSnapshot: hint.metricSnapshot,
    generatedAt: hint.generatedAt,
    status: 'pending',
  });
}

function seedHistory(profile: ExecutionProfile, vectorCount: number, meanNetImpact: number): void {
  const beforeSessionCount = 3;
  const afterCostPerSession = profile.tokens.totalCostNanoAiu / profile.sessionCount;
  const deltaConvergence = -meanNetImpact / CONVERGENCE_WEIGHT;
  const beforeConvergence = profile.outcomes.meanConvergenceTurns - deltaConvergence;

  upsertExecutionProfile(db, profileToUpsert(profile));

  for (let index = 0; index < vectorCount; index += 1) {
    insertOptimizationHint(db,
      makeAppliedHint(profile.skillId, 'convergence', {
        driftScore: profile.drift.mean,
        tokenCostNanoAiu: afterCostPerSession * beforeSessionCount,
        successRate: profile.outcomes.successRate,
        convergenceTurns: beforeConvergence,
        cacheHitRate: profile.tokens.meanCacheHitRate,
        sessionCount: beforeSessionCount,
      }),
    );
  }
}

async function runScenario(vectorCount: number, meanNetImpact?: number) {
  const profile = makeProfile();
  if (meanNetImpact !== undefined && vectorCount > 0) {
    seedHistory(profile, vectorCount, meanNetImpact);
    const result = await curate();
    expect(result.changeVectorSweep.computed).toBe(vectorCount);
  }

  const baselineHint = await runBaseline(profile);
  const provider = new SqliteChangeVectorProvider(getDb());
  const summaries = await provider.getSummaries(profile.skillId);
  const hints = await runForgePrescribers(profile, profile.skillId, { provider });
  const convergenceHint = findHint(hints, 'convergence');

  return { profile, baselineHint, provider, summaries, convergenceHint };
}

beforeEach(() => {
  closeDb();
  hintCounter = 0;
  db = getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('Wave 2 full pipeline integration', () => {
  const matureVectorCount = DEFAULT_MIN_SESSIONS + 1;
  const sparseVectorCount = Math.max(1, DEFAULT_MIN_SESSIONS - 1);
  const maturePositiveBoost = Math.log(1 + matureVectorCount) / Math.log(1 + DEFAULT_MIN_SESSIONS);

  const cases = [
    {
      name: '0 vectors falls back to baseline confidence and stays auto-applicable',
      vectorCount: 0,
      expectedBoost: 1.0,
      expectedAutoApplyEligible: undefined,
      expectedPredictedImpact: undefined,
      expectApplied: true,
    },
    {
      name: 'sparse positive vectors stay neutral but preserve auto-apply',
      vectorCount: sparseVectorCount,
      meanNetImpact: 0.3,
      expectedBoost: 1.0,
      expectedAutoApplyEligible: true,
      expectedPredictedImpact: 0.3,
      expectApplied: true,
    },
    {
      name: 'sparse negative vectors stay neutral and cannot gate auto-apply',
      vectorCount: sparseVectorCount,
      meanNetImpact: -0.5,
      expectedBoost: 1.0,
      expectedAutoApplyEligible: true,
      expectedPredictedImpact: -0.5,
      expectApplied: true,
    },
    {
      name: 'mature positive vectors amplify confidence',
      vectorCount: matureVectorCount,
      meanNetImpact: 0.4,
      expectedBoost: maturePositiveBoost,
      expectedAutoApplyEligible: true,
      expectedPredictedImpact: 0.4,
      expectApplied: true,
    },
    {
      name: 'mature mildly negative vectors above the gate stay neutral',
      vectorCount: matureVectorCount,
      meanNetImpact: -0.1,
      expectedBoost: 1.0,
      expectedAutoApplyEligible: true,
      expectedPredictedImpact: -0.1,
      expectApplied: true,
    },
    {
      name: 'mature very negative vectors attenuate and block auto-apply',
      vectorCount: matureVectorCount,
      meanNetImpact: -0.5,
      expectedBoost: 0.5,
      expectedAutoApplyEligible: false,
      expectedPredictedImpact: -0.5,
      expectApplied: false,
    },
    {
      name: 'mature catastrophic vectors clamp at the attenuation floor',
      vectorCount: matureVectorCount,
      meanNetImpact: -0.95,
      expectedBoost: ATTENUATION_FLOOR,
      expectedAutoApplyEligible: false,
      expectedPredictedImpact: -0.95,
      expectApplied: false,
    },
  ] as const;

  it.each(cases)('$name', async (testCase) => {
    const { baselineHint, summaries, convergenceHint } = await runScenario(
      testCase.vectorCount,
      testCase.meanNetImpact,
    );

    if (testCase.vectorCount === 0) {
      expect(summaries).toEqual([]);
      expect(convergenceHint.confidence).toBeCloseTo(baselineHint.confidence, 10);
      expect(convergenceHint.predictedImpact).toBeUndefined();
      expect(convergenceHint.autoApplyEligible).toBeUndefined();
      expect(convergenceHint.evidence.autoApplyEligible).toBeUndefined();
    } else {
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        category: 'convergence',
        skillId: baselineHint.skillId,
        vectorCount: testCase.vectorCount,
        autoApplyEligible: testCase.expectedAutoApplyEligible,
      });
      expect(summaries[0]!.meanNetImpact).toBeCloseTo(testCase.expectedPredictedImpact!, 10);
      expect(summaries[0]!.confidenceBoost).toBeCloseTo(testCase.expectedBoost, 10);
      expect(convergenceHint.predictedImpact).toBeCloseTo(testCase.expectedPredictedImpact!, 10);
      expect(convergenceHint.autoApplyEligible).toBe(testCase.expectedAutoApplyEligible);
      expect(convergenceHint.evidence.autoApplyEligible).toBe(testCase.expectedAutoApplyEligible);
      expect(convergenceHint.confidence).toBeCloseTo(
        Math.min(1, baselineHint.confidence * testCase.expectedBoost),
        10,
      );
    }

    const applierResult = applyOptimizations([convergenceHint], {
      autoApplyThreshold: BASELINE_AUTO_APPLY_THRESHOLD,
    });
    expect(applierResult.applied).toHaveLength(testCase.expectApplied ? 1 : 0);
    expect(applierResult.skipped.some((item) => item.hintId === convergenceHint.id)).toBe(
      !testCase.expectApplied,
    );
  });

  it('blocks auto-apply at the negative-impact gate boundary end to end', async () => {
    const seededBoundaryImpact = NEGATIVE_IMPACT_AUTO_APPLY_GATE - Number.EPSILON;
    const { summaries, convergenceHint } = await runScenario(
      matureVectorCount,
      seededBoundaryImpact,
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      category: 'convergence',
      vectorCount: matureVectorCount,
      autoApplyEligible: false,
    });
    expect(summaries[0]!.meanNetImpact).toBeLessThanOrEqual(NEGATIVE_IMPACT_AUTO_APPLY_GATE);
    expect(convergenceHint.predictedImpact).toBeLessThanOrEqual(NEGATIVE_IMPACT_AUTO_APPLY_GATE);
    expect(convergenceHint.autoApplyEligible).toBe(false);
    expect(convergenceHint.evidence.autoApplyEligible).toBe(false);
    expect(convergenceHint.confidence).toBeGreaterThan(0);

    const applierResult = applyOptimizations([convergenceHint], {
      autoApplyThreshold: 0,
    });
    expect(applierResult.applied).toHaveLength(0);
    expect(applierResult.skipped).toContainEqual({
      hintId: convergenceHint.id,
      reason: 'historical vectors indicate negative impact',
    });
  });

  it('deduplicates persisted hints across repeated orchestrator runs', async () => {
    const profile = makeProfile({ skillId: 'skill-dedup' });
    seedHistory(profile, matureVectorCount, 0.4);
    expect((await curate()).changeVectorSweep.computed).toBe(matureVectorCount);

    const provider = new SqliteChangeVectorProvider(getDb());
    const run1 = await runForgePrescribers(profile, profile.skillId, { provider });
    const run2 = await runForgePrescribers(profile, profile.skillId, { provider });

    const insertedRun1 = run1.filter((hint) => persistHint(hint).inserted).length;
    const insertedRun2 = run2.filter((hint) => persistHint(hint).inserted).length;

    expect(insertedRun1).toBe(run1.length);
    expect(insertedRun2).toBe(0);
    expect(queryOptimizationHints(db, { skillId: profile.skillId, status: 'pending' })).toHaveLength(
      run1.length,
    );
  });

  it('omitting the provider matches Phase 4.5 baseline behaviour', async () => {
    const profile = makeProfile({ skillId: 'skill-no-provider' });
    seedHistory(profile, matureVectorCount, 0.4);
    expect((await curate()).changeVectorSweep.computed).toBe(matureVectorCount);

    const baseline = await runForgePrescribers(profile, profile.skillId);
    const withoutProvider = await runForgePrescribers(profile, profile.skillId, {});

    expect(withoutProvider).toHaveLength(baseline.length);
    for (const category of ['convergence', 'cache-optimization'] as const) {
      const baselineHint = findHint(baseline, category);
      const withoutProviderHint = findHint(withoutProvider, category);
      expect(withoutProviderHint.confidence).toBeCloseTo(baselineHint.confidence, 10);
      expect(withoutProviderHint.predictedImpact).toBeUndefined();
      expect(withoutProviderHint.autoApplyEligible).toBeUndefined();
    }
  });

  it('fails open when the provider throws', async () => {
    const profile = makeProfile({ skillId: 'skill-provider-error' });
    const baseline = await runForgePrescribers(profile, profile.skillId);
    const result = await runForgePrescribers(profile, profile.skillId, {
      provider: {
        async getSummaries() {
          throw new Error('provider unavailable');
        },
      },
    });

    expect(result).toHaveLength(baseline.length);
    for (const category of ['convergence', 'cache-optimization'] as const) {
      const baselineHint = findHint(baseline, category);
      const resultHint = findHint(result, category);
      expect(resultHint.confidence).toBeCloseTo(baselineHint.confidence, 10);
      expect(resultHint.predictedImpact).toBeUndefined();
      expect(resultHint.autoApplyEligible).toBeUndefined();
    }
  });

  it('keeps the shared ChangeVectorSummary contract intact across packages', async () => {
    const profile = makeProfile({ skillId: 'skill-contract' });
    seedHistory(profile, matureVectorCount, 0.4);
    expect((await curate()).changeVectorSweep.computed).toBe(matureVectorCount);

    const provider = new SqliteChangeVectorProvider(getDb());
    const sharedSummaries: SharedChangeVectorSummary[] = await provider.getSummaries(profile.skillId);
    const forgeSummaries: ForgeChangeVectorSummary[] = sharedSummaries;

    expect(forgeSummaries).toBe(sharedSummaries);
    expect(forgeSummaries[0]).toMatchObject({
      category: 'convergence',
      skillId: profile.skillId,
      autoApplyEligible: true,
    });
  });
});
