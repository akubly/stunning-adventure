# Storage Survey — Eureka Data Layer (M7-C Prerequisite)

**Date:** 2026-05-31
**Author:** Crispin (Knowledge Representation Specialist)
**Branch:** `eureka/m7-c-factreader`
**Status:** DECISION MADE — in-memory FactReader (option i)

---

## Survey Findings

### 1. Does Eureka have a persistence layer?

**No.** As of `eureka/m7-bd-narrowing-regression`, the `packages/eureka/src/` directory
contains only two top-level items:

```
packages/eureka/src/
  activities/
    __tests__/
    errors.ts
    recall.ts
  index.ts
```

There is no `storage/`, `db/`, `persistence/`, or `adapter/` directory. No database
driver is installed. The `package.json` `dependencies` field contains only `@akubly/types`.
No `better-sqlite3`, `sqlite`, or any other persistence dependency is present.

**Storage is 100% mock-only today.** Every test injects structural mocks for FactReader
and TrustUpdater — there is no real implementation of either seam anywhere in the codebase.

### 2. What shape of fact data exists?

The existing `FactReader` interface (recall.ts:245-247) defines:

```typescript
export interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}
```

The return shape carries only `{ trust: number }`. The `FactStore.search()` seam (used by
the recall pipeline) returns a richer `RecallResult`:

```typescript
interface RecallResult {
  content: string;
  trust: number;
  attentionTier: 'hot' | 'warm' | 'cold';
  relevance?: number;
  importance?: number;
  lastAccessed?: number;
}
```

There is no DB schema, column definitions, or migration files — no persistence layer has
been built yet. `FactReader` is a pure interface seam today.

### 3. v1 Scope Options

**(i) In-memory FactReader** backed by `Map<factId, Array<{trust, sessionId}>>`.
- No new dependencies
- Immediately testable and usable in dev/integration contexts
- Defers real persistence without blocking the contract test requirement
- A future SQLite impl can plug into the same contract suite

**(ii) better-sqlite3-backed FactReader**
- Would require adding `better-sqlite3` + `@types/better-sqlite3` to eureka's dependencies
- No existing DB idiom in Eureka to follow (no migrations, no connection management)
- Would need a DB schema decision (table name, columns, indexes) — schema design belongs
  to a later milestone once the full FactStore shape is locked
- Premature: introducing SQLite before FactStore.search() has a real implementation means
  we'd be building two uncoordinated partial storage layers

**(iii) Both: in-memory for tests, SQLite for production**
- SQLite half is premature for the same reasons as (ii)
- Defers cleanly: the contract suite makes adding SQLite in M8+ trivially safe

### 4. Decision

**Chosen: option (i) — In-memory FactReader.**

Rationale:
- No persistence layer exists; introducing SQLite now would be a forward-jump past the
  FactStore contract work that Crispin owns (representation layer, schema migrations)
- The M7-C brief explicitly scopes FactReader as a "pure-read use case (recall pipeline,
  display, debugging)" — the in-memory form is sufficient for all three
- The contract test suite is the primary deliverable; a real storage backend wires in later
- Adding SQLite requires a schema decision that should be made alongside FactStore.search()
  (same table, same migration) — doing it now would force a premature schema

**Deferred:** SQLite-backed FactReader is tracked as M8-storage (schema + persistence layer).
The contract test suite (`runFactReaderContract`) is designed so any future implementation
can be verified by passing its factory to the shared suite — no test rewriting required.

---

## Cross-Coordination Notes

No constraints discovered that affect Edgar's atomicity contract. The storage survey confirms:
- TrustUpdater and FactReader are both mock-only today
- The `applyFeedbackById` read-then-write path is unaffected by the in-memory FactReader
- Edgar's `mutate` callback design can proceed independently on `eureka/m7-c-atomicity`
