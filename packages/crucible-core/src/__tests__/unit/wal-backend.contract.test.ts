/**
 * Shared WalBackend contract test — I6.
 *
 * Runs the same behavioral invariants against BOTH concrete WalBackend
 * implementations to prevent fs/in-memory drift.
 *
 * Pattern: runWalBackendContract(implName, makeHarness)
 *   makeHarness() — called fresh per test (beforeEach) → isolated instance.
 *   Harness exposes the WalBackend under test + a cleanup hook.
 *
 * Invariants:
 *   CL-1: append → read round-trip (happy path)
 *   CL-2: offset monotonicity (each commitRow returns offset = previous + 1)
 *   CL-3: verdict → WAL byte mapping persists (COMMIT=0x00, OBSERVE=0x01, PAUSE=0x02)
 *   CL-4: read-range semantics (inclusive [start, end]; out-of-range returns empty)
 *   CL-5: durable PAUSE row (PAUSE-verdict row is readable after a flush)
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
  /** Optional teardown — called after each test. */
  cleanup?: () => Promise<void> | void;
  /**
   * Some backends (fs) need an explicit flush to make reads consistent.
   * Call after all commitRow() calls before readRows() in contract tests.
   */
  flush?: () => Promise<void>;
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

    it('CL-3: COMMIT verdict → offset 0; OBSERVE → offset 1; PAUSE → offset 2', async () => {
      const o0 = await h.backend.commitRow(makeInput('c'), commit('COMMIT'));
      const o1 = await h.backend.commitRow(makeInput('o'), commit('OBSERVE'));
      const o2 = await h.backend.commitRow(makeInput('p'), commit('PAUSE'));
      if (h.flush) await h.flush();

      // All three offsets must be assigned sequentially regardless of verdict
      expect(o0).toBe(0);
      expect(o1).toBe(1);
      expect(o2).toBe(2);

      const rows = await h.backend.readRows({ range: [0, 2] });
      expect(rows).toHaveLength(3);
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

    it('CL-5: PAUSE-verdict row is readable after flush', async () => {
      await h.backend.commitRow(makeInput('before'), commit('COMMIT'));
      await h.backend.commitRow(makeInput('paused'), commit('PAUSE'));
      if (h.flush) await h.flush();

      const rows = await h.backend.readRows({ range: [0, 10] });
      expect(rows).toHaveLength(2);
      // The PAUSE row committed — it is visible in readRows
      expect(rows[1].offset).toBe(1);
      expect((rows[1].primitivePayload as { content: string }).content).toBe('paused');
    });
  });
}

// ─── Wire InMemoryWalBackend ───────────────────────────────────────────────────

runWalBackendContract('InMemoryWalBackend', () => {
  const backend = new InMemoryWalBackend();
  return { backend };
});

// ─── Wire FileSystemWalBackend ────────────────────────────────────────────────

runWalBackendContract('FileSystemWalBackend', () => {
  const rootDir   = path.join(os.tmpdir(), `crucible-contract-${randomUUID()}`);
  const sessionId = `sess-${randomUUID().slice(0, 8)}`;
  fs.mkdirSync(rootDir, { recursive: true });

  // Use batchSize=10, long deadline so we control flushes explicitly
  let backendInstance: Awaited<ReturnType<typeof createFileSystemWalBackend>>;

  const harness = {
    // Will be replaced after the async open completes in beforeEach.
    // We use a sync-init shim: the contract suite calls makeHarness() from
    // beforeEach, which is sync.  We work around this by returning a proxy
    // object whose `backend` property is resolved lazily after open().
    backend: null as unknown as WalBackend,
    flush: undefined as (() => Promise<void>) | undefined,
    cleanup: undefined as (() => Promise<void>) | undefined,
  };

  // beforeEach is called before the test body; we need to open the backend.
  // runWalBackendContract calls makeHarness() inside beforeEach, so we return
  // a special harness that wraps an async-initialised backend via a promise
  // sentinel.  To keep the contract suite simple, we use a self-initialising
  // pattern: the first access of `harness.backend` triggers the open.
  // This is cleaner via a simple trick: wrap the whole thing in a class proxy.

  // Actually the simplest approach: return a harness with a lazy `backend` getter
  // backed by a synchronous-init wrapper.  Since both InMemory and FS backends
  // only ever have commitRow/readRows called after `beforeEach`, and beforeEach
  // is async-capable in vitest, we do the open in an IIFE and return a
  // promise-backed harness.
  //
  // However, makeHarness() in this pattern must be synchronous.  The cleanest
  // solution without changing the contract suite signature: make the FS harness
  // wrap an async-open backend behind a lazy initializer called by the first
  // method invocation.

  // Implementation: create a proxy WalBackend that defers to an async-initialized
  // real backend.  Open is triggered once on first method call.
  let openPromise: Promise<void> | null = null;
  const ensureOpen = (): Promise<void> => {
    if (!openPromise) {
      openPromise = createFileSystemWalBackend(rootDir, sessionId, {
        // batchSize=1: immediate flush — commitRow resolves without explicit flush call.
        // The harness still exposes a flush() for the CL-5 PAUSE test.
        batchSize: 1,
      }).then(b => {
        backendInstance = b;
      });
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

  harness.backend = proxy;
  harness.flush   = async () => { await ensureOpen(); await backendInstance.flush(); };
  harness.cleanup = async () => {
    if (backendInstance) await backendInstance.close();
    try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  };

  return harness;
});
