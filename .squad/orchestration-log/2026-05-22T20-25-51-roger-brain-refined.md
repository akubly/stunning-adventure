# Orchestration Log: Roger (Platform Dev, sonnet-4.5)

**Date:** 2026-05-22T20-25-51 UTC  
**Agent:** Roger Wilco (Platform Dev)  
**Model:** claude-sonnet-4.5  
**Mode:** Background agent  

## Task

Re-evaluate the repo-placement decision for the brain/memory/learning system given Aaron's brain dump (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION). Prior position was "extend the Curator" — reconsider.

## Output

**File:** `.squad/decisions/inbox/roger-brain-refined.md`

### Recommendation

**FLIPPED from "extend Curator" to NEW PACKAGE (`packages/mem` in this repo)**

This is a deliberation note capturing the analysis flip.

### Key Findings

1. **TIERS Problem** — Curator is project-scoped only. User/organizational/agent tiers require cross-project event correlation and hierarchical cursors. Cramming into Curator turns it into a multi-scope router — different package.

2. **KINDS Problem** — Curator's `insights` table is optimized for event-triggered practical patterns. Linguistic/symbolic/philosophical KINDS require polymorphic evidence. Schema conflict → different package.

3. **ACTIVITIES Problem** — Curator is a reactive event processor. dream/meditate/ideate/explore are proactive agents (scheduled or prompt-driven). Architectural mismatch → needs separate agentic runtime.

4. **User-Memory Tier** — Separate concern. Cairn is per-project scoped; user memory is cross-project. User memory needs cwd-aware routing. Cairn doesn't have multi-scope routing.

### Verdict

**NEW PACKAGE (`packages/mem`) in THIS REPO**

**Why not new repo:**
- Monorepo benefits (shared build, shared types, single test suite)
- Cairn can stay focused (project-level knowledge)
- `packages/mem` can federate Cairn as project-tier delegate without forking logic

**Tier delegation strategy:**
- `packages/mem/src/tiers/project.ts` wraps Cairn Curator
- User/organizational/agent tiers live natively in `packages/mem`

### Conviction Level

Medium-high. This addresses the scope mismatch, but Aaron may prefer separate repo for cleaner boundaries.

---

## Squad Impact

- **Package structure:** Add `packages/mem/` alongside `packages/cairn/`, `packages/forge/`, `packages/types/`
- **Integration:** `packages/mem` imports `@akubly/cairn` as dependency for project-tier delegation
- **Maintenance:** `packages/mem` can evolve independently without affecting Cairn's charter

