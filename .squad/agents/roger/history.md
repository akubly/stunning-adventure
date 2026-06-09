


📌 2026-06-09: **PR #58 Copilot review cycle-6 addressed** — 5 threads (comment/doc polish + one refactor) resolved in commit `3f4fad3`. Thread 1 (`hook-veto.test.ts`): fixed `// 50 µs` → `// 50ms` (50_000µs = 50ms, not 50µs). Thread 2 (`hook-bus.ts` header): replaced "open question pending Aaron's ruling" with "locked, Aaron ruling Option A — Ledger-layer pre-stage gate". Thread 3 (`hook-bus.ts` HookVerdict VETO JSDoc): removed `⚠ PROVISIONAL` / "Pending Aaron's ruling" — now describes VETO as locked with structural enforcement via `Exclude<HookVerdict,'VETO'>`. Thread 4 (`ledger.ts` WAL mapping comment): COMMIT → hookVerdict no longer claims a distinct `null` for "no predicate matched"; notes that no-match and explicit COMMIT encode identically today and the distinction is deferred to #57. Thread 5 (`ledger-impl.ts` append refactor): collapsed double VETO check (explicit `verdict==='VETO'` + unreachable `!isNonVeto`) into a single `if (!isNonVeto(result)) throw` — behavior identical, redundant branch removed. hook-veto.test.ts still passes. Build ✅, lint ✅, **86/86 tests** ✅ (total unchanged). — Roger

📌 2026-06-09: **PR #58 Copilot review cycle-5 addressed** — 2 threads (§3.2.1 CAS_MISS on replay) resolved in commit `412a415`. Added `CasMissError` class to `wal-backend-fs.ts`; `replayFromSegments` now throws `CasMissError` (with hash hex + WAL offset in message) instead of silently substituting `null` payload (Thread 1) or `[]` causalReadSet (Thread 2) when a CAS blob is absent. Zero-hash readSetHash still legitimately yields an empty readSet (no throw). Extended `writeCorruptSession` helper with `omitPayloadCas`/`omitReadSetCas` flags. RED→GREEN tests: Group3-1, Group3-2 (both throw-tests), Group3-3 sanity (zero-hash, no throw). Updated "tampered segment byte" test: corrupted payloadHash now triggers `CasMissError` on reopen (stricter than verifyChain). Build ✅, lint ✅, **86/86 tests** ✅. — Roger

📌 2026-06-09: **PR #58 Copilot review cycle-4 addressed** — 8 threads resolved in commit `a86081c`. Group 1 (timestampNs monotonicity, §3.10): added `nowNs?: () => bigint` clock seam to both `FileSystemWalBackendOptions` and new `InMemoryWalBackendOptions`; added `lastTimestampNs: bigint` field to both backends; each row's `timestampNs = max(nowNs(), lastTimestampNs)` — clamped floor prevents backward drift. FS backend also seeds `lastTimestampNs` from replayed records on reopen so post-reopen writes can't regress below pre-close timestamps. RED tests (CL-7 × 3) cover InMemory clock regression, FS clock regression, and FS reopen seeding — all designed to fail against the unclamped impl. Group 2 (replay validation): added `CorruptSegmentError` export to `wal-backend-fs.ts`; `replayFromSegments` now validates decoded `envelopeCbor` against `VALID_PRIMITIVE_KINDS` set and validates every `causalReadSet` element is a string — throws `CorruptSegmentError` on either violation. RED tests (Group2 × 2) use `writeCorruptSession` helper to craft minimal corrupt segments directly via codec internals. Group 3 (CAS header doc): `cas-fs.ts` file-header no longer claims the §3.2 fsync strategy prevents non-durable CAS references; updated to "CAS files are NOT fsynced in v1 — deferred; tracked in #59". Group 4 (CI matrix): `node-version: [20, 22]` → `[20.19.0, 22]` — pins the minimum to the actual floor from the engines bump. Build ✅, lint ✅, **83/83 tests** ✅ (78 → 83: +3 CL-7, +2 Group2). — Roger

