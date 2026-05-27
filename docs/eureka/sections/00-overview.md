# Eureka Technical Design — §0: Overview & Cross-Cutting Concerns

**Author:** Graham (Lead / Architect)  
**Date:** 2026-05-27  
**Status:** DRAFT — awaiting team review  
**PRD Reference:** `.squad/decisions/eureka-prd-v5-final.md` (canonical)

---

## 0.1 Problem Statement & Vision

### The Rediscovery Tax

Agentic systems today operate under a persistent handicap: **knowledge is ephemeral**. Every session re-reads codebases, rediscovers prior decisions, and discards hard-won context at session boundaries. Per-turn context budgets are spent on rediscovery rather than progress. Multi-agent teams duplicate learning across silos that cannot share durable knowledge.

This is not a tooling limitation — it's an architectural gap. Agents have **no brain**.

### Eureka as Cognitive Memory

Eureka is the **cognitive memory layer** of an agentic stack. It makes knowledge:

- **Durable** — survives session boundaries
- **Addressable** — facts have identity, edges, trust scores
- **Progressively disclosed** — retrieve summaries first, detail on demand

Eureka enables agents to **compound learning over time** rather than paying the rediscovery tax on every session.

### Design Philosophy

Eureka is designed **kernel-shaped**: extractable into a shared learning kernel later, but shipped standalone in v1. This is Path D — "design for extraction, ship as standalone, defer Cairn refactor."

---

## 0.2 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT RUNTIME                                  │
│  (Copilot CLI / Skillsmith / MCP wrapper)                                  │
└─────────────────────────────────────────────────────────────────────────────┘
          │                         │                          │
          │ integrate/recall        │ decide/commit            │ ingestDecisions
          │ rerank/retire/evict     │ (Path 1)                 │ (Path 2)
          ▼                         ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                               EUREKA                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐       │
│  │  Activities  │ │    Facts     │ │   Learning   │ │   Interop    │       │
│  │  integrate   │ │  storage     │ │   kernel     │ │   bridges    │       │
│  │  recall      │ │  kinds       │ │   sweep      │ │  toDecision  │       │
│  │  decide      │ │  edges       │ │   ranker     │ │  fromDecision│       │
│  │  commit...   │ │  tiers       │ │   trust      │ │              │       │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘       │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                                    │                                        │
│                          ┌─────────┴─────────┐                              │
│                          │  Storage Adapters │                              │
│                          │   (SQLite/FTS5)   │                              │
│                          └─────────┬─────────┘                              │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
          ▼                           ▼                           ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   agent.db      │      │    user.db      │      │  project.db     │
│ ~/.copilot/     │      │ ~/.copilot/     │      │ <repo>/.eureka/ │
│ eureka/         │      │ eureka/         │      │                 │
│                 │      │ (stub in v1)    │      │ (stub in v1)    │
└─────────────────┘      └─────────────────┘      └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUBSTRATE (peer systems)                            │
│                                                                             │
│   ┌───────────────────┐              ┌───────────────────┐                 │
│   │      CAIRN        │              │       FORGE       │                 │
│   │ ~/.cairn/         │              │ DecisionRecord    │                 │
│   │ knowledge.db      │              │ audit stream      │                 │
│   │                   │              │                   │                 │
│   │ Operational       │◄─────────────┤ Deterministic     │                 │
│   │ observability     │  SessionId   │ runtime/audit     │                 │
│   │ (sessions, events)│  (shared)    │                   │                 │
│   └───────────────────┘              └───────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════════
                              SHARED TYPE LAYER
                                                                               
    @akubly/types                                                              
    ┌──────────────────────────────────────────────────────────────────────┐  
    │ SessionId (branded primitive — shared identity across Cairn+Eureka) │  
    │ DecisionRecord, DecisionSource, DecisionConfidence (Forge audit)    │  
    └──────────────────────────────────────────────────────────────────────┘  
