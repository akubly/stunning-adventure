import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { createInsight } from '../db/insights.js';
import { createSession } from '../db/sessions.js';
import { setPreference } from '../db/preferences.js';
import {
  getPrescription,
  listPrescriptions,
  updatePrescriptionStatus,
  deferPrescription,
  suppressPrescription,
  unsuppressPrescription,
  incrementSessionCounter,
} from '../db/prescriptions.js';
import {
  prescribe,
  computePriority,
  shouldResurface,
  checkAutoSuppress,
} from '../agents/prescriber.js';
import type { Prescription, PrescriptionStatus } from '../types/index.js';

// ---------------------------------------------------------------------------
// Setup: in-memory DB with a seed session for FK-valid event logging
// ---------------------------------------------------------------------------

beforeEach(() => {
  closeDb();
  getDb(':memory:');
  createSession('test-repo', 'main');
});

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Helper to create a seeded insight
// ---------------------------------------------------------------------------

function seedInsight(
  patternType: 'recurring_error' | 'error_sequence' | 'skip_frequency' = 'recurring_error',
  title?: string,
  confidence: number = 0.8,
): number {
  const titles: Record<string, string> = {
    recurring_error: title ?? 'Recurring build: missing import',
    error_sequence: title ?? 'Sequence: tool_use → build',
    skip_frequency: title ?? 'Frequently skipped: lint check',
  };
  return createInsight(
    patternType,
    titles[patternType],
    `Description for ${patternType}`,
    [1, 2],
    confidence,
    3,
    `Prescription advice for ${patternType}`,
  );
}

// ---------------------------------------------------------------------------
// prescribe() — core generation
// ---------------------------------------------------------------------------

describe('prescribe()', () => {
  it('generates prescriptions from active insights', () => {
    seedInsight('recurring_error');
    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(1);

    const prescriptions = listPrescriptions({ status: 'generated' });
    expect(prescriptions).toHaveLength(1);
    expect(prescriptions[0].patternType).toBe('recurring_error');
  });

  it('skips insights that already have generated prescriptions (idempotent)', () => {
    seedInsight('recurring_error');

    const first = prescribe();
    expect(first.prescriptionsGenerated).toBe(1);

    const second = prescribe();
    expect(second.prescriptionsGenerated).toBe(0);
  });

  it('is idempotent across multiple runs', () => {
    seedInsight('recurring_error');
    prescribe();
    prescribe();
    prescribe();

    const all = listPrescriptions({ status: 'generated' });
    expect(all).toHaveLength(1);
  });

  it('skips insights with accepted prescriptions', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'accepted');

    // Should not generate a new one
    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(0);
  });

  it('skips insights with suppressed prescriptions', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    suppressPrescription(rx.id);

    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(0);
  });

  it('handles empty insights list', () => {
    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(0);
  });

  it('handles missing topology gracefully', () => {
    // In-memory DB with no cached topology, scanTopology will fail on
    // non-existent home dir — prescriber should still succeed
    seedInsight('recurring_error');
    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(1);
  });

  it('skips insights below min_confidence', () => {
    seedInsight('recurring_error', undefined, 0.1);
    setPreference('prescriber.min_confidence', '0.5', 'system');

    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(0);
  });

  it('generates prescriptions for multiple insights', () => {
    seedInsight('recurring_error', 'Recurring build: error A');
    seedInsight('error_sequence', 'Sequence: tool_use → test');
    seedInsight('skip_frequency', 'Frequently skipped: type check');

    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Priority scoring
// ---------------------------------------------------------------------------

describe('computePriority()', () => {
  it('computes priority from confidence, recency, and availability', () => {
    const score = computePriority(0.8, '2024-01-01', 0, 0);
    expect(score).toBeCloseTo(0.8);
  });

  it('gives full recency weight within 5 sessions', () => {
    const s0 = computePriority(1.0, '2024-01-01', 0, 0);
    const s3 = computePriority(1.0, '2024-01-01', 3, 0);
    const s5 = computePriority(1.0, '2024-01-01', 5, 0);
    expect(s0).toBe(1.0);
    expect(s3).toBe(1.0);
    expect(s5).toBe(1.0);
  });

  it('decays recency weight between 5 and 20 sessions', () => {
    const s10 = computePriority(1.0, '2024-01-01', 10, 0);
    const s20 = computePriority(1.0, '2024-01-01', 20, 0);
    expect(s10).toBeGreaterThan(0.5);
    expect(s10).toBeLessThan(1.0);
    expect(s20).toBeCloseTo(0.5);
  });

  it('floors recency weight at 0.5 beyond 20 sessions', () => {
    const s30 = computePriority(1.0, '2024-01-01', 30, 0);
    expect(s30).toBeCloseTo(0.5);
  });

  it('dampens priority with prior rejections', () => {
    const noReject = computePriority(1.0, '2024-01-01', 0, 0);
    const oneReject = computePriority(1.0, '2024-01-01', 0, 1);
    const threeReject = computePriority(1.0, '2024-01-01', 0, 3);
    expect(oneReject).toBeLessThan(noReject);
    expect(threeReject).toBeLessThan(oneReject);
    expect(threeReject).toBeCloseTo(0.1); // min availability 0.1
  });

  it('higher confidence × recency wins in ordering', () => {
    const highConf = computePriority(0.9, '2024-01-01', 2, 0);
    const lowConf = computePriority(0.3, '2024-01-01', 2, 0);
    expect(highConf).toBeGreaterThan(lowConf);
  });
});

// ---------------------------------------------------------------------------
// State transitions (DP2)
// ---------------------------------------------------------------------------

describe('state transitions', () => {
  let insightId: number;

  beforeEach(() => {
    insightId = seedInsight('recurring_error');
  });

  it('generated → accepted', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'accepted');
    expect(getPrescription(rx.id)!.status).toBe('accepted');
  });

  it('generated → rejected (with reason)', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'rejected', { dispositionReason: 'Not applicable' });
    const updated = getPrescription(rx.id)!;
    expect(updated.status).toBe('rejected');
    expect(updated.dispositionReason).toBe('Not applicable');
  });

  it('generated → deferred (with cooldown)', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];
    deferPrescription(rx.id, 'Not now', 3);
    const updated = getPrescription(rx.id)!;
    expect(updated.status).toBe('deferred');
    expect(updated.deferCount).toBe(1);
    expect(updated.deferUntilSession).toBeDefined();
  });

  it('accepted → applied', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'accepted');
    updatePrescriptionStatus(rx.id, 'applied');
    expect(getPrescription(rx.id)!.status).toBe('applied');
  });

  it('accepted → failed', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'accepted');
    updatePrescriptionStatus(rx.id, 'failed');
    expect(getPrescription(rx.id)!.status).toBe('failed');
  });

  it('generated → expired (cleanup)', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];

    // Backdate the prescription to trigger expiration
    const db = getDb();
    db.prepare(
      `UPDATE prescriptions SET generated_at = datetime('now', '-8 days') WHERE id = ?`,
    ).run(rx.id);

    // Run prescribe again — cleanup should expire it
    prescribe();
    expect(getPrescription(rx.id)!.status).toBe('expired');
  });

  it('generated → suppressed (after 3 deferrals)', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];

    // Defer 3 times
    deferPrescription(rx.id, 'later', 1);
    // Reset to generated for next deferral (simulating user flow)
    updatePrescriptionStatus(rx.id, 'generated');
    deferPrescription(rx.id, 'later', 1);
    updatePrescriptionStatus(rx.id, 'generated');
    deferPrescription(rx.id, 'later', 1);

    // Now check auto-suppress
    const updated = getPrescription(rx.id)!;
    expect(updated.deferCount).toBe(3);

    const suppressed = checkAutoSuppress(rx.id, updated.deferCount);
    expect(suppressed).toBe(true);
    expect(getPrescription(rx.id)!.status).toBe('suppressed');
  });

  it('suppressed → generated (unsuppress)', () => {
    prescribe();
    const rx = listPrescriptions({ insightId })[0];
    suppressPrescription(rx.id);
    expect(getPrescription(rx.id)!.status).toBe('suppressed');

    unsuppressPrescription(rx.id);
    expect(getPrescription(rx.id)!.status).toBe('generated');
  });
});

