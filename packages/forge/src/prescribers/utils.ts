/**
 * Shared helpers for prescribers.
 *
 * Both the prompt and token optimizers need to snapshot the same metric
 * envelope onto every emitted hint (for provenance + downstream display),
 * so the snapshot builder lives here. Drift level is sourced from the
 * canonical `classifyDriftLevel()` helper instead of inlined thresholds —
 * one source of truth for GREEN/YELLOW/RED boundaries.
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
