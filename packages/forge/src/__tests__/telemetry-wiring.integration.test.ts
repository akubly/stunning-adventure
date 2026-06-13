/**
 * Telemetry wiring integration test — RED spec for Slice 4.
 *
 * Defines the contract that ForgeClient/ForgeSession must implement so that
 * three telemetry collectors observe the bridge event stream and a
 * TelemetrySink receives the derived SignalSamples on session disconnect.
 *
 * STATUS: RED — ForgeSession instrumentation is not yet implemented.
 *         Roger implements GREEN (collector creation + event feed + sink flush)
 *         against this spec. Do NOT implement production code here.
 *
 * Config field names assumed (Roger adds these to ForgeSessionConfig):
 *   skillId?: string             — forwarded to all three collector factories
 *   telemetrySink?: TelemetrySink — receives flushed SignalSamples at disconnect
 *
 * Lifecycle contract Roger must satisfy:
 *   1. createSession(config) → create createDriftCollector(config.skillId),
 *      createTokenCollector(config.skillId), createOutcomeCollector(config.skillId)
 *   2. Per bridged event (same stream ForgeSession.sdkSession.on() already uses):
 *      call collector.collect(bridgedEvent) for each of the three collectors
 *   3. disconnect() (before sdkSession.disconnect()):
 *      for each collector { const s = collector.flush(sessionId); if (s) sink.enqueueSample(s) }
 *      then await sink.flush()
 *   4. If telemetrySink is absent, steps 2+3 are no-ops (safe fallback).
 *
 * See: .squad/decisions/inbox/laura-slice4-wiring-contract.md
 *
 * @module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { SessionEvent } from '@github/copilot-sdk';
import type { SignalSample, SignalSampleSink, CairnBridgeEvent } from '@akubly/types';
import {
  createMockClient,
  createMockSession,
  assistantUsageEvent,
  toolExecutionStartEvent,
  toolExecutionCompleteEvent,
  resetEventCounter,
  type MockCopilotSession,
  type MockCopilotClient,
} from './helpers/index.js';
import { ForgeClient } from '../runtime/index.js';
import { ForgeSession } from '../runtime/session.js';
import { createLocalDBOMSink } from '../telemetry/sink.js';
import { HookComposer } from '../hooks/index.js';
import type { ForgeSessionConfig } from '../runtime/session.js';

// ---------------------------------------------------------------------------
// Extended session config — documents the Slice 4 contract fields that Roger
// must add to ForgeSessionConfig in packages/forge/src/runtime/session.ts.
// Until the type extension lands, we cast through unknown to keep the test
// compilable while the assertions remain RED at runtime.
// ---------------------------------------------------------------------------

/**
 * The full shape ForgeSessionConfig will have after Slice 4 lands.
 * Used only within this test file — the cast helper below bridges the gap.
 */
interface ExtendedSessionConfig extends ForgeSessionConfig {
  /** Skill identifier forwarded to all three collector factory calls. */
  skillId?: string;
  /** Sink that receives SignalSamples produced by collector flush at disconnect. */
  telemetrySink?: SignalSampleSink;
}

/** Cast helper: lets us pass the extended config without a TypeScript error. */
function asConfig(c: ExtendedSessionConfig): ForgeSessionConfig {
  return c as unknown as ForgeSessionConfig;
}

// ---------------------------------------------------------------------------
// Inline event factories for SDK types not yet in the shared event-factory.
// These create minimal but structurally valid SessionEvents.
// ---------------------------------------------------------------------------

let _localCounter = 0;
function localId(): string {
  return `lwt-${String(++_localCounter).padStart(4, '0')}`;
}

function makeTurnEndEvent(): SessionEvent {
  return {
    id: localId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'assistant.turn_end',
    data: {},
  };
}

function makeUsageInfoEvent(currentTokens: number, tokenLimit: number): SessionEvent {
  return {
    id: localId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'session.usage_info',
    data: {
      currentTokens,
      tokenLimit,
      messagesLength: 5,
      systemTokens: 200,
      conversationTokens: Math.max(0, currentTokens - 200),
      toolDefinitionsTokens: 0,
    },
  };
}

function makeSessionShutdownEvent(): SessionEvent {
  return {
    id: localId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'session.shutdown',
    data: {},
  };
}

function makePlanChangedEvent(): SessionEvent {
  return {
    id: localId(),
    timestamp: new Date().toISOString(),
    parentId: null,
    type: 'session.plan_changed',
    data: {},
  };
}

// ---------------------------------------------------------------------------
// Shared harness builder
// ---------------------------------------------------------------------------

function makeHarness(sessionId = 'test-session-telemetry-001'): {
  forgeClient: ForgeClient;
  mockClient: MockCopilotClient;
  mockSession: MockCopilotSession;
} {
  const mockSession = createMockSession({ sessionId });
  const mockClient = createMockClient({ session: mockSession });
  const forgeClient = new ForgeClient({ sdkClient: mockClient });
  return { forgeClient, mockClient, mockSession };
}

