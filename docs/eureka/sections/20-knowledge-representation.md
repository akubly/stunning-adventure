# 20. Knowledge Representation

**Authors**: Crispin (lead), Graham, Genesta, Edgar, Roger, Laura, Valanice  
**Status**: DRAFT  
**Version**: v5-final alignment  
**Last Updated**: 2025-06-15

---

## 1. Overview

This section defines the formal knowledge representation model for Eureka — the graph schema, kind taxonomy, property shapes, persistence formats, query interfaces, and integration points with the broader mem ecosystem (Cairn, Crucible, Forge). The representation must serve dual purposes: **operational** (support runtime recall, sweep operations, attention management) and **epistemological** (enable reasoning about what the agent knows, how it knows, and why it matters).

**Key design principles:**

1. **Schema flexibility**: Facts use a discriminated union via `kind` field, allowing caller-defined kinds while providing well-known types for session, decision, aspiration.
2. **Shared identifiers > shared schemas**: `SessionId` brand as the load-bearing integration primitive with Cairn (FR-13).
3. **Trust as event-driven signal**: Trust ∈ [0.15, 1.0], never auto-decays, only updated by explicit observation (FR-3).
4. **Attention-tier materialization**: Hot/warm/cold tier as denormalized field, sweep-maintained (FR-8).
5. **BM25 + power-law recency**: Hybrid recall using FTS5 and ACT-R-style time decay (FR-2).

---

## 2. Graph Schema

Eureka uses a **two-table graph model**: `facts` (nodes) and `relations` (edges).

### 2.1 Facts Table

```typescript
// packages/eureka/src/schemas/fact.ts (type sketch)

import type { SessionId } from '@akubly/types';

/** 
 * Discriminated union of fact kinds.
 * Caller-defined kinds allowed; well-known kinds provide semantic guarantees.
 */
export type FactKind = 
  | 'session'      // Session-scoped working memory
  | 'decision'     // Persistent decision record
  | 'aspiration'   // Goal or intention
  | string;        // Extensible for arbitrary kinds

/**
 * Core fact representation.
 * Each fact is a node in the knowledge graph.
 */
export interface Fact {
  id: string;                    // UUID v4 (FactId brand in runtime)
  kind: FactKind;                // Discriminator for payload shape
  content: string;               // TEXT; markdown or structured content
  sources: string[];             // Origin citations (file paths, URLs, session IDs)
  
  // Property signals (§3)
  trust: number;                 // [0.15, 1.0]; floor prevents zero-trust limbo
  importance: number;            // [0, 1]; sweep-maintained via PageRank
  attention_tier: 'hot' | 'warm' | 'cold';  // Denormalized tier assignment
  
  // Lifecycle metadata
  committed: boolean;            // false = draft/staged, true = committed
  created_at: number;            // Unix epoch ms
  updated_at: number;            // Unix epoch ms
  
  // Session model (FR-13)
  session_id: SessionId | null;  // Required for session-facts; null for persistent facts
  
  // Future extension (v1.5)
  embedding_vector: Buffer | null;  // Reserved for semantic search
}
```

**Storage**: SQLite via `better-sqlite3`. FTS5 virtual table on `content` for BM25 ranking (FR-2).

**Key constraints** (enforced at ingestion layer):
- `session_id` MUST be non-null when `kind = 'session'`
- `trust` ∈ [0.15, 1.0] (floor prevents pathological zero-trust states)
- `importance` ∈ [0, 1]

### 2.2 Relations Table

