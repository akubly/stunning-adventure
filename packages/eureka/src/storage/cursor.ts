/**
 * Cursor utilities — v1 keyset cursor encoding/decoding + scope fingerprint.
 *
 * ## Wire format
 *
 * v1 (current): base64(JSON `{ v: 1, lastSort: number, lastId: number, scope: string }`)
 *   lastSort = composite score of the last returned row: (-bm25_score) * trust
 *   lastId   = fact row id (autoincrement integer) of the last returned row
 *   scope    = scopeFingerprint(query, sessionId, minTrust, limit) — 16-char hex digest
 *
 * ## Version dispatch
 *
 * | Decoded payload                                                  | Behavior                                        |
 * |------------------------------------------------------------------|-------------------------------------------------|
 * | `v: 1`, finite lastSort, positive-integer lastId, string scope   | v1 keyset — advance past (lastSort, lastId)     |
 * | `v: 1`, invalid lastSort, lastId, or missing/non-string scope    | restart sentinel `{ version: 0 }` (page 1)     |
 * | `v` key present but not exactly integer 1                        | throw CursorVersionUnsupportedError             |
 * | `v` key absent (legacy v0 / any garbage)                         | restart sentinel `{ version: 0 }` (page 1)     |
 * | Unparseable / non-JSON / non-base64                              | restart sentinel `{ version: 0 }` (page 1)     |
 *
 * v0 backward-compat is DELETED (Slice D++): a cursor with no `v` field is now treated
 * as garbage and returns the restart sentinel — the offset it may carry is NOT honored.
 * Any present `v` key that is not exactly the integer 1 throws CursorVersionUnsupportedError.
 *
 * @see .squad/decisions/inbox/crispin-dpp-keyset-green.md
 */

import { createHash } from 'node:crypto';
import { CursorVersionUnsupportedError } from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecodedCursor =
  | { version: 0 }
  | { version: 1; lastSort: number; lastId: number; scope: string };

// Shared restart sentinel — returned for all garbage / invalid-field / missing-field cases.
const RESTART: DecodedCursor = { version: 0 };

// ---------------------------------------------------------------------------
// Scope fingerprint
//
// SHA-256 hex (first 16 chars) of canonical scope string.
// Pure function — no I/O, no randomness.  Unit-testable in isolation.
// ---------------------------------------------------------------------------

export function scopeFingerprint(
  query: string,
  sessionId: string,
  minTrust: number,
  limit: number,
): string {
  const canonical = JSON.stringify({ query, sessionId, minTrust, limit });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// encodeCursor
//
// Emits a v1 keyset cursor.  Takes a single named-fields object to prevent
// silent swapping of the two numeric args (lastSort/lastId are the same type).
//   lastSort — composite score of the last row on the current page: (-bm25) * trust
//   lastId   — row id (autoincrement integer) of the last row on the current page
//   scope    — result of scopeFingerprint() for the current search params
// ---------------------------------------------------------------------------

export function encodeCursor({ lastSort, lastId, scope }: {
  lastSort: number;
  lastId: number;
  scope: string;
}): string {
  return Buffer.from(JSON.stringify({ v: 1, lastSort, lastId, scope })).toString('base64');
}

// ---------------------------------------------------------------------------
// decodeCursor
//
// Returns a DecodedCursor discriminated union.
//
// Throws CursorVersionUnsupportedError for any present `v` that is not exactly 1.
// Returns the restart sentinel { version: 0 } for:
//   - Structurally garbage / non-parseable input (FS-SE-3)
//   - v-absent payload (legacy v0 — backward-compat deleted, Slice D++)
//   - v=1 with invalid lastSort (non-finite), invalid lastId (non-positive-integer),
//     or missing/non-string scope (structural corruption → soft-fail, not throw)
// ---------------------------------------------------------------------------

export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Record<string, unknown>;

    const v = raw['v'];

    if (Object.hasOwn(raw, 'v')) {
      // v key is PRESENT — must be exactly the integer 1 (v1 keyset format).
      // null, 0, negatives, floats, strings, future versions → throw (contract violation).
      if (typeof v !== 'number' || !Number.isInteger(v) || v !== 1) {
        throw new CursorVersionUnsupportedError(v);
      }

      // v === 1 — validate all keyset fields; any bad/missing value → restart sentinel.
      const rawLastSort = raw['lastSort'];
      if (typeof rawLastSort !== 'number' || !Number.isFinite(rawLastSort)) {
        return RESTART;
      }

      const rawLastId = raw['lastId'];
      if (
        typeof rawLastId !== 'number' ||
        !Number.isInteger(rawLastId) ||
        rawLastId <= 0
      ) {
        return RESTART;
      }

      const rawScope = raw['scope'];
      // Missing or non-string scope is structural corruption → restart (not a caller-param
      // mismatch). The genuine scope-mismatch case — valid string scope that doesn't match
      // the current params — is caught by the scope fingerprint check in SqliteFactStore
      // and throws CursorScopeMismatchError.
      if (typeof rawScope !== 'string') {
        return RESTART;
      }

      return { version: 1, lastSort: rawLastSort, lastId: rawLastId, scope: rawScope };
    }

    // v key absent → legacy v0 cursor (backward-compat deleted Slice D++) → restart.
    // The offset field, if present, is intentionally NOT honored.
    return RESTART;
  } catch (err) {
    if (
      err !== null &&
      typeof err === 'object' &&
      (err as { code?: unknown }).code === 'CURSOR_VERSION_UNSUPPORTED'
    ) {
      throw err; // re-throw — not garbage, intentional version rejection
    }
    return RESTART;
  }
}
