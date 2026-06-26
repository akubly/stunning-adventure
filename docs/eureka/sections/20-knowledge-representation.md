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
3. **Trust as event-driven signal**: Trust ∈ [0.0, 1.0], never auto-decays, only updated by explicit observation (FR-3).
4. **Attention-tier materialization**: Hot/warm/cold tier as denormalized field, sweep-maintained (FR-8).
5. **Composite scoring formula**: Additive ranker formula canonical in §30 §1.2; §20 defines data shapes the formula operates on (FR-2).
6. **Clean I/O seams**: Storage abstraction supports London-school TDD discipline (§55); query interfaces separate from persistence layer.

---

## 2. Graph Schema

Eureka uses a **two-table graph model**: `facts` (nodes) and `fact_relations` (edges, migration 003).

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
  trust: number;                 // [0.0, 1.0]; epistemic reliability
  importance: number;            // [0, 1]; sweep-maintained via PageRank
  attention_tier: 'hot' | 'warm' | 'cold';  // Denormalized tier assignment
  
  // Lifecycle metadata
  committed: boolean;            // false = draft/staged, true = committed
  retired: boolean;              // Retirement flag; default false
  created_at: number;            // Unix epoch ms
  updated_at: number;            // Unix epoch ms
  
  // Session model (FR-13)
  session_id: SessionId | null;  // Required for session-facts; null for persistent facts
  
  // Access tracking
  last_accessed: number | null;  // Unix epoch ms; updated on recall
  access_count: number;          // Incremented on each recall
  
  // Provenance
  provenance: string | null;     // Creation context (agent name, ingest path, etc.)
  
  // Future extension (v1.5)
  embedding_vector: Buffer | null;  // Reserved for semantic search
}
```

**Storage**: SQLite via `better-sqlite3`. FTS5 virtual table on `content` for BM25 ranking (FR-2).

**Key constraints** (enforced at ingestion layer):
- `session_id` MUST be non-null when `kind = 'session'`
- `trust` ∈ [0.0, 1.0]
- `importance` ∈ [0, 1]

**Field-level immutability** (committed facts):
- **Immutable post-commit**: `content`, `kind`, `sources`, `provenance`, `created_at`
- **Always mutable**: `trust`, `importance`, `last_accessed`, `access_count`, `retired`

This supports learning, decay, retirement, and access tracking on committed facts while preserving content integrity.

### 2.2 Cross-Reference Model (`fact_relations`)

> **Amendment 2026-06-25:** This section was reconciled with migration 003 and the §10/§30 `integrate` v1 contract. Earlier drafts presented the full 13-kind taxonomy (`EdgeType = | string`) as if available now; the shipped schema actually locks a 4-kind CHECK vocabulary and v1 `integrate` writes only one of those kinds. The taxonomy below distinguishes **shipped v1** from **reserved v1.5+**.

#### Shipped in v1 (migration 003)

Migration 003 creates table **`fact_relations`** with columns `from_fact_id`, `to_fact_id`, `relation_kind`, `session_id`, `weight`, `confidence`, `created_at`, and UNIQUE `(session_id, from_fact_id, to_fact_id, relation_kind)`. The CHECK constraint on `relation_kind` enumerates **exactly four kinds**:

```typescript
// packages/eureka/src/schemas/relation.ts (shipped — matches migration 003 CHECK)
export type RelationKind =
  | 'duplicate_of'   // fact → older fact (exact-content match within a session) — v1 integrate writes this
  | 'supersedes'     // fact → fact (version succession) — RESERVED, not written in v1
  | 'contradicts'    // fact → fact (logical conflict) — RESERVED, not written in v1
  | 'supports';      // fact → fact (evidential support) — RESERVED, not written in v1

/**
 * Directed edge between facts within a session.
 * Persistence shape mirrors migration 003 exactly.
 */
export interface Relation {
  from_fact_id: string;     // source fact ID
  to_fact_id:   string;     // target fact ID
  relation_kind: RelationKind;
  session_id:   string;     // edges are session-scoped in v1

  weight:     number;       // REAL DEFAULT 1.0; relationship strength
  confidence: number;       // REAL DEFAULT 1.0; assertion confidence

