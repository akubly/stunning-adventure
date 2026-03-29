# Graham — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Lead
- **Joined:** 2026-03-28T06:21:47.377Z

## Learnings

<!-- Append learnings below -->

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