// ---------------------------------------------------------------------------
// Deferred resurfacing
// ---------------------------------------------------------------------------

describe('deferred resurfacing', () => {
  it('shouldResurface returns false for non-deferred prescriptions', () => {
    const rx = { status: 'generated' as PrescriptionStatus } as Prescription;
    expect(shouldResurface(rx, 10)).toBe(false);
  });

  it('shouldResurface returns true when no deferUntilSession set', () => {
    const rx = {
      status: 'deferred' as PrescriptionStatus,
      deferUntilSession: undefined,
    } as Prescription;
    expect(shouldResurface(rx, 0)).toBe(true);
  });

  it('shouldResurface returns true when cooldown is met', () => {
    const rx = {
      status: 'deferred' as PrescriptionStatus,
      deferUntilSession: 5,
    } as Prescription;
    // currentSession + 1 >= 5 → true when currentSession = 4
    expect(shouldResurface(rx, 4)).toBe(true);
  });

  it('shouldResurface returns false when cooldown not met', () => {
    const rx = {
      status: 'deferred' as PrescriptionStatus,
      deferUntilSession: 10,
    } as Prescription;
    // currentSession + 1 = 6 < 10 → false
    expect(shouldResurface(rx, 5)).toBe(false);
  });

  it('deferred prescriptions resurface after cooldown sessions', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();
    const rx = listPrescriptions({ insightId })[0];

    // Defer with 1 session cooldown
    deferPrescription(rx.id, 'not now', 1);
    expect(getPrescription(rx.id)!.status).toBe('deferred');

    // Increment session counter to pass cooldown
    incrementSessionCounter();
    incrementSessionCounter();

    // Re-run prescribe — should resurface
    prescribe();

    // Old prescription expired, new one generated
    expect(getPrescription(rx.id)!.status).toBe('expired');
    const newPrescriptions = listPrescriptions({ insightId, status: 'generated' });
    expect(newPrescriptions).toHaveLength(1);
    expect(newPrescriptions[0].id).not.toBe(rx.id);
  });
});

