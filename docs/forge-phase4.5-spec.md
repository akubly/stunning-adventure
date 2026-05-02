# Forge Phase 4.5 Architecture Specification — Local Feedback Loop

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-02  
**Status:** Proposal — awaiting team review  
**Phase boundary rule:** "If it observes session outcomes and prescribes improvements without cloud dependency, it's Phase 4.5."

---

## Overview

Phase 4.5 is the **Local Feedback Loop** — a profile-guided optimization (PGO) engine that runs entirely on local infrastructure. It extends the existing Prescriber + DBOM architecture into a closed-loop system: sessions produce telemetry → collectors aggregate signals → prescribers generate optimization prescriptions → the applier writes improved SKILL.md v2 artifacts → the next session benefits.

In the compiler metaphor, Phase 4.5 is the **optimizer pass**. Phases 2–4 built the compiler pipeline (front-end → IR → codegen → linker). Phase 4.5 adds the PGO feedback loop: runtime profiles feed back into the next compilation, producing increasingly optimized object code.

**Key constraint:** No cloud dependency. Phase 5 adds `AppInsightsSink` for production telemetry. Phase 4.5 uses `LocalDBOMSink` — everything stays in SQLite. The `TelemetrySink` abstraction bridges both phases.

**Aaron's design constraint:** Determinism > Token Cost. Always. The system optimizes for confidence in tool behavior first, cost reduction second. This ordering pervades every collector weight, every prescriber priority, and every drift threshold.

---

## 1. Architecture — Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          LOCAL FEEDBACK LOOP                                │
│                                                                             │
│  Session ──▶ CairnBridgeEvent stream                                        │
│                 │                                                           │
│                 ▼                                                           │
│  ┌──────────────────────────┐                                               │
│  │   Telemetry Collectors   │                                               │
│  │  ┌────────┐ ┌─────────┐  │                                               │
│  │  │ Drift  │ │  Token  │  │                                               │
│  │  └────┬───┘ └────┬────┘  │                                               │
│  │  ┌────┴──────────┴────┐  │                                               │
│  │  │     Outcome        │  │                                               │
│  │  └────────┬───────────┘  │                                               │
│  └───────────┼──────────────┘                                               │
│              ▼                                                              │
│  ┌──────────────────────┐        ┌─────────────────────────┐                │
│  │   signal_samples     │───────▶│  execution_profiles     │                │
│  │   (raw, 7-day TTL)   │  agg   │  (aggregated hot paths) │                │
│  └──────────────────────┘        └──────────┬──────────────┘                │
│                                             │                               │
│              ┌──────────────────────────────┘                               │
│              ▼                                                              │
│  ┌─────────────────────────────┐                                            │
│  │   Curator (existing)        │                                            │
│  │   cursor-based aggregation  │                                            │
│  └──────────┬──────────────────┘                                            │
│             ▼                                                               │
│  ┌──────────────────────────────┐                                           │
│  │   Prescribers                │                                           │
│  │  ┌────────────┐ ┌──────────┐ │                                           │
│  │  │  Prompt    │ │  Token   │ │                                           │
│  │  │  Optimize  │ │  Optimize│ │                                           │
│  │  └─────┬──────┘ └────┬────┘ │                                           │
│  └────────┼──────────────┼─────┘                                            │
│           ▼              ▼                                                  │
│  ┌──────────────────────────────┐                                           │
│  │   optimization_hints         │                                           │
│  │   (prescriptions + scoring)  │                                           │
│  └──────────┬───────────────────┘                                           │
│             ▼                                                               │
│  ┌──────────────────────────────┐                                           │
│  │   Optimization Applier       │                                           │
│  │   → SKILL.md v2 frontmatter  │                                           │
│  │   → Self-tuning parameters   │                                           │
│  └──────────────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Design: `packages/forge/src/telemetry/`

### 2.1 File Structure

```
packages/forge/src/telemetry/
├── index.ts              # Barrel exports
├── types.ts              # Telemetry-local types
├── collectors.ts         # DriftCollector, TokenCollector, OutcomeCollector
├── drift.ts              # Drift score computation + thresholds
├── sink.ts               # LocalDBOMSink (TelemetrySink implementation)
└── aggregator.ts         # Incremental aggregation (signal_samples → execution_profiles)
```

### 2.2 Public API

```typescript
// telemetry/index.ts — Barrel

export {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
  type DriftCollector,
  type TokenCollector,
  type OutcomeCollector,
  type TelemetryCollector,
} from "./collectors.js";

export {
  computeDriftScore,
  classifyDriftLevel,
  type DriftScore,
  type DriftLevel,
  type DriftSignals,
} from "./drift.js";

export {
  createLocalDBOMSink,
  type LocalDBOMSink,
} from "./sink.js";

export {
  aggregateSignals,
  type AggregationResult,
} from "./aggregator.js";

export type {
  SignalSample,
  ExecutionProfile,
  TelemetryEvent,
} from "./types.js";
```

### 2.3 Telemetry Types

```typescript
// telemetry/types.ts

export type SignalKind = "drift" | "token" | "outcome";

export interface SignalSample {
  /** Signal type. */
  kind: SignalKind;
  /** Session that produced this sample. */
  sessionId: string;
  /** Skill ID this sample relates to (if applicable). */
  skillId?: string;
  /** The raw signal value. */
  value: number;
  /** Structured metadata for the signal. */
  metadata: Record<string, unknown>;
  /** ISO-8601 timestamp. */
  collectedAt: string;
}

export interface ExecutionProfile {
  /** Skill ID this profile aggregates. */
  skillId: string;
  /** Profile granularity level. */
  granularity: ProfileGranularity;
  /** Granularity key (e.g., user ID, model ID, or "global"). */
  granularityKey: string;
  /** Number of sessions aggregated into this profile. */
  sessionCount: number;
  /** Aggregated drift statistics. */
  drift: {
    mean: number;
    p50: number;
    p95: number;
    trend: "improving" | "stable" | "degrading";
  };
  /** Aggregated token statistics. */
  tokens: {
    meanInputTokens: number;
    meanOutputTokens: number;
    meanCacheHitRate: number;
    totalCostNanoAiu: number;
  };
  /** Aggregated outcome statistics. */
  outcomes: {
    successRate: number;
    meanConvergenceTurns: number;
    toolErrorRate: number;
  };
  /** Last updated timestamp. */
  updatedAt: string;
}

export type ProfileGranularity = "per-skill" | "per-user" | "per-model" | "global";

export interface TelemetryEvent {
  kind: SignalKind;
  sample: SignalSample;
}
```

### 2.4 Drift Score Computation

```typescript
// telemetry/drift.ts

export type DriftLevel = "GREEN" | "YELLOW" | "RED";

export interface DriftSignals {
  /** How quickly the session converged on a solution (0 = instant, 1 = never). */
  convergence: number;
  /** Token usage relative to budget (0 = none, 1 = exhausted). */
  tokenPressure: number;
  /** Entropy in tool selection (0 = deterministic, 1 = random). */
  toolEntropy: number;
  /** Context window utilization (0 = empty, 1 = full). */
  contextBloat: number;
  /** Prompt template stability (0 = identical, 1 = completely different). */
  promptStability: number;
}

/** Signal weights — determinism signals weighted higher per Aaron's constraint. */
const DRIFT_WEIGHTS: Record<keyof DriftSignals, number> = {
  convergence: 0.30,     // Determinism indicator — highest weight
  tokenPressure: 0.15,   // Cost indicator — lower priority
  toolEntropy: 0.25,     // Determinism indicator — high weight
  contextBloat: 0.15,    // Efficiency indicator
  promptStability: 0.15, // Determinism indicator
};

/**
 * Compute a weighted drift score from raw signals.
 * All signals normalized to [0, 1]. Score is weighted sum.
 */
export function computeDriftScore(signals: DriftSignals): DriftScore {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const weighted =
    clamp(signals.convergence) * DRIFT_WEIGHTS.convergence +
    clamp(signals.tokenPressure) * DRIFT_WEIGHTS.tokenPressure +
    clamp(signals.toolEntropy) * DRIFT_WEIGHTS.toolEntropy +
    clamp(signals.contextBloat) * DRIFT_WEIGHTS.contextBloat +
    clamp(signals.promptStability) * DRIFT_WEIGHTS.promptStability;

  return {
    score: Math.round(weighted * 1000) / 1000,
    level: classifyDriftLevel(weighted),
    signals,
    weights: { ...DRIFT_WEIGHTS },
  };
}

/**
 * Classify drift score into GREEN/YELLOW/RED.
 *
 * GREEN  < 0.1  — system is deterministic, on track
 * YELLOW 0.1–0.3 — drift detected, monitor closely
 * RED    ≥ 0.3  — significant drift, prescriptions needed
 */
export function classifyDriftLevel(score: number): DriftLevel {
  if (score < 0.1) return "GREEN";
  if (score < 0.3) return "YELLOW";
  return "RED";
}

export interface DriftScore {
  score: number;
  level: DriftLevel;
  signals: DriftSignals;
  weights: Record<keyof DriftSignals, number>;
}
```

