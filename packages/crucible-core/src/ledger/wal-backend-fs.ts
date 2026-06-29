/**
 * FileSystemWalBackend — durable WalBackend implementation backed by §3.2
 * on-disk layout: binary .seg segment files, NDJSON index.idx, and
 * manifest.json.  Reuses the sub-seam codec / hash-chain / CAS internals.
 *
 * On-disk tree rooted at `rootDir`:
 *
 *   <rootDir>/
 *   ├── wal/
 *   │   └── sessions/<sessionId>/
 *   │       ├── 000000.seg          binary segment records (codec.ts framing)
 *   │       ├── index.idx           NDJSON: {offset, seg, byteOffset} one line per row
 *   │       ├── manifest.json       schemaVersion, sessionId, segmentRange, lastCommitOffset
 *   │       └── write.lock          exclusive-create PID lock (§3.4.1)
 *   └── cas/
 *       └── <2-hex-shard>/
 *           └── <64-hex-hash>.cbor  raw payload / readSet bytes
 *
 * Group-commit (§3.5):
 *   commitRow() stages rows in an internal queue. The batch is flushed
 *   (hash-chained, CAS-written, seg-appended, fdatasync'd in ONE barrier) when:
 *     (a) the queue reaches batchSize (default 1 → immediate, backward-compat),
 *     (b) the staging deadline elapses (batchDeadlineMs, default 2 ms), or
 *     (c) flush() is called explicitly.
 *   sealAndSplit walks the verdicts array: PAUSE at index i commits rows 0..i
 *   (pause row durable), restages rows i+1..end for the next flush.
 *   Atomic abort: any failure truncates the segment back to pre-batch size,
 *   rejects all committed entries' promises, and restores the hash-chain root.
 *
 * Scope fences (no RED test yet — deferred):
 *   - 64 MiB segment roll-over
 *   - appendFenced / optimistic head-offset check (§3.4.1)
 *
 * primitiveKind is currently mirrored in envelopeCbor; canonical CBOR encoding
 * is implemented for WAL payload hashing and envelope persistence.
 */

import fs   from 'node:fs';
import path from 'node:path';

import type { PrimitiveInput, PrimitiveKind, EventMetadata } from '../types.js';
import type { WalBackend, LedgerEvent, LedgerQueryOpts } from './ledger.js';
import type { HookResult, HookVerdict } from './hook-bus.js';
import { decodeCbor }                        from './wal/cbor.js';
import { encodeRecord, decodeRecord, MAGIC } from './wal/codec.js';
import { buildChain, ZERO_HASH }             from './wal/hash-chain.js';
import { FileSystemCas }                     from './wal/cas-fs.js';
import { sealAndSplit }                      from './wal/seal-and-split.js';
import { materializeRow }                    from './wal/materialize.js';
import type { SegmentRecord, SegmentRecordInput, EnvelopeMapV1 } from './wal/types.js';
import { isPlainObject } from './wal/types.js';

// ─── Write-lock error ─────────────────────────────────────────────────────────

/**
 * Thrown when a write-open of a session directory is attempted while another
 * writer holds the exclusive write.lock with a confirmed-live PID (§3.4.1).
 *
 * Includes the holder PID so the caller can diagnose (and so tests can assert).
 */
export class WriteLockHeldError extends Error {
  constructor(lockPath: string, holderPid?: number) {
    const pidInfo = holderPid != null ? ` (held by PID ${holderPid})` : '';
    super(`WAL session write lock is held: ${lockPath}${pidInfo}`);
    this.name = 'WriteLockHeldError';
  }
}

/**
 * Thrown when commitRow() or flush() is called on a backend opened with
 * `{ readOnly: true }`.  Read-only opens never acquire a write lock, so
 * allowing writes would silently corrupt the segment or race another writer.
 */
export class ReadOnlyWalBackendError extends Error {
  constructor() {
    super('Cannot write to a read-only WAL backend');
    this.name = 'ReadOnlyWalBackendError';
  }
}

/**
 * Thrown by replayFromSegments when a decoded record contains data that
 * violates the WAL invariants (e.g. unknown primitiveKind, non-string
 * causalReadSet element) — indicating segment corruption or a schema mismatch.
 */
export class CorruptSegmentError extends Error {
  constructor(segPath: string, detail: string) {
    super(`Corrupt WAL segment "${segPath}": ${detail}`);
    this.name = 'CorruptSegmentError';
  }
}

