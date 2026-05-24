# Edgar — History

## Core Context

**Project:** stunning-adventure monorepo (TypeScript, npm workspaces, vitest). User: Aaron Kubly.

**Eureka** is the new `packages/eureka/` package — agentic brain/memory/thinking/learning system. Third pillar alongside Cairn (observability) and Forge (deterministic SDK runtime).

**Your scope:** Learning systems — activity implementations and the algorithms behind plasticity, trust, recency. You take what Crispin has shaped (graph, kinds, properties as data) and bring it to life as agentic behavior.

**Genesta** leads Eureka and specifies activity semantics. **Crispin** designs the representations your algorithms operate on. You implement.

**Activities to implement (from Aaron's framing):** recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate. Some are obvious (recall, integrate, decide). Some need definition (meditate, dream, pray) — work with Genesta to land concrete semantics before implementing.

**Properties you'll algorithmically govern:**
- **Recency** — open question: gradient (continuous decay) or binary (short/long term)? Aaron flagged this as a design question.
- **Trustworthiness** — provenance-based scoring; informs ranking and acceptance
- **Plasticity** — mutability policy; some memories should be hard to change, others should evolve readily

**Existing precedent (reference, don't depend on):** Cairn (Roger) has `change_vectors` measuring prescription outcome metrics. Similar feedback-loop pattern, narrower scope.

**Design principles for Eureka (Genesta's charter):** Activities are runtime not storage. Trust is first-class. Plasticity over immutability. Memory evolves through use.

## Learnings

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

**Systems surveyed:** Ebbinghaus forgetting curves + memory retention research, spaced repetition algorithms, retrieval-augmented generation (RAG), natural language inference (NLI), elastic weight consolidation (EWC), cognitive psychology literature

**Key findings:**

1. **Ebbinghaus curves (1885) vs modern learning theory:**
   - Ebbinghaus: Exponential forgetting. Revision flattens curve. Older theory, still valid for short-term memory.
   - Modern (Wixted & Carpenter 2007): Power-law forgetting. Better empirical fit for long-term retention. Matches Eureka's v0 formula.
   - Implication: Eureka's power-law recency decay is scientifically grounded. Not a guess.

2. **Spaced repetition (Leitner, Bjork):**
   - Bjork's "desirable difficulty" principle: optimal spacing increases just before forgetting. Eureka's meditate activity maps to this (review high-plasticity memories before they decay).
   - Leitner boxes: 5 boxes with time intervals. Eureka's plasticity + activity-based scheduling aligns naturally.
   - Missing from v0: adaptive scheduling (predict next optimal review time). Can add in v1 using Bjork formulas.

3. **RAG (Retrieval-Augmented Generation):**
   - RAG = retrieve from external KB → pass to LLM → generate. Eureka's recall activity is the retrieval phase.
   - Implication: Eureka's design already assumes RAG-style architecture. Generative aspects (dream, ideate) are the "G" in RAG.
   - For v0: Use BM25 retrieval. For v1: Augment with embeddings for semantic RAG.

4. **NLI (Natural Language Inference):**
   - NLI detects contradictions and entailments in text ("A implies B?"). Eureka's integrate activity creates contradicts edges.
   - Missing from v0: LLM-powered NLI for contradiction detection. Current approach is keyword-based heuristic.
   - Implication: Contradiction detection is a clear upgrade path for v1+ (ship with heuristic, upgrade to LLM).

5. **EWC (Elastic Weight Consolidation):**
   - EWC solves catastrophic forgetting in multi-task learning. Protects important weights while allowing plasticity on new tasks.
   - Mapped to Eureka: Task-specific trust thresholds. Memories from completed tasks should be harder to contradict.
   - Missing from v0: Multi-task awareness. Can add in v1 by tracking task_id on memories (Crispin's schema v3 now includes this!).

**4 learning tensions identified:**

1. **Classical spacing curves (Ebbinghaus/Bjork) vs agentic activity-driven scheduling:**
   - Ebbinghaus: Time-based intervals (review after 1 day, 3 days, 7 days, ...)
   - Eureka: Activity-driven (meditate when plasticity hits threshold, or memory is relevant to current task)
   - Tension: Should meditate follow Bjork spacing, or activity-demand? Both are valid.

2. **Deterministic recall (v0 BM25) vs probabilistic recall (temperature-based sampling):**
   - BM25: Ranked list, always return top-K. Deterministic, reproducible.
   - Probabilistic: Sample from distribution, allow exploration. Modern LLM-generation pattern.
   - Tension: Deterministic is safer for learning loop (stable feedback), probabilistic is richer (explore unknown). v0 is deterministic; v1 can add temp parameter.

3. **Single-task learning (v0 assumption) vs multi-task catastrophic forgetting:**
   - EWC: Track task-specific weight importance. Protect old tasks while learning new ones.
   - Eureka v0: Assumes single user/agent (no task switching). Multi-task in v1+ with task_id tracking.
   - Tension: Adding task isolation complicates queries. But Crispin's v3 schema now supports it!

4. **Conservative trust updates (v0 uses heuristic corroboration) vs aggressive learning (LLM-mediated updates in v1+):**
   - v0: +0.1 for corroboration, -0.2 for contradiction. Small, predictable updates.
   - v1+: LLM judges strength of evidence. Can produce larger updates.
   - Tension: Conservative is safer but slow learning. Aggressive is fast but risky. Start conservative, dial up as confidence grows.

**All 4 tensions resolved via hybrid composition:**
- Use Bjork curves as *baseline* for meditate scheduling, but permit activity-demand overrides
- Offer both deterministic (BM25) and probabilistic (temperature) recall modes, ship with deterministic
- Prepare schema for task_id in v0, implement task isolation in v1+
- Start with heuristic corroboration, add LLM-mediated evidence evaluation in v1+

**Implications for implementation:**
- Ebbinghaus grounding validates power-law recency. No need to revisit.
- Spaced repetition validates meditate activity. Can optimize scheduling in v1+.
- RAG pattern validates recall + ideate pipeline. Architecture is sound.
- Contradiction detection can start heuristic, upgrade to LLM later.
- EWC points to multi-task in v1+, not a v0 blocker.

**Artifact:** `.squad/decisions/inbox/edgar-prior-art-v2.md`

---

### 2026-05-22: Prior Art Cross-Pollination — v2 → v3 (ROUND 4)

**Objective:** Cross-read Genesta v2 (cognitive systems prior art) and Crispin v2 (representation prior art). Refine learning algorithms and resolve composition tensions.

**Genesta's prior art context:** Activities map to SOAR problem spaces, ACT-R activation models, GraphRAG augmented retrieval. No algorithm changes, but semantic validation that activity model is sound.

**Crispin's prior art context:** Schema supports task_id (for EWC task isolation), embedding vectors (for semantic RAG), audit logs (for corroboration tracking). All three align with Edgar's v1+ roadmap.

**Key refinements in v3:**

1. **Hybrid composition for spacing dilemma:**
   - Meditate default: Bjork curves (optimal intervals based on last_accessed + plasticity)
   - Meditate override: Activity-demand (surface memories relevant to current task/context, regardless of schedule)
   - Implementation: Two scheduling modes, user can configure via config

2. **Hybrid composition for recall dilemma:**
   - Default: Deterministic BM25 ranking (stable for learning loops)
   - Optional: Temperature-based sampling (set recall.temperature > 0 for probabilistic mode)
   - Both modes use same underlying graph and trust filtering
   - Implication for implementation: Parameterize recall algorithm by temperature

3. **Task isolation via Crispin's schema:**
   - Crispin v3 added task_id column. Perfect for multi-task EWC.
   - v0 behavior: task_id = null (single global task). All memories in single pool.
   - v1+ behavior: task_id = "langchain-agent" or "autopilot-workflow", etc. Track task-specific trust.
   - Implementation: Add task_id parameter to integrate/recall. Filter memories by (task_id = X OR task_id = null).

4. **Corroboration heuristic → LLM pipeline (v1+ ready):**
   - v0 heuristic: +0.1 corroboration, -0.2 contradiction (keyword-based)
   - v1+ LLM: Pass corroboration evidence + existing memory to LLM. Ask: "How much more confident should we be?" LLM returns scalar -0.5 to +0.5.
   - v0 implementation: Hard-coded heuristic. v1 implementation: Delegate to LLM with fallback to heuristic.

5. **Plasticity bidirectionality reinforced:**
   - v0: Plasticity decreases over time (age/validation) or increases (contradiction/frequent use)
   - Schema validation (Crispin v3): Materialized path + audit log enable tracking what changed plasticity
   - Implication: Can audit why a memory is high/low plasticity (which corroborations/contradictions led to current state)

**All 4 tensions resolved with contingent implementations:**
- Spacing: Bjork baseline + activity override (two modes)
- Recall: Deterministic default + probabilistic option (temperature parameter)
- Multi-task: null task_id in v0 (single task) + task_id filtering in v1+ (multi-task)
- Corroboration: Heuristic in v0 + LLM bridge for v1+ (same integrate interface, swappable impl)

**Confident stances post-v3:**
- Power-law recency is scientifically sound (Ebbinghaus/Wixted grounding)
- Spaced repetition complements meditate activity (schedule meditate by Bjork curves)
- RAG pipeline validates recall + ideate composition (architecture is sound)
- Task isolation is a natural v1+ addition (schema already prepared)
- Conservative updates (v0 heuristic) are safer than aggressive (LLM) for boot-strapping trust

**Artifact:** `.squad/decisions/inbox/edgar-prior-art-v3.md` (hybrid learning model + v1+ roadmap)

**Status:** v3 is ready for implementation. All learning design complete (v0 → v1 → v2 → v3). Hybrid compositions resolve all 4 tensions. Awaiting Aaron's eureka ceremony decisions on scheduling/temperature/task-isolation defaults.

---

### 2025-01-23: R6 Reconciliation — PRD v3 vs Forge/Cairn Substrate

**Objective:** Read Forge/Cairn source (R6 rule lift) and reconcile PRD v3's learning mechanics against actual substrate capabilities.

**What I found:**

1. **Sweep exists — it's Cairn's Curator + prescriber pipeline.**
   - `hooks/sessionStart.ts:runSessionStart()` triggers `curate()` → `prescribe()` on session start
   - Curator does cursor-based polling, importance decay (`computePriority` with recency weight 1.0 → 0.5 over 5-20 sessions), Tier 2 edge population (`change_vectors`), stale-flag emission (`shouldResurface`)
   - **Collision:** Curator is prescription-locked (operates on `Insight`/`Prescription`, not generic facts). v3's sweep is a general-purpose graph maintenance primitive.
   - File evidence: `cairn/src/agents/curator.ts:1-100`, `cairn/src/agents/prescriber.ts:76-96`, `cairn/src/hooks/sessionStart.ts:60-84`

2. **Ranker formula exists — under a different name.**
   - Cairn's `computePriority()` uses `confidence × recencyWeight × availabilityFactor` — structurally identical to v3's `raw = 0.5·rel + 0.2·imp + 0.2·trust + 0.1·rec`.
   - Cairn already computes a 3-term weighted sum per prescription in O(1). Adding v3's `relevance` and `attention_multiplier` is trivial.
   - **No performance blocker.** Formula is proven in production.
   - File: `cairn/src/agents/prescriber.ts:76-96`

3. **Trust is already event-driven — but schema-locked.**
   - Cairn's `optimization_hints.confidence` is updated only via `change_vectors` computation (Curator sweep) — matches v3's "no automatic decay" model.
   - Recency decay is separate from confidence (file: `cairn/src/agents/prescriber.ts:76-96`).
   - **Schema collision:** `confidence` lives on `optimization_hints` (prescriptions only). v3 needs `trust` on every fact.
   - Files: `cairn/src/db/changeVectors.ts:115-123`, `cairn/src/db/migrations/011-telemetry-feedback.ts:61`

4. **Activity verbs: partial substrate support.**
   - `decide` is **already built** — Forge's `makeDecisionRecord()` matches PRD v3's `DecisionPayload` schema exactly (file: `forge/src/decisions/index.ts:40-61`).
   - `recall` has **no substrate** — Cairn stores insights/prescriptions but has no BM25, no vector retrieval, no semantic search (grepped all of `cairn/src/` — confirmed absent).
   - `integrate` is **domain-specific** — Cairn's `createInsight()` only handles error patterns (file: `cairn/src/db/insights.ts`). Generic fact storage (`kind=fact`, `kind=aspiration`, `kind=session`) doesn't exist.
   - `commit` / `retire` / commitment registry are **entirely missing** — no `committed` flag, no hot-tier boost, no stale-commitment tracking anywhere in substrate.

5. **Hooks are orthogonal (no collision).**
   - **Cairn hooks** = CLI scripts (`sessionStart.ts`, `postToolUse.ts`) called by PowerShell wrappers, read stdin JSON, exit 0 (file: `cairn/src/hooks/`).
   - **Forge hooks** = SDK `SessionHooks` composition (`HookComposer` class, file: `forge/src/hooks/index.ts`).
   - These are different layers (CLI integration vs SDK integration). Eureka's verbs don't need to "register as hooks" in either sense — Eureka is a library, activities are function calls.

6. **Capability surprises (v3 doesn't leverage):**
   - **Bridge** (`forge/src/bridge/index.ts`) — SDK `SessionEvent` → `CairnBridgeEvent` adapter with provenance classification. Eureka can reuse for `originated_in` session edges.
   - **Telemetry** (`forge/src/telemetry/`) — signal sampling + aggregation into `ExecutionProfile`. v3's FR-6 importance scoring can reuse this (importance = aggregated usage signals).
   - **Export** (`forge/src/export/pipeline.ts`) — session → SKILL.md compiler. v3's FR-13 session facts can lean on Forge's export when "export session summary" ships.

**What changed my mind:**

- **Before read:** Assumed sweep was net-new. **After read:** Sweep exists (Curator). Architecture is sound; domain lock is the problem.
- **Before read:** Assumed ranker formula was unproven. **After read:** Cairn computes 3-term weighted sum in production. Adding 2 more terms is a non-issue.
- **Before read:** Assumed trust decay was baked in. **After read:** Cairn's confidence is already event-driven. v3's "no decay" is status quo.
- **Biggest surprise:** Forge's `decide` API already exists and matches v3 schema. One fewer thing to build.

**Structural recommendation:**

Extract Cairn's sweep/ranker/trust into a **shared learning kernel** (`packages/learning-kernel/`) that both Cairn and Eureka compose. Don't duplicate. Cairn's `Prescription` and Eureka's `MemoryNode` both become clients of the kernel.

**Mapping summary (v3 FRs → substrate):**

| v3 FR | Substrate | Status |
|---|---|---|
| FR-1 (fact storage) | Cairn `insights` (partial) | 🔴 Domain-specific, build generic `facts` table |
| FR-2 (recall + ranker) | Cairn `computePriority()` (structure only) | 🟡 Exists, domain-locked; extract ranker kernel, build retrieval |
| FR-3 (trust) | Cairn `confidence` + `change_vectors` | 🟡 Exists, schema-locked; generalize to `trust` column |
| FR-4 (activity verbs) | Forge `makeDecisionRecord()` (decide only) | 🟡 Partial (`decide` done); build `integrate`, `recall`, `commit`, `retire` |
| FR-5 (recency) | Cairn `recencyWeight` (linear decay) | 🟡 Exists, wrong formula; replace with ACT-R power-law |
| FR-6 (importance) | Cairn `confidence × availability` | 🟡 Exists, coupled; decouple into standalone `importance` |
| FR-7 (storage) | Cairn SQLite (`knowledge.db`) | 🟢 Reusable; extend schema, add `sqlite-vec` |
| FR-9 (edges) | Cairn `change_vectors` (Tier 2 only) | 🟡 Partial; build full edge store (Tier 1 + 2 + 3) |
| FR-10 (decide schema) | Forge `DecisionRecord` | 🟢 Done; adopt Forge's schema |
| FR-11 (commit registry) | (none) | 🔴 Missing; build from scratch |
| FR-12 (sweep) | Cairn Curator + prescriber | 🟡 Exists, domain-locked; extract sweep kernel |
| FR-13 (sessions as facts) | Cairn `sessions` table | 🟡 Separate table; migrate to `kind=session` facts |

**Artifact:** `.squad/decisions/inbox/edgar-r6-reconcile-v1.md` (full reconciliation report with file:line citations, 20KB)