```typescript
// packages/eureka/src/schemas/relation.ts (type sketch)

/** Edge types organized into three tiers (FR-9) */
export type EdgeType = 
  // Tier 1: Eager (event-driven, ingestion-time)
  | 'originated_in'      // fact → session (creation provenance)
  | 'modified_in'        // fact → session (mutation provenance)
  | 'contradicts'        // fact → fact (logical conflict)
  | 'supports'           // fact → fact (evidential support)
  | 'refines'            // fact → fact (elaboration)
  | 'depends_on'         // fact → fact (dependency)
  | 'blocks'             // fact → fact (task blockers)
  | 'part_of'            // fact → fact (containment)
  | 'relates_to'         // fact → fact (untyped association)
  | 'tagged_with'        // fact → tag (folksonomy)
  | 'supersedes'         // fact → fact (version succession)
  | 'references'         // fact → external resource
  | 'cites'              // fact → fact (citation)
  
  // Tier 2: Sweep (batch-populated during maintenance)
  | 'similar_to'         // fact → fact (embedding similarity, v1.5)
  | 'co_accessed_with'   // fact → fact (co-recall patterns)
  | 'recalled_in'        // fact → session (retrieval history)
  
  // Tier 3: Deferred (parking lot, not in v1)
  | string;              // Extensible for custom edge types

/**
 * Directed edge between facts.
 * Supports weighted, confidence-scored relationships.
 */
export interface Relation {
  from_id: string;       // Source fact ID
  to_id: string;         // Target fact ID (or SessionId for session edges)
  edge_type: EdgeType;   // Relationship semantics
  
  weight: number;        // [0, 1]; relationship strength
  confidence: number;    // [0, 1]; assertion confidence
  
  created_at: number;    // Unix epoch ms
}
```

**Storage**: Same SQLite database, indexed on `(from_id, edge_type)` and `(to_id, edge_type)` for traversal.

**Edge lifecycle**:
- **Tier 1 edges**: Created synchronously during fact ingestion (e.g., `originated_in` when fact is committed).
- **Tier 2 edges**: Populated by sweep operations (e.g., `co_accessed_with` from recall logs).
- **Tier 3 edges**: Not implemented in v1; reserved for future expansion.

---

## 3. Property Shapes

Each fact carries four property signals that govern recall, attention, and trust.

### 3.1 Trust

**Invariants**:
- Domain: `[0.15, 1.0]`
- Floor: `0.15` (prevents zero-trust limbo where facts can never recover)
- **Event-driven only**: Trust NEVER auto-decays (FR-3 decision)
- Updated by: explicit contradictions, user corrections, re-observation

**Rationale**: Auto-decay creates pathological "trust erosion" where unaccessed facts become untrusted simply from neglect. Trust is an epistemic property (does this fact correspond to reality?), not a temporal property (is this fact recent?). Recency is handled separately via ACT-R decay (§3.3).

**Initial values**:
- User-provided facts: `1.0`
- Agent-inferred facts: `0.7` (calibrated for "likely but unverified")
- External API facts: `0.8` (trusted source, but subject to staleness)

### 3.2 Importance

**Invariants**:
- Domain: `[0, 1]`
- Sweep-maintained: Recomputed during periodic sweep via **PageRank** over relation graph (FR-12)
- Factors: In-degree (how many facts reference this one), edge weights, manual importance boosts

**Usage**: Importance gates promotion to higher attention tiers. High-importance facts remain `hot` even if infrequently accessed.

### 3.3 Recency (Derived)

**Not stored**; computed at query time via **ACT-R power-law decay** (FR-2):

```typescript
function computeRecency(fact: Fact, now: number): number {
  const ageMs = now - fact.updated_at;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.pow(ageDays + 1, -0.5);  // d = 0.5 (decay exponent)
}
```

**Rationale**: Time-based decay is orthogonal to trust. A fact can be old (low recency) but still trustworthy (high trust). BM25 + recency forms the hybrid recall scoring (FR-2).

### 3.4 Attention Tier

**Values**: `'hot' | 'warm' | 'cold'`

**Assignment policy** (sweep-maintained, FR-8):
- **Hot**: Recent activity (accessed in last 7 days) OR high importance (> 0.8)
- **Warm**: Moderate activity (7-30 days) OR medium importance (0.4-0.8)
- **Cold**: Stale (30+ days) AND low importance (< 0.4)

**Usage**: Tiered recall strategies — `hot` facts preloaded into context, `warm` facts fetched on-demand, `cold` facts require explicit search.

### 3.5 Plasticity (Open Question)

**Status**: Mentioned in charter, underspecified in v5-final PRD.

