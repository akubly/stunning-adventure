/**
 * S4 WAL Substrate Deepening — RED tests (TDD).
 *
 * Covers three deferred gaps from Phase 0.5:
 *   GAP-1  flags.bootstrap — bootstrap rows must have flags.bootstrap = true
 *          in both FS and in-memory backends.
 *   GAP-2  flush() on WalBackend interface — enables group-commit atomicity
 *          for bootstrap batch.
 *   SR     Session-reopen — reopen an existing session WAL and continue
 *          appending; coordinate seam with LedgerImpl reopen mode.
 *
 * §3 scope only: WAL substrate, bootstrap atomicity, session-reopen.
 * No hook bus, router, generators, or aperture.
 *
 * @see docs/crucible-technical-design/03-l1-wal-substrate.md §3.8
 * @see .squad/decisions.md GAP-1 / GAP-2 / Decision 3
 */

import { describe, it, expect, afterEach } from 'vitest';
import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';
import { randomUUID } from 'node:crypto';

import { InMemoryWalBackend }            from '../../ledger/wal-backend-in-memory.js';
import { createFileSystemWalBackend }    from '../../ledger/wal-backend-fs.js';
import { createLedger, type BootstrappableLedger } from '../../ledger/ledger-impl.js';
import type { WalBackend }               from '../../ledger/ledger.js';
import type { PrimitiveInput }           from '../../types.js';
import type { HookResult, HookVerdict } from '../../ledger/hook-bus.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-s4-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeInput(content = 'test-row'): PrimitiveInput {
  return {
    primitiveKind:    'observation',
    primitivePayload: { content },
    causalReadSet:    [],
  };
}

const COMMIT_RESULT: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } = {
  verdict: 'COMMIT',
  hookId:  null,
};

// ─── GAP-1: flags.bootstrap on bootstrap rows ─────────────────────────────────

describe('GAP-1: flags.bootstrap set on bootstrap rows', () => {

  it('BF-1: InMemoryWalBackend bootstrap rows have flags.bootstrap = true in segRecords', async () => {
    const backend = new InMemoryWalBackend();
    const input: PrimitiveInput = { ...makeInput('boot-row'), walFlags: { bootstrap: true } };
    await backend.commitRow(input, COMMIT_RESULT);
    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0].flags.bootstrap).toBe(true);
  });

  it('BF-2: InMemoryWalBackend non-bootstrap rows have flags.bootstrap = false', async () => {
    const backend = new InMemoryWalBackend();
    await backend.commitRow(makeInput('normal-row'), COMMIT_RESULT);
    const records = backend.readSegmentRecords();
    expect(records[0].flags.bootstrap).toBe(false);
  });

  it('BF-3: FileSystemWalBackend bootstrap rows have flags.bootstrap = true in segment records', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend   = await createFileSystemWalBackend(rootDir, sessionId, {
      syncFn: () => {}, // suppress real fsync in test
    });
    const input: PrimitiveInput = { ...makeInput('boot-row-fs'), walFlags: { bootstrap: true } };
    await backend.commitRow(input, COMMIT_RESULT);
    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0].flags.bootstrap).toBe(true);
    await backend.close();
  });

  it('BF-4: FileSystemWalBackend non-bootstrap rows have flags.bootstrap = false', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend   = await createFileSystemWalBackend(rootDir, sessionId, {
      syncFn: () => {},
    });
    await backend.commitRow(makeInput('normal-row-fs'), COMMIT_RESULT);
    const records = backend.readSegmentRecords();
    expect(records[0].flags.bootstrap).toBe(false);
    await backend.close();
  });

  it('BF-5: LedgerImpl.bootstrap() rows arrive at in-memory backend with flags.bootstrap = true', async () => {
    const backend = new InMemoryWalBackend();
    const ledger  = await createLedger({ walBackend: backend });
    await ledger.bootstrap([makeInput('boot-a'), makeInput('boot-b')]);
    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(2);
    expect(records[0].flags.bootstrap).toBe(true);
    expect(records[1].flags.bootstrap).toBe(true);
  });

  it('BF-6: LedgerImpl.append() rows have flags.bootstrap = false in in-memory backend', async () => {
    const backend = new InMemoryWalBackend();
    const ledger  = await createLedger({ walBackend: backend });
    await ledger.bootstrap([makeInput('boot-row')]);
    await ledger.append(makeInput('normal-row'));
    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(2);
    expect(records[0].flags.bootstrap).toBe(true);  // bootstrap row
    expect(records[1].flags.bootstrap).toBe(false); // normal append
  });

  it('BF-7: LedgerImpl.bootstrap() rows have flags.bootstrap = true in FS backend segment files', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend   = await createFileSystemWalBackend(rootDir, sessionId, {
      syncFn: () => {},
    });
    const ledger = await createLedger({ walBackend: backend });
    await ledger.bootstrap([makeInput('boot-fs')]);
    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(1);
    expect(records[0].flags.bootstrap).toBe(true);
    await backend.close();
  });

});