beforeEach(() => {
  resetEventCounter();
  _localCounter = 0;
});

// ===========================================================================
// Core wiring contract — these three tests define the primary seam
// ===========================================================================

describe('Telemetry wiring — core contract (Slice 4 RED)', () => {
  it('delivers drift, token, and outcome SignalSamples to the sink on disconnect', async () => {
    // Arrange: real LocalDBOMSink capturing every persisted sample
    const captured: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => captured.push(s) });

    const { forgeClient, mockSession } = makeHarness();
    const session = await forgeClient.createSession(
      asConfig({ skillId: 'skill-x', telemetrySink: sink }),
    );

    // Act: emit a representative sequence of bridge-relevant SDK events.
    // Sequence rationale (maps to COLLECTOR_BRIDGE_EVENTS in collectors.ts):
    //
    //   tool.execution_start  → tool_use        (drift: entropy, outcome: toolCalls++)
    //   tool.execution_complete (success)
    //                         → tool_result     (drift: convergedTurn set, outcome: no error)
    //   tool.execution_start  → tool_use        (drift: entropy, outcome: toolCalls++)
    //   tool.execution_complete (failure)
    //                         → tool_result     (outcome: toolErrors++)
    //   assistant.usage       → model_call      (token: callCount++, input/output tokens)
    //   session.usage_info    → context_window  (drift: context bloat tracking)
    //   assistant.turn_end    → turn_end        (drift: turnCount++ — makes flush non-null)
    //   session.plan_changed  → plan_changed    (drift: secondary convergence marker)
    //   session.shutdown      → session_end     (outcome: succeeded = true)

    mockSession._emit(toolExecutionStartEvent('read_file', { toolCallId: 'call-001' }));
    mockSession._emit(toolExecutionCompleteEvent('call-001', 'file contents', { success: true }));
    mockSession._emit(toolExecutionStartEvent('write_file', { toolCallId: 'call-002' }));
    mockSession._emit(toolExecutionCompleteEvent('call-002', '', { success: false }));
    mockSession._emit(assistantUsageEvent({ inputTokens: 200, outputTokens: 100 }));
    mockSession._emit(makeUsageInfoEvent(5_000, 20_000));
    mockSession._emit(makeTurnEndEvent());
    mockSession._emit(makePlanChangedEvent());
    mockSession._emit(makeSessionShutdownEvent());

    await session.disconnect();

    // Assert: sink received ≥1 sample of each kind
    const driftSamples = captured.filter((s) => s.kind === 'drift');
    const tokenSamples = captured.filter((s) => s.kind === 'token');
    const outcomeSamples = captured.filter((s) => s.kind === 'outcome');

    expect(driftSamples.length, 'drift: ≥1 sample from drift collector flush').toBeGreaterThanOrEqual(1);
    expect(tokenSamples.length, 'token: ≥1 sample from token collector flush').toBeGreaterThanOrEqual(1);
    expect(outcomeSamples.length, 'outcome: ≥1 sample from outcome collector flush').toBeGreaterThanOrEqual(1);

    // Assert: each sample is stamped with the correct skillId and sessionId
    for (const s of captured) {
      expect(s.skillId, `${s.kind} sample must carry skillId`).toBe('skill-x');
      expect(s.sessionId, `${s.kind} sample must carry sessionId`).toBe(session.sessionId);
    }
  });

  it('token sample metadata reflects emitted token counts', async () => {
    const captured: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => captured.push(s) });

    const { forgeClient, mockSession } = makeHarness('test-session-token-spot');
    const session = await forgeClient.createSession(
      asConfig({ skillId: 'skill-x', telemetrySink: sink }),
    );

    // Emit exactly one model_call so token counts are unambiguous
    mockSession._emit(assistantUsageEvent({ inputTokens: 300, outputTokens: 150 }));
    // turn_end needed so drift collector produces a non-null flush
    mockSession._emit(makeTurnEndEvent());
    mockSession._emit(makeSessionShutdownEvent());

    await session.disconnect();

    const tokenSample = captured.find((s) => s.kind === 'token');
    expect(tokenSample, 'token sample must exist').toBeDefined();

    const meta = tokenSample!.metadata as Record<string, unknown>;
    expect(meta.totalInput, 'totalInput matches event').toBe(300);
    expect(meta.totalOutput, 'totalOutput matches event').toBe(150);
    expect(meta.callCount, 'callCount is 1').toBe(1);
  });

  it('outcome sample reflects tool error counts and succeeded flag', async () => {
    const captured: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => captured.push(s) });

    const { forgeClient, mockSession } = makeHarness('test-session-outcome-spot');
    const session = await forgeClient.createSession(
      asConfig({ skillId: 'skill-x', telemetrySink: sink }),
    );

    // 2 tool calls: first succeeds, second fails
    mockSession._emit(toolExecutionStartEvent('tool-a', { toolCallId: 'c-1' }));
    mockSession._emit(toolExecutionCompleteEvent('c-1', 'ok', { success: true }));
    mockSession._emit(toolExecutionStartEvent('tool-b', { toolCallId: 'c-2' }));
    mockSession._emit(toolExecutionCompleteEvent('c-2', '', { success: false }));
    mockSession._emit(assistantUsageEvent({ inputTokens: 50, outputTokens: 25 }));
    mockSession._emit(makeTurnEndEvent());
    mockSession._emit(makeSessionShutdownEvent()); // → succeeded = true

    await session.disconnect();

    const outcomeSample = captured.find((s) => s.kind === 'outcome');
    expect(outcomeSample, 'outcome sample must exist').toBeDefined();

    const meta = outcomeSample!.metadata as Record<string, unknown>;
    expect(meta.succeeded, 'session reached session_end → succeeded=true').toBe(true);
    expect(meta.toolCalls, '2 tool_use events observed').toBe(2);
    expect(meta.toolErrors, '1 tool_result with success=false').toBe(1);
    expect(meta.toolErrorRate as number, 'toolErrorRate = 1/2').toBeCloseTo(0.5);
  });
});

