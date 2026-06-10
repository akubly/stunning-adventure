/**
 * Cursor error types for FactStore versioned cursor validation.
 *
 * Defines the two error classes thrown at the cursor validation seam:
 *   - `CursorScopeMismatchError` — thrown by `FactStore.search()` when a v1 cursor's
 *     scope fingerprint does not match the current search parameters (query, sessionId,
 *     minTrust, limit). Throw site: `fact-store-sqlite.ts` scope-check + the
 *     InMemoryFactStore reference impl in `fact-store.contract.test.ts`.
 *   - `CursorVersionUnsupportedError` — thrown by `decodeCursor()` in `cursor.ts`
 *     when a cursor carries an unsupported `v` value (any present `v` that is not
 *     exactly 1, including v:0, floats, strings, and future versions > 1).
 *
 * Follows the M7-A error-hierarchy conventions (code discriminator, name override,
 * Object.setPrototypeOf guard for bundler safety).
 *
 * @see .squad/decisions.md (M8 Slice D+ — Cursor Versioning & Scope Fingerprint §2)
 */

// ---------------------------------------------------------------------------
// CursorScopeMismatchError
// ---------------------------------------------------------------------------

/**
 * Thrown by `FactStore.search()` when a v1 cursor's scope fingerprint does not
 * match the current search parameters (query, sessionId, minTrust, limit).
 *
 * This indicates the caller is reusing a cursor from a different search context —
 * undefined behavior that would silently return wrong results under offset pagination.
 *
 * Callers that intentionally restart pagination may catch this and retry from page 0.
 */
export class CursorScopeMismatchError extends Error {
  readonly code = 'CURSOR_SCOPE_MISMATCH' as const;
  readonly cursorScope: string;
  readonly currentScope: string;

  constructor(cursorScope: string, currentScope: string) {
    super(
      'Cursor scope fingerprint does not match current search parameters. ' +
        'Do not reuse cursors across different query/sessionId/minTrust/limit combinations. ' +
        `(cursorScope=${cursorScope}, currentScope=${currentScope})`,
    );
    this.name = 'CursorScopeMismatchError';
    this.cursorScope = cursorScope;
    this.currentScope = currentScope;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// CursorVersionUnsupportedError
// ---------------------------------------------------------------------------

/**
 * Thrown by `FactStore.search()` when a cursor carries a `v` field with an
 * unrecognised version number (i.e. v > 1 at time of writing). This protects
 * against a new-format cursor being passed to an old implementation that cannot
 * correctly interpret it.
 */
export class CursorVersionUnsupportedError extends Error {
  readonly code = 'CURSOR_VERSION_UNSUPPORTED' as const;
  readonly version: number;

  constructor(version: number) {
    super(
      `Cursor version ${version} is not supported by this implementation. ` +
        'Restart pagination from page 0.',
    );
    this.name = 'CursorVersionUnsupportedError';
    this.version = version;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
