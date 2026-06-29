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
  private hasBootstrapped: boolean;
  private hasAppended     = false;

  constructor(
    private readonly hookBus: HookBusPort,
    private readonly walBackend: WalBackend,
    private readonly onSubscriberError?: SubscriberErrorHook,
    reopen?: boolean,
  ) {
    // reopen=true means the session WAL already contains committed rows —
    // the caller will call append() directly without calling bootstrap().
    this.hasBootstrapped = reopen === true;
  }

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

    // (d) Non-VETO path — delegate to WAL backend.
    // Strip ALL structural walFlags when caller provided walFlags; omit
    // walFlags entirely when caller omitted it (preserves undefined shape).
    // Callers must not spoof any structural bit (bootstrap, declaredWindow,
    // syntheticOutput, taskBoundary, manifestRoot) via PrimitiveInput on the
    // append path.  bootstrap() sets its own bits internally; append-path rows
    // must carry no caller structural bits.
    const sanitizedInput: PrimitiveInput = input.walFlags !== undefined
      ? {
          ...input,
          walFlags: {
            ...(input.walFlags ?? {}),
            bootstrap:       false,
            declaredWindow:  false,
            syntheticOutput: false,
            taskBoundary:    false,
            manifestRoot:    false,
          },
        }
      : input;
    const offset = await this.walBackend.commitRow(sanitizedInput, result);

    // (e) Notify subscribers — fired after durable commit, before append resolves.
    // Each subscriber is isolated: a throwing subscriber MUST NOT affect the
    // returned offset, durability of the committed row, or other subscribers.
    // The row is already durable; swallowing the error prevents false retries
    // that would produce duplicate committed rows.
    // onSubscriberError (if injected) is called so callers can observe the fault
    // without polluting test output or risking a rethrow (#69).
    // Use sanitizedInput (not input) so the subscriber view agrees with the
    // persisted/replayed row — both see zero structural bits on the append path.
    if (this.subscribers.length > 0) {
      const event: LedgerEvent = { ...sanitizedInput, offset };
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
   * Each row is committed with walFlags.bootstrap=true (GAP-1 resolved, §3.8).
   *
   * Group-commit atomicity (GAP-2 resolved): all rows are staged via
   * stageRow() (if the backend supports it) before a single flush() call,
   * ensuring the entire batch commits in one fdatasync barrier regardless of
   * the backend's batchSize setting ("either every offset-0 Observation durable
   * or none" — §3.8).  Backends without stageRow fall back to commitRow();
   * for synchronous in-memory backends this is still effectively atomic.
   *
   * Subscriber notifications follow the same isolation contract as append():
   * a throwing subscriber must never affect commit durability or skip peers.
   *
   * INVARIANT: must be called exactly once, before any append(), against an
   * empty ledger (offset-0 contract), with at least one row.
   * Throws if called a second time, after append(), with empty input, or
   * against a non-empty WAL.  When the ledger was created with reopen:true,
   * this throws immediately (already-bootstrapped guard).
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
    if (rows.length === 0) {
      throw new Error(
        'LedgerImpl.bootstrap() called with an empty row array — at least one bootstrap row is required',
      );
    }

    // Verify the WAL is empty so offsets are guaranteed to start at 0.
    const probe = await this.walBackend.readRows({ range: [0, 0] });
    if (probe.length > 0) {
      throw new Error(
        'LedgerImpl.bootstrap() called against a non-empty WAL — bootstrap requires an ' +
        'empty ledger to guarantee offset-0. Use createLedger({ reopen: true }) to ' +
        'continue appending to an existing session.',
      );
    }

    const bootstrapResult = { verdict: 'COMMIT' as const, hookId: null };

    // Stage all rows with walFlags.bootstrap=true.
    // Use stageRow() only when BOTH stageRow() AND flush() are present — both
    // are required for atomic group-commit: stageRow() queues rows without
    // auto-flush, and flush() commits the entire batch in one fsync barrier
    // (BLOCKING-3).  A backend that has stageRow but no flush would hang at
    // Promise.all below because staged rows never resolve without a flush().
    // Fall back to commitRow() for backends without both (e.g.
    // InMemoryWalBackend), where rows commit synchronously.
    const rowInputs = rows.map(row => ({
      ...row,
      walFlags: { ...(row.walFlags ?? {}), bootstrap: true },
    }));
    const walBackend = this.walBackend;
    const rowPromises = rowInputs.map(input =>
      walBackend.stageRow && walBackend.flush
        ? walBackend.stageRow(input, bootstrapResult)
        : walBackend.commitRow(input, bootstrapResult),
    );

    // Flush atomically (GAP-2 / BLOCKING-3): all staged rows commit in one
    // fsync barrier when stageRow() was used. With commitRow() fallback,
    // rows were committed inline; flush() is a no-op.
    // BLOCKING-1: if flush() rejects, rowPromises may also reject. Drain them
    // with allSettled before re-throwing to prevent unhandled-rejection crashes.
    try {
      await (walBackend.flush?.() ?? Promise.resolve());
    } catch (e) {
      await Promise.allSettled(rowPromises);
      throw e;
    }

    // Await all row offsets — throws if any row failed (atomic abort applies
    // on group-commit backends that used stageRow()).  hasBootstrapped stays
    // false on failure so the caller may retry bootstrap() from scratch.
    // NOTE: retry is only viable when stageRow() was used — if the commitRow()
    // fallback path ran, a partial commit may have already written rows, making
    // the WAL non-empty and causing the next bootstrap() call to be rejected.
    const offsets = await Promise.all(rowPromises);

    // Mark as bootstrapped only after all rows are durable.
    this.hasBootstrapped = true;

    // Notify subscribers in offset order (same isolation as append()).
    if (this.subscribers.length > 0) {
      for (let i = 0; i < rowInputs.length; i++) {
        const offset = offsets[i];
        const event: LedgerEvent = { ...rowInputs[i], offset };
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

  // IMPORTANT: validate WAL is non-empty before honouring reopen:true.
  // If the WAL is empty, reopen:true is nonsensical — honouring it would
  // permanently block bootstrap() on a fresh session (the "SR-6 surprise").
  // Treat an empty WAL the same as reopen:false so the caller can still
  // bootstrap, regardless of the flag passed in.
  let reopen = opts?.reopen;
  if (reopen) {
    const probe = await walBackend.readRows({ range: [0, 0] });
    if (probe.length === 0) {
      reopen = false;
    }
  }

  return new LedgerImpl(hookBus, walBackend, opts?.onSubscriberError, reopen);
}