**Expected shape** (Crispin's recommendation for schema):
```typescript
interface Fact {
  plasticity?: number;  // [0, 1]; 1 = highly mutable, 0 = immutable
}
```

**Semantic intent**: How easily should this fact be updated or overwritten? High plasticity = working hypothesis, low plasticity = confirmed truth.

**Deferred**: Edgar (algorithm specialist) owns the update logic; Crispin provides schema shape. See open questions (§9.1).

---

## 4. Kind Taxonomy

Eureka supports **caller-defined kinds** (extensible discriminated union) while providing semantic guarantees for **well-known kinds**.

### 4.1 Well-Known Kinds (v1)

| Kind | Semantics | Session-bound? | Lifecycle |
|------|-----------|----------------|-----------|
| `session` | Working memory for a single session | Yes (required `session_id`) | Transient; swept after session ends |
| `decision` | Persistent decision record | No | Permanent; never auto-pruned |
| `aspiration` | Goal or intention | No | Permanent; user-managed |

### 4.2 Extended Taxonomy (Future Work)

**Open question**: The task specification references a **six-kind taxonomy** (practical, semantic, syntactic, linguistic, symbolic, philosophical) not present in v5-final PRD. Status unclear:

- **Hypothesis 1**: This is legacy nomenclature from R1-R4 design cycles, superseded by caller-defined kinds.
- **Hypothesis 2**: This is intended as a **second-order classification** (kinds-of-kinds) for epistemological reasoning.
- **Hypothesis 3**: This is expected to be designed in this section.

**Crispin's recommendation**: Defer extended taxonomy to post-v1. The current schema supports arbitrary kinds; epistemological layering can be added via metadata or edge types without schema changes.

See open questions (§9.2) for resolution path.

---

## 5. Cross-Reference Model

Facts reference other entities via **three mechanisms**:

### 5.1 Explicit Relations

Typed edges in `relations` table (§2.2). Examples:
- `fact_A --[contradicts]--> fact_B`
- `fact_C --[originated_in]--> session_123`
- `fact_D --[cites]--> fact_E`

**Query interface**: Graph traversal via recursive CTEs (SQLite) or application-layer graph traversal.

### 5.2 Sources Array

Each fact carries `sources: string[]` — untyped citations (file paths, URLs, session IDs, git commit SHAs). Not indexed; used for human-readable provenance display.

### 5.3 SessionId Foreign Key

Session-bound facts carry `session_id: SessionId` — the **load-bearing integration primitive** with Cairn (FR-13). Enables:
- Provenance queries: "What did I learn in session X?"
- Lifecycle management: Sweep can prune facts when Cairn marks session as archived
- Cross-system consistency: Session exists in Cairn → facts exist in Eureka

See Crucible overlap (§8) for naming collision with Crucible's `session` primitive.

---

## 6. Persistence Formats

### 6.1 Storage Tiers (FR-7)

Eureka uses **three SQLite databases**, each with identical schema but different lifecycles:

| Tier | Path | Scope | Lifecycle |
|------|------|-------|-----------|
| Agent | `~/.copilot/eureka/agent.db` | Per-CLI-agent | Persists across user sessions; user-independent |
| User | `~/.copilot/eureka/user.db` | Per-user | Persists across repos; user-specific |
| Project | `<repo>/.eureka/project.db` | Per-repo | Checked into git; team-shared |

**Schema replication**: All three databases use identical `facts` and `relations` tables. Tier determines **access scope**, not schema shape.

**Query federation**: Application layer queries all three tiers and merges results. No database-level federation (avoids `ATTACH` complexity).

### 6.2 SQLite Configuration

```typescript
// packages/eureka/src/persistence/db.ts (pseudocode)

import Database from 'better-sqlite3';

export function openDatabase(path: string): Database.Database {
  const db = new Database(path);
  
  // Performance tuning
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = -64000');  // 64MB cache
  db.pragma('temp_store = MEMORY');
  
  // FTS5 for BM25 (FR-2)
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
      content, 
      content='facts', 
      content_rowid='rowid'
    );
  `);
  
  return db;
}
```

### 6.3 Serialization Format

**Primary format**: SQLite binary (`.db` files).

**Export format** (for human review or migration):
- **JSON Lines** (`.jsonl`): One fact per line, newline-delimited
- **GraphML** (`.graphml`): Standard graph interchange format for visualization tools

**Lossless transformation**: All exports preserve full fact metadata (trust, importance, attention tier, timestamps). Round-trip guarantees: SQLite → JSONL → SQLite preserves all data.

---

## 7. Query Interfaces

Eureka exposes **three query modes** to the runtime:

### 7.1 BM25 + Recency Hybrid Recall (FR-2)

**Use case**: Natural language query → ranked facts

```typescript
interface RecallQuery {
  query: string;              // Natural language query
  limit?: number;             // Max results (default: 10)
  tier?: AttentionTier[];     // Filter by tier (default: ['hot', 'warm'])
  kind?: FactKind[];          // Filter by kind
  min_trust?: number;         // Trust threshold (default: 0.5)
}

