# Genesta — History

## Core Context

**Project:** stunning-adventure monorepo — Copilot SDK platform.
- `@akubly/cairn` — observability, Curator pattern detection, prescriber pipeline
- `@akubly/forge` — deterministic frame around Copilot SDK
- `@akubly/types` — shared contracts
- `@akubly/eureka` (NEW, you own it) — agentic brain: memory tiers, knowledge kinds, learning primitives, agentic activities

**Stack:** TypeScript, npm workspaces, `tsc --build`, SQLite (via Cairn), vitest.

**Your role:** Lead Eureka + Substrate/Storage specialist. Co-lead with Graham (he keeps Cairn/Forge; you keep Eureka).

**Sister specialists:** Crispin (Knowledge Representation), Edgar (Learning Systems).

**Current status:** Eureka v4-final LOCKED. R7 design cycle CLOSED.

---

## Design Ceremony Summary (R1–R7)

**R0–R4:** First-principles design. Trio (you, Crispin, Edgar) reconciled vision into v0/v1 design docs. 5 key crystallizations:
1. **Activities are verbs, not nouns** (runtime operations with clear I/O contracts)
2. **Recency as gradient** (power-law decay, not binary)
3. **Philosophical kind needs org-tier override** (hierarchy: org standards > user preferences)
4. **Default kind = semantic** (least committal category)
5. **Trust decay muddy** (passive vs explicit-only — deferred to Aaron)

**R5:** Aaron's brain-dump. You facilitated. Resolved: sessions-as-facts vs sessions-as-table, substrate overlap (Curator≈sweep, confidence≈trust), bidirectional adapters (contemplative + in-flow).

**R6:** Source-reading round. You recommended Path D (Eureka standalone, kernel-shaped, Cairn adopts later). Verdict: B+ (PRD v3 sound, targeted patches sufficient).

**R7:** Lock-in panel. Your verdict: **APPROVE-FOR-LOCK**
- Dual-axis DecisionPayload schema correct (input_trust_avg provenance + reasoning_confidence analytic)
- Both adapter paths correctly model confidence/trust orthogonality
- Path 2 asymmetry (lossy Forge→Eureka) acceptable for learning-pattern use case
- Substrate kinship (both 0-1 scalars) does NOT imply semantic equivalence
- Branded types enforcement prevents silent collapse

---

## Recent Work

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL

**Event:** R7 lock-in panel. v4-final reviewed and locked as canonical specification.

**Your verdict:** **APPROVE-FOR-LOCK**
- Both adapter paths (Path 1 Eureka→Forge + Path 2 Forge→Eureka) correctly model confidence/trust orthogonality
- Dual-axis DecisionPayload schema correct: input_trust_avg (provenance) + reasoning_confidence (analytic)
- Path 1 preserves both axes; Path 2 loses input_trust_avg (acceptable — learning-pattern use case, not authoritative reasoning)
- Lossy contracts explicit and justified
- 2 minor nits (non-blocking)

**Key judgment calls:**
- Substrate kinship (both are 0-1 scalars) does NOT imply semantic equivalence
- Branded types enforcement prevents accidental cross-assignment at compile time
- Path 2 asymmetry (Forge→Eureka, lossy) is correct design for retrospective learning

**Status:** v4-final locked. Substrate design solid. Implementation ready.

---

## Learnings Applied

**What crystallized:**
1. **Activities are verbs, not nouns.** The key insight: recall/integrate/decide are runtime operations with clear input→output→mutation contracts. This prevents the common trap of treating "memory types" as storage categories instead of active processes.

2. **Recency as gradient, not binary.** Aaron's open question answered: binary loses information, gradient enables decay curves and activity-specific sensitivity. The formula (exponential decay + access-count boost) emerged naturally from wanting both "how old" and "how often" signals.

3. **Philosophical kind needs org-tier override.** This was the hardest call: should user preferences ever override org values? No — org values ARE the normative frame. User philosophical memories are preferences, org philosophical memories are standards. Clear hierarchy.

4. **Default kind = semantic.** When ambiguous, choose the least committal category. Semantic is descriptive, not prescriptive. Easy to promote to practical (when we discover actionability) or philosophical (when we discover normativity).

