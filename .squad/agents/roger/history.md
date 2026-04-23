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

### 2026-04-07: Platform Feasibility Brainstorm (Aaron's 9 Ideas)

- **event_log's JSON payload design is accidentally future-proof:** New signal types (model_call, decision_point, context_assembly, quality_signal) can be added without schema migrations. Just emit new event_type strings. The curator's cursor-based processing picks them up automatically.
- **Token cost tracking requires host integration:** Cairn doesn't make LLM calls — the host (Copilot CLI) does. `model_call` events need to come from the harness. This is an integration feasibility question before committing to schema work.
- **Slop is a quality problem, not an error problem:** The curator's three pattern types (recurring_error, error_sequence, skip_frequency) only catch error-flavored slop. Need a `quality_signal` pattern type for churn, retry storms, verbosity, and rejection cascades.
- **Materialized rollups beat re-scanning:** A `cost_summary` table aggregated by the curator during event processing avoids O(n) scans of the full event log for basic questions like "how many tokens this session?"
- **SQLite generated columns are useful for payload indexing:** `json_extract(payload, '$.model') VIRTUAL` gives queryable columns without widening the write path.
- **Priority stack for next platform work:** (1) model_call events + cost_summary, (2) quality detection rules in curator, (3) decision_point event type. Everything else is downstream or needs more design.
- **Full analysis written to `.squad/decisions/inbox/roger-brainstorm-platform.md`.**

### 2026-04-07: Copilot SDK Harness Feasibility Assessment

- **`@github/copilot-sdk` is real and buildable on.** Technical Preview but core primitives (CopilotClient, createSession, defineTool, hooks, events) are stable. Multi-language (TS, Python, Go, .NET, Java). JSON-RPC to embedded CLI process.
- **`assistant.usage` event solves token cost tracking.** Emits model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cost (billing multiplier), duration. No need to observe host traffic — we ARE the host.
- **SDK hook model maps directly to Cairn instrumentation.** Six hooks: onSessionStart, onUserPromptSubmitted, onPreToolUse, onPostToolUse, onSessionEnd, onErrorOccurred. Each maps to a Cairn event type and instrumentation point.
- **Event bridge is ~50 LOC.** The SDK emits structured events with typed payloads. Mapping to Cairn's event_log is a thin adapter: `session.on(event => logEvent(sessionId, mapType(event.type), event.data))`.
- **`session.usage_info` gives context window monitoring.** tokenLimit, currentTokens, messagesLength. Plus `session.compaction_complete` for compaction metrics.
- **OpenTelemetry is built in.** `TelemetryConfig` with OTLP endpoint + W3C trace context propagation. Free observability export.
- **Recommended architecture: Cairn as library inside the harness (Option A).** Same TypeScript runtime, import Cairn's DB/agents directly. Event bridge is in-process. Lowest latency, simplest deployment.
- **Existing hooks become legacy.** stdin-based hooks (sessionStart.ts, postToolUse.ts) still work for stock Copilot CLI users, but harness users get richer instrumentation via SDK hooks.
- **Full analysis written to `.squad/decisions/inbox/roger-copilot-sdk-harness.md`.**

### Phase 7F: MCP Tools + UX + Growth (Final Phase)

- **4 new MCP tools registered:** `list_prescriptions`, `get_prescription`, `resolve_prescription`, `show_growth` — bringing total to 10 tools.
- **Module-level proactive hint counter** works well for "max 1 per MCP server process lifecycle" — no need for DB-based tracking since MCP server processes are short-lived.
- **State guards on resolve_prescription** are essential: only `generated` prescriptions should be resolvable. Without guards, callers could corrupt lifecycle semantics by re-resolving terminal states.
- **Accept flow must handle apply failure:** `applyPrescription()` returns `{ success: false }` on failure but doesn't set the status to `failed` — the caller (MCP tool) must explicitly call `updatePrescriptionStatus(id, 'failed')`.
- **Defer flow re-read pattern:** After `deferPrescription()`, the in-memory object is stale. Must re-read via `getPrescription()` to get accurate `deferCount` before checking auto-suppress threshold.
- **Resolved patterns are heuristic:** "applied prescription + insight is stale" is a proxy for resolution, not proof. The show_growth tool presents this honestly.
- **Exported helpers for testing:** `confidenceToWords()` and `resetProactiveHintCounter()` are exported from server.ts so tests can validate UX formatting and counter behavior without transport.
- **Added `getInsight(id)` to insights DAL** — was missing from the DAL despite being needed by `get_prescription` for insight context lookup.
- **Test count:** 294 → 316 (22 new tests for Phase 7F).

