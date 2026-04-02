# Roger — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Platform Dev
- **Joined:** 2026-03-28T06:21:47.379Z

## Learnings

<!-- Append learnings below -->

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
- 05:22Z — Graham Round 2 re-review: APPROVE (no new issues)
- 05:28Z — Commit, push, opened PR #10

**Key findings from implementation:**
- Zod v4 import pattern simplified by SDK's zod-compat layer
- DB singleton needs explicit ensureDb() in MCP context (no hook entry point)
- Tool-backing API testing strategy (19 tests) is faster and clearer than stdio transport testing
- Error shape `{ error: String(err), isError: true }` handles non-Error exceptions gracefully

**Review cycle quality:** Graham's 5 specific findings were all implemented cleanly in one pass. No rework needed. Pattern: precise review findings → single-pass fixes → fast approval.

**Next phase:** Awaiting merge. Phase 6 coordination orchestration scope TBD.
