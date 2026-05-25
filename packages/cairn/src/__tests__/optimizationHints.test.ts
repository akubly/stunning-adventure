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

describe('W4-1: insertHintIfNew atomicity', () => {
  it('single insert succeeds normally', () => {
    const db = getDb();
    const result = insertHintIfNew(db, hint({ id: 'atomic-1', category: 'verbosity-atomic' }));
    expect(result).toEqual({ inserted: true });
    expect(getOptimizationHint('atomic-1')?.id).toBe('atomic-1');
  });

  it('duplicate insert returns existing hint id', () => {
    const db = getDb();
    insertHintIfNew(db, hint({ id: 'atomic-dup-1', category: 'verbosity-dup', status: 'pending' }));
    const result = insertHintIfNew(db, hint({ id: 'atomic-dup-2', category: 'verbosity-dup' }));

    expect(result).toEqual({ inserted: false, existingHintId: 'atomic-dup-1' });
    expect(getOptimizationHint('atomic-dup-2')).toBeNull();
  });

  it('sequential duplicate inserts via insertHintIfNew dedupe to a single row', () => {
    const db = getDb();
    const category = 'verbosity-concurrent';

    // Two transactions wrapping insertHintIfNew for the same (skill_id, source, category)
    // tuple are run sequentially on a single connection (better-sqlite3 is synchronous).
    // This validates the higher-level dedup path in insertHintIfNew — the partial UNIQUE
    // index's own protection is exercised directly in the raw-SQL test below.
    const txn1 = db.transaction(() => {
      return insertHintIfNew(db, hint({ id: 'concurrent-1', category, status: 'pending' }));
    });
    const txn2 = db.transaction(() => {
      return insertHintIfNew(db, hint({ id: 'concurrent-2', category, status: 'pending' }));
    });

    const result1 = txn1.immediate();
    const result2 = txn2.immediate();

    // Exactly one should succeed
    const successes = [result1, result2].filter((r) => r.inserted);
    const failures = [result1, result2].filter((r) => !r.inserted);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // The failed insert should report the winner's ID
    const winnerId = result1.inserted ? 'concurrent-1' : 'concurrent-2';
    expect(failures[0].existingHintId).toBe(winnerId);

    // Only the winner is persisted
    const all = queryOptimizationHints({ skillId: 'skill-a', status: 'pending' })
      .filter((r) => r.category === category);
    expect(all).toHaveLength(1);
  });

  it('partial UNIQUE index rejects a raw duplicate active-status insert', () => {
    const db = getDb();
    const category = 'verbosity-raw-unique';
    const insertSql = `
      INSERT INTO optimization_hints
        (id, source, skill_id, category, description, recommendation,
         impact_score, confidence, evidence, metric_snapshot, status, generated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const params = (id: string) => [
      id, 'prompt-optimizer', 'skill-a', category,
      'desc', 'rec', 0.5, 0.8, '{}', '{}', 'pending', '2026-01-01T00:00:00.000Z',
    ] as const;

    // First insert must succeed
    db.prepare(insertSql).run(...params('raw-unique-1'));
    expect(getOptimizationHint('raw-unique-1')).not.toBeNull();

    // Second insert with the same (skill_id, source, category) and an active status
    // must be rejected by the partial UNIQUE index — independent of insertHintIfNew logic
    expect(() => {
      db.prepare(insertSql).run(...params('raw-unique-2'));
    }).toThrow(/UNIQUE constraint failed/);

    // Terminal-status row with the same tuple is NOT blocked by the partial index
    expect(() => {
      db.prepare(insertSql).run(
        'raw-unique-terminal', 'prompt-optimizer', 'skill-a', category,
        'desc', 'rec', 0.5, 0.8, '{}', '{}', 'applied', '2026-01-01T00:00:00.000Z',
      );
    }).not.toThrow();
  });
});

describe('insertHintIfNew — UNIQUE constraint narrowing', () => {
  it('PK collision (duplicate id, different category) propagates through insertHintIfNew and is not treated as a dedup skip', () => {
    const db = getDb();
    // First insert with a known id succeeds
    insertOptimizationHint(hint({ id: 'pk-collision-test', category: 'verbosity-pk-a' }));

    // Second insert with the same id but a different category:
    // - The partial UNIQUE index on (skill_id, source, category) does NOT trigger (different category)
    // - The PK constraint on optimization_hints.id DOES trigger
    // The narrowed catch must NOT swallow this — it must rethrow.
    const secondHint = hint({ id: 'pk-collision-test', category: 'verbosity-pk-b' });
    expect(() => insertHintIfNew(db, secondHint)).toThrow();
  });

  it('PK collision propagates through insertOptimizationHint wrapper (not silently skipped)', () => {
    insertOptimizationHint(hint({ id: 'pk-collision-test', category: 'verbosity-pk-a' }));

    const secondHint = hint({ id: 'pk-collision-test', category: 'verbosity-pk-b' });
    expect(() => insertOptimizationHint(secondHint)).toThrow();
  });
});
