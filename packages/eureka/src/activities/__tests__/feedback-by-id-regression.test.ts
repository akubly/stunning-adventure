/**
 * M7-D — applyFeedbackById user_correction regression locks (M7-C port)
 *
 * Activity under test: applyFeedbackById (recall.ts)
 * Scope:               user_correction path — trust value plumbing, clamping, error ordering
 *
 * M7-C changes: applyFeedbackById is now a thin wrapper around applyFeedback → mutate().
 * FactReader is gone from the write path. The storage layer owns the read inside mutate().
 *
 * Risk addressed: a regression that mis-wires the storage-provided trust (e.g., always
 * passes 0 or a constant to fn) would silently apply delta to the wrong base. These locks
 * verify that fn, when called with the correct storage trust, returns the correct result.
 *
 * Semantic preservation: all 8 tests assert the same trust-arithmetic invariants as the
 * pre-M7-C version. The seam location changed (FactReader → mutate fn), not the contract.
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

/** Happy-path mutate mock: records call, resolves without calling fn. */
function makeTrustUpdater() {
  return { mutate: vi.fn().mockResolvedValue(undefined) };
}

/**
 * Mutate mock that calls fn(storageTrust) — simulates storage providing a trust value.
 * Use for tests that need fn's arithmetic or validation to fire.
 */
function makeMutateCallingFn(storageTrust: number) {
  return {
    mutate: vi.fn().mockImplementation(async ({ fn }: { fn: (t: number) => number }) => {
      fn(storageTrust);
    }),
  };
}

// =============================================================================
// M7-D regression locks — applyFeedbackById user_correction path
// =============================================================================

describe('M7-D — applyFeedbackById user_correction regression locks', () => {

  // ---------------------------------------------------------------------------
  // M7-D-1 — End-to-end value plumbing
  //
  // Storage provides trust=0.42; correctionDelta=+0.10.
  // fn must return 0.52, proving storage trust flows through to fn correctly —
  // not 0, a constant, or some default.
  // ---------------------------------------------------------------------------

  it('M7-D-1: storage trust flows through fn as currentTrust (0.42 + 0.10 = 0.52)', async () => {
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
      { trustUpdater },
    );

    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.42)).toBeCloseTo(0.52, 5);
  });

  // ---------------------------------------------------------------------------
  // M7-D-2 — Negative-delta clamping at storage trust
  //
  // Storage provides trust=0.05; correctionDelta=-0.20.
  // fn(0.05) must return 0.0 (clamped at floor, not -0.15).
  // ---------------------------------------------------------------------------

  it('M7-D-2: negative delta clamps at 0.0 relative to storage trust (0.05 - 0.20 → 0.0)', async () => {
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: -0.20 },
      { trustUpdater },
    );

    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.05)).toBeCloseTo(0.0, 5);
  });

  // ---------------------------------------------------------------------------
  // M7-D-3 — Positive-delta clamping at storage trust
  //
  // Storage provides trust=0.95; correctionDelta=+0.10.
  // fn(0.95) must return 1.0 (clamped at ceiling, not 1.05).
  // ---------------------------------------------------------------------------

  it('M7-D-3: positive delta clamps at 1.0 relative to storage trust (0.95 + 0.10 → 1.0)', async () => {
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
      { trustUpdater },
    );

    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.95)).toBeCloseTo(1.0, 5);
  });

  // ---------------------------------------------------------------------------
  // M7-D-4 — Zero-delta passthrough
  //
  // Storage provides trust=0.50; correctionDelta=0.
  // mutate MUST be called — no short-circuit for a no-op correction.
  // fn(0.50) must return 0.50 unchanged.
  // ---------------------------------------------------------------------------

  it('M7-D-4: zero correctionDelta — mutate IS called, fn(0.50) returns 0.50 (no short-circuit)', async () => {
    const trustUpdater = makeTrustUpdater();

    await applyFeedbackById(
      { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: 0 },
      { trustUpdater },
    );

    // No short-circuit — mutate must be called even for a zero delta
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.50)).toBeCloseTo(0.50, 5);
  });

  // ---------------------------------------------------------------------------
  // M7-D-5 — correctionDelta omitted → InvalidFeedbackOptionsError BEFORE write
  //
  // Pre-flight validation fires before mutate. mutate must never be called.
  // ---------------------------------------------------------------------------

  it('M7-D-5: omitted correctionDelta → InvalidFeedbackOptionsError, mutate never called', async () => {
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const /* no correctionDelta */ },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidFeedbackOptionsError).code).toBe('INVALID_FEEDBACK_OPTIONS');
    // Regression lock: pre-flight error path must not reach storage
    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // M7-D-6 — fact missing → FactNotFoundError from mutate
  //
  // M7-C: FactNotFoundError is now a storage-layer concern. The mutate mock
  // simulates storage throwing FactNotFoundError when the fact does not exist.
  // fn is never called — mutate rejects before invoking fn.
  // ---------------------------------------------------------------------------

  it('M7-D-6: mutate throws FactNotFoundError for missing fact (storage-layer concern)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockRejectedValue(new FactNotFoundError(FACT_ID)),
    };

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as FactNotFoundError).code).toBe('FACT_NOT_FOUND');
    expect((caught as FactNotFoundError).factId).toBe(FACT_ID);
  });

  // ---------------------------------------------------------------------------
  // M7-D-7 — Storage trust corruption → InvalidTrustValueError(source:'storage')
  //
  // M7-C: Storage calls fn(NaN) — simulating a corrupt DB row. fn throws
  // InvalidTrustValueError(source:'storage'). The write is aborted.
  // ---------------------------------------------------------------------------

  it('M7-D-7: corrupt storage trust (NaN) → InvalidTrustValueError(source:storage)', async () => {
    const trustUpdater = makeMutateCallingFn(NaN);

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: +0.10 },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('storage');
    // Regression lock: mutate was called but fn threw, aborting the write
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // M7-D-8 — correctionDelta=NaN → InvalidTrustValueError(source:'input') BEFORE write
  //
  // Pre-flight validation fires before mutate. mutate must never be called.
  // ---------------------------------------------------------------------------

  it('M7-D-8: correctionDelta=NaN → InvalidTrustValueError(source:input), mutate never called', async () => {
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'user_correction' as const, correctionDelta: NaN },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('input');
    // Regression lock: NaN delta guard fires before reaching storage
    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });
});
