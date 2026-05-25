import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as cairn from '@akubly/cairn';
import { loadExecutionProfile, type LoadedProfileSource, type TierFallbackContext } from '../index.js';

type ProfileSeed = Parameters<typeof cairn.upsertExecutionProfile>[0];

function makeProfile(
  skillId: string,
  source: LoadedProfileSource,
  sessionCount: number,
  granularityKey = 'global',
): ProfileSeed {
  return {
    skillId,
    granularity: source,
    granularityKey,
    sessionCount,
    drift: { mean: 0.25, p50: 0.2, p95: 0.65, trend: 'degrading' },
    token: { meanInput: 60_000, meanOutput: 40_000, meanCacheHit: 0.2, totalCost: 24_000_000 },
    outcome: { successRate: 0.85, meanConvergence: 12, toolErrorRate: 0.04 },
  };
}

function seedProfile(
  source: LoadedProfileSource,
  sessionCount: number,
  granularityKey = 'global',
): void {
  cairn.upsertExecutionProfile(makeProfile('skill-alpha', source, sessionCount, granularityKey));
}

function load(context?: TierFallbackContext) {
  return loadExecutionProfile(cairn.getDb(), 'skill-alpha', context);
}

function setUpdatedAt(source: LoadedProfileSource, granularityKey: string, updatedAt: string): void {
  cairn.getDb()
    .prepare(
      `UPDATE execution_profiles
         SET updated_at = ?
       WHERE skill_id = ? AND granularity = ? AND granularity_key = ?`,
    )
    .run(updatedAt, 'skill-alpha', source, granularityKey);
}

function setSessionsSinceInstall(count: number): void {
  cairn.getDb()
    .prepare('UPDATE prescriber_state SET sessions_since_install = ? WHERE id = 1')
    .run(count);
}

function loadAt(context?: TierFallbackContext): ReturnType<typeof loadExecutionProfile> {
  return loadExecutionProfile(cairn.getDb(), 'skill-alpha', context, { now: '2026-05-25T00:00:00.000Z' });
}

beforeEach(() => {
  cairn.closeDb();
  cairn.getDb(':memory:');
});

afterEach(() => {
  cairn.closeDb();
});

