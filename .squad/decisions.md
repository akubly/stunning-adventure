# Squad Decisions

## Closed Decisions

### 2026-05-22: Eureka Project Kickoff — Name + Repo Placement Decided

**Status:** ✅ CLOSED (Aaron decided)  
**Date:** 2026-05-22  
**Decision:** Project named **Eureka**; built in `packages/eureka/` (monorepo); 3 specialists hired into existing squad

**What Was Decided:**
1. The agentic brain/memory/thinking/learning system is named **Eureka**
2. Location: `packages/eureka/` in this monorepo (not separate repo)
3. New squad members: Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)
4. Existing squad continues Cairn/Forge; Valanice shifts 60% to Eureka UX

**Why:**
- User decision after 4 rounds of deliberation (Rounds 1–2: repo placement; Round 3: squad fit assessment)
- Cross-repo coordination overhead exceeded bounded-context benefit at this scale (3 new hires, solo orchestrator)
- Package-level boundary is sufficient enforcement; can extract to separate repo in Phase 5+ if org-tier federation needs backend service
- New specialists bring epistemology/cognitive systems expertise that current squad lacked

**Key insight from Round 3 (Squad Fit):**
- Current squad (Graham, Roger, Alexander, Valanice) correctly identified expertise gaps: cognitive science, knowledge graphs, agentic learning loops, epistemology
- Recommendation: Hire domain specialists (✅ DONE) rather than stretch current platform team
- Existing squad continues advisory roles on boundaries/UX (Graham 2-3 hrs/week, Valanice 40% Cairn)

**Artifacts:**
- Orchestration log: `.squad/orchestration-log/2026-05-22T20-49-46-onboarding-eureka-hires.md`
- Session log: `.squad/log/2026-05-22T20-49-46-eureka-hires.md`
- Decision directive: `.squad/decisions/inbox/copilot-directive-eureka-name.md` (merged here)
- New agent folders: `.squad/agents/{genesta,crispin,edgar}/` with charters + history
- Team roster updated: 14 members (was 11)

---

## Active Decisions

# Open Question: Brain/Memory/Learning System — Repo Placement

**Status:** Deliberation (Round 2 consulting, no final decision)  
**Date:** 2026-05-22  
**Requestor:** Aaron  
**Consulting Agents:** Graham Knight (Lead), Roger Wilco (Platform), Alexander (SDK/Runtime), Valanice (UX)

---

## The Question

Should a new agentic brain/memory/thinking/learning system be:
1. **NEW REPO** (@akubly/cortex, @akubly/synapse, etc.) — standalone product with independent release cadence
2. **NEW PACKAGE in this repo** (packages/mem/) — satellite package alongside Cairn/Forge
3. **EXTEND CAIRN** (same package) — Curator extension for pattern learning

---

## Agent Recommendations (Round 2, Refined)

### Graham Knight — NEW REPO (High conviction)

**Key insight:** Five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) confirms system boundary shift.

**Why:**
- User-memory tier is cross-repo infrastructure (cwd-aware hooks outside this monorepo)
- Brain is a **runtime** with control loops (meditate, dream, pray), not a library
- KINDS are ontological (practical, semantic, linguistic, symbolic, philosophical) — no overlap with Cairn's types
- PROPERTIES (recency, trustworthiness, plasticity) are learning primitives, not event signals
- REPRESENTATION (graph + versioning) differs from Cairn's SQLite + event log

**Verdict:** This isn't a Cairn extension. It's a product with zero hard dependencies on Cairn/Forge.

---

### Roger Wilco — NEW PACKAGE in Monorepo (Medium conviction, pragmatic)

**Key insight:** FLIPPED from "extend Curator." Multi-tier + polyglot system can't fit in Curator, but can fit as separate package.

**Why:**
- Monorepo velocity (shared build, shared types, single test suite)
- Cairn stays focused (project-level knowledge, not multi-scope router)
- Clean delegation: packages/mem/src/tiers/project.ts wraps Cairn Curator
- Tier/kind federation avoids schema conflicts and package boundary violations

**Trade-off:** Org-tier federation (multi-writer shared memory) still wants backend service later, but Phase 1-3 can use SQLite + Git.

**Verdict:** NEW PACKAGE as pragmatic step; extract to separate repo in Phase 5+ if org-tier backend service is needed.

---

### Alexander — NEW REPO (High conviction)

**Key insight:** FLIPPED from monorepo. Q3 (org-tier federation) reveals backend/deployment boundary.

**Why:**
- **Q1 (Runtime coupling):** Brain is Forge sibling, not layer on Forge — separate repo avoids confusion
- **Q2 (User-tier distribution):** CAN work from monorepo via npm, BUT separate repo enforces "no accidental Forge deps"
- **Q3 (Org-tier federation):** Wants Postgres + Azure Functions as separate deployment unit — this is the decisive factor