### 2.5 Telemetry Collectors

```typescript
// telemetry/collectors.ts

import type { CairnBridgeEvent } from "@akubly/types";
import type { SignalSample, SignalKind } from "./types.js";
import { computeDriftScore, type DriftScore, type DriftSignals } from "./drift.js";

/** Base collector interface — all collectors share this shape. */
export interface TelemetryCollector {
  readonly kind: SignalKind;
  /** Ingest a bridge event. Returns a sample if the event is relevant. */
  collect(event: CairnBridgeEvent): SignalSample | null;
  /** Flush any buffered state into a final sample at session end. */
  flush(sessionId: string): SignalSample | null;
}

// --- Drift Collector ---

export interface DriftCollector extends TelemetryCollector {
  readonly kind: "drift";
  /** Current drift score (updated incrementally). */
  readonly currentScore: DriftScore | null;
}

/**
 * Create a drift collector that tracks convergence, tool entropy,
 * context bloat, and prompt stability across a session.
 */
export function createDriftCollector(): DriftCollector {
  let toolCounts = new Map<string, number>();
  let turnCount = 0;
  let convergedTurn: number | null = null;
  let maxContextTokens = 0;
  let lastContextTokens = 0;
  let contextLimit = 0;
  let promptHashes = new Set<string>();
  let currentScore: DriftScore | null = null;

  function updateSignals(): DriftSignals {
    const totalToolCalls = Array.from(toolCounts.values()).reduce((a, b) => a + b, 0);
    const uniqueTools = toolCounts.size;

    // Tool entropy: normalized Shannon entropy
    let entropy = 0;
    if (totalToolCalls > 0 && uniqueTools > 1) {
      for (const count of toolCounts.values()) {
        const p = count / totalToolCalls;
        if (p > 0) entropy -= p * Math.log2(p);
      }
      entropy /= Math.log2(uniqueTools); // normalize to [0, 1]
    }

    return {
      convergence: convergedTurn !== null
        ? Math.min(1, convergedTurn / Math.max(turnCount, 1))
        : 1, // never converged = max drift
      tokenPressure: contextLimit > 0
        ? lastContextTokens / contextLimit
        : 0,
      toolEntropy: Math.min(1, entropy),
      contextBloat: contextLimit > 0
        ? maxContextTokens / contextLimit
        : 0,
      promptStability: promptHashes.size > 0
        ? Math.min(1, (promptHashes.size - 1) / Math.max(turnCount, 1))
        : 0,
    };
  }

  return {
    kind: "drift",
    get currentScore() { return currentScore; },

    collect(event: CairnBridgeEvent): SignalSample | null {
      // Track tool usage for entropy
      if (event.eventType === "tool_call_started" && event.payload?.toolName) {
        const name = event.payload.toolName as string;
        toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
      }

      // Track turns
      if (event.eventType === "turn_completed") {
        turnCount++;
      }

      // Track context window
      if (event.eventType === "usage_reported" && event.payload) {
        const tokens = (event.payload.contextTokens as number) ?? 0;
        const limit = (event.payload.tokenLimit as number) ?? 0;
        if (tokens > maxContextTokens) maxContextTokens = tokens;
        lastContextTokens = tokens;
        if (limit > 0) contextLimit = limit;
      }

      // Track convergence (session ended with success)
      if (event.eventType === "session_completed") {
        convergedTurn = turnCount;
      }

      // Compute incremental drift score
      const signals = updateSignals();
      currentScore = computeDriftScore(signals);

      return null; // Drift emits on flush, not per-event
    },

    flush(sessionId: string): SignalSample | null {
      if (turnCount === 0) return null;

      const signals = updateSignals();
      currentScore = computeDriftScore(signals);

      return {
        kind: "drift",
        sessionId,
        value: currentScore.score,
        metadata: {
          signals: currentScore.signals,
          level: currentScore.level,
          turnCount,
          toolsUsed: toolCounts.size,
        },
        collectedAt: new Date().toISOString(),
      };
    },
  };
}

// --- Token Collector ---

export interface TokenCollector extends TelemetryCollector {
  readonly kind: "token";
}

/**
 * Create a token collector that tracks per-model token usage,
 * cache hit rates, and cost accumulation.
 */
export function createTokenCollector(): TokenCollector {
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCostNanoAiu = 0;
  let callCount = 0;

  return {
    kind: "token",

    collect(event: CairnBridgeEvent): SignalSample | null {
      if (event.eventType !== "usage_reported" || !event.payload) return null;

      const input = (event.payload.inputTokens as number) ?? 0;
      const output = (event.payload.outputTokens as number) ?? 0;
      const cacheRead = (event.payload.cacheReadTokens as number) ?? 0;
      const cacheWrite = (event.payload.cacheWriteTokens as number) ?? 0;
      const cost = (event.payload.costNanoAiu as number) ?? 0;

      totalInput += input;
      totalOutput += output;
      totalCacheRead += cacheRead;
      totalCacheWrite += cacheWrite;
      totalCostNanoAiu += cost;
      callCount++;

      return null; // Token emits on flush
    },

    flush(sessionId: string): SignalSample | null {
      if (callCount === 0) return null;

      const totalTokens = totalInput + totalOutput;
      const cacheHitRate = totalTokens > 0
        ? totalCacheRead / totalTokens
        : 0;

      return {
        kind: "token",
        sessionId,
        value: totalCostNanoAiu,
        metadata: {
          totalInput,
          totalOutput,
          totalCacheRead,
          totalCacheWrite,
          cacheHitRate,
          callCount,
          costNanoAiu: totalCostNanoAiu,
        },
        collectedAt: new Date().toISOString(),
      };
    },
  };
}

// --- Outcome Collector ---

export interface OutcomeCollector extends TelemetryCollector {
  readonly kind: "outcome";
}

/**
 * Create an outcome collector that tracks session success/failure,
 * convergence turns, and tool error rates.
 */
export function createOutcomeCollector(): OutcomeCollector {
  let toolCalls = 0;
  let toolErrors = 0;
  let turnCount = 0;
  let succeeded = false;

  return {
    kind: "outcome",

    collect(event: CairnBridgeEvent): SignalSample | null {
      if (event.eventType === "tool_call_started") toolCalls++;
      if (event.eventType === "tool_call_failed") toolErrors++;
      if (event.eventType === "turn_completed") turnCount++;
      if (event.eventType === "session_completed") succeeded = true;

      return null; // Outcome emits on flush
    },

    flush(sessionId: string): SignalSample | null {
      return {
        kind: "outcome",
        sessionId,
        value: succeeded ? 1 : 0,
        metadata: {
          succeeded,
          turnCount,
          toolCalls,
          toolErrors,
          toolErrorRate: toolCalls > 0 ? toolErrors / toolCalls : 0,
        },
        collectedAt: new Date().toISOString(),
      };
    },
  };
}
```

### 2.6 LocalDBOMSink — TelemetrySink Implementation

```typescript
// telemetry/sink.ts

import type { TelemetrySink } from "@akubly/types";
import type { SignalSample } from "./types.js";

export interface LocalDBOMSinkConfig {
  /** Function to persist signal samples. Injected to avoid direct Cairn import. */
  persistSample: (sample: SignalSample) => void;
  /** Maximum buffered samples before auto-flush. Default: 50. */
  bufferSize?: number;
}

export interface LocalDBOMSink extends TelemetrySink {
  /** Number of buffered samples awaiting flush. */
  readonly bufferedCount: number;
}

/**
 * Create a TelemetrySink that buffers signal samples and persists
 * them to local SQLite via an injected persistence function.
 *
 * This is the Phase 4.5 sink. Phase 5 replaces it with AppInsightsSink
 * for production telemetry. Both satisfy TelemetrySink.
 */
export function createLocalDBOMSink(config: LocalDBOMSinkConfig): LocalDBOMSink {
  const buffer: SignalSample[] = [];
  const maxBuffer = config.bufferSize ?? 50;
  let closed = false;

  function drainBuffer(): void {
    while (buffer.length > 0) {
      const sample = buffer.shift()!;
      try {
        config.persistSample(sample);
      } catch {
        // Fail-open: persistence failure must not kill the session
      }
    }
  }

  return {
    get bufferedCount() { return buffer.length; },

    emit(event) {
      if (closed) return;
      // LocalDBOMSink collects from CairnBridgeEvent stream
      // Actual signal extraction is done by collectors — this just buffers
      // The collectors produce SignalSamples; this sink is wired after them
    },

    async flush() {
      drainBuffer();
    },

    async close() {
      drainBuffer();
      closed = true;
    },
  };
}
```

