/**
 * Typed error hierarchy for Eureka activities (M7-A).
 *
 * All error classes carry:
 *   - `code` discriminator for instanceof-free narrowing across ESM realms/dual-pkg
 *   - `name` set to class name for readable stack traces
 *   - preserved original message text from pre-M7-A throw sites
 *
 * Inheritance:
 *   - InvalidTrustValueError extends RangeError — preserves existing `instanceof RangeError` assertions
 *   - FactReaderContractError extends TypeError — preserves existing `instanceof TypeError` assertion
 *   - UnhandledFeedbackEventError extends TypeError — preserves existing `instanceof TypeError` assertion
 *   - FactNotFoundError, InvalidFeedbackOptionsError extend Error (no prior class assertion in tests)
 *
 * M7-B (exhaustive instanceof/code narrowing tests) is the follow-up PR.
 */

// ---------------------------------------------------------------------------
// FactNotFoundError
// ---------------------------------------------------------------------------

/**
 * Thrown by `applyFeedbackById` when `FactReader.read()` returns `null`.
 * Prevents TrustUpdater from being called for a non-existent fact.
 */
export class FactNotFoundError extends Error {
  readonly code = 'FACT_NOT_FOUND' as const;
  readonly factId: string;

  constructor(factId: string) {
    super(`applyFeedbackById: fact not found — factId="${factId}"`);
    this.name = 'FactNotFoundError';
    this.factId = factId;
    // Restore prototype chain (required for extending built-in Error in ES5 targets)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// InvalidFeedbackOptionsError
// ---------------------------------------------------------------------------

/**
 * Thrown when required feedback options are missing or semantically invalid —
 * e.g. `correctionDelta` omitted for a `user_correction` event. This is a
 * programming-error path (the caller failed to supply a required field).
 */
export class InvalidFeedbackOptionsError extends Error {
  readonly code = 'INVALID_FEEDBACK_OPTIONS' as const;
  /** Name of the offending / missing option field. */
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'InvalidFeedbackOptionsError';
    this.field = field;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// InvalidTrustValueError
// ---------------------------------------------------------------------------

/**
 * Thrown when a trust value (either caller-supplied `currentTrust` / `correctionDelta`,
 * or the value retrieved from storage) is non-finite or outside [0, 1].
 *
 * Extends `RangeError` to preserve the existing `instanceof RangeError` test assertions
 * established in M5+M6.
 */
export class InvalidTrustValueError extends RangeError {
  readonly code = 'INVALID_TRUST_VALUE' as const;
  /** The offending numeric value. */
  readonly value: number;
  /** Whether the bad value came from caller input or from storage. */
  readonly source: 'input' | 'storage';

  constructor(value: number, source: 'input' | 'storage', message: string) {
    super(message);
    this.name = 'InvalidTrustValueError';
    this.value = value;
    this.source = source;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// FactReaderContractError
// ---------------------------------------------------------------------------

/**
 * Thrown when `FactReader.read()` returns `undefined`, violating the interface
 * contract which requires `{trust: number} | null`. This indicates a buggy
 * FactReader implementation.
 *
 * Extends `TypeError` to preserve the existing `instanceof TypeError` test assertion.
 */
export class FactReaderContractError extends TypeError {
  readonly code = 'FACT_READER_CONTRACT' as const;
  readonly factId: string;

  constructor(factId: string) {
    super(
      `applyFeedbackById: FactReader.read() returned undefined; the contract requires {trust:number} or null — check your FactReader implementation`,
    );
    this.name = 'FactReaderContractError';
    this.factId = factId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// UnhandledFeedbackEventError
// ---------------------------------------------------------------------------

/**
 * Thrown from the exhaustive `switch` `never` branch when a `FeedbackEvent`
 * value is encountered that is not handled by the union. Indicates either a
 * TypeScript type bug or a runtime cast from an untrusted source.
 *
 * Extends `TypeError` to preserve the existing `instanceof TypeError` test assertion.
 */
export class UnhandledFeedbackEventError extends TypeError {
  readonly code = 'UNHANDLED_FEEDBACK_EVENT' as const;

  constructor(event: string) {
    super(`applyFeedback: unhandled FeedbackEvent variant "${event}"`);
    this.name = 'UnhandledFeedbackEventError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
