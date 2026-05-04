/**
 * CRUD module for the `change_vectors` table (Phase 4.6).
 *
 * Change vectors record the metric delta between before/after an optimization hint
 * is applied. They are computed by the Curator sweep and consumed by prescribers
 * to rank future recommendations and scale confidence.
 *
 * Weight constants: ADR-P4.6-003 requires the same weights as the drift score
 * (single source of truth). Cairn cannot import from Forge (acyclic dep graph
 * constraint), so the constants are mirrored here. Laura's L5 regression test
 * guards against drift. Decision recorded in:
 *   .squad/decisions/inbox/alexander-phase4.6-weight-constants.md
 */

import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Weight constants (mirror of DRIFT_WEIGHTS in packages/forge/src/telemetry/drift.ts)
// ---------------------------------------------------------------------------

/**
 * Net-impact weights for each change-vector delta field.
 * Positive net_impact = prescription improved things.
 *
 * Sign semantics:
 *   - delta_drift, delta_cost, delta_convergence: lower-is-better metrics,
 *     so we negate the delta before weighting (positive weight × negative delta
 *     would produce negative contribution — we flip so improvement = positive).
 *   - delta_success_rate, delta_cache_hit: higher-is-better, no negation needed.
 *
 * Weight values match DRIFT_WEIGHTS in forge/src/telemetry/drift.ts exactly:
 *   convergence:   0.30  → delta_convergence
 *   toolEntropy:   0.25  → delta_drift      (drift subsumes entropy, ADR-P4.6-003)
 *   promptStability: 0.15 → delta_success_rate
 *   tokenPressure: 0.15  → delta_cache_hit  (cache efficiency ↔ token pressure)
 *   contextBloat:  0.15  → delta_cost       (cost ↔ context utilization)
 */
