/**
 * HookBus type boundary — the seam between Ledger and the pre-commit hook bus.
 *
 * SEAM CONTRACT (Graham, Lead/Architect — 2026-06-06T22:03:01-07:00)
 * Authority: .squad/decisions/inbox/graham-ledger-seam.md
 *
 * These are pure type/interface declarations. No implementation bodies.
 *
 * Consumed by:
 *   - Roger  : §3 WAL substrate GREEN — wires PreCommitHookBus (§4) behind HookBusPort.
 *   - Laura/Roger: §4.2 Walkthrough B GREEN — implements HookPredicate for the veto gate.
 *
 * ⚠ HookVerdict naming fork: §3/§4 WAL spec uses lowercase `continue | observe | pause`;
 *   §4.2 TDD sketch uses UPPERCASE `COMMIT | PAUSE | VETO`. The seam adopts UPPERCASE
 *   at the Ledger API boundary; the WalBackend maps to WAL-row vocabulary internally.
 *   VETO is not present in §4's verdict set — see graham-ledger-seam-OPEN.md for
 *   the open question pending Aaron's ruling (marked PROVISIONAL below).
 */

import type { PrimitiveKind } from '../types.js';

// ─── Verdict ────────────────────────────────────────────────────────────────

/**
 * Verdict returned by a Hook predicate at the Ledger API boundary.
 *
 * COMMIT  — row proceeds; maps to §4 `continue` in the WAL row.
 * OBSERVE — row proceeds + attention signal emitted; maps to §4 `observe`.
 * PAUSE   — row commits durably with pause verdict; triggers §3.5 seal-and-split.
 *           Maps to §4 `pause`. Router receives broadcast via L1Subscriber.
 * VETO    — ⚠ PROVISIONAL — append() throws before any WAL byte is written;
 *           no WAL row is created. Not present in §4's verdict vocabulary.
 *           Introduced by §4.2 RED acceptance test. Pending Aaron's ruling.
 *
 * Precedence when multiple hooks fire: VETO > PAUSE > OBSERVE > COMMIT.
 */
export type HookVerdict = 'COMMIT' | 'OBSERVE' | 'PAUSE' | 'VETO';

// ─── Hook context ────────────────────────────────────────────────────────────

/**
 * Metadata injected by Ledger.append into every HookContext.
 * Shape pinned by §4.2 RED test: `metadata: expect.any(Object)`.
 * Implementations may add fields additively; do not remove existing ones.
 */
export interface HookMetadata {
  /** UTC epoch milliseconds assigned by Ledger.append at invocation time. */
  timestamp: number;
  /**
   * Caller-supplied source tag extracted from primitivePayload envelope, if present.
   * Used by §4.2 test: primitivePayload = { source: 'external', ... }.
   */
  source?: string;
}

/**
 * Context object passed to every Hook predicate on each append.
 *
 * Shape pinned by §4.2 RED test invariant 2:
 *   expect(vetoHook).toHaveBeenCalledWith({ primitiveKind, primitivePayload, metadata })
 */
export interface HookContext {
  primitiveKind: PrimitiveKind;
  primitivePayload: unknown;
  metadata: HookMetadata;
}

// ─── Hook predicate ──────────────────────────────────────────────────────────

/** Result returned by a Hook predicate. */
export interface HookResult {
  verdict: HookVerdict;
  /**
   * Human-readable reason.
   * On VETO: surfaced in the thrown error message.
   * On PAUSE/OBSERVE: written to the CAS hookVerdictWitness body (§3.2 / §4.1).
   */
  reason?: string;
}

/**
 * A Hook predicate function.
 *
 * Declared async (returns Promise<HookResult>) to match §4.2's vi.fn().mockResolvedValue()
 * shape. v1 predicates are expected to resolve quickly (§4.3 cooperative 80 µs budget).
 * True async/await is legal but over-budget completions emit attention + quarantine.
 */
export type HookPredicate = (ctx: HookContext) => Promise<HookResult>;

// ─── Registration ────────────────────────────────────────────────────────────

/**
 * Options for registering a Hook.
 *
 * Locked by §4.2 RED test: `ledger.registerHook('policy-gate', vetoHook, { budget: 50_000 })`.
 */
export interface HookRegistrationOpts {
  /**
   * Cooperative per-evaluation budget in microseconds.
   * Over-budget completions emit `predicate_timeout` attention (§4.3),
   * decrement the hook's retry budget, and quarantine when exhausted.
   */
  budget: number;
}

// ─── HookBusPort ─────────────────────────────────────────────────────────────

/**
 * HookBusPort — the interface the Ledger uses to interact with the hook bus.
 *
 * Invariants (enforced by Ledger.append, not by this interface):
 *   1. fire() is called INSIDE the group-commit window, BEFORE any fsync (§3.5).
 *   2. VETO: Ledger.append MUST throw immediately; MUST NOT call WalBackend.commitRow.
 *   3. PAUSE: Ledger passes verdict to WalBackend; backend triggers §3.5 seal-and-split.
 *   4. Registration order is deterministic (FIFO); unregistration is immediate for
 *      future rows. In-flight dispatches always complete to the current registered set.
 *
 * Roger wires the full §4 PreCommitHookBus (kind-indexed dispatch, subscriber policy,
 * CAS witness writes) behind this port. In-memory implementations satisfy it directly.
 */
export interface HookBusPort {
  /**
   * Register a hook predicate.
   * May be async if registration itself appends a `predicate_registered` Observation
   * row to the WAL (§4.2 — registration is recorded for replay determinism).
   */
  register(id: string, predicate: HookPredicate, opts: HookRegistrationOpts): Promise<void>;

  /**
   * Deregister a hook by id.
   * A `predicate_unregistered` Observation is staged after the current append finishes
   * (§4.3 — hook dispatch MUST NOT perform a nested WAL append).
   */
  unregister(id: string): Promise<void>;

  /**
   * Fire all registered hooks against a single row context.
   *
   * Returns the aggregate HookResult plus the id of the hook that determined the verdict
   * (needed by Ledger.append to construct 'Append vetoed by hook: <hookId>' messages).
   *
   * Aggregate verdict precedence: VETO > PAUSE > OBSERVE > COMMIT.
   * If no hook is registered, returns { verdict: 'COMMIT' } (zero-cost path, §4 P5).
   */
  fire(ctx: HookContext): Promise<HookResult & { hookId: string | null }>;
}
