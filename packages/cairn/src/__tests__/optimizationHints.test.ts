import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  insertOptimizationHint,
  getOptimizationHint,
  queryOptimizationHints,
  listOptimizationHints,
  updateOptimizationHintStatus,
  deleteOptimizationHint,
} from '../db/optimizationHints.js';
import type { OptimizationHintInsert } from '../db/optimizationHints.js';

let counter = 0;
function hint(overrides?: Partial<OptimizationHintInsert>): OptimizationHintInsert {
  counter += 1;
  return {
    id: `hint-${counter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-a',
    category: 'verbosity',
    description: 'Prompt is too long',
    recommendation: 'Trim preamble',
    impactScore: 0.5,
    confidence: 0.8,
    evidence: { tokens_saved: 320 },
    metricSnapshot: { drift_mean: 0.2 },
    generatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  counter = 0;
  getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('optimization hints persistence', () => {
  it('inserts and round-trips a hint', () => {
    const id = insertOptimizationHint(
      hint({
        id: 'h-1',
        evidence: { detail: 'x' },
        metricSnapshot: { snap: 1 },
      }),
    );
    expect(id).toBe('h-1');

    const loaded = getOptimizationHint('h-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('h-1');
    expect(loaded!.source).toBe('prompt-optimizer');
    expect(loaded!.skillId).toBe('skill-a');
    expect(loaded!.category).toBe('verbosity');
    expect(loaded!.status).toBe('pending');
    expect(loaded!.evidence).toEqual({ detail: 'x' });
    expect(loaded!.metricSnapshot).toEqual({ snap: 1 });
    expect(loaded!.appliedAt).toBeNull();
    expect(loaded!.parentPrescriptionId).toBeNull();
    expect(loaded!.createdAt).toBeDefined();
  });

  it('returns null for unknown hint id', () => {
    expect(getOptimizationHint('nope')).toBeNull();
  });

  it('queries by skill', () => {
    insertOptimizationHint(hint({ skillId: 'skill-a' }));
    insertOptimizationHint(hint({ skillId: 'skill-b' }));
    insertOptimizationHint(hint({ skillId: 'skill-b' }));

    expect(queryOptimizationHints({ skillId: 'skill-a' })).toHaveLength(1);
    expect(queryOptimizationHints({ skillId: 'skill-b' })).toHaveLength(2);
  });

  it('queries by status (single and array)', () => {
    insertOptimizationHint(hint({ status: 'pending' }));
    insertOptimizationHint(hint({ status: 'accepted' }));
    insertOptimizationHint(hint({ status: 'applied' }));

    expect(queryOptimizationHints({ status: 'pending' })).toHaveLength(1);
    expect(queryOptimizationHints({ status: ['pending', 'accepted'] })).toHaveLength(2);
    expect(queryOptimizationHints({ status: [] })).toEqual([]);
  });

  it('queries by source', () => {
    insertOptimizationHint(hint({ source: 'prompt-optimizer' }));
    insertOptimizationHint(hint({ source: 'token-optimizer' }));
    expect(queryOptimizationHints({ source: 'token-optimizer' })).toHaveLength(1);
  });

  it('queries by parent prescription id', () => {
    insertOptimizationHint(hint({ parentPrescriptionId: 'parent-1' }));
    insertOptimizationHint(hint({ parentPrescriptionId: 'parent-2' }));
    expect(queryOptimizationHints({ parentPrescriptionId: 'parent-1' })).toHaveLength(1);
  });

  it('orders results by impact_score DESC', () => {
    insertOptimizationHint(hint({ id: 'low', impactScore: 0.1 }));
    insertOptimizationHint(hint({ id: 'high', impactScore: 0.9 }));
    insertOptimizationHint(hint({ id: 'mid', impactScore: 0.5 }));

    const rows = listOptimizationHints();
    expect(rows.map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('respects limit', () => {
    insertOptimizationHint(hint());
    insertOptimizationHint(hint());
    insertOptimizationHint(hint());
    expect(listOptimizationHints(2)).toHaveLength(2);
  });

  it('allows pending → accepted → applied transition and stamps applied_at', () => {
    insertOptimizationHint(hint({ id: 'h-1' }));

    expect(updateOptimizationHintStatus('h-1', 'accepted')).toBe(true);
    expect(getOptimizationHint('h-1')!.status).toBe('accepted');
    expect(getOptimizationHint('h-1')!.appliedAt).toBeNull();

    expect(updateOptimizationHintStatus('h-1', 'applied', { appliedAt: '2026-05-02T00:00:00.000Z' })).toBe(true);
    const applied = getOptimizationHint('h-1')!;
    expect(applied.status).toBe('applied');
    expect(applied.appliedAt).toBe('2026-05-02T00:00:00.000Z');
  });

  it('auto-stamps applied_at when omitted', () => {
    insertOptimizationHint(hint({ id: 'h-2', status: 'accepted' }));
    expect(updateOptimizationHintStatus('h-2', 'applied')).toBe(true);
    const row = getOptimizationHint('h-2')!;
    expect(row.appliedAt).not.toBeNull();
    expect(() => new Date(row.appliedAt as string).toISOString()).not.toThrow();
  });

  it('rejects illegal transitions', () => {
    insertOptimizationHint(hint({ id: 'h-3', status: 'applied' }));
    expect(() => updateOptimizationHintStatus('h-3', 'pending')).toThrow(/Illegal/);
    expect(getOptimizationHint('h-3')!.status).toBe('applied');
  });

  it('allows pending → rejected/expired/suppressed/failed/deferred', () => {
    for (const next of ['rejected', 'expired', 'suppressed', 'failed', 'deferred'] as const) {
      const id = `h-${next}`;
      insertOptimizationHint(hint({ id }));
      expect(updateOptimizationHintStatus(id, next)).toBe(true);
      expect(getOptimizationHint(id)!.status).toBe(next);
    }
  });

  it('deferred can return to pending', () => {
    insertOptimizationHint(hint({ id: 'h-d', status: 'deferred' }));
    expect(updateOptimizationHintStatus('h-d', 'pending')).toBe(true);
    expect(getOptimizationHint('h-d')!.status).toBe('pending');
  });

  it('force option bypasses transition validation', () => {
    insertOptimizationHint(hint({ id: 'h-f', status: 'applied' }));
    expect(updateOptimizationHintStatus('h-f', 'pending', { force: true })).toBe(true);
    expect(getOptimizationHint('h-f')!.status).toBe('pending');
  });

  it('returns false when updating to the same status', () => {
    insertOptimizationHint(hint({ id: 'h-same' }));
    expect(updateOptimizationHintStatus('h-same', 'pending')).toBe(false);
  });

  it('returns false when updating an unknown id', () => {
    expect(updateOptimizationHintStatus('missing', 'accepted')).toBe(false);
  });

  it('deletes a hint', () => {
    insertOptimizationHint(hint({ id: 'h-del' }));
    expect(deleteOptimizationHint('h-del')).toBe(true);
    expect(getOptimizationHint('h-del')).toBeNull();
    expect(deleteOptimizationHint('h-del')).toBe(false);
  });
});
