# Forge Phase 4.6 / 5 Roadmap — Advanced Optimization & Cloud PGO

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-02  
**Status:** Roadmap — not implementation-ready  
**Scope:** Everything beyond Phase 4.5 that emerged from the brainstorm. Phases 4.6 and 5 are separated by a clear boundary: Phase 4.6 = still local, learns from prescription history. Phase 5 = cloud telemetry, production feedback, full graph.

---

## Overview

This document captures the forward-looking architecture for Forge's optimization capabilities beyond the local feedback loop (Phase 4.5). It is a **roadmap**, not an implementation spec. TypeScript signatures and schemas are illustrative, not binding.

Three phases are outlined:
1. **Phase 4.6: Change Vector Learning** — Learn which prescriptions work, predict impact, rank recommendations. Still local. ~200 LOC incremental.
2. **Phase 5: Cloud PGO + Full Graph** — Production telemetry via AppInsightsSink, DAG-based prescription ancestry, genetic programming for optimization search. Cloud dependency.
3. **Backlog: Wild Cards** — sqlite-vec, knowledge graph, plugin bundles, cross-skill optimization. Approved for exploration.

---

## 1. Phase 4.6 — Change Vector Learning

### 1.1 Concept

Phase 4.5 tracks linear provenance (`parent_prescription_id` + `metric_snapshot`). Phase 4.6 builds on this by computing **change vectors**: the delta between metric snapshots before and after a prescription is applied. Over time, the system learns which prescription categories produce positive deltas and ranks future prescriptions accordingly.

**Phase boundary rule:** "If it learns from prescription outcomes without cloud data, it's Phase 4.6."

### 1.2 Data Model Extension

```sql
-- New table: prescription change vectors
CREATE TABLE change_vectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hint_id TEXT NOT NULL REFERENCES optimization_hints(id),
  -- Metric deltas (after - before)
  delta_drift REAL NOT NULL,
  delta_cost REAL NOT NULL,
  delta_success_rate REAL NOT NULL,
  delta_convergence REAL NOT NULL,
  delta_cache_hit REAL NOT NULL,
  -- Computed impact
  net_impact REAL NOT NULL,  -- weighted sum of deltas
  -- Metadata
  sessions_observed INTEGER NOT NULL,  -- sessions between before/after
  computed_at TEXT NOT NULL
);

CREATE INDEX idx_change_vectors_hint ON change_vectors(hint_id);
CREATE INDEX idx_change_vectors_impact ON change_vectors(net_impact);
```

### 1.3 Key Algorithms

**Change vector computation:**
```
vector = snapshot_after - snapshot_before
net_impact = Σ(delta_i × weight_i)  // same weights as drift score
```

**Prescription ranking:**
```
predicted_impact(hint) = mean(net_impact) for all change_vectors
  WHERE category = hint.category AND skill_id = hint.skill_id
```

**Confidence scaling:**
```
confidence_boost = log(1 + vectors_count) / log(1 + min_vectors)
hint.confidence *= confidence_boost  // more data = higher confidence
```

### 1.4 Architecture Impact

- **~200 LOC** incremental over Phase 4.5.
- One new CRUD module (`db/changeVectors.ts`), one new migration (012).
- Prescriber `analyzePromptOptimizations()` and `analyzeTokenOptimizations()` gain an optional `historicalVectors` parameter that adjusts impact scores.
- No new modules — this is an enhancement to existing prescribers.

### 1.5 Prerequisite

Phase 4.5 must be operational with ≥20 applied hints before change vector learning produces meaningful predictions. The canary bootstrap naturally gates this.

---

## 2. Phase 5 — Cloud PGO + Full Ancestry Graph

### 2.1 Concept

Phase 5 extends the feedback loop from local development to **production deployment**. Deployed SKILL.md artifacts emit telemetry to Azure Application Insights. Cairn ingests this telemetry and feeds it into the same Prescriber → Applier pipeline. The optimization loop becomes:

```
Local development → Export → Deploy → Production telemetry
→ AppInsightsSink → Cairn ingest → Prescriber → Improved SKILL.md
→ Re-export → Re-deploy → Better production telemetry → ...
```

**Phase boundary rule:** "If it needs cloud infrastructure or Azure budget, it's Phase 5."

### 2.2 AppInsightsSink

The `TelemetrySink` abstraction from Phase 4.5 pays off here:

```typescript
// Illustrative — not implementation-ready

export interface AppInsightsSinkConfig {
  connectionString: string;
  resourceName: string;
  /** Sampling rate (0–1). Default: 1.0 (send everything). */
  samplingRate?: number;
  /** Batch size before flush. Default: 100. */
  batchSize?: number;
}

export function createAppInsightsSink(config: AppInsightsSinkConfig): TelemetrySink;
```

