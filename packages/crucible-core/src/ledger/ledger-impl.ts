/**
 * LedgerImpl + createLedger factory — Walkthrough B GREEN implementation.
 *
 * Wires PreCommitHookBus (hook-bus-impl.ts) and WalBackend (default:
 * InMemoryWalBackend) together per the seam protocol in graham-ledger-seam.md.
 *
 * VETO protocol (Aaron ruling, Option A — pre-WAL gate):
 *   (a) Build HookContext from PrimitiveInput.
 *   (b) hookBus.fire(ctx)
 *   (c) If verdict === 'VETO': throw Error('Append vetoed by hook: <hookId>')
 *       No WAL byte written — walBackend.commitRow is NEVER called on VETO.
 *   (d) Non-VETO: walBackend.commitRow(input, result) → commitOffset
 */

import type { PrimitiveInput } from '../types.js';
import type {
  Ledger,
  LedgerEvent,
  LedgerFactoryOptions,
  LedgerQueryOpts,
  WalBackend,
} from './ledger.js';
import type {
  HookContext,
  HookPredicate,
  HookRegistrationOpts,
  HookResult,
  HookVerdict,
  HookBusPort,
} from './hook-bus.js';
import { PreCommitHookBus } from './hook-bus-impl.js';
import { InMemoryWalBackend } from './wal-backend-in-memory.js';

/** Type guard: narrows HookResult to non-VETO variants without an `as` cast. */
function isNonVeto(
  r: HookResult & { hookId: string | null },
): r is HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } {
  return r.verdict !== 'VETO';
}

class LedgerImpl implements Ledger {
  constructor(
    private readonly hookBus: HookBusPort,
    private readonly walBackend: WalBackend,
  ) {}

  async append(input: PrimitiveInput): Promise<number> {
    // (a) Build hook context — no I/O, no WAL staging
    // metadata.source is intentionally not populated here (no RED test drives
    // extraction from primitivePayload in this slice; reserved for future use).
    const ctx: HookContext = {
      primitiveKind:    input.primitiveKind,
      primitivePayload: input.primitivePayload,
      metadata: {
        timestamp: Date.now(),
      },
    };

    // (b) Fire hook bus — before any WAL byte
    const result = await this.hookBus.fire(ctx);

    // (c) VETO gate — throw immediately, nothing written; narrows type for commitRow
    if (!isNonVeto(result)) {
      throw new Error(`Append vetoed by hook: ${result.hookId}`);
    }

    // (d) Non-VETO path — delegate to WAL backend
    return this.walBackend.commitRow(input, result);
  }

  async registerHook(
    id: string,
    predicate: HookPredicate,
    opts: HookRegistrationOpts,
  ): Promise<void> {
    return this.hookBus.register(id, predicate, opts);
  }

  async unregisterHook(id: string): Promise<void> {
    return this.hookBus.unregister(id);
  }

  async queryEvents(opts: LedgerQueryOpts): Promise<LedgerEvent[]> {
    return this.walBackend.readRows(opts);
  }
}

/**
 * createLedger — public factory exported from crucible-core.
 *
 * No-arg call uses an in-memory WalBackend (suitable for tests).
 * Pass `opts.walBackend` to wire the durable §3 file-system substrate.
 */
export async function createLedger(opts?: LedgerFactoryOptions): Promise<Ledger> {
  const walBackend = opts?.walBackend ?? new InMemoryWalBackend();
  const hookBus    = new PreCommitHookBus();
  return new LedgerImpl(hookBus, walBackend);
}
