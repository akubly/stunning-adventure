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

function commitFromHook(verdict: Exclude<HookVerdict, 'VETO'> = 'COMMIT'): HookResult & {
  verdict: Exclude<HookVerdict, 'VETO'>;
  hookId: string | null;
} {
  return { verdict, hookId: 'test-hook-a' };
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
      await h.backend.commitRow(makeInput('c'), commitFromHook('COMMIT'));
      await h.backend.commitRow(makeInput('o'), commitFromHook('OBSERVE'));
      await h.backend.commitRow(makeInput('p'), commitFromHook('PAUSE'));
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
      await h.backend.commitRow(makeInput('paused'), commitFromHook('PAUSE'));
      if (h.flush) await h.flush();

      const rows = await h.backend.readRows({ range: [0, 10] });
      expect(rows).toHaveLength(2);
      expect(rows[1].offset).toBe(1);
      expect((rows[1].primitivePayload as { content: string }).content).toBe('paused');
    });

    it('CL-8: no-match byte 0xFF (hookId=null, COMMIT) vs explicit-continue 0x00 (hookId non-null, COMMIT)', async () => {
      await h.backend.commitRow(makeInput('no-match'), commit('COMMIT'));
      await h.backend.commitRow(makeInput('explicit-continue'), commitFromHook('COMMIT'));
      if (h.flush) await h.flush();

      expect(await h.readVerdictByte(0)).toBe(0xFF);
      expect(await h.readVerdictByte(1)).toBe(0x00);
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
    await writer.commitRow(makeInput('c'), commitFromHook('COMMIT'));
    await writer.commitRow(makeInput('p'), commitFromHook('PAUSE'));
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

  it('CL-10: NO_MATCH (0xFF) and explicit-COMMIT (0x00) hookVerdict bytes survive close+reopen', async () => {
    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(makeInput('no-match'), commit('COMMIT'));
    await writer.commitRow(makeInput('explicit-commit'), commitFromHook('COMMIT'));
    await writer.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs = reader.readSegmentRecords();

    expect(recs).toHaveLength(2);
    expect(recs[0].hookVerdict).toBe(0xFF);
    expect(recs[1].hookVerdict).toBe(0x00);

    await reader.close();
  });
});

// ─── CL-7: timestampNs monotonicity (both backends, clock seam) ──────────────
//
// §3.10 invariant: timestampNs must be monotonically non-decreasing within a
// session. When the system clock goes backward, the backend must clamp to the
// last assigned value. Both backends must pass (RED without clamping logic).

describe('WalBackend contract — CL-7: timestampNs monotonicity (clock goes backward)', () => {
  it('CL-7 InMemoryWalBackend: second row timestampNs >= first when clock regresses', async () => {
    let tick = 2_000_000_000n; // 2 s in nanoseconds
    const backend = new InMemoryWalBackend({ nowNs: () => tick });

    await backend.commitRow(makeInput('first'), commit());
    tick = 1_000_000_000n; // clock jumps backward to 1 s
    await backend.commitRow(makeInput('second'), commit());

    const recs = backend.readSegmentRecords();
    expect(recs).toHaveLength(2);
    expect(recs[1].timestampNs).toBeGreaterThanOrEqual(recs[0].timestampNs);
  });

  it('CL-7 FileSystemWalBackend: second row timestampNs >= first when clock regresses', async () => {
    const rootDir   = path.join(os.tmpdir(), `crucible-cl7-${randomUUID()}`);
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    fs.mkdirSync(rootDir, { recursive: true });

    let tick = 2_000_000_000n;
    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      nowNs: () => tick,
    });

    await backend.commitRow(makeInput('first'), commit());
    tick = 1_000_000_000n; // clock jumps backward
    await backend.commitRow(makeInput('second'), commit());

    const recs = backend.readSegmentRecords();
    expect(recs).toHaveLength(2);
    expect(recs[1].timestampNs).toBeGreaterThanOrEqual(recs[0].timestampNs);

    await backend.close();
    try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('CL-7 FileSystemWalBackend: lastTimestampNs seeded from replayed records (reopen monotonicity)', async () => {
    const rootDir   = path.join(os.tmpdir(), `crucible-cl7-reopen-${randomUUID()}`);
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    fs.mkdirSync(rootDir, { recursive: true });

    // Write one row with a known large timestamp
    const highTick = 5_000_000_000n;
    const backend1 = await createFileSystemWalBackend(rootDir, sessionId, {
      nowNs: () => highTick,
    });
    await backend1.commitRow(makeInput('pre-reopen'), commit());
    await backend1.close();

    // Reopen with a clock that returns a LOWER value — must still be clamped
    const lowTick = 1_000_000_000n;
    const backend2 = await createFileSystemWalBackend(rootDir, sessionId, {
      nowNs: () => lowTick,
    });
    await backend2.commitRow(makeInput('post-reopen'), commit());

    const recs = backend2.readSegmentRecords();
    expect(recs).toHaveLength(2);
    expect(recs[1].timestampNs).toBeGreaterThanOrEqual(recs[0].timestampNs);

    await backend2.close();
    try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });
});

