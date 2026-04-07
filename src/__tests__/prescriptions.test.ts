import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createInsight } from '../db/insights.js';
import {
  createPrescription,
  getPrescription,
  listPrescriptions,
  updatePrescriptionStatus,
  getTopPrescription,
  countPrescriptionsByStatus,
  expireAbandonedPrescriptions,
  deferPrescription,
  suppressPrescription,
  unsuppressPrescription,
  getSessionsSinceInstall,
  incrementSessionCounter,
} from '../db/prescriptions.js';
import {
  trackManagedArtifact,
  getManagedArtifact,
  listManagedArtifacts,
  updateArtifactChecksum,
  removeManagedArtifact,
  detectDrift,
} from '../db/managedArtifacts.js';
import { setPreference, getPreference } from '../db/preferences.js';

let insightId: number;

beforeEach(() => {
  closeDb();
  getDb(':memory:');
  // Seed an insight for FK references
  insightId = createInsight('recurring_error', 'Test pattern', 'A test pattern', [1, 2], 0.8);
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Migration verification
// ---------------------------------------------------------------------------

describe('prescriptions migration', () => {
  it('should create prescriptions and prescriber_state tables', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('prescriptions');
    expect(names).toContain('prescriber_state');
  });

  it('should create managed_artifacts table', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toContain('managed_artifacts');
  });

  it('should seed prescriber_state singleton row', () => {
    const db = getDb();
    const row = db.prepare('SELECT * FROM prescriber_state WHERE id = 1').get() as Record<
      string,
      unknown
    >;
    expect(row).toBeDefined();
    expect(row.sessions_since_install).toBe(0);
    expect(row.pending_count).toBe(0);
  });

  it('should record schema version 7', () => {
    const db = getDb();
    const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as {
      version: number;
    };
    expect(row.version).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Prescription CRUD
// ---------------------------------------------------------------------------

describe('prescription CRUD', () => {
  it('should create a prescription and return its id', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Fix error pattern',
      rationale: 'Errors keep happening',
      proposedChange: 'Add error handler',
    });
    expect(id).toBeGreaterThan(0);
  });

  it('should get a prescription by id', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Fix it',
      rationale: 'Because',
      proposedChange: 'Do the thing',
      targetPath: '~/.copilot/instructions.md',
      artifactType: 'instruction',
      artifactScope: 'user',
      confidence: 0.85,
      priorityScore: 42.5,
    });
    const p = getPrescription(id);
    expect(p).toBeDefined();
    expect(p!.id).toBe(id);
    expect(p!.insightId).toBe(insightId);
    expect(p!.patternType).toBe('recurring_error');
    expect(p!.title).toBe('Fix it');
    expect(p!.rationale).toBe('Because');
    expect(p!.proposedChange).toBe('Do the thing');
    expect(p!.targetPath).toBe('~/.copilot/instructions.md');
    expect(p!.artifactType).toBe('instruction');
    expect(p!.artifactScope).toBe('user');
    expect(p!.status).toBe('generated');
    expect(p!.confidence).toBe(0.85);
    expect(p!.priorityScore).toBe(42.5);
    expect(p!.deferCount).toBe(0);
    expect(p!.generatedAt).toBeDefined();
  });

  it('should return undefined for non-existent prescription', () => {
    expect(getPrescription(9999)).toBeUndefined();
  });

  it('should update prescription status', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Test',
      rationale: 'Reason',
      proposedChange: 'Change',
    });
    updatePrescriptionStatus(id, 'accepted', { dispositionReason: 'Looks good' });
    const p = getPrescription(id);
    expect(p!.status).toBe('accepted');
    expect(p!.dispositionReason).toBe('Looks good');
    expect(p!.resolvedAt).toBeDefined();
  });

  it('should set applied_at when marking as applied', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Apply test',
      rationale: 'Reason',
      proposedChange: 'Change',
    });
    updatePrescriptionStatus(id, 'applied');
    const p = getPrescription(id);
    expect(p!.status).toBe('applied');
    expect(p!.appliedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Status constraint validation
// ---------------------------------------------------------------------------

describe('prescription status constraints', () => {
  it('should reject invalid status values', () => {
    const db = getDb();
    expect(() => {
      db.prepare(
        `INSERT INTO prescriptions
          (insight_id, pattern_type, title, rationale, proposed_change, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(insightId, 'recurring_error', 'Bad', 'Bad', 'Bad', 'invalid_status');
    }).toThrow();
  });

  it('should reject invalid artifact_scope values', () => {
    const db = getDb();
    expect(() => {
      db.prepare(
        `INSERT INTO prescriptions
          (insight_id, pattern_type, title, rationale, proposed_change, artifact_scope)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(insightId, 'recurring_error', 'Bad', 'Bad', 'Bad', 'global');
    }).toThrow();
  });

  it('should reject confidence out of range', () => {
    const db = getDb();
    expect(() => {
      db.prepare(
        `INSERT INTO prescriptions
          (insight_id, pattern_type, title, rationale, proposed_change, confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(insightId, 'recurring_error', 'Bad', 'Bad', 'Bad', 1.5);
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Listing with filters
// ---------------------------------------------------------------------------

describe('prescription listing', () => {
  it('should list prescriptions by status', () => {
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'P1',
      rationale: 'R1',
      proposedChange: 'C1',
    });
    const id2 = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'P2',
      rationale: 'R2',
      proposedChange: 'C2',
    });
    updatePrescriptionStatus(id2, 'accepted');

    const generated = listPrescriptions({ status: 'generated' });
    expect(generated).toHaveLength(1);
    expect(generated[0].title).toBe('P1');

    const accepted = listPrescriptions({ status: 'accepted' });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].title).toBe('P2');
  });

  it('should list prescriptions by insight id', () => {
    const insight2 = createInsight('skip_frequency', 'Other', 'Another', [3], 0.5);
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'P1',
      rationale: 'R1',
      proposedChange: 'C1',
    });
    createPrescription({
      insightId: insight2,
      patternType: 'skip_frequency',
      title: 'P2',
      rationale: 'R2',
      proposedChange: 'C2',
    });

    const filtered = listPrescriptions({ insightId: insight2 });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].title).toBe('P2');
  });

  it('should respect limit', () => {
    for (let i = 0; i < 5; i++) {
      createPrescription({
        insightId,
        patternType: 'recurring_error',
        title: `P${i}`,
        rationale: 'R',
        proposedChange: 'C',
      });
    }
    const limited = listPrescriptions({ limit: 3 });
    expect(limited).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Priority-ordered retrieval
// ---------------------------------------------------------------------------

describe('priority retrieval', () => {
  it('should get the top prescription by priority score', () => {
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Low',
      rationale: 'R',
      proposedChange: 'C',
      priorityScore: 10,
    });
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'High',
      rationale: 'R',
      proposedChange: 'C',
      priorityScore: 99,
    });
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Mid',
      rationale: 'R',
      proposedChange: 'C',
      priorityScore: 50,
    });

    const top = getTopPrescription();
    expect(top).toBeDefined();
    expect(top!.title).toBe('High');
    expect(top!.priorityScore).toBe(99);
  });

  it('should return undefined when no generated prescriptions exist', () => {
    expect(getTopPrescription()).toBeUndefined();
  });

  it('should skip non-generated prescriptions in top query', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Accepted',
      rationale: 'R',
      proposedChange: 'C',
      priorityScore: 100,
    });
    updatePrescriptionStatus(id, 'accepted');

    expect(getTopPrescription()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Count by status
// ---------------------------------------------------------------------------

describe('count by status', () => {
  it('should count prescriptions grouped by status', () => {
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'G1',
      rationale: 'R',
      proposedChange: 'C',
    });
    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'G2',
      rationale: 'R',
      proposedChange: 'C',
    });
    const id3 = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'A1',
      rationale: 'R',
      proposedChange: 'C',
    });
    updatePrescriptionStatus(id3, 'accepted');

    const counts = countPrescriptionsByStatus();
    expect(counts.generated).toBe(2);
    expect(counts.accepted).toBe(1);
  });

  it('should return empty record on fresh database', () => {
    const counts = countPrescriptionsByStatus();
    expect(Object.keys(counts)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Expiration
// ---------------------------------------------------------------------------

describe('expiration', () => {
  it('should expire prescriptions older than 7 days', () => {
    const db = getDb();
    // Insert a prescription with a backdated generated_at
    db.prepare(
      `INSERT INTO prescriptions
        (insight_id, pattern_type, title, rationale, proposed_change, generated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now', '-8 days'))`,
    ).run(insightId, 'recurring_error', 'Old', 'Reason', 'Change');

    createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Fresh',
      rationale: 'Reason',
      proposedChange: 'Change',
    });

    const expired = expireAbandonedPrescriptions();
    expect(expired).toBe(1);

    const generated = listPrescriptions({ status: 'generated' });
    expect(generated).toHaveLength(1);
    expect(generated[0].title).toBe('Fresh');
  });

  it('should not expire non-generated prescriptions', () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO prescriptions
        (insight_id, pattern_type, title, rationale, proposed_change, status, generated_at)
       VALUES (?, ?, ?, ?, ?, 'accepted', datetime('now', '-8 days'))`,
    ).run(insightId, 'recurring_error', 'Accepted old', 'Reason', 'Change');

    const expired = expireAbandonedPrescriptions();
    expect(expired).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deferral
// ---------------------------------------------------------------------------

describe('deferral', () => {
  it('should defer a prescription and increment defer_count', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Deferred',
      rationale: 'R',
      proposedChange: 'C',
    });
    deferPrescription(id, 'Not now');

    const p = getPrescription(id);
    expect(p!.status).toBe('deferred');
    expect(p!.deferCount).toBe(1);
    expect(p!.dispositionReason).toBe('Not now');
    expect(p!.resolvedAt).toBeDefined();
  });

  it('should set defer_until_session when session count provided', () => {
    incrementSessionCounter();
    incrementSessionCounter(); // sessions = 2

    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Cooldown',
      rationale: 'R',
      proposedChange: 'C',
    });
    deferPrescription(id, 'Later', 3); // defer until session 2 + 3 = 5

    const p = getPrescription(id);
    expect(p!.deferUntilSession).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Suppression
// ---------------------------------------------------------------------------

describe('suppression', () => {
  it('should suppress a prescription', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Suppressed',
      rationale: 'R',
      proposedChange: 'C',
    });
    suppressPrescription(id);

    const p = getPrescription(id);
    expect(p!.status).toBe('suppressed');
    expect(p!.resolvedAt).toBeDefined();
  });

  it('should unsuppress a prescription back to generated', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Toggle',
      rationale: 'R',
      proposedChange: 'C',
    });
    suppressPrescription(id);
    unsuppressPrescription(id);

    const p = getPrescription(id);
    expect(p!.status).toBe('generated');
    expect(p!.resolvedAt).toBeUndefined();
  });

  it('should only unsuppress if currently suppressed', () => {
    const id = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Not suppressed',
      rationale: 'R',
      proposedChange: 'C',
    });
    updatePrescriptionStatus(id, 'accepted');
    unsuppressPrescription(id); // should be a no-op

    const p = getPrescription(id);
    expect(p!.status).toBe('accepted');
  });
});

// ---------------------------------------------------------------------------
// Session counter
// ---------------------------------------------------------------------------

describe('session counter', () => {
  it('should start at zero', () => {
    expect(getSessionsSinceInstall()).toBe(0);
  });

  it('should increment the counter', () => {
    incrementSessionCounter();
    expect(getSessionsSinceInstall()).toBe(1);
    incrementSessionCounter();
    expect(getSessionsSinceInstall()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Managed artifacts CRUD
// ---------------------------------------------------------------------------

describe('managed artifacts CRUD', () => {
  let prescriptionId: number;

  beforeEach(() => {
    prescriptionId = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Source',
      rationale: 'R',
      proposedChange: 'C',
    });
  });

  it('should track a managed artifact', () => {
    const id = trackManagedArtifact({
      path: '~/.copilot/instructions.md',
      artifactType: 'instruction',
      scope: 'user',
      prescriptionId,
      originalChecksum: 'abc123',
      currentChecksum: 'abc123',
    });
    expect(id).toBeGreaterThan(0);
  });

  it('should get a managed artifact by path', () => {
    trackManagedArtifact({
      path: '~/.copilot/agents/test.agent.md',
      artifactType: 'agent',
      logicalId: 'test-agent',
      scope: 'user',
      prescriptionId,
      originalChecksum: 'def456',
      currentChecksum: 'def456',
      rollbackContent: '# Original content',
    });

    const a = getManagedArtifact('~/.copilot/agents/test.agent.md');
    expect(a).toBeDefined();
    expect(a!.path).toBe('~/.copilot/agents/test.agent.md');
    expect(a!.artifactType).toBe('agent');
    expect(a!.logicalId).toBe('test-agent');
    expect(a!.scope).toBe('user');
    expect(a!.prescriptionId).toBe(prescriptionId);
    expect(a!.originalChecksum).toBe('def456');
    expect(a!.rollbackContent).toBe('# Original content');
    expect(a!.createdAt).toBeDefined();
    expect(a!.updatedAt).toBeDefined();
  });

  it('should return undefined for non-existent path', () => {
    expect(getManagedArtifact('/nonexistent')).toBeUndefined();
  });

  it('should list all managed artifacts', () => {
    trackManagedArtifact({
      path: '/a',
      artifactType: 'instruction',
      scope: 'user',
      prescriptionId,
    });
    trackManagedArtifact({
      path: '/b',
      artifactType: 'agent',
      scope: 'project',
      prescriptionId,
    });

    const all = listManagedArtifacts();
    expect(all).toHaveLength(2);
  });

  it('should list artifacts filtered by prescription id', () => {
    const p2 = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Other',
      rationale: 'R',
      proposedChange: 'C',
    });
    trackManagedArtifact({
      path: '/a',
      artifactType: 'instruction',
      scope: 'user',
      prescriptionId,
    });
    trackManagedArtifact({
      path: '/b',
      artifactType: 'agent',
      scope: 'project',
      prescriptionId: p2,
    });

    const filtered = listManagedArtifacts(prescriptionId);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe('/a');
  });

  it('should remove a managed artifact', () => {
    trackManagedArtifact({
      path: '/removable',
      artifactType: 'hook',
      scope: 'project',
      prescriptionId,
    });
    removeManagedArtifact('/removable');
    expect(getManagedArtifact('/removable')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------

describe('drift detection', () => {
  let prescriptionId: number;

  beforeEach(() => {
    prescriptionId = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Drift source',
      rationale: 'R',
      proposedChange: 'C',
    });
  });

  it('should detect no drift when checksums match', () => {
    trackManagedArtifact({
      path: '/stable',
      artifactType: 'instruction',
      scope: 'user',
      prescriptionId,
      originalChecksum: 'aaa',
      currentChecksum: 'aaa',
    });

    const result = detectDrift('/stable');
    expect(result).toBeDefined();
    expect(result!.drifted).toBe(false);
    expect(result!.expected).toBe('aaa');
    expect(result!.actual).toBe('aaa');
  });

  it('should detect drift when checksums differ', () => {
    trackManagedArtifact({
      path: '/drifted',
      artifactType: 'instruction',
      scope: 'user',
      prescriptionId,
      originalChecksum: 'aaa',
      currentChecksum: 'bbb',
    });

    const result = detectDrift('/drifted');
    expect(result).toBeDefined();
    expect(result!.drifted).toBe(true);
    expect(result!.expected).toBe('aaa');
    expect(result!.actual).toBe('bbb');
  });

  it('should detect drift after checksum update', () => {
    trackManagedArtifact({
      path: '/updated',
      artifactType: 'skill',
      scope: 'project',
      prescriptionId,
      originalChecksum: 'orig',
      currentChecksum: 'orig',
    });

    updateArtifactChecksum('/updated', 'modified');

    const result = detectDrift('/updated');
    expect(result!.drifted).toBe(true);
    expect(result!.actual).toBe('modified');
  });

  it('should return undefined for non-existent path', () => {
    expect(detectDrift('/ghost')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Unique path constraint
// ---------------------------------------------------------------------------

describe('managed artifacts constraints', () => {
  it('should enforce unique path constraint', () => {
    const prescriptionId = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Constraint test',
      rationale: 'R',
      proposedChange: 'C',
    });
    trackManagedArtifact({
      path: '/unique',
      artifactType: 'instruction',
      scope: 'user',
      prescriptionId,
    });
    expect(() => {
      trackManagedArtifact({
        path: '/unique',
        artifactType: 'agent',
        scope: 'project',
        prescriptionId,
      });
    }).toThrow();
  });

  it('should reject invalid scope values', () => {
    const db = getDb();
    const prescriptionId = createPrescription({
      insightId,
      patternType: 'recurring_error',
      title: 'Scope test',
      rationale: 'R',
      proposedChange: 'C',
    });
    expect(() => {
      db.prepare(
        `INSERT INTO managed_artifacts (path, artifact_type, scope, prescription_id)
         VALUES (?, ?, ?, ?)`,
      ).run('/bad-scope', 'instruction', 'global', prescriptionId);
    }).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Preference key defaults (verify the infrastructure supports prescriber prefs)
// ---------------------------------------------------------------------------

describe('prescriber preference infrastructure', () => {
  it('should support setting and reading prescriber preferences', () => {
    setPreference('prescriber.enabled', 'true', 'system');
    expect(getPreference('prescriber.enabled')).toBe('true');

    setPreference('prescriber.max_proactive', '1', 'system');
    expect(getPreference('prescriber.max_proactive')).toBe('1');

    setPreference('prescriber.defer_sessions', '3', 'system');
    setPreference('prescriber.suppress_threshold', '3', 'system');
    setPreference('prescriber.min_confidence', '0.3', 'system');
    setPreference('prescriber.auto_apply', 'false', 'system');
    setPreference('prescriber.sidecar_prefix', 'cairn-prescribed', 'system');

    expect(getPreference('prescriber.sidecar_prefix')).toBe('cairn-prescribed');
  });
});
