/**
 * RED PHASE — Single-writer advisory write lock (§3.4.1).
 *
 * Sub-seam scope  : write.lock enforcement on FileSystemWalBackend.
 *                   Exclusive-create lock file; released on close().
 *                   Read-only open bypasses the lock.
 * TDD Strategy    : §4 Walkthrough B, Lane 1 — WAL substrate file backend lock
 *                   (docs/crucible-tdd-strategy.md)
 * Spec ref        : §3.4.1 "Write lock enforcement" — presence of write.lock
 *                   file signals exclusive write ownership; content ignored.
 * Locked Decision : OQ-2 FEDERATE; lock mechanism documented in
 *                   .squad/decisions/inbox/roger-wal-write-lock.md.
 * Seam constraint : WalBackend interface (Graham's seam) unchanged — close()
 *                   and readOnly live on the concrete FileSystemWalBackend only.
 *
 * These tests MUST FAIL with "second open succeeds" until the lock is implemented.
 *
 * Invariants exercised:
 *   1. A second write-open of the same session dir while the first is open
 *      throws WriteLockHeldError (exclusive write lock).
 *   2. After close() the lock is released; a fresh write-open succeeds.
 *   3. write.lock file exists on disk while the session is write-open;
 *      disappears after close().
 *   4. A read-only open (readOnly: true) succeeds even while a write lock is
 *      held — the read path is NOT gated by the write lock.
 *   5. Rows committed before lock release are readable from a read-only open.
 */

import { describe, it, expect, afterEach } from 'vitest';
import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';
import { randomUUID } from 'node:crypto';

import {
  createFileSystemWalBackend,
  FileSystemWalBackend,
  WriteLockHeldError,
} from '../../ledger/wal-backend-fs.js';
import type { PrimitiveInput } from '../../types.js';
import type { HookResult, HookVerdict } from '../../ledger/hook-bus.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const openBackends: FileSystemWalBackend[] = [];
const dirs: string[] = [];

