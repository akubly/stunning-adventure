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