interface RecallResult {
  fact: Fact;
  score: number;              // Hybrid score: BM25 * recency * trust
  bm25_score: number;         // Raw BM25 score
  recency_score: number;      // Computed recency
}

export function recall(query: RecallQuery): RecallResult[];
```

**Scoring formula**:
```
hybrid_score = bm25_score * recency^0.3 * trust^0.2
```

Exponents tuned empirically; BM25 dominates, recency and trust provide tie-breaking.

### 7.2 Graph Traversal

**Use case**: Follow relationships from a known fact

```typescript
interface TraversalQuery {
  start_id: string;           // Root fact ID
  edge_types?: EdgeType[];    // Follow only these edge types
  max_depth?: number;         // Traversal depth limit (default: 3)
  direction?: 'outgoing' | 'incoming' | 'both';
}

export function traverse(query: TraversalQuery): Fact[];
```

**Implementation**: Recursive CTE in SQLite for depth-limited BFS.

### 7.3 Structured Filter

**Use case**: Direct property-based queries

```typescript
interface FilterQuery {
  kind?: FactKind | FactKind[];
  session_id?: SessionId;
  min_importance?: number;
  min_trust?: number;
  tier?: AttentionTier | AttentionTier[];
  created_after?: number;     // Unix epoch ms
  created_before?: number;
}

