# Decision Drop — M7-C FactReader Complete (Crispin)

**Author:** Crispin (Knowledge Representation Specialist)
**Date:** 2026-05-31
**Branch:** `eureka/m7-c-factreader`
**Status:** COMPLETE — local branch, awaiting coordinator merge with `eureka/m7-c-atomicity`

---

## Implementation Chosen

**In-memory FactReader** (option i from storage survey).

No SQLite. No new dependencies. `Map<factId, FactRecord[]>` backed, session-scoped.

See `.squad/decisions/inbox/crispin-m7-c-storage-survey.md` for full survey + rationale.

---

## File Layout

```
packages/eureka/src/storage/
  fact-reader.ts                           ← InMemoryFactReader implementation
  __tests__/
    fact-reader.contract.test.ts           ← Contract suite + wiring to InMemoryFactReader

.squad/decisions/inbox/
  crispin-m7-c-storage-survey.md          ← Storage survey + decision drop
  crispin-m7-c-complete.md                ← This file
```

---

## Test Count

| Scope                       | Tests |
|-----------------------------|-------|
| Baseline (pre-M7-C)         | 62    |
| New contract tests (M7-C)   | 5     |
| **Total**                   | **67** |

All 67 pass. `npm test --workspace=@akubly/eureka` green.
Build clean: `npm run build --workspace=@akubly/eureka` exits 0.

---

## Contract Test Pattern

`runFactReaderContract(implName, makeHarness)` — a shared helper exported from
`fact-reader.contract.test.ts`. Any FactReader implementation registers itself by
calling this function with a factory that returns `{ reader: FactReader, seed: SeedFact }`.

Contract invariants:
- **CL-1** Read existing fact → `{trust: 0.5}` returned
- **CL-2** Read missing fact → `null` returned (never `undefined`)
- **CL-3** Session isolation → wrong session returns `null`
- **CL-4** Trust passthrough → `NaN` not filtered at read layer; caller validates
- **CL-5** Shape contract → result carries numeric `trust` field

Adding a new implementation requires zero test duplication — one `runFactReaderContract(...)`
call, 5 tests automatically.

---

## InMemoryFactReader API

```typescript
import { InMemoryFactReader } from '@akubly/eureka/storage/fact-reader.js';

const store = new InMemoryFactReader();

// Seed (test/dev helper — not part of FactReader interface)
store.seed('fact-id', sessionId, 0.75);

// Read (implements FactReader interface)
const result = await store.read({ factId: 'fact-id', sessionId });
// → { trust: 0.75 } | null
```

Key properties:
- SessionId-scoped: same factId under different session → `null`
- Trust passthrough: `NaN`, out-of-range etc. returned as-is; validation is caller's job
- No connection lifecycle: owns its own Map; no constructor args needed

---

## Branch Name

`eureka/m7-c-factreader` (branched from `eureka/m7-bd-narrowing-regression`, same parent as Edgar's `eureka/m7-c-atomicity`)

## Commits

```
58125b8  feat(eureka): storage survey + FactReader contract test suite
```

(Storage survey decision drop, implementation, and contract tests co-delivered in one commit.)

---

## Cross-Coordination

Edgar's `eureka/m7-c-atomicity` removes `FactReader` from `ApplyFeedbackByIdDeps` (the read+write collapse into `mutate`). This is expected — FactReader survives for:
- The recall pipeline (`recall.ts` uses FactStore.search; FactReader is for direct trust reads)
- Pure-read use cases (display, debugging, inspection)
- Crispin's contract test suite (this deliverable)

No constraints discovered that affect Edgar's atomicity contract. No `crispin-m7-c-needs-edgar.md` required.

---

## Deferred

- **SQLite FactReader** — deferred to M8-storage when FactStore.search() schema is locked.
  Wire-in: implement `FactReader`, create a harness, call
  `runFactReaderContract('SqliteFactReader', makeHarness)`.
- **Export from index.ts** — `InMemoryFactReader` is not yet exported from the public API.
  Exportability decision deferred to the storage layer milestone.