describe('loadExecutionProfile tier fallback', () => {
  it('walks per-skill to global when no identity keys are known', () => {
    seedProfile('global', 40);

    const loaded = load();

    expect(loaded?.source).toBe('global');
    expect(loaded?.profile.sessionCount).toBe(40);
  });

  it('prefers per-skill before global when no identity keys are known', () => {
    seedProfile('per-skill', 10);
    seedProfile('global', 40);

    const loaded = load();

    expect(loaded?.source).toBe('per-skill');
    expect(loaded?.profile.sessionCount).toBe(10);
  });

  it('prefers per-skill before identity-keyed tiers when context is known', () => {
    seedProfile('per-skill', 10);
    seedProfile('per-model', 20, 'gpt-5');
    seedProfile('per-user', 30, 'aaron');
    seedProfile('global', 40);

    const loaded = load({ modelId: 'gpt-5', userId: 'aaron' });

    expect(loaded?.source).toBe('per-skill');
    expect(loaded?.profile.sessionCount).toBe(10);
  });

  it('walks per-skill to per-model to global when only modelId is known', () => {
    seedProfile('per-model', 20, 'gpt-5');
    seedProfile('global', 40);

    const loaded = load({ modelId: 'gpt-5' });

    expect(loaded?.source).toBe('per-model');
    expect(loaded?.profile.granularityKey).toBe('gpt-5');
    expect(loaded?.profile.sessionCount).toBe(20);
  });

  it('falls through from missing per-model to global when only modelId is known', () => {
    seedProfile('global', 40);

    const loaded = load({ modelId: 'gpt-5' });

    expect(loaded?.source).toBe('global');
    expect(loaded?.profile.sessionCount).toBe(40);
  });

  it('walks the full per-skill to per-model to per-user to global chain when both keys are known', () => {
    seedProfile('per-user', 30, 'aaron');
    seedProfile('global', 40);

    const loaded = load({ modelId: 'gpt-5', userId: 'aaron' });

    expect(loaded?.source).toBe('per-user');
    expect(loaded?.profile.granularityKey).toBe('aaron');
    expect(loaded?.profile.sessionCount).toBe(30);
  });

  it('prefers per-model over per-user in the full chain', () => {
    seedProfile('per-model', 20, 'gpt-5');
    seedProfile('per-user', 30, 'aaron');
    seedProfile('global', 40);

    const loaded = load({ modelId: 'gpt-5', userId: 'aaron' });

    expect(loaded?.source).toBe('per-model');
    expect(loaded?.profile.sessionCount).toBe(20);
  });

  it('falls through from missing per-user to global in the full chain', () => {
    seedProfile('global', 40);

    const loaded = load({ modelId: 'missing-model', userId: 'missing-user' });

    expect(loaded?.source).toBe('global');
    expect(loaded?.profile.sessionCount).toBe(40);
  });

  it('skips tiers with unknown keys instead of querying them with global', () => {
    seedProfile('per-model', 20, 'global');
    seedProfile('global', 40);

    const loaded = load();

    expect(loaded?.source).toBe('global');
    expect(loaded?.profile.sessionCount).toBe(40);
  });

  it('does not use staleness to trigger fallback to a fresher lower tier', () => {
    seedProfile('per-model', 20, 'gpt-5');
    seedProfile('per-user', 30, 'aaron');
    seedProfile('global', 40);
    setUpdatedAt('per-model', 'gpt-5', '2020-01-01T00:00:00.000Z');
    setUpdatedAt('per-user', 'aaron', '2026-05-25T00:00:00.000Z');
    setUpdatedAt('global', 'global', '2026-05-25T00:00:00.000Z');

    const loaded = loadAt({ modelId: 'gpt-5', userId: 'aaron' });

    expect(loaded?.source).toBe('per-model');
    expect(loaded?.profile.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('annotates a fresh selected profile without confidence attenuation', () => {
    seedProfile('per-skill', 40);
    setUpdatedAt('per-skill', 'global', '2026-05-24T00:00:00.000Z');
    setSessionsSinceInstall(60);

    const loaded = loadAt();

    expect(loaded?.profile.confidence).toBe(1);
    expect(loaded?.profile.staleness).toEqual({ stale: false, reason: null });
  });

  it('attenuates confidence for a count-only stale selected profile', () => {
    seedProfile('per-skill', 40);
    setUpdatedAt('per-skill', 'global', '2026-05-24T00:00:00.000Z');
    setSessionsSinceInstall(91);

    const loaded = loadAt();

    expect(loaded?.profile.confidence).toBe(0.5);
    expect(loaded?.profile.staleness).toEqual({ stale: true, reason: 'count' });
  });

  it('attenuates confidence for an age-only stale selected profile', () => {
    seedProfile('per-skill', 40);
    setUpdatedAt('per-skill', 'global', '2026-05-17T23:59:59.000Z');
    setSessionsSinceInstall(60);

    const loaded = loadAt();

    expect(loaded?.profile.confidence).toBe(0.5);
    expect(loaded?.profile.staleness).toEqual({ stale: true, reason: 'age' });
  });

  it('attenuates confidence once when count and age thresholds both trip', () => {
    seedProfile('per-skill', 40);
    setUpdatedAt('per-skill', 'global', '2026-05-17T23:59:59.000Z');
    setSessionsSinceInstall(91);

    const loaded = loadAt();

    expect(loaded?.profile.confidence).toBe(0.5);
    expect(loaded?.profile.staleness).toEqual({ stale: true, reason: 'count+age' });
  });

  it('honors custom staleness thresholds and clamps attenuation to avoid confidence inflation', () => {
    seedProfile('per-skill', 40);
    setUpdatedAt('per-skill', 'global', '2026-05-25T00:00:00.000Z');
    setSessionsSinceInstall(46);

    const loaded = loadExecutionProfile(cairn.getDb(), 'skill-alpha', {}, {
      now: '2026-05-25T00:00:00.000Z',
      sessionCountThreshold: 5,
      attenuationFactor: 2,
    });

    expect(loaded?.profile.confidence).toBe(1);
    expect(loaded?.profile.staleness).toEqual({ stale: true, reason: 'count' });
  });

  it('returns null without staleness errors when no profile exists', () => {
    setSessionsSinceInstall(91);

    expect(loadAt()).toBeNull();
  });
});
