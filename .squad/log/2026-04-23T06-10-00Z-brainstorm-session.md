# Brainstorm Session Log: 9 Ideas for Cairn Future

**Session ID:** 2026-04-23T06-10-00Z-brainstorm-session  
**Date:** 2026-04-23  
**Time:** 06:10:00 UTC  
**Participants:** Graham Knight (Lead/Architect), Roger Wilco (Platform Dev), Rosella Chen (Plugin Dev), Valanice (UX/Human Factors)  
**Facilitator:** Aaron Kubly

---

## Session Overview

Team brainstormed 9 ideas for the future of Cairn and agentic software engineering:

1. **Compiler metaphor** — Map Cairn to compiler phases (Archivist=trace, Curator=lint, Prescriber=autofixe)
2. **Agents spawning agents** — Runtime delegation model for agentic composition
3. **Sensory pervasion** — Expanded event types and signal channels
4. **Decision chain data model** — Content-addressable audit trail of decisions
5. **Slop detection** — Quality scoring and upstream failure detection
6. **Token cost tracking** — FinOps instrumentation and budget management
7. **LX design principles** — Treat harness as LLM UX with Nielsen-parallel heuristics
8. **OOP for agentic concepts** — Type hierarchy, factories, inheritance for skills/agents
9. **Organizational paradigms** — Map Cairn agents to org roles (Scribe, QA, Tech Lead, etc.)

---

## Key Convergent Themes

### Theme 1: Decision Chain as Phase 9 Candidate

Graham and Roger both identified the **Decision Chain data model** (Idea #4) as the highest architectural priority. Content-addressable decisions with parent-child linking create an immutable audit trail critical for understanding agent behavior and human oversight.

**Convergence:** Both agreed this is production-ready design, could be Phase 9 scope, requires new `decisions` table but no risky refactoring.

### Theme 2: LX Heuristics Checklist

Valanice's 10 LX Heuristics provide a **design evaluation framework** for all future MCP tools. The team recognized Cairn already implements LX-1 (visibility of state via pull-based tools). The heuristics should guide future tool design.

**Convergence:** Lightweight design gate, non-blocking, high signal-to-noise for evaluating new features.

### Theme 3: Cairn = Debugger Boundary

All four agents converged on the framing: **Cairn is not the compiler, but the runtime instrumentation + debugger**. This clarifies what Cairn owns (observability, correction, analysis) and what it doesn't (agent execution, model selection, prompt tuning).

**Convergence:** Boundary is clear; should be formalized in architecture documentation.

---

## Deferred Ideas (Future Investigation)

- **Agents spawning agents (#2):** Requires execution model Cairn doesn't own; defer until harness architecture is clearer
- **Sensory pervasion depth (#3):** Already our direction; Tier 1 signals can start today via `event_log` expansion
- **Token cost tracking (#6):** Data pipeline problem requiring harness instrumentation not yet exposed; coordinate with platform team
- **OOP inheritance (#8):** ParsedSkill and Prescription patterns exist; formalize without rushing

---

## Immediate Next Steps

1. **Decision Chain prototype** — Graham to design schema and migration strategy
2. **Tier 1 signal expansion** — Roger to scope immediate event types for curator
3. **LX checklist adoption** — Valanice's heuristics to be integrated into feature design template
4. **Architecture boundary doc** — Formalize "Cairn=debugger" framing in design docs

---

## Outcomes

All brainstorm proposals written to `.squad/decisions/inbox/` for team review. No binding decisions in this session; all are marked "Proposed" for discussion phase.

**Total artifacts:** 4 deep-dive analyses (graham-brainstorm-vision, roger-brainstorm-platform, rosella-brainstorm-extensibility, valanice-brainstorm-lx)
