# Crispin — History (Summarized)

## Core Context

**Project:** Eureka — agentic brain/memory/learning system. `packages/eureka/` in monorepo.
**Role:** Knowledge Representation Specialist. Own graph schema, kind taxonomies, persistence formats.
**Current status:** Eureka v5-final LOCKED. R8 design cycle CLOSED.

---

## Design Ceremony Summary (R1–R8)

**R1–R5:** First-principles design. Advocated Path A (clean-slate) initially. Contributed v0/v1 graph schema docs: two-table graph (nodes + edges), multi-kind tagging, hybrid persistence. 5 tensions identified.

**R6 Revision:** After source-reading, adopted Path D. Recognized "closer in spirit" ≠ "same shape." Structures can differ while concepts converge. Supported Path D (standalone but kernel-shaped).

**R7 Lock:** v4-final locked as canonical. All 5 schema risks mitigated. Branded types enforcement mechanism is load-bearing (prevents confidence/trust collapse). Seven-mechanism defense-in-depth correct.

**R8 Amendment:** Session identity unification. SessionId branded type ships v1 (FR-12 #8). Kind=session facts reference SessionId as content field, not PK. No identity collision risk. Edge schema references fact.id (KR convention); session_id is a content/grouping field. Latency claim holds.

---

## Recent Work

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL
**Verdict:** APPROVE-FOR-LOCK
- All 5 R7 schema risks mitigated (confidence/trust branded types, extraction-readiness, boundary discipline)
- Branded types are load-bearing (compiler rejects unsafe cross-assignment)
- Seven enforcement mechanisms form coherent defense-in-depth
- FR-14 Path 2 introduces no new schema risks

### 2026-05-26: R8 Session Identity Spec
**Contribution:** SessionId branded type specification for v5-final
- type SessionId = string & { readonly __brand: 'SessionId' }
- UUID v4 validator + constructor
- Branded primitive (not opaque class) for serialization-friendliness
- kind=session fact schema: session_id is content/grouping, NOT PK
- Edge schema remains: (from_id, to_id) reference fact.id
- session_id allows O(1) indexed filter ("all facts in session X")

### 2026-05-26: R8 Lock-Review — v5-final CANONICAL
**Verdict:** LOCK
- All 6 spec items from R8 verdict verified
- SessionId brand mechanics correct (line 404-423)
- kind=session schema correct (session_id as content field, no identity collision)
- fact vs filter clarity preserved
- Edge schema integrity maintained (no unintended multi-hop traversals)
- No new KR-level concerns

**Status:** v5-final canonical. Implementation ready. R8 CLOSED.

---

## Learnings

### 2026-05-26: Crucible KR Overlap Analysis — Two Critical Collisions, One Shared Primitive

**Context:** Aaron starting Crucible (CLI coding harness) in parallel with Eureka. Requested KR-focused analysis of representational overlap, specifically around schema primitives, session identity, and naming collisions.

**Findings:**

1. **"Decision" naming collision (CRITICAL):** Both systems use `Decision` / `DecisionRecord` / `DecisionPayload` / `kind=decision` for structurally different things. Crucible's `Decision` primitive = any recorded choice (audit event). Eureka's `kind=decision` fact = contemplative structured deliberation with explicit options/rationale (FR-10). Forge's `DecisionRecord` (shared via `@akubly/types`) is the flat audit shape. Three types, one word. **Namespace pollution across three systems.** Recommendation: Crucible rename primitive to `ChoiceEvent` or `DecisionEvent`; ESLint ban cross-system `Decision*` imports.

2. **"Artifact" semantic drift (HIGH):** Crucible's `Artifact` primitive = any reviewable content (inputs AND outputs: PRD, patch, screenshot, transcript, diff), stored in CAS. Eureka uses "artifact" informally (US-2 AC-2.1: "epistemological artifact" = memory representation of session, NOT the content). If Crucible stores Artifacts in cairn CAS and Eureka v2 content-addresses fact payloads, collision at storage layer. Recommendation: Crucible rename to `ContentBlob` / `CapturedContent`; Eureka avoid "artifact" in public types.

3. **Shared `SessionId` brand is the load-bearing integration primitive (OPPORTUNITY):** Crucible's session (operational lifecycle, cairn `sessions` table) and Eureka's session-fact (epistemological artifact, `kind=session`) share **one identifier** — Copilot CLI session UUID via `SessionId` brand (`@akubly/types`, v5-final FR-13). This is the join key that enables Path D kernel extraction: Crucible primitives → cairn event_log, Eureka facts → `facts` table, linked by `session_id`. Type-level construct (branded string, zero runtime overhead), no FK at runtime (FR-7.2: no cross-DB ATTACH). **v5-final session-identity unification (R8 amendment) was prescient for Crucible integration.**

4. **Crucible's 5 primitives vs Eureka's kinds:** Only `Decision` has direct naming collision. `Request`, `Observation`, `Question` have no Eureka equivalents (no collision, but also no shared representation). `Artifact` has semantic drift. The primitives are structurally independent from Eureka's fact/edge graph.

5. **Storage schema convergence (MODERATE):** Both want append-only, replayable, local-first storage. Crucible: hybrid WAL + CBOR+BLAKE3 CAS. Eureka: two-table SQLite graph (facts + edges). Structurally independent but mechanically convergent. If cairn becomes shared substrate (Path D), Crucible primitives live in `event_log`, Eureka facts in `facts`, joined by `session_id`. Shared CAS opportunity: if Eureka v2 content-addresses, adopt Crucible's BLAKE3 primitive (deprecate SHA-256 DBOM legacy).

6. **Drift vs trust are orthogonal:** Crucible's "drift" (replay divergence measurement, conformance corpus) ≠ Eureka's "trust" (epistemic reliability scalar on facts). No collision. BUT: if Crucible's drift-prescriber proposes trust adjustments, explicit adapter required (never implicit conversion). Glossary already guards this (Confidence vs Trust orthogonality, v5-final line 659–660).

7. **Read-set hash vs edges structural mismatch:** Crucible's read-set (opaque hash for replay verification) doesn't compose with Eureka's typed edges (traversable graph). If Sonny's "why did this decision happen?" debugger (Crucible T1-D4) needs Eureka facts, explicit `ReadSetHashToFactEdges` adapter required. Not v1 concern; v2+ bridge gap.

**What I Learned About Representational Reuse:**

---

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