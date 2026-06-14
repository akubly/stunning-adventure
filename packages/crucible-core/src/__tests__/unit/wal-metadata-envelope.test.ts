/**
 * Unit / integration tests — WAL metadata envelope round-trip (#67).
 *
 * Problem addressed: LedgerSubscriber.onCommit received live LedgerEvent with
 * metadata on first commit, but the WAL segment record did NOT persist metadata.
 * On replayFromSegments() (reopen), events were reconstructed WITHOUT metadata,
 * causing replay-based projectors (e.g. ApertureProjector) to see
 * metadata===undefined and silently skip tier-filtered entries.
 *
 * Fix: envelopeCbor now stores CBOR map {k: primitiveKind, m?: metadata}
 * under the Crucible canonical CBOR profile (forced float64, §4.2.1 ordering).
 *
 * Invariants exercised:
 *   META-1: metadata round-trips through the FS WAL envelope (write → reopen → replay).
 *   META-2: metadata-less events replay without metadata (undefined), not as {}.
 *   META-3: ApertureProjector tier-filter survives reopen — same events visible
 *           after replay as after live commit (level='attention').
 *   META-4: InMemory backend also preserves metadata (live-commit path, spread).
 *   META-5: Backward-compat — a segment written with a bare CBOR string envelope
 *           (pre-#67 format) decodes with primitiveKind correctly and metadata=undefined.
 *   META-6: Metadata with multiple fields round-trips byte-deterministically.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import os   from 'node:os';
import path from 'node:path';
import fs   from 'node:fs';
import { randomUUID } from 'node:crypto';

import { createFileSystemWalBackend } from '../../ledger/wal-backend-fs.js';
import { InMemoryWalBackend }         from '../../ledger/wal-backend-in-memory.js';
import { createLedger }               from '../../ledger/ledger-impl.js';
import { ApertureProjector }          from '../../projectors/aperture-projector.js';
import type { NotificationService }   from '../../projectors/aperture-projector.js';
import { encodeCbor }                 from '../../ledger/wal/cbor.js';
import { encodeRecord }               from '../../ledger/wal/codec.js';
import { buildChain }                 from '../../ledger/wal/hash-chain.js';
import { hashBytes }                  from '../../ledger/wal/hash.js';
import type { SegmentRecordInput }    from '../../ledger/wal/types.js';
import { materializeRow }             from '../../ledger/wal/materialize.js';

// ─── Temp-dir helpers ─────────────────────────────────────────────────────────

const dirs: string[] = [];

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-meta67-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

function commit() {
  return { verdict: 'COMMIT' as const, hookId: null };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('WAL metadata envelope round-trip (#67)', () => {
  it('META-1: metadata round-trips through FS WAL (write → close → reopen → readRows)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(
      {
        primitiveKind:    'observation',
        primitivePayload: { content: 'hello' },
        causalReadSet:    [],
        metadata:         { level: 'attention' },
      },
      commit(),
    );
    await writer.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const rows = await reader.readRows({ range: [0, 0] });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toBeDefined();
    expect(rows[0].metadata?.level).toBe('attention');
    await reader.close();
  });

  it('META-2: metadata-less row replays with metadata=undefined (not {})', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(
      { primitiveKind: 'request', primitivePayload: { x: 1 }, causalReadSet: [] },
      commit(),
    );
    await writer.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const rows = await reader.readRows({ range: [0, 0] });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toBeUndefined();
    await reader.close();
  });

  it('META-3: ApertureProjector tier-filter survives reopen (replay-based catchup)', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // ── Write phase: commit an attention-tier event ───────────────────────────
    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(
      {
        primitiveKind:    'observation',
        primitivePayload: { type: 'quarantine', pluginId: 'bad-plugin' },
        causalReadSet:    [],
        metadata:         { level: 'attention' },
      },
      commit(),
    );
    // Also commit a non-attention event (should NOT appear in attention filter)
    await writer.commitRow(
      {
        primitiveKind:    'observation',
        primitivePayload: { content: 'routine' },
        causalReadSet:    [],
        metadata:         { level: 'info' },
      },
      commit(),
    );
    await writer.close();

    // ── Replay phase: reopen and replay through ApertureProjector ─────────────
    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const notifier: NotificationService = { push: vi.fn() };
    const projector = new ApertureProjector(notifier);

    const rows = await reader.readRows({ range: [0, 1] });
    expect(rows).toHaveLength(2);

    // Feed replayed rows into the projector (simulating replay-based catchup)
    for (const row of rows) {
      projector.onCommit(row.offset, row);
    }

    // ApertureProjector should have materialized exactly the attention-tier event
    const attentionEvents = projector.queryEvents({ level: 'attention' });
    expect(attentionEvents).toHaveLength(1);
    expect(attentionEvents[0].level).toBe('attention');

    // The info-tier event must NOT appear in the attention filter
    expect(projector.queryEvents({ level: 'info' })).toHaveLength(0);

    // Badge push was called for the attention event
    expect(notifier.push).toHaveBeenCalledTimes(1);

    await reader.close();
  });

  it('META-4: InMemoryWalBackend live-commit path preserves metadata (spread of PrimitiveInput)', async () => {
    const backend = new InMemoryWalBackend();
    await backend.commitRow(
      {
        primitiveKind:    'decision',
        primitivePayload: { outcome: 'approve' },
        causalReadSet:    [],
        metadata:         { level: 'urgent' },
      },
      commit(),
    );
    const rows = await backend.readRows({ range: [0, 0] });
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata?.level).toBe('urgent');
  });

  it('META-5: backward-compat — bare CBOR string envelope decodes to primitiveKind with metadata=undefined', async () => {
    // Craft a segment file that uses the OLD envelope format (bare CBOR string for primitiveKind).
    // This simulates a pre-#67 segment that was written before the envelope map format.
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const segDir    = path.join(rootDir, 'wal', 'sessions', sessionId);
    fs.mkdirSync(segDir, { recursive: true });

    // Write the old envelope format: bare CBOR-encoded string "observation"
    const oldEnvelope = encodeCbor('observation'); // bare string — pre-#67 format
    const payloadBytes = encodeCbor({ x: 42 });
    const payloadHash  = hashBytes(payloadBytes);
    const casDir = path.join(rootDir, 'cas');
    fs.mkdirSync(casDir, { recursive: true });
    const shard    = Buffer.from(payloadHash).toString('hex').slice(0, 2);
    const casFile  = path.join(casDir, shard, `${Buffer.from(payloadHash).toString('hex')}.cbor`);
    fs.mkdirSync(path.dirname(casFile), { recursive: true });
    fs.writeFileSync(casFile, payloadBytes);

    const rowInput: SegmentRecordInput = {
      commitOffset:  0n,
      timestampNs:   1_000_000n,
      primitiveKind: 0x01,
      hookVerdict:   0xFF,
      flags: {
        bootstrap: false, declaredWindow: false,
        syntheticOutput: false, taskBoundary: false, manifestRoot: false,
      },
      payloadHash,
      readSetHash:  new Uint8Array(32), // zero hash (no causalReadSet)
      envelopeCbor: oldEnvelope,
    };
    const [linked] = buildChain([rowInput]);
    const segBuf = encodeRecord(linked);
    fs.writeFileSync(path.join(segDir, '000000.seg'), segBuf);

    const manifest = {
      schemaVersion: 1,
      sessionId,
      segmentRange: [0, 0],
      lastCommitOffset: 0,
    };
    fs.writeFileSync(path.join(segDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    // Reopen — should decode without error; primitiveKind='observation', metadata=undefined
    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const rows = await reader.readRows({ range: [0, 0] });
    expect(rows).toHaveLength(1);
    expect(rows[0].primitiveKind).toBe('observation');
    expect(rows[0].metadata).toBeUndefined();
    await reader.close();
  });

  it('META-6: metadata with multiple fields round-trips byte-deterministically', async () => {
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    const meta = { level: 'notice' as const, source: 'plugin-x', severity: 3 };

    const writer = await createFileSystemWalBackend(rootDir, sessionId);
    await writer.commitRow(
      {
        primitiveKind:    'artifact',
        primitivePayload: { blob: 'abc' },
        causalReadSet:    [],
        metadata:         meta,
      },
      commit(),
    );
    await writer.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const rows = await reader.readRows({ range: [0, 0] });
    expect(rows[0].metadata).toEqual(meta);
    await reader.close();
  });

  it('META-7: map envelope with scalar "m" throws CorruptSegmentError (F2)', async () => {
    // Build a segment where the envelope map has a scalar (number) for "m"
    // instead of a valid object — must throw CorruptSegmentError on reopen.
    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const segDir    = path.join(rootDir, 'wal', 'sessions', sessionId);
    fs.mkdirSync(segDir, { recursive: true });

    // Craft envelope with scalar m: {k: "observation", m: 42} — corrupt
    const corruptEnvelope = encodeCbor({ k: 'observation', m: 42 });
    const payloadBytes    = encodeCbor({ x: 1 });
    const payloadHash     = hashBytes(payloadBytes);
    const casDir = path.join(rootDir, 'cas');
    fs.mkdirSync(casDir, { recursive: true });
    const shard   = Buffer.from(payloadHash).toString('hex').slice(0, 2);
    const casFile = path.join(casDir, shard, `${Buffer.from(payloadHash).toString('hex')}.cbor`);
    fs.mkdirSync(path.dirname(casFile), { recursive: true });
    fs.writeFileSync(casFile, payloadBytes);

    const rowInput: SegmentRecordInput = {
      commitOffset:  0n,
      timestampNs:   1_000_000n,
      primitiveKind: 0x01,
      hookVerdict:   0xFF,
      flags: {
        bootstrap: false, declaredWindow: false,
        syntheticOutput: false, taskBoundary: false, manifestRoot: false,
      },
      payloadHash,
      readSetHash:  new Uint8Array(32),
      envelopeCbor: corruptEnvelope,
    };
    const [linked] = buildChain([rowInput]);
    const segBuf = encodeRecord(linked);
    fs.writeFileSync(path.join(segDir, '000000.seg'), segBuf);

    const manifest = {
      schemaVersion: 1,
      sessionId,
      segmentRange: [0, 0],
      lastCommitOffset: 0,
    };
    fs.writeFileSync(path.join(segDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    // Reopen must throw CorruptSegmentError — non-object "m" is invalid
    await expect(
      createFileSystemWalBackend(rootDir, sessionId, { readOnly: true }),
    ).rejects.toThrow(/non-object metadata "m"/);
  });

  it('META-3b: full Ledger append+reopen+projector integration test', async () => {    const rootDir   = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;

    // Append via the full Ledger stack
    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    const ledger  = await createLedger({ walBackend: backend });
    await ledger.append({
      primitiveKind:    'observation',
      primitivePayload: { type: 'quarantine', pluginId: 'p' },
      causalReadSet:    [],
      metadata:         { level: 'attention' },
    });
    await backend.close();

    // Reopen and replay
    const reader     = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const notifier: NotificationService = { push: vi.fn() };
    const projector  = new ApertureProjector(notifier);
    const rows       = await reader.readRows({ range: [0, 0] });
    for (const row of rows) projector.onCommit(row.offset, row);

    expect(projector.queryEvents({ level: 'attention' })).toHaveLength(1);
    expect(notifier.push).toHaveBeenCalledTimes(1);
    await reader.close();
  });

  // ── Write-side metadata guard (symmetric with F2 decode guard) ───────────────

  it('META-8: materializeRow throws a plain Error (not CorruptSegmentError) when metadata is an array', () => {
    expect(() =>
      materializeRow(
        {
          primitiveKind:    'observation',
          primitivePayload: { x: 1 },
          causalReadSet:    [],
          metadata:         ['not', 'an', 'object'] as unknown as Record<string, unknown>,
        },
        'COMMIT',
        null,
      ),
    ).toThrow(/metadata must be a plain object \(got array\)/);
  });

  it('META-9: materializeRow throws a plain Error (not CorruptSegmentError) when metadata is a scalar', () => {
    expect(() =>
      materializeRow(
        {
          primitiveKind:    'request',
          primitivePayload: { x: 2 },
          causalReadSet:    [],
          metadata:         42 as unknown as Record<string, unknown>,
        },
        'COMMIT',
        null,
      ),
    ).toThrow(/metadata must be a plain object \(got number\)/);
  });

  it('META-10: materializeRow accepts a valid plain-object metadata without throwing', () => {
    expect(() =>
      materializeRow(
        {
          primitiveKind:    'observation',
          primitivePayload: { x: 3 },
          causalReadSet:    [],
          metadata:         { level: 'info', source: 'test' },
        },
        'COMMIT',
        null,
      ),
    ).not.toThrow();
  });
});
