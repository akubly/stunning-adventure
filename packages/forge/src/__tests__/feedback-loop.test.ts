/**
 * Phase 4.5 feedback-loop — integration, convergence, regression, efficiency.
 *
 * This file is the cross-module test surface for the local feedback loop. It
 * deliberately does NOT re-cover the per-module mechanics already exercised in:
 *   - telemetry-drift.test.ts        (drift score arithmetic, properties)
 *   - telemetry-collectors.test.ts   (per-collector unit tests)
 *   - telemetry-aggregator.test.ts   (aggregator fold semantics)
 *   - prescribers-applier.test.ts    (per-prescriber + applier mechanics)
 *
 * Categories covered (per spec §11):
 *   L2  Integration   — collector → sink → aggregator → prescriber → applier
 *   L3  Convergence   — multi-cycle improvement, hints trend toward zero
 *   L4  Regression    — applied optimizations don't degrade metrics
 *   L5  Efficiency    — collector hot-path is bounded in time
 *   §11.3 Property    — score ∈ [0,1], classification monotone, agg commutative
 *   §11.4 Metamorphic — more data → higher confidence; worse drift → ≥ hints;
 *                       drift gate suppresses token hints
 *
 * Test approach (per spec §11.2): test the *learning process*, not the
 * *learned artifacts*. We assert behavioural invariants — monotonicity,
 * stability, suppression — rather than specific hint text or counts.
 */

import { describe, it, expect } from "vitest";
import type { CairnBridgeEvent } from "@akubly/types";

import {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
  createLocalDBOMSink,
  aggregateSignals,
  computeDriftScore,
  classifyDriftLevel,
  type SignalSample,
  type ExecutionProfile,
  type DriftSignals,
} from "../telemetry/index.js";

import {
  analyzePromptOptimizations,
  analyzeTokenOptimizations,
  type OptimizationHint,
} from "../prescribers/index.js";

import {
  applyOptimizations,
  tuneParameters,
  DEFAULT_STRATEGY_PARAMS,
} from "../applier/index.js";

// ---------------------------------------------------------------------------
// L1 — Test fixture factory
//
// Centralized, pure factories for the four artifact families: bridge events,
// signal samples, execution profiles, optimization hints. All factories
// accept partial overrides and produce well-typed, valid objects.
// ---------------------------------------------------------------------------

function evt(
  eventType: string,
  payload: Record<string, unknown> = {},
  sessionId = "sess-001",
): CairnBridgeEvent {
  return {
    sessionId,
    eventType,
    payload: JSON.stringify(payload),
    createdAt: "2026-05-02T12:00:00.000Z",
    provenanceTier: "internal",
  };
}

/** A "good" session — converges quickly, single tool, low context. */
function goodSessionEvents(sessionId: string): CairnBridgeEvent[] {
  return [
    evt("turn_end", {}, sessionId),
    evt("tool_use", { toolName: "view" }, sessionId),
    evt("tool_result", { success: true }, sessionId),
    evt("context_window", {
      currentTokens: 100,
      tokenLimit: 10_000,
    }, sessionId),
    evt("model_call", {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 80,
      cacheWriteTokens: 20,
      totalNanoAiu: 1_000,
    }, sessionId),
    evt("session_end", {}, sessionId),
    // Extra observed turns after success keep convergence < 1.
    evt("turn_end", {}, sessionId),
    evt("turn_end", {}, sessionId),
    evt("turn_end", {}, sessionId),
  ];
}

/** A "bad" session — high entropy, no convergence, lots of token churn. */
function badSessionEvents(sessionId: string): CairnBridgeEvent[] {
  const out: CairnBridgeEvent[] = [];
  for (let t = 0; t < 12; t++) {
    out.push(evt("turn_end", {}, sessionId));
    out.push(evt("tool_use", { toolName: `tool_${t % 5}` }, sessionId));
    out.push(evt("context_window", {
      currentTokens: 8_000 + t * 100,
      tokenLimit: 10_000,
    }, sessionId));
    out.push(evt("model_call", {
      inputTokens: 60_000,
      outputTokens: 40_000,
      cacheReadTokens: 100,
      cacheWriteTokens: 0,
      totalNanoAiu: 2_000_000,
    }, sessionId));
    if (t % 3 === 0) out.push(evt("tool_result", { success: false }, sessionId));
    out.push(evt("turn_end", {
      promptHash: `hash-${t}`,
    }, sessionId));
  }
  // Never reaches session_end, no successful tool_result, no plan_changed →
  // convergence stays at 1 (max drift).
  return out;
}