📌 2026-06-08: **PR #58 Copilot review cycle-3 addressed** — 4 threads resolved in commit `bca1e7d`. T1 (session-scoped manifest, correctness): moved `manifest.json` from `<rootDir>/meta/manifest.json` (shared → cross-session contamination) to `<rootDir>/wal/sessions/<sessionId>/manifest.json` (per-session). RED test first: two-session isolation test verified the old shared-manifest implementation fails (manifest not found at session path), then GREEN. Updated existing tests in `wal-backend-file.test.ts` and `wal-group-commit.test.ts` that hard-coded the old `meta/` path. Updated §3.2 layout diagram in `03-l1-wal-substrate.md`. T2 (short-write guard): replaced bare `fs.writeSync(segFd, buf)` in segment record writes with a loop-until-complete (same pattern as PID lock write in `acquireWriteLock`). No behavioral change under normal conditions; guards against partial writes on slow filesystems. T3 (codec recordLen validation): added `InvalidRecordLengthError` class to `codec.ts`; RED tests first (both failed — existing code threw `RangeError` or nothing); added explicit validation in `decodeRecord()` for recordLen < minimum framing (156) and recordLen + 4 > buf.length. T4 (doc): updated `payloadHash`/`readSetHash` comments in `types.ts` from "BLAKE3(CBOR(...))" to "BLAKE3(JSON UTF-8 bytes of ...)" with "canonical CBOR hashing deferred — tracked in #60". Build ✅, lint ✅ (0 warnings), **78/78 tests** ✅ (75 original + 3 new: 1 T1 isolation, 2 T3 codec). — Roger

📌 2026-06-08: **PR #58 Copilot review cycle-2 threads 3+5 addressed** — Aaron ruled Option A on the Node-engine decision. Thread 5: bumped `engines.node` from `>=20.0.0` to `>=20.19.0` in root `package.json` and all 4 workspace packages that declared it (`cairn`, `crucible-cli`, `crucible-core`, `eureka`); ran `npm install` — `package-lock.json` updated. Thread 3: rewrote `hash.ts` comment from ambiguous "Node16 ESM compatible" to "ESM compatible (NodeNext/Node16 module resolution)" + explicit "Requires Node.js >=20.19.0". CI matrix stays `[20, 22]` — setup-node@v4 resolves `20` to latest 20.x (>=20.19), already satisfies the new floor. Build ✅, lint ✅, 75/75 tests ✅. Commit `0a09dd6`. — Roger

📌 2026-06-08: **PR #58 Copilot review cycle 2 addressed** — 3 of 5 new threads resolved in commit `31beaa6` (threads 1, 2, 4; threads 3 & 5 held pending Aaron's Node-engine decision — package.json and hash.ts untouched). Thread 1: `hook-bus.ts` `HookMetadata.source` JSDoc rewrote to "reserved seam field; not yet populated" — removed false claim that the §4.2 test pins it. Thread 2: `ledger-impl.ts` `append()` gained an inline comment that `metadata.source` is intentionally left unpopulated this slice (no RED test drives extraction). Thread 4: `cas-fs.ts` issue ref changed from `#56` (segment-fsync/manifest gap) to `#59` (CAS-fsync gap — dedicated issue Aaron is filing). Build ✅, lint ✅ (0 warnings), 75/75 tests ✅. — Roger

📌 2026-06-08: **PR #58 Copilot review addressed** — All 12 comments resolved in one commit (`246eec5`). Group A: untracked 5 gitignored runtime files (2× orchestration-log, 2× log, 1× scribe-health-report) from this branch; fixed `.gitignore` to also match health-report FILES (not just directories) — `git check-ignore -v` confirmed. Group B: repointed 4 inbox citations in `types.ts`, `hash.ts`, `ledger.ts`, `hook-bus.ts` from `.squad/decisions/inbox/…` to `.squad/decisions.md`. Group C: dropped the 0xFF no-verdict claim from `types.ts` hookVerdict comment (replaced with deferred-#57 note); added a Deferred (#57) callout block in `04-hook-bus.md` §4.1. Group D: rewrote CAS durability comment in `cas-fs.ts` to describe the true risk window (WAL fsync makes segment durable while CAS file may still be in page cache; no behavioral change; refs #56). Build ✅, lint ✅ (0 warnings), 75/75 tests ✅. — Roger — Two sub-cycles completed and GREEN. Fences deferred as spec'd: 64MiB roll-over, appendFenced, L1Subscriber/Router. Ready for squad/main merge pending other agents.

