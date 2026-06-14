/**
 * Shared types for the WAL substrate sub-seam internals.
 *
 * These types are strictly BELOW the public Ledger.append() seam.
 * The append orchestration and HookBus integration are deferred pending
 * Graham's seam lock (see .squad/decisions.md).
 */

import type { EventMetadata } from '../../types.js';

/**
 * Canonical v1 envelope map stored as envelopeCbor in each WAL segment record.
 *
 * Encode site (materialize.ts) produces this shape; decode site
 * (wal-backend-fs.ts replayFromSegments) casts the decoded CBOR to this type
 * while keeping runtime structural guards on `k`/`m`.
 *
 * Key ordering under the Crucible canonical CBOR profile (RFC 8949 §4.2.1):
 *   "k" (0x6b) < "m" (0x6d) — enforced by rfc8949EncodeOptions mapSorter.
 * "m" is omitted entirely when metadata is absent (minimal envelope).
 */
export interface EnvelopeMapV1 {
  k: string;
  m?: EventMetadata;
}

/**
 * Returns true iff v is a non-null, non-array plain object — the only shape
 * that is valid for an EventMetadata value in the WAL envelope.
 *
 * Used by BOTH the encode path (materialize.ts write guard) and the decode
 * path (wal-backend-fs.ts replayFromSegments) so the two sites can never drift.
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
 * Discriminated union of the four valid hookVerdict byte values.
 *   0xFF — no predicate matched (hookId === null, verdict COMMIT)
 *   0x00 — explicit continue (hook fired, verdict COMMIT)
 *   0x01 — observe
 *   0x02 — pause
 */
export type VerdictByte = 0xFF | 0x00 | 0x01 | 0x02;

/**
 * Fields supplied by the caller before hash-chain linking.
 * prevRoot and selfRoot are computed by hash-chain.ts — they are not inputs.
 */
export interface SegmentRecordInput {
  commitOffset:  bigint;           // u64 monotonic per session
  timestampNs:   bigint;           // u64 ns, monotonically non-decreasing
  primitiveKind: number;           // u8 enum (§6, locked separately)
  hookVerdict:   VerdictByte;      // u8: 0xFF=no predicate matched, 0x00=continue/explicit,
                                    //     0x01=observe, 0x02=pause
  flags:         SegmentRecordFlags;
  payloadHash:   Blake3Hash;       // BLAKE3(CBOR(primitivePayload)); Crucible canonical CBOR profile
                                    //   (RFC 8949 §4.2.1 map-key ordering + shortest integers +
                                    //    forced IEEE-754 binary64 for non-integer numbers; issue #60)
  readSetHash:   Blake3Hash;       // BLAKE3(CBOR(causalReadSet)), or zero-hash if empty;
                                    //   same Crucible canonical CBOR profile as payloadHash
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
export const VERDICT_TO_WAL: Record<'COMMIT' | 'OBSERVE' | 'PAUSE', VerdictByte> = {
  COMMIT:  0x00,
  OBSERVE: 0x01,
  PAUSE:   0x02,
};

export const NO_MATCH_VERDICT_BYTE = 0xFF as const satisfies VerdictByte;

export function hookResultToVerdictByte(
  verdict: 'COMMIT' | 'OBSERVE' | 'PAUSE',
  hookId: string | null,
): VerdictByte {
  if (hookId === null && verdict === 'COMMIT') {
    // No hook fired — no predicate matched (§4 seam §5).
    return NO_MATCH_VERDICT_BYTE;
  }
  if (hookId === null) {
    // Precondition: hookId === null is only valid with COMMIT (no-match case).
    // A null hookId with OBSERVE or PAUSE means no hook fired but a non-commit
    // verdict was returned, which is a programming error. This path is
    // unreachable today but must throw explicitly so a future default-OBSERVE
    // path cannot silently bypass 0xFF and produce incorrect verdict bytes.
    throw new Error(
      `Precondition violated: hookId is null with verdict "${verdict}". ` +
      `Only COMMIT is valid when no hook matched (expected 0xFF byte).`,
    );
  }
  return VERDICT_TO_WAL[verdict];
}
