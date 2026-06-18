import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getDb } from '@akubly/cairn';
import { runForgeInstrumentedSession } from '@akubly/skillsmith-runtime';
import { runForgeRunSessionCli } from '../forge-run-session.js';
import { loadMetrics } from '../metrics/loadMetrics.js';

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
    });

    const code = await runForgeRunSessionCli([
      '--skill', 'skill-a',
      '--prompt', 'hello',
    ], { runner });

    expect(code).toBe(1);
  });

  it('makes the generated profile visible through forge-metrics loading', async () => {
    const handlers: Array<(event: Record<string, unknown>) => void> = [];
    let counter = 0;
    const event = (type: string, data: Record<string, unknown> = {}) => ({
      id: `metrics-runner-${++counter}`,
      timestamp: new Date().toISOString(),
      parentId: null,
      type,
      data,
    });
    const mockSession = {
      sessionId: 'metrics-runner-session',
      send: vi.fn().mockResolvedValue('msg-1'),
      sendAndWait: vi.fn().mockImplementation(async () => {
        handlers.forEach((h) => h(event('tool.execution_start', { toolCallId: 'c1', toolName: 'read_file' })));
        handlers.forEach((h) => h(event('tool.execution_complete', { toolCallId: 'c1', success: true })));
        handlers.forEach((h) => h(event('assistant.usage', { inputTokens: 10, outputTokens: 5 })));
        handlers.forEach((h) => h(event('assistant.turn_end')));
        return event('assistant.message', { content: 'ok' });
      }),
      disconnect: vi.fn().mockImplementation(async () => {
        handlers.forEach((h) => h(event('session.shutdown')));
      }),
      on: vi.fn((handler: (event: Record<string, unknown>) => void) => {
        handlers.push(handler);
        return () => undefined;
      }),
    };
    const mockClient = {
      createSession: vi.fn().mockResolvedValue(mockSession),
      resumeSession: vi.fn().mockResolvedValue(mockSession),
      stop: vi.fn().mockResolvedValue(undefined),
    };

    await runForgeInstrumentedSession({
      prompt: 'hello',
      skillId: 'metrics-runner-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    const metrics = loadMetrics({ skillId: 'metrics-runner-skill' });
    expect(metrics.profile.found).toBe(true);
    if (!metrics.profile.found) throw new Error('unreachable');
    expect(metrics.profile.sessionCount).toBeGreaterThanOrEqual(1);
  });
});
