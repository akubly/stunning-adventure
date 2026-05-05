import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  upsertExecutionProfile,
  getExecutionProfile,
  listExecutionProfilesForSkill,
  listExecutionProfiles,
  deleteExecutionProfile,
} from '../db/executionProfiles.js';
import type { ExecutionProfileUpsert } from '../db/executionProfiles.js';

function profile(overrides?: Partial<ExecutionProfileUpsert>): ExecutionProfileUpsert {
  return {
    skillId: 'skill-a',
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 10,
    drift: { mean: 0.2, p50: 0.18, p95: 0.45, trend: 'stable' },
    token: { meanInput: 1200, meanOutput: 400, meanCacheHit: 0.6, totalCost: 1500 },
    outcome: { successRate: 0.92, meanConvergence: 3.5, toolErrorRate: 0.03 },
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('execution profile persistence', () => {
  it('inserts and round-trips a profile', () => {
    const id = upsertExecutionProfile(profile());
    expect(id).toBeGreaterThan(0);

    const loaded = getExecutionProfile('skill-a', 'per-skill', 'global');
    expect(loaded).not.toBeNull();
    expect(loaded!.skillId).toBe('skill-a');
    expect(loaded!.granularity).toBe('per-skill');
    expect(loaded!.granularityKey).toBe('global');
    expect(loaded!.sessionCount).toBe(10);
    expect(loaded!.drift.mean).toBeCloseTo(0.2);
    expect(loaded!.drift.trend).toBe('stable');
    expect(loaded!.token.meanInput).toBe(1200);
    expect(loaded!.token.totalCost).toBe(1500);
    expect(loaded!.outcome.successRate).toBeCloseTo(0.92);
    expect(loaded!.updatedAt).toBeDefined();
  });

  it('defaults granularityKey to "global" when omitted', () => {
    upsertExecutionProfile(profile({ granularityKey: undefined }));
    const loaded = getExecutionProfile('skill-a', 'per-skill');
    expect(loaded).not.toBeNull();
    expect(loaded!.granularityKey).toBe('global');
  });

  it('upsert replaces values for the same composite key', () => {
    const id1 = upsertExecutionProfile(profile({ sessionCount: 5 }));
    const id2 = upsertExecutionProfile(
      profile({ sessionCount: 17, drift: { mean: 0.3, p50: 0.25, p95: 0.6, trend: 'degrading' } }),
    );
    expect(id1).toBe(id2);

    const loaded = getExecutionProfile('skill-a', 'per-skill', 'global');
    expect(loaded!.sessionCount).toBe(17);
    expect(loaded!.drift.trend).toBe('degrading');
    expect(listExecutionProfilesForSkill('skill-a')).toHaveLength(1);
  });

  it('treats different granularity keys as distinct profiles', () => {
    upsertExecutionProfile(profile({ granularity: 'per-user', granularityKey: 'alice' }));
    upsertExecutionProfile(profile({ granularity: 'per-user', granularityKey: 'bob' }));
    upsertExecutionProfile(profile({ granularity: 'per-model', granularityKey: 'gpt-5' }));

    expect(listExecutionProfilesForSkill('skill-a')).toHaveLength(3);
    expect(getExecutionProfile('skill-a', 'per-user', 'alice')).not.toBeNull();
    expect(getExecutionProfile('skill-a', 'per-user', 'bob')).not.toBeNull();
    expect(getExecutionProfile('skill-a', 'per-model', 'gpt-5')).not.toBeNull();
    expect(getExecutionProfile('skill-a', 'per-user', 'carol')).toBeNull();
  });

  it('lists profiles across skills', () => {
    upsertExecutionProfile(profile({ skillId: 'skill-a' }));
    upsertExecutionProfile(profile({ skillId: 'skill-b' }));
    upsertExecutionProfile(profile({ skillId: 'skill-c' }));

    const all = listExecutionProfiles();
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.skillId).sort()).toEqual(['skill-a', 'skill-b', 'skill-c']);
  });

  it('respects limit on listExecutionProfiles', () => {
    upsertExecutionProfile(profile({ skillId: 'skill-a' }));
    upsertExecutionProfile(profile({ skillId: 'skill-b' }));
    upsertExecutionProfile(profile({ skillId: 'skill-c' }));
    expect(listExecutionProfiles(2)).toHaveLength(2);
  });

  it('deletes a profile by composite key', () => {
    upsertExecutionProfile(profile());
    expect(deleteExecutionProfile('skill-a', 'per-skill', 'global')).toBe(true);
    expect(getExecutionProfile('skill-a', 'per-skill', 'global')).toBeNull();
    expect(deleteExecutionProfile('skill-a', 'per-skill', 'global')).toBe(false);
  });
});
