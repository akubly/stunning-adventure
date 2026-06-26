import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@github/copilot-sdk';
import * as cairn from '@akubly/cairn';
import { generateDBOM } from '@akubly/forge';
import { runForgeInstrumentedSession } from '../forgeSessionRunner.js';
import {
  assistantUsageEvent,
  createMockClient,
  createMockSession,
  permissionCompletedEvent,
  permissionRequestedEvent,
  resetEventCounter,
  toolExecutionCompleteEvent,
  toolExecutionStartEvent,
} from './helpers/mockSession.js';

let localCounter = 0;
function eventId(): string {
  return `runner-${++localCounter}`;
}

function turnEndEvent(): SessionEvent {
  return {
    id: eventId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'assistant.turn_end',
    data: {},
  };
}

function assistantMessageEvent(): SessionEvent {
  return {
    id: eventId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'assistant.message',
    data: { content: 'done' },
  };
}

function shutdownEvent(): SessionEvent {
  return {
    id: eventId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'session.shutdown',
    data: {},
  };
}

beforeEach(() => {
  cairn.closeDb();
  cairn.getDb(':memory:');
  resetEventCounter();
  localCounter = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  cairn.closeDb();
});

describe('runForgeInstrumentedSession', () => {
  it('drives one SDK-shaped session into signal_samples and an execution profile', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-session-1' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockImplementationOnce(async () => {
      mockSdk._emit(toolExecutionStartEvent('read_file', { toolCallId: 'call-1' }));
      mockSdk._emit(toolExecutionCompleteEvent('call-1', 'ok', { success: true }));
      mockSdk._emit(assistantUsageEvent({ inputTokens: 123, outputTokens: 45 }));
      mockSdk._emit(turnEndEvent());
      return assistantMessageEvent();
    });
    mockSdk.disconnect.mockImplementationOnce(async () => {
      mockSdk._emit(shutdownEvent());
    });

    const result = await runForgeInstrumentedSession({
      prompt: 'Summarize this repository in one sentence.',
      skillId: 'runner-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    expect(result.sessionId).toBe('runner-session-1');
    expect(result.signalSamplesWritten).toBeGreaterThanOrEqual(3);
    expect(result.profileFound).toBe(true);
    expect(result.profileSessionCount).toBe(1);
    expect(result.disconnect).toEqual({ ok: true });
    expect(result.telemetryTimings.map((t) => t.phase)).toContain('session_end_observed');

    const db = cairn.getDb();
    const samples = cairn.querySignalSamples(db, { sessionId: 'runner-session-1' });
    expect(new Set(samples.map((s) => s.kind))).toEqual(new Set(['drift', 'token', 'outcome']));
    const outcome = samples.find((s) => s.kind === 'outcome');
    expect(outcome?.metadata.succeeded).toBe(true);
    const phases = result.telemetryTimings.map((t) => t.phase);
    expect(phases.indexOf('sdk_disconnect_end')).toBeLessThan(
      phases.indexOf('telemetry_flush_start'),
    );
    expect(mockClient.stop).not.toHaveBeenCalled();
    const profile = cairn.getExecutionProfile(db, 'runner-skill', 'per-skill', 'global');
    expect(profile?.sessionCount).toBeGreaterThanOrEqual(1);
  });

  it('captures terminal events emitted asynchronously after SDK disconnect resolves', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-session-async-shutdown' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockImplementationOnce(async () => {
      mockSdk._emit(toolExecutionStartEvent('read_file', { toolCallId: 'call-async' }));
      mockSdk._emit(toolExecutionCompleteEvent('call-async', 'ok', { success: true }));
      mockSdk._emit(assistantUsageEvent({ inputTokens: 7, outputTokens: 3 }));
      mockSdk._emit(turnEndEvent());
      return assistantMessageEvent();
    });
    mockSdk.disconnect.mockImplementationOnce(async () => {
      setTimeout(() => mockSdk._emit(shutdownEvent()), 0);
    });

    const result = await runForgeInstrumentedSession({
      prompt: 'Exercise async disconnect ordering.',
      skillId: 'runner-async-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    const db = cairn.getDb();
    const samples = cairn.querySignalSamples(db, { sessionId: 'runner-session-async-shutdown' });
    const outcome = samples.find((s) => s.kind === 'outcome');
    expect(outcome?.metadata.succeeded).toBe(true);
    const phases = result.telemetryTimings.map((t) => t.phase);
    expect(phases.indexOf('sdk_disconnect_end')).toBeLessThan(
      phases.indexOf('telemetry_flush_start'),
    );
    expect(phases.indexOf('session_end_observed')).toBeLessThan(
      phases.indexOf('telemetry_flush_start'),
    );
  });

  it('uses approve-all permission policy in the runner composition root', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-permission-session' });
    const mockClient = createMockClient({ session: mockSdk });

    await runForgeInstrumentedSession({
      prompt: 'hello',
      skillId: 'runner-permission-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    const sdkConfig = mockClient.createSession.mock.calls[0][0];
    expect(await sdkConfig.onPermissionRequest({ kind: 'read' }, { sessionId: 's' }))
      .toEqual({ kind: 'approved' });
  });

  it('uses a neutral clientName by default', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-client-name-session' });
    const mockClient = createMockClient({ session: mockSdk });

    await runForgeInstrumentedSession({
      prompt: 'hello',
      skillId: 'runner-client-name-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    expect(mockClient.createSession.mock.calls[0][0].clientName).toBe('forge-session-runner');
  });

  it('only stops injected SDK clients when explicitly requested', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-owned-client-session' });
    const mockClient = createMockClient({ session: mockSdk });

    await runForgeInstrumentedSession({
      prompt: 'hello',
      skillId: 'runner-owned-client-skill',
      sdkClient: mockClient,
      stopClientOnFinish: true,
      timeoutMs: 100,
    });

    expect(mockClient.stop).toHaveBeenCalledOnce();
  });

  it('cleans up ForgeClient when sendAndWait rejects and propagates the error', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-send-error-session' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockRejectedValueOnce(new Error('send failed'));
    mockSdk.disconnect.mockImplementationOnce(async () => {
      mockSdk._emit(shutdownEvent());
    });

    await expect(runForgeInstrumentedSession({
      prompt: 'hello',
      skillId: 'runner-send-error-skill',
      sdkClient: mockClient,
      stopClientOnFinish: true,
      timeoutMs: 100,
    })).rejects.toThrow('failed while waiting for response');

    expect(mockSdk.disconnect).toHaveBeenCalledOnce();
    expect(mockClient.stop).toHaveBeenCalledOnce();
  });

  it('returns sample-based success when disconnect throws after telemetry flush', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mockSdk = createMockSession({ sessionId: 'runner-disconnect-error-session' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockImplementationOnce(async () => {
      mockSdk._emit(toolExecutionStartEvent('read_file', { toolCallId: 'call-disconnect-error' }));
      mockSdk._emit(toolExecutionCompleteEvent('call-disconnect-error', 'ok', { success: true }));
      mockSdk._emit(assistantUsageEvent({ inputTokens: 11, outputTokens: 5 }));
      mockSdk._emit(turnEndEvent());
      return assistantMessageEvent();
    });
    mockSdk.disconnect
      .mockImplementationOnce(async () => {
        mockSdk._emit(shutdownEvent());
        throw new Error('disconnect failed after shutdown');
      })
      .mockResolvedValueOnce(undefined);

    const result = await runForgeInstrumentedSession({
      prompt: 'hello',
      skillId: 'runner-disconnect-error-skill',
      sdkClient: mockClient,
      stopClientOnFinish: true,
      timeoutMs: 100,
    });

    expect(result.signalSamplesWritten).toBeGreaterThan(0);
    expect(result.disconnect).toEqual({
      ok: false,
      error: 'disconnect failed after shutdown',
    });
    expect(result.telemetryTimings.map((t) => t.phase)).toContain('telemetry_flush_end');
    expect(mockSdk.disconnect).toHaveBeenCalledTimes(2);
    expect(mockClient.stop).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('persists a DBOM artifact and surfaces dbomRootHash when certification events exist', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-dbom-session' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockImplementationOnce(async () => {
      mockSdk._emit(permissionRequestedEvent());
      mockSdk._emit(permissionCompletedEvent());
      mockSdk._emit(toolExecutionStartEvent('bash', { toolCallId: 'call-dbom' }));
      mockSdk._emit(toolExecutionCompleteEvent('call-dbom', 'ok', { success: true }));
      mockSdk._emit(assistantUsageEvent({ inputTokens: 50, outputTokens: 20 }));
      mockSdk._emit(turnEndEvent());
      return assistantMessageEvent();
    });
    mockSdk.disconnect.mockImplementationOnce(async () => {
      mockSdk._emit(shutdownEvent());
    });

    const result = await runForgeInstrumentedSession({
      prompt: 'Run a shell command.',
      skillId: 'runner-dbom-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    expect(result.dbomRootHash).toMatch(/^[0-9a-f]{64}$/);
    const db = cairn.getDb();
    const artifact = cairn.loadDBOMArtifact(db, 'runner-dbom-session');
    expect(artifact).not.toBeNull();
    expect(artifact?.rootHash).toBe(result.dbomRootHash);
    expect(artifact?.sessionId).toBe('runner-dbom-session');
    expect(artifact?.stats.totalDecisions).toBe(2);
  });

  it('dbomRootHash is the empty-set sentinel and run succeeds when no certification events exist', async () => {
    const mockSdk = createMockSession({ sessionId: 'runner-dbom-empty-session' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockImplementationOnce(async () => {
      mockSdk._emit(toolExecutionStartEvent('read_file', { toolCallId: 'call-empty' }));
      mockSdk._emit(toolExecutionCompleteEvent('call-empty', 'ok', { success: true }));
      mockSdk._emit(assistantUsageEvent({ inputTokens: 30, outputTokens: 10 }));
      mockSdk._emit(turnEndEvent());
      return assistantMessageEvent();
    });
    mockSdk.disconnect.mockImplementationOnce(async () => {
      mockSdk._emit(shutdownEvent());
    });

    const result = await runForgeInstrumentedSession({
      prompt: 'Read a file.',
      skillId: 'runner-dbom-empty-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    const expectedSentinel = generateDBOM('runner-dbom-empty-session', []).rootHash;
    expect(result.dbomRootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.dbomRootHash).toBe(expectedSentinel);
    expect(result.dbomPersistError).toBeNull();
    expect(result.signalSamplesWritten).toBeGreaterThan(0);

    const db = cairn.getDb();
    const artifact = cairn.loadDBOMArtifact(db, 'runner-dbom-empty-session');
    expect(artifact).toBeNull();
  });

  it('surfaces dbomPersistError and does not throw when DBOM persistence fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mockSdk = createMockSession({ sessionId: 'runner-dbom-persist-fail-session' });
    const mockClient = createMockClient({ session: mockSdk });
    mockSdk.sendAndWait.mockImplementationOnce(async () => {
      mockSdk._emit(permissionRequestedEvent());
      mockSdk._emit(permissionCompletedEvent());
      mockSdk._emit(toolExecutionStartEvent('bash', { toolCallId: 'call-fail' }));
      mockSdk._emit(toolExecutionCompleteEvent('call-fail', 'ok', { success: true }));
      mockSdk._emit(assistantUsageEvent({ inputTokens: 20, outputTokens: 10 }));
      mockSdk._emit(turnEndEvent());
      return assistantMessageEvent();
    });
    mockSdk.disconnect.mockImplementationOnce(async () => {
      mockSdk._emit(shutdownEvent());
    });

    vi.spyOn(cairn, 'upsertDBOM').mockImplementationOnce(() => {
      throw new Error('disk full');
    });

    const result = await runForgeInstrumentedSession({
      prompt: 'Run with failing persist.',
      skillId: 'runner-dbom-fail-skill',
      sdkClient: mockClient,
      timeoutMs: 100,
    });

    expect(result.signalSamplesWritten).toBeGreaterThan(0);
    expect(result.disconnect).toEqual({ ok: true });
    expect(result.dbomPersistError).toBe('disk full');
    warn.mockRestore();
  });
});
