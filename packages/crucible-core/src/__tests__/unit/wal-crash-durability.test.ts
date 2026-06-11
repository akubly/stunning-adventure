/**
 * RED PHASE — WAL crash-durability: manifest-gate drops durable rows (issue #56).
 *
 * TDD Strategy  : §3.2/§3.5 crash-durability (docs/crucible-tdd-strategy.md)
 * Scope fence   : #56 ONLY — manifest-trust gap. NOT #59 (CAS fsync).
 *
 * Bug: FileSystemWalBackend.open() calls replayFromSegments() only when
 *   manifest.lastCommitOffset >= 0. If the process crashes AFTER a segment
 *   fdatasync but BEFORE the manifest.json update, the manifest still shows
 *   lastCommitOffset = -1, so replay is skipped and durable rows are lost.
 *
 * This test MUST FAIL against the unpatched implementation (0 rows on reopen
 * instead of the expected 3) and PASS after the fix (always replay from the
 * segment file regardless of manifest.lastCommitOffset).
 *
 * Crash simulation: write rows → flush (segment is durable) → manually
 *   overwrite manifest.lastCommitOffset back to -1 → close → reopen.
 *   This accurately models the on-disk state left by a crash between Phase 3
 *   (segment fdatasync) and Phase 4 (manifest.json writeFileSync) in
 *   executeFlush().
 *
 * Invariants:
 *   CD-1: First-batch crash — 3 durable rows recovered after manifest set to -1
 *   CD-2: Subsequent-batch crash — rows from fdatasync'd batch recovered when
 *         manifest shows a prior lastCommitOffset (defence-in-depth; current
 *         code already handles this, so CD-2 remains GREEN before and after fix)
 *   CD-3: Hash-chain verifies across the crash-recovered boundary
 *   CD-4: Post-recovery write chains correctly (prevRoot seeded from recovered tail)
 *   CD-5: lastTimestampNs seeded from recovered rows — subsequent rows don't regress
 */

import { describe, it, expect, afterEach } from 'vitest';
import { randomUUID }  from 'node:crypto';
import path            from 'node:path';
import os              from 'node:os';
import fs              from 'node:fs';
import {
  createFileSystemWalBackend,
} from '../../ledger/wal-backend-fs.js';
import { verifyChain } from '../../ledger/wal/hash-chain.js';
import type { PrimitiveInput } from '../../types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dirs: string[] = [];

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-cd-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function makeInput(tag = 'row'): PrimitiveInput {
  return {
    primitiveKind:    'observation',
    primitivePayload: { tag },
    causalReadSet:    [],
  };
}

function commit() {
  return { verdict: 'COMMIT' as const, hookId: null };
}

function manifestPath(rootDir: string, sessionId: string): string {
  return path.join(rootDir, 'wal', 'sessions', sessionId, 'manifest.json');
}

/**
 * Simulate crash between Phase 3 (segment fdatasync) and Phase 4 (manifest update):
 * Overwrite manifest.lastCommitOffset to -1, preserving segmentRange.
 * The segment bytes are already durable; the manifest is now stale.
 */
