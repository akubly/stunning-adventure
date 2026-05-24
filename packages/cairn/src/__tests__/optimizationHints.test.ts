import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  insertOptimizationHint,
  insertHintIfNew,
  getOptimizationHint,
  hasActiveOptimizationHint,
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
        autoApplyEligible: false,
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
    expect(loaded!.evidence).toEqual({ detail: 'x', autoApplyEligible: false });
    expect(loaded!.autoApplyEligible).toBe(false);
    expect(loaded!.metricSnapshot).toEqual({ snap: 1 });
    expect(loaded!.appliedAt).toBeNull();
    expect(loaded!.parentPrescriptionId).toBeNull();
    expect(loaded!.createdAt).toBeDefined();
  });

  it('returns null for unknown hint id', () => {
    expect(getOptimizationHint('nope')).toBeNull();
  });

  it('preserves evidence.autoApplyEligible when the top-level field is omitted', () => {
    insertOptimizationHint(
      hint({
        id: 'h-evidence-only',
        evidence: { detail: 'x', autoApplyEligible: false },
        metricSnapshot: { snap: 2 },
      }),
    );

    const loaded = getOptimizationHint('h-evidence-only');
    expect(loaded?.evidence).toEqual({ detail: 'x', autoApplyEligible: false });
    expect(loaded?.autoApplyEligible).toBe(false);
  });

  it('queries by skill', () => {
    insertOptimizationHint(hint({ skillId: 'skill-a' }));
    insertOptimizationHint(hint({ skillId: 'skill-b', category: 'verbosity-b' }));
    insertOptimizationHint(hint({ skillId: 'skill-b', category: 'convergence' }));

    expect(queryOptimizationHints({ skillId: 'skill-a' })).toHaveLength(1);
    expect(queryOptimizationHints({ skillId: 'skill-b' })).toHaveLength(2);
  });

  it('queries by status (single and array)', () => {
    insertOptimizationHint(hint({ status: 'pending', category: 'verbosity-pending' }));
    insertOptimizationHint(hint({ status: 'accepted', category: 'verbosity-accepted' }));
    insertOptimizationHint(hint({ status: 'applied', category: 'verbosity-applied' }));

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
    insertOptimizationHint(hint({ parentPrescriptionId: 'parent-2', category: 'verbosity-parent-2' }));
    expect(queryOptimizationHints({ parentPrescriptionId: 'parent-1' })).toHaveLength(1);
  });

  it('orders results by impact_score DESC', () => {
    insertOptimizationHint(hint({ id: 'low', impactScore: 0.1, category: 'verbosity-low' }));
    insertOptimizationHint(hint({ id: 'high', impactScore: 0.9, category: 'verbosity-high' }));
    insertOptimizationHint(hint({ id: 'mid', impactScore: 0.5, category: 'verbosity-mid' }));

    const rows = listOptimizationHints();
    expect(rows.map((r) => r.id)).toEqual(['high', 'mid', 'low']);
  });

  it('respects limit', () => {
    insertOptimizationHint(hint({ category: 'verbosity-limit-1' }));
    insertOptimizationHint(hint({ category: 'verbosity-limit-2' }));
    insertOptimizationHint(hint({ category: 'verbosity-limit-3' }));
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

  it('hasActiveOptimizationHint returns false when no active hint matches', () => {
    const db = getDb();
    insertOptimizationHint(hint({ id: 'other-skill', skillId: 'skill-b', category: 'verbosity-other' }));

    expect(hasActiveOptimizationHint(db, 'skill-a', 'prompt-optimizer', 'verbosity')).toBe(false);
  });

  it('hasActiveOptimizationHint returns true for an exact active match', () => {
    const db = getDb();
    insertOptimizationHint(hint({ id: 'active-existing', category: 'verbosity', status: 'pending' }));

    expect(hasActiveOptimizationHint(db, 'skill-a', 'prompt-optimizer', 'verbosity')).toBe(true);
  });

  it('insertHintIfNew inserts a fresh hint and ignores terminal-only matches', () => {
    const db = getDb();
    insertOptimizationHint(hint({ id: 'applied-existing', category: 'verbosity-terminal', status: 'applied' }));

    const result = insertHintIfNew(db, hint({ id: 'fresh', category: 'verbosity-fresh' }));
    const terminalResult = insertHintIfNew(
      db,
      hint({ id: 'replacement', category: 'verbosity-terminal' }),
    );

    expect(result).toEqual({ inserted: true });
    expect(terminalResult).toEqual({ inserted: true });
    expect(getOptimizationHint('fresh')?.id).toBe('fresh');
    expect(getOptimizationHint('replacement')?.id).toBe('replacement');
  });

  it('insertHintIfNew suppresses an active duplicate for the same skill/source/category tuple', () => {
    const db = getDb();
    insertOptimizationHint(hint({ id: 'pending-existing', category: 'verbosity-active', status: 'pending' }));

    const result = insertHintIfNew(
      db,
      hint({ id: 'active-duplicate', category: 'verbosity-active' }),
    );

    expect(result).toEqual({ inserted: false, existingHintId: 'pending-existing' });
    expect(getOptimizationHint('active-duplicate')).toBeNull();
  });

  it('insertHintIfNew allows different categories for the same skill', () => {
    const db = getDb();

    const first = insertHintIfNew(db, hint({ id: 'cat-a', category: 'verbosity-cat-a' }));
    const second = insertHintIfNew(db, hint({ id: 'cat-b', category: 'verbosity-cat-b' }));

    expect(first).toEqual({ inserted: true });
    expect(second).toEqual({ inserted: true });
    expect(queryOptimizationHints({ skillId: 'skill-a' }).map((row) => row.id).sort()).toEqual([
      'cat-a',
      'cat-b',
    ]);
  });
});
