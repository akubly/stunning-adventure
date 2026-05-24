# Valanice — History (Summarized)

## Summary

**Total entries:** 3 major consultations spanning Phase 4.5 UX + Round 2 brain system consulting + Round 2 roster proposal

| Date | Event | Status |
|------|-------|--------|
| 2026-04-28 | Phase 4.5 Prescriber UX Learnings | ✅ Completed |
| 2026-05-22 | Brain System Consulting (Round 2, UX Lens) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (UX Advisor Role) | 🟡 Proposal pending Aaron |

**Key themes:**
- Prescriber UX: Max 1 proactive insight per session, pull-based interface, observability on demand
- Brain system: Infrastructure positioning (like Git), mental model boundaries, phased extraction strategy, 70% UX owner / 30% cognitive science gap
- Brain roster: Proposed UX Advisor (advisory, 20%) for Brain project with primary Cairn commitment

**Recent decision:** Valanice positioned as strong on UX/LX (70% of Brain's interaction design), but flagged cognitive foundations (30%) as requiring specialist. Proposes advisory role with 20% allocation and primary Cairn focus.

---

## R6 Ceremony — Source-Reading Rule Lifted (2026-05-24)

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate).

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.

## Archive (Summarized)

### Phase 4.5 UX Work — Prescriber Design + LX Fundamentals (2026-04-02 to 2026-04-05)

**Scope:** Phase 5 MCP tool naming, README refresh, Prescriber UX, LX brainstorm, Shiproom ceremony.

**Key deliverables:**

1. **Phase 5 Finalization:** MCP Server (not CLI) as primary shell. Tool naming convention `verb_noun` unprefixed. Verbs establish semantic contracts: `get` = single result, `list` = 0+ results/paginate, `search` = exploration, `run` = side effect, `check` = boolean.

2. **README Refresh:** Updated for Phases 4–5 reality (test count 106→136, corrected phase labels, added Hooks and MCP Server sections). Principle: narrate work, not worker. Omit speculative content.

3. **Prescriber UX Design:** Max 1 proactive per session, after first success (not session start). Rejection 1-step, acceptance 2-step (safe default). Explicit state machine (no limbo states). Growth pull-only, wins-first (no streaks). Four MCP tools. Anti-rubber-stamp via diffs, not quizzes.

4. **LX Heuristics (10 Principles):** Context budget parallels attention span. Signal density = info/token. Vocabulary contracts aid tool selection. Upstream prevention (slop is LX failure). Idempotent safety = LLM undo. Decision altitude = consequence taxonomy (ambient/logged/flagged/gated).

5. **Shiproom Ceremony Design:** Decision records with alternatives (min 1, mandatory). Graham facilitates (has cross-cutting knowledge). One probing question per challenger. Curator provides evidence-based challenge. Decision altitude filters (0-1: never, 2: optional, 3: required). Human sees summary + escalations only (newspaper test, 30 sec). Confabulation prevention: cite existing evidence only.

**Key patterns:** MCP tool naming drives agent behavior (verbs read naturally). Decision records are content-addressed for tamper-evidence. Ceremony efficiency feeds back into Curator → Prescriber loop.

**Status:** Phase 6 complete. Documentation matches implementation. Ready for distribution phase.

---

