# Skill: London TDD — Integration Ring (Real Adapter, RED Phase)

**Skill ID:** `london-tdd-integration`
**Owner:** Laura Bow (Tester)
**Version:** 1.0
**Created:** 2026-06-06
**First application:** Crucible §4.1 Refactor 3 — `session-fork.integration.ts` (real SQLite)

---

## Purpose

After the unit ring (mocked collaborator) is GREEN, descend one ring inward to write **integration tests against a real adapter** (e.g. real SQLite `:memory:`). This skill encodes the descent from mocked-DB unit tests to a live-DB integration test: what changes, what must be deferred (RED), and how to author the fixture so Roger can go GREEN.

---

## When to Apply

- You have GREEN unit tests (mocked collaborator — e.g. `MockDB`).
- The next REFACTOR step is to replace the mock with a real adapter (SQLite, HTTP, filesystem).
- The real adapter **does not yet exist** — you are authoring the RED layer.
- Your job: write failing integration tests that specify EXACTLY what the adapter must implement.

---

## Ring Comparison

| | Unit ring | Integration ring |
|---|---|---|
| **DB** | Mocked (`vi.fn()`) | Real SQLite `:memory:` (via `createTestDatabase()`) |
| **Test file location** | `src/__tests__/unit/<class>.test.ts` | `src/__tests__/integration/<scenario>.integration.ts` |
| **vitest include** | `*.test.ts` | Add `*.integration.ts` to vitest config |
| **Fixture location** | Inline `makeMockDB()` | Shared `src/__tests__/fixtures/test-db.ts` |
| **RED signal** | `TypeError: ClassName is not a constructor` | `TypeError: createSQLiteDB is not a function` |
| **What it pins** | Collaborator contract (DB seam shape) | DB schema correctness + real persistence semantics |

---

## Steps

### 1. Update vitest config to include `.integration.ts` files

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.integration.ts'],
  },
});
```

Do this first — otherwise vitest ignores the integration file entirely (silent non-failure, worse than RED).

### 2. Identify the adapter symbol Roger must implement

Decide the factory name and where it will live:
- Factory: `createSQLiteDB(path: ':memory:' | string): <interface>`
- File: `packages/<core-pkg>/src/sqlite-db.ts`
- Export: added to barrel `index.ts`

The symbol does NOT exist yet. That is the RED invariant.

### 3. Write the test fixture (`createTestDatabase()`)

```typescript
// src/__tests__/fixtures/test-db.ts

import type { InMemoryDB } from '@akubly/crucible-core';

// 🔴 RED: createSQLiteDB is not yet exported — Roger must add it.
// @ts-expect-error — intentional: createSQLiteDB does not exist yet (Refactor 3 RED phase)
import { createSQLiteDB } from '@akubly/crucible-core';

export function createTestDatabase(): InMemoryDB {
  return (createSQLiteDB as (path: string) => InMemoryDB)(':memory:');
}
```

Key design points:
- `@ts-expect-error` suppresses TypeScript's "no export" error so the file compiles via esbuild; the runtime failure is the RED signal.
- Cast to the intended return type (`InMemoryDB`) — this is a contract assertion telling Roger what he must return.
- `':memory:'` — always use an in-memory SQLite DB for test fixtures (no disk I/O, no cleanup, fully isolated per call).
- The fixture belongs in the consuming package's `__tests__/fixtures/` (e.g. `crucible-cli`) unless multiple packages need it, in which case export from the core barrel with a "test isolation only" comment (see `resetInMemoryDb` pattern).

### 4. Write the integration test using the fixture

```typescript
// src/__tests__/integration/<scenario>.integration.ts

describe('<Scenario> — Integration (real SQLite :memory:)', () => {
  let db: InMemoryDB;
  let manager: SessionManager;

  beforeEach(() => {
    // 🔴 RED: throws `TypeError: createSQLiteDB is not a function`
    //   until Roger implements packages/crucible-core/src/sqlite-db.ts.
    db = createTestDatabase();
    manager = new SessionManager(db);
  });

  // ... tests using db.insertRootSession(), db.pushEvent(), manager.forkSession(), etc.
});
```

### 5. Reuse invariants from the unit ring — do not invent new semantics

The integration ring verifies the **same locked invariants** as the unit tests, but at the DB layer:
- Instead of `mockDB.insertSession.toHaveBeenCalledWith(...)`, use `db.getMetadata(childId).parentSessionId`
- Instead of `mockDB.getSession.mockResolvedValue({ledgerSize: 47})`, use real `db.insertRootSession` + `db.pushEvent` setup

Unit test: *"was the right thing called?"*  
Integration test: *"was the right thing stored and retrievable?"*

### 6. Set up test state using the extended interface methods

The `InMemoryDB` extensions (synchronous in better-sqlite3) are your setup tools:

```typescript
function buildParentWith47Events(db: InMemoryDB): string {
  const parentId = 'parent-session-id';
  db.insertRootSession(parentId, Date.now());
  for (let i = 0; i < 47; i++) {
    db.pushEvent(parentId, {
      primitiveKind: 'observation',
      primitivePayload: { content: `event-${i}` },
      causalReadSet: [],
      offset: i,
    });
  }
  return parentId;
}
```

Key: `insertRootSession` and `pushEvent` are **synchronous** (better-sqlite3 is sync). No `await`. Only the base `DB` methods (`getSession`, `insertSession`, `queryEvents`) are `async` (they return `Promise<...>`).

### 7. Document the schema in the fixture file

The fixture file is the authoritative schema spec for Roger. Include the full `CREATE TABLE` statements as a JSDoc comment:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id                  TEXT    PRIMARY KEY,
  parent_session_id   TEXT,
  fork_point_event_id INTEGER,
  plugin_versions     TEXT,    -- JSON blob | NULL
  created_at          INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  session_id          TEXT    NOT NULL REFERENCES sessions(id),
  "offset"            INTEGER NOT NULL,
  primitive_kind      TEXT    NOT NULL,
  primitive_payload   TEXT    NOT NULL,  -- JSON blob
  causal_read_set     TEXT    NOT NULL,  -- JSON blob
  PRIMARY KEY (session_id, "offset")
);
```

