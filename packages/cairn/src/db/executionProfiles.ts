import { getDb } from './index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileGranularity = 'per-skill' | 'per-user' | 'per-model' | 'global';
export type DriftTrend = 'improving' | 'stable' | 'degrading';

export interface ExecutionProfileUpsert {
  skillId: string;
  granularity: ProfileGranularity;
  granularityKey?: string;
  sessionCount: number;
  drift: {
    mean: number;
    p50: number;
    p95: number;
    trend: DriftTrend;
  };
  token: {
    meanInput: number;
    meanOutput: number;
    meanCacheHit: number;
    totalCost: number;
  };
  outcome: {
    successRate: number;
    meanConvergence: number;
    toolErrorRate: number;
  };
}

export interface ExecutionProfileRow {
  id: number;
  skillId: string;
  granularity: ProfileGranularity;
  granularityKey: string;
  sessionCount: number;
  drift: {
    mean: number;
    p50: number;
    p95: number;
    trend: DriftTrend;
  };
  token: {
    meanInput: number;
    meanOutput: number;
    meanCacheHit: number;
    totalCost: number;
  };
  outcome: {
    successRate: number;
    meanConvergence: number;
    toolErrorRate: number;
  };
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): ExecutionProfileRow {
  return {
    id: row.id as number,
    skillId: row.skill_id as string,
    granularity: row.granularity as ProfileGranularity,
    granularityKey: row.granularity_key as string,
    sessionCount: row.session_count as number,
    drift: {
      mean: row.drift_mean as number,
      p50: row.drift_p50 as number,
      p95: row.drift_p95 as number,
      trend: row.drift_trend as DriftTrend,
    },
    token: {
      meanInput: row.token_mean_input as number,
      meanOutput: row.token_mean_output as number,
      meanCacheHit: row.token_mean_cache_hit as number,
      totalCost: row.token_total_cost as number,
    },
    outcome: {
      successRate: row.outcome_success_rate as number,
      meanConvergence: row.outcome_mean_convergence as number,
      toolErrorRate: row.outcome_tool_error_rate as number,
    },
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Upsert a profile keyed by (skill_id, granularity, granularity_key).
 * Returns the row id of the inserted/updated row.
 */
export function upsertExecutionProfile(profile: ExecutionProfileUpsert): number {
  const db = getDb();
  const granularityKey = profile.granularityKey ?? 'global';

  const sql = `
    INSERT INTO execution_profiles
      (skill_id, granularity, granularity_key, session_count,
       drift_mean, drift_p50, drift_p95, drift_trend,
       token_mean_input, token_mean_output, token_mean_cache_hit, token_total_cost,
       outcome_success_rate, outcome_mean_convergence, outcome_tool_error_rate,
       updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(skill_id, granularity, granularity_key) DO UPDATE SET
      session_count = excluded.session_count,
      drift_mean = excluded.drift_mean,
      drift_p50 = excluded.drift_p50,
      drift_p95 = excluded.drift_p95,
      drift_trend = excluded.drift_trend,
      token_mean_input = excluded.token_mean_input,
      token_mean_output = excluded.token_mean_output,
      token_mean_cache_hit = excluded.token_mean_cache_hit,
      token_total_cost = excluded.token_total_cost,
      outcome_success_rate = excluded.outcome_success_rate,
      outcome_mean_convergence = excluded.outcome_mean_convergence,
      outcome_tool_error_rate = excluded.outcome_tool_error_rate,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `;

  db.prepare(sql).run(
    profile.skillId,
    profile.granularity,
    granularityKey,
    profile.sessionCount,
    profile.drift.mean,
    profile.drift.p50,
    profile.drift.p95,
    profile.drift.trend,
    profile.token.meanInput,
    profile.token.meanOutput,
    profile.token.meanCacheHit,
    profile.token.totalCost,
    profile.outcome.successRate,
    profile.outcome.meanConvergence,
    profile.outcome.toolErrorRate,
  );

  const row = db.prepare(
    `SELECT id FROM execution_profiles
       WHERE skill_id = ? AND granularity = ? AND granularity_key = ?`
  ).get(profile.skillId, profile.granularity, granularityKey) as { id: number } | undefined;

  return row?.id ?? 0;
}

/** Get a single profile by composite key. Returns null if none. */
export function getExecutionProfile(
  skillId: string,
  granularity: ProfileGranularity,
  granularityKey: string = 'global',
): ExecutionProfileRow | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM execution_profiles
       WHERE skill_id = ? AND granularity = ? AND granularity_key = ?`
  ).get(skillId, granularity, granularityKey) as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

/** List all profiles for a skill (across granularities). */
export function listExecutionProfilesForSkill(skillId: string): ExecutionProfileRow[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM execution_profiles
       WHERE skill_id = ?
       ORDER BY granularity, granularity_key`
  ).all(skillId) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** List all execution profiles (most recently updated first). */
export function listExecutionProfiles(limit?: number): ExecutionProfileRow[] {
  const db = getDb();
  const sql = limit
    ? 'SELECT * FROM execution_profiles ORDER BY updated_at DESC LIMIT ?'
    : 'SELECT * FROM execution_profiles ORDER BY updated_at DESC';
  const rows = (limit
    ? db.prepare(sql).all(limit)
    : db.prepare(sql).all()
  ) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** Delete a profile by composite key. Returns true if a row was deleted. */
export function deleteExecutionProfile(
  skillId: string,
  granularity: ProfileGranularity,
  granularityKey: string = 'global',
): boolean {
  const db = getDb();
  const res = db.prepare(
    `DELETE FROM execution_profiles
       WHERE skill_id = ? AND granularity = ? AND granularity_key = ?`
  ).run(skillId, granularity, granularityKey);
  return res.changes > 0;
}
