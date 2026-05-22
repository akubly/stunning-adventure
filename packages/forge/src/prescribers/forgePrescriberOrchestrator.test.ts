import {
  ATTENUATION_FLOOR,
  NEGATIVE_IMPACT_AUTO_APPLY_GATE,
  type ChangeVectorProvider,
  type ChangeVectorSummary,
  type ExecutionProfile,
} from "@akubly/types";
import { describe, expect, it, vi } from "vitest";
import { runForgePrescribers } from "./forgePrescriberOrchestrator.js";
import { DEFAULT_MIN_SESSIONS } from "./utils.js";

function makeProfile(overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  return {
    skillId: "skill-alpha",
    granularity: "per-skill",
    granularityKey: "global",
    sessionCount: 6,
    drift: { mean: 0.1, p50: 0.08, p95: 0.12, trend: "stable" },
    tokens: {
      meanInputTokens: 1_000,
      meanOutputTokens: 700,
      meanCacheHitRate: 0.1,
      totalCostNanoAiu: 12_000_000,
    },
    outcomes: {
      successRate: 0.9,
      meanConvergenceTurns: 12,
      toolErrorRate: 0.02,
    },
    signals: {
      convergence: 0.3,
      tokenPressure: 0.4,
      toolEntropy: 0.1,
      contextBloat: 0.2,
      promptStability: 0.8,
    },
    updatedAt: "2026-05-22T21:00:00.000Z",
    ...overrides,
  };
}

function makeSummary(
  category: ChangeVectorSummary["category"],
  overrides: Partial<ChangeVectorSummary> = {},
): ChangeVectorSummary {
  return {
    category,
    skillId: "skill-alpha",
    meanNetImpact: 0.4,
    vectorCount: 6,
    confidenceBoost: 1.4,
    autoApplyEligible: true,
    ...overrides,
  };
}

function findHint<T extends { category: string }>(hints: T[], category: string): T {
  const hint = hints.find((candidate) => candidate.category === category);
  expect(hint, `expected hint for category ${category}`).toBeDefined();
  return hint!;
}

