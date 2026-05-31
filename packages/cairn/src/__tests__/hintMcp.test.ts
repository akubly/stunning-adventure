/**
 * Tests for M1 hint consumption MCP tools:
 *   - list_optimization_hints (backing logic via queryOptimizationHints)
 *   - resolve_optimization_hint (backing logic via resolveOptimizationHint)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import {
  insertOptimizationHint,
  queryOptimizationHints,
  getOptimizationHint,
  resolveOptimizationHint,
  ACTIVE_HINT_STATUSES,
} from '../db/optimizationHints.js';
import type { OptimizationHintInsert } from '../db/optimizationHints.js';

let db: ReturnType<typeof getDb>;

let counter = 0;
function hint(overrides?: Partial<OptimizationHintInsert>): OptimizationHintInsert {
  counter += 1;
  return {
    id: `hint-mcp-${counter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-a',
    category: `category-${counter}`,
    description: 'Prompt is verbose',
    recommendation: 'Trim preamble',
    impactScore: 0.6,
    confidence: 0.75,
    evidence: {},
    metricSnapshot: {},
    generatedAt: '2026-05-31T19:04:59.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  counter = 0;
  db = getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// list_optimization_hints — backing logic (queryOptimizationHints)
// ---------------------------------------------------------------------------

describe('list_optimization_hints backing logic', () => {
  it('returns empty list on fresh DB', () => {
    const results = queryOptimizationHints(db, { status: [...ACTIVE_HINT_STATUSES] });
    expect(results).toHaveLength(0);
  });

  it('returns active hints by default status filter', () => {
    insertOptimizationHint(db, hint({ id: 'h-pending', status: 'pending' }));
    insertOptimizationHint(db, hint({ id: 'h-accepted', status: 'accepted', category: 'accepted-cat' }));
    insertOptimizationHint(db, hint({ id: 'h-rejected', status: 'rejected', category: 'rejected-cat' }));

    const active = queryOptimizationHints(db, { status: [...ACTIVE_HINT_STATUSES] });
    const activeIds = active.map((h) => h.id);
    expect(activeIds).toContain('h-pending');
    expect(activeIds).toContain('h-accepted');
    expect(activeIds).not.toContain('h-rejected');
  });

  it('filters by a single status', () => {
    insertOptimizationHint(db, hint({ id: 'h-pending', status: 'pending' }));
    insertOptimizationHint(db, hint({ id: 'h-deferred', status: 'deferred', category: 'deferred-cat' }));

    const pending = queryOptimizationHints(db, { status: 'pending' });
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('h-pending');
  });

  it('filters by skill_id', () => {
    insertOptimizationHint(db, hint({ skillId: 'skill-x', category: 'cat-x' }));
    insertOptimizationHint(db, hint({ skillId: 'skill-y', category: 'cat-y' }));

    const forX = queryOptimizationHints(db, { skillId: 'skill-x' });
    expect(forX).toHaveLength(1);
    expect(forX[0].skillId).toBe('skill-x');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      insertOptimizationHint(db, hint({ status: 'pending' }));
    }
    const limited = queryOptimizationHints(db, {
      status: [...ACTIVE_HINT_STATUSES],
      limit: 3,
    });
    expect(limited).toHaveLength(3);
  });

  it('returned rows include resolutionNote (null for fresh hints)', () => {
    insertOptimizationHint(db, hint({ id: 'h-note' }));
    const rows = queryOptimizationHints(db, { status: 'pending' });
    expect(rows[0].resolutionNote).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolve_optimization_hint — DB helper
// ---------------------------------------------------------------------------

describe('resolveOptimizationHint DB helper', () => {
  it('returns null for an unknown hint id', () => {
    const result = resolveOptimizationHint(db, 'no-such-hint', 'dismissed');
    expect(result).toBeNull();
  });

  it('dismisses a pending hint', () => {
    insertOptimizationHint(db, hint({ id: 'h-dismiss' }));
    const result = resolveOptimizationHint(db, 'h-dismiss', 'dismissed', 'not relevant');

    expect(result).not.toBeNull();
    expect(result!.resolution).toBe('dismissed');
    expect(result!.status).toBe('rejected');
    expect(result!.resolutionNote).toBe('not relevant');
    expect(result!.alreadyResolved).toBe(false);
  });

  it('resolves a pending hint', () => {
    insertOptimizationHint(db, hint({ id: 'h-resolve' }));
    const result = resolveOptimizationHint(db, 'h-resolve', 'resolved', 'fixed manually');

    expect(result!.resolution).toBe('resolved');
    expect(result!.status).toBe('rejected');
    expect(result!.resolutionNote).toBe('fixed manually');
    expect(result!.alreadyResolved).toBe(false);
  });

  it('is idempotent — does not error on already-terminal hint', () => {
    insertOptimizationHint(db, hint({ id: 'h-already', status: 'rejected', category: 'cat-already' }));
    const result = resolveOptimizationHint(db, 'h-already', 'dismissed');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('rejected');
    expect(result!.alreadyResolved).toBe(true);
  });

  it('is idempotent for all terminal statuses', () => {
    const terminalStatuses = ['applied', 'rejected', 'expired', 'suppressed', 'failed'] as const;
    for (const status of terminalStatuses) {
      const id = `h-terminal-${status}`;
      insertOptimizationHint(db, hint({ id, status, category: `cat-${status}` }));
      const result = resolveOptimizationHint(db, id, 'dismissed');
      expect(result!.alreadyResolved).toBe(true);
      expect(result!.status).toBe(status);
    }
  });

  it('resolves a deferred hint (valid transition)', () => {
    insertOptimizationHint(db, hint({ id: 'h-deferred', status: 'deferred', category: 'cat-deferred' }));
    const result = resolveOptimizationHint(db, 'h-deferred', 'dismissed');
    expect(result!.status).toBe('rejected');
    expect(result!.alreadyResolved).toBe(false);
  });

  it('stores note as null when omitted', () => {
    insertOptimizationHint(db, hint({ id: 'h-no-note' }));
    const result = resolveOptimizationHint(db, 'h-no-note', 'resolved');
    expect(result!.resolutionNote).toBeNull();
  });

  it('persists resolution_note in the DB row', () => {
    insertOptimizationHint(db, hint({ id: 'h-persist' }));
    resolveOptimizationHint(db, 'h-persist', 'dismissed', 'noise');

    const row = getOptimizationHint(db, 'h-persist');
    expect(row!.resolutionNote).toBe('noise');
    expect(row!.status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// Migration 017 schema sanity check
// ---------------------------------------------------------------------------

describe('migration 017 schema', () => {
  it('optimization_hints table has resolution_note column after migrations', () => {
    const cols = db.pragma('table_info(optimization_hints)') as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('resolution_note');
  });
});
