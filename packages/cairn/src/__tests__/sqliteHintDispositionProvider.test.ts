import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createSession } from '../db/sessions.js';
import { insertHintIfNew, resolveOptimizationHint } from '../db/optimizationHints.js';
import { logEvent, getUnprocessedEvents } from '../db/events.js';
import { ensureSystemSession } from '../db/sessions.js';
import { SqliteHintDispositionProvider } from '../db/sqliteHintDispositionProvider.js';
import {
  HINT_STATE_TRANSITION_EVENT_TYPE,
  HINT_TRANSITION_SOURCE_MCP,
  HINT_TRANSITION_PAYLOAD_KEYS as K,
  HINT_RESOLUTION_DISMISSED,
} from '../db/hintStateTransitionConstants.js';
import type { OptimizationHintInsert } from '../db/optimizationHints.js';

let db: ReturnType<typeof getDb>;
let counter = 0;

function hint(
  category: string,
  overrides: Partial<OptimizationHintInsert> = {},
): OptimizationHintInsert {
  counter += 1;
  return {
    id: `disp-hint-${counter}`,
    source: 'prompt-optimizer',
    skillId: 'skill-disp',
    category,
    description: `Hint ${counter}`,
    recommendation: 'Fix it',
    impactScore: 0.5,
    confidence: 0.8,
    evidence: {},
    metricSnapshot: {},
    generatedAt: '2026-06-05T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  closeDb();
  counter = 0;
  db = getDb(':memory:');
  createSession(db, 'test-repo', 'main');
});

afterEach(() => {
  closeDb();
});

