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

import type { PrescriberOrchestrationConfig, PrescriberRunResult } from '@akubly/types';
import type Database from 'better-sqlite3';
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
  computeNetImpact,
  DEFAULT_MIN_SESSIONS,
} from '../db/changeVectors.js';
import { enforceSignalSampleCap, sweepSignalSamples } from '../db/signalSamples.js';
import type { CairnEvent, CuratorStatus } from '../types/index.js';
import { parseSqliteDateToMs } from '../utils/timestamps.js';
import { buildProfiles } from './profileBuilder.js';
import type { BuildResult } from './profileBuilder.js';

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

/** Soft time cap (ms) for post-sweep prescriber orchestration. */
export const PRESCRIBER_TIME_BUDGET_MS = 5000;

/**
 * Maximum rows kept in the signal_samples table (matches migration comment:
 * "7-day TTL, capped at 10K rows"). Enforced by curate() in its own guarded
 * block, independent of buildProfiles success.
 */
const SIGNAL_SAMPLE_CAP = 10_000;

/**
 * TTL for signal_samples rows (7 days, matching migration design note).
 * Rows older than this are swept by curate() in its own guarded block,
 * independent of buildProfiles success.
 */
const SIGNAL_SAMPLE_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export interface CurateResult {
  eventsProcessed: number;
  insightsCreated: number;
  insightsReinforced: number;
  capped: boolean;
  insightsChanged: boolean;
  /** Structured diagnostics from the change-vector sweep run. */
  changeVectorSweep: ChangeVectorSweepResult;
  /** Per-skill prescriber orchestration results for skills whose vectors were just computed. */
  prescribers?: PrescriberRunResult[];
  /** Summary of the profile-build step run before the change-vector sweep. */
  profileBuild?: BuildResult;
}

/**
 * Main entry point: process unprocessed events in bounded batches,
 * detect patterns, store insights, and advance the cursor.
 * Also sweeps for applied optimization hints that now have enough
 * post-application sessions to compute change vectors.
 *
 * Each batch is wrapped in a transaction. Loops until caught up.
 */
