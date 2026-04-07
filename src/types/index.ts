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

// ---------------------------------------------------------------------------
// Prescriber types (Phase 7)
// ---------------------------------------------------------------------------

/** 8-state prescription lifecycle (DP2) */
export type PrescriptionStatus =
  | 'generated'
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'applied'
  | 'failed'
  | 'expired'
  | 'suppressed';

/** Disposition actions for resolve_prescription (DP3) */
export type PrescriptionDisposition = 'accept' | 'reject' | 'defer';

/** Artifact types discovered by the scanner */
export type ArtifactType =
  | 'instruction'
  | 'agent'
  | 'skill'
  | 'hook'
  | 'mcp_server'
  | 'plugin_manifest'
  | 'command';

/** Scope of an artifact in the CLI topology */
export type ArtifactScope = 'user' | 'project' | 'plugin';

/** Resolution strategy per artifact type */
export type ResolutionRule = 'additive' | 'first_found' | 'last_wins';

/** A prescription generated from a Curator insight */
export interface Prescription {
  id: number;
  insightId: number;
  patternType: PatternType;
  title: string;
  rationale: string;
  proposedChange: string;
  targetPath?: string;
  artifactType?: ArtifactType;
  artifactScope?: ArtifactScope;
  status: PrescriptionStatus;
  confidence: number;
  priorityScore: number;
  recencyWeight: number;
  availabilityFactor: number;
  dispositionReason?: string;
  deferCount: number;
  deferUntilSession?: number;
  generatedAt: string;
  resolvedAt?: string;
  appliedAt?: string;
  expiresAt?: string;
}

/** A file managed by the Prescriber (DP6) */
export interface ManagedArtifact {
  id: number;
  path: string;
  artifactType: ArtifactType;
  logicalId?: string;
  scope: ArtifactScope;
  prescriptionId: number;
  originalChecksum?: string;
  currentChecksum?: string;
  rollbackContent?: string;
  createdAt: string;
  updatedAt: string;
}

/** A discovered artifact in the CLI topology (DP4) */
export interface DiscoveredArtifact {
  path: string;
  artifactType: ArtifactType;
  scope: ArtifactScope;
  logicalId: string;
  ownerPlugin?: string;
  checksum: string;
  lastModified: number;
  resolutionRule: ResolutionRule;
}

/** Conflict between artifacts at different paths with the same logical identity */
export interface ArtifactConflict {
  logicalId: string;
  artifactType: ArtifactType;
  artifacts: DiscoveredArtifact[];
}

/** Complete snapshot of the CLI artifact topology (DP4) */
export interface ArtifactTopology {
  artifacts: DiscoveredArtifact[];
  conflicts: ArtifactConflict[];
  scannedAt: string;
  scanDurationMs: number;
}

/** Cached topology entry in SQLite (DP4: 5-min TTL) */
export interface TopologyCache {
  topology: ArtifactTopology;
  cachedAt: number;
  ttlMs: number;
}

/** Growth tracking summary for show_growth MCP tool (DP5) */
export interface GrowthSummary {
  totalPrescriptions: number;
  accepted: number;
  rejected: number;
  deferred: number;
  applied: number;
  failed: number;
  acceptanceRate: number;
  resolvedPatterns: string[];
  activePatterns: string[];
  trend: 'improving' | 'stable' | 'declining';
}