**Artifacts Produced:**
- `.squad/decisions/inbox/valanice-brainstorm-lx.md` — 10 LX Heuristics (parallel to Nielsen's 10), Decision Consequence Taxonomy, slop-as-upstream-LX-failure analysis, OOP mental model mapping, new LX vocabulary
- Proposed LX Heuristic Evaluation checklist as highest-leverage next action

**Key LX Principles Identified:**
- Context Budget: the LX analog of attention span — every token consumed is budget spent
- Signal Density: information value per token in tool output (Cairn's `confidenceToWords()` is a good example)
- Vocabulary Contracts: verb semantics (get/list/search/run/check) as the LX equivalent of consistent navigation
- Upstream Prevention: slop is a symptom of LX violations, not a standalone problem to police
- Idempotent Safety: the LLM equivalent of "undo" — safe to retry without side effects
- Decision Altitude: 4-tier consequence taxonomy (ambient → logged → flagged → gated)

**Connections to Existing Work:**
- Cairn's DP1–DP5 design principles are already LX heuristics in disguise
- The Prescriber's accept/reject/defer model exemplifies LX-3 (Freedom and Undo) and LX-5 (Error Prevention)
- The verb_noun naming convention from Phase 5 is a rigorous implementation of LX-2 and LX-4

### 2025-07-18: Shiproom Ceremony Design — Decision Defense as Agentic QA

**Task:** Design the Shiproom ceremony pattern for Squad, grounded in both UX (human-facing) and LX (LLM-facing) principles.

**Core Concept:** Shiproom is where agents "speak to" their decisions — presenting the decision chain for a completed task and defending it against domain challengers. Unlike code review (which evaluates artifacts), Shiproom evaluates *reasoning* — the decisions that produced the artifacts.

**Key Design Decisions:**

1. **Decision Record schema** — every defensible decision captured at decision time with: question, chosen option, alternatives (min 1, mandatory), evidence, confidence, altitude, parent linkage. The `alternatives` minimum prevents default-as-decision inertia. Content-addressable IDs make the chain tamper-evident (Aaron's "blockchain" analogy made structural).

2. **Facilitator: Graham (Lead), not a dedicated agent.** A ceremony-only agent would lack domain context. The Lead has the cross-cutting knowledge to smell when something is wrong. Role rotation handles conflict of interest — when Graham's own decisions are under review, Roger facilitates that specific decision.

3. **One probing question per challenger.** Prevents death-by-a-thousand-questions. This is attention rationing — the ceremony equivalent of "max 1 proactive hint per session" from Prescriber UX. Challengers are domain-routed by decision tags.

4. **Curator as unique non-domain challenger.** It doesn't have opinions — it has data. "The last three times a decision like this was made, the pattern recurred within 5 sessions." Evidence-based challenge, not subjective review.

5. **Decision Altitude filters what enters Shiproom.** Altitude 0–1: never individually examined. Altitude 2: examined, challenge optional. Altitude 3: full examination required, human notified. Progressive disclosure (Krug) applied to ceremony design.

6. **Human sees summary + escalations only (default).** The "newspaper test" — 30-second summary tells you exactly where attention is needed. Full ceremony browsable as opt-in pull interface. Asynchronous escalation resolution — human judges on their schedule.

7. **Confabulation prevention in "speak to" pattern.** Agents can only cite evidence already in the decision record — no post-hoc reasoning. Behavioral constraint first; structural verification (hash checking) deferred until confabulation rate is measurable via Curator patterns.

8. **LX-11: Ceremony Efficiency (new heuristic).** Metrics: challenge rate, amendment rate, escalation rate, token cost per decision. These feed back into the Curator → Prescriber loop for self-improvement.

**The Flywheel:** Shiproom generates structured signal about decision quality → Curator detects patterns in overturned/amended decisions → Prescriber suggests improvements → Future decisions improve → Fewer Shiproom amendments → Lower ceremony cost → More time building.

**Artifacts Produced:**
- `.squad/decisions/inbox/valanice-shiproom-ceremony.md` — full design specification

**Open Questions:**
- Auto-trigger threshold calibration (start at 3+ Altitude ≥ 2, adapt via amendment/overturn rates)
- Confabulation measurement methodology
- Ceremony cost budget in tokens

### 2025-01-18: Brain/Memory System — UX Lens and Repo Placement

**Task:** Provide UX/human factors analysis for Aaron's brain/memory/thinking/learning system sizing. Graham, Roger, and Alexander handling technical sizing; Valanice addresses human experience implications and repo placement decision.

**Aaron's Brain Dump:**
- TIERS: agent/subagent, organizational (team/vertical/discipline), project (per repo), user (local/global, cwd-aware via hooks)
- KINDS: Practical, Semantic, Syntactic, Linguistic, Symbolic (code graph), Philosophical
- PROPERTIES: recency (gradient?), trustworthiness, plasticity
- ACTIVITIES: recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate
- REPRESENTATION: graph, cross-ref, markdown
- ACQUISITION: codebase exploration, periodic discovery, journaling

**Key UX Questions Addressed:**

1. **User-memory tier identity: USER product or DEV TOOL?**
   - Answer: **BOTH — infrastructure that feels like a product** (like Git, not VS Code Settings Sync).
   - Installation model: Global install (`npm install -g @akubly/brain`), per-repo opt-in (`.brain/config.yml`), agents auto-discover via MCP.
   - Identity determines repo placement: If `@akubly/brain`, it's part of the ecosystem. If standalone brand (Synapse, Mneme), it's infrastructure.

2. **Knowledge activities: Observable or invisible?**
   - Answer: **Invisible by default, observable on demand** (pull interface, not push notifications).
   - Silent activities: recall (cache-like), integrate (post-session), explore (background indexing), meditate (scheduled reflection), re-evaluate (trust decay).
   - Observable activities: ideate ("What does my brain think about X?"), dream ("Show me surprising connections"), decide ("Should I use pattern X?").
   - **UX Principle:** Max 1 proactive insight per session, only after first success (Prescriber pattern). Default is pull, not push.

3. **Trust/plasticity/recency settings: CLI, GUI, config, MCP, IDE?**
   - Answer: **Config files as source of truth + MCP for runtime queries + CLI for curation.**
   - Config files (`.brain/config.yml` per repo, `~/.brain/global.yml` globally): trust thresholds, recency gradients, plasticity policies. Versionable, auditable, follows Git's `.gitconfig` model.
   - MCP server: agent-facing interface (`brain_recall`, `brain_ideate`, `brain_decide`, `brain_list_memories`). LX-optimized, follows verb_noun conventions.
   - CLI: human curation (`brain list`, `brain forget`, `brain lock`, `brain stats`, `brain meditate --now`). Power user interface.
   - GUI: Not recommended unless "dream" (graph visualization) becomes a killer feature. Phase 10+, not MVP.

4. **Branding/positioning: Does the brain want its own identity?**
   - Answer: **YES, if infrastructure. NO, if Cairn-specific extension.**
   - Branding test: If the brain is meant for use by other tools (not just Cairn/Forge), it needs standalone identity (Synapse, Mneme, Cortex).
   - Current architecture: Cairn (observer) + Forge (executor) + Brain (cognition). Three pillars argue for three brands IF the brain is infrastructure.
   - Evidence from Aaron's dump: "user-memory tier follows the user," "cross-repo," "cwd-aware via hooks," "dynamically configures harness" — all suggest **upstream infrastructure**, not downstream feature.

**Recommendation: NEW REPO**

**Rationale:**
1. **Mental model boundary**: The brain is infrastructure (like Git, Redis), not a Cairn feature. Users install globally, configure per-repo, serves multiple tools.
2. **Installation story**: `npm install -g @akubly/brain`. Cairn/Forge detect via MCP discovery. Per-repo config via `.brain/config.yml`.
3. **Branding**: Needs distinct identity — "the memory layer for agentic systems," not "Cairn's memory." Naming candidates: Synapse, Mneme, Cortex, Engram.
4. **Development velocity**: Separate repo = separate release cadence. Brain can ship v2.0 without forcing Cairn/Forge to upgrade.
5. **Dependency direction**: Cairn/Forge depend on brain, not vice versa. Upstream shouldn't be bundled with downstream.
6. **User discoverability**: Infrastructure wants broad reach (npm search, GitHub trending). Separate repo maximizes visibility.
7. **Governance**: Separate repo clarifies contribution boundaries, attracts contributors building other agent frameworks.

**Phased Approach:**
- Prototype in Cairn/Forge monorepo under `experiments/brain/` or `packages/brain/` to validate concept.
- Extract to new repo once brain has: its own CLI, its own MCP server, its own test suite, branding decision made.
- **Threshold: "Does the brain have its own release cadence and changelog?" If yes, separate repo.**

**UX Interfaces (Priority Order):**
1. Config files (source of truth, versionable, declarative)
2. MCP server (agent queries, LX-first)
3. CLI (human curation, power users)
4. IDE plugin (Phase N, only if usage warrants)
5. GUI (Phase 10+, only if visual graph exploration becomes killer feature)

**Key UX Principles Applied:**
- Mental model boundaries → repo boundaries (users think "install separately" → separate repo)
- Dependency direction → upstream separation (brain is upstream of Cairn/Forge)
- Discoverability → branding independence (infrastructure wants broad reach)
- Installation story → source of truth (global install argues for separate repo)

**Open Questions for Aaron:**
1. Is brain Cairn/Forge-exclusive or infrastructure for any agent?
2. What's MVP scope (2 weeks prototype vs 2 months with CLI+MCP)?
3. Who is primary user (agents via LX, or humans via UX)?
4. Does brain need visual interface (text queries vs graph visualization)?

**Artifacts:**
- `.squad/decisions/inbox/valanice-brain-ux.md` — full UX analysis and recommendation

## Consultation: Brain/Memory System Repo Placement (Round 2)

**Date:** 2026-05-22  
**Session:** Refined recommendation following Aaron's brain dump clarification  
**Artifact:** .squad/orchestration-log/2026-05-22T20-25-51-valanice-*.md  
**Merged into:** .squad/decisions.md as "Open Question: Brain/Memory/Learning System"

### Summary

Participated in Round 2 consulting on repo placement for new agentic brain/memory/learning system. Analyzed Aaron's five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) and refined position from Round 1.

**Outcome:** Recommendation documented in .squad/orchestration-log/2026-05-22T20-25-51-valanice-brain-refined.md. All deliberation merged to decisions.md for Aaron's consideration.

---

### 2026-05-23: Self-Fit Assessment — Is Valanice the Right Person for the Brain Project?

**Task:** Aaron asked — "Does this squad think they're the RIGHT squad for the brain/memory/thinking/learning project?" Valanice conducted honest self-assessment of expertise fit.

**Key Findings:**

1. **✅ Strong transfer (70% of the work):**
   - Mental model boundaries (repo placement, branding independence)
   - Config-file preference model (global defaults + per-repo overrides)
   - MCP tool UX/LX optimization (verb_noun naming, signal density, context budget)
   - Observability design (pull-based insights, max 1 proactive per session)
   - Engagement patterns and friction calibration
   - **Confidence: HIGH** — This is core UX/HCI work; proven track record

2. **❌ Critical gaps (30% of the work):**
   - **Cognitive science validation:** Activities (meditate, dream, pray, re-evaluate) are quasi-cognitive operations; need neuroscience grounding
   - **Ontology design:** The "kinds" taxonomy (Practical, Semantic, Syntactic, Linguistic, Symbolic, Philosophical) is philosophical/knowledge-representational, not UX
   - **Knowledge architecture:** Graph structure, traversal algorithms, semantic linking require information architecture expertise
   - **Learning primitives:** Recency gradient, trustworthiness decay, plasticity policies are machine learning / cognitive science, not interaction design
   - **Confidence: LOW** — Can design the UI to set these, but can't validate what they mean

3. **Would Valanice want in?** YES, but with a specialist.
   - The UX/LX challenges are interesting and novel
   - But don't ask me to defend what "meditation" means cognitively
   - Bring a cognitive scientist or information architect for foundational grounding

4. **Specialist needed:** Cognitive scientist OR information architect
   - Validate activities taxonomy (what are the distinct cognitive operations?)
   - Validate kinds ontology (are these the right knowledge categories?)
   - Design graph structure and traversal semantics
   - Ground learning primitives in cognitive science / machine learning

**Artifact:** `.squad/decisions/inbox/valanice-self-fit.md` — full confidence matrix, squad composition recommendation, and honest assessment of scope

**Recommendation:** Brain project is **70% interaction design (Valanice owns) + 30% cognitive science/IA (needs specialist)**. Proceed with prototype, but validate cognitive foundations BEFORE full design. Don't ask me to defend what "meditation" means — bring someone who can.

---

## Brain Project — Proposed Role (2026-05-22)

**Status:** Proposal pending Aaron approval

**Role:** UX Advisor (advisory) for Brain project

**Allocation:** 20% named advisor capacity

**Mandate:** Config surface design, observability UX, "is this usable?" gut checks

**Contribution Model:**
- Advisory capacity only; no blocking dependencies
- No ongoing commitment; focused review feedback
- Primary commitment: Cairn

**Scope:**
- User tier configuration surface (how does user ~/ brain work?)
- Activity observability (making meditation/recall visible)
- Mental models and learnability

**Notes:** Valanice positioned as 70% UX owner for Brain's interaction design layer; 30% (cognitive foundations) requires specialist. Recommendation: proceed with prototype, validate cognitive foundations BEFORE full design. Brain needs epistemology/learning systems specialists for the cognition layer.

---

## Eureka Project Kickoff (2026-05-22)

**Date:** 2026-05-22  
**Event:** Aaron approved project name + hired 3 specialists; primary focus shift to Eureka  
**New Colleagues:** Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)  
**Role:** UX/LX Lead for Eureka; 60% allocation (Cairn advisory: 40%)

### Context & Rationale

Aaron decided: Build Eureka in `packages/eureka/` (monorepo); hire domain specialists to fill cognitive science gaps.

Round 3 self-assessment outcome:
- Valanice identified: 70% UX/LX transfer (mental models, config surfaces, pull-based observability, signal density)
- Valanice identified: 30% cognitive science gap (can't defend what "meditation" means neurologically; can't validate kinds ontology; graph architecture outside UX domain)
- ✅ New hires fill the cognitive gap; Valanice owns UX surface design with specialist input

### Impact on Valanice

**Primary focus:** Eureka UX/LX design (60% allocation)
- Config file surfaces (`.brain/config.yml` — global defaults + per-repo overrides, analogous to `.gitconfig`)
- Activity observability (making meditation/recall/dream observable without overwhelming the user)
- MCP tool naming + command semantics (verb_noun patterns from Phase 5)
- Decision UI for Eureka ↔ Forge integration (how does a human review Eureka's suggestions?)
- Max-1-proactive insight design (Prescriber pattern transfer to Eureka)

**Secondary focus:** Cairn advisory (40% allocation)
- Continue UX/LX consultancy on Prescriber design
- Maintain LX Heuristics reference (10 principles) for cross-project consistency

**Cross-project responsibility:**
- UX principle alignment: Cairn's "context budget" principle applies to Eureka memory recall (don't overwhelm the agent with every stored memory)
- Signal density optimization: Which insights surface, which stay quiet
- Mental model boundaries: Eureka is "infrastructure like Git," not "feature of Forge"

**Key context:**
- Genesta (Cognitive Systems Lead) brings epistemology expertise to validate activities taxonomy
- Crispin (Knowledge Representation Specialist) brings ontology + graph architecture to inform config surfaces
- Edgar (Learning Systems Specialist) brings learning primitives expertise to ground trust/plasticity/recency policies
- Valanice's 70% UX transfer is maximized with their 30% cognitive science + 100% agentic reasoning expertise alongside

### Design Partnership

**Valanice owns:** How Eureka's knowledge surfaces to humans  
**Specialists own:** What Eureka's knowledge *means* cognitively  
**Interface:** Config files as the agreed-upon "source of truth" — Valanice designs UI to set policies; specialists define what those policies mean


