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

Corporate is NOT a profile switch — it's a FORKED DERIVATIVE of the core platform. The core platform IS the personal version. The corporate fork adds enforcement/restrictions on top.

**Implications:**
- Don't design profiles or detection
- Design ONE core platform (personal/open)
- Corporate fork inherits everything and adds constraints
- Two codebases (or one with a build flag), not one codebase with runtime profiles

**Sidecar Location:** Open to suggestions other than ~/.copilot (e.g., %LOCALAPPDATA%).

**Rationale:** Fundamental deployment model decision. Simpler core; corporate concerns are a separate build target.

---

### 2026-03-29T02-00-09: Platform Naming + Sierra Casting Notes

**Author:** Aaron (via Copilot)  
**Type:** Product Identity  
**Status:** Active

1. **Platform Naming** — Codename is "Stunning Adventure" (random GitHub suggestion that stuck). Need a real product name.
2. **Sidecar Location** — Subdirectory of ~/.copilot is acceptable. %LOCALAPPDATA% also compelling.
3. **Sierra Casting** — Consider Larry Laffer, Iceman, Sonny Bonds, and/or Two Guys from Andromeda for future hires.

**Rationale:** Product identity shapes the namespace, CLI, docs, and community perception.

---

### 2026-03-29T02-05-48: Vision Statement Seeds + HTML Knowledge Visualizer Backlog

**Author:** Aaron (via Copilot)  
**Type:** Product Vision  
**Status:** Active

**Vision Seeds:**
- Upfront and honest about human limitations — help people help themselves
- Agentic humanity — treating agents as individuals, natural interactions
- Self-reflection and growth — the platform (and human) get better over time
- Not about optimizing agents — about getting the BEST from humans

**Backlog: HTML Knowledge Visualizer**
- Generate pretty HTML read-outs: conversation history, session timelines, agent diaries, project knowledge
- A living dashboard/portal of everything Cairn knows, rendered beautifully
- Think: every possible perspective on the knowledgebase presented beautifully

**Rationale:** Killer feature for knowledge accessibility and user engagement.

---

### 2026-03-29T02-06-25: Natural Language Search Over Sidecar History

**Author:** Aaron (via Copilot)  
**Type:** Feature Requirement  
**Status:** Active

Natural language searchable query of user's sidecar history. "What have I learned about auth?" searches across all repos, all sessions, all knowledge — powered by the copilot-intelligence MCP server's embed_text + query_knowledge tools.

**Rationale:** The sidecar accumulates knowledge over time. Natural language search is the killer UX feature — it's the Archivist's query interface.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction

---
### 2026-03-31T06-38-00: Session-Start Hook (preToolUse Gate) - IMPLEMENTED
# Decision: Session-Start Hook (preToolUse Gate)

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Implemented  
**Implemented:** 2025-07-19

## Decision

Wire a `preToolUse` hook that runs crash recovery (`catchUpPreviousSession`) and curator pattern detection (`curate()`) on the first tool call of each session, gated by an active-session check.

## Architecture

```
preToolUse (curate.ps1 → sessionStart.ts)
  ├─ Active session exists? → EXIT (fast path, ~O(1))
  └─ No active session → catchUpPreviousSession() → curate() → EXIT

postToolUse (record.ps1 → postToolUse.ts)
  └─ startSession() → recordToolUse/recordError()
```

**Responsibility split:** preToolUse handles housekeeping (recovery, curation). postToolUse handles session lifecycle and event recording. They never conflict because preToolUse never creates sessions.

## Trade-offs

| Factor | Choice | Alternative | Why |
|--------|--------|-------------|-----|
| Testability | Extract `runSessionStart(repoKey)` as pure function | Test via stdin mocking | Direct function testing is faster, simpler, no process spawning |
| Performance | Active-session gate via indexed SELECT | Time-based debounce | SELECT is deterministic; debounce has edge cases on session boundaries |
| closeDb() ownership | `main()` calls closeDb, not core function | Core function manages lifecycle | Avoids killing in-memory DB during tests; matches singleton pattern |

---

