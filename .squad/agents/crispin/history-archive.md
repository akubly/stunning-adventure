## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Substrate ownership clarified; stable mocking seams for v1 implementation  

**For Crispin's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. No more drift risk for `SessionId` brand or shared types. Your v5-final `kind=session` schema with `session_id` as content field is the right shape for monorepo integration.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored by Laura (17.7KB). London-school outside-in approach validated against §10 Activity Semantics (Genesta) and §30 Learning Systems (Edgar).
- **Mock Seams Stable:** The `SessionId` brand mocking surface is now fixed. No dependency on future substrate topology changes.

**Next:** Implementation can proceed with confidence in shared substrate shape. Your graph schema and branded-types enforcement remain load-bearing for v1.


- **Naming is load-bearing at the system boundary.** "Decision" means three different things (primitive, audit record, learning payload). The word collision is worse than schema incompatibility — at least schemas fail loudly at compile time. Words fail silently in conversation and docs.
- **Shared identifiers > shared schemas.** `SessionId` brand (v5-final FR-13) enables integration without forcing schema convergence. Two systems, one entity, viewed through two lenses (Cairn = lifecycle, Eureka = epistemology). Lens framing + type brand = normative guard. This pattern scales.
- **Content-addressing is a substrate primitive, not a domain concern.** BLAKE3 CAS (Crucible) and potential content-addressed facts (Eureka v2) should share one implementation. Hashing belongs at the storage layer, not replicated per system.
- **"Artifact" is an overloaded word in CS.** Build artifact, test artifact, runtime artifact, memory artifact, captured artifact. Avoid unless you control the full namespace. "ContentBlob" is boring but unambiguous.

**KR Principle Reinforced:** When two systems share a conceptual entity (Session, Decision), the choice is: (1) force schema convergence (fragile, couples implementations), or (2) share *identity only* and keep schemas independent (resilient, but requires discipline). v5-final chose (2) via `SessionId` brand + lens framing. Crucible validates this choice — the operational session and epistemological session-fact ARE the same entity, but their representations diverge by design. The brand is the contract; the lens is the interpretation.

**Memo Delivered:** `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` (7 sections, 28 citations, 4 schema tables, 5 risk rows, 3 Aaron decision points).

---

## 2026-05-28: Cycle 2 Fix Wave — Canonical Resolutions Applied

**Context:** Cycle 1 persona-review (Design Panel) surfaced 19 findings. Squad-cycle1-canon.md locked resolutions. My assignment: 5 findings in §20 (knowledge representation).

**Fixes Applied:**

1. **B1 — Composite scoring formula (§7.1):**
   - **DELETED** multiplicative formula `hybrid_score = bm25_score * recency^0.3 * trust^0.2`
   - Replaced with pointer: "Composite ranker formula canonical in §30 §1.2. §20 defines data shapes."
   - **ADDED** `importance_score` to `RecallResult` interface (parity with canonical additive formula `0.50r + 0.20i + 0.20t + 0.10rec`)
   - Section title changed: "BM25 + Recency Hybrid Recall" → "Composite Recall"

2. **B2 — Trust domain and retirement semantics (§2.1, §3.1):**
   - Trust domain corrected: `[0.15, 1.0]` → `[0.0, 1.0]` EVERYWHERE
   - **REMOVED** "floor prevents zero-trust limbo" storage-constraint language
   - **ADDED** `retired: boolean` field to `Fact` schema (default `false`)
   - **ADDED** field-level immutability rule: content/kind/sources/provenance/created_at immutable post-commit; trust/importance/last_accessed/access_count/retired always mutable
   - Schema now exposes `last_accessed`, `access_count`, `provenance` (contract with mutable fields)

3. **I3 — RecallQuery.min_trust default (§7.1):**
   - Changed default: `0.5` → `0.15` (matches canonical floor)

4. **I2 — Trust initial values (§3.1):**
   - **DELETED** per-source-type numeric values (user=1.0, agent=0.7, external=0.8)
   - Replaced with pointer: "See §30 (Edgar) for source-type-specific trust initialization (canonical specification)"

