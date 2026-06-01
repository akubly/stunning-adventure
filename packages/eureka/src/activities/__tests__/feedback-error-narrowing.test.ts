/**
 * M7-B — Exhaustive error narrowing tests
 *
 * Activities under test: applyFeedback / applyFeedbackById (recall.ts)
 * Contract under test:   realm-safe narrowing via err.code (primary discriminator)
 *                        instanceof (convenience only — see Group 3 comment)
 *
 * Per decisions.md "Canonical narrowing policy (M7-A Cycle 1)":
 *   err.code === '...' is the PRIMARY discriminator. instanceof is convenience-only
 *   and can fail across ESM realms (e.g., vm.runInNewContext). code is always realm-safe.
 *
 * Error classes under test (all in packages/eureka/src/activities/errors.ts):
 *   FactNotFoundError              code 'FACT_NOT_FOUND'
 *   InvalidFeedbackOptionsError    code 'INVALID_FEEDBACK_OPTIONS'
 *   InvalidTrustValueError         code 'INVALID_TRUST_VALUE'   (extends RangeError, has source)
 *   FactReaderContractError        code 'FACT_READER_CONTRACT'  (extends TypeError)
 *   UnhandledFeedbackEventError    code 'UNHANDLED_FEEDBACK_EVENT' (extends TypeError)
 *
 * Test groups:
 *   1. Code-based narrowing (primary contract)      — 5 tests, one per error class
 *   2. Exhaustive code-discriminator switch         — 1 test, canonical caller pattern
 *   3. Inheritance preservation (instanceof)        — 3 tests, realm-convenience assertions
 *   4. source discrimination on InvalidTrustValueError — 3 tests ('input' × 2, 'storage' × 1)
 *   5. InvalidFeedbackOptionsError.field discriminator — 1 test
 *   6. UnhandledFeedbackEventError runtime-cast path   — 1 test
 *
 * Total M7-B: 14 tests
 */

import { describe, it, expect, vi } from 'vitest';
import { applyFeedback, applyFeedbackById, type FeedbackEvent } from '../recall.js';
import {
  FactNotFoundError,
  InvalidFeedbackOptionsError,
  InvalidTrustValueError,
  FactReaderContractError,
  UnhandledFeedbackEventError,
} from '../errors.js';
import type { SessionId } from '@akubly/types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SESSION: SessionId = 'session-m7b-narrowing' as SessionId;
const FACT_ID = 'fact-narrowing-001';

function makeTrustUpdater() {
  return { update: vi.fn().mockResolvedValue(undefined) };
}

function makeFactReader(result: { trust: number } | null | undefined) {
  return { read: vi.fn().mockResolvedValue(result) };
}

// ---------------------------------------------------------------------------
// Group 2 helper — canonical code-discriminator switch pattern
//
// This function is the canonical pattern callers should use for realm-safe
// programmatic narrowing. It accepts `unknown` (the natural catch-site type)
// and dispatches on err.code. The `default` branch is unreachable for any
// valid Eureka error. In a narrower typed context (e.g., err: EurekaErrorCode)
// the `default: never` form provides a compile-time exhaustiveness check.
// ---------------------------------------------------------------------------

type EurekaTag =
  | 'fact_not_found'
  | 'invalid_feedback_options'
  | 'invalid_trust_value'
  | 'fact_reader_contract'
  | 'unhandled_feedback_event'
  | 'unknown';

function narrowEurekaError(err: unknown): EurekaTag {
  if (typeof err !== 'object' || err === null || !('code' in err)) return 'unknown';
  switch ((err as { code: string }).code) {
    case 'FACT_NOT_FOUND':           return 'fact_not_found';
    case 'INVALID_FEEDBACK_OPTIONS': return 'invalid_feedback_options';
    case 'INVALID_TRUST_VALUE':      return 'invalid_trust_value';
    case 'FACT_READER_CONTRACT':     return 'fact_reader_contract';
    case 'UNHANDLED_FEEDBACK_EVENT': return 'unhandled_feedback_event';
    default:
      // Unreachable for valid Eureka errors — all five codes are handled above.
      // Test below (Group 2) asserts that every error class routes to a non-'unknown' tag.
      return 'unknown';
  }
}

