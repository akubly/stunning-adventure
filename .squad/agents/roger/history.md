
**#68 (CAS atomic write):** `FileSystemCas.put()` now always writes to `<hash>.cbor.tmp` (no existsSync skip); `syncAll()` fsyncs the .tmp then `fs.renameSync` to `<hash>.cbor` (atomic replace — libuv uses `MoveFileExW MOVEFILE_REPLACE_EXISTING` on Windows). Final CAS file is always either absent or complete — no torn-blob dedup vulnerability. CAS-F6 expectation updated (no longer skip-dedup optimization). TORN-1 test simulates a torn blob and asserts recovery.

**Key paths:** `wal/types.ts`, `wal/cbor.ts` (new), `wal/cas-fs.ts`, `wal-backend-in-memory.ts`, `wal-backend-fs.ts`.

**Final:** 136 tests, all green. Build clean.

