/**
 * Prescribers + applier unit tests.
 *
 * Three flavours, per spec §9 success criteria:
 *  - Mechanism: each prescriber/applier branch fires under expected inputs.
 *  - Determinism: identical profile in → identical hint set out (modulo IDs
 *    and timestamps); applier is order-stable.
 *  - Metamorphic: monotonic relationships hold (worse profile → ≥ as many
 *    hints; cost-only deltas don't add hints when drift is RED).
 */

import { describe, it, expect } from "vitest";
import {
  analyzePromptOptimizations,
  analyzeTokenOptimizations,
} from "../prescribers/index.js";
import type { OptimizationHint, PrescriberResult } from "../prescribers/index.js";
import {
  DEFAULT_STRATEGY_PARAMS,
  DEFAULT_BUDGET_LIMIT_NANO_AIU,
  applyOptimizations,
  tuneParameters,
} from "../applier/index.js";
import type { StrategyParameters, TuneContext } from "../applier/index.js";
import type { ExecutionProfile } from "../telemetry/types.js";

// ---------------------------------------------------------------------------
// Profile factory
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
  return {
    skillId: "skill-test",
    granularity: "per-skill",
    granularityKey: "global",
    sessionCount: 10,
    drift: { mean: 0.05, p50: 0.04, p95: 0.1, trend: "stable" },
    tokens: {
      meanInputTokens: 5_000,
      meanOutputTokens: 1_000,
      meanCacheHitRate: 0.6,
      totalCostNanoAiu: 100_000,
    },
    outcomes: {
      successRate: 0.9,
      meanConvergenceTurns: 4,
      toolErrorRate: 0.02,
    },
    updatedAt: "2026-05-02T12:00:00.000Z",
    ...overrides,
  };
}

function makeHint(overrides: Partial<OptimizationHint> = {}): OptimizationHint {
  const profile = makeProfile();
  return {
    id: "hint-default",
    source: "prompt-optimizer",
    skillId: "skill-test",
    category: "prompt-structure",
    description: "test hint",
    recommendation: "do the thing",
    impactScore: 0.5,
    confidence: 0.9,
    evidence: { profile, triggerMetrics: {} },
    metricSnapshot: {
      driftScore: 0.05,
      driftLevel: "GREEN",
      tokenCostNanoAiu: 100_000,
      successRate: 0.9,
      convergenceTurns: 4,
      cacheHitRate: 0.6,
    },
    generatedAt: "2026-05-02T12:00:00.000Z",
    ...overrides,
  };
}

