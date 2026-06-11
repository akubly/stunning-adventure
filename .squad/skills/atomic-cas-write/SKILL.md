# Skill: Atomic CAS Write (Temp-File + Rename)

**Owner:** Roger  
**Version:** 1.0  
**Last updated:** 2026-06-10  
**Applies to:** FileSystemCas in `packages/crucible-core/src/ledger/wal/cas-fs.ts`

---

## Problem

A content-addressed store (CAS) that uses `existsSync(filePath)` for dedup is vulnerable to a
**torn-blob cross-session race**:

1. Session A writes `<hash>.cbor` via `writeFileSync` (no fsync), then crashes before `syncAll()`.
2. The file is present on disk but may be partial / corrupt.
3. Session B calls `put()` with the same hash. `existsSync` returns `true` → skips rewrite +
   skips `pendingSync.add`. Session B's group-commit then makes a WAL record durable that
   references the torn CAS blob → `CasMissError` or data corruption on next reopen.

## Solution: Temp-File + Atomic Rename

```
put()     → write bytes to <hash>.cbor.tmp (always, no existsSync)
            → add finalPath → tmpPath to pendingSync Map
syncAll() → for each (finalPath, tmpPath):
              open tmpPath, syncFn(fd), close
              fs.renameSync(tmpPath, finalPath)
              pendingSync.delete(finalPath)
```

The final file `<hash>.cbor` is **either absent or complete**. A torn `.tmp` file in a crashed
session is harmless — the corresponding `.cbor` was never renamed into place, so no WAL record
references it.

## Windows Notes

`fs.renameSync(src, dst)` in Node.js/libuv on Windows calls
`MoveFileExW(src, dst, MOVEFILE_REPLACE_EXISTING)`, which atomically replaces the destination
within the same filesystem volume. This is the correct behavior; no special casing needed.

If `src` and `dst` are on different volumes, `MoveFileExW` fails. This cannot happen here
because both `.tmp` and `.cbor` files are always under `<casDir>/<shard>/`.

## Data Structure

Change `pendingSync` from `Set<string>` to `Map<string, string>`:

```typescript
// key = finalPath (<hash>.cbor), value = tmpPath (<hash>.cbor.tmp)
private readonly pendingSync = new Map<string, string>();
```

Using a Map supports dedup within a batch: if `put()` is called twice with the same hash
(same `finalPath`), the second call overwrites the `.tmp` file and updates the Map entry.
`syncAll()` sees only one entry → one CAS sync per unique hash.

## CAS-F6 Behavior Change

After this fix, the "already-persisted CAS blob not re-synced" optimization no longer applies.
A second batch with the same payload WILL incur a CAS sync (`.tmp` written + renamed). This
is intentional: correctness over throughput. CAS-F6 expectation updates to `secondBatchSyncs === 2`.

## Test Pattern

```typescript
// Simulate torn blob, then assert recovery:
const backend1 = await createFileSystemWalBackend(rootDir, sessionId);
await backend1.commitRow(...);
await backend1.close();
// Corrupt the CAS file to simulate a torn prior-session write:
fs.writeFileSync(casFilePath, new Uint8Array([0xDE, 0xAD])); // 2 bytes, clearly wrong
// New session with same payload — must recover:
const backend2 = await createFileSystemWalBackend(rootDir, sessionId2);
await backend2.commitRow(/* same payload */);
await backend2.close();
// CAS blob must now have correct full content (not the 2-byte torn junk):
expect(fs.readFileSync(casFilePath).length).toBeGreaterThan(2);
```

## References

- `packages/crucible-core/src/ledger/wal/cas-fs.ts` — implementation
- `packages/crucible-core/src/__tests__/unit/wal-cas-fsync.test.ts` — TORN-1 test
- `.squad/decisions/inbox/roger-crucible-wal-correctness-s1.md` — D-CAS-1 decision
- Issue #68 — original bug report
