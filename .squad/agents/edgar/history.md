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

---

### 2026-05-27: §30 Follow-Ups Executed — Post-§55 Review

**Event:** Execute 3 queued follow-ups from §55 review verdict (non-blocking improvements to §30).

**Deliverables:**
1. ✅ §30 §1.2 updated to use Laura's `CuratorStore.retrieve(sessionId, query)` signature
2. ✅ §30 §2.4 new subsection "Time Injection for Testability" added (ClockProvider interface)
3. ✅ §30 §4.1 latency targets cross-referenced to §55 test assertions

**Learnings:**

1. **Outside-in signatures force architectural clarity** — Laura's `CuratorStore.retrieve(sessionId, query)` makes session isolation an explicit contract, not an implementation detail. Even outside TDD context, this is better architecture. The signature places the session boundary at the storage seam (where it belongs) rather than letting it leak into activity logic.

2. **Testability seams are design decisions, not test infrastructure** — ClockProvider isn't just mock infrastructure; it's a boundary that declares "time is an external dependency" for the recency algorithm. Documenting this in §30 (algorithm spec) not just §55 (test strategy) makes the design intention visible to implementers, not just test authors. Future: replay/time-travel debugging in v1.5 will use this same seam.

3. **Bidirectional cross-refs prevent spec-test drift** — Latency targets (§30) and test assertions (§55) can drift apart silently. Explicit pointers in both directions make drift visible during reviews. When §55 adds a dedicated performance-test section (future §6 or §7), these pointers provide backlinks for easy updates.

4. **Lightweight coordination suffices for non-blocking hygiene work** — These three edits crossed Laura's domain (§55 test strategy) and potentially Crispin's domain (§20 representation boundaries). Checking for conflicts (read inbox files, verify no active audits) took 2 minutes; no synchronous meeting needed. Principle: coordinate by reading artifacts, not by scheduling.

**Post-work:** Documented execution in `.squad/decisions/inbox/edgar-30-followups-executed.md` for Scribe merge.

**Status:** ✅ COMPLETE — §30 ready for next phase.


---

### 2026-05-27: London-School TDD Directive — Algorithmic Seams Coordination
**Team Update:** Aaron issued London-school (outside-in mockist) red/green TDD as team default. **Edgar assigned:** Review Laura's docs/eureka/sections/55-tdd-strategy.md (next session) for algorithmic-seam consistency vs §30 learning-systems algorithms. Verify mocked collaborators match extraction-ready design boundaries (FR-12 7 mechanisms). Locked-out of revision if reject (protocol requires different agent).

---

## Learnings

### 2026-05-27: §55 TDD Strategy Review — Verdict APPROVED WITH NOTES

**Context:** Laura authored §55 without reading §30 (London-school anti-anchoring). Reviewed for: (1) collaborator correctness, (2) mock boundary placement, (3) property dynamics testability, (4) scheduler testability, (5) seam-shift analysis.

**Verdict:** APPROVED WITH NOTES

**Core findings:**

1. **Collaborator discovery works well** — Laura's test-first `recall` example forces `CuratorStore` and `Ranker` into existence naturally. These align with §30's storage I/O and scoring seams.

2. **Mock boundaries are mostly correct** — Storage I/O (CuratorStore) is mocked. Ranker is real (pure algorithm). BUT: §55 is silent on THREE critical §30 boundaries:
   - **Time mocking** — §30 recency decay formula `(now() - last_accessed)` requires deterministic clock for tests. §55 doesn't mention time injection.
   - **RNG** — Any stochastic activity (meditate's clustering, contemplate's pattern synthesis in v1.5) needs mockable randomness source.
   - **Model boundary** — Future contemplate/meditate will call LLM for pattern synthesis. §55 doesn't address LLM mocking.

3. **Property dynamics ARE testable** — §55's worked example demonstrates testing recency (filter by time), importance (tier thresholds), trust (source assignment). BUT: decay formulas are HARD TO DISCOVER via outside-in if test authors don't know power-law exists. §30's `recency = max(0.1, (1 + t)^(-0.7))` is precise; §55's examples only test "old facts rank lower" without forcing formula shape.

