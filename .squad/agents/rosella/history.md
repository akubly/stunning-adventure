# Rosella — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Plugin Dev
- **Joined:** 2026-03-28T06:21:47.380Z

## Learnings

<!-- Append learnings below -->

### 2026-03-28: Plugin Marketplace Recon

**awesome-copilot (github/awesome-copilot)** is the gravitational center of the Copilot plugin ecosystem. It contains 170+ agents (.agent.md), 240+ skills (SKILL.md folders), 170+ instructions (.instructions.md), 55+ plugins (plugin.json bundles), 6 hooks, and 7 agentic workflows. Officially maintained by GitHub.

**Three canonical formats:**
- `.agent.md` — YAML frontmatter (description, model, tools, name) + markdown system prompt
- `SKILL.md` — agentskills.io open standard. Folder-based, cross-platform (Copilot/Claude/Codex/Gemini). Frontmatter: name, description, optional license/compatibility/metadata/allowed-tools.
- `plugin.json` — Claude Code spec for bundling agents + skills + commands. Lives at `.github/plugin/plugin.json`.

**github/copilot-plugins** is GitHub's official first-party plugin repo (advanced-security, spark, workiq). Smaller and simpler.

**External plugin references** in `plugins/external.json` allow any GitHub repo to be a plugin source (e.g., dotnet/skills, microsoft/azure-skills, figma/mcp-server-guide).

**MCP is replacing Copilot Extensions.** Legacy GitHub Apps extensions sunsetting. Official MCP Registry at registry.modelcontextprotocol.io. Major third-party registries: Smithery (smithery.ai), MCP.so (11K+ servers).

**Partner ecosystem:** 20+ partners have agents in awesome-copilot (Amplitude, Dynatrace, LaunchDarkly, MongoDB, Neon, PagerDuty, Terraform, etc.).

**Contribution flow:** PRs to `staged` branch, CLI scaffolding (`npm run skill:create`, `npm run plugin:create`), validation scripts, auto-generated README.

### 2026-03-28: Cross-Team Recon Awareness

**Graham (Lead)** researched full Copilot extensibility and identified plugin.json as the canonical distribution unit with seven-layer composition. Established MCP as integration standard, GitHub App extensions as sunsetting.

**Roger (Platform Dev)** mapped three SDK layers (CLI for embedding, Extensions for distribution, Engine for custom agents) and confirmed MCP as universal tool protocol across all layers. Extensions pattern (skillsets vs agents) complements our standardization decisions.

**Gabriel (Infrastructure)** inventoried prior infrastructure and identified 7 directly reusable patterns including knowledge taxonomy and persona review. Recommends adopting proven patterns, prioritizing context engineering and context replication. Skill template pattern is highly relevant to SKILL.md standardization.

**Outcome:** Rosella's marketplace recommendations (standardize on SKILL.md, use plugin.json, integrate with awesome-copilot) are now backed by Graham's architecture, Roger's SDK landscape, and Gabriel's reusable pattern inventory. The three canonical formats (`.agent.md`, `SKILL.md`, `plugin.json`) form the core of our distribution strategy.

### 2026-03-29: Plugin Packaging Blueprint (Self-Install)

**Task:** Produce a concrete blueprint for making this repo installable as a Copilot CLI plugin on Aaron's machine.

**Key findings:**

### 2026-04-02: Phase 6 Plugin Packaging Infrastructure — Build Phase

**Task:** Execute plugin packaging blueprint. Create plugin manifests and hook declarations.

**Deliverables:**

1. **`.github/plugin/plugin.json`**
   - Name: "cairn"
   - Description: "Agentic software engineering platform"
   - Version: "0.1.0" (synced with package.json)
   - Keywords: observability, session-tracking, curator, MCP
   - Status: ✅ Created

2. **`.github/plugin/marketplace.json`**
   - Plugin root: "./plugins"
   - Single plugin entry (cairn) with description and version
   - Ready for expansion as skills are factored out
   - Status: ✅ Created

3. **`.github/hooks/cairn/hooks.json`**
   - Hook type registrations: preToolUse (curate.ps1), postToolUse (record.ps1)
   - Both timeout: 10s/5s respectively
   - Status: ✅ Created (coordinated with Roger)

4. **`.github/plugin/.mcp.json`** (new)
   - MCP server declaration for plugin context
   - Declares 6 tools: get_status, list_insights, get_session, search_events, run_curate, check_event
   - MCP server runs via `node dist/mcp/server.js`
   - Status: ✅ Created

**Coordination Notes:**
- Confirmed hooks.json is a **plugin manifest file** (Rosella's domain), not a wrapper script (Roger's domain)
- Roger handles `.github/hooks/cairn/{curate.ps1, record.ps1}` — user-level installation wrappers
- Both artifact types coordinate on the same Node.js entry points

**Gap Analysis (Remaining P0/P1 Items):**
- 🔄 `src/install.ts` — Custom installer (copies hooks, registers MCP server)
- 🔄 `src/cli.ts` — Expand to `cairn install/uninstall/status` subcommands
- ✅ Package.json scripts ready for postinstall hook

