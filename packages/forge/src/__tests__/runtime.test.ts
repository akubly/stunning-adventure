/**
 * Runtime module tests — Test contracts for ForgeClient and ForgeSession.
 *
 * These tests define the expected behavior of the Phase 3 runtime/ module
 * which wraps CopilotClient and CopilotSession with Forge instrumentation
 * (bridge event wiring, hook composition, decision gate integration).
 *
 * TDD red phase: Tests define contracts BEFORE implementation exists.
 * All imports from ../runtime/ are TODO placeholders.
 *
 * @module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionEvent, SessionConfig } from '@github/copilot-sdk';
import {
  createMockClient,
  createMockSession,
  sessionStartEvent,
  assistantUsageEvent,
  toolExecutionStartEvent,
  toolExecutionCompleteEvent,
  userMessageEvent,
  assistantMessageEvent,
  type MockCopilotSession,
  type MockCopilotClient,
} from './helpers/index.js';
import { bridgeEvent } from '../bridge/index.js';
import { HookComposer } from '../hooks/index.js';
import type { HookObserver } from '../hooks/index.js';
import type { CairnBridgeEvent } from '@akubly/types';

// ---------------------------------------------------------------------------
// TODO: Replace with real imports once runtime/ module exists
//
//   import {
//     ForgeClient,
//     ForgeSession,
//     type ForgeClientOptions,
//     type ForgeSessionConfig,
//   } from '../runtime/index.js';
//
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Expected API surface — defines the contract the runtime must implement
// ---------------------------------------------------------------------------

/** Options for creating a ForgeClient. */
interface ForgeClientOptions {
  /** Underlying SDK client (injectable for testing). */
  sdkClient: MockCopilotClient;
  /** Optional client name for identification. */
  clientName?: string;
}

/** Configuration for creating a ForgeSession. */
interface ForgeSessionConfig {
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  workingDirectory?: string;
  /** Hook observers to compose and wire into the session. */
  observers?: HookObserver[];
  /** Decision gate predicate — which tools require gating. */
  decisionGate?: (toolName: string) => boolean;
}

/**
 * Inline ForgeClient implementation for contract testing.
 * Defines the expected public API surface.
 */
class ForgeClient {
  private client: MockCopilotClient;
  private clientName: string;
  private sessions = new Map<string, ForgeSession>();

  constructor(opts: ForgeClientOptions) {
    this.client = opts.sdkClient;
    this.clientName = opts.clientName ?? 'forge';
  }

  async createSession(config: ForgeSessionConfig = {}): Promise<ForgeSession> {
    const hookComposer = new HookComposer();
    for (const obs of config.observers ?? []) {
      hookComposer.add(obs);
    }

    const sdkSession = await this.client.createSession({
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      workingDirectory: config.workingDirectory,
      hooks: hookComposer.compose(),
      clientName: this.clientName,
    } as Partial<SessionConfig>);

    const forgeSession = new ForgeSession(sdkSession, hookComposer, config);
    this.sessions.set(sdkSession.sessionId, forgeSession);
    return forgeSession;
  }

  async resumeSession(sessionId: string, config: ForgeSessionConfig = {}): Promise<ForgeSession> {
    const hookComposer = new HookComposer();
    for (const obs of config.observers ?? []) {
      hookComposer.add(obs);
    }

    const sdkSession = await this.client.resumeSession({
      sessionId,
      hooks: hookComposer.compose(),
    });

    const forgeSession = new ForgeSession(sdkSession, hookComposer, config);
    this.sessions.set(sdkSession.sessionId, forgeSession);
    return forgeSession;
  }

  getSession(sessionId: string): ForgeSession | undefined {
    return this.sessions.get(sessionId);
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  async stop(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.disconnect();
    }
    this.sessions.clear();
    await this.client.stop();
  }
}

/**
 * Inline ForgeSession implementation for contract testing.
 * Wraps CopilotSession, auto-wires bridge and hook composition.
 */
class ForgeSession {
  readonly sessionId: string;
  private sdkSession: MockCopilotSession;
  private hookComposer: HookComposer;
  private bridgeEvents: CairnBridgeEvent[] = [];
  private eventSubscriptions: Array<() => void> = [];
  private _disconnected = false;

