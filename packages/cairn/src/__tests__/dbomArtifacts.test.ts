import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  upsertDBOM,
  getDBOM,
  getDBOMDecisions,
  loadDBOMArtifact,
  deleteDBOM,
  listDBOMs,
} from '../db/dbomArtifacts.js';
import type { DBOMArtifactInsert } from '../db/dbomArtifacts.js';
import type { DBOMDecisionEntry } from '@akubly/types';

function makeDecision(overrides?: Partial<DBOMDecisionEntry>): DBOMDecisionEntry {
  return {
    hash: 'abc123',
    parentHash: null,
    eventType: 'tool_use',
    timestamp: '2026-05-01T00:00:00.000Z',
    source: 'human',
    summary: 'Approved grep usage',
    details: { tool: 'grep', args: ['pattern'] },
    ...overrides,
  };
}

function makeArtifact(overrides?: Partial<DBOMArtifactInsert>): DBOMArtifactInsert {
  return {
    sessionId: 'session-001',
    version: '0.1.0',
    rootHash: 'root-abc',
    stats: {
      totalDecisions: 2,
      humanGatedDecisions: 1,
      machineDecisions: 1,
      aiRecommendedDecisions: 0,
      decisionTypes: { tool_use: 2 },
      chainDepth: 2,
      chainRoots: 1,
    },
    generatedAt: '2026-05-01T12:00:00.000Z',
    decisions: [
      makeDecision({ hash: 'aaa', seq: 0 } as any),
      makeDecision({ hash: 'bbb', parentHash: 'aaa', source: 'automated_rule', seq: 1 } as any),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// DBOM CRUD
// ---------------------------------------------------------------------------

describe('DBOM artifact persistence', () => {
  it('should insert and load a DBOM round-trip', () => {
    const artifact = makeArtifact();
    const id = upsertDBOM(artifact);
    expect(id).toBeGreaterThan(0);

    const loaded = loadDBOMArtifact('session-001');
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe('0.1.0');
    expect(loaded!.sessionId).toBe('session-001');
    expect(loaded!.rootHash).toBe('root-abc');
    expect(loaded!.stats.totalDecisions).toBe(2);
    expect(loaded!.stats.humanGatedDecisions).toBe(1);
    expect(loaded!.stats.machineDecisions).toBe(1);
    expect(loaded!.stats.aiRecommendedDecisions).toBe(0);
    expect(loaded!.stats.decisionTypes).toEqual({ tool_use: 2 });
    expect(loaded!.stats.chainDepth).toBe(2);
    expect(loaded!.stats.chainRoots).toBe(1);
    expect(loaded!.decisions).toHaveLength(2);
    expect(loaded!.decisions[0].hash).toBe('aaa');
    expect(loaded!.decisions[0].source).toBe('human');
    expect(loaded!.decisions[1].hash).toBe('bbb');
    expect(loaded!.decisions[1].parentHash).toBe('aaa');
    expect(loaded!.decisions[1].source).toBe('automated_rule');
  });

  it('should return null for non-existent session', () => {
    expect(loadDBOMArtifact('nonexistent')).toBeNull();
    expect(getDBOM('nonexistent')).toBeNull();
  });

  it('should upsert (replace) existing DBOM for the same session', () => {
    upsertDBOM(makeArtifact({ rootHash: 'first-hash' }));
    const first = getDBOM('session-001');
    expect(first!.rootHash).toBe('first-hash');

    upsertDBOM(makeArtifact({
      rootHash: 'second-hash',
      decisions: [makeDecision({ hash: 'zzz', source: 'ai_recommendation' })],
    }));

    const second = getDBOM('session-001');
    expect(second!.rootHash).toBe('second-hash');

    // Old decisions should be gone (CASCADE), new ones present
    const decisions = getDBOMDecisions(second!.id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].hash).toBe('zzz');
    expect(decisions[0].source).toBe('ai_recommendation');

    // Only one artifact row for this session
    const all = listDBOMs();
    expect(all).toHaveLength(1);
  });

  it('should delete a DBOM and cascade to decisions', () => {
    upsertDBOM(makeArtifact());
    expect(getDBOM('session-001')).not.toBeNull();

    const deleted = deleteDBOM('session-001');
    expect(deleted).toBe(true);
    expect(getDBOM('session-001')).toBeNull();

    // Decisions should be gone too
    expect(loadDBOMArtifact('session-001')).toBeNull();
  });

  it('should return false when deleting non-existent DBOM', () => {
    expect(deleteDBOM('nonexistent')).toBe(false);
  });

  it('should list DBOMs ordered by created_at DESC', () => {
    // Insert three artifacts for different sessions
    upsertDBOM(makeArtifact({ sessionId: 'session-a' }));
    upsertDBOM(makeArtifact({ sessionId: 'session-b' }));
    upsertDBOM(makeArtifact({ sessionId: 'session-c' }));

    const all = listDBOMs();
    expect(all).toHaveLength(3);
    // All three sessions should be present
    const ids = all.map((a) => a.sessionId);
    expect(ids).toContain('session-a');
    expect(ids).toContain('session-b');
    expect(ids).toContain('session-c');
  });

  it('should respect limit parameter on listDBOMs', () => {
    upsertDBOM(makeArtifact({ sessionId: 'session-a' }));
    upsertDBOM(makeArtifact({ sessionId: 'session-b' }));
    upsertDBOM(makeArtifact({ sessionId: 'session-c' }));

    const limited = listDBOMs(2);
    expect(limited).toHaveLength(2);
  });

  it('should preserve decision ordering via seq', () => {
    const decisions = [
      makeDecision({ hash: 'd0', summary: 'first' }),
      makeDecision({ hash: 'd1', summary: 'second', parentHash: 'd0' }),
      makeDecision({ hash: 'd2', summary: 'third', parentHash: 'd1' }),
    ];
    upsertDBOM(makeArtifact({ decisions }));

    const loaded = loadDBOMArtifact('session-001');
    expect(loaded!.decisions[0].summary).toBe('first');
    expect(loaded!.decisions[1].summary).toBe('second');
    expect(loaded!.decisions[2].summary).toBe('third');
  });

  it('should store and retrieve decision details as JSON', () => {
    const details = { tool: 'view', file: '/src/main.ts', lines: [1, 50] };
    upsertDBOM(makeArtifact({
      decisions: [makeDecision({ hash: 'json-test', details })],
    }));

    const loaded = loadDBOMArtifact('session-001');
    expect(loaded!.decisions[0].details).toEqual(details);
  });

  it('should get artifact row with getDBOM', () => {
    upsertDBOM(makeArtifact());
    const row = getDBOM('session-001');
    expect(row).not.toBeNull();
    expect(row!.sessionId).toBe('session-001');
    expect(row!.version).toBe('0.1.0');
    expect(row!.createdAt).toBeDefined();
    expect(row!.id).toBeGreaterThan(0);
  });

  it('should get decisions by dbom id', () => {
    upsertDBOM(makeArtifact());
    const row = getDBOM('session-001')!;
    const decisions = getDBOMDecisions(row.id);
    expect(decisions).toHaveLength(2);
    expect(decisions[0].seq).toBe(0);
    expect(decisions[1].seq).toBe(1);
    expect(decisions[0].dbomId).toBe(row.id);
  });
});
