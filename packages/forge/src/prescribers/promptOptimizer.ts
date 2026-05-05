/**
 * Prompt optimization prescriber.
 *
 * Priority: Determinism > Token Cost (Aaron's constraint). Convergence and
 * tool-entropy issues outrank context bloat in impact scoring.
 */

import { randomUUID } from "node:crypto";
import type { ExecutionProfile } from "../telemetry/types.js";
import type { OptimizationHint, PrescriberResult } from "./types.js";
import { buildSnapshot } from "./utils.js";

export interface PromptOptimizerConfig {
  /** Minimum sessions before prescribing. Default: 3. */
  minSessions?: number;
  /** Drift threshold to trigger prompt prescriptions. Default: 0.2 (YELLOW). */
  driftThreshold?: number;
  /**
   * Tool entropy threshold against `profile.signals.toolEntropy` (0–1).
   * Default: 0.5. Falls back to `profile.drift.p95` for legacy profiles
   * that have not yet been re-aggregated with the signal breakdown.
   */
  toolEntropyThreshold?: number;
}

export function analyzePromptOptimizations(
  profile: ExecutionProfile,
  config?: PromptOptimizerConfig,
): PrescriberResult {
  const startTime = Date.now();
  const hints: OptimizationHint[] = [];
  const minSessions = config?.minSessions ?? 3;
  const driftThreshold = config?.driftThreshold ?? 0.2;
  const entropyThreshold = config?.toolEntropyThreshold ?? 0.5;

  if (profile.sessionCount < minSessions) {
    return { hints, analysisTimeMs: Date.now() - startTime };
  }

  const snapshot = buildSnapshot(profile);
  const generatedAt = new Date().toISOString();

  // 1. HIGH PRIORITY — convergence (determinism)
  if (profile.outcomes.meanConvergenceTurns > 10) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "convergence",
      description: `High convergence turns (mean: ${profile.outcomes.meanConvergenceTurns.toFixed(1)})`,
      recommendation:
        "Add explicit completion criteria to skill prompt. Include 'done when' clause.",
      impactScore: 0.8,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: {
        profile,
        triggerMetrics: { convergenceTurns: profile.outcomes.meanConvergenceTurns },
      },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  // 2. HIGH PRIORITY — drift above threshold (determinism)
  if (profile.drift.mean > driftThreshold) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "prompt-structure",
      description: `Drift score above threshold (mean: ${profile.drift.mean.toFixed(3)}, threshold: ${driftThreshold})`,
      recommendation:
        "Restructure prompt with numbered steps and explicit constraints. Reduce ambiguity in tool selection guidance.",
      impactScore: 0.7,
      confidence: Math.min(1, profile.sessionCount / 5),
      evidence: {
        profile,
        triggerMetrics: { driftMean: profile.drift.mean, driftP95: profile.drift.p95 },
      },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  // 3. MEDIUM PRIORITY — tool entropy (determinism)
  // Prefer the dedicated signal component when present; fall back to the
  // composite p95 only for legacy profiles aggregated before the signal
  // breakdown was tracked.
  const toolEntropy = profile.signals?.toolEntropy ?? profile.drift.p95;
  if (toolEntropy > entropyThreshold) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "tool-guidance",
      description: `High tool entropy (${toolEntropy.toFixed(3)})`,
      recommendation:
        "Add explicit tool preference order in skill. Use 'prefer X over Y when Z' clauses.",
      impactScore: 0.6,
      confidence: Math.min(1, profile.sessionCount / 5),
      evidence: { profile, triggerMetrics: { toolEntropy } },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  // 4. LOWER PRIORITY — context bloat (efficiency)
  if (profile.tokens.meanInputTokens > 50_000) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "context-management",
      description: `High mean input tokens (${profile.tokens.meanInputTokens.toFixed(0)})`,
      recommendation:
        "Add context pruning hints. Use progressive disclosure — reference summaries, not full content.",
      impactScore: 0.5,
      confidence: Math.min(1, profile.sessionCount / 5),
      evidence: {
        profile,
        triggerMetrics: { meanInputTokens: profile.tokens.meanInputTokens },
      },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  return { hints, analysisTimeMs: Date.now() - startTime };
}

