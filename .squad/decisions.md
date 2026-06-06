# Squad Decisions

## Open Decisions (Current Session)

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

### 2026-05-30: WI-B PR #29 cycle 4 — prose redesign scope
**By:** Graham (Lead)
**Status:** Implemented in cycles 4-6

From .squad/decisions/inbox/graham-wi-b-cycle4-redesign.md

**Thread analysis:** 51 unresolved threads across 4 files represent 5 distinct findings:
- F8a: Wrong-branch reuse calls git worktree remove without unlinking junction first
- F9: Backtick escapes inside cmd /c "..." are PowerShell-only; cmd.exe treats them as literals
- F10: {branch} resolved via git -C "{worktree}" AFTER worktree is removed — path doesn't exist

**Decision:** Replace all literal cmd /c "..." strings with prose instructions (tool semantically + platform-intent table). Prose conveys intent; literal shell strings invite mechanical copying of wrong form.

**Recommended form:**
- Windows: Use cmd /c rmdir to remove junction. Do NOT pass /s.
- Unix: m -f removes symlink only.

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

From .squad/decisions/inbox/graham-wi-b-review-approve.md

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

From .squad/decisions/inbox/graham-wi-b-scope.md

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

From .squad/decisions/inbox/roger-issue-11-implementation.md (WI-A history, cross-referenced)

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