// ===========================================================================
// Edge cases — fold-to-global and safe no-op
// ===========================================================================

describe('Telemetry wiring — edge cases', () => {
  it('samples carry skillId=undefined when session created without skillId (fold-to-global)', async () => {
    const captured: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => captured.push(s) });

    const { forgeClient, mockSession } = makeHarness('test-session-no-skill');
    // Intentionally omit skillId — collectors must be created with undefined
    const session = await forgeClient.createSession(
      asConfig({ telemetrySink: sink }),
    );

    mockSession._emit(assistantUsageEvent({ inputTokens: 10, outputTokens: 5 }));
    mockSession._emit(makeTurnEndEvent());
    mockSession._emit(makeSessionShutdownEvent());
    await session.disconnect();

    expect(captured.length, 'at least one sample produced').toBeGreaterThanOrEqual(1);
    for (const s of captured) {
      expect(s.skillId, `${s.kind} sample: skillId must be undefined`).toBeUndefined();
      expect(s.sessionId).toBe(session.sessionId);
    }
  });

  it('session with no telemetrySink disconnects cleanly — instrumentation is a no-op', async () => {
    const { forgeClient, mockSession } = makeHarness('test-session-no-sink');
    // No telemetrySink — must not throw or crash at collect or flush
    const session = await forgeClient.createSession(
      asConfig({ skillId: 'skill-safe' }),
    );

    mockSession._emit(toolExecutionStartEvent('read'));
    mockSession._emit(toolExecutionCompleteEvent('call-noop', 'result'));
    mockSession._emit(assistantUsageEvent({ inputTokens: 10, outputTokens: 5 }));
    mockSession._emit(makeTurnEndEvent());
    mockSession._emit(makeSessionShutdownEvent());

    await expect(session.disconnect()).resolves.not.toThrow();
  });
});

// ===========================================================================
// preSessionEvents — events emitted during session creation flow through collectors
// ===========================================================================

describe('Telemetry wiring — preSessionEvents replay through collectors', () => {
  it('a session_end preSessionEvent is replayed through collectors so outcome.succeeded=true', async () => {
    // Arrange: build a ForgeSession directly with a pre-session shutdown event.
    // The event is bridged before session.on() was wired (simulates the real
    // ForgeClient onEvent path). Collectors must observe it via constructor replay.
    const captured: SignalSample[] = [];
    const sink = createLocalDBOMSink({ persistSample: (s) => captured.push(s) });

    const mockSdk = createMockSession({ sessionId: 'test-presession-unit' });

    // Build a pre-session bridge event for session_end / session.shutdown
    const preShutdownEvent: CairnBridgeEvent = {
      sessionId: 'test-presession-unit',
      eventType: 'session_end',
      payload: JSON.stringify({ succeeded: true }),
      createdAt: new Date().toISOString(),
      provenanceTier: 'internal',
    };

    const hookComposer = new HookComposer();
    const session = new ForgeSession(
      mockSdk,
      hookComposer,
      asConfig({ skillId: 'skill-pre', telemetrySink: sink }),
      { preSessionEvents: [preShutdownEvent] },
    );

    // Emit a turn_end so drift collector can flush non-null, plus usage for tokens.
    mockSdk._emit(assistantUsageEvent({ inputTokens: 5, outputTokens: 5 }));
    mockSdk._emit(makeTurnEndEvent());
    // No additional session.shutdown — the outcome relies entirely on the pre-session event.

    await session.disconnect();

    const outcomeSample = captured.find(s => s.kind === 'outcome');
    expect(outcomeSample, 'outcome sample must be produced').toBeDefined();
    // outcome.succeeded must be true — driven by the pre-session session_end event
    expect((outcomeSample!.metadata as Record<string, unknown>).succeeded,
      'preSessionEvent session_end must set succeeded=true on outcome collector').toBe(true);
  });
});
