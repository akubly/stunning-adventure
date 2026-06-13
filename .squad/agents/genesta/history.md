# Genesta — History

**Role:** System Architect (Substrate integration, Eureka-Cairn-Forge overlap, kernel extraction)
**Status:** Path D approved. R6-R8 verdicts locked. Cycle 2 C8 resolution: strict eslint + §40 documentation.
**Last update:** 2026-06-02

📌 **Team Alert** (2026-06-02T06:26:54Z): **Crucible Sprint 0 — First GREEN CYCLE COMPLETE** — Roger's implementation: acceptance scenario A1 passing, all 4 invariants GREEN. Packages: `@akubly/crucible-core` (NEW, types + session), `@akubly/crucible-cli` (re-exports from core). Types finalized: PrimitiveKind, PrimitiveInput, Session, SessionMetadata, Primitive. Range convention locked: inclusive-inclusive. Parent-registry approach: in-memory, logical delegation, no substrate integration yet. OQ-2 (Crucible L1 WAL vs Cairn event_log) remains pre-sprint-2. Genesta/Crispin/Edgar: Coordinate as needed pre-sprint-2 for L1 substrate decisions. — Scribe

📌 **Team Alert** (2026-06-02T06:13:21Z): **Crucible Sprint 0 Kickoff — First RED Test LANDED** — Graham (kickoff plan + types), Gabriel (infrastructure scaffold), Laura (first RED test confirmed). Inbox merged; decisions archived per 7-day rule. Session beginning NOW with outside-in GREEN descent. Genesta/Crispin/Edgar: Coordinate as needed for L1 substrate + schema overlap decisions pre-sprint-2. — Scribe

**Key milestones:**
- R6: B+ verdict on PRD v3 (v3.1 patch path recommended)
- Path D vision: Eureka standalone but kernel-shaped; Cairn adopts learning modules later
- R8: SessionId brand unification approved; extraction-ready design verified
- Cycle 2: C8 tiebreak — sided with strict layering; Eureka as independently deployable component
- 7-mechanism extraction readiness: Defense-in-depth verified

## Learnings

### 2026-06-06: OQ-2 Substrate Brief — FEDERATE Recommendation

**Task:** Evaluate MERGE vs FEDERATE for Crucible L1 WAL / Cairn event_log topology from Eureka/Cairn bounded-context perspective.

**Recommendation:** Option B (FEDERATE). The architecture already commits to "share identifiers, fork everything else" (§15.1). MERGE would violate §14.3 ("no shared substrate with Cairn"), require reworking Sprint 0's DB seam, and pollute Eureka's ingestion pipeline with Crucible event types it has no business understanding.

**Key insight:** The "one entity, two lenses" framing fails the write-pattern test. CRUD-with-update (Cairn) and append-only-with-CAS (Crucible) are not lenses on the same thing — they're different storage contracts. Forcing them into one table means one side's invariants yield to the other's.

**Artifacts:** Brief delivered to `.squad/decisions/inbox/genesta-oq2-substrate-brief.md`. Covers bounded-context verdict, schema-ownership risks for both options, federation boundary specification, and 5 cross-package gotchas.

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

**Scribe note (2026-05-30T12:30:54Z):** M5 cascade complete. Trust feedback mutation landed: `applyFeedback` activity + `TrustUpdater` seam interface. All 22 tests GREEN. §30 §2.3 ("Trust Dynamics Beyond the Static Floor") added to learning-systems spec. Next focus: M6 RED (user_correction tests + read-seam decision). Architecture remains extraction-ready; no changes to kernel boundary.

**Scribe note (2026-05-30T22:31:16Z):** M5+M6 COMPLETE & REVIEW-CLEAN. 3-cycle review consensus: 12→4→4 finding trajectory (0 blocking in C2+C3). Final: 40/40 tests GREEN, 11 commits on eureka/m5-m6-trust-feedback branch, tsc clean. Seams finalized:
- `applyFeedback` (trust computation + write)
- `applyFeedbackById` (read orchestration)
- `FactReader` (read seam, null-safe)
- Input validation guards + error contracts complete
- Deferred: M7-C (atomicity—caller serialization v1, backend CAS later)

Architecture remains kernel-extraction-ready. No substrate changes. Ready for Aaron's ship decision. Next: M7 roadmap (error typing, real FactReader, atomicity contract).

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe

📌 **Crucible Sprint 0 — DB Collaborator Seam ESTABLISHED** (2026-06-02T06:43:01Z): Roger's REFACTOR cycle introduces explicit DB interface (getSession, insertSession, queryEvents) + in-memory adapter (createInMemoryDB). Seam ready for L1-substrate swap (real SQLite integration stub via Refactor 3, then OQ-2 Cairn event_log integration pre-sprint-2). Genesta/Crispin/Edgar: Coordinate on L1 substrate decisions + schema overlap when OQ-2 lands. — Scribe
**Scribe note (2026-06-02T06:14:32Z):** M8 storage milestone kicked off (Aaron, 2026-06-01). Slices A→D planned. Aaron locked Q1=scaffold-A-write-B, Q2=cursor pagination, Q3=own eureka.db. Roger (Slice A impl SPAWNED) and Laura (contract audit SPAWNED) on branch eureka/m8-slice-a-sqlite-factreader.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)

