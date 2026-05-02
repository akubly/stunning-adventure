/**
 * Session module tests — Verifying ModelSnapshot shapes, toModelSnapshot
 * extraction, and ReasoningEffort type constraints.
 *
 * Tests run against the production session module at
 * packages/forge/src/session/index.ts. The spike reference for behavior
 * is packages/cairn/src/spike/model-selection-poc.ts.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  toModelSnapshot,
  type ModelSnapshot,
  type ReasoningEffort,
} from '../session/index.js';
import type { ModelInfo } from '@github/copilot-sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal SDK ModelInfo object for testing. */
function makeModelInfo(overrides: Partial<ModelInfo> = {}): ModelInfo {
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
    billing: {
      multiplier: 1.5,
    },
    policy: {
      state: 'enabled',
      terms: '',
    },
    supportedReasoningEfforts: undefined,
    defaultReasoningEffort: undefined,
    ...overrides,
  } as ModelInfo;
}

// ---------------------------------------------------------------------------
// ModelSnapshot shape
// ---------------------------------------------------------------------------

describe('ModelSnapshot shape', () => {
  it('all required fields present', () => {
    const snapshot = toModelSnapshot(makeModelInfo());

    expect(typeof snapshot.id).toBe('string');
    expect(typeof snapshot.name).toBe('string');
    expect(typeof snapshot.contextWindow).toBe('number');
    expect(typeof snapshot.supportsVision).toBe('boolean');
    expect(typeof snapshot.supportsReasoning).toBe('boolean');
  });

  it('optional fields work correctly', () => {
    const snapshot = toModelSnapshot(makeModelInfo({
      billing: { multiplier: 2.0 },
      policy: { state: 'disabled', terms: 'some-terms' },
      supportedReasoningEfforts: ['low', 'medium', 'high'],
      defaultReasoningEffort: 'medium',
    }));

    expect(snapshot.billingMultiplier).toBe(2.0);
    expect(snapshot.policyState).toBe('disabled');
    expect(snapshot.supportedReasoningEfforts).toEqual(['low', 'medium', 'high']);
    expect(snapshot.defaultReasoningEffort).toBe('medium');
  });

  it('optional fields undefined when not provided', () => {
    const snapshot = toModelSnapshot(makeModelInfo({
      billing: undefined,
      policy: undefined,
      supportedReasoningEfforts: undefined,
      defaultReasoningEffort: undefined,
    }));

    expect(snapshot.billingMultiplier).toBeUndefined();
    expect(snapshot.policyState).toBeUndefined();
    expect(snapshot.supportedReasoningEfforts).toBeUndefined();
    expect(snapshot.defaultReasoningEffort).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// toModelSnapshot
// ---------------------------------------------------------------------------

describe('toModelSnapshot', () => {
  it('extracts correct fields from ModelInfo', () => {
    const info = makeModelInfo();
    const snapshot = toModelSnapshot(info);

    expect(snapshot.id).toBe('gpt-4');
    expect(snapshot.name).toBe('GPT-4');
    expect(snapshot.contextWindow).toBe(128000);
    expect(snapshot.maxOutputTokens).toBe(4096);
    expect(snapshot.supportsVision).toBe(true);
    expect(snapshot.supportsReasoning).toBe(false);
    expect(snapshot.billingMultiplier).toBe(1.5);
    expect(snapshot.policyState).toBe('enabled');
  });

  it('handles missing optional fields', () => {
    const info = makeModelInfo({
      billing: undefined,
      policy: undefined,
      supportedReasoningEfforts: undefined,
      defaultReasoningEffort: undefined,
    });
    const snapshot = toModelSnapshot(info);

    expect(snapshot.id).toBe('gpt-4');
    expect(snapshot.name).toBe('GPT-4');
    expect(snapshot.billingMultiplier).toBeUndefined();
    expect(snapshot.policyState).toBeUndefined();
    expect(snapshot.supportedReasoningEfforts).toBeUndefined();
    expect(snapshot.defaultReasoningEffort).toBeUndefined();
  });

  it('strips internal fields, keeps only analytics-relevant ones', () => {
    // Add extra properties via cast to simulate SDK internals
    const info = {
      ...makeModelInfo(),
      _internal: { debug: true, trace: 'abc' },
      connectionConfig: { timeout: 5000, retries: 3 },
      rawResponse: { headers: {} },
    } as unknown as ModelInfo;
    const snapshot = toModelSnapshot(info);

    // Internal fields must NOT leak into snapshot
    expect(snapshot).not.toHaveProperty('_internal');
    expect(snapshot).not.toHaveProperty('connectionConfig');
    expect(snapshot).not.toHaveProperty('rawResponse');

    // Only the expected fields
    const keys = Object.keys(snapshot);
    const allowedKeys = [
      'id', 'name', 'contextWindow', 'maxOutputTokens',
      'supportsVision', 'supportsReasoning', 'billingMultiplier',
      'policyState', 'supportedReasoningEfforts', 'defaultReasoningEffort',
    ];
    for (const key of keys) {
      expect(allowedKeys).toContain(key);
    }
  });

  it('extracts reasoning effort fields from reasoning model', () => {
    const info = makeModelInfo({
      capabilities: {
        limits: { max_context_window_tokens: 200000, max_prompt_tokens: 8192 },
        supports: { vision: false, reasoningEffort: true },
      },
      supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
      defaultReasoningEffort: 'high',
    });
    const snapshot = toModelSnapshot(info);

    expect(snapshot.supportsReasoning).toBe(true);
    expect(snapshot.supportedReasoningEfforts).toEqual(['low', 'medium', 'high', 'xhigh']);
    expect(snapshot.defaultReasoningEffort).toBe('high');
  });

  it('handles model with zero context window', () => {
    const info = makeModelInfo({
      capabilities: {
        limits: { max_context_window_tokens: 0, max_prompt_tokens: 0 },
        supports: { vision: false, reasoningEffort: false },
      },
    });
    const snapshot = toModelSnapshot(info);

    expect(snapshot.contextWindow).toBe(0);
    expect(snapshot.maxOutputTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ReasoningEffort type
// ---------------------------------------------------------------------------

describe('ReasoningEffort type', () => {
  it('accepts valid values', () => {
    const validEfforts: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh'];
    expect(validEfforts).toHaveLength(4);
    for (const effort of validEfforts) {
      expect(['low', 'medium', 'high', 'xhigh']).toContain(effort);
    }
  });

  it('type-level: only string literals are valid', () => {
    // This is primarily a compile-time check. At runtime, verify
    // the type is a string union by checking known values.
    const low: ReasoningEffort = 'low';
    const med: ReasoningEffort = 'medium';
    const high: ReasoningEffort = 'high';
    const xhigh: ReasoningEffort = 'xhigh';

    expect(low).toBe('low');
    expect(med).toBe('medium');
    expect(high).toBe('high');
    expect(xhigh).toBe('xhigh');
  });
});
