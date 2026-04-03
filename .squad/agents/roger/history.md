# Roger — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Platform Dev
- **Joined:** 2026-03-28T06:21:47.379Z

## Learnings

### Core Learning Archive (Pre-Phase 6)

**Copilot SDK & Extensibility Landscape:**
- Three SDK layers: CLI SDK (embedding), Extensions SDK (distribution, SSE streaming), Engine SDK (custom agents).
- MCP (Model Context Protocol) is the universal tool integration standard across all three layers.
- Extensions have two patterns: Skillsets (lightweight REST, GitHub handles AI) vs Agents (full control).
- MCP config locations: `.vscode/mcp.json` (workspace), `~/.copilot/mcp-config.json` (user), `.copilot/mcp.json` (repo).
- Auth evolution: X-GitHub-Token → OIDC signature verification.
- Copilot CLI SDK supports BYOK (Bring Your Own Key) for OpenAI, Azure, Anthropic.

**Code Patterns Established:**
- SQLite datetime normalization: `YYYY-MM-DD HH:MM:SS` → ISO-8601 before parsing (T separator + Z suffix).
- `parseSqliteDateToMs()` shared utility in src/utils/timestamps.ts.
- `isScript` guard pattern: `url.pathToFileURL(path.resolve(process.argv[1])).href` for reliable module scope detection.
- DB cleanup: `dbOpened` + `finally` is canonical pattern for hook entry points.
- Git cost in hooks acceptable (~10ms) because Node startup + DB open (~400ms) dominate budget.
- Migration assertions: db.test.ts must update both expected migration count and max schema_version on migration addition.

**MCP Server Implementation:**
- `McpServer` (high-level) + `StdioServerTransport` from SDK v1.29.
- `registerTool(name, config, callback)` with `{ title, description, inputSchema, annotations }`.
- `inputSchema` takes Zod v4 raw shape (plain object), not `z.object()`.
- Tool callbacks async, return `{ content: [{ type: 'text', text: string }] }`.
- DB singleton pattern: call `ensureDb()` in each handler.
- Verb taxonomy: get (single) | list (collection) | search (query) | run (side effect) | check (boolean).
- 6 tools: get_status, list_insights, get_session, search_events, run_curate, check_event. All unprefixed verb_noun.
- Test backing functions, not transport.

**Rounds 1–5 learnings tracked in previous history entries (archived).**

<!-- Append new learnings below -->

### 2026-03-28: Copilot SDK & Platform Extensibility Recon

- **Three SDK layers exist:** (1) `@github/copilot-sdk` — embed the full Copilot agentic engine in any app via JSON-RPC to CLI server mode (TS, Python, Go, .NET, Java). Technical Preview. (2) `@copilot-extensions/preview-sdk` — build Copilot Chat extensions as GitHub Apps with SSE response streaming. Alpha but semver-safe. (3) `@github/copilot-engine-sdk` — build custom engines for the coding agent platform with platform events, git ops, and MCP. Very early.
- **Extensions have two patterns:** Skillsets (lightweight, up to 5 REST endpoints, GitHub handles AI) vs Agents (full control, you manage LLM orchestration). Mutually exclusive per extension.
- **MCP is the tool integration standard.** Config lives in `.vscode/mcp.json` (workspace), `~/.copilot/mcp-config.json` (user), or `.copilot/mcp.json` (repo). Servers can be stdio (local process) or http (remote). SDKs available in Python, TS, C#, Java, Kotlin.
- **Coding agent runs in GitHub Actions containers,** triggered by issue assignment to `@copilot`. Environment controlled by `copilot-setup-steps.yml`. Creates PRs but never merges them.
- **Auth is evolving:** Extensions moving from `X-GitHub-Token` to OIDC. Signature verification uses `X-GitHub-Public-Key-Identifier` / `X-GitHub-Public-Key-Signature` headers with keys from `api.github.com/meta/public_keys/copilot_api`.
- **Copilot CLI SDK supports BYOK** (Bring Your Own Key) — use OpenAI, Azure, Anthropic keys without GitHub auth.
- **For a plugin marketplace:** The CLI SDK (`@github/copilot-sdk`) is the embed story, Extensions are the distribution model, MCP is the tool protocol, and agents/skills are the local customization layer.

### 2026-03-28: Cross-Team Recon Awareness

**Graham (Lead)** researched the full Copilot extensibility landscape and identified plugin.json as the canonical distribution unit with seven-layer composition model. Established that MCP is the integration standard and GitHub App extensions are sunsetting.

