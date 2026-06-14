/**
 * Shared WAL row materialization helper (cycle-2 / I2).
 *
 * Computes the CBOR bytes and BLAKE3 hashes for all three CAS-stored blobs
 * (payload, readSet, envelope) and the encoded verdict byte for a single
 * staged row, independently of how or where the bytes are stored on disk.
 *
 * Both FileSystemWalBackend and InMemoryWalBackend call this function so that
 * payloadHash, readSetHash, and envelopeCbor are guaranteed to be computed
 * identically.  Any future encoding change made here propagates to both
 * backends automatically, preventing silent drift.
 *
 * The CAS storage step (writing bytes to disk / in-memory map) is intentionally
 * NOT part of this helper — it remains backend-specific.
 *
 * Envelope format (#67 — v1 with metadata):
 *   A CBOR map: {k: "<primitiveKind>", m: <metadata>} where "m" is omitted
 *   when metadata is undefined or absent.  Key "k" sorts before "m" under the
 *   Crucible canonical CBOR profile (RFC 8949 §4.2.1 bytewise key ordering:
 *   0x6b < 0x6d in CBOR encoding).
 *
 *   Backward-compat note: older segments stored a bare CBOR string for the
 *   envelope.  replayFromSegments detects the old format (first CBOR byte is
 *   a text-string major type) and decodes without metadata (undefined).
 */

import type { PrimitiveInput } from '../../types.js';
import { encodeCbor } from './cbor.js';
import { hashBytes } from './hash.js';
import type { Blake3Hash, EnvelopeMapV1, VerdictByte } from './types.js';
import { hookResultToVerdictByte, isPlainObject } from './types.js';

const ZERO_HASH_32 = new Uint8Array(32);

/** All pre-computed values for one staged WAL row. */
export interface MaterializedRow {
  /** CBOR-encoded primitivePayload bytes (store in CAS, hash into payloadHash). */
  payloadBytes:  Uint8Array;
  /** BLAKE3(payloadBytes) — 32-byte CAS key for the payload blob. */
  payloadHash:   Blake3Hash;
  /**
   * CBOR-encoded causalReadSet bytes, or null when the read-set is empty.
   * Store in CAS when non-null.
   */
  readSetBytes:  Uint8Array | null;
  /** BLAKE3(readSetBytes) when non-null; zero-hash (32 × 0x00) when empty. */
  readSetHash:   Blake3Hash;
  /**
   * CBOR-encoded envelope map — {k: primitiveKind, m?: metadata}.
   * Stored as envelopeCbor in the segment record; also hashed into selfRoot.
   */
  envelopeCbor:  Uint8Array;
  /** Encoded hookVerdict byte for the segment record header. */
  verdictByte:   VerdictByte;
}

/**
 * Materialise a staged row into its CBOR bytes, BLAKE3 hashes, envelopeCbor,
 * and verdict byte.
 *
 * @param input      - The primitive input supplied by the caller.
 * @param verdict    - The hook verdict (COMMIT | OBSERVE | PAUSE; VETO is handled upstream).
 * @param hookId     - The hook that fired, or null if no predicate matched.
 */
export function materializeRow(
  input:   PrimitiveInput,
  verdict: 'COMMIT' | 'OBSERVE' | 'PAUSE',
  hookId:  string | null,
): MaterializedRow {
  const payloadBytes = encodeCbor(input.primitivePayload);
  const payloadHash  = hashBytes(payloadBytes);

  let readSetBytes: Uint8Array | null = null;
  let readSetHash: Blake3Hash = new Uint8Array(ZERO_HASH_32);

  if (input.causalReadSet.length > 0) {
    readSetBytes = encodeCbor(input.causalReadSet);
    readSetHash  = hashBytes(readSetBytes);
  }

  // Build the envelope map. Only include "m" when metadata is defined to keep
  // the envelope byte-count minimal for the common (no-metadata) case.
  // Key ordering: "k" (0x61 0x6b) < "m" (0x61 0x6d) under RFC 8949 §4.2.1 —
  // the Crucible canonical CBOR profile enforces this automatically via
  // rfc8949EncodeOptions mapSorter.
  const envelopeObj: EnvelopeMapV1 = { k: input.primitiveKind };
  if (input.metadata !== undefined) {
    // Write-side guard: mirror the decode-side validity condition in
    // replayFromSegments (wal-backend-fs.ts) so the write path can never
    // produce a segment that the replay path would reject.  This is a
    // programmer/caller error at write time — throw a plain Error, NOT a
    // CorruptSegmentError (which is a read-time segment-integrity signal).
    if (!isPlainObject(input.metadata)) {
      const tag = Array.isArray(input.metadata)
        ? 'array'
        : input.metadata === null
          ? 'null'
          : typeof input.metadata;
      let repr: string;
      try {
        const raw = JSON.stringify(input.metadata);
        repr = raw !== undefined && raw.length > 80 ? raw.slice(0, 80) + '…' : (raw ?? tag);
      } catch {
        repr = tag;
      }
      throw new Error(`metadata must be a plain object (got ${tag}: ${repr})`);
    }
    envelopeObj.m = input.metadata;
  }
  const envelopeCbor = encodeCbor(envelopeObj);
  const verdictByte  = hookResultToVerdictByte(verdict, hookId);

  return { payloadBytes, payloadHash, readSetBytes, readSetHash, envelopeCbor, verdictByte };
}
