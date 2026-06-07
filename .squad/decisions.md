### 2026-06-01: Crucible Sprint 0 — First GREEN Cycle (Roger)

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

## 8. FSE-4 Follow-up: Per-Page Normalization Documentation (2026-06-05)

Added JSDoc at two locations:
- `RecallResult.relevance` field — clarifies per-page min-max, NOT comparable across pages
- `FactStore.search` return type (on `nextCursor?`) — same note for consumers reading the return shape

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

