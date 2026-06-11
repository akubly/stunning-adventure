/**
 * Shared types for the WAL substrate sub-seam internals.
 *
 * These types are strictly BELOW the public Ledger.append() seam.
 * The append orchestration and HookBus integration are deferred pending
 * Graham's seam lock (see .squad/decisions.md).
 */

export type Blake3Hash = Uint8Array; // 32 bytes

/** Bits for the 2-byte flags field in a segment record. */
export interface SegmentRecordFlags {
  bootstrap:       boolean; // bit 0
  declaredWindow:  boolean; // bit 1
  syntheticOutput: boolean; // bit 2
  taskBoundary:    boolean; // bit 3
  manifestRoot:    boolean; // bit 4
}

/**
 * Fields supplied by the caller before hash-chain linking.
 * prevRoot and selfRoot are computed by hash-chain.ts — they are not inputs.
 */
export interface SegmentRecordInput {
  commitOffset:  bigint;           // u64 monotonic per session
  timestampNs:   bigint;           // u64 ns, monotonically non-decreasing
  primitiveKind: number;           // u8 enum (§6, locked separately)
  hookVerdict:   number;           // u8: 0xFF=no predicate matched, 0x00=continue/explicit,
                                    //     0x01=observe, 0x02=pause
  flags:         SegmentRecordFlags;
  payloadHash:   Blake3Hash;       // BLAKE3(CBOR(primitivePayload)); canonical CBOR encoding (issue #60)
  readSetHash:   Blake3Hash;       // BLAKE3(CBOR(causalReadSet)), or zero-hash if empty; canonical CBOR (issue #60)
  envelopeCbor:  Uint8Array;       // CBOR envelope tail; may be empty
}

/** Complete WAL segment record including hash-chain links. */
export interface SegmentRecord extends SegmentRecordInput {
  prevRoot: Blake3Hash; // previous row's selfRoot (ZERO_HASH for genesis)
  selfRoot: Blake3Hash; // BLAKE3 of canonical content (see hash-chain.ts)
}

// Imported by HookVerdict — keep this import-free from hook-bus.ts to avoid
// a circular dep (hook-bus.ts is in the parent ledger/ dir).
// The strings must exactly match the HookVerdict union in hook-bus.ts.

/** Ledger verdict → WAL hookVerdict byte (§4 seam §5). */
export const VERDICT_TO_WAL: Record<'COMMIT' | 'OBSERVE' | 'PAUSE', number> = {
  COMMIT:  0x00,
  OBSERVE: 0x01,
  PAUSE:   0x02,
};

export const NO_MATCH_VERDICT_BYTE = 0xFF as const;

export function hookResultToVerdictByte(
  verdict: 'COMMIT' | 'OBSERVE' | 'PAUSE',
  hookId: string | null,
): number {
  if (hookId === null && verdict === 'COMMIT') {
    return NO_MATCH_VERDICT_BYTE;
  }
  return VERDICT_TO_WAL[verdict];
}
