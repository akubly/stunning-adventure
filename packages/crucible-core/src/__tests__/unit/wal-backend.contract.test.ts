/**
 * Shared WalBackend contract test — I6 (strengthened in cycle-2 review).
 *
 * Runs the same behavioral invariants against BOTH concrete WalBackend
 * implementations to prevent fs/in-memory verdict-persistence drift.
 *
 * Pattern: runWalBackendContract(implName, makeHarness)
 *   makeHarness() — called fresh per test (beforeEach) → isolated instance.
 *
 * Invariants:
 *   CL-1: append → read round-trip (happy path)
 *   CL-2: offset monotonicity (each commitRow returns offset = previous + 1)
 *   CL-3: verdict → hookVerdict byte (COMMIT=0x00, OBSERVE=0x01, PAUSE=0x02)
 *         — asserts the persisted byte so mapping drift between backends FAILS.
 *   CL-4: read-range semantics (inclusive [start, end]; out-of-range returns empty)
 *   CL-5: PAUSE-verdict row is readable via readRows after flush
 *
 * FS-only:
 *   CL-6: PAUSE hookVerdict byte survives close+reopen (durable backend)
 *
 * Skill refs:
 *   .squad/skills/interface-contract-test-suite/SKILL.md
 *   .squad/skills/contract-test-shared-helper/SKILL.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';
import { randomUUID } from 'node:crypto';

import { InMemoryWalBackend }        from '../../ledger/wal-backend-in-memory.js';
import { createFileSystemWalBackend } from '../../ledger/wal-backend-fs.js';
import type { WalBackend }           from '../../ledger/ledger.js';
import type { PrimitiveInput }       from '../../types.js';
import type { HookResult, HookVerdict } from '../../ledger/hook-bus.js';

// ─── Harness ──────────────────────────────────────────────────────────────────

interface WalBackendHarness {
  backend: WalBackend;
  /**
   * Side-channel: return the persisted hookVerdict byte for the committed row
   * at the given offset. Throws if no record exists at that offset.
   * Both backends must implement this — it is the primary drift guard.
   */
  readVerdictByte: (offset: number) => Promise<number>;
  /** Some backends (fs batchSize>1) need an explicit flush before readRows. */
  flush?: () => Promise<void>;
  /** Optional teardown — called after each test. */
  cleanup?: () => Promise<void> | void;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeInput(content: string): PrimitiveInput {
  return { primitiveKind: 'observation', primitivePayload: { content }, causalReadSet: [] };
}

function commit(verdict: Exclude<HookVerdict, 'VETO'> = 'COMMIT'): HookResult & {
  verdict: Exclude<HookVerdict, 'VETO'>;
  hookId: string | null;
} {
  return { verdict, hookId: null };
}

// ─── Contract suite ───────────────────────────────────────────────────────────

export function runWalBackendContract(
  implName: string,
  makeHarness: () => WalBackendHarness,
): void {
  describe(`WalBackend contract — ${implName}`, () => {
    let h: WalBackendHarness;

    beforeEach(() => {
      h = makeHarness();
    });

    afterEach(async () => {
      if (h.cleanup) await h.cleanup();
    });

    it('CL-1: append → read round-trip (happy path)', async () => {
      await h.backend.commitRow(makeInput('alpha'), commit('COMMIT'));
      await h.backend.commitRow(makeInput('beta'),  commit('COMMIT'));
      if (h.flush) await h.flush();

      const rows = await h.backend.readRows({ range: [0, 10] });
      expect(rows).toHaveLength(2);
      expect((rows[0].primitivePayload as { content: string }).content).toBe('alpha');
      expect((rows[1].primitivePayload as { content: string }).content).toBe('beta');
      expect(rows[0].offset).toBe(0);
      expect(rows[1].offset).toBe(1);
    });

    it('CL-2: offset monotonicity — each commitRow returns offset = previous + 1', async () => {
      const o0 = await h.backend.commitRow(makeInput('r0'), commit('COMMIT'));
      const o1 = await h.backend.commitRow(makeInput('r1'), commit('COMMIT'));
      const o2 = await h.backend.commitRow(makeInput('r2'), commit('COMMIT'));
      if (h.flush) await h.flush();

      expect(o0).toBe(0);
      expect(o1).toBe(1);
      expect(o2).toBe(2);
    });

    it('CL-3: verdict→hookVerdict byte: COMMIT=0x00, OBSERVE=0x01, PAUSE=0x02', async () => {
      await h.backend.commitRow(makeInput('c'), commit('COMMIT'));
      await h.backend.commitRow(makeInput('o'), commit('OBSERVE'));
      await h.backend.commitRow(makeInput('p'), commit('PAUSE'));
      if (h.flush) await h.flush();

      // Offsets must be assigned sequentially regardless of verdict
      const rows = await h.backend.readRows({ range: [0, 2] });
      expect(rows).toHaveLength(3);

      // Assert the persisted hookVerdict byte — this catches VERDICT_TO_WAL drift.
      // If the mapping is mis-applied (e.g. OBSERVE→0x02 instead of 0x01), these
      // assertions will fail on the implementation that has the wrong mapping.
      expect(await h.readVerdictByte(0)).toBe(0x00); // COMMIT
      expect(await h.readVerdictByte(1)).toBe(0x01); // OBSERVE
      expect(await h.readVerdictByte(2)).toBe(0x02); // PAUSE
    });

    it('CL-4: read-range semantics — inclusive [start, end]; out-of-range returns empty', async () => {
      await h.backend.commitRow(makeInput('r0'), commit());
      await h.backend.commitRow(makeInput('r1'), commit());
      await h.backend.commitRow(makeInput('r2'), commit());
      if (h.flush) await h.flush();

      const mid = await h.backend.readRows({ range: [1, 1] });
      expect(mid).toHaveLength(1);
      expect(mid[0].offset).toBe(1);

      const empty = await h.backend.readRows({ range: [5, 10] });
      expect(empty).toHaveLength(0);
    });

    it('CL-5: PAUSE-verdict row is visible via readRows after flush', async () => {
      await h.backend.commitRow(makeInput('before'), commit('COMMIT'));
      await h.backend.commitRow(makeInput('paused'), commit('PAUSE'));
      if (h.flush) await h.flush();

      const rows = await h.backend.readRows({ range: [0, 10] });
      expect(rows).toHaveLength(2);
      expect(rows[1].offset).toBe(1);
      expect((rows[1].primitivePayload as { content: string }).content).toBe('paused');
    });
  });
}

