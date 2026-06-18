import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    expect(mockClient.stop).toHaveBeenCalledOnce();
    const profile = cairn.getExecutionProfile(db, 'runner-skill', 'per-skill', 'global');
    expect(profile?.sessionCount).toBeGreaterThanOrEqual(1);
  });
});
