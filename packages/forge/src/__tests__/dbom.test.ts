/**
 * DBOM (Decision Bill of Materials) tests — Verifying provenance artifact
 * generation, hash chains, decision classification, and statistics.
 *
 * Tests run against the production dbom module at
 * packages/forge/src/dbom/index.ts. The spike reference for behavior
 * is packages/cairn/src/spike/dbom-generator.ts.
 *
 * @module
 */

import { describe, it, expect } from 'vitest';
import {
  generateDBOM,
  classifyDecisionSource,
  summarizeDecision,
  computeDecisionHash,
  computeStats,
} from '../dbom/index.js';
import type {
  CairnBridgeEvent,
  DBOMArtifact,
  DBOMDecisionEntry,
  DBOMStats,
  DecisionSource,
} from '@akubly/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a CairnBridgeEvent for testing. The DBOM generator operates on
 * bridge events (not raw SDK events), using session_id/event_type/payload/
 * created_at/provenanceTier fields.
 *
 * NOTE: The spike's generateDBOM uses `CairnEvent` with snake_case fields
 * (session_id, event_type, created_at). The production module should accept
 * either the bridge format or adapt — tests use the format the production
 * module exports.
 */
function makeCertEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  overrides: Partial<CairnBridgeEvent> = {},
): CairnBridgeEvent {
  return {
    sessionId: 'sess-dbom-001',
    eventType,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    provenanceTier: 'certification',
    ...overrides,
  };
}

function makeInternalEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
): CairnBridgeEvent {
  return makeCertEvent(eventType, payload, { provenanceTier: 'internal' });
}

// ---------------------------------------------------------------------------
// generateDBOM
// ---------------------------------------------------------------------------

