# Graham — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Lead
- **Joined:** 2026-03-28T06:21:47.377Z

## Learnings

<!-- Append learnings below -->

### 2026-04-02: Phase 5 Complete — MCP Server Implementation

**Agent:** Roger (Platform Dev)  
**Outcome:** Delivered src/mcp/server.ts with 6 tools (get_status, list_insights, get_session, search_events, run_curate, check_event), full test suite (19 tests in src/__tests__/mcp.test.ts), and updated package.json with MCP dependencies.

**Quality metrics:**
- 134 total tests pass (all phases)
- Clean compile
- Zero lint issues

**Key learning:** Test MCP tool backing functions directly, not the MCP SDK's stdio transport. SDK owns transport; our tests own query logic. This sets convention for all future MCP tools.

**Cross-team impact:**
- All existing sessions remain queryable through legacy hooks
- MCP server augments (not replaces) event log
- No breaking changes
- Ready for Phase 6 coordination

**Decision logged:** 2026-04-02T05-05 — MCP Server: Tool Logic Tested via Backing APIs (archived in decisions.md)

### 2026-03-31: PR #9 Review Fix — Stale Session Heuristic for Crash Recovery

- **Bug pattern:** When a hook function has an early-return guard (`if (session) return`) that prevents crash-recovery code from running on the exact condition (active orphan session) that triggers crash recovery, the recovery path becomes dead code. The guard and the recovery check both key off the same signal (active session exists).
- **Fix pattern:** Staleness heuristic. Distinguish "current" vs "orphaned" active sessions using last event timestamp. Sessions with no events in >2min are treated as orphans. This works because postToolUse fires every few seconds during active use, keeping the last event fresh.
- **New helper:** `getLastEventTime(sessionId)` in `events.ts` — simple `MAX(created_at)` query. `isStaleSession()` in `sessionStart.ts` uses it with a 2-minute threshold.
- **Shared module pattern:** When two hook files duplicate helper functions (e.g., `getRepoKey`, `getBranch`), extract to `src/hooks/gitContext.ts`. Prevents drift.
- **Import guard for ESM hooks:** `main()` at module scope runs on import (including in tests). Guard with `import.meta.url === \`file:///${process.argv[1]}\`` check. Applied consistently to both sessionStart and postToolUse.
- **Test realism:** Placeholder tests that say "this can't happen" are worse than no test — they give false coverage confidence. Replace with real tests that exercise the actual scenario (e.g., backdate a session to simulate an orphan).

### Session-Start Hook Architecture

- **Pattern:** Hook entry points (`src/hooks/*.ts`) separate stdin/CLI plumbing (`main()`) from testable core logic (exported pure functions). `postToolUse.ts` is the original; `sessionStart.ts` follows the same structure but extracts `runSessionStart(repoKey)` for direct unit testing.
- **Active-session gate:** `getActiveSession(repoKey)` is a single indexed SELECT — O(1) cost. Makes preToolUse near-free on 99% of tool calls.
- **Responsibility boundary:** `sessionStart` (preToolUse) does crash recovery + curation. `postToolUse` owns session creation/resumption. They never conflict because sessionStart explicitly does NOT create sessions.
- **Fail-open contract:** All hooks exit 0 on error. The `main()` wrapper catches everything; the exported core function is allowed to throw (tests verify behavior, not error swallowing).
- **PowerShell wrapper pattern:** `curate.ps1` mirrors `record.ps1` — read stdin, find script (`.cairn/hook/` primary, `dist/hooks/` fallback), pipe to node, `SilentlyContinue` + catch-all.
- **Key files:** `src/hooks/sessionStart.ts`, `~/.copilot/hooks/cairn-archivist/curate.ps1`, `src/__tests__/sessionStart.test.ts`

### 2026-03-28: Copilot Extensibility Architecture Recon

Conducted deep research into GitHub Copilot's full extensibility landscape. Key findings:

1. **Seven-layer extensibility model:** Instructions → Skills → Agents → Hooks → MCP Servers → Plugins → ACP. Each layer has a distinct purpose and they compose cleanly.

2. **Plugin system is the distribution unit:** `plugin.json` manifest bundles agents, skills, hooks, and MCP configs. Marketplaces are Git repos with `marketplace.json` in `.github/plugin/`. Default marketplaces: `github/copilot-plugins` and `github/awesome-copilot`.

3. **Skills are an open standard** (agentskills/agentskills). Cross-platform: works in Copilot CLI, VS Code, GitHub.com coding agent. `SKILL.md` files with YAML frontmatter in skill subdirectories.

4. **Agent profiles are Markdown with YAML frontmatter** (`.agent.md`). Store in `.github/agents/` (repo), `~/.copilot/agents/` (user), or `.github-private/agents/` (org). Up to 30K chars of prompt. Support tool filtering, model override, MCP server configs.

5. **Hooks provide lifecycle control** via shell commands in `.github/hooks/*.json`. Six hook types; only `preToolUse` can block execution. Critical for security guardrails and compliance.

6. **GitHub App-based Copilot Extensions deprecated Nov 10, 2025.** MCP servers are the replacement. Not a 1:1 migration — requires redesign for tool-calling model.

7. **ACP (Agent Client Protocol)** enables Copilot CLI to be consumed as an agent service. Complements MCP: MCP provides tools TO the agent, ACP exposes the agent OUT.