  created_at: string;       // SQLite datetime('now'), ISO-8601
}
```

**v1 write authority:**
- `integrate(scope) → IntegrationReport` writes **only** `duplicate_of` edges (exact-content match within `sessionId`; orientation newer→older by `created_at`). See §10.1 and §30.1.1.
- `supersedes`, `contradicts`, `supports` are present in the CHECK vocabulary so future activities (`sweep`/`meditate` in v1.5) can write them without a follow-up migration, but **no v1 code path writes them**. Any attempt to insert another `relation_kind` value is rejected by SQLite's CHECK.
- **First-write-wins (D-R3):** `RelationWriter` uses `ON CONFLICT DO NOTHING` against the UNIQUE key. Once an edge exists, its `weight` and `confidence` cannot be strengthened by a subsequent `integrate` call in v1; refinement is deferred (see "v1.5+ reserved" below).
- **Write-only in v1 (S4):** `fact_relations` has no runtime consumer yet — no recall-side traversal, no UI surfacing. A read consumer (e.g., folding duplicates at recall time) lands in a later slice. Intentional incremental delivery.

**Storage:** Same SQLite database as `facts`. The UNIQUE index doubles as the lookup path; richer traversal indexes are a v1.5 concern (deferred until a read consumer exists).

#### Reserved for v1.5+ (NOT shipped)

The broader cross-reference vision below describes **design intent**, not currently available behaviour. None of these edge types are valid in the shipped CHECK vocabulary; introducing any of them requires a follow-up migration and an activity that knows how to write them honestly.

```typescript
// FUTURE — NOT in migration 003. Sketch for v1.5+ planning only.
export type FutureRelationKind =
  // Provenance (sweep / meditate candidates)
  | 'originated_in'      // fact → session (creation provenance)
  | 'modified_in'        // fact → session (mutation provenance)
  | 'recalled_in'        // fact → session (retrieval history)
  // Semantic links (require non-lexical signals)
  | 'refines'            // fact → fact (elaboration)
  | 'depends_on'         // fact → fact (dependency)
  | 'blocks'             // fact → fact (task blockers)
  | 'part_of'            // fact → fact (containment)
  | 'relates_to'         // fact → fact (untyped association)
  | 'references'         // fact → external resource
  | 'cites'              // fact → fact (citation)
  // Statistical / embedding-derived
  | 'similar_to'         // fact → fact (embedding similarity)
  | 'co_accessed_with';  // fact → fact (co-recall patterns)
