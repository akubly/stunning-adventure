import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getDb, closeDb } from '../db/index.js';
import { createInsight } from '../db/insights.js';
import { createPrescription, getPrescription } from '../db/prescriptions.js';
import { getManagedArtifact } from '../db/managedArtifacts.js';
import { setPreference } from '../db/preferences.js';
import { applyPrescription, rollbackPrescription, checkDrift } from '../agents/applier.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let insightId: number;

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-applier-'));
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function seedPrescription(overrides: {
  artifactScope?: 'user' | 'project';
  status?: string;
  title?: string;
  proposedChange?: string;
}): number {
  const id = createPrescription({
    insightId,
    patternType: 'recurring_error',
    title: overrides.title ?? 'Test prescription',
    rationale: 'Test rationale',
    proposedChange: overrides.proposedChange ?? 'Add error handler',
    artifactType: 'instruction',
    artifactScope: overrides.artifactScope ?? 'user',
  });
  // Move to accepted unless overridden
  if (overrides.status !== 'generated') {
    const db = getDb();
    db.prepare('UPDATE prescriptions SET status = ? WHERE id = ?').run(
      overrides.status ?? 'accepted',
      id,
    );
  }
  return id;
}

function seedSession(): string {
  const db = getDb();
  const sessionId = 'test-session-001';
  db.prepare(
    "INSERT OR IGNORE INTO sessions (id, repo_key, branch, status) VALUES (?, ?, ?, ?)",
  ).run(sessionId, 'test/repo', 'main', 'active');
  return sessionId;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = makeTmpDir();
  closeDb();
  getDb(':memory:');
  insightId = createInsight('recurring_error', 'Test pattern', 'A test pattern', [1, 2], 0.8);
});

afterEach(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// applyPrescription
// ---------------------------------------------------------------------------

describe('applyPrescription', () => {
  it('should create sidecar at correct user-scope path', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });

    expect(result.success).toBe(true);
    const expected = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');
    expect(result.path).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('should create sidecar at correct project-scope path', () => {
    const id = seedPrescription({ artifactScope: 'project' });
    const result = applyPrescription(id, { projectRoot: tmpDir });

    expect(result.success).toBe(true);
    const expected = path.join(tmpDir, '.github', 'cairn-prescribed.instructions.md');
    expect(result.path).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
  });

  it('should store rollback content (undefined for new file)', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir });

    const sidecarPath = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');
    const artifact = getManagedArtifact(sidecarPath);
    expect(artifact).toBeDefined();
    // No prior content — rollbackContent should be undefined (null in DB)
    expect(artifact!.rollbackContent).toBeUndefined();
  });

  it('should compute and store SHA-256 checksum', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });

    expect(result.checksum).toBeDefined();
    const sidecarPath = result.path!;
    const content = fs.readFileSync(sidecarPath, 'utf8');
    expect(result.checksum).toBe(sha256(content));

    const artifact = getManagedArtifact(sidecarPath);
    expect(artifact!.currentChecksum).toBe(result.checksum);
  });

  it('should track in managed_artifacts table', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir });

    const sidecarPath = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');
    const artifact = getManagedArtifact(sidecarPath);
    expect(artifact).toBeDefined();
    expect(artifact!.prescriptionId).toBe(id);
    expect(artifact!.artifactType).toBe('instruction');
    expect(artifact!.scope).toBe('user');
  });

  it('should update prescription status to applied', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir });

    const rx = getPrescription(id);
    expect(rx!.status).toBe('applied');
  });

  it('should fail if prescription not in accepted status', () => {
    const id = seedPrescription({ artifactScope: 'user', status: 'generated' });
    const result = applyPrescription(id, { homedir: tmpDir });

    expect(result.success).toBe(false);
    expect(result.error).toContain("'generated'");
    expect(result.error).toContain("expected 'accepted'");
  });

  it('should fail if prescription not found', () => {
    const result = applyPrescription(99999, { homedir: tmpDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should log prescription_applied event', () => {
    const sessionId = seedSession();
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir, sessionId });

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM event_log WHERE event_type = 'prescription_applied'")
      .get() as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    const payload = JSON.parse(row!.payload as string);
    expect(payload.prescriptionId).toBe(id);
  });

  it('should write valid sidecar markdown format', () => {
    const id = seedPrescription({
      artifactScope: 'user',
      title: 'Typecheck Guard',
      proposedChange: 'Always run `npm run typecheck` before committing.',
    });
    const result = applyPrescription(id, { homedir: tmpDir });

    const content = fs.readFileSync(result.path!, 'utf8');
    expect(content).toContain('<!-- Managed by Cairn Prescriber. Do not edit manually. -->');
    expect(content).toContain(`<!-- Prescription #${id}`);
    expect(content).toContain('## Typecheck Guard');
    expect(content).toContain('Always run `npm run typecheck` before committing.');
    expect(content).toContain('---');
  });

  it('should use configurable sidecar prefix via preference', () => {
    setPreference('prescriber.sidecar_prefix', 'my-custom-prefix', 'user');
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });

    expect(result.success).toBe(true);
    expect(result.path).toContain('my-custom-prefix.instructions.md');
  });

  it('should fail on drift before applying', () => {
    // Apply first prescription
    const id1 = seedPrescription({ artifactScope: 'user', title: 'First' });
    applyPrescription(id1, { homedir: tmpDir });

    // Manually modify the sidecar (simulate drift)
    const sidecarPath = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');
    fs.writeFileSync(sidecarPath, 'user tampered with this file', 'utf8');

    // Second apply should detect drift and fail
    const id2 = seedPrescription({ artifactScope: 'user', title: 'Second' });
    const result = applyPrescription(id2, { homedir: tmpDir });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Drift detected');
  });
});

