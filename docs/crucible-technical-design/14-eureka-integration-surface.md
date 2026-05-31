# §14 — Eureka Integration Surface

**Status:** FINAL (Phase 2). Authoritative; do not re-litigate locked decisions.
**Owner:** Graham. **Secondary:** Rosella (generator contract alignment).
**Depth budget:** ≤1 page (shortest CTD section by design).
**Hard dependency:** §7 (`ProposalGenerator` contract + §7.A Generic L3
Adapter Conformance Contract). **Cross-refs:** §7.F + Appendix 7-E (v1.5
Eureka adapter spec), §15 (`@akubly/types` evolution), §1 (chamber map —
Eureka is *not* a Crucible chamber).

**Locked context (do not relitigate):** Eureka is an **external library
consumed via optional adapter** (Aaron lock, 2026-05-27); Eureka is **not**
a Crucible chamber; the adapter is a **v1.5 deliverable** (TDD-Q2 lock —
deferred from v1); the adapter MUST pass §7.A unchanged with **no
Eureka-specific test infrastructure** (TDD-Q2 lock).

## 14.1 Contract Surface — Shared vs Private

The integration surface is intentionally tiny. Everything not listed as
SHARED is PRIVATE to its owner and MUST NOT be reached around.

| Surface | Status | Owner | Notes |
|---|---|---|---|
| `SessionId` (brand, `@akubly/types`) | **SHARED** | Co-owned (Crucible + Cairn + Eureka) | Single identifier for a Crucible session; survives fork semantics — Eureka treats it as opaque. |
| `DecisionRecord` (`@akubly/types`, with `schemaVersion`) | **SHARED** | Co-owned | Lossy interchange shape. Eureka adapters consume it; Crucible Applier-written Decisions project *into* it for export only (see §15 evolution plan). |
| §7.1 `ProposalGenerator` proposal envelope | **SHARED** (via the adapter) | Crucible (§7) | The only surface through which Eureka signals enter the pipeline. Adapter projects Eureka output → standard proposals (Appendix 7-E mapping table). |
| §7.A Generic L3 Adapter Conformance suite | **SHARED** (test contract) | Laura (§5.3 runner) | Adapter MUST pass C-1…C-8 unchanged. |
| Eureka knowledge graph / `facts` table / BM25 ranker / sweep | **PRIVATE** | Eureka | Crucible never reads, writes, or schemas this. |
| Eureka `eureka` CLI, reconcile, ingest-decisions | **PRIVATE** | Eureka | May be invoked by users; not orchestrated by Crucible. |
| Crucible L1 WAL (`~/.crucible/wal/`) | **PRIVATE** | Crucible (§3) | Eureka MUST NOT see WAL internals, rows, or filesystem layout. |
| Crucible L2 SQLite projections (`~/.crucible/crucible.db`) | **PRIVATE** | Crucible (§3/§5.A) | Derived projection tables only; Eureka MUST NOT treat this as the L1 ledger or read it directly. |
| Crucible hook bus, Router policy, Applier fence, Aperture queue | **PRIVATE** | Crucible (§4/§5/§8/§9) | Not exposed; the adapter mediates. |
| `~/.crucible/` filesystem | **PRIVATE** | Crucible | Eureka has no read or write authority here. |
| `~/.cairn/knowledge.db`, Cairn `event_log`, Cairn `sessions` | **PRIVATE** to Cairn | Cairn | Not Crucible's concern (§14.3). |

## 14.2 Adapter Pattern (One Paragraph)

The Eureka adapter is a **v1.5 deliverable**, not a v1 deliverable. It will
ship as `@akubly/crucible-eureka-adapter` — a Crucible-owned
`DataProposalGenerator` host that imports Eureka's public surface and
projects each Eureka prescriber output into a standard §7.1 proposal per
the Appendix 7-E mapping table. The adapter is **the only Crucible-facing
surface for Eureka**; Eureka itself never imports Crucible internal types,
never sees the WAL, and never participates in the hook bus. The adapter
MUST pass the **§7.A Generic L3 Adapter Conformance suite (C-1…C-8)
unchanged** — there is **no Eureka-specific test infrastructure in v1 or
v1.5** (TDD-Q2 lock). Trust-tier defaults to `external` on install per the
§7.4 CoI rule and promotes on the standard 30-day / 10-invocation /
0-violation clock. v1 ships §7.F as a forward reference only; the full
spec lives in Appendix 7-E.

## 14.3 Explicit Boundary — Eureka ↔ Cairn Bridges Are Not Crucible's Concern

Eureka maintains its own bridges to Cairn (Path 1 `decide()` →
`toDecisionRecord`, Path 2 `fromDecisionRecord()` ingestion, the `eureka
reconcile` CLI). Those bridges target Cairn's storage and lifecycle —
**not** Crucible's. Crucible's coexistence stance (§1.5, §15) commits to
**no shared substrate** with Cairn; Crucible therefore commits to **no
participation** in the Eureka ↔ Cairn bridge contract. If Eureka's bridges
break because Cairn changes shape, that is an Eureka ↔ Cairn coordination
matter routed through `@akubly/types` co-ownership, not a Crucible bug.
Crucible's only obligation to Eureka is the surface in §14.1; everything
else stays outside the line.

## 14.4 Acceptance Signal

This section is sufficient for:

- **v1 shipping with no Eureka adapter present** — §7.F forward reference
  is the only Eureka mention in the v1 generator contract; §14.1 pins what
  *would* be shared if the adapter were present.
- **v1.5 adapter implementation** — Appendix 7-E owns the mapping table
  and exit criteria; this section pins the contract boundary the
  implementation must respect.
- **§15 `@akubly/types` evolution** — `SessionId` and `DecisionRecord`
  (with `schemaVersion`) are the only two types §14 contributes to the
  shared surface; Roger's §15 owns governance.
