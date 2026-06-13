/**
 * RED PHASE — CAS fsync ordering: CAS blobs must be durable before WAL segment
 * fdatasync (issue #59).
 *
 * TDD Strategy  : §3.2 crash-durability (docs/crucible-tdd-strategy.md)
 * Scope fence   : #59 ONLY — CAS fsync ordering. NOT #56 (manifest gate, fixed).
 *
 * Bug: FileSystemCas.put() writes via fs.writeFileSync (no fsync). The WAL
 *   segment fdatasync in Phase 3 of executeFlush() can make a segment record
 *   durable while the referenced CAS blob is still only in the OS page cache.
 *   A crash between CAS write and WAL fdatasync leaves a durable WAL record
 *   pointing at a non-durable / missing CAS blob → CasMissError on reopen.
 *
 * Fix: After Phase 1 (CAS writes) and before Phase 3 (segment write+fsync),
 *   insert Phase 2.5: cas.syncAll(syncFn) — fsync all newly-written CAS files.
 *   Uses the injectable syncFn seam already present on FileSystemWalBackend.
 *   Ordering: CAS durable → segment durable → invariant maintained.
 *
 * CAS-F1 (primary RED): syncFn called for CAS file before segment → 2 total
 *   calls for 1 row with empty readSet. Currently: 1 call (segment only). RED.
 * CAS-F2: Dedup — identical payloads in a batch → only 1 CAS sync (not per-row)
 * CAS-F3: Non-empty causalReadSet → payload CAS + readSet CAS + segment = 3 calls
 * CAS-F4: CAS syncFn throws → batch aborts, row promises rejected, segment empty
 * CAS-F5: Crash between CAS sync and segment write → no durable WAL row, no
 *   CasMissError on reopen (regression guard)
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID }           from 'node:crypto';
import path                     from 'node:path';
import os                       from 'node:os';
import fs                       from 'node:fs';
import {
  createFileSystemWalBackend,
} from '../../ledger/wal-backend-fs.js';
import { FileSystemCas } from '../../ledger/wal/cas-fs.js';
import type { PrimitiveInput } from '../../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dirs: string[] = [];

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-cas-fsync-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function makeInput(tag = 'row', readSet: string[] = []): PrimitiveInput {
  return {
    primitiveKind:    'observation',
    primitivePayload: { tag },
    causalReadSet:    readSet,
  };
}

function commit() {
  return { verdict: 'COMMIT' as const, hookId: null };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WAL FileSystemCas — CAS fsync ordering (issue #59)', () => {

  // ── CAS-F1: Primary RED — syncFn called for CAS before segment ──────────────
  //
  // For 1 row with an empty causalReadSet:
  //   Before fix: syncFn called 1 time (segment only) — CAS not synced → FAILS
  //   After  fix: syncFn called 2 times (payload CAS + segment) → PASSES

  it('CAS-F1: syncFn invoked for CAS blob before segment fdatasync (1 row, empty readSet)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let   syncCount = 0;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
      syncFn: () => { syncCount++; },
    });

    await backend.commitRow(makeInput('r0'), commit());
    await backend.close();

    // 1 payload CAS file + 1 segment = 2 syncFn calls
    // Before fix: 1 (only segment). RED.
    expect(syncCount).toBe(2);
  });

  // ── CAS-F2: Dedup — identical payloads share one CAS file → only 1 CAS sync ─

  it('CAS-F2: identical payloads in a batch deduplicate to a single CAS sync', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let   syncCount = 0;

    // batchSize=2: both rows are committed in a single batch
    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       2,
      batchDeadlineMs: 60_000,
      syncFn: () => { syncCount++; },
    });

    // Two rows with the SAME primitivePayload → same CAS hash → dedup (1 file)
    await Promise.all([
      backend.commitRow(makeInput('same'), commit()),
      backend.commitRow(makeInput('same'), commit()),
    ]);
    await backend.close();

    // 1 CAS sync (deduplicated) + 1 segment sync = 2 total
    // Before fix: 1 (only segment). RED.
    expect(syncCount).toBe(2);
  });

  // ── CAS-F3: Non-empty readSet → both payload and readSet CAS files synced ───

  it('CAS-F3: non-empty causalReadSet produces payload CAS sync + readSet CAS sync + segment', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let   syncCount = 0;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
      syncFn: () => { syncCount++; },
    });

    await backend.commitRow(makeInput('r0', ['dep-a', 'dep-b']), commit());
    await backend.close();

    // 1 payload CAS + 1 readSet CAS + 1 segment = 3 syncFn calls
    // Before fix: 1 (only segment). RED.
    expect(syncCount).toBe(3);
  });

  // ── CAS-F4: syncFn throws during CAS sync → batch aborts, rows rejected ─────

  it('CAS-F4: syncFn throw during CAS sync aborts batch; row promise rejected; segment untouched', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
      // After fix: first call is CAS sync → throws → batch abort (no segment written).
      // Before fix: first call is segment → throws → segment abort (same end result).
      syncFn: () => { throw new Error('disk full'); },
    });

    // batchSize=1: auto-flush triggers inside commitRow (not via explicit flush)
    await expect(
      backend.commitRow(makeInput('r0'), commit()),
    ).rejects.toThrow('disk full');

    // Segment must be empty (batch never written to disk)
    const segPath = path.join(rootDir, 'wal', 'sessions', sessionId, '000000.seg');
    const segSize = fs.existsSync(segPath) ? fs.statSync(segPath).size : 0;
    expect(segSize).toBe(0);
  });

  // ── CAS-F5: Crash between CAS sync and segment write → no CasMissError ──────
  //
  // After fix: CAS is fsynced (call 1..N) before segment is written (call N+1).
  // If syncFn throws on the SEGMENT call (simulating crash in that window):
  //   - CAS blobs are durable (synced)
  //   - Segment is NOT written → no durable WAL record
  //   - Reopen → readRows returns [] → no CasMissError
  //
  // Before fix: only one syncFn call (segment). Throwing on call 1 causes
  // segment abort → same outcome (segment empty). So CAS-F5 passes before fix too.
  // It is a regression guard: documents the correct crash-window behavior.

  it('CAS-F5: crash between CAS sync and segment write → empty ledger on reopen (no CasMissError)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let   syncCallIdx = 0;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
      syncFn: () => {
        syncCallIdx++;
        // After fix: index 1 = CAS sync (succeeds), index 2 = segment (throws).
        // Before fix: index 1 = segment (throws) — same end result: segment aborted.
        if (syncCallIdx >= 2) throw new Error('simulated-crash');
        // First call (CAS sync after fix) succeeds.
      },
    });

    // batchSize=1: auto-flush triggers inside commitRow
    await expect(
      backend.commitRow(makeInput('r0'), commit()),
    ).rejects.toThrow('simulated-crash');

    await backend.close().catch(() => {}); // lock release best-effort

    // Reopen: must not throw CasMissError; ledger is empty (no durable record)
    const recovered = await createFileSystemWalBackend(rootDir, sessionId, {
      readOnly: true,
    });
    const rows = await recovered.readRows({ range: [0, 10] });
    expect(rows).toHaveLength(0);
  });

  // ── CAS-F6: Subsequent batch rewrites same hash via fresh temp file ──────────
  //
  // The torn-blob fix removes the old "skip CAS sync if final blob exists"
  // optimization. A second batch with the same payload still writes/syncs a
  // fresh temp file before atomically replacing the final CAS blob.

  it('CAS-F6: already-persisted CAS blob is re-synced on subsequent batch via temp file', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    let syncCount = 0;
    const backend  = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
      syncFn: () => { syncCount++; },
    });

    // First commit: CAS file is new → 2 syncs (1 CAS + 1 segment)
    await backend.commitRow(makeInput('shared-payload'), commit());
    const firstBatchSyncs = syncCount;

    // Second commit with SAME payload: CAS blob is re-published via temp file
    syncCount = 0;
    await backend.commitRow(makeInput('shared-payload'), commit());
    const secondBatchSyncs = syncCount;

    await backend.close();

    expect(firstBatchSyncs).toBe(2);   // CAS + segment
    expect(secondBatchSyncs).toBe(2);  // CAS temp + segment
  });

  it('TORN-1: torn/partial existing CAS file is overwritten by put() + syncAll() (cross-session durability)', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const commitResult = { verdict: 'COMMIT' as const, hookId: null };

    const backend1 = await createFileSystemWalBackend(rootDir, sessionId);
    await backend1.commitRow(
      { primitiveKind: 'observation', primitivePayload: { tag: 'original' }, causalReadSet: [] },
      commitResult,
    );
    await backend1.close();

    const casDir = path.join(rootDir, 'cas');
    let casFilePath = '';
    for (const shard of fs.readdirSync(casDir)) {
      const shardDir = path.join(casDir, shard);
      if (!fs.statSync(shardDir).isDirectory()) continue;
      for (const file of fs.readdirSync(shardDir)) {
        if (file.endsWith('.cbor')) {
          casFilePath = path.join(shardDir, file);
          break;
        }
      }
      if (casFilePath) break;
    }
    expect(casFilePath, 'CAS blob must exist after first session').not.toBe('');

    // Corrupt the CAS blob with partial/torn bytes
    fs.writeFileSync(casFilePath, new Uint8Array([0xDE, 0xAD]));
    expect(fs.readFileSync(casFilePath)).toHaveLength(2);

    // Second session writes the same payload — atomic rename must overwrite the torn blob
    const backend2 = await createFileSystemWalBackend(rootDir, `sess-${randomUUID().slice(0, 8)}`);
    await backend2.commitRow(
      { primitiveKind: 'observation', primitivePayload: { tag: 'original' }, causalReadSet: [] },
      commitResult,
    );
    await backend2.close();

    // I7: exact content check — must be the CBOR bytes for { tag: 'original' }
    // encodeCbor({ tag: 'original' }) = a163746167686f726967696e616c (RFC 8949 §4.2.1)
    const { encodeCbor: enc } = await import('../../ledger/wal/cbor.js');
    const expectedBytes = enc({ tag: 'original' });
    const restoredContent = fs.readFileSync(casFilePath);
    expect(Buffer.from(restoredContent).toString('hex'))
      .toBe(Buffer.from(expectedBytes).toString('hex'));
  });

  // ── CAS-F7: stale pendingSync cleared on mid-iteration abort (I4) ────────────
  //
  // If syncAll() throws mid-iteration, pendingSync must be cleared so the NEXT
  // batch starts with a clean slate.  Without this fix, stale temp entries from
  // the failed batch would be re-fsynced in the next call, causing incorrect
  // sync-call counts and potential orphan blob races.

  it('CAS-F7: pendingSync cleared on mid-iteration sync failure; subsequent batch starts clean', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let   syncCallIdx = 0;
    let   failOnCall  = -1; // armed below

    // batchSize=1: each commitRow triggers its own flush (1 CAS + 1 segment = 2 calls)
    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
      syncFn: () => {
        syncCallIdx++;
        if (failOnCall > 0 && syncCallIdx === failOnCall) {
          throw new Error('injected-mid-iteration-failure');
        }
      },
    });

    // First batch: succeeds normally (2 calls: 1 CAS + 1 segment)
    await backend.commitRow(makeInput('r0'), commit());
    expect(syncCallIdx).toBe(2);

    // Second batch: arm failure on the CAS sync call (call #3 overall)
    syncCallIdx = 0;
    failOnCall  = 1; // fail on first call of next batch = CAS sync
    await expect(
      backend.commitRow(makeInput('r1'), commit()),
    ).rejects.toThrow('injected-mid-iteration-failure');

    // Third batch: disarm failure; if pendingSync was NOT cleared, stale entries
    // from the second batch would be re-synced here, causing syncCallIdx to
    // exceed 2 (the expected 1 CAS + 1 segment for a fresh single-payload batch).
    syncCallIdx = 0;
    failOnCall  = -1;
    await backend.commitRow(makeInput('r2'), commit());

    // Must be exactly 2 syncs: 1 fresh CAS file + 1 segment (no stale carryover)
    expect(syncCallIdx).toBe(2);

    await backend.close();
  });

  // ── CAS-T1: duplicate-hash put() in a batch must not orphan temp files ───────
  //
  // When two puts with the same hash are made within a single batch, the second
  // put must NOT write a second temp file (T1). The batch should still produce
  // exactly one CAS sync call.

  it('CAS-T1: duplicate-hash put() within a batch dedupes — no orphan temp files, correct sync count', async () => {
    const casDir = makeTmpDir();
    const cas    = new FileSystemCas(casDir);
    const bytes  = Buffer.from('hello-world');

    let syncCalls = 0;
    const syncFn = () => { syncCalls++; };

    // Two puts of the same bytes → same hash → second put should skip writing
    cas.put(bytes);
    cas.put(bytes); // duplicate — must NOT write a second *.cbor.tmp

    cas.syncAll(syncFn);

    // Only 1 CAS sync (not 2): deduplication collapsed the batch
    expect(syncCalls).toBe(1);

    // No orphan *.cbor.tmp files in any shard subdirectory
    const tmpFiles: string[] = [];
    for (const shard of fs.readdirSync(casDir)) {
      const shardDir = path.join(casDir, shard);
      if (!fs.statSync(shardDir).isDirectory()) continue;
      for (const f of fs.readdirSync(shardDir)) {
        if (f.endsWith('.cbor.tmp')) tmpFiles.push(f);
      }
    }
    expect(tmpFiles, 'no orphan *.cbor.tmp files after syncAll').toHaveLength(0);
  });

  // ── CAS-T2: abort unlinks temp files — no *.cbor.tmp garbage on disk ─────────
  //
  // When syncAll() throws, all pending temp files must be best-effort unlinked
  // before the map is cleared. Without this fix, repeated failures accumulate
  // *.cbor.tmp files that are never cleaned up (the cleared map orphans them).

  it('CAS-T2: syncAll() abort unlinks pending temp files; no *.cbor.tmp garbage remains', async () => {
    const casDir = makeTmpDir();
    const cas    = new FileSystemCas(casDir);
    const bytes  = Buffer.from('abort-test-payload');

    // Write a temp file into pendingSync
    cas.put(bytes);

    // syncFn throws immediately → abort path
    expect(() => cas.syncAll(() => { throw new Error('disk-error'); })).toThrow('disk-error');

    // All *.cbor.tmp files must have been unlinked on abort
    const tmpFiles: string[] = [];
    for (const shard of fs.readdirSync(casDir)) {
      const shardDir = path.join(casDir, shard);
      if (!fs.statSync(shardDir).isDirectory()) continue;
      for (const f of fs.readdirSync(shardDir)) {
        if (f.endsWith('.cbor.tmp')) tmpFiles.push(f);
      }
    }
    expect(tmpFiles, 'no *.cbor.tmp files should remain after abort').toHaveLength(0);
  });
});
