/**
 * Token efficiency prescriber.
 *
 * Secondary to {@link analyzePromptOptimizations}: only runs when drift is
 * acceptable (mean < 0.3). Aaron's rule — fix determinism before chasing
 * cost.
 */

import { randomUUID } from "node:crypto";
import type { ExecutionProfile } from "../telemetry/types.js";
import type { OptimizationHint, PrescriberResult } from "./types.js";
import { buildSnapshot } from "./utils.js";

export interface TokenOptimizerConfig {
  /** Minimum sessions before prescribing. Default: 5. */
  minSessions?: number;
  /** Cache hit rate threshold below which to prescribe. Default: 0.3. */
  cacheHitThreshold?: number;
  /** Cost per session threshold (nanoAIU). Default: 1_000_000. */
  costThreshold?: number;
  /** Drift gate — only optimize tokens when drift mean is strictly below this. Default: 0.3. */
  driftGate?: number;
}

export function analyzeTokenOptimizations(
  profile: ExecutionProfile,
  config?: TokenOptimizerConfig,
): PrescriberResult {
  const startTime = Date.now();
  const hints: OptimizationHint[] = [];
  const minSessions = config?.minSessions ?? 5;
  const cacheThreshold = config?.cacheHitThreshold ?? 0.3;
  const costThreshold = config?.costThreshold ?? 1_000_000;
  const driftGate = config?.driftGate ?? 0.3;

  if (profile.sessionCount < minSessions) {
    return { hints, analysisTimeMs: Date.now() - startTime };
  }

  // Determinism gate — don't optimize tokens when drift is RED.
  if (profile.drift.mean >= driftGate) {
    return { hints, analysisTimeMs: Date.now() - startTime };
  }

  const snapshot = buildSnapshot(profile);
  const generatedAt = new Date().toISOString();

  // 1. Low cache hit rate
  if (profile.tokens.meanCacheHitRate < cacheThreshold) {
    hints.push({
      id: randomUUID(),
      source: "token-optimizer",
      skillId: profile.skillId,
      category: "cache-optimization",
      description: `Low cache hit rate (${(profile.tokens.meanCacheHitRate * 100).toFixed(1)}%)`,
      recommendation:
        "Stabilize prompt prefix. Move volatile content to end of prompt. Add cacheable_tools frontmatter.",
      impactScore: 0.6,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: {
        profile,
        triggerMetrics: { cacheHitRate: profile.tokens.meanCacheHitRate },
      },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  // 2. High cost per session
  const costPerSession = profile.tokens.totalCostNanoAiu / profile.sessionCount;
  if (costPerSession > costThreshold) {
    hints.push({
      id: randomUUID(),
      source: "token-optimizer",
      skillId: profile.skillId,
      category: "model-selection",
      description: `High cost per session (${costPerSession.toFixed(0)} nanoAIU)`,
      recommendation:
        "Consider model downgrade for routine tasks. Use budget-aware strategy with tighter limits.",
      impactScore: 0.5,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: { profile, triggerMetrics: { costPerSession } },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  // 3. High output-to-input ratio (verbose responses)
  const outputRatio =
    profile.tokens.meanOutputTokens / Math.max(profile.tokens.meanInputTokens, 1);
  if (outputRatio > 0.5) {
    hints.push({
      id: randomUUID(),
      source: "token-optimizer",
      skillId: profile.skillId,
      category: "context-management",
      description: `High output/input ratio (${(outputRatio * 100).toFixed(1)}%)`,
      recommendation:
        "Add output format constraints. Use 'respond concisely' and structured output directives.",
      impactScore: 0.4,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: { profile, triggerMetrics: { outputRatio } },
      metricSnapshot: snapshot,
      generatedAt,
    });
  }

  return { hints, analysisTimeMs: Date.now() - startTime };
}

