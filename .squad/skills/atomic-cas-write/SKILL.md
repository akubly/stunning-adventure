# Skill: Atomic CAS Write (Temp-File + Rename)

**Owner:** Roger  
**Version:** 2.0  
**Last updated:** 2026-06-11  
**Applies to:** FileSystemCas in `packages/crucible-core/src/ledger/wal/cas-fs.ts`

---

## Problem

A content-addressed store (CAS) that uses `existsSync(filePath)` for dedup is vulnerable to a
**torn-blob cross-session race**. A shared `.tmp` filename is vulnerable to a **concurrent
same-hash writer clobber race**: two sessions writing the same hash simultaneously can interleave
their writes to the same `.tmp` path, producing corrupt bytes before either renames it.

---

## Solution: Unique Temp Name + Atomic Rename + EEXIST-as-success

```
put()     → write bytes to <hash>-<pid>-<n>.cbor.tmp  (unique per call — no clobber race)
             → add finalPath → tmpPath to pendingSync Map

syncAll() → for each (finalPath, tmpPath):
               open tmpPath, syncFn(fd), close
               try: fs.renameSync(tmpPath, finalPath)
               on EEXIST: unlink tmpPath (concurrent writer already landed it — identical bytes)
               fsync shard directory (Linux/ext4 dir-entry durability)
               pendingSync.delete(finalPath)
           → on ANY throw: pendingSync.clear()  ← I4: prevents stale carryover
```

Key properties:
1. **Unique temp name** (`<hash>-<pid>-<counter>.cbor.tmp`) — concurrent writers never clobber
2. **EEXIST = success** — content-addressed means any writer that won the rename has identical bytes
3. **Shard dir fsync** — makes dir entry durable on Linux ext4; no-op on Windows (NTFS sync on rename)
4. **pendingSync.clear() on abort** — next batch starts clean; no stale carryover

---

## Unique Temp Name Pattern

```typescript
let tmpCounter = 0;

// In put():
const tmpPath = path.join(shardDir,
  `${hex}-${process.pid}-${++tmpCounter}.cbor.tmp`);
fs.writeFileSync(tmpPath, bytes);
this.pendingSync.set(finalPath, tmpPath);
```

---

## Shard Directory fsync (Linux durability)

After rename, the directory entry must be fsynced to be durable on ext4 ordered mode.
Skip on Windows because NTFS writes dir entries synchronously during rename.

```typescript
if (process.platform !== 'win32') {
  const dirFd = fs.openSync(path.dirname(finalPath), 'r');
  try { syncFn(dirFd); } finally { fs.closeSync(dirFd); }
}
```

---

## Stale pendingSync Clearing (I4)

Without clearing on abort, failed batches leave stale temp entries that get re-synced
in the next batch — causing incorrect sync-call counts and orphan blob races.

```typescript
syncAll(syncFn: (fd: number) => void): void {
  try {
    for (const [finalPath, tmpPath] of [...this.pendingSync]) {
      // ... sync + rename ...
      this.pendingSync.delete(finalPath);
    }
  } catch (err) {
    this.pendingSync.clear();  // ← critical: next batch starts clean
    throw err;
  }
}
```

---

## Windows Notes

`fs.renameSync(src, dst)` in Node.js/libuv on Windows calls
`MoveFileExW(src, dst, MOVEFILE_REPLACE_EXISTING)`, which atomically replaces the destination.
Both `.tmp` and `.cbor` files are always under `<casDir>/<shard>/` — same volume, no failure.

---

## Test Pattern

```typescript
// TORN-1: torn blob replaced with correct content
fs.writeFileSync(casFilePath, new Uint8Array([0xDE, 0xAD]));
await backend2.commitRow(/* same payload */);
const expectedBytes = encodeCbor({ tag: 'original' });
expect(Buffer.from(fs.readFileSync(casFilePath)).toString('hex'))
  .toBe(Buffer.from(expectedBytes).toString('hex'));  // exact content, not just length

// CAS-F7: no stale pendingSync after mid-iteration abort
// Arm failure on CAS sync call, commit, assert third batch has exactly 2 syncs (not >2)
```

---

## References

- `packages/crucible-core/src/ledger/wal/cas-fs.ts`
- `packages/crucible-core/src/__tests__/unit/wal-cas-fsync.test.ts` — TORN-1, CAS-F7
- `.squad/decisions/inbox/roger-crucible-wal-correctness-s1-remediation.md`
- Issues #68 (torn-blob), #59 (CAS-before-segment ordering)