**Scribe note (2026-06-06T07:00:21Z):** M8 Slice C COMPLETE — Roger (SqliteFactStore + FTS5 BM25 search, PR #48) + Laura (contract/edge audit, 12 tests). FactStore.search() now wrapped form `{ results, nextCursor? }` with BM25 ranking `-bm25(facts_fts)*trust DESC`, per-page normalization, base64-JSON offset cursor. FSE-1 (parse errors → graceful `{results:[]}`) fixed in Round 2. FSE-4 (caveat docs) documented. Laura's 109→121 test suite: BM25 ordering, cursor round-trip, boundary, isolation, NULL-trust, FTS5 syntax all verified. Verdict: ✅ ACCEPT-WITH-FOLLOWUPS. Slice D next.
## 2026-06-07 — M8 Slice D Complete

**Slice:** M8 Slice D — SQLite Production Deps Factory (Roger, Laura, Graham)  
**Status:** ✅ COMPLETE (147/147 tests, factory-on-subpath, Graham ACCEPT-WITH-FOLLOWUPS, SD-F1 ledger amendment applied)

**Summary:** Roger shipped factory functions (createSqliteRecallDeps, createSqliteFeedbackDeps) on @akubly/eureka/sqlite, preserving Slice A isolation. Laura added +2 smoke tests (SD-1, SD-2). Graham's architectural review: boundary integrity verified, composition root clean, spec tension resolved correctly. Scribe merged decisions inbox + applied SD-F1 ledger amendment.

**Key artifacts:**
- packages/eureka/src/sqlite/deps.ts — factory implementations
- packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts — SD-1, SD-2 smoke tests
- .squad/decisions.md — M8 Slice D as-built section (Graham SD-F1)

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

---

## 2026-06-10: M8 Slice D++ Shipped to Branch

**Session:** M8 Slice D++ keyset pagination (quad spawn)  
**Branch:** eureka/m8-slice-dpp-keyset  
**Status:** ✅ SHIPPED

Slice D++ completed with four-agent parallel execution. Genesta's architecture memo locked three interlocked decisions on cursor design, schema migration, and normalization strategy. Laura wrote 22 RED keyset tests. Crispin implemented migration 002, keyset GREEN phase, and persona fixes (cycle 2 clean). Roger completed doc sweep (N1-N4 stale comment fixes).

**Decisions locked:** D1=mutate cursor v1 in place to keyset; D2=importance/lastAccessed NOT in SQL sort key (time-varying recency breaks stability); D3=per-page normalization status quo. FSE-2 guarantee corrected: INSERT-safe only (not trust-mutation-safe).

Ready to merge.

---

## 2026-06-13: M8 Slice D++ Follow-up — Attention Columns Wired into FactStore Reads

**Agent spawn:** Laura (RED) + Crispin (GREEN)  
**Task:** Wire migration-002 columns into compositeScore input path  
**Status:** ✅ COMPLETE

Five new edge tests (FS-SE-16a–e) in `fact-store-sqlite-edges.test.ts` confirm `FactStore.search()` now hydrates `importance`, `last_accessed`, `attention_tier` from the SQL layer into `RecallResult` for every page.

**Wiring:** `SqliteFactStore.search()` extended: `SearchRow` interface + stmtFirst/stmtKeyset SELECTs + row mapper (importance, lastAccessed, attentionTier fields). Composite sort key (`-bm25*trust DESC, id ASC`) unchanged; attention columns are passenger data flowing into `compositeScore` calculation (FR-2 in recall.ts).

**Schema defaults preserved:** New facts get `importance=0`, `attention_tier='warm'`, `last_accessed=NULL` — identical output to pre-wire-up behavior (FS-SE-16e verified).

**Test result:** 205/205 passing, tsc clean.

Ready for Eureka activity layer to consume via compositeScore. Milestone M8 read-wiring complete.

---

## 2026-06-12: Attention-Column Read-Through Contract Enforcement

**Agents:** Laura (contract promotion), Crispin (wiring complete)  
**Task:** Promote attention-column hydration from SQLite-edges to shared FactStore contract  
**Status:** ✅ COMPLETE

Aaron directed: **attention-column read-through MUST be enforced at the contract level** so every FactStore implementation (including InMemoryFactStore) is held to the same invariant.

**Changes:**
- Extended `SeedFact` type with optional `attention` opts (5th parameter)
- Updated `InMemoryFactStore` to model `importance`, `lastAccessed`, `attentionTier` (no longer hardcoded defaults)
- Added contract assertions FS-12, FS-12b, FS-13 to `runFactStoreContract` — run for ALL implementations
- Removed FS-SE-16a–e from sqlite-edges (consolidated into contract suite)

**Pattern captured:** Optional seed opts for new columns across all impls. When storage schema gains observable columns, extend SeedFact → update all impls → add contract assertions for defaults AND non-defaults.

**Test result:** 206/206 passing (205 pre-existing + 1 net new). tsc clean. Both InMemoryFactStore and SqliteFactStore now enforce attention-column contract uniformly.

**Impact on Genesta/Cairn integration:** Attention columns now surfaced consistently at the FactStore contract level. Any future Cairn consumer of FactStore reads gets predictable attention metadata (not just SQLite-specific values). Extraction-ready design confirmed.
