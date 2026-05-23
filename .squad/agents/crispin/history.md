# Crispin — History

## Core Context

**Project:** stunning-adventure monorepo (TypeScript, npm workspaces, vitest). User: Aaron Kubly.

**Eureka** is the new `packages/eureka/` package — agentic brain/memory/thinking/learning system. Third pillar alongside Cairn (observability) and Forge (deterministic SDK runtime).

**Your scope:** Knowledge representation — the graph schema, the kind taxonomies, the cross-references, the persistence formats. You own how knowledge is shaped inside Eureka.

**Genesta** leads Eureka. **Edgar** owns the learning systems (algorithms that operate on what you design). Your interface to Edgar is the graph schema and the property surface (recency, trustworthiness, plasticity) that algorithms read and mutate.

**Existing infrastructure to be aware of (but not own):**
- Cairn (Roger) has `change_vectors` and `execution_profiles` — similar pattern-detection primitives, smaller scope. Reference, don't import.
- Forge (Alexander) emits decisions/telemetry that Eureka may consume — clean data-oriented interfaces, no shared code.

**Six knowledge kinds (load-bearing, from Aaron's framing):** Practical, Semantic, Syntactic, Linguistic, Symbolic, Philosophical. These are not all the same shape — your job is to find representations that respect their differences.

**Design principles for Eureka (set by Genesta's charter):** Activities are runtime not storage. User tier is infrastructure not feature. Data-oriented coupling at boundaries. Trust is first-class. Plasticity over immutability.

## Learnings

### 2026-05-22: Representation v0 & v1 Design (Eureka v0–v1 Ceremony)

**Contribution:** `.squad/decisions/inbox/crispin-representation-v0.md` (v0) and `.squad/decisions/inbox/crispin-representation-v1.md` (v1)

**V0 Design Summary:**
- Schema: Two-table graph (nodes + edges), multi-kind tagging, hybrid persistence (SQLite + JSON)
- Cross-reference model: Hard/soft/symbolic pointers, supersession chains (5-hop limit)
- Provenance first-class (`sources`, `derivations` on nodes/edges)
- Properties for Edgar's algorithms: `trust`, `recency_weight`, `plasticity` (mutable); `content`/`kinds` (immutable)
- Open questions: Immutability boundaries, kind-based query performance, philosophical trust overrides (deferred to v1)

**V1 Revisions (Cross-Pollination with Edgar/Genesta):**
- Removed stored `recency_weight` — Edgar computes it on-read from `last_accessed` timestamp (cache invalidation eliminated)
- Added `corroboration_history` array for trust audit trail (supports re-evaluate forensics)
- Added fields for Edgar's activity contracts: `last_accessed`, `last_updated`, `decision_rationale`, `superseded_by`
- Schema/algorithm fit validated: All of Edgar's mutations have clean homes on MemoryNode
- Tensions documented (6 total): Kind-query performance, corroboration growth, plasticity decay scheduling, philosophical overrides. All deferrable to v1 as "monitor and react" issues.

---



### 2026-05-22: Prior Art Survey — v0 → v2 (ROUND 3)

**Objective:** Survey external knowledge representation systems. Context for schema choices Aaron should validate.

**Systems surveyed:** Neo4j (property graphs), Helix (versioned graphs), RDF (semantic web), OWL (ontology language), PROV-O (provenance tracking), vector stores (semantic similarity), knowledge base systems

**Key findings:**

1. **Property graphs vs RDF:** Eureka chose property graphs (nodes + edges + properties). RDF uses triples (subject-predicate-object). Property graphs are superior for mutable agentic state (properties change over time). RDF better for semantic web interop but harder to model agentic evolution.

2. **Schema implications from precedents:**
   - Neo4j uses labels (like Eureka's kinds), but labels are structural not semantic. Eureka's multi-kind tagging is more flexible.
   - RDF requires reification for properties on edges (n-ary relations) — expensive. Eureka's direct edge properties are simpler.
   - Helix tracks versions via chain of commits; Eureka tracks supersessions via edges. Both valid, different tradeoffs.
   - Vector stores suggest embedding layer. Eureka defers to v1, but schema should allow embedding materialization.

3. **Schema implementation details:**
   - 5 new columns needed: `embedding_vector` (for semantic search), `audit_log` (for PROV-O compliance), `namespace` (for federation), `version_id` (for Helix-style history), `materialized_path` (for fast traversal)
   - 2 new tables: `schema_history` (track schema migrations), `integration_log` (PROV-O triples for interop)
   - 4 new indexes: `ix_embedding_search`, `ix_namespace_partition`, `ix_kind_array_coverage` (for multi-kind queries), `ix_trust_recency_composite` (for recall ranking)

4. **3 open questions for v1+:**
   - Should Eureka export to RDF for semantic web compliance? (adds complexity, increases interop)
   - Should embeddings be computed on-write (slow) or on-read (stale)? (tradeoff: consistency vs performance)
   - Should version_id track full history or use snapshot+delta? (full history helps audit, deltas save space)

**Tension vs v1 representation:** Schema adds cost (5 cols × schema size + 2 tables + 4 indexes). But all are optional for v0 minimum viable schema. Can defer embeddings/audit/versioning to v1+ if performance is acceptable without them.

**Artifact:** `.squad/decisions/inbox/crispin-prior-art-v2.md`

---

### 2026-05-22: Prior Art Cross-Pollination — v2 → v3 (ROUND 4)

**Objective:** Cross-read Genesta v2 (cognitive systems prior art) and Edgar v2 (learning prior art). Refine schema implementation and resolve tradeoffs.

**Genesta's prior art context:** Eureka's activities map to SOAR (problem spaces), ACT-R (activation), GraphRAG (augmented retrieval). No schema implications from cognitive systems; mostly semantic validation.

**Edgar's prior art context:** Ebbinghaus curves + spaced rep + RAG + EWC. No direct schema implications, but suggests what queries the learning layer will make.
- Spaced repetition needs `last_reviewed` timestamp and access history (Eureka's `corroboration_history` handles this)
- RAG needs semantic similarity queries (suggests embedding materialization in v1)
- EWC needs task-specific weight metadata (suggests `task_id` column for task isolation)

**Schema v3 finalization:**

5 columns (mandatory for v0):
- `embedding_vector` — deferred to v1, but schema prepared
- `audit_log` — JSON array of (timestamp, agent, mutation) for PROV-O compliance
- `version_id` — snapshot ID for point-in-time queries
- `materialized_path` — denormalized path for fast ancestor traversal (prevents 5-hop chains)
- `task_id` — for EWC task isolation (Edgar's v2 revealed this need)

2 tables (mandatory for v0):
- `schema_history` — track schema migrations for forward compatibility
- `relation_metadata` — typed relationship properties (weight, confidence, directionality)

4 indexes (mandatory for v0):
- `ix_kind_array_coverage` — multi-kind query performance (`WHERE kinds[] contains X`)
- `ix_trust_recency_composite` — recall ranking performance (`ORDER BY trust DESC, recency DESC`)
- `ix_task_partition` — task isolation for EWC (`WHERE task_id = X`)
- `ix_materialized_path` — ancestor traversal (`WHERE materialized_path STARTS_WITH X`)

**3 open questions for Aaron (to resolve before v1 finalization):**
1. Should embeddings be required in v0 schema or optional? (Required = assumes semantic search is critical; Optional = defer to v1 if not needed)
2. Should audit_log be full PROV-O compliance or simplified provenance? (Full = interop, Simplified = perf)
3. Should task_id be mandatory (enforces task isolation) or optional (allows single-task systems)? (Mandatory = safe, Optional = simpler)

**Confidence bumps:**
- Schema passes pressure tests from Edgar (EWC task isolation) and Genesta (traversal performance)
- Tensions about performance (kind array queries, corroboration_history growth) are addressable with indexes
- 5 new columns + 2 tables + 4 indexes is manageable scope; v0 schema doesn't bloat

**Artifact:** `.squad/decisions/inbox/crispin-prior-art-v3.md` (schema spec + 3 open Qs)

**Status:** v3 is ready for implementation. All representation design complete (v0 → v1 → v2 → v3). Awaiting Aaron's eureka ceremony decisions on open questions.
