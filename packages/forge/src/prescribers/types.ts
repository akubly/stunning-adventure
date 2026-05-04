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

/**
 * Aggregated change vector data for a category+skillId pair.
 * Produced by the Cairn Curator sweep and passed into prescribers
 * to boost confidence and surface predicted impact.
 */
export interface ChangeVectorSummary {
  category: OptimizationCategory;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  /** Log-scaled confidence boost — computed via `computeConfidenceBoost()`. */
  confidence: number;
}

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
  tokenCostNanoAiu: number;
  successRate: number;
  convergenceTurns: number;
  cacheHitRate: number;
}

export interface PrescriberResult {
  hints: OptimizationHint[];
  analysisTimeMs: number;
}
