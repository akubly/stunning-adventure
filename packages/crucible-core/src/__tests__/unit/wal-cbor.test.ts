/**
 * RED PHASE — Canonical CBOR encoding for WAL payload hashing (issue #60).
 *
 * §3.2/§3.3 specify: payloadHash = BLAKE3(CBOR(primitivePayload)),
 *                    readSetHash = BLAKE3(CBOR(causalReadSet)).
 * envelopeCbor must store genuinely CBOR-encoded data, not raw UTF-8.
 *
 * Encoding profile: Crucible canonical CBOR profile (CTD §3.2/§3.3).
 *   = RFC 8949 §4.2.1 map-key ordering + shortest integers
 *   + forced IEEE-754 binary64 for all non-integer numbers (deviation from
 *     §4.2.1's shortest-float rule, for cross-language reproducibility).
 *
 * CBOR-1: payloadHash is stable under key insertion order (canonical CBOR).
 *   Two objects with same data in different key order must produce the same hash.
 *   Currently FAILS: JSON.stringify is key-order-sensitive.
 *
 * CBOR-2: envelopeCbor in FS backend stores genuine CBOR-encoded primitiveKind.
 *   After write+read, the envelopeCbor first byte must be a CBOR text string header (0x6b for 11 chars).
 *   Currently FAILS: stored as raw UTF-8 (first byte 0x6f = 'o').
 *
 * CBOR-4 to CBOR-9: Golden vectors — pin exact CBOR bytes + BLAKE3 so a
 *   future regression (e.g. cborg major bump, encoding option change) produces
 *   a RED test, and a second-language implementation can reproduce byte-for-byte.
 *
 * CBOR-8: UnsupportedCborTypeError — non-JSON-like types (Date, Map, etc.) are
 *   rejected at encode time rather than silently producing corrupt output.
 */

import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { InMemoryWalBackend } from '../../ledger/wal-backend-in-memory.js';
import { createFileSystemWalBackend } from '../../ledger/wal-backend-fs.js';
import { encodeCbor, UnsupportedCborTypeError } from '../../ledger/wal/cbor.js';
import { hashBytes } from '../../ledger/wal/hash.js';
import type { PrimitiveInput } from '../../types.js';

const dirs: string[] = [];

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-cbor-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function commit() {
  return { verdict: 'COMMIT' as const, hookId: null };
}

describe('WAL CBOR encoding (issue #60)', () => {
  it('CBOR-1: payloadHash stable under key insertion order (canonical CBOR, InMemory)', async () => {
    const b1 = new InMemoryWalBackend();
    const b2 = new InMemoryWalBackend();
    const makeRow = (payload: unknown): PrimitiveInput => ({
      primitiveKind: 'observation',
      primitivePayload: payload,
      causalReadSet: [],
    });

    await b1.commitRow(makeRow({ b: 2, a: 1 }), commit());
    await b2.commitRow(makeRow({ a: 1, b: 2 }), commit());

    const recs1 = b1.readSegmentRecords();
    const recs2 = b2.readSegmentRecords();

    expect(recs1).toHaveLength(1);
    expect(recs2).toHaveLength(1);
    expect(Buffer.from(recs1[0].payloadHash).toString('hex'))
      .toBe(Buffer.from(recs2[0].payloadHash).toString('hex'));
  });

  it('CBOR-2: envelopeCbor in FS backend stores CBOR-encoded primitiveKind (not raw UTF-8)', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(
      { primitiveKind: 'observation', primitivePayload: { x: 1 }, causalReadSet: [] },
      commit(),
    );
    await backend.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs = reader.readSegmentRecords();
    expect(recs).toHaveLength(1);
    // 0x6b = CBOR major type 3 (0x60) | len 11 (0x0b) = 0x6b; "observation" is 11 chars
    // so the header byte is 0x6b followed by 11 UTF-8 payload bytes = 12 bytes total
    expect(recs[0].envelopeCbor[0]).toBe(0x6b);
    expect(recs[0].envelopeCbor.length).toBe(12);
    await reader.close();
  });

  it('CBOR-3: round-trip — FS backend write/reopen preserves complex payload with nested objects', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const payload = { nested: { key: 'value', arr: [1, 2, 3] }, top: 'field' };
    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(
      { primitiveKind: 'observation', primitivePayload: payload, causalReadSet: [] },
      commit(),
    );
    await backend.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const rows = await reader.readRows({ range: [0, 0] });
    expect(rows).toHaveLength(1);
    expect(rows[0].primitivePayload).toEqual(payload);
    await reader.close();
  });
});

