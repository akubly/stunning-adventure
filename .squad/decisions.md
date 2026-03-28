# Squad Decisions

## Active Decisions

### 2026-03-28T07-22-14: User Directive — Claude Opus 4.6 Context Window

**Author:** Aaron (via Copilot)  
**Type:** Infrastructure  
**Status:** Active

Always use Claude Opus 4.6 (1M context) model for agents that might have large contexts. Ensures agents working on substantive tasks have the full 1M token context window available.

---

### 2026-03-28: Copilot Extensibility Architecture — Plugin System as Primary Distribution Unit

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Active

The team should design around the **plugin system** as the primary distribution format, with `plugin.json` + `marketplace.json` as our core data models.

**Rationale:**
1. Plugins are the composition unit — everything else (agents, skills, hooks, MCP servers) are components that plugins bundle together.
2. `marketplace.json` is the distribution contract. Simple JSON registry in a Git repo. Two default marketplaces ship with Copilot CLI (`github/copilot-plugins`, `github/awesome-copilot`).
3. MCP is the integration standard going forward. GitHub App-based Copilot Extensions are sunset (Nov 10, 2025).
4. Cross-platform reach: Skills and agents work across Copilot CLI, VS Code, GitHub.com. Plugins are CLI-specific (may change).
5. Open standards emerging: Agent Skills spec and AGENTS.md (Linux Foundation AAIF) are becoming cross-vendor standards.

**Trade-offs:**
- Plugin marketplace format is simple (no semver enforcement, no dependency resolution, no quality gates)
- Hook security surface is broad — hooks run with full user permissions
- No built-in testing framework for skills/agents/hooks

**Full Report:** `.squad/agents/graham/recon-copilot-docs.md`

---

### 2026-03-28: Copilot SDK & API Landscape — Integration Depth Decision Required

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Status:** Active

The Copilot extensibility ecosystem has three distinct SDK layers. The team needs to understand which layer(s) apply to our vision.

**Three SDKs, Three Use Cases:**
1. `@github/copilot-sdk` (Technical Preview) — Embed full Copilot agentic runtime in any app. Multi-language. JSON-RPC to Copilot CLI. BYOK support. **Most relevant for programmatic embedding.**
2. `@copilot-extensions/preview-sdk` (Alpha) — Build Copilot Chat extensions as GitHub Apps. SSE streaming. Two patterns: skillsets (lightweight REST) vs agents (full control). **Most relevant for distribution.**
3. `@github/copilot-engine-sdk` (Early) — Build custom engines for coding agent platform. **Advanced — only if building alternative agents.**

**Protocol Standards:**
- MCP (Model Context Protocol) is the standard tool integration protocol (stdio/HTTP).
- SSE is the response streaming protocol for Copilot Extensions.
- JSON-RPC is the protocol between CLI SDK and Copilot CLI server.

**Auth Evolution:**
- Extensions moving from `X-GitHub-Token` to OIDC
- Signature verification uses public keys from `api.github.com/meta/public_keys/copilot_api`
- CLI SDK supports GitHub OAuth, environment tokens, BYOK

**Recommendation:** Decide integration depth (embedding vs. distribution) before committing to SDK. CLI SDK and Extensions SDK serve fundamentally different architectures.

**Full Report:** `.squad/agents/roger/recon-copilot-sdk.md`

---

### 2026-03-28: Plugin Marketplace Landscape — Standardize & Integrate, Don't Rebuild

**Author:** Rosella Chen (Plugin Dev)  
**Type:** Strategy  
**Status:** Active

**Key Findings:**
1. `awesome-copilot` (github/awesome-copilot) is the dominant marketplace: 170+ agents, 240+ skills, 170+ instructions, 55+ plugins. Officially maintained by GitHub.
2. Three standard artifact formats: `.agent.md` (YAML + prompt), `SKILL.md` (agentskills.io open standard, cross-platform), `plugin.json` (Claude Code spec for bundling).
3. MCP is replacing legacy GitHub App extensions. Official MCP Registry (registry.modelcontextprotocol.io) is the discovery hub.
4. Our project has suggest-awesome-* skills. This is the right approach — consume the ecosystem.

**Recommendation:**
- Standardize on SKILL.md format for any skills we author (cross-platform, future-proof)
- Use plugin.json (Claude Code spec) for packaging bundles
- Don't build a custom marketplace — integrate with awesome-copilot
- Consider submitting our plugins to awesome-copilot's external.json for discovery
- Track MCP Registry evolution for tool integration opportunities

**Impact:** How we structure, package, and distribute any plugins or skills.

**Full Report:** `.squad/agents/rosella/recon-marketplaces.md`

---

### 2026-03-28: Prior Infrastructure Reuse & Best Practices Adoption

**Author:** Gabriel Knight (Infrastructure)  
**Type:** Architecture  
**Status:** Active

**Directly Reusable from Prior Infrastructure (akubly/.copilot):**
1. Knowledge taxonomy — `concepts/` (transferable domain judgment) vs `technologies/` (tool-specific HOW) vs `skills/` (orchestrated workflows). Aaron's innovation, ahead of community consensus.
2. Workflow gates — Decision-Point Gate (stop at forks, present options) + Pre-Output Persona Review Gate (review all deliverables). Proven over months.
3. Anti-anchoring discipline — "First thought might be wrong" + generate alternative hypotheses.
4. Skill template — Standardized structure (frontmatter, triggers, inputs, workflow, error recovery, session DB, constraints).
5. Observability SQL schema — `skill_execution_log`, `session_config`, `error_breadcrumbs` tables for cross-skill tracking.
6. Tool guards architecture — Pre-tool safety hooks with fail-open design, approval tokens, caching. Five guard types.
7. Persona review skill — Parallel persona subagents → merge → deduplicate → severity-map → human disposition tracking.

**Pattern-Portable (adapt, don't copy):**
8. Multi-source code review — Parallel-reviewers-with-merge pattern
9. Session persistence pipeline — Post-tool tracking → error tracking → session summary → cross-session recall
10. Cross-skill session DB contracts — Pipeline tables with producer/consumer relationships

**Most Actionable Community Best Practices:**
1. Context engineering over prompt engineering — Finite resource, optimize for compaction
2. Context replication over splitting — Each specialist gets full relevant context
3. Drop-box pattern for decisions — Structured decision recording as async memory
4. AGENTS.md compatibility — Emerging vendor-neutral standard
5. Progressive disclosure — Agents discover context via lightweight references

**Recommendation:** Adopt items 1-7 as foundational infrastructure. Build marketplace on these proven patterns. Items 8-10 as we develop domain-specific skills. Prioritize context engineering and context replication.

**Risks:**
- Over-copying Windows-specific patterns
- Knowledge taxonomy may need adjustment
- Tool guards need platform-specific adaptation

**Full Report:** `.squad/agents/gabriel/recon-infra-and-practices.md`

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
