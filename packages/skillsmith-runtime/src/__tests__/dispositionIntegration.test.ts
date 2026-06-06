/**
 * M3 Disposition Integration Tests — Laura (hardening).
 *
 * End-to-end coverage of the Cairn→runtime→forge disposition chain:
 * 1. Hint state transitions are seeded via the real Cairn event-log path
 *    (insertHintIfNew + logEvent with source='mcp').
 * 2. executePrescriberRun wires SqliteHintDispositionProvider from its DB.
 * 3. The full applyDispositions logic runs inside runForgePrescribers.
 * 4. We assert suppression and confidence-boost outcomes on the returned hints.
 *
 * This is the "real DB, real prescriber run" tier for M3 disposition logic,
 * analogous to the forge_prescribe integration tests in forgePrescribeMcp.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as cairn from '@akubly/cairn';
import type { ExecutionProfile } from '@akubly/types';
import { executePrescriberRun } from '../index.js';
import type { OptimizationHintInsert } from '@akubly/cairn';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Execution profile that reliably fires both convergence and cache-optimization
 * hints. Uses sessionCount=6 so baseline confidences are deterministic:
 *   convergence:        Math.min(1, 6/10) = 0.6
 *   cache-optimization: Math.min(1, 6/10) = 0.6
 */
function makeProfile(skillId: string): ExecutionProfile {
  return {
    skillId,
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 6,
    drift: { mean: 0.1, p50: 0.08, p95: 0.12, trend: 'stable' },
    tokens: {
      meanInputTokens: 1_000,
      meanOutputTokens: 700,
      meanCacheHitRate: 0.1,  // < 0.3 threshold → cache-optimization fires
      totalCostNanoAiu: 12_000_000,
    },
    outcomes: {
      successRate: 0.9,
      meanConvergenceTurns: 12, // > 10 → convergence fires
      toolErrorRate: 0.02,
    },
    updatedAt: '2026-06-05T00:00:00.000Z',
  };
}

function makeHintInsert(
  id: string,
  skillId: string,
  category: string,
  source: OptimizationHintInsert['source'] = 'prompt-optimizer',
): OptimizationHintInsert {
  return {
    id,
    source,
    skillId,
    category,
    description: `Seed hint for ${category} (integration test)`,
    recommendation: 'Fix it',
    impactScore: 0.5,
    confidence: 0.6,
    evidence: {},
    metricSnapshot: {},
    generatedAt: '2026-06-05T00:00:00.000Z',
  };
}

/**
 * Emit a hint_state_transition event with source='mcp', mirroring the event
 * format that cairn.resolveOptimizationHint produces. The hint must already
 * exist in optimization_hints for the JOIN in SqliteHintDispositionProvider
 * to resolve the category.
 */
function emitMcpDisposition(
  db: ReturnType<typeof cairn.getDb>,
  skillId: string,
  hintId: string,
  disposition: 'dismissed' | 'resolved',
  note?: string,
): void {
  const sessionId = cairn.ensureSystemSession(db);
  cairn.logEvent(db, sessionId, 'hint_state_transition', {
    skill_id: skillId,
    hint_id: hintId,
    from_state: 'pending',
    to_state: 'rejected',
    timestamp: new Date().toISOString(),
    resolution_disposition: disposition,
    resolution_note: note ?? null,
    source: 'mcp',
  });
}

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  cairn.closeDb();
  cairn.getDb(':memory:');
});

afterEach(() => {
  cairn.closeDb();
});

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

