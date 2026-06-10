/**
 * RED acceptance test — Pre-Commit Hook Veto Prevents Primitive Append (A3).
 *
 * Acceptance Scenario : A3 — Pre-Commit Hook Veto
 * User Story          : Aaron's "real-time safety floor"
 * TDD Strategy        : §4.2 Walkthrough B (docs/crucible-tdd-strategy.md)
 * Locked Decision     : OQ-2 FEDERATE — Crucible owns its own L1 WAL
 *                       (.squad/decisions.md)
 * Naming convention   : §8.5 — "[Layer] [Component] [Scenario] [Expected Behavior]"
 *                       Acceptance-level prefix: "Acceptance: ..."
 *
 * This is RED: `createLedger` / `registerHook` / `append` do not exist yet.
 * Expected failure: "createLedger is not defined" (or import/type error).
 *
 * SEAM-ALIGNMENT NOTE: Graham's ledger-seam contract file
 * (.squad/decisions/inbox/graham-ledger-seam.md) did NOT exist at RED-phase
 * authorship time (2026-06-06). If Graham's locked seam ships with different
 * `createLedger` / `registerHook` / `append` signatures, this test's imports
 * and call sites must be realigned to the seam before GREEN.
 *
 * Invariants exercised (A3):
 *   1. Append rejects with 'Append vetoed by hook: policy-gate'
 *   2. Hook was invoked with the expected context object
 *   3. Ledger stays EMPTY after veto — no partial write
 */

import { describe, it, expect, vi } from 'vitest';
import { createLedger } from '../../index.js';

describe('Pre-Commit Hook Veto', () => {
  it('Acceptance: prevents append when policy hook returns VETO [policy-gate, external-source, empty-ledger]', async () => {
    // ── Arrange: Ledger with registered hook ─────────────────────────────────
    const ledger = await createLedger();
    const vetoHook = vi.fn().mockResolvedValue({ verdict: 'VETO', reason: 'External source denied' });

    await ledger.registerHook('policy-gate', vetoHook, { budget: 50_000 }); // 50ms

    // ── Act: Attempt to append external-source primitive ─────────────────────
    const appendPromise = ledger.append({
      primitiveKind: 'request',
      primitivePayload: { source: 'external', content: 'dangerous request' },
      causalReadSet: [],
    });

    // ── Assert: Append rejected with hook-attribution message ─────────────────
    await expect(appendPromise).rejects.toThrow('Append vetoed by hook: policy-gate');

    // ── Assert: Hook was invoked with expected context ────────────────────────
    expect(vetoHook).toHaveBeenCalledWith({
      primitiveKind: 'request',
      primitivePayload: expect.objectContaining({ source: 'external' }),
      metadata: expect.any(Object),
    });

    // ── Assert: Ledger stays EMPTY — no partial write ─────────────────────────
    const events = await ledger.queryEvents({ range: [0, 100] });
    expect(events).toHaveLength(0);
  });
});