Note: `"offset"` is quoted because `OFFSET` is a reserved word in SQLite.

### 8. Note missing dependencies for Roger

`better-sqlite3` may not be in the target package's `devDependencies`. Document what Roger must add without modifying `package.json` yourself (unless it's a trivial single-line addition clearly within scope):

```
devDependency note for Roger:
  "better-sqlite3": "^12.8.0"
  "@types/better-sqlite3": "^7.6.13"
  (match the versions already present in packages/cairn and packages/eureka)
```

### 9. Verify RED, write handoff artifacts

```bash
npm test --workspace=@akubly/crucible-cli
```

Expected: integration tests all fail with `TypeError: createSQLiteDB is not a function`.  
Expected: acceptance + unit tests remain GREEN.  
Write decision inbox file. Append to history.

---

## What the decision inbox captures for the GREEN ring

1. Failing test path
2. Required adapter symbol + full signature
3. Schema (CREATE TABLE statements)
4. Package.json deps needed
5. Exact RED failure message (copy from test output)
6. Interface contract table (method names, sync vs async, semantics)

---

## RED Failure Pattern Reference

```
TypeError: (0 , createSQLiteDB) is not a function
 ❯ createTestDatabase src/__tests__/fixtures/test-db.ts:NN:NN
     return (createSQLiteDB as (path: string) => InMemoryDB)(':memory:');
            ^
 ❯ src/__tests__/integration/<scenario>.integration.ts:NN:NN

Test Files  1 failed | N passed (N+1)
     Tests  K failed | M passed (K+M)
```

The `(0 , createSQLiteDB)` pattern is vitest/Vite's CJS-interop indirect call form. It is not a test bug — it confirms the adapter is undefined (not exported), which is the correct RED signal.

---

## Anti-Patterns

| ❌ Don't | ✅ Do instead |
|---|---|
| Skip vitest config update | Integration files are ignored if `*.integration.ts` is not in `include` — no test runs, no RED, silent false pass |
| Put `better-sqlite3` imports in the production barrel | Adapter is SQLite-specific; use a separate `sqlite-db.ts` file |
| Try to import from a subpath that doesn't exist in the package's `exports` | Export from the main barrel + `@ts-expect-error`; subpaths require `exports` field plumbing that is a separate step |
| Use `db.getOwnEvents()` / `db.getMetadata()` from async code with `await` | These are synchronous in better-sqlite3 — calling `await sync_fn()` technically works but is misleading |
| Recreate parent-delegation logic in the integration test | Parent delegation is `session.ts`'s concern; the integration test verifies DB storage, not query delegation |

---

## Relationship to Other Skills

| Skill | Role |
|---|---|
| `london-tdd-first-red-test` | Authors the outermost acceptance ring |
| `london-tdd-first-green` | Makes acceptance test pass with simplest correct code |
| `london-tdd-layer-descent` | Descends to unit ring with mocked collaborator |
| **`london-tdd-integration`** | §4.1 Refactor 3 — replaces mocks with real SQLite (this skill) |
| `better-sqlite3-atomic-transaction` | SQLite transaction patterns for Roger's GREEN implementation |

---

## References

- `docs/crucible-tdd-strategy.md §4.1` — Refactor 3 (integration stub)
- `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts` — first application
- `packages/crucible-cli/src/__tests__/fixtures/test-db.ts` — first application fixture
- `.squad/decisions.md` § "Handoff: Crucible Refactor 3 RED — Integration Test for Real SQLite" (2026-06-06) — first application handoff
- `.squad/decisions.md` § "2026-06-06: OQ-2 LOCKED — Event-substrate topology = FEDERATE (Option B)" (2026-06-06) — OQ-2 FEDERATE decision (drives schema independence)
