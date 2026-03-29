# Session Log: Brainstorm Round 3 — Platform vs. Plugins Debate

**Date:** 2026-03-28T11:00:00Z  
**Attendees:** Graham (Lead), Roger (Platform Dev), Rosella (Plugin Dev), Gabriel (Infrastructure), Valanice (UX/Human Factors, debut)  
**Duration:** ~60 minutes  
**Decision Outcome:** Converged on "6 plugins, no platform" — ruthless scope cuts, pragmatic go-to-market

---

## Session Overview

Round 3 represented the team's first major architectural pivot. Coming out of R1 (recon mission) and R2 (initial brainstorm), the team had compiled detailed findings on Copilot extensibility, marketplace landscape, and infrastructure best practices. Round 3 forced a decision: **Should we build a custom platform, or distribute via plugins?**

The team converged rapidly and decisively on **plugins + marketplace integration**, with elimination of custom platform abstraction.

---

## Key Debate: Platform vs. Plugins

### The Platform Option (Proposed, Rejected)

**Rationale:**
- Unifies tooling under a single runtime
- Consistent interface across agents, skills, hooks
- Custom quality gates, dependency resolution
- Full control over user experience

**Trade-offs:**
- Adds 6+ months of development
- Requires custom marketplace + distribution
- Creates vendor lock-in
- Increases surface area for security/complexity

### The Plugins Option (Adopted)

**Rationale:**
- Marketplace integration (awesome-copilot, MCP Registry) already exist
- SKILL.md and AGENTS.md are emerging vendor-neutral standards
- Plugin.json (Claude Code spec) for bundling
- Simpler distribution, faster time-to-market
- BYO plugin authoring enabled via compiler

**Trade-offs:**
- No dependency resolution or quality gates
- Hook security surface is broad (runs with full user permissions)
- Simpler format means less abstraction

### Convergence Point

**Graham's leadership decision:** "We're not building a platform. We're building 6 plugins that integrate with awesome-copilot and MCP Registry."

This decision had immediate cascading effects:
1. **Roger** could focus knowledge.db design on cross-session state, not platform state management
2. **Rosella** could define 5 plugin categories + BYO authoring flow instead of plugin runtime
3. **Gabriel** could audit for over-engineering and cut to 4 essential subsystems (Compiler, Plugin Manager, Session Store, Curator Agent)
4. **Valanice** could focus on narrative design for plugin discovery and human engagement

---

## Tensions Explored

### 1. Feature Caps vs. Tracking Everything

**Debate:** Should we limit features like teach-back, memory, /skip tracking to keep the system simple?

**Aaron's directive:** "Don't arbitrarily cap features like teach-back. Track /skip everywhere."

**Resolution:** Track everything; optimize presentation and human preferences at the layer above. Roger's preference cascade handles this.

### 2. Memory MCP vs. Custom Store

**Debate:** Is Memory MCP sufficient, or should we build knowledge.db?

**Roger's finding:** Memory MCP is primitive; SQLite + queryable session state is better.

**Resolution:** Build knowledge.db with skip tracking schema. Queryable session state addresses Aaron's professional need: "Have we run tests yet?"

### 3. Curator Agent Necessity

**Debate:** Is a dedicated curator agent over-engineering, or essential?

**Aaron's directive:** "Need a dedicated curator/custodian agent — always working, processing errors, insights, pruning knowledge."

**Resolution:** Curator Agent is a separate concern from platform/plugins decision; exists regardless. Include in 4 essential subsystems.

### 4. Agent Identity & Persona

**Debate:** How much should we invest in agent identity/persona (like squad does)?

**Aaron's directive:** "Agent Identity is NOT about reinventing squad — focus on natural language interactions. Identity as a deep concern only if we go down that road intentionally."

**Resolution:** Don't reinvent squad; focus on natural language UX. Narrative-first design (Valanice's contribution) handles this.

### 5. Scope Management: Over-Engineering

**Gabriel's honesty:** "We were over-building. Tool guards are over-complicated. Context-splitting patterns are premature."

**Resolution:** Cut tool guards complexity. Keep RCA pipeline for human guardrail guidance. Wait for domain-specific needs before adopting context-splitting.