### 2.7 Signal Aggregator

```typescript
// telemetry/aggregator.ts

import type { SignalSample, ExecutionProfile, ProfileGranularity } from "./types.js";

export interface AggregationResult {
  profile: ExecutionProfile;
  samplesConsumed: number;
}

/**
 * Incrementally aggregate signal samples into an execution profile.
 * Uses cursor-based aggregation consistent with Curator's pattern.
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

  const sessionCount = (existing?.sessionCount ?? 0) +
    new Set(samples.map((s) => s.sessionId)).size;

  // Drift aggregation — running statistics
  const driftValues = driftSamples.map((s) => s.value);
  const prevDriftMean = existing?.drift.mean ?? 0;
  const prevCount = existing?.sessionCount ?? 0;

  const allDriftValues = driftValues.length > 0
    ? driftValues
    : (existing ? [existing.drift.mean] : [0]);

  const driftMean = prevCount > 0 && driftValues.length > 0
    ? (prevDriftMean * prevCount + driftValues.reduce((a, b) => a + b, 0)) / sessionCount
    : allDriftValues.reduce((a, b) => a + b, 0) / allDriftValues.length;

  const sorted = [...allDriftValues].sort((a, b) => a - b);
  const driftP50 = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const driftP95 = sorted[Math.floor(sorted.length * 0.95)] ?? sorted[sorted.length - 1] ?? 0;

  // Determine trend from recent drift values
  const trend = driftValues.length >= 2
    ? driftValues[driftValues.length - 1]! < driftValues[0]!
      ? "improving" as const
      : driftValues[driftValues.length - 1]! > driftValues[0]!
        ? "degrading" as const
        : "stable" as const
    : existing?.drift.trend ?? ("stable" as const);

  // Token aggregation
  const tokenMeta = tokenSamples.map((s) => s.metadata);
  const meanInput = tokenMeta.length > 0
    ? tokenMeta.reduce((a, m) => a + ((m.totalInput as number) ?? 0), 0) / tokenMeta.length
    : existing?.tokens.meanInputTokens ?? 0;
  const meanOutput = tokenMeta.length > 0
    ? tokenMeta.reduce((a, m) => a + ((m.totalOutput as number) ?? 0), 0) / tokenMeta.length
    : existing?.tokens.meanOutputTokens ?? 0;
  const meanCacheHit = tokenMeta.length > 0
    ? tokenMeta.reduce((a, m) => a + ((m.cacheHitRate as number) ?? 0), 0) / tokenMeta.length
    : existing?.tokens.meanCacheHitRate ?? 0;
  const totalCost = (existing?.tokens.totalCostNanoAiu ?? 0) +
    tokenMeta.reduce((a, m) => a + ((m.costNanoAiu as number) ?? 0), 0);

  // Outcome aggregation
  const outcomeMeta = outcomeSamples.map((s) => s.metadata);
  const successCount = outcomeMeta.filter((m) => m.succeeded).length;
  const totalOutcomes = outcomeMeta.length + (existing ? existing.outcomes.successRate * prevCount : 0);
  const successRate = sessionCount > 0
    ? (successCount + (existing ? existing.outcomes.successRate * prevCount : 0)) / sessionCount
    : 0;
  const meanConvergence = outcomeMeta.length > 0
    ? outcomeMeta.reduce((a, m) => a + ((m.turnCount as number) ?? 0), 0) / outcomeMeta.length
    : existing?.outcomes.meanConvergenceTurns ?? 0;
  const toolErrorRate = outcomeMeta.length > 0
    ? outcomeMeta.reduce((a, m) => a + ((m.toolErrorRate as number) ?? 0), 0) / outcomeMeta.length
    : existing?.outcomes.toolErrorRate ?? 0;

  const skillId = samples[0]?.skillId ?? existing?.skillId ?? "unknown";

  return {
    profile: {
      skillId,
      granularity,
      granularityKey,
      sessionCount,
      drift: { mean: driftMean, p50: driftP50, p95: driftP95, trend },
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
      updatedAt: new Date().toISOString(),
    },
    samplesConsumed: samples.length,
  };
}
```

---

## 3. Module Design: `packages/forge/src/prescribers/`

### 3.1 File Structure

```
packages/forge/src/prescribers/
├── index.ts              # Barrel exports
├── types.ts              # Prescriber-local types
├── promptOptimizer.ts    # Prompt optimization prescriber
└── tokenOptimizer.ts     # Token efficiency prescriber
```

### 3.2 Prescriber Types

```typescript
// prescribers/types.ts

import type { ExecutionProfile } from "../telemetry/types.js";

export interface OptimizationHint {
  /** Unique hint ID. */
  id: string;
  /** Prescriber that generated this hint. */
  source: "prompt-optimizer" | "token-optimizer";
  /** Skill this hint targets. */
  skillId: string;
  /** Category of optimization. */
  category: OptimizationCategory;
  /** Human-readable description. */
  description: string;
  /** The specific change recommended. */
  recommendation: string;
  /** Estimated impact score (0–1, higher = more impactful). */
  impactScore: number;
  /** Confidence in the recommendation (0–1). */
  confidence: number;
  /** Profile data that supports this hint. */
  evidence: OptimizationEvidence;
  /** Provenance: which prescription generated this hint (Phase 4.5 linear provenance). */
  parentPrescriptionId?: string;
  /** Metric snapshot at time of generation. */
  metricSnapshot: MetricSnapshot;
  /** ISO-8601 timestamp. */
  generatedAt: string;
}

export type OptimizationCategory =
  | "prompt-structure"      // Reorder/restructure prompts for determinism
  | "tool-guidance"         // Improve tool selection hints
  | "context-management"    // Reduce context bloat
  | "cache-optimization"    // Improve cache hit rates
  | "model-selection"       // Suggest model changes
  | "convergence";          // Reduce turns to convergence

export interface OptimizationEvidence {
  /** Execution profile at time of analysis. */
  profile: ExecutionProfile;
  /** Specific metrics that triggered this recommendation. */
  triggerMetrics: Record<string, number>;
  /** Comparison baseline (previous profile, if available). */
  baseline?: ExecutionProfile;
}

/** Metric snapshot for provenance tracking (Phase 4.5 linear provenance). */
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
```

### 3.3 Prompt Optimizer Prescriber

