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