═══════════════════════════════════════════════════════════════════════════════
```

### Package Boundaries

| Package | Responsibility | v1 Status |
|---------|---------------|-----------|
| `packages/eureka/src/activities/` | Activity orchestration (integrate, recall, decide, commit, retire, evict, rerank) | ✅ Ship |
| `packages/eureka/src/facts/` | Fact types, Kind enum, AttentionTier, schema | ✅ Ship |
| `packages/eureka/src/learning/` | **Extraction-ready kernel** — sweep, ranker, trust. Generic interfaces, no Eureka domain types | ✅ Ship |
| `packages/eureka/src/interop/` | Bridge adapters: `toDecisionRecord`, `fromDecisionRecord` | ✅ Ship |
| `packages/eureka/src/storage/` | SQLite adapter, FTS5, tier-specific DB handles | ✅ Ship (agent tier); stub (user/project) |
| `packages/types/src/session.ts` | `SessionId` branded primitive (shared across Cairn + Eureka) | ✅ Ship |
| `packages/types/src/index.ts` | `DecisionRecord`, `DecisionSource` (Forge audit types) | ✅ Exists |

### Data Flow Summary

1. **Path 1 (Contemplative):** Agent invokes `decide()` → Eureka stores `kind=decision` fact → emits to Forge via `toDecisionRecord()` for audit.

2. **Path 2 (In-Flow):** Agent makes inline decision → Forge captures `DecisionRecord` → operator/demo invokes `eureka ingest-decisions` → Eureka ingests via `fromDecisionRecord()` → stored as `kind=decision` fact.

3. **Knowledge Flow:** `integrate()` stores facts → `recall()` surfaces ranked facts via BM25 + composite ranker → `commit()` pins to hot tier.

---

## 0.3 Bounded Contexts & Ownership Map

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           EUREKA BOUNDED CONTEXT                           │
│                                                                            │
│  "What did I learn?"                                                       │
│                                                                            │
│  Owns:                                                                     │
│  • Facts (all kinds: session, decision, aspiration, etc.)                  │
│  • Trust (provenance reliability of stored knowledge)                      │
│  • Attention tiers (hot/warm/cold)                                         │
│  • Edges (Tier 1 eager, Tier 2 sweep-populated)                            │
│  • Recall/ranking (BM25 + composite formula)                               │
│  • Sweep (importance decay, tier demotions, stale flags)                   │
│  • DecisionPayload schema (structured, learning-shaped)                    │
│                                                                            │
│  Defers to:                                                                │
│  • Cairn for session lifecycle (started_at, ended_at, status)              │
│  • Forge for decision audit (DecisionRecord is audit source of truth)      │
│                                                                            │
│  Shares:                                                                   │
│  • SessionId (branded primitive in @akubly/types)                          │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                           CAIRN BOUNDED CONTEXT                            │
│                                                                            │
│  "What happened?"                                                          │
│                                                                            │
│  Owns:                                                                     │
│  • Sessions (operational lifecycle: repo_key, branch, started_at, status)  │
│  • Event log (append-only observability)                                   │
│  • Confidence (epistemic strength of derived conclusions from analysis)    │
│  • Curator/Prescriber pipeline                                             │
│                                                                            │
│  Shares:                                                                   │
│  • SessionId (same Copilot CLI UUID as Eureka)                             │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│                           FORGE BOUNDED CONTEXT                            │
│                                                                            │
│  "What was decided, for audit?"                                            │
│                                                                            │
│  Owns:                                                                     │
│  • DecisionRecord (flat audit record — source of truth for retrospective)  │
│  • Prescribers (deterministic runtime hooks)                               │
│  • Decision audit stream                                                   │
│                                                                            │
│  Consumed by:                                                              │
│  • Eureka (Path 2 ingestion via fromDecisionRecord)                        │
└────────────────────────────────────────────────────────────────────────────┘
```

### Ownership Rules