```typescript
// prescribers/promptOptimizer.ts

import type { ExecutionProfile } from "../telemetry/types.js";
import type { OptimizationHint, PrescriberResult, MetricSnapshot } from "./types.js";
import { randomUUID } from "node:crypto";

export interface PromptOptimizerConfig {
  /** Minimum sessions before prescribing. Default: 3. */
  minSessions?: number;
  /** Drift threshold to trigger prompt prescriptions. Default: 0.2 (YELLOW). */
  driftThreshold?: number;
  /** Tool entropy threshold. Default: 0.5. */
  toolEntropyThreshold?: number;
}

/**
 * Analyze execution profiles and prescribe prompt optimizations.
 *
 * Priority: Determinism > Token Cost (Aaron's constraint).
 * Prompt structure changes target convergence and tool entropy first,
 * cost reduction second.
 */
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

  // 1. HIGH PRIORITY: Convergence issues (determinism)
  if (profile.outcomes.meanConvergenceTurns > 10) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "convergence",
      description: `High convergence turns (mean: ${profile.outcomes.meanConvergenceTurns.toFixed(1)})`,
      recommendation: "Add explicit completion criteria to skill prompt. Include 'done when' clause.",
      impactScore: 0.8,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: { profile, triggerMetrics: { convergenceTurns: profile.outcomes.meanConvergenceTurns } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
    });
  }

  // 2. HIGH PRIORITY: Drift above threshold (determinism)
  if (profile.drift.mean > driftThreshold) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "prompt-structure",
      description: `Drift score above threshold (mean: ${profile.drift.mean.toFixed(3)}, threshold: ${driftThreshold})`,
      recommendation: "Restructure prompt with numbered steps and explicit constraints. Reduce ambiguity in tool selection guidance.",
      impactScore: 0.7,
      confidence: Math.min(1, profile.sessionCount / 5),
      evidence: { profile, triggerMetrics: { driftMean: profile.drift.mean, driftP95: profile.drift.p95 } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
    });
  }

  // 3. MEDIUM PRIORITY: Tool entropy (determinism)
  if (profile.drift.p95 > entropyThreshold) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "tool-guidance",
      description: `High tool entropy at p95 (${profile.drift.p95.toFixed(3)})`,
      recommendation: "Add explicit tool preference order in skill. Use 'prefer X over Y when Z' clauses.",
      impactScore: 0.6,
      confidence: Math.min(1, profile.sessionCount / 5),
      evidence: { profile, triggerMetrics: { driftP95: profile.drift.p95 } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
    });
  }

  // 4. LOWER PRIORITY: Context bloat (efficiency)
  if (profile.tokens.meanInputTokens > 50000) {
    hints.push({
      id: randomUUID(),
      source: "prompt-optimizer",
      skillId: profile.skillId,
      category: "context-management",
      description: `High mean input tokens (${profile.tokens.meanInputTokens.toFixed(0)})`,
      recommendation: "Add context pruning hints. Use progressive disclosure — reference summaries, not full content.",
      impactScore: 0.5,
      confidence: Math.min(1, profile.sessionCount / 5),
      evidence: { profile, triggerMetrics: { meanInputTokens: profile.tokens.meanInputTokens } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
    });
  }

  return { hints, analysisTimeMs: Date.now() - startTime };
}

function buildSnapshot(profile: ExecutionProfile): MetricSnapshot {
  return {
    driftScore: profile.drift.mean,
    driftLevel: profile.drift.mean < 0.1 ? "GREEN" : profile.drift.mean < 0.3 ? "YELLOW" : "RED",
    tokenCostNanoAiu: profile.tokens.totalCostNanoAiu,
    successRate: profile.outcomes.successRate,
    convergenceTurns: profile.outcomes.meanConvergenceTurns,
    cacheHitRate: profile.tokens.meanCacheHitRate,
  };
}
```

### 3.4 Token Optimizer Prescriber

```typescript
// prescribers/tokenOptimizer.ts

import type { ExecutionProfile } from "../telemetry/types.js";
import type { OptimizationHint, PrescriberResult, MetricSnapshot } from "./types.js";
import { randomUUID } from "node:crypto";

export interface TokenOptimizerConfig {
  /** Minimum sessions before prescribing. Default: 5. */
  minSessions?: number;
  /** Cache hit rate threshold below which to prescribe. Default: 0.3. */
  cacheHitThreshold?: number;
  /** Cost per session threshold (nanoAIU). Default: 1_000_000. */
  costThreshold?: number;
}

/**
 * Analyze execution profiles and prescribe token optimizations.
 *
 * Secondary priority to prompt optimizer (Determinism > Token Cost).
 * Only prescribes when determinism metrics are acceptable (drift < 0.3).
 */
export function analyzeTokenOptimizations(
  profile: ExecutionProfile,
  config?: TokenOptimizerConfig,
): PrescriberResult {
  const startTime = Date.now();
  const hints: OptimizationHint[] = [];
  const minSessions = config?.minSessions ?? 5;
  const cacheThreshold = config?.cacheHitThreshold ?? 0.3;
  const costThreshold = config?.costThreshold ?? 1_000_000;

  if (profile.sessionCount < minSessions) {
    return { hints, analysisTimeMs: Date.now() - startTime };
  }

  // Guard: Don't optimize tokens if drift is RED — fix determinism first
  if (profile.drift.mean >= 0.3) {
    return { hints, analysisTimeMs: Date.now() - startTime };
  }

  const snapshot = buildSnapshot(profile);

  // 1. Low cache hit rate
  if (profile.tokens.meanCacheHitRate < cacheThreshold) {
    hints.push({
      id: randomUUID(),
      source: "token-optimizer",
      skillId: profile.skillId,
      category: "cache-optimization",
      description: `Low cache hit rate (${(profile.tokens.meanCacheHitRate * 100).toFixed(1)}%)`,
      recommendation: "Stabilize prompt prefix. Move volatile content to end of prompt. Add cacheable_tools frontmatter.",
      impactScore: 0.6,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: { profile, triggerMetrics: { cacheHitRate: profile.tokens.meanCacheHitRate } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
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
      recommendation: "Consider model downgrade for routine tasks. Use budget-aware strategy with tighter limits.",
      impactScore: 0.5,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: { profile, triggerMetrics: { costPerSession } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
    });
  }

  // 3. High output-to-input ratio (verbose responses)
  const outputRatio = profile.tokens.meanOutputTokens /
    Math.max(profile.tokens.meanInputTokens, 1);
  if (outputRatio > 0.5) {
    hints.push({
      id: randomUUID(),
      source: "token-optimizer",
      skillId: profile.skillId,
      category: "context-management",
      description: `High output/input ratio (${(outputRatio * 100).toFixed(1)}%)`,
      recommendation: "Add output format constraints. Use 'respond concisely' and structured output directives.",
      impactScore: 0.4,
      confidence: Math.min(1, profile.sessionCount / 10),
      evidence: { profile, triggerMetrics: { outputRatio } },
      metricSnapshot: snapshot,
      generatedAt: new Date().toISOString(),
    });
  }

  return { hints, analysisTimeMs: Date.now() - startTime };
}

function buildSnapshot(profile: ExecutionProfile): MetricSnapshot {
  return {
    driftScore: profile.drift.mean,
    driftLevel: profile.drift.mean < 0.1 ? "GREEN" : profile.drift.mean < 0.3 ? "YELLOW" : "RED",
    tokenCostNanoAiu: profile.tokens.totalCostNanoAiu,
    successRate: profile.outcomes.successRate,
    convergenceTurns: profile.outcomes.meanConvergenceTurns,
    cacheHitRate: profile.tokens.meanCacheHitRate,
  };
}
```

---

## 4. Module Design: `packages/forge/src/applier/`

### 4.1 File Structure

```
packages/forge/src/applier/
├── index.ts              # Barrel exports
├── optimizer.ts          # Optimization applier — hints → SKILL.md v2 changes
└── selfTuning.ts         # Self-tuning strategy parameter adjustment
```

### 4.2 Optimization Applier

```typescript
// applier/optimizer.ts

import type { OptimizationHint } from "../prescribers/types.js";

export interface ApplierConfig {
  /** Minimum confidence to apply a hint automatically. Default: 0.7. */
  autoApplyThreshold?: number;
  /** Maximum hints to apply per cycle. Default: 5. */
  maxHintsPerCycle?: number;
}

export interface AppliedOptimization {
  hintId: string;
  category: string;
  applied: boolean;
  /** What was changed. */
  change: string;
  /** Impact score from the hint. */
  impactScore: number;
}

export interface OptimizationApplierResult {
  applied: AppliedOptimization[];
  skipped: Array<{ hintId: string; reason: string }>;
  /** Updated SKILL.md v2 frontmatter additions. */
  frontmatterPatch: SkillFrontmatterPatch;
}

export interface SkillFrontmatterPatch {
  /** Cacheable tool declarations for prefix stability. */
  cacheableTools?: string[];
  /** Optimization hints embedded in frontmatter. */
  optimizationHints?: Array<{
    category: string;
    recommendation: string;
    appliedAt: string;
  }>;
  /** Self-tuning parameter overrides. */
  tuningParameters?: Record<string, number>;
}

/**
 * Apply optimization hints to produce SKILL.md v2 changes.
 *
 * Hints are sorted by impact score (highest first) and filtered
 * by confidence threshold. Applied hints become frontmatter patches
 * that the export pipeline incorporates in the next compilation.
 *
 * Loop trigger: Manual in Forge, Curator-driven in Cairn (Aaron's decision).
 */
export function applyOptimizations(
  hints: OptimizationHint[],
  config?: ApplierConfig,
): OptimizationApplierResult {
  const threshold = config?.autoApplyThreshold ?? 0.7;
  const maxHints = config?.maxHintsPerCycle ?? 5;

  // Sort by impact score descending
  const sorted = [...hints].sort((a, b) => b.impactScore - a.impactScore);

  const applied: AppliedOptimization[] = [];
  const skipped: Array<{ hintId: string; reason: string }> = [];
  const frontmatterPatch: SkillFrontmatterPatch = {};

  for (const hint of sorted) {
    if (applied.length >= maxHints) {
      skipped.push({ hintId: hint.id, reason: "max hints per cycle reached" });
      continue;
    }

    if (hint.confidence < threshold) {
      skipped.push({
        hintId: hint.id,
        reason: `confidence ${hint.confidence.toFixed(2)} below threshold ${threshold}`,
      });
      continue;
    }

    // Apply by category
    switch (hint.category) {
      case "cache-optimization":
        frontmatterPatch.cacheableTools ??= [];
        // Extract tool names from evidence if available
        applied.push({
          hintId: hint.id,
          category: hint.category,
          applied: true,
          change: hint.recommendation,
          impactScore: hint.impactScore,
        });
        break;

      default:
        // All other categories become optimization hints in frontmatter
        frontmatterPatch.optimizationHints ??= [];
        frontmatterPatch.optimizationHints.push({
          category: hint.category,
          recommendation: hint.recommendation,
          appliedAt: new Date().toISOString(),
        });
        applied.push({
          hintId: hint.id,
          category: hint.category,
          applied: true,
          change: hint.recommendation,
          impactScore: hint.impactScore,
        });
        break;
    }
  }

  return { applied, skipped, frontmatterPatch };
}
```

