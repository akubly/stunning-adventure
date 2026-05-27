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