**Trust boundary:** Same as existing APM. Aggregate signals only, no PII. Production telemetry is statistical, not diagnostic. The `deployment` provenance tier (defined in types but not yet populated) is the hook point.

### 2.3 Full Ancestry Graph (DAG)

Phase 4.5 uses linear provenance (`parent_prescription_id`). Phase 5 extends to a full DAG:

```sql
-- Illustrative schema
CREATE TABLE prescription_graph (
  id TEXT PRIMARY KEY,
  parent_ids TEXT NOT NULL DEFAULT '[]',  -- JSON array of parent IDs
  generation INTEGER NOT NULL DEFAULT 0,
  fitness_score REAL,
  -- Graph metadata
  created_at TEXT NOT NULL
);
```

**Capabilities enabled by DAG:**
- **Automatic optima detection:** Walk the graph to find prescription lineages that consistently improve metrics.
- **Prescription crossover:** Combine elements from two successful prescriptions to explore the solution space (genetic programming).
- **Tournament selection:** Compare competing prescriptions and select winners based on measured impact.

### 2.4 Genetic Programming for Optimization Search

Graham's 3-phase roadmap for ancestry tracking culminates in GP-style search:

| Phase | Capability | Complexity |
|-------|-----------|------------|
| 4.5 | Linear provenance | parent_prescription_id + snapshots |
| 4.6 | Change vector learning | Aggregate deltas, predict impact |
| 5 | Full graph + GP | DAG, crossover, tournaments, automatic optima |

**Why not sooner?** GP requires a population of prescriptions with measured fitness. Phase 4.5 generates prescriptions. Phase 4.6 measures their fitness. Phase 5 has enough data to search the space intelligently. Each phase is prerequisite data for the next.

### 2.5 Prerequisites

- Azure Application Insights resource + budget approval.
- Data protection review (aggregate telemetry, no PII).
- Phase 4.5 operational with ≥100 applied hints for meaningful GP.
- Phase 4.6 change vector data for fitness scoring.

---

## 3. Backlog — Wild Cards (Approved for Exploration)

Aaron approved all wild cards for backlog. These are independent of the Phase 4.6/5 critical path.

### 3.1 sqlite-vec for Semantic Pattern Matching

**What:** Embed skill descriptions and prescription text as vectors. Use sqlite-vec for similarity search.

**Use cases:**
- **Skill retrieval:** "Find skills similar to this prompt" without exact keyword matching.
- **Prescription dedup:** Detect semantically equivalent prescriptions before generating duplicates.
- **Pattern matching:** "This session's drift pattern is similar to sessions where prescription X worked."

**Architecture:**
```
SkillRetriever plugin interface:
  FileSystemRetriever (Phase 7, exists) → EmbeddingRetriever (sqlite-vec) → HybridRetriever
```

**Prerequisites:** sqlite-vec npm package, embedding model access (local or API).

### 3.2 Knowledge Graph via SQLite Adjacency Lists

**What:** Model relationships between skills, prescriptions, sessions, and profiles as a graph using SQLite adjacency lists + recursive CTEs.

**Schema sketch:**
```sql
CREATE TABLE knowledge_nodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,  -- 'skill', 'prescription', 'session', 'profile'
  data TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE knowledge_edges (
  from_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  to_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  relation TEXT NOT NULL,  -- 'produced_by', 'improved_by', 'similar_to', 'depends_on'
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (from_id, to_id, relation)
);

-- Example recursive CTE: find all ancestors of a skill
WITH RECURSIVE ancestors AS (
  SELECT from_id, to_id, relation, 1 as depth
  FROM knowledge_edges WHERE to_id = ?
  UNION ALL
  SELECT e.from_id, e.to_id, e.relation, a.depth + 1
  FROM knowledge_edges e JOIN ancestors a ON e.to_id = a.from_id
  WHERE a.depth < 10
)
SELECT * FROM ancestors;
```

**Why adjacency lists, not a graph DB?** SQLite is already our storage engine. Recursive CTEs handle transitive queries. A graph DB adds infrastructure for a use case that's ~100 relationships at most.

### 3.3 Karpathy-Compliant SKILL.md

**What:** Extend SKILL.md format with structured metadata that makes skills machine-readable beyond simple YAML frontmatter:

- **Semantic section IDs:** `## [CONTEXT:project-setup]` instead of `## Context`.
- **Relationship declarations:** `depends_on: ["skill-auth-flow"]`, `supersedes: ["skill-old-flow"]`.
- **Structured metadata blocks:** Separate "for humans" and "for LLMs" sections.

**Impact:** Requires changes to the skill parser, linter, and validator in Cairn. This is a format migration, not a runtime change.

### 3.4 Plugin Bundles

**What:** Group related skills into bundles with shared configuration, model-skill pairing, and cross-skill optimization.

