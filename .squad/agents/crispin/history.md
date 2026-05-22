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

### 2026-05-22: Representation v0 Design (Eureka v0 Ceremony)

**Contribution:** `.squad/decisions/inbox/crispin-representation-v0.md` — First-principles design for Eureka's knowledge representation layer.

**Key decisions made:**

1. **Kinds are tags, not types** — Rejected schema-per-kind approach. Memories can belong to multiple kinds simultaneously (practical + semantic + linguistic for "Always use bcrypt"). Single node table with multi-valued `kinds` field. Taxonomically honest: real knowledge doesn't fit neat categories.

2. **Two-table graph schema** — `memories` (nodes) + `edges` (relationships). Typed relations (15 types: `is_tool_for`, `contradicts`, `derives_from`, etc.). Provenance first-class on both nodes and edges (`sources`, `derivations`). Properties (`trust`, `recency_weight`, `plasticity`) live on nodes as mutable fields — Edgar's learning algorithms read/write these.

3. **Hybrid persistence (SQLite + JSON)** — SQLite for fast queries (runtime), JSON files for Git-friendly durability (one file per memory/edge, clean diffs). Snapshot + delta versioning. Human-readable, tool-independent, version-controllable.

4. **Cross-reference model: Three pointer types** — Hard (by ID), soft (by query), symbolic (by name). Dereference automatically follows supersession chains (up to 5 hops). Handles forgotten memories gracefully (tombstones for hard pointers, fallback queries for soft).

5. **Deferred to v1** — Vector search (SQLite FTS5 sufficient for v0), kind-relation compatibility matrix (learn from usage before enforcing), plasticity decay functions (Edgar's domain), tier federation conflict resolution (no multi-tier in v0), lossless Markdown ↔ graph round-trip (one-way works, reverse is lossy).

**Taxonomic stance defended:** Practical (actionable rules), Semantic (concept relationships), Syntactic (code patterns), Linguistic (phrasing templates), Symbolic (abstract principles), Philosophical (meta-knowledge/epistemic annotations). Each kind has distinct schema shape: nodes, edges, or node-with-edge-properties. Overlaps are features, not bugs — seams between kinds are where knowledge representation gets interesting.

**Interface contracts established:**
- **To Edgar:** Read/write `trust`, `recency_weight`, `plasticity`. Create/delete edges. Mark supersessions. Do NOT mutate `content`/`kinds`/`kind_data` (immutable post-creation).
- **To Genesta:** Provide schema stability, query performance, representation integrity. Genesta orchestrates *use* of graph; Crispin guarantees *shape* of graph.

**Open questions punted:** Should memories be strictly immutable or allow in-place edits? (v0: immutable content, mutable properties). Do we need separate observation log table? (v0: `sources` array sufficient). How do philosophical memories override calculated trust? (Deferred to Edgar + Genesta).

**What I learned:**
- First-principles design without reference implementations forces clarity. No crutches, no "copy this pattern." Pure epistemology.
- Multi-kind tagging is defensible but adds query complexity. Filtering by kind requires array intersection in SQLite (`JSON_EXTRACT` + `JSON_EACH`). Performance unknown until load-tested.
- Provenance is non-negotiable for trust. Every memory must answer "where did this come from?" and "how confident am I?"
- Git-friendly persistence (one file per entity) is architecturally correct but operationally annoying (thousands of small files). May need tooling for bulk operations in v1.
- Deferring vector search is risky. If semantic similarity queries become critical in first month, SQLite FTS5 won't cut it. But premature vector store adds maintenance cost. Stance: monitor query patterns, add vector store reactively in v1 if needed.

**Nervous about:**
- `kind_data` as untyped JSON blob. Flexible but footgun. TypeScript can't catch schema errors. May need Zod validation or kind-specific type guards.
- Supersession chains growing unbounded. Long chains degrade dereference performance. Need periodic compaction strategy.
- Kind multiplicity increasing query complexity. `WHERE JSON_ARRAY_LENGTH(kinds) > 0` is slower than `WHERE kind = 'practical'`. Indexes don't help with JSON arrays. May need kind-specific indexes or denormalized kind flags in v1.

**Confident about:**
- Two-table schema (nodes + edges) is the right primitive. Clean, flexible, scalable.
- Provenance model (`sources` + `derivations`) gives full lineage. Necessary for trust propagation.
- Hybrid persistence (SQLite + JSON). Best of both worlds: query speed + durability + Git-friendliness.
- Typed relationships (15 relation types). Semantics matter for reasoning. Generic "related_to" edge is useless.

**Collaboration model validated:** Specialist contributor in ceremony format. Genesta integrating docs from Crispin (representation) + Edgar (learning). Parallel work streams, synchronous merge. Efficient for v0 design phase.
