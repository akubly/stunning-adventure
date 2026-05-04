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

/** Minimum observed vectors for baseline confidence saturation. Mirrored in cairn/changeVectors.ts — keep in sync. */
export const DEFAULT_MIN_SESSIONS = 3;

export function buildSnapshot(profile: ExecutionProfile): MetricSnapshot {
  return {
    driftScore: profile.drift.mean,
    driftLevel: classifyDriftLevel(profile.drift.mean),
    tokenCostNanoAiu: profile.tokens.totalCostNanoAiu,
    successRate: profile.outcomes.successRate,
    convergenceTurns: profile.outcomes.meanConvergenceTurns,
    cacheHitRate: profile.tokens.meanCacheHitRate,
    sessionCount: profile.sessionCount,
  };
}

/**
 * Log-scaled confidence boost based on the number of observed change vectors.
 *
 * Formula: `Math.max(1.0, log(1 + vectorCount) / log(1 + minVectors))`
 *
 * - `vectorCount === 0` → returns `1.0` (no boost; baseline confidence preserved).
 * - `0 < vectorCount < minVectors` → returns `1.0` (sparse evidence; clamp prevents penalty).
 * - `vectorCount === minVectors` → returns `1.0` (baseline saturation point).
 * - `vectorCount > minVectors` → returns > 1.0 (amplifies confidence).
 *
 * Returns 1.0 when no vectors OR sparse evidence; > 1.0 only when
 * vectorCount >= minVectors. Vectors can amplify confidence but never attenuate it.
 *
 * Wave 1 policy (Aaron, 2026-05-03): positive boost only. Negative-impact
 * penalty multiplier is deferred to Wave 2.
 *
 * @param vectorCount  Number of change vectors observed for this category+skillId.
 * @param minVectors   Minimum vectors for baseline confidence. Defaults to DEFAULT_MIN_SESSIONS.
 */
export function computeConfidenceBoost(vectorCount: number, minVectors: number = DEFAULT_MIN_SESSIONS): number {
  if (vectorCount <= 0) return 1.0;
  return Math.max(1.0, Math.log(1 + vectorCount) / Math.log(1 + minVectors));
}