```yaml
# plugin-bundle.yaml
name: "code-review-bundle"
skills:
  - skill-review-security
  - skill-review-performance
  - skill-review-style
shared_config:
  model_preference: "claude-sonnet-4"
  budget_limit_nanoaiu: 5000000
cross_optimization:
  enabled: true
  shared_profile: true
```

**Prerequisite:** SKILL.md v2 format and Phase 4.5 optimization infrastructure.

### 3.5 Meta-Optimization — DBOM on Prescription Decisions

Aaron's "inception-style recursion" idea: track DBOM provenance on the prescription decisions themselves. Every time the system decides to apply/reject/defer a hint, that decision gets a DBOM entry. The system optimizes its own optimization process.

**Implementation:** Wire prescriber decisions through the existing `createDecisionRecorder()` from Phase 2. The `HookObserver` pattern means the recorder sees all events, including internal optimization events. No new infrastructure — just new event types in the bridge taxonomy.

### 3.6 Event Log Compaction

**What:** Hourly rollups of raw bridge events to reduce storage and improve query performance.

```sql
-- Compacted event summary
CREATE TABLE event_rollups (
  rollup_id INTEGER PRIMARY KEY AUTOINCREMENT,
  hour_bucket TEXT NOT NULL,  -- '2026-05-02T14:00:00Z'
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  count INTEGER NOT NULL,
  -- Aggregated metadata
  mean_duration_ms REAL,
  total_tokens INTEGER,
  UNIQUE(hour_bucket, session_id, event_type)
);
```

**Prerequisite:** Curator sweep logic extended with compaction pass.

---

## 4. Capture-Filter-Compress — The "Why Not Max Detail?" Resolution

The brainstorm surfaced a tension: how much telemetry detail to capture? The resolution is a three-layer filtering model:

| Layer | Strategy | Rationale |
|-------|----------|-----------|
| **Capture** (Event Bridge → DB) | Everything. All bridge events, all signals. | Storage is cheap. You can't analyze what you didn't capture. |
| **Analysis** (Curator → Prescriber) | Filter aggressively. Only statistically significant patterns trigger prescriptions. | Noise drowns signal. The Curator's job is noise reduction. |
| **Presentation** (Applier → SKILL.md / User) | Maximum compression. Only actionable changes surface. | Context budget is the real constraint. Every token spent on optimization reporting is a token not spent on the actual task. |

This maps directly to the LX progressive disclosure model (§8 of Phase 4.5 spec): Zero-UI at presentation, deep data available on request.

---

## 5. Dependency Chain

```
Phase 4.5 (Local Feedback Loop)
  ├── Produces: execution_profiles, optimization_hints, signal_samples
  │
  ▼
Phase 4.6 (Change Vector Learning)
  ├── Consumes: optimization_hints with metric_snapshots
  ├── Produces: change_vectors, ranked prescriptions
  │
  ▼
Phase 5 (Cloud PGO + Full Graph)
  ├── Consumes: change_vectors, execution_profiles
  ├── Requires: Azure infrastructure
  ├── Produces: prescription_graph, production telemetry ingest
  │
  ▼
Wild Cards (independent, can be explored any time)
  ├── sqlite-vec: requires embedding model access
  ├── Knowledge graph: requires Phase 4.5 data model
  ├── Plugin bundles: requires SKILL.md v2
  ├── Meta-optimization: requires Phase 2 decision infrastructure
  └── Event compaction: requires Curator sweep extension
```

---

## 6. Decision Log

Decisions made during the brainstorm that constrain future phases:

| # | Decision | Author | Impact |
|---|----------|--------|--------|
| 1 | Determinism > Token Cost (always) | Aaron | Pervades all prescriber priority, drift weights, optimization ordering |
| 2 | All 4 profile granularity levels are viable | Aaron | `per-skill`, `per-user`, `per-model`, `global` — all supported in schema |
| 3 | Cold start: Canary bootstrap | Aaron | Gradual ramp, no prescriptions until `minSessions` reached |
| 4 | Generous exploration budget | Aaron | `explorationBudget` floor at 0.15, never zero |
| 5 | Manual trigger in Forge, Curator-driven in Cairn | Aaron | Two trigger paths, shared analysis logic |
| 6 | Meta-optimization: DBOM on prescriptions | Aaron | Prescription decisions tracked via existing decision recorder |
| 7 | Plugin bundles + model-skill pairing + cross-skill optimization | Aaron | Approved for backlog, requires Phase 4.5 first |
| 8 | All wild cards approved for backlog | Aaron | No blocking — explore opportunistically |

---

*This roadmap will be refined into implementation specs as Phase 4.5 matures and prerequisites are met. Each future phase will get its own spec document following the established pattern.*
