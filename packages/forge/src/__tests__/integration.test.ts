/**
 * Cross-module integration tests — L2 through L7.
 *
 * Exercises the full wiring between ForgeClient, ForgeSession, bridge,
 * hooks, decisions, and token tracking. Each test group targets a specific
 * cross-module interaction that unit tests can't cover.
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionEvent } from '@github/copilot-sdk';
import {
  createMockClient,
  createMockSession,
  sessionStartEvent,
  assistantUsageEvent,
  assistantMessageEvent,
  toolExecutionStartEvent,
  toolExecutionCompleteEvent,
  resetEventCounter,
  type MockCopilotSession,
  type MockCopilotClient,
} from './helpers/index.js';
import { ForgeClient, ForgeSession, type ForgeClientOptions } from '../runtime/index.js';
import { HookComposer, type HookObserver } from '../hooks/index.js';
import { bridgeEvent, type EventSource } from '../bridge/index.js';
import { createDecisionGate, createDecisionRecorder } from '../decisions/index.js';
import { createTokenTracker } from '../models/token-tracker.js';
import type { DecisionRecord } from '@akubly/types';
import type { PreToolUseInput, PreToolUseOutput, HookInvocation, SessionHooks } from '../types.js';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Invoke onPreToolUse with non-null assertion — safe in tests because compose() always provides it. */
async function invokePreToolUse(
  hooks: SessionHooks,
  input: PreToolUseInput,
  invocation: HookInvocation,
): Promise<PreToolUseOutput> {
  return (await hooks.onPreToolUse!(input, invocation)) ?? {};
}

function makeForgeClient(overrides: Partial<ForgeClientOptions> = {}): {
  forgeClient: ForgeClient;
  mockClient: MockCopilotClient;
  mockSession: MockCopilotSession;
} {
  const mockSession = createMockSession();
  const mockClient = createMockClient({ session: mockSession });
  const forgeClient = new ForgeClient({
    sdkClient: mockClient,
    ...overrides,
  });
  return { forgeClient, mockClient, mockSession };
}

beforeEach(() => {
  resetEventCounter();
});

// ===========================================================================
// L2: E2E Wiring Test
// ===========================================================================

describe('L2: E2E Wiring — ForgeClient → ForgeSession → bridge → sink', () => {
  it('full flow: create session, emit events, verify bridge captures', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession({ model: 'gpt-4' });

    // Emit a mapped SDK event through the mock session
    const startEvt = sessionStartEvent();
    mockSession._emit(startEvt);

    const bridgeEvents = session.getBridgeEvents();
    const sessionStarts = bridgeEvents.filter(e => e.eventType === 'session_start');
    expect(sessionStarts.length).toBeGreaterThanOrEqual(1);
    expect(sessionStarts[0].sessionId).toBe(session.sessionId);
  });

  it('hook observers fire through composed hooks', async () => {
    const calls: string[] = [];
    const observer: HookObserver = {
      onPreToolUse: async () => {
        calls.push('pre-tool');
        return {};
      },
      onPostToolUse: async () => {
        calls.push('post-tool');
        return {};
      },
    };

    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession({ observers: [observer] });

    // Invoke hooks through the composer
    const hooks = session.getHookComposer().compose();
    const input: PreToolUseInput = {
      timestamp: Date.now(),
      cwd: '/test',
      toolName: 'read_file',
      toolArgs: { path: '/foo.ts' },
    };
    const invocation: HookInvocation = { sessionId: session.sessionId };

    await invokePreToolUse(hooks, input, invocation);
    expect(calls).toContain('pre-tool');
  });

  it('event sequence ordering: start → tool_use → assistant_message → usage', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(sessionStartEvent());
    mockSession._emit(toolExecutionStartEvent('grep'));
    mockSession._emit(assistantMessageEvent('Found results'));
    mockSession._emit(assistantUsageEvent({ model: 'gpt-4' }));

    const types = session.getBridgeEvents().map(e => e.eventType);
    const startIdx = types.indexOf('session_start');
    const toolIdx = types.indexOf('tool_use');
    const msgIdx = types.indexOf('assistant_message');
    const usageIdx = types.indexOf('model_call');

    expect(startIdx).toBeLessThan(toolIdx);
    expect(toolIdx).toBeLessThan(msgIdx);
    expect(msgIdx).toBeLessThan(usageIdx);
  });
});

// ===========================================================================
// L3: Error Isolation Tests
// ===========================================================================

