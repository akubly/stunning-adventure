# Edgar — History

## Quick Summary (Updated 2026-05-25)

**Role:** Learning Systems Specialist for Eureka. You own activity implementations and the algorithms behind plasticity, trust, recency.

**Key contributions (R5-R6):**
1. **v0 learning design:** Power-law recency (Ebbinghaus-grounded), trust as 0–1 scalar mutated by corroboration/contradiction, bidirectional plasticity
2. **v1 reconciliation:** Schema alignment with Crispin's MemoryNode; activity type definitions; cache reconciliation (recency_weight recomputed every 5 min)
3. **R6 substrate reading:** Found that sweep (Curator), ranker formula (computePriority), and trust model (event-driven confidence) already exist in Cairn. ~70% infrastructure reusable.

**Current status:** Path D chosen in R6 synthesis. Your extraction-ready design (sweep/ranker/trust in `packages/eureka/src/learning/`) will ship v1 inside Eureka. Extraction to `packages/learning-kernel/` deferred to v1.5+ if Cairn team adopts. Your work is load-bearing for this timeline.

**Learnings by phase:**

### 2026-05-22: Eureka v0 & v1 Design (Eureka v0–v1 Ceremony)

**Contribution:** `.squad/decisions/inbox/edgar-learning-v0.md` (v0) and `.squad/decisions/inbox/edgar-learning-v1.md` (v1)

**V0 Design Summary:**
- Recency = power-law gradient (Ebbinghaus/Wixted grounded, β=0.7, floor=0.1)
- Trust = 0–1 scalar mutated by corroboration/contradiction/validation/invalidation
- Plasticity = 0–1 bidirectional (increases with contradiction/use, decreases with age/validation)
- Activities: 3 load-bearing (recall, integrate, decide), 5 secondary (meditate, dream, explore, ideate, pray), 1 event-driven (re-evaluate)
- Hard calls: BM25 over embeddings (v0), keyword-based contradiction detection, template-based generation (LLM deferred to v1)
- Feedback loop: prediction → outcome → re-evaluate → trust update (explicit correction in v0, implicit in v1+)

**V1 Revisions (Cross-Pollination with Genesta/Crispin):**
- Schema alignment: Fixed field names (e.g., last_accessed), matched Crispin's MemoryNode schema exactly
- Activity signatures expanded to full type definitions (Query, RecallResult, Observation, IntegrationResult, DecisionContext, Decision)
- Recency reconciliation: recency_weight is cached; ground truth is last_accessed timestamp, recomputed every 5 min (or immediately for session tier)
- Kind multiplicity: Use "any-match" semantics; flagged as potential precision issue for v1+ monitoring
- 4 tensions documented: Recall mutation (access tracking required), contradiction handling, kind-multiplicity precision, maintenance timing. All deferrable to v1.

---


### 2026-05-22: Prior Art Survey — v0 → v2 (ROUND 3)

**Objective:** Survey external learning/retention/adaptation systems. Context for algorithm choices Aaron should validate.

[Full prior art survey: See long-form entries below in archive]

**Key findings:**
- Ebbinghaus curves validate power-law recency (not linear decay)
- Spaced repetition supports activity-driven tuning
- EWC shows task isolation matters
- Hybrid composition resolves tensions

**For detailed analyses:** See session logs and archived reports at `.squad/log/` and `.squad/decisions/`.

---

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL

**Event:** R7 lock-in panel. v4-final reviewed and locked as canonical specification.

