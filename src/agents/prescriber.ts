/**
 * Prescriber Agent
 *
 * Transforms Curator insights into concrete, prioritized prescriptions.
 * Generates sidecar instruction files that the Apply Engine (Phase 7E)
 * will write to disk.
 *
 * Core loop:
 *   1. Session cleanup (expire stale, resurface deferred)
 *   2. Fetch active insights
 *   3. Skip insights with existing active prescriptions (idempotent)
 *   4. Generate prescription from template per pattern type
 *   5. Compute priority, persist, log event
 */

import os from 'node:os';
import path from 'node:path';

import { getDb } from '../db/index.js';
import { getInsights } from '../db/insights.js';
import { logEvent } from '../db/events.js';
import { getPreference } from '../db/preferences.js';
import {
  createPrescription,
  listPrescriptions,
  expireAbandonedPrescriptions,
  getSessionsSinceInstall,
  suppressPrescription,
  updatePrescriptionStatus,
} from '../db/prescriptions.js';
import { getCachedTopology, cacheTopology } from '../db/topologyCache.js';
import { scanTopology } from './discovery.js';
import type {
  Insight,
  Prescription,
  ArtifactTopology,
  ArtifactScope,
  PatternType,
} from '../types/index.js';

export const AGENT_NAME = 'prescriber';
export const AGENT_DESCRIPTION = 'Translates insights into actionable prescriptions';

// ---------------------------------------------------------------------------
// Configuration defaults (overridable via preferences)
// ---------------------------------------------------------------------------

const DEFAULT_SUPPRESS_THRESHOLD = 3;
const DEFAULT_SIDECAR_PREFIX = 'cairn-prescribed';
const DEFAULT_MIN_CONFIDENCE = 0.3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PrescribeResult {
  prescriptionsGenerated: number;
}

// ---------------------------------------------------------------------------
// Priority scoring (DP5 #9)
// ---------------------------------------------------------------------------

/**
 * Compute priority score for a prescription.
 *
 * Formula: confidence × recencyWeight × availabilityFactor
 *   - recencyWeight: 1.0 within 5 sessions, decays to 0.5 by 20 sessions
 *   - availabilityFactor: dampened by prior rejections, min 0.1
 */
export function computePriority(
  confidence: number,
  _lastSeenAt: string,
  sessionsAgo: number,
  priorRejections: number,
): number {
  const recencyWeight = Math.min(1.0, Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15)));
  const availabilityFactor = Math.max(0.1, 1.0 - priorRejections * 0.3);
  return confidence * recencyWeight * availabilityFactor;
}

// ---------------------------------------------------------------------------
// Deferral / suppression helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a deferred prescription should resurface.
 * Uses currentSession + 1 to compensate for the session counter
 * being incremented AFTER prescribe() in sessionStart.
 */
export function shouldResurface(prescription: Prescription, currentSession: number): boolean {
  if (prescription.status !== 'deferred') return false;
  if (prescription.deferUntilSession === undefined) return true;
  return (currentSession + 1) >= prescription.deferUntilSession;
}

/**
 * Check and auto-suppress a prescription if its defer count
 * meets or exceeds the suppression threshold.
 * Exported for Phase 7F (resolve_prescription MCP tool).
 */