/**
 * Thrown by replayFromSegments when a WAL record references a CAS hash that
 * has no corresponding blob on disk (§3.2.1 CAS-miss mitigation: replay must
 * refuse to advance past a CAS_MISS rather than substituting a default).
 */
export class CasMissError extends Error {
  constructor(hash: Uint8Array, offset: number) {
    const hex = Buffer.from(hash).toString('hex');
    super(`CAS_MISS: blob ${hex} referenced at WAL offset ${offset} is not present on disk`);
    this.name = 'CasMissError';
  }
}

/**
 * Thrown when manifest.schemaVersion does not match CURRENT_SCHEMA_VERSION.
 *
 * WAL v1 (WAL1) uses CBOR encoding — the inaugural shipped format.
 * JSON encoding was never shipped; no migration is owed for any prior data.
 * If a future format change bumps schemaVersion to 2+, this error surfaces
 * immediately at open/replay rather than as a generic corruption during decode.
 */
export class UnsupportedSchemaVersionError extends Error {
  constructor(found: number, expected: number) {
    super(
      `Unsupported WAL schemaVersion ${found}; ` +
      `this implementation only understands schemaVersion ${expected} (WAL1/CBOR)`,
    );
    this.name = 'UnsupportedSchemaVersionError';
  }
}

/** The only schemaVersion understood by this implementation (WAL1/CBOR). */
const CURRENT_SCHEMA_VERSION = 1;

// ─── Internal types ───────────────────────────────────────────────────────────

interface Manifest {
  schemaVersion:    number;          // always 1 in v1
  sessionId:        string;
  segmentRange:     [number, number];// [first, last] segment index
  lastCommitOffset: number;          // -1 if no rows committed yet
}

interface IndexEntry {
  offset:     number;
  seg:        number;
  byteOffset: number;
}

/** An entry waiting in the group-commit staging queue. */
interface StagedEntry {
  input:      PrimitiveInput;
  hookResult: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null };
  resolve:    (offset: number) => void;
  reject:     (err: unknown) => void;
}

/** Options for the FileSystemWalBackend factory. */
export interface FileSystemWalBackendOptions {
  /** Open read-only: skip write lock acquisition; commitRow() must not be called. */
  readOnly?: boolean;
  /**
   * Maximum rows to stage before auto-flushing (§3.5 batch-size trigger).
   * Default 1 preserves per-row immediate-flush behaviour for backward compat.
   * Pass a larger value to enable true group-commit batching.
   */
  batchSize?: number;
  /**
   * Staging deadline in milliseconds (§3.5 deadline trigger).
   * When batchSize > 1, a timer fires after this many ms if the batch hasn't
   * reached batchSize. Default 2 ms. Pass a large value (e.g. 60_000) in tests
   * to suppress timer-driven flushes and rely on explicit flush() calls.
   */
  batchDeadlineMs?: number;
  /**
   * Injectable sync barrier (seam for testing §3.5 atomicity and §3.2 CAS
   * ordering). Called in two places per flush:
   *   Phase 2.5 — once per new CAS file (via cas.syncAll), ensuring CAS blobs
   *               are durable BEFORE the segment record referencing them is written.
   *   Phase 3   — once for the segment fd, the ONE group-commit fsync barrier.
   * Default: (fd) => fs.fsyncSync(fd).  Tests pass a spy or a throwing stub.
   */
  syncFn?: (fd: number) => void;
  /**
   * Optional callback invoked after a PAUSE row commits durably (§3.5
   * seal-and-split).  Receives the commit offset of the paused row.
   * Stub for the L1Subscriber → Router broadcast (§5 not yet built).
   */
  onPause?: (commitOffset: number) => void;
  /**
   * Injectable clock for testable timestampNs assignment (§3.10 monotonicity).
   * Must return a bigint in nanoseconds. Default: () => BigInt(Date.now()) * 1_000_000n.
   * Inject a controlled clock to test that timestampNs is clamped when the
   * system clock goes backward.
   */
  nowNs?: () => bigint;
}

// ─── FileSystemWalBackend ─────────────────────────────────────────────────────

export class FileSystemWalBackend implements WalBackend {
  private readonly segDir:  string;
  private readonly casDir:  string;
  private readonly cas:     FileSystemCas;

  private manifest!:        Manifest;
  private events:           LedgerEvent[] = [];
  private prevRoot          = new Uint8Array(ZERO_HASH);
  private lastTimestampNs:  bigint = 0n;
  private activeSeg         = 0;
  private activeSegPath!:   string;
  private indexPath!:       string;
  private lockPath!:        string;
  private readonly isReadOnly:     boolean;
  private readonly batchSize:      number;
  private readonly batchDeadlineMs:number;
  private readonly syncFn:         (fd: number) => void;
  private readonly nowNs:          () => bigint;
  private readonly onPause?:       (offset: number) => void;