export function filter(query: FilterQuery): Fact[];
```

**Common queries**:
- "All decisions": `filter({ kind: 'decision' })`
- "Hot facts from this session": `filter({ session_id, tier: 'hot' })`
- "High-trust aspirations": `filter({ kind: 'aspiration', min_trust: 0.9 })`

---

## 8. Crucible KR Overlap

Eureka shares the `mem` ecosystem with **Crucible** (versioned CLI session store) and **Forge** (artifact forge/materializer). Two critical **representational collisions** must be managed:

### 8.1 "Decision" Naming Collision

**Problem**: Three incompatible shapes use the name "decision":

1. **Crucible `Decision`** (primitive): Transient session artifact, not persisted to Crucible store
2. **Eureka `DecisionPayload`**: Persistent fact with `kind: 'decision'` in Eureka knowledge graph
3. **Forge `DecisionRecord`**: Materialized markdown file (`.squad/decisions/inbox/*.md`)

**Root cause**: Semantic overloading — "decision" conflates the **act of deciding** (Crucible event), the **epistemological artifact** (Eureka fact), and the **materialized document** (Forge output).

**Mitigation** (FR-12 mechanism #8):
- **ESLint rule**: `@akubly/no-crucible-decision-in-eureka` — ban `import { Decision } from '@akubly/crucible'` in Eureka code
- **Type branding**: Eureka uses `DecisionPayload` type, never `Decision`
- **Documentation**: Explicit disambiguation in architecture docs (this section serves as reference)

### 8.2 "Artifact" Semantic Drift

**Problem**: "Artifact" has divergent meanings:

- **Crucible**: Content blob (file created/edited in session)
- **Eureka**: Epistemological artifact (persistent knowledge representation)

**Impact**: Low (terms used in different contexts), but creates confusion in cross-system discussions.

**Mitigation**: Prefer **"fact"** in Eureka code and docs; reserve "artifact" for Crucible/Forge usage.

### 8.3 SessionId as Integration Primitive

**Solution**: `SessionId` brand (FR-13) serves as the **load-bearing shared identifier**:

```typescript
// packages/types/src/brands.ts
export type SessionId = string & { readonly __brand: 'SessionId' };
```

**Integration pattern**:
- Cairn creates session, generates `SessionId`
- Eureka ingests facts with `session_id: SessionId` foreign key
- Crucible logs events with `session_id: SessionId` (future integration)
- Forge materializes artifacts tagged with `session_id: SessionId`

**Design insight**: "Shared identifiers > shared schemas" — systems remain structurally independent but share provenance lineage via branded ID.

---

## 9. Open Questions

### 9.1 Plasticity Property Algorithm

**Question**: How should `plasticity` be computed and updated?

**Owner**: Edgar (algorithm specialist)

**Blockers**: 
- What factors determine plasticity? (Source type? Contradiction count? User feedback?)
- How does plasticity interact with trust? (Low trust → high plasticity?)
- Should plasticity decay over time? (Mature facts become less plastic?)

**Crispin's action**: Schema shape provided (§3.5); awaiting Edgar's algorithm spec.

### 9.2 Six-Kind Taxonomy

**Question**: Is the six-kind taxonomy (practical, semantic, syntactic, linguistic, symbolic, philosophical) still in scope for v1?

**Context**: Task specification mentions six kinds, but v5-final PRD uses caller-defined kinds with three well-known types.

**Hypothesis**: Legacy nomenclature from R1-R4, superseded by discriminated union design.

**Resolution path**:
1. Search historical design docs (R1-R4) for taxonomy definition
2. Consult Genesta (ontologist) — does epistemological classification require explicit kinds?
3. If needed, layer taxonomy as **second-order metadata** (facts-about-kinds) without schema changes

**Crispin's recommendation**: Defer to post-v1; current design supports arbitrary kinds extensibly.

### 9.3 Embedding Strategy (v1.5)

**Question**: Which embedding model for `embedding_vector`?

**Candidates**:
- OpenAI `text-embedding-3-small` (1536 dim, API-based)
- `all-MiniLM-L6-v2` (384 dim, local via Transformers.js)
- Custom fine-tuned model on mem-specific vocabulary

**Deferred**: v1 uses BM25 only; v1.5 adds semantic search via `sqlite-vec`.

### 9.4 Cross-Tier Query Performance

**Question**: How to optimize federated queries across agent/user/project databases?

**Options**:
1. Query all three tiers, merge results in application layer (current plan)
2. Use SQLite `ATTACH` for single-query federation (adds complexity)
3. Precompute "relevant tier" metadata to skip unnecessary queries

**Owner**: Roger (performance specialist)

**Crispin's input**: Schema design supports all three options; no structural blocker.

---

## 10. Implementation Checklist

- [ ] **Schema migration**: Create initial `facts` and `relations` tables in all three tiers
- [ ] **FTS5 setup**: Configure BM25 virtual table with content tokenization
- [ ] **Type definitions**: Export `Fact`, `Relation`, `FactKind`, `EdgeType` from `@akubly/eureka`
- [ ] **Recall interface**: Implement hybrid BM25 + recency scoring (§7.1)
- [ ] **Graph traversal**: Implement recursive CTE for edge traversal (§7.2)
- [ ] **Sweep operations**: PageRank for importance, tier reassignment (§3.2, §3.4)
- [ ] **SessionId integration**: Wire Cairn session lifecycle to Eureka fact ingestion
- [ ] **ESLint guardrails**: Implement `@akubly/no-crucible-decision-in-eureka` rule (§8.1)
- [ ] **Export utilities**: Implement lossless JSONL and GraphML serialization (§6.3)
- [ ] **Property validators**: Enforce trust floor, importance bounds at ingestion layer

---

## 11. References

- **Eureka PRD v5-final**: `.squad/decisions/eureka-prd-v5-final.md` (FR-1, FR-2, FR-3, FR-7, FR-8, FR-9, FR-12, FR-13, FR-14)
- **Crucible Overlap Analysis**: `.squad/decisions/inbox/crispin-crucible-kr-overlap.md`
- **SessionId Brand Decision**: `.squad/decisions/inbox/crispin-session-brand.md` (R8 amendment)
- **ACT-R Decay Model**: Anderson, J. R. (1990). *The Adaptive Character of Thought*. LEA.
- **PageRank**: Page, L., Brin, S., et al. (1998). *The PageRank Citation Ranking*. Stanford InfoLab.

---

**Next steps**: 
1. Circulate for squad review (Graham, Genesta, Edgar, Roger, Laura, Valanice)
2. Resolve open questions (§9) via decision log or squad sync
3. Implement core schema and recall interface (§10)

*— Crispin, Knowledge Representation Specialist*