// ─── Golden vectors — Crucible canonical CBOR profile ─────────────────────────
//
// Pin exact CBOR bytes + BLAKE3 so a future regression (e.g. cborg major bump,
// encoding option change) produces a RED test, and a second-language impl can
// reproduce canonical form byte-for-byte for BOTH encoding AND hashing.

describe('CBOR golden vectors (Crucible canonical CBOR profile)', () => {
  // RFC 8949 §4.2.1 plain-bytewise ordering of encoded map keys:
  //   "z"  encodes as 0x61 0x7a (2 bytes)
  //   "aa" encodes as 0x62 0x61 0x61 (3 bytes)
  //   Bytewise comparison: 0x61 < 0x62 → "z" sorts FIRST regardless of
  //   insertion order.  This differs from JS lexicographic order ("aa" < "z").
  it('CBOR-4: map with differing-length keys — z before aa (RFC 8949 bytewise ordering)', () => {
    const v1 = encodeCbor({ aa: 1, z: 2 });
    expect(Buffer.from(v1).toString('hex')).toBe('a2617a0262616101');
    // A3: pin BLAKE3 so cross-impl reproduction covers both encoding AND hashing
    expect(Buffer.from(hashBytes(v1)).toString('hex'))
      .toBe('019d473cc09257855925ff98a82dac52898c7ded08fe0b35b14428b6d498a818');
  });

  it('CBOR-5: nested map — keys sorted at every level, integer small-encoding', () => {
    // "top"    encodes as 0x63 + "top"    = 4 bytes
    // "nested" encodes as 0x66 + "nested" = 7 bytes → "top" comes first
    // inner:   "a" (2 bytes) before "bb" (3 bytes)
    // 42 small-int → 0x18 0x2a (1-byte tag + 1-byte value)
    const v2 = encodeCbor({ nested: { bb: 2, a: 1 }, top: 42 });
    expect(Buffer.from(v2).toString('hex'))
      .toBe('a263746f70182a666e6573746564a261610162626202');
    expect(Buffer.from(hashBytes(v2)).toString('hex'))
      .toBe('ca3a08eebcc2b8da9850edaf204d824b91300b7e2fedfaea6f7412b7f4978ad4');
  });

  it('CBOR-6: integer 1 uses smallest encoding (0x01)', () => {
    const v3 = encodeCbor(1);
    expect(Buffer.from(v3).toString('hex')).toBe('01');
    expect(Buffer.from(hashBytes(v3)).toString('hex'))
      .toBe('48fc721fbbc172e0925fa27af1671de225ba927134802998b10a1568a188652b');
  });

  it('CBOR-7: string "hello" encodes as CBOR text string', () => {
    const v4 = encodeCbor('hello');
    // 0x65 = CBOR major type 3 (text) | len 5; then 5 UTF-8 bytes
    expect(Buffer.from(v4).toString('hex')).toBe('6568656c6c6f');
    expect(Buffer.from(hashBytes(v4)).toString('hex'))
      .toBe('90eeb71f0d4b768a5d449e30035beb7ffccd75d228e5b38e8e9cbfaa01ddfae9');
  });

  it('CBOR-9: fractional 1.5 encodes as IEEE-754 binary64 (forced float64, not float16)', () => {
    // Crucible profile forces float64 for ALL non-integer numbers.
    // float16 encoding of 1.5 would be f93e00 (3 bytes); float64 is fb + 8 bytes.
    // Pin both bytes and BLAKE3 so a cross-impl change from float64→float16 is caught.
    const v = encodeCbor(1.5);
    expect(Buffer.from(v).toString('hex')).toBe('fb3ff8000000000000');
    expect(Buffer.from(hashBytes(v)).toString('hex'))
      .toBe('02a6136608c9b30d4e355cf9cd9911808f3997eb4cc351c7e0d08f89a74f90c5');
  });

  it('CBOR-4b: key ordering is stable regardless of insertion order', () => {
    const a = encodeCbor({ aa: 1, z: 2 });
    const b = encodeCbor({ z: 2, aa: 1 });
    expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'));
  });
});

