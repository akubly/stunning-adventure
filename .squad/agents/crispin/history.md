# SUMMARY (as of 2026-06-06)

File size: 15562 bytes. See history-archive.md for earlier entries.

---

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

---

## Learnings

### 2026-06-10: Migration 002 — Attention Tier Columns + SQLite ADD COLUMN + CHECK

**Context:** M8 Slice D++ — added `importance`, `last_accessed`, `attention_tier` to the `facts` table via migration 002.

**Column type conventions (snake_case, consistent with migration 001):**
- `importance REAL NOT NULL DEFAULT 0` — REAL for normalized float ∈ [0,1]. NOT NULL acceptable because the constant default 0 satisfies the constraint for all existing rows and future rows that omit it.
- `last_accessed INTEGER DEFAULT NULL` — INTEGER for Unix epoch milliseconds (consistent with the ecosystem convention: SQLite stores ms timestamps as INTEGER; `created_at`/`updated_at` in 001 use TEXT for human-readable datetime strings, but those are wall-clock display fields, not numeric computation targets). Nullable NULL = "never accessed" sentinel — the compositeScore F3 guard converts NULL to Infinity tDays → recency floors to 0.1.
- `attention_tier TEXT NOT NULL DEFAULT 'warm'` — TEXT for enum string. NOT NULL + constant default 'warm' is valid for ADD COLUMN (SQLite requires non-NULL default when NOT NULL is declared).

**SQLite ADD COLUMN + CHECK — verified behavior:**
- SQLite DOES accept `CHECK (attention_tier IN ('hot', 'warm', 'cold'))` syntax in an `ALTER TABLE ADD COLUMN` statement. No table-rebuild required.
- The CHECK is enforced for all future INSERTs and UPDATEs. Existing rows at ALTER time are NOT validated against the CHECK — they receive the default ('warm'), which passes the CHECK anyway.
- Multiple `ALTER TABLE ADD COLUMN` statements in a single `db.exec()` call (semicolon-separated) work correctly with better-sqlite3.
- Tests MIG-4 and MIG-5 verified: invalid tier ('lukewarm') throws, valid tiers ('hot', 'cold', 'warm') are accepted.

**Schema_version idempotency regression:** DB-CL-3 and DB-CL-6 in `fact-reader-sqlite-edges.test.ts` asserted `schema_version = 1` (hard-coded). When a new migration is added, these tests need to be updated to reflect the new MAX(version). Rule: **schema_version assertions must use the current total migration count, not a hard-coded 1.** For future migrations, always grep `toBe(1)` and `toBe(2)` in `fact-reader-sqlite-edges.test.ts` and update.

---

### 2026-06-10: Keyset Cursor — Implementation Notes (Slice D++)

**Context:** GREEN phase for M8 Slice D++ keyset pagination. Replaced offset-based pagination with `(lastSort, lastId)` keyset in `cursor.ts`, `fact-store-sqlite.ts`, and `InMemoryFactStore`. 199/199 tests green.

**Two-statement vs conditional SQL choice:** Used two prepared statements (`stmtFirst` — no keyset predicate; `stmtKeyset` — with keyset predicate) because better-sqlite3 `prepare()` binds are fixed to a SQL string at construction time. Conditional SQL would require either string-building at runtime (defeats the purpose of prepared statements) or a single SQL with `CASE`/`IIF` (less readable and harder to type safely). Two statements is idiomatic for this pattern.

**Bit-exact boundary in keyset predicate:** The SQL WHERE uses `(-bm25(facts_fts)) * f.trust` directly (not the `bm25_score` alias) because WHERE is evaluated before SELECT — aliases are not in scope. The composite score stored in the cursor is computed in JavaScript as `(-row.bm25_score) * row.trust`, where both operands come from the SQLite row. Since both JavaScript and SQLite use IEEE 754 double arithmetic, the comparison is bit-exact.

**InMemoryFactStore insertionCounter starts at 1:** `decodeCursor` validates `lastId > 0` (SQLite autoincrement starts at 1, so 0 is never a valid row id). InMemoryFactStore previously started its counter at 0 — if the first row's insertionOrder=0 was the last row on page 1, the encoded cursor would carry `lastId=0` which decodeCursor would treat as a restart sentinel (bad lastId → RESTART). Fixed by starting at 1. Future in-memory stores must also start at 1.

**v0 backward-compat deleted:** Any cursor without a `v` key now returns `{ version: 0 }` (restart sentinel, no offset field). `decodeCursor` return type changed from `{ version: 0, offset: number }` to `{ version: 0 }`. All callers that previously did `decoded.offset` now check `decoded.version === 1` for keyset fields. The `v=0` explicit version still throws `CursorVersionUnsupportedError` (v=0 is a present-but-invalid version, not a v-absent legacy cursor).

