/**
 * InMemoryWalBackend — in-process WalBackend implementation for unit/acceptance tests.
 *
 * GREEN phase (Walkthrough B): satisfies WalBackend commitRow + readRows.
 * Uses the sub-seam CAS and hash-chain internals built in Walkthrough B sub-seam
 * (wal/cas.ts, wal/hash-chain.ts) — commit offsets and hash-chaining are wired
 * so the in-memory backend behaves structurally like the real §3 substrate.
 *
 * File-system WalBackend (segment writes, fdatasync, index.idx) is deferred;
 * no RED test currently drives it.
 */

import type { PrimitiveInput } from '../types.js';
import type {
  WalBackend,
  LedgerEvent,
  LedgerQueryOpts,
} from './ledger.js';
import type { HookResult, HookVerdict } from './hook-bus.js';
import { buildChain } from './wal/hash-chain.js';
import { InMemoryCas } from './wal/cas.js';
import type { SegmentRecordInput } from './wal/types.js';
import { VERDICT_TO_WAL } from './wal/types.js';

const ZERO_HASH = new Uint8Array(32);

export class InMemoryWalBackend implements WalBackend {
  private readonly events: LedgerEvent[] = [];
  private readonly cas = new InMemoryCas();
  /** The selfRoot of the last committed row; ZERO_HASH for empty ledger. */
  private prevRoot = new Uint8Array(ZERO_HASH);

  async commitRow(
    input: PrimitiveInput,
    hookResult: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null },
  ): Promise<number> {
    const offset = this.events.length;

    // Write payload to CAS and get BLAKE3 hash
    const payloadBytes = new TextEncoder().encode(JSON.stringify(input.primitivePayload));
    const payloadHash = this.cas.put(payloadBytes);

    // readSet hash: zero-hash if empty causalReadSet
    const readSetHash = input.causalReadSet.length > 0
      ? this.cas.put(new TextEncoder().encode(JSON.stringify(input.causalReadSet)))
      : new Uint8Array(32);

    const rowInput: SegmentRecordInput = {
      commitOffset:  BigInt(offset),
      timestampNs:   BigInt(Date.now()) * 1_000_000n,
      primitiveKind: 0x01, // placeholder until §6 enum is locked
      hookVerdict:   VERDICT_TO_WAL[hookResult.verdict],
      flags: {
        bootstrap:       false,
        declaredWindow:  false,
        syntheticOutput: false,
        taskBoundary:    false,
        manifestRoot:    false,
      },
      payloadHash,
      readSetHash,
      envelopeCbor:  new Uint8Array(0),
    };

    // Build hash-chain link: genesis row gets prevRoot=ZERO_HASH,
    // subsequent rows get prevRoot=previous selfRoot.
    const [linked] = buildChain([rowInput], this.prevRoot);
    this.prevRoot = new Uint8Array(linked.selfRoot);

    this.events.push({ ...input, offset });
    return offset;
  }

  async readRows(opts: LedgerQueryOpts): Promise<LedgerEvent[]> {
    const [start, end] = opts.range;
    return this.events.filter(e => e.offset >= start && e.offset <= end);
  }
}