describe('L3: Error Isolation', () => {
  it('throwing observer does not kill other observers', async () => {
    const log: number[] = [];
    const obs1: HookObserver = {
      onPreToolUse: async () => { log.push(1); return {}; },
    };
    const obs2: HookObserver = {
      onPreToolUse: async () => { throw new Error('observer 2 boom'); },
    };
    const obs3: HookObserver = {
      onPreToolUse: async () => { log.push(3); return {}; },
    };

    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession({ observers: [obs1, obs2, obs3] });

    const hooks = session.getHookComposer().compose();
    const input: PreToolUseInput = {
      timestamp: Date.now(), cwd: '/test', toolName: 'edit', toolArgs: {},
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await invokePreToolUse(hooks, input, { sessionId: session.sessionId });
    warnSpy.mockRestore();

    expect(log).toEqual([1, 3]);
  });

  it('bridge event handler error does not kill event stream', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const session = await forgeClient.createSession();

    // Craft a mapped event whose payload causes JSON.stringify to throw
    // inside bridgeEvent(), exercising the try/catch in session.ts
    const poisonEvent = {
      id: 'evt-poison',
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.start', // mapped type so bridgeEvent() processes it
      data: {
        get sessionId(): string { throw new Error('payload extraction boom'); },
      },
    } as unknown as SessionEvent;

    mockSession._emit(poisonEvent);

    // Verify the error was caught and warned
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ForgeSession] bridge handler error'),
    );

    // Stream should continue — subsequent events still captured
    mockSession._emit(assistantMessageEvent('Hello'));
    const types = session.getBridgeEvents().map(e => e.eventType);
    expect(types).toContain('assistant_message');
    warnSpy.mockRestore();
  });

  it('disconnect cleans up even if bridge unsubscribe throws', async () => {
    const mockSession = createMockSession();
    // Override on() to return an unsubscribe that throws
    mockSession.on = vi.fn(() => {
      return () => { throw new Error('unsubscribe boom'); };
    });
    const mockClient = createMockClient({ session: mockSession });
    const forgeClient = new ForgeClient({ sdkClient: mockClient });

    const session = await forgeClient.createSession();

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // disconnect should NOT throw — unsub errors are caught and warned
    await expect(session.disconnect()).resolves.not.toThrow();
    // SDK disconnect should still be called despite the unsub error
    expect(mockSession.disconnect).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unsubscribe error'),
    );
    // Idempotent — second call is a no-op
    await session.disconnect();

    warnSpy.mockRestore();
  });

  it('stop() completes even if one session disconnect throws', async () => {
    // Create a client with a session whose disconnect throws
    const badSession = createMockSession({ sessionId: 'bad-session' });
    badSession.disconnect = vi.fn().mockRejectedValue(new Error('disconnect boom'));
    const badClient = createMockClient({ session: badSession });
    const forgeClient = new ForgeClient({ sdkClient: badClient });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await forgeClient.createSession();
    // stop() should complete without throwing — errors are collected and warned
    await forgeClient.stop();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('failed to disconnect'),
      expect.anything(),
    );
    expect(badClient.stop).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });
});

// ===========================================================================
// L4: Decision Gate Integration
// ===========================================================================

describe('L4: Decision Gate Integration', () => {
  it('createDecisionGate → HookComposer → ForgeSession: gate matches tool → returns "ask"', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      (toolName) => toolName === 'dangerous_tool',
      (record) => decisions.push(record),
    );

    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession({ observers: [gate] });

    const hooks = session.getHookComposer().compose();
    const result = await invokePreToolUse(
      hooks,
      { timestamp: Date.now(), cwd: '/test', toolName: 'dangerous_tool', toolArgs: {} },
      { sessionId: session.sessionId },
    );

    expect(result.permissionDecision).toBe('ask');
    expect(decisions).toHaveLength(1);
    expect(decisions[0].toolName).toBe('dangerous_tool');
  });

  it('gate + recorder composed: gate blocks, recorder logs, both work', async () => {
    const gateDecisions: DecisionRecord[] = [];
    const recorderDecisions: DecisionRecord[] = [];

    const gate = createDecisionGate(
      (toolName) => toolName === 'rm',
      (record) => gateDecisions.push(record),
    );
    const recorder = createDecisionRecorder(
      (record) => recorderDecisions.push(record),
    );

    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession({ observers: [gate, recorder] });

    const hooks = session.getHookComposer().compose();
    const input: PreToolUseInput = {
      timestamp: Date.now(), cwd: '/test', toolName: 'rm', toolArgs: { path: '/' },
    };

    const result = await invokePreToolUse(hooks, input, { sessionId: session.sessionId });

    // Gate should block
    expect(result.permissionDecision).toBe('ask');
    // Gate should have recorded
    expect(gateDecisions).toHaveLength(1);
    // Recorder should also have recorded (it observes passively)
    expect(recorderDecisions).toHaveLength(1);
    expect(recorderDecisions[0].toolName).toBe('rm');
  });

  it('dynamic gate add/remove mid-session', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      (toolName) => toolName === 'exec',
      (record) => decisions.push(record),
    );

    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession();

    const hooks = session.getHookComposer().compose();
    const input: PreToolUseInput = {
      timestamp: Date.now(), cwd: '/test', toolName: 'exec', toolArgs: {},
    };
    const inv: HookInvocation = { sessionId: session.sessionId };

    // Before adding gate — no blocking
    const r1 = await invokePreToolUse(hooks, input, inv);
    expect(r1.permissionDecision).toBeUndefined();

    // Add gate dynamically
    const dispose = session.addObserver(gate);
    const r2 = await invokePreToolUse(hooks, input, inv);
    expect(r2.permissionDecision).toBe('ask');
    expect(decisions).toHaveLength(1);

    // Remove gate
    dispose();
    const r3 = await invokePreToolUse(hooks, input, inv);
    expect(r3.permissionDecision).toBeUndefined();
    expect(decisions).toHaveLength(1); // no new decision
  });
});

