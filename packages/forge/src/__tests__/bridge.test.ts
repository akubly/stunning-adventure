/**
 * Event bridge tests — Verifying SDK-to-Cairn event mapping at runtime.
 *
 * Tests the EVENT_MAP coverage, provenance classification, payload extraction,
 * and edge case handling. Tests run against the production bridge module at
 * packages/forge/src/bridge/index.ts.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import type { SessionEvent } from '@github/copilot-sdk';
import { bridgeEvent, classifyProvenance, EVENT_MAP, PAYLOAD_EXTRACTORS } from '../bridge/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SessionEvent for testing. Casts through `unknown` because
 *  the SDK type is a discriminated union — test events don't need full fidelity. */
function makeSdkEvent(type: string, data: unknown = {}): SessionEvent {
  return {
    id: 'evt-test-001',
    parentId: null,
    type,
    timestamp: new Date().toISOString(),
    data,
  } as unknown as SessionEvent;
}

// ---------------------------------------------------------------------------
// EVENT_MAP coverage — all 22 mapped events
// ---------------------------------------------------------------------------

describe('EVENT_MAP coverage', () => {
  it('maps exactly 22 SDK event types', () => {
    expect(Object.keys(EVENT_MAP)).toHaveLength(22);
  });

  it('has 9 clean 1:1 maps', () => {
    const cleanMaps = [
      'session.start', 'session.idle', 'session.error', 'session.shutdown',
      'user.message', 'tool.execution_start', 'tool.execution_complete',
      'assistant.message', 'assistant.usage',
    ];
    for (const sdk of cleanMaps) {
      expect(EVENT_MAP).toHaveProperty(sdk);
    }
  });

  it('has 5 transform-needed maps', () => {
    const transforms = [
      'session.usage_info', 'session.compaction_complete',
      'session.model_change', 'assistant.turn_start', 'assistant.turn_end',
    ];
    for (const sdk of transforms) {
      expect(EVENT_MAP).toHaveProperty(sdk);
    }
  });

  it('has 8 new Cairn type maps', () => {
    const newTypes = [
      'subagent.started', 'subagent.completed', 'subagent.failed',
      'permission.requested', 'permission.completed',
      'session.plan_changed', 'skill.invoked', 'session.snapshot_rewind',
    ];
    for (const sdk of newTypes) {
      expect(EVENT_MAP).toHaveProperty(sdk);
    }
  });

  it('all mapped SDK events produce valid CairnBridgeEvents', () => {
    for (const sdkType of Object.keys(EVENT_MAP)) {
      const event = makeSdkEvent(sdkType, { sample: 'data' });
      const result = bridgeEvent('sess-001', event);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('sess-001');
      expect(result!.eventType).toBe((EVENT_MAP as Record<string, string>)[sdkType]);
      expect(typeof result!.payload).toBe('string');
      expect(() => JSON.parse(result!.payload)).not.toThrow();
      expect(['internal', 'certification']).toContain(result!.provenanceTier);
    }
  });
});

// ---------------------------------------------------------------------------
// Provenance classification
// ---------------------------------------------------------------------------

describe('provenance classification', () => {
  it('certification events get certification tier', () => {
    const certificationSdkEvents = [
      'permission.requested', 'permission.completed',
      'session.plan_changed', 'session.error',
      'subagent.started', 'subagent.completed', 'subagent.failed',
      'skill.invoked', 'session.snapshot_rewind',
    ];

    for (const sdkType of certificationSdkEvents) {
      const result = bridgeEvent('sess-001', makeSdkEvent(sdkType));
      expect(result).not.toBeNull();
      expect(result!.provenanceTier).toBe('certification');
    }
  });

  it('mechanical events get internal tier', () => {
    const internalSdkEvents = [
      'session.start', 'session.idle', 'session.shutdown',
      'user.message', 'tool.execution_start', 'tool.execution_complete',
      'assistant.message', 'assistant.usage',
      'session.usage_info', 'session.compaction_complete',
      'session.model_change', 'assistant.turn_start', 'assistant.turn_end',
    ];

    for (const sdkType of internalSdkEvents) {
      const result = bridgeEvent('sess-001', makeSdkEvent(sdkType));
      expect(result).not.toBeNull();
      expect(result!.provenanceTier).toBe('internal');
    }
  });

  it('classifyProvenance returns internal for unknown event types', () => {
    expect(classifyProvenance('some_future_event')).toBe('internal');
  });
});

// ---------------------------------------------------------------------------
// Payload extractors
// ---------------------------------------------------------------------------

