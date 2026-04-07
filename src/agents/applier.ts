/**
 * Apply Engine — Makes prescriptions actionable by writing sidecar files,
 * supporting rollback, and detecting drift.
 *
 * Sidecar files are wholly owned by the Prescriber. They use an additive
 * `.instructions.md` format that the Copilot CLI merges automatically.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getPrescription, updatePrescriptionStatus } from '../db/prescriptions.js';
import {
  trackManagedArtifact,
  getManagedArtifact,
  listManagedArtifacts,
  removeManagedArtifact,
} from '../db/managedArtifacts.js';
import { getPreference } from '../db/preferences.js';
import { logEvent } from '../db/events.js';
import type { ArtifactScope } from '../types/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SIDECAR_PREFIX = 'cairn-prescribed';
const MANAGED_HEADER = '<!-- Managed by Cairn Prescriber. Do not edit manually. -->';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ApplyResult {
  success: boolean;
  path?: string;
  checksum?: string;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  restored?: boolean;
  error?: string;
}

export interface DriftResult {
  drifted: boolean;
  expected: string;
  actual: string;
}

// ---------------------------------------------------------------------------
// Options (injectable for testing)
// ---------------------------------------------------------------------------

export interface ApplyOptions {
  homedir?: string;
  projectRoot?: string;
  sessionId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Validate sidecar prefix to prevent path traversal. */
function isValidPrefix(prefix: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(prefix);
}

function resolveSidecarPath(
  scope: ArtifactScope | undefined,
  prefix: string,
  opts: ApplyOptions,
): string | undefined {
  const filename = `${prefix}.instructions.md`;
  if (scope === 'user') {
    const home = opts.homedir ?? process.env.HOME ?? process.env.USERPROFILE ?? '';
    if (!home) return undefined;
    return path.join(home, '.copilot', filename);
  }
  if (scope === 'project') {
    const root = opts.projectRoot ?? process.cwd();
    return path.join(root, '.github', filename);
  }
  return undefined;
}

function formatSection(prescriptionId: number, title: string, content: string): string {
  const date = new Date().toISOString().split('T')[0];
  return [
    `<!-- Prescription #${prescriptionId} — Generated ${date} -->`,
    '',
    `## ${title}`,
    '',
    content,
    '',
    '---',
  ].join('\n');
}

