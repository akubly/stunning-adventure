/**
 * BLAKE3 hash seam — thin wrapper over @noble/hashes/blake3.js.
 *
 * All WAL substrate code calls hashBytes() from this module so the hash
 * function is swappable behind a single seam (e.g., if native BLAKE3 bindings
 * become available or the function is replaced during testing).
 *
 * Library choice: @noble/hashes v2.x — pure TS/WASM, no native compilation,
 * ESM compatible (NodeNext/Node16 module resolution), actively maintained.
 * Requires Node.js >=20.19.0. Documented in .squad/decisions.md.
 */

import { blake3 } from '@noble/hashes/blake3.js';

export type { Blake3Hash } from './types.js';

/** Hash an arbitrary byte array with BLAKE3. Returns a 32-byte Uint8Array. */
export function hashBytes(data: Uint8Array): Uint8Array {
  return blake3(data);
}
