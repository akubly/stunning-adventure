/**
 * FileSystemCas — content-addressed store backed by the filesystem.
 *
 * On-disk layout (§3.2):
 *   <casDir>/<first-2-hex-chars-of-hash>/<full-64-hex-char-hash>.cbor
 *
 * Write ordering (§3.2 / issue #59):
 *   CAS files are written in Phase 1 of executeFlush(), then fsynced in
 *   Phase 2.5 via syncAll(), and only THEN the WAL segment record is written
 *   and fsynced in Phase 3. This guarantees: CAS durable → segment durable.
 *   A crash between Phase 2.5 and Phase 3 leaves no durable WAL record, so
 *   no CasMissError on reopen.
 *
 * `.cbor` extension is a convention; the file content is raw bytes (not
 * CBOR-wrapped). CBOR envelope encoding is deferred until §6 locks.
 */

import fs from 'node:fs';
import path from 'node:path';

import { hashBytes } from './hash.js';
import type { Blake3Hash } from './types.js';

export class FileSystemCas {
  /**
   * Tracks CAS file paths written in the current flush batch but not yet
   * fsynced. Cleared by syncAll() after each successful sync.
   */
  private readonly pendingSync = new Set<string>();

  constructor(private readonly casDir: string) {
    fs.mkdirSync(casDir, { recursive: true });
  }

  /**
   * Store bytes under their BLAKE3 hash key. Idempotent.
   * Returns the 32-byte hash (the CAS key for the WAL record header).
   *
   * New files are tracked in pendingSync until syncAll() is called.
   * Already-existing files are not re-tracked (they were fsynced in a prior
   * batch and are already durable).
   */
  put(bytes: Uint8Array): Blake3Hash {
    const hash = hashBytes(bytes);
    const hex  = Buffer.from(hash).toString('hex');
    const shard = hex.slice(0, 2);
    const shardDir = path.join(this.casDir, shard);
    fs.mkdirSync(shardDir, { recursive: true });

    const filePath = path.join(shardDir, `${hex}.cbor`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, bytes);
      this.pendingSync.add(filePath);
    }
    return hash;
  }

  /**
   * fsync all CAS files written since the last syncAll() call.
   * Must be called BEFORE the WAL segment fdatasync to maintain the
   * CAS-before-segment durability ordering (§3.2 / issue #59).
   *
   * Opens each file with 'r+' (read-write) so FlushFileBuffers succeeds on
   * Windows. Removes each path from pendingSync as it is successfully synced,
   * so a failed sync leaves only un-synced paths for the next retry.
   *
   * @param syncFn - The injectable sync function (same seam as segment fsync).
   */
  syncAll(syncFn: (fd: number) => void): void {
    for (const filePath of [...this.pendingSync]) {
      const fd = fs.openSync(filePath, 'r+');
      try {
        syncFn(fd);
      } finally {
        fs.closeSync(fd);
      }
      this.pendingSync.delete(filePath);
    }
  }

  /**
   * Retrieve bytes by BLAKE3 hash. Returns null on CAS_MISS (ENOENT only).
   * All other I/O errors (permission denied, corruption, etc.) are re-thrown
   * so callers surface real disk failures rather than receiving a misleading null.
   */
  get(hash: Blake3Hash): Uint8Array | null {
    const hex  = Buffer.from(hash).toString('hex');
    const filePath = path.join(this.casDir, hex.slice(0, 2), `${hex}.cbor`);
    try {
      const buf = fs.readFileSync(filePath);
      return new Uint8Array(buf);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  /** Absolute path for a given hash key — useful for test assertions. */
  filePath(hash: Blake3Hash): string {
    const hex = Buffer.from(hash).toString('hex');
    return path.join(this.casDir, hex.slice(0, 2), `${hex}.cbor`);
  }
}