// ─── Unsupported types (I8) ───────────────────────────────────────────────────

describe('CBOR encodeCbor — unsupported type rejection (I8)', () => {
  it('CBOR-8a: Date is rejected with UnsupportedCborTypeError', () => {
    expect(() => encodeCbor(new Date())).toThrow(UnsupportedCborTypeError);
    expect(() => encodeCbor(new Date())).toThrow(/Date/);
  });

  it('CBOR-8b: Map is rejected with UnsupportedCborTypeError', () => {
    expect(() => encodeCbor(new Map([['key', 1]]))).toThrow(UnsupportedCborTypeError);
    expect(() => encodeCbor(new Map())).toThrow(/Map/);
  });

  it('CBOR-8c: Set is rejected with UnsupportedCborTypeError', () => {
    expect(() => encodeCbor(new Set([1, 2]))).toThrow(UnsupportedCborTypeError);
    expect(() => encodeCbor(new Set())).toThrow(/Set/);
  });

  it('CBOR-8d: class instance with non-plain prototype is rejected', () => {
    class Foo { x = 1; }
    expect(() => encodeCbor(new Foo())).toThrow(UnsupportedCborTypeError);
    expect(() => encodeCbor(new Foo())).toThrow(/Foo/);
  });

  it('CBOR-8e: nested unsupported type is rejected', () => {
    expect(() => encodeCbor({ a: { b: new Date() } })).toThrow(UnsupportedCborTypeError);
  });

  it('CBOR-8f: NaN is rejected (non-finite number)', () => {
    expect(() => encodeCbor(NaN)).toThrow(UnsupportedCborTypeError);
  });

  it('CBOR-8g: plain objects and arrays still encode correctly after type guard', () => {
    const result = encodeCbor({ arr: [1, 'two', null, true], obj: { x: 0 } });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─── Hot-path micro-benchmark (A2) ───────────────────────────────────────────
//
// Measures the cost of the validate+encode+hash hot path in a single
// traversal (no separate assertJsonLike pre-pass). Emits timing to stdout so
// regressions are observable in CI output across runs. Not a hard SLA, but
// the sanity-bound of < 500 µs/op catches catastrophic slowdowns.

describe('CBOR hot-path micro-benchmark', () => {
  it('PERF-1: encode+hash throughput (validate-inline single-pass)', () => {
    const N = 2_000;
    const payload = { sessionId: 'bench-session', offset: 42, nested: { x: 1, y: 'hello' }, arr: [1, 2, 3] };

    // Warm up
    for (let i = 0; i < 50; i++) { hashBytes(encodeCbor(payload)); }

    const start = performance.now();
    for (let i = 0; i < N; i++) {
      hashBytes(encodeCbor(payload));
    }
    const elapsedMs = performance.now() - start;
    const perOpUs = (elapsedMs / N) * 1000;

    console.log(
      `[PERF-1] encodeCbor+hashBytes ×${N}: ` +
      `${elapsedMs.toFixed(1)}ms total, ${perOpUs.toFixed(2)}µs/op`,
    );
    // Sanity bound: < 500 µs/op on any modern hardware. Catastrophic regressions
    // (e.g. double-traversal accidentally re-introduced) will exceed this easily.
    expect(perOpUs).toBeLessThan(500);
  });
});
