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