export const CHANGE_VECTOR_WEIGHTS = Object.freeze({
  deltaDrift: 0.25,
  deltaCost: 0.15,
  deltaSuccessRate: 0.15,
  deltaConvergence: 0.30,
  deltaCacheHit: 0.15,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChangeVectorDeltas {
  deltaDrift: number;
  deltaCost: number;
  deltaSuccessRate: number;
  deltaConvergence: number;
  deltaCacheHit: number;
}

export interface ChangeVectorInsert {
  hintId: string;
  deltas: ChangeVectorDeltas;
  sessionsObserved: number;
  computedAt: string;
}

export interface ChangeVectorRow {
  id: number;
  hintId: string;
  deltaDrift: number;
  deltaCost: number;
  deltaSuccessRate: number;
  deltaConvergence: number;
  deltaCacheHit: number;
  netImpact: number;
  sessionsObserved: number;
  computedAt: string;
}

/**
 * Aggregated summary for a category+skillId pair.
 * Shape matches `ChangeVectorSummary` in forge's prescribers/types.ts (Rosella R1).
 * Verified by Laura's L5 regression test.
 */
export interface ChangeVectorSummary {
  category: string;
  skillId: string;
  meanNetImpact: number;
  vectorCount: number;
  /** Log-scaled confidence boost: log(1 + vectorCount) / log(1 + minVectors). */
  confidenceBoost: number;
}

// ---------------------------------------------------------------------------
// Net impact computation
// ---------------------------------------------------------------------------

/**
 * Compute net_impact from metric deltas.
 *
 * Convention: positive net_impact = prescription was beneficial.
 * Lower-is-better metrics (drift, cost, convergence) are negated so that
 * a reduction (negative delta) contributes positively to net_impact.
 */
export function computeNetImpact(deltas: ChangeVectorDeltas): number {
  const { deltaDrift, deltaCost, deltaSuccessRate, deltaConvergence, deltaCacheHit } = deltas;
  return (
    -deltaDrift * CHANGE_VECTOR_WEIGHTS.deltaDrift +
    -deltaCost * CHANGE_VECTOR_WEIGHTS.deltaCost +
    deltaSuccessRate * CHANGE_VECTOR_WEIGHTS.deltaSuccessRate +
    -deltaConvergence * CHANGE_VECTOR_WEIGHTS.deltaConvergence +
    deltaCacheHit * CHANGE_VECTOR_WEIGHTS.deltaCacheHit
  );
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): ChangeVectorRow {
  return {
    id: row.id as number,
    hintId: row.hint_id as string,
    deltaDrift: row.delta_drift as number,
    deltaCost: row.delta_cost as number,
    deltaSuccessRate: row.delta_success_rate as number,
    deltaConvergence: row.delta_convergence as number,
    deltaCacheHit: row.delta_cache_hit as number,
    netImpact: row.net_impact as number,
    sessionsObserved: row.sessions_observed as number,
    computedAt: row.computed_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a new change vector. Computes net_impact from deltas.
 * Returns the id of the inserted row.
 */
export function insertChangeVector(db: Database.Database, vector: ChangeVectorInsert): number {
  const netImpact = computeNetImpact(vector.deltas);
  const result = db.prepare(
    `INSERT INTO change_vectors
       (hint_id, delta_drift, delta_cost, delta_success_rate,
        delta_convergence, delta_cache_hit, net_impact,
        sessions_observed, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    vector.hintId,
    vector.deltas.deltaDrift,
    vector.deltas.deltaCost,
    vector.deltas.deltaSuccessRate,
    vector.deltas.deltaConvergence,
    vector.deltas.deltaCacheHit,
    netImpact,
    vector.sessionsObserved,
    vector.computedAt,
  );
  return result.lastInsertRowid as number;
}

/** Get all change vectors for a specific hint. */
export function getChangeVectorsByHintId(
  db: Database.Database,
  hintId: string,
): ChangeVectorRow[] {
  const rows = db.prepare(
    `SELECT * FROM change_vectors WHERE hint_id = ? ORDER BY computed_at DESC`
  ).all(hintId) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/**
 * Get all change vectors for hints matching a given category and skillId.
 * Requires a JOIN with optimization_hints to filter by category/skill.
 */
export function getChangeVectorsByCategoryAndSkill(
  db: Database.Database,
  category: string,
  skillId: string,
): ChangeVectorRow[] {
  const rows = db.prepare(
    `SELECT cv.*
       FROM change_vectors cv
       JOIN optimization_hints oh ON cv.hint_id = oh.id
      WHERE oh.category = ? AND oh.skill_id = ?
      ORDER BY cv.computed_at DESC`
  ).all(category, skillId) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/**
 * Summarize change vectors for a category+skillId pair.
 * Returns a ChangeVectorSummary with mean net_impact, vector count,
 * and log-scaled confidence boost.
 *
 * When vectorCount === 0, returns confidenceBoost: 1.0 (no boost, no penalty —
 * baseline confidence is preserved). This matches computeConfidenceBoost(0) and
 * ensures empty summaries do not zero out hint confidence.
 *
 * @param minVectors - Minimum vectors for full confidence (default 3, matches
 *   ChangeVectorConfig.minSessionsObserved and prompt optimizer canary threshold).
 */
export function summarizeChangeVectors(
  db: Database.Database,
  category: string,
  skillId: string,
  minVectors: number = 3,
): ChangeVectorSummary {
  const row = db.prepare(
    `SELECT
       COUNT(*) as vector_count,
       AVG(cv.net_impact) as mean_net_impact
       FROM change_vectors cv
       JOIN optimization_hints oh ON cv.hint_id = oh.id
      WHERE oh.category = ? AND oh.skill_id = ?`
  ).get(category, skillId) as { vector_count: number; mean_net_impact: number | null } | undefined;

  const vectorCount = row?.vector_count ?? 0;
  const meanNetImpact = row?.mean_net_impact ?? 0;
  const confidenceBoost =
    vectorCount === 0
      ? 1.0
      : Math.log(1 + vectorCount) / Math.log(1 + minVectors);

  return { category, skillId, meanNetImpact, vectorCount, confidenceBoost };
}
