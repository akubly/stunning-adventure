/**
 * L3 — Prescriber integration tests for Phase 4.6 change vector support.
 *
 * Tests both `analyzePromptOptimizations` and `analyzeTokenOptimizations` with
 * the optional `historicalVectors?: ChangeVectorSummary[]` parameter introduced
 * in Phase 4.6 (R3/R4 — Rosella).
 *
 * Coverage:
 *   - Backward compatibility: omitting historicalVectors → identical Phase 4.5 behaviour
 *   - Empty array: treated as "no vectors" (same as omitting)
 *   - Single vector boost: matching category+skillId boosts confidence and sets predictedImpact
 *   - Multiple vectors: each matching category+skillId boosted independently
 *   - Ranking by predictedImpact: hints sorted descending when vectors supplied
 *   - Unrelated skill: no boost when skillId doesn't match
 *   - vectorCount === 0 → computeConfidenceBoost returns 1.0 (no boost/no penalty)
 *   - High meanNetImpact preserves ranking advantage
 *   - Wave 2 placeholder: negative meanNetImpact penalty (deferred)
 */

import { describe, it, expect } from 'vitest';
import {
  analyzePromptOptimizations,
  analyzeTokenOptimizations,
  type ChangeVectorSummary,
} from '../prescribers/index.js';
import { computeConfidenceBoost } from '../prescribers/utils.js';
import type { ExecutionProfile } from '../telemetry/types.js';

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  return {
    skillId: 'skill-alpha',
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 10,
    drift: { mean: 0.35, p50: 0.30, p95: 0.50, trend: 'degrading' },
    tokens: {
      meanInputTokens: 5_000,
      meanOutputTokens: 1_000,
      meanCacheHitRate: 0.15, // below 0.3 threshold → cache-optimization hint
      totalCostNanoAiu: 500_000,
    },
    outcomes: {
      successRate: 0.8,
      meanConvergenceTurns: 12, // above 10 → convergence hint
      toolErrorRate: 0.05,
    },
    updatedAt: '2026-05-03T20:59:53.000Z',
    ...overrides,
  };
}

/** A profile that sits squarely in the token-optimizer's acceptable zone (drift < 0.3). */
function makeTokenProfile(overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  return makeProfile({
    sessionCount: 10,
    drift: { mean: 0.05, p50: 0.04, p95: 0.08, trend: 'stable' },
    ...overrides,
  });
}