// ---------------------------------------------------------------------------
// Suppression threshold configuration
// ---------------------------------------------------------------------------

describe('suppression configuration', () => {
  it('suppression threshold configurable via preference', () => {
    setPreference('prescriber.suppress_threshold', '2', 'system');

    const insightId = seedInsight('recurring_error');
    prescribe();
    const rx = listPrescriptions({ insightId })[0];

    // Defer twice (custom threshold = 2)
    deferPrescription(rx.id, 'later', 1);
    const updated = getPrescription(rx.id)!;
    expect(updated.deferCount).toBe(1);

    // Not yet suppressed
    expect(checkAutoSuppress(rx.id, 1)).toBe(false);

    // Second deferral
    updatePrescriptionStatus(rx.id, 'generated');
    deferPrescription(rx.id, 'later', 1);

    // Now should suppress
    expect(checkAutoSuppress(rx.id, 2)).toBe(true);
    expect(getPrescription(rx.id)!.status).toBe('suppressed');
  });
});

// ---------------------------------------------------------------------------
// Template generation per pattern type
// ---------------------------------------------------------------------------

describe('prescription templates', () => {
  it('generates template for recurring_error insight', () => {
    const insightId = seedInsight('recurring_error', 'Recurring build: missing import');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    expect(rx.title).toContain('Prevent recurring');
    expect(rx.title).toContain('build');
    expect(rx.proposedChange).toContain('Managed by Cairn Prescriber');
    expect(rx.patternType).toBe('recurring_error');
  });

  it('generates template for error_sequence insight', () => {
    const insightId = seedInsight('error_sequence', 'Sequence: tool_use → build');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    expect(rx.title).toContain('Guard against error sequence');
    expect(rx.proposedChange).toContain('Managed by Cairn Prescriber');
    expect(rx.patternType).toBe('error_sequence');
  });

  it('generates template for skip_frequency insight', () => {
    const insightId = seedInsight('skip_frequency', 'Frequently skipped: lint check');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    expect(rx.title).toContain('Review skipped guardrail');
    expect(rx.proposedChange).toContain('Managed by Cairn Prescriber');
    expect(rx.patternType).toBe('skip_frequency');
  });
});

// ---------------------------------------------------------------------------
// Target path and sidecar prefix
// ---------------------------------------------------------------------------

describe('target path computation', () => {
  it('computes target path from topology scope (defaults to user)', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    expect(rx.targetPath).toBeDefined();
    expect(rx.targetPath).toContain('cairn-prescribed.instructions.md');
    expect(rx.artifactScope).toBe('user');
  });

  it('sidecar filename uses configured prefix', () => {
    setPreference('prescriber.sidecar_prefix', 'my-custom', 'system');
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    expect(rx.targetPath).toContain('my-custom.instructions.md');
  });
});

// ---------------------------------------------------------------------------
// Event recording
// ---------------------------------------------------------------------------

describe('event recording', () => {
  it('records prescription_generated events when session exists', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const db = getDb();
    const events = db
      .prepare(
        `SELECT * FROM event_log WHERE event_type = 'prescription_generated'`,
      )
      .all() as Array<Record<string, unknown>>;

    expect(events.length).toBeGreaterThanOrEqual(1);
    const payload = JSON.parse(events[0].payload as string) as Record<string, unknown>;
    expect(payload.insightId).toBe(insightId);
    expect(payload.patternType).toBe('recurring_error');
  });
});

// ---------------------------------------------------------------------------
// Expiration and re-prescription
// ---------------------------------------------------------------------------

describe('expiration and re-prescription', () => {
  it('expires abandoned generated prescriptions older than 7 days', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];

    // Backdate
    const db = getDb();
    db.prepare(
      `UPDATE prescriptions SET generated_at = datetime('now', '-8 days') WHERE id = ?`,
    ).run(rx.id);

    // Run prescribe — old one expired, new one generated
    const result = prescribe();
    expect(getPrescription(rx.id)!.status).toBe('expired');
    expect(result.prescriptionsGenerated).toBe(1);

    const newRx = listPrescriptions({ insightId, status: 'generated' });
    expect(newRx).toHaveLength(1);
    expect(newRx[0].id).not.toBe(rx.id);
  });

  it('re-prescription from same insight after expiry', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'expired');

    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(1);

    const all = listPrescriptions({ insightId });
    const generated = all.filter((p) => p.status === 'generated');
    const expired = all.filter((p) => p.status === 'expired');
    expect(generated).toHaveLength(1);
    expect(expired).toHaveLength(1);
  });

  it('does not re-prescribe from rejected insights', () => {
    const insightId = seedInsight('recurring_error');
    prescribe();

    const rx = listPrescriptions({ insightId })[0];
    updatePrescriptionStatus(rx.id, 'rejected', { dispositionReason: 'nope' });

    // rejected is terminal — should not regenerate
    const result = prescribe();
    expect(result.prescriptionsGenerated).toBe(0);
  });
});
