import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeDb,
  getDb,
  upsertExecutionProfile,
  createSession,
  logEvent,
  ensureSystemSession,
} from '@akubly/cairn';
import type { ExecutionProfileUpsert } from '@akubly/cairn';
import { formatJson, formatTable } from '../metrics/formatters.js';
import { loadMetrics } from '../metrics/loadMetrics.js';
import type { SkillMetrics } from '../metrics/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(skillId: string, overrides: Partial<ExecutionProfileUpsert> = {}): ExecutionProfileUpsert {
  return {
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 10,
    drift: { mean: 0.2, p50: 0.18, p95: 0.5, trend: 'stable' },
    token: { meanInput: 50_000, meanOutput: 30_000, meanCacheHit: 0.3, totalCost: 15_000_000 },
    outcome: { successRate: 0.9, meanConvergence: 8, toolErrorRate: 0.02 },
    ...overrides,
  };
}

const NOW = new Date('2026-05-26T22:00:00.000Z');

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Unit: JSON formatter
// ---------------------------------------------------------------------------

describe('formatJson', () => {
  it('serialises a metrics snapshot with profile as valid JSON', () => {
    const metrics: SkillMetrics = {
      skillId: 'my-skill',
      repoKey: 'my-repo',
      queriedAt: '2026-05-26T22:00:00.000Z',
      profile: {
        found: true,
        tier: 'per-skill',
        sessionCount: 10,
        updatedAt: '2026-05-24T12:00:00.000Z',
        daysSinceUpdate: 2,
      },
      staleness: { stale: false, reason: null, sessionsSinceUpdate: 5 },
      confidence: { raw: 1.0, attenuated: 1.0, isAttenuated: false },
      autoApplyEligible: true,
      recentPrescriberRuns: null,
    };

    const out = formatJson(metrics);
    const parsed = JSON.parse(out) as SkillMetrics;
    expect(parsed.skillId).toBe('my-skill');
    expect(parsed.profile.found).toBe(true);
    expect(parsed.staleness?.stale).toBe(false);
    expect(parsed.confidence?.raw).toBe(1.0);
    expect(parsed.recentPrescriberRuns).toBeNull();
  });

  it('serialises a no-profile snapshot', () => {
    const metrics: SkillMetrics = {
      skillId: 'ghost',
      repoKey: null,
      queriedAt: '2026-05-26T22:00:00.000Z',
      profile: { found: false },
      staleness: null,
      confidence: null,
      autoApplyEligible: null,
      recentPrescriberRuns: null,
    };

    const out = formatJson(metrics);
    const parsed = JSON.parse(out) as SkillMetrics;
    expect(parsed.profile.found).toBe(false);
    expect(parsed.staleness).toBeNull();
    expect(parsed.confidence).toBeNull();
    expect(parsed.autoApplyEligible).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit: table formatter
// ---------------------------------------------------------------------------

describe('formatTable', () => {
  it('includes all section headers in table output', () => {
    const metrics: SkillMetrics = {
      skillId: 'skill-a',
      repoKey: 'repo-a',
      queriedAt: '2026-05-26T22:00:00.000Z',
      profile: {
        found: true,
        tier: 'global',
        sessionCount: 42,
        updatedAt: '2026-05-24T12:00:00.000Z',
        daysSinceUpdate: 2,
      },
      staleness: { stale: true, reason: 'count', sessionsSinceUpdate: 60 },
      confidence: { raw: 1.0, attenuated: 0.5, isAttenuated: true },
      autoApplyEligible: true,
      recentPrescriberRuns: [],
    };

    const out = formatTable(metrics);
    expect(out).toContain('Identity');
    expect(out).toContain('Profile');
    expect(out).toContain('Staleness');
    expect(out).toContain('Confidence');
    expect(out).toContain('Auto-Apply');
    expect(out).toContain('Recent Prescriber Runs');
  });

  it('shows stale flag and reason in table', () => {
    const metrics: SkillMetrics = {
      skillId: 'skill-b',
      repoKey: null,
      queriedAt: '2026-05-26T22:00:00.000Z',
      profile: {
        found: true,
        tier: 'per-skill',
        sessionCount: 10,
        updatedAt: '2026-05-10T00:00:00.000Z',
        daysSinceUpdate: 16,
      },
      staleness: { stale: true, reason: 'age', sessionsSinceUpdate: 3 },
      confidence: { raw: 1.0, attenuated: 0.5, isAttenuated: true },
      autoApplyEligible: true,
      recentPrescriberRuns: null,
    };

    const out = formatTable(metrics);
    expect(out).toContain('true');
    expect(out).toContain('age');
    expect(out).toContain('W5-5 not landed');
  });

  it('shows (no profile) when profile is missing', () => {
    const metrics: SkillMetrics = {
      skillId: 'ghost',
      repoKey: null,
      queriedAt: '2026-05-26T22:00:00.000Z',
      profile: { found: false },
      staleness: null,
      confidence: null,
      autoApplyEligible: null,
      recentPrescriberRuns: null,
    };

    const out = formatTable(metrics);
    expect(out).toContain('false — no profile for this skill');
  });

  it('renders prescriber run rows when present', () => {
    const metrics: SkillMetrics = {
      skillId: 'skill-c',
      repoKey: 'repo-x',
      queriedAt: '2026-05-26T22:00:00.000Z',
      profile: { found: true, tier: 'per-skill', sessionCount: 5, updatedAt: '2026-05-26T00:00:00.000Z', daysSinceUpdate: 0 },
      staleness: { stale: false, reason: null, sessionsSinceUpdate: 0 },
      confidence: { raw: 1.0, attenuated: 1.0, isAttenuated: false },
      autoApplyEligible: true,
      recentPrescriberRuns: [
        {
          triggeredBy: 'mcp:forge_prescribe',
          profileSource: 'per-skill',
          inserted: 3,
          skipped: 1,
          errored: 0,
          totalHints: 4,
          occurredAt: '2026-05-25T10:00:00Z',
        },
      ],
    };

    const out = formatTable(metrics);
    expect(out).toContain('mcp:forge_prescribe');
    expect(out).toContain('inserted=3');
  });
});

// ---------------------------------------------------------------------------
// Integration: loadMetrics
// ---------------------------------------------------------------------------

describe('loadMetrics integration', () => {
  it('returns found=false and recentPrescriberRuns=null when skill has no profile', () => {
    const metrics = loadMetrics({ skillId: 'no-such-skill', now: NOW });

    expect(metrics.skillId).toBe('no-such-skill');
    expect(metrics.profile.found).toBe(false);
    expect(metrics.staleness).toBeNull();
    expect(metrics.confidence).toBeNull();
    expect(metrics.autoApplyEligible).toBeNull();
    // No prescriber_run events seeded — W5-5 not present
    expect(metrics.recentPrescriberRuns).toBeNull();
  });

  it('returns a fresh profile with no attenuation when session count is under threshold', () => {
    const db = getDb();
    upsertExecutionProfile(db, makeProfile('skill-fresh', { sessionCount: 10 }));

    const metrics = loadMetrics({ skillId: 'skill-fresh', now: NOW });

    expect(metrics.profile.found).toBe(true);
    if (!metrics.profile.found) throw new Error('unreachable');
    expect(metrics.profile.tier).toBe('per-skill');
    expect(metrics.profile.sessionCount).toBe(10);
    expect(metrics.staleness?.stale).toBe(false);
    expect(metrics.confidence?.isAttenuated).toBe(false);
    expect(metrics.confidence?.attenuated).toBeCloseTo(1.0);
    expect(metrics.autoApplyEligible).toBe(true);
  });

  it('returns stale=true and attenuated confidence when session count exceeds threshold', () => {
    const db = getDb();
    // Seed a profile with low sessionCount so there's a large gap to currentSessions
    upsertExecutionProfile(db, makeProfile('skill-stale', { sessionCount: 1 }));

    // Directly set sessions_since_install to push past the 50-session threshold
    db.prepare('UPDATE prescriber_state SET sessions_since_install = 60 WHERE id = 1').run();

    const metrics = loadMetrics({ skillId: 'skill-stale', now: NOW });

    expect(metrics.profile.found).toBe(true);
    expect(metrics.staleness?.stale).toBe(true);
    expect(metrics.confidence?.isAttenuated).toBe(true);
    expect(metrics.confidence?.attenuated).toBeCloseTo(0.5);
    expect(metrics.confidence?.raw).toBeCloseTo(1.0);
    // 0.5 >= 0.1 (ATTENUATION_FLOOR) so still eligible
    expect(metrics.autoApplyEligible).toBe(true);
  });

  it('uses full-chain tier fallback — reports global when only global profile exists', () => {
    const db = getDb();
    upsertExecutionProfile(db, makeProfile('skill-global', { granularity: 'global' }));

    const metrics = loadMetrics({ skillId: 'skill-global', now: NOW });

    expect(metrics.profile.found).toBe(true);
    if (!metrics.profile.found) throw new Error('unreachable');
    expect(metrics.profile.tier).toBe('global');
  });

  it('resolves repoKey from most-recent user session when not provided', () => {
    const db = getDb();
    createSession(db, 'auto-repo');
    upsertExecutionProfile(db, makeProfile('skill-repo'));

    const metrics = loadMetrics({ skillId: 'skill-repo', now: NOW });

    expect(metrics.repoKey).toBe('auto-repo');
  });

  it('returns recentPrescriberRuns=[] (not null) when prescriber_run events exist but none for this skill', () => {
    const db = getDb();
    upsertExecutionProfile(db, makeProfile('skill-no-runs'));
    const systemSessionId = ensureSystemSession(db);
    logEvent(db, systemSessionId, 'prescriber_run', {
      skillId: 'other-skill',
      triggeredBy: 'mcp:forge_prescribe',
      profileSource: 'per-skill',
      result: { inserted: 1, skipped: 0, errored: 0, totalHints: 1 },
    });

    const metrics = loadMetrics({ skillId: 'skill-no-runs', now: NOW });

    // prescriber_run events exist in the log, but none for this skill
    expect(metrics.recentPrescriberRuns).toEqual([]);
  });

  it('returns parsed prescriber_run events for the correct skill', () => {
    const db = getDb();
    upsertExecutionProfile(db, makeProfile('skill-with-runs'));
    const systemSessionId = ensureSystemSession(db);
    logEvent(db, systemSessionId, 'prescriber_run', {
      skillId: 'skill-with-runs',
      triggeredBy: 'mcp:forge_prescribe',
      profileSource: 'per-skill',
      result: { inserted: 3, skipped: 1, errored: 0, totalHints: 4 },
    });
    // Event for a different skill should not appear
    logEvent(db, systemSessionId, 'prescriber_run', {
      skillId: 'other-skill',
      triggeredBy: 'mcp:forge_prescribe',
      profileSource: null,
      result: { inserted: 0, skipped: 0, errored: 0, totalHints: 0 },
    });

    const metrics = loadMetrics({ skillId: 'skill-with-runs', now: NOW });

    expect(Array.isArray(metrics.recentPrescriberRuns)).toBe(true);
    expect(metrics.recentPrescriberRuns).toHaveLength(1);
    const run = metrics.recentPrescriberRuns![0];
    expect(run.triggeredBy).toBe('mcp:forge_prescribe');
    expect(run.profileSource).toBe('per-skill');
    expect(run.inserted).toBe(3);
    expect(run.totalHints).toBe(4);
  });
});
