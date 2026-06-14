/**
 * Unit tests — LedgerImpl subscriber error observability hook (#69).
 *
 * Gap addressed: LedgerImpl swallows subscriber onCommit() errors to protect
 * append durability (correct trade-off), but the error was previously invisible.
 * An `onSubscriberError` callback injected via LedgerFactoryOptions surfaces
 * these faults without rethrowing or polluting test output with console.error.
 *
 * Invariants exercised:
 *   SE-1: onSubscriberError is called when a subscriber throws.
 *   SE-2: append() still resolves with the commit offset when a subscriber throws.
 *   SE-3: The committed row is still readable (WAL durable) after a subscriber error.
 *   SE-4: onSubscriberError is NOT called when no subscriber throws.
 *   SE-5: A second subscriber still receives onCommit even when the first throws.
 *         (Per-subscriber isolation: one failing subscriber cannot cancel others.)
 *   SE-6: onSubscriberError receives the correct offset, event, error, and subscriber ref.
 */

import { describe, it, expect, vi } from 'vitest';
import { createLedger } from '../../ledger/ledger-impl.js';
import type { LedgerSubscriber, LedgerEvent } from '../../ledger/ledger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeInput() {
  return {
    primitiveKind:    'observation' as const,
    primitivePayload: { content: 'test' },
    causalReadSet:    [] as string[],
    metadata:         { level: 'info' as const },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LedgerImpl subscriber error hook (#69)', () => {
  it('SE-1: onSubscriberError is called when a subscriber throws', async () => {
    const errorHook = vi.fn();
    const ledger = await createLedger({ onSubscriberError: errorHook });

    const throwingSubscriber: LedgerSubscriber = {
      onCommit() { throw new Error('subscriber boom'); },
    };
    ledger.subscribe(throwingSubscriber);

    await ledger.append(makeInput());

    expect(errorHook).toHaveBeenCalledTimes(1);
  });

  it('SE-2: append() resolves successfully even when subscriber throws', async () => {
    const errorHook = vi.fn();
    const ledger = await createLedger({ onSubscriberError: errorHook });

    ledger.subscribe({ onCommit() { throw new Error('boom'); } });

    const offset = await ledger.append(makeInput());

    expect(typeof offset).toBe('number');
    expect(offset).toBe(0);
  });

  it('SE-3: committed row is readable after a subscriber error', async () => {
    const ledger = await createLedger({
      onSubscriberError: vi.fn(),
    });
    ledger.subscribe({ onCommit() { throw new Error('boom'); } });

    await ledger.append(makeInput());

    const events = await ledger.queryEvents({ range: [0, 0] });
    expect(events).toHaveLength(1);
    expect(events[0].primitiveKind).toBe('observation');
  });

  it('SE-4: onSubscriberError is NOT called when subscriber succeeds', async () => {
    const errorHook = vi.fn();
    const ledger = await createLedger({ onSubscriberError: errorHook });

    ledger.subscribe({ onCommit() { /* no throw */ } });

    await ledger.append(makeInput());

    expect(errorHook).not.toHaveBeenCalled();
  });

  it('SE-5: second subscriber still receives onCommit when the first subscriber throws', async () => {
    const ledger = await createLedger({ onSubscriberError: vi.fn() });

    const secondCalled = vi.fn();
    ledger.subscribe({ onCommit() { throw new Error('first throws'); } });
    ledger.subscribe({ onCommit: secondCalled });

    await ledger.append(makeInput());

    expect(secondCalled).toHaveBeenCalledTimes(1);
  });

  it('SE-6: onSubscriberError receives correct offset, event, error, and subscriber', async () => {
    const errorHook = vi.fn();
    const ledger = await createLedger({ onSubscriberError: errorHook });

    const sentinelErr = new Error('sentinel');
    const sub: LedgerSubscriber = { onCommit() { throw sentinelErr; } };
    ledger.subscribe(sub);

    await ledger.append(makeInput());

    const [offset, event, err, subscriberRef] = errorHook.mock.calls[0] as [number, LedgerEvent, unknown, LedgerSubscriber];
    expect(offset).toBe(0);
    expect(event.offset).toBe(0);
    expect(event.primitiveKind).toBe('observation');
    expect(err).toBe(sentinelErr);
    expect(subscriberRef).toBe(sub);
  });

  it('SE-1b: without onSubscriberError, append still resolves (no hook needed)', async () => {
    // Regression guard: the default path (no error hook injected) still works.
    const ledger = await createLedger(); // no onSubscriberError
    ledger.subscribe({ onCommit() { throw new Error('boom'); } });

    await expect(ledger.append(makeInput())).resolves.toBe(0);
  });
});
