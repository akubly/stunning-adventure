# Roger — M8 Slice C Decision Drop

**Date:** 2026-06-05  
**Branch:** `eureka/m8-slice-c-factstore`  
**PR:** #48  
**Author:** Roger Wilco (Platform Dev)

---

## §1 FactStore.search() — Q2-approved wrapped return (Aaron confirmed)

Changed `FactStore.search()` return from plain `Promise<RecallResult[]>` to:

```ts
Promise<{ results: RecallResult[]; nextCursor?: string }>
```

**Rationale:** Aaron confirmed the wrapped form in Q2 (session 2026-06-05). The wrapped return enables opaque pagination via `cursor`/`nextCursor` without a breaking API change in the future. Required updating `recallWithScores` in `recall.ts` to destructure `.results`, and 10 mock sites in `recall.test.ts`.

---

## §2 BM25 sign convention + normalization

**Problem:** FTS5 `bm25(facts_fts)` returns NEGATIVE floats where more-negative = better match.

**Decision:** Negate in ORDER BY: `ORDER BY (-bm25(facts_fts)) * f.trust DESC, f.id ASC`

**Relevance normalization:** Pure `-bm25` per-page min-max, NOT the composite (`-bm25 × trust`). Rationale: the `compositeScore` consumer weights relevance, trust, importance, and recency as four orthogonal signals — baking trust into relevance would double-count trust (it already has a 0.20 coefficient in the scorer). Relevance = pure text-match quality. Order = composite selection heuristic. These are independent; page order and relevance order can legitimately differ when trust varies.

**Per-page caveat (FSE-4):** min-max normalization is scoped to the current page. A sole result on a sparse page always normalizes to `relevance=1.0`. Cross-page relevance values are NOT comparable. Documented in JSDoc on `RecallResult.relevance` and `FactStore.search` return.

**Regression lock:** FS-4 (equal-trust BM25 footgun lock) and FS-SE-1b (heterogeneous-trust: high-trust/low-BM25 sorts ahead but carries lower relevance).

---

## §3 Cursor strategy (v1)

**Decision:** Offset-only cursor — base64-encoded JSON `{ offset: number }`.

**Rationale:** Rowid+rank keyset cursors require stable rank values. BM25 floats are session-stable but not write-stable. For v1 single-page recall (RANKER_OVERFETCH_FACTOR × k), offset is deterministic and correct.

**Known limitation (F5 — deferred to Slice D):** The cursor is NOT bound to query, sessionId, minTrust, or limit. Cross-parameter reuse is undefined behavior — a cursor generated for query "foo" passed to a search for "bar" silently returns the wrong page. Slice D must add a scope fingerprint (hash of query+sessionId+minTrust+limit) and reject mismatched cursors.

**Stability caveat (F6):** Offset pagination is NOT stable under concurrent writes between pages. A write between page 1 and page 2 can cause rows to shift. Documented in code comment near OFFSET. Keyset cursor deferred to Slice D+.

---

## §4 FTS5 parse error handling (FSE-1, F2)

**Decision:** Wrap FTS5 query execution in try/catch. On FTS5 parse errors, return `{ results: [] }` instead of propagating. Rethrow all other errors.

**Narrowing (F2):** `code === 'SQLITE_ERROR' && /fts5|unterminated|syntax error|malformed MATCH/i.test(message)`. This pattern correctly catches FTS5 tokenizer errors ("unterminated string" for unclosed `"`) and FTS5 syntax errors ("fts5: syntax error near...") while letting non-FTS errors propagate (e.g. `"no such table: facts_fts"` from a dropped table — message doesn't match pattern, rethrows correctly).

**Diagnostic:** `console.warn('[SqliteFactStore] FTS5 query parse error (returning empty): <message>')` emitted on catch path. TODO: swap for injected logger.

---

## §5 Schema gaps (deferred to future migration)

The `facts` table (migration 001) has no `attentionTier`, `importance`, or `lastAccessed` columns yet.

**Defaults applied by SqliteFactStore:**
- `attentionTier`: `'warm'` (identity multiplier 1.0 in composite scorer)
- `importance`: omitted from returned `RecallResult` (scorer uses 0 as floor)
- `lastAccessed`: omitted from returned `RecallResult` (recency scorer uses 0.1 as floor)

**Impact:** Results are conservative but correct. The composite scorer still runs.

**Migration path:** A future `002-fact-fields.ts` can add the columns without breaking Slice C. SqliteFactStore SELECTs only `content`, `trust`, and bm25 score — adding columns is forward-compatible.

---

## §6 Tie-breaker (F3)

Added `f.id ASC` as secondary sort key after the composite DESC. `f.id` is INTEGER PRIMARY KEY AUTOINCREMENT — guaranteed unique, monotonically increasing within a session. Prevents skip/dup on OFFSET pagination when composite scores tie.

InMemory reference impl mirrors with `a.factId.localeCompare(b.factId)`.

---

## §7 Limit validation (F4)

`limit <= 0` or non-integer → `TypeError`. Rationale: `limit=0` creates a non-advancing cursor (infinite pagination loop); `limit=-1` is interpreted as unlimited by SQLite. Applied to both `SqliteFactStore` and the InMemory reference impl. Added as FS-8 contract invariant.

---

## §F5 Follow-up for Slice D: cursor versioning + scope fingerprint

The v1 cursor is minimal by Aaron's Q2 approval. Slice D MUST add:
1. **Scope fingerprint:** hash of (query, sessionId, minTrust, limit) embedded in the cursor. Reject cursors with mismatched fingerprint to prevent cross-parameter reuse bugs.
2. **Cursor version byte:** allows future format migrations without breaking in-flight cursors.
3. Consider **keyset cursor** (last composite score + last f.id) for write-stable pagination, replacing offset.

## §C2-E: FTS5 error-classification regex is message-text based (v1 tradeoff)

The F2 catch uses `/fts5|unterminated|syntax error|malformed MATCH/i` matched against SQLite error messages. This was verified against real better-sqlite3 / SQLite error output (2026-06-05). The risk: SQLite or better-sqlite3 can change error message wording across versions, silently widening or narrowing the catch.

**Known v1 tradeoff** — ships as-is because:
- The pattern was empirically verified against actual errors on the current SQLite/better-sqlite3 versions in this repo.
- The failure mode for drift is conservative: a message-text miss causes a real FTS5 parse error to propagate rather than be swallowed — a visible crash rather than a silent wrong answer.

**Slice D follow-up:** Consider a version-anchored test that asserts the error message for an unclosed-quote query matches the expected pattern, and/or a more structured FTS5-error signal if better-sqlite3 exposes one in a future release.
