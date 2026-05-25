# Cassima — History

## Core Context

**Project:** Eureka — a knowledge retention and recall system for agentic systems, designed from first principles on top of the existing Cairn (storage) and Forge (runtime) packages in this monorepo. User is Aaron Kubly.

**Aaron's R5 brain-dump (verbatim, 2026-05-22):**

> Eureka is a knowledge retention and recall system for agentic systems.
> With Eureka, agents (GitHub Copilot coding agents and subagents primarily, but by no means exclusively) can:
> - store information
> - extract information from source material
> - retrieve information
> - leverage relevance during retrieval
> - strengthen or weaken prior knowledge over time
>   - in the presence of new information
>   - by persistent access or a lack thereof
>   - through reflection and meditation
> - draw connections between related information
> - use the relationship between information to discover insights
> - use the combination of unrelated information, or patterns therein, to ideate
> - work with symbols and navigate graphs
> - keep context at a minimum by opportunistically paging in only the data it needs
> - reason over concepts, deliberate, and make decisions based on facts, inductive reasoning, or deduction
>
> The user story might involve:
> - an agent familiarizing itself with a codebase
> - when asked to add a new feature, the same agent:
>   - can use its knowledge of the existing functionality to surface design questions, gaps, etc.
>   - knows where the integration points should be without re-reading the codebase
>   - uses existing patterns in the new code with minimal need for reference material
>
> Another user story might involve:
> - replacing the charter/journal/history/decisions/inbox system used by https://github.com/bradygaster/squad with Eureka
> - each team member has its own silo of knowledge and learnings and can evolve it over time *without* substantially bloating their per-turn context costs
> - the team and/or a particular project itself can have its own communal knowledge and learnings
>
> Key technical requirements:
> - how information is stored is decoupled from where information is stored
> - information can be shared between agents, projects, developers, machines, etc. e.g. not isolated to local storage on a single machine
> - use progressive disclosure, tags, pointers, references, etc. effectively to optimize context consumption

**Where Eureka stands at your spawn (2026-05-22):**
- R1-R4 of a first-principles design ceremony are complete. The trio is Genesta (facilitator), Crispin (representation), Edgar (learning dynamics).
- Hard rule still active through R5: **no reading of `packages/cairn/src/` or `packages/forge/src/`**. Lifts at R6.
- 12 design docs sit in `.squad/decisions/inbox/` (R1 first-principles, R2 cross-pollination, R3 prior-art survey, R4 prior-art cross-pollination). Most tensions converged via hybrid composition.
- **Best single read for catching up:** `genesta-prior-art-v3.md`. Schema specifics: `crispin-prior-art-v3.md`. Tensions story: `edgar-prior-art-v3.md`.

**Your job (R5):** Aaron brain-dumped above. You ideate, ask clarifying questions, draft, refine. R4 left 5 arbitration questions open — answer them during R5 as requirements crystallize:
1. Importance vs Trust — separate or merge?
2. Importance: stored column or computed on-demand?
3. Scope vs Temperature — two columns or one?
4. Community detection — batch or incremental?
5. `pray` semantics — cross-encoder re-rank or contemplative-read?

**Existing roadmap:** R5 (you) → R6 (integration, hard rule lifts) → R7 (integration cross-pollination) → R8 (final consolidation into single `eureka-design.md`).

## Learnings

### Session 2025-06-15: First PRD Draft (R5 v1)