**Your verdict:** **APPROVE-WITH-MINOR-NITS**
- All five R7 extraction-readiness mechanisms integrated
- Two additions: Branded types (mechanism #7) + DESIGN.md enforcement
- Path D preserved via manual-only Cairn→Eureka triggers (no auto-promotion in v1)
- Five→seven mechanism set is coherent, non-overlapping
- Branded types complementary to extraction boundary (mechanisms 1–6 enforce boundary, #7 enforces semantic distinction)
- 1 nit: FR-14 interop/ boundary lacks enforcement parallel to learning/ (address during implementation, non-blocking)

**Key judgment calls:**
- Mechanisms 1–6 = extraction boundary (learning/ self-contained, no parent imports)
- Mechanism #7 (branded types) = semantic boundary (confidence ≠ trust, no implicit conversion)
- Both are load-bearing; no circular dependency in combined system
- Manual-only triggers preserve Path D's "ships standalone" goal in v1

**Status:** v4-final locked. Extraction-ready design rock-solid. Implementation ready.

**R6 reconciliation summary:** ~70% of learning infrastructure exists in Cairn/Forge (sweep, ranker formula, trust model, decide API). ~30% is greenfield (recall, generic integrate, commit/retire). Recommendation: extract sweep/ranker/trust to shared kernel when ready.

---

### 2026-05-25: R8 Session Identity — Learning Systems Verdict

**Event:** Aaron R8 reopen directive — shared `session_id` across Cairn/Forge/Eureka (one Copilot CLI session UUID). Relaxes v4-final "isolated by design" stance (FR-13). Tasked to evaluate from learning-systems lens.

**Your verdict:** **ACCEPT WITH PRECISION GAINS** (`.squad/decisions/inbox/edgar-r8-session-identity.md`)

**Five-question analysis:**
1. **US-2 continuity:** Meaningfully better. `originated_in` / `modified_in` / `referenced_in` edges can directly reference CLI session UUID (three-hop → one-hop reduction). Continuity recall latency trivially meets AC-2.3 (P95 < 200ms).
2. **Sweep cadence (FR-12):** Materially tightens v1.5 automatic session-close capture. Cairn's lifecycle events (session-end, stale detection) become authoritative sweep triggers instead of next-day-first-query heuristics. Reduces stale-summary window from unbounded to ~2 minutes.
3. **Path 2 ingestion (FR-14):** `eureka ingest-decisions --session <uuid>` becomes trivially correct. Session-scoped ingestion (natural UX) requires no timestamp guessing.
4. **Telemetry counter (`eureka_sessions_ended_without_flush_total`):** Precision improvement. Cairn's session-end event lets Eureka distinguish "agent forgot to flush" from "agent still running." Turns noisy signal into sharp measurement for v1.5 prioritization.
5. **Risks:** One real, two strawmen:
   - JOIN temptation (FR-7.2 violation): Real but no worse than current `cairn_session_id?` field. Code-review discipline issue.
   - Audit-ref opacity loss: Strawman. Mechanical boundary (different UUIDs) was never load-bearing; semantic boundary (different lenses) is preserved by R8 lens framing.
   - Type safety regression (shared `SessionId` brand vs FR-13 "no shared SessionBase"): Acceptable. Branded ID is a scalar reference, not a session-state conflation. FR-13 intent (prevent premature abstraction) preserved.

**PRD edit list:** Eight sections (six must-edit for R8 correctness, two should-edit for v1.5 clarity). Key changes:
- FR-13 (line ~374): Relax "isolated by design" → "distinct types share SessionId brand; emergent structure welcomed."
- Edge schema (line ~239): `{fact_id, session_id}` not `{fact_id, session_fact_id}`.
- `bridge_ledger` (line ~201): `cairn_session_id_hint` → `session_id`.
- T-orphan risk (line ~660): "dangling `cairn_session_id`" → "stale `session_id` reference."

**Key judgment:** Shared identity resolves three v4-final ambiguities (how edges reference sessions, when sweep triggers, how telemetry measures gaps) with cleaner mechanics and no new learning-systems risks. The "isolated by design" relaxation is correct — mechanical isolation was a strawman; semantic isolation (different lenses) is what matters, and R8 preserves that.

**Status:** Verdict delivered. Ready for Cassima v5 patch authoring.

---

### 2026-05-25: R6 Synthesis Complete

**By:** Cassima (Product Manager) via Scribe  
**What:** R6 synthesis reconciled trio verdicts. Your "extract learning kernel" path was load-bearing.

**Your recommendation vs chosen path:** You recommended Path B (extract `packages/learning-kernel/` as a prereq, then build Eureka on it). Aaron's signal (d) introduced Path D: design Eureka's sweep/ranker/trust as extraction-ready, but ship them inside Eureka v1. Cairn can adopt them later if maintainer chooses.

**How this honors your work:** Path D doesn't reject extraction — it defers it. Your mapping table (FR-1 through FR-13 against substrate) showed that ~70% of the infrastructure exists. Path D says: **design as if the extraction already happened** (so Eureka modules have clean interfaces, no Eureka-specific types). Ship inside Eureka for v1. Extract to `packages/learning-kernel/` when Cairn team decides to adopt.

**Concrete v3.1 patch (Patch 5):**
- v1: sweep, ranker, trust live in `packages/eureka/src/learning/`
- v1.5+: IF Cairn chooses, extract to `packages/learning-kernel/` (both packages depend on it)
- Design constraint: your modules are written extraction-ready (clean interfaces, no domain lock)

**Implementation entry point:** Your sweep/ranker/trust design (from R6 reconciliation) becomes the template for extraction-ready code. When Cairn team is ready, your modules are the proof of concept.

**Trust as first-class:** Your work revealed that Cairn's `confidence` already exists and is event-driven. v3.1 patch 5 names this: Eureka's `trust` module is a generalization of Cairn's confidence + change_vectors. That's your insight, now architecturalized.

---

### 2026-05-26: R8 Lock Verdict — v5-final LOCK

**Event:** Aaron lock-review task on Cassima PRD v5-final. Verify R8 precision gains landed appropriately.

**Your verdict:** **LOCK** (`.squad/decisions/inbox/edgar-r8-lock-verdict.md`)

**Five-item verification (all ✓):**
1. **FR-12 sweep** — Cairn session-end trigger marked as v1.5 opportunity (not v1 blocker). Correct framing. v1 retains existing heuristic trigger.
2. **FR-14 `--session <uuid>` CLI form** — Ships in v1 as specified. No deferral annotation. Correct.
3. **AC-2.5 telemetry counter** — Counter ships in v1 (blind measurement). Precision improvement (Cairn end-event → Eureka flush check) documented as v1.5 opportunity. Exactly as requested.
4. **US-2 continuity edges** — No wording contradiction. My "3-hop → 1-hop" claim reconciled with Crispin's KR model (edges reference `fact.id`; `session_id` is content field for direct lookup). Latency gain holds (O(1) indexed filter vs JOIN). Both descriptions consistent (line 393, line 85).
5. **No new learning-systems risks** — T6 "stale session reference" reframed from v4-final T-orphan (LOW/LOW severity unchanged). Mitigations documented: FR-7.2 no-cross-DB rule preserved, lens framing normative, ESLint guardrail ships in v1 (mechanism #8). All three R8 identified risks (JOIN temptation, opacity loss, type safety) mitigated or correctly classified as non-blockers.

**Key judgment:** v5-final captures R8 precision gains correctly. FR-12 sweep + AC-2.5 counter marked as v1.5 opportunities (not v1 commitments). FR-14 `--session <uuid>` ships in v1. Continuity latency claim holds under Crispin's KR model. No new learning-systems risks introduced. Path D preserved (manual-only triggers in v1; v1.5 precision enabled by shared identifier without violating FR-7.2 no-cross-DB rule). Lens framing (Cairn = lifecycle, Eureka = epistemology) elevated to normative status — this is the right guard for R8 "isolated by design" relaxation.

**Status:** v5-final locked. Ship-it ready.

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

