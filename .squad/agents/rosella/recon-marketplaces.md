# Recon: Plugin Marketplaces & Extension Ecosystems

**Author:** Rosella (Plugin Dev)
**Date:** 2026-03-28
**Scope:** Copilot plugin marketplaces, MCP registries, agent skill ecosystems

---

## 1. Marketplace Inventory

### 1.1 github/awesome-copilot (Primary — Official GitHub)

- **URL:** https://github.com/github/awesome-copilot
- **Website:** https://awesome-copilot.github.com
- **License:** MIT
- **Status:** Active, community-driven, officially maintained by GitHub

#### Structure (Top-Level Directories)

| Directory | Type | Count | Format |
|-----------|------|-------|--------|
| `agents/` | Custom agents | ~170+ files | `.agent.md` (markdown + YAML frontmatter) |
| `skills/` | Agent skills | ~240+ folders | Folder with `SKILL.md` (YAML frontmatter + markdown) |
| `instructions/` | Copilot instructions | ~170+ files | `.instructions.md` (markdown + YAML frontmatter) |
| `plugins/` | Bundled plugins | ~55+ folders + `external.json` | Folder with `.github/plugin/plugin.json` + README |
| `hooks/` | Lifecycle hooks | 6 folders | Folder with `README.md` + `hooks.json` + scripts |
| `workflows/` | Agentic Workflows | 7 files | `.md` with YAML frontmatter (events, permissions) |
| `cookbook/` | Tutorials/guides | 3 items | Markdown + YAML catalog |
| `.schemas/` | Validation schemas | 3 files | JSON Schema (tools, collection, cookbook) |

#### Artifact Categories in Detail

**Agents (~170+):** Markdown files with YAML frontmatter defining persona, model, tools, and system prompt.
- Frontmatter: `description`, `model` (e.g. "GPT-5"), `tools` (e.g. ["codebase", "terminalCommand"]), `name`
- Notable agents: `context-architect`, `expert-dotnet-software-engineer`, `polyglot-test-generator`, `gem-orchestrator`, `tdd-red/green/refactor`, `terraform`, `playwright-tester`, `plan`, `prd`
- Partner agents: amplitude, apify, arm-migration, diffblue, droid, dynatrace, jfrog, launchdarkly, lingodotdev, monday, mongodb, neo4j, neon, octopus, pagerduty, stackhawk, terraform, comet-opik

**Skills (~240+):** Each is a folder with a `SKILL.md` file following the open Agent Skills spec (agentskills.io).
- Frontmatter: `name` (must match folder), `description`
- Body: Markdown instructions, templates, output formats
- Optional: `scripts/`, `references/`, `assets/` subdirectories
- Categories span: testing (xunit, nunit, mstest, junit, jest, pytest), cloud (azure, aws), DB (sql, postgresql, cosmosdb), planning (create-implementation-plan, prd, create-technical-spike), code quality (refactor-plan, dotnet-best-practices), documentation, MCP server generators (csharp, go, java, kotlin, php, python, ruby, rust, swift, typescript), and more

