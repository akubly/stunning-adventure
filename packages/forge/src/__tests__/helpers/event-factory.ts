/**
 * Event factory — create well-typed SessionEvent objects for testing
 * the Forge event bridge without a live Copilot CLI.
 */
import type { SessionEvent } from '@github/copilot-sdk';

let _counter = 0;

function nextId(): string {
  return `evt-${String(++_counter).padStart(4, '0')}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Reset the internal counter (call in beforeEach). */
export function resetEventCounter(): void {
  _counter = 0;
}

// ---------------------------------------------------------------------------
// Common event base
// ---------------------------------------------------------------------------

interface EventBase {
  id?: string;
  timestamp?: string;
  parentId?: string | null;
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function sessionStartEvent(
  overrides: EventBase & {
    sessionId?: string;
    producer?: string;
    selectedModel?: string;
  } = {},
): SessionEvent {
  return {
    id: overrides.id ?? nextId(),
    timestamp: overrides.timestamp ?? now(),
    parentId: overrides.parentId ?? null,
    type: 'session.start',
    data: {
      sessionId: overrides.sessionId ?? 'test-session-001',
      version: 1,
      producer: overrides.producer ?? 'copilot-agent',
      copilotVersion: '1.0.0-test',
      startTime: overrides.timestamp ?? now(),
      selectedModel: overrides.selectedModel,
    },
  };
}

export function assistantMessageEvent(
  content: string,
  overrides: EventBase & { messageId?: string } = {},
): SessionEvent {
  return {
    id: overrides.id ?? nextId(),
    timestamp: overrides.timestamp ?? now(),
    parentId: overrides.parentId ?? null,
    type: 'assistant.message',
    data: {
      messageId: overrides.messageId ?? `msg-${nextId()}`,
      content,
    },
  };
}

export function assistantUsageEvent(
  overrides: EventBase & {
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
    id: overrides.id ?? nextId(),
    timestamp: overrides.timestamp ?? now(),
    parentId: overrides.parentId ?? null,
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
  overrides: EventBase & { toolCallId?: string } = {},
): SessionEvent {
  return {
    id: overrides.id ?? nextId(),
    timestamp: overrides.timestamp ?? now(),
    parentId: overrides.parentId ?? null,
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
  overrides: EventBase & { success?: boolean } = {},
): SessionEvent {
  return {
    id: overrides.id ?? nextId(),
    timestamp: overrides.timestamp ?? now(),
    parentId: overrides.parentId ?? null,
    type: 'tool.execution_complete',
    data: {
      toolCallId,
      success: overrides.success ?? true,
      result: { content: result },
    },
  };
}

export function userMessageEvent(
  content: string,
  overrides: EventBase = {},
): SessionEvent {
  return {
    id: overrides.id ?? nextId(),
    timestamp: overrides.timestamp ?? now(),
    parentId: overrides.parentId ?? null,
    type: 'user.message',
    data: {
      content,
    },
  };
}