describe("runForgePrescribers", () => {
  const maturePositiveBoost = Math.max(
    1,
    Math.log(1 + 6) / Math.log(1 + DEFAULT_MIN_SESSIONS),
  );
  const cases = [
    {
      name: "runs both prescribers in Phase 4.5 mode when provider is omitted",
      providerMode: "omit" as const,
      expectedMultiplier: 1,
      expectedAutoApplyEligible: undefined,
    },
    {
      name: "treats an empty provider result like no historical vectors",
      providerMode: "empty" as const,
      expectedMultiplier: 1,
      expectedAutoApplyEligible: undefined,
    },
    {
      name: "keeps sparse positive vectors neutral",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", { vectorCount: 2, confidenceBoost: 1.0 }),
        makeSummary("cache-optimization", { vectorCount: 2, confidenceBoost: 1.0 }),
      ],
      expectedMultiplier: 1,
      expectedAutoApplyEligible: true,
    },
    {
      name: "keeps sparse negative vectors neutral",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", {
          meanNetImpact: -0.5,
          vectorCount: 2,
          confidenceBoost: 0.2,
          autoApplyEligible: true,
        }),
        makeSummary("cache-optimization", {
          meanNetImpact: -0.5,
          vectorCount: 2,
          confidenceBoost: 0.2,
          autoApplyEligible: true,
        }),
      ],
      expectedMultiplier: 1,
      expectedAutoApplyEligible: true,
    },
    {
      name: "applies mature positive boost unchanged",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", { confidenceBoost: maturePositiveBoost }),
        makeSummary("cache-optimization", { confidenceBoost: maturePositiveBoost }),
      ],
      expectedMultiplier: maturePositiveBoost,
      expectedAutoApplyEligible: true,
    },
    {
      name: "does not attenuate mildly negative mature vectors above the gate",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", {
          meanNetImpact: -0.1,
          confidenceBoost: 0.9,
          autoApplyEligible: true,
        }),
        makeSummary("cache-optimization", {
          meanNetImpact: -0.1,
          confidenceBoost: 0.9,
          autoApplyEligible: true,
        }),
      ],
      expectedMultiplier: 1,
      expectedAutoApplyEligible: true,
    },
    {
      name: "treats the gate boundary as blocked for auto-apply",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", {
          meanNetImpact: NEGATIVE_IMPACT_AUTO_APPLY_GATE,
          confidenceBoost: 0.8,
          autoApplyEligible: false,
        }),
        makeSummary("cache-optimization", {
          meanNetImpact: NEGATIVE_IMPACT_AUTO_APPLY_GATE,
          confidenceBoost: 0.8,
          autoApplyEligible: false,
        }),
      ],
      expectedMultiplier: 0.8,
      expectedAutoApplyEligible: false,
    },
    {
      name: "attenuates mature vectors below the gate and blocks auto-apply",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", {
          meanNetImpact: -0.5,
          confidenceBoost: 0.9,
          autoApplyEligible: false,
        }),
        makeSummary("cache-optimization", {
          meanNetImpact: -0.5,
          confidenceBoost: 0.9,
          autoApplyEligible: false,
        }),
      ],
      expectedMultiplier: 0.5,
      expectedAutoApplyEligible: false,
    },
    {
      name: "floors catastrophic mature vectors and blocks auto-apply",
      providerMode: "vectors" as const,
      vectors: [
        makeSummary("convergence", {
          meanNetImpact: -0.95,
          confidenceBoost: 0.7,
          autoApplyEligible: false,
        }),
        makeSummary("cache-optimization", {
          meanNetImpact: -0.95,
          confidenceBoost: 0.7,
          autoApplyEligible: false,
        }),
      ],
      expectedMultiplier: ATTENUATION_FLOOR,
      expectedAutoApplyEligible: false,
    },
  ];

  it("falls back to Phase 4.5 mode when the provider throws", async () => {
    const profile = makeProfile();
    const baselineHints = await runForgePrescribers(profile, profile.skillId);
    const provider = {
      getSummaries: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    } satisfies ChangeVectorProvider;

    const result = await runForgePrescribers(profile, profile.skillId, { provider });

    expect(provider.getSummaries).toHaveBeenCalledOnce();
    expect(result).toHaveLength(baselineHints.length);

    for (const category of ["convergence", "cache-optimization"] as const) {
      const baselineHint = findHint(baselineHints, category);
      const resultHint = findHint(result, category);
      expect(resultHint.confidence).toBeCloseTo(baselineHint.confidence, 10);
      expect(resultHint.predictedImpact).toBeUndefined();
      expect(resultHint.autoApplyEligible).toBeUndefined();
      expect(resultHint.evidence.autoApplyEligible).toBeUndefined();
    }
  });

  it.each(cases)("$name", async (testCase) => {
    const profile = makeProfile();
    const baselineHints = await runForgePrescribers(profile, profile.skillId);
    const baselineConvergence = findHint(baselineHints, "convergence");
    const baselineCache = findHint(baselineHints, "cache-optimization");

    const provider =
      testCase.providerMode === "omit"
        ? undefined
        : ({
            getSummaries: vi.fn().mockResolvedValue(testCase.vectors ?? []),
          } satisfies ChangeVectorProvider);

    const result = await runForgePrescribers(profile, profile.skillId, {
      provider,
    });

    if (provider) {
      expect(provider.getSummaries).toHaveBeenCalledOnce();
      expect(provider.getSummaries).toHaveBeenCalledWith(profile.skillId);
    }

    expect(result).toHaveLength(baselineHints.length);
    expect(new Set(result.map((hint) => hint.source))).toEqual(
      new Set(["prompt-optimizer", "token-optimizer"]),
    );

    const convergence = findHint(result, "convergence");
    const cacheOptimization = findHint(result, "cache-optimization");

    expect(convergence.confidence).toBeCloseTo(
      Math.min(1, baselineConvergence.confidence * testCase.expectedMultiplier),
      10,
    );
    expect(cacheOptimization.confidence).toBeCloseTo(
      Math.min(1, baselineCache.confidence * testCase.expectedMultiplier),
      10,
    );

    if (testCase.expectedAutoApplyEligible === undefined) {
      expect(convergence.autoApplyEligible).toBeUndefined();
      expect(cacheOptimization.autoApplyEligible).toBeUndefined();
      expect(convergence.evidence.autoApplyEligible).toBeUndefined();
      expect(cacheOptimization.evidence.autoApplyEligible).toBeUndefined();
    } else {
      expect(convergence.autoApplyEligible).toBe(testCase.expectedAutoApplyEligible);
      expect(cacheOptimization.autoApplyEligible).toBe(
        testCase.expectedAutoApplyEligible,
      );
      expect(convergence.evidence.autoApplyEligible).toBe(
        testCase.expectedAutoApplyEligible,
      );
      expect(cacheOptimization.evidence.autoApplyEligible).toBe(
        testCase.expectedAutoApplyEligible,
      );
    }
  });
});