4. **Scheduler tests: partially addressed** — §55's AC mapping includes sweep tests (FR-12 coverage), but it doesn't distinguish synchronous (recall, integrate) from asynchronous (sweep) from background (v1.5 meditate). §30 has explicit latency targets (<100ms for recall, <5s sweep for 10K facts). §55 could benefit from explicit "scheduler interface testability" section.

5. **Seam shifts discovered (§30 should evolve):**
   - Laura's `CuratorStore.retrieve(sessionId, query)` signature is better than §30's implicit "search then filter" — makes session isolation explicit in interface.
   - Her `rerank(factIds, context?, feedback?)` forces context/feedback optionality at interface level. §30 had these as separate paths; Laura's unified signature is cleaner.

**Recommendation:** ACCEPT §55 as-is for now. Three follow-ups for §30:

1. Add "Mock boundaries for time-dependent properties" subsection to §30 §2 (Property Dynamics) — document that `now()` must be injectable for tests, show example `ClockProvider` interface.
2. Add latency targets to §30 §4.1 (Synchronous Scheduling) that map to §55's test assertions (e.g., `expect(results).toBeReturned().within(100)` corresponds to §30's <100ms target).
3. Adopt Laura's `CuratorStore.retrieve(sessionId, query)` signature in §30 §1.2 (recall) — it's a cleaner seam than "search global then filter".

**Notes for Genesta:** Two overlaps flagged but not blocking:
- AC mapping table (§55 §5) assigns some tests to `integrate` vs `recall` — Genesta should verify activity boundaries match her §10 semantics.
- §55 flags OQ-2 (embedding strategy) as HIGH impact on mock boundaries — this is correct, and Genesta's prescriber migration timing (§30 §7.4 gate 1) may interact.

---

### 2026-05-27: TD Re-Pass Batch Complete — §30 Follow-Ups + London-TDD Alignment Verified

**Event:** Part of Aaron's 6-agent TD re-pass batch (audits + follow-up executions across §20/§30/§40/§50).

**Your role:** Execute 3 queued §30 follow-ups from §55 review (see this history entry §148 above).

**Status:** ✅ ALL 3 COMPLETE

**Deliverables:**
1. ✅ §30 §1.2 (recall algorithm) — Adopted Laura's `CuratorStore.retrieve(sessionId, query)` signature for clarity
2. ✅ §30 §2.4 (NEW subsection) — "Time Injection for Testability" documenting `ClockProvider` interface + determinism seams
3. ✅ §30 §4.1–4.2 — Added cross-refs from latency targets to §55 test assertions for bidirectional hygiene