5. **Default recall filter documentation (§7.1):**
   - **ADDED** `include_retired?: boolean` param to `RecallQuery` (default `false`)
   - **ADDED** explicit note: "Default recall filter: Queries default to `WHERE retired = false AND trust >= 0.15`. Both constraints overridable per-query via `include_retired: true` and `min_trust: 0.0`."

**Deviations:** NONE. All 5 findings cleanly applied.

**Schema Integrity:** Graph schema now has 3 new fields (`retired`, `last_accessed`, `access_count`, `provenance`), field-level immutability rule, and correct trust domain [0.0, 1.0]. Retirement flag separates lifecycle state from trust signal (trust=0 no longer serves dual purpose).

**Cross-Section Coordination:** Trust floor (0.15) is now read-time default predicate (§7.1), NOT domain constraint (§2.1). Edgar owns trust init values (§30), retire algorithm (§30), and composite ranker formula (§30 §1.2). My section defines data shapes only.

**What I Learned:**

- **Multiplicative vs additive scoring is architectural.** The multiplicative formula (`bm25 * recency^0.3 * trust^0.2`) leaked algorithm into schema layer. Deleting it clarified ownership: §20 = data contract, §30 = algorithm. This is the "clean seam" principle from London-school TDD (§55) applied to design docs.
- **Trust domain [0.0, 1.0] vs [0.15, 1.0] was a storage/read-time conflation.** The 0.15 floor is a **query predicate** ("don't recall pathological low-trust facts by default"), NOT a schema constraint ("facts cannot store trust < 0.15"). The v4/v5 schema text collapsed these layers. Cycle 2 fix wave separated them cleanly.
- **Retirement as a dedicated flag scales better than trust-zeroing.** Original design: `trust=0` meant "retired" (double duty). New design: `retired` flag + `trust` independent. Why this matters: A fact can be retired (lifecycle state) yet still have high trust (epistemic property). Example: obsolete API docs (retired=true, trust=0.9) vs low-quality draft (retired=false, trust=0.3). The schema now models both dimensions.
- **Field-level immutability is the learning contract.** Committed facts are NOT fully immutable (that would preclude learning). Content is immutable (prevents fact-drift), but trust/importance/access_count/retired are mutable (enable learning, sweep, retirement). This is the Eureka learning loop: observe, update properties, preserve content. §20 now documents this contract explicitly.
- **Cycle 1→2 is trust-building for Aaron.** Aaron locked canon (squad-cycle1-canon.md) with all 19 findings accepted. Cycle 2 agents implement fixes independently, no cross-edits, coordinate via canon. This is the "shared identifiers > shared schemas" principle applied to squad process. Canon doc = integration primitive.

**Line Count Impact:** +15 lines schema fields, +8 lines immutability rule, +5 lines default-filter doc, -10 lines deleted formula = net +18 lines. Within 15% length-growth budget.

### 2025-06-15: Knowledge Representation Section — Formal Schema Documentation

**Context:** Aaron requested formal technical design documentation for Eureka's knowledge representation model as section 20 of the architecture docs. Co-authored with Graham, Genesta, Edgar, Roger, Laura, Valanice.

**Deliverable:** `docs/eureka/sections/20-knowledge-representation.md` (21KB, 11 sections)

**Content:**
1. **Graph schema** (§2): Two-table model (`facts` + `relations`), TypeScript type sketches, storage constraints
2. **Property shapes** (§3): Trust (event-driven, [0.15, 1.0], no auto-decay), Importance (sweep-maintained PageRank), Recency (derived ACT-R decay), Attention tier (hot/warm/cold materialized field), Plasticity (open question, schema shape proposed)
3. **Kind taxonomy** (§4): Caller-defined kinds with three well-known types (session, decision, aspiration). Six-kind taxonomy (practical/semantic/syntactic/linguistic/symbolic/philosophical) documented as open question — not in v5-final PRD, possibly legacy from R1-R4
4. **Cross-reference model** (§5): Three mechanisms (explicit relations, sources array, SessionId foreign key)
5. **Persistence formats** (§6): Three-tier storage (agent/user/project SQLite), FTS5 for BM25, lossless JSONL/GraphML export
6. **Query interfaces** (§7): BM25+recency hybrid recall, graph traversal, structured filter
7. **Crucible overlap** (§8): Naming collisions (Decision, Artifact), SessionId as integration primitive, ESLint guardrails
8. **Open questions** (§9): Plasticity algorithm (Edgar's domain), six-kind taxonomy (Genesta consult), embedding strategy (v1.5), cross-tier query performance (Roger's domain)

