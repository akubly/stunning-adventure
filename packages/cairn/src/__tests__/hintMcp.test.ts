/**
 * Tests for M1 hint consumption MCP tools:
 *   - list_optimization_hints (backing logic via queryOptimizationHints + buildListHintsResult)
 *   - resolve_optimization_hint (backing logic via resolveOptimizationHint + buildResolveHintResult)
 *   - get_optimization_hint (backing logic via getOptimizationHint + buildGetHintResult)
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
import {
  buildListHintsResult,
  buildResolveHintResult,
  buildGetHintResult,
} from '../mcp/server.js';

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
    expect(result!.resolutionDisposition).toBe('dismissed');
    expect(result!.status).toBe('rejected');
    expect(result!.resolutionNote).toBe('not relevant');
    expect(result!.alreadyResolved).toBe(false);
    expect(result!.prior_status).toBeNull();
  });

  it('resolves a pending hint', () => {
    insertOptimizationHint(db, hint({ id: 'h-resolve' }));
    const result = resolveOptimizationHint(db, 'h-resolve', 'resolved', 'fixed manually');

    expect(result!.resolution).toBe('resolved');
    expect(result!.resolutionDisposition).toBe('resolved');
    expect(result!.status).toBe('rejected');
    expect(result!.resolutionNote).toBe('fixed manually');
    expect(result!.alreadyResolved).toBe(false);
    expect(result!.prior_status).toBeNull();
  });

  it('is idempotent — does not error on already-terminal hint', () => {
    insertOptimizationHint(db, hint({ id: 'h-already', status: 'rejected', category: 'cat-already' }));
    const result = resolveOptimizationHint(db, 'h-already', 'dismissed');

    expect(result).not.toBeNull();
    expect(result!.status).toBe('rejected');
    expect(result!.alreadyResolved).toBe(true);
    // F2: resolution is null when already resolved
    expect(result!.resolution).toBeNull();
    expect(result!.prior_status).toBe('rejected');
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

  it('persists resolution_note and resolution_disposition in the DB row', () => {
    insertOptimizationHint(db, hint({ id: 'h-persist' }));
    resolveOptimizationHint(db, 'h-persist', 'dismissed', 'noise');

    const row = getOptimizationHint(db, 'h-persist');
    expect(row!.resolutionNote).toBe('noise');
    expect(row!.resolutionDisposition).toBe('dismissed');
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

// ---------------------------------------------------------------------------
// Migration 018 schema sanity check
// ---------------------------------------------------------------------------

describe('migration 018 schema', () => {
  it('optimization_hints table has resolution_disposition column after migrations', () => {
    const cols = db.pragma('table_info(optimization_hints)') as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('resolution_disposition');
  });
});

// ---------------------------------------------------------------------------
// Handler-level tests (F3) — buildListHintsResult, buildResolveHintResult, buildGetHintResult
// ---------------------------------------------------------------------------

describe('buildListHintsResult handler', () => {
  it('no status arg returns only active hints (default-fallback path)', () => {
    insertOptimizationHint(db, hint({ id: 'hl-pending', status: 'pending' }));
    insertOptimizationHint(db, hint({ id: 'hl-rejected', status: 'rejected', category: 'cat-r' }));
    insertOptimizationHint(db, hint({ id: 'hl-applied', status: 'applied', category: 'cat-a' }));

    const result = buildListHintsResult(db, { limit: 20 });
    const ids = (result.hints as Array<{ id: string }>).map((h) => h.id);

    expect(ids).toContain('hl-pending');
    expect(ids).not.toContain('hl-rejected');
    expect(ids).not.toContain('hl-applied');
    // active_count present when no status filter
    expect(result.active_count).toBeDefined();
  });

  it('omits active_count when a specific status filter is passed', () => {
    insertOptimizationHint(db, hint({ id: 'hl-s1', status: 'rejected', category: 'cat-s1' }));

    const result = buildListHintsResult(db, { status: 'rejected', limit: 20 });
    expect('active_count' in result).toBe(false);
    expect(result.count).toBe(1);
  });

  it('surfaces resolution_disposition and resolution_note on resolved hints', () => {
    insertOptimizationHint(db, hint({ id: 'hl-res', status: 'pending', category: 'cat-res' }));
    resolveOptimizationHint(db, 'hl-res', 'resolved', 'done');

    const result = buildListHintsResult(db, { status: 'rejected', limit: 20 });
    const row = (result.hints as Array<Record<string, unknown>>).find((h) => h.id === 'hl-res');
    expect(row?.resolution_disposition).toBe('resolved');
    expect(row?.resolution_note).toBe('done');
  });
});

describe('buildResolveHintResult handler', () => {
  it('returns null for unknown hint id (not-found error path)', () => {
    const result = buildResolveHintResult(db, { hint_id: 'no-such', resolution: 'dismissed' });
    expect(result).toBeNull();
  });

  it('resolves a pending hint — returns structured payload', () => {
    insertOptimizationHint(db, hint({ id: 'hr-1', status: 'pending', category: 'cat-hr1' }));
    const result = buildResolveHintResult(db, { hint_id: 'hr-1', resolution: 'resolved', note: 'fixed it' });

    expect(result).not.toBeNull();
    expect(result!.hint_id).toBe('hr-1');
    expect(result!.resolution).toBe('resolved');
    expect(result!.resolution_disposition).toBe('resolved');
    expect(result!.status).toBe('rejected');
    expect(result!.resolution_note).toBe('fixed it');
    expect(result!.already_resolved).toBe(false);
    expect(result!.prior_status).toBeNull();
  });

  it('already-resolved path returns resolution: null and prior_status', () => {
    insertOptimizationHint(db, hint({ id: 'hr-2', status: 'applied', category: 'cat-hr2' }));
    const result = buildResolveHintResult(db, { hint_id: 'hr-2', resolution: 'dismissed' });

    expect(result!.already_resolved).toBe(true);
    expect(result!.resolution).toBeNull();
    expect(result!.prior_status).toBe('applied');
  });
});

describe('buildGetHintResult handler', () => {
  it('returns null for unknown hint id', () => {
    expect(buildGetHintResult(db, { hint_id: 'nope' })).toBeNull();
  });

  it('round-trip — returns full hint including evidence, metric_snapshot, and resolution fields', () => {
    insertOptimizationHint(db, hint({
      id: 'hg-1',
      evidence: { tokens_saved: 42 },
      metricSnapshot: { drift: 0.1 },
      parentPrescriptionId: 'presc-x',
    }));
    resolveOptimizationHint(db, 'hg-1', 'dismissed', 'low value');

    const result = buildGetHintResult(db, { hint_id: 'hg-1' });

    expect(result).not.toBeNull();
    expect(result!.id).toBe('hg-1');
    expect(result!.skill_id).toBe('skill-a');
    expect((result!.evidence as Record<string, unknown>).tokens_saved).toBe(42);
    expect((result!.metric_snapshot as Record<string, unknown>).drift).toBe(0.1);
    expect(result!.parent_prescription_id).toBe('presc-x');
    expect(result!.resolution_disposition).toBe('dismissed');
    expect(result!.resolution_note).toBe('low value');
    expect(result!.status).toBe('rejected');
    expect(result!.confidence_level).toBeDefined();
    expect(result!.generated_at).toBeDefined();
    expect(result!.created_at).toBeDefined();
  });
});