**Rosella (Plugin Dev)** surveyed plugin marketplaces and found awesome-copilot as the dominant center with 170+ agents, 240+ skills, 55+ plugins. Confirmed SKILL.md and plugin.json as canonical formats. Recommends integrating with awesome-copilot rather than building custom marketplace.

**Gabriel (Infrastructure)** inventoried prior infrastructure and identified 7 directly reusable patterns plus innovations in knowledge taxonomy and persona review. Recommends adopting proven patterns as foundation, with context engineering and context replication as priorities.

**Outcome:** Roger's three SDK layers now have clear use cases mapped to Graham's plugin architecture and Rosella's marketplace strategy. MCP emerges as the universal integration protocol across all three SDK layers. Gabriel's infrastructure foundation supports the architectural decisions from all three specialists.

### PR #9 Round 2: SQLite Timestamp Parsing & isScript Guard

- **SQLite `datetime('now')` produces `YYYY-MM-DD HH:MM:SS`** — `new Date(...)` may return NaN on this format in some JS engines. Always normalise to ISO-8601 (replace space with `T`, append `Z`) before parsing.
- **Extracted `parseSqliteDateToMs()` to `src/utils/timestamps.ts`** — shared utility replaces inline normalization in curator.ts and is now used by sessionStart.ts. Returns `null` on failure for explicit handling.
- **`isScript` guard pattern**: `import.meta.url === \`file:///\${process.argv[1]...}\`` breaks with relative paths. Correct pattern: `url.pathToFileURL(path.resolve(process.argv[1])).href`. Applied to both hook entry points.
- **Tests must match real DB formats**: backdating tests should use SQLite datetime format, not `toISOString()`, to catch format-specific parsing bugs.
- **Fail-safe principle (REVISED in round 3)**: when timestamp parsing fails in `isStaleSession()`, treat the session as **stale** (`return true`) — fail toward recovery. A false-positive (recovering a live session) is correctable because postToolUse creates a new session immediately; a false-negative (ignoring an orphan with a garbage timestamp) leaves it permanently stuck on the fast path.
- **`parseSqliteDateToMs` normalization order**: always replace space→T when a space is present (unconditional), then only append Z when no explicit timezone exists. The old logic (`endsWith('Z')` skip) broke on `YYYY-MM-DD HH:MM:SSZ` — space wasn't replaced but Z was already present, producing an unparseable hybrid.
- **Git cost in hooks is acceptable**: `git remote get-url origin` (~10ms) runs before the fast-path check because `getActiveSession()` needs a repo-scoped key. Node startup + DB open (~400ms) dominate the budget; restructuring to avoid the git call adds complexity for negligible savings. Document the trade-off rather than fighting it.
- **PR comment pagination**: `gh api .../pulls/9/comments` defaults to 30 results. Use `?per_page=100` when looking for recent round-3 comments that may be beyond the default page.

### PR #9 Round 4: event_log Index & postToolUse finally Guard

- **Adding a migration bumps test assertions**: db.test.ts hard-codes the expected migration count and max schema_version. Always update both assertions when adding a new migration.
- **`ORDER BY col DESC LIMIT 1` > `MAX(col)` with a composite index**: When a compound index like `(session_id, created_at)` exists, `ORDER BY created_at DESC LIMIT 1` is a single B-tree seek. `MAX()` can't always leverage the index as efficiently.
- **`dbOpened` + `finally` is the canonical DB cleanup pattern**: Both `sessionStart.ts` and `postToolUse.ts` now use this pattern. Any future hook entry points that call `getDb()` should follow suit.

### 2026-04-02: Phase 5 Decision — MCP Server and verb_noun Tool Naming

- **Phase 5 is the MCP Server, not CLI.** Aaron agreed with Graham's prior decision (session cec99d3e) to skip CLI and go straight to MCP. Primary consumer is a Copilot agent, not a human at terminal. One presentation layer (MCP) eliminates CLI as dead code after MCP ships.
- **Tool naming: verb_noun, unprefixed.** Tools use imperative format (get_status, list_insights, search_events, run_curate, check_event). MCP host adds server prefix automatically (cairn-). Eliminates naming stutter. Aligns with CLI conventions (git status, npm list).
- **Verb taxonomy for predictable agent behavior:** get (single object) | list (collection) | search (query with filters) | run (side effect) | check (boolean). Verbs enable LLM agents to infer the right invocation pattern.
- **6 tools ship in Phase 5:** Status, insights, session summary, event search, curator run, event check. Each answers one natural question.
- **Team consensus reached:** Roger endorsed naming, Valanice added vocabulary contract insight (verbs establish semantic contracts), Graham finalized spec. Ready for implementation.

