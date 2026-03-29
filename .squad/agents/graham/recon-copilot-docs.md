# Recon Report: GitHub Copilot & Copilot CLI Extensibility Architecture

**Author:** Graham (Lead / Architect)
**Date:** 2026-03-28
**Requested by:** Aaron
**Mission:** Deep research on the full Copilot extensibility landscape

---

## Executive Summary

GitHub Copilot's extensibility architecture is a **layered system with seven distinct extension points**: custom instructions, skills, tools, MCP servers, hooks, custom agents, and plugins. These compose into a coherent hierarchy where plugins package everything, agents define personas, skills define task-specific workflows, hooks provide lifecycle control, MCP servers add external capabilities, and instructions set behavioral baselines. The old GitHub App-based "Copilot Extensions" model is being **sunset November 10, 2025** in favor of MCP servers as the universal integration standard.

---

## 1. Custom Instructions

### What They Are

Natural language Markdown files that tell Copilot **how to behave** — coding standards, conventions, communication preferences. They are always loaded at session start and injected into every prompt context.

### File Locations (all additive — they combine, not override)

| Location | Scope | File |
|---|---|---|
| `.github/copilot-instructions.md` | Repository-wide | Single file |
| `.github/instructions/**/*.instructions.md` | Path-specific | Multiple files with `applyTo` frontmatter |
| `AGENTS.md` (repo root or cwd) | Agent instructions | Primary instructions |
| `CLAUDE.md`, `GEMINI.md` (repo root) | Agent instructions | Alternative formats |
| `$HOME/.copilot/copilot-instructions.md` | User-wide / local | Personal defaults |
| `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` env var | Additional dirs | Scans for `AGENTS.md` and `.instructions.md` files |

### Path-Specific Format

```markdown
---
applyTo: "src/components/**/*.tsx"
excludeAgent: "code-review"  # optional: exclude from specific agents
---
# Component Guidelines
- Use TypeScript interfaces for props
- All components must be stateless
```

### Key Insight

Instructions are the **lowest-effort, highest-value** customization. They require no tooling knowledge — just Markdown. They apply to everything, so keep them focused on universal conventions.

**Sources:**
- https://docs.github.com/en/copilot/how-tos/copilot-cli/add-custom-instructions
- https://github.blog/changelog/2025-07-23-github-copilot-coding-agent-now-supports-instructions-md-custom-instructions/

---

## 2. Skills

### What They Are