describe('SqliteHintDispositionProvider', () => {
  it('returns empty array when no hint_state_transition events exist', async () => {
    const provider = new SqliteHintDispositionProvider(db);
    await expect(provider.getDispositions('skill-disp')).resolves.toEqual([]);
  });

  it('returns empty array when no mcp-sourced transitions exist', async () => {
    // Insert a hint and a non-mcp transition (state change from insertion, no source='mcp')
    insertHintIfNew(db, hint('convergence'));
    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');
    expect(result).toEqual([]);
  });

  it('counts dismissed mcp transitions', async () => {
    const h = hint('convergence');
    insertHintIfNew(db, h);
    resolveOptimizationHint(db, h.id, 'dismissed', 'not relevant');

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      skillId: 'skill-disp',
      category: 'convergence',
      dismissedCount: 1,
      resolvedCount: 0,
    });
  });

  it('counts resolved mcp transitions', async () => {
    const h = hint('prompt-structure');
    insertHintIfNew(db, h);
    resolveOptimizationHint(db, h.id, 'resolved', 'applied the fix');

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      skillId: 'skill-disp',
      category: 'prompt-structure',
      dismissedCount: 0,
      resolvedCount: 1,
    });
  });

  it('does NOT count transitions where source is not mcp', async () => {
    // Emit a hint_state_transition event manually with a different source
    const h = hint('tool-guidance');
    insertHintIfNew(db, h);
    const sessionId = ensureSystemSession(db);
    logEvent(db, sessionId, HINT_STATE_TRANSITION_EVENT_TYPE, {
      [K.SKILL_ID]: 'skill-disp',
      [K.HINT_ID]: h.id,
      [K.FROM_STATE]: 'pending',
      [K.TO_STATE]: 'rejected',
      [K.TIMESTAMP]: new Date().toISOString(),
      [K.RESOLUTION_DISPOSITION]: HINT_RESOLUTION_DISMISSED,
      [K.SOURCE]: 'system', // NOT 'mcp'
    });

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');
    expect(result).toEqual([]);
  });

  it('does NOT count transitions with null resolution_disposition', async () => {
    // Plain status-change transition (no disposition, no source)
    const h = hint('cache-optimization');
    insertHintIfNew(db, h);
    // The insertHintIfNew emits a hint_state_transition with no disposition — should not be counted

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');
    expect(result).toEqual([]);
  });

  it('aggregates multiple hints in the same category', async () => {
    const h1 = hint('convergence');
    const h2 = hint('convergence', { source: 'token-optimizer' }); // different source to bypass dedup
    insertHintIfNew(db, h1);
    insertHintIfNew(db, h2);
    resolveOptimizationHint(db, h1.id, 'dismissed');
    resolveOptimizationHint(db, h2.id, 'dismissed');

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'convergence',
      dismissedCount: 2,
      resolvedCount: 0,
    });
  });

  it('groups by category across mixed dispositions', async () => {
    const h1 = hint('convergence');
    const h2 = hint('prompt-structure');
    insertHintIfNew(db, h1);
    insertHintIfNew(db, h2);
    resolveOptimizationHint(db, h1.id, 'dismissed');
    resolveOptimizationHint(db, h2.id, 'resolved');

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');

    expect(result).toHaveLength(2);
    const convergence = result.find((r) => r.category === 'convergence');
    const promptStructure = result.find((r) => r.category === 'prompt-structure');
    expect(convergence).toMatchObject({ dismissedCount: 1, resolvedCount: 0 });
    expect(promptStructure).toMatchObject({ dismissedCount: 0, resolvedCount: 1 });
  });

  it('only returns dispositions for the requested skillId', async () => {
    // Hint for skill-disp
    const h1 = hint('convergence', { skillId: 'skill-disp' });
    // Hint for a different skill
    const h2 = hint('convergence', { skillId: 'skill-other', id: 'other-hint-1' });
    insertHintIfNew(db, h1);
    insertHintIfNew(db, h2);
    resolveOptimizationHint(db, h1.id, 'dismissed');
    resolveOptimizationHint(db, h2.id, 'dismissed');

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-other');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      skillId: 'skill-other',
      category: 'convergence',
      dismissedCount: 1,
    });
  });

  // Adversarial: absent source key (no 'source' field in payload at all).
  // The SQL requires json_extract(payload, '$.source') = 'mcp'.
  // Missing source → json_extract returns NULL → NULL = 'mcp' is NULL (falsy) → not counted.
  it('does NOT count transitions where source key is entirely absent from payload', async () => {
    const h = hint('prompt-structure');
    insertHintIfNew(db, h);
    const sessionId = ensureSystemSession(db);
    // Emit a transition event with resolution_disposition but NO source key.
    logEvent(db, sessionId, HINT_STATE_TRANSITION_EVENT_TYPE, {
      [K.SKILL_ID]: 'skill-disp',
      [K.HINT_ID]: h.id,
      [K.FROM_STATE]: 'pending',
      [K.TO_STATE]: 'rejected',
      [K.TIMESTAMP]: new Date().toISOString(),
      [K.RESOLUTION_DISPOSITION]: HINT_RESOLUTION_DISMISSED,
      // source key deliberately omitted
    });

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');
    expect(result).toEqual([]);
  });

  // Adversarial: mixed mcp + system transitions for the same category.
  // The system transition has resolution_disposition='dismissed' — must NOT be counted.
  // The mcp transition has resolution_disposition='resolved' — MUST be counted.
  // Expected: dismissedCount=0, resolvedCount=1.
  it('counts only mcp transitions when system and mcp transitions coexist for the same category', async () => {
    const h1 = hint('tool-guidance');
    const h2 = hint('tool-guidance', { source: 'token-optimizer' }); // second hint, same category
    insertHintIfNew(db, h1);
    insertHintIfNew(db, h2);

    // System dismissal — must not be counted.
    const sessionId = ensureSystemSession(db);
    logEvent(db, sessionId, HINT_STATE_TRANSITION_EVENT_TYPE, {
      [K.SKILL_ID]: 'skill-disp',
      [K.HINT_ID]: h1.id,
      [K.FROM_STATE]: 'pending',
      [K.TO_STATE]: 'rejected',
      [K.TIMESTAMP]: new Date().toISOString(),
      [K.RESOLUTION_DISPOSITION]: HINT_RESOLUTION_DISMISSED,
      [K.SOURCE]: 'system',
    });

    // MCP resolution — must be counted.
    resolveOptimizationHint(db, h2.id, 'resolved', 'applied');

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      skillId: 'skill-disp',
      category: 'tool-guidance',
      dismissedCount: 0, // system dismissal not counted
      resolvedCount: 1, // mcp resolution counted
    });
  });

  // Adversarial: hint_id in the event does not exist in optimization_hints (JOIN fails).
  // The SQL uses INNER JOIN — orphan transition events must not produce a row.
  it('does NOT count transition events whose hint_id has no matching optimization_hints row', async () => {
    const sessionId = ensureSystemSession(db);
    // Emit a well-formed mcp transition that references a non-existent hint id.
    logEvent(db, sessionId, HINT_STATE_TRANSITION_EVENT_TYPE, {
      [K.SKILL_ID]: 'skill-disp',
      [K.HINT_ID]: 'non-existent-hint-id',
      [K.FROM_STATE]: 'pending',
      [K.TO_STATE]: 'rejected',
      [K.TIMESTAMP]: new Date().toISOString(),
      [K.RESOLUTION_DISPOSITION]: HINT_RESOLUTION_DISMISSED,
      [K.SOURCE]: HINT_TRANSITION_SOURCE_MCP,
    });

    const provider = new SqliteHintDispositionProvider(db);
    const result = await provider.getDispositions('skill-disp');
    // INNER JOIN with optimization_hints should filter this out — no row returned.
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Producer/consumer contract
// ---------------------------------------------------------------------------

describe('SqliteHintDispositionProvider — producer/consumer payload contract', () => {
  it('resolveOptimizationHint emits a payload whose key names match what the provider SQL extracts', () => {
    // This test verifies that the event emitted by the producer
    // (resolveOptimizationHint → emitHintTransitionEvent) contains the exact
    // payload key names that SqliteHintDispositionProvider SQL uses in its
    // json_extract() expressions.  Both sides reference HINT_TRANSITION_PAYLOAD_KEYS
    // constants; this test makes the coupling explicit and will fail if they drift.
    const h = hint('convergence');
    insertHintIfNew(db, h);
    resolveOptimizationHint(db, h.id, 'dismissed', 'contract-test-note');

    // Read the most recently written hint_state_transition event.
    const allEvents = getUnprocessedEvents(db, 0);
    const transitionEvents = allEvents.filter(
      (e) => e.eventType === HINT_STATE_TRANSITION_EVENT_TYPE,
    );
    // insertHintIfNew emits one, resolveOptimizationHint emits one.
    expect(transitionEvents.length).toBeGreaterThanOrEqual(2);
    const resolveEvent = transitionEvents[transitionEvents.length - 1];
    const payload = JSON.parse(resolveEvent.payload) as Record<string, unknown>;

    // Assert every key the provider SQL references is present with expected values.
    expect(payload[K.SOURCE]).toBe(HINT_TRANSITION_SOURCE_MCP);
    expect(payload[K.SKILL_ID]).toBe('skill-disp');
    expect(payload[K.HINT_ID]).toBe(h.id);
    expect(payload[K.RESOLUTION_DISPOSITION]).toBe(HINT_RESOLUTION_DISMISSED);
    expect(payload[K.RESOLUTION_NOTE]).toBe('contract-test-note');

    // And verify the provider can actually read it (round-trip).
    const provider = new SqliteHintDispositionProvider(db);
    return provider.getDispositions('skill-disp').then((result) => {
      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('convergence');
      expect(result[0].dismissedCount).toBe(1);
    });
  });
});
