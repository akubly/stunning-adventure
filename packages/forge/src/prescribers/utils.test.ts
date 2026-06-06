/**
 * Unit tests for applyDispositions (M3 hardening — Laura).
 *
 * Pure-function coverage: all inputs and edge cases that the orchestrator
 * tests cannot easily express because they require going through the full
 * prescriber run to obtain baseline hints.
 */

import { describe, it, expect } from 'vitest';
import type { DispositionSummary, ExecutionProfile } from '@akubly/types';
import type { OptimizationHint, OptimizationCategory } from './types.js';
import { applyDispositions, RESOLVED_CONFIDENCE_BOOST } from './utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal OptimizationHint factory. applyDispositions only reads .category
 * and .confidence, but the full interface is required by TypeScript — all
 * other fields are valid minimal values.
 */
function makeHint(
  category: OptimizationCategory,
  confidence: number,
  id?: string,
): OptimizationHint {
  const profile: ExecutionProfile = {
    skillId: 'sk-test',
    granularity: 'per-skill',
    granularityKey: 'global',
    sessionCount: 6,
    drift: { mean: 0.1, p50: 0.08, p95: 0.12, trend: 'stable' },
    tokens: {
      meanInputTokens: 1_000,
      meanOutputTokens: 700,
      meanCacheHitRate: 0.1,
      totalCostNanoAiu: 12_000_000,
    },
    outcomes: { successRate: 0.9, meanConvergenceTurns: 12, toolErrorRate: 0.02 },
    updatedAt: '2026-06-05T00:00:00.000Z',
  };

  return {
    id: id ?? `hint-${category}`,
    source: 'prompt-optimizer',
    skillId: 'sk-test',
    category,
    description: `Test hint for ${category}`,
    recommendation: 'Apply fix',
    impactScore: 0.5,
    confidence,
    evidence: { profile, triggerMetrics: {} },
    metricSnapshot: {
      driftScore: 0.1,
      driftLevel: 'GREEN',
      tokenCostNanoAiu: 12_000_000,
      successRate: 0.9,
      convergenceTurns: 12,
      cacheHitRate: 0.1,
    },
    generatedAt: '2026-06-05T00:00:00.000Z',
  };
}

function makeDisposition(
  category: string,
  dismissedCount: number,
  resolvedCount: number,
): DispositionSummary {
  return { skillId: 'sk-test', category, dismissedCount, resolvedCount };
}

// ---------------------------------------------------------------------------
// applyDispositions — unit tests
// ---------------------------------------------------------------------------

