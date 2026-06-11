# Skill: Canonical CBOR Hashing

**Owner:** Roger  
**Version:** 1.0  
**Last updated:** 2026-06-10  
**Applies to:** WAL payload/readSet hashing in `packages/crucible-core/src/ledger/wal/`

---

## Purpose

Produce deterministic byte sequences for CBOR-encoded JavaScript objects so that
`BLAKE3(CBOR(obj1)) === BLAKE3(CBOR(obj2))` whenever `obj1` and `obj2` have the same logical
content — regardless of JavaScript key insertion order.

This is required for `payloadHash` and `readSetHash` in WAL rows (§3.2/§3.3 CTD).

---

## Library: `cborg`

```
npm install cborg
```

`cborg` is a pure TypeScript/JS CBOR library. No native compilation. ESM-native. Used extensively
in the Protocol Labs / IPFS ecosystem where CBOR determinism is production-tested.

```typescript
import { encode, decode } from 'cborg';
```

---

## Canonical Encoding Pattern

`cborg.encode()` preserves JS object key order. To achieve canonical encoding (RFC 8949 §4.2
"deterministic encoding"), sort map keys recursively before encoding:

```typescript
// wal/cbor.ts
import { encode, decode } from 'cborg';

function sortKeys(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(sortKeys);
  const obj = data as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(obj).sort().map(k => [k, sortKeys(obj[k])]),
  );
}

export function encodeCbor(data: unknown): Uint8Array {
  return encode(sortKeys(data));
}

export function decodeCbor(bytes: Uint8Array): unknown {
  return decode(bytes);
}
```

---

## CBOR String Encoding (for envelopeCbor / primitiveKind)

A CBOR-encoded short string has a 1-byte header:

| String length | Header byte | Notes |
|---|---|---|
| 0–23 chars | `0x60 + len` | Major type 3, length in additional |
| 24–255 chars | `0x78`, then `len` byte | Major type 3, one-byte length |

Examples:
- `'observation'` (11 chars): first byte = `0x6b` (`0x60 + 11`), total = 12 bytes
- `'request'` (7 chars): first byte = `0x67`, total = 8 bytes

To detect "is this genuine CBOR?" in a test:
```typescript
expect(rec.envelopeCbor[0]).toBe(0x6b); // CBOR text string, 11 chars
expect(rec.envelopeCbor.length).toBe(12);
```

---

## Cross-Language Compatibility

For replay / audit in non-JS languages:

1. Encode payload object to CBOR with **deterministic/canonical mode**.
2. Sort map keys **lexicographically by their UTF-8 byte representation** (for text keys, this
   is equivalent to Unicode code point order / JS `Array.sort()`).
3. Apply recursively to nested objects.
4. Hash with BLAKE3-256 (32-byte output).

Reference: RFC 8949 §4.2 "Deterministic Encoding Requirements".

---

## Replay Decode

When reopening a WAL session, decode CAS blobs with `decodeCbor`:

```typescript
// primitiveKind from envelopeCbor:
const primitiveKindRaw = rec.envelopeCbor.length > 0
  ? (decodeCbor(rec.envelopeCbor) as string)
  : 'observation';

// primitivePayload from CAS:
const primitivePayload = decodeCbor(payloadBuf);

// causalReadSet from CAS:
const parsed = decodeCbor(rsBuf);
```

Wrap CBOR decode errors in `CorruptSegmentError` (invalid CBOR in envelopeCbor = segment corruption).

---

## Test Patterns

```typescript
// CBOR-1: canonical key ordering gives stable hash
const b1 = new InMemoryWalBackend();
const b2 = new InMemoryWalBackend();
await b1.commitRow({ primitiveKind: 'observation', primitivePayload: { b: 2, a: 1 }, causalReadSet: [] }, ...);
await b2.commitRow({ primitiveKind: 'observation', primitivePayload: { a: 1, b: 2 }, causalReadSet: [] }, ...);
expect(b1.readSegmentRecords()[0].payloadHash).toEqual(b2.readSegmentRecords()[0].payloadHash);

// CBOR-2: genuine CBOR envelope (not raw UTF-8)
const recs = backend.readSegmentRecords();
expect(recs[0].envelopeCbor[0]).toBe(0x6b); // CBOR text string header for 11-char string
```

---

## References

- `packages/crucible-core/src/ledger/wal/cbor.ts` — implementation
- `packages/crucible-core/src/__tests__/unit/wal-cbor.test.ts` — CBOR-1/CBOR-2/CBOR-3 tests
- `.squad/decisions/inbox/roger-crucible-wal-correctness-s1.md` — D-CBOR-1 decision
- Issues #60 — original bug report
- CTD §3.2/§3.3 `docs/crucible-technical-design/03-l1-wal-substrate.md`
