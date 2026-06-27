/**
 * Typed errors for the representation layer.
 *
 * Mirrors the activities/errors.ts pattern: `code` discriminator for realm-safe
 * narrowing; `name` set to the domain class name; `Object.setPrototypeOf` guard
 * against bundlers that re-transpile to ES5.
 */

/**
 * Thrown when relation input validation fails (missing factIds, self-loop,
 * invalid relationKind, out-of-range weight/confidence).
 */
export class InvalidRelationError extends Error {
  readonly code = 'INVALID_RELATION' as const;
  /** Name of the failing input field. */
  readonly field: string;
  /** The invalid value that was provided. */
  readonly value: unknown;

  constructor(field: string, value: unknown, message: string) {
    super(message);
    this.name = 'InvalidRelationError';
    this.field = field;
    this.value = value;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
