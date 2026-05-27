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

---

## Crucible/Eureka Shared-Substrate Revision Round

**Date:** 2026-05-26  
**Authors:** Aaron (directives) + Genesta (architecture) + Cassima (PM)  
**Status:** Accepted (decision gates remain pending)  
**Inbox References:**
- [copilot-directive-2026-05-26-shared-substrate.md](./inbox/copilot-directive-2026-05-26-shared-substrate.md)
- [genesta-shared-substrate-revision.md](./inbox/genesta-shared-substrate-revision.md)
- [cassima-shared-substrate-revision.md](./inbox/cassima-shared-substrate-revision.md)

### Context

Genesta and Cassima conducted a four-agent overlap analysis (Genesta/Crispin/Edgar/Cassima memos on Crucible PRD vs Eureka PRD) to coordinate two simultaneous v1 implementations. The analysis identified shared substrate hazards and recommended three coordination gates. Aaron's response dissolved one non-problem and clarified three scope directives, requiring revisions.

**Key clarification:** `D:\git\mem` and `D:\git\harness` are two working copies of the same git repo (`akubly/stunning-adventure`), not separate repos. Cairn/Forge/Types are therefore NOT duplicated — they are single sources, shared by topology.

### Aaron's Directives (Adopted)

1. **Same repo topology.** The "cross-repo ownership crisis" in earlier overlap memos was an artifact of analyzing two clones as if they were separate repos. This is DISSOLVED — not a real problem.

2. **Plan to share Cairn/Forge/Types from the start.** Both Crucible and Eureka will consume the same packages as shared substrate. Design decisions in either project must account for the other consuming the same code. No parallel/duplicate implementations.

3. **Separate v1s.** Crucible v1 and Eureka v1 ship as independent products. Integration (e.g., Eureka consuming Crucible's WAL) is v1.5+ work, not v1.

4. **Dogfood timing open.** Whichever ships first gets dogfooded first. No predetermined sequence.

### Revised Architectural Gates (Genesta)

| Gate | Status | Owner | Blocker? |
|------|--------|-------|----------|
| **G4: Coordination Protocol** | CRITICAL (NEW) | Graham + Cassima + Genesta | YES (sprint 2) |
| **G1: Event Schema Co-Design** | Unblocked | Roger + Graham | NO (can parallelize) |
| **G2: SessionId Brand** | CLOSED | Cassima | NO |
| **G3: Decision Schema Bridge** | Unblocked | Cassima + Graham | NO (sprint 3) |

**G4 (NEW — TOP CONCERN):** When Crucible changes `packages/cairn`, `packages/forge`, or `@akubly/types`, Eureka must know. Shared-from-start directive moves substrate changes from "architectural planning" to "sprint-2 coordination risk." Solution: (a) shared CHANGELOG per package with `[Crucible]`/`[Eureka]` prefixes, (b) GitHub label `shared-substrate` triggers dual-Lead review, (c) pre-merge Slack handoff in shared channel, (d) breaking changes require 15-min sync before PR opens. Status: unblocked (design ready, tooling is <1h). This is operationally load-bearing before sprint 2.

**G1 (REVISED):** Single `events` table with discriminator column and `EventType` enum (namespace convention: `crucible:request`, `eureka:recall`, etc.). Design is ready; gate is 15-min sync before sprint 2 to lock namespace.

**G2 (CLOSED):** `SessionId` brand is Eureka v5 R8, already in `@akubly/types`. Crucible imports as-is. No collision, no redefinition needed.

**G3 (STILL REAL):** Crucible `Decision` primitive must emit Forge `DecisionRecord` at write time (bridge pattern) so Eureka Path 2 adapter can learn from Crucible sessions. Gate is 15-min sync before sprint 3 to review Forge API surface.

### PM Stance Revision (Cassima)

**Eureka v1 scope unchanged:** All 4 user stories (US-1 through US-4) and 14 functional requirements ship per v5-final spec (617 lines, R8 LOCKED). Crucible being a sibling does not change Eureka's v1 deliverables.

**Dogfood timing:** Aaron's directive allows either ship first. **Cassima's recommendation: Eureka second.** Rationale: (1) Crucible's v1 success bar is existential (months-long bootstrap loop); Eureka's is incremental (2-session validation). (2) If Crucible ships first, Eureka's US-1 "familiarization" trains on real Crucible WAL (higher fidelity). (3) If Eureka ships first, it trains on Copilot CLI logs (ephemeral). Crucible-first de-risks both projects. Parallel dogfood viable but higher-friction (context-switching tax, merge conflicts, tool-boundary confusion during v1 coexistence).

**Coordination cost:** Schema freeze gates + async memos (no recurring syncs). Graham is cross-project schema czar; locks SessionId, Cairn sessions table, Forge DecisionRecord before implementations start. Substrate changes require Graham sign-off via `.squad/decisions/inbox/` memos (Genesta/Crispin → Graham for Eureka changes; Alexander/Roger → Graham for Crucible changes). Genesta + Roger coordinate DB migrations; Crispin + Alexander coordinate dependency bumps. Coordination overhead: <30min/week.

### Key Learning

**Shared-from-start is architecturally simpler than extract-later** (no migration), but operationally requires active coordination. **G4 protocol is the price of parallel dev on shared substrate.** Without it, one team breaks the other mid-sprint. With it, coordination cost is <30min/week. Front-loading the hard decisions prevents expensive retrofits.

### Consequences

- ✅ Forge ownership crisis DISSOLVED (same repo, no duplication/drift)
- ✅ Separate v1s CONFIRMED (Crucible records, Eureka learns; both standalone)
- ✅ G2 SessionId CLOSED (import existing type, no collision)
- ✅ G1/G3 UNBLOCKED (design ready, need coordination syncs)
- ⚠️ G4 CRITICAL: Graham must configure `shared-substrate` label + Slack webhook this week
- ⚠️ Aaron owes: schema freeze approval + dogfood timing call

### Open Aaron Actions (Pending)

1. **Schema freeze approval.** Graham drafts freeze doc (SessionId, Cairn sessions, Forge DecisionRecord); Aaron reviews + approves. Both Eureka and Crucible implementation blocks until freeze lands. **ETA:** This session.

2. **Dogfood timing call.** Option A (Crucible first — Cassima's rec), B (Eureka first), or C (parallel). **ETA:** This session.
