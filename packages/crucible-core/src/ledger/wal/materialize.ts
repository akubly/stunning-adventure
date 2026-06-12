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
 */

import type { PrimitiveInput } from '../../types.js';
import { encodeCbor } from './cbor.js';
import { hashBytes } from './hash.js';
import type { Blake3Hash, VerdictByte } from './types.js';
import { hookResultToVerdictByte } from './types.js';

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
  /** CBOR-encoded primitiveKind string — stored as envelopeCbor in the record. */
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

  const envelopeCbor = encodeCbor(input.primitiveKind);
  const verdictByte  = hookResultToVerdictByte(verdict, hookId);

  return { payloadBytes, payloadHash, readSetBytes, readSetHash, envelopeCbor, verdictByte };
}
