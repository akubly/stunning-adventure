# Squad Decisions Archive (Entries Older Than 7 Days)

Entries archived on 2026-06-05 from decisions.md.
# Squad Decisions Archive

Entries from 2026-05-29 and earlier (archived 2026-06-05).

---
# Squad Decisions

## Open Decisions (Current Session)

### 2026-06-02: M2 Cycle-2 Doc Alignment (Gabriel)

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-02T00:16Z  
**PR:** #44 (branch squad/m2-forge-mcp-bash-hooks)  
**Commit:** bacb3f4
### 2026-05-31: Decision Drop: M1 Hint Consumption MCP Tools (Roger)

**Author:** Roger (Platform Dev)  
**Date:** 2026-05-31T19:04:59Z  
**Issue:** #39  
**PR:** #40  
**What Was Decided:**
1. The agentic brain/memory/thinking/learning system is named **Eureka**
2. Location: `packages/eureka/` in this monorepo (not separate repo)
3. New squad members: Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)
4. Existing squad continues Cairn/Forge; Valanice shifts 60% to Eureka UX

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
- Scribe decision inbox — transient decision queue (consumed by Scribe, not committed)
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
**Artifact:** Merged from team decision inbox drop (now incorporated in this archive)

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
- decision inbox drop for this session (local-only, consumed by Scribe) — this file
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
- Scribe decision inbox — transient decision queue (consumed by Scribe, not committed)
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
