# Graham — History (Summarized)

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Lead
- **Joined:** 2026-03-28T06:21:47.377Z

## Learnings

### Core Learning Archive (Pre-Phase 6)

**Key insights from Rounds 1–5 brainstorm:**
- Copilot extensibility has three SDK layers: CLI SDK (embedding), Extensions SDK (distribution), Engine SDK (custom agents). MCP is the universal tool protocol.
- Plugin architecture: seven-layer composition model with plugin.json as distribution unit.
- Marketplace standardization: awesome-copilot is dominant center (170+ agents, 240+ skills, 55+ plugins). SKILL.md is cross-platform standard.
- Prior infrastructure reuse: 7 directly portable patterns from Aaron's previous work (knowledge taxonomy, persona review, workflow gates, skill template, tool guards, observability schema, multi-source code review).
- Architecture foundation: four-layer data pipeline (primitives → assemblers → experiences → CLI), session-scoped context model, SQLite knowledge.db with migrations.

**Code patterns established:**
- isScript guard at module scope: prevent process.exit during import
- Timestamp parsing: SQLite datetime format must normalize to ISO-8601 before parsing
- DB cleanup: dbOpened + finally pattern ensures safe DB closure in hooks
- Test strategy: test backing functions, not transport protocols
- Tool naming: verb_noun convention (get, list, search, run, check) aids LLM selection
- Error handling: fail-open principle for observability (silent failures preferred over blocking)

### Phase 4.5 Architecture — Local Feedback Loop + Phase 5 Roadmap (2026-05-02)

**Key file paths:**
- Phase 4.5 spec: `docs/forge-phase4.5-spec.md`
- Phase 5 roadmap: `docs/forge-phase5-roadmap.md`
- Telemetry module: `packages/forge/src/telemetry/` (6 files)
- Prescribers module: `packages/forge/src/prescribers/` (4 files)
- Applier module: `packages/forge/src/applier/` (3 files)

**Architecture decisions:**
- Drift score: weighted sum of 5 signals. Determinism > Cost (70%/30% split).
- Collectors as HookObservers: O(1) per event, defer analysis to flush.
- Three-phase ancestry roadmap: Phase 4.5 (linear), Phase 4.6 (change vectors), Phase 5 (DAG).
- Canary bootstrap: 0 sessions → defaults, 3+ → prompt, 5+ → token, 10+ → auto-apply.

### Phase 4 Architecture — Export Pipeline (2026-05-01)

**Decision document:** Merged to `.squad/decisions.md`

**Architecture decisions:**
- Injection pattern: Forge never imports Cairn. ExportQualityGate is function type satisfied by Cairn.
- DBOM persistence: two new tables + upsert semantics (one DBOM per session).
- Pipeline as fixed stages: four pure functions (Extract → Strip → Attach → QualityGate).
- No new shared types: all Phase 4 types stay package-internal.

### Phase 4.6 Completion — Change Vector Learning (2026-05-03)

**Role:** Kickoff lead (Wave 0) + Triage (Wave 2)

**Wave 0 outcomes:**
- Branch `squad/phase4.6-change-vectors` created and spec finalized
- Six clarifications resolved
- Work decomposition: A1–A4 (Alexander), R1–R5 (Rosella), L1–L5 (Laura)
- Three ADRs established

**Wave 2 (defect triage):**
- Laura flagged inconsistency: `summarizeChangeVectors` confidence=0 vs `computeConfidenceBoost(0)` = 1.0
- Three options analyzed; Option B chosen (rename field to `confidenceBoost` for semantic clarity)
- Lockout-compliant fix routing assigned

**Lesson:** When two implementations are internally consistent but the contract is ambiguous (level vs boost semantics), the bug is the naming, not the logic. Renaming surfaces intent.

### Phase 4.6 Review Cycle — 3-Cycle Persona Review (2026-05-04)

**Role:** Cycle 1 Triage Lead (graham-2)

**Cycle 1 Personas (parallel):**
- 5 persona reviewers ran in parallel
- Consolidated: 15 findings (1B / 9I / 5M)
- Blocked issue: deltaCost cumulative bug (blocking on ranking correctness)

**Cycle 1 Triage:**
- Adopted squad-mode autonomous triage (Aaron selected)
- 12 findings accepted, 1 rejected (contradicts ADR-P4.6-002), 2 deferred (scope questions)
- Filed 3 new ADRs (P4.6-004/005/006) documenting scope/trade-offs
- Applied lockout rule: original author cannot fix their own findings → cross-package coordination