function simulateCrashBeforeManifestUpdate(rootDir: string, sessionId: string): void {
  const mp = manifestPath(rootDir, sessionId);
  const m  = JSON.parse(fs.readFileSync(mp, 'utf8')) as {
    schemaVersion: number;
    sessionId: string;
    segmentRange: [number, number];
    lastCommitOffset: number;
  };
  m.lastCommitOffset = -1;
  fs.writeFileSync(mp, JSON.stringify(m, null, 2), 'utf8');
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WAL FileSystemWalBackend — crash-durability (issue #56)', () => {

  // ── CD-1: First-batch crash ─────────────────────────────────────────────────
  //
  // This is the actual bug: manifest never advanced past -1, yet the segment
  // has 3 durable (fdatasync'd) rows. Current code: 0 rows on reopen. Fixed: 3.

  it('CD-1: first-batch crash — all durable rows recovered when manifest.lastCommitOffset=-1', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Write 3 rows in one batch (batchSize=3 → auto-flush, one sync barrier)
    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize:       3,
      batchDeadlineMs: 60_000, // suppress timer
    });

    await Promise.all([
      backend.commitRow(makeInput('r0'), commit()),
      backend.commitRow(makeInput('r1'), commit()),
      backend.commitRow(makeInput('r2'), commit()),
    ]);

    // Segment is durable. Simulate crash: revert manifest to pre-batch state.
    simulateCrashBeforeManifestUpdate(rootDir, sessionId);

    // Close without triggering another flush (no staged entries)
    await backend.close();

    // Verify crash state: manifest shows -1
    const manifestAfterCrash = JSON.parse(
      fs.readFileSync(manifestPath(rootDir, sessionId), 'utf8'),
    ) as { lastCommitOffset: number };
    expect(manifestAfterCrash.lastCommitOffset).toBe(-1);

    // ── Reopen and expect recovery ──────────────────────────────────────────
    const recovered = await createFileSystemWalBackend(rootDir, sessionId, {
      readOnly: true,
    });
    const rows = await recovered.readRows({ range: [0, 10] });

    expect(rows).toHaveLength(3);
    expect((rows[0].primitivePayload as { tag: string }).tag).toBe('r0');
    expect((rows[1].primitivePayload as { tag: string }).tag).toBe('r1');
    expect((rows[2].primitivePayload as { tag: string }).tag).toBe('r2');
    expect(rows[0].offset).toBe(0);
    expect(rows[1].offset).toBe(1);
    expect(rows[2].offset).toBe(2);
  });

  // ── CD-2: Subsequent-batch crash (defence-in-depth) ─────────────────────────
  //
  // Crash after second batch fdatasync, before manifest update.
  // manifest.lastCommitOffset = 1 (first batch), segment has rows 0-3.
  // Both old and new code should recover all 4 rows (scanSegmentFile reads all
  // bytes; lastCommitOffset > 0 means the gate passes in the current code too).
  // This test documents the invariant and guards against future regression.

  it('CD-2: subsequent-batch crash — all rows recovered when manifest lags segment', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First batch: rows 0-1
    const b1 = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 2, batchDeadlineMs: 60_000,
    });
    await Promise.all([
      b1.commitRow(makeInput('r0'), commit()),
      b1.commitRow(makeInput('r1'), commit()),
    ]);
    await b1.close();

    // Second batch: rows 2-3
    const b2 = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 2, batchDeadlineMs: 60_000,
    });
    await Promise.all([
      b2.commitRow(makeInput('r2'), commit()),
      b2.commitRow(makeInput('r3'), commit()),
    ]);

    // Simulate crash: revert manifest to after first batch (offset=1)
    // without reverting segment (rows 2-3 are durable on disk)
    simulateCrashBeforeManifestUpdate(rootDir, sessionId);
    // Restore to first-batch state: lastCommitOffset = 1
    const mp = manifestPath(rootDir, sessionId);
    const m  = JSON.parse(fs.readFileSync(mp, 'utf8')) as { lastCommitOffset: number };
    m.lastCommitOffset = 1;
    fs.writeFileSync(mp, JSON.stringify(m, null, 2), 'utf8');

    await b2.close();

    // Reopen and expect all 4 rows recovered
    const recovered = await createFileSystemWalBackend(rootDir, sessionId, {
      readOnly: true,
    });
    const rows = await recovered.readRows({ range: [0, 10] });
    expect(rows).toHaveLength(4);
    expect(rows[2].offset).toBe(2);
    expect(rows[3].offset).toBe(3);
  });

  // ── CD-3: Hash-chain verifies across the crash-recovered boundary ───────────

  it('CD-3: hash-chain verifies cleanly across crash-recovered rows', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 3, batchDeadlineMs: 60_000,
    });

    await Promise.all([
      backend.commitRow(makeInput('r0'), commit()),
      backend.commitRow(makeInput('r1'), commit()),
      backend.commitRow(makeInput('r2'), commit()),
    ]);

    simulateCrashBeforeManifestUpdate(rootDir, sessionId);
    await backend.close();

    // Reopen (read-only) — replay should set prevRoot from last recovered record
    const recovered = await createFileSystemWalBackend(rootDir, sessionId, {
      readOnly: true,
    });

    // Hash-chain of all recovered records must be valid
    const records = recovered.readSegmentRecords();
    expect(records).toHaveLength(3);
    expect(verifyChain(records)).toBe(true);
  });

  // ── CD-4: Post-recovery write chains correctly ──────────────────────────────
  //
  // After crash-recovery, prevRoot is seeded from the recovered segment tail.
  // A subsequent write must chain onto the recovered tail (not ZERO_HASH).

  it('CD-4: post-recovery write chains onto recovered tail (prevRoot seeded correctly)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Write and crash-simulate first batch (rows 0-1)
    const b1 = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 2, batchDeadlineMs: 60_000,
    });
    await Promise.all([
      b1.commitRow(makeInput('r0'), commit()),
      b1.commitRow(makeInput('r1'), commit()),
    ]);
    simulateCrashBeforeManifestUpdate(rootDir, sessionId);
    await b1.close();

    // Reopen read-write — recovery must restore prevRoot from tail
    const b2 = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1,
    });

    // Write a new row — must chain onto offset=1's selfRoot
    const offset = await b2.commitRow(makeInput('r2'), commit());
    expect(offset).toBe(2); // offset continues from recovered state

    await b2.close();

    // Verify: reopen again and check chain integrity across all 3 records
    const verify = await createFileSystemWalBackend(rootDir, sessionId, {
      readOnly: true,
    });
    const records = verify.readSegmentRecords();
    expect(records).toHaveLength(3);
    expect(verifyChain(records)).toBe(true);

    const rows = await verify.readRows({ range: [0, 10] });
    expect(rows).toHaveLength(3);
    expect(rows[2].offset).toBe(2);
  });

  // ── CD-5: lastTimestampNs seeded from crash-recovered rows ──────────────────
  //
  // After recovery, lastTimestampNs must be seeded from the highest recovered
  // record's timestampNs. A subsequent write's timestampNs must not regress.

  it('CD-5: lastTimestampNs seeded correctly from crash-recovered rows', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const highTick = 10_000_000_000n; // 10 s in nanoseconds

    // Write one row with a known high timestamp
    const b1 = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1, nowNs: () => highTick,
    });
    await b1.commitRow(makeInput('r0'), commit());
    simulateCrashBeforeManifestUpdate(rootDir, sessionId);
    await b1.close();

    // Reopen with a clock that returns a LOWER value
    const lowTick = 1_000_000_000n; // 1 s — should be clamped
    const b2 = await createFileSystemWalBackend(rootDir, sessionId, {
      batchSize: 1, nowNs: () => lowTick,
    });
    await b2.commitRow(makeInput('r1'), commit());
    await b2.close();

    // Verify: second record's timestampNs >= first record's timestampNs
    const verify = await createFileSystemWalBackend(rootDir, sessionId, {
      readOnly: true,
    });
    const records = verify.readSegmentRecords();
    expect(records).toHaveLength(2);
    expect(records[1].timestampNs).toBeGreaterThanOrEqual(records[0].timestampNs);
  });
});