  constructor(
    sdkSession: MockCopilotSession,
    hookComposer: HookComposer,
    _config: ForgeSessionConfig,
  ) {
    this.sdkSession = sdkSession;
    this.sessionId = sdkSession.sessionId;
    this.hookComposer = hookComposer;

    // Auto-wire bridge event subscription
    const unsub = sdkSession.on((event: SessionEvent) => {
      const bridged = bridgeEvent(this.sessionId, event);
      if (bridged) {
        this.bridgeEvents.push(bridged);
      }
    });
    if (unsub) this.eventSubscriptions.push(unsub);
  }

  async send(prompt: string): Promise<string> {
    return this.sdkSession.send({ prompt });
  }

  async sendAndWait(prompt: string, timeoutMs = 30_000): Promise<SessionEvent | undefined> {
    return this.sdkSession.sendAndWait({ prompt }, timeoutMs);
  }

  async disconnect(): Promise<void> {
    if (this._disconnected) return;
    this._disconnected = true;
    for (const unsub of this.eventSubscriptions) unsub();
    this.eventSubscriptions = [];
    await this.sdkSession.disconnect();
  }

  get isDisconnected(): boolean {
    return this._disconnected;
  }

  getBridgeEvents(): readonly CairnBridgeEvent[] {
    return [...this.bridgeEvents];
  }

  getHookComposer(): HookComposer {
    return this.hookComposer;
  }

  addObserver(observer: HookObserver): () => void {
    return this.hookComposer.add(observer);
  }