### PR #13 Review Fixes

- **applyPrescription try/catch:** Must wrap in try/catch, not just check `{ success: false }`. Exceptions leave status stuck at 'accepted' otherwise. Both return-based and exception-based failure paths need 'failed' transition.
- **Proactive hint counter is per-session, not per-process:** Track `proactiveHintSessionGeneration` alongside the counter, reset when `getSessionsSinceInstall()` changes. Avoids stale counter in long-lived MCP servers.
- **N+1 batch pattern:** Added `getInsightsByIds()` to insights DAL — collects unique IDs, one `WHERE id IN (...)` query, map results in-memory. Standard batch-fetch pattern for DAL.
- **ordinal() edge cases:** 11/12/13 are 'th' (not 'st/nd/rd'). Must check `% 100` before `% 10`.

### 2026-04-08: Copilot SDK Spike — Day 1 (Hands-On Verification)

- **Circuit breaker PASSED:** `CopilotClient` and `CopilotSession` are real exports. `createSession()`, `resumeSession()`, `listSessions()`, `sendAndWait()` all exist with full type definitions. Session management API is exactly as documented.
- **86 event types, auto-generated from JSON schema:** Events are generated from `session-events.schema.json`, not hand-written. This suggests schema stability across versions. All 86 types from pre-spike research confirmed.
- **Zero dependency conflicts:** SDK's `zod ^4.3.6` matches Cairn's. `vscode-jsonrpc` and `@github/copilot` are new but non-conflicting. Build passes, all 427 tests pass.
- **Event bridge is ~120 LOC with extractors:** Core mapping is ~20 LOC (confirming pre-spike estimate), but payload extractors for selective field extraction add ~100 LOC. 22 of 86 events map to Cairn-relevant signals.
- **`defineTool` uses same Zod pattern as Cairn MCP tools:** Zero learning curve for tool definition — same `z.object()` schema approach.
- **Hooks are bi-directional:** SDK hooks can modify behavior (permission decisions, tool args), not just observe. More powerful than Cairn's stdin hooks.
- **Pin SDK version exactly for production:** `^0.2.2` allows patch upgrades; given 52 versions in 3 months, exact pinning (`0.2.2`) is safer.
- **`ERR_PACKAGE_PATH_NOT_EXPORTED` on package.json import:** SDK uses Node.js `exports` field restriction. Minor, doesn't affect functionality.
- **SQL parameterization:** Never interpolate user-supplied values (including LIMIT) directly into SQL strings. Always use bound parameters.
- **shouldResurface off-by-one:** The `+1` compensation hack broke when prescribe() was called from MCP `run_curate` (no session increment). Fix: remove the hack, reorder sessionStart to increment counter BEFORE calling prescribe().
- **MVP simplification docs:** When hardcoding values intentionally, document WHY in the code so future readers don't assume it's a bug.

### 2026-04-08: Copilot SDK Spike — Day 2 (Tool Hooks, Decision Gates, Model Selection)

