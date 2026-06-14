/**
 * WAL in-memory CAS — content-addressed byte store keyed by BLAKE3.
 *
 * This is the sub-seam unit that backs the on-disk CAS described in §3.2.
 * The file-system shard layout (~/.crucible/wal/cas/<first-byte>/<hash>.cbor)
 * is implemented in the FileSystemCas class (deferred to post-seam build).
 *
 * InMemoryCas is used in unit tests and as a fast in-process stub.
 */

import { hashBytes } from './hash.js';
import type { Blake3Hash } from './types.js';

export class InMemoryCas {
  // Key: hex string of the 32-byte BLAKE3 hash; value: stored bytes
  private readonly store = new Map<string, Uint8Array>();

  /**
   * Store bytes under their BLAKE3 hash key.
   * Returns the 32-byte hash (the CAS key for the WAL record header).
   *
   * @param bytes           - The bytes to store.
   * @param precomputedHash - Optional pre-computed BLAKE3 hash. When provided,
   *   the internal hash call is skipped (single-hash hot path for callers that
   *   already computed the hash in materializeRow).
   *
   * Idempotent: putting the same bytes twice returns the same hash.
   */
  put(bytes: Uint8Array, precomputedHash?: Blake3Hash): Blake3Hash {
    const hash = precomputedHash ?? hashBytes(bytes);
    const key = Buffer.from(hash).toString('hex');
    if (!this.store.has(key)) {
      this.store.set(key, new Uint8Array(bytes));
    }
    return hash;
  }

  /**
   * Retrieve bytes by BLAKE3 hash key.
   * Returns null if the key is not present (CAS_MISS).
   */
  get(hash: Blake3Hash): Uint8Array | null {
    const key = Buffer.from(hash).toString('hex');
    return this.store.get(key) ?? null;
  }

  /** Number of entries in the store. */
  get size(): number {
    return this.store.size;
  }
}