📌 2026-06-06: **WAL group-commit + seal-and-split GREEN (§3.5)** — 16 new RED→GREEN tests in two sub-cycles. Sub-cycle 1: `sealAndSplit` pure function (9 tests) — generic `sealAndSplit<T>(staged, verdicts)` walks left-to-right; COMMIT/OBSERVE join committed; PAUSE at i splits batch; first PAUSE wins; rows i+1..end go to restaged with `pauseBatchIndex`. Sub-cycle 2: group-commit backend (7 tests) — `commitRow()` stages to queue; `flush()` triggers one-fdatasync barrier per batch; `sealAndSplit` routes verdicts; PAUSE row committed with hookVerdict=0x02 (durable); restaged rows re-queue for next flush; atomic abort: close fd + `fs.truncateSync(path)` on Windows (ftruncateSync on O_APPEND fd unreliable); hash-chain root NOT advanced on abort; CAS orphans on abort are benign (content-addressed). `syncFn` injectable seam for spy/stub. `onPause` callback = L1Subscriber stub for future Router. Graham's locked `WalBackend` interface NOT touched (flush/close on concrete class only). Full suite 60/60 green. Deferred: 64MiB roll-over, appendFenced, full L1Subscriber. — Roger



📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.
# SUMMARY (as of 2026-06-01)

File size: 103960 bytes. See history-archive.md for earlier entries.

---

## 2026-06-06: Crucible Walkthrough B GREEN — WAL Substrate + Ledger Seam Implementation

📌 **Roger:** Implemented Walkthrough B GREEN for WAL substrate + Ledger pre-stage hook gate. Seam-first parallelization: built sub-seam internals (hash-chain BLAKE3, CAS, codec v0.1) in parallel with Graham's seam lock. Once Aaron ruled VETO (Option A), integrated the four-step protocol at Ledger.append. Result: hash-chain 9 tests, wal-codec 12 tests, wal-cas 4 tests, ledger impl 1 acceptance test (hook-veto). Total: 28/28 green. Key: lazy-load better-sqlite3 native module, return snapshot copy from getOwnEvents.

