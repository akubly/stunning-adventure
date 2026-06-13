import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, getExecutionProfile } from '@akubly/cairn';
import { runForgeSeedProfile, main } from '../forge-seed-profile.js';

beforeEach(() => {
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('forge-seed-profile CLI', () => {
  it('seeds a per-skill/global execution profile with sessionCount = N', () => {
    runForgeSeedProfile({ skillId: 'foo', sessionCount: 5 });

    const db = getDb();
    const profile = getExecutionProfile(db, 'foo', 'per-skill', 'global');
    expect(profile).not.toBeNull();
    expect(profile!.sessionCount).toBe(5);
  });

  it('also seeds a global/global profile', () => {
    runForgeSeedProfile({ skillId: 'foo', sessionCount: 3 });

    const db = getDb();
    const globalProfile = getExecutionProfile(db, 'global', 'global', 'global');
    expect(globalProfile).not.toBeNull();
    expect(globalProfile!.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it('exits 2 when --skill is missing', async () => {
    const exitCode = await main(['--session-count', '3']);
    expect(exitCode).toBe(2);
  });

  it('exits 2 when --session-count is missing', async () => {
    const exitCode = await main(['--skill', 'bar']);
    expect(exitCode).toBe(2);
  });

  it('exits 2 when --session-count is not a positive integer', async () => {
    const exitCode = await main(['--skill', 'baz', '--session-count', '0']);
    expect(exitCode).toBe(2);
  });

  it('exits 2 when --session-count exceeds the upper bound (10 000)', async () => {
    const exitCode = await main(['--skill', 'qux', '--session-count', '10001']);
    expect(exitCode).toBe(2);
  });

  it('runForgeSeedProfile throws when sessionCount exceeds 10 000', () => {
    expect(() => runForgeSeedProfile({ skillId: 'x', sessionCount: 10_001 })).toThrow();
  });
});
