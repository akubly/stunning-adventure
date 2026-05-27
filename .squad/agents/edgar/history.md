# Edgar — History

## Quick Summary (Updated 2026-05-25)

**Role:** Learning Systems Specialist for Eureka. You own activity implementations and the algorithms behind plasticity, trust, recency.

**Key contributions (R5-R6):**
1. **v0 learning design:** Power-law recency (Ebbinghaus-grounded), trust as 0–1 scalar mutated by corroboration/contradiction, bidirectional plasticity
2. **v1 reconciliation:** Schema alignment with Crispin's MemoryNode; activity type definitions; cache reconciliation (recency_weight recomputed every 5 min)
3. **R6 substrate reading:** Found that sweep (Curator), ranker formula (computePriority), and trust model (event-driven confidence) already exist in Cairn. ~70% infrastructure reusable.

**Current status:** Path D chosen in R6 synthesis. Your extraction-ready design (sweep/ranker/trust in `packages/eureka/src/learning/`) will ship v1 inside Eureka. Extraction to `packages/learning-kernel/` deferred to v1.5+ if Cairn team adopts. Your work is load-bearing for this timeline.

## Core Context

[Archived entries 2026-05-22 through 2026-05-26 R8 Lock Review. See `.squad/decisions/` for full design history.]

**Key achievements summary (R5–R8):**
- R5/R6: v0 power-law recency + event-driven trust design; confirmed ~70% infrastructure reusable from Cairn/Forge
- R6 synthesis: Path D chosen (extraction-ready design, ship inside Eureka v1, extract to `packages/learning-kernel/` when Cairn team adopts)
- R7: v4-final locked as canonical; 7 extraction-readiness mechanisms verified; branded types deferred to v1.5
- R8: Session identity amendment (shared `SessionId` brand across Cairn/Eureka) accepted; precision gains verified; 5-item verification passed

**Current status:** Eureka v5-final locked and ship-ready. Path D preserved. Learning infrastructure extraction-ready (zero Eureka-specific types; clean module boundaries).

**Load-bearing design constraints:**
1. Mechanisms 1–6 = extraction boundary (learning/ self-contained, no parent imports)
2. Mechanism #7 (branded types) = semantic boundary (confidence ≠ trust, no implicit conversion)
3. Manual-only Cairn→Eureka triggers preserve v1 Path D (v1.5 precision opportunity with automatic triggers)
4. Shared `SessionId` brand documents ground truth without runtime coupling (type-level construct only)

---

## Current Work

### 2026-05-26: R8 Lock-Review Orchestration (Scribe Phase)

**Event:** Scribe ceremony — lock R8 verdicts into `.squad/decisions.md`, move v5-final to canonical location, archive R8 inbox files.

**Your role:** Lock-review verification (item-by-item sign-off in `.squad/decisions/inbox/edgar-r8-lock-verdict.md`).

**Status:** ✅ R8 LOCKED — all learning-systems precision gains verified, verdict documented and integrated into decisions.md.

---

### 2026-05-26: Crucible-Eureka Learning-Systems Overlap Analysis

**Event:** Aaron request — analyze overlap between Crucible's prescriber/scorecard loop and Eureka's recall/integrate/sweep loop. Both have self-improvement mechanisms; need coordination before parallel development starts.

**Your verdict:** **Complementary, not redundant** (`.squad/decisions/inbox/edgar-crucible-learning-overlap.md`)

**Five focus areas analyzed:**

1. **Self-Improvement Loops:** Different time horizons (Crucible = turn-level behavior optimization; Eureka = session-level knowledge evolution). Complementary unless both attempt to modify the same artifact (e.g., skill prompts). **Mitigation:** ESLint guardrail — Crucible owns prompt structure, Eureka owns prompt content.

2. **Prescriber Inheritance:** Forge prescribers (promptOptimizer, tokenOptimizer, change-vector feedback) move to Crucible's repo. Eureka loses prescriber-adjacent infrastructure unless learning kernel is extracted. **Three options:** (A) Extract kernel now (~1–2 weeks; honors Path D extraction-ready design); (B) Let Crucible copy (divergent algorithms; harder future extraction); (C) Defer to v1.5 (6+ months divergence; Path D mechanisms languish). **Recommendation:** Option A if Crucible can absorb delay; Option C otherwise.