Discrete, task-specific instruction packages that Copilot loads **only when relevant**. Think of them as "just-in-time" knowledge modules. Based on the open [Agent Skills specification](https://github.com/agentskills/agentskills).

### Structure

```
.github/skills/
  └── github-actions-debugging/
      └── SKILL.md
      └── scripts/  (optional helper scripts)
      └── examples/ (optional reference files)
```

### SKILL.md Format

```markdown
---
name: github-actions-failure-debugging
description: Guide for debugging failing GitHub Actions workflows. Use this when asked to debug failing workflows.
license: MIT  # optional
---

Instructions for the skill...
```

### Discovery Locations

| Type | Location |
|---|---|
| Project skills | `.github/skills/`, `.claude/skills/`, `.agents/skills/` |
| Personal skills | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Plugin skills | Installed via plugin system |

### Invocation

- **Automatic:** Copilot matches skill descriptions to current task context
- **Manual:** `/skill-name` in prompts (e.g., `/frontend-design create a nav bar`)
- **Management:** `/skills list`, `/skills info`, `/skills reload`, `/skills add`

### Skills vs Instructions — When to Use Which

| Use Case | Mechanism |
|---|---|
| Universal conventions (always apply) | Custom instructions |
| Task-specific workflows (apply only when relevant) | Skills |
| Complex specialized work with specific tooling | Custom agents |

**Sources:**
- https://docs.github.com/en/copilot/concepts/agents/about-agent-skills
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills

---

## 3. Custom Agents

### What They Are

Specialized "personas" that define expertise, tool access, and behavioral instructions. Copilot can delegate tasks to agents via subagent processes, each with its own context window.

### Agent Profile Structure (`.agent.md`)

```markdown
---
name: test-specialist
description: Focuses on test coverage and testing best practices
tools: ["read", "edit", "search", "execute"]
model: claude-sonnet-4.5          # optional model override
disable-model-invocation: false   # allow auto-delegation
user-invocable: true              # allow manual selection
mcp-servers:                      # optional agent-specific MCP servers
  custom-mcp:
    type: local
    command: some-command
    tools: ["*"]
---

You are a testing specialist focused on improving code quality...
(up to 30,000 characters of prompt)
```

### Storage Locations

| Level | Location | Scope |
|---|---|---|
| User | `~/.copilot/agents/` | All projects |
| Repository | `.github/agents/` | Current project |
| Organization/Enterprise | `/agents/` in `.github-private` repo | All org/enterprise repos |

### Built-in Agents (Copilot CLI)

- **explore** — Quick codebase analysis
- **task** — Command execution (tests, builds)
- **general-purpose** — Complex multi-step tasks
- **code-review** — Change review with signal-to-noise focus
- **research** — Deep research investigation

### Invocation

- `/agent` slash command to browse/select
- Natural language reference in prompts
- `copilot --agent=name --prompt "..."` from command line
- Auto-delegation when `disable-model-invocation: false`

### Tool Aliases

| Alias | Maps To |
|---|---|
| `execute` / `shell` / `Bash` / `powershell` | Shell tools |
| `read` / `Read` / `NotebookRead` | File viewing |
| `edit` / `Edit` / `MultiEdit` / `Write` | File editing |
| `search` / `Grep` / `Glob` | Code search |
| `agent` / `custom-agent` / `Task` | Subagent delegation |
| `web` / `WebSearch` / `WebFetch` | Web access |

### Key Architectural Properties

- **Versioning:** Based on Git commit SHAs — branch/tag different versions
- **Precedence:** Repository > Organization > Enterprise (lowest level wins)
- **MCP processing order:** Out-of-box → Agent profile → Repository settings

**Sources:**
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents
- https://docs.github.com/en/copilot/reference/custom-agents-configuration

---

## 4. Hooks

### What They Are

Shell-command lifecycle events that fire at key points during agent execution. The **only mechanism for programmatic control** over agent behavior — everything else is prompt-based guidance.

### Hook Types

| Hook | When | Can Block? |
|---|---|---|
| `sessionStart` | New/resumed session begins | No |
| `sessionEnd` | Session completes or terminates | No |
| `userPromptSubmitted` | User submits a prompt | No |
| `preToolUse` | Before any tool executes | **Yes** (can deny) |
| `postToolUse` | After tool completes | No |
| `errorOccurred` | When an error occurs | No |
| `agentStop` | Main agent stops normally | No |
| `subagentStop` | Subagent completes | No |

### Configuration

Located in `.github/hooks/*.json` (must be on default branch for coding agent; loaded from cwd for CLI):

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "type": "command",
        "bash": "./scripts/security-check.sh",
        "powershell": "./scripts/security-check.ps1",
        "cwd": "scripts",
        "timeoutSec": 30,
        "env": { "LOG_LEVEL": "INFO" }
      }
    ]
  }
}
```

### preToolUse — The Power Hook

Only `preToolUse` can return output that affects execution:

```json
{
  "permissionDecision": "deny",
  "permissionDecisionReason": "Destructive operations require approval"
}
```

Input JSON provides `toolName`, `toolArgs`, `timestamp`, `cwd`. Scripts read from stdin, write JSON to stdout.

### Use Cases

- **Security guardrails** — Block dangerous commands, enforce path restrictions
- **Compliance audit trails** — Log all agent actions
- **Cost tracking** — Track tool usage for allocation
- **Code quality enforcement** — Run linters before allowing edits
- **External integrations** — Send alerts to Slack, ticketing systems

**Sources:**
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks
- https://docs.github.com/en/copilot/reference/hooks-configuration

---

## 5. MCP Servers

### What They Are

Model Context Protocol servers that provide **tools** (capabilities) to Copilot. The universal integration standard replacing GitHub App-based Copilot Extensions.

### Configuration Locations

| Scope | File |
|---|---|
| User-wide | `~/.copilot/mcp-config.json` |
| Repository | `.github/copilot/mcp.json` or agent-level `mcp-servers:` YAML |
| Plugin | `.mcp.json` in plugin directory |

### Format

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed"]
    }
  }
}
```