**Cycle 2 Re-Review (correctness-1, skeptic-1, craft-1):**
- 7/7 + 4 PASS/3 PARTIAL + 6/6 verification
- 10 advisory findings routed to cycle 3 for remediation

**Cycle 3 Fixes (alexander-3, rosella-3, laura-5):**
- 1153 tests passing (+163 since baseline 990)
- Branch review-clean, compliance approved for merge

**Key decision:** ADR-P4.6-006 — Ship primitives only, defer runtime wiring to Wave 2. Rationale: computation hard, wiring mechanical. Separates concerns and unblocks PR.

**Lesson:** Autonomous triage with lockout coordination works for cross-package findings. Each agent owns their scope; review prevents author bias.

## Key Pattern Inventory

**Installation architecture:** Three broken surfaces (hooks, MCP registration, binaries). Strategy: `npm link` + `cairn install` CLI command.

**CLI extensions insight:** Extensions are undocumented but fully implemented. Primary CLI surface (persistent state, unified hooks+tools). MCP as universal distribution path. Build both, test both.

**Caching 4-layer hierarchy:** L1 (in-memory, ~100ms), L2 (session store, ~5min), L3 (short-TTL, ~1hr), L4 (long-TTL, ~30d). Balances speed + reach.

**Brainstorm distillation:** 2 rounds × 10 agents = massive input. Spec writing is lossy compression. Aaron's explicit decisions are spec constraints, not suggestions.

**Spike methodology:** Time-box with clear circuit breaker. Pre-defined threshold (Q1+Q2+Q4+Q5 = ✅) means verdict is mechanical, not ambiguous. Reusable for future tech evals.

### Repo Placement Decision Framework (2026-05-22)

**Context:** Aaron asked whether a new "brain/memory/thinking/learning" system should be added to this monorepo or live in a new repo.

**Key heuristic:** "Can the system be useful to someone who doesn't run the existing packages?" If YES → new repo. If NO → same repo.

**Bounded context test:** If adding a package requires changing the repo's elevator pitch (from "Copilot SDK integration platform" to "Copilot SDK + general AI cognition"), that's a signal the bounded context is being stretched.

**Dependency direction principle:** When uncertain, prefer the option that keeps dependency direction explicit and versioned (new repo can depend on existing packages as npm dependencies) over implicit and fragile (shared workspace where casual imports create hidden coupling).

**Squad attention principle:** Emerging work with different expertise requirements deserves undivided attention. Adding to an existing squad splits focus and delays both the new work and the stabilizing work.

### Brain/Memory System — Refined Recommendation (2026-05-22)

**Context:** Aaron provided detailed brain dump with five dimensions: TIERS (agent → org → project → user), KINDS (practical, semantic, etc.), PROPERTIES (recency, trustworthiness, plasticity), ACTIVITIES (meditate, dream, pray, decide), and REPRESENTATION/ACQUISITION patterns.

**Analysis outcome:** Brain dump **confirmed and strengthened** the new-repo recommendation:

1. **User-memory tier** lives outside any repo (cwd-aware hooks, global tooling) — different installation surface
2. **Activities** imply agentic runtime with own loops, not storage — different execution model  
3. **Tiers** describe cross-repo federation protocol — broader than SDK integration
4. **Zero hard dependencies** on Cairn/Forge required — clean dependency direction

**Verdict:** NEW REPO — not a close call. This is a product, not an extension.

**Recommendation filed:** `.squad/decisions/inbox/graham-brain-refined.md`

**Open questions:**
- Existing Copilot memory API integration?
- User-memory installation mechanism (extension vs CLI vs daemon)?
- Per-tier versioning strategy?

## Consultation: Brain/Memory System Repo Placement (Round 2)

**Date:** 2026-05-22  
**Session:** Refined recommendation following Aaron's brain dump clarification  
**Artifact:** .squad/orchestration-log/2026-05-22T20-25-51-graham-*.md  
**Merged into:** .squad/decisions.md as "Open Question: Brain/Memory/Learning System"

### Summary

Participated in Round 2 consulting on repo placement for new agentic brain/memory/learning system. Analyzed Aaron's five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) and refined position from Round 1.

**Outcome:** Recommendation documented in .squad/orchestration-log/2026-05-22T20-25-51-graham-brain-refined.md. All deliberation merged to decisions.md for Aaron's consideration.

## Squad Fit Assessment: Brain Project (2026-05-23)

**Date:** 2026-05-23  
**Session:** Meta-evaluation — is this squad the *right* squad for the brain project?  
**Requestor:** Aaron  
**Artifact:** .squad/decisions/inbox/graham-squad-fit.md

