# Roger — History Archive (Pre-2026-06-07)



---

**Trailing-slash gitignore patterns match directories only (recurring lesson).** `.squad/health-report-*/` silently fails to ignore health-report *files* — the trailing slash restricts matching to directories. The correct pattern is `.squad/health-report-*` (no slash). This is the same issue that bit us during the Sprint 0 recovery; it is now documented with a callout in the SKILL example so future agents don't repeat the mistake.

**Prefer domain types over `unknown[]` in port interfaces.** `DB.queryEvents` was typed `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly. Port interfaces are contracts — they should reflect the actual domain type, not a widening escape hatch. When the impl already returns the right type, the fix is purely additive and compile-safe.

📌 **Roger:** Implemented Walkthrough B GREEN for WAL substrate + Ledger pre-stage hook gate. Seam-first parallelization: built sub-seam internals (hash-chain BLAKE3, CAS, codec v0.1) in parallel with Graham's seam lock. Once Aaron ruled VETO (Option A), integrated the four-step protocol at Ledger.append. Result: hash-chain 9 tests, wal-codec 12 tests, wal-cas 4 tests, ledger impl 1 acceptance test (hook-veto). Total: 28/28 green. Key: lazy-load better-sqlite3 native module, return snapshot copy from getOwnEvents.

## 2026-06-06: Crucible Walkthrough B GREEN — WAL Substrate + Ledger Seam Implementation

---

File size: 103960 bytes. See history-archive.md for earlier entries.

# SUMMARY (as of 2026-06-01)
**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
**Commits shipped:**

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

---

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe



📌 2026-06-06: **WAL group-commit + seal-and-split GREEN (§3.5)** — 16 new RED→GREEN tests in two sub-cycles. Sub-cycle 1: `sealAndSplit` pure function (9 tests) — generic `sealAndSplit<T>(staged, verdicts)` walks left-to-right; COMMIT/OBSERVE join committed; PAUSE at i splits batch; first PAUSE wins; rows i+1..end go to restaged with `pauseBatchIndex`. Sub-cycle 2: group-commit backend (7 tests) — `commitRow()` stages to queue; `flush()` triggers one-fdatasync barrier per batch; `sealAndSplit` routes verdicts; PAUSE row committed with hookVerdict=0x02 (durable); restaged rows re-queue for next flush; atomic abort: close fd + `fs.truncateSync(path)` on Windows (ftruncateSync on O_APPEND fd unreliable); hash-chain root NOT advanced on abort; CAS orphans on abort are benign (content-addressed). `syncFn` injectable seam for spy/stub. `onPause` callback = L1Subscriber stub for future Router. Graham's locked `WalBackend` interface NOT touched (flush/close on concrete class only). Full suite 60/60 green. Deferred: 64MiB roll-over, appendFenced, full L1Subscriber. — Roger

📌 2026-06-07: **§3.5 group-commit + seal-and-split landed** — Two sub-cycles completed and GREEN. Fences deferred as spec'd: 64MiB roll-over, appendFenced, L1Subscriber/Router. Ready for squad/main merge pending other agents.


- 2026-06-06 📌 roger: WAL single-writer lock + PID-liveness stale-lock landed; issue #55 tracks OS-lock reconsideration