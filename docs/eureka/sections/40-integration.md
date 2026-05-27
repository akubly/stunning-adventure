# §40 — Integration

**Author:** Roger (Platform Dev)  
**Date:** 2026-05-26  
**Status:** Draft for team review  

---

## Overview

Eureka enters the monorepo as `packages/eureka/` alongside `cairn`, `forge`, and `types`. This section covers workspace topology, cross-package integration, persistence, API surface, and the boundary with Crucible (the parallel harness project).

**Integration principle:** Eureka is **kernel-shaped** (PRD §1) — designed to be extractable later but shipped standalone in v1. It observes Cairn's lifecycle events and consumes Forge's decision audit stream but **never cross-attaches databases at runtime** (FR-7.2). Coupling happens through shared types and event ingestion, not SQL JOINs.

---

## §40.1 — Package Topology

```
packages/
├── types/          # Shared contract types (@akubly/types)
│   └── src/
│       ├── index.ts
│       └── session.ts      # SessionId brand (NEW in R8)
│
├── cairn/          # Observability (@akubly/cairn)
│   └── src/
│       ├── db/             # knowledge.db (12 migrations)
│       │   ├── sessions.ts # Session lifecycle (id, repo_key, branch, ...)
│       │   ├── events.ts   # event_log table
│       │   └── insights.ts # Curator patterns
│       └── agents/
│           └── curator.ts  # Pattern detection
│
├── forge/          # Deterministic runtime (@akubly/forge)
│   └── src/
│       ├── bridge/         # SDK event → CairnBridgeEvent adapter
│       ├── decisions/      # DecisionRecord audit
│       ├── prescribers/    # Feedback-loop optimizers
│       ├── telemetry/      # ExecutionProfile aggregation
│       └── applier/        # Apply prescriptions
│
└── eureka/         # Memory/knowledge layer (@akubly/eureka) — NEW
    └── src/
        ├── storage/        # SQLite facts DB
        ├── activities/     # recall, integrate, decide, commit, ...
        ├── adapters/       # Cairn + Forge ingestion
        └── index.ts        # Public API
```

**Dependency arrows:**

```
eureka → types      (SessionId, DecisionRecord, ProvenanceTier)
eureka → cairn      (NO runtime db queries; MAY read schema docs for ingestion)
eureka → forge      (NO runtime coupling; MAY consume DecisionRecord audit export)

forge → types       (CairnBridgeEvent, DecisionRecord, TelemetrySink)
forge → cairn       (via bridge: writes to cairn's event_log)

cairn → types       (CairnBridgeEvent, SessionIdentity)
```

**Key constraints:**
1. **No circular deps** — Eureka is a *consumer* of Cairn/Forge, never a producer. Cairn and Forge do NOT import from `@akubly/eureka`.
2. **Runtime decoupling** — Eureka reads Cairn session-end events and Forge decision exports via **file-based ingestion** or **event streams**, not cross-database ATTACH.
3. **Shared primitives only in `@akubly/types`** — `SessionId` brand, `DecisionRecord` shape, `ProvenanceTier` enum live in the shared types package.

**Workspace dependency notation:** Internal monorepo dependencies use `"*"` (not `workspace:*` — npm rejects the latter):

```json
// packages/eureka/package.json
{
  "name": "@akubly/eureka",
  "dependencies": {
    "@akubly/types": "*"
  },
  "devDependencies": {
    "@akubly/cairn": "*"  // for schema reference in tests only
  }
}
```

---

## §40.2 — Cairn Integration

**Relationship:** Eureka is **Cairn-aware** but not Cairn-dependent. Cairn owns session lifecycle and operational events; Eureka learns from them.

### §40.2.1 — Session Identity Unification (R8)

Per v5-final FR-13 and Aaron's R8 directive:
- **Shared identifier:** Cairn's `Session.id` (UUID from Copilot CLI session state directory `~/.copilot/session-state/{uuid}/`) is the same UUID Eureka stores in `facts.session_id` for `kind='session'` facts.
- **Shared type:** Both use `SessionId` branded primitive from `@akubly/types`:
  ```ts
  // packages/types/src/session.ts
  export type SessionId = string & { __brand: 'SessionId' };
  ```