**What I drafted:**
Created `cassima-requirements-r5-v1.md` (~650 lines) covering:
- Problem statement (Aaron's vision for agent memory)
- Personas (primary: GitHub Copilot agents; secondary: IDE assistants; tertiary: humans)
- 5 user stories with acceptance criteria (codebase familiarization, Squad migration, trust-weighted retrieval, progressive disclosure, cross-session continuity)
- 8 functional requirement sections (storage, retrieval, trust tracking, activities, recency, importance, storage abstraction, progressive disclosure)
- 5 non-functional requirement sections (performance, scalability, reliability, observability, security)
- 10 explicit non-goals (multi-modal, real-time collaboration, cross-org sharing, automated eviction, community detection, symbolic reasoning, explainability, human UI, migration tools, distributed consensus)
- 23 open questions clustered into 7 topics (scope/personas, R4 arbitration, storage/sharing, activities/reflection, trust/provenance, failure modes, Squad migration)
- R4 arbitration stances table with my recommendations on all 5 questions
- 5 tensions surfaced with trade-offs and recommendations
- Dependencies, risks, success metrics

**Tool error learned:**
Made 10+ failed `create` calls before realizing I was omitting the `file_text` parameter entirely. The error message "Invalid input: 'file_text': Required" was literal—I provided `path` but not content. Root cause: I was thinking about the PRD structure instead of the tool invocation mechanics. **Takeaway:** When tool calls fail repeatedly with "required parameter" errors, check that I'm actually *passing* the parameter, not just mentally planning its content.

**Key decisions made in PRD:**

1. **R4-Q1 (Importance vs Trust):** Recommended **separate**. Importance = salience (how critical), Trust = reliability (how confident). Example: "React usage" (high imp, high trust) vs "Possible race condition" (high imp, low trust).

2. **R4-Q2 (Importance storage):** Recommended **stored column**. Importance is stable over time (unlike recency which changes on every access). Computing on-demand wastes tokens re-evaluating salience.

3. **R4-Q3 (Scope vs Temperature):** Confirmed **two columns** (persistence_tier + attention_tier). Already decided by Crispin's v3—orthogonal concerns.

4. **R4-Q4 (Community detection):** Recommended **defer to v2, then batch**. BM25 sufficient for v1. When implemented, batch clustering (nightly) is simpler than incremental.

5. **R4-Q5 (`pray` semantics):** Recommended **rename**. "Pray" is ambiguous—use `rerank` (cross-encoder) or `contemplate` (deep-read).

6. **Plasticity semantics tension:** Resolved by adopting Crispin's definition (high = easy to update) and recommending rename to `revisability` for clarity. Low revisability = stable/protected (human-authored facts). High revisability = speculative (LLM-inferred).

7. **Trust decay tension:** Recommended coupling decay to recency. If fact recently accessed, no decay. If untouched for 30+ days, decay kicks in. Targets "forgotten" facts, not "stable" truths.

8. **Retrieval ranking tension:** Recommended query-time weighting for composite score. Single multiplicative formula (`recency * importance * trust * BM25`) doesn't fit all use cases. Agents tune weights per task type.

9. **Storage location tension:** Recommended hybrid topology. Agent-scoped (local `~/.copilot/eureka/`), Project/User/Org-scoped (cloud-backed, location-agnostic). Accept network dependency for shared tiers.

### Session 2026-05-23: R5 Round 2 — Aaron arbitrated all 8 blocking questions

Before you draft v2, you have **8 directives** waiting in `.squad/decisions/inbox/` from Aaron. He walked through each PRD-blocker one at a time. Read each directive file in full, but here's the summary of what you inherit:

1. **Q3 (killer demo)** → `copilot-directive-r5-q3-killer-demo.md` — v1 demo = **codebase familiarization + cross-session continuity**. Squad migration demo is **deferred** (too ambitious for v1).

2. **Q9 (sharing topology)** → `copilot-directive-r5-q9-sharing-topology.md` — **Local-first.** v1 ships **nothing** for cross-machine sharing. Each persistence tier gets its own storage path. Sharing/sync gets stress-tested in R6/R7 designs.

3. **Q4 (importance vs trust)** → `copilot-directive-r5-q4-importance-vs-trust.md` — **Separate columns.** Confirms your v1 recommendation. Don't conflate them.

4. **Q5 (importance: stored vs computed)** → `copilot-directive-r5-q5-importance-stored.md` — **Stored column**, updated by an **opportunistic-sweep** process. Not recomputed on every access.

5. **Q6 (scope vs temperature)** → `copilot-directive-r5-q6-scope-vs-temperature.md` — **Two columns: `persistence_tier` + `attention_tier`.** Orthogonal. R6 must define **transition rules** between tiers — surface this as an R6 hand-off.

6. **Q7 (community detection)** → `copilot-directive-r5-q7-community-detection.md` — **Defer algorithm to v2.** But v1 schema must be **graph-ready** with **6 edge types** enumerated (see directive). Team should brainstorm additional edge types — surface as an open question.

7. **Q8 (pray / rerank / contemplate)** → `copilot-directive-r5-q8-pray-rerank-contemplate.md` — Split overloaded `pray` into **three distinct verbs**: `rerank`, `contemplate`, `pray`. R6 must mandate a clear **contemplate-vs-meditate boundary** — flag this for R6.

8. **Q8b (decide vs pray)** → `copilot-directive-r5-q8b-decide-vs-pray.md` — Add **`decide`** as a fourth distinct verb. **Composable with `pray`**. `decide` = deliberation/arbitration; `pray` = appeal-to-source.

**Your v2 job:** Update the PRD to reflect Aaron's resolutions (your R4 arbitration table now becomes Aaron's directives, not your recommendations). Close all 8 questions in the open-questions register. Surface the new questions exposed by these resolutions (R6 tier-transition rules, contemplate-vs-meditate boundary, more edge types). Lock the v1 schema shape per Q6/Q7. Write to a NEW file: `cassima-requirements-r5-v2.md` — do NOT modify v1.