// ─── Wire InMemoryWalBackend ───────────────────────────────────────────────────

runWalBackendContract('InMemoryWalBackend', () => {
  const backend = new InMemoryWalBackend();
  return {
    backend,
    readVerdictByte: async (offset: number) => {
      const recs = backend.readSegmentRecords();
      const rec  = recs.find(r => Number(r.commitOffset) === offset);
      if (rec === undefined) throw new Error(`InMemory: no record at offset ${offset}`);
      return rec.hookVerdict;
    },
  };
});

// ─── Wire FileSystemWalBackend ────────────────────────────────────────────────

runWalBackendContract('FileSystemWalBackend', () => {
  const rootDir   = path.join(os.tmpdir(), `crucible-contract-${randomUUID()}`);
  const sessionId = `sess-${randomUUID().slice(0, 8)}`;
  fs.mkdirSync(rootDir, { recursive: true });

  let backendInstance: Awaited<ReturnType<typeof createFileSystemWalBackend>>;
  let openPromise: Promise<void> | null = null;

  const ensureOpen = (): Promise<void> => {
    if (!openPromise) {
      openPromise = createFileSystemWalBackend(rootDir, sessionId, {
        batchSize: 1, // immediate flush — commitRow resolves without explicit flush call
      }).then(b => { backendInstance = b; });
    }
    return openPromise;
  };

  const proxy: WalBackend = {
    async commitRow(input, hookResult) {
      await ensureOpen();
      return backendInstance.commitRow(input, hookResult);
    },
    async readRows(opts) {
      await ensureOpen();
      return backendInstance.readRows(opts);
    },
  };

  return {
    backend: proxy,
    readVerdictByte: async (offset: number) => {
      await ensureOpen();
      const recs = backendInstance.readSegmentRecords();
      const rec  = recs.find(r => Number(r.commitOffset) === offset);
      if (rec === undefined) throw new Error(`FS: no record at offset ${offset}`);
      return rec.hookVerdict;
    },
    flush: async () => { await ensureOpen(); await backendInstance.flush(); },
    cleanup: async () => {
      if (backendInstance) await backendInstance.close();
      try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    },
  };
});

// ─── CL-6: FS-only close+reopen durability ────────────────────────────────────
//
// This invariant is not part of the shared suite because in-memory backends
// have no durable state — reopen is not applicable.  The FS backend must
// preserve the hookVerdict byte across close+reopen (fdatasync guarantee).

describe('WalBackend contract — FileSystemWalBackend durability (close+reopen)', () => {
  let rootDir: string;
  let sessionId: string;

  beforeEach(() => {
    rootDir   = path.join(os.tmpdir(), `crucible-contract-reopen-${randomUUID()}`);
    sessionId = `sess-${randomUUID().slice(0, 8)}`;
    fs.mkdirSync(rootDir, { recursive: true });
  });

  afterEach(() => {
    try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('CL-6: PAUSE hookVerdict byte survives close+reopen (durable backend)', async () => {
    // Write COMMIT + PAUSE rows, then close
    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(makeInput('c'), commit('COMMIT'));
    await writer.commitRow(makeInput('p'), commit('PAUSE'));
    await writer.close();

    // Reopen read-only — segment is re-read from disk
    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs   = reader.readSegmentRecords();

    expect(recs).toHaveLength(2);
    expect(recs[0].hookVerdict).toBe(0x00); // COMMIT
    expect(recs[1].hookVerdict).toBe(0x02); // PAUSE

    // readRows must also surface both events after reopen
    const rows = await reader.readRows({ range: [0, 10] });
    expect(rows).toHaveLength(2);
    expect(rows[1].offset).toBe(1);

    await reader.close();
  });
});