function makeVector(overrides: Partial<ChangeVectorSummary> = {}): ChangeVectorSummary {
  return {
    category: 'convergence',
    skillId: 'skill-alpha',
    meanNetImpact: 0.25,
    vectorCount: 5,
    confidenceBoost: 1.5, // boost > 1 → hint.confidence is capped to 1
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeConfidenceBoost utility (used by both prescribers internally)
// ---------------------------------------------------------------------------

describe('computeConfidenceBoost — utility', () => {
  it('returns 1.0 when vectorCount is 0 (no boost, no penalty)', () => {
    expect(computeConfidenceBoost(0)).toBe(1.0);
  });

  it('returns 1.0 when vectorCount equals minVectors (default 3)', () => {
    const result = computeConfidenceBoost(3);
    expect(result).toBeCloseTo(1.0, 10);
  });

  it('returns > 1.0 when vectorCount exceeds minVectors', () => {
    expect(computeConfidenceBoost(10)).toBeGreaterThan(1.0);
  });

  it('is monotone non-decreasing in vectorCount', () => {
    const a = computeConfidenceBoost(2);
    const b = computeConfidenceBoost(5);
    const c = computeConfidenceBoost(20);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(c).toBeGreaterThanOrEqual(b);
  });

  it('returns 1.0 for vectorCount=minVectors regardless of minVectors value', () => {
    expect(computeConfidenceBoost(5, 5)).toBeCloseTo(1.0, 10);
    expect(computeConfidenceBoost(10, 10)).toBeCloseTo(1.0, 10);
  });
});

// ---------------------------------------------------------------------------
// analyzePromptOptimizations — backward compatibility
// ---------------------------------------------------------------------------

describe('analyzePromptOptimizations — backward compatibility (no vectors)', () => {
  it('omitting historicalVectors produces the same hints as Phase 4.5', () => {
    const profile = makeProfile();
    const withoutParam = analyzePromptOptimizations(profile);
    const withUndefined = analyzePromptOptimizations(profile, undefined, undefined);
    // Shape must be identical (IDs and timestamps excluded)
    const shapeOf = (r: ReturnType<typeof analyzePromptOptimizations>) =>
      r.hints.map((h) => ({
        source: h.source,
        category: h.category,
        impactScore: h.impactScore,
      }));
    expect(shapeOf(withoutParam)).toEqual(shapeOf(withUndefined));
  });

  it('passing an empty historicalVectors array leaves hints unmodified', () => {
    const profile = makeProfile();
    const baseline = analyzePromptOptimizations(profile);
    const withEmpty = analyzePromptOptimizations(profile, undefined, []);
    expect(withEmpty.hints.length).toBe(baseline.hints.length);
    withEmpty.hints.forEach((h, i) => {
      expect(h.confidence).toBeCloseTo(baseline.hints[i]!.confidence, 10);
      expect(h.predictedImpact).toBeUndefined();
    });
  });

  it('hints have no predictedImpact field when historicalVectors is omitted', () => {
    const result = analyzePromptOptimizations(makeProfile());
    for (const hint of result.hints) {
      expect(hint.predictedImpact).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// analyzePromptOptimizations — single vector boost
// ---------------------------------------------------------------------------

describe('analyzePromptOptimizations — single vector boost', () => {
  it('boosts confidence on a matching category+skillId hint', () => {
    const profile = makeProfile();
    const baseline = analyzePromptOptimizations(profile);
    const convBaseline = baseline.hints.find((h) => h.category === 'convergence')!;
    expect(convBaseline).toBeDefined();
    const originalConfidence = convBaseline.confidence;

    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-alpha', confidenceBoost: 1.4 }),
    ];
    const boosted = analyzePromptOptimizations(profile, undefined, vectors);
    const convBoosted = boosted.hints.find((h) => h.category === 'convergence')!;
    expect(convBoosted).toBeDefined();
    // confidence *= 1.4, capped at 1
    expect(convBoosted.confidence).toBeCloseTo(Math.min(1, originalConfidence * 1.4), 5);
  });

  it('sets predictedImpact from meanNetImpact of the matching vector', () => {
    const profile = makeProfile();
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-alpha', meanNetImpact: 0.42 }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    const conv = result.hints.find((h) => h.category === 'convergence')!;
    expect(conv.predictedImpact).toBeCloseTo(0.42, 5);
  });

  it('does not modify unmatched hints (different category)', () => {
    const profile = makeProfile();
    const baseline = analyzePromptOptimizations(profile);
    const baselinePromptStructure = baseline.hints.find(
      (h) => h.category === 'prompt-structure',
    );
    if (!baselinePromptStructure) return; // hint may not be emitted for this profile shape

    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-alpha', confidenceBoost: 2.0 }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    const afterPromptStructure = result.hints.find((h) => h.category === 'prompt-structure')!;
    // prompt-structure hint should be unchanged
    expect(afterPromptStructure.predictedImpact).toBeUndefined();
    expect(afterPromptStructure.confidence).toBeCloseTo(baselinePromptStructure.confidence, 10);
  });
});

// ---------------------------------------------------------------------------
// analyzePromptOptimizations — ranking
// ---------------------------------------------------------------------------

describe('analyzePromptOptimizations — ranking by predictedImpact', () => {
  it('sorts hints by predictedImpact descending when vectors are supplied', () => {
    const profile = makeProfile({
      tokens: { meanInputTokens: 80_000, meanOutputTokens: 1_000, meanCacheHitRate: 0.6, totalCostNanoAiu: 100_000 },
    });
    // This profile should emit convergence + prompt-structure + context-management
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'context-management', skillId: 'skill-alpha', meanNetImpact: 0.9 }),
      makeVector({ category: 'convergence', skillId: 'skill-alpha', meanNetImpact: 0.3 }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    const withPredicted = result.hints.filter((h) => h.predictedImpact !== undefined);
    for (let i = 1; i < withPredicted.length; i++) {
      expect(withPredicted[i - 1]!.predictedImpact!).toBeGreaterThanOrEqual(
        withPredicted[i]!.predictedImpact!,
      );
    }
  });

  it('hint with highest meanNetImpact vector ranks first', () => {
    const profile = makeProfile({
      tokens: { meanInputTokens: 80_000, meanOutputTokens: 1_000, meanCacheHitRate: 0.6, totalCostNanoAiu: 100_000 },
    });
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-alpha', meanNetImpact: 0.1 }),
      makeVector({ category: 'context-management', skillId: 'skill-alpha', meanNetImpact: 0.95 }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    expect(result.hints[0]!.category).toBe('context-management');
  });
});

// ---------------------------------------------------------------------------
// analyzePromptOptimizations — edge cases
// ---------------------------------------------------------------------------

describe('analyzePromptOptimizations — edge cases', () => {
  it('vector for unrelated skill_id does not boost any hint', () => {
    const profile = makeProfile({ skillId: 'skill-alpha' });
    const baseline = analyzePromptOptimizations(profile);
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-OTHER', confidenceBoost: 2.0 }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    for (const hint of result.hints) {
      expect(hint.predictedImpact).toBeUndefined();
    }
    // confidences should be unchanged
    for (let i = 0; i < baseline.hints.length; i++) {
      expect(result.hints[i]!.confidence).toBeCloseTo(baseline.hints[i]!.confidence, 10);
    }
  });

  it('vectorCount === 0 produces confidenceBoost of 1.0 (no effect on prescriber hint.confidence)', () => {
    // confidenceBoost: 1.0 → hint.confidence * 1.0 = identity (unchanged).
    // This locks in the canary-bootstrap protection from Phase 4.5: when there
    // are no historical vectors yet, prescriber confidence is preserved as-is.
    const profile = makeProfile();
    const baseline = analyzePromptOptimizations(profile);
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-alpha', vectorCount: 0, confidenceBoost: computeConfidenceBoost(0) }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    const convBoosted = result.hints.find((h) => h.category === 'convergence')!;
    const convBase = baseline.hints.find((h) => h.category === 'convergence')!;
    // confidenceBoost === 1.0 → hint.confidence is exactly the pre-multiplied value (identity)
    expect(convBoosted.confidence).toBeCloseTo(convBase.confidence, 10);
    // Explicitly: confidenceBoost is 1.0 (computeConfidenceBoost(0))
    expect(vectors[0]!.confidenceBoost).toBe(1.0);
  });

  it('hint.confidence is capped at 1.0 even when confidenceBoost factor exceeds 1', () => {
    const profile = makeProfile();
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'convergence', skillId: 'skill-alpha', confidenceBoost: 999 }),
    ];
    const result = analyzePromptOptimizations(profile, undefined, vectors);
    const conv = result.hints.find((h) => h.category === 'convergence')!;
    expect(conv.confidence).toBeLessThanOrEqual(1.0);
  });

  it.todo('penalizes confidence on negative meanNetImpact (Wave 2 — deferred per Aaron policy 2026-05-03)');
});

// ---------------------------------------------------------------------------
// ChangeVectorSummary schema regression — confidenceBoost field
// ---------------------------------------------------------------------------

describe('ChangeVectorSummary schema regression — confidenceBoost field', () => {
  it('ChangeVectorSummary with explicit confidenceBoost is consumed correctly by prompt prescriber', () => {
    // If anyone reverts the rename to `confidence`, TypeScript will catch it at
    // compile-time and this test will fail at runtime. Double-layer regression guard.
    const summary: ChangeVectorSummary = {
      category: 'convergence',
      skillId: 'skill-alpha',
      meanNetImpact: 0.3,
      vectorCount: 3,
      confidenceBoost: 1.2,
    };

    const profile = makeProfile();
    const baseline = analyzePromptOptimizations(profile);
    const result = analyzePromptOptimizations(profile, undefined, [summary]);
    const convBase = baseline.hints.find((h) => h.category === 'convergence')!;
    const convBoosted = result.hints.find((h) => h.category === 'convergence')!;

    // summary.confidenceBoost === 1.2 → hint.confidence *= 1.2, capped at 1
    expect(convBoosted.confidence).toBeCloseTo(Math.min(1, convBase.confidence * 1.2), 5);
    expect(convBoosted.predictedImpact).toBeCloseTo(0.3, 5);
  });

  it('ChangeVectorSummary with confidenceBoost: 1.0 leaves hint.confidence exactly unchanged (identity)', () => {
    const summary: ChangeVectorSummary = {
      category: 'convergence',
      skillId: 'skill-alpha',
      meanNetImpact: 0.1,
      vectorCount: 0,
      confidenceBoost: 1.0,
    };

    const profile = makeProfile();
    const baseline = analyzePromptOptimizations(profile);
    const result = analyzePromptOptimizations(profile, undefined, [summary]);
    const convBase = baseline.hints.find((h) => h.category === 'convergence')!;
    const convBoosted = result.hints.find((h) => h.category === 'convergence')!;

    // × 1.0 is identity — hint.confidence must be exactly the pre-multiplied value
    expect(convBoosted.confidence).toBeCloseTo(convBase.confidence, 10);
  });
});

describe('analyzeTokenOptimizations — backward compatibility (no vectors)', () => {
  it('omitting historicalVectors produces the same hints as Phase 4.5', () => {
    const profile = makeTokenProfile({
      tokens: { meanInputTokens: 1_000, meanOutputTokens: 100, meanCacheHitRate: 0.1, totalCostNanoAiu: 100_000 },
    });
    const baseline = analyzeTokenOptimizations(profile);
    const withUndefined = analyzeTokenOptimizations(profile, undefined, undefined);
    const shapeOf = (r: ReturnType<typeof analyzeTokenOptimizations>) =>
      r.hints.map((h) => ({ category: h.category, impactScore: h.impactScore }));
    expect(shapeOf(baseline)).toEqual(shapeOf(withUndefined));
  });

  it('passing empty historicalVectors leaves hints unmodified', () => {
    const profile = makeTokenProfile({
      tokens: { meanInputTokens: 1_000, meanOutputTokens: 100, meanCacheHitRate: 0.1, totalCostNanoAiu: 100_000 },
    });
    const baseline = analyzeTokenOptimizations(profile);
    const withEmpty = analyzeTokenOptimizations(profile, undefined, []);
    expect(withEmpty.hints.length).toBe(baseline.hints.length);
    withEmpty.hints.forEach((h) => {
      expect(h.predictedImpact).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// analyzeTokenOptimizations — single vector boost
// ---------------------------------------------------------------------------

describe('analyzeTokenOptimizations — single vector boost', () => {
  it('boosts confidence on cache-optimization hint when a matching vector is supplied', () => {
    const profile = makeTokenProfile({
      tokens: { meanInputTokens: 1_000, meanOutputTokens: 100, meanCacheHitRate: 0.1, totalCostNanoAiu: 100_000 },
    });
    const baseline = analyzeTokenOptimizations(profile);
    const cacheBase = baseline.hints.find((h) => h.category === 'cache-optimization')!;
    expect(cacheBase).toBeDefined();
    const originalConfidence = cacheBase.confidence;

    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'cache-optimization', skillId: 'skill-alpha', confidenceBoost: 1.6, meanNetImpact: 0.3 }),
    ];
    const result = analyzeTokenOptimizations(profile, undefined, vectors);
    const cacheBoosted = result.hints.find((h) => h.category === 'cache-optimization')!;
    expect(cacheBoosted.confidence).toBeCloseTo(Math.min(1, originalConfidence * 1.6), 5);
    expect(cacheBoosted.predictedImpact).toBeCloseTo(0.3, 5);
  });

  it('sets predictedImpact from meanNetImpact of the matching vector', () => {
    const profile = makeTokenProfile({
      tokens: { meanInputTokens: 1_000, meanOutputTokens: 100, meanCacheHitRate: 0.1, totalCostNanoAiu: 100_000 },
    });
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'cache-optimization', skillId: 'skill-alpha', meanNetImpact: 0.55 }),
    ];
    const result = analyzeTokenOptimizations(profile, undefined, vectors);
    const cache = result.hints.find((h) => h.category === 'cache-optimization')!;
    expect(cache.predictedImpact).toBeCloseTo(0.55, 5);
  });
});

// ---------------------------------------------------------------------------
// analyzeTokenOptimizations — edge cases
// ---------------------------------------------------------------------------

describe('analyzeTokenOptimizations — edge cases', () => {
  it('vector for unrelated skill does not boost any hint', () => {
    const profile = makeTokenProfile({
      skillId: 'skill-alpha',
      tokens: { meanInputTokens: 1_000, meanOutputTokens: 100, meanCacheHitRate: 0.1, totalCostNanoAiu: 100_000 },
    });
    const baseline = analyzeTokenOptimizations(profile);
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'cache-optimization', skillId: 'skill-DIFFERENT', confidenceBoost: 5.0 }),
    ];
    const result = analyzeTokenOptimizations(profile, undefined, vectors);
    for (const hint of result.hints) {
      expect(hint.predictedImpact).toBeUndefined();
    }
    for (let i = 0; i < baseline.hints.length; i++) {
      expect(result.hints[i]!.confidence).toBeCloseTo(baseline.hints[i]!.confidence, 10);
    }
  });

  it('drift gate still applies even when historicalVectors are provided', () => {
    // If drift is RED (≥ 0.3), token prescriber returns no hints regardless of vectors.
    const redProfile = makeProfile({
      drift: { mean: 0.45, p50: 0.4, p95: 0.6, trend: 'degrading' },
      tokens: { meanInputTokens: 1_000, meanOutputTokens: 100, meanCacheHitRate: 0.05, totalCostNanoAiu: 100_000 },
    });
    const vectors: ChangeVectorSummary[] = [
      makeVector({ category: 'cache-optimization', skillId: 'skill-alpha', confidenceBoost: 10 }),
    ];
    const result = analyzeTokenOptimizations(redProfile, undefined, vectors);
    expect(result.hints).toEqual([]);
  });

  it.todo('penalizes confidence on negative meanNetImpact (Wave 2 — deferred per Aaron policy 2026-05-03)');
});