```

**Also reserved for v1.5+:**
- **Cross-session / cross-tier edges.** v1 `fact_relations.session_id` is non-null and edges are single-session-scoped. Cross-session consolidation belongs to `sweep`/`meditate`.
- **Widening `RelationKind` to `| string`.** The locked 4-kind CHECK is deliberate — it prevents accidental vocabulary drift. Any extension is a schema change, not a type-level one.
- **Weight / confidence refinement.** `ON CONFLICT DO NOTHING` (D-R3) means existing edges' `weight`/`confidence` are frozen at first write. Strengthening will arrive via one of: upsert with a merge rule, a separate evidence/observation table, or a sweep-side reconciliation pass — chosen in v1.5.
- **Traversal API.** Recall-side and graph-walk consumers (folding duplicates, surfacing contradictions, following `supersedes` chains) are out of scope until at least one read consumer ships.

**Edge lifecycle (current vs. intended):**

| Lifecycle phase | v1 (shipped) | v1.5+ (reserved) |
|---|---|---|
| Synchronous, caller-invoked | `integrate` writes `duplicate_of` after imprint | — |
| Event-driven at imprint time | _none_ | provenance edges (`originated_in`, `modified_in`) |
| Batch / background (REM-like) | _none_ | `sweep` / `meditate` write `supersedes`, `contradicts`, `supports`, similarity edges |
| Read-side traversal | _none_ (write-only table) | recall-side folding, graph walks |

---

## 3. Property Shapes

Each fact carries four property signals that govern recall, attention, and trust.

### 3.1 Trust

**Invariants**:
- Domain: `[0.0, 1.0]`
- **Event-driven only**: Trust NEVER auto-decays (FR-3 decision)
- Updated by: explicit contradictions, user corrections, re-observation

**Rationale**: Auto-decay creates pathological "trust erosion" where unaccessed facts become untrusted simply from neglect. Trust is an epistemic property (does this fact correspond to reality?), not a temporal property (is this fact recent?). Recency is handled separately via ACT-R decay (§3.3).

**Initial values**: See §30 (Edgar) for source-type-specific trust initialization (canonical specification).

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
  const ageMs = now - fact.last_accessed;
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

Typed edges in the `fact_relations` table (§2.2). v1 ships a 4-kind CHECK vocabulary; `integrate` writes only `duplicate_of`. The examples below illustrate **intended** semantics; only `duplicate_of` is observable in v1:
- `fact_A --[duplicate_of]--> fact_B` (✅ v1, written by integrate)
- `fact_A --[contradicts]--> fact_B` (⚠️ v1.5 — reserved in CHECK, not yet written)
- `fact_C --[supersedes]--> fact_D` (⚠️ v1.5 — reserved in CHECK, not yet written)
- `fact_E --[supports]--> fact_F` (⚠️ v1.5 — reserved in CHECK, not yet written; distinct from `applyFeedback('corroboration')`, which mutates trust on a single fact)
- Provenance/citation edges (`originated_in`, `cites`, etc.) are **not** in the v1 CHECK vocabulary — see §2.2 "Reserved for v1.5+".

**Query interface**: Graph traversal is deferred to v1.5+ (§7.2); `fact_relations` is write-only in v1.

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

**Schema replication**: All three databases use identical `facts` and `fact_relations` tables. Tier determines **access scope**, not schema shape. (v1 ships migration 003 only at the agent tier; the user/project tier rollouts arrive with the cross-tier consolidation activities.)

**Query federation**: Application layer queries all three tiers and merges results. No database-level federation (avoids `ATTACH` complexity).

**TDD implication (§55 §2.5):** Application layer queries all three tiers via a `TierCoordinator` that composes three `FactStore` instances (agent, user, project). Tests mock tier-specific stores individually to validate fan-out logic and cross-tier ranking.

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

Eureka exposes **three query modes** to the runtime. These interfaces define the application-layer API; the storage seam beneath them (§7.4) is the TDD mock boundary for §55's London-school discipline.

### 7.1 Composite Recall (FR-2)

**Use case**: Natural language query → ranked facts

```typescript
interface RecallQuery {
  query: string;              // Natural language query
  session_id?: SessionId;     // Session scope filter (see §30 §1.2)
  limit?: number;             // Max results (default: 10)
  tier?: AttentionTier[];     // Filter by tier (default: ['hot', 'warm'])
  kind?: FactKind[];          // Filter by kind
  min_trust?: number;         // Trust threshold (default: 0.15)
  include_retired?: boolean;  // Include retired facts (default: false)
}

interface RecallResult {
  fact: Fact;
  score: number;              // Composite score (see §30 §1.2 for formula)
  bm25_score: number;         // Normalized BM25 relevance score
  recency_score: number;      // ACT-R time decay score
  importance_score: number;   // PageRank-derived importance
  trust_score: number;        // Epistemic reliability
}

export function recall(query: RecallQuery): RecallResult[];
```

**Composite ranker formula**: Canonical in §30 §1.2. §20 defines the data shapes the formula operates on.

**Default recall filter**: Queries default to `WHERE retired = false AND trust >= 0.15`. Both constraints overridable per-query via `include_retired: true` and `min_trust: 0.0`.

**Contract test requirement (§55 §3.3):** The storage layer (`FactStore.search()`) must return `bm25_score` normalized to [0,1]. Activity tests mock this interface; contract tests validate FTS5 normalization.

**Example with session scope:**
```typescript
// Session-scoped recall (retrieves only facts from specific session)
const results = recall({
  query: 'authentication',
  session_id: 'session-abc-123' as SessionId,
  limit: 5,
  min_trust: 0.6
});
```

### 7.2 Graph Traversal (v1.5+ — NOT shipped)

**Use case**: Follow relationships from a known fact. **Not implemented in v1** — `fact_relations` is write-only until at least one read consumer ships (S4 in §2.2). Sketch retained for v1.5+ planning:

```typescript
interface TraversalQuery {
  start_id: string;                // root fact ID
  relation_kinds?: RelationKind[]; // follow only these kinds (v1: only `duplicate_of` exists)
  max_depth?: number;              // traversal depth limit (default: 3)
  direction?: 'outgoing' | 'incoming' | 'both';
}

