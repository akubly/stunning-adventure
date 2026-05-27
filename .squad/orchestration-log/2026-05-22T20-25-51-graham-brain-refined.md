# Orchestration Log: Graham (Lead, opus-4.5)

**Date:** 2026-05-22T20-25-51 UTC  
**Agent:** Graham Knight (Lead / Architect)  
**Model:** claude-opus-4.5  
**Mode:** Background agent  

## Task

Evaluate Aaron's brain/memory/learning system against the five dimensions (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) to refine the repo-placement decision from round 1.

## Output

**File:** `.squad/decisions/inbox/graham-brain-refined.md`

### Recommendation

**NEW REPO** — not a close call.

### Key Findings

1. **Knowledge TIERS (agent→org→project→user)** — USER-MEMORY tier is cross-repo, cwd-aware infrastructure. This argues for separate repo.
2. **Knowledge ACTIVITIES (dream, meditate, pray)** — These are active verbs implying background loops. Brain is a runtime system with control loops, not a library. Orthogonal to Cairn's event model.
3. **Knowledge KINDS (Practical, Semantic, Syntactic, Linguistic, Symbolic, Philosophical)** — This is a knowledge ontology. Cairn's types (`CairnEvent`, `Prescription`, `DBOM`) don't overlap. Different bounded context.
4. **Knowledge PROPERTIES (recency, trustworthiness, plasticity)** — Learning primitives for memory mutation. Cairn's Curator detects patterns; doesn't mutate long-lived memory. Different data lifecycle.
5. **Knowledge REPRESENTATION & ACQUISITION** — Implies graph + document store + versioned persistence. Cairn uses SQLite + event log. Different storage model.

### Verdict

The brain system is:
- A **product**, not a Cairn extension
- A **runtime**, not a library
- **Cross-repo** scoped, not per-project
- **Zero hard dependencies** on Cairn/Forge

Recommended name: `@akubly/cortex` or `@akubly/cognition`

### Conviction Level

High. The five-dimension expansion confirms that this is fundamentally different from "Cairn extension."

---

## Squad Impact

- **Coordination:** Dedicated squad with different specialists (knowledge graphs, learning systems, cwd-hooks)
- **Timeline:** Separate from Cairn/Forge phases
- **Integration:** Clean direction: brain → @akubly/types (optional), brain → @akubly/cairn (optional)