function buildSidecarContent(
  existingContent: string | null,
  prescriptionId: number,
  title: string,
  proposedChange: string,
): string {
  const section = formatSection(prescriptionId, title, proposedChange);

  if (existingContent && existingContent.startsWith(MANAGED_HEADER)) {
    // Append new section to existing sidecar
    return existingContent.trimEnd() + '\n\n' + section + '\n';
  }

  // New sidecar file
  return MANAGED_HEADER + '\n\n' + section + '\n';
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Apply a prescription by writing (or appending to) a sidecar file.
 *
 * The prescription must be in 'accepted' status. On success the status moves
 * to 'applied' and the file is tracked in managed_artifacts for rollback and
 * drift detection.
 */
export function applyPrescription(
  prescriptionId: number,
  opts: ApplyOptions = {},
): ApplyResult {
  // 1. Load prescription
  const prescription = getPrescription(prescriptionId);
  if (!prescription) {
    return { success: false, error: `Prescription ${prescriptionId} not found` };
  }

  // 2. Validate status
  if (prescription.status !== 'accepted') {
    return {
      success: false,
      error: `Prescription ${prescriptionId} is '${prescription.status}', expected 'accepted'`,
    };
  }

  // 3. Resolve sidecar path
  const prefix = getPreference('prescriber.sidecar_prefix') ?? DEFAULT_SIDECAR_PREFIX;
  if (!isValidPrefix(prefix)) {
    return { success: false, error: `Invalid sidecar prefix '${prefix}' — must be alphanumeric with dashes/underscores` };
  }
  const targetPath = resolveSidecarPath(prescription.artifactScope, prefix, opts);
  if (!targetPath) {
    return { success: false, error: 'Cannot resolve target path for scope' };
  }

  // 4. Check for drift if file is already tracked
  const existingArtifact = getManagedArtifact(targetPath);
  if (existingArtifact) {
    if (!fs.existsSync(targetPath)) {
      // Tracked file was deleted — this is drift
      return {
        success: false,
        error: `Drift detected on ${targetPath} — file was deleted but still tracked in managed artifacts`,
      };
    }
    const currentContent = fs.readFileSync(targetPath, 'utf8');
    const diskChecksum = sha256(currentContent);
    if (existingArtifact.currentChecksum && diskChecksum !== existingArtifact.currentChecksum) {
      return {
        success: false,
        error: `Drift detected on ${targetPath} — expected checksum ${existingArtifact.currentChecksum}, found ${diskChecksum}`,
      };
    }
  }

  // 5. Read existing content for rollback
  let existingContent: string | null = null;
  if (fs.existsSync(targetPath)) {
    existingContent = fs.readFileSync(targetPath, 'utf8');

    // Refuse to overwrite a non-managed file (fail closed)
    if (!existingArtifact && !existingContent.startsWith(MANAGED_HEADER)) {
      return {
        success: false,
        error: `Refusing to overwrite ${targetPath} — file exists and is not a managed sidecar`,
      };
    }
  }

  // 6. Build new content
  const newContent = buildSidecarContent(
    existingContent,
    prescriptionId,
    prescription.title,
    prescription.proposedChange,
  );

  // 7-11. Write file + DB updates wrapped in try/catch with best-effort rollback
  try {
    // 7. Write file (ensure parent dirs exist)
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, newContent, 'utf8');

    // 8. Compute checksum
    const checksum = sha256(newContent);

    // 9. Track in managed_artifacts
    // If path already tracked (appending), remove old entry first (UNIQUE constraint)
    if (existingArtifact) {
      removeManagedArtifact(targetPath);
    }

    trackManagedArtifact({
      path: targetPath,
      artifactType: 'instruction',
      scope: prescription.artifactScope ?? 'user',
      prescriptionId,
      originalChecksum: existingContent !== null ? sha256(existingContent) : undefined,
      currentChecksum: checksum,
      rollbackContent: existingContent ?? undefined,
    });

    // 10. Update prescription status
    updatePrescriptionStatus(prescriptionId, 'applied');

    // 11. Log event
    if (opts.sessionId) {
      logEvent(opts.sessionId, 'prescription_applied', {
        prescriptionId,
        path: targetPath,
        checksum,
      });
    }

    return { success: true, path: targetPath, checksum };
  } catch (err) {
    // Best-effort rollback of file write
    try {
      if (existingContent !== null) {
        fs.writeFileSync(targetPath, existingContent, 'utf8');
      } else if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch {
      // Rollback itself failed — nothing more we can do
    }

    return {
      success: false,
      error: `Apply failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Rollback a previously applied prescription.
 *
 * If the sidecar was new (no rollback content), the file is deleted.
 * If there was prior content, it is restored. The managed_artifact entry
 * is removed and the prescription status moves to 'failed'.
 */
export function rollbackPrescription(
  prescriptionId: number,
  opts: ApplyOptions = {},
): RollbackResult {
  // 1. Find managed artifact for this prescription
  const artifacts = listManagedArtifacts(prescriptionId);
  if (artifacts.length === 0) {
    return { success: false, error: `No managed artifact found for prescription ${prescriptionId}` };
  }

  const artifact = artifacts[0];

  // 2/3. Restore or delete
  if (artifact.rollbackContent !== undefined) {
    // Had prior content — restore it
    fs.mkdirSync(path.dirname(artifact.path), { recursive: true });
    fs.writeFileSync(artifact.path, artifact.rollbackContent, 'utf8');
  } else {
    // New file — delete it
    if (fs.existsSync(artifact.path)) {
      fs.unlinkSync(artifact.path);
    }
  }

  // 4. Remove from managed_artifacts
  removeManagedArtifact(artifact.path);

  // 5. Update prescription status
  updatePrescriptionStatus(prescriptionId, 'failed');

  // 6. Log event
  if (opts.sessionId) {
    logEvent(opts.sessionId, 'prescription_rolled_back', {
      prescriptionId,
      path: artifact.path,
      restored: artifact.rollbackContent !== undefined,
    });
  }

  return { success: true, restored: artifact.rollbackContent !== undefined };
}

/**
 * Check whether a managed sidecar file has drifted from its expected content.
 *
 * Reads the actual file on disk and compares its SHA-256 checksum against
 * the stored `current_checksum` in managed_artifacts.
 */
export function checkDrift(filePath: string): DriftResult | undefined {
  // Get tracked artifact
  const artifact = getManagedArtifact(filePath);
  if (!artifact) return undefined;

  const expected = artifact.currentChecksum ?? '';

  // Read actual file
  if (!fs.existsSync(filePath)) {
    return { drifted: true, expected, actual: '' };
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const actual = sha256(content);

  return {
    drifted: expected !== actual,
    expected,
    actual,
  };
}
