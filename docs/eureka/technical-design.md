# Eureka Technical Design

**Version:** v0.1 draft (assembled)  
**Status:** ✅ Sections drafted — awaiting Aaron's decisions on blockers  
**Assembled:** 2026-05-27  
**Contributors:** Graham (Lead/Architect), Genesta (Cognitive), Crispin (Schema), Edgar (Learning), Roger (Platform), Laura (Test), Valanice (UX), Cassima (PM)

---

## Executive Summary

Eureka is the **cognitive memory layer** for agentic systems — making knowledge durable, addressable, and progressively disclosed across session boundaries. It eliminates the "rediscovery tax" where agents re-learn context every session.

The v1 design delivers: **7 core activities** (integrate, recall, rerank, decide, commit, retire, evict) + 2 reserved (meditate, contemplate); **BM25-based recall** with composite ranking (relevance 50% + importance 20% + trust 20% + recency 10%); **three-tier storage** (agent tier only in v1; user/project tiers reserved in schema, adapters deferred to v1.5 per PRD FR-7.2); **bidirectional Forge bridges** for decision audit; and an **extraction-ready learning kernel** for future Cairn refactor. OQ-1 (substrate ownership) has been resolved via ADR-0002; remaining open decisions are tracked in the §00 ADR index.

---

## Table of Contents

| § | Section | Author | Summary | Link | Status |
|---|---------|--------|---------|------|--------|
| 00 | Overview & Cross-Cutting | Graham | Architecture, bounded contexts, milestones, ADR index | [`00-overview.md`](sections/00-overview.md) | ✅ Drafted |
| 10 | Activities & Tiers | Genesta | 7 v1 activities, tier resolution, attention mechanics | [`10-activities-and-tiers.md`](sections/10-activities-and-tiers.md) | ✅ Drafted |
| 20 | Knowledge Representation | Crispin | Facts schema, edge types (Tier 1/2/3), graph-ready relations | [`20-knowledge-representation.md`](sections/20-knowledge-representation.md) | ✅ Drafted |
| 30 | Learning Systems | Edgar | BM25 ranker, sweep phases, trust dynamics, extraction kernel | [`30-learning-systems.md`](sections/30-learning-systems.md) | ✅ Drafted |
| 40 | Integration | Roger | Cairn/Forge bridges, `@akubly/types` contracts, workspace topology | [`40-integration.md`](sections/40-integration.md) | ✅ Drafted |
| 50 | Testability | Laura | Test strategy, API boundary validation, precision measurement (complementary to §55) | [`50-testability.md`](sections/50-testability.md) | ✅ Drafted |
| 55 | London-School TDD Strategy | Laura | London-school outside-in TDD spine, worked recall example, mock contracts, AC mapping | [`55-tdd-strategy.md`](sections/55-tdd-strategy.md) | ✅ Accepted |
| 60 | UX & Human Factors | Valanice | CLI surface, friction calibration, approval workflows | [`60-ux-human-factors.md`](sections/60-ux-human-factors.md) | ✅ Drafted |
| 70 | PRD Alignment | Cassima | AC coverage, non-goals check, Crucible amendments, tension log | [`70-prd-alignment.md`](sections/70-prd-alignment.md) | ✅ Drafted |

### ADRs (Architecture Decision Records)

| ADR | Title | Status | Link |
|-----|-------|--------|------|
| 0001 | SQLite as Persistence Engine | Proposed | [`0001-sqlite-persistence.md`](adrs/0001-sqlite-persistence.md) |
| 0002 | Shared Substrate Ownership | **Accepted — 2026-05-27** | [`0002-shared-substrate-ownership.md`](adrs/0002-shared-substrate-ownership.md) |
| 0003 | SessionId as Shared Branded Primitive | Proposed | [`0003-sessionid-branded-primitive.md`](adrs/0003-sessionid-branded-primitive.md) |

---

## Open Decisions for Aaron

The following decisions must be resolved before Eureka implementation proceeds. Grouped by theme; deduplicated from specialist sections.

### Substrate Ownership

| # | Question | Source | Impact | Recommendation |
|---|----------|--------|--------|----------------|
| **OQ-1** | ~~**Resolve shared-substrate ownership:** `@akubly/types`, `cairn/`, and `forge/` are duplicated in `mem/` and `harness/`. Choose: (A) monorepo, (B) git submodule, or (C) npm packages.~~ | §70 T7, Cassima memo | ~~**CRITICAL**~~ | **✅ Resolved 2026-05-27 — Option A (Monorepo) accepted.** See [ADR-0002](adrs/0002-shared-substrate-ownership.md). |

