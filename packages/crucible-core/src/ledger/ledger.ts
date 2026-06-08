/**
 * Ledger interface + WalBackend port — the seam joining two converging tracks:
 *   Track 1 (Roger)       : §3 WAL substrate — durable, BLAKE3 hash-chained,
 *                           content-addressed, append-only backend.
 *   Track 2 (Laura/Roger) : §4.2 Walkthrough B — pre-commit hook-veto gate.
 *
 * SEAM CONTRACT (Graham, Lead/Architect — 2026-06-06T22:03:01-07:00)
 * Authority: .squad/decisions/inbox/graham-ledger-seam.md
 *
 * These are pure interface/type declarations. No implementation bodies.
 *
 * KEY INVARIANT: hook bus fires BEFORE any WAL byte is written.
 * VETO verdict → Ledger.append throws, WalBackend.commitRow is never called.
 * PAUSE verdict → row is written (hookVerdict=pause in WAL header), then
 *                 seal-and-split executes inside WalBackend (§3.5).
 */

import type { PrimitiveInput, Primitive } from '../types.js';
import type {
  HookPredicate,
  HookRegistrationOpts,
  HookResult,
  HookVerdict,
} from './hook-bus.js';

// Re-export for consumers who import from this module.
export type { HookVerdict, HookPredicate, HookRegistrationOpts, HookResult };

// ─── Ledger event (committed row) ────────────────────────────────────────────

/**
 * A committed Ledger event — PrimitiveInput plus its monotonic commit offset.
 * Aliases Primitive (the existing committed row type) at the Ledger boundary.
 */
export type LedgerEvent = Primitive;

// ─── Query options ───────────────────────────────────────────────────────────

/**
 * Options for querying committed events from a Ledger.
 *
 * Locked by §4.2 RED test: `await ledger.queryEvents({ range: [0, 100] })`.
 * Range convention matches existing DB.queryEvents: inclusive on both ends.
 */
export interface LedgerQueryOpts {
  /**
   * Inclusive-inclusive [startOffset, endOffset] pair.
   * Example: [0, 46] returns offsets 0 through 46 (up to 47 events).
   */
  range: [number, number];
}

// ─── Factory options ──────────────────────────────────────────────────────────

/**
 * Options accepted by the createLedger factory.
 *
 * walBackend is optional: when omitted the factory uses an in-memory backend
 * (suitable for tests and RED-phase runs). Roger's GREEN phase passes the
 * real §3 WalBackend here to wire the durable, hash-chained substrate.
 */
export interface LedgerFactoryOptions {
  walBackend?: WalBackend;
}

/**
 * Factory type for createLedger.
 *
 * Roger implements this function and exports it from crucible-core.
 * Signature locked by §4.2 RED test: `const ledger = await createLedger()`.
 * The no-arg call must work (in-memory backend default).
 */
export type CreateLedger = (opts?: LedgerFactoryOptions) => Promise<Ledger>;

// ─── Ledger interface ─────────────────────────────────────────────────────────

/**
 * Ledger — the public append/query/hook interface.
 *
 * This is the contract both tracks depend on:
 *   - §4.2 acceptance test (Laura/Roger) imports and instantiates via createLedger().
 *   - §3 WAL substrate (Roger) is the backing store behind WalBackend.
 *
 * append() invariants (pinned by §4.2 RED test — ALL THREE must hold):
 *   1. Rejects with Error('Append vetoed by hook: <hookId>') on VETO.
 *   2. Hook is invoked with { primitiveKind, primitivePayload, metadata } context
 *      BEFORE any WAL byte is written.
 *   3. Ledger stays EMPTY after a veto — no partial write, no WAL row created.
 *
 * VETO invariant implementation rule for Roger's GREEN:
 *   (a) Build HookContext from PrimitiveInput.
 *   (b) Call hookBus.fire(ctx).
 *   (c) If result.verdict === 'VETO': throw new Error(`Append vetoed by hook: ${result.hookId}`).
 *   (d) Only if non-VETO: call walBackend.commitRow(input, result).
 *
 * There MUST NOT be any WAL write, CAS write, or fdatasync between steps (b) and (c).
 */
