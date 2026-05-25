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