// Strip nondeterministic fields so we can compare hint shape.
function shape(result: PrescriberResult): unknown[] {
  return result.hints
    .map((h) => ({
      source: h.source,
      skillId: h.skillId,
      category: h.category,
      description: h.description,
      recommendation: h.recommendation,
      impactScore: h.impactScore,
      confidence: h.confidence,
      triggerMetrics: h.evidence.triggerMetrics,
      metricSnapshot: h.metricSnapshot,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

// ---------------------------------------------------------------------------
// Prompt optimizer — mechanism
// ---------------------------------------------------------------------------

describe("analyzePromptOptimizations — mechanism", () => {
  it("produces no hints when below minSessions", () => {
    const result = analyzePromptOptimizations(makeProfile({ sessionCount: 1 }));
    expect(result.hints).toEqual([]);
  });

  it("emits a convergence hint when meanConvergenceTurns > 10", () => {
    const result = analyzePromptOptimizations(
      makeProfile({ outcomes: { successRate: 0.9, meanConvergenceTurns: 15, toolErrorRate: 0 } }),
    );
    expect(result.hints.some((h) => h.category === "convergence")).toBe(true);
  });

  it("emits a prompt-structure hint when drift.mean exceeds threshold", () => {
    const result = analyzePromptOptimizations(
      makeProfile({ drift: { mean: 0.4, p50: 0.3, p95: 0.45, trend: "degrading" } }),
    );
    expect(result.hints.some((h) => h.category === "prompt-structure")).toBe(true);
  });

  it("emits a tool-guidance hint when drift.p95 exceeds entropy threshold", () => {
    const result = analyzePromptOptimizations(
      makeProfile({ drift: { mean: 0.05, p50: 0.05, p95: 0.8, trend: "stable" } }),
    );
    expect(result.hints.some((h) => h.category === "tool-guidance")).toBe(true);
  });

  it("emits a context-management hint when meanInputTokens > 50k", () => {
    const result = analyzePromptOptimizations(
      makeProfile({
        tokens: {
          meanInputTokens: 80_000,
          meanOutputTokens: 1_000,
          meanCacheHitRate: 0.6,
          totalCostNanoAiu: 100_000,
        },
      }),
    );
    expect(result.hints.some((h) => h.category === "context-management")).toBe(true);
  });

  it("ranks convergence above context-management by impact score", () => {
    const profile = makeProfile({
      outcomes: { successRate: 0.9, meanConvergenceTurns: 20, toolErrorRate: 0 },
      tokens: {
        meanInputTokens: 80_000,
        meanOutputTokens: 1_000,
        meanCacheHitRate: 0.6,
        totalCostNanoAiu: 100_000,
      },
    });
    const result = analyzePromptOptimizations(profile);
    const conv = result.hints.find((h) => h.category === "convergence")!;
    const ctx = result.hints.find((h) => h.category === "context-management")!;
    expect(conv.impactScore).toBeGreaterThan(ctx.impactScore);
  });
});

// ---------------------------------------------------------------------------
// Prompt optimizer — determinism
// ---------------------------------------------------------------------------

describe("analyzePromptOptimizations — determinism", () => {
  it("produces the same hint shape for identical inputs", () => {
    const profile = makeProfile({
      sessionCount: 8,
      drift: { mean: 0.4, p50: 0.3, p95: 0.6, trend: "degrading" },
      outcomes: { successRate: 0.6, meanConvergenceTurns: 12, toolErrorRate: 0.1 },
    });
    const a = analyzePromptOptimizations(profile);
    const b = analyzePromptOptimizations(profile);
    expect(shape(a)).toEqual(shape(b));
    expect(a.hints.length).toBe(b.hints.length);
  });
});

// ---------------------------------------------------------------------------
// Prompt optimizer — metamorphic
// ---------------------------------------------------------------------------

describe("analyzePromptOptimizations — metamorphic", () => {
  it("worse drift never reduces hint count", () => {
    const base = makeProfile({ drift: { mean: 0.1, p50: 0.1, p95: 0.2, trend: "stable" } });
    const worse = { ...base, drift: { mean: 0.5, p50: 0.4, p95: 0.7, trend: "degrading" as const } };
    const baseHints = analyzePromptOptimizations(base).hints.length;
    const worseHints = analyzePromptOptimizations(worse).hints.length;
    expect(worseHints).toBeGreaterThanOrEqual(baseHints);
  });

  it("higher session count never decreases confidence", () => {
    const small = makeProfile({
      sessionCount: 5,
      outcomes: { successRate: 0.5, meanConvergenceTurns: 15, toolErrorRate: 0.2 },
    });
    const large = { ...small, sessionCount: 50 };
    const smallConv = analyzePromptOptimizations(small).hints.find(
      (h) => h.category === "convergence",
    )!;
    const largeConv = analyzePromptOptimizations(large).hints.find(
      (h) => h.category === "convergence",
    )!;
    expect(largeConv.confidence).toBeGreaterThanOrEqual(smallConv.confidence);
  });
});

// ---------------------------------------------------------------------------
// Token optimizer — mechanism + drift gate
// ---------------------------------------------------------------------------

describe("analyzeTokenOptimizations — mechanism", () => {
  it("returns no hints when below minSessions", () => {
    const result = analyzeTokenOptimizations(makeProfile({ sessionCount: 2 }));
    expect(result.hints).toEqual([]);
  });

  it("returns no hints when drift is RED (≥ 0.3)", () => {
    const result = analyzeTokenOptimizations(
      makeProfile({
        drift: { mean: 0.4, p50: 0.3, p95: 0.5, trend: "degrading" },
        tokens: {
          meanInputTokens: 1_000,
          meanOutputTokens: 5_000,
          meanCacheHitRate: 0.05,
          totalCostNanoAiu: 50_000_000,
        },
      }),
    );
    expect(result.hints).toEqual([]);
  });

  it("emits cache-optimization hint when cache hit rate is low", () => {
    const result = analyzeTokenOptimizations(
      makeProfile({
        tokens: {
          meanInputTokens: 1_000,
          meanOutputTokens: 100,
          meanCacheHitRate: 0.1,
          totalCostNanoAiu: 100_000,
        },
      }),
    );
    expect(result.hints.some((h) => h.category === "cache-optimization")).toBe(true);
  });

  it("emits model-selection hint when cost per session exceeds threshold", () => {
    const result = analyzeTokenOptimizations(
      makeProfile({
        sessionCount: 10,
        tokens: {
          meanInputTokens: 1_000,
          meanOutputTokens: 100,
          meanCacheHitRate: 0.6,
          totalCostNanoAiu: 50_000_000,
        },
      }),
    );
    expect(result.hints.some((h) => h.category === "model-selection")).toBe(true);
  });

  it("emits context-management hint when output/input ratio is high", () => {
    const result = analyzeTokenOptimizations(
      makeProfile({
        tokens: {
          meanInputTokens: 1_000,
          meanOutputTokens: 800,
          meanCacheHitRate: 0.6,
          totalCostNanoAiu: 100_000,
        },
      }),
    );
    expect(result.hints.some((h) => h.category === "context-management")).toBe(true);
  });
});

describe("analyzeTokenOptimizations — determinism + metamorphic", () => {
  const profile = makeProfile({
    sessionCount: 20,
    tokens: {
      meanInputTokens: 1_000,
      meanOutputTokens: 800,
      meanCacheHitRate: 0.05,
      totalCostNanoAiu: 50_000_000,
    },
  });

  it("identical profile in → identical hint shape out", () => {
    expect(shape(analyzeTokenOptimizations(profile))).toEqual(
      shape(analyzeTokenOptimizations(profile)),
    );
  });

  it("crossing into RED drift suppresses all token hints (Determinism > Cost)", () => {
    const greenHints = analyzeTokenOptimizations(profile).hints.length;
    expect(greenHints).toBeGreaterThan(0);
    const red = { ...profile, drift: { mean: 0.35, p50: 0.3, p95: 0.5, trend: "degrading" as const } };
    expect(analyzeTokenOptimizations(red).hints).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Applier — mechanism, determinism, frontmatter shape
// ---------------------------------------------------------------------------

describe("applyOptimizations — mechanism", () => {
  it("skips hints below the confidence threshold", () => {
    const result = applyOptimizations([
      makeHint({ id: "low", confidence: 0.5 }),
      makeHint({ id: "high", confidence: 0.9 }),
    ]);
    expect(result.applied.map((a) => a.hintId)).toEqual(["high"]);
    expect(result.skipped.map((s) => s.hintId)).toEqual(["low"]);
  });

  it("caps applied hints at maxHintsPerCycle", () => {
    const hints = Array.from({ length: 8 }, (_, i) =>
      makeHint({ id: `h${i}`, impactScore: 0.5 - i * 0.01 }),
    );
    const result = applyOptimizations(hints, { maxHintsPerCycle: 3 });
    expect(result.applied).toHaveLength(3);
    expect(result.skipped).toHaveLength(5);
    for (const s of result.skipped) {
      expect(s.reason).toMatch(/max hints per cycle/);
    }
  });

  it("routes cache-optimization hints into cacheableTools and others into optimizationHints", () => {
    const profile = makeProfile();
    const result = applyOptimizations(
      [
        makeHint({
          id: "cache",
          category: "cache-optimization",
          evidence: {
            profile,
            triggerMetrics: { "tool:grep": 1, "tool:view": 1, cacheHitRate: 0.1 },
          },
        }),
        makeHint({ id: "struct", category: "prompt-structure" }),
      ],
      { now: () => new Date("2026-05-02T15:00:00Z") },
    );
    expect(result.frontmatterPatch.cacheableTools).toEqual(["grep", "view"]);
    expect(result.frontmatterPatch.optimizationHints).toHaveLength(1);
    expect(result.frontmatterPatch.optimizationHints![0]).toMatchObject({
      category: "prompt-structure",
      appliedAt: "2026-05-02T15:00:00.000Z",
    });
  });
});

describe("applyOptimizations — determinism", () => {
  it("is order-independent: same hints in any order → same applied set", () => {
    const a = makeHint({ id: "a", impactScore: 0.7, category: "convergence" });
    const b = makeHint({ id: "b", impactScore: 0.5, category: "tool-guidance" });
    const c = makeHint({ id: "c", impactScore: 0.6, category: "prompt-structure" });
    const fixedNow = () => new Date("2026-05-02T15:00:00Z");
    const r1 = applyOptimizations([a, b, c], { now: fixedNow });
    const r2 = applyOptimizations([c, b, a], { now: fixedNow });
    expect(r1.applied.map((x) => x.hintId)).toEqual(r2.applied.map((x) => x.hintId));
    expect(r1.frontmatterPatch).toEqual(r2.frontmatterPatch);
  });

  it("orders applied hints by impact score descending", () => {
    const result = applyOptimizations([
      makeHint({ id: "low", impactScore: 0.4 }),
      makeHint({ id: "high", impactScore: 0.9 }),
      makeHint({ id: "mid", impactScore: 0.6 }),
    ]);
    expect(result.applied.map((a) => a.hintId)).toEqual(["high", "mid", "low"]);
  });
});

// ---------------------------------------------------------------------------
// Self-tuning — mechanism, bounds, exploration floor
// ---------------------------------------------------------------------------

describe("tuneParameters", () => {
  const baseline: StrategyParameters = { ...DEFAULT_STRATEGY_PARAMS };

  it("never lowers explorationBudget below the floor (Aaron's directive)", () => {
    const tiny: StrategyParameters = { ...baseline, explorationBudget: 0.05 };
    const tuned = tuneParameters(tiny, makeProfile());
    expect(tuned.explorationBudget).toBeGreaterThanOrEqual(0.15);
  });

  it("tightens contextPressureLimit when drift mean is high", () => {
    const tuned = tuneParameters(
      baseline,
      makeProfile({ drift: { mean: 0.4, p50: 0.3, p95: 0.5, trend: "degrading" } }),
    );
    expect(tuned.contextPressureLimit).toBeLessThan(baseline.contextPressureLimit);
  });

  it("relaxes contextPressureLimit when drift mean is very low", () => {
    const tuned = tuneParameters(
      baseline,
      makeProfile({ drift: { mean: 0.01, p50: 0.01, p95: 0.02, trend: "improving" } }),
    );
    expect(tuned.contextPressureLimit).toBeGreaterThan(baseline.contextPressureLimit);
  });

  it("reduces maxModelSwitches when success rate is low", () => {
    const tuned = tuneParameters(
      baseline,
      makeProfile({ outcomes: { successRate: 0.5, meanConvergenceTurns: 5, toolErrorRate: 0.3 } }),
    );
    expect(tuned.maxModelSwitches).toBeLessThan(baseline.maxModelSwitches);
  });

  it("clamps all parameters within documented bounds", () => {
    const extreme: StrategyParameters = {
      budgetThreshold: 0.94,
      contextPressureLimit: 0.89,
      maxModelSwitches: 10,
      explorationBudget: 1,
    };
    const tuned = tuneParameters(
      extreme,
      makeProfile({ outcomes: { successRate: 0.99, meanConvergenceTurns: 2, toolErrorRate: 0 } }),
    );
    expect(tuned.budgetThreshold).toBeLessThanOrEqual(0.95);
    expect(tuned.contextPressureLimit).toBeLessThanOrEqual(0.9);
    expect(tuned.maxModelSwitches).toBeLessThanOrEqual(10);
  });

  it("is deterministic: same inputs → same outputs", () => {
    const profile = makeProfile({
      drift: { mean: 0.25, p50: 0.2, p95: 0.4, trend: "stable" },
      outcomes: { successRate: 0.85, meanConvergenceTurns: 6, toolErrorRate: 0.05 },
    });
    expect(tuneParameters(baseline, profile)).toEqual(tuneParameters(baseline, profile));
  });

  // F3 — tokenPressure must be normalized against budgetLimitNanoAiu so the
  // budget knob can both tighten *and* relax instead of always relaxing.
  it("tightens budgetThreshold when cost-per-session approaches the budget limit", () => {
    const ctx: TuneContext = { budgetLimitNanoAiu: 1_000_000 };
    // costPerSession = 950_000, tokenPressure = 0.95 > default 0.8 → tighten.
    const hot = makeProfile({
      sessionCount: 10,
      tokens: {
        meanInputTokens: 5_000,
        meanOutputTokens: 1_000,
        meanCacheHitRate: 0.6,
        totalCostNanoAiu: 9_500_000,
      },
    });
    const tuned = tuneParameters(baseline, hot, ctx);
    expect(tuned.budgetThreshold).toBeLessThan(baseline.budgetThreshold);
  });

  it("relaxes budgetThreshold only when cost-per-session is well below the limit", () => {
    const ctx: TuneContext = { budgetLimitNanoAiu: 1_000_000 };
    // costPerSession = 10_000, tokenPressure = 0.01 < 0.4 → relax.
    const cool = makeProfile({
      sessionCount: 10,
      tokens: {
        meanInputTokens: 5_000,
        meanOutputTokens: 1_000,
        meanCacheHitRate: 0.6,
        totalCostNanoAiu: 100_000,
      },
    });
    const tuned = tuneParameters(baseline, cool, ctx);
    expect(tuned.budgetThreshold).toBeGreaterThan(baseline.budgetThreshold);
  });

  it("falls back to the default budget limit when context is omitted", () => {
    expect(DEFAULT_BUDGET_LIMIT_NANO_AIU).toBeGreaterThan(0);
    const profile = makeProfile();
    const withCtx = tuneParameters(baseline, profile, {
      budgetLimitNanoAiu: DEFAULT_BUDGET_LIMIT_NANO_AIU,
    });
    const withoutCtx = tuneParameters(baseline, profile);
    expect(withoutCtx).toEqual(withCtx);
  });

  it("guards against a non-positive budget limit by falling back to the default", () => {
    const profile = makeProfile();
    const explicit = tuneParameters(baseline, profile, { budgetLimitNanoAiu: 0 });
    const fallback = tuneParameters(baseline, profile, {
      budgetLimitNanoAiu: DEFAULT_BUDGET_LIMIT_NANO_AIU,
    });
    expect(explicit).toEqual(fallback);
  });

  // F10 — explorationBudget should decay when drift is GREEN and grow under
  // RED, while never violating the floor or ceiling.
  it("decays explorationBudget under GREEN drift (high confidence)", () => {
    const start: StrategyParameters = { ...baseline, explorationBudget: 0.6 };
    const tuned = tuneParameters(
      start,
      makeProfile({ drift: { mean: 0.05, p50: 0.05, p95: 0.05, trend: "stable" } }),
    );
    expect(tuned.explorationBudget).toBeLessThan(start.explorationBudget);
    expect(tuned.explorationBudget).toBeGreaterThanOrEqual(0.15);
  });

  it("grows explorationBudget under RED drift (low confidence)", () => {
    const start: StrategyParameters = { ...baseline, explorationBudget: 0.4 };
    const tuned = tuneParameters(
      start,
      makeProfile({ drift: { mean: 0.5, p50: 0.4, p95: 0.7, trend: "degrading" } }),
    );
    expect(tuned.explorationBudget).toBeGreaterThan(start.explorationBudget);
    expect(tuned.explorationBudget).toBeLessThanOrEqual(1);
  });

  it("holds explorationBudget steady under YELLOW drift", () => {
    const start: StrategyParameters = { ...baseline, explorationBudget: 0.5 };
    const tuned = tuneParameters(
      start,
      makeProfile({ drift: { mean: 0.2, p50: 0.2, p95: 0.25, trend: "stable" } }),
    );
    expect(tuned.explorationBudget).toBe(start.explorationBudget);
  });
});

// ---------------------------------------------------------------------------
// F6b — prescribers prefer the dedicated `signals.toolEntropy` over the
// composite `drift.p95` once it is available on the profile.
// ---------------------------------------------------------------------------

describe("analyzePromptOptimizations — signal-driven tool-guidance", () => {
  it("uses profile.signals.toolEntropy when present", () => {
    const result = analyzePromptOptimizations(
      makeProfile({
        // Composite p95 is well below the entropy threshold, so the only way
        // a tool-guidance hint can fire is if the dedicated signal is read.
        drift: { mean: 0.05, p50: 0.05, p95: 0.1, trend: "stable" },
        signals: {
          convergence: 0.1,
          tokenPressure: 0.1,
          toolEntropy: 0.85,
          contextBloat: 0.1,
          promptStability: 0.1,
        },
      }),
    );
    const hint = result.hints.find((h) => h.category === "tool-guidance");
    expect(hint).toBeDefined();
    expect(hint?.evidence.triggerMetrics.toolEntropy).toBeCloseTo(0.85, 5);
  });

  it("does not fire tool-guidance when signals.toolEntropy is below threshold even if p95 is high", () => {
    const result = analyzePromptOptimizations(
      makeProfile({
        drift: { mean: 0.05, p50: 0.05, p95: 0.9, trend: "stable" },
        signals: {
          convergence: 0.1,
          tokenPressure: 0.1,
          toolEntropy: 0.05,
          contextBloat: 0.1,
          promptStability: 0.1,
        },
      }),
    );
    expect(result.hints.find((h) => h.category === "tool-guidance")).toBeUndefined();
  });
});