### Built-in MCP Servers

| Server | Capabilities |
|---|---|
| `github` | GitHub.com API — repos, PRs, issues, code search, Actions |
| `playwright` | Browser automation (localhost only by default) |

### Management

- `/mcp add` — Interactive MCP server setup
- `/mcp` — View configured servers
- Tool namespacing: `server-name/tool-name` or `server-name/*`

### Key Insight

MCP is the **strategic integration standard**. GitHub App-based Copilot Extensions sunset Nov 10, 2025. New integrations should be built as MCP servers. MCP is vendor-neutral and works across Copilot, Claude Code, and other MCP-compatible hosts.

**Sources:**
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli#add-an-mcp-server
- https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/

---

## 6. Plugins

### What They Are

**Distributable packages** that bundle agents, skills, hooks, and MCP servers into a single installable unit. The primary distribution mechanism for Copilot CLI customizations.

### Plugin Structure

```
my-plugin/
├── plugin.json           # Required manifest
├── agents/               # Custom agents
│   └── helper.agent.md
├── skills/               # Skills
│   └── deploy/
│       └── SKILL.md
├── hooks.json            # Hook configuration
└── .mcp.json             # MCP server config
```

### plugin.json Manifest

```json
{
  "name": "my-dev-tools",
  "description": "React development utilities",
  "version": "1.2.0",
  "author": { "name": "Jane Doe", "email": "jane@example.com" },
  "license": "MIT",
  "keywords": ["react", "frontend"],
  "agents": "agents/",
  "skills": ["skills/"],
  "hooks": "hooks.json",
  "mcpServers": ".mcp.json"
}
```

### Installation & Management

```bash
copilot plugin install ./my-plugin        # Local install
copilot plugin install owner/repo          # GitHub repo install
copilot plugin list                        # List installed
copilot plugin update plugin-name          # Update
copilot plugin uninstall plugin-name       # Remove
```

### Marketplace System

Marketplaces are Git repositories containing a `.github/plugin/marketplace.json`:

```json
{
  "name": "my-marketplace",
  "owner": { "name": "Your Org" },
  "plugins": [
    {
      "name": "frontend-design",
      "description": "Create professional GUIs...",
      "version": "2.1.0",
      "source": "./plugins/frontend-design"
    }
  ]
}
```

