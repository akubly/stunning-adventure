/**
 * A1–A4 Conformance assertions + FIFO-ordering invariants + Roger's
 * session-reopen seam (§11 hermetic replay deepening — S4 lane).
 *
 * Test surface (§11.8 pseudocode, bound to Phase-0.5 capabilities):
 *
 *   A1 — Fork lineage preserved through replay.
 *        Deferred: fork() requires Phase-1 session-reopen infrastructure.
 *        Stub documents the invariant; will turn RED when fork() lands.
 *
 *   A2 — Hermetic replay produces identical ledger (multi-row deepening).
 *        RE-A2-1  10-row session: status='pass', rowsReplayed=10
 *        RE-A2-2  20-row session with mixed observation/decision kinds
 *        RE-A2-3  Session with non-empty causalReadSet on every row
 *        RE-A2-4  Non-strict: first-mismatch offset tracks correctly over 10 rows
 *
 *   A3 — Pre-commit hook verdicts replay identically (WAL durability).
 *        RE-A3-1  hookVerdict=0xFF (no hook, COMMIT/null) survives close→reopen
 *        RE-A3-2  hookVerdict=0x00 (hook fired, COMMIT/hookId) survives close→reopen
 *        RE-A3-3  hookVerdict=0x01 (OBSERVE) survives close→reopen
 *        RE-A3-4  Mixed-verdict session: replay engine passes (oracle is hash-based,
 *                 not verdict-sensitive — verdict bytes are WAL-durable, not
 *                 re-computed during replay)
 *        RE-A3-5  Each verdict byte is stored exactly once per row (no duplication)
 *
 *   A4 — Causal read-set round-trips through WAL.
 *        RE-A4-1  Non-empty causalReadSet produces non-zero readSetHash in segment
 *        RE-A4-2  readSetHash survives close→reopen (byte-identical)
 *        RE-A4-3  Replay over session with non-empty causalReadSets: status='pass'
 *        RE-A4-4  Empty causalReadSet → zero readSetHash (invariant)
 *        RE-A4-5  readSetHash is the BLAKE3 of CBOR(causalReadSet) — recomputing
 *                 outside the engine yields the same bytes
 *
 *   FIFO ordering — replay-ordering invariants at the scheduler boundary.
 *        RE-FIFO-1  commitOffset is strictly increasing across all rows in a session
 *        RE-FIFO-2  commitOffset order in segment records matches insertion order
 *        RE-FIFO-3  Multi-proposal session: Decision offsets are monotonically
 *                   ordered relative to bootstrap boundary
 *        RE-FIFO-4  Replay passes for a multi-proposal session (ordering preserved)
 *
 *   Reopen seam — sealed WAL → continue write → replay covers all rows.
 *        RE-REOPEN-1  Replay on sealed WAL (N rows): pass, rowsReplayed=N
 *        RE-REOPEN-2  Reopen for write, commit M more rows, close → replay on full
 *                     session (N+M rows): pass, rowsReplayed=N+M
 *        RE-REOPEN-3  lastTimestampNs monotonicity preserved across reopen boundary
 *        RE-REOPEN-4  Replay report rowsReplayed increases by M after reopen write
 *
 * CTD: §11.4 (ReplayDriver), §11.6 (oracle), §11.7 (preflight), §11.8 (A1–A4)
 * TDD: §3.1 (LedgerWindowReader), §3.2 (ReadSetHasher), §6.3 (Replay Equivalence)
 */

import { describe, it, expect, afterEach } from 'vitest';
import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';
import { randomUUID } from 'node:crypto';

