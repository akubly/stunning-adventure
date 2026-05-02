/**
 * Signal aggregator — incrementally folds raw {@link SignalSample}s into an
 * {@link ExecutionProfile}. Cursor-based, consistent with Curator's pattern:
 * the caller passes the existing profile (or null) plus the new samples since
 * the last cursor and gets back the updated profile.
 */

import type { DriftSketch, ProfileSignals } from "@akubly/types";
import type { SignalSample, ExecutionProfile, ProfileGranularity } from "./types.js";

export interface AggregationResult {
  profile: ExecutionProfile;
  samplesConsumed: number;
}

const SKETCH_BUCKETS = 100;

/** Create a fresh empty sketch over [0, 1]. */
function emptySketch(): DriftSketch {
  return { buckets: new Array(SKETCH_BUCKETS).fill(0), count: 0 };
}

/** Clone+update a sketch with new drift values (each clamped to [0,1]). */
function updateSketch(prev: DriftSketch | undefined, values: number[]): DriftSketch {
  const next: DriftSketch = prev
    ? { buckets: prev.buckets.slice(), count: prev.count }
    : emptySketch();
  // Defensive: handle a malformed persisted sketch.
  if (next.buckets.length !== SKETCH_BUCKETS) {
    next.buckets = new Array(SKETCH_BUCKETS).fill(0);
    next.count = 0;
  }
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    const clamped = Math.max(0, Math.min(1, v));
    let idx = Math.floor(clamped * SKETCH_BUCKETS);
    if (idx >= SKETCH_BUCKETS) idx = SKETCH_BUCKETS - 1;
    next.buckets[idx]! += 1;
    next.count += 1;
  }
  return next;
}

/** Compute a quantile in [0,1] from the sketch. Returns 0 for empty sketch. */
function sketchQuantile(sketch: DriftSketch, q: number): number {
  if (sketch.count === 0) return 0;
  const target = Math.max(1, Math.ceil(q * sketch.count));
  let cumulative = 0;
  for (let i = 0; i < sketch.buckets.length; i++) {
    cumulative += sketch.buckets[i] ?? 0;
    if (cumulative >= target) {
      // Return the bucket midpoint — accurate to ±0.005 for [0,1] inputs.
      return (i + 0.5) / SKETCH_BUCKETS;
    }
  }
  return 1;
}

/**
 * Fold a per-session mean over an existing running mean. Mirrors the
 * weighted pattern used for `successRate`: prevTotal = prevMean * prevCount,
 * add the new batch sum, divide by the new total session count.
 *
 * When the new batch contributes no samples, the prior mean is preserved.
 */
function weightedMean(
  prevMean: number,
  prevCount: number,
  newSum: number,
  newSampleCount: number,
  totalSessionCount: number,
): number {
  if (newSampleCount === 0) return prevMean;
  if (totalSessionCount === 0) return 0;
  return (prevMean * prevCount + newSum) / totalSessionCount;
}

