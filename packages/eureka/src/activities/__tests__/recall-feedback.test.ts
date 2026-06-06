/**
 * M5 RED — Trust mutation from feedback event (§30 §2.3)
 *
 * Activity under test : applyFeedback (§30 §2.3 "Trust Dynamics Beyond the Static Floor")
 * Seam driven:          TrustUpdater.mutate() — the atomic trust-write seam (M7-C)
 * Next owner (GREEN):   Edgar
 *
 * §30 §2.3 specifies event-driven trust mutation:
 *   Corroboration:   trust = min(1.0, trust + 0.10)
 *   Contradiction:   trust = max(0.0, trust - 0.10)
 *   User correction: trust = min(1.0, max(0.0, trust + correctionDelta))
 *
 * M7-C contract under test:
 *   Given a feedback event and an injected TrustUpdater, applyFeedback() builds a
 *   delta fn and calls trustUpdater.mutate({ factId, sessionId, fn }). The fn, when
 *   called with currentTrust, returns the correctly clamped new trust value.
 *   currentTrust is no longer a caller input — it is supplied by the storage layer.
 *
 * Mock contract discipline (§55 §3.3):
 *   TrustUpdater is an I/O seam (trust-write). Per §55 §1.2, always mock storage I/O.
 *   The inline structural mock here must be backed by a contract test when the real
 *   TrustUpdater implementation ships — see storage/__tests__/trust-updater-contract.helper.ts (M8 Slice B).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// M5: applyFeedback — trust mutation from event (GREEN as of M5).
// M6-B: applyFeedbackById — GREEN as of M6-B. (Originally RED via "is not a function".)
// M7-C: Ported to TrustUpdater.mutate() callback seam (atomicity contract).
import { applyFeedback, applyFeedbackById, type FeedbackEvent } from '../recall.js';
import { FactNotFoundError, FactReaderContractError } from '../errors.js';
import type { SessionId } from '@akubly/types';

describe('applyFeedback', () => {
  let sessionId: SessionId;

  beforeEach(() => {
    sessionId = 'session-test-001' as SessionId;
  });

  // ---------------------------------------------------------------------------
  // M5-C1 — Corroboration: +0.10 applied, result clamped to min(1.0, ...)
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.60 → new trust = min(1.0, 0.60 + 0.10) = 0.70
  // Drives: TrustUpdater.mutate({ factId, sessionId, fn: t => min(1.0, t + 0.10) })
  //
  // RED failure: applyFeedback is undefined → TypeError: applyFeedback is not a function

  it('calls TrustUpdater.mutate with fn returning trust +0.10 for corroboration event (§30 §2.3)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:  'fact-abc-001',
        sessionId,
        event:   'corroboration' as const,
        // M7-C: currentTrust removed — supplied by storage layer via fn argument
      },
      { trustUpdater },
    );

    // Corroboration: fn(0.60) must return min(1.0, 0.60 + 0.10) = 0.70
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    expect(trustUpdater.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ factId: 'fact-abc-001', sessionId }),
    );
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.60)).toBeCloseTo(0.70, 5);
  });

  // ---------------------------------------------------------------------------
  // M5-C1 ceiling clamp — corroboration near 1.0 must not exceed 1.0
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.95 → new trust = min(1.0, 0.95 + 0.10) = 1.0
  // Domain invariant: trust ∈ [0.0, 1.0] (§30 §2.1 Measurable Invariants)

  it('fn clamps corroboration result at 1.0 ceiling (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:  'fact-ceiling-001',
        sessionId,
        event:   'corroboration' as const,
      },
      { trustUpdater },
    );

    // fn(0.95) must return min(1.0, 0.95 + 0.10) = 1.0
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.95)).toBeCloseTo(1.0, 5);
  });

  // ---------------------------------------------------------------------------
  // M5-C2 — Contradiction: −0.10 applied, result clamped to max(0.0, ...)
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.50 → new trust = max(0.0, 0.50 - 0.10) = 0.40
  // Drives: TrustUpdater.mutate({ factId, sessionId, fn: t => max(0.0, t - 0.10) })

  it('calls TrustUpdater.mutate with fn returning trust −0.10 for contradiction event (§30 §2.3)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:  'fact-xyz-001',
        sessionId,
        event:   'contradiction' as const,
      },
      { trustUpdater },
    );

    // Contradiction: fn(0.50) must return max(0.0, 0.50 - 0.10) = 0.40
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.50)).toBeCloseTo(0.40, 5);
  });

  // ---------------------------------------------------------------------------
  // M5-C2 floor clamp — contradiction on near-zero trust must floor at 0.0
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.05 → new trust = max(0.0, 0.05 - 0.10) = 0.0
  // Domain invariant: trust never goes below 0.0 (§30 §2.1 Measurable Invariants)
  // Zombie-fact semantics apply: trust=0.0 is valid storage state (§30 §2.1.1)

  it('fn clamps contradiction result at 0.0 floor (§30 §2.1 domain invariant + §2.1.1 zombie-fact)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:  'fact-floor-001',
        sessionId,
        event:   'contradiction' as const,
      },
      { trustUpdater },
    );

    // fn(0.05) must return max(0.0, 0.05 - 0.10) = 0.0
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.05)).toBeCloseTo(0.0, 5);
  });

  // ===========================================================================
  // F8 — Boundary idempotent: already-at-boundary cases must not drift outside [0,1]
  // ===========================================================================
  //
  // Regression lock: clamp logic refactors must not allow trust to escape [0,1]
  // when the input is already exactly at the boundary.

  it('fn is idempotent at ceiling: corroboration fn(1.0) stays 1.0 (§30 §2.1)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:  'fact-idempotent-ceil',
        sessionId,
        event:   'corroboration' as const,
      },
      { trustUpdater },
    );

    // fn(1.0) must return min(1.0, 1.0 + 0.10) = 1.0 — must not exceed ceiling
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(1.0)).toBeCloseTo(1.0, 5);
  });

  it('fn is idempotent at floor: contradiction fn(0.0) stays 0.0 (§30 §2.1)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:  'fact-idempotent-floor',
        sessionId,
        event:   'contradiction' as const,
      },
      { trustUpdater },
    );

    // fn(0.0) must return max(0.0, 0.0 - 0.10) = 0.0 — must not go below floor
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.0)).toBeCloseTo(0.0, 5);
  });

  // ===========================================================================
  // M6-A — user_correction event (§30 §2.3 "User Correction Sign Convention")
  // ===========================================================================
  //
  // Regression-lock note: Edgar's M5 GREEN already implemented the user_correction
  // branch (correctionDelta ?? 0 path). Tests M6-A1 through M6-A4 are expected to
  // pass on first run — this is a §55 contract-after-implementation deviation.
  // These tests lock the contract for regression; the deviation is documented below.
  //
  // §55 deviation note (mild): Tests M6-A1–M6-A4 arrived after the implementation.
  // The implementation is correct per spec; these tests prevent future regressions.
  // The proper RED beat is M6-A5 (missing correctionDelta contract), which IS red.
  //
  // Formula: trust = min(1.0, max(0.0, currentTrust + correctionDelta))
  // Sign convention: positive correctionDelta raises trust, negative lowers it.

  // ---------------------------------------------------------------------------
  // M6-A1 — positive correction, no ceiling clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.50, correctionDelta=+0.30 → min(1.0, max(0.0, 0.80)) = 0.80
  // Regression lock — implementation arrived before contract test (see note above).

  it('fn applies positive user-correction delta (+0.30) without clamp (§30 §2.3)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-001',
        sessionId,
        event:           'user_correction' as const,
        correctionDelta:  +0.30,
      },
      { trustUpdater },
    );

    // fn(0.50) must return min(1.0, max(0.0, 0.50 + 0.30)) = 0.80
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.50)).toBeCloseTo(0.80, 5);
  });

  // ---------------------------------------------------------------------------
  // M6-A2 — positive correction with ceiling clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.80, correctionDelta=+0.30 → min(1.0, 0.80+0.30) = 1.0
  // Regression lock — implementation arrived before contract test (see note above).

  it('fn clamps positive user-correction result at 1.0 ceiling (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-ceiling-001',
        sessionId,
        event:           'user_correction' as const,
        correctionDelta:  +0.30,
      },
      { trustUpdater },
    );

    // fn(0.80) must return min(1.0, 0.80 + 0.30) = 1.0
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.80)).toBeCloseTo(1.0, 5);
  });

  // ---------------------------------------------------------------------------
  // M6-A3 — negative correction, no floor clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.50, correctionDelta=−0.30 → max(0.0, 0.50−0.30) = 0.20
  // Regression lock — implementation arrived before contract test (see note above).

  it('fn applies negative user-correction delta (−0.30) without clamp (§30 §2.3)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-002',
        sessionId,
        event:           'user_correction' as const,
        correctionDelta:  -0.30,
      },
      { trustUpdater },
    );

    // fn(0.50) must return max(0.0, 0.50 - 0.30) = 0.20
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.50)).toBeCloseTo(0.20, 5);
  });

  // ---------------------------------------------------------------------------
  // M6-A4 — negative correction with floor clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.20, correctionDelta=−0.30 → max(0.0, 0.20−0.30) = 0.0
  // Regression lock — implementation arrived before contract test (see note above).

  it('fn clamps negative user-correction result at 0.0 floor (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-floor-001',
        sessionId,
        event:           'user_correction' as const,
        correctionDelta:  -0.30,
      },
      { trustUpdater },
    );

    // fn(0.20) must return max(0.0, 0.20 - 0.30) = 0.0
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.20)).toBeCloseTo(0.0, 5);
  });

  // ---------------------------------------------------------------------------
  // M6-A5 — missing correctionDelta when event='user_correction' must throw
  // ---------------------------------------------------------------------------
  //
  // Contract: correctionDelta is REQUIRED for user_correction events. A caller that
  // omits it has made a programming error. The activity must surface this loudly
  // rather than silently applying a 0-delta (which would be a no-op mutation that
  // calls TrustUpdater for no reason and misleads callers).
  //
  // RED failure expected: Edgar's implementation uses `correctionDelta ?? 0` (silent
  // fallback). This test drives the THROW contract — it will fail RED until Edgar
  // adds an explicit guard: if (event === 'user_correction' && correctionDelta === undefined) throw.
  //
  // This is the TRUE RED beat for M6-A.

  it('throws when event=user_correction and correctionDelta is omitted (§30 §2.3 required-ness)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await expect(
      applyFeedback(
        {
          factId:  'fact-ucorr-missing-delta',
          sessionId,
          event:   'user_correction' as const,
          // correctionDelta intentionally omitted
        },
        { trustUpdater },
      ),
    ).rejects.toThrow();

    // Guard: TrustUpdater must NOT be called when input is invalid
    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // F-NEW-EXHAUSTIVE — Regression lock for Edgar's F4: exhaustiveness guard
  // ===========================================================================
  //
  // Edgar is converting the event dispatch to a switch with an exhaustiveness
  // check that throws TypeError on unrecognised event strings. This test locks
  // that contract against future regressions (simulates a runtime cast from an
  // untrusted source that bypasses the TypeScript union).
  //
  // RED until Edgar's F4 switch+TypeError lands.

  it('throws TypeError for unknown event type before mutate is called (defensive guard, §30 §2.3+)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    // Cast forces a value the union forbids — simulates runtime cast from untrusted source
    await expect(applyFeedback(
      { factId: 'fact-x', sessionId, event: 'meditated' as FeedbackEvent },
      { trustUpdater },
    )).rejects.toThrow(TypeError);

    // Pre-flight validation fires before mutate — unknown event never reaches storage
    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // F-NEW-RANGE — Regression locks for M7-C: storage-provided currentTrust validation
  // ===========================================================================
  //
  // M7-C: currentTrust is no longer a caller input — it is provided by the storage
  // layer as the argument to fn. These tests verify that fn throws RangeError
  // when the storage layer provides a corrupt trust value (NaN, <0, >1).
  // The mock simulates storage calling fn with a bad value.
  //
  // The semantic invariant is identical to the pre-M7-C tests: corrupt trust
  // values must not be written to storage. The seam location changed (storage → fn
  // instead of caller → applyFeedback), but the contract is the same.

  it('fn throws RangeError when storage provides NaN currentTrust (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockImplementation(async ({ fn }: { fn: (t: number) => number }) => { fn(NaN); }),
    };

    await expect(applyFeedback(
      { factId: 'fact-range-nan', sessionId, event: 'corroboration' as const },
      { trustUpdater },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
  });

  it('fn throws RangeError when storage provides currentTrust below 0 (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockImplementation(async ({ fn }: { fn: (t: number) => number }) => { fn(-0.1); }),
    };

    await expect(applyFeedback(
      { factId: 'fact-range-low', sessionId, event: 'corroboration' as const },
      { trustUpdater },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
  });

  it('fn throws RangeError when storage provides currentTrust above 1 (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockImplementation(async ({ fn }: { fn: (t: number) => number }) => { fn(1.5); }),
    };

    await expect(applyFeedback(
      { factId: 'fact-range-high', sessionId, event: 'corroboration' as const },
      { trustUpdater },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
  });

  // ===========================================================================
  // F-CYCLE3 — Regression lock for correctionDelta finite-guard (cycle 2 carry-forward)
  // ===========================================================================
  //
  // Cycle 2 added a RangeError guard for non-finite correctionDelta. This test
  // locks that contract — without it, a corrupt delta (NaN, ±Infinity) could
  // silently poison storage via NaN trust.

  it('throws RangeError when correctionDelta is NaN (§30 §2.3 finite guard)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedback(
      { factId: 'fact-delta-nan', sessionId, event: 'user_correction' as const, correctionDelta: NaN },
      { trustUpdater },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });

  it('throws RangeError when correctionDelta is +Infinity (§30 §2.3 finite guard)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedback(
      { factId: 'fact-delta-inf', sessionId, event: 'user_correction' as const, correctionDelta: Infinity },
      { trustUpdater },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });
});

// =============================================================================
// M6-B — applyFeedbackById: mutate seam (M7-C thin-wrapper form)
// =============================================================================
//
// M7-C: applyFeedbackById is now a thin forwarding wrapper around applyFeedback.
// The read has moved into the storage layer (TrustUpdater.mutate atomically reads,
// applies fn, and writes). FactReader is no longer used on the write path.
//
// Semantic contract preserved:
//   - Corroboration/contradiction/user_correction deltas applied correctly via fn
//   - Missing fact → FactNotFoundError propagated from mutate()
//   - Corrupt storage trust → RangeError thrown by fn when storage calls fn(badValue)
//   - Invalid inputs (missing delta) → error propagated before mutate is called

describe('applyFeedbackById (mutate seam)', () => {
  let sessionId: SessionId;

  beforeEach(() => {
    sessionId = 'session-test-001' as SessionId;
  });

  // ---------------------------------------------------------------------------
  // M6-B1 — happy path: mutate receives fn that computes correct delta
  // ---------------------------------------------------------------------------
  //
  // M7-C: No FactReader. applyFeedbackById delegates to applyFeedback which calls
  // mutate. The fn, when called with a trust value, returns the correct clamped result.
  //
  // Contract: applyFeedbackById must pass factId and sessionId to mutate, and the
  // fn must compute the same delta as the pre-M7-C implementation.

  it('delegates corroboration delta to mutate via fn (§30 §2.3 mutate seam)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedbackById(
      { factId: 'fact-readseam-001', sessionId, event: 'corroboration' as const },
      { trustUpdater },
    );

    // mutate must be called with the right factId/sessionId
    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
    expect(trustUpdater.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ factId: 'fact-readseam-001', sessionId }),
    );

    // fn(0.60) must produce min(1.0, 0.60 + 0.10) = 0.70 — same delta as M6-B
    const { fn } = trustUpdater.mutate.mock.calls[0][0];
    expect(fn(0.60)).toBeCloseTo(0.70, 5);
  });

  // ---------------------------------------------------------------------------
  // M6-B2 — missing fact → FactNotFoundError from mutate
  // ---------------------------------------------------------------------------
  //
  // M7-C: FactNotFoundError is now a storage-layer concern. The mutate() mock
  // simulates storage throwing FactNotFoundError when the fact does not exist.
  // applyFeedbackById must propagate this error to the caller.

  it('propagates FactNotFoundError from mutate when fact is missing (§30 §2.3 mutate seam)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockRejectedValue(new FactNotFoundError('fact-does-not-exist')),
    };

    await expect(
      applyFeedbackById(
        { factId: 'fact-does-not-exist', sessionId, event: 'corroboration' as const },
        { trustUpdater },
      ),
    ).rejects.toMatchObject({ code: 'FACT_NOT_FOUND' });
  });

  // ---------------------------------------------------------------------------
  // M6-B3 — FactReaderContractError constructor integrity (no longer driven by SUT)
  // ---------------------------------------------------------------------------
  //
  // M7-C: FactReader is no longer used in applyFeedbackById. The old test that
  // drove FactReaderContractError via SUT path (factReader returning undefined)
  // no longer applies. We instead verify the error class itself can be instantiated
  // and has the expected shape — class integrity, not SUT wiring.

  it('FactReaderContractError constructs with correct code and message (class integrity)', () => {
    const err = new FactReaderContractError('fact-undef');
    expect(err).toBeInstanceOf(TypeError);
    expect(err.code).toBe('FACT_READER_CONTRACT');
    expect(err.factId).toBe('fact-undef');
    expect(err.message).toContain('FactReader.read()');
  });

  // ---------------------------------------------------------------------------
  // F-NEW-RANGE — applyFeedbackById: storage corruption guard via fn
  // ---------------------------------------------------------------------------
  //
  // M7-C: Corrupt trust now surfaces when storage calls fn(NaN). The mock simulates
  // storage calling fn with a bad value; applyFeedbackById must propagate the RangeError.

  it('fn throws RangeError when storage provides NaN trust via mutate (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = {
      mutate: vi.fn().mockImplementation(async ({ fn }: { fn: (t: number) => number }) => { fn(NaN); }),
    };

    await expect(
      applyFeedbackById(
        { factId: 'fact-range-reader', sessionId, event: 'corroboration' as const },
        { trustUpdater },
      ),
    ).rejects.toThrow(RangeError);

    expect(trustUpdater.mutate).toHaveBeenCalledOnce();
  });

  // ---------------------------------------------------------------------------
  // F-NEW-PROPAGATION — user_correction missing-delta propagates via applyFeedbackById
  // ---------------------------------------------------------------------------
  //
  // Pre-flight validation fires before mutate. applyFeedbackById must propagate the
  // InvalidFeedbackOptionsError thrown by applyFeedback when correctionDelta is missing.

  it('propagates missing-correctionDelta error from applyFeedback (pre-flight, before mutate)', async () => {
    const trustUpdater = { mutate: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedbackById(
      { factId: 'fact-y', sessionId, event: 'user_correction' as const /* no correctionDelta */ },
      { trustUpdater },
    )).rejects.toThrow();

    // Guard: mutate must NOT be called — error fires before reaching storage
    expect(trustUpdater.mutate).not.toHaveBeenCalled();
  });
});