- **Tool hooks are first-class and bidirectional.** `onPreToolUse` receives `toolName`, `toolArgs`, `timestamp`, `cwd`. Can return `permissionDecision: "allow"|"deny"|"ask"`, `modifiedArgs`, `additionalContext`. `onPostToolUse` receives `toolResult` and can return `modifiedResult`. Hooks are async, support Promises.
- **`permissionDecision: "deny"` blocks tool execution natively.** No need to wrap tools — the hook system has a built-in gate mechanism. Returning `"ask"` defers to the `onPermissionRequest` handler, which receives rich context (command text, diffs, file paths).
- **Three complementary decision gate mechanisms:** (1) Hook blocking (`"deny"`), (2) Hook → permission handler (`"ask"`), (3) Elicitation forms (`session.ui.confirm()`). Each serves different granularity needs. The permission handler is the most powerful — it gets richer context than any custom wrapper could provide.
- **`PermissionRequestResult` uses kind-based union, not boolean.** `{ kind: "approved" }`, `{ kind: "denied-interactively-by-user" }`, `{ kind: "denied-by-rules", rules }`, etc. Richer than expected — gives decision audit trail for free.
- **`registerHooks()` replaces, doesn't append.** Multiple hook observers need a composition pattern. Built a `composeHooks()` combiner — last-writer-wins for outputs, all observers get called in order.
- **Internal hook types not re-exported from SDK index.** `SessionHooks`, `PreToolUseHookInput`, `PostToolUseHookOutput`, `ReasoningEffort` are in `types.d.ts` but not in `index.d.ts`. Workaround: `NonNullable<SessionConfig["hooks"]>` or mirror locally. Minor ergonomic issue.
- **`ElicitationRequest` renamed to `ElicitationContext` in public SDK.** The bundled CLI internal copy uses the old name. Always import from `@github/copilot-sdk`, never from `@github/copilot/copilot-sdk`.
- **Two copies of SDK types in node_modules.** `@github/copilot-sdk` (public) and `@github/copilot/copilot-sdk` (bundled CLI internal). Different export surfaces. Must always use the public package.
- **`session.setModel()` is async and fires `session.model_change` event.** Event includes `previousModel`, `newModel`, `previousReasoningEffort`, `reasoningEffort`. Conversation history preserved across switches.
- **`client.listModels()` returns rich `ModelInfo[]`.** Context window, vision/reasoning support, billing multiplier, policy state, supported reasoning efforts. Enough data for intelligent model routing strategies.
- **No runtime token budget setter.** Limits are per-model via `ModelCapabilities.limits`. Budget enforcement must be application-level: accumulate `assistant.usage` events, switch models or stop when limit reached.
- **Provenance tagging is ~20 LOC.** Static classification of event types into `"internal"` vs `"certification"` tiers. DBOM reconstruction is a filter-and-collect over certification events. Zero runtime overhead.

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

### Phase 6: npm Publish Preparation

- **`files` whitelist > `.npmignore`** — The `files` array in package.json is a positive-list approach: only listed paths get published. Safer than `.npmignore` because new directories (like `.squad/`) are excluded by default. No `.npmignore` file needed.
- **Published contents:** `dist/`, `.github/hooks/`, `.github/plugin/`, plus auto-included `README.md`, `LICENSE`, `package.json`. 66 files, 27.2 kB compressed.
- **`prepublishOnly: "npm run build"`** ensures `dist/` is always fresh before publish. Standard npm lifecycle hook.
- **Added keywords:** `copilot-plugin`, `mcp`, `model-context-protocol` for npm discoverability. Added `homepage` field pointing to GitHub readme.
- **Verification:** 136/136 tests pass, clean build, clean lint, `npm pack --dry-run` confirms no source, tests, or squad state in tarball.

### 2026-04-05: Phase 6 Complete — Plugin Packaging & npm Publish

**Phase 6 Outcome:** ✅ COMPLETE AND SHIPPED

### 2026-04-06: Phase 7A — Data Foundation

**Phase 7A Outcome:** ✅ COMPLETE

