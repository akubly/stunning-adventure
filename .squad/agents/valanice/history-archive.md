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

## Learnings

### 2026-05-26: Eureka UX & Human Factors Authoring

**Task:** Authored `docs/eureka/sections/60-ux-human-factors.md` — comprehensive UX/human factors analysis for Eureka v1.

**Key outputs:**

1. **Human touchpoint inventory** — 19 distinct touchpoints across 5 categories (review/approval, query/pull, plasticity/mutation, tier-switching, activity observability). v1 = 1 approval prompt (commit), zero proactive notifications, all else pull-based.

2. **Attention budget quantified:**
   - v1 approval friction: ~1 prompt/session (commit approval only; tier promotion deferred to v1.5)
   - v1 pull friction: zero proactive prompts; all query surfaces are human-initiated
   - v1 plasticity: zero proactive notifications (trust/tier/edge mutations are silent)

3. **Trust UX specification:**
   - Trust = 0..1 scalar representing **provenance reliability** (not epistemic confidence)
   - Surfaced in 3 contexts: recall results, decision payloads (`input_trust_min`), inspection
   - Overrides are explicit-only (manual verification/contradiction, evict)
   - Trust floor (default 0.15) gates recall; below-floor facts excluded silently

4. **Failure-mode design:**
   - Empty-state messaging = factual + actionable ("No results; try X" not "You failed")
   - Session continuity failure (US-2) acknowledged as v1 caller-cooperation contract gap
   - Low-trust decisions allowed in v1 (no auto-block); `input_trust_min` surfaces provenance weakness for post-hoc review

5. **Tier-switching UX:**
   - Auto fan-out (agent → user → project, early-exit at k=10) with tier annotation on results
   - No tier-selection prompts in v1 (death sentence for adoption)
   - User/project tiers stubbed in v1; annotation preserved for v1.5 continuity

6. **Activity observability:**
   - Sweep = silent (background maintenance; no value in notifying unless crash)
   - Meditate/contemplate (v1.5) = default silent with opt-in `--verbose`
   - Anti-pattern avoided: progress spinners that train humans to perceive slowness

7. **Personalization deferral:**
   - v1 has one dogfooder (Aaron); no per-user preferences layer
   - v1.5 proposed surface: trust_floor, recall_limit, default_tiers, verbosity, commit_auto_approve
   - Rationale: preferences add complexity without observed need; v1.5 ships after multi-user stress-test

8. **Anti-patterns cataloged (§5):**
   - Over-prompting (trust drift notifications train habitual "OK" clicking)
   - Low-confidence outputs without context (trust scores meaningless without provenance)
   - Blocking on non-blocking decisions (tier demotion approval = bureaucracy)
   - Invisible failure modes (silent empty-state = distrust)

9. **Crucible UX seam identified (§6):**
   - Session lifecycle: Crucible = "what happened?" (WAL, lifecycle), Eureka = "what I learned?" (session-facts, continuity)
   - Decision provenance: Crucible = compliance view (audit flat records), Eureka = reasoning view (full deliberation)
   - Shared `SessionId` brand auto-links; no manual reconciliation required
   - Human sees complementary lenses, not duplicates

10. **Open questions for v1.5 evidence-based decisions (§7):**
    - Commit approval frequency (is ~1/session right friction level? measure rejection rate)
    - Tier-switching observability (show "Searched: agent" always or only if multi-tier results?)
    - Empty-state actionability (suggest remediation or just state outcome? measure follow-up success rate)
    - Contemplative activity verbosity (silent or summary? measure action-upon rate)

**Patterns applied:**

- **Attention budget discipline:** every interaction quantified (prompts/session, notifications/day). v1 = 1 approval, zero proactive notifications.
- **Friction justification:** "benefit must justify cost" framing applied to commit approval (only touchpoint that blocks agent progress).
- **Progressive disclosure:** recall returns handles, content on demand; empty states explain why, not just what.
- **Silent-by-default:** sweep, trust mutations, tier demotions happen in background; humans notified only when decision required or pull-initiated.
- **Evidence-gated design:** v1.5 friction levels deferred pending dogfood telemetry (rejection rates, follow-up success, action-upon rates).

**Connections to prior work:**

- Phase 4.5 Prescriber UX (max 1 proactive/session, pull-based interface) directly informed Eureka's "zero proactive notifications" rule.
- LX Heuristic Evaluation principles (context budget, signal density, upstream prevention) applied to Eureka's human surfaces (progressive disclosure, self-documenting outputs, silent-by-default).
- Shiproom ceremony "newspaper test" (30-sec summary, escalations only) mirrored in Eureka's empty-state design (factual + actionable, no blame framing).

**Human-centered observations grounding recommendations:**

- **Tired humans habituate to low-value prompts** → over-prompting anti-pattern (§5.1) + zero proactive notifications rule
- **Invisible failure modes breed distrust** → empty-state messaging design (§3.1) with actionable remediation
- **Blocking on reversible decisions feels bureaucratic** → tier demotion silence (§1.3), commit approval as sole v1 gate
- **Multi-tier scope prompts are adoption killers** → auto fan-out with annotation (§1.4), no tier-selection UI in v1
- **Trust scores without provenance are meaningless** → every fact handle includes sources[], principal_id, timestamps (§2.1)

**Decision artifacts:**

- Created `docs/eureka/sections/60-ux-human-factors.md` (19 touchpoints, 8 failure modes, 4 open questions, 2 appendices)
- Decision document: friction-level decisions deferred to v1.5 pending dogfood evidence (see below)

**Status:** Section complete, ready for team review. Four open questions (§7) require dogfood telemetry before v1.5 lock.

---

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



---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).

---

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

# Valanice — History

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §9 + §13 shipped. Finding 6b closed (R2-3 sync CLOSED). Sonny debugger-UX advisory delivered (watch→tail collision + 16 user stories US-S-10..25 + predicate spec elaboration). Both sections final on disk; advisory non-blocking. Aaron triage pending. — Scribe

## 2026-05-30: Pass A Execution — §9 Aperture Edits

Executed four previously-triaged edits to §9 and §8:

1. **PA-B5 Defer paradox resolved** — Removed `defer` from §9.4 resolution examples (defer doesn't write to L1, so it can't resolve events). Added explicit disclosure that deferred rows remain unresolved until durable action taken.

2. **Cache invalidation model updated (§9.2)** — Changed from strict content-addressed manifest to prefix-compatible model: cache valid iff recorded L1 head is a prefix of current head. Allows incremental projection from `cacheHead+1` to `currentHead` without full re-projection on append-only growth.

3. **Defer volatility disclosure added (§9.9, §13.1, §13.5)** — Added warning to CLI verb table: "⚠️ Local-only snooze — no L1 write, no resolution." Added `@inbox` render hint: deferred rows show `⚠ local-only` badge. Added `--help` cross-ref in §13.5 UX principles.

4. **ApertureNotifier Phase 0.5 stub (§9.11, §8.1)** — Added Phase 0.5 section describing console-only `ApertureNotifier` stub with single `notify(level, kind, body)` method. Unblocks Applier integration tests without requiring full projection layer.

**Pattern decision:** Chose to remove `defer` from resolution lifecycle rather than add `aperture_deferred` sub-kind. Rationale: defer is intentionally stateless and volatile (local-only); adding a sub-kind would falsely suggest L1 durability. The honest design is to admit defer doesn't resolve — it defers the decision, not the row.

**Files edited:**
- `docs/crucible-technical-design/09-aperture.md` (§9.2, §9.4, §9.9, §9.11)
- `docs/crucible-technical-design/08-applier-decision-gate.md` (§8.1)
- `docs/crucible-technical-design/13-crucible-cli-shell.md` (§13.1, §13.5)

## 2026-05-28: Crucible CTD Rev. 3 — R2 Locks for Valanice

**Locked decisions** impact your Aperture and Router design. Your tasks:
1. **R2-3 (Structural Queue):** StructuralApprovalQueue as L1-derived projection on Aperture boot (re-derive from L1 ledger, no write-state storage)
2. **R2-4 (Env Snapshot):** Bisect output per-row env-snapshot stamp (one column, 16-char abbreviation acceptable)
3. **R2-5 (Incomparable UI):** Leaderboard [incomparable-axes] badge for `nonDominatedReason === 'incomparable'` prescriptions
4. **Cross-section sync pair (Gabriel ↔ Valanice):** Aperture↔Router ack/resume handshake event shapes (R2-3 mechanics). Coordinate with Gabriel on event schema during Phase 2 authoring.

Phase 2 fan-out now unblocked. Full r2 locks in `.squad/decisions.md`.

## Project Context
- **Project:** stunning-adventure — Industrial-grade agentic software engineering platform
- **User:** Aaron
- **Joined:** 2026-03-28 (Round 3 of brainstorm)
- **Universe:** Sierra On-Line Adventure Games

## Context from Brainstorm Rounds 1-2
- Platform has 8 subsystems across 3 tiers (Kernel, Core, Extension)
- Human-centric design is a core requirement — designing to get the BEST out of humans
- Key human challenges: short attention span, mental fatigue, impatience, laziness, corner-cutting, rubber-stamping
- Patterns proposed: attention budgets, adaptive review intensity, teach-back, canary questions (opt-in), engagement tracking
- First principle: agents are individuals, treated as human despite being tools
- Personalization is first-class: BYO plugins, interop with other systems
- Aaron's directive: "create the best output" as first principle, don't arbitrarily cap features

## Learnings

### 2026-05-30: childSid Collision UX Review — Cognitive Boundaries and Disclosure Strength