**Key argument:** The 5-dimension expansion is 10x scope increase. Original analysis (monorepo works) was correct for narrow scope; Graham's position is correct for expanded scope.

**Verdict:** If brain's org tier needs Postgres + backend service, it's a separate system boundary. Matches deployment boundaries, not just code boundaries.

---

### Valanice — NEW REPO with Phased Extraction (Medium conviction)

**Key insight:** Infrastructure positioning determines repo choice; mental model boundaries matter for discoverability.

**Why:**
- Brain is **infrastructure** (like Git, Redis) that follows the user globally and hooks per-repo
- Installation story: 
pm install -g @akubly/brain (not embedded in Cairn)
- Branding independence signals "infrastructure for any agentic system," not "Cairn feature"
- UX principle: Mental model boundaries should match repo boundaries

**Phased approach:**
- **MVP (Prototype in monorepo):** xperiments/brain/ or packages/brain/
- **Extract when:** Brain has independent CLI, MCP server, test suite, branding decision
- **Branding options:** Synapse, Mneme, Cortex, Engram

**Verdict:** Lean toward separate repo, but prototype in monorepo first to validate scope.

---

## Summary of Positions

| Agent | Position | Conviction | Reasoning Core |
|-------|----------|-----------|-----------------|
| **Graham** | NEW REPO | 🟢 High | System boundary (5 dimensions) |
| **Roger** | NEW PACKAGE | 🟡 Medium | Pragmatic: monorepo velocity, can extract later |
| **Alexander** | NEW REPO | 🟢 High | Org-tier backend service = deployment boundary |
| **Valanice** | NEW REPO (phased) | 🟡 Medium | Infrastructure positioning + phased extraction |

**Consensus:** 3 agents recommend NEW REPO (Graham, Alexander, Valanice); 1 recommends NEW PACKAGE (Roger, pragmatic compromise).

---

## Open Questions for Aaron

1. **Is brain Cairn/Forge-exclusive, or infrastructure for any agentic system?**
   - If exclusive: NEW PACKAGE makes sense; Roger's approach is solid
   - If infrastructure: NEW REPO makes sense; Graham + Alexander + Valanice alignment is strong

2. **What's the MVP scope?**
   - If 2-week prototype: Keep in xperiments/brain/ for now
   - If 2-month full system: Decide repo placement before implementation

3. **Who is the primary user?**
   - If agents (LX-first): Infrastructure positioning → NEW REPO
   - If humans (UX-first): Could be either, but tooling/discovery favors NEW REPO

4. **How soon is org-tier federation needed?**
   - If Phase 1-2 MVP: SQLite + Git works, monorepo packaging is OK (Roger path)
   - If Phase 3+ scaling: Postgres + backend needed, repo boundary matters (Alexander path)

5. **Backend service story?**
   - If Postgres + sync service: Separate repo is cleaner (deployment boundary)
   - If stay local (SQLite + cwd-aware hooks): Either repo works

---

## Impact Analysis

### If NEW REPO
- **Coordination:** Separate squad, separate release cadence
- **Squad changes:** Forge + Types must publish to npm; Cairn depends on Brain
- **Timeline:** Phase 0-4 for brain squad (parallel to Phase 5 PGO)
- **Risk:** Version skew between Cairn and Brain

### If NEW PACKAGE in Monorepo
- **Coordination:** Same squad, shared build/test/types
- **Squad changes:** Create packages/mem/, implement tier delegation to Cairn
- **Timeline:** Integrate into main roadmap (maybe Phase 5 stretch goal)
- **Risk:** Org-tier federation later wants backend service (deployment boundary mismatch)

### If Extend Cairn
- **Rejected by all agents** — violates single responsibility, schema conflicts, architectural mismatch

---

## Session Log

See .squad/log/2026-05-22T20-25-51-brain-repo-deliberation.md for full Round 1 + Round 2 synthesis.

See .squad/orchestration-log/2026-05-22T20-25-51-*.md for individual agent analyses (4 files).

---

## Artifact Status

- **Inbox files:** 7 files to be archived after decision
  - graham-brain-repo-placement.md (Round 1)
  - oger-curator-overlap-analysis.md (Round 1)
  - graham-brain-refined.md (Round 2)
  - oger-brain-refined.md (Round 2)
  - lexander-brain-refined.md (Round 2)
  - lexander-forge-coupling-analysis.md (analysis)
  - alanice-brain-ux.md (Round 2)

- **Orchestration logs:** 4 files created (2026-05-22T20-25-51-*.md)

- **Session log:** 1 file created (2026-05-22T20-25-51-brain-repo-deliberation.md)

---

**Status:** Deliberation ongoing. Aaron to decide. Once decision is made, this section will either close as a decision or pivot to implementation planning.

