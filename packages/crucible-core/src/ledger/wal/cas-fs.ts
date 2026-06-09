/**
 * FileSystemCas — content-addressed store backed by the filesystem.
 *
 * On-disk layout (§3.2):
 *   <casDir>/<first-2-hex-chars-of-hash>/<full-64-hex-char-hash>.cbor
 *
 * CAS writes happen BEFORE the corresponding WAL segment record is written
 * (§3.2 write order). Note: CAS files are NOT fsynced in v1 — full durability
 * of CAS content relative to WAL segments is deferred; tracked in #59.
 *
 * `.cbor` extension is a convention; the file content is raw bytes (not
 * CBOR-wrapped). CBOR envelope encoding is deferred until §6 locks.
 */

import fs from 'node:fs';
import path from 'node:path';

import { hashBytes } from './hash.js';
import type { Blake3Hash } from './types.js';

export class FileSystemCas {
  constructor(private readonly casDir: string) {
    fs.mkdirSync(casDir, { recursive: true });
  }

  /**
   * Store bytes under their BLAKE3 hash key. Idempotent.
   * Returns the 32-byte hash (the CAS key for the WAL record header).
   */
  put(bytes: Uint8Array): Blake3Hash {
    const hash = hashBytes(bytes);
    const hex  = Buffer.from(hash).toString('hex');
    const shard = hex.slice(0, 2);
    const shardDir = path.join(this.casDir, shard);
    fs.mkdirSync(shardDir, { recursive: true });

    const filePath = path.join(shardDir, `${hex}.cbor`);
    if (!fs.existsSync(filePath)) {
      // NOTE: no fsync here — CAS writes are best-effort durable in v1.
      // The WAL fsync can make a segment durable while this CAS file is still
      // only in the OS page cache (not yet on disk). A crash in that window
      // leaves the WAL record referencing a missing CAS key. Tracked in #59.
      fs.writeFileSync(filePath, bytes);
    }
    return hash;
  }

  /**
   * Retrieve bytes by BLAKE3 hash. Returns null on CAS_MISS.
   */
  get(hash: Blake3Hash): Uint8Array | null {
    const hex  = Buffer.from(hash).toString('hex');
    const filePath = path.join(this.casDir, hex.slice(0, 2), `${hex}.cbor`);
    try {
      const buf = fs.readFileSync(filePath);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  /** Absolute path for a given hash key — useful for test assertions. */
  filePath(hash: Blake3Hash): string {
    const hex = Buffer.from(hash).toString('hex');
    return path.join(this.casDir, hex.slice(0, 2), `${hex}.cbor`);
  }
}