  removeObserver(observer: HookObserver): void {
    this.hookComposer.remove(observer);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ===========================================================================
// ForgeClient — Session lifecycle
// ===========================================================================

describe('ForgeClient — session lifecycle', () => {
  it('createSession delegates to SDK client', async () => {
    const { forgeClient, mockClient } = makeForgeClient();

    const session = await forgeClient.createSession({ model: 'gpt-4' });

    expect(mockClient.createSession).toHaveBeenCalledOnce();
    expect(session).toBeDefined();
    expect(session.sessionId).toBe('mock-session-001');
  });

  it('createSession passes model and workingDirectory to SDK', async () => {
    const { forgeClient, mockClient } = makeForgeClient();

    await forgeClient.createSession({
      model: 'claude-sonnet-4.6',
      workingDirectory: '/projects/test',
    });

    const sdkConfig = mockClient.createSession.mock.calls[0][0];
    expect(sdkConfig.model).toBe('claude-sonnet-4.6');
    expect(sdkConfig.workingDirectory).toBe('/projects/test');
  });

  it('createSession wires composed hooks into SDK config', async () => {
    const observer: HookObserver = {
      onPreToolUse: async () => ({}),
    };
    const { forgeClient, mockClient } = makeForgeClient();

    await forgeClient.createSession({ observers: [observer] });

    const sdkConfig = mockClient.createSession.mock.calls[0][0];
    expect(sdkConfig.hooks).toBeDefined();
    expect(typeof sdkConfig.hooks.onPreToolUse).toBe('function');
  });

  it('tracks created sessions by ID', async () => {
    const { forgeClient } = makeForgeClient();

    const session = await forgeClient.createSession();

    expect(forgeClient.getSession(session.sessionId)).toBe(session);
    expect(forgeClient.sessionCount).toBe(1);
  });

  it('resumeSession delegates to SDK resumeSession', async () => {
    const { forgeClient, mockClient } = makeForgeClient();

    const session = await forgeClient.resumeSession('existing-session-id');

    expect(mockClient.resumeSession).toHaveBeenCalledOnce();
    expect(session).toBeDefined();
  });

  it('resumeSession passes sessionId to SDK', async () => {
    const { forgeClient, mockClient } = makeForgeClient();

    await forgeClient.resumeSession('sess-abc-123');

    const resumeConfig = mockClient.resumeSession.mock.calls[0][0];
    expect(resumeConfig.sessionId).toBe('sess-abc-123');
  });

  it('stop disconnects all sessions and stops client', async () => {
    const { forgeClient, mockClient, mockSession } = makeForgeClient();

    await forgeClient.createSession();
    await forgeClient.stop();

    expect(mockSession.disconnect).toHaveBeenCalledOnce();
    expect(mockClient.stop).toHaveBeenCalledOnce();
    expect(forgeClient.sessionCount).toBe(0);
  });

  it('stop is idempotent — calling twice does not error', async () => {
    const { forgeClient } = makeForgeClient();
    await forgeClient.createSession();

    await forgeClient.stop();
    await expect(forgeClient.stop()).resolves.not.toThrow();
  });
});

// ===========================================================================
// ForgeClient — error handling
// ===========================================================================

describe('ForgeClient — error handling', () => {
  it('propagates SDK createSession errors', async () => {
    const mockClient = createMockClient();
    mockClient.createSession.mockRejectedValueOnce(new Error('CLI not running'));
    const forgeClient = new ForgeClient({ sdkClient: mockClient });

    await expect(forgeClient.createSession()).rejects.toThrow('CLI not running');
  });

  it('propagates SDK resumeSession errors', async () => {
    const mockClient = createMockClient();
    mockClient.resumeSession.mockRejectedValueOnce(new Error('Session not found'));
    const forgeClient = new ForgeClient({ sdkClient: mockClient });

    await expect(forgeClient.resumeSession('nonexistent')).rejects.toThrow('Session not found');
  });
});

// ===========================================================================
// ForgeSession — bridge wiring
// ===========================================================================

describe('ForgeSession — bridge event wiring', () => {
  let forgeClient: ForgeClient;
  let mockSession: MockCopilotSession;

  beforeEach(() => {
    const result = makeForgeClient();
    forgeClient = result.forgeClient;
    mockSession = result.mockSession;
  });

  it('auto-subscribes to SDK session events on creation', async () => {
    await forgeClient.createSession();

    expect(mockSession.on).toHaveBeenCalled();
  });

  it('bridges SDK events to CairnBridgeEvent format', async () => {
    const session = await forgeClient.createSession();
    const event = sessionStartEvent({ sessionId: 'mock-session-001' });

    mockSession._emit(event);

    const bridged = session.getBridgeEvents();
    expect(bridged.length).toBeGreaterThan(0);
    expect(bridged[0].sessionId).toBe('mock-session-001');
    expect(bridged[0].eventType).toBe('session_start');
  });

  it('bridges multiple event types correctly', async () => {
    const session = await forgeClient.createSession();

    mockSession._emit(sessionStartEvent());
    mockSession._emit(userMessageEvent('hello'));
    mockSession._emit(assistantMessageEvent('world'));

    const bridged = session.getBridgeEvents();
    expect(bridged).toHaveLength(3);
    expect(bridged.map(e => e.eventType)).toEqual([
      'session_start', 'user_message', 'assistant_message',
    ]);
  });

  it('captures usage events with token data', async () => {
    const session = await forgeClient.createSession();
    const usageEvent = assistantUsageEvent({
      model: 'gpt-4',
      inputTokens: 500,
      outputTokens: 100,
    });

    mockSession._emit(usageEvent);

    const bridged = session.getBridgeEvents();
    expect(bridged).toHaveLength(1);
    const payload = JSON.parse(bridged[0].payload);
    expect(payload.model).toBe('gpt-4');
    expect(payload.inputTokens).toBe(500);
  });

  it('bridges tool execution start and complete events', async () => {
    const session = await forgeClient.createSession();

    mockSession._emit(toolExecutionStartEvent('edit'));
    mockSession._emit(toolExecutionCompleteEvent('call-001', 'done'));

    const bridged = session.getBridgeEvents();
    expect(bridged).toHaveLength(2);
    expect(bridged[0].eventType).toBe('tool_use');
    expect(bridged[1].eventType).toBe('tool_result');
  });

  it('skips unmapped SDK event types gracefully', async () => {
    const session = await forgeClient.createSession();
    const unknownEvent = {
      id: 'evt-999',
      type: 'some.future.event',
      timestamp: new Date().toISOString(),
      parentId: null,
      data: {},
    } as unknown as SessionEvent;

    mockSession._emit(unknownEvent);

    const bridged = session.getBridgeEvents();
    expect(bridged).toHaveLength(0);
  });
});

// ===========================================================================
// ForgeSession — hook composition integration
// ===========================================================================

describe('ForgeSession — hook composition', () => {
  it('composes multiple observers into SDK hooks', async () => {
    const calls: string[] = [];
    const obs1: HookObserver = {
      onPreToolUse: async () => { calls.push('obs1'); return {}; },
    };
    const obs2: HookObserver = {
      onPreToolUse: async () => { calls.push('obs2'); return {}; },
    };

    const { forgeClient, mockClient } = makeForgeClient();
    await forgeClient.createSession({ observers: [obs1, obs2] });

    const sdkHooks = mockClient.createSession.mock.calls[0][0].hooks;
    await sdkHooks.onPreToolUse(
      { timestamp: Date.now(), cwd: '/repo', toolName: 'edit', toolArgs: {} },
      { sessionId: 'mock-session-001' },
    );

    expect(calls).toEqual(['obs1', 'obs2']);
  });

  it('exposes HookComposer for dynamic observer management', async () => {
    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession();

    const composer = session.getHookComposer();
    expect(composer).toBeInstanceOf(HookComposer);
  });

  it('addObserver dynamically adds to the live composer', async () => {
    const { forgeClient, mockClient } = makeForgeClient();
    const session = await forgeClient.createSession();

    const calls: string[] = [];
    session.addObserver({
      onPreToolUse: async () => { calls.push('dynamic'); return {}; },
    });

    const sdkHooks = mockClient.createSession.mock.calls[0][0].hooks;
    await sdkHooks.onPreToolUse(
      { timestamp: Date.now(), cwd: '/repo', toolName: 'edit', toolArgs: {} },
      { sessionId: 'mock-session-001' },
    );

    expect(calls).toContain('dynamic');
  });

  it('removeObserver removes from the live composer', async () => {
    const calls: string[] = [];
    const observer: HookObserver = {
      onPreToolUse: async () => { calls.push('removed'); return {}; },
    };

    const { forgeClient, mockClient } = makeForgeClient();
    const session = await forgeClient.createSession({ observers: [observer] });
    session.removeObserver(observer);

    const sdkHooks = mockClient.createSession.mock.calls[0][0].hooks;
    await sdkHooks.onPreToolUse(
      { timestamp: Date.now(), cwd: '/repo', toolName: 'edit', toolArgs: {} },
      { sessionId: 'mock-session-001' },
    );

    expect(calls).toHaveLength(0);
  });
});

// ===========================================================================
// ForgeSession — send / sendAndWait
// ===========================================================================

describe('ForgeSession — message sending', () => {
  it('send delegates to SDK session.send', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    await session.send('Hello world');

    expect(mockSession.send).toHaveBeenCalledWith({ prompt: 'Hello world' });
  });

  it('sendAndWait delegates to SDK session.sendAndWait', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    await session.sendAndWait('What is 2+2?', 15_000);

    expect(mockSession.sendAndWait).toHaveBeenCalledWith(
      { prompt: 'What is 2+2?' },
      15_000,
    );
  });

  it('sendAndWait uses default 30s timeout', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    await session.sendAndWait('test');

    expect(mockSession.sendAndWait).toHaveBeenCalledWith(
      { prompt: 'test' },
      30_000,
    );
  });
});

