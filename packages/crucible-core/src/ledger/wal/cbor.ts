/**
 * Canonical CBOR encode/decode for WAL payload hashing (issue #60).
 *
 * Encoding profile — "Crucible canonical CBOR profile" (CTD §3.2/§3.3):
 *   - Map keys sorted by plain bytewise order of their CBOR-encoded form
 *     (RFC 8949 §4.2.1 map-key ordering, via cborg rfc8949EncodeOptions mapSorter).
 *   - Integers use smallest encoding (RFC 8949 §4.2.1 unsigned integer rule).
 *   - ALL non-integer numbers encoded as IEEE-754 binary64 (8 bytes, always).
 *     ⚠ This deviates from RFC 8949 §4.2.1's shortest-float rule to ensure
 *     cross-language reproducibility — no float16/float32 round-trip ambiguity.
 *   - No indefinite-length items (cborg uses definite-length by default).
 *   - Unsupported types (Date, Map, Set, BigInt, class instances, undefined,
 *     functions, non-finite numbers, etc.) are rejected with
 *     UnsupportedCborTypeError rather than silently producing corrupt or
 *     non-deterministic output.
 *
 * Two logically-equivalent objects with the same key/value pairs in any
 * insertion order encode to identical bytes and produce identical BLAKE3 hashes.
 *
 * Golden vector (map-key ordering): encode({ z: 2, aa: 1 })
 *   → a2617a0262616101  ("z" before "aa": 0x61 < 0x62 bytewise)
 * Golden vector (forced float64): encode(1.5)
 *   → fb3ff8000000000000  (IEEE-754 binary64; NOT the 2-byte float16 form)
 *
 * Performance note: type validation is folded into the encode pass via cborg
 * typeEncoders — a single tree traversal handles both validation and encoding
 * with no separate pre-pass.
 */

import { decode, encode, rfc8949EncodeOptions } from 'cborg';

/** Thrown when encodeCbor encounters a non-JSON-like value. */
export class UnsupportedCborTypeError extends Error {
  constructor(type: string) {
    super(
      `encodeCbor: unsupported type "${type}" — ` +
      `only JSON-like values (null, boolean, finite number, string, ` +
      `plain Array, plain Object) are accepted`,
    );
    this.name = 'UnsupportedCborTypeError';
  }
}

/**
 * cborg encode options implementing the Crucible canonical CBOR profile:
 *   - RFC 8949 §4.2.1 map-key ordering + shortest integer encoding
 *     (inherited from rfc8949EncodeOptions mapSorter + quickEncodeToken).
 *   - Forced float64 for ALL non-integer numbers (deviation from §4.2.1 for
 *     cross-language reproducibility). `float64: true` is set EXPLICITLY below
 *     so the Crucible profile does not depend on cborg's library preset —
 *     cborg 5.x rfc8949EncodeOptions also enables it, but we own the contract.
 *   - Type validation folded inline via typeEncoders — rejects unsupported
 *     types during the single encode traversal with no separate pre-pass.
 */
const crucibleEncodeOptions = {
  ...rfc8949EncodeOptions,
  float64: true, // explicit: forced IEEE-754 binary64 for all non-integer numbers;
                 // belt-and-suspenders — cborg rfc8949 preset also sets this in 5.x,
                 // but we declare it here so the Crucible profile is self-contained.
  typeEncoders: {
    Object(obj: object): null {
      const proto = Object.getPrototypeOf(obj) as unknown;
      if (proto !== Object.prototype && proto !== null) {
        const name =
          (proto as { constructor?: { name?: string } })?.constructor?.name ??
          'unknown';
        throw new UnsupportedCborTypeError(name);
      }
      return null; // plain object — use cborg default encoding
    },
    Date():      never { throw new UnsupportedCborTypeError('Date'); },
    Map():       never { throw new UnsupportedCborTypeError('Map'); },
    Set():       never { throw new UnsupportedCborTypeError('Set'); },
    bigint():    never { throw new UnsupportedCborTypeError('bigint'); },
    undefined(): never { throw new UnsupportedCborTypeError('undefined'); },
    number(n: number): null {
      if (!isFinite(n)) throw new UnsupportedCborTypeError('non-finite number');
      return null; // finite number — float64 via the explicit float64:true on crucibleEncodeOptions
    },
  },
};

/**
 * Encode a JSON-like value to canonical CBOR bytes per the Crucible canonical
 * CBOR profile (RFC 8949 §4.2.1 map-key ordering + shortest integers +
 * forced float64 for all non-integer numbers).
 *
 * Throws UnsupportedCborTypeError for Date, Map, Set, BigInt, class instances,
 * functions, Symbols, undefined, and non-finite numbers (NaN / ±Infinity).
 * Type validation is performed inline during the single encode traversal.
 */
export function encodeCbor(data: unknown): Uint8Array {
  return encode(data, crucibleEncodeOptions);
}

export function decodeCbor(bytes: Uint8Array): unknown {
  return decode(bytes);
}