// ---------------------------------------------------------------------------
// Multiple prescriptions append to same sidecar
// ---------------------------------------------------------------------------

describe('multi-prescription append', () => {
  it('should append multiple prescriptions to the same sidecar file', () => {
    const id1 = seedPrescription({
      artifactScope: 'user',
      title: 'First Rule',
      proposedChange: 'Do the first thing.',
    });
    applyPrescription(id1, { homedir: tmpDir });

    const id2 = seedPrescription({
      artifactScope: 'user',
      title: 'Second Rule',
      proposedChange: 'Do the second thing.',
    });
    applyPrescription(id2, { homedir: tmpDir });

    const sidecarPath = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');
    const content = fs.readFileSync(sidecarPath, 'utf8');

    // Should have the managed header once
    const headerMatches = content.match(/<!-- Managed by Cairn Prescriber/g);
    expect(headerMatches).toHaveLength(1);

    // Both sections present
    expect(content).toContain('## First Rule');
    expect(content).toContain('Do the first thing.');
    expect(content).toContain('## Second Rule');
    expect(content).toContain('Do the second thing.');
  });

  it('should store rollback content for appended prescription', () => {
    const id1 = seedPrescription({
      artifactScope: 'user',
      title: 'First',
      proposedChange: 'Content A',
    });
    const r1 = applyPrescription(id1, { homedir: tmpDir });
    const firstContent = fs.readFileSync(r1.path!, 'utf8');

    const id2 = seedPrescription({
      artifactScope: 'user',
      title: 'Second',
      proposedChange: 'Content B',
    });
    applyPrescription(id2, { homedir: tmpDir });

    // Managed artifact for id2 should have id1's content as rollback
    const sidecarPath = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');
    const artifact = getManagedArtifact(sidecarPath);
    expect(artifact).toBeDefined();
    expect(artifact!.rollbackContent).toBe(firstContent);
    expect(artifact!.prescriptionId).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// rollbackPrescription
// ---------------------------------------------------------------------------

describe('rollbackPrescription', () => {
  it('should restore original content when rolling back', () => {
    // Create a sidecar with two prescriptions
    const id1 = seedPrescription({ artifactScope: 'user', title: 'First' });
    const r1 = applyPrescription(id1, { homedir: tmpDir });
    const firstContent = fs.readFileSync(r1.path!, 'utf8');

    const id2 = seedPrescription({ artifactScope: 'user', title: 'Second' });
    applyPrescription(id2, { homedir: tmpDir });

    // Rollback second prescription
    const result = rollbackPrescription(id2);
    expect(result.success).toBe(true);
    expect(result.restored).toBe(true);

    // File should be back to first prescription's content
    const content = fs.readFileSync(r1.path!, 'utf8');
    expect(content).toBe(firstContent);
  });

  it('should delete file if no prior content (new file)', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });
    const sidecarPath = result.path!;
    expect(fs.existsSync(sidecarPath)).toBe(true);

    const rbResult = rollbackPrescription(id);
    expect(rbResult.success).toBe(true);
    expect(rbResult.restored).toBe(false);
    expect(fs.existsSync(sidecarPath)).toBe(false);
  });

  it('should remove managed_artifact entry on new-file rollback', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir });
    const sidecarPath = path.join(tmpDir, '.copilot', 'cairn-prescribed.instructions.md');

    expect(getManagedArtifact(sidecarPath)).toBeDefined();
    rollbackPrescription(id);
    expect(getManagedArtifact(sidecarPath)).toBeUndefined();
  });

  it('should keep managed_artifact tracked after restore rollback', () => {
    // Apply two prescriptions so rollback restores prior content
    const id1 = seedPrescription({ artifactScope: 'user', title: 'First' });
    const r1 = applyPrescription(id1, { homedir: tmpDir });
    const firstContent = fs.readFileSync(r1.path!, 'utf8');

    const id2 = seedPrescription({ artifactScope: 'user', title: 'Second' });
    applyPrescription(id2, { homedir: tmpDir });

    // Rollback second — should restore first content AND keep tracking
    rollbackPrescription(id2);

    const artifact = getManagedArtifact(r1.path!);
    expect(artifact).toBeDefined();
    const expectedChecksum = createHash('sha256').update(firstContent, 'utf8').digest('hex');
    expect(artifact!.currentChecksum).toBe(expectedChecksum);
  });

  it('should update prescription status to failed', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir });
    rollbackPrescription(id);

    const rx = getPrescription(id);
    expect(rx!.status).toBe('failed');
  });

  it('should log prescription_rolled_back event', () => {
    const sessionId = seedSession();
    const id = seedPrescription({ artifactScope: 'user' });
    applyPrescription(id, { homedir: tmpDir, sessionId });
    rollbackPrescription(id, { sessionId });

    const db = getDb();
    const row = db
      .prepare("SELECT * FROM event_log WHERE event_type = 'prescription_rolled_back'")
      .get() as Record<string, unknown> | undefined;
    expect(row).toBeDefined();
    const payload = JSON.parse(row!.payload as string);
    expect(payload.prescriptionId).toBe(id);
  });

  it('should fail if no managed artifact found', () => {
    const result = rollbackPrescription(99999);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No managed artifact');
  });
});

