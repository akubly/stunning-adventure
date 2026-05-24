import type Database from 'better-sqlite3';
import { getDb } from './index.js';
import { logEvent } from './events.js';
import { ensureSystemSession } from './sessions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HintSource = 'prompt-optimizer' | 'token-optimizer';

export type HintStatus =
  | 'pending'
  | 'accepted'
  | 'applied'
  | 'rejected'
  | 'deferred'
  | 'expired'
  | 'suppressed'
  | 'failed';

export interface OptimizationHintInsert {
  id: string;
  source: HintSource;
  skillId: string;
  category: string;
  description: string;
  recommendation: string;
  impactScore?: number;
  confidence?: number;
  evidence?: Record<string, unknown>;
  autoApplyEligible?: boolean;
  parentPrescriptionId?: string | null;
  metricSnapshot?: Record<string, unknown>;
  status?: HintStatus;
  generatedAt: string;
  appliedAt?: string | null;
}

export interface OptimizationHintRow {
  id: string;
  source: HintSource;
  skillId: string;
  category: string;
  description: string;
  recommendation: string;
  impactScore: number;
  confidence: number;
  evidence: Record<string, unknown>;
  autoApplyEligible?: boolean;
  parentPrescriptionId: string | null;
  metricSnapshot: Record<string, unknown>;
  status: HintStatus;
  generatedAt: string;
  appliedAt: string | null;
  createdAt: string;
}

export interface OptimizationHintQuery {
  skillId?: string;
  status?: HintStatus | HintStatus[];
  source?: HintSource;
  parentPrescriptionId?: string;
  limit?: number;
}

export interface InsertHintIfNewResult {
  inserted: boolean;
  existingHintId?: string;
}

export const ACTIVE_HINT_STATUSES: readonly HintStatus[] = ['pending', 'accepted', 'deferred'];