### 4.3 Self-Tuning Strategy Parameters

```typescript
// applier/selfTuning.ts

import type { ExecutionProfile } from "../telemetry/types.js";

export interface StrategyParameters {
  /** Token budget threshold before triggering model downgrade (0–1). */
  budgetThreshold: number;
  /** Context pressure limit before triggering context pruning (0–1). */
  contextPressureLimit: number;
  /** Maximum model switches per session. */
  maxModelSwitches: number;
  /** Exploration budget — willingness to try suboptimal paths (0–1). */
  explorationBudget: number;
}

/** Conservative defaults. */
export const DEFAULT_STRATEGY_PARAMS: Readonly<StrategyParameters> = {
  budgetThreshold: 0.8,
  contextPressureLimit: 0.7,
  maxModelSwitches: 3,
  explorationBudget: 0.2, // Generous per Aaron's directive
};

/**
 * Adjust strategy parameters based on execution profile.
 *
 * Self-tuning is conservative: parameters move toward observed optima
 * with dampening to prevent oscillation. Changes are bounded to ±10%
 * per cycle.
 *
 * Exploration budget is kept generous per Aaron's decision:
 * "diminishing returns worth it when scaled across future of software engineering."
 */
export function tuneParameters(
  current: StrategyParameters,
  profile: ExecutionProfile,
): StrategyParameters {
  const dampening = 0.1; // Max 10% change per cycle

  // Budget threshold: lower if sessions consistently hit budget limits
  const tokenPressure = profile.tokens.meanInputTokens > 0
    ? profile.tokens.totalCostNanoAiu / (profile.sessionCount * 1_000_000)
    : 0;
  const budgetDelta = tokenPressure > current.budgetThreshold
    ? -dampening
    : tokenPressure < current.budgetThreshold * 0.5
      ? dampening * 0.5
      : 0;

  // Context pressure: adjust based on drift from context bloat
  const contextDelta = profile.drift.mean > 0.2
    ? -dampening // Tighten if drifting
    : profile.drift.mean < 0.05
      ? dampening * 0.5 // Relax slightly if very stable
      : 0;

  // Model switches: reduce if switching correlates with low success
  const switchDelta = profile.outcomes.successRate < 0.7
    ? -1
    : profile.outcomes.successRate > 0.95
      ? 1
      : 0;

  return {
    budgetThreshold: clamp(current.budgetThreshold + budgetDelta, 0.5, 0.95),
    contextPressureLimit: clamp(current.contextPressureLimit + contextDelta, 0.4, 0.9),
    maxModelSwitches: clamp(current.maxModelSwitches + switchDelta, 1, 10),
    explorationBudget: Math.max(0.15, current.explorationBudget), // Floor per Aaron
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

---

## 5. DB Schema Changes — Migration 011

### 5.1 New Migration: `011-telemetry-feedback.ts`

```typescript
// packages/cairn/src/db/migrations/011-telemetry-feedback.ts

import type { Migration } from '../schema.js';

export const migration011: Migration = {
  version: 11,
  description: 'Telemetry feedback loop: signal samples, execution profiles, optimization hints',
  up(db) {
    db.exec(`
      -- Raw signal samples (7-day TTL, capped at 10K rows)
      CREATE TABLE signal_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL CHECK (kind IN ('drift', 'token', 'outcome')),
        session_id TEXT NOT NULL,
        skill_id TEXT,
        value REAL NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        collected_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_signal_samples_kind ON signal_samples(kind);
      CREATE INDEX idx_signal_samples_session ON signal_samples(session_id);
      CREATE INDEX idx_signal_samples_skill ON signal_samples(skill_id);
      CREATE INDEX idx_signal_samples_collected ON signal_samples(collected_at);

      -- Aggregated execution profiles (PGO equivalent)
      CREATE TABLE execution_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_id TEXT NOT NULL,
        granularity TEXT NOT NULL CHECK (
          granularity IN ('per-skill', 'per-user', 'per-model', 'global')
        ),
        granularity_key TEXT NOT NULL DEFAULT 'global',
        session_count INTEGER NOT NULL DEFAULT 0,
        -- Drift statistics
        drift_mean REAL NOT NULL DEFAULT 0,
        drift_p50 REAL NOT NULL DEFAULT 0,
        drift_p95 REAL NOT NULL DEFAULT 0,
        drift_trend TEXT NOT NULL DEFAULT 'stable'
          CHECK (drift_trend IN ('improving', 'stable', 'degrading')),
        -- Token statistics
        token_mean_input REAL NOT NULL DEFAULT 0,
        token_mean_output REAL NOT NULL DEFAULT 0,
        token_mean_cache_hit REAL NOT NULL DEFAULT 0,
        token_total_cost INTEGER NOT NULL DEFAULT 0,
        -- Outcome statistics
        outcome_success_rate REAL NOT NULL DEFAULT 0,
        outcome_mean_convergence REAL NOT NULL DEFAULT 0,
        outcome_tool_error_rate REAL NOT NULL DEFAULT 0,
        -- Metadata
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE UNIQUE INDEX idx_execution_profiles_key
        ON execution_profiles(skill_id, granularity, granularity_key);

      -- Optimization hints (prescriptions with impact scoring)
      CREATE TABLE optimization_hints (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL CHECK (source IN ('prompt-optimizer', 'token-optimizer')),
        skill_id TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        recommendation TEXT NOT NULL,
        impact_score REAL NOT NULL DEFAULT 0,
        confidence REAL NOT NULL DEFAULT 0,
        evidence TEXT NOT NULL DEFAULT '{}',
        -- Provenance (Phase 4.5 linear provenance)
        parent_prescription_id TEXT,
        metric_snapshot TEXT NOT NULL DEFAULT '{}',
        -- Lifecycle
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending', 'accepted', 'applied', 'rejected',
            'deferred', 'expired', 'suppressed', 'failed'
          )),
        generated_at TEXT NOT NULL,
        applied_at TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE INDEX idx_optimization_hints_skill ON optimization_hints(skill_id);
      CREATE INDEX idx_optimization_hints_status ON optimization_hints(status);
      CREATE INDEX idx_optimization_hints_source ON optimization_hints(source);
      CREATE INDEX idx_optimization_hints_parent ON optimization_hints(parent_prescription_id);
    `);
  },
};
```

### 5.2 Schema Design Notes

| Table | Design Decision | Rationale |
|-------|----------------|-----------|
| `signal_samples` | `metadata` as JSON text | Signal metadata varies by kind. Structured fields would require separate tables per kind. |
| `signal_samples` | 7-day TTL enforced by Curator, not DB trigger | Consistent with Curator's existing sweep pattern. Trigger-based TTL adds maintenance. |
| `signal_samples` | 10K row cap enforced by Curator | Same reasoning. Curator already manages table sizes. |
| `execution_profiles` | Flattened statistics columns | Queryable without JSON parsing. Same pattern as `dbom_artifacts`. |
| `execution_profiles` | `UNIQUE(skill_id, granularity, granularity_key)` | One profile per skill×granularity×key. Upsert semantics. |
| `optimization_hints` | `id` as TEXT (UUID) | Hints are generated by prescribers with `randomUUID()`. Integer autoincrement adds no value. |
| `optimization_hints` | Prescription lifecycle states | Reuses the existing prescription state machine from Phase 7: `pending → accepted → applied/rejected/deferred/expired/suppressed/failed`. |
| `optimization_hints` | `parent_prescription_id` | Phase 4.5 linear provenance. Links hints to the prescription that triggered analysis. Phase 4.6 adds change vector learning on top. |
| `optimization_hints` | `metric_snapshot` as JSON text | Point-in-time metrics for provenance. Small payload, rarely queried directly. |

### 5.3 Schema Integration

Register migration 011 in `packages/cairn/src/db/schema.ts`:

```typescript
import { migration011 } from './migrations/011-telemetry-feedback.js';