| Entity | Authoritative System | Bridge Direction |
|--------|---------------------|------------------|
| Session lifecycle | Cairn | Cairn → Eureka (session-fact may be created) |
| Session identity | **Shared** (`SessionId`) | N/A — same identifier |
| Decision audit | Forge | Forge → Eureka (Path 2 ingestion) |
| Decision learning | Eureka | Eureka → Forge (Path 1 emit) |
| Fact trust | Eureka | N/A — Eureka-only |
| Prescription confidence | Cairn | N/A — Cairn-only |

---

## 0.4 Cross-Cutting Concerns

### 0.4.1 Observability

**Structured Logs (FR-7.3):**
- `bridge.ingest.decision` — Forge→Eureka conversion (success/failure, latency)
- `bridge.ingest.session` — Cairn→Eureka session fact creation
- `bridge.adapter.error` — schema mismatch or conversion failure

**Counters/Histograms (opt-in):**
- `eureka_bridge_decisions_ingested_total`
- `eureka_bridge_adapter_errors_total`
- `eureka_bridge_ingest_latency_ms`

**CLI Surface:**
- `eureka stats` — fact counts per tier, sweep timings, adapter error rates

### 0.4.2 Security

Eureka is **local-first in v1**. The threat model (PRD §14a) addresses:

| Threat | v1 Mitigation |
|--------|--------------|
| Fact tampering | Provenance tracking (`principal_id`, `source`), trust floor (0.15), default trust cap |
| Cross-tier leakage | `Fact.scope` validation, project-tier kind allowlist |
| Trust manipulation | Event-driven only, same-principal cap (N=3), contradiction edges |
| Adapter replay | Idempotency by `DecisionRecord.id` |
| Stale session reference | Tolerated (Path D decoupling); reconciliation CLI surfaces divergence |

**File-system permissions:** Tier DBs owned appropriately (agent/user: user account; project: repo).

### 0.4.3 Plasticity & Trust as First-Class Properties

**Trust (0..1)** is a stored, event-driven scalar on facts:
- Measures **provenance reliability** of stored knowledge
- Mutates on: contemplate outcomes, verification, contradiction, explicit writes
- Floor: 0.15 (facts below this excluded from recall)
- **NOT** equivalent to Cairn's `confidence` (orthogonal axes)

**Attention Tiers (hot/warm/cold)** drive ranking:
- Multiplier: hot=1.20, warm=1.00, cold=0.80
- Transitions: default warm; `commit` → hot; `retire` → warm; sweep demotions

**Importance (0..1)** is sweep-maintained:
- Opportunistic decay based on access patterns
- Not recomputed on every access

**Design Principle:** These are not afterthoughts bolted onto a key-value store. Trust, attention, and importance are **load-bearing properties** that inform every recall, every sweep pass, every decision about what knowledge surfaces.

### 0.4.4 Tier Resolution as a System Concern

Three persistence tiers exist in schema/API from day one:

| Tier | Path | v1 Status |
|------|------|-----------|
| Agent | `~/.copilot/eureka/agent.db` | ✅ Fully wired |
| User | `~/.copilot/eureka/user.db` | Stub (throws on write, empty on read) |
| Project | `<repo>/.eureka/project.db` | Stub (throws on write, empty on read) |

**Recall Fan-Out Strategy (v1):**
1. Sequential fan-out: agent → user → project
2. Early exit at k=10 results above trust floor
3. P95 < 50ms for typical fan-out (single tier in v1)

**Trade-off Named:** We're shipping schema/API for three tiers but only wiring one. This adds surface area without immediate value, but:
- **Gain:** v1.5 tier addition is additive (no API breaks)
- **Cost:** Test surface is larger than strictly necessary in v1
- **Rationale:** Killer demos (US-1, US-2) operate agent-tier only; nothing architectural changes when v1.5 wires the other two

---

## 0.5 Technology Stack Rationale

### Why TypeScript Monorepo

