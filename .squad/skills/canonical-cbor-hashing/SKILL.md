# Skill: Canonical CBOR Hashing

**Owner:** Roger  
**Version:** 3.0  
**Last updated:** 2026-06-11  
**Applies to:** WAL payload/readSet hashing in `packages/crucible-core/src/ledger/wal/`

---

## Purpose

Produce deterministic byte sequences for CBOR-encoded JavaScript objects so that
`BLAKE3(CBOR(obj1)) === BLAKE3(CBOR(obj2))` whenever `obj1` and `obj2` have the same logical
content — regardless of JavaScript key insertion order.

Required for `payloadHash` and `readSetHash` in WAL rows (§3.2/§3.3 CTD).

**Encoding profile (pinned v3) — "Crucible canonical CBOR profile":**
> RFC 8949 §4.2.1 map-key ordering (keys sorted by plain bytewise comparison of their deterministic
> CBOR encodings) + integers in shortest form + **ALL non-integer numbers encoded as IEEE-754 binary64**
> (forced float64, deviating from §4.2.1's shortest-float rule for cross-language reproducibility) +
> definite-length items only.

⚠ This profile is NOT identical to RFC 8949 §4.2.1 because §4.2.1 mandates shortest-float (float16
for 1.5, etc.) and Crucible forces float64. Do not describe this profile as "pure RFC 8949 §4.2.1".

---

## Library: cborg

Use `rfc8949EncodeOptions` as the base, extended with `typeEncoders` for inline type validation:

```typescript
import { encode, decode, rfc8949EncodeOptions } from 'cborg';
```

**Do NOT use manual `sortKeys`.** cborg's built-in mapSorter handles ordering correctly.  
**Do NOT use a separate pre-pass for type validation.** Fold it into `typeEncoders` so the payload
tree is traversed exactly once (validate + encode in a single pass — no double-traversal).

---

## Canonical Encoding Pattern (v3)

```typescript
// wal/cbor.ts
import { encode, decode, rfc8949EncodeOptions } from 'cborg';

export class UnsupportedCborTypeError extends Error {
  constructor(type: string) { ... }
}

// Type validation folded inline — single tree traversal
const crucibleEncodeOptions = {
  ...rfc8949EncodeOptions,
  typeEncoders: {
    Object(obj: object): null {
      const proto = Object.getPrototypeOf(obj);
      if (proto !== Object.prototype && proto !== null) {
        throw new UnsupportedCborTypeError(proto?.constructor?.name ?? 'unknown');
      }
      return null;
    },
    Date():      never { throw new UnsupportedCborTypeError('Date'); },
    Map():       never { throw new UnsupportedCborTypeError('Map'); },
    Set():       never { throw new UnsupportedCborTypeError('Set'); },
    bigint():    never { throw new UnsupportedCborTypeError('bigint'); },
    undefined(): never { throw new UnsupportedCborTypeError('undefined'); },
    number(n: number): null {
      if (!isFinite(n)) throw new UnsupportedCborTypeError('non-finite number');
      return null;
    },
  },
};

export function encodeCbor(data: unknown): Uint8Array {
  return encode(data, crucibleEncodeOptions); // validate + encode in one pass
}
```

---

## Single-Hash Hot Path

`materializeRow()` computes the BLAKE3 hash of each payload. Pass the pre-computed hash to CAS:

```typescript
// WRONG — hashes twice (once in materializeRow, once in cas.put)
this.cas.put(mat.payloadBytes);           // cas.put re-hashes internally

// CORRECT — hash once, reuse
this.cas.put(mat.payloadBytes, mat.payloadHash); // precomputedHash skips internal re-hash
```

Both `InMemoryCas.put()` and `FileSystemCas.put()` accept an optional second argument `precomputedHash`.

---

## Key Ordering Rule (RFC 8949 §4.2.1 plain bytewise)

- "z"  encodes as 0x61, 0x7a (2 bytes)
- "aa" encodes as 0x62, 0x61, 0x61 (3 bytes)
- Bytewise: 0x61 < 0x62 → "z" sorts FIRST, regardless of insertion order or alphabetic order

---

## Golden Vectors (CBOR bytes + BLAKE3)

Pin BOTH the CBOR hex AND the BLAKE3 hash in tests. A cborg upgrade, encoding option change, or
hash algorithm swap will immediately cause a RED test. A cross-language implementation can use
these to verify both encoding and hashing independently.

| Input | CBOR hex | BLAKE3 (hex) |
|-------|----------|--------------|
| `{ aa: 1, z: 2 }` | `a2617a0262616101` | `019d473cc09257855925ff98a82dac52898c7ded08fe0b35b14428b6d498a818` |
| `{ nested: { bb: 2, a: 1 }, top: 42 }` | `a263746f70182a666e6573746564a261610162626202` | `ca3a08eebcc2b8da9850edaf204d824b91300b7e2fedfaea6f7412b7f4978ad4` |
| `1` | `01` | `48fc721fbbc172e0925fa27af1671de225ba927134802998b10a1568a188652b` |
| `'hello'` | `6568656c6c6f` | `90eeb71f0d4b768a5d449e30035beb7ffccd75d228e5b38e8e9cbfaa01ddfae9` |
| `1.5` (float64!) | `fb3ff8000000000000` | `02a6136608c9b30d4e355cf9cd9911808f3997eb4cc351c7e0d08f89a74f90c5` |

The `1.5` vector pins the forced float64 rule. Note: shortest-float (RFC 8949 §4.2.1) would encode
`1.5` as `f93e00` (3 bytes). The Crucible profile always produces `fb3ff8000000000000` (9 bytes).

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

## Type Guard Coverage

```typescript
// Accepted: null, boolean, finite number, string, plain Array, plain Object
// Rejected (UnsupportedCborTypeError): Date, Map, Set, class instance, NaN, BigInt, undefined
encodeCbor(new Date())   // throws
encodeCbor(NaN)          // throws
encodeCbor(42n)          // throws (BigInt)
encodeCbor({ a: 1 })    // ok
encodeCbor(1.5)          // ok → fb3ff8000000000000 (forced float64)
```

---

## Performance Baseline

- `encodeCbor + hashBytes` on a 4-key nested payload: **~15 µs/op** (×2000, warm, Node 22)
- Test PERF-1 in `wal-cbor.test.ts` measures and asserts < 500 µs/op as a sanity bound.

---

## References

- `packages/crucible-core/src/ledger/wal/cbor.ts`
- `packages/crucible-core/src/ledger/wal/materialize.ts`
- `packages/crucible-core/src/__tests__/unit/wal-cbor.test.ts` — CBOR-1 through CBOR-9, PERF-1
- `.squad/decisions.md` §D-CBOR-3 (Crucible canonical CBOR profile final definition, cycle-3)
- CTD §3.2 encoding profile block
