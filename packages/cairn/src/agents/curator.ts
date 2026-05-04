/**
 * Curator Agent
 *
 * Knowledge custodian responsible for processing the event stream, detecting
 * patterns (recurring errors, error sequences, skip frequency), generating
 * prescriptions, and storing insights back into the knowledge base.
 *
 * Designed as a static/deterministic pipeline — no LLM required.
 * Uses cursor-based polling from Phase 1b infrastructure.
 */

import { getDb } from '../db/index.js';
import { getUnprocessedEvents } from '../db/events.js';
import { getLastProcessedEventId, advanceCursor } from '../db/curatorState.js';
import {
  createInsight,
  reinforceInsight,
  getInsightByPattern,
  countInsightsByStatus,
} from '../db/insights.js';
import {
  insertChangeVector,
  getChangeVectorsByHintId,
  computeNetImpact,
} from '../db/changeVectors.js';
import type { CairnEvent, CuratorStatus } from '../types/index.js';
import { parseSqliteDateToMs } from '../utils/timestamps.js';

export const AGENT_NAME = 'curator';
export const AGENT_DESCRIPTION = 'Knowledge custodian, error processor, RCA pipeline';

// Re-export cursor functions for convenience
export { getLastProcessedEventId, advanceCursor };

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum occurrences before a recurring error becomes an insight. */
const RECURRING_ERROR_THRESHOLD = 2;

/** Minimum occurrences before an error sequence becomes an insight. */
const SEQUENCE_THRESHOLD = 2;

/** Minimum occurrences before a skip pattern becomes an insight. */
const SKIP_FREQUENCY_THRESHOLD = 2;

/** Maximum time window (ms) between events to consider them part of a sequence. */
const SEQUENCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ---------------------------------------------------------------------------
// Change vector configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the Curator's change-vector computation sweep.
 * Consistent with the "observe, don't block" Curator pattern — computation
 * is deferred until enough post-application sessions exist to be meaningful.
 */
export interface ChangeVectorConfig {
  /**
   * Minimum sessions (execution_profiles.session_count) required before
   * computing a change vector for an applied hint. Default: 3.
   * Matches the prompt optimizer's `minSessions` canary threshold.
   */
  minSessionsObserved?: number;
}

// ---------------------------------------------------------------------------
// Categorised event helpers
// ---------------------------------------------------------------------------

interface ParsedPayload {
  [key: string]: unknown;
}