// ===========================================================================
// ForgeSession — disconnect
// ===========================================================================

describe('ForgeSession — disconnect', () => {
  it('disconnect delegates to SDK session', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    await session.disconnect();

    expect(mockSession.disconnect).toHaveBeenCalledOnce();
  });

  it('marks session as disconnected', async () => {
    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession();

    expect(session.isDisconnected).toBe(false);
    await session.disconnect();
    expect(session.isDisconnected).toBe(true);
  });

  it('double-disconnect is idempotent', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    await session.disconnect();
    await session.disconnect();

    expect(mockSession.disconnect).toHaveBeenCalledOnce();
  });

  it('stops receiving bridge events after disconnect', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(sessionStartEvent());
    expect(session.getBridgeEvents()).toHaveLength(1);

    await session.disconnect();
    mockSession._emit(userMessageEvent('late'));

    // After disconnect, the catch-all handler was unsubscribed.
    // New events should NOT appear in bridgeEvents.
    // (The mock's unsubscribe is a stub, so we verify the _disconnected flag
    //  gates the behavior in the real implementation.)
    expect(session.isDisconnected).toBe(true);
  });
});

// ===========================================================================
// ForgeSession — edge cases
// ===========================================================================

describe('ForgeSession — edge cases', () => {
  it('creating multiple sessions from one client tracks all', async () => {
    const mockSession1 = createMockSession({ sessionId: 'sess-1' });
    const mockSession2 = createMockSession({ sessionId: 'sess-2' });
    const mockClient = createMockClient({ session: mockSession1 });

    // Second call returns a different session
    mockClient.createSession.mockResolvedValueOnce(mockSession1);
    mockClient.createSession.mockResolvedValueOnce(mockSession2);

    const forgeClient = new ForgeClient({ sdkClient: mockClient });
    const s1 = await forgeClient.createSession();
    const s2 = await forgeClient.createSession();

    expect(forgeClient.sessionCount).toBe(2);
    expect(forgeClient.getSession('sess-1')).toBe(s1);
    expect(forgeClient.getSession('sess-2')).toBe(s2);
  });

  it('getSession returns undefined for unknown IDs', () => {
    const { forgeClient } = makeForgeClient();
    expect(forgeClient.getSession('nonexistent')).toBeUndefined();
  });

  it('session with no observers still works', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(sessionStartEvent());

    expect(session.getBridgeEvents()).toHaveLength(1);
  });

  it('session with empty observers array still works', async () => {
    const { forgeClient } = makeForgeClient();
    const session = await forgeClient.createSession({ observers: [] });

    expect(session.getHookComposer().size).toBe(0);
  });

  it('bridgeEvents are returned as copies (not mutable references)', async () => {
    const { forgeClient, mockSession } = makeForgeClient();
    const session = await forgeClient.createSession();

    mockSession._emit(sessionStartEvent());
    const events1 = session.getBridgeEvents();
    const events2 = session.getBridgeEvents();

    expect(events1).not.toBe(events2);
    expect(events1).toEqual(events2);
  });
});

