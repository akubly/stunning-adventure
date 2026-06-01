/**
 * M7-D — applyFeedbackById user_correction regression locks
 *
 * Activity under test: applyFeedbackById (recall.ts)
 * Scope:               user_correction path — trust value plumbing, clamping, error ordering
 *
 * Risk addressed: applyFeedbackById reads currentTrust from FactReader, then forwards
 * to applyFeedback with `currentTrust: fact.trust`. A regression that mis-wires the
 * read value (e.g., always passes 0 or a constant) would silently apply delta to the
 * wrong base — the new trust would be wrong without any test catching it.
 *
 * These locks assert that:
 *   - fact.trust flows through to applyFeedback as currentTrust (value plumbing)
 *   - clamping applies relative to fact.trust, not a constant (clamp correctness)
 *   - invalid inputs throw the correct typed error BEFORE any write occurs
 *   - error ordering is: FactReader null check → FactReader contract check →
 *     storage trust validation → input delta validation → write
 *
 * All tests import typed error classes and assert err.code (realm-safe discriminator)
 * per the M7-A canonical narrowing policy (decisions.md).
 *
 * Total M7-D: 8 tests
 */

import { describe, it, expect, vi } from 'vitest';
import { applyFeedbackById } from '../recall.js';
import {
  FactNotFoundError,
  InvalidFeedbackOptionsError,
  InvalidTrustValueError,
} from '../errors.js';
import type { SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SESSION: SessionId = 'session-m7d-regression' as SessionId;
const FACT_ID = 'fact-regression-001';

function makeTrustUpdater() {
  return { update: vi.fn().mockResolvedValue(undefined) };
}

function makeFactReader(result: { trust: number } | null | undefined) {
  return { read: vi.fn().mockResolvedValue(result) };
}

// =============================================================================
// M7-D regression locks — applyFeedbackById user_correction path
// =============================================================================

describe('M7-D — applyFeedbackById user_correction regression locks', () => {

  // ---------------------------------------------------------------------------
  // M7-D-1 — End-to-end value plumbing
  //
  // FactReader returns trust=0.42; correctionDelta=+0.10.
  // TrustUpdater must receive trust=0.52, proving fact.trust flows through
  // to applyFeedback as currentTrust — not 0, a constant, or some default.
  // ---------------------------------------------------------------------------

  it('M7-D-1: fact.trust from FactReader flows through as currentTrust (0.42 + 0.10 = 0.52)', async () => {
    const factReader   = makeFactReader({ trust: 0.42 });
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
      { factReader, trustUpdater },
    );

    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith({
      factId:    FACT_ID,
      sessionId: SESSION,
      trust:     expect.closeTo(0.52, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // M7-D-2 — Negative-delta clamping at storage trust
  //
  // FactReader returns trust=0.05; correctionDelta=-0.20.
  // TrustUpdater must receive trust=0.0 (clamped at floor, not -0.15).
  // Regression: if base trust were hardcoded to e.g. 0.5, the result would
  // be 0.30 instead of 0.0 — the clamp itself would not catch the mis-wiring.
  // ---------------------------------------------------------------------------

  it('M7-D-2: negative delta clamps at 0.0 relative to storage trust (0.05 - 0.20 → 0.0)', async () => {
    const factReader   = makeFactReader({ trust: 0.05 });
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: -0.20 },
      { factReader, trustUpdater },
    );

    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(0.0, 5) }),
    );
  });

  // ---------------------------------------------------------------------------
  // M7-D-3 — Positive-delta clamping at storage trust
  //
  // FactReader returns trust=0.95; correctionDelta=+0.10.
  // TrustUpdater must receive trust=1.0 (clamped at ceiling, not 1.05).
  // ---------------------------------------------------------------------------

  it('M7-D-3: positive delta clamps at 1.0 relative to storage trust (0.95 + 0.10 → 1.0)', async () => {
    const factReader   = makeFactReader({ trust: 0.95 });
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
      { factReader, trustUpdater },
    );

    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(1.0, 5) }),
    );
  });

  // ---------------------------------------------------------------------------
  // M7-D-4 — Zero-delta passthrough
  //
  // FactReader returns trust=0.50; correctionDelta=0.
  // TrustUpdater MUST be called with trust=0.50 — proves there is no short-circuit
  // for a no-op correction. The caller chose to apply a 0-delta; the activity
  // honours that intent and writes the unchanged trust back to storage.
  // ---------------------------------------------------------------------------

  it('M7-D-4: zero correctionDelta passes storage trust through — TrustUpdater IS called (no short-circuit)', async () => {
    const factReader   = makeFactReader({ trust: 0.50 });
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: 0 },
      { factReader, trustUpdater },
    );

    // No short-circuit — TrustUpdater must be called even for a no-op delta
    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(0.50, 5) }),
    );
  });

  // ---------------------------------------------------------------------------
  // M7-D-5 — correctionDelta omitted → InvalidFeedbackOptionsError BEFORE write
  //
  // FactReader returns valid trust. applyFeedbackById called with event='user_correction',
  // no correctionDelta. InvalidFeedbackOptionsError must be thrown AND TrustUpdater must
  // never be called — the error path must not write to storage.
  // ---------------------------------------------------------------------------

  it('M7-D-5: omitted correctionDelta → InvalidFeedbackOptionsError, TrustUpdater never called', async () => {
    const factReader   = makeFactReader({ trust: 0.60 });
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const /* no correctionDelta */ },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidFeedbackOptionsError).code).toBe('INVALID_FEEDBACK_OPTIONS');
    // Regression lock: error path must not write to storage
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // M7-D-6 — FactReader returns null → FactNotFoundError BEFORE write
  //
  // Even for a user_correction with a valid correctionDelta, a missing fact
  // must abort before writing. The read gate fires before any write attempt.
  // ---------------------------------------------------------------------------

  it('M7-D-6: FactReader returns null → FactNotFoundError, TrustUpdater never called', async () => {
    const factReader   = makeFactReader(null);
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as FactNotFoundError).code).toBe('FACT_NOT_FOUND');
    expect((caught as FactNotFoundError).factId).toBe(FACT_ID);
    // Regression lock: null-fact guard fires before write
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // M7-D-7 — Storage trust corruption → InvalidTrustValueError(source:'storage') BEFORE write
  //
  // FactReader returns a corrupt trust value (NaN — e.g. from a malformed DB row).
  // applyFeedbackById must throw InvalidTrustValueError with source='storage' and
  // must NOT call TrustUpdater. Writing NaN-derived trust back to storage would
  // permanently corrupt the row.
  // ---------------------------------------------------------------------------

  it('M7-D-7: corrupt storage trust (NaN) → InvalidTrustValueError(source:storage), TrustUpdater never called', async () => {
    const factReader   = makeFactReader({ trust: NaN });
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('storage');
    // Regression lock: storage corruption guard fires before write
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // M7-D-8 — correctionDelta=NaN → InvalidTrustValueError(source:'input') BEFORE write
  //
  // FactReader returns valid trust=0.5. correctionDelta=NaN (e.g. from a float parse
  // of a bad user input). The input-validation guard in applyFeedback must fire
  // AFTER the storage read (i.e., storage trust is read but not written — the gate
  // fires on the caller-supplied delta, not on the stored trust). TrustUpdater must
  // never be called.
  //
  // This locks the validation order: storage trust is read and validated first, then
  // caller-supplied delta is validated — neither results in a write on failure.
  // ---------------------------------------------------------------------------

  it('M7-D-8: correctionDelta=NaN → InvalidTrustValueError(source:input), TrustUpdater never called', async () => {
    const factReader   = makeFactReader({ trust: 0.5 });
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: NaN },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('input');
    // Regression lock: NaN delta guard fires before write
    expect(trustUpdater.update).not.toHaveBeenCalled();
    // FactReader was still called — the read happened, only the write was prevented
    expect(factReader.read).toHaveBeenCalledOnce();
  });
});