Default marketplaces (pre-configured):
- [github/copilot-plugins](https://github.com/github/copilot-plugins)
- [github/awesome-copilot](https://github.com/github/awesome-copilot)
- [anthropics/claude-code](https://github.com/anthropics/claude-code)
- [claudeforge/marketplace](https://github.com/claudeforge/marketplace)

**Sources:**
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace
- https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins

---

## 7. Agent Client Protocol (ACP)

### What It Is

An open standard for communicating with AI agents. Copilot CLI can run as an ACP server, enabling integration with any ACP-compatible client (IDEs, CI/CD pipelines, custom frontends, multi-agent systems).

### Modes

```bash
copilot --acp --stdio   # stdio mode (for IDE integration)
copilot --acp --port 3000  # TCP mode
```

### Key Insight

ACP enables Copilot CLI to be consumed as an **agent service** by external systems. Combined with MCP (which provides tools TO the agent), ACP completes the picture: MCP gives capabilities IN, ACP provides the agent OUT.

**Source:** https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server

---

## 8. GitHub App-Based Copilot Extensions (DEPRECATED)

### Timeline

| Date | Event |
|---|---|
| Sep 24, 2025 | New creation blocked |
| Nov 3-7, 2025 | Brownout period |
| Nov 10, 2025 | **Full sunset** — all stop working |

### Migration Path

GitHub App-based Extensions → **MCP Servers** (not a 1:1 migration — requires redesign for tool-calling model)

VS Code client-side extensions remain supported and unaffected.

**Source:** https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/

---

## Architectural Observations

### 1. The Extensibility Hierarchy

```
Plugin (packages everything)
├── Custom Agents (personas with tool access)
│   ├── Skills (task-specific knowledge, loaded on demand)
│   ├── MCP Servers (external capabilities)
│   └── Tools (abilities: read, edit, search, execute)
├── Hooks (lifecycle control points)
├── Custom Instructions (behavioral baselines)
└── MCP Server Configs
```

### 2. Design Principles at Work

- **Composition over inheritance:** Each layer is independently useful; plugins compose them
- **Convention over configuration:** Standard directory layouts (`.github/`, `~/.copilot/`)
- **Progressive disclosure:** Instructions → Skills → Agents → Plugins (increasing complexity)
- **Separation of concerns:** Instructions (what), Skills (how), Agents (who), Hooks (when), MCP (where)

### 3. Critical Trade-Offs

| Decision | Trade-off |
|---|---|
| Markdown-based agent profiles | Low barrier to entry, but limited expressiveness — no conditional logic, no state |
| Skills as open standard | Portability across tools, but less tight integration than native plugins |
| Hooks as shell commands | Maximum flexibility, but security surface — hooks run with full user permissions |
| MCP over proprietary extensions | Vendor neutrality, but MCP is younger and less feature-rich than GitHub's own APIs |
| Plugin marketplace as Git repos | Simple distribution, but no quality gates, ratings, or certification |

### 4. Gaps and Unclear Areas

- **No organizational skill support yet** — only project and personal skills; org-level "coming soon"
- **Hook output processing** — only `preToolUse` can return actionable output; other hooks are fire-and-forget
- **Plugin versioning** — marketplace.json has version fields but no semver enforcement or dependency resolution
- **Agent state** — agents are stateless between invocations; no persistent memory within a custom agent definition
- **Testing story** — no built-in framework for testing skills, agents, or hooks in isolation
- **Copilot Memory** — mentioned in docs as storing "memories" of coding patterns, but no API or extension point documented for it

### 5. Implications for This Project

This project is a **Copilot plugin marketplace** — meaning we operate at the highest level of the extensibility hierarchy. Our system needs to:

1. **Understand the plugin.json manifest schema** — it's our core data model
2. **Support marketplace.json** — the distribution format we need to generate/consume
3. **Handle the component taxonomy** — agents, skills, hooks, MCP configs all have different structures
4. **Consider cross-platform compatibility** — skills/agents work across Copilot CLI, VS Code, GitHub.com (coding agent); plugins are CLI-specific currently
5. **Watch the standards** — Agent Skills spec (agentskills/agentskills) and AGENTS.md (AAIF/Linux Foundation) are becoming open standards

---

## Reference Links

### Official Documentation
- [Using GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli)
- [Creating custom agents](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents)
- [Custom agents configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [About agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)
- [Creating skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills)
- [Creating plugins](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating)
- [Plugin marketplace](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-marketplace)
- [Plugin reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference)
- [About plugins](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins)
- [Using hooks](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-hooks)
- [Hooks configuration](https://docs.github.com/en/copilot/reference/hooks-configuration)
- [Custom instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/add-custom-instructions)
- [Comparing CLI features](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/comparing-cli-features)
- [ACP server](https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server)

### Community & Examples
- [github/awesome-copilot](https://github.com/github/awesome-copilot) — Community plugins, agents, skills
- [github/copilot-plugins](https://github.com/github/copilot-plugins) — Official plugin marketplace
- [agentskills/agentskills](https://github.com/agentskills/agentskills) — Open standard for agent skills
- [agentsmd/agents.md](https://github.com/agentsmd/agents.md) — AGENTS.md specification
- [GitHub Blog: How to write a great agents.md](https://github.blog/ai-and-ml/github-copilot/how-to-write-a-great-agents-md-lessons-from-over-2500-repositories/)
- [Chris Ayers: Agent Skills, Plugins and Marketplace Guide](https://chris-ayers.com/posts/agent-skills-plugins-marketplace/)
- [Ken Muse: Creating Agent Plugins](https://www.kenmuse.com/blog/creating-agent-plugins-for-vs-code-and-copilot-cli/)

### Deprecation Notices
- [GitHub App-based Extensions sunset](https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/)
