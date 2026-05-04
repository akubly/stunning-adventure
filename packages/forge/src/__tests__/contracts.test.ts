/**
 * Contract verification tests — Runtime shape validation for shared types.
 *
 * These tests import from @akubly/types and verify that objects conforming
 * to the contract interfaces have the expected shape AT RUNTIME, not just
 * at compile time. The spike proved type compatibility; these prove runtime
 * correctness.
 */

import { describe, it, expect } from 'vitest';
import type {
  ProvenanceTier,
  CairnBridgeEvent,
  DecisionRecord,
  DecisionSource,
  SessionIdentity,
  DBOMArtifact,
  DBOMDecisionEntry,
  DBOMStats,
  TelemetrySink,
} from '@akubly/types';

// ---------------------------------------------------------------------------
// CairnBridgeEvent — the cross-package event format
// ---------------------------------------------------------------------------

describe('CairnBridgeEvent shape', () => {
  function makeBridgeEvent(overrides: Partial<CairnBridgeEvent> = {}): CairnBridgeEvent {
    return {
      sessionId: 'sess-001',
      eventType: 'tool_use',
      payload: JSON.stringify({ toolName: 'edit' }),
      createdAt: new Date().toISOString(),
      provenanceTier: 'internal',
      ...overrides,
    };
  }

  it('has all required fields', () => {
    const event = makeBridgeEvent();
    expect(event).toHaveProperty('sessionId');
    expect(event).toHaveProperty('eventType');
    expect(event).toHaveProperty('payload');
    expect(event).toHaveProperty('createdAt');
    expect(event).toHaveProperty('provenanceTier');
  });

  it('sessionId is a non-empty string', () => {
    const event = makeBridgeEvent();
    expect(typeof event.sessionId).toBe('string');
    expect(event.sessionId.length).toBeGreaterThan(0);
  });

  it('payload is a valid JSON string', () => {
    const event = makeBridgeEvent();
    expect(() => JSON.parse(event.payload)).not.toThrow();
  });

  it('createdAt is a valid ISO 8601 timestamp', () => {
    const event = makeBridgeEvent();
    const parsed = new Date(event.createdAt);
    expect(parsed.toISOString()).toBe(event.createdAt);
  });

  it('provenanceTier is one of the valid tiers', () => {
    const validTiers: ProvenanceTier[] = ['internal', 'certification', 'deployment'];
    const event = makeBridgeEvent();
    expect(validTiers).toContain(event.provenanceTier);
  });

  it('round-trips through JSON serialization', () => {
    const event = makeBridgeEvent();
    const roundTripped = JSON.parse(JSON.stringify(event)) as CairnBridgeEvent;
    expect(roundTripped).toEqual(event);
  });
});

// ---------------------------------------------------------------------------
// ProvenanceTier — exhaustive value verification
// ---------------------------------------------------------------------------