**What was built:**
- Migration 005: `prescriptions` table with 8-state lifecycle (generated→accepted→applied/failed, +rejected/deferred/expired/suppressed) and `prescriber_state` singleton table for session counting and pending tracking.
- Migration 006: `managed_artifacts` table with unique path constraint, rollback content, and drift detection via checksum comparison.
- DAL module `src/db/prescriptions.ts`: 12 functions — CRUD, priority retrieval, expiration (7-day window), deferral with session-based cooldown, suppression/unsuppression, session counter.
- DAL module `src/db/managedArtifacts.ts`: 6 functions — track, get, list, update checksum, remove, detect drift.
- Types appended to `src/types/index.ts`: PrescriptionStatus, PrescriptionDisposition, ArtifactType, ArtifactScope, ResolutionRule, Prescription, ManagedArtifact, DiscoveredArtifact, ArtifactConflict, ArtifactTopology, TopologyCache, GrowthSummary.
- 42 new tests in `src/__tests__/prescriptions.test.ts` covering all CRUD operations, status constraints, filter/listing, priority ordering, expiration, deferral, suppression, session counting, managed artifact CRUD, drift detection, unique path constraint, and prescriber preference infrastructure.

**Patterns followed:**
- Migration export pattern matching existing 001–004 migrations (named export, Migration type, version numbering).
- DAL `mapRow` pattern from insights.ts (snake_case→camelCase, null→undefined).
- `getDb()` singleton — never opened own connection.
- Test patterns from db.test.ts (beforeEach/afterEach with closeDb/getDb(':memory:'), describe blocks).
- Updated db.test.ts: bumped expected migration count (4→6), max schema_version (4→6), added table presence checks.

### 2026-04-06: Phase 7D — Prescription Engine

**What was built:**
- Full Prescriber agent `src/agents/prescriber.ts` replacing Gabriel's Phase 7C stub. 8 exported functions: `prescribe()`, `computePriority()`, `shouldResurface()`, `checkAutoSuppress()`, plus constants and types.
- Template-based prescription generation for all 3 pattern types (recurring_error, error_sequence, skip_frequency).
- Priority scoring: `confidence × recencyWeight × availabilityFactor` with min(1.0) cap on recencyWeight.
- Session cleanup: expires stale generated prescriptions (>7 days), resurfaces deferred past cooldown, auto-suppresses after threshold deferrals.
- Idempotent: skips insights with any active prescription (generated/accepted/rejected/applied/suppressed).
- 38 new tests in `src/__tests__/prescriber.test.ts` covering generation, idempotency, priority, all 8 state transitions, deferral resurfacing, suppression, templates, target paths, events, expiration, and re-prescription.

**Design decisions:**
- **Event logging fail-soft**: `logEvent` requires FK-valid sessionId. Prescriber looks up any active session; skips logging if none found. This handles the sessionStart case where prescribe() runs before the new session is created.
- **recencyWeight cap**: Spec formula produces >1.0 for sessionsAgo < 5. Added `Math.min(1.0, ...)` to match spec description "1.0 within 5 sessions."
- **Off-by-one compensation**: `shouldResurface` uses `currentSession + 1 >= deferUntilSession` because `incrementSessionCounter()` runs after `prescribe()` in sessionStart.
- **Scope defaulting**: Target path defaults to user scope (`~/.copilot/`). Project scope selected only when topology shows existing project-level instructions.
- **Rejected = blocking**: Added 'rejected' to ACTIVE_STATUSES so rejected insights don't get re-prescribed (terminal state).
- **Auto-suppression exported**: `checkAutoSuppress()` exported for Phase 7F MCP tools to call after deferral; also checked during resurface flow.

**Decisions made:**
- `prescriber_state.pending_count` is kept in sync automatically by every prescription status change (create, update, defer, suppress, unsuppress, expire). This avoids stale counts without requiring manual synchronization from callers.
- `detectDrift()` returns `undefined` for non-existent paths rather than throwing, consistent with the `getPrescription()` / `getManagedArtifact()` undefined-on-miss pattern.

**Test baseline:** 181/181 (139 existing + 42 new). Clean build, clean lint.