// ─── GAP-2: flush() on WalBackend interface ───────────────────────────────────

describe('GAP-2: flush() on WalBackend interface', () => {

  it('FL-1: InMemoryWalBackend.flush() exists and resolves (no-op)', async () => {
    const backend = new InMemoryWalBackend();
    // flush() must exist on the interface — TypeScript will enforce this
    await expect(backend.flush()).resolves.toBeUndefined();
  });

  it('FL-2: flush() exists on WalBackend interface (type-level assertion via assignment)', () => {
    // If WalBackend.flush() is missing, this assignment fails to type-check.
    const _: WalBackend = new InMemoryWalBackend();
    expect(typeof _.flush).toBe('function');
  });

  it('FL-3: LedgerImpl.bootstrap() with FS backend + batchSize=N commits all rows atomically (one segment fsync)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const syncs:    number[] = [];
    const N = 3;

    // batchSize=N so individual commitRow() calls don't auto-flush.
    // batchDeadlineMs high so timer doesn't fire during staging.
    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       N,
      batchDeadlineMs: 60_000,
      syncFn: (fd) => { syncs.push(fd); },
    });

    const ledger = await createLedger({ walBackend: backend });
    const rows   = Array.from({ length: N }, (_, i) => makeInput(`boot-atomic-${i}`));
    const offsets = await ledger.bootstrap(rows);

    // N rows committed: offsets 0, 1, 2
    expect(offsets).toEqual([0, 1, 2]);

    // Only 1 segment fsync for N=3 rows (all rows → 1 unique CAS each → N CAS syncs + 1 segment sync).
    // With N distinct payloads: N CAS fsyncs + 1 segment fsync = N+1 total.
    // The assertion here is that the segment was only fsynced ONCE (group-commit).
    const segFsyncs = syncs.filter((fd, i) => {
      // The LAST sync call in each flush is the segment fd sync.
      // All prior syncs in the same flush are CAS file syncs.
      // Since all rows flush together in one call, we have exactly 1 segment sync.
      return true; // all syncs counted; assert segment sync count separately via records
    });
    // Simpler check: exactly N+1 total syncs (N CAS + 1 segment) for 1 batch of N distinct payloads.
    expect(syncs.length).toBe(N + 1);

    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(N);
    expect(records.every(r => r.flags.bootstrap)).toBe(true);

    await backend.close();
  });

  it('FL-4: LedgerImpl.bootstrap() with default batchSize=1 still works (sequential, functional)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend   = await createFileSystemWalBackend(rootDir, sessionId, {
      syncFn: () => {},  // suppress real fsync
    });
    const ledger  = await createLedger({ walBackend: backend });
    const offsets = await ledger.bootstrap([makeInput('boot-a'), makeInput('boot-b')]);
    expect(offsets).toEqual([0, 1]);
    await backend.close();
  });

});