export interface Ledger {
  /**
   * Append a primitive to the ledger.
   *
   * Fires the hook bus before any WAL write. Returns the monotonic commit offset
   * assigned to the new row. Throws on VETO (no row committed).
   *
   * Locked signature (§4.2 RED test):
   *   ledger.append({ primitiveKind, primitivePayload, causalReadSet })
   *   → Promise<number>  (resolves to commitOffset; rejects on VETO)
   */
  append(input: PrimitiveInput): Promise<number>;

  /**
   * Register a pre-commit hook.
   *
   * The hook fires on every subsequent append, before the WAL write.
   * Registration order determines evaluation order (deterministic, FIFO).
   *
   * Locked signature (§4.2 RED test):
   *   await ledger.registerHook('policy-gate', vetoHook, { budget: 50_000 })
   */
  registerHook(id: string, predicate: HookPredicate, opts: HookRegistrationOpts): Promise<void>;

  /**
   * Deregister a previously registered hook by id.
   *
   * A `predicate_unregistered` Observation row is staged after the current
   * append finishes — hook dispatch MUST NOT perform a nested WAL append (§4.3).
   */
  unregisterHook(id: string): Promise<void>;

  /**
   * Query committed events in the inclusive offset range [start, end].
   *
   * Locked signature (§4.2 RED test):
   *   await ledger.queryEvents({ range: [0, 100] })  → LedgerEvent[]
   */
  queryEvents(opts: LedgerQueryOpts): Promise<LedgerEvent[]>;
}

// ─── WalBackend port ──────────────────────────────────────────────────────────

/**
 * WalBackend — the persistence port Roger implements for the §3 WAL substrate.
 *
 * This is the ONLY boundary through which the Ledger touches durable storage.
 * Everything above (hook bus, veto logic, error messages) is the Ledger's concern.
 * Everything below (BLAKE3 hashing, segment encoding, fdatasync, CAS writes) is
 * Roger's concern.
 *
 * CONTRACT:
 *   - commitRow() is called ONLY after hook bus returns non-VETO (§3.4 append protocol).
 *   - VETO never reaches this method; the Ledger throws before calling it.
 *   - PAUSE: row IS written (WAL row header: hookVerdict = 'pause'), then
 *     seal-and-split executes internally per §3.5. Caller does not manage restaging.
 *   - COMMIT/OBSERVE: row is written normally, hookVerdict = 'continue'/'observe'.
 *   - commitRow() returns commitOffset as number. §3's CommitOffset is bigint
 *     internally; Roger maps bigint → number at the boundary. See seam note §6
 *     in graham-ledger-seam.md. Upgrade to bigint if overflow risk materialises.
 *
 * WAL-layer verdict vocabulary mapping (Roger's internal concern):
 *   COMMIT  → hookVerdict = 'continue' (or null if no predicate matched)
 *   OBSERVE → hookVerdict = 'observe'
 *   PAUSE   → hookVerdict = 'pause'
 *   VETO    → never reaches WalBackend; Ledger.append throws first
 */
export interface WalBackend {
  /**
   * Persist a pre-validated row to the active WAL segment.
   *
   * hookResult carries the aggregate verdict (non-VETO) plus optional hookId
   * and reason for the CAS hookVerdictWitness body (§3.2 / §4.1).
   * Returns the monotonic commitOffset assigned to this row.
   */
  commitRow(
    input: PrimitiveInput,
    hookResult: HookResult & {
      verdict: Exclude<HookVerdict, 'VETO'>;
      hookId: string | null;
    },
  ): Promise<number>;

  /**
   * Read committed rows in the inclusive offset range [start, end].
   * Mirrors the Ledger.queryEvents({ range }) contract.
   */
  readRows(opts: LedgerQueryOpts): Promise<LedgerEvent[]>;
}
