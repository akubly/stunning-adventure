/**
 * cursor.ts unit tests — Slice D++ keyset pagination
 *
 * Focused unit coverage for encodeCursor / decodeCursor / scopeFingerprint.
 * These tests run against the pure utility functions only — no FactStore, no SQLite.
 *
 * Invariants covered:
 *   CU-1  v0 cursor (no `v` field) → NOW restart sentinel (v0 backward-compat deleted)
 *   CU-2  v1 keyset round-trip: encodeCursor({ lastSort, lastId, scope }) → decodeCursor
 *         → { version:1, lastSort, lastId, scope }
 *         CU-2a  normal round-trip
 *         CU-2b  version discriminant is 1
 *         CU-2c  bad lastSort (null/NaN in JSON) → restart sentinel
 *         CU-2d  bad lastSort (Infinity serialised as 1e309) → restart sentinel
 *         CU-2e  bad lastId (negative) → restart sentinel
 *         CU-2f  bad lastId (non-integer float) → restart sentinel
 *         CU-2g  missing lastId → restart sentinel
 *   CU-3  present-but-invalid version throws CursorVersionUnsupportedError (UNCHANGED)
 *         CU-3a  v:0  → throw
 *         CU-3b  v:2  → throw (future version)
 *         CU-3c  v:99 → throw (far future)
 *         CU-3d  v:"2" (string) → throw (not a number)
 *         CU-3e  v:1.5 (non-integer float) → throw
 *         CU-3f  v:null (NaN serializes to null in JSON) → throw
 *   CU-4  unparseable / non-base64 cursor → restart sentinel { version: 0 }
 *   CU-5  CursorVersionUnsupportedError re-throw path (UNCHANGED)
 *   CU-6  scopeFingerprint determinism (UNCHANGED)
 *   CU-7  scopeFingerprint injection-resistance (UNCHANGED)
 */

import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor, scopeFingerprint } from '../cursor.js';
import { CursorVersionUnsupportedError } from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

// ---------------------------------------------------------------------------
// CU-1 — v0 cursor (absent v field) → restart sentinel
//
// Slice D++ deleted v0 backward-compat: a cursor with no `v` key is treated
// as garbage and returns the restart sentinel { version: 0 }.
// Offset values in such cursors are NOT honored.
// ---------------------------------------------------------------------------

describe('decodeCursor — v0 (no v field) → restart sentinel (v0 backward-compat deleted)', () => {
  it('CU-1a: v0 cursor with valid offset → restart sentinel (offset NOT honored)', () => {
    const cursor = makeCursor({ offset: 5 });
    const result = decodeCursor(cursor);
    expect(result).toEqual({ version: 0 });
  });

  it('CU-1b: v0 cursor with extra non-v fields → restart sentinel (keys ignored)', () => {
    const cursor = makeCursor({ offset: 7, extra: 'ignored' });
    const result = decodeCursor(cursor);
    expect(result).toEqual({ version: 0 });
  });

  it('CU-1c: v0 cursor with bad offset → restart sentinel (same as any other v0)', () => {
    const cursor = makeCursor({ offset: -1 });
    const result = decodeCursor(cursor);
    expect(result).toEqual({ version: 0 });
  });
});

// ---------------------------------------------------------------------------
// CU-2 — v1 keyset round-trip
//
// encodeCursor takes an object param { lastSort, lastId, scope } to prevent
// silent swap of the two numeric args.  decodeCursor v1 branch returns
// { version:1, lastSort, lastId, scope } — no offset field.
//
// Bad keyset field values in an otherwise-valid v1 cursor:
//   - lastSort: must be a finite number; null/NaN/Infinity → restart sentinel
//   - lastId: must be a positive integer; negative/float/missing → restart sentinel
// ---------------------------------------------------------------------------

