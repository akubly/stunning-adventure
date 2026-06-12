/**
 * profileBuilder — London-school interface-contract tests (Slice 2).
 *
 * All dependencies are injected mocks. These tests assert the seam contract:
 * - Per-skill profiles built for each distinct non-null skill_id
 * - A global/global profile aggregating ALL samples (including null-skill)
 * - NULL-skill samples fold into global only (not into any per-skill profile)
 * - Row→SignalSample mapping is explicit and correct
 * - Empty input → no upserts, sane BuildResult
 * - Persister called with correct granularity / granularityKey
 */

import { describe, it, expect, vi, type MockedFunction } from 'vitest';
import { buildProfiles } from '../agents/profileBuilder.js';
import type { SignalSampleRow } from '../db/signalSamples.js';
import type { ExecutionProfileUpsert } from '../db/executionProfiles.js';
import type { SignalSample, AggregationResult } from '@akubly/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<SignalSampleRow> = {}): SignalSampleRow {
  return {
    id: 1,
    kind: 'drift',
    sessionId: 'sess-001',
    skillId: 'skill-a',
    value: 0.3,
    metadata: { level: 'GREEN' },
    collectedAt: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:01.000Z',
    ...overrides,
  };
}

function makeAggResult(skillId: string, granularity: string, granularityKey: string): AggregationResult {
  return {
    profile: {
      skillId,
      granularity: granularity as import('@akubly/types').ProfileGranularity,
      granularityKey,
      sessionCount: 1,
      drift: { mean: 0.3, p50: 0.3, p95: 0.3, trend: 'stable' },
      tokens: { meanInputTokens: 0, meanOutputTokens: 0, meanCacheHitRate: 0, totalCostNanoAiu: 0 },
      outcomes: { successRate: 0, meanConvergenceTurns: 0, toolErrorRate: 0 },
      signals: { convergence: 0, tokenPressure: 0, toolEntropy: 0, contextBloat: 0, promptStability: 0 },
      updatedAt: new Date().toISOString(),
    },
    samplesConsumed: 1,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildProfiles', () => {
  it('returns an empty BuildResult and calls no persister when there are no samples', () => {
    const reader = vi.fn().mockReturnValue([]);
    const persister = vi.fn();
    const aggregator = vi.fn();

    const result = buildProfiles(null as never, { reader, persister, aggregator });

    expect(result.profilesBuilt).toBe(0);
    expect(result.skillIds).toEqual([]);
    expect(result.samplesConsumed).toBe(0);
    expect(persister).not.toHaveBeenCalled();
    expect(aggregator).not.toHaveBeenCalled();
  });

  it('builds one per-skill profile per distinct non-null skill_id', () => {
    const rows = [
      makeRow({ skillId: 'skill-a', sessionId: 's1' }),
      makeRow({ skillId: 'skill-b', sessionId: 's2' }),
      makeRow({ skillId: 'skill-b', sessionId: 's3' }),
    ];
    const reader = vi.fn().mockReturnValue(rows);
    const persister = vi.fn().mockReturnValue(1);
    const aggregator = vi.fn((_: unknown, samples: SignalSample[], granularity: string, key: string) =>
      makeAggResult(samples[0]?.skillId ?? 'unknown', granularity, key),
    ) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    const result = buildProfiles(null as never, { reader, persister, aggregator });

    // skill-a, skill-b → 2 per-skill + 1 global = 3 profiles
    expect(result.profilesBuilt).toBe(3);
    expect(result.skillIds.sort()).toEqual(['global', 'skill-a', 'skill-b']);

    // Persister should be called 3 times
    expect(persister).toHaveBeenCalledTimes(3);

    // Find the per-skill calls
    const calls = persister.mock.calls.map((c) => c[0] as ExecutionProfileUpsert);
    const perSkillA = calls.find((c) => c.skillId === 'skill-a');
    const perSkillB = calls.find((c) => c.skillId === 'skill-b');
    const global = calls.find((c) => c.skillId === 'global');

    expect(perSkillA).toBeDefined();
    expect(perSkillA!.granularity).toBe('per-skill');
    expect(perSkillA!.granularityKey).toBe('global');

    expect(perSkillB).toBeDefined();
    expect(perSkillB!.granularity).toBe('per-skill');
    expect(perSkillB!.granularityKey).toBe('global');

    expect(global).toBeDefined();
    expect(global!.granularity).toBe('global');
    expect(global!.granularityKey).toBe('global');
  });

  it('folds NULL-skill samples into global only — not into any per-skill profile', () => {
    const rows = [
      makeRow({ skillId: 'skill-a', sessionId: 's1' }),
      makeRow({ skillId: null, sessionId: 's2' }),    // null skill
      makeRow({ skillId: null, sessionId: 's3' }),    // null skill
    ];
    const reader = vi.fn().mockReturnValue(rows);
    const persister = vi.fn().mockReturnValue(1);

    // Spy aggregator: capture what samples are passed per invocation
    const aggregatorCalls: Array<{ skillId: string; samples: SignalSample[] }> = [];
    const aggregator = vi.fn((_: unknown, samples: SignalSample[], granularity: string, key: string) => {
      // Determine identity for later inspection
      const id = granularity === 'global' ? 'global' : (samples[0]?.skillId ?? 'unknown');
      aggregatorCalls.push({ skillId: id, samples });
      return makeAggResult(id, granularity, key);
    }) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    buildProfiles(null as never, { reader, persister, aggregator });

    // Only one per-skill call: skill-a
    const perSkillCall = aggregatorCalls.find((c) => c.skillId === 'skill-a');
    expect(perSkillCall).toBeDefined();
    // Must only receive skill-a samples — not the null-skill ones
    expect(perSkillCall!.samples.every((s) => s.skillId === 'skill-a')).toBe(true);

    // Global call receives ALL samples (including null-skill ones)
    const globalCall = aggregatorCalls.find((c) => c.skillId === 'global');
    expect(globalCall).toBeDefined();
    expect(globalCall!.samples).toHaveLength(3);
  });

  it('maps SignalSampleRow fields to SignalSample correctly (null skillId → undefined)', () => {
    const row = makeRow({
      kind: 'token',
      sessionId: 'sess-mapping',
      skillId: null,
      value: 0.77,
      metadata: { totalInput: 500 },
      collectedAt: '2026-06-10T10:00:00.000Z',
    });
    const reader = vi.fn().mockReturnValue([row]);
    const persister = vi.fn().mockReturnValue(1);

    let capturedGlobalSamples: SignalSample[] = [];
    const aggregator = vi.fn((_: unknown, samples: SignalSample[], granularity: string, key: string) => {
      if (granularity === 'global') capturedGlobalSamples = samples;
      return makeAggResult('global', granularity, key);
    }) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    buildProfiles(null as never, { reader, persister, aggregator });

    // Global aggregator should have received the mapped sample
    expect(capturedGlobalSamples).toHaveLength(1);
    const mapped = capturedGlobalSamples[0]!;
    expect(mapped.kind).toBe('token');
    expect(mapped.sessionId).toBe('sess-mapping');
    expect(mapped.skillId).toBeUndefined();   // null → undefined
    expect(mapped.value).toBeCloseTo(0.77);
    expect(mapped.metadata).toEqual({ totalInput: 500 });
    expect(mapped.collectedAt).toBe('2026-06-10T10:00:00.000Z');
  });

  it('aggregates all samples (including null-skill) for the global profile', () => {
    const rows = [
      makeRow({ skillId: 'skill-x', sessionId: 's1', value: 0.1 }),
      makeRow({ skillId: null,     sessionId: 's2', value: 0.9 }),
    ];
    const reader = vi.fn().mockReturnValue(rows);
    const persister = vi.fn().mockReturnValue(1);

    let globalSampleCount = 0;
    const aggregator = vi.fn((_: unknown, samples: SignalSample[], granularity: string, key: string) => {
      if (granularity === 'global') globalSampleCount = samples.length;
      return makeAggResult('any', granularity, key);
    }) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    buildProfiles(null as never, { reader, persister, aggregator });

    expect(globalSampleCount).toBe(2);
  });

  it('samplesConsumed reflects all rows read', () => {
    const rows = [
      makeRow({ skillId: 'skill-a', sessionId: 's1' }),
      makeRow({ skillId: 'skill-a', sessionId: 's2' }),
      makeRow({ skillId: null, sessionId: 's3' }),
    ];
    const reader = vi.fn().mockReturnValue(rows);
    const persister = vi.fn().mockReturnValue(1);
    const aggregator = vi.fn((_: unknown, samples: SignalSample[], g: string, k: string) =>
      makeAggResult('x', g, k),
    ) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    const result = buildProfiles(null as never, { reader, persister, aggregator });

    expect(result.samplesConsumed).toBe(3);
  });

  it('passes all three expected granularity+key pairs to the persister', () => {
    const rows = [
      makeRow({ skillId: 'skill-z', sessionId: 's1' }),
    ];
    const reader = vi.fn().mockReturnValue(rows);
    const persister = vi.fn().mockReturnValue(1);
    const aggregator = vi.fn((_: unknown, samples: SignalSample[], g: string, k: string) =>
      makeAggResult(g === 'global' ? 'global' : (samples[0]?.skillId ?? 'unknown'), g, k),
    ) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    buildProfiles(null as never, { reader, persister, aggregator });

    const calls = persister.mock.calls.map((c) => c[0] as ExecutionProfileUpsert);

    const perSkill = calls.find((c) => c.granularity === 'per-skill');
    expect(perSkill).toBeDefined();
    expect(perSkill!.granularityKey).toBe('global');
    expect(perSkill!.skillId).toBe('skill-z');

    const global = calls.find((c) => c.granularity === 'global');
    expect(global).toBeDefined();
    expect(global!.granularityKey).toBe('global');
    expect(global!.skillId).toBe('global');
  });

  it('maps ExecutionProfile token/outcome field names to ExecutionProfileUpsert correctly', () => {
    const row = makeRow({ skillId: 'skill-q', sessionId: 's1', kind: 'token' });
    const reader = vi.fn().mockReturnValue([row]);
    const persister = vi.fn().mockReturnValue(1);

    // Return a profile with known values to verify the field-name mapping
    const aggregator = vi.fn((_: unknown, _s: SignalSample[], granularity: string, key: string) => ({
      profile: {
        skillId: granularity === 'global' ? 'global' : 'skill-q',
        granularity: granularity as import('@akubly/types').ProfileGranularity,
        granularityKey: key,
        sessionCount: 5,
        drift: { mean: 0.2, p50: 0.18, p95: 0.45, trend: 'stable' as const },
        tokens: {
          meanInputTokens: 1200,
          meanOutputTokens: 400,
          meanCacheHitRate: 0.6,
          totalCostNanoAiu: 9999,
        },
        outcomes: {
          successRate: 0.92,
          meanConvergenceTurns: 3.5,
          toolErrorRate: 0.03,
        },
        signals: { convergence: 0, tokenPressure: 0, toolEntropy: 0, contextBloat: 0, promptStability: 0 },
        updatedAt: new Date().toISOString(),
      },
      samplesConsumed: 1,
    })) as MockedFunction<typeof import('@akubly/types').aggregateSignals>;

    buildProfiles(null as never, { reader, persister, aggregator });

    const calls = persister.mock.calls.map((c) => c[0] as ExecutionProfileUpsert);
    const perSkill = calls.find((c) => c.skillId === 'skill-q')!;

    // Verify the field-name translation from ExecutionProfile → ExecutionProfileUpsert
    expect(perSkill.sessionCount).toBe(5);
    expect(perSkill.token.meanInput).toBeCloseTo(1200);
    expect(perSkill.token.meanOutput).toBeCloseTo(400);
    expect(perSkill.token.meanCacheHit).toBeCloseTo(0.6);
    expect(perSkill.token.totalCost).toBeCloseTo(9999);
    expect(perSkill.outcome.successRate).toBeCloseTo(0.92);
    expect(perSkill.outcome.meanConvergence).toBeCloseTo(3.5);
    expect(perSkill.outcome.toolErrorRate).toBeCloseTo(0.03);
    expect(perSkill.drift.mean).toBeCloseTo(0.2);
    expect(perSkill.drift.trend).toBe('stable');
  });
});
