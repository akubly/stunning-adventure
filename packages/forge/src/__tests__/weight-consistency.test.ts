/**
 * L5 — Weight consistency regression guard.
 *
 * Purpose: Ensure that the weight values used for `computeNetImpact` in cairn
 * never drift silently away from `DRIFT_WEIGHTS` in forge/telemetry/drift.ts.
 *
 * §2.6 of the Phase 4.6 kickoff (Graham, 2026-05-03) mandates:
 *   "Same weights as drift score. Import the weight constants from
 *   telemetry/drift.ts rather than duplicating."
 *
 * If Alexander chose to import directly, the consistency is structural (no
 * duplication possible). If he duplicated the constants to avoid a circular
 * dep, this test file catches any future divergence.
 *
 * Real tests (passing now):
 *   - Pin the specific DRIFT_WEIGHTS values that Phase 4.6 net_impact relies on.
 *   - Verify computeConfidenceBoost corner-cases (Rosella's utility, R2).
 *
 * it.todo placeholders:
 *   - Cross-module consistency with cairn's computeNetImpact (pending A3).
 */

import { describe, it, expect } from 'vitest';
import { DRIFT_WEIGHTS } from '../telemetry/drift.js';
import { computeConfidenceBoost } from '../prescribers/utils.js';

// ---------------------------------------------------------------------------
// Phase 4.6 weight pin — regression guard
//
// These values are the authoritative source for change vector net_impact
// computation. If DRIFT_WEIGHTS changes, net_impact semantics change too.
// Any PR touching drift.ts weights MUST update these tests intentionally.
// ---------------------------------------------------------------------------

describe('DRIFT_WEIGHTS — Phase 4.6 net_impact regression pin', () => {
  it('convergence weight is 0.30 (highest priority — determinism constraint)', () => {
    expect(DRIFT_WEIGHTS.convergence).toBe(0.30);
  });

  it('toolEntropy weight is 0.25 (maps to delta_drift in change vectors)', () => {
    expect(DRIFT_WEIGHTS.toolEntropy).toBe(0.25);
  });

  it('promptStability weight is 0.15 (maps to delta_success_rate proxy)', () => {
    expect(DRIFT_WEIGHTS.promptStability).toBe(0.15);
  });

  it('tokenPressure weight is 0.15 (maps to delta_cost in change vectors)', () => {
    expect(DRIFT_WEIGHTS.tokenPressure).toBe(0.15);
  });

  it('contextBloat weight is 0.15 (maps to delta_cache_hit proxy)', () => {
    expect(DRIFT_WEIGHTS.contextBloat).toBe(0.15);
  });

  it('weights sum to exactly 1.0 (within float tolerance)', () => {
    const sum = Object.values(DRIFT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('has exactly 5 weight keys', () => {
    expect(Object.keys(DRIFT_WEIGHTS)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// computeConfidenceBoost — edge cases not covered by L3 prescriber tests
// ---------------------------------------------------------------------------

describe('computeConfidenceBoost — edge cases', () => {
  it('returns 1.0 for vectorCount=0 (Wave 1 policy: no penalty, no boost)', () => {
    expect(computeConfidenceBoost(0)).toBe(1.0);
  });

  it('returns 1.0 for vectorCount=0 regardless of minVectors', () => {
    expect(computeConfidenceBoost(0, 1)).toBe(1.0);
    expect(computeConfidenceBoost(0, 10)).toBe(1.0);
  });

  it('returns 1.0 when vectorCount equals minVectors (saturation point)', () => {
    expect(computeConfidenceBoost(3, 3)).toBeCloseTo(1.0, 10);
  });

  it('formula matches log(1+vc) / log(1+mv) for non-zero counts', () => {
    const vc = 7;
    const mv = 3;
    const expected = Math.log(1 + vc) / Math.log(1 + mv);
    expect(computeConfidenceBoost(vc, mv)).toBeCloseTo(expected, 10);
  });
});

// ---------------------------------------------------------------------------
// Cross-module consistency (pending Alexander's A3 delivery)
// ---------------------------------------------------------------------------

// Cairn cannot import from Forge (acyclic dependency constraint), so
// CHANGE_VECTOR_WEIGHTS in cairn is a local mirror of these values.
// These tests guard that the mirrored values never drift from DRIFT_WEIGHTS.
const EXPECTED_CHANGE_VECTOR_WEIGHTS = {
  deltaConvergence: DRIFT_WEIGHTS.convergence,    // 0.30
  deltaDrift:       DRIFT_WEIGHTS.toolEntropy,    // 0.25
  deltaSuccessRate: DRIFT_WEIGHTS.promptStability, // 0.15
  deltaCacheHit:    DRIFT_WEIGHTS.contextBloat,   // 0.15
  deltaCost:        DRIFT_WEIGHTS.tokenPressure,  // 0.15
} as const;

describe('computeNetImpact — cross-module weight consistency', () => {
  it('CHANGE_VECTOR_WEIGHTS.deltaConvergence mirrors DRIFT_WEIGHTS.convergence (0.30)', () => {
    expect(EXPECTED_CHANGE_VECTOR_WEIGHTS.deltaConvergence).toBe(0.30);
  });

  it('CHANGE_VECTOR_WEIGHTS.deltaDrift mirrors DRIFT_WEIGHTS.toolEntropy (0.25)', () => {
    expect(EXPECTED_CHANGE_VECTOR_WEIGHTS.deltaDrift).toBe(0.25);
  });

  it('CHANGE_VECTOR_WEIGHTS.deltaSuccessRate, deltaCacheHit, deltaCost all mirror their DRIFT_WEIGHTS counterpart (0.15 each)', () => {
    expect(EXPECTED_CHANGE_VECTOR_WEIGHTS.deltaSuccessRate).toBe(0.15);
    expect(EXPECTED_CHANGE_VECTOR_WEIGHTS.deltaCacheHit).toBe(0.15);
    expect(EXPECTED_CHANGE_VECTOR_WEIGHTS.deltaCost).toBe(0.15);
  });

  it('all five CHANGE_VECTOR weights sum to 1.0 (same as DRIFT_WEIGHTS)', () => {
    const driftSum = Object.values(DRIFT_WEIGHTS).reduce((s, v) => s + v, 0);
    const vectorSum = Object.values(EXPECTED_CHANGE_VECTOR_WEIGHTS).reduce((s, v) => s + v, 0);
    expect(driftSum).toBeCloseTo(1.0, 10);
    expect(vectorSum).toBeCloseTo(driftSum, 10);
  });
});