const migrations: Migration[] = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008,
  migration009, migration010, migration011,
];
```

---

## 6. SKILL.md v2 Frontmatter Extensions

Phase 4.5 extends the SKILL.md frontmatter schema established in Phase 4 with optimization metadata:

```yaml
---
name: "Skill Name"
description: "What this skill does"
domain: "engineering"
confidence: "high"
source: "forge-compiled"
tools:
  - name: "edit"
    when: "modifying source files"
# --- Phase 4 provenance (unchanged) ---
provenance:
  compiler: "forge"
  version: "0.1.0"
  session_id: "abc-123"
  compiled_at: "2026-05-02T12:00:00.000Z"
  dbom:
    root_hash: "a1b2c3..."
    total_decisions: 12
# --- Phase 4.5 additions ---
optimization:
  profile_sessions: 15
  drift_score: 0.08
  drift_level: "GREEN"
  cache_hit_rate: 0.72
  cacheable_tools:
    - "grep"
    - "glob"
    - "view"
  hints_applied: 3
  last_optimized: "2026-05-02T14:00:00.000Z"
  tuning:
    budget_threshold: 0.82
    context_pressure_limit: 0.68
    max_model_switches: 3
    exploration_budget: 0.2
---
```

The `optimization` block is optional. Skills without it run with `DEFAULT_STRATEGY_PARAMS`. The export pipeline's `attachStage` merges the applier's `SkillFrontmatterPatch` into this block.

---

## 7. Caching Strategy

### 7.1 Four-Layer Cache Hierarchy

| Layer | Scope | TTL | Storage | Contents |
|-------|-------|-----|---------|----------|
| **L1** | In-memory (per session) | Session lifetime | `Map<string, T>` | Drift score, current collectors, parsed skill metadata |
| **L2** | Session-scoped (SQLite) | Session lifetime | `signal_samples` | Raw signal data for the active session |
| **L3** | Short-TTL (SQLite) | 7 days | `signal_samples` (with TTL sweep) | Cross-session signal history for aggregation |
| **L4** | Long-TTL (SQLite) | Indefinite | `execution_profiles`, `optimization_hints` | Aggregated profiles and applied hints |

### 7.2 Cache Invalidation Rules

| Event | Invalidation |
|-------|-------------|
| New signal sample ingested | L1 drift score recalculated |
| Aggregation cycle runs | L3 samples consumed → L4 profile updated |
| Curator TTL sweep | L3 samples > 7 days deleted |
| Curator row cap sweep | L3 oldest samples deleted when > 10K rows |
| Skill re-exported | L4 profile retained, optimization hints marked `applied` |
| Manual reset | All layers cleared for the skill |

### 7.3 Prompt Prefix Stability for Cache Hits

SDK prompt caching works on prefix matching. To maximize cache hit rates:

1. **Stable prefix:** System prompt + skill definition + tool declarations go first (rarely change).
2. **Volatile suffix:** Session-specific context, user messages, tool outputs go last.
3. **`cacheable_tools` frontmatter:** Declares which tools produce deterministic output suitable for caching. The runtime can reorder tool declarations to cluster cacheable tools in the stable prefix.

---

## 8. LX Design — Progressive Disclosure

Phase 4.5 telemetry follows Valanice's 4-tier progressive disclosure model. "Peripheral vision, not dashboard."

### 8.1 Four Tiers

| Tier | Name | What the User Sees | Implementation |
|------|------|--------------------|----------------|
| **0** | Zero-UI | Nothing. System works silently. | Collectors run, profiles aggregate, hints apply — all invisible. |
| **1** | Felt Experience | Session feels "smoother" over time. | Applied optimizations improve prompt structure, reduce drift. No notification. |
| **2** | Conversational Hints | Brief notes in session output when relevant. | "Optimization applied: prompt restructured for determinism (drift: 0.08 → GREEN)." |
| **3** | Deep Diagnostics | Full profile data on explicit request. | MCP tool `get_optimization_profile` returns full `ExecutionProfile` + hint history. |

### 8.2 Tier Triggers

- **Tier 0 → 1:** Always (optimization effects are passive).
- **Tier 1 → 2:** When drift crosses threshold (YELLOW → GREEN after optimization) or when a hint is first applied.
- **Tier 2 → 3:** Explicit user request via MCP tool or `--diagnostics` flag.

---

## 9. Integration Points

### 9.1 Prescriber IS the Local PGO Engine

The existing Prescriber infrastructure (Phase 7 in Cairn) already implements the observe → pattern → prescription pipeline. Phase 4.5 adds two new prescriber implementations (`promptOptimizer`, `tokenOptimizer`) that plug into the existing prescriber registration pattern.

**What's reused (80% of infrastructure):**

| Component | Phase 7 (existing) | Phase 4.5 (new) |
|-----------|-------------------|-----------------|
| Prescriber interface | `Prescriber` type in `cairn/agents/prescriber.ts` | Same interface, new implementations |
| Prescription lifecycle | 8-state machine (`pending → accepted → applied/...`) | Reused as `optimization_hints.status` |
| Curator aggregation | Cursor-based, incremental | Same pattern for signal → profile aggregation |
| DBOM persistence | `upsertDBOM()` | Extended with `signal_samples` persistence |
| Export pipeline | `runExportPipeline()` | Extended with `optimization` frontmatter block |

### 9.2 TelemetrySink Abstraction

```typescript
// Already defined in @akubly/types:
export interface TelemetrySink {
  emit(event: CairnBridgeEvent): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}
```

Phase 4.5 adds `LocalDBOMSink` (SQLite-backed). Phase 5 adds `AppInsightsSink` (cloud-backed). Both are injected via `ForgeClientOptions.defaultSink` or `ForgeSessionConfig.sink`.

### 9.3 FeedbackSource — Reading Optimization Data Back

```typescript
// New interface for @akubly/types (Phase 4.5 addition):