describe('generateDBOM', () => {
  it('filters to certification-tier events only', () => {
    const events: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeInternalEvent('tool_use', { toolName: 'edit' }),
      makeCertEvent('decision_point', { source: 'human', question: 'Proceed?' }),
      makeInternalEvent('assistant_response', {}),
    ];

    const dbom = generateDBOM('sess-dbom-001', events);

    // Only the 2 certification events should appear
    expect(dbom.decisions).toHaveLength(2);
    expect(dbom.decisions[0].eventType).toBe('permission_completed');
    expect(dbom.decisions[1].eventType).toBe('decision_point');
  });

  it('produces valid DBOMArtifact with all required fields', () => {
    const events: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
    ];

    const dbom = generateDBOM('sess-dbom-001', events);

    expect(dbom.version).toBe('0.1.0');
    expect(dbom.sessionId).toBe('sess-dbom-001');
    expect(typeof dbom.generatedAt).toBe('string');
    expect(typeof dbom.rootHash).toBe('string');
    expect(dbom.rootHash.length).toBe(64); // SHA-256 hex
    expect(dbom.stats).toBeDefined();
    expect(Array.isArray(dbom.decisions)).toBe(true);
  });

  it('empty events → empty DBOM (zero decisions, valid structure)', () => {
    const dbom = generateDBOM('sess-empty', []);

    expect(dbom.decisions).toHaveLength(0);
    expect(dbom.stats.totalDecisions).toBe(0);
    expect(dbom.stats.humanGatedDecisions).toBe(0);
    expect(dbom.stats.machineDecisions).toBe(0);
    expect(dbom.stats.aiRecommendedDecisions).toBe(0);
    expect(dbom.version).toBe('0.1.0');
    expect(typeof dbom.rootHash).toBe('string');
  });

  it('hash chain: each decision hash includes parent hash', () => {
    const events: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'OK?' }),
      makeCertEvent('subagent_start', { agentName: 'reviewer' }),
    ];

    const dbom = generateDBOM('sess-chain', events);

    // First decision has no parent
    expect(dbom.decisions[0].parentHash).toBeNull();

    // Subsequent decisions chain to the previous
    expect(dbom.decisions[1].parentHash).toBe(dbom.decisions[0].hash);
    expect(dbom.decisions[2].parentHash).toBe(dbom.decisions[1].hash);
  });

  it('root hash changes if any decision changes (tamper detection)', () => {
    const events1: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'OK?' }),
    ];

    const events2: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'Different?' }),
    ];

    const dbom1 = generateDBOM('sess-1', events1);
    const dbom2 = generateDBOM('sess-1', events2);

    expect(dbom1.rootHash).not.toBe(dbom2.rootHash);
  });

  it('only internal-tier events → empty decisions', () => {
    const events: CairnBridgeEvent[] = [
      makeInternalEvent('tool_use', { toolName: 'edit' }),
      makeInternalEvent('assistant_response', {}),
      makeInternalEvent('model_switch', {}),
    ];

    const dbom = generateDBOM('sess-internal', events);

    expect(dbom.decisions).toHaveLength(0);
    expect(dbom.stats.totalDecisions).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// classifyDecisionSource
// ---------------------------------------------------------------------------

describe('classifyDecisionSource', () => {
  it('permission_completed + approved → human', () => {
    const source = classifyDecisionSource('permission_completed', {
      result: { kind: 'approved' },
    });
    expect(source).toBe('human');
  });

  it('permission_completed + denied-interactively-by-user → human', () => {
    const source = classifyDecisionSource('permission_completed', {
      result: { kind: 'denied-interactively-by-user' },
    });
    expect(source).toBe('human');
  });

  it('permission_completed + denied-by-rules → automated_rule', () => {
    const source = classifyDecisionSource('permission_completed', {
      result: { kind: 'denied-by-rules' },
    });
    expect(source).toBe('automated_rule');
  });

  it('permission_completed + denied-by-content-exclusion-policy → automated_rule', () => {
    const source = classifyDecisionSource('permission_completed', {
      result: { kind: 'denied-by-content-exclusion-policy' },
    });
    expect(source).toBe('automated_rule');
  });

  it('decision_point + source: human → human', () => {
    const source = classifyDecisionSource('decision_point', {
      source: 'human',
    });
    expect(source).toBe('human');
  });

  it('decision_point + source: ai_recommendation → ai_recommendation', () => {
    const source = classifyDecisionSource('decision_point', {
      source: 'ai_recommendation',
    });
    expect(source).toBe('ai_recommendation');
  });

  it('decision_point + source: automated_rule → automated_rule', () => {
    const source = classifyDecisionSource('decision_point', {
      source: 'automated_rule',
    });
    expect(source).toBe('automated_rule');
  });

  it('decision_point + unknown source → automated_rule', () => {
    const source = classifyDecisionSource('decision_point', {
      source: 'unknown_thing',
    });
    expect(source).toBe('automated_rule');
  });

  it('subagent_start → automated_rule', () => {
    const source = classifyDecisionSource('subagent_start', {
      agentName: 'reviewer',
    });
    expect(source).toBe('automated_rule');
  });

  it('subagent_complete → automated_rule', () => {
    const source = classifyDecisionSource('subagent_complete', {
      agentName: 'reviewer',
    });
    expect(source).toBe('automated_rule');
  });

  it('subagent_failed → automated_rule', () => {
    const source = classifyDecisionSource('subagent_failed', {
      agentName: 'reviewer',
    });
    expect(source).toBe('automated_rule');
  });

  it('plan_changed → automated_rule', () => {
    expect(classifyDecisionSource('plan_changed', {})).toBe('automated_rule');
  });

  it('skill_invoked → automated_rule', () => {
    expect(classifyDecisionSource('skill_invoked', {})).toBe('automated_rule');
  });

  it('error → automated_rule', () => {
    expect(classifyDecisionSource('error', {})).toBe('automated_rule');
  });

  it('snapshot_rewind → automated_rule', () => {
    expect(classifyDecisionSource('snapshot_rewind', {})).toBe('automated_rule');
  });

  it('unknown event types → automated_rule (conservative default)', () => {
    expect(classifyDecisionSource('totally_new_event', {})).toBe('automated_rule');
  });
});

// ---------------------------------------------------------------------------
// summarizeDecision
// ---------------------------------------------------------------------------

describe('summarizeDecision', () => {
  it('permission_requested → readable summary', () => {
    const summary = summarizeDecision('permission_requested', {
      kind: 'shell',
      toolName: 'bash',
    });
    expect(summary).toContain('Permission requested');
    expect(summary).toContain('shell');
  });

  it('permission_completed → readable summary', () => {
    const summary = summarizeDecision('permission_completed', {
      result: { kind: 'approved' },
    });
    expect(summary).toContain('Permission');
    expect(summary).toContain('approved');
  });

  it('decision_point → readable summary with question', () => {
    const summary = summarizeDecision('decision_point', {
      question: 'Should we refactor?',
      chosen: 'yes',
    });
    expect(summary).toContain('Should we refactor?');
    expect(summary).toContain('yes');
  });

  it('plan_changed → readable summary', () => {
    const summary = summarizeDecision('plan_changed', {});
    expect(summary).toContain('plan');
  });

  it('subagent_start with agentName → includes name', () => {
    const summary = summarizeDecision('subagent_start', {
      agentName: 'code-reviewer',
    });
    expect(summary).toContain('code-reviewer');
  });

  it('subagent_complete with agentName → includes name', () => {
    const summary = summarizeDecision('subagent_complete', {
      agentName: 'linter',
    });
    expect(summary).toContain('linter');
  });

  it('subagent_failed with agentName → includes name', () => {
    const summary = summarizeDecision('subagent_failed', {
      agentName: 'builder',
    });
    expect(summary).toContain('builder');
  });

  it('skill_invoked with skillName → includes name', () => {
    const summary = summarizeDecision('skill_invoked', {
      skillName: 'auto-fix',
    });
    expect(summary).toContain('auto-fix');
  });

  it('error with message → includes truncated message', () => {
    const summary = summarizeDecision('error', {
      message: 'Something went wrong in the module',
    });
    expect(summary).toContain('Something went wrong');
  });

  it('snapshot_rewind → readable summary', () => {
    const summary = summarizeDecision('snapshot_rewind', {});
    expect(summary.toLowerCase()).toContain('rewound');
  });

  it('unknown event type → fallback summary', () => {
    const summary = summarizeDecision('totally_new_event', {});
    expect(typeof summary).toBe('string');
    expect(summary.length).toBeGreaterThan(0);
  });

  it('missing payload fields handled gracefully', () => {
    // All these should produce a string without throwing
    expect(typeof summarizeDecision('permission_requested', {})).toBe('string');
    expect(typeof summarizeDecision('permission_completed', {})).toBe('string');
    expect(typeof summarizeDecision('decision_point', {})).toBe('string');
    expect(typeof summarizeDecision('subagent_start', {})).toBe('string');
    expect(typeof summarizeDecision('error', {})).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// computeDecisionHash
// ---------------------------------------------------------------------------

describe('computeDecisionHash', () => {
  it('same inputs → same hash (deterministic)', () => {
    const h1 = computeDecisionHash('permission_completed', '2026-01-01T00:00:00Z', { result: 'ok' }, null);
    const h2 = computeDecisionHash('permission_completed', '2026-01-01T00:00:00Z', { result: 'ok' }, null);
    expect(h1).toBe(h2);
  });

  it('different inputs → different hash', () => {
    const h1 = computeDecisionHash('permission_completed', '2026-01-01T00:00:00Z', { result: 'ok' }, null);
    const h2 = computeDecisionHash('decision_point', '2026-01-01T00:00:00Z', { result: 'ok' }, null);
    expect(h1).not.toBe(h2);
  });

  it('hash includes parent hash (chain integrity)', () => {
    const h1 = computeDecisionHash('event_a', '2026-01-01T00:00:00Z', {}, null);
    const h2_with_parent = computeDecisionHash('event_b', '2026-01-01T00:00:01Z', {}, h1);
    const h2_no_parent = computeDecisionHash('event_b', '2026-01-01T00:00:01Z', {}, null);

    // Same event with different parent hash → different output
    expect(h2_with_parent).not.toBe(h2_no_parent);
  });

  it('produces 64-character hex string (SHA-256)', () => {
    const hash = computeDecisionHash('test', '2026-01-01T00:00:00Z', {}, null);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different details → different hash', () => {
    const h1 = computeDecisionHash('event', '2026-01-01T00:00:00Z', { a: 1 }, null);
    const h2 = computeDecisionHash('event', '2026-01-01T00:00:00Z', { a: 2 }, null);
    expect(h1).not.toBe(h2);
  });

  it('different timestamps → different hash', () => {
    const h1 = computeDecisionHash('event', '2026-01-01T00:00:00Z', {}, null);
    const h2 = computeDecisionHash('event', '2026-01-02T00:00:00Z', {}, null);
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// computeStats
// ---------------------------------------------------------------------------

describe('computeStats', () => {
  function makeEntry(
    source: DecisionSource,
    eventType: string,
    parentHash: string | null = 'parent-abc',
  ): DBOMDecisionEntry {
    return {
      hash: `hash-${Math.random().toString(36).slice(2)}`,
      parentHash,
      eventType,
      timestamp: new Date().toISOString(),
      source,
      summary: 'test summary',
      details: {},
    };
  }

  it('counts human/machine/ai decisions correctly', () => {
    const decisions: DBOMDecisionEntry[] = [
      makeEntry('human', 'permission_completed'),
      makeEntry('human', 'permission_completed'),
      makeEntry('automated_rule', 'subagent_start'),
      makeEntry('ai_recommendation', 'decision_point'),
    ];

    const stats = computeStats(decisions);

    expect(stats.totalDecisions).toBe(4);
    expect(stats.humanGatedDecisions).toBe(2);
    expect(stats.machineDecisions).toBe(1);
    expect(stats.aiRecommendedDecisions).toBe(1);
  });

  it('tracks chain depth', () => {
    const decisions: DBOMDecisionEntry[] = [
      makeEntry('human', 'a', null),        // root, depth 1
      makeEntry('human', 'b', 'parent'),     // depth 2
      makeEntry('human', 'c', 'parent'),     // depth 3
    ];

    const stats = computeStats(decisions);

    expect(stats.chainDepth).toBeGreaterThanOrEqual(1);
  });

  it('tracks chain roots', () => {
    const decisions: DBOMDecisionEntry[] = [
      makeEntry('human', 'a', null),         // root 1
      makeEntry('human', 'b', 'parent'),     // chained
      makeEntry('human', 'c', null),         // root 2
    ];

    const stats = computeStats(decisions);

    expect(stats.chainRoots).toBe(2);
  });

  it('counts by event type', () => {
    const decisions: DBOMDecisionEntry[] = [
      makeEntry('human', 'permission_completed'),
      makeEntry('human', 'permission_completed'),
      makeEntry('automated_rule', 'subagent_start'),
      makeEntry('ai_recommendation', 'decision_point'),
    ];

    const stats = computeStats(decisions);

    expect(stats.decisionTypes['permission_completed']).toBe(2);
    expect(stats.decisionTypes['subagent_start']).toBe(1);
    expect(stats.decisionTypes['decision_point']).toBe(1);
  });

  it('empty decisions → zero stats', () => {
    const stats = computeStats([]);

    expect(stats.totalDecisions).toBe(0);
    expect(stats.humanGatedDecisions).toBe(0);
    expect(stats.machineDecisions).toBe(0);
    expect(stats.aiRecommendedDecisions).toBe(0);
    expect(stats.chainDepth).toBe(0);
    expect(stats.chainRoots).toBe(0);
    expect(Object.keys(stats.decisionTypes)).toHaveLength(0);
  });
});