describe('payload extractors', () => {
  it('assistant.usage extracts token counts and flattens copilotUsage', () => {
    const event = makeSdkEvent('assistant.usage', {
      model: 'gpt-4',
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 200,
      cacheWriteTokens: 100,
      cost: 0.05,
      duration: 2000,
      ttftMs: 150,
      copilotUsage: { totalNanoAiu: 42 },
    });

    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);

    expect(payload.model).toBe('gpt-4');
    expect(payload.inputTokens).toBe(1000);
    expect(payload.outputTokens).toBe(500);
    expect(payload.totalNanoAiu).toBe(42);
    expect(payload).not.toHaveProperty('copilotUsage');
  });

  it('tool.execution_start extracts toolCallId, toolName, mcpServerName (omits args)', () => {
    const event = makeSdkEvent('tool.execution_start', {
      toolCallId: 'tc-123',
      toolName: 'edit',
      mcpServerName: 'filesystem',
      arguments: { path: '/secret/file.txt', content: 'sensitive' },
    });

    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);

    expect(payload.toolCallId).toBe('tc-123');
    expect(payload.toolName).toBe('edit');
    expect(payload.mcpServerName).toBe('filesystem');
    expect(payload).not.toHaveProperty('arguments');
  });

  it('tool.execution_complete extracts toolCallId, success, error (omits result content)', () => {
    const event = makeSdkEvent('tool.execution_complete', {
      toolCallId: 'tc-123',
      success: true,
      error: null,
      result: 'very large result content that should be omitted',
    });

    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);

    expect(payload.toolCallId).toBe('tc-123');
    expect(payload.success).toBe(true);
    expect(payload).not.toHaveProperty('result');
  });

  it('session.usage_info extracts context window metrics', () => {
    const event = makeSdkEvent('session.usage_info', {
      tokenLimit: 128000,
      currentTokens: 45000,
      messagesLength: 24,
      systemTokens: 5000,
      conversationTokens: 35000,
      toolDefinitionsTokens: 5000,
    });

    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);

    expect(payload.tokenLimit).toBe(128000);
    expect(payload.currentTokens).toBe(45000);
    expect(payload.messagesLength).toBe(24);
  });

  it('clean 1:1 maps use default extractor (pass-through)', () => {
    const data = { foo: 'bar', count: 42 };
    const event = makeSdkEvent('session.start', data);
    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);

    expect(payload).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// Unmapped events — graceful skip
// ---------------------------------------------------------------------------

describe('unmapped events', () => {
  it('returns null for unmapped SDK event types', () => {
    const unmappedTypes = [
      'hook.start', 'hook.end', 'assistant.thinking',
      'session.checkpoint', 'totally.unknown.event',
    ];

    for (const type of unmappedTypes) {
      const result = bridgeEvent('sess-001', makeSdkEvent(type));
      expect(result).toBeNull();
    }
  });

  it('does not throw for unmapped events', () => {
    expect(() => bridgeEvent('sess-001', makeSdkEvent('unknown.type'))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('handles null data gracefully', () => {
    const event = makeSdkEvent('session.start', null);
    const result = bridgeEvent('sess-001', event);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!.payload)).not.toThrow();
  });

  it('handles undefined data gracefully', () => {
    const event = makeSdkEvent('session.start', undefined);
    const result = bridgeEvent('sess-001', event);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!.payload)).not.toThrow();
  });

  it('handles empty object data', () => {
    const event = makeSdkEvent('session.start', {});
    const result = bridgeEvent('sess-001', event);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!.payload)).toEqual({});
  });

  it('preserves sessionId through the bridge', () => {
    const sessionId = 'unique-session-id-12345';
    const result = bridgeEvent(sessionId, makeSdkEvent('session.start'));
    expect(result!.sessionId).toBe(sessionId);
  });

  it('preserves timestamp from SDK event', () => {
    const timestamp = '2026-04-28T12:00:00.000Z';
    const event = { id: 'evt-ts', parentId: null, type: 'session.start', timestamp, data: {} } as unknown as SessionEvent;
    const result = bridgeEvent('sess-001', event);
    expect(result!.createdAt).toBe(timestamp);
  });

  it('handles nested data in default extractor', () => {
    const nestedData = {
      level1: { level2: { level3: 'deep' } },
      array: [1, 2, 3],
    };
    const event = makeSdkEvent('session.idle', nestedData);
    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);
    expect(payload.level1.level2.level3).toBe('deep');
    expect(payload.array).toEqual([1, 2, 3]);
  });

  it('assistant.usage handles missing copilotUsage gracefully', () => {
    const event = makeSdkEvent('assistant.usage', {
      model: 'gpt-4',
      inputTokens: 100,
      outputTokens: 50,
    });
    const result = bridgeEvent('sess-001', event)!;
    const payload = JSON.parse(result.payload);
    expect(payload.totalNanoAiu).toBeUndefined();
  });
});
