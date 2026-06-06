# SKILL: Typed Provider Seam Across @akubly/types Boundary

**Author:** Graham (Lead / Architect)  
**Derived from:** Forge M3 — HintDispositionProvider (2026-06-05)  
**Confidence:** HIGH — mirrors the ChangeVectorProvider pattern exactly; both seams follow the same 4-file structure  
**Applicable to:** Any new async signal/data source that needs to flow from Cairn into Forge (or any other consumer package)

---

## When to Use

Use this skill when:
1. A consumer package (Forge, Eureka, etc.) needs to read a new data signal from Cairn (or another producer)
2. The signal is async (may query a DB, remote API, etc.)
3. The consumer package must NOT import from the producer package directly

---

## Pattern (4 Steps)

### Step 1 — Define the contract in `@akubly/types`

```typescript
// packages/types/src/index.ts

/** Per-entry summary shape (one entry per natural grouping key). */
export interface MySummary {
  skillId: string;
  groupKey: string;   // whatever your natural grouping is
  // ... aggregated data fields ...
}

/**
 * Async source of <description> data. Concrete impl lives in @akubly/cairn.
 * Phase 5 may fetch from remote telemetry.
 */
export interface MyProvider {
  getMyData(skillId: string): Promise<MySummary[]>;
}
```

**Decision rules:**
- No implementation details in the interface — just the query shape and return shape
- `skillId` as primary key for prescriber-context providers (one prescriber run = one skillId)
- `Promise<T[]>` return — consumer must always handle empty array as valid no-data case

---

### Step 2 — Implement the concrete adapter in `@akubly/cairn`

```typescript
// packages/cairn/src/db/sqliteMyProvider.ts

import type Database from 'better-sqlite3';
import type { MyProvider, MySummary } from '@akubly/types';

export class SqliteMyProvider implements MyProvider {
  constructor(private readonly db: Database.Database) {}

  async getMyData(skillId: string): Promise<MySummary[]> {
    const rows = this.db.prepare<[string], { group_key: string; /* ... */ }>(`
      SELECT ...
      WHERE skill_id = ?
      GROUP BY ...
    `).all(skillId);

    return rows.map((row) => ({
      skillId,
      groupKey: row.group_key,
      // ...
    }));
  }
}
```

Then export from `packages/cairn/src/index.ts`:
```typescript
export { SqliteMyProvider } from './db/sqliteMyProvider.js';
```

---

### Step 3 — Add optional field to the orchestrator options

```typescript
// packages/forge/src/prescribers/forgePrescriberOrchestrator.ts

import type { MyProvider, MySummary } from '@akubly/types';

export interface ForgePrescriberOrchestratorOptions {
  provider?: ChangeVectorProvider;       // existing
  myProvider?: MyProvider;               // new
  config?: PrescriberConfig;
}

export async function runForgePrescribers(...) {
  // fail-open pattern — ALWAYS use this exact shape:
  let myData: MySummary[] | undefined;
  if (options.myProvider) {
    try {
      myData = await options.myProvider.getMyData(skillId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[forge] MyProvider.getMyData failed for skill=${skillId}: ${message} (fail-open: proceeding without my data)`,
      );
      myData = undefined;
    }
  }

  // ... use myData in hint generation ...
}
```

---

### Step 4 — Wire injection in `skillsmith-runtime`

```typescript
// packages/skillsmith-runtime/src/runtime.ts

const provider = new cairn.SqliteChangeVectorProvider(db);
const myProvider = new cairn.SqliteMyProvider(db);
const hints = await forge.runForgePrescribers(profile, skillId, { provider, myProvider });
```

---

## Checklist

- [ ] Interface defined in `@akubly/types` (NOT in cairn or forge)
- [ ] Concrete adapter in `@akubly/cairn/src/db/sqlite<Name>Provider.ts`
- [ ] Exported from `@akubly/cairn/src/index.ts`
- [ ] Optional field in `ForgePrescriberOrchestratorOptions`
- [ ] `try/catch` fail-open with `console.warn` in the orchestrator
- [ ] Guard: `if (data && data.length > 0)` before applying the data
- [ ] Provider wired in `skillsmith-runtime/src/runtime.ts`
- [ ] Unit tests: data → effect, empty → no-op, throws → fail-open, null provider → no-op
- [ ] Integration test: seed real events via `cairn.insertHintIfNew` + `cairn.logEvent`, call `executePrescriberRun`, assert effect
- [ ] Build clean after each step

---

## Integration Test Pattern (Tester-Added, Laura — M3 Hardening)

Integration tests for typed provider seams must verify the full Cairn→runtime→forge chain. See `packages/skillsmith-runtime/src/__tests__/dispositionIntegration.test.ts` for the reference implementation.

### Critical pitfalls

**1. Seed order matters:** Seed the underlying data rows AND emit events BEFORE calling `executePrescriberRun`. The DB is queried at call time.

**2. INNER JOIN awareness:** The SQLite adapter uses INNER JOIN on the source table (e.g., `optimization_hints`). A well-formed event that references a non-existent row will be silently excluded. Always seed the referenced row first.

**3. `result.hints` vs inserted hints:** `executePrescriberRun` sets `result.hints` before the hint-insertion loop. Assertions on hint content (category, confidence) reflect the post-`applyDispositions` state — insertion deduplication does NOT affect them.

**4. No "dispositionless baseline" through `executePrescriberRun`:** The runtime always wires the provider. If you need a before/after comparison, run the baseline BEFORE seeding any events, OR use the known prescriber thresholds to reason about expected output without a dynamic baseline.

**5. Prefer `resolveOptimizationHint` for event emission:** `resolveOptimizationHint` is exported from `@akubly/cairn` and is the recommended path — it handles hint lookup, status transition, and event emission in one call. Use `cairn.insertHintIfNew` + `cairn.logEvent` + `cairn.ensureSystemSession` only for adversarial tests where you need fine-grained control (e.g., setting `source='system'`, emitting with an absent source field, or emitting events that reference non-existent hints).

### Confidence ceiling fixture

To test the `Math.min(1, ...)` clamp in a hint boost:
- Use `sessionCount=9` → prescriber generates hints with `confidence = Math.min(1, 9/10) = 0.9`
- With `RESOLVED_CONFIDENCE_BOOST = 1.2`: `0.9 * 1.2 = 1.08` → clamped to `1.0`
- Assert `confidence === 1.0` (exact equality, not `toBeCloseTo`)

---

## Precedents

| Provider | Interface | Concrete | Wired in |
|----------|-----------|----------|----------|
| `ChangeVectorProvider` | `@akubly/types` | `SqliteChangeVectorProvider` | `runtime.ts:executePrescriberRun` |
| `HintDispositionProvider` | `@akubly/types` | `SqliteHintDispositionProvider` | `runtime.ts:executePrescriberRun` |

---

## Why Not Extend the Existing Provider?

When a new signal has a different semantic axis from an existing provider:
- **Don't add methods to `ChangeVectorProvider`** — it would violate SRP and break every existing mock
- **Do add a sibling provider** — each provider has one responsibility, one failure mode, one set of tests
- The orchestrator aggregates them independently with independent fail-open semantics

---

*Skill created 2026-06-05 by Graham during Forge M3.*
