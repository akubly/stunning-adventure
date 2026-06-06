📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

## Learnings (2026-06-05 — M8 Slice B cycle-2 persona-review fixes)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 730327f (helper extract), 8bb739f (I2/M1/M6), a1002d4 (M2), cd82681 (I1), b9404e7 (I5/M4/M5)

**Helper extraction was right.** Moving `runTrustUpdaterContract` into a `.ts` (non-`.test.ts`) helper file resolves the vitest double-registration problem cleanly AND makes the helper importable without triggering test execution. The naming convention `*.contract.helper.ts` is now the pattern for all future exported contract helpers in this package.

**Async harness future-proofing costs almost nothing.** Making `getTrust` return `number | undefined | Promise<number | undefined>` and awaiting it in tests adds one `await` per assertion. The cost is negligible; the payoff is that future I/O-backed harnesses (e.g., a remote DB or async file I/O) can implement `getTrust` asynchronously without changing the test code. Same for `makeHarness: () => ... | Promise<...>` and `cleanup: () => void | Promise<void>`.

**`.bind(harness)` was gratuitous.** The InMemory harness methods don't use `this` at all (they close over `store` and `locks`). The SQLite harness methods also don't use `this` (they close over `db`/statements). Plain assignment is correct and matches FactReader precedent.

**Named params ($name) enforce a style contract.** The SqliteFactReader (Slice A) already used `$fact_id` / `$session_id` with object-form `.get({ ... })`. Keeping SqliteTrustUpdater on positional `?` params was a style divergence that would silently invite parameter-order bugs as SQL evolves. The persona caught it correctly.

**C-3b (out-of-range) is a materially distinct invariant.** C-3 covers NaN (non-finite); C-3b covers finite-but-out-of-range (1.5, -0.1). These exercise different branches of the validation check (`!Number.isFinite(newTrust)` vs the `< 0 || > 1` guard). A single parameterized test over `[NaN, 1.5, -0.1]` would have worked too, but the current C-3 + C-3b split is clear and avoids a for-loop test that hides which case failed on first failure.

**WAL + busy_timeout are implicit contracts on `SqliteTrustUpdater` constructors.** The class doesn't set these itself — it inherits them from the injected `db` handle. Without documenting this, a future consumer who passes a raw `new Database(path)` handle would get subtly broken concurrency behaviour (SQLITE_BUSY failures instead of retries). The pragma assumption section in JSDoc is the right place to make this explicit.

## Learnings (2026-06-05 — M8 Slice B cycle-3 polish + Slice A retrofit)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af8b596 (N1+N2), 8f48e2f (N3+N4), 1cec460 (N5)

**`it.each` is the correct tool for boundary parameterization.** A `for` loop inside `it()` masks first-failure: if `1.5` fails, `-0.1` never runs. `it.each([1.5, -0.1])` creates two independent test cases so each bound is independently reported. The pattern applies to any test that checks multiple values of the same invariant — particularly validation boundaries. Count impact: +2 tests per wiring × 2 wirings = +4 total (95 → 97 after Commit 1 in this cycle, then 97 steady through cycles 2 and 3).

**The `*.contract.helper.ts` naming convention is now load-bearing for Slice C.** Both `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts` follow the same non-`.test.ts` pattern. Slice C's `runFactStoreContract` should land in `fact-store-contract.helper.ts`. The SKILL forward-pointer (N5) documents this explicitly so the Slice C author doesn't have to re-derive it.

**Slice A retrofit was low-risk but high-value.** The FactReader contract file had been stable since Slice A merged (~5 days), making the diff visible and reviewable. The actual change was small (extract helper + wiring-only test file + typed prepare), but it brings both contract suites to the same structural pattern before Slice C inherits them. Retrofitting AFTER Slice C would be harder (more files to touch, possibly conflicting edits). The lesson: harmonize sibling patterns at end-of-slice, not end-of-milestone.

**`ReturnType<Database.Database['prepare']>` is the wrong field type for typed statements.** The broad type forces a runtime `as FactRow | undefined` cast on every `.get()` call. `db.prepare<BP, R>()` returns `Database.Statement<BP, R>` where `.get()` is typed as `R | undefined`. Using the typed generic form eliminates the cast, narrows errors at compile time, and documents the expected bind-parameter shape at the call site. This is the pattern SqliteTrustUpdater already used; the Slice A retrofit applied it retroactively to SqliteFactReader. Future SQLite implementations (SqliteFactStore) should use typed generics from the start.

## Learnings (2026-06-05 — M8 Slice B cloud review cycle 1)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** 0cdf205 (T1+T2), 418c146 (T3), 2ab52f3 (T4), 4ffdb73 (T5)

**Docstring counts go stale when test-generation changes.** The `it.each` conversion in cycle-2 changed C-3b from 1 test to 2 per wiring, but the JSDoc on `runTrustUpdaterContract` (and the SKILL reference) still said 8. Copilot's review caught it. Fix: update docstrings in the same commit that changes the test structure, not after. The count is part of the contract surface — if it's wrong, it misleads the next person wiring a new impl.