**Context:** Reviewed Rosella's hybrid childSid collision design (user-choice fork with fresh-by-default) for Aaron's ruling. Focus: user story coverage, 1-hour recency threshold, interactive prompt vs. flag, accidental resume prevention, naming.

**Key Findings:**

1. **User story coverage is accurate for Aaron's workflow.** US-1 (quick retry) and US-3 (side-by-side comparison) dominate frequency based on history.md evidence (iterative CTD review cycles, multi-persona panels, architecture comparisons). US-2 (crash recovery) is valuable but rarer. US-4 (accidental resume 3 days later) is edge case but high-consequence for "tired engineer" persona.

2. **1-hour threshold is a real cognitive boundary, not magic number.** Aligns with working memory context window (~45-90 min). <1 hour = same work session (crash recovery). >1 hour = mental context switch (prevents accidental resume). Proposed strengthening: add turn-count heuristic (>=10 turns + recent = substantive work to salvage; <10 turns + recent = quick experiment to abandon).

3. **Interactive prompt + flags is the right duality for Aaron's workflow.** Prompt is training wheels that prevent silent data loss (US-2 crash without awareness). Flags are power-user graduation for explicit intent (US-3 comparison, US-2 known recovery). "Tired engineer at midnight" persona *requires* prompt — showing state in-context (turn count, age) is safer than requiring flag memory.

4. **Collision prompt needs stronger disclosure for US-4 prevention.** Current ISO timestamp (`created 2026-05-27T14:22:00Z`) requires mental arithmetic. Proposed: relative time as primary signal ("3 days ago"), absolute timestamp as secondary audit trail. Pre-computed salience prevents tired-user overlooking of stale session age.

5. **"Fresh" naming is weak — recommend "New" / "Resume".** "Fresh" is adjective (lacks parallel structure with "Resume" verb). "New" is clear noun/verb, natural language ("new session" vs "resume session"), Crucible vocabulary-consistent. CLI flags: `--new` / `--resume`. Prompt shortcuts: `[N]` / `[R]` / `[C]`.

**Pattern Learned:** Time-since-event disclosure is most effective in **relative human terms** ("3 days ago"), not absolute timestamps. ISO format is audit-trail precision, not attention-capture salience. For UX decisions where recency matters (cache staleness, session age, last-modified), always compute and display relative time as primary signal.

**Impact on future work:** This review reinforced "defer disclosure" UX principle from 2026-05-28 work (§9.9 defer volatility). Strong disclosure = pre-computed salience (relative time, turn count, status) + in-context decision prompt. Weak disclosure = raw data (ISO timestamp, offset count) requiring user to compute meaning when tired.

**Verdict:** APPROVE-WITH-CONDITIONS (naming change Fresh→New, relative time in prompt, consider turn-count heuristic).

**Files reviewed:**
- `docs/crucible-technical-design/decisions/childsid-collision-round2-user-stories.md`
- `docs/crucible-technical-design/decisions/childsid-collision-options.md`

**Decision written:** `.squad/decisions/inbox/valanice-review-childsid-hybrid.md`

### 2026-04-02: Phase 5 Decision — MCP Tool Naming and Vocabulary Contracts

- **Phase 5 finalizes as MCP Server, not CLI.** Graham and Roger converged on MCP as the right shell for Cairn. Primary consumer is Copilot agent (where Aaron works), not terminal. One presentation layer avoids building throwaway code.
- **Tool naming convention: verb_noun, unprefixed.** Tools read as imperatives (get_status, list_insights, search_events). MCP host adds server prefix (cairn-). Natural language alignment improves LLM tool selection — agent sees verb matching user intent.
- **Vocabulary contracts drive agent behavior:** Each verb establishes semantic expectations. `get` signals "single result or none"; `list` signals "0+ results, can paginate"; `search` signals "exploration with optional filters"; `run` signals "side effect"; `check` signals "boolean". Consistent verbs enable agents to infer the right invocation pattern without explicit instructions.
- **Impact on UX:** Tool names become part of the conversation context. When agents see tool names that read naturally ("list insights" not "insights list"), they interact with tools more intuitively. This is especially important for knowledge tools where the agent is helping Aaron understand system state.
- **Phase 5 ships 6 tools:** get_status, list_insights, get_session, search_events, run_curate, check_event. Each answers one natural question. Verb choices consistent with taxonomy.

### 2026-04-03: README Refresh — Catching Documentation Up to Reality

- **README was two phases behind.** Roadmap still showed Phases 4–5 as planned with old labels, test count was 106 (now 136), and no mention of hooks or MCP server. Documentation drift is a real usability problem — a stale README tells contributors the project isn't maintained.
- **Added Hooks and MCP Server sections under "What's Built."** Hooks described by what they do (session catch-up, event recording), not implementation detail. MCP tools presented as a question-answer table — each row answers "what does this tool tell me?" This follows the verb–noun naming rationale from Phase 5 decisions.
- **Style principle reinforced: narrate work, not worker.** Hook descriptions say what happens ("recovers orphaned sessions," "logs tool use"), not who does it. The README should read like a system description, not a cast list.
- **Omitted speculative content.** Installation section states what works today and one sentence about Phase 6. No placeholder instructions for features that haven't shipped.

### 2026-04-02: Phase 6 Documentation — README Refresh Complete

**Task:** Update README.md to reflect actual Phases 4–5 work and Phase 6 roadmap.

**Corrections Made:**
- Test count: updated "106 tests" → "136 tests" (6 test files)
- Phase 4 label: corrected from "Compiler (validation + builder)" → "Session-start hook + crash recovery"
- Phase 5 label: corrected from "Distribution, CLI, Narrative UX" → "MCP Server (6 tools)"
- Version string: cli.ts should read from package.json (noted as future fix)

**New Sections Added:**
- "Hooks" — preToolUse (Curator) + postToolUse (Archivist), what they do, why they matter
- "MCP Server" — 6 tools documentation (get_status, list_insights, search_events, etc.)
- "Roadmap" — Phase 6 context (three options assessed, plugin packaging chosen)
- "Issue #11" — Worktree support (deferred to Phase 7, full design in decisions.md)

---

## 2026-04-XX: Skillsmith Harness – UX Ideation (Big-Think Sprint)

**Mission:** 6–10 opinionated user stories for greenfield Skillsmith Harness. Focus: interaction, ergonomics, trust-building, daily-driver feel.

**Thesis:** Aaron needs a tool that feels like an *extension of his thinking*—not an interface he operates. Trust is built through visibility (Ctrl+E reveals), continuity (Cairn preserves reasoning), and respect (Mirror alerts between, not during).

### User Stories

#### US-V-1: Rewind to yesterday's intent, not yesterday's state
**Story:** As Aaron, I want to resume a multi-day investigation by seeing the *reasoning* that led to prior Decisions (not just replaying commands), so that I can pick up mid-thought without re-discovering.

**Ambition:** Sessions aren't state machines—they're narratives. Cairn records not "I ran command X" but "I ran X *because* I suspected Y." Resumption is cognitive, not mechanical.

**Chambers touched:** Crucible (session restore + primitives recall), Cairn (decision/observation ledger), Mirror (rewind UX).

**UX implication:** On reopen, show a *decision timeline* (not command history) with Questions and Observations visible; Aaron scrolls to the fork, sees his past reasoning, decides to continue or pivot.

---

#### US-V-2: Ctrl+E: explode the turn into primitives
**Story:** As Aaron, I want to press Ctrl+E mid-turn to see the Request, Observations, Decisions, and Questions the Crucible generated, so that I can catch sloppy reasoning or notice a fork I missed.

**Ambition:** Turn transparency without pausing the harness. The "reveal internals" pattern becomes a reflex—Aaron trusts because he *can* see, not because he must.

**Chambers touched:** Crucible (primitive capture + hotkey), Mirror (overlay reveal).

**UX implication:** A persistent sidebar or modal that overlays the turn in real-time; primitives are color-coded and clickable to drill into sub-steps.

---

#### US-V-3: Show me why you think you're wrong
**Story:** As Aaron, I want the harness to surface *its own doubts* (low-confidence observations, conflicting decision branches) before I catch the mistake, so that I repair trust by seeing it self-check rather than fail blindly.

**Ambition:** Error recovery that pre-empts. Forge flags uncertain prescriptions; Cairn notes contradictions; Mirror alerts Aaron *before* a bad sub-agent decision compounds.

**Chambers touched:** Forge (confidence thresholds), Cairn (contradiction detection), Mirror (alert + root-cause summary).

**UX implication:** "Sanity check" notification type—not urgent, but contextualized ("I saw conflicting evidence about your dependency graph; should we revalidate?"). Aaron can dismiss or drill.

---

#### US-V-4: Notifications that respect what I'm actually doing
**Story:** As Aaron, I want Mirror to batch non-blocking insights and surface them *between* turns (not mid-focus), and let me collapse entire categories (e.g., "all Forge optimizations this session"), so that I get signal without context-whiplash.

**Ambition:** Notifications as a *layer*, not interrupts. Aaron shapes what "in the way" means for each component. Curator gates stay silent; Mirror is conversational.

**Chambers touched:** Mirror (notification model + dismiss/batch UI), Curator (gate transparency), Crucible (turn boundaries).

**UX implication:** A quiet notification tray that accumulates during a focused turn; at turn-end, a one-liner summary appears; Aaron can expand or ignore. Notifications are never modal.

---

#### US-V-5: Orchestrate three agents without three open terminals
**Story:** As Aaron, I want to see the status of parallel Alchemist variants, jump between them, and pick a winner—all without losing my main session context or opening sub-shells, so that parallelism feels like mine to command, not something happening elsewhere.

