import type Database from 'better-sqlite3';
import {
  getDb,
  getMostRecentUserSession,
  getActiveUserSession,
  getSessionsSinceInstall,
} from '@akubly/cairn';
import { loadExecutionProfile } from '@akubly/skillsmith-runtime';
import type { LoadedProfileSource } from '@akubly/skillsmith-runtime';
import { ATTENUATION_FLOOR } from '@akubly/types';
import type {
  SkillMetrics,
  SkillMetricsPrescriberRun,
  SkillMetricsStaleness,
  SkillMetricsConfidence,
} from './types.js';

// Compile-time guard: this Record forces VALID_PROFILE_SOURCES to cover every
// member of LoadedProfileSource. Adding a new member upstream breaks this build
// with a missing-key error — far better than a silent runtime regression where
// new valid values get normalized to null.
const _PROFILE_SOURCE_EXHAUSTIVENESS = {
  'per-skill': true,
  'per-model': true,
  'per-user':  true,
  'global':    true,
} as const satisfies Record<LoadedProfileSource, true>;

// Widened to ReadonlySet<string> so .has(value) accepts arbitrary strings at the
// validation site; the Set<LoadedProfileSource> initializer prevents typos in the
// member list.
const VALID_PROFILE_SOURCES: ReadonlySet<string> = new Set(
  Object.keys(_PROFILE_SOURCE_EXHAUSTIVENESS),
);

function normalizeProfileSource(value: unknown): LoadedProfileSource | null {
  return typeof value === 'string' && VALID_PROFILE_SOURCES.has(value)
    ? (value as LoadedProfileSource)
    : null;
}

export interface LoadMetricsOptions {
  skillId: string;
  repoKey?: string;
  dbPath?: string;
  prescriberRunsLimit?: number;
  now?: Date;
}

/**
 * Resolve repo key from an active user session for a given repo, or fall back
 * to the most-recent user session across all repos.
 */
function resolveActiveRepoKey(db: Database.Database, repoKey?: string): string | null {
  if (repoKey) {
    const session = getActiveUserSession(db, repoKey);
    return session?.repoKey ?? repoKey;
  }
  const session = getMostRecentUserSession(db);
  return session?.repoKey ?? null;
}

/**
 * Query the most recent prescriber_run events for a skill.
 * Returns null if the event type has never been written (W5-5 not landed yet).
 * Gracefully handles absence — this is a defensive read.
 */
function queryPrescriberRuns(
  db: Database.Database,
  skillId: string,
  limit: number,
): SkillMetricsPrescriberRun[] | null {
  let rows: Array<{ payload: string; created_at: string }>;

  try {
    rows = db
      .prepare(
        `SELECT payload, created_at
         FROM event_log
         WHERE event_type = 'prescriber_run'
           AND json_valid(payload)
           AND json_extract(payload, '$.skillId') = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(skillId, limit) as Array<{ payload: string; created_at: string }>;

    if (rows.length === 0) {
      // Determine whether the event type exists at all vs. skill just has no runs.
      const anyRow = db
        .prepare(`SELECT 1 FROM event_log WHERE event_type = 'prescriber_run' LIMIT 1`)
        .get() as Record<string, unknown> | undefined;

      // If no prescriber_run events exist anywhere, treat as W5-5 not landed.
      if (!anyRow) {
        return null;
      }

      return [];
    }
  } catch {
    // DB-level failure (schema mismatch, lock, etc.) — degrade to null so callers
    // treat the event type as absent rather than crashing.
    return null;
  }

  // Per-row JSON.parse — a single corrupt row must not abort the entire result.
  const validRows: SkillMetricsPrescriberRun[] = [];
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload) as {
        triggeredBy?: unknown;
        profileSource?: unknown;
        result?: {
          inserted?: unknown;
          skipped?: unknown;
          errored?: unknown;
          totalHints?: unknown;
        };
      };

      const rawProfileSource = payload.profileSource;
      const profileSource = normalizeProfileSource(rawProfileSource);
      if (profileSource === null && typeof rawProfileSource === 'string' && rawProfileSource.length > 0) {
        process.stderr.write(
          `[loadMetrics] prescriber_run row has unknown profileSource ${JSON.stringify(rawProfileSource)} — coerced to null\n`,
        );
      }

      validRows.push({
        triggeredBy: typeof payload.triggeredBy === 'string' ? payload.triggeredBy : 'unknown',
        profileSource,
        inserted: typeof payload.result?.inserted === 'number' ? payload.result.inserted : 0,
        skipped: typeof payload.result?.skipped === 'number' ? payload.result.skipped : 0,
        errored: typeof payload.result?.errored === 'number' ? payload.result.errored : 0,
        totalHints: typeof payload.result?.totalHints === 'number' ? payload.result.totalHints : 0,
        occurredAt: row.created_at,
      });
    } catch {
      process.stderr.write(
        `[runtime-cli] prescriber_run: skipping malformed payload row (created_at=${row.created_at})\n`,
      );
    }
  }
  return validRows;
}

/** Compute whole days between two dates (floor). */
function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function loadMetrics(options: LoadMetricsOptions): SkillMetrics {
  const { skillId, dbPath, prescriberRunsLimit = 10 } = options;
  const now = options.now ?? new Date();

  const db = getDb(dbPath);

  const repoKey = resolveActiveRepoKey(db, options.repoKey);

  const loaded = loadExecutionProfile(db, skillId, { fallbackPolicy: 'full-chain' });

  if (!loaded) {
    const runs = queryPrescriberRuns(db, skillId, prescriberRunsLimit);
    return {
      skillId,
      repoKey,
      queriedAt: now.toISOString(),
      profile: { found: false },
      staleness: null,
      confidence: null,
      autoApplyEligible: null,
      recentPrescriberRuns: runs,
    };
  }

  const { profile, source } = loaded;

  const updatedAt = profile.updatedAt;
  const daysSinceUpdate = Math.max(0, daysBetween(new Date(updatedAt), now));

  const currentSessionCount = getSessionsSinceInstall(db);
  const sessionsSinceUpdate = Math.max(0, currentSessionCount - profile.sessionCount);

  const staleness: SkillMetricsStaleness = {
    stale: profile.staleness?.stale ?? false,
    reason: profile.staleness?.reason ?? null,
    sessionsSinceUpdate,
  };

  // Raw confidence is always 1.0 for DB profiles (annotateProfileStaleness starts from 1).
  const rawConfidence = 1.0;
  const attenuatedConfidence = profile.confidence ?? 1.0;
  const isAttenuated = staleness.stale;

  const confidence: SkillMetricsConfidence = {
    raw: rawConfidence,
    attenuated: attenuatedConfidence,
    isAttenuated,
  };

  const autoApplyEligible = attenuatedConfidence >= ATTENUATION_FLOOR;

  const runs = queryPrescriberRuns(db, skillId, prescriberRunsLimit);

  return {
    skillId,
    repoKey,
    queriedAt: now.toISOString(),
    profile: {
      found: true,
      tier: source,
      sessionCount: profile.sessionCount,
      updatedAt,
      daysSinceUpdate,
    },
    staleness,
    confidence,
    autoApplyEligible,
    recentPrescriberRuns: runs,
  };
}