**The N2 comment pattern was TrustUpdater-specific.** The "InMemory impl lives inline here, test-only" comment is correct for TrustUpdater (the impl is literally defined in the wiring file, not imported). It's wrong for FactReader (which imports `InMemoryFactReader` from a production module). Copying patterns across similar-looking files without checking whether the premise still holds is how stale comments happen. Read before copy.

**Append-not-rewrite is the right policy for decision logs.** The tombstone decision (Decision 2 in decisions.md) described a choice that was later reversed. Editing the original entry would erase the context for WHY we initially tombstoned (vitest 3.x no-empty-file requirement). The append-update preserves both the original reasoning and the reversal rationale. Future readers can follow the full arc. Applied this consistently.

**CRLF in non-code files happens silently.** Rosella's history.md had 7 carriage-returns (CRLF sequences at 3 line endings). These come from editors or CI runners that don't respect `.gitattributes`. The fix is `ReadAllText / -replace / WriteAllText` in PowerShell — more reliable than `sed` on Windows. The git warning "LF will be replaced by CRLF" on commit is a `.gitattributes` artifact (text=auto); the file was cleanly committed as LF.

## Learnings (2026-06-05 — M8 Slice B cloud review cycle 2)

**Branch:** `eureka/m8-slice-b-sqlite-trust-updater`  
**Commits:** af390ba (T6), ccdf994 (T7)

**`UTF8Encoding(false)` is the correct PowerShell pattern for BOM-free writes.** `[System.IO.File]::WriteAllText(path, content)` uses the system default encoding (BOM on Windows). `[System.Text.Encoding]::UTF8` and `[System.Text.UTF8Encoding]::new($true)` both include BOM. Only `[System.Text.UTF8Encoding]::new($false)` suppresses it. When fixing encoding issues in non-code files, always write explicitly with `UTF8Encoding($false)` to avoid the T3 → T6 two-step. The lesson is to use it the first time rather than discovering the BOM in a follow-up review.

**BEGIN IMMEDIATE serializes within a single connection; JS event-loop serializes across async calls from the same connection.** For a synchronous library like better-sqlite3, Promise.all() in the same process doesn't create true concurrency — each mutate() call runs to completion before the JS engine yields. The transaction wrapper enforces that READ + fn + WRITE happen atomically within one mutate() call; it plays no role in ordering ACROSS calls from the same JS thread. BEGIN IMMEDIATE matters only when two separate Database handles (different connections, possibly different processes) compete for the write lock. Getting this distinction wrong in comments misleads future readers about WHERE the safety boundary is.

## Learnings (2026-06-05 — M8 Slice C: SqliteFactStore + FTS5 BM25)

**Branch:** `eureka/m8-slice-c-factstore`

**BM25 sign convention is the primary footgun.** `bm25(facts_fts)` returns NEGATIVE values where more-negative = better match. Using it directly in ASC ORDER BY sorts best matches LAST. The fix is `ORDER BY (-bm25(facts_fts)) * trust DESC`. The FS-4 contract test (higher-frequency term fact ranks first) is the regression lock. Every SQLite FTS5 implementation must own this pattern or it will silently break ordering on first write.

**Per-page min-max normalization is the right call for v1.** Normalizing `relevance` to [0,1] via min-max across the result page is simple and correct for single-page recall (RANKER_OVERFETCH_FACTOR × k). Cross-page normalization (where page-1 and page-2 relevances are comparable) requires two queries or a separate max-score fetch — deferred until cross-session pagination needs it. Document the choice so the next person doesn't re-derive it.

**Interface reconciliation (wrapped return) is a mechanical but real change to merged code.** The `recall.ts` change from `Promise<RecallResult[]>` to `Promise<{ results: RecallResult[]; nextCursor? }>` required updating 10 mock sites in `recall.test.ts`. Each was `mockResolvedValue([...])` → `mockResolvedValue({ results: [...] })`. The pattern is mechanical but if you miss one the test silently passes (undefined.filter(...) would throw, but vitest vi.fn() with no args returns undefined, not []). Grep for `mockResolvedValue` in the test file before declaring done.

**Offset cursors are pragmatic for v1 FTS5 pagination.** Rowid+rank keyset cursors require stable rank values — BM25 floats are session-stable but not write-stable. For v1 single-page recall, offset is deterministic. Encode as base64 JSON `{ offset }` so the format can be extended (add `sessionId`, `queryHash`, etc.) without a breaking cursor change. Document the choice; the next person will want to understand why you didn't use a keyset cursor.

**Schema gaps (attentionTier, importance, lastAccessed) default gracefully.** None of these fields are in the `facts` table yet. `attentionTier='warm'` (identity multiplier 1.0), `importance` omitted (FR-2 uses 0), `lastAccessed` omitted (recency floor 0.1). The composite scorer still runs — results are just conservative. A future migration `002-fact-fields.ts` can add the columns without breaking Slice C's implementation (it SELECTs only content, trust, bm25_score).

