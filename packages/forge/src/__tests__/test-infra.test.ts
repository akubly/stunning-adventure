import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockClient,
  createMockSession,
  resetEventCounter,
  sessionStartEvent,
  assistantMessageEvent,
  assistantUsageEvent,
  toolExecutionStartEvent,
  toolExecutionCompleteEvent,
  userMessageEvent,
  assertIsCairnBridgeEvent,
  isCairnBridgeEvent,
} from './helpers/index.js';
import type { CairnBridgeEvent } from '@akubly/types';

beforeEach(() => {
  resetEventCounter();
});

// ---------------------------------------------------------------------------
// SDK mock factory
// ---------------------------------------------------------------------------

describe('createMockSession', () => {
  it('should create a session with a default id', () => {
    const session = createMockSession();
    expect(session.sessionId).toBe('mock-session-001');
  });

  it('should accept a custom session id', () => {
    const session = createMockSession({ sessionId: 'custom-42' });
    expect(session.sessionId).toBe('custom-42');
  });

  it('should register event handlers via on()', () => {
    const session = createMockSession();
    const handler = () => {};
    session.on(handler);
    expect(session.on).toHaveBeenCalledWith(handler);
    expect(session._handlers()).toHaveLength(1);
  });

  it('should dispatch events to registered handlers via _emit()', () => {
    const session = createMockSession();
    const received: unknown[] = [];
    session.on((event: unknown) => received.push(event));

    const event = sessionStartEvent();
    session._emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toBe(event);
  });

  it('send() should resolve with a message id', async () => {
    const session = createMockSession();
    const result = await session.send({ prompt: 'hello' });
    expect(result).toBe('msg-001');
  });
});

describe('createMockClient', () => {
  it('should create a client whose createSession resolves to a mock session', async () => {
    const client = createMockClient();
    const session = await client.createSession({});
    expect(session.sessionId).toBe('mock-session-001');
  });

  it('should accept a pre-configured session', async () => {
    const session = createMockSession({ sessionId: 'pre-configured' });
    const client = createMockClient({ session });
    const result = await client.createSession({});
    expect(result.sessionId).toBe('pre-configured');
  });
});

// ---------------------------------------------------------------------------
// Event factory
// ---------------------------------------------------------------------------

describe('event factory', () => {
  it('sessionStartEvent produces a valid session.start event', () => {
    const event = sessionStartEvent();
    expect(event.type).toBe('session.start');
    expect(event.id).toMatch(/^evt-/);
    if (event.type === 'session.start') {
      expect(event.data.sessionId).toBe('test-session-001');
      expect(event.data.version).toBe(1);
    }
  });

  it('assistantMessageEvent produces a valid assistant.message event', () => {
    const event = assistantMessageEvent('Hello, world!');
    expect(event.type).toBe('assistant.message');
    if (event.type === 'assistant.message') {
      expect(event.data.content).toBe('Hello, world!');
    }
  });

  it('assistantUsageEvent produces a valid assistant.usage event', () => {
    const event = assistantUsageEvent({ model: 'claude-opus-4', inputTokens: 200 });
    expect(event.type).toBe('assistant.usage');
    if (event.type === 'assistant.usage') {
      expect(event.data.model).toBe('claude-opus-4');
      expect(event.data.inputTokens).toBe(200);
    }
    expect(event.ephemeral).toBe(true);
  });

  it('toolExecutionStartEvent produces a valid tool.execution_start', () => {
    const event = toolExecutionStartEvent('read_file');
    expect(event.type).toBe('tool.execution_start');
    if (event.type === 'tool.execution_start') {
      expect(event.data.toolName).toBe('read_file');
    }
  });

  it('toolExecutionCompleteEvent produces a valid tool.execution_complete', () => {
    const event = toolExecutionCompleteEvent('call-001', 'ok', { success: true });
    expect(event.type).toBe('tool.execution_complete');
    if (event.type === 'tool.execution_complete') {
      expect(event.data.toolCallId).toBe('call-001');
      expect(event.data.success).toBe(true);
      expect(event.data.result?.content).toBe('ok');
    }
  });

  it('userMessageEvent produces a valid user.message event', () => {
    const event = userMessageEvent('Fix the bug');
    expect(event.type).toBe('user.message');
    if (event.type === 'user.message') {
      expect(event.data.content).toBe('Fix the bug');
    }
  });

  it('auto-increments event ids across factory calls', () => {
    const e1 = sessionStartEvent();
    const e2 = assistantMessageEvent('a');
    expect(e1.id).not.toBe(e2.id);
  });

  it('resetEventCounter resets the id sequence', () => {
    sessionStartEvent();
    resetEventCounter();
    const event = sessionStartEvent();
    expect(event.id).toBe('evt-0001');
  });
});

// ---------------------------------------------------------------------------
// Type assertion helpers
// ---------------------------------------------------------------------------

describe('CairnBridgeEvent type assertions', () => {
  const validEvent: CairnBridgeEvent = {
    sessionId: 'sess-001',
    eventType: 'session_start',
    payload: '{}',
    createdAt: new Date().toISOString(),
    provenanceTier: 'internal',
  };

  it('assertIsCairnBridgeEvent passes for a valid event', () => {
    expect(() => assertIsCairnBridgeEvent(validEvent)).not.toThrow();
  });

  it('isCairnBridgeEvent returns true for a valid event', () => {
    expect(isCairnBridgeEvent(validEvent)).toBe(true);
  });

  it('rejects null', () => {
    expect(isCairnBridgeEvent(null)).toBe(false);
  });

  it('rejects missing sessionId', () => {
    expect(isCairnBridgeEvent({ ...validEvent, sessionId: '' })).toBe(false);
  });

  it('rejects missing eventType', () => {
    expect(isCairnBridgeEvent({ ...validEvent, eventType: '' })).toBe(false);
  });

  it('rejects non-string payload', () => {
    expect(isCairnBridgeEvent({ ...validEvent, payload: 42 })).toBe(false);
  });

  it('rejects invalid provenanceTier', () => {
    expect(isCairnBridgeEvent({ ...validEvent, provenanceTier: 'bogus' })).toBe(false);
  });

  it('accepts all valid provenance tiers', () => {
    for (const tier of ['internal', 'certification', 'deployment'] as const) {
      expect(isCairnBridgeEvent({ ...validEvent, provenanceTier: tier })).toBe(true);
    }
  });

  it('assertIsCairnBridgeEvent throws descriptive messages', () => {
    expect(() => assertIsCairnBridgeEvent(null)).toThrow(/Expected CairnBridgeEvent/);
    expect(() => assertIsCairnBridgeEvent({ ...validEvent, sessionId: 42 })).toThrow(/sessionId/);
  });
});

// ---------------------------------------------------------------------------
// Cross-package imports
// ---------------------------------------------------------------------------

describe('cross-package imports', () => {
  it('@akubly/types is importable and exports CairnBridgeEvent', () => {
    const event: CairnBridgeEvent = {
      sessionId: 'x',
      eventType: 'y',
      payload: '{}',
      createdAt: '2026-01-01T00:00:00Z',
      provenanceTier: 'internal',
    };
    expect(event.sessionId).toBe('x');
  });
});