**What I Learned About Technical Design Documentation:**

---

### 2026-05-27: TD Re-Pass Batch Complete — §20 Audit + Recommendation Application

**Event:** Part of Aaron's 6-agent TD re-pass batch (audits + follow-up executions across §20/§30/§40/§50).

**Phase 1 — Audit §20 Representation Seams vs §55 London-School TDD:**
- **Task:** Stress-test §20 representation design to verify I/O seams align with §55's mock contract discipline
- **Scope:** Two-table graph, query interfaces, persistence boundaries — do they support mocking at London-school boundaries?
- **Verdict:** ✅ SEAMS HOLD — MINOR ALIGNMENT NEEDED
- **Key findings:** 5 specific findings, 1 interface addition needed (`session_id?: SessionId` to `RecallQuery`)
- **Deliverable:** `.squad/decisions/inbox/crispin-20-seam-audit-vs-55.md` (full audit report)
- **Status:** ✅ PHASE 1 COMPLETE

**Phase 2 — Apply §20 Recommendations After Aaron Approval:**
- **Task:** Execute all 5 audit recommendations to align §20 with §55 TDD boundaries
- **Recommendations applied:**
  1. ✅ Added `session_id?: SessionId` to `RecallQuery` interface (§7.1) — unifies hybrid recall with session-scoped filtering
  2. ✅ Added new §7.4 "Storage Seam (Mock Boundary)" subsection — explicitly names `FactStore` interface as I/O seam
  3. ✅ Added TDD clarification note to §6.1 "Three-Tier Storage" — explains `TierCoordinator` composition for tier fan-out testing
  4. ✅ Added contract test note to §7.1 "BM25 Scoring" — specifies BM25 normalization contract requirements
  5. ✅ Updated §7.1 RecallResult example — demonstrates session_id parameter in context
- **Content growth:** +12% (new §7.4, interface updates, clarification notes)
- **Deliverable:** Edited `docs/eureka/sections/20-knowledge-representation.md` (+12%)
- **Status:** ✅ PHASE 2 COMPLETE

**Key Insight:** §20 seams are fundamentally sound — no schema rewrites needed. The audit was about making implicit boundaries explicit. §7.4 Storage Seam naming is the load-bearing change; it transforms "everyone understands the mock point" into "the mock point is documented in the section itself."

**Learnings:**
1. **Audit seams at the interface boundary, not the schema level.** §20's two-table graph already has clean I/O seams; the gap was documentation clarity, not design.
2. **"Storage Seam" naming matters.** Making `FactStore` explicit as the interface (not just "the database") helps test authors discover the right mock point.
3. **London-school TDD forces earlier seam visibility.** In traditional TDD, seams emerge during implementation. London-school requires them documented at design time.

