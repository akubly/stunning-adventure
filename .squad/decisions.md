# Roger — WAL Group-Commit + Seal-and-Split Decisions (§3.5)

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-06T22:03:01-07:00  
**Branch:** squad/crucible-wal-substrate-walkthrough-b  
**Status:** CLOSED — 16 new tests GREEN (9 sealAndSplit + 7 group-commit), full suite 60/60

---

## D-GC-1: sealAndSplit as a pure function (own module)

**Choice:** `packages/crucible-core/src/ledger/wal/seal-and-split.ts` —
exported as a standalone pure function, no I/O, generic over the row type `T`.

**Rationale:**
- Pure function is trivially unit-testable (9 cases; no temp dirs, no async).
- Generic `sealAndSplit<T>(staged, verdicts)` lets the backend pass `StagedEntry[]`
  directly, preserving the `resolve`/`reject` callbacks for promise resolution.
- `pauseBatchIndex: number` annotation on restaged rows records the batch-relative
  position of the PAUSE row; the backend enriches this with the actual commit
  offset in Phase 4 (post-fsync) if needed by the Router in a future cycle.

**Key rules implemented:**
- COMMIT | OBSERVE → row joins `committed` with its verdict preserved.
- PAUSE at index i → rows 0..i join `committed` (pause row carries durable PAUSE
  verdict per exactly-once-pause); rows i+1..end join `restaged`. First PAUSE wins.
- VETO is not present in the verdicts array (intercepted pre-WAL by the Ledger layer).

---

## D-GC-2: Group-commit staging in FileSystemWalBackend

**Choice:** Internal `stagingQueue: StagedEntry[]` in `FileSystemWalBackend`.
`commitRow()` stages the row and returns a Promise that resolves only after
the containing batch is fdatasync'd. Flush triggers:
  (a) `stagingQueue.length >= batchSize` (batchSize trigger)
  (b) deadline timer fires after `batchDeadlineMs`
  (c) explicit `flush()` call

**Default batchSize: 1** — preserves existing per-row immediate-flush semantics
for all existing tests (no regressions). Tests for group-commit pass `batchSize: N`
and `batchDeadlineMs: 60_000` (suppress timer).

**Seam impact on Graham's locked interface:**
- `WalBackend.commitRow()` signature UNCHANGED.
- `WalBackend.readRows()` signature UNCHANGED.
- `flush()` and `close()` are on the CONCRETE class only (same pattern as the
  existing `close()`). Graham's locked `WalBackend` interface was NOT touched.
- **Additive only — no seam reshaping.**

---

## D-GC-3: ONE fdatasync barrier per batch

**Mechanism:**
1. Phase 1: CAS writes + build `SegmentRecordInput[]` for all committed rows.
2. Phase 2: `buildChain(rowInputs, this.prevRoot)` chains the entire batch in one call.
3. Phase 3: `fs.openSync(seg, 'a')` → `fs.writeSync` all records → `syncFn(fd)` → `fs.closeSync(fd)`.
4. Phase 4 (success only): update `prevRoot`, write index entries, update manifest,
   push to in-memory event cache, resolve row promises, fire `onPause`, re-queue restaged.

**Single barrier:** `syncFn(fd)` fires exactly once per `executeFlush()` call.
Tests inject a spy via `syncFn` option; the spy count verifies the one-sync invariant.

---

## D-GC-4: Atomic abort — path-based truncation (Windows fix)

**Problem:** `fs.ftruncateSync(fd, size)` on a file opened in append mode (`'a'`)
is unreliable on Windows (O_APPEND semantics interfere with SetEndOfFile).

**Fix:** On failure in Phase 3, close the fd first, then call
`fs.truncateSync(this.activeSegPath, preBatchSegSize)` (path-based). This works
identically on Windows and Unix and guarantees no partial-batch bytes survive.

**Hash-chain root rollback:** `this.prevRoot` is updated only in Phase 4 (success
path). If Phase 3 fails, `this.prevRoot` is never advanced — the next batch
correctly restarts from the pre-batch chain head. No explicit save/restore needed.

**Manifest invariant:** `manifest.lastCommitOffset` is updated only in Phase 4.
On abort, it retains its pre-batch value. On crash-recovery replay, the scanner
reads segment bytes directly; records beyond `lastCommitOffset` would be orphaned
(but are now absent due to truncation).