// =============================================================================
// Group 1 — Code-based narrowing (primary contract)
//
// For each error class: drive the SUT into the throw path, catch the error,
// and assert code, discriminator fields, message substring, and name.
// These are the canonical checks callers should make at catch sites.
// =============================================================================

describe('Group 1 — code-based narrowing (primary contract)', () => {

  it('FactNotFoundError: code, factId, message substring, and name are correct', async () => {
    const trustUpdater = makeTrustUpdater();
    const factReader   = makeFactReader(null); // null → FactNotFoundError

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'corroboration' as const },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    // Primary discriminator (realm-safe)
    expect((caught as FactNotFoundError).code).toBe('FACT_NOT_FOUND');
    // Discriminator field
    expect((caught as FactNotFoundError).factId).toBe(FACT_ID);
    // Message preserves pre-M7-A text (F4 finding)
    expect((caught as FactNotFoundError).message).toContain('fact not found');
    expect((caught as FactNotFoundError).message).toContain(FACT_ID);
    // name is the domain class name, NOT the native base class name (F4)
    expect((caught as FactNotFoundError).name).toBe('FactNotFoundError');
  });

  it('InvalidFeedbackOptionsError: code, field, message substring, and name are correct', async () => {
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedback(
        {
          factId: FACT_ID,
          sessionId: SESSION,
          event: 'user_correction' as const,
          currentTrust: 0.5,
          // correctionDelta intentionally omitted → InvalidFeedbackOptionsError
        },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as InvalidFeedbackOptionsError).code).toBe('INVALID_FEEDBACK_OPTIONS');
    expect((caught as InvalidFeedbackOptionsError).field).toBe('correctionDelta');
    expect((caught as InvalidFeedbackOptionsError).message).toContain('correctionDelta');
    expect((caught as InvalidFeedbackOptionsError).name).toBe('InvalidFeedbackOptionsError');
  });

  it('InvalidTrustValueError: code, value, source, message substring, and name are correct', async () => {
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedback(
        {
          factId: FACT_ID,
          sessionId: SESSION,
          event: 'corroboration' as const,
          currentTrust: NaN, // non-finite → InvalidTrustValueError(source:'input')
        },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).value).toBeNaN();
    expect((caught as InvalidTrustValueError).source).toBe('input');
    expect((caught as InvalidTrustValueError).message).toContain('currentTrust');
    expect((caught as InvalidTrustValueError).name).toBe('InvalidTrustValueError');
  });

  it('FactReaderContractError: code, factId, message substring, and name are correct', async () => {
    const trustUpdater = makeTrustUpdater();
    const factReader   = makeFactReader(undefined); // undefined → FactReaderContractError

    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'corroboration' as const },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as FactReaderContractError).code).toBe('FACT_READER_CONTRACT');
    expect((caught as FactReaderContractError).factId).toBe(FACT_ID);
    expect((caught as FactReaderContractError).message).toContain('FactReader.read()');
    expect((caught as FactReaderContractError).message).toContain('undefined');
    expect((caught as FactReaderContractError).name).toBe('FactReaderContractError');
  });

  it('UnhandledFeedbackEventError: code, event, message substring, and name are correct', async () => {
    const trustUpdater = makeTrustUpdater();

    let caught: unknown;
    try {
      await applyFeedback(
        {
          factId: FACT_ID,
          sessionId: SESSION,
          // Runtime cast bypasses the TypeScript union — simulates untrusted boundary
          event: 'meditated' as unknown as FeedbackEvent,
          currentTrust: 0.5,
        },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeDefined();
    expect((caught as UnhandledFeedbackEventError).code).toBe('UNHANDLED_FEEDBACK_EVENT');
    expect((caught as UnhandledFeedbackEventError).event).toBe('meditated');
    expect((caught as UnhandledFeedbackEventError).message).toContain('meditated');
    expect((caught as UnhandledFeedbackEventError).name).toBe('UnhandledFeedbackEventError');
  });
});

// =============================================================================
// Group 2 — Exhaustive code-discriminator switch (canonical narrowing pattern)
//
// Demonstrates the canonical pattern callers should use for programmatic
// narrowing. The `narrowEurekaError` helper (defined above) uses an exhaustive
// switch on err.code. This test asserts:
//   - All five Eureka error codes route to the correct non-'unknown' tag
//   - No valid Eureka error reaches the `default` (unknown) branch
// =============================================================================