**The `*.contract.helper.ts` naming + non-`.test.ts` rule extends naturally to FS.** `fact-store-contract.helper.ts` follows the exact same pattern as `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts`. The wiring test in `fact-store.contract.test.ts` imports from the helper. Vitest ignores the helper file (not `.test.ts`). The pattern is now consistent across all three storage seams.

## Learnings (2026-06-05 — M8 Slice C follow-ups FSE-1 + FSE-4)

**Branch:** `eureka/m8-slice-c-factstore` (follow-up commits on same branch, PR #48)

**FTS5 error messages don't always contain "fts5".** The intuitive narrowing check `/fts5/i.test(err.message)` fails for `"unterminated string"` (unclosed quote) and other tokenizer-level errors. SQLite's FTS5 query parser errors all carry `code === 'SQLITE_ERROR'` (numeric 1). Non-parse errors use distinct codes: SQLITE_CORRUPT=11, SQLITE_IOERR=10, SQLITE_BUSY=5. Narrowing on code alone is the correct approach for this call site because we're inside a method that ONLY runs FTS5 queries — a false SQLITE_ERROR from a non-FTS cause would require schema corruption or an impossible misuse of the prepared statement. Don't over-narrow on message text for FTS5 errors; narrow on the error code instead.

**Laura's edge test locking the broken behavior (FS-SE-11) is the right pattern.** She wrote the test asserting the rejected Promise BEFORE the fix, which made the finding machine-verifiable. Updating the test to the new contract (resolves to `{ results: [] }`) makes the fix machine-verifiable too. This is the correct audit → fix → relock cycle. The `[FINDING FSE-1]` annotation in the old test title is a useful trail even after the fix; the new title says `(FSE-1 fix)` so the arc is traceable.

**Per-page relevance normalization needs documentation at two levels.** The JSDoc on `RecallResult.relevance` (the field) AND on `FactStore.search` (the return type) should both call out that relevance is per-page only. Documenting it only at one level leaves the other as a trap for future consumers who read the type definition but miss the field comment (or vice versa). Both are load-bearing: consumers of the interface read the return type; consumers of results read the field.

## Learnings (2026-06-05 — M8 Slice C code-panel F1–F7 findings)

**Branch:** `eureka/m8-slice-c-factstore` (F1–F7 fixes on same branch, PR #48)

**F1: relevance ≠ sort order is a design, not a defect.** The `compositeScore` consumer weights relevance, trust, importance, and recency as four independent orthogonal signals (each with its own coefficient). Baking trust into `relevance` via composite normalization (`-bm25 × trust`) would double-count trust — it already has a 0.20 weight in the scorer. So: `relevance` = pure `-bm25` normalized; ORDER = composite. When trust varies, a high-trust/low-BM25 fact can sort first while carrying lower relevance. FS-SE-1b is the regression lock for this design. The FS-4 equal-trust lock is still valuable because it verifies the BM25 footgun (negation) under controlled conditions.

**Narrow FTS5 catch with message pattern in addition to error code.** After consulting actual SQLite error messages for missing tables vs FTS5 parse errors: a dropped `facts_fts` table produces a `SQLITE_ERROR` with message `"no such table: facts_fts"` — it does NOT match the FTS5 parse pattern. This is good news for the narrowing: `code === 'SQLITE_ERROR' && /fts5|unterminated|syntax error|malformed MATCH/i` correctly lets the missing-table error propagate. The earlier code-only check (no message filter) was too broad — it would have swallowed the missing-table error. Always verify the message against real SQLite output before deciding on pattern breadth.

**F3 tie-breaker: `f.id ASC` is cheap and correct.** `f.id` is autoincrement INTEGER PRIMARY KEY — guaranteed unique and monotonically increasing (insertion order within a session). Adding `f.id ASC` as secondary sort on the `ORDER BY` clause costs nothing at query time (BTree INTEGER PK) and makes OFFSET pagination deterministic across tied composite scores. The InMemory reference impl should mirror this with `a.factId.localeCompare(b.factId)` since factIds are insertion-order strings in the harness.

**F4 limit validation prevents infinite pagination loops.** `limit=0` produces OFFSET 0, LIMIT 0, returns 0 results, `nextCursor` defined, next call produces the same state — infinite loop for any consumer that auto-paginates. `limit=-1` makes SQLite treat it as unlimited (implementation quirk). Both are bugs, not edge cases. `TypeError` is the right signal because `limit` is a misuse of the API contract, not a data error. Apply at both SqliteFactStore AND the InMemory reference impl so the contract test catches both.

**F5 cursor versioning is Slice D work.** The v1 offset cursor is NOT bound to query params, session, minTrust, or limit. Cross-parameter reuse is undefined behavior (silently returns wrong page). The right fix (scope fingerprint: hash of query+sessionId+minTrust+limit) is deferred to Slice D when we add cursor validation. Document with code comments NOW so the next author doesn't have to rediscover the gap.