**Deliverables (Roger's domain):**
1. ✅ npm packaging configuration (files whitelist, prepublishOnly, keywords)

### Phase 8D: Skill Test Harness + Tests

- **Built `src/agents/skillTestHarness.ts`** — the I/O boundary orchestrator that loads YAML test scenarios, runs `parseSkill()` + `validateSkill()` against skill files, and produces structured `TestReport` objects with per-vector scoring and threshold enforcement.
- **Three public functions:** `loadTestScenario(yamlPath)` (YAML parse + path resolution), `runTestScenario(scenario)` (validator orchestration + score aggregation), `formatTestReport(report)` (human-readable output with emoji status and per-vector breakdown).
- **Score aggregation:** per-vector score = average of all `ValidationResult` scores for that vector. Overall score = average of 5 vector scores (equal weighting across vectors, not across rules).
- **Threshold override mechanism:** Each YAML assertion can specify `threshold` to override the default 0.5. The harness checks `score >= threshold` per assertion. A scenario passes only if ALL assertions pass their thresholds.
- **Fixture-validator gap discovered:** The good-skill fixture has domain `"error-handling"` (hyphenated) but the body uses "error handling" (space-separated). The `domain-content-match` and `scope-bounded` rules split on whitespace, so the hyphenated domain isn't found as a substring in individual words. This is a fixture/validator alignment issue — the harness correctly reports what the validator finds. Future fix: either update the validator to handle hyphenated domains, or update the fixture domain.
- **Created 20 tests in `src/__tests__/skillTestHarness.test.ts`**: 6 for `loadTestScenario` (YAML loading, path resolution, error handling, field parsing), 10 for `runTestScenario` (all 5 fixture scenarios, score computation, threshold overrides, timestamp validity), 4 for `formatTestReport` (structure, pass/fail emoji, failure details, vector scores).
- **Test count:** 401 → 421 (20 new tests). Clean build, clean lint.
2. ✅ Scoped package release (@akubly/cairn@0.1.0)
3. ✅ isScript guard extraction (src/utils/isScript.ts with 3 unit tests)
4. ✅ npm wrappers → direct node pattern (MCP config debugging)
5. ✅ isScript symlink safety (try/catch, argv[1] guard)

**npm Publishing Details:**
- **files whitelist:** dist/, .github/plugin/, src/, package.json, README.md, LICENSE
- **prepublishOnly:** npm run build (ensures dist/ built before publish)
- **Keywords:** cairn, session, observability, mcp, hooks
- **Published as:** @akubly/cairn@0.1.0 (scoped to @akubly namespace)
- **Globally installable:** npm install -g @akubly/cairn
- **Package includes:** Compiled JS, plugin manifests, source tree, documentation

**Debugging Cycles (MCP Configuration):**
1. **Initial issue:** .copilot/mcp-config.json referenced \cairn-mcp\ binary (didn't exist after fresh clone)
2. **Root cause:** npm link never run in sequence; assumed binaries would be on PATH
3. **Round 1 fix:** Changed config to direct node invocation (\
ode dist/mcp/server.js\)
4. **Round 2 issue:** npm PS1 wrappers don't forward stdin to Node; stdio server requires stdin
5. **Round 2 fix:** Switched from npm wrappers to direct node, updated .mcp.json accordingly
6. **Round 3 issue:** fs.realpathSync could crash on permission errors (symlink resolution)
7. **Round 3 fix:** Added try/catch with fail-open semantics (treat error as "not a script")

**isScript Guard Pattern (Phase 6 crystallization):**
- **Symlink handling:** fs.realpathSync normalizes both ESM import.meta.url and process.argv[1]
- **Cross-platform path comparison:** Use url.pathToFileURL for consistent URL-based comparison
- **Defensive error handling:** Wrap in try/catch; return false on any error
- **Applied to:** server.ts, sessionStart.ts, postToolUse.ts
- **Extracted to:** src/utils/isScript.ts (shared utility)
- **Tests:** 3 unit tests (direct execution, relative path, symlink scenario)

**Code Review Patterns (MCP Configuration):**
- Module-scope side-effects (process.exit, main() calls) are highest-risk pattern in this codebase
- Every new entry point must be checked for isScript guard — now established convention
- When fixing root causes (isScript), check for companion workarounds that should be reverted

**Quality Metrics:**
- 134/134 tests passing (final)
- 3 new unit tests for checkIsScript (extracted utility)
- Clean TypeScript build
- Zero lint violations
- Scoped package successfully published to npm

**Key Learning:** Debugging MCP config revealed complexity in module entry point patterns across stdio servers, npm binaries, symlinks, and filesystem permissions. Best practice: always use direct node invocation for development/distribution contexts where CWD is unknown. npm bin commands are for user-installed CLI tools only.

**Handoff:** npm package published and available for install. MCP configuration stabilized with direct node pattern. Phase 6 shipping gates satisfied (build clean, tests pass, lint clean, publication successful). Ready for Phase 7 (CLI extension spike, worktree support, installation automation).

### 2026-04-05: Prescriber Data Model Design (Phase 7 Planning)

- **Prescriptions table (migration 005):** `prescriptions` with FK to `insights(id)`, CHECK constraints on `type` (6 artifact types), `target_scope` (4 scopes), `status` (7 lifecycle states). Indexes on `insight_id` and `status`.
- **Lifecycle states:** `generated → presented → accepted → applied` (happy path), plus `rejected`, `failed`, `expired`. Dropped `redirected` as a status — user redirect is `accepted` + `override_target_path`. Simpler state machine.
- **One live prescription per insight:** Invariant enforced transactionally (check before INSERT). Prevents duplicate/conflicting prescriptions. Abandoned in-flight rows expire on next session start.
- **No separate prescription_events table:** Reuse `event_log` via archivist's `logEvent()`. All prescription events carry `prescription_id` in payload for correlation across retry attempts.
- **Apply-time drift detection:** `target_fingerprint` column stores hash of target file at generation time. Re-checked before apply; fail safely on mismatch. Prevents writing stale modifications.
- **Artifact topology is in-memory, not persisted:** Ephemeral filesystem scan via `scanTopology()`. No caching in DB — topology is stale the moment it's written. Scanner is a pure function taking homedir, projectRoot, pluginsDir.
- **Insight closure:** The Prescriber does NOT modify insight status. Curator owns insight lifecycle. Applied prescriptions log events that the Curator processes on its next run; if the error pattern stops recurring, the insight decays naturally.
- **Integration points:** `getUnprescribedInsights()` uses NOT EXISTS subquery (excludes insights with live or applied prescriptions). Rejected/failed prescriptions don't block re-prescription.
- **New DB module:** `src/db/prescriptions.ts` with CRUD operations. New MCP tools: `list_prescriptions`, `resolve_prescription`.
- **Key file:** `.squad/decisions/inbox/roger-prescriber-datamodel.md` — full proposal with SQL, TypeScript types, integration map, and open questions.

### Phase 8D: Skill Validator — Types + Rules + Tests

**What was built:**
- Types added to `src/types/index.ts`: `QualityVector`, `ValidationResult`, `ValidatorRule` — shared interfaces for the 5-C quality assessment framework.
- Validator module `src/agents/skillValidator.ts`: 14 Tier 1 deterministic rules across 5 vectors (clarity: 4, completeness: 3, concreteness: 3, consistency: 3, containment: 1).
- `validateSkill()` API with vector filtering and custom threshold overrides.
- `formatValidationSummary()` — per-vector percentage scores + overall score with pass/fail icons.
- 41 tests in `src/__tests__/skillValidator.test.ts` with 10 targeted fixtures.

**Key design decisions:**
- All rules are **pure functions** — no I/O, no DB, no filesystem. Operate on `ParsedSkill` AST from skillParser.
- `context-patterns-flow` uses **stem matching** (first 4 chars) with a **0.25 threshold** — Context introduces problem space, Patterns gives actions, so 25% term overlap is a realistic bar.
- `scope-bounded` flags when domain count is 0 but another known domain dominates — zero occurrences of declared domain is worse than low overlap.
- Default pass threshold is 0.5 globally, overridable per-rule via `thresholds` option.
- RULES array is exported for extensibility and direct test access.
- Follows `skillLinter.ts` patterns: import ParsedSkill from parser, pure rule functions, public API returns sorted results.
- **Test count:** 360 → 401 (41 new tests for Phase 8D).

### Phase 8D Final: test_skill MCP Tool + Wire Exports

**What was built:**
- **`test_skill` MCP tool** in `src/mcp/server.ts` — follows `lint_skill` pattern exactly. Two modes: (1) with `scenario_path`, loads YAML scenario and runs test harness; (2) without, runs all Tier 1 rules with default thresholds. Persists results to `skill_test_results` table and logs `skill_test` event when session exists. Fail-open on DB/event logging.
- **Wired exports** in `src/index.ts` — `validateSkill`, `formatValidationSummary`, `loadTestScenario`, `runTestScenario`, `formatTestReport`, `insertTestResult/s`, `getTestResults`, `getTestHistory`, `getLatestTestRun` + type exports for `QualityVector`, `ValidationResult`, `ValidatorRule`, `TestScenario`, `TestAssertion`, `TestReport`, `SkillTestResultInsert`, `SkillTestResultRow`.
- **6 new tests** in `src/__tests__/mcp.test.ts` covering default validation, summary formatting, quality issue detection, DB persistence, event logging, and 5-vector coverage.
- **Test count:** 421 → 427 (6 new tests for Phase 8D final). Build clean, lint clean (only pre-existing `lenientReport` unused-var in skillTestHarness.test.ts).

### 2026-04-07: Copilot SDK Deep Dive (Spike)

- **`@github/copilot-sdk` v0.2.2 is real and installable.** 52 versions published, MIT, 483KB unpacked. Dependencies: `@github/copilot` (bundled CLI), `vscode-jsonrpc`, `zod`. Technical Preview but rapid iteration (~weekly releases).
- **86 event types in the generated type definitions.** The `session-events.d.ts` file is 105KB of discriminated union types. Every event has `id` (UUID), `timestamp` (ISO 8601), `parentId` (linked chain), `type`, and typed `data`.
- **`assistant.usage` is richer than expected.** Beyond model/tokens/cache, it includes: `cost` (billing multiplier), `duration`/`ttftMs`/`interTokenLatencyMs` (latency), `quotaSnapshots` (entitlement tracking), `copilotUsage.totalNanoAiu` (actual billing cost in nano AI Units), `initiator` and `parentToolCallId` (sub-agent attribution).
- **6 hooks are bi-directional.** `onPreToolUse` can modify args AND change permission decisions (`allow`/`deny`/`ask`). `onPostToolUse` can modify results. `onErrorOccurred` can choose `retry`/`skip`/`abort`. This is strictly more powerful than Cairn's current observe-only stdin hooks.
- **Event bridge to Cairn is ~20 LOC for the core, ~50 with error handling.** `session.on((event) => logEvent(sessionId, EVENT_MAP[event.type], JSON.stringify(event.data)))` — that's literally the pattern. The SDK's event shape maps cleanly to Cairn's `event_log(event_type, payload, session_id)`.
- **Session management is comprehensive.** `createSession`/`resumeSession`, custom session IDs, model selection mid-session via `setModel()`, MCP server config, custom agents, skill directories, infinite sessions with auto-compaction.
- **BYOK works without GitHub auth.** Can use OpenAI/Azure/Anthropic keys directly via `provider` config. Good for testing without Copilot subscription.
- **OpenTelemetry is built in.** OTLP HTTP export, file-based JSONL export, W3C trace context propagation. Free observability without custom instrumentation.
- **Full findings written to `docs/spikes/copilot-sdk-exploration.md`.**