---

## Valanice's Debut: Human Engagement Deep Dive

Valanice appeared for the first time in Round 3, bringing a structured, narrative-first approach to design decisions.

### Key Contributions

1. **Narrative-First Review** — Every feature should feel like part of a coherent story
2. **Structured Alternatives** — For every choice, present 3+ options with trade-offs; don't anchor
3. **Devil's Advocate Mode** — Explicitly question consensus to prevent groupthink
4. **Observe-First Onboarding** — Watch Aaron interact before prescribing UX
5. **Queryable Session State** — Validated Aaron's requirement; humans need to know "where am I?"

### Narrative Design Principles

- **Progressive Disclosure:** Surface complexity as needed, don't overwhelm
- **Error as Narrative:** Errors explain what happened, why, what to do
- **Preference as Personalization:** User defaults, session overrides, queryable
- **Celebrate Small Wins:** Positive feedback on incremental progress
- **Marketplace as Curation:** Plugin discovery should feel curated, not overwhelming

### Team Sentiment

Team responded enthusiastically to human-centered approach. Acknowledged that technical architecture alone isn't enough — narrative design makes features stick.

---

## Convergence & Alignment

By the end of Round 3, the team had **strong consensus** on:

1. **Plugin-first architecture** — No custom platform
2. **Marketplace integration** — awesome-copilot, MCP Registry
3. **Ruthless scope cuts** — 4 essential subsystems, deferred complexity
4. **Personalization as first-class** — knowledge.db, skip tracking, preference cascade
5. **Narrative-first UX** — Structured alternatives, observe-first onboarding
6. **RCA-informed guardrails** — Human decision-making, not hard-coded rules
7. **Curator agent as separate concern** — Error processing, knowledge pruning

---

## User Directives Integrated

This round successfully incorporated Aaron's directives from the inbox:

| Directive | Integration |
|-----------|------------|
| Decouple squad naming | Plugin-first, natural language interactions (not squad reinvention) |
| Personalization first-class | knowledge.db, preference cascade, /skip tracking |
| Track /skip everywhere | Roger's skip tracking schema, queryable state |
| Memory MCP alternatives | knowledge.db SQLite store, queryable |
| Curator agent needed | Included in 4 essential subsystems |
| Queryable session state | Roger + Valanice: humans can ask "Have we run tests?" |
| Don't over-complicate | Gabriel's simplicity audit, scope cuts to 4 subsystems |

---

## Next Phases

Round 3 established the architectural direction. Next phases will focus on:

1. **Detailed Design** (R4) — Finalize schemas, APIs, authoring guides
2. **Prototype & Validation** (R5) — Build 1-2 plugins, test BYO flow
3. **Curator Agent Deep Dive** (R6) — Error pipeline, knowledge pruning
4. **Human Factors Research** (R7) — Observational study with Aaron, narrative design

---

## Key Artifacts

- `.squad/orchestration-log/2026-03-28T11-00-00Z-graham.md` — Platform vs. plugins decision, scope cuts
- `.squad/orchestration-log/2026-03-28T11-01-00Z-roger.md` — knowledge.db schema, skip tracking, queryable state
- `.squad/orchestration-log/2026-03-28T11-02-00Z-rosella.md` — 5 plugin categories, BYO authoring, adapter pattern
- `.squad/orchestration-log/2026-03-28T11-03-00Z-gabriel.md` — RCA pipeline, simplicity audit, 4 subsystems
- `.squad/orchestration-log/2026-03-28T11-04-00Z-valanice.md` — Narrative design, structured alternatives, observe-first UX

---

## Closing Notes

This round represented a maturation of team direction. Instead of trying to build a unified platform, the team pivoted to a simpler, more pragmatic approach: **distributed plugins integrated with existing marketplaces**. This decision unlocked faster time-to-market, reduced scope, and enabled personalization as a first-class feature.

Valanice's debut brought human-centered design to the conversation, ensuring that technical decisions serve narrative coherence and user engagement. The team's willingness to acknowledge over-engineering (Gabriel's honesty) and cut scope ruthlessly signals mature decision-making.

The next phases will test these architectural decisions through prototyping and validation.