---

# Open Question: Squad Fit for Brain/Memory/Learning System

**Status:** Self-assessment complete (Round 3)  
**Date:** 2026-05-22  
**Requestor:** Aaron  
**Self-Assessing Agents:** Graham Knight (Lead), Roger Wilco (Platform), Alexander (SDK/Runtime), Valanice (UX)

---

## Summary: Does This Squad Fit?

**Unanimous honest verdict: NO. This squad is NOT the right primary owner for the brain project.**

**Recommendation:** New squad with epistemology + knowledge-graph expertise. Current squad continues Cairn/Forge; offers advisory roles.

---

## The Core Mismatch

**This squad was assembled for:** Cairn (observability/event pipeline) + Forge (SDK deterministic runtime) — a platform team  
**Brain needs:** Cognitive infrastructure, knowledge representation, agentic reasoning loops, epistemology — a cognitive systems team

**These are orthogonal problem domains.** Adding brain to this squad splits focus and dooms both Cairn/Forge stabilization and brain delivery.

---

## Graham Knight (Lead) — NEW SQUAD REQUIRED

**Honest verdict:** NO for brain leadership.

**Reason:** Graham excels at platform architecture (boundaries, technology trade-offs, systems design). Brain requires **epistemology-first** leadership. No shipping experience with ontologies, reasoning loops, or knowledge consolidation.

**Can contribute:** Advisory role on system boundaries and technology selection (2-3 hrs/week).

**Key finding:** Graham's brain recommendations so far focus on repo placement and scope boundaries (classic platform thinking). Brain's harder problems — "What makes knowledge durable?" "How do tiers consolidate learning?" — require someone with cognitive systems expertise.

**Leadership profile needed:**
- Epistemology/knowledge representation theorist (PhD-level)
- Shipped graph-based learning systems or similar
- Thinks in ontologies, not layers
- Comfortable with uncertainty and probabilistic models

---

## Roger Wilco (Platform Dev) — PARTIAL FIT (PHASE 1-3 INFRASTRUCTURE)

**Honest verdict:** YES for infrastructure, NO for cognition.

**Energy breakdown:**
- 🟢 HIGH: TIERS, PROPERTIES, REPRESENTATION, ACQUISITION (Cairn patterns transfer)
- 🔴 LOW: ACTIVITIES (dream/meditate/pray), KINDS (semantic/linguistic/symbolic) — unfamiliar

**Recommendation:** Stay as Platform Lead for Phase 1–3 infrastructure (storage, federation, acquisition). Hand off reasoning + ontology to specialists.

**Can contribute:** Phase 1-3 infrastructure build. Phase 3+ transition to Cairn as brain's backend service needs emerge.

**Needed alongside:** LLM/agentic specialist + knowledge ontology specialist + graph DB specialist (optional).

---

## Alexander (SDK/Runtime Dev) — BOUNDARY SPECIALIST ONLY

**Honest verdict:** NO for core work. YES for boundaries and integration.

**Design philosophy mismatch:**
- Forge: "How do I make non-determinism safe?" (containment, control)
- Brain: "How do I make non-determinism useful?" (autonomy, discovery)

These are opposing philosophies. Knowledge representation, learning loops, agentic coordination — these are outside Alexander's expertise.

**Can contribute:** Boundary specialist — design Brain ↔ Forge adapter, npm publishing strategy, type safety proofs.

**Needed alongside:** Agentic systems architect + knowledge representation designer.

---

## Valanice (UX/Human Factors) — 70% YES, 30% NO

**Honest verdict:** YES for UX/LX, NO for cognitive science.

**Strong transfer (🟢 HIGH):**
- Mental model boundaries (repo placement mirrors mental models)
- Interaction design (pull-based, max 1 proactive insight per session)
- LX optimization (MCP tools, context budgets, signal density)
- Config surfaces (trust thresholds, recency gradients, plasticity policies)
- Observable vs invisible design

**Critical gaps (🔴 LOW):**
- Cognitive science fundamentals (what does "meditation" mean neurologically?)
- Knowledge ontology (are the five kinds exhaustive? mutually exclusive?)
- Graph information architecture (traversal algorithms, semantic linking)
- Learning primitives semantics (recency decay, trustworthiness measurement)

**Recommendation:** Lead interaction design. Bring cognitive scientist + information architect alongside.

**Can contribute:** 70% of team. Other 30% is cognitive science + knowledge management expertise. Without them, brain has beautiful UX on shaky assumptions.

---

## Squad Composition: Recommended Path

**Current Squad Role:**
- ✅ **Graham, Roger, Gabriel, Alexander, Rosella, Laura** — Continue Cairn/Forge
- 🟡 **Graham + Valanice** — Advisory roles on brain (2-3 hrs/week) for boundaries/UX
- 🟡 **Roger** — OPTIONAL: Phase 1-3 infrastructure if assigned

