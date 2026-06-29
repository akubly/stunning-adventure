# Team Decisions — Cairn Plugin Marketplace

## Index

- [Decision Drop: edgar-recall-collapse](#decision-drop-edgar-recall-collapse)
- [Inbox Drop: recall-collapse.test.ts — RC-1..RC-7 Complete](#inbox-drop-recall-collapsetestts--rc-1rc-7-complete)

---

## Decision Drop: edgar-recall-collapse

# Decision Drop: edgar-recall-collapse
**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-06-28T21:43:58-07:00  
**Status:** SHIPPED — build ✓, 351 tests ✓, typecheck ✓  
**Scope:** `packages/eureka` only

---

## Context

`integrate` writes `duplicate_of` edges into `fact_relations` (each edge: `from=newerDup, to=canonical`). `recall` was ignoring them, surfacing both canonical and non-canonical duplicates. Aaron locked the decision: **collapse at the recall activity layer**, storage stays lossless.

---

## Decisions Made

### D-RC-1: RelationReader placed in `representation/relation.ts`

**Options considered:**
- (A) Define in `recall.ts` alongside other seam interfaces (`FactStore`, `TrustUpdater`)
- (B) Define in `representation/relation.ts` alongside write-side types

**Chose (B).** The write side (`RelationWriter`, `RelationEdge`, `edgeToRelation`) already lives in `representation/relation.ts`. Co-locating the read interface there keeps both sides of the same domain concept together, consistent with Crispin's representation-layer ownership. `recall.ts` imports and consumes but does not define.

---

### D-RC-2: `relationReader` is OPTIONAL in `RecallDeps`

**Rationale:** Zero breaking changes. Callers without an integrate pipeline do not need to wire a reader. Absence is treated as "no duplicate edges" — identical behavior to pre-this-change. If we made it required, all existing tests and production call sites would break.

---

### D-RC-3: Overfetch = `k × (RANKER_OVERFETCH_FACTOR + 1)` when reader is present

**Rationale:** Collapsing N dups from the fetched set can undersupply k results. Adding one extra `k` to the fetch limit compensates for expected dup losses. The bump is conditional on the presence of `relationReader` so callers without the dep keep the existing `k × 3` fetch. The exact factor (+1 factor unit = +k candidates) is a conservative heuristic; a session where >k of the top `k×4` results are all dups would still undersupply, but that pathological case means the session needs partitioning (same rationale as `MAX_SESSION_FACTS`).

---

### D-RC-4: Collapse before ranker, not after

**Rationale:** The ranker must never see non-canonical dups. If collapse happened after ranking, a non-canonical dup might displace a legitimate candidate in the top-k slice. Collapsing first ensures the ranker receives the clean candidate set and its output (or the inline sorted path) is then sliced to k.

---

### D-RC-5: In-memory reader shares `InMemoryRelationWriter` store via constructor

**Rationale:** Mirrors `InMemoryFactReader`'s shared-store pattern. An imprint→integrate→recall test pipeline needs one source of truth. `InMemoryRelationReader(writer)` delegates `listDuplicateOf` to `writer.listBySession()` filtered to `relation_kind='duplicate_of'`. No state copying, no divergence.

---

## Files Changed

| File | Change |
|------|--------|
| `src/representation/relation.ts` | Added `RelationReader` interface |
| `src/storage/relation-reader-sqlite.ts` | NEW — SQLite reader |
| `src/storage/relation-reader-inmemory.ts` | NEW — in-memory reader |
| `src/storage/index.ts` | Export `InMemoryRelationReader` |
| `src/representation/index.ts` | Export `RelationReader` |
| `src/activities/recall.ts` | Import `RelationReader`; add to `RecallDeps`; collapse in `recallWithScores` |
| `src/sqlite/deps.ts` | Import `SqliteRelationReader`; update `createSqliteRecallDeps`; add `createSqliteRelationReader` |
| `src/index.ts` | Export `RelationReader` type |
| `src/activities/__tests__/recall.test.ts` | 6 new RC-* tests |

## Test outcomes

- **Before:** 345 tests passing  
- **After:** 351 tests passing (6 new RC-* collapse tests)  
- **tsc --build:** clean  
- **typecheck (tsconfig.typecheck.json):** clean


---

## Inbox Drop: recall-collapse.test.ts — RC-1..RC-7 Complete

# Inbox Drop: recall-collapse.test.ts — RC-1..RC-7 Complete
**Author:** Laura (Tester)  
**Date:** 2026-06-28T21:43:58-07:00  
**Status:** ✅ COMPLETE — 7 tests GREEN, 358/358 eureka tests passing, tsc clean  
**For:** Team (Edgar, Aaron)

---

## Summary

I was tasked with writing collapse tests for the `duplicate_of` / `RelationReader` seam.
When I arrived, **Edgar had already implemented and shipped the seam** (see `edgar-recall-collapse.md`
in this inbox). The seam shape matched the brief exactly:

```ts
// src/representation/relation.ts
interface RelationReader {
  listDuplicateOf(args: { sessionId: SessionId }): Promise<ReadonlyArray<{ from: FactId; to: FactId }>>;
}
// src/activities/recall.ts
interface RecallDeps {
  ...
  relationReader?: RelationReader;  // optional — absent = no collapse
}
```

All 7 tests in my new file went GREEN immediately against Edgar's implementation. No seam mismatch.

---

## New file

**`packages/eureka/src/activities/__tests__/recall-collapse.test.ts`**

7 tests (RC-1 through RC-7):

| ID | Scenario | Coverage angle |
|----|----------|----------------|
| RC-1 | canonical kept; duplicate suppressed | basic suppression + spy called |
| RC-2 | N-way star (3 dups → 1 canonical survives) | multi-dup star topology |
| RC-3 | empty edge list → pass-through; `listDuplicateOf` IS called | seam always consulted |
| RC-4 | absent `relationReader` → no collapse (backward compat) | guard test; no cast needed |
| RC-5 | k satisfied after collapse via overfetch budget | **NEW** — outcome guarantee |
| RC-6 | dup below trust floor: doubly excluded; canonical NOT suppressed | **NEW** — trust+collapse interaction |
| RC-7 | FR-2 composite ordering preserved among non-dup survivors | **NEW** — ordering invariant |

---

## Relationship to Edgar's existing RC tests (recall.test.ts lines 575–700)

Edgar added 6 RC-* tests inside the `describe('recall')` block:

| Edgar | My file | Overlap |
|-------|---------|---------|
| RC-1 (no reader → both returned) | RC-4 | ✅ same invariant, belt-and-suspenders |
| RC-2 (dup suppressed, canonical kept) | RC-1 | ✅ same invariant, different fixtures |
| RC-3 (empty edges → no suppression) | RC-3 | ✅ same invariant, + spy assertion on mine |
| RC-4 (overfetch limit = k×4) | — | **Only in Edgar's** — my RC-5 tests the OUTCOME |
| RC-5 (star topology) | RC-2 | ✅ same invariant, slightly different assertion style |
| RC-6 (sessionId routing spy) | RC-3 (partial) | ✅ both assert `toHaveBeenCalledWith({sessionId})` |

**Additive coverage in my file (no overlap):**

- **RC-5** — Verifies k=2 results are returned after 3 high-scoring dups are collapsed. Edgar tests the overfetch *limit* (`limit: k×4`); I test the overfetch *outcome* (k results filled from the expanded candidate pool). These are complementary, not redundant.
- **RC-6** — A dup below the trust floor is doubly excluded. Verifies the canonical is NOT accidentally suppressed despite appearing in an edge's `to` field. Edgar has no trust-floor / collapse interaction test.
- **RC-7** — FR-2 composite ordering is preserved among non-dup survivors. Edgar has no ordering-after-collapse test.

---

## Implementation observations (no action needed — noting for Edgar's awareness)

1. **`edges.length > 0` guard in `recallWithScores`:** The filter loop is gated on non-empty edges, but `listDuplicateOf` is ALWAYS called when `deps.relationReader` is present. This is correct — RC-3 pins this via spy. An implementation that skips the call on empty-edges would break RC-3.

2. **Overfetch increase:** `k × (RANKER_OVERFETCH_FACTOR + 1)` when `relationReader` is present. Edgar's RC-4 documents this. The heuristic is sound for typical sessions; pathological all-duplicate sessions that exhaust even `k×4` candidates would undersupply, but those indicate sessions needing `integrate` more than `recall` tuning.

3. **No action needed on test numbering conflict:** Edgar's RC-1..RC-6 are inside `describe('recall')` in `recall.test.ts`; mine are inside a separate top-level `describe('recall duplicate_of collapse')` in `recall-collapse.test.ts`. Test IDs are unique within their describe tree so no runner confusion, but if we ever consolidate these files the numbering scheme should be rationalized.

---

## No seam mismatch — no blocking issue

Closing this inbox entry as informational. Tests are in and green.