## Phase 6 Decisions (2026-04-02)

### 2026-04-02: Phase 6 Roadmap Assessment — Option C (Plugin Packaging) Chosen

**Author:** Graham Knight (Lead / Architect), Aaron (Decision)  
**Date:** 2026-04-02  
**Type:** Roadmap  
**Status:** Accepted

Graham presented three Phase 6 options:
1. **Option A: Worktree-Aware Sessions (Issue #11)** — correctness bug fix, small-medium effort, low risk
2. **Option B: Compiler Agent MVP** — no consumers yet, speculative, high risk
3. **Option C: Distribution & Polish** — safe but ships known worktree collision bug

**Graham's Recommendation:** Option A. Correctness before distribution.

**Aaron's Choice:** Option C (Plugin Packaging).

**Rationale:** Plugin infrastructure enables distribution immediately. Worktree support (Option A) deferred to Phase 7 after installation commands are built and tested.

**Outcome:** Rosella and Roger executed plugin packaging blueprint concurrently. Plugin infrastructure now in place.

**Full Reports:** *(merged inline above)*

---

### 2026-04-02: Installation Architecture — npm link + cairn install Strategy

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-02  
**Type:** Architecture  
**Status:** Active

Four installation surfaces identified:
1. **MCP Server Registration** — `~/.copilot/mcp-config.json` (❌ not registered)
2. **Hook Installation** — `~/.copilot/hooks/cairn/` (⚠️ manually installed, hardcoded paths)
3. **Binary/Module Availability** — npm global bin directory (❌ not linked)
4. **Database Initialization** — `~/.cairn/knowledge.db` (✅ working)

**Three Implementation Options:**
- **Option A: `npm link` + `cairn install`** — Dev-friendly symlink + custom installer ✅ RECOMMENDED
- **Option B: `npm install -g`** — Independent but requires re-run per code change
- **Option C: Plugin Install via Copilot CLI** — Correct long-term but premature for "first consumer"

**Recommendation:** Option A. Minimal path to "it works on my machine" while building toward plugin distribution.

**Missing in Codebase (P0/P1 priority):**
- No MCP server registration mechanism
- Hook path resolution fragile (PS1 two-tier fallback)
- No `cairn install` command
- No plugin.json manifest
- Hook scripts not in npm package
- hooks.json not in npm package

**Implementation Sequence:**
1. **Right now:** `npm link` + manual MCP config → Cairn works
2. **Next PR:** Move hook scripts into repo, build `cairn install`, fix path resolution (Rosella + Roger executing)
3. **After:** `plugin.json`, marketplace registration (in progress)

**Full Report:** *(merged inline above)*

---

### 2026-04-02: Plugin Packaging Blueprint — Comprehensive Distribution Architecture

**Author:** Rosella Chen (Plugin Dev)  
**Date:** 2026-04-02  
**Type:** Architecture  
**Status:** In Progress

**Core Design:**
- `plugin.json` manifest (Claude Code spec format)
- `marketplace.json` for marketplace integration
- `.github/hooks/cairn/hooks.json` for hook declaration
- PowerShell wrapper scripts (`curate.ps1`, `record.ps1`)
- Installation flow: `npm install -g @akubly/cairn` → `cairn install`
- Custom install script (`src/install.ts`) handles MCP registration + hook installation

**Gap Analysis:**
- Plugin format lacks native MCP server registration — custom install script required
- Plugin format lacks native hook installation — custom install script required
- Cross-platform: PowerShell ✅ Windows-first, bash 🔄 deferred to Phase 7
- Version migration: future concern

**Priority Checklist:**
- **P0:** install.ts, hooks.json, PS1 wrappers (in progress)
- **P1:** plugin.json ✅, marketplace.json ✅, CLI modifications, mcp-config.json
- **P2:** uninstall.ts, documentation
- **P3:** bash wrappers

**What "Installed" Looks Like After `cairn install`:**
```
~/.copilot/
├── hooks/cairn/
│   ├── hooks.json        ← Copilot CLI reads this
│   ├── curate.ps1        ← preToolUse → Node.js
│   └── record.ps1        ← postToolUse → Node.js
├── mcp-config.json       ← Contains "cairn" MCP server entry

~/.cairn/
├── hook/
│   ├── sessionStart.mjs   ← Compiled hook entry point
│   └── postToolUse.mjs    ← Compiled hook entry point
├── knowledge.db          ← Already exists
└── version.txt           ← Installed version marker
```

**Full Report:** *(merged inline above)*

---

### 2026-04-02: hooks.json Ownership — Plugin Manifest, Not Wrapper Script

**Author:** Rosella Chen (Plugin Dev)  
**Date:** 2026-04-02  
**Type:** Coordination  
**Status:** Active

`hooks.json` is a **plugin manifest file** (Rosella's domain), not a wrapper script (Roger's domain).

**Responsibility Split:**
- **Rosella:** hooks.json declares which hook events Cairn handles and what commands to run (plugin context)
- **Roger:** PowerShell wrappers are user-level installation at `~/.copilot/hooks/`

**Impact:**
- Roger: Be aware `.github/plugin/hooks.json` exists. Your wrapper scripts handle the `~/.copilot/hooks/` user-level install path.
- Both paths should ultimately invoke the same Node.js entry points.

**Full Report:** *(merged inline above)*

---

### 2026-04-02: Hook Wrapper Scripts — Two-Tier Path Resolution Design

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-04-02  
**Type:** Implementation  
**Status:** In Progress

**Files Created:**
- `.github/hooks/cairn/hooks.json` — Hook type registration
- `.github/hooks/cairn/curate.ps1` — preToolUse wrapper → sessionStart.js
- `.github/hooks/cairn/record.ps1` — postToolUse wrapper → postToolUse.js

**Design Pattern: Two-Tier Path Resolution**

1. **Primary:** `~/.cairn/hook/{sessionStart|postToolUse}.mjs` (after user-level install)
2. **Fallback:** Relative path from repo `dist/hooks/{sessionStart|postToolUse}.js` (dev mode)

**Behavior:**
- Fail-open: silently exit if paths don't resolve
- Read stdin, pipe to node process
- Suppress stderr
- Idempotent: safe to run multiple times
- Portable: uses $PSScriptRoot relative paths

**Example Resolution (curate.ps1):**
```powershell
$hookScript = Join-Path $env:USERPROFILE '.cairn' 'hook' 'sessionStart.mjs'
if (-not (Test-Path $hookScript)) {
    $hookScript = Join-Path $PSScriptRoot '..\..\..\..' 'dist' 'hooks' 'sessionStart.js'
    if (-not (Test-Path $hookScript)) { exit 0 }
}
$raw | node $hookScript 2>$null
```

**Status:**
- Portable across repo layouts ✅
- Ready for `cairn install` to copy to `~/.copilot/hooks/cairn/` ✅
- Bash equivalents 🔄 deferred

**Next Steps:**
- `src/install.ts` will copy these scripts to user-level hooks directory
- `src/cli.ts` will route `cairn install` command to installer
| Crash recovery scope | Per-repo only | Global (all repos) | Cross-repo recovery would slow the hook and risk false positives |

## Files

- `src/hooks/sessionStart.ts` — Node.js entry point
- `~/.copilot/hooks/cairn-archivist/curate.ps1` — PowerShell wrapper
- `src/__tests__/sessionStart.test.ts` — 8 tests covering fast/slow path, isolation, idempotency

## Verification

- 116 tests pass (108 baseline + 8 new)
- ESLint clean
- TypeScript compiles without errors


---

### 2026-04-02T04-58-00: Phase 5 — MCP Server (Cairn Conversational Intelligence)

**Author:** Graham Knight (Lead)  
**Type:** Architecture / Roadmap  
**Status:** Ready for Implementation  
**Date:** 2026-04-02  
**Supersedes:** graham-phase5-recommendation.md (CLI-first approach withdrawn)

**Decision:** Phase 5 is the MCP Server. Build Cairn as an MCP server that exposes knowledge directly into Copilot conversation. Skip the CLI.

**Rationale:**
- Primary consumer is an agent (where Aaron works), not a human at terminal
- One presentation layer (MCP) vs. two (CLI + MCP)
- Query APIs already validated through ad-hoc scripts
- Design surface not materially different: 6 operations with schema definitions
- MCP eliminates CLI as "dead code on arrival" after MCP ships

**6 MCP Tools (verb_noun naming):**
- get_status: Current session state and curator health
- list_insights: Active insights with prescriptions
- get_session: Event counts and session summary
- search_events: Filtered event list by pattern
- run_curate: Manual curator run
- check_event: Boolean query — has event occurred?

**Naming Convention:** Unprefixed verb_noun format. MCP host adds server prefix (cairn-). Eliminates stutter.

**Team Composition:**
- Roger (Platform Dev): MCP SDK integration
- Valanice (UX): Tool descriptions and verb taxonomy
- Graham (Lead): Schema review and registration design

**Package Changes:**
- New dependencies: @modelcontextprotocol/sdk, zod
- New bin entry: cairn-mcp → dist/mcp/server.js
- MCP registration: .copilot/mcp-config.json

**Status:** Architecture finalized. Ready for implementation.

---

### 2026-04-02T04-58-32: User Directive — MCP Tool Naming Convention

**Author:** Aaron (via Copilot)  
**Type:** Design / Naming  
**Status:** Active

Use verb_noun naming for MCP tool names (e.g., get_status, list_insights), not noun_verb. Tool names should be short and unprefixed — the MCP host adds the server name prefix automatically.

**Rationale:**
- Natural language alignment: "get the status" → get_status
- Better LLM tool selection: agent sees verb matching user phrasing
- Eliminates naming stutter: cairn-get_status vs cairn-status_get
- Aligns with CLI conventions (git status, npm list)

**Verb Taxonomy:**
- get: Retrieve single composite object
- list: Return collection with optional filters
- search: Query with multiple filter parameters
- run: Execute side-effecting action
- check: Boolean/existence query

**Impact:** Governs Phase 5 MCP tool naming. Improves agent behavior predictability.

**Status:** Finalized. Incorporated into Phase 5 spec.

---

### 2026-04-02T04-58-00: Phase 5 — MCP Server (Cairn Conversational Intelligence)

**Author:** Graham Knight (Lead)  
**Type:** Architecture / Roadmap  
**Status:** Ready for Implementation  
**Date:** 2026-04-02  
**Supersedes:** graham-phase5-recommendation.md (CLI-first approach withdrawn)

**Decision:** Phase 5 is the MCP Server. Build Cairn as an MCP server that exposes knowledge directly into Copilot conversation. Skip the CLI.

**Rationale:**
- Primary consumer is an agent (where Aaron works), not a human at terminal
- One presentation layer (MCP) vs. two (CLI + MCP)
- Query APIs already validated through ad-hoc scripts
- Design surface not materially different: 6 operations with schema definitions
- MCP eliminates CLI as "dead code on arrival" after MCP ships

**6 MCP Tools (verb_noun naming):**
- get_status: Current session state and curator health
- list_insights: Active insights with prescriptions
- get_session: Event counts and session summary
- search_events: Filtered event list by pattern
- run_curate: Manual curator run
- check_event: Boolean query — has event occurred?

**Naming Convention:** Unprefixed verb_noun format. MCP host adds server prefix (cairn-). Eliminates stutter.

**Team Composition:**
- Roger (Platform Dev): MCP SDK integration
- Valanice (UX): Tool descriptions and verb taxonomy
- Graham (Lead): Schema review and registration design

**Package Changes:**
- New dependencies: @modelcontextprotocol/sdk, zod
- New bin entry: cairn-mcp → dist/mcp/server.js
- MCP registration: .copilot/mcp-config.json

**Status:** Architecture finalized. Ready for implementation.

---

### 2026-04-02T04-58-32: User Directive — MCP Tool Naming Convention

**Author:** Aaron (via Copilot)  
**Type:** Design / Naming  
**Status:** Active

Use verb_noun naming for MCP tool names (e.g., get_status, list_insights), not noun_verb. Tool names should be short and unprefixed — the MCP host adds the server name prefix automatically.

**Rationale:**
- Natural language alignment: "get the status" → get_status
- Better LLM tool selection: agent sees verb matching user phrasing
- Eliminates naming stutter: cairn-get_status vs cairn-status_get
- Aligns with CLI conventions (git status, npm list)

**Verb Taxonomy:**
- get: Retrieve single composite object
- list: Return collection with optional filters
- search: Query with multiple filter parameters
- run: Execute side-effecting action
- check: Boolean/existence query

**Impact:** Governs Phase 5 MCP tool naming. Improves agent behavior predictability.

**Status:** Finalized. Incorporated into Phase 5 spec.

---

### 2026-04-02T05-05-00: MCP Server: Tool Logic Tested via Backing APIs

**Author:** Roger (Platform Dev)  
**Type:** Implementation / Testing  
**Status:** Active

**Decision:** MCP tool tests validate the backing query functions directly (getSessionSummary, getCuratorStatus, findEvents, etc.) rather than testing through the MCP stdio transport layer.

**Rationale:**
- The MCP SDK owns transport correctness (JSON-RPC, schema validation). Testing through stdio would be integration-testing the SDK, not our logic.
- Direct function tests are fast (~25ms for all 19), deterministic, and use in-memory SQLite.
- If the SDK breaks transport, their tests catch it. If we break query logic, our tests catch it.
- Future: if we add tool-level middleware (auth, rate limiting), those get their own test layer.

**Impact:** Sets testing convention for all future MCP tools — test the logic, not the plumbing.

**Status:** Implemented. All 19 tests pass; 134 total tests green.

---

### 2026-04-02T05-13-00: Code Quality — MCP Server Import Guard Pattern

**Author:** Graham Knight (Lead)  
**Type:** Code Quality / Convention Enforcement  
**Status:** Resolved ✓  
**Date:** 2026-04-02

**Decision:** `src/mcp/server.ts` must wrap its `main().catch()` call in the same `isScript` guard pattern established in PR #9 for all hook entry points.

**Pattern Applied:**

```typescript
import url from 'node:url';
import path from 'node:path';

const isScript =
  process.argv[1] &&
  import.meta.url === url.pathToFileURL(path.resolve(process.argv[1])).href;

if (isScript) {
  main().catch((err: unknown) => {
    process.stderr.write(`Cairn MCP server failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
```

**Rationale:**
1. Convention compliance — PR #9 established this guard for all entry points
2. Import safety — Without guard, importing server.ts from tests triggers main() → process.exit(1) → kills test runner
3. Future-proofing — As MCP tools expand, may need to import tool defs for docs generation or integration testing

**Resolution:** Roger applied fix. Round 1 blocker. Verified in Round 2 re-review. No regression.

**Status:** Complete. Merged to Phase 5 codebase.

---

### 2026-04-04T06-24-00: CLI Extensions Investigation — Round 3 Correction

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-04  
**Requested by:** Aaron  
**Type:** Research / Backlog Investigation  
**Status:** Complete — Decision Point for Aaron

---

## ⚠️ Correction Notice

**Rounds 1 & 2 incorrectly concluded that CLI extensions don't exist.** They do.

The extension system is a fully implemented but undocumented feature of the
Copilot CLI, discovered from `@github/copilot-sdk` source and validated by
community reverse-engineering ([htek.dev guide][1]). My initial search missed it
because:

1. No official GitHub documentation (not on docs.github.com)
2. No `.github/extensions/` directory exists in any repo I checked
3. CLI `/help` doesn't mention extensions
4. SDK type definitions are terse

**Lesson learned:** "No documentation" ≠ "doesn't exist." When investigating
undocumented features, inspect SDK source code, type definitions, and community
guides — not just official docs.

---

## Executive Summary

**CLI extensions are real, production-ready, and architecturally compelling for
Cairn.** They run as persistent Node.js child processes, communicate via
JSON-RPC over stdio, and can register custom tools AND lifecycle hooks in a
single unified process. This directly addresses three pain points in Cairn's
current architecture:

1. **400ms MCP startup overhead** — Extensions run persistent, keep DB open
2. **PS1 hook wrapper fragility** — Unified process eliminates separate hook pipeline  
3. **Hooks-vs-tools split** — Single process handles both

**However, extensions have a critical distribution limitation:** file-copy only,
no plugin/marketplace support. MCP remains the universal integration standard.

### Recommendation

**Build an extension as a development spike. Keep MCP as the distribution path.**

Three-phase approach:

| Phase | Action | Effort |
|-------|--------|--------|
| **Spike** | Build `.github/extensions/cairn/extension.mjs`. Validate persistent DB + unified hooks + tool registration. | 1-2 sessions |
| **Validate** | Run extension alongside MCP for a week. Compare reliability, performance, DX. | 1 week |
| **Decide** | Based on results: extension as primary CLI surface (keep MCP for universal), or extension not worth dual maintenance. | Decision point |

**Why spike first, not commit:**

1. Hook overwrite bug (#2076) could be showstopper if Aaron uses other extensions
2. Native module resolution via `createRequire` from `.github/extensions/` is untested
3. Undocumented feature — need to verify behavior matches community guide on CLI 1.0.18

---

## What CLI Extensions Actually Are

### Architecture

Extensions are separate Node.js child processes forked by the Copilot CLI,
communicating over JSON-RPC via stdio:

```
┌──────────────────┐   JSON-RPC / stdio   ┌───────────────────┐
│  Copilot CLI      │ ◄──────────────────► │  Extension Process │
│  (parent)         │                      │  (forked child)    │
│                   │                      │                    │
│  • Discovers exts │                      │  • Registers tools │
│  • Forks children │                      │  • Registers hooks │
│  • Routes calls   │                      │  • Persists state  │
└──────────────────┘                      └───────────────────┘
```

### Lifecycle

1. **Discovery** — CLI scans `.github/extensions/` (project) and
   `~/.copilot/extensions/` (user) for subdirectories containing `extension.mjs`
2. **Launch** — Each extension forked as child process. `@github/copilot-sdk`
   auto-resolved by CLI (no npm install needed for SDK)
3. **Connection** — Extension calls `joinSession()`, establishing JSON-RPC link
4. **Registration** — Tools and hooks declared in session config registered immediately
5. **Lifecycle** — Reloaded on `/clear`. Stopped on CLI exit (SIGTERM, SIGKILL after 5s)

### Key Capabilities

| Capability | Description |
|------------|-------------|
| **Custom tools** | Full JSON Schema parameters + async handler functions |
| **6 lifecycle hooks** | onSessionStart, onUserPromptSubmitted, onPreToolUse, onPostToolUse, onErrorOccurred, onSessionEnd |
| **Persistent state** | In-memory state lives across tool calls within session |
| **Hot reload** | `extensions_reload` makes changes available mid-session |
| **Event subscription** | `session.on()` for 10+ event types |
| **Permission control** | preToolUse can allow, deny, or modify tool arguments |
| **Context injection** | Hooks return `additionalContext` injected into conversation |
| **Programmatic messaging** | `session.send()` and `session.sendAndWait()` |
| **Error recovery** | onErrorOccurred can retry, skip, or abort |

### Verified on This Machine

- **CLI version:** 1.0.18
- **`@github/copilot-sdk`:** Found in squad-cli's node_modules
  - `extension.d.ts` / `extension.js` — confirmed
  - `CopilotClient`, `defineTool`, `approveAll` — confirmed
  - `Tool`, `ToolHandler`, `ToolInvocation` types — confirmed
- **`~/.copilot/extensions/`:** Does not exist yet (no extensions installed)

---

## Trade-Off Analysis: Extension vs MCP for Cairn

| Dimension | MCP Server (current) | CLI Extension |
|-----------|---------------------|---------------|
| **Process model** | New process per tool call | Persistent child process for session |
| **Tool registration** | MCP protocol (JSON-RPC) | SDK `tools` array at session join |
| **Startup overhead** | ~400ms per invocation | Once at session start, then zero |
| **State management** | Stateless (DB reopened each call) | Persistent in-memory (DB open once) |
| **Hook integration** | Separate system (hooks.json + PS1) | Unified in same process |
| **Distribution** | npm + mcp-config.json + plugin | File-copy only (.mjs to directory) |
| **Cross-platform** | Any MCP host (VS Code, coding agent) | **CLI-only** |
| **Dependencies** | npm handles full dep chain | SDK auto-resolved; others need npm |
| **Hot reload** | `mcp_reload` or restart | `extensions_reload` mid-session |
| **Documentation** | Official GitHub docs | **Undocumented** (community only) |
| **Stability** | Stable, well-tested | Undocumented; gotchas exist |
| **Plugin/marketplace** | Yes | **No** |

### What Cairn Gains from Extension

1. **Persistent DB connection.** Currently every MCP tool call opens knowledge.db,
   runs a query, closes. An extension opens it once and keeps it open. For a
   session with 200+ tool calls, this eliminates ~80 seconds of startup overhead.

2. **Unified hooks + tools.** Currently Cairn has two separate surfaces:
   - Hooks: `hooks.json` → PS1 wrappers → node
   - Tools: `mcp/server.ts` via MCP protocol
   
   An extension collapses to one process.

3. **No PS1 wrappers.** The entire `record.ps1` → `curate.ps1` pipeline
   disappears. This is our #1 cross-platform fragility point.

4. **Event subscription.** `session.on('tool.execution_complete', ...)` gives
   richer observability than postToolUse hooks.

### What Cairn Loses from Extension-Only

1. **VS Code / coding agent support.** Extensions are CLI-only. MCP works everywhere.

2. **Plugin distribution.** No `copilot plugin install`. No marketplace
   discoverability. File-copy only.

3. **Native module distribution.** `better-sqlite3` doesn't auto-resolve. For
   project-level extensions, repo's `node_modules` available. For user-level
   distribution, npm install still needed.

4. **Stability guarantees.** Undocumented = no deprecation policy. Could change
   without notice.

### Known Gotchas

| Gotcha | Severity | Impact on Cairn |
|--------|----------|----------------|
| **.mjs only** — no TypeScript | Low | Must compile to .mjs. Build already exists. |
| **State resets on `/clear`** | Medium | DB + in-memory state lost. Must re-open on reload. |
| **Hook overwrite bug (#2076)** | High | If other extensions have hooks, only last-loaded fires. Cairn's could be silently dropped. |
| **Tool name collisions** | Medium | Silent failure if another extension uses same name. Use prefix. |
| **stdout reserved for JSON-RPC** | Low | Must use `session.log()`, not `console.log()`. |
| **Undocumented** | Medium | No official support. API could change. |

---

## Decision Options for Aaron

### Option A: Spike the Extension (Recommended)
1-2 sessions of effort. If successful, gain persistent DB, unified hooks+tools,
eliminate PS1 wrappers. Risk: undocumented feature, hook overwrite bug, native
module resolution on all platforms.

### Option B: Skip Extensions
Current MCP + hooks architecture works well. 400ms startup tolerable. PS1
wrappers are fragile but functional. Focus effort on npm publish and worktree
support instead.

### Option C: Extension-Only (Not Recommended)
Drop MCP entirely. Loses VS Code support, coding agent support, plugin
distribution. Too much portability sacrifice.

---

## References

- [htek.dev: Copilot CLI Extensions Complete Guide](https://htek.dev/articles/github-copilot-cli-extensions-complete-guide/)
- [Copilot CLI Plugin Reference](https://docs.github.com/en/copilot/reference/cli-plugin-reference)
- [Creating Plugins](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating)
- [About CLI Plugins](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-cli-plugins)
- Internal: Phase 5 MCP Server (src/mcp/server.ts)
- Internal: Phase 6 Plugin Infrastructure (`.github/plugin/*`)
- CLI version verified: 1.0.18
- `@github/copilot-sdk` verified in squad-cli's node_modules