### Activity Scope

| # | Question | Source | Impact | Recommendation |
|---|----------|--------|--------|----------------|
| **OQ-2** | **Confirm R8 shared SessionId brand:** Does Aaron endorse "one entity, two lenses" framing? | §70 OQ-2 | MEDIUM — If rejected, FR-13 reverts to v4-final isolated design; ESLint guardrail (#8) disabled. | Cassima assumes YES per R8 directive. Confirm to proceed. |

### Retrieval Quality

| # | Question | Source | Impact | Recommendation |
|---|----------|--------|--------|----------------|
| **OQ-3** | **BM25 keyword-disjoint gap acceptance:** v1 recall misses lexically disjoint queries (e.g., "auth" vs. "security"). Is the documented v1.5 sqlite-vec mitigation sufficient? | §70 T6, Roger, Laura | LOW — Killer demos use keyword-overlapping queries; documented gap is honest. | Accept gap; ship v1 with BM25; track sqlite-vec for v1.5. |

### Crucible Coordination

| # | Question | Source | Impact | Recommendation |
|---|----------|--------|--------|----------------|
| **OQ-4** | **Dogfood sequencing:** Crucible-first, Eureka-first, or parallel? | §70 OQ-3 | MEDIUM — Affects both projects' risk profile. Crucible bootstrap loop is existential; Eureka demos are incremental. | Cassima recommends Crucible early → Eureka second (consumes Crucible logs). |
| **OQ-5** | **CLOSED/MOOT** — OQ-1 resolved via ADR-0002 (monorepo accepted 2026-05-27). Originally framed as contingency "if OQ-1 NOT resolved" — no longer applicable. | §70 T7 | N/A — OQ-1 is resolved. | See `.squad/decisions.md` § "Narrower Substrate Freeze Proposal" and ADR-0002. |

### Friction Calibration

| # | Question | Source | Impact | Recommendation |
|---|----------|--------|--------|----------------|
| **OQ-6** | **Commit approval frequency:** Is ~1 commit approval per session acceptable friction? | §60 | LOW — v1 friction is minimal; commit is the only human-blocking prompt. | Accept; monitor via telemetry. |

---

## Cross-Section Tensions & Reconciliations

Four tensions surfaced during specialist authoring. Resolution status documented below.

### 1. T7: Shared Substrate Ownership (BLOCKER)

**Tension:** Eureka v5 adds `SessionId` brand to `@akubly/types` (shared). Crucible analysis found `packages/cairn/`, `packages/forge/`, and `packages/types/` duplicated across `mem/` and `harness/` repos. Who owns the shared package?

**Sections involved:** §40 (Roger), §70 (Cassima), §00 (Graham)

**Resolution:** ✅ **Resolved 2026-05-27 — Option A (Monorepo) accepted.** Aaron chose monorepo. `mem/` and `harness/` will merge into a single `@akubly/` workspace. See [ADR-0002](adrs/0002-shared-substrate-ownership.md) for full decision, trade-offs, and M0 sequencing.

### 2. Activity Vocabulary Discrepancy (RESOLVED)

**Tension:** Original task brief referenced 9 activities (recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate). PRD v5-final locks to 7 v1 (integrate, recall, rerank, decide, commit, retire, evict) + 2 v1.5 reserved (meditate, contemplate).

**Sections involved:** §10 (Genesta), §30 (Edgar), §50 (Laura)

**Resolution:** ✅ **PRD wins.** All sections now use the 7+2 vocabulary. §00 overview updated accordingly. Old vocabulary retired.

### 3. BM25 Keyword-Disjoint Gap (RESOLVED)

**Tension:** BM25 alone fails on keyword-disjoint queries ("auth" won't surface facts mentioning "security"). AC-1.3 (≥80% precision) is scoped to keyword-overlapping queries only. Semantic embeddings deferred to v1.5.

**Sections involved:** §30 (Edgar), §40 (Roger), §50 (Laura)

**Resolution:** ✅ **Documented as known limitation.** Eval set is honest (keyword-overlap only). sqlite-vec roadmapped for v1.5. Risk register entry below.

### 4. Crucible Amendment A1/A3 Dependencies (ESCALATED)

**Tension:** Crucible amendments A1 (substrate ownership) and A3 (dogfood sequencing) affect Eureka design. A1 is CRITICAL; A3 is PENDING.

**Sections involved:** §70 (Cassima)

**Resolution:** ⚠️ **A1 escalated as OQ-1; A3 escalated as OQ-4.** Design proceeds assuming amendments accepted; risk documented if rejected.

---

## Risk Register

| ID | Risk | Severity | Likelihood | Mitigation | Owner |
|----|------|----------|------------|------------|-------|
| R1 | ~~**Substrate ownership unresolved** — blocks implementation~~ | ~~CRITICAL~~ | ~~HIGH~~ | ✅ **Resolved 2026-05-27** — Monorepo accepted (ADR-0002). No longer blocks M0. | Aaron |
| R2 | **BM25 misses disjoint queries** — recall quality gap | MEDIUM | CERTAIN (by design) | v1.5 sqlite-vec; eval set is honest | Edgar |
| R3 | **Crucible A1 rejected** — schema drift between repos | HIGH | LOW (amendment expected) | If rejected, Eureka imports Cairn types read-only (lossy) | Graham |
| R4 | **Eviction policy unsettled** — no auto-eviction in v1 | LOW | CERTAIN (explicit deferral) | v1 `evict` is explicit only; sweep never auto-evicts; revisit v1.5 | Edgar |
| R5 | **Three-tier API surface untested** — user/project tiers stubbed | LOW | CERTAIN (v1 scope) | Stubs throw explicitly; schema is forward-compat; test coverage at v1.5 | Laura |
| R6 | **Commit approval fatigue** — humans skip reviews | MEDIUM | MEDIUM | Telemetry tracks skip rate; calibrate friction at v1.5 | Valanice |

---

## Milestone Summary

From §00-overview, keyed to PRD acceptance criteria.

| Milestone | Goal | Key Deliverables | Acceptance Criteria |
|-----------|------|------------------|---------------------|
| **M0** | Foundation | Tech design, package scaffold, CI, `SessionId` in `@akubly/types` | — |
| **M1** | Core Storage & Activities | `facts`/`relations` tables, `integrate`/`recall`/`rerank`, BM25 ranker, agent-tier storage | AC-1.1, AC-1.2, AC-1.3 |
| **M2** | Trust, Attention & Sweep | Trust tracking, attention tiers (hot/warm/cold), sweep phases, `commit`/`retire`/`evict` | AC-3.x, AC-4.x, AC-2.3 |
| **M3** | Sessions & Continuity | `SessionId` brand, session-fact schema, Tier 1 edges, `flushHints()`, telemetry | AC-2.1, AC-2.2, AC-2.4, AC-2.5 |
| **M4** | Decision Bridges | `decide` activity, `toDecisionRecord`/`fromDecisionRecord`, `bridge_ledger`, `eureka ingest-decisions` CLI | AC-5.x, AC-6.x |
| **M5** | Extraction & Ship | Learning kernel extraction, ESLint boundaries, `eureka reconcile`/`stats` CLI, v1 release | Canary test, 50% token reduction |

---

## Section Status

| § | Section | Status | Date | Author |
|---|---------|--------|------|--------|
| 00 | Overview & Cross-Cutting | ✅ Drafted | 2026-05-27 | Graham |
| 10 | Activities & Tiers | ✅ Drafted | 2026-05-27 | Genesta |
| 20 | Knowledge Representation | ✅ Drafted | 2026-05-27 | Crispin |
| 30 | Learning Systems | ✅ Drafted | 2026-05-27 | Edgar |
| 40 | Integration | ✅ Drafted | 2026-05-27 | Roger |
| 50 | Testability | ✅ Drafted | 2026-05-27 | Laura |
| 55 | London-School TDD Strategy | ✅ Accepted | 2026-05-27 | Laura |
| 60 | UX & Human Factors | ✅ Drafted | 2026-05-27 | Valanice |
| 70 | PRD Alignment | ✅ Drafted | 2026-05-27 | Cassima |

---

## References

- **PRD:** [`.squad/decisions/eureka-prd-v5-final.md`](../../.squad/decisions/eureka-prd-v5-final.md)
- **Crucible Impact Analysis:** See `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27)
- **Substrate Ownership:** See `.squad/decisions.md` § "Narrower Substrate Freeze Proposal" and ADR-0002 (2026-05-27)
- **Team Decisions:** [`.squad/decisions.md`](../../.squad/decisions.md)

---

## Revision History

| Date | Author | Change |
|------|--------|--------|
| 2026-05-27 | Graham | Initial skeleton; §00 drafted |
| 2026-05-27 | Graham | v0.1 assembled — all 8 sections drafted; open decisions consolidated; risk register added |
| 2026-05-27 | Graham | OQ-1 resolved: Monorepo accepted (ADR-0002). Risk R1 retired. ADR status table updated. |