// ===========================================================================
// L5: Model Switching Test
// ===========================================================================

describe('L5: Model Switching', () => {
  function modelChangeEvent(opts: {
    previousModel?: string;
    newModel: string;
    previousReasoningEffort?: string;
    newReasoningEffort?: string;
  }): SessionEvent {
    return {
      id: `evt-mc-${Date.now()}`,
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.model_change',
      data: {
        previousModel: opts.previousModel,
        newModel: opts.newModel,
        previousReasoningEffort: opts.previousReasoningEffort,
        newReasoningEffort: opts.newReasoningEffort,
      },
    } as unknown as SessionEvent;
  }

  it('model_change event → ModelChangeRecord tracked', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(modelChangeEvent({
      previousModel: 'gpt-4',
      newModel: 'claude-sonnet-4.6',
      previousReasoningEffort: 'medium',
      newReasoningEffort: 'high',
    }));

    expect(session.modelChanges).toHaveLength(1);
    expect(session.modelChanges[0].previousModel).toBe('gpt-4');
    expect(session.modelChanges[0].newModel).toBe('claude-sonnet-4.6');
    expect(session.modelChanges[0].previousReasoningEffort).toBe('medium');
    expect(session.modelChanges[0].newReasoningEffort).toBe('high');
  });

  it('multiple switches accumulate in modelChanges array', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(modelChangeEvent({ newModel: 'gpt-4' }));
    mockSession._emit(modelChangeEvent({ previousModel: 'gpt-4', newModel: 'claude-sonnet-4.6' }));
    mockSession._emit(modelChangeEvent({ previousModel: 'claude-sonnet-4.6', newModel: 'gpt-4o' }));

    expect(session.modelChanges).toHaveLength(3);
    expect(session.modelChanges[2].newModel).toBe('gpt-4o');
  });

  it('bridge event emitted for model_change', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(modelChangeEvent({ newModel: 'gpt-4o' }));

    const bridgeEvents = session.getBridgeEvents();
    const modelChangeEvents = bridgeEvents.filter(e => e.eventType === 'model_change');
    expect(modelChangeEvents).toHaveLength(1);
    expect(modelChangeEvents[0].sessionId).toBe(session.sessionId);
  });
});

// ===========================================================================
// L6: Token Tracker Integration
// ===========================================================================

