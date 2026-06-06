# Squad Decisions Archive (Entries Older Than 7 Days)

Entries archived on 2026-06-05 from decisions.md.

---
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