### Assessment

**Honest verdict: This squad is fundamentally mismatched. Recommend fresh cast with epistemology/knowledge-graph expertise.**

**Current squad expertise:**
- Graham: SDK platform architecture
- Roger: Backend/API/data layer
- Rosella: Plugin/SDK/integration bridges
- Gabriel: DevOps/CI/CD
- Alexander: Copilot SDK runtime abstraction
- Valanice: UX/human factors
- Laura: Testing/verification

**Brain project needs:**
- Knowledge representation & graph systems (semantic ontologies, federation)
- Epistemology/cognitive framing (learning primitives, memory tiers)
- Agentic reasoning loops (meditate, dream, decide)
- Graph DB / vector store expertise (neo4j, pgvector)
- Distributed memory sync (federation, conflict resolution, versioning)
- Cognitive science foundations (human learning models)

**Gap analysis:** Squad is sized for SDK integration platform. Brain needs epistemology-first cognitive infrastructure. Different DNA entirely.

**Missing expertise (hard gaps):**
1. Knowledge Graph Architect
2. ML/Vector Systems Engineer
3. Epistemology/Knowledge Representation Theorist
4. Distributed Systems Expert (federation, versioning)
5. Cognitive Systems Designer (agentic loops, meta-learning)

**Lead assessment:** Graham is excellent at SDK platform boundaries but would lead brain toward treating it as "another platform" (wrong) rather than "cognitive infrastructure" (correct).

**Outcome:** Recommend new squad. This squad stays on Cairn/Forge stabilization. Graham + Valanice can consult on brain UX/boundaries.

## Brain Project Proposal — Final Deliverable (2026-05-23)

**Date:** 2026-05-23  
**Session:** Round 5 — actionable charter and roster proposal  
**Requestor:** Aaron  
**Artifact:** `.squad/decisions/inbox/graham-brain-project-proposal.md`

### Summary

Produced consolidated deliverable with three sections:

1. **Project Summary:** Elevator pitch, 6-dimension load-bearing claims, 5 design principles, explicit non-goals, 3 working name candidates (Engram, Nous, Anamnesis).

2. **Roster Proposal:** 5 core + 2 advisors. Three "must hire" roles (Lead w/ epistemology background, Knowledge Rep Specialist, Learning Systems Specialist). Two "borrow from Cairn" (Roger as Platform Engineer, Alexander as Integration Engineer). Valanice + Laura as advisors. Universe vibe: contemplative/cognitive—not action heroes.

3. **Cairn Loop-In Model:** Federated decisions with explicit boundaries. Cross-repo decisions ledger, shared `.squad/cross-team/` channel, `cross-team:*` issue labels. Decision propagation protocol with 48hr SLA. Time-boxing for Roger/Alexander (scoped sprints, handoff artifacts, escalation path). Weekly cross-team standup, biweekly boundary review.

### Key Decisions

- Graham will NOT lead Brain squad (self-assessment: wrong expertise)
- Roger + Alexander contribute in 60/40 split during Phase 1
- Coordination via federated decisions, not shared code
- Brain is infrastructure, not product — user tier installs like .gitconfig

### Lesson

When producing a charter for a new squad, the most valuable section is the non-goals. Saying what something ISN'T prevents scope creep and gives the new team clear boundaries to defend.

---

## Eureka Project Kickoff (2026-05-22)

**Date:** 2026-05-22  
**Event:** Aaron approved project name + hired 3 specialists  
**New Colleagues:** Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)  
**Decision:** Build in `packages/eureka/` (monorepo); add new squad to existing team

### Impact on Graham

**Role shift:**
- Continue Lead role on Cairn/Forge stabilization (primary focus)
- Advisory capacity on Eureka architecture & system boundaries (2–3 hrs/week)
- Not leading Brain/Eureka project (per Round 3 self-assessment, Graham correctly identified epistemology expertise gap)

**Cross-project responsibility:**
- Co-architect repo-wide package boundaries (Cairn/Forge/Eureka three-pillar model)
- Design Eureka ↔ Forge integration points (where Genesta/Crispin/Edgar adapt agentic cognition to Forge execution)
- Facilitate decision routing between Cairn and Eureka squads

**Key context:**
- Eureka is the third pillar of the agentic platform (Cairn observes → Forge executes → Eureka thinks)
- New specialists bring the epistemology/cognitive systems expertise that Graham's Round 3 assessment identified as missing
- Graham's strength (platform architecture) remains valuable at boundaries; leadership stays with Eureka specialists