afterEach(async () => {
  // Close any backends left open by a test (best-effort, suppresses errors)
  for (const b of openBackends.splice(0)) {
    try { await b.close(); } catch { /* already closed */ }
  }
  for (const dir of dirs.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `crucible-lock-test-${randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

async function openWrite(rootDir: string, sessionId: string): Promise<FileSystemWalBackend> {
  const b = await createFileSystemWalBackend(rootDir, sessionId);
  openBackends.push(b);
  return b;
}

function makeInput(content: string): PrimitiveInput {
  return { primitiveKind: 'observation', primitivePayload: { content }, causalReadSet: [] };
}

const COMMIT: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } = {
  verdict: 'COMMIT', hookId: null,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WAL FileSystemWalBackend — write lock (§3.4.1)', () => {

  it('Unit: WAL lock second write-open of same session throws WriteLockHeldError', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const b1 = await openWrite(rootDir, sessionId);

    // Second write-open while first holds the lock must throw
    await expect(
      createFileSystemWalBackend(rootDir, sessionId),
    ).rejects.toThrow(WriteLockHeldError);

    await b1.close();
  });

  it('Unit: WAL lock close() releases lock; fresh write-open succeeds', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const b1 = await openWrite(rootDir, sessionId);
    await b1.close();

    // After close the lock is gone — this must NOT throw
    const b2 = await openWrite(rootDir, sessionId);
    await b2.close();
  });

  it('Unit: WAL lock write.lock file exists while open, absent after close', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const lockPath  = path.join(rootDir, 'wal', 'sessions', sessionId, 'write.lock');

    const backend = await openWrite(rootDir, sessionId);
    expect(fs.existsSync(lockPath)).toBe(true);

    await backend.close();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('Unit: WAL lock read-only open succeeds while write lock is held', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const writer = await openWrite(rootDir, sessionId);
    await writer.commitRow(makeInput('hello'), COMMIT);

    // Read-only open must NOT throw even though writer holds the lock
    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });

    const rows = await reader.readRows({ range: [0, 10] });
    expect(rows).toHaveLength(1);
    expect((rows[0].primitivePayload as { content: string }).content).toBe('hello');

    await writer.close();
    // reader has no lock to release — calling close is safe (no-op)
    await reader.close();
  });

  it('Unit: WAL lock error message includes the lock file path', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const b1 = await openWrite(rootDir, sessionId);

    let thrown: unknown;
    try {
      await createFileSystemWalBackend(rootDir, sessionId);
    } catch (e) {
      thrown = e;
    } finally {
      await b1.close();
    }

    expect(thrown).toBeInstanceOf(WriteLockHeldError);
    expect((thrown as Error).message).toContain('write.lock');
  });
});

// ─── PID liveness / stale-lock reclaim (Aaron ruling Option b — D-LOCK-2) ────
//
// RED invariants (all fail with current wx-only implementation):
//   1. Stale lock (dead PID)   → open SUCCEEDS (reclaim);    current: throws
//   2. Live lock (live PID)    → throw WITH PID in message;  current: throws but message has no PID
//   3. Corrupt/empty content   → open SUCCEEDS (treat as stale); current: throws

/**
 * Returns a PID that is confirmed dead via process.kill(pid, 0) → ESRCH.
 * Uses very high integers that exceed OS PID limits on Windows and Linux.
 */
function findDeadPid(): number {
  const candidates = [999_999_999, 99_999_999, 9_999_999];
  for (const pid of candidates) {
    try {
      process.kill(pid, 0);
      // Somehow alive — try next candidate
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') return pid; // confirmed dead
      // EPERM = alive but no permission → try next
    }
  }
  throw new Error('Test setup: could not find a reliably dead PID');
}

describe('WAL FileSystemWalBackend — PID liveness stale-lock reclaim (§3.4.1 D-LOCK-2)', () => {

  it('Unit: WAL lock stale lock with dead PID is reclaimed; write.lock updated with live PID', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Pre-create the session directory and plant a stale lock file
    const sessionDir = path.join(rootDir, 'wal', 'sessions', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const lockPath = path.join(sessionDir, 'write.lock');
    const deadPid  = findDeadPid();
    fs.writeFileSync(lockPath, String(deadPid), 'utf8');

    // Open MUST succeed (reclaim the stale lock)
    const backend = await openWrite(rootDir, sessionId);

    // Lock file now holds OUR PID, not the stale one
    const written = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
    expect(written).toBe(process.pid);

    await backend.close();
  });

  it('Unit: WAL lock live PID in lock file throws WriteLockHeldError containing holder PID', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Pre-create lock file containing the current (live) process PID
    const sessionDir = path.join(rootDir, 'wal', 'sessions', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const lockPath = path.join(sessionDir, 'write.lock');
    fs.writeFileSync(lockPath, String(process.pid), 'utf8');

    let thrown: unknown;
    try {
      await createFileSystemWalBackend(rootDir, sessionId);
    } catch (e) {
      thrown = e;
    }

    // Must throw WriteLockHeldError AND expose the holder PID in the message
    expect(thrown).toBeInstanceOf(WriteLockHeldError);
    expect((thrown as Error).message).toContain(String(process.pid));
  });

  it('Unit: WAL lock corrupt lock file content is treated as stale and reclaimed', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Pre-create lock file with unparseable content
    const sessionDir = path.join(rootDir, 'wal', 'sessions', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const lockPath = path.join(sessionDir, 'write.lock');
    fs.writeFileSync(lockPath, 'not-a-pid', 'utf8');

    // Open MUST succeed (corrupt content → treat as stale → reclaim)
    const backend = await openWrite(rootDir, sessionId);

    const written = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
    expect(written).toBe(process.pid);

    await backend.close();
  });

  it('Unit: WAL lock empty lock file content is treated as stale and reclaimed', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const sessionDir = path.join(rootDir, 'wal', 'sessions', sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    const lockPath = path.join(sessionDir, 'write.lock');
    fs.writeFileSync(lockPath, '', 'utf8');  // empty

    const backend = await openWrite(rootDir, sessionId);

    const written = parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
    expect(written).toBe(process.pid);

    await backend.close();
  });
});