/** Sum a numeric metadata field across samples, treating non-numbers as 0. */
function sumMeta(metas: Array<Record<string, unknown>>, key: string): number {
  let s = 0;
  for (const m of metas) {
    const v = m[key];
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return s;
}

/**
 * Incrementally aggregate signal samples into an execution profile.
 *
 * @param existing - Existing profile to update (null for first aggregation)
 * @param samples - New signal samples since last aggregation
 * @param granularity - Aggregation level
 * @param granularityKey - Key for the aggregation level
 */
export function aggregateSignals(
  existing: ExecutionProfile | null,
  samples: SignalSample[],
  granularity: ProfileGranularity,
  granularityKey: string,
): AggregationResult {
  const driftSamples = samples.filter((s) => s.kind === "drift");
  const tokenSamples = samples.filter((s) => s.kind === "token");
  const outcomeSamples = samples.filter((s) => s.kind === "outcome");

  const prevCount = existing?.sessionCount ?? 0;
  const newSessionIds = new Set(samples.map((s) => s.sessionId));
  const sessionCount = prevCount + newSessionIds.size;

  // --- Drift aggregation (mean + streaming sketch + trend) ---
  const driftValues = driftSamples.map((s) => s.value);
  const prevDriftMean = existing?.drift.mean ?? 0;
  const driftMean = weightedMean(
    prevDriftMean,
    prevCount,
    driftValues.reduce((a, b) => a + b, 0),
    driftValues.length,
    sessionCount,
  );

  // F5: streaming quantile sketch — accumulates across all batches.
  const sketch = updateSketch(existing?.drift.sketch, driftValues);
  const driftP50 =
    sketch.count > 0 ? sketchQuantile(sketch, 0.5) : (existing?.drift.p50 ?? 0);
  const driftP95 =
    sketch.count > 0 ? sketchQuantile(sketch, 0.95) : (existing?.drift.p95 ?? 0);

  const trend: ExecutionProfile["drift"]["trend"] =
    driftValues.length >= 2
      ? driftValues[driftValues.length - 1]! < driftValues[0]!
        ? "improving"
        : driftValues[driftValues.length - 1]! > driftValues[0]!
          ? "degrading"
          : "stable"
      : (existing?.drift.trend ?? "stable");

  // --- Token aggregation (weighted means, consistent with successRate) ---
  const tokenMetas = tokenSamples.map((s) => s.metadata);
  const meanInput = weightedMean(
    existing?.tokens.meanInputTokens ?? 0,
    prevCount,
    sumMeta(tokenMetas, "totalInput"),
    tokenMetas.length,
    sessionCount,
  );
  const meanOutput = weightedMean(
    existing?.tokens.meanOutputTokens ?? 0,
    prevCount,
    sumMeta(tokenMetas, "totalOutput"),
    tokenMetas.length,
    sessionCount,
  );
  const meanCacheHit = weightedMean(
    existing?.tokens.meanCacheHitRate ?? 0,
    prevCount,
    sumMeta(tokenMetas, "cacheHitRate"),
    tokenMetas.length,
    sessionCount,
  );
  const totalCost =
    (existing?.tokens.totalCostNanoAiu ?? 0) + sumMeta(tokenMetas, "costNanoAiu");

  // --- Outcome aggregation ---
  const outcomeMetas = outcomeSamples.map((s) => s.metadata);
  const successCount = outcomeMetas.filter((m) => m.succeeded === true).length;
  const prevSuccesses = existing ? existing.outcomes.successRate * prevCount : 0;
  const successRate =
    sessionCount > 0 ? (successCount + prevSuccesses) / sessionCount : 0;

  const meanConvergence = weightedMean(
    existing?.outcomes.meanConvergenceTurns ?? 0,
    prevCount,
    sumMeta(outcomeMetas, "turnCount"),
    outcomeMetas.length,
    sessionCount,
  );
  const toolErrorRate = weightedMean(
    existing?.outcomes.toolErrorRate ?? 0,
    prevCount,
    sumMeta(outcomeMetas, "toolErrorRate"),
    outcomeMetas.length,
    sessionCount,
  );

  // --- F6a: per-signal means folded from drift sample metadata.signals ---
  const signalKeys: ReadonlyArray<keyof ProfileSignals> = [
    "convergence",
    "tokenPressure",
    "toolEntropy",
    "contextBloat",
    "promptStability",
  ];
  const signalSums: Record<keyof ProfileSignals, number> = {
    convergence: 0,
    tokenPressure: 0,
    toolEntropy: 0,
    contextBloat: 0,
    promptStability: 0,
  };
  let signalSampleCount = 0;
  for (const s of driftSamples) {
    const sig = s.metadata.signals;
    if (sig && typeof sig === "object") {
      const sigRec = sig as Record<string, unknown>;
      for (const k of signalKeys) {
        const v = sigRec[k];
        if (typeof v === "number" && Number.isFinite(v)) signalSums[k] += v;
      }
      signalSampleCount++;
    }
  }
  const prevSignals: ProfileSignals = existing?.signals ?? {
    convergence: 0,
    tokenPressure: 0,
    toolEntropy: 0,
    contextBloat: 0,
    promptStability: 0,
  };
  const signals: ProfileSignals = {
    convergence: weightedMean(
      prevSignals.convergence, prevCount, signalSums.convergence,
      signalSampleCount, sessionCount,
    ),
    tokenPressure: weightedMean(
      prevSignals.tokenPressure, prevCount, signalSums.tokenPressure,
      signalSampleCount, sessionCount,
    ),
    toolEntropy: weightedMean(
      prevSignals.toolEntropy, prevCount, signalSums.toolEntropy,
      signalSampleCount, sessionCount,
    ),
    contextBloat: weightedMean(
      prevSignals.contextBloat, prevCount, signalSums.contextBloat,
      signalSampleCount, sessionCount,
    ),
    promptStability: weightedMean(
      prevSignals.promptStability, prevCount, signalSums.promptStability,
      signalSampleCount, sessionCount,
    ),
  };

  const skillId = samples[0]?.skillId ?? existing?.skillId ?? "unknown";

  return {
    profile: {
      skillId,
      granularity,
      granularityKey,
      sessionCount,
      drift: {
        mean: driftMean,
        p50: driftP50,
        p95: driftP95,
        trend,
        ...(sketch.count > 0 ? { sketch } : {}),
      },
      tokens: {
        meanInputTokens: meanInput,
        meanOutputTokens: meanOutput,
        meanCacheHitRate: meanCacheHit,
        totalCostNanoAiu: totalCost,
      },
      outcomes: {
        successRate,
        meanConvergenceTurns: meanConvergence,
        toolErrorRate,
      },
      signals,
      updatedAt: new Date().toISOString(),
    },
    samplesConsumed: samples.length,
  };
}