export function traverse(query: TraversalQuery): Fact[];
```

**Intended implementation**: Recursive CTE in SQLite for depth-limited BFS.

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

### 7.4 Storage Seam (Mock Boundary)

All three query interfaces (`recall`, `traverse`, `filter`) delegate to a **storage abstraction layer** for I/O. This is the TDD mock boundary identified in §55's London-school discipline.

**Interface shape:**
```typescript
// packages/eureka/src/persistence/fact-store.ts
interface FactStore {
  search(query: RecallQuery): RecallResult[];     // BM25 + filtering
  traverse(query: TraversalQuery): Fact[];        // Graph traversal
  filter(query: FilterQuery): Fact[];             // Structured property query
}
```

**TDD contract (§55 §1.2, §3.3):**
- **Activity tests** mock `FactStore` at the I/O boundary. Real BM25 scoring and recency computation happen in the activity layer; mocked data comes from `FactStore.search()`.
- **Contract tests** validate that the real SQLite implementation honors query constraints:
  - Session isolation: `search({ session_id })` returns only matching facts
  - Trust floor: `search({ min_trust: 0.6 })` excludes facts below threshold
  - Tier filtering: `filter({ tier: ['hot', 'warm'] })` respects tier constraints
  - BM25 normalization: `search()` returns `bm25_score` ∈ [0, 1]

**Integration with CuratorStore (§30 §1.2):** Edgar's `CuratorStore.retrieve(sessionId, query)` signature uses this storage seam. The two-argument form (session first, query second) is a convenience wrapper around `FactStore.search({ session_id, query })`.

---

## 8. Crucible KR Overlap

Eureka shares the `mem` ecosystem with **Crucible** (versioned CLI session store) and **Forge** (artifact forge/materializer). Two critical **representational collisions** must be managed:

### 8.1 "Decision" Naming Collision

**Problem**: Three incompatible shapes use the name "decision":

1. **Crucible `Decision`** (primitive): Transient session artifact, not persisted to Crucible store
2. **Eureka `DecisionPayload`**: Persistent fact with `kind: 'decision'` in Eureka knowledge graph
3. **Forge DecisionRecord**: Runtime TypeScript interface in `@akubly/types` representing audited decision metadata

**Root cause**: Semantic overloading — "decision" conflates the **act of deciding** (Crucible event), the **epistemological artifact** (Eureka fact), and the **audited decision record** (Forge DecisionRecord TypeScript interface). Note: Squad decision dotfiles (markdown memos under `.squad/decisions/`) are a separate, unrelated workflow artifact.

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

- [x] **Schema migration**: `facts` (migration 001/002) and `fact_relations` (migration 003) — v1 shipped
- [ ] **FTS5 setup**: Configure BM25 virtual table with content tokenization
- [ ] **Type definitions**: Export `Fact`, `Relation`, `FactKind`, `RelationKind` from `@akubly/eureka` (v1 ships the 4-kind `RelationKind` matching migration 003 CHECK; `FutureRelationKind` is documentation-only)
- [ ] **Recall interface**: Implement hybrid BM25 + recency scoring (§7.1)
- [ ] **Graph traversal**: Deferred to v1.5+ (§7.2); requires a read consumer first
- [ ] **Sweep operations**: PageRank for importance, tier reassignment (§3.2, §3.4)
- [ ] **SessionId integration**: Wire Cairn session lifecycle to Eureka fact ingestion
- [ ] **ESLint guardrails**: Implement `@akubly/no-crucible-decision-in-eureka` rule (§8.1)
- [ ] **Export utilities**: Implement lossless JSONL and GraphML serialization (§6.3)
- [ ] **Property validators**: Enforce trust floor, importance bounds at ingestion layer

---

## 11. References

- **Eureka PRD v5-final**: `.squad/decisions/eureka-prd-v5-final.md` (FR-1, FR-2, FR-3, FR-7, FR-8, FR-9, FR-12, FR-13, FR-14)
- **Crucible Overlap Analysis**: See `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27) and § "Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)" (2026-05-26)
- **SessionId Brand Decision**: See `.squad/decisions.md` § "Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)" (2026-05-26)
- **ACT-R Decay Model**: Anderson, J. R. (1990). *The Adaptive Character of Thought*. LEA.
- **PageRank**: Page, L., Brin, S., et al. (1998). *The PageRank Citation Ranking*. Stanford InfoLab.

---

**Next steps**: 
1. Circulate for squad review (Graham, Genesta, Edgar, Roger, Laura, Valanice)
2. Resolve open questions (§9) via decision log or squad sync
3. Implement core schema and recall interface (§10)

*— Crispin, Knowledge Representation Specialist*
