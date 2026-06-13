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


