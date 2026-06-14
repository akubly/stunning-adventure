/**
 * Acceptance tests — Pre-Commit Hook Veto (A3).
 *
 * Acceptance Scenario : A3 — Pre-Commit Hook Veto
 * User Story          : Aaron's "real-time safety floor"
 * TDD Strategy        : §4.2 Walkthrough B (docs/crucible-tdd-strategy.md)
 * Locked Decision     : OQ-2 FEDERATE — Crucible owns its own L1 WAL
 *                       (.squad/decisions.md)
 * Naming convention   : §8.5 — "[Layer] [Component] [Scenario] [Expected Behavior]"
 *                       Acceptance-level prefix: "Acceptance: ..."
 *
 * Invariants exercised (A3):
 *   1. Append rejects with 'Append vetoed by hook: policy-gate'
 *   2. Hook was invoked with the expected context object
 *   3. Ledger stays EMPTY after veto on empty ledger — no partial write
 *
 * Walkthrough B — prior-rows-survive-veto (Issue #61):
 *   4. When a session already has N committed rows and a hook VETOes row N+1,
 *      exactly N rows must remain (vetoed row absent, prior rows intact).
 *   5. The hash-chain head is unchanged by the veto (veto did not perturb
 *      existing history — no partial WAL write under a non-empty ledger).
 *   Covered for BOTH InMemoryWalBackend and FileSystemWalBackend.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';
import { randomUUID } from 'node:crypto';

import { createLedger } from '../../index.js';
import { InMemoryWalBackend }        from '../../ledger/wal-backend-in-memory.js';
import { createFileSystemWalBackend } from '../../ledger/wal-backend-fs.js';
import type { WalBackend }           from '../../ledger/ledger.js';
import type { SegmentRecord }        from '../../ledger/wal/types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Backends that expose the side-channel readSegmentRecords() (both impls). */
interface BackendWithRecords extends WalBackend {
  readSegmentRecords(): SegmentRecord[];
}

/** Snapshot the selfRoot of the last committed record (BLAKE3 hash-chain head). */
function captureHashChainHead(backend: BackendWithRecords): Uint8Array {
  const recs = backend.readSegmentRecords();
  if (recs.length === 0) throw new Error('captureHashChainHead: no records yet');
  return new Uint8Array(recs[recs.length - 1].selfRoot);
}

/** Compare two Uint8Arrays for byte-level equality. */
function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ─── Shared prior-rows-survive-veto suite ─────────────────────────────────────

/**
 * Issue #61 — Walkthrough B, prior-rows-survive-veto invariant.
 *
 * Parameterised so it runs identically against BOTH WalBackend impls.
 * makeHarness() is called fresh per test; cleanup() is called after.
 */
function runPriorRowsSurviveVetoSuite(
  implName: string,
  makeHarness: () => Promise<{
    backend:    BackendWithRecords;
    cleanup?:   () => Promise<void> | void;
  }>,
): void {
  describe(`Acceptance: prior-rows-survive-veto — ${implName} [Issue #61]`, () => {
    let harness: { backend: BackendWithRecords; cleanup?: () => Promise<void> | void };

    beforeEach(async () => {
      harness = await makeHarness();
    });

    afterEach(async () => {
      if (harness.cleanup) await harness.cleanup();
    });

    it(
      'Acceptance: veto on non-empty ledger leaves prior N rows intact and hash-chain head unchanged',
      async () => {
        const N = 3;
        const { backend } = harness;
        const ledger = await createLedger({ walBackend: backend });

        // ── Arrange: commit N rows before the veto hook is registered ──────────
        const priorPayloads = [
          { content: 'row-0', seq: 0 },
          { content: 'row-1', seq: 1 },
          { content: 'row-2', seq: 2 },
        ] as const;

        for (const payload of priorPayloads) {
          await ledger.append({
            primitiveKind: 'observation',
            primitivePayload: payload,
            causalReadSet: [],
          });
        }

        // Capture hash-chain head BEFORE the vetoed attempt.
        const headBefore = captureHashChainHead(backend);

        // Register veto hook AFTER prior rows are in place.
        await ledger.registerHook(
          'safety-gate',
          vi.fn().mockResolvedValue({ verdict: 'VETO', reason: 'Policy denied' }),
          { budget: 50_000 },
        );

        // ── Act: attempt append of row N+1 ────────────────────────────────────
        await expect(
          ledger.append({
            primitiveKind: 'request',
            primitivePayload: { content: 'forbidden-row' },
            causalReadSet: [],
          }),
        ).rejects.toThrow('Append vetoed by hook: safety-gate');

        // ── Assert: exactly N rows remain ─────────────────────────────────────
        const remaining = await ledger.queryEvents({ range: [0, 100] });
        expect(remaining).toHaveLength(N);

        // ── Assert: prior rows are byte-identical (unmodified content) ─────────
        for (let i = 0; i < N; i++) {
          expect(remaining[i].offset).toBe(i);
          expect(remaining[i].primitiveKind).toBe('observation');
          expect(remaining[i].primitivePayload).toEqual(priorPayloads[i]);
        }

        // ── Assert: hash-chain head is unchanged — veto did not write any WAL ──
        const headAfter = captureHashChainHead(backend);
        expect(uint8Equal(headBefore, headAfter)).toBe(true);

        // ── Assert: backend still has exactly N segment records ────────────────
        expect(backend.readSegmentRecords()).toHaveLength(N);
      },
    );
  });
}

// ─── Wire InMemoryWalBackend ───────────────────────────────────────────────────

runPriorRowsSurviveVetoSuite('InMemoryWalBackend', async () => ({
  backend: new InMemoryWalBackend(),
}));

// ─── Wire FileSystemWalBackend ─────────────────────────────────────────────────

runPriorRowsSurviveVetoSuite('FileSystemWalBackend', async () => {
  const rootDir   = path.join(os.tmpdir(), `crucible-veto-${randomUUID()}`);
  const sessionId = `sess-${randomUUID().slice(0, 8)}`;
  fs.mkdirSync(rootDir, { recursive: true });

  const backend = await createFileSystemWalBackend(rootDir, sessionId, {
    batchSize: 1, // immediate flush so readSegmentRecords reflects every commitRow
  });

  return {
    backend,
    cleanup: async () => {
      await backend.close();
      try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    },
  };
});

// ─── Original A3 test — empty-ledger veto ────────────────────────────────────

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
