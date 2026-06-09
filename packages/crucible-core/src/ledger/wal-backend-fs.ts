/**
 * FileSystemWalBackend — durable WalBackend implementation backed by §3.2
 * on-disk layout: binary .seg segment files, NDJSON index.idx, and
 * manifest.json.  Reuses the sub-seam codec / hash-chain / CAS internals.
 *
 * On-disk tree rooted at `rootDir`:
 *
 *   <rootDir>/
 *   ├── meta/
 *   │   └── manifest.json           schemaVersion, sessionId, segmentRange, lastCommitOffset
 *   ├── wal/
 *   │   └── sessions/<sessionId>/
 *   │       ├── 000000.seg          binary segment records (codec.ts framing)
 *   │       ├── index.idx           NDJSON: {offset, seg, byteOffset} one line per row
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
 * primitiveKind is stored in envelopeCbor as UTF-8 until §6 primitive enum
 * locks and CBOR canonicalization replaces it.
 */

import fs   from 'node:fs';
import path from 'node:path';

import type { PrimitiveInput, PrimitiveKind } from '../types.js';
import type { WalBackend, LedgerEvent, LedgerQueryOpts } from './ledger.js';
import type { HookResult, HookVerdict } from './hook-bus.js';
import { encodeRecord, decodeRecord, MAGIC } from './wal/codec.js';
import { buildChain, ZERO_HASH }             from './wal/hash-chain.js';
import { FileSystemCas }                     from './wal/cas-fs.js';
import { sealAndSplit }                      from './wal/seal-and-split.js';
import type { SegmentRecord, SegmentRecordInput } from './wal/types.js';
import { VERDICT_TO_WAL }                    from './wal/types.js';

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
   * Injectable sync barrier (seam for testing §3.5 atomicity).
   * Default: (fd) => fs.fsyncSync(fd).  Tests pass a spy or a throwing stub.
   */
  syncFn?: (fd: number) => void;
  /**
   * Optional callback invoked after a PAUSE row commits durably (§3.5
   * seal-and-split).  Receives the commit offset of the paused row.
   * Stub for the L1Subscriber → Router broadcast (§5 not yet built).
   */
  onPause?: (commitOffset: number) => void;
}

// ─── FileSystemWalBackend ─────────────────────────────────────────────────────

export class FileSystemWalBackend implements WalBackend {
  private readonly segDir:  string;
  private readonly casDir:  string;
  private readonly metaDir: string;
  private readonly cas:     FileSystemCas;

  private manifest!:        Manifest;
  private events:           LedgerEvent[] = [];
  private prevRoot          = new Uint8Array(ZERO_HASH);
  private activeSeg         = 0;
  private activeSegPath!:   string;
  private indexPath!:       string;
  private lockPath!:        string;
  private readonly isReadOnly:     boolean;
  private readonly batchSize:      number;
  private readonly batchDeadlineMs:number;
  private readonly syncFn:         (fd: number) => void;
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
    this.metaDir         = path.join(rootDir, 'meta');
    this.cas             = new FileSystemCas(this.casDir);
    this.isReadOnly      = opts?.readOnly      ?? false;
    this.batchSize       = opts?.batchSize      ?? 1;       // default: immediate flush
    this.batchDeadlineMs = opts?.batchDeadlineMs ?? 2;
    this.syncFn          = opts?.syncFn ?? ((fd) => fs.fsyncSync(fd));
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
    fs.mkdirSync(this.metaDir, { recursive: true });

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

    if (this.manifest.lastCommitOffset >= 0) {
      this.replayFromSegments();
    }
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
      return JSON.parse(fs.readFileSync(p, 'utf8')) as Manifest;
    }
    const m: Manifest = {
      schemaVersion:    1,
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
      const records = this.scanSegmentFile(this.segPath(s));
      for (const rec of records) {
        const offset = Number(rec.commitOffset);
        const primitiveKind = rec.envelopeCbor.length > 0
          ? (Buffer.from(rec.envelopeCbor).toString('utf8') as PrimitiveKind)
          : 'observation';

        const payloadBuf = this.cas.get(rec.payloadHash);
        const primitivePayload = payloadBuf
          ? (JSON.parse(Buffer.from(payloadBuf).toString('utf8')) as unknown)
          : null;

        let causalReadSet: string[] = [];
        if (!isZeroHash(rec.readSetHash)) {
          const rsBuf = this.cas.get(rec.readSetHash);
          if (rsBuf) {
            const parsed = JSON.parse(Buffer.from(rsBuf).toString('utf8')) as unknown;
            if (Array.isArray(parsed)) causalReadSet = parsed as string[];
          }
        }

        this.events.push({ primitiveKind, primitivePayload, causalReadSet, offset });
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

      const payloadBytes = Buffer.from(JSON.stringify(entry.input.primitivePayload), 'utf8');
      const payloadHash  = this.cas.put(new Uint8Array(payloadBytes));

      const readSetHash  = entry.input.causalReadSet.length > 0
        ? this.cas.put(new Uint8Array(Buffer.from(JSON.stringify(entry.input.causalReadSet), 'utf8')))
        : new Uint8Array(32);

      const envelopeCbor = new Uint8Array(Buffer.from(entry.input.primitiveKind, 'utf8'));

      rowInputs.push({
        commitOffset:  BigInt(offset),
        timestampNs:   BigInt(Date.now()) * 1_000_000n,
        primitiveKind: 0x01,
        hookVerdict:   VERDICT_TO_WAL[verdict],
        flags: {
          bootstrap: false, declaredWindow: false,
          syntheticOutput: false, taskBoundary: false, manifestRoot: false,
        },
        payloadHash,
        readSetHash,
        envelopeCbor,
      });
    }

    // ── Phase 2: Build hash chain for the entire committed batch ──────────────
    const chained       = buildChain(rowInputs, this.prevRoot);
    const recordBuffers = chained.map(r => encodeRecord(r));

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
