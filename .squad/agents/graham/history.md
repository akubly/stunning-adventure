# Graham — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Lead
- **Joined:** 2026-03-28T06:21:47.377Z

## Learnings

### Core Learning Archive (Pre-Phase 6)

**Key insights from Rounds 1–5 brainstorm:**
- Copilot extensibility has three SDK layers: CLI SDK (embedding), Extensions SDK (distribution), Engine SDK (custom agents). MCP is the universal tool protocol.
- Plugin architecture: seven-layer composition model with plugin.json as distribution unit.
- Marketplace standardization: awesome-copilot is dominant center (170+ agents, 240+ skills, 55+ plugins). SKILL.md is cross-platform standard.
- Prior infrastructure reuse: 7 directly portable patterns from Aaron's previous work (knowledge taxonomy, persona review, workflow gates, skill template, tool guards, observability schema, multi-source code review).
- Architecture foundation: four-layer data pipeline (primitives → assemblers → experiences → CLI), session-scoped context model, SQLite knowledge.db with migrations.

**Code patterns established:**
- isScript guard at module scope: prevent process.exit during import
- Timestamp parsing: SQLite datetime format must normalize to ISO-8601 before parsing
- DB cleanup: dbOpened + finally pattern ensures safe DB closure in hooks
- Test strategy: test backing functions, not transport protocols
- Tool naming: verb_noun convention (get, list, search, run, check) aids LLM selection
- Error handling: fail-open principle for observability (silent failures preferred over blocking)

**Rounds 1–5 learnings tracked in previous history entries (archived).**

<!-- Append new learnings below -->

### 2026-04-02: Phase 5 Architecture Review — MCP Server

**Review type:** Pre-merge architecture review  
**Author reviewed:** Roger (Platform Dev)  
**Artifact:** src/mcp/server.ts, src/agents/sessionState.ts, src/__tests__/mcp.test.ts  
**Verdict:** APPROVE WITH CONDITIONS

**Key findings:**

1. **🔴 Blocking — Missing import guard.** server.ts calls `main().catch()` at module scope without the `isScript` guard established in PR #9 for hooks. Violates codebase convention and creates an import landmine (process.exit on import). Trivial fix — apply the same pattern from sessionStart.ts / postToolUse.ts.

2. **Architecture is sound.** Clean 3-layer separation: server.ts is a thin experience layer over agents/ assemblers and db/ primitives. 6 tools with correct verb_noun naming. Tool handlers delegate to backing functions, making the transport layer fully swappable. ensureDb() singleton pattern works for MCP lifecycle.

3. **Test strategy is correct and efficient.** 19 tests cover backing logic directly; no need to test MCP SDK's stdio transport. Tests run in ~24ms with in-memory SQLite. Edge cases covered well (empty DB, nonexistent sessions, chronological ordering).

4. **Tool descriptions are LLM-ready.** Each description includes purpose, return shape hints, and usage guidance. The verb taxonomy (get/list/search/run/check) aids tool selection.

**Review patterns observed:**
- Module-scope side-effects remain the most common pattern violation in this codebase. Every new entry point should be checked for the isScript guard.
- When tool handlers delegate cleanly to backing functions, the test strategy writes itself — test the functions, not the protocol.
- MCP tool annotations (readOnlyHint) are easy to overlook but improve client UX. Should be part of the tool registration checklist.

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

### 2026-04-02: Phase 5 Round 2 Review — MCP Server Fixes Verified

**Review type:** Round 2 re-review after fixes  
**Author reviewed:** Roger (Platform Dev)  
**Artifact:** src/mcp/server.ts (updated), src/__tests__/mcp.test.ts  
**Verdict:** APPROVE

**Finding verification (all 5 from Round 1):**

1. ✅ **Import guard** — isScript pattern applied identically to hooks convention (path.resolve + url.pathToFileURL). Required imports (path, url) present. main() only called when executed as script.
2. ✅ **try/catch in tool handlers** — All 6 handlers wrapped consistently. Error shape: `{ error: String(err) }` with `isError: true`. Consistent and safe for non-Error throws.
3. ✅ **Session existence checks** — get_session returns isError when summary is undefined. search_events and check_event call sessionExists() before querying. get_status correctly omitted (repo_key → undefined is valid "no session" state, not an error).
4. ✅ **Dynamic version** — createRequire pattern reads from package.json at runtime. Path `../../package.json` correct for `src/mcp/server.ts` depth.
5. ✅ **readOnlyHint annotations** — All 6 tools annotated. run_curate correctly marked `readOnlyHint: false`.