// Allowed forward transitions from each status. The initial `pending` state
// can move to any terminal-or-intermediate state; once `applied`/`rejected`/
// `expired`/`suppressed`/`failed` the hint is terminal.
const STATUS_TRANSITIONS: Record<HintStatus, HintStatus[]> = {
  pending: ['accepted', 'rejected', 'deferred', 'expired', 'suppressed', 'failed'],
  accepted: ['applied', 'failed', 'rejected', 'expired'],
  deferred: ['pending', 'accepted', 'rejected', 'expired', 'suppressed'],
  applied: [],
  rejected: [],
  expired: [],
  suppressed: [],
  failed: [],
};

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): OptimizationHintRow {
  const evidence = JSON.parse(row.evidence as string) as Record<string, unknown>;
  const autoApplyEligible =
    typeof evidence.autoApplyEligible === 'boolean' ? evidence.autoApplyEligible : undefined;

  return {
    id: row.id as string,
    source: row.source as HintSource,
    skillId: row.skill_id as string,
    category: row.category as string,
    description: row.description as string,
    recommendation: row.recommendation as string,
    impactScore: row.impact_score as number,
    confidence: row.confidence as number,
    evidence,
    autoApplyEligible,
    parentPrescriptionId: (row.parent_prescription_id as string | null) ?? null,
    metricSnapshot: JSON.parse(row.metric_snapshot as string) as Record<string, unknown>,
    status: row.status as HintStatus,
    generatedAt: row.generated_at as string,
    appliedAt: (row.applied_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

function serializeEvidence(hint: OptimizationHintInsert): string {
  return JSON.stringify({
    ...(hint.evidence ?? {}),
    ...(hint.autoApplyEligible === undefined
      ? {}
      : { autoApplyEligible: hint.autoApplyEligible }),
  });
}

function insertOptimizationHintWithDb(db: Database.Database, hint: OptimizationHintInsert): string {
  db.prepare(
    `INSERT INTO optimization_hints
       (id, source, skill_id, category, description, recommendation,
        impact_score, confidence, evidence,
        parent_prescription_id, metric_snapshot,
        status, generated_at, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    hint.id,
    hint.source,
    hint.skillId,
    hint.category,
    hint.description,
    hint.recommendation,
    hint.impactScore ?? 0,
    hint.confidence ?? 0,
    serializeEvidence(hint),
    hint.parentPrescriptionId ?? null,
    JSON.stringify(hint.metricSnapshot ?? {}),
    hint.status ?? 'pending',
    hint.generatedAt,
    hint.appliedAt ?? null,
  );
  return hint.id;
}

function findActiveHintId(
  db: Database.Database,
  skillId: string,
  source: HintSource,
  category: string,
): string | undefined {
  const placeholders = ACTIVE_HINT_STATUSES.map(() => '?').join(', ');
  const row = db.prepare(
    `SELECT id
       FROM optimization_hints
      WHERE skill_id = ?
        AND source = ?
        AND category = ?
        AND status IN (${placeholders})
      LIMIT 1`
  ).get(skillId, source, category, ...ACTIVE_HINT_STATUSES) as { id: string } | undefined;

  return row?.id;
}

/** Insert a new optimization hint, suppressing active duplicates. Returns the inserted or existing hint id. */
export function insertOptimizationHint(hint: OptimizationHintInsert): string {
  const result = insertHintIfNew(getDb(), hint);
  return result.inserted ? hint.id : (result.existingHintId ?? hint.id);
}

/** Return true when a skill already has an active hint for the same source+category. */
export function hasActiveOptimizationHint(
  db: Database.Database,
  skillId: string,
  source: HintSource,
  category: string,
): boolean {
  return findActiveHintId(db, skillId, source, category) !== undefined;
}

/** Insert a hint only when no active hint with the same skill+source+category exists. */
export function insertHintIfNew(
  db: Database.Database,
  hint: OptimizationHintInsert,
): InsertHintIfNewResult {
  // Use BEGIN IMMEDIATE for write lock upfront, preventing concurrent inserts
  const txn = db.transaction(() => {
    const existingHintId = findActiveHintId(db, hint.skillId, hint.source, hint.category);
    if (existingHintId) {
      return {
        inserted: false,
        existingHintId,
      };
    }

    try {
      insertOptimizationHintWithDb(db, hint);
      return { inserted: true };
    } catch (err) {
      // UNIQUE constraint violation on the partial index means another transaction
      // concurrently inserted this (skill_id, source, category) into an active status.
      // Treat as duplicate.
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        const duplicateHintId = findActiveHintId(db, hint.skillId, hint.source, hint.category);
        return {
          inserted: false,
          existingHintId: duplicateHintId,
        };
      }
      throw err;
    }
  });

  const result = txn.immediate();
  
  // Emit hint_inserted event AFTER transaction commits
  if (result.inserted) {
    const sessionId = ensureSystemSession();
    logEvent(sessionId, 'hint_state_transition', {
      skill_id: hint.skillId,
      hint_id: hint.id,
      from_state: null,
      to_state: hint.status ?? 'pending',
      timestamp: new Date().toISOString(),
    });
  }
  
  return result;
}

/** Get a single hint by id. */
export function getOptimizationHint(id: string): OptimizationHintRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM optimization_hints WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRow(row) : null;
}

/** Query hints by skill, status, source, and/or parent prescription. */
export function queryOptimizationHints(
  query: OptimizationHintQuery = {},
): OptimizationHintRow[] {
  const db = getDb();
  const where: string[] = [];
  const params: unknown[] = [];

  if (query.skillId !== undefined) {
    where.push('skill_id = ?');
    params.push(query.skillId);
  }
  if (query.status !== undefined) {
    if (Array.isArray(query.status)) {
      if (query.status.length === 0) return [];
      const placeholders = query.status.map(() => '?').join(', ');
      where.push(`status IN (${placeholders})`);
      params.push(...query.status);
    } else {
      where.push('status = ?');
      params.push(query.status);
    }
  }
  if (query.source !== undefined) {
    where.push('source = ?');
    params.push(query.source);
  }
  if (query.parentPrescriptionId !== undefined) {
    where.push('parent_prescription_id = ?');
    params.push(query.parentPrescriptionId);
  }

  let sql = 'SELECT * FROM optimization_hints';
  if (where.length > 0) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY impact_score DESC, created_at DESC';
  if (query.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(query.limit);
  }

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** List all hints (most impactful, then most recent). */
export function listOptimizationHints(limit?: number): OptimizationHintRow[] {
  return queryOptimizationHints(limit !== undefined ? { limit } : {});
}

/**
 * Update a hint's status. Validates the transition is legal for the
 * prescription state machine. Returns true if the row was updated.
 *
 * When transitioning to `applied`, `applied_at` is set automatically
 * unless caller supplies an explicit value.
 */
export function updateOptimizationHintStatus(
  id: string,
  nextStatus: HintStatus,
  options: { appliedAt?: string; force?: boolean } = {},
): boolean {
  const db = getDb();
  const current = getOptimizationHint(id);
  if (!current) return false;
  if (current.status === nextStatus) return false;

  if (!options.force) {
    const allowed = STATUS_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new Error(
        `Illegal hint status transition: ${current.status} -> ${nextStatus} (id=${id})`,
      );
    }
  }

  const appliedAt =
    nextStatus === 'applied'
      ? (options.appliedAt ?? new Date().toISOString())
      : current.appliedAt;

  const res = db.prepare(
    `UPDATE optimization_hints
       SET status = ?, applied_at = ?
       WHERE id = ?`
  ).run(nextStatus, appliedAt, id);

  if (res.changes > 0) {
    // Emit hint state transition event
    const sessionId = ensureSystemSession();
    logEvent(sessionId, 'hint_state_transition', {
      skill_id: current.skillId,
      hint_id: id,
      from_state: current.status,
      to_state: nextStatus,
      timestamp: new Date().toISOString(),
    });
  }

  return res.changes > 0;
}

/** Delete a hint by id. */
export function deleteOptimizationHint(id: string): boolean {
  const db = getDb();
  const res = db.prepare('DELETE FROM optimization_hints WHERE id = ?').run(id);
  return res.changes > 0;
}
