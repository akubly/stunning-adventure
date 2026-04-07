# Squad Decisions Archive

**Status:** Archived decisions from pre-Phase 7 period (2026-03-28 through 2026-04-06)

This archive contains all decisions made during the Recon and Brainstorm phases (Rounds 1–5) and early implementation planning. These decisions remain active and should be referenced, but are archived to reduce the size of the main decisions.md file during Phase 7+ implementation.

---

## Active Decisions (Archived)

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

### 2026-03-29T01-31-29: Open Items Resolved

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

**Curator Event Processing:**
- Curator tracks unprocessed events via event_log table status flags
- INSERT cost is minimal in SQLite (indexed by session_id)
- Curator runs continuously in sidecar; no session-time restrictions needed
- Event batching via trigger-based cascades reduces individual INSERT overhead

**Decision Alternatives Requirement:**
- Require explicit listing of considered alternatives in all architecture decisions
- Document why alternatives were ruled out (not "no alternatives exist")
- Closes tension between comprehensive consideration and decision velocity

**Rationale:** Ensures decision quality and provides future context for design evolution.

---

### 2026-03-29T01-35-11: Round 5 Seeds — Dual Environment + Sidecar Storage

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

**Three New Design Requirements:**

1. **DUAL ENVIRONMENT:** Platform must work equally in corporate/controlled environments (Windows OS monorepo, limited MCP/plugins) AND personal/open environments (many 3rd-party plugins). Different constraint sets, equal effectiveness.

2. **SIDECAR STORAGE:** At work, don't commit platform artifacts to work repo. Design external/sidecar storage location that keeps platform state separate from repo state. Enable multi-repo, multi-environment workflows.

3. **COPILOT SDK EXPLORATION:** Beyond artifact validation, what else is possible? Full capability audit needed.

**Rationale:** Real-world deployment constraints from Aaron's professional work. Platform must be environment-aware and location-aware.

**Impact:** Drives R5 brainstorm focus (dual environments, sidecar-as-platform, SDK deep dive).

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

### 2026-03-30T09-00-00: Brainstorm Round 5 Convergence — Sidecar Architecture + Dual Environments

**Author:** Graham Knight (Lead), Roger Wilco, Rosella Chen, Gabriel Knight, Valanice Chen  
**Type:** Architecture  
**Status:** Active

**Converged Decisions (R5 Outcomes):**

1. **Sidecar-as-Platform Architecture**
   - Stateless CLI + Stateful Sidecar + Foundation Layer
   - Environment context flows through sidecar lifecycle
   - JSON-RPC contract between CLI and sidecar
   - Foundation layer handles environment abstraction

2. **Dual Environment Profiles**
   - Corporate: Org-scoped, audit-logged, read-only repos
   - Local: User-scoped, no restrictions
   - Sandbox: Ephemeral test data, no persistence
   - Sensitivity tagging (4-level cascade) propagates through all operations

3. **Sidecar Data Layer (knowledge.db)**
   - User-local placement: `%LOCALAPPDATA%\Copilot\sidecar\knowledge.db`
   - 8-table core schema with trigger-based event bus
   - Slugified repo keys for safe serialization
   - WAL mode for concurrent sidecar access
   - Double-locked export with integrity guarantees
   - No Git LFS; no cloud sync in R5

4. **Copilot SDK as MCP Server**
   - 8-tool intelligence server (semantic search, decision support, artifact validation, RCA, environment inspection, etc.)
   - BYOK (Bring Your Own Key) escape hatch for corporate environments
   - Private LLM endpoints in corporate; fail-safe fallback
   - Capability registry for runtime tool discovery

5. **Corporate Compliance Patterns**
   - Read-Only Repo Adapter: Clone without write access
   - Pre-Commit as Portable Enforcement: Hooks travel with sidecar, not embedded in repos
   - Split Curator Mode: Corporate (read-only) vs. Local (full validation)
   - Audit logging built into sidecar event bus

6. **Narrative-First UX**
   - "Commute not switch" metaphor for environment transitions
   - Environment location explicit in chat context and status bar
   - Sensitivity explained in natural language ("corporate-only" vs. codes)
   - Privacy decisions framed as choices, not constraints

7. **Critical Decisions Validated**
   - Sidecar independence from squad (non-negotiable)
   - Environment as first-class architecture concern
   - User-local data only (no system-wide installation)
   - MCP as integration standard (non-negotiable)
   - BYOK as primary corporate pattern
   - WAL-mode concurrency for sidecar required
   - Sensitivity tagging mandatory, not optional