// ─── Session-reopen: reopen existing session and continue appending ───────────

describe('Session-reopen: reopen existing WAL and continue appending', () => {

  it('SR-1: FS backend reopen — replayed rows are returned by readRows()', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Session 1: write rows and close
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      await b.commitRow(makeInput('row-0'), COMMIT_RESULT);
      await b.commitRow(makeInput('row-1'), COMMIT_RESULT);
      await b.close();
    }

    // Session 2: reopen same sessionId — must see the committed rows
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, {
        syncFn: () => {},
        readOnly: false,
      });
      const rows = await b.readRows({ range: [0, 99] });
      expect(rows).toHaveLength(2);
      expect((rows[0].primitivePayload as { content: string }).content).toBe('row-0');
      expect((rows[1].primitivePayload as { content: string }).content).toBe('row-1');
      await b.close();
    }
  });

  it('SR-2: Ledger with reopen:true — queryEvents() returns existing rows from FS backend', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First session: bootstrap + append
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b });
      await l.bootstrap([makeInput('boot-row')]);
      await l.append(makeInput('append-row'));
      await b.close();
    }

    // Reopen: ledger must see both rows
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b, reopen: true });
      const events = await l.queryEvents({ range: [0, 99] });
      expect(events).toHaveLength(2);
      expect((events[0].primitivePayload as { content: string }).content).toBe('boot-row');
      expect((events[1].primitivePayload as { content: string }).content).toBe('append-row');
      await b.close();
    }
  });

  it('SR-3: Ledger with reopen:true — append() continues at correct offset', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First session: 2 rows (offsets 0 and 1)
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b });
      await l.bootstrap([makeInput('boot-row')]);
      await l.append(makeInput('append-0'));
      await b.close();
    }

    // Reopen: next append must get offset 2
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b, reopen: true });
      const offset = await l.append(makeInput('append-after-reopen'));
      expect(offset).toBe(2);
      await b.close();
    }
  });

  it('SR-4: Ledger with reopen:true — bootstrap() throws (already bootstrapped)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First session: bootstrap
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b });
      await l.bootstrap([makeInput('boot-row')]);
      await b.close();
    }

    // Reopen: calling bootstrap() again must throw
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b, reopen: true });
      await expect(l.bootstrap([makeInput('re-bootstrap')])).rejects.toThrow();
      await b.close();
    }
  });

  it('SR-5: rows appended after reopen are durable — survive a second reopen', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First session: bootstrap
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b });
      await l.bootstrap([makeInput('boot-row')]);
      await b.close();
    }

    // Second session: reopen + append
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b, reopen: true });
      await l.append(makeInput('post-reopen-row'));
      await b.close();
    }

    // Third session: reopen — must see all 3 rows (boot, post-reopen + new)
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const events = await b.readRows({ range: [0, 99] });
      expect(events).toHaveLength(2);  // boot-row (offset 0) + post-reopen-row (offset 1)
      expect((events[1].primitivePayload as { content: string }).content).toBe('post-reopen-row');
      await b.close();
    }
  });

  it('SR-6: reopen without reopen:true flag — append() works normally (no bootstrap needed)', async () => {
    // createLedger without reopen:true should work when walBackend is reopened,
    // as long as caller goes straight to append() without calling bootstrap().
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First session: bootstrap
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b });
      await l.bootstrap([makeInput('boot-row')]);
      await b.close();
    }

    // Reopen WITHOUT reopen:true — append() should still work (hasBootstrapped=false
    // but hasAppended check only blocks bootstrap() not append())
    {
      const b = await createFileSystemWalBackend(rootDir, sessionId, { syncFn: () => {} });
      const l = await createLedger({ walBackend: b });
      const offset = await l.append(makeInput('appended'));
      expect(offset).toBe(1); // offset continues from 1 (after boot-row at 0)
      await b.close();
    }
  });

});
