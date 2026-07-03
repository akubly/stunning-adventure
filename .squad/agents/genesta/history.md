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

---

## 2026-06-16: Post-M8 Roadmap Assessment

**Task:** Determine next Eureka slice after M8 completion.

**Survey findings:** The Eureka package currently has exactly two activity verbs (`recall`/`recallWithScores` and `applyFeedback`/`applyFeedbackById`) — both in `src/activities/recall.ts`. Storage layer is mature: `FactStore` (read+search), `TrustUpdater` (atomic trust mutation), `FactReader` (single-fact read), all with SQLite + InMemory implementations and shared contract tests. Schema has 2 migrations (core facts + attention columns), FTS5 with BM25, keyset pagination, trust_history audit log.

**Key gap identified:** No write-path activity for fact creation. The `FactStore` interface is read-only; facts can only be created via direct SQL (test seeding). This makes Eureka unusable as a standalone API — the minimal loop (create → retrieve → feedback) is broken at step 1.

**Recommendation delivered:** `integrate` activity as next slice (Option A). Lowest risk, closes the MVP loop, unlocks downstream work (access promotion, retire/evict). Decision drop placed in `.squad/decisions/inbox/genesta-next-slice.md` as PROPOSED.

**Reasoning:** Considered recall side-effects (Option B) and retire/evict (Option C) as alternatives. Both depend on facts existing in the store, making them sequentially downstream of `integrate`. The activity model in §10 §10.1 specifies `integrate` as the entry point for all knowledge — shipping it first aligns with the spec's data flow.

### 2026-06-16: Verb Conflation Correction — `imprint` vs `integrate`

**Trigger:** Aaron challenged the `integrate` naming: "I naively would have expected integration to be more of a maintenance operation than the outermost 'write path'? There's committing things to memory and then there's *processing* a piece of information *in the context* of other, previously encountered information."

**Finding:** Aaron is correct. The PRD v5 §3 explicitly defines `integrate` as "Take in new material; **reconcile with existing facts**" and states "Integration is a system property, not a one-shot ingestion." The §10 spec conflates two distinct operations:

