/**
 * Canonical CBOR encode/decode for WAL payload hashing (issue #60).
 *
 * Encoding profile: RFC 8949 §4.2.1 deterministic encoding (CTD §3.2/§3.3).
 *   - Map keys sorted bytewise on their CBOR-encoded form (rfc8949EncodeOptions
 *     mapSorter — plain bytewise, not length-first RFC 7049).
 *   - Integers use smallest encoding; floats use 64-bit (float64 option).
 *   - No indefinite-length items (cborg fixed-length default).
 *   - Unsupported types (Date, Map, Set, class instances, functions, etc.) are
 *     rejected with UnsupportedCborTypeError rather than silently producing
 *     corrupt or non-deterministic output.
 *
 * Two logically-equivalent objects with the same key/value pairs in any
 * insertion order encode to identical bytes and produce identical BLAKE3 hashes.
 *
 * Golden vector (RFC 8949 §4.2.1): encode({ z: 2, aa: 1 })
 *   → a2617a0262616101  ("z" before "aa": 0x61 < 0x62 bytewise)
 */

import { decode, encode, rfc8949EncodeOptions } from 'cborg';

/** Thrown when encodeCbor encounters a non-JSON-like value. */
export class UnsupportedCborTypeError extends Error {
  constructor(type: string, path: string) {
    super(
      `encodeCbor: unsupported type "${type}" at "${path}" — ` +
      `only JSON-like values (null, boolean, finite number, string, ` +
      `plain Array, plain Object) are accepted`,
    );
    this.name = 'UnsupportedCborTypeError';
  }
}

/**
 * Walk the value tree and throw UnsupportedCborTypeError for any type that
 * cannot be represented as a JSON-like value.
 *
 * Accepted: null, boolean, finite number, string, plain Array, plain Object
 *   (prototype === Object.prototype or null).
 * Rejected: Date, Map, Set, TypedArray, function, Symbol, BigInt, any class
 *   instance with a non-plain prototype, non-finite numbers (NaN/±Infinity).
 */
function assertJsonLike(data: unknown, path = '$'): void {
  if (data === null) return;
  switch (typeof data) {
    case 'boolean':
    case 'string':
      return;
    case 'number':
      if (!isFinite(data)) {
        throw new UnsupportedCborTypeError('non-finite number', path);
      }
      return;
    case 'object': {
      if (Array.isArray(data)) {
        (data as unknown[]).forEach((v, i) => assertJsonLike(v, `${path}[${i}]`));
        return;
      }
      // Reject well-known non-plain types explicitly for clear error messages
      if (data instanceof Date) throw new UnsupportedCborTypeError('Date', path);
      if (data instanceof Map)  throw new UnsupportedCborTypeError('Map', path);
      if (data instanceof Set)  throw new UnsupportedCborTypeError('Set', path);
      // Reject class instances: anything whose prototype is not Object.prototype
      // or null (null-prototype objects from Object.create(null) are plain).
      const proto = Object.getPrototypeOf(data as object) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        const name =
          (proto as { constructor?: { name?: string } })?.constructor?.name ??
          'unknown';
        throw new UnsupportedCborTypeError(name, path);
      }
      // Plain object — recurse into values
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        assertJsonLike(v, `${path}.${k}`);
      }
      return;
    }
    default:
      throw new UnsupportedCborTypeError(typeof data, path);
  }
}

/**
 * Encode a JSON-like value to canonical CBOR bytes per RFC 8949 §4.2.1.
 *
 * Throws UnsupportedCborTypeError for Date, Map, Set, class instances,
 * functions, Symbols, BigInts, and non-finite numbers.
 */
export function encodeCbor(data: unknown): Uint8Array {
  assertJsonLike(data);
  return encode(data, rfc8949EncodeOptions);
}

export function decodeCbor(bytes: Uint8Array): unknown {
  return decode(bytes);
}