**Instructions (~170+):** Single-file markdown with YAML frontmatter defining `description`.
- Used to customize Copilot behavior for specific technologies
- Covers: languages (C#, Go, Rust, Python, Java, Kotlin, Ruby, Swift, PHP, Clojure, R, Scala), frameworks (ASP.NET, Next.js, NestJS, Spring Boot, Rails, Django, Svelte, Astro, Blazor, .NET MAUI, WinUI3), practices (code review, security, accessibility, context engineering, TDD), platforms (Azure, AWS, Kubernetes, Docker, Terraform)

**Plugins (~55+):** Bundles of agents + skills + commands around a theme.
- Structure: `plugins/<name>/.github/plugin/plugin.json` + `README.md`
- `plugin.json` follows Claude Code spec: `name`, `description`, `version`, `author`, `repository`, `license`, `keywords`, `agents[]`, `skills[]`
- Notable plugins: `polyglot-test-agent`, `partners`, `context-engineering`, `software-engineering-team`, `gem-team`, `rug-agentic-workflow`, `testing-automation`, `project-planning`, `database-data-management`, `frontend-web-dev`
- External plugins (`external.json`): References to plugins in other repos (dataverse, azure, dotnet, dotnet-diag, skills-for-copilot-studio, modernize-dotnet, microsoft-docs, figma)

**Hooks (6):** Event-driven automation scripts triggered during Copilot agent sessions.
- `dependency-license-checker`, `governance-audit`, `secrets-scanner`, `session-auto-commit`, `session-logger`, `tool-guardian`
- Structure: folder with `README.md` (frontmatter: name, description, tags), `hooks.json`, executable scripts

**Workflows (7):** Agentic Workflows for GitHub Actions automation.
- `daily-issues-report`, `ospo-contributors-report`, `ospo-org-health`, `ospo-release-compliance-checker`, `ospo-stale-repos`, `relevance-check`, `relevance-summary`
- Markdown with YAML frontmatter: `name`, `description`, `on` (schedule/events), `permissions`, `safe-outputs`

#### Installation

```bash
# CLI plugin install
copilot plugin install <plugin-name>@awesome-copilot

# Individual artifacts can be copied directly into repo's
# .github/copilot-instructions.md, .github/skills/, etc.
```

#### Contribution Model

- PRs target `staged` branch (not main)
- CLI scaffolding: `npm run skill:create`, `npm run plugin:create`
- Validation: `npm run skill:validate`, `npm run plugin:validate`
- README auto-generation: `npm run build`
- All-contributors recognition system

---

### 1.2 github/copilot-plugins (Official — GitHub First-Party)

- **URL:** https://github.com/github/copilot-plugins
- **License:** MIT
- **Status:** Active, early stage ("coming soon" for MCP servers, hooks, extensibility tools)

#### Contents

| Plugin | Description |
|--------|-------------|
| `advanced-security` | GitHub Advanced Security integration (skills for code scanning, secret scanning) |
| `spark` | GitHub Spark integration |
| `workiq` | Work intelligence/productivity plugin |

#### Structure
- `plugins/<name>/README.md` + `plugins/<name>/skills/` subdirectory
- Simpler than awesome-copilot; focused on first-party GitHub feature integrations

---

### 1.3 heilcheng/awesome-agent-skills (Community)

- **URL:** https://github.com/heilcheng/awesome-agent-skills
- **Status:** Community curated list
- **Format:** README-based catalog (not installable plugins)
- **Multilingual:** EN, ES, JA, KO, ZH-CN, ZH-TW
- **Focus:** Cross-platform agent skills (Claude, Copilot, Codex)
- **Value:** Discovery/reference, not direct installation

---

### 1.4 SkillsMP.com (skillsmp.com)

- **URL:** https://skillsmp.com
- **Status:** Active community marketplace
- **Size:** Claims 500,000+ agent skills
- **Format:** Uses open SKILL.md standard (agentskills.io)
- **Cross-platform:** Claude, Copilot, Codex, Gemini
- **Features:** Search, category filtering, quality indicators
- **Install:** Browse → copy SKILL.md into repo's skills directory

---

### 1.5 GitHub Marketplace (Copilot Extensions)

- **URL:** https://github.com/marketplace?type=apps&copilot_app=true
- **Status:** Active but transitioning
- **Key Shift:** Legacy Copilot Extensions (GitHub Apps) being sunsetted Nov 2025 → migrating to MCP standard
- **Top Extensions:** Docker, PerplexityAI, Stack Overflow, SonarQube, Snyk, CircleCI
- **Types:** Public + private (org-scoped) extensions
- **Future:** MCP Registry replaces the Extensions category

---

### 1.6 VS Code Marketplace (Agent Plugins)

- **URL:** https://marketplace.visualstudio.com
- **Status:** Preview (Spring 2026)
- **Notable:** "Copilot MCP + Agent Skills Manager" extension (AutomataLabs)
- **Integration:** Built-in browsing/installing of agent plugins from central marketplaces
- **Format:** Same plugin.json / SKILL.md format as awesome-copilot

---

## 2. MCP Server Registries

### 2.1 Official MCP Registry

- **URL:** https://registry.modelcontextprotocol.io
- **Repo:** https://github.com/modelcontextprotocol/registry
- **Tech:** Go service with REST API + CLI
- **Server entry format:** `server.json` with identity, runtime, download location, metadata
- **Ownership validation:** GitHub namespace or domain verification
- **Package sources:** npm, PyPI, Docker Hub, and more
- **Status:** Authoritative registry, actively developed

### 2.2 Smithery

- **URL:** https://smithery.ai
- **Status:** Largest open marketplace for MCP servers
- **Features:** CLI for install/management, remote + local deployment options
- **Security:** Ephemeral token handling, local-first credentials

### 2.3 MCP.so

- **URL:** https://mcp.so
- **Size:** 11,000+ servers indexed
- **Focus:** Centralized listing with search and filter

### 2.4 Other MCP Directories

| Registry | URL | Focus |
|----------|-----|-------|
| PulseMCP | pulsemcp.com | Interactive exploration |
| Cursor Directory | cursor.directory | Cursor-compatible MCP servers |
| mcpmarket.com | mcpmarket.com | Advanced filtering/search |
| Awesome MCP Servers | Various repos | Curated community lists |
| `@mastra/mcp-registry-registry` | npm | Meta-registry aggregator |

---

## 3. Plugin Format Analysis

### 3.1 The Three Core Formats

#### Agent Files (`.agent.md`)
```yaml
---
description: "Brief description"
model: "GPT-5"
tools: ["codebase", "terminalCommand"]
name: "Agent Name"
---
System prompt in markdown...
```
- Single file, no folder needed
- Frontmatter defines model + tools
- Body is the system prompt

#### Skill Folders (`SKILL.md`)
```yaml
---
name: skill-name          # must match folder name
description: "What it does and when to use it"
license: Apache-2.0       # optional
compatibility: "..."      # optional
metadata:                  # optional
  author: org-name
  version: "1.0"
allowed-tools: tool1 tool2 # optional, experimental
---
## Instructions
Markdown instructions, templates, output formats...
```
- Folder-based (skill-name/SKILL.md)
- Cross-platform: works in Copilot, Claude Code, Codex, Gemini CLI
- Follows agentskills.io specification
- Can include scripts/, references/, assets/ subdirectories

#### Plugin Bundles (`plugin.json`)
```json
{
  "name": "plugin-id",
  "description": "Plugin description",
  "version": "1.0.0",
  "keywords": ["tag1", "tag2"],
  "author": { "name": "Author Name" },
  "repository": "https://github.com/org/repo",
  "license": "MIT",
  "agents": ["./agents"],
  "skills": ["./skills/skill-name"]
}
```
- Located at `plugins/<name>/.github/plugin/plugin.json`
- Follows Claude Code spec
- Bundles agents + skills + commands
- Declarative references → CI materializes content

#### Instruction Files (`.instructions.md`)
```yaml
---
description: "Instructions for X technology"
---
# Technology Name
## Instructions
- Bullet-point guidance...
```
- Single file, simplest format
- Used in `.github/copilot-instructions.md` or loaded automatically

### 3.2 External Plugin References (`external.json`)
```json
{
  "name": "plugin-name",
  "source": { "source": "github", "repo": "owner/repo", "path": "..." },
  "description": "...",
  "version": "1.0.0",
  "author": { "name": "...", "url": "..." },
  "homepage": "...",
  "keywords": [],
  "license": "MIT",
  "repository": "..."
}
```
- Source types: github, url (git), npm, pip
- Merged into `marketplace.json` during build

### 3.3 Cross-Platform Compatibility

The SKILL.md standard (agentskills.io) is the convergence point:
- **GitHub Copilot** → `.github/skills/` or repo-level `skills/`
- **Claude Code** → `.claude/skills/` or SKILL.md in project
- **OpenAI Codex** → Reads SKILL.md format
- **Gemini CLI** → Reads SKILL.md format
- **VS Code** → Skills discovered via `/skills` command

---

## 4. Comparison of Marketplace Approaches

| Aspect | awesome-copilot | copilot-plugins | SkillsMP | GitHub Marketplace | MCP Registry |
|--------|----------------|-----------------|----------|-------------------|-------------|
| **Owner** | GitHub (community) | GitHub (official) | Community | GitHub | Anthropic/Community |
| **Size** | 600+ artifacts | 3 plugins | 500K+ claims | Dozens | Growing |
| **Format** | .agent.md, SKILL.md, plugin.json | Skills folders | SKILL.md | GitHub Apps → MCP | server.json |
| **Install** | CLI / copy | CLI / copy | Copy | Marketplace UI | CLI / config |
| **Contribution** | PR to `staged` | PR | Submit | App registration | PR / publish |
| **Quality Control** | Review + validation scripts | Internal | Community | GitHub review | Publisher verification |
| **Cross-platform** | Partial (SKILL.md yes) | No | Yes | No | Yes (MCP standard) |

---

## 5. Key Observations

1. **awesome-copilot is the gravitational center.** It's the largest, best-organized, and most actively maintained collection. Our project's suggest-awesome-* skills already integrate with it.

2. **Three-layer architecture emerging:**
   - **Instructions** = static behavioral guidance (simplest)
   - **Skills** = task-oriented reusable modules (SKILL.md standard)
   - **Plugins** = bundles of agents + skills + MCP servers (richest)

3. **SKILL.md is the universal format.** Cross-platform (Copilot, Claude, Codex, Gemini). Our project should standardize on it.

4. **Plugins follow Claude Code spec.** The `plugin.json` format with `agents[]`, `skills[]`, `commands[]` arrays is the packaging standard.

5. **MCP is replacing Copilot Extensions.** GitHub is sunsetting GitHub Apps-based extensions in favor of MCP servers. The official MCP Registry is the future discovery mechanism.

6. **External plugins pattern is powerful.** awesome-copilot's `external.json` lets any repo be a plugin source without copying code — just declare the reference.

7. **Partner ecosystem is significant.** 20+ partners (Amplitude, Dynatrace, LaunchDarkly, MongoDB, Neon, PagerDuty, Terraform, etc.) have official agents in awesome-copilot.

---

## 6. Recommendations for Our Project

1. **Primary Source: awesome-copilot.** Use it as our marketplace backend. The suggest-awesome-* skills already bridge to it. Consider deeper integration.

2. **Adopt SKILL.md format** for any skills we create. It's the cross-platform standard and maximizes portability.

3. **Use plugin.json (Claude Code spec)** for packaging. It's what awesome-copilot, copilot-plugins, and VS Code all converge on.

4. **Consider external.json registration** — if we build reusable plugins, we can get them listed in awesome-copilot's marketplace without moving our code.

5. **MCP server integration** is the future for tool-based capabilities. Watch the official MCP Registry as the primary discovery mechanism.

6. **Don't build a custom marketplace** — the ecosystem already has multiple. Instead, build bridges to existing ones and focus on the plugin authoring experience.

---

## Sources

- https://github.com/github/awesome-copilot
- https://github.com/github/copilot-plugins
- https://agentskills.io/specification
- https://skillsmp.com
- https://github.com/marketplace?type=apps&copilot_app=true
- https://registry.modelcontextprotocol.io
- https://github.com/modelcontextprotocol/registry
- https://smithery.ai
- https://mcp.so
- https://github.com/heilcheng/awesome-agent-skills
- https://developer.microsoft.com/blog/awesome-github-copilot-just-got-a-website-and-a-learning-hub-and-plugins
- https://code.visualstudio.com/docs/copilot/customization/agent-plugins
- https://chris-ayers.com/posts/agent-skills-plugins-marketplace/
- https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/
