/**
 * RED PHASE — Content-addressed CAS body store.
 *
 * Sub-seam scope  : §3.2 CAS — put(bytes)->blake3 key, get(key)->bytes.
 *                   In-memory implementation only (file-system CAS is upstream
 *                   of the current seam; deferred to post-seam build).
 * TDD Strategy    : §4 Walkthrough B, Lane 1 — WAL substrate internals
 *                   (docs/crucible-tdd-strategy.md)
 * Locked Decision : OQ-2 FEDERATE; BLAKE3 content addressing.
 * Seam constraint : Does NOT touch Ledger.append() or HookBus — sub-seam only.
 *
 * This test MUST FAIL with "Cannot find module" until cas.ts is created.
 *
 * Invariants exercised:
 *   1. put(bytes) returns the BLAKE3 hash of those bytes (32 bytes).
 *   2. get(hash) returns the original bytes after put.
 *   3. Putting the same bytes twice returns the same hash (deduplication).
 *   4. get(unknownHash) returns null (no entry).
 *   5. put(a) ≠ put(b) when a ≠ b (collision resistance spot-check).
 *   6. Returned hash matches independently computed blake3 of the input.
 */

import { describe, it, expect } from 'vitest';

import { InMemoryCas } from '../../ledger/wal/cas.js';
import { hashBytes } from '../../ledger/wal/hash.js';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WAL CAS — content-addressed in-memory store', () => {
  it('Unit: WAL CAS put returns 32-byte BLAKE3 hash', () => {
    const cas = new InMemoryCas();
    const key = cas.put(new Uint8Array([1, 2, 3]));
    expect(key).toHaveLength(32);
  });

  it('Unit: WAL CAS get returns original bytes after put', () => {
    const cas = new InMemoryCas();
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const key = cas.put(bytes);
    const retrieved = cas.get(key);
    expect(retrieved).toEqual(bytes);
  });

  it('Unit: WAL CAS putting same bytes twice returns same key (dedup)', () => {
    const cas = new InMemoryCas();
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const k1 = cas.put(bytes);
    const k2 = cas.put(bytes);
    expect(k1).toEqual(k2);
  });

  it('Unit: WAL CAS get returns null for unknown key', () => {
    const cas = new InMemoryCas();
    const unknownKey = new Uint8Array(32).fill(0x42);
    expect(cas.get(unknownKey)).toBeNull();
  });

  it('Unit: WAL CAS different content produces different keys', () => {
    const cas = new InMemoryCas();
    const k1 = cas.put(new Uint8Array([1]));
    const k2 = cas.put(new Uint8Array([2]));
    expect(k1).not.toEqual(k2);
  });

  it('Unit: WAL CAS returned key matches independently computed blake3', () => {
    const cas = new InMemoryCas();
    const bytes = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
    const key = cas.put(bytes);
    const expected = hashBytes(bytes);
    expect(key).toEqual(expected);
  });

  it('Unit: WAL CAS stores multiple independent entries', () => {
    const cas = new InMemoryCas();
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const ka = cas.put(a);
    const kb = cas.put(b);
    expect(cas.get(ka)).toEqual(a);
    expect(cas.get(kb)).toEqual(b);
  });
});
