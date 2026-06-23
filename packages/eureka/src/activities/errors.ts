/**
 * Typed error hierarchy for Eureka activities (M7-A).
 *
 * ## Canonical narrowing pattern (F2)
 * Use `err.code === 'FACT_NOT_FOUND'` (and other code values) as the **primary** discriminator.
 * `instanceof` is a convenience shorthand that works within a single ESM realm but can fail
 * across realms (e.g., vm.runInNewContext). `code` is always realm-safe and is the pattern
 * M7-B narrowing tests will exercise. Do not rely on `instanceof` for programmatic narrowing
 * in shared or bundled code. (Package is ESM-only — no CJS build.)
 *
 * ## `.name` behaviour (F4)
 * All classes set `this.name` to the domain class name (e.g. `'InvalidTrustValueError'`),
 * intentionally diverging from the native base-class name (`'RangeError'`, `'TypeError'`).
 * This produces readable stack traces and domain-labelled structured logs. Any existing code
 * that branches on `err.name === 'RangeError'` will need to switch to `err.code` checks.
 *
 * All error classes carry:
 *   - `code` — string literal discriminator for realm-safe narrowing (primary)
 *   - `name` — domain class name (see above)
 *   - preserved original message text from pre-M7-A throw sites
 *   - `Object.setPrototypeOf(this, new.target.prototype)` — defensive guard against downstream
 *     bundlers that re-transpile to ES5, where class-extends breaks prototype chains
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
 * Thrown by `TrustUpdater.mutate()` when the requested fact does not exist in storage.
 * Prevents the mutation fn from being invoked for a non-existent fact.
 */
export class FactNotFoundError extends Error {
  readonly code = 'FACT_NOT_FOUND' as const;
  readonly factId: string;

  constructor(factId: string) {
    super(`applyFeedbackById: fact not found — factId="${factId}"`);
    this.name = 'FactNotFoundError';
    this.factId = factId;
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

  // message is caller-supplied rather than hard-coded — different throw sites can provide context-specific messages.
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
      `FactReader.read() returned undefined; the contract requires {trust:number} or null — check your FactReader implementation`,
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
  readonly event: string;

  constructor(event: string) {
    super(`applyFeedback: unhandled FeedbackEvent variant "${event}"`);
    this.name = 'UnhandledFeedbackEventError';
    this.event = event;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// InvalidImprintError
// ---------------------------------------------------------------------------

/**
 * Thrown when imprint input validation fails (empty content, out-of-range
 * trust/importance, invalid attentionTier).
 *
 * Follows the M7-A error pattern: code discriminator + field + value.
 * Does NOT extend RangeError/TypeError — these are domain validation errors,
 * not JS-type errors. Extends base Error (same as InvalidFeedbackOptionsError).
 */
export class InvalidImprintError extends Error {
  readonly code = 'INVALID_IMPRINT' as const;
  /** Name of the failing input field. */
  readonly field: string;
  /** The invalid value that was provided. */
  readonly value: unknown;

  constructor(field: string, value: unknown, message: string) {
    super(message);
    this.name = 'InvalidImprintError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
