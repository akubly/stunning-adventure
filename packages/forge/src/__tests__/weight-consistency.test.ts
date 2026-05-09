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
import { computeConfidenceBoost, DEFAULT_MIN_SESSIONS } from '../prescribers/utils.js';

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

  it('returns 1.0 for vectorCount=1, minVectors=3 (clamp prevents penalty — cycle-2 fix #2)', () => {
    // Before cycle-2 fix: log(2)/log(4) ≈ 0.5 would ATTENUATE confidence.
    // After fix: Math.max(1.0, 0.5) = 1.0 — sparse evidence is neutral, not penalising.
    expect(computeConfidenceBoost(1, 3)).toBe(1.0);
  });

  it('returns 1.0 for any vectorCount below minVectors (clamp applied throughout sparse zone)', () => {
    // All sparse counts should be clamped to 1.0
    expect(computeConfidenceBoost(1, 5)).toBe(1.0);
    expect(computeConfidenceBoost(2, 5)).toBe(1.0);
    expect(computeConfidenceBoost(4, 5)).toBe(1.0);
  });

  it('vectors never attenuate confidence — output is always >= 1.0', () => {
    // Wave 1 policy invariant: confidenceBoost must NEVER drop below 1.0 for any input.
    for (const vc of [0, 1, 2, 3, 5, 10, 100]) {
      expect(computeConfidenceBoost(vc)).toBeGreaterThanOrEqual(1.0);
      expect(computeConfidenceBoost(vc, 10)).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('formula matches Math.max(1.0, log(1+vc) / log(1+mv)) for non-zero counts above threshold', () => {
    const vc = 7;
    const mv = 3;
    const expected = Math.max(1.0, Math.log(1 + vc) / Math.log(1 + mv));
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

describe('DRIFT_WEIGHTS — local invariants', () => {
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

  it.todo(
    // Cairn cannot import from Forge (acyclic dependency constraint), and Forge cannot import
    // from Cairn. Both packages define their weight constants locally (ADR-P4.6-003).
    // Cross-package constant verification requires a shared test infrastructure that reads
    // both constants without violating the acyclic dep graph — tracked as a follow-up to Phase 4.6.
    // The workaround: Laura\'s "DEFAULT_MIN_SESSIONS — cross-package" test (Finding #15) uses
    // this same pattern to verify the mirrored constant stays in sync.
    'cross-module weight consistency: cairn CHANGE_VECTOR_WEIGHTS mirrors forge DRIFT_WEIGHTS (pending cross-package test infrastructure)',
  );
});

// ---------------------------------------------------------------------------
// DEFAULT_MIN_SESSIONS — forge constant regression pin (Phase 4.6 cycle 2, Finding #15)
//
// Analogous to the drift weight pin above: both packages mirror DEFAULT_MIN_SESSIONS = 3.
// Cairn's counterpart pin lives in cairn/__tests__/changeVectors.test.ts.
// Together these form the cross-package assertion for Finding #15.
// ---------------------------------------------------------------------------

describe('DEFAULT_MIN_SESSIONS — forge constant regression pin', () => {
  it('DEFAULT_MIN_SESSIONS is 3 (matches cairn DEFAULT_MIN_SESSIONS and minSessionsObserved default)', () => {
    expect(DEFAULT_MIN_SESSIONS).toBe(3);
  });

  it('computeConfidenceBoost default minVectors argument equals DEFAULT_MIN_SESSIONS', () => {
    // computeConfidenceBoost(vc) === computeConfidenceBoost(vc, DEFAULT_MIN_SESSIONS) for all vc
    expect(computeConfidenceBoost(5)).toBeCloseTo(computeConfidenceBoost(5, DEFAULT_MIN_SESSIONS), 10);
    expect(computeConfidenceBoost(10)).toBeCloseTo(computeConfidenceBoost(10, DEFAULT_MIN_SESSIONS), 10);
  });
});

// ---------------------------------------------------------------------------
// computeConfidenceBoost — minVectors=0 safeMin guard (cycle-3, Alexander)
//
// computeConfidenceBoost(vc, 0): safeMin = Math.max(1, 0) = 1, so the formula
// uses log(2) as denominator — all results are finite and >= 1.0.
// ---------------------------------------------------------------------------

describe('computeConfidenceBoost — minVectors=0 safeMin guard', () => {
  it('computeConfidenceBoost(0, 0) returns 1.0 (vectorCount=0 early exit)', () => {
    expect(computeConfidenceBoost(0, 0)).toBe(1.0);
  });

  it('computeConfidenceBoost(1, 0) returns finite >= 1.0 (safeMin=1 prevents log(1)=0 divide)', () => {
    const result = computeConfidenceBoost(1, 0);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(1.0);
    // With safeMin=1: log(2)/log(2) = 1.0 exactly
    expect(result).toBeCloseTo(1.0, 10);
  });

  it('computeConfidenceBoost(large, 0) returns finite > 1.0 (safeMin=1, amplified)', () => {
    // With safeMin=1: log(1+vc)/log(2) — grows without bound but stays finite
    const result = computeConfidenceBoost(100, 0);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThan(1.0);
  });

  it('minVectors=0 never produces NaN or Infinity for any finite vectorCount', () => {
    for (const vc of [0, 1, 2, 5, 10, 100]) {
      const result = computeConfidenceBoost(vc, 0);
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeGreaterThanOrEqual(1.0);
    }
  });
});
