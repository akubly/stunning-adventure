/**
 * Shared helpers for prescribers.
 *
 * Both the prompt and token optimizers need to snapshot the same metric
 * envelope onto every emitted hint (for provenance + downstream display),
 * so the snapshot builder lives here. Drift level is sourced from the
 * canonical `classifyDriftLevel()` helper instead of inlined thresholds —
 * one source of truth for GREEN/YELLOW/RED boundaries.
 *
 * Phase 4.6: `computeConfidenceBoost()` provides the log-scaled vector-count
 * boost used when `historicalVectors` are passed to the prescribers.
 */

import { classifyDriftLevel } from "../telemetry/drift.js";
import type { ExecutionProfile } from "../telemetry/types.js";
import type { MetricSnapshot } from "./types.js";

export function buildSnapshot(profile: ExecutionProfile): MetricSnapshot {
  return {
    driftScore: profile.drift.mean,
    driftLevel: classifyDriftLevel(profile.drift.mean),
    tokenCostNanoAiu: profile.tokens.totalCostNanoAiu,
    successRate: profile.outcomes.successRate,
    convergenceTurns: profile.outcomes.meanConvergenceTurns,
    cacheHitRate: profile.tokens.meanCacheHitRate,
  };
}

/**
 * Log-scaled confidence boost based on the number of observed change vectors.
 *
 * Formula: `log(1 + vectorCount) / log(1 + minVectors)`
 *
 * - `vectorCount === 0` → returns `1.0` (no boost, no penalty; baseline confidence preserved).
 * - `vectorCount < minVectors` → fractional boost (< 1.0 only relative to "saturated" confidence,
 *   but still ≥ 0 — the result is always non-negative).
 * - `vectorCount === minVectors` → returns `1.0` (baseline saturation point).
 * - `vectorCount > minVectors` → returns > 1.0 (caller must clamp if needed).
 *
 * Wave 1 policy (Aaron, 2026-05-03): positive boost only. Negative-impact
 * penalty multiplier is deferred to Wave 2.
 *
 * @param vectorCount  Number of change vectors observed for this category+skillId.
 * @param minVectors   Minimum vectors for baseline confidence. Defaults to 3.
 */
export function computeConfidenceBoost(vectorCount: number, minVectors: number = 3): number {
  if (vectorCount <= 0) return 1.0;
  return Math.log(1 + vectorCount) / Math.log(1 + minVectors);
}
