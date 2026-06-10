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
 * | Decoded payload                        | Behavior                              |
 * |----------------------------------------|---------------------------------------|
 * | Valid JSON, missing `v`, numeric offset | v0 — offset honored, no scope check   |
 * | `v: 1`, valid offset, valid scope       | v1 — scope fingerprint check in search |
 * | `v: N` where N > 1                      | throw CursorVersionUnsupportedError    |
 * | Unparseable / missing offset            | return { version: 0, offset: 0 }       |
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
  const canonical = `query=${query}\nsessionId=${sessionId}\nminTrust=${minTrust}\nlimit=${limit}`;
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
// Throws CursorVersionUnsupportedError for v > 1 (unknown future version).
// Returns { version: 0, offset: 0 } for structurally garbage input (FS-SE-3).
// ---------------------------------------------------------------------------

export function decodeCursor(cursor: string): DecodedCursor {
  try {
    const raw = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Record<string, unknown>;

    const v = raw['v'];

    if (v === undefined || v === null) {
      // v0 legacy path — honor offset as-is, no scope field expected.
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
    }

    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      // Unrecognisable v field type → treat as garbage.
      return { version: 0, offset: 0 };
    }

    if (v > 1) {
      throw new CursorVersionUnsupportedError(v);
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
  } catch (err) {
    if (err instanceof CursorVersionUnsupportedError) {
      throw err; // re-throw — not garbage, intentional version rejection
    }
    return { version: 0, offset: 0 };
  }
}