**Prefer domain types over `unknown[]` in port interfaces.** `DB.queryEvents` was typed `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly. Port interfaces are contracts — they should reflect the actual domain type, not a widening escape hatch. When the impl already returns the right type, the fix is purely additive and compile-safe.

**Trailing-slash gitignore patterns match directories only (recurring lesson).** `.squad/health-report-*/` silently fails to ignore health-report *files* — the trailing slash restricts matching to directories. The correct pattern is `.squad/health-report-*` (no slash). This is the same issue that bit us during the Sprint 0 recovery; it is now documented with a callout in the SKILL example so future agents don't repeat the mistake.

---

## 2026-06-07: WAL Substrate Cycle-2 Review Fix Wave (CURRENT_DATETIME: 2026-06-07T23:11:54-07:00)

Closed three residuals from the cycle-2 re-review.

**C2-I1 (contract test deepened):** Added `readVerdictByte(offset)` to `WalBackendHarness` (required for both impls). Added `readSegmentRecords(): SegmentRecord[]` to `InMemoryWalBackend` so it exposes the same introspection surface as `FileSystemWalBackend`. Strengthened CL-3 to assert persisted `hookVerdict` bytes (0x00/0x01/0x02) for all three verdicts on both backends — a mapping mis-match now fails. Added FS-only CL-6 block (`close+reopen durability`): writes COMMIT+PAUSE rows, closes, reopens read-only, asserts hookVerdict bytes survive. Total contract tests: 11 (5×InMemory + 5×FS shared + 1 FS-only CL-6).

**C2-I2 (PID write loop):** `acquireWriteLock` now loops `fs.writeSync(fd, pidBuf, written, remaining)` until all bytes of the PID are written before `closeSync`. Guards against short writes on slow/busy filesystems that could leave a truncated PID and trigger false stale-reclaim.

**C2-M1 (breaking note):** Added a `BREAKING (0.1.x pre-release)` comment to `LedgerFactoryOptions` in `ledger.ts` documenting that `sessionId` was intentionally removed in cycle-1 and pointing callers to `createFileSystemWalBackend`.

---

## 2026-06-08: WAL Substrate 2-Cycle Review COMPLETE

📌 **Scribe:** WAL Substrate + Walkthrough B 2-cycle persona review COMPLETE.

**Cycle 1 (Code Panel, 5 personas):**
- 13 findings (1 blocking / 8 important / 4 minor)
- B1: lock empty-file race — FIXED (commit b5b03dc)
- All 8 important findings accepted and fixed
- Result: 74/75 tests green

**Cycle 2 (Re-review, 3 personas):**
- 2 important / 1 minor, 0 blocking
- Contract suite hardened: verdict bytes + PAUSE-across-reopen assertions
- Lock PID write loop hardened against short-write
- sessionId removal documented
- Result: 75/75 tests green, lint clean, build clean

**Deferrals:** #56 (crash-durability/CAS fsync) and #57 (verdict encoding) filed and monitored.

**Branch ready for merge.** See decisions.md for full disposition table and commit history.

**Result:** 75/75 tests green (74 from cycle-1 + 1 new CL-6). Build clean. Lint 0 errors. #56 and #57 NOT touched.


Addressed 11 findings (B1, I1, I3, I4, I5, I6, M1, M2, M3, M4) from the 5-persona Code Panel review of the WAL substrate + Walkthrough B.  Two findings (#56 crash-durability, #57 verdict no-match encoding) remain deferred as per Aaron's direction.

**B1 (lock empty-file race):** Fixed `acquireWriteLock` to write PID through the wx fd via `fs.writeSync(fd, String(process.pid))` before `closeSync`; removed the subsequent `writeFileSync`.  RED test: spy intercepts `closeSync` and asserts lock file is non-empty at that moment (was empty before fix).

**I1 (readOnly guard):** Added `ReadOnlyWalBackendError` class; `commitRow()` throws immediately when `isReadOnly=true`.  RED tests: one for commitRow rejection, one for flush() no-op on empty queue.

**I3 (seam type):** `LedgerImpl` constructor retype from concrete `PreCommitHookBus` to `HookBusPort` interface.  Pure type change; factory still constructs `PreCommitHookBus`.

**I4 (aliased hash views):** `decodeRecord` now calls `.slice()` on all four 32-byte hash fields (prevRoot, selfRoot, payloadHash, readSetHash) to return owned copies.  RED test: mutates source buffer after decode, asserts decoded hashes unchanged.

**I5 (encodeFlags duplication):** Extracted `encodeFlags` to `wal/flags.ts`; imported in `codec.ts` and `hash-chain.ts`.  Pure refactor, no test needed.

**I6 (contract test):** Added `wal-backend.contract.test.ts` with `runWalBackendContract(implName, makeHarness)` pattern.  5 invariants (CL-1 round-trip, CL-2 offset monotonicity, CL-3 verdict→offset, CL-4 range semantics, CL-5 PAUSE durability) run against both `InMemoryWalBackend` and `FileSystemWalBackend` = 10 new tests.

**M1 (lint):** Removed unused `FileSystemWalBackend` type imports from `wal-backend-file.test.ts` and `wal-group-commit.test.ts`.

**M2 (CAS fsync):** Honest comment in `cas-fs.ts` acknowledging no-fsync gap; no behavior change.

**M3 (VERDICT_TO_WAL):** Moved to `wal/types.ts`; both backends import from there.  Key type uses `Record<'COMMIT'|'OBSERVE'|'PAUSE', number>` to stay dep-clean from parent ledger layer.

**M4 (sessionId/export):** Dropped unused `sessionId` field from `LedgerFactoryOptions` (no test or caller referenced it; rootDir contract not yet established).  Exported `createFileSystemWalBackend`, `WriteLockHeldError`, `ReadOnlyWalBackendError`, `FileSystemWalBackendOptions` from `index.ts`.

**Result:** 74/74 tests green (60 original + 14 new).  Build clean.  Lint zero errors.  #56 and #57 NOT touched.

