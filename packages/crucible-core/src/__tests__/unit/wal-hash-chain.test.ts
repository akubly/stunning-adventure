/**
 * RED PHASE — BLAKE3 per-row hash-chain linking.
 *
 * Sub-seam scope  : §3.1.1 / §3.2 — prevRoot/selfRoot chain.
 *                   Each row's prevRoot == prior row's selfRoot.
 *                   Tampering with content breaks the chain.
 * TDD Strategy    : §4 Walkthrough B, Lane 1 — WAL substrate internals
 *                   (docs/crucible-tdd-strategy.md)
 * Locked Decision : OQ-2 FEDERATE; hash function = BLAKE3 via @noble/hashes.
 * Seam constraint : Does NOT touch Ledger.append() or HookBus — sub-seam only.
 *
 * This test MUST FAIL with "Cannot find module" until hash-chain.ts is created.
 *
 * Invariants exercised:
 *   1. Genesis row's prevRoot is the 32-byte zero hash.
 *   2. Row[n].prevRoot deep-equals Row[n-1].selfRoot for all n > 0.
 *   3. verifyChain() returns true on an unmodified chain.
 *   4. verifyChain() returns false after a row's payloadHash is tampered with
 *      (recomputed selfRoot no longer matches the next row's prevRoot).
 *   5. selfRoot of each row is deterministic (same input → same hash).
 */

import { describe, it, expect } from 'vitest';

import {
  buildChain,
  verifyChain,
  computeSelfRoot,
  ZERO_HASH,
} from '../../ledger/wal/hash-chain.js';
import type { SegmentRecordInput } from '../../ledger/wal/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHash(fill: number): Uint8Array {
  return Uint8Array.from({ length: 32 }, () => fill);
}

function makeInput(index: number): SegmentRecordInput {
  return {
    commitOffset: BigInt(index),
    timestampNs: BigInt(index) * 1_000_000n,
    primitiveKind: 0x01,
    hookVerdict: 0x00,
    flags: {
      bootstrap: false,
      declaredWindow: false,
      syntheticOutput: false,
      taskBoundary: false,
      manifestRoot: false,
    },
    payloadHash: makeHash(index + 1),
    readSetHash: makeHash(0x00),
    envelopeCbor: new Uint8Array([index]),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WAL hash-chain — BLAKE3 per-row linking', () => {
  it('Unit: WAL hash-chain genesis row has prevRoot equal to ZERO_HASH', () => {
    const chain = buildChain([makeInput(0)]);
    expect(chain[0].prevRoot).toEqual(ZERO_HASH);
  });

  it('Unit: WAL hash-chain each row prevRoot equals prior row selfRoot', () => {
    const inputs = [makeInput(0), makeInput(1), makeInput(2)];
    const chain = buildChain(inputs);

    expect(chain[1].prevRoot).toEqual(chain[0].selfRoot);
    expect(chain[2].prevRoot).toEqual(chain[1].selfRoot);
  });

  it('Unit: WAL hash-chain verifyChain returns true on unmodified chain', () => {
    const inputs = [makeInput(0), makeInput(1), makeInput(2)];
    const chain = buildChain(inputs);
    expect(verifyChain(chain)).toBe(true);
  });

  it('Unit: WAL hash-chain verifyChain returns false after payloadHash tampered', () => {
    const inputs = [makeInput(0), makeInput(1), makeInput(2)];
    const chain = buildChain(inputs);

    // Tamper: change row[0]'s payloadHash after chain was built.
    // Row[1].prevRoot still holds the OLD selfRoot of row[0], but
    // recomputing selfRoot of tampered row[0] produces a different hash.
    chain[0].payloadHash = makeHash(0xff);

    expect(verifyChain(chain)).toBe(false);
  });

  it('Unit: WAL hash-chain selfRoot is deterministic for same input', () => {
    const input = makeInput(5);
    const prevRoot = makeHash(0x11);
    const h1 = computeSelfRoot(input, prevRoot);
    const h2 = computeSelfRoot(input, prevRoot);
    expect(h1).toEqual(h2);
  });

  it('Unit: WAL hash-chain selfRoot differs when payloadHash changes', () => {
    const base = makeInput(5);
    const prevRoot = makeHash(0x11);
    const h1 = computeSelfRoot(base, prevRoot);

    const tampered = { ...base, payloadHash: makeHash(0xff) };
    const h2 = computeSelfRoot(tampered, prevRoot);

    expect(h1).not.toEqual(h2);
  });

  it('Unit: WAL hash-chain selfRoot is 32 bytes', () => {
    const root = computeSelfRoot(makeInput(0), ZERO_HASH);
    expect(root).toHaveLength(32);
  });
});
