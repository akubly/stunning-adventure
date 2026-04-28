/**
 * SDK mock factory — provides mock CopilotClient and CopilotSession
 * that don't need a running Copilot CLI process.
 *
 * All Forge unit tests MUST use these mocks instead of real SDK objects.
 */
import { vi } from 'vitest';
import type {
  SessionEvent,
  SessionEventHandler,
  SessionEventType,
} from '@github/copilot-sdk';

// ---------------------------------------------------------------------------
// Mock CopilotSession
// ---------------------------------------------------------------------------

export interface MockSessionOptions {
  sessionId?: string;
}

export interface MockCopilotSession {
  readonly sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  send: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendAndWait: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  disconnect: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: any;

  /** Test helper: fire a SessionEvent to all registered handlers. */
  _emit(event: SessionEvent): void;
  /** Test helper: get all registered untyped event handlers. */
  _handlers(): SessionEventHandler[];
}

export function createMockSession(
  opts: MockSessionOptions = {},
): MockCopilotSession {
  const handlers: SessionEventHandler[] = [];
  const sessionId = opts.sessionId ?? 'mock-session-001';

  return {
    sessionId,
    send: vi.fn().mockResolvedValue('msg-001'),
    sendAndWait: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((handlerOrType: SessionEventType | SessionEventHandler, maybeHandler?: SessionEventHandler) => {
      const handler = typeof handlerOrType === 'function' ? handlerOrType : maybeHandler!;
      handlers.push(handler);
    }),
    _emit(event: SessionEvent) {
      for (const h of handlers) h(event);
    },
    _handlers() {
      return [...handlers];
    },
  };
}

// ---------------------------------------------------------------------------
// Mock CopilotClient
// ---------------------------------------------------------------------------

export interface MockClientOptions {
  session?: MockCopilotSession;
}

export interface MockCopilotClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createSession: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stop: any;
  /** The session that createSession will resolve to. */
  _session: MockCopilotSession;
}

export function createMockClient(
  opts: MockClientOptions = {},
): MockCopilotClient {
  const session = opts.session ?? createMockSession();

  return {
    createSession: vi.fn().mockResolvedValue(session),
    stop: vi.fn().mockResolvedValue(undefined),
    _session: session,
  };
}