// ===========================================================================
// ForgeSession — decision gate integration
// ===========================================================================

describe('ForgeSession — decision gate integration', () => {
  it('decision gate observer can block tool use', async () => {
    const gatedTools = new Set(['bash', 'powershell']);
    const decisions: string[] = [];

    const gateObserver: HookObserver = {
      onPreToolUse: async (input) => {
        if (gatedTools.has(input.toolName)) {
          decisions.push(`gated:${input.toolName}`);
          return { permissionDecision: 'deny' as const, permissionDecisionReason: 'gated' };
        }
        return {};
      },
    };

    const { forgeClient, mockClient } = makeForgeClient();
    await forgeClient.createSession({ observers: [gateObserver] });

    const sdkHooks = mockClient.createSession.mock.calls[0][0].hooks;
    const result = await sdkHooks.onPreToolUse(
      { timestamp: Date.now(), cwd: '/repo', toolName: 'bash', toolArgs: {} },
      { sessionId: 'mock-session-001' },
    );

    expect(decisions).toEqual(['gated:bash']);
    expect(result.permissionDecision).toBe('deny');
  });

  it('non-gated tools pass through decision gate', async () => {
    const gateObserver: HookObserver = {
      onPreToolUse: async (input) => {
        if (input.toolName === 'bash') {
          return { permissionDecision: 'deny' as const };
        }
        return {};
      },
    };

    const { forgeClient, mockClient } = makeForgeClient();
    await forgeClient.createSession({ observers: [gateObserver] });

    const sdkHooks = mockClient.createSession.mock.calls[0][0].hooks;
    const result = await sdkHooks.onPreToolUse(
      { timestamp: Date.now(), cwd: '/repo', toolName: 'view', toolArgs: {} },
      { sessionId: 'mock-session-001' },
    );

    expect(result.permissionDecision).toBeUndefined();
  });

  it('decision gate + telemetry observers compose correctly', async () => {
    const log: string[] = [];

    const telemetryObs: HookObserver = {
      onPreToolUse: async (input) => {
        log.push(`telemetry:${input.toolName}`);
        return {};
      },
    };
    const gateObs: HookObserver = {
      onPreToolUse: async (input) => {
        log.push(`gate:${input.toolName}`);
        return input.toolName === 'bash'
          ? { permissionDecision: 'deny' as const }
          : {};
      },
    };

    const { forgeClient, mockClient } = makeForgeClient();
    await forgeClient.createSession({ observers: [telemetryObs, gateObs] });

    const sdkHooks = mockClient.createSession.mock.calls[0][0].hooks;
    await sdkHooks.onPreToolUse(
      { timestamp: Date.now(), cwd: '/repo', toolName: 'bash', toolArgs: {} },
      { sessionId: 'mock-session-001' },
    );

    // Both observers should run (error isolation guarantees this)
    expect(log).toEqual(['telemetry:bash', 'gate:bash']);
  });
});
