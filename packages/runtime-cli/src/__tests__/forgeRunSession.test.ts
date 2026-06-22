import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '@akubly/cairn';
import { runForgeRunSessionCli } from '../forge-run-session.js';

beforeEach(() => {
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
  vi.restoreAllMocks();
});

describe('forge-run-session CLI', () => {
  it('requires --skill', async () => {
    const code = await runForgeRunSessionCli(['--prompt', 'hello'], {
      runner: vi.fn(),
    });

    expect(code).toBe(2);
  });

  it('requires --prompt', async () => {
    const code = await runForgeRunSessionCli(['--skill', 'skill-a'], {
      runner: vi.fn(),
    });

    expect(code).toBe(2);
  });

  it('passes parsed options to the reusable session runner', async () => {
    const runner = vi.fn().mockResolvedValue({
      sessionId: 'sess-1',
      responseEvent: undefined,
      bridgeEventCount: 4,
      signalSamplesWritten: 3,
      profileFound: true,
      profileSessionCount: 1,
      telemetryTimings: [],
      disconnect: { ok: true },
    });

    const code = await runForgeRunSessionCli([
      '--skill', 'skill-a',
      '--prompt', 'hello',
      '--model', 'gpt-5',
      '--reasoning', 'low',
      '--timeout-ms', '1234',
      '--cwd', 'D:\\git\\stunning-adventure',
      '--db', ':memory:',
    ], { runner });

    expect(code).toBe(0);
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      skillId: 'skill-a',
      prompt: 'hello',
      model: 'gpt-5',
      reasoningEffort: 'low',
      timeoutMs: 1234,
      workingDirectory: 'D:\\git\\stunning-adventure',
      dbPath: ':memory:',
      clientName: 'forge-run-session',
      buildProfile: true,
    }));
  });

  it('applies the documented timeout default', async () => {
    const runner = vi.fn().mockResolvedValue({
      sessionId: 'sess-default-timeout',
      responseEvent: undefined,
      bridgeEventCount: 1,
      signalSamplesWritten: 1,
      profileFound: true,
      profileSessionCount: 1,
      telemetryTimings: [],
      disconnect: { ok: true },
    });

    const code = await runForgeRunSessionCli([
      '--skill', 'skill-a',
      '--prompt', 'hello',
    ], { runner });

    expect(code).toBe(0);
    expect(runner).toHaveBeenCalledWith(expect.objectContaining({
      timeoutMs: 60000,
    }));
  });

  it('rejects unknown reasoning effort values before running a session', async () => {
    const runner = vi.fn();

    const code = await runForgeRunSessionCli([
      '--skill', 'skill-a',
      '--prompt', 'hello',
      '--reasoning', 'hight',
    ], { runner });

    expect(code).toBe(2);
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns 1 when the session writes no signal samples', async () => {
    const runner = vi.fn().mockResolvedValue({
      sessionId: 'sess-empty',
      responseEvent: undefined,
      bridgeEventCount: 0,
      signalSamplesWritten: 0,
      profileFound: false,
      profileSessionCount: null,
      telemetryTimings: [],
      disconnect: { ok: true },
    });

    const code = await runForgeRunSessionCli([
      '--skill', 'skill-a',
      '--prompt', 'hello',
    ], { runner });

    expect(code).toBe(1);
  });

});