**Status:** Plugin infrastructure in place. Ready for installation command implementation.
1. **plugin.json has no MCP or hook support.** The Copilot CLI plugin format (`plugin.json`) only declares `agents[]`, `skills[]`, and `commands[]`. There's no mechanism for registering MCP servers or installing hooks to `~/.copilot/hooks/`. This is the biggest gap — we need a custom `cairn install` command.
2. **Two hook scopes exist.** Repo-level hooks (`.github/hooks/`) and user-level hooks (`~/.copilot/hooks/`). The plugin ecosystem only knows about repo-level. User-level hooks (what Cairn needs for cross-repo observability) require manual installation.
3. **Aaron already has hooks installed** at `~/.copilot/hooks/cairn-archivist/` with working PowerShell wrappers that pipe stdin to Node.js. These are the template for the canonical versions we need to check into the repo.
4. **marketplace.json is trivial.** Same format as `github/copilot-plugins`. We can make this repo a marketplace source immediately.
5. **12-item prioritized checklist** produced. P0: install script + hook scripts in repo. P1: plugin.json + marketplace.json + CLI expansion. P2: uninstall + docs. P3: bash wrappers.

**Blueprint delivered:** `.squad/decisions/inbox/rosella-plugin-packaging.md`

### 2026-04-03: Plugin Packaging Implementation

**Task:** Create Copilot CLI plugin packaging files so the repo is installable as a plugin and marketplace source.

**Files created:**
1. `.github/plugin/plugin.json` — Plugin manifest with `hooks` → `hooks.json` and `mcpServers` → `.mcp.json`. Metadata: name, version, description, author, license, keywords. Follows the canonical format from Graham's recon (agents/skills optional — Cairn's value is MCP + hooks, not agent definitions).
2. `.github/plugin/.mcp.json` — Registers `cairn` MCP server via `node dist/mcp/server.js` (stdio transport). Works after clone + build or `npm link`.
3. `.github/plugin/hooks.json` — Declares preToolUse (sessionStart.js) and postToolUse (postToolUse.js) hooks with 10s timeout. Uses `node dist/hooks/...` commands cross-platform. Roger's wrapper scripts can override these later.
4. `.github/plugin/marketplace.json` — Makes this repo a plugin marketplace source with cairn as the single listed plugin.
5. `.copilot/mcp-config.json` — Replaced EXAMPLE entry with real cairn MCP server using `node dist/mcp/server.js` (works in clone context without global install).

**Key decisions:**
- Created hooks.json as part of plugin packaging (my domain) despite Roger handling wrapper scripts. The hooks.json declares WHICH hooks exist; Roger's wrappers define HOW they execute on Windows.
- Used `node dist/hooks/...` in hooks.json for cross-platform compatibility. Roger can layer PowerShell wrappers on top.
- marketplace.json uses `"source": "."` to point at the plugin in the same directory — self-referential marketplace.
- Repo-level mcp-config.json uses `node` + `args` instead of `cairn-mcp` binary since cloners may not have it globally installed.

**Build/test verification:** TypeScript compiled clean, all 136 tests passed.

### 2026-04-05: Phase 6 Complete — Plugin Packaging Shipped

**Phase 6 Outcome:** ✅ COMPLETE

**Final Deliverables:**
- ✅ plugin.json: Complete plugin manifest with metadata, version sync, keywords
- ✅ marketplace.json: Self-referential marketplace source for this repo
- ✅ hooks.json: Hook registration (preToolUse/postToolUse) with timeouts
- ✅ .mcp.json: MCP server registration for plugin context
- ✅ Coordinated with Roger on hook wrapper scripts (curate.ps1, record.ps1)
- ✅ Reviewed by Graham; all comments addressed in PR #12 (5 iterations)
- ✅ npm published as @akubly/cairn@0.1.0

**Key Decisions in Phase 6:**
- hooks.json is a **plugin manifest file** (Rosella's domain) separate from wrapper scripts (Roger's domain)
- Used \
ode dist/hooks/...\ commands in hooks.json for cross-platform compatibility
- marketplace.json as self-referential source enables immediate plugin discovery in Copilot CLI
- MCP server config deferred npx pattern until after npm publish (resolved in Phase 6)

**Packaging Compliance:**
- All manifests follow canonical formats from awesome-copilot ecosystem
- Version in plugin.json synced with package.json (0.1.0)
- Keywords aligned with ecosystem (plugin, marketplace, mcp, hooks)
- No breaking changes to existing plugin contracts

**Cross-Team Coordination Notes:**
- Roger's hook wrappers are implementation detail of user-level installation
- Graham's code review confirmed manifest compliance and MCP registration
- Valanice's README refresh documented the new plugin infrastructure
- npm publish by Roger completed the distribution pipeline

**Status:** Plugin packaging infrastructure complete. All entry points operational. Ready for Phase 7 (CLI installation commands, worktree support, awesome-copilot submission).