describe('M3 disposition integration — executePrescriberRun end-to-end', () => {
  it('suppresses hints for a dismissed (source=mcp) category in the full Cairn→runtime→forge chain', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/m3-integration', 'main');

    const skillId = 'skill-m3-dismiss';
    const profile = makeProfile(skillId);

    // Seed a prior convergence hint and emit a source='mcp' dismissal for it.
    // The hint must exist in optimization_hints so the JOIN in
    // SqliteHintDispositionProvider can resolve its category.
    const seedHint = makeHintInsert('seed-convergence-1', skillId, 'convergence');
    cairn.insertHintIfNew(db, seedHint);
    emitMcpDisposition(db, skillId, seedHint.id, 'dismissed', 'not relevant');

    // Full-chain run: SqliteHintDispositionProvider reads the dismissal event and
    // applyDispositions filters convergence from the freshly-generated hint list.
    const result = await executePrescriberRun({ db, skillId, profile });

    // Convergence must be absent — the dismissal drove suppression end-to-end.
    expect(result.hints.some((h) => h.category === 'convergence')).toBe(false);
    // Other categories unaffected — confirms the prescriber DID run.
    expect(result.hints.some((h) => h.category === 'cache-optimization')).toBe(true);
  });

  it('boosts confidence for a resolved (source=mcp) category in the full Cairn→runtime→forge chain', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/m3-integration', 'main');

    const skillId = 'skill-m3-resolve';
    const profile = makeProfile(skillId);

    // Seed an old cache-optimization hint and emit a source='mcp' resolved transition.
    const seedHint = makeHintInsert('seed-cache-1', skillId, 'cache-optimization', 'token-optimizer');
    cairn.insertHintIfNew(db, seedHint);
    emitMcpDisposition(db, skillId, seedHint.id, 'resolved', 'applied the fix');

    const result = await executePrescriberRun({ db, skillId, profile });

    const cacheHint = result.hints.find((h) => h.category === 'cache-optimization');
    expect(cacheHint).toBeDefined();

    // Baseline confidence for sessionCount=6: Math.min(1, 6/10) = 0.6
    // After resolved boost: 0.6 * 1.2 = 0.72
    const expectedConfidence = 0.6 * 1.2;
    expect(cacheHint!.confidence).toBeCloseTo(expectedConfidence, 5);
    expect(cacheHint!.confidence).not.toBeGreaterThan(1.0);
  });

  it('source=system transitions do NOT suppress or boost hints (gating verified end-to-end)', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/m3-integration', 'main');

    const skillId = 'skill-m3-system-gate';
    const profile = makeProfile(skillId);

    // Seed a convergence hint, then emit a SYSTEM-sourced dismissal transition.
    const seedHint = makeHintInsert('seed-conv-system', skillId, 'convergence');
    cairn.insertHintIfNew(db, seedHint);

    // Emit source='system' — the SQL WHERE clause `source = 'mcp'` must exclude this.
    const sessionId = cairn.ensureSystemSession(db);
    cairn.logEvent(db, sessionId, 'hint_state_transition', {
      skill_id: skillId,
      hint_id: seedHint.id,
      from_state: 'pending',
      to_state: 'rejected',
      timestamp: new Date().toISOString(),
      resolution_disposition: 'dismissed',
      source: 'system', // NOT 'mcp' — must be ignored by SqliteHintDispositionProvider
    });

    const result = await executePrescriberRun({ db, skillId, profile });

    // convergence hint must NOT be suppressed — the system transition is gated out.
    expect(result.hints.some((h) => h.category === 'convergence')).toBe(true);

    // convergence confidence must be the unmodified baseline (no boost either).
    const convHint = result.hints.find((h) => h.category === 'convergence');
    const baselineConv = 0.6; // Math.min(1, 6/10) = 0.6
    expect(convHint!.confidence).toBeCloseTo(baselineConv, 5);
  });

  it('both suppression and boost apply in the same run (dismissed convergence, resolved cache)', async () => {
    const db = cairn.getDb();
    cairn.createSession(db, 'org/m3-integration', 'main');

    const skillId = 'skill-m3-combined';
    const profile = makeProfile(skillId);

    // Dismiss convergence.
    const convHintSeed = makeHintInsert('seed-conv-combined', skillId, 'convergence');
    cairn.insertHintIfNew(db, convHintSeed);
    emitMcpDisposition(db, skillId, convHintSeed.id, 'dismissed', 'not useful');

    // Resolve cache-optimization.
    const cacheHintSeed = makeHintInsert('seed-cache-combined', skillId, 'cache-optimization', 'token-optimizer');
    cairn.insertHintIfNew(db, cacheHintSeed);
    emitMcpDisposition(db, skillId, cacheHintSeed.id, 'resolved', 'applied successfully');

    const result = await executePrescriberRun({ db, skillId, profile });

    // Dismissed category absent.
    expect(result.hints.some((h) => h.category === 'convergence')).toBe(false);

    // Resolved category present with boosted confidence.
    const resultCacheHint = result.hints.find((h) => h.category === 'cache-optimization');
    expect(resultCacheHint).toBeDefined();
    expect(resultCacheHint!.confidence).toBeCloseTo(0.6 * 1.2, 5);
  });
});

