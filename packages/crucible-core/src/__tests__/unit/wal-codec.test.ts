/**
 * RED PHASE — Segment record binary framing: encode ↔ decode round-trip.
 *
 * Sub-seam scope  : §3.2 segment record fixed-prefix fields only.
 *                   Conditional fields (hookVerdictWitness, contextWindow*)
 *                   are tested in follow-on cycles after §6 enum is locked.
 * TDD Strategy    : §4 Walkthrough B, Lane 1 — WAL substrate internals
 *                   (docs/crucible-tdd-strategy.md)
 * Locked Decision : OQ-2 FEDERATE — Crucible owns its own binary WAL substrate.
 * Seam constraint : Does NOT touch Ledger.append() or HookBus — sub-seam only.
 *
 * This test MUST FAIL with "Cannot find module" until codec.ts is created.
 *
 * Invariants exercised:
 *   1. encode → decode is a lossless round-trip for all fixed-prefix fields.
 *   2. Decoding a buffer with wrong magic (first 4 bytes) throws InvalidMagicError.
 *   3. Magic constant is exactly 0x57414C31 ("WAL1").
 *   4. recordLen field equals total encoded byte length minus 4 (excludes magic).
 */

import { describe, it, expect } from 'vitest';

import {
  encodeRecord,
  decodeRecord,
  InvalidMagicError,
  InvalidRecordLengthError,
  MAGIC,
} from '../../ledger/wal/codec.js';
import type { SegmentRecord } from '../../ledger/wal/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHash(fill: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, () => fill);
}

function makeRecord(overrides: Partial<SegmentRecord> = {}): SegmentRecord {
  return {
    commitOffset: 7n,
    timestampNs: 1_700_000_000_000_000_000n,
    primitiveKind: 0x01,
    hookVerdict: 0x00, // continue
    flags: {
      bootstrap: false,
      declaredWindow: false,
      syntheticOutput: false,
      taskBoundary: true,
      manifestRoot: false,
    },
    prevRoot: makeHash(0xaa),
    selfRoot: makeHash(0xbb),
    payloadHash: makeHash(0xcc),
    readSetHash: makeHash(0xdd),
    envelopeCbor: new Uint8Array([0x01, 0x02, 0x03]),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WAL codec — segment record framing', () => {
  it('Unit: WAL codec encode→decode round-trips all fixed-prefix fields', () => {
    const original = makeRecord();
    const buf = encodeRecord(original);
    const decoded = decodeRecord(buf);

    expect(decoded.commitOffset).toBe(original.commitOffset);
    expect(decoded.timestampNs).toBe(original.timestampNs);
    expect(decoded.primitiveKind).toBe(original.primitiveKind);
    expect(decoded.hookVerdict).toBe(original.hookVerdict);

    // flags round-trip
    expect(decoded.flags.bootstrap).toBe(original.flags.bootstrap);
    expect(decoded.flags.declaredWindow).toBe(original.flags.declaredWindow);
    expect(decoded.flags.syntheticOutput).toBe(original.flags.syntheticOutput);
    expect(decoded.flags.taskBoundary).toBe(original.flags.taskBoundary);
    expect(decoded.flags.manifestRoot).toBe(original.flags.manifestRoot);

    // hash fields
    expect(decoded.prevRoot).toEqual(original.prevRoot);
    expect(decoded.selfRoot).toEqual(original.selfRoot);
    expect(decoded.payloadHash).toEqual(original.payloadHash);
    expect(decoded.readSetHash).toEqual(original.readSetHash);

    // variable tail
    expect(decoded.envelopeCbor).toEqual(original.envelopeCbor);
  });

  it('Unit: WAL codec MAGIC constant equals 0x57414C31 (ASCII "WAL1")', () => {
    expect(MAGIC).toBe(0x57414c31);
  });

  it('Unit: WAL codec encoded buffer starts with magic bytes', () => {
    const buf = encodeRecord(makeRecord());
    const magic = buf.readUInt32BE(0);
    expect(magic).toBe(MAGIC);
  });

  it('Unit: WAL codec recordLen equals total byte length minus 4 (excludes magic)', () => {
    const buf = encodeRecord(makeRecord());
    const recordLen = buf.readUInt32LE(4);
    expect(recordLen).toBe(buf.length - 4);
  });

  it('Unit: WAL codec decodeRecord throws InvalidMagicError when magic bytes are wrong', () => {
    const buf = encodeRecord(makeRecord());
    buf.writeUInt32BE(0xdeadbeef, 0); // corrupt magic
    expect(() => decodeRecord(buf)).toThrow(InvalidMagicError);
  });

  it('Unit: WAL codec encodes commitOffset=0 and timestampNs=0 correctly', () => {
    const r = makeRecord({ commitOffset: 0n, timestampNs: 0n });
    const decoded = decodeRecord(encodeRecord(r));
    expect(decoded.commitOffset).toBe(0n);
    expect(decoded.timestampNs).toBe(0n);
  });

  it('Unit: WAL codec handles empty envelopeCbor', () => {
    const r = makeRecord({ envelopeCbor: new Uint8Array(0) });
    const decoded = decodeRecord(encodeRecord(r));
    expect(decoded.envelopeCbor).toEqual(new Uint8Array(0));
  });
});

// ─── I4: aliased hash views ───────────────────────────────────────────────────
//
// decodeRecord returns hash fields as Uint8Array VIEWS into the source buffer.
// Mutating the source buffer after decode corrupts the decoded hash fields.
// Fix: .slice() all four hash fields so they are owned copies.

describe('WAL codec — I4 hash fields are owned copies (not aliased views)', () => {
  it('I4: mutating the source buffer after decode does NOT corrupt decoded hash fields', () => {
    const original = makeRecord();
    const buf = encodeRecord(original);

    const decoded = decodeRecord(buf);

    // Capture original hash values before mutation
    const prevRootBefore   = Array.from(decoded.prevRoot);
    const selfRootBefore   = Array.from(decoded.selfRoot);
    const payloadBefore    = Array.from(decoded.payloadHash);
    const readSetBefore    = Array.from(decoded.readSetHash);

    // Corrupt every byte of the source buffer
    buf.fill(0xff);

    // Decoded hash fields must be unchanged (owned copies, not views)
    expect(Array.from(decoded.prevRoot)).toEqual(prevRootBefore);
    expect(Array.from(decoded.selfRoot)).toEqual(selfRootBefore);
    expect(Array.from(decoded.payloadHash)).toEqual(payloadBefore);
    expect(Array.from(decoded.readSetHash)).toEqual(readSetBefore);
  });
});

// ─── T3: recordLen validation ─────────────────────────────────────────────────

describe('WAL codec — T3 recordLen validation (InvalidRecordLengthError)', () => {
  it('T3: decodeRecord throws InvalidRecordLengthError when recordLen is too small (negative envelopeLen)', () => {
    const buf = encodeRecord(makeRecord());
    // recordLen < 156 would produce a negative envelopeLen; set to 10
    buf.writeUInt32LE(10, 4);
    expect(() => decodeRecord(buf)).toThrow(InvalidRecordLengthError);
  });

  it('T3: decodeRecord throws InvalidRecordLengthError when recordLen exceeds buffer size', () => {
    const buf = encodeRecord(makeRecord());
    // recordLen claims more bytes than the buffer holds
    buf.writeUInt32LE(buf.length + 100, 4);
    expect(() => decodeRecord(buf)).toThrow(InvalidRecordLengthError);
  });
});