export interface FeedbackSource {
  /** Get the execution profile for a skill. */
  getProfile(skillId: string, granularity?: ProfileGranularity): ExecutionProfile | null;
  /** Get pending optimization hints for a skill. */
  getPendingHints(skillId: string): OptimizationHint[];
  /** Get strategy parameters (self-tuned or default). */
  getStrategyParameters(skillId: string): StrategyParameters;
}
```

`FeedbackSource` is the read-side complement to `TelemetrySink`. The Forge runtime consults it at session start to load the latest profile and apply any pending optimizations. In Forge, the loop trigger is manual (Aaron's decision). In Cairn, the Curator can trigger optimization cycles automatically.

### 9.4 Event Bridge Extension

No new bridge event types needed. The existing `CairnBridgeEvent` taxonomy covers all signals:
- `usage_reported` → token collector
- `tool_call_started` / `tool_call_failed` → drift + outcome collectors
- `turn_completed` → all collectors
- `session_completed` → outcome collector

The collectors are wired as `HookObserver` instances via the existing `ForgeSession.addObserver()` pattern.

---

## 10. Architecture Decision Records

### ADR-P4.5-001: Collectors as HookObservers, not a separate event bus

**Decision:** Telemetry collectors implement `HookObserver` and are registered via `ForgeSession.addObserver()`. No separate event bus or telemetry pipeline.

**Alternatives considered:**
1. **Separate telemetry event bus** — Clean separation, but duplicates the existing bridge → observer pattern. Two event paths for the same data.
2. **Post-hoc analysis from persisted events** — Simple, but no real-time drift scoring. Can't self-tune mid-session.
3. **HookObserver integration (chosen)** — Collectors see the same event stream as decision gates. Real-time scoring. No new wiring.

**Trade-off:** Collectors must be fast — they're on the hot path alongside decision gates. If a collector blocks, it delays tool execution. Mitigation: collectors only accumulate state (O(1) per event) and defer analysis to flush.

---

### ADR-P4.5-002: Three tables, not one universal signal table

**Decision:** Separate `signal_samples`, `execution_profiles`, and `optimization_hints` tables. Not a single `telemetry_events` table with type discrimination.

**Alternatives considered:**
1. **Single `telemetry_events` table** — Fewer tables, simpler migration. But wildly different query patterns: signals are time-series (scan by time + kind), profiles are key-value (lookup by skill + granularity), hints are stateful (lifecycle transitions). One table means every query has WHERE clauses that don't use the index.
2. **Separate tables (chosen)** — Each table has indexes optimized for its access pattern. Migration is larger but queries are simple.

**Trade-off:** Three tables to maintain. But the access patterns are fundamentally different. This is the same reasoning that led to separate `dbom_artifacts` and `dbom_decisions` in Phase 4.

---

### ADR-P4.5-003: TTL and row caps enforced by Curator, not DB triggers

**Decision:** The 7-day TTL and 10K row cap on `signal_samples` are enforced by Curator's existing sweep mechanism, not by SQLite triggers.

**Alternatives considered:**
1. **SQLite triggers on INSERT** — Automatic cleanup, no forgotten sweeps. But triggers execute synchronously on the INSERT path, adding latency to every signal write. Also, trigger-based row counting requires a full table scan (no ROWCOUNT in SQLite triggers).
2. **Application-level sweep (chosen)** — Curator already sweeps stale data. Adding signal cleanup to the existing sweep is ~10 LOC. Runs periodically, not on the hot path.

**Trade-off:** If Curator doesn't run, stale signals accumulate. But Curator not running means the entire feedback loop is disabled anyway.

---

### ADR-P4.5-004: Drift score uses fixed weights, not learned weights

**Decision:** Drift signal weights are fixed constants (`convergence: 0.30, toolEntropy: 0.25, ...`), not learned from data.

**Alternatives considered:**
1. **Learned weights via gradient-free optimization** — Weights adapt to the user's workflow. Theoretically better. But introduces a meta-optimization loop before we have any data to validate it. Premature complexity.
2. **Configurable weights via SKILL.md frontmatter** — User tunes per skill. Possible but adds configuration surface nobody will use correctly.
3. **Fixed weights (chosen)** — Determinism signals weighted higher per Aaron's constraint. Weights are constants in source code. Easy to reason about, easy to audit.

**Trade-off:** Weights may not be optimal for all workflows. Phase 4.6 addresses this with change vector learning — if weight changes consistently improve outcomes, the system can recommend weight adjustments. But learning the weights themselves is Phase 5 territory.

---

### ADR-P4.5-005: FeedbackSource as new shared type in @akubly/types

**Decision:** `FeedbackSource` is added to `@akubly/types`. This is the first new shared type since Phase 2.

**Alternatives considered:**
1. **Keep in Forge** — Forge defines, Cairn satisfies via injection. Consistent with `ExportQualityGate` pattern. But `FeedbackSource` is consumed by both Forge (read profiles at session start) and Cairn (Curator reads profiles for sweep decisions).
2. **Shared type (chosen)** — Two packages genuinely need this contract. This is the threshold from ADR-P3-004: "types graduate when two packages actually import them."

**Trade-off:** One new type in the shared contract. Small surface increase. Justified by bidirectional consumption.

---

### ADR-P4.5-006: Manual loop trigger in Forge, Curator-driven in Cairn

**Decision:** The optimization loop trigger is manual in Forge (user/developer initiates), Curator-driven in Cairn (automatic on schedule).

**Alternatives considered:**
1. **Always automatic** — Simplest UX, but risky during early development. Bad prescriptions auto-applied could degrade skills.
2. **Always manual** — Safest, but Cairn's value proposition is autonomous observation. Manual-only defeats the "nervous system" metaphor.
3. **Split by context (chosen)** — Forge is the development tool (human in the loop). Cairn is the autonomous system (Curator decides). Aaron confirmed this split.

**Trade-off:** Two code paths for loop triggering. But the trigger is one function call — the analysis and application logic is shared.

---

### ADR-P4.5-007: Determinism > Token Cost ordering

**Decision:** All prescriber priority, drift weights, and optimization ordering places determinism signals ahead of cost signals. The token optimizer gates on drift level (won't prescribe if drift is RED).

**Rationale (Aaron):** "Our goal is to instill confidence in tools." A cheaper but less predictable system is worse than a more expensive but deterministic one. Users can't trust optimization advice from a system that isn't reliably producing correct results first.

**Implementation:**
- Drift weights: convergence (0.30) + toolEntropy (0.25) + promptStability (0.15) = 0.70 for determinism vs 0.30 for cost/efficiency.
- Token optimizer: skips analysis when `drift.mean ≥ 0.3` (RED level).
- Prompt optimizer: addresses convergence and entropy first (impact 0.8, 0.7) before context management (impact 0.5).

No alternatives considered — this is a design constraint, not a decision.

---

## 11. Test Strategy

Following Laura's 6-category test framework for learning systems:

### 11.1 Test Categories

| Category | What It Tests | Example |
|----------|--------------|---------|
| **Mechanism** | Individual components work correctly | `computeDriftScore()` with known inputs produces expected score |
| **Convergence** | System improves over repeated cycles | 10 sessions → profile shows drift trend = "improving" |
| **Regression** | Optimizations don't degrade existing metrics | Applied hint doesn't increase drift above previous level |
| **Determinism** | Same inputs produce same outputs | Same `SignalSample[]` → same `ExecutionProfile` |
| **Efficiency** | Resource usage is bounded | Collector `collect()` is O(1), aggregation completes within time budget |
| **Integration** | Components compose correctly | Collector → sink → aggregator → prescriber → applier pipeline |

### 11.2 Test Approach: Process, Not Artifacts

Laura's key insight: test the learning process, not the learned artifacts. A test that asserts "the prescriber recommends X" is brittle — the right recommendation depends on the profile. Instead:

- **Test:** "Given a profile with drift > 0.3, the prescriber produces at least one hint with category 'convergence' or 'prompt-structure'."
- **Not:** "Given this profile, the prescriber recommends 'Add explicit completion criteria.'"

### 11.3 Property-Based Tests

| Property | Implementation |
|----------|---------------|
| Drift score ∈ [0, 1] | For all valid `DriftSignals`, `computeDriftScore(signals).score` is in [0, 1] |
| Drift classification is monotonic | If score A < score B, `classifyDriftLevel(A) ≤ classifyDriftLevel(B)` |
| Aggregation is commutative | `aggregate(existing, samplesA ++ samplesB)` = `aggregate(aggregate(existing, samplesA), samplesB)` (approximately, due to floating-point) |
| Hint ordering is stable | Same hints, same config → same ordering from `applyOptimizations()` |

### 11.4 Metamorphic Tests

| Relation | Test |
|----------|------|
| More data → higher confidence | If profile A has 10 sessions and B has 20 (same distribution), hints from B have ≥ confidence than A |
| Worse drift → more hints | If profile A has drift 0.1 and B has drift 0.4, B produces ≥ hints than A |
| Determinism gate | If drift ≥ 0.3, token optimizer produces zero hints |

### 11.5 Estimated Test Counts

| Module | Unit Tests | Integration Tests | Total |
|--------|-----------|-------------------|-------|
| `telemetry/drift.ts` | 8–10 | — | 8–10 |
| `telemetry/collectors.ts` | 12–15 | — | 12–15 |
| `telemetry/aggregator.ts` | 6–8 | — | 6–8 |
| `telemetry/sink.ts` | 4–5 | — | 4–5 |
| `prescribers/promptOptimizer.ts` | 8–10 | — | 8–10 |
| `prescribers/tokenOptimizer.ts` | 6–8 | — | 6–8 |
| `applier/optimizer.ts` | 5–7 | — | 5–7 |
| `applier/selfTuning.ts` | 4–5 | — | 4–5 |
| Cross-module pipeline | — | 8–12 | 8–12 |
| **Total** | **53–68** | **8–12** | **61–80** |

---

## 12. Work Decomposition

### Alexander (SDK/Runtime Dev) — owns DB schema + CRUD

| ID | Item | Description | Est. |
|----|------|-------------|------|
| A1 | `011-telemetry-feedback.ts` | Migration: 3 new tables | M |
| A2 | `db/signalSamples.ts` | CRUD: insert, query by kind/skill/time, TTL sweep, row cap | M |
| A3 | `db/executionProfiles.ts` | CRUD: upsert, get by skill×granularity, list | M |
| A4 | `db/optimizationHints.ts` | CRUD: insert, query by skill/status, update status, list | M |
| A5 | `db/schema.ts` update | Register migration011 | XS |
| A6 | Unit tests: all CRUD modules | Round-trip, upsert, sweep, cap, status transitions | L |

### Roger (Platform Dev) — owns telemetry module

| ID | Item | Description | Est. |
|----|------|-------------|------|
| R1 | `telemetry/types.ts` | Signal types, ExecutionProfile, ProfileGranularity | S |
| R2 | `telemetry/drift.ts` | computeDriftScore, classifyDriftLevel, weights | M |
| R3 | `telemetry/collectors.ts` | DriftCollector, TokenCollector, OutcomeCollector | L |
| R4 | `telemetry/aggregator.ts` | aggregateSignals, incremental update | M |
| R5 | `telemetry/sink.ts` | LocalDBOMSink | S |
| R6 | `telemetry/index.ts` | Barrel exports | XS |
| R7 | Unit tests: drift + collectors + aggregator | Property-based, metamorphic | L |

### Rosella (Plugin Dev) — owns prescribers + applier

| ID | Item | Description | Est. |
|----|------|-------------|------|
| S1 | `prescribers/types.ts` | OptimizationHint, OptimizationCategory, MetricSnapshot | S |
| S2 | `prescribers/promptOptimizer.ts` | analyzePromptOptimizations | M |
| S3 | `prescribers/tokenOptimizer.ts` | analyzeTokenOptimizations | M |
| S4 | `prescribers/index.ts` | Barrel exports | XS |
| S5 | `applier/optimizer.ts` | applyOptimizations | M |
| S6 | `applier/selfTuning.ts` | tuneParameters, DEFAULT_STRATEGY_PARAMS | S |
| S7 | `applier/index.ts` | Barrel exports | XS |
| S8 | Unit tests: prescribers + applier | Mechanism, determinism, metamorphic | L |

### Laura (Tester) — integration + convergence tests

| ID | Item | Description | Est. |
|----|------|-------------|------|
| L1 | Test fixture factory | Signal samples, profiles, hints for all test categories | M |
| L2 | Integration: collector → sink → aggregator pipeline | End-to-end with mock events | L |
| L3 | Convergence tests | Multi-cycle improvement verification | M |
| L4 | Regression tests | Optimization doesn't degrade metrics | M |
| L5 | Efficiency tests | Collector hot-path performance bounds | S |

---

## 13. Dependency Graph

```
                    ┌──────────────────┐
                    │  R1: Types       │     ┌──────────────┐
                    └────────┬─────────┘     │  A1: Migration│
                             │               └──────┬───────┘
              ┌──────────────┼───────────┐          │
              ▼              ▼           ▼          ▼
       R2: Drift      R3: Collectors  S1: Types   A2–A4: CRUD
              │              │           │          │
              └──────┬───────┘           │          ▼
                     ▼                   │     A5: Schema
              R4: Aggregator             │     A6: Tests
                     │                   │
              R5: Sink                   │
              R6: Barrel                 │
                     │                   │
                     └─────────┬─────────┘
                               ▼
                    S2–S3: Prescribers
                               │
                    S5–S6: Applier
                    S4, S7: Barrels
                    S8: Tests
                               │
                    ┌──────────┘
                    ▼
             L1–L5: Integration
