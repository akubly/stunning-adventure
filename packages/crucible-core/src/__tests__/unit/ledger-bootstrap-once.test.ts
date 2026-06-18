/**
 * Unit tests — LedgerImpl bootstrap-once invariant (F1 persona-review finding).
 *
 * Invariants exercised:
 *   BI-1: bootstrap() succeeds on the first call.
 *   BI-2: bootstrap() throws on a second call (duplicate-bootstrap guard).
 *   BI-3: bootstrap() throws when called after append() (order-invariant guard).
 *   BI-4: append() still works normally after a successful bootstrap().
 */

import { describe, it, expect } from 'vitest';
import { createLedger } from '../../ledger/ledger-impl.js';

function makeInput() {
  return {
    primitiveKind:    'observation' as const,
    primitivePayload: { content: 'bootstrap-row' },
    causalReadSet:    [] as string[],
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
});