**Alternatives Considered:**
- **Cloud sync instead of user-local:** Rejected — corporate compliance, offline capability, privacy
- **System-wide installation:** Rejected — corporate policy conflicts, isolation concerns
- **REST API instead of MCP:** Rejected — MCP is vendor-neutral standard, better portability
- **Auto-enforcement of constraints:** Rejected — humans make policy decisions, RCA informs guardrails

**Rationale:** R5 synthesizes R4 architecture with Aaron's dual-environment requirements and real-world deployment constraints.

**Impact:** Sidecar becomes first-class platform component. Ready for R6 implementation sprint. No blocking issues.

---

### 2026-03-29T01-53-50: Final Brainstorm Decisions Before Planning

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

1. **Auto-Roam Personal Profile** — Option to sync personal sidecar via akubly/.copilot repo. Personal profile is portable.
2. **Profile Default** — Personal is the DEFAULT. Corporate is a deliberate FORK at the repo level — the repo declares "I'm corporate" rather than the user declaring "I'm at work."
3. **BYOK Strategy** — Design for it, but not a key requirement now. Standard Copilot SDK models are the primary path.
4. **All 10 SDK Use Cases Approved** — Embeddings, classification, summarization, conflict resolution, panel calibration, NL queries, devil's advocate, teach-back, auto-test-gen, predictive error prevention.
5. **Archivist Naming** — Confirmed as the logging agent name.

**Rationale:** Closes all R5 follow-up questions. Architecture is complete and ready for planning.

---

### 2026-03-29T01-56-52: Corporate Deployment Model Clarification

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

**Definition:** "Corporate" = repo declares identity in `repo.json` (e.g., `{ "environment": "corporate" }`).

**Default Behavior (personal mode):**
- Personal sidecar location: `%LOCALAPPDATA%\Copilot\sidecar\`
- All write access, full plugin support
- Personal profile syncs across machines via `akubly/.copilot`

**Corporate Mode (opt-in repo declaration):**
- Read-only repo access (clone without write)
- Audit logging in sidecar (not in repo commit log)
- Pre-Commit as portable enforcement (hooks in sidecar)
- Sensitivity tagging cascade limits data exposure
- BYOK for private LLM endpoints (optional fallback to standard models)

**Rationale:** Real deployment constraint from Aaron's work. Personal is default; corporate is deliberate fork.

**Impact:** Deployment strategy validated. Ready for Phase 6 implementation.

---

### 2026-04-02T04-58-00Z: Session Start Hook Fix (Phase 5)

**Author:** Gabriel Knight (Infrastructure)  
**Type:** Technical  
**Phase:** 5  
**Status:** Complete

Fixed unreliable sessionEnd hook by replacing with preToolUse hook that calls `curate()` via `session.js` integration. Hook now fires reliably at start of each tool invocation.

**Decision:** Use preToolUse + shared session.js state (not sessionEnd hook).

**Impact:** Curator now runs reliably every session start, enabling real-time pattern detection and insight generation.

---

### 2026-04-02T05-05: MCP Server Implementation (Phase 5)

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Phase:** 5  
**Status:** Complete

Implemented MCP server with 6 core tools: `run_curate`, `list_insights`, `get_insight`, `list_events`, `skip_event`, `get_status`. TypeScript, stdio transport, proper error handling.

**Key Decisions:**
1. **run_curate output structure:** `{ curate: {...}, prescriptions: null | {...} }` after 7C/7F integration
2. **No backward compatibility wrapper** — Pre-1.0 acceptable

**Impact:** MCP tools enable Copilot CLI integration; async trigger for curator.

---

### 2026-04-02T23-51-00Z: Plugin Infrastructure (Phase 6)

**Author:** Rosella Chen (Plugin Dev)  
**Type:** Technical  
**Phase:** 6  
**Status:** Complete

Implemented plugin infrastructure: `.github/plugin/plugin.json`, `mcp-config.json` with stdlib patterns, `package.json` with proper bin entries.

**Key Decisions:**
1. **Plugin format:** Claude Code spec (plugin.json)
2. **MCP config:** stdio transport, default port 3000
3. **Distribution:** npm publish with GitHub registry

**Impact:** Plugin ready for npm publish and ecosystem distribution.

---

## Archive Summary

This file contains all decisions from the Recon and Brainstorm phases (2026-03-28 through early 2026-04-06), plus foundational Phase 5–6 architectural decisions.

All decisions remain **Active** and should be referenced during Phase 8+ work.

**For Phase 7+ decisions, see:** `.squad/decisions.md` (main file, Phase 7A–7F decisions)
