# Orchestration Log: Eureka Project Hiring & Onboarding

**Date:** 2026-05-22T20:49:46Z  
**Event:** Eureka project kickoff, 3 new specialists onboarded  
**Requested by:** Aaron  
**Orchestrated by:** Scribe

---

## Summary

Aaron approved the project name **Eureka** and hired 3 new specialists into the existing squad to build `packages/eureka/` — the agentic brain/memory/thinking/learning system. Decision: remain in monorepo (not new repo) to minimize cross-repo coordination overhead.

---

## Project Context

**Project Name:** Eureka  
**Scope:** Agentic brain/memory/thinking/learning infrastructure (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION)  
**Location:** `packages/eureka/` in this monorepo  
**Why Monorepo:** Cross-repo overhead exceeded benefit at this scale (3 new hires, solo orchestrator)

---

## New Squad Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| Genesta | Cognitive Systems Lead (Eureka) | `.squad/agents/genesta/charter.md` | ✅ Active |
| Crispin | Knowledge Representation Specialist (Eureka) | `.squad/agents/crispin/charter.md` | ✅ Active |
| Edgar | Learning Systems Specialist (Eureka) | `.squad/agents/edgar/charter.md` | ✅ Active |

---

## Context

**Background deliberation:**
- Rounds 1–2 of consulting (Graham, Roger, Alexander, Valanice) established repo placement options
- Self-assessment (Round 3) identified expertise gaps: current squad (Cairn/Forge specialists) lacks cognitive systems/epistemology domain
- Aaron's decision: Hire domain specialists into existing squad for Eureka; keep Cairn/Forge core team focused on their domain

**Rationale for monorepo placement:**
- MVP phase benefits from shared build/types/test infrastructure
- New squad members can prototype tier delegation without repo fragmentation
- Extraction to separate repo remains possible in Phase 5+ if org-tier federation needs backend service

---

## Impact on Existing Squad

**Primary squad members (Cairn/Forge continue):**
- Graham Knight (Lead) — advisory role on Eureka architecture (2-3 hrs/week)
- Roger Wilco — continue platform work; optional Phase 1-3 infrastructure consulting
- Gabriel — continue deployment/CI
- Rosella — continue plugin architecture
- Alexander — continue SDK/runtime; potential Eureka ↔ Forge adapter design
- Laura — continue testing; advisory on stochastic/agentic test patterns

**Valanice (UX/Human Factors):**
- Shifted primary focus to Eureka UX/LX design (60% allocation)
- Continue Cairn advisory role (40%)

---

## Files Created

- `.squad/agents/genesta/charter.md` + `.squad/agents/genesta/history.md`
- `.squad/agents/crispin/charter.md` + `.squad/agents/crispin/history.md`
- `.squad/agents/edgar/charter.md` + `.squad/agents/edgar/history.md`
- `.squad/team.md` — updated roster (11 → 14 members)
- `.squad/routing.md` — updated routing logic
- `.squad/casting/registry.json` — added 3 new agents
- `.squad/casting/history.json` — logged hiring event
- `.squad/identity/now.md` — updated focus (Eureka kickoff)
- `.squad/decisions/inbox/copilot-directive-eureka-name.md` — decision directive

---

## Next Steps

1. Merge Eureka hiring decision to `decisions.md` (consolidate with brain/memory deliberation)
2. Update existing members' history.md files with Eureka context
3. Begin Eureka architecture Phase 0 planning
4. Schedule Q&A sync with new hires

---

**Status:** ✅ Onboarding complete. Eureka team ready to start.