describe('Group 2 — exhaustive code-discriminator switch', () => {

  it('routes all five error codes correctly and no valid Eureka error falls to default', async () => {
    // Drive each error class out of the SUT, then run through the helper.

    const cases: Array<Promise<unknown>> = [
      // FactNotFoundError
      applyFeedbackById(
        { factId: 'fact-switch-01', sessionId: SESSION, event: 'corroboration' as const },
        { factReader: makeFactReader(null), trustUpdater: makeTrustUpdater() },
      ).catch(e => e),

      // InvalidFeedbackOptionsError
      applyFeedback(
        { factId: 'fact-switch-02', sessionId: SESSION, event: 'user_correction' as const, currentTrust: 0.5 },
        { trustUpdater: makeTrustUpdater() },
      ).catch(e => e),

      // InvalidTrustValueError (source:'input')
      applyFeedback(
        { factId: 'fact-switch-03', sessionId: SESSION, event: 'corroboration' as const, currentTrust: NaN },
        { trustUpdater: makeTrustUpdater() },
      ).catch(e => e),

      // FactReaderContractError
      applyFeedbackById(
        { factId: 'fact-switch-04', sessionId: SESSION, event: 'corroboration' as const },
        { factReader: makeFactReader(undefined), trustUpdater: makeTrustUpdater() },
      ).catch(e => e),

      // UnhandledFeedbackEventError
      applyFeedback(
        { factId: 'fact-switch-05', sessionId: SESSION, event: 'unknown_evt' as unknown as FeedbackEvent, currentTrust: 0.5 },
        { trustUpdater: makeTrustUpdater() },
      ).catch(e => e),
    ];

    const [fnf, ifo, itv, frc, ufe] = await Promise.all(cases);

    expect(narrowEurekaError(fnf)).toBe('fact_not_found');
    expect(narrowEurekaError(ifo)).toBe('invalid_feedback_options');
    expect(narrowEurekaError(itv)).toBe('invalid_trust_value');
    expect(narrowEurekaError(frc)).toBe('fact_reader_contract');
    expect(narrowEurekaError(ufe)).toBe('unhandled_feedback_event');

    // Non-Eureka objects correctly reach the default branch
    expect(narrowEurekaError(new Error('plain error'))).toBe('unknown');
    expect(narrowEurekaError({ code: 'SOME_OTHER_CODE' })).toBe('unknown');
    expect(narrowEurekaError(null)).toBe('unknown');
  });
});

// =============================================================================
// Group 3 — Inheritance preservation (instanceof)
//
// ⚠️ CONVENIENCE ASSERTIONS ONLY. instanceof checks are provided for completeness
//    and work within a single ESM realm. Do NOT rely on instanceof for cross-realm
//    narrowing (e.g., vm.runInNewContext, multi-bundle envs). Use err.code instead
//    (see Group 1 and decisions.md "Canonical narrowing policy (M7-A Cycle 1)").
// =============================================================================

describe('Group 3 — inheritance preservation (instanceof convenience)', () => {

  it('InvalidTrustValueError instanceof RangeError (preserves pre-M7-A assertion)', async () => {
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedback(
        { factId: FACT_ID, sessionId: SESSION, event: 'corroboration' as const, currentTrust: 2.0 },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }
    // Convenience assertion only — code-based check is primary (see Group 1)
    expect(caught).toBeInstanceOf(RangeError);
    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
  });

  it('FactReaderContractError instanceof TypeError (preserves pre-M7-A assertion)', async () => {
    const factReader   = makeFactReader(undefined);
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'corroboration' as const },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }
    // Convenience assertion only — code-based check is primary (see Group 1)
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as FactReaderContractError).code).toBe('FACT_READER_CONTRACT');
  });

  it('UnhandledFeedbackEventError instanceof TypeError (preserves pre-M7-A assertion)', async () => {
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedback(
        { factId: FACT_ID, sessionId: SESSION, event: 'bogus' as unknown as FeedbackEvent, currentTrust: 0.5 },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }
    // Convenience assertion only — code-based check is primary (see Group 1)
    expect(caught).toBeInstanceOf(TypeError);
    expect((caught as UnhandledFeedbackEventError).code).toBe('UNHANDLED_FEEDBACK_EVENT');
  });
});

