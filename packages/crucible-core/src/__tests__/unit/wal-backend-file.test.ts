/**
 * RED PHASE — File-backed WalBackend durability (§3.2 on-disk layout).
 *
 * Sub-seam scope  : FileSystemWalBackend — segment files, index.idx,
 *                   manifest.json, CAS bodies. Reuses codec/hash-chain/CAS
 *                   sub-seam internals already GREEN.
 * TDD Strategy    : §4 Walkthrough B, Lane 1 — WAL substrate file backend
 *                   (docs/crucible-tdd-strategy.md)
 * Locked Decision : OQ-2 FEDERATE; seam: WalBackend from graham-ledger-seam.md.
 * Seam constraint : Does NOT touch Ledger.append() or HookBus — WalBackend only.
 *
 * This test MUST FAIL with "Cannot find module" until wal-backend-fs.ts is created.
 *
 * Temp dirs: os.tmpdir() + randomUUID subdir per test, cleaned in afterEach.
 * No files leak to repo or ~/.crucible.
 *
 * Invariants exercised:
 *   1. Rows written persist across backend reopen (durability).
 *   2. manifest.json tracks schemaVersion + sessionId + lastCommitOffset.
 *   3. Hash-chain integrity (verifyChain) passes after reopen.
 *   4. A single byte-tampered segment record breaks verifyChain.
 *   5. CAS body .cbor files exist on disk after commitRow.
 *   6. index.idx exists with one NDJSON entry per committed row.
 */

