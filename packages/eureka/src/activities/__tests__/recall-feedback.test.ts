/**
 * M5 RED — Trust mutation from feedback event (§30 §2.3)
 *
 * Activity under test : applyFeedback (§30 §2.3 "Trust Dynamics Beyond the Static Floor")
 * Seam driven:          TrustUpdater.update() — the trust-write seam
 * Next owner (GREEN):   Edgar
 *
 * §30 §2.3 specifies event-driven trust mutation:
 *   Corroboration:   trust = min(1.0, trust + 0.10)
 *   Contradiction:   trust = max(0.0, trust - 0.10)
 *   User correction: trust = min(1.0, max(0.0, trust + correctionDelta))
 *
 * Contract under test:
 *   Given a feedback event (type + currentTrust) and an injected TrustUpdater,
 *   applyFeedback() must call trustUpdater.update() with the correctly clamped
 *   new trust value. The TrustUpdater owns the write side; this activity owns
 *   the delta-computation contract.
 *
 * RED failure reason (expected):
 *   `applyFeedback` is not exported from recall.ts → `TypeError: applyFeedback is
 *   not a function` at runtime. This is "missing collaborator / missing wiring",
 *   not a typo or config error.
 *
 * §-ambiguity documented:
 *   §30 §2.3 ("Trust Dynamics Beyond the Static Floor") is cited in decisions.md
 *   but does NOT exist as a heading in the current docs/eureka/sections/30-learning-systems.md
 *   (section numbering jumps 2.2 → 2.4). The deltas (+0.10, -0.10, ±0.30) are
 *   authoritative from decisions.md (Named M5 Target). See decision drop
 *   .squad/decisions/inbox/laura-m5-trust-feedback-red.md for full ambiguity log.
 *
 * User-correction deferred:
 *   The ± in "trust ± 0.30" is ambiguous — the sign must come from somewhere.
 *   The chosen interpretation (caller-provided delta) is documented in the decision
 *   drop and deferred to Edgar's GREEN beat to confirm the interface shape.
 *
 * Mock contract discipline (§55 §3.3):
 *   TrustUpdater is an I/O seam (trust-write). Per §55 §1.2, always mock storage I/O.
 *   The inline structural mock here must be backed by a contract test when the real
 *   TrustUpdater implementation ships (M5+ backlog item for Crispin).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// M5: applyFeedback — trust mutation from event (GREEN as of M5).
// M6-B: applyFeedbackById — not yet exported from recall.ts; importing produces `undefined`
//        at runtime → "TypeError: applyFeedbackById is not a function" (correct M6-B RED).
import { applyFeedback, applyFeedbackById, type FeedbackEvent } from '../recall.js';
import type { SessionId } from '@akubly/types';

/**
 * Fixed clock anchor — M5 uses same pattern as M2–M4 (non-deterministic inputs
 * must be mocked per §55 §1.2; ClockProvider is REQUIRED in all activity deps).
 */