// ---------------------------------------------------------------------------
// checkDrift
// ---------------------------------------------------------------------------

describe('checkDrift', () => {
  it('should return no drift for unmodified sidecar', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });
    const sidecarPath = result.path!;

    const drift = checkDrift(sidecarPath);
    expect(drift).toBeDefined();
    expect(drift!.drifted).toBe(false);
    expect(drift!.expected).toBe(drift!.actual);
  });

  it('should detect drift when file is modified', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });
    const sidecarPath = result.path!;

    // Tamper with file
    fs.writeFileSync(sidecarPath, 'user edited this', 'utf8');

    const drift = checkDrift(sidecarPath);
    expect(drift).toBeDefined();
    expect(drift!.drifted).toBe(true);
    expect(drift!.expected).toBe(result.checksum);
    expect(drift!.actual).toBe(sha256('user edited this'));
  });

  it('should return undefined for untracked path', () => {
    const drift = checkDrift('/nonexistent/file.md');
    expect(drift).toBeUndefined();
  });

  it('should detect drift when file is deleted', () => {
    const id = seedPrescription({ artifactScope: 'user' });
    const result = applyPrescription(id, { homedir: tmpDir });
    const sidecarPath = result.path!;

    fs.unlinkSync(sidecarPath);

    const drift = checkDrift(sidecarPath);
    expect(drift).toBeDefined();
    expect(drift!.drifted).toBe(true);
    expect(drift!.actual).toBe('');
  });
});
