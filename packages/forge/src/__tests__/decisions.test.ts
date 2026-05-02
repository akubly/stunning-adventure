/**
 * Decision gate tests — Verifying hook-based gating, decision recording,
 * and error isolation at runtime.
 *
 * Tests run against the production decisions module at
 * packages/forge/src/decisions/index.ts. The spike reference for behavior
 * is packages/cairn/src/spike/decision-gate-poc.ts.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createDecisionGate,
  createDecisionRecorder,
  makeDecisionRecord,
} from '../decisions/index.js';
import type { DecisionRecord, DecisionSource } from '@akubly/types';
import type { PreToolUseInput, HookInvocation } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INVOCATION: HookInvocation = { sessionId: 'sess-gate-001' };

function makePreInput(toolName = 'edit', toolArgs: unknown = {}): PreToolUseInput {
  return { timestamp: Date.now(), cwd: '/repo', toolName, toolArgs };
}

// ---------------------------------------------------------------------------
// createDecisionGate
// ---------------------------------------------------------------------------

describe('createDecisionGate', () => {
  it('triggers for configured tool names', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      (name) => ['bash', 'powershell'].includes(name),
      (record) => decisions.push(record),
    );

    await gate.onPreToolUse!(makePreInput('bash'), INVOCATION);

    expect(decisions).toHaveLength(1);
    expect(decisions[0].toolName).toBe('bash');
  });

  it('passes through non-gated tools', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      (name) => name === 'bash',
      (record) => decisions.push(record),
    );

    const result = await gate.onPreToolUse!(makePreInput('view'), INVOCATION);

    expect(decisions).toHaveLength(0);
    expect(result).toEqual({});
  });

  it('calls onDecision with a well-formed DecisionRecord', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      () => true,
      (record) => decisions.push(record),
    );

    await gate.onPreToolUse!(makePreInput('edit', { file: 'main.ts' }), INVOCATION);

    expect(decisions).toHaveLength(1);
    const record = decisions[0];

    // All required DecisionRecord fields present
    expect(typeof record.id).toBe('string');
    expect(record.id.length).toBeGreaterThan(0);
    expect(typeof record.timestamp).toBe('string');
    expect(typeof record.question).toBe('string');
    expect(typeof record.chosenOption).toBe('string');
    expect(Array.isArray(record.alternatives)).toBe(true);
    expect(Array.isArray(record.evidence)).toBe(true);
    expect(['high', 'medium', 'low']).toContain(record.confidence);
    expect(['human', 'automated_rule', 'ai_recommendation']).toContain(record.source);
    expect(['internal', 'certification']).toContain(record.provenanceTier);
    expect(record.toolName).toBe('edit');
  });

  it('returns { permissionDecision: "ask" } for gated tools', async () => {
    const gate = createDecisionGate(
      () => true,
      () => {},
    );

    const result = await gate.onPreToolUse!(makePreInput('bash'), INVOCATION);

    expect(result).toHaveProperty('permissionDecision', 'ask');
  });

  it('returns {} for non-gated tools', async () => {
    const gate = createDecisionGate(
      () => false,
      () => {},
    );

    const result = await gate.onPreToolUse!(makePreInput('view'), INVOCATION);

    expect(result).toEqual({});
  });

  it('onDecision callback errors do not kill the gate', async () => {
    const gate = createDecisionGate(
      () => true,
      () => { throw new Error('callback exploded'); },
    );

    // Should not throw — error isolation
    const result = await gate.onPreToolUse!(makePreInput('bash'), INVOCATION);

    // Gate still returns its gating decision despite callback error
    expect(result).toHaveProperty('permissionDecision', 'ask');
  });

  it('includes session ID in evidence', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      () => true,
      (record) => decisions.push(record),
    );

    await gate.onPreToolUse!(makePreInput('bash'), INVOCATION);

    const evidence = decisions[0].evidence;
    expect(evidence.some((e) => e.includes(INVOCATION.sessionId))).toBe(true);
  });

  it('sets provenanceTier to certification for gated decisions', async () => {
    const decisions: DecisionRecord[] = [];
    const gate = createDecisionGate(
      () => true,
      (record) => decisions.push(record),
    );

    await gate.onPreToolUse!(makePreInput('bash'), INVOCATION);

    expect(decisions[0].provenanceTier).toBe('certification');
  });
});

// ---------------------------------------------------------------------------
// createDecisionRecorder
// ---------------------------------------------------------------------------

describe('createDecisionRecorder', () => {
  it('records tool calls passively without gating', async () => {
    const records: DecisionRecord[] = [];
    const recorder = createDecisionRecorder((record) => records.push(record));

    const result = await recorder.onPreToolUse!(makePreInput('edit'), INVOCATION);

    // Passive recording — should not gate (no permissionDecision)
    expect(result).toEqual({});
    expect(records).toHaveLength(1);
  });

  it('produces DecisionRecords with correct fields', async () => {
    const records: DecisionRecord[] = [];
    const recorder = createDecisionRecorder((record) => records.push(record));

    await recorder.onPreToolUse!(makePreInput('bash', { cmd: 'ls' }), INVOCATION);

    const record = records[0];
    expect(typeof record.id).toBe('string');
    expect(typeof record.timestamp).toBe('string');
    expect(record.toolName).toBe('bash');
    expect(record.source).toBe('automated_rule');
    expect(record.provenanceTier).toBeDefined();
  });

  it('records multiple tool calls independently', async () => {
    const records: DecisionRecord[] = [];
    const recorder = createDecisionRecorder((record) => records.push(record));

    await recorder.onPreToolUse!(makePreInput('edit'), INVOCATION);
    await recorder.onPreToolUse!(makePreInput('bash'), INVOCATION);
    await recorder.onPreToolUse!(makePreInput('view'), INVOCATION);

    expect(records).toHaveLength(3);
    expect(records.map((r) => r.toolName)).toEqual(['edit', 'bash', 'view']);
  });
});

// ---------------------------------------------------------------------------
// makeDecisionRecord
// ---------------------------------------------------------------------------

describe('makeDecisionRecord', () => {
  it('generates unique IDs', () => {
    const r1 = makeDecisionRecord({
      question: 'Allow edit?',
      chosenOption: 'allow',
      source: 'human',
      toolName: 'edit',
      alternatives: ['allow', 'deny'],
      evidence: ['Tool: edit'],
      confidence: 'high',
      provenanceTier: 'certification',
    });
    const r2 = makeDecisionRecord({
      question: 'Allow edit?',
      chosenOption: 'allow',
      source: 'human',
      toolName: 'edit',
      alternatives: ['allow', 'deny'],
      evidence: ['Tool: edit'],
      confidence: 'high',
      provenanceTier: 'certification',
    });

    expect(r1.id).not.toBe(r2.id);
  });

  it('sets timestamp correctly', () => {
    const before = new Date().toISOString();
    const record = makeDecisionRecord({
      question: 'Allow?',
      chosenOption: 'yes',
      source: 'human',
      alternatives: [],
      evidence: [],
      confidence: 'medium',
      provenanceTier: 'internal',
    });
    const after = new Date().toISOString();

    // Timestamp should be between before and after
    expect(record.timestamp >= before).toBe(true);
    expect(record.timestamp <= after).toBe(true);
  });

  it('fills all required DecisionRecord fields', () => {
    const record = makeDecisionRecord({
      question: 'Should tool run?',
      chosenOption: 'allow',
      source: 'automated_rule',
      toolName: 'bash',
      toolArgs: { cmd: 'echo hello' },
      confidence: 'high',
      alternatives: ['allow', 'deny'],
      evidence: ['Tool: bash'],
      provenanceTier: 'certification',
    });

    expect(typeof record.id).toBe('string');
    expect(typeof record.timestamp).toBe('string');
    expect(record.question).toBe('Should tool run?');
    expect(record.chosenOption).toBe('allow');
    expect(record.source).toBe('automated_rule');
    expect(record.toolName).toBe('bash');
    expect(record.confidence).toBe('high');
    expect(record.alternatives).toEqual(['allow', 'deny']);
    expect(record.evidence).toEqual(['Tool: bash']);
    expect(record.provenanceTier).toBe('certification');
  });

  it('passes through all caller-provided fields verbatim', () => {
    const record = makeDecisionRecord({
      question: 'Allow?',
      chosenOption: 'yes',
      source: 'human',
      alternatives: ['yes', 'no'],
      evidence: ['Context: test'],
      confidence: 'low',
      provenanceTier: 'internal',
    });

    expect(record.alternatives).toEqual(['yes', 'no']);
    expect(record.evidence).toEqual(['Context: test']);
    expect(record.confidence).toBe('low');
    expect(record.provenanceTier).toBe('internal');
  });
});