**Fresh pass observations:**
- No new issues found. sessionExists is a clean lightweight `SELECT 1 LIMIT 1` — appropriately simple.
- Test suite unchanged at 19 tests. No tests for sessionExists or error paths, but this is consistent with established convention: test backing functions, not MCP protocol wrappers.
- Error messages consistent across handlers (`Session '${session_id}' not found.`).
- No regression risk — fixes are additive (guards, wrapping, checks) with no behavioral changes to happy paths.

**Review process observation:** Round 2 was clean because Round 1 findings were specific and actionable. Pattern: precise findings → clean fixes → fast re-review. Vague findings produce vague fixes and churn.

### 2026-04-02: Phase 5 Complete — PR #10 Merged

**Status:** PR #10 opened and ready for merge  
**URL:** https://github.com/akubly/stunning-adventure/pull/10  
**Deliverable:** src/mcp/server.ts with 6 tools, full test suite (19 tests), updated package.json

**Review Summary:**
- Round 1: APPROVE WITH CONDITIONS (5 specific findings)
- Round 2: APPROVE (all findings verified, no new issues)
- Orchestration log entries: 4 spawns tracked with ISO 8601 timestamps

**Quality metrics:**
- 134 total tests pass (no regression)
- Clean TypeScript compile
- Zero ESLint issues
- All 5 findings from Round 1 fixed and verified in Round 2

**Key learning from this cycle:** Precise, actionable findings drive clean fixes and fast re-review cycles. The 5 specific findings (import guard, try/catch, session checks, version, annotations) each took ~1 minute to fix and verified cleanly with no rework required.

**Cross-team context:** Decision merged (graham-mcp-import-guard.md → decisions.md). Roger's implementation quality was high — no unexpected issues in re-review. Test strategy (backing APIs, not transport) sets convention for future MCP tools.

### 2026-04-02: Phase 6 Roadmap Assessment — Three Options

**Task:** Architect's analysis of Phase 6 paths forward.