export async function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
): Promise<CurateResult> {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalCreated = 0;
  let totalReinforced = 0;
  let capped = false;
  const db = getDb();

  // Track the last event per session across batches so sequence detection
  // can find pairs that straddle batch boundaries.
  const lastEventPerSession = new Map<string, CairnEvent>();

  // Process in batches to bound memory usage
  let hasMore = true;
  while (hasMore) {
    const cursor = getLastProcessedEventId(db);
    // TODO(cycle-1 I10): Wave 5 should decide whether Curator skips __system__ events; filtering here must still advance the raw-event cursor.
    const events = getUnprocessedEvents(db, cursor, BATCH_SIZE);

    if (events.length === 0) break;

    let insightsCreated = 0;
    let insightsReinforced = 0;

    db.transaction(() => {
      const errorResult = detectRecurringErrors(db, events);
      insightsCreated += errorResult.created;
      insightsReinforced += errorResult.reinforced;

      const sequenceResult = detectErrorSequences(db, events, lastEventPerSession);
      insightsCreated += sequenceResult.created;
      insightsReinforced += sequenceResult.reinforced;

      const skipResult = detectSkipFrequency(db, events);
      insightsCreated += skipResult.created;
      insightsReinforced += skipResult.reinforced;

      const lastEvent = events[events.length - 1];
      advanceCursor(db, lastEvent.id);
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

  updateLastRunTimestamp(db);

  // Sweep signal_samples FIRST so buildProfiles reads the bounded, in-TTL
  // retained set rather than the full table.  Fail-open: if sweep/cap throws,
  // buildProfiles still runs (independent block).
  try {
    const cutoffIso = new Date(Date.now() - SIGNAL_SAMPLE_TTL_MS).toISOString();
    sweepSignalSamples(db, cutoffIso);
    enforceSignalSampleCap(db, SIGNAL_SAMPLE_CAP);
  } catch (error: unknown) {
    console.warn('curate: signal_samples sweep/cap failed, table may grow unbounded', error);
  }

  let profileBuild: BuildResult | undefined;
  try {
    profileBuild = buildProfiles(db);
  } catch (error: unknown) {
    console.warn('curate: buildProfiles failed, skipping profile build', error);
  }

  const changeVectorSweep = sweepChangeVectors(db, changeVectorConfig);
  const prescribers = prescriberOrchestrationConfig
    ? await runPrescribersForComputedSkills(
        changeVectorSweep,
        changeVectorConfig,
        prescriberOrchestrationConfig,
      )
    : undefined;

  return {
    eventsProcessed: totalProcessed,
    insightsCreated: totalCreated,
    insightsReinforced: totalReinforced,
    capped,
    insightsChanged: totalCreated > 0 || totalReinforced > 0,
    changeVectorSweep,
    ...(prescribers !== undefined ? { prescribers } : {}),
    ...(profileBuild !== undefined ? { profileBuild } : {}),
  };
}

async function runPrescribersForComputedSkills(
  changeVectorSweep: ChangeVectorSweepResult,
  changeVectorConfig: ChangeVectorConfig | undefined,
  prescriberOrchestrationConfig: PrescriberOrchestrationConfig,
): Promise<PrescriberRunResult[]> {
  const minSessions = changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS;
  const results: PrescriberRunResult[] = [];
  const prescriberStart = Date.now();
  const totalSkills = changeVectorSweep.computedSkillIds.length;

  for (const [index, skillId] of changeVectorSweep.computedSkillIds.entries()) {
    if (Date.now() - prescriberStart >= PRESCRIBER_TIME_BUDGET_MS) {
      console.warn(
        `runPrescribersForComputedSkills: time budget ${PRESCRIBER_TIME_BUDGET_MS}ms exceeded after ${results.length}/${totalSkills} skills; skipping remaining`,
      );
      results.push(
        ...changeVectorSweep.computedSkillIds.slice(index).map((remainingSkillId) => ({
          skillId: remainingSkillId,
          hintsGenerated: 0,
          hintsInserted: 0,
          hintsDuplicated: 0,
          hintsError: 0,
          skippedReason: 'time-budget-exceeded' as const,
        })),
      );
      break;
    }

    try {
      results.push(await prescriberOrchestrationConfig.runForSkill(skillId, minSessions));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`curate: prescriber orchestration failed for skill ${skillId}: ${message}`);
      results.push({
        skillId,
        hintsGenerated: 0,
        hintsInserted: 0,
        hintsDuplicated: 0,
        hintsError: 1,
      });
    }
  }

  return results;
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
function detectRecurringErrors(db: Database.Database, events: CairnEvent[]): DetectionResult {
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

    const existing = getInsightByPattern(db, 'recurring_error', title);
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
      reinforceInsight(db, existing.id, evidence, Math.max(existing.confidence, confidence), group.events.length);
      reinforced++;
    } else {
      createInsight(db, 'recurring_error', title, description, evidence, confidence, group.events.length, prescription);
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
  db: Database.Database,
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

    const existingInsight = getInsightByPattern(db, 'error_sequence', title);
    const totalCount = (existingInsight?.occurrenceCount ?? 0) + data.count;

    if (totalCount < SEQUENCE_THRESHOLD) continue;

    const description = `"${data.precedingType}" is frequently followed by a "${data.errorCategory}" error`;
    const prescription = `Consider adding a check or guard between the "${data.precedingType}" step and the operation that causes the "${data.errorCategory}" error.`;
    const confidence = Math.min(1.0, totalCount / 4);

    if (existingInsight) {
      reinforceInsight(db,
        existingInsight.id,
        data.evidence,
        Math.max(existingInsight.confidence, confidence),
        data.count,
      );
      reinforced++;
    } else {
      createInsight(db, 'error_sequence', title, description, data.evidence, confidence, data.count, prescription);
      created++;
    }
  }

  return { created, reinforced };
}

/**
 * Detect skip frequency: find guardrails that get skipped repeatedly.
 */
function detectSkipFrequency(db: Database.Database, events: CairnEvent[]): DetectionResult {
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

    const existing = getInsightByPattern(db, 'skip_frequency', title);
    const totalOccurrences = (existing?.occurrenceCount ?? 0) + group.events.length;

    if (totalOccurrences < SKIP_FREQUENCY_THRESHOLD) continue;

    const description = `"${what}" has been frequently skipped across sessions`;
    const evidence = group.events.map((e) => e.id);
    const prescription = `The "${what}" guardrail is being skipped frequently. Consider whether it's too strict, poorly timed, or if there's a workflow issue causing habitual bypasses.`;
    const confidence = Math.min(1.0, totalOccurrences / 4);

    if (existing) {
      reinforceInsight(db, existing.id, evidence, Math.max(existing.confidence, confidence), group.events.length);
      reinforced++;
    } else {
      createInsight(db, 'skip_frequency', title, description, evidence, confidence, group.events.length, prescription);
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

  const counts = countInsightsByStatus(db);

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
 * Structured diagnostic result from a change-vector sweep run.
 * Replaces the single `vectorsComputed` counter with per-reason breakdowns.
 */
export interface ChangeVectorSweepResult {
  /** Total applied hints scanned in this sweep. */
  eligible: number;
  /** Change vectors successfully inserted. */
  computed: number;
  /** Distinct skill IDs whose vectors were newly computed in this sweep cycle. */
  computedSkillIds: string[];
  /** Hints skipped because the profile didn't exist or hadn't accumulated enough sessions. */
  skippedInsufficientSessions: number;
  /** Hints skipped because metric_snapshot couldn't be parsed. */
  skippedMalformedSnapshot: number;
  /** Hints already had a vector (idempotent skip via INSERT OR IGNORE). */
  alreadyComputed: number;
  /**
   * Hints whose cost delta was set to 0 because the snapshot predates per-session
   * cost normalization (Phase 4.5 and earlier — no sessionCount in snapshot).
   * Other deltas (drift, success, convergence, cacheHit) are still valid.
   */
  legacyCostSkipped: number;
  /**
   * Hints where profile.session_count < snapshot.sessionCount (counter reset or
   * data anomaly). sessions_observed is clamped to 0 in these cases.
   */
  sessionCountReset: number;
}

/**
 * Sweep applied optimization hints and compute change vectors for those with
 * enough post-application sessions.
 *
 * Follows the "observe, don't block" Curator pattern — runs outside the event
 * processing loop, fails silently per-hint on malformed snapshots.
 * Idempotent: re-running over already-computed hints is safe; INSERT OR IGNORE
 * on the UNIQUE(hint_id) constraint prevents duplicates.
 *
 * **Legacy snapshot handling:** Phase 4.5 and earlier snapshots do not carry a
 * `sessionCount` field. Without it, per-session cost normalization is impossible —
 * the snapshot stored cumulative `tokenCostNanoAiu` while the current profile
 * tracks per-session cost, so a raw subtraction produces a massive spurious
 * negative delta. When `snapshot.sessionCount` is undefined or <= 0, `deltaCost`
 * is set to 0 and `result.legacyCostSkipped` is incremented. All other deltas
 * (drift, success, convergence, cacheHit) are rates/means and remain valid.
 * Re-applying the hint after a fresh snapshot will produce a complete cost delta.
 *
 * @returns Structured diagnostic counts for this sweep run.
 */
function sweepChangeVectors(
  db: Database.Database,
  config?: ChangeVectorConfig,
): ChangeVectorSweepResult {
  const minSessions = config?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS;
  const computedSkillIds = new Set<string>();
  const result: ChangeVectorSweepResult = {
    eligible: 0,
    computed: 0,
    computedSkillIds: [],
    skippedInsufficientSessions: 0,
    skippedMalformedSnapshot: 0,
    alreadyComputed: 0,
    legacyCostSkipped: 0,
    sessionCountReset: 0,
  };

  // Scan only applied hints that don't yet have a change vector. The
  // LEFT JOIN keeps sweep cost proportional to *new* work rather than the
  // full historical applied-hint set, which would otherwise grow unbounded
  // and drive linear growth in session-start latency. INSERT OR IGNORE
  // below still guards against races between concurrent sweeps.
  const appliedHints = db.prepare(
    `SELECT oh.id, oh.skill_id, oh.metric_snapshot
       FROM optimization_hints oh
       LEFT JOIN change_vectors cv ON cv.hint_id = oh.id
      WHERE oh.status = 'applied' AND cv.id IS NULL`
  ).all() as AppliedHintRow[];

  result.eligible = appliedHints.length;

  for (const hint of appliedHints) {
    // Lookup the per-skill global execution profile (canonical post-application snapshot)
    const profile = db.prepare(
      `SELECT session_count, drift_mean, token_total_cost,
              outcome_success_rate, outcome_mean_convergence, token_mean_cache_hit
         FROM execution_profiles
        WHERE skill_id = ? AND granularity = 'per-skill' AND granularity_key = 'global'
        LIMIT 1`
    ).get(hint.skill_id) as ProfileRow | undefined;

    if (!profile) {
      result.skippedInsufficientSessions++;
      continue;
    }

    let snapshot: MetricSnapshotShape;
    try {
      snapshot = JSON.parse(hint.metric_snapshot) as MetricSnapshotShape;
    } catch {
      result.skippedMalformedSnapshot++;
      continue;
    }

    // Reliability gate: count only sessions observed *since* the hint was
    // applied, not the profile's lifetime total. Otherwise a hint snapshotted
    // at sessionCount=100 would pass the gate immediately at sessionCount=101
    // even though only one post-application session has accumulated, defeating
    // the minSessionsObserved threshold. Legacy snapshots (no sessionCount)
    // fall back to the lifetime total so historical hints keep their prior
    // gating behavior.
    const snapshotSessionCount = snapshot.sessionCount ?? 0;
    const rawSessionsObserved = profile.session_count - snapshotSessionCount;
    if (snapshotSessionCount > 0 && rawSessionsObserved < 0) {
      // Counter reset or data anomaly — diagnostic counter still fires so
      // operators see the event, but we can't compute a meaningful delta.
      result.sessionCountReset++;
    }
    const sessionsSinceHint = snapshotSessionCount > 0
      ? rawSessionsObserved
      : profile.session_count;
    if (sessionsSinceHint < minSessions) {
      result.skippedInsufficientSessions++;
      continue;
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
    //
    // Legacy guard: Phase 4.5 and earlier snapshots have no sessionCount.
    // Their tokenCostNanoAiu is cumulative, not per-session, so computing
    // afterCostPerSession - beforeCumulative yields a massive spurious negative.
    // Skip cost delta entirely for these snapshots; other deltas remain valid.
    let deltaCost: number;
    let isLegacySnapshot = false;
    if (snapshotSessionCount <= 0) {
      deltaCost = 0;
      isLegacySnapshot = true;
    } else {
      const afterCostPerSession = profile.token_total_cost / Math.max(1, profile.session_count);
      const beforeCostPerSession = (snapshot.tokenCostNanoAiu ?? 0) / snapshotSessionCount;
      deltaCost = afterCostPerSession - beforeCostPerSession;
    }

    const sessionsObserved = Math.max(0, rawSessionsObserved);

    const deltas = {
      deltaDrift: profile.drift_mean - before.driftScore,
      deltaCost,
      deltaSuccessRate: profile.outcome_success_rate - before.successRate,
      deltaConvergence: profile.outcome_mean_convergence - before.convergenceTurns,
      deltaCacheHit: profile.token_mean_cache_hit - before.cacheHitRate,
    };

    // INSERT OR IGNORE: the UNIQUE(hint_id) constraint handles idempotence
    // against races; the LEFT JOIN filter above keeps steady-state work bounded.
    // changes === 0 means a concurrent sweep beat us to the insert.
    const insertResult = db.prepare(
      `INSERT OR IGNORE INTO change_vectors
         (hint_id, delta_drift, delta_cost, delta_success_rate,
          delta_convergence, delta_cache_hit, net_impact,
          sessions_observed, computed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      hint.id,
      deltas.deltaDrift,
      deltas.deltaCost,
      deltas.deltaSuccessRate,
      deltas.deltaConvergence,
      deltas.deltaCacheHit,
      computeNetImpact(deltas),
      sessionsObserved,
      new Date().toISOString(),
    );

    if (insertResult.changes > 0) {
      result.computed++;
      computedSkillIds.add(hint.skill_id);
      // Emit the legacy-snapshot warning only on the sweep that actually
      // computes the vector. The LEFT JOIN above will exclude this hint from
      // future sweeps, so the warning is naturally one-shot per hint instead
      // of repeating every curate() call.
      if (isLegacySnapshot) {
        result.legacyCostSkipped++;
        console.warn(
          `sweepChangeVectors: legacy snapshot for hint ${hint.id} — cost delta skipped (no sessionCount; cumulative cost shape incompatible with per-session normalization)`,
        );
      }
    } else {
      result.alreadyComputed++;
    }
  }

  result.computedSkillIds = [...computedSkillIds].sort();
  return result;
}

/** Update the last_run_at timestamp in curator_state. */
function updateLastRunTimestamp(db: Database.Database): void {
  db.prepare(
    `INSERT OR IGNORE INTO curator_state (id, last_processed_event_id) VALUES (1, 0)`,
  ).run();
  db.prepare(
    "UPDATE curator_state SET last_run_at = datetime('now'), updated_at = datetime('now') WHERE id = 1",
  ).run();
}

