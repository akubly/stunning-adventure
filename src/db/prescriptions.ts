import { getDb } from './index.js';
import type {
  Prescription,
  PrescriptionStatus,
  PatternType,
  ArtifactType,
  ArtifactScope,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): Prescription {
  return {
    id: row.id as number,
    insightId: row.insight_id as number,
    patternType: row.pattern_type as PatternType,
    title: row.title as string,
    rationale: row.rationale as string,
    proposedChange: row.proposed_change as string,
    targetPath: (row.target_path as string | null) ?? undefined,
    artifactType: (row.artifact_type as ArtifactType | null) ?? undefined,
    artifactScope: (row.artifact_scope as ArtifactScope | null) ?? undefined,
    status: row.status as PrescriptionStatus,
    confidence: row.confidence as number,
    priorityScore: row.priority_score as number,
    recencyWeight: row.recency_weight as number,
    availabilityFactor: row.availability_factor as number,
    dispositionReason: (row.disposition_reason as string | null) ?? undefined,
    deferCount: row.defer_count as number,
    deferUntilSession: (row.defer_until_session as number | null) ?? undefined,
    generatedAt: row.generated_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? undefined,
    appliedAt: (row.applied_at as string | null) ?? undefined,
    expiresAt: (row.expires_at as string | null) ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface CreatePrescriptionFields {
  insightId: number;
  patternType: PatternType;
  title: string;
  rationale: string;
  proposedChange: string;
  targetPath?: string;
  artifactType?: ArtifactType;
  artifactScope?: ArtifactScope;
  confidence?: number;
  priorityScore?: number;
  recencyWeight?: number;
  availabilityFactor?: number;
  expiresAt?: string;
}

/** Create a new prescription. Returns the new prescription id. */
export function createPrescription(fields: CreatePrescriptionFields): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO prescriptions
        (insight_id, pattern_type, title, rationale, proposed_change,
         target_path, artifact_type, artifact_scope,
         confidence, priority_score, recency_weight, availability_factor, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fields.insightId,
      fields.patternType,
      fields.title,
      fields.rationale,
      fields.proposedChange,
      fields.targetPath ?? null,
      fields.artifactType ?? null,
      fields.artifactScope ?? null,
      fields.confidence ?? 0.0,
      fields.priorityScore ?? 0.0,
      fields.recencyWeight ?? 1.0,
      fields.availabilityFactor ?? 1.0,
      fields.expiresAt ?? null,
    );

  // Update prescriber_state pending count
  db.prepare(
    `UPDATE prescriber_state SET
       pending_count = (SELECT COUNT(*) FROM prescriptions WHERE status = 'generated'),
       last_generated_at = datetime('now'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();

  return Number(result.lastInsertRowid);
}

/** Get a single prescription by id. */
export function getPrescription(id: number): Prescription | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRow(row) : undefined;
}

/** List prescriptions with optional filters. */
export function listPrescriptions(filters?: {
  status?: PrescriptionStatus;
  insightId?: number;
  limit?: number;
}): Prescription[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.insightId !== undefined) {
    conditions.push('insight_id = ?');
    params.push(filters.insightId);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ? 'LIMIT ?' : '';
  if (filters?.limit) params.push(filters.limit);

  const rows = db
    .prepare(`SELECT * FROM prescriptions ${where} ORDER BY priority_score DESC ${limit}`)
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map(mapRow);
}

/** Update a prescription's status and optional additional fields. */
export function updatePrescriptionStatus(
  id: number,
  status: PrescriptionStatus,
  fields?: { dispositionReason?: string; resolvedAt?: string; appliedAt?: string },
): void {
  const db = getDb();
  const sets = ['status = ?'];
  const params: unknown[] = [status];

  if (status === 'accepted' || status === 'rejected' || status === 'deferred') {
    sets.push("resolved_at = COALESCE(?, datetime('now'))");
    params.push(fields?.resolvedAt ?? null);
  }
  if (status === 'applied' || status === 'failed') {
    sets.push("applied_at = COALESCE(?, datetime('now'))");
    params.push(fields?.appliedAt ?? null);
  }
  if (fields?.dispositionReason !== undefined) {
    sets.push('disposition_reason = ?');
    params.push(fields.dispositionReason);
  }

  params.push(id);
  db.prepare(`UPDATE prescriptions SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // Sync pending_count
  db.prepare(
    `UPDATE prescriber_state SET
       pending_count = (SELECT COUNT(*) FROM prescriptions WHERE status = 'generated'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();
}

/** Get the highest-priority prescription in 'generated' status. */
export function getTopPrescription(): Prescription | undefined {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM prescriptions
       WHERE status = 'generated'
       ORDER BY priority_score DESC
       LIMIT 1`,
    )
    .get() as Record<string, unknown> | undefined;
  return row ? mapRow(row) : undefined;
}

/** Count prescriptions grouped by status. */
export function countPrescriptionsByStatus(): Record<string, number> {
  const db = getDb();
  const rows = db
    .prepare('SELECT status, COUNT(*) as count FROM prescriptions GROUP BY status')
    .all() as Array<{ status: string; count: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.status] = row.count;
  }
  return result;
}

/** Expire prescriptions in 'generated' status older than 7 days. Returns count expired. */
export function expireAbandonedPrescriptions(): number {
  const db = getDb();
  const result = db
    .prepare(
      `UPDATE prescriptions SET status = 'expired'
       WHERE status = 'generated'
         AND datetime(generated_at) < datetime('now', '-7 days')`,
    )
    .run();

  // Sync pending_count
  db.prepare(
    `UPDATE prescriber_state SET
       pending_count = (SELECT COUNT(*) FROM prescriptions WHERE status = 'generated'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();

  return result.changes;
}

// ---------------------------------------------------------------------------
// Deferral & suppression
// ---------------------------------------------------------------------------

/** Defer a prescription. Increments defer_count and optionally sets a cooldown. */
export function deferPrescription(id: number, reason?: string, sessionCount?: number): void {
  const db = getDb();
  const currentSessions = getSessionsSinceInstall();
  const deferUntil = sessionCount ? currentSessions + sessionCount : null;

  db.prepare(
    `UPDATE prescriptions SET
       status = 'deferred',
       defer_count = defer_count + 1,
       defer_until_session = ?,
       disposition_reason = COALESCE(?, disposition_reason),
       resolved_at = datetime('now')
     WHERE id = ?`,
  ).run(deferUntil, reason ?? null, id);

  // Sync pending_count
  db.prepare(
    `UPDATE prescriber_state SET
       pending_count = (SELECT COUNT(*) FROM prescriptions WHERE status = 'generated'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();
}

/** Suppress a prescription (after too many deferrals). */
export function suppressPrescription(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE prescriptions SET
       status = 'suppressed',
       resolved_at = datetime('now')
     WHERE id = ?`,
  ).run(id);

  db.prepare(
    `UPDATE prescriber_state SET
       pending_count = (SELECT COUNT(*) FROM prescriptions WHERE status = 'generated'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();
}

/** Unsuppress a prescription — move it back to 'generated'. */
export function unsuppressPrescription(id: number): void {
  const db = getDb();
  db.prepare(
    `UPDATE prescriptions SET
       status = 'generated',
       resolved_at = NULL
     WHERE id = ? AND status = 'suppressed'`,
  ).run(id);

  db.prepare(
    `UPDATE prescriber_state SET
       pending_count = (SELECT COUNT(*) FROM prescriptions WHERE status = 'generated'),
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();
}

// ---------------------------------------------------------------------------
// Session counter
// ---------------------------------------------------------------------------

/** Get the number of sessions since install. */
export function getSessionsSinceInstall(): number {
  const db = getDb();
  const row = db
    .prepare('SELECT sessions_since_install FROM prescriber_state WHERE id = 1')
    .get() as { sessions_since_install: number } | undefined;
  return row?.sessions_since_install ?? 0;
}

/** Increment the session counter by 1. */
export function incrementSessionCounter(): void {
  const db = getDb();
  db.prepare(
    `UPDATE prescriber_state SET
       sessions_since_install = sessions_since_install + 1,
       updated_at = datetime('now')
     WHERE id = 1`,
  ).run();
}