**Pattern observed:** Aaron resolves ambiguity decisively when given a single, focused question. Ship v2 confident in these directives — they are no longer open for debate.

**Top 3 questions Aaron needs to answer to unblock R6:**

1. **Q3 (Killer Demo):** Which ONE scenario must work flawlessly in v1? Squad migration, codebase familiarization, or cross-session continuity? This drives scope decisions.

2. **Q9 (Sharing Topology):** Local-first with sync, server-required, or hybrid? Impacts storage backend choice and API design.

3. **Q4-Q8 (R4 Arbitration):** Confirm or override my stances on the 5 R4 questions. My recommendations are in the PRD, but Aaron's input is authoritative.

**Unresolved tension that needs Aaron's input:**

**Tension 1 (Simplicity vs Completeness):** Aaron's brain-dump lists many capabilities (tags, pointers, progressive disclosure, symbolic reasoning, reflection/meditation). But R4 deferred several activities to v2+. Squad migration requires richer feature set than codebase familiarization alone. Trade-off: Narrow v1 to one killer scenario (simpler, faster to ship) OR keep Squad migration in v1 (dogfooding forcing function, but larger scope). My recommendation: Dogfood Squad migration in v1 for decisions/history only, keep charter/journal as files for now. But this needs Aaron's blessing—it's a strategic scope call.

**What I learned about product management:**

- **Sharp questions > vague questions:** Clustered 23 questions into 7 topics so Aaron can think in coherent chunks, not random list.
- **Stances with rationale > just listing options:** For R4 arbitration, I didn't just say "Importance vs Trust could be separate or merged"—I picked a side, explained why, gave examples. Aaron can override, but now there's a baseline to react to.
- **Tensions are features, not bugs:** Surfacing tensions (trust decay vs stability, retrieval ranking formula, storage location vs sharing) is PM's job. Each tension has trade-offs—documenting them helps Aaron make informed decisions.
- **Non-goals are as important as goals:** Explicit non-goals section (10 items) prevents scope creep and sets expectations. "We're NOT doing multi-modal/real-time collab/cross-org sharing in v1" is a deliverable in itself.
- **Acceptance criteria need "TBD-with-context":** Some ACs are testable now (AC-1.1: "Agent can store facts"), others need open questions resolved first (AC-4.4: "Does Eureka store hierarchical summarization?"). Flagging these as TBD keeps PRD grounded without blocking progress.

**What I'd do differently next time:**

