# Genesta — History

## Core Context

**Project:** stunning-adventure monorepo — Copilot SDK platform.
- `@akubly/cairn` — observability, Curator pattern detection, prescriber pipeline (Roger primary)
- `@akubly/forge` — deterministic frame around Copilot SDK (Alexander primary)
- `@akubly/types` — shared contracts
- `@akubly/eureka` (NEW, you own it) — agentic brain: memory tiers, knowledge kinds, learning primitives, agentic activities

**Stack:** TypeScript, npm workspaces, `tsc --build`, SQLite (via Cairn), vitest.

**User:** Aaron Kubly.

**How Eureka was scoped (four rounds of deliberation):**
1. Round 1: Should the brain live in this repo or a new one? Squad split 2-1 on monorepo vs new repo
2. Round 2: Aaron's brain dump (6 dimensions) — squad shifted toward new repo
3. Round 3: Squad self-assessment — unanimous "this squad is not the right primary owner" → recommended new repo + new specialist squad
4. Round 4: Aaron pushed back on cross-repo overhead for 3 hires + solo orchestrator → **decision: stay in this repo as `packages/eureka/`, hire 3 specialists into this squad**

**Your charter:** Lead Eureka. Co-lead with Graham (he keeps Cairn/Forge; you keep Eureka). You were hired specifically because the existing squad lacked epistemology/agentic-systems background.

**Sister specialists hired with you:**
- **Crispin** — Knowledge Representation Specialist (graph schema, kind taxonomies, cross-reference model)
- **Edgar** — Learning Systems Specialist (plasticity/trust/recency algorithms, activity implementation)

**Existing squad members you'll work with:**
- Graham (architect, your co-lead for repo-wide architecture)
- Roger (Cairn platform — federation backbone primitives are similar problems)
- Alexander (Forge runtime — Eureka↔Forge integration seam lives here)
- Valanice (UX/human factors — config surface, observability UX)
- Laura (test patterns — including stochastic/agentic test patterns, which she'll be learning)

## Learnings

### 2026-05-22: Eureka v0 Design Ceremony

**What crystallized:**
1. **Activities are verbs, not nouns.** The key insight: recall/integrate/decide are runtime operations with clear input→output→mutation contracts. This prevents the common trap of treating "memory types" as storage categories instead of active processes.

2. **Recency as gradient, not binary.** Aaron's open question answered: binary loses information, gradient enables decay curves and activity-specific sensitivity. The formula (exponential decay + access-count boost) emerged naturally from wanting both "how old" and "how often" signals.

3. **Philosophical kind needs org-tier override.** This was the hardest call: should user preferences ever override org values? No — org values ARE the normative frame. User philosophical memories are preferences, org philosophical memories are standards. Clear hierarchy.

4. **Default kind = semantic.** When ambiguous, choose the least committal category. Semantic is descriptive, not prescriptive. Easy to promote to practical (when we discover actionability) or philosophical (when we discover normativity).

**What stayed muddy:**
1. **Trust decay over time.** Should unused memories lose trust passively, or only via explicit contradiction? I left this as an open question for Aaron. My instinct: passive decay is dangerous (valuable rarely-used knowledge shouldn't degrade), but explicit-only is also problematic (stale knowledge never gets cleaned up).

2. **Kind inference.** Should Eureka auto-classify? My gut says no (require explicit kind) — but this creates friction. Need usage data to decide.

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