3. **Trust/Recency/Plasticity vs Scorecards/Drift:** Related quantities along orthogonal axes. Confidence (prescriber epistemic strength) ≠ Trust (fact provenance reliability). Both are 0..1 event-driven scalars but measure different things. **Current gap:** Branded types deferred to v1.5 (FR-12 mechanism #7). **Recommendation:** Ship mechanism #7 in v1 (not v1.5); ~2–4 hours cost; compile-time enforcement prevents Confidence/Trust conflation bugs.

4. **Feedback Substrate:** Crucible's recorded sessions (append-only log + read-sets + decision alternatives) ARE the evidence Eureka wants for learning. Path 2 ingestion exists but is manual (`eureka ingest-decisions --session <uuid>`). **Risk:** Aaron will forget; learning loop won't close. **Recommendation:** Wire automatic ingestion (Option 1: Crucible post-session hook, opt-in; Option 2: Cairn session-end event, v1.5; Option 3: manual batch, high friction). Ship Option 1 for v1 dogfood.

5. **Bootstrap Sequence:** Both PRDs claim "v1 builds v2" as success bar. Parallel dogfood = competing improvement loops; triage friction; interference risk. **Recommendation:** Sequential dogfood — Crucible weeks 14–20 (closes "v1 builds v2" loop first), then Eureka week 29+ (learns from Crucible's session corpus). If parallel unavoidable, add conflict resolution protocol (Crucible wins structure, Eureka wins content; conflicts tracked as telemetry counter).

**Key insight:** Crucible and Eureka are complementary IF (1) learning kernel is extracted so both share one algorithm, OR divergence is accepted; (2) feedback substrate is wired automatically (manual steps break the loop); (3) dogfood is sequential (parallel is higher risk). Path D's extraction-ready design (FR-12, 7 mechanisms) makes coordination tractable, but requires commitment to extract or explicit acceptance of 6-month divergence.

**Action items for Aaron (decision gates):**
- Prescriber ownership: Option A (extract kernel now), B (duplicate), or C (defer to v1.5)?
- Dogfood sequence: Sequential (Crucible first, then Eureka) or parallel (conflict protocol required)?
- Feedback substrate wiring: Option 1 (Crucible hook), 2 (Cairn event), or 3 (manual batch)?

**Confidence:** High (90%) on complementarity analysis; Medium (60%) on prescriber extraction timing (depends on Crucible timeline pressure); High (85%) on sequential dogfood recommendation.

**Evidence:** Cassima Crucible PRD v1 (harness repo), Eureka PRD v5-final, Forge prescriber implementations (promptOptimizer.ts, tokenOptimizer.ts, change-vector feedback loop), Edgar v0/v1 learning design, R6/R7/R8 verdicts.

**Status:** Findings delivered to Aaron. Three decision gates block both repos' implementation timelines.

---

### 2026-05-27: Eureka Documentation — Learning Systems Section

**Event:** Aaron request (via team co-authoring flow) — write `docs/eureka/sections/30-learning-systems.md` as Edgar, covering all 9 activities (7 v1, 2 v1.5), property dynamics (trust/recency/plasticity), feedback loops, scheduling, measurable outcomes, R4 arbitrations, Crucible overlap, and open questions.

**Deliverable:** 26 KB comprehensive algorithmic documentation at pseudocode level with concrete, measurable specifications.

**Coverage achieved:**
1. **Activity algorithms (§1):** All 9 activities documented with pseudocode, inputs, algorithms, measurable outcomes, and v1 limitations. Deferred activities (meditate/contemplate) include strawman algorithms and open questions.
2. **Property dynamics (§2):** Trust (event-driven, 0..1, floor 0.15), Recency (ACT-R power-law, query-time computed), Plasticity (v1.5 deferred with planned semantics).
3. **Feedback loops (§3):** Short loop (intra-session recall→decide→integrate, <1s cycle), Long loop (cross-session commit→sweep→Path 2 ingest, 1–7 day cycle), Crucible-Eureka substrate (Crucible sessions as Eureka training data).
4. **Activity scheduling (§4):** Synchronous (request-driven, <100ms latency targets), Asynchronous (sweep-driven, <5s for 10K facts), Background (v1.5 deferred).
5. **Measurable outcomes (§5):** Precision/recall metrics (v1 baseline: >0.6 precision, >0.4 recall; v1.5 goal: >0.75/>0.6), Trust calibration (v1.5), Sweep performance (<5s for 10K facts), Path 2 ingest latency (<10s for 100 records).
6. **R4 arbitrations (§6):** recall vs rerank (both preserved; rerank is refinement), decide vs recall (decide returns single choice; recall returns ranked list), retire vs evict (soft delete vs hard delete).
7. **Crucible overlap (§7):** Complementary loops (Crucible optimizes behavior, Eureka optimizes knowledge), Trust vs Confidence orthogonality, Recency vs Drift timescales, Three open decision gates (prescriber ownership, dogfood sequencing, feedback substrate wiring).
8. **Open questions (§8):** Seven questions from PRD §14 documented with impact and status (Cairn migration timing, BM25 threshold tuning, subpath export topology, contemplate/meditate boundary, MCP server wrapper, commit_floor semantics, cross-machine sync CRDT).

**Key design decisions reflected:**
- Power-law recency formula explicitly documented: `recency = max(0.1, (1 + t/β)^(-α))` where β=86400s, α=0.7
- FR-2 ranker formula: `rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency`
- 5-phase sweep algorithm detailed (importance decay, tier demotions, Tier 2 edge population, stale flags, edge reconciliation)
- Path 2 ingest adapter shape documented (FR-14)
- Extraction-ready design explicitly noted for trust/recency logic

**Learnings:**
1. **Documentation as precision test:** Writing at pseudocode level exposed ambiguities in v1.5 deferred activities (meditate/contemplate boundary still fuzzy — documented as open question §8.4).
2. **Measurable outcomes force specificity:** Setting concrete latency targets (<100ms for recall, <5s sweep for 10K facts) makes implementation testable and prevents "good enough" drift.
3. **R4 arbitrations need rationale preservation:** Documenting *why* overlapping activities were both preserved (not just that they were) prevents future "why do we have both?" debates.
4. **Crucible overlap section bridges team understanding:** Section 7 makes Genesta/Laura/Cassima coordination explicit without requiring them to read full `edgar-crucible-learning-overlap.md` analysis.

**Post-work:** Updated Edgar history.md with task learnings (this entry).

**Status:** ✅ Documentation complete. Ready for team review.