- **Read R4 docs more strategically:** I hit file size limits on all three v3 docs. Next time, use `view_range` to read specific sections (e.g., "Tensions" heading in Edgar's doc) rather than starting from line 1. The summary helped, but I could've been more surgical.
- **Front-load arbitration questions:** The 5 R4 questions are THE most important inputs to R5. I should've asked Aaron to arbitrate them BEFORE drafting the PRD, not embedded them as open questions within the PRD. Now R6 is blocked until Aaron answers Q4-Q8.
- **Prototype one user story:** Instead of drafting a 650-line PRD, I could've proposed a lightweight prototype: "Let's implement US-1 (codebase familiarization) with JUST recall/integrate activities, BM25 retrieval, and agent-scoped storage. Ship that in 2 days, then iterate." PRDs are planning theater if we don't validate assumptions. (But maybe Aaron wants the full PRD first—this is a forcing function for clarifying questions.)

**Context for next session:**

- PRD is draft v1—Aaron will likely provide feedback, answer open questions, or arbitrate R4 tensions.
- Next deliverable (R6) is integration design—how Eureka fits with Cairn (storage) and Forge (runtime). Hard rule lifts at R6, so I'll finally be able to read those packages.
- If Aaron approves the "one killer scenario" framing (Q3), R6 should design around that scenario end-to-end, not try to solve all 5 user stories simultaneously.
- Watch for Aaron's signal on dogfooding timeline (Q21). If he wants Squad migration ASAP, R6/R7 will be aggressive. If he wants codebase familiarization first, Squad migration can wait.

### Session 2026-05-23: R5 Round 3 — Aaron resolved 9 OQ (Open Questions) from Cassima v2 PRD

**Context:** Cassima v2 PRD was delivered with 9 blocking open questions. Aaron walked each one systematically; resolutions captured as directive files in `.squad/decisions/inbox/`. Cassima v3 spawning in parallel to integrate.

**9 OQ Resolutions:**

| OQ | Topic | Resolution |
|---|---|---|
| OQ-1 | attention_tier transitions | default warm; pray→hot; retire→warm; sweep-aged demotion (session-count hysteresis, N/M R6-tunable); no auto-promotion; precedence explicit > pray > sweep-aged > default |
| OQ-2 | storage primitive | Strawman: SQLite + sqlite-vec, per-tier uniform .db files (agent/project/user at FR-7.2 paths); embedder injected; pending R6 review against Cairn |
| OQ-3 | pray follow-through | v1 pull-with-boost only; v1.5 list_active_commitments() caller-initiated; retire() explicit-only + sweep stale-flag (no auto-retire); v2 soft floor via commit_floor? opt-in |
| OQ-4 | decide schema | {question, options:[{id,label,rationale?,rejected_for?}], chosen, rationale, principal_id (renamed from decider), confidence?, supersedes_decision_id? (auto-emits edge), revisit_at?, timestamp}; chosen∈options[].id validated |
| OQ-5 | edge types | Three tiers. Tier 1 eager: derived_from, references, contradicts, supersedes, part_of, instance_of, precedes, defined_in, decided_by, committed_in. Tier 2 sweep: similar_to, co_accessed_with. Tier 3 parking lot: caused_by, useful_for, equivalent_to, responds_to, requires, analogous_to. `tags` excluded. |
| OQ-6 | contemplate | OMITTED from v1 exports entirely (no stub, no type-only); reserved in FR-10 table only |
| OQ-7 | trust decay | No automatic decay (closes T2). Trust event-driven only (contemplate/verification/contradiction/explicit_write). time_since_last_verification = derived field. Sweep emits stale_trust flag. |
| OQ-8 | ranker defaults | raw = 0.5·rel + 0.2·imp + 0.2·trust + 0.1·recency; final = raw × attention_mult (hot=1.20, warm=1.0, cold=0.80); trust floor 0.15 gate (configurable); closes T3 |
| OQ-9 | session continuity | Sessions are kind=session facts (NOT sibling table, NOT origin_session_id field). Edges: originated_in, modified_in, referenced_in (Tier 1 eager) + recalled_in (Tier 2 sweep, per-session dedup). Summary REQUIRED in v1 (caller supplies). Amends OQ-5 with 4 new edge types. |

**Files:** 9 directive files added to inbox (`copilot-directive-r5-oq{1-9}-*.md`). Cassima v3 spawned to produce final R5 PRD integrating all directives.

**Hard rule observed:** Eureka inbox files NOT merged into decisions.md; inbox files left in place for Aaron's review per standing rule.

### Session 2026-05-24: R5 Round 4 — Verb-Model Probe Patches (Scribe Log)

**What Aaron probed:**
1. **Acid test:** Does `pray` as a first-class verb survive agent-perspective scrutiny?
2. **Conceptual:** What philosophical frame justifies integration as ongoing system behavior?
3. **Reflection API:** Are dream/ideate/contemplate/meditate separate verbs or parametric modes?

**What shipped:**
- `cassima-requirements-r5-v3.md` grew 472→500 lines (+7.6KB)
- Probe 1 verdict (c): `pray` retired; `commit` promoted with full mechanics (hot tier, registry, retire, commit_floor); aspirations encoded as kind=aspiration within integrate
- Probe 2: New Conceptual Model section (Jungian framing; integration as system property)
- Probe 3: FR-10 notes dream/ideate/contemplate/meditate as likely parametric reflection-engine modes
- FR-11 renamed "Commitment Registry"; new stale_aspiration flag; US-6 restructured for commit/aspiration adjacency

**Methodology learned:** The agent-perspective acid test (model what an agent does when it executes the verb) reveals semantic collapses. `pray` reduces to `integrate(kind=aspiration)`—prayers are aspirations waiting to be committed. This technique surfaces hidden dependencies and over-abstraction in verb design.

### Session 2026-05-24: R5 Round 5 — Doc Cleanup Pass (Scribe Logged)

**What happened:** Post-round-4 cleanup. Aaron presented three-way fork for handling scaffolding (temporal patch annotations vs forever-guardrails). Chose Option B: strip "(round-N patch)" annotations + ~~pray~~ strikethrough, preserve Conceptual Model callout + mechanical stale-aspiration guardrails + commit-contract.

**Pattern observed:** Historical patch annotations are **scaffolding** (useful during review, noise at handoff). **Forever-guardrails** are **design constraints** that survive versioning (Conceptual Model framing, mechanical requirements, usage contracts). Distinguish temporal review notes from eternal design boundaries — strip the former before downstream rounds reconcile.

**Why v3 cleanup matters:** R6 readers see a polished PRD spec, not a running commentary. Full audit trail (round-3 + round-4 decisions) lives in Changelog block + git SHA `4c18ec7`; cleanup is purely presentational.

**Net delta:** 50,495 → 50,081 bytes (~414 bytes scaffolding removed). Still v3 (not a design round).

### Session 2026-05-25: R6 Synthesis — Trio Reconciliation + Path D

**What I synthesized:**

Three agents (Genesta, Crispin, Edgar) read Cairn/Forge source and reached different conclusions because of different priors, not different evidence:
- **Genesta (integration-first):** v3 is sound, patch name collisions → v3.1
- **Crispin (schema purity):** sessions-as-facts vs sessions-as-table is irreconcilable → Path A clean-slate
- **Edgar (reuse maximalism):** 70% infrastructure exists, extract learning-kernel → Path B

Aaron's 4 signals resolved the philosophical split:
1. "Session" stays as the name (reject Genesta's rename-to-conversation patch)
2. DecisionRecord and decide schema are "closer in spirit" (reject Crispin's "irreconcilable" framing)
3. Substrate overlap is a feature (lean into Curator≈sweep, confidence≈trust)
4. Path D probe: design kernel-shaped, ship standalone, Cairn adopts later

**What changed my mind:**

1. **Sessions:** I expected the trio to propose a unified model. Instead, Path D clarifies: Eureka's `kind=session` facts and Cairn's `sessions` table coexist. Optional `cairn_session_id` links them for audit; no schema merger.

2. **Vector search:** PRD v3 assumed sqlite-vec existed. It doesn't. This is the highest-risk gap. v3.1 gates vector to v1.5; v1 ships BM25-only.

3. **Decide schema:** I expected one schema to win. Instead, coexistence via adapter: Eureka uses `DecisionPayload` internally; `toDecisionRecord()` adapter maps to Forge's shape for observability. No Forge changes.

4. **Learning kernel:** Edgar's extraction is architecturally correct but timeline-coupled. Path D decouples: Eureka modules are extraction-ready (clean interfaces) but ship inside `packages/eureka/src/learning/`. Cairn adopts if/when maintainer chooses.

**Substrate truths learned via the trio:**

- Cairn's `change_vectors` is prescription deltas, not embeddings (misnomer confirmed)
- Cairn's Curator IS Eureka's sweep — but domain-locked to prescriptions
- Cairn's `computePriority()` uses same 3-term weighted sum pattern as v3's ranker
- Forge's `makeDecisionRecord()` exists and works; adapter to structured schema is tractable
- No graph infrastructure in Cairn (zero edge types, zero relations table)

**Recommendation delivered:** Path D + v3.1 patch (not v4 redraft). PRD v3 is structurally sound; five targeted patches address the gaps.

**Artifact:** `.squad/decisions/inbox/cassima-requirements-r6-v1.md`

## Learnings

### Pattern: Design-Isolation → Reconciliation → Synthesis

The R1-R5 "no reading source" rule worked. It produced a first-principles PRD unconstrained by "what's already there." R6 reconciliation then stress-tested it against reality. The synthesis step (this round) resolved the philosophical split by applying Aaron's signals as tiebreakers.

**Reusable skill:** When multiple agents read the same evidence and reach different conclusions, diagnose whether the split is evidentiary (they read different things) or prior-based (same evidence, different lenses). Prior-based splits need a product decision to resolve; evidentiary splits need more investigation.

### Pattern: Coexistence > Replacement

Aaron's signals (a), (b), (c), (d) all favor coexistence over replacement:
- Sessions coexist (Eureka facts + Cairn table)
- Decide schemas coexist (Eureka payload + Forge record + adapter)
- Storage paths coexist (Eureka's `~/.copilot/eureka/` + Cairn's `~/.cairn/`)
- Sweep implementations coexist (Eureka's learning module + Cairn's Curator)

**Design heuristic:** When integrating new system with existing substrate, default to "coexist with adapter" over "replace with migration." Reduces coupling, preserves optionality, decouples timelines.
