# SKILL: mcp-tool-registration

**Scope:** `@akubly/skillsmith-runtime` and any future tool-bearing package  
**Discovered:** W5-5 (forge_prescribe MCP tool, 2026-05-26)  
**Pattern owner:** Rosella

---

## When to use this skill

Use this skill when adding a new MCP tool to `@akubly/skillsmith-runtime` (or any package that cannot live in `@akubly/cairn` due to circular deps).

---

## Pattern: Forge-scoped MCP server

### 1. Directory structure

```
packages/skillsmith-runtime/src/mcp/
  handler.ts   ← testable business logic (no server bootstrap)
  server.ts    ← MCP server wiring + bin entrypoint
```

### 2. handler.ts template

Extract the tool logic into `handler.ts` with a dependency-injectable orchestrator function. This pattern avoids ESM `vi.mock()` complexity in tests.

```typescript
import type Database from 'better-sqlite3';
import * as cairn from '@akubly/cairn';
import { runForgePrescribe as defaultRun } from '../index.js';
import type { ForgePrescribeResult } from '../index.js';

export type RunForgePrescribeFn = (
  opts: Parameters<typeof defaultRun>[0],
) => Promise<ForgePrescribeResult>;

export interface McpToolResult {
  [key: string]: unknown;   // REQUIRED — MCP SDK expects index signature
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export async function myToolHandler(
  db: Database.Database,
  args: { skill_id: string; ... },
  run: RunForgePrescribeFn = defaultRun,
): Promise<McpToolResult> {
  // 1. Session resolution (W5-1 pattern)
  const session = args.repo_key
    ? cairn.getActiveUserSession(db, args.repo_key)
    : cairn.getMostRecentUserSession(db);

  // 2. Business logic ...
  const result = await run({ skillId: args.skill_id, ... });

  // 3. CairnEvent observability
  const logTarget = session?.id ?? cairn.ensureSystemSession(db);
  cairn.logEvent(db, logTarget, 'my_event_type', { ... ts: new Date().toISOString() });

  // 4. Return
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    isError: !result.ok,
  };
}
```

### 3. server.ts template

```typescript
#!/usr/bin/env node
import path from 'node:path'; import url from 'node:url'; import fs from 'node:fs';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as cairn from '@akubly/cairn';
import { myToolHandler } from './handler.js';

const esmRequire = createRequire(import.meta.url);
const pkg = esmRequire('../../package.json') as { version: string };

const server = new McpServer(
  { name: 'forge', version: pkg.version },
  { capabilities: { tools: {} } },
);

function ensureDb() { return cairn.getDb(); }  // refresh on each call

server.registerTool('my_tool', {
  title: 'My Tool',
  description: '...',
  inputSchema: {
    skill_id: z.string().describe('...'),
    force: z.boolean().optional().describe('...'),
    repo_key: z.string().optional().describe('...'),
  },
}, async ({ skill_id, force, repo_key }) => {
  try {
    return await myToolHandler(ensureDb(), { skill_id, force, repo_key });
  } catch (err: unknown) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true };
  }
});

async function main() {
  await server.connect(new StdioServerTransport());
}

function checkIsScript(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const resolvedPath = path.resolve(argv1);
  let resolvedArgv: string;
  try { resolvedArgv = url.pathToFileURL(fs.realpathSync(resolvedPath)).href; }
  catch { resolvedArgv = url.pathToFileURL(resolvedPath).href; }
  return importMetaUrl === resolvedArgv;
}

if (checkIsScript(import.meta.url)) {
  main().catch(err => { process.stderr.write(`Forge MCP server failed: ${String(err)}\n`); process.exit(1); });
}
```

### 4. package.json additions

```json
{
  "bin": { "forge-mcp": "dist/mcp/server.js" },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "zod": "^4.3.6"
  }
}
```

### 5. Test pattern

```typescript
import { myToolHandler, type RunForgePrescribeFn } from '../mcp/handler.js';

beforeEach(() => { cairn.closeDb(); cairn.getDb(':memory:'); });
afterEach(() => { vi.restoreAllMocks(); cairn.closeDb(); });

it('returns result and emits event', async () => {
  const db = cairn.getDb();
  cairn.createSession(db, 'org/repo', 'main');

  const stub: RunForgePrescribeFn = vi.fn().mockResolvedValue({ ok: true, ... });
  const result = await myToolHandler(db, { skill_id: 'x', repo_key: 'org/repo' }, stub);

  expect(result.isError).toBeFalsy();
  const events = cairn.getUnprocessedEvents(db, 0);
  expect(events.find(e => e.eventType === 'my_event_type')).toBeDefined();
});
```

---

## Key invariants

1. **Index signature on McpToolResult** — `{ [key: string]: unknown; content: ...; isError?: ... }`. Without it, TypeScript rejects the return type at `registerTool`.
2. **W5-2: explicit db** — all cairn DB helpers (`logEvent`, `getActiveUserSession`, etc.) take explicit `db` first arg. Call `ensureDb()` in the server callback and pass it down.
3. **W5-1: session kind** — use `getActiveUserSession` / `getMostRecentUserSession` (not `getActiveSession` / `getMostRecentActiveSession`) to exclude `__system__` sessions from user-facing events.
4. **CairnEvent fallback** — if no user session found, fall back to `ensureSystemSession(db)` so events are never silently lost. Set `session_id: null` in the payload to signal missing attribution.
5. **No migration needed for new event types** — `event_log.event_type` is schemaless text; define the payload shape as a TypeScript interface for documentation only.
6. **Circular dep guard** — if the tool depends on `skillsmith-runtime`, it cannot live in `cairn`. Add a new server in `skillsmith-runtime/src/mcp/` and register it separately in `.mcp.json`.
