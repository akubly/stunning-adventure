# SKILL: In-Memory SQLite Activity Smoke Test

**Version:** 1.0  
**Author:** Laura (M8 Slice D, 2026-06-06)  
**Context:** Eureka `recall()` end-to-end smoke test — applicable to any activity that depends on a SQLite-backed store seam

---

## Purpose

When a production factory (composition root) is being written in parallel but hasn't landed yet, prove the end-to-end activity path is wired correctly by driving real SQLite primitives directly. Two tests are sufficient for an +1/+2 smoke budget:

1. **Happy path** — seeded data round-trips end-to-end through real storage + the activity.
2. **No-match** — a non-matching query returns `[]` without throwing.

This is a **smoke test**, not an exhaustive re-audit. The storage contract suite and activity unit tests have already locked the internals. The smoke test proves the whole stack is assembled and operational.

---

## Recipe

### 1. Open a real in-memory DB via `openDatabase`

```typescript
import { openDatabase } from '../../db/openDatabase.js';

// openDatabase(':memory:') runs applyMigrations internally.
// path.dirname(':memory:') = '.' → mkdirSync is a no-op.
// WAL pragma degrades gracefully (stderr note, no throw).
const db = openDatabase(':memory:');
```

Use `openDatabase` (not bare `new Database(':memory:')`), so the smoke exercises the production open path including migration idempotency.

### 2. Seed via the same INSERT path production will use

```typescript
const stmt = db.prepare(
  'INSERT OR REPLACE INTO facts (fact_id, session_id, content, trust) VALUES (?, ?, ?, ?)',
);
stmt.run('fact-id', sessionId, 'content text here', 0.9);
```

This fires the `facts_ai` trigger → FTS5 index populated. Same path as the production writer.

### 3. Wire the activity via the production factory

```typescript
import { createSqliteRecallDeps } from '../../sqlite/deps.js';

// Production composition root — assembles { factStore, clock } from the DB handle.
const results = await recall({ query, sessionId, k }, createSqliteRecallDeps(db));
```

This exercises `createSqliteRecallDeps` (Roger's Slice D factory) — the real production entry point, not hand-assembled primitives.

### 4. Two smoke assertions

```typescript
// Happy path: content round-trips, ordering is sane
expect(results.length).toBeGreaterThanOrEqual(1);
expect(results[0].content).toBe('expected content');

// No-match path: returns [] cleanly
const empty = await recall({ query: 'unrelated-term', sessionId, k }, deps);
expect(empty).toEqual([]);
```

### 5. Lifecycle

```typescript
afterEach(() => { db.close(); });
```

---

## File Placement

| Layer | Preferred location |
|-------|--------------------|
| Activity smoke (tests the full stack from activity down) | `packages/<pkg>/src/activities/__tests__/<activity>-sqlite-smoke.test.ts` |
| Storage smoke (tests store + migration only) | `packages/<pkg>/src/storage/__tests__/<store>-sqlite-smoke.test.ts` |

---

## Watch-outs

- **WAL mode not available for `:memory:`**: `openDatabase(':memory:')` will emit a stderr line `[eureka] WAL mode not available (got 'memory')`. This is expected — not an error.
- **FTS5 trigger discipline**: seed MUST go through the `facts` table, not directly into `facts_fts`. Direct FTS5 inserts bypass the content-table sync and will diverge on UPDATE/DELETE.
- **Clock for smoke tests**: wall-clock (`{ now: () => Date.now() }`) is acceptable — don't mock time unless you're testing recency ordering specifically. Recency precision belongs in activity unit tests.
- **Budget**: +1 or +2 tests. A smoke test that grows into an exhaustive re-audit duplicates the contract suite and adds noise.
- **Factory TODO**: always leave a `TODO` marking where to switch from primitives to the factory once the composition root lands. Grep-target: `TODO(Slice D follow-up)` or similar.

---

## When to Use

- A new activity layer is being wired to a SQLite-backed store for the first time.
- The production composition root (factory) is being written in parallel and isn't yet merged.
- You want a fast sanity check that migrations, FTS5 triggers, and activity ranking all cooperate end-to-end before the full PR lands.

## When NOT to Use

- The contract suite already covers all the invariants you care about (no new end-to-end path is being exercised).
- The factory is already merged — use the factory directly, not the primitives.
- You need exhaustive edge coverage — that belongs in the contract + edges test files, not here.

---

## Example: Eureka recall() (M8 Slice D)

```typescript
// packages/eureka/src/activities/__tests__/recall-sqlite-smoke.test.ts
describe('recall() — end-to-end smoke: real SQLite + FTS5 stack', () => {
  let db: Database.Database;

  beforeEach(() => { db = openDatabase(':memory:'); });
  afterEach(() => { db.close(); });

  it('SD-1: seeded fact round-trips through real SQLite/FTS5', async () => { ... });
  it('SD-2: non-matching query returns empty array', async () => { ... });
});
```

Test count delta: +2. Full suite stays green. Build clean.
