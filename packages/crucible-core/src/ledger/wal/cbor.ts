/**
 * Canonical CBOR encode/decode for WAL payload hashing (issue #60).
 *
 * Keys in plain objects are recursively sorted before encoding so logically
 * equivalent payloads hash identically regardless of insertion order.
 */

import { decode, encode } from 'cborg';

function sortKeys(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sortKeys);
  const obj = data as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((key) => [key, sortKeys(obj[key])]),
  );
}

export function encodeCbor(data: unknown): Uint8Array {
  return encode(sortKeys(data));
}

export function decodeCbor(bytes: Uint8Array): unknown {
  return decode(bytes);
}