8. **Key gaps identified:** No org-level skills yet, no plugin dependency resolution, no testing framework for skills/agents/hooks, limited hook output processing (only preToolUse is actionable).

### 2026-03-28: Cross-Team Recon Awareness

**Roger (Platform Dev)** researched Copilot SDKs and identified three integration depths (CLI SDK for embedding, Extensions SDK for distribution, Engine SDK for custom agents). Confirmed MCP as universal tool protocol and clarified that Extensions serve the distribution story Graham identified.

**Rosella (Plugin Dev)** surveyed plugin marketplaces and found awesome-copilot as the dominant gravitational center (170+ agents, 240+ skills, 55+ plugins). Three canonical formats: `.agent.md`, `SKILL.md` (agentskills.io open standard), `plugin.json` (Claude Code spec). Recommends standardizing on SKILL.md and integrating with awesome-copilot rather than building custom marketplace.

**Gabriel (Infrastructure)** inventoried prior infrastructure (akubly/.copilot) and found 7 directly reusable patterns plus innovation in knowledge taxonomy and persona review. Recommends adopting proven patterns as foundational, prioritizing context engineering and context replication from community best practices.

**Outcome:** Graham's plugin architecture, Roger's SDK choices, and Rosella's marketplace strategy are now mutually informed and aligned. Gabriel's infrastructure recommendations provide the structural foundation for all three.

### 2026-03-31: Phase 5 Recommendation — REVISED: MCP Server (Not CLI)

**Assessment trigger:** PR #9 (Phase 4, session-start hook) merged. Aaron asked "what's next?"

**Initial recommendation (wrong):** CLI Experience Layer with 5 subcommands. This contradicted my own prior analysis from the PR #9 session where I agreed with Aaron that CLI is YAGNI — "Nobody's going to open a separate terminal to run `cairn insights` when the answer is one chat message away."

**Correction:** Aaron flagged the inconsistency. He was right. In session `cec99d3e` (PR #9 planning), I explicitly recommended "PR #4 (hook) → then straight to B (MCP server). Skip A unless you want a polished CLI for its own sake." My Phase 5 CLI recommendation was a regression from my own prior analysis.

**Root cause of my error:** I defaulted to "simplest thing first" heuristic without checking whether that heuristic had already been evaluated and rejected. The simplicity heuristic is wrong here because the *consumer* of Cairn's data is an agent (Copilot), not a human at a terminal. MCP is the direct path to the actual user.

**Revised decision:** Phase 5 = MCP Server. 6 tools over existing query APIs. Two new dependencies (`@modelcontextprotocol/sdk`, `zod`). Roger implements, Valanice consults on tool descriptions (narrative-first).

**Key files for Phase 5:**
- New: `src/mcp/server.ts` (entry point: McpServer + StdioServerTransport)
- New: `src/mcp/tools/` directory (status.ts, insights.ts, session.ts, events.ts, curate.ts, check.ts)
- New: `src/__tests__/mcp.test.ts`
- Update: `.copilot/mcp-config.json` (add cairn server registration)
- Update: `package.json` (add bin entry for MCP server, new deps)
- Decision doc: `.squad/decisions/inbox/graham-phase5-mcp.md`

**Lesson:** Always check prior session decisions before making new recommendations. "First thought might be wrong" applies to my own recommendations too — including ones I make by forgetting prior analysis.

### MCP Tool Naming Convention: Unprefixed verb_noun

**Decision:** Cairn MCP tools use unprefixed `verb_noun` names (e.g., `get_status`, `list_insights`, `search_events`), not `cairn_`-prefixed names.

**Two rationale pillars:**

1. **No prefix — the host adds one.** MCP hosts automatically prepend a server-name prefix (e.g., `cairn-get_status`). Adding `cairn_` to the tool name itself produces stuttering like `cairn-cairn_status`. Keep tool names short; let the host handle namespacing.

2. **verb_noun reads as intent.** The verb maps to operation semantics: `get` (single retrieval), `list` (collection), `search` (filtered query), `run` (side-effecting action), `check` (boolean/existence). This natural-language form improves LLM tool selection — the agent sees an imperative that matches how a human would phrase the question.

**Resulting tool names:** `get_status`, `list_insights`, `get_session`, `search_events`, `run_curate`, `check_event`.

### 2026-03-30: Post-PR#3 Roadmap Assessment — Pipeline Complete, Visibility Gap

**Observation:** After PRs 1–3 plus the uncommitted sessionStart hook, Cairn's data pipeline is functionally complete but entirely invisible. Archivist records events, Curator detects patterns and generates insights, hooks fire on every tool call — but `cli.ts` just prints a version string. There is no user-facing surface to see what Cairn knows.

**Architectural insight:** The query APIs already exist (`getSessionSummary`, `getCuratorStatus`, `getInsights`, `countInsightsByStatus`, `findEvents`, `hasEventOccurred`). The CLI and MCP server are pure presentation layers over existing functions — not new data work.

**Sequencing principle validated:** Build primitives → assemblers → experiences (the 3-layer architecture from R4). PRs 1–3 built the primitives. The next step is the experience layer — CLI first (simplest validation), then MCP server (conversational intelligence). The Compiler agent is a primitive that has no assembler or experience consuming it yet — premature to build.

**Key gap identified:** 7 of 8 planned tables exist. Missing: `knowledge_index` or `plugin_registry`. Neither is needed for the CLI/MCP path — they serve the Compiler and plugin marketplace, which are downstream.
