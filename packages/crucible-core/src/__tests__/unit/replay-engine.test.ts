/**
 * Unit + integration tests — ReplayEngine (F3 non-strict divergenceAtOffset;
 * F2 readAllSegmentRecords; F4 factory consistency).
 *
 * Invariants exercised:
 *   RE-1: Replay returns status='pass', divergenceAtOffset=null when all rows match (strict).
 *   RE-2: Replay returns status='pass', divergenceAtOffset=null when all rows match (non-strict).
 *   RE-3: Non-strict replay with a corrupted row reports divergenceAtOffset at the
 *         actual first-mismatch index — NOT at rowsReplayed (F3 fix).
 *   RE-4: readAllSegmentRecords() returns the same records as readSegmentRecords() for
 *         single-segment sessions (F2 regression guard).
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const dirs: string[] = [];

function makeTmpDir(): string {
  const dir = path.join(os.tmpdir(), `crucible-replay-test-${randomUUID()}`);
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

const COMMIT: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null } = {
  verdict: 'COMMIT',
  hookId:  null,
};

/** Write N rows and close; return { rootDir, sessionId }. */
async function writeSession(
  rootDir: string,
  rows: PrimitiveInput[],
): Promise<string> {
  const sessionId = `sess-${randomUUID().slice(0, 8)}`;
  const backend = await createFileSystemWalBackend(rootDir, sessionId);
  for (const row of rows) {
    await backend.commitRow(row, COMMIT);
  }
  await backend.close();
  return sessionId;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ReplayEngine — non-strict divergenceAtOffset (F3) + factory (F4)', () => {

  it('RE-1: strict replay passes with divergenceAtOffset=null for a clean session', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = await writeSession(rootDir, [
      makeInput('row-0'),
      makeInput('row-1'),
      makeInput('row-2'),
    ]);

    const engine = createReplayEngine(rootDir);
    const report = await engine.replay(sessionId, { strict: true });

    expect(report.status).toBe('pass');
    expect(report.divergenceAtOffset).toBeNull();
    expect(report.divergenceKind).toBeNull();
    expect(report.rowsReplayed).toBe(3);
  });

  it('RE-2: non-strict replay passes with divergenceAtOffset=null for a clean session', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = await writeSession(rootDir, [
      makeInput('row-0'),
      makeInput('row-1'),
    ]);

    const engine = createReplayEngine(rootDir);
    const report = await engine.replay(sessionId, { strict: false });

    expect(report.status).toBe('pass');
    // F3: must be null, NOT rowsReplayed (2) when all rows match
    expect(report.divergenceAtOffset).toBeNull();
    expect(report.divergenceKind).toBeNull();
    expect(report.rowsReplayed).toBe(2);
  });

  it('RE-3: non-strict replay reports divergenceAtOffset at first-mismatch index, not rowsReplayed', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = await writeSession(rootDir, [
      makeInput('row-0'),
      makeInput('row-1'),
      makeInput('row-2'),
    ]);

    // Corrupt the CAS blob for record 1 (second row) so that when the replay
    // engine decodes it, re-encoding produces a different hash → oracle divergence.
    // Step 1: re-open read-only to get record 1's payloadHash.
    const inspector = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs      = inspector.readSegmentRecords();
    const rec1Hash  = recs[1]!.payloadHash;
    await inspector.close();

    // Step 2: locate and overwrite the CAS blob with different but valid CBOR.
    const hexHash = Buffer.from(rec1Hash).toString('hex');
    const casPath = path.join(rootDir, 'cas', hexHash.slice(0, 2), `${hexHash}.cbor`);
    // Write valid CBOR that decodes to a different payload → re-hashes differently.
    fs.writeFileSync(casPath, encodeCbor({ content: 'CORRUPTED-DATA' }));

    const engine = createReplayEngine(rootDir);
    const report = await engine.replay(sessionId, { strict: false });

    // The report must be 'fail' (row 1 diverged).
    expect(report.status).toBe('fail');
    // F3 fix: divergenceAtOffset must be 1 (the first-mismatch row index), NOT
    // rowsReplayed (which would be 2 — rows 0 and 2 both match).
    expect(report.divergenceAtOffset).toBe(1);
    expect(report.rowsReplayed).toBe(2); // rows 0 and 2 matched; row 1 did not
  });
});

describe('FileSystemWalBackend.readAllSegmentRecords — F2 regression guard', () => {

  it('RE-4: readAllSegmentRecords() matches readSegmentRecords() for single-segment session', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(makeInput('a'), COMMIT);
    await backend.commitRow(makeInput('b'), COMMIT);
    await backend.commitRow(makeInput('c'), COMMIT);

    const activeSeg = backend.readSegmentRecords();
    const allSegs   = backend.readAllSegmentRecords();

    expect(allSegs).toHaveLength(activeSeg.length);
    expect(allSegs).toHaveLength(3);
    // Hash equality for each record confirms same data.
    for (let i = 0; i < allSegs.length; i++) {
      expect(Buffer.from(allSegs[i]!.payloadHash).toString('hex'))
        .toBe(Buffer.from(activeSeg[i]!.payloadHash).toString('hex'));
    }

    await backend.close();
  });
});
