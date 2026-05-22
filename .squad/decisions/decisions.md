# Team Decisions — Cairn Plugin Marketplace

## Index

- [Brain Project Proposal — Name, Roster, Loop-In Model](#brain-project-proposal--name-roster-loop-in-model)
- [Unified Package Scope → @akubly](#unified-package-scope--akubly)
- [Phase 4.5 Brainstorm Round 2 — Aaron's Decisions](#phase-45-brainstorm-round-2--aarons-decisions)

---

## Brain Project Proposal — Name, Roster, Loop-In Model

**Date:** 2026-05-22  
**Author:** Graham (Lead/Architect)  
**Status:** Open for Aaron approval  
**Log:** [2026-05-22T20-37-39-graham-brain-roster-proposal.md](../orchestration-log/2026-05-22T20-37-39-graham-brain-roster-proposal.md)

### Context

Graham delivered a complete charter proposal for the Brain project (agentic memory infrastructure) consolidating Rounds 1–4 deliberation into actionable form.

### Proposal

**Name candidates (pending Aaron's choice):**
- **Engram** — Neuroscience term for memory trace
- **Nous** — Greek for mind/intellect
- **Anamnesis** — Platonic concept of recollection

**Roster structure (pending Aaron's approval):**
- **5 core roles:** Lead (must hire), Knowledge Rep specialist (must hire), Platform Engineer (borrow Roger), Integration Engineer (borrow Alexander), Learning Systems specialist (must hire)
- **2 advisors:** Valanice (UX, 20%), Laura (test, on-call)

**Cairn loop-in model (pending Aaron's acceptance):**
- Federated decisions: Cross-repo decisions ledger with boundary-affecting changes recorded in both repos
- Shared cross-team channel: brain-cairn.md living doc for integration points, open questions, blockers
- 48hr acknowledgment SLA for boundary-affecting changes
- Time-boxing: Roger and Alexander stay primary Cairn, secondary Brain (scoped 1-week sprints, handoff docs, escalation path)
- Sync ceremonies: Weekly standup, biweekly boundary review, end-of-Phase-1 retrospective

### Waiting For

1. Working name selection (Engram | Nous | Anamnesis)
2. Roster shape validation (hire 3, borrow 2, advise 2)
3. Cairn loop-in model acceptance
4. New repo creation greenlight

---

## Unified Package Scope → @akubly

**Date:** 2026-04-24  
**Author:** Roger (Platform Dev)  
**Status:** Adopted  
**Log:** [2026-04-24T23-18-roger.md](../orchestration-log/2026-04-24T23-18-roger.md)

### Context

The monorepo used a mix of `@cairn/*` and `@akubly/*` scopes:
- `@cairn/types`, `@cairn/forge` — used the `@cairn` scope
- `@akubly/cairn` — already used the `@akubly` scope (published to npm)

This inconsistency would block npm publishing for `types` and `forge` since Aaron owns the `@akubly` scope on npm, not `@cairn`.

### Decision

Rename all packages to the `@akubly` scope:
- `@cairn/types` → `@akubly/types`
- `@cairn/forge` → `@akubly/forge`
- `@akubly/cairn` — unchanged (already correct)

### Consequences

- All three packages share one scope, simplifying npm publishing
- Import paths in source and docs updated to match
- Historical docs (decisions.md, agent histories, spikes) intentionally left unchanged to preserve the context in which they were written

---

## Phase 4.5 Brainstorm Round 2 — Aaron's Decisions

**Date:** 2026-05-01  
**Author:** Aaron (via Copilot)  
**Status:** Adopted  

### Context

Phase 4.5 brainstorm Round 2 follow-up decisions on metrics prioritization, exploration budgets, governance structures, and feature discovery.

### Decisions

1. **Metrics priority: Determinism > Token Cost (always)**
   - Aaron's exact words: "determinism is always > token cost. Our goal is to instill confidence in the tools. That's worth investment."
   - This is a foundational priority order for all optimization scoring: determinism first, quality second, tokens third.

2. **Exploration budget: Generous — diminishing returns are worth it at scale**
   - Aaron's reasoning: "Even diminishing returns are worth a one-time cost when scaled out across the entire future of software engineering."
   - The investment in experimentation pays off because optimized artifacts are portable — they benefit every future user.

3. **Human approval gates → Inception-style recursion: DBOM on prescription decisions**
   - Aaron's insight: "Do we need heuristics and DBOM on prescription *decisions*?"
   - This is a meta-observation: the Prescriber ITSELF makes decisions. Those decisions should be tracked with the same rigor as session decisions — decision records, alternatives considered, provenance. The feedback loop is self-referential: optimize the optimizer.

4. **Multi-artifact optimization → Feature suite discovery**
   - Aaron identifies a suite of features hidden in transfer learning:
     - Support for collections of skills (plugins as bundles)
     - How model selection affects skill pairings
     - Optimize contents of one skill in the presence of other plugins
     - Cross-skill interaction effects (skill A's optimization depends on which other skills are active)

5. **Data retention tradeoffs: Needs exploration (no decision yet)**
   - Aaron wants to explore the tradeoffs before committing to a retention policy.

6. **Round 2 wild cards approved for backlog:**
   - Time-travel debugging via ancestry (Rosella)
   - Predictive cache warming (Rosella)
   - Adaptive instrumentation (Alexander)

### Consequences

- Team has clear prioritization: determinism above cost considerations
- Authorization given for sustained exploration investment across future optimization cycles
- Prescriber governance now includes decision tracking on its own choices (recursive DBOM)
- Three feature areas identified for backlog prioritization and skill pairing research
- Data retention policy deferred for exploratory analysis
