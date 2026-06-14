/**
 * Local mock-SDK helpers for skillsmith-runtime tests.
 *
 * Provides minimal fakes for CopilotClient / CopilotSession so that
 * pipeline-e2e.test.ts can drive ForgeSession without reaching into
 * forge's internal test-helper layout.
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
}

export function createMockSession(opts: MockSessionOptions = {}): MockCopilotSession {
  const handlers: SessionEventHandler[] = [];
  const typedHandlers = new Map<string, SessionEventHandler[]>();
  const sessionId = opts.sessionId ?? 'mock-session-001';

  return {
    sessionId,
    send: vi.fn().mockResolvedValue('msg-001'),
    sendAndWait: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(
      (
        handlerOrType: SessionEventType | SessionEventHandler,
        maybeHandler?: SessionEventHandler,
      ) => {
        if (typeof handlerOrType === 'function') {
          handlers.push(handlerOrType);
        } else {
          const list = typedHandlers.get(handlerOrType) ?? [];
          list.push(maybeHandler!);
          typedHandlers.set(handlerOrType, list);
        }
        return () => {
          /* unsubscribe stub */
        };
      },
    ),
    _emit(event: SessionEvent) {
      for (const h of handlers) h(event);
      const typed = typedHandlers.get(event.type);
      if (typed) {
        for (const h of typed) h(event);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Mock CopilotClient
// ---------------------------------------------------------------------------

export interface MockClientOptions {
  session?: MockCopilotSession;
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
  _session: MockCopilotSession;
}

export function createMockClient(opts: MockClientOptions = {}): MockCopilotClient {
  const session = opts.session ?? createMockSession();
  const models: ModelInfo[] = opts.models ?? [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      capabilities: {
        limits: { max_context_window_tokens: 128000, max_prompt_tokens: 4096 },
        supports: { vision: true, reasoningEffort: false },
      },
      billing: { multiplier: 1.5 },
      policy: { state: 'enabled', terms: '' },
      supportedReasoningEfforts: undefined,
      defaultReasoningEffort: undefined,
    } as ModelInfo,
  ];

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

// ---------------------------------------------------------------------------
// Event factories (subset needed by pipeline-e2e)
// ---------------------------------------------------------------------------

let _counter = 0;

export function resetEventCounter(): void {
  _counter = 0;
}

function nextId(): string {
  return `evt-${String(++_counter).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

export function assistantUsageEvent(
  overrides: {
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cost?: number;
    duration?: number;
  } = {},
): SessionEvent {
  return {
    id: nextId(),
    timestamp: now(),
    parentId: null,
    ephemeral: true,
    type: 'assistant.usage',
    data: {
      model: overrides.model ?? 'gpt-4',
      inputTokens: overrides.inputTokens ?? 100,
      outputTokens: overrides.outputTokens ?? 50,
      cacheReadTokens: overrides.cacheReadTokens,
      cacheWriteTokens: overrides.cacheWriteTokens,
      cost: overrides.cost,
      duration: overrides.duration ?? 1200,
    },
  };
}

export function toolExecutionStartEvent(
  toolName: string,
  overrides: { toolCallId?: string } = {},
): SessionEvent {
  return {
    id: nextId(),
    timestamp: now(),
    parentId: null,
    type: 'tool.execution_start',
    data: {
      toolCallId: overrides.toolCallId ?? `call-${nextId()}`,
      toolName,
    },
  };
}

export function toolExecutionCompleteEvent(
  toolCallId: string,
  result: string,
  overrides: { success?: boolean } = {},
): SessionEvent {
  return {
    id: nextId(),
    timestamp: now(),
    parentId: null,
    type: 'tool.execution_complete',
    data: {
      toolCallId,
      success: overrides.success ?? true,
      result: { content: result },
    },
  };
}