const FIXED_NOW_MS = 1_748_476_800_000; // 2026-05-29 00:00 UTC — M2/M3/M4 reference anchor
const fixedClock = { now: () => FIXED_NOW_MS };

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
  // Drives: TrustUpdater.update({ factId, sessionId, trust: 0.70 })
  //
  // RED failure: applyFeedback is undefined → TypeError: applyFeedback is not a function

  it('calls TrustUpdater.update with trust +0.10 for corroboration event (§30 §2.3)', async () => {
    const trustUpdater = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:       'fact-abc-001',
        sessionId,
        event:        'corroboration' as const,
        currentTrust:  0.60,
      },
      { trustUpdater, clock: fixedClock },
    );

    // Corroboration: trust = min(1.0, 0.60 + 0.10) = 0.70
    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith({
      factId:    'fact-abc-001',
      sessionId,
      trust:     expect.closeTo(0.70, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // M5-C1 ceiling clamp — corroboration near 1.0 must not exceed 1.0
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.95 → new trust = min(1.0, 0.95 + 0.10) = 1.0
  // Domain invariant: trust ∈ [0.0, 1.0] (§30 §2.1 Measurable Invariants)

  it('clamps corroboration result at 1.0 ceiling (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:       'fact-ceiling-001',
        sessionId,
        event:        'corroboration' as const,
        currentTrust:  0.95,
      },
      { trustUpdater, clock: fixedClock },
    );

    // min(1.0, 0.95 + 0.10) = 1.0
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(1.0, 5) }),
    );
  });

  // ---------------------------------------------------------------------------
  // M5-C2 — Contradiction: −0.10 applied, result clamped to max(0.0, ...)
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.50 → new trust = max(0.0, 0.50 - 0.10) = 0.40
  // Drives: TrustUpdater.update({ factId, sessionId, trust: 0.40 })

  it('calls TrustUpdater.update with trust −0.10 for contradiction event (§30 §2.3)', async () => {
    const trustUpdater = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:       'fact-xyz-001',
        sessionId,
        event:        'contradiction' as const,
        currentTrust:  0.50,
      },
      { trustUpdater, clock: fixedClock },
    );

    // Contradiction: trust = max(0.0, 0.50 - 0.10) = 0.40
    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith({
      factId:    'fact-xyz-001',
      sessionId,
      trust:     expect.closeTo(0.40, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // M5-C2 floor clamp — contradiction on near-zero trust must floor at 0.0
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.05 → new trust = max(0.0, 0.05 - 0.10) = 0.0
  // Domain invariant: trust never goes below 0.0 (§30 §2.1 Measurable Invariants)
  // Zombie-fact semantics apply: trust=0.0 is valid storage state (§30 §2.1.1)

  it('clamps contradiction result at 0.0 floor (§30 §2.1 domain invariant + §2.1.1 zombie-fact)', async () => {
    const trustUpdater = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedback(
      {
        factId:       'fact-floor-001',
        sessionId,
        event:        'contradiction' as const,
        currentTrust:  0.05,
      },
      { trustUpdater, clock: fixedClock },
    );

    // max(0.0, 0.05 - 0.10) = 0.0
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(0.0, 5) }),
    );
  });

  // ===========================================================================
  // F8 — Boundary idempotent: already-at-boundary cases must not drift outside [0,1]
  // ===========================================================================
  //
  // Regression lock: clamp logic refactors must not allow trust to escape [0,1]
  // when the input is already exactly at the boundary.

  it('is idempotent at ceiling: corroboration at currentTrust=1.0 stays 1.0 (§30 §2.1)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:       'fact-idempotent-ceil',
        sessionId,
        event:        'corroboration' as const,
        currentTrust:  1.0,
      },
      { trustUpdater, clock: fixedClock },
    );

    // min(1.0, 1.0 + 0.10) = 1.0 — must not exceed ceiling
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(1.0, 5) }),
    );
  });

  it('is idempotent at floor: contradiction at currentTrust=0.0 stays 0.0 (§30 §2.1)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:       'fact-idempotent-floor',
        sessionId,
        event:        'contradiction' as const,
        currentTrust:  0.0,
      },
      { trustUpdater, clock: fixedClock },
    );

    // max(0.0, 0.0 - 0.10) = 0.0 — must not go below floor
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(0.0, 5) }),
    );
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

  it('applies positive user-correction delta (+0.30) without clamp (§30 §2.3)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-001',
        sessionId,
        event:           'user_correction' as const,
        currentTrust:     0.50,
        correctionDelta:  +0.30,
      },
      { trustUpdater, clock: fixedClock },
    );

    // min(1.0, max(0.0, 0.50 + 0.30)) = 0.80
    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith({
      factId:    'fact-ucorr-001',
      sessionId,
      trust:     expect.closeTo(0.80, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // M6-A2 — positive correction with ceiling clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.80, correctionDelta=+0.30 → min(1.0, 0.80+0.30) = 1.0
  // Regression lock — implementation arrived before contract test (see note above).

  it('clamps positive user-correction result at 1.0 ceiling (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-ceiling-001',
        sessionId,
        event:           'user_correction' as const,
        currentTrust:     0.80,
        correctionDelta:  +0.30,
      },
      { trustUpdater, clock: fixedClock },
    );

    // min(1.0, 0.80 + 0.30) = 1.0
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(1.0, 5) }),
    );
  });

  // ---------------------------------------------------------------------------
  // M6-A3 — negative correction, no floor clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.50, correctionDelta=−0.30 → max(0.0, 0.50−0.30) = 0.20
  // Regression lock — implementation arrived before contract test (see note above).

  it('applies negative user-correction delta (−0.30) without clamp (§30 §2.3)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-002',
        sessionId,
        event:           'user_correction' as const,
        currentTrust:     0.50,
        correctionDelta:  -0.30,
      },
      { trustUpdater, clock: fixedClock },
    );

    // max(0.0, 0.50 - 0.30) = 0.20
    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith({
      factId:    'fact-ucorr-002',
      sessionId,
      trust:     expect.closeTo(0.20, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // M6-A4 — negative correction with floor clamp
  // ---------------------------------------------------------------------------
  //
  // Fixture: currentTrust=0.20, correctionDelta=−0.30 → max(0.0, 0.20−0.30) = 0.0
  // Regression lock — implementation arrived before contract test (see note above).

  it('clamps negative user-correction result at 0.0 floor (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await applyFeedback(
      {
        factId:          'fact-ucorr-floor-001',
        sessionId,
        event:           'user_correction' as const,
        currentTrust:     0.20,
        correctionDelta:  -0.30,
      },
      { trustUpdater, clock: fixedClock },
    );

    // max(0.0, 0.20 - 0.30) = 0.0
    expect(trustUpdater.update).toHaveBeenCalledWith(
      expect.objectContaining({ trust: expect.closeTo(0.0, 5) }),
    );
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
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(
      applyFeedback(
        {
          factId:       'fact-ucorr-missing-delta',
          sessionId,
          event:        'user_correction' as const,
          currentTrust:  0.50,
          // correctionDelta intentionally omitted
        },
        { trustUpdater, clock: fixedClock },
      ),
    ).rejects.toThrow();

    // Guard: TrustUpdater must NOT be called when input is invalid
    expect(trustUpdater.update).not.toHaveBeenCalled();
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

  it('throws TypeError for unknown event type (defensive guard, §30 §2.3+)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    // Cast forces a value the union forbids — simulates runtime cast from untrusted source
    await expect(applyFeedback(
      { factId: 'fact-x', sessionId, event: 'meditated' as FeedbackEvent, currentTrust: 0.5 },
      { trustUpdater, clock: fixedClock },
    )).rejects.toThrow(TypeError);
  });

  // ===========================================================================
  // F-NEW-RANGE — Regression locks for Edgar's F6: currentTrust input validation
  // ===========================================================================
  //
  // Edgar is adding a RangeError guard: currentTrust must be a finite number in
  // [0,1]. These tests lock that contract; TrustUpdater must never be called
  // when the input is invalid.
  //
  // RED until Edgar's F6 validation lands.

  it('throws RangeError when currentTrust is NaN (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedback(
      { factId: 'fact-range-nan', sessionId, event: 'corroboration' as const, currentTrust: NaN },
      { trustUpdater, clock: fixedClock },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  it('throws RangeError when currentTrust is below 0 (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedback(
      { factId: 'fact-range-low', sessionId, event: 'corroboration' as const, currentTrust: -0.1 },
      { trustUpdater, clock: fixedClock },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  it('throws RangeError when currentTrust is above 1 (§30 §2.1 domain invariant)', async () => {
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedback(
      { factId: 'fact-range-high', sessionId, event: 'corroboration' as const, currentTrust: 1.5 },
      { trustUpdater, clock: fixedClock },
    )).rejects.toThrow(RangeError);

    expect(trustUpdater.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// M6-B — applyFeedbackById: read-seam (FactReader collaborator)
// =============================================================================
//
// Outside-in: drive the read-seam into existence from a caller-perspective test.
// Production callers should not need to know the current trust before applying
// feedback — the activity should own that read. This test drives:
//
//   1. A new `applyFeedbackById` function (higher-level orchestrator)
//   2. A `FactReader` collaborator (read-seam, separate from TrustUpdater write-seam)
//
// Shape chosen: NEW `applyFeedbackById` function (not mutating existing `applyFeedback`).
// Rationale:
//   - `applyFeedback` has a stable M5 contract; breaking it risks regressions
//   - `applyFeedbackById` is a higher-level orchestrator; separation of concerns
//   - London-school: each function has one responsibility (read vs. write vs. orchestrate)
//   - `applyFeedback` remains unit-testable in isolation (no read-seam pollution)
//
// FactReader interface shape (driven by this test):
//   interface FactReader {
//     read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
//   }
//
// Activity signature driven:
//   async function applyFeedbackById(
//     options: { factId: string; sessionId: SessionId; event: FeedbackEvent; correctionDelta?: number },
//     deps: { factReader: FactReader; trustUpdater: TrustUpdater; clock: ClockProvider },
//   ): Promise<void>
//
// RED failure expected: `applyFeedbackById` is not exported from recall.ts →
//   TypeError: (0 , applyFeedbackById) is not a function
// This is "missing collaborator/missing wiring", not a typo or config error.

describe('applyFeedbackById (read-seam)', () => {
  let sessionId: SessionId;

  beforeEach(() => {
    sessionId = 'session-test-001' as SessionId;
  });

  // ---------------------------------------------------------------------------
  // M6-B1 — happy path: FactReader supplies currentTrust; activity applies delta
  // ---------------------------------------------------------------------------
  //
  // Contract: applyFeedbackById reads currentTrust via FactReader, then applies
  // the event delta and calls TrustUpdater with the new value. Caller does NOT
  // provide currentTrust — the activity owns the read.
  //
  // Fixture: FactReader returns trust=0.60; event=corroboration → new trust=0.70
  //
  // RED failure: applyFeedbackById is not exported from recall.ts

  it('reads currentTrust from FactReader and applies corroboration delta (§30 §2.3 read-seam)', async () => {
    const factReader = {
      read: vi.fn().mockResolvedValue({ trust: 0.60 }),
    };
    const trustUpdater = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await applyFeedbackById(
      { factId: 'fact-readseam-001', sessionId, event: 'corroboration' as const },
      { factReader, trustUpdater, clock: fixedClock },
    );

    // FactReader must have been consulted
    expect(factReader.read).toHaveBeenCalledOnce();
    expect(factReader.read).toHaveBeenCalledWith({ factId: 'fact-readseam-001', sessionId });

    // Delta applied to read value: min(1.0, 0.60 + 0.10) = 0.70
    expect(trustUpdater.update).toHaveBeenCalledOnce();
    expect(trustUpdater.update).toHaveBeenCalledWith({
      factId:    'fact-readseam-001',
      sessionId,
      trust:     expect.closeTo(0.70, 5),
    });
  });

  // ---------------------------------------------------------------------------
  // M6-B2 — FactReader returns null (fact not found) must throw
  // ---------------------------------------------------------------------------
  //
  // Contract: if FactReader.read() returns null, the activity must throw rather
  // than silently applying a delta to a non-existent fact (which would mislead
  // the caller into thinking feedback was recorded). TrustUpdater must NOT be called.
  //
  // RED failure: applyFeedbackById is not exported from recall.ts

  it('throws when FactReader returns null for unknown factId (§30 §2.3 read-seam null guard)', async () => {
    const factReader = {
      read: vi.fn().mockResolvedValue(null),
    };
    const trustUpdater = {
      update: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      applyFeedbackById(
        { factId: 'fact-does-not-exist', sessionId, event: 'corroboration' as const },
        { factReader, trustUpdater, clock: fixedClock },
      ),
    ).rejects.toThrow();

    // Guard: TrustUpdater must NOT be called for a missing fact
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // F-NEW-RANGE — applyFeedbackById: strict reader-contract guard
  // ---------------------------------------------------------------------------
  //
  // Regression lock for Edgar's F6: if FactReader returns a trust value that
  // violates the domain invariant (e.g. NaN from a corrupt row), applyFeedbackById
  // must throw RangeError rather than propagate a corrupt trust write.
  //
  // RED until Edgar's F6 validation lands in applyFeedback (which applyFeedbackById
  // delegates to — the guard fires at that delegation point).

  it('throws RangeError when FactReader returns trust: NaN (strict reader-contract guard)', async () => {
    const factReader = { read: vi.fn().mockResolvedValue({ trust: NaN }) };
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(
      applyFeedbackById(
        { factId: 'fact-range-reader', sessionId, event: 'corroboration' as const },
        { factReader, trustUpdater, clock: fixedClock },
      ),
    ).rejects.toThrow(RangeError);

    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // F-NEW-PROPAGATION — user_correction missing-delta propagates via applyFeedbackById
  // ---------------------------------------------------------------------------
  //
  // Craft F11 test-side: exercise the path where applyFeedbackById is called with
  // event='user_correction' but no correctionDelta. The error from applyFeedback
  // must propagate out. Edgar is updating JSDoc to note this throw; this test locks
  // the observable contract.

  it('propagates missing-correctionDelta error from applyFeedback', async () => {
    const factReader  = { read: vi.fn().mockResolvedValue({ trust: 0.5 }) };
    const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };

    await expect(applyFeedbackById(
      { factId: 'fact-y', sessionId, event: 'user_correction' as const /* no correctionDelta */ },
      { factReader, trustUpdater, clock: fixedClock },
    )).rejects.toThrow();  // Error message will mention correctionDelta
  });
});