// =============================================================================
// Group 4 — source discrimination on InvalidTrustValueError
//
// InvalidTrustValueError carries source: 'input' | 'storage' to distinguish
// whether the bad value came from the caller or from storage. Three paths:
//   - source:'input' via non-finite currentTrust (applyFeedback guard fires first)
//   - source:'input' via non-finite correctionDelta (user_correction path)
//   - source:'storage' via FactReader returning corrupt trust (applyFeedbackById guard)
// =============================================================================

describe('Group 4 — source discrimination on InvalidTrustValueError', () => {

  it("source:'input' — applyFeedback with non-finite currentTrust produces source='input'", async () => {
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedback(
        { factId: FACT_ID, sessionId: SESSION, event: 'corroboration' as const, currentTrust: Infinity },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('input');
    expect((caught as InvalidTrustValueError).value).toBe(Infinity);
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  it("source:'input' — applyFeedback with non-finite correctionDelta produces source='input'", async () => {
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedback(
        {
          factId: FACT_ID,
          sessionId: SESSION,
          event: 'user_correction' as const,
          currentTrust: 0.5,
          correctionDelta: NaN, // non-finite delta → source:'input'
        },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('input');
    expect((caught as InvalidTrustValueError).value).toBeNaN();
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });

  it("source:'storage' — applyFeedbackById with FactReader returning NaN trust produces source='storage'", async () => {
    const factReader   = makeFactReader({ trust: NaN }); // corrupt storage row
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedbackById(
        { factId: FACT_ID, sessionId: SESSION, event: 'corroboration' as const },
        { factReader, trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidTrustValueError).code).toBe('INVALID_TRUST_VALUE');
    expect((caught as InvalidTrustValueError).source).toBe('storage');
    expect((caught as InvalidTrustValueError).value).toBeNaN();
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Group 5 — InvalidFeedbackOptionsError.field discriminator
//
// The current throw site sets field='correctionDelta'. This test locks that
// the field is set correctly and is narrowable at catch sites.
// =============================================================================

describe('Group 5 — InvalidFeedbackOptionsError.field discriminator', () => {

  it("field='correctionDelta' when correctionDelta is omitted for user_correction", async () => {
    const trustUpdater = makeTrustUpdater();
    let caught: unknown;
    try {
      await applyFeedback(
        {
          factId: FACT_ID,
          sessionId: SESSION,
          event: 'user_correction' as const,
          currentTrust: 0.5,
          // correctionDelta omitted — the only current throw site for this error class
        },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as InvalidFeedbackOptionsError).code).toBe('INVALID_FEEDBACK_OPTIONS');
    // field discriminator — enables callers to switch on which option was invalid
    expect((caught as InvalidFeedbackOptionsError).field).toBe('correctionDelta');
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Group 6 — UnhandledFeedbackEventError runtime-cast path
//
// TypeScript prevents bad event values at compile time, but runtime casts
// (e.g. JSON.parse, untyped boundary) can leak unknown strings through.
// This test uses `as unknown as FeedbackEvent` to simulate the runtime scenario.
// =============================================================================

describe('Group 6 — UnhandledFeedbackEventError runtime-cast path', () => {

  it('unknown event string via runtime cast produces UnhandledFeedbackEventError with err.event set', async () => {
    const trustUpdater = makeTrustUpdater();
    const BAD_EVENT    = 'reinforcement_learning'; // plausible future value; currently unhandled

    let caught: unknown;
    try {
      await applyFeedback(
        {
          factId: FACT_ID,
          sessionId: SESSION,
          // Simulates a runtime cast from untrusted boundary (e.g. JSON.parse, untyped API response)
          event: BAD_EVENT as unknown as FeedbackEvent,
          currentTrust: 0.5,
        },
        { trustUpdater },
      );
    } catch (err) {
      caught = err;
    }

    expect((caught as UnhandledFeedbackEventError).code).toBe('UNHANDLED_FEEDBACK_EVENT');
    // err.event carries the original bad string — callers can log or alert on it
    expect((caught as UnhandledFeedbackEventError).event).toBe(BAD_EVENT);
    expect((caught as UnhandledFeedbackEventError).message).toContain(BAD_EVENT);
    expect(trustUpdater.update).not.toHaveBeenCalled();
  });
});
