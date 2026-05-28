# Orchestration Log: crispin-knowledge-rep

**Agent:** Crispin (Knowledge Representation Specialist)  
**Model:** claude-sonnet-4.5  
**Mode:** Parallel (Round 1)  
**Session:** Eureka v0.1 Technical Design — Round 1  
**Date:** 2026-05-27 08:13:25Z  

## Files Produced

| File | Status | Size (KB) | Purpose |
|------|--------|-----------|---------|
| `docs/eureka/sections/20-knowledge-representation.md` | ✅ Created | 21.3 | §20: Schema, fact model, relation types, edge semantics, graph traversal |
| `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` | ✅ Created | 16.2 | KR-level overlap analysis: naming collisions, schema convergence, alignment opportunities |

**Total authorship:** ~37.5KB (section + decision memo)

## Key Outcomes

1. **Fact schema locked** — §20 specifies:
   - **Fact node:** `{id, kind, session_id?, content, trust, importance, attention, created_at, updated_at}`
   - **Relation edge:** `{from_id, to_id, edge_type, weight, confidence, created_at}`
   - **Supported edge types:** derived_from, references, contradicts, supersedes, part_of, instance_of, precedes, defined_in, decided_by, committed_in, originated_in, modified_in, referenced_in (13 types)
   - **Fact kinds:** session, integration, decision, learned_pattern, observation_summary (5 kinds v1)

2. **Graph traversal semantics defined** — §20 clarifies:
   - Tier 1 relations (agent-tier edges, fully wired in M1)
   - Tier 2 relations (user-tier edges, deferred to M2+)
   - Tier 3 relations (project-tier edges, deferred to M2+)
   - Relation weights (0..1 confidence, edge strength)
   - Query patterns (fan-out, depth-bounded DFS, constraint-aware traversal)

3. **Fact kinds and lifecycles** — §20 maps kinds to activities:
   - `kind=session` → integrate activity (manual, human-driven)
   - `kind=integration` → integrate activity (session content absorption)
   - `kind=decision` → decide activity (structured deliberation, FR-10 payload)
   - `kind=learned_pattern` → sweep activity (derived from contemplation)
   - `kind=observation_summary` → recall activity (cache of search results)

4. **Crucible KR overlap analyzed** — Two critical collisions:
   - **"Decision" naming collision (CRITICAL):** Crucible's Decision primitive (any recorded choice) vs Eureka's kind=decision fact (structured deliberation with options/rationale). Both use same word, incompatible semantics.
   - **"Artifact" semantic drift (HIGH):** Crucible Artifact = reviewable content (input + output); Eureka "artifact" = memory representation of session. If both store in content-addressed stores, namespace collision likely at v2.

5. **Schema stability assessment** — §20 validates:
   - Fact schema is stable for v1 (no breaking changes anticipated)
   - Edge types may expand (add new relation semantics) but existing types are frozen
   - Kind enumeration is extensible (new kinds in v1.5+ don't break existing facts)
   - Trust/importance fields are append-safe (values evolve, schema doesn't)

## Tensions Raised

1. **"Decision" naming collision (CRITICAL)** — Both Crucible and Eureka use "Decision" but mean different things:
   - **Crucible:** Any recorded choice by human or agent (broad, primitive #1)
   - **Eureka:** Structured deliberation with explicit options and rationale (narrow, kind=decision fact)
   - **Forge:** DecisionRecord audit-shaped flat record (hybrid: can represent Crucible Decision, but Eureka's schema is richer)
   - **Recommendation:** Crucible rename to ChoiceEvent; Eureka avoid "artifact" in public API to prevent downstream collisions

2. **"Artifact" semantic drift (HIGH)** — Crucible Artifact (content blob) vs Eureka's informal "artifact" (memory representation):
   - If Crucible ships content-addressed Artifact store (v1 scope, §A.2 CAS)
   - And Eureka ships fact content-addressing (v2, pending decision on dedup strategy)
   - Namespace collision is inevitable
   - **Recommendation:** Clarify Eureka's v2 content-addressing strategy now; coordinate naming with Crucible

3. **SessionId as only shared primitive (VERIFIED)** — §20 confirms SessionId is the load-bearing integration point:
   - Cairn sessions.id = Eureka session-fact session_id = Copilot CLI UUID
   - Type-level construct (no runtime FK, per FR-7.2 no-cross-DB-ATTACH)
   - Both systems must use identical UUID v4 validation logic
   - **Action:** Freeze validation rules in @akubly/types (per Genesta's A2 amendment)

4. **Cross-reference model mismatch (v2+ concern)** — Crucible's read-set hash (opaque, for replay) vs Eureka's edges (traversable, typed):
   - Crucible's "why did this decision happen?" query = hash-based lookup (replay verification)
   - Eureka's "why did this decision happen?" query = graph traversal (semantic causality)
   - **Not a v1 blocker, but a known v2 gap:** If Crucible asks Eureka for decision rationale, the models don't compose

## Cross-Section Dependencies

- Depends on: 
  - **§00 (Graham)** for schema version/stability guarantees
  - **§10 (Genesta)** for activity-to-fact-kind mapping
  - **Crucible PRD analysis** (cross-project, not cross-section)

- Enables:
  - **Roger (§40)** — relation types fixed; BM25 indexing strategy can be finalized
  - **Laura (§50)** — schema stability allows testability planning
  - **Cassima (§70)** — PRD alignment can reference fact schema frozen

- Blocks: None (ready for team feedback)

## Liaison Notes

- **Fact schema locked:** 5 fact kinds, 13 edge types, stable for v1
- **Crucible KR analysis forwarded:** Two critical collisions (Decision naming, Artifact drift) sent to Aaron + Genesta for cross-project reconciliation
- **SessionId confirmed as shared primitive:** Validation rules must be frozen in @akubly/types (per Genesta A2)
- **v2 gap identified:** Cross-reference model mismatch (hash vs edges) is not a v1 blocker but should be tracked for future coordination

---

**Signed:** Crispin  
**Confidence:** HIGH on §20 schema; HIGH on overlap analysis; MEDIUM on v2 bridge timing (depends on Crucible v1 release timeline)  
**Next step:** Round 2 assembly (parallel) + await Aaron's decision on Crucible repo topology and naming reconciliation