describe('L6: Token Tracker Integration', () => {
  it('tracks per-model usage from assistant.usage events', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    // Create an EventSource adapter from the mock session
    const source: EventSource = {
      on: (handler) => mockSession.on(handler),
    };
    const tracker = createTokenTracker(source, session.sessionId);

    mockSession._emit(assistantUsageEvent({
      model: 'gpt-4', inputTokens: 100, outputTokens: 50,
    }));
    mockSession._emit(assistantUsageEvent({
      model: 'claude-sonnet-4.6', inputTokens: 200, outputTokens: 100,
    }));
    mockSession._emit(assistantUsageEvent({
      model: 'gpt-4', inputTokens: 150, outputTokens: 75,
    }));

    const gpt4 = tracker.budget.modelUsage.get('gpt-4');
    const claude = tracker.budget.modelUsage.get('claude-sonnet-4.6');

    expect(gpt4).toBeDefined();
    expect(gpt4!.callCount).toBe(2);
    expect(gpt4!.totalInputTokens).toBe(250);
    expect(gpt4!.totalOutputTokens).toBe(125);

    expect(claude).toBeDefined();
    expect(claude!.callCount).toBe(1);
    expect(claude!.totalInputTokens).toBe(200);
  });

  it('tracks context window high-water mark from session.usage_info', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    const source: EventSource = {
      on: (handler) => mockSession.on(handler),
    };
    const tracker = createTokenTracker(source, session.sessionId);

    // Emit usage_info events
    const usageInfo = (currentTokens: number, tokenLimit?: number): SessionEvent => ({
      id: `evt-ui-${Date.now()}-${Math.random()}`,
      timestamp: new Date().toISOString(),
      parentId: null,
      type: 'session.usage_info',
      data: { currentTokens, tokenLimit, messagesLength: 0 },
    } as unknown as SessionEvent);

    mockSession._emit(usageInfo(5000, 128000));
    mockSession._emit(usageInfo(15000));
    mockSession._emit(usageInfo(10000));

    expect(tracker.budget.contextWindow.tokenLimit).toBe(128000);
    expect(tracker.budget.contextWindow.peakTokens).toBe(15000);
    expect(tracker.budget.contextWindow.lastTokens).toBe(10000);
  });

  it('unsubscribe stops tracking', () => {
    // Build a proper EventSource with real unsubscribe semantics
    const handlers = new Set<(event: SessionEvent) => void>();
    const source: EventSource = {
      on: (handler) => {
        handlers.add(handler);
        return () => { handlers.delete(handler); };
      },
    };
    const emit = (event: SessionEvent) => {
      for (const h of handlers) h(event);
    };

    const tracker = createTokenTracker(source, 'unsub-session');

    emit(assistantUsageEvent({ model: 'gpt-4', inputTokens: 100 }));
    expect(tracker.budget.modelUsage.get('gpt-4')?.callCount).toBe(1);

    tracker.unsubscribe();

    emit(assistantUsageEvent({ model: 'gpt-4', inputTokens: 200 }));
    // Count should remain 1 after unsubscribe
    expect(tracker.budget.modelUsage.get('gpt-4')?.callCount).toBe(1);
  });
});

// ===========================================================================
// L7: Resume Test
// ===========================================================================

describe('L7: Resume', () => {
  it('create → disconnect → resume → bridge re-attached', async () => {
    const mockSession1 = createMockSession({ sessionId: 'session-resume' });
    const mockSession2 = createMockSession({ sessionId: 'session-resume' });
    const mockClient = createMockClient({ session: mockSession1 });
    // First call returns session1, resume returns session2
    mockClient.resumeSession = vi.fn().mockResolvedValue(mockSession2);

    const forgeClient = new ForgeClient({ sdkClient: mockClient });

    // Create and disconnect
    const session1 = await forgeClient.createSession();
    expect(session1.sessionId).toBe('session-resume');
    await session1.disconnect();
    expect(session1.isDisconnected).toBe(true);

    // Resume
    const session2 = await forgeClient.resumeSession('session-resume');
    expect(session2.sessionId).toBe('session-resume');
    expect(session2.isDisconnected).toBe(false);

    // Bridge should work on resumed session
    mockSession2._emit(sessionStartEvent());
    const events = session2.getBridgeEvents();
    expect(events.some(e => e.eventType === 'session_start')).toBe(true);
  });

  it('old session cleaned from client tracking map after resume', async () => {
    const mockSession1 = createMockSession({ sessionId: 'tracked-session' });
    const mockSession2 = createMockSession({ sessionId: 'tracked-session' });
    const mockClient = createMockClient({ session: mockSession1 });
    mockClient.resumeSession = vi.fn().mockResolvedValue(mockSession2);

    const forgeClient = new ForgeClient({ sdkClient: mockClient });

    const session1 = await forgeClient.createSession();
    expect(forgeClient.sessionCount).toBe(1);

    // Resume replaces the tracked session
    const session2 = await forgeClient.resumeSession('tracked-session');
    expect(forgeClient.sessionCount).toBe(1);
    expect(forgeClient.getSession('tracked-session')).toBe(session2);
    expect(forgeClient.getSession('tracked-session')).not.toBe(session1);
  });

  it('new observers work on resumed session', async () => {
    const mockSession1 = createMockSession({ sessionId: 'obs-session' });
    const mockSession2 = createMockSession({ sessionId: 'obs-session' });
    const mockClient = createMockClient({ session: mockSession1 });
    mockClient.resumeSession = vi.fn().mockResolvedValue(mockSession2);

    const forgeClient = new ForgeClient({ sdkClient: mockClient });

    await forgeClient.createSession();

    // Resume with a new observer
    const calls: string[] = [];
    const observer: HookObserver = {
      onPreToolUse: async () => {
        calls.push('resumed-observer');
        return {};
      },
    };
    const session2 = await forgeClient.resumeSession('obs-session', {
      observers: [observer],
    });

    const hooks = session2.getHookComposer().compose();
    await invokePreToolUse(
      hooks,
      { timestamp: Date.now(), cwd: '/test', toolName: 'test', toolArgs: {} },
      { sessionId: session2.sessionId },
    );

    expect(calls).toEqual(['resumed-observer']);
  });
});