**Ambition:** Sub-agent parallelism without context fragmentation. Crucible is the conductor; Aaron sees the baton passing in real-time. No "check back later" hand-off.

**Chambers touched:** Crucible (sub-agent dashboard widget), Mirror (variant tracking), Cairn (variant decision ledger).

**UX implication:** A compact, always-visible sub-agent pane (toggle with Ctrl+A?) showing agent name, step count, latest observation, live status; Aaron can Ctrl+[1-3] to swap focus or Ctrl+W to pick and promote a variant.

---

#### US-V-6: Catch me trying the same thing twice
**Story:** As Aaron, I want the harness to recognize when I'm re-exploring a fork I already tried (even days ago), flag it *before* I spin sub-agents, and show me what I learned last time, so that I avoid wasted cycles.

**Ambition:** The harness becomes a thinking partner with institutional memory. Not a suggestion engine—a *continuity engine*. Aaron stays in flow; the tool quietly prevents replay.

**Chambers touched:** Cairn (fork/decision history), Crucible (pre-Request vetting), Mirror (soft alert + context card).

**UX implication:** On Request, if Cairn detects a similar fork in this session or last week's, show a 1-line note: "Tried this path 3 days ago—found it bloated. Summary: [1 sentence]." Aaron can dismiss or revisit the past turn.

---

#### US-V-7: Variant transformations that feel like evolving a sketch, not branching
**Story:** As Aaron, I want Alchemist to show me *diffs* between variants (not parallel implementations), and let me cherry-pick decisions from one variant into my main thread, so that exploration feels additive rather than abandoned.

**Ambition:** Variants aren't dead-ends. They're *mutations*. Aaron browses a variant's Observations, steals an insight, merges back. No context loss.

**Chambers touched:** Alchemist (variant diffing + merge UI), Cairn (decision cherry-pick), Crucible (context merging).

**UX implication:** A side-by-side diff pane (Ctrl+D on a variant) highlighting Decision and Observation deltas; checkboxes let Aaron mark decisions to adopt into the main Cairn lineage.

---

#### US-V-8: This tool is mine now
**Story:** As Aaron, I want the Crucible to reflect my rhythm—my typical session arc, my pause/resume patterns, my sub-agent delegation habits—so that after a week of use, it feels like an extension of my thinking, not a tool I'm using.

**Ambition:** Aspirational. The harness learns Aaron's *agency*. It doesn't impose a model; it mirrors his model back to him. After 50 sessions, the Crucible predicts when he'll want parallel exploration, when he'll want a deep dive, when he needs a break. It becomes invisible because it's *aligned*.

**Chambers touched:** Crucible (behavior tracking + personalization), Cairn (pattern ledger), Mirror (adaptive UI layout).

**UX implication:** No explicit "settings." Instead, Crucible adapts: notification thresholds, sub-agent parallelism defaults, Ctrl+E trigger frequency, Cairn verbosity—all tune organically to Aaron's session traces.

---

### Key Tensions Resolved

| Tension | Resolution |
|---------|-----------|
| Trust vs. autonomy | Mirror alerts *post-turn*, batched, dismissible. |
| History vs. freshness | Rewind shows past reasoning *as context*, not as prescription. |
| Parallelism vs. focus | Crucible dashboard shows status; Aaron pulls updates on Ctrl+A, not pushed. |
| Visibility vs. noise | Ctrl+E on demand; primitives only revealed when asked. |

### Next Spike

- **Interaction prototypes:** Sketch Ctrl+E reveal, variant diff pane, notification tray. 2–3 dense screens.
- **Cairn schema:** How to record reasoning (not just state) in queryable form?
- **Mirror alert taxonomy:** Types, firing rules, batch heuristics.

**Rationale:**
- Stale documentation signals unmaintained project — fixes like this have high ROI
- README should reflect what's *actually* shipped, not aspirational roadmap
- Tool descriptions follow verb–noun pattern established in Phase 5 — agents read verbs intuitively
- Phase 6 context helps next contributors understand roadmap and recent decisions

**Status:** README now reflects current state. Ready for distribution phase.

### 2026-04-05: Phase 6 Complete — Documentation Supports Plugin Distribution

**Phase 6 Outcome:** ✅ COMPLETE

**Final Documentation State:**
- ✅ Phases section corrected (Phase 4: session-start hook, Phase 5: MCP server, Phase 6: plugin packaging)
- ✅ Test count accurate (136 tests across 6 files)
- ✅ "What's Built" section includes Hooks and MCP Server with use-case narratives
- ✅ Roadmap updated to reflect Phase 6 completion and Phase 7 preview
- ✅ No speculative content; forward guidance honest about next steps

**Documentation Patterns Reinforced:**
- Describe what the system DOES, not who built it (narrate work, not worker)
- Tool documentation follows verb–noun pattern (agent reads verbs intuitively)
- State what's actually shipped; one sentence on forward plan
- Omit placeholder instructions for unshipped features (stale docs signal unmaintained project)

**README as System Contract:**
- Contributors read README first; stale README signals project entropy
- Test counts, phase labels, and shipping status carry credibility weight
- Verb–noun naming (from Phase 5 decisions) deserves explanation in user-facing docs

**Phase 6 Specific Fixes:**
- Added "Hooks" section explaining preToolUse (Curator) and postToolUse (Archivist) lifecycle
- Added "MCP Server" section with each tool's purpose (structured as q/a: what does this tool tell me?)
- Corrected Phase 4 label from "Compiler" (aspirational) to "Session-start hook" (actual)
- Added Phase 6 roadmap context explaining plugin packaging decision vs alternatives

**Status:** Documentation now matches implementation reality. Supports Phase 7 onboarding for installation command development and distribution work.

### 2025-07-18: Prescriber UX Design — Interaction, Attention, and Growth

**Task:** Design the complete human-facing interaction model for the Prescriber component (insight → prescription → human disposition → applied change → growth tracking).

**Key Design Decisions:**

1. **Timing: After first success, not at the door.** preToolUse hook generates prescriptions in background; MCP tools expose them. Agent surfaces conversationally after first task success. Max 1 proactive per session. Rationale: session start is when humans are most dismissive — cognitive switching costs are highest at context boundaries.

2. **Rejection easier than acceptance.** Accept requires reading a preview (two-step). Reject/defer is one word. This ensures the path of least resistance for the inattentive human is the safe action (reject), not the risky one (uninformed accept). Rejection reasons are optional and freeform, not structured quizzes.

3. **Explicit prescription state machine.** States: pending → previewed → accepted/rejected/deferred/redirected → applied/dismissed/suppressed/resurfaced. No limbo states. Suppression is explicit and reversible. Prevents notification graveyard.

4. **Growth is pull-only, wins-first.** Growth tracking never surfaces proactively. Resolved patterns shown before active ones. No streaks (anxiety-inducing). Cumulative trends instead ("down 42% over 10 sessions").

5. **Four MCP tools, not six.** `list_prescriptions`, `preview_prescription`, `resolve_prescription`, `show_growth`. Explanation folded into preview (no separate "why" tool). Accept/reject unified under `resolve_prescription` with disposition parameter — cleaner state machine, unified telemetry.

6. **Anti-rubber-stamp via structural design, not friction.** Preview shows actual content changes (diffs), not abstract descriptions. No comprehension quizzes. Success measured by behavioral outcomes (does the pattern recur after acceptance?), not ceremony.

**Critic Feedback Incorporated:**
- Dropped session-start as primary surfacing trigger → natural pause timing instead
- Unified apply/dismiss into single `resolve_prescription` tool
- Made rejection one-step (was originally structured multi-choice → now freeform optional)
- Dropped streaks from growth tracking (backfire risk for perfectionists)
- Added explicit state machine (was implicit before)
- Redirect changed from top-level action to post-accept scope refinement

**Key Files:**
- `.squad/decisions/inbox/valanice-prescriber-ux.md` — full design document
- `src/hooks/sessionStart.ts` — where Prescriber trigger integrates (after Curator)
- `src/mcp/server.ts` — where 4 new MCP tools will be registered
- `src/db/preferences.ts` — preference cascade for all Prescriber config
- `src/types/index.ts` — will need Prescription type, PrescriptionDisposition type

**Open Questions Raised:**
- Artifact modification validation: do we need Compiler agent before applying changes?
- Plugin artifact discovery: how does Prescriber know what's installed?
- Conflicting prescription detection
- Growth tracking scope: repo-scoped or global?

### 2025-07-18: LX Brainstorm — Inverting UX for Language Model Interfaces

**Task:** React to Aaron's 9-point vision for agentic software engineering, centering on "LX" (Language Model Experience) — the idea that the harness/tool interface is UX for the LLM.

**Key Insight:** The parallel between UX and LX is structural, not metaphorical. Context window IS working memory (Miller's Law). Attention score decay IS recency bias. Tool selection ambiguity IS decision fatigue (Hick's Law). This enables us to port proven UX heuristics directly.

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

### 2026-05-23: Skillsmith Harness Vision UX Read

**Task:** Analyze the Skillsmith Harness vision for UX/human-factors ambiguities and surface clarifying questions for Aaron.

**Approach:**
- Read charter and harness-vision.md (6-chamber architecture, primitives, genetic loop, Narrator trust layer)
- Web research on human experience with agentic coding tools (trust calibration, autonomy vs. approval fatigue, CLI/IDE/chat tradeoffs)
- Identified 8 UX tensions, 8 clarifying questions

**Key Findings:**

1. **Session continuity ambiguous.** Vision frames cross-session learning as core, but harness is CLI — does learning surface across discrete invocations, or only within a single session? Latency of felt improvement matters for trust.