### Phase 5 Implementation: MCP Server

- **MCP SDK v1.29 uses `McpServer` (high-level) + `StdioServerTransport`.** Import from `@modelcontextprotocol/sdk/server/mcp.js` and `@modelcontextprotocol/sdk/server/stdio.js`. The older `Server` class is low-level — `McpServer` handles tool registration, schema validation, and JSON-RPC dispatch.
- **`registerTool()` is the current API.** The older `.tool()` method is deprecated. `registerTool(name, config, callback)` takes `{ title, description, inputSchema, annotations }` in config. `inputSchema` accepts a Zod v4 raw shape (plain object of Zod schemas), NOT a `z.object()` — the SDK wraps it internally.
- **Tool callbacks are async.** Return `{ content: [{ type: 'text', text: string }] }`. For errors, add `isError: true`.
- **DB singleton must be bootstrapped.** Call `getDb()` before any query function — the singleton pattern means first call initializes. In MCP context there's no hook entry point doing this, so each handler calls `ensureDb()`.
- **Zod v4 import is just `import { z } from 'zod'`.** The SDK's `zod-compat` layer handles v3/v4 detection automatically. No special imports needed.
- **6 tools registered:** `get_status`, `list_insights`, `get_session`, `search_events`, `run_curate`, `check_event`. All unprefixed verb_noun. `run_curate` uses `annotations: { readOnlyHint: false }` to signal side effects.
- **Tests validate tool-backing logic, not transport.** Testing the query functions directly is more reliable than standing up a stdio server in tests. 19 tests cover all 6 tool paths.

### Phase 5 Post-Review: Graham's APPROVE WITH CONDITIONS (Findings 1-5)

- **`isScript` guard applied to `server.ts`** — same pattern from PR #9 (`url.pathToFileURL(path.resolve(process.argv[1])).href`). Prevents `main().catch()` from firing when the module is imported by tests or other code.
- **Defensive try/catch in every tool handler** — all 6 handlers now wrap their bodies in try/catch, returning `{ isError: true }` with a JSON error message on failure. Error behavior is explicit, not dependent on SDK internals.
- **Session existence validation for `search_events` and `check_event`** — added lightweight `sessionExists()` to `sessionState.ts`. Both tools now return `isError: true` with "session not found" for nonexistent session IDs, consistent with `get_session`. Real sessions with no matching events still return normal empty results.
- **Version read from `package.json`** — replaced hardcoded `'0.1.0'` with `createRequire(import.meta.url)('../../package.json').version`. Single source of truth.
- **`readOnlyHint: true` annotations** — added to all 5 read-only tools (`get_status`, `list_insights`, `get_session`, `search_events`, `check_event`). `run_curate` already had `readOnlyHint: false`.
- **Finding #6 (MCP config entry) deferred** — deployment config, not code. Will handle separately.

### 2026-04-02: Phase 5 Complete — PR #10 Opened

**Deliverable:** src/mcp/server.ts with 6 tools, 19-test suite, updated package.json  
**Status:** PR #10 at https://github.com/akubly/stunning-adventure/pull/10  
**Quality:** 134/134 tests pass, clean build, zero lint issues

**Execution timeline:**
- 05:13Z — Graham Round 1 review: APPROVE WITH CONDITIONS (5 findings)
- 05:16Z — Applied all 5 fixes; 134 tests pass, no regression

### 2026-04-02: Phase 6 Hook Wrapper Scripts — PowerShell Implementation

**Task:** Create portable PowerShell hook wrappers for plugin distribution.

**Deliverable:**
- `.github/hooks/cairn/hooks.json` — Hook registration (coordination with Rosella)
- `.github/hooks/cairn/curate.ps1` — preToolUse wrapper
- `.github/hooks/cairn/record.ps1` — postToolUse wrapper

**Design: Two-Tier Path Resolution**

Both scripts implement fail-open pattern with portable path resolution:
1. **Primary:** `~/.cairn/hook/{sessionStart|postToolUse}.mjs` (after user-level install)
2. **Fallback:** Relative `$PSScriptRoot` path to repo `dist/hooks/` (dev mode)

