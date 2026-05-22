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

import {
  ATTENUATION_FLOOR,
  NEGATIVE_IMPACT_AUTO_APPLY_GATE,
} from "@akubly/types";
import { classifyDriftLevel } from "../telemetry/drift.js";
import type { ExecutionProfile } from "../telemetry/types.js";
import type {
  ChangeVectorSummary,
  MetricSnapshot,
  OptimizationHint,
} from "./types.js";

/** Minimum observed vectors for baseline confidence saturation. Mirrored in packages/cairn/src/db/changeVectors.ts — keep in sync. */
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
 * Confidence multiplier derived from historical change vectors.
 *
 * When `meanNetImpact` is omitted (or non-negative), the Wave 1 log-scaled boost
 * applies unchanged. Negative impacts stay neutral until evidence is mature and
 * falls strictly below `NEGATIVE_IMPACT_AUTO_APPLY_GATE`, at which point the
 * multiplier attenuates to `max(ATTENUATION_FLOOR, 1 + meanNetImpact)`.
 */
export function computeConfidenceBoost(
  vectorCount: number,
  minVectors: number = DEFAULT_MIN_SESSIONS,
  meanNetImpact?: number,
): number {
  if (vectorCount <= 0) return 1.0;

  const safeMin = Math.max(1, minVectors);
  if (meanNetImpact === undefined || meanNetImpact >= 0) {
    return Math.max(1.0, Math.log(1 + vectorCount) / Math.log(1 + safeMin));
  }

  if (vectorCount < safeMin || meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE) {
    return 1.0;
  }

  return Math.max(ATTENUATION_FLOOR, 1.0 + meanNetImpact);
}

export function computeAutoApplyEligible(
  vectorCount: number,
  meanNetImpact: number,
  minVectors: number = DEFAULT_MIN_SESSIONS,
): boolean {
  const safeMin = Math.max(1, minVectors);
  return vectorCount < safeMin || meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE;
}

export function applyHistoricalVectors(
  hints: OptimizationHint[],
  historicalVectors?: ChangeVectorSummary[],
  minVectors: number = DEFAULT_MIN_SESSIONS,
): OptimizationHint[] {
  if (!historicalVectors?.length) {
    return hints;
  }

  for (const hint of hints) {
    const summary = historicalVectors.find(
      (vector) => vector.category === hint.category && vector.skillId === hint.skillId,
    );
    if (!summary) {
      continue;
    }

    const autoApplyEligible =
      summary.autoApplyEligible ??
      computeAutoApplyEligible(summary.vectorCount, summary.meanNetImpact, minVectors);
    const confidenceBoost =
      summary.meanNetImpact >= 0
        ? summary.confidenceBoost
        : computeConfidenceBoost(summary.vectorCount, minVectors, summary.meanNetImpact);

    hint.confidence = Math.min(1, hint.confidence * confidenceBoost);
    hint.predictedImpact = summary.meanNetImpact;
    hint.autoApplyEligible = autoApplyEligible;
    hint.evidence = {
      ...hint.evidence,
      autoApplyEligible,
    };
  }

  return applyHistoricalVectorOrdering(hints);
}

/**
 * Apply historical-vector-informed two-tier ordering to a hint list.
 * Hints with matching ChangeVectorSummary (predictedImpact assigned) come first,
 * sorted by predictedImpact desc. Unmatched hints follow in their original
 * impactScore-desc order.
 *
 * Pure function — does not mutate input.
 */
export function applyHistoricalVectorOrdering(hints: OptimizationHint[]): OptimizationHint[] {
  const matched = hints.filter((h) => h.predictedImpact !== undefined);
  const unmatched = hints.filter((h) => h.predictedImpact === undefined);
  matched.sort((a, b) => (b.predictedImpact ?? 0) - (a.predictedImpact ?? 0));
  unmatched.sort((a, b) => b.impactScore - a.impactScore);
  return [...matched, ...unmatched];
}
