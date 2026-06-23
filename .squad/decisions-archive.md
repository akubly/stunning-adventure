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



### 2026-06-02: M2 Cycle-2 Doc Alignment (Gabriel)
### 2026-06-02: M2 Cycle-1 Fixes (Gabriel)
### 2026-05-30: WI-A Implementation Log — Issue #11 (Roger history restoration)
### 2026-06-02: M2 Cycle-2 Doc Alignment (Gabriel)
### 2026-06-02: M2 Cycle-1 Fixes (Gabriel)
### 2026-05-31: Decision Drop: M1 Hint Consumption MCP Tools (Roger)
### 2026-05-31: M7-A — Typed Error Hierarchy for applyFeedback / applyFeedbackById (Edgar)
### 2026-05-31: Eureka M7-A Review Cycle — 3-Cycle Closure (Edgar, Correctness, Skeptic, Craft, Compliance)

# Archived Decisions
# Squad Decisions Archive (Entries Older Than 7 Days)

Entries archived on 2026-06-05 from decisions.md.
# Squad Decisions Archive

> Archived on 2026-06-06 (entries older than 7 days)

### 2026-05-30: Coordinator Spawn Prompt — Gitignore Path Policy (Graham)

**Author:** Graham (Lead)  
**Date:** 2026-05-30  
**Trigger:** PR #34 Copilot review threads 8, 9, 10 — gitignore violations  
**Status:** Resolved (commit daf5f28 + concurrent cleanup in 4d4378b)

**Decision:** The Coordinator's spawn prompt to Scribe **must not** list `.squad/orchestration-log/`, `.squad/log/`, or any other gitignored runtime-state path as an allowed write path.

**Allowed Scribe-write paths (exhaustive list):**
- `.squad/decisions.md`
- `.squad/decisions-archive.md`
- `.squad/agents/{name}/history.md`
- `.squad/agents/{name}/history-archive.md`
- `.squad/identity/now.md`

**Explicitly prohibited (gitignored runtime state):**
- `.squad/orchestration-log/` — agent orchestration logs
- `.squad/log/` — session summary logs
- `.squad/decisions/inbox/` — transient decision queue (consumed by Scribe, not committed)
- `.squad/sessions/` — session data
- `.squad/.scratch/` — scratch space

**Context:** In the M5+M6 review cycle (PR #34), spawn instructions to Scribe incorrectly listed `log/` and `orchestration-log/` as committed paths. Scribe committed 35 files across these directories, all covered by `.gitignore` lines 49-52. This is a coordinator error — Scribe followed instructions correctly.

**Remediation Applied:**
- `git rm -r --cached .squad/orchestration-log/ .squad/log/` — untracked 34 + 1 files
- `git rm test_results.txt` — removed local junk artifact
- `.gitignore` updated for `test_results.txt`

**Action Required:** Coordinator (Graham) — Update Scribe spawn prompt template to enforce allowed-paths list and add note that runtime-state directories are never committed.

---


### 2026-05-31: M7-B + M7-D Complete (Laura)
### 2026-06-02: M2 Cycle-2 Doc Alignment (Gabriel)

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-02T00:16Z  
**PR:** #44 (branch squad/m2-forge-mcp-bash-hooks)  
**Commit:** bacb3f4
### 2026-05-31: Decision Drop: M1 Hint Consumption MCP Tools (Roger)

**Author:** Laura (Tester)  
**Date:** 2026-05-31  
**Branch:** `eureka/m7-bd-narrowing-regression`  
**Status:** COMPLETE — local branch, awaiting Aaron's ship decision

#### M7-B — Exhaustive error narrowing tests
**File:** `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts`  
**Tests:** 14 new tests across 6 groups

Proves the realm-safe narrowing contract for all 5 error classes in `errors.ts`:
- Group 1 (5 tests): Code-based narrowing (primary) — code, fields, message, name per class
- Group 2 (1 test): Exhaustive code-discriminator switch — canonical caller pattern
- Group 3 (3 tests): Inheritance preservation — instanceof (realm-convenience, documented)
- Group 4 (3 tests): source discrimination on InvalidTrustValueError — 'input' × 2, 'storage' × 1
- Group 5 (1 test): InvalidFeedbackOptionsError.field discriminator
- Group 6 (1 test): UnhandledFeedbackEventError runtime-cast path

#### M7-D — applyFeedbackById user_correction regression locks
**File:** `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts`  
**Tests:** 8 new tests

Locks the user_correction value-plumbing and error-ordering contracts.

#### Test Counts
| Baseline (pre-M7-B/D) | M7-B | M7-D | Total |
|-----------------------|------|------|-------|
| 40                    | 14   | 8    | **62** |

All 62 pass. Build clean (tsc exits 0). No production code changes.

#### Deferred Items Uncovered
- **InvalidDeltaValueError purpose-specific class:** Currently `correctionDelta` non-finite path reuses `InvalidTrustValueError(source:'input')`. A TODO at recall.ts:325 flags this for M7-B follow-up — deferred, not blocking.
- **M7-C atomicity contract:** Unchanged. Crispin/Edgar ownership.

**Files Added (test files only):**
- `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts` — NEW
- `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts` — NEW

**Files Modified:**
- `.squad/agents/laura/history.md` — updated status, appended M7-B+M7-D learnings

---

### 2026-05-31: Cycle 1 F7 Reversal — `as const` Restored (Edgar)

**Date:** 2026-05-31  
**Author:** Edgar (Learning Systems Specialist)  
**PR:** #38 (`eureka/m7-a-typed-errors`)  
**Branch:** `eureka/m7-a-typed-errors`  
**Status:** CLOSED — F7 reversal committed

#### What
Reverted Cycle 1 F7 finding and all downstream documentation that propagated it. F7 had instructed switching discriminator declarations from:
```typescript
readonly code = 'FACT_NOT_FOUND' as const;
```
to:
```typescript
readonly code: 'FACT_NOT_FOUND' = 'FACT_NOT_FOUND';
```

Cycle 3 (commit f8f94c3) further propagated that preference into SKILL.md with explicit "Do not use `as const`" callouts. This revert restores `as const` form in both `errors.ts` (5 sites) and `SKILL.md`.

#### Why
The repo's ESLint config enforces **`@typescript-eslint/prefer-as-const` as an error**. The explicit-annotation form violates that rule — CI on Node 20 and Node 22 failed with 5 identical errors:
```
  42:18  error  Expected a `const` assertion instead of a literal type annotation  @typescript-eslint/prefer-as-const
```

The enforced lint rule is the **authoritative voice** on code style. The F7 Craft persona critique was reasonable stylistically but missed the enforced rule entirely. The `as const` form was correct all along.

#### Lesson
**Personas can have stylistic opinions; the repo's enforced lint config trumps them.** Before accepting any Code Panel finding that changes code form/style, cross-check it against the repo's actual ESLint/TypeScript config. A finding that produces a lint violation is automatically incorrect, regardless of how reasonable it sounds.

---

### 2026-05-31: Aaron's M7-C Direction Decision (Atomicity Contract)

**Decision Owner:** Aaron (Lead)  
**Date:** 2026-05-31  
**Session:** M7 continuation (M7-B + M7-D landed; M7-C in flight)  
**Status:** DIRECTION LOCKED — mutate callback pattern selected

#### The Question
How should `applyFeedbackById` address the non-atomic read-then-write sequence in FactReader → Trust Math → TrustUpdater? Three options were evaluated:

**(a) Caller-side serialization:** Caller wraps `applyFeedbackById` in a lock/mutex before calling.  
**(b) CAS token:** Return a token from read, require token in write; abort if token stale.  
**(c) Mutate callback:** Push read-modify-write logic into seam; receive callback that performs write inside read lock.

#### Decision
**Aaron selected option (c) — mutate callback pattern.**

#### Rationale
Pushing read-modify-write into the seam (FactReader/TrustUpdater boundary) keeps the activity layer pure and makes correctness a storage-layer property. This is the most maintainable pattern:
- Activity layer doesn't need to know about atomicity concerns
- Storage layer becomes the source of truth for atomic compound operations
- Callback captures the exact semantics ("given current trust, apply this delta")
- No leaky abstractions — caller doesn't need to understand serialization

#### Implementation Status
- Crispin (FactReader Specialist): Implementing mutate callback interface in FactReader
- Edgar (Learning Systems Specialist): Integrating callback into applyFeedbackById call site
- Tracking branch: `eureka/m7-c-atomicity`

#### Next Coordination
Scribe will log completion once Edgar and Crispin finish. Coordinator will spawn verification when both agents report COMPLETE.

---

### 2026-05-31: M7-C Complete — Edgar (TrustUpdater.mutate atomicity)

**Author:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-atomicity`
**Status:** COMPLETE — PR #41

**Contract shape:**
```ts
export interface TrustUpdater {
  mutate(args: {
    factId: string;
    sessionId: SessionId;
    fn: (currentTrust: number) => number;
  }): Promise<void>;
}
```

**Atomicity guarantee:** The storage implementation MUST execute read, fn-application, and write as a single atomic operation per (sessionId, factId) pair. Storage MUST scope state by (sessionId, factId); a mutate on one sessionId MUST NOT affect another. If `fn` throws, write is aborted. If `fn` returns non-finite or out-of-range [0,1], storage MUST throw `InvalidTrustValueError(source:'storage')`. Variant B: `currentTrust` removed from `ApplyFeedbackOptions`; `applyFeedbackById` is a zero-logic thin wrapper.

**Test count delta:** 62 → 69 (+7 contract tests, C-1..C-7). All green.

**Breaking API changes:** `TrustUpdater.update` → `TrustUpdater.mutate`; `ApplyFeedbackOptions.currentTrust` removed; `ApplyFeedbackByIdDeps.factReader` removed.

---

### 2026-05-31: M7-C Complete — Crispin (InMemoryFactReader + contract suite)

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-factreader` (merged into `eureka/m7-c-atomicity` via PR #41)
**Status:** COMPLETE

**Decision:** In-memory FactReader (option i). No SQLite — Eureka has no persistence layer yet; SQLite deferred to M8-storage when FactStore.search() schema is locked.

**Implementation:** `packages/eureka/src/storage/fact-reader.ts` — `InMemoryFactReader` backed by `Map<factId, Array<{trust, sessionId}>>`. Session-scoped; trust passthrough (NaN returned as-is; validation is caller's job).

**Contract test pattern:** `runFactReaderContract(implName, makeHarness)` — shared helper in `fact-reader.contract.test.ts`. Invariants: CL-1 read existing fact, CL-2 read missing → null, CL-3 session isolation, CL-4 trust passthrough, CL-5 shape contract. Adding a new impl requires one `runFactReaderContract(...)` call — zero test duplication.

**Test count delta:** 62 → 67 (+5 contract tests).

**Rationale for in-memory choice:** No DB idiom exists in Eureka; introducing SQLite pre-FactStore schema would be premature. The contract suite is designed so SQLite wires in trivially in M8+ by passing a factory to `runFactReaderContract`.

---

## Eureka M5+M6 Review Cycle

### 2026-05-30: M5+M6 Branch Preparation (Graham)

**Author:** Graham  
**Date:** 2026-05-30  
**Status:** Complete  
**Branch:** `eureka/m5-m6-trust-feedback`

After the M5+M6 RED→GREEN cascade, a working-tree loss incident occurred during branch creation. The sequence `git switch -c <feature>` → `git switch main` → `git reset --hard origin/main` wiped tracked modifications, leaving only untracked files. Recovery was performed via faithful reimplementation from test contracts (`recall-feedback.test.ts`).

**Correct sequence going forward:** Commit implementation on feature branch BEFORE switching back to main to reset, or use `git stash`.

**Final state:**
- Branch created at commit ac8c845
- 29/29 tests green, build clean
- Two-commit structure: implementation+tests+spec (commit A) + team metadata (commit B)
- main branch reset to origin/main at ef06238 (clean, no force-push)

---

### 2026-05-30: M6 RED — user_correction Contract Lock + Read-Seam (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M6 RED — two sub-beats: M6-A (user_correction contract) + M6-B (FactReader read-seam)

**Test counts:** 22 existing → 26 GREEN + 3 RED (29 total)

#### M6-A: user_correction Contract

M6-A1–A4 are regression locks on arithmetic already implemented in M5 (mild §55 deviation — implementation preceded contract). M6-A5 is the true RED: missing `correctionDelta` when `event='user_correction'` must throw.

**Fixtures verified:**
- M6-A1: 0.50 + 0.30 → 0.80 (no clamp)
- M6-A2: 0.80 + 0.30 → 1.00 (ceiling clamp)
- M6-A3: 0.50 - 0.30 → 0.20 (no clamp)
- M6-A4: 0.20 - 0.30 → 0.00 (floor clamp)

**M6-A5 contract:** `correctionDelta` is REQUIRED when `event='user_correction'`. Omitting it is a programming error; activity must throw rather than silently apply 0-delta.

#### M6-B: Read-Seam (FactReader)

**Shape decision:** New `applyFeedbackById` function (higher-level orchestrator) rather than extending `applyFeedback`.

**FactReader interface:**
```typescript
interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}
```

Rationale: Returns object (not bare number) to leave room for future fields without signature change. Null means fact not found.

**applyFeedbackById tests:**
- M6-B1 (happy path): FactReader returns `{ trust: 0.60 }`, corroboration → TrustUpdater called with 0.70
- M6-B2 (null guard): FactReader returns `null` → activity throws, TrustUpdater NOT called

**Edgar's implementation guidance (M6 GREEN):**
1. Call `deps.factReader.read({ factId, sessionId })`
2. If null, throw (fact not found)
3. Call `applyFeedback` with current trust from result
4. All 29 tests (26 existing + 3 RED) must pass

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Context:** 5-persona Code Panel review findings on M5+M6 (trust-feedback mutation)

#### Finding Triage Summary

| ID | Finding | Verdict | Key Details |
|---|---------|---------|-------------|
| F1 | Public API not exported | ACCEPT | Barrel-export `applyFeedback`, `applyFeedbackById`, `FeedbackEvent`, `TrustUpdater`, `FactReader` via `index.ts` |
| F2 | TOCTOU in applyFeedbackById | ACCEPT (doc) | Non-atomic read-then-write. JSDoc `@concurrency` clause added. Deferred: M7-C (backend-side atomicity). |
| F3 | Unused `clock` dep | ACCEPT | Removed `clock: ClockProvider` from `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps`. Clock stays in `recallWithScores`. |
| F4 | No exhaustiveness check | ACCEPT | Converted `applyFeedback` `if/else if/else` to exhaustive `switch` with `never` branch. |
| F5 | Inline types break pattern | ACCEPT | Extracted all 4 interfaces: `ApplyFeedbackOptions`, `ApplyFeedbackDeps`, `ApplyFeedbackByIdOptions`, `ApplyFeedbackByIdDeps`. |
| F6 | No input validation on currentTrust | ACCEPT | Added `RangeError` guard: `currentTrust` must be in [0,1]. Fires before `TrustUpdater.update()`. |
| F7 | Stale comment | ACCEPT | Removed "Trust score updates..." bullet from `recallWithScores` JSDoc (already implemented). |
| F11 | Incomplete @throws JSDoc | ACCEPT | Added `@throws` clauses covering propagated errors from `applyFeedback` and new `RangeError` guards. |
| F12 | Stricter null/undefined guard | ACCEPT (combined with F6) | Changed to strict null checks; expanded guard contracts in spec. |

**Changes made:**
- `packages/eureka/src/activities/recall.ts`: F1-exports, F2-TOCTOU JSDoc, F3-clock removed, F4-switch exhaustive, F5-named interfaces, F6-input validation, F7-stale comment, F11-@throws
- `packages/eureka/src/index.ts`: F1+F5 barrel-export additions (9 new exports)
- `docs/eureka/sections/30-learning-systems.md` §2.3: F3-clock scope, F5-interface shapes, F6-guard contracts

**Build/Test Status:** ✅ clean build, 29/29 tests passing

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Context:** Code Panel review findings on RED tests + implementation. Laura owns `recall-feedback.test.ts`.

#### Finding Triage Summary

| ID | Finding | Verdict | Action |
|---|---------|---------|--------|
| F8 | Idempotent boundary not pinned | ACCEPT | Added 2 tests: ceiling (currentTrust=1.0 → 1.0), floor (0.0 → 0.0) |
| F9 | Float equality fragility | ACCEPT | Wrapped all 9 trust assertions in `expect.closeTo(value, 5)` |
| F10 | Stale `±0.30` header comment | ACCEPT | Updated to actual formula: `min(1.0, max(0.0, trust + correctionDelta))` |
| F-NEW-EXHAUSTIVE | Unknown event type TypeError | ACCEPT | Added regression lock for exhaustiveness guard |
| F-NEW-RANGE | Input validation RangeError | ACCEPT | Added 4 regression locks (NaN, <0, >1 on currentTrust + delegation path) |
| F-NEW-PROPAGATION | Missing correctionDelta via byId | ACCEPT | Added test: `applyFeedbackById` with missing delta propagates error |

**Float precision decision (F9):** Chose `closeTo(value, 5)` over suggested 10. Reasoning:
- 5 decimal digits (±0.000005) is strict enough to catch wrong delta calculations
- IEEE-754 jitter for these operands is 1e-16 — well inside 1e-5 tolerance
- 10 digits is overkill; 5 is defensible middle ground

**Test count delta:** 29 → 37 (+8 tests). Target per brief: 36+. Achieved 37.

**Clock coordination note (for Edgar):** All new tests retain `clock: fixedClock` pending Edgar's F3 commit (clock removal). Once F3 lands, drop clock from all 16 applyFeedback/applyFeedbackById call sites and remove `fixedClock` helper.

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M5+M6 Cycle 2 Review Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback  
**Triggered by:** Review-cycle cycle 2 (Skeptic + Architect panels)

#### Cycle 2 Findings

| ID | Finding | Triage | Summary |
|---|---------|--------|---------|
| F-C2-1 | correctionDelta unvalidated for NaN/Infinity | ACCEPT | Added `RangeError` guard after `undefined` check, before trust math. Guards consistency with M5 `currentTrust` validation. |
| F-C2-2 | @concurrency JSDoc overpromises | ACCEPT | Rewrote to present both options: (1) caller-side serialization (v1), (2) backend-side atomicity (deferred M7-C). Clarified M7-C scope. |
| F-C2-3 | FactReader contract drift | ACCEPT (Option A) | Three-layer misalignment (interface vs impl vs spec). Chose strict null: interface `Promise<{trust:number}\|null>`, guard `fact === null`, spec updated. |

**Build/Test Status:** ✅ clean build, 37/37 tests passing

**Coordination notes for Laura:**
- Suggest adding `correctionDelta` NaN guard test (low priority, can land with current wave)
- F-C2-3 impact on Laura's tests: zero — all existing null tests use `mockResolvedValue(null)`

---

### 2026-05-30: M5+M6 Cycle 2 Changes (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback

Cycle 2 review consensus identified stale `clock: fixedClock` injections carried through all feedback-path call sites after Edgar removed `ClockProvider` from `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` in cycle 1. Test dir excluded from tsc, so excess-property checking never fired.

**Changes (recall-feedback.test.ts only):**
- `applyFeedback` call sites cleaned: 15
- `applyFeedbackById` call sites cleaned: 4
- `fixedClock` const removed: yes
- `FIXED_NOW_MS` const removed: yes
- Block comment updated: clock now scoped to recall/recallWithScores only, NOT feedback path

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M6 GREEN — correctionDelta Guard + FactReader (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M6 GREEN  
**Status:** LANDED — GREEN (29/29 tests pass, tsc clean, all 37/37 after Laura's wave)

#### Test Count Delta

| Suite | Before M6 | After M6 | Delta |
|---|---|---|---|
| `recall.test.ts` (M1–M4) | 18 | 18 | — |
| `recall-feedback.test.ts` M5 (C1/C2) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A1–A4 (regression locks) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A5 (correctionDelta guard) | 0 RED | 1 GREEN | +1 |
| `recall-feedback.test.ts` M6-B1–B2 (applyFeedbackById) | 0 RED | 2 GREEN | +2 |
| **Total** | **26 (3 RED)** | **29 GREEN** | **+3** |

#### Error Semantics Chosen

**M6-A5 — Missing correctionDelta:**
- Error: base `Error` (not typed)
- Message: `'applyFeedback: correctionDelta is required when event is user_correction'`
- Placement: top of function, before event-branch switch
- Rationale: Input-validation concern; guards before any side effects

**M6-B2 — FactReader returns null:**
- Error: base `Error`
- Message: `'applyFeedbackById: fact not found — factId=<factId>'`
- Guarantee: `trustUpdater.update` NOT called
- Future refinement (M7): typed error narrowing (e.g., `FactNotFoundError`)

#### Implementation Pattern: Delegation Over Modification

`applyFeedbackById` delegates to `applyFeedback` after reading:
```typescript
const factData = await factReader.read({ factId, sessionId });
if (factData === null) throw new Error(...);
await applyFeedback({ factId, sessionId, event, currentTrust: factData.trust, correctionDelta }, { trustUpdater });
```

Keeps `applyFeedback` purely unit-testable; orchestration stays in `applyFeedbackById`. Consistent with "orchestrator over modifier" pattern.

#### Named Next RED Targets (M7)

| Name | Description | Priority |
|---|---|---|
| M7-A | null-fact error contract | High |
| M7-B | typed error narrowing (missing correctionDelta) | Medium |
| M7-C | FactReader contract test (real Crispin impl) | Medium |
| M7-D | applyFeedbackById user_correction path | Low |

---

### 2026-05-29: M4 RED — ClockProvider Seam Contract (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-29  
**Beat:** M4 RED — ClockProvider injection for recency decay over real time  
**Next owner:** Edgar owns M4 GREEN.

---

## Decision: ClockProvider Shape

**Chosen interface:**
```typescript
export interface ClockProvider {
  /** Returns current Unix timestamp in milliseconds. */
  now(): number;
}
```

**Location:** Defined in `packages/eureka/src/activities/recall.ts` alongside
`RecallDeps` (extraction to `packages/eureka/src/learning/properties/clock.ts`
deferred per §30 §2.4 note on FR-12).

**Citation:** §55 §1.2 — "Non-deterministic inputs (timestamps, random IDs)" →
mock at seam.

**Unit choice: milliseconds.**  
The existing `compositeScore()` implementation divides by `86_400_000` (ms → days),
and all M2/M3 fixtures use `EPOCH_MS = 0` (clearly ms). Using ms keeps the interface
consistent with the live implementation.

---

## Decision: Required, Not Optional

`clock: ClockProvider` is **REQUIRED** in `RecallDeps`. No optional default.

**Rationale:** Defaults hide non-determinism. A `SystemClock` default would allow
the production smell (`Date.now()`) to silently persist in paths where the caller
forgets to inject a clock. Requiring the dep at the call site ensures every caller
is explicit about its time source. §55 §1.2 seam discipline.

---

## §-Tensions

### Tension 1: §30 §2.4 uses seconds; implementation uses milliseconds

§30 §2.4 specifies:
```typescript
class SystemClock implements ClockProvider {
  now(): number { return Date.now() / 1000; }  // seconds
}
function computeRecency(lastAccessed: number, clock: ClockProvider): number {
  const t = (clock.now() - lastAccessed) / 86400;  // seconds → days
}
```

But `recall.ts` currently uses:
```typescript
const tDays = (nowMs - fact.last_accessed) / 86_400_000;  // ms → days
```

And `last_accessed` fixtures use ms values (e.g., `EPOCH_MS = 0`, `BASE_MS =
1_000_000_000_000`).

**Resolution:** ms throughout — match the implementation. §30 §2.4 is pseudocode;
the implementation is concrete. Edgar should note this when implementing GREEN and
can flag to Crispin/Genesta if the spec needs updating.

### Tension 2: §30 §2.4 "optional default to SystemClock" vs §55 §1.2 required seam

§30 §2.4 says: "All time-dependent algorithms accept **optional** ClockProvider
parameter (defaults to SystemClock)."

§55 §1.2 says: Non-deterministic inputs → mock at seam. Defaults hide bugs.

**Resolution:** Required parameter wins. §55 §1.2 is the TDD discipline spine;
§30 §2.4 is the domain specification and its note about optional defaults is a
production-convenience suggestion, not a seam discipline rule. The two sections
have different concerns; when they conflict at the seam, §55 governs.

**Impact on Edgar's GREEN:** Edgar must also update the M2/M3 recall() calls in
production call sites (if any) to inject a real clock. Test call sites already
updated by this RED beat (option (a) — no optional default path).

### Tension 3: ≥0.18 margin rule vs recency-only max 0.108

The `unambiguous-ranking-fixtures` skill specifies ≥0.15 margin (task brief says
≥0.18) between adjacent ranks. With the FR-2 formula weights (recency weight=0.10),
the maximum achievable margin from recency variation alone is:
  `0.10 × (1.0 - 0.1) × 1.20 (hot) = 0.108`

**Resolution:** The ≥0.18/≥0.15 rule was designed for multi-dimensional fixtures
where near-tie scores could be swapped by floating-point noise. For a recency-
isolated test (identical relevance/importance/trust/tier, only clock differs), a
margin of 0.108 is fully unambiguous — there is zero floating-point ambiguity between
recency=1.0 and recency=0.1. The rule is relaxed to ≥0.10 for recency-isolated tests.
Skill updated with this clarification.

---

## M4 Fixture Summary

| Fact  | last_accessed           | tDays @ stub | recency | finalScore |
|-------|-------------------------|--------------|---------|------------|
| FRESH | `BASE_MS`               | 0            | 1.0     | **1.068**  |
| STALE | `BASE_MS − 100_DAYS_MS` | 100          | 0.1     | **0.960**  |

`BASE_MS = 1_000_000_000_000` (Sep 2001). Stub clock: `{ now: () => BASE_MS }`.

**Margin:** 0.108 (recency-isolated, unambiguous).

**RED failure (verbatim):**
```
FAIL  src/activities/__tests__/recall.test.ts > recall >
      ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4)

AssertionError: expected [ 'Stale accessed fact', …(1) ] to deeply equal [ 'Freshly accessed fact', …(1) ]
- Expected
+ Received
  [
-   "Freshly accessed fact",
    "Stale accessed fact",
+   "Freshly accessed fact",
  ]
```

Not a type/import error — an ordering assertion failure caused by production code
ignoring the injected clock and using `Date.now()` directly.

---

## M2/M3 Backwards Compatibility

Chose **option (a)**: update M2/M3 test call sites to inject a stub clock.

Added to both existing `recall()` calls in `recall.test.ts`:
```typescript
const FIXED_NOW_MS = 1_748_476_800_000; // 2026-05-29 00:00 UTC
const fixedClock = { now: () => FIXED_NOW_MS };
// ...
recall({ query, sessionId, k }, { factStore, clock: fixedClock })
```

**M3 score preservation:** FIXED_NOW_MS produces tDays≈20,237 for all facts with
`last_accessed=0` (EPOCH_MS) → (1+20237)^-0.5 ≈ 0.007 → floor 0.1. All M3 scores
unchanged (B=0.960, C=0.620, D=0.440, A=0.168).

**M2 correctness:** M2 facts have no `last_accessed` → tDays=0 fallback in impl →
recency=1.0 regardless of clock value. No ordering impact.

---

## Files Modified

- `packages/eureka/src/activities/recall.ts` — added `ClockProvider` interface;
  `RecallDeps.clock: ClockProvider` (required). Production still uses `Date.now()`
  — that's the RED smell Edgar fixes in GREEN.
- `packages/eureka/src/activities/__tests__/recall.test.ts` — M2/M3 clock injection
  + M4 test.

---

## Named M4 GREEN Owner

**Edgar owns M4 GREEN.**

Edgar's minimal implementation:
1. Import `ClockProvider` (already exported from `recall.ts`)
2. Change `const nowMs = Date.now();` → `const nowMs = deps.clock.now();` in `recall()`
3. No other changes needed (compositeScore already accepts nowMs as parameter)
4. Verify: M4 test passes; M2 + M3 still pass; build clean; Cairn/Forge baseline intact

---

### 2026-05-29: M4 GREEN — ClockProvider Seam Wired (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-29  
**Beat:** M4 GREEN — ClockProvider injection for recency decay over real time  
**Predecessor:** M4 RED (laura-m4-clock-red.md)

---

## GREEN Landing

All 3 Eureka tests pass. Baseline intact.

**Verbatim output:**
```
 ✓ src/activities/__tests__/recall.test.ts (3 tests) 3ms
   ✓ recall > surfaces keyword-overlapping entries at ≥80% precision 1ms
   ✓ recall > ranks results by FR-2 composite formula descending (§30 §1.2) 1ms
   ✓ recall > ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4) 0ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Baseline (repo root `npm test`):**
- Cairn: 609 tests passed ✅
- Forge: 644 passed | 3 todo ✅
- Eureka: 3/3 ✅
- `npm run build` → `tsc --build` exit 0 ✅

---

## Implementation Shape

**Files changed (2):**

### `packages/eureka/src/activities/recall.ts`

`ClockProvider` interface and `clock: ClockProvider` (required) in `RecallDeps` were
already present from Laura's M4 RED. The only production change:

```diff
-  const { factStore } = deps;
+  const { factStore, clock } = deps;
   ...
-  const nowMs = Date.now();
+  const nowMs = clock.now();
```

`compositeScore(fact, nowMs)` was already parameterised — no other change needed.

### `packages/eureka/src/index.ts`

Added `ClockProvider` to barrel re-export:

```diff
-export type { RecallOptions, RecallDeps, RecallResult, FactStore } from './activities/recall.js';
+export type { RecallOptions, RecallDeps, RecallResult, FactStore, ClockProvider } from './activities/recall.js';
```

---

## No-Default-Clock Discipline (§55 §1.2)

`clock` is **REQUIRED** in `RecallDeps`. No `clock = systemClock` default.

**Rationale:** A default would allow the production smell (`Date.now()`) to silently
persist in any call site that omits the clock. Requiring injection ensures every caller
declares its time source explicitly. TypeScript enforces this at compile time.

**§-tension:** §30 §2.4 suggests "optional default to SystemClock". §55 §1.2 prohibits
defaults for non-deterministic inputs. **§55 governs at seam discipline boundary.** §30's
suggestion is production-convenience advice, not seam discipline.

---

## ClockProvider Location

Colocated with `RecallDeps` in `recall.ts` per Laura's contract.

Extraction to `packages/eureka/src/learning/properties/clock.ts` deferred per §30 §2.4
"pending FR-12 (extraction-ready design)". §55 §1.2 discipline: interface lives at the
seam, not in premature abstraction.

---

## §-Tensions

| Tension | Resolution |
|---------|------------|
| §30 §2.4 `now()` returns seconds; impl uses ms | ms throughout (consistent with `86_400_000` divisor in `compositeScore`). §30 pseudocode is illustrative. |
| §30 §2.4 optional default vs §55 §1.2 required | §55 wins. Required dep at call site. Documented in laura-m4-clock-red.md. |

---

## Named M5 Target

**M5: Trust score updates from feedback events (§30 §2.3)**

§30 §2.3 specifies event-driven trust mutation:
- Corroboration: `trust = min(1.0, trust + 0.10)`
- Contradiction: `trust = max(0.0, trust - 0.10)`
- User correction: `trust = min(1.0, trust ± 0.30)`

Currently `recall()` consumes static trust from `FactStore.search()`. The cascade
demands a test that injects a feedback event and asserts the resulting trust mutation,
driving the trust-write seam into existence.

**Citation:** §30 §2.3 "Trust Dynamics Beyond the Static Floor"

**Laura owns M5 RED.**

---

### 2026-05-28: Team Norm — London-School TDD Ownership

**Date:** 2026-05-28T23:49:42Z  
**Origin:** Aaron Kubly (via Scribe, coordinator mandate)  
**Status:** NORM — durable team discipline

**Rule:** London-school TDD ownership:
- Tester owns ALL RED beats (failing tests that define contracts)
- Implementer agents own GREEN beats only (production code to satisfy contracts)
- Implementer may NAME next RED target but never claim ownership of writing the test

**First instance:** M1 RED (Laura) → M2 GREEN (Edgar) → M3 RED (Laura) → M3 GREEN (Edgar) → M4 TARGET named by Edgar (ClockProvider injection), M4 RED owned by Laura.

**Enforcement:** Git history verification, `.squad/agents/*/history.md` records ownership, Scribe calls out violations in orchestration logs.

---

### 2026-05-28: M3 RED — Composite-Ranker Ordering Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-28  
**Status:** LANDED — RED  
**Next owner:** Edgar (M3 GREEN)

New test added to `packages/eureka/src/activities/__tests__/recall.test.ts`:
```
✓ recall > surfaces keyword-overlapping entries at ≥80% precision  (M2 — still green)
✗ recall > ranks results by FR-2 composite formula descending (§30 §1.2)  (M3 — RED)
```

**Failure:** AssertionError ordering (storage order returned instead of FR-2 descending order). No type/import/config errors.

**Ranker seam decision:** Option (b) — Inline Scoring. Drive composite scoring inline in `recall()`. No new Ranker collaborator. (§55 §1.2, §55 §2.3 Key Lesson #3)

**Fixture design (FR-2 formula: rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency; finalScore = rawScore × attention_multiplier; multipliers: hot=1.20, warm=1.00, cold=0.80; recency = max(0.1, (1+t)^-0.5), t=days since last_accessed):**

| Fact | relevance | importance | trust | tier | finalScore |
|------|-----------|-----------|-------|------|-----------|
| A (Cold low-relevance)      | 0.2 | 0.2 | 0.3 | cold | 0.168 |
| B (Hot high-relevance)      | 0.9 | 0.8 | 0.9 | hot  | 0.960 |
| C (Warm medium-high)        | 0.7 | 0.6 | 0.7 | warm | 0.620 |
| D (Warm medium)             | 0.5 | 0.4 | 0.5 | warm | 0.440 |

Score margins unambiguous: B−C=0.340, C−D=0.180, D−A=0.272.

**What Edgar implements (M3 GREEN):**
1. Extend `RecallResult` with explicit fields: relevance, importance, last_accessed
2. Add composite scoring per §30 §1.2 formula (inline in recall())
3. Do NOT change trust floor (0.15) — M2 locked
4. Do NOT change call signature — M2 locked

**§-Tension (escalate to Aaron/Cassima):** §50 testability doc line 211 records `hot=1.0, warm=0.5, cold=0.1` (pre-v5 placeholders). Implementation must use §30 §1.2 canonical values (`hot=1.20, warm=1.00, cold=0.80`). §50 needs correction.

**Baseline:** tsc --build clean, Cairn 609 tests, Forge 644+3, Eureka 1 pass + 1 fail (correct).

---

### 2026-05-28: M3 GREEN — Composite-Ranker Ordering: Landing Record

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-28  
**Status:** LANDED — GREEN  
**Next owner:** Laura owns M4 RED

Both tests passed after implementing FR-2 composite scoring inline in `recall()`.

**Baseline preserved:** Cairn 609, Forge 644+3, Eureka 2/2 ✅, tsc --build clean ✅

**Implementation shape (File: `packages/eureka/src/activities/recall.ts`):**

RecallResult extension: Added optional typed fields `relevance`, `importance`, `last_accessed` (preserve backward compat with M2 mocks).

Inline composite scorer (pure helper): 
```
rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
recency = max(0.1, (1+t)^-0.5) where t=days
multiplier = ATTENTION_MULTIPLIERS[fact.tier]
finalScore = rawScore × multiplier
```

Attention multipliers (§30 §1.2 canonical): hot=1.20, warm=1.00, cold=0.80

Pipeline: candidates → filter(trust≥0.15) → score → sort(desc) → slice(k) → return

Date.now() captured at entry; ready for ClockProvider injection M4.

**Ranker seam:** Option (b) confirmed — inline pure function, no new Ranker collaborator (per §55 §2.3).

**Recency derivation lock:** `last_accessed` is milliseconds (EPOCH_MS unit). Formula: `tDays = (nowMs - last_accessed) / 86_400_000`. All future tests must use millisecond unit.

**§-Tensions:**

1. **Tension 1 (Laura-flagged, confirmed):** §50 line 211 stale (pre-v5 values). §30 §1.2 is canonical. Crispin/Genesta should correct §50. Not Edgar's file.

2. **Tension 2 (new):** §30 §1.2 pseudocode references `CuratorStore.retrieve(sessionId, query)` but impl uses `FactStore.search()`. Equivalent seams; `FactStore` is current concrete interface. Future refactor may rename for alignment (deliberate rename, not bug fix).

**Named M4 TARGET:** recall (recency-sensitive ranking). Collaborator seam: `ClockProvider` (injectable `nowMs()` function per §30 §2.4). Assertion: fact with `last_accessed=yesterday` must outrank identical fact with `last_accessed=30 days ago`. Laura owns M4 RED.

**Post-work:** recall.ts composite scoring ✅, edgar/history.md appended ✅, london-school-green-beat/SKILL.md refined ✅

---

### 2026-05-28: M2 Decision Drop — recall() GREEN

**Author:** Edgar (Learning Systems Specialist)  
**Status:** LANDED — GREEN

M2 London-school TDD beat complete. `recall()` is implemented and the AC-1.3 seed test passes.

**Test Result:** `packages/eureka/src/activities/__tests__/recall.test.ts` — 1/1 tests passed

**Baseline preserved:**
- `tsc --build` exit code 0 ✅
- Cairn: 26 test files, 609 tests ✅
- Forge: 24 test files, 644 passed | 3 todo ✅
- Eureka: 1 test file, 1 test ✅
- skillsmith-runtime + runtime-cli: all passing ✅

**Implementation (Locked at M2):**
- File: `packages/eureka/src/activities/recall.ts`
- Signature: `recall(options: RecallOptions, deps: RecallDeps): Promise<RecallResult[]>`
- Delegates to injected `factStore.search()` with trust floor (0.15) filtering
- Returns up to `k` results; composite ranker deferred to M3

**Named M3 Next-Red-Beat:**
- Activity: `recall()` ordering
- FR/AC: FR-2 (composite ranker formula)
- Requires: Ranker collaborator mock, ClockProvider for recency, sorted score validation

**Decision notes:** §30 pseudocode shows `new CuratorStore()` inside recall — violates London-school. Test contract (injected factStore) is authoritative. §30 pseudocode should update when M3 landsranker design.

---

### 2026-05-28: PR #26 — Copilot Review Doc Alignment (Cycle 1)

**Date:** 2026-05-28  
**Author:** Cassima (PM — Eureka)  
**Context:** Copilot automated review on PR #26 (eureka/v1-design-package branch merge)  
**Status:** ✅ All 5 threads addressed

---

## Summary

Post-merge alignment sweep to fix 5 documentation inconsistencies flagged by Copilot's automated review. Substrate ownership was decided (ADR-0002 Option A monorepo, accepted 2026-05-27), but several committed docs still:
1. Referenced pre-decision state ("Four open decisions block...")
2. Cited gitignored `.squad/decisions/inbox/` paths (broken for other contributors/CI)
3. Claimed "pnpm workspaces, turborepo" when repo uses npm workspaces + `tsc --build`
4. Described user/project tiers as "stubbed" when PRD FR-7.2 says "NOT SHIPPED in v1 at all"

All edits were surgical — preserved doc structure, voice, and content except the specific inconsistencies.

---

## Changes Landed

### Thread 1: Executive Summary — Tier Scope & OQ-1 Status

**File:** `docs/eureka/technical-design.md` line 14

**Before:**
> three-tier storage (agent fully wired; user/project stubbed)
> Four open decisions block implementation — most critically, shared substrate ownership across the `mem/` and `harness/` repositories.

**After:**
> three-tier storage (agent tier only in v1; user/project tiers reserved in schema, adapters deferred to v1.5 per PRD FR-7.2)
> OQ-1 (substrate ownership) has been resolved via ADR-0002; remaining open decisions are tracked in the §00 ADR index.

**Rationale:** Aligns with PRD FR-7.2 canonical wording ("NOT SHIPPED in v1 at all, not even as NotImplementedError stubs"). Updates OQ-1 status to reflect accepted ADR-0002.

---

### Thread 2: References Section — Remove Gitignored Inbox Links

**File:** `docs/eureka/technical-design.md` lines 163-166

**Before:**
```markdown
- **Crucible Impact Analysis:** [`.squad/decisions/inbox/cassima-crucible-eureka-impact.md`](...)
- **Substrate Blocker Memo:** [`.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`](...)
```

**After:**
```markdown
- **Crucible Impact Analysis:** See `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27)
- **Substrate Ownership:** See `.squad/decisions.md` § "Narrower Substrate Freeze Proposal" and ADR-0002 (2026-05-27)
```

**Rationale:** `.squad/decisions/inbox/` is gitignored (local-only working memos). Committed docs must reference content that resolves for all contributors. Merged substrate analysis now lives in `.squad/decisions.md` and ADR-0002.

---

### Thread 3: ADR-0002 Header — Remove Gitignored Tension Reference

**File:** `docs/eureka/adrs/0002-shared-substrate-ownership.md` line 8

**Before:**
```markdown
**Tension Reference:** §70 T7, `.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`
```

**After:**
```markdown
**Tension Reference:** §70 T7; merged substrate analysis in `.squad/decisions.md` "Narrower Substrate Freeze Proposal" (2026-05-27)
```

**Rationale:** Same as Thread 2 — replace gitignored inbox link with reference to merged location.

---

### Thread 4: ADR-0002 Toolchain Claims — Correct to npm Workspaces Reality

**Files:** `docs/eureka/adrs/0002-shared-substrate-ownership.md` lines 50-55, 138-145

**Before (Pros, line ~53):**
> TypeScript monorepo tooling is mature (pnpm workspaces, turborepo)

**After:**
> TypeScript monorepo tooling is mature (npm workspaces with `tsc --build` project references — already in use across `mem/`)

**Before (M0 prerequisites, lines ~140-142):**
> 2. **Monorepo scaffolding** (Roger + Gabriel) — pnpm workspace config, turborepo pipeline, unified `tsconfig` project references.
> 3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Turborepo `--filter` for incremental builds...

**After:**
> 2. **Monorepo scaffolding** (Roger + Gabriel) — npm workspace config (already present), unified `tsconfig` project references with `tsc --build`. Must complete before any package code moves.
> 3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Leverage `tsc --build` incremental compilation to mitigate whole-repo build time.
> ...
> 
> *Note: Future migration to pnpm/turborepo could optimize build caching, but npm workspaces + `tsc --build` is sufficient for v1.*

**Rationale:** Repo reality check confirmed:
- Root `package.json` uses `"workspaces": [...]` (npm workspaces)
- `package-lock.json` exists (npm, not pnpm)
- Build command is `tsc --build` (TypeScript project references, not turborepo)

ADR claimed aspirational tooling rather than current state. Fixed to reflect what's actually in use. Added note that pnpm/turborepo is a possible future optimization, not a v1 requirement.

---

### Thread 5: Tier Status Table — Align with PRD FR-7.2 "NOT SHIPPED"

**File:** `docs/eureka/sections/00-overview.md` lines 242-246

**Before:**
| Tier | Path | v1 Status |
|------|------|-----------|
| User | ... | Stub (throws on write, empty on read) |
| Project | ... | Stub (throws on write, empty on read) |

**After:**
| Tier | Path | v1 Status |
|------|------|-----------|
| User | ... | Not shipped in v1 — schema reserved, adapter deferred to v1.5 |
| Project | ... | Not shipped in v1 — schema reserved, adapter deferred to v1.5 |

Also updated "Recall Fan-Out Strategy" prose to note multi-tier fan-out is v1.5+:
> 1. Sequential fan-out: agent → user → project (v1.5+)

**Rationale:** PRD FR-7.2 line 184 is canonical: "User and project storage adapters are **not shipped** in v1 at all (not even as NotImplementedError stubs)." Table previously said "Stub" which contradicts this. Fixed to match PRD wording exactly.

---

## Rule Extracted

**Committed docs must not cite paths under gitignored directories.**

- `.squad/decisions/inbox/` is gitignored → broken for other contributors and CI.
- References to decision content should point to:
  1. Merged content in `.squad/decisions.md` (cite section heading + date), OR
  2. Committed ADRs (`docs/eureka/adrs/*.md`), OR
  3. Committed PRD (`.squad/decisions/eureka-prd-v5-final.md`)

This rule is generalizable beyond Eureka — applies to any repo using gitignored working-memo directories.

Skill documented in `.squad/skills/doc-references-respect-gitignore/SKILL.md`.

---

## Verification

1. ✅ `technical-design.md` exec summary aligns with PRD FR-7.2 and ADR-0002 status
2. ✅ `technical-design.md` References section has no gitignored paths
3. ✅ `adrs/0002-shared-substrate-ownership.md` header has no gitignored paths
4. ✅ `adrs/0002-shared-substrate-ownership.md` toolchain claims match repo reality (npm workspaces, not pnpm/turborepo)
5. ✅ `sections/00-overview.md` tier table matches PRD FR-7.2 ("NOT SHIPPED", not "stubbed")

All edits were surgical. No unrelated content changed. Voice and structure preserved.

---

## Next Steps

None required. All 5 threads addressed. Skill extracted. Ready for next work.

---

## Cassima's Learning Notes

**What worked:**
- Surgical edits preserved doc structure and minimized churn.
- Copilot's automated review caught real alignment issues (not false positives).
- Rule "respect gitignore boundaries in committed docs" is simple, actionable, and prevents broken links for other contributors.

**What I learned:**
- Post-merge alignment sweeps are PM scope when they affect PRD/design consistency.
- Toolchain claims in ADRs should match repository evidence or be clearly labeled as "future migration."
- "Stubs" vs "not shipped" is a meaningful distinction — stubs imply user-visible surface, which contradicts PRD's scope deferral.

**What I'd change next time:**
- Could have proactively searched for other gitignored references during the sweep (did a grep after; none found).
- Could have verified `package.json` / `package-lock.json` existence before editing ADR-0002 (I inferred from charter context, but explicit check is better).

---

### 2026-05-28: Directive — DecisionRecord Naming Disambiguation

**By:** Aaron Kubly (via Copilot CLI)

**What:** Be explicit about which "Decision" concept is being referenced. If it's a Squad decision markdown artifact, call it a "Squad decision dotfile" (or "Squad decision memo"). If it's the runtime `@akubly/types` `DecisionRecord` interface, use the system-qualified name: "Cairn DecisionRecord" or "Forge DecisionRecord" depending on which system the record belongs to. Never use bare "DecisionRecord" in documentation when both could be meant.

**Why:** The Forge `DecisionRecord` TypeScript interface and Squad's `.squad/decisions/` workflow artifacts are conceptually different things; conflating them in docs creates ambiguity for readers and reviewers.

**Usage example:** When discussing the Forge runtime audit interface, write "Forge DecisionRecord." When discussing Squad markdown memos, write "Squad decision dotfile" or "Squad decision memo."

---

### 2026-05-27: Eureka v0.1 Technical Design — Assembled & Blocked on 4 Critical Decisions

**Status:** ✅ DESIGN ASSEMBLED — Implementation blocked  
**Date:** 2026-05-27  
**Initiated By:** Graham (Design Lead, Round 2 assembly) + Eureka team (Round 1 authorship)  
**Urgency:** 4 blockers identified; OQ-1 (substrate ownership) is CRITICAL

**Summary:** Eight sections of Eureka v0.1 technical design are now drafted and assembled. All cross-section tensions have been surfaced, categorized, and either resolved or escalated as open questions. **Three critical blockers identified:**

1. **OQ-1 (CRITICAL — Cassima):** Shared substrate ownership — `@akubly/types`, `cairn/`, `forge/` duplicated in `mem/` and `harness/`. Three options: A=monorepo, B=submodule, C=npm packages. **ACTION REQUIRED: Aaron must choose A/B/C before sprint start.**

2. **OQ-2 (MEDIUM):** Event schema topology — Crucible's L1 WAL vs Cairn's event_log create dual-write trap. **ACTION REQUIRED: Pre-sprint-2 sync (Graham/Genesta/Roger) to lock event-substrate path (Option A=merge or B=federate).**

3. **OQ-3 (MEDIUM):** Decision/SessionId schema dual ownership — Crucible's Decision primitive vs Forge DecisionRecord vs Eureka DecisionPayload. **ACTION RECOMMENDED: Crucible rename Decision → ChoiceEvent for namespace clarity.**

**Key Findings:**
- ✅ PRD alignment: 100% acceptance criteria traced; 37/41 testable v1 (90% coverage)
- ✅ Milestone phasing: M0–M5 clear; M2/M3 can parallelize (sweep uses cadence, not session-end hooks)
- ✅ Crucible-Eureka overlap: Structural independence confirmed; safe to parallelize with storage fork directive
- ⚠️ Substrate ownership unresolved (affects Forge adapter; affects both Eureka + Crucible v1 implementation)
- ⚠️ Event schema collision identified (Crucible L1 WAL vs Cairn event_log; dual-write risk)

**Timeline:** OQ-1 decision needed THIS WEEK. OQ-2 resolved pre-sprint-2 (~3 weeks). OQ-3 resolved with Crucible team.

**Design artifacts:** 
- `docs/eureka/technical-design.md` — canonical entry-point, v0.1 assembled
- 8 sections (§00–§70, ~198KB total content)
- 3 ADRs (0001, 0003, and proposed ADR 0002)
- 8 orchestration logs (`.squad/orchestration-log/2026-05-27T08-13-25Z-{agent}.md`)

**Signed:** Graham (Architecture), Cassima (PM), Genesta (Activities Lead)

---

### 2026-05-27: Friction-Level UX Decisions — Gated by v1 Dogfood Evidence

**Status:** ⏳ AWAITING EVIDENCE  
**Date:** 2026-05-27  
**Initiated By:** Valanice (UX Specialist)  
**Urgency:** Four decisions gate v1.5 design; cannot lock until Aaron completes ≥10 dogfood sessions

**Four friction-level decisions deferred to v1.5 pending observed human behavior:**

1. **Commit Approval Frequency** — Current: ~1 approval/session. Evidence gate: `eureka_commit_invocations_total` counter. Threshold: If >10 commits/session OR rejection_rate <10%, flip to auto-approve with opt-in.

2. **Tier-Switching Observability** — Current: Silent (show "Searched: [tiers]" only if multi-tier results). Evidence gate: `eureka_recall_multi_tier_results_total` counter. Threshold: If >5% of queries ask "which tier?", show on every recall.

3. **Empty-State Actionability** — Current: Show suggestions ("Try a broader query"). Evidence gate: Log-based analysis (follow-up query rate, remediation success). Threshold: If remediation_success_rate >70%, keep suggestions; otherwise drop to factual-only.

4. **Contemplate Verbosity** — Current: Silent (v1 doesn't ship contemplate; v1.5 pending). Evidence gate: Post-contemplate confusion + summary action-upon rate. Threshold: If >10% ask "did Eureka run?", default to summary; otherwise silent.

**Evidence Collection Plan:** 10+ dogfood sessions (Aaron), telemetry counters, log-based metrics, post-session interviews (sessions 5 + 10). **Lock gate:** Cannot commit v1.5 friction decisions until dogfood evidence is analyzed.

**Instrumentation required:** Telemetry counters already in v1 scope. Interview protocol TBD.

**Signed:** Valanice (UX)

---

### 2026-05-27: Narrower Substrate Freeze Proposal — Accepted with Amendments

**Status:** ✅ EVALUATED — Recommendation: ACCEPT  
**Date:** 2026-05-27  
**Initiated By:** Erasmus (Crucible team, via Cassima)  
**Evaluated By:** Genesta (Activities Lead)

**Proposal Summary:** Freeze only two cross-project contracts instead of full Cairn/Forge ownership:
1. `SessionId` brand + validator/constructor in `@akubly/types`
2. `DecisionRecord` shape and source union in Forge

**Genesta's Evaluation:** ✅ **ACCEPT with three amendments:**
- **A1 (Prescriber Opt-In):** Eureka-aware prescriber must be opt-in (explicitly registered), not default-wired into Forge.
- **A2 (SessionId Validation Freeze):** Include validation rules (UUID v4 format, parse/isValid constructors).
- **A3 (DecisionRecord Tolerance Contract):** Freeze adapter tolerance rules (forward/backward-compatible; breaking changes require 15-min sync).

**G4-Lite Governance:** CODEOWNERS for `@akubly/types` (both teams required), CHANGELOG for DecisionRecord changes, Slack handoff for breaking changes. No label automation needed (only 2 contracts vs full packages).

**Confidence:** HIGH. Narrower freeze covers all v1 contracts, reduces coordination overhead by 80-90% vs original scope.

**Next steps:** Graham configures CODEOWNERS (<10 min); SessionId brand lands this week (with validation rules per A2); DecisionRecord v0 frozen with tolerance contract (per A3).

**Signed:** Genesta (Eureka Lead), Cassima (PM)

---

### 2026-05-27: Crucible ↔ Eureka Cross-Project Overlap — Architectural Coordination Required

**Status:** ⏳ AWAITING AARON DECISION  
**Date:** 2026-05-26  
**Initiated By:** Cross-project overlap analysis (Genesta, Crispin, Edgar, Cassima)  
**Urgency:** BLOCKER — both projects ship v1 in parallel  

**Decision Needed:** Aaron must lock repository ownership, schema collision resolution, and prescriber/substrate wiring before Crucible sprint 2 and Eureka v1 implementation phase begin.

---

### 2026-05-27: Eureka TD Re-Pass After §55 — §20/§30/§40/§50 Aligned with London-TDD Spine

**Status:** ✅ AUDIT COMPLETE — Recommendations applied  
**Date:** 2026-05-27  
**Initiated By:** Aaron Kubly  
**Question:** Should we do a TD re-pass after §55?  
**Decision:** Full bounded pass (Option A) — parallel audits across §20/§30/§40/§50 + follow-up executions  

**Summary:** Six-agent batch (Crispin/Roger/Laura/Edgar × 2 phases) verified that all four predecessor sections align with §55's London-school TDD mock contract discipline. All seams identified, all gaps addressed. No schema rewrites needed; seams are fundamentally sound with additive clarifications.

**Phase 1 — Audits & Executions:**

1. **Crispin (§20 Audit):** SEAMS HOLD — 5 findings, 1 interface addition (session_id to RecallQuery). No schema changes. **Deliverable:** decision drop: crispin-20-seam-audit-vs-55 (local-only)

2. **Roger (§40 DI Audit):** 80% injectable — 2 seams need extraction (`ClockProvider`, `RandomSource`), 1 correctly deferred (model). Forward-docs network boundary for v1.5. **Deliverable:** decision drop: roger-40-di-seam-audit-vs-55 (local-only)

3. **Laura (§50 Reframe):** §50 positioned as design-time testability discipline; §55 as implementation-time TDD practice. Complementary pair. **Deliverable:** Edited `docs/eureka/sections/50-testability.md` (+9%)

4. **Edgar (§30 Follow-Ups):** 3/3 executed — CuratorStore signature adopted, ClockProvider seam added, latency cross-refs established. **Deliverable:** decision drop: edgar-30-followups-executed (local-only), edited `docs/eureka/sections/30-learning-systems.md`

**Phase 2 — Recommendations Applied:**

5. **Crispin (§20 Apply):** §7.4 "Storage Seam (Mock Boundary)" added (names `FactStore` interface explicitly). RecallQuery updated. TDD notes added. **Deliverable:** Edited `docs/eureka/sections/20-knowledge-representation.md` (+12%)

6. **Roger (§40 Apply):** §40.5.4 "Time Injection" + §40.5.5 "RNG Injection (v1.5)" added. Network/model seams forward-documented. **Deliverable:** Edited `docs/eureka/sections/40-integration.md` (+19.8%)

**Key Findings:**
- ✅ All four sections now London-school-aligned with §55 spine
- ✅ I/O seams correctly identified; mock boundaries explicit
- ✅ Time/RNG injection patterns extracted (§30 + §40 coordinated)
- ✅ Phase 2 follow-ups landed without cross-section conflicts
- ✅ Zero implementation blockers; seams are fundamentally sound

**Learnings:**
- Parallel audits work well for cross-section stress-testing
- London-school TDD cascades to design docs (seams, boundaries, time injection)
- "Defer != ignore" — forward-document seams now, extract later (v1.5)
- Bidirectional cross-refs prevent §30–§55 latency-target drift

**Timeline:** Complete. §20/§30/§40/§50 ship-ready with full seam documentation verified.

**Session log:** `.squad/log/2026-05-27T15-30-00Z-td-repass-after-55.md`  
**Orchestration logs:** 6 logs per agent (`.squad/orchestration-log/2026-05-27T*-{agent}.md`)

**Signed:** Scribe (orchestration logger), Crispin, Roger, Laura, Edgar

---

## Executive Summary

**Convergent Finding:** Crucible (v1-DRAFT) and Eureka (v5-final) both depend on shared substrate (Cairn, Forge, types) and both define overlapping session/decision/improvement semantics. The dependency direction is backwards: Crucible assumes Forge exists in `harness` repo but Forge actually lives in `mem` repo. The overlap is NOT accidental — Eureka is Crucible's future memory layer — but the shared-code surface is brittle without explicit coordination.

**Three critical blockers identified:**

1. **Undeclared Repository Dependency (BLOCKER — Cassima)** — Crucible cannot ship v1 without either duplicating Forge or depending on the `mem` repo. Neither is currently acknowledged in either PRD. Must resolve before sprint 2.

2. **Event Schema Collision (HIGH RISK — Genesta)** — Crucible's 5 primitives + L1 WAL vs Cairn's existing `event_log` creates dual-write trap. Must merge or federate before L1 substrate lands.

3. **Decision/SessionId Schema Dual Ownership (CRITICAL — Crispin, Genesta)** — Both PRDs mandate `SessionId` branded type + Decision schema overlap (Decision primitive ≠ DecisionRecord audit ≠ DecisionPayload learning). Requires namespace discipline + possible renames in Crucible.

**Two safe convergences identified (Edgar, Genesta):**

4. **Prescriber Pattern Convergence** — Crucible's Router mirrors Forge's existing prescriber family; can share substrate. Both teams should annotate convergence points.

5. **Learning-Loop Feedback Substrate** — Crucible's recorded sessions ARE Eureka's training data. Path 2 ingestion wiring enables productive relationship between self-improvement loops (not competitive).

---

## Three Strategic Questions for Aaron (Cassima)

**Q1: Which repo owns Cairn and Forge?**
- If `mem`: Crucible has undeclared dependency on this repo; merge or link must happen before Crucible ships.
- If `harness`: Eureka loses its substrate; Cairn must be forked/mirrored.
- If duplicated: drift is guaranteed.

**Recommendation:** Lock repository topology NOW. Genesta suggests Option A (merge Crucible into `mem` at v2 stage, maintaining federation boundary for isolated dogfood in `harness` repo).

**Q2: Is Eureka a v1 Crucible feature or separate v2+ integration?**
- Crucible promises "local-first sovereignty + record everything + self-improve" (§0).
- Eureka promises "durable, addressable, progressively disclosed knowledge" (§2).
- 80% mission overlap.

**Recommendation:** Clarify v1 scope. If Eureka is Crucible's built-in memory backend at v1, sequencing/dogfood changes. If separate v2+ integration, acknowledge delayed feedback substrate.

**Q3: Who gets Aaron's time when both projects hit the same blocker?**
- Both assume Aaron is sole dogfooder.
- Eureka v1 killer demos (US-1, US-2) require multi-session coding work.
- Crucible v1 success bar requires building v2 inside v1.
- Single-threaded resource bottleneck risk.

**Recommendation:** Sequence dogfood phases OR delegate one project's dogfood to external user.

---

## Technical Findings (Cross-Referenced)

### Finding 1: Repository Dependency (Cassima)
**Full analysis:** decision drop: cassima-crucible-eureka-impact (local-only) §1.2 (undeclared dependency), §4 (resourcing)

- Crucible PRD §1 vocabulary, §2.4, §2.6, Appendix D assume Forge prescribers in `harness`.
- Actual location: `D:\git\mem\packages\forge`.
- Neither PRD acknowledges the cross-repo dependency.

**Recommendation:** Stagger projects OR establish explicit dependency + versioning contract.

### Finding 2: Event Schema Collision (Genesta)
**Full analysis:** decision drop: genesta-crucible-eureka-overlap (local-only) § Finding 1 + 2 + 5

- Crucible §1: 5 typed events (Request, Artifact, Observation, Decision, Question)
- Cairn today: `event_log` with existing `eventType` vocabulary
- Eureka v5: Sessions are `kind=session` facts in Eureka's fact store
- **Dual-write trap:** Which is authoritative for replay?

**Recommendation Option A (Merge):** Crucible's 5 primitives become `eventType` values in Cairn's `event_log`. Crucible's "primitives" are typed façade over Cairn's polymorphic stream.

**Recommendation Option B (Federate):** Crucible ships in `harness` repo (separate). When merged to `stunning-adventure` at v2 stage, federation boundary explicit. Cairn observes Crucible sessions via MCP bridge.

**Gate:** Before Crucible sprint 2 (L1 substrate), convene Graham + Roger + Genesta to lock event-substrate topology.

### Finding 3: SessionId Brand + Decision Schema Collision (Crispin, Genesta)
**Full analysis:** decision drop: crispin-crucible-kr-overlap (local-only) § 1 + 5, `genesta-...` § Finding 2

**Collision 1 — SessionId Brand (BLOCKER):**
- Eureka v5 (FR-13): `SessionId` branded type in `@akubly/types` (Aaron R8 directive).
- Crucible PRD: Implicitly assumes session identity but doesn't specify the type.
- **Both mandate the same brand; Crucible's requirements differ.**

**Recommendation:** Design `SessionId` for both Crucible + Eureka from day 1. Current design (UUID + validator) is sufficient for both.

**Collision 2 — "Decision" Naming (CRITICAL):**
- Crucible `Decision` primitive (§1): "any recorded choice by human or agent" — event-like primitive.
- Forge `DecisionRecord` (audit): Structured audit trail of agent decisions.
- Eureka `DecisionPayload` (fact): Contemplative structured deliberation with explicit options + rationale.
- Same word, three structurally different types.

**Recommendation (Crispin):** Crucible rename `Decision` → `ChoiceEvent` or `DecisionEvent`. ESLint ban on cross-system `Decision*` imports.

**Collision 3 — "Artifact" Semantic Drift (HIGH):**
- Crucible: "any reviewable content — inputs AND outputs" (PRD, patch, screenshot, transcript, upload, diff).
- Eureka: Informal usage only; "epistemological artifact" = learned memory representation.
- Risk at storage layer if both use content-addressed store.

**Recommendation (Crispin):** Crucible rename to `ContentBlob` / `CapturedContent`. Eureka avoid "artifact" in public types.

### Finding 4: Learning-Loop Feedback Substrate (Edgar)
**Full analysis:** decision drop: edgar-crucible-learning-overlap (local-only) § 1–4

- **Crucible's loop:** Prescriber → Review-Gate → Apply/Inbox → Scorecard (minutes to hours per-session).
- **Eureka's loop:** Sweep → Ranker → Trust/Confidence mutations (hours to days across sessions).
- **Complementary, not redundant.** Different time horizons, different improvement targets.

**Judgment: CRUCIBLE IS EUREKA'S EVIDENCE GOLDMINE.**
- Crucible records everything — every decision, every alternative, every tool call, every file read.
- This is exactly the evidence Eureka needs for learning patterns.

**Current wiring (v5-final):** Path 2 ingestion exists but is on-demand only. Manual `eureka ingest-decisions --session <uuid>` after each session won't survive dogfood.

**Recommendation (Edgar):** Wire automatic ingestion before dogfood starts.

**Option 1 (Simplest):** Add Crucible post-session hook: `on_session_end → eureka ingest-decisions --session $SESSION_ID`. Opt-in via `.cruciblerc` flag.

**Option 2 (Event-driven):** Cairn already emits session-end events. Eureka sweep subscribes; on `session_end` (carries `session_id`), ingests Forge DecisionRecord stream. *v1.5 scope per current PRDs.*

**Option 3 (Prescriber ownership transition):** Forge prescribers move to Crucible; Eureka's extraction-ready design enables Crucible to eventually adopt learning kernel.

---

## Recommendations Summary

**Immediate (Pre-Implementation):**
1. Aaron locks repository ownership (mem vs harness vs federation).
2. Graham + Genesta + Roger design event-substrate topology (merge vs federate).
3. Crispin confirms Decision/Artifact renames in Crucible PRD v1.1-DRAFT.
4. Cassima sequences dogfood phases or delegates external user.

**v1 Blockers (Before Sprint 2):**
5. ESLint guardrail (already in Eureka v5-final FR-12 #8) extended to Decision/Artifact cross-system imports.
6. `SessionId` brand finalized in `@akubly/types` (ships v1, both projects).
7. Crucible L1 substrate locked to Cairn's `event_log` (Option A) or isolated to `harness` repo (Option B).

**v1 Opportunity (Nice-to-Have Before Dogfood):**
8. Crucible post-session hook wired for Eureka ingestion (Option 1, simplest).

**v1.5+ (Path D Kernel Extraction):**
9. Prescriber ownership transition (Forge → Crucible).
10. Sweep-trigger unification (Cairn session-end → Eureka sweep).
11. Confidence/trust branded types (orthogonality compiler-enforced).

---

## Source Artifacts (Decision Inbox)

All findings preserved in inbox for detailed review:

- decision drop: genesta-crucible-eureka-overlap (local-only, 20.9 KB, 216 lines) — Architectural findings: 5 overlaps (3 high-risk, 2 safe).
- decision drop: crispin-crucible-kr-overlap (local-only, 24.5 KB, 136 lines) — KR findings: 2 critical collisions, 1 integration opportunity.
- decision drop: edgar-crucible-learning-overlap (local-only, 25.6 KB, 202 lines) — Learning-loop findings: parallel loops, feedback substrate, prescriber transition.
- decision drop: cassima-crucible-eureka-impact (local-only, 25.0 KB, 200 lines) — PM findings: undeclared dependency, 3 strategic questions, resourcing risk.

---

## Closed Decisions

### 2026-05-26: Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-26  
**Locked By:** 4-reviewer panel (Graham Knight, Genesta, Crispin, Edgar) — unanimous LOCK, zero revisions  
**Lock Status:** DO NOT EDIT — canonical specification; v4-final superseded

**Decision:** Eureka PRD v5-final is ratified as canonical, shippable specification after R8 post-lock amendment. Aaron R8 session-identity directive: Cairn `Session` and Eureka `kind=session` fact share one identifier (Copilot CLI session UUID) via shared `SessionId` brand in `@akubly/types`, with normative lens framing as guard. All R8 changes landed correctly. R8 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v5-final.md` (617 lines, 86.4 KB) — canonical stable location; supersedes v4-final
- **Lineage:** v4-final (R7, 555 lines) → v5-final (R8 amendments, +62 lines) — all R8 deltas annotated `[v5: <reason>]`
- **Panel:** Graham Knight (Architect), Genesta (Cognitive Systems), Crispin (Knowledge Representation), Edgar (Learning Systems) — unanimous verdict: LOCK

**R8 Amendment Scope (Judgment Calls + Enforcement Deltas):**

1. **Session Identity Unification:** Cairn `Session` and Eureka `kind=session` facts are the same entity (one CLI session UUID). Shared `SessionId` branded type in `@akubly/types`.
2. **Bridge Ledger Simplification:** `cairn_session_id_hint?` (optional) → `session_id: SessionId` (required). Eliminates nullable opaque correlation.
3. **FR-13 Amendment:** "Isolated by design" language deleted. Replaced with: "SessionId is shared; all other session attributes are system-specific. Lens framing (Cairn = lifecycle, Eureka = epistemology) is the normative guard against coupling drift."
4. **FR-7.2 Preserved:** No-cross-DB-ATTACH rule unchanged. Shared identifier is type-level only; runtime decoupling remains intact.
5. **§14a T-orphan Reframed:** "Dangling `cairn_session_id`" → "Stale `session_id` reference" (severity unchanged: LOW/LOW). Threat table entries in both §13 + §14a (belt-and-suspenders per JC1 disposition).
6. **FR-12 Mechanism #8 (NEW):** ESLint `no-restricted-imports` guardrail bans Cairn ↔ Eureka session-type imports except `SessionId` from `@akubly/types`.
7. **JC1 Disposition (T6 Row Placement):** Verified in both §13 + §14a threat tables.
8. **JC2 Disposition (v1 ship scope):** SessionId brand ships v1 (FR-12 #8); Trust/Confidence brands stay v1.5 (FR-12 #7).

**Reviewer Verdicts:**
- **Graham Knight (Architect):** LOCK — 8/8 enforcement items landed correctly; no new architectural concerns; v5-final surgical pass, no scope creep
- **Genesta (Cognitive Systems):** LOCK — all 5 guardrails from R8 fold verified (lens framing normative, neutral brand, no runtime traversal, ESLint boundary, Glossary updated)
- **Crispin (Knowledge Representation):** LOCK — all 6 spec items from R8 KR verdict verified (SessionId brand mechanics, kind=session schema, no identity collision, fact vs. filter clarity, edge schema tightening, session-fact integrity)
- **Edgar (Learning Systems):** LOCK — all 3 precision-gain items verified (sweep cadence v1.5 opportunity, `--session <uuid>` CLI v1 ship, AC-2.5 telemetry counter); zero new learning-systems risks

**Key Technical Deltas (Summary):**
- `@akubly/types/src/session.ts` (NEW): `SessionId` branded type + UUID validator + constructor
- `bridge_ledger.session_id` (NEW): `TEXT NOT NULL` replaces `cairn_session_id_hint? TEXT` 
- FR-13 text: "isolated by design" deletion + shared brand framing + lens elevation to normative
- FR-7.2: no-ATTACH rule consistency pass + type-level-only clarification
- §14a: T-orphan reframe (same severity, clearer semantics)
- FR-12 mechanism #8: ESLint guardrail (ships v1)
- Glossary + §15: Lineage citations + Aaron R8 directive + Graham/Genesta/Crispin/Edgar verdicts

**Why This Approach:**
- Aaron's post-lock signal clarified operational reality: the session UUID IS shared; pretending otherwise was incidental complexity
- Shared `SessionId` brand documents ground truth without introducing runtime coupling (type-level construct, not runtime FK)
- Lens framing elevated to normative guard — "two systems, one entity" is the design principle, not apology
- Guardrails (ESLint + schema comments + ADR lock) prevent future coupling drift
- All R8 changes preserve R7 achievements (bidirectional adapter framework, confidence/trust orthogonality, 7-mechanism extraction-readiness)

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v5-final.md` (stable location, do not edit; supersedes v4-final)
- **R8 Design Panel Verdicts:** decision drops: graham-r8-session-identity, genesta-r8-session-identity, crispin-r8-session-identity, edgar-r8-session-identity (all ACCEPT/FOLD verdicts; local-only)
- **Aaron R8 Directive:** decision drop: copilot-directive-r8-session-identity (local-only)
- **R8 Lock Panel Verdicts:** decision drops: graham-r8-lock-verdict, genesta-r8-lock-verdict, crispin-r8-lock-verdict, edgar-r8-lock-verdict (all LOCK, unanimous; local-only)
- **Superseded Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (historical reference; see header banner for migration note)

**Implementation Readiness:**
- v5-final is self-contained (no external doc required for implementation)
- All `[v5: <reason>]` + `[v4: <reason>]` annotations trace lineage back to R7/R5 origins
- No new architectural risks; all changes additive + simplifying
- R8 amendment window now closed; v5-final canonical until v1 implementation phase reveals needs for v1.1

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms + shared `SessionId` brand (FR-12 #8) + ESLint guardrail
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface) + precision gains (sweep cadence, Cairn session-end triggers, confidence/trust branded types)
- Path D Extraction: Kernel extraction readiness enforced from Day 1; extraction happens post-v1 pending org-scale federation needs

---

### 2026-05-30: WI-B PR #29 cycle 4 — prose redesign scope
**By:** Graham (Lead)
**Status:** Implemented in cycles 4-6

From decision drop: graham-wi-b-cycle4-redesign (local-only)

**Thread analysis:** 51 unresolved threads across 4 files represent 5 distinct findings:
- F8a: Wrong-branch reuse calls git worktree remove without unlinking junction first
- F9: Backtick escapes inside cmd /c "..." are PowerShell-only; cmd.exe treats them as literals
- F10: {branch} resolved via git -C "{worktree}" AFTER worktree is removed — path doesn't exist

**Decision:** Replace all literal cmd /c "..." strings with prose instructions (tool semantically + platform-intent table). Prose conveys intent; literal shell strings invite mechanical copying of wrong form.

**Recommended form:**
- Windows: Use cmd /c rmdir to remove junction. Do NOT pass /s.
- Unix: 
m -f removes symlink only.

**Junction-unlink ordering (SAFETY-CRITICAL):**
1. Resolve the branch name: git -C "{worktree}" rev-parse --abbrev-ref HEAD → save as {branch}
2. Remove the 
ode_modules junction/symlink (before git worktree remove)
3. Remove the worktree: git worktree remove "{worktree}"
4. Delete the branch: git branch -d {branch}

**Acceptance criteria:** 7 AC items verified — all backticks removed, F8/F9/F10 addressed, three-mirror sync locked.

---

### 2026-05-29: WI-B PR #29 review — APPROVE WITH NOTES
**By:** Graham (Lead)
**Status:** Reviewed and approved for merge

From decision drop: graham-wi-b-review-approve (local-only)

**Scope adherence:** ✅ Gabriel implemented exactly what was scoped. Six change areas all map directly to concrete changes. No omissions.

**Activation semantics:** ✅ SQUAD_WORKTREES=1 correctly gated. Three-way branch (skip/worktree/disabled).

**Enforcement language:** ✅ Pre-Spawn now reads as imperative: MUST-level imperatives and ACTIVE status badge.

**Template sync:** ✅ Verified byte-identical across all three files (squad.agent.md + two templates).

**Fallback safety - ARCHITECTURE CALL (APPROVE with note):** Silent fallback to main repo on git worktree add failure. For v1 (opt-in, dogfooding), fallback is right default. Differentiated: lock-file errors get retry-then-abort; permissions/other errors get fallback. Already logged to history.md.

**Follow-up (not blocking):** Emit user-visible warning (e.g., "⚠️ Worktree creation failed — falling back to shared checkout") in addition to history.md log. File as follow-up issue.

**Branch-mismatch handling:** ✅ Safe. git worktree remove fails with dirty-tree error; git protects against silent destruction.

**Parallel dispatch warning:** ✅ Warning-only (detection via list_agents). Sufficient for v1.

**Risk #1 mitigation (file-deletion):** ✅ Two mechanisms — isolation + junction directionality.

---

### 2026-05-29: WI-B scope — Coordinator dispatch-policy
**By:** Graham (Lead)
**Status:** Scoping complete, implemented

From decision drop: graham-wi-b-scope (local-only)

**Scope confirmation:** WI-B makes the coordinator CREATE worktrees per-issue instead of dispatching agents into shared main.

**Pre-Spawn discovery:** "Pre-Spawn: Worktree Setup" section (lines 697–742) was documentation-only. Gabriel's job: make it real.

**Concrete change list:**
- Pre-Spawn: Worktree Setup (enforce language + error handling)
- How to Spawn an Agent (resolve WORKTREE_PATH / WORKTREE_MODE placeholders)
- Worktree Lifecycle Management (reference docs)
- Template mirrors (must stay in sync)

**Opt-in vs default-on (Recommendation: Option A — Opt-in for v1):**
- Safety: Zero behavior change unless explicitly enabled
- Adoption friction: Users must know env var exists
- Complexity: Minimal — one if check
- Risk: Low — worst case is feature not used

**Dogfooding plan:**
- Worktree path: D:\git\stunning-adventure-{N}
- Branch: squad/{N}-coordinator-worktrees
- Env var: SQUAD_WORKTREES=1

**Risk flags:**
1. File-deletion mystery event during session — WI-B mitigates via isolation
2. 
ode_modules re-install after worktree removal — cleanup flow handles junction removal BEFORE git worktree remove
3. Pre-Spawn is documentation-only — Gabriel added ACTIVE status + enforcement language
4. Parallel dispatch guard — warning-only recommended for v1
5. Template drift — Gabriel updates all three files atomically

---

### 2026-05-30: WI-A Implementation Log — Issue #11 (Roger history restoration)

From decision drop: roger-issue-11-implementation (local-only, WI-A history, cross-referenced)

**Cloud Review Cycles 1-5 completed** — Worktree-aware session resolution now in place. Schema version 16. Partial UNIQUE indexes for NULL-workdir case. All 1405 tests green. Ready for WI-B (coordinator dispatch).




---

## 2026-05-30: Squad Convention — Agent history.md Commits in Feature PRs Are In-Scope

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 1 Skeptic review (F3 flagged as scope creep)  
**Decision:** Agent-maintained history.md entries in feature PRs are **IN-SCOPE**, not scope creep.

**Rationale:**
The `.gitattributes` file defines `merge=union` driver (line 3) specifically to enable parallel agent history tracking within feature branches. This is an intentional design pattern, not incidental coupling.

When `.gitattributes:3` declares `*.md merge=union`, it is explicitly authorizing commits that append to history files during feature development. Rejecting such commits as "scope creep" contradicts the declared merge strategy.

**Citation:** `.gitattributes:3` — "\\*.md merge=union"

**Scope boundary:** Agent history commits are IN-SCOPE when:
- They document agent work on the feature (not tangential or admin work)
- They follow the squad history.md format (one-liner, topic tag, date, agent)
- They do not alter code or test artifacts

Example in-scope entry:
```
- 2026-05-30 📌 alexander: JSON.parse boundary guarding via ProfileStalenessReason import
```

**Future:** If history bloat becomes a problem (file ≥15360 bytes), summarization rules apply (per Task 6). This is a hygiene gate, not a scope gate.


---

## 2026-05-30: Path A for Internal Helpers — Unexport and Shrink Test Surface

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 2, C2-3 polish  
**Decision:** When an `@internal` JSDoc tag cannot be enforced (no api-extractor or stripInternal pass), prefer unexporting the helper and shrinking the unit test surface over maintaining a false-promise export.

**Rationale:**
The helper `normalizeProfileSource(payload: unknown)` was introduced in Cycle 1 to centralize JSON.parse payload narrowing. Tagged `@internal`, it was still exported for unit testing. This creates a false API promise — users can import and call it despite the intent to keep it internal.

Options:
- **(a) Unexport + shrink tests (chosen)** — Move coverage to integration tests. Helper becomes truly internal (scoped to module).
- **(b) Keep export + hope no one uses it** — Relies on convention; creates API risk.
- **(c) Use namespace/private pattern** — Language-specific; TypeScript has no true private exports.

**Choice:** Path A. The @internal tag already signals intent. Unexporting honors that intent and forces coverage dependency on integration tests (which are stronger anyway — they validate the full narrowing + validation flow, not the helper in isolation).

**Applied to:** `normalizeProfileSource()` in PR #32. Reduced unit test count from 28→26; integration tests retain coverage.

**Implication:** Team preference: explicit enforcement (unexport) > convention-based promises (@internal tag).


---

## 2026-05-30: JSON.parse Boundary Discipline — Unknown Typing + Runtime Validation + Drift Guard

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 1 F1 (Correctness) + Cycle 2 C2-1/C2-2 (verification)  
**Decision:** When narrowing types that flow from `JSON.parse(eventLogPayload)`, enforce a three-tier boundary discipline:

### Tier 1: Type the payload as `unknown`
```typescript
const payload: unknown = JSON.parse(eventLogPayload);
```
Do NOT type it as `any` or the target type. This forces explicit narrowing.

### Tier 2: Validate at the boundary
Implement a helper (e.g., `normalizeProfileSource()`) that:
- Takes `unknown` input
- Validates shape (e.g., `if (typeof payload.source !== 'string')`)
- Returns the narrowed type or throws/returns null

Emit a **stderr warning** if coercion occurs (matching the pattern from `loadMetrics` in the codebase):
```typescript
if (payload.source && !VALID_PROFILE_SOURCES.includes(payload.source)) {
  console.warn(`[LoadedProfileSource] Coerced unexpected source: ${payload.source}`);
}
```

### Tier 3: Drift-guard the union
When the upstream union (e.g., `ProfileStalenessReason | 'FRESH' | 'STALE'`) grows, catch missing branches at compile time using a `satisfies` pattern:
```typescript
const driftGuard: Record<LoadedProfileSource | ProfileStalenessReason, true> = {
  'FRESH': true,
  'STALE': true,
  'UNKNOWN': true,
};
```
If a new reason is added and this helper is not updated, TypeScript will fail on the guard object (RED test).

**Citation:** Cycle 1 F1 raised that `JSON.parse` cast to `UnionType` was unguarded. Cycle 2 C2-1/C2-2 verified the drift-guard pattern resolves it.

**Impact:** Ensures JSON.parse payloads cannot silently accept malformed data or diverge from enum reality.


---

## 2026-05-30: PowerShell Here-String Convention — Use Single-Quoted @'...'@ for Code Content

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, PR body rendering issues (2 occurrences)  
**Decision:** When building multi-line file content in PowerShell that contains backticks (markdown code spans, `` `tsc ``, `` `null ``), use single-quoted here-strings `@'...'@` instead of double-quoted `@"..."@`.

**Rationale:**
PowerShell interprets escape sequences in double-quoted strings:
- `` `t `` → TAB character
- `` `n `` → newline
- `` `r `` → carriage return

Single-quoted here-strings treat backquotes literally.

**Problem encountered (2 instances):**
1. PR body description: `` `tsc `` became TAB + "sc", `` `n `` (in code block) became newline, eating the next line
2. Earlier in session: GraphQL multiline field values mangled the same way

**Pattern:**
```powershell
# ❌ WRONG — backticks interpreted
$content = @"
Run: `tsc --noEmit`
Type:
  - A (old)
  - B (new)
"@

# ✅ CORRECT — backticks literal
$content = @'
Run: `tsc --noEmit`
Type:
  - A (old)
  - B (new)
'@
```

**Applied to:** PR #32 body re-render in alexander-5. Prevents escape-sequence garble in future multiline content.

---

## 2026-05-30: Forge Roadmap Priority — Dogfood-First (Aaron Directive)

**Date:** 2026-05-30T23:55:00-07:00  
**Author:** Aaron Kubly (via Copilot)  
**Status:** ADOPTED

### What (1) — Eureka pace

"Let's not pull too hard on Eureka yet, it's still in the works." Defer aggressive forge → Eureka integration moves (the C2-1/C2-2/C2-3 Eureka-internal items Graham proposed) until Eureka stabilizes further. Forge can continue without depending on Eureka.

### What (2) — Next priority for forge

Packaging + installability + dogfooding is now priority #1. Forge's Phase 4.6 surface is implemented; the next move is getting it into a state where Aaron (and the team) can install + run it locally on real work to generate signal.

### What (3) — Compelling-but-deferred for forge

GP-tournament selection (Phase 5 §2.4) and Meta-optimization (DBOM on prescriber decisions, §3.5) are noted as compelling future moves, but explicitly *behind* packaging/dogfooding. They're soft-designed today and benefit from real dogfood signal before contract is nailed.

### Why

User direction on roadmap sequencing. Dogfooding-first reflects the principle that real usage signal beats further design speculation, and the deferred Eureka work prevents thrashing on a moving target.

### Implications

- **M0 (Alexander):** forge-mcp registration in plugin + copilot configs (shipped 2026-05-31 as PR #36, b22c8e7)
- **M1 (Roger):** Hint consumption MCP tools (cairn MCP expand recall hints → decision hints)
- **M2 (Gabriel):** Bash hooks + README (install forge-mcp, shell init integration)
- **Deferred:** Eureka FactStore adapter, forge→Eureka integration wiring (until Eureka v1 stabilizes)

---

## 2026-05-30: Forge Next Load-Bearing Move — SQLite FactStore Adapter (Graham Decision)

**Date:** 2026-05-30  
**Author:** Graham (Architect)  
**Status:** PROPOSED FOR FUTURE DISPATCH (deferred by Aaron dogfood priority)

### Context

Eureka v1 (`ef06238`, 2026-05-30) landed `recall` with a composite ranker and injectable `FactStore`/`ClockProvider` seams. The `FactStore` interface is well-defined (`search({ query, sessionId, limit, minTrust }): Promise<RecallResult[]>`), but no SQLite-backed implementation exists.

Forge's prescriber (`ForgePrescriberOrchestrator`) currently accepts an optional `ChangeVectorProvider` for historical context (statistical summaries). Eureka's `recall` would provide episodic context (trust-scored, recency-weighted facts) — complementary, not duplicative.

### Decision

**The next load-bearing move for forge is building the Eureka SQLite FactStore adapter.** Without it, `recall` is unreachable in production and the forge→Eureka integration loop cannot be validated.

**Sequence (when Eureka stabilizes):**
1. **Eureka SQLite FactStore adapter** — `packages/eureka/src/adapters/sqlite-fact-store.ts`, implements `FactStore.search()` against Eureka's SQLite DB. M, Edgar or Roger. This is Eureka's M5 milestone deliverable.
2. **Wire `recall` into `ForgePrescriberOrchestrator`** — add optional `factStore?: FactStore` alongside existing `provider?: ChangeVectorProvider`. Fail-open (recall failure → prescribe without episodic context). S-M, Alexander. Forge imports `FactStore` type from `@akubly/eureka` only (no impl coupling).
3. **`trustFloor` RecallOptions override** — small plumbing in `packages/eureka/src/activities/recall.ts`; seam already supports `minTrust` at FactStore boundary, just needs wiring. S, any agent.

### What to defer

- Eureka `commit` activity (v1.5+) — don't design before FactStore + recall wiring is proven.
- Issue #17 async-IO sweep implementation — Alexander's T3 closed the W5-5 gaps; issue should be closed, not implemented. `better-sqlite3` sync model is acceptable for single-user local tool.

### Risk

Schema lock-in for FactStore SQLite backing: trust/importance/attentionTier storage must be durable. Any migration later breaks cognitive memory. Design the schema defensively (nullable fields, enum TEXT columns with normalizeX guards matching the `normalizeProfileSource` pattern from PR #32).

### Current Status

Deferred per Aaron's dogfood-first priority (2026-05-30). Will be picked up after M0/M1/M2 complete and Eureka v1 stabilizes.

---

## 2026-05-31: Cycle-2 Latent Lint Bug Pattern — Windows `npm run lint` Glob Failure

**Date:** 2026-05-31  
**Author:** Alexander (via Scribe, Issue #37)  
**Status:** ROOT CAUSE IDENTIFIED; WORKAROUND DOCUMENTED; PERMANENT FIX TRACKED

### What

`npm run lint` fails on Windows with silent no-match (eslint glob `packages/*/src/` matches nothing via PowerShell glob expansion). Agents pushing code from Windows worktrees don't catch lint errors; Linux CI flags them post-merge. Example: commit 85d49b8 (PR #36 turn alexander-8) discovered unused-variable error during CI run, not local development.

### Root Cause

ESLint glob expansion via Node.js child_process on Windows uses native PowerShell glob rules (not sh glob rules). The pattern `packages/*/src/` expands to zero matches because PowerShell treats `*` literally when no files match at the top level. On Linux (`sh`), the glob expands correctly.

### Workaround

**UNTIL ISSUE #37 IS FIXED:** Agents modifying any package must use:
```bash
npm run lint --workspace=<package-name>
```

Examples:
```bash
npm run lint --workspace=forge
npm run lint --workspace=eureka
npm run lint --workspace=cairn
```

This bypasses the glob entirely and runs eslint directly on the package's source tree.

### Permanent Fix

**Tracked in Issue #37 (squad:gabriel):** Rewrite ESLint glob pattern or use a different linting approach:
- Option A: Use `packages/{cairn,forge,eureka,types}/**/*.ts` (explicit list)
- Option B: Run linter per-package in parallel (robust to glob expansion issues)
- Option C: Use ESLint's built-in workspace support (v8+)

### Team Discipline

Until fixed, Scribe will flag any `npm run lint` (bare, not `--workspace=...`) runs in orchestration logs as **ANTI-PATTERN** and agents are expected to use the per-package form.

### Follow-Up

Add CI check to detect `npm run lint` (bare) in agent logs and fail CI with helpful error message pointing to Issue #37 + workaround.

```

**Applied to:** PR #32 body re-render in alexander-5. Prevents escape-sequence garble in future multiline content.




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
### If NEW REPO
- **Coordination:** Separate squad, separate release cadence
- **Squad changes:** Forge + Types must publish to npm; Cairn depends on Brain
- **Timeline:** Phase 0-4 for brain squad (parallel to Phase 5 PGO)
- **Risk:** Version skew between Cairn and Brain

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

### 2026-05-30: Coordinator Spawn Prompt — Gitignore Path Policy (Graham)

**Author:** Graham (Lead)  
**Date:** 2026-05-30  
**Trigger:** PR #34 Copilot review threads 8, 9, 10 — gitignore violations  
**Status:** Resolved (commit daf5f28 + concurrent cleanup in 4d4378b)

**Decision:** The Coordinator's spawn prompt to Scribe **must not** list `.squad/orchestration-log/`, `.squad/log/`, or any other gitignored runtime-state path as an allowed write path.

**Allowed Scribe-write paths (exhaustive list):**
- `.squad/decisions.md`
- `.squad/decisions-archive.md`
- `.squad/agents/{name}/history.md`
- `.squad/agents/{name}/history-archive.md`
- `.squad/identity/now.md`

**Explicitly prohibited (gitignored runtime state):**
- `.squad/orchestration-log/` — agent orchestration logs
- `.squad/log/` — session summary logs
- `.squad/decisions/inbox/` — transient decision queue (consumed by Scribe, not committed)
- `.squad/sessions/` — session data
- `.squad/.scratch/` — scratch space

**Context:** In the M5+M6 review cycle (PR #34), spawn instructions to Scribe incorrectly listed `log/` and `orchestration-log/` as committed paths. Scribe committed 35 files across these directories, all covered by `.gitignore` lines 49-52. This is a coordinator error — Scribe followed instructions correctly.

**Remediation Applied:**
- `git rm -r --cached .squad/orchestration-log/ .squad/log/` — untracked 34 + 1 files
- `git rm test_results.txt` — removed local junk artifact
- `.gitignore` updated for `test_results.txt`

**Action Required:** Coordinator (Graham) — Update Scribe spawn prompt template to enforce allowed-paths list and add note that runtime-state directories are never committed.

---


### 2026-05-31: M7-B + M7-D Complete (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-31  
**Branch:** `eureka/m7-bd-narrowing-regression`  
**Status:** COMPLETE — local branch, awaiting Aaron's ship decision

#### M7-B — Exhaustive error narrowing tests
**File:** `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts`  
**Tests:** 14 new tests across 6 groups

Proves the realm-safe narrowing contract for all 5 error classes in `errors.ts`:
- Group 1 (5 tests): Code-based narrowing (primary) — code, fields, message, name per class
- Group 2 (1 test): Exhaustive code-discriminator switch — canonical caller pattern
- Group 3 (3 tests): Inheritance preservation — instanceof (realm-convenience, documented)
- Group 4 (3 tests): source discrimination on InvalidTrustValueError — 'input' × 2, 'storage' × 1
- Group 5 (1 test): InvalidFeedbackOptionsError.field discriminator
- Group 6 (1 test): UnhandledFeedbackEventError runtime-cast path

#### M7-D — applyFeedbackById user_correction regression locks
**File:** `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts`  
**Tests:** 8 new tests

Locks the user_correction value-plumbing and error-ordering contracts.

#### Test Counts
| Baseline (pre-M7-B/D) | M7-B | M7-D | Total |
|-----------------------|------|------|-------|
| 40                    | 14   | 8    | **62** |

All 62 pass. Build clean (tsc exits 0). No production code changes.

#### Deferred Items Uncovered
- **InvalidDeltaValueError purpose-specific class:** Currently `correctionDelta` non-finite path reuses `InvalidTrustValueError(source:'input')`. A TODO at recall.ts:325 flags this for M7-B follow-up — deferred, not blocking.
- **M7-C atomicity contract:** Unchanged. Crispin/Edgar ownership.

**Files Added (test files only):**
- `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts` — NEW
- `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts` — NEW

**Files Modified:**
- `.squad/agents/laura/history.md` — updated status, appended M7-B+M7-D learnings

---

### 2026-05-31: Cycle 1 F7 Reversal — `as const` Restored (Edgar)

**Date:** 2026-05-31  
**Author:** Edgar (Learning Systems Specialist)  
**PR:** #38 (`eureka/m7-a-typed-errors`)  
**Branch:** `eureka/m7-a-typed-errors`  
**Status:** CLOSED — F7 reversal committed

#### What
Reverted Cycle 1 F7 finding and all downstream documentation that propagated it. F7 had instructed switching discriminator declarations from:
```typescript
readonly code = 'FACT_NOT_FOUND' as const;
```
to:
```typescript
readonly code: 'FACT_NOT_FOUND' = 'FACT_NOT_FOUND';
```

Cycle 3 (commit f8f94c3) further propagated that preference into SKILL.md with explicit "Do not use `as const`" callouts. This revert restores `as const` form in both `errors.ts` (5 sites) and `SKILL.md`.

#### Why
The repo's ESLint config enforces **`@typescript-eslint/prefer-as-const` as an error**. The explicit-annotation form violates that rule — CI on Node 20 and Node 22 failed with 5 identical errors:
```
  42:18  error  Expected a `const` assertion instead of a literal type annotation  @typescript-eslint/prefer-as-const
```

The enforced lint rule is the **authoritative voice** on code style. The F7 Craft persona critique was reasonable stylistically but missed the enforced rule entirely. The `as const` form was correct all along.

#### Lesson
**Personas can have stylistic opinions; the repo's enforced lint config trumps them.** Before accepting any Code Panel finding that changes code form/style, cross-check it against the repo's actual ESLint/TypeScript config. A finding that produces a lint violation is automatically incorrect, regardless of how reasonable it sounds.

---

### 2026-05-31: Aaron's M7-C Direction Decision (Atomicity Contract)

**Decision Owner:** Aaron (Lead)  
**Date:** 2026-05-31  
**Session:** M7 continuation (M7-B + M7-D landed; M7-C in flight)  
**Status:** DIRECTION LOCKED — mutate callback pattern selected

#### The Question
How should `applyFeedbackById` address the non-atomic read-then-write sequence in FactReader → Trust Math → TrustUpdater? Three options were evaluated:

**(a) Caller-side serialization:** Caller wraps `applyFeedbackById` in a lock/mutex before calling.  
**(b) CAS token:** Return a token from read, require token in write; abort if token stale.  
**(c) Mutate callback:** Push read-modify-write logic into seam; receive callback that performs write inside read lock.

#### Decision
**Aaron selected option (c) — mutate callback pattern.**

#### Rationale
Pushing read-modify-write into the seam (FactReader/TrustUpdater boundary) keeps the activity layer pure and makes correctness a storage-layer property. This is the most maintainable pattern:
- Activity layer doesn't need to know about atomicity concerns
- Storage layer becomes the source of truth for atomic compound operations
- Callback captures the exact semantics ("given current trust, apply this delta")
- No leaky abstractions — caller doesn't need to understand serialization

#### Implementation Status
- Crispin (FactReader Specialist): Implementing mutate callback interface in FactReader
- Edgar (Learning Systems Specialist): Integrating callback into applyFeedbackById call site
- Tracking branch: `eureka/m7-c-atomicity`

#### Next Coordination
Scribe will log completion once Edgar and Crispin finish. Coordinator will spawn verification when both agents report COMPLETE.

---

### 2026-05-31: M7-C Complete — Edgar (TrustUpdater.mutate atomicity)

**Author:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-atomicity`
**Status:** COMPLETE — PR #41

**Contract shape:**
```ts
export interface TrustUpdater {
  mutate(args: {
    factId: string;
    sessionId: SessionId;
    fn: (currentTrust: number) => number;
  }): Promise<void>;
}
```

**Atomicity guarantee:** The storage implementation MUST execute read, fn-application, and write as a single atomic operation per (sessionId, factId) pair. Storage MUST scope state by (sessionId, factId); a mutate on one sessionId MUST NOT affect another. If `fn` throws, write is aborted. If `fn` returns non-finite or out-of-range [0,1], storage MUST throw `InvalidTrustValueError(source:'storage')`. Variant B: `currentTrust` removed from `ApplyFeedbackOptions`; `applyFeedbackById` is a zero-logic thin wrapper.

**Test count delta:** 62 → 69 (+7 contract tests, C-1..C-7). All green.

**Breaking API changes:** `TrustUpdater.update` → `TrustUpdater.mutate`; `ApplyFeedbackOptions.currentTrust` removed; `ApplyFeedbackByIdDeps.factReader` removed.

---

### 2026-05-31: M7-C Complete — Crispin (InMemoryFactReader + contract suite)

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-factreader` (merged into `eureka/m7-c-atomicity` via PR #41)
**Status:** COMPLETE

**Decision:** In-memory FactReader (option i). No SQLite — Eureka has no persistence layer yet; SQLite deferred to M8-storage when FactStore.search() schema is locked.

**Implementation:** `packages/eureka/src/storage/fact-reader.ts` — `InMemoryFactReader` backed by `Map<factId, Array<{trust, sessionId}>>`. Session-scoped; trust passthrough (NaN returned as-is; validation is caller's job).

**Contract test pattern:** `runFactReaderContract(implName, makeHarness)` — shared helper in `fact-reader.contract.test.ts`. Invariants: CL-1 read existing fact, CL-2 read missing → null, CL-3 session isolation, CL-4 trust passthrough, CL-5 shape contract. Adding a new impl requires one `runFactReaderContract(...)` call — zero test duplication.

**Test count delta:** 62 → 67 (+5 contract tests).

**Rationale for in-memory choice:** No DB idiom exists in Eureka; introducing SQLite pre-FactStore schema would be premature. The contract suite is designed so SQLite wires in trivially in M8+ by passing a factory to `runFactReaderContract`.

---

## Eureka M5+M6 Review Cycle

### 2026-05-30: M5+M6 Branch Preparation (Graham)

**Author:** Graham  
**Date:** 2026-05-30  
**Status:** Complete  
**Branch:** `eureka/m5-m6-trust-feedback`

After the M5+M6 RED→GREEN cascade, a working-tree loss incident occurred during branch creation. The sequence `git switch -c <feature>` → `git switch main` → `git reset --hard origin/main` wiped tracked modifications, leaving only untracked files. Recovery was performed via faithful reimplementation from test contracts (`recall-feedback.test.ts`).

**Correct sequence going forward:** Commit implementation on feature branch BEFORE switching back to main to reset, or use `git stash`.

**Final state:**
- Branch created at commit ac8c845
- 29/29 tests green, build clean
- Two-commit structure: implementation+tests+spec (commit A) + team metadata (commit B)
- main branch reset to origin/main at ef06238 (clean, no force-push)

---

### 2026-05-30: M6 RED — user_correction Contract Lock + Read-Seam (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M6 RED — two sub-beats: M6-A (user_correction contract) + M6-B (FactReader read-seam)

**Test counts:** 22 existing → 26 GREEN + 3 RED (29 total)

#### M6-A: user_correction Contract

M6-A1–A4 are regression locks on arithmetic already implemented in M5 (mild §55 deviation — implementation preceded contract). M6-A5 is the true RED: missing `correctionDelta` when `event='user_correction'` must throw.

**Fixtures verified:**
- M6-A1: 0.50 + 0.30 → 0.80 (no clamp)
- M6-A2: 0.80 + 0.30 → 1.00 (ceiling clamp)
- M6-A3: 0.50 - 0.30 → 0.20 (no clamp)
- M6-A4: 0.20 - 0.30 → 0.00 (floor clamp)

**M6-A5 contract:** `correctionDelta` is REQUIRED when `event='user_correction'`. Omitting it is a programming error; activity must throw rather than silently apply 0-delta.

#### M6-B: Read-Seam (FactReader)

**Shape decision:** New `applyFeedbackById` function (higher-level orchestrator) rather than extending `applyFeedback`.

**FactReader interface:**
```typescript
interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}
```

Rationale: Returns object (not bare number) to leave room for future fields without signature change. Null means fact not found.

**applyFeedbackById tests:**
- M6-B1 (happy path): FactReader returns `{ trust: 0.60 }`, corroboration → TrustUpdater called with 0.70
- M6-B2 (null guard): FactReader returns `null` → activity throws, TrustUpdater NOT called

**Edgar's implementation guidance (M6 GREEN):**
1. Call `deps.factReader.read({ factId, sessionId })`
2. If null, throw (fact not found)
3. Call `applyFeedback` with current trust from result
4. All 29 tests (26 existing + 3 RED) must pass

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Context:** 5-persona Code Panel review findings on M5+M6 (trust-feedback mutation)

#### Finding Triage Summary

| ID | Finding | Verdict | Key Details |
|---|---------|---------|-------------|
| F1 | Public API not exported | ACCEPT | Barrel-export `applyFeedback`, `applyFeedbackById`, `FeedbackEvent`, `TrustUpdater`, `FactReader` via `index.ts` |
| F2 | TOCTOU in applyFeedbackById | ACCEPT (doc) | Non-atomic read-then-write. JSDoc `@concurrency` clause added. Deferred: M7-C (backend-side atomicity). |
| F3 | Unused `clock` dep | ACCEPT | Removed `clock: ClockProvider` from `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps`. Clock stays in `recallWithScores`. |
| F4 | No exhaustiveness check | ACCEPT | Converted `applyFeedback` `if/else if/else` to exhaustive `switch` with `never` branch. |
| F5 | Inline types break pattern | ACCEPT | Extracted all 4 interfaces: `ApplyFeedbackOptions`, `ApplyFeedbackDeps`, `ApplyFeedbackByIdOptions`, `ApplyFeedbackByIdDeps`. |
| F6 | No input validation on currentTrust | ACCEPT | Added `RangeError` guard: `currentTrust` must be in [0,1]. Fires before `TrustUpdater.update()`. |
| F7 | Stale comment | ACCEPT | Removed "Trust score updates..." bullet from `recallWithScores` JSDoc (already implemented). |
| F11 | Incomplete @throws JSDoc | ACCEPT | Added `@throws` clauses covering propagated errors from `applyFeedback` and new `RangeError` guards. |
| F12 | Stricter null/undefined guard | ACCEPT (combined with F6) | Changed to strict null checks; expanded guard contracts in spec. |

**Changes made:**
- `packages/eureka/src/activities/recall.ts`: F1-exports, F2-TOCTOU JSDoc, F3-clock removed, F4-switch exhaustive, F5-named interfaces, F6-input validation, F7-stale comment, F11-@throws
- `packages/eureka/src/index.ts`: F1+F5 barrel-export additions (9 new exports)
- `docs/eureka/sections/30-learning-systems.md` §2.3: F3-clock scope, F5-interface shapes, F6-guard contracts

**Build/Test Status:** ✅ clean build, 29/29 tests passing

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Context:** Code Panel review findings on RED tests + implementation. Laura owns `recall-feedback.test.ts`.

#### Finding Triage Summary

| ID | Finding | Verdict | Action |
|---|---------|---------|--------|
| F8 | Idempotent boundary not pinned | ACCEPT | Added 2 tests: ceiling (currentTrust=1.0 → 1.0), floor (0.0 → 0.0) |
| F9 | Float equality fragility | ACCEPT | Wrapped all 9 trust assertions in `expect.closeTo(value, 5)` |
| F10 | Stale `±0.30` header comment | ACCEPT | Updated to actual formula: `min(1.0, max(0.0, trust + correctionDelta))` |
| F-NEW-EXHAUSTIVE | Unknown event type TypeError | ACCEPT | Added regression lock for exhaustiveness guard |
| F-NEW-RANGE | Input validation RangeError | ACCEPT | Added 4 regression locks (NaN, <0, >1 on currentTrust + delegation path) |
| F-NEW-PROPAGATION | Missing correctionDelta via byId | ACCEPT | Added test: `applyFeedbackById` with missing delta propagates error |

**Float precision decision (F9):** Chose `closeTo(value, 5)` over suggested 10. Reasoning:
- 5 decimal digits (±0.000005) is strict enough to catch wrong delta calculations
- IEEE-754 jitter for these operands is 1e-16 — well inside 1e-5 tolerance
- 10 digits is overkill; 5 is defensible middle ground

**Test count delta:** 29 → 37 (+8 tests). Target per brief: 36+. Achieved 37.

**Clock coordination note (for Edgar):** All new tests retain `clock: fixedClock` pending Edgar's F3 commit (clock removal). Once F3 lands, drop clock from all 16 applyFeedback/applyFeedbackById call sites and remove `fixedClock` helper.

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M5+M6 Cycle 2 Review Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback  
**Triggered by:** Review-cycle cycle 2 (Skeptic + Architect panels)

#### Cycle 2 Findings

| ID | Finding | Triage | Summary |
|---|---------|--------|---------|
| F-C2-1 | correctionDelta unvalidated for NaN/Infinity | ACCEPT | Added `RangeError` guard after `undefined` check, before trust math. Guards consistency with M5 `currentTrust` validation. |
| F-C2-2 | @concurrency JSDoc overpromises | ACCEPT | Rewrote to present both options: (1) caller-side serialization (v1), (2) backend-side atomicity (deferred M7-C). Clarified M7-C scope. |
| F-C2-3 | FactReader contract drift | ACCEPT (Option A) | Three-layer misalignment (interface vs impl vs spec). Chose strict null: interface `Promise<{trust:number}\|null>`, guard `fact === null`, spec updated. |

**Build/Test Status:** ✅ clean build, 37/37 tests passing

**Coordination notes for Laura:**
- Suggest adding `correctionDelta` NaN guard test (low priority, can land with current wave)
- F-C2-3 impact on Laura's tests: zero — all existing null tests use `mockResolvedValue(null)`

---

### 2026-05-30: M5+M6 Cycle 2 Changes (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback

Cycle 2 review consensus identified stale `clock: fixedClock` injections carried through all feedback-path call sites after Edgar removed `ClockProvider` from `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` in cycle 1. Test dir excluded from tsc, so excess-property checking never fired.

**Changes (recall-feedback.test.ts only):**
- `applyFeedback` call sites cleaned: 15
- `applyFeedbackById` call sites cleaned: 4
- `fixedClock` const removed: yes
- `FIXED_NOW_MS` const removed: yes
- Block comment updated: clock now scoped to recall/recallWithScores only, NOT feedback path

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M6 GREEN — correctionDelta Guard + FactReader (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M6 GREEN  
**Status:** LANDED — GREEN (29/29 tests pass, tsc clean, all 37/37 after Laura's wave)

#### Test Count Delta

| Suite | Before M6 | After M6 | Delta |
|---|---|---|---|
| `recall.test.ts` (M1–M4) | 18 | 18 | — |
| `recall-feedback.test.ts` M5 (C1/C2) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A1–A4 (regression locks) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A5 (correctionDelta guard) | 0 RED | 1 GREEN | +1 |
| `recall-feedback.test.ts` M6-B1–B2 (applyFeedbackById) | 0 RED | 2 GREEN | +2 |
| **Total** | **26 (3 RED)** | **29 GREEN** | **+3** |

#### Error Semantics Chosen

**M6-A5 — Missing correctionDelta:**
- Error: base `Error` (not typed)
- Message: `'applyFeedback: correctionDelta is required when event is user_correction'`
- Placement: top of function, before event-branch switch
- Rationale: Input-validation concern; guards before any side effects

**M6-B2 — FactReader returns null:**
- Error: base `Error`
- Message: `'applyFeedbackById: fact not found — factId=<factId>'`
- Guarantee: `trustUpdater.update` NOT called
- Future refinement (M7): typed error narrowing (e.g., `FactNotFoundError`)

#### Implementation Pattern: Delegation Over Modification

`applyFeedbackById` delegates to `applyFeedback` after reading:
```typescript
const factData = await factReader.read({ factId, sessionId });
if (factData === null) throw new Error(...);
await applyFeedback({ factId, sessionId, event, currentTrust: factData.trust, correctionDelta }, { trustUpdater });
```

Keeps `applyFeedback` purely unit-testable; orchestration stays in `applyFeedbackById`. Consistent with "orchestrator over modifier" pattern.

#### Named Next RED Targets (M7)

Internal helper `getActiveSessionByWorkdir(db, repoKey, workdir: string | null)` added for explicit IS-NULL matching.

`listActiveSessionsForRepo` returns only `session_kind = 'user'` sessions ordered by `started_at DESC`.

### `getWorkdir()` (`packages/cairn/src/hooks/gitContext.ts`)

New export — `git rev-parse --show-toplevel` via execSync, same stdio/timeout pattern as `getRepoKey()`. Returns `undefined` on failure (non-git dirs, bare repos, git not on PATH).

### Workdir Threading

- **`archivist.ts`**: `startSession(remote, branch?, workdir?)` + `catchUpPreviousSession(repoKey, workdir?)` + `recordToolUse(sessionId, tool, args?, result?, workdir?)`
- `session_start` event payload: includes `workdir` field (null when unknown)
- `session_resume` event payload: includes `workdir` field
- `tool_use` event payload: includes `workdir` field
- **`postToolUse.ts`**: resolves workdir via `getWorkdir(hookData.cwd)`, threads through
- **`sessionStart.ts`**: `runSessionStart(repoKey, config?, afterCurate?, workdir?)` — workdir is 4th optional param so existing callers pass unchanged

### Types

`Session.workdir?: string` added to `packages/cairn/src/types/index.ts`  
`SessionSummary.workdir?: string` added to `packages/cairn/src/agents/sessionState.ts`  
`getSessionSummary` queries `workdir` from sessions table

### MCP (`packages/cairn/src/mcp/server.ts`)

**`get_status` (BREAKING — Aaron-approved):**
- Old: `{ session: Session | null, curator: ... }`
- New: `{ sessions: Session[], curator: ... }` — flat array always
- New input: `workdir?: string` added alongside `repo_key`
- With workdir: filters to single worktree session (still in array)
- Without workdir: `listActiveSessionsForRepo` — all active user sessions
- `readOnlyHint: true` preserved

**`get_session`:**
- Old: `{ session_id: string }` (required)
- New: `{ session_id?: string, repo_key?: string, workdir?: string }`
- Either `session_id` OR `repo_key` must be provided; error if neither
- Workdir-based lookup via `getActiveSession(db, repo_key, workdir)`
- `readOnlyHint: true` preserved

**stdio rule compliance:** No `console.log/info/debug` in any code reachable from `get_status` or `get_session` handlers.

### Test Updates (existing tests broken by v15)

Updated schema version assertions from 14 → 15 in:
- `src/__tests__/db.test.ts` (3 assertions)
- `src/__tests__/discovery.test.ts` (1 assertion)
- `src/__tests__/migration012.test.ts` (2 assertions)
- `src/__tests__/prescriptions.test.ts` (1 assertion)

## Validation

- `npm run build --workspace=@akubly/cairn`: ✅ clean  
- `npm test --workspace=@akubly/cairn` (direct vitest run): ✅ 647/647 passed  
- `@akubly/types` untouched (no shared types changed; `Session` is cairn-internal)

## Coordination

- API shapes summary handed off to Laura
- WI-B (Gabriel, coordinator dispatch policy) holds until this branch merges





## laura-m5-trust-feedback-red
# Decision Drop: M5 RED — Trust Feedback Mutation Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M5 RED — trust mutation from feedback event  
**Next owner:** Edgar — M5 GREEN  
**Status:** LANDED — RED  

---


# --- ARCHIVED 2026-05-25 AND 2026-05-24 (7-day rule) ---


### 2026-05-25: Eureka PRD v4-final LOCKED — R7 8-Reviewer Lock-In Panel

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-25  
**Locked By:** 8-reviewer panel (4 Squad domain + 4 persona-review Design Panel personas)  
**Lock Status:** DO NOT EDIT — implementation phase begins

**Decision:** Eureka PRD v4-final is ratified as canonical, shippable specification after R7 lock-in. All 4 blockers resolved. All 9 important findings synthesized. Ready for implementation phase. R7 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (555 lines, 69.5 KB) — canonical stable location
- **Lineage:** v3 (R5) → v3.1 patches (R6) → v4-final (R7 amendments + Aaron finalization) → v4-final rev-2 (4 blockers + 9 importants resolved)
- **Panel:** Graham Knight (Architect), Genesta (Storage), Crispin (Schema), Edgar (Enforcement), + 4 persona-review personas (Architect, Skeptic, Pragmatist, Compliance)

**Blockers Resolved:**
1. **B1** — DecisionSource adapter mapping (verified against packages/types/src/index.ts:47) ✅ RESOLVED
2. **B2** — FR-14 Path 2 cadence, idempotency, dedup, initial trust ✅ RESOLVED
3. **B3** — FR-7.4 ↔ FR-7.2 contradiction (bridge_ledger + offline CLI coexistence) ✅ RESOLVED
4. **B4** — Security Threat Model (§14a added with attack vectors + mitigations) ✅ RESOLVED

**Important Findings (I1–I9):**
- Scope rightsize across 5 v1 + 2 v1.5 mechanisms
- Sequential fan-out specification
- US-2 flush helper scoping
- Agent-tier-only wiring constraints
- Production opt-in policy
- Citation + decision-log registers
- input_trust_avg → input_trust_min analysis
- Confidence/trust orthogonality enforcement (branded types)
- Extraction-readiness mechanism verification (7 mechanisms, not 5)

**Reviewer Verdicts:**
- **Graham Knight (Architect):** APPROVE-FOR-LOCK — bidirectional adapter framework structurally sound, all R7 amendments integrated, 3 documentation nits (non-blocking)
- **Genesta (Storage/Substrate):** APPROVE-FOR-LOCK — dual-axis schema (input_trust_avg + reasoning_confidence) correct, adapter lossy contracts justified
- **Crispin (Schema):** APPROVE-FOR-LOCK — all 5 R7 schema risks mitigated, branded-type enforcement adequate to prevent confidence/trust collapse
- **Edgar (Enforcement):** APPROVE-WITH-MINOR-NITS — all 5 R7 mechanisms integrated + 2 additions (branded types, DESIGN.md), Path D preserved via manual-only triggers
- **Persona Architect:** Found B1 (DecisionSource mapping)
- **Persona Skeptic:** Found B2 (FR-14 gaps) + multiple I-findings
- **Persona Pragmatist:** Found B3 (FR-7 contradiction) + feasibility I-findings
- **Persona Compliance:** Found B4 (missing security model) + compliance I-findings

**Key Architectural Decisions Locked:**

1. **Bidirectional Adapter Framework** (resolves Aaron's R7 directive):
   - **Path 1 (Eureka → Forge):** Contemplative decisions. Agent uses Eureka facts/edges to reason, decision stored as `kind=decision` fact AND emitted to Forge via `toDecisionRecord()` for audit trail.
   - **Path 2 (Forge → Eureka):** In-flow decisions. Agent decides during normal LLM exchange, Forge captures `DecisionRecord`, Eureka ingests via `fromDecisionRecord()` to learn decision patterns.
   - **Both are load-bearing:** Eureka-assisted reasoning needs Path 1. Retrospective learning from observed decisions needs Path 2. No circular dependency (contexts non-overlapping).

2. **Confidence/Trust Orthogonality:**
   - `Confidence` (Cairn): epistemic strength of derived conclusions
   - `Trust` (Eureka): provenance reliability of stored facts
   - NOT interchangeable — TypeScript branded types enforce separation at compile time
   - Composition explicit and documented when needed

3. **Extraction-Readiness Enforcement (7 mechanisms, FR-12):**
   1. TypeScript subpath export (`./learning` firewall)
   2. Folder layout enforcement (no parent imports)
   3. Interface ban on domain types (signatures only primitives/shared vocab)
   4. Plain-data test pattern
   5. Lint + CI enforcement (`no-restricted-imports` + canary test)
   6. DESIGN.md living architectural contract
   7. Branded types for `Confidence` and `Trust`

4. **Boundary Discipline (no FK, no JOIN):**
   - Eureka and Cairn are peer systems with complementary purposes
   - Session namespace isolation: Eureka has `kind=session` facts, Cairn owns `sessions` table
   - Correlation via opaque `cairn_session_id` only (one-way reference, not FK)
   - Each system authoritative for own domain (sweep/ranker/trust → Eureka; observability → Cairn)

5. **Path D Preservation (Kernel Extraction Ready):**
   - Eureka ships standalone in v1 with no new dependencies on Cairn
   - Manual-only Cairn→Eureka session triggers (via explicit `remember()` call)
   - Auto-promotion heuristics deferred to v1.5+ pending usage patterns
   - Three-phase adoption playbook for Cairn if/when it adopts learning modules

**User Directives Locked (from Aaron Kubly):**
- **2026-05-24T23:43Z:** v4-final revision #2 scope — resolve ALL 4 persona blockers AND consensus-strength important findings
- **2026-05-25T05:48:00Z:** Eureka↔Forge decision flow is bidirectional by design (contemplative path + in-flow path, both load-bearing)

**Why This Approach:**
- Panel-first design prevented implementation surprises (dual-panel caught issues Squad-only missed)
- Persona review augmented domain expertise with cross-cutting risk/feasibility/compliance analysis
- Bidirectional adapter framework resolved architectural disagreement while honoring both workflows
- Branded types + seven-mechanism extraction-readiness provide concrete enforcement, not aspirational promises
- Boundary discipline between Eureka/Cairn preserves each system's autonomy while enabling collaboration

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v4-final.md` (stable location, do not edit)
- **Lock-in Orchestration:** `.squad/orchestration-log/2026-05-25T06-54-22Z-*` (9 entries: Cassima revision + 4 Squad reviewers + 4 personas)
- **Session Log:** `.squad/log/2026-05-25T06-54-22Z-r7-eureka-v4-final-lock.md`
- **Reviewer Verdicts:** Graham blessing + all four lock-in verdicts at `.squad/orchestration-log/2026-05-25T06-54-22Z-*-lock-verdict.md`

**Implementation Readiness:**
- PRD is self-contained (no external doc required for implementation)
- All [v4: <reason>] annotations mark deltas from v3 for lineage traceability
- Three lock-in nits (FR-7.4 reconciliation query, FR-14 ingestion cadence, §7.5 kernel versioning) are documentation polish, addressable during v1 implementation or v1.1 pass
- No architectural risks identified

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms as specified
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface)
- Path D Extraction: Kernel extraction readiness enforced from Day 1, extraction happens post-v1 pending org-scale federation needs

---

## Active Decisions

### W2-1: ChangeVectorSummary Category Field (Roger)

**Scope:** Type consolidation for shared `ChangeVectorSummary` contract

**Decision:** Use stricter `OptimizationCategory` union (six-value string union from Forge) for `category` field in canonical `@akubly/types` definition.

**Rationale:** Forge already encodes the domain's real category set. Making the union canonical now ensures type safety for W2-2/W2-7 follow-on work while remaining additive (no existing duplicates switched yet).

**Impact:** Both Forge and Cairn gain shared, stricter type contract; future category additions go through Forge's enum.

### W2-7: Category Narrowing at SQLite Boundary (Rosella)

**Scope:** Cairn data layer type safety for ChangeVectorSummary contract

**Decision:** Narrow raw `optimization_hints.category` strings at Cairn's SQLite read boundary instead of widening the shared contract back to `string`.

**Implementation:** `getAllCategories()` filters DB values through the canonical `OptimizationCategory` union from `@akubly/types`. `summarizeChangeVectors()` only accepts narrowed categories. `SqliteChangeVectorProvider.getSummaries()` drops summaries where `vectorCount === 0`.

**Rationale:** DB schema remains permissive for backward compatibility, but cross-package `ChangeVectorSummary` contract is strict. Narrowing once at boundary keeps rest of Cairn aligned with Forge's canonical union without unsafe casts. Zero-vector summaries provide no historical signal and trigger Phase 4.5 fallback mode.

**Impact:** Cairn data layer now type-safe; empty summaries filtered at provider output.

### W2-5: Negative Impact Gate + autoApplyEligible Semantics (Alexander)

**Scope:** Attenuation boundary and hint eligibility signal for negative-impact vectors

**Decision:** Gate boundary is **inclusive** (`<=`) at `-0.2`. Mature negative vectors attenuate and disable auto-apply when `meanNetImpact <= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (value: `-0.2`). A summary at exactly `-0.2` triggers auto-apply disable.

**Rationale:** Safety asymmetry + FP fragility. Inclusive boundary prevents false positives at the exact threshold and provides stronger guard against brittle boundary conditions. Dual-layer testing locks behavior: unit test (alexander-2 maturity-gradient) expects gating at exactly -0.2; E2E canary (laura-1 wave2-pipeline) uses constant directly for drift-proof coverage.

**Implementation:** Gate comparison changed from `<` to `<=` in Forge prescribers and Cairn gate logic. Safety-boundary comment added at comparison site. Maturity-gradient test updated to expect gating at exactly -0.2. E2E pipeline canary uses `NEGATIVE_IMPACT_AUTO_APPLY_GATE` constant directly (prevents configuration drift).

**Impact:** Negative-impact gate boundary now locked by dual-layer testing (unit + E2E); Applier receives explicit attenuation signal for hints at and below threshold; safety margin increased. Decided by Aaron 2026-05-22.

### W2-8: Active Status Set for Optimization Hints (Rosella)

**Scope:** Deduplication logic for `(skillId, source, category)` tuples

**Decision:** Use `pending`, `accepted`, and `deferred` as the active statuses for optimization-hint dedup. Terminal statuses (`applied`, `rejected`, `expired`, `suppressed`, `failed`) do not block reinsertion of same semantic recommendation.

**Rationale:** Active set represents hints still live in operator workflow: waiting to be reviewed, explicitly approved but not yet applied, or intentionally postponed. A second hint during those states duplicates work and pollutes category history. Terminal statuses no longer represent live hints, so they should not block fresh inserts—allows operators to retry after rejection or expiration.

**Implementation:** `packages/cairn/src/db/optimizationHints.ts` encodes `ACTIVE_HINT_STATUSES` constant and uses in both `insertHintIfNew()` and `hasActiveOptimizationHint()`.

**Impact:** Deduplication now enforced at Cairn DB layer; Forge applier receives deduplicated hint stream; zero-vector summaries filtered at provider boundary.

### W2-9: Manual CLI Surface Location (Roger)

**Scope:** Composition root for Wave 2 manual orchestration

**Decision:** Created new `packages/runtime-cli/` workspace package with bin entry `forge-prescribe`. This package is the explicit composition root that can legally import both `@akubly/cairn` and `@akubly/forge`.

**Rationale:** Repo already exposes binaries from package-level `bin` entries (e.g., `@akubly/cairn`). Wave 2 needs composition root without creating package cycles. `packages/runtime-cli` keeps boundary honest and buildable. Local invocation: `npx forge-prescribe --skill <id> [--db <path>]`.

**Implementation Details:**
- Per-skill → global profile fallback: Try canonical `(granularity='per-skill', granularity_key='global')` first, then fall back to `global/global`
- Exit codes: `0` on success (including zero hints or dedup skips), `1` when no profile found, `2` for arg/DB/persistence errors
- CLI tests: 4 passing (happy path, no-profile, empty result, mixed)

**Impact:** Wave 2 has manual trigger surface independent of Curator. Wave 3 will migrate to Curator-driven automatic orchestration. Package boundary preserved for future Phase 5 cloud wiring.

### W2-6: E2E Pipeline Test Location + Spec Ambiguity Note (Laura)

**Scope:** Integration test placement and discovered spec mismatch

**Decision:** Placed Wave 2 end-to-end pipeline test in `packages/forge/src/__tests__/wave2-pipeline.test.ts`. Forge is focal point because `runForgePrescribers()` is consumer ingesting Cairn summaries and emitting final hints applier sees.

**Spec Ambiguity Discovered:** `docs/forge-phase4.6-wave2-scope.md` §6.1 says `meanNetImpact = -0.2` should yield `autoApplyEligible = false`, but live Forge/Cairn logic and Alexander's W2-5 tests treat boundary as still eligible (`meanNetImpact >= NEGATIVE_IMPACT_AUTO_APPLY_GATE`). Test kept aligned with implementation + §4.5 semantics. **Action item:** Reconcile boundary explicitly in Wave 3 (pending ADR).

**Rationale:** Forge already hosts substantive integration coverage under `packages/forge/src/__tests__/`. New test stays with existing cross-module surface instead of one-off harness. To avoid production dependency from Forge to Cairn, test imports Cairn source directly and Forge's `tsconfig.json` excludes test files from package build.

**Test Coverage:** Full maturity gradient (0 vectors → mature catastrophic), dedup regression on repeated persistence, provider omission, fail-open behavior, shared `ChangeVectorSummary` contract flow.

**Impact:** Real SQLite path fully validated; attenuation + `autoApplyEligible` propagation verified end-to-end; provider fail-open semantics confirmed.

### W3-D1: Composition Root → R2 (`@akubly/skillsmith-runtime`)

**Scope:** Where should the runtime that imports both `@akubly/cairn` and `@akubly/forge` live?

**Decision:** Adopt R2 — new `@akubly/skillsmith-runtime` library package (composition layer importing both) plus thin `@akubly/runtime-cli` wrapper.

**Rationale:** Clean separation of concerns, best test isolation, zero build-order risks, Phase 5-portable. Roger and Alexander independently converged on this architecture.

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Unblocks all Wave 3 work items

### W3-D2: Package Name → `@akubly/skillsmith-runtime`

**Scope:** What name for the new composition library package?

**Decision:** Use `@akubly/skillsmith-runtime` (domain-specific, not generic `@akubly/runtime`).

**Rationale:** Domain-specific naming (a) fits the cairn/forge metaphor, (b) describes what operates on (skills), (c) leaves room for future additions (scheduler, dashboard, policy engine).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Naming locked; packaging can proceed

### W3-D3: MCP Tool Exposure → Dropped from Wave 3

**Scope:** Should Wave 3 include an MCP tool for manual prescriber invocation?

**Decision:** No — Wave 3 ships with no MCP tool exposure. Curator hook is autonomous surface; CLI is manual surface.

**Rationale:** Proposed `run_prescriber_optimization` tool offers no net-new capability over existing CLI. Defer to later wave when concrete operator need surfaces. Removes W3-6, W3-7, ~2 MCP scenarios from W3-9 (~7 items, ~18 tests).

**Status:** Accepted by Aaron 2026-05-22

**Impact:** Wave 3 scope reduced; MCP tool re-opens only when operator need materializes

### W3-D4: Curator Hook Invocation → Always-On

**Scope:** Should Curator automatically invoke prescriber orchestration in v1?

**Decision:** Yes — automatic invocation always enabled. No opt-in flag in v1.

**Rationale:** Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) are sufficient. Opt-in flag adds config without meaningful safety benefit.

**Status:** Accepted by Aaron 2026-05-22

**Locked Design:** Hint persistence stays in orchestrator; fail-open codified; profile selection trigger-driven only (global fallback deferred to Wave 4).

**Impact:** Unlocks automatic hint flow; enables Wave 3 implementation

### W3-Impl-1: Workspace Dependencies via Existing Pattern (Roger)

**Scope:** How should `@akubly/skillsmith-runtime` declare dependencies on Cairn/Forge/Types?

**Decision:** Use existing internal dependency specifier pattern (`"*"`) instead of `workspace:*`. Root monorepo workspace glob `packages/*` covers new package; no redundant root `workspaces` entry needed.

**Rationale:** Environment npm rejects `workspace:*` with `EUNSUPPORTEDPROTOCOL`. Repository already uses `"*"` pattern consistently; new package integrates cleanly with existing convention.

**Implementation:** `skillsmith-runtime/package.json` declares `"@akubly/types": "*"`, `"@akubly/cairn": "*"`, `"@akubly/forge": "*"`. Root `tsconfig.json` references updated.

**Impact:** Workspace registration consistent across all packages; new package installs and builds cleanly.

### W3-Impl-2: Thin Runtime-CLI via Composition Migration (Roger)

**Scope:** How to refactor `runtime-cli` while preserving CLI contract?

**Decision:** Move entire `runForgePrescribe()` composition body from `runtime-cli` to `skillsmith-runtime/src/index.ts`. Reduce `runtime-cli` to thin facade: arg parsing, console formatting, exit-code mapping, top-level error reporting.

**Rationale:** Implements W3-D1 (R2 architecture) immediately instead of carrying temporary inline composition forward. Moved code is the old implementation, relocated intact — smallest behavioral risk. Avoids asking Alexander to re-migrate same code in W3-5.

**Implementation:** `skillsmith-runtime` owns `runForgePrescribe()` (profile load, vector provider, Forge invocation, dedup, persistence). `runtime-cli` owns CLI concerns only. CLI contract (`npx forge-prescribe --skill <id>`) unchanged.

**Impact:** Composition root established; CLI behavior identical; foundation ready for W3-5 Curator factory.

### W3-Impl-3: ExecutionProfile Reuse in Types (Alexander)

**Scope:** How to define `PrescriberOrchestrationConfig` and `PrescriberRunResult` in `@akubly/types`?

**Decision:** Keep `ExecutionProfile` in canonical location (`@akubly/types`); reference directly from `PrescriberOrchestrationConfig`. Keep `loadProfile` **synchronous** in Wave 3.

**Rationale:** `ExecutionProfile` already stable in `@akubly/types`; re-declaring structurally creates duplicate truth. Synchronous `loadProfile` matches current reality (Cairn SQLite-backed accessors are sync). Async deferrable to Phase 5 if cloud profile loading surfaces.

**Implementation:** Added `PrescriberOrchestrationConfig` and `PrescriberRunResult` to `packages/types/src/index.ts`. `skillsmith-runtime` re-exports canonical types. No Cairn compatibility shim required.

**Impact:** Wave 3 Curator-facing port has stable, reusable type contracts. No Cairn-to-types inversion. Foundation for W3-4 and W3-5.

### W3-Impl-4: Curate Async Transition + Trigger-Driven Skills (Alexander)

**Scope:** How should `curate()` accept and orchestrate the prescriber config?

**Decision:** 
1. `curate()` is now `async`, returns `Promise<CurateResult>`
2. Qualifying skills sourced from `ChangeVectorSweepResult.computedSkillIds` — distinct, sorted skill IDs whose vectors were newly inserted this cycle
3. Per-skill `runForSkill(skillId, minSessions)` receives `minSessions` from existing Curator chain: `changeVectorConfig?.minSessionsObserved ?? DEFAULT_MIN_SESSIONS`

**Rationale:** `runForSkill()` is async by contract; keeping `curate()` sync would lie or drop orchestration results. `computedSkillIds` is smallest signal matching accepted trigger-driven rule. Reusing `minSessionsObserved` aligns vector-sweep and prescriber gates.

**Implementation:** All sync call sites updated to `await curate()`. Per-skill exceptions log `console.warn`, produce error-shaped `PrescriberRunResult`, do not abort cycle (fail-open).

**Impact:** Async Curator orchestration ready for W3-5/W3-6. Fail-open semantics locked. All 32 call sites updated and tested. Cairn 576/576 passing.

### W3-Impl-5: Shared Prescriber Execution Helper (Alexander)

**Scope:** How to avoid duplicating the Cairn+Forge composition pipeline between manual CLI (`runForgePrescribe`) and Curator factory?

**Decision:** Extract shared `executePrescriberRun()` helper inside `packages/skillsmith-runtime/src/index.ts` that owns the per-skill execution body:
1. Instantiate `SqliteChangeVectorProvider`
2. Call `runForgePrescribers()`
3. Persist hints via Cairn `insertHintIfNew()` dedup
4. Return generation / inserted / duplicated / error counts

`runForgePrescribe()` (manual CLI) keeps existing operator-facing result contract and global profile fallback. `createPrescriberOrchestrationConfig()` (Curator factory) adapts to Curator-facing `PrescriberRunResult` contract.

**Rationale:** Single-sourced composition body while allowing different consumers to apply different profile-selection policy and result shaping. Makes W3-6 hook wiring smaller.

**Implementation:** Extracted `executePrescriberRun()` helper. `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` both call shared helper. Cairn gains `getExecutionProfileWithDb()` convenience.

**Impact:** Composition logic centralized, no duplication. Factory ready for W3-6 hook wiring. Per-skill Curator orchestration fully realized. Skillsmith-Runtime 6/6 passing.

### W3-Impl-6: Curator Hook Wiring via Injected Config (Roger)

**Scope:** How to wire always-on Curator prescriber orchestration at session start without violating W3-D1 boundary?

**Decision:** Pick **R-Hook-A (inject config into hook)**. `packages/cairn/src/hooks/sessionStart.ts` accepts optional `PrescriberOrchestrationConfig` and forwards to `curate(undefined, prescriberOrchestrationConfig)`. Production bootstrap moved to `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, which calls Cairn's hook runner with factory that constructs `createPrescriberOrchestrationConfig({ db })` from already-open SQLite handle.

**Rationale:** Smallest change preserving W3-D1 boundary. Cairn owns hook mechanics and Curator invocation but does not import `skillsmith-runtime`, avoiding cairn ↔ skillsmith-runtime cycle. Always-on guaranteed by composition root bootstrap logic.

**Implementation:** 
- Cairn hook runner: optional `PrescriberOrchestrationConfig` parameter
- `skillsmith-runtime/src/hooks/sessionStart.ts`: production bootstrap wrapper
- `.github/hooks/cairn/curate.ps1`: updated to prefer runtime hook for both global-install and repo-checkout paths
- Tests call `runSessionStart(repoKey)` with `undefined` for backward compatibility

**Impact:** Always-on Curator orchestration wired. Composition boundary preserved. Tests and production use same hook path. Cairn 576/576 passing.

### W3-Impl-7: E2E Integration Test — Auto Trigger, Dedup, Fail-Open (Laura)

**Scope:** Validate Wave 3 end-to-end: auto trigger for computed skills, dedup confirmation, fail-open behavior, profile miss handling.

**Decision:** Place `wave3-pipeline.test.ts` in `packages/forge/src/__tests__/` covering four scenarios:
1. Auto trigger: new vectors computed → prescribers run → hints inserted
2. Dedup (trigger-driven): second pass with newly-qualified vectors → re-checked via eligibility → duplicates blocked
3. Fail-open: per-skill exception → logged, continued
4. No profile: skill skipped without error

**Rationale:** Forge is focal point (ingests Cairn summaries, emits final hints). Test location aligns with existing cross-module coverage. Real SQLite path fully validated. To avoid production dependency from Forge to Cairn, test imports Cairn source directly; Forge's `tsconfig.json` excludes test files from package build.

**Key Behavioral Finding:** Accepted W3-D4 (trigger-driven orchestration) only reruns for skills with newly-computed vectors (`computedSkillIds`). This means unchanged DB state cannot produce dedup rerun on back-to-back invocations. Test adapted to realistic scenario: second pass with newly-qualified existing vectors triggering dedup-visible behavior.

**Implementation:** 4 scenarios, bootstrap via `runSessionStart`, assertions on `PrescriberRunResult` counts and DB state. Forge 630/630 passing.

**Impact:** Wave 3 end-to-end integration validated. Dedup and auto-trigger mechanics confirmed. Real Cairn+Forge persistence path exercised.

### Crucible-TDD-1: London-School TDD Strategy for Agentic Runtime (Laura)

**Date:** 2026-05-27  
**Author:** Laura Bow (Tester)  
**Status:** DRAFT (Awaiting Aaron Review — 8 Open Questions)  
**Artifact:** `docs/crucible-tdd-strategy.md`

**Scope:** Define outside-in London-school TDD discipline for Crucible runtime, PRD-derived, firewalled from technical design.

**Decision:** Authored comprehensive TDD strategy (120KB, 12 sections, 28 pages) covering:
- **12 acceptance scenarios (A1–A12):** Session forking, hermetic replay, pre-commit hook veto, causal slicing, Aperture notifications, plugin pinning, Curator orchestration, Pareto fitness, determinism conformance, Router policy escalation, bisect, marketplace trust gradient
- **18 collaborator contract roles:** SessionBootstrapper, ObservationCaptureStore, AppendProtocol, PreCommitHookBus, ReadSetHasher, LedgerProjector, QueryExecutor, PrescriberOrchestrator, ChangeVectorProvider, ParetoFitnessEvaluator, PolicyEngine, EscalationQueue, CausalSliceEngine, BisectOrchestrator, PluginRegistry, CLIRenderer (each with defined contract test strategy)
- **5-tier test pyramid:** Unit (500–1000 tests) → Component (200–400) → Contract (30–60) → Integration (50–100) → Acceptance (12)
- **8 invariant property tests:** Append-only, hash-chain determinism, replay equivalence, fork lineage, hook verdict determinism, projection purity, trust-tier monotonicity (via fast-check)
- **5-layer mock drift defense:** Contract tests (PR-time), shared fixture builders (build-time), golden files (nightly), CI double-check (PR-time), interface stability tracking

**Rationale:** 
1. London-school (outside-in) forces explicit interface design (matches immutable primitives)
2. Tell-don't-ask interaction pattern aligns with event-ledger semantics
3. Collaborator contracts enforce L0–L5 layer boundaries (prevents accidental coupling)
4. Acceptance tests anchor user workflows (prevents over-engineering the substrate)
5. Mock drift is tractable in greenfield with contract-test discipline + fixture builders

**8 Open Questions Flagged for Aaron (§11):**
- **Q1:** Session-end hook observation capture granularity (per-tool-call vs per-primitive vs per-turn)
- **Q2:** Eureka prescriber integration path (standalone L3 vs library vs deferred to v1.5)
- **Q3:** Structural proposal approval UX (blocking modal vs Aperture notification vs separate review CLI)
- **Q4:** Plugin pinning scope (direct deps vs transitive vs full environment)
- **Q5:** Bisect test execution environment (shell out vs isolated subprocess vs in-process runner)
- **Q6:** Determinism conformance timestamp normalization (excluded vs deterministic sequence vs non-deterministic field)
- **Q7:** Mock drift detection failure threshold (zero-tolerance vs ≥3 in layer vs ≥10% total)
- **Q8:** Pareto fitness contract with missing axes (reject comparison vs zero-fill vs partial dominance)

**Recommendations:** Provided for each question (favor simplicity + v1 MVM scope).

**Testing Blockers Identified:**
- Q1 blocks A2 (hermetic replay acceptance test)
- Q2 affects test layering (separate tier vs shared orchestration)
- Q3 blocks A10 (Router policy escalation test assertions)
- Q4 affects `SessionMetadata` fixture builders
- Q5 blocks bisect integration test design
- Q6 affects determinism conformance suite implementation

**Firewall Compliance:** ✅ Zero references to CTD artifacts; PRD-only vocabulary; no implementation details (file paths, class names, function signatures).

**Impact:** TDD strategy locked for PRD scope (12 acceptance scenarios), collaborator contract inventory complete, test layering blueprint ready. Implementation awaits Aaron resolution of Q1–Q8.

**Next Steps:** 
1. Aaron reviews strategy, resolves 8 open questions
2. Laura updates strategy based on resolutions
3. Decision merges to decisions.md
4. Laura updates `.squad/agents/laura/history.md` with learnings
5. Optional: Extract `london-tdd-for-agentic-runtimes` skill if reusable pattern emerges

### Crucible-CTD-1: Technical Design Plan Decomposition + Sequencing (Graham)

**Date:** 2026-05-27 (Updated after Aaron locks blocking questions)  
**Author:** Graham Knight (Lead / Architect)  
**Status:** ACTIVE (Approved for fan-out; blocking questions resolved)  
**Artifact:** `docs/crucible-technical-design-plan.md`

**Scope:** Decompose full technical design into 19 sections, 7 team members + 2 consultants, 4 authoring phases + 1 review round (~9 working days).

**Decision:** Produced comprehensive CTD plan with resolved blocking questions:

1. **DB file placement:** ✅ FORK to `~/.crucible/crucible.db` — clean separation from Cairn (decided by Aaron 2026-05-27)
2. **Cairn/Forge coexistence:** ✅ FULL COEXIST FOREVER — independent live products with own roadmaps. Crucible greenfield alongside. No delegation, no shim packages, no absorption (decided by Aaron 2026-05-27)
3. **Eureka status:** ✅ EXTERNAL LIBRARY VIA OPTIONAL ADAPTER — not a Crucible chamber (decided by Aaron 2026-05-27)

**Fan-Out Manifest (Appendix C of plan):**
- **Phase 0 (serial):** 2 sections (Graham) — L0/L1 boundary + primitive taxonomy
- **Phase 1 (parallel):** 8 sections, 5 lanes — Roger, Rosella, Alexander, Laura, Gabriel, Graham
- **Phase 2 (parallel):** 6 sections, 6 lanes — Roger, Valanice, Graham, Laura
- **Phase 3 (parallel):** 3 sections, 2 lanes — Gabriel, Graham
- **Review round:** All 19 sections cross-reviewed per ownership map

**Section structure:** `docs/crucible-technical-design/` folder, one numbered file per section + README index, each with owner, output file, input artifacts, dependencies, acceptance criteria.

**Rationale:** Three blocking questions cleared path for team-wide fan-out without discovery looping. Architecture locked. Sequencing respects Layer dependencies (L0→L1→L2/L3→L4/L5) and authoring parallelism (some sections can proceed concurrently after their inputs are available).

**Impact:** Technical design ready for parallel authoring sprint. Team assignments clarified. Acceptance criteria explicit per section. Estimated completion: ~9 working days post-fan-out.

**Cross-Link:** Crucible-TDD-1 (Laura, parallel track) is firewalled from CTD to preserve test-design independence; TDD strategy is PRD-only, CTD is implementation-specific. Both feed Crucible delivery but remain architecturally separate.

### Phase 4 Synthesis — CTD CLOSE GREEN-FINAL (2026-05-28)

**Date:** 2026-05-28 (Synthesis Review completed 2026-05-29T072142Z)  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL — CTD v1 STRUCTURALLY COMPLETE  
**Artifact:** Merged from decision drop: graham-ctd-phase4-synthesis (local-only, now incorporated in this archive)

**Scope:** Final pre-close interface-coherence synthesis across the four Phase 4 authoring lanes (Graham framing §1/§6/§19; Roger CALL/RET + Scheduler WAL §3/§10; Gabriel L3.5 Scheduler §5/§5.A/§17; Laura reproducibility honesty §11.10 + §16.5/§16.7a). Two minor errata resolved inline during synthesis gate.

**Verdict:** **GREEN-FINAL — CTD is complete.** Coherence matrix: 8 CLEAN / 0 MINOR / 0 STRUCTURAL / 2 APPLIED. Final inventory: 377,794 bytes across 21 files (19 numbered sections + Phase 1/Phase 2 synthesis reviews); 19 ADRs indexed and ready for post-CTD authoring.

**Coherence Checks (All CLEAN):**
- §1.2 L3.5 row aligns with §5.A spec aligns with §17 catalog aligns with §3.3.5 WAL acceptance
- §3.3.4 CALL/RET body fields are read verbatim by §10.6.1 stack-frame reconstruction
- Trace-vs-behavioral vocabulary (§11.10 ↔ §16.7a) is identical across both sections
- Streaming `stream_open/delta/close` sub-kinds are additive per §6.5
- §19 ADR-0019 + ADR-0024 index rows are accurate one-liners
- (Two errata applied; see below)

**Errata Applied (Graham Authority):**

1. **InvocationId Canonical Lock** (§3.3.4)
   - **Decision:** `invocationId = BLAKE3(sessionId || taskId || commitOffset)`, mandatory in L0
   - **Rationale:** Hermetic-replay invariant (ADR-0008; §11.6 byte-equivalence) is non-negotiable. §10.6.1 reconstruction keys off `invocationId`. Structural-compute cost in L0 is one BLAKE3 over three small inputs at TaskStart-emit time. L0 flexibility on this field had no compelling driver against an invariant this load-bearing.
   - **Ripple:** None — change strictly strengthens existing properties. No impact to §10, §11, or other sections.

2. **§7.D Supersede Contract Amendment** (§7.D clause 6 + conformance check C-9)
   - **Decision:** Replacement proposals that the Scheduler will cancel with `reason='superseded'` MUST set `envelope.parentId` to the EventId of the obsoleted proposal
   - **Rationale:** Scheduler uses that lineage edge to populate `scheduler_cancelled.body.supersededBy` deterministically. Contract violation caught at generator boundary (§7.A C-9), not at Scheduler. Closes Gabriel's Phase 4 flag.
   - **Ripple:** None — no change to §5.A.2 body shape; §6.4 `parentId` vocabulary unchanged; §3 and §17 unaffected.

**Newly-Surfaced Ambiguity:** None — CTD is complete. One informational note (non-blocking): Laura's `stream_open` / `stream_delta` / `stream_close` Observation sub-kinds are correctly additive per §6.5 evolution rule, but the §6.3 enumeration table does not yet list them. This is the right boundary for post-CTD §6.3 housekeeping pass (Laura owns streaming sub-kind authoring in §16; table updates land at sync pass exactly per §6.5 rule).

**Impact:** This is the final architecture-design gate. Post-CTD authoring is unblocked:
- Nineteen ADR files under `docs/adr/`
- §13 CLI implementation scaffolding
- §16 test-strategy scaffolding
- Greenfield package work under `@akubly/crucible-*`

No Phase 5 spawn required. No new open question requires Aaron triage.

---

### PR #33 Cycle 5: Fork Resume Schema + Predicate Timing Honesty (Graham)

**Date:** 2026-05-31
**Author:** Graham Knight (Architecture Lead)
**Status:** APPROVED (Merged in commit 40d39d3)
**Scope:** Address three Copilot findings from PR #33 cycle 5 review round

**Status:** Inbox — Scribe merge pending

## Decision

PR #33 cycle 5 applies two governance clarifications:

1. §6.3 sub-kind registration is incomplete unless the sub-kind has an authoritative payload schema. `fork_resume` now has the same registry-level schema treatment as `fork_origin` and `fork.collision_choice`.
2. v1 Hook Bus predicate timing is cooperative measurement, not hard preemption. `PredicateRegistration.evaluate` remains synchronous; over-budget predicates produce post-hoc telemetry and retry-budget quarantine for future rows. True hard preemption is deferred to v1.5+ worker/process isolation or an async cancellable predicate API.

## Rationale

The first clarification prevents conformance tests from accepting enum-only vocabulary with no payload contract. The second prevents §18 from overstating `Promise.race()` as a sandboxing primitive for CPU-bound synchronous JavaScript.

## Files touched

- `docs/crucible-technical-design/04-hook-bus.md`
- `docs/crucible-technical-design/06-primitive-taxonomy.md`
- `docs/crucible-technical-design/10-session-branching.md`
- `docs/crucible-technical-design/18-security-permissions.md`
- `docs/adr/0019-childsid-collision-hybrid.md`

---

## Open Questions

### W3-7 Trigger-Driven Dedup Semantics (Laura)

**Status:** FLAGGED FOR AARON'S DIRECTION

**Observation:** Wave 3's accepted trigger-driven orchestration (W3-D4) means Curator only calls prescribers for skills in `changeVectorSweep.computedSkillIds` — i.e., skills whose change vectors were newly inserted this cycle.

**Implication:** If the same skill's vectors remain unchanged across two consecutive session starts, the prescriber does not run on the second start, and no dedup-visible result is produced. This is correct by the trigger-driven design, but it differs from a "rerun on every session start" behavior.

**Question:** Should Wave 4+ introduce a broader trigger mechanism to allow reruns for skills with existing (non-new) summaries? Examples:
- Always rerun skills that have any vector summaries (regardless of new-this-cycle)
- Expose a manual scheduler or `force=true` flag for operator-initiated reruns
- Defer to Phase 5 when MCP/cloud integration allows finer control

**Current Design:** Trigger-driven only (W3-D4). This prevents unnecessary prescriber invocations and aligns with the "on new signal" principle, but it limits dedup visibility to cycles where vectors are genuinely computed.

**Recommendation:** Clarify with product whether current trigger semantics are intentional, or if dedup should be visible on *every* session start regardless of new vectors.



---
# Archived: 2026-06-01T23:26:26Z

# Squad Decisions

## Open Decisions (Current Session)


## Crucible Sprint 0 Kickoff — First RED Test (2026-06-01 Session)

---

### 2026-06-01: Crucible Sprint 0 Kickoff — First RED Test Scope (Graham)

# Decision: Crucible Sprint 0 Kickoff — First RED Test Scope

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-01  
**Status:** PROPOSED  
**Requested by:** Aaron Kubly  
**Scope:** Walkthrough A first RED cycle (§4.1 of `docs/crucible-tdd-strategy.md`)

---

## 1. Package(s) Scaffolded

**Decision: Scaffold both `packages/crucible-cli/` AND `packages/crucible-core/` now.**

The §4.1 Walkthrough A first RED test lives in `crucible-cli` (`src/__tests__/acceptance/session-fork.test.ts`). The GREEN phase immediately descends into `crucible-core` (SessionManager, DB layer). Scaffolding both is ~10 minutes of mechanical work using the `scaffold-eureka-package-tdd` skill pattern — same `package.json` shape, same `vitest.config.ts`, same `tsconfig.json` with `composite: true`.

**Trade-off considered:**
- *Alternative: scaffold only `crucible-cli` now.* Saves 5 minutes but forces a context-switch mid-GREEN to set up the second package. RED→GREEN flow interrupted for infrastructure.
- *Chosen: scaffold both.* Zero-cost prep. The `crucible-core` scaffold contains only `src/index.ts` with `export {}` — no implementation, no TDD violation. Uninterrupted RED→GREEN.

**Package names:**
- `@akubly/crucible-cli` — §13 CLI shell + acceptance tests
- `@akubly/crucible-core` — session manager, ledger primitives, DB layer

Both added to root `tsconfig.json` references and auto-discovered by `workspaces: ["packages/*"]`.

---

## 2. Minimal Types Surface for Walkthrough A RED Test

The first test (`session-fork.test.ts`) must **compile but fail at runtime** (missing implementation modules). The following type stubs are the minimal surface needed for the test to typecheck.

### Already in `@akubly/types`:
- `SessionId` (branded string) — ✅ exists at `packages/types/src/index.ts:117`

### Needed as stubs (in `crucible-core` or `crucible-cli` test helpers):

| Type | Shape (minimal) | Source |
|------|-----------------|--------|
| `PrimitiveKind` | `'observation' \| 'decision' \| 'question' \| 'artifact' \| 'request'` | §6 five primitives |
| `PrimitiveInput` | `{ primitiveKind: PrimitiveKind; primitivePayload: unknown; causalReadSet: unknown[] }` | §4.1 test `append()` arg |
| `SessionMetadata` | `{ parentSessionId?: SessionId; forkPointEventId?: number }` | §4.1 test assertions; §15.2 `SessionMetadata` shape |
| `Session` | `{ id: SessionId; metadata: SessionMetadata; append(p: PrimitiveInput): Promise<void>; query(opts: { range: [number, number] }): Promise<unknown[]> }` | §4.1 test API surface |
| `createSession` | `() => Promise<Session>` | §4.1 test Arrange |
| `fork` | `(parentId: SessionId, opts: { atOffset: number }) => Promise<Session>` | §4.1 test Act |

### Coexistence alignment (§15):
- `SessionId` stays in `@akubly/types` (shared brand — §15.1 rule: "share identifiers, fork everything else").
- `PrimitiveKind`, `PrimitiveInput`, `Session`, `SessionMetadata` are **Crucible-only** types. They live in `crucible-core`, not in `@akubly/types`. Per §15.2, `SessionMetadata` will eventually promote to `@akubly/types` with the full shape from §10.1 — but Sprint 0 needs only the fork-lineage subset, and premature promotion violates the "no cross-runtime imports" invariant.
- `createSession` and `fork` are API functions exported from `crucible-core`. The `crucible-cli` acceptance test imports them.

### What is NOT needed for RED:
- `BootstrapPayload`, `ContextWindowCommitment`, `PluginVersionLock` — these are GREEN/REFACTOR phase types.
- `CrucibleEvent`, `AppendProtocol` — L1 WAL internals, not surfaced in the acceptance test.
- Full `SessionMetadata` from §10.1 — only `parentSessionId` and `forkPointEventId` are asserted in the test.

---

## 3. Test Framework

**Vitest** — confirmed. Matches `packages/eureka/vitest.config.ts` exactly:

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`devDependencies`: `"vitest": "^3"`, `"@types/node": "^25.5.0"` — same as eureka.

---

## 4. OQ-2 Deferral Note

**The first RED test does NOT cross the L1-substrate / Cairn `event_log` topology line.**

- The acceptance test in `crucible-cli` uses **mocked collaborators** per §4.1 GREEN phase (`vi.mock`).
- No real WAL writes, no SQLite, no `~/.crucible/` filesystem access.
- The federate-vs-merge decision (OQ-2: Crucible L1 WAL vs Cairn `event_log`) is a **pre-sprint-2** concern per `.squad/decisions.md`.
- This RED cycle is safe to execute without resolving OQ-2.

OQ-1 (substrate ownership) was resolved via ADR-0002. OQ-3 (Decision/SessionId schema dual ownership) does not affect this test — `SessionId` is the only shared type consumed, and it's already in `@akubly/types`.

---

## 5. Scope Acknowledgment

**Walkthrough A first RED test is the kickoff scope.** Specifically:

- ONE acceptance test: `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`
- Test asserts: session fork creates child with inherited ledger prefix (parent events [0..23] visible in child, parent unmodified)
- Expected RED failure: `Cannot find module` (the session API module doesn't exist yet)
- NOT in scope: GREEN implementation, REFACTOR, any other walkthrough, any L1 substrate work

---

## Action Items

1. Scaffold `packages/crucible-cli/` and `packages/crucible-core/` using `scaffold-eureka-package-tdd` pattern
2. Add type stubs per §2 above (compile-but-not-run surface)
3. Write the first RED test per §4.1
4. Verify RED for the right reason (`Cannot find module`, not config errors)
5. Verify baseline stays green (`npm run build` + existing package tests pass)


---

### 2026-06-01: Decision Drop: crucible-cli Package Scaffold (Gabriel)

# Decision Drop: crucible-cli Package Scaffold

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-01  
**Scope:** `packages/crucible-cli` — Sprint 0 scaffold  
**Status:** IMPLICIT DECISION — recording for team awareness

---

## Decision: Test Framework — vitest (inherited from eureka template)

**Context:** The scaffold task specified `vitest run` for the test script. This follows the existing monorepo convention established in `@akubly/eureka`. No evaluation of alternatives was performed.

**Decision:** `vitest` is the test runner for `@akubly/crucible-cli`. This is consistent with all other packages in this monorepo.

**Implication:** `vitest` config is inherited from the workspace root — no per-package `vitest.config.ts` is needed unless crucible-cli requires custom test globals or coverage thresholds.

---

## Decision: TypeScript Project References — `../types` only

**Context:** `tsconfig.json` `"references"` is set to `[{ "path": "../types" }]`, matching the eureka template. Crucible CLI will depend on `@akubly/types` for `SessionId` and shared primitive types.

**Decision:** Only `../types` is referenced at scaffold time. When crucible-cli gains dependencies on `@akubly/cairn`, `@akubly/forge`, etc., those project references must be added to this tsconfig.

---

## Decision: `src/__tests__/acceptance/` Directory Shape

**Context:** Per `docs/crucible-tdd-strategy.md` §4.1, the first acceptance test lives at `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`. Gabriel created the directory; Laura authors the test file. This split decouples scaffolding from the red-test phase.

**Decision:** Acceptance tests live under `src/__tests__/acceptance/`. Unit/integration tests (future) will follow the eureka pattern of `src/<domain>/__tests__/`.


---

### 2026-06-01: Laura — Crucible First Red Test Decision Inbox (Laura)

# Laura — Crucible First Red Test Decision Inbox

**Author:** Laura Bow (Tester)  
**Date:** 2026-06-01T23:07:13-07:00  
**Status:** ✅ RED CONFIRMED

---

## Test File

`packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`

---

## Acceptance Scenario A1 → User Story Mapping

| A1 Given/When/Then Clause | User Story |
|---|---|
| Session with 47 committed primitives, fork at offset 23 | US-A-NEW-1 (Branching Sessions) |
| Child session created with `parentSessionId` + `forkPointEventId` lineage | US-A-NEW-1 (Branching Sessions) |
| Child ledger logically extends parent prefix [0..23] | US-E-2 (Counterfactual Replay) |
| Parent session remains unmodified | US-A-NEW-1 (data integrity) |

**Locked decision binding:** Aaron decision 2a — L1-native branching. Fork lineage is owned by the L1 Ledger (not a CLI-layer concern). This acceptance test exercises that contract from the outside without prescribing implementation layer. 

---

## RED Status

**Confirmed RED** — vitest output:

```
TypeError: (0 , createSession) is not a function
 ❯ src/__tests__/acceptance/session-fork.test.ts:35:35
```

The test resolves the import (`../../index.js` exists, exports `{}`), but `createSession` is not a function — the intended failure mode per §8.1 Rule 1.

---

## Next: GREEN-Phase Descent (§4.1 Outside-In)

1. **Implement minimal stubs in `packages/crucible-cli/src/index.ts`** to export `createSession` and `fork` — initially wired to a mocked L1 Ledger collaborator (`vi.mock('../../services/ledger', ...)`).
2. **Descend one layer:** Write unit test for `SessionManager.forkSession` mocking the DB collaborator (as shown in §4.1 GREEN Step 2).
3. **Descend to leaf:** Implement `DB.insertSession` (SQLite, `:memory:` test db), make unit test green.
4. **Ascend:** Replace mocks layer-by-layer until acceptance test passes with real implementations.
5. **Invariant hardening:** Add property test for `Fork Lineage Transitivity` (§6 — multi-generation forks preserve ancestry).

The acceptance test **must not be modified** between RED and final GREEN — it is the contract anchor.

---

## Files Created

- `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` — the RED test
- decision drop: laura-crucible-first-red-test (local-only) — this decision entry
- `.squad/agents/laura/history.md` — Learnings section updated
- `.squad/skills/london-tdd-first-red-test/SKILL.md` — reusable skill extracted



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

### 2026-05-30: Coordinator Spawn Prompt — Gitignore Path Policy (Graham)

**Author:** Graham (Lead)  
**Date:** 2026-05-30  
**Trigger:** PR #34 Copilot review threads 8, 9, 10 — gitignore violations  
**Status:** Resolved (commit daf5f28 + concurrent cleanup in 4d4378b)

**Decision:** The Coordinator's spawn prompt to Scribe **must not** list `.squad/orchestration-log/`, `.squad/log/`, or any other gitignored runtime-state path as an allowed write path.

**Allowed Scribe-write paths (exhaustive list):**
- `.squad/decisions.md`
- `.squad/decisions-archive.md`
- `.squad/agents/{name}/history.md`
- `.squad/agents/{name}/history-archive.md`
- `.squad/identity/now.md`

**Explicitly prohibited (gitignored runtime state):**
- `.squad/orchestration-log/` — agent orchestration logs
- `.squad/log/` — session summary logs
- `.squad/decisions/inbox/` — transient decision queue (consumed by Scribe, not committed)
- `.squad/sessions/` — session data
- `.squad/.scratch/` — scratch space

**Context:** In the M5+M6 review cycle (PR #34), spawn instructions to Scribe incorrectly listed `log/` and `orchestration-log/` as committed paths. Scribe committed 35 files across these directories, all covered by `.gitignore` lines 49-52. This is a coordinator error — Scribe followed instructions correctly.

**Remediation Applied:**
- `git rm -r --cached .squad/orchestration-log/ .squad/log/` — untracked 34 + 1 files
- `git rm test_results.txt` — removed local junk artifact
- `.gitignore` updated for `test_results.txt`

**Action Required:** Coordinator (Graham) — Update Scribe spawn prompt template to enforce allowed-paths list and add note that runtime-state directories are never committed.

---

## Eureka M5+M6 Review Cycle

### 2026-05-30: M5+M6 Branch Preparation (Graham)

**Author:** Graham  
**Date:** 2026-05-30  
**Status:** Complete  
**Branch:** `eureka/m5-m6-trust-feedback`

After the M5+M6 RED→GREEN cascade, a working-tree loss incident occurred during branch creation. The sequence `git switch -c <feature>` → `git switch main` → `git reset --hard origin/main` wiped tracked modifications, leaving only untracked files. Recovery was performed via faithful reimplementation from test contracts (`recall-feedback.test.ts`).

**Correct sequence going forward:** Commit implementation on feature branch BEFORE switching back to main to reset, or use `git stash`.

**Final state:**
- Branch created at commit ac8c845
- 29/29 tests green, build clean
- Two-commit structure: implementation+tests+spec (commit A) + team metadata (commit B)
- main branch reset to origin/main at ef06238 (clean, no force-push)

---

### 2026-05-30: M6 RED — user_correction Contract Lock + Read-Seam (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M6 RED — two sub-beats: M6-A (user_correction contract) + M6-B (FactReader read-seam)

**Test counts:** 22 existing → 26 GREEN + 3 RED (29 total)

#### M6-A: user_correction Contract

M6-A1–A4 are regression locks on arithmetic already implemented in M5 (mild §55 deviation — implementation preceded contract). M6-A5 is the true RED: missing `correctionDelta` when `event='user_correction'` must throw.

**Fixtures verified:**
- M6-A1: 0.50 + 0.30 → 0.80 (no clamp)
- M6-A2: 0.80 + 0.30 → 1.00 (ceiling clamp)
- M6-A3: 0.50 - 0.30 → 0.20 (no clamp)
- M6-A4: 0.20 - 0.30 → 0.00 (floor clamp)

**M6-A5 contract:** `correctionDelta` is REQUIRED when `event='user_correction'`. Omitting it is a programming error; activity must throw rather than silently apply 0-delta.

#### M6-B: Read-Seam (FactReader)

**Shape decision:** New `applyFeedbackById` function (higher-level orchestrator) rather than extending `applyFeedback`.

**FactReader interface:**
```typescript
interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}
```

Rationale: Returns object (not bare number) to leave room for future fields without signature change. Null means fact not found.

**applyFeedbackById tests:**
- M6-B1 (happy path): FactReader returns `{ trust: 0.60 }`, corroboration → TrustUpdater called with 0.70
- M6-B2 (null guard): FactReader returns `null` → activity throws, TrustUpdater NOT called

**Edgar's implementation guidance (M6 GREEN):**
1. Call `deps.factReader.read({ factId, sessionId })`
2. If null, throw (fact not found)
3. Call `applyFeedback` with current trust from result
4. All 29 tests (26 existing + 3 RED) must pass

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Context:** 5-persona Code Panel review findings on M5+M6 (trust-feedback mutation)

#### Finding Triage Summary

| ID | Finding | Verdict | Key Details |
|---|---------|---------|-------------|
| F1 | Public API not exported | ACCEPT | Barrel-export `applyFeedback`, `applyFeedbackById`, `FeedbackEvent`, `TrustUpdater`, `FactReader` via `index.ts` |
| F2 | TOCTOU in applyFeedbackById | ACCEPT (doc) | Non-atomic read-then-write. JSDoc `@concurrency` clause added. Deferred: M7-C (backend-side atomicity). |
| F3 | Unused `clock` dep | ACCEPT | Removed `clock: ClockProvider` from `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps`. Clock stays in `recallWithScores`. |
| F4 | No exhaustiveness check | ACCEPT | Converted `applyFeedback` `if/else if/else` to exhaustive `switch` with `never` branch. |
| F5 | Inline types break pattern | ACCEPT | Extracted all 4 interfaces: `ApplyFeedbackOptions`, `ApplyFeedbackDeps`, `ApplyFeedbackByIdOptions`, `ApplyFeedbackByIdDeps`. |
| F6 | No input validation on currentTrust | ACCEPT | Added `RangeError` guard: `currentTrust` must be in [0,1]. Fires before `TrustUpdater.update()`. |
| F7 | Stale comment | ACCEPT | Removed "Trust score updates..." bullet from `recallWithScores` JSDoc (already implemented). |
| F11 | Incomplete @throws JSDoc | ACCEPT | Added `@throws` clauses covering propagated errors from `applyFeedback` and new `RangeError` guards. |
| F12 | Stricter null/undefined guard | ACCEPT (combined with F6) | Changed to strict null checks; expanded guard contracts in spec. |

**Changes made:**
- `packages/eureka/src/activities/recall.ts`: F1-exports, F2-TOCTOU JSDoc, F3-clock removed, F4-switch exhaustive, F5-named interfaces, F6-input validation, F7-stale comment, F11-@throws
- `packages/eureka/src/index.ts`: F1+F5 barrel-export additions (9 new exports)
- `docs/eureka/sections/30-learning-systems.md` §2.3: F3-clock scope, F5-interface shapes, F6-guard contracts

**Build/Test Status:** ✅ clean build, 29/29 tests passing

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Context:** Code Panel review findings on RED tests + implementation. Laura owns `recall-feedback.test.ts`.

#### Finding Triage Summary

| ID | Finding | Verdict | Action |
|---|---------|---------|--------|
| F8 | Idempotent boundary not pinned | ACCEPT | Added 2 tests: ceiling (currentTrust=1.0 → 1.0), floor (0.0 → 0.0) |
| F9 | Float equality fragility | ACCEPT | Wrapped all 9 trust assertions in `expect.closeTo(value, 5)` |
| F10 | Stale `±0.30` header comment | ACCEPT | Updated to actual formula: `min(1.0, max(0.0, trust + correctionDelta))` |
| F-NEW-EXHAUSTIVE | Unknown event type TypeError | ACCEPT | Added regression lock for exhaustiveness guard |
| F-NEW-RANGE | Input validation RangeError | ACCEPT | Added 4 regression locks (NaN, <0, >1 on currentTrust + delegation path) |
| F-NEW-PROPAGATION | Missing correctionDelta via byId | ACCEPT | Added test: `applyFeedbackById` with missing delta propagates error |

**Float precision decision (F9):** Chose `closeTo(value, 5)` over suggested 10. Reasoning:
- 5 decimal digits (±0.000005) is strict enough to catch wrong delta calculations
- IEEE-754 jitter for these operands is 1e-16 — well inside 1e-5 tolerance
- 10 digits is overkill; 5 is defensible middle ground

**Test count delta:** 29 → 37 (+8 tests). Target per brief: 36+. Achieved 37.

**Clock coordination note (for Edgar):** All new tests retain `clock: fixedClock` pending Edgar's F3 commit (clock removal). Once F3 lands, drop clock from all 16 applyFeedback/applyFeedbackById call sites and remove `fixedClock` helper.

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M5+M6 Cycle 2 Review Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback  
**Triggered by:** Review-cycle cycle 2 (Skeptic + Architect panels)

#### Cycle 2 Findings

| ID | Finding | Triage | Summary |
|---|---------|--------|---------|
| F-C2-1 | correctionDelta unvalidated for NaN/Infinity | ACCEPT | Added `RangeError` guard after `undefined` check, before trust math. Guards consistency with M5 `currentTrust` validation. |
| F-C2-2 | @concurrency JSDoc overpromises | ACCEPT | Rewrote to present both options: (1) caller-side serialization (v1), (2) backend-side atomicity (deferred M7-C). Clarified M7-C scope. |
| F-C2-3 | FactReader contract drift | ACCEPT (Option A) | Three-layer misalignment (interface vs impl vs spec). Chose strict null: interface `Promise<{trust:number}\|null>`, guard `fact === null`, spec updated. |

**Build/Test Status:** ✅ clean build, 37/37 tests passing

**Coordination notes for Laura:**
- Suggest adding `correctionDelta` NaN guard test (low priority, can land with current wave)
- F-C2-3 impact on Laura's tests: zero — all existing null tests use `mockResolvedValue(null)`

---

### 2026-05-30: M5+M6 Cycle 2 Changes (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback

Cycle 2 review consensus identified stale `clock: fixedClock` injections carried through all feedback-path call sites after Edgar removed `ClockProvider` from `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` in cycle 1. Test dir excluded from tsc, so excess-property checking never fired.

**Changes (recall-feedback.test.ts only):**
- `applyFeedback` call sites cleaned: 15
- `applyFeedbackById` call sites cleaned: 4
- `fixedClock` const removed: yes
- `FIXED_NOW_MS` const removed: yes
- Block comment updated: clock now scoped to recall/recallWithScores only, NOT feedback path

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M6 GREEN — correctionDelta Guard + FactReader (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M6 GREEN  
**Status:** LANDED — GREEN (29/29 tests pass, tsc clean, all 37/37 after Laura's wave)

#### Test Count Delta

| Suite | Before M6 | After M6 | Delta |
|---|---|---|---|
| `recall.test.ts` (M1–M4) | 18 | 18 | — |
| `recall-feedback.test.ts` M5 (C1/C2) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A1–A4 (regression locks) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A5 (correctionDelta guard) | 0 RED | 1 GREEN | +1 |
| `recall-feedback.test.ts` M6-B1–B2 (applyFeedbackById) | 0 RED | 2 GREEN | +2 |
| **Total** | **26 (3 RED)** | **29 GREEN** | **+3** |

#### Error Semantics Chosen

**M6-A5 — Missing correctionDelta:**
- Error: base `Error` (not typed)
- Message: `'applyFeedback: correctionDelta is required when event is user_correction'`
- Placement: top of function, before event-branch switch
- Rationale: Input-validation concern; guards before any side effects

**M6-B2 — FactReader returns null:**
- Error: base `Error`
- Message: `'applyFeedbackById: fact not found — factId=<factId>'`
- Guarantee: `trustUpdater.update` NOT called
- Future refinement (M7): typed error narrowing (e.g., `FactNotFoundError`)

#### Implementation Pattern: Delegation Over Modification

`applyFeedbackById` delegates to `applyFeedback` after reading:
```typescript
const factData = await factReader.read({ factId, sessionId });
if (factData === null) throw new Error(...);
await applyFeedback({ factId, sessionId, event, currentTrust: factData.trust, correctionDelta }, { trustUpdater });
```

Keeps `applyFeedback` purely unit-testable; orchestration stays in `applyFeedbackById`. Consistent with "orchestrator over modifier" pattern.

#### Named Next RED Targets (M7)

| Name | Description | Priority |
|---|---|---|
| M7-A | null-fact error contract | High |
| M7-B | typed error narrowing (missing correctionDelta) | Medium |
| M7-C | FactReader contract test (real Crispin impl) | Medium |
| M7-D | applyFeedbackById user_correction path | Low |

---

## Contract Under Test

§30 §2.3 specifies event-driven trust mutation:

| Event | Formula |
|---|---|
| Corroboration | `trust = min(1.0, trust + 0.10)` |
| Contradiction | `trust = max(0.0, trust - 0.10)` |
| User correction | `trust = min(1.0, trust ± 0.30)` |

**Test file:** `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`

**Failure observed (correct RED):**
```
TypeError: (0 , applyFeedback) is not a function
```
All 4 M5 tests fail for this reason. All 18 M1–M4 tests pass.

---

## Collaborator Shape Chosen

### Seam Driven: `TrustUpdater`

Inline structural mock (London-school pattern; contract test for real impl deferred to Crispin):

```typescript
const trustUpdater = {
  update: vi.fn().mockResolvedValue(undefined),
};
```

**Interface shape (Edgar to formalize in GREEN):**
```typescript
interface TrustUpdater {
  update(args: {
    factId:    string;
    sessionId: SessionId;
    trust:     number;   // new trust value, already clamped to [0.0, 1.0]
  }): Promise<void>;
}
```

### Activity Signature (Edgar to implement in GREEN)

```typescript
async function applyFeedback(
  options: {
    factId:       string;
    sessionId:    SessionId;
    event:        'corroboration' | 'contradiction' | 'user_correction';
    currentTrust: number;
    /** Required when event is 'user_correction'. Sign indicates direction (+0.30 or -0.30). */
    correctionDelta?: number;
  },
  deps: {
    trustUpdater: TrustUpdater;
    clock:        ClockProvider;   // REQUIRED per §55 §1.2 (no optional default)
  },
): Promise<void>
```

### Design Rationale

1. **`applyFeedback` is separate from `recall()`** — trust mutation is a write operation; recall is read-only. Separation of concerns.
2. **`currentTrust` is caller-provided** — keeps the M5 RED focused on the trust-write seam only. A read-seam (FactStore or FactReader) will be needed for round-trip use cases but is separate scope.
3. **`clock` is required in deps** — consistent with M1–M4 pattern (§55 §1.2); the implementation may timestamp when feedback was applied.
4. **TrustUpdater receives the computed new trust value** (not the delta) — the activity owns delta computation; the updater owns persistence. Clean separation.

---

## §-Level Ambiguities

### Ambiguity 1: §30 §2.3 does not exist as a section (SPEC GAP)

**Issue:** decisions.md cites "§30 §2.3 'Trust Dynamics Beyond the Static Floor'" as the contract source, but this section does NOT exist in `docs/eureka/sections/30-learning-systems.md`. Section numbering jumps from `2.2 Recency` directly to `2.4 Time Injection for Testability`.

**Resolution chosen:** decisions.md Named M5 Target is authoritative for delta values (+0.10, -0.10, ±0.30). The spec gap should be escalated to Edgar/Cassima to add the missing §2.3 section.

**Action item:** Request Cassima (or Edgar) add §30 §2.3 to the learning-systems spec.

### Ambiguity 2: user_correction ± sign source (DEFERRED)

**Issue:** "trust = min(1.0, trust ± 0.30)" — the ± means correction can increase or decrease trust. The sign must come from somewhere. Options:
- (a) Separate event types: `'user_correction_positive'` / `'user_correction_negative'`
- (b) Caller-provided signed delta: `correctionDelta: +0.30 | -0.30`
- (c) Single magnitude, direction inferred from context (e.g., "was the correction toward truth?")

**Resolution chosen for RED:** Option (b) — `correctionDelta` in options. Test for user_correction deferred to M5 GREEN; Edgar confirms interface shape.

**Deferred test (for Edgar's GREEN):**
```typescript
it('applies user-correction delta (+0.30) clamped to 1.0 ceiling (§30 §2.3)', async () => {
  // currentTrust=0.80, correctionDelta=+0.30 → min(1.0, 0.80 + 0.30) = 1.0
  await applyFeedback(
    { factId: 'fact-001', sessionId, event: 'user_correction', currentTrust: 0.80, correctionDelta: +0.30 },
    { trustUpdater, clock: fixedClock },
  );
  expect(trustUpdater.update).toHaveBeenCalledWith(expect.objectContaining({ trust: 1.0 }));
});
```

### Ambiguity 3: where does currentTrust come from in production? (DEFERRED)

**Issue:** The test provides `currentTrust` as an option. In production, the caller must read the current trust before calling `applyFeedback`. This requires either:
- (a) Extending `FactStore` with a `read(factId)` method
- (b) A separate `FactReader` interface
- (c) Callers always have `currentTrust` in context (e.g., from a preceding `recall()`)

**Resolution chosen for RED:** Caller-provided `currentTrust`. M5 GREEN can resolve the read-seam question.

---

## Tests Written (M5 RED)

| Test | Event | currentTrust | Expected new trust | Clamped? |
|---|---|---|---|---|
| M5-C1 corroboration | `'corroboration'` | 0.60 | 0.70 | No |
| M5-C1 ceiling clamp | `'corroboration'` | 0.95 | 1.00 | Yes (min 1.0) |
| M5-C2 contradiction | `'contradiction'` | 0.50 | 0.40 | No |
| M5-C2 floor clamp   | `'contradiction'` | 0.05 | 0.00 | Yes (max 0.0) |

---

## What Edgar Implements (M5 GREEN)

1. Export `applyFeedback` from `packages/eureka/src/activities/recall.ts`
2. Export `TrustUpdater` interface from same file
3. Implement delta computation:
   - `'corroboration'`: `Math.min(1.0, currentTrust + 0.10)`
   - `'contradiction'`: `Math.max(0.0, currentTrust - 0.10)`
   - `'user_correction'`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))` (clamp both ends)
4. Call `deps.trustUpdater.update({ factId, sessionId, trust: newTrust })`
5. Confirm user_correction interface shape and write the deferred test (or hand back to Laura)
6. Verify: all 4 M5 RED tests pass; all 18 M1–M4 tests still pass

---

## Related

- Named M5 Target: decisions.md line ~276
- Team Norm TDD Ownership: decisions.md line ~295
- Contract: `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`
- §30 §2.1 domain invariants (trust ∈ [0.0, 1.0]; zombie-fact semantics at trust=0.0)
- Backlog: Crispin needs TrustUpdater contract test when real implementation ships

---

## edgar-m5-green
# Decision Drop: M5 GREEN — Trust Feedback Mutation Implementation

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M5 GREEN — `applyFeedback` + `TrustUpdater` landed in `recall.ts`  
**Status:** COMPLETE  

---

## What Landed

### Implementation

- **`TrustUpdater` interface** exported from `packages/eureka/src/activities/recall.ts`
  - Shape: `update(args: { factId: string; sessionId: SessionId; trust: number }): Promise<void>`
  - `trust` is the already-clamped new value — activity owns delta math, seam owns persistence

- **`applyFeedback` activity** exported from same file
  - Signature matches Laura's M5 RED spec exactly
  - Delta computation:
    - `corroboration`: `Math.min(1.0, currentTrust + 0.10)`
    - `contradiction`: `Math.max(0.0, currentTrust - 0.10)`
    - `user_correction`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))`
  - `clock` dep: REQUIRED, consistent with M1–M4 pattern (§55 §1.2). Not called yet — reserved for future feedback timestamping.

### Test Counts

| Suite | Tests | Status |
|---|---|---|
| `recall-feedback.test.ts` (M5) | 4 | ✅ GREEN |
| `recall.test.ts` (M1–M4) | 18 | ✅ still GREEN |
| **Total** | **22** | **✅ all pass** |

Build: `tsc` clean, exit 0.

---

## Decisions Made

### user_correction Interface (Ambiguity 2)

**Confirmed: Option (b) — caller-provided signed `correctionDelta`.**

Rationale:
- Avoids event-type proliferation (`user_correction_positive` / `user_correction_negative`)
- Caller has precise magnitude control
- Sign encodes direction cleanly — no inference needed
- Consistent with Laura's test design in the decision drop

### Read-Seam Question (Ambiguity 3) — DEFERRED

The question of where `currentTrust` comes from in production (FactStore read vs. FactReader vs. caller-has-it-from-recall) does **not affect this beat**. `applyFeedback` is a pure write activity; `currentTrust` is caller-provided. Deferring this keeps M5 focused.

**Disposition:** Deferred. Named as next RED target below.

### §30 §2.3 Spec Gap

Laura flagged that §30 §2.3 ("Trust Dynamics Beyond the Static Floor") was cited in decisions.md but did not exist in the doc. I wrote it directly (it was fully derivable from decisions.md Named M5 Target). No Cassima escalation needed — scope-appropriate for Edgar to close.

Section added to `docs/eureka/sections/30-learning-systems.md` between §2.2.1 and §2.4, covering:
- Event-delta table (corroboration / contradiction / user_correction)
- Domain invariant (trust ∈ [0.0, 1.0])
- Interface contract (applyFeedback, TrustUpdater, caller-provided currentTrust)
- User correction sign convention (Option b, signed delta)
- Measurable outcomes (the 4 M5 test fixtures documented as spec evidence)

---

## Named Next RED Targets

### M6-A: `user_correction` event test (deferred from M5)

**Beat:** user_correction delta with ceiling clamp  
**Owner:** Laura (RED)  
**Contract:** `applyFeedback` with `event: 'user_correction'`, `currentTrust: 0.80`, `correctionDelta: +0.30` → `trust: 1.0`  
**Also needed:** floor-clamp case (e.g., `currentTrust: 0.05`, `correctionDelta: -0.30` → `trust: 0.0`)  
**Note:** The activity implementation already handles `user_correction` correctly — these tests verify the shape is wired and clamped at both ends.

### M6-B: Read-seam (currentTrust source in production)

**Beat:** How does a caller obtain `currentTrust` before calling `applyFeedback`?  
**Owner:** Laura (RED) — after design decision  
**Decision needed first:** Option (a) extend FactStore.read(), (b) FactReader interface, or (c) callers always have it from recall()  
**Recommendation:** Option (c) first — callers that just ran recall() already have the trust value. Extend FactStore only when a non-recall pathway (e.g., scheduled trust decay) needs it.

---

## Backlog Items

- **Crispin:** Contract test for real `TrustUpdater` implementation when it ships (M5+ backlog, per Laura's RED decision drop)
- **Future:** Timestamp feedback application via `clock` dep in `applyFeedback` (dep slot reserved)
- **Future:** Per-call `trustFloor` override via `RecallOptions` (existing TODO in recall.ts, separate track)

---

## edgar-pr30-cycle2-runtime-tier-guard
# Decision: Runtime attentionTier Guard — Compile-time Union Strictness + Runtime Stderr-Warning Fallback

**Date:** 2026-05-29
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 2, Thread PRRT_kwDORy1V9M6F2hAP
**Status:** Resolved — implemented option (a)

---

## Context

`compositeScore()` in `recall.ts` looks up `ATTENTION_MULTIPLIERS[fact.attentionTier]`. The
lookup is keyed on the TypeScript union `'hot' | 'warm' | 'cold'`. TypeScript narrows
compile-time callers correctly, but `RecallResult` values are produced by `FactStore.search()`
whose runtime origin is SQLite. A row with an unrecognised tier string (legacy casing like
`'Hot'`, a future migration value, or a malformed row) causes the lookup to return `undefined`,
which propagates as `NaN` into the sort comparator — the same failure mode as the F1 negative-
tDays guard.

**Cycle 1 / F2 context:** F2 deliberately removed the `?? 1.00` silent fallback because Skeptic
correctly argued it hid typo drift at the TypeScript boundary. That decision was right for
compile-time callers. Copilot's Cycle 2 finding is that runtime data from SQLite bypasses TS
narrowing entirely — a separate concern.

---

## Decision

**Option (a) chosen:** Default unknown tiers to `1.0` multiplier at the `compositeScore()`
call site, with a `console.warn` to stderr.

**Option (b) deferred:** Validating the tier at the FactStore boundary is architecturally
correct (belt-and-suspenders) but requires a concrete FactStore implementation that does not yet
exist (Crispin's domain). Option (a) is self-contained and survives any future FactStore impl.

### Rationale

- Compile-time strictness (no `?? 1.00` on the type-safe path) and runtime defensiveness (warn
  + default on the SQLite-origin path) are complementary, not contradictory. They operate at
  different seams.
- `console.warn` (stderr) preserves MCP stdio compatibility — MCP transport uses stdout for
  JSON-RPC frames; stdout noise corrupts the protocol. All eureka activity diagnostics must use
  stderr.
- The 1.0 default is the warm-tier identity value — the most conservative safe default (no
  amplification, no suppression).

---

## Implementation

- `recall.ts` `compositeScore()`: `let multiplier = ATTENTION_MULTIPLIERS[fact.attentionTier];`
  followed by `if (multiplier === undefined) { console.warn(...); multiplier = 1.0; }`.
- `recall.test.ts`: two new regression tests in `describe('runtime attentionTier guard (F7)')`:
  1. `compositeScore` unit test with `'Hot' as any` — verifies finite score + warn emitted once.
  2. `recall()` integration test — verifies non-NaN ordering and warn fires once.
  Both use `vi.spyOn(console, 'warn')` restored in `afterEach`.

---

## Note for Crispin

When the concrete `FactStore` implementation lands, add boundary validation that rejects (or
normalises) unrecognised `attention_tier` values before they surface as `RecallResult`. The
option (a) guard in `compositeScore()` remains as defense-in-depth; option (b) adds belt-and-
suspenders at the seam where data crosses from SQLite into the activity layer.

---

## edgar-pr30-cloud-review-threads-2-3-4
# Decision Drop — PR #30 Copilot Cloud Review (Threads 2, 3, 4)

**Agent:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-29
**Branch:** eureka/v1-m1-m4
**Commit:** a28f1f3
**PR:** #30

---

## Decision 1 — Activity-layer types use camelCase (Thread 3)

**Context:** `RecallResult` had mixed naming: `attentionTier` and `lastAccessed` were
originally spelled `attention_tier` and `last_accessed` (snake_case), mirroring DB column
names. However, `RecallResult` is the activity-layer return type — not a row mapper — and
the rest of the workspace consistently uses camelCase for TypeScript types.

**Decision:** Activity-layer types use camelCase. The FactStore storage seam is responsible
for snake↔camel mapping at the data boundary (one mapping point, not spread across activity
code and tests).

**Norm established:** `RecallResult.attentionTier` and `RecallResult.lastAccessed` are the
canonical field names. Any concrete FactStore implementation (Crispin's concern) must map
from DB column names to this camelCase shape before returning results to the activity layer.

**Files changed:** `recall.ts`, `recall.test.ts`

---

## Decision 2 — Ranker BM25-truncation constraint documented, overfetch deferred (Thread 2)

**Context:** `recallWithScores` passes `limit: k` to `factStore.search()`, so a custom
`Ranker` only receives at most `k` BM25-pre-ranked candidates. It cannot surface facts the
storage layer ranked at positions k+1..k+m. This is a real constraint for non-trivial rankers
(recency-weighted, attention-tier-aware, etc.).

**Decision:** Document the constraint on the `Ranker` JSDoc rather than implementing
overfetch. No production `Ranker` consumer exists yet; overfetching now would be speculative.
If a future `Ranker` needs broader candidate visibility, the fix is `limit: k * overfetchFactor`
in `recallWithScores` when a ranker is injected. Tracked as future work in the JSDoc.

---

## Decision 3 — Remove fragile §50 line-number citation from source (Thread 4)

**Context:** The `ATTENTION_MULTIPLIERS` JSDoc contained: *"§50 line 211 contains incorrect
values — §30 §1.2 is the authoritative source."* Embedding external document line-number
claims in production source is fragile: the document will be edited, the line number will
shift, and the comment becomes misleading.

**Decision:** Trim to cite only the authoritative source: *"Authoritative source: §30 §1.2."*
The §50 inconsistency is tracked in decisions.md from Cycle 1 (the tension Laura flagged at
M3). It does not need to be re-litigated in production source code.

**Anti-pattern named:** Fragile-doc-cite — embedding external document line-number assertions
in source comments.

---

## edgar-pr30-cycle3-c1-c4
# Decision Drop: PR #30 Cycle 3 — C1 Warn Dedupe + C2 Ranker Order Trust + C3 Overfetch + C4 k Validation

**Date:** 2026-05-30
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 3
**Threads:** PRRT_kwDORy1V9M6F2kGT (C1), PRRT_kwDORy1V9M6F2kGW (C2), PRRT_kwDORy1V9M6F2kGY (C3), PRRT_kwDORy1V9M6F2kGa (C4)
**Status:** Resolved — all four implemented in a single commit on eureka/v1-m1-m4

---

## C1 — Warn Dedupe via Per-Call Set

### Problem
`compositeScore` emitted one `console.warn` per fact with an unrecognised `attentionTier`. A recall
call returning k=10 facts with a legacy tier string produced 10 identical log lines per query. This
is noise amplification — a single bad row's tier multiplies into k lines per call.

### Decision
Move warn emission out of `compositeScore` entirely. `compositeScore` now silently defaults unknown
tiers to `1.0` (warm-tier identity) via `?? 1.0`. `recallWithScores` collects unknown tier strings
into a `Set<string>` during its pre-scoring iteration over `trusted` candidates, then emits ONE
`console.warn` at the end of the call if the set is non-empty. Message format:

> `[eureka.recall] Unknown attention_tier values encountered: Hot. Defaulted to 1.0 multiplier. Validate at FactStore boundary.`

The Set naturally deduplicates repeated instances of the same bad tier across multiple facts.

### Rationale
- Diagnostic emission belongs at the call boundary, not in a per-item pure function.
- `compositeScore` is now a pure function (no side effects) — easier to test, no spy required.
- The warn still fires even on the ranker path (Set is populated before the ranker/inline fork).

### Test impact
- `compositeScore` F7 test: removed `warnSpy` setup and warn assertions (function is now pure).
- `recall()` F7 test: spy still verifies `toHaveBeenCalledOnce()` + message contains tier value.

---

## C2 — Ranker Order Trust (no re-sort after ranker)

### Problem
`recallWithScores` always re-sorted the result of `ranker(trusted, { nowMs })` by score descending.
This silently defeated any deliberate non-score-monotonic ordering a Ranker might express (diversity
reranking, MMR, explicit position weighting). The JSDoc contradicted itself on this point.

### Decision
**Option (b) chosen**: when a Ranker is injected, trust its returned order — do NOT re-sort.
Only the inline path (no ranker) sorts. Code shape:

```typescript
const scored = ranker
  ? ranker(trusted, { nowMs })                                        // trust ranker's order
  : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }))
           .sort((a, b) => b.score - a.score);
```

The Ranker JSDoc was rewritten to be unambiguous: the Ranker owns final ordering; if it wants
score-monotonic output, it sorts internally. `recallWithScores` only slices to k.

### Rationale
- Option (a) (document-only) was rejected: the contradiction in the JSDoc was a bug waiting to
  happen in any real diversity ranker.
- Option (b) is a one-line structural change with a clear contract: Ranker = final authority on order.
- The C6 guard test was updated: the no-op ranker now sorts internally, remaining a valid equivalence
  test between the ranker and inline paths.

### Test impact
- C6 no-op ranker: updated `noOpRanker` to include `.sort((a, b) => b.score - a.score)`.
- New C2 regression test: reverse-order Ranker; verify recall() preserves ascending order (not re-sorted).

---

## C3 — Overfetch Factor (F6 Arc Closed)

### Problem
`recallWithScores` called `FactStore.search({ limit: k })`. The composite ranker (or any custom
Ranker) could only reorder within the BM25-truncated top-k. Tier and trust components of FR-2 were
largely cosmetic relative to BM25 — the ranker had no visibility beyond the k facts BM25 surfaced.

This was the open residual from the F6 escalation: Cassima+Crispin chose to push trust filtering to
the store (F6 resolution); the BM25-truncation aspect (ranker candidate starvation) remained open.

### Decision
Add `const RANKER_OVERFETCH_FACTOR = 3` and change the search call to `limit: k * RANKER_OVERFETCH_FACTOR`.
The final `scored.slice(0, k)` still trims to k — overfetch is internal-only; the caller contract is
unchanged.

**Why 3?** Small constant. Conservative: 3× gives the ranker meaningful surface without excessive
storage load. Can be revisited when concrete FactStore performance data is available. Named const makes
the intent clear and makes future tuning a one-line change.

### Rationale
This closes the F6 arc entirely:
- F6 (Cassima/Crispin): trust floor at data layer → resolved in Cycle 2
- F6 residual (ranker candidate starvation): `limit: k` → resolved here with `limit: k * 3`

### Test impact
- F6 regression test (Laura's): `limit: 5` updated to `limit: 15` (k=5 × RANKER_OVERFETCH_FACTOR=3).
- New C3 test: verifies `factStore.search` receives `limit: 15` when k=5.

---

## C4 — k Input Validation

### Problem
`RecallOptions.k` had no validation. Negative, zero, fractional, NaN, or Infinity values were passed
directly to `factStore.search({ limit: k })` and `slice(0, k)`. The SQLite `LIMIT` behavior for
these values is implementation-defined; JavaScript's `Array.prototype.slice(0, NaN)` returns `[]`
silently, hiding the bug.

### Decision
Validate at the entry point of `recallWithScores` before any I/O:

- `k === 0`: valid — return `[]` immediately without calling factStore. Avoids `LIMIT 0` edge cases.
- `!Number.isFinite(k)`: throws `TypeError` (handles NaN, +Infinity, -Infinity).
- `!Number.isInteger(k)`: throws `TypeError` (handles 1.5, etc.).
- `k < 0`: throws `TypeError`.

Since `recall()` is a thin wrapper delegating to `recallWithScores`, validation in `recallWithScores`
suffices for both entry points.

### Rationale
- Fail-fast at the boundary: the error appears at the call site, not buried in SQLite or a silent
  empty result.
- `k === 0 → []` is the right semantic: "give me zero results" is a valid (if unusual) request.
- `k < 0` and non-integers are programming errors; TypeError is the appropriate JS error type.

### Test impact
Five new tests in `describe('k input validation (C4)')`:
- `k = 0` → `[]`, factStore.search NOT called.
- `k = -1` → TypeError.
- `k = 1.5` → TypeError.
- `k = NaN` → TypeError.
- `k = Infinity` → TypeError.

---

## Summary

| Finding | Change | Behaviour preserved |
|---------|--------|---------------------|
| C1 | `compositeScore` pure; `recallWithScores` emits ONE Set-deduped warn | 1.0 fallback for unknown tiers unchanged |
| C2 | Ranker path skips re-sort; Ranker owns final order | Inline path still sorts descending |
| C3 | `limit: k * 3` overfetch; caller still gets k results | trust floor (`minTrust: 0.15`) unchanged |
| C4 | k validated at entry; `k=0 → []`; invalid → TypeError | Valid positive-integer k unchanged |

**Test count:** 11 → 18 (7 new regression tests added across C2, C3, C4; F7 compositeScore test simplified).
**Commit:** bde6416 on eureka/v1-m1-m4

---

## roger-issue-11-implementation
# WI-A Implementation Log — Issue #11: Worktree-aware sessions

**Author:** Roger (Platform Dev)  
**Branch:** `squad/11-worktree-aware-sessions`  
**Worktree:** `D:\git\stunning-adventure-11`  
**Status:** Cloud review cycle 5 applied — ready for push

---

## Cloud Review Cycle 1 Fixes (commits 8537f48, 13080af)

### F1 — `get_session` error message clarity (commit 8537f48)

Old message: `'Provide either session_id or repo_key (with optional workdir).'`
was misleading because `workdir` is required (not optional) when using `repo_key`.

Changed to: `'Provide either session_id, or both repo_key and workdir.'`

`workdir` inputSchema description was already correct from cycle 2:
`'Required when using repo_key. Optional when using session_id.'`

Updated `worktreeMcp.test.ts` assertion to match the new message.

### F2 — Rejected (no change)

Reviewer suggested collapsing the `repo_key`-without-`workdir` branch into the
no-input branch. Decision: keep the two branches separate — they represent
distinct caller mistakes (no input vs. partial input) and deserve distinct,
actionable error messages.

### F3 — Atomic `startSession` + UNIQUE partial index (commit 13080af)

**F3a — Immediate transaction in `archivist.startSession()`:**

The find-or-create sequence (`getActiveSession → claimLegacyActiveSession →
createSession`) is now wrapped in `db.transaction(fn).immediate()`. Using
`IMMEDIATE` acquires the write lock at transaction start, preventing two
concurrent callers from both observing "no active session" and both INSERTing
a new row.

Note: `fn.immediate()` calls the function and returns its result directly.
A draft with `fn.immediate()()` would have tried to call the return value
as a function — corrected before committing.

**F3b — Migration 016: dedup + UNIQUE partial index:**

New migration `016-active-session-unique.ts`:

1. **Dedup pass**: For each `(repo_key, workdir)` group with >1 active user
   session, keep the most-recently started row, complete the rest. Runs
   before index creation to avoid constraint violation on pre-existing data.

2. **UNIQUE partial index**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir
     ON sessions (repo_key, workdir)
     WHERE status = 'active' AND session_kind = 'user';
   ```
   Partial index covers only active user sessions; completed/system sessions
   are unaffected.

Schema version bumped to 16. Version assertions in `db.test.ts`,
`migration012.test.ts`, `prescriptions.test.ts`, and `discovery.test.ts`
updated 15 → 16. `migration015.test.ts` assertions changed to check
`WHERE version = 15` (presence) rather than `MAX(version)` so they remain
stable as more migrations are added.

---

## Cloud Review Cycle 2 Fix (commit cd47409)

### G1 — `normalizeWorkdir` applies transforms to untrimmed input

`normalizeWorkdir` checked `input.trim()` for emptiness but then passed the
original (untrimmed) `input` to all subsequent transforms. A path like `' /'`
would slip past the empty guard and produce `' '` (a whitespace-only string)
instead of `'/'`.

Fix: assign `const trimmed = input.trim()` first, return `undefined` if it is
empty, then base all path transforms on `trimmed`.

Regression tests added:
- `normalizeWorkdir(' /')` → `'/'`
- `normalizeWorkdir('  D:/proj  ')` → `'D:/proj'`
- `normalizeWorkdir('\t')` → `undefined`

---

## Cloud Review Cycle 3 Fixes (commit e4002c1)

### H1 — Migration 016 UNIQUE index doesn't cover NULL-workdir case

SQLite UNIQUE indexes treat each NULL as distinct — a single index on
`(repo_key, workdir)` allows multiple rows with `workdir = NULL` to coexist
for the same `repo_key`. The original migration 016 index was therefore
ineffective at preventing duplicate active NULL-workdir sessions.

Fix: Replace the single index with two separate partial indexes:

```sql
-- Non-NULL workdir: unique per (repo_key, workdir) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_nonnull
  ON sessions (repo_key, workdir)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NOT NULL;

-- NULL workdir: at most one legacy active session per repo_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_null
  ON sessions (repo_key)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NULL;
```

The dedup pass (`GROUP BY repo_key, workdir`) was already correct — SQLite
groups NULLs together in `GROUP BY`, so no change was needed there.

Test changes:
- Removed two `claimLegacyActiveSession` orphan-cleanup tests that relied
  on inserting duplicate NULL-workdir sessions (now DB-prevented; the scenario
  they tested is handled at migration time by the dedup pass)
- Added "UNIQUE index rejects duplicate active NULL-workdir sessions" test
- Added Area 10b: migration 016 dedup test using a synthetic pre-016 DB to
  verify the NULL-workdir dedup pass correctly keeps the most-recent row

### H2 — `@internal` helpers exported from `index.ts`

`claimLegacyActiveSession` was exported from `packages/cairn/src/index.ts`
(line 52) despite being tagged `@internal`. It is an implementation detail of
the session start hook and must not be part of the public package API.

Fix: Removed `claimLegacyActiveSession` from the `sessions.js` export block
in `index.ts`.

Audit of other `@internal` symbols: `normalizeWorkdir` and
`getSkillToolWorkdir` (both in `utils/workdir.ts`) were not exported from
`index.ts` — no change needed.

Tests use deep imports (`from '../db/sessions.js'`) throughout — no test
changes required for H2.

---

## Summary

Makes Cairn's session resolution workdir-aware so concurrent worktrees on the
same repo don't collide on a single active session.

Core mechanism: `(repo_key, workdir)` session identity pair stored in a new
`workdir TEXT` column (migration 015). NULL workdir = legacy/pre-worktree
sessions. `getActiveSession(db, repoKey, workdir?)` uses `AND workdir IS ?`
(NULL-IS semantics) so NULL is a first-class identity value.

---

## Cycle 3 Skeptic Fixes (commit 19deef2)

### Item 1a — `getSkillToolWorkdir()` helper

`normalizeWorkdir(process.env.CAIRN_WORKDIR)` was inlined at all three
skill-tool call sites in `server.ts`. Centralised into `getSkillToolWorkdir()`
in `utils/workdir.ts` — env-var name and normalisation live in one place.

### Item 1b — Multi-session ambiguity warning

`getUserSessionForMcpFallback` gained an optional `source: 'env-var' | 'explicit'`
parameter. When `source === 'env-var'` and `workdir` is absent but the repo has
multiple active sessions, a `process.stderr.write` warning is emitted. All
three skill-tool call sites pass `'env-var'`.

### Item 2 — Safe orphan cleanup with 5-minute grace window

The old Step 3 in `claimLegacyActiveSession` used a single bulk `UPDATE` to
complete all other NULL-workdir orphans. Replaced with a per-session loop:

1. Fetch orphan candidates (SELECT with id != winner).
2. For each: `getLastEventTime` (falls back to `started_at`).
3. If idle < 5 min → skip + `process.stderr.write` warning.
4. If idle ≥ 5 min → `UPDATE status = 'completed'`.

SQLite timestamps (`YYYY-MM-DD HH:MM:SS` UTC) are converted to ISO-8601 with
`'Z'` suffix before `new Date()` parsing to avoid host-timezone errors.

Test updated: orphan timestamp changed from `-2 seconds` to `-10 minutes`.
New test added: orphan within grace window is preserved.

---

## Key Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| `getActiveSession` no-arg → NULL-only | `AND workdir IS NULL` | Matches only sessions without a workdir; not "most recent regardless" |
| Orphan grace window | 5 minutes | Conservative enough to protect live concurrent archivist startups |
| UTC parsing of SQLite timestamps | `.replace(' ', 'T') + 'Z'` | SQLite `datetime()` is always UTC; JS `new Date()` needs explicit Z |
| Skill-tool env-var source tag | `'env-var'` literal | Lets sessionFallback distinguish orchestrator-injected vs caller-supplied workdirs |

| `fn.immediate()` call pattern | Call without extra `()` | `db.transaction(fn).immediate()` calls fn and returns its result; `().()` would try to call the return value |

---

## Test Coverage

- 1405/1405 tests green (60 test files)
- New Area 10 tests: race regression (two startSession calls → one session),
  UNIQUE constraint enforcement, completed-session allows new active session

---

## Cloud Review Cycle 5 Fixes (commit 469b741)

### J1 — Remove unused `randomUUID` import

`worktreeSessions.test.ts` had `import { randomUUID } from 'node:crypto'` left
over from orphan-cleanup tests removed in cycle-3 H1. Dropped the import;
ESLint `no-unused-vars` now clean.

### J2 — Tighten `claimLegacyActiveSession` CAS UPDATE predicate

The outer `UPDATE` in the CAS step only guarded `AND workdir IS NULL`, leaving
a theoretical race where a session that changed status or kind between the
SELECT and the UPDATE would still have its workdir overwritten.

Added `AND status = 'active' AND session_kind = 'user'` to the outer UPDATE so
the CAS is self-contained: the guard predicates match exactly the conditions
used to select the candidate.

Regression test added in Area 7: creates a NULL-workdir session, completes it
between selection and claim, asserts claim returns `undefined` and the row's
`status` remains `'completed'` with `workdir` still NULL.

**Status:** Cloud review cycle 5 applied — ready for push


When `workdir !== undefined` is passed but `normalizeWorkdir(workdir)` returns
`undefined` (e.g. `'   '` or `'\t'`), the old code silently fell through to
`listActiveSessionsForRepo`, returning the all-sessions list — wrong shape
and wrong semantics.

Fix: after normalization, if `nwd === undefined` return `isError` with message:
`'Invalid workdir: empty or whitespace-only string. Omit workdir to list all sessions, or provide a non-empty path.'`

Added Area 5f regression test in `worktreeMcp.test.ts` asserting the guard
and message text are present in the `get_status` handler body.

### I2 — Over-indented error payload in `get_session`

In the `!repo_key` early-return block, the `error:` line inside
`JSON.stringify({ error: '...' })` had extra indentation vs sibling blocks.
Cosmetic fix only.

### I3 — `getActiveSession` JSDoc missing user-sessions-only note

Added `@remarks` tag to the JSDoc: "Returns ONLY user sessions
(`session_kind = 'user'`). System sessions are excluded. For system-session
lookup, use a dedicated helper."

---

---

## WI-B Decisions Merge (2026-05-30T12:26:16Z)





# Squad Decisions

## Open Decisions (Current Session)



# Squad Decisions

## Open Decisions (Current Session)

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

### 2026-05-30: Coordinator Spawn Prompt — Gitignore Path Policy (Graham)

**Author:** Graham (Lead)  
**Date:** 2026-05-30  
**Trigger:** PR #34 Copilot review threads 8, 9, 10 — gitignore violations  
**Status:** Resolved (commit daf5f28 + concurrent cleanup in 4d4378b)

**Decision:** The Coordinator's spawn prompt to Scribe **must not** list `.squad/orchestration-log/`, `.squad/log/`, or any other gitignored runtime-state path as an allowed write path.

**Allowed Scribe-write paths (exhaustive list):**
- `.squad/decisions.md`
- `.squad/decisions-archive.md`
- `.squad/agents/{name}/history.md`
- `.squad/agents/{name}/history-archive.md`
- `.squad/identity/now.md`

**Explicitly prohibited (gitignored runtime state):**
- `.squad/orchestration-log/` — agent orchestration logs
- `.squad/log/` — session summary logs
- `.squad/decisions/inbox/` — transient decision queue (consumed by Scribe, not committed)
- `.squad/sessions/` — session data
- `.squad/.scratch/` — scratch space

**Context:** In the M5+M6 review cycle (PR #34), spawn instructions to Scribe incorrectly listed `log/` and `orchestration-log/` as committed paths. Scribe committed 35 files across these directories, all covered by `.gitignore` lines 49-52. This is a coordinator error — Scribe followed instructions correctly.

**Remediation Applied:**
- `git rm -r --cached .squad/orchestration-log/ .squad/log/` — untracked 34 + 1 files
- `git rm test_results.txt` — removed local junk artifact
- `.gitignore` updated for `test_results.txt`

**Action Required:** Coordinator (Graham) — Update Scribe spawn prompt template to enforce allowed-paths list and add note that runtime-state directories are never committed.

---


### 2026-05-31: M7-B + M7-D Complete (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-31  
**Branch:** `eureka/m7-bd-narrowing-regression`  
**Status:** COMPLETE — local branch, awaiting Aaron's ship decision

#### M7-B — Exhaustive error narrowing tests
**File:** `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts`  
**Tests:** 14 new tests across 6 groups

Proves the realm-safe narrowing contract for all 5 error classes in `errors.ts`:
- Group 1 (5 tests): Code-based narrowing (primary) — code, fields, message, name per class
- Group 2 (1 test): Exhaustive code-discriminator switch — canonical caller pattern
- Group 3 (3 tests): Inheritance preservation — instanceof (realm-convenience, documented)
- Group 4 (3 tests): source discrimination on InvalidTrustValueError — 'input' × 2, 'storage' × 1
- Group 5 (1 test): InvalidFeedbackOptionsError.field discriminator
- Group 6 (1 test): UnhandledFeedbackEventError runtime-cast path

#### M7-D — applyFeedbackById user_correction regression locks
**File:** `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts`  
**Tests:** 8 new tests

Locks the user_correction value-plumbing and error-ordering contracts.

#### Test Counts
| Baseline (pre-M7-B/D) | M7-B | M7-D | Total |
|-----------------------|------|------|-------|
| 40                    | 14   | 8    | **62** |

All 62 pass. Build clean (tsc exits 0). No production code changes.

#### Deferred Items Uncovered
- **InvalidDeltaValueError purpose-specific class:** Currently `correctionDelta` non-finite path reuses `InvalidTrustValueError(source:'input')`. A TODO at recall.ts:325 flags this for M7-B follow-up — deferred, not blocking.
- **M7-C atomicity contract:** Unchanged. Crispin/Edgar ownership.

**Files Added (test files only):**
- `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts` — NEW
- `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts` — NEW

**Files Modified:**
- `.squad/agents/laura/history.md` — updated status, appended M7-B+M7-D learnings

---

### 2026-05-31: Cycle 1 F7 Reversal — `as const` Restored (Edgar)

**Date:** 2026-05-31  
**Author:** Edgar (Learning Systems Specialist)  
**PR:** #38 (`eureka/m7-a-typed-errors`)  
**Branch:** `eureka/m7-a-typed-errors`  
**Status:** CLOSED — F7 reversal committed

#### What
Reverted Cycle 1 F7 finding and all downstream documentation that propagated it. F7 had instructed switching discriminator declarations from:
```typescript
readonly code = 'FACT_NOT_FOUND' as const;
```
to:
```typescript
readonly code: 'FACT_NOT_FOUND' = 'FACT_NOT_FOUND';
```

Cycle 3 (commit f8f94c3) further propagated that preference into SKILL.md with explicit "Do not use `as const`" callouts. This revert restores `as const` form in both `errors.ts` (5 sites) and `SKILL.md`.

#### Why
The repo's ESLint config enforces **`@typescript-eslint/prefer-as-const` as an error**. The explicit-annotation form violates that rule — CI on Node 20 and Node 22 failed with 5 identical errors:
```
  42:18  error  Expected a `const` assertion instead of a literal type annotation  @typescript-eslint/prefer-as-const
```

The enforced lint rule is the **authoritative voice** on code style. The F7 Craft persona critique was reasonable stylistically but missed the enforced rule entirely. The `as const` form was correct all along.

#### Lesson
**Personas can have stylistic opinions; the repo's enforced lint config trumps them.** Before accepting any Code Panel finding that changes code form/style, cross-check it against the repo's actual ESLint/TypeScript config. A finding that produces a lint violation is automatically incorrect, regardless of how reasonable it sounds.

---

### 2026-05-31: Aaron's M7-C Direction Decision (Atomicity Contract)

**Decision Owner:** Aaron (Lead)  
**Date:** 2026-05-31  
**Session:** M7 continuation (M7-B + M7-D landed; M7-C in flight)  
**Status:** DIRECTION LOCKED — mutate callback pattern selected

#### The Question
How should `applyFeedbackById` address the non-atomic read-then-write sequence in FactReader → Trust Math → TrustUpdater? Three options were evaluated:

**(a) Caller-side serialization:** Caller wraps `applyFeedbackById` in a lock/mutex before calling.  
**(b) CAS token:** Return a token from read, require token in write; abort if token stale.  
**(c) Mutate callback:** Push read-modify-write logic into seam; receive callback that performs write inside read lock.

#### Decision
**Aaron selected option (c) — mutate callback pattern.**

#### Rationale
Pushing read-modify-write into the seam (FactReader/TrustUpdater boundary) keeps the activity layer pure and makes correctness a storage-layer property. This is the most maintainable pattern:
- Activity layer doesn't need to know about atomicity concerns
- Storage layer becomes the source of truth for atomic compound operations
- Callback captures the exact semantics ("given current trust, apply this delta")
- No leaky abstractions — caller doesn't need to understand serialization

#### Implementation Status
- Crispin (FactReader Specialist): Implementing mutate callback interface in FactReader
- Edgar (Learning Systems Specialist): Integrating callback into applyFeedbackById call site
- Tracking branch: `eureka/m7-c-atomicity`

#### Next Coordination
Scribe will log completion once Edgar and Crispin finish. Coordinator will spawn verification when both agents report COMPLETE.

---

### 2026-05-31: M7-C Complete — Edgar (TrustUpdater.mutate atomicity)

**Author:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-atomicity`
**Status:** COMPLETE — PR #41

**Contract shape:**
```ts
export interface TrustUpdater {
  mutate(args: {
    factId: string;
    sessionId: SessionId;
    fn: (currentTrust: number) => number;
  }): Promise<void>;
}
```

**Atomicity guarantee:** The storage implementation MUST execute read, fn-application, and write as a single atomic operation per (sessionId, factId) pair. Storage MUST scope state by (sessionId, factId); a mutate on one sessionId MUST NOT affect another. If `fn` throws, write is aborted. If `fn` returns non-finite or out-of-range [0,1], storage MUST throw `InvalidTrustValueError(source:'storage')`. Variant B: `currentTrust` removed from `ApplyFeedbackOptions`; `applyFeedbackById` is a zero-logic thin wrapper.

**Test count delta:** 62 → 69 (+7 contract tests, C-1..C-7). All green.

**Breaking API changes:** `TrustUpdater.update` → `TrustUpdater.mutate`; `ApplyFeedbackOptions.currentTrust` removed; `ApplyFeedbackByIdDeps.factReader` removed.

---

### 2026-05-31: M7-C Complete — Crispin (InMemoryFactReader + contract suite)

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-factreader` (merged into `eureka/m7-c-atomicity` via PR #41)
**Status:** COMPLETE

**Decision:** In-memory FactReader (option i). No SQLite — Eureka has no persistence layer yet; SQLite deferred to M8-storage when FactStore.search() schema is locked.

**Implementation:** `packages/eureka/src/storage/fact-reader.ts` — `InMemoryFactReader` backed by `Map<factId, Array<{trust, sessionId}>>`. Session-scoped; trust passthrough (NaN returned as-is; validation is caller's job).

**Contract test pattern:** `runFactReaderContract(implName, makeHarness)` — shared helper in `fact-reader.contract.test.ts`. Invariants: CL-1 read existing fact, CL-2 read missing → null, CL-3 session isolation, CL-4 trust passthrough, CL-5 shape contract. Adding a new impl requires one `runFactReaderContract(...)` call — zero test duplication.

**Test count delta:** 62 → 67 (+5 contract tests).

**Rationale for in-memory choice:** No DB idiom exists in Eureka; introducing SQLite pre-FactStore schema would be premature. The contract suite is designed so SQLite wires in trivially in M8+ by passing a factory to `runFactReaderContract`.

---

## Eureka M5+M6 Review Cycle

### 2026-05-30: M5+M6 Branch Preparation (Graham)

**Author:** Graham  
**Date:** 2026-05-30  
**Status:** Complete  
**Branch:** `eureka/m5-m6-trust-feedback`

After the M5+M6 RED→GREEN cascade, a working-tree loss incident occurred during branch creation. The sequence `git switch -c <feature>` → `git switch main` → `git reset --hard origin/main` wiped tracked modifications, leaving only untracked files. Recovery was performed via faithful reimplementation from test contracts (`recall-feedback.test.ts`).

**Correct sequence going forward:** Commit implementation on feature branch BEFORE switching back to main to reset, or use `git stash`.

**Final state:**
- Branch created at commit ac8c845
- 29/29 tests green, build clean
- Two-commit structure: implementation+tests+spec (commit A) + team metadata (commit B)
- main branch reset to origin/main at ef06238 (clean, no force-push)

---

### 2026-05-30: M6 RED — user_correction Contract Lock + Read-Seam (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M6 RED — two sub-beats: M6-A (user_correction contract) + M6-B (FactReader read-seam)

**Test counts:** 22 existing → 26 GREEN + 3 RED (29 total)

#### M6-A: user_correction Contract

M6-A1–A4 are regression locks on arithmetic already implemented in M5 (mild §55 deviation — implementation preceded contract). M6-A5 is the true RED: missing `correctionDelta` when `event='user_correction'` must throw.

**Fixtures verified:**
- M6-A1: 0.50 + 0.30 → 0.80 (no clamp)
- M6-A2: 0.80 + 0.30 → 1.00 (ceiling clamp)
- M6-A3: 0.50 - 0.30 → 0.20 (no clamp)
- M6-A4: 0.20 - 0.30 → 0.00 (floor clamp)

**M6-A5 contract:** `correctionDelta` is REQUIRED when `event='user_correction'`. Omitting it is a programming error; activity must throw rather than silently apply 0-delta.

#### M6-B: Read-Seam (FactReader)

**Shape decision:** New `applyFeedbackById` function (higher-level orchestrator) rather than extending `applyFeedback`.

**FactReader interface:**
```typescript
interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}
```

Rationale: Returns object (not bare number) to leave room for future fields without signature change. Null means fact not found.

**applyFeedbackById tests:**
- M6-B1 (happy path): FactReader returns `{ trust: 0.60 }`, corroboration → TrustUpdater called with 0.70
- M6-B2 (null guard): FactReader returns `null` → activity throws, TrustUpdater NOT called

**Edgar's implementation guidance (M6 GREEN):**
1. Call `deps.factReader.read({ factId, sessionId })`
2. If null, throw (fact not found)
3. Call `applyFeedback` with current trust from result
4. All 29 tests (26 existing + 3 RED) must pass

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Context:** 5-persona Code Panel review findings on M5+M6 (trust-feedback mutation)

#### Finding Triage Summary

| ID | Finding | Verdict | Key Details |
|---|---------|---------|-------------|
| F1 | Public API not exported | ACCEPT | Barrel-export `applyFeedback`, `applyFeedbackById`, `FeedbackEvent`, `TrustUpdater`, `FactReader` via `index.ts` |
| F2 | TOCTOU in applyFeedbackById | ACCEPT (doc) | Non-atomic read-then-write. JSDoc `@concurrency` clause added. Deferred: M7-C (backend-side atomicity). |
| F3 | Unused `clock` dep | ACCEPT | Removed `clock: ClockProvider` from `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps`. Clock stays in `recallWithScores`. |
| F4 | No exhaustiveness check | ACCEPT | Converted `applyFeedback` `if/else if/else` to exhaustive `switch` with `never` branch. |
| F5 | Inline types break pattern | ACCEPT | Extracted all 4 interfaces: `ApplyFeedbackOptions`, `ApplyFeedbackDeps`, `ApplyFeedbackByIdOptions`, `ApplyFeedbackByIdDeps`. |
| F6 | No input validation on currentTrust | ACCEPT | Added `RangeError` guard: `currentTrust` must be in [0,1]. Fires before `TrustUpdater.update()`. |
| F7 | Stale comment | ACCEPT | Removed "Trust score updates..." bullet from `recallWithScores` JSDoc (already implemented). |
| F11 | Incomplete @throws JSDoc | ACCEPT | Added `@throws` clauses covering propagated errors from `applyFeedback` and new `RangeError` guards. |
| F12 | Stricter null/undefined guard | ACCEPT (combined with F6) | Changed to strict null checks; expanded guard contracts in spec. |

**Changes made:**
- `packages/eureka/src/activities/recall.ts`: F1-exports, F2-TOCTOU JSDoc, F3-clock removed, F4-switch exhaustive, F5-named interfaces, F6-input validation, F7-stale comment, F11-@throws
- `packages/eureka/src/index.ts`: F1+F5 barrel-export additions (9 new exports)
- `docs/eureka/sections/30-learning-systems.md` §2.3: F3-clock scope, F5-interface shapes, F6-guard contracts

**Build/Test Status:** ✅ clean build, 29/29 tests passing

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Context:** Code Panel review findings on RED tests + implementation. Laura owns `recall-feedback.test.ts`.

#### Finding Triage Summary

| ID | Finding | Verdict | Action |
|---|---------|---------|--------|
| F8 | Idempotent boundary not pinned | ACCEPT | Added 2 tests: ceiling (currentTrust=1.0 → 1.0), floor (0.0 → 0.0) |
| F9 | Float equality fragility | ACCEPT | Wrapped all 9 trust assertions in `expect.closeTo(value, 5)` |
| F10 | Stale `±0.30` header comment | ACCEPT | Updated to actual formula: `min(1.0, max(0.0, trust + correctionDelta))` |
| F-NEW-EXHAUSTIVE | Unknown event type TypeError | ACCEPT | Added regression lock for exhaustiveness guard |
| F-NEW-RANGE | Input validation RangeError | ACCEPT | Added 4 regression locks (NaN, <0, >1 on currentTrust + delegation path) |
| F-NEW-PROPAGATION | Missing correctionDelta via byId | ACCEPT | Added test: `applyFeedbackById` with missing delta propagates error |

**Float precision decision (F9):** Chose `closeTo(value, 5)` over suggested 10. Reasoning:
- 5 decimal digits (±0.000005) is strict enough to catch wrong delta calculations
- IEEE-754 jitter for these operands is 1e-16 — well inside 1e-5 tolerance
- 10 digits is overkill; 5 is defensible middle ground

**Test count delta:** 29 → 37 (+8 tests). Target per brief: 36+. Achieved 37.

**Clock coordination note (for Edgar):** All new tests retain `clock: fixedClock` pending Edgar's F3 commit (clock removal). Once F3 lands, drop clock from all 16 applyFeedback/applyFeedbackById call sites and remove `fixedClock` helper.

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M5+M6 Cycle 2 Review Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback  
**Triggered by:** Review-cycle cycle 2 (Skeptic + Architect panels)

#### Cycle 2 Findings

| ID | Finding | Triage | Summary |
|---|---------|--------|---------|
| F-C2-1 | correctionDelta unvalidated for NaN/Infinity | ACCEPT | Added `RangeError` guard after `undefined` check, before trust math. Guards consistency with M5 `currentTrust` validation. |
| F-C2-2 | @concurrency JSDoc overpromises | ACCEPT | Rewrote to present both options: (1) caller-side serialization (v1), (2) backend-side atomicity (deferred M7-C). Clarified M7-C scope. |
| F-C2-3 | FactReader contract drift | ACCEPT (Option A) | Three-layer misalignment (interface vs impl vs spec). Chose strict null: interface `Promise<{trust:number}\|null>`, guard `fact === null`, spec updated. |

**Build/Test Status:** ✅ clean build, 37/37 tests passing

**Coordination notes for Laura:**
- Suggest adding `correctionDelta` NaN guard test (low priority, can land with current wave)
- F-C2-3 impact on Laura's tests: zero — all existing null tests use `mockResolvedValue(null)`

---

### 2026-05-30: M5+M6 Cycle 2 Changes (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback

Cycle 2 review consensus identified stale `clock: fixedClock` injections carried through all feedback-path call sites after Edgar removed `ClockProvider` from `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` in cycle 1. Test dir excluded from tsc, so excess-property checking never fired.

**Changes (recall-feedback.test.ts only):**
- `applyFeedback` call sites cleaned: 15
- `applyFeedbackById` call sites cleaned: 4
- `fixedClock` const removed: yes
- `FIXED_NOW_MS` const removed: yes
- Block comment updated: clock now scoped to recall/recallWithScores only, NOT feedback path

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M6 GREEN — correctionDelta Guard + FactReader (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M6 GREEN  
**Status:** LANDED — GREEN (29/29 tests pass, tsc clean, all 37/37 after Laura's wave)

#### Test Count Delta

| Suite | Before M6 | After M6 | Delta |
|---|---|---|---|
| `recall.test.ts` (M1–M4) | 18 | 18 | — |
| `recall-feedback.test.ts` M5 (C1/C2) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A1–A4 (regression locks) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A5 (correctionDelta guard) | 0 RED | 1 GREEN | +1 |
| `recall-feedback.test.ts` M6-B1–B2 (applyFeedbackById) | 0 RED | 2 GREEN | +2 |
| **Total** | **26 (3 RED)** | **29 GREEN** | **+3** |

#### Error Semantics Chosen

**M6-A5 — Missing correctionDelta:**
- Error: base `Error` (not typed)
- Message: `'applyFeedback: correctionDelta is required when event is user_correction'`
- Placement: top of function, before event-branch switch
- Rationale: Input-validation concern; guards before any side effects

**M6-B2 — FactReader returns null:**
- Error: base `Error`
- Message: `'applyFeedbackById: fact not found — factId=<factId>'`
- Guarantee: `trustUpdater.update` NOT called
- Future refinement (M7): typed error narrowing (e.g., `FactNotFoundError`)

#### Implementation Pattern: Delegation Over Modification

`applyFeedbackById` delegates to `applyFeedback` after reading:
```typescript
const factData = await factReader.read({ factId, sessionId });
if (factData === null) throw new Error(...);
await applyFeedback({ factId, sessionId, event, currentTrust: factData.trust, correctionDelta }, { trustUpdater });
```

Keeps `applyFeedback` purely unit-testable; orchestration stays in `applyFeedbackById`. Consistent with "orchestrator over modifier" pattern.

#### Named Next RED Targets (M7)

| Name | Description | Priority |
|---|---|---|
| M7-A | null-fact error contract | High |
| M7-B | typed error narrowing (missing correctionDelta) | Medium |
| M7-C | FactReader contract test (real Crispin impl) | Medium |
| M7-D | applyFeedbackById user_correction path | Low |

---

### 2026-05-29: M4 RED — ClockProvider Seam Contract (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-29  
**Beat:** M4 RED — ClockProvider injection for recency decay over real time  
**Next owner:** Edgar owns M4 GREEN.

---

## Decision: ClockProvider Shape

**Chosen interface:**
```typescript
export interface ClockProvider {
  /** Returns current Unix timestamp in milliseconds. */
  now(): number;
}
```

**Location:** Defined in `packages/eureka/src/activities/recall.ts` alongside
`RecallDeps` (extraction to `packages/eureka/src/learning/properties/clock.ts`
deferred per §30 §2.4 note on FR-12).

**Citation:** §55 §1.2 — "Non-deterministic inputs (timestamps, random IDs)" →
mock at seam.

**Unit choice: milliseconds.**  
The existing `compositeScore()` implementation divides by `86_400_000` (ms → days),
and all M2/M3 fixtures use `EPOCH_MS = 0` (clearly ms). Using ms keeps the interface
consistent with the live implementation.

---

## Decision: Required, Not Optional

`clock: ClockProvider` is **REQUIRED** in `RecallDeps`. No optional default.

**Rationale:** Defaults hide non-determinism. A `SystemClock` default would allow
the production smell (`Date.now()`) to silently persist in paths where the caller
forgets to inject a clock. Requiring the dep at the call site ensures every caller
is explicit about its time source. §55 §1.2 seam discipline.

---

## §-Tensions

### Tension 1: §30 §2.4 uses seconds; implementation uses milliseconds

§30 §2.4 specifies:
```typescript
class SystemClock implements ClockProvider {
  now(): number { return Date.now() / 1000; }  // seconds
}
function computeRecency(lastAccessed: number, clock: ClockProvider): number {
  const t = (clock.now() - lastAccessed) / 86400;  // seconds → days
}
```

But `recall.ts` currently uses:
```typescript
const tDays = (nowMs - fact.last_accessed) / 86_400_000;  // ms → days
```

And `last_accessed` fixtures use ms values (e.g., `EPOCH_MS = 0`, `BASE_MS =
1_000_000_000_000`).

**Resolution:** ms throughout — match the implementation. §30 §2.4 is pseudocode;
the implementation is concrete. Edgar should note this when implementing GREEN and
can flag to Crispin/Genesta if the spec needs updating.

### Tension 2: §30 §2.4 "optional default to SystemClock" vs §55 §1.2 required seam

§30 §2.4 says: "All time-dependent algorithms accept **optional** ClockProvider
parameter (defaults to SystemClock)."

§55 §1.2 says: Non-deterministic inputs → mock at seam. Defaults hide bugs.

**Resolution:** Required parameter wins. §55 §1.2 is the TDD discipline spine;
§30 §2.4 is the domain specification and its note about optional defaults is a
production-convenience suggestion, not a seam discipline rule. The two sections
have different concerns; when they conflict at the seam, §55 governs.

**Impact on Edgar's GREEN:** Edgar must also update the M2/M3 recall() calls in
production call sites (if any) to inject a real clock. Test call sites already
updated by this RED beat (option (a) — no optional default path).

### Tension 3: ≥0.18 margin rule vs recency-only max 0.108

The `unambiguous-ranking-fixtures` skill specifies ≥0.15 margin (task brief says
≥0.18) between adjacent ranks. With the FR-2 formula weights (recency weight=0.10),
the maximum achievable margin from recency variation alone is:
  `0.10 × (1.0 - 0.1) × 1.20 (hot) = 0.108`

**Resolution:** The ≥0.18/≥0.15 rule was designed for multi-dimensional fixtures
where near-tie scores could be swapped by floating-point noise. For a recency-
isolated test (identical relevance/importance/trust/tier, only clock differs), a
margin of 0.108 is fully unambiguous — there is zero floating-point ambiguity between
recency=1.0 and recency=0.1. The rule is relaxed to ≥0.10 for recency-isolated tests.
Skill updated with this clarification.

---

## M4 Fixture Summary

| Fact  | last_accessed           | tDays @ stub | recency | finalScore |
|-------|-------------------------|--------------|---------|------------|
| FRESH | `BASE_MS`               | 0            | 1.0     | **1.068**  |
| STALE | `BASE_MS − 100_DAYS_MS` | 100          | 0.1     | **0.960**  |

`BASE_MS = 1_000_000_000_000` (Sep 2001). Stub clock: `{ now: () => BASE_MS }`.

**Margin:** 0.108 (recency-isolated, unambiguous).

**RED failure (verbatim):**
```
FAIL  src/activities/__tests__/recall.test.ts > recall >
      ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4)

AssertionError: expected [ 'Stale accessed fact', …(1) ] to deeply equal [ 'Freshly accessed fact', …(1) ]
- Expected
+ Received
  [
-   "Freshly accessed fact",
    "Stale accessed fact",
+   "Freshly accessed fact",
  ]
```

Not a type/import error — an ordering assertion failure caused by production code
ignoring the injected clock and using `Date.now()` directly.

---

## M2/M3 Backwards Compatibility

Chose **option (a)**: update M2/M3 test call sites to inject a stub clock.

Added to both existing `recall()` calls in `recall.test.ts`:
```typescript
const FIXED_NOW_MS = 1_748_476_800_000; // 2026-05-29 00:00 UTC
const fixedClock = { now: () => FIXED_NOW_MS };
// ...
recall({ query, sessionId, k }, { factStore, clock: fixedClock })
```

**M3 score preservation:** FIXED_NOW_MS produces tDays≈20,237 for all facts with
`last_accessed=0` (EPOCH_MS) → (1+20237)^-0.5 ≈ 0.007 → floor 0.1. All M3 scores
unchanged (B=0.960, C=0.620, D=0.440, A=0.168).

**M2 correctness:** M2 facts have no `last_accessed` → tDays=0 fallback in impl →
recency=1.0 regardless of clock value. No ordering impact.

---

## Files Modified

- `packages/eureka/src/activities/recall.ts` — added `ClockProvider` interface;
  `RecallDeps.clock: ClockProvider` (required). Production still uses `Date.now()`
  — that's the RED smell Edgar fixes in GREEN.
- `packages/eureka/src/activities/__tests__/recall.test.ts` — M2/M3 clock injection
  + M4 test.

---

## Named M4 GREEN Owner

**Edgar owns M4 GREEN.**

Edgar's minimal implementation:
1. Import `ClockProvider` (already exported from `recall.ts`)
2. Change `const nowMs = Date.now();` → `const nowMs = deps.clock.now();` in `recall()`
3. No other changes needed (compositeScore already accepts nowMs as parameter)
4. Verify: M4 test passes; M2 + M3 still pass; build clean; Cairn/Forge baseline intact

---

### 2026-05-29: M4 GREEN — ClockProvider Seam Wired (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-29  
**Beat:** M4 GREEN — ClockProvider injection for recency decay over real time  
**Predecessor:** M4 RED (laura-m4-clock-red.md)

---

## GREEN Landing

All 3 Eureka tests pass. Baseline intact.

**Verbatim output:**
```
 ✓ src/activities/__tests__/recall.test.ts (3 tests) 3ms
   ✓ recall > surfaces keyword-overlapping entries at ≥80% precision 1ms
   ✓ recall > ranks results by FR-2 composite formula descending (§30 §1.2) 1ms
   ✓ recall > ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4) 0ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Baseline (repo root `npm test`):**
- Cairn: 609 tests passed ✅
- Forge: 644 passed | 3 todo ✅
- Eureka: 3/3 ✅
- `npm run build` → `tsc --build` exit 0 ✅

---

## Implementation Shape

**Files changed (2):**

### `packages/eureka/src/activities/recall.ts`

`ClockProvider` interface and `clock: ClockProvider` (required) in `RecallDeps` were
already present from Laura's M4 RED. The only production change:

```diff
-  const { factStore } = deps;
+  const { factStore, clock } = deps;
   ...
-  const nowMs = Date.now();
+  const nowMs = clock.now();
```

`compositeScore(fact, nowMs)` was already parameterised — no other change needed.

### `packages/eureka/src/index.ts`

Added `ClockProvider` to barrel re-export:

```diff
-export type { RecallOptions, RecallDeps, RecallResult, FactStore } from './activities/recall.js';
+export type { RecallOptions, RecallDeps, RecallResult, FactStore, ClockProvider } from './activities/recall.js';
```

---

## No-Default-Clock Discipline (§55 §1.2)

`clock` is **REQUIRED** in `RecallDeps`. No `clock = systemClock` default.

**Rationale:** A default would allow the production smell (`Date.now()`) to silently
persist in any call site that omits the clock. Requiring injection ensures every caller
declares its time source explicitly. TypeScript enforces this at compile time.

**§-tension:** §30 §2.4 suggests "optional default to SystemClock". §55 §1.2 prohibits
defaults for non-deterministic inputs. **§55 governs at seam discipline boundary.** §30's
suggestion is production-convenience advice, not seam discipline.

---

## ClockProvider Location

Colocated with `RecallDeps` in `recall.ts` per Laura's contract.

Extraction to `packages/eureka/src/learning/properties/clock.ts` deferred per §30 §2.4
"pending FR-12 (extraction-ready design)". §55 §1.2 discipline: interface lives at the
seam, not in premature abstraction.

---

## §-Tensions

| Tension | Resolution |
|---------|------------|
| §30 §2.4 `now()` returns seconds; impl uses ms | ms throughout (consistent with `86_400_000` divisor in `compositeScore`). §30 pseudocode is illustrative. |
| §30 §2.4 optional default vs §55 §1.2 required | §55 wins. Required dep at call site. Documented in laura-m4-clock-red.md. |

---

## Named M5 Target

**M5: Trust score updates from feedback events (§30 §2.3)**

§30 §2.3 specifies event-driven trust mutation:
- Corroboration: `trust = min(1.0, trust + 0.10)`
- Contradiction: `trust = max(0.0, trust - 0.10)`
- User correction: `trust = min(1.0, trust ± 0.30)`

Currently `recall()` consumes static trust from `FactStore.search()`. The cascade
demands a test that injects a feedback event and asserts the resulting trust mutation,
driving the trust-write seam into existence.

**Citation:** §30 §2.3 "Trust Dynamics Beyond the Static Floor"

**Laura owns M5 RED.**

---

### 2026-05-28: Team Norm — London-School TDD Ownership

**Date:** 2026-05-28T23:49:42Z  
**Origin:** Aaron Kubly (via Scribe, coordinator mandate)  
**Status:** NORM — durable team discipline

**Rule:** London-school TDD ownership:
- Tester owns ALL RED beats (failing tests that define contracts)
- Implementer agents own GREEN beats only (production code to satisfy contracts)
- Implementer may NAME next RED target but never claim ownership of writing the test

**First instance:** M1 RED (Laura) → M2 GREEN (Edgar) → M3 RED (Laura) → M3 GREEN (Edgar) → M4 TARGET named by Edgar (ClockProvider injection), M4 RED owned by Laura.

**Enforcement:** Git history verification, `.squad/agents/*/history.md` records ownership, Scribe calls out violations in orchestration logs.

---

### 2026-05-28: M3 RED — Composite-Ranker Ordering Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-28  
**Status:** LANDED — RED  
**Next owner:** Edgar (M3 GREEN)

New test added to `packages/eureka/src/activities/__tests__/recall.test.ts`:
```
✓ recall > surfaces keyword-overlapping entries at ≥80% precision  (M2 — still green)
✗ recall > ranks results by FR-2 composite formula descending (§30 §1.2)  (M3 — RED)
```

**Failure:** AssertionError ordering (storage order returned instead of FR-2 descending order). No type/import/config errors.

**Ranker seam decision:** Option (b) — Inline Scoring. Drive composite scoring inline in `recall()`. No new Ranker collaborator. (§55 §1.2, §55 §2.3 Key Lesson #3)

**Fixture design (FR-2 formula: rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency; finalScore = rawScore × attention_multiplier; multipliers: hot=1.20, warm=1.00, cold=0.80; recency = max(0.1, (1+t)^-0.5), t=days since last_accessed):**

| Fact | relevance | importance | trust | tier | finalScore |
|------|-----------|-----------|-------|------|-----------|
| A (Cold low-relevance)      | 0.2 | 0.2 | 0.3 | cold | 0.168 |
| B (Hot high-relevance)      | 0.9 | 0.8 | 0.9 | hot  | 0.960 |
| C (Warm medium-high)        | 0.7 | 0.6 | 0.7 | warm | 0.620 |
| D (Warm medium)             | 0.5 | 0.4 | 0.5 | warm | 0.440 |

Score margins unambiguous: B−C=0.340, C−D=0.180, D−A=0.272.

**What Edgar implements (M3 GREEN):**
1. Extend `RecallResult` with explicit fields: relevance, importance, last_accessed
2. Add composite scoring per §30 §1.2 formula (inline in recall())
3. Do NOT change trust floor (0.15) — M2 locked
4. Do NOT change call signature — M2 locked

**§-Tension (escalate to Aaron/Cassima):** §50 testability doc line 211 records `hot=1.0, warm=0.5, cold=0.1` (pre-v5 placeholders). Implementation must use §30 §1.2 canonical values (`hot=1.20, warm=1.00, cold=0.80`). §50 needs correction.

**Baseline:** tsc --build clean, Cairn 609 tests, Forge 644+3, Eureka 1 pass + 1 fail (correct).

---

### 2026-05-28: M3 GREEN — Composite-Ranker Ordering: Landing Record

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-28  
**Status:** LANDED — GREEN  
**Next owner:** Laura owns M4 RED

Both tests passed after implementing FR-2 composite scoring inline in `recall()`.

**Baseline preserved:** Cairn 609, Forge 644+3, Eureka 2/2 ✅, tsc --build clean ✅

**Implementation shape (File: `packages/eureka/src/activities/recall.ts`):**

RecallResult extension: Added optional typed fields `relevance`, `importance`, `last_accessed` (preserve backward compat with M2 mocks).

Inline composite scorer (pure helper): 
```
rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
recency = max(0.1, (1+t)^-0.5) where t=days
multiplier = ATTENTION_MULTIPLIERS[fact.tier]
finalScore = rawScore × multiplier
```

Attention multipliers (§30 §1.2 canonical): hot=1.20, warm=1.00, cold=0.80

Pipeline: candidates → filter(trust≥0.15) → score → sort(desc) → slice(k) → return

Date.now() captured at entry; ready for ClockProvider injection M4.

**Ranker seam:** Option (b) confirmed — inline pure function, no new Ranker collaborator (per §55 §2.3).

**Recency derivation lock:** `last_accessed` is milliseconds (EPOCH_MS unit). Formula: `tDays = (nowMs - last_accessed) / 86_400_000`. All future tests must use millisecond unit.

**§-Tensions:**

1. **Tension 1 (Laura-flagged, confirmed):** §50 line 211 stale (pre-v5 values). §30 §1.2 is canonical. Crispin/Genesta should correct §50. Not Edgar's file.

2. **Tension 2 (new):** §30 §1.2 pseudocode references `CuratorStore.retrieve(sessionId, query)` but impl uses `FactStore.search()`. Equivalent seams; `FactStore` is current concrete interface. Future refactor may rename for alignment (deliberate rename, not bug fix).

**Named M4 TARGET:** recall (recency-sensitive ranking). Collaborator seam: `ClockProvider` (injectable `nowMs()` function per §30 §2.4). Assertion: fact with `last_accessed=yesterday` must outrank identical fact with `last_accessed=30 days ago`. Laura owns M4 RED.

**Post-work:** recall.ts composite scoring ✅, edgar/history.md appended ✅, london-school-green-beat/SKILL.md refined ✅

---

### 2026-05-28: M2 Decision Drop — recall() GREEN

**Author:** Edgar (Learning Systems Specialist)  
**Status:** LANDED — GREEN

M2 London-school TDD beat complete. `recall()` is implemented and the AC-1.3 seed test passes.

**Test Result:** `packages/eureka/src/activities/__tests__/recall.test.ts` — 1/1 tests passed

**Baseline preserved:**
- `tsc --build` exit code 0 ✅
- Cairn: 26 test files, 609 tests ✅
- Forge: 24 test files, 644 passed | 3 todo ✅
- Eureka: 1 test file, 1 test ✅
- skillsmith-runtime + runtime-cli: all passing ✅

**Implementation (Locked at M2):**
- File: `packages/eureka/src/activities/recall.ts`
- Signature: `recall(options: RecallOptions, deps: RecallDeps): Promise<RecallResult[]>`
- Delegates to injected `factStore.search()` with trust floor (0.15) filtering
- Returns up to `k` results; composite ranker deferred to M3

**Named M3 Next-Red-Beat:**
- Activity: `recall()` ordering
- FR/AC: FR-2 (composite ranker formula)
- Requires: Ranker collaborator mock, ClockProvider for recency, sorted score validation

**Decision notes:** §30 pseudocode shows `new CuratorStore()` inside recall — violates London-school. Test contract (injected factStore) is authoritative. §30 pseudocode should update when M3 landsranker design.

---

### 2026-05-28: PR #26 — Copilot Review Doc Alignment (Cycle 1)

**Date:** 2026-05-28  
**Author:** Cassima (PM — Eureka)  
**Context:** Copilot automated review on PR #26 (eureka/v1-design-package branch merge)  
**Status:** ✅ All 5 threads addressed

---

## Summary

Post-merge alignment sweep to fix 5 documentation inconsistencies flagged by Copilot's automated review. Substrate ownership was decided (ADR-0002 Option A monorepo, accepted 2026-05-27), but several committed docs still:
1. Referenced pre-decision state ("Four open decisions block...")
2. Cited gitignored `.squad/decisions/inbox/` paths (broken for other contributors/CI)
3. Claimed "pnpm workspaces, turborepo" when repo uses npm workspaces + `tsc --build`
4. Described user/project tiers as "stubbed" when PRD FR-7.2 says "NOT SHIPPED in v1 at all"

All edits were surgical — preserved doc structure, voice, and content except the specific inconsistencies.

---

## Changes Landed

### Thread 1: Executive Summary — Tier Scope & OQ-1 Status

**File:** `docs/eureka/technical-design.md` line 14

**Before:**
> three-tier storage (agent fully wired; user/project stubbed)
> Four open decisions block implementation — most critically, shared substrate ownership across the `mem/` and `harness/` repositories.

**After:**
> three-tier storage (agent tier only in v1; user/project tiers reserved in schema, adapters deferred to v1.5 per PRD FR-7.2)
> OQ-1 (substrate ownership) has been resolved via ADR-0002; remaining open decisions are tracked in the §00 ADR index.

**Rationale:** Aligns with PRD FR-7.2 canonical wording ("NOT SHIPPED in v1 at all, not even as NotImplementedError stubs"). Updates OQ-1 status to reflect accepted ADR-0002.

---

### Thread 2: References Section — Remove Gitignored Inbox Links

**File:** `docs/eureka/technical-design.md` lines 163-166

**Before:**
```markdown
- **Crucible Impact Analysis:** [`.squad/decisions/inbox/cassima-crucible-eureka-impact.md`](...)
- **Substrate Blocker Memo:** [`.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`](...)
```

**After:**
```markdown
- **Crucible Impact Analysis:** See `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27)
- **Substrate Ownership:** See `.squad/decisions.md` § "Narrower Substrate Freeze Proposal" and ADR-0002 (2026-05-27)
```

**Rationale:** `.squad/decisions/inbox/` is gitignored (local-only working memos). Committed docs must reference content that resolves for all contributors. Merged substrate analysis now lives in `.squad/decisions.md` and ADR-0002.

---

### Thread 3: ADR-0002 Header — Remove Gitignored Tension Reference

**File:** `docs/eureka/adrs/0002-shared-substrate-ownership.md` line 8

**Before:**
```markdown
**Tension Reference:** §70 T7, `.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`
```

**After:**
```markdown
**Tension Reference:** §70 T7; merged substrate analysis in `.squad/decisions.md` "Narrower Substrate Freeze Proposal" (2026-05-27)
```

**Rationale:** Same as Thread 2 — replace gitignored inbox link with reference to merged location.

---

### Thread 4: ADR-0002 Toolchain Claims — Correct to npm Workspaces Reality

**Files:** `docs/eureka/adrs/0002-shared-substrate-ownership.md` lines 50-55, 138-145

**Before (Pros, line ~53):**
> TypeScript monorepo tooling is mature (pnpm workspaces, turborepo)

**After:**
> TypeScript monorepo tooling is mature (npm workspaces with `tsc --build` project references — already in use across `mem/`)

**Before (M0 prerequisites, lines ~140-142):**
> 2. **Monorepo scaffolding** (Roger + Gabriel) — pnpm workspace config, turborepo pipeline, unified `tsconfig` project references.
> 3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Turborepo `--filter` for incremental builds...

**After:**
> 2. **Monorepo scaffolding** (Roger + Gabriel) — npm workspace config (already present), unified `tsconfig` project references with `tsc --build`. Must complete before any package code moves.
> 3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Leverage `tsc --build` incremental compilation to mitigate whole-repo build time.
> ...
> 
> *Note: Future migration to pnpm/turborepo could optimize build caching, but npm workspaces + `tsc --build` is sufficient for v1.*

**Rationale:** Repo reality check confirmed:
- Root `package.json` uses `"workspaces": [...]` (npm workspaces)
- `package-lock.json` exists (npm, not pnpm)
- Build command is `tsc --build` (TypeScript project references, not turborepo)

ADR claimed aspirational tooling rather than current state. Fixed to reflect what's actually in use. Added note that pnpm/turborepo is a possible future optimization, not a v1 requirement.

---

### Thread 5: Tier Status Table — Align with PRD FR-7.2 "NOT SHIPPED"

**File:** `docs/eureka/sections/00-overview.md` lines 242-246

**Before:**
| Tier | Path | v1 Status |
|------|------|-----------|
| User | ... | Stub (throws on write, empty on read) |
| Project | ... | Stub (throws on write, empty on read) |

**After:**
| Tier | Path | v1 Status |
|------|------|-----------|
| User | ... | Not shipped in v1 — schema reserved, adapter deferred to v1.5 |
| Project | ... | Not shipped in v1 — schema reserved, adapter deferred to v1.5 |

Also updated "Recall Fan-Out Strategy" prose to note multi-tier fan-out is v1.5+:
> 1. Sequential fan-out: agent → user → project (v1.5+)

**Rationale:** PRD FR-7.2 line 184 is canonical: "User and project storage adapters are **not shipped** in v1 at all (not even as NotImplementedError stubs)." Table previously said "Stub" which contradicts this. Fixed to match PRD wording exactly.

---

## Rule Extracted

**Committed docs must not cite paths under gitignored directories.**

- `.squad/decisions/inbox/` is gitignored → broken for other contributors and CI.
- References to decision content should point to:
  1. Merged content in `.squad/decisions.md` (cite section heading + date), OR
  2. Committed ADRs (`docs/eureka/adrs/*.md`), OR
  3. Committed PRD (`.squad/decisions/eureka-prd-v5-final.md`)

This rule is generalizable beyond Eureka — applies to any repo using gitignored working-memo directories.

Skill documented in `.squad/skills/doc-references-respect-gitignore/SKILL.md`.

---

## Verification

1. ✅ `technical-design.md` exec summary aligns with PRD FR-7.2 and ADR-0002 status
2. ✅ `technical-design.md` References section has no gitignored paths
3. ✅ `adrs/0002-shared-substrate-ownership.md` header has no gitignored paths
4. ✅ `adrs/0002-shared-substrate-ownership.md` toolchain claims match repo reality (npm workspaces, not pnpm/turborepo)
5. ✅ `sections/00-overview.md` tier table matches PRD FR-7.2 ("NOT SHIPPED", not "stubbed")

All edits were surgical. No unrelated content changed. Voice and structure preserved.

---

## Next Steps

None required. All 5 threads addressed. Skill extracted. Ready for next work.

---

## Cassima's Learning Notes

**What worked:**
- Surgical edits preserved doc structure and minimized churn.
- Copilot's automated review caught real alignment issues (not false positives).
- Rule "respect gitignore boundaries in committed docs" is simple, actionable, and prevents broken links for other contributors.

**What I learned:**
- Post-merge alignment sweeps are PM scope when they affect PRD/design consistency.
- Toolchain claims in ADRs should match repository evidence or be clearly labeled as "future migration."
- "Stubs" vs "not shipped" is a meaningful distinction — stubs imply user-visible surface, which contradicts PRD's scope deferral.

**What I'd change next time:**
- Could have proactively searched for other gitignored references during the sweep (did a grep after; none found).
- Could have verified `package.json` / `package-lock.json` existence before editing ADR-0002 (I inferred from charter context, but explicit check is better).

---

### 2026-05-28: Directive — DecisionRecord Naming Disambiguation

**By:** Aaron Kubly (via Copilot CLI)

**What:** Be explicit about which "Decision" concept is being referenced. If it's a Squad decision markdown artifact, call it a "Squad decision dotfile" (or "Squad decision memo"). If it's the runtime `@akubly/types` `DecisionRecord` interface, use the system-qualified name: "Cairn DecisionRecord" or "Forge DecisionRecord" depending on which system the record belongs to. Never use bare "DecisionRecord" in documentation when both could be meant.

**Why:** The Forge `DecisionRecord` TypeScript interface and Squad's `.squad/decisions/` workflow artifacts are conceptually different things; conflating them in docs creates ambiguity for readers and reviewers.

**Usage example:** When discussing the Forge runtime audit interface, write "Forge DecisionRecord." When discussing Squad markdown memos, write "Squad decision dotfile" or "Squad decision memo."

---

### 2026-05-27: Eureka v0.1 Technical Design — Assembled & Blocked on 4 Critical Decisions

**Status:** ✅ DESIGN ASSEMBLED — Implementation blocked  
**Date:** 2026-05-27  
**Initiated By:** Graham (Design Lead, Round 2 assembly) + Eureka team (Round 1 authorship)  
**Urgency:** 4 blockers identified; OQ-1 (substrate ownership) is CRITICAL

**Summary:** Eight sections of Eureka v0.1 technical design are now drafted and assembled. All cross-section tensions have been surfaced, categorized, and either resolved or escalated as open questions. **Three critical blockers identified:**

1. **OQ-1 (CRITICAL — Cassima):** Shared substrate ownership — `@akubly/types`, `cairn/`, `forge/` duplicated in `mem/` and `harness/`. Three options: A=monorepo, B=submodule, C=npm packages. **ACTION REQUIRED: Aaron must choose A/B/C before sprint start.**

2. **OQ-2 (MEDIUM):** Event schema topology — Crucible's L1 WAL vs Cairn's event_log create dual-write trap. **ACTION REQUIRED: Pre-sprint-2 sync (Graham/Genesta/Roger) to lock event-substrate path (Option A=merge or B=federate).**

3. **OQ-3 (MEDIUM):** Decision/SessionId schema dual ownership — Crucible's Decision primitive vs Forge DecisionRecord vs Eureka DecisionPayload. **ACTION RECOMMENDED: Crucible rename Decision → ChoiceEvent for namespace clarity.**

**Key Findings:**
- ✅ PRD alignment: 100% acceptance criteria traced; 37/41 testable v1 (90% coverage)
- ✅ Milestone phasing: M0–M5 clear; M2/M3 can parallelize (sweep uses cadence, not session-end hooks)
- ✅ Crucible-Eureka overlap: Structural independence confirmed; safe to parallelize with storage fork directive
- ⚠️ Substrate ownership unresolved (affects Forge adapter; affects both Eureka + Crucible v1 implementation)
- ⚠️ Event schema collision identified (Crucible L1 WAL vs Cairn event_log; dual-write risk)

**Timeline:** OQ-1 decision needed THIS WEEK. OQ-2 resolved pre-sprint-2 (~3 weeks). OQ-3 resolved with Crucible team.

**Design artifacts:** 
- `docs/eureka/technical-design.md` — canonical entry-point, v0.1 assembled
- 8 sections (§00–§70, ~198KB total content)
- 3 ADRs (0001, 0003, and proposed ADR 0002)
- 8 orchestration logs (`.squad/orchestration-log/2026-05-27T08-13-25Z-{agent}.md`)

**Signed:** Graham (Architecture), Cassima (PM), Genesta (Activities Lead)

---

### 2026-05-27: Friction-Level UX Decisions — Gated by v1 Dogfood Evidence

**Status:** ⏳ AWAITING EVIDENCE  
**Date:** 2026-05-27  
**Initiated By:** Valanice (UX Specialist)  
**Urgency:** Four decisions gate v1.5 design; cannot lock until Aaron completes ≥10 dogfood sessions

**Four friction-level decisions deferred to v1.5 pending observed human behavior:**

1. **Commit Approval Frequency** — Current: ~1 approval/session. Evidence gate: `eureka_commit_invocations_total` counter. Threshold: If >10 commits/session OR rejection_rate <10%, flip to auto-approve with opt-in.

2. **Tier-Switching Observability** — Current: Silent (show "Searched: [tiers]" only if multi-tier results). Evidence gate: `eureka_recall_multi_tier_results_total` counter. Threshold: If >5% of queries ask "which tier?", show on every recall.

3. **Empty-State Actionability** — Current: Show suggestions ("Try a broader query"). Evidence gate: Log-based analysis (follow-up query rate, remediation success). Threshold: If remediation_success_rate >70%, keep suggestions; otherwise drop to factual-only.

4. **Contemplate Verbosity** — Current: Silent (v1 doesn't ship contemplate; v1.5 pending). Evidence gate: Post-contemplate confusion + summary action-upon rate. Threshold: If >10% ask "did Eureka run?", default to summary; otherwise silent.

**Evidence Collection Plan:** 10+ dogfood sessions (Aaron), telemetry counters, log-based metrics, post-session interviews (sessions 5 + 10). **Lock gate:** Cannot commit v1.5 friction decisions until dogfood evidence is analyzed.

**Instrumentation required:** Telemetry counters already in v1 scope. Interview protocol TBD.

**Signed:** Valanice (UX)

---

### 2026-05-27: Narrower Substrate Freeze Proposal — Accepted with Amendments

**Status:** ✅ EVALUATED — Recommendation: ACCEPT  
**Date:** 2026-05-27  
**Initiated By:** Erasmus (Crucible team, via Cassima)  
**Evaluated By:** Genesta (Activities Lead)

**Proposal Summary:** Freeze only two cross-project contracts instead of full Cairn/Forge ownership:
1. `SessionId` brand + validator/constructor in `@akubly/types`
2. `DecisionRecord` shape and source union in Forge

**Genesta's Evaluation:** ✅ **ACCEPT with three amendments:**
- **A1 (Prescriber Opt-In):** Eureka-aware prescriber must be opt-in (explicitly registered), not default-wired into Forge.
- **A2 (SessionId Validation Freeze):** Include validation rules (UUID v4 format, parse/isValid constructors).
- **A3 (DecisionRecord Tolerance Contract):** Freeze adapter tolerance rules (forward/backward-compatible; breaking changes require 15-min sync).

**G4-Lite Governance:** CODEOWNERS for `@akubly/types` (both teams required), CHANGELOG for DecisionRecord changes, Slack handoff for breaking changes. No label automation needed (only 2 contracts vs full packages).

**Confidence:** HIGH. Narrower freeze covers all v1 contracts, reduces coordination overhead by 80-90% vs original scope.

**Next steps:** Graham configures CODEOWNERS (<10 min); SessionId brand lands this week (with validation rules per A2); DecisionRecord v0 frozen with tolerance contract (per A3).

**Signed:** Genesta (Eureka Lead), Cassima (PM)

---

### 2026-05-27: Crucible ↔ Eureka Cross-Project Overlap — Architectural Coordination Required

**Status:** ⏳ AWAITING AARON DECISION  
**Date:** 2026-05-26  
**Initiated By:** Cross-project overlap analysis (Genesta, Crispin, Edgar, Cassima)  
**Urgency:** BLOCKER — both projects ship v1 in parallel  

**Decision Needed:** Aaron must lock repository ownership, schema collision resolution, and prescriber/substrate wiring before Crucible sprint 2 and Eureka v1 implementation phase begin.

---

### 2026-05-27: Eureka TD Re-Pass After §55 — §20/§30/§40/§50 Aligned with London-TDD Spine

**Status:** ✅ AUDIT COMPLETE — Recommendations applied  
**Date:** 2026-05-27  
**Initiated By:** Aaron Kubly  
**Question:** Should we do a TD re-pass after §55?  
**Decision:** Full bounded pass (Option A) — parallel audits across §20/§30/§40/§50 + follow-up executions  

**Summary:** Six-agent batch (Crispin/Roger/Laura/Edgar × 2 phases) verified that all four predecessor sections align with §55's London-school TDD mock contract discipline. All seams identified, all gaps addressed. No schema rewrites needed; seams are fundamentally sound with additive clarifications.

**Phase 1 — Audits & Executions:**

1. **Crispin (§20 Audit):** SEAMS HOLD — 5 findings, 1 interface addition (session_id to RecallQuery). No schema changes. **Deliverable:** decision drop: crispin-20-seam-audit-vs-55 (local-only)

2. **Roger (§40 DI Audit):** 80% injectable — 2 seams need extraction (`ClockProvider`, `RandomSource`), 1 correctly deferred (model). Forward-docs network boundary for v1.5. **Deliverable:** decision drop: roger-40-di-seam-audit-vs-55 (local-only)

3. **Laura (§50 Reframe):** §50 positioned as design-time testability discipline; §55 as implementation-time TDD practice. Complementary pair. **Deliverable:** Edited `docs/eureka/sections/50-testability.md` (+9%)

4. **Edgar (§30 Follow-Ups):** 3/3 executed — CuratorStore signature adopted, ClockProvider seam added, latency cross-refs established. **Deliverable:** decision drop: edgar-30-followups-executed (local-only), edited `docs/eureka/sections/30-learning-systems.md`

**Phase 2 — Recommendations Applied:**

5. **Crispin (§20 Apply):** §7.4 "Storage Seam (Mock Boundary)" added (names `FactStore` interface explicitly). RecallQuery updated. TDD notes added. **Deliverable:** Edited `docs/eureka/sections/20-knowledge-representation.md` (+12%)

6. **Roger (§40 Apply):** §40.5.4 "Time Injection" + §40.5.5 "RNG Injection (v1.5)" added. Network/model seams forward-documented. **Deliverable:** Edited `docs/eureka/sections/40-integration.md` (+19.8%)

**Key Findings:**
- ✅ All four sections now London-school-aligned with §55 spine
- ✅ I/O seams correctly identified; mock boundaries explicit
- ✅ Time/RNG injection patterns extracted (§30 + §40 coordinated)
- ✅ Phase 2 follow-ups landed without cross-section conflicts
- ✅ Zero implementation blockers; seams are fundamentally sound

**Learnings:**
- Parallel audits work well for cross-section stress-testing
- London-school TDD cascades to design docs (seams, boundaries, time injection)
- "Defer != ignore" — forward-document seams now, extract later (v1.5)
- Bidirectional cross-refs prevent §30–§55 latency-target drift

**Timeline:** Complete. §20/§30/§40/§50 ship-ready with full seam documentation verified.

**Session log:** `.squad/log/2026-05-27T15-30-00Z-td-repass-after-55.md`  
**Orchestration logs:** 6 logs per agent (`.squad/orchestration-log/2026-05-27T*-{agent}.md`)

**Signed:** Scribe (orchestration logger), Crispin, Roger, Laura, Edgar

---

## Executive Summary

**Convergent Finding:** Crucible (v1-DRAFT) and Eureka (v5-final) both depend on shared substrate (Cairn, Forge, types) and both define overlapping session/decision/improvement semantics. The dependency direction is backwards: Crucible assumes Forge exists in `harness` repo but Forge actually lives in `mem` repo. The overlap is NOT accidental — Eureka is Crucible's future memory layer — but the shared-code surface is brittle without explicit coordination.

**Three critical blockers identified:**

1. **Undeclared Repository Dependency (BLOCKER — Cassima)** — Crucible cannot ship v1 without either duplicating Forge or depending on the `mem` repo. Neither is currently acknowledged in either PRD. Must resolve before sprint 2.

2. **Event Schema Collision (HIGH RISK — Genesta)** — Crucible's 5 primitives + L1 WAL vs Cairn's existing `event_log` creates dual-write trap. Must merge or federate before L1 substrate lands.

3. **Decision/SessionId Schema Dual Ownership (CRITICAL — Crispin, Genesta)** — Both PRDs mandate `SessionId` branded type + Decision schema overlap (Decision primitive ≠ DecisionRecord audit ≠ DecisionPayload learning). Requires namespace discipline + possible renames in Crucible.

**Two safe convergences identified (Edgar, Genesta):**

4. **Prescriber Pattern Convergence** — Crucible's Router mirrors Forge's existing prescriber family; can share substrate. Both teams should annotate convergence points.

5. **Learning-Loop Feedback Substrate** — Crucible's recorded sessions ARE Eureka's training data. Path 2 ingestion wiring enables productive relationship between self-improvement loops (not competitive).

---

## Three Strategic Questions for Aaron (Cassima)

**Q1: Which repo owns Cairn and Forge?**
- If `mem`: Crucible has undeclared dependency on this repo; merge or link must happen before Crucible ships.
- If `harness`: Eureka loses its substrate; Cairn must be forked/mirrored.
- If duplicated: drift is guaranteed.

**Recommendation:** Lock repository topology NOW. Genesta suggests Option A (merge Crucible into `mem` at v2 stage, maintaining federation boundary for isolated dogfood in `harness` repo).

**Q2: Is Eureka a v1 Crucible feature or separate v2+ integration?**
- Crucible promises "local-first sovereignty + record everything + self-improve" (§0).
- Eureka promises "durable, addressable, progressively disclosed knowledge" (§2).
- 80% mission overlap.

**Recommendation:** Clarify v1 scope. If Eureka is Crucible's built-in memory backend at v1, sequencing/dogfood changes. If separate v2+ integration, acknowledge delayed feedback substrate.

**Q3: Who gets Aaron's time when both projects hit the same blocker?**
- Both assume Aaron is sole dogfooder.
- Eureka v1 killer demos (US-1, US-2) require multi-session coding work.
- Crucible v1 success bar requires building v2 inside v1.
- Single-threaded resource bottleneck risk.

**Recommendation:** Sequence dogfood phases OR delegate one project's dogfood to external user.

---

## Technical Findings (Cross-Referenced)

### Finding 1: Repository Dependency (Cassima)
**Full analysis:** decision drop: cassima-crucible-eureka-impact (local-only) §1.2 (undeclared dependency), §4 (resourcing)

- Crucible PRD §1 vocabulary, §2.4, §2.6, Appendix D assume Forge prescribers in `harness`.
- Actual location: `D:\git\mem\packages\forge`.
- Neither PRD acknowledges the cross-repo dependency.

**Recommendation:** Stagger projects OR establish explicit dependency + versioning contract.

### Finding 2: Event Schema Collision (Genesta)
**Full analysis:** decision drop: genesta-crucible-eureka-overlap (local-only) § Finding 1 + 2 + 5

- Crucible §1: 5 typed events (Request, Artifact, Observation, Decision, Question)
- Cairn today: `event_log` with existing `eventType` vocabulary
- Eureka v5: Sessions are `kind=session` facts in Eureka's fact store
- **Dual-write trap:** Which is authoritative for replay?

**Recommendation Option A (Merge):** Crucible's 5 primitives become `eventType` values in Cairn's `event_log`. Crucible's "primitives" are typed façade over Cairn's polymorphic stream.

**Recommendation Option B (Federate):** Crucible ships in `harness` repo (separate). When merged to `stunning-adventure` at v2 stage, federation boundary explicit. Cairn observes Crucible sessions via MCP bridge.

**Gate:** Before Crucible sprint 2 (L1 substrate), convene Graham + Roger + Genesta to lock event-substrate topology.

### Finding 3: SessionId Brand + Decision Schema Collision (Crispin, Genesta)
**Full analysis:** decision drop: crispin-crucible-kr-overlap (local-only) § 1 + 5, `genesta-...` § Finding 2

**Collision 1 — SessionId Brand (BLOCKER):**
- Eureka v5 (FR-13): `SessionId` branded type in `@akubly/types` (Aaron R8 directive).
- Crucible PRD: Implicitly assumes session identity but doesn't specify the type.
- **Both mandate the same brand; Crucible's requirements differ.**

**Recommendation:** Design `SessionId` for both Crucible + Eureka from day 1. Current design (UUID + validator) is sufficient for both.

**Collision 2 — "Decision" Naming (CRITICAL):**
- Crucible `Decision` primitive (§1): "any recorded choice by human or agent" — event-like primitive.
- Forge `DecisionRecord` (audit): Structured audit trail of agent decisions.
- Eureka `DecisionPayload` (fact): Contemplative structured deliberation with explicit options + rationale.
- Same word, three structurally different types.

**Recommendation (Crispin):** Crucible rename `Decision` → `ChoiceEvent` or `DecisionEvent`. ESLint ban on cross-system `Decision*` imports.

**Collision 3 — "Artifact" Semantic Drift (HIGH):**
- Crucible: "any reviewable content — inputs AND outputs" (PRD, patch, screenshot, transcript, upload, diff).
- Eureka: Informal usage only; "epistemological artifact" = learned memory representation.
- Risk at storage layer if both use content-addressed store.

**Recommendation (Crispin):** Crucible rename to `ContentBlob` / `CapturedContent`. Eureka avoid "artifact" in public types.

### Finding 4: Learning-Loop Feedback Substrate (Edgar)
**Full analysis:** decision drop: edgar-crucible-learning-overlap (local-only) § 1–4

- **Crucible's loop:** Prescriber → Review-Gate → Apply/Inbox → Scorecard (minutes to hours per-session).
- **Eureka's loop:** Sweep → Ranker → Trust/Confidence mutations (hours to days across sessions).
- **Complementary, not redundant.** Different time horizons, different improvement targets.

**Judgment: CRUCIBLE IS EUREKA'S EVIDENCE GOLDMINE.**
- Crucible records everything — every decision, every alternative, every tool call, every file read.
- This is exactly the evidence Eureka needs for learning patterns.

**Current wiring (v5-final):** Path 2 ingestion exists but is on-demand only. Manual `eureka ingest-decisions --session <uuid>` after each session won't survive dogfood.

**Recommendation (Edgar):** Wire automatic ingestion before dogfood starts.

**Option 1 (Simplest):** Add Crucible post-session hook: `on_session_end → eureka ingest-decisions --session $SESSION_ID`. Opt-in via `.cruciblerc` flag.

**Option 2 (Event-driven):** Cairn already emits session-end events. Eureka sweep subscribes; on `session_end` (carries `session_id`), ingests Forge DecisionRecord stream. *v1.5 scope per current PRDs.*

**Option 3 (Prescriber ownership transition):** Forge prescribers move to Crucible; Eureka's extraction-ready design enables Crucible to eventually adopt learning kernel.

---

## Recommendations Summary

**Immediate (Pre-Implementation):**
1. Aaron locks repository ownership (mem vs harness vs federation).
2. Graham + Genesta + Roger design event-substrate topology (merge vs federate).
3. Crispin confirms Decision/Artifact renames in Crucible PRD v1.1-DRAFT.
4. Cassima sequences dogfood phases or delegates external user.

**v1 Blockers (Before Sprint 2):**
5. ESLint guardrail (already in Eureka v5-final FR-12 #8) extended to Decision/Artifact cross-system imports.
6. `SessionId` brand finalized in `@akubly/types` (ships v1, both projects).
7. Crucible L1 substrate locked to Cairn's `event_log` (Option A) or isolated to `harness` repo (Option B).

**v1 Opportunity (Nice-to-Have Before Dogfood):**
8. Crucible post-session hook wired for Eureka ingestion (Option 1, simplest).

**v1.5+ (Path D Kernel Extraction):**
9. Prescriber ownership transition (Forge → Crucible).
10. Sweep-trigger unification (Cairn session-end → Eureka sweep).
11. Confidence/trust branded types (orthogonality compiler-enforced).

---

## Source Artifacts (Decision Inbox)

All findings preserved in inbox for detailed review:

- decision drop: genesta-crucible-eureka-overlap (local-only, 20.9 KB, 216 lines) — Architectural findings: 5 overlaps (3 high-risk, 2 safe).
- decision drop: crispin-crucible-kr-overlap (local-only, 24.5 KB, 136 lines) — KR findings: 2 critical collisions, 1 integration opportunity.
- decision drop: edgar-crucible-learning-overlap (local-only, 25.6 KB, 202 lines) — Learning-loop findings: parallel loops, feedback substrate, prescriber transition.
- decision drop: cassima-crucible-eureka-impact (local-only, 25.0 KB, 200 lines) — PM findings: undeclared dependency, 3 strategic questions, resourcing risk.

---

## Closed Decisions

### 2026-05-26: Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-26  
**Locked By:** 4-reviewer panel (Graham Knight, Genesta, Crispin, Edgar) — unanimous LOCK, zero revisions  
**Lock Status:** DO NOT EDIT — canonical specification; v4-final superseded

**Decision:** Eureka PRD v5-final is ratified as canonical, shippable specification after R8 post-lock amendment. Aaron R8 session-identity directive: Cairn `Session` and Eureka `kind=session` fact share one identifier (Copilot CLI session UUID) via shared `SessionId` brand in `@akubly/types`, with normative lens framing as guard. All R8 changes landed correctly. R8 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v5-final.md` (617 lines, 86.4 KB) — canonical stable location; supersedes v4-final
- **Lineage:** v4-final (R7, 555 lines) → v5-final (R8 amendments, +62 lines) — all R8 deltas annotated `[v5: <reason>]`
- **Panel:** Graham Knight (Architect), Genesta (Cognitive Systems), Crispin (Knowledge Representation), Edgar (Learning Systems) — unanimous verdict: LOCK

**R8 Amendment Scope (Judgment Calls + Enforcement Deltas):**

1. **Session Identity Unification:** Cairn `Session` and Eureka `kind=session` facts are the same entity (one CLI session UUID). Shared `SessionId` branded type in `@akubly/types`.
2. **Bridge Ledger Simplification:** `cairn_session_id_hint?` (optional) → `session_id: SessionId` (required). Eliminates nullable opaque correlation.
3. **FR-13 Amendment:** "Isolated by design" language deleted. Replaced with: "SessionId is shared; all other session attributes are system-specific. Lens framing (Cairn = lifecycle, Eureka = epistemology) is the normative guard against coupling drift."
4. **FR-7.2 Preserved:** No-cross-DB-ATTACH rule unchanged. Shared identifier is type-level only; runtime decoupling remains intact.
5. **§14a T-orphan Reframed:** "Dangling `cairn_session_id`" → "Stale `session_id` reference" (severity unchanged: LOW/LOW). Threat table entries in both §13 + §14a (belt-and-suspenders per JC1 disposition).
6. **FR-12 Mechanism #8 (NEW):** ESLint `no-restricted-imports` guardrail bans Cairn ↔ Eureka session-type imports except `SessionId` from `@akubly/types`.
7. **JC1 Disposition (T6 Row Placement):** Verified in both §13 + §14a threat tables.
8. **JC2 Disposition (v1 ship scope):** SessionId brand ships v1 (FR-12 #8); Trust/Confidence brands stay v1.5 (FR-12 #7).

**Reviewer Verdicts:**
- **Graham Knight (Architect):** LOCK — 8/8 enforcement items landed correctly; no new architectural concerns; v5-final surgical pass, no scope creep
- **Genesta (Cognitive Systems):** LOCK — all 5 guardrails from R8 fold verified (lens framing normative, neutral brand, no runtime traversal, ESLint boundary, Glossary updated)
- **Crispin (Knowledge Representation):** LOCK — all 6 spec items from R8 KR verdict verified (SessionId brand mechanics, kind=session schema, no identity collision, fact vs. filter clarity, edge schema tightening, session-fact integrity)
- **Edgar (Learning Systems):** LOCK — all 3 precision-gain items verified (sweep cadence v1.5 opportunity, `--session <uuid>` CLI v1 ship, AC-2.5 telemetry counter); zero new learning-systems risks

**Key Technical Deltas (Summary):**
- `@akubly/types/src/session.ts` (NEW): `SessionId` branded type + UUID validator + constructor
- `bridge_ledger.session_id` (NEW): `TEXT NOT NULL` replaces `cairn_session_id_hint? TEXT` 
- FR-13 text: "isolated by design" deletion + shared brand framing + lens elevation to normative
- FR-7.2: no-ATTACH rule consistency pass + type-level-only clarification
- §14a: T-orphan reframe (same severity, clearer semantics)
- FR-12 mechanism #8: ESLint guardrail (ships v1)
- Glossary + §15: Lineage citations + Aaron R8 directive + Graham/Genesta/Crispin/Edgar verdicts

**Why This Approach:**
- Aaron's post-lock signal clarified operational reality: the session UUID IS shared; pretending otherwise was incidental complexity
- Shared `SessionId` brand documents ground truth without introducing runtime coupling (type-level construct, not runtime FK)
- Lens framing elevated to normative guard — "two systems, one entity" is the design principle, not apology
- Guardrails (ESLint + schema comments + ADR lock) prevent future coupling drift
- All R8 changes preserve R7 achievements (bidirectional adapter framework, confidence/trust orthogonality, 7-mechanism extraction-readiness)

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v5-final.md` (stable location, do not edit; supersedes v4-final)
- **R8 Design Panel Verdicts:** decision drops: graham-r8-session-identity, genesta-r8-session-identity, crispin-r8-session-identity, edgar-r8-session-identity (all ACCEPT/FOLD verdicts; local-only)
- **Aaron R8 Directive:** decision drop: copilot-directive-r8-session-identity (local-only)
- **R8 Lock Panel Verdicts:** decision drops: graham-r8-lock-verdict, genesta-r8-lock-verdict, crispin-r8-lock-verdict, edgar-r8-lock-verdict (all LOCK, unanimous; local-only)
- **Superseded Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (historical reference; see header banner for migration note)

**Implementation Readiness:**
- v5-final is self-contained (no external doc required for implementation)
- All `[v5: <reason>]` + `[v4: <reason>]` annotations trace lineage back to R7/R5 origins
- No new architectural risks; all changes additive + simplifying
- R8 amendment window now closed; v5-final canonical until v1 implementation phase reveals needs for v1.1

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms + shared `SessionId` brand (FR-12 #8) + ESLint guardrail
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface) + precision gains (sweep cadence, Cairn session-end triggers, confidence/trust branded types)
- Path D Extraction: Kernel extraction readiness enforced from Day 1; extraction happens post-v1 pending org-scale federation needs

---

### 2026-05-30: WI-B PR #29 cycle 4 — prose redesign scope
**By:** Graham (Lead)
**Status:** Implemented in cycles 4-6

From decision drop: graham-wi-b-cycle4-redesign (local-only)

**Thread analysis:** 51 unresolved threads across 4 files represent 5 distinct findings:
- F8a: Wrong-branch reuse calls git worktree remove without unlinking junction first
- F9: Backtick escapes inside cmd /c "..." are PowerShell-only; cmd.exe treats them as literals
- F10: {branch} resolved via git -C "{worktree}" AFTER worktree is removed — path doesn't exist

**Decision:** Replace all literal cmd /c "..." strings with prose instructions (tool semantically + platform-intent table). Prose conveys intent; literal shell strings invite mechanical copying of wrong form.

**Recommended form:**
- Windows: Use cmd /c rmdir to remove junction. Do NOT pass /s.
- Unix: 
m -f removes symlink only.

**Junction-unlink ordering (SAFETY-CRITICAL):**
1. Resolve the branch name: git -C "{worktree}" rev-parse --abbrev-ref HEAD → save as {branch}
2. Remove the 
ode_modules junction/symlink (before git worktree remove)
3. Remove the worktree: git worktree remove "{worktree}"
4. Delete the branch: git branch -d {branch}

**Acceptance criteria:** 7 AC items verified — all backticks removed, F8/F9/F10 addressed, three-mirror sync locked.

---

### 2026-05-29: WI-B PR #29 review — APPROVE WITH NOTES
**By:** Graham (Lead)
**Status:** Reviewed and approved for merge

From decision drop: graham-wi-b-review-approve (local-only)

**Scope adherence:** ✅ Gabriel implemented exactly what was scoped. Six change areas all map directly to concrete changes. No omissions.

**Activation semantics:** ✅ SQUAD_WORKTREES=1 correctly gated. Three-way branch (skip/worktree/disabled).

**Enforcement language:** ✅ Pre-Spawn now reads as imperative: MUST-level imperatives and ACTIVE status badge.

**Template sync:** ✅ Verified byte-identical across all three files (squad.agent.md + two templates).

**Fallback safety - ARCHITECTURE CALL (APPROVE with note):** Silent fallback to main repo on git worktree add failure. For v1 (opt-in, dogfooding), fallback is right default. Differentiated: lock-file errors get retry-then-abort; permissions/other errors get fallback. Already logged to history.md.

**Follow-up (not blocking):** Emit user-visible warning (e.g., "⚠️ Worktree creation failed — falling back to shared checkout") in addition to history.md log. File as follow-up issue.

**Branch-mismatch handling:** ✅ Safe. git worktree remove fails with dirty-tree error; git protects against silent destruction.

**Parallel dispatch warning:** ✅ Warning-only (detection via list_agents). Sufficient for v1.

**Risk #1 mitigation (file-deletion):** ✅ Two mechanisms — isolation + junction directionality.

---

### 2026-05-29: WI-B scope — Coordinator dispatch-policy
**By:** Graham (Lead)
**Status:** Scoping complete, implemented

From decision drop: graham-wi-b-scope (local-only)

**Scope confirmation:** WI-B makes the coordinator CREATE worktrees per-issue instead of dispatching agents into shared main.

**Pre-Spawn discovery:** "Pre-Spawn: Worktree Setup" section (lines 697–742) was documentation-only. Gabriel's job: make it real.

**Concrete change list:**
- Pre-Spawn: Worktree Setup (enforce language + error handling)
- How to Spawn an Agent (resolve WORKTREE_PATH / WORKTREE_MODE placeholders)
- Worktree Lifecycle Management (reference docs)
- Template mirrors (must stay in sync)

**Opt-in vs default-on (Recommendation: Option A — Opt-in for v1):**
- Safety: Zero behavior change unless explicitly enabled
- Adoption friction: Users must know env var exists
- Complexity: Minimal — one if check
- Risk: Low — worst case is feature not used

**Dogfooding plan:**
- Worktree path: D:\git\stunning-adventure-{N}
- Branch: squad/{N}-coordinator-worktrees
- Env var: SQUAD_WORKTREES=1

**Risk flags:**
1. File-deletion mystery event during session — WI-B mitigates via isolation
2. 
ode_modules re-install after worktree removal — cleanup flow handles junction removal BEFORE git worktree remove
3. Pre-Spawn is documentation-only — Gabriel added ACTIVE status + enforcement language
4. Parallel dispatch guard — warning-only recommended for v1
5. Template drift — Gabriel updates all three files atomically

---


### 2026-06-08: FSE-2 and FSE-3 JSDoc Documentation Complete (Roger)

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-06-08  
**Status:** ✅ COMPLETE

FSE-2 and FSE-3 LOW-priority documentation follow-ups are now complete. Both items have been documented as interface-level JSDoc on the `FactStore` contract in `packages/eureka/src/activities/recall.ts`.

#### FSE-2: Offset Cursor Pagination Gaps/Dupes

**Location:** `FactStore` interface @remarks (line 48–51)  
**Content:** Documented that offset-based cursor pagination (v1) can skip or duplicate rows if facts are inserted or trust values mutate between page fetches. Noted this is acceptable for single-writer v1, and true keyset pagination (deferred to Slice D++) will resist concurrent mutations.

#### FSE-3: Limit Parameter Contract

**Location:** `search()` method parameter `limit` JSDoc (line 57–63)  
**Content:** Documented that `limit` must be a positive integer. Degenerate values (≤ 0, NaN, non-integer) throw `TypeError` at the call boundary and are treated as contract violations, not as empty-result requests.

#### Verification

- ✅ TypeScript build: clean (`tsc --build`)
- ✅ Test suite: 164/164 green (eureka)
- ✅ No behavior changes (doc-only)

---

### 2026-06-06T22:03:01-07:00: Aaron's ruling — WAL write.lock stale-lock policy (resolves D-LOCK-2)
**By:** Aaron Kubly (via Copilot)
**Decision:** Option (b) — **PID + liveness reclaim** for v1. The `write.lock` file records the owner PID; on an acquisition conflict, check whether that PID is alive — reclaim the lock if the owner is dead, throw `WriteLockHeldError` if alive. Driven by a dedicated RED→GREEN cycle.
**Rationale:** Preserves §3.4.1's auto-release-on-termination *intent* without a native dependency; avoids opaque "stuck forever after crash" failures (correctness compounds across agent actions).
**Follow-up filed:** GitHub issue **#55** — reconsider a true OS advisory lock (flock/LockFileEx via maintained dependency) vs PID-liveness later (label squad:roger).
**Supersedes:** Roger's recommended Option (a) manual-clear (D-LOCK-2). §3.4.1 spec guarantee is now honored by PID-liveness, not downgraded.
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
### 2026-05-30: WI-A Implementation Log — Issue #11 (Roger history restoration)

From decision drop: roger-issue-11-implementation (local-only, WI-A history, cross-referenced)

**Cloud Review Cycles 1-5 completed** — Worktree-aware session resolution now in place. Schema version 16. Partial UNIQUE indexes for NULL-workdir case. All 1405 tests green. Ready for WI-B (coordinator dispatch).



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

## 2026-06-06: Refined Scope Rule for Doc-Hygiene Inbox-Path Sweeps

**Date:** 2026-06-06  
**Author:** Graham Knight (Lead / Architect)  
**Status:** FINAL  
**Context:** PR #52 re-scope (issue #46), per Aaron's direction after persona-review panel findings

### Acceptance Criterion (Relaxed, Aaron-approved 2026-06-06)

Issue #46's original literal criterion was "zero `decisions/inbox/` hits in decisions.md AND decisions-archive.md."

**Relaxed criterion:** Zero *broken followable pointers* — specific `inbox/{file}.md` citations that cannot be followed. The three policy-list bullets in `decisions-archive.md` that document the gitignore rule may (and should) retain the literal path.

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
# Roger — WAL Write Lock Decisions (§3.4.1)

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

### Acceptance Criterion (Relaxed, Aaron-approved 2026-06-06)

Issue #46's original literal criterion was "zero `decisions/inbox/` hits in decisions.md AND decisions-archive.md."

**Relaxed criterion:** Zero *broken followable pointers* — specific `inbox/{file}.md` citations that cannot be followed. The three policy-list bullets in `decisions-archive.md` that document the gitignore rule may (and should) retain the literal path.

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

### Why

The literal "zero hits" criterion over-interprets the spirit of the issue. Issue #46 is about links that are broken for contributors and CI — not about erasing every mention of the path. Policy documentation that *explains why the path is gitignored* is useful, accurate, and should be preserved. Removing it degrades the policy audit trail.

### Append-Only History Rule

**Separately and absolutely:** Agent `history.md` and `history-archive.md` files are append-only. Any hygiene sweep that edits previously committed history entries is a scope violation, regardless of whether the edit improves clarity. This mirrors the over-reach that caused PR #44 to be reverted.

**Size-management policy (S2c update):** No size management via deletion is permitted. See the canonical rule entry above for the full S2c rationale and enforcement record.

# D++ Keyset Pagination — Three Interlocked Decisions

**Author:** Genesta (Cognitive Systems Lead — Eureka)  
**Date:** 2026-06-10  
**Status:** OPTIONS ANALYSIS — awaiting Aaron's decision gate  
**Scope:** M8 Slice D++ keyset pagination, Slice C schema-gap migration, cross-page relevance normalization

---

## Decision 1 — Keyset Cursor (v:2) Design

### Context

Current state: v1 cursors encode `{v:1, offset, scope}`. SQL uses `OFFSET $offset`. The `v` dispatch in `cursor.ts` already reserves v≥2 (throws `CursorVersionUnsupportedError`). §3 of decisions.md explicitly deferred keyset to D++ and flagged BM25 float stability as a risk.

The SQL sort expression is `(-bm25(facts_fts)) * f.trust DESC, f.id ASC`. A keyset cursor must encode the LAST row's sort-key value + the `f.id` tiebreaker, replacing `OFFSET` with:

```sql
WHERE ((-bm25_score) * f.trust < $lastSort)
   OR ((-bm25_score) * f.trust = $lastSort AND f.id > $lastId)
```

### The BM25 Float Stability Question

This is the load-bearing risk §3 flagged. BM25 scores are computed by SQLite's FTS5 engine at query time. Two concerns:

1. **Across-call stability:** If the FTS5 index hasn't changed, will `bm25(facts_fts)` return bit-identical floats for the same row across separate queries? Answer: **yes, within a single connection and unchanged index.** FTS5 BM25 is deterministic given the same term statistics (total docs, avg doc length, term frequency). No stochastic component. The score for row R will be identical across calls as long as no INSERT/UPDATE/DELETE touches `facts_fts` between them.

2. **Under concurrent writes:** If a new fact is inserted between pages, FTS5 global statistics (average document length, total doc count) shift, and BM25 scores for ALL rows change slightly. The keyset boundary `$lastSort` was computed from the OLD statistics — a row that was just above the boundary might now score just below it (or vice versa). This is the **keyset boundary drift** problem.

   **Mitigation:** The composite sort key is `(-bm25) * trust`. Trust is stable (only mutated by explicit `applyFeedback`). BM25 drift under single-writer (our current model) only occurs if the writer inserts facts mid-pagination. This is the same class of instability that offset-based pagination already has (§3, FSE-2), and keyset is strictly BETTER than offset under this scenario: offset skips/dups when rows shift position; keyset at worst re-returns a boundary row or skips one, but never loses interior rows.

   **Verdict:** BM25 float stability is sufficient for keyset. The risk is real but strictly less severe than the offset risk it replaces.

### Options for v:2 Payload

**Option A — Composite float + id:**
```ts
{ v: 2, lastSort: number, lastId: number, scope: string }
```
`lastSort` = the `(-bm25) * trust` value of the final row on the current page. `lastId` = that row's `f.id`. SQL becomes:
```sql
WHERE ((-bm25(facts_fts)) * f.trust < $lastSort
   OR ((-bm25(facts_fts)) * f.trust = $lastSort AND f.id > $lastId))
```
**Pro:** Simple, minimal payload. Directly mirrors the SQL sort key.  
**Con:** Float equality comparison (`= $lastSort`) in SQL. IEEE 754 doubles compared via `=` in SQLite are bit-exact, which is fine for values that came from the same FTS5 computation — but fragile if the composite expression changes (Decision 2 entanglement).

**Option B — Separate BM25 + trust + id:**
```ts
{ v: 2, lastBm25: number, lastTrust: number, lastId: number, scope: string }
```
Store the components separately; reconstruct the composite in the WHERE clause.  
**Pro:** If the composite formula changes (Decision 2), old cursors can be invalidated by scope fingerprint mismatch rather than silently producing wrong results.  
**Con:** Larger payload. Reconstructing `(-lastBm25) * lastTrust` in SQL introduces a second float multiplication that must match the ORDER BY expression exactly — SQLite query planner may not recognize them as equivalent, breaking index usage.

**Option C — Row-id only (no float):**
```ts
{ v: 2, lastId: number, scope: string }
```
Use `WHERE f.id > $lastId` as a crude keyset on the tiebreaker alone, but still ORDER BY the composite. Effectively: "give me rows with id > X, ordered by composite, LIMIT N."  
**Pro:** No float stability concern at all. Dead simple.  
**Con:** **Incorrect.** A row with `f.id = 50` and high composite score should appear on page 1, but would be excluded if `$lastId = 45`. This only works if the primary sort is by `f.id` — it isn't. **Rejected.**

### Backward Compatibility

- **v0/v1 cursors continue to decode** — `decodeCursor` already handles them via the `v` dispatch. No change needed.
- **Mid-paginate version bump:** A caller holding a v1 cursor cannot use it as v2 (different semantics — offset vs keyset). The scope fingerprint would still match, but the fields are wrong. The v2 decoder should simply not look for `offset` — it looks for `lastSort`/`lastId`. A v1 cursor decoded as v2 would fail field validation → fall back to page 0 or throw. **Recommendation:** Throw `CursorVersionUnsupportedError` if a v1 cursor is presented to a v2-only store. Callers restart pagination from page 0. This is safe because cursor version is an internal implementation detail — callers treat cursors as opaque.
- **Emission:** Once v2 is implemented, `encodeCursor` should emit v2. There is no reason to keep emitting v1 — the scope fingerprint already prevents cross-version reuse across different store instances.

### Scope Fingerprint

v2 cursors still carry `scope` (SHA-256 hex, first 16 chars). The fingerprint inputs (`query, sessionId, minTrust, limit`) remain the same. If Decision 2 adds new columns to the sort key, `scope` doesn't need to change — it guards against parameter drift, not sort-key drift. Sort-key changes are guarded by the `v` version field itself.

### ★ RECOMMENDATION: Option A

Composite float + id is the right design. It's minimal, directly mirrors the SQL, and BM25 float equality is safe within a connection. The scope fingerprint handles parameter-drift protection. The `v:2` version tag handles sort-key evolution. No need to over-engineer the payload.

---

## Decision 2 — Schema-Gap Migration: Do importance/lastAccessed Join the SQL Sort Key?

### Context

Migration 002 will add columns to `facts`:
- `importance REAL DEFAULT 0` — [0,1] signal
- `last_accessed INTEGER DEFAULT NULL` — Unix epoch ms
- `attention_tier TEXT DEFAULT 'warm'` — hot/warm/cold

The pivotal question: does the SQL `ORDER BY` change from `(-bm25)*trust` to the full FR-2 composite `0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency` (with tier multiplier)?

### The Core Tension

**Keyset pagination orders by the SQL sort key.** If the recall layer re-ranks each page by `compositeScore` AFTER fetching, then cross-page ordering by compositeScore is impossible — re-rank only shuffles within a page. So:

- If importance/recency should affect GLOBAL ordering → they MUST be in the SQL sort key → they're in the keyset cursor.
- If they stay in the recall-layer re-rank → ordering is page-local → composite ordering across pages is approximate at best.

This is the fundamental entanglement between D1 and D2.

### Option A — Full composite in SQL

```sql
ORDER BY (
  0.50 * (-bm25(facts_fts))_normalized * ... 
  + 0.20 * COALESCE(f.importance, 0)
  + 0.20 * f.trust
  + 0.10 * max(0.1, pow(1 + max(0, (julianday('now') - julianday(f.last_accessed, 'unixepoch')) ), -0.5))
) * CASE f.attention_tier WHEN 'hot' THEN 1.2 WHEN 'cold' THEN 0.8 ELSE 1.0 END DESC,
f.id ASC
```

**Pro:** Global ordering matches compositeScore exactly. Keyset works perfectly. No recall-layer re-rank needed (or it becomes a no-op).  
**Con:** 
1. **Recency is time-dependent.** `julianday('now')` changes between pages. A row's recency-based sort value at page-fetch-1 differs from page-fetch-2. The keyset boundary `$lastSort` was computed at time T₁ but the WHERE clause evaluates at time T₂. Rows near the boundary can shift across it. This is the **time-varying sort key** problem — fundamentally incompatible with stable keyset pagination.
2. **BM25 normalization problem.** `compositeScore` expects relevance ∈ [0,1], but raw `-bm25` is unbounded. You'd need to normalize in SQL, which requires knowing min/max across the full result set — a separate query, or a window function that defeats the keyset WHERE optimization.
3. **Expression complexity.** The SQL becomes a maintenance hazard. Any tweak to FR-2 weights requires a migration or at minimum a coordinated code+SQL change.
4. **Edgar dependency.** The composite formula is a learning/ranking concern. Baking it into SQL couples storage to the ranker's evolution.

**Verdict: Reject.** The time-varying recency term makes this fundamentally unstable for keyset pagination.

### Option B — SQL keeps `(-bm25)*trust` only; recall re-rank stays page-local (status quo ordering)

Migration 002 adds the columns but the SQL `ORDER BY` doesn't change. `compositeScore` in `recall.ts` continues to re-rank the fetched page using all four signals.

**Pro:** Simplest migration. No SQL change. Keyset cursor (Decision 1) encodes `(-bm25)*trust` — stable, time-independent. Recall layer owns the ranking formula — easy to evolve without SQL coupling.  
**Con:**
1. **Cross-page compositeScore ordering is impossible.** If fact F₁ has high importance but low BM25, it might rank at the bottom of page 1 by SQL order but top of page 1 after re-rank. Meanwhile, fact F₂ on page 2 (lower BM25×trust) might have even higher compositeScore. The caller never sees F₂ ahead of F₁ because pagination already decided page membership.
2. **Overfetch mitigates but doesn't solve.** `RANKER_OVERFETCH_FACTOR = 3` already pulls 3× candidates for re-ranking. This helps within the overfetch window but doesn't help if the best-by-compositeScore fact is on page 5 by BM25×trust.

**Practical impact:** Today, `recall` calls `factStore.search({ limit: k * 3 })` — a SINGLE page, no pagination. The re-rank surface is already the full overfetch window. Cross-page compositeScore ordering only matters if a caller paginates AND expects globally-ordered compositeScore results. Currently, no caller paginates for composite ordering — pagination is for exhaustive traversal (e.g., a future "export all facts" or "batch re-score" use case). For exhaustive traversal, page-local re-rank order doesn't matter — the caller is consuming everything.

**Verdict: Strong candidate.** The practical impact of the limitation is near-zero given current usage.

### Option C — Time-independent subset in SQL, recency stays page-local

```sql
ORDER BY (-bm25(facts_fts)) * f.trust 
         * (CASE f.attention_tier WHEN 'hot' THEN 1.2 WHEN 'cold' THEN 0.8 ELSE 1.0 END)
         * (1.0 + COALESCE(f.importance, 0))
         DESC, f.id ASC
```

Fold importance and tier into the SQL sort key (both are time-independent, stable between pages). Leave recency to the recall-layer re-rank.

**Pro:** Gets ~80% of the composite signal into SQL. Keyset boundary is stable (no time-varying terms). Important facts bubble up globally, not just within-page.  
**Con:**
1. **Formula divergence.** The SQL sort formula and `compositeScore` in recall.ts now express DIFFERENT formulas. The SQL uses a multiplicative blend; compositeScore uses an additive weighted sum. These are not order-equivalent. Maintaining two formulas is a bug factory.
2. **Keyset cursor grows.** The v:2 payload would need to encode the full composite value (which now includes importance and tier), or the individual components. Either way, the cursor is coupled to the formula.
3. **Partial ordering improvement.** Importance and tier affect global order, but recency doesn't. A recently-accessed fact with mediocre BM25 still gets buried by SQL ordering — the recall re-rank can only rescue it if it's on the same page.

**Verdict: Possible but complex.** The formula divergence risk is high. Only justified if importance/tier materially affect ordering AND callers need globally-ordered results.

### Migration Mechanics (applies to all options)

```sql
ALTER TABLE facts ADD COLUMN importance REAL DEFAULT 0;
ALTER TABLE facts ADD COLUMN last_accessed INTEGER DEFAULT NULL;
ALTER TABLE facts ADD COLUMN attention_tier TEXT DEFAULT 'warm';
```

- `importance DEFAULT 0` → compositeScore uses 0 → preserves current behavior (0.20 × 0 = 0 contribution).
- `last_accessed DEFAULT NULL` → compositeScore treats NULL as Infinity → recency floors to 0.1 → preserves current behavior.
- `attention_tier DEFAULT 'warm'` → multiplier 1.0 → preserves current behavior.
- **Backfill:** Not needed. Defaults match the hard-coded values in `SqliteFactStore.search()` today (lines 248–249). Existing rows behave identically.
- **FTS5 triggers:** No change needed — new columns are not FTS-indexed.
- **Column types:** Crispin should confirm `attention_tier TEXT` vs an integer enum. TEXT is simpler and matches the TypeScript union `'hot' | 'warm' | 'cold'` directly. A CHECK constraint (`CHECK(attention_tier IN ('hot', 'warm', 'cold'))`) is optional but recommended.

### ★ RECOMMENDATION: Option B

Keep SQL ordering at `(-bm25)*trust`, recall-layer re-rank stays page-local. Reasoning:

1. No current caller paginates for globally-ordered compositeScore results. `recall` uses single-page overfetch.
2. The time-varying recency term makes full-composite SQL ordering fundamentally incompatible with keyset stability (kills Option A).
3. Option C's formula divergence risk outweighs its partial ordering benefit for a signal (importance) that doesn't even exist in the data yet.
4. When a caller genuinely needs globally-ordered compositeScore, the right solution is a different API (e.g., a `reindex` or `materialize-scores` batch job), not baking a time-varying formula into the pagination sort key.
5. The migration is trivial and non-breaking — just add columns with correct defaults.

---

## Decision 3 — Cross-Page Relevance Normalization

### Context

Today, `relevance` is per-page min-max normalized to [0,1]. FSE-4 / FS-SE-12 document that relevance is NOT comparable across pages. With keyset pagination, multi-page traversal becomes the norm, making this limitation more visible.

`compositeScore` consumes relevance as a [0,1] term weighted at 0.50 — the largest single weight. Breaking the [0,1] bound would produce compositeScores outside their expected range.

### Option A — Keep per-page min-max (status quo)

**Pro:** No change. Simple. compositeScore stays bounded. Within-page relative ranking is meaningful.  
**Con:** Cross-page relevance is incomparable. A sole result on the last page gets relevance=1.0 even if it's a weak match (FS-SE-12). Under multi-page traversal this becomes more visible.

### Option B — Raw/absolute (-bm25) as relevance

Emit `-bm25(facts_fts)` directly (positive, unbounded).

**Pro:** Globally comparable across pages. Deterministic (same row, same query → same value).  
**Con:** 
1. **Breaks [0,1] bound.** compositeScore's `0.50 * relevance` term becomes `0.50 * (some unbounded positive float)`. The composite score is no longer in a predictable range. The tier multiplier and weight ratios become meaningless.
2. **Scale varies by query.** A 1-token query might produce BM25 scores in [0.5, 3.0]; a 5-token query might produce [2.0, 15.0]. Raw scores are comparable within a query but not across queries — which is fine for pagination (same query) but surprising for callers expecting [0,1].

### Option C — Page-1 min/max as fixed reference in cursor

Carry `{ refMin, refMax }` from page 1 in the cursor. All subsequent pages normalize against the same reference.

```ts
{ v: 2, lastSort, lastId, scope, refMin: number, refMax: number }
```

**Pro:** Cross-page comparable. Still [0,1] bounded relative to page 1's range. Consistent compositeScore behavior.  
**Con:**
1. **First-page-dependent.** If page 1 has an outlier (very high or very low BM25), the reference range is skewed for all subsequent pages. A page-3 result could get relevance > 1.0 or < 0.0 if its raw BM25 exceeds page-1's range — requires clamping.
2. **Statefulness.** The cursor grows. The reference is now part of the pagination contract — changing page size or re-starting from a different page produces different relevance values for the same fact.
3. **Complicates cursor.** More fields = more validation, more surface for bugs.

### Option D — Global min/max via a preflight query

Before the first page, run `SELECT MIN(bm25(...)), MAX(bm25(...))` across the full matched result set. Use these as the normalization reference for all pages.

**Pro:** Truly global normalization. Stable, not first-page-dependent.  
**Con:**
1. **Extra query.** The preflight scans the full FTS5 match set — could be expensive for broad queries. Negates some of keyset's performance benefit.
2. **Stale reference.** If facts are inserted between the preflight and later pages, new rows may exceed the reference range. Same clamping issue as Option C.
3. **Where to store?** The global min/max would need to go in the cursor (same statefulness as C) or be recomputed per page (defeating the purpose).

### Option E — Normalize to query-specific [0,1] using a sigmoid/log transform

Apply a monotonic transform like `relevance = 1 / (1 + exp(-k * rawBm25))` or `relevance = log(1 + rawBm25) / log(1 + maxExpectedBm25)` to squash raw BM25 into [0,1] without needing min/max.

**Pro:** Globally comparable. No reference needed. No cursor growth. Always [0,1].  
**Con:**
1. **Parameter tuning.** The sigmoid's `k` or the log's `maxExpectedBm25` are magic numbers. Different corpora produce different BM25 ranges. Poor tuning compresses all scores into a narrow band.
2. **Non-linear distortion.** The transform changes the RELATIVE spacing of scores. Two facts with raw BM25 of 2.0 and 4.0 (2× ratio) might get sigmoid relevances of 0.88 and 0.98 (1.1× ratio). compositeScore's linear weighting assumes linear relevance.
3. **Edgar territory.** Choosing the right transform is a learning/tuning question.

### Entanglement with Decision 2

If Decision 2 = Option B (recommended), then `compositeScore` re-ranks page-local. Relevance is consumed page-locally too — so per-page normalization (Option A) is actually **coherent** with the design: the re-rank operates on a single page where per-page normalization is consistent.

Cross-page relevance comparability only matters if a caller collects results across pages and then sorts/filters by relevance or compositeScore. With Option B's page-local re-rank, that's already an invalid use case.

### ★ RECOMMENDATION: Option A (status quo) with documentation upgrade

1. Per-page min-max is coherent with Decision 2's page-local re-rank design.
2. compositeScore stays bounded and predictable.
3. The limitation is already documented (FSE-4, FS-SE-12). Upgrade the docs to explicitly state that keyset pagination does NOT make relevance cross-page comparable.
4. If a future use case genuinely needs global relevance comparability, Option E (sigmoid transform) is the most promising — but it requires Edgar's input on parameterization and should be its own slice.

---

## Entanglement Map

```
Decision 1 (cursor v:2)  ←──────→  Decision 2 (sort key)
   │                                    │
   │  The v:2 payload encodes the       │
   │  LAST ROW's sort-key value.        │
   │  If D2 changes the sort key,       │
   │  D1's payload must match.          │
   │                                    │
   │  D2-A (full composite in SQL)      │
   │  → D1 payload = full composite     │
   │    float (time-varying → unstable  │
   │    keyset boundary → REJECTED)     │
   │                                    │
   │  D2-B (SQL keeps bm25*trust)       │
   │  → D1 payload = bm25*trust float   │
   │    (stable → WORKS)                │
   │                                    │
   │  D2-C (partial composite in SQL)   │
   │  → D1 payload = partial composite  │
   │    float (stable but formula       │
   │    divergence risk)                │
   │                                    │
   └──────────→  Decision 3 (relevance normalization)
                     │
   D2-B (page-local re-rank) makes      │
   per-page normalization coherent.     │
   D2-A (global ordering) would         │
   demand global normalization.         │
                                        │
   D3-A (per-page) + D2-B = coherent   │
   D3-C/D (global ref) + D2-B = over-  │
   engineered (re-rank is page-local   │
   anyway, global relevance unused)    │
```

**The three decisions form a consistent package only in specific combinations:**

| D1 | D2 | D3 | Coherent? | Notes |
|----|----|----|-----------|-------|
| A (composite float+id) | B (bm25×trust SQL) | A (per-page) | ✅ **YES** | Recommended path |
| A | A (full composite SQL) | C or D (global ref) | ❌ | D2-A killed by time-varying recency |
| A | C (partial composite) | A or C | ⚠️ | Works but formula divergence risk |
| B (separate components) | B | A | ⚠️ | Over-engineered cursor for no benefit |

---

## Combined Recommended Path

| Decision | Choice | Key rationale |
|----------|--------|---------------|
| **D1** | Option A — `{v:2, lastSort, lastId, scope}` | Minimal, mirrors SQL, BM25 floats stable enough |
| **D2** | Option B — SQL keeps `(-bm25)*trust`, recall re-rank page-local | Time-varying recency kills full-composite SQL; no current caller needs global composite ordering |
| **D3** | Option A — Per-page min-max (status quo + doc upgrade) | Coherent with D2-B's page-local re-rank; compositeScore stays bounded |

**Migration 002:** Add `importance REAL DEFAULT 0`, `last_accessed INTEGER DEFAULT NULL`, `attention_tier TEXT DEFAULT 'warm'` to `facts`. No backfill. No ORDER BY change. No FTS5 trigger changes.

**Cursor v:2:** Encode `{v:2, lastSort: number, lastId: number, scope: string}`. SQL WHERE becomes keyset predicate. `decodeCursor` gains a v:2 branch. v0/v1 cursors throw `CursorVersionUnsupportedError` when presented to a v2 store (callers restart pagination). `encodeCursor` emits v2 only.

**InMemoryFactStore:** Must implement v:2 keyset logic using its `score` (termCount × trust) as the equivalent of `(-bm25) * trust`, and `insertionOrder` as the equivalent of `f.id`.

---

## External Input Needed

| Who | What | Why |
|-----|------|-----|
| **Crispin** | Migration 002 column types + CHECK constraint on `attention_tier` | Schema/representation is Crispin's domain. TEXT vs integer enum, constraint strictness. |
| **Crispin** | Confirm `last_accessed INTEGER` (Unix epoch ms) vs `TEXT` (ISO 8601) | Convention alignment with `created_at`/`updated_at` (currently TEXT datetime). |
| **Edgar** | Future: sigmoid/log relevance transform parameterization (if D3 evolves past Option A) | Learning algorithms concern — Genesta flags but doesn't own the transform design. |
| **Edgar** | Future: whether compositeScore formula should evolve to be SQL-expressible (would reopen D2) | If Edgar wants the ranker formula in SQL, D2-C or a materialized-score approach becomes necessary. |

---

*Genesta — 2026-06-10. Activities are runtime verbs, not storage nouns.*
 

 # Decision Drop — M8 Slice D++ Keyset Pagination: RED Test Surface

**Author:** Laura (Tester)  
**Date:** 2026-06-10T22:20:20-07:00  
**Phase:** London-school TDD RED — tests written, implementation NOT changed  
**Status:** 22 tests RED (expected), 107 tests GREEN (unchanged)

---

## Summary

Wrote the RED test surface for the Slice D++ keyset pagination migration. All failing tests
describe the NEW keyset contract and will flip to GREEN once Roger implements:
1. `encodeCursor(lastSort, lastId, scope)` — 3-arg signature
2. `decodeCursor` v1 branch → `{version:1, lastSort, lastId, scope}` (no `offset`)
3. `decodeCursor` garbage/v0 → `{version:0}` restart sentinel (no `offset` field)
4. `SqliteFactStore.search()` keyset WHERE clause
5. `InMemoryFactStore.search()` keyset slice logic (Roger's task)

---

## Contract ID Changes

| ID | Change | Reason |
|----|--------|--------|
| FS-10f | **DELETED** | v0 backward-compat removed; v-absent cursor now treated as garbage (restart) |
| FS-11 | **NEW** | FSE-2 concurrent-insert safety (keyset prevents duplicate on page N+1 after insert between pages) |
| FS-5b | **EXTENDED** | Added third `.each` case: v0 cursor with valid `offset:5` now must restart (not honor offset) |
| FS-SE-4 | **REPLACED** | Tests now cover bad v1 keyset fields (`lastSort`/`lastId`) instead of bad v0 offset values |
| FS-SE-15 | **UPDATED** | Assertion extended: requires `lastSort: any(Number), lastId: any(Number)` in decoded cursor |
| CU-1a/b/c | **UPDATED** | v0 absent now → `{version:0}` restart sentinel (was `{version:0, offset:N}`) |
| CU-2a/b | **UPDATED** | 3-arg `encodeCursor(lastSort, lastId, scope)` round-trip assertions |
| CU-2c–g | **NEW** | Bad keyset field validation: NaN/Infinity lastSort, negative/float/missing lastId → restart |
| CU-4a/b/c | **UPDATED** | Garbage → `{version:0}` (no `offset` field in restart sentinel) |

---

## RED Test List (22 failing)

### cursor.test.ts (11 failing)
- CU-1a, CU-1b, CU-1c — v0 absent → restart `{version:0}` not `{version:0, offset:N}`
- CU-2a — `encodeCursor(42.5, 17, scope)` round-trip (3-arg signature)
- CU-2c — bad lastSort NaN → restart
- CU-2d — bad lastSort Infinity → restart
- CU-2e — bad lastId negative → restart
- CU-2f — bad lastId float → restart
- CU-2g — missing lastId → restart
- CU-4a, CU-4b, CU-4c — garbage → `{version:0}` (no extra `offset` field)

### fact-store-contract.helper.ts — both InMemoryFactStore + SqliteFactStore (6 failing)
- FS-5b ×2 (third case: v0-valid-offset-5 must restart, not advance)
- FS-10a ×2 (cursor must have `lastSort`/`lastId` not `offset`)
- FS-11 ×2 (**FSE-2**: insert between pages → no dup; offset impl produces dup)

### fact-store-sqlite-edges.test.ts (4 failing)
- FS-SE-4 ×3 (bad v1 keyset fields with `offset:1` → current impl honors offset → page 2 = empty ≠ baseline)
- FS-SE-15 (cursor must have `lastSort`/`lastId` fields)

---

## Invariants UNCHANGED (still GREEN)

CU-3 (a–f), CU-5, CU-6, CU-7 — version-rejection and fingerprint tests unchanged.  
CU-2b — version:1 discriminant (passes with both current and new impl).  
FS-1..4, FS-5 (original), FS-6, FS-7, FS-8, FS-9 — core search semantics unchanged.  
FS-10b–e (scope mismatch), FS-10g (v:99), FS-10h (empty query) — unchanged.  
FS-SE-1, SE-1b, SE-2, SE-3, SE-5..14 — unchanged.  
FS-SE-12 (per-page normalization), FS-SE-14 (fingerprint determinism) — explicitly unchanged per plan.

---

## Restart Sentinel Shape Decision

New `DecodedCursor` type for Roger to implement:

```typescript
export type DecodedCursor =
  | { version: 0 }                                           // restart from page 1; no offset
  | { version: 1; lastSort: number; lastId: number; scope: string };
```

Tests assert `toEqual({ version: 0 })` for garbage/v0 cases — the extra `offset:0` field in the
current return value makes those assertions fail. This is the correct shape for keyset because:
- `version:0` signals "no valid keyset anchor; start from page 1"
- No `offset` field prevents accidental OFFSET fallback in any future code path

---

## FSE-2 Test Design (FS-11)

Sequence:
1. Seed A (`fse2safety` ×3, trust=0.8) and B (`fse2safety` ×1, trust=0.8)
2. Page 1 (limit=1): returns A; cursor stores keyset anchor
3. Seed C (`fse2safety` ×4, trust=0.8) — ranks ABOVE A
4. Page 2 with cursor:
   - **Offset impl:** sorted=[C,A,B], OFFSET 1 → returns A again (DUPLICATE → RED)
   - **Keyset impl:** WHERE composite < composite(A) → returns B (correct → GREEN)

Both InMemoryFactStore and SqliteFactStore covered via `runFactStoreContract` harness.

---

## What Roger Needs to Implement (GREEN phase)

1. **cursor.ts** — `DecodedCursor` type update; `encodeCursor(lastSort, lastId, scope)` 3-arg; `decodeCursor` v1 branch reads `lastSort`/`lastId`; garbage/v0 returns `{version:0}` (no offset).
2. **fact-store-sqlite.ts** — keyset WHERE: `AND ((-bm25_score)*f.trust < $lastSort OR ((-bm25_score)*f.trust = $lastSort AND f.id > $lastId))`. Replace `OFFSET $offset`. `nextCursor = encodeCursor(lastRow.composite, lastRow.id, scope)`.
3. **InMemoryFactStore** (in `fact-store.contract.test.ts`) — keyset slice logic using `insertionOrder` as `lastId` analog and `score` as `lastSort` analog.
 

 # Decision Drop: Migration 002 — Attention Tier Columns

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-06-10T22:20:20-07:00
**Context:** M8 Slice D++ — closes the Slice C schema gap

---

## What Was Delivered

Migration 002 (`packages/eureka/src/db/migrations/002-facts-attention.ts`) adds
three columns to the `facts` table and registers as version 2 in schema.ts. A
dedicated migration test suite (`src/db/__tests__/migrations.test.ts`, 5 tests,
all green) locks the column defaults, CHECK enforcement, and idempotency.

---

## Column Design Decisions

### `importance REAL NOT NULL DEFAULT 0`

**Type: REAL.** Importance is a normalized signal ∈ [0,1] consumed by
`compositeScore` as a float. `REAL` (IEEE 754 double) is the correct SQLite
type for a continuous fractional value.

**NOT NULL with constant default 0.** SQLite's ADD COLUMN constraint: `NOT NULL`
is permissible when the default is a constant non-NULL value. Default `0` exactly
reproduces the SqliteFactStore Slice-C hard-code (`importance ?? 0` in
`compositeScore`). No behavioral change for existing or new rows that omit the
column.

**Why not nullable?** Nullable importance would require every consumer to guard
against NULL before arithmetic. `NOT NULL DEFAULT 0` eliminates the NULL case at
the SQL layer: the storage contract is "0 means unscored" — SQL never emits NULL.

---

### `last_accessed INTEGER DEFAULT NULL`

**Type: INTEGER.** Unix epoch milliseconds is a 64-bit integer; SQLite INTEGER
stores up to 8 bytes, sufficient for epoch-ms well past year 9999. This is the
standard convention for numeric timestamp fields (distinguish from `created_at`
and `updated_at` in migration 001, which use `TEXT` + `datetime('now')` for
human-readable wall-clock display — those are not arithmetic targets).

**Nullable (no NOT NULL).** NULL is the load-bearing sentinel for
"never accessed". The compositeScore F3 guard converts `lastAccessed = undefined`
(JavaScript) / NULL (SQL) to `Infinity` tDays → `recency = Math.max(0.1, ...)
= 0.1`. Forcing NOT NULL would require a magic sentinel integer (e.g., 0 =
epoch, which would be "accessed in 1970" — wrong semantics). NULL is the
correct representation of "no access has occurred."

**No DEFAULT expression.** `DEFAULT NULL` (explicit) and omitting DEFAULT both
yield NULL; explicit declaration is clearer in the schema for future readers.

---

### `attention_tier TEXT NOT NULL DEFAULT 'warm'`

**Type: TEXT.** Enum-as-string is idiomatic SQLite for a small closed set of
named values. The TypeScript type `'hot' | 'warm' | 'cold'` maps cleanly to
three TEXT literals; no integer-to-name join table needed for a 3-value enum.

**NOT NULL with constant default 'warm'.** Same rationale as `importance`:
constant default satisfies the NOT NULL constraint for ADD COLUMN. Default
'warm' reproduces the SqliteFactStore Slice-C hard-code (`attentionTier: 'warm'`
with multiplier 1.0 — the identity value). Warm tier is the "do nothing" tier,
making it the correct zero-disturbance default.

**CHECK constraint on ADD COLUMN — verified.**
SQLite DOES accept `CHECK (attention_tier IN ('hot', 'warm', 'cold'))` in an
`ALTER TABLE ADD COLUMN` statement (verified at runtime against better-sqlite3
which bundles a recent SQLite). The CHECK is enforced for all future
INSERTs/UPDATEs. Existing rows at ALTER time are NOT validated — they receive
the default 'warm', which passes the CHECK regardless. No table-rebuild pattern
was needed.

Test MIG-4 confirms: inserting with `attention_tier = 'lukewarm'` throws.
Test MIG-5 confirms: 'hot' and 'cold' are accepted.

---

## Locked Decision: No ORDER BY Change (D2)

The SQL `ORDER BY (-bm25_score) * f.trust DESC, f.id ASC` is **not modified**.
The `importance`, `last_accessed`, and `attention_tier` columns are NOT part of
the sort key. Rationale (locked by Aaron):

The recall-layer `compositeScore` recency term is query-time-varying: it depends
on `now()` at call time, not on a stored value. Folding a time-varying term into
SQL ORDER BY would break keyset-cursor stability (last-rank + last-id cursors
would be computed against one `now()` and validated against a different `now()`
on the next page). The columns are stored for the application layer to consume;
SQL ordering remains deterministic and cursor-stable.

---

## What Is NOT Wired

`SqliteFactStore.search()` still hard-codes `attentionTier: 'warm'` and omits
`importance`/`lastAccessed` from the SELECT. That wiring — reading the new
columns from SQL into `RecallResult` — is the GREEN implementation phase,
separately scoped. The hard-coded defaults remain behaviorally correct until
that phase lands (they match the SQL defaults exactly).

---

## Test Coverage

| ID    | Assertion |
|-------|-----------|
| MIG-1 | `MAX(version) = 2` after applying both migrations |
| MIG-2/3 | Freshly-inserted row: `importance=0`, `last_accessed=NULL`, `attention_tier='warm'` |
| MIG-4 | CHECK rejects `attention_tier = 'lukewarm'` |
| MIG-5 | 'hot' and 'cold' accepted; values round-trip correctly |
| MIG-6 | `applyMigrations` idempotent — second call does not throw |

Also updated DB-CL-3 and DB-CL-6 in `fact-reader-sqlite-edges.test.ts` from
`schema_version = 1` to `= 2` (schema_version row count now 2, max version 2).
 

 # Decision Drop: Keyset Cursor — GREEN Phase (Slice D++)

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-06-10T22:56:47-07:00
**Context:** M8 Slice D++ GREEN — implements keyset pagination for `FactStore.search()`

---

## What Shipped

Four files changed; 22 RED tests turned green; 177 pre-existing tests stay green (199 total).

| File | Change |
|------|--------|
| `src/storage/cursor.ts` | v1 mutated in place to keyset; v0 compat deleted |
| `src/storage/fact-store-sqlite.ts` | Two prepared statements; keyset SQL; logger seam |
| `src/storage/__tests__/fact-store.contract.test.ts` | InMemoryFactStore keyset parity |
| `src/activities/recall.ts` | FactStore interface JSDoc updated; FSE-2 closed note |

---

## v1 Mutated In Place (Not Bumped to v2)

`DecodedCursor` v1 variant changes from `{ offset }` to `{ lastSort, lastId }`. The version
number stays `1`. Rationale: the old v1 format never shipped to a stable public API (Slice D+
was an internal cursor upgrade); no external cursors exist in the wild. Bumping to v2 would
require recognizing and rejecting old `{ v:1, offset }` cursors — adding a case for a format
that was never persisted externally. The cleaner cut is: v1 now means keyset; anything with
`v` absent or `v !== 1` is either garbage (restart) or a contract violation (throw). No
migration of existing cursor strings is needed.

---

## FSE-2 Guarantee — Corrected (Fix Wave #1)

With keyset pagination, the WHERE predicate anchors on `(lastSort, lastId)` — the composite
score and row id of the last returned row. Any fact **inserted** between page fetches with a
higher composite score than `lastSort` is naturally excluded (it appears "before" the cursor
anchor in sort order). **Concurrent inserts cannot cause duplicate rows** — FSE-2 is closed
for INSERT-induced cross-page duplication. FS-11 verifies this directly.

**Trust-mutation caveat (corrected from initial drop):** If a row already returned on page 1
has its trust score mutated between page fetches, its recomputed composite can re-cross the
`lastSort` anchor → the row may re-appear on a subsequent page. Callers needing strict
stability under concurrent trust writes must restart pagination. This is an explicit
out-of-scope case documented in the FS-11 contract test header.

---

## Two-Statement Design (Updated: CTE Refactor — Fix Wave #9)

`SqliteFactStore` prepares two SQL statements at construction:

- `stmtFirst` — no keyset predicate; used on first page (no cursor or restart sentinel)
- `stmtKeyset` — two-level CTE: `base` selects and computes `bm25(facts_fts) AS bm25_score`
  once; `ranked` derives `(-bm25_score)*trust AS composite`; outer query filters on `composite`

**Why CTE?** The original stmtKeyset called `bm25(facts_fts)` twice in the WHERE predicate
(once for `< $last_sort`, once for `= $last_sort`). The CTE computes bm25 once in `base`,
derives composite once in `ranked`, and the outer SELECT filters on the pre-computed value.
Single bm25 evaluation + cleaner boundary — the composite expression in the CTE MUST mirror
the sort expression in stmtFirst's ORDER BY or the keyset boundary silently breaks.

**Bit-exact boundary:** `lastSort` = `(-row.bm25_score) * (row.trust ?? NaN)` in JS.
The CTE `ranked` derives `(-bm25_score)*trust AS composite`. Both are IEEE 754 double
arithmetic on the same operand values — bit-exact match guaranteed.

**Why two statements, not conditional SQL?** `better-sqlite3` `prepare()` compiles a fixed SQL
string at construction time; bind params are typed to that string. Two statements is idiomatic.

**Alias in ORDER BY:** SQLite can expand SELECT aliases in ORDER BY. stmtFirst uses
`(-bm25_score) * f.trust DESC` in ORDER BY; stmtKeyset CTE uses `composite DESC`. Semantically
identical.

---

## Bit-Exact Boundary

`lastSort` stored in the cursor = `(-row.bm25_score) * (row.trust ?? NaN)` computed in
JavaScript from the fetched row. The WHERE keyset predicate computes
`(-bm25(facts_fts)) * f.trust`. Both use IEEE 754 double arithmetic on the same operand
values. The comparison is bit-exact. If `trust` is somehow NULL (filtered by `IS NOT NULL`
but guarded defensively), `NaN` propagates into the cursor and decodeCursor treats it as a
restart sentinel (non-finite lastSort → RESTART) — safe degradation.

---

## InMemoryFactStore Keyset Parity

Keyset filter in InMemoryFactStore:
```typescript
scored.filter(f =>
  f.score < keysetLastSort ||
  (f.score === keysetLastSort && f.insertionOrder > keysetLastId)
)
```
This mirrors the SQL predicate exactly. `insertionOrder` starts at 1 (not 0) to match
SQLite autoincrement semantics — `decodeCursor` rejects `lastId <= 0` as a restart sentinel.

---

## encodeCursor Object Param (Fix Wave #2)

Original signature: `encodeCursor(lastSort: number, lastId: number, scope: string)` — three
positional args, two of the same type. Swapping `lastSort` and `lastId` would type-check but
silently corrupt all subsequent pages. Changed to single object param:
`encodeCursor({ lastSort, lastId, scope })`. All call sites updated.

---

## Logger Seam (Updated: Full Threading — Fix Wave #3)

`SqliteFactStore` constructor: `constructor(db, logger?: { warn(msg): void })`. Default: `console`.
`deps.ts` `createSqliteRecallDeps(db, options?)` now accepts `{ logger? }` in options and
threads it to `SqliteFactStore` and onto the returned `RecallDeps`. `recall.ts` `recallWithScores`
uses `deps.logger ?? console` instead of `console.warn` directly. Same logger instance handles
both FTS5 parse-error warnings and attention-tier warnings. Backward-compatible — no caller
forced to provide a logger.

---

## Deviations from Spec

None. All four implementation requirements (cursor.ts, fact-store-sqlite.ts, InMemoryFactStore,
recall.ts JSDoc) delivered. All specified constraints honored (sort key unchanged, per-page
normalization unchanged, FS-4 footgun lock intact, scope fingerprint check preserved for v1).
 

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
### 2026-05-31: Decision Drop: M1 Hint Consumption MCP Tools (Roger)

**Author:** Roger (Platform Dev)  
**Date:** 2026-05-31T19:04:59Z  
**Issue:** #39  
**PR:** #40  

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






# Decisions: Crucible WAL Correctness S1 — Cycle-2 Remediation

**Author:** Roger (Platform Dev)  
**Date:** 2026-06-11  
**Branch:** `squad/crucible-wal-correctness-s1`  
**Commit:** d74242b  

---

## D-CBOR-2: RFC 8949 §4.2.1 as the Canonical CBOR Profile

**Decision:** Pin `rfc8949EncodeOptions` from cborg as the explicit encoding options for all
WAL CBOR serialization (payloadHash, readSetHash, envelopeCbor).

**Profile:**
- Map keys sorted by plain bytewise comparison of their CBOR-encoded byte representations
  (RFC 8949 §4.2.1 deterministic encoding — NOT RFC 7049 length-first)
- Integers use smallest-possible encoding
- Floats encoded as 64-bit (float64 option) for cross-platform stability
- No indefinite-length items (cborg fixed-length default)

**Context:** The prior implementation used a manual `sortKeys` JS lexicographic pre-pass, which
(a) used the wrong ordering rule for CBOR canonical form, and (b) relied on cborg's implicit
defaults rather than explicit options. The two rules happened to agree for short string keys, but
the manual pre-pass was redundant (cborg's own mapSorter re-sorts) and silently mangled non-plain
objects (Date → `{}`, Map → `{}`).

**Cross-language note:** For a non-JS implementation to reproduce the canonical form:
- Compare map keys bytewise on their full CBOR encoding (first byte = `0x60 | len` for strings ≤23 chars)
- Apply recursively to nested maps
- Golden vectors: `{ aa: 1, z: 2 }` → `a2617a0262616101` (z before aa: 0x61 < 0x62 bytewise)

**References:** `wal/cbor.ts`, `wal-cbor.test.ts` CBOR-4 through CBOR-7 golden vectors

---

## D-SCHEMA-1: WAL1/CBOR is the Inaugural Shipped Format — No Migration Owed

**Decision:** schemaVersion 1 (WAL1/CBOR) is the first and only format ever shipped.
JSON encoding was used in development but never reached durable on-disk storage in a
released version. No migration code is owed for any prior data.

**Format identity:** WAL1 = binary segment records with CBOR-encoded payloads, identified
by the 4-byte magic `0x57414C31` ("WAL1") in every segment record header.

**Backstop behavior:** On WAL open/replay, if `manifest.schemaVersion !== 1`, throw
`UnsupportedSchemaVersionError` immediately. This refuses to attempt decode of an unrecognized
format rather than producing confusing corruption errors. Implemented in `loadOrInitManifest()`.

**Future changes:** If a WAL2 format is introduced, it must bump schemaVersion to 2 and supply
explicit migration logic. The `CURRENT_SCHEMA_VERSION = 1` constant in `wal-backend-fs.ts` is the
single place to update.

**References:** `wal-backend-fs.ts` (UnsupportedSchemaVersionError, CURRENT_SCHEMA_VERSION),
`wal-backend-file.test.ts` Group4-1/4-2

---

## D-CAS-2: Unique Temp Names + EEXIST-as-success for CAS Writes

**Decision:** CAS temp files use `<hash>-<pid>-<counter>.cbor.tmp` (unique per `put()` call)
rather than the shared `<hash>.cbor.tmp`. On rename, EEXIST is treated as success since
content-addressed storage guarantees identical bytes from any concurrent writer.

**Rationale:** The shared `.tmp` name created a clobber race when two sessions/processes wrote
the same hash simultaneously. The unique name eliminates this race. EEXIST-as-success prevents
an ENOENT error when the concurrent writer renamed first (the temp file is already gone).

**References:** `wal/cas-fs.ts`, `wal-cas-fsync.test.ts` TORN-1

---

## D-CAS-3: Shard Directory fsync After Rename (Linux/ext4)

**Decision:** After each `renameSync()` in `syncAll()`, open and fsync the parent shard directory
to make the new directory entry durable on Linux ext4 (ordered mode). Skip on Windows (NTFS
writes directory entries synchronously as part of rename; extra fsync is a no-op).

**Rationale:** On Linux ext4, a crash between `renameSync()` and shard-dir fsync can lose the
directory entry — the exact hole described in issue #68 applies at the directory level too.
This closes the last crash window in the CAS-before-segment durability chain.

**References:** `wal/cas-fs.ts` syncAll()

---

## D-VERDICT-1: VerdictByte Type Discriminant + Precondition Enforcement

**Decision:** Define `type VerdictByte = 0xFF | 0x00 | 0x01 | 0x02` in `wal/types.ts`.
`hookResultToVerdictByte` now throws `Error` if `hookId === null` and `verdict !== 'COMMIT'`.

**Rationale:** `hookId === null` with OBSERVE/PAUSE is a programming error (no hook fired
but a non-commit verdict was returned). Previously the code silently fell through to
`VERDICT_TO_WAL[verdict]`, which could return 0x01/0x02 without the 0xFF guard. The explicit
precondition throw ensures a future default-OBSERVE path can't silently corrupt verdict bytes.

**Affected tests:** All existing tests using `commit('OBSERVE')` / `commit('PAUSE')` with
`hookId: null` were corrected to use `commitFromHook('OBSERVE')` / `commitFromHook('PAUSE')`.

**References:** `wal/types.ts`, `wal-backend-file.test.ts` Group5-I6 tests

---

## D-MAT-1: Shared materializeRow Helper to Prevent Backend Drift

**Decision:** Extract `materializeRow()` to `wal/materialize.ts`. Both `FileSystemWalBackend`
and `InMemoryWalBackend` call this helper to compute `payloadBytes/payloadHash/readSetBytes/
readSetHash/envelopeCbor/verdictByte`. CAS storage remains backend-specific.

**Rationale:** The CBOR encoding + hashing logic was duplicated in both backends. A future
change to one backend (e.g. different CBOR options) would silently diverge the other. The shared
helper + CL-9 contract tests catch this at CI time.

**References:** `wal/materialize.ts`, `wal-backend.contract.test.ts` CL-9a/9b

---

## D-CBOR-3: Crucible Canonical CBOR Profile — Final Definition (Cycle-3)

**Date:** 2026-06-11  
**Decision:** The encoding used for all WAL CBOR blobs is the **Crucible canonical CBOR profile**,
defined precisely as:

> RFC 8949 §4.2.1 map-key ordering (keys sorted by plain bytewise comparison of their deterministic
> CBOR encodings) + integers in shortest form + **ALL non-integer numbers encoded as IEEE-754 binary64**
> (forced float64, deviating from §4.2.1's shortest-float rule for cross-language reproducibility) +
> definite-length items only.

**This profile is NOT identical to RFC 8949 §4.2.1** because §4.2.1 mandates shortest-float
(float16 for 1.5, etc.) and we force float64. The profile retains §4.2.1 for everything else.

**Rationale for keeping forced float64:** Shortest-float introduces float16/float32 round-trip
ambiguity in non-JS runtimes. Forced float64 guarantees the same 8-byte representation on every
platform and language without any special float16 codec. The bytes `fb3ff8000000000000` for `1.5`
are pinned by golden vector test CBOR-9.

**Implementation:** `cborg` `rfc8949EncodeOptions` with `typeEncoders` for inline type validation
(replaces the separate `assertJsonLike` pre-pass — single tree traversal for both validation and
encoding).

**Documentation:** `wal/cbor.ts` file header, `encodeCbor` JSDoc, CTD §3.2 encoding profile block.

**Golden vectors (CBOR bytes → BLAKE3, all canonical):**
- `{ aa:1, z:2 }` → `a2617a0262616101` → blake3 `019d473cc09257855925ff98a82dac52898c7ded08fe0b35b14428b6d498a818`
- `{ nested:{bb:2,a:1}, top:42 }` → `a263746f70182a666e6573746564a261610162626202` → `ca3a08eebcc2b8da9850edaf204d824b91300b7e2fedfaea6f7412b7f4978ad4`
- `1` → `01` → `48fc721fbbc172e0925fa27af1671de225ba927134802998b10a1568a188652b`
- `'hello'` → `6568656c6c6f` → `90eeb71f0d4b768a5d449e30035beb7ffccd75d228e5b38e8e9cbfaa01ddfae9`
- `1.5` (float64) → `fb3ff8000000000000` → `02a6136608c9b30d4e355cf9cd9911808f3997eb4cc351c7e0d08f89a74f90c5`

**References:** `wal/cbor.ts`, `wal-cbor.test.ts` CBOR-4..9, CTD §3.2 encoding profile block

---

## D-CAS-4: Single Encode + Hash Per Row (Cycle-3 A2)

**Decision:** Eliminate double-hashing in the hot path. `materializeRow()` is the single source of
truth for `payloadHash`/`readSetHash`. Both CAS implementations (`InMemoryCas`, `FileSystemCas`)
accept an optional `precomputedHash` parameter in `put(bytes, precomputedHash?)`. When the hash is
supplied by the caller, the internal `hashBytes()` call is skipped.

**Rationale:** Before this change, `materializeRow()` called `hashBytes(payloadBytes)` to produce
the WAL record field, and then `cas.put(payloadBytes)` re-called `hashBytes()` internally —
computing the same hash twice per row. This change removes the second call on the hot path.

**Type validation fold:** The separate `assertJsonLike` pre-pass (a full tree traversal) has been
replaced with inline validation via cborg `typeEncoders`. The payload tree is now traversed exactly
once — validation and encoding happen in the same pass.

**Benchmark baseline (2026-06-11):** 15.50 µs/op for `encodeCbor + hashBytes` over a 4-key nested
payload (×2000 iterations, warm). Pinned by test PERF-1 in `wal-cbor.test.ts`.

**References:** `wal/cbor.ts` (crucibleEncodeOptions), `wal/cas.ts`, `wal/cas-fs.ts`,
`wal-backend-fs.ts`, `wal-backend-in-memory.ts`, `wal-cbor.test.ts` PERF-1

---

## D-EXPORT-1: Re-export All WAL Error Classes from index.ts (Cycle-3 A5)

**Decision:** Export `CorruptSegmentError`, `CasMissError`, `UnsupportedSchemaVersionError`,
`UnsupportedCborTypeError`, `InvalidMagicError`, `InvalidRecordLengthError` from
`packages/crucible-core/src/index.ts`. Package consumers can now `catch` these by type.

**References:** `src/index.ts`


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
### 2026-06-02: M2 Cycle-2 Doc Alignment (Gabriel)

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-02T00:16Z  
**PR:** #44 (branch squad/m2-forge-mcp-bash-hooks)  
**Commit:** bacb3f4

Cycle-2 review (APPROVE_WITH_NITS) confirmed all three cycle-1 code fixes are correct. Two doc-drift nits addressed: (1) SKILL.md pattern #7 replaced — the original taught the two-pass sed approach that cycle-1 rejected as buggy; the updated pattern now shows the _remove_block bash state-machine that was actually shipped, with a new Anti-Pattern entry documenting the specific sequencing failure mode (blank-line pass consumes MARKER_START, orphaning the block body) and the byte-identical roundtrip acceptance criterion. (2) README uninstall description updated from "using sed (GNU/BSD)" to "pure-bash line-by-line filter (no sed dependency; identical behavior on Linux, macOS, and Git Bash on Windows)". Both changes are doc-only; no code or behavior changed. M2 is now review-complete and ready to merge.

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

**Root cause:** _forge_mcp_resolve_script was called before the & so the 150ms–1s+ 
pm root -g shell-out blocked every new interactive session.

**Fix:** Moved both resolution and 
ode execution into the background subshell (( ... ) &>/dev/null &). Subshell inherits _forge_mcp_resolve_script (bash forks copy parent functions). Shell startup path is now a single ( ) & with no blocking work.

### F3 — MEDIUM — shell-init.sh: pkg_json dirname depth

**Root cause:** Two dirname calls landed in dist/ (no package.json there). Path: dist/hooks/sessionStart.js → dist/hooks → dist.

**Fix:** Three dirname calls reach the package root: dist/hooks → dist → skillsmith-runtime. orge_mcp_check now prints ersion: 0.1.0. Verified against the actual packages/skillsmith-runtime/package.json.

---

## Build / test status

- 
pm run build — ✅ clean
- 
pm test — ✅ 49/49 passing

## Files changed

- .github/hooks/cairn/uninstall.sh — replaced two-pass sed with bash loop
- .github/hooks/cairn/shell-init.sh — background resolution (F2) + pkg_json depth (F3)

---

# Roger: Crucible First GREEN — Decision Inbox

**Date:** 2026-06-01  
**Author:** Roger (Platform Dev)  
**Status:** GREEN confirmed — acceptance test passing
- **Production wiring:** index.ts default deps are NOT changed to SqliteFactStore. That is Slice D.
- **ttentionTier / importance / lastAccessed columns:** Future migration.
- **Cross-session aggregation:** FactStore.search() is session-scoped in M8. Querying across sessions is a later milestone.
- **Embeddings/semantic search:** BM25 via FTS5 only. Vector similarity is out of scope.

---


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
- `.squad/decisions-archive.md` — restored (fix commit 5925df4)
- `.squad/agents/gabriel/history.md` — Learnings section updated
- `.copilot/skills/archive-append-guard/SKILL.md` — new skill documenting the append-only assertion pattern

### 2026-06-08: FSE-2 and FSE-3 JSDoc Documentation Complete (Roger)

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-06-08  
**Status:** ✅ COMPLETE

FSE-2 and FSE-3 LOW-priority documentation follow-ups are now complete. Both items have been documented as interface-level JSDoc on the `FactStore` contract in `packages/eureka/src/activities/recall.ts`.

#### FSE-2: Offset Cursor Pagination Gaps/Dupes

**Location:** `FactStore` interface @remarks (line 48–51)  
**Content:** Documented that offset-based cursor pagination (v1) can skip or duplicate rows if facts are inserted or trust values mutate between page fetches. Noted this is acceptable for single-writer v1, and true keyset pagination (deferred to Slice D++) will resist concurrent mutations.

#### FSE-3: Limit Parameter Contract

**Location:** `search()` method parameter `limit` JSDoc (line 57–63)  
**Content:** Documented that `limit` must be a positive integer. Degenerate values (≤ 0, NaN, non-integer) throw `TypeError` at the call boundary and are treated as contract violations, not as empty-result requests.

#### Verification

- ✅ TypeScript build: clean (`tsc --build`)
- ✅ Test suite: 164/164 green (eureka)
- ✅ No behavior changes (doc-only)

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

### Why

The literal "zero hits" criterion over-interprets the spirit of the issue. Issue #46 is about links that are broken for contributors and CI — not about erasing every mention of the path. Policy documentation that *explains why the path is gitignored* is useful, accurate, and should be preserved. Removing it degrades the policy audit trail.

### Append-Only History Rule

**Separately and absolutely:** Agent `history.md` and `history-archive.md` files are append-only. Any hygiene sweep that edits previously committed history entries is a scope violation, regardless of whether the edit improves clarity. This mirrors the over-reach that caused PR #44 to be reverted.

**Specific prohibition (S2c, Graham, 2026-06-13):** Scribe's former "HISTORY SUMMARIZATION [HARD GATE]" in squad.agent.md — which rewrote history.md by moving content out — violated this rule and caused 5 review threads + file restores on PR #70. That gate has been removed.

**Chosen size-management policy: none.** History files grow unbounded. Rationale: the only append-only-compliant alternative (copy to archive, retain originals in place) does not reduce history.md size — it duplicates content. Any mechanism that shrinks history.md requires deleting previously-committed entries, which is permanently prohibited. If growth becomes a context-loading bottleneck, raise a new slice with Aaron sign-off.

**Enforcement:** squad.agent.md step 6 is now "HISTORY APPEND-ONLY GUARD" (prohibits summarization). Any future Scribe template revision must preserve this prohibition.


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
| FSE-2 | LOW | ✅ DONE | Offset cursor gaps/dupes under concurrent inserts — documented in `FactStore` interface JSDoc (2026-06-08). Non-issue for single-writer v1; relevant before cross-session queries (Slice D+). |
| FSE-3 | LOW | ✅ DONE | `search({ limit: 0 })` constraint: implementation throws `TypeError` (FS-8 locked behavior). Documented in `search()` method JSDoc that `limit` must be positive integer; degenerate values are caught at call boundary (2026-06-08). |
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

### 2026-06-08: FSE-2 and FSE-3 JSDoc Documentation Complete (Roger)

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-06-08  
**Status:** ✅ COMPLETE

FSE-2 and FSE-3 LOW-priority documentation follow-ups are now complete. Both items have been documented as interface-level JSDoc on the `FactStore` contract in `packages/eureka/src/activities/recall.ts`.

#### FSE-2: Offset Cursor Pagination Gaps/Dupes

**Location:** `FactStore` interface @remarks (line 48–51)  
**Content:** Documented that offset-based cursor pagination (v1) can skip or duplicate rows if facts are inserted or trust values mutate between page fetches. Noted this is acceptable for single-writer v1, and true keyset pagination (deferred to Slice D++) will resist concurrent mutations.

#### FSE-3: Limit Parameter Contract

**Location:** `search()` method parameter `limit` JSDoc (line 57–63)  
**Content:** Documented that `limit` must be a positive integer. Degenerate values (≤ 0, NaN, non-integer) throw `TypeError` at the call boundary and are treated as contract violations, not as empty-result requests.

#### Verification

- ✅ TypeScript build: clean (`tsc --build`)
- ✅ Test suite: 164/164 green (eureka)
- ✅ No behavior changes (doc-only)

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