```

### Parallelism

| Wave | Items | Notes |
|------|-------|-------|
| **Wave 1** (parallel) | R1, A1, S1 | Types + migration — zero dependencies |
| **Wave 2** (parallel, after Wave 1) | R2, R3, A2, A3, A4 | Drift + collectors need types. CRUD needs migration. |
| **Wave 3** (parallel, after Wave 2) | R4, R5, R6, R7, A5, A6, S2, S3 | Aggregator needs collectors. Prescribers need types. |
| **Wave 4** (after Wave 3) | S5, S6, S4, S7, S8 | Applier needs prescriber output types. |
| **Wave 5** (after Wave 4) | L1–L5 | Integration tests need everything. |

**Critical path:** R1 → R2/R3 → R4 → S2/S3 → S5 → L2. The prescriber-to-applier pipeline is the integration point.

---

## 14. Effort Estimate

| Module | Est. LOC | Notes |
|--------|---------|-------|
| `telemetry/` (types, drift, collectors, aggregator, sink) | ~450 | 5 files, mostly data structures + accumulation logic |
| `prescribers/` (types, prompt, token) | ~300 | 3 files, analysis logic + hint generation |
| `applier/` (optimizer, selfTuning) | ~200 | 2 files, hint application + parameter tuning |
| DB migration + CRUD | ~250 | 4 files, 3 tables, standard CRUD |
| **Total production** | **~1200** | |
| Tests (unit + integration) | ~600–800 | 61–80 tests across all modules |
| **Total** | **~1800–2000** | |

---

## Appendix A: File Layout

```
packages/forge/src/
├── bridge/           # Phase 2 ✓
├── hooks/            # Phase 2 ✓
├── decisions/        # Phase 2 ✓
├── dbom/             # Phase 2 ✓
├── session/          # Phase 2 ✓
├── runtime/          # Phase 3 ✓
├── models/           # Phase 3 ✓
├── export/           # Phase 4 ✓
├── telemetry/        # Phase 4.5 — NEW
│   ├── index.ts      # Barrel
│   ├── types.ts      # SignalSample, ExecutionProfile, etc.
│   ├── drift.ts      # computeDriftScore, classifyDriftLevel
│   ├── collectors.ts # DriftCollector, TokenCollector, OutcomeCollector
│   ├── aggregator.ts # aggregateSignals
│   └── sink.ts       # LocalDBOMSink
├── prescribers/      # Phase 4.5 — NEW
│   ├── index.ts      # Barrel
│   ├── types.ts      # OptimizationHint, MetricSnapshot, etc.
│   ├── promptOptimizer.ts  # analyzePromptOptimizations
│   └── tokenOptimizer.ts   # analyzeTokenOptimizations
├── applier/          # Phase 4.5 — NEW
│   ├── index.ts      # Barrel
│   ├── optimizer.ts  # applyOptimizations
│   └── selfTuning.ts # tuneParameters
├── __tests__/
│   ├── telemetry/    # R7 drift + collector tests
│   ├── prescribers/  # S8 prescriber tests
│   ├── applier/      # S8 applier tests
│   └── integration/  # L2–L5 cross-module tests
├── types.ts          # Phase 2 ✓ (SDK mirrors)
└── index.ts          # Barrel (updated)

packages/cairn/src/db/
├── migrations/
│   ├── 001-initial.ts ... 010-dbom-artifacts.ts ✓
│   └── 011-telemetry-feedback.ts  # Phase 4.5 — NEW
├── signalSamples.ts               # Phase 4.5 — NEW (CRUD)
├── executionProfiles.ts           # Phase 4.5 — NEW (CRUD)
├── optimizationHints.ts           # Phase 4.5 — NEW (CRUD)
├── schema.ts                      # Updated: register migration011
└── ...existing CRUD modules
```

## Appendix B: Cold Start — Canary Bootstrap

Per Aaron's decision, cold start uses a **canary bootstrap** strategy:

1. **No profile exists:** System runs with `DEFAULT_STRATEGY_PARAMS`. No optimization applied. All collectors active.
2. **< 3 sessions:** Collectors accumulate data. Profiles begin aggregating. No prescriptions yet (prescriber `minSessions` gate).
3. **3–5 sessions:** Prompt optimizer begins prescribing. Drift weights dominate — focus on determinism.
4. **> 5 sessions:** Token optimizer activates (if drift is GREEN/YELLOW). Full feedback loop operational.
5. **> 10 sessions:** Confidence scores cross `autoApplyThreshold`. Hints begin auto-applying in Cairn mode.

This gradual ramp prevents prescribing from insufficient data. The `minSessions` parameter in each prescriber is the gatekeeper.

## Appendix C: Updated `packages/forge/src/index.ts` Barrel

```typescript
// Add to existing barrel:

// --- Telemetry (Phase 4.5) ---
export {
  createDriftCollector,
  createTokenCollector,
  createOutcomeCollector,
  computeDriftScore,
  classifyDriftLevel,
  createLocalDBOMSink,
  aggregateSignals,
  type DriftCollector,
  type TokenCollector,
  type OutcomeCollector,
  type TelemetryCollector,
  type DriftScore,
  type DriftLevel,
  type DriftSignals,
  type LocalDBOMSink,
  type AggregationResult,
  type SignalSample,
  type ExecutionProfile,
  type TelemetryEvent,
  type ProfileGranularity,
} from "./telemetry/index.js";

// --- Prescribers (Phase 4.5) ---
export {
  analyzePromptOptimizations,
  analyzeTokenOptimizations,
  type OptimizationHint,
  type OptimizationCategory,
  type OptimizationEvidence,
  type MetricSnapshot,
  type PrescriberResult,
  type PromptOptimizerConfig,
  type TokenOptimizerConfig,
} from "./prescribers/index.js";

// --- Applier (Phase 4.5) ---
export {
  applyOptimizations,
  tuneParameters,
  DEFAULT_STRATEGY_PARAMS,
  type ApplierConfig,
  type AppliedOptimization,
  type OptimizationApplierResult,
  type SkillFrontmatterPatch,
  type StrategyParameters,
} from "./applier/index.js";
```
