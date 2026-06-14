/**
 * @akubly/types — Shared contract types for the Cairn platform.
 *
 * These types define the cross-package API surface between @akubly/cairn
 * (observability/learning) and @akubly/forge (deterministic execution).
 *
 * NOTE: Cairn-internal types (DB row types, agent internals) live in
 * packages/cairn/src/types/index.ts. This package contains ONLY the
 * shared contract.
 */

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Provenance tiers tag events by their evidentiary weight:
 *   - 'internal': Mechanical events (tool calls, model switches, streaming).
 *   - 'certification': Decision-relevant events (human approvals, tool blocks,
 *                       quality gates, permission outcomes).
 *   - 'deployment': Events from deployed artifacts running in corp/EMU
 *                   environments.
 */
export type ProvenanceTier = 'internal' | 'certification' | 'deployment';

// ---------------------------------------------------------------------------
// Bridge event — the cross-package event format
// ---------------------------------------------------------------------------

/**
 * The bridge event format for cross-package communication.
 * Distinct from CairnEvent (DB row type with numeric id) in @akubly/cairn.
 */
export interface CairnBridgeEvent {
  sessionId: string;
  eventType: string;
  payload: string;
  createdAt: string;
  provenanceTier: ProvenanceTier;
}

// ---------------------------------------------------------------------------
// Decision types
// ---------------------------------------------------------------------------

/** Classification of a decision's source. */
export type DecisionSource = 'human' | 'automated_rule' | 'ai_recommendation';

/** Structured decision audit record. */
export interface DecisionRecord {
  id: string;
  timestamp: string;
  question: string;
  chosenOption: string;
  alternatives: string[];
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
  source: DecisionSource;
  toolName?: string;
  toolArgs?: unknown;
  provenanceTier: 'internal' | 'certification';
}

// ---------------------------------------------------------------------------
// DBOM (Decision Bill of Materials) types
// ---------------------------------------------------------------------------

/** A single decision entry in the DBOM. */
export interface DBOMDecisionEntry {
  hash: string;
  parentHash: string | null;
  eventType: string;
  timestamp: string;
  source: DecisionSource;
  summary: string;
  details: Record<string, unknown>;
}

/** Aggregate statistics for the DBOM. */
export interface DBOMStats {
  totalDecisions: number;
  humanGatedDecisions: number;
  machineDecisions: number;
  aiRecommendedDecisions: number;
  decisionTypes: Record<string, number>;
  chainDepth: number;
  chainRoots: number;
}

/** The complete DBOM artifact. */
export interface DBOMArtifact {
  version: '0.1.0';
  sessionId: string;
  generatedAt: string;
  rootHash: string;
  stats: DBOMStats;
  decisions: DBOMDecisionEntry[];
}

// ---------------------------------------------------------------------------
// Session identity — minimal cross-package session reference
// ---------------------------------------------------------------------------

/**
 * Branded SessionId primitive — shared identity across Cairn + Eureka (FR-13).
 * See §20 §8.3 for design rationale ("shared identifiers > shared schemas").
 *
 * Branded SessionId type introduced 2026-05-28 (Eureka v1).
 *
 * ⚠️ Migration deferred: existing consumers (notably SessionIdentity.sessionId below)
 * still use bare `string`. Brand provides no compile-time protection until consumers
 * are migrated. Tracked in `.squad/decisions.md` under M5+ backlog (F14 / C7 / C9).
 *
 * New code MAY use SessionId for forward compatibility; existing code keeps `string`
 * until a coordinated cross-package migration pass.
 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Minimal session identity for cross-package use. */
export interface SessionIdentity {
  /** @todo Migrate to SessionId in M5+ coordinated pass. See .squad/decisions.md (F14). */
  sessionId: string;
  repoKey: string;
  branch?: string;
  startedAt: string;
}

// ---------------------------------------------------------------------------
// Telemetry sink — pluggable event output (Phase 5)
// ---------------------------------------------------------------------------

/** Pluggable sink for emitting bridge events. */
export interface TelemetrySink {
  emit(event: CairnBridgeEvent): void | Promise<void>;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}

/**
 * Narrow sink capability for enqueuing derived signal samples.
 *
 * Introduced to decouple emit-only implementers (e.g. remote event sinks)
 * from the local-DB sample-persistence path. ForgeSession uses this narrower
 * interface rather than the base TelemetrySink so that an emit-only sink
 * can satisfy TelemetrySink without having to implement enqueueSample.
 */
