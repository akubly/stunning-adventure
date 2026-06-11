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
