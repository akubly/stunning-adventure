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
  LedgerSubscriber,
  WalBackend,
} from './ledger.js';

/**
 * Ledger extended with a one-shot bootstrap commit (SK-2, §3.8).
 *
 * bootstrap() must be called exactly once, before any append(), to commit the
 * materialized BootstrapPayload rows as the session's offset-0 batch.
 *
 * Import by direct path — barrel is Graham's lane:
 *   import { createLedger, type BootstrappableLedger }
 *     from '../ledger/ledger-impl.js';
 */
export interface BootstrappableLedger extends Ledger {
  /**
   * Commit the materialized bootstrap batch as the session's first rows.
   *
   * Each row is committed with verdict=COMMIT / hookId=null — bootstrap rows
   * are system-emitted context; the pre-commit hook bus is not consulted.
   * The WAL hookVerdict byte written is 0xFF (no predicate matched).
   *
   * Returns the assigned commit offsets (one per input row, starting at 0).
   *
   * Atomicity note (skeleton scope): rows are committed sequentially via the
   * existing commitRow path.  WAL-level group-commit atomicity for bootstrap
   * (§3.8 "either every row durable or none") is a Phase 1 concern — the
   * WalBackend interface does not yet expose a multi-row atomic-commit
   * primitive.  Tracked for Phase 1 wiring.
   */
  bootstrap(rows: PrimitiveInput[]): Promise<number[]>;
}
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

type SubscriberErrorHook = NonNullable<LedgerFactoryOptions['onSubscriberError']>;

class LedgerImpl implements BootstrappableLedger {
  private readonly subscribers: LedgerSubscriber[] = [];
  private hasBootstrapped = false;
  private hasAppended     = false;

  constructor(
    private readonly hookBus: HookBusPort,
    private readonly walBackend: WalBackend,
    private readonly onSubscriberError?: SubscriberErrorHook,
  ) {}

  subscribe(subscriber: LedgerSubscriber): void {
    this.subscribers.push(subscriber);
  }

  async append(input: PrimitiveInput): Promise<number> {
    this.hasAppended = true;
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
    const offset = await this.walBackend.commitRow(input, result);

    // (e) Notify subscribers — fired after durable commit, before append resolves.
    // Each subscriber is isolated: a throwing subscriber MUST NOT affect the
    // returned offset, durability of the committed row, or other subscribers.
    // The row is already durable; swallowing the error prevents false retries
    // that would produce duplicate committed rows.
    // onSubscriberError (if injected) is called so callers can observe the fault
    // without polluting test output or risking a rethrow (#69).
    if (this.subscribers.length > 0) {
      const event: LedgerEvent = { ...input, offset };
      for (const sub of this.subscribers) {
        try {
          sub.onCommit(offset, event);
        } catch (err) {
          // A throwing observability hook must never break append durability or
          // skip subsequent subscribers — the row is already durable at this point.
          try {
            this.onSubscriberError?.(offset, event, err, sub);
          } catch {
            // Last resort: swallow — observability must not propagate.
          }
        }
      }
    }

    return offset;
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

  /**
   * Commit the materialized bootstrap batch as the session's first rows (SK-2).
   *
   * Bypasses the hook bus — bootstrap rows are system-emitted context, not
   * subject to pre-commit policy hooks.  Each row uses verdict=COMMIT/hookId=null
   * which writes WAL hookVerdict byte 0xFF (no predicate matched, §3 seam §5).
   *
   * Subscriber notifications follow the same isolation contract as append():
   * a throwing subscriber must never affect commit durability or skip peers.
   *
   * INVARIANT: must be called exactly once, before any append(), against an
   * empty ledger (offset-0 contract), with at least one row.
   * Throws if called a second time, after append(), with empty input, or
   * against a non-empty WAL.
   *
   * Retry-safety: hasBootstrapped is only set to true after the FIRST row is
   * durably committed.  A failure before any row is written allows a full retry.
   * Once any row is durable, further bootstrap() calls are locked out because
   * they would produce non-zero starting offsets and violate the offset-0
   * contract.
   */
  async bootstrap(rows: PrimitiveInput[]): Promise<number[]> {
    if (this.hasBootstrapped) {
      throw new Error(
        'LedgerImpl.bootstrap() called more than once — bootstrap-once invariant violated',
      );
    }
    if (this.hasAppended) {
      throw new Error(
        'LedgerImpl.bootstrap() called after append() — bootstrap must precede all appends',
      );
    }
    // Empty bootstrap is always a caller bug: bootstrap rows are the session's
    // offset-0 batch. An empty call produces no rows, cannot satisfy the
    // offset-0 contract, and leaves hasBootstrapped=false — a confusing no-op
    // that would allow a second call with unpredictable offsets.
    if (rows.length === 0) {
      throw new Error(
        'LedgerImpl.bootstrap() called with an empty row array — at least one bootstrap row is required',
      );
    }

    // Verify the WAL is empty so offsets are guaranteed to start at 0.
    // "Session reopen" (bootstrapping against an existing WAL) is a Phase-1
    // feature; we refuse here to prevent silent offset corruption rather than
    // building reopen support now.
    const probe = await this.walBackend.readRows({ range: [0, 0] });
    if (probe.length > 0) {
      throw new Error(
        'LedgerImpl.bootstrap() called against a non-empty WAL — bootstrap requires an ' +
        'empty ledger to guarantee offset-0. Session-reopen support is deferred to Phase 1.',
      );
    }

    const offsets: number[] = [];

    for (const row of rows) {
      const offset = await this.walBackend.commitRow(row, {
        verdict: 'COMMIT' as const,
        hookId: null,
      });
      // Flip the guard only after the FIRST successful commit.  If the very
      // first commitRow throws, hasBootstrapped stays false and the caller may
      // legitimately retry bootstrap() from scratch (no rows are durable yet).
      // After the first commit succeeds, any subsequent commitRow failure leaves
      // hasBootstrapped=true, correctly locking out a retry that would produce
      // non-zero starting offsets.
      this.hasBootstrapped = true;
      offsets.push(offset);

      if (this.subscribers.length > 0) {
        const event: LedgerEvent = { ...row, offset };
        for (const sub of this.subscribers) {
          try {
            sub.onCommit(offset, event);
          } catch (err) {
            try {
              this.onSubscriberError?.(offset, event, err, sub);
            } catch {
              // Swallow — observability must not propagate.
            }
          }
        }
      }
    }

    return offsets;
  }
}

/**
 * createLedger — public factory exported from crucible-core.
 *
 * No-arg call uses an in-memory WalBackend (suitable for tests).
 * Pass `opts.walBackend` to wire the durable §3 file-system substrate.
 * Pass `opts.onSubscriberError` to observe swallowed subscriber errors (#69).
 *
 * Returns BootstrappableLedger (extends Ledger) — all existing Ledger consumers
 * are unaffected (covariant return type).  Graham's assembler can call
 * `.bootstrap(rows)` to commit offset-0 rows before the first `.append()`.
 */
export async function createLedger(opts?: LedgerFactoryOptions): Promise<BootstrappableLedger> {
  const walBackend = opts?.walBackend ?? new InMemoryWalBackend();
  const hookBus    = new PreCommitHookBus();
  return new LedgerImpl(hookBus, walBackend, opts?.onSubscriberError);
}