function parsePayload(event: CairnEvent): ParsedPayload | null {
  try {
    const parsed = JSON.parse(event.payload);
    if (parsed && typeof parsed === 'object') {
      return parsed as ParsedPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Safely coerce an unknown payload value to a string. */
function safeString(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (value != null) return String(value);
  return fallback;
}

/** Parse a SQLite datetime string into milliseconds. Returns NaN on failure. */
function parseTimestamp(sqliteDatetime: string): number {
  return parseSqliteDateToMs(sqliteDatetime) ?? NaN;
}

/** Build a deduplication key for an error event. Uses full normalised message. */
function errorKey(payload: ParsedPayload): string {
  const category = safeString(payload.category, 'unknown');
  const message = safeString(payload.message);
  // Normalise whitespace; no truncation here — errorKey is only used as a Map key
  const normMessage = message.replace(/\s+/g, ' ').trim();
  return `${category}::${normMessage}`;
}

/** Truncate a string for display, appending a hash suffix when truncated. */
function truncateWithHash(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  // DJB2 hash — 8-char base36 suffix for collision resistance
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  const suffix = (hash >>> 0).toString(36).padStart(8, '0').slice(0, 8);
  return `${value.slice(0, maxLen - 9)}…${suffix}`;
}

/** Maximum events to process per batch to bound memory and transaction time. */
const BATCH_SIZE = 1000;

/** Soft time cap (ms) for curate() — checked between batches. */
export const TIME_BUDGET_MS = 3000;

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export interface CurateResult {
  eventsProcessed: number;
  insightsCreated: number;
  insightsReinforced: number;
  capped: boolean;
  insightsChanged: boolean;
  /** Number of change vectors computed during this sweep run. */
  vectorsComputed: number;
}

/**
 * Main entry point: process unprocessed events in bounded batches,
 * detect patterns, store insights, and advance the cursor.
 * Also sweeps for applied optimization hints that now have enough
 * post-application sessions to compute change vectors.
 *
 * Each batch is wrapped in a transaction. Loops until caught up.
 */
export function curate(changeVectorConfig?: ChangeVectorConfig): CurateResult {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalCreated = 0;
  let totalReinforced = 0;
  let capped = false;

  // Track the last event per session across batches so sequence detection
  // can find pairs that straddle batch boundaries.
  const lastEventPerSession = new Map<string, CairnEvent>();

  // Process in batches to bound memory usage
  let hasMore = true;
  while (hasMore) {
    const cursor = getLastProcessedEventId();
    const events = getUnprocessedEvents(cursor, BATCH_SIZE);

    if (events.length === 0) break;

    let insightsCreated = 0;
    let insightsReinforced = 0;

    const db = getDb();
    db.transaction(() => {
      const errorResult = detectRecurringErrors(events);
      insightsCreated += errorResult.created;
      insightsReinforced += errorResult.reinforced;

      const sequenceResult = detectErrorSequences(events, lastEventPerSession);
      insightsCreated += sequenceResult.created;
      insightsReinforced += sequenceResult.reinforced;

      const skipResult = detectSkipFrequency(events);
      insightsCreated += skipResult.created;
      insightsReinforced += skipResult.reinforced;

      const lastEvent = events[events.length - 1];
      advanceCursor(lastEvent.id);
    })();

    // Update last-event-per-session for next batch's boundary detection
    for (const event of events) {
      lastEventPerSession.set(event.sessionId, event);
    }

    totalProcessed += events.length;
    totalCreated += insightsCreated;
    totalReinforced += insightsReinforced;

    // If we got fewer than BATCH_SIZE, we're caught up
    if (events.length < BATCH_SIZE) {
      hasMore = false;
    } else if (Date.now() - startTime > TIME_BUDGET_MS) {
      // Time budget exhausted — persist cursor (already done in txn) and stop
      capped = true;
      hasMore = false;
    }
  }

  updateLastRunTimestamp();

  const vectorsComputed = sweepChangeVectors(changeVectorConfig);

  return {
    eventsProcessed: totalProcessed,
    insightsCreated: totalCreated,
    insightsReinforced: totalReinforced,
    capped,
    insightsChanged: totalCreated > 0 || totalReinforced > 0,
    vectorsComputed,
  };
}

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

interface DetectionResult {
  created: number;
  reinforced: number;
}

/**
 * Detect recurring errors: group error events by category+message,
 * create/reinforce insights for groups that meet the threshold.
 */
function detectRecurringErrors(events: CairnEvent[]): DetectionResult {
  let created = 0;
  let reinforced = 0;

  const errorGroups = new Map<string, { events: CairnEvent[]; payload: ParsedPayload }>();

  for (const event of events) {
    if (event.eventType !== 'error') continue;
    const payload = parsePayload(event);
    if (!payload) continue;
    const key = errorKey(payload);

    const group = errorGroups.get(key);
    if (group) {
      group.events.push(event);
    } else {
      errorGroups.set(key, { events: [event], payload });
    }
  }

  for (const [, group] of errorGroups) {
    const category = safeString(group.payload.category, 'unknown');
    const message = safeString(group.payload.message);
    const normMessage = message.replace(/\s+/g, ' ').trim();
    const title = `Recurring ${category}: ${truncateWithHash(normMessage, 120)}`;

    const existing = getInsightByPattern('recurring_error', title);
    const totalOccurrences = (existing?.occurrenceCount ?? 0) + group.events.length;

    // Threshold applies to total occurrences across all batches, not just
    // the current one. This ensures an error occurring once per curate run
    // is promoted after enough cumulative observations.
    if (totalOccurrences < RECURRING_ERROR_THRESHOLD) continue;

    const description = `Recurring "${message.slice(0, 200)}" error in category "${category}"`;
    const evidence = group.events.map((e) => e.id);
    const prescription = prescribeForRecurringError(category);
    // Confidence grows with total occurrences (reaches 1.0 at 5)
    const confidence = Math.min(1.0, totalOccurrences / 5);

    if (existing) {
      reinforceInsight(existing.id, evidence, Math.max(existing.confidence, confidence), group.events.length);
      reinforced++;
    } else {
      createInsight('recurring_error', title, description, evidence, confidence, group.events.length, prescription);
      created++;
    }
  }

  return { created, reinforced };
}

/**
 * Detect error sequences: find cases where a specific event type
 * is consistently followed by an error within the time window.
 * Events are partitioned by session to avoid cross-session false positives.
 * Accepts carryover events from the previous batch to detect boundary-straddling pairs.
 */
function detectErrorSequences(
  events: CairnEvent[],
  lastEventPerSession: Map<string, CairnEvent> = new Map(),
): DetectionResult {
  let created = 0;
  let reinforced = 0;

  // Partition events by session, prepending carryover from previous batch
  const bySession = new Map<string, CairnEvent[]>();
  for (const event of events) {
    const list = bySession.get(event.sessionId);
    if (list) {
      list.push(event);
    } else {
      // Prepend the carryover event (if any) so boundary pairs are detected
      const carryover = lastEventPerSession.get(event.sessionId);
      bySession.set(event.sessionId, carryover ? [carryover, event] : [event]);
    }
  }

  interface SequenceData {
    count: number;
    evidence: number[];
    precedingType: string;
    errorCategory: string;
  }

  // Build sequence pairs within each session
  const sequenceCounts = new Map<string, SequenceData>();

  for (const [, sessionEvents] of bySession) {
    for (let i = 1; i < sessionEvents.length; i++) {
      if (sessionEvents[i].eventType !== 'error') continue;

      const errorEvent = sessionEvents[i];
      const precedingEvent = sessionEvents[i - 1];

      if (precedingEvent.eventType === 'error') continue;

      // Check time window — parseTimestamp handles SQLite datetime safely
      const errorTime = parseTimestamp(errorEvent.createdAt);
      const precedingTime = parseTimestamp(precedingEvent.createdAt);
      if (isNaN(errorTime) || isNaN(precedingTime)) continue;
      if (errorTime - precedingTime > SEQUENCE_WINDOW_MS || errorTime - precedingTime < 0) continue;

      const errorPayload = parsePayload(errorEvent);
      if (!errorPayload) continue;
      const errorCat = safeString(errorPayload.category, 'unknown');
      const seqKey = `${precedingEvent.eventType} → ${errorCat}`;

      const existing = sequenceCounts.get(seqKey);
      if (existing) {
        existing.count++;
        existing.evidence.push(precedingEvent.id, errorEvent.id);
      } else {
        sequenceCounts.set(seqKey, {
          count: 1,
          evidence: [precedingEvent.id, errorEvent.id],
          precedingType: precedingEvent.eventType,
          errorCategory: errorCat,
        });
      }
    }
  }

  for (const [seqKey, data] of sequenceCounts) {
    const title = `Sequence: ${seqKey}`;

    const existingInsight = getInsightByPattern('error_sequence', title);
    const totalCount = (existingInsight?.occurrenceCount ?? 0) + data.count;

    if (totalCount < SEQUENCE_THRESHOLD) continue;

    const description = `"${data.precedingType}" is frequently followed by a "${data.errorCategory}" error`;
    const prescription = `Consider adding a check or guard between the "${data.precedingType}" step and the operation that causes the "${data.errorCategory}" error.`;
    const confidence = Math.min(1.0, totalCount / 4);

    if (existingInsight) {
      reinforceInsight(
        existingInsight.id,
        data.evidence,
        Math.max(existingInsight.confidence, confidence),
        data.count,
      );
      reinforced++;
    } else {
      createInsight('error_sequence', title, description, data.evidence, confidence, data.count, prescription);
      created++;
    }
  }

  return { created, reinforced };
}

/**
 * Detect skip frequency: find guardrails that get skipped repeatedly.
 */
function detectSkipFrequency(events: CairnEvent[]): DetectionResult {
  let created = 0;
  let reinforced = 0;

  const skipGroups = new Map<string, { events: CairnEvent[]; payload: ParsedPayload }>();

  for (const event of events) {
    if (event.eventType !== 'skip') continue;
    const payload = parsePayload(event);
    if (!payload) continue;
    const what = safeString(payload.whatSkipped, 'unknown');

    const group = skipGroups.get(what);
    if (group) {
      group.events.push(event);
    } else {
      skipGroups.set(what, { events: [event], payload });
    }
  }

  for (const [what, group] of skipGroups) {
    const title = `Frequently skipped: ${what}`;

    const existing = getInsightByPattern('skip_frequency', title);
    const totalOccurrences = (existing?.occurrenceCount ?? 0) + group.events.length;

    if (totalOccurrences < SKIP_FREQUENCY_THRESHOLD) continue;

    const description = `"${what}" has been frequently skipped across sessions`;
    const evidence = group.events.map((e) => e.id);
    const prescription = `The "${what}" guardrail is being skipped frequently. Consider whether it's too strict, poorly timed, or if there's a workflow issue causing habitual bypasses.`;
    const confidence = Math.min(1.0, totalOccurrences / 4);

    if (existing) {
      reinforceInsight(existing.id, evidence, Math.max(existing.confidence, confidence), group.events.length);
      reinforced++;
    } else {
      createInsight('skip_frequency', title, description, evidence, confidence, group.events.length, prescription);
      created++;
    }
  }

  return { created, reinforced };
}

// ---------------------------------------------------------------------------
// Prescriptions (static rule-based)
// ---------------------------------------------------------------------------

const ERROR_PRESCRIPTIONS: Record<string, string> = {
  build:
    'Build errors are recurring. Check for missing dependencies, stale caches, or schema changes that require migration.',
  test: 'Test failures are recurring. Review whether tests are flaky, assertions are brittle, or test data is stale.',
  type: 'Type errors are recurring. Consider running typecheck before committing, or tightening type definitions at the boundary.',
  lint: 'Lint errors are recurring. Consider auto-fixing on save or adding a pre-commit hook.',
  auth: 'Auth errors are recurring. Check token expiration, credential rotation, or environment variable configuration.',
};

function prescribeForRecurringError(category: string): string {
  return (
    ERROR_PRESCRIPTIONS[category] ??
    `"${category}" errors are recurring. Investigate the root cause to prevent repeated failures.`
  );
}

// ---------------------------------------------------------------------------
// Status & reporting
// ---------------------------------------------------------------------------

/** Get the Curator's current operational status. */
export function getCuratorStatus(): CuratorStatus {
  const db = getDb();
  const cursorRow = db
    .prepare('SELECT last_processed_event_id, last_run_at FROM curator_state WHERE id = 1')
    .get() as { last_processed_event_id: number; last_run_at: string | null } | undefined;

  const counts = countInsightsByStatus();

  const activeCount = counts['active'] ?? 0;
  const staleCount = counts['stale'] ?? 0;
  const prunedCount = counts['pruned'] ?? 0;

  return {
    lastProcessedEventId: cursorRow?.last_processed_event_id ?? 0,
    lastRunAt: cursorRow?.last_run_at ?? null,
    totalInsights: Object.values(counts).reduce((a, b) => a + b, 0),
    activeInsights: activeCount,
    staleInsights: staleCount,
    prunedInsights: prunedCount,
  };
}

// ---------------------------------------------------------------------------
// Change vector sweep
// ---------------------------------------------------------------------------

interface MetricSnapshotShape {
  driftScore?: number;
  /** Cumulative total cost (nanoAIU) at snapshot time. Divide by sessionCount for per-session cost. */
  tokenCostNanoAiu?: number;
  successRate?: number;
  convergenceTurns?: number;
  cacheHitRate?: number;
  /** profile.sessionCount at snapshot time — required for per-session cost delta. */
  sessionCount?: number;
}

interface AppliedHintRow {
  id: string;
  skill_id: string;
  metric_snapshot: string;
}

interface ProfileRow {
  session_count: number;
  drift_mean: number;
  token_total_cost: number;
  outcome_success_rate: number;
  outcome_mean_convergence: number;
  token_mean_cache_hit: number;
}

/**
 * Sweep applied optimization hints and compute change vectors for those with
 * enough post-application sessions and no existing vector.
 *
 * Follows the "observe, don't block" Curator pattern — runs outside the event
 * processing loop, fails silently per-hint on malformed snapshots.
 *
 * @returns Number of change vectors inserted in this sweep.
 */
function sweepChangeVectors(config?: ChangeVectorConfig): number {
  const minSessions = config?.minSessionsObserved ?? 3;
  const db = getDb();
  let computed = 0;

  // Find all applied hints that don't yet have a change vector
  const appliedHints = db.prepare(
    `SELECT id, skill_id, metric_snapshot
       FROM optimization_hints
      WHERE status = 'applied'
        AND id NOT IN (SELECT DISTINCT hint_id FROM change_vectors)`
  ).all() as AppliedHintRow[];

  for (const hint of appliedHints) {
    // Lookup the per-skill global execution profile (canonical post-application snapshot)
    const profile = db.prepare(
      `SELECT session_count, drift_mean, token_total_cost,
              outcome_success_rate, outcome_mean_convergence, token_mean_cache_hit
         FROM execution_profiles
        WHERE skill_id = ? AND granularity = 'per-skill' AND granularity_key = 'global'
        LIMIT 1`
    ).get(hint.skill_id) as ProfileRow | undefined;

    if (!profile || profile.session_count < minSessions) continue;

    let snapshot: MetricSnapshotShape;
    try {
      snapshot = JSON.parse(hint.metric_snapshot) as MetricSnapshotShape;
    } catch {
      continue; // malformed snapshot — skip, don't block
    }

    const before = {
      driftScore: snapshot.driftScore ?? 0,
      successRate: snapshot.successRate ?? 0,
      convergenceTurns: snapshot.convergenceTurns ?? 0,
      cacheHitRate: snapshot.cacheHitRate ?? 0,
    };

    // Normalize cost to per-session on both sides to avoid cumulative skew.
    // before: totalCost at snapshot time / sessions at snapshot time
    // after:  totalCost now / sessions now
    const snapshotSessionCount = snapshot.sessionCount ?? 0;
    const afterCostPerSession = profile.token_total_cost / Math.max(1, profile.session_count);
    const beforeCostPerSession =
      snapshotSessionCount > 0
        ? (snapshot.tokenCostNanoAiu ?? 0) / snapshotSessionCount
        : (snapshot.tokenCostNanoAiu ?? 0);

    const deltas = {
      deltaDrift: profile.drift_mean - before.driftScore,
      deltaCost: afterCostPerSession - beforeCostPerSession,
      deltaSuccessRate: profile.outcome_success_rate - before.successRate,
      deltaConvergence: profile.outcome_mean_convergence - before.convergenceTurns,
      deltaCacheHit: profile.token_mean_cache_hit - before.cacheHitRate,
    };

    // Guard: skip if a vector was inserted between our NOT IN check and now
    const existing = getChangeVectorsByHintId(db, hint.id);
    if (existing.length > 0) continue;

    db.transaction(() => {
      insertChangeVector(db, {
        hintId: hint.id,
        deltas,
        sessionsObserved: profile.session_count - snapshotSessionCount,
        computedAt: new Date().toISOString(),
      });
    })();

    computed++;
  }

  return computed;
}

/** Update the last_run_at timestamp in curator_state. */
function updateLastRunTimestamp(): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO curator_state (id, last_processed_event_id) VALUES (1, 0)`,
  ).run();
  db.prepare(
    "UPDATE curator_state SET last_run_at = datetime('now'), updated_at = datetime('now') WHERE id = 1",
  ).run();
}

