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
 *   Each put() writes to a UNIQUE `<hash>-<pid>-<n>.cbor.tmp`; syncAll()
 *   fsyncs that temp file, then atomically renames it to `<hash>.cbor`.
 *   "Final already exists" is treated as success (content-addressed → identical
 *   bytes from any writer). The final CAS path is therefore either absent or
 *   complete, eliminating cross-session torn-blob races.
 *
 * `.cbor` extension is a convention; the file content is raw bytes.
 */

import fs from 'node:fs';
import path from 'node:path';

import { hashBytes } from './hash.js';
import type { Blake3Hash } from './types.js';

/** Counter used to make temp-file names unique within a process invocation. */
let tmpCounter = 0;

export class FileSystemCas {
  /**
   * Tracks CAS writes pending fsync+rename in the current flush batch.
   * Each entry maps finalPath → tmpPath for a blob not yet durably renamed.
   *
   * Invariant (per entry): cleared when the entry's sync+rename succeeds, OR
   * when syncAll() aborts mid-iteration (entire map cleared in the catch block
   * so the next batch never re-syncs stale entries from a previous failed batch).
   */
  private readonly pendingSync = new Map<string, string>();

  constructor(private readonly casDir: string) {
    fs.mkdirSync(casDir, { recursive: true });
  }

  /**
   * Store bytes under their BLAKE3 hash key using a uniquely-named temp file.
   * Returns the 32-byte hash (the CAS key for the WAL record header).
   *
   * Uses a per-put unique suffix (`<hash>-<pid>-<n>.cbor.tmp`) so concurrent
   * writers for the same hash — across sessions or threads — each write to
   * their own temp file and never clobber each other before the atomic rename.
   *
   * Repeated puts of the same hash within a batch coalesce to one finalPath
   * entry in pendingSync (the latest tmpPath wins; all have identical content).
   */
  put(bytes: Uint8Array): Blake3Hash {
    const hash = hashBytes(bytes);
    const hex  = Buffer.from(hash).toString('hex');
    const shard = hex.slice(0, 2);
    const shardDir = path.join(this.casDir, shard);
    fs.mkdirSync(shardDir, { recursive: true });

    const finalPath = path.join(shardDir, `${hex}.cbor`);
    const tmpPath   = path.join(shardDir, `${hex}-${process.pid}-${++tmpCounter}.cbor.tmp`);
    fs.writeFileSync(tmpPath, bytes);
    this.pendingSync.set(finalPath, tmpPath);
    return hash;
  }

  /**
   * fsync all CAS files written since the last syncAll() call, then atomically
   * rename each to its final path.
   *
   * Must be called BEFORE the WAL segment fdatasync to maintain the
   * CAS-before-segment durability ordering (§3.2 / issue #59).
   *
   * Opens each temp file with 'r+' (read-write) so FlushFileBuffers succeeds
   * on Windows. After a successful sync, rename the temp file into place.
   *
   * Shard-directory fsync (Linux/ext4 durability):
   *   After each rename, the parent shard directory is opened and fsynced so
   *   the new directory entry is durable. Without this, a crash after rename
   *   but before shard-dir fsync can leave the directory entry in a lost state
   *   on ext4 and similar ordered-mode filesystems.
   *   On Windows (NTFS), directory entries are written synchronously as part of
   *   the rename operation, so the extra fsync is a no-op but harmless.
   *
   * Abort semantics:
   *   If syncFn throws at any point, pendingSync is cleared in the catch block.
   *   This prevents a later syncAll() from picking up stale entries from the
   *   failed batch (orphan blobs ahead of WAL) and avoids incorrect call-count
   *   assertions in tests that inject mid-iteration failures.
   *
   * Removes each finalPath from pendingSync as it is successfully published, so
   * a successful partial sync leaves only un-published paths for retry.
   *
   * @param syncFn - The injectable sync function (same seam as segment fsync).
   */
  syncAll(syncFn: (fd: number) => void): void {
    try {
      for (const [finalPath, tmpPath] of [...this.pendingSync]) {
        const fd = fs.openSync(tmpPath, 'r+');
        try {
          syncFn(fd);
        } finally {
          fs.closeSync(fd);
        }

        // Atomic rename: if the final blob already exists (concurrent same-hash
        // writer already landed it), treat that as success — content-addressed
        // means the bytes are identical.
        try {
          fs.renameSync(tmpPath, finalPath);
        } catch (renameErr) {
          if ((renameErr as NodeJS.ErrnoException).code === 'EEXIST') {
            // Another writer already landed the same blob — clean up our temp.
            try { fs.unlinkSync(tmpPath); } catch { /* best effort */ }
          } else {
            throw renameErr;
          }
        }

        // fsync the shard directory to make the new directory entry durable on
        // Linux (ext4 ordered mode).  Skipped on Windows because NTFS writes
        // directory entries synchronously during rename; opening and fsyncing the
        // dir is a no-op on Windows but not harmful.
        if (process.platform !== 'win32') {
          const shardDir = path.dirname(finalPath);
          const dirFd = fs.openSync(shardDir, 'r');
          try {
            syncFn(dirFd);
          } finally {
            fs.closeSync(dirFd);
          }
        }

        this.pendingSync.delete(finalPath);
      }
    } catch (err) {
      // On abort, clear the entire map so the NEXT batch starts clean.
      // Stale entries from a failed batch must not be re-synced in a later call
      // (they would be orphan temp blobs ahead of any WAL record, and re-syncing
      // them would violate the exact call-count invariant tested in CAS-F tests).
      this.pendingSync.clear();
      throw err;
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
