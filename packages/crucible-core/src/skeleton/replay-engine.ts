/**
 * ReplayEngine implementation (SK-5, §11.4 hermetic replay / A2 byte-equivalence).
 *
 * Opens a session's WAL read-only, reads every committed row, re-materializes
 * each row's CBOR body via the shared materializeRow helper, and compares the
 * re-computed BLAKE3 hashes against the stored segment-record hashes.
 *
 * A2 byte-equivalence invariant:
 *   For every committed row, CBOR encoding is deterministic (Crucible canonical
 *   CBOR profile), so re-encoding the same (primitiveKind, primitivePayload,
 *   causalReadSet, metadata) MUST produce identical payloadHash, readSetHash,
 *   and envelopeCbor bytes.  Any divergence indicates corruption or a schema
 *   change — replay status='fail'.
 *
 * SK-5 pass condition:
 *   status === 'pass'  AND  rowsReplayed === <total rows in source session>
 *
 * Scope note (Phase 0.5): single-segment sessions only.  Multi-segment replay
 * (64 MiB roll-over) is Phase 1 and requires exposing manifest.segmentRange
 * on FileSystemWalBackend or iterating via a separate helper.
 *
 * @see docs/crucible-technical-design/11-hermetic-replay.md §11.4
 */

import type { ReplayEngine, ReplayOptions, ReplayReport, SessionId } from './types.js';
import { createFileSystemWalBackend }  from '../ledger/wal-backend-fs.js';
import { materializeRow }        from '../ledger/wal/materialize.js';

// ─── Byte-equality helper ─────────────────────────────────────────────────────

function bufEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ─── DefaultReplayEngine ──────────────────────────────────────────────────────

class DefaultReplayEngine implements ReplayEngine {
  constructor(private readonly rootDir: string) {}

  async replay(sessionId: SessionId, opts?: ReplayOptions): Promise<ReplayReport> {
    const strict   = opts?.strict ?? true;
    const startMs  = Date.now();

    // Open read-only — never acquires write lock; commitRow must not be called.
    const backend = await createFileSystemWalBackend(this.rootDir, sessionId, {
      readOnly: true,
    });

    // Decoded event rows and raw segment records from the same WAL.
    // readAllSegmentRecords() covers the full segmentRange so multi-segment
    // sessions (64 MiB roll-over) compare the same row set on both sides.
    const events    = await backend.readRows({ range: [0, Number.MAX_SAFE_INTEGER] });
    const segRecs   = backend.readAllSegmentRecords();

    // Structural sanity: decoded event count must equal raw record count.
    if (events.length !== segRecs.length) {
      return {
        status:              'fail',
        divergenceAtOffset:  0,
        divergenceKind:      'commitment',
        rowsReplayed:        0,
        wallClockMs:         Date.now() - startMs,
      };
    }

    let rowsReplayed = 0;
    let firstDivergenceOffset: number | null = null;

    for (let i = 0; i < events.length; i++) {
      const event  = events[i]!;
      const rec    = segRecs[i]!;

      // Re-materialize using COMMIT/null verdict.  The verdict byte is stored
      // separately in the segment record header and does NOT affect the three
      // CBOR-derived fields we compare (payloadHash, readSetHash, envelopeCbor).
      // Re-using the shared helper guarantees encoding parity with the write path.
      const mat = materializeRow(event, 'COMMIT', null);

      const payloadMatch  = bufEqual(mat.payloadHash,  rec.payloadHash);
      const readSetMatch  = bufEqual(mat.readSetHash,  rec.readSetHash);
      const envelopeMatch = bufEqual(mat.envelopeCbor, rec.envelopeCbor);

      if (!payloadMatch || !readSetMatch || !envelopeMatch) {
        if (strict) {
          return {
            status:              'fail',
            divergenceAtOffset:  i,
            divergenceKind:      'oracle',
            rowsReplayed,
            wallClockMs:         Date.now() - startMs,
          };
        }
        // Non-strict: record the offset of the FIRST divergence, then continue.
        if (firstDivergenceOffset === null) {
          firstDivergenceOffset = i;
        }
        continue;
      }

      rowsReplayed++;
    }

    const allMatch = rowsReplayed === events.length;
    return {
      status:              allMatch ? 'pass' : 'fail',
      divergenceAtOffset:  allMatch ? null   : firstDivergenceOffset,
      divergenceKind:      allMatch ? null   : 'oracle',
      rowsReplayed,
      wallClockMs:         Date.now() - startMs,
    };
  }
}

/**
 * Create a ReplayEngine backed by the file-system WAL at rootDir.
 *
 * Import by direct path (barrel is Graham's lane):
 *   import { createReplayEngine } from '../skeleton/replay-engine.js';
 *
 * Valanice (T5 CLI): pass rootDir (the same root you passed to
 * FileSystemWalBackend.create).  The engine opens sessions read-only so it is
 * safe to call while the write-side backend is open in another process.
 *
 * Return shape: ReplayReport — check `status === 'pass'` and
 * `rowsReplayed === expectedCount` for SK-5 acceptance.
 */
export function createReplayEngine(rootDir: string): ReplayEngine {
  return new DefaultReplayEngine(rootDir);
}
