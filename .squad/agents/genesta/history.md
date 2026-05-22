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

### 2026-05-22: Eureka v0 Design Ceremony

**What crystallized:**
1. **Activities are verbs, not nouns.** The key insight: recall/integrate/decide are runtime operations with clear input→output→mutation contracts. This prevents the common trap of treating "memory types" as storage categories instead of active processes.

2. **Recency as gradient, not binary.** Aaron's open question answered: binary loses information, gradient enables decay curves and activity-specific sensitivity. The formula (exponential decay + access-count boost) emerged naturally from wanting both "how old" and "how often" signals.

3. **Philosophical kind needs org-tier override.** This was the hardest call: should user preferences ever override org values? No — org values ARE the normative frame. User philosophical memories are preferences, org philosophical memories are standards. Clear hierarchy.

4. **Default kind = semantic.** When ambiguous, choose the least committal category. Semantic is descriptive, not prescriptive. Easy to promote to practical (when we discover actionability) or philosophical (when we discover normativity).

**What stayed muddy:**
1. **Trust decay over time.** Should unused memories lose trust passively, or only via explicit contradiction? I left this as an open question for Aaron. My instinct: passive decay is dangerous (valuable rarely-used knowledge shouldn't degrade), but explicit-only is also problematic (stale knowledge never gets cleaned up).

2. **Kind inference.** Should Eureka auto-classify? My gut says no (require explicit kind) — but this creates friction. Need usage data to decide.

3. **Activity scheduling.** Time-based vs threshold-based for meditate/dream. Need to see Eureka in use before committing.

**What I owe revisit:**
- Vector embeddings for semantic similarity (deferred pending Crispin's representation work)
- Acquisition sources beyond agent observation (deferred pending Edgar's learning systems work)
- Integrate Crispin/Edgar drops when they ship