**FS-SE-4 bad-keyset-fields detection order:** decodeCursor returns RESTART for bad `lastSort`/`lastId` in a v1 cursor (bad fields detected in decodeCursor, before SqliteFactStore scope check). The FS-SE-4 test uses correctly-scoped cursors, so scope check vs. keyset validation order doesn't affect the test outcome. Restart is the correct and safe behavior for any corrupt v1 cursor regardless of scope.

**Logger seam:** `SqliteFactStore` constructor now accepts `logger?: { warn(msg: string): void }` (default `console`). The FTS5 parse-error catch block uses `this.logger.warn(...)`. Removed the TODO comment. Existing construction calls without `logger` arg are backward-compatible.

---

### 2026-06-10: Persona-Review Fix Wave — Accuracy, Ergonomics, Consistency (Slice D++)

**Context:** Nine accepted findings from persona review of D++ keyset slice. All addressed in a single follow-up commit.

**FSE-2 guarantee — correct scope:** Keyset pagination is INSERT-safe (new inserts can't cause cross-page dups) but NOT trust-mutation-safe. If a row returned on page 1 has its trust mutated, its recomputed composite re-crosses the lastSort anchor → re-appears on a later page. **"Stable under concurrent trust writes" is too strong a claim.** The correct claim: "prevents INSERT-caused cross-page duplication." Callers needing strict stability under trust mutations must restart pagination. This distinction matters for documentation precision — Genesta's phrasing was over-optimistic and was corrected in both the module JSDoc and the FS-11 contract test header.

**encodeCursor object param pattern:** Two positional numbers of the same type (`lastSort: number, lastId: number`) type-check when swapped but silently corrupt all subsequent pages. Converting to a single object param `{ lastSort, lastId, scope }` makes argument order a compile error at the call site. Apply this pattern whenever two adjacent function parameters are the same primitive type and both are meaningful scalars (not flags).

**CTE refactor for bm25 double-evaluation:** Original stmtKeyset called `bm25(facts_fts)` twice in the WHERE predicate. The two-level CTE (`base` → `ranked`) computes it once in `base` and derives `composite` in `ranked`; the outer SELECT filters on the pre-computed column. **Key correctness invariant:** the composite expression in the CTE MUST be bit-identical to the JS expression used to compute `lastRowComposite` for the cursor. If the sort key formula ever changes, both must change together — or the keyset boundary silently breaks.

**Logger seam threading:** The original logger seam was incomplete — `SqliteFactStore` accepted the logger but `deps.ts` didn't expose it and `recall.ts` still used `console.warn` directly. Threading requires: (1) `RecallDeps` interface gains `logger?` field, (2) `createSqliteRecallDeps` accepts options with `logger` and passes it to both `SqliteFactStore` and the returned `RecallDeps`, (3) `recallWithScores` uses `deps.logger ?? console`. **Lesson:** a seam is not "done" until it's threaded all the way from the injection boundary to the consumption site. Half-threaded seams leave tests unable to capture warnings from the full call path.

**IDF-drift is a second-order keyset edge case worth documenting:** SQLite bm25() IDF weights are corpus-dependent. Inserting facts between pages shifts IDF → some rows' recomputed composite scores drift from the stored lastSort anchor. For typical workloads this is negligible (few inserts, small IDF shift), but for high-insert workloads with exact-match pagination it can cause edge-case skips. Future mitigation: snapshot composite as a stored column (eliminates recomputation). Not fixing now; documented for future reference.


---

## 2026-06-10: M8 Slice D++ Shipped to Branch

**Session:** M8 Slice D++ keyset pagination (quad spawn)  
**Branch:** eureka/m8-slice-dpp-keyset  
**Status:** ✅ SHIPPED

Slice D++ completed with four-agent parallel execution. Genesta's architecture memo locked three interlocked decisions on cursor design, schema migration, and normalization strategy. Laura wrote 22 RED keyset tests. Crispin implemented migration 002, keyset GREEN phase, and persona fixes (cycle 2 clean). Roger completed doc sweep (N1-N4 stale comment fixes).

**Decisions locked:** D1=mutate cursor v1 in place to keyset; D2=importance/lastAccessed NOT in SQL sort key (time-varying recency breaks stability); D3=per-page normalization status quo. FSE-2 guarantee corrected: INSERT-safe only (not trust-mutation-safe).

Ready to merge.

---

## HISTORY SUMMARIZATION — 2026-06-11

**File size at session close:** 
- laura/history.md: 157,469 bytes (→ exceeds 15,360 threshold; summary appended)
- crispin/history.md: 24,816 bytes (→ exceeds 15,360 threshold; summary appended)
- roger/history.md: 168,012 bytes (→ exceeds 15,360 threshold; summary appended)

### High-Level Summary (All Recent Work)

**Laura (Tester):**
- M8 Slice C audit (SqliteFactStore + FTS5 BM25): ✅ ACCEPT-WITH-FOLLOWUPS (121 tests)
- Crucible WAL Walkthrough B acceptance testing: ✅ COMPLETE (hook-veto RED→GREEN)
- M8 Slice D++ keyset pagination RED tests: ✅ 22 tests written (cursor v1 mutation, FSE-2 closure)
- Key learnings: FTS5 sign convention, per-page normalization, cursor pagination with concurrent inserts

**Crispin (KR Specialist):**
- Design Ceremony R1–R8: Advocated Path A initially, adopted Path D post-source-reading, locked v4-final schema
- M7-A review cycle: Observed (Edgar lead); M7-C next (Real FactReader contract)
- M8 Slice D++ implementation: Migration 002 + keyset GREEN + persona fixes (cycle 2 clean)
  - Migration 002: importance/lastAccessed/attentionTier columns (NOT in SQL sort key)
  - Keyset: v1 mutated in place, encodeCursor object param, logger seam threaded
  - FSE-2 corrected: INSERT-safe (no dupes), NOT trust-mutation-safe

**Roger (Platform Dev / Doc):**
- PR #58 Copilot review cycle-6: hook-veto.test.ts comment polish, HookBus docs
- PR #58 cycle-4: timestampNs monotonicity (clock seam), replay validation, CAS header doc
- PR #58 cycle-3: session-scoped manifest (isolation fix), short-write guard, codec recordLen validation
- PR #58 cycle-2: Node engine bump to 20.19.0, ESM compatibility docs
- PR #58 final: gitignore polish, inbox path citations swept
- Crucible WAL Walkthrough B: hash-chain + CAS + codec + ledger seam (28/28 green)
- M8 Slice A cycle-2 fixes: busy_timeout, WAL pragma, BEGIN IMMEDIATE, subpath export (75 tests)
- M8 Slice D++ doc sweep: N1-N4 stale comment fixes (keyset, migration, cursor versioning)

**Append-Only Rule Applied:** All prior entries remain unchanged. This summary provides high-level context only.

---

## Learnings

### 2026-06-12: Attention-Column Hydration — TDD GREEN Phase (FS-SE-16a..e)

**Hydration wiring (both SELECT paths + mapper + FactRow):**

`SearchRow` (the internal interface for rows returned by `db.prepare`) was extended with three fields matching SQLite column names exactly: `importance: number`, `last_accessed: number | null`, `attention_tier: string`. This is the project convention — the interface mirrors the DB column names/types, not the JS camelCase output shape.

Both SELECT paths were updated consistently:
- **stmtFirst** (direct FTS5 + JOIN, no CTE): Added `f.importance, f.last_accessed, f.attention_tier` to the column list.
- **stmtKeyset** (CTE-based): The columns must flow through TWO levels — (1) added to `base` CTE SELECT (where the `facts f` JOIN lives), (2) added to `ranked` CTE SELECT as pass-through columns, (3) added to the outer `SELECT … FROM ranked`. Failing to thread through all three levels would produce "no such column" at runtime.

The row mapper was updated to replace the hardcoded `attentionTier: 'warm'` with `row.attention_tier as 'hot' | 'warm' | 'cold'`, add `importance: row.importance`, and `lastAccessed: row.last_accessed ?? undefined`.

**Locked ORDER BY / cursor invariant:**

The composite expression `(-bm25_score) * trust` in `ranked` CTE and the `ORDER BY (-bm25_score) * f.trust DESC, f.id ASC` in `stmtFirst` are **invariant** (decision D2). The new columns are passenger data only — they do NOT appear in ORDER BY, the keyset WHERE clause (`composite < $last_sort OR (composite = $last_sort AND id > $last_id)`), or the cursor encode/decode. Adding columns to the SELECT without touching the sort expression is safe and is the correct pattern for any future "read-only" column additions.

**NULL → undefined mapping for lastAccessed:**

`row.last_accessed ?? undefined` maps SQL NULL to JS `undefined` (not `null`). This matters because `compositeScore` in recall.ts checks `typeof fact.lastAccessed === 'number'` — passing `null` instead of `undefined` would make that check truthy (typeof null === 'object', not 'number'), but then `null` arithmetic would produce `NaN`, corrupting the recency penalty calculation. The `?? undefined` mapping ensures absent last_accessed falls through to the Infinity/stale path correctly.

**Default-row behavior preserved:**

The migration 002 defaults (`importance REAL NOT NULL DEFAULT 0`, `attention_tier TEXT NOT NULL DEFAULT 'warm'`, `last_accessed INTEGER` nullable) were chosen so that existing rows behave identically to before. `importance=0` has no effect on the composite sort (not in ORDER BY); `attention_tier='warm'` was already the hardcoded value; `last_accessed=NULL` maps to `undefined` which the compositeScore recency branch already handles as "no recency signal."

---

### 2026-06-16: `integrate` Design Memo — Representation Layer Input

**Context:** Aaron split the write path into `imprint` (raw mechanical write) and `integrate` (cognitive orchestration verb). Genesta is specifying `imprint`; Crispin was asked to produce a representation/graph design memo for `integrate` in parallel.

**Key design decisions proposed:**

1. **Classification model:** BM25 recall provides candidate shortlists but CANNOT reliably distinguish duplicate from contradiction (lexical signal only). Proposed `dedupKey` (nullable TEXT column + index on `facts`) as an O(1) semantic identity primitive for structured kinds. Classification logic itself is Edgar's domain — I provide the graph signals, not the thresholds.

2. **Edge schema (migration 003):** Proposed `relations` table matching PRD v5 spec: `(id, from_id, to_id, session_id, edge_type, weight, confidence, created_at)`. UNIQUE on `(from_id, to_id, edge_type, session_id)`. CHECK constrains to Tier 1 edge types. Indexes on `from_id`, `to_id`, `edge_type`. `from_id`/`to_id` reference `facts.fact_id` (semantic identity, not row ID) per PRD KR convention.

3. **Reconciliation outcomes:** Novel → imprint + optional `derived_from` edge. Duplicate → no imprint, refresh `last_accessed`, optional trust increment (Edgar). Contradiction → imprint new + `contradicts` edge + trust decrement on existing (Edgar's magnitude).

4. **Boundary clarity:** Representation owns edge schema/writes and dedup key definition. Edgar owns thresholds, trust algorithms, similarity scoring. Genesta owns the orchestration contract. The graph gives candidates and a place to store results — but duplicate-vs-contradiction discrimination requires either LLM judgment or structured dedup keys.

**Open questions raised:** (Q1) Does migration 003 ship with `integrate` impl or earlier? (Q2) Is `dedupKey` in scope? (Q3-Q4) BM25 threshold + dup-vs-contradiction discrimination strategy. (Q5) `duplicate_of` as edge vs. audit log. (Q6) `derived_from` mandatory or optional. (Q7-Q8) Trust adjustment magnitudes for Edgar.

**Decision drop:** `.squad/decisions/inbox/crispin-integrate-design.md` (PROPOSED).

---

### 2026-06-16: `imprint` GREEN Phase — Implementation Choices

**Context:** Implemented the `imprint` activity (raw fact write path) per Genesta's DECIDED contract and Laura's 24 RED tests. All 256 tests green, `tsc --build` clean.

**Key implementation decisions:**

1. **ClockProvider reuse:** Imported `ClockProvider` from `./recall.js` and re-exported from `./imprint.js` (`export type { ClockProvider } from './recall.js'`). Structurally identical interfaces — single source of truth, no second incompatible clock type. Genesta's note in §2 explicitly blessed this.

2. **Idempotency mechanism (SQLite):** `INSERT OR IGNORE` against `UNIQUE(fact_id, session_id)`. Simpler than `ON CONFLICT DO NOTHING` (equivalent for single-constraint case). Key property: SQLite triggers (`facts_ai` for FTS5 sync) do NOT fire on ignored rows, so FTS stays consistent without extra logic.

3. **Idempotency mechanism (InMemory):** `Map.has(key)` check before `Map.set()`. Composite key is `${sessionId}\0${factId}` (null-byte separator, same pattern as the existing InMemoryFactStore in fact-store.contract.test.ts).

4. **InMemoryFactWriter dual-interface:** Implements both `FactWriter` and `FactStore` in a single class per Laura's D2 decision. The harness assigns `factStore: writer` and `factWriter: writer` (same instance). Also exposes `readFact()` as a test-only method (not on FactWriter interface) per D3.

5. **Timestamp format:** `createdAt` (epoch ms from ClockProvider) is converted to `'YYYY-MM-DD HH:MM:SS'` format (matching SQLite's `datetime('now')` output style) via `new Date(ms).toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)`. Both `created_at` and `updated_at` are set to the same value (fresh fact, never updated).

6. **Validation ordering:** All checks fire synchronously before any `await` (matching applyFeedback's pattern). Order: content → trust → importance → attentionTier. `idProvider.next()` and `clock.now()` are called AFTER validation passes (per contract §3 step ordering).

7. **Content trimming:** `options.content.trim()` is applied both for validation (empty check) and for the value written to storage. The stored content is always trimmed.

**Files created/modified:**
- `src/activities/imprint.ts` — NEW: activity + types
- `src/activities/errors.ts` — APPEND: `InvalidImprintError`
- `src/storage/fact-writer.ts` — NEW: `InMemoryFactWriter`
- `src/storage/fact-writer-sqlite.ts` — NEW: `SqliteFactWriter`
- `src/sqlite/deps.ts` — APPEND: `createSqliteImprintDeps`
- `src/sqlite/index.ts` — APPEND: re-exports
- `src/storage/index.ts` — APPEND: re-export
- `src/index.ts` — APPEND: re-exports

**Test results:** 256/256 green (208 pre-existing + 48 new imprint contract tests).

---

## 2026-06-17: Eureka imprint Slice SHIPPED (M8 Follow-Up)

**Result:** ✅ COMPLETE — 256/256 eureka tests GREEN, tsc clean

**Deliverables:**
- `imprint` GREEN implementation + 24 RED tests (all passing)
- `integrate` design memo (PROPOSED, awaiting Aaron Q1/Q2 decisions)
- 4 decisions merged to decisions.md (3 DECIDED, 1 PROPOSED)

**Artifacts shipped:**
- Genesta: FR-4 amendment, imprint contract, roadmap (3 DECIDED)
- Crispin: imprint GREEN + integration design (1 PROPOSED pending Aaron)
- Laura: RED tests (24 assertions, both runners green)

**Scribe orchestration:** Decisions inbox merged → decisions.md, 3 orchestration logs per agent, session log, history appends, git commit staged/completed

**What's next:** Aaron reviews integrate design (Q1/Q2). Once locked, Crispin proceeds with `integrate` cognitive orchestration slice.

---

### 2026-06-18: Imprint Slice — Persona Review Cycle 1 Fixes

**Context:** Persona panel reviewed the imprint GREEN phase (branch `eureka/imprint-slice`, 0dd7c38). 0 blocking findings. 8 accepted, 2 rejected.

**Key changes:**

1. **`INSERT OR IGNORE` → `ON CONFLICT(fact_id, session_id) DO NOTHING`** — `OR IGNORE` is too broad; it silently swallows CHECK/NOT NULL violations, not just duplicate-key retries. The targeted `ON CONFLICT` ensures only UNIQUE constraint dupes are suppressed. This is a real correctness fix — the original was defense-in-depth fragile.

2. **`ClockProvider` extracted to `src/activities/clock.ts`** — Neutral module breaks the write-path → read-path import coupling. Both `recall.ts` and `imprint.ts` import from `clock.ts`. `recall.ts` re-exports for backward compat. Pattern: shared seam types live in neutral modules, not in the first activity that happened to define them.

3. **`epochMsToSqliteDateTime()` extracted to `src/storage/datetime.ts`** — Self-documents the SQLite TEXT-affinity contract. Both writer impls import from one source.

4. **`InMemoryFactWriter.search()` validation aligned** — Investigation: the existing `InMemoryFactStore` is test-file-local and not importable. Keeping inline `search()` is lower duplication than creating a new shared class. Added `minTrust` finite/[0,1] validation and fixed empty-page `Math.min/max` sentinel issue.

5. **`FactId` non-empty guard** — After `idProvider.next()`, empty/blank IDs now throw `InvalidImprintError('factId', ...)`. No UUID-format check (IM-2 uses `'test-uuid-001'` intentionally).

6. **`content.trim()` single computation** — Trimmed once, used in both validation and write payload.

7. **Merged duplicate `import type` in deps.ts** — Two identical import sources collapsed to one.

8. **IM-10 + `-Infinity`** — Importance validation test now matches trust validation parity (5 cases each).

**Rejected:** F9 (FactId branding propagation to read seams — out of scope, candidate for `integrate`). F10 (runtime null guard on content — inconsistent with existing activity patterns that trust TS structural types).

**Test results:** 258/258 green (208 pre-existing + 50 imprint). `tsc --build` clean.

**Decision drop:** `.squad/decisions/inbox/crispin-imprint-review-fixes.md`
