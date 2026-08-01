/**
 * Unit tests — LedgerImpl append-path walFlags sanitization.
 *
 * Invariants exercised:
 *   FS-1: bootstrap flag is stripped on the append path.
 *   FS-2: declaredWindow flag is stripped on the append path.
 *   FS-3: syntheticOutput flag is stripped on the append path.
 *   FS-4: taskBoundary flag is stripped on the append path.
 *   FS-5: manifestRoot flag is stripped on the append path.
 *   FS-6: subscriber sees the same (sanitized) walFlags as the persisted row —
 *         subscriber and durable write agree on all structural bits.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLedger } from '../../ledger/ledger-impl.js';
import { InMemoryWalBackend } from '../../ledger/wal-backend-in-memory.js';
import type { LedgerEvent, LedgerSubscriber } from '../../ledger/ledger.js';
import type { WalRowFlags } from '../../types.js';

/** All structural walFlags set to true — worst-case spoofed input. */
const ALL_STRUCTURAL_FLAGS: WalRowFlags = {
  bootstrap:       true,
  declaredWindow:  true,
  syntheticOutput: true,
  taskBoundary:    true,
  manifestRoot:    true,
};

function makeInput(walFlags?: WalRowFlags) {
  return {
    primitiveKind:    'observation' as const,
    primitivePayload: { content: 'test' },
    causalReadSet:    [] as string[],
    walFlags,
  };
}

describe('LedgerImpl append-path walFlags sanitization', () => {
  it('FS-1: bootstrap flag is stripped — append-path row carries bootstrap=false', async () => {
    const backend = new InMemoryWalBackend();
    const ledger = await createLedger({ walBackend: backend });

    await ledger.append(makeInput({ bootstrap: true }));

    const [record] = backend.readSegmentRecords();
    expect(record.flags.bootstrap).toBe(false);
  });

  it('FS-2: declaredWindow flag is stripped on the append path', async () => {
    const backend = new InMemoryWalBackend();
    const ledger = await createLedger({ walBackend: backend });

    await ledger.append(makeInput({ declaredWindow: true }));

    const [record] = backend.readSegmentRecords();
    expect(record.flags.declaredWindow).toBe(false);
  });

  it('FS-3: syntheticOutput flag is stripped on the append path', async () => {
    const backend = new InMemoryWalBackend();
    const ledger = await createLedger({ walBackend: backend });

    await ledger.append(makeInput({ syntheticOutput: true }));

    const [record] = backend.readSegmentRecords();
    expect(record.flags.syntheticOutput).toBe(false);
  });

  it('FS-4: taskBoundary flag is stripped on the append path', async () => {
    const backend = new InMemoryWalBackend();
    const ledger = await createLedger({ walBackend: backend });

    await ledger.append(makeInput({ taskBoundary: true }));

    const [record] = backend.readSegmentRecords();
    expect(record.flags.taskBoundary).toBe(false);
  });

  it('FS-5: manifestRoot flag is stripped on the append path', async () => {
    const backend = new InMemoryWalBackend();
    const ledger = await createLedger({ walBackend: backend });

    await ledger.append(makeInput({ manifestRoot: true }));

    const [record] = backend.readSegmentRecords();
    expect(record.flags.manifestRoot).toBe(false);
  });

  it('FS-5b: ALL structural flags stripped simultaneously (spoofed input)', async () => {
    const backend = new InMemoryWalBackend();
    const ledger = await createLedger({ walBackend: backend });

    await ledger.append(makeInput(ALL_STRUCTURAL_FLAGS));

    const [record] = backend.readSegmentRecords();
    expect(record.flags.bootstrap).toBe(false);
    expect(record.flags.declaredWindow).toBe(false);
    expect(record.flags.syntheticOutput).toBe(false);
    expect(record.flags.taskBoundary).toBe(false);
    expect(record.flags.manifestRoot).toBe(false);
  });

  it('FS-6: subscriber sees sanitized walFlags — agrees with the persisted row', async () => {
    const backend = new InMemoryWalBackend();
    const capturedEvents: LedgerEvent[] = [];
    const sub: LedgerSubscriber = {
      onCommit(_offset, event) { capturedEvents.push(event); },
    };

    const ledger = await createLedger({ walBackend: backend });
    ledger.subscribe(sub);

    await ledger.append(makeInput(ALL_STRUCTURAL_FLAGS));

    // Subscriber must have fired once
    expect(capturedEvents).toHaveLength(1);
    const subEvent = capturedEvents[0];

    // Persisted row from WAL
    const [record] = backend.readSegmentRecords();

    // Both must agree: all structural bits are false
    expect(subEvent.walFlags?.bootstrap).toBe(false);
    expect(subEvent.walFlags?.declaredWindow).toBe(false);
    expect(subEvent.walFlags?.syntheticOutput).toBe(false);
    expect(subEvent.walFlags?.taskBoundary).toBe(false);
    expect(subEvent.walFlags?.manifestRoot).toBe(false);

    expect(record.flags.bootstrap).toBe(false);
    expect(record.flags.declaredWindow).toBe(false);
    expect(record.flags.syntheticOutput).toBe(false);
    expect(record.flags.taskBoundary).toBe(false);
    expect(record.flags.manifestRoot).toBe(false);
  });

  it('FS-6b: subscriber and queryEvents agree on sanitized walFlags (replay path)', async () => {
    const backend = new InMemoryWalBackend();
    const capturedEvents: LedgerEvent[] = [];
    const ledger = await createLedger({ walBackend: backend });
    ledger.subscribe({ onCommit(_o, e) { capturedEvents.push(e); } });

    await ledger.append(makeInput(ALL_STRUCTURAL_FLAGS));

    const [queriedEvent] = await ledger.queryEvents({ range: [0, 0] });
    const [subEvent] = capturedEvents;

    // Both views must agree on all structural bits being cleared
    for (const flag of ['bootstrap', 'declaredWindow', 'syntheticOutput', 'taskBoundary', 'manifestRoot'] as const) {
      expect(subEvent.walFlags?.[flag]).toBe(queriedEvent.walFlags?.[flag]);
    }
  });
});
