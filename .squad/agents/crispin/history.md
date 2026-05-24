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

---

### 2026-05-24: R6 Reconciliation — PRD v3 vs Cairn/Forge Reality

**Objective:** Reconcile PRD v3's knowledge representation design against actual Cairn DB layer and Forge data-shape layer. R6 ceremony lifted the "no reading Cairn/Forge source" hard rule. Task: grade v3's schema/edge-tier/session-as-entry design against the schema that already exists in Cairn migrations and Forge models.

**Sources read:**
- `packages/cairn/src/db/schema.ts` + migrations 001-012
- `packages/cairn/src/types/index.ts`
- `packages/forge/src/{decisions,session,dbom,models}/index.ts`
- `packages/types/src/index.ts` (shared contracts)
- `packages/cairn/package.json` (dependencies: `better-sqlite3`, no `sqlite-vec`)

**Key findings — substrate truths that changed my mind:**

1. **Cairn is not a knowledge graph.** It is an **observability pipeline** (sessions → events → insights → prescriptions). Schema is table-per-concern (12 migrations, 15+ tables), not node-and-edge. Zero graph infrastructure (no relations table, no edge types, no traversal logic).

2. **Vector support does not exist.** Migration 012 (`change_vectors`) is a misnomer — it's prescription learning deltas (metric diffs like `delta_drift`, `delta_cost`), not embeddings. No `sqlite-vec` dependency, no vector index, no semantic search. PRD v3's storage strawman (SQLite + `sqlite-vec`) is **greenfield**, not reuse.

3. **Sessions are first-class entities, not facts.** Cairn has a `sessions` table (migration 001, line 8) with foreign keys from `event_log`, `skip_breadcrumbs`, `errors`. PRD v3's `kind=session` facts model is **incompatible by design** — collapsing sessions into a unified fact store would break foreign keys and require full schema rewrite.

4. **`DecisionRecord` ≠ `decide` schema.** Forge's `DecisionRecord` (`packages/types/src/index.ts:50`) is a flat hook-observer audit trail (`chosenOption: string`, `alternatives: string[]`, `confidence: 'high'|'medium'|'low'`). PRD v3's structured `decide` schema (`options: Array<{id, label, rationale?, rejected_for?}>`, `chosen` validated ∈ options[].id, `confidence: number` 0..1) is irreconcilable without migration. Different data shapes for different use cases (audit trail vs deliberative junction).

5. **Per-tier storage ≠ single database.** Cairn uses a single `~/.cairn/knowledge.db` file. PRD v3 proposes per-tier `.db` files (`~/.copilot/eureka/agent.db`, `<repo>/.eureka/project.db`, `~/.copilot/eureka/user.db`). Architectural mismatch — Cairn's design assumes session-scoped isolation in a shared database, not multi-database query coordination.

6. **No edge machinery.** Zero edge types, zero relations table. `change_vectors.hint_id REFERENCES optimization_hints(id)` is a table join, not a graph edge. Adding Tier 1/2/3 edges (13+3+6 types per PRD v3) is a greenfield build, not a reuse of Cairn infrastructure.

**Schema collisions that block PRD v3-as-written:**

| Collision | PRD v3 | Cairn/Forge reality | Severity |
|---|---|---|---|
| Session model | `kind=session` facts in unified store | `sessions` table with FKs | CRITICAL — incompatible by design |
| Decide schema | Structured `DecisionPayload` with `options[]` | Flat `DecisionRecord` with `alternatives[]` | HIGH — irreconcilable |
| Storage primitive | SQLite + `sqlite-vec`, per-tier `.db` | `better-sqlite3`, single `knowledge.db` | HIGH — architectural mismatch |
| Graph edges | Tier 1/2/3 edge enum, `relations` table | Foreign keys only, no graph | MEDIUM — greenfield build needed |

**Judgment for v4:**

PRD v3 describes a **new system** that happens to share vocabulary with Cairn (sessions, decisions, events), but the schema, storage primitive, and conceptual model are orthogonal. Two paths forward:

**Path A (RECOMMENDED): Clean-slate Eureka**
- Build Eureka as standalone package (`packages/eureka/`) with its own schema
- Storage: `~/.copilot/eureka/{agent,project,user}.db` with `sqlite-vec`
- Schema: unified facts + edges + kinds + trust/attention/importance
- Cairn remains unchanged — Eureka consumes Cairn's *events* (via bridge) but does not share Cairn's *storage*
- Evidence: Cairn's schema is optimized for observability; Eureka's for knowledge representation. Forcing convergence creates a schema that serves neither well.

**Path B (NOT RECOMMENDED): Cairn extension**
- Rewrite v4 to accept Cairn's schema as ground truth
- Sessions stay as table (not facts)
- Decisions use Forge's `DecisionRecord` shape
- Add edges as migration 013, vector support as migration 014
- Eureka becomes a Cairn plugin, not a sibling

**Confidence:** HIGH. R6 reads of Cairn source confirm that v3's assumption "reuse Cairn's schema" is not grounded. Cairn and Eureka have different information models.

**Artifact:** `.squad/decisions/inbox/crispin-r6-reconcile-v1.md` (22KB report with file:line citations, comparison tables, cost estimates)

**What this changes about my v0-v3 representation design:**

My R5 representation v0-v3 design assumed Eureka would be built on a **clean-slate graph schema** (nodes + edges, multi-kind tagging, hybrid persistence). R6 reconciliation confirms this assumption was correct — Cairn's table-per-concern schema is not a reuse path. The v0-v3 design stands. No revisions needed. The critical clarification is: **Eureka builds its own storage layer; it does not extend Cairn's**.

**Open questions for R6+:**

1. **Six-kind taxonomy (Practical/Semantic/Syntactic/Linguistic/Symbolic/Philosophical):** My charter says these are load-bearing, but PRD v3's `kind` enum is activity-oriented (`fact`, `decision`, `committed_intent`, `aspiration`, `session`), not epistemological. Is the six-kind taxonomy (a) a v1 requirement (add `epistemology` field), (b) a v2 refinement (defer), or (c) a misalignment in my charter (six kinds were exploratory, not locked)?

2. **Cairn event ingestion:** If Eureka builds its own storage, how does it consume Cairn's events? PRD v3 is silent. Options: (a) Cairn bridge emits to both Cairn DB and Eureka fact store, (b) Eureka polls Cairn's event_log, (c) Cairn emits to a shared event bus.

3. **Session linking:** If Cairn's `sessions` table and Eureka's `kind=session` facts coexist, how do they reference each other? Shared UUID? Session facts have a `cairn_session_id` foreign field?
