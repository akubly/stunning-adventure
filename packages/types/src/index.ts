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

/** Minimal session identity for cross-package use. */
export interface SessionIdentity {
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