**Implementation Pattern:**
```powershell
$hookScript = Join-Path $env:USERPROFILE '.cairn' 'hook' 'sessionStart.mjs'
if (-not (Test-Path $hookScript)) {
    $hookScript = Join-Path $PSScriptRoot '..\..\..\..' 'dist' 'hooks' 'sessionStart.js'
    if (-not (Test-Path $hookScript)) { exit 0 }
}
$raw | node $hookScript 2>$null
```

**Key Design Decisions:**
- Use $PSScriptRoot (not absolute paths) for repo layout portability
- Suppress stderr (2>$null) — hooks fail silently if node entry point fails
- Exit 0 on missing paths — fail-open principle
- Check $env:USERPROFILE path first — installed takes precedence over dev

**Status:** Ready for `src/install.ts` to copy to `~/.copilot/hooks/cairn/`. Bash wrappers (curate.sh, record.sh) deferred to Phase 7.

**Cross-team coordination:** Confirmed hooks.json ownership with Rosella (plugin manifest, her domain). These scripts are implementation detail of user-level hook installation (Roger's domain).
- 05:22Z — Graham Round 2 re-review: APPROVE (no new issues)
- 05:28Z — Commit, push, opened PR #10

**Key findings from implementation:**
- Zod v4 import pattern simplified by SDK's zod-compat layer
- DB singleton needs explicit ensureDb() in MCP context (no hook entry point)
- Tool-backing API testing strategy (19 tests) is faster and clearer than stdio transport testing
- Error shape `{ error: String(err), isError: true }` handles non-Error exceptions gracefully

**Review cycle quality:** Graham's 5 specific findings were all implemented cleanly in one pass. No rework needed. Pattern: precise review findings → single-pass fixes → fast approval.

**Next phase:** Awaiting merge. Phase 6 coordination orchestration scope TBD.

### PR #10 Round 3: search_events Hardening (Review Comments)

- **Empty LIKE patterns dump entire tables.** An empty `type_pattern` becomes `LIKE '%%'`, matching everything. Always validate non-empty input at the schema level (`.trim().min(1)` in Zod).
- **Unbounded result sets need a limit parameter.** Added `limit` (default 100, max 500) to `findEvents()` and the `search_events` tool schema. Always cap query results that surface to external consumers.
- **LIKE wildcards are a feature, not a bug.** Graham's correction: don't escape `%` and `_` — LIKE wildcard support is strictly more useful for LLM callers. Document the capability in the tool description instead of restricting it. Lesson: when the consumer is an LLM, expressive power > strict safety, as long as the query is parameterized (no injection risk).
- **Fixes applied:** `sessionState.ts` (LIMIT clause), `server.ts` (schema tightening + limit passthrough + wildcard-aware description), `mcp.test.ts` (+2 tests for limit and wildcard support). 136/136 tests pass, clean build, zero lint issues.
- **Comment 7 (wrapper test coverage) definitively deferred** by Graham.

### PR #10 Round 4: JSDoc Fix & Deferred Refactor

- **JSDoc `@param limit` added to `findEvents()`** — documents default 100, max 500. Review comment pointed out the parameter was undocumented after the Round 3 changes added it.
- **Response helper extraction (jsonText/jsonError) deferred.** Graham ruled it's a valid refactor but no behavioral impact — save for a follow-up PR. Don't mix refactors into a feature PR unless they carry behavioral weight.

### Portable Hook Wrappers — `.github/hooks/cairn/`

- **3-step resolution replaces hardcoded paths.** User override (`~/.cairn/hook/`) → npm global install (`npm root -g`) → `$PSScriptRoot` relative fallback. Eliminates machine-specific absolute paths.
- **`npm root -g` is the portable discovery mechanism.** ~50ms cost is acceptable within the 500ms hook budget. Only runs when user override isn't found.
- **`$PSScriptRoot` relative path for repo checkout fallback.** Scripts at `.github/hooks/cairn/` navigate `..\..\..` to reach `dist/hooks/`. Works regardless of where the repo is cloned.
- **hooks.json uses repo-relative paths.** The `powershell` field references `.github/hooks/cairn/*.ps1` — Copilot resolves these from repo root.
- **Fail-open pattern preserved.** `$ErrorActionPreference = 'SilentlyContinue'`, outer try/catch, and unconditional `exit 0` ensure hooks never break the user.