import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import {
  createFileSystemWalBackend,
  CorruptSegmentError,
} from '../../ledger/wal-backend-fs.js';
import { verifyChain, buildChain, ZERO_HASH } from '../../ledger/wal/hash-chain.js';
import { encodeRecord } from '../../ledger/wal/codec.js';
import { hashBytes } from '../../ledger/wal/hash.js';
import type { SegmentRecordInput } from '../../ledger/wal/types.js';
import type { PrimitiveInput } from '../../types.js';
import type { HookResult, HookVerdict } from '../../ledger/hook-bus.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dirs: string[] = [];

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `crucible-wal-test-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeInput(content: string, kind: PrimitiveInput['primitiveKind'] = 'observation'): PrimitiveInput {
  return {
    primitiveKind:    kind,
    primitivePayload: { content },
    causalReadSet:    [],
  };
}

const COMMIT_RESULT: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } = {
  verdict: 'COMMIT',
  hookId:  null,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WAL FileSystemWalBackend — file-backed durability', () => {

  it('Unit: FileSystemWalBackend rows survive backend reopen (durability)', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend1 = await createFileSystemWalBackend(rootDir, sessionId);
    const off0 = await backend1.commitRow(makeInput('first'), COMMIT_RESULT);
    const off1 = await backend1.commitRow(makeInput('second'), COMMIT_RESULT);
    expect(off0).toBe(0);
    expect(off1).toBe(1);

    // Simulate "process restart": close first writer then reopen
    await backend1.close();
    const backend2 = await createFileSystemWalBackend(rootDir, sessionId);
    const rows = await backend2.readRows({ range: [0, 10] });

    expect(rows).toHaveLength(2);
    expect(rows[0].offset).toBe(0);
    expect(rows[1].offset).toBe(1);
    expect((rows[0].primitivePayload as { content: string }).content).toBe('first');
    expect((rows[1].primitivePayload as { content: string }).content).toBe('second');
    expect(rows[0].primitiveKind).toBe('observation');
  });

  it('Unit: FileSystemWalBackend manifest.json reflects schema and lastCommitOffset', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(makeInput('x'), COMMIT_RESULT);
    await backend.commitRow(makeInput('y'), COMMIT_RESULT);

    const manifestPath = path.join(rootDir, 'wal', 'sessions', sessionId, 'manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      schemaVersion: number;
      sessionId: string;
      segmentRange: [number, number];
      lastCommitOffset: number;
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sessionId).toBe(sessionId);
    expect(manifest.lastCommitOffset).toBe(1);
    expect(Array.isArray(manifest.segmentRange)).toBe(true);
  });

  it('Unit: FileSystemWalBackend hash-chain integrity passes after reopen', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend1 = await createFileSystemWalBackend(rootDir, sessionId);
    await backend1.commitRow(makeInput('r0'), COMMIT_RESULT);
    await backend1.commitRow(makeInput('r1'), COMMIT_RESULT);
    await backend1.commitRow(makeInput('r2'), COMMIT_RESULT);

    // Reopen and read raw segment records (close first to release write lock)
    await backend1.close();
    const backend2 = await createFileSystemWalBackend(rootDir, sessionId);
    const records = backend2.readSegmentRecords();

    expect(records).toHaveLength(3);
    expect(verifyChain(records)).toBe(true);
  });

  it('Unit: FileSystemWalBackend tampered segment byte breaks verifyChain', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend1 = await createFileSystemWalBackend(rootDir, sessionId);
    await backend1.commitRow(makeInput('row-a'), COMMIT_RESULT);
    await backend1.commitRow(makeInput('row-b'), COMMIT_RESULT);

    // Corrupt a byte inside the payloadHash field of the first record.
    // payloadHash starts at byte offset 92 in the segment record.
    const segPath = path.join(rootDir, 'wal', 'sessions', sessionId, '000000.seg');
    const segBuf = fs.readFileSync(segPath);
    segBuf[92] ^= 0xff; // flip bits in payloadHash — selfRoot now wrong
    fs.writeFileSync(segPath, segBuf);

    // Reopen: record loads with corrupted payloadHash; verifyChain re-derives selfRoot → mismatch
    await backend1.close();
    const backend2 = await createFileSystemWalBackend(rootDir, sessionId);
    const records = backend2.readSegmentRecords();
    expect(verifyChain(records)).toBe(false);
  });

  it('Unit: FileSystemWalBackend CAS body .cbor files written to disk', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(makeInput('payload-content'), COMMIT_RESULT);

    // At least one .cbor file should exist under cas/<shard>/
    const casDir = path.join(rootDir, 'cas');
    expect(fs.existsSync(casDir)).toBe(true);

    let cborCount = 0;
    for (const shard of fs.readdirSync(casDir)) {
      const shardDir = path.join(casDir, shard);
      if (!fs.statSync(shardDir).isDirectory()) continue;
      for (const file of fs.readdirSync(shardDir)) {
        if (file.endsWith('.cbor')) cborCount++;
      }
    }
    expect(cborCount).toBeGreaterThan(0);
  });

  it('Unit: FileSystemWalBackend index.idx written with NDJSON entry per commit', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(makeInput('a'), COMMIT_RESULT);
    await backend.commitRow(makeInput('b'), COMMIT_RESULT);

    const indexPath = path.join(rootDir, 'wal', 'sessions', sessionId, 'index.idx');
    expect(fs.existsSync(indexPath)).toBe(true);

    const lines = fs.readFileSync(indexPath, 'utf8')
      .split('\n')
      .filter(l => l.trim().length > 0);
    expect(lines).toHaveLength(2);

    const entry0 = JSON.parse(lines[0]) as { offset: number; seg: number; byteOffset: number };
    expect(entry0.offset).toBe(0);
    expect(entry0.seg).toBe(0);
    expect(typeof entry0.byteOffset).toBe('number');
    expect(entry0.byteOffset).toBe(0); // first record starts at byte 0

    const entry1 = JSON.parse(lines[1]) as { offset: number; seg: number; byteOffset: number };
    expect(entry1.offset).toBe(1);
    expect(entry1.byteOffset).toBeGreaterThan(0); // second record after first
  });

  it('Unit: FileSystemWalBackend subsequent appends after reopen continue chain correctly', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // First session: 2 rows
    const b1 = await createFileSystemWalBackend(rootDir, sessionId);
    await b1.commitRow(makeInput('pre-1'), COMMIT_RESULT);
    await b1.commitRow(makeInput('pre-2'), COMMIT_RESULT);

    // Reopen and append one more (close first to release write lock)
    await b1.close();
    const b2 = await createFileSystemWalBackend(rootDir, sessionId);
    const off2 = await b2.commitRow(makeInput('post-3'), COMMIT_RESULT);
    expect(off2).toBe(2);

    // Verify full 3-row chain
    const records = b2.readSegmentRecords();
    expect(records).toHaveLength(3);
    expect(verifyChain(records)).toBe(true);

    // Verify readRows returns all 3
    const rows = await b2.readRows({ range: [0, 10] });
    expect(rows).toHaveLength(3);
    expect((rows[2].primitivePayload as { content: string }).content).toBe('post-3');
  });

  it('T1: two sessions under the same rootDir have isolated per-session manifests (no cross-contamination)', async () => {
    const rootDir = makeTmpDir();
    const sessionA = `sess-a-${randomUUID().slice(0, 8)}`;
    const sessionB = `sess-b-${randomUUID().slice(0, 8)}`;

    // Session A: commit 2 rows and close
    const backendA1 = await createFileSystemWalBackend(rootDir, sessionA);
    await backendA1.commitRow(makeInput('a-row-0'), COMMIT_RESULT);
    await backendA1.commitRow(makeInput('a-row-1'), COMMIT_RESULT);
    await backendA1.close();

    // Session B: commit 1 row and close — with shared manifest this clobbers A's manifest
    const backendB = await createFileSystemWalBackend(rootDir, sessionB);
    await backendB.commitRow(makeInput('b-row-0'), COMMIT_RESULT);
    await backendB.close();

    // Each session must have its OWN manifest at its per-session path
    const manifestPathA = path.join(rootDir, 'wal', 'sessions', sessionA, 'manifest.json');
    const manifestPathB = path.join(rootDir, 'wal', 'sessions', sessionB, 'manifest.json');

    expect(fs.existsSync(manifestPathA), 'session A manifest must be at per-session path').toBe(true);
    expect(fs.existsSync(manifestPathB), 'session B manifest must be at per-session path').toBe(true);

    const mA = JSON.parse(fs.readFileSync(manifestPathA, 'utf8')) as {
      sessionId: string; lastCommitOffset: number;
    };
    const mB = JSON.parse(fs.readFileSync(manifestPathB, 'utf8')) as {
      sessionId: string; lastCommitOffset: number;
    };

    // Session A's manifest must reflect only A's state
    expect(mA.sessionId).toBe(sessionA);
    expect(mA.lastCommitOffset).toBe(1); // offsets 0 and 1

    // Session B's manifest must reflect only B's state
    expect(mB.sessionId).toBe(sessionB);
    expect(mB.lastCommitOffset).toBe(0); // offset 0

    // Reopen each session and verify row isolation
    const backendA2 = await createFileSystemWalBackend(rootDir, sessionA, { readOnly: true });
    const rowsA = await backendA2.readRows({ range: [0, 10] });
    expect(rowsA).toHaveLength(2);
    expect((rowsA[0].primitivePayload as { content: string }).content).toBe('a-row-0');
    expect((rowsA[1].primitivePayload as { content: string }).content).toBe('a-row-1');

    const backendB2 = await createFileSystemWalBackend(rootDir, sessionB, { readOnly: true });
    const rowsB = await backendB2.readRows({ range: [0, 10] });
    expect(rowsB).toHaveLength(1);
    expect((rowsB[0].primitivePayload as { content: string }).content).toBe('b-row-0');
  });
});

// ─── Group 2: replay runtime validation ──────────────────────────────────────
//
// Writes a minimal corrupt segment/CAS directly to disk, then verifies that
// opening the backend throws CorruptSegmentError rather than silently casting
// bad data or throwing an opaque RangeError.

/** Writes a one-record session directory directly to disk using the codec internals. */
async function writeCorruptSession(opts: {
  rootDir:          string;
  sessionId:        string;
  envelopeCbor:     Uint8Array;
  readSetCasJson?:  string; // if set, write a non-zero readSetHash with this JSON content
}): Promise<void> {
  const { rootDir, sessionId, envelopeCbor, readSetCasJson } = opts;
  const sessionDir = path.join(rootDir, 'wal', 'sessions', sessionId);
  const casDir     = path.join(rootDir, 'cas');
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(casDir, { recursive: true });

  // Write a minimal payload CAS entry (replay needs it to exist)
  const payloadBytes = new Uint8Array(Buffer.from(JSON.stringify({ data: 'test' }), 'utf8'));
  const payloadHash  = hashBytes(payloadBytes);
  const payloadHex   = Buffer.from(payloadHash).toString('hex');
  const payloadShard = path.join(casDir, payloadHex.slice(0, 2));
  fs.mkdirSync(payloadShard, { recursive: true });
  fs.writeFileSync(path.join(payloadShard, `${payloadHex}.cbor`), payloadBytes);

  let readSetHash = new Uint8Array(32); // zero = no readSet
  if (readSetCasJson !== undefined) {
    const rsBytes  = new Uint8Array(Buffer.from(readSetCasJson, 'utf8'));
    readSetHash    = hashBytes(rsBytes);
    const rsHex    = Buffer.from(readSetHash).toString('hex');
    const rsShard  = path.join(casDir, rsHex.slice(0, 2));
    fs.mkdirSync(rsShard, { recursive: true });
    fs.writeFileSync(path.join(rsShard, `${rsHex}.cbor`), rsBytes);
  }

  const rowInput: SegmentRecordInput = {
    commitOffset:  0n,
    timestampNs:   1_000_000_000n,
    primitiveKind: 0x01,
    hookVerdict:   0x00,
    flags: { bootstrap: false, declaredWindow: false, syntheticOutput: false, taskBoundary: false, manifestRoot: false },
    payloadHash,
    readSetHash,
    envelopeCbor,
  };

  const [record] = buildChain([rowInput], new Uint8Array(ZERO_HASH));
  const segBuf   = encodeRecord(record);
  fs.writeFileSync(path.join(sessionDir, '000000.seg'), segBuf);

  const manifest = { schemaVersion: 1, sessionId, segmentRange: [0, 0], lastCommitOffset: 0 };
  fs.writeFileSync(path.join(sessionDir, 'manifest.json'), JSON.stringify(manifest));
}

describe('WAL FileSystemWalBackend — Group 2 replay validation (CorruptSegmentError)', () => {
  it('Group2-1: replay throws CorruptSegmentError for unknown primitiveKind in envelopeCbor', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    await writeCorruptSession({
      rootDir,
      sessionId,
      envelopeCbor: new Uint8Array(Buffer.from('bogus_kind', 'utf8')),
    });

    await expect(
      createFileSystemWalBackend(rootDir, sessionId, { readOnly: true }),
    ).rejects.toThrow(CorruptSegmentError);
  });

  it('Group2-2: replay throws CorruptSegmentError for non-string element in causalReadSet', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    await writeCorruptSession({
      rootDir,
      sessionId,
      envelopeCbor:    new Uint8Array(Buffer.from('observation', 'utf8')),
      readSetCasJson:  JSON.stringify([1, 2, 3]), // numbers, not strings
    });

    await expect(
      createFileSystemWalBackend(rootDir, sessionId, { readOnly: true }),
    ).rejects.toThrow(CorruptSegmentError);
  });
});