- **Lens framing:** Cairn owns lifecycle (started_at, ended_at, status). Eureka owns epistemology (what was learned, what's worth remembering). Same session UUID, orthogonal attributes.

**Trade-off:** This weakens the "isolated by design" framing from v4 (PRD FR-13 amendment), but the R8 guardrails prevent coupling drift:
- **G2 (ESLint boundary)** — No Cairn ↔ Eureka session-type imports except `SessionId` from `@akubly/types` (FR-12 mechanism #8).
- **G3 (No runtime traversal)** — Eureka MUST NOT query Cairn's `sessions` table at runtime (FR-7.2 unchanged).

### §40.2.2 — Ingestion from Cairn Events

Eureka learns from Cairn's `event_log` but does NOT read the table directly at runtime.

**Path 1 (v1 manual ingestion):**
```bash
# Off-line ingestion after a session ends
eureka ingest-session --session <uuid>
```
- Reads Cairn's `event_log WHERE session_id = ?`
- Extracts tool-use patterns, error sequences, skip breadcrumbs
- Writes to Eureka `facts` as `kind='operational'` facts

**Path 2 (v1.5 automatic trigger):**
- Cairn emits session-end event (already exists in bridge/telemetry)
- Eureka subscribes via event stream (NOT SQL ATTACH)
- On `session_end`, triggers ingestion automatically

**Current v1 stance:** Manual only. AC-2.5 telemetry counter `eureka_sessions_ended_without_flush_total` measures the gap.

### §40.2.3 — Migration Strategy

**Cairn's current state:** 12 migrations (001–012), schema version tracked in `schema_version` table.

**Eureka's migrations:** Separate `schema_version` table in `~/.cairn/eureka.db` (or tiered paths — see §40.6). Eureka does NOT touch Cairn's `knowledge.db`.

**Pattern reuse:** Cairn's migration framework (`packages/cairn/src/db/schema.ts`) is reusable for Eureka:
```ts
// packages/eureka/src/storage/schema.ts
import type Database from 'better-sqlite3';

export interface Migration {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { version: 1, description: 'Initial schema', up: (db) => { /* ... */ } },
  { version: 2, description: 'Add trust column', up: (db) => { /* ... */ } },
];

export function applyMigrations(db: Database.Database): void {
  // Same pattern as Cairn
}
```

**No cross-DB dependencies:** Eureka migrations do NOT assume Cairn's schema exists.

### §40.2.4 — DB Injection Pattern

Cairn uses **explicit db-first-param pattern** for all DB helpers:

```ts
// packages/cairn/src/db/sessions.ts
export function getActiveSession(db: Database.Database): Session | null {
  return db.prepare('SELECT * FROM sessions WHERE ended_at IS NULL').get() as Session | null;
}
```

**Eureka adopts the same:** All storage functions take `db: Database.Database` as first param. No module-scoped `getDb()` singleton in function bodies.

**Benefit:** Testable (inject in-memory `:memory:` DB), no global state leakage.

---

## §40.3 — Forge Integration

**Relationship:** Eureka learns from Forge's decision audit trail (Path 2 ingestion, PRD FR-14) but does NOT run prescribers or participate in the Apply Engine.

### §40.3.1 — Decision Ingestion (Path 2)

Per PRD US-6, Eureka ingests Forge's `DecisionRecord` stream:

```ts
// packages/forge/src/decisions/index.ts (existing)
export interface DecisionRecord {
  id: string;
  timestamp: string;
  question: string;
  chosenOption: string;
  alternatives: string[];
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
  source: DecisionSource;  // 'human' | 'automated_rule' | 'ai_recommendation'
  toolName?: string;
  toolArgs?: unknown;
  provenanceTier: 'internal' | 'certification';
}
```

**Ingestion method (v1):**
```bash
# Manual CLI
eureka ingest-decisions --session <uuid>
```
- Reads Forge's decision export (JSON lines file, one `DecisionRecord` per line)
- Projects to Eureka's `DecisionPayload` (PRD FR-14):
  ```ts
  {
    options: DecisionRecord.alternatives,
    chosen: DecisionRecord.chosenOption,
    rationale: DecisionRecord.evidence.join('; '),
    input_trust_min: deriveFromConfidence(DecisionRecord.confidence),
    reasoning_confidence: DecisionRecord.confidence,
  }
  ```
- Stores as `kind='decision'` facts in Eureka

**Lossy projection:** Eureka does NOT store the full audit record. Forge is authoritative for audit; Eureka is authoritative for learning.

**v1 scope:** On-demand only. No automatic trigger. Edgar R8 §3 notes shared `SessionId` enables `--session <uuid>` CLI form (cleaner than prior design).

### §40.3.2 — Prescribers

**Eureka does NOT ship prescribers in v1.** Forge owns the prescriber family (prompt optimizer, token optimizer, drift detector, etc.). Eureka is a *data source* for future prescribers, not a prescriber itself.

**v1.5 opportunity:** A "memory prescriber" could surface stale facts or recommend commit/retire actions, but that's out of v1 scope.

### §40.3.3 — Telemetry Surface

Forge's telemetry collectors (drift, token, outcome) aggregate into `ExecutionProfile`. Eureka does NOT consume these in v1.

**Rationale:** ExecutionProfile is skill-scoped (per-skill, per-user, per-model). Eureka's facts are session-scoped or global. The granularities don't align in v1.

**v1.5 bridge:** If Eureka adds skill-level memory tiers, it could cross-reference ExecutionProfile to weight skill-specific facts.

---

## §40.4 — Types Package Integration

**Shared types in `@akubly/types`:**

1. **`SessionId`** (NEW in R8) — Branded UUID:
   ```ts
   export type SessionId = string & { __brand: 'SessionId' };
   ```
   - Used by: Cairn (`sessions.id`), Eureka (`facts.session_id`), Forge (decision export metadata).

2. **`ProvenanceTier`** (existing) — `'internal' | 'certification' | 'deployment'`.
   - Eureka facts inherit provenance from their source events.

3. **`DecisionRecord`** (existing) — Forge's audit shape.
   - Eureka ingests but does NOT re-export.

4. **`CairnBridgeEvent`** (existing) — Cross-package event format.
   - Eureka MAY consume bridge events in v1.5 (not v1).

**What stays Eureka-local:**
- `Fact` schema (id, kind, content, sources, trust, importance, ...)
- `DecisionPayload` (fact-specific projection of DecisionRecord)
- `ActivityResult` (return type for recall, integrate, decide, ...)

**Package boundary rule:** Types that cross package boundaries go in `@akubly/types`. Types that are internal to Eureka stay in `packages/eureka/src/types/`.

---

## §40.5 — Persistence Layer

### §40.5.1 — Storage Technology

**v1 engine:** SQLite (`better-sqlite3`) with FTS5 for lexical search.

**Rationale:**
- **Proven:** Cairn uses the same stack; 12 migrations, stable in production.
- **Local-first:** Per PRD local data sovereignty commitment.
- **Fast:** FTS5 tokenizer (`porter unicode61`) delivers ≥80% precision on keyword-overlapping queries (PRD FR-2).

**Trade-offs:**
- **Keyword-only in v1:** BM25 (FTS5) will NOT surface facts when query terms are semantically related but lexically disjoint (PRD §6 FR-2 quality bar). Query `"authentication patterns"` will NOT recall `"JWT bearer token validation flow"` unless one literal token overlaps.
- **Embeddings deferred to v1.5:** `sqlite-vec` integration for semantic similarity is out of v1 scope (PRD FR-7.1). Schema includes reserved `embedding_vector BLOB` column (nullable, unpopulated in v1) so v1→v1.5 migration adds the index without schema change.

**Why not graph DB?** Eureka's graph (`facts` + `edges`) is **projection-on-read**, not storage. SQLite stores nodes and edges as tables; graph traversal happens in application code (Crispin's FR-11 BFS/DFS). No need for Neo4j/OrientDB.

**Why not LMDB?** Key-value stores lack relational joins (needed for `originated_in`/`modified_in` edges, PRD FR-11) and lack FTS5 (needed for BM25 recall). SQLite gives both.

### §40.5.2 — Schema

**Core tables:**

```sql
-- Facts (unified storage)
CREATE TABLE facts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,  -- 'session', 'decision', 'operational', 'aspiration', ...
  content TEXT NOT NULL,
  sources TEXT,  -- JSON array of source identifiers
  trust REAL DEFAULT 0.5,  -- [0, 1]
  importance REAL DEFAULT 0.5,  -- [0, 1]
  attention_tier TEXT DEFAULT 'warm',  -- 'hot', 'warm', 'cold'
  committed INTEGER DEFAULT 0,  -- boolean
  session_id TEXT,  -- nullable; required for kind='session', optional for others
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  embedding_vector BLOB  -- reserved for v1.5; nullable, unpopulated in v1
);

-- FTS5 index for lexical search
CREATE VIRTUAL TABLE facts_fts USING fts5(content, tokenize='porter unicode61');

-- Edges (graph relationships)
CREATE TABLE edges (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL,  -- 'originated_in', 'modified_in', 'similar_to', 'stale_trust', ...
  weight REAL DEFAULT 1.0,  -- [0, 1]
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (from_id, to_id, kind),
  FOREIGN KEY (from_id) REFERENCES facts(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES facts(id) ON DELETE CASCADE
);

-- Schema version tracking
CREATE TABLE schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT
);
```

**Indexes:**
```sql
CREATE INDEX idx_facts_kind ON facts(kind);
CREATE INDEX idx_facts_session_id ON facts(session_id);
CREATE INDEX idx_facts_attention_tier ON facts(attention_tier);
CREATE INDEX idx_facts_trust ON facts(trust);
CREATE INDEX idx_edges_from ON edges(from_id);
CREATE INDEX idx_edges_to ON edges(to_id);
```

### §40.5.3 — Migration Framework

Reuse Cairn's pattern:

```ts
// packages/eureka/src/storage/schema.ts
const migrations: Migration[] = [
  { version: 1, description: 'Initial schema', up: migration001 },
  { version: 2, description: 'Add embedding_vector column', up: migration002 },
  // Future migrations...
];

export function applyMigrations(db: Database.Database): void {
  // Same as Cairn — idempotent, transactional, version-tracked
}
```

**Forward compatibility:** v1 ships with `embedding_vector BLOB` column (nullable, unpopulated). v1.5 adds FTS5 embedding index without breaking v1 readers (they ignore null embeddings).

---

## §40.6 — Tier-Aware Storage Paths

Eureka supports multi-tier memory (agent/user/project/org), but **v1 only fully wires the agent tier** (PRD FR-7.2).

**Tier storage layout:**

```
~/.cairn/
├── knowledge.db                # Cairn's observability DB (untouched by Eureka)
├── eureka-agent.db             # Agent-tier Eureka facts (v1 fully wired)
├── eureka-user.db              # User-tier facts (v1 throws on writes, empty reads)
└── eureka-project/             # Project-tier facts (v1 throws on writes, empty reads)
    └── {repo_key}/
        └── facts.db
```

**Agent tier (v1 scope):**
- Path: `~/.cairn/eureka-agent.db`
- Scope: Facts scoped to the current agent invocation (ephemeral or pinned by `commit`).
- Recall fan-out: Agent tier searched first (hot, scoped).

**User tier (v1 stub):**
- Path: `~/.cairn/eureka-user.db`
- Scope: Cross-project, cwd-aware facts owned by the user.
- v1 behavior: Writes throw `Error('User tier not implemented in v1')`. Reads return empty result set (graceful degradation).

**Project tier (v1 stub):**
- Path: `~/.cairn/eureka-project/{repo_key}/facts.db`
- Scope: Per-repo facts shared across team members (Squad migration target).
- v1 behavior: Same as user tier (throws on writes, empty on reads).

**Org tier (deferred to v1.5+):**
- Not in v1 scope. Enterprise org-wide memory requires different substrate (likely remote DB or blob store).

**Trade-off rationale:**
- **Agent tier only in v1** reduces complexity while proving the recall/integrate/decide primitives work.
- **Empty-read degradation** lets fan-out code (PRD FR-2 v4-rev2 I3) stay tier-agnostic — it just gets zero results from unwired tiers.
- **v1.5 wiring is mechanical** — schema already supports session-scoped and global facts; just need to populate user/project DBs.

---

## §40.7 — API Surface

Eureka exposes two surfaces: **library** (TypeScript) and **CLI** (for manual ingestion).

### §40.7.1 — Library API

**Primary entry point:**

```ts
// packages/eureka/src/index.ts
export {
  // Core activities
  recall,
  integrate,
  rerank,
  decide,
  commit,
  retire,
  evict,
} from './activities/index.js';

export {
  // Adapters
  fromDecisionRecord,
  fromCairnEvent,
} from './adapters/index.js';

export {
  // Storage (low-level)
  getEurekaDb,
  closeEurekaDb,
} from './storage/index.js';

export type {
  Fact,
  Edge,
  RecallOptions,
  RecallResult,
  IntegrateOptions,
  DecideOptions,
  DecisionResult,
} from './types/index.js';
```

**Activity signatures:**

```ts
// Recall — retrieve relevant facts
export function recall(
  query: string,
  options?: RecallOptions
): RecallResult[];

// Integrate — reconcile new material with existing facts
export function integrate(
  content: string,
  options?: IntegrateOptions
): Fact;

// Decide — deliberative choice among options
export function decide(
  question: string,
  options: string[],
  rationale?: string
): DecisionResult;

// Commit — pin a fact for guaranteed recall
export function commit(factId: string): void;

// Retire — unpin a committed fact
export function retire(factId: string): void;

// Evict — hard-delete (explicit only)
export function evict(factId: string): void;
```

### §40.7.2 — CLI API

**Manual ingestion:**

```bash
# Ingest Cairn session events → operational facts
eureka ingest-session --session <uuid>

# Ingest Forge DecisionRecord export → decision facts
eureka ingest-decisions --session <uuid>

# Manual recall (debug/test)
eureka recall "authentication patterns"

# Stats
eureka stats --tier agent
```

**v1 scope:** CLI is for operator convenience, not agent invocation. Agents call the library API.

### §40.7.3 — Error Handling

**Fail-open principle:** Eureka MUST NOT block agent execution if recall fails.

```ts
export function recall(query: string, options?: RecallOptions): RecallResult[] {
  try {
    // ... search logic
  } catch (err) {
    console.error('Eureka recall failed:', err);
    return [];  // Empty result set, agent continues
  }
}
```

**v1 telemetry:** Emit `eureka_recall_failures_total` counter so v1.5 can diagnose failure modes.

---

## §40.8 — Build & Test Integration

### §40.8.1 — Build

Eureka uses the monorepo's existing `tsc --build` pipeline:

```bash
# From repo root
npm run build  # Builds all packages (types → cairn → forge → eureka)

# Eureka only
npm run build --workspace=@akubly/eureka
```

**TypeScript config:**

```json
// packages/eureka/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../types" }
  ]
}
```

**No Cairn/Forge build-time deps:** Eureka references `@akubly/types` only (via TypeScript project references). Cairn and Forge are devDependencies for schema docs and test fixtures, not runtime.

### §40.8.2 — Test

**Test command:**

```bash
# From repo root
npm test --workspace=@akubly/eureka

# Or via package.json script
cd packages/eureka
npm test
```

**Test stack:**
- **Vitest** (matches Cairn/Forge precedent)
- **In-memory SQLite** (`:memory:` DB for isolation)
- **Fixtures:** Sample facts, sessions, decisions

**Test categories:**

1. **Unit tests** — Storage layer, ranker, trust decay, edge traversal
2. **Integration tests** — Recall pipeline (BM25 + trust + recency + attention), ingestion adapters
3. **Contract tests** — Shared types (`SessionId`, `DecisionRecord`) match Cairn/Forge exports

**Quality bar:** ≥80% coverage on storage + activities. FTS5 eval suite ships with v1 and runs in CI (PRD FR-2 BM25 quality bar).

---

## §40.9 — Crucible Boundary

**Context:** Crucible (D:\git\harness) is a parallel project shipping v1 in the same timeframe. See `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` for full overlap analysis.

### §40.9.1 — What Crucible and Eureka Share

| Surface | Crucible | Eureka | Resolution |
|---|---|---|---|
| **Session identity** | Implicit session UUID | `SessionId` brand (R8) | Same UUID; Crucible adopts `SessionId` brand from `@akubly/types` |
| **Decision storage** | `Decision` primitive (event-like) | `kind='decision'` facts | **NAME COLLISION** — Recommend Crucible rename to `ChoiceEvent` (Crispin finding §3) |
| **Prescribers** | Router wraps Forge prescribers | Does not run prescribers | **SAFE** — Eureka is data source only |
| **Event log** | L1 WAL (5 primitives) | Ingests Cairn `event_log` | **HIGH RISK** — Must merge or federate before L1 lands (Genesta finding §2) |

### §40.9.2 — Shared Data Layer Risk

**Blocker:** Crucible §1 assumes Cairn and Forge exist in `D:\git\harness\packages\`. But they actually live in `D:\git\mem\packages\`. Neither PRD acknowledges the cross-repo dependency.

**Options (Aaron must decide):**

1. **Merge repos** — Move Crucible into `D:\git\mem\packages\crucible-runtime`. Cleanest dependency graph; highest coordination cost.
2. **Git submodule** — Extract `cairn`, `forge`, `types` into `D:\git\substrate\`; both repos pull as submodule. Clean boundaries; git submodule tax.
3. **Duplicate and drift** — Both repos maintain separate `cairn`/`forge`. Guaranteed divergence; not recommended.

**v1 stance (Cassima recommendation):** Separate at v1, integrate at v1.5. Eureka and Crucible dogfood independently; integration designed from data, not speculation.

### §40.9.3 — Learning Loop Feedback

**Crucible records everything** — every prompt, every tool call, every decision, every file read (§0). This is exactly the evidence Eureka needs for learning patterns.

**v1 wiring (Edgar recommendation):** Add Crucible post-session hook:

```bash
# In Crucible .cruciblerc
on_session_end: eureka ingest-decisions --session $SESSION_ID
```

**v1.5 wiring:** Cairn session-end events trigger Eureka sweep automatically (no manual CLI).

---

## §40.10 — Open Questions

1. **Cairn/Forge repo ownership** — Does the substrate (`cairn`, `forge`, `types`) stay in `mem`, move to `harness`, or extract to a third repo? Blocks both Crucible and Eureka v1.

2. **Crucible `Decision` primitive rename** — Will Crucible adopt `ChoiceEvent` or `DecisionEvent` to avoid collision with Forge `DecisionRecord` and Eureka `DecisionPayload`? (Crispin finding §3.2)

3. **Event-log federation** — Does Crucible's L1 WAL merge into Cairn's `event_log` (Option A) or stay separate and federated (Option B)? Must resolve before Crucible sprint 2. (Genesta finding §2)

4. **User/project tier activation date** — v1 ships with agent tier only. When do we wire user/project tiers? Blocked on Squad migration timeline (PRD US-7 deferred).

5. **Prescriber extraction** — Should Forge prescribers move to Crucible at v1.5 (Eureka becomes data source for Crucible's Router)? Or stay in Forge and Crucible wraps them? (Edgar finding §4)

6. **Automatic ingestion trigger** — Should Eureka subscribe to Cairn session-end events in v1 (automatic) or stay manual-only (`eureka ingest-session`) until v1.5? Current PRD says manual; Edgar recommends automatic before dogfood starts.

7. **Cross-tier normalization** — When v1.5 wires user/project tiers, should fan-out use parallel search + global score normalization (requires tier calibration) or sequential early-exit (simpler, lower precision)? Current PRD says sequential (FR-2 v4-rev2 I3).

---

## §40.11 — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R1: Crucible dependency blocker** — Crucible cannot ship without Cairn/Forge; location TBD | HIGH | HIGH | Aaron decides repo ownership before sprint 2 |
| **R2: BM25 recall failure on keyword-disjoint queries** | CERTAIN (known v1 gap) | MEDIUM | Documented in PRD FR-2; eval suite partitions overlap/disjoint buckets; v1 ships with honest bar |
| **R3: User/project tier activation delay** — Squad migration stalled, no project-tier demand | MEDIUM | LOW | Agent tier proves v1 value; user/project deferred to demand signal |
| **R4: Session-identity coupling drift** — Cairn and Eureka both use `SessionId` but attributes diverge | LOW | MEDIUM | ESLint guardrail (FR-12 #8) + lens framing in docs prevents runtime coupling |
| **R5: Ingestion lag** — Manual `eureka ingest-session` forgotten, stale data | HIGH (if manual) | MEDIUM | Telemetry counter `eureka_sessions_ended_without_flush_total`; v1.5 automatic trigger |
| **R6: Migration schema drift** — Cairn migrations 013+ collide with Eureka schema assumptions | LOW | HIGH | Separate `schema_version` tables; no cross-DB ATTACH at runtime |

---

## §40.12 — Summary

**What works in v1:**
- Eureka lives in `packages/eureka/` with no runtime Cairn/Forge coupling
- Shared `SessionId` brand in `@akubly/types` unifies session identity (R8)
- Manual ingestion (`eureka ingest-session`, `eureka ingest-decisions`) proves Path 1 + Path 2 adapters
- Agent tier fully wired; user/project tiers stub (throws on writes, empty on reads)
- FTS5 BM25 recall hits ≥80% precision on keyword-overlapping queries (documented gap on disjoint queries)

**What's hard:**
- Crucible dependency direction backwards (Forge lives in `mem`, Crucible assumes `harness`)
- Event-log federation unresolved (Cairn `event_log` vs Crucible L1 WAL)
- Automatic ingestion deferred to v1.5 (manual CLI tax in v1)

**What needs Aaron's decision:**
- Repo ownership (Option A/B/C in §9.2)
- Crucible `Decision` primitive rename (§9.1)
- Event-log merge vs federate (§9.2)

**Bottom line:** v1 is shippable standalone; Crucible integration designed at v1.5 from real usage data.

---

**End of §40 — Integration**