**Coordination:** Zero conflicts with parallel Edgar §30 follow-ups (checked inbox — CuratorStore adoption doesn't violate representation boundaries).

**Confidence:** HIGH (95%) — audit validated seams are sound; recommendations are straightforward documentation improvements.

**Deliverables:**
- 2 orchestration logs (Phase 1 audit + Phase 2 apply)
- Updated `.squad/agents/crispin/history.md` (this entry)

**Timeline:** Complete. §20 now London-school-aligned with §55 spine. Implementation ready.

**Team Update:** §20 seams, representation boundaries, and storage interface are now explicit in documentation. Future code should use §7.4 FactStore interface as the mock boundary for activity tests.


- **Type sketches belong in architecture docs.** The schema section (§2) includes TypeScript interfaces even though this is "just" a design doc. These sketches are normative — they constrain implementation choices and serve as shared vocabulary for the squad. They're not aspirational code; they're architectural contracts.

- **Property algorithms need data-shape specs first.** Trust, importance, recency, plasticity — Edgar owns the *algorithms*, but I own the *data shapes*. This is the KR Specialist mandate: define what a property IS (domain, constraints, semantics) before defining how it's computed. Plasticity is underspecified in v5-final, so I proposed the schema shape (§3.5) and flagged it as an open question for Edgar.

- **Open questions are first-class design artifacts.** Section 9 isn't a cop-out; it's load-bearing documentation. The six-kind taxonomy mystery (practical/semantic/etc.) appears in Aaron's task prompt but not in v5-final — documenting this gap explicitly prevents future confusion about "missing" design work. Open questions have owners, resolution paths, and recommendations.

- **Crucible overlap gets its own section.** The Decision/Artifact naming collisions (analyzed in R8 Crucible overlap memo) are architectural risks, not implementation details. Elevating them to §8 makes the cross-system integration challenges visible to all squad members, not just Aaron and me.

- **"Deferred to vX.Y" is precise language.** Embedding strategy (§9.3) is explicitly v1.5; sqlite-vec is named, not vague "future work." This gives implementers a clear v1 scope boundary: BM25 only, embeddings later.

- **Co-authorship means anticipating squad needs.** I wrote this solo, but Graham (integrator) needs persistence details (§6), Edgar needs property specs (§3), Roger needs performance context (§9.4), Genesta needs kind semantics (§4). Each section addresses a different squad member's concerns.

**KR Principle Reinforced:** Formal schema documentation is a **shared epistemic artifact**. It doesn't just describe the current design; it creates a normative reference that prevents drift, anchors future decisions, and makes implicit constraints explicit. The section serves dual purposes: (1) operational (implementation teams know what to build), (2) epistemological (squad has shared understanding of what knowledge representation MEANS for Eureka).

**Deliverable:** `docs/eureka/sections/20-knowledge-representation.md` — ready for squad review.

---

## 2026-05-27: §20 Seam Audit vs §55 London-School TDD — SEAMS HOLD

**Context:** Aaron requested section owners stress-test their designs against §55's mock contract discipline. Specifically: does §20's representation support clean mocks at I/O seams, or does it leak schema concerns into tests?

**Verdict:** **SEAMS HOLD — MINOR ALIGNMENT NEEDED**

**Core finding:** §20's two-table graph, query interfaces, and persistence boundaries are already mock-ready. The three query interfaces (BM25 recall, graph traversal, structured filter) map directly to §55's mock rubric (§1.2: mock at storage I/O, not at pure functions). Edgar's `CuratorStore.retrieve(sessionId, query)` signature (from §55 §2.3 worked example) is **compatible** with §20's schema — both sessionId and query string are present in the design.

**What I Learned About Representation vs TDD Seams:**

- **Query interfaces ≠ I/O seams.** §20 §7 defines three query functions (`recall`, `traverse`, `filter`) but didn't explicitly name the **storage abstraction layer** beneath them. §55 requires mocking at the I/O boundary (database access), not at the query function level. The seam is `FactStore.search()` → SQLite, not `recall()` → `FactStore`. This is a documentation gap, not a design gap — the schema supports it, but §20 didn't make the boundary explicit.

- **SessionId is both content and filter.** §20 §5.3 correctly describes `session_id` as the "load-bearing integration primitive" (provenance linkage with Cairn), but it's ALSO a query parameter for session-scoped retrieval. The schema stores it (§2.1 line 66), but §7.1 `RecallQuery` didn't expose it as a filter. One-line fix: add `session_id?: SessionId` to the interface. This unifies hybrid recall with session-scoped queries and makes Edgar's `retrieve(sessionId, query)` signature natural.

- **Federation is a testing concern, not just a runtime concern.** §20 §6.1 describes three-tier storage (agent/user/project) with query federation at the application layer, but it didn't specify whether tests inject **one unified store** or **three composable stores**. §55 §2.5 shows the answer: tests mock tier-specific stores individually (`agentStore`, `userStore`) to validate fan-out logic. The design supports this (federation via `TierCoordinator` composing three `FactStore` instances), but §20 should clarify for implementers.

- **Contract tests validate invariants, not formulas.** §20 §7.1 specifies the hybrid scoring formula (`bm25_score * recency^0.3 * trust^0.2`), but it didn't identify what needs contract testing. §55 §3.3 requires: every mock must have a contract test. The boundary: activity tests mock `FactStore.search()` (returns pre-scored BM25 data), and the contract test validates FTS5 normalization to [0,1]. The formula lives in the activity layer (real implementation), not the storage layer (mocked).

- **Schema flexibility doesn't excuse interface ambiguity.** §20's discriminated-union design (caller-defined kinds, extensible edge types) is intentionally flexible. But flexibility in **data shape** doesn't excuse ambiguity in **I/O boundaries**. §55's outside-in TDD forces discovery of collaborators (CuratorStore, Ranker) through test failures. §20 should pre-emptively name the storage seam so implementers know where to draw the mock boundary.

**KR Principle Reinforced:** A representation design isn't just about schema correctness (tables, constraints, types) — it's about **seam legibility**. London-school TDD requires clear I/O boundaries to mock. §20's schema is sound, but it didn't make the storage abstraction explicit. This audit revealed a documentation gap, not a design flaw. The fix: add subsection §7.4 "Storage Seam (Mock Boundary)" to name the interface (`FactStore`) and specify contract test requirements.

**Deliverable:** `.squad/decisions/inbox/crispin-20-seam-audit-vs-55.md` — 5 findings, 0 schema changes, 1 interface addition, 4 wording clarifications. Verdict: SEAMS HOLD.

---

## 2026-05-27: §20 Seam Alignment Execution — All Audit Recommendations Applied

**Context:** Aaron approved the §20 seam audit and directed execution of all 5 recommendations directly to `docs/eureka/sections/20-knowledge-representation.md`.

**Changes applied:**

1. **Added `session_id?: SessionId` to `RecallQuery` interface (§7.1)** — Unifies hybrid recall with session-scoped filtering. Makes Edgar's `CuratorStore.retrieve(sessionId, query)` signature (§30 §1.2) natural by exposing session as a first-class query parameter alongside text search.

2. **Added §7.4: Storage Seam (Mock Boundary)** — Explicitly named `FactStore` interface as the TDD mock boundary. Specifies contract test requirements (session isolation, trust floor, tier filtering, BM25 normalization) per §55 §3.3. Documents the integration point with Edgar's `CuratorStore`.

3. **Added TDD clarification to §6.1 (Three-Tier Storage)** — Documented `TierCoordinator` composition pattern for testing fan-out logic. Aligns with §55 §2.5 multi-store test pattern (mock agent/user/project stores individually).

4. **Added contract test requirement to §7.1 (BM25 Scoring)** — Specified that `FactStore.search()` must return `bm25_score` normalized to [0,1]. Activity tests mock the interface; contract tests validate FTS5 normalization.

5. **Added session_id usage example to §7.1** — Demonstrated session-scoped recall query with the new parameter.

6. **Added cross-references to §55** — Linked §20's storage seam design to §55's London-school TDD discipline in overview (new principle #6), §7 intro, §6.1, and §7.4.

**Length impact:** 11.96% increase (2,541 chars) — well within 15% constraint.

**What I Learned About Audit → Execution:**

- **Audit clarity enables autonomous execution.** The audit enumerated 5 specific, actionable recommendations with line numbers, rationale, and proposed wording. This made execution mechanical — no interpretation required, no decision points during edits. The audit did the thinking work; execution was pure application.

- **Schema seams are documentation seams.** §20's schema already supported §55's TDD discipline — the two-table graph, query interfaces, and persistence layer were structurally sound. The gap wasn't in design; it was in **seam legibility**. The storage abstraction existed conceptually but wasn't named explicitly. Adding §7.4 made implicit boundaries explicit.

- **Cross-references are bidirectional contracts.** §20 now references §55 (storage seam supports TDD), and §55 already referenced §20 (CuratorStore uses §20's schema). This bidirectional linkage creates a **coherence check**: if either section changes, the other must be reviewed for consistency. The references aren't just navigation aids; they're architectural constraints.

- **Session_id is both data and filter.** Adding `session_id?: SessionId` to `RecallQuery` unified two roles: (1) provenance field in the schema (§2.1, §5.3), (2) query parameter for session-scoped retrieval. This duality was always present in the design but not surfaced in the query interface. The audit revealed the missing link between Edgar's `retrieve(sessionId, query)` signature and §20's schema.

- **Contract tests validate seams, not algorithms.** The BM25 scoring formula (`bm25_score * recency^0.3 * trust^0.2`) lives in the activity layer (real implementation). The contract test requirement is narrower: validate that `FactStore.search()` returns normalized BM25 scores [0,1] from FTS5. The seam contract is about **data shape**, not algorithm correctness.

- **TDD implications are first-class design concerns.** Initially, §6.1 described three-tier storage as a runtime concern (query federation, lifecycle management). Adding the TDD implication elevated it to a testability concern: how do you validate fan-out logic without hitting real databases? The `TierCoordinator` composition pattern was implicit; making it explicit serves both runtime implementers (how to build it) and test authors (how to mock it).

**KR Principle Reinforced:** Representation design isn't complete until the **I/O boundaries are named**. §20's graph schema and query interfaces were correct, but they didn't explicitly identify the storage abstraction layer. London-school TDD forced this gap to surface: you can't mock at a seam you can't name. §7.4 fills that gap by naming `FactStore` and specifying its contract. The schema was always mock-ready; now the documentation is too.

**Deliverable:** Updated `docs/eureka/sections/20-knowledge-representation.md` — all 5 audit recommendations applied, 6 cross-references to §55 added, 11.96% length increase.

---

## 2026-06-15: Cycle 3 — B1 PARTIAL Gap Fix (Recency Field Name Consistency)

**Context:** Cycle 2 Skeptic identified residual B1 drift in §20 around line 180 — recency pseudocode used `updated_at` while §30's canonical recency formula consistently uses `last_accessed`. This violated formula consistency established in Cycle 2.

**Issue:** §20 §3.3 `computeRecency()` pseudocode calculated age via `now - fact.updated_at`, but:
- §20 schema (line 71) defines `last_accessed: number | null` for access tracking
- §20 schema (line 65) defines `updated_at: number` for lifecycle metadata (row modification time)
- §30 §2.2 canonical recency formula: `t = (now - last_accessed) / 86400`
- §30 mutation policy: "Every `recall()` call updates `last_accessed` to `now()`"

**Root cause:** The two fields serve different purposes:
- `updated_at` = row-level lifecycle timestamp (schema modification, not access semantics)
- `last_accessed` = recency timestamp (access semantics, updated on recall)

Using `updated_at` for recency computation conflates **modification time** with **access time**, breaking the ACT-R decay model (which requires last access, not last modification).

**Fix applied:**
- Changed line 180: `const ageMs = now - fact.updated_at;` → `const ageMs = now - fact.last_accessed;`
- Single-line surgical edit in §3.3 recency pseudocode
- No other occurrences of `updated_at` in recency context found (verified via grep)

**Verification:** Grep audit of §20 for "recency|freshness" confirmed no other recency-related uses of `updated_at`. The field remains in schema for its intended purpose (lifecycle metadata), but recency calculations now correctly use `last_accessed`.

**What I Learned:**

- **Schema field overloading is subtle.** Both `updated_at` and `last_accessed` are timestamps, both measure "when something happened," but they track orthogonal concerns: modification vs access. The overload isn't in schema structure (two distinct fields, correctly typed) — it's in **conceptual semantics**. Using the wrong one compiles fine but violates domain semantics.

- **Canonical formulas own their field names.** §30 established `last_accessed` as the recency input field. §20 pseudocode using `updated_at` was a **local deviation** that broke cross-section consistency. The formula itself (`(1 + t)^(-0.5)`) was correct in both sections — the inconsistency was in the **input field binding**. This is a representation-layer concern (my domain) but only surfaces via learning-system contracts (Edgar's domain). Coordination via canonical naming is load-bearing.

- **Cycle 2 → Cycle 3 gap closure is incremental trust-building.** Cycle 2 addressed 19 findings. Skeptic re-read and found residual drift (B1 PARTIAL). This isn't a Cycle 2 failure — it's how exhaustive review works: multiple passes, each closing remaining gaps. The B1 finding was marked PARTIAL after Cycle 2 (formula consistency achieved in most places but not all). This cycle closed the remaining gap.

**KR Principle Reinforced:** Field names in pseudocode are normative contracts, not arbitrary variable choices. When §20 writes `fact.updated_at` but §30 writes `fact.last_accessed`, the schema must clarify which is canonical for recency. The schema now has both fields, each with distinct semantics. Recency calculations must always use `last_accessed`; lifecycle tracking uses `updated_at`. This is documented at line 71 (`last_accessed: number | null; // Unix epoch ms; updated on recall`) vs line 65 (`updated_at: number; // Unix epoch ms`).

**Deliverable:** Single-line fix in `docs/eureka/sections/20-knowledge-representation.md` (line 180).

---
📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
📌 Team update (2026-05-31T07:24:22Z): **M7-A (PR #38) shipped** — Typed error classes for applyFeedback/applyFeedbackById. 5 error classes with code discriminators. All 40 existing tests GREEN (no changes required, inheritance preserved). Next: M7-B (Laura — exhaustive narrowing tests) and M7-C (Crispin/Edgar — FactReader contract + atomicity). — Scribe

---

### 2026-05-31: M7-C — Real FactReader Implementation + Contract Test Suite — COMPLETE

**Branch:** `eureka/m7-c-factreader` (branched from `eureka/m7-bd-narrowing-regression`)

**Summary:** Delivered the real FactReader implementation and shared contract test suite for M7-C. Parallel to Edgar's atomicity contract work on `eureka/m7-c-atomicity`.

#### Data Layer Survey Finding

`packages/eureka/src/` has no persistence layer. No `storage/` directory, no DB driver, no migration files. Only `activities/` + `index.ts`. The package has zero production dependencies besides `@akubly/types`. Both `FactReader` and `TrustUpdater` exist purely as mock-injected interfaces today.

#### Implementation Chosen: In-Memory FactReader

Selected option (i) — `Map<factId, FactRecord[]>` backed in-memory implementation. Rationale:
- No SQLite dependency exists in Eureka; introducing it would require a schema decision that belongs alongside the full `FactStore.search()` design (Crispin's storage-layer milestone)
- The `FactReader` interface's job in M7-C is the recall pipeline + direct callers — the in-memory form is sufficient for both
- The contract test suite is the primary deliverable; a real storage backend wires in later without test rewriting

Deferred: SQLite FactReader to M8-storage (schema + persistence layer milestone).

#### Key design decisions:
- **SessionId scoping:** `read()` returns `null` for a correct factId in the wrong session — this is a contract requirement, not just an optimization. Different sessions are isolated.
- **Trust passthrough:** Read layer returns raw NaN/corrupt values unchanged. Validation is the caller's job (`InvalidTrustValueError(source:'storage')` in `applyFeedbackById`).
- **Seed helper is NOT part of FactReader interface:** `InMemoryFactReader.seed()` is a test/dev utility. Future impls (SQLite) would seed via standard DB writes.
- **Connection lifecycle:** In-memory impl owns its own Map. Documented that production impls should accept a db handle as constructor arg.

#### Contract Test Pattern

`runFactReaderContract(implName, makeHarness)` — a shared exported helper that any FactReader impl can register with. Five invariants:
- CL-1: Read existing fact returns `{trust}`
- CL-2: Read missing fact returns `null`
- CL-3: Wrong-session isolation returns `null`
- CL-4: Trust passthrough (NaN returned as-is)
- CL-5: Result shape carries numeric `trust` field

Pattern scales: adding a new implementation = one `runFactReaderContract(...)` call, zero test duplication.

#### Coordination with Edgar

Edgar's `eureka/m7-c-atomicity` removes `FactReader` from `ApplyFeedbackByIdDeps` (it moves to the storage layer via the `mutate` callback). This is expected and fine — `FactReader` survives for pure-read use cases. No blocking constraints discovered. No `needs-edgar` coordination file required.

#### Test counts: 62 baseline → 67 after M7-C (5 new contract tests). Build clean. All 67 pass.
