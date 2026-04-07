import { getDb } from './index.js';
import type { ManagedArtifact, ArtifactType, ArtifactScope } from '../types/index.js';

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): ManagedArtifact {
  return {
    id: row.id as number,
    path: row.path as string,
    artifactType: row.artifact_type as ArtifactType,
    logicalId: (row.logical_id as string | null) ?? undefined,
    scope: row.scope as ArtifactScope,
    prescriptionId: row.prescription_id as number,
    originalChecksum: (row.original_checksum as string | null) ?? undefined,
    currentChecksum: (row.current_checksum as string | null) ?? undefined,
    rollbackContent: (row.rollback_content as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export interface TrackManagedArtifactFields {
  path: string;
  artifactType: ArtifactType;
  logicalId?: string;
  scope: ArtifactScope;
  prescriptionId: number;
  originalChecksum?: string;
  currentChecksum?: string;
  rollbackContent?: string;
}

/** Track a new managed artifact. Returns the new artifact id. */
export function trackManagedArtifact(fields: TrackManagedArtifactFields): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO managed_artifacts
        (path, artifact_type, logical_id, scope, prescription_id,
         original_checksum, current_checksum, rollback_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      fields.path,
      fields.artifactType,
      fields.logicalId ?? null,
      fields.scope,
      fields.prescriptionId,
      fields.originalChecksum ?? null,
      fields.currentChecksum ?? null,
      fields.rollbackContent ?? null,
    );
  return Number(result.lastInsertRowid);
}

/** Get a managed artifact by its file path. */
export function getManagedArtifact(path: string): ManagedArtifact | undefined {
  const db = getDb();
  const row = db.prepare('SELECT * FROM managed_artifacts WHERE path = ?').get(path) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRow(row) : undefined;
}

/** List managed artifacts, optionally filtered by prescription id. */
export function listManagedArtifacts(prescriptionId?: number): ManagedArtifact[] {
  const db = getDb();
  if (prescriptionId !== undefined) {
    const rows = db
      .prepare('SELECT * FROM managed_artifacts WHERE prescription_id = ? ORDER BY created_at')
      .all(prescriptionId) as Array<Record<string, unknown>>;
    return rows.map(mapRow);
  }
  const rows = db
    .prepare('SELECT * FROM managed_artifacts ORDER BY created_at')
    .all() as Array<Record<string, unknown>>;
  return rows.map(mapRow);
}

/** Update the current checksum for a managed artifact. */
export function updateArtifactChecksum(path: string, checksum: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE managed_artifacts SET
       current_checksum = ?,
       updated_at = datetime('now')
     WHERE path = ?`,
  ).run(checksum, path);
}

/** Remove a managed artifact by path. */
export function removeManagedArtifact(path: string): void {
  const db = getDb();
  db.prepare('DELETE FROM managed_artifacts WHERE path = ?').run(path);
}

/** Detect drift between original and current checksum. */
export function detectDrift(
  path: string,
): { drifted: boolean; expected: string; actual: string } | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT original_checksum, current_checksum FROM managed_artifacts WHERE path = ?')
    .get(path) as { original_checksum: string | null; current_checksum: string | null } | undefined;

  if (!row) return undefined;

  const expected = row.original_checksum ?? '';
  const actual = row.current_checksum ?? '';
  return {
    drifted: expected !== actual,
    expected,
    actual,
  };
}
