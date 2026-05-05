/**
 * Prescriber-local types for the Phase 4.5 telemetry feedback loop.
 *
 * Determinism > Token Cost (Aaron's constraint): hint impact scoring favours
 * convergence and tool-determinism improvements over cost reduction.
 */

import type { ExecutionProfile } from "../telemetry/types.js";

export interface OptimizationHint {
  id: string;
  source: "prompt-optimizer" | "token-optimizer";
  skillId: string;
  category: OptimizationCategory;
  description: string;
  recommendation: string;
  /** Estimated impact score (0–1, higher = more impactful). */
  impactScore: number;
  /** Confidence in the recommendation (0–1). */
  confidence: number;
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
