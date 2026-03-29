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

### 2026-03-28T23-32-36: User Directives — Round 3 Course Corrections

**Author:** Aaron (via Copilot)  
**Type:** Platform Direction  
**Status:** Active

1. **Squad Decoupling** — squad is a 3rd-party solution/CLI plugin — not part of our platform. Decouple naming/concepts.
2. **Personalization First-Class** — BYO plugins, interop with other agentic systems (plan mode, squad, SA), personalization as feature-set.
3. **Track Everything** — First principle: "create the best output." Don't arbitrarily cap features like teach-back. Track /skip everywhere.
4. **Memory Alternatives** — Memory MCP is primitive — explore better alternatives, possibly build our own.
5. **Curator Agent** — Need a dedicated curator/custodian agent — always working, processing errors, insights, pruning knowledge.
6. **Agent Identity Pragmatism** — Identity is NOT about reinventing squad — focus on natural language interactions. Identity as deep concern only if intentional.
7. **Balance Complexity** — Keep manageable and effective; forward-thinking without over-complicating.
8. **RCA-Driven Guardrails** — RCAs should inform future human guardrail decisions, not hard-coded rules.

**Rationale:** Foundational constraints for platform design, emerging from professional plugin work and multi-agent orchestration experience.

**Impact:** All architectural decisions in Round 3 aligned to these directives.

---

### 2026-03-29T00-15-58: User Insight — Queryable Session State

**Author:** Aaron (via Copilot)  
**Type:** UX Requirement  
**Status:** Active

The platform should support queryable session state. Humans should be able to ask "Have we done a review yet? Have we run the tests?" and get an instant answer.

**Rationale:** Real need from Aaron's professional plugin work. Humans need to orient themselves within a workflow at any time without reconstructing state from logs.

**Impact:** Drives design of knowledge.db schema, skip tracking, preference cascade (Roger's Round 3 contribution).

---

### 2026-03-29T00-30-44: Architectural Decision — Platform vs. Pure Plugins

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

The unreliable sessionEnd hook is a solid argument FOR a platform layer, not just standalone plugins. Something needs to initiate subagent/background tasks reliably and specifically when it's most valuable. Pure plugins can't orchestrate their own lifecycle — they need a coordinator that understands timing, sequencing, and reliability.

**Rationale:** Aaron's response to the Graham vs. Rosella debate. This settles the R3 tension: we DO need some degree of platform, not just a bag of plugins. The platform's job is reliable orchestration of when things run.

**Impact:** Validates 3-layer architecture (R4 outcome). Platform orchestrator ≠ platform runtime.

---

### 2026-03-29T00-47-40: Architectural Decisions + R4 Direction

**Author:** Aaron (via Copilot)  
**Type:** Platform Direction  
**Status:** Active

**Eight Sub-Decisions:**

1. **Squad Independence (Non-negotiable)** — NO dependency on squad. Must work independently. Must also coexist peacefully — no collisions.
2. **Simplicity Means Elegant Composability** — Not simplicity for simplicity's sake. R3 over-corrected. Sum greater than parts, emergent complexity from simple interactions.
3. **First Thought Wrong is Foundational** — Already in Aaron's existing gates. Devil's advocate is core, not optional.
4. **Rename Scribe (Squad Collision)** — Candidates: Archivist, Secretary, Registrar, Annalist. (Resolution: Chronicler, from Valanice's narrative principle)
5. **Explore SQLite-in-Git Viability** — For knowledge.db (vector search, mapping/linking).
6. **Linter vs. Compiler Distinction** — What sets them apart in our plan?
7. **CLI Namespace Clarification** — What is it, how would we implement it?
8. **Peopleware Foundation** — Seed next brainstorm round with organizational intelligence: DeMarco & Lister.

**Rationale:** Course correction on R3's over-simplification. Aaron wants elegant emergent complexity, not stripped-down minimalism.

**Impact:** Drives R4 focus on architecture convergence, Peopleware foundations, naming clarity.

---

### 2026-03-29T01-04-09: R4 Additional Inputs

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

**Four Sub-Decisions:**

1. **Git LFS for knowledge.db** — Explore as alternative to user-local-only. (Resolution: Git LFS rejected; user-local primary + optional JSON export)
2. **Squad Subsystem Leverage** — Do NOT depend on squad subsystems even when present. Too risky (what if squad goes away?). Painful to mirror, but independence is non-negotiable.
3. **Naming: Registrar Feels Off** — Archivist is closer. Recorder almost right. Still open. (Resolution: Chronicler, validated in R4)
4. **Artifact Validation Model** — Prompt + artifact → LLM → compare response against expected response. Scored on correctness vectors. Copilot SDK provides controlled LLM access.

**Rationale:** Architectural clarifications before full R4 fan-out.

**Impact:** Validated in R4 as 5-stage bundler with LLM-as-judge validation (5 correctness vectors).

---

### 2026-03-29T08-25-00: Brainstorm Round 4 Convergence — Composable Toolkit Architecture

**Author:** Graham Knight (Lead), Roger Wilco, Rosella Chen, Gabriel Knight, Valanice Chen  
**Type:** Architecture  
**Status:** Active

**Converged Decisions (R4 Outcomes):**

1. **3-Layer Composable Toolkit Architecture**
   - Layer 1: Primitive agents (Curator, Compiler)
   - Layer 2: Assemblers (Plugin Manager, Session Store adapters)
   - Layer 3: User-facing experiences (CLI, marketplace UI, hooks)
   - Foundation: SQLite-as-platform (knowledge.db as durable contract)

2. **2-Agent Core**
   - Curator: Always-running knowledge custodian, error processor, artifact validator
   - Compiler: Compiles BYO plugins (TypeScript, Python, Go) to executable agents/skills

3. **SQLite Convergence**
   - Event bus via SQLite INSERT → trigger architecture
   - 8-table core schema (sessions, preferences, skip_breadcrumbs, artifacts, errors, event_log, plugin_registry, knowledge_index)
   - User-local knowledge.db (primary); optional JSON export for interop
   - Git LFS rejected; Git-based sync deferred

4. **5-Stage Bundler Pipeline** (Plugin Dev)
   - Parse → Compile → Validate → Package → Distribute
   - .cpkg output format (ZIP + manifest + hash)
   - LLM-as-judge validation (Copilot SDK) with 5 correctness vectors

5. **Curator Full Specification** (Infrastructure)
   - 4 triggers: event bus, periodic check, session completion, user request
   - 5-stage RCA pipeline (Detect → Categorize → Root Cause → Prescribe → Enforce)
   - Peopleware guard-rails: authority bright line (humans decide, not auto-enforce)
   - RCA informs guardrails, not hard-coded rules

6. **Narrative-First UX** (Human Factors)
   - "Narrate work not worker" — organize UX around what's happening
   - Queryable state design — humans ask "Have we done X?" in natural language
   - Chronicler naming recommendation (replaces Scribe; avoids squad collision)
   - Error-as-narrative taxonomy (what happened → why → what to do next)

7. **Technical Clarifications**
   - **Linter vs. Compiler:** Linters report problems; Compiler produces executables
   - **CLI Namespace:** Scoped commands (e.g., `/skill discover`, `/agent list`) map to Compiler product types
   - **Squad Independence:** NO squad subsystem leverage; independence non-negotiable

**Rationale:** R4 synthesizes team input (recon, R3 decisions, Aaron's directives) into coherent, integrated architecture.

**Impact:** Architecture converged and validated. Ready for implementation sprint.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
