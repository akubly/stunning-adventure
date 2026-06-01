# SKILL: cairn-mcp-tool-authoring

**Scope:** `packages/cairn/src/mcp/server.ts`  
**Discovered:** M1 (list_optimization_hints + resolve_optimization_hint, 2026-05-31)  
**Pattern owner:** Roger

---

## When to use this skill

Use this skill when adding a new MCP tool directly to the cairn MCP server (`packages/cairn/src/mcp/server.ts`). This is for tools that read from or write to the cairn DB and don't need cross-package separation.

> For tools that live outside cairn (e.g., forge-scoped tools), see `.squad/skills/mcp-tool-registration/SKILL.md` instead.

---

## Pattern: registering a new MCP tool in cairn

### 1. Add the tool in `server.ts`

```typescript
server.registerTool(
  'tool_name',                    // snake_case, verb_noun
  {
    title: 'Tool Display Name',
    description:
      'One-sentence purpose. ' +
      'What the caller gets back. ' +
      'When to use it.',
    inputSchema: {
      my_param: z
        .string()
        .describe('Description for the LLM. Include example values.'),
      optional_flag: z
        .boolean()
        .optional()
        .describe('What happens when omitted.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe('Max results (1–100, default 20).'),
    },
    annotations: { readOnlyHint: true },   // false for mutating tools
  },
  async ({ my_param, optional_flag, limit }) => {
    try {
      ensureDb();

      const result = myDbHelper(db, my_param, { limit });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      process.stderr.write(`[tool_name] error: ${String(err)}\n`);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Internal error ...' }) }],
        isError: true,
      };
    }
  },
);
```

### 2. Add the import

Add the new DB helper import at the top of `server.ts`, grouped with other cairn DB imports:

```typescript
import {
  myDbHelper,
  MyHelperType,
} from '../db/myModule.js';
```

### 3. Add the DB helper (if new)

All cairn DB helpers follow this signature convention:

```typescript
// packages/cairn/src/db/myModule.ts
export function myDbHelper(
  db: Database.Database,         // ALWAYS first — no getDb() singleton inside helpers
  id: string,
  options: { limit?: number } = {},
): MyRow | null {
  return db.transaction(() => {
    // ...
  }).immediate();
}
```

Key rules:
- **Explicit `db` injection** — no `getDb()` inside helpers (getDb() is for agent-level orchestration only)
- **`IS ?` not `= ?`** for nullable column filters — handles NULL correctly in SQLite
- **`db.transaction().immediate()`** for any write (prevents dirty reads from concurrent transactions)

### 4. Add the migration (if schema change needed)

```typescript
// packages/cairn/src/db/migrations/017-my-change.ts
import type { Migration } from '../schema.js';

export const migration017: Migration = {
  version: 17,
  description: 'Short description of change',
  up(db) {
    // Guard for partial-schema test DBs: some tests create a DB at version N
    // without running earlier migrations, so referenced tables may not exist.
    const tableExists = (
      db.prepare(
        `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='my_table'`,
      ).get() as { n: number }
    ).n > 0;
    if (!tableExists) {
      process.stderr.write(
        '[migrationNNN] WARNING: my_table not found — skipping. Expected in partial-schema test DBs.\n',
      );
      return;
    }

    // Idempotency guard for ALTER TABLE (SQLite doesn't support IF NOT EXISTS):
    const cols = db.pragma('table_info(my_table)') as Array<{ name: string }>;
    if (cols.some((c) => c.name === 'my_column')) return;

    db.exec(`ALTER TABLE my_table ADD COLUMN my_column TEXT;`);
  },
};
```

Then in `schema.ts`:
1. Import the new migration
2. Append to the `migrations` array
3. Update any test that asserts `MAX(version) = N` or `COUNT(*) from schema_version = N`

Use `strftime('%Y-%m-%dT%H:%M:%fZ','now')` for ISO UTC timestamps — matches the project convention.

### 5. Write tests

Tests go in `packages/cairn/src/__tests__/`. Follow the existing pattern:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDb, closeDb } from '../db/index.js';
import { myDbHelper } from '../db/myModule.js';

let db: ReturnType<typeof getDb>;

beforeEach(() => {
  closeDb();
  db = getDb(':memory:');
});

afterEach(() => {
  closeDb();
});

describe('myDbHelper', () => {
  it('returns null for unknown id', () => {
    expect(myDbHelper(db, 'nope')).toBeNull();
  });

  it('round-trips a row', () => {
    // seed + assert
  });
});

describe('migration NNN schema', () => {
  it('my_table has my_column after migrations', () => {
    const cols = db.pragma('table_info(my_table)') as Array<{ name: string }>;
    expect(cols.map(c => c.name)).toContain('my_column');
  });
});
```

---

## Key invariants

1. **stdout is reserved for JSON-RPC** — never write to stdout in tool handlers or helpers. Use `process.stderr.write()` for diagnostics.
2. **`ensureDb()` in every handler** — refreshes the `db` module variable from `getDb()` so it survives `closeDb()` + reopen between requests.
3. **`confidenceToWords(n)`** — already exported from `server.ts` for high/medium/emerging labels on 0–1 scores.
4. **Idempotent resolve tools** — check terminal-state membership before transitioning; return `alreadyResolved: true` instead of erroring.
5. **Terminal hint statuses** — `applied, rejected, expired, suppressed, failed`. Active statuses (`ACTIVE_HINT_STATUSES`) = `pending, accepted, deferred`.
6. **Schema version assertions** — any test asserting `MAX(version) = N` must be bumped to `N+1` when adding a migration. Affected test files: `db.test.ts`, `discovery.test.ts`, `migration012.test.ts`, `prescriptions.test.ts`.

---

## Pattern: handler-level testability (extracted pure functions)

Extracting handler logic into exported pure functions enables handler-level tests without a full MCP harness:

```typescript
// In server.ts — export the core logic
export function buildMyToolResult(
  db: Database.Database,
  params: { id: string; limit: number },
): Record<string, unknown> | null {
  const row = getMyRow(db, params.id);
  if (!row) return null;
  return { id: row.id, /* ... */ };
}

// The MCP handler wraps the result
server.registerTool('my_tool', { ... }, async ({ id, limit }) => {
  try {
    ensureDb();
    const payload = buildMyToolResult(db, { id, limit });
    if (!payload) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `... not found.` }) }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
  } catch (err: unknown) {
    process.stderr.write(`[my_tool] error: ${String(err)}\n`);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Internal error ...' }) }], isError: true };
  }
});
```

Tests import the pure function from `server.ts` (safe — `if (isScript)` guard prevents server startup on import):

```typescript
import { buildMyToolResult } from '../mcp/server.js';

it('returns null for unknown id', () => {
  expect(buildMyToolResult(db, { id: 'nope', limit: 10 })).toBeNull();
});
```

---

## Zod field conventions (M1 cycle-1)

- **String id fields**: `.max(256)` as defense-in-depth: `z.string().max(256).describe('...')`
- **Free-text note fields**: `.max(1000)` to bound DB size: `z.string().max(1000).optional()`
- **Status enums**: export a `const` tuple from the DB module, use `z.enum(MY_STATUSES)` — never duplicate literals in server.ts
- **Nullable fields in response objects**: use `?? null` (not `?? undefined`) so the key is always present with a consistent shape

---

## Idiomatic already-resolved response shape

When a resolution tool is idempotent (hint/prescription already in terminal state):
- Set `resolution: null` — the caller's intent was NOT acted on
- Include `prior_status` — the actual state the hint was already in
- Set `already_resolved: true`

This prevents LLM consumers from misreading the response as a successful disposition.
