import { describe, expect, it } from "vitest";
import type {
  ChangeVectorSummary as CanonicalChangeVectorSummary,
  ExecutionProfile,
} from "@akubly/types";
import {
  analyzePromptOptimizations,
  type ChangeVectorSummary as PrescriberChangeVectorSummary,
} from "./index.js";

function makePromptProfile(
  overrides: Partial<ExecutionProfile> = {},
): ExecutionProfile {
  return {
    skillId: "skill-alpha",
    granularity: "per-skill",
    granularityKey: "global",
    sessionCount: 10,
    drift: { mean: 0.1, p50: 0.08, p95: 0.15, trend: "stable" },
    tokens: {
      meanInputTokens: 2_000,
      meanOutputTokens: 400,
      meanCacheHitRate: 0.6,
      totalCostNanoAiu: 120_000,
    },
    outcomes: {
      successRate: 0.9,
      meanConvergenceTurns: 12,
      toolErrorRate: 0.02,
    },
    signals: {
      convergence: 0.3,
      tokenPressure: 0.2,
      toolEntropy: 0.1,
      contextBloat: 0.1,
      promptStability: 0.8,
    },
    updatedAt: "2026-05-22T20:30:00.000Z",
    ...overrides,
  };
}

describe("prescriber ChangeVectorSummary contract", () => {
  it("re-exports the canonical ChangeVectorSummary type", () => {
    const canonical: CanonicalChangeVectorSummary = {
      category: "convergence",
      skillId: "skill-alpha",
      meanNetImpact: -0.5,
      vectorCount: 6,
      confidenceBoost: 0.5,
      autoApplyEligible: false,
    };

    const fromPrescribers: PrescriberChangeVectorSummary = canonical;
    const roundTrip: CanonicalChangeVectorSummary = fromPrescribers;

    expect(roundTrip).toEqual(canonical);
  });

  it("accepts canonical summaries and propagates auto-apply metadata onto prompt hints", () => {
    const profile = makePromptProfile();
    const vectors: CanonicalChangeVectorSummary[] = [
      {
        category: "convergence",
        skillId: profile.skillId,
        meanNetImpact: -0.5,
        vectorCount: 6,
        confidenceBoost: 0.5,
        autoApplyEligible: false,
      },
    ];

    const result = analyzePromptOptimizations(profile, undefined, vectors);

    expect(result.hints).toHaveLength(1);
    expect(result.hints[0]).toMatchObject({
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "convergence",
      description: "High convergence turns (mean: 12.0)",
      recommendation: "Add explicit completion criteria to skill prompt. Include 'done when' clause.",
      impactScore: 0.8,
      confidence: 0.5,
      predictedImpact: -0.5,
      autoApplyEligible: false,
      evidence: {
        triggerMetrics: { convergenceTurns: 12 },
        autoApplyEligible: false,
      },
      metricSnapshot: {
        driftScore: 0.1,
        driftLevel: expect.any(String),
        tokenCostNanoAiu: 120_000,
        successRate: 0.9,
        convergenceTurns: 12,
        cacheHitRate: 0.6,
        sessionCount: 10,
      },
    });
    expect(typeof result.hints[0]?.id).toBe("string");
    expect(typeof result.hints[0]?.generatedAt).toBe("string");
  });
});
