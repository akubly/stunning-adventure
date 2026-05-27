/**
 * W5-5: forge_prescribe MCP tool handler tests
 *
 * Three layers:
 *  1. Unit — handler with stub runForgePrescribe (orchestrator isolation)
 *  2. Integration — real :memory: DB, real prescriber run end-to-end
 *  3. Edge cases — missing skill, no session, force flag semantics
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cairn from '@akubly/cairn';
import { forgePrescribeHandler, type RunForgePrescribeFn } from '../mcp/handler.js';
import type { ForgePrescribeResult } from '../index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ProfileSeed = Parameters<typeof cairn.upsertExecutionProfile>[1];

function makeProfile(skillId: string, overrides: Partial<ProfileSeed> = {}): ProfileSeed {
  return {
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 15,
    drift: { mean: 0.3, p50: 0.25, p95: 0.7, trend: 'stable' },
    token: { meanInput: 60_000, meanOutput: 40_000, meanCacheHit: 0.2, totalCost: 24_000_000 },
    outcome: { successRate: 0.85, meanConvergence: 12, toolErrorRate: 0.04 },
    ...overrides,
  };
}

function makeSuccessResult(overrides: Partial<ForgePrescribeResult> = {}): ForgePrescribeResult {
  return {
    ok: true,
    exitCode: 0,
    skillId: 'skill-a',
    dbPath: ':memory:',
    profileSource: 'per-skill',
    hints: [],
    inserted: 2,
    skipped: 0,
    errored: 0,
    totalHints: 2,
    totalPersisted: 2,
    ...overrides,
  };
}

function makeErrorResult(overrides: Partial<ForgePrescribeResult> = {}): ForgePrescribeResult {
  return {
    ok: false,
    exitCode: 1,
    skillId: 'skill-missing',
    dbPath: ':memory:',
    message: 'No execution profile for skill `skill-missing`',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  cairn.closeDb();
  cairn.getDb(':memory:');
});

afterEach(() => {
  vi.restoreAllMocks();
  cairn.closeDb();
});

// ---------------------------------------------------------------------------
// Unit tests — handler with stub orchestrator
// ---------------------------------------------------------------------------

describe('forge_prescribe handler — unit (stub orchestrator)', () => {
  it('returns ok=true result and emits prescriber_run event (force=false)', async () => {
    const db = cairn.getDb();
    const sessionId = cairn.createSession(db, 'org/my-repo', 'main');

    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(makeSuccessResult());

    const result = await forgePrescribeHandler(db, { skill_id: 'skill-a', repo_key: 'org/my-repo' }, stub);

    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(2);

    // Verify prescriber_run event was logged
    const events = cairn.getUnprocessedEvents(db, 0);
    const prescribeEvents = events.filter(e => e.eventType === 'prescriber_run');
    expect(prescribeEvents).toHaveLength(1);
    const payload = JSON.parse(prescribeEvents[0]!.payload);
    expect(payload.skill_id).toBe('skill-a');
    expect(payload.force).toBe(false);
    expect(payload.session_id).toBe(sessionId);
    expect(payload.profile_used).toBe('per-skill');
    expect(payload.ts).toBeDefined();
    expect(payload.result.inserted).toBe(2);
    expect(payload.result.skipped).toBe(0);
  });

  it('passes forceRegenerate=true to orchestrator and records it in event', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/force-repo', 'main');

    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(
      makeSuccessResult({ skillId: 'skill-b', inserted: 3 }),
    );

    await forgePrescribeHandler(db, { skill_id: 'skill-b', force: true, repo_key: 'org/force-repo' }, stub);

    expect(stub).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'skill-b', forceRegenerate: true }),
    );

    const events = cairn.getUnprocessedEvents(db, 0);
    const evt = events.find(e => e.eventType === 'prescriber_run');
    const payload = JSON.parse(evt!.payload);
    expect(payload.force).toBe(true);
  });

  it('returns isError=true when prescriber fails', async () => {
    const db = cairn.getDb();
    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(makeErrorResult());

    const result = await forgePrescribeHandler(db, { skill_id: 'skill-missing' }, stub);

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.message).toMatch(/No execution profile/);
  });

  it('emits prescriber_run event even on failure', async () => {
    const db = cairn.getDb();
    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(
      makeErrorResult({ skillId: 'skill-err' }),
    );

    await forgePrescribeHandler(db, { skill_id: 'skill-err' }, stub);

    const events = cairn.getUnprocessedEvents(db, 0);
    const evt = events.find(e => e.eventType === 'prescriber_run');
    expect(evt).toBeDefined();
    const payload = JSON.parse(evt!.payload);
    expect(payload.skill_id).toBe('skill-err');
    expect(payload.profile_used).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — session fallback semantics (W5-1)
// ---------------------------------------------------------------------------

describe('forge_prescribe handler — session fallback', () => {
  it('uses getMostRecentUserSession when repo_key is omitted', async () => {
    const db = cairn.getDb();
    const userId = cairn.createSession(db, 'org/fallback-repo', 'main');

    const getMostRecentSpy = vi.spyOn(cairn, 'getMostRecentUserSession');
    const getActiveSpy = vi.spyOn(cairn, 'getActiveUserSession');

    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(makeErrorResult());
    await forgePrescribeHandler(db, { skill_id: 'any' }, stub);

    expect(getMostRecentSpy).toHaveBeenCalledWith(db);
    expect(getActiveSpy).not.toHaveBeenCalled();

    const events = cairn.getUnprocessedEvents(db, 0);
    const evt = events.find(e => e.eventType === 'prescriber_run');
    const payload = JSON.parse(evt!.payload);
    expect(payload.session_id).toBe(userId);
  });

  it('uses getActiveUserSession when repo_key is provided', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/explicit-repo', 'main');

    const getMostRecentSpy = vi.spyOn(cairn, 'getMostRecentUserSession');
    const getActiveSpy = vi.spyOn(cairn, 'getActiveUserSession');

    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(makeErrorResult());
    await forgePrescribeHandler(db, { skill_id: 'any', repo_key: 'org/explicit-repo' }, stub);

    expect(getActiveSpy).toHaveBeenCalledWith(db, 'org/explicit-repo');
    expect(getMostRecentSpy).not.toHaveBeenCalled();
  });

  it('falls back to system session when no user session exists', async () => {
    const db = cairn.getDb();
    // No user sessions created

    const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue(makeErrorResult({ skillId: 'no-session' }));
    const result = await forgePrescribeHandler(db, { skill_id: 'no-session' }, stub);

    expect(result).toBeDefined();

    const events = cairn.getUnprocessedEvents(db, 0);
    const evt = events.find(e => e.eventType === 'prescriber_run');
    expect(evt).toBeDefined();
    const payload = JSON.parse(evt!.payload);
    // session_id in payload is null (no user session found)
    expect(payload.session_id).toBeNull();
    // but the event was still persisted (logged to system session)
    expect(evt!.sessionId).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration test — real DB, real prescriber run
// ---------------------------------------------------------------------------

describe('forge_prescribe handler — integration (real DB)', () => {
  it('runs prescriber end-to-end: result returned + CairnEvent persisted', async () => {
    const db = cairn.getDb();
    const sessionId = cairn.createSession(db, 'org/integration-repo', 'main');

    // Seed an execution profile so the prescriber actually runs
    cairn.upsertExecutionProfile(db, makeProfile('skill-integration'));

    const result = await forgePrescribeHandler(db, {
      skill_id: 'skill-integration',
      repo_key: 'org/integration-repo',
    });

    const body = JSON.parse(result.content[0]!.text);
    expect(body.ok).toBe(true);
    expect(body.skillId).toBe('skill-integration');
    expect(typeof body.inserted).toBe('number');
    expect(typeof body.skipped).toBe('number');

    // prescriber_run CairnEvent was persisted
    const events = cairn.getUnprocessedEvents(db, 0);
    const prescribeEvents = events.filter(e => e.eventType === 'prescriber_run');
    expect(prescribeEvents).toHaveLength(1);

    const payload = JSON.parse(prescribeEvents[0]!.payload);
    expect(payload.skill_id).toBe('skill-integration');
    expect(payload.session_id).toBe(sessionId);
    expect(payload.force).toBe(false);
    expect(typeof payload.ts).toBe('string');
    expect(payload.result).toBeDefined();
    expect(typeof payload.result.inserted).toBe('number');
  });

  it('force=true re-generates hints: skipped becomes 0 after active hints exist', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/force-integration', 'main');
    cairn.upsertExecutionProfile(db, makeProfile('skill-force', { sessionCount: 20 }));

    // First run — may insert hints
    const run1 = await forgePrescribeHandler(db, {
      skill_id: 'skill-force',
      repo_key: 'org/force-integration',
    });
    const body1 = JSON.parse(run1.content[0]!.text);
    expect(body1.ok).toBe(true);

    // Second run without force — dedup should kick in
    const run2 = await forgePrescribeHandler(db, {
      skill_id: 'skill-force',
      repo_key: 'org/force-integration',
    });
    const body2 = JSON.parse(run2.content[0]!.text);
    expect(body2.ok).toBe(true);

    // Third run with force — active hints expired, so re-insertion succeeds
    const run3 = await forgePrescribeHandler(db, {
      skill_id: 'skill-force',
      force: true,
      repo_key: 'org/force-integration',
    });
    const body3 = JSON.parse(run3.content[0]!.text);
    expect(body3.ok).toBe(true);
    if (body1.inserted > 0) {
      expect(body3.skipped).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('forge_prescribe handler — edge cases', () => {
  it('returns structured error (not thrown exception) when skill has no profile', async () => {
    const db = cairn.getDb();
    // No profile seeded — real runForgePrescribe returns ok: false

    const result = await forgePrescribeHandler(db, { skill_id: 'skill-no-profile' });

    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text);
    expect(body.ok).toBe(false);
    expect(body.message).toBeDefined();
  });

  it('force=false default: active hints are skipped on second run', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/no-force-repo', 'main');
    cairn.upsertExecutionProfile(db, makeProfile('skill-no-force', { sessionCount: 20 }));

    const run1 = await forgePrescribeHandler(db, {
      skill_id: 'skill-no-force',
      repo_key: 'org/no-force-repo',
    });
    const body1 = JSON.parse(run1.content[0]!.text);
    const firstInserted = body1.inserted as number;

    const run2 = await forgePrescribeHandler(db, {
      skill_id: 'skill-no-force',
      repo_key: 'org/no-force-repo',
    });
    const body2 = JSON.parse(run2.content[0]!.text);

    if (firstInserted > 0) {
      expect(body2.skipped).toBeGreaterThan(0);
    }
  });
});
