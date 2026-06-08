/**
 * Integration tests for FileSystemWalBackend — group-commit + seal-and-split (§3.5).
 *
 * RED invariants (all fail until group-commit staging is implemented):
 *   1. flush() method doesn't exist yet.
 *   2. syncFn seam option doesn't exist yet.
 *   3. batchSize option doesn't exist yet.
 *
 * Each test uses a unique temp dir cleaned on completion.
 */

import { describe, it, expect } from 'vitest';
import { randomUUID }            from 'node:crypto';
import path                      from 'node:path';
import os                        from 'node:os';
import fs                        from 'node:fs';
import {
  createFileSystemWalBackend,
} from '../../ledger/wal-backend-fs.js';
import type { PrimitiveInput } from '../../types.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-gc-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function cleanTmpDir(d: string): void {
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
}

function makeInput(kind = 'observation'): PrimitiveInput {
  return {
    primitiveKind:    kind as PrimitiveInput['primitiveKind'],
    primitivePayload: { content: 'gc-test' },
    causalReadSet:    [],
  };
}

function segPath(rootDir: string, sessionId: string): string {
  return path.join(rootDir, 'wal', 'sessions', sessionId, '000000.seg');
}

// ─── Group-commit batching ────────────────────────────────────────────────────

describe('WAL FileSystemWalBackend — group-commit batching (§3.5)', () => {
  it('Unit: WAL group-commit stages rows without immediate sync; flush() commits all with ONE sync call', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const syncs: number[] = [];

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 10,
      batchDeadlineMs: 60_000,      // don't let the timer fire
      syncFn: (fd) => { syncs.push(fd); },
    });

    const input  = makeInput();
    const commit = { verdict: 'COMMIT' as const, hookId: null };

    const p1 = backend.commitRow(input, commit);
    const p2 = backend.commitRow(input, commit);
    const p3 = backend.commitRow(input, commit);

    // No sync yet — queue hasn't reached batchSize (10), timer not fired
    expect(syncs).toHaveLength(0);

    // Explicit flush — should sync exactly once for all three rows
    await backend.flush();
    const [o1, o2, o3] = await Promise.all([p1, p2, p3]);

    expect(syncs).toHaveLength(1);
    expect(o1).toBe(0);
    expect(o2).toBe(1);
    expect(o3).toBe(2);

    await backend.close();
    cleanTmpDir(rootDir);
  });

  it('Unit: WAL group-commit auto-flushes when staging queue reaches batchSize', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let   syncCount = 0;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       3,
      batchDeadlineMs: 60_000,
      syncFn: () => { syncCount++; },
    });

    const input  = makeInput();
    const commit = { verdict: 'COMMIT' as const, hookId: null };

    // 3rd row triggers auto-flush (batchSize = 3)
    const p1 = backend.commitRow(input, commit);
    const p2 = backend.commitRow(input, commit);
    const p3 = backend.commitRow(input, commit);

    const [o1, o2, o3] = await Promise.all([p1, p2, p3]);

    expect(syncCount).toBe(1);
    expect(o1).toBe(0);
    expect(o2).toBe(1);
    expect(o3).toBe(2);

    await backend.close();
    cleanTmpDir(rootDir);
  });

  // ─── PAUSE verdict + seal-and-split ────────────────────────────────────────

  it('Unit: WAL group-commit PAUSE verdict: rows 0..i committed (i with PAUSE), rows i+1.. restaged', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    let syncCount = 0;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       10,
      batchDeadlineMs: 60_000,
      syncFn: () => { syncCount++; },
    });

    const input = makeInput();

    const p0 = backend.commitRow(input, { verdict: 'COMMIT', hookId: null });
    const p1 = backend.commitRow(input, { verdict: 'PAUSE',  hookId: null });
    const p2 = backend.commitRow(input, { verdict: 'COMMIT', hookId: null }); // will be restaged

    // Flush: sealAndSplit commits rows 0..1, restages row 2
    await backend.flush();
    const [o0, o1] = await Promise.all([p0, p1]);

    expect(o0).toBe(0);
    expect(o1).toBe(1);
    expect(syncCount).toBe(1); // one sync for the first committed batch

    // WAL has exactly 2 records so far
    const records1 = backend.readSegmentRecords();
    expect(records1).toHaveLength(2);
    // Second record carries hookVerdict = 0x02 (PAUSE)
    expect(records1[1].hookVerdict).toBe(0x02);

    // Row 2 (p2) is restaged — its promise resolves on the NEXT flush
    await backend.flush();
    const o2 = await p2;
    expect(o2).toBe(2);
    expect(syncCount).toBe(2); // second sync for restaged batch

    // Now 3 records total
    const records2 = backend.readSegmentRecords();
    expect(records2).toHaveLength(3);

    await backend.close();
    cleanTmpDir(rootDir);
  });

  it('Unit: WAL group-commit PAUSE row durability: hookVerdict=PAUSE persists across reopen', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       10,
      batchDeadlineMs: 60_000,
    });

    const input = makeInput();
    const p0 = backend.commitRow(input, { verdict: 'COMMIT', hookId: null });
    const p1 = backend.commitRow(input, { verdict: 'PAUSE',  hookId: null });

    await backend.flush();
    await Promise.all([p0, p1]);
    await backend.close();

    // Reopen read-only and verify the PAUSE row is durable
    const ro      = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const records = ro.readSegmentRecords();
    expect(records).toHaveLength(2);
    expect(records[1].hookVerdict).toBe(0x02); // 0x02 = PAUSE in VERDICT_TO_WAL

    cleanTmpDir(rootDir);
  });

  it('Unit: WAL group-commit onPause callback fires when PAUSE row commits', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const pausedOffsets: number[] = [];

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       10,
      batchDeadlineMs: 60_000,
      onPause: (offset) => { pausedOffsets.push(offset); },
    });

    const input = makeInput();
    const p0 = backend.commitRow(input, { verdict: 'COMMIT', hookId: null });
    const p1 = backend.commitRow(input, { verdict: 'PAUSE',  hookId: null });

    await backend.flush();
    await Promise.all([p0, p1]);

    expect(pausedOffsets).toEqual([1]); // PAUSE row is at offset 1

    await backend.close();
    cleanTmpDir(rootDir);
  });

  // ─── Atomic abort ──────────────────────────────────────────────────────────

  it('Unit: WAL group-commit atomic abort: fsync failure → seg file unchanged, manifest intact, promises rejected', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const seg       = segPath(rootDir, sessionId);

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       10,
      batchDeadlineMs: 60_000,
      syncFn: () => { throw new Error('disk full'); },
    });

    const input = makeInput();
    const p1    = backend.commitRow(input, { verdict: 'COMMIT', hookId: null });
    const p2    = backend.commitRow(input, { verdict: 'COMMIT', hookId: null });

    // Capture rejections before flush to prevent unhandled-rejection warnings
    const settled = Promise.allSettled([p1, p2]);

    await expect(backend.flush()).rejects.toThrow('disk full');

    const results = await settled;
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
    expect((results[0] as PromiseRejectedResult).reason.message).toContain('disk full');

    // Segment file must be empty / absent (truncated back to pre-batch state)
    const segSize = fs.existsSync(seg) ? fs.statSync(seg).size : 0;
    expect(segSize).toBe(0);

    // Manifest still shows no committed rows
    const manifestRaw = fs.readFileSync(path.join(rootDir, 'meta', 'manifest.json'), 'utf8');
    const manifest    = JSON.parse(manifestRaw) as { lastCommitOffset: number };
    expect(manifest.lastCommitOffset).toBe(-1);

    cleanTmpDir(rootDir);
  });

  // ─── Hash-chain integrity across group batch ───────────────────────────────

  it('Unit: WAL group-commit batch hash-chain is valid after flush', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       10,
      batchDeadlineMs: 60_000,
    });

    const input  = makeInput();
    const commit = { verdict: 'COMMIT' as const, hookId: null };

    const ps = [
      backend.commitRow(input, commit),
      backend.commitRow(input, commit),
      backend.commitRow(input, commit),
    ];
    await backend.flush();
    await Promise.all(ps);

    const { verifyChain } = await import('../../ledger/wal/hash-chain.js');
    const records = backend.readSegmentRecords();
    expect(records).toHaveLength(3);
    expect(verifyChain(records)).toBe(true);

    await backend.close();
    cleanTmpDir(rootDir);
  });
});