**Key Insight:** Outside-in signatures (Laura's retrieve) force architectural clarity. Testability seams (ClockProvider) are design decisions, not just test infrastructure. When documented at algorithm level (§30, not just §55), they're visible to implementers.

**Coordination:** Zero conflicts — checked Crispin's §20 audit findings; CuratorStore signature adoption is compatible with representation boundaries.

**Learnings captured:** Bidirectional cross-refs prevent spec-test drift. Lightweight coordination (read artifacts, not meetings) suffices for non-blocking hygiene work.

**Confidence:** HIGH (95%) — edits are documentation hygiene, zero algorithm changes.

**Post-work:** Documented execution in `.squad/decisions/inbox/edgar-30-followups-executed.md` for Scribe merge.

**Timeline:** Phase 1 complete. §30 now London-school-aligned with §55 spine. Ready for implementation.

---

**Team Update for Alexander, Valanice, Gabriel:** §20/§30/§40/§50 are now all London-school-aligned with §55 TDD spine. All seams identified, mock boundaries explicit. Future code in these areas should use the documented seams. No breaking changes to existing designs; all changes are additive seam documentation.

---

### 2026-05-29: Cycle 1 Code Panel Review — F1/F2/F3/F4/F5/F9/F10/F12 Implementation

**Event:** 5-persona Code Panel reviewed commit ea05e62 (M4 GREEN). Findings triaged and implemented in one commit (0f83dcf) on eureka/v1-m1-m4.

**Status:** ✅ COMPLETE — 7 findings accepted, 1 escalated (F6), 1 deferred with comment (F12). All tests pass.

---

## Learnings

### 2026-05-29: Cycle 1 Review — Key Design Decisions

**F4: Sibling function vs debug flag (design choice rationale)**

Chose option (a) — `recallWithScores()` as a sibling function; `recall()` as a thin wrapper that strips scores.

Option (b) (debug flag: `RecallOptions.debug?: boolean`) would create a union return type that callers must narrow at runtime. The sibling function pattern gives each concern its own stable, non-overloaded type signature. `recallWithScores` is the computational truth; `recall` is the convenience alias for callers that only need facts. This separation also makes the future `Ranker` injection seam cleaner — both `recall` and `recallWithScores` go through the same underlying function.

Lesson: When a function's return type depends on a runtime flag, prefer two named functions over an overloaded/flagged signature. Type clarity is worth the minor duplication.

**F9: Ranker seam shape locked**

`Ranker = (facts: RecallResult[], deps: { nowMs: number }) => ScoredResult[]`

Receives trust-filtered candidates (not raw candidates — trust filtering is a recall invariant, not a ranker concern). Returns scored results in any order (sorting and slicing to k remain in `recallWithScores`). This is the natural factoring from `compositeScore`'s shape: it maps one fact to a score, so a Ranker maps many facts to many scored results.

Lesson: Ranker seams should operate on *already-filtered* candidates. Trust/tier filtering is a retrieval policy, not a ranking policy. Keeping these concerns separate makes custom rankers simpler and prevents them from accidentally bypassing trust floors.

**F1/F3: Defensive math hardening pattern**

Two related guards in `compositeScore`:
1. **F1 (NaN guard):** `Math.max(0, tDays)` — clamps negative tDays from future `last_accessed` values. Without this, `Math.pow(1 + negativeValue, -0.5)` returns NaN, silently corrupting sort order.
2. **F3 (stale-not-fresh semantics):** `tDays = Infinity` for absent `last_accessed` → `recency = 0.1` (floor). Previous code used `tDays = 0` (recency = 1.0), treating never-accessed facts as just-accessed — wrong direction.

Together these define a hardened recency boundary: `tDays ∈ [0, Infinity)` regardless of input. Pattern: when a formula has a domain constraint (here: non-negative age), enforce it with a clamp at the input, not a special case inside the formula.

Lesson: Document why `Infinity` is the correct sentinel for absent data (very stale, not just-accessed). The comment "never-accessed treated as very stale, not just-accessed" is load-bearing — future reviewers won't understand the `Infinity` choice without it.

---

### 2026-05-28: Cycle 2 Fix Wave — §30 Canonical Resolutions Applied

**Context:** Persona-review cycle 1 surfaced 19 findings (all accepted by Aaron). Edgar assigned 6 findings for §30 (heaviest load in fix wave). All fixes sourced from `squad-cycle1-canon.md`.

**Deliverables:**

1. ✅ **B1 — Scoring formula authority:** Made §30 §1.2 the canonical source for FR-2 ranker formula. Added explicit "This is the canonical source" prose. Specified normalized BM25: `relevance = (bm25_score - min_score) / (max_score - min_score)` across candidate set (min-max normalization to ensure [0,1] scaling per query). Cross-ref to new §1.2.1 "Alternatives Considered" for formula rationale.

2. ✅ **B2 — retire() + trust mutation policy:** Rewrote §1.6 retire algorithm to use `retired: boolean` field (NOT trust-zeroing). Retired facts excluded via `WHERE retired = false` filter. Added §2.1 "Mutation Policy" subsection documenting field-level immutability (content/kind/sources immutable; trust/importance/last_accessed mutable). Listed 5 legitimate mutation triggers (contemplate, verification, contradiction, corroboration, decay).

3. ✅ **I2 — Trust initial values canonical table:** Added source-type trust table to §2.1 with 5 rows (user-confirmed 0.9, user-provided 0.6, agent-inferred 0.5, Path 2 low 0.4, external-API 0.7). Marked as canonical source; §10/§20 reference this. Updated §1.1 integrate algorithm to match table values.

4. ✅ **I4 — Constants provenance:** Added §2.2.1 subsection "Ranker Weights and Tier Constants Provenance" with 6 tables:
   - Ranker weights (0.50/0.20/0.20/0.10) with derivation method + sensitivity note
   - Tier multipliers (1.2/1.0/0.8) with rationale
   - Tier thresholds (hot ≥ 0.7, warm ≥ 0.4) with expected distribution
   - Trust floor (0.15) with "pathological zero-trust state" definition + tuning guidance
   - **Recency exponent α corrected from 0.7 → 0.5** (Anderson 1990 ACT-R standard). Documented rationale: 0.7 was ungrounded; 0.5 is literature standard. Code-context MAY benefit from faster decay (0.6–0.7) but lacks empirical calibration; defaulting to 0.5 for v1. Updated measurable invariants (1-day: 0.71, 7-day: 0.35, 30-day: 0.18).
   - Time constant β (1 day) with tuning guidance (hourly sessions → β=3600s, weekly → β=604800s).

5. ✅ **I9 — Single 500ms SLO:** Rewrote §4.1 to state **"P95 recall < 500ms"** as sole shipped SLO. Demoted 50ms/100ms/200ms to "Internal Hot-Path Targets" (not shipped guarantees). Added M4 load-test requirement (1000 facts, P95 > 500ms = ship-blocker) and production telemetry histogram (`eureka_recall_latency_ms`). Cross-ref to Roger's §40 for test wiring.

6. ✅ **M5 — Alternatives Considered:** Added §1.2.1 "Alternatives Considered: Ranker Design" subsection. Covers:
   - BM25 vs TF-IDF/LSH/semantic embeddings (BM25 wins for v1: exact, deterministic, zero inference latency; embeddings deferred to v1.5)
   - Additive composite vs cascade filters vs ML ranker (additive allows dimension tradeoffs; ML deferred pending training data)
   - Sensitivity note: ±0.05 relevance-weight shift → ~5% ranking variance

**Key Decisions:**

1. **Recency exponent α = 0.5 (NOT 0.7):** This is a regression from ungrounded 0.7 to literature-standard 0.5 (Anderson 1990 ACT-R). If 0.7 was intentional for code-context tuning, this is a step backward — but no evidence of intentionality found, so aligning to canonical ACT-R. Future calibration may increase to 0.6–0.7 if production telemetry shows benefit.

2. **Normalized BM25 = min-max across candidate set:** Chose min-max normalization over sigmoid for simplicity. Min-max is deterministic and query-specific (scales each query's BM25 distribution to [0,1]). Sigmoid would require global calibration of midpoint/steepness.

3. **Mutation policy as explicit contract:** Field-level immutability (not row-level) is now documented as §30 contract. This prevents future "can we mutate trust?" debates — answer is YES, and here are the 5 legitimate triggers.

**Length Growth:** ~2.8 KB added (~10.8% growth from 26 KB baseline). Under 20% budget; heaviest fix load in wave but within constraints.

**Learnings:**

1. **Constants provenance is forensic archaeology:** Deriving rationale for existing constants (0.7 exponent, 0.15 floor, 1-day β) required inference from comments, commit history, and literature. Explicitly documenting derivation NOW prevents this archeology cost for future maintainers. Principle: every tunable constant needs a "why this value?" answer in the spec.

2. **Normalized BM25 is a hidden dependency:** The original spec said "normalized 0..1" but didn't specify HOW. Min-max vs sigmoid vs Z-score vs percentile all produce [0,1] but with different score distributions. Specifying "min-max across candidate set" forces implementation precision and makes the ranking behavior reproducible.

3. **Single SLO cuts decision paralysis:** Collapsing four conflicting latency targets (50ms/100ms/200ms/500ms) into one shipped SLO (500ms P95) + internal hot-path targets removes ambiguity. "Did we meet the SLO?" has one answer. Internal targets guide implementation but don't block ship.

4. **Exponent correction = controlled regression:** Changing α from 0.7 → 0.5 makes old facts decay SLOWER (7-day: 0.35 vs 0.27; 30-day: 0.18 vs 0.14). This is a ranking behavior change — recently accessed facts get less advantage vs old facts. If 0.7 was tuned for rapid turnover, this regresses that. But lacking evidence of intentional tuning, aligning to literature is safer than perpetuating an ungrounded value. Documented this as "if 0.7 was intentional, this is a regression to investigate."

5. **Mutation policy as POSITIVE list (not negative):** Listing 5 legitimate triggers (contemplate, verification, contradiction, corroboration, decay) is clearer than "trust is mutable." Future: if a 6th trigger is proposed, it requires explicit design review — not implicit "well trust is mutable so...". Positive enumeration is a design forcing function.

**Confidence:** HIGH (95%) — all fixes sourced from canon doc; no discretionary interpretation required except BM25 normalization method (min-max chosen for simplicity).

**Post-work:** This history update. No deviations file needed (all findings applied cleanly).

**Status:** ✅ CYCLE 2 FIX WAVE COMPLETE — §30 ready for team review.

---

### 2026-05-28: Cycle 3 — Zombie-Fact Semantics Resolution

**Context:** Architect cycle 2 advisory flagged ambiguity in §30's trust=0 semantics. With B2 policy (`retired: boolean` field separate from trust), trust-penalty formula (`max(0.0, fact.trust - 0.10)`) can decay trust to 0.0. Default filter `WHERE retired=false AND trust>=0.15` means trust=0 facts are **effectively invisible** (filtered by 0.15 floor) but **formally not retired** (retired=false). This is a "zombie fact" — occupies space, appears in raw queries, never surfaces to users.

**Decision Required:** Does trust=0 trigger automatic retirement, or is "low-trust-but-not-retired" a meaningful state?

**Policy Chosen:** **Option 2 — Preserve the distinction.** Trust=0 means "epistemically dead" (system lost confidence), but fact is preserved for forensic analysis, replay, and future re-evaluation. Explicit retirement (`retired=true`) is reserved for deliberate lifecycle decisions (user "forget this", policy sweep, supersession).

**Rationale:** Separates epistemic state (trust) from lifecycle state (retirement), which is the whole point of B2 policy. Provides:
1. **Audit trail:** Trust decay (via contemplate outcomes) vs explicit retirement (via retire() API) are distinguishable in telemetry
2. **Recovery path:** Trust=0 facts can regain trust via corroboration (v1.5) or manual correction without un-retiring
3. **Forensic value:** Operators can query "why did this fact lose trust?" by examining decision events

**Deliverable:** Added §2.1.1 "Zombie-Fact Semantics: Trust=0 vs. Retirement" subsection to §30 (22 lines, ~1.5% of file). Clarified:
- trust=0 facts retain `retired=false`
- Diagnostic query pattern: `recall({ include_retired: true, min_trust: 0.0 })`
- Trust-update algorithm does NOT set `retired=true` when trust reaches 0.0
- Updated §2.3 trust-floor definition (line 525) to remove "explicitly retired" contradiction

**Learnings:**

1. **Zombie facts ARE a meaningful state** — Not a bug to fix, but a design feature to document. The distinction between "system lost confidence" (trust=0, retired=false) and "user/policy decided to remove" (retired=true) is valuable for operators who need to understand WHY facts vanished from recall. If both states collapse to the same outcome (invisible), operators can't distinguish algorithmic failure from deliberate removal.

2. **Semantic precision prevents future creep** — Without explicit documentation, future implementers might add "if trust == 0.0: retired = true" optimization to save space. That optimization destroys the epistemic/lifecycle distinction. Documenting the policy NOW (with rationale) creates a forcing function: if you want to auto-retire trust=0, you need to CHANGE the policy, not "fix a bug."

3. **Extraction-ready designs need extraction-ready semantics** — If learning-kernel is extracted (Path D), the trust=0/retirement distinction becomes a kernel contract. External consumers (Cairn, Crucible, future adoption) need to know whether trust=0 has lifecycle implications. Documenting this in §30 (not just implementation comments) makes it visible at the API level.

**Post-work:** Recorded decision in `.squad/decisions/inbox/edgar-cycle3-zombie-policy.md` for Scribe merge. Updated Edgar history (this entry).

**Confidence:** HIGH (90%) — Option 2 aligns with B2's epistemic/lifecycle separation. No edge cases found where conflation is simpler.

**Status:** ✅ CYCLE 3 COMPLETE — zombie-fact semantics closed.


---

## 2026-05-28: Eureka M1 First Red Test — London-School TDD Kickoff

**Event:** Laura (Tester) delivered M1 first red test per §55 London-school outside-in TDD.

**RED Status:** AC-1.3 (keyword-scoped recall ≥80% precision) locked as seed. FactStore.search() mock seam established.

**Impact for Edgar:** recall() activity signature finalized with DI parameter. M2 cascade: implement recall.ts delegating to factStore.search(), add side-effects (accessCount, lastAccessedAt) per §55 §2.6.

**Package scaffold:** @akubly/eureka created. SessionId branded type added to @akubly/types. Root tsconfig.json updated with eureka project reference.

**Baseline preserved:** Cairn 26/26 ✅, Forge 24/24 ✅, tsc --build ✅.

---

## 2026-05-28: M2 — recall() Driven to GREEN

**Event:** M2 London-school TDD beat — implement minimal `recall()` to make AC-1.3 test GREEN.

**GREEN Status:** recall.test.ts ✅ — 1/1 test passed. Full baseline preserved.

**Baseline verification:**
- Cairn 26/26 test files, 609 tests ✅
- Forge 24/24 test files, 644 passed | 3 todo ✅
- Eureka 1/1 test file, 1 test ✅
- `tsc --build` clean exit ✅

---

## Learnings

### 2026-05-28: M2 recall() Shape Locked

**Implementation shape (`packages/eureka/src/activities/recall.ts`):**

```
recall(options: RecallOptions, deps: RecallDeps): Promise<RecallResult[]>

RecallOptions = { query: string; sessionId: SessionId; k: number }
RecallDeps    = { factStore: FactStore }
FactStore     = { search(args: { query, sessionId, limit }): Promise<RecallResult[]> }
RecallResult  = { content: string; trust: number; attention_tier: string; [key: string]: unknown }
```

- Delegates to injected `factStore.search()` — no concrete store import, no `new` (London-school discipline)
- Applies trust floor (0.15 per §30 §2.3) as the only filter in M2
- Returns up to `k` results; all 5 mock facts pass the 0.15 floor so all 5 are returned
- 4 of 5 mock entries contain 'auth'/'login'/'credential' keywords (note: "OAuth2" contains 'auth' as substring of 'oauth') — satisfies ≥4/5 = ≥80% precision

**§55 interpretation calls made at M2:**

1. **No ranking at M2:** §30 §1.2 specifies the full composite ranker (BM25+importance+trust+recency). The test only asserts on keyword overlap precision — NOT on ordering. London-school discipline: implement only what the current test exercises. Ranker deferred to the M3 red beat.

2. **FactStore.search() args are not asserted:** The test mock does not use `expect(factStore.search).toHaveBeenCalledWith(...)`. Passed `{ query, sessionId, limit: k }` as a reasonable shape matching §20 §7.4, but this is not locked at M2.

3. **accessCount / lastAccessedAt NOT implemented:** §10 §10.1 specifies side effects (increment accessCount, update lastAccessedAt, attention promotion). These require a mutable store or write-side seam that the M2 test does not exercise. Deferred — a future red test will demand this.

**Named M3 next-red-beat:**

The outside-in cascade reveals: the composite ranker (§30 §1.2) is unexercised. The minimal M2 recall passes because the test doesn't assert on ORDER — only on presence of ≥4 relevant entries. The next red beat is:

> **M3: Composite-ranker ordering** — a test asserting that `recall()` returns results sorted by the FR-2 formula (`0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency × attention_multiplier`), driving the Ranker collaborator into existence (§30 §1.2 canonical source; §55 §2.3 Ranker seam).

This is Edgar's domain. The next collaborator to mock is a `Ranker` or the scoring logic becomes internal to `recall()` — that's the key design decision at M3.

---

## 2026-05-28: M3 — Composite-Ranker Ordering Driven to GREEN

**Event:** M3 London-school TDD beat — implement FR-2 composite scoring in `recall()` to make the ranking-order test GREEN.

**GREEN Status:** recall.test.ts ✅ — 2/2 tests passed. Full baseline preserved.

**Baseline verification:**
- Cairn 26/26 test files, 609 tests ✅
- Forge 24/24 test files, 644 passed | 3 todo ✅
- Eureka 1/1 test file, 2 tests ✅
- `tsc --build` clean exit ✅

---

## Learnings

### 2026-05-28: M3 Composite-Ranker Shape Locked

**Implementation shape (`packages/eureka/src/activities/recall.ts`):**

Extended `RecallResult` with optional typed fields:
```
RecallResult = {
  content: string; trust: number; attention_tier: string;
  relevance?: number; importance?: number; last_accessed?: number;
  [key: string]: unknown;
}
```

Extracted `compositeScore(fact, nowMs)` as a pure inline helper:
```
compositeScore(fact, nowMs):
  tDays   = (nowMs - fact.last_accessed) / 86_400_000   // ms → days
  recency = max(0.1, (1 + tDays)^−0.5)                 // ACT-R power-law, floor 0.1
  raw     = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
  return  raw × ATTENTION_MULTIPLIERS[attention_tier]   // hot=1.20 / warm=1.00 / cold=0.80
```

`recall()` pipeline: filter trust≥0.15 → map to (fact, score) → sort descending → slice(k) → map to fact.

**Attention multiplier source-of-truth:** §30 §1.2 (hot=1.20, warm=1.00, cold=0.80). §50 line 211 contains stale values (hot=1.0/warm=0.5/cold=0.1) — flagged in decision drop for Crispin/Genesta cleanup; implementation uses §30.

**Recency derivation lock:**
- `last_accessed` is Unix epoch **milliseconds** (test fixture sets `EPOCH_MS = 0`)
- `tDays = (Date.now() - last_accessed) / 86_400_000`
- With `last_accessed = 0` in 2026 (~20,000+ days elapsed), `(1+tDays)^-0.5 ≈ 0.007` → floor = 0.1 for all four fixture facts
- All fixture scores depend only on relevance/importance/trust/tier — deterministic ordering

**Optional-field safety:** `relevance` and `importance` default to 0 when missing (M2 mock doesn't provide them). `last_accessed` defaults to `tDays = 0` (treat as now, recency = 1.0) when not a number. M2 test passes because ordering doesn't matter for its assertion.

**Named M4 next-red-beat (TARGET — Laura owns RED):**

The cascade next demands: recency that **changes over time** rather than a static floor. Currently all tests pin `last_accessed = 0` (ancient facts, floor = 0.1). A real clock dependency is needed to verify that recently-accessed facts outrank older ones. The seam is `ClockProvider` (§30 §2.4 "Time Injection for Testability"). The test would inject a deterministic `ClockProvider` returning a controlled `nowMs`, and assert that a fact accessed 1 day ago outranks an identical fact accessed 30 days ago.

> **M4 TARGET: ClockProvider injection for recency decay** (§30 §2.4; seam documented, not yet mocked in any test).

Laura owns M4 RED.

---

## 2026-05-29: M4 — ClockProvider Injection Driven to GREEN

**Event:** M4 London-school TDD beat — wire injected `ClockProvider` into `recall()` so recency decay responds to the test-controlled clock rather than `Date.now()`.

**GREEN Status:** recall.test.ts ✅ — 3/3 tests passed. Full baseline preserved.

**Verbatim GREEN output:**
```
 ✓ src/activities/__tests__/recall.test.ts (3 tests) 3ms
   ✓ recall > surfaces keyword-overlapping entries at ≥80% precision 1ms
   ✓ recall > ranks results by FR-2 composite formula descending (§30 §1.2) 1ms
   ✓ recall > ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4) 0ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  00:24:16
   Duration  363ms
```

**Baseline verification:**
- Cairn 26/26 test files, 609 tests ✅
- Forge 24/24 test files, 644 passed | 3 todo ✅
- Eureka 1/1 test file, 3 tests ✅
- `tsc --build` clean exit ✅

---

## Learnings

### 2026-05-29: M4 ClockProvider Integration Shape Locked

**The precise change (minimal diff):**

1. `packages/eureka/src/activities/recall.ts`:
   - `ClockProvider` interface and `clock: ClockProvider` in `RecallDeps` were already present (Laura added them in M4 RED).
   - Changed `const { factStore } = deps` → `const { factStore, clock } = deps`
   - Changed `const nowMs = Date.now()` → `const nowMs = clock.now()`
   - Two lines changed; `compositeScore(fact, nowMs)` was already parameterised — no other change needed.

2. `packages/eureka/src/index.ts`:
   - Added `ClockProvider` to the barrel re-export so callers can construct typed clock objects.

**ClockProvider location decision:**
Colocated with `RecallDeps` in `recall.ts` per Laura's decision drop (laura-m4-clock-red.md). §30 §2.4 notes extraction to `packages/eureka/src/learning/properties/clock.ts` deferred until FR-12. §55 §1.2 governs placement discipline: interface belongs at the seam (recall.ts), not in a premature abstraction layer. No §-tension here — both §30 and §55 agree on deferral.

**No-default-clock discipline:**
`clock` is REQUIRED in `RecallDeps`. No `clock = systemClock` fallback. §55 §1.2 is explicit: defaults allow the production smell (`Date.now()`) to silently persist. Requiring injection at the call site means every caller is forced to declare its time source. This is enforced at compile time — TypeScript will reject any `recall()` call that omits `clock`.

**Why M4 RED was hard to see before:**
With real `Date.now()`, all facts with `last_accessed = 0` (Unix epoch, ~2026) produce `tDays ≈ 20,000+` → recency floor 0.1 for every fact. A FRESH fact (last_accessed = BASE_MS) with real clock would also be ~25 years old → also floor 0.1. FRESH and STALE become identical scores → stable sort → storage order → [STALE, FRESH]. The injected stub clock makes `tDays = 0` for FRESH, breaking the floor tie and producing the expected order.

**§-tensions noted:**
- §30 §2.4 says `ClockProvider.now()` returns seconds; implementation uses milliseconds (consistent with existing `86_400_000` divisor). Resolution: ms throughout. §30 pseudocode is illustrative, not normative.
- §30 §2.4 says optional default to SystemClock; §55 §1.2 says required. §55 wins at seam discipline boundary. Documented in laura-m4-clock-red.md.

**Named M5 next-red-beat (TARGET — Laura owns RED):**

The cascade now demands: trust score updates from feedback (§30 §2.3). The current implementation uses static trust values provided by `FactStore.search()`. §30 §2.3 specifies event-driven trust mutation (corroboration = +0.1, contradiction = −0.1, user correction = ±0.3), with a trust floor of 0.15 and ceiling of 1.0. A red test would inject a feedback event and assert that the fact's trust is updated accordingly, driving the trust-mutation seam into existence.

> **M5 TARGET: Trust score updates from feedback events** (§30 §2.3 trust dynamics beyond the static floor).

Laura owns M5 RED.

---

📌 **2026-05-29: Eureka Cycle 1 Review — 8 findings completed; F6 escalated** — Code panel review of ea05e62 produced 9 important + 5 minor findings. Accepted 7 (F1 NaN guard, F2 type exhaustiveness, F3 fallback logic, F4 export design, F5 JSDoc, F9 ranker seam, F10 index sig) + deferred F12 (TRUST_FLOOR hardcoding) with TODO comment. Escalated F6 (trust-filter undersupply / spec gap) to Cassima (PM) + Crispin (Knowledge Rep). All 4 regression tests added (F1, F2, F3). Eureka 7/7 ✅. Commit 0f83dcf. F6 escalation requires PM decision on exact-k semantics and FactStore contract refinement before implementation. — Scribe