export function checkAutoSuppress(prescriptionId: number, deferCount: number): boolean {
  const threshold = parseInt(
    getPreference('prescriber.suppress_threshold') ?? String(DEFAULT_SUPPRESS_THRESHOLD),
    10,
  );
  if (deferCount >= threshold) {
    suppressPrescription(prescriptionId);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Prescription templates
// ---------------------------------------------------------------------------

function generateForRecurringError(insight: Insight): {
  title: string;
  rationale: string;
  proposedChange: string;
} {
  const category = extractCategory(insight.title, 'recurring_error');
  return {
    title: `Prevent recurring ${category} errors`,
    rationale: `${insight.description} (observed ${insight.occurrenceCount} times, confidence ${(insight.confidence * 100).toFixed(0)}%)`,
    proposedChange:
      insight.prescription ?? `Watch for and prevent "${category}" errors. ${insight.description}`,
  };
}

function generateForErrorSequence(insight: Insight): {
  title: string;
  rationale: string;
  proposedChange: string;
} {
  return {
    title: `Guard against error sequence: ${insight.title.replace('Sequence: ', '')}`,
    rationale: `${insight.description} (observed ${insight.occurrenceCount} times, confidence ${(insight.confidence * 100).toFixed(0)}%)`,
    proposedChange:
      insight.prescription ?? `Add a verification step to prevent this error sequence. ${insight.description}`,
  };
}

function generateForSkipFrequency(insight: Insight): {
  title: string;
  rationale: string;
  proposedChange: string;
} {
  return {
    title: `Review skipped guardrail: ${insight.title.replace('Frequently skipped: ', '')}`,
    rationale: `${insight.description} (observed ${insight.occurrenceCount} times, confidence ${(insight.confidence * 100).toFixed(0)}%)`,
    proposedChange:
      insight.prescription ?? `Review whether this frequently-skipped guardrail is still relevant. ${insight.description}`,
  };
}

function extractCategory(title: string, _patternType: PatternType): string {
  // "Recurring build: ..." → "build"
  const match = title.match(/^Recurring\s+([^:]+):/);
  if (match) return match[1].trim();
  return 'unknown';
}

const GENERATORS: Record<
  PatternType,
  (insight: Insight) => { title: string; rationale: string; proposedChange: string }
> = {
  recurring_error: generateForRecurringError,
  error_sequence: generateForErrorSequence,
  skip_frequency: generateForSkipFrequency,
};

// ---------------------------------------------------------------------------
// Target path computation
// ---------------------------------------------------------------------------

/**
 * Determine the target sidecar path from topology.
 * If the topology has a project-scope instruction artifact, use project scope.
 * Otherwise defaults to user scope.
 */
function computeTargetPath(
  topology: ArtifactTopology | null,
  prefix: string,
): { targetPath: string; artifactScope: ArtifactScope } {
  const filename = `${prefix}.instructions.md`;

  if (topology) {
    const hasProjectInstruction = topology.artifacts.some(
      (a) => a.artifactType === 'instruction' && a.scope === 'project',
    );
    if (hasProjectInstruction) {
      return {
        targetPath: path.join('.github', filename),
        artifactScope: 'project',
      };
    }
  }

  return {
    targetPath: path.join(os.homedir(), '.copilot', filename),
    artifactScope: 'user',
  };
}

// ---------------------------------------------------------------------------
// Session ID lookup for event logging
// ---------------------------------------------------------------------------

/**
 * Try to find an active session for event logging.
 * Returns undefined if no active session exists (prescribe() is fail-soft
 * on logging — it runs before the new session is created in sessionStart).
 */
function findActiveSessionId(): string | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id FROM sessions WHERE status = 'active'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  return row?.id;
}

// ---------------------------------------------------------------------------
// Idempotency check
// ---------------------------------------------------------------------------

/** Statuses that block re-prescription from the same insight. */
const ACTIVE_STATUSES = new Set([
  'generated',
  'accepted',
  'rejected',
  'applied',
  'suppressed',
]);

/**
 * Check whether an insight already has an active prescription
 * (one that isn't expired or failed). Prevents duplicate generation.
 */
function hasActivePrescription(insightId: number): boolean {
  const existing = listPrescriptions({ insightId });
  return existing.some((p) => ACTIVE_STATUSES.has(p.status));
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

/**
 * Generate prescriptions from active insights.
 *
 * 1. Expire stale generated prescriptions (>7 days)
 * 2. Resurface deferred prescriptions past cooldown
 * 3. For each active insight without an active prescription:
 *    generate, score, persist, and log
 */
export function prescribe(): PrescribeResult {
  // Read configurable values
  const prefix = getPreference('prescriber.sidecar_prefix') ?? DEFAULT_SIDECAR_PREFIX;
  const minConfidence = parseFloat(
    getPreference('prescriber.min_confidence') ?? String(DEFAULT_MIN_CONFIDENCE),
  );

  // --- Step 1: Session cleanup ---
  expireAbandonedPrescriptions();

  // --- Step 2: Resurface deferred prescriptions past cooldown ---
  const currentSession = getSessionsSinceInstall();
  const deferred = listPrescriptions({ status: 'deferred' });
  const activeInsights = getInsights('active');
  const topology = getTopology();

  for (const rx of deferred) {
    if (!shouldResurface(rx, currentSession)) continue;

    // Check auto-suppression before resurfacing
    if (checkAutoSuppress(rx.id, rx.deferCount)) continue;

    // Expire the old deferred prescription
    updatePrescriptionStatus(rx.id, 'expired', {
      dispositionReason: 'resurfaced after cooldown',
    });

    // Re-generate from the same insight (if insight is still active)
    const sourceInsight = activeInsights.find((i) => i.id === rx.insightId);
    if (!sourceInsight) continue;

    // Generate new prescription from the same insight
    generatePrescription(sourceInsight, topology, prefix, minConfidence);
  }

  // --- Step 3: Generate new prescriptions from active insights ---

  let generated = 0;
  const sessionId = findActiveSessionId();

  for (const insight of activeInsights) {
    // Skip low-confidence insights
    if (insight.confidence < minConfidence) continue;

    // Idempotent: skip if an active prescription already exists
    if (hasActivePrescription(insight.id)) continue;

    const prescriptionId = generatePrescription(
      insight,
      topology,
      prefix,
      minConfidence,
    );

    if (prescriptionId !== null) {
      generated++;

      // Log event if we have a session context
      if (sessionId) {
        logEvent(sessionId, 'prescription_generated', {
          prescriptionId,
          insightId: insight.id,
          patternType: insight.patternType,
        });
      }
    }
  }

  return { prescriptionsGenerated: generated };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getTopology(): ArtifactTopology | null {
  const cached = getCachedTopology();
  if (cached) return cached;

  try {
    const topology = scanTopology(os.homedir(), process.cwd());
    cacheTopology(topology);
    return topology;
  } catch {
    return null;
  }
}

/**
 * Generate a single prescription from an insight.
 * Returns the prescription ID, or null if generation was skipped.
 */
function generatePrescription(
  insight: Insight,
  topology: ArtifactTopology | null,
  prefix: string,
  _minConfidence: number,
): number | null {
  const generator = GENERATORS[insight.patternType];
  if (!generator) return null;

  const { title, rationale, proposedChange } = generator(insight);
  const { targetPath, artifactScope } = computeTargetPath(topology, prefix);

  // Compute how many sessions since this insight was last seen
  // (use 0 as default — insight is fresh)
  const sessionsAgo = 0; // Fresh insights get full recency weight

  const priorityScore = computePriority(
    insight.confidence,
    insight.lastSeenAt,
    sessionsAgo,
    0, // No prior rejections for new prescriptions
  );

  const prescriptionId = createPrescription({
    insightId: insight.id,
    patternType: insight.patternType,
    title,
    rationale,
    proposedChange,
    targetPath,
    artifactType: 'instruction',
    artifactScope,
    confidence: insight.confidence,
    priorityScore,
    recencyWeight: Math.min(1.0, Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15))),
    availabilityFactor: 1.0,
  });

  return prescriptionId;
}
