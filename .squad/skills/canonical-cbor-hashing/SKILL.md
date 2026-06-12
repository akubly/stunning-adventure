# Skill: Canonical CBOR Hashing

**Owner:** Roger  
**Version:** 2.0  
**Last updated:** 2026-06-11  
**Applies to:** WAL payload/readSet hashing in `packages/crucible-core/src/ledger/wal/`

---

## Purpose

Produce deterministic byte sequences for CBOR-encoded JavaScript objects so that
`BLAKE3(CBOR(obj1)) === BLAKE3(CBOR(obj2))` whenever `obj1` and `obj2` have the same logical
content — regardless of JavaScript key insertion order.

Required for `payloadHash` and `readSetHash` in WAL rows (§3.2/§3.3 CTD).

**Encoding profile (pinned v2):** RFC 8949 §4.2.1 deterministic encoding — plain bytewise
ordering of encoded map keys, integers smallest-encoding, floats 64-bit, no indefinite-length items.

---

## Library: cborg

Use `rfc8949EncodeOptions` for the RFC 8949 §4.2.1 profile (mapSorter + float64):

```typescript
import { encode, decode, rfc8949EncodeOptions } from 'cborg';
```

**Do NOT use manual `sortKeys`.** cborg's built-in mapSorter handles ordering correctly and
a manual pre-sort is redundant. More importantly, manual `sortKeys` over `unknown` values
corrupts non-plain objects (Date → `{}`, Map → `{}`) — use the type guard instead.

---

## Canonical Encoding Pattern (v2)

```typescript
// wal/cbor.ts
import { encode, decode, rfc8949EncodeOptions } from 'cborg';

export class UnsupportedCborTypeError extends Error {
  constructor(type: string, path: string) { ... }
}

// Walk value tree; throw UnsupportedCborTypeError for non-JSON-like types
function assertJsonLike(data: unknown, path = '$'): void { ... }

export function encodeCbor(data: unknown): Uint8Array {
  assertJsonLike(data);                      // fail fast on Date/Map/Set/class/NaN
  return encode(data, rfc8949EncodeOptions); // RFC 8949 §4.2.1
}
```

---

## Key Ordering Rule (RFC 8949 §4.2.1 plain bytewise)

- "z"  encodes as 0x61, 0x7a (2 bytes)
- "aa" encodes as 0x62, 0x61, 0x61 (3 bytes)
- Bytewise: 0x61 < 0x62 → "z" sorts FIRST, regardless of insertion order or alphabetic order

---

## Golden Vectors

Pin these in tests; a cborg upgrade or option change will immediately cause a RED test:

| Input | CBOR hex |
|-------|----------|
| `{ aa: 1, z: 2 }` | `a2617a0262616101` |
| `{ nested: { bb: 2, a: 1 }, top: 42 }` | `a263746f70182a666e6573746564a261610162626202` |
| `1` | `01` |
| `'hello'` | `6568656c6c6f` |

---

## CBOR String Header

- `'observation'` (11 chars): first byte = `0x6b` (CBOR major type 3 (0x60) | len 11 (0x0b) = 0x6b), total = 12 bytes
- Test: `expect(rec.envelopeCbor[0]).toBe(0x6b); expect(rec.envelopeCbor.length).toBe(12);`

---

## Shared Materialization Helper (prevents backend drift)

```typescript
// wal/materialize.ts — both backends call this
export function materializeRow(input, verdict, hookId): MaterializedRow {
  const payloadBytes = encodeCbor(input.primitivePayload);
  const payloadHash  = hashBytes(payloadBytes);
  // readSetBytes, readSetHash, envelopeCbor, verdictByte ...
}
```

Contract test CL-9 asserts both backends produce identical hashes for the same input.

---

## Type Guard: assertJsonLike

```typescript
// Accepted: null, boolean, finite number, string, plain Array, plain Object
// Rejected (UnsupportedCborTypeError): Date, Map, Set, class instance, NaN, BigInt, function
encodeCbor(new Date())   // throws
encodeCbor(NaN)          // throws
encodeCbor({ a: 1 })    // ok
```

---

## References

- `packages/crucible-core/src/ledger/wal/cbor.ts`
- `packages/crucible-core/src/ledger/wal/materialize.ts`
- `packages/crucible-core/src/__tests__/unit/wal-cbor.test.ts` — CBOR-1 through CBOR-8
- `.squad/decisions/inbox/roger-crucible-wal-correctness-s1-remediation.md`
- RFC 8949 §4.2.1; CTD §3.2/§3.3