// ─── CL-9: Record materialization parity (I2) ─────────────────────────────────
//
// Both backends must produce identical payloadHash, readSetHash, and envelopeCbor
// for the same PrimitiveInput.  This test catches drift if one backend's
// materializeRow path diverges from the other's (e.g. different CBOR options,
// different hash seam, different readSet handling).

describe('WalBackend contract — CL-9: materialization parity (I2)', () => {
  it('CL-9a: InMemory and FS backends produce identical payloadHash for same payload', async () => {
    const rootDir   = path.join(os.tmpdir(), `crucible-cl9-${randomUUID()}`);
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    fs.mkdirSync(rootDir, { recursive: true });

    const inMem = new InMemoryWalBackend();
    const fsBe  = await createFileSystemWalBackend(rootDir, sessionId);

    const input: PrimitiveInput = {
      primitiveKind:    'observation',
      primitivePayload: { b: 2, a: 1, nested: { z: 99 } },
      causalReadSet:    ['dep-a', 'dep-b'],
    };
    const hr: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } =
      { verdict: 'COMMIT', hookId: null };

    await inMem.commitRow(input, hr);
    await fsBe.commitRow(input, hr);

    const imRec = inMem.readSegmentRecords()[0];
    const fsRec = fsBe.readSegmentRecords()[0];

    expect(Buffer.from(imRec.payloadHash).toString('hex'))
      .toBe(Buffer.from(fsRec.payloadHash).toString('hex'));
    expect(Buffer.from(imRec.readSetHash).toString('hex'))
      .toBe(Buffer.from(fsRec.readSetHash).toString('hex'));
    expect(Buffer.from(imRec.envelopeCbor).toString('hex'))
      .toBe(Buffer.from(fsRec.envelopeCbor).toString('hex'));

    await fsBe.close();
    try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });

  it('CL-9b: both backends produce identical payloadHash with keys in reversed insertion order', async () => {
    const rootDir   = path.join(os.tmpdir(), `crucible-cl9b-${randomUUID()}`);
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    fs.mkdirSync(rootDir, { recursive: true });

    const inMem1 = new InMemoryWalBackend();
    const inMem2 = new InMemoryWalBackend();
    const fsBe   = await createFileSystemWalBackend(rootDir, sessionId);

    const hr: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } =
      { verdict: 'COMMIT', hookId: null };

    await inMem1.commitRow(
      { primitiveKind: 'observation', primitivePayload: { aa: 1, z: 2 }, causalReadSet: [] },
      hr,
    );
    await inMem2.commitRow(
      { primitiveKind: 'observation', primitivePayload: { z: 2, aa: 1 }, causalReadSet: [] },
      hr,
    );
    await fsBe.commitRow(
      { primitiveKind: 'observation', primitivePayload: { aa: 1, z: 2 }, causalReadSet: [] },
      hr,
    );

    const h1 = Buffer.from(inMem1.readSegmentRecords()[0].payloadHash).toString('hex');
    const h2 = Buffer.from(inMem2.readSegmentRecords()[0].payloadHash).toString('hex');
    const h3 = Buffer.from(fsBe.readSegmentRecords()[0].payloadHash).toString('hex');

    expect(h1).toBe(h2);
    expect(h1).toBe(h3);

    await fsBe.close();
    try { fs.rmSync(rootDir, { recursive: true, force: true }); } catch { /* best-effort */ }
  });
});