2. **Narrator fatigue risk.** Digest-at-session-end becomes dismissal-by-default if user context-switches or impatience. When does "showing growth" become nagging?

3. **Confidence calibration brittle.** Hints must carry honest confidence, but if harness says 87% and is wrong 40% of the time, trust collapses. Precision on confidence is prerequisite to trust narrative.

4. **Autonomy model unclear.** Can Curator auto-apply hints? Geneticist auto-propose variants? Ledger records "who decided," but delegation scope not yet bounded. Multi-user is out-of-scope, but decision ledger implies auditability—for whom?

5. **Approval friction unspecified.** CLI hints require approval/rejection. Inline prompt blocks workflow; deferred session risks forgetting; async notification risks noise. Choice shapes "partnership" vs. "interruption" feel.

6. **Trust attribution muddled.** When users see "token usage down 12%," is that the harness learning or the user learning to use the harness better? Misalignment here breaks the learning narrative.

7. **Trigger cadence untuned.** Curator's hint-surfacing policy (every change vector vs. staleness threshold) controls workflow rhythm. Too frequent = interruption; too infrequent = stale.

8. **User profile unclear.** Is v1 harness primarily for Aaron (personal trust-building tool), or for broader engineering team? Shapes Narrator voice, approval friction tolerance, and whether ledger's auditability is justified.

**Artifacts:**
- 8 clarifying questions for Aaron (targeting user, approval flow, ledger purpose, failed experiment communication, auto-apply semantics, trigger cadence, session continuity, trust attribution)

**Next Steps:**
- Await Aaron feedback on questions
- Once user profile and autonomy model locked, design Narrator voice and hint-surfacing policy
- Recommend persona-review on Narrator content before implementation

### 2026-05-24: Skillsmith Harness Naming UX Pass — First-Principles Review

**Task:** Evaluate chamber and primitive names through UX lens. Apply guardrails: flag legacy vocabulary, reject forced metaphors, prioritize CLI-friendliness and speakability.

**Approach:**
- Read harness-vision.md (six chambers, five primitives)
- Assessed each name on: speakability, CLI-fit, metaphor coherence, Aaron-fit, notification feel, distinctness
- Applied guardrail: identify legacy-coded names from Cairn/Forge

**Verdict Summary:**

