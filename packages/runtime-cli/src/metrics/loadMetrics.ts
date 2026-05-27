import type Database from 'better-sqlite3';
import {
  getDb,
  getMostRecentUserSession,
  getActiveUserSession,
  getSessionsSinceInstall,
} from '@akubly/cairn';
import { loadExecutionProfile } from '@akubly/skillsmith-runtime';
import type {
  SkillMetrics,
  SkillMetricsPrescriberRun,
  SkillMetricsStaleness,
  SkillMetricsConfidence,
} from './types.js';

/** Mirrors ATTENUATION_FLOOR from @akubly/types — minimum confidence for auto-apply eligibility. */
const ATTENUATION_FLOOR = 0.1;

export interface LoadMetricsOptions {
  skillId: string;
  repoKey?: string;
  dbPath?: string;
  prescriberRunsLimit?: number;
  now?: Date;
}

/** Resolve the repo key: use the provided value, fall back to most-recent user session. */
function resolveRepoKey(db: Database.Database, repoKey?: string): string | null {
  if (repoKey) {
    return repoKey;
  }
  const session = getMostRecentUserSession(db);
  return session?.repoKey ?? null;
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
  try {
    const rows = db
      .prepare(
        `SELECT payload, created_at
         FROM event_log
         WHERE event_type = 'prescriber_run'
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

    return rows.map((row) => {
      const payload = JSON.parse(row.payload) as {
        triggeredBy?: string;
        profileSource?: string | null;
        result?: {
          inserted?: number;
          skipped?: number;
          errored?: number;
          totalHints?: number;
        };
      };

      return {
        triggeredBy: payload.triggeredBy ?? 'unknown',
        profileSource: payload.profileSource ?? null,
        inserted: payload.result?.inserted ?? 0,
        skipped: payload.result?.skipped ?? 0,
        errored: payload.result?.errored ?? 0,
        totalHints: payload.result?.totalHints ?? 0,
        occurredAt: row.created_at,
      };
    });
  } catch {
    // Defensive: if anything goes wrong reading events, degrade gracefully.
    return null;
  }
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
  const daysSinceUpdate = daysBetween(new Date(updatedAt), now);

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