| Decision | Trade-offs |
|----------|-----------|
| **TypeScript** | ✅ Type safety, IDE support, ecosystem. ❌ Runtime overhead vs native, weaker perf guarantees. **Rationale:** Matches Cairn/Forge precedent; agent/LLM tooling is TypeScript-native. |
| **Monorepo (packages/)** | ✅ Shared types, atomic changes, consistent tooling. ❌ Build complexity, CI time. **Rationale:** Already established pattern; `@akubly/types` sharing is load-bearing. |
| **better-sqlite3** | ✅ Synchronous, embedded, no daemon. ❌ Single-writer, no built-in replication. **Rationale:** Matches Cairn precedent; local-first design means no multi-writer need in v1. |
| **FTS5 (BM25)** | ✅ Ships with SQLite, battle-tested, sufficient for keyword recall. ❌ No semantic similarity. **Rationale:** v1 target is code conventions and tool commands — keyword overlap is high. Semantic gap acknowledged; sqlite-vec deferred to v1.5. |

### Why No Database-of-Record Up Front

**Decision:** Eureka does not adopt a "real database" (Postgres, etc.) in v1.

**Trade-offs:**
- ✅ **Gain:** Zero deployment complexity, local-first sovereignty, matches existing Cairn architecture
- ✅ **Gain:** SQLite is surprisingly capable (billions of rows, WAL mode, FTS5)
- ❌ **Cost:** No built-in replication, single-machine constraint
- ❌ **Cost:** CRDT sync (v2) will require careful design

**Rationale:** The v1 success bar is single-user, local-first dogfooding. A heavier database would add operational burden without addressing any v1 use case. When v2 sync arrives, we'll evaluate whether SQLite + CRDT is sufficient or whether a hosted store makes sense. The abstraction layer (storage adapters) allows this decision to be revisited without architectural rework.

### Why Branded Primitives (SessionId)

**Decision:** `SessionId` is a TypeScript branded string, not an opaque class.

**Trade-offs:**
- ✅ **Gain:** Zero runtime overhead, natural serialization (TEXT in SQLite, JSON, CLI args)
- ✅ **Gain:** Compile-time safety prevents accidental string confusion
- ❌ **Cost:** Requires discipline (validators must be called at system boundaries)

**Rationale:** The pattern is already established for `Trust`/`Confidence` (deferred to v1.5). `SessionId` ships in v1 because it's **shared** across packages from day one — unlike Trust/Confidence which were single-package internals.

---

## 0.6 Milestone / Phase Plan

Keyed to PRD acceptance criteria and roadmap (PRD §10, §11).

### M0: Foundation (Current)

**Goal:** Technical design complete, package scaffolding, CI plumbing.

**Deliverables:**
- [x] PRD v5-final locked
- [ ] Technical design authored (this document)
- [ ] `packages/eureka/` directory structure
- [ ] `@akubly/types` extended with `SessionId`
- [ ] CI configuration for Eureka package

### M1: Core Storage & Activities

**Goal:** Facts in, facts out. Basic CRUD + recall.

**Acceptance Criteria:**
- AC-1.1: Agent stores facts via `integrate`
- AC-1.2: `recall(query)` returns relevant facts, P95 < 500ms
- AC-1.3: ≥80% precision on 5-question keyword-overlap eval set (US-1)

**Key Deliverables:**
- `facts` table + FTS5 virtual table
- `relations` table (Tier 1 edges)
- `integrate`, `recall`, `rerank` activities
- BM25 ranker with composite formula
- Agent-tier storage adapter (fully wired)
- Eval suite for precision measurement

### M2: Trust, Attention & Sweep

**Goal:** Knowledge has weight. Facts rise and fall.

**Acceptance Criteria:**
- AC-3.x: Trust-weighted retrieval (US-3)
- AC-4.x: Progressive disclosure (US-4)
- AC-2.3: Continuity recall P95 < 200ms (US-2)

**Key Deliverables:**
- Trust tracking (event-driven mutations)
- Attention tier mechanics (hot/warm/cold)
- Sweep (5 phases per FR-12)
- `commit`, `retire`, `evict` activities

