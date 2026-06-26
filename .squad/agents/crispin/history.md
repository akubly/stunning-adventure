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

---

### 2026-06-21: Imprint Slice — Persona Review 2-Cycle Complete (Ready to Ship)

**Event:** Persona review completed on eureka/imprint-slice (commits 0dd7c38 → c64092b → a9067a8).

**Cycle 1 dispositions:** 8 findings accepted+fixed (F1–F8), 2 rejected with documented reasoning (F9–F10, out-of-scope/inconsistent). Fixes committed c64092b.

**Cycle 2 re-review:** All cycle-1 fixes verified resolved; 1 residual minor (clock.ts double doc block) applied directly a9067a8.

**Final outcome:** 0 blocking, 0 important, 1 minor (corrected). All personas UNANIMOUS: correct, well-scoped, maintainable, architecturally sound. Ready to merge.

**Tests:** 258/258 eureka tests green, tsc clean.

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

---

## Learnings — 2026-06-23: Seam Map for `integrate(fact) → FactId`

**Context:** Genesta is drafting the integrate scope/design brief. DEDUP is OPEN — Aaron decides. This map is investigation only; no production code.

### 1. What `imprint` provides today (PR #81)

- **Signature:** `imprint(options: ImprintOptions, deps: ImprintDeps): Promise<FactId>` (`src/activities/imprint.ts`).
- **Input contract:** `content` (required, non-empty after trim), `sessionId` (required); optional `trust` ∈ [0,1] default 0.5, `importance` ∈ [0,1] default 0, `attentionTier` ∈ {hot,warm,cold} default 'warm'.
- **Validation performed (synchronous, pre-await, throws `InvalidImprintError` with `code='INVALID_IMPRINT'`):** V1 non-empty content; V2 finite trust in [0,1]; V3 finite importance in [0,1]; V4 attentionTier in the literal set; plus the F5 guard rejecting empty/blank ids from `idProvider.next()`.
- **Persistence seam:** `FactWriter.write({factId, sessionId, content, trust, importance, attentionTier, createdAt})` — London-style, injected. Two implementations: `SqliteFactWriter` and `InMemoryFactWriter` (the latter also implements `FactStore` to keep the in-memory write↔read view consistent for tests). Both share `epochMsToSqliteDateTime` for the SQLite TEXT-affinity datetime format.
- **Id assignment:** `IdProvider.next() → FactId` (branded `string & {__brand:'FactId'}`). Production wires `crypto.randomUUID()`; tests inject deterministic ids. F5 guard ensures non-empty.
- **Clock:** `ClockProvider.now()` returns Unix ms. Lives in neutral `src/activities/clock.ts` so the write path does not depend on the read path. `createdAt` is captured once and threaded through to the writer; `updated_at` mirrors `createdAt`; `last_accessed` is always NULL on insert.
- **Dedup-suppression posture (F1):** `INSERT … ON CONFLICT(fact_id, session_id) DO NOTHING`. First-write-wins on the UNIQUE key; CHECK/NOT NULL violations still throw. The FTS5 `facts_ai` AFTER INSERT trigger does not fire on a skipped conflict, so FTS stays consistent. The in-memory writer mirrors this with a `Map.has(key)` early-return.
- **What imprint deliberately does NOT do (per its own header):** "no contextual processing — that is integrate's job." It is the raw write path.

### 2. What `integrate` adds vs reuses

`integrate(fact: Fact) → FactId` per `docs/eureka/sections/10-activities-and-tiers.md §integrate` is the contextual front-door. Compared to `imprint`:

**Additions integrate must own:**
- **Richer input shape (`Fact`).** Spec calls for required `kind`, `verb`, `content` plus optional metadata. Imprint currently only models `content` + scalars. Either `Fact` must be normalized into the current writer args, OR we extend the persistence shape (see §3 and §5 — schema implications).
- **Malformed-fact policy** (open question #2 in §10 doc) — `integrate` is the layer that decides throw vs coerce vs log+skip for missing required fields. Imprint just throws `InvalidImprintError`; integrate's policy needs to be explicit and may differ for non-required-yet-recommended fields.
- **SessionId conditional semantics** (open question #9 in §10 doc) — FR-13 says `sessionId` is required for `kind=session` facts, optional otherwise. That conditional belongs in integrate; imprint requires `sessionId` unconditionally today.
- **Session-association side effect** — spec says "If `sessionId` present, writes association to `fact_sessions` table." That table does not exist yet (see §5).
- **Attention initialization** — spec says default `warm` and "Sets `lastAccessedAt`, `accessCount=1`". Today `accessCount` does not exist on the schema; `last_accessed` is set to NULL by imprint. Integrate's spec disagrees with imprint's current behavior — Aaron/Genesta need to reconcile (NULL = never-accessed-yet is what `compositeScore` is wired to assume; setting `accessCount=1` and `lastAccessedAt=now` would change recall scoring on the very first read).
- **Optional dedup step** (open question #1; DEFERRED to Aaron).

**Reusable from imprint:**
- All four scalar validations (V1–V4), the F5 id guard, `ClockProvider`, `IdProvider`, the `FactWriter` seam, and the `InvalidImprintError` shape.
- The ON CONFLICT idempotency posture on `(fact_id, session_id)`.
- The TEXT-affinity datetime helper.

**Reuse recommendation (option A: call imprint internally).** Integrate should normalize/validate the `Fact`, apply kind/verb-specific rules, then call `imprint()` for the actual persistence. Rationale: (a) keeps a single write path through the `FactWriter` seam — only one place performs the SQL INSERT and the ON CONFLICT idempotency contract; (b) keeps the layering honest (integrate is "imprint + context"); (c) avoids duplicating the V1–V5 validation and the id/clock plumbing; (d) the F2 (ClockProvider) and F1 (ON CONFLICT) review lessons stay enforced for free. Option B (share the FactWriter, skip imprint) bypasses imprint's validation and re-implements the id/clock plumbing — strictly more surface, no benefit. Option C (duplicate logic) is rejected outright.

**Caveat for the call-imprint approach:** if integrate adds new persisted columns (kind, verb, association rows), `imprint`'s `FactWriter.write()` signature must grow to carry them, OR integrate writes the association rows itself in a transaction wrapping the imprint call. The latter is cleaner — imprint stays scoped to the `facts` row; integrate owns the cross-table choreography.

### 3. Representation / persistence touch points

- **Tables today:** `facts` (id PK, fact_id TEXT, session_id TEXT, content, trust nullable, importance, last_accessed, attention_tier CHECK, created_at, updated_at, UNIQUE(fact_id, session_id)); `facts_fts` virtual table + ai/au/ad triggers; `trust_history` (scaffolded; written by feedback path). No `kind`, no `verb`, no `fact_sessions`, no `access_count`.
- **FactId contract:** branded UUID-v4 string; opaque; non-empty enforced; uniqueness scoped to `(fact_id, session_id)` — i.e. the same `fact_id` could in principle exist in two sessions today. v1 is agent-tier-only, so this is fine, but worth flagging because the spec's v1.5 conflict-resolution language ("unique constraint on `(kind, verb, content)`") implies a different uniqueness key may be introduced.
- **Write→read contract symmetry (the known review lesson):** this is the gap I want flagged loudly. `imprint` returns `FactId`. `recall` returns `RecallResult[]` where `RecallResult` carries `{content, trust, attentionTier, importance, lastAccessed, relevance}` — **no `factId`.** A caller who integrates a fact today cannot find its returned `FactId` in a subsequent recall. For integrate to be useful (e.g. so `decide()` can store a decision via integrate and then cite it back), `RecallResult` must surface `factId` (F9 in the imprint review was rejected as out-of-scope for that slice, with an explicit note that "the `integrate` cycle, where the full fact lifecycle (write → read → mutate) will be unified," is the right moment). **This is that moment.** Recommended addition: `RecallResult.factId: FactId` (and `FactReader.read()` keyed by `FactId` already exists for the feedback path, so the branding extension is mostly cosmetic on the read side).
- **Recallability path:** today, integrated content becomes recallable via the `facts_ai` trigger inserting into `facts_fts`. ON CONFLICT DO NOTHING preserves this. If integrate adds `kind`/`verb` columns, they are not text-searchable by BM25 unless added to the FTS5 virtual table — separate decision (likely keep them as filterable scalar predicates, not FTS terms).

### 4. If dedup IS adopted (options only — Aaron decides)

The existing UNIQUE `(fact_id, session_id)` only dedups re-issued ids. Content-level dedup needs a different key. Options for *where* the dedup key lives in the representation layer:

- **Option D1 — Content-hash column.** Add `content_hash TEXT NOT NULL` (e.g. SHA-256 over normalized content) with a UNIQUE index scoped per session (`UNIQUE(session_id, content_hash)`) or per (session_id, kind, verb, content_hash) once kind/verb exist. Enforcement: `ON CONFLICT(session_id, content_hash) DO NOTHING` (returns the existing row's `fact_id` to the caller). Pros: cheap, deterministic, identical to the F1 mechanism we just adopted. Cons: requires a normalizer (whitespace, case, punctuation) — every normalization rule is a new contract surface.
- **Option D2 — `(kind, verb, content)` tuple key per the §10 doc's v1.5 conflict-resolution language.** UNIQUE constraint on the tuple. Same ON CONFLICT enforcement. Requires `kind`/`verb` columns (§5). Aligned with FR-2 wording.
- **Option D3 — Pre-INSERT SELECT.** Integrate looks up a matching row before calling imprint; on hit, returns the existing FactId without writing. Pros: lets us implement "refresh `lastAccessedAt` on duplicate" (open question #1, sub-bullet). Cons: TOCTOU window between SELECT and INSERT — needs a transaction; loses the single-statement atomicity of ON CONFLICT.
- **Option D4 — Hybrid.** Use D1/D2 for the atomic dedup guarantee; if the caller wants "refresh on duplicate" semantics, integrate does a follow-up UPDATE on the conflict path. Combines D3's UX with D1's atomicity.

For enforcement, all four reuse the same primitive — a UNIQUE constraint that the writer relies on through `ON CONFLICT (…) DO NOTHING`. The decision is really about (a) what columns participate in the key, and (b) whether a duplicate should be silently dropped vs touched (lastAccessedAt refresh) vs merged (trust averaging, per §10 v1.5 conflict text). I am not recommending one — that is Aaron's call.

### 5. Schema / migration implications

Whatever shape integrate lands in, the following are likely:

- **Migration 003 territory.** Required if `Fact.kind` / `Fact.verb` become persisted columns. Both are small enumerations and want CHECK constraints (mirroring the `attention_tier` pattern from migration 002). If we adopt D2 dedup, those columns participate in a UNIQUE index.
- **`fact_sessions` association table.** Required if we honor the §10 spec's "writes association to `fact_sessions` table" side effect. Current schema only has the inline `session_id` on `facts`. If we keep the inline column, that doc bullet is satisfied without a new table — worth flagging to Genesta as a schema-shape question rather than silently spinning up a new table.
- **`access_count` column.** Required if integrate adopts the §10 spec's "Sets `accessCount=1`" behavior. Not present today; recall's tier-promotion logic per FR-2 ("cold → warm after 2 accesses") will need this column eventually regardless, so adding it now via migration 003 is cheap and forward-looking.
- **Content-hash column + UNIQUE index.** Only if D1/D4 dedup is adopted. Best added in the same migration as kind/verb so we don't re-pay the migration tax.
- **FTS5 sync.** If we add `kind`/`verb` as scalar columns (not in FTS), no FTS rebuild needed. If they become searchable text, the `facts_fts` virtual table needs columns added and a backfill — strictly more invasive. Recommendation: scalar predicates only, defer to a later slice.
- **`RecallResult.factId` projection.** Pure read-side change; no migration. SqliteFactStore already SELECTs `f.id` for keyset; adding `f.fact_id` to the projection and surfacing it is mechanical.
- **No representation/ or kinds/ directories exist yet.** Today's representation surface is `src/activities/imprint.ts` (FactId, FactWriter, AttentionTier) + `src/activities/recall.ts` (RecallResult, FactStore, FactReader) + `src/storage/`. When the kind taxonomy lands, `packages/eureka/src/kinds/` should host the literal-union + CHECK-constraint validators, and the broader `Fact` shape would naturally move into `packages/eureka/src/representation/`. This is the right cycle to establish those folders if Aaron wants them.

### Net recommendation in one line

Integrate normalizes `Fact` → calls `imprint()` for the row write → wraps in a transaction if it also writes association/dedup-helper rows. Keep one write path, propagate `FactId` to `RecallResult`, and decide kind/verb persistence (migration 003) before any dedup choice — because the dedup key likely sits on top of those columns.



### 2026-06-24 — Integrate Substrate (Option B Wave 1) — TDD GREEN

Aaron chose Option B (build the representation substrate now, mirroring the imprint slice's TDD discipline). Substrate-only deliverables — the `integrate` activity body itself is Wave 2.

**Shipped:**
- Migration 003 introducing `fact_relations` (CHECK on a 4-kind vocabulary `duplicate_of | supersedes | contradicts | supports`; UNIQUE `(session_id, from_fact_id, to_fact_id, relation_kind)`; two predicate indices for outgoing + incoming traversal). 7 new migration tests, ON CONFLICT DO NOTHING idempotency mirroring imprint F1.
- New `representation/` directory with the `Relation` primitive, `RelationKind` literal union, and `validateRelation` (V-R1..V-R6, synchronous, mirrors imprint validation posture; rejects self-loops at the type boundary).
- `RelationWriter` seam: in-memory + sqlite parity, shared contract suite RW-1..RW-14 (48 tests across the two wirings), production factory `createSqliteRelationWriter`.
- `FactReader.listBySession(sessionId)` for integrate's pair-scan, returning the minimal `{factId, content, trust}` shape (deliberately no attention-tier — ranking belongs to recall, not pair-scanning). Both impls skip NaN/NULL trust so consolidation never sees corrupt rows. CL-6..CL-8 contract tests added.
- `factId` on `RecallResult` — the F9 carry-over from the imprint review, now required. Wired through both FactStore impls, the contract reference impl, and all 28 fixtures in `recall.test.ts` (batch-patched via regex insertion).

**Results:** 319 passing (baseline 258 + 61 new). Build and typecheck green. The two Laura RED files for `integrate*.contract.test.ts` still fail at module-load because `../integrate.js` does not exist yet — this is the expected Wave 2 cliff, unchanged from baseline.

**Key learning — substrate naming reconciliation:** Aaron's brief explicitly named the column `relation_kind` and the method `listBySession`. Laura's pre-existing RED files use `edge_type` and `listEdges`. I followed Aaron's brief and left Laura's files untouched; reconciliation belongs to Wave 2 when integrate's body is implemented and the two pieces actually meet.

**Key learning — append-only invariant locked at substrate level:** D-INT-9 confirms the facts table is never mutated for consolidation purposes. Reconciliation is expressed entirely via new `fact_relations` rows (loser → winner with `duplicate_of`), preserving audit history and keeping recall's read path free of mutation surprises. This shapes everything downstream: a "supersedes" edge in Wave 1.5+ will likewise leave both facts on disk.

**Key learning — `factId` becoming required is a coordinated breaking change.** Every `RecallResult` construction site had to be updated in one pass before the type-checker would go green. The 28 fixtures in `recall.test.ts` were patched by regex (`{ content:` → `{ factId: 'rt-mock' as FactId, content:`) rather than per-fixture edits, because none of them assert on factId — the value is irrelevant to existing tests but required by the type. Worth remembering for the next "required field on a widely-constructed shape" change.



### 2026-06-25 — Wave 2 GREEN: integrate() activity shipped

Wave 2 delivers the integrate consolidation activity end-to-end on top of the Wave 1 substrate. Mirrored the imprint slice's TDD discipline — Laura's RED suite IT-1..IT-15 (Genesta's locked contract) goes green for both InMemory and SQLite wirings.

**Substrate reshape (per locked contract):**
- `FactReader.listBySession` rewritten to take `{ sessionId }` (object arg) and return `{ factId, content, createdAt }` (epoch ms, not trust). The trust field belonged to the previous-iteration shape; canonical-ordering needs createdAt.
- `InMemoryFactWriter` is now the source of truth in shared-store mode: tracks `createdAtMs` internally and exposes `listBySession`. `InMemoryFactReader` accepts an optional writer in its constructor and delegates when provided — preserving its standalone seed/read API for the existing CL-1..CL-8 contract tests.
- `sqliteDateTimeToEpochMs()` added to `storage/datetime.ts` for the reverse of the existing forward helper. Pairs cleanly with `epochMsToSqliteDateTime` so the schema TEXT format round-trips losslessly above second-precision.
- Re-export shim `storage/fact-reader-inmemory.ts` lets Laura's test import path stay stable without forcing her to edit the activity test file.

**RelationWriter gained the activity-facing seam:**
- New `RelationEdge` type in `representation/relation.ts` (TS-side narrow vocabulary: `edgeType: 'duplicate_of'` only for v1, even though the DB CHECK allows four kinds).
- `writeEdges(edges) → Promise<number>` added to the `RelationWriter` interface and both impls. SQLite version runs per-edge `INSERT … ON CONFLICT DO NOTHING` inside `db.transaction`, summing `RunResult.changes` — count = rows actually inserted, so an idempotent re-run returns 0 (locked behaviour for `IntegrationReport.edgesWritten`).
- Validation runs synchronously for every edge BEFORE the transaction opens — same imprint F1 pre-await posture that prevents an invalid edge in position N from leaving 0..N-1 persisted.
- `link()` preserved unchanged so the RW-1..RW-14 contract suite stays green without modification.

**Integrate activity body:**
- Pre-bucket by `.trim()`-equal content (O(n) after the O(n log n) canonical sort), then emit one edge per non-canonical occupant of each bucket. STAR-TO-CANONICAL by construction: every newer dup points to the SINGLE oldest matching fact, never to a chain of intermediates.
- Edge orientation locked per contract: `from = newer dup`, `to = older canonical`. The report's `pairs` flips that for the consumer: `keptFactId = canonical`, `duplicateFactId = newer`.
- `InvalidIntegrateError` thrown synchronously pre-await for missing/blank sessionId — so the IT-12 invariant "no seam touched on invalid input" holds without needing Promise-rejection unwrapping in callers.

**Composition root:** `createSqliteIntegrateDeps(db)` added alongside the other Sqlite factories — wires SqliteFactReader + SqliteRelationWriter + systemClock. Public API surface gained `integrate` + its types + `InvalidIntegrateError` + `RelationEdge`.

**Final status:** 349 passing / 1 failing of 350 tests. The single red is `integrate-sqlite.contract.test.ts` IT-S1 belt-and-suspenders direct SQL using `WHERE edge_type = 'duplicate_of'` — Aaron's brief locks the DB column name as `relation_kind`, so that SELECT is the one Laura-side fix that remains. The activity itself and all 30 IT-* contract tests are green.

**Key learning — narrow seam interfaces over fat ones in `IntegrateDeps`.** `FactReaderListSession` and `RelationWriterBatch` are structural slices of FactReader/RelationWriter respectively. They let test doubles implement only `listBySession` / only `writeEdges` rather than the full surfaces. Sympathetic to London-school test design and keeps the activity from accidentally depending on `read()` or `link()` even though they're available.

**Key learning — bucket-then-walk beats nested O(n²) loops for STAR-TO-CANONICAL.** A naive `for i; for j>i; if equal: emit` loop with breaks would produce the same topology but is fiddly to get right (off-by-one risks with the "earliest canonical" anchoring). Bucketing by `.trim()`-content after a canonical sort makes the topology emerge from the data shape — easier to reason about and trivially extensible when v1.5+ replaces `.trim()`-equal with embedding-distance similarity.

**Key learning — typed pre-await validation is what makes IT-12 cheap.** The `validateOptions` helper throws synchronously before any seam touch, so the test asserts "deps were never called" without needing Promise.try/catch shenanigans. Same shape as imprint's `validateOptions`; replicating that pattern is now boilerplate.

---

## 2026-06-25T07:17:47Z: Eureka `integrate` v1 Slice COMPLETE — Laura reconciliation + full suite green

**Status:** ✅ COMPLETE — Wave 2 GREEN fully shipped; all 350/350 eureka tests passing; full integration cycle closed

**Laura's reconciliation (2026-06-25T07:17 UTC):** ✅ DONE  
IT-S1 direct SQL query (lines 159, 168) updated from `WHERE edge_type = 'duplicate_of'` to `WHERE relation_kind = 'duplicate_of'` — schema naming aligned to Aaron's locked brief. No other changes to test contracts or assertions.

**Full integration pipeline:**
- **Wave 1 substrate** (2026-06-24T22:39): migration 003 + RelationWriter + FactReader.listBySession + factId on RecallResult. 319 passing (baseline 258 + 61 new).
- **Wave 2 activity** (2026-06-25T00:17): integrate.ts + IntegrateDeps composition + InvalidIntegrateError. All 30 IT-* contract tests green (15 core × 2 wirings).
- **Laura reconciliation** (2026-06-25T07:17): IT-S1 column name fix → **full suite 350/350 GREEN**.

**Seam interfaces finalized:**
- `FactReaderListSession = {listBySession(sessionId): Array<{factId, content, createdAt}>}` — narrow structural slice lets test doubles implement only what integrate needs.
- `RelationWriterBatch = {writeEdges(edges): Promise<number>}` — batch method alongside the existing `link()` method; idempotency via UNIQUE constraint dedup.

**Algorithm in production (pair-scan + STAR-TO-CANONICAL):**
1. Canonical sort by createdAt (asc), tie-break on factId.
2. Bucket by `.trim()`-equal content.
3. For each bucket with size > 1: emit one edge per non-canonical (newer) fact → the canonical (oldest) fact.
4. All 30 edges persist via `writeEdges` with atomic idempotency per imprint F1 pattern.

**What this unblocks for Wave 1.5+:**
- `sweep` can now call `integrate({sessionId})` for session-scoped consolidation, then later calls for cross-tier / cross-session (just change the scope argument to `integrate({sessionId, tier})` or `integrate({tiers: [...]})`).
- The 4-kind relation vocabulary in the CHECK constraint is future-ready; v1.5 `meditate` can write `supersedes | contradicts | supports` edges without schema changes.
- Append-only facts + soft reconciliation means recall can later filter out superseded facts WITHOUT fact deletion or content rewrite — audit history is preserved in the edge.
- `createdAt` epoch-ms ordering basis is stable across sessions; later work can order cross-session duplicates by the same canonical (oldest) anchor.

**Deliverables to durable .squad/:**
- `.squad/decisions.md`: merged 3 inbox files (genesta-integrate-slice-scope, crispin-integrate-seam, laura-integrate-test-plan)
- `.squad/agents/genesta/history.md`: appended 2026-06-25T07:17:47Z completion entry
- `.squad/agents/crispin/history.md`: this entry
- `.squad/agents/laura/history.md`: appended reconciliation note

**Architecture outcome:** Eureka v1 now has a three-verb cognitive write stack: `imprint` (raw write), `integrate` (discover duplicates), `applyFeedback` (judge quality). Each verb is precisely scoped (imprint stays lossless; integrate marks relationships; feedback updates trust). The append-only facts representation is locked. The pair-scan algorithm composes naturally with v1.5 background machinery (sweep/meditate) without API change or schema rework. No architectural debt.


