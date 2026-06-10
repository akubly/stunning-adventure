/**
 * WAL hash-chain — BLAKE3 per-row prevRoot/selfRoot linking.
 *
 * selfRoot is computed as the BLAKE3 of the canonical byte concatenation of
 * all record fields except selfRoot itself:
 *
 *   commitOffset(8 LE) || timestampNs(8 LE) || primitiveKind(1) ||
 *   hookVerdict(1) || flags(2 LE) || prevRoot(32) ||
 *   payloadHash(32) || readSetHash(32) || envelopeCbor(var)
 *
 * This is a sub-seam approximation. The final canonical form will use CBOR
 * canonicalization once §6 primitive taxonomy is locked (see decision inbox).
 */

import type { SegmentRecord, SegmentRecordInput, Blake3Hash } from './types.js';
import { hashBytes } from './hash.js';
import { encodeFlags } from './flags.js';

/** Genesis row prevRoot: 32 zero bytes. */
export const ZERO_HASH: Blake3Hash = new Uint8Array(32);

/**
 * Compute the selfRoot for a record given its content and prevRoot.
 * Deterministic: same inputs always produce the same 32-byte hash.
 */
export function computeSelfRoot(input: SegmentRecordInput, prevRoot: Blake3Hash): Blake3Hash {
  const envLen = input.envelopeCbor.length;
  // 8 + 8 + 1 + 1 + 2 + 32 + 32 + 32 = 116 fixed bytes + envelope
  const buf = Buffer.allocUnsafe(116 + envLen);
  let off = 0;

  buf.writeBigUInt64LE(input.commitOffset, off); off += 8;
  buf.writeBigUInt64LE(input.timestampNs,  off); off += 8;
  buf.writeUInt8(input.primitiveKind, off);       off += 1;
  buf.writeUInt8(input.hookVerdict, off);         off += 1;
  buf.writeUInt16LE(encodeFlags(input.flags), off); off += 2;
  buf.set(prevRoot, off);                          off += 32;
  buf.set(input.payloadHash, off);                 off += 32;
  buf.set(input.readSetHash, off);                 off += 32;
  buf.set(input.envelopeCbor, off);

  return hashBytes(buf);
}

/**
 * Build a hash-linked chain of SegmentRecords from inputs.
 * The genesis row's prevRoot is ZERO_HASH; each subsequent row's prevRoot
 * is the selfRoot of the previous row.
 *
 * @param inputs  Row content without chain fields.
 * @param genesisRoot  Optional override for the first row's prevRoot (for fork lineage).
 */
export function buildChain(
  inputs: SegmentRecordInput[],
  genesisRoot: Blake3Hash = ZERO_HASH,
): SegmentRecord[] {
  const chain: SegmentRecord[] = [];
  let prevRoot: Blake3Hash = genesisRoot;

  for (const input of inputs) {
    const selfRoot = computeSelfRoot(input, prevRoot);
    chain.push({ ...input, prevRoot: new Uint8Array(prevRoot), selfRoot });
    prevRoot = selfRoot;
  }

  return chain;
}

/**
 * Verify the integrity of a hash chain.
 * Returns true iff:
 *   - The first row's prevRoot equals ZERO_HASH (or the supplied genesisRoot).
 *   - Every row's selfRoot matches computeSelfRoot(row, row.prevRoot).
 *   - Every row[n].prevRoot deep-equals row[n-1].selfRoot.
 */
export function verifyChain(
  rows: SegmentRecord[],
  genesisRoot: Blake3Hash = ZERO_HASH,
): boolean {
  if (rows.length === 0) return true;

  // Verify genesis prevRoot
  for (let i = 0; i < 32; i++) {
    if (rows[0].prevRoot[i] !== genesisRoot[i]) return false;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const expected = computeSelfRoot(row, row.prevRoot);

    // selfRoot must match recomputed value
    for (let b = 0; b < 32; b++) {
      if (row.selfRoot[b] !== expected[b]) return false;
    }

    // Next row's prevRoot must equal this row's selfRoot
    if (i + 1 < rows.length) {
      for (let b = 0; b < 32; b++) {
        if (rows[i + 1].prevRoot[b] !== row.selfRoot[b]) return false;
      }
    }
  }

  return true;
}
