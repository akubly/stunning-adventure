/**
 * Cursor error types for FactStore versioned cursor validation.
 *
 * ## Type scaffold — Roger's implementation needed at throw sites
 *
 * These class definitions are the ERROR CONTRACT that the FS-10a–g tests
 * import and assert against. Defining them here does NOT implement any cursor
 * behavior — the actual `throw` sites belong in:
 *   - `fact-store-sqlite.ts` → SqliteFactStore.search() scope-check path
 *   - `fact-store.contract.test.ts` → InMemoryFactStore.search() (RED test reference impl)
 *
 * Follows the M7-A error-hierarchy conventions (code discriminator, name override,
 * Object.setPrototypeOf guard for bundler safety).
 *
 * @see .squad/decisions/inbox/graham-slice-dplus-cursor-versioning.md §2
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

  constructor() {
    super(
      'Cursor scope fingerprint does not match current search parameters. ' +
        'Do not reuse cursors across different query/sessionId/minTrust/limit combinations.',
    );
    this.name = 'CursorScopeMismatchError';
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