1. **Imprinting** — raw mechanical write (what §10's implementation section actually describes)
2. **Integration** — cognitive processing in context (what §3's conceptual model describes)

The "activities are runtime verbs, not storage nouns" principle demands the split. A raw INSERT is a storage operation, not a cognitive activity. Calling it `integrate` hides the absence of reconciliation logic behind a prestigious name.

**Corrected vocabulary:**
- `imprint` — raw fact creation, no contextual processing
- `integrate` — orchestration verb: recall existing → classify (novel/dup/contradiction) → branch to imprint/mutate/link

**Revised recommendation:** Ship `imprint` as the next slice (mechanical write path). `integrate` (cognitive verb) becomes a separate, later slice with its own design cycle for dedup keys, similarity thresholds, and edge schema.

**Key insight for future:** When the PRD bundles "take in new material" with "reconcile with existing facts" in one verb definition, that's two verbs wearing a trenchcoat. The open questions in §10.4 (dedup, conflict resolution) are symptoms of the conflation — they only arise because the spec tried to be both a write verb and a processing verb simultaneously.

### 2026-06-16: `imprint` Contract Spec Delivered (Aaron DECIDED)

**Decisions locked by Aaron (2026-06-16T23:03):**
- writeVerbName = `imprint` (raw write path)
- sequencing = parallel (Crispin drafts integrate orchestration design in parallel)
- vocabAmendment = amend FR-4 (imprint added, integrate clarified as cognitive orchestration)

**Deliverables produced:**
- `imprint` activity contract + seam spec (plain-text output to Laura/Crispin)
- FR-4 vocabulary amendment: `.squad/decisions/inbox/genesta-imprint-vocab-amendment.md` (DECIDED)
- Next-slice decision drop updated to DECIDED status

**Contract design choices:**
- `FactWriter` seam interface with single `write()` method (mirrors TrustUpdater's `mutate()` pattern)
- `ImprintOptions` / `ImprintDeps` named types (mirrors RecallOptions/RecallDeps)
- Clock injection for `createdAt` determinism (established pattern from recall)
- UUID generation via injectable `IdProvider` seam (testable, no randomness in tests)
- Input validation fires before first await (established pattern from applyFeedback)
- 14 contract assertions (IM-1 through IM-14) covering happy path, defaults, validation, isolation, round-trip with recall
- Explicit scope-out of dedup/reconciliation/context-awareness (integrate's job)

---

## 2026-06-17: Eureka imprint Slice SHIPPED (M8 Follow-Up)

**Result:** ✅ COMPLETE — 256/256 eureka tests GREEN, tsc clean

**Decisions merged to decisions.md:**
1. FR-4 Vocabulary Amendment (DECIDED)
2. `imprint` Activity Contract (DECIDED)
3. Post-M8 Roadmap — `imprint` as next slice (DECIDED)
4. `integrate` Orchestration Design Memo (PROPOSED, pending Aaron review on Q1/Q2)

**Artifacts shipped:**
- Genesta: 3 DECIDED decisions + 1 PROPOSED orchestration design (integrate)
- Crispin: GREEN implementation (activity + storage + tests) + integration design memo
- Laura: RED tests (24 contract tests, IM-1..IM-14, 2 runners)

**Orchestration logs written:** 3 logs per agent (UTC timestamps, `.squad/orchestration-log/`)
**Session log:** `.squad/log/2026-06-17T064851Z-eureka-imprint-slice.md`
**Scribe processing:** inbox merged (5 files → decisions.md), deleted inbox/, staged durable .squad files, committed

**What's next:** Aaron decision on integrate design memo (Q1: integrate landing? Q2: dedupKey?). Once decisions locked, Crispin proceeds with `integrate` cognitive orchestration slice.

---

### 2026-06-21: Imprint Slice — Persona Review 2-Cycle Complete (Ready to Ship)

**Event:** Persona review completed on eureka/imprint-slice (commits 0dd7c38 → c64092b → a9067a8). Genesta participated in the Architect persona role, validating design scope and interface boundaries.

**Cycle 1 review:** 5 important + 3 minor findings. All 8 accepted and fixed; 2 rejected (out-of-scope/inconsistent). Fixes at c64092b.

**Cycle 2 re-review:** All cycle-1 fixes verified resolved. 1 residual minor (doc block) applied a9067a8.

**Architecture outcome:** Scope locked correctly (write path only, no read-seam coupling). Interfaces clean, integration-ready. No architectural debt introduced.

**Tests:** 258/258 eureka tests green, tsc clean.

---

## 2026-06-23: `integrate` v1 Slice — Scope + Design Brief

**Task:** Define scope, contract, decisions, and RED test plan for `integrate` v1 (public write API; first activity after `imprint` shipped in PR #81).

**Deliverable:** `.squad/decisions/inbox/genesta-integrate-slice-scope.md` — full brief with 6 decisions flagged for Aaron sign-off and a 20-test RED list.

**Contract proposed:** `integrate(IntegrateOptions, IntegrateDeps): Promise<IntegrateResult>` where `IntegrateResult = {outcome:'created'|'duplicate', factId, existingFactId?}`. `integrate` calls `imprint` (does not bypass to `FactWriter`) — preserves "one cognitive verb per physical write" rule.

**Key scoping move:** v1 `integrate` does exactly ONE thing `imprint` cannot — consult existing knowledge before writing. Exact-content dedup probe via new `FactReader.findByContent` seam. Everything else from Crispin's classification memo (relations table, contradiction edges, supersedes, dedupKey column, near-dup BM25, LLM classification) explicitly deferred to v1.5. Principle: smallest cognitively-honest slice that earns the name.

**Decisions needing Aaron:**
- D1 dedup mechanism (rec: exact match, not BM25 threshold)
- D2 dedup-hit behaviour (rec: return existing FactId + touch last_accessed)
- D3 touch seam (rec: extend FactWriter)
- D4 kind/verb columns (rec: defer; document deviation from spec §10.1)
- D5 decide→integrate coupling (rec: caller-owned)
- D6 error class (rec: new InvalidIntegrateError)

**Schema cost:** Migration 003 = single index `facts(session_id, content)`. No new tables, no new columns. Surgical.

**Seam ownership:** Genesta defines `IntegrateOptions/Result` + extends `FactReader`/`FactWriter` interfaces. Crispin implements (sqlite + in-memory) and ships migration 003. Laura writes IT-1..IT-20 in two wirings (~24-26 tests, similar size to imprint slice).

**Insight:** The Spec §10.1 contract `integrate(fact: Fact) → FactId` understates the cognitive content. v1 needs a richer return type (discriminated union) so callers can distinguish "I created" from "you already knew this." Suppressing that distinction would re-create the same conflation Aaron caught between `imprint` and `integrate` six days ago.

---

## 2026-06-24: D2 Resolved — Touch lastAccessed, Do Not Bump Trust/Importance/accessCount

**Aaron's question:** Was imprint's `last_accessed=NULL` an oversight or deliberate? Should integrate-dedup merge/bump?

**Sourced finding:**
- NULL is DELIBERATE. Locked by migration 002:12,22 + recall.ts:190-194 F3 logic + MIG-3 test + FS-13 + FS-writer contracts. compositeScore depends on NULL meaning "very stale, recency floor 0.1."
- `access_count` column DOES NOT EXIST anywhere in eureka. Spec §10 nominally bumps it on recall but recall.ts:217 explicitly marks it as a deferred future beat. Not missing from imprint — never built.
- No activity currently writes `last_accessed`. Integrate-dedup-touch would be the FIRST.

**Decomposition of Aaron's "merge/bump":** Four sub-operations, four different verdicts:
1. Touch lastAccessed = YES (cheap, semantically clean, surfaces re-encountered facts)
2. Bump trust = NO (duplicates applyFeedback('corroboration') path which is audited via trust_history; dedup-in-session is rarely independent evidence)
3. Add accessCount column = NO this slice (asymmetric attention model — must cover recall too)
4. Bump importance = NO (no spec for delta; runaway growth risk)

**D2 = B (touch only).** D3 = A (extend FactWriter with `touch()`). Migration 003 stays scoped to the single dedup index.

**Boundary clarified:** integrate-dedup and applyFeedback('corroboration') are now formally complementary, not overlapping. Caller composes both explicitly when corroboration semantics are wanted.

**Test additions:** IT-18 (no trust mutation), IT-19 (no importance/tier mutation), IT-20 (recency observable through recall after touch), IT-21 (touch.at == clock.now()). Total RED list ~27-30 tests.

**Insight:** The "verbs not nouns" principle pays off again. Touching lastAccessed is a write-path observation ("this fact was encountered"). Bumping trust is a feedback-path judgment ("this evidence is independent"). Collapsing them into one auto-bump on dedup would re-create the same conflation Aaron caught between imprint and integrate — different verbs, different audit trails, different epistemic commitments.

---

## 2026-06-24: REFRAME — `integrate` is consolidation, NOT a write wrapper (Aaron challenge)

**Aaron's reframe (verbatim):** "When I think of Jungian integration, I'm thinking about something that's done after-the-imprint. In humans, it's behind the scenes and subconscious, often during REM. It's the processing, reconciling, re-interpreting, linking and cross-referencing."

**Spec audit revealed an internal inconsistency:**
- §10/§30 signature: `integrate(fact) → FactId` — literal row-insert (§30 §1.1 algorithm: `insert + emit + return`).
- PRD §3 prose: "Take in new material; **reconcile with existing facts**" — Aaron's reading.
- `sweep` (§30 §4.2): 5 phases including Tier 2 edge population (`similar_to`, `co_accessed_with`) and edge weight reconciliation — this is the actual consolidation machinery.
- `meditate` (v1.5, §30 §1.8): pseudocode literally calls `integrate(pattern, ...)` — so integrate is a PRIMITIVE of meditate, not a peer.

We already caught this conflation on 2026-06-16 (split out `imprint`) but then re-collapsed integrate back into "imprint + dedup" — exactly what Aaron is flagging.

**Three options presented:**
- **A:** Ship status quo (integrate = write wrapper, name is a polite fiction).
- **B (RECOMMENDED):** Promote `imprint` to public write API. `integrate({sessionId}) → IntegrationReport` becomes a NEW verb that operates on already-imprinted facts and produces edges/links. Requires §10/§30 vocabulary amendment. Imprint always writes — duplicates discovered later via integrate (matches REM semantics).
- **C:** Hybrid — keep §10 signature; do write + localized reconciliation in one call (trenchcoat returns).

**Key insight:** In Option B, imprint stays lossless. Duplicates are NOT prevented at write time; they're MARKED later. This is cognitively correct (you don't refuse to perceive something just because you already perceived it — you discover the resemblance later). It also removes the dedup-probe-before-write race risk and composes naturally with v1.5 background sweep/meditate (they just call integrate on a scope).

**v1 walking skeleton (Option B):** `listBySession` → pair scan for exact-content matches → write `duplicate_of` edges to migration-003 `relations` table → return report. ~13 RED tests. Requires Crispin's parallel representation feasibility assessment to confirm migration 003 is v1-feasible.

**Decisions invalidated by Option B:** D1, D2, D3 (no probe-before-write). D4, D5, D6 survive.

**Naming impact:** Vocabulary amendment to §10/§30: amend `integrate(fact) → FactId` to `integrate({sessionId}) → IntegrationReport`; add `imprint(fact) → FactId` as public write verb (already shipped, just promote to first-class).

**Status:** Brief updated; waiting on (a) Aaron's choice among A/B/C and (b) Crispin's parallel rep-feasibility finding.

---

## 2026-06-24T22:39: Option B LOCKED — contract published; docs amended

**Aaron approved Option B.** Coordinator confirmed v1 writes ONLY `duplicate_of` edges; CHECK vocab reserves supersedes/contradicts/supports for v1.5; FeedbackEvent='corroboration' shipped form stays (distinct from future supports edge).

**Deliverables completed:**
1. **Contract locked** in `.squad/decisions/inbox/genesta-integrate-slice-scope.md` — TypeScript signature for `integrate(IntegrateOptions, IntegrateDeps): Promise<IntegrationReport>`, `RelationEdge` projection, `FactReaderListSession` + `RelationWriter` seam interfaces, `IntegrationReport` shape ({sessionId, factsScanned, duplicatesFound, edgesWritten, pairs[{keptFactId, duplicateFactId}]}), 13-test RED plan, error contract.
2. **§10 amended** (docs/eureka/sections/10-activities-and-tiers.md): vocabulary amendment header; `integrate(fact)→FactId` replaced with `imprint(options)→FactId` + `integrate(options)→IntegrationReport`; deprecation note for old signature; tier matrix gains imprint row.
3. **§30 amended** (docs/eureka/sections/30-learning-systems.md): full §1.0 imprint + §1.1 integrate sections; inline fixes to §1.8 meditate pseudocode (writes via imprint), §3.1 short-loop step 5, §4.1 scheduling split, §5.1 timing budget gains integrate target (<50ms per session, O(n²)).
4. **Seam boundary CONFIRMED** with Crispin: Genesta owns activity contract/types/IntegrationReport/error class + interface declarations; Crispin owns migration 003 + Relation type + RelationWriter + FactReader.listBySession + composition root + imprint public re-export.

**Status of prior decisions under Option B:** D1/D2/D3 MOOT (no probe-before-write); D4 (kind/verb defer), D5 (caller-owned), D6 (new InvalidIntegrateError) retained.

**Insight crystallized:** "Imprint always writes, integrate discovers later" is the v1 cognitive model. Cleaner than any probe-based design because (a) imprint stays lossless and idempotent on its own terms, (b) the same `integrate({scope})` verb composes naturally with v1.5 background sweep/meditate without API change, (c) verb name finally matches behaviour — no more trenchcoat.

**Next:** Crispin builds wave-2 GREEN (activity body, migration 003, storage adapters, composition root). Laura writes RED against the locked contract. I do NOT implement; charter is held.

---

## 2026-06-25T07:17:47Z: Eureka `integrate` v1 Slice SHIPPED (Option B Complete)

**Status:** ✅ COMPLETE — 350/350 eureka tests GREEN (core + substrate + integrate contract), tsc clean

**Wave 1 (Crispin substrate):** ✅ Landed 2026-06-24T22:39  
Migration 003 (fact_relations table, 4-kind vocab CHECK, UNIQUE constraint, indices, MIG-7..MIG-13). RelationWriter seam + in-memory/sqlite impls. FactReader.listBySession extension. factId on RecallResult (F9). 319 tests passing.

**Wave 2 (Crispin activity + Genesta/Laura coordination):** ✅ Landed 2026-06-25T00:17  
`integrate.ts` activity body (pair-scan, STAR-TO-CANONICAL topology, IntegrationReport). InvalidIntegrateError. RelationWriter.writeEdges batch method. Composition root createSqliteIntegrateDeps. All 30 IT-* tests green (15 core × 2 wirings). 349 tests passing.

**Laura reconciliation:** ✅ Completed 2026-06-25T07:17  
IT-S1 direct SQL query: column name reconciliation to schema truth (relation_kind, not edge_type). Full suite: 350/350 GREEN.

**Orchestration logs:** Written 3 logs (genesta/crispin/laura UTC timestamps, `.squad/orchestration-log/`)  
**Session log:** `.squad/log/20260625T071747Z-integrate-slice.md`  
**Decisions:** 3 inbox files merged to `.squad/decisions.md` (genesta-integrate-slice-scope.md + crispin-integrate-seam.md + laura-integrate-test-plan.md)  
**Scribe processing:** Merged inbox, deleted inbox files, staged durable .squad files, committed  

**Key decisions locked under Option B:**
- Integrate is post-imprint consolidation (not write wrapper) — pair-scan detects duplicates, writes `duplicate_of` edges
- STAR-TO-CANONICAL topology (all newer dups → oldest, never chain)
- 4-kind relation vocabulary in CHECK: `duplicate_of | supersedes | contradicts | supports` (v1 writes ONLY duplicate_of)
- Soft reconcile, append-only facts (no content mutation)
- Synchronous validation before first await (matches imprint F1)

**Architecture outcome:** Integrate v1 ready for integration into decide/commit/evict flow. v1.5+ work (sweep, meditate, cross-session, near-duplicate) deferred per scope. No architectural debt. Append-only fact representation preserved. Cognitive verb purity maintained (imprint writes, integrate discovers, feedback judges).

**Test trajectory:** Baseline 258 → imprint +50 (308) → integr substrate +11 (319) → integr contract +30 (349) → IT-S1 cosmetic +1 (350).

**Insight:** The reframe from "integrate as write wrapper" (Option A, pre-2026-06-24T22:33) to "integrate as consolidation pass" (Option B) resolved the semantic drift in both the spec prose and the cognitive model. "Imprint always writes, integrate discovers later" eliminates the race-window risk, composes naturally with v1.5 background machinery, and makes the verb name finally fit the behaviour.

## Learnings — 2026-06-25 Fix Wave (persona review cycle 1)

Aaron triaged 5 doc fixes against the Option B integrate slice. Applied doc-only edits to §10 and §30 on branch ureka/integrate-slice:

1. **DOC/CODE DRIFT** — Aligned all prose to migration 003: table act_relations; columns rom_fact_id, 	o_fact_id, elation_kind; UNIQUE (session_id, from_fact_id, to_fact_id, relation_kind). Confirmed zero remaining elations/rom_id/	o_id/dge_type references via grep.
2. **ACTIVITY-COUNT CONSISTENCY** — Normalized to one authoritative count across §10 and §30: **10 named (FR-4); 3 shipped v1 (imprint, ecall, integrate); 7 reserved v1.5+ (erank, decide, commit, etire, vict, meditate, contemplate)**. Demoted earlier "7/8 v1" prose; tier matrix updated to ⚠️ for v1.5 activities.
3. **D-R3 first-write-wins** — Documented in both §10 (integrate Side Effects) and §30 (§1.1 Measurable Outcomes): ON CONFLICT DO NOTHING means weight/confidence on existing edges cannot strengthen in v1; refinement deferred to v1.5.
4. **D-R2 perf bound** — Documented MAX_SESSION_FACTS in-memory cap; algorithm corrected to O(n log n) group-and-emit (was O(n²) pair-scan); §5.1 perf target stays at ~50ms; DB-side GROUP BY deferred to v1.5.
5. **S4 write-only** — Documented act_relations has no runtime consumer in v1; recall-side consumer lands in a later slice (intentional incremental delivery).

**Learning:** When pseudocode drifts from the shipped schema, fix the schema identifiers and the algorithmic complexity in the same pass — they're usually wrong together (both reflect an earlier mental model). Also, "activity-count consistency" is a load-bearing invariant: every doc that asserts a count must agree, or persona reviewers (rightly) flag it.

Source name change to remember: the integrate read seam is **SessionFactLister** (was FactReaderListSession). Use that name in any future references or test scaffolding.

## Learnings — 2026-06-25 §20 Reconciliation (persona review cycle 2)

Skeptic found §20.2 ("Cross-Reference Model") still presented the full 13-kind EdgeType = | string taxonomy as if available, contradicting migration 003's locked 4-kind CHECK vocabulary. Reconciled §20 with shipped reality on branch `eureka/integrate-slice`:

- **§2 intro / §2.2 / §5.1 / §6.1 / §10:** Renamed `relations` → `fact_relations`; `from_id`/`to_id`/`edge_type` → `from_fact_id`/`to_fact_id`/`relation_kind`; `EdgeType` → `RelationKind` (the v1 4-kind union: `duplicate_of` | `supersedes` | `contradicts` | `supports`).
- **§2.2 rewrite:** Clean "Shipped v1 (migration 003)" section followed by "Reserved for v1.5+ (NOT shipped)" — the broader 12-kind `FutureRelationKind` taxonomy is preserved as a design sketch with an explicit non-shipped marker. Added D-R3 first-write-wins note and S4 write-only note here too (mirrors §10/§30).
- **§5.1:** Example edges marked ✅ v1 for `duplicate_of` only; `contradicts`/`supersedes`/`supports` marked ⚠️ v1.5; `originated_in`/`cites` flagged as NOT in v1 CHECK vocabulary at all. Distinguished `supports` edge from `applyFeedback('corroboration')` — same distinction as §10/§30.
- **§7.2 Graph Traversal:** Marked as v1.5+ NOT shipped; reflects S4 (write-only table → no traversal yet).
- **§10 Checklist:** Schema migration item checked off (migration 003 shipped); graph traversal demoted to v1.5+.

**Learning:** When reconciling docs that pre-date the shipped schema, search for **all three identifier sets** in lockstep — the table name (`relations` vs `fact_relations`), the column names (`from_id`/`to_id`/`edge_type` vs `from_fact_id`/`to_fact_id`/`relation_kind`), and the type name (`EdgeType` vs `RelationKind`). Missing any one of them leaves the doc internally inconsistent. Also: when the design vision is broader than v1, frame it as **"Shipped v1 vs Reserved v1.5+"** rather than deleting the vision — readers need the future intent visible to plan against, but the section header must make ship-vs-reserve unambiguous.

📌 **Team update (2026-06-26T19:29:13Z):** eureka/integrate-slice — Persona Review Cycle 1 & 2 COMPLETE. Genesta doc reconciliation shipped (commits edfff56, 7848d76): §10 and §20 aligned to migration 003 schema and integrate v1 (consolidation-pass) model. Tier-Activity Matrix updated, learning-systems section reconciled. Vocabulary locked: imprint, integrate, recall, rerank, decide, commit, retire, evict (v1). Durable team convention: Test type-check gate now permanent in CI. All agent histories appended (Append-Only Rule maintained). — Scribe