describe('encodeCursor / decodeCursor — v1 keyset round-trip', () => {
  it('CU-2a: encode({ lastSort, lastId, scope }) → decode → { version:1, lastSort, lastId, scope }', () => {
    const scope = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const encoded = encodeCursor({ lastSort: 42.5, lastId: 17, scope });
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual({ version: 1, lastSort: 42.5, lastId: 17, scope });
  });

  it('CU-2b: decoded cursor has version:1 discriminant', () => {
    const scope = scopeFingerprint('test', 'sess-123', 0.5, 5);
    const encoded = encodeCursor({ lastSort: 0, lastId: 1, scope });
    const decoded = decodeCursor(encoded);
    expect(decoded.version).toBe(1);
  });

  it('CU-2c: bad lastSort (null/NaN in JSON) in v1 cursor → restart sentinel', () => {
    // JSON.stringify({lastSort: NaN}) → {"lastSort":null} — the `v` key IS present.
    // A v1 cursor with non-finite lastSort must fall back to restart, not throw.
    const scope = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const raw = Buffer.from(
      JSON.stringify({ v: 1, lastSort: NaN, lastId: 5, scope }),
    ).toString('base64');
    expect(decodeCursor(raw)).toEqual({ version: 0 });
  });

  it('CU-2d: bad lastSort (Infinity via 1e309) in v1 cursor → restart sentinel', () => {
    const scope = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    // JSON.parse('{"v":1,"lastSort":1e309}') → { lastSort: Infinity }; exercises isFinite guard.
    const raw = Buffer.from(
      `{"v":1,"lastSort":1e309,"lastId":5,"scope":"${scope}"}`,
    ).toString('base64');
    expect(decodeCursor(raw)).toEqual({ version: 0 });
  });

  it('CU-2e: bad lastId (negative) in v1 cursor → restart sentinel', () => {
    const scope = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const raw = Buffer.from(
      JSON.stringify({ v: 1, lastSort: 1.5, lastId: -1, scope }),
    ).toString('base64');
    expect(decodeCursor(raw)).toEqual({ version: 0 });
  });

  it('CU-2f: bad lastId (non-integer float) in v1 cursor → restart sentinel', () => {
    const scope = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const raw = Buffer.from(
      JSON.stringify({ v: 1, lastSort: 1.5, lastId: 0.5, scope }),
    ).toString('base64');
    expect(decodeCursor(raw)).toEqual({ version: 0 });
  });

  it('CU-2g: missing lastId in v1 cursor → restart sentinel', () => {
    const scope = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const raw = Buffer.from(
      JSON.stringify({ v: 1, lastSort: 1.5, scope }),
    ).toString('base64');
    expect(decodeCursor(raw)).toEqual({ version: 0 });
  });
});

// ---------------------------------------------------------------------------
// CU-3 — present-but-invalid version → CursorVersionUnsupportedError
//
// decodeCursor throws CursorVersionUnsupportedError when the v field is
// present and numeric but is not the supported version (1).
// ---------------------------------------------------------------------------

describe('decodeCursor — present-but-invalid v field → CursorVersionUnsupportedError', () => {
  it('CU-3a: v:0 → throws CursorVersionUnsupportedError (not garbage)', () => {
    // v:0 is present and numeric — it is not v1, so it's an unsupported version.
    const cursor = makeCursor({ v: 0, offset: 0, scope: 'deadbeef00000000' });
    expect(() => decodeCursor(cursor)).toThrow(CursorVersionUnsupportedError);
  });

  it('CU-3b: v:2 → throws CursorVersionUnsupportedError (future version)', () => {
    const cursor = makeCursor({ v: 2, offset: 0, scope: 'deadbeef00000001' });
    expect(() => decodeCursor(cursor)).toThrow(CursorVersionUnsupportedError);
  });

  it('CU-3c: v:99 → throws CursorVersionUnsupportedError (far future)', () => {
    const cursor = makeCursor({ v: 99, offset: 0, scope: 'deadbeef00000002' });
    expect(() => decodeCursor(cursor)).toThrow(CursorVersionUnsupportedError);
  });

  it('CU-3d: v:"2" (string) → throws CursorVersionUnsupportedError', () => {
    // A string v is present — not garbage, but not a supported integer version.
    const cursor = makeCursor({ v: '2', offset: 0, scope: 'deadbeef00000003' });
    expect(() => decodeCursor(cursor)).toThrow(CursorVersionUnsupportedError);
  });

  it('CU-3e: v:1.5 (non-integer float) → throws CursorVersionUnsupportedError', () => {
    const cursor = makeCursor({ v: 1.5, offset: 0, scope: 'deadbeef00000004' });
    expect(() => decodeCursor(cursor)).toThrow(CursorVersionUnsupportedError);
  });

  it('CU-3f: v:null (including NaN-serialized-to-null) → throws CursorVersionUnsupportedError', () => {
    // JSON.stringify({v: NaN}) → {"v":null} — the v key IS present (value null).
    // A present v key that is not exactly 1 must throw per the approved contract.
    const raw = Buffer.from('{"v":null,"offset":0}').toString('base64');
    expect(() => decodeCursor(raw)).toThrow(CursorVersionUnsupportedError);
  });
});