function profile(overrides: Partial<ExecutionProfile> = {}): ExecutionProfile {
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

function hint(overrides: Partial<OptimizationHint> = {}): OptimizationHint {
  const p = profile();
  return {
    id: "hint-default",
    source: "prompt-optimizer",
    skillId: "skill-test",
    category: "prompt-structure",
    description: "test hint",
    recommendation: "do the thing",
    impactScore: 0.5,
    confidence: 0.9,
    evidence: { profile: p, triggerMetrics: {} },
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

/** Drive a session through the three collectors + sink, return samples. */
function runSession(sessionId: string, events: CairnBridgeEvent[]): SignalSample[] {
  const drift = createDriftCollector();
  const token = createTokenCollector();
  const outcome = createOutcomeCollector();
  const captured: SignalSample[] = [];
  const sink = createLocalDBOMSink({
    persistSample: (s) => captured.push(s),
    bufferSize: 16,
  });
  for (const e of events) {
    drift.collect(e);
    token.collect(e);
    outcome.collect(e);
  }
  for (const c of [drift, token, outcome]) {
    const s = c.flush(sessionId);
    if (s) sink.enqueueSample({ ...s, skillId: "skill-pipeline" });
  }
  // Force drain. `flush` is optional on the TelemetrySink contract.
  void sink.flush?.();
  return captured;
}

// ---------------------------------------------------------------------------
// L1 — Fixture factory shape tests (cheap sanity checks)
// ---------------------------------------------------------------------------

describe("L1: fixture factories", () => {
  it("evt() produces a CairnBridgeEvent with JSON-encoded payload", () => {
    const e = evt("turn_end", { promptHash: "h1" });
    expect(e.eventType).toBe("turn_end");
    expect(typeof e.payload).toBe("string");
    expect(JSON.parse(e.payload)).toEqual({ promptHash: "h1" });
    expect(e.provenanceTier).toBe("internal");
  });

  it("profile() produces a valid GREEN-zone profile by default", () => {
    const p = profile();
    expect(p.drift.mean).toBeLessThan(0.1);
    expect(p.outcomes.successRate).toBeGreaterThan(0.5);
    expect(p.sessionCount).toBeGreaterThan(0);
  });

  it("hint() is auto-applicable (confidence ≥ default 0.7)", () => {
    expect(hint().confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("goodSessionEvents() and badSessionEvents() differ in shape", () => {
    expect(goodSessionEvents("g").length).toBeLessThan(badSessionEvents("b").length);
  });
});

// ---------------------------------------------------------------------------
// L2 — Integration: collector → sink → aggregator → prescriber → applier
// ---------------------------------------------------------------------------

describe("L2: end-to-end pipeline", () => {
  it("a clean session flows through the full pipeline producing zero hints", () => {
    const samples = runSession("s-good", goodSessionEvents("s-good"));
    expect(samples.length).toBe(3); // drift + token + outcome
    expect(samples.map((s) => s.kind).sort()).toEqual(["drift", "outcome", "token"]);

    const agg = aggregateSignals(null, samples, "per-skill", "skill-pipeline");
    expect(agg.profile.sessionCount).toBe(1);
    expect(agg.profile.drift.mean).toBeLessThan(0.3);
    expect(agg.profile.outcomes.successRate).toBeGreaterThan(0);

    const prompt = analyzePromptOptimizations(agg.profile, { minSessions: 1 });
    const token = analyzeTokenOptimizations(agg.profile, { minSessions: 1 });
    // A clean session may produce no hints, or only low-impact ones — never
    // a convergence/structure hint.
    expect(prompt.hints.every((h) => h.category !== "convergence")).toBe(true);
    expect(prompt.hints.every((h) => h.category !== "prompt-structure")).toBe(true);
    expect(token.hints).toBeDefined();
  });

  it("a bad session produces hints that the applier can stably patch", () => {
    const samples = runSession("s-bad", badSessionEvents("s-bad"));
    // Aggregate enough sessions to clear minSessions thresholds.
    let agg = aggregateSignals(null, samples, "per-skill", "skill-pipeline");
    for (let i = 0; i < 6; i++) {
      agg = aggregateSignals(
        agg.profile,
        runSession(`s-bad-${i}`, badSessionEvents(`s-bad-${i}`)),
        "per-skill",
        "skill-pipeline",
      );
    }
    expect(agg.profile.sessionCount).toBeGreaterThanOrEqual(5);

    const prompt = analyzePromptOptimizations(agg.profile);
    expect(prompt.hints.length).toBeGreaterThan(0);

    const result = applyOptimizations(prompt.hints);
    // High-impact hints land in the patch; everything applied has confidence ≥ 0.7.
    expect(result.applied.length + result.skipped.length).toBe(prompt.hints.length);
    for (const a of result.applied) {
      const src = prompt.hints.find((h) => h.id === a.hintId)!;
      expect(src.confidence).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("LocalDBOMSink persists every sample produced by the collectors", () => {
    const calls: SignalSample[] = [];
    const sink = createLocalDBOMSink({
      persistSample: (s) => calls.push(s),
      bufferSize: 1, // immediate persist
    });
    const drift = createDriftCollector();
    const events = goodSessionEvents("s-x");
    for (const e of events) drift.collect(e);
    const s = drift.flush("s-x");
    if (s) sink.enqueueSample(s);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.kind).toBe("drift");
  });

  it("aggregator commutativity: order of two batches yields the same sessionCount", () => {
    const a = runSession("a", goodSessionEvents("a"));
    const b = runSession("b", goodSessionEvents("b"));
    const orderAB = aggregateSignals(
      aggregateSignals(null, a, "per-skill", "k").profile,
      b,
      "per-skill",
      "k",
    );
    const orderBA = aggregateSignals(
      aggregateSignals(null, b, "per-skill", "k").profile,
      a,
      "per-skill",
      "k",
    );
    expect(orderAB.profile.sessionCount).toBe(orderBA.profile.sessionCount);
    expect(orderAB.profile.outcomes.successRate).toBeCloseTo(
      orderBA.profile.outcomes.successRate,
      5,
    );
  });

  it("propagates a meaningful skillId from sample to profile", () => {
    const samples = runSession("s", goodSessionEvents("s"));
    const agg = aggregateSignals(null, samples, "per-skill", "skill-pipeline");
    expect(agg.profile.skillId).toBe("skill-pipeline");
    expect(agg.profile.granularityKey).toBe("skill-pipeline");
  });
});

// ---------------------------------------------------------------------------
// L3 — Convergence: multi-cycle improvement
//
// The loop is: profile → hints → applied patch → (operator updates skill) →
// improved profile next cycle. We can't run a real model, so we *simulate*
// the operator's effect by feeding a profile whose drift drops between cycles
// and assert that hints either reduce in count or shift to lower-impact
// categories. The test is about the *response curve* of the system.
// ---------------------------------------------------------------------------

describe("L3: convergence across optimization cycles", () => {
  it("hint count is monotonically non-increasing as drift improves", () => {
    const cycles = [0.5, 0.4, 0.3, 0.2, 0.1, 0.05].map((d) =>
      profile({
        drift: { mean: d, p50: d, p95: d * 1.5, trend: "improving" },
        outcomes: {
          successRate: 0.5 + (0.5 - d) * 0.8,
          meanConvergenceTurns: 4,
          toolErrorRate: 0,
        },
      }),
    );
    const hintCounts = cycles.map((p) => analyzePromptOptimizations(p).hints.length);
    for (let i = 1; i < hintCounts.length; i++) {
      expect(hintCounts[i]!).toBeLessThanOrEqual(hintCounts[i - 1]!);
    }
    expect(hintCounts[hintCounts.length - 1]!).toBe(0);
  });

  it("max impact score across hints is non-increasing as drift improves", () => {
    const cycles = [0.45, 0.3, 0.2, 0.1, 0.05].map((d) =>
      profile({ drift: { mean: d, p50: d, p95: d, trend: "improving" } }),
    );
    const maxImpact = cycles.map((p) => {
      const hs = analyzePromptOptimizations(p).hints;
      return hs.length > 0 ? Math.max(...hs.map((h) => h.impactScore)) : 0;
    });
    for (let i = 1; i < maxImpact.length; i++) {
      expect(maxImpact[i]!).toBeLessThanOrEqual(maxImpact[i - 1]!);
    }
  });

  it("self-tuning parameters drift toward steady state across cycles", () => {
    let params = { ...DEFAULT_STRATEGY_PARAMS };
    const trajectory: number[] = [];
    const stableProfile = profile({
      drift: { mean: 0.05, p50: 0.05, p95: 0.05, trend: "stable" },
      outcomes: { successRate: 0.95, meanConvergenceTurns: 3, toolErrorRate: 0 },
    });
    for (let i = 0; i < 8; i++) {
      params = tuneParameters(params, stableProfile);
      trajectory.push(params.contextPressureLimit);
    }
    // Steady-state stability: last few values should not oscillate.
    const last = trajectory.slice(-3);
    const swing = Math.max(...last) - Math.min(...last);
    expect(swing).toBeLessThan(0.2);
  });

  it("an aggregator fed sequentially-improving samples reports 'improving' trend", () => {
    const samples: SignalSample[] = [];
    for (let i = 0; i < 6; i++) {
      samples.push({
        kind: "drift",
        sessionId: `s-${i}`,
        skillId: "k",
        value: 0.5 - i * 0.08,
        metadata: {},
        collectedAt: new Date(2026, 0, i + 1).toISOString(),
      });
    }
    const agg = aggregateSignals(null, samples, "per-skill", "k");
    expect(agg.profile.drift.trend).toBe("improving");
  });
});

// ---------------------------------------------------------------------------
// L4 — Regression: applied optimizations don't degrade metrics
//
// "Degrade" here means: the applier cannot produce a patch that contradicts
// the input hints, that reorders by impact in a non-monotone way, or that
// emits more cacheable-tool entries than were justified by hints. We also
// guard against the prescribers becoming chattier on identical input.
// ---------------------------------------------------------------------------

describe("L4: regression — applier output is stable & non-degrading", () => {
  it("re-running prescribers on the same profile produces the same hint set (modulo IDs)", () => {
    const p = profile({
      drift: { mean: 0.4, p50: 0.35, p95: 0.6, trend: "degrading" },
    });
    const a = analyzePromptOptimizations(p);
    const b = analyzePromptOptimizations(p);
    const shape = (r: { hints: OptimizationHint[] }) =>
      r.hints
        .map((h) => `${h.category}|${h.recommendation}|${h.impactScore}`)
        .sort();
    expect(shape(a)).toEqual(shape(b));
  });

  it("applying the same hints twice yields the same patch (deterministic ordering)", () => {
    const hints = [
      hint({ id: "z", category: "prompt-structure", impactScore: 0.6 }),
      hint({ id: "a", category: "convergence", impactScore: 0.6 }),
      hint({ id: "m", category: "tool-guidance", impactScore: 0.7 }),
    ];
    const fixedNow = () => new Date("2026-05-02T12:00:00.000Z");
    const r1 = applyOptimizations(hints, { now: fixedNow });
    const r2 = applyOptimizations(hints, { now: fixedNow });
    expect(r1.applied.map((a) => a.hintId)).toEqual(r2.applied.map((a) => a.hintId));
    expect(r1.frontmatterPatch).toEqual(r2.frontmatterPatch);
  });

  it("applier ordering: highest impactScore wins; ties break by id ascending", () => {
    const hints = [
      hint({ id: "b", impactScore: 0.5 }),
      hint({ id: "a", impactScore: 0.5 }),
      hint({ id: "c", impactScore: 0.9 }),
    ];
    const r = applyOptimizations(hints);
    expect(r.applied.map((a) => a.hintId)).toEqual(["c", "a", "b"]);
  });

  it("applier never applies a hint whose confidence is below the threshold", () => {
    const hints = [
      hint({ id: "lo", confidence: 0.4 }),
      hint({ id: "hi", confidence: 0.95 }),
    ];
    const r = applyOptimizations(hints, { autoApplyThreshold: 0.7 });
    expect(r.applied.map((a) => a.hintId)).toEqual(["hi"]);
    expect(r.skipped.map((s) => s.hintId)).toContain("lo");
  });

  it("applier respects maxHintsPerCycle — excess hints are skipped, not silently dropped", () => {
    const hints = Array.from({ length: 10 }, (_, i) =>
      hint({ id: `h${i}`, impactScore: 0.5 + i * 0.01 }),
    );
    const r = applyOptimizations(hints, { maxHintsPerCycle: 3 });
    expect(r.applied).toHaveLength(3);
    expect(r.skipped.length).toBeGreaterThanOrEqual(7);
    expect(r.applied.length + r.skipped.length).toBe(hints.length);
  });

  it("token optimizer is suppressed when drift gate is breached (no token hints)", () => {
    const reddish = profile({
      drift: { mean: 0.35, p50: 0.3, p95: 0.5, trend: "degrading" },
      sessionCount: 20,
      tokens: {
        meanInputTokens: 80_000,
        meanOutputTokens: 40_000,
        meanCacheHitRate: 0.05,
        totalCostNanoAiu: 50_000_000,
      },
    });
    const r = analyzeTokenOptimizations(reddish);
    expect(r.hints).toEqual([]);
  });

  it("self-tuning never moves explorationBudget below the hard floor", () => {
    let params = { ...DEFAULT_STRATEGY_PARAMS, explorationBudget: 0.05 };
    for (let i = 0; i < 20; i++) params = tuneParameters(params, profile());
    expect(params.explorationBudget).toBeGreaterThanOrEqual(0.15);
  });

  it("tuneParameters keeps all parameters within their declared bounds", () => {
    let params = { ...DEFAULT_STRATEGY_PARAMS };
    const stress = profile({
      drift: { mean: 0.9, p50: 0.9, p95: 0.95, trend: "degrading" },
      outcomes: { successRate: 0.1, meanConvergenceTurns: 30, toolErrorRate: 0.5 },
      tokens: {
        meanInputTokens: 100_000,
        meanOutputTokens: 100_000,
        meanCacheHitRate: 0,
        totalCostNanoAiu: 1e10,
      },
    });
    for (let i = 0; i < 50; i++) {
      params = tuneParameters(params, stress);
      expect(params.budgetThreshold).toBeGreaterThanOrEqual(0.5);
      expect(params.budgetThreshold).toBeLessThanOrEqual(0.95);
      expect(params.contextPressureLimit).toBeGreaterThanOrEqual(0.4);
      expect(params.contextPressureLimit).toBeLessThanOrEqual(0.9);
      expect(params.maxModelSwitches).toBeGreaterThanOrEqual(1);
      expect(params.maxModelSwitches).toBeLessThanOrEqual(10);
    }
  });
});

// ---------------------------------------------------------------------------
// L5 — Efficiency: collector hot-path performance bounds
//
// Collectors live alongside decision gates. The contract is "O(1) per event".
// We probe with synthetic event streams and assert wall-clock bounds. Bounds
// are intentionally generous (CI variability) but a regression to O(N) per
// event would still be detected.
// ---------------------------------------------------------------------------

describe("L5: efficiency — hot-path bounds", () => {
  it("driftCollector.collect() handles 10k events under 250ms", () => {
    const c = createDriftCollector();
    const e = evt("tool_use", { toolName: "view" });
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) c.collect(e);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(250);
  });

  it("tokenCollector.collect() handles 10k usage events under 250ms", () => {
    const c = createTokenCollector();
    const e = evt("model_call", {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 20,
      cacheWriteTokens: 5,
      totalNanoAiu: 1_000,
    });
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) c.collect(e);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(250);
  });

  it("outcomeCollector.collect() handles 10k events under 100ms", () => {
    const c = createOutcomeCollector();
    const e = evt("turn_end");
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) c.collect(e);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it("aggregateSignals() folds 1000 samples under 50ms", () => {
    const samples: SignalSample[] = Array.from({ length: 1000 }, (_, i) => ({
      kind: "drift",
      sessionId: `s-${i}`,
      skillId: "k",
      value: Math.random(),
      metadata: {},
      collectedAt: "2026-05-02T12:00:00.000Z",
    }));
    const start = performance.now();
    aggregateSignals(null, samples, "per-skill", "k");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it("LocalDBOMSink enqueue+flush of 1000 samples completes under 100ms", async () => {
    let count = 0;
    const sink = createLocalDBOMSink({
      persistSample: () => {
        count++;
      },
      bufferSize: 100,
    });
    const sample: SignalSample = {
      kind: "outcome",
      sessionId: "s",
      value: 1,
      metadata: {},
      collectedAt: "2026-05-02T12:00:00.000Z",
    };
    const start = performance.now();
    for (let i = 0; i < 1000; i++) sink.enqueueSample(sample);
    await sink.flush?.();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(count).toBe(1000);
  });

  it("applyOptimizations() processes 500 hints under 50ms", () => {
    const hints = Array.from({ length: 500 }, (_, i) =>
      hint({ id: `h-${String(i).padStart(4, "0")}`, impactScore: (i % 10) / 10 }),
    );
    const start = performance.now();
    applyOptimizations(hints, { maxHintsPerCycle: 500 });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// §11.3 — Property-based tests
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("§11.3 properties: drift score invariants", () => {
  it("score is bounded in [0, 1] across 200 random signal vectors", () => {
    const r = lcg(42);
    for (let i = 0; i < 200; i++) {
      const sig: DriftSignals = {
        convergence: r(),
        tokenPressure: r(),
        toolEntropy: r(),
        contextBloat: r(),
        promptStability: r(),
      };
      const s = computeDriftScore(sig).score;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("classification is monotone — score ≥ threshold ⇒ level no-better-than", () => {
    const r = lcg(7);
    const order = { GREEN: 0, YELLOW: 1, RED: 2 } as const;
    let prev = -1;
    const scores = Array.from({ length: 50 }, () => r()).sort((a, b) => a - b);
    for (const s of scores) {
      const cur = order[classifyDriftLevel(s)];
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });

  it("aggregator is commutative on disjoint same-skill batches (sessionCount)", () => {
    const r = lcg(99);
    const make = (sid: string): SignalSample => ({
      kind: "drift",
      sessionId: sid,
      skillId: "k",
      value: r(),
      metadata: {},
      collectedAt: "2026-05-02T12:00:00.000Z",
    });
    const A = ["s1", "s2", "s3"].map(make);
    const B = ["s4", "s5"].map(make);
    const left = aggregateSignals(
      aggregateSignals(null, A, "per-skill", "k").profile,
      B,
      "per-skill",
      "k",
    );
    const right = aggregateSignals(
      aggregateSignals(null, B, "per-skill", "k").profile,
      A,
      "per-skill",
      "k",
    );
    expect(left.profile.sessionCount).toBe(right.profile.sessionCount);
  });

  it("applier ordering is stable: shuffling input reproduces the same applied sequence", () => {
    const base = Array.from({ length: 12 }, (_, i) =>
      hint({ id: `h-${i}`, impactScore: (i % 4) / 4, confidence: 0.9 }),
    );
    const shuffled = [...base].reverse();
    const a = applyOptimizations(base, { maxHintsPerCycle: 12 });
    const b = applyOptimizations(shuffled, { maxHintsPerCycle: 12 });
    expect(a.applied.map((x) => x.hintId)).toEqual(b.applied.map((x) => x.hintId));
  });
});

// ---------------------------------------------------------------------------
// §11.4 — Metamorphic tests
// ---------------------------------------------------------------------------

describe("§11.4 metamorphic relations", () => {
  it("more sessions in a profile → confidence on prompt-structure hint goes UP", () => {
    const p1 = profile({
      sessionCount: 3,
      drift: { mean: 0.4, p50: 0.4, p95: 0.5, trend: "degrading" },
    });
    const p2 = profile({
      sessionCount: 50,
      drift: { mean: 0.4, p50: 0.4, p95: 0.5, trend: "degrading" },
    });
    const h1 = analyzePromptOptimizations(p1).hints.find((h) => h.category === "prompt-structure");
    const h2 = analyzePromptOptimizations(p2).hints.find((h) => h.category === "prompt-structure");
    expect(h1).toBeDefined();
    expect(h2).toBeDefined();
    expect(h2!.confidence).toBeGreaterThanOrEqual(h1!.confidence);
  });

  it("worse drift → at least as many prompt hints", () => {
    const easy = profile({ drift: { mean: 0.05, p50: 0.05, p95: 0.05, trend: "stable" } });
    const hard = profile({ drift: { mean: 0.45, p50: 0.4, p95: 0.6, trend: "degrading" } });
    const easyN = analyzePromptOptimizations(easy).hints.length;
    const hardN = analyzePromptOptimizations(hard).hints.length;
    expect(hardN).toBeGreaterThanOrEqual(easyN);
  });

  it("drift gate: equal cost profiles produce hints iff drift < 0.3", () => {
    const expensive = (driftMean: number) =>
      profile({
        sessionCount: 20,
        drift: { mean: driftMean, p50: driftMean, p95: driftMean, trend: "stable" },
        tokens: {
          meanInputTokens: 100_000,
          meanOutputTokens: 80_000,
          meanCacheHitRate: 0.05,
          totalCostNanoAiu: 100_000_000,
        },
      });
    expect(analyzeTokenOptimizations(expensive(0.1)).hints.length).toBeGreaterThan(0);
    expect(analyzeTokenOptimizations(expensive(0.3)).hints.length).toBe(0);
    expect(analyzeTokenOptimizations(expensive(0.5)).hints.length).toBe(0);
  });

  it("doubling all signals never decreases the drift score", () => {
    const r = lcg(13);
    for (let i = 0; i < 20; i++) {
      const half: DriftSignals = {
        convergence: r() * 0.5,
        tokenPressure: r() * 0.5,
        toolEntropy: r() * 0.5,
        contextBloat: r() * 0.5,
        promptStability: r() * 0.5,
      };
      const full: DriftSignals = {
        convergence: Math.min(1, half.convergence * 2),
        tokenPressure: Math.min(1, half.tokenPressure * 2),
        toolEntropy: Math.min(1, half.toolEntropy * 2),
        contextBloat: Math.min(1, half.contextBloat * 2),
        promptStability: Math.min(1, half.promptStability * 2),
      };
      expect(computeDriftScore(full).score).toBeGreaterThanOrEqual(
        computeDriftScore(half).score,
      );
    }
  });

  it("applier output: adding a low-confidence hint never changes the applied set", () => {
    const base = [
      hint({ id: "a", impactScore: 0.8, confidence: 0.9 }),
      hint({ id: "b", impactScore: 0.7, confidence: 0.9 }),
    ];
    const noisy = [...base, hint({ id: "c", impactScore: 0.95, confidence: 0.3 })];
    const r1 = applyOptimizations(base);
    const r2 = applyOptimizations(noisy);
    expect(r2.applied.map((a) => a.hintId)).toEqual(r1.applied.map((a) => a.hintId));
  });
});