describe('applyDispositions', () => {
  it('returns all hints unchanged when dispositions array is empty', () => {
    const hints = [makeHint('convergence', 0.6), makeHint('cache-optimization', 0.7)];
    const result = applyDispositions(hints, []);
    expect(result).toHaveLength(2);
    expect(result[0]!.confidence).toBe(0.6);
    expect(result[1]!.confidence).toBe(0.7);
  });

  it('suppresses a hint when dismissedCount=1 (single dismissal)', () => {
    const hints = [makeHint('convergence', 0.6), makeHint('cache-optimization', 0.7)];
    const result = applyDispositions(hints, [makeDisposition('convergence', 1, 0)]);
    expect(result).toHaveLength(1);
    expect(result.some((h) => h.category === 'convergence')).toBe(false);
    expect(result.some((h) => h.category === 'cache-optimization')).toBe(true);
  });

  // Gap #1 (Aaron): re-dismissed hint (dismissedCount=2) — must still be suppressed.
  it('suppresses a hint when dismissedCount=2 (suppression is permanent across multiple dismissals)', () => {
    const hints = [makeHint('convergence', 0.6), makeHint('cache-optimization', 0.7)];
    const result = applyDispositions(hints, [makeDisposition('convergence', 2, 0)]);
    expect(result.some((h) => h.category === 'convergence')).toBe(false);
    expect(result.some((h) => h.category === 'cache-optimization')).toBe(true);
  });

  it('boosts confidence when resolvedCount=1', () => {
    const hints = [makeHint('cache-optimization', 0.6)];
    const result = applyDispositions(hints, [makeDisposition('cache-optimization', 0, 1)]);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBeCloseTo(0.6 * RESOLVED_CONFIDENCE_BOOST, 10);
  });

  // Gap #2 (Aaron): confidence ceiling — Math.min(1, ...) clamp must hold.
  // 0.9 * 1.2 = 1.08 — must be clamped to exactly 1.0, never exceed 1.
  it('clamps confidence to exactly 1.0 when boost would exceed the ceiling (0.9 * 1.2 = 1.08)', () => {
    const hints = [makeHint('cache-optimization', 0.9)];
    const result = applyDispositions(hints, [makeDisposition('cache-optimization', 0, 1)]);
    expect(result[0]!.confidence).toBe(1.0);
    expect(result[0]!.confidence).not.toBeGreaterThan(1.0);
  });

  // Gap #2 variant: confidence already at 1.0 — boost must not push it above 1.
  it('does not exceed 1.0 when confidence is already at the ceiling (1.0 * 1.2 = 1.2)', () => {
    const hints = [makeHint('cache-optimization', 1.0)];
    const result = applyDispositions(hints, [makeDisposition('cache-optimization', 0, 1)]);
    expect(result[0]!.confidence).toBe(1.0);
  });

  // Gap #3 (Aaron): concurrent/mixed — same (skillId, category) has BOTH dismissed and resolved
  // mcp transitions. Per the decision record, dismissed takes precedence.
  it('dismissed wins over resolved when both signals exist for the same category', () => {
    const hints = [makeHint('convergence', 0.6)];
    const result = applyDispositions(hints, [makeDisposition('convergence', 1, 1)]);
    // Suppression runs in the filter step before the boost map step — dismissed always wins.
    expect(result.some((h) => h.category === 'convergence')).toBe(false);
  });

  // Gap #5 (Aaron): all-zero DispositionSummary — neither suppress nor boost.
  it('does not suppress or boost when dismissedCount=0 and resolvedCount=0 (all-zero summary)', () => {
    const hints = [makeHint('convergence', 0.6)];
    const result = applyDispositions(hints, [makeDisposition('convergence', 0, 0)]);
    expect(result).toHaveLength(1);
    expect(result[0]!.confidence).toBe(0.6);
  });

  it('passes through hints for categories not present in the dispositions map', () => {
    const hints = [makeHint('tool-guidance', 0.5)];
    // Disposition for a different category — tool-guidance hint untouched.
    const result = applyDispositions(hints, [makeDisposition('convergence', 1, 0)]);
    expect(result).toHaveLength(1);
    expect(result[0]!.category).toBe('tool-guidance');
    expect(result[0]!.confidence).toBe(0.5);
  });

  it('applies mixed effects: suppresses one category and boosts another in the same call', () => {
    const hints = [
      makeHint('convergence', 0.6, 'h-convergence'),
      makeHint('cache-optimization', 0.5, 'h-cache'),
      makeHint('tool-guidance', 0.7, 'h-tool'),
    ];
    const dispositions = [
      makeDisposition('convergence', 1, 0),       // suppress
      makeDisposition('cache-optimization', 0, 2), // boost (resolvedCount=2)
    ];
    const result = applyDispositions(hints, dispositions);
    expect(result.some((h) => h.category === 'convergence')).toBe(false);
    const cacheHint = result.find((h) => h.category === 'cache-optimization');
    expect(cacheHint).toBeDefined();
    expect(cacheHint!.confidence).toBeCloseTo(0.5 * RESOLVED_CONFIDENCE_BOOST, 10);
    // Unrelated category passes through unchanged.
    const toolHint = result.find((h) => h.category === 'tool-guidance');
    expect(toolHint).toBeDefined();
    expect(toolHint!.confidence).toBe(0.7);
  });

  it('does not mutate the input hints (pure function contract)', () => {
    const hints = [makeHint('cache-optimization', 0.6)];
    const originalConfidence = hints[0]!.confidence;
    const result = applyDispositions(hints, [makeDisposition('cache-optimization', 0, 1)]);
    // The returned object is a new object with updated confidence.
    expect(result[0]).not.toBe(hints[0]);
    // The original hint is unchanged.
    expect(hints[0]!.confidence).toBe(originalConfidence);
  });
});