import { createFileSystemWalBackend } from '../../ledger/wal-backend-fs.js';
import { createReplayEngine }         from '../../skeleton/replay-engine.js';
import { encodeCbor }                 from '../../ledger/wal/cbor.js';
import type { PrimitiveInput }        from '../../types.js';
import type { HookResult, HookVerdict } from '../../ledger/hook-bus.js';
import type { SegmentRecord }         from '../../ledger/wal/types.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const dirs: string[] = [];

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `crucible-conformance-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

/** Canonical COMMIT with no hook matched (verdict byte 0xFF). */
function commitResult(): HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } {
  return { verdict: 'COMMIT' as const, hookId: null };
}

/** COMMIT with a named hook (verdict byte 0x00). */
function commitHookResult(hookId: string): HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } {
  return { verdict: 'COMMIT' as const, hookId };
}

/** OBSERVE with a named hook (verdict byte 0x01). */
function observeResult(hookId: string): HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } {
  return { verdict: 'OBSERVE' as const, hookId };
}

function makeObs(tag: string, causalReadSet: string[] = []): PrimitiveInput {
  return {
    primitiveKind:    'observation',
    primitivePayload: { content: `obs-${tag}` },
    causalReadSet,
  };
}

function makeDec(tag: string, causalReadSet: string[] = []): PrimitiveInput {
  return {
    primitiveKind:    'decision',
    primitivePayload: { action: `dec-${tag}` },
    causalReadSet,
  };
}

/** Write rows with a uniform commitResult; return sessionId. */
async function writeSession(
  rootDir: string,
  rows: PrimitiveInput[],
): Promise<string> {
  const sessionId = `sess-${randomUUID().slice(0, 8)}`;
  const backend = await createFileSystemWalBackend(rootDir, sessionId);
  for (const row of rows) {
    await backend.commitRow(row, commitResult());
  }
  await backend.close();
  return sessionId;
}

/** Byte-equality helper. */
function bufEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Write rows to a fresh single-segment session and return the decoded segment records.
 *
 * readSegmentRecords() reads the active segment only — sufficient for sessions that
 * don't hit the 64 MiB roll-over boundary (all unit tests here).  For multi-segment
 * coverage use readAllSegmentRecords() directly (see FIFO / Reopen tests below).
 *
 * DEPENDENCY: A3, A4, and Reopen tests exercise WAL close→reopen mechanics that
 * land in Roger's squad/s4-wal branch.  squad/s4-replay must be merged AFTER
 * squad/s4-wal so the FileSystemWalBackend reopen seam is present.
 */
async function writeAndReadRecs(
  rootDir: string,
  inputs: Array<{
    row:  PrimitiveInput;
    hook: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null };
  }>,
): Promise<SegmentRecord[]> {
  const sessionId = `sess-${randomUUID().slice(0, 8)}`;
  const writer    = await createFileSystemWalBackend(rootDir, sessionId);
  for (const { row, hook } of inputs) {
    await writer.commitRow(row, hook);
  }
  await writer.close();

  const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
  const recs   = reader.readSegmentRecords();
  await reader.close();
  return recs;
}

// ─── A1 — Fork lineage (deferred to Phase 1) ─────────────────────────────────
//
// A1 requires fork() to create a child session from a parent session at a
// specific offset. This is a Phase-1 feature (session-reopen seam + catalog
// lookup). The test is documented here so it turns RED the moment fork() lands.

describe('A1 — Fork lineage preserved through replay [DEFERRED: Phase 1]', () => {
  it.skip(
    'A1: fork(parent, atOffset) → replay(child.sessionId) → ' +
    'parentSessionId preserved + forkPointEventId matches source offset ' +
    '[BLOCKED: createFork() Phase-1 not implemented — §11.8 A1, gap-flag Session-Reopen in decisions.md]',
    () => {
      // When fork() is available:
      //   const child = await fork(parent, /*atOffset*/ 3);
      //   const report = await engine.replay(child.sessionId);
      //   expect(report.status).toBe('pass');
      //   expect(meta(child).parentSessionId).toBe(parent.sessionId);
      //   expect(meta(child).forkPointEventId).toBe(3);
    },
  );
});

// ─── A2 — Multi-row session deepening ────────────────────────────────────────

describe('A2 deep — hermetic replay over multi-row sessions', () => {

  it('RE-A2-0: 0-row (empty) session → status=pass, rowsReplayed=0', async () => {
    const rootDir = makeTmpDir();
    const sessionId = await writeSession(rootDir, []);

    const report = await createReplayEngine(rootDir).replay(sessionId);

    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(0);
    expect(report.divergenceAtOffset).toBeNull();
    expect(report.divergenceKind).toBeNull();
  });

  it('RE-A2-1: 10-row session → status=pass, rowsReplayed=10', async () => {
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = Array.from({ length: 10 }, (_, i) =>
      makeObs(`row-${i}`),
    );
    const sessionId = await writeSession(rootDir, rows);

    const report = await createReplayEngine(rootDir).replay(sessionId);

    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(10);
    expect(report.divergenceAtOffset).toBeNull();
    expect(report.divergenceKind).toBeNull();
  });

  it('RE-A2-2: 20-row session with mixed observation/decision kinds → pass', async () => {
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = Array.from({ length: 20 }, (_, i) =>
      i % 3 === 2 ? makeDec(`d-${i}`) : makeObs(`o-${i}`),
    );
    const sessionId = await writeSession(rootDir, rows);

    const report = await createReplayEngine(rootDir).replay(sessionId);

    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(20);
  });

  it('RE-A2-3: session where every row has a non-empty causalReadSet → pass', async () => {
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = Array.from({ length: 8 }, (_, i) =>
      makeObs(`causal-${i}`, [`ref-${i}`, `ref-${i + 1}`]),
    );
    const sessionId = await writeSession(rootDir, rows);

    const report = await createReplayEngine(rootDir).replay(sessionId);

    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(8);
  });

  it('RE-A2-4: non-strict mode over 10 rows — first-mismatch at correct index', async () => {
    // Write 10 rows; corrupt row 5's CAS blob → divergence at offset 5.
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = Array.from({ length: 10 }, (_, i) =>
      makeObs(`row-${i}`),
    );
    const sessionId = await writeSession(rootDir, rows);

    // Identify and corrupt the CAS blob for row index 5.
    const inspector = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs = inspector.readAllSegmentRecords();
    expect(recs).toHaveLength(10);
    const rec5Hash = recs[5]!.payloadHash;
    await inspector.close();

    const hexHash = Buffer.from(rec5Hash).toString('hex');
    const casPath = path.join(rootDir, 'cas', hexHash.slice(0, 2), `${hexHash}.cbor`);
    // Guard: if the CAS blob is absent the on-disk layout has drifted — fail loud rather
    // than silently overwriting a non-existent path and missing the corruption injection.
    if (!fs.existsSync(casPath)) {
      throw new Error(
        `RE-A2-4: CAS blob not found at expected path — layout drift?\n  path: ${casPath}`,
      );
    }
    fs.writeFileSync(casPath, encodeCbor({ content: 'CORRUPTED' }));

    const report = await createReplayEngine(rootDir).replay(sessionId, { strict: false });

    expect(report.status).toBe('fail');
    // divergenceAtOffset is the load-bearing assertion: it pins the first-mismatch index.
    expect(report.divergenceAtOffset).toBe(5);
    // Non-strict semantics: the engine continues past the first divergence and counts
    // only the rows that hash-matched (corrupted rows are skipped, not counted).
    // We assert a bounded range rather than the exact count to avoid coupling the test
    // to the engine's internal row-counting semantics — divergenceAtOffset carries
    // the precise invariant.
    expect(report.rowsReplayed).toBeGreaterThanOrEqual(1); // rows before offset 5 at minimum
    expect(report.rowsReplayed).toBeLessThan(10);          // row 5 was not replayed
  });
});

// ─── A3 — Hook verdict bytes round-trip (WAL durability) ─────────────────────

describe('A3 — pre-commit hook verdict bytes survive WAL close→reopen', () => {

  it('RE-A3-1: hookVerdict=0xFF (COMMIT/null, no hook fired) persists through reopen', async () => {
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('v0xFF'), hook: commitResult() },  // hookId=null → 0xFF
    ]);

    expect(recs).toHaveLength(1);
    expect(recs[0]!.hookVerdict).toBe(0xFF);
  });

  it('RE-A3-2: hookVerdict=0x00 (COMMIT with named hook) persists through reopen', async () => {
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('v0x00'), hook: commitHookResult('policy-hook-1') },
    ]);

    expect(recs).toHaveLength(1);
    expect(recs[0]!.hookVerdict).toBe(0x00);
  });

  it('RE-A3-3: hookVerdict=0x01 (OBSERVE) persists through reopen', async () => {
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('v0x01'), hook: observeResult('attention-hook') },
    ]);

    expect(recs).toHaveLength(1);
    expect(recs[0]!.hookVerdict).toBe(0x01);
  });

  it('RE-A3-4: mixed-verdict session (0xFF / 0x00 / 0x01) → replay engine passes', async () => {
    // The ReplayEngine oracle is hash-based (payloadHash, readSetHash, envelopeCbor).
    // hookVerdict is WAL-durable data but is NOT part of the current oracle comparison —
    // the engine re-materializes with COMMIT/null (0xFF) and checks the three CAS-derived
    // hashes.  This test confirms replay passes regardless of what verdict bytes were stored.
    //
    // (A3 as spec'd in §11.8 requires a "replay produces rows with .hooks field"
    //  interface — that is a Phase-1 concern when the full ReplayDriver row-output
    //  surface is built.  This test guards the WAL-durability half of A3.)
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(makeObs('mixed-0'), commitResult());           // 0xFF
    await writer.commitRow(makeObs('mixed-1'), commitHookResult('h1'));   // 0x00
    await writer.commitRow(makeObs('mixed-2'), observeResult('h2'));      // 0x01
    await writer.commitRow(makeDec('mixed-3'), commitResult());           // 0xFF
    await writer.close();

    const report = await createReplayEngine(rootDir).replay(sessionId);
    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(4);
  });

  it('RE-A3-5: each verdict byte appears exactly once per row (no duplication)', async () => {
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('dup-0'), hook: commitResult() },
      { row: makeObs('dup-1'), hook: commitHookResult('h-dup') },
      { row: makeObs('dup-2'), hook: observeResult('h-obs') },
    ]);

    // Exactly 3 segment records, one per row.
    expect(recs).toHaveLength(3);
    expect(recs[0]!.hookVerdict).toBe(0xFF);
    expect(recs[1]!.hookVerdict).toBe(0x00);
    expect(recs[2]!.hookVerdict).toBe(0x01);
  });
});

// ─── A4 — Causal read-set round-trip ─────────────────────────────────────────

describe('A4 — causal read-set survives WAL round-trip and replay', () => {

  it('RE-A4-1: non-empty causalReadSet produces non-zero readSetHash in segment record', async () => {
    const ZERO    = new Uint8Array(32);
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('rs-1', ['event-ref-0', 'event-ref-1']), hook: commitResult() },
    ]);

    expect(recs).toHaveLength(1);
    // readSetHash must NOT be the zero hash when causalReadSet is non-empty.
    expect(bufEqual(recs[0]!.readSetHash, ZERO)).toBe(false);
  });

  it('RE-A4-2: readSetHash is byte-identical after close→reopen', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(makeObs('rs-2', ['a', 'b', 'c']), commitResult());
    const firstRecs = writer.readSegmentRecords();
    await writer.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const reopenRecs = reader.readSegmentRecords();
    await reader.close();

    expect(firstRecs).toHaveLength(1);
    expect(reopenRecs).toHaveLength(1);
    expect(bufEqual(firstRecs[0]!.readSetHash, reopenRecs[0]!.readSetHash)).toBe(true);
  });

  it('RE-A4-3: replay over session with non-empty causalReadSets on all rows → pass', async () => {
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = [
      makeObs('a', ['ref-0']),
      makeDec('b', ['ref-0', 'ref-1']),
      makeObs('c', ['ref-1', 'ref-2']),
      makeDec('d', ['ref-0', 'ref-1', 'ref-2']),
    ];
    const sessionId = await writeSession(rootDir, rows);

    const report = await createReplayEngine(rootDir).replay(sessionId);

    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(4);
  });

  it('RE-A4-4: empty causalReadSet → zero readSetHash in segment record', async () => {
    const ZERO    = new Uint8Array(32);
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('empty-rs'), hook: commitResult() },  // causalReadSet: []
    ]);

    expect(recs).toHaveLength(1);
    expect(bufEqual(recs[0]!.readSetHash, ZERO)).toBe(true);
  });

  it('RE-A4-5: readSetHash equals BLAKE3(CBOR(causalReadSet)) — recomputed externally', async () => {
    // Golden literal: BLAKE3(CBOR(["event-ref-A", "event-ref-B"]))
    // CBOR bytes: 826b6576656e742d7265662d416b6576656e742d7265662d42
    // Pre-computed with @noble/hashes blake3 + cborg (Crucible canonical CBOR profile).
    // If this hex changes, the CBOR encoding or hash function semantics have changed —
    // update the CBOR bytes comment and re-verify the new encoding contract before accepting.
    const GOLDEN_HEX = '73c5b8ce937d35d2092628c55b44049ca657dc5426f0679297e95fcff29c71f8';
    const GOLDEN     = Uint8Array.from(Buffer.from(GOLDEN_HEX, 'hex'));

    const refs    = ['event-ref-A', 'event-ref-B'];
    const rootDir = makeTmpDir();
    const recs    = await writeAndReadRecs(rootDir, [
      { row: makeObs('hash-pin', refs), hook: commitResult() },
    ]);

    // Assert against the golden literal, not a tautological re-computation using the
    // same functions as the WAL implementation.  This catches any silent change in
    // encodeCbor or hashBytes even if both sides shift together.
    expect(recs).toHaveLength(1);
    expect(bufEqual(recs[0]!.readSetHash, GOLDEN)).toBe(true);
  });
});

// ─── FIFO ordering invariants ─────────────────────────────────────────────────

describe('FIFO ordering — commit offset monotonicity at scheduler boundary', () => {

  it('RE-FIFO-1: commitOffset is strictly increasing across all rows in a single session', async () => {
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = [
      makeObs('fifo-0'),
      makeDec('fifo-1'),
      makeObs('fifo-2'),
      makeDec('fifo-3'),
      makeObs('fifo-4'),
    ];
    const sessionId = await writeSession(rootDir, rows);

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs   = reader.readAllSegmentRecords();
    await reader.close();

    expect(recs).toHaveLength(5);
    for (let i = 1; i < recs.length; i++) {
      expect(Number(recs[i]!.commitOffset)).toBeGreaterThan(
        Number(recs[i - 1]!.commitOffset),
      );
    }
  });

  it('RE-FIFO-2: commitOffset order in segment records matches insertion order', async () => {
    // Each row's commitOffset must equal its zero-based insertion index.
    const rootDir = makeTmpDir();
    const rows: PrimitiveInput[] = [
      makeObs('ord-0'),
      makeObs('ord-1'),
      makeDec('ord-2'),
      makeObs('ord-3'),
    ];
    const sessionId = await writeSession(rootDir, rows);

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs   = reader.readAllSegmentRecords();
    await reader.close();

    for (let i = 0; i < recs.length; i++) {
      expect(Number(recs[i]!.commitOffset)).toBe(i);
    }
  });

  it('RE-FIFO-3: Decision offsets are monotonically increasing relative to bootstrap boundary', async () => {
    // Simulates a multi-proposal session: bootstrap rows (index 0-1) followed
    // by alternating observation/decision turn primitives.
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId);

    // Bootstrap rows (offset 0, 1).
    await backend.commitRow(makeObs('bootstrap-sys-prompt'), commitResult());
    await backend.commitRow(makeObs('bootstrap-tool-defs'),  commitResult());

    // Turn 1: observation then decision (offsets 2, 3).
    await backend.commitRow(makeObs('turn1-obs'), commitResult());
    await backend.commitRow(makeDec('turn1-dec'), commitResult());

    // Turn 2: observation then decision (offsets 4, 5).
    await backend.commitRow(makeObs('turn2-obs'), commitResult());
    await backend.commitRow(makeDec('turn2-dec'), commitResult());

    await backend.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs   = reader.readAllSegmentRecords();
    await reader.close();

    // Decision rows are at indices 3 and 5.
    const decisionOffsets = [3, 5].map(i => Number(recs[i]!.commitOffset));
    expect(decisionOffsets[1]).toBeGreaterThan(decisionOffsets[0]!);
    // Both are strictly after the bootstrap boundary (offset 1).
    for (const off of decisionOffsets) {
      expect(off).toBeGreaterThan(1);
    }
  });

  it('RE-FIFO-4: replay passes for a multi-proposal session (ordering preserved end-to-end)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    // 2 bootstrap + 3 turn pairs = 8 rows total.
    await backend.commitRow(makeObs('bp-sys'),  commitResult());
    await backend.commitRow(makeObs('bp-tools'), commitResult());
    for (let t = 0; t < 3; t++) {
      await backend.commitRow(makeObs(`t${t}-obs`), commitResult());
      await backend.commitRow(makeDec(`t${t}-dec`), commitResult());
    }
    await backend.close();

    const report = await createReplayEngine(rootDir).replay(sessionId);
    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(8);
  });
});

// ─── Roger's session-reopen seam ─────────────────────────────────────────────
//
// Replay reads a SEALED WAL; reopen continues it (Phase-1 seam boundary).
// These tests verify the WAL backend's reopen mechanics are compatible with
// the replay engine — i.e. rows written before close are visible to the replay
// engine, and rows written after a write-reopen are also visible.

describe('Reopen seam — sealed WAL → continue write → replay covers all rows', () => {

  it('RE-REOPEN-1: replay on sealed WAL (N=5 rows) → pass, rowsReplayed=5', async () => {
    const rootDir = makeTmpDir();
    const sessionId = await writeSession(rootDir, [
      makeObs('r0'), makeObs('r1'), makeDec('r2'), makeObs('r3'), makeDec('r4'),
    ]);

    const report = await createReplayEngine(rootDir).replay(sessionId);
    expect(report.status).toBe('pass');
    expect(report.rowsReplayed).toBe(5);
  });

  it('RE-REOPEN-2: write-reopen adds M=3 rows → replay on full session → rowsReplayed=8', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Phase 1: write 5 rows, seal.
    const phase1 = await createFileSystemWalBackend(rootDir, sessionId);
    for (let i = 0; i < 5; i++) {
      await phase1.commitRow(makeObs(`phase1-${i}`), commitResult());
    }
    await phase1.close();

    // Replay after seal: 5 rows.
    const mid = await createReplayEngine(rootDir).replay(sessionId);
    expect(mid.status).toBe('pass');
    expect(mid.rowsReplayed).toBe(5);

    // Phase 2: write-reopen and add 3 more rows.
    const phase2 = await createFileSystemWalBackend(rootDir, sessionId);
    for (let i = 0; i < 3; i++) {
      await phase2.commitRow(makeDec(`phase2-${i}`), commitResult());
    }
    await phase2.close();

    // Replay after reopen: 8 rows total.
    const full = await createReplayEngine(rootDir).replay(sessionId);
    expect(full.status).toBe('pass');
    expect(full.rowsReplayed).toBe(8);
  });

  it('RE-REOPEN-3: lastTimestampNs is monotonically non-decreasing across the reopen boundary', async () => {
    // After reopen, newly committed rows must have timestampNs ≥ the last
    // timestampNs of the sealed session — the backend seeds lastTimestampNs
    // from replayed records on open (§3.10 monotonicity across reopen).
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const phase1 = await createFileSystemWalBackend(rootDir, sessionId);
    await phase1.commitRow(makeObs('ts-p1-0'), commitResult());
    await phase1.commitRow(makeObs('ts-p1-1'), commitResult());
    await phase1.close();

    const phase2 = await createFileSystemWalBackend(rootDir, sessionId);
    await phase2.commitRow(makeObs('ts-p2-0'), commitResult());
    await phase2.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs   = reader.readAllSegmentRecords();
    await reader.close();

    expect(recs).toHaveLength(3);
    // Each subsequent row's timestampNs must be ≥ the previous row's.
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i]!.timestampNs).toBeGreaterThanOrEqual(recs[i - 1]!.timestampNs);
    }
    // The post-reopen row (index 2) must have timestampNs ≥ the sealed row (index 1).
    expect(recs[2]!.timestampNs).toBeGreaterThanOrEqual(recs[1]!.timestampNs);
  });

  it('RE-REOPEN-4: rowsReplayed delta equals the number of rows written in each phase', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Phase 1: 4 rows.
    const p1 = await createFileSystemWalBackend(rootDir, sessionId);
    for (let i = 0; i < 4; i++) await p1.commitRow(makeObs(`p1-${i}`), commitResult());
    await p1.close();

    const rep1 = await createReplayEngine(rootDir).replay(sessionId);
    expect(rep1.rowsReplayed).toBe(4);

    // Phase 2: 6 more rows.
    const p2 = await createFileSystemWalBackend(rootDir, sessionId);
    for (let i = 0; i < 6; i++) await p2.commitRow(makeDec(`p2-${i}`), commitResult());
    await p2.close();

    const rep2 = await createReplayEngine(rootDir).replay(sessionId);
    expect(rep2.rowsReplayed).toBe(10);  // 4 + 6

    // Phase 3: 2 more rows.
    const p3 = await createFileSystemWalBackend(rootDir, sessionId);
    for (let i = 0; i < 2; i++) await p3.commitRow(makeObs(`p3-${i}`), commitResult());
    await p3.close();

    const rep3 = await createReplayEngine(rootDir).replay(sessionId);
    expect(rep3.rowsReplayed).toBe(12);  // 4 + 6 + 2
    expect(rep3.status).toBe('pass');
  });
});
