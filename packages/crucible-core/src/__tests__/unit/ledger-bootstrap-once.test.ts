/**
 * Unit tests — LedgerImpl bootstrap-once invariant (F1 persona-review finding).
 *
 * Invariants exercised:
 *   BI-1: bootstrap() succeeds on the first call.
 *   BI-2: bootstrap() throws on a second call (duplicate-bootstrap guard).
 *   BI-3: bootstrap() throws when called after append() (order-invariant guard).
 *   BI-4: append() still works normally after a successful bootstrap().
 *   BI-5: bootstrap([]) throws — empty-input guard.
 *   BI-6: bootstrap() against a non-empty WAL throws — offset-0 contract.
 *   BI-7: a failed first commitRow leaves hasBootstrapped=false, allowing retry.
 */

import { describe, it, expect } from 'vitest';
import { createLedger } from '../../ledger/ledger-impl.js';
import type { WalBackend, LedgerEvent, LedgerQueryOpts } from '../../ledger/ledger.js';
import type { PrimitiveInput } from '../../types.js';
import type { HookResult, HookVerdict } from '../../ledger/hook-bus.js';

function makeInput() {
  return {
    primitiveKind:    'observation' as const,
    primitivePayload: { content: 'bootstrap-row' },
    causalReadSet:    [] as string[],
  };
}

// ─── Helpers for injectable WalBackend mocks ──────────────────────────────────

/** A WalBackend whose readRows always reports a pre-existing row at offset 0. */
function makeNonEmptyBackend(): WalBackend {
  const existing: LedgerEvent = {
    primitiveKind:    'observation' as const,
    primitivePayload: { content: 'pre-existing' },
    causalReadSet:    [],
    offset:           0,
  };
  return {
    async commitRow(_input: PrimitiveInput, _result: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null }): Promise<number> {
      return 0;
    },
    async readRows(_opts: LedgerQueryOpts): Promise<LedgerEvent[]> {
      return [existing];
    },
  };
}

/**
 * A WalBackend that fails its first commitRow call then succeeds thereafter.
 * readRows always reports empty (so bootstrap's pre-check passes).
 */
function makeFlakyBackend(): WalBackend {
  let calls = 0;
  return {
    async commitRow(_input: PrimitiveInput, _result: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null }): Promise<number> {
      calls++;
      if (calls === 1) throw new Error('simulated first-commit failure');
      return calls - 2; // offset 0 on the second (successful) first-row call
    },
    async readRows(_opts: LedgerQueryOpts): Promise<LedgerEvent[]> {
      return [];
    },
  };
}

describe('LedgerImpl bootstrap-once invariant', () => {
  it('BI-1: bootstrap() resolves with offset array on first call', async () => {
    const ledger = await createLedger();
    const offsets = await ledger.bootstrap([makeInput(), makeInput()]);
    expect(offsets).toEqual([0, 1]);
  });

  it('BI-2: second bootstrap() call throws with a clear message', async () => {
    const ledger = await createLedger();
    await ledger.bootstrap([makeInput()]);
    await expect(ledger.bootstrap([makeInput()])).rejects.toThrow(
      /bootstrap.*once|once.*bootstrap/i,
    );
  });

  it('BI-3: bootstrap() after append() throws with a clear message', async () => {
    const ledger = await createLedger();
    await ledger.append(makeInput());
    await expect(ledger.bootstrap([makeInput()])).rejects.toThrow(
      /bootstrap.*after.*append|after.*append/i,
    );
  });

  it('BI-4: append() continues normally after a successful bootstrap()', async () => {
    const ledger = await createLedger();
    await ledger.bootstrap([makeInput()]);
    const offset = await ledger.append(makeInput());
    expect(offset).toBe(1);
  });

  it('BI-5: bootstrap([]) throws — empty input is always a caller bug', async () => {
    const ledger = await createLedger();
    await expect(ledger.bootstrap([])).rejects.toThrow(
      /empty row array|at least one bootstrap row/i,
    );
  });

  it('BI-6: bootstrap() against a non-empty WAL throws — offset-0 contract', async () => {
    const ledger = await createLedger({ walBackend: makeNonEmptyBackend() });
    await expect(ledger.bootstrap([makeInput()])).rejects.toThrow(
      /non-empty WAL|offset-0/i,
    );
  });

  it('BI-7: failed first commitRow leaves hasBootstrapped=false, permitting a retry', async () => {
    const ledger = await createLedger({ walBackend: makeFlakyBackend() });

    // First call: commitRow throws on the first row → bootstrap should propagate
    // the error and leave hasBootstrapped=false.
    await expect(ledger.bootstrap([makeInput()])).rejects.toThrow(
      /simulated first-commit failure/,
    );

    // Second call: the backend now succeeds → bootstrap must be retryable.
    const offsets = await ledger.bootstrap([makeInput()]);
    expect(offsets).toEqual([0]);
  });
});