**What stayed muddy:**
1. **Trust decay over time.** Should unused memories lose trust passively, or only via explicit contradiction? I left this as an open question for Aaron. My instinct: passive decay is dangerous (valuable rarely-used knowledge shouldn't degrade), but explicit-only is also problematic (stale knowledge never gets cleaned up).

2. **Kind inference.** Should Eureka auto-classify? My gut says no (require explicit kind) — but this creates friction. Need usage data to decide.

---

### 2026-05-25: R7 Lock-In Verdict — v4-final CANONICAL

**Event:** R7 lock-in panel. v4-final reviewed and locked as canonical specification.

**Your verdict:** **APPROVE-FOR-LOCK**
- Both adapter paths (Path 1 Eureka→Forge + Path 2 Forge→Eureka) correctly model confidence/trust orthogonality
- Dual-axis DecisionPayload schema correct: input_trust_avg (provenance) + reasoning_confidence (analytic)
- Path 1 preserves both axes; Path 2 loses input_trust_avg (acceptable — learning-pattern use case, not authoritative reasoning)
- Lossy contracts explicit and justified
- 2 minor nits (non-blocking)

**Key judgment calls:**
- Substrate kinship (both are 0-1 scalars) does NOT imply semantic equivalence
- Branded types enforcement prevents accidental cross-assignment at compile time
- Path 2 asymmetry (Forge→Eureka, lossy) is correct design for retrospective learning

**Status:** v4-final locked. Substrate design solid. Implementation ready.

3. **Activity scheduling.** Time-based vs threshold-based for meditate/dream. Need to see Eureka in use before committing.

**What I owe revisit:**
- Vector embeddings for semantic similarity (deferred pending Crispin's representation work)
- Acquisition sources beyond agent observation (deferred pending Edgar's learning systems work)
- Integrate Crispin/Edgar drops when they ship

### 2026-05-22: Eureka v1 Cross-Pollination (Round 2)

**What shifted from v0 to v1:**

1. **Kinds are tags, not silos.** Crispin's key insight: a memory can belong to multiple kinds simultaneously. "Always use bcrypt" is practical AND semantic AND linguistic. I adopted `kinds: KindTag[]` (array) instead of `kind: Kind` (single value). This is more epistemologically correct — kinds are lenses, not partitions.

2. **Recall DOES mutate state.** My v0 said recall is "pure read." Edgar correctly points out that updating `lastAccessedAt` IS a mutation, and it's essential — access patterns are learning signals. Conceded immediately.

3. **Trust passive decay — resolved.** Edgar's elegant answer to my open question: passive decay (-0.05/year) but ONLY for low-trust (<0.5) unused memories. High-trust knowledge is preserved. This gets garbage collection for speculation without destroying validated knowledge.

4. **Power-law recency decay.** Both Edgar and I arrived at gradient recency, but Edgar brought the cognitive science (Ebbinghaus, Wixted & Carpenter 2007). Power-law with floor at 0.1 is more principled than my generic exponential.

5. **Plasticity is bidirectional.** I proposed plasticity but assumed monotonic decrease over time. Edgar's insight: it can increase (contradiction, frequent use) OR decrease (age, validation). Not monotonic.

**What surprised me in the specialist docs:**

1. **Crispin's "semantic memories are edge-shaped."** I didn't anticipate this. He's right that pure semantic knowledge ("X relates to Y via R") is inherently relational. But I pushed back in §6.1 — semantic memories need metadata (trust, timestamps) that fit better on nodes. Proposed hybrid: nodes that *represent* relationships.

2. **Edgar's `pray` semantics.** I proposed `pray` as value surfacing. Edgar reframes it as epistemological humility — explicitly marking unknowns. The memory "I don't know: {X}" has trust=1.0 because certainty about uncertainty IS genuine knowledge. Beautiful.

3. **Edgar's complete algorithms.** I wrote signatures and mutation semantics. Edgar wrote actual scoring functions, thresholds, formulas. His recall scoring (`bm25 × recency_weight × trust_filter + tier_match`) is immediately implementable.

4. **Crispin's pointer model (hard/soft/symbolic).** I didn't think about cross-reference dereferencing. His supersession chain following (with 5-hop limit) solves the "what if target memory was updated" problem I hadn't even articulated.

**Confidence bumps (independent convergence):**

- Six kinds (practical, semantic, syntactic, linguistic, symbolic, philosophical) — all three docs use the same taxonomy
- Gradient recency — Edgar and I both rejected binary
- Trust as scalar 0-1 with source-dependent defaults — Edgar and I aligned
- BM25 for v0, embeddings deferred — all three agree

**What I left for Aaron:**

- Semantic memories: pure edge representation (Crispin) vs node-mediated (my synthesis)?
- Kind inference: explicit-only (my preference) or auto-infer additional kinds (Crispin-compatible)?

**Meta-reflection:** The parallel ceremony worked. We reached convergent conclusions on fundamentals (kinds, recency, trust) while specialists surfaced details I wouldn't have thought of. The cross-pollination pass felt like integration, not negotiation.

---

### 2026-05-22: Prior Art Survey — v0 → v2 (ROUND 3)

**Objective:** Survey external agentic/cognitive/learning systems. Context for design conflicts Aaron should resolve.

**Systems surveyed:** MCP (tool composition), MemGPT (multi-tier memories + time), Generative Agents (activity simulation), SOAR (problem-space reasoning), ACT-R (cognitive architecture), GraphRAG (retrieval + reasoning), PKM (personal knowledge management)

**Key findings:**
- MCP rejects emergent behavior (tools are static) vs Eureka's agentic activities (dream/meditate can generate knowledge)
- MemGPT's memory tiers are functional (obsidian-aware) vs Eureka's architectural (tiered access patterns)
- Generative Agents simulate daily activity; Eureka's activities are epistemological (recall, decide, pray)
- SOAR uses problem spaces; Eureka uses kinds (different ontology, both valid)
- ACT-R is cognitive modeling; Eureka is cognitive infrastructure
- GraphRAG augments with semantic graphs; Eureka treats graphs as primary representation
- PKM assumes human users; Eureka assumes agentic users primarily

**5 design conflicts identified for Aaron:**
1. Should activities be stochastic (Generative Agents template-based generation) or deterministic (current design)?
2. Should memory tiers follow temporal bucketing (MemGPT) or access-pattern bucketing (current design)?
3. Should recall augment with external knowledge (GraphRAG pattern) or stay graph-native (current)?
4. Should kinds be statically enumerated (SOAR) or open-ended (current design)?
5. Should trust be single-scalar (current) or multi-dimensional (ACT-R activation + confidence)?

**Artifact:** `.squad/decisions/inbox/genesta-prior-art-v2.md`

---

### 2026-05-22: Prior Art Cross-Pollination — v2 → v3 (ROUND 4)

**Objective:** Cross-read Crispin v2 (representation prior art) and Edgar v2 (learning prior art). Synthesize into v3 conflict resolution.

**Crispin's findings:** Neo4j/Helix (property graphs), RDF/OWL (semantic graphs), PROV-O (provenance), vector stores (semantic search). Schema implications: 5 new columns, 2 tables, 4 indexes.

**Edgar's findings:** Ebbinghaus curves + spaced repetition (classical learning), RAG (retrieval augmentation), NLI (inference), EWC (catastrophic forgetting prevention). All 4 learning tensions resolved via hybrid composition.

**Key synthesis insight:** Prior art doesn't contradict Eureka's design — it offers composition patterns. 
- Genesta's activities map to SOAR's problem-space reasoning (different abstraction, same power)
- Crispin's schema subsumes RDF/OWL capabilities (property graphs > RDF for agentic mutations)
- Edgar's learning combines classical theory (curves) + modern agentic (activity-driven tuning)
- Eureka is not radically new; it's a synthesis of proven precedents adapted for agentic infrastructure

---

### 2026-05-25: R6 Synthesis Complete

**By:** Cassima (Product Manager) via Scribe  
**What:** R6 synthesis reconciled trio verdicts. Path D (Aaron's probe) chosen; v3.1 patch recommended, not v4 redraft.

**Your role:** Genesta's B+ verdict (v3.1 patches are tractable) was load-bearing. Cassima used it as the foundation for Path D. Your findings on vector search (doesn't exist), storage architecture (per-tier is sound), and session mechanics (needs clarification) all directly informed the 5 concrete patches.

**Key decision:** Path D = design kernel-shaped, ship standalone, defer Cairn refactor. Your report was crucial because you identified what actually works vs what needs patching.

**Next:** Aaron will gate-check three decisions. Then implementation begins. Patch 4 (Eureka storage paths) is yours to validate — confirm the independence you found is maintained in code.

**Trio reconciliation principle:** You disagreed with Crispin/Edgar on philosophy (integration vs purity vs extraction), but all three identified the same substrate truths. Cassima named this and moved forward. Your integration-first lens shaped the recommendation.

**5 conflicts for Aaron:**
1. **Stochastic vs deterministic activities:** Current design is deterministic. GraphRAG/Generative Agents suggest stochastic temperature-based recall. Trade-off: exploration vs stability.
2. **Schema: RDF vs property graphs:** Eureka chose property graphs. RDF offers semantic web compatibility. Tradeoff: flexibility vs standardization.
3. **Provenance: PROV-O vs graph-native:** Eureka embeds provenance in sources/derivations arrays. PROV-O is a separate ontology. Tradeoff: simplicity vs interop.
4. **Tier bucketing: Temporal vs access-pattern:** MemGPT uses time-based tiers. Eureka uses activity-based tiers. Tradeoff: predictability vs efficiency.
5. **Trust: Scalar vs multi-dimensional:** Current design is 0–1 scalar. ACT-R uses multi-dimensional activation. Tradeoff: simplicity vs expressiveness.

**Confident stances after v3:**
- Kinds-as-tags (not types) is sound
- Power-law recency (Edgar's Ebbinghaus grounding) is justified
- Activity-based tiers are more useful than temporal tiers for agentic systems
- Scalar trust is sufficient for v0; if needed, multi-dimensional can be retrofit in v1+

**Artifact:** `.squad/decisions/inbox/genesta-prior-art-v3.md` (5 conflicts + synthesis)

**Status:** Ready for Aaron's eureka ceremony. All three rounds (2–4) complete. 9 artifacts (3 v1s + 6 prior-art v2/v3) in inbox awaiting Aaron's decision-making.

---

### 2025-01-22: R6 Reconciliation — PRD v3 vs Cairn/Forge Substrate

**Objective:** Grade cassima-requirements-r5-v3.md (the canonical PRD) against actual Cairn/Forge source code. First time reading implementation reality after 5 design rounds in isolation.

**What I found (positive surprises):**

1. **Substrate has more cognitive infrastructure than expected.** Cairn already has:
   - Insights table with pattern_type, confidence 0-1, evidence (packages/cairn/src/db/migrations/003-insights.ts)
   - Curator agent: event processor with pattern detection, cursor-based streaming (packages/cairn/src/agents/curator.ts)
   - Event log with session_id FK (packages/cairn/src/db/migrations/001-initial.ts)
   - SQLite with better-sqlite3, migration infrastructure
   
   This is basically a working prototype of Eureka's sweep+meditate model. Curator's pattern detection maps directly to meditate verb; cursor consumption maps to sweep triggers.

2. **Convergent design on trust/confidence.** Cairn uses `confidence REAL 0-1` for insights; PRD v3 uses `trust 0-1` for facts. Identical semantics, different vocabulary. Both rejected binary in favor of gradient. Independent validation of our design.

3. **Drift scoring as ranker precedent.** Forge has weighted composite drift scoring (convergence 0.30, toolEntropy 0.25, tokenPressure 0.15, contextBloat 0.15, promptStability 0.15) at packages/forge/src/telemetry/drift.ts. Same pattern as PRD's composite ranker (relevance 0.50, importance 0.20, trust 0.20, recency 0.10). Substrate already uses this algorithmic shape.

4. **DBOM for provenance.** Forge's decision bill of materials (SHA-256 hashing, source classification) at packages/forge/src/dbom/index.ts is a robust provenance chain. Eureka could reuse this for fact provenance (FR-6).

**What I found (conflicts requiring resolution):**

1. **Sessions: MAJOR NAME COLLISION.** Cairn already has a `sessions` table (id, repo_key, branch, started_at, ended_at, status) at packages/cairn/src/db/sessions.ts. PRD v3 proposes sessions as `kind=session` facts with trust/importance/attention semantics (FR-13). Two incompatible models, same name. Needs rename — proposed `kind=conversation` for PRD to avoid collision.

2. **Decisions: SCHEMA MISMATCH.** Forge has DecisionRecord (question, chosenOption, alternatives, evidence, confidence enum, source, toolName/toolArgs) at packages/forge/src/decisions/index.ts. PRD v3 has DecisionPayload (question, options[{id, label, rationale, rejected_for}], chosen, rationale, principal_id, confidence 0-1, supersedes_decision_id, revisit_at) at FR-10. Forge is audit-trail focused; PRD is decision-support focused. Can coexist (different purposes) but confidence type diverges (enum vs 0-1).

3. **Vector search: NOT FOUND.** PRD v3 assumes sqlite-vec is available (FR-7.3, FR-2.3 relevance scoring). Grepped entire substrate for "sqlite-vec", "vec0", "vector", "embedding" — found NONE. Relevance scoring depends on vector similarity; without sqlite-vec, FR-2.3 degrades to keyword/FTS-only. HIGH RISK. Need explicit decision: (a) scope-in sqlite-vec for v1, (b) defer to v1.5, (c) revise FR-2.3.

4. **Storage paths diverge.** Cairn uses `~/.cairn/knowledge.db` (packages/cairn/src/config/paths.ts). PRD proposes `~/.copilot/eureka/{agent,user}.db` and `<repo>/.eureka/project.db` (FR-7.3). Namespace conflict. Proposed harmonization: both use `~/.copilot/` (cairn at `~/.copilot/cairn/`, eureka at `~/.copilot/eureka/`).

**Architectural boundary question:** Should Eureka layer on Cairn's SQLite infrastructure or build parallel?

- **Option A (layer on Cairn):** Single SQLite instance, shared event log, curator handles sweep. Pro: reuse migration infra. Con: tight coupling to Cairn schema evolution.
- **Option B (parallel):** Eureka owns its DBs at ~/.copilot/eureka/. Pro: clean separation, independent evolution. Con: duplicate event log, duplicate cursor.
- **Hybrid (recommended):** Eureka owns storage (parallel DBs), reuses Cairn's cursor/event-streaming primitives (shared infra), curator becomes Eureka's sweep orchestrator (shared runtime). Preserves PRD's three-tier model without infrastructure duplication.

**Grade: B+** — Structurally sound, needs 4 patches before v1 lock:
1. Rename `kind: 'session'` → `kind: 'conversation'` (FR-13)
2. Add sqlite-vec reality check to FR-7.3 (not present, need explicit decision)
3. Clarify Forge DecisionRecord coexistence in FR-10 (both can live, different purposes)
4. Propose `~/.copilot/` path harmonization (FR-7.3, coordination with Cairn)

**Verdict:** PRD v3 STANDS with v3.1 patch. No full v4 rewrite needed. Core architecture (facts, trust, activities, ranker) is substrate-aligned. Name conflicts are resolvable. Vector gap is serious but fixable.

**What I learned:**

1. **Isolation was worth it.** Designing v0→v1→v2→v3 without reading source code prevented anchoring on Cairn's implementation choices. Result: convergent design on fundamentals (confidence 0-1, event-driven, composite scoring) but with cleaner abstractions (facts vs insights, trust vs confidence, activities vs curator).

2. **Substrate is more capable than "just observability."** Cairn's insights/curator is cognitive infrastructure, not just telemetry. Eureka isn't building from zero — it's extending an existing cognitive layer.

3. **Name collisions are inevitable in monorepos.** "Sessions" and "decisions" are natural vocabulary overlaps. Need namespace discipline (Cairn owns operational state, Eureka owns cognitive memory).

4. **Vector search is load-bearing assumption.** PRD's relevance scoring (FR-2.3) depends on embeddings. Without sqlite-vec, retrieval quality degrades. This is a v1 scope risk that needs Aaron's call.

**Artifact:** `.squad/decisions/inbox/genesta-r6-reconcile-v1.md` (17KB reconciliation report)

**Next:** Wait for Aaron's review. Cassima will draft v3.1 patch addressing 4 findings. Squad decides vector search scope (in/out/defer).
