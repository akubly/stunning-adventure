# SKILL: runtime-cli-subcommand

Add a new standalone CLI sub-command to `@akubly/runtime-cli`.

---

## When to use

Use this skill when adding a new `forge-<verb>` operator command to `packages/runtime-cli/`. Each sub-command is a standalone binary with its own logic module and entry point — not a flag on an existing command.

---

## Pattern

### 1. Logic module (`src/<name>/`)

Split the sub-command's logic into 3 files:

| File | Responsibility |
|------|---------------|
| `types.ts` | Input/output types. Stable JSON schema contract — document additive-only policy. |
| `load<Name>.ts` | Core query logic. Accepts an `options` object; opens DB via `getDb(dbPath)`; returns the typed output. |
| `formatters.ts` | Pure output formatters: `formatJson(data)` → string, `formatTable(data)` → string. No side effects. |

### 2. Entry point (`src/forge-<name>.ts`)

```typescript
#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { closeDb, getKnowledgeDbPath } from '@akubly/cairn';
import { load<Name> } from './<name>/load<Name>.js';
import { formatJson, formatTable } from './<name>/formatters.js';

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      skill: { type: 'string' },
      format: { type: 'string' },
      'repo-key': { type: 'string' },
      db: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  // ...validate, call load<Name>, format, print...
  closeDb();
  return 0;
}

main().then(code => { process.exitCode = code; }).catch(...);
```

### 3. Register the binary

In `packages/runtime-cli/package.json`:
```json
"bin": {
  "forge-prescribe": "dist/cli.js",
  "forge-<name>": "dist/forge-<name>.js"
}
```

---

## Output format convention

- **JSON default** (`--format json`): `JSON.stringify(data, null, 2)`
- **Table opt-in** (`--format table`): sectioned key-value rows, 32-char label column

`--repo-key` is optional on all commands; omit → fall back to `getMostRecentUserSession()`.

---

## Tests (`src/__tests__/forge<Name>.test.ts`)

| Group | What to test |
|-------|-------------|
| `formatJson` unit | Valid JSON, stable schema, null fields |
| `formatTable` unit | All section headers present, key values visible |
| `load<Name>` integration | No-profile graceful error, fresh profile, stale profile (set `prescriber_state.sessions_since_install` directly), tier fallback, session fallback |

### Staleness seeding in tests

**Do NOT** use `createSession()` to drive staleness. `getSessionsSinceInstall()` reads from `prescriber_state`, not from the sessions table. Seed it directly:

```typescript
db.prepare('UPDATE prescriber_state SET sessions_since_install = 60 WHERE id = 1').run();
```

---

## Build & test

```bash
cd packages/runtime-cli && npx tsc          # type check
npm test --workspace=@akubly/runtime-cli    # run tests
```

---

## Gotchas

1. **`getSessionsSinceInstall` ≠ session row count.** It reads `prescriber_state.sessions_since_install` — an explicitly incremented counter, not `COUNT(*) FROM sessions`.
2. **Defensive W5-5 event queries.** When querying event types that may not exist yet (e.g. `prescriber_run`), distinguish `null` (type never written) from `[]` (type exists, no matches). Wrap in try/catch.
3. **W5-2 compliance.** All Cairn DB helpers require `db: Database.Database` as the explicit first arg. Never rely on a singleton fallback.
4. **Import order.** TypeScript strict mode requires all `import` statements before any top-level `const`/`let` declarations.
