/**
 * Prescriber-local types for the Phase 4.5/4.6 telemetry feedback loop.
 *
 * Determinism > Token Cost (Aaron's constraint): hint impact scoring favours
 * convergence and tool-determinism improvements over cost reduction.
 *
 * Phase 4.6 additions: {@link ChangeVectorSummary} for historical vector data
 * and `predictedImpact` on {@link OptimizationHint} for vector-informed ranking.
 */

import type { ExecutionProfile } from "../telemetry/types.js";

export type { ChangeVectorSummary } from "@akubly/types";

export interface OptimizationHint {
  id: string;
  source: "prompt-optimizer" | "token-optimizer";
  skillId: string;
  category: OptimizationCategory;
  description: string;
  recommendation: string;
  /** Estimated impact score (0–1, higher = more impactful). */
  impactScore: number;
  /** Confidence in the recommendation (0–1). Boosted by historical vectors when available. */
  confidence: number;
  /**
   * Predicted impact from historical change vectors (meanNetImpact for this category+skillId).
   * Present only when `historicalVectors` were supplied to the prescriber.
   */
  predictedImpact?: number;
  evidence: OptimizationEvidence;
  /** Provenance: which prescription generated this hint. */
  parentPrescriptionId?: string;
  metricSnapshot: MetricSnapshot;
  /** ISO-8601 timestamp. */
  generatedAt: string;
}

export type OptimizationCategory =
  | "prompt-structure"
  | "tool-guidance"
  | "context-management"
  | "cache-optimization"
  | "model-selection"
  | "convergence";

export interface OptimizationEvidence {
  profile: ExecutionProfile;
  triggerMetrics: Record<string, number>;
  baseline?: ExecutionProfile;
}

/** Metric snapshot for provenance tracking. */
export interface MetricSnapshot {
  driftScore: number;
  driftLevel: string;
  /** Cumulative total cost (nanoAIU) at snapshot time. Divide by sessionCount for per-session cost. */
  tokenCostNanoAiu: number;
  successRate: number;
  convergenceTurns: number;
  cacheHitRate: number;
  /**
   * profile.sessionCount at snapshot time — required for per-session cost delta in change vectors.
   * Optional for backward compatibility: snapshots stored before Phase 4.6 cycle 2 will lack
   * this field. The Curator's sweepChangeVectors handles absence by setting deltaCost = 0 and
   * incrementing legacyCostSkipped, flagging the hint as using legacy cost data incompatible
   * with per-session normalization. buildSnapshot() always populates this field for new hints.
   */
  sessionCount?: number;
}

export interface PrescriberResult {
  hints: OptimizationHint[];
  analysisTimeMs: number;
}