### M3: Sessions & Continuity

**Goal:** Cross-session memory works.

**Acceptance Criteria:**
- AC-2.1: Each session emits `kind=session` fact
- AC-2.2: Session edges link facts to sessions
- AC-2.4: Checkpoints re-surface in next-session recall
- AC-2.5: Caller-cooperation contract documented; telemetry counter active

**Key Deliverables:**
- `SessionId` brand in `@akubly/types`
- Session-fact schema with `session_id` required
- Tier 1 session edges (`originated_in`, `modified_in`, `referenced_in`)
- `flushHints()` helper
- `eureka_sessions_ended_without_flush_total` counter

### M4: Decision Bridges

**Goal:** Bidirectional decision flow with Forge.

**Acceptance Criteria:**
- AC-5.x: `decide` produces DecisionRecord AND Eureka fact (US-5)
- AC-6.1: `fromDecisionRecord` ingestion works (US-6)
- AC-6.2: Ingested decisions become `kind=decision` facts
- ≥95% ingestion rate, <1% adapter error rate

**Key Deliverables:**
- `decide` activity (Path 1)
- `toDecisionRecord` adapter
- `fromDecisionRecord` adapter
- `bridge_ledger` table
- `eureka ingest-decisions` CLI (--since, --session)
- FR-14 idempotency/dedup invariants

### M5: Extraction Readiness & Polish

**Goal:** Learning kernel is extraction-ready. v1 ship.

**Acceptance Criteria:**
- Canary test passes (no Eureka domain types in learning/)
- ESLint boundary rules enforced
- DESIGN.md documents extraction contract
- US-1 50% token reduction demonstrated

**Key Deliverables:**
- Subpath export (`./learning`)
- ESLint `no-restricted-imports` rules
- Mechanism #8 (cross-system session-type ban)
- `eureka reconcile` CLI
- `eureka stats` CLI
- v1 release

---

## 0.7 ADR Index

Architecture Decision Records for Eureka. Numbered series; authored as needed during implementation.

| ADR | Title | Status | Author |
|-----|-------|--------|--------|
| 0001 | SQLite as Persistence Engine | Proposed | Graham |
| 0002 | BM25 for v1 Recall (sqlite-vec Deferred) | Proposed | Graham |
| 0003 | SessionId as Shared Branded Primitive | Proposed | Graham |
| 0004 | Three Tiers in Schema, One Wired in v1 | Proposed | Graham |
| 0005 | Learning Kernel Extraction Boundary | Proposed | Graham |
| 0006 | Bridge Ledger for Offline Reconciliation | Proposed | Graham |
| 0007 | Trust vs Confidence Orthogonality | Proposed | Graham |

**File Location:** `docs/eureka/adrs/NNNN-{slug}.md`

---

## 0.8 Open Questions for Team Review

1. **Sweep trigger precision (v1.5):** Should we wire Cairn session-end events in v1.5 as authoritative sweep triggers, or is the v1 cadence-based approach sufficient long-term?

2. **User/project tier priority:** When v1.5 wires additional tiers, which ships first? User-tier (personal continuity) or project-tier (team knowledge)?

3. **Eval set expansion:** The 5-question keyword-overlap eval set is deliberately narrow for v1. When do we expand it, and who owns the expansion?

---

## 0.9 References

- **PRD:** `.squad/decisions/eureka-prd-v5-final.md`
- **Crucible Impact Analysis:** `.squad/decisions/inbox/cassima-crucible-eureka-impact.md`
- **Team History:** `.squad/agents/graham/history.md`
- **Cairn Session Schema:** `packages/cairn/src/db/sessions.ts`
- **Forge Decision Types:** `packages/types/src/index.ts`

---

*This document is §0 of the Eureka Technical Design. Sections §10–§70 are authored by domain specialists in parallel. See `docs/eureka/technical-design.md` for the assembly index.*
