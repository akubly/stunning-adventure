/**
 * buildProfiles — pure-function seam for the Telemetry → Execution Profile pipeline (Slice 2).
 *
 * Reads signal_samples grouped by skill_id, aggregates per-skill and global
 * profiles, and upserts the results via injected dependencies.
 *
 * ## Granularity tiers built (v1)
 * - `per-skill` / `'global'` — one profile per distinct non-null skill_id
 * - `global`   / `'global'` — one profile aggregating ALL samples (including null-skill)
 *
 * ## Dependency injection (London-school seam)
 * The function accepts an optional `options` bag with three injectable deps:
 *   - `reader`     — reads signal_samples rows; defaults to `querySignalSamples(db, {})`
 *   - `persister`  — upserts a profile row; defaults to `upsertExecutionProfile(db, ...)`
 *   - `aggregator` — pure aggregation fn; defaults to `aggregateSignals` from @akubly/types
 *
 * In tests, pass mocks for all three to exercise the seam contract without a
 * real database. In production, omit them — the defaults bind to the supplied `db`.
 */

import type Database from 'better-sqlite3';
import { aggregateSignals } from '@akubly/types';
import type { SignalSample, ExecutionProfile, AggregationResult, ProfileGranularity } from '@akubly/types';
import { querySignalSamples } from '../db/signalSamples.js';
import type { SignalSampleRow } from '../db/signalSamples.js';
import { upsertExecutionProfile } from '../db/executionProfiles.js';
import type { ExecutionProfileUpsert } from '../db/executionProfiles.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Injected dependencies for buildProfiles (all optional — production uses defaults). */
export interface BuildOptions {
  /**
   * Reader for signal_samples rows. Receives no filter — reads all rows.
   * Default: `querySignalSamples(db, {})`.
   */
  reader?: () => SignalSampleRow[];
  /**
   * Persister for an execution profile upsert.
   * Default: `upsertExecutionProfile(db, profile)`.
   */
  persister?: (profile: ExecutionProfileUpsert) => number;
  /**
   * Signal aggregator. Must have the same contract as `aggregateSignals` from
   * @akubly/types.
   * Default: `aggregateSignals` from @akubly/types.
   */
  aggregator?: (
    existing: ExecutionProfile | null,
    samples: SignalSample[],
    granularity: ProfileGranularity,
    granularityKey: string,
  ) => AggregationResult;
}

/**
 * Summary of what buildProfiles produced.
 *
 * - `profilesBuilt`   — total profiles upserted (per-skill + global)
 * - `skillIds`        — distinct skill_id values for which profiles were built,
 *                       plus `'global'` for the global tier
 * - `samplesConsumed` — total signal_samples rows read from the DB
 * - `durationMs`      — wall-clock time (ms) the build took; observable by
 *                       the curate() budget monitor to detect trend growth
 */
export interface BuildResult {
  profilesBuilt: number;
  skillIds: string[];
  samplesConsumed: number;
  /** Wall-clock duration (ms) of the buildProfiles call. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a cairn SignalSampleRow (DB shape) to a SignalSample (aggregator input). */
function rowToSignalSample(row: SignalSampleRow): SignalSample {
  return {
    kind: row.kind,
    sessionId: row.sessionId,
    // null → undefined: SignalSample.skillId is optional, not nullable
    skillId: row.skillId ?? undefined,
    value: row.value,
    metadata: row.metadata,
    collectedAt: row.collectedAt,
    // id/createdAt intentionally not mapped to the aggregator input
  };
}

/**
 * Map an aggregated ExecutionProfile to the cairn DB upsert shape.
 *
 * The aggregator returns @akubly/types.ExecutionProfile which uses camelCase
 * multi-word field names (tokens.meanInputTokens, outcomes.meanConvergenceTurns).
 * The cairn ExecutionProfileUpsert uses shorter aliases (token.meanInput,
 * outcome.meanConvergence). This function bridges the two.
 */
function profileToUpsert(profile: ExecutionProfile, skillIdOverride: string): ExecutionProfileUpsert {
  return {
    skillId: skillIdOverride,
    granularity: profile.granularity,
    granularityKey: profile.granularityKey,
    sessionCount: profile.sessionCount,
    drift: {
      mean: profile.drift.mean,
      p50: profile.drift.p50,
      p95: profile.drift.p95,
      trend: profile.drift.trend,
    },
    token: {
      meanInput: profile.tokens.meanInputTokens,
      meanOutput: profile.tokens.meanOutputTokens,
      meanCacheHit: profile.tokens.meanCacheHitRate,
      totalCost: profile.tokens.totalCostNanoAiu,
    },
    outcome: {
      successRate: profile.outcomes.successRate,
      meanConvergence: profile.outcomes.meanConvergenceTurns,
      toolErrorRate: profile.outcomes.toolErrorRate,
    },
    // signals not persisted in v1 schema
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build v1 execution profiles from all signal_samples in the database.
 *
 * Reads all rows, groups by skill_id, aggregates per-skill and global profiles,
 * and upserts results. The caller injects `db` for production use; tests inject
 * mock reader/persister/aggregator via `options`.
 *
 * @param db      - SQLite database (used only if reader/persister defaults are
 *                  in effect; ignored when both are injected).
 * @param options - Optional dependency overrides for testing.
 */
export function buildProfiles(db: Database.Database, options?: BuildOptions): BuildResult {
  const reader = options?.reader ?? (() => querySignalSamples(db, {}));
  const persister = options?.persister ?? ((p: ExecutionProfileUpsert) => upsertExecutionProfile(db, p));
  const agg = options?.aggregator ?? aggregateSignals;

  const startMs = Date.now();
  const rows = reader();

  if (rows.length === 0) {
    return { profilesBuilt: 0, skillIds: [], samplesConsumed: 0, durationMs: Date.now() - startMs };
  }

  // Sort all samples chronologically (oldest-first, id tiebreak) so that
  // aggregateSignals sees them in the order it expects when deriving drift.trend
  // (compares first vs last element). The default reader returns newest-first
  // (ORDER BY collected_at DESC, id DESC), so we must re-sort here.
  const sortedRows = [...rows].sort((a, b) => {
    const tDiff = a.collectedAt.localeCompare(b.collectedAt);
    if (tDiff !== 0) return tDiff;
    return a.id - b.id;
  });
  const allSamples = sortedRows.map(rowToSignalSample);

  // Group by non-null skill_id for per-skill profiles
  const bySkill = new Map<string, SignalSample[]>();
  for (const s of allSamples) {
    if (s.skillId != null) {
      const existing = bySkill.get(s.skillId) ?? [];
      existing.push(s);
      bySkill.set(s.skillId, existing);
    }
  }

  let profilesBuilt = 0;
  const builtSkillIds: string[] = [];

  // Build one per-skill/global profile per distinct non-null skill_id
  for (const [skillId, samples] of bySkill) {
    const { profile } = agg(null, samples, 'per-skill', 'global');
    persister(profileToUpsert(profile, skillId));
    profilesBuilt++;
    builtSkillIds.push(skillId);
  }

  // Build the global/global fallback aggregating ALL samples
  const { profile: globalProfile } = agg(null, allSamples, 'global', 'global');
  persister(profileToUpsert(globalProfile, 'global'));
  profilesBuilt++;
  builtSkillIds.push('global');

  return {
    profilesBuilt,
    skillIds: builtSkillIds,
    samplesConsumed: rows.length,
    durationMs: Date.now() - startMs,
  };
}
