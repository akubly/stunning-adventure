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

### 2026-05-22: Eureka v0 Design — Learning/Dynamics Contribution

**Context:** Parallel ceremony with Genesta (integration) and Crispin (representation). My mandate: settle activity algorithms, property dynamics, scheduling, feedback loops.

**Key decisions made:**

1. **Recency = gradient (power-law decay), not binary.** Rationale: Cognitive science (Ebbinghaus, Wixted) shows memory exhibits power-law forgetting, not sharp short-term/long-term split. Gradient allows smooth ranking. Formula: `1 / (1 + α × (now - t)^β)` with β=0.7 (typical human memory exponent), floor at 0.1 to prevent extinction.

2. **Trust = scalar (0.0–1.0), single dimension for v0.** Mutated by corroboration (+0.1), contradiction (-0.2), validation (+0.1), invalidation (-0.2). Read by recall (filter), decide (weighting), integrate (conflict resolution). Defaults: user-provided 0.7, agent-inferred 0.5, speculative (dream/ideate) 0.2.

3. **Plasticity = scalar (0.0–1.0), BIDIRECTIONAL.** Can increase (contradiction, frequent use) or decrease (age, validation). Not monotonic. Read by integrate (reject low-plasticity updates unless trust gap large) and re-evaluate. Defaults: normal 0.5, revisable 0.7, fluid 0.9, crystallized 0.3.

4. **Activities split:** Three load-bearing (recall, integrate, decide) with full algorithms specified. Five secondary (meditate, dream, explore, ideate, pray) with sketches. One event-triggered (re-evaluate). Scheduling: sync for load-bearing + on-demand, background for consolidation (meditate nightly, dream weekly), event-driven for re-evaluate.

5. **Feedback loop = prediction → outcome → re-evaluate → trust update.** Minimum cycle: 1 decision + 1 outcome. Explicit correction (user says "wrong") in v0, implicit (agent observes outcome) in v1.

6. **"pray" algorithm:** Epistemological humility primitive. Creates Philosophical memory with trust=1.0 (high trust in the unknown), plasticity=0.9, cross-referenced to triggering context. Defers judgment rather than hallucinate. From epistemology: some questions have no answer yet.

**Hard calls:**
- **BM25 over embeddings for v0:** Deterministic, fast, no external dependencies. Embeddings in v1 after we validate basic retrieval works.
- **Contradiction detection = heuristic in v0:** Negation keywords, opposite values. LLM-mediated in v1. Pragmatic: ship fast, upgrade later.
- **Stochastic activities (dream, ideate) in v1:** Template-based generation in v0. LLM creativity in v1. Don't block core learning loop on generative features.

**Pushback points:**
- Genesta may want stochastic recall (sample with temperature) — I default to deterministic for v0, but open to override if use case is strong.
- Crispin's graph schema will constrain what `meditate` and `explore` can do (traversal patterns, cross-reference representation). I've sketched algorithms assuming flexible graph; if Crispin goes relational, we adapt.

**Punted to v1:**
- Embeddings, multi-agent deliberation, confidence intervals, adaptive scheduling, outcome tracking infrastructure, versioning/history, provenance chains, meta-learning.

**Testing notes:**
- Unit tests per activity (mocked store).
- Integration: full cycle (store → recall → integrate → re-evaluate).
- Stochastic: validate decay curves, trust convergence over time.
- Adversarial: contradictions, low-trust sources, rapid updates.

**Artifact:** `.squad/decisions/inbox/edgar-learning-v0.md` (19KB specialist doc)

**Next:** Genesta integrates with Crispin's representation doc into unified v0 spec. I implement once schema is settled.
