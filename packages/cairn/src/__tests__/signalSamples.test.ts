import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  insertSignalSample,
  insertSignalSamples,
  querySignalSamples,
  countSignalSamples,
  sweepSignalSamples,
  enforceSignalSampleCap,
  clearSignalSamples,
} from '../db/signalSamples.js';
import type { SignalSampleInsert } from '../db/signalSamples.js';

function sample(overrides?: Partial<SignalSampleInsert>): SignalSampleInsert {
  return {
    kind: 'drift',
    sessionId: 'session-001',
    skillId: 'skill-a',
    value: 0.5,
    metadata: { note: 'baseline' },
    collectedAt: '2026-05-01T00:00:00.000Z',
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

describe('signal samples persistence', () => {
  it('inserts and round-trips a sample', () => {
    const id = insertSignalSample(sample({ value: 0.42, metadata: { foo: 'bar' } }));
    expect(id).toBeGreaterThan(0);

    const rows = querySignalSamples();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(id);
    expect(rows[0].kind).toBe('drift');
    expect(rows[0].sessionId).toBe('session-001');
    expect(rows[0].skillId).toBe('skill-a');
    expect(rows[0].value).toBeCloseTo(0.42);
    expect(rows[0].metadata).toEqual({ foo: 'bar' });
    expect(rows[0].collectedAt).toBe('2026-05-01T00:00:00.000Z');
    expect(rows[0].createdAt).toBeDefined();
  });

  it('handles null skill_id', () => {
    insertSignalSample(sample({ skillId: null }));
    const rows = querySignalSamples({ skillId: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].skillId).toBeNull();
  });

  it('inserts batches in a single transaction', () => {
    const n = insertSignalSamples([
      sample({ value: 1 }),
      sample({ value: 2 }),
      sample({ value: 3 }),
    ]);
    expect(n).toBe(3);
    expect(countSignalSamples()).toBe(3);
  });

  it('returns 0 for an empty batch', () => {
    expect(insertSignalSamples([])).toBe(0);
    expect(countSignalSamples()).toBe(0);
  });

  it('queries by kind', () => {
    insertSignalSample(sample({ kind: 'drift', value: 1 }));
    insertSignalSample(sample({ kind: 'token', value: 2 }));
    insertSignalSample(sample({ kind: 'outcome', value: 3 }));

    expect(querySignalSamples({ kind: 'drift' })).toHaveLength(1);
    expect(querySignalSamples({ kind: 'token' })).toHaveLength(1);
    expect(querySignalSamples({ kind: 'outcome' })).toHaveLength(1);
  });

  it('queries by skill', () => {
    insertSignalSample(sample({ skillId: 'skill-a' }));
    insertSignalSample(sample({ skillId: 'skill-b' }));
    insertSignalSample(sample({ skillId: 'skill-b' }));

    expect(querySignalSamples({ skillId: 'skill-a' })).toHaveLength(1);
    expect(querySignalSamples({ skillId: 'skill-b' })).toHaveLength(2);
  });

  it('queries by session', () => {
    insertSignalSample(sample({ sessionId: 's1' }));
    insertSignalSample(sample({ sessionId: 's2' }));
    expect(querySignalSamples({ sessionId: 's2' })).toHaveLength(1);
  });

  it('queries by time range', () => {
    insertSignalSample(sample({ collectedAt: '2026-01-01T00:00:00.000Z', value: 1 }));
    insertSignalSample(sample({ collectedAt: '2026-02-01T00:00:00.000Z', value: 2 }));
    insertSignalSample(sample({ collectedAt: '2026-03-01T00:00:00.000Z', value: 3 }));

    const mid = querySignalSamples({
      since: '2026-01-15T00:00:00.000Z',
      until: '2026-02-15T00:00:00.000Z',
    });
    expect(mid).toHaveLength(1);
    expect(mid[0].value).toBe(2);
  });

  it('orders results most recent first', () => {
    insertSignalSample(sample({ collectedAt: '2026-01-01T00:00:00.000Z', value: 1 }));
    insertSignalSample(sample({ collectedAt: '2026-03-01T00:00:00.000Z', value: 3 }));
    insertSignalSample(sample({ collectedAt: '2026-02-01T00:00:00.000Z', value: 2 }));

    const rows = querySignalSamples();
    expect(rows.map((r) => r.value)).toEqual([3, 2, 1]);
  });

  it('respects limit', () => {
    insertSignalSamples([sample({ value: 1 }), sample({ value: 2 }), sample({ value: 3 })]);
    expect(querySignalSamples({ limit: 2 })).toHaveLength(2);
  });

  it('TTL sweep deletes only rows strictly older than the cutoff', () => {
    insertSignalSample(sample({ collectedAt: '2026-01-01T00:00:00.000Z', value: 1 }));
    insertSignalSample(sample({ collectedAt: '2026-02-01T00:00:00.000Z', value: 2 }));
    insertSignalSample(sample({ collectedAt: '2026-03-01T00:00:00.000Z', value: 3 }));

    const removed = sweepSignalSamples('2026-02-01T00:00:00.000Z');
    expect(removed).toBe(1);
    const remaining = querySignalSamples();
    expect(remaining.map((r) => r.value).sort()).toEqual([2, 3]);
  });

  it('row cap deletes oldest rows beyond the cap', () => {
    for (let i = 0; i < 5; i++) {
      insertSignalSample(
        sample({ value: i, collectedAt: `2026-01-0${i + 1}T00:00:00.000Z` }),
      );
    }
    const removed = enforceSignalSampleCap(3);
    expect(removed).toBe(2);
    expect(countSignalSamples()).toBe(3);

    const rows = querySignalSamples();
    // Oldest two (values 0, 1) should be gone
    expect(rows.map((r) => r.value).sort()).toEqual([2, 3, 4]);
  });

  it('row cap is a no-op when count is at or below cap', () => {
    insertSignalSamples([sample({ value: 1 }), sample({ value: 2 })]);
    expect(enforceSignalSampleCap(5)).toBe(0);
    expect(enforceSignalSampleCap(2)).toBe(0);
    expect(countSignalSamples()).toBe(2);
  });

  it('cap of 0 deletes everything', () => {
    insertSignalSamples([sample({ value: 1 }), sample({ value: 2 })]);
    expect(enforceSignalSampleCap(0)).toBe(2);
    expect(countSignalSamples()).toBe(0);
  });

  it('rejects negative cap', () => {
    expect(() => enforceSignalSampleCap(-1)).toThrow();
  });

  it('clear removes all samples', () => {
    insertSignalSamples([sample({ value: 1 }), sample({ value: 2 })]);
    expect(clearSignalSamples()).toBe(2);
    expect(countSignalSamples()).toBe(0);
  });
});
