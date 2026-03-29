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
