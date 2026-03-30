/**
 * Shared type definitions for Cairn.
 */

/** Top-level Cairn configuration. */
export interface CairnConfig {
  /** Path to the knowledge database. */
  dbPath?: string;
  /** Directory for installed plugins. */
  pluginsDir?: string;
}

/** Represents a primitive agent in the Cairn system. */
export interface Agent {
  /** Unique agent identifier. */
  name: string;
  /** Human-readable description. */
  description: string;
}

/** Session tracking record. */
export interface Session {
  id: string;
  repoKey: string;
  branch?: string;
  startedAt: string;
  endedAt?: string;
  status: string;
}

/** Preference with cascade scope. */
export interface Preference {
  key: string;
  value: string;
  scope: string;
  sessionId?: string;
}

/** Record of something intentionally skipped during a session. */
export interface SkipBreadcrumb {
  id: number;
  whatSkipped: string;
  reason?: string;
  agent?: string;
  sessionId: string;
  createdAt: string;
}

/** Error record for Curator root-cause analysis. */
export interface CairnError {
  id: number;
  category: string;
  message: string;
  context?: string;
  rootCause?: string;
  prescription?: string;
  sessionId: string;
  createdAt: string;
}

/** Event log entry for cursor-based event processing. */
export interface CairnEvent {
  id: number;
  eventType: string;
  payload: string;
  sessionId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Curator types (Phase 3)
// ---------------------------------------------------------------------------

/** Categories of patterns the Curator can detect. */
export type PatternType = 'recurring_error' | 'error_sequence' | 'skip_frequency';

/** Lifecycle status of a Curator insight. */
export type InsightStatus = 'active' | 'stale' | 'pruned';

/** A pattern-based insight discovered by the Curator. */
export interface Insight {
  id: number;
  patternType: PatternType;
  title: string;
  description: string;
  /** Event IDs that contributed to this insight. */
  evidence: number[];
  /** 0.0–1.0 confidence score based on occurrence strength. */
  confidence: number;
  status: InsightStatus;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** Optional actionable advice derived from the pattern. */
  prescription?: string;
}

/** Snapshot of the Curator's current state. */
export interface CuratorStatus {
  lastProcessedEventId: number;
  lastRunAt: string | null;
  totalInsights: number;
  activeInsights: number;
  staleInsights: number;
  prunedInsights: number;
}
