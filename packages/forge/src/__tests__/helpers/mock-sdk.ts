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
  ModelInfo,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setModel: any;

  /** Test helper: fire a SessionEvent to all registered handlers. */
  _emit(event: SessionEvent): void;
  /** Test helper: get all registered untyped event handlers. */
  _handlers(): SessionEventHandler[];
  /** Test helper: get typed event handlers for a specific event type. */
  _typedHandlers(): Map<string, SessionEventHandler[]>;
}

export function createMockSession(
  opts: MockSessionOptions = {},
): MockCopilotSession {
  const handlers: SessionEventHandler[] = [];
  const typedHandlers = new Map<string, SessionEventHandler[]>();
  const sessionId = opts.sessionId ?? 'mock-session-001';

  return {
    sessionId,
    send: vi.fn().mockResolvedValue('msg-001'),
    sendAndWait: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    on: vi.fn((handlerOrType: SessionEventType | SessionEventHandler, maybeHandler?: SessionEventHandler) => {
      if (typeof handlerOrType === 'function') {
        handlers.push(handlerOrType);
      } else {
        const list = typedHandlers.get(handlerOrType) ?? [];
        list.push(maybeHandler!);
        typedHandlers.set(handlerOrType, list);
      }
      return () => { /* unsubscribe stub */ };
    }),
    _emit(event: SessionEvent) {
      for (const h of handlers) h(event);
      const typed = typedHandlers.get(event.type);
      if (typed) {
        for (const h of typed) h(event);
      }
    },
    _handlers() {
      return [...handlers];
    },
    _typedHandlers() {
      return new Map(typedHandlers);
    },
  };
}

// ---------------------------------------------------------------------------
// Mock CopilotClient
// ---------------------------------------------------------------------------

export interface MockClientOptions {
  session?: MockCopilotSession;
  /** Models returned by listModels(). Defaults to a single GPT-4 entry. */
  models?: ModelInfo[];
}

export interface MockCopilotClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createSession: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeSession: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listSessions: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listModels: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAuthStatus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getStatus: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stop: any;
  /** The session that createSession will resolve to. */
  _session: MockCopilotSession;
}

/** Build a minimal SDK ModelInfo for testing. */
export function makeModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: 'gpt-4',
    name: 'GPT-4',
    capabilities: {
      limits: {
        max_context_window_tokens: 128000,
        max_prompt_tokens: 4096,
      },
      supports: {
        vision: true,
        reasoningEffort: false,
      },
    },
    billing: { multiplier: 1.5 },
    policy: { state: 'enabled', terms: '' },
    supportedReasoningEfforts: undefined,
    defaultReasoningEffort: undefined,
    ...overrides,
  } as ModelInfo;
}

export function createMockClient(
  opts: MockClientOptions = {},
): MockCopilotClient {
  const session = opts.session ?? createMockSession();
  const models = opts.models ?? [makeModelInfo()];

  return {
    createSession: vi.fn().mockResolvedValue(session),
    resumeSession: vi.fn().mockResolvedValue(session),
    listSessions: vi.fn().mockResolvedValue([]),
    listModels: vi.fn().mockResolvedValue(models),
    getAuthStatus: vi.fn().mockResolvedValue({ isAuthenticated: true }),
    getStatus: vi.fn().mockResolvedValue({ running: true }),
    stop: vi.fn().mockResolvedValue(undefined),
    _session: session,
  };
}
