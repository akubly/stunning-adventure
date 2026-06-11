/**
 * RED PHASE — Canonical CBOR encoding for WAL payload hashing (issue #60).
 *
 * §3.2/§3.3 specify: payloadHash = BLAKE3(CBOR(primitivePayload)),
 *                    readSetHash = BLAKE3(CBOR(causalReadSet)).
 * envelopeCbor must store genuinely CBOR-encoded data, not raw UTF-8.
 *
 * CBOR-1: payloadHash is stable under key insertion order (canonical CBOR).
 *   Two objects with same data in different key order must produce the same hash.
 *   Currently FAILS: JSON.stringify is key-order-sensitive.
 *
 * CBOR-2: envelopeCbor in FS backend stores genuine CBOR-encoded primitiveKind.
 *   After write+read, the envelopeCbor first byte must be a CBOR text string header (0x6b for 11 chars).
 *   Currently FAILS: stored as raw UTF-8 (first byte 0x6f = 'o').
 */

import { describe, it, expect, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

import { InMemoryWalBackend } from '../../ledger/wal-backend-in-memory.js';
import { createFileSystemWalBackend } from '../../ledger/wal-backend-fs.js';
import type { PrimitiveInput } from '../../types.js';

const dirs: string[] = [];

function makeTmpDir(): string {
  const d = path.join(os.tmpdir(), `crucible-cbor-${randomUUID()}`);
  fs.mkdirSync(d, { recursive: true });
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function commit() {
  return { verdict: 'COMMIT' as const, hookId: null };
}

describe('WAL CBOR encoding (issue #60)', () => {
  it('CBOR-1: payloadHash stable under key insertion order (canonical CBOR, InMemory)', async () => {
    const b1 = new InMemoryWalBackend();
    const b2 = new InMemoryWalBackend();
    const makeRow = (payload: unknown): PrimitiveInput => ({
      primitiveKind: 'observation',
      primitivePayload: payload,
      causalReadSet: [],
    });

    await b1.commitRow(makeRow({ b: 2, a: 1 }), commit());
    await b2.commitRow(makeRow({ a: 1, b: 2 }), commit());

    const recs1 = b1.readSegmentRecords();
    const recs2 = b2.readSegmentRecords();

    expect(recs1).toHaveLength(1);
    expect(recs2).toHaveLength(1);
    expect(Buffer.from(recs1[0].payloadHash).toString('hex'))
      .toBe(Buffer.from(recs2[0].payloadHash).toString('hex'));
  });

  it('CBOR-2: envelopeCbor in FS backend stores CBOR-encoded primitiveKind (not raw UTF-8)', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(
      { primitiveKind: 'observation', primitivePayload: { x: 1 }, causalReadSet: [] },
      commit(),
    );
    await backend.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const recs = reader.readSegmentRecords();
    expect(recs).toHaveLength(1);
    expect(recs[0].envelopeCbor[0]).toBe(0x6b);
    expect(recs[0].envelopeCbor.length).toBe(12);
    await reader.close();
  });

  it('CBOR-3: round-trip — FS backend write/reopen preserves complex payload with nested objects', async () => {
    const rootDir = makeTmpDir();
    const sessionId = `sess-${randomUUID().slice(0, 8)}`;
    const payload = { nested: { key: 'value', arr: [1, 2, 3] }, top: 'field' };
    const backend = await createFileSystemWalBackend(rootDir, sessionId);
    await backend.commitRow(
      { primitiveKind: 'observation', primitivePayload: payload, causalReadSet: [] },
      commit(),
    );
    await backend.close();

    const reader = await createFileSystemWalBackend(rootDir, sessionId, { readOnly: true });
    const rows = await reader.readRows({ range: [0, 0] });
    expect(rows).toHaveLength(1);
    expect(rows[0].primitivePayload).toEqual(payload);
    await reader.close();
  });
});
