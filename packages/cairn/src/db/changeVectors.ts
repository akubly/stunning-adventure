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
import type { ChangeVectorSummary, OptimizationCategory } from '@akubly/types';

export type { ChangeVectorSummary } from '@akubly/types';

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
 *   tokenPressure: 0.15  → delta_cost       (cost ↔ token pressure)
 *   contextBloat:  0.15  → delta_cache_hit  (cache efficiency ↔ context utilization)
 */
export const CHANGE_VECTOR_WEIGHTS = Object.freeze({
  deltaDrift: 0.25,
  deltaCost: 0.15,
  deltaSuccessRate: 0.15,
  deltaConvergence: 0.30,
  deltaCacheHit: 0.15,
});

/**
 * Minimum sessions observed before a change vector is considered reliable.
 * Matches ChangeVectorConfig.minSessionsObserved and the prompt optimizer's
 * canary threshold. Mirrored in forge — Alexander mirrors or imports from cairn.
 */
export const DEFAULT_MIN_SESSIONS = 3;

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

const OPTIMIZATION_CATEGORIES: readonly OptimizationCategory[] = [
  'prompt-structure',
  'tool-guidance',
  'context-management',
  'cache-optimization',
  'model-selection',
  'convergence',
];

function isOptimizationCategory(category: string): category is OptimizationCategory {
  return OPTIMIZATION_CATEGORIES.includes(category as OptimizationCategory);
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
 * Named intermediates make each term's polarity self-documenting.
 */
export function computeNetImpact(deltas: ChangeVectorDeltas): number {
  const { deltaDrift, deltaCost, deltaSuccessRate, deltaConvergence, deltaCacheHit } = deltas;
  const driftContrib = -deltaDrift * CHANGE_VECTOR_WEIGHTS.deltaDrift;
  const costContrib = -deltaCost * CHANGE_VECTOR_WEIGHTS.deltaCost;
  const successContrib = deltaSuccessRate * CHANGE_VECTOR_WEIGHTS.deltaSuccessRate;
  const convergenceContrib = -deltaConvergence * CHANGE_VECTOR_WEIGHTS.deltaConvergence;
  const cacheContrib = deltaCacheHit * CHANGE_VECTOR_WEIGHTS.deltaCacheHit;
  return driftContrib + costContrib + successContrib + convergenceContrib + cacheContrib;
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
 *
 * @throws On duplicate `hint_id` — the `change_vectors.hint_id` column has a
 *   UNIQUE constraint (added migration 012). This function uses a plain INSERT,
 *   not INSERT OR IGNORE. Callers in retry or idempotent contexts should use
 *   `sweepChangeVectors()` instead, which uses INSERT OR IGNORE semantics and
 *   tracks already-computed hints via `ChangeVectorSweepResult.alreadyComputed`.
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
 * Return distinct optimization hint categories for a skill, sorted alphabetically.
 *
 * The DB stores categories as free-form text, but the shared contract now uses the
 * canonical OptimizationCategory union. Narrow once at this read boundary so the
 * rest of Cairn can work with the stronger type safely.
 */
export function getAllCategories(db: Database.Database, skillId: string): OptimizationCategory[] {
  const rows = db.prepare(
    `SELECT DISTINCT category
       FROM optimization_hints
      WHERE skill_id = ?
      ORDER BY category`
  ).all(skillId) as Array<{ category: string }>;

  return rows.map((row) => row.category).filter(isOptimizationCategory);
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
 * When vectorCount > 0 but < minVectors (sparse evidence), the formula is
 * clamped to Math.max(1.0, …) so sparse vectors never attenuate confidence
 * below the neutral baseline. Amplification (>1.0) only occurs once
 * vectorCount ≥ minVectors — consistent with Wave 1 "positive boost only" policy.
 *
 * @param minVectors - Minimum vectors for full confidence boost (default 3, matches
 *   ChangeVectorConfig.minSessionsObserved and prompt optimizer canary threshold).
 */
export function summarizeChangeVectors(
  db: Database.Database,
  category: OptimizationCategory,
  skillId: string,
  minVectors: number = DEFAULT_MIN_SESSIONS,
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
      : (() => {
          // Guard against minVectors=0: log(1+0)/log(1+0) = 0/0 = NaN.
          const safeMin = Math.max(1, minVectors);
          return Math.max(1.0, Math.log(1 + vectorCount) / Math.log(1 + safeMin));
        })();

  return { category, skillId, meanNetImpact, vectorCount, confidenceBoost };
}