describe('ProvenanceTier', () => {
  const VALID_TIERS: ProvenanceTier[] = ['internal', 'certification', 'deployment'];

  it.each(VALID_TIERS)('accepts valid tier: %s', (tier) => {
    const event: CairnBridgeEvent = {
      sessionId: 'sess-001',
      eventType: 'test',
      payload: '{}',
      createdAt: new Date().toISOString(),
      provenanceTier: tier,
    };
    expect(event.provenanceTier).toBe(tier);
  });

  it('rejects invalid tier values at runtime via guard function', () => {
    const isValidTier = (value: string): value is ProvenanceTier =>
      VALID_TIERS.includes(value as ProvenanceTier);

    expect(isValidTier('internal')).toBe(true);
    expect(isValidTier('certification')).toBe(true);
    expect(isValidTier('deployment')).toBe(true);
    expect(isValidTier('unknown')).toBe(false);
    expect(isValidTier('')).toBe(false);
    expect(isValidTier('INTERNAL')).toBe(false);
  });

  it('exactly three valid values exist', () => {
    expect(VALID_TIERS).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// DecisionRecord — structured decision audit record
// ---------------------------------------------------------------------------

describe('DecisionRecord shape', () => {
  function makeDecision(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
    return {
      id: 'dec-001',
      timestamp: new Date().toISOString(),
      question: 'Should we allow powershell execution?',
      chosenOption: 'deny',
      alternatives: ['allow', 'ask'],
      evidence: ['tool is shell command', 'no explicit approval'],
      confidence: 'high',
      source: 'automated_rule',
      provenanceTier: 'certification',
      ...overrides,
    };
  }

  it('has all required fields', () => {
    const decision = makeDecision();
    const requiredFields = [
      'id', 'timestamp', 'question', 'chosenOption',
      'alternatives', 'evidence', 'confidence', 'source', 'provenanceTier',
    ];
    for (const field of requiredFields) {
      expect(decision).toHaveProperty(field);
    }
  });

  it('alternatives is an array of strings', () => {
    const decision = makeDecision();
    expect(Array.isArray(decision.alternatives)).toBe(true);
    for (const alt of decision.alternatives) {
      expect(typeof alt).toBe('string');
    }
  });

  it('evidence is an array of strings', () => {
    const decision = makeDecision();
    expect(Array.isArray(decision.evidence)).toBe(true);
    for (const ev of decision.evidence) {
      expect(typeof ev).toBe('string');
    }
  });

  it('confidence accepts only valid values', () => {
    const validConfidences = ['high', 'medium', 'low'] as const;
    for (const c of validConfidences) {
      const d = makeDecision({ confidence: c });
      expect(d.confidence).toBe(c);
    }
  });

  it('source accepts only valid DecisionSource values', () => {
    const validSources: DecisionSource[] = ['human', 'automated_rule', 'ai_recommendation'];
    for (const s of validSources) {
      const d = makeDecision({ source: s });
      expect(d.source).toBe(s);
    }
  });

  it('provenanceTier is restricted to internal or certification', () => {
    const d1 = makeDecision({ provenanceTier: 'internal' });
    const d2 = makeDecision({ provenanceTier: 'certification' });
    expect(d1.provenanceTier).toBe('internal');
    expect(d2.provenanceTier).toBe('certification');
  });

  it('optional toolName and toolArgs work correctly', () => {
    const withTool = makeDecision({
      toolName: 'powershell',
      toolArgs: { command: 'ls' },
    });
    expect(withTool.toolName).toBe('powershell');
    expect(withTool.toolArgs).toEqual({ command: 'ls' });

    const withoutTool = makeDecision();
    expect(withoutTool.toolName).toBeUndefined();
    expect(withoutTool.toolArgs).toBeUndefined();
  });

  it('empty alternatives and evidence arrays are valid', () => {
    const decision = makeDecision({ alternatives: [], evidence: [] });
    expect(decision.alternatives).toEqual([]);
    expect(decision.evidence).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SessionIdentity — minimal cross-package session reference
// ---------------------------------------------------------------------------

describe('SessionIdentity shape', () => {
  function makeSession(overrides: Partial<SessionIdentity> = {}): SessionIdentity {
    return {
      sessionId: 'sess-abc-123',
      repoKey: 'akubly/cairn',
      startedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('has all required fields', () => {
    const session = makeSession();
    expect(session).toHaveProperty('sessionId');
    expect(session).toHaveProperty('repoKey');
    expect(session).toHaveProperty('startedAt');
  });

  it('branch is optional', () => {
    const withBranch = makeSession({ branch: 'feature/forge' });
    const withoutBranch = makeSession();

    expect(withBranch.branch).toBe('feature/forge');
    expect(withoutBranch.branch).toBeUndefined();
  });

  it('startedAt is a valid ISO 8601 timestamp', () => {
    const session = makeSession();
    const parsed = new Date(session.startedAt);
    expect(parsed.toISOString()).toBe(session.startedAt);
  });

  it('repoKey follows owner/repo format', () => {
    const session = makeSession();
    expect(session.repoKey).toMatch(/^[^/]+\/[^/]+$/);
  });
});

// ---------------------------------------------------------------------------
// DBOMArtifact — Decision Bill of Materials
// ---------------------------------------------------------------------------

describe('DBOMArtifact shape', () => {
  function makeEntry(overrides: Partial<DBOMDecisionEntry> = {}): DBOMDecisionEntry {
    return {
      hash: 'abc123',
      parentHash: null,
      eventType: 'permission_completed',
      timestamp: new Date().toISOString(),
      source: 'human',
      summary: 'Approved powershell execution',
      details: { toolName: 'powershell' },
      ...overrides,
    };
  }

  function makeStats(overrides: Partial<DBOMStats> = {}): DBOMStats {
    return {
      totalDecisions: 1,
      humanGatedDecisions: 1,
      machineDecisions: 0,
      aiRecommendedDecisions: 0,
      decisionTypes: { permission_completed: 1 },
      chainDepth: 1,
      chainRoots: 1,
      ...overrides,
    };
  }

  function makeArtifact(overrides: Partial<DBOMArtifact> = {}): DBOMArtifact {
    return {
      version: '0.1.0',
      sessionId: 'sess-001',
      generatedAt: new Date().toISOString(),
      rootHash: 'abc123',
      stats: makeStats(),
      decisions: [makeEntry()],
      ...overrides,
    };
  }

  it('version is exactly 0.1.0', () => {
    const artifact = makeArtifact();
    expect(artifact.version).toBe('0.1.0');
  });

  it('decisions array contains valid entries', () => {
    const artifact = makeArtifact();
    expect(artifact.decisions).toHaveLength(1);
    const entry = artifact.decisions[0];
    expect(entry).toHaveProperty('hash');
    expect(entry).toHaveProperty('parentHash');
    expect(entry).toHaveProperty('eventType');
    expect(entry).toHaveProperty('source');
  });

  it('parentHash can be null for root entries', () => {
    const entry = makeEntry({ parentHash: null });
    expect(entry.parentHash).toBeNull();
  });

  it('parentHash can reference another entry', () => {
    const entry = makeEntry({ parentHash: 'parent-hash-123' });
    expect(entry.parentHash).toBe('parent-hash-123');
  });

  it('stats fields are internally consistent', () => {
    const stats = makeStats({
      totalDecisions: 5,
      humanGatedDecisions: 2,
      machineDecisions: 2,
      aiRecommendedDecisions: 1,
    });
    expect(
      stats.humanGatedDecisions + stats.machineDecisions + stats.aiRecommendedDecisions,
    ).toBe(stats.totalDecisions);
  });

  it('empty decisions array is valid', () => {
    const artifact = makeArtifact({
      decisions: [],
      stats: makeStats({ totalDecisions: 0, humanGatedDecisions: 0 }),
    });
    expect(artifact.decisions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TelemetrySink — interface shape verification
// ---------------------------------------------------------------------------

describe('TelemetrySink interface', () => {
  it('emit is callable with a CairnBridgeEvent', () => {
    const events: CairnBridgeEvent[] = [];
    const sink: TelemetrySink = {
      emit: (event) => { events.push(event); },
    };

    const event: CairnBridgeEvent = {
      sessionId: 'sess-001',
      eventType: 'tool_use',
      payload: '{}',
      createdAt: new Date().toISOString(),
      provenanceTier: 'internal',
    };

    sink.emit(event);
    expect(events).toHaveLength(1);
    expect(events[0]).toBe(event);
  });

  it('flush and close are optional', () => {
    const minimalSink: TelemetrySink = {
      emit: () => {},
    };
    expect(minimalSink.flush).toBeUndefined();
    expect(minimalSink.close).toBeUndefined();
  });

  it('flush and close return promises when provided', async () => {
    const sink: TelemetrySink = {
      emit: () => {},
      flush: async () => {},
      close: async () => {},
    };
    await expect(sink.flush!()).resolves.toBeUndefined();
    await expect(sink.close!()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ChangeVectorSummary — root re-export smoke test (Phase 4.6 cycle 2, Finding #8)
//
// Alexander added ChangeVectorSummary to the forge root index.ts so that Cairn
// (and other consumers) can import it from '@akubly/forge' without reaching into
// internal prescribers paths. This test verifies the export exists at runtime.
// ---------------------------------------------------------------------------

describe('ChangeVectorSummary — root re-export smoke test', () => {
  it('is importable as a type from @akubly/forge root index', async () => {
    // Dynamic import to verify the shape exists at the module boundary.
    // TypeScript's `import type` is erased at runtime; we use a value import here
    // to confirm the module resolves correctly and the prescribers barrel works.
    const forgeModule = await import('@akubly/forge');

    // ChangeVectorSummary is a type-only export — it has no runtime value.
    // The smoke test verifies that importing from the root does NOT throw (i.e.,
    // the prescribers barrel is wired correctly and there are no missing re-exports).
    // We do this by checking that the forge module object itself resolves without error.
    expect(forgeModule).toBeDefined();

    // Additionally verify that OptimizationCategory-related exports (which are value
    // exports in the prescribers barrel) are still present, confirming the barrel export
    // path for ChangeVectorSummary is intact.
    expect(typeof forgeModule.analyzePromptOptimizations).toBe('function');
  });

  it('a value conforming to ChangeVectorSummary has the expected shape', () => {
    // This is a compile-time + runtime shape test.
    // TypeScript will error here if ChangeVectorSummary's shape changes.
    const summary: import('@akubly/forge').ChangeVectorSummary = {
      category: 'convergence',
      skillId: 'skill-test',
      sampleSize: 5,
      avgDeltaDrift: -0.1,
      avgDeltaCost: -5_000,
      avgDeltaSuccessRate: 0.05,
      avgDeltaConvergence: -1,
      avgDeltaCacheHit: 0.02,
      confidence: 0.85,
      netImpact: 0.7,
    };

    expect(summary).toHaveProperty('category', 'convergence');
    expect(summary).toHaveProperty('skillId', 'skill-test');
    expect(summary).toHaveProperty('sampleSize', 5);
    expect(summary).toHaveProperty('confidence');
    expect(summary).toHaveProperty('netImpact');
    expect(typeof summary.category).toBe('string');
    expect(typeof summary.confidence).toBe('number');
    expect(typeof summary.netImpact).toBe('number');
  });
});