**New Squad for Brain:**
1. **Lead:** Epistemology/Knowledge Systems architect (PhD-level, shipped graph-based systems)
2. **Graph/Vector Specialist:** neo4j/PostgreSQL + vector stores, ontology design
3. **Distributed Systems Engineer:** Federation, conflict resolution, versioning
4. **Agentic Learning Systems Engineer:** Reinforcement learning, meta-learning, reasoning loops
5. **Observability/Testing Bridge:** Interface with Laura/Gabriel (observation-focused testing)

---

## Missing Expertise Clusters

| Expertise | Current Squad | Brain Needs | Severity |
|-----------|---------------|-------------|----------|
| **Knowledge Graph Architecture** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Vector/ML Systems** | ❌ None | ✅ Important | 🔴 BLOCKER |
| **Epistemology/Knowledge Representation** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Distributed Systems (federation)** | ❌ None | ✅ Important | 🔴 BLOCKER |
| **Cognitive Systems/Agentic Loops** | ❌ None | ✅ Critical | 🔴 BLOCKER |
| **Backend/Services** | ✅ Roger | ✅ Useful Phase 2+ | 🟡 SECONDARY |
| **Testing/Verification** | ✅ Laura | ✅ Useful | 🟡 SECONDARY |
| **DevOps/Deployment** | ✅ Gabriel | ✅ Useful Phase 3+ | 🟡 SECONDARY |

---

## Per-Member Recommendation

### Can Stay on Cairn/Forge
- ✅ Graham (architecture, boundaries)
- ✅ Roger (backend, data layer)
- ✅ Gabriel (deployment, CI/CD)
- ✅ Laura (testing, verification)
- ✅ Rosella (plugin architecture, SDK integration)
- ✅ Alexander (SDK runtime, Forge coupling)

### Can Contribute to Brain (Advisory Only)
- 🟡 Graham — System boundaries, technology selection (not leadership)
- 🟡 Valanice — Interaction design, LX optimization (60% contribution rate)

### Should NOT Work on Brain (Wrong Domain)
- ❌ Rosella — Plugin architecture is orthogonal
- ❌ Alexander (core) — SDK abstraction is orthogonal (keep as boundary specialist)

---

## Three Options for Aaron

### Option A: Fresh Squad (🟢 RECOMMENDED)
**Brain gets its own squad** with epistemology + graph DB + distributed systems expertise.
- **Outcome:** Brain gets undivided focus and right expertise. Cairn/Forge stabilization uninterrupted.
- **Timeline:** Parallel to Phase 5 PGO work
- **Risk:** New team ramp-up, version skew between brain and Cairn

### Option B: Current Squad + 3 Specialists (❌ NOT RECOMMENDED)
**Graft epistemology, graph DB, and distributed systems engineers** onto existing squad.
- **Risk:** Graham still leads a domain he doesn't have DNA for. Cairn/Forge work stalls. Hybrid squads split focus and underdeliver both.

### Option C: Keep Everything in Current Squad (❌ REJECT)
**Suicide by overcommit.** Cairn/Forge doesn't stabilize, brain never ships.

---

## Open Questions for Aaron

1. **Is brain Copilot-specific infrastructure or general agentic infrastructure?**
   - If Copilot-specific → maybe this squad could own it (bad idea, but possible)
   - If general → definitely needs new squad

2. **What's the MVP timeline?**
   - If 2 weeks → prototype in current squad (risky, rush job)
   - If 2+ months → new squad (recommended)

3. **How important is the epistemology layer?**
   - If "storage only" → current squad could do it (still not ideal)
   - If "learning system" → new squad required

4. **Budget for 3–5 new hires?**
   - If yes → new squad (go)
   - If no → delay brain until Cairn/Forge done, then hire for it

---

## Artifacts

**Orchestration logs (4 files):** `.squad/orchestration-log/2026-05-22T20-32-55Z-{agent}.md`
- Graham: HIGH conviction, NEW SQUAD required
- Roger: HIGH confidence, Phase 1-3 infrastructure only
- Alexander: HIGH conviction, keep as boundary specialist
- Valanice: MEDIUM conviction, 70% UX/LX yes, 30% cognitive science no

**Session log (1 file):** `.squad/log/2026-05-22T20-32-55Z-brain-squad-fit.md`

**Inbox files to delete (merged):**
- `.squad/decisions/inbox/graham-squad-fit.md`
- `.squad/decisions/inbox/roger-self-fit.md`
- `.squad/decisions/inbox/alexander-self-fit.md`
- `.squad/decisions/inbox/valanice-self-fit.md`

**Status:** OPEN QUESTION — Strong recommendation toward fresh squad, awaiting Aaron's input on budget, timeline, and scope.


