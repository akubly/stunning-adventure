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
import type { CairnEvent, CuratorStatus } from '../types/index.js';

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
// Categorised event helpers
// ---------------------------------------------------------------------------

interface ParsedPayload {
  [key: string]: unknown;
}

function parsePayload(event: CairnEvent): ParsedPayload {
  try {
    return JSON.parse(event.payload) as ParsedPayload;
  } catch {
    return {};
  }
}

/** Safely coerce an unknown payload value to a string. */
function safeString(value: unknown, fallback: string = ''): string {
  if (typeof value === 'string') return value;
  if (value != null) return String(value);
  return fallback;
}

/** Parse a SQLite datetime string into milliseconds. Returns NaN guard on failure. */
function parseTimestamp(sqliteDatetime: string): number {
  // SQLite datetime('now') produces 'YYYY-MM-DD HH:MM:SS' — append 'Z' for UTC
  const ms = new Date(sqliteDatetime.includes('T') ? sqliteDatetime : sqliteDatetime + 'Z').getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** Build a deduplication key for an error event. */
function errorKey(payload: ParsedPayload): string {
  const category = safeString(payload.category, 'unknown');
  const message = safeString(payload.message);
  // Normalise whitespace and truncate for grouping
  const normMessage = message.replace(/\s+/g, ' ').trim().slice(0, 120);
  return `${category}::${normMessage}`;
}

// ---------------------------------------------------------------------------
// Core pipeline
// ---------------------------------------------------------------------------

export interface CurateResult {
  eventsProcessed: number;
  insightsCreated: number;
  insightsReinforced: number;
}

/**
 * Main entry point: process all unprocessed events, detect patterns,
 * store insights, and advance the cursor.
 *
 * All insight writes and cursor advancement are wrapped in a single
 * transaction to prevent evidence inflation on crash-and-retry.
 */
export function curate(): CurateResult {
  const cursor = getLastProcessedEventId();
  const events = getUnprocessedEvents(cursor);

  if (events.length === 0) {
    updateLastRunTimestamp();
    return { eventsProcessed: 0, insightsCreated: 0, insightsReinforced: 0 };
  }

  let insightsCreated = 0;
  let insightsReinforced = 0;

  const db = getDb();
  db.transaction(() => {
    // Pass 1: Recurring error detection
    const errorResult = detectRecurringErrors(events);
    insightsCreated += errorResult.created;
    insightsReinforced += errorResult.reinforced;

    // Pass 2: Error sequence detection (partitioned by session)
    const sequenceResult = detectErrorSequences(events);
    insightsCreated += sequenceResult.created;
    insightsReinforced += sequenceResult.reinforced;

    // Pass 3: Skip frequency detection
    const skipResult = detectSkipFrequency(events);
    insightsCreated += skipResult.created;
    insightsReinforced += skipResult.reinforced;

    // Advance cursor to the last processed event
    const lastEvent = events[events.length - 1];
    advanceCursor(lastEvent.id);
  })();

  updateLastRunTimestamp();

  return {
    eventsProcessed: events.length,
    insightsCreated,
    insightsReinforced,
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
    const key = errorKey(payload);

    const group = errorGroups.get(key);
    if (group) {
      group.events.push(event);
    } else {
      errorGroups.set(key, { events: [event], payload });
    }
  }

  for (const [, group] of errorGroups) {
    if (group.events.length < RECURRING_ERROR_THRESHOLD) continue;

    const category = safeString(group.payload.category, 'unknown');
    const message = safeString(group.payload.message);
    const normMessage = message.replace(/\s+/g, ' ').trim().slice(0, 120);
    const title = `Recurring ${category}: ${normMessage}`;
    const description = `"${message.slice(0, 200)}" occurred ${group.events.length} times in this batch`;
    const evidence = group.events.map((e) => e.id);
    // Recurring errors reach full confidence at 5 occurrences (stricter
    // than sequences/skips at 4) to reduce false positives on noisy categories.
    const confidence = Math.min(1.0, group.events.length / 5);
    const prescription = prescribeForRecurringError(category);

    const existing = getInsightByPattern('recurring_error', title);
    if (existing) {
      reinforceInsight(existing.id, evidence, Math.max(existing.confidence, confidence));
      reinforced++;
    } else {
      createInsight('recurring_error', title, description, evidence, confidence, prescription);
      created++;
    }
  }

  return { created, reinforced };
}

/**
 * Detect error sequences: find cases where a specific event type
 * is consistently followed by an error within the time window.
 * Events are partitioned by session to avoid cross-session false positives.
 */
function detectErrorSequences(events: CairnEvent[]): DetectionResult {
  let created = 0;
  let reinforced = 0;

  // Partition events by session for accurate adjacency detection
  const bySession = new Map<string, CairnEvent[]>();
  for (const event of events) {
    const list = bySession.get(event.sessionId);
    if (list) {
      list.push(event);
    } else {
      bySession.set(event.sessionId, [event]);
    }
  }

  // Build sequence pairs within each session
  const sequenceCounts = new Map<string, { count: number; evidence: number[] }>();

  for (const [, sessionEvents] of bySession) {
    for (let i = 1; i < sessionEvents.length; i++) {
      if (sessionEvents[i].eventType !== 'error') continue;

      const errorEvent = sessionEvents[i];
      const precedingEvent = sessionEvents[i - 1];

      if (precedingEvent.eventType === 'error') continue;

      // Check time window — parseTimestamp handles SQLite datetime safely
      const errorTime = parseTimestamp(errorEvent.createdAt);
      const precedingTime = parseTimestamp(precedingEvent.createdAt);
      if (errorTime - precedingTime > SEQUENCE_WINDOW_MS || errorTime - precedingTime < 0) continue;

      const errorPayload = parsePayload(errorEvent);
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
        });
      }
    }
  }

  for (const [seqKey, data] of sequenceCounts) {
    if (data.count < SEQUENCE_THRESHOLD) continue;

    const title = `Sequence: ${seqKey}`;
    const description = `Pattern "${seqKey}" detected ${data.count} times`;
    // Sequences and skips reach full confidence at 4 occurrences.
    const confidence = Math.min(1.0, data.count / 4);
    const prescription = `Consider adding a check or guard between the "${seqKey.split(' → ')[0]}" step and the operation that causes the "${seqKey.split(' → ')[1]}" error.`;

    const existingInsight = getInsightByPattern('error_sequence', title);
    if (existingInsight) {
      reinforceInsight(
        existingInsight.id,
        data.evidence,
        Math.max(existingInsight.confidence, confidence),
      );
      reinforced++;
    } else {
      createInsight('error_sequence', title, description, data.evidence, confidence, prescription);
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
    const what = safeString(payload.whatSkipped, 'unknown');

    const group = skipGroups.get(what);
    if (group) {
      group.events.push(event);
    } else {
      skipGroups.set(what, { events: [event], payload });
    }
  }

  for (const [what, group] of skipGroups) {
    if (group.events.length < SKIP_FREQUENCY_THRESHOLD) continue;

    const title = `Frequently skipped: ${what}`;
    const description = `"${what}" was skipped ${group.events.length} times in this batch`;
    const evidence = group.events.map((e) => e.id);
    const confidence = Math.min(1.0, group.events.length / 4);
    const prescription = `The "${what}" guardrail is being skipped frequently. Consider whether it's too strict, poorly timed, or if there's a workflow issue causing habitual bypasses.`;

    const existing = getInsightByPattern('skip_frequency', title);
    if (existing) {
      reinforceInsight(existing.id, evidence, Math.max(existing.confidence, confidence));
      reinforced++;
    } else {
      createInsight('skip_frequency', title, description, evidence, confidence, prescription);
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

  return {
    lastProcessedEventId: cursorRow?.last_processed_event_id ?? 0,
    lastRunAt: cursorRow?.last_run_at ?? null,
    totalInsights: Object.values(counts).reduce((a, b) => a + b, 0),
    activeInsights: counts['active'] ?? 0,
    staleInsights: counts['stale'] ?? 0,
  };
}

/** Update the last_run_at timestamp in curator_state. */
function updateLastRunTimestamp(): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO curator_state (id, last_processed_event_id) VALUES (1, 0)`,
  ).run();
  db.prepare("UPDATE curator_state SET last_run_at = datetime('now') WHERE id = 1").run();
}