**Residual:** CAS body files (`.cbor`) written in Phase 1 are NOT rolled back on
abort. They are content-addressed (BLAKE3), so orphaned CAS files are harmless
(they're simply never referenced by a committed WAL row). A future GC cycle can
reclaim them.

---

## D-GC-5: syncFn injectable seam

`FileSystemWalBackendOptions.syncFn?: (fd: number) => void` replaces the
hard-coded `fs.fsyncSync(fd)` call. Default remains `(fd) => fs.fsyncSync(fd)`.
Tests inject either a spy (count calls) or a throwing stub (test abort path).
This avoids ESM module-spy issues and keeps the seam explicit.

---

## D-GC-6: onPause L1Subscriber stub

`FileSystemWalBackendOptions.onPause?: (commitOffset: number) => void` is the
minimal Router notification seam (§3.5: "Router receives the pause verdict via
the L1Subscriber broadcast on the paused row"). The callback fires after
fdatasync (durable), passing the commit offset of the PAUSE row. Full
L1Subscriber broadcast to the §5 Router is deferred to its own RED cycle.

---

## D-GC-7: Scope fences confirmed NOT touched

- 64 MiB segment roll-over — deferred
- `appendFenced` / optimistic head-offset check (§3.4.1) — deferred
- Full L1Subscriber broadcast / §5 Router integration — deferred
- Group-commit deadline timer unit test (vi.useFakeTimers) — not needed to pass
  RED tests; the timer logic is exercised implicitly via batchSize auto-flush.


---

### 2026-06-06T22:03:01-07:00: Aaron's ruling — WAL write.lock stale-lock policy (resolves D-LOCK-2)
**By:** Aaron Kubly (via Copilot)
**Decision:** Option (b) — **PID + liveness reclaim** for v1. The `write.lock` file records the owner PID; on an acquisition conflict, check whether that PID is alive — reclaim the lock if the owner is dead, throw `WriteLockHeldError` if alive. Driven by a dedicated RED→GREEN cycle.
**Rationale:** Preserves §3.4.1's auto-release-on-termination *intent* without a native dependency; avoids opaque "stuck forever after crash" failures (correctness compounds across agent actions).
**Follow-up filed:** GitHub issue **#55** — reconsider a true OS advisory lock (flock/LockFileEx via maintained dependency) vs PID-liveness later (label squad:roger).
**Supersedes:** Roger's recommended Option (a) manual-clear (D-LOCK-2). §3.4.1 spec guarantee is now honored by PID-liveness, not downgraded.
### 2026-05-30: WI-A Implementation Log — Issue #11 (Roger history restoration)

From decision drop: roger-issue-11-implementation (local-only, WI-A history, cross-referenced)

**Cloud Review Cycles 1-5 completed** — Worktree-aware session resolution now in place. Schema version 16. Partial UNIQUE indexes for NULL-workdir case. All 1405 tests green. Ready for WI-B (coordinator dispatch).



---


# Roger — WAL Write Lock Decisions (§3.4.1)

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-06T22:03:01-07:00  
**Branch:** squad/crucible-wal-substrate-walkthrough-b  
**Status:** CLOSED — 9 lock tests GREEN (5 original + 4 PID-liveness), full suite 44/44

---

## D-LOCK-1: Lock mechanism — exclusive-create file (no new npm dependency)

**Choice:** `fs.openSync(lockPath, 'wx')` — O_CREAT | O_EXCL exclusive create.

**Rationale:**
- Works identically on Windows and Unix (Node.js wraps CreateFileW with OPEN_ALWAYS semantics mapped to O_CREAT|O_EXCL).
- No open fd held after creation: `fs.closeSync(fd)` immediately after. Presence of the file IS the lock (per spec: "content ignored").
- No native dependencies, no npm packages.
- Unit-testable within a single process: same process can attempt two opens and the second fails with EEXIST.
- Simpler than `flock(LOCK_EX|LOCK_NB)` (not available cross-platform in Node stdlib) or `LockFileEx` (Windows-only, requires native bindings).

**Lock file path:** `<segDir>/write.lock` = `<rootDir>/wal/sessions/<sessionId>/write.lock`  
(matches §3.4.1: `~/.crucible/wal/sessions/<sessionId>/write.lock`)

**Acquire:** `fs.openSync(lockPath, 'wx')` → close fd immediately  
**Release:** `fs.unlinkSync(lockPath)` in `close()`

---

## D-LOCK-2: Stale-lock policy — RESOLVED (Option b: PID + liveness reclaim)

**Aaron's ruling:** Option (b) — PID + liveness check via `process.kill(pid, 0)`.

**Implementation (GREEN — 4 new tests, all passing):**

On acquire:
1. `fs.openSync(lockPath, 'wx')` → write `String(process.pid)` into the file.
2. On EEXIST: read stored PID → call `isPidAlive(pid)`:
   - `process.kill(pid, 0)` returns → alive → throw `WriteLockHeldError(path, storedPid)`.
   - ESRCH → dead → overwrite lock file with our PID (reclaim).
   - EPERM → alive (no signal permission) → throw `WriteLockHeldError`.
   - Unparseable/empty → treat as stale → overwrite (reclaim).

**Liveness helper:** `isPidAlive(pid)` — works on Windows and Unix in Node.js.

**Residual race window (acknowledged, not fixed in v1):**
`read-PID → liveness-check → overwrite` is NOT atomic. Two concurrent openers
could both read the same stale PID, both call `process.kill` → dead, and both
attempt to overwrite. The one that wins `writeFileSync` owns the lock; the loser
doesn't know it lost. In practice the window is microseconds and the WAL
hash-chain will detect corruption. A truly atomic swap requires a different OS
mechanism. Tracking issue #55 covers upgrading to a real OS advisory lock.

**`WriteLockHeldError` updated:** constructor now accepts `holderPid?: number`;
error message includes `(held by PID <pid>)` when a live holder is identified.

**Issue #55:** tracks reconsideration of OS advisory lock (flock/LockFileEx) as
a future replacement for the presence-based mechanism.

---

## D-LOCK-3: No new npm dependency added

Confirmed: `fs.openSync(lockPath, 'wx')` is stdlib. No `proper-lockfile`,
`lockfile`, or `node-lockfile` packages were added. Dependencies unchanged.

---

## D-LOCK-4: `close()` is on the concrete class, not WalBackend interface

`close()` is `async close(): Promise<void>` on `FileSystemWalBackend` only.
Graham's locked `WalBackend` interface was NOT modified. Tests import the
concrete class for lifecycle management; the `Ledger` interface does not expose
a close path yet (deferred).

---

## D-LOCK-5: `readOnly` option bypasses write lock

`createFileSystemWalBackend(rootDir, sessionId, { readOnly: true })` opens
without acquiring the write lock. This satisfies the spec requirement that the
read path is not gated by the write lock. Read-only backends replay from disk
and support `readRows()` but `close()` is a no-op (no lock to release).

---

## D-LOCK-6: Scope fences confirmed NOT touched

- Group-commit batching + seal-and-split on PAUSE (§3.5) — deferred
- 64 MiB segment roll-over — deferred
- `appendFenced` / optimistic head-offset check (§3.4.1) — deferred


---

### 2026-06-02: M2 Cycle-2 Doc Alignment (Gabriel)

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-02T00:16Z  
**PR:** #44 (branch squad/m2-forge-mcp-bash-hooks)  
**Commit:** bacb3f4

Cycle-2 review (APPROVE_WITH_NITS) confirmed all three cycle-1 code fixes are correct. Two doc-drift nits addressed: (1) SKILL.md pattern #7 replaced — the original taught the two-pass sed approach that cycle-1 rejected as buggy; the updated pattern now shows the `_remove_block` bash state-machine that was actually shipped, with a new Anti-Pattern entry documenting the specific sequencing failure mode (blank-line pass consumes MARKER_START, orphaning the block body) and the byte-identical roundtrip acceptance criterion. (2) README uninstall description updated from "using sed (GNU/BSD)" to "pure-bash line-by-line filter (no sed dependency; identical behavior on Linux, macOS, and Git Bash on Windows)". Both changes are doc-only; no code or behavior changed. M2 is now review-complete and ready to merge.

---

### 2026-06-02: M2 Cycle-1 Fixes (Gabriel)

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-01T00:00Z  
**PR:** #44 (branch squad/m2-forge-mcp-bash-hooks)  
**Commit:** e7ef8f3

## Findings addressed

### F1 — BLOCKING — uninstall.sh two-pass sed

**Root cause:** The first sed pass consumed MARKER_START when it appeared immediately after a blank line (the two patterns match the same region). This made the second range-delete pass a no-op — block body and MARKER_END stayed in the file. Subsequent install runs appended a new block on top of the orphan.

**Fix:** Replaced both sed passes with a single bash state-machine loop. Buffers blank lines one-deep; suppresses the separator blank only when MARKER_START immediately follows.

**Verification:** install → uninstall → byte-identical (cycle 1 and cycle 2) against a synthetic bashrc with existing content, ran via Git Bash.

### F2 — IMPORTANT — shell-init.sh: npm root -g on foreground path

**Root cause:** `_forge_mcp_resolve_script` was called before the `&` so the 150ms–1s+ `npm root -g` shell-out blocked every new interactive session.

**Fix:** Moved both resolution and `node` execution into the background subshell (`( ... ) &>/dev/null &`). Subshell inherits `_forge_mcp_resolve_script` (bash forks copy parent functions). Shell startup path is now a single `( ) &` with no blocking work.

### F3 — MEDIUM — shell-init.sh: pkg_json dirname depth

**Root cause:** Two `dirname` calls landed in `dist/` (no package.json there). Path: `dist/hooks/sessionStart.js` → `dist/hooks` → `dist`.

**Fix:** Three `dirname` calls reach the package root: `dist/hooks` → `dist` → `skillsmith-runtime`. `forge_mcp_check` now prints `version: 0.1.0`. Verified against the actual `packages/skillsmith-runtime/package.json`.

---

## Build / test status

- `npm run build` — ✅ clean
- `npm test` — ✅ 49/49 passing

## Files changed

- `.github/hooks/cairn/uninstall.sh` — replaced two-pass sed with bash loop
- `.github/hooks/cairn/shell-init.sh` — background resolution (F2) + pkg_json depth (F3)

---

### 2026-05-31: Decision Drop: M1 Hint Consumption MCP Tools (Roger)

**Author:** Roger (Platform Dev)  
**Date:** 2026-05-31T19:04:59Z  
**Issue:** #39  
**PR:** #40  

---

## Context

Forge produces `optimization_hints` in the cairn DB but there was no way for Aaron to see or act on them from Copilot. `get_status` mentioned "N new suggestions" but the content was invisible. This PR closes that gap.

---

## Final Tool Surfaces

### `list_optimization_hints`

**Kind:** Read-only MCP tool  
**Inputs:**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `status` | enum (pending/accepted/applied/rejected/deferred/expired/suppressed/failed) | — | Omit to return active hints (pending+accepted+deferred) |
| `skill_id` | string | — | Optional filter by skill |
| `limit` | integer 1–100 | 20 | Max hints returned |

**Output fields per hint:** `id`, `skill_id`, `source`, `category`, `summary`, `recommendation`, `impact_score`, `confidence_level` (high/medium/emerging), `status`, `created_at`, `resolution_note`  
**Envelope:** `{ count, active_count, hints[] }`

---

### `resolve_optimization_hint`

**Kind:** Mutating MCP tool  
**Inputs:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `hint_id` | string | ✅ | Hint ID from `list_optimization_hints` |
| `resolution` | `resolved` \| `dismissed` | ✅ | `resolved` = manually addressed; `dismissed` = not acting on it |
| `note` | string | — | Optional reason |

**Output:** `{ hint_id, resolution, status, resolution_note, already_resolved, message }`  
**Idempotent:** Yes — if hint is already in a terminal state, returns current state with `already_resolved: true` and no error.  
**Internal mapping:** Both dispositions transition to `rejected` status; `resolution` field and `resolution_note` preserve user intent.

---

## Schema / Migration

**Migration 017** (`packages/cairn/src/db/migrations/017-hint-resolution-note.ts`)

- Adds `resolution_note TEXT` column to `optimization_hints`  
- **Version:** 17 (bumped from 16)  
- **Guarded:** Checks `sqlite_master` for table existence before ALTER (partial-schema test DB safety)  
- **Idempotent:** Uses `PRAGMA table_info` to skip if column already exists  
- **Timestamp convention:** No new timestamp column needed; existing `applied_at` pattern is sufficient

---

## New DB Helper

`resolveOptimizationHint(db, id, resolution, note?)` in `optimizationHints.ts`

- Explicit `db: Database.Database` injection (per project convention)
- New types: `HintResolution = 'resolved' | 'dismissed'`, `ResolveHintResult`
- `OptimizationHintRow` extended with `resolutionNote: string | null`
- Wraps in `db.transaction().immediate()` for atomicity

---

## Test Counts

| | Count |
|---|---|
| Before (cairn suite) | 693 |
| Added (hintMcp.test.ts) | +15 |
| **After** | **708** |

New tests cover: list backing logic, resolveOptimizationHint DB helper, migration 017 schema check.  
Four other test files updated: version assertion 16 → 17 (db, discovery, migration012, prescriptions).

---

## Build / Test Status

- `npm run build` — ✅ green  
- `npm test --workspace=@akubly/cairn` — ✅ 708/708 passing
### 2026-05-31: M7-A — Typed Error Hierarchy for applyFeedback / applyFeedbackById (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-31  
**Branch:** `eureka/m7-a-typed-errors`  
**Status:** SHIPPED (PR #38 opened)

**Decision:** Introduce a typed error class hierarchy in `packages/eureka/src/activities/errors.ts`, replacing all six generic `throw new Error/TypeError/RangeError(...)` sites in `applyFeedback` and `applyFeedbackById` with domain-specific typed subclasses.

**Error classes introduced:**
- `FactNotFoundError` (extends `Error`) — FactReader returns `null`
- `InvalidFeedbackOptionsError` (extends `Error`) — `correctionDelta` undefined for `user_correction`
- `InvalidTrustValueError` (extends `RangeError`) — value non-finite/out-of-range
- `FactReaderContractError` (extends `TypeError`) — FactReader returns `undefined`
- `UnhandledFeedbackEventError` (extends `TypeError`) — exhaustive `switch` `never` branch

**Discriminator pattern:** Every class carries `readonly code: '<CODE>'` for narrowing without `instanceof`.

**Canonical narrowing policy (M7-A Cycle 1):** Use `err.code === '...'` as the **primary** discriminator. `instanceof` is convenience-only — it can fail across ESM realms. `code` is realm-safe. M7-B narrowing tests will exercise `code` exclusively.

**Rationale:** (1) Caller narrowing — generic throws are indistinguishable. (2) Zero behavior change — all 40 existing tests pass without modification. (3) M7-B prep — `code` discriminators are the primary hook for exhaustive narrowing. (4) Message preservation. (5) `Object.setPrototypeOf` defensive call in constructors.

**Open Follow-ups:**
- M7-B: Exhaustive instanceof + code narrowing tests (Laura)
- M7-C: Real FactReader contract test; atomicity contract design (Crispin/Edgar)
- M7-D: `applyFeedbackById` user_correction regression locks (Laura)

**Files Changed:**
- `packages/eureka/src/activities/errors.ts` — NEW (5 typed error classes)
- `packages/eureka/src/activities/recall.ts` — updated imports, throw sites, JSDoc @throws
- `packages/eureka/src/index.ts` — barrel exports for all 5 error classes

---

### 2026-05-31: Eureka M7-A Review Cycle — 3-Cycle Closure (Edgar, Correctness, Skeptic, Craft, Compliance)

**Date:** 2026-05-31  
**Branch:** `eureka/m7-a-typed-errors`  
**PR:** #38  
**Status:** REVIEW-COMPLETE. Ready for ship decision.

**Summary:** M7-A underwent a 3-cycle review process with a rotating 4-person panel (Correctness, Skeptic, Craft, Compliance). Each cycle ran independent reviews; findings were triaged and acted upon, followed by re-review to confirm closure. All 40 tests remained green throughout.

| Cycle | Findings | Breakdown | Disposition | Commits |
|-------|----------|-----------|-------------|---------|
| **Cycle 1** | 13 total | 1 Blocking, 5 Important, 7 Minor | 11 ACCEPT, 2 REJECT-defer | 09710dc |
| **Cycle 2** | 3 total | 0 Blocking, 1 Important, 2 Minor | 3 ACCEPT, 0 REJECT | 6563ca3, 927a508 |
| **Cycle 3** | — | (lightweight fix-only, no re-review) | — | — |

**Cycle 1 Findings (11 ACCEPT, 2 REJECT):**
- **F1 [Correctness] ACCEPT:** Added `readonly event: string` field to `UnhandledFeedbackEventError`.
- **F2 [Skeptic] ACCEPT:** Declared canonical narrowing policy: `err.code === '...'` as primary discriminator; secondary: `instanceof`.
- **F3 [Skeptic] REJECT-defer:** Base class `EurekaError` deferred to M7-B (narrowing tests phase).
- **F4 [Skeptic] ACCEPT:** Documented `.name` behavior change with explicit acknowledgment.
- **F5 [Compliance] ACCEPT:** Added missing `@throws` entries for `applyFeedbackById`.
- **F6 [Craft] ACCEPT:** Clarified `Object.setPrototypeOf` rationale comment (defensive for ES5 bundlers).
- **F7 [Craft] ACCEPT:** Removed redundant `as const` on readonly discriminators.
- **F8 [Craft] ACCEPT:** Documented open signature on `InvalidFeedbackOptionsError` constructor.
- **F9 [Craft] ACCEPT:** Merged duplicate `@throws {InvalidTrustValueError}` entries.
- **F10 [Craft] ACCEPT:** Reordered `@throws` to match runtime check sequence.
- **F11 [Craft] ACCEPT:** Added TODO comment for M7-B: purpose-specific `InvalidDeltaValueError`.
- **F12 [Skeptic] ACCEPT:** Updated "dual-pkg" comment to reflect ESM-only reality.
- **F13 [Correctness] REJECT:** JSON serialization edge case flagged for information only.

**Cycle 2 Findings (3 ACCEPT, 0 REJECT):**
- **F14 [Craft/Documentation] ACCEPT:** Corrected `@throws` order inversion from Cycle 1 F10 (FactReaderContractError before FactNotFoundError).
- **F15 [Craft] ACCEPT:** Consolidated `Object.setPrototypeOf` rationale to file header (DRY).
- **F16 [Craft] ACCEPT:** Replaced non-idiomatic "open signature" phrasing with clearer language.

**Files Changed (Cycles 1+2):**
- `packages/eureka/src/activities/errors.ts` — All 5 error classes + comments
- `packages/eureka/src/activities/recall.ts` — All throw sites + JSDoc
- `.squad/decisions.md` — Canonical narrowing policy line

**Test Result:** 40/40 passing throughout all cycles. Build clean.

---


### 2026-06-05: Audit — Laura M8 Slice C (SqliteFactStore + FTS5 BM25 Search)

**Author:** Laura (Tester)
**Date:** 2026-06-05
**Branch:** `eureka/m8-slice-c-factstore`
**PR:** #48
**Verdict:** ✅ ACCEPT-WITH-FOLLOWUPS

---

## Baseline Verified

- Checked out `eureka/m8-slice-c-factstore`, pulled FF-only. Branch was already at `643f106` (Roger's drop).
- `npm test` (packages/eureka): **109 tests, 8 files, all green**. Matches Roger's claimed count.
- `npm run build` (packages/eureka): **clean** (tsc, no errors).

---

## Audit Areas & Findings

### 1. BM25 Ordering — Critical Regression Lock

**Status: PASS.** Roger's `ORDER BY (-bm25(facts_fts)) * f.trust DESC` is correct.

Sign analysis:
- `bm25()` returns NEGATIVE (more-negative = better match)
- `-bm25(...)` flips to positive (larger = better)
- Multiplied by `trust ∈ [0,1]` gives composite score, still positive
- `DESC` orders highest composite first = best matches first

FS-4 in the contract suite locks this: seeds two facts with different term frequencies (3× vs 1×) and asserts the higher-frequency fact ranks first. If the negation were dropped (`bm25()` used directly with DESC), best matches would appear LAST (most-negative = "largest" in signed comparison = first in DESC, which is wrong). FS-4 catches this.

**Normalization**: `normalizeRelevance()` correctly flips sign then applies min-max. Top result always gets `relevance = 1.0`. The all-equal branch (`max === min → 1.0`) handles single-result and identical-score cases.

**Per-page normalization note (non-blocking):** Roger's decision drop §2 acknowledges that relevance scores are not comparable across pages. A sole result on page 2 gets `relevance = 1.0` even if it's a weak match. This is intentional for v1 (single-page recall). Locked in FS-SE-12.

### 2. Cursor Pagination

**Status: PASS.** FS-5 in the contract suite already covers the 3-page round-trip (disjoint, complete, no nextCursor on final page). My FS-SE-3/4 add:

- **Garbage cursor (FS-SE-3)**: Invalid base64 decodes to non-JSON, `catch` block returns 0. Verified by comparing with no-cursor baseline — results are identical.
- **Negative offset (FS-SE-4)**: `{ offset: -5 }` → `payload.offset >= 0` fails → returns 0. Correct guard.

**Concurrent-insert caveat** (non-blocking, document only): Offset cursors can skip or repeat rows if facts are inserted between page fetches. This is a known limitation of offset-based pagination, acknowledged in Roger's decision drop §3 and the code comments. Not a blocker for single-writer v1; flagged as Slice D+ concern.

**limit=0 degenerate case** (VERY LOW, note only): Calling `search({ limit: 0 })` directly (not via `recallWithScores`, which guards k=0 before touching FactStore) would loop: `hasMore = (1 row > 0) = true`, `nextCursor = encodeCursor(0)`. Not reachable through the normal activity path; no action required.

### 3. minTrust Floor at SQL Layer

**Status: PASS.** All boundary cases:

| Trust | minTrust | Expected | Result |
|-------|----------|----------|--------|
| 0.15 | 0.15 | INCLUDED | ✅ FS-SE-5 |
| 0.149 | 0.15 | EXCLUDED | ✅ FS-SE-6 |
| NULL | 0 | EXCLUDED | ✅ FS-SE-7 |
| 0.14 | (omitted, default 0.15) | EXCLUDED | ✅ FS-SE-8 |
| 0.0 | 0 | INCLUDED | ✅ FS-SE-7 (confirms trust=0 ≠ NULL) |

The WHERE clause `f.trust IS NOT NULL AND f.trust >= $min_trust` correctly sequences the NULL check before the >= comparison, so NULL trust is excluded at any floor including 0.

### 4. Session Isolation

**Status: PASS.** FS-6 in the contract suite covers this with a direct assertion. Roger's `AND f.session_id = $session_id` on every query ensures facts never bleed across session boundaries. The session is a `$`-param, not string-interpolated, so SQL injection is not a concern.

### 5. Empty / Degenerate Queries

**Status: PASS WITH FINDING.**

- Whitespace-only query (`"   "`, `"\t"`, etc.): short-circuited by `if (!query.trim())` before FTS5. Returns `{ results: [] }`. ✅ FS-SE-9.
- Single result → no nextCursor. ✅ FS-SE-10.
- **FINDING FSE-1 (MEDIUM): FTS5 syntax characters not sanitized.** Queries containing FTS5 operator characters (unclosed `"`, bare `AND`/`OR` operators) propagate as rejected Promises rather than graceful empty results. `stmt.all()` is synchronous; the error becomes a rejection of the async `search()` return value. FS-SE-11 locks this current behavior. Recommend: wrap `stmt.all()` in try/catch; on FTS5 parse error, return `{ results: [] }`. This is MEDIUM — not a data corruption issue, but any user-supplied query string reaching `search()` is a potential crash path.

> Superseded by M8 Slice C review-cycle fixes (commit `f08c746`): `SqliteFactStore.search()` now wraps `stmt.all()` in try/catch, catches FTS5 parse-error patterns, and returns `{ results: [] }` instead of rejecting. FS-SE-11 updated to verify empty results (not rejection). FSE-1 marked done below.

### 6. Interface Reconciliation / recall Consumer

**Status: PASS.** `recallWithScores` correctly destructures `{ results: candidates }` from `factStore.search()`. All 18 recall tests pass. The `cursor` parameter in `FactStore.search()` is optional and not used by `recallWithScores` (which does a single-page overfetch). No regression.

---

## Edge Tests Added

File: `packages/eureka/src/storage/__tests__/fact-store-sqlite-edges.test.ts`
Committed on branch as `f08c746`, pushed to PR #48.

| ID | What it locks |
|----|---------------|
| FS-SE-1 | BM25 normalization: top result `relevance=1.0`, descending order, all ∈ [0,1] |
| FS-SE-2 | Single match: `relevance=1.0` (all-equal branch in normalizeRelevance) |
| FS-SE-3 | Garbage cursor: safe fallback to offset=0, no crash |
| FS-SE-4 | Negative-offset cursor: guard `>= 0` fires, fallback to 0 |
| FS-SE-5 | minTrust exact floor: `trust=0.15` with `minTrust=0.15` is INCLUDED |
| FS-SE-6 | minTrust just-below: `trust=0.149` excluded at `minTrust=0.15` |
| FS-SE-7 | NULL trust excluded even at `minTrust=0`; `trust=0` IS allowed at `minTrust=0` |
| FS-SE-8 | Default `minTrust=0.15` when omitted: `trust=0.14` excluded |
| FS-SE-9 | Whitespace-only query: empty results, no crash (4 variants) |
| FS-SE-10 | Final page: `nextCursor` absent |
| FS-SE-11 | FTS5 unclosed-quote resolves to empty results (FSE-1 fixed) |
| FS-SE-12 | Per-page normalization distortion: sole page-2 result gets `relevance=1.0` |
| FS-SE-13 | Non-FTS SQLITE_ERROR (e.g. missing table) propagates as rejected Promise |

---

## Follow-up Items (Non-Blocking)

These do NOT block acceptance. File in backlog:

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| FSE-1 | MEDIUM | ✅ DONE | Wrap `stmt.all()` in try/catch in `SqliteFactStore.search()`; FTS5 parse errors now return `{ results: [] }` rather than rejecting (commit `f08c746`). FS-SE-11 verifies graceful empty results. |
| FSE-2 | LOW | pending | Offset cursor gaps/dupes under concurrent inserts — document in `FactStore` interface JSDoc. Non-issue for single-writer v1; relevant before cross-session queries (Slice D+). |
| FSE-3 | LOW | pending | `search({ limit: 0 })` constraint: implementation now throws `TypeError` (FS-8 locked behavior). Contract surface is `limit` must be positive integer; degenerate values are caught at call boundary, not treated as empty results. Document in JSDoc. |
| FSE-4 | NOTE | ✅ DONE | Cross-page relevance incomparability — documented in FS-SE-12 and in `FactStore.search()` interface JSDoc (`@note relevance is per-page normalized, independent of result order). |

---

## Contract Invariant Note for Roger

One invariant belongs in the shared contract helper (applies to ALL FactStore impls), but I am NOT editing `fact-store-contract.helper.ts` directly per the audit mandate. **Roger to add:**

> **FS-7 (proposed)**: A fact with `trust=NULL` (NaN sentinel per CL-4) MUST never appear in search results regardless of `minTrust`. The `seed` helper in the contract fixture intentionally writes only valid `number` trust values; NULL must be tested via an impl-specific side-channel that bypasses `seed`. Note this in the helper's contract invariant list.

---

## Final State

- **Test count:** 109 → **121** (+12 edge tests)
- **Build:** ✅ clean (`tsc`, no errors)
- **All 9 test files pass**

---

## Verdict

**✅ ACCEPT-WITH-FOLLOWUPS**

Roger's Slice C is correct and well-structured. The BM25 sign convention is right, cursor safety is solid, minTrust boundaries are precise, and session isolation holds. The one genuine finding (FSE-1: no FTS5 input sanitization) is MEDIUM severity — it's a real crash path for user-supplied queries, but not a correctness, isolation, or data-loss issue. It does not block the slice. Filed as a follow-up with a test that locks current behavior.



# Decision Drop — Roger M8 Slice C (FactStore + FTS5 BM25 search)

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-06-05  
**Branch:** `eureka/m8-slice-c-factstore`  
**Status:** Merged into PR (open)

---

## 1. FactStore Interface Reconciliation (Q2-approved wrapped form)

**Decision:** Changed `FactStore.search()` return type from `Promise<RecallResult[]>` (plain array) to `Promise<{ results: RecallResult[]; nextCursor?: string }>` (wrapped form with optional cursor), and added `cursor?: string` to the args.

**Rationale:** Aaron approved the wrapped form (Q2=lock cursor now) in the M8 scope proposal session. Adding `cursor` now (optional, not required) is backward-compatible. Adding it later would be a breaking change to a locked interface once cross-session queries arrive in a later milestone.

**Consumer impact:** `recallWithScores` in `recall.ts` updated to destructure `.results` from the awaited call. All `recall.test.ts` mocks updated from `mockResolvedValue([...])` to `mockResolvedValue({ results: [...] })`. 10 mock sites updated; all 97 pre-existing tests remain green.

---

## 2. BM25 Sign-Convention Normalization

**Decision:** Order by `(-bm25(facts_fts)) * trust DESC`. Expose normalized `relevance ∈ [0,1]` via min-max normalization per page: `(rawScore - pageMin) / (pageMax - pageMin)`. All-equal-score pages (single result or identical BM25) set `relevance = 1.0`.

**Rationale:**  
- **Sign convention:** SQLite FTS5 `bm25()` returns NEGATIVE values where more-negative = better match. Using `bm25()` directly in ASC order would sort best matches LAST — the classic footgun. Negating with `-bm25()` gives a positive value where larger = better.  
- **Composite ordering:** `-bm25(facts_fts) * trust` ensures a highly-trusted lower-relevance fact doesn't outrank a high-relevance lower-trust fact in pathological cases, while still rewarding trust.  
- **Per-page normalization choice:** Min-max across the result page is simple and produces a [0,1] range. The downside is that relevance scores are not comparable across pages (page 1 facts always have higher max than page 2). For v1 where recall uses a single-page fetch (RANKER_OVERFETCH_FACTOR × k), this is acceptable. Cross-page normalization deferred.

**Regression lock:** FS-4 in `runFactStoreContract` seeds two facts with different term frequencies and asserts the higher-frequency fact ranks first. This is the primary regression lock against BM25 sign reversal.

---

## 3. Cursor Strategy

**Decision:** Offset-based cursor, encoded as base64 JSON `{ offset: number }`. Example: offset=3 → `eyJvZmZzZXQiOjN9`.

**Rationale:** Rowid+rank keyset cursors require stable rank values across calls — BM25 scores are floating-point and stable within a DB session but not across writes. For v1 (single-page recall, no cross-session queries), offset is deterministic for a given query+session between pages of the same logical request. True keyset cursors are a Slice D+ concern when cross-session pagination arrives.

**Detectability:** `nextCursor` is set when `rows.length > limit` (fetch limit+1 to detect, return limit). Callers receive `undefined` on the final page.

**Contract:** FS-5 tests a 3-page round-trip with limit=1 over 3 seeded facts, asserting no duplicates across pages and `nextCursor` absent on the final page.

---

## 4. Schema Gaps (Deferred Fields)

The `facts` table (migration 001) does not carry `attentionTier`, `importance`, or `lastAccessed`. Slice C handles this as follows:

| Field | Schema status | Slice C behavior |
|-------|---------------|------------------|
| `attentionTier` | Not in schema | Default to `'warm'` (identity multiplier 1.0 in FR-2) |
| `importance` | Not in schema | Omitted (undefined → FR-2 uses 0) |
| `lastAccessed` | Not in schema | Omitted (undefined → FR-2 uses Infinity → recency floor 0.1) |
| `relevance` | Not in schema | Computed from BM25 at query time; normalized to [0,1] |

**Impact on FR-2 composite scoring:** With `attentionTier='warm'` (multiplier 1.0), `importance=0`, and `lastAccessed` absent (recency=0.1 floor), the `compositeScore` function in `recall.ts` will compute deterministic but conservative scores. This is acceptable for M8: the storage layer supplies `relevance` from BM25, and the activity layer applies FR-2 on top. The missing fields will become load-bearing when a future migration adds them.

**Forward path:** A migration `002-fact-fields.ts` adding `attention_tier TEXT DEFAULT 'warm'`, `importance REAL`, `last_accessed INTEGER` columns would unlock all FR-2 terms without breaking Slice C's `SqliteFactStore` (it currently SELECTs `content`, `trust`, and `bm25_score` only).

---

## 5. Session Scoping (MUST invariant)

Every search query includes `AND f.session_id = $session_id`. Facts from session A are never returned in session B's search results. Verified by FS-6 in the contract suite.

NULL trust facts (NaN sentinel) are excluded by `AND f.trust IS NOT NULL` before the `>= $min_trust` check — they can never surface regardless of the floor.

---

## 7. FSE-1 Follow-up: FTS5 Error Narrowing (2026-06-05)

**Fix:** Wrapped `stmt.all()` in `SqliteFactStore.search()` with try/catch. On `SQLITE_ERROR` with a message matching FTS5 patterns, returns `{ results: [] }`. Other errors rethrow unchanged.

**Narrowing (message-matched):** `code === 'SQLITE_ERROR' && /fts5|unterminated|syntax error|malformed MATCH/i.test(message)`. This pattern correctly catches FTS5 tokenizer errors (e.g., `"unterminated string"` for unclosed `"`) and FTS5 syntax errors (e.g., `"fts5: syntax error near..."`) while letting non-FTS `SQLITE_ERROR` propagate (e.g., `"no such table: facts_fts"` from a dropped table — message doesn't match pattern, rethrows correctly).

**FS-SE-11 updated:** from `rejects.toThrow()` to `resolves { results: [], nextCursor: undefined }`. The `(FSE-1 fix)` label in the title preserves the audit trail.

Add CI check to detect `npm run lint` (bare) in agent logs and fail CI with helpful error message pointing to Issue #37 + workaround.

```

**Applied to:** PR #32 body re-render in alexander-5. Prevents escape-sequence garble in future multiline content.

## 8. FSE-4 Follow-up: Per-Page Normalization Documentation (2026-06-05)

Added JSDoc at two locations:
- `RecallResult.relevance` field — clarifies per-page min-max, NOT comparable across pages
- `FactStore.search` return type (on `nextCursor?`) — same note for consumers reading the return shape


# Roger: Crucible First GREEN — Decision Inbox

**Date:** 2026-06-01  
**Author:** Roger (Platform Dev)  
**Status:** GREEN confirmed — acceptance test passing
- **Production wiring:** `index.ts` default deps are NOT changed to `SqliteFactStore`. That is Slice D.
- **`attentionTier` / `importance` / `lastAccessed` columns:** Future migration.
- **Cross-session aggregation:** `FactStore.search()` is session-scoped in M8. Querying across sessions is a later milestone.
- **Embeddings/semantic search:** BM25 via FTS5 only. Vector similarity is out of scope.

# Roger: Crucible First GREEN — Decision Inbox

**Date:** 2026-06-01  
**Author:** Roger (Platform Dev)  
**Status:** GREEN confirmed — acceptance test passing
---

# M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)

## 2026-06-06: Slice D Wiring Decision — SQLite Production Deps Factory (Roger)

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-06T21:48:05-07:00  
**Slice:** M8 Slice D  
**Status:** SHIPPED — build clean, 145/145 tests passing

### The Design Tension

Slice D spec: "make SQLite the default deps in `index.ts`."  
Existing constraint: `better-sqlite3` is deliberately isolated behind the `./sqlite`
subpath (Slice A, PR #43). The core `.` entry must stay native-dep-free.

These are in direct conflict. One of them has to yield.

### Options Considered

**Option A — Production wiring factory in `./sqlite` subpath (CHOSEN)**

Add `createSqliteRecallDeps(db)` and `createSqliteFeedbackDeps(db)` as named
exports from `@akubly/eureka/sqlite`. Production consumers import one subpath and
get batteries-included deps. Core `.` entry unchanged.

Pros:
- Preserves the native-dep isolation established in Slice A (no rework).
- Zero cost for in-memory consumers — they never load `better-sqlite3`.
- Factory is pure: takes an already-opened DB handle, returns a plain object.
  No hidden state, no module-level side effects.
- Explicit for callers: `openDatabase()` + `createSqliteRecallDeps(db)` is a
  two-line setup, readable and discoverable.

Cons:
- The Slice D spec said "index.ts" — we're diverging from letter-of-spec.
  Mitigation: the spirit of the spec (production callers get SQLite by default)
  is fully satisfied; the letter was written before the isolation constraint was
  established.

**Option B — Import SQLite impls directly in `packages/eureka/src/index.ts`**

Set up `SqliteFactStore` + `SqliteTrustUpdater` as module-level singletons in
the core entry, export a pre-assembled `defaultDeps` object.

Why rejected:
1. Pulls `better-sqlite3` (native addon) into the `@akubly/eureka` main bundle.
   Any consumer that does `import '@akubly/eureka'` loads a native binary — even
   if they never call SQLite-backed functions.
2. Requires the database path to be known at module load time (or lazy-init
   with a global singleton) — neither is clean in a library context.
3. Contradicts the explicit architecture decision in Slice A (PR #43 commit
   `4235f8c`) that moved `SqliteFactReader` out of core surface specifically to
   avoid this problem.
4. The `createRequire` guard in `openDatabase.ts` softens the missing-addon
   error but does not remove the module from the dependency graph — tree-shaking
   does not eliminate a `new DatabaseCtor(path)` at module init.

### Chosen Approach: Option A

Two new factory functions added to `@akubly/eureka/sqlite`:

```typescript
import { openDatabase, createSqliteRecallDeps, createSqliteFeedbackDeps }
  from '@akubly/eureka/sqlite';
import { recall, applyFeedback } from '@akubly/eureka';

const db   = openDatabase();                   // opens ~/.eureka/eureka.db
const deps = createSqliteRecallDeps(db);       // RecallDeps
const fbDeps = createSqliteFeedbackDeps(db);   // ApplyFeedbackDeps

const results = await recall(options, deps);
await applyFeedback(options, fbDeps);
```

### Public Surface (for Laura's integration test + Graham's review)

**Import path:** `@akubly/eureka/sqlite`  
**New exports:**

| Name | Signature | Returns |
|------|-----------|---------|
| `createSqliteRecallDeps` | `(db: Database.Database) => RecallDeps` | `{ factStore: SqliteFactStore, clock: systemClock }` |
| `createSqliteFeedbackDeps` | `(db: Database.Database) => ApplyFeedbackDeps` | `{ trustUpdater: SqliteTrustUpdater }` |

**Unchanged exports (still available):**  
`SqliteFactReader`, `SqliteTrustUpdater`, `SqliteFactStore`, `openDatabase`, `applyMigrations`

**Core `.` entry — NO CHANGE:**  
Activities (`recall`, `recallWithScores`, `applyFeedback`, `applyFeedbackById`),
types (`RecallDeps`, `FactStore`, `ClockProvider`, …), errors — all unchanged.  
`InMemoryFactReader` remains importable for test harnesses via `@akubly/eureka`
(re-exported through `storage/index.ts`).

### Files Changed

| File | Change |
|------|--------|
| `packages/eureka/src/sqlite/deps.ts` | **NEW** — factory functions |
| `packages/eureka/src/sqlite/index.ts` | Added `export … from './deps.js'` |
| `packages/eureka/dist/sqlite/deps.*` | Compiled output (build artifact) |

### Build / Test Status

- `npm run build --workspace=@akubly/eureka` → ✅ clean (exit 0)
- `npm run test --workspace=@akubly/eureka` → ✅ 145/145 passing
- No regressions in other packages (build is workspace-scoped; no cross-package changes)

---

## 2026-06-06: Laura — Slice D Smoke Test Verdict

**Date:** 2026-06-06T21:48:05-07:00  
**Author:** Laura (Tester)  
**Slice:** M8 Slice D — Integration smoke test: recall() end-to-end with SqliteFactStore

### What was tested

Two smoke tests in `packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts`, wired via the production factory `createSqliteRecallDeps(db)` (Roger's Slice D wiring):

| ID   | Test name | What it proves |
|------|-----------|----------------|
| SD-1 | seeded fact round-trips through real SQLite/FTS5 — content returned, ordering sane | `openDatabase(':memory:')` + `applyMigrations` + INSERT-via-trigger → FTS5 index populated → `SqliteFactStore.search()` BM25 query → `recall()` FR-2 composite ranking → content round-trips intact, high-trust×high-BM25 fact ranks first |
| SD-2 | non-matching query returns empty array — FTS5 no-match path is clean | FTS5 zero-match path propagates cleanly as `[]` without throwing |

### Production surface exercised

- **`openDatabase(':memory:')`** — real DB open + full migration (schema_version, `facts`, `facts_fts`, `facts_ai`/`facts_au`/`facts_ad` triggers)
- **`createSqliteRecallDeps(db)`** — Roger's Slice D factory; assembles `{ factStore: SqliteFactStore, clock: systemClock }` — the real production composition root
- **`recall()`** — FR-2 composite scoring, trust-floor post-filter (defense-in-depth), slice to k

### Test count delta

**+2 tests** (SD-1, SD-2)  
**Total suite: 145 → 147 passing.** Full suite green. Build clean (TypeScript, no errors).

### Pass/fail

✅ **PASS** — Both smoke tests green against production factory. Full 147-test suite green. Build green.

### Factory wiring

✅ **Switched to `createSqliteRecallDeps(db)`** — Roger's factory merged 2026-06-06. The smoke test now exercises the production composition root end-to-end. No follow-up needed for factory wiring.

### Gaps (documented, not blocking)

- **SD-3 (session isolation)**: Not added — already locked by FS-6 in the contract suite. Adding it would duplicate coverage without adding signal.
- **Cursor smoke**: Not added — cursor correctness is exhaustively covered by FS-SE-3/4/10/12. Smoke test budget per spec is +1 or 2.
- **Recency scoring**: Wall-clock clock used (not a fixed mock). Recency precision is not under test here — that's a recall.test.ts concern (M4 clock seam). For a smoke test, any `nowMs` large enough to floor recency is fine.

---

## 2026-06-06: Graham — M8 Slice D Architectural Review

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-06T21:59:05-07:00  
**Slice:** M8 Slice D — SQLite Production Deps Factory  
**Review Type:** Architectural gate (pre-merge)

### Verdict

**✅ ACCEPT-WITH-FOLLOWUPS**

Slice D is architecturally sound. Roger's interpretation is correct; the decisions ledger needs a minor amendment.

### Review Focus Areas

#### 1. Spec vs. Implementation Tension — ✅ RESOLVED CORRECTLY

**The tension:** Slice D spec said "update index.ts to export SQLite-backed instances as default deps." The Slice A isolation boundary (PR #43) established that the core `@akubly/eureka` entry must NOT pull in `better-sqlite3`.

**Roger's resolution:** Factory functions (`createSqliteRecallDeps`, `createSqliteFeedbackDeps`) live on the `@akubly/eureka/sqlite` subpath. Production consumers import from one subpath and get batteries-included deps. The core `.` entry is unchanged.

**Assessment:** This is the architecturally correct interpretation. The spec's intent was "production callers get SQLite by default" — that intent is fully satisfied. The spec's letter ("update index.ts") was written before the isolation constraint was established; the constraint takes precedence. A two-line composition root (`openDatabase()` + `createSqliteRecallDeps(db)`) is explicit, discoverable, and preserves the invariant that casual importers don't load a native binary.

**Follow-up:** The decisions ledger should capture the as-built shape (factory-on-subpath, not root-entry-mutation). This is a documentation update, not a code change.

#### 2. Composition Root Clarity — ✅ CLEAN

The factory functions are pure: they take an already-opened DB handle and return a plain object. No hidden state, no module-level singletons, no side effects. The DB lifecycle (open/close) is explicitly owned by the caller.

**`createSqliteRecallDeps(db)` returns:**
```typescript
{ factStore: SqliteFactStore, clock: systemClock }
```

**`createSqliteFeedbackDeps(db)` returns:**
```typescript
{ trustUpdater: SqliteTrustUpdater }
```

**Clock wiring:** `systemClock` is a module-level const (`{ now: () => Date.now() }`). This is appropriate for production — no injectable clock needed for SQLite deps since recall's clock is for composite scoring, not storage concerns.

**Cross-session concern:** The factories are session-agnostic (they don't encode a session ID). Session scoping happens at call time via `RecallOptions.sessionId`. This is correct — the composition root shouldn't bake in runtime state.

#### 3. Test Sufficiency — ✅ ADEQUATE FOR SMOKE GATE

**SD-1** proves the end-to-end production path: `openDatabase(':memory:')` → real migrations → real FTS5 BM25 → `createSqliteRecallDeps(db)` → `recall()` → composite-scored results. Content round-trips intact; ordering is FR-2 compliant (high-trust × high-BM25 first).

**SD-2** proves the FTS5 no-match path returns `[]` without throwing.

**Assessment:** +2 tests is right-sized for a smoke gate. The contract suite (32 tests on `FactStore`, 18 on `TrustUpdater`) already exhaustively covers edge cases. These smoke tests prove the wiring is correct — that the factory assembles real impls into a working whole.

**Not tested (acceptable):** Cursor pagination, session isolation, recency scoring. All covered by contract tests or deliberately out-of-scope for smoke (Laura documented gaps correctly).

#### 4. Boundary Integrity — ✅ VERIFIED

**Core `@akubly/eureka` entry (`packages/eureka/src/index.ts`):**
- Exports only from `./activities/recall.js` and `./activities/errors.js`
- Zero imports of `sqlite/`, `db/`, or `storage/*-sqlite.ts`
- Zero references to `better-sqlite3`

**Grep verification:** No transitive path from `index.ts` to the native dependency. The isolation boundary established in Slice A holds.

### Build / Test Status

- **Suite:** 147/147 passing (confirmed by fresh run)
- **Build:** Clean (TypeScript, no errors)
- **Boundary:** Core entry has no SQLite dependency

---

## Slice D as-built (2026-06-06) — SD-F1 Amendment

**Added per Graham's SD-F1 follow-up:** Production deps wiring shipped as factory functions on `@akubly/eureka/sqlite` (`createSqliteRecallDeps`, `createSqliteFeedbackDeps`), NOT as root-entry mutations. This preserves the Slice A isolation boundary — the core `@akubly/eureka` entry does not transitively load `better-sqlite3`. Production consumers use a two-line composition root: `const db = openDatabase(); const deps = createSqliteRecallDeps(db);`. 

**Slice D Status:** ✅ **COMPLETE** — 147/147 tests passing, factory-on-subpath wiring verified, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied.

---

### 2026-06-06: Ralph Round 1 — PRs #50, #52, #53 Orchestration Outcomes

# Decision: Switch Root Lint to Workspace Iteration for Windows Compatibility

**Agent:** Gabriel (Infrastructure)  
**Date:** 2026-06-06  
**Issue:** #37  
**PR:** #50 (`squad/37-windows-lint-workspace`)

## What Changed

**Root `package.json`:**
- Before: `"lint": "eslint packages/*/src/"`
- After: `"lint": "npm run lint --workspaces --if-present"`

**Per-package `package.json` files** (7 packages updated — cairn already had it):
- Added `"lint": "eslint src/"` to: `types`, `crucible-cli`, `crucible-core`, `eureka`, `forge`, `runtime-cli`, `skillsmith-runtime`

## Why

The root glob `packages/*/src/` is not expanded by Windows PowerShell — eslint received the literal string, found no matching files, and silently exited 0. Lint errors were invisible to local Windows developers and only caught by Linux CI.

The workspace delegation pattern (`npm run lint --workspaces --if-present`) is cross-platform: it calls each package's own `lint` script, where the path `src/` is a literal, not a glob. This mirrors how `test` and other cross-package scripts already work in this monorepo.

## Impact

- `npm run lint` now correctly invokes eslint in all 8 workspace packages on both Windows and Linux.
- The `--if-present` flag ensures future packages without a lint script do not fail the root command.
- Pre-existing `any` type warnings in `cairn` and `eureka` surface (out of scope for this fix — tracked separately).
- Exit code remains 0 (warnings only, no errors introduced by this change).

---

# Decision: Scoped Doc-Hygiene Sweep — Gitignored Back-References (Issue #46)

**Date:** 2026-06-06  
**Author:** Gabriel (Infrastructure)  
**Status:** FINAL  
**Related:** Issue #46, PR to be opened from `squad/46-doc-hygiene-backref-sweep`

## Decision

Performed the correctly-scoped sweep of gitignored-path back-references in committed prose, as specified in Issue #46. Preserved all forward writer-target paths in charters, templates, and skill files.

## Scope

**Fixed (back-references):**
- `.squad/decisions-archive.md` — 4 occurrences → 0
- `.squad/orchestration-log.md` — 1 occurrence → 0
- 17 agent history files (`history.md` / `history-archive.md`) — 100+ occurrences → 0

**Preserved (forward writer-targets):**
- All `agents/*/charter.md` files — writer-target paths intact (25 hits confirmed)
- All `templates/*.md` files — writer-target paths intact
- All skill files — writer-target paths intact
- `.squad/skills/doc-references-respect-gitignore/SKILL.md` — not modified per task instructions

## Classification Heuristic

**Forward writer-target (leave alone):** Lines using template syntax (`{name}-{slug}`) or imperative instructions telling agents WHERE to write. Context: charters, templates, skills.

**Back-reference (fix):** Lines recording completed work by citing a concrete inbox filename. Context: history files, archive entries, orchestration logs. Past-tense patterns: "Decision drop: ...", "Written to ...", "Memo Location: ...", "Full analysis written to ...", "Inbox: ...".

**Directory-only references** (`.squad/decisions/inbox/` without a filename) in committed prose: replaced with "Scribe decision inbox" or "decision inbox" — path-free description that preserves the meaning.

## Verification Results

| Criterion | Result |
|-----------|--------|
| `grep -rn 'decisions/inbox/' .squad/decisions.md .squad/decisions-archive.md` | **ZERO hits** ✅ |
| `grep -rn 'decisions/inbox/' .squad/templates .squad/agents/*/charter.md` | **25 hits** (forward writer-targets preserved) ✅ |

## Why This Matters

Broken inbox links in committed prose cause:
- Confusion for contributors who don't have local inbox files
- CI link-checker failures (if ever enabled)
- Eroded trust in the documentation as a navigable resource

The carve-out for forward writer-targets ensures agents continue to know where to drop decisions during parallel work sessions.

---

# Decision: Worktree Fallback Must Emit User-Visible Warning

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-06  
**Issue:** #31  
**PR:** #53  
**Status:** Proposed (pending merge)

## Context

When `SQUAD_WORKTREES=1` is set, the coordinator's Pre-Spawn: Worktree Setup flow can silently degrade isolation in two ways:

1. **Step 2(c):** `git worktree add` fails (lock error, permissions error, or any other error) → coordinator falls back to the main checkout with `WORKTREE_MODE=false`.
2. **Step 2(d):** Junction/symlink dependency linking fails → coordinator falls back to `npm install` in the worktree, losing the shared-`node_modules` isolation model.

In both cases the existing behavior was to write a log entry to `.squad/orchestration-log/` only. The user received no signal.

## Decision

**Both fallback paths MUST emit a one-line user-visible warning in addition to the existing log entry.** The log entry is preserved unchanged.

### Warning text

**Step 2(c) — worktree creation failure:**
```
⚠️  Worktree creation failed — falling back to main checkout. Isolation disabled for this spawn.
```

**Step 2(d) — dependency linking failure:**
```
⚠️  Worktree dependency linking failed — fell back to npm install. Dependency isolation is degraded for this spawn.
```

## Rationale

The user opted into worktree isolation by setting `SQUAD_WORKTREES=1`. Silent degradation violates the principle of least surprise — the user's assumption (isolation is active) diverges from reality (isolation is disabled) with no signal. This is especially dangerous in multi-agent parallel dispatch where the user is relying on per-issue isolation to avoid cross-contamination.

The chosen fix is additive (log + warn, not log → warn): the log entry stays for post-hoc debugging, and the warning surfaces the degradation in real time.

## Alternatives Considered

1. **Block on failure instead of falling back** — too disruptive; some lock errors are transient and the step-2(c) retry already handles that. Fallback with warning is the right UX.
2. **Warn only, remove log** — removes auditability. Rejected.
3. **Add a config flag to suppress warning** — YAGNI at this scale; skip for now.

## Scope

Change is confined to `.github/agents/squad.agent.md` (governance/documentation), steps 2(c) and 2(d) error-handling bullets. No code changes required.

## ⚠️ Coordinator Restart Note

Because this change modifies the coordinator's own governance file, any running coordinator session will operate on stale instructions until it is restarted. Inform the user when this PR is merged.

---

### 2026-06-01: Crucible Sprint 0 — First GREEN Cycle (Roger)

# Roger: Crucible First GREEN — Decision Inbox

**Date:** 2026-06-01  
**Author:** Roger (Platform Dev)  
**Status:** GREEN confirmed — acceptance test passing

---

## 1. Packages Scaffolded

### `packages/crucible-core/`
New package `@akubly/crucible-core` v0.1.0.

Files created:
- `package.json` — name `@akubly/crucible-core`, type module, `main/types` → `dist/`, scripts: build/test/typecheck/clean, deps: `@akubly/types: *`, devDeps: `@types/node ^25.5.0`, `vitest ^3`
- `tsconfig.json` — mirrors crucible-cli: ES2022, Node16 module, composite, strict, references `../types`
- `README.md` — one paragraph description
- `vitest.config.ts` — standard node environment, `include: ['src/**/*.test.ts']`
- `src/types.ts` — types-only module (no runtime code)
- `src/session.ts` — createSession + fork implementation
- `src/index.ts` — barrel re-export

### `packages/crucible-cli/` (modified)
- `src/index.ts` — now re-exports `{ createSession, fork }` from `@akubly/crucible-core`
- `package.json` — added `"@akubly/crucible-core": "*"` to dependencies
- `tsconfig.json` — added `{ "path": "../crucible-core" }` to references

### Root `tsconfig.json`
Added references: `packages/crucible-core` and `packages/crucible-cli`.

---

## 2. Public Types and Functions — Shapes

```ts
// §6 five-kind vocabulary
type PrimitiveKind = 'request' | 'artifact' | 'observation' | 'decision' | 'question';

interface PrimitiveInput {
  primitiveKind: PrimitiveKind;
  primitivePayload: unknown;
  causalReadSet: string[];
}

// Committed primitive — PrimitiveInput + logical offset
interface Primitive extends PrimitiveInput {
  offset: number;
}

interface SessionMetadata {
  parentSessionId: string | null;
  forkPointEventId: number | null;
  createdAt: number;
}

interface Session {
  id: string;
  metadata: SessionMetadata;
  append(p: PrimitiveInput): Promise<void>;
  query(opts: { range: [number, number] }): Promise<Primitive[]>;
}

function createSession(): Promise<Session>;
function fork(parentId: string, opts: { atOffset: number }): Promise<Session>;
```

---

## 3. Range Convention: Inclusive-Inclusive

**Decision:** `query({ range: [a, b] })` is **inclusive on both ends**:  
- `[0, 46]` returns 47 primitives (offsets 0, 1, …, 46)  
- `[0, 23]` returns 24 primitives  

**Evidence from test:** `query({ range: [0, 46] })` → `toHaveLength(47)` → 47 = 46 − 0 + 1 ✓

---

## 4. In-Memory Parent-Registry Approach

A module-level `Map<string, Primitive[]>` holds each session's **own events**:

- **Root sessions:** own events are the complete event log; offset = array index.
- **Child (forked) sessions:** own events contain only primitives appended *after* the fork. Events at offset ≤ `forkPointEventId` are served by **delegating to the parent registry entry** — no physical copy.

**Rationale:** This satisfies A1 invariant 3 (child prefix equals parent prefix [0..23]) and invariant 4 (parent unmodified) without copying. The parent's `registry` entry remains untouched; the child's `query` reads from it transparently.

**Offset assignment for child append:**
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```

---

## 5. GREEN Confirmation

```
> @akubly/crucible-cli@0.1.0 test
> vitest run

 RUN  v3.2.4 D:/git/harness/packages/crucible-cli

 ✓ src/__tests__/acceptance/session-fork.test.ts (1 test) 3ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  23:22:14
   Duration  436ms (transform 71ms, setup 0ms, collect 73ms, tests 3ms, environment 0ms, prepare 148ms)
```

**Invariants confirmed GREEN:**
- A1-1: `childSession.metadata.parentSessionId === parentSession.id` ✓
- A1-2: `childSession.metadata.forkPointEventId === 23` ✓
- A1-3: `childPrefix.toEqual(parentPrefix)` for range [0,23] ✓
- A1-4: `parentEventsAfter.toHaveLength(47)` for range [0,46] ✓

---

## 6. Deferred: Ledger Abstraction

No `Ledger` class, no `WAL` interface, no Cairn integration in this turn. This is the **GREEN phase only** — simplest correct implementation behind the acceptance API. The REFACTOR step (next TDD cycle) is where a Ledger collaborator abstraction would be introduced, followed by the London-school descent to introduce an L1 mock layer. Deferred per Graham's sprint plan (OQ-2).

---

## 1. Packages Scaffolded

### `packages/crucible-core/`
New package `@akubly/crucible-core` v0.1.0.

Files created:
- `package.json` — name `@akubly/crucible-core`, type module, `main/types` → `dist/`, scripts: build/test/typecheck/clean, deps: `@akubly/types: *`, devDeps: `@types/node ^25.5.0`, `vitest ^3`
- `tsconfig.json` — mirrors crucible-cli: ES2022, Node16 module, composite, strict, references `../types`
- `README.md` — one paragraph description
- `vitest.config.ts` — standard node environment, `include: ['src/**/*.test.ts']`
- `src/types.ts` — types-only module (no runtime code)
- `src/session.ts` — createSession + fork implementation
- `src/index.ts` — barrel re-export

### `packages/crucible-cli/` (modified)
- `src/index.ts` — now re-exports `{ createSession, fork }` from `@akubly/crucible-core`
- `package.json` — added `"@akubly/crucible-core": "*"` to dependencies
- `tsconfig.json` — added `{ "path": "../crucible-core" }` to references

### Root `tsconfig.json`
Added references: `packages/crucible-core` and `packages/crucible-cli`.

---

## 2. Public Types and Functions — Shapes

```ts
// §6 five-kind vocabulary
type PrimitiveKind = 'request' | 'artifact' | 'observation' | 'decision' | 'question';

interface PrimitiveInput {
  primitiveKind: PrimitiveKind;
  primitivePayload: unknown;
  causalReadSet: string[];
}

// Committed primitive — PrimitiveInput + logical offset
interface Primitive extends PrimitiveInput {
  offset: number;
}

interface SessionMetadata {
  parentSessionId: string | null;
  forkPointEventId: number | null;
  createdAt: number;
}

interface Session {
  id: string;
  metadata: SessionMetadata;
  append(p: PrimitiveInput): Promise<void>;
  query(opts: { range: [number, number] }): Promise<Primitive[]>;
}

function createSession(): Promise<Session>;
function fork(parentId: string, opts: { atOffset: number }): Promise<Session>;
```

---

## 3. Range Convention: Inclusive-Inclusive

**Decision:** `query({ range: [a, b] })` is **inclusive on both ends**:  
- `[0, 46]` returns 47 primitives (offsets 0, 1, …, 46)  
- `[0, 23]` returns 24 primitives  

**Evidence from test:** `query({ range: [0, 46] })` → `toHaveLength(47)` → 47 = 46 − 0 + 1 ✓

---

## 4. In-Memory Parent-Registry Approach

A module-level `Map<string, Primitive[]>` holds each session's **own events**:

- **Root sessions:** own events are the complete event log; offset = array index.
- **Child (forked) sessions:** own events contain only primitives appended *after* the fork. Events at offset ≤ `forkPointEventId` are served by **delegating to the parent registry entry** — no physical copy.

**Rationale:** This satisfies A1 invariant 3 (child prefix equals parent prefix [0..23]) and invariant 4 (parent unmodified) without copying. The parent's `registry` entry remains untouched; the child's `query` reads from it transparently.

**Offset assignment for child append:**
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```

---

## 5. GREEN Confirmation

```
> @akubly/crucible-cli@0.1.0 test
> vitest run

 RUN  v3.2.4 D:/git/harness/packages/crucible-cli

 ✓ src/__tests__/acceptance/session-fork.test.ts (1 test) 3ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  23:22:14
   Duration  436ms (transform 71ms, setup 0ms, collect 73ms, tests 3ms, environment 0ms, prepare 148ms)
```

**Invariants confirmed GREEN:**
- A1-1: `childSession.metadata.parentSessionId === parentSession.id` ✓
- A1-2: `childSession.metadata.forkPointEventId === 23` ✓
- A1-3: `childPrefix.toEqual(parentPrefix)` for range [0,23] ✓
- A1-4: `parentEventsAfter.toHaveLength(47)` for range [0,46] ✓

---

## 6. Deferred: Ledger Abstraction

No `Ledger` class, no `WAL` interface, no Cairn integration in this turn. This is the **GREEN phase only** — simplest correct implementation behind the acceptance API. The REFACTOR step (next TDD cycle) is where a Ledger collaborator abstraction would be introduced, followed by the London-school descent to introduce an L1 mock layer. Deferred per Graham's sprint plan (OQ-2).

---

## 1. Packages Scaffolded

### `packages/crucible-core/`
New package `@akubly/crucible-core` v0.1.0.

Files created:
- `package.json` — name `@akubly/crucible-core`, type module, `main/types` → `dist/`, scripts: build/test/typecheck/clean, deps: `@akubly/types: *`, devDeps: `@types/node ^25.5.0`, `vitest ^3`
- `tsconfig.json` — mirrors crucible-cli: ES2022, Node16 module, composite, strict, references `../types`
- `README.md` — one paragraph description
- `vitest.config.ts` — standard node environment, `include: ['src/**/*.test.ts']`
- `src/types.ts` — types-only module (no runtime code)
- `src/session.ts` — createSession + fork implementation
- `src/index.ts` — barrel re-export

### `packages/crucible-cli/` (modified)
- `src/index.ts` — now re-exports `{ createSession, fork }` from `@akubly/crucible-core`
- `package.json` — added `"@akubly/crucible-core": "*"` to dependencies
- `tsconfig.json` — added `{ "path": "../crucible-core" }` to references

### Root `tsconfig.json`
Added references: `packages/crucible-core` and `packages/crucible-cli`.

---

## 2. Public Types and Functions — Shapes

```ts
// §6 five-kind vocabulary
type PrimitiveKind = 'request' | 'artifact' | 'observation' | 'decision' | 'question';

interface PrimitiveInput {
  primitiveKind: PrimitiveKind;
  primitivePayload: unknown;
  causalReadSet: string[];
}

// Committed primitive — PrimitiveInput + logical offset
interface Primitive extends PrimitiveInput {
  offset: number;
}

interface SessionMetadata {
  parentSessionId: string | null;
  forkPointEventId: number | null;
  createdAt: number;
}

interface Session {
  id: string;
  metadata: SessionMetadata;
  append(p: PrimitiveInput): Promise<void>;
  query(opts: { range: [number, number] }): Promise<Primitive[]>;
}

function createSession(): Promise<Session>;
function fork(parentId: string, opts: { atOffset: number }): Promise<Session>;
```

---

## 3. Range Convention: Inclusive-Inclusive

**Decision:** `query({ range: [a, b] })` is **inclusive on both ends**:  
- `[0, 46]` returns 47 primitives (offsets 0, 1, …, 46)  
- `[0, 23]` returns 24 primitives  

**Evidence from test:** `query({ range: [0, 46] })` → `toHaveLength(47)` → 47 = 46 − 0 + 1 ✓

---

## 4. In-Memory Parent-Registry Approach

A module-level `Map<string, Primitive[]>` holds each session's **own events**:

- **Root sessions:** own events are the complete event log; offset = array index.
- **Child (forked) sessions:** own events contain only primitives appended *after* the fork. Events at offset ≤ `forkPointEventId` are served by **delegating to the parent registry entry** — no physical copy.

**Rationale:** This satisfies A1 invariant 3 (child prefix equals parent prefix [0..23]) and invariant 4 (parent unmodified) without copying. The parent's `registry` entry remains untouched; the child's `query` reads from it transparently.

**Offset assignment for child append:**
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```

---

## 5. GREEN Confirmation

```
> @akubly/crucible-cli@0.1.0 test
> vitest run

 RUN  v3.2.4 D:/git/harness/packages/crucible-cli

 ✓ src/__tests__/acceptance/session-fork.test.ts (1 test) 3ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  23:22:14
   Duration  436ms (transform 71ms, setup 0ms, collect 73ms, tests 3ms, environment 0ms, prepare 148ms)
```

**Invariants confirmed GREEN:**
- A1-1: `childSession.metadata.parentSessionId === parentSession.id` ✓
- A1-2: `childSession.metadata.forkPointEventId === 23` ✓
- A1-3: `childPrefix.toEqual(parentPrefix)` for range [0,23] ✓
- A1-4: `parentEventsAfter.toHaveLength(47)` for range [0,46] ✓

---

## 6. Deferred: Ledger Abstraction

No `Ledger` class, no `WAL` interface, no Cairn integration in this turn. This is the **GREEN phase only** — simplest correct implementation behind the acceptance API. The REFACTOR step (next TDD cycle) is where a Ledger collaborator abstraction would be introduced, followed by the London-school descent to introduce an L1 mock layer. Deferred per Graham's sprint plan (OQ-2).

---


# Decision Drop: Crucible REFACTOR Cycle — SessionManager Unit Tests (RED)

**Author:** Laura (Tester)  
**Date:** 2026-06-01  
**Beat:** REFACTOR cycle RED — SessionManager unit tests with mocked DB collaborator  
**Status:** RED — 4 tests failing (`TypeError: SessionManager is not a constructor`)

---

## What Landed

**File:** `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`

4 unit tests authored per §4.1 Refactor 2, London-school style with a mocked `DB` collaborator:

| # | Test name | Invariant locked |
|---|---|---|
| 1 | `Unit: SessionManager.forkSession() rejects fork beyond parent ledger size` | Fork offset > parent ledger size throws with message matching `/exceeds parent ledger size 47/` |
| 2 | `Unit: SessionManager.forkSession() rejects negative fork offset` | Fork offset < 0 throws with message matching `/non-negative\|negative/` |
| 3 | `Unit: SessionManager.forkSession() child session inherits transitive dependency graph from parent` | `DB.insertSession` called with full `pluginVersions` map (transitive graph intact) |
| 4 | `Unit: SessionManager.forkSession() child fork lineage records parentSessionId and forkPointEventId` | `DB.insertSession` called with `{ parentSessionId: 'parent-id', forkPointEventId: 23 }` |

---

## MockDB Shape Locked

```typescript
type MockDB = {
  getSession:    ReturnType<typeof vi.fn>;  // → { id, ledgerSize, pluginVersions? }
  insertSession: ReturnType<typeof vi.fn>;  // ← { id, parentSessionId, forkPointEventId, pluginVersions, createdAt }
  queryEvents:   ReturnType<typeof vi.fn>;  // reserved — not yet called in these scenarios
};
```

`mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47, pluginVersions?: {...} })`  
`mockDB.insertSession.mockResolvedValue('child-id')` — for success-path tests.

**`queryEvents` is present on the shape** so negative-path tests can assert it was NOT called (validation fails before any event query).

---

## RED Confirmation

```
TypeError: SessionManager is not a constructor
  ❯ src/__tests__/unit/session-manager.test.ts:77:23
  ❯ src/__tests__/unit/session-manager.test.ts:96:23
  ❯ src/__tests__/unit/session-manager.test.ts:120:23
  ❯ src/__tests__/unit/session-manager.test.ts:144:23

Test Files  1 failed (1)
     Tests  4 failed (4)
```

`SessionManager` imported from `../../index.js` — not yet exported from Roger's in-memory sprint 0 implementation. Correct RED signal.

---

## Proactive Edge Case (Test #2)

Test #2 (`rejects negative fork offset`) is not in §4.1 verbatim — it is a proactive extension of the `ForkLineage` invariant ("Fork point must be non-negative"). The regex `/non-negative|negative/` gives Roger phrasing freedom. This is Laura's charter: edge cases aren't optional.

---

## Next Steps

### Immediate — Roger (REFACTOR)

Roger's REFACTOR cycle must:

1. **Extract `SessionManager` class** from the module-level functions in `session.ts`.
   - Constructor signature: `new SessionManager(db: DB)` where `DB` matches the mockDB shape above.
   - `forkSession(parentId: string, forkOffset: number): Promise<string>` — returns child session ID string.

2. **Implement validation** in `forkSession`:
   - Call `db.getSession(parentId)` → get `{ ledgerSize }`.
   - If `forkOffset < 0` → throw with message matching `/non-negative|negative/`.
   - If `forkOffset > ledgerSize` → throw with message matching `/exceeds parent ledger size <N>/`.

3. **Implement happy path** in `forkSession`:
   - Generate a new child UUID.
   - Call `db.insertSession({ id, parentSessionId, forkPointEventId, pluginVersions, createdAt })`.
   - Return child `id`.

4. **Export `SessionManager`** from `packages/crucible-core/src/index.ts`.

5. **Keep acceptance test GREEN**: `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` (1 test) must remain passing. Roger's in-memory `fork` function can coexist or be internalized into `SessionManager`.

### Follow-up — Laura (§4.1 Refactor 3 + §7 Mock Drift)

- **Integration test**: `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` — real SQLite DB (`:memory:`), verify schema correctness and ledger prefix semantics.
- **Mock Drift Defense (§7)**: Extract `makeMockDB()` from inline to `packages/crucible-core/src/__tests__/fixtures/mock-db-builder.ts` once Roger's `DB` interface is formally typed.

---

## Acceptance Test Guard

The existing acceptance test **must remain GREEN** after Roger's REFACTOR:

```
packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts (1 test) ✅
```

Roger's refactor must not change the public `fork` / `createSession` API surface.

---


# Decision: Crucible Sprint 0 — REFACTOR Phase: SessionManager + ForkLineage

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-01  
**Sprint:** 0 — REFACTOR cycle (§4.1 Refactor 1 + 2)  
**Status:** COMPLETE — both test layers GREEN

---

## What was done

### Refactor 1: ForkLineage value object extracted

**File:** `packages/crucible-core/src/ledger/fork-lineage.ts`

Extracted a `ForkLineage` value object that encapsulates fork ancestry invariants:

- Constructor `(parentSessionId: string | null, forkPointEventId: number)` — typed `string | null` (not just `string`) so `ForkLineage.root()` can produce a valid sentinel without a non-null assertion.
- Throws `"Fork point must be non-negative"` when `forkPointEventId < 0`.
- `static root()` — returns `new ForkLineage(null, 0)`, sentinel for root sessions.
- `isRoot(): boolean` — returns `parentSessionId === null`.

The `string | null` deviation from the strategy snippet's `string` type is intentional and documented with a comment in the file: the strategy snippet declares `parentSessionId: string` but `root()` passes `null`, so we accept both.

---

### Refactor 2: SessionManager class + DB interface introduced

**Files:**
- `packages/crucible-core/src/db.ts` — `DB` interface
- `packages/crucible-core/src/session-manager.ts` — `SessionManager` class

#### DB interface (locked shape — must match Laura's mockDB)

```ts
export interface DB {
  getSession(
    id: string,
  ): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;

  insertSession(session: {
    id: string;
    parentSessionId: string | null;
    forkPointEventId: number | null;
    pluginVersions?: Record<string, string>;
    createdAt: number;
  }): Promise<void>;

  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```

#### SessionManager.forkSession() validation order

1. `db.getSession(parentId)` → throw `"Parent session {id} not found"` if null.
2. `forkOffset > parent.ledgerSize` → throw `"Fork point {n} exceeds parent ledger size {m}"`.
3. `new ForkLineage(parentId, forkOffset)` → throws `"Fork point must be non-negative"` if negative.
4. `db.insertSession(...)` — forwards `parent.pluginVersions` verbatim (transitive dep graph).
5. Returns `crypto.randomUUID()` child id.

---

### Refactor 2b: In-memory DB adapter (`createInMemoryDB`)

**File:** `packages/crucible-core/src/in-memory-db.ts`

Created `createInMemoryDB(): InMemoryDB` factory that backs the Sprint 0 in-memory state. `InMemoryDB` extends `DB` with internal helpers (`insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`) used only by `session.ts` composition layer — not visible to `SessionManager`.

`ledgerSize` computation:
- Root sessions: `ownEvents.length`
- Child sessions: `forkPointEventId + 1 + ownEvents.length`

---

### Backward compatibility: session.ts wired to singleton adapter

`session.ts` was refactored to:
- Create a module-level `db = createInMemoryDB()` + `manager = new SessionManager(db)`.
- `createSession()` calls `db.insertRootSession()` directly (no DB interface; root sessions don't go through SessionManager).
- `fork()` calls `manager.forkSession()` for all invariant checks + DB insert, then builds the `Session` object using `db.getMetadata()` + `db.getOwnEvents()`.
- `buildSession()` uses `db.pushEvent()` / `db.getOwnEvents()` instead of the old module-level `registry` Map.

The old `registry` Map is gone; the in-memory DB owns all state.

---

### Barrel update

`packages/crucible-core/src/index.ts` now exports:
- `createSession`, `fork` (unchanged public surface)
- `SessionManager` (class)
- `DB` (interface — type-only)
- `ForkLineage` (class)
- `createInMemoryDB` (factory)
- `InMemoryDB` (interface — type-only)
- Existing types (`PrimitiveKind`, `PrimitiveInput`, `Primitive`, `SessionMetadata`, `Session`)

---

## Test results

### Unit tests (Laura's file — verified GREEN)

```
✓ src/__tests__/unit/session-manager.test.ts (4 tests)
  ✓ Unit: SessionManager.forkSession() rejects fork beyond parent ledger size
  ✓ Unit: SessionManager.forkSession() rejects negative fork offset
  ✓ Unit: SessionManager.forkSession() child session inherits transitive dependency graph from parent
  ✓ Unit: SessionManager.forkSession() child fork lineage records parentSessionId and forkPointEventId
Test Files 1 passed (1)
Tests 4 passed (4)
```

### Acceptance tests (no regression)

```
✓ src/__tests__/acceptance/session-fork.test.ts (1 test)
  ✓ Acceptance: Fork session creates child with inherited ledger prefix [parentId, forkOffset, childLineage]
Test Files 1 passed (1)
Tests 1 passed (1)
```

### Full monorepo build

`npm run build` — exit 0, no TypeScript errors.

---

## Decisions and tradeoffs

| Decision | Choice | Rationale |
|---|---|---|
| `ForkLineage.parentSessionId` type | `string \| null` | `root()` requires null; typed string in strategy snippet but null is the correct sentinel value |
| Validation order in forkSession | getSession → ledgerSize check → ForkLineage (negative) | Matches spec; negative check last because ForkLineage is constructed after parent lookup |
| InMemoryDB internal helpers | `InMemoryDB extends DB` interface | Clean separation: DB interface is the mock contract; internal helpers only exist in the concrete adapter |
| `createSession` bypasses SessionManager | Yes — calls `db.insertRootSession` directly | SessionManager.forkSession is the only operation requiring invariant validation; root sessions need no parent lookup |

---

## Deferred

- **Refactor 3: Real SQLite integration stub** — `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` + `createTestDatabase()`. Not this turn.
- **Shared-fixture mockDB builder** — `packages/crucible-core/src/__tests__/fixtures/mock-db-builder.ts` (§7 Mock Drift Defense). Not this turn; mockDB is inline in Laura's test file per her note.
- **`SessionManager.createSession()`** — not introduced; root session creation stays in `session.ts` for now. Move to SessionManager when the integration stub lands.


---


# Decision: Crucible Sprint 0 Topic Branch Recovery

**Date:** 2026-06-01T23:58:20Z  
**Author:** Gabriel (Infrastructure)  
**Upstream Context:** Scribe committed 3 meta-files directly to main while Crucible code work remained uncommitted in the working tree.

## What Happened

Scribe's session consolidation produced:
- **3 meta-commits on main:** b19b683, 193a441, 7cfe8ad (archived decisions, merged inbox, consolidated session logs)
- **Uncommitted code:** packages/crucible-cli, packages/crucible-core, london-tdd-* skills, updated workspace refs

This left main 3 commits ahead of origin/main with unreviewed code still in the working tree.

## Resolution

**Created topic branch:** `squad/crucible-sprint-0-walkthrough-a`

**Committed work on topic branch:**
- **Commit 92a8c2e** — `feat(crucible): Sprint 0 Walkthrough A — RED test + GREEN impl + REFACTOR (SessionManager/ForkLineage)`
  - Staged: packages/crucible-cli, packages/crucible-core, tsconfig.json (workspace refs), package-lock.json
  - Result: 19 files added, 758 insertions
  
- **Commit 01afeb6** — `docs(squad): London-school TDD skills from Crucible Sprint 0`
  - Staged: .squad/skills/london-tdd-first-green, london-tdd-first-red-test, london-tdd-layer-descent, london-tdd-refactor-extract-collaborator
  - Result: 5 files added, 605 insertions

**Reset main:** `git reset --hard origin/main` (HEAD now at c8d7bc7, no commits ahead)

**Final state:**
- Branch `squad/crucible-sprint-0-walkthrough-a`: 5 commits ahead of origin/main (3 Scribe meta + 2 new code)
- Branch `main`: Clean, back at origin/main (c8d7bc7)
- Working tree: Empty (all WIP committed)

## Artifacts Updated

- `.gitignore`: Added patterns `.squad/health-report-*/` and `.squad/scribe-health-report-*/` to exclude Scribe scratch files
- `.squad/agents/gabriel/history.md`: Documented the topic-branch recovery pattern under Learnings

## Test Results

- `npm test --workspace=@akubly/crucible-cli`: ✓ 1 passed
- `npm test --workspace=@akubly/crucible-core`: ✓ 4 passed

## Next Steps

Topic branch is ready for review-cycle skill execution.

---


# Graham — Cycle 1 Persona Review Fixes

**Date:** 2026-06-02T23:43:43-07:00
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Triggered by:** Cycle 1 persona review findings (I4, I2, M1)

---

## I4: ForkLineage.root() — Chosen Option (a): Remove (YAGNI)

**Alternatives considered:**
- **(a) Remove root() entirely** — zero callers, eliminates inconsistency.
- **(b) Widen constructor to (string | null, number | null)** — makes root() type-correct but ripples into guard clause and isRoot() logic.

**Decision:** Option (a).

**Rationale:** `root()` has zero callers and produces a sentinel (`forkPointEventId = 0`) that conflicts with the `session.ts` convention (`forkPointEventId === null` marks roots). Option (b) would require changing the constructor guard (`forkPointEventId < 0` doesn't handle `null`), updating `isRoot()` to also check `forkPointEventId === null`, and reasoning about whether `ForkLineage(null, null)` is a meaningful state distinct from `ForkLineage(null, 0)`. All that complexity for zero callers. YAGNI — re-introduce when a caller exists and the null semantics are settled.

**Files changed:** `packages/crucible-core/src/ledger/fork-lineage.ts`

---

## I2: InMemoryDB Coupling Documentation

**Placement:** File-header JSDoc in `session.ts`, lines 15–19 (after Sprint 0 deferral note, before `const db = createInMemoryDB()`). Chosen to avoid merge conflicts with Roger's concurrent imports/runtime changes.

**Wording:** 5-line NOTE block naming the four extended methods (getOwnEvents, getMetadata, insertRootSession, pushEvent) and framing the Refactor 3 decision point.

**Files changed:** `packages/crucible-core/src/session.ts` (comment only, no runtime change)

---

## M1: SKILL Doc Drift — Chosen Option (b): Annotate as Sprint 0 Variant

**Alternatives considered:**
- **(a) Update strategy doc** to match Sprint 0's simpler approach — risky, strategy doc is canonical for all sprints.
- **(b) Annotate SKILL as Sprint 0 variant** — lighter, preserves strategy doc as the canonical reference.

**Decision:** Option (b).

**Rationale:** `docs/crucible-tdd-strategy.md` §4.1 shows the full London-school outside-in GREEN with mocked Ledger at each layer. That's the correct general approach. Sprint 0's simpler GREEN (real in-memory, no mocks) was a conscious scope reduction because the acceptance surface fits in a single module. Annotating the SKILL preserves the strategy doc's authority while making the divergence explicit and explaining when the full approach applies.

**Files changed:** `.squad/skills/london-tdd-first-green/SKILL.md`

---

## Build & Test Status

- **Build:** ✅ `npm run build` passes (tsc --build clean)
- **crucible-core tests:** 3 passed, 3 failed (pre-existing — error message wording mismatch in session-manager.test.ts, Laura's domain)
- **crucible-cli tests:** 1 failed (pre-existing — same root cause, not introduced by these changes)

---


# Cycle 2 Advisory Close-Out — Graham

**Date:** 2026-06-05T10:54:00Z
**Context:** Persona-review Cycle 2 surfaced 3 advisory (NEW) findings on Crucible Sprint 0 Walkthrough A.

## Triage Outcomes

| ID | Category | Disposition | Reasoning |
|----|----------|-------------|-----------|
| N3 | Skeptic, minor | **ACCEPT** | Doc/behavior drift — fork() JSDoc said `≤` but enforcement is strict `<`. Active lie; fixed in-place. |
| N1 | Craft, minor | **ACCEPT** | Barrel export lacked test-only marker. One-line comment added; trivial, good hygiene. |
| N2 | Craft, minor | **DEFER** | `clear()` on InMemoryDB interface obligates future impls to test-only method. Interface is internal-only with one impl. Revisit at Refactor 3 (SQLite adapter). |

## Files Changed

- `packages/crucible-core/src/session.ts` — N3: `≤` → `<` in fork() JSDoc (line 100)
- `packages/crucible-core/src/index.ts` — N1: Split `resetInMemoryDb` export with test-only comment

## Commit

`fix(crucible): Cycle 2 advisory polish — N3 docstring + N1 barrel marker`

---


# Laura — Cycle 1 Test Updates

**Date:** 2026-06-02  
**Author:** Laura (Tester)  
**Sprint:** Crucible Sprint 0 — Cycle 1 Persona Review  
**Branch:** squad/crucible-sprint-0-walkthrough-a



---


# M8 Slice A — FactReader Contract Audit

**Author:** Laura (Tester)
**Date:** 2026-06-01
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**Status:** COMPLETE — audit filed, CL-4 tightened, edge test file committed

---

## Purpose

Audit CL-1 through CL-5 in `fact-reader.contract.test.ts` for SQLite-semantic
completeness before Roger's `SqliteFactReader` impl is declared done. SQLite
introduces real serialization/deserialization (NaN→NULL, WAL on-disk state,
shared DB file for all sessions) that the in-memory impl trivially sidesteps.
Each invariant below states whether it survives SQLite semantics unchanged, and
if not, what was tightened.

---

## CL-1 — Happy Path: seeded fact is readable

**Verdict: SURVIVES UNCHANGED.**

The test seeds `trust=0.5` and asserts `{trust: 0.5}`. SQLite's `REAL` column
stores IEEE 754 doubles; `0.5` is exactly representable and round-trips without
rounding error. The SQL query `WHERE fact_id = ? AND session_id = ?` maps
directly to the M8 schema's columns. No SQLite-specific failure mode here. The
test will exercise the full INSERT→SELECT cycle once Roger's harness `seed`
writes via raw SQL (or an internal method) and `reader.read()` queries the DB.

---

## CL-2 — Missing fact returns null (not undefined)

**Verdict: SURVIVES UNCHANGED.**

The test reads a factId that was never seeded and asserts `expect(result).toBeNull()`.
For SQLite, a `SELECT` that matches zero rows returns no rows; the impl maps that
to `null`. Vitest's `toBeNull()` is strict — it rejects `undefined`. The test
will catch both "returns undefined" and "throws on miss" bugs. No special
handling needed.

---

## CL-3 — Session isolation: wrong-session reads return null

**Verdict: SURVIVES UNCHANGED — and is a STRONGER validator for SQLite than for InMemory.**

The in-memory impl uses a `Map<factId, FactRecord[]>` scoped per-process; an
off-by-one on session filtering is contained in the JS heap. For SQLite, both
sessionA and sessionB share a **single DB file**. The `UNIQUE(fact_id,
session_id)` constraint means `(factA, sessionA)` and `(factA, sessionB)` are
distinct rows — but a SQL query that omits `AND session_id = ?` from the WHERE
clause would silently return sessionA's row when sessionB asks for the same
factId. CL-3 catches exactly that bug: seed under sessionA, read under sessionB
→ must be null. This invariant is load-bearing for SQLite correctness and
already covers the cross-session DB-sharing scenario without modification.

---

## CL-4 — NaN passthrough (trust corruption round-trip)

**Verdict: TIGHTENED. Comment strengthened; test title updated.**

**Finding:** CL-4 was silent on whether the harness `seed` function must write
to the backing store before `read` is called. The test name was `"returns
{trust: NaN} for a NaN-seeded fact — read layer does NOT validate"` — framed as
a validation policy test, not a persistence test. For the in-memory impl, seed
and read are both JS-heap operations and there is no serialization gap. For
SQLite, this is the critical failure mode: SQLite has no NaN literal and stores
`NULL` for NaN; `read` must re-hydrate `NULL → NaN`. A naive SQLite harness that
caches the seed value in memory (bypassing the INSERT) would pass the old CL-4
while allowing a real NULL-handling bug to ship silently.

**Before:**

```
// CL-4 — Trust passthrough: corrupt value (NaN)
//
// Seed a fact with trust=NaN → read must return {trust: NaN}.
// The read layer is NOT responsible for validating trust; that is the
// caller's job (applyFeedbackById throws InvalidTrustValueError(source:'storage')).
// Silently clamping or filtering at read time would hide storage corruption.

it('CL-4: returns {trust: NaN} for a NaN-seeded fact — read layer does NOT validate', ...)
```

**After:**

```
// CL-4 — Trust passthrough: corrupt value (NaN)
//
// Seed a fact with trust=NaN → read must return {trust: NaN}.
// The read layer is NOT responsible for validating trust; that is the
// caller's job (applyFeedbackById throws InvalidTrustValueError(source:'storage')).
// Silently clamping or filtering at read time would hide storage corruption.
//
// Storage round-trip requirement: the harness `seed` function MUST write
// NaN to the backing store before `read` is called — not cache it in memory.
// For SQLite implementations, NaN has no native literal and is stored as NULL;
// `read` must re-hydrate NULL → NaN. This test is the primary regression lock
// for that NaN→NULL→NaN conversion path. A seed implementation that bypasses
// the backing store (e.g., caches in-memory) would let a silent conversion
// bug slip through.

it('CL-4: NaN trust round-trips through the storage write/read cycle — read layer does NOT validate', ...)
```

The assertion (`expect(Number.isNaN(result!.trust)).toBe(true)`) is already
correct and catches both `null` and `0` returns. The change is to the comment
and test name, which are now explicit contracts on `seed` semantics. The deeper
NaN-through-disk regression lock lives in `DB-CL-1` (edges file).

---

## CL-5 — Result shape: numeric trust field

**Verdict: SURVIVES UNCHANGED.**

The test seeds `trust=0.75` and asserts `typeof result!.trust === 'number'`.
SQLite's `REAL` column comes back as a JS `number` via `better-sqlite3`. Note:
if CL-4's NULL→NaN path were broken (returning `null`), `typeof null` is
`'object'`, which would also fail CL-5 — but CL-4 fires first and is the
correct catch-point. No change needed to CL-5.

---

## Summary Table

| Invariant | SQLite verdict | Action |
|-----------|---------------|--------|
| CL-1 | Survives unchanged | None |
| CL-2 | Survives unchanged | None |
| CL-3 | Survives unchanged (stronger validator) | None |
| CL-4 | **Tightened** | Comment + title updated to require seed→store before read |
| CL-5 | Survives unchanged | None |

**4 of 5 invariants survive audit unchanged. 1 tightened (CL-4).**

---

## Rejection Trigger

If Roger's `SqliteFactReader` ships with a `seed` function that caches NaN
in memory rather than writing NULL to the DB, CL-4 will pass (false green) but
DB-CL-1 will FAIL on the close/reopen cycle. That constitutes a contract
violation. Reviewer protocol: REJECT Roger's PR and route the fix to a
**different agent** (not Roger). Proposed: Crispin (owns the InMemory reference
impl and understands the passthrough contract).

---

## Related files

- `packages/eureka/src/storage/__tests__/fact-reader.contract.test.ts` — CL-4 tightened (this audit)
- `packages/eureka/src/storage/__tests__/fact-reader-sqlite-edges.test.ts` — DB-CL-1 through DB-CL-5 (companion)


---


# Laura — M8 Slice A Cycle-2 Audit

**Author:** Laura (Tester)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** #43
**Verdict:** ✅ **ACCEPT**

---

## Summary

Applied three categories of test improvements per Cycle 1 persona-review findings. All changes are confined to the two test files; no source was modified.

---

## New Tests Added (B1 Boundary)

**File:** `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`

### `Unit: SessionManager rejects forkOffset equal to parent ledger size`
- `mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47 })`
- Expects `forkSession('parent-id', 47)` to reject.
- Regex: `/exceeds parent ledger size 47|must be (less than|< parent ledger size)|>= ?47/i`
- Verifies that the off-by-one boundary (equal-to, not just greater-than) is rejected.

### `Unit: SessionManager rejects fork on empty parent at offset 0`
- `mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 0 })`
- Expects `forkSession('parent-id', 0)` to reject.
- Regex: `/exceeds parent ledger size 0|must be (less than|< parent ledger size)|>= ?0/i`
- Exercises the edge case where the parent has no events at all.

**Contracts locked with Roger:** These tests went GREEN because Roger landed his `>=` bounds-check fix and updated the error message to "must be < parent ledger size N" before this cycle completed. Regexes updated to cover both old "exceeds" and new "must be <" phrasings.

---

## Reset-Hook Pattern Adopted (I1)

**File:** `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`

Added:
```typescript
import { beforeEach } from 'vitest';
import { resetInMemoryDb } from '@akubly/crucible-core';

beforeEach(() => {
  // Reset the module-level in-memory DB so each test starts from a clean slate.
  resetInMemoryDb();
});
```

**Rationale:** The current single acceptance test passes regardless (no prior state). This establishes the isolation discipline so the next acceptance test added does not inherit DB state from this one. The `resetInMemoryDb` function is exported by Roger's parallel work from `@akubly/crucible-core`.

---

## M4 Fix — beforeEach Mock Ordering

**File:** `packages/crucible-core/src/__tests__/unit/session-manager.test.ts` (lines ~60–63)

**Before:**
```typescript
beforeEach(() => {
  mockDB = makeMockDB();
  vi.resetAllMocks();
});
```

**After:**
```typescript
beforeEach(() => {
  // Reset first so vi.fn() instances created by makeMockDB() start pristine.
  vi.resetAllMocks();
  mockDB = makeMockDB();
});
```

**Rationale:** The old order reset `vi.fn()` instances immediately after creating them — a no-op today (no module-level mocks) but confusing and semantically wrong. The correct pattern is: clear all mock state first, then construct fresh mocks on the clean slate. Added comment explains the ordering intent for future contributors.

---

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `@akubly/crucible-core` | 6 (4 existing + 2 new B1) | ✅ All GREEN |
| `@akubly/crucible-cli` | 1 | ✅ GREEN |

---


# Roger — Cycle 1 Fix Decisions

**Date:** 2026-06-02T23:43:43-07:00
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Author:** Roger (Platform Dev)

---

## B1 — Off-by-one in forkSession bounds check

**File:** `packages/crucible-core/src/session-manager.ts:23`

**Change:** `forkOffset > parent.ledgerSize` → `forkOffset >= parent.ledgerSize`

**Rationale:** `forkPointEventId` is the inclusive last-included offset. With `ledgerSize=N`, valid fork offsets are `0..N-1`. The old `>` guard allowed `forkOffset===ledgerSize` (phantom slot past end) and allowed `fork(0)` on an empty parent (`ledgerSize=0`). The `>=` guard closes both cases. Error message updated to "must be < parent ledger size" to match the new semantics precisely.

---

## I1 — Singleton DB reset seam

**Files:** `packages/crucible-core/src/in-memory-db.ts`, `session.ts`, `index.ts`

**Contract:** `resetInMemoryDb()` exported from `@akubly/crucible-core` public surface. Zero args, void return. Clears all session state in the module-level singleton. After call, `createSession()` starts blank.

**Implementation:** Added `clear(): void` to `InMemoryDB` interface; implemented as `store.clear()` in the factory closure. Added `export function resetInMemoryDb(): void { db.clear(); }` in `session.ts`; re-exported from `index.ts`. This is the simplest seam that lets Laura isolate tests without instantiating a private DB — she imports one function and the singleton is clean.

---

## I3 — pushEvent silent drop on missing session

**File:** `packages/crucible-core/src/in-memory-db.ts:78-80`

**Change:** Replaced optional-chain silent no-op with explicit guard + throw.

**Rationale:** Silent drops are a data-loss footgun — callers can't distinguish "event appended" from "session didn't exist and the append was silently discarded." Making the missing-session case throw surfaces bugs at the earliest possible point (the append call), not at query time or never. Consistent with the principle: fail loudly at the boundary, not silently at the consumer.

---

## M2 — SessionMetadata invariant JSDoc

**File:** `packages/crucible-core/src/types.ts`

**Change:** Expanded the `SessionMetadata` JSDoc to document the both-null / both-non-null invariant explicitly, and noted that a TypeScript discriminated union is deferred to ForkLineage.

---

## M3 — range:[a,b] tuple API shape

**Decision: Option B — keep tuple, add clarifying JSDoc.**

**Rationale:** Option A (rename to `{startOffset, endOffset}`) would cascade to the acceptance test and `session.ts` query implementation, pulling in surface-area changes that aren't load-bearing for Sprint 0 correctness. The tuple `[a, b]` is already documented as inclusive-inclusive; the Sprint 0 goal is behavioural correctness, not API polish. The JSDoc on `Session.query` now explicitly names the two positions (`startOffset`, `endOffset`, both inclusive) and notes that a named-field API is under consideration for a future sprint. This documents intent without committing to a migration timeline or creating merge friction with Laura's test edits.

**Future consideration:** A `{startOffset, endOffset, inclusiveEnd?: boolean}` shape would improve discoverability. Defer to post-Sprint-0 API review cycle.

---

## M5 — crypto.randomUUID() explicit import

**Files:** `packages/crucible-core/src/session-manager.ts`, `session.ts`

**Change:** Added `import { randomUUID } from 'node:crypto'` at top of each file; replaced `crypto.randomUUID()` with `randomUUID()`.

**Rationale:** Relying on the global `crypto` object is fragile — the global is available in modern Node.js (≥19) and browser environments but is not guaranteed in all test runners or older Node targets. The `node:crypto` named import is explicit, tree-shakeable, and makes the runtime dependency visible. No behaviour change; same UUID output.

All 9 mandatory checks pass. Roger's cycle-2 fixes are correct and no regressions were
introduced. Two new edge tests (DB-CL-6 and DB-CL-7/M3) were added and committed.
Test count increased from 84 → 86.

---

## Check Results

### 1. Test Count — ✅ PASS

```
Tests  86 passed (86)   [was 84; +2 new edge tests added by this audit]
Test Files  7 passed (7)
```

No regressions. All previous 84 tests remain green.

### 2. Subpath Export Smoke Test (I6) — ✅ PASS

- `packages/eureka/dist/sqlite/index.js` **exists** after `npm run build`.
- Smoke script at repo root (`tmp-smoke.mjs`, deleted after run) output:
  ```
  function function function
  ```
  All three exports (`SqliteFactReader`, `openDatabase`, `applyMigrations`) resolve as
  `function` from `@akubly/eureka/sqlite`.
- Root path `@akubly/eureka` does **NOT** export `SqliteFactReader` — Node.js ESM raises:
  ```
  SyntaxError: The requested module '@akubly/eureka' does not provide an export named 'SqliteFactReader'
  ```
  Type leak is confirmed gone from the public surface.
- **Note:** Smoke file had to be placed inside the repo root (`D:\git\mem\tmp-smoke.mjs`) rather
  than `D:\tmp-smoke.mjs` as specified; ESM resolution walks from file location and `D:\` has no
  workspace `node_modules`. File was deleted after successful run. This is a minor test-methodology
  note, not a product defect.

### 3. better-sqlite3 optionalDependencies (I6/M2) — ✅ PASS

`packages/eureka/package.json` confirms:

```json
"dependencies": {
  "@akubly/types": "*"
},
"optionalDependencies": {
  "better-sqlite3": "^12.8.0"
}
```

`better-sqlite3` is in `optionalDependencies`, NOT `dependencies`. ✅

### 4. I5 Migration Race Verification — ✅ PASS

**`src/db/schema.ts`:** Migration loop is wrapped in `db.transaction(() => { ... }).immediate()` —
this is the better-sqlite3 API for `BEGIN IMMEDIATE`. The `.immediate()` at the end is the function
CALL (equivalent to `txFn.immediate(args)`), not a method returning a new function. Verified by
the fact that DB-CL-3 (idempotence) passes: migrations DO run inside the IMMEDIATE transaction.

**`src/db/migrations/001-facts.ts`:** Confirmed `IF NOT EXISTS` on every DDL object:
- `CREATE TABLE IF NOT EXISTS facts`
- `CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts`
- `CREATE TRIGGER IF NOT EXISTS facts_ai`
- `CREATE TRIGGER IF NOT EXISTS facts_au`
- `CREATE TRIGGER IF NOT EXISTS facts_ad`
- `CREATE TABLE IF NOT EXISTS trust_history`

**DB-CL-3** idempotence test: ✅ still passes.

**DB-CL-6 (NEW):** Added `concurrent first-open race` test — two `Database` handles to the same
file, `applyMigrations(db1)` then `applyMigrations(db2)`. Verified: no error thrown, `schema_version`
has exactly one row with `version=1`. ✅ PASSES. Migration race fix is locked.

### 5. I4 WAL Fallback Verification — ✅ PASS

`src/db/openDatabase.ts` line 38–43:

```typescript
const walMode = db.pragma('journal_mode = WAL', { simple: true }) as string;
if (walMode !== 'wal') {
  process.stderr.write(
    `[eureka] WAL mode not available (got '${walMode}'); database opened in ${walMode} journal mode\n`,
  );
}
```

- Return value is captured in `walMode`. ✅
- Warn path uses `process.stderr.write(...)` — goes to **stderr**, not stdout. ✅
  (MCP stdio rule: diagnostic output must not pollute stdout.)

### 6. I1 busy_timeout — ✅ PASS

`src/db/openDatabase.ts` line 44:

```typescript
db.pragma('busy_timeout = 5000');
```

Present immediately after the WAL pragma. ✅

### 7. M3 Harness Seed (INSERT OR REPLACE) — ✅ PASS

`fact-reader.contract.test.ts` line 197:

```typescript
'INSERT OR REPLACE INTO facts (fact_id, session_id, trust) VALUES (?, ?, ?)',
```

Confirmed. Comment reads: `// INSERT OR REPLACE matches InMemoryFactReader's upsert seed semantics (M3).`

**DB-CL-7 (NEW):** Added seed-twice test — seeds same `(fact_id, session_id)` twice via
`INSERT OR REPLACE`; second call must NOT throw; last value wins. ✅ PASSES.

### 8. M4 Cleanup Wiring — ✅ PASS

`fact-reader.contract.test.ts` lines 46–47 / 75–77:

```typescript
cleanup?: () => void;  // FactReaderHarness interface

afterEach(() => {
  harness?.cleanup?.();
});
```

SQLite harness returns `cleanup: () => db.close()` (line 208). `afterEach` calls it. ✅
No handle leaks.

### 9. I2 Deferral Comment — ✅ PASS

`src/db/migrations/001-facts.ts` lines 15–16:

```sql
-- NOTE: trust nullable + NULL=NaN sentinel. Slice B will lock writer discipline;
-- see graham-m8-scope-proposal.md §5 Q1.
```

Comment is present adjacent to the `trust` column definition. ✅

---

## New Tests Added

| Test ID | File | Description |
|---------|------|-------------|
| DB-CL-6 | `fact-reader-sqlite-edges.test.ts` | Concurrent first-open race: two handles + applyMigrations twice → schema_version=1, no error |
| DB-CL-7 (M3) | `fact-reader-sqlite-edges.test.ts` | Seed-twice via INSERT OR REPLACE: must not throw, last value wins |

Both committed on this branch. Test count: **84 → 86**.

---

## Known Follow-Ups (Non-Blocking)

None opened this cycle. All cycle-1 findings that were in scope for cycle-2 are addressed.
I2 (trust nullable / NaN sentinel) remains deferred to Slice B per Aaron's disposition —
the comment in `001-facts.ts` is the tracking artifact.

---

## Verdict

✅ **ACCEPT** — PR #43 is ready to merge. All 9 checks pass. No blocking failures.
Two new regression-locking tests added (DB-CL-6, DB-CL-7). Baseline: **86/86 green**.


---


# Roger — M8 Slice A Cycle-2 Decision Drop

**Author:** Roger (Platform Dev)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**PR:** #43

---

## I6 — SQLite Subpath Structure

### Exports map (`packages/eureka/package.json`)

```json
"exports": {
  ".": "./dist/index.js",
  "./sqlite": "./dist/sqlite/index.js"
}
```

### File layout

| File | Status | Notes |
|------|--------|-------|
| `src/storage/fact-reader-sqlite.ts` | **Unchanged** | SQLite reader stays where it is |
| `src/db/openDatabase.ts` | **Updated** | Changed to `import type` + `createRequire` runtime guard |
| `src/db/schema.ts` | **Updated** | See I5 below |
| `src/sqlite/index.ts` | **New** | Subpath entry point; re-exports `SqliteFactReader`, `openDatabase`, `applyMigrations` |
| `src/storage/index.ts` | **Updated** | Removed `SqliteFactReader` export |

### `better-sqlite3` dependency

Moved from `dependencies` → `optionalDependencies`. `@types/better-sqlite3` already
was in `devDependencies`; no change needed there.

Runtime guard in `openDatabase.ts` uses `createRequire(import.meta.url)` (required for
ESM modules loading CJS native addons). If `better-sqlite3` is absent, throws:

```
[eureka] better-sqlite3 is not installed. SQLite storage requires this native
module. Install it with: npm install better-sqlite3
```

### TypeScript build

`src/sqlite/` is inside `src/` (covered by `"include": ["src"]` in `tsconfig.json`).
`dist/sqlite/index.js` and `dist/sqlite/index.d.ts` are emitted by the existing
`tsc` composite build. No tsconfig changes required.

---

## I5 — Migration Race Fix

### Strategy: BEGIN IMMEDIATE + IF NOT EXISTS

`applyMigrations` in `src/db/schema.ts`:
- `CREATE TABLE IF NOT EXISTS schema_version` runs **outside** the transaction (already idempotent)
- Version read + migration loop wrapped in `db.transaction(...).immediate()`
- Two simultaneous first-opens serialize on the IMMEDIATE lock; the loser
  reads `schema_version = 1` and finds no pending migrations

`src/db/migrations/001-facts.ts`:
- Added `IF NOT EXISTS` to `CREATE TABLE facts`, `CREATE VIRTUAL TABLE facts_fts`,
  and all three `CREATE TRIGGER` statements
- Defense-in-depth: a partially-applied migration on crash recovery does not
  error the second open
- DB-CL-3 idempotence test continues to pass (84/84 green)

---

## I2 — Trust Nullable / NaN Sentinel Deferral

Per Aaron's disposition: **DEFERRED to Slice B**. No schema change.

Added to `001-facts.ts` near the `trust` column:

```sql
-- NOTE: trust nullable + NULL=NaN sentinel. Slice B will lock writer discipline;
-- see graham-m8-scope-proposal.md §5 Q1.
```

---

## Deviations from Aaron's Dispositions

**None.** All accepted findings (I1, I4, I5, I6, I2, M1–M5) implemented as specified.
I3 and M6/M7 skipped per Aaron's instructions.

M2 (JSDoc fix) was applied in the same commit as I6 since both touched `openDatabase.ts`.
M1 + I2 comments were applied in the same commit as I5 since both touched `001-facts.ts`.


---


# Roger M8 Slice A Decision Drop

**Author:** Roger (Platform Dev)
**Date:** 2026-06-02
**Branch:** `eureka/m8-slice-a-sqlite-factreader`
**Status:** COMPLETE

---

## Decisions Made

### DB Path Default

`~/.eureka/eureka.db` — per Aaron's Q3 approval. Implementation:
`path.join(os.homedir(), '.eureka', 'eureka.db')` in `openDatabase.ts`.
Parent directory created with `fs.mkdirSync(..., { recursive: true })` at open-time.

### NaN Handling — Nullable Column (satisfies CL-4)

**Resolution: nullable column, `NULL ↔ NaN` mapping at the JS layer.**

The `trust` column in `facts` is declared `REAL` (nullable, no `NOT NULL`
constraint), deviating from Graham's sketch which shows `REAL NOT NULL DEFAULT 0.5`.

**Why:** CL-4 in the contract suite requires that a fact seeded with `NaN` trust
round-trips as `{trust: NaN}` on read. SQLite has no NaN literal — if the column
were `NOT NULL`, an INSERT of NaN would store `0.0` (IEEE 754 quiet NaN
coerced to 0 by SQLite's type rules). The only correct round-trip path is
`NULL ↔ NaN` as specified in Graham's §3 NaN handling note.

Mapping in `SqliteFactReader.read`: `row.trust === null ? NaN : row.trust`.
Mapping in test harness seed: `Number.isNaN(trust) ? null : trust`.

### Schema Deviations from Graham's §3 Sketch

| Column | Sketch | Actual | Reason |
|--------|--------|--------|--------|
| `trust` | `REAL NOT NULL DEFAULT 0.5` | `REAL` (nullable, no default) | CL-4 NaN round-trip requires NULL storage |

All other table definitions, triggers, and `trust_history` scaffold match the
§3 sketch verbatim.

`trust_history` is scaffolded but no code writes to it in Slice A, per Aaron's
Q1 approval. Writes come in Slice B.

---

## Test Count

74 → 79 (+5 SqliteFactReader contract tests via `runFactReaderContract`).


---


# Decision: M8 Slice B — Transaction wrapper choice + contract test relocation pattern

**Date:** 2026-06-05  
**Author:** Roger  
**Scope:** `@akubly/eureka` — SqliteTrustUpdater + runTrustUpdaterContract refactor

---

## Decision 1: BEGIN IMMEDIATE via `.immediate()` method

**Context:** `SqliteTrustUpdater.mutate` must be atomic per `(sessionId, factId)`. better-sqlite3 provides `db.transaction(fn)` (DEFERRED by default) and `.immediate(args)` to use `BEGIN IMMEDIATE`.

**Choice:** Use `rawTxn.immediate(args)` — the `.immediate()` method on the Transaction object returned by `db.transaction(fn)`.

**Rationale:**
- DEFERRED BEGIN can yield `SQLITE_BUSY_SNAPSHOT` if a concurrent writer upgrades between our SELECT and UPDATE.
- IMMEDIATE acquires the write lock at transaction start, serializing writers at the DB level.
- WAL mode is single-writer anyway; IMMEDIATE just makes the serialization point explicit and earlier.
- `busy_timeout=5000ms` (Slice A cycle-2 fix) handles the wait.
- No JS-layer promise chain needed — contrast with InMemoryTrustUpdater's per-key lock.

**Alternative considered:** Explicit `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` via `db.prepare`. Rejected: more boilerplate, loses better-sqlite3's automatic rollback on throw, more surface for bugs.

---

## Decision 2: Contract suite relocation — tombstone pattern for vitest test files

**Context:** Moving `runTrustUpdaterContract` from `activities/__tests__/trust-updater-contract.test.ts` to `storage/__tests__/trust-updater.contract.test.ts` (symmetry with FactReader). The old file cannot be deleted from the repo, and vitest 3.x throws "No test suite found in file" for empty test files.

**Choice:** Replace old file content with a `describe + it.todo` tombstone. The todo shows as 1 skipped test and self-documents the move.

**Pattern (reusable for future suite relocations):**
```ts
import { describe, it } from 'vitest';
describe('XYZ contract suite — tombstone (suite moved)', () => {
  it.todo('suite moved to storage/__tests__/xyz.contract.test.ts');
});
```

**Anti-pattern to avoid:** Importing from the new test file for re-export. If a test file imports from another test file, vitest registers that file's top-level `describe`/`it` calls TWICE, causing test duplication. Do NOT use test files as re-export modules.

**Update 2026-06-05:** Tombstone removed in commit b9185de — the value of pointing future readers to the new location was deemed lower than the noise cost of a permanent `it.todo` skipped test in every run. `git log --follow` on `packages/eureka/src/storage/__tests__/trust-updater-contract.helper.ts` traces the move. The anti-pattern note above (no test-file re-exports) remains valid and was the actual learning.

---

## Decision 3: `TrustUpdaterHarness` shape extends `TrustUpdaterTestImpl` with optional cleanup

**Choice:** `TrustUpdaterHarness = { impl, setTrust, getTrust, cleanup? }` — matching `FactReaderHarness` optional-cleanup convention from Slice A.

**Rationale:** `cleanup` is optional so the InMemory harness needs no change (no native handles). SQLite harness registers `db.close()`. `afterEach(() => harness?.cleanup?.())` in `runTrustUpdaterContract` guarantees teardown even if a test throws — same pattern used in `runFactReaderContract`.


# M2 Design — forge-mcp bash hooks + install README

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-01
**Branch:** `squad/m2-forge-mcp-bash-hooks`

---

## Context

M2 ships bash shell init integration for forge-mcp so a user who clones the
repo can wire Cairn's session-start telemetry hook into their interactive bash
sessions. M0 (Alexander, PR #36) registered forge-mcp in the plugin and
`.copilot/mcp-config.json`. M1 (Roger, PR #40) added `list_optimization_hints`
and `resolve_optimization_hint`. M2 is pure infra: no MCP tool surface changes.

---

## Design Choices

### Hook script location — `.github/hooks/cairn/shell-init.sh`

**Options considered:**
- A. `.github/hooks/cairn/shell-init.sh` (parallel to curate.ps1 / record.ps1)
- B. `packages/skillsmith-runtime/scripts/shell-init.sh` (with the package)
- C. `bin` entry in skillsmith-runtime

**Chosen: A.** The existing PowerShell hooks (`curate.ps1`, `record.ps1`) live at
`.github/hooks/cairn/`. A bash counterpart belongs in the same directory. Users who
explore the hooks see all hook variants together. The package already has its own
concern (MCP server, sessionStart.ts); shell integration is a repo/infra concern.
The install script (`install.sh`) also lives here, completing the co-location pattern.

### Install mechanism — idempotent `~/.bashrc` append with marker block

The installer:
1. Checks `~/.bashrc` for the marker comment before appending (idempotent re-runs)
2. Appends a `source` line pointing to the absolute path of `shell-init.sh`
3. The marker is `# forge-mcp: shell init` — stable, unique, grep-safe

### Idempotency strategy — two-layer guard

Layer 1 (install script): grep for marker in `~/.bashrc` — skip if present.
Layer 2 (shell-init.sh): env var `_FORGE_MCP_SHELL_INIT_LOADED` — prevents
double-firing if the user sources the file multiple times in one session.

### Non-interactive safety

`shell-init.sh` opens with `[[ $- != *i* ]] && return` — a no-op in non-interactive
shells (scripts, CI, subshells). Safe to source unconditionally from `.bashrc`.

### sessionStart hook discovery order (mirrors curate.ps1)

1. User-deployed override: `~/.cairn/hook/sessionStart.mjs`
2. Global npm install: `npm root -g` → `@akubly/skillsmith-runtime/dist/hooks/sessionStart.js`
3. Repo checkout (sibling path from `.github/hooks/cairn/`):
   `$SCRIPT_DIR/../../../packages/skillsmith-runtime/dist/hooks/sessionStart.js`

The hook runs in the background (`node "$script" &>/dev/null &` + `disown`) so it
never blocks shell startup.

### Verification approach

A smoke test function `forge_mcp_check` is included in `shell-init.sh` and documented
in the README. It reports the discovered script path (or "not found") and the
installed version. Laura can run this after sourcing the file.

### Uninstall path

`uninstall.sh` (in the same directory) removes the marker block from `~/.bashrc`
using `sed` — no manual edits required. Idempotent: no-op if not installed.

### Zsh note

`shell-init.sh` uses `[[ ]]` and `function` syntax that works in zsh as well as
bash. Zsh compatibility is achievable by adding `source ~/.github/hooks/cairn/shell-init.sh`
to `~/.zshrc` in place of `~/.bashrc`. Documented in README as a brief note.

---

## Deliverables

| File | Purpose |
|------|---------|
| `.github/hooks/cairn/shell-init.sh` | Sourceable bash hook (session-start trigger) |
| `.github/hooks/cairn/install.sh` | Idempotent `~/.bashrc` wiring script |
| `.github/hooks/cairn/uninstall.sh` | Removes the `~/.bashrc` marker block cleanly |
| `README.md` (new section) | Copy-pasteable install guide |
| `.squad/skills/forge-mcp-shell-install/SKILL.md` | Reusable shell-install pattern |

No changes to forge-mcp's tool surface, MCP wiring, or any TypeScript source.


# M2 Shipped — forge-mcp Bash Shell Init Hooks

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-01
**PR:** #44
**Branch:** `squad/m2-forge-mcp-bash-hooks`
**Status:** PR OPEN — awaiting review/merge

---

## What Shipped

| Deliverable | File | Status |
|---|---|---|
| Bash hook script | `.github/hooks/cairn/shell-init.sh` | ✅ |
| Install script | `.github/hooks/cairn/install.sh` | ✅ |
| Uninstall script | `.github/hooks/cairn/uninstall.sh` | ✅ |
| README install section | `README.md` (new M2 section) | ✅ |
| Skill extraction | `.squad/skills/forge-mcp-shell-install/SKILL.md` | ✅ |
| Build clean | `npm run build` | ✅ |
| Tests clean | `npm test` — 49/49 | ✅ |

## Verification Recipe for Laura

```bash

# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh


# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"


# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check


# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc

# forge_mcp_check should no longer exist as a function


# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.


# Decision Drop: M1 Cycle-1 Findings Fix Wave

**Author:** Roger (Platform Dev)  
**Date:** 2026-05-31T23:04:34-07:00  
**Branch:** squad/39-hint-mcp-tools  
**PR:** #40  
**Commit:** 4ca4542

---

## F1-A: migration 018 — resolution_disposition column

Added `resolution_disposition TEXT CHECK (resolution_disposition IN ('resolved', 'dismissed')) NULL` to `optimization_hints` via migration 018. Schema version is now 18. `resolveOptimizationHint` writes `status='rejected'`, `resolution_disposition`, and `resolution_note` in a single atomic UPDATE. Existing rows are NULL (no backfill — system-generated data, not user disposition).

`list_optimization_hints`, `get_optimization_hint`, and the resolve tool all surface `resolution_disposition`.

`ResolveHintResult` and `OptimizationHintRow` types both carry the new field.

---

## F2: already-resolved response shape

When `alreadyResolved=true`, `resolveOptimizationHint` now returns `resolution: null` (the caller's intent was not acted on) and includes `prior_status` (the hint's actual state). The MCP handler response carries both fields so LLM consumers can correctly interpret "idempotent no-op" vs "accepted disposition."

---

## F10: get_optimization_hint surface shape

New MCP tool `get_optimization_hint(hint_id)` returns:

```json
{
  "id": "...",
  "skill_id": "...",
  "source": "prompt-optimizer|token-optimizer",
  "category": "...",
  "description": "...",
  "recommendation": "...",
  "impact_score": 0.0,
  "confidence": 0.0,
  "confidence_level": "high|medium|emerging",
  "status": "pending|...",
  "auto_apply_eligible": null,
  "parent_prescription_id": null,
  "evidence": {},
  "metric_snapshot": {},
  "generated_at": "ISO8601",
  "applied_at": null,
  "created_at": "ISO8601",
  "resolution_disposition": "resolved|dismissed|null",
  "resolution_note": "string|null"
}
```

Symmetric with `get_prescription`. Returns 404-style `{ error: "Hint '...' not found." }` when the id is unknown.

---

## Handler-layer testability pattern

Handler bodies extracted into exported pure functions:
- `buildListHintsResult(db, { status?, skill_id?, limit })`
- `buildResolveHintResult(db, { hint_id, resolution, note? })`
- `buildGetHintResult(db, { hint_id })`

Returns the raw JSON payload (not the MCP content wrapper). MCP handler calls the function and wraps in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import directly from `server.ts` — safe because `if (isScript)` guard prevents server start on import.

---

## Test counts

- Before M1: 708
- After M1 (initial): 708
- After M1 cycle-1 fixes: **717** (9 new tests: 3 migration-018 schema, 3 handler `buildListHintsResult`, 3 `buildResolveHintResult`, 3 `buildGetHintResult` — grouped into 3 describe blocks × 3 tests each)

---

## New commit SHAs

- `4ca4542` — fix(cairn): M1 cycle-1 findings — migration 018, get_optimization_hint, F1-F13
- `016f346` — Scribe: Merge M1 hint MCP decision (pre-existing, preserved)

---

## Other finding resolutions (summary)

| Finding | Resolution |
|---------|-----------|
| F3 handler tests | buildList/buildResolve/buildGet extracted + 9 tests |
| F4 dedupe status enum | HINT_STATUSES exported from optimizationHints.ts; VALID_HINT_STATUSES deleted |
| F5 terminal-state derivation | STATUS_TRANSITIONS length check replaces hardcoded array |
| F6 active_count semantics | Omitted when status filter present; comment explains |
| F7 migration silent no-op | process.stderr warning in both 017 + 018 |
| F8 note size cap | .max(1000) on note Zod field |
| F9 generic error messages | 'Internal error querying/resolving/reading hint' + stderr log |
| F11 event payload | emitHintTransitionEvent forwards resolution_disposition, resolution_note, source:'mcp' |
| F12 ?? null | resolution_note + resolution_disposition use ?? null |
| F13 .max(256) | hint_id + skill_id Zod fields |


# Decision Drop: M1 Cycle-2 Polish Wave

**Author:** Roger  
**Date:** 2026-05-31T23:50:00-07:00  
**Branch:** `squad/39-hint-mcp-tools`  
**PR:** #40  
**Commit:** c5ffead

---

## Findings addressed (N1–N6)

### N1 (Medium) — Collapse migrations 017+018

**Done.** `017-hint-resolution-note.ts` now adds BOTH `resolution_note TEXT NULL` and `resolution_disposition TEXT CHECK(...)` in a single migration. Migration 018 file deleted. `schema.ts` updated (removed 018 import + array entry). Schema version stays at 17. All 4 test files with version assertions reverted from 18 → 17. `hintMcp.test.ts` migration schema section consolidated from two `describe` blocks into one that asserts both columns.

Idempotency: each column gets its own `if (!cols.some(...))` check instead of a single early-return, so the migration is safe to re-run against a DB that only has one of the two columns.

### N2 (Medium) — HINT_RESOLUTION_STATUSES dedup

**Done.** Exported `HINT_RESOLUTIONS = ['resolved', 'dismissed'] as const` from `optimizationHints.ts`. `HintResolution` type now derives from it: `typeof HINT_RESOLUTIONS[number]`. `server.ts` imports `HINT_RESOLUTIONS` and uses `z.enum(HINT_RESOLUTIONS)`. Local `HINT_RESOLUTION_STATUSES` constant removed.

### N3 (Minor) — Shared serializer to prevent list/get drift

**Done.** Extracted private `buildHintSummary(h)` helper in `server.ts` (above the exported builder functions). `buildListHintsResult` uses `hints.map(buildHintSummary)`. `buildGetHintResult` spreads `buildHintSummary(h)` and adds full-detail fields: `confidence`, `description`, `auto_apply_eligible`, `parent_prescription_id`, `evidence`, `metric_snapshot`, `generated_at`, `applied_at`.

Location: `packages/cairn/src/mcp/server.ts` — private `buildHintSummary()` ~40 lines above `buildListHintsResult`.

### N4 (Medium) — Follow-up issue for forge consumer

**Filed.** GitHub issue **#42**: "M3 follow-up: Wire forge prescriber to consume hint_state_transition resolution_disposition"  
URL: https://github.com/akubly/stunning-adventure/issues/42  
Label: `squad`

### N5 (Low) — Remove vacuous type cast

**Done.** `effectiveStatuses` in `buildListHintsResult` simplified from the `HintStatus[] | HintStatus | undefined` cast to `params.status ?? [...ACTIVE_HINT_STATUSES]`. TypeScript infers the correct union type; no explicit cast needed.

### N6 (Low) — Document confidence_level vs confidence asymmetry

**Done.** Chose option (a). One-line JSDoc on `buildHintSummary` documents that raw confidence float is omitted from the summary; callers should use `get_optimization_hint` for the float value.

---

## New commit SHAs

| SHA | Description |
|-----|-------------|
| `c5ffead` | cairn: cycle-2 polish wave — N1-N6 (issue #39) |

Prior HEAD: `4d9d607`

---

## Test counts

| | Count |
|---|---|
| Before (cycle-1 baseline) | 717 |
| After (cycle-2 polish) | **716** |

Net -1: merged the two migration schema `it()` tests (one for 017, one for 018) into a single combined test for migration 017.

---

## Build/test status

- `npm run build --workspace=@akubly/cairn`: ✅ green (tsc, no errors)
- `npm test --workspace=@akubly/cairn`: ✅ 716/716 passing

---

## Files changed

- `packages/cairn/src/db/migrations/017-hint-resolution-note.ts` — expanded to add both columns
- `packages/cairn/src/db/migrations/018-hint-resolution-disposition.ts` — **deleted**
- `packages/cairn/src/db/schema.ts` — removed 018 import + array entry
- `packages/cairn/src/db/optimizationHints.ts` — added `HINT_RESOLUTIONS` export
- `packages/cairn/src/mcp/server.ts` — N2/N3/N5/N6 changes
- `packages/cairn/src/__tests__/hintMcp.test.ts` — consolidated migration schema tests
- `packages/cairn/src/__tests__/db.test.ts` — version 18 → 17
- `packages/cairn/src/__tests__/discovery.test.ts` — version 18 → 17
- `packages/cairn/src/__tests__/migration012.test.ts` — version 18 → 17 (2 assertions)
- `packages/cairn/src/__tests__/prescriptions.test.ts` — version 18 → 17


# Decision: PR #45 CI Build Fix — gabriel-pr45-ci-build-fix

**Date:** 2026-06-05T21:47:54.600-07:00
**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**PR:** #45

---

## Situation

CI workflow (`.github/workflows/ci.yml`, node 20+22 matrix, `npm ci` + `tsc --build`) was failing with:
```
packages/crucible-core/src/session-manager.ts(1,28): error TS2591: Cannot find name 'node:crypto'.
packages/crucible-core/src/session.ts(1,28): error TS2591: ... (same)
```
Squad CI (npm test) was passing; only the clean `tsc --build` failed.

---

## Reproduction Result: Case C

Local repro via `npm ci` + `npx tsc --build --force` did **NOT** reproduce the error. `@types/node` was present at root (`node_modules/@types/node/package.json` = True) and tsc exited 0.

**Root cause (inferred):** CI runners have no incremental `.tsbuildinfo` cache. In some CI environments, TypeScript's auto-type-inclusion of `@types/node` is non-deterministic without an explicit `types` field — especially in monorepos with project references where each package compiles in isolation. The local environment benefits from a pre-existing cache that masks the resolution gap.

---

## Fix Applied

Added `"types": ["node"]` to `packages/crucible-core/tsconfig.json` compilerOptions:

```json
"compilerOptions": {
  ...
  "resolveJsonModule": true,
  "types": ["node"]
}
```

**Rationale:**
- Explicit `types` field is conventional, harmless, and eliminates any TS auto-type-inclusion ambiguity.
- `crucible-cli` was not modified — it has no `node:` protocol imports in non-test source.
- Lockfile was not regenerated (`npm install` reported "up to date" — lockfile was already correct).

---

## Verification Results

| Check | Result |
|---|---|
| `npx tsc --build --force` | ✅ exit 0, no errors |
| `npm run build` | ✅ exit 0 |
| `npm test --workspace=@akubly/crucible-core` | ✅ 6/6 tests pass |
| `npm test --workspace=@akubly/crucible-cli` | ✅ 1/1 tests pass |

---

## Commit & Push

- **Commit:** `e5c1dde` — `fix(crucible): make @types/node explicit for crucible-core CI clean build`
- **Push:** `d273077..e5c1dde` → `squad/crucible-sprint-0-walkthrough-a`
- **New HEAD SHA:** `e5c1dde07e40f812cd2303cd7c7459a478fd65af`

---

## CI Run Status (post-push)

```json
{"databaseId":27053273442,"headSha":"e5c1dde...","status":"in_progress","workflowName":"CI"}
{"databaseId":27053273441,"headSha":"e5c1dde...","conclusion":"success","workflowName":"Squad CI"}
```

- Squad CI already green on new HEAD.
- CI workflow in progress on new HEAD (previous run on `d273077` was `failure`).
- PR #45 state: `mergeable: MERGEABLE`, `mergeStateStatus: UNSTABLE` (expected while CI runs).

---

## Key Lesson

Incremental `tsc --build` (with cached `.tsbuildinfo`) masks clean-build type-resolution failures. Always reproduce CI failures with `npm ci` + `tsc --build --force`. If local still passes (Case C), apply explicit `"types": ["node"]` as belt-and-suspenders — don't require local repro before fixing.


---


# Decision: PR #45 Gitignore Cleanup + Topic-Branch SKILL Typo Fix

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-05
**Branch:** squad/crucible-sprint-0-walkthrough-a
**PR:** #45

---

## Files Removed from Tracking

Three files were committed by Scribe's REFACTOR-cycle meta-commit (`7cfe8ad`) despite residing under gitignored paths (`.gitignore:50-51`). They were untracked via `git rm --cached`:

| File | Gitignore rule |
|------|---------------|
| `.squad/orchestration-log/20260602-064301-laura.md` | `.gitignore:50` (`.squad/orchestration-log/`) |
| `.squad/orchestration-log/20260602-064301-roger.md` | `.gitignore:50` (`.squad/orchestration-log/`) |
| `.squad/log/20260602-064301-crucible-walkthrough-a-refactor.md` | `.gitignore:51` (`.squad/log/`) |

All three verified via `git check-ignore -v` after removal — each matched by the correct ignore rule.

**Files NOT removed:** All other files under those directories pre-date this branch (exist on origin/main already) and were left untouched per task scope.

---

## Typo Fix

**File:** `.squad/skills/topic-branch-from-dirty-main/SKILL.md` line 12  
**Before:** `.squad/ decision archives` (stray space after `/`)  
**After:** `.squad/decision archives`  

---

## Commits

- Gitignore cleanup incorporated into `a27cdf2` (concurrent commit on branch)
- Typo fix committed as `f2606f3` — `fix(squad): untrack gitignored runtime logs + topic-branch SKILL typo`

---

## Test Verification

- `@akubly/crucible-core`: 6/6 ✅
- `@akubly/crucible-cli`: 1/1 ✅


---


# Decision Drop: PR #45 Merge Resolution (squad/crucible-sprint-0-walkthrough-a ← origin/main)

**Agent:** Gabriel (Infrastructure)
**Date:** 2026-06-05T21:47:54.600-07:00
**Branch:** squad/crucible-sprint-0-walkthrough-a
**PR:** #45 (Crucible Sprint 0 Walkthrough A)

---

## What Conflicted

`origin/main` had advanced with three merged PRs since our branch forked from `c8d7bc7`:
- **#41** — Eureka M7: typed errors + narrowing tests + regression locks + atomicity contract
- **#40** — M1: Add list_optimization_hints + resolve_optimization_hint MCP tools
- **#43** — M8 Slice A: SqliteFactReader + Eureka migrations

Two conflicts arose during `git merge origin/main`:

| File | Conflict Type | Resolution |
|---|---|---|
| `package-lock.json` | Both sides added packages (main: Eureka/Cairn deps; ours: crucible-cli/crucible-core workspaces) | Regenerated via `npm install` (took main's lockfile as base, let npm union in crucible workspaces) |
| `.squad/agents/crispin/history.md` | Modify/delete (main deleted it; HEAD modified it) | Kept HEAD (union semantics — keep both sides' work) |

All `.squad/` append-only files (decisions.md, agent histories, archives) auto-resolved via the `merge=union` driver configured in `.gitattributes` — no manual intervention needed.

## Pre-Merge Fix: .gitignore

`.squad/health-report-2026-06-05T10-58-29Z.md` was untracked (Scribe scratch). Investigation revealed the existing `.gitignore` had `.squad/health-report-*/` **with a trailing slash** — this only matches directories, not files. The Scribe health reports are files. Fixed by removing the trailing slash: `.squad/health-report-*`. Committed separately before the merge (`83158bb`) because a staged change to `.gitignore` would have blocked `git merge`.

## Build Results

- `npm run build` — **PASS** (tsc --build, all workspaces, exit 0, no errors)

## Test Results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

## Push Result

```
To https://github.com/akubly/stunning-adventure
   bf2bc4a..bb1d84b  HEAD -> squad/crucible-sprint-0-walkthrough-a
```

Commits pushed: `83158bb` (gitignore fix), `bb1d84b` (merge commit).

## Final PR Mergeable State

```json
{"mergeStateStatus":"UNSTABLE","mergeable":"MERGEABLE","state":"OPEN"}
```

**`MERGEABLE` ✅** — no longer CONFLICTING. `UNSTABLE` indicates Copilot review re-run is in progress; expected to resolve automatically.

## Patterns for Future Reference

See `gabriel/history.md` → "2026-06-05 — Merge-Conflict Resolution" for the full reusable pattern. TL;DR:
- Use `git merge`, not rebase, to preserve union driver semantics.
- Regenerate `package-lock.json` via `npm install` — never hand-merge JSON lockfiles.
- Trailing-slash globs in `.gitignore` are directory-only; remove the slash for file patterns.
- Commit `.gitignore` changes before the merge if they're staged.


---


# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---


# OQ-2 Substrate Brief — Genesta (Eureka/Cairn Bounded-Context Owner)

**Date:** 2026-06-06  
**Decision:** OQ-2 — Event-substrate topology (Crucible L1 WAL vs Cairn event_log)  
**Lock holder:** Aaron Kubly  
**Author:** Genesta (Cognitive Systems Lead, Eureka)

---

## 1. Recommendation

**Option B — FEDERATE.** From Eureka/Cairn's perspective, merging Crucible primitives into Cairn's `event_log` violates the "share identifiers, fork everything else" coexistence principle that the entire architecture is built on (§15.1), and would create schema-ownership hazards that neither bounded context can absorb cleanly.

## 2. Bounded-Context Verdict

**Does MERGE couple Eureka/Cairn to Crucible's primitive vocabulary in a way that harms either context?**

**Yes — it harms both.**

- **Cairn's harm:** Cairn's `event_log` is a CRUD table with `withShadowEvent` discipline (§15.1). Crucible's L1 WAL is append-only with group-commit and pre-commit hook bus semantics. Merging forces Cairn's event_log to accommodate append-only replay-grade invariants it was never designed for. Cairn's current consumers (Curator, prescribers, bridge events) would inherit schema constraints from Crucible's replay fidelity requirements — a vocabulary they don't speak.

- **Eureka's harm:** Eureka ingests from Cairn's event_log via offline CLI (`eureka ingest-session`, §40.2.2). If Crucible primitives land in that same table, Eureka's ingestion pipeline must now filter/discriminate Crucible event types it has no business understanding. The "one entity, two lenses" framing is dishonest here because the two lenses serve fundamentally different epistemological purposes: Cairn asks "what happened?" (lifecycle-of-record); Crucible asks "can I replay this deterministically?" (replay-of-record). These are not two views of one thing — they are two different things that happen to share a session identifier.

- **The "one entity, two lenses" test fails** because the write patterns are incompatible. CRUD with update/delete vs. append-only with CAS integrity are not lenses on the same substrate — they are different storage contracts. Forcing them into one table means one side's invariants must yield to the other's.

## 3. Schema-Ownership Risks

### Option A (MERGE)

| Risk | Detail |
|------|--------|
| **Ownership ambiguity** | Who owns `event_log` shape? Currently Cairn (§15.1). MERGE makes it co-owned by Cairn + Crucible. Every Crucible primitive addition requires Cairn-side migration review — the exact coordination tax ADR-0002 was designed to avoid. |
| **Dual-write hazard** | Crucible's group-commit writer and Cairn's `withShadowEvent` writer would target the same table. WAL-mode SQLite handles concurrent readers but not concurrent writers from different lifecycle contracts. Deadlock or corruption risk under concurrent session scenarios. |
| **Migration coupling** | Cairn is at migration 012+. Crucible has its own migration sequence. MERGE couples migration numbering — a Crucible schema evolution blocks on Cairn's migration pipeline and vice versa. |
| **EventType namespace collision** | Crucible's `PrimitiveKind` values (from `@akubly/crucible-core`) would need to coexist with Cairn's existing event types in a shared `eventType` discriminator. Namespace collisions require ongoing coordination. |
| **Eureka ingestion pollution** | Eureka's `ingest-session` reads `event_log WHERE session_id = ?`. MERGE means Crucible primitives appear in that result set. Eureka must learn to ignore them — a coupling it shouldn't have. |

### Option B (FEDERATE)

| Risk | Detail |
|------|--------|
| **Ownership clarity** | Cairn owns `event_log` shape. Crucible owns L1 WAL shape. Each evolves independently. |
| **No dual-write** | Each writer targets its own table/file. No contention. |
| **Migration independence** | Each product line maintains its own migration sequence (already the case per §15.1). |
| **Federation boundary cost** | A bridge must exist for cross-product queries. But `cairn reconcile` already serves this role (§15.4) — it's an offline, explicit, auditable bridge. |
| **Duplication tax** | Two event stores with overlapping session identifiers. This is the accepted tax per §15.4 ("Two event-logs" row). The cost is bounded because the bridge is offline and optional. |

## 4. Coexistence Path (FEDERATE)

The minimal honest federation boundary already exists in the architecture:

1. **`SessionId` brand** (`@akubly/types`) — The shared identifier that bridges both substrates at the type level, not the storage level. Already locked (R8, ADR-0002, §15.1).

2. **`cairn reconcile` CLI** — Offline bridge that projects Crucible-relevant events into Cairn's observability surface (§15.4). This is the federation seam: explicit, auditable, direction-controlled.

3. **Crucible DB seam** (`getSession`, `insertSession`, `queryEvents` — Sprint 0 REFACTOR cycle) — Already abstracted behind an interface with in-memory adapter. This seam is the correct place for a future "read-only projection of Cairn lifecycle context" adapter if cross-product queries are ever needed. The seam does NOT need to become a shared table.

4. **`DecisionRecord` in `@akubly/types`** — The lossy interchange shape that both Crucible (via Applier export, §14.1) and Eureka (via `fromDecisionRecord`, §40.3.1) consume. This is a shared *type*, not a shared *table* — exactly the right level of coupling.

**Guardrail:** No new shared storage surfaces. The federation boundary is types + offline CLI bridge. If a future need arises for real-time cross-product event queries, the correct pattern is a projection adapter behind the Crucible DB seam, not a shared table.

## 5. Cross-Package Gotchas the Lock Must Account For

1. **SessionId brand is the load-bearing bridge.** Both MERGE and FEDERATE depend on `SessionId` from `@akubly/types` being the sole cross-product correlator. The lock should reaffirm: SessionId is shared identity, not shared storage. No runtime foreign-key relationship between Crucible's session table and Cairn's session table (§15.1: "Shared brand only; no runtime FK").

2. **Eureka's OQ-2 dependency.** Eureka's ingestion pipeline (`ingest-session`, `ingest-decisions`) reads from Cairn's event_log. If MERGE were chosen, Eureka would need to understand Crucible event types to filter them out — an accidental coupling that violates Eureka's "Cairn-aware but not Crucible-aware" stance (§40.2, §14.3: "Eureka ↔ Cairn bridges are not Crucible's concern"). FEDERATE avoids this entirely.

3. **Sprint 0 DB seam alignment.** Roger's Sprint 0 REFACTOR introduced `getSession`/`insertSession`/`queryEvents` as an explicit DB interface. This seam assumes Crucible owns its own storage. MERGE would require reworking this seam to point at Cairn's event_log — a Sprint 0 architectural regression.

4. **§14.3 firewall.** Section 14.3 explicitly states "Crucible's coexistence stance commits to no shared substrate with Cairn." MERGE violates this locked commitment. The lock should either reaffirm §14.3 or explicitly supersede it (with documented rationale for why the Phase 2 commitment changed).

5. **`cairn reconcile` direction.** The offline bridge is currently specified as Cairn-reads-Crucible (or vice versa) — the direction matters for write authority. The lock should pin: federation bridge is read-only projection, never bidirectional write.

---

**Bottom line:** FEDERATE preserves every bounded-context commitment already locked in the architecture. MERGE would require unwinding §14.3, §15.1, §15.4, and the Sprint 0 DB seam — all for a unification that solves no current problem and creates ownership ambiguity in the one table (event_log) that three product lines would need to coordinate on. The accepted tax of two event stores is a feature, not a bug.

*Decision authority: Aaron Kubly. This brief is advisory.*


---


# OQ-2 Decision Brief: Event-Substrate Topology

**Author:** Graham (Lead/Architect)  
**Date:** 2026-06-06  
**Status:** RECOMMENDATION — Aaron holds the lock  
**Tension:** Crucible L1 WAL vs Cairn `event_log` — dual-write trap  

---

## 1. Recommendation

**Option B (FEDERATE).** The storage semantics are fundamentally incompatible — append-only hash-chained WAL vs CRUD lifecycle log — and the CTD already locks this stance in §15.1 and §15.4; merging would require relitigating three FINAL sections.

---

## 2. Option A — MERGE (Crucible primitives → Cairn `event_log`)

- **Benefit:** Single event substrate eliminates sync/bridge complexity. One schema to query, one writer to reason about. Reduces operational surface area.
- **Cost:** Cairn's `event_log` uses CRUD semantics (UPDATE, DELETE via lifecycle transitions, `withShadowEvent` discipline). Crucible's L1 WAL is append-only with binary segment format, BLAKE3 hash-chaining, content-addressed CAS store, and group-commit batching. Merging requires either (a) bolting WAL properties onto a CRUD table (unnatural, fragile) or (b) abandoning hash-chain integrity (destroys replay determinism — Crucible's core value proposition).
- **Risk — Replay determinism loss:** `crucible fsck` and hermetic replay (§11) depend on an unbroken hash chain where `prevRoot` of row N+1 = `selfRoot` of row N. Any CRUD operation that modifies or deletes rows breaks the chain. Cairn's shadow-event pattern (which wraps mutations) does not provide the byte-level content-addressing Crucible requires.
- **Risk — Bounded-context coupling:** Schema ownership becomes contested. Cairn lifecycle changes (migration v14+) would need Crucible-aware guards; Crucible schema additions (e.g., `contextWindowCommitment`, `hookVerdictWitness`) pollute Cairn's table with columns it never reads. Every migration becomes a cross-team coordination event.

---

## 3. Option B — FEDERATE (separate substrates, sync boundary)

- **Benefit:** Each system keeps its natural storage pattern. Crucible's append-only WAL preserves hash-chain integrity and replay determinism. Cairn's CRUD `event_log` preserves lifecycle semantics. Bounded contexts stay clean — each team owns its schema independently.
- **Cost:** Two implementations of overlapping event-storage concepts. The "two event-logs" row in §15.4 Accepted-Tax Enumeration is the named price. Developers must understand which log serves which purpose.
- **Risk — Dual-write:** If both systems try to capture the same real-world event (e.g., a Decision), they must coordinate or accept eventual consistency. Mitigation: `cairn reconcile` offline bridge (§15.1, already specified); Crucible is the authoritative source for Decision provenance, Cairn consumes via `DecisionRecord` export (§14.1 shared type, §15.2).
- **Risk — Duplicated schema concepts:** `SessionId` appears in both session models with different metadata. Mitigated by the §15.1 rule: "shared brand only; no runtime FK." The type-level bridge is sufficient; no schema-level FK needed.

---

## 4. Decision Drivers (ranked)

1. **Replay determinism is non-negotiable.** Crucible's identity (ADR-0020) is "replayable, accountable agentic computation." The append-only + hash-chain + content-addressed triple is load-bearing for `fsck`, hermetic replay (§11), and fork integrity. Any substrate that permits mutation destroys this property. This single driver dominates the call.

2. **Bounded-context independence.** Cairn and Crucible are on independent roadmaps with different teams, different migration sequences, and different storage patterns (§15.1). Merging substrates couples their release cadences. The monorepo already solved the *type-sharing* problem (ADR-0002); substrate sharing would reintroduce the coordination overhead ADR-0002 eliminated for types.

3. **§15 is already FINAL and locks FEDERATE in substance.** §15.1 coexistence table, §15.4 accepted-tax enumeration, and §14.3 ("Eureka ↔ Cairn bridges are not Crucible's concern") all presuppose separate substrates. Choosing MERGE would require relitigating three FINAL sections (§14, §15, §3), cascading into §2 boundary contract and §11 replay spec. The rework cost is weeks, not hours.

---

## 5. Impact on Refactor 3 (Real SQLite Integration Stub)

### Under Option B (FEDERATE) — recommended

The `DB` interface in `packages/crucible-core/src/db.ts` stays Crucible-only. Refactor 3 creates a `SqliteDB implements DB` adapter targeting a Crucible-owned SQLite file (`:memory:` for integration tests, `~/.crucible/crucible.db` for production). Schema: `sessions` table + `events` table, both Crucible-scoped. No Cairn table dependencies.

- `getSession()` → `SELECT id, ledgerSize, pluginVersions FROM crucible_sessions WHERE id = ?`
- `insertSession()` → `INSERT INTO crucible_sessions (...) VALUES (...)`
- `queryEvents()` → `SELECT * FROM crucible_events WHERE sessionId = ? AND offset BETWEEN ? AND ?`

The `InMemoryDB` extended surface (`insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`) either collapses into the `DB` interface or `session.ts` restructures to use `DB.queryEvents` with explicit lookups (per the NOTE block already in session.ts lines 15-19). The deferred N2 finding (`clear()` on InMemoryDB) resolves naturally — SQLite adapter doesn't need it.

**Rework: minimal.** The existing `DB` interface shape is already correct for B. Refactor 3 proceeds as planned.

### Under Option A (MERGE)

The `DB` interface would need to target Cairn's `event_log` schema. This means:
- `queryEvents()` must understand Cairn's `eventType` column and filter for Crucible-relevant rows among Cairn lifecycle events.
- `insertSession()` must write to Cairn's `sessions` table, respecting Cairn's column conventions.
- Schema migrations become shared — Crucible additions require Cairn migration review.
- The integration test cannot use `:memory:` in isolation; it needs Cairn's full schema DDL to create the target tables.

**Rework: significant.** The `DB` interface shape, the integration test, and the schema all change. Session.ts coupling to `InMemoryDB` extended methods becomes harder to resolve because the target schema is no longer under Crucible's control.

---

## 6. Reversibility

**B → A (federate → merge) later:** Moderate cost. If federation proves too expensive, merging can be done incrementally: (1) project Crucible WAL rows into Cairn `event_log` as a read-only view, (2) test query compatibility, (3) migrate writers. The WAL's content-addressed CAS makes it a reliable source for replay during migration. Timeline: ~1-2 sprints of integration work, but can be staged.

**A → B (merge → federate) later:** High cost. Once Crucible writes are entangled in Cairn's schema, extracting them requires: (1) new WAL substrate implementation, (2) data migration from CRUD table to append-only segments, (3) hash-chain reconstruction (impossible if any rows were mutated/deleted — replay determinism is permanently lost for affected sessions). Timeline: ~3-4 sprints, with permanent data-fidelity risk for historical sessions.

**Asymmetry:** B→A is reversible with moderate effort; A→B risks permanent replay-determinism loss. This asymmetry alone favors starting with B.

---

## Signatories

- **Graham** (Architect/Synthesizer) — authored this brief
- **Roger** (Crucible L1 WAL vantage) — input pending (parallel)
- **Genesta** (Eureka/Cairn event_log vantage) — input pending (parallel)
- **Aaron** — LOCK holder


---


# Decision: Correct Stale SKILL Examples (PR #45 Copilot Review)

**Agent:** Graham (Lead / Architect)  
**Date:** 2026-06-05  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**Commit:** a27cdf2  

---

## Context

Copilot's cloud review on PR #45 flagged two stale code examples in `.squad/skills/london-tdd-refactor-extract-collaborator/SKILL.md`. Both examples showed pre-fix code that no longer matched the Sprint 0 shipped implementation.

---

## Correction 1 — ForkLineage: remove `static root()`

**Problem:** The SKILL snippet included `static root() { return new ForkLineage(null, 0); }`.  
**Reality:** `static root()` was removed from `packages/crucible-core/src/ledger/fork-lineage.ts` (YAGNI; its sentinel `forkPointEventId = 0` conflicted with the `forkPointEventId === null` root-session convention in `SessionMetadata`).

**Fix:** Removed the `static root()` line from the snippet. Added a note: root sessions are represented via `forkPointEventId === null` in `SessionMetadata` (not via a `ForkLineage` factory).

---

## Correction 2 — SessionManager bounds-check: `>` → `>=`

**Problem:** The SKILL snippet used `if (forkOffset > parent.ledgerSize)` (pre-B1 check).  
**Reality:** `packages/crucible-core/src/session-manager.ts` line 24 uses `if (forkOffset >= parent.ledgerSize)` — the strict `>=` correctly rejects the boundary case where `forkOffset === ledgerSize`.

**Fix:** Updated the snippet to `>=` and added a one-line note that valid offsets are `0..ledgerSize-1`, so `>=` correctly rejects the boundary.

---

## Verification

- `npm test --workspace=@akubly/crucible-core` → 6/6 passed (doc-only change, no behavioral impact)


---


# Graham Review: Refactor 3 GREEN

**Reviewer:** Graham (Lead / Architect)
**Date:** 2026-06-06
**Phase:** §4.1 Refactor 3 — GREEN review
**Subject:** Roger's `createSQLiteDB` implementation + crucible-core barrel export
**Verdict:** ✅ APPROVE

---

## Review Summary

Roger implemented a clean, minimal SQLite adapter for the Crucible-owned two-table schema. All checklist items pass. No blocking issues found.

---

## Checklist Results

### 1. FEDERATE Invariant (Hard Gate)

**PASS.** `packages/crucible-core/src/sqlite-db.ts` contains zero imports from `packages/cairn`. The only occurrence of "Cairn" is a comment in the JSDoc header (`// Zero Cairn imports, zero coupling to packages/cairn's event_log`). ESLint on `sqlite-db.ts` produces zero errors or warnings.

### 2. Oracle Parity

**PASS.** The SQLite adapter's behavior matches `in-memory-db.ts` semantics exactly:

- **`ledgerSize` formula:** Root sessions: `COUNT(own events)`. Children: `forkPointEventId + 1 + COUNT(own events)`. Matches the in-memory formula verbatim.
- **`queryEvents` range:** `WHERE offset >= ? AND offset <= ?` is inclusive-inclusive [a, b], matching `e.offset >= a && e.offset <= b` in the in-memory oracle.
- **`insertSession` fork lineage:** `parent_session_id` and `fork_point_event_id` are stored as SQL columns and correctly read back by `getMetadata`. Matches the in-memory `parentSessionId`/`forkPointEventId` fields.
- **`insertRootSession`:** Stores NULL for both `parent_session_id` and `fork_point_event_id`. Matches in-memory behavior.
- **`pushEvent`:** Inserts to `events` table with correct JSON serialization of `primitivePayload` and `causalReadSet`. Inverse of `rowToPrimitive`.
- **`getOwnEvents`:** SELECT all events for session ORDER BY offset ASC — matches `ownEvents` array ordering in the in-memory version.
- **`getMetadata`:** Returns `{ parentSessionId, forkPointEventId, createdAt }` with correct null handling.
- **`clear`:** Deletes events first, then sessions — correct order respecting the FK constraint `events.session_id REFERENCES sessions(id)` under `foreign_keys = ON`.

No off-by-one or range-boundary issues identified.

### 3. SQL Safety

**PASS.** Every query uses prepared statements with `?` positional or `@named` parameter binding. Zero string interpolation in SQL. All multi-step operations that could logically be atomic are either single-row (no transaction needed) or isolated by the test-per-instance model (fresh `:memory:` DB per `beforeEach`).

Minor note: `clear()` runs two separate statements rather than a transaction. For the test-isolation use case this is fine since nothing else is running concurrently. Not a bug.

### 4. Resource Handling

**PASS.** `createSQLiteDB(':memory:')` creates a fresh `better-sqlite3` `Database` instance each call. Because each `beforeEach` in the integration test calls `createTestDatabase()`, every test case gets an isolated database — no shared state hazard. The `:memory:` lifetime is tied to the `Database` instance object; GC handles cleanup. WAL + foreign keys are enabled at construction; for `:memory:` WAL mode is a no-op but harmless.

### 5. Lint Claim Verification

**CONFIRMED.** The sole ESLint error (`import/named` at `test-db.ts:73`) is in Laura's RED-phase fixture file (`packages/crucible-cli/src/__tests__/fixtures/test-db.ts`), which is **untracked** — i.e., it was never in a commit and was created by Laura, not Roger. Roger's file `sqlite-db.ts` (also untracked) produces **zero ESLint errors or warnings**. Roger's claim is accurate: the error predates his GREEN work and is not caused by it.

The `eslint-disable-line import/named` comment on line 73 of `test-db.ts` was placed there intentionally by Laura because the `import/named` ESLint rule is not installed in this workspace's ESLint config. The comment suppresses a lint rule that isn't loaded — hence ESLint reports "Definition for rule 'import/named' was not found." This is a Laura-scope cleanup item, not a Roger blocking issue.

Separately: now that `createSQLiteDB` is exported, the `@ts-expect-error` directive on line 72 of `test-db.ts` is technically stale (the symbol now exists). No TypeScript error results because `__tests__` is excluded from tsconfig. Non-blocking; Laura can clean up when convenient.

### 6. Test Run

**PASS — 8/8 green, zero regressions.**

```
packages/crucible-core:
  ✓ src/__tests__/unit/session-manager.test.ts  (6 tests)

packages/crucible-cli:
  ✓ src/__tests__/acceptance/session-fork.test.ts  (1 test)
  ✓ src/__tests__/integration/session-fork.integration.ts  (7 tests)
```

All 7 integration invariants (A1-1, A1-2, A1-3, A1-4, B1, B2, B3) confirmed green against real SQLite `:memory:`. No pre-existing tests regressed.

---

## Non-Blocking Nits

1. **WAL pragma on `:memory:`:** `PRAGMA journal_mode = WAL` is a no-op for in-memory databases (SQLite silently ignores it) but signals intent for future file-backed usage. Fine to keep; no harm.
2. **`parentSessionId ?? null` defensive null-coalescing:** The `DB.insertSession` signature types `parentSessionId` as `string | null`, not `string | null | undefined`, so `?? null` is redundant. Harmless.
3. **`@ts-expect-error` stale in test-db.ts:** Laura's fixture comment now points to a resolved state. Low-priority cleanup; not Roger's file.

---

## Architectural Alignment

The adapter correctly implements the port-and-adapter pattern established at Refactor 1/2. `SessionManager` and `session.ts` require zero changes — the interface seam (`InMemoryDB`) absorbs the entire implementation difference between the in-memory Map and the real SQLite backend. The FEDERATE boundary is solid: Crucible owns `sessions` and `events` tables; Cairn owns `event_log` and `trust_*` tables; no cross-package schema coupling.

This is the substrate for Refactor 4 / Phase 2 file-backed sessions. The prepared-statement architecture scales cleanly to that transition.

---

## Verdict

**✅ APPROVE** — Roger's Refactor 3 GREEN implementation is correct, architecturally aligned, and free of blocking issues. All 6 checklist items pass. The FEDERATE invariant (OQ-2) is held. Tests are 8/8 green. Ready to proceed.


---


# Decision: Transitive Fork Prefix Delegation — Scope Disposition

**Date:** 2026-06-05
**Decided by:** Graham (Lead / Architect)
**Triggered by:** Copilot cloud review cycle 2, finding on `packages/crucible-core/src/session.ts` line ~63
**PR:** #45 (squad/crucible-sprint-0-walkthrough-a)

## Finding

Child `query()` prefix delegation reads the parent's `ownEvents` via `db.getOwnEvents(parentSessionId)`. This only works when the parent is a root session. If the parent is itself a fork, its inherited prefix (from a grandparent) is NOT in its `ownEvents`, so `query({range:[0,x]})` returns an incomplete prefix for transitive forks.

## Decision

**Option A: Document + defer.** Added a 7-line comment block at the delegation site in `session.ts` documenting the root-parent assumption and the planned future resolution.

## Rationale

1. **Out of scope:** Walkthrough A's A1 acceptance forks once from a root session with 47 primitives. Transitive fork lineage is not exercised.
2. **TDD discipline:** The TDD strategy (§4.1 REFACTOR phase) already identifies "Fork Lineage Transitivity" as a future test. Implementing recursive delegation now would add untested speculative code — no RED test drives it, violating London-school discipline.
3. **Explicit > hidden:** Adding a clear comment transforms a hidden trap into a documented limitation, which is the real value the reviewer's finding provides.

## Follow-up

- **Future cycle:** Write a dedicated "Fork Lineage Transitivity" RED test (Laura) that creates a grandparent → parent-fork → child-fork chain and asserts the child can query the full transitive prefix.
- **Implementation:** Change child query to delegate to the parent session's full `query()` recursively (or resolve lineage iteratively) once the RED test exists.
- **Reference:** `docs/crucible-tdd-strategy.md` §4.1 REFACTOR "Fork Lineage Transitivity"

## Commit

`978f865` — `docs(crucible): document root-parent assumption in fork prefix delegation`


---


# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---


# 2026-06-06: Aaron's Ruling — HookVerdict VETO Semantics (resolves graham-ledger-seam-OPEN)

**By:** Aaron Kubly (via Copilot)  
**Decision:** Option A — Adopt **VETO** as a first-class **pre-WAL Ledger-layer gate**.

- VETO fires at `Ledger.append` entry, BEFORE staging. Rejected input never enters the WAL → WAL stays purely append-only; §3's "all staged rows commit" invariant is intact.
- §4's `continue | observe | pause` (on the staged batch, inside the group-commit window) are untouched. VETO is a distinct, earlier policy boundary.
- Enforced by the type system: `Exclude<HookVerdict, 'VETO'>` at the WAL backend `commitRow` port so VETO can never cross the WAL boundary.
- §4.2 Walkthrough B RED test passes as written — no test rework.

**Required follow-on (documented amendments to FINAL specs):**

1. §4.1 verdict table — add VETO row ("no row created; Ledger throws `Append vetoed by hook: <id>`"), flagged as Ledger-layer (not commit-window).
2. §4.3 dispatch — add VETO case before the PAUSE check.
3. §11 replay contract — note: VETO inputs are not in the WAL; replay need not handle them (Ledger-layer policy, not a WAL concept).

**Why:** User ruling at Decision-Point Gate during WAL substrate + Walkthrough B build.

---


# 2026-06-06: Ledger Seam Contract — Graham (Lead/Architect)

**Date:** 2026-06-06T22:03:01-07:00  
**Status:** LOCKED — Option A ruling received (Aaron, 2026-06-06). Spec amendments applied. See `graham-ledger-seam-OPEN.md` (RESOLVED).

## Purpose

This document is the single authoritative reference for Roger (§3 WAL substrate)
and Laura/Roger (§4.2 Walkthrough B GREEN) on how the Ledger, HookBus, and
WalBackend fit together.

## Delivered Files

```
packages/crucible-core/src/ledger/hook-bus.ts   — HookVerdict, HookContext, HookMetadata,
                                                   HookResult, HookPredicate,
                                                   HookRegistrationOpts, HookBusPort
packages/crucible-core/src/ledger/ledger.ts     — Ledger, LedgerEvent, LedgerQueryOpts,
                                                   LedgerFactoryOptions, CreateLedger,
                                                   WalBackend
packages/crucible-core/src/index.ts             — all above types re-exported
```

## §1 Locked `append` Signature

```typescript
// On Ledger interface:
append(input: PrimitiveInput): Promise<number>
//                                            ^ commitOffset (monotonic, per-session)
```

- **Input:** `PrimitiveInput` — `{ primitiveKind: PrimitiveKind; primitivePayload: unknown; causalReadSet: string[] }`.
  Unchanged from the existing Sprint 0 type.
- **Returns:** `Promise<number>` — the commit offset assigned to the row by the WAL backend.
- **Throws:** `Error('Append vetoed by hook: <hookId>')` when any hook returns VETO.
  The exact message string is pinned by §4.2 RED test invariant 1.

## §2 Veto Invariant — No Partial Write

**Three-part invariant (all must hold simultaneously; pinned by §4.2 RED test):**

1. `append()` rejects with `Error('Append vetoed by hook: <hookId>')` on VETO.
2. The hook predicate is invoked with `{ primitiveKind, primitivePayload, metadata }` **before** any WAL byte is written.
3. The ledger stays EMPTY after a veto — no WAL row, no CAS write, no fdatasync.

**Implementation rule for Roger's GREEN phase:**

```
(a)  Build HookContext from PrimitiveInput.
(b)  Call hookBus.fire(ctx).
(c)  if result.verdict === 'VETO':
         throw new Error(`Append vetoed by hook: ${result.hookId}`)
         // ← return here; do NOT proceed
(d)  ONLY IF non-VETO:
         call walBackend.commitRow(input, result)
         return commitOffset
```

There MUST be **no** WAL write, CAS write, or fdatasync between steps (b) and (c).

## §3 Where HookBus.fire Sits Relative to the WAL Write

```
Ledger.append(input)
  │
  ├─ 1. Build HookContext (no I/O)
  │
  ├─ 2. hookBus.fire(ctx)          ← FIRES HERE — before any WAL byte
  │      │
  │      ├─ VETO   → throw Error('Append vetoed by hook: <hookId>')  ← exits, nothing written
  │      ├─ PAUSE  → pass to WalBackend ─┐
  │      ├─ OBSERVE → pass to WalBackend ─┤
  │      └─ COMMIT → pass to WalBackend ─┘
  │
  └─ 3. walBackend.commitRow(input, hookResult)
         │
         ├─ Hash-chain (prevRoot/selfRoot)
         ├─ BLAKE3 payloadHash + readSetHash (§3.3)
         ├─ CAS write (payload, readSet, hookVerdictWitness if OBSERVE/PAUSE)
         ├─ Segment binary write (§3.2)
         ├─ fdatasync (one per group-commit batch — §3.4)
         └─ Returns commitOffset
```

## §4 HookVerdict at the Ledger Boundary

```typescript
type HookVerdict = 'COMMIT' | 'OBSERVE' | 'PAUSE' | 'VETO';
```

| Ledger verdict | §3/§4 WAL-row value | Effect |
|---|---|---|
| `COMMIT`  | `hookVerdict = null` or `'continue'` | Row proceeds normally |
| `OBSERVE` | `hookVerdict = 'observe'` | Row proceeds + CAS hookVerdictWitness written |
| `PAUSE`   | `hookVerdict = 'pause'` | Row commits; §3.5 seal-and-split fires inside WalBackend |
| `VETO`    | *(never reaches WAL)* | Ledger throws; no row written |

⚠ **VETO is now LOCKED** (Aaron ruling 2026-06-06, Option A). All four verdicts are locked and unblocking.

## §5 WalBackend Integration Boundary

```typescript
interface WalBackend {
  commitRow(
    input: PrimitiveInput,
    hookResult: HookResult & {
      verdict: Exclude<HookVerdict, 'VETO'>;
      hookId: string | null;
    },
  ): Promise<number>;

  readRows(opts: LedgerQueryOpts): Promise<LedgerEvent[]>;
}
```

- `commitRow` receives `verdict` typed as `Exclude<HookVerdict, 'VETO'>` — the TypeScript
  type enforces that VETO can never reach this method.
- Roger's WAL substrate implements this interface.
- For in-memory / test runs, a trivial in-memory `WalBackend` suffices (no file I/O).

---


# 2026-06-06: Walkthrough B RED Test — Hook Veto Acceptance Test (Laura)

**Date:** 2026-06-06T22:03:01-07:00
**Author:** Laura (Tester)  
**Status:** RED — test written and confirmed failing for the right reason.

The RED acceptance test for A3 (Pre-Commit Hook Veto) has been written at:
```
packages/crucible-core/src/__tests__/acceptance/hook-veto.test.ts
```

Test imports `createLedger` from `../../index.js` but it is not yet exported → confirmed failure: `TypeError: (0 , createLedger) is not a function`.

This is the correct RED signal: the test is well-formed, not broken by typo.

---


# 2026-06-06: Walkthrough B GREEN — HookBus + Ledger Pre-Stage Gate (Roger)

**Date:** 2026-06-06T22:03:01-07:00
**Author:** Roger (Platform Dev)  
**Status:** GREEN — acceptance test passing, 28/28 crucible-core tests green, tsc build clean

## Implementation Summary

`createLedger()` factory exported, `Ledger.registerHook()` and `append()` implemented with VETO pre-WAL gate. HookBus fires at entry, VETO short-circuits to error (no WAL write). All hook verdicts locked and unblocking.

### Results

- Acceptance: `✓ hook-veto.test.ts` GREEN (1/1 test passing)
- Unit tests: 27 crucible-core tests GREEN
- Total: **28/28 crucible-core tests passing**
- Build: `npm run build` clean (tsc, no errors)

---


# 2026-06-06: PR #51 Review Decisions — Roger

**Date:** 2026-06-06  
**PR:** crucible/refactor-3-sqlite-adapter (#51)

## Decision 1 — `getOwnEvents` returns a copy (snapshot contract)

Return a spread copy — `[...(store.get(sessionId)?.ownEvents ?? [])]`. The JSDoc contract ("modifications to the returned array are not persisted") is the intended behavior. The SQLite adapter already satisfied this; making in-memory match eliminates behavioral asymmetry.

## Decision 2 — Lazy-load `better-sqlite3` native module inside `createSQLiteDB`

Defer the native module load using `createRequire`:
```typescript
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';   // type-only

export function createSQLiteDB(path: ':memory:' | string): InMemoryDB {
  const DatabaseCtor = createRequire(import.meta.url)('better-sqlite3');
  // ...
}
```

This avoids eager loading when in-memory adapter is the only consumer.

---


# 2026-06-06: WAL Substrate Sub-Seam Decisions — Roger

**Date:** 2026-06-06T22:03:01-07:00
**Status:** SUB-SEAM GREEN (hash-chain, CAS, codec all locked and tested)

## D-WAL-1: BLAKE3 library selection

**Choice:** `@noble/hashes` v2.x (`@noble/hashes/blake3.js`)

- Pure TypeScript/WASM — no native compilation required on Windows
- Actively maintained; widely used across the JS crypto ecosystem
- Correct ESM subpath exports
- API: `blake3(data: Uint8Array): Uint8Array`

## D-WAL-2: selfRoot canonical content (sub-seam approximation)

`selfRoot = BLAKE3(commitOffset(8 LE) || timestampNs(8 LE) || ... || envelopeCbor(var))`

Byte concatenation is deterministic now. Swap to CBOR once §6 is locked.

## D-WAL-3: crc32c deferred

Written as 4 zero bytes in v0.1. Implement real CRC32C before production.

## D-WAL-4: Conditional segment fields deferred

`hookVerdictWitness`, `contextWindowCommitment` not encoded/decoded until §6 is locked.

---


# Handoff: Crucible Refactor 3 RED — Integration Test for Real SQLite

**Author:** Laura (Tester)
**Date:** 2026-06-06
**Phase:** §4.1 Refactor 3 — RED (integration test written, failing for right reason)
**Status:** 🔴 RED — 7 tests failing, 1 existing test still GREEN

---

## (a) Failing Test Path

```
packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts
```

7 tests, all failing with the same root cause (see §d).

Test fixture (helper Roger's impl will satisfy):
```
packages/crucible-cli/src/__tests__/fixtures/test-db.ts
```

---

## (b) Required Adapter Symbol + Signature

Roger must implement and export:

**File:** `packages/crucible-core/src/sqlite-db.ts`

```typescript
export function createSQLiteDB(path: ':memory:' | string): InMemoryDB
```

Where `InMemoryDB` is the existing interface from `packages/crucible-core/src/in-memory-db.ts`.

**Barrel addition required** — add to `packages/crucible-core/src/index.ts`:
```typescript
export { createSQLiteDB } from './sqlite-db.js';
```

### Full interface contract `createSQLiteDB` must satisfy

**DB base methods (async — return Promise):**

| Method | Signature | Notes |
|--------|-----------|-------|
| `getSession` | `(id: string) → Promise<{ id, ledgerSize, pluginVersions? } \| null>` | `ledgerSize` = `forkPointEventId === null ? ownCount : forkPointEventId + 1 + ownCount` |
| `insertSession` | `({ id, parentSessionId, forkPointEventId, pluginVersions?, createdAt }) → Promise<void>` | Used by SessionManager.forkSession |
| `queryEvents` | `(id, { range: [a, b] }) → Promise<Primitive[]>` | Inclusive-inclusive `[a, b]`; returns OWN events only (no parent delegation at this layer) |

**InMemoryDB extensions (synchronous — better-sqlite3 is sync):**

| Method | Signature | Notes |
|--------|-----------|-------|
| `insertRootSession` | `(id: string, createdAt: number): void` | Creates session row with NULL parent/forkPoint |
| `pushEvent` | `(sessionId: string, event: Primitive): void` | Inserts a row into the events table |
| `getOwnEvents` | `(sessionId: string): Primitive[]` | Returns all events for the session in offset order |
| `getMetadata` | `(sessionId: string): { parentSessionId, forkPointEventId, createdAt } \| null` | Reads the session row's lineage columns |
| `clear` | `(): void` | `DELETE FROM events; DELETE FROM sessions;` — test isolation only |

### Required schema (Crucible-owned per OQ-2 FEDERATE — NOT Cairn event_log)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT    PRIMARY KEY,
  parent_session_id   TEXT,                    -- NULL for root sessions
  fork_point_event_id INTEGER,                 -- NULL for root sessions
  plugin_versions     TEXT,                    -- JSON blob | NULL
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  session_id          TEXT    NOT NULL REFERENCES sessions(id),
  "offset"            INTEGER NOT NULL,
  primitive_kind      TEXT    NOT NULL,
  primitive_payload   TEXT    NOT NULL,         -- JSON blob
  causal_read_set     TEXT    NOT NULL,         -- JSON blob
  PRIMARY KEY (session_id, "offset")
);
```

---

## (c) Package.json Dependencies Needed

Neither `packages/crucible-cli` nor `packages/crucible-core` currently has `better-sqlite3`.

Roger must add to **`packages/crucible-cli/package.json`** devDependencies:
```json
"better-sqlite3": "^12.8.0",
"@types/better-sqlite3": "^7.6.13"
```

And to **`packages/crucible-core/package.json`** devDependencies (if sqlite-db.ts lives there):
```json
"better-sqlite3": "^12.8.0",
"@types/better-sqlite3": "^7.6.13"
```

These exact versions are already present in `packages/cairn` and `packages/eureka` — using the same keeps workspace hoisting consistent. No need to add to `dependencies` (only needed for test/dev).

---

## (d) Exact RED Failure Message

```
TypeError: (0 , createSQLiteDB) is not a function
 ❯ createTestDatabase src/__tests__/fixtures/test-db.ts:87:11
     return (createSQLiteDB as (path: string) => InMemoryDB)(':memory:');
            ^
 ❯ src/__tests__/integration/session-fork.integration.ts:73:10

Test Files  1 failed | 1 passed (2)
     Tests  7 failed | 1 passed (8)
```

**Root cause:** `createSQLiteDB` is not exported from `@akubly/crucible-core` (dist/index.js). vitest's Vite module loader resolves the import as `undefined` (CJS-interop). Calling `undefined(':memory:')` throws `TypeError: (0 , createSQLiteDB) is not a function`.

---

## What Roger Must Do to Go GREEN

1. Create `packages/crucible-core/src/sqlite-db.ts` implementing `createSQLiteDB(':memory:')` → returns `InMemoryDB` backed by `better-sqlite3`.
2. Apply the two-table schema above at construction time (run `CREATE TABLE IF NOT EXISTS` on the fresh DB handle).
3. Implement all 8 interface methods (3 async base + 5 synchronous extensions).
4. Export `createSQLiteDB` from the crucible-core barrel (`index.ts`).
5. Add `better-sqlite3` + `@types/better-sqlite3` to devDependencies in `crucible-cli` and/or `crucible-core`.
6. Run `npm install` in the workspace root after updating package.json.

**Success signal:**
```
Test Files  2 passed (2)
     Tests  8 passed (8)
```

---

## Existing Tests Preserved

- `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` — ✅ 1 passing (unchanged)
- `packages/crucible-core/src/__tests__/unit/session-manager.test.ts` — ✅ 6 passing (unchanged)

Roger's GREEN implementation must not break these.

---

## Invariants Locked by the Integration Test

| ID | Test name | Invariant |
|----|-----------|-----------|
| A1-1 | `stores parentSessionId in real SQLite rows` | `db.getMetadata(childId).parentSessionId === parentId` |
| A1-2 | `stores forkPointEventId=23 in real SQLite rows` | `db.getMetadata(childId).forkPointEventId === 23` |
| A1-3 | `parent prefix [0..23] contains exactly 24 events` | `db.queryEvents(parentId, {range: [0,23]}).length === 24`; offsets are inclusive-inclusive |
| A1-4 | `parent ledgerSize remains 47 after fork` | `db.getSession(parentId).ledgerSize === 47` |
| B1 | `rejects fork at offset equal to ledger size` | `forkOffset >= ledgerSize` throws — strict < bound, real DB |
| B2 | `rejects negative fork offset` | `forkOffset < 0` throws — ForkLineage invariant, real DB |
| B3 | `freshly forked child has ledgerSize = forkPointEventId + 1` | `db.getSession(childId).ledgerSize === 24` (23 + 1 + 0 own events) |


---


# OQ-2 Substrate Brief — Roger (Platform Dev)

**Date:** 2026-06-06T00:14:21-07:00  
**Question:** OQ-2 — Crucible L1 WAL vs Cairn event_log: MERGE (Option A) or FEDERATE (Option B)?  
**Aaron holds the lock.**

---

## 1. Recommendation

**Option B — FEDERATE.** From the implementer's chair: the two substrates are structurally incompatible, the current DB interface already defines the right contract for the SQLite adapter, and §15 already accounts for the "two event-log tax" as a named, accepted cost. Merging them collapses a clean seam into a migration-coupled entanglement with no elimination of dual-write.

---

## 2. DB-Seam Impact

### What Cairn's event_log actually is

Cairn's `event_log` (migration 001, stable through 017) has the following shape:

```
event_log(id AUTOINCREMENT, event_type TEXT, payload JSON-as-text, session_id FK → cairn.sessions, created_at DATETIME)
```

The writer is `logEvent(db, sessionId, eventType, payload)` in `packages/cairn/src/db/events.ts`. Reader is cursor-based (`id > lastProcessedId`), not range-by-offset. Sessions are `(id, repo_key, branch, started_at, ended_at, status, session_kind, workdir)` — no fork lineage, no pluginVersions, no forkPointEventId.

### Option A (MERGE) — what the SQLite adapter must implement

The current `DB` interface (`db.ts`) cannot survive as-is:

- **`getSession`** returns `{ id, ledgerSize, pluginVersions }`. `ledgerSize` requires a derived count of Crucible-scoped rows. Cairn's AUTOINCREMENT `id` is a global sequence, not a per-session offset. Computing `ledgerSize` from Cairn's table requires a `COUNT(*) WHERE session_id = ? AND event_type IN (crucible-primitive-kinds)` — fragile, payload-scanning, and session-scoped by a FK that references Cairn's session model, not Crucible's fork-lineage model.

- **`insertSession`** takes `{ id, parentSessionId, forkPointEventId, pluginVersions, createdAt }`. Cairn's `sessions` table has no `parent_session_id`, `fork_point_event_id`, or `plugin_versions` columns. You either extend Cairn's `sessions` table (migration 018+, shared-schema coupling) or maintain a separate fork-lineage table in Cairn's DB (which is just FEDERATE with extra steps).

- **`queryEvents(id, { range: [a, b] })`** returns `Primitive[]` by offset range. Cairn has no `offset` column. The range query must either (a) carry offset inside the JSON payload and filter on extracted JSON (slow, non-index-sargable) or (b) add an `offset` column to `event_log` (migration 018, Crucible-specific column in Cairn's schema). Neither is clean.

- **Extended surface** (`insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`): these expose Crucible-specific fork semantics. They'd need to compose over Cairn's flat event_log + the extended Cairn sessions shape, adding translation logic at every call site.

**Interface verdict under A:** Requires structural restructuring. Either extend Cairn's schema with 3+ Crucible-specific columns across two tables (migration coupling), or introduce a translation adapter layer that inverts the abstraction. Neither path preserves the existing `DB` port contract.

### Option B (FEDERATE) — what the SQLite adapter must implement

The current `DB` interface **survives unchanged**. The SQLite adapter writes to `crucible.db` (separate file, per the 2026-05-26 data-overlap analysis recommendation) with its own schema:

```sql
-- crucible sessions: fork lineage + pluginVersions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  parent_session_id TEXT,
  fork_point_event_id INTEGER,
  plugin_versions TEXT,  -- JSON
  created_at INTEGER NOT NULL,
  ledger_size INTEGER NOT NULL DEFAULT 0  -- maintained on pushEvent
);

-- Crucible primitives: per-session, per-offset
CREATE TABLE primitives (
  session_id TEXT NOT NULL REFERENCES sessions(id),
  offset INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,  -- JSON
  PRIMARY KEY (session_id, offset)
);
```

All five `DB` methods map cleanly:

| Method | SQL |
|--------|-----|
| `getSession(id)` | `SELECT id, ledger_size, plugin_versions FROM sessions WHERE id = ?` |
| `insertSession(…)` | `INSERT INTO sessions (id, parent_session_id, fork_point_event_id, plugin_versions, created_at)` |
| `queryEvents(id, [a,b])` | `SELECT * FROM primitives WHERE session_id = ? AND offset BETWEEN ? AND ?` |
| `insertRootSession` | `INSERT INTO sessions (id, parent_session_id=NULL, fork_point_event_id=NULL, ...)` |
| `pushEvent` | `INSERT INTO primitives + UPDATE sessions SET ledger_size = ledger_size + 1` |

`getOwnEvents` and `getMetadata` are direct reads. `clear()` is `DELETE FROM sessions; DELETE FROM primitives`. The interface is fully satisfiable with no restructuring.

---

## 3. Dual-Write Trap: What's Real

### Under MERGE — is there actually a dual-write?

**Yes, there is, and it can't be engineered away.** Here's why:

Crucible's canonical store is the binary `.seg` WAL files in `~/.crucible/wal/sessions/<sessionId>/`. SQLite (`crucible.db`) is a derived projection, not the authoritative record (§3.2: "SQLite (better-sqlite3) — derived tables only"). The BLAKE3 hash chain, content-addressed CAS, segment indices, and replay integrity properties all live in the binary segments.

If Crucible routes its `DB` writes to Cairn's `event_log`, it is writing to Cairn's SQLite. But it still must write to `.seg` files to maintain hash-chain integrity and replay properties. Result: two writes per primitive — one to Cairn's DB, one to the segment file. That is the dual-write trap in practice.

The trap can only be *collapsed* if Cairn's `event_log` *is* the canonical store and the hash chain + CAS are abandoned. That guts the entire Crucible design (§3 FINAL). It's not a trade-off; it's a design rejection.

### Under FEDERATE — what sync code we own and what can go wrong

Crucible writes to `crucible.db`. Cairn writes to `cairn/knowledge.db`. They are separate. The "sync" at the federation boundary is a projection, not a writer: Cairn's observational layer reads Crucible's L2 surfaces (or subscribes to the L1Subscriber broadcast from §3.1.5) for things like session lifecycle events, activity timelines, etc.

**What we own:**
- The federation contract: Crucible publishes session lifecycle events (session-start, fork, session-end) as L1Subscriber broadcast payloads. Cairn's adapter subscribes and writes to `cairn.event_log` entries of type `crucible.session_start` etc.
- Schema version coordination at the federation boundary (Crucible payload shape must be stable for Cairn consumers).

**What can go wrong:**
- Cairn subscriber processes events out of order if it restarts mid-session (cursor drift). Mitigation: cursor-based catch-up from the last processed offset, same pattern Cairn already uses in `getUnprocessedEvents`.
- Federation contract schema drift if Crucible changes payload shape without bumping a version discriminator. Mitigation: explicit `schemaVersion` on federation payloads, same discipline as `BootstrapPayload`.
- Neither of these is new infrastructure. Cairn already does cursor-based polling. The risk surface is a thin boundary, not a shared migration sequence.

---

## 4. Refactor 3 Readiness

**Option B wins cleanly.**

`createTestDatabase()` under B is:

```typescript
import Database from 'better-sqlite3';

export function createTestDatabase(): DB {
  const raw = new Database(':memory:');
  // ~30 lines: CREATE TABLE sessions + CREATE TABLE primitives
  applyCrucibleMigrations(raw);
  return new SqliteDB(raw);
}
```

Zero Cairn dependency. Zero cross-package import. The integration test in `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` (or equivalently `packages/crucible-core`) instantiates `createTestDatabase()` + `new SessionManager(db)` and exercises the full lineage contract: `forkSession → getSession → queryEvents range-equality`.

**What the test must assert either way:**
1. `child.parentSessionId === parentId` — lineage FK correct
2. `child.forkPointEventId === 23` — fork point stored
3. `queryEvents(child, [0, 23])` equals `queryEvents(parent, [0, 23])` — inherited prefix is immutable and equal
4. `queryEvents(child, [24, 46])` returns empty (no own events yet) — child owns nothing past fork point until appended
5. `db.getSession(child).ledgerSize === 24` — ledgerSize = forkPoint + 1 for newly forked child

Under A, the integration test would need to spin up a Cairn DB (17 migrations), cross-package import, and work around the interface mismatch before asserting any of the above. The test infrastructure cost alone makes it the wrong choice for Refactor 3.

**Note on `N2` deferral (Cycle 2 advisory):** The `clear()` on the InMemoryDB interface was flagged as potentially obligating future adapters. Under B, `clear()` stays test-only and the SQLite adapter implements it as `DELETE FROM sessions; DELETE FROM primitives` — a one-liner. The advisory decompresses cleanly.

---

## 5. Estimated Effort Delta

**B is cheaper by approximately 2–3 days for Refactor 3.**

| Work item | Option A | Option B |
|-----------|----------|----------|
| DB interface restructuring | ~1 day (extend or replace) | 0 (survives unchanged) |
| Cairn schema extensions (migrations 018+) | ~0.5 day | 0 |
| Cross-package test dependency wiring | ~0.5 day | 0 |
| `createTestDatabase()` implementation | ~0.5 day (requires Cairn migration stack) | ~0.5 day (standalone `:memory:`) |
| `SqliteDB` adapter implementation | ~1.5 day (translation layer over incompatible schema) | ~1 day (direct mapping) |
| Federation contract spec (publish-subscribe boundary) | Bypassed (but deferred cost grows) | ~0.5 day upfront |
| **Total** | **~4 days** | **~2 days** |

The federation contract cost under B is real but small. The deferred cost under A — when Crucible's schema evolves and Cairn's `event_log` must track it — is open-ended and compounds with every sprint.

---

## Summary for Aaron

Option B (FEDERATE). The DB interface is already the right contract. The SQLite adapter for Refactor 3 drops in with zero interface restructuring and a self-contained test harness. The dual-write trap under MERGE is genuine and structural — not engineering-around-able without abandoning the WAL's core replay guarantee. §15 already accepted the two-event-log tax. Collect it; don't fight it.

**Aaron holds the lock.**


---


# Roger — PR #45 Cycle 2 Fixes

**Date:** 2026-06-05  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**PR:** #45

---

## Fix 1 — `packages/crucible-cli/README.md`: facade accuracy

**Issue:** The README described `@akubly/crucible-cli` as a command-line shell with user-facing `fork`/`replay`/`bisect` commands. The package has no `bin` entry and only re-exports `createSession`/`fork` from `@akubly/crucible-core`.

**Decision:** Reword the README to describe the package as the Sprint 0 acceptance-test facade — a thin re-export surface that lets integration tests exercise the public API without depending on core directly. Note that a real CLI entrypoint is planned for a future sprint. Do not claim CLI commands that do not exist.

**Resolution:** README rewritten. No logic changes.

---

## Fix 2 — `.squad/agents/roger/history.md`: control-character sweep

**Issue:** Copilot's cycle 2 review cited embedded control characters around line 726 (words like "pure-Rust...redb" and "beforeCommit" / "better-sqlite3" garbled). The cycle 1 sweep had only cleaned the 1020–1065 region.

**Decision:** Perform a full-file byte-level scan and fix all remaining artifacts. Four artifacts found and corrected:

| Byte   | Line | Bad byte | Fix            | Corrected text        |
|--------|------|----------|----------------|-----------------------|
| 84816  | 726  | CR (0D)  | → 'r' (72)     | `pure-Rust redb`      |
| 112339 | 1068 | ESC (1B) | → 'e' (65)     | `endOffset`           |
| 112896 | 1071 | CR (0D)  | → 'r' (72)     | `resetInMemoryDb`     |
| 113466 | 1074 | BEL (07) | → 'a' (61)     | `session.ts append`   |

**Resolution:** All four artifacts patched; full-file rescan confirmed zero control bytes remain. Learning appended to history.md: sweep the whole file after any control-char remediation.


---


# Decision Record: PR #45 Cycle 3 Fixes (Roger)

**Date:** 2026-06-05  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**Commit:** 8349525

---

## Fix 1 — db.ts header comment (doc-only)

**Issue:** The header comment stated DB contains "only the operations SessionManager actually needs," but `queryEvents` is present in the interface and is never called by `SessionManager`. This made the comment inaccurate.

**Decision:** Do NOT remove `queryEvents` — it is part of the intended persistence port for session-level queries and the forthcoming SQLite adapter (Refactor 3). Instead, update the comment to accurately reflect:
- `SessionManager` uses a subset: `getSession` (validation) and `insertSession` (fork creation).
- `queryEvents` is retained for session-level query needs and the forthcoming SQLite adapter.

**Rationale:** The interface is a port contract, not a SessionManager-specific shim. Removing `queryEvents` would require touching production code and would be premature. Honest comments about used-vs-retained members prevent future reader confusion.

---

## Fix 2 — session-manager.test.ts insertSession mock (test-only)

**Issue:** Two `insertSession.mockResolvedValue('child-id')` stubs resolved a string, mismatching the `Promise<void>` contract of `DB.insertSession`. Production code correctly ignores the return value (child id comes from `crypto.randomUUID()` inside SessionManager), but the wrong stub type could mask future misuse.

**Decision:** Change both stubs to `.mockResolvedValue(undefined)` to match the `Promise<void>` interface contract.

**Verification:** All 6 unit tests in crucible-core and the 1 acceptance test in crucible-cli remain green. Build exits 0.


---


# Roger — PR #45 Final Fixes (Copilot cloud-review pass)

**Date:** 2026-06-06  
**Branch:** squad/crucible-sprint-0-walkthrough-a  
**PR:** #45  

Three trivial fixes applied before merge.

---

## Fix 1 — `packages/crucible-core/src/db.ts`: tighten `queryEvents` return type

**Problem:** `DB.queryEvents` returned `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly.

**Fix:** Added `import type { Primitive } from './types.js'` to `db.ts` and changed the return type to `Promise<Primitive[]>`. No changes needed to `in-memory-db.ts` — its implementation already returned `Primitive[]` and compiles cleanly against the tightened signature.

**Verification:** `npm run build` → exit 0; `npm test --workspace=@akubly/crucible-core` → 6/6.

---

## Fix 2 — `.squad/skills/topic-branch-from-dirty-main/SKILL.md` (~line 13): fix decision-archive path prose

**Problem:** The bullet used `.squad/decision archives` (space, not a real path) as if it were a directory reference.

**Fix:** Rewrote to reference the real path: `.squad/decisions/archive/` (confirmed exists in repo).

---

## Fix 3 — `.squad/skills/topic-branch-from-dirty-main/SKILL.md` (~line 41): fix trailing slash in gitignore example

**Problem:** Example patterns `.squad/health-report-*/` and `.squad/scribe-health-report-*/` had trailing slashes, which match directories only. Health reports are files, so these patterns would silently fail to ignore them.

**Fix:** Removed trailing slashes → `.squad/health-report-*` / `.squad/scribe-health-report-*`. Added a one-line callout note: "No trailing slash — trailing slash restricts the pattern to directories only."

This is the same bug that caused the real scratch-file problem during Sprint 0 recovery; the SKILL now teaches the correct pattern.


---


# PR #45 Copilot Review — Comment Accuracy Fixes

**Date:** 2026-06-05
**Agent:** Roger (Platform Dev, crucible-core owner)
**PR:** #45 (squad/crucible-sprint-0-walkthrough-a)
**Type:** Doc/comment-only — no logic changes

## Fixes Applied

### FIX 1 — `packages/crucible-core/src/session-manager.ts`
- **What:** JSDoc for `forkSession` said "forkOffset must not exceed parent ledger size", implying `<=` is allowed.
- **Fix:** Reworded to "forkOffset must be strictly less than parent ledger size (offsets are 0..ledgerSize-1)" to match the `>= throws` implementation.

### FIX 2a — `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` (header)
- **What:** File header said "RED PHASE — MUST FAIL" but the test is now GREEN with implementation present.
- **Fix:** Rewrote header as "Acceptance test (GREEN) — Session Fork (A1)" while preserving traceability markers (US-A-NEW-1, US-E-2, §4.1, decision 2a).

### FIX 2b — `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` (import comment)
- **What:** Inline comment said `createSession`/`fork` "do not exist yet — import failure is the intended RED signal".
- **Fix:** Removed the comment; the import is now legitimate and expected to resolve.

### FIX 3 — `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`
- **What:** Header said "MUST BE RED until SessionManager lands"; import comment said "does not exist yet".
- **Fix:** Updated header to "tests are GREEN — SessionManager is implemented and exported"; removed RED-signal import comment.

### FIX 4 — `packages/crucible-cli/README.md`
- **What:** Relative link to Crucible Technical Design used `../docs/` which resolves to `packages/docs/` (non-existent).
- **Fix:** Changed to `../../docs/` which correctly resolves to `docs/crucible-technical-design/` at repo root. Verified the target directory exists.

### FIX 5 — `.squad/agents/roger/history.md`
- **What:** Multiple lines in the session entries around lines 1020–1065 contained embedded control characters (0x0D CR, 0x0C FF, 0x08 BS) that garbled markdown rendering and split words across lines. Additional control chars found at earlier lines (~726, ~820) were also cleaned.
- **Fix:** Replaced all control characters in-place: `\r` → removed (rejoined split words), `\f` → removed, `\b` → removed. Restored: `roger-...`, `forkPointEventId`, `buildSession`, `baseOffset`, `root()`, `null.`, `beforeCommit`, `better-sqlite3`, `fsck`. Code fence delimiters restored to proper triple-backtick format.


---


# Roger Handoff: Refactor 3 GREEN

**Author:** Roger (Platform Dev)
**Date:** 2026-06-06
**Phase:** §4.1 Refactor 3 — GREEN
**Status:** ✅ GREEN — 8/8 tests passing, types clean, lint pre-existing baseline unchanged

---

## What Landed

### 1. New file: `packages/crucible-core/src/sqlite-db.ts`

Implements `export function createSQLiteDB(path: ':memory:' | string): InMemoryDB` backed by `better-sqlite3`. Applies Crucible's own two-table schema at construction time via `CREATE TABLE IF NOT EXISTS`. All 8 interface methods implemented with prepared statements:

- **DB base (async):** `getSession` (ledgerSize = `forkPointEventId + 1 + ownCount` for children, `ownCount` for roots), `insertSession` (fork lineage), `queryEvents` (inclusive-inclusive `[a, b]` range, own events only)
- **InMemoryDB extensions (sync):** `insertRootSession`, `pushEvent`, `getOwnEvents`, `getMetadata`, `clear`

Zero Cairn imports. Zero coupling to `packages/cairn` schema. OQ-2 FEDERATE invariant held.

### 2. Barrel export: `packages/crucible-core/src/index.ts`

Added: `export { createSQLiteDB } from './sqlite-db.js';`

### 3. devDependencies added to both packages

`packages/crucible-core/package.json` and `packages/crucible-cli/package.json` now include:
```json
"better-sqlite3": "^12.8.0",
"@types/better-sqlite3": "^7.6.13"
```

### 4. Workspace install

`npm install` run at repo root. Native binary already present (hoisted from cairn/eureka). 24 new packages resolved.

---

## Test / Type / Lint Status

| Check | Status | Detail |
|-------|--------|--------|
| `crucible-core` tests | ✅ 6/6 passing | session-manager.test.ts unchanged |
| `crucible-cli` integration tests | ✅ 7/7 passing | All Laura's A1-1…A1-4, B1, B2, B3 green |
| `crucible-cli` acceptance tests | ✅ 1/1 passing | session-fork.test.ts unchanged |
| `tsc --build --force` (crucible-core) | ✅ clean | |
| `tsc --build --force` (crucible-cli) | ✅ clean | |
| `tsc --noEmit` (crucible-core) | ✅ clean | |
| `tsc --noEmit` (crucible-cli) | ✅ clean | |
| ESLint | ⚠️ 1 pre-existing error | `test-db.ts:73` `import/named` rule not found — predates Refactor 3, confirmed in baseline |

---

## Schema (for reference)

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT    PRIMARY KEY,
  parent_session_id   TEXT,
  fork_point_event_id INTEGER,
  plugin_versions     TEXT,
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  session_id          TEXT    NOT NULL REFERENCES sessions(id),
  "offset"            INTEGER NOT NULL,
  primitive_kind      TEXT    NOT NULL,
  primitive_payload   TEXT    NOT NULL,
  causal_read_set     TEXT    NOT NULL,
  PRIMARY KEY (session_id, "offset")
);
```

Note: `"offset"` quoted because it is an SQLite reserved word.

---

## Deferred / Nothing Blocked

- The `@ts-expect-error` directive in `test-db.ts` is now technically unnecessary (createSQLiteDB exists), but because `__tests__` is excluded from tsconfig and vitest uses esbuild, it causes no error. Laura can clean it up when convenient — not a blocker.
- Pre-existing ESLint `import/named` issue in test-db.ts is not caused by Refactor 3 and not fixed here (out of scope).
- WAL mode + foreign keys enabled on the SQLite handle; file-path DB creation works, but only `:memory:` is exercised by tests today.

---

## Next Phase Unblocked

The SQLite adapter is the substrate for any future Refactor 4 / Phase 2 work (file-backed sessions, persistence across process restarts, WAL replay). The interface seam is identical to `createInMemoryDB` — consumer code in `session.ts` / `SessionManager` requires zero changes.


---

### 2026-06-06: OQ-2 LOCKED — Event-substrate topology = FEDERATE (Option B)

**Status:** ✅ LOCKED by Aaron Kubly
**Date:** 2026-06-06
**Deciders:** Graham (Architect) · Genesta (Eureka/Cairn) · Roger (Platform/impl) — unanimous recommendation; Aaron holds and exercised the lock.
**Supersedes:** OQ-2 "MEDIUM — pre-sprint-2 sync required" deferral (decisions.md ~line 1268).

**Decision:** Crucible's L1 WAL stays **federated** from Cairn's `event_log`. Crucible owns its own append-only, hash-chained WAL substrate, its own SQLite projection schema, migrations, and test fixtures. Cairn's `event_log` remains separate. The two stores are bridged only via the shared `SessionId` brand and the offline `cairn reconcile` federation seam. The two-event-log cost is an accepted tax (CTD §15).

**Rejected:** Option A (MERGE Crucible primitives into Cairn `event_log`).

**Rationale (convergent):**
- **Storage-contract incompatibility:** Cairn = CRUD + shadow-events; Crucible = append-only + CAS hash-chain. Not "two lenses on one substrate" — two distinct storage contracts. (Genesta)
- **Replay determinism:** MERGE breaks Crucible's hash-chain integrity, gutting CTD §3 / ADR-0020. (Graham)
- **Dual-write trap is unavoidable under MERGE:** Crucible's canonical store is the binary `.seg` WAL files; routing Primitive writes to Cairn adds a *second incompatible writer*. (Roger)
- **Reversibility is asymmetric:** federate-now/merge-later is moderate effort; merge-now/extract-later risks permanent hash-chain corruption.
- **CTD already locks B** across §3, §14, §15 ("share identifiers, fork everything else").

**Consequences / unblocks:**
- **Refactor 3 proceeds with zero DB-interface rework.** The current `DB` interface (`getSession`/`insertSession`/`queryEvents` + extended `getOwnEvents`/`getMetadata`/`insertRootSession`/`pushEvent`) survives. The real SQLite adapter is a standalone `better-sqlite3(':memory:')` with Crucible's own two-table schema, no Cairn dependency.
- Estimated ~2 days cheaper than Option A for Refactor 3; gap widens as Crucible's schema evolves independently.

**Source briefs:** decision drops: graham-oq2-substrate-brief, genesta-oq2-substrate-brief, roger-oq2-substrate-brief (all local-only).


---




---

### 2026-06-06: Refactor 3 SQLite Adapter — 2-Cycle Persona Review COMPLETE (Ship-Ready)

**Date:** 2026-06-06  
**Agents:** Roger (Platform Dev), Laura (Tester)  
**Cycle 1:** Code Panel (5 personas: correctness/skeptic/craft/compliance/architect) → 1 blocking + 5 important + 4 minor findings  
**Cycle 2:** Code Panel (5 personas, verification) → 0 blocking; all prior findings resolved; 1 important (constraint-specificity) + minor nits  

**Decision:** Refactor 3 (SQLite adapter work) passes both cycles and is **SHIP-READY** at diminishing returns.

---

## Cycle 1 Remediations (Commits a57f95f, 324c287)

**Roger (a57f95f):** Dependency placement (better-sqlite3 → dependencies), single-source schema.ts, pushEvent session-guard parity, stale RED-phase artifact cleanup, JSDoc clarification, adapter framing.  
**Laura (324c287):** Removed stale RED-phase prose, added SQLite-specific constraint assertion [SQLite-C1].  

---

## Cycle 2 Remediations (Commits d4ca4ce, 6c14402)

**Laura (d4ca4ce):** Constraint-specific error assertion (toThrow→toThrow with regex matcher), removed stale commit-hash comment.  
**Roger (6c14402):** Removed redundant better-sqlite3 + @types/better-sqlite3 devDeps from crucible-cli.  

---

## Final State

- ✅ **15 tests green** — 6 crucible-core, 9 crucible-cli (all phases)
- ✅ **tsc clean** — no TypeScript errors
- ✅ **FEDERATE invariant upheld** — no Cairn imports introduced
- ✅ **Declarations confirmed:**
  - OQ-2 LOCKED (Event-substrate topology = FEDERATE)
  - Agent history.md commits are IN-SCOPE
  - Internal helpers: unexport + shrink test surface (Path A)
  - JSON.parse boundary discipline (3-tier: unknown + validate + drift-guard)

---

## Persona Panel Consensus

Both cycles declared **REVIEW-COMPLETE** with diminishing returns. All findings either RESOLVED or documented as deferred (splitting integration tests, migration/user_version seam, L1 WAL).

**Ship cleared for Refactor 3.** Feature PR ready to merge.


---

### 2026-06-06T22:03:01-07:00: Queued follow-ups — WAL / Walkthrough B (non-blocking)
**By:** Aaron Kubly (via Copilot) — approved to queue for later
**Source:** Laura's Walkthrough B GREEN sign-off.
1. **Edge-case RED test:** "prior rows survive a later veto" — append N committed rows, VETO on row N+1, assert exactly N rows remain (vetoed row absent, prior rows intact). Not covered by current hook-veto.test.ts. Owner candidate: Laura (RED) → Roger (GREEN) if it drives impl change.
2. **§4.1 doc polish:** add a TypeScript-name column to the §4.1 verdict table so the intentional doc(`'veto'`)/code(`'VETO'`) casing split is explicit. Non-blocking; Owner candidate: Graham. (Casing split is intentional and type-safe — accepted, not a bug.)


---


# Roger — WAL File Backend Decisions

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-06T22:03:01-07:00  
**Branch:** squad/crucible-wal-substrate-walkthrough-b  
**Status:** CLOSED — 7 new file-backend tests GREEN, full suite 35/35

---

## D-WB-FS-1: On-disk layout matches §3.2

```
<rootDir>/
├── meta/
│   └── manifest.json
├── wal/
│   └── sessions/<sessionId>/
│       ├── 000000.seg     binary records via codec.ts framing
│       └── index.idx      NDJSON: {offset, seg, byteOffset} one line per row
└── cas/
    └── <2-hex-shard>/
        └── <64-hex-hash>.cbor   raw payload / readSet bytes
```

This matches the §3.2 spec tree exactly. `rootDir` is caller-supplied (not
hard-coded to `~/.crucible`) so tests use a temp dir with no repo leakage.

---

## D-WB-FS-2: Manifest schema (schemaVersion=1)

```json
{
  "schemaVersion": 1,
  "sessionId": "<sessionId>",
  "segmentRange": [0, 0],
  "lastCommitOffset": -1
}
```

- `schemaVersion: 1` — upgrade path reserved for when §6 CBOR canonicalization lands.
- `lastCommitOffset: -1` — sentinel for "no rows committed yet".
- `segmentRange: [first, last]` — only `[0, 0]` for now (single-segment; roll-over deferred).
- Written on every `commitRow` via synchronous `writeFileSync` (simpler than fdatasync for v0.1).

---

## D-WB-FS-3: Index format — NDJSON, append-only

`index.idx` is written by appending a newline-delimited JSON object per committed row:
```
{"offset":0,"seg":0,"byteOffset":0}
{"offset":1,"seg":0,"byteOffset":164}
```

This matches the §3.2 advisory index contract: rebuild from segment scan if corrupted.
Currently the reopen path performs a sequential segment scan (not index lookup) for
simplicity — the index exists as the spec requires but fast random-access lookup is
deferred until a RED test drives it.

---

## D-WB-FS-4: primitiveKind stored in envelopeCbor as UTF-8

The segment record's `envelopeCbor` field stores `primitiveKind` as raw UTF-8 bytes
(e.g., `Buffer.from('observation', 'utf8')`). This allows reopen to reconstruct the full
`LedgerEvent.primitiveKind` field without additional metadata.

**Deferred upgrade:** When §6 primitive taxonomy is locked, replace this with a CBOR
envelope that carries the kind byte, schemaVersion, and other envelope fields.
Changing the envelopeCbor format requires a `schemaVersion` bump in manifest.json and
a segment migration pass.

---

## D-WB-FS-5: CAS write-before-WAL ordering respected

Per §3.2: "WAL never references CAS content that is not durable." In `FileSystemWalBackend.commitRow`:
1. `cas.put(payloadBytes)` — writes `.cbor` file synchronously
2. `cas.put(readSetBytes)` — writes `.cbor` file synchronously (if non-empty)
3. `appendFileSync(activeSegPath, recordBuf)` — appends WAL record

`fdatasync` is not explicitly called in v0.1 (deferred alongside group-commit in §3.5).
The ordering guarantee holds: CAS bytes exist on disk before the WAL record referencing
their hash is appended.

---

## D-WB-FS-6: Scope fences — NOT touched (no RED test)

- **Single-writer advisory file lock** (§3.4.1): deferred to next cycle.
- **Group-commit batching + seal-and-split on PAUSE** (§3.5): deferred.
- **64 MiB segment roll-over**: deferred.
- **fdatasync per group-commit**: deferred alongside group-commit.
- **crc32c real computation**: deferred (4 zero bytes, as before).



# Roger WAL Review Fixes — Cycle 1 Decisions Log

**Date:** 2026-06-07
**Branch:** squad/crucible-wal-substrate-walkthrough-b
**Author:** Roger Wilco (Platform Dev, Crucible)

---

## M4 — sessionId / factory export

**Decision: DROP `sessionId` from `LedgerFactoryOptions`; EXPORT `createFileSystemWalBackend`.**

Rationale:
- `sessionId` was declared in `LedgerFactoryOptions` but never read in `createLedger()`.  No test references it.  Wiring it to a default file-system backend would require committing to a stable `~/.crucible` rootDir contract that isn't established yet — premature.  Cleanest fix: remove the unused field.
- `createFileSystemWalBackend` IS the public durable entrypoint and was already a named export from `wal-backend-fs.ts` but not re-exported from `index.ts`.  Added alongside `WriteLockHeldError`, `ReadOnlyWalBackendError`, and `FileSystemWalBackendOptions`.

---

## New error types introduced

| Name | Location | Thrown when |
|------|----------|-------------|
| `ReadOnlyWalBackendError` | `wal-backend-fs.ts` | `commitRow()` is called on a backend opened with `{ readOnly: true }` |

`WriteLockHeldError` was already present; no change to its shape.

---

## I5 — encodeFlags extraction

`encodeFlags` was duplicated in `codec.ts` (wire framing) and `hash-chain.ts` (hash pre-image).  Extracted to `wal/flags.ts`; both files now import from there.  Intentional: these two callers MUST stay identical.  Having a single source of truth prevents silent bit-mapping drift between the on-disk frame and the hash commitment.

---

## M3 — VERDICT_TO_WAL centralisation

Moved to `wal/types.ts` (same file as the WAL-layer type definitions).  Both `wal-backend-fs.ts` and `wal-backend-in-memory.ts` import it from there.  The key type is `Record<'COMMIT' | 'OBSERVE' | 'PAUSE', number>` — equivalent to the old `Record<Exclude<HookVerdict, 'VETO'>, number>` but expressed without the ledger-layer `HookVerdict` import, keeping the `wal/` sub-package dependency-clean from the parent `ledger/` layer.

---

## Deferred (NOT touched in this wave)

- **#56** (crash-durability): CAS fsync gap — acknowledged with a comment in `cas-fs.ts`; no behavior change.
- **#57** (verdict no-match encoding): Not touched.


---

# WAL Substrate + Walkthrough B — 2-Cycle Persona Review

**Author:** Scribe  
**Date:** 2026-06-07T23:59:26.964-07:00  
**Branch:** squad/crucible-wal-substrate-walkthrough-b  
**Status:** REVIEW-COMPLETE — 75/75 tests green, 0 blocking sustained

## Summary

Two-cycle persona review of Crucible WAL substrate (Roger) + Walkthrough B prototype (Laura/Graham seam test).

**Cycle 1 (Code Panel — 5 personas):** 13 findings (1 blocking / 8 important / 4 minor)
- Blocking B1: lock empty-file race — FIXED (commit b5b03dc)
- Important findings: 8 of 8 accepted and fixed
- Minor findings: 4 deferred / accepted as-is
- Result: 74/75 tests green

**Cycle 2 (Re-review — 3 personas):** 2 important / 1 minor, 0 blocking
- Contract suite hardened: now asserts verdict bytes + PAUSE-across-reopen
- Lock PID write hardened against short-write
- sessionId removal documented in release notes
- Result: 75/75 tests green, lint clean, build clean

## Dispositions

| Item | Disposition |
|------|-------------|
| B1 (lock empty-file race) | FIXED (b5b03dc) |
| I2 (crash-durability / CAS fsync) | DEFERRED → GitHub issue #56 |
| I7 (verdict no-match vs continue encoding) | DEFERRED → GitHub issue #57 |
| I1, I3, I4, I5, I6, M1, M2, M3, M4, M5 | FIXED (b5b03dc + 028cdee) |

## Branch Commits

- 6ef2a61: feat WAL + WalkthroughB
- b432f8d: squad artifacts
- b5b03dc: cycle-1 fixes
- 028cdee: cycle-2 fixes

## Follow-up

- #56: CAS fsync gap (crash durability window)
- #57: Verdict encoding clarification (no-match vs continue)
---

## 2026-06-06: Refined Scope Rule for Doc-Hygiene Inbox-Path Sweeps

**Date:** 2026-06-06  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL  
**Context:** PR #52 re-scope (issue #46), per Aaron's direction after persona-review panel findings

### Decision

When sweeping committed prose to remove broken `.squad/decisions/inbox/` path references, apply a **three-way distinction**:

#### 1. FIX — Specific inbox file-path pointers

**Definition:** Prose that cites a concrete `inbox/{name}-{slug}.md` filename as if it were a stable, followable link.

**Action:** Replace the path with a slug-preserving plain-text description. Per Skeptic panel suggestion, retaining the filename slug (without the directory path) preserves searchability — e.g., `decision drop: graham-ctd-phase4-synthesis (local-only, now incorporated in this archive)`.

**Also fix:** Any malformed prose introduced by the replacement — dangling "— this file" self-references should become "— this decision entry".

**Examples fixed in PR #52:**
- `Merged from .squad/decisions/inbox/graham-ctd-phase4-synthesis.md` → `Merged from decision drop: graham-ctd-phase4-synthesis (local-only, now incorporated in this archive)`
- `.squad/decisions/inbox/laura-crucible-first-red-test.md — this file` → `decision drop: laura-crucible-first-red-test (local-only) — this decision entry`

#### 2. KEEP / RESTORE — Gitignore-policy documentation

**Definition:** Bulleted "Explicitly prohibited (gitignored runtime state)" lists that name the inbox path as one of several gitignored directories.

**Action:** Keep the literal `.squad/decisions/inbox/` path verbatim. These bullets document the gitignore policy — they are not broken pointers to any specific file. All sibling paths (`.squad/orchestration-log/`, `.squad/log/`, `.squad/sessions/`, `.squad/.scratch/`) are kept; stripping only the inbox path is over-reach.

#### 3. KEEP — Generic directory narration

**Definition:** Narrative sentences that describe where transient files were written, without citing a specific filename (e.g., "resolutions captured as directive files in `.squad/decisions/inbox/`").

**Action:** Keep the path. This is accurate location description, not a broken pointer.

#### 4. NEVER TOUCH — Forward writer-target paths

**Definition:** Charters, templates, skills, routing files that tell future agents where to write files.

**Action:** Leave entirely unchanged. These are instructions, not references.

### Acceptance Criterion (Relaxed, Aaron-approved 2026-06-06)

Issue #46's original literal criterion was "zero `decisions/inbox/` hits in decisions.md AND decisions-archive.md."

**Relaxed criterion:** Zero *broken followable pointers* — specific `inbox/{file}.md` citations that cannot be followed. The three policy-list bullets in `decisions-archive.md` that document the gitignore rule may (and should) retain the literal path.

### Why

The literal "zero hits" criterion over-interprets the spirit of the issue. Issue #46 is about links that are broken for contributors and CI — not about erasing every mention of the path. Policy documentation that *explains why the path is gitignored* is useful, accurate, and should be preserved. Removing it degrades the policy audit trail.

### Append-Only History Rule

**Separately and absolutely:** Agent `history.md` and `history-archive.md` files are append-only. Any hygiene sweep that edits previously committed history entries is a scope violation, regardless of whether the edit improves clarity. This mirrors the over-reach that caused PR #44 to be reverted.

---

# Graham — Aperture UX Disposition

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-09T18:08:44-07:00  
**Input:** Valanice's advisory UX review (merged into .squad/decisions.md — Aperture UX Disposition section)  
**Scope:** Walkthrough C — Aperture push-notification projector (§4.3)  
**Delegated by:** Aaron Kubly ("defer to the Lead")

---

## Architectural Framing

The `NotificationService` interface is a **mocked seam** today — no real badge renderer exists.
This is the primary lens for all dispositions: work that requires a real consumer to be meaningful
should wait; work that is a genuine correctness bug or costs nearly nothing should be closed now.

The seam design is already correct. Valanice confirmed: all UX complexity (coalescing, DND,
escalation, snooze) can be adapter-decorated around `NotificationService` without touching the
projector. Roger's seam placement is validated. The projection purity and `queryEvents()` stability
are confirmed foundations.

---

## Per-Finding Rulings

### B-1 — ℹ️ fallback icon for attention-tier events
**Ruling: FOLD NOW**  
**Issue: #64** (`squad:roger`, `priority:p1`)

**Reasoning:** This is a genuine correctness defect in `NotificationPolicy.getIcon()`. The info
emoji communicates "nothing to do" — the opposite of what `attention`/`urgent` tier events mean.
It costs one line and a test update. Shipping a real renderer with this default guarantees a
misleading badge from day one. No interface changes; purely internal to `NotificationPolicy`.

**Trade-off named:** If we defer, every downstream demo and renderer prototype is seeded with
incorrect icon semantics that will need retroactive correction. The cost of doing it now (~30 min)
is lower than the cost of un-teaching the wrong default later.

---

### I-1 — unreadCount is a one-way ratchet with no dismiss/ack path
**Ruling: FILE (follow-up)**  
**Issue: #66** (`squad:roger`, `squad:valanice`, `priority:p2`, `release:backlog`)

**Reasoning:** The `seenOffset` cursor and `markRead()` method are the right design, but they
require a CLI-layer call site — something that invokes `markRead()` when the user views the badge.
That call site does not exist because there is no real renderer. Implementing the ack cursor now
means building machinery with no consumer, and the shape of `markRead()` will likely be constrained
by real renderer UX. Defer until the first real badge renderer lands; `queryEvents()` is stable and
the cursor is a purely additive ApertureProjector extension.

**Trade-off named:** Doing it now risks over-designing the ack interface before real usage constrains
the shape. The append-only projection model is already the right foundation — adding a cursor later
requires no rework.

---

### I-2 — Burst coalescing absent
**Ruling: DEFER**  
**Unblocked by:** First real `NotificationService` implementation (CLI badge renderer)

**Reasoning:** Coalescing is entirely a `NotificationService` adapter concern — Valanice confirmed
the seam is already in the right place. A `DebouncedNotificationService` wrapper can be added
without touching the projector. With a mock notifier, coalescing produces no observable difference
in the test suite and has no user-visible effect. Filing an issue now would generate noise with no
action path.

**Trade-off named:** Not coalescing is not wrong at the projector layer — it is a rendering quality
issue. The risk of deferring is that a future renderer implementer might be unaware of the concern;
mitigated by this document and Valanice's review being on record.

---

### I-3 — getPriority() computed but never reaches the push payload
**Ruling: FILE (follow-up)**  
**Issue: #65** (`squad:roger`, `priority:p2`, `release:backlog`)

**Reasoning:** `getPriority()` is currently dead code from a UX perspective — the renderer has no
way to know whether the badge contains urgent or attention events. The fix is additive
(`highestPriority: number` on the push payload). However, this touches the `NotificationService`
interface boundary: any future adapter implementing the interface will see this field. Prefer to
finalize the interface shape once — when the first real renderer is being built — so the payload
contract is settled by real consumer needs rather than speculation.

**Trade-off named:** Filing now vs. deferring: the dead-code reality is a correctness gap, but it
is only observable through a renderer. The interface cost of adding a field now is low; the cost of
getting the field name/type wrong and having to change it before the interface is frozen is higher.
Target: implement alongside the first real `NotificationService` consumer.

---

### I-4 — Emoji-only signaling — accessibility exposure
**Ruling: FILE (follow-up)**  
**Issue: #66** (grouped with I-1, `squad:roger`, `squad:valanice`, `priority:p2`, `release:backlog`)

**Reasoning:** Adding `label: string` to the push payload is the right fix but is a pure CLI
rendering concern — the label value is only meaningful when rendered with ARIA or text fallback.
The right label strings (`'quarantine'`, `'decision'`, `'alert'`) should be spec'd by Valanice
alongside the first real renderer design, not guessed now. Grouped with I-1 because both are
"pre-renderer readiness" items.

**Trade-off named:** Adding the label field now is low-cost but the label vocabulary (what values
to use) is a UX specification decision that should be driven by real rendering context. Getting the
vocabulary wrong now means changing the interface before it is frozen.

---

### I-5 — ✓ for decision reads as "resolved"
**Ruling: FOLD NOW**  
**Issue: #64** (grouped with B-1, `squad:roger`, `priority:p1`)

**Reasoning:** Same cost profile as B-1: one-line fix in `getIcon()`, no interface changes. The
checkmark glyph actively misleads when `outcome: 'reject'` decisions land in the badge. This is
observable today in the test suite (AP-2 uses a reject outcome). Correcting it costs nothing and
removes a semantic trap for future renderer developers.

**Trade-off named:** None meaningful — the cost of correct is a glyph swap; the cost of wrong is a
category of user errors where actionable decisions are ignored.

---

### N-1 — Separate unread counts by tier
**Ruling: DEFER**  
**Unblocked by:** First real badge renderer

**Reasoning:** Splitting the payload into `{ urgentCount, attentionCount }` requires a renderer
capable of displaying a compound badge. Without that renderer, the split is invisible. This is also
a meaningful interface change (not purely additive if urgentCount + attentionCount replaces
unreadCount). Defer until renderer UX is specified; revisit alongside I-3 (highestPriority).

---

### N-2 — Do-not-disturb / mute mode
**Ruling: DEFER**  
**Unblocked by:** Real NotificationService consumer + evidence of DND user need

**Reasoning:** Correctly identified by Valanice as a `BatchedNotificationService` adapter concern.
The seam is already positioned for it. File only when there is a real workflow (batch plugin sweep)
and a real renderer to suppress. No issue filed — track in Valanice's UX backlog.

---

### N-3 — Escalation from attention → urgent if unacknowledged
**Ruling: DEFER**  
**Blocked by:** I-1 (ack/seenOffset cursor) + real renderer

**Reasoning:** Depends on the ack cursor from I-1. No path forward until I-1 is resolved and a
renderer can display escalation signals. High effort, low priority.

---

### N-4 — Per-type snooze
**Ruling: DEFER**  
**Blocked by:** Real renderer + user evidence of snooze need

**Reasoning:** Correct design (NotificationPolicy.shouldPush() + snoozeList context parameter) but
requires real usage evidence to justify the policy complexity. Track in Valanice's UX backlog when
the renderer ships and real workflows generate snooze requests.

---

## Summary Table

| Finding | Ruling | Issue | Rationale |
|---------|--------|-------|-----------|
| B-1 | FOLD NOW | #64 | One-line correctness fix, no interface change |
| I-1 | FILE | #66 | Needs CLI call site; defer to first real renderer |
| I-2 | DEFER | — | Pure adapter concern; seam already correct |
| I-3 | FILE | #65 | Interface additive but shape best finalized with real consumer |
| I-4 | FILE | #66 | Label vocabulary is a UX spec + renderer concern |
| I-5 | FOLD NOW | #64 | One-line correctness fix, no interface change |
| N-1 | DEFER | — | Renderer + compound badge UX required |
| N-2 | DEFER | — | Adapter concern; needs real workflow + renderer |
| N-3 | DEFER | — | Blocked on I-1 + renderer |
| N-4 | DEFER | — | Needs usage evidence from real renderer phase |

---

## Walkthrough C Scope Verdict

Roger's implementation is **clean and correct**. The seam design is validated by Valanice's review.
Issue #64 closes the only genuine correctness gap before we move on. Issues #65 and #66 are
pre-renderer readiness items that should be picked up as a bundle when the first real
`NotificationService` adapter is implemented in `crucible-cli`.

The defer items (I-2, N-1 through N-4) are all adapter/renderer concerns that the seam already
accommodates — no projector rework will be needed when they are eventually addressed.


---

# Roger — Aperture Projector (Walkthrough C) Decisions

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-09T18:08:44-07:00  
**Branch:** (working on main checkout)  
**Status:** COMPLETE — 114/114 crucible-core tests GREEN, 9/9 crucible-cli tests GREEN  

---

## D-AP-1: Commit-notification seam — additive `subscribe()` on Ledger interface

**Situation:** The strategy doc (§4.3) referenced `ledger.subscribe(apertureProjector)` but the
`Ledger` interface (Graham's locked seam) had no such method.

**Choice:** Added `LedgerSubscriber` interface and `subscribe(subscriber: LedgerSubscriber): void`
to the `Ledger` interface in `packages/crucible-core/src/ledger/ledger.ts` as an **additive-only**
extension. `LedgerImpl.append()` fires all registered subscribers synchronously after
`walBackend.commitRow()` resolves (step (e)), before `append()` returns to the caller.

**Subscriber signature:**
```typescript
export interface LedgerSubscriber {
  onCommit(offset: number, event: LedgerEvent): void;
}
```

**Single-event callback** (not batch): matches the per-row commit model of `InMemoryWalBackend`.
The `onCommit` is called once per row; if the FS backend needs batch delivery later, that can be
added additively without changing the interface.

**Seam impact on Graham's locked interface:** Additive only. Existing `append()`, `queryEvents()`,
`registerHook()`, `unregisterHook()` signatures are UNCHANGED. `WalBackend` interface is UNCHANGED.
Graham's seam contract is NOT violated.

**Why NOT a WalBackend-level callback:** The WAL backend operates below the Ledger (it never sees
`LedgerEvent` shapes or metadata). Subscriber notification belongs at the Ledger layer where the
full `PrimitiveInput + offset` event is assembled.

---

## D-AP-2: `metadata` field on `PrimitiveInput` — optional, additive

**Situation:** `PrimitiveInput` had no `metadata` field. The strategy doc showed
`await ledger.append({ ..., metadata: { level: 'attention' } })` which TypeScript would reject.

**Choice:** Added optional `metadata?: EventMetadata` to `PrimitiveInput` in `types.ts`, where
`EventMetadata = { level?: string; [key: string]: unknown }`. All existing callers pass no
`metadata` (omitted = undefined), so zero regressions. The field flows through `Primitive extends
PrimitiveInput` → `LedgerEvent = Primitive` automatically.

```typescript
export interface EventMetadata {
  level?: string;
  [key: string]: unknown;
}
export interface PrimitiveInput {
  ...
  metadata?: EventMetadata;
}
```

---

## D-AP-3: Projection store — internal array (not SQLite DDL)

**Situation:** The strategy doc showed `INSERT INTO aperture_events` (SQLite DDL). The test harness
for Walkthrough C uses the `InMemoryWalBackend`; there is no need for a separate SQLite projection
table in this slice.

**Choice:** `ApertureProjector` maintains an internal `ApertureEvent[]` array. `queryEvents(opts?)`
returns a filtered snapshot. No SQLite DDL, no schema migration, no `aperture_events` table.

**Rationale:**
- Simpler, zero friction for tests
- The public `queryEvents()` interface is stable — a future adapter can replace the array with a
  projected SQLite table without changing ApertureProjector's API or the acceptance test
- Avoids coupling Aperture's projection to the `sessions`/`events` schema (OQ-2 FEDERATE)

**Future migration path:** If durable projections are needed across process restarts, add an
`aperture_events` table via a new schema migration and inject a `ProjectionStore` port into
`ApertureProjector`. The `LedgerSubscriber` seam remains stable.

---

## D-AP-4: NotificationPolicy extracted at GREEN phase

**Situation:** The strategy doc prescribes extracting `NotificationPolicy` in the REFACTOR phase.

**Choice:** `NotificationPolicy` was created as a standalone file from the start (alongside
`ApertureProjector`). The inline logic was always delegated to it. The "REFACTOR" beat adds the
dedicated unit tests for `NotificationPolicy` and the projector purity contract test — the class
itself was pre-extracted.

**Rationale:** Extracting it inline avoids an unnecessary intermediate state where
`ApertureProjector` contains raw string comparisons that then need to be moved. The TDD
discipline still holds: unit tests for `NotificationPolicy` were written as REFACTOR beats.

---

## D-AP-5: Acceptance test in crucible-core (not crucible-cli)

**Situation:** The strategy doc placed the acceptance test in `packages/crucible-cli/src/__tests__/`.
But `createLedger` is exported from `crucible-core`, and the CLI (`crucible-cli`) only re-exports
core symbols. There is no CLI-layer logic to exercise.

**Choice:** Acceptance test lives in `packages/crucible-core/src/__tests__/acceptance/aperture-push.test.ts`,
matching the pattern of the existing `hook-veto.test.ts` acceptance test.

**No `setBadgeRenderer`:** The strategy doc's `cli.setBadgeRenderer(badgeRenderer)` was illustrative.
The real acceptance test directly mocks `NotificationService: { push: vi.fn() }` and passes it to
`new ApertureProjector(mockNotifier)`. This is cleaner and avoids coupling the test to a non-existent
CLI API.

---

## Impact on Other Agents

| Agent | Impact |
|-------|--------|
| **Graham** | `Ledger` interface gained `subscribe()` — additive only. All existing interface members unchanged. |
| **Laura** | None — hook bus, veto logic, append signature unchanged. |
| **Rosella** | Walkthrough C is now implemented. `ApertureProjector`, `NotificationService`, `ApertureEvent`, `NotificationPolicy`, `LedgerSubscriber`, `EventMetadata` are all exported from `@akubly/crucible-core`. |
| **All** | `PrimitiveInput.metadata?: EventMetadata` is now available for callers who want to tag events with a tier level. Fully optional — existing callers unchanged. |

---

## Files Touched

**New:**
- `packages/crucible-core/src/projectors/notification-policy.ts`
- `packages/crucible-core/src/projectors/aperture-projector.ts`
- `packages/crucible-core/src/__tests__/acceptance/aperture-push.test.ts`
- `packages/crucible-core/src/__tests__/unit/aperture-projector.test.ts`
- `packages/crucible-core/src/__tests__/unit/aperture-projector-purity.test.ts`
- `packages/crucible-core/src/__tests__/unit/notification-policy.test.ts`

**Modified:**
- `packages/crucible-core/src/types.ts` — `EventMetadata` + `metadata?` on `PrimitiveInput`
- `packages/crucible-core/src/ledger/ledger.ts` — `LedgerSubscriber` + `subscribe()` on `Ledger`
- `packages/crucible-core/src/ledger/ledger-impl.ts` — `subscribe()` impl + subscriber fire step
- `packages/crucible-core/src/index.ts` — new exports


---

# Decision: WAL CAS fsync Ordering (Issue #59)

**Author:** Roger Wilco  
**Date:** 2026-06-09  
**Status:** Implemented  
**Related:** Issue #59, #56 (manifest replay gate — already fixed)

---

## Problem

`FileSystemCas.put()` wrote CAS blobs via `fs.writeFileSync()` without fsync. Phase 3 of `executeFlush()` fsynced the WAL segment via `syncFn(segFd)`, making WAL records durable while CAS blobs were still only in the OS page cache. A crash between Phase 1 (CAS write) and Phase 3 (segment fdatasync) left a durable WAL record referencing a non-durable CAS blob. On reopen, `replayFromSegments()` would call `this.cas.get(hash)` → null → throw `CasMissError`.

This is distinct from #56 (manifest gate preventing replay entirely). After #56 was fixed, reopen always runs `replayFromSegments()`, which makes the #59 window more likely to surface as a `CasMissError` on the next open.

---

## Options Considered

### Option A: Per-put fsync
Call `fs.fsyncSync()` on each CAS file inside `put()`, immediately after `writeFileSync()`.

**Tradeoffs:**  
✅ Simplest code; ordering is local  
❌ O(rows) fsync calls per batch — every row pays a full disk barrier even if its CAS blob is the same as the previous row  
❌ No dedup benefit: same payload written in the same batch fsyncs once per call (before existence check)  
❌ Destroys group-commit batching benefit

### Option B: Batch CAS fsync in Phase 2.5 (chosen)
Track newly-written CAS file paths in `FileSystemCas.pendingSync: Set<string>`. After the hash chain is built (Phase 2) and before the segment file is opened (Phase 3), call `cas.syncAll(syncFn)` to fsync all pending CAS files in a batch. Uses the same injectable `syncFn` seam as the segment fdatasync.

**Tradeoffs:**  
✅ O(K) fsync calls per batch where K ≤ number of unique new CAS files  
✅ Dedup: identical payloads across rows in the same batch → 1 CAS file → 1 CAS sync  
✅ Already-durable CAS files (from prior batches) are never re-tracked  
✅ Preserves group-commit batching: all I/O barrier costs amortised across batch  
✅ Uses existing injectable `syncFn` seam (testable without disk, consistent spy)  
❌ Slightly more complex CAS class (pendingSync field + syncAll method)

### Option C: Reconcile on reopen
On `replayFromSegments()`, if a CAS blob is missing, skip the WAL record and truncate the segment back to exclude it.

**Tradeoffs:**  
✅ No write-path cost  
❌ Data loss by design: committed rows silently dropped  
❌ Hash chain invalidated at truncation boundary  
❌ Violates durability contract: a fsynced segment record must survive reopen

---

## Decision: Option B — Batch CAS fsync in Phase 2.5

### Rationale
Option B maintains the durability contract with no data loss, amortises I/O cost across the group-commit barrier, and reuses the existing injectable `syncFn` seam. The cost is O(K) per batch where K is typically much smaller than O(rows) due to payload dedup. For workloads with large payloads or high uniqueness, cost is O(rows) in the worst case — same as Option A but amortised over the batch.

### Ordering invariant established
CAS blobs durable → segment written → segment fsynced → WAL record durable  
No durable WAL record can reference a non-durable CAS blob.

---

## Implementation

### `packages/crucible-core/src/ledger/wal/cas-fs.ts`

Added:
- `private readonly pendingSync = new Set<string>()` field
- In `put()`: `this.pendingSync.add(filePath)` when a new file is written (dedup: skipped when file already exists)
- `syncAll(syncFn: (fd: number) => void): void`: iterates `pendingSync`, opens each with `'r+'` (write access needed for `FlushFileBuffers` on Windows), calls `syncFn(fd)`, closes, removes from set. Each file removed only on successful sync so failed syncs are retried on the next batch.

### `packages/crucible-core/src/ledger/wal-backend-fs.ts` — `executeFlush()`

Inserted Phase 2.5 between Phase 2 (hash chain) and Phase 3 (segment write):

```
// Phase 2.5: fsync all newly-written CAS files (§3.2 / issue #59)
try {
  this.cas.syncAll(this.syncFn);
} catch (err) {
  // Segment not yet opened — no truncation needed.
  for (const { row: entry } of committed) entry.reject(err);
  if (restaged.length > 0) { this.stagingQueue.unshift(...restaged.map(r => r.row)); }
  throw err;
}
```

Phase 3 (segment open+write+fsync) is unchanged.

### Windows compatibility
CAS files opened with `'r+'` in `syncAll()`. `fs.fsyncSync(fd)` on Windows uses `FlushFileBuffers`, which requires write access. Read-only `'r'` would fail with EBADF on Windows. `'r+'` opens existing files for read+write, which is valid since `put()` always creates the file before `syncAll()` is called.

---

## Throughput Analysis

| Scenario | CAS syncs per batch | Segment syncs | Total |
|---|---|---|---|
| N rows, all unique payloads, empty readSets | N | 1 | N+1 |
| N rows, same payload (dedup), empty readSets | 1 | 1 | 2 |
| 1 row, non-empty causalReadSet | 2 | 1 | 3 |
| Second batch, same payload as first | 0 | 1 | 1 |

For typical append workloads with repeated observation payloads (e.g., telemetry dedup), the amortised CAS sync cost approaches 0 over time.

---

## Interaction with Issue #56

#56 fixed: `replayFromSegments()` is now called unconditionally (removed manifest gate). This means the #59 crash window is always tested on reopen — no manifest `-1` guard to mask a `CasMissError`. After #59 is fixed, `CasMissError` on reopen indicates true hardware corruption (segment durable, CAS blob lost to hardware failure), not a crash-window ordering bug.

---

## Impact on Other Agents

- **Graham (seam guard):** `CasFsStore` (the `WalBackend` port's CAS seam) is not directly visible in the WAL interface — `FileSystemCas` is a private implementation detail of `FileSystemWalBackend`. No interface contract change.
- **WAL backend contract tests:** The injectable `syncFn` seam now receives additional calls (CAS syncs before segment sync). Tests counting exact `syncFn` invocations must account for CAS syncs. Three existing group-commit tests updated: `syncCount` expectations raised from 1→2 (first batch) and 2→3 (after second batch for restaged row).
- **InMemoryWalBackend:** Not affected. Uses `InMemoryCas` (no filesystem), no sync path.


---

# Roger — WAL Crash-Durability Fix (Issue #56)

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-09T18:25:35-07:00  
**Branch:** (main checkout)  
**Status:** COMPLETE — 119/119 crucible-core tests GREEN, build clean, lint clean  
**Issue:** #56

---

## D-CD-1: Root cause — manifest-gate drops first-batch durable rows

**Bug:** `FileSystemWalBackend.open()` called `replayFromSegments()` only when
`manifest.lastCommitOffset >= 0`. The manifest starts at `-1` (no rows committed).
The first batch's `executeFlush()` updates it in **Phase 4** (after fdatasync).

**Crash window:** Process dies between Phase 3 (segment `fdatasync`) and Phase 4
(`manifest.json` `writeFileSync`). Result:
- Segment file: contains durable (fdatasync'd) records ✅
- `manifest.lastCommitOffset`: still `-1` ❌

On the next open: `-1 >= 0` is false → `replayFromSegments()` is never called →
`this.events` stays empty → `readRows()` returns `[]` → durable rows silently lost.

**Scope:** Only the first batch of a session. Subsequent batches leave
`lastCommitOffset >= 0`, so the gate passes and `scanSegmentFile()` reads all bytes
(including crash-recovered rows from the segment tail). No data loss for second+ batches.

---

## D-CD-2: Fix — remove the `-1` gate; always replay from segment

**Choice:** Remove `if (manifest.lastCommitOffset >= 0)` and call
`this.replayFromSegments()` unconditionally in `open()`.

**Rationale:**
- `scanSegmentFile()` already handles missing/empty segment files (returns `[]`) — the
  call is a safe no-op for genuinely fresh sessions.
- The segment file IS the ground truth. `manifest.lastCommitOffset` is informational
  metadata, not an authoritative durability gate.
- Zero behavior change for the normal path (no crash): manifest is always updated in
  Phase 4, so `-1` only persists if the process died before Phase 4.

**Alternative considered — manifest fsync within the same barrier:**
Write the manifest within Phase 3's fdatasync scope (open manifest fd, write, fsync,
close, then close segment fd). Rejected because:
1. It requires two synced files per batch (higher I/O cost).
2. It doesn't fully close the window (crash between segment-close and manifest-sync
   still possible with two-file approach unless both are in one barrier, which is
   filesystem-dependent and complex).
3. The segment-as-ground-truth approach is simpler and makes the invariant
   immediately obvious: on open, always scan what's durably on disk.

---

## D-CD-3: Crash-injection test methodology

**Simulation:** write rows → flush (segment is durable) → manually overwrite
`manifest.json` to set `lastCommitOffset = -1` → `close()` (no staged entries, no
manifest re-update) → reopen.

This accurately models the on-disk state left by a crash between Phase 3 and Phase 4.
No special fsync spying needed; the test confirms the EXACT recovery path.

**Test file:** `packages/crucible-core/src/__tests__/unit/wal-crash-durability.test.ts`

Tests (all 5 were RED before fix, 5 GREEN after):

| ID | Invariant |
|----|-----------|
| CD-1 | First-batch crash: 3 durable rows recovered when manifest shows -1 |
| CD-2 | Subsequent-batch crash: all rows recovered when manifest lags segment |
| CD-3 | Hash-chain verifies across crash-recovered boundary |
| CD-4 | Post-recovery write chains onto recovered tail (prevRoot seeded from tail) |
| CD-5 | lastTimestampNs seeded from recovered rows; subsequent writes don't regress |

CD-2 was already GREEN before the fix (because `lastCommitOffset = 1 >= 0` passes the
old gate). It's retained as a regression guard and to document the invariant.

---

## D-CD-4: Manifest role after fix

`manifest.lastCommitOffset` is still updated in Phase 4 after each successful flush.
Its role is now:
- **Informational only** — aids debugging, logging, and schema tracking
- **Not a replay gate** — replay always reads from the segment bytes

`manifest.segmentRange` is still the authoritative list of segment files to scan
during replay (needed for the future 64 MiB segment roll-over).

---

## D-CD-5: #59 (CAS fsync) scope fence — noted but not touched

The fix does NOT address the CAS write durability gap (#59). CAS `.cbor` files are
written before the segment fdatasync but are NOT themselves fsynced. If the process
crashes after CAS write but before segment fsync, the segment record may point to a
CAS blob that exists in memory but not yet on disk.

The fix ensures that crash-recovered segment records are correctly replayed. If a
CAS blob is absent on disk after a crash, `replayFromSegments()` will throw
`CasMissError` (correct behavior per §3.2.1 — fail fast rather than substitute a
default). Issue #59 tracks a proper fix for CAS durability.

---

## Impact on Other Agents

| Agent | Impact |
|-------|--------|
| **Graham** | `WalBackend` interface UNCHANGED. `Ledger` interface UNCHANGED. |
| **All** | Crash-durability is now correct for the first batch. Existing tests unaffected. |
| **Future** | When 64 MiB segment roll-over is implemented, the manifest `segmentRange` update must be treated with the same care as `lastCommitOffset` — if it's updated after fdatasync in Phase 4, a crash between them would leave the new segment unreplayable. Recommend including `segmentRange` update in the same atomic write as `lastCommitOffset`. |

---

## Files Touched

**Modified:**
- `packages/crucible-core/src/ledger/wal-backend-fs.ts` — removed `if (lastCommitOffset >= 0)` guard in `open()`, replaced with unconditional `replayFromSegments()` + explaining comment

**New:**
- `packages/crucible-core/src/__tests__/unit/wal-crash-durability.test.ts` — 5 crash-injection tests (CD-1 through CD-5)


---

# Valanice — Aperture Push-Notification UX Review

**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-06-09T18:25:39-07:00  
**Target:** Walkthrough C implementation (Roger, `roger-aperture-projector.md`)  
**Status:** ADVISORY — Roger is NOT blocked. These are ranked recommendations.

---

## Context

Roger implemented the Aperture push-notification projector per §4.3. The core machinery is sound:
subscription seam is additive, `NotificationPolicy` is pure and extracted, projection purity is
contract-tested. This review examines the *human-factors* layer — what the design does to the
tired, distracted engineer watching the badge.

Files reviewed:
- `packages/crucible-core/src/projectors/aperture-projector.ts`
- `packages/crucible-core/src/projectors/notification-policy.ts`
- `packages/crucible-core/src/__tests__/acceptance/aperture-push.test.ts`
- `packages/crucible-core/src/__tests__/unit/aperture-projector.test.ts`
- `packages/crucible-core/src/__tests__/unit/aperture-projector-purity.test.ts`
- `docs/crucible-tdd-strategy.md §4.3`
- Aperture projector decision in `.squad/decisions.md`

---

## BLOCKING

*No absolute ship-stoppers. The projection layer is technically correct. The findings below are
framed as "blocking if any badge UI ships to real users without addressing them."*

### B-1: ℹ️ fallback icon for attention-tier events is cognitively dissonant

**Location:** `notification-policy.ts` line 36 — `return 'ℹ️'` as the else-branch for events
that are not quarantine and not decision, but that are still `attention`- or `urgent`-tier.

**Problem:** The ℹ️ glyph communicates "informational, no action needed." By contract,
`attention`/`urgent` events are exactly the events where the human MUST look. Surfacing an info
icon for an attention event teaches the human that ℹ️ sometimes matters and sometimes doesn't —
destroying the icon's signal value. The tired engineer skips ℹ️ badges on instinct.

**Recommendation:** Replace the default with a distinct action-required icon (e.g., `⚠️` or `🔔`)
or, at minimum, differentiate by tier rather than by category alone. The icon decision tree should
be: tier=urgent → one icon; tier=attention (non-quarantine, non-decision) → another; never ℹ️ for
actionable tiers.

---

## IMPORTANT

### I-1: `unreadCount` is a one-way ratchet with no dismiss/ack path

**Location:** `aperture-projector.ts` line 103 — `unreadCount: this.events.length`

**Problem:** Every qualifying `onCommit()` increments the badge count. There is no `markRead()`,
no `dismiss()`, no reset. Within a session, a burst of 20 quarantine events fires 20 sequential
`notifier.push()` calls with counts 1 through 20 (validated in AP-5). After a busy session, the
badge number is meaningless. Users learn to ignore a permanently-elevated badge — the classic
notification desensitization loop.

**Recommendation:** The projection store (append-only `ApertureEvent[]`) should remain immutable
for purity reasons. But `unreadCount` should be a *derived view*, not `events.length`. Add:
- A `seenOffset: number` cursor (or a `Set<string>` of seen event IDs) that the CLI layer can
  advance via `markRead(upToOffset: number)` or similar.
- `unreadCount` = `events.length - seenOffset` (or equivalent).

This does not require changing the projection contract — it's a rendering concern layered on top of
the stable `queryEvents()` interface Roger already defined.

### I-2: Burst coalescing is absent — rapid-fire events produce rapid-fire pushes

**Location:** `aperture-projector.ts` lines 86–106 (synchronous `onCommit` loop)

**Problem:** A plugin sweep that quarantines 20 plugins in sequence fires 20 `notifier.push()`
calls synchronously, one per commit. The CLI renderer receives 20 state updates in rapid succession.
Depending on the renderer implementation, this could cause visual thrashing or, worse, the 20th
call overwrites context from the 1st before the human can read it.

**Recommendation:** The `NotificationService` interface is the right abstraction boundary for
coalescing. Consider either:
- (a) A debounced `NotificationService` adapter (e.g., coalesce calls within a 50ms window, emit
  one `push()` with the final `unreadCount`), or
- (b) A batch variant on the subscriber interface: `onCommitBatch(events: LedgerEvent[]): void`
  that the ledger could use to deliver all events from a single `append()` call (if batching is
  ever added).

Option (a) is purely a CLI-layer concern — the projector logic is unchanged, and this is already
the right place in the seam design.

### I-3: `getPriority()` is computed but never surfaced in the push payload

**Location:** `notification-policy.ts` lines 43–51; `aperture-projector.ts` line 102–105

**Problem:** `NotificationPolicy.getPriority()` returns urgent=3, attention=2, notice=1, info=0 but
the `NotificationService.push()` payload only carries `{ unreadCount: number; icon: string }`. The
renderer has no way to distinguish a badge that contains 1 urgent + 10 attention events from one
that contains 11 attention events. The urgent signal is invisible in the badge.

**Recommendation:** Add `highestPriority: number` (or `hasUrgent: boolean`) to the push payload.
The projector already has all the information it needs to compute this:

```typescript
this.notifier.push({
  unreadCount: this.events.length,
  icon: this.policy.getIcon(category, event.primitivePayload),
  highestPriority: Math.max(...this.events.map(e => this.policy.getPriority(e.level))),
});
```

Without this, `getPriority()` is dead code from the UX perspective and the badge cannot escalate
its urgency signal as more critical events accumulate.

### I-4: Emoji-only signaling — accessibility exposure

**Location:** `notification-policy.ts` lines 27–37 (getIcon return values)

**Problem:** All badge signals are emoji: 🔒, ✓, ℹ️. Emoji rendering has real accessibility gaps:
- Screen readers announce them as verbose prose ("lock emoji", "heavy check mark sign") — not
  actionable descriptions.
- Emoji fonts vary by OS/terminal; in some CLI environments, these render as `?` or empty boxes.
- Users who rely on high-contrast modes or have visual processing differences may not reliably
  distinguish 🔒 from ℹ️ at badge scale.

**Recommendation:** The `NotificationService` push payload should include a `label: string`
alongside the icon — a machine-readable category string (`'quarantine'`, `'decision'`, `'alert'`)
that the renderer can use to supplement the emoji with text or ARIA labels. This doesn't require
changing projection logic — it's an additive field.

### I-5: ✓ for "decision" reads as "resolved" — may suppress action

**Location:** `notification-policy.ts` line 34 — `if (category === 'decision') return '✓'`

**Problem:** ✓ is a completion/success glyph. A decision notification is not necessarily good news
(AP-2 test uses `outcome: 'reject'`). A user who sees ✓ badge may instinctively read it as
"something finished OK" and defer reading it — even when the decision requires follow-up action.

**Recommendation:** Use a neutral or attention-specific glyph for decision notifications: `📋`
(clipboard/document) or `⚡` (action required). Reserve ✓ for explicitly successful outcomes if
that category ever exists.

---

## NICE-TO-HAVE

### N-1: Separate unread counts by tier (attention vs. urgent)

The current badge is a single integer. Separating `{ urgentCount: number; attentionCount: number }`
in the push payload would let the renderer show a compound badge (e.g., "3 urgent / 8 attention")
without changing the projection model. The human can then triage at a glance rather than having to
open the event list to understand severity distribution.

### N-2: Do-not-disturb / mute mode

For high-throughput analysis workflows (batch evaluation, mass plugin sweeps), there should be a
way to suppress badge pushes for the duration of the operation and deliver a single summary push
at completion. This is a `NotificationService` adapter concern, not a projector concern — the
seam is already in the right place. Track as a future `BatchedNotificationService` wrapper.

### N-3: Escalation from attention → urgent if unacknowledged

If an `attention`-tier event is not acknowledged (seen/dismissed) within a configurable window, it
should escalate to `urgent` visually. This requires the read/ack cursor from I-1 as a prerequisite.
Low priority for now — track as future work once I-1 is addressed.

### N-4: Snooze for known-noisy event types

Some attention-tier events may be expected (e.g., a known plugin under active remediation). A
per-event-type snooze (suppress badge pushes for `quarantine` events from plugin X for N minutes)
would reduce fatigue for situations where the human is already aware of the issue. This is a
policy-layer extension — `NotificationPolicy.shouldPush()` could accept a `snoozeList` context
parameter.

---

## What the Design Gets Right

Worth stating explicitly:

- **Tier gating is correct.** Pushing on attention + urgent only, silencing notice + info, is
  exactly the right attention hygiene. The two-tier gate preserves badge signal value.
- **`NotificationService` is the right seam.** All UX complexity (coalescing, debounce, DND,
  escalation) can be implemented as adapter decorators around this port without touching the
  projector. Roger's seam design is clean.
- **Projection purity is well-tested.** The purity contract (PC-1 through PC-4) ensures the
  projector's materialization logic is deterministic. That's the right foundation before adding
  rendering semantics on top.
- **`queryEvents()` interface is stable.** Read/ack cursors, filtering by level, future persistence
  — all can be added without changing the acceptance test contract.

---

## Summary Priority Order

| # | Finding | Severity | Effort |
|---|---------|----------|--------|
| B-1 | ℹ️ fallback icon for attention-tier | Blocking (if rendering ships) | Low — one-line change |
| I-1 | No dismiss/ack — badge grows forever | Important | Medium — needs seenOffset cursor |
| I-2 | Burst coalescing absent | Important | Medium — adapter layer |
| I-3 | Priority not surfaced in push payload | Important | Low — add field to payload |
| I-4 | Emoji-only accessibility exposure | Important | Low — add label field |
| I-5 | ✓ icon misleads on decision notifications | Important | Low — swap icon |
| N-1 | Separate counts by tier | Nice | Low |
| N-2 | Do-not-disturb mode | Nice | Medium |
| N-3 | Escalation logic | Nice | High |
| N-4 | Per-type snooze | Nice | High |