**Context:** Phase 5 (MCP Server + PR #10 merge) complete. Aaron asks: "What's next?"

**Assessment:** Three options evaluated:
1. **Option A: Worktree-Aware Sessions (Issue #11)** — Fix session collision bug. Correctness before features. Small-medium effort, low risk. **Recommended by Graham.**
2. **Option B: Compiler Agent MVP** — Plugin validation framework. Speculative, no consumers yet. Large effort, high risk.
3. **Option C: Distribution & Polish** — Plugin packaging, npm publish, README refresh. Safe, unblocks external users. Ships known worktree collision bug.

**Decision:** Aaron chose Option C (Plugin Packaging). Graham's recommendation for Option A stands as architecture decision record.

**Outcome:** Rosella and Roger executed plugin packaging blueprint in parallel. Plugin infrastructure (plugin.json, marketplace.json, hooks.json, hook wrappers) now in place. Worktree support (Option A) deferred to Phase 7 after installation commands proven.

**Documentation:** Full assessment in .squad/decisions.md (Phase 6 section).

### 2026-04-02: Installation Architecture Assessment

**Task:** Map all installation surfaces for "making Cairn installable on Aaron's machine."

**Four Surfaces Identified:**
1. MCP Server Registration — `~/.copilot/mcp-config.json` (❌ not registered)
2. Hook Installation — `~/.copilot/hooks/cairn/` (⚠️ manually installed, hardcoded paths)
3. Binary/Module Availability — npm global bin (❌ not linked)
4. Database Initialization — `~/.cairn/knowledge.db` (✅ working)

**Three Implementation Strategies:**
- **Option A: npm link + cairn install** ✅ Recommended
- **Option B: npm install -g** — Less dev-friendly
- **Option C: Plugin install via Copilot CLI** — Premature for "first consumer"

**Missing in Codebase (Priority):**
- P0: No MCP registration mechanism
- P0: No cairn install command

### 2026-04-03: PR #12 Review Comment Fixes

**Task:** Address 3 Copilot PR reviewer comments on PR #12.

**Fixes applied:**
1. **decisions.md line 720** — Removed stray CR byte (`0x0D`) before `un_curate` that rendered as `\run_curate`. Replaced with correct `run_curate`.
2. **README.md Installation section** — Added clone + `npm link` path for pre-publish development use alongside `npm install @akubly/cairn`. Added MCP config registration pointer.
3. **rosella/history.md** — Corrected tool names from `get_events, get_insights, record_event, insert_insights` to actual names `get_status, list_insights, get_session, search_events, run_curate, check_event`. Fixed MCP server entry from `cairn-mcp` binary to `node dist/mcp/server.js`.

**Verification:** TypeScript compiled clean, 136/136 tests passed.
- P1: No plugin.json manifest
- P1: Hook scripts not in repo
- P2: No uninstall command

**Recommendation:** Option A. Minimal path to "it works" while building toward distribution. Detailed analysis in decisions.md.

**Cross-team impact:** Architecture informs Roger and Rosella's plugin packaging execution.

**Next gate:** Awaiting Aaron's merge approval. Phase 6 scope TBD (coordination orchestration).

### 2026-04-02: PR #10 Review Triage — Cloud Copilot Reviewer Comments

**Review type:** External PR review triage (GitHub cloud Copilot reviewer)
**PR:** #10 (Phase 5 MCP server)
**Comments triaged:** 4

**Triage results:**

1. **Comments 1 & 3 (PR description tool name mismatch):** VALID. PR description listed aspirational tool names from early planning (`get_session_history`, `search_knowledge`, `get_decision_context`, `suggest_next_action`) that never matched the implemented tools (`get_session`, `search_events`, `run_curate`, `check_event`). Two tools matched (`get_status`, `list_insights`), four didn't. **Fixed:** Updated PR description via `gh pr edit` to reflect actual implementation. Comments 1 & 3 were duplicates.

2. **Comment 2 (backslash in decisions.md):** VALID. Line 541 had `\run_curate` where `\r` was a bare carriage return byte (0x0d), not a literal backslash. Rendered as `un_curate` in most viewers. **Fixed:** Replaced bare CR byte with letter 'r' via binary-precise edit. Committed to branch.

3. **Comment 4 (test coverage for MCP wrapper logic):** VALID concern, INTENTIONAL gap. The reviewer suggested extracting per-tool handlers for unit testing wrapper behavior (session-not-found, error shaping, ensureDb). This is architecturally sound advice, but we made a deliberate convention decision: test backing functions, not protocol wrappers. The MCP SDK owns transport; our tests own query logic. **Action:** No fix now. Filed as follow-up consideration for when wrapper complexity grows.

**PR review triage patterns learned:**

- **Aspirational PR descriptions rot.** When PR descriptions are written during planning and tools get renamed during implementation, the description becomes a liability. Write PR descriptions AFTER implementation, or update them as part of the merge checklist.
- **Binary corruption in markdown is invisible.** A bare CR (0x0d) looks like `\r` in some contexts, renders as a line break in others, and silently eats the next character in markdown viewers. Always use `repr()` or hex dumps when debugging "missing character" issues in docs.
- **Duplicate reviewer comments indicate high-signal findings.** Comments 1 & 3 were duplicates — the reviewer flagged the same issue at two code locations. When an automated reviewer says the same thing twice, it's probably right.
- **"Test the wrapper" is architecturally correct but strategically premature.** When wrappers are thin delegation layers, the ROI of wrapper tests is low. When wrapper logic grows (retry, caching, auth), that's when to extract and test. Log the advice, don't act yet.

### 2026-04-02: Worktree Support Assessment

**Trigger:** Aaron asked whether Cairn should track a feature request for git worktree support.

**Finding: Session collision is real.** `repoKey` is derived solely from `git remote get-url origin` via `slugifyRepoKey()` in `src/config/repo.ts`. All worktrees of the same repo produce identical repoKeys (e.g., `org_repo`). Sessions are looked up by `repoKey` alone (`getActiveSession(repoKey)` in `src/db/sessions.ts`). The `branch` field is stored as metadata but does NOT participate in session lookup. Two simultaneous Copilot sessions in different worktrees of the same repo would collide — `getActiveSession` returns `ORDER BY started_at DESC LIMIT 1`, so the second session would either hijack or race with the first.

**knowledge.db is fine.** The sidecar DB is user-local and repo-keyed internally. All worktrees sharing one DB is correct behavior — you want cross-branch knowledge accumulation. WAL mode handles concurrent reads. The issue is session isolation, not data isolation.

**Recommendation:** File as a GitHub issue. Not urgent (single-worktree use is the common case today), but the collision is a real bug that will bite Squad users since the coordinator creates worktrees per issue. The fix is scoped: include worktree identity (path or branch) in the session key, not the repoKey itself.

**Suggested issue title:** `Worktree support: session collision when same repo has multiple active worktrees`

### 2026-04-02: Worktree-Aware Architecture Design — Issue #11

**Trigger:** Aaron's challenge — "are we setting our agents up for success with the appropriate intelligence to make *use* of the power of git worktrees?"

**Design produced:** Session identity = `repo_key + workdir`. Workdir (`git rev-parse --show-toplevel`) is the session discriminator, not branch.

**Key architectural insights:**

1. **Workdir is stable identity; branch is not.** Branch can change mid-session (checkout), but the worktree path is immutable for the session's lifetime. Identity must be stable. Branch is metadata, not key.

2. **Shared DB is a feature, not a bug.** The instinct to "isolate" worktrees with separate databases would destroy the cross-worktree intelligence that makes the platform valuable. The shared knowledge.db enables "what happened in worktree A?" queries from worktree B. Session isolation fixes correctness; data sharing enables intelligence.

3. **NOW/NEXT/LATER phasing for platform capabilities.** The immediate bug fix (session isolation) is separable from the platform play (cross-worktree intelligence). Designed three phases:
   - NOW: Session isolation + context enrichment (migration, lookup, hooks, MCP context)
   - NEXT: Cross-worktree queries (list_sessions tool, cross-worktree event search)
   - LATER: Lifecycle hooks, coordination signals, panoramic views

4. **Aaron's pattern: "Don't just fix it, make it a capability."** The bug was a session collision. Aaron's push was to think beyond the fix — what does worktree-awareness enable? This is a recurring leadership pattern: use a bug as a forcing function for architectural thinking.

**Artifacts produced:**
- GitHub issue #11 (implementation scope with full task list)
- Decision document: `.squad/decisions/inbox/graham-worktree-design.md`

**Files affected by implementation:** `src/db/migrations/005-workdir.ts`, `src/hooks/gitContext.ts`, `src/db/sessions.ts`, `src/agents/archivist.ts`, `src/hooks/postToolUse.ts`, `src/hooks/sessionStart.ts`, `src/types/index.ts`, `src/agents/sessionState.ts`, `src/mcp/server.ts`

### 2026-04-02: Phase 6 Assessment — Post-MCP Roadmap

**Trigger:** Phase 5 (MCP Server, PR #10) merged. Aaron asked "What's next?"

**Current state inventory:**
- 136 tests passing across 6 test files
- 22 source files, 7 DB tables, 4 migrations, 6 MCP tools
- End-to-end pipeline operational: hooks → Archivist → event_log → Curator → insights → MCP
- CLI is a stub (prints version). Compiler is a 2-line placeholder.

**Vision vs. reality delta:** Core data pipeline is complete. Remaining brainstorm items are either horizontal expansion (worktrees, distribution) or vertical features (Compiler, sidecar, corporate). Horizontal has clear ROI now; vertical needs consumers first.

**Three options evaluated:**
1. **Worktree-Aware Sessions (Issue #11)** — correctness bug fix, already designed, small-medium/low-risk
2. **Compiler Agent MVP** — no consumers yet, large/high-risk, violates own "primitives need assemblers" principle
3. **Distribution & Polish** — npm publish + README, but ships with known session collision bug

**Recommendation:** Option A — Worktree support. Fix correctness before features. Then distribute as Phase 7.

**Key insight reapplied:** The same anti-YAGNI principle that redirected Phase 5 from CLI to MCP applies here: don't build the Compiler until there are plugins to compile. Build what's needed now, not what's architecturally next on a diagram.

**README staleness flagged:** Test count wrong (106 → 136), roadmap phases mislabeled (Phase 4 says "Compiler" but was actually session hook), hooks and MCP server not mentioned in "What's Built" section. Should be fixed in a housekeeping PR regardless of Phase 6 choice.

### 2026-04-03: Phase 7 Code Review — Prescriber Implementation

**Review type:** Full code review with fixes  
**Scope:** 18 new files, 7 modified files, 316 tests  
**Verdict:** APPROVE (blocking issues fixed inline)

**Key findings fixed:**

1. **Double-formatted sidecar content** — Prescriber templates wrapped proposedChange in full sidecar format, then Applier wrapped it again. Applied files would have been malformed. Fix: prescriber stores plain instruction text only; applier owns all formatting.

2. **Project-scope topology never scanned** — `scanTopology()` was called without `projectRoot`, so `.github/` artifacts were invisible to the prescriber. Fix: pass `process.cwd()`.

3. **Path traversal via sidecar_prefix** — Unvalidated prefix in `path.join()` could escape managed directories. Fix: alphanumeric + dash/underscore validation.

4. **Topology cache dead code** — `cacheTopology()` was never called outside tests. Fix: cache after successful scan.

5. **Missing-file drift bypass** — Deleted tracked files weren't detected as drift. Fix: fail when tracked artifact exists but file doesn't.

**Review patterns observed:**
- When two components both format the same output (prescriber generates content, applier writes files), the write-side should own formatting. Formatting should happen exactly once at the boundary closest to output.
- Path construction from user-configurable inputs needs validation against traversal. This applies to any `path.join(base, userInput)` pattern.
- Cache layers that are never populated are worse than no cache — they add complexity without benefit and obscure the actual performance path.
- End-to-end integration tests (prescribe → accept → apply → verify file content) would have caught the double-formatting bug. Unit tests on each component individually passed but the composition was broken.

**Decision document:** `.squad/decisions/inbox/graham-phase6-assessment.md`

### 2026-04-02: Installation Architecture Assessment — First Consumer

**Trigger:** Aaron asked how to make Cairn installable on his machine as a Copilot CLI plugin/marketplace.

**Key finding: 3 of 4 installation surfaces are broken or missing.**

1. ✅ **Database** — Self-bootstrapping. `getDb()` auto-creates `~/.cairn/knowledge.db`. Already working (958KB populated).
2. ❌ **MCP server** — Not registered in user-level `~/.copilot/mcp-config.json`. Server works (6 tools, tested), but Copilot can't discover it. Fix: add one JSON entry.
3. ⚠️ **Hooks** — Installed manually on Aaron's machine. Work via hardcoded fallback path (`D:\git\stunning-adventure\dist\hooks\*.js`). Primary resolution path (`~/.cairn/hook/`) was never created. Not portable.
4. ❌ **Binaries** — `npm link` never run. `cairn-mcp` not on PATH. MCP config can't reference it by name.

**Strategy recommendation:** `npm link` + `cairn install` CLI command. npm link puts binaries on PATH. `cairn install` automates MCP registration, hook installation, and directory setup. The CLI stub (`src/cli.ts`) becomes the installer.

**Architecture irony identified:** We said "CLI is YAGNI" for querying Cairn (use MCP). But CLI is exactly right for *installing* Cairn — different consumer (human at terminal), different UX. The anti-YAGNI principle doesn't apply to install/setup commands.

**Six gaps catalogued:**
1. No MCP registration mechanism
2. Hook path resolution hardcoded and fragile
3. No `cairn install` command
4. No `plugin.json` manifest
5. Hook wrapper scripts (PS1) not in repo — only on Aaron's machine
6. `hooks.json` not in repo

**Implementation order:** (1) npm link + manual MCP config now, (2) `cairn install` + repo hook scripts in next PR, (3) plugin.json + marketplace later.

**Decision document:** `.squad/decisions/inbox/graham-install-architecture.md`

### 2026-04-02: Phase 6 Code Review — Plugin Packaging + isScript Fix

**Review type:** Pre-commit code review (PR #12)  
**Artifacts:** `.copilot/mcp-config.json`, `.github/plugin/.mcp.json`, `src/mcp/server.ts`, `src/hooks/sessionStart.ts`, `src/hooks/postToolUse.ts`  
**Verdict:** APPROVE

**Key findings:**

1. **🟡 `.github/plugin/.mcp.json` distribution path regression.** Changed from `cairn-mcp` (npm bin command, works from any CWD) to `node dist/mcp/server.js` (requires CWD = package dir). The bin command is correct for plugin distribution; direct node invocation is correct for repo-level config. Since plugin install isn't functional yet, not blocking. Track: revert to `cairn-mcp` before `cairn install` ships.

2. **isScript symlink fix is correct and well-executed.** `fs.realpathSync()` added to all 3 entry points identically. Root cause: ESM `import.meta.url` resolves through symlinks but `process.argv[1]` preserves them. `realpathSync` normalizes the comparison. Pattern is consistent, tests pass, no edge case risk (argv[1] always exists when the file is running).

3. **All validation gates pass.** TypeScript clean, 136/136 tests, ESLint clean.

**Review pattern learned:** When a bug fix (isScript) removes the need for a workaround (direct node invocation), check whether the workaround was also applied elsewhere. The `.mcp.json` change was a workaround that should have been reverted once the root cause fix landed.

**Branch:** `squad/phase6-plugin-packaging` → PR #12

### 2026-04-03: CLI Extensions Investigation — CORRECTED

**Trigger:** Aaron asked whether Copilot CLI "extensions" (`.github/extensions/`, `extensions_manage`) could replace Cairn's MCP server as a simpler tool registration mechanism.

**⚠️ Round 1 was wrong.** Initial investigation concluded extensions don't exist. They do. Extensions are a fully implemented but undocumented feature: persistent Node.js child processes communicating via JSON-RPC, capable of registering custom tools AND lifecycle hooks. Confirmed via `@github/copilot-sdk` source (found in squad-cli's node_modules) and community reverse-engineering ([htek.dev guide](https://htek.dev/articles/github-copilot-cli-extensions-complete-guide/)).

**Investigation methodology failure:** Searched official docs, CLI help, and directory conventions — all negative. Should have inspected SDK source code and type definitions directly. "No documentation" ≠ "doesn't exist." Future investigations must be artifact-centric, not documentation-centric.

**What extensions offer Cairn:**
1. **Persistent DB connection** — open knowledge.db once per session, not per tool call (~400ms savings × 200+ calls/session)
2. **Unified hooks + tools** — one process replaces MCP server + hooks.json + PS1 wrappers + sessionStart.ts + postToolUse.ts
3. **No PS1 wrappers** — the entire record.ps1/curate.ps1 pipeline disappears
4. **Event subscription** — `session.on()` for richer observability than postToolUse hooks

**What extensions cost:**
1. **CLI-only** — VS Code, coding agent, other MCP hosts can't use them
2. **No plugin/marketplace** — file-copy distribution only. plugin.json has no `extensions` field (verified: zero of 15 installed plugins reference extensions)
3. **Undocumented** — no official GitHub docs, no deprecation policy
4. **Hook overwrite bug (#2076)** — if multiple extensions register hooks, only last-loaded fires
5. **Native module distribution** — better-sqlite3 needs npm install regardless

**Architectural recommendation:** Build BOTH. Extension as primary CLI surface (persistent state, unified hooks+tools). MCP as universal distribution path (VS Code, coding agent, plugin install). Backing functions are already factored for this (Phase 5 convention: test backing functions, not transport). Two thin transport layers, shared core.

**Phased approach suggested:** Spike (1-2 sessions) → Validate (1 week) → Decide. Don't commit until hook overwrite bug and native module resolution are verified on our CLI version (1.0.18).

**Decision document:** `.squad/decisions/inbox/graham-cli-extensions-investigation.md`

#### Follow-Up: Distribution Mechanics (same session)

Aaron asked three targeted follow-ups about delivery vehicles, npm vs plugin, and the `marketplace add` → `plugin install` flow.

**Key new findings:**

1. **Plugin install ≠ npm install.** Verified empirically: zero installed plugins on this machine have `node_modules/`. Plugin install clones Markdown/JSON assets. It does NOT run `npm install` or compile native modules. npm publish remains non-negotiable for Cairn's MCP server (better-sqlite3 is a native C++ addon).

2. **The `npx -y` bridge pattern.** Every MCP server on Aaron's machine uses `npx -y @package/name` in its config — this auto-installs from npm on first invocation. After npm publish, Cairn's `.mcp.json` should switch from `node dist/mcp/server.js` to `npx -y --package=@akubly/cairn cairn-mcp`. This makes plugin install self-sufficient: it registers the MCP config, npx handles the npm dependency chain.

3. **Infrastructure is already built.** Phase 6 created all four required files (plugin.json, marketplace.json, hooks.json, .mcp.json). The only change needed is the `.mcp.json` command path after npm publish. This is ~30 minutes of work, not a separate phase.

4. **Revised priority.** Plugin distribution upgraded from "Low (Phase 7+)" to "Medium (part of npm publish work)." It's a configuration change, not a development effort.

5. **Plugins cannot bundle extensions.** No `extensions` field in plugin.json schema. Extensions and plugins are architecturally separate with no bridging mechanism. Extensions are file-copy to `.github/extensions/` or `~/.copilot/extensions/` only.

### 2026-04-05: Phase 6 Complete — Plugin Packaging Shipped & npm Publish

**Phase 6 Outcome:** ✅ COMPLETE AND SHIPPED

**Deliverables:**
1. ✅ Plugin infrastructure (plugin.json, marketplace.json, hooks.json, .mcp.json)
2. ✅ PowerShell hook wrappers (curate.ps1, record.ps1) with two-tier path resolution
3. ✅ README refresh (test counts 106→136, phase labels corrected, hooks/MCP documentation)
4. ✅ MCP configuration debugging (3 cycles: stdio args, npm wrappers, symlink resolution)
5. ✅ isScript guard extraction to shared utility (src/utils/isScript.ts)
6. ✅ Code review 5 cycles (21 total comments, all resolved)
7. ✅ @akubly/cairn@0.1.0 published to npm

**PR #12 Review Process:**
- Round 1: 3 comments (CR byte, README clarity, broken refs) → Fixed
- Round 2: 3 comments (hooks.json spec, prepublishOnly gates, more refs) → Fixed
- Round 3+: Additional refinements (realpathSync safety, argv[1] guard, isScript extraction)
- Final status: 21 total comments across all cycles, all resolved, approved and merged

**MCP Configuration Debugging:**
- **Cycle 1:** Changed `.copilot/mcp-config.json` from `cairn-mcp` binary (didn't exist) to `node dist/mcp/server.js`
- **Cycle 2:** npm link created symlinks; isScript guard failed; switched to direct node invocation
- **Cycle 3:** fs.realpathSync could crash; added try/catch with fail-open semantics

**Quality Metrics:**
- 134/134 tests passing (final)
- Clean TypeScript build
- Zero lint violations
- All validation gates: build, test, lint, manifest, MCP registration, package.json

**Key Learning:** Plugin ecosystem maturity issues — specs emerging, manual review necessary despite tooling. Five comment rounds on plugin packaging suggests complexity exceeds initial estimate. Code review burden higher for ecosystem artifacts than core code.

**Backlog for Phase 7:**
- CLI extension prototype spike (real evaluation, not skip decision)
- Worktree support (#11)
- Bash wrappers (macOS/Linux)
- awesome-copilot submission

**Lesson Applied:** Extensions investigation showed importance of artifact-centric investigation (inspect SDK source, type defs) vs documentation-centric (which leads to false negatives). This pattern will inform Phase 7 research tasks.

**Critical Cross-Team Observation:** Installation architecture revealed three surfaces were broken (MCP registration missing, hooks hardcoded, binaries not on PATH). Phase 6 fixed manifests but still needs Phase 7 CLI implementation (cairn install/uninstall) for end-to-end automation. Plugin distribution requires this before it's production-ready.

### 2026-04-03: Phase 6 Architecture — Prescriber Design

**Type:** Architecture design session
**Artifact:** .squad/decisions/inbox/graham-prescriber-architecture.md

**Key architecture decisions:**

1. **Prescriber as built-in agent behind plugin interface** — No plugin system exists yet, so build as src/agents/prescriber.ts with a PrescriberPlugin interface. MCP tools and hooks call through the interface, not directly to implementation. One level of indirection now; pays off at extraction time.

2. **Conditional prescribe in preToolUse** — prescribe() runs ONLY when curate() reports new/reinforced insights. Zero cost on the common path (no new patterns). 500ms hard cap on prescribe() execution.

3. **add_instruction as sole MVP type** — Append text to instruction files. Safe (additive), observable (idempotent markers), reversible (delete marked block). Silently skip insights that need unsupported prescription types.

4. **Safe apply mechanics** — Idempotent markers (<!-- cairn:prescription:ID -->), file hash verification at apply time, atomic writes (temp + rename), state machine with pplying intermediate state for crash recovery.

5. **4-tool MCP surface** — list_prescriptions, get_prescription (preview/diff), apply_prescription, dismiss_prescription. Preview tool is essential UX — don't skip it.

6. **Deferred Compiler** — Instruction additions are markdown, no syntax to validate. Human approval gate + idempotent markers provide sufficient safety for MVP.

**Critic feedback incorporated:**
- Added pplying/pply_failed states for crash safety
- Added content_hash, ile_hash_before, pply_marker fields for idempotency
- Added supersedes_id for prescription lineage tracking
- Made prescribe() conditional on curate() results (not unconditional)
- Added get_prescription preview tool (was missing from initial 3-tool plan)

**Key file paths for Phase 6:**
- src/agents/prescriber.ts — Core agent
- src/agents/prescriptionGenerators.ts — Pattern→prescription mapping
- src/discovery/artifacts.ts — Convention-based artifact scanner
- src/db/prescriptions.ts — Prescription CRUD
- src/db/migrations/005-prescriptions.ts — Schema
- src/mcp/server.ts — 4 new tools added here

**Naming collision noted:** insights.prescription (static text advice) vs prescriptions table (concrete actions). Document clearly; rename insight column to ecommendation in Phase 6D.

### 2026-04-06: Prescriber Final Plan — Aaron's 6 Decisions Incorporated

**Type:** Architecture finalization
**Outcome:** Produced definitive implementation plan (`.squad/decisions/inbox/graham-prescriber-final-plan.md`)

**Aaron's 6 binding decisions and their architectural implications:**

1. **DP1 — Hybrid Trigger (C1):** preToolUse chains prescribe() after curate() when insights change + run_curate MCP tool chains prescribe() automatically. No separate generate_prescriptions tool. Implication: curate() needs `insightsChanged` return flag; both trigger paths share the same prescribe() call. curate() capped at 3s.

2. **DP2 — 8-State Lifecycle:** generated, accepted, rejected, deferred, applied, failed, expired, suppressed. Original 7-state from architecture doc expanded to 8 by adding `suppressed`. No `presented`, `superseded`, or `applying` micro-states.

3. **DP3 — 4 New MCP Tools (10 total):** list_prescriptions, get_prescription, resolve_prescription, show_growth. Plus run_curate extended. resolve_prescription is unified with disposition enum (accept/reject/defer).

4. **DP4 — Full 4-Phase Scanner:** User, project, plugins, marketplace. Per-artifact-type resolution rules, conflict detection, ownership tracking. SQLite cache with 5-min TTL.

5. **DP5 — All 10 UX Principles:** Full Valanice spec from day one. Every MCP tool response must reflect UX principles. 7 preference keys via existing cascade.

6. **DP6 — managed_artifacts + Sidecars:** Sidecar instruction files, not user-owned file modification. managed_artifacts table with rollback + drift detection.

**Plan structure:** 6 sub-phases (7A-7F), 15 new files, 7 modified, ~115 new tests (target ~250 total). Critical path: 7A -> 7B -> 7D -> 7F.

### 2026-04-07: Phase 8D Design — Skill Test Harness Architecture

**Type:** Design space analysis (no implementation)  
**Trigger:** Aaron's 4 open design questions about the test harness after Phase 8A-C shipped (PR #16)

**Key architectural decisions:**

1. **Test scenario format: YAML + TypeScript execution engine.** YAML defines scenarios declaratively (machine-readable, agent-authorable, portable). TypeScript provides the execution engine (Vitest integration, type safety). Rejected: pure TypeScript (verbose, requires TS knowledge), Markdown sidecar (fragile parsing, already built one parser).

2. **"Executing" a skill = content quality analysis.** Skills are instruction documents, not programs. Three tiers of "execution": Tier 1 (deterministic heuristics — hedge words, cross-references, actionable verbs), Tier 2 (LLM-as-judge — prompt + skill → evaluate output), Tier 3 (agent simulation). Only Tier 1 ships in Phase 8D. Unified `ValidatorRule` interface supports all three via sync/async evaluate.

3. **Golden results: YAML expectations + DB results (hybrid).** Expectations (what SHOULD happen) live in versioned YAML alongside the skill. Results (what DID happen) live in knowledge.db `skill_test_results` table. "Track everything" principle satisfied. PR-reviewable expectations + SQL-queryable historical results.

4. **Deterministic first, LLM later (tiered).** 12-15 Tier 1 rules across 5 C's (Clarity, Completeness, Concreteness, Consistency, Containment). Same interface as future Tier 2 rules. No architectural change when Copilot SDK lands — only the rule registry grows.

5. **Validator separate from linter.** `skillLinter.ts` = structure (pass/fail, CI gate). `skillValidator.ts` = quality (scored 0.0-1.0, advisory). Different concerns, different consumers, different output shapes.

**New modules designed:**
- `src/agents/skillValidator.ts` — Tier 1 quality rules (pure functions)
- `src/agents/skillTestHarness.ts` — Scenario loader, orchestrator, Vitest helper
- `src/db/skillTestResults.ts` + migration 009
- `test_skill` MCP tool

**Deliverables:** ~40-50 new tests, 5+ fixture skills, ~8 new/modified files.

**4 open questions raised for Aaron:** YAML dependency (recommend `yaml` package), threshold configurability, MCP tool granularity (recommend single tool), dogfooding (recommend testing Cairn's own generated skills).

**Decision document:** `.squad/decisions/inbox/graham-phase-8d-design.md`

**Architectural insight:** The parser → linter → validator pipeline mirrors the established 3-layer architecture: Parser is pure parse (primitive), Linter validates structure (primitive), Validator scores quality (primitive), TestHarness orchestrates (assembler), test_skill MCP tool presents (experience). Each layer adds analysis depth while sharing the `ParsedSkill` AST as common currency.