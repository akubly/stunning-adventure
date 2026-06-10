/**
 * Cursor utilities — v1 versioned cursor encoding/decoding + scope fingerprint.
 *
 * ## Wire format
 *
 * v0 (legacy): base64(JSON `{ offset: number }`)            — no `v` field
 * v1 (current): base64(JSON `{ v: 1, offset: number, scope: string }`)
 *
 * ## Version dispatch
 *
 * | Decoded payload                        | Behavior                                   |
 * |----------------------------------------|--------------------------------------------|
 * | Valid JSON, `v` key not present, numeric offset | v0 — offset honored, no scope check        |
 * | `v: 1`, valid offset, valid scope               | v1 — scope fingerprint check in search     |
 * | `v` key present but not exactly 1               | throw CursorVersionUnsupportedError        |
 * | `v: N` where N > 1                              | throw CursorVersionUnsupportedError        |
 * | Unparseable / missing offset                    | return { version: 0, offset: 0 }           |
 *
 * Any present `v` key that is not exactly the integer 1 (including null, v:0,
 * floats, strings, future versions > 1) is treated as a contract violation and
 * throws.  Only a truly ABSENT `v` key is treated as a legacy v0 cursor.
 * Completely unparseable/non-JSON input still falls back to offset 0.
 *
 * @see .squad/decisions/inbox/graham-slice-dplus-cursor-versioning.md §1
 */

import { createHash } from 'node:crypto';
import { CursorVersionUnsupportedError } from './errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DecodedCursor =
  | { version: 0; offset: number }
  | { version: 1; offset: number; scope: string };

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
// Emits a v1 cursor string.  scope must be the result of scopeFingerprint().
// ---------------------------------------------------------------------------

export function encodeCursor(offset: number, scope: string): string {
  return Buffer.from(JSON.stringify({ v: 1, offset, scope })).toString('base64');
}

// ---------------------------------------------------------------------------
// decodeCursor
//
// Returns a DecodedCursor discriminated union.
// Throws CursorVersionUnsupportedError for any present v that is not exactly 1.
// Returns { version: 0, offset: 0 } for structurally garbage input (FS-SE-3).
// ---------------------------------------------------------------------------

export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Record<string, unknown>;

    const v = raw['v'];

    if (Object.hasOwn(raw, 'v')) {
      // v key is PRESENT — must be exactly the integer 1 (v1 format).
      // null, 0, negatives, floats, strings, future versions > 1 → throw.
      // Only a truly absent v key (legacy v0 cursors) falls through to the v0 path.
      if (typeof v !== 'number' || !Number.isInteger(v) || v !== 1) {
        throw new CursorVersionUnsupportedError(typeof v === 'number' ? v : NaN);
      }

      // v === 1
      const rawOffset = raw['offset'];
      const offset =
        typeof rawOffset === 'number' &&
        Number.isFinite(rawOffset) &&
        Number.isInteger(rawOffset) &&
        rawOffset >= 0
          ? rawOffset
          : 0;

      const rawScope = raw['scope'];
      const scope = typeof rawScope === 'string' ? rawScope : '';

      return { version: 1, offset, scope };
    }

    // v key absent → v0 legacy path — honor offset as-is, no scope field expected.
    const offset = raw['offset'];
    return {
      version: 0,
      offset:
        typeof offset === 'number' &&
        Number.isFinite(offset) &&
        Number.isInteger(offset) &&
        offset >= 0
          ? offset
          : 0,
    };
  } catch (err) {
    if (err instanceof CursorVersionUnsupportedError) {
      throw err; // re-throw — not garbage, intentional version rejection
    }
    return { version: 0, offset: 0 };
  }
}