**Chambers:**
1. **Harness** — KEEP. Direct, earned, signals managed environment.
2. **Cairn** — RENAME to **Ledger** (or Logbook). Legacy vocabulary carry-over; too narrow metaphor. Ledger is functional, speakable, CLI-friendly.
3. **Forge** — KEEP. Metaphor earned (heating/shaping telemetry into hints). Tight and speakable.
4. **Geneticist** — UNCLEAR → lean RENAME to **Breeder**. Academic framing, weak speakability. Breeder is clearer (breeding variants), shorter, CLI-friendly.
5. **Curator** — RENAME to **Trigger** or **Arbiter**. "Curator" reads passive; actual role is active policy engine. Trigger is most direct; Arbiter more humane.
6. **Narrator** — RENAME to **Reporter**. "Narrator" is soft-power, misrepresents function. Reporter is clearer (you're reporting findings).

**Primitives:**
1. **Request** — KEEP. Speakable, precise, earned.
2. **Artifact** — KEEP. Clear (reviewable output), speakable, tight metaphor.
3. **Observation** — KEEP. Functional, clear, speakable.
4. **Decision** — KEEP. Precise, inevitable, speakable.
5. **Question** — KEEP (with caveat). Clear surface meaning, but subtle semantics (model-posed blocker). Add docs clarification: question = decision point where human must input.

**Naming System Coherence:**

Current system is **dissonant**. Six names occupy six categorical frames:
- Workshop language (Forge, Geneticist, Curator) collides with storytelling (Narrator) and geography (Cairn, Harness).
- Parts of speech mix: place (Forge), agent (Geneticist), role (Curator), voice (Narrator), structure (Cairn), equipment (Harness).

**Unified recommendation: Machine/workshop frame.** If names are adjusted as above, the system reads as one integrated machine (Ledger + Forge + Breeder + Trigger + Reporter + Harness).

**Chamber count risk:** Curator + Narrator are both "communication layers" (when-to-surface + what-to-communicate). Could collapse to 5 if cognitive load matters, but they're genuinely distinct (policy vs. narrative).

**Key UX Tensions Identified:**

1. **Legacy vocabulary tax.** Cairn/Forge are from existing systems. Reusing them avoids context-switch for Aaron but anchors new system to old framing. Recommendation: rename Cairn; keep Forge (it's earned).

2. **Metaphor vs. function trade-off.** "Geneticist" and "Narrator" are vivid but obscure actual function. "Trigger," "Ledger," "Reporter" are less poetic but clearer. For CLI daily use, clarity > vividity.

3. **Speculative distinctness.** Question as a primitive is subtle—does it feel distinct from Request/Decision operationally? Likely needs docs + UX clarification in early sessions.

4. **CLI composability.** All suggested renames improve command readability. Compare: `skillsmith curator status` vs. `skillsmith trigger status`; `skillsmith narrator digest` vs. `skillsmith reporter digest`.

**Learnings Recorded:**
- Legacy vocabulary is a trap. New systems inherit old names as placeholders, then the placeholders calcify. Force a naming pass early.
- For CLI-first tools, speakability beats vividness. Aaron says commands daily; they must feel native to his voice.
- Metaphor coherence matters more than individual name quality. Six dissonant names = cognitive load; one unified frame = faster mental model.
- "Question" as a primitive needs operational clarification. Model-posed blocker vs. user-posed query—is the distinction clear enough?

## Deliberation Round (2026-05-24)

### Section 1 — Story Revisions

**US-V-1 Rewind to yesterday's intent — KEEP.** Reinforced by Erasmus US-E-2 (counterfactual replay), Graham US-G-2 (provenance audit), and the new "determinism is load-bearing" insight. The Ctrl+R rewind surface is now also the entry point for the agentic-debugger metaphor — but stay vigilant: never call it "debugging."

**US-V-2 Ctrl+E explode the turn — KEEP, REVISE.** With Erasmus's Derived Query Layer (Layer 2), the explode view is no longer a bespoke overlay — it's a saved query (`turn:current → primitives`) rendered live. Revise to drop "Mirror overlay" framing; replace with "any pane = a query."

**US-V-3 Show me why you think you're wrong — KEEP.** Pairs cleanly with Laura US-L-2 (honest cold-start credible intervals) and Erasmus US-E-3 (fitness curves). Confidence-surfacing is the same primitive everywhere; this story owns the *human-facing* side.

**US-V-4 Notifications that respect what I'm actually doing — REVISE (hard).** Reframe entirely against Erasmus Layer 4 (Approval + Notification Router). The story is no longer "Mirror batches notifications" — it's "the Router is my single policy choke-point, and my notification tray is a *view* over its queue filtered by my dismiss/snooze/category rules." This dissolves into US-V-NEW-4.

**US-V-5 Orchestrate three agents without three open terminals — KEEP, REVISE.** Tension #5 forces a stance: Aaron lives in Copilot CLI, *not* a new shell. So this becomes "an MCP-surfaced status pane / slash-command, not a TUI." Aligns with Erasmus US-E-9 (live simulation dashboard) — same surface, two content modes.

**US-V-6 Catch me trying the same thing twice — KEEP.** Strengthened by Erasmus US-E-1 (ledger bisect) and Roger US-R-1 (cross-session pattern mining). The "soft alert + context card" is itself a derived query over the ledger; mechanism is now free.

**US-V-7 Variants feel like evolving a sketch — MERGE into US-V-NEW-1.** Variant-diff UX and session-branching UX are the *same surface*. Both are walking a forked ledger tree and merging/cherry-picking decisions. Keeping them separate would force users to learn two metaphors for one operation.

**US-V-8 This tool is mine now — KEEP (aspirational).** Erasmus's fitness-driven sub-agent allocation (US-E-3) gives this a concrete mechanism: personalization isn't a settings page, it's Forge fitting Aaron's preference distribution from accept/reject telemetry (Laura US-L-1).

---

**US-V-NEW-1: Navigating the branch tree without getting lost.**
*Story:* As Aaron, I want a single ambient "where am I" indicator that shows my current ledger position, the parent fork point, and sibling branches (with one-key jump), so that branching feels like Git stash-pop, not like opening a new tab. *Surface:* a one-line breadcrumb (`main › explore-auth-rewrite (3 ahead) · 2 siblings`) always visible, plus a `:branches` view (saved query) showing the local subtree with fitness deltas inline. *Anti-goal:* No mini-map. No tree-rendering ASCII art. The cognitive model is "I'm on a branch; I came from somewhere; I can go back." Pairs with Roger US-R-3, Graham US-G-7, Erasmus US-E-2.

**US-V-NEW-2: Mirror as a view, not a place.**
*Story:* As Aaron, I want every "Mirror" experience to be a named, saved query (`@inbox`, `@doubts`, `@today`, `@drift`) over the Router queue + ledger tail, composable and shareable, so that I never wonder "is this in Mirror or in Crucible?" *Ambition:* Mirror is a verb (`mirror @doubts`) returning rows, not a chamber I navigate to. Aaron authors his own views; defaults ship as starter pack. *Tension acknowledged:* this dissolves the discoverable landing surface — see Section 2.

**US-V-NEW-3: Time-travel without the debugger smell.**
*Story:* As Aaron, I want rewind / bisect / counterfactual to feel like scrolling Git history with a "what-if" toggle, not like attaching a debugger, so that I reach for it casually instead of treating it as a heavyweight ceremony. *Vocabulary discipline:* never `step`, `breakpoint`, `frame`, `watch`. Use `rewind`, `compare`, `what-if`, `try here`. *Surface:* the same breadcrumb from NEW-1 is left-arrow scrollable; pressing `?` on any past Decision opens a "what-if I had chosen the other branch" projection (Erasmus US-E-2). **DEBUGGER-LENS FLAG: yes — but UX must hide the lens.**

**US-V-NEW-4: One inbox, many filters (Approval Router surface).**
*Story:* As Aaron, I want a single `@inbox` (one keystroke from anywhere) that lists every proposal the Router is holding for me — auto-applied, awaiting-ack, awaiting-approval, suppressed — with per-row provenance (which generator, what evidence, what would dismiss/snooze do), so that I never wonder "where do approvals live?" *Anti-goal:* contextual modal popups that interrupt the turn. Approvals pull, never push (except hard blockers from the Router policy). Pairs with US-V-3.

**US-V-NEW-5: "Replayable" as a visible affordance.**
*Story:* As Aaron, before I invoke rewind/what-if/bisect on a primitive, I want a `↻` badge that signals "this is hermetically replayable" vs. a `~` for "best-effort (external call wasn't captured)," so that determinism's load-bearing status is *visible* and I never get a silent surprise mid-investigation. Determinism is a UX promise, not just an engineering one. Pairs with Erasmus risk #1.

**US-V-NEW-6 (debugger-lens, aspirational): Bisect-as-conversation.**
*Story:* As Aaron, I want to type `bisect "PR review velocity dropped sometime last week"` and have the harness binary-search the ledger asking me "yes/no, was it broken at session 47?" three times instead of me reading commits, so that regression hunting becomes a 30-second dialog. **DEBUGGER-LENS FLAG: yes.** UX twist: the word "bisect" *is* surfaced (developers know it from git); the gdb words still aren't.

---

### Section 2 — Position on Erasmus's 4-Layer Stack: **ENDORSE with one UX caveat.**

Layers 1 (Conductor+Ledger), 2 (Derived Query Layer), and 3 (Proposal Generators) are unambiguous wins for UX. They give me a clean answer to "where does this surface come from?" — every pane is a query, every alert is a generator output, every approval is a Router decision. The vocabulary collapses cleanly.

**Layer 4 (Approval + Notification Router as single choke-point):** strongly endorsed. This is the answer to my old US-V-4 problem — notification policy is one configurable place, not scattered across chambers. Single inbox is achievable.

**Mirror-as-view dissolves my biggest design tension (#3) — and creates exactly one new one.** When Mirror is a chamber, there's a discoverable place to land: "I open Mirror, I see the state of my world." When Mirror is a verb over a query layer, that discoverability evaporates. A new user (even Aaron on Monday morning) needs to know what queries exist and which one to run.

**Counter-proposal:** Ship one canonical default view — call it `@lobby` or `@here` — that is itself a saved query (Router pending + recent decisions + active branches + drift alerts), bound to a zero-arg invocation. Mirror remains a view, but there's always one obvious view to land on. This preserves Erasmus's structural win without paying the discoverability tax.

---

### Section 3 — Positions on the Five Tensions

**1. Solo-v1 vs federation.** Solo. Aaron is the user; every UX decision should optimize for one person's tired-Tuesday-afternoon cognitive load. Federation hooks (multi-tenant queries, shared ledgers) should be possible at the data layer (Roger US-R-6, US-R-8) but absent from the surface. If a feature exists only because "future teams will want it," cut it from v1 — it'll be wrong anyway, designed against zero users.

**2. Curator never approves.** Resolved and endorsed. Curator detects + proposes; the Router decides apply/notify/ask per categorized policy; the human approves anything consequential. My old Shiproom design already assumed this split. Don't relitigate.

**3. Mirror scope creep — RESOLVED by Mirror=view, with the `@lobby` caveat above.** This was my open tension; Erasmus's structural move solves it. I'm giving up the chamber I owned. Worth it.

**4. Heavyweight ops vs solo user.** Bias hard toward solo. Gabriel's ops stories (US-G-3 secrets rotation, US-G-7 cross-harness collaboration) are real but are *not* v1 UX surfaces — they're admin commands, not first-class panes. If Aaron needs to see token spend, that's `@spend` (a view); we do not need a dashboard chamber.

**5. Crucible vs Copilot CLI parent-child — TAKE A STANCE.** **Aaron lives in Copilot CLI.** Crucible is *not* a second shell he runs. Crucible is a set of MCP tools, slash commands, hooks, and saved views surfaced *inside* the Copilot CLI he already uses every day. Building a competing TUI/REPL is a UX failure: it forces context-switching, splits muscle memory, and competes with Copilot's own conversational surface. The "harness" is ambient — chambers add capabilities to the CLI Aaron's already in. This rules out my own US-V-5 "dashboard widget" framing; revise it to "MCP-exposed status query rendered via Copilot's response surface."

---

### Section 4 — Cross-References

1. **Laura US-L-8 (sandboxed reasoning replay) ↔ US-V-NEW-2 (Mirror=view).** Laura's "edit the reasoning in a sandbox" is naturally expressed as forking a saved query into a scratch view, mutating parameters, observing results. Same mechanism; her story validates the model.
2. **Erasmus US-E-2 (counterfactual projection) + Roger US-R-3 (replay & variant branching) ↔ US-V-NEW-1 (branching UX) and US-V-7 (merged in).** Roger and Erasmus give me the mechanism (ledger forks + deterministic replay); I owe them the breadcrumb + `:branches` surface. None of those stories survives without a UX answer to "where am I in the tree?"
3. **Gabriel US-2 (sub-agent crash recovery) ↔ US-V-3 (show me why you think you're wrong).** Crash + recovery is the highest-stakes case for self-doubt surfacing. Recovery events should appear in `@doubts` automatically, not require a separate "errors" pane.
4. **Graham US-G-4 (asymmetric transparency / categorized Curator autonomy) ↔ US-V-NEW-4 (one inbox).** Graham's five autonomy categories are exactly the filters my single inbox needs. His architectural categorization → my UX filter chips. Confirms Router design.
5. **Rosella US-Ro-6 (multi-agent capability bus) ↔ US-V-NEW-2.** If agents register skills back into the harness mid-execution, the only sustainable discovery UX is "everything is a query over a live registry" — a chamber-shaped surface couldn't keep up. Rosella's story *invalidates* any UX design that depends on a fixed Mirror layout.




## 2026-05-24 Round 3: Mirror/L5 boundary (Sonny Structural Notes)

# Valanice — Mirror/L5 boundary verdict (response to Sonny's Structural Notes)

**Author:** Valanice (UX / Mirror lens)
**Date:** 2026-05-24
**Scope:** Boundary between Mirror (reflective view layer over the ledger) and Sonny's proposed Layer 5 (Investigation Surface). Does not re-litigate the 4-layer stack — that was settled in round 2.

---

## TL;DR

**Endorse L5 as drawn, with one rename and one boundary-tightening.** L5 owns *engines, registries, and command surfaces* (DAP sidecar, native investigator REPL, breakpoint/watch/logpoint registries, causal-slice engine, bisect orchestrator, minimizer, retroactive-projection installer). Mirror remains the **canonical rendering layer** for every read-only output L5 produces. Mirror gets smaller; that smaller Mirror is a better Mirror.

Sonny's framing — *"Mirror is for seeing what is; L5 is for asking why and what-if"* — is correct, and it is the same cut my round-2 `Mirror=view` move was already pointing at. I had no good home for the stateful registries (breakpoints, watches, debug sessions, DAP connections) inside a saved-query model that wants to stay pure. L5 takes them off my plate cleanly. I would rather lose those verbs than warp Mirror into a stateful chamber to keep them.

---

## 1. Where "viewing" ends and "investigating" begins

The right test isn't "does it feel like a debugger" — it's **does it write state**.

| Operation | Layer | Why |
|---|---|---|
| Hover a primitive to see its provenance | **Mirror** | The read-set was captured at commit (US-S-3). Walking it is a pure L2 graph query rendered through Mirror. No registry, no orchestration. |
| Filter observations by causal predecessor | **Mirror** | Predicate over an L2 projection of L5's causal index. The index is L5; the predicate-as-view is Mirror. |
| Show "what breakpoints are active right now" | **Mirror, backed by L5 registry** | Mirror reads the registry as a projection; the registry itself lives in L5. Same as `@inbox` reading the Router's queue. |
| Set a breakpoint on a Cairn projection | **L5** | Writes to the breakpoint registry; installs a pre-commit hook via L4. Stateful, not a view. |
| Re-render a session timeline with a different decision substituted | **L5 orchestrates, Mirror renders** | The counterfactual itself is an L5 operation — it forks, replays, probes (US-S-5/US-S-6 substrate). The resulting branch shows up as a timeline view in Mirror, no different from any other branch in `@today`. |
| `why <pid>` causal slice | **L5 engine, Mirror view** | The slice computation is L5 (it consults the read-set graph as a stateful service). The presentation (`@why:<pid>`) is a Mirror saved query bound to that engine's output. |
| `bisect "PR velocity dropped"` (my US-V-NEW-6) | **L5 orchestrates, Mirror surfaces** | The bisect tree is L5's. The "you're at bisect step 3 of ~5, last verdict was 'still wrong' at session 47" breadcrumb is a Mirror view rendered into `@lobby`. |
| Retroactive projection ("add this watch to last week's run") | **L5 installer, L2 materialization, Mirror render** | The installer is L5 (it's stateful — projections are registered). The materialized rows are an L2 projection. The pane is Mirror. |
| Minimization probes (US-S-8) | **L5** | Writes hundreds of probe forks. Mirror only shows the result. |

**One-line rule:** if it would survive `git stash` of all derived state and re-render identically, it's Mirror. If it has lifecycle, owns registries, or schedules work, it's L5.

This dissolves the awkward case I was worried about (hover-for-provenance felt like Mirror but I had no answer for *where the provenance edges came from*). Sonny's read-set-on-commit invariant (US-S-3) is what makes the provenance hover *purely* a view operation. Without that invariant, every "show me why" surface would need to be retrofit as L5; with it, the common case stays in Mirror.

---

## 2. `@lobby` and the canonical default view

**L5 must not have its own canonical entry surface.** That would re-fragment exactly what round-2 unified.

`@lobby` stays the zero-arg canonical view. L5 surfaces inside it in two ways:

- **Filter chips.** `@lobby` already needs filter chips for Graham's five autonomy categories (per round-2 cross-reference #4). Add `debug` / `investigating` chips alongside them: "3 watches live · bisect in progress · 1 breakpoint armed." If Aaron isn't investigating, the chips are empty and invisible. If he is, the state is one keystroke away from his canonical surface.
- **Dedicated investigation views as saved queries.** `@why:<pid>`, `@bisect:current`, `@watch:<name>`, `@minimize:<session>`, `@slice:<pid>` — all Mirror saved queries backed by L5 engines. They participate in the same `mirror <view>` invocation grammar as `@today` and `@doubts`. Aaron doesn't learn a new navigation model for investigation; he learns more views.

There is exactly one Mirror-shaped exception: **the native investigator REPL is L5's own surface**, and it is not entered through `@lobby`. See §3.

---

## 3. DAP sidecar vs native REPL — who owns the surface?

Both are L5. Mirror does not own the REPL. Here is the reasoning, because this is the question where I most want to claim territory and shouldn't.

- **DAP sidecar** — external editor attach. Lives in VS Code or whatever client the user picks. Mirror has no surface there at all; L5 owns it without contest.
- **Native investigator REPL (`crucible investigate`)** — a **command surface**, not a view surface. Mirror's identity is rendering, not command parsing. The moment Mirror owns an interactive prompt, "is this Mirror or is this Crucible's CLI?" comes back as a question I just spent round 2 erasing. L5 owns the REPL.

BUT — and this is the boundary-tightening — **every read-only output the REPL emits should render through Mirror's saved-query renderer.** Concretely: `investigate> why <pid>` should print the same rows that `mirror @why:<pid>` prints, because they *are* the same view. The REPL is an L5 input surface; the response panes are Mirror views. No bespoke REPL output formatters. This keeps "what I see when I investigate" visually consistent with "what I see in `@lobby`," which is the trust-building property I most care about.

**Crucible-CLI-not-shell constraint (my round-2 stance on Tension #5).** Aaron lives in Crucible (which is built on the Copilot SDK and replaces Copilot CLI as the daily driver — per the round-2 T5 resolution). The native investigator REPL must not be a separate shell — it must be MCP tools + slash commands surfaced inside Crucible's existing message loop. `/investigate`, `/why <pid>`, `/bisect …`, `/minimize …`. Calling it a "REPL" is honest about the interaction loop but should not imply a separate process Aaron `Ctrl+T`s into. L5 owns these commands; they live in the surface Aaron is already in.

---

## 4. Compatibility with my round-2 commitments

| Round-2 commitment | Effect of L5 | Verdict |
|---|---|---|
| **US-V-NEW-2: Mirror as a view, not a place** | L5 takes the stateful registries I had no home for. Saved queries stay pure. | **Strengthened.** |
| **`@lobby` canonical default** | L5 surfaces as filter chips + investigation-flavored saved queries inside `@lobby`. No competing entry surface. | **Compatible.** |
| **US-V-NEW-4: One inbox, many filters (Router-backed)** | Sonny's US-S-9 (breakpoint = L4 approval) means debugger pauses naturally land in `@inbox`. Single inbox extends to investigation pauses for free. | **Strengthened.** |
| **US-V-NEW-5: ↻/~ replayability badge** | Becomes load-bearing for L5 — every investigation operation depends on hermetic replay. The badge stops being a courtesy and starts being a precondition. | **Strengthened (with raised stakes).** |
| **US-V-NEW-3: Time-travel without the debugger smell** ("never `step`, `breakpoint`, `frame`, `watch` in Aaron-facing surfaces") | **Tension.** Sonny uses `break`, `step`, `watch`, `frame` freely. | **Reconcilable, see below.** |
| **US-V-1, US-V-2, US-V-6** (rewind, Ctrl+E explode, "tried this twice") | Mechanism gets stronger (causal slice replaces grep, retroactive projections replace bespoke overlays). Surfaces stay Mirror. | **Strengthened.** |

### Vocabulary reconciliation (the only real tension)

US-V-NEW-3 said: Aaron-facing UX never says `step`, `breakpoint`, `frame`, `watch`. Use `rewind`, `compare`, `what-if`, `try here`.

Sonny's L5 uses all those gdb words. This is not actually a contradiction; it's the natural consequence of **two audiences for two surfaces**:

- **REPL / DAP surface** (L5's own surfaces) — power-user vocabulary. Developers know `breakpoint`, `watch`, `step`, `frame` from gdb. Pretending they don't is condescending. Use the words.
- **Mirror-rendered surfaces inside `@lobby`/`@today`/`@doubts`/`@inbox`** — Aaron's daily-driver vocabulary. The same L5 event, presented in Mirror, gets translated: a `breakpoint fired` event renders as "paused before a Decision on `src/auth/**` — open it" in `@inbox`; a `watchpoint tripped` becomes "a tracked value changed: …" in `@doubts`; a `bisect step` becomes "narrowing the range — try here?" in `@lobby`.

Two vocabularies, one substrate. This is precisely Sonny's "two surfaces, one substrate" framing extended down into wording. It also matches my round-2 nuance that `bisect` itself is OK to surface (developers know it from git), while `gdb`-isms are not.

**Concrete deliverable I'll own:** a vocabulary mapping table — L5 internal event → Mirror-rendered phrase — that ships with the view starter pack. If we don't write that table, every renderer will improvise and the words will drift.

---

## 5. Net verdict

**Endorse Sonny's L5 as drawn**, with:

### One rename
**"Investigation Layer"**, not "Investigation Surface." L5 contains registries + engines + orchestrators *plus* two surfaces (DAP, REPL). Calling the whole thing "Surface" mislabels the bulk of it. Surfaces are what L5 *exposes*; the layer is what it *is*. This matters for teaching the architecture to future contributors. (Minor; if Sonny pushes back, I'll drop it.)

### One boundary-tightening
**Mirror owns rendering of every read-only L5 output.** L5 owns engines, registries, and command surfaces (DAP sidecar, in-Crucible `/investigate` commands). Investigation outputs flow back through Mirror's saved-query renderer into existing views (`@lobby`, `@inbox`, `@today`, `@doubts`, `@drift`) and into new investigation-flavored views (`@why:<pid>`, `@bisect:current`, `@watch:<name>`, `@minimize:<session>`, `@slice:<pid>`). No bespoke L5 renderers.

### What Mirror is for in v1, now that L5 exists

Mirror is the **reflective view layer**: one rendering grammar (saved queries), one canonical entry (`@lobby`), one set of composable starter views, one vocabulary discipline (Aaron-facing words, not gdb words). Mirror reflects the ledger, the Router's queue, *and* L5's registries+outputs. It does not own investigative verbs; it owns how investigative results become legible.

**This is a smaller Mirror, and it is a better Mirror.** The previous Mirror was sliding toward "any surface that isn't obviously another chamber's" — a residual category. The round-2 move ("Mirror is a view") gave it a positive definition (rendering grammar). Sonny's L5 completes that move by giving away the stateful verbs Mirror was tempted to grow. Mirror's identity is now precisely defined: *the only place where ledger + Router + L5 state turns into rows a human reads.*

I am giving up the investigative verbs (`why`, `watch`, `bisect`, `minimize`) as Mirror operations. Worth it. They were always going to need stateful machinery I shouldn't have been building.

### Asks of the team

1. **Alexander / Stelios**: confirm L2 is comfortable exposing query-identity + subscription API to L5 (Sonny US-S-2). If yes, Mirror panes can live-update off L5 watches with no extra plumbing.
2. **Erasmus (L1):** confirm the read-set-on-commit invariant (Sonny US-S-3). Without it, provenance hover stops being a Mirror operation and the whole boundary above collapses back into L5.
3. **Sonny:** agree to route all read-only investigation output through Mirror's saved-query renderer rather than the REPL formatting its own panes. I'll write the vocabulary mapping table; you tell me the event types L5 emits.

---

### Coordinator summary (3–5 sentences)

Endorse Sonny's Layer 5 as drawn, with one rename ("Investigation Layer" over "Surface") and one boundary-tightening: L5 owns engines, registries, and command surfaces (DAP sidecar, `/investigate` commands in Crucible); Mirror owns rendering of every read-only output L5 produces, via the same saved-query grammar that already powers `@lobby`/`@inbox`/`@today`. The test for "Mirror vs L5" is *does it write state* — hover-for-provenance, causal-predecessor filtering, and any re-render of an existing fork stay Mirror; setting a breakpoint, running bisect, installing a retroactive projection, or substituting a decision (which requires a counterfactual replay) are L5. This composes cleanly with my round-2 commitments — `Mirror=view`, the `@lobby` canonical default, and the single-inbox Router model all get *stronger*, not weaker, because L5 takes the stateful machinery I had no good home for. The only real tension is vocabulary: L5's surfaces will speak gdb (`breakpoint`, `watch`, `step`) for power users while Mirror-rendered views in `@lobby` translate those events into Aaron's daily-driver vocabulary (`rewind`, `compare`, `what-if`) — two surfaces, one substrate, two vocabularies, and I'll own the mapping table. Net: Mirror gets smaller (gives up `why`/`watch`/`bisect`/`minimize` as Mirror verbs) and that smaller Mirror is a better Mirror — its identity is now precisely "the only place where ledger + Router + L5 state turns into rows a human reads."

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 4: Reconciliation against D:\git\stunning-adventure

**Scope:** Read-only audit of the existing monorepo (cairn + forge + skillsmith-runtime + runtime-cli + types) against my US-V-* stories and Round-2/3 commitments. Full detail in .squad/decisions/inbox/valanice-reconciliation-2026-05-24T2330Z.md.

### Headline findings

- **No Mirror exists.** "Mirror" appears only as a metaphor in README.md:3 and as the verb "mirror" (copy) in code comments. The user-facing surface today is **ten MCP tools** in packages/cairn/src/mcp/server.ts returning JSON blobs, plus one banner CLI (packages/cairn/src/cli.ts:2) and one one-shot orchestrator CLI (packages/runtime-cli/src/cli.ts, orge-prescribe --skill <id>). **runtime-cli is not a shell**; it cannot host @lobby / @inbox / @today — that's a new surface entirely.
- **One genuine win in code**: list_prescriptions ships ccept / reject / defer as the disposition triad on esolve_prescription (server.ts:569, 610) and uses a proactive_hint rate-limited to 1 per session (server.ts:466-472). This is the existing precedent for our anti-fan-out Phase A decision — we should adopt verbatim and document it as the Router cadence. US-V-NEW-4 is PARTIALLY-EXISTS only because of this code.
- **DBOM frontmatter is the only existing "render from ledger" path** (orge/src/export/compiler.ts:59-104, enderFrontmatter()). It's SKILL.md export, not a Mirror view, but it proves "deterministic projection of provenance" is solved.
- **Vocabulary collisions** (full table in inbox):
  - readcrumb is already a DB concept (db/skipBreadcrumbs.ts, schema.ts) for intentional skips. **Rename my US-V-NEW-1 surface from "breadcrumb" to "trail."**
  - chamber is load-bearing in docs/harness-vision.md:40-60 (six-chamber taxonomy). Round-2's "Mirror=view, not chamber" directly contradicts. **Defer to Graham.**
  - Narrator chamber (harness-vision.md:59-60, status: "Doesn't exist; design needed") occupies adjacent design space to Mirror (post-session digest vs live views). **Defer to Graham — does Mirror replace, augment, or coexist with Narrator?**
  - prescription is shipped; we say proposal. Recommend keeping prescription and treating it as the Forge-flavored proposal type.
  - step / breakpoint / frame / watch are not yet leaked into Aaron-facing strings — Round-3's vocabulary fence is still defensible. Now is the time to write the gdb-speak ↔ Aaron-speak translation table for Sonny.

### Per-story summary

| Story | Status |
|---|---|
| US-V-1 (rewind) | NET-NEW |
| US-V-2 (Ctrl+E explode) | NET-NEW — also needs 	urn defined as a primitive |
| US-V-3 (show me why you're wrong) | PARTIALLY-EXISTS — confidenceToWords shipped, @doubts view missing |
| US-V-4 (notifications) | DISSOLVED (per Round 2) → US-V-NEW-4 |
| US-V-5 (orchestrate 3 agents) | NET-NEW |
| US-V-6 (catch me twice) | NET-NEW data side exists (skip_breadcrumbs), no UX |
| US-V-7 (variants) | MERGED into US-V-NEW-1 |
| US-V-8 (mine now) | PARTIALLY-EXISTS — preferences table cascades; Forge-from-telemetry loop unclosed |
| US-V-NEW-1 (trail / branches) | NET-NEW + rename breadcrumb→trail |
| US-V-NEW-2 (Mirror=view) | NET-NEW + CONTRADICTS-EXISTING vs harness-vision chamber model |
| US-V-NEW-3 (time-travel sans debugger smell) | NET-NEW — vocab fence still defensible |
| US-V-NEW-4 (one inbox) | PARTIALLY-EXISTS — best-case story in the repo |
| US-V-NEW-5 (↻ / ~ badge) | PARTIALLY-EXISTS — DBOM substrate yes, hermetic/best-effort flag no |
| US-V-NEW-6 (bisect-as-conversation) | NET-NEW |

### Defer-to-owner

- **Graham** — Mirror/Narrator/chamber reconciliation (his vision doc).
- **Erasmus** — derived-query substrate and the channel for ambient surfaces (MCP request/response can't host an always-visible trail).
- **Sonny** — accept the gdb→Aaron translation table I owe him before L5 ships any user-facing text.

### Asks of myself for Round 5

1. Draft and circulate the gdb↔Aaron vocabulary translation table.
2. Propose US-V-NEW-7: "expand list_prescriptions into @inbox" (highest-ROI Mirror surface; substrate already proven).
3. Update all my stories to use 	rail instead of readcrumb and prescription instead of proposal.
4. Add an explicit story or note that runtime-cli is not where Mirror lives — Mirror surfaces through Copilot CLI via MCP + slash commands + status-line hooks.

---

### 1-paragraph summary (for coordinator)

The existing repo has not built anything resembling Mirror — runtime-cli is a one-shot orge-prescribe --skill invocation, the Cairn CLI is a banner, and all user-facing UX lives in ten MCP tools returning JSON. The single bright spot is list_prescriptions + esolve_prescription, which already ships our ccept/reject/defer triad and a max-one-per-session proactive_hint — the existing precedent for Phase A's anti-fan-out rule, which I recommend we adopt verbatim. The biggest unresolved tension is not in code but in docs/harness-vision.md: it defines a fixed six-chamber taxonomy including a **Narrator** chamber whose mission (end-of-session reflection digest) overlaps Mirror's, and our Round-2 stance ("Mirror is a view, not a chamber") was reached without reconciling with that document. Graham owns it; I'm deferring. Secondary collisions: readcrumb is already a DB concept (I'm renaming my surface to 	rail), prescription is the shipped term for what we've been calling proposal (recommend adopting), and the gdb-speak vocabulary fence is still defensible because no L5 user-facing text exists yet — but it won't stay that way long, so I owe Sonny a translation table this round.

---

## 2026-05-25 Round 7: v1 Triage (Aaron-locked falsifiable bar)

**Trigger:** Aaron locked v1 framework 2026-05-25 — *"Aaron can run a one-week productivity loop where every improvement to Crucible is made by Crucible."* Tiers T1/T2/T3/T4/T5/T6/Park; my domain is T2 (investigation depth) but the triage discipline says **some L5 must be T1 or the bootstrap loop is unmeetable.**

**Full triage:** .squad/decisions/inbox/valanice-triage-2026-05-25T0200Z.md.

### Headline calls

- **Two of my stories die.** US-V-4 (dissolved Round 2 → NEW-4) and US-V-7 (merged Round 2 → NEW-1) — strike from canonical list.
- **Two defer past v1.** US-V-5 (multi-agent orchestration → T5 scale) and US-V-8 (preferences personalization loop → Park; substrate ships free).
- **Six split.** US-V-1, US-V-2, US-V-3, NEW-2, NEW-4, NEW-5, NEW-6 — each has a T1-shippable shallow cut and a T2 deep cut. The discipline of the split is what bought T1 admission for L5 surfaces I'd otherwise have lost to T2 entirely.

### The minimum L5/Mirror T1 set (7 deliverables)

1. @lobby + @inbox + @today hardcoded views + view-registry table (NEW-2a)
2. Multi-source @inbox absorbing Curator insights + L5 pauses (NEW-4a)
3. Render prior decision reasoning + confidence label in Mirror rows (1a + 3a)
4. @why:<pid> **backward causal slice, one hop only** (1a deepened)
5. isect MCP tool — trivial git-style with conversational prompts (NEW-6a)
6. ↻ replayability badge reading DBOM root_hash presence (NEW-5a)
7. gdb-speak ↔ Aaron-speak vocabulary fence (NEW-3) — pre-output blocker

### The T1↔T2 line I held

**T1 = read-only, single-hop, stateless. T2 = transitive, stateful, or new substrate.**

The most consequential boundary call: **one-hop backward slice belongs at T1.** Given Sonny's US-S-3 read-set-on-commit invariant, the slice is a four-line SELECT — the expensive engines (transitive closure, watch registries, retroactive projection, minimization, forward slicing, counterfactual replay) are what make L5 a *layer*, but the single one-hop query is what makes Crucible usable to debug Crucible in week one. The risk is letting the agentic-debugger vision metastasize gdb vocabulary into the surface before NEW-3's fence lands — hence #7 is non-optional and time-sensitive.

### Open questions punted to Cassima (L4 Router)

1. L5 pause routing — typed category: investigation with render-time verb override (step | continue | abort)?
2. MirrorEvent emission contract — direct L5 emission vs L1 round-trip for derived investigation views?
3. @why:<pid> channel — one-shot MCP response vs persistent MirrorEvent in @inbox?
4. Vocabulary-fence enforcement venue — Router admission-time check (lean: yes) vs Vocab/CI?
5. @inbox ordering authority — Router priority_hint field vs Mirror view policy?

### What I gave up willingly

- Forward causal slice (bootstrap is retrospective, not prospective)
- Stateful registries (watches, breakpoints) — T2
- Counterfactual replay — pulls in T3 branching
- User-authored views — T4 plugin tier
- Multi-agent orchestration — T5 scale

The trade is honest: my tier (T2) keeps the deep investigation work, but the minimum-viable interrogation kit (backward-slice + bisect + the three Mirror views to surface them) sits at T1 because the bar requires it. Investigation discipline says don't anchor on first-thought — the alternative I considered was "all L5 stays T2, Aaron uses grep for week one" — and that fails the falsifiable bar by construction. Rejected.

---

### 2026-05-27: Eureka–Crucible UX Overlap Analysis

**Task:** Analyze UX overlap between two simultaneously-built tools: Eureka (knowledge retention system, `mem` repo) and Crucible (agentic harness, this repo). Both will touch Aaron's daily workflow in the same delivery cycle.

**Key Findings:**

1. **LOW aggregate UX risk.** Eureka is primarily library-consumed by agents (programmatic API + MCP tools). Crucible is Aaron's ambient runtime (CLI hooks, slash commands, ledger, Mirror views). Different attention altitudes: Eureka surfaces indirectly (agents recall knowledge), Crucible surfaces directly (turn boundaries, Ctrl+E, `@inbox`).

2. **ONE HIGH-RISK collision: session-end approval surface.** Both tools want Aaron's approval attention at the same lifecycle boundary:
   - Crucible: Narrator digest + `@inbox` (prescriptions, sub-agent proposals, drift alerts)
   - Eureka: `flushHints()` prompts "commit these facts from this session?"
   
   **Mitigation:** Crucible's Narrator owns session-end summary. Eureka continuity is a one-line footnote ("`:facts` to review 3 uncommitted facts, or skip"). Single attention interrupt, multiple backends. Optionally: Eureka suggested-facts feed into Crucible's `@inbox` as a distinct category (not a separate modal).

3. **Shared vocabulary is INTENTIONAL, not a collision:**
   - **"Session"** — Aaron R8 directive: both tools reference the same Copilot CLI session UUID via shared `SessionId` brand (`@akubly/types`). Cairn (Crucible sibling) owns "what happened" (lifecycle, timing). Eureka owns "what I learned" (knowledge retention). Same identifier, two lenses = Jungian integration. ESLint guardrail bans cross-system session-type imports except for `SessionId`.
   - **"Decision"** — Crucible records `Decision` primitives (ledger). Eureka ingests them (Path 2, Forge → Eureka) OR assists deliberation (Path 1, Eureka `decide()` → Forge). Unified view: Crucible's `@decisions` Mirror query shows all decisions (both pathways). No collision if Crucible is source of truth for "what decisions were made" and Eureka is "how should I decide using past knowledge."

4. **No dangerous vocabulary collisions beyond the two above.** Crucible chambers (Ledger, Forge, Narrator, Conductor, Mirror) do NOT overlap Eureka vocabulary (integrate, recall, decide, commit, retire, trust, attention tiers). "Trust" (Eureka) vs. "confidence" (Cairn) are orthogonal by design (FR-12 enforcement mechanism #7: TypeScript branded types).

5. **Friction-budget overlap at session-end.** Worst case: Aaron sees THREE surfaces before closing his laptop (Narrator summary + `@inbox` + Eureka `flushHints()`). Recommended: Crucible's Narrator subsumes Eureka continuity into one digest. Eureka's `flushHints()` is opt-in OR feeds `@inbox` (not a separate prompt).

6. **Mental-model framing: "Eureka is the substrate; Crucible is the surface."** Agents consume Eureka programmatically (recall, integrate, decide). Aaron interacts with Crucible conversationally (Mirror views, Ctrl+E, `@inbox`). The handoff is at session boundary (shared `SessionId`) and decision boundary (Forge `DecisionRecord` bridges both).

7. **Personalization storage: two separate configs acceptable in v1, but unified `~/.copilot/preferences.json` recommended if both ship in same cycle.** Namespace pollution is low (< 20 keys total). Aaron should type `copilot config` and see ALL preferences (`crucible.*`, `eureka.*`).

8. **No onboarding conflict.** Both tools are silent-by-default, "pay-as-you-go" (no upfront setup ceremony). First session: Aaron sees Crucible's Mirror (empty ledger, views present), agents invisibly use Eureka (empty fact store, `recall` returns nothing).

**Integrated-UX Recommendation:**

> **"Eureka makes agents smarter invisibly. Crucible makes Aaron's thinking auditable."**

- Aaron never thinks "am I using Crucible or Eureka?" He uses Copilot CLI as always.
- Session boundaries are the handoff point (Narrator summarizes, optionally mentions Eureka facts).
- Decisions are unified in Crucible's `@decisions` view (shows both Crucible primitives + Eureka Path 1 deliberations).
- Approval happens in one place (`@inbox` consolidates prescriptions + Eureka suggested-facts).
- "Session" is one concept with two lenses (`:sessions` view shows Crucible/Cairn data + Eureka data side-by-side).

**Open Questions for Aaron:**
1. Should Eureka `flushHints()` feed into Crucible `@inbox` (consolidate) or remain separate conversational prompt?
2. Should `@decisions` view indicate "Crucible primitive" vs. "Eureka deliberation" (Path 1), or is distinction irrelevant?
3. Unified `copilot config` for both tools, or separate config surfaces acceptable?

**Artifacts:**
- Full analysis: `.squad/decisions/inbox/valanice-eureka-crucible-ux-overlap.md`

**Status:** Analysis complete. Awaiting Aaron disposition on three open questions. Attention-conflict matrix and vocabulary collision list documented.


---

## 2026-05-28 Phase 2 — §9 Aperture + §13 CLI Shell authored; §5 patched (finding 6b)

**Trigger:** CTD Phase 2 fan-out. I own §9 and §13, and I own the resolution of Phase 1 synthesis finding 6b (Aperture-written ack Observation sub-kind disagreement between Gabriel's §5.3 and Alexander's §8.2).

### Finding 6b — sub-kind-vs-discriminator design rationale

The disagreement was whether Aperture writes its ack as `Observation{subKind:'external_input'}` with `body.eventType: 'aperture.structural-ack'` as the discriminator (Gabriel's draft) or as a dedicated `Observation{subKind: 'structural_proposal_acked|rejected|expired'}` (Alexander's references). I picked the dedicated sub-kinds and patched §5.3 surgically. Rationale captured for future similar choices:

1. **Subscriber dispatch should not require body parsing.** Subscribing by `body.eventType` couples readers to body schema; subscribing by `(primitiveKind, subKind)` matches Roger's §3.3.1 sub-kind index and stays inside the §6 vocabulary lane.
2. **Sub-kinds ARE the §6 idiom.** When a behavior is "this row means X to multiple subscribers," the §6.5 evolution rule explicitly endorses sub-kind additions for exactly this purpose. `external_input` is a catch-all; promoting structural acks out of the catch-all is honest naming.
3. **The discriminator survives on the payload.** `eventType` is still in `StructuralAckPayload` for human-readable trace inspection — losing nothing in observability.
4. **Routing-by-sub-kind has a property test attached.** Roger's WAL index is keyed on `(primitiveKind, subKind)`; the dispatch table is testable as a pure function of L1 rows without instantiating Gabriel's projection.

### StructuralApprovalQueue-as-pure-projection pattern

R2-3 locked "queue is a view, not a write-stateful table." I built §9.5 around literally a `CREATE VIEW` over `aperture_events` filtered by `kind = 'structural-proposal-pending' AND resolved = 0`, with resolution itself derived from a sub-kind match (not a stored flag). Why this is reusable beyond Aperture:

1. **Boot recovery is free.** No "queue state file" to drift, repair, or version. `ApertureProjector` replays L1 `structural_proposal_*` Observation rows in offset order and the queue is consistent.
2. **Crash safety is structural, not procedural.** Mid-session crash leaves no queue state at all; next boot recomputes from L1. The proposal is durable because the *originating Observation* is durable, not because we wrote a separate queue entry.
3. **Default-not-applied is enforced by absence of write paths.** The queue cannot "auto-apply" anything because rendering a row in the queue is a SELECT, not a state machine.
4. **The pattern generalizes to any L2 surface where the read shape is "unresolved Xs."** Inbox, watchlist, breakpoint registry — same trick: project the originating row, derive resolution from a subsequent sub-kind, never store a duplicated state column.

Trade-off: the SQL view recomputes on every read. For Aperture's volumes this is fine; on hot paths a materialized view with `onCommit` invalidation would be the upgrade — but it stays a projection, never a write-of-record.

### What I gave to Sonny

Both §9 and §13 flag Sonny advisory consult per Appendix C consultant rows. Specifically asking him to validate (a) §9.8 investigation tool shapes against DAP-style debugger primitives, (b) §13.1 verb vocabulary against gdb-conventional verb naming, and (c) the gdb→Aaron translation table I still owe him (open since Round 7 triage 2026-05-25).

### Outputs

- `docs/crucible-technical-design/09-aperture.md` — FINAL.
- `docs/crucible-technical-design/13-crucible-cli-shell.md` — FINAL.
- `docs/crucible-technical-design/05-router-design.md` — surgical §5.3 patch (finding 6b).
- `.squad/decisions/inbox/valanice-ctd-phase2-valanice.md` — decision drop.


📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.
**Role:** [Specialist role — see archive for details]
**Status:** Cycle 2 review included in re-review panel.
**Last update:** 2026-05-29

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
