import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionEvent } from '@github/copilot-sdk';
import * as cairn from '@akubly/cairn';
import { runForgeInstrumentedSession } from '../forgeSessionRunner.js';
import {
  assistantUsageEvent,
  createMockClient,
  createMockSession,
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
    expect(result.telemetryTimings.map((t) => t.phase)).toContain('telemetry_flush_end');
    expect(mockSdk.disconnect).toHaveBeenCalledTimes(2);
    expect(mockClient.stop).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