// ---------------------------------------------------------------------------
// CU-4 — unparseable / non-base64 / structurally garbage cursor → restart sentinel
//
// Restart sentinel is { version: 0 } — no offset field.
// decodeCursor returns exactly { version: 0 } for all garbage inputs (keyset
// does not use an offset field, so no extra properties appear on the sentinel).
// ---------------------------------------------------------------------------

describe('decodeCursor — garbage input → restart sentinel { version: 0 }', () => {
  it('CU-4a: random non-base64 string → restart sentinel', () => {
    expect(decodeCursor('not-valid-base64!!!')).toEqual({ version: 0 });
  });

  it('CU-4b: valid base64 but non-JSON content → restart sentinel', () => {
    const cursor = Buffer.from('hello, not json').toString('base64');
    expect(decodeCursor(cursor)).toEqual({ version: 0 });
  });

  it('CU-4c: empty string → restart sentinel', () => {
    expect(decodeCursor('')).toEqual({ version: 0 });
  });
});

// ---------------------------------------------------------------------------
// CU-5 — CursorVersionUnsupportedError re-throw path
// ---------------------------------------------------------------------------

describe('decodeCursor — CursorVersionUnsupportedError is re-thrown, not swallowed', () => {
  it('CU-5: v:99 in catch path → re-throws, not returns offset:0', () => {
    const cursor = makeCursor({ v: 99, offset: 5, scope: 'deadbeef12345678' });
    let threw = false;
    try {
      decodeCursor(cursor);
    } catch (err) {
      threw = true;
      expect(err).toBeInstanceOf(CursorVersionUnsupportedError);
    }
    expect(threw).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CU-6 — scopeFingerprint determinism
// ---------------------------------------------------------------------------

describe('scopeFingerprint — determinism', () => {
  it('CU-6a: same params → identical fingerprint on repeated calls', () => {
    const fp1 = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const fp2 = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    expect(fp1).toBe(fp2);
  });

  it('CU-6b: different query → different fingerprint', () => {
    const fp1 = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const fp2 = scopeFingerprint('search', 'sess-abc', 0.15, 10);
    expect(fp1).not.toBe(fp2);
  });

  it('CU-6c: different sessionId → different fingerprint', () => {
    const fp1 = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    const fp2 = scopeFingerprint('recall', 'sess-xyz', 0.15, 10);
    expect(fp1).not.toBe(fp2);
  });

  it('CU-6d: fingerprint is a 16-char hex string', () => {
    const fp = scopeFingerprint('recall', 'sess-abc', 0.15, 10);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});

// ---------------------------------------------------------------------------
// CU-7 — scopeFingerprint injection-resistance (Fix B)
//
// With the old newline-delimited format, a query containing '\nsessionId='
// could collide with a different (query, sessionId) pair.
// JSON.stringify encoding is unambiguous — no such collision is possible.
// ---------------------------------------------------------------------------

describe('scopeFingerprint — injection resistance (Fix B)', () => {
  it('CU-7: query="x\\nsessionId=evil" + sessionId="good" does NOT collide with query="x" + sessionId="\\nsessionId=evil\\ngood"', () => {
    // Old newline format: canonical("x\nsessionId=evil", "good", ...)
    //   = "query=x\nsessionId=evil\nsessionId=good\n..."
    // Old newline format: canonical("x", "\nsessionId=evil\ngood", ...)
    //   = "query=x\nsessionId=\nsessionId=evil\ngood\n..."
    // These differ by one char in the old format (may collide with crafted input).
    // With JSON.stringify they are unambiguously distinct JSON objects.
    const fp1 = scopeFingerprint('x\nsessionId=evil', 'good', 0.15, 10);
    const fp2 = scopeFingerprint('x', '\nsessionId=evil\ngood', 0.15, 10);
    // Must not collide regardless of format
    expect(fp1).not.toBe(fp2);
  });

  it('CU-7b: query containing JSON reserved chars does not break fingerprint', () => {
    // JSON.stringify properly escapes quotes, backslashes, etc.
    const fp = scopeFingerprint('"quoted"', 'sess', 0.15, 10);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });
});