export interface SignalSampleSink {
  /** Push a signal sample into the sink for persistence. */
  enqueueSample(sample: SignalSample): void;
  /** Flush buffered samples to the backing store. */
  flush?(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Phase 4.5 — Feedback loop contracts
//
// First new shared types since Phase 2. These are the cross-package contract
// for the local feedback loop: TelemetrySink (above) is the write side,
// FeedbackSource (below) is the read side. ExecutionProfile and
// ProfileGranularity are the shared aggregation shape.
//
// OptimizationHint and StrategyParameters are intentionally open-shaped here
// — concrete prescriber implementations (in @akubly/forge) extend them with
// prescriber-specific fields without a churn-prone shared schema.
// ---------------------------------------------------------------------------

/** Granularity at which an execution profile aggregates samples. */
export type ProfileGranularity = 'per-skill' | 'per-user' | 'per-model' | 'global';

/**
 * Streaming quantile sketch for drift values.
 *
 * Uses a fixed 100-bucket histogram of [0, 1] (drift is normalized). Bucket i
 * holds the count of samples in [i/100, (i+1)/100). p50/p95 are computed by
 * walking the cumulative count. Backward-compatible: optional + tolerated
 * absence by readers (they fall back to per-batch percentiles).
 */
export interface DriftSketch {
  /** Bucket counts (length 100, summing to `count`). */
  buckets: number[];
  /** Total samples observed across all aggregations. */
  count: number;
}

/** Per-signal mean components surfaced to prescribers. */
export interface ProfileSignals {
  convergence: number;
  tokenPressure: number;
  toolEntropy: number;
  contextBloat: number;
  promptStability: number;
}

export type ProfileStalenessReason = 'count' | 'age' | 'count+age' | null;

export interface ProfileStaleness {
  stale: boolean;
  reason: ProfileStalenessReason;
}

/** Aggregated execution profile for a skill at a given granularity. */
export interface ExecutionProfile {
  skillId: string;
  granularity: ProfileGranularity;
  granularityKey: string;
  sessionCount: number;
  drift: {
    mean: number;
    p50: number;
    p95: number;
    trend: 'improving' | 'stable' | 'degrading';
    /** Streaming sketch — present when the aggregator has seen ≥1 drift sample. */
    sketch?: DriftSketch;
  };
  tokens: {
    meanInputTokens: number;
    meanOutputTokens: number;
    meanCacheHitRate: number;
    totalCostNanoAiu: number;
  };
  outcomes: {
    successRate: number;
    meanConvergenceTurns: number;
    toolErrorRate: number;
  };
  /**
   * Per-signal means surfaced for targeted prescription. Populated from
   * drift sample metadata. Optional for backward compatibility — older
   * profiles persisted before this field landed will simply omit it.
   */
  signals?: ProfileSignals;
  /** Confidence in this profile's freshness/relevance after runtime annotations. */
  confidence?: number;
  /** Runtime annotation explaining confidence attenuation due to profile staleness. */
  staleness?: ProfileStaleness;
  updatedAt: string;
}

/**
 * A prescriber-generated optimization hint. Open-shaped: prescribers in
 * @akubly/forge define the concrete fields (category, description, payload).
 */
export interface OptimizationHint {
  id: string;
  source: string;
  skillId: string;
  category: string;
  description: string;
  [key: string]: unknown;
}

/**
 * Self-tuning strategy parameters for a skill. Open-shaped: concrete
 * parameter sets are defined per-strategy by the consumer.
 */
export interface StrategyParameters {
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Phase 4.6 — Change vector contracts
// ---------------------------------------------------------------------------

/** Shared optimization categories for hints and learned change vectors. */
export type OptimizationCategory =
  | 'prompt-structure'
  | 'tool-guidance'
  | 'context-management'
  | 'cache-optimization'
  | 'model-selection'
  | 'convergence';

/** Threshold below which mature negative vectors should not auto-apply. */
export const NEGATIVE_IMPACT_AUTO_APPLY_GATE = -0.2;

/** Minimum mature-negative confidence boost after attenuation. */
export const ATTENUATION_FLOOR = 0.1;

/** Aggregated change vector data for a category+skillId pair. */
export interface ChangeVectorSummary {
  category: OptimizationCategory;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  confidenceBoost: number;
  /** False when meanNetImpact <= NEGATIVE_IMPACT_AUTO_APPLY_GATE and vectorCount >= minVectors. */
  autoApplyEligible?: boolean;
}

/** Async source of historical change vector summaries for a skill (Phase 5 may fetch them remotely). */
export interface ChangeVectorProvider {
  getSummaries(skillId: string): Promise<ChangeVectorSummary[]>;
}

// ---------------------------------------------------------------------------
// M3 — Hint disposition feedback
// ---------------------------------------------------------------------------

/**
 * Aggregated user-disposition data for a category+skillId pair.
 * Only source='mcp' transitions (i.e. user-driven via the Cairn resolve tool)
 * are counted — system-generated transitions must NOT influence suppression.
 */
export interface DispositionSummary {
  skillId: string;
  category: OptimizationCategory;
  /**
   * Number of source='mcp' dismissed transitions for this skill+category.
   * dismissedCount > 0 → suppress recurring hints for this category.
   */
  dismissedCount: number;
  /**
   * Number of source='mcp' resolved transitions for this skill+category.
   * resolvedCount > 0 → confidence boost for hints in this category.
   */
  resolvedCount: number;
}

/**
 * Async source of user-disposition feedback for optimization hints.
 * Implemented by SqliteHintDispositionProvider in @akubly/cairn.
 * Phase 5 may fetch from remote telemetry.
 */
export interface HintDispositionProvider {
  getDispositions(skillId: string): Promise<DispositionSummary[]>;
}

// ---------------------------------------------------------------------------
// Wave 3 — Prescriber orchestration contracts
// ---------------------------------------------------------------------------

/** What the prescriber orchestrator reports after processing one skill. */
export interface PrescriberRunResult {
  skillId: string;
  hintsGenerated: number;
  hintsInserted: number;
  hintsDuplicated: number;
  hintsError: number;
  /**
   * Reason this skill's run was skipped (e.g. orchestrator hit its time
   * budget). Absent when the skill was processed normally — even with
   * zero hints generated.
   */
  skippedReason?: 'time-budget-exceeded';
}

/** Curator-facing port for running prescribers against one skill. */
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) => Promise<PrescriberRunResult>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

/**
 * Read-side complement to {@link TelemetrySink}. The Forge runtime consults
 * a FeedbackSource at session start to load the latest profile and apply
 * pending optimizations.
 */
export interface FeedbackSource {
  /**
   * Get the execution profile for a skill (null if none yet aggregated).
   *
   * Profiles are stored under a composite key of
   * `(skill_id, granularity, granularity_key)`, so callers must supply the
   * granularity key whenever they want a non-global profile. For example:
   *   - `granularity: 'per-user'`  → `granularityKey` is the user id
   *   - `granularity: 'per-model'` → `granularityKey` is the model id
   *   - `granularity: 'per-skill'` or `'global'` → key defaults to `'global'`
   *
   * @param skillId        The skill whose profile to load.
   * @param granularity    Aggregation tier (defaults to `'global'`).
   * @param granularityKey Sub-key within the granularity tier (e.g. user id,
   *                       model id). Defaults to `'global'` when the tier is
   *                       `'per-skill'` or `'global'`. Required to address
   *                       per-user / per-model profiles.
   */
  getProfile(
    skillId: string,
    granularity?: ProfileGranularity,
    granularityKey?: string,
  ): ExecutionProfile | null;
  /**
   * Get pending optimization hints for a skill. Hints are keyed by skill
   * only (no granularity dimension in the underlying store), so no
   * granularity parameters are required here.
   */
  getPendingHints(skillId: string): OptimizationHint[];
  /**
   * Get strategy parameters (self-tuned or default) for a skill. Strategy
   * parameters are open-shaped and currently scoped per-skill; granularity
   * dimensions are not modeled in the contract yet.
   */
  getStrategyParameters(skillId: string): StrategyParameters;
}

// ---------------------------------------------------------------------------
// Phase 4.5 — Signal types (relocated from @akubly/forge internal telemetry)
//
// Moved here so @akubly/cairn can call aggregateSignals without taking a
// dependency on @akubly/forge (both packages depend only on @akubly/types).
// @akubly/forge re-exports these from its telemetry barrel for back-compat.
// ---------------------------------------------------------------------------

/** The kind of a telemetry signal sample. */
export type SignalKind = 'drift' | 'token' | 'outcome';

/**
 * A single signal sample produced by a telemetry collector.
 *
 * Relocated from @akubly/forge/src/telemetry/types.ts so that the aggregator
 * can live here and be consumed by both @akubly/forge and @akubly/cairn
 * without a circular dependency.
 */
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

// ---------------------------------------------------------------------------
// Phase 4.5 — Signal aggregator (relocated from @akubly/forge internal telemetry)
// ---------------------------------------------------------------------------

/** Result returned by {@link aggregateSignals}. */
export interface AggregationResult {
  profile: ExecutionProfile;
  samplesConsumed: number;
}

const SKETCH_BUCKETS = 100;

function emptySketch(): DriftSketch {
  return { buckets: new Array(SKETCH_BUCKETS).fill(0), count: 0 };
}

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
 * Fold a per-session mean over an existing running mean.
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

function sumMeta(metas: Array<Record<string, unknown>>, key: string): number {
  let s = 0;
  for (const m of metas) {
    const v = m[key];
    if (typeof v === 'number' && Number.isFinite(v)) s += v;
  }
  return s;
}

/**
 * Incrementally aggregate signal samples into an execution profile.
 *
 * Cursor-based, consistent with Curator's pattern: the caller passes the
 * existing profile (or null) plus the new samples since the last cursor and
 * gets back the updated profile.
 *
 * @param existing       - Existing profile to update (null for first aggregation)
 * @param samples        - New signal samples since last aggregation
 * @param granularity    - Aggregation level
 * @param granularityKey - Key for the aggregation level
 *
 * @remarks
 * **Precondition:** For correct mean computation, callers should provide all
 * three sample kinds (drift, token, outcome) for each session. Partial inputs
 * (e.g. only drift samples) will produce a profile where means for the absent
 * kinds are zero-weighted, which may skew aggregated metric trends.
 */
export function aggregateSignals(
  existing: ExecutionProfile | null,
  samples: SignalSample[],
  granularity: ProfileGranularity,
  granularityKey: string,
): AggregationResult {
  const driftSamples = samples.filter((s) => s.kind === 'drift');
  const tokenSamples = samples.filter((s) => s.kind === 'token');
  const outcomeSamples = samples.filter((s) => s.kind === 'outcome');

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

  const sketch = updateSketch(existing?.drift.sketch, driftValues);
  const driftP50 =
    sketch.count > 0 ? sketchQuantile(sketch, 0.5) : (existing?.drift.p50 ?? 0);
  const driftP95 =
    sketch.count > 0 ? sketchQuantile(sketch, 0.95) : (existing?.drift.p95 ?? 0);

  const trend: ExecutionProfile['drift']['trend'] =
    driftValues.length >= 2
      ? driftValues[driftValues.length - 1]! < driftValues[0]!
        ? 'improving'
        : driftValues[driftValues.length - 1]! > driftValues[0]!
          ? 'degrading'
          : 'stable'
      : (existing?.drift.trend ?? 'stable');

  // --- Token aggregation ---
  const tokenMetas = tokenSamples.map((s) => s.metadata);
  const meanInput = weightedMean(
    existing?.tokens.meanInputTokens ?? 0,
    prevCount,
    sumMeta(tokenMetas, 'totalInput'),
    tokenMetas.length,
    sessionCount,
  );
  const meanOutput = weightedMean(
    existing?.tokens.meanOutputTokens ?? 0,
    prevCount,
    sumMeta(tokenMetas, 'totalOutput'),
    tokenMetas.length,
    sessionCount,
  );
  const meanCacheHit = weightedMean(
    existing?.tokens.meanCacheHitRate ?? 0,
    prevCount,
    sumMeta(tokenMetas, 'cacheHitRate'),
    tokenMetas.length,
    sessionCount,
  );
  const totalCost =
    (existing?.tokens.totalCostNanoAiu ?? 0) + sumMeta(tokenMetas, 'costNanoAiu');

  // --- Outcome aggregation ---
  const outcomeMetas = outcomeSamples.map((s) => s.metadata);
  const successCount = outcomeMetas.filter((m) => m['succeeded'] === true).length;
  const prevSuccesses = existing ? existing.outcomes.successRate * prevCount : 0;
  const successRate =
    sessionCount > 0 ? (successCount + prevSuccesses) / sessionCount : 0;

  const meanConvergence = weightedMean(
    existing?.outcomes.meanConvergenceTurns ?? 0,
    prevCount,
    sumMeta(outcomeMetas, 'turnCount'),
    outcomeMetas.length,
    sessionCount,
  );
  const toolErrorRate = weightedMean(
    existing?.outcomes.toolErrorRate ?? 0,
    prevCount,
    sumMeta(outcomeMetas, 'toolErrorRate'),
    outcomeMetas.length,
    sessionCount,
  );

  // --- Per-signal means folded from drift sample metadata.signals ---
  const signalKeys: ReadonlyArray<keyof ProfileSignals> = [
    'convergence',
    'tokenPressure',
    'toolEntropy',
    'contextBloat',
    'promptStability',
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
    const sig = s.metadata['signals'];
    if (sig && typeof sig === 'object') {
      const sigRec = sig as Record<string, unknown>;
      for (const k of signalKeys) {
        const v = sigRec[k];
        if (typeof v === 'number' && Number.isFinite(v)) signalSums[k] += v;
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

  const skillId =
    granularity === 'global' ? 'global' : (samples[0]?.skillId ?? existing?.skillId ?? 'unknown');

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
