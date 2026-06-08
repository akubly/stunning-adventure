/**
 * encodeFlags — canonical flag-bit encoding shared by codec.ts (wire framing)
 * and hash-chain.ts (hash pre-image).
 *
 * Both callers MUST stay identical — a mismatch would cause the on-disk frame
 * to disagree with the hash-chain commitment, breaking verifyChain.  Having a
 * single source of truth here prevents the two from drifting.
 */

import type { SegmentRecordFlags } from './types.js';

export function encodeFlags(f: SegmentRecordFlags): number {
  return (f.bootstrap       ? 0x01 : 0)
       | (f.declaredWindow  ? 0x02 : 0)
       | (f.syntheticOutput ? 0x04 : 0)
       | (f.taskBoundary    ? 0x08 : 0)
       | (f.manifestRoot    ? 0x10 : 0);
}