  /** Rows waiting for the next group-commit flush. */
  private stagingQueue: StagedEntry[] = [];
  private flushTimer:   ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly rootDir:   string,
    private readonly sessionId: string,
    opts?: FileSystemWalBackendOptions,
  ) {
    this.segDir          = path.join(rootDir, 'wal', 'sessions', sessionId);
    this.casDir          = path.join(rootDir, 'cas');
    this.cas             = new FileSystemCas(this.casDir);
    this.isReadOnly      = opts?.readOnly      ?? false;
    this.batchSize       = opts?.batchSize      ?? 1;       // default: immediate flush
    this.batchDeadlineMs = opts?.batchDeadlineMs ?? 2;
    this.syncFn          = opts?.syncFn ?? ((fd) => fs.fsyncSync(fd));
    this.nowNs           = opts?.nowNs  ?? (() => BigInt(Date.now()) * 1_000_000n);
    this.onPause         = opts?.onPause;
  }

  // ─── Factory ───────────────────────────────────────────────────────────────

  static async create(
    rootDir:   string,
    sessionId: string,
    opts?:     FileSystemWalBackendOptions,
  ): Promise<FileSystemWalBackend> {
    const b = new FileSystemWalBackend(rootDir, sessionId, opts);
    await b.open();
    return b;
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Flush any pending staged rows, release the write lock, and close.
   *
   * Safe to call on a read-only instance (no-op for lock; no staging queue).
   */
  async close(): Promise<void> {
    this.clearDeadlineTimer();
    // Drain any remaining staged entries before releasing the lock.
    if (this.stagingQueue.length > 0) {
      await this.executeFlush().catch(() => { /* best-effort drain; callers see rejects */ });
    }
    if (!this.isReadOnly) {
      try { fs.unlinkSync(this.lockPath); } catch { /* already removed or never created */ }
    }
  }

  /**
   * Explicitly flush all staged rows as one group-commit batch (§3.5 flush trigger).
   *
   * Resolves when the batch is durable (fdatasync'd). Rejects if the batch
   * fails (atomic abort — no segment bytes exposed, promises rejected).
   */
  async flush(): Promise<void> {
    this.clearDeadlineTimer();
    await this.executeFlush();
  }

  // ─── Initialisation ────────────────────────────────────────────────────────

  private async open(): Promise<void> {
    fs.mkdirSync(this.segDir,  { recursive: true });
    fs.mkdirSync(this.casDir,  { recursive: true });

    this.lockPath = path.join(this.segDir, 'write.lock');

    // Acquire write lock before any reads or writes (§3.4.1).
    // Read-only opens bypass the lock — they never modify state.
    if (!this.isReadOnly) {
      this.acquireWriteLock();
    }

    this.manifest  = this.loadOrInitManifest();
    this.activeSeg = this.manifest.segmentRange[1];
    this.activeSegPath = this.segPath(this.activeSeg);
    this.indexPath     = path.join(this.segDir, 'index.idx');

    // Always replay from segment files — the segment IS the ground truth.
    //
    // The former guard `if (manifest.lastCommitOffset >= 0)` was a performance
    // micro-opt that silently dropped durable rows on crash: if the process died
    // after the segment fdatasync (Phase 3) but before the manifest.json update
    // (Phase 4), lastCommitOffset would still be -1 on the next open, and replay
    // was skipped entirely — making committed rows invisible (issue #56).
    //
    // scanSegmentFile() returns [] for non-existent / zero-byte segment files,
    // so this call is a safe no-op for fresh sessions. The manifest's
    // lastCommitOffset is retained for informational purposes only; it is NOT
    // used as a replay gate.
    this.replayFromSegments();
  }

  /**
   * Acquire the exclusive write lock with PID liveness check (§3.4.1, D-LOCK-2).
   *
   * Protocol:
   *   1. Try exclusive-create (wx): if it succeeds, write our PID and return.
   *   2. On EEXIST: read stored PID, check liveness via process.kill(pid, 0).
   *      - ESRCH (dead) or unparseable/empty → stale lock → overwrite with our PID.
   *      - EPERM (alive, no permission to signal) → treat as LIVE → throw.
   *      - No error (alive) → throw WriteLockHeldError with holder PID.
   *
   * Race note: read-PID → liveness-check → overwrite is NOT atomic. A concurrent
   * opener could slip between these steps and both believe they hold the lock.
   * This is a best-effort reclaim for v1; a true atomic swap requires OS primitives
   * (tracking issue #55). The window is narrow (microseconds) and the WAL
   * hash-chain will detect any corruption from a concurrent write.
   */
  private acquireWriteLock(): void {
    try {
      // Write PID through the wx fd before closing — eliminates the empty-file
      // window that a concurrent opener could misread as a stale lock (§3.4.1).
      // Loop until all bytes are written: writeSync may short-write on a slow
      // or busy filesystem, and a truncated PID would be parsed as stale.
      const fd     = fs.openSync(this.lockPath, 'wx');
      const pidBuf = Buffer.from(String(process.pid), 'utf8');
      let written  = 0;
      while (written < pidBuf.length) {
        written += fs.writeSync(fd, pidBuf, written, pidBuf.length - written);
      }
      fs.closeSync(fd);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      this.reclaimOrThrow();
    }
  }

  /**
   * Called when the lock file already exists.
   * Reads the stored PID and either reclaims (stale) or throws (live).
   */
  private reclaimOrThrow(): void {
    let storedPid: number | null = null;
    try {
      const raw = fs.readFileSync(this.lockPath, 'utf8').trim();
      const n   = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) storedPid = n;
    } catch {
      // Can't read lock file — treat as stale
    }

    if (storedPid !== null && isPidAlive(storedPid)) {
      throw new WriteLockHeldError(this.lockPath, storedPid);
    }

    // Stale lock (dead PID or unparseable content) — reclaim by overwriting
    fs.writeFileSync(this.lockPath, String(process.pid), 'utf8');
  }

  private loadOrInitManifest(): Manifest {
    const p = this.manifestPath();
    if (fs.existsSync(p)) {
      const m = JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest;
      // B1 — Format versioning backstop: refuse to open a manifest with an
      // unknown schemaVersion rather than attempting decode and producing
      // confusing corruption errors.  WAL v1 (WAL1/CBOR) is the only version
      // ever shipped; no migration is owed for schemaVersion < 1 or > 1.
      if (m.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        throw new UnsupportedSchemaVersionError(m.schemaVersion, CURRENT_SCHEMA_VERSION);
      }
      return m;
    }
    const m: Manifest = {
      schemaVersion:    CURRENT_SCHEMA_VERSION,
      sessionId:        this.sessionId,
      segmentRange:     [0, 0],
      lastCommitOffset: -1,
    };
    fs.writeFileSync(p, JSON.stringify(m, null, 2), 'utf8');
    return m;
  }

  private manifestPath(): string {
    return path.join(this.segDir, 'manifest.json');
  }

  private segPath(idx: number): string {
    return path.join(this.segDir, `${String(idx).padStart(6, '0')}.seg`);
  }

  // ─── Replay ────────────────────────────────────────────────────────────────

  private replayFromSegments(): void {
    const [first, last] = this.manifest.segmentRange;
    for (let s = first; s <= last; s++) {
      const segFilePath = this.segPath(s);
      const records = this.scanSegmentFile(segFilePath);
      for (const rec of records) {
        const offset = Number(rec.commitOffset);

        // Seed lastTimestampNs from replayed records (§3.10 monotonicity across reopen)
        if (rec.timestampNs > this.lastTimestampNs) {
          this.lastTimestampNs = rec.timestampNs;
        }

        // Decode envelope (#67 v1 format: CBOR map {k, m?}; also handles
        // backward-compat bare CBOR string from pre-#67 segments).
        let primitiveKindRaw = 'observation';
        let metadata: EventMetadata | undefined;
        // The write path (materializeRow) always produces a non-empty envelope.
        // An empty envelopeCbor indicates a corrupted or unrecognised record —
        // default to 'observation' would silently misclassify it.
        if (rec.envelopeCbor.length === 0) {
          throw new CorruptSegmentError(
            segFilePath,
            `empty envelopeCbor at offset ${offset} — record is corrupt or from an unsupported format`,
          );
        }
        if (rec.envelopeCbor.length > 0) {
          try {
            const decoded = decodeCbor(rec.envelopeCbor);
            if (typeof decoded === 'string') {
              // Backward compat: old segments stored a bare CBOR string for primitiveKind.
              primitiveKindRaw = decoded;
              // metadata remains undefined (not persisted in old format)
            } else if (
              typeof decoded === 'object' &&
              decoded !== null &&
              !Array.isArray(decoded)
            ) {
              // v1 envelope map: {k: primitiveKind, m?: metadata}
              const env = decoded as EnvelopeMapV1;
              if (typeof env.k !== 'string') {
                throw new CorruptSegmentError(
                  segFilePath,
                  `envelope map at offset ${offset} missing string key "k"`,
                );
              }
              primitiveKindRaw = env.k;
              if ('m' in env && isPlainObject(env.m)) {
                metadata = env.m as EventMetadata;
              } else if ('m' in env) {
                throw new CorruptSegmentError(
                  segFilePath,
                  `envelope map at offset ${offset} has non-object metadata "m"`,
                );
              }
            } else {
              throw new CorruptSegmentError(
                segFilePath,
                `primitiveKind envelope at offset ${offset} is not a string or map`,
              );
            }
          } catch (err) {
            if (err instanceof CorruptSegmentError) throw err;
            throw new CorruptSegmentError(
              segFilePath,
              `invalid CBOR primitiveKind envelope at offset ${offset}`,
            );
          }
        }
        if (!VALID_PRIMITIVE_KINDS.has(primitiveKindRaw)) {
          throw new CorruptSegmentError(
            segFilePath,
            `unknown primitiveKind "${primitiveKindRaw}" at offset ${offset}`,
          );
        }
        const primitiveKind = primitiveKindRaw as PrimitiveKind;

        const payloadBuf = this.cas.get(rec.payloadHash);
        if (!payloadBuf) {
          throw new CasMissError(rec.payloadHash, offset);
        }
        let primitivePayload: unknown;
        try {
          primitivePayload = decodeCbor(payloadBuf);
        } catch {
          throw new CorruptSegmentError(
            segFilePath,
            `invalid CBOR payload at offset ${offset}`,
          );
        }

        let causalReadSet: string[] = [];
        if (!isZeroHash(rec.readSetHash)) {
          const rsBuf = this.cas.get(rec.readSetHash);
          if (!rsBuf) {
            throw new CasMissError(rec.readSetHash, offset);
          }
          let parsed: unknown;
          try {
            parsed = decodeCbor(rsBuf);
          } catch {
            throw new CorruptSegmentError(
              segFilePath,
              `invalid CBOR causalReadSet at offset ${offset}`,
            );
          }
          if (!Array.isArray(parsed)) {
            throw new CorruptSegmentError(
              segFilePath,
              `causalReadSet at offset ${offset} is not an array`,
            );
          }
          if (!parsed.every((e): e is string => typeof e === 'string')) {
            throw new CorruptSegmentError(
              segFilePath,
              `causalReadSet at offset ${offset} contains non-string elements`,
            );
          }
          causalReadSet = parsed;
        }

        // NOTE (v1 / #67 RESOLVED): metadata is now persisted in the WAL envelope
        // (CBOR map {k: primitiveKind, m?: metadata}).  Replayed events carry the
        // same metadata as the original commit, enabling replay-based catchup
        // projectors (e.g. ApertureProjector) to filter by level after reopen.
        // Old segments (bare CBOR string envelope) decode with metadata=undefined.
        //
        // BLOCKING-4: include walFlags from rec.flags so readRows() returns
        // identical results pre- and post-reopen (e.g. flags.bootstrap=true on
        // bootstrap rows survives a session reopen).
        const replayedEvent: LedgerEvent = {
          primitiveKind,
          primitivePayload,
          causalReadSet,
          walFlags: rec.flags,
          offset,
          ...(metadata !== undefined ? { metadata } : {}),
        };
        this.events.push(replayedEvent);
        this.prevRoot = new Uint8Array(rec.selfRoot);
      }
    }
  }

  // ─── Segment scanning (used by replay + readSegmentRecords) ────────────────

  private scanSegmentFile(filePath: string): SegmentRecord[] {
    const records: SegmentRecord[] = [];
    if (!fs.existsSync(filePath)) return records;

    const fileBuf = fs.readFileSync(filePath);
    let pos = 0;

    while (pos + 8 <= fileBuf.length) {
      const magic = fileBuf.readUInt32BE(pos);
      if (magic !== MAGIC) break; // end of valid records or corruption

      const recordLen = fileBuf.readUInt32LE(pos + 4);
      const totalSize = recordLen + 4; // recordLen excludes the 4-byte magic

      if (pos + totalSize > fileBuf.length) break; // truncated record

      try {
        const rec = decodeRecord(Buffer.from(fileBuf.subarray(pos, pos + totalSize)));
        records.push(rec);
      } catch {
        break; // corrupt record — stop scanning
      }

      pos += totalSize;
    }

    return records;
  }

  /**
   * Return all decoded SegmentRecords from the active segment.
   * Used by tests to verify chain integrity (verifyChain).
   */
  readSegmentRecords(segIdx?: number): SegmentRecord[] {
    return this.scanSegmentFile(this.segPath(segIdx ?? this.activeSeg));
  }

  /**
   * Return decoded SegmentRecords across ALL segments in segmentRange.
   *
   * readSegmentRecords() reads only the active segment; sessions that span
   * multiple 64 MiB segments require iterating the full range.  Replay uses
   * this method so the raw-record side covers the same row set as readRows().
   */
  readAllSegmentRecords(): SegmentRecord[] {
    const [first, last] = this.manifest.segmentRange;
    const all: SegmentRecord[] = [];
    for (let s = first; s <= last; s++) {
      all.push(...this.scanSegmentFile(this.segPath(s)));
    }
    return all;
  }

  // ─── WalBackend interface ─────────────────────────────────────────────────

  /**
   * Stage a pre-validated row for group-commit.
   *
   * Returns a Promise that resolves (with commit offset) after the staging
   * batch containing this row is flushed and fdatasync'd.  If batchSize=1
   * (default) the flush is triggered immediately and the Promise resolves on
   * the next microtask.
   *
   * The row is never written to the WAL segment until flush; VETO is handled
   * by the Ledger layer before commitRow is ever called (Exclude<..,'VETO'>).
   */
  async commitRow(
    input:      PrimitiveInput,
    hookResult: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null },
  ): Promise<number> {
    if (this.isReadOnly) throw new ReadOnlyWalBackendError();
    return new Promise((resolve, reject) => {
      this.stagingQueue.push({ input, hookResult, resolve, reject });
      if (this.stagingQueue.length >= this.batchSize) {
        this.clearDeadlineTimer();
        // Fire-and-forget: resolve/reject propagated via entry callbacks.
        // Silence the executeFlush Promise's own rejection to avoid
        // unhandled-rejection warnings (callers see rejects via their entry).
        void this.executeFlush().catch(() => {});
      } else {
        this.scheduleDeadlineFlush();
      }
    });
  }

  /**
   * Stage a row for the next group-commit flush without triggering auto-flush.
   *
   * Called by LedgerImpl.bootstrap() to queue all bootstrap rows before a
   * single explicit flush() — guaranteeing one atomic fsync barrier for the
   * entire batch regardless of batchSize (BLOCKING-3 / GAP-2).
   *
   * The returned Promise resolves with the commit offset when flush() commits
   * the batch containing this row. Callers MUST call flush() explicitly.
   */
  async stageRow(
    input:      PrimitiveInput,
    hookResult: HookResult & { verdict: Exclude<HookVerdict, 'VETO'>; hookId: string | null },
  ): Promise<number> {
    if (this.isReadOnly) throw new ReadOnlyWalBackendError();
    return new Promise((resolve, reject) => {
      this.stagingQueue.push({ input, hookResult, resolve, reject });
      // No auto-flush or deadline timer — caller controls when to flush.
    });
  }

  async readRows(opts: LedgerQueryOpts): Promise<LedgerEvent[]> {
    const [start, end] = opts.range;
    return this.events.filter(e => e.offset >= start && e.offset <= end);
  }

  // ─── Group-commit timer management ───────────────────────────────────────

  private scheduleDeadlineFlush(): void {
    if (this.batchDeadlineMs <= 0) return; // disabled
    if (this.flushTimer !== null)   return; // already scheduled
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.executeFlush().catch(() => {});
    }, this.batchDeadlineMs);
  }

  private clearDeadlineTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // ─── Core: group-commit execute ───────────────────────────────────────────

  /**
   * Flush all staged rows as one atomic group-commit batch (§3.5).
   *
   * Protocol (single synchronous pass — no internal await):
   *   1. sealAndSplit(staged, verdicts) → committed + restaged.
   *   2. CAS-write payloads for committed rows.
   *   3. Build entire hash chain for committed rows in one call.
   *   4. Encode all records to buffers.
   *   2.5 fsync all newly-written CAS files via syncAll(syncFn) — CAS durable
   *       BEFORE segment written (§3.2 / issue #59).
   *   5. Open segment fd, write all buffers, call syncFn(fd) — ONE barrier.
   *   6. On success: update prevRoot, write index entries, update manifest,
   *      push to in-memory events, resolve all committed promises,
   *      re-queue restaged entries, fire onPause callback if applicable.
   *   7. On failure: ftruncate segment to pre-batch size, reject committed
   *      promises, re-queue restaged entries (their promises stay pending).
   *      The prevRoot is NOT advanced on failure.
   */
  private async executeFlush(): Promise<void> {
    if (this.stagingQueue.length === 0) return;

    const batch = this.stagingQueue.splice(0);

    const batchVerdicts = batch.map(b => b.hookResult.verdict);
    const { committed, restaged } = sealAndSplit(batch, batchVerdicts);

    if (committed.length === 0) {
      // Nothing to write — requeue everything
      this.stagingQueue.unshift(...batch);
      return;
    }

    const preBatchSegSize = fs.existsSync(this.activeSegPath)
      ? fs.statSync(this.activeSegPath).size
      : 0;
    const baseOffset = this.events.length;

    // ── Phase 1: CAS writes + build SegmentRecordInput[] ─────────────────────
    const rowInputs: SegmentRecordInput[] = [];
    for (let i = 0; i < committed.length; i++) {
      const { row: entry, verdict } = committed[i];
      const offset = baseOffset + i;

      // Shared materialization: CBOR encoding + hashing is done once via the
      // shared helper so both backends produce identical payloadHash/readSetHash/
      // envelopeCbor/verdictByte for the same input (I2).
      const mat = materializeRow(entry.input, verdict, entry.hookResult.hookId);

      // Store CAS blobs. Pass the pre-computed hash from materializeRow so the
      // CAS layer skips re-hashing (encode-once, hash-once hot path — A2).
      this.cas.put(mat.payloadBytes, mat.payloadHash);
      if (mat.readSetBytes !== null) {
        this.cas.put(mat.readSetBytes, mat.readSetHash);
      }

      // §3.10 timestampNs monotonicity: clamp to lastTimestampNs when clock goes backward
      const nowNs = this.nowNs();
      const tsNs  = nowNs > this.lastTimestampNs ? nowNs : this.lastTimestampNs;
      this.lastTimestampNs = tsNs;

      rowInputs.push({
        commitOffset:  BigInt(offset),
        timestampNs:   tsNs,
        primitiveKind: 0x01,
        hookVerdict:   mat.verdictByte,
        flags: {
          bootstrap:       entry.input.walFlags?.bootstrap       ?? false,
          declaredWindow:  entry.input.walFlags?.declaredWindow  ?? false,
          syntheticOutput: entry.input.walFlags?.syntheticOutput ?? false,
          taskBoundary:    entry.input.walFlags?.taskBoundary    ?? false,
          manifestRoot:    entry.input.walFlags?.manifestRoot    ?? false,
        },
        payloadHash:  mat.payloadHash,
        readSetHash:  mat.readSetHash,
        envelopeCbor: mat.envelopeCbor,
      });
    }

    // ── Phase 2: Build hash chain for the entire committed batch ──────────────
    const chained       = buildChain(rowInputs, this.prevRoot);
    const recordBuffers = chained.map(r => encodeRecord(r));

    // ── Phase 2.5: fsync all newly-written CAS files (§3.2 / issue #59) ───────
    // CAS blobs must be durable BEFORE the segment record referencing them is
    // written (let alone fsynced). Batched into the group-commit barrier so
    // amortised cost is O(K) new CAS files per flush, not O(rows).
    // Ordering invariant: CAS durable → segment written → segment durable.
    try {
      this.cas.syncAll(this.syncFn);
    } catch (err) {
      // CAS sync failed — this commit is NOT durable. The WAL segment has not
      // been written; the caller must retry the entire batch. Reject all
      // committed entries so their promises are settled with an error.
      // (pendingSync is already cleared inside syncAll's catch block, so a
      // later batch will not re-sync orphaned temp blobs from this failed one.)
      for (const { row: entry } of committed) entry.reject(err);
      if (restaged.length > 0) {
        this.stagingQueue.unshift(...restaged.map(r => r.row));
      }
      throw err;
    }

    // ── Phase 3: Write to segment + ONE fsync barrier ─────────────────────────
    const segFd = fs.openSync(this.activeSegPath, 'a');

    try {
      for (const buf of recordBuffers) {
        // Loop until all bytes are written — writeSync may short-write on a
        // busy or slow filesystem, which would truncate the record and break
        // replay. Same pattern as acquireWriteLock (§3.4.1).
        let written = 0;
        while (written < buf.length) {
          written += fs.writeSync(segFd, buf, written, buf.length - written);
        }
      }
      this.syncFn(segFd); // ONE barrier per batch (§3.5)
    } catch (err) {
      // Atomic abort: truncate segment back to pre-batch position (§3.5).
      // Close the fd first; ftruncateSync on O_APPEND fd is unreliable on
      // Windows — use path-based truncateSync after close instead.
      try { fs.closeSync(segFd); }                                              catch { /* best effort */ }
      try { fs.truncateSync(this.activeSegPath, preBatchSegSize); }             catch { /* best effort */ }

      // Reject all entries whose writes were attempted (committed set)
      for (const { row: entry } of committed) entry.reject(err);

      // Re-queue restaged entries — they were never written
      if (restaged.length > 0) {
        this.stagingQueue.unshift(...restaged.map(r => r.row));
      }

      throw err; // re-throw so flush() callers also reject
    }

    fs.closeSync(segFd);

    // ── Phase 4: Post-fsync — update state (only runs on success) ────────────
    this.prevRoot = new Uint8Array(chained[chained.length - 1].selfRoot);

    let byteOffset = preBatchSegSize;
    for (let i = 0; i < committed.length; i++) {
      const offset = baseOffset + i;

      // Index entry (written after fsync — stays consistent with segment)
      const indexEntry: IndexEntry = { offset, seg: this.activeSeg, byteOffset };
      fs.appendFileSync(this.indexPath, JSON.stringify(indexEntry) + '\n', 'utf8');
      byteOffset += recordBuffers[i].length;

      // In-memory event cache
      this.events.push({ ...committed[i].row.input, offset });
    }

    // Manifest
    this.manifest.lastCommitOffset = baseOffset + committed.length - 1;
    fs.writeFileSync(this.manifestPath(), JSON.stringify(this.manifest, null, 2), 'utf8');

    // Resolve committed promises
    for (let i = 0; i < committed.length; i++) {
      committed[i].row.resolve(baseOffset + i);
    }

    // L1Subscriber stub: notify onPause if the last committed row is a PAUSE
    const lastVerdict = committed[committed.length - 1].verdict;
    if (lastVerdict === 'PAUSE' && this.onPause) {
      this.onPause(baseOffset + committed.length - 1);
    }

    // Re-queue restaged entries (their promises stay pending until next flush)
    if (restaged.length > 0) {
      this.stagingQueue.unshift(...restaged.map(r => r.row));
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Valid primitiveKind strings (§6.1). Used during replay to detect corrupt
 * segments that contain an unrecognised kind byte sequence.
 */
const VALID_PRIMITIVE_KINDS = new Set<string>([
  'request', 'artifact', 'observation', 'decision', 'question',
]);

function isZeroHash(hash: Uint8Array): boolean {
  for (let i = 0; i < hash.length; i++) {
    if (hash[i] !== 0) return false;
  }
  return true;
}

// ─── PID liveness helper ──────────────────────────────────────────────────────

/**
 * Returns true if the process with the given PID is alive.
 *
 * Uses `process.kill(pid, 0)` — signal 0 does no harm but checks existence:
 *   - No error  → process exists and we have permission to signal it → ALIVE
 *   - ESRCH     → no such process → DEAD
 *   - EPERM     → process exists but we lack permission → treat as ALIVE
 *   - Other     → unknown → treat as DEAD (safe: allows reclaim rather than
 *                 blocking the opener on an ambiguous state)
 *
 * Works on Windows and Unix in Node.js.
 */
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EPERM')  return true;  // alive, just no signal permission
    if (code === 'ESRCH')  return false; // confirmed dead
    return false; // unknown — treat as dead, allow reclaim
  }
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * createFileSystemWalBackend — factory that opens (or creates) a file-backed
 * WAL session directory rooted at `rootDir`.
 *
 * By default opens for writing (acquires exclusive write.lock per §3.4.1)
 * with single-row immediate-flush behaviour (batchSize: 1).
 *
 * Pass `{ readOnly: true }` to open without acquiring the write lock.
 * Pass `{ batchSize: N, batchDeadlineMs: M }` to enable true group-commit.
 * Pass `{ syncFn }` to inject a custom sync barrier (testing seam).
 * Pass `{ onPause }` to receive pause-verdict commit notifications (L1Subscriber stub).
 */
export async function createFileSystemWalBackend(
  rootDir:   string,
  sessionId: string,
  opts?:     FileSystemWalBackendOptions,
): Promise<FileSystemWalBackend> {
  return FileSystemWalBackend.create(rootDir, sessionId, opts);
}
