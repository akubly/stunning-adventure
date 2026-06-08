/**
 * WAL segment record binary codec — encode/decode the fixed-prefix framing.
 *
 * Binary layout (all multi-byte integers are little-endian unless noted):
 *
 *  [0-3]    magic          4 B  big-endian u32 = 0x57414C31 ("WAL1")
 *  [4-7]    recordLen      4 B  LE u32; total byte length excluding magic
 *  [8-15]   commitOffset   8 B  LE u64 (bigint)
 *  [16-23]  timestampNs    8 B  LE u64 (bigint)
 *  [24]     primitiveKind  1 B  u8
 *  [25]     hookVerdict    1 B  u8
 *  [26-27]  flags          2 B  LE u16 bitfield (see SegmentRecordFlags)
 *  [28-59]  prevRoot      32 B  BLAKE3
 *  [60-91]  selfRoot      32 B  BLAKE3
 *  [92-123] payloadHash   32 B  BLAKE3
 *  [124-155] readSetHash  32 B  BLAKE3
 *  [156 …]  envelopeCbor   var  CBOR envelope tail (may be empty)
 *  [last-3…last] crc32c   4 B  placeholder 0x00000000 (real computation deferred)
 *
 * Conditional fields (hookVerdictWitness, contextWindowCommitment,
 * commitmentMethod) are deferred until §6 primitive enum is locked.
 */

import type { SegmentRecord, SegmentRecordFlags } from './types.js';
import { encodeFlags } from './flags.js';

export const MAGIC = 0x57414c31 as const;

/** Thrown by decodeRecord when the first four bytes are not MAGIC. */
export class InvalidMagicError extends Error {
  constructor(found: number) {
    super(`Invalid WAL magic: expected 0x${MAGIC.toString(16)}, got 0x${found.toString(16)}`);
    this.name = 'InvalidMagicError';
  }
}

// Byte offsets for fixed-prefix fields
const OFF_MAGIC         = 0;
const OFF_RECORD_LEN    = 4;
const OFF_COMMIT_OFFSET = 8;
const OFF_TIMESTAMP_NS  = 16;
const OFF_PRIMITIVE_KIND = 24;
const OFF_HOOK_VERDICT  = 25;
const OFF_FLAGS         = 26;
const OFF_PREV_ROOT     = 28;
const OFF_SELF_ROOT     = 60;
const OFF_PAYLOAD_HASH  = 92;
const OFF_READ_SET_HASH = 124;
const OFF_ENVELOPE_CBOR = 156;

const CRC32C_SIZE = 4; // placeholder; real crc32c computation deferred

function decodeFlags(raw: number): SegmentRecordFlags {
  return {
    bootstrap:       (raw & 0x01) !== 0,
    declaredWindow:  (raw & 0x02) !== 0,
    syntheticOutput: (raw & 0x04) !== 0,
    taskBoundary:    (raw & 0x08) !== 0,
    manifestRoot:    (raw & 0x10) !== 0,
  };
}

/** Encode a SegmentRecord to a Buffer. selfRoot must already be computed. */
export function encodeRecord(record: SegmentRecord): Buffer {
  const envelopeLen = record.envelopeCbor.length;
  const totalLen = OFF_ENVELOPE_CBOR + envelopeLen + CRC32C_SIZE;
  const buf = Buffer.allocUnsafe(totalLen);

  buf.writeUInt32BE(MAGIC, OFF_MAGIC);
  buf.writeUInt32LE(totalLen - 4, OFF_RECORD_LEN); // excludes magic
  buf.writeBigUInt64LE(record.commitOffset, OFF_COMMIT_OFFSET);
  buf.writeBigUInt64LE(record.timestampNs, OFF_TIMESTAMP_NS);
  buf.writeUInt8(record.primitiveKind, OFF_PRIMITIVE_KIND);
  buf.writeUInt8(record.hookVerdict, OFF_HOOK_VERDICT);
  buf.writeUInt16LE(encodeFlags(record.flags), OFF_FLAGS);
  buf.set(record.prevRoot, OFF_PREV_ROOT);
  buf.set(record.selfRoot, OFF_SELF_ROOT);
  buf.set(record.payloadHash, OFF_PAYLOAD_HASH);
  buf.set(record.readSetHash, OFF_READ_SET_HASH);
  buf.set(record.envelopeCbor, OFF_ENVELOPE_CBOR);
  // crc32c placeholder: 4 zero bytes at the tail
  buf.writeUInt32LE(0x00000000, OFF_ENVELOPE_CBOR + envelopeLen);

  return buf;
}

/** Decode a Buffer back to a SegmentRecord. Throws InvalidMagicError on bad magic. */
export function decodeRecord(buf: Buffer): SegmentRecord {
  const magic = buf.readUInt32BE(OFF_MAGIC);
  if (magic !== MAGIC) {
    throw new InvalidMagicError(magic);
  }

  const recordLen = buf.readUInt32LE(OFF_RECORD_LEN);
  const totalExpected = recordLen + 4;
  const envelopeLen = totalExpected - OFF_ENVELOPE_CBOR - CRC32C_SIZE;

  const envelopeCbor = new Uint8Array(
    buf.buffer,
    buf.byteOffset + OFF_ENVELOPE_CBOR,
    envelopeLen,
  );

  return {
    commitOffset:  buf.readBigUInt64LE(OFF_COMMIT_OFFSET),
    timestampNs:   buf.readBigUInt64LE(OFF_TIMESTAMP_NS),
    primitiveKind: buf.readUInt8(OFF_PRIMITIVE_KIND),
    hookVerdict:   buf.readUInt8(OFF_HOOK_VERDICT),
    flags:         decodeFlags(buf.readUInt16LE(OFF_FLAGS)),
    prevRoot:      new Uint8Array(buf.buffer, buf.byteOffset + OFF_PREV_ROOT, 32).slice(),
    selfRoot:      new Uint8Array(buf.buffer, buf.byteOffset + OFF_SELF_ROOT, 32).slice(),
    payloadHash:   new Uint8Array(buf.buffer, buf.byteOffset + OFF_PAYLOAD_HASH, 32).slice(),
    readSetHash:   new Uint8Array(buf.buffer, buf.byteOffset + OFF_READ_SET_HASH, 32).slice(),
    envelopeCbor:  new Uint8Array(envelopeCbor),
  };
}
