import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '@akubly/cairn';
import { createPrescriberOrchestrationConfig, runForgePrescribe } from '@akubly/skillsmith-runtime';

describe('@akubly/skillsmith-runtime scaffold', () => {
  beforeEach(() => {
    closeDb();
  });

  afterEach(() => {
    closeDb();
  });

  it('exports callable scaffold entry points', () => {
    expect(typeof createPrescriberOrchestrationConfig).toBe('function');
    expect(typeof runForgePrescribe).toBe('function');
  });

  it('exposes both the curator factory and the live CLI orchestration surface', async () => {
    const config = createPrescriberOrchestrationConfig({});
    expect(typeof config.loadProfile).toBe('function');
    expect(typeof config.runForSkill).toBe('function');

    const result = await runForgePrescribe({ skillId: 'missing-skill', dbPath: ':memory:' });

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('No execution profile');
  });
});
