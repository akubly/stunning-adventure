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

### 2026-04-24: Forge Phase 2 Architecture — Live Runtime Verification

**Author:** Graham Knight (Lead)
**Type:** Architecture
**Status:** Implemented

Defined 5-module structure under `packages/forge/src/` and Phase 2 vs Phase 3 boundary. Phase 2 covers anything testable without running Copilot CLI; Phase 3 requires live SDK integration.

**5-Module Structure:**
- `bridge/` — SDK events → CairnBridgeEvent adapter
- `hooks/` — Hook composition, multi-observer pattern
- `decisions/` — Decision gate mechanisms
- `dbom/` — Provenance artifact generation
- `session/` — Session identity validation

**Key Rule:** Phase 2 vs Phase 3 boundary is "if it needs `CopilotClient()`, it's Phase 3."

**Contracts:**
- Forge imports ONLY from `@akubly/types`, never from `@akubly/cairn`
- Data flows at runtime via `CairnBridgeEvent` wire format
- No circular dependencies between packages

**Test Strategy:** ~98 fixture-based tests using simulated `SessionEvent` objects (no SDK instantiation, no DB dependency).

**Type Migration Rule:** Delete spike-local type redefinitions; use `@akubly/types` imports exclusively.

**Full Report:** `.squad/decisions/inbox/graham-forge-phase2-architecture.md`

---

### 2026-04-29: HookComposer Uses Live Observer Set

**Author:** Alexander (SDK/Runtime Dev)
**Type:** Architecture
**Status:** Implemented

HookComposer class holds a live `Set<HookObserver>`. The `compose()` method returns hooks that reference the live set, so add/remove after composition takes effect on the next hook invocation without re-registering with the SDK.

**Tradeoffs:**
- **Pro:** Dynamic observer management without SDK re-registration — critical for decision gates added/removed mid-session.
- **Pro:** Each `add()` returns a dispose function — clean RAII-style cleanup.
- **Con:** Slightly more complex than a pure function; the composed hooks capture `this`.
- **Accepted:** Complexity justified because Cairn's architecture requires dynamic gate registration.

**Affects:**
- `packages/forge/src/hooks/index.ts`
- Any future code that registers decision gates or telemetry observers mid-session

---

### 2026-04-28: Forge Test Infrastructure Pattern

**Author:** Roger Wilco (Platform Dev)
**Type:** Infrastructure
**Status:** Implemented

Forge test infrastructure uses SDK mocks rather than live CLI integration for all unit tests.

**Three Test Helper Modules:**
1. **mock-sdk** — `createMockSession()` / `createMockClient()` with `vi.fn()` stubs and `_emit()` for event dispatch testing.
2. **event-factory** — Type-safe `SessionEvent` builders for all 6 core event types.
3. **type-assertions** — Runtime shape validation for `CairnBridgeEvent` conformance.

**Rationale:**
- SDK requires running Copilot CLI process for real sessions — unit tests must be offline.
- Event factory ensures tests use correctly-typed SDK events without fragile manual construction.
- Type assertion helpers serve double duty: test validation now, production runtime guards later.

**Rule:** All Forge tests must import from `./helpers/index.js`. No test may instantiate `CopilotClient` or `CopilotSession` directly.

---

### 2026-04-28: Hook Composer Must Isolate Observer Errors

**Author:** Laura (Tester)
**Type:** Implementation Requirement
**Status:** Implemented

The production `composeHooks` implementation MUST wrap each observer call in try/catch, logging errors but continuing to the next observer.

**Context:**
Spike's `composeHooks` propagates errors — if one observer's `onPreToolUse` throws, subsequent observers never run. This is dangerous in production: a buggy telemetry observer would kill the decision gate observer, silently removing safety checks.

**Implementation:**
Each observer call wrapped in try/catch. Errors logged but don't prevent subsequent observers from running.

**Test Coverage:**
- `"one observer throwing does not kill others"` — verifies isolated behavior (passing)
- `"spike composeHooks propagates errors"` — documents the spike's known gap (baseline)

**Impact:**
Telemetry observers are now safe in production. Error in one observer cannot cascade to disable decision gates or other critical observers.

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

### 2026-04-28: Alexander — SDK Interface Types for Runtime Module

**Author:** Alexander (SDK/Runtime Dev)  
**Type:** Architecture  
**Status:** Implemented

ForgeClient and ForgeSession depend on thin interface types (`SDKClient`, `SDKSession`) rather than importing CopilotClient/CopilotSession classes directly.

**Rationale:**
1. **Testability** — Mock objects from the test helpers satisfy the interface without needing the real SDK classes (which require a running Copilot CLI process).
2. **SDK churn isolation** — If the SDK adds/removes methods, only the interface definitions need updating, not every consumer.
3. **Dependency inversion** — The runtime module is constructor-injected with an `SDKClient`, making it composable and mockable at every level.

**Tradeoffs:**
- **Pro:** Tests run offline, no SDK instantiation needed.
- **Pro:** SDK method additions don't break existing code until we choose to adopt them.
- **Con:** Must manually keep interfaces in sync with the SDK surface we actually use.
- **Accepted:** The interface surface is small (~5 methods on SDKClient, ~5 on SDKSession), so maintenance cost is negligible.

**Affects:**
- `packages/forge/src/runtime/client.ts` — `SDKClient` interface
- `packages/forge/src/runtime/session.ts` — `SDKSession` interface
- All test code that uses `createMockClient()` / `createMockSession()`

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

---

## Phase 7 Decisions (2026-04-06) — Prescriber Planning Session

### 2026-04-06: Prescriber Architecture — Design & Phased Implementation Plan

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-06  
**Type:** Architecture  
**Status:** Proposal — awaiting team review

**Decision:** The Prescriber closes the feedback loop from pattern detection (Curator) through actionable recommendations (Prescriber) to user-approved changes. It is Cairn's third core agent.

**Architecture Positioning:**
```
Events → Insights → Prescriptions → Human Approval → Applied Changes
  ↑                                                        │
  └────────── disposition events ──────────────────────────┘
```

**Core Design Decisions:**

1. **MCP-Only Generation (V1)** — Prescription generation is not in the preToolUse hot path. MCP tools trigger generation on-demand. No hook wrappers needed.

2. **Notification Hint (V1.1)** — Single lightweight query to preToolUse: write `pending_prescriptions_count` to `prescriber_state` table (<5ms). MCP tools surface notification proactively.

3. **Performance Budget** — Hook cost breakdown (Windows p50):
   - Fast path: ~410ms (session exists, exit)
   - Slow path: ~460ms + curate (up to 3s cap)
   - Safety margin: 6.2s for other plugins
   - Total: within 10s timeout

4. **Data Model: `prescriptions` Table (Migration 005)** — 7-state lifecycle: generated → presented → {approved, rejected} → applying → {applied, failed}. Plus expired for abandoned prescriptions.

5. **Artifact Topology: In-Memory, Ephemeral** — Scanned at Prescriber startup, not persisted. Passed to prescription generator as input. Covers user-level (~/.copilot), project-level (.github), and plugin scopes.

6. **MCP Tool Surface: 4 Tools**
   - `list_prescriptions` — list pending, filtered by status, insight_id
   - `get_prescription` — full detail: insight context, proposed change, confidence
   - `decide_prescription` — apply, reject, dismiss with reason
   - `generate_prescriptions` — explicit trigger, optional force re-generation

7. **No Separate Hook** — Prescriber doesn't register new hooks. All logic in MCP. Event recording flows through existing Archivist's `logEvent()` path.

**Phased Implementation:**
- **V1:** MCP tools only, pending prescriptions
- **V1.1:** DB-persisted notification hint, `get_status` integration
- **V2:** File write capability, fingerprint drift detection, apply-action implementation
- **V3:** Conflict resolution, multi-prescription logic, growth tracking

**Open Questions for Team Discussion:**
1. Curation time budget (3s) — hardcoded or configurable?
2. Artifact topology discovery/caching — filesystem I/O strategy in MCP context?
3. Prescription deduplication — one per insight or multiple?
4. Compiler integration timing — validate before apply (V1) or after-verify (V2)?
5. Conflicting prescriptions — detection and resolution mechanism?

**Full Report:** `.squad/decisions/inbox/graham-prescriber-architecture.md`

---

### 2026-04-06: Prescriber Data Model & Integration Points

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-04-06  
**Type:** Technical / Data Model  
**Status:** Proposal — awaiting team review

**Decision:** Comprehensive data model for prescriptions with 7-state lifecycle, artifact topology discovery, and integration points to Curator and Archivist.

**Key Decisions:**

1. **`prescriptions` Table Schema (Migration 005)**
   - Lifecycle states: generated, presented, accepted, rejected, applied, failed, expired
   - Tracks insight source, target path, proposed content, confidence, user disposition
   - Includes fingerprint for drift detection before apply
   - Timestamps for each lifecycle transition

2. **`prescriber_state` Table** — Single row tracking `last_generated_at`, `pending_count`, updated_at. Enables MCP notifications without expensive COUNT query on every call.

3. **Artifact Topology: In-Memory Discovery** — Pure function `scanTopology()`, no persistence. Scans four phases:
   - User-level: `~/.copilot/` (instructions, agents, skills, hooks, MCP config)
   - Project-level: `.github/` (same types)
   - Installed plugins: `~/.cairn/plugins/`
   - Marketplace metadata: read-only reference

4. **Per-Type Resolution Rules** — Additive for instructions/hooks (all merge), first-found for agents/skills/commands, last-wins for MCP servers. Conflict detection by logical identity (agent name, skill name, MCP server key), not file path.

5. **TypeScript Types** — Complete type definitions for `Prescription`, `PrescriptionStatus`, `PrescriptionType`, `ArtifactType`, `ArtifactScope`, `DiscoveredArtifact`, `ArtifactTopology`.

6. **Integration with Curator & Archivist**
   - Prescriber reads insights via `getInsights('active')` from existing DAL
   - Records lifecycle events via `logEvent()` (existing Archivist path)
   - No new event infrastructure needed
   - Disposition feedback flows back to Curator through `prescription_applied` events

7. **Session-Based Cleanup** — At session start, expire prescriptions stuck in generated/presented status (abandoned from prior sessions).

8. **MCP Tool Surface** — Two tools: `list_prescriptions` (read-only), `resolve_prescription` (side-effecting: accept/reject/redirect). All decisions logged as events.

**New DB Module:** `src/db/prescriptions.ts` with CRUD functions and query helpers.

**Open Questions for Team:**
1. Compiler validation timing — before apply or after?
2. Prescription generation strategy — one per insight or multiple?
3. Hook budget impact — topology scan + generation must fit in remaining budget
4. Plugin ownership convention — how plugins declare owned files
5. MCP tool granularity — keep 2 tools or split resolve into 3?

**Full Report:** `.squad/decisions/inbox/roger-prescriber-datamodel.md`

---

### 2026-04-06: Prescriber Plugin Architecture & Artifact Discovery

**Author:** Rosella Chen (Plugin Dev)  
**Date:** 2026-04-06  
**Type:** Architecture / Plugin Design  
**Status:** Proposal — awaiting team review

**Decision:** Artifact discovery mechanism for the Prescriber, enabling it to understand the CLI artifact topology and apply prescriptions to the right locations.

**Key Decisions:**

1. **Four-Phase Discovery** — Scan sequence:
   - **Phase 1 (User-level):** `~/.copilot/` — instructions, agents, skills, hooks, MCP config
   - **Phase 2 (Project-level):** `.github/` — instructions, agents, skills, hooks, MCP config, plugin manifests
   - **Phase 3 (Plugins):** `~/.copilot/installed-plugins/` — plugin manifests, agents, skills, commands
   - **Phase 4 (Marketplace):** `~/.copilot/marketplace-cache/` — reference only, not active

2. **Per-Type Resolution Rules** — Critical insight from critique: each artifact type resolves differently
   - **Instructions, Hooks:** Additive (all sources merged)
   - **Agents, Skills, Commands:** First-found wins (logical identity determines conflict)
   - **MCP servers:** Last-wins (later configs override)
   - Identity is by logical name (from file frontmatter), not path

3. **Conflict Detection by Logical Identity** — Two files at different paths can conflict if they define the same agent/skill name. Prescriber must detect and report these.

4. **In-Memory Ephemeral Topology** — Not persisted to DB. Scanned fresh at Prescriber startup. Held in memory as `ArtifactTopology`. No caching strategy yet (deferred to V2).

5. **TypeScript Data Structures:**
   - `DiscoveredArtifact` — path, artifactType, scope, logicalId, ownerPlugin, checksum, lastModified
   - `ArtifactConflict` — logicalId, artifactType, conflicting paths
   - `ArtifactTopology` — collection of artifacts + scan timestamp

6. **Scanner Implementation** — Pure function, no side effects. Inputs: homedir, projectRoot, pluginsDir. Returns snapshot of topology.

**Design Principles:**
- Simple in V1: glob for known paths, classify by location
- No deep parsing of file contents
- Plugin ownership by directory structure, not content inspection
- Conflicts are data — surface them for human decision

**Open Questions for Team:**
1. Caching strategy — how to avoid repeated filesystem scans?
2. Conflict resolution — should Prescriber suggest which to keep?
3. Plugin manifest versioning — how to handle stale plugin metadata?
4. Discovery scope expansion — future phases (system plugins, marketplace)?
5. Fingerprinting — checksum and lastModified for drift detection on apply?

**Full Report:** `.squad/decisions/inbox/rosella-prescriber-plugin.md`

---

### 2026-04-06: Prescriber UX Design — Interaction, Attention, and Growth

**Author:** Valanice Chen (UX / Human Factors)  
**Date:** 2026-04-06  
**Type:** UX / Design  
**Status:** Proposal — awaiting team review

**Decision:** Prescriber interaction model framed as a coaching relationship, not a notification system. Design for human attention scarcity and decision fatigue.

**Core Philosophy:**
> "Coaches don't nag at the door; they wait for the right moment, say one important thing, and make it easy to act."

**Key Decisions:**

1. **Timing: Natural Pause, Not Session Start**
   - Wrong moment: Session start (cognitive task-switching cost)
   - Right moment: After first success, breathing point
   - Implementation: MCP tools only; consuming agent decides when to surface
   - Max 1 proactive prescription per session

2. **Format: The Coaching Note** — Prescription presented in natural conversation:
   ```
   📋 Cairn noticed a pattern:
   **Pattern:** [title] — seen [N] times over [timeframe]
   **What's happening:** [observation]
   **Suggestion:** [prescription]
   **Where:** [target location]
   **Confidence:** [high/medium] based on [evidence]
   ```

3. **Batching: 1 Proactive, Rest On-Demand**
   - Top priority, high confidence → Proactive (max 1/session)
   - Other pending → On-demand via `list_prescriptions`
   - Low confidence (<0.5) → Only via explicit query

4. **Priority Scoring** — Determines which single prescription gets proactive surfacing:
   ```
   priority = confidence × recency_weight × availability_factor
   ```
   - `confidence` — 0.0–1.0 from Curator
   - `recency_weight` — 1.0 (last 5 sessions) → 0.5 (over 20 sessions)
   - `availability_factor` — dampened by prior rejection, resets after cooldown
   - Ties broken by occurrence count

5. **7-State Prescription Lifecycle** — Every state intentional, prevents notification graveyard:
   - **pending** → (human sees it) → **previewed**
   - → {**approved**, **deferred**, **dismissed**, **expired**} (terminal)
   - → (if approved) → **applying** → {**applied**, **failed**} (terminal)

6. **Human Approval Flow** — Not automatic. Explicit decisions recorded, feed back to growth tracking:
   - Accept → Preview → Apply (with fingerprint check) → Success/Failure
   - Reject → Record reason → Adjust confidence
   - Defer → Cooldown period → Recompute priority
   - Dismiss → Deducted from confidence, adjust availability_factor

7. **Growth Tracking** — Learn from human decisions:
   - Track rejection patterns ("user always rejects hook prescriptions")
   - Adjust confidence based on acceptance rate
   - Recompute priority scores with human feedback
   - Implement cooldown period to avoid re-suggesting rejected insights

**Anti-Patterns Addressed:**
- Notification graveyard (too many pending)
- Decision fatigue (too many choices at once)
- Context switching costs (wrong timing)
- Ignored feedback (no learning from rejections)

**Open Questions for Team:**
1. Preference signals — how do UX signals (defer, dismiss) feed back?
2. Notification frequency cap — max proactive per session/day?
3. LLM re-ranking — should consuming agent re-rank priorities?
4. Session continuity — carry over deferred from previous session?

**Full Report:** `.squad/decisions/inbox/valanice-prescriber-ux.md`

---

### 2026-04-06: Prescriber Infrastructure Analysis — Hook Performance & MCP Tools

**Author:** Gabriel Knight (Infrastructure)  
**Date:** 2026-04-06  
**Type:** Infrastructure / Performance  
**Status:** Proposal — awaiting team review

**Decision:** Performance analysis of preToolUse hook, MCP tool design, and infrastructure requirements for Prescriber without impacting existing budgets.

**Key Findings:**

1. **preToolUse Hook Cost Breakdown (Windows p50)**
   - PowerShell startup + stdin: ~100ms
   - Node.js cold start + ESM: ~200ms
   - SQLite open + WAL + migrations: ~100ms
   - `git remote get-url origin`: ~10ms
   - Fast path (fresh session): <5ms
   - Slow path (crash recovery): ~50ms
   - **Curate():** Unbounded (loops until caught up)

2. **Critical Finding: Curation Cost Is Unbounded** — `curate()` processes batches but loops until cursor is current. After idle periods, could be thousands of events with no time cap. Gets killed by 10s timeout, silently fails.

3. **Recommendation: Add 3-Second Hard Budget to `curate()`** — Check elapsed time after each batch. If >3s, persist cursor and return partial results. Resume on next invocation.

4. **Prescriber Must NOT Run in preToolUse Hot Path** — Reasons:
   - No remaining budget after Node startup + curation
   - Prescription generation is expensive (1-2s minimum)
   - Fail-open makes timeouts invisible to users
   - 10s timeout shared across plugins (if others register hooks)

5. **MCP Tool Surface: 4 New Tools**
   - `list_prescriptions` (read-only) — list with optional filters
   - `get_prescription` (read-only) — full detail with insight context
   - `decide_prescription` (side-effecting) — apply/reject/dismiss
   - `generate_prescriptions` (side-effecting) — explicit trigger

6. **Notification Hint Strategy** — After `curate()`, write single indexed query to `prescriber_state` (count pending prescriptions). MCP tools read and surface in responses. Total: <10ms.

7. **No New Hook Wrappers Needed** — Prescriber doesn't register hooks. All logic in MCP. Event recording flows through existing Archivist. Only modification: `sessionStart.ts` adds notification hint check.

8. **hooks.json: No Changes** — Existing hooks.json is unchanged. Prescriber integrates as MCP tools, not hook slots.

**Performance Budget Proposal (10s total):**
| Phase | Budget | Guard |
|-------|--------|-------|
| PowerShell + stdin | 200ms | Fixed |
| Node.js + ESM | 300ms | Fixed |
| SQLite + WAL + migrations | 150ms | One-time per process |
| `git remote get-url origin` | 50ms | p99 |
| **Fast path total** | **700ms** | Exit here if fresh |
| Crash recovery | 100ms | Single transaction |
| **Curation (capped)** | **3,000ms** | **New: hard time budget** |
| Prescription hint check | 10ms | Single indexed query |
| **Safety margin** | **6,190ms** | For other plugins + tail |

**Build & Test Infrastructure:**
- New files: `src/agents/prescriber.ts`, `src/db/prescriptions.ts`, `src/db/migrations/005-prescriptions.ts`, `src/__tests__/prescriber.test.ts`
- Tests: Unit tests (`:memory:` SQLite), integration tests for MCP tools
- CI: No changes — vitest, npm run build, eslint all pick up new files
- Publish: Ships as part of `@akubly/cairn`, no separate package

**Open Questions for Team:**
1. Curation time budget configurability (3s hardcoded vs. preference)?
2. Artifact topology discovery caching strategy?
3. Prescription deduplication logic?
4. Compiler validation before apply (V1) or after (V2)?
5. Conflicting prescriptions detection and handling?

**Full Report:** `.squad/decisions/inbox/gabriel-prescriber-hooks.md`


---

### 2026-04-06T07:38: Decision Point 1 — Prescriber Trigger Architecture

**By:** Aaron Kubly (via Copilot)  
**Type:** Architecture  
**Status:** Active

**What:** Hybrid (C1): Prescriber generates prescriptions automatically at session start (conditional in preToolUse, chaining after curate() when insights change) AND via MCP (run_curate chains prescribe() automatically when it finds new insights). Prerequisites: cap curate() at 3s. No separate generate_prescriptions tool — run_curate handles both.

**Why:** Session boundary is the right batch point for pattern detection. postToolUse is too soon (incomplete data). preToolUse-as-session-start gives full event corpus. MCP path enables mid-session "what did we learn?" queries. Extending run_curate rather than adding a new tool follows principle of least surprise and keeps the two trigger paths symmetrical.

**Impact:** Phase 7C (Trigger Architecture). Binds run_curate chaining and preToolUse conditional logic.


---

### 2026-04-06T07:45: Decision Point 2 — Prescription State Machine

**By:** Aaron Kubly (via Copilot)  
**Type:** Architecture  
**Status:** Active

**What:** 8-state lifecycle: generated → accepted → applied | failed; generated → rejected; generated → deferred (resurfaces after cooldown); generated → expired (session cleanup); generated → suppressed (after 3 deferrals). Re-prescription after insight reinforcement handled by expiring old + generating new. Deferred has configurable cooldown (default 3 sessions). Rejected is terminal with optional freeform reason. Suppressed is reversible via MCP.

**Why:** Balances crash safety (accepted→applied/failed distinction) with UX needs (deferred prevents notification graveyard, suppression answers "should I stop asking?") without over-engineering (dropped transient micro-states like approved/applying and instrumentation-heavy states like presented).

**Impact:** Phase 7A (schema definition), Phase 7D (state transitions). Defines the core prescription lifecycle.


---

### 2026-04-06T07:50: Decision Point 3 — MCP Tool Surface

**By:** Aaron Kubly (via Copilot)  
**Type:** API  
**Status:** Active

**What:** 4 new MCP tools: list_prescriptions (read-only, filter by status), get_prescription (read-only, full detail + diff preview), esolve_prescription (write, unified action with disposition enum: accept/reject/defer/suppress), show_growth (read-only, growth summary and trends). Accept disposition triggers apply logic inline. Follows existing naming convention (get_*, list_*). Total MCP tools: 10 (6 existing + 4 new).

**Why:** Unified resolve tool is cleaner than split apply+dismiss — 8-state machine has 4 dispositions, one tool handles all without adding surface area for each. show_growth embedded in MVP (not deferred) per DP5. Naming follows existing convention for consistency.

**Impact:** Phase 7F (MCP Tools). Defines complete user-facing API.


---

### 2026-04-06T07:55: Decision Point 4 — Artifact Discovery Scope

**By:** Aaron Kubly (via Copilot)  
**Type:** Architecture  
**Status:** Active

**What:** Build Rosella's full 4-phase artifact discovery scanner for MVP: user-level (~/.copilot/), project-level (.github/), installed plugins, marketplace metadata. Includes per-artifact-type resolution rules, conflict detection, ownership tracking via path heuristics, checksum + mtime for drift detection. Cache with 5-minute TTL in SQLite artifact_cache table.

**Why:** Aaron chose the full scanner over simple constants, investing in a real understanding of the CLI installation topology from day one rather than building a throwaway stub. Enables Prescriber to write safe, correct sidecars and managed_artifacts entries.

**Impact:** Phase 7B (Artifact Discovery). Powers Phase 7E (Safety & Rollback).


---

### 2026-04-06T08:00: Decision Point 5 — UX Principles (Full Set)

**By:** Aaron Kubly (via Copilot)  
**Type:** Product  
**Status:** Active

**What:** Adopt ALL of Valanice's 10 UX principles for MVP:

1. Rejection easier than acceptance (design constraint on resolve_prescription)
2. Max 1 proactive prescription per session (counter in list_prescriptions)
3. Present after first success, not at the door (guidance in tool descriptions)
4. Observation framing, not judgment (copy/tone in rationale field)
5. Confidence in words, not numbers (formatting in get_prescription)
6. Deferral cooldown — 3 sessions default, configurable via prescriber.defer_sessions
7. No streaks, lead with wins — growth tracking uses cumulative trends, resolved patterns first
8. Suppression after 3 deferrals — "should I stop asking?" with reversible suppression
9. Priority scoring — confidence × recency_weight × availability_factor
10. Configurable preference surface — 7 preference keys using existing preferences cascade

**Why:** Aaron chose full UX investment from day one rather than building minimal stubs. Includes show_growth MCP tool and suppressed state.

**Impact:** Phase 7A (preferences), Phase 7D (scoring and state transitions), Phase 7F (formatting and show_growth).


---

### 2026-04-06T08:05: Decision Point 6 — managed_artifacts Table & Sidecar Strategy

**By:** Aaron Kubly (via Copilot)  
**Type:** Architecture  
**Status:** Active

**What:** Include managed_artifacts table tracking Prescriber-written files (path, artifact_type, logical_id, scope, original_checksum, prescription_id, rollback_content). Use sidecar instruction files (e.g., cairn-prescribed.instructions.md) instead of modifying user-owned instruction files. Rollback enabled by storing original file state. Drift detection via checksum comparison.

**Why:** Completes the safety model — Prescriber knows what it wrote, can undo it, detects manual edits. Sidecar approach respects the CLI's scoped instructions convention and avoids touching user-owned files. Aligns with full scanner (DP4) and full UX (DP5) investment.

**Impact:** Phase 7A (schema), Phase 7E (engine and rollback). Enables safe, auditable artifact mutations.


---

### 2026-04-06: Prescriber Implementation Plan — FINAL

# Prescriber Implementation Plan — FINAL

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-06  
**Status:** APPROVED — Ready for execution  
**Baseline:** 134 tests, 24 source files, 4 migrations, 6 MCP tools

---

## Executive Summary

The Prescriber is Cairn's third core agent. It closes the feedback loop:
**Events → Insights → Prescriptions → Human Approval → Applied Changes → Growth Tracking**.

Aaron made 6 binding decisions that chose depth on every dimension. This plan
incorporates all 6 into a 6-phase implementation (7A–7F) with explicit
dependencies, ownership, dogfood gates, and file manifests.

### Decision Incorporation Map

| Decision | Summary | Primary Impact |
|----------|---------|----------------|
| DP1 | Hybrid trigger: preToolUse chains + run_curate chains | Phase 7C |
| DP2 | 8-state lifecycle | Phase 7A (schema), 7D (transitions) |
| DP3 | 4 new MCP tools (10 total) | Phase 7F |
| DP4 | Full 4-phase artifact scanner with SQLite cache | Phase 7B |
| DP5 | All 10 UX principles | Phase 7A (prefs), 7D (scoring), 7F (formatting) |
| DP6 | managed_artifacts table + sidecar strategy | Phase 7A (schema), 7E (engine) |

---

## Phase 7A — Data Foundation

**Goal:** Establish the schema, types, DAL, and preference surface that every subsequent phase builds on.

**Owner:** Roger (Platform Dev)  
**Dependencies:** None (first phase)  
**Estimated new tests:** ~25

### Deliverables

#### Migration 005: `prescriptions` + `prescriber_state`

**File:** `src/db/migrations/005-prescriptions.ts`

```sql
CREATE TABLE prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source
  insight_id INTEGER NOT NULL REFERENCES insights(id),
  pattern_type TEXT NOT NULL,

  -- Content
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  proposed_change TEXT NOT NULL,
  target_path TEXT,
  artifact_type TEXT,
  artifact_scope TEXT CHECK (artifact_scope IN ('user', 'project', 'plugin')),

  -- Lifecycle (DP2: 8 states)
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN (
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    )),

  -- Scoring (DP5: priority formula)
  confidence REAL NOT NULL DEFAULT 0.0
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  priority_score REAL NOT NULL DEFAULT 0.0,
  recency_weight REAL NOT NULL DEFAULT 1.0,
  availability_factor REAL NOT NULL DEFAULT 1.0,

  -- Disposition tracking
  disposition_reason TEXT,
  defer_count INTEGER NOT NULL DEFAULT 0,
  defer_until_session INTEGER,

  -- Timestamps
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  applied_at TEXT,
  expires_at TEXT
);

CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_insight ON prescriptions(insight_id);
CREATE INDEX idx_prescriptions_priority ON prescriptions(status, priority_score DESC);

CREATE TABLE prescriber_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_generated_at TEXT,
  pending_count INTEGER NOT NULL DEFAULT 0,
  sessions_since_install INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO prescriber_state (id) VALUES (1);
```

#### Migration 006: `managed_artifacts`

**File:** `src/db/migrations/006-managed-artifacts.ts`

```sql
CREATE TABLE managed_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  logical_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('user', 'project', 'plugin')),
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
  original_checksum TEXT,
  current_checksum TEXT,
  rollback_content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_managed_artifacts_path ON managed_artifacts(path);
CREATE INDEX idx_managed_artifacts_prescription ON managed_artifacts(prescription_id);
```

#### DAL Modules

**File:** `src/db/prescriptions.ts`

Functions:
- `createPrescription(fields) → id`
- `getPrescription(id) → Prescription | undefined`
- `listPrescriptions(filters: { status?, insightId?, limit? }) → Prescription[]`
- `updatePrescriptionStatus(id, status, fields?) → void`
- `getTopPrescription() → Prescription | undefined` (highest priority, generated status)
- `countPrescriptionsByStatus() → Record<string, number>`
- `expireAbandonedPrescriptions() → number` (generated older than 7 days → expired)
- `deferPrescription(id, reason?, sessionCount?) → void`
- `suppressPrescription(id) → void` (after 3 deferrals)
- `unsuppressPrescription(id) → void`
- `getSessionsSinceInstall() → number`
- `incrementSessionCounter() → void`

**File:** `src/db/managedArtifacts.ts`

Functions:
- `trackManagedArtifact(fields) → id`
- `getManagedArtifact(path) → ManagedArtifact | undefined`
- `listManagedArtifacts(prescriptionId?) → ManagedArtifact[]`
- `updateArtifactChecksum(path, checksum) → void`
- `removeManagedArtifact(path) → void`
- `detectDrift(path) → { drifted: boolean, expected: string, actual: string }`

#### Preference Keys (DP5 #10)

Register 7 preference keys in the existing `preferences` table cascade:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `prescriber.enabled` | boolean | `true` | Master on/off |
| `prescriber.max_proactive` | integer | `1` | Max proactive per session (DP5 #2) |
| `prescriber.defer_sessions` | integer | `3` | Deferral cooldown sessions (DP5 #6) |
| `prescriber.suppress_threshold` | integer | `3` | Deferrals before suppression (DP5 #8) |
| `prescriber.min_confidence` | float | `0.3` | Below this, never proactive |
| `prescriber.auto_apply` | boolean | `false` | Skip human confirmation (power user) |
| `prescriber.sidecar_prefix` | string | `cairn-prescribed` | Sidecar filename prefix (DP6) |

#### Type Definitions

**File:** `src/types/index.ts` (append)

```typescript
// ---------------------------------------------------------------------------
// Prescriber types (Phase 7)
// ---------------------------------------------------------------------------

/** 8-state prescription lifecycle (DP2) */
export type PrescriptionStatus =
  | 'generated'
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'applied'
  | 'failed'
  | 'expired'
  | 'suppressed';

/** Disposition actions for resolve_prescription (DP3) */
export type PrescriptionDisposition = 'accept' | 'reject' | 'defer';

/** Artifact types discovered by the scanner */
export type ArtifactType =
  | 'instruction'
  | 'agent'
  | 'skill'
  | 'hook'
  | 'mcp_server'
  | 'plugin_manifest'
  | 'command';

/** Scope of an artifact in the CLI topology */
export type ArtifactScope = 'user' | 'project' | 'plugin';

/** Resolution strategy per artifact type */
export type ResolutionRule = 'additive' | 'first_found' | 'last_wins';

/** A prescription generated from a Curator insight */
export interface Prescription {
  id: number;
  insightId: number;
  patternType: PatternType;
  title: string;
  rationale: string;
  proposedChange: string;
  targetPath?: string;
  artifactType?: ArtifactType;
  artifactScope?: ArtifactScope;
  status: PrescriptionStatus;
  confidence: number;
  priorityScore: number;
  recencyWeight: number;
  availabilityFactor: number;
  dispositionReason?: string;
  deferCount: number;
  deferUntilSession?: number;
  generatedAt: string;
  resolvedAt?: string;
  appliedAt?: string;
  expiresAt?: string;
}

/** A file managed by the Prescriber (DP6) */
export interface ManagedArtifact {
  id: number;
  path: string;
  artifactType: ArtifactType;
  logicalId?: string;
  scope: ArtifactScope;
  prescriptionId: number;
  originalChecksum?: string;
  currentChecksum?: string;
  rollbackContent?: string;
  createdAt: string;
  updatedAt: string;
}

/** A discovered artifact in the CLI topology (DP4) */
export interface DiscoveredArtifact {
  path: string;
  artifactType: ArtifactType;
  scope: ArtifactScope;
  logicalId: string;
  ownerPlugin?: string;
  checksum: string;
  lastModified: number;
  resolutionRule: ResolutionRule;
}

/** Conflict between artifacts at different paths with the same logical identity */
export interface ArtifactConflict {
  logicalId: string;
  artifactType: ArtifactType;
  artifacts: DiscoveredArtifact[];
}

/** Complete snapshot of the CLI artifact topology (DP4) */
export interface ArtifactTopology {
  artifacts: DiscoveredArtifact[];
  conflicts: ArtifactConflict[];
  scannedAt: string;
  scanDurationMs: number;
}

/** Cached topology entry in SQLite (DP4: 5-min TTL) */
export interface TopologyCache {
  topology: ArtifactTopology;
  cachedAt: number;
  ttlMs: number;
}

/** Growth tracking summary for show_growth MCP tool (DP5) */
export interface GrowthSummary {
  totalPrescriptions: number;
  accepted: number;
  rejected: number;
  deferred: number;
  applied: number;
  failed: number;
  acceptanceRate: number;
  resolvedPatterns: string[];
  activePatterns: string[];
  trend: 'improving' | 'stable' | 'declining';
}
```

#### Test Coverage

**File:** `src/__tests__/prescriptions.test.ts`

- Migration applies cleanly
- CRUD for prescriptions (create, read, update status)
- Status constraint validation (8 valid states)
- Prescription listing with filters (by status, by insight)
- Priority-ordered retrieval
- Expiration of abandoned prescriptions
- Deferral with cooldown tracking
- Suppression after 3 deferrals
- Unsuppression
- Session counter increment
- managed_artifacts CRUD
- managed_artifacts drift detection (checksum mismatch)
- Unique path constraint on managed_artifacts
- Preference key defaults

### Dogfood Gate

```bash
npm run build && npm run test && npm run lint
# All 134 existing tests pass
# ~25 new tests pass
# Migration 005 + 006 apply on fresh DB
# Prescriptions can be created, queried, status-transitioned
# managed_artifacts can be tracked and drift-detected
```

---

## Phase 7B — Artifact Discovery Scanner

**Goal:** Build the 4-phase artifact discovery scanner that maps the CLI installation topology, with SQLite-backed caching.

**Owner:** Rosella (Plugin Dev)  
**Dependencies:** Phase 7A (types: `DiscoveredArtifact`, `ArtifactTopology`, `ArtifactConflict`)  
**Estimated new tests:** ~20

### Deliverables

**File:** `src/agents/discovery.ts`

#### Scanner Architecture

Pure function `scanTopology(homedir, projectRoot?, pluginsDir?) → ArtifactTopology`:

1. **Phase 1 — User-level** (`~/.copilot/`):
   - `instructions.md` → instruction artifact
   - `agents/*.agent.md` → agent artifacts
   - `skills/*/SKILL.md` → skill artifacts
   - `hooks/*` → hook artifacts
   - MCP config files → mcp_server artifacts

2. **Phase 2 — Project-level** (`.github/`):
   - `copilot-instructions.md` → instruction artifact
   - `agents/*.agent.md` → agent artifacts
   - `skills/*/SKILL.md` → skill artifacts
   - `extensions/*.ts` → hook artifacts
   - `.copilot/mcp.json` → mcp_server artifacts

3. **Phase 3 — Installed plugins** (`~/.copilot/installed-plugins/` or `pluginsDir`):
   - `*/plugin.json` → plugin_manifest artifact
   - `*/agents/*.agent.md` → agent artifacts (ownerPlugin set)
   - `*/skills/*/SKILL.md` → skill artifacts (ownerPlugin set)

4. **Phase 4 — Marketplace metadata** (`~/.copilot/marketplace-cache/`):
   - Read-only reference data, not active artifacts
   - Included for completeness in topology snapshot

#### Resolution Rules

Per artifact type, applied during conflict detection:

| Artifact Type | Resolution | Conflict Meaning |
|---------------|------------|------------------|
| instruction | additive | All merge — no conflicts |
| hook | additive | All merge — no conflicts |
| agent | first_found | Same name at different scopes — shadow warning |
| skill | first_found | Same name at different scopes — shadow warning |
| command | first_found | Same name at different scopes — shadow warning |
| mcp_server | last_wins | Later config overrides earlier |
| plugin_manifest | first_found | Same plugin ID at different locations |

#### Caching (DP4: 5-minute TTL)

**File:** `src/db/topologyCache.ts`

- `cacheTopology(topology: ArtifactTopology) → void` (serialize to SQLite blob)
- `getCachedTopology(ttlMs?: number) → ArtifactTopology | null` (null if expired)
- Default TTL: 300,000ms (5 minutes)
- Storage: JSON blob in a `topology_cache` table (added in migration 005, single-row)

Add to migration 005:
```sql
CREATE TABLE topology_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  topology_json TEXT NOT NULL,
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  scan_duration_ms INTEGER NOT NULL DEFAULT 0
);
```

#### Logical Identity Extraction

- Agents: parse YAML frontmatter `name:` field from `.agent.md`
- Skills: parse `# ` heading from `SKILL.md`
- MCP servers: key from JSON config object
- Plugins: `name` from `plugin.json`
- Instructions/hooks: filename-based identity (no logical conflict possible for additive types)

#### Test Coverage

**File:** `src/__tests__/discovery.test.ts`

- Scan empty directory → empty topology
- Scan user-level artifacts (instructions, agents, skills)
- Scan project-level artifacts
- Scan plugin artifacts with ownerPlugin attribution
- Conflict detection: same agent name at user + project scope
- Resolution rule assignment per artifact type
- Checksum computation for discovered files
- Cache write + read within TTL
- Cache miss after TTL expiry
- Logical identity extraction from agent frontmatter
- Logical identity extraction from skill heading
- Mixed topology with all 4 phases
- Graceful handling of missing directories
- Scan duration tracking

### Dogfood Gate

```bash
npm run build && npm run test
# Scanner discovers artifacts in Aaron's real ~/.copilot/ directory
# Topology includes user agents, skills, project instructions
# Cache serves topology within TTL, refreshes after expiry
# Conflicts detected for duplicate agent names
```

---

## Phase 7C — Infrastructure: Curate Cap + Trigger Wiring

**Goal:** Add the 3-second time cap to `curate()` and wire the hybrid trigger so prescriptions generate automatically when insights change.

**Owner:** Gabriel (Infrastructure)  
**Dependencies:** Phase 7A (prescriptions DAL for `prescribe()` call)  
**Estimated new tests:** ~10

### Deliverables

#### Curate Time Cap

**File:** `src/agents/curator.ts` (modify)

In the `curate()` function's batch loop, add elapsed time check:

```typescript
export function curate(): CurateResult {
  const startTime = Date.now();
  const TIME_BUDGET_MS = 3000; // DP1: 3-second hard cap
  // ...existing batch loop...
  while (hasMore) {
    // ...existing batch processing...
    // After advancing cursor:
    if (Date.now() - startTime > TIME_BUDGET_MS) {
      hasMore = false; // Persist cursor, return partial results
    }
  }
  // ...
}
```

Return shape extended:

```typescript
export interface CurateResult {
  eventsProcessed: number;
  insightsCreated: number;
  insightsReinforced: number;
  capped: boolean;           // NEW: true if time budget exhausted
  insightsChanged: boolean;  // NEW: true if any created or reinforced
}
```

#### Trigger Wiring — preToolUse Path (DP1)

**File:** `src/hooks/sessionStart.ts` (modify)

In `runSessionStart()`, after `curate()` on the slow path:

```typescript
export function runSessionStart(repoKey: string): { fastPath: boolean } {
  // ...existing logic...
  catchUpPreviousSession(repoKey);
  const curateResult = curate();

  // DP1: Chain prescribe() when insights changed
  if (curateResult.insightsChanged) {
    prescribe();  // imported from src/agents/prescriber.ts
  }

  return { fastPath: false };
}
```

#### Trigger Wiring — MCP Path (DP1)

**File:** `src/mcp/server.ts` (modify `run_curate` tool)

```typescript
// run_curate handler — after curate(), chain prescribe()
const result = curate();
let prescribeResult = null;
if (result.insightsChanged) {
  prescribeResult = prescribe();
}
return {
  content: [{
    type: 'text',
    text: JSON.stringify({ curate: result, prescriptions: prescribeResult }, null, 2)
  }]
};
```

#### Session Counter (DP5 #6: deferral cooldown)

**File:** `src/hooks/sessionStart.ts` (modify)

On slow path (new session), increment `prescriber_state.sessions_since_install`:

```typescript
incrementSessionCounter(); // from src/db/prescriptions.ts
```

#### Test Coverage

**File:** `src/__tests__/curator.test.ts` (modify + add)

- Curate respects 3-second time budget (mock Date.now)
- Curate returns `capped: true` when budget exhausted
- Curate returns `insightsChanged: true` when insights created/reinforced
- Curate returns `insightsChanged: false` when no pattern matches
- Cursor persisted correctly after time-capped partial run
- Next curate() call resumes from persisted cursor

**File:** `src/__tests__/sessionStart.test.ts` (modify + add)

- prescribe() called when curate produces new insights
- prescribe() not called when curate produces no changes
- Session counter incremented on slow path
- prescribe() failure doesn't break session start (fail-open)

### Dogfood Gate

```bash
npm run build && npm run test
# curate() completes in <3s even with 10,000+ unprocessed events
# preToolUse chains prescribe() on session start when insights exist
# run_curate MCP tool returns combined curate + prescribe results
# Session counter tracks total sessions for deferral cooldown
```

---

## Phase 7D — Prescription Engine

**Goal:** Build the core Prescriber agent that transforms Curator insights into concrete, prioritized prescriptions.

**Owner:** Roger (Platform Dev)  
**Dependencies:** Phase 7A (DAL), Phase 7B (topology scanner)  
**Estimated new tests:** ~25

### Deliverables

**File:** `src/agents/prescriber.ts`

```typescript
export const AGENT_NAME = 'prescriber';
export const AGENT_DESCRIPTION = 'Translates insights into actionable prescriptions';
```

#### Core Functions

`prescribe() → PrescribeResult`
- Get active insights via `getInsights('active')`
- Get topology via `getCachedTopology()` or `scanTopology()`
- For each insight without a current `generated` prescription:
  - Generate prescription (insight → concrete change)
  - Compute target path from topology
  - Compute priority score
  - Persist via `createPrescription()`
- Log `prescription_generated` event via Archivist
- Return summary of generated prescriptions

#### Prescription Generation Strategy

Map insight pattern types to prescription types:

| Insight Pattern | Prescription Strategy |
|-----------------|----------------------|
| `recurring_error` | Sidecar instruction to prevent the error category |
| `error_sequence` | Sidecar instruction with guard step between trigger and error |
| `skip_frequency` | Sidecar instruction reviewing guardrail relevance |

Concrete change generation (rule-based, no LLM):
- Template-based: each pattern type has a prescription template
- Target: sidecar instruction file (`{prefix}.instructions.md`) in appropriate scope
- Content: Markdown instruction block with context from insight

#### Priority Scoring (DP5 #9)

```typescript
function computePriority(
  confidence: number,
  lastSeenAt: string,
  sessionsAgo: number,
  priorRejections: number
): number {
  // recency_weight: 1.0 within 5 sessions, decays to 0.5 by 20 sessions
  const recencyWeight = Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15));

  // availability_factor: dampened by prior rejections, min 0.1
  const availabilityFactor = Math.max(0.1, 1.0 - priorRejections * 0.3);

  return confidence * recencyWeight * availabilityFactor;
}
```

#### State Machine Transitions (DP2)

```
generated ──accept──→ accepted ──apply──→ applied
                                └──fail──→ failed
generated ──reject──→ rejected (terminal, reason stored)
generated ──defer───→ deferred (cooldown, resurfaces after N sessions)
generated ──expire──→ expired (session cleanup)
generated ──suppress→ suppressed (after 3 deferrals, reversible)
deferred  ──resurface→ generated (after cooldown, new priority)
suppressed──unsuppress→ generated (manual reactivation)
```

#### Deferred Cooldown Logic (DP5 #6)

```typescript
function shouldResurface(prescription: Prescription, currentSession: number): boolean {
  if (prescription.status !== 'deferred') return false;
  if (!prescription.deferUntilSession) return true;
  return currentSession >= prescription.deferUntilSession;
}
```

On resurface: expire old prescription, generate new one from same insight (DP2: "re-prescription after insight reinforcement handled by expiring old + generating new").

#### Suppression Logic (DP5 #8)

After 3 deferrals of prescriptions from the same insight, auto-suppress:
```typescript
if (prescription.deferCount >= suppressThreshold) {
  suppressPrescription(prescription.id);
  // Log event: prescription_suppressed
}
```

Suppression is reversible via `unsuppressPrescription()`.

#### Session Cleanup

At prescribe() start, expire stale prescriptions:
- `generated` status older than 7 days → `expired`
- `deferred` past cooldown → resurface (expire + regenerate)

#### Test Coverage

**File:** `src/__tests__/prescriber.test.ts`

- prescribe() generates prescriptions from active insights
- prescribe() skips insights that already have generated prescriptions
- prescribe() computes priority scores correctly
- Priority ordering: higher confidence × recency wins
- State transition: generated → accepted
- State transition: generated → rejected (with reason)
- State transition: generated → deferred (with cooldown)
- State transition: accepted → applied
- State transition: accepted → failed
- State transition: generated → expired (cleanup)
- State transition: generated → suppressed (after 3 deferrals)
- State transition: suppressed → generated (unsuppress)
- Deferred prescriptions resurface after cooldown sessions
- Suppression threshold configurable via preference
- Prescription template for recurring_error insight
- Prescription template for error_sequence insight
- Prescription template for skip_frequency insight
- Target path computed from topology scope
- Sidecar filename uses configured prefix
- prescribe() records events via Archivist
- prescribe() is idempotent (no duplicates)
- prescribe() handles empty insights list
- prescribe() handles missing topology gracefully
- Expiration of abandoned prescriptions
- Re-prescription: expired old + generated new from same insight

### Dogfood Gate

```bash
npm run build && npm run test
# prescribe() generates prescriptions from Aaron's real insights
# Priority scoring ranks high-confidence recent insights first
# Deferral cooldown prevents re-surfacing within 3 sessions
# State transitions enforce the 8-state machine
# Events logged for each prescription lifecycle change
```

---

## Phase 7E — Apply Engine + Managed Artifacts

**Goal:** Build the sidecar file writing, rollback, and drift detection system that makes prescriptions actionable.

**Owner:** Rosella (Plugin Dev)  
**Dependencies:** Phase 7A (managed_artifacts DAL), Phase 7B (topology for target resolution)  
**Estimated new tests:** ~15

### Deliverables

**File:** `src/agents/applier.ts`

#### Core Functions

`applyPrescription(prescriptionId: number) → ApplyResult`
1. Load prescription from DB
2. Validate status is `accepted`
3. Resolve target path:
   - User scope → `~/.copilot/{prefix}.instructions.md`
   - Project scope → `.github/{prefix}.instructions.md`
   - Plugin scope → plugin's local override directory
4. Check for drift if file exists (checksum comparison)
5. Read existing content (for rollback)
6. Write sidecar file with prescription content
7. Compute new checksum
8. Track in `managed_artifacts` table
9. Update prescription status → `applied`
10. Log `prescription_applied` event

`rollbackPrescription(prescriptionId: number) → RollbackResult`
1. Find managed artifact by prescription_id
2. If `rollback_content` exists, restore it
3. If no rollback content (new file), delete the file
4. Remove from `managed_artifacts`
5. Update prescription status → `failed` (or new status if we add one)
6. Log `prescription_rolled_back` event

`checkDrift(path: string) → DriftResult`
1. Read current file checksum
2. Compare to `current_checksum` in managed_artifacts
3. Return `{ drifted: boolean, expected, actual }`

#### Sidecar Strategy (DP6)

Instead of modifying user-owned files:
- Write `cairn-prescribed.instructions.md` (configurable prefix via `prescriber.sidecar_prefix`)
- CLI's scoped instructions convention automatically merges sidecar with user instructions

---

### 2026-04-06: Automatic `pending_count` Synchronization

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Status:** Active  
**Phase:** 7A — Data Foundation

The `prescriber_state.pending_count` field tracks how many prescriptions are in 'generated' status. Every DAL function that changes prescription status (create, updateStatus, defer, suppress, unsuppress, expire) also updates `pending_count`.

**Rationale:**
- Prevents stale counts. Alternative of requiring manual sync puts burden on callers.
- Cost: one extra UPDATE per status change on a singleton table (negligible overhead)
- Benefit: counters always fresh, callers never forget to sync

**Impact:** Phase 7D (Prescription Engine) and 7F (MCP tools) can read `pending_count` from `prescriber_state` without worrying about staleness.

---

### 2026-04-06: `detectDrift()` Returns `undefined` for Missing Paths

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Status:** Active  

---

### 2026-04-07 Phase 7B: Marketplace Artifacts Excluded from Conflict Detection

**Author:** Rosella (Plugin Dev)  
**Type:** Technical  
**Phase:** 7B — Artifact Discovery  
**Status:** Active

Marketplace artifacts are included in `ArtifactTopology.artifacts` for completeness, but excluded from conflict detection. Marketplace is read-only reference data, not active artifacts.

**Rationale:**
- Prevents stale cache data from triggering false conflicts with installed plugins.
- `ArtifactScope` type only has `user | project | plugin` — no `marketplace` variant.

**Impact:** Downstream consumers (Prescriber, 7D onwards) should treat marketplace-scope artifacts as informational, not actionable.

---

### 2026-04-07 Phase 7B: Dual MCP Config Path Support

**Author:** Rosella (Plugin Dev)  
**Type:** Technical  
**Phase:** 7B — Artifact Discovery  
**Status:** Active

Scan both `.copilot/mcp.json` and `.copilot/mcp-config.json` for project-level MCP discovery. This repo and Aaron's machine use `.copilot/mcp-config.json`; spec references `.copilot/mcp.json`.

**Decision:** If both exist, artifacts from both are included. Duplicates surface as conflicts via `last_wins` resolution.

**Impact:** Discovery works on both reference configuration paths without preference.

---

### 2026-04-07 Phase 7B: Project MCP Scanning Independent of .github/

**Author:** Rosella (Plugin Dev)  
**Type:** Technical  
**Phase:** 7B — Artifact Discovery  
**Status:** Active

Project MCP config lives at `.copilot/` (project root), not under `.github/`. A project could have MCP servers configured without any `.github/` directory.

**Decision:** Scan `.copilot/` MCP config independently of `.github/` existence. The `.github/` guard only gates instruction/agent/skill/extension scanning.

**Impact:** MCP discovery is not blocked by `.github/` absence.

---

### 2026-04-07 Phase 7B: Plugin ownerPlugin from manifest name

**Author:** Rosella (Plugin Dev)  
**Type:** Technical  
**Phase:** 7B — Artifact Discovery  
**Status:** Active

Plugin directory names may differ from the plugin's declared name in `plugin.json`.

**Decision:** Use `plugin.json` `name` field as canonical `ownerPlugin`, falling back to directory name only on parse failure.

**Impact:** Attribution aligns with plugin's self-declared identity, not filesystem layout.

---

### 2026-04-07 Phase 7C: Time Cap is Soft (Between-Batch Check)

**Author:** Gabriel (Infrastructure)  
**Type:** Technical  
**Phase:** 7C — Infrastructure  
**Status:** Active

The 3-second TIME_BUDGET_MS is checked between batches, not mid-batch. A single batch of 1000 events runs to completion before the check fires.

**Rationale:** Interrupting a batch mid-transaction would leave cursor and insights inconsistent. Between-batch checking is safe and predictable.

**Trade-off:** Curate() can exceed 3s if one batch is slow. Reducing BATCH_SIZE would tighten the cap but increase transaction overhead.

**Impact:** Callers should expect variable latency up to BATCH_SIZE completion time + 3s.

---

### 2026-04-07 Phase 7C: `capped` Flag Set Only When Full Batches Remain

**Author:** Gabriel (Infrastructure)  
**Type:** Technical  
**Phase:** 7C — Infrastructure  
**Status:** Active

The `capped` flag is set only when full batches remain after the time cap fires. If the last batch is partial (`events.length < BATCH_SIZE`), `capped` is `false` even if elapsed > TIME_BUDGET_MS.

**Rationale:** "Capped" means "work remains but we stopped" — not "we happened to be slow." Distinguishes between "caught up" and "gave up early."

**Impact:** Consumers can trust `capped: true` to mean "call curate() again later." A `false` `capped` with a high elapsed time means all work finished despite slowness.

---

### 2026-04-07 Phase 7C: MCP `run_curate` Output Shape is Breaking

**Author:** Gabriel (Infrastructure)  
**Type:** Technical  
**Phase:** 7C — Infrastructure  
**Status:** Active

Changed from flat `{ eventsProcessed, insightsCreated, insightsReinforced }` to nested `{ curate: {...}, prescriptions: {...} | null }`. This is per the Phase 7C spec.

**Decision:** No backward compatibility wrapper.

**Impact:** Any MCP client parsing run_curate output directly will need updating. Since Cairn is pre-1.0 and the only consumer is the Copilot agent, this is acceptable.

---

## Phase 7F Decisions — Roger Wilco (Final Phase)

### 2026-04-07T05-43: State Guard on resolve_prescription

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Phase:** 7F — MCP Tools + UX  
**Status:** Active

Only prescriptions in `generated` status can be resolved. Attempting to resolve a prescription in any other state returns an error. This prevents lifecycle corruption (e.g., re-rejecting an already-applied prescription).

**Rationale:** State machine integrity. A prescription in 'accepted' or 'applied' state has already transitioned through the decision point. Allowing re-resolution would create ambiguous audit trails and potential conflicts with apply operations.

**Impact:** MCP tool `resolve_prescription` validates state before calling transition. User-friendly error messages guide users to check prescription status before attempting resolution.

---

### 2026-04-07T05-43: Accept Failure Handling

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Phase:** 7F — MCP Tools + UX  
**Status:** Active

When `applyPrescription()` fails after `updatePrescriptionStatus(id, 'accepted')`, the tool explicitly marks the prescription as `failed`. This prevents prescriptions stuck in `accepted` state with no applied artifact.

**Rationale:** Application failures are real (write permissions, file conflicts, network errors). Rather than leaving prescriptions in a limbo state, explicit failure marking ensures prescriber can move on and offer retry/alternative options in next cycle.

**Decision:** Fail-soft transition: accepted → failed (with error context logged).

**Impact:** Audit trail is clear. Downstream tools (`show_growth`, `list_prescriptions`) can distinguish "not applied yet" (accepted) from "tried and failed" (failed).

---

### 2026-04-07T05-43: Proactive Hint Counter — Process Lifetime

**Author:** Roger Wilco (Platform Dev)  
**Type:** Design  
**Phase:** 7F — MCP Tools + UX  
**Status:** Active

Used a module-level `proactiveHintsShown` counter (reset per process lifecycle) rather than DB-based tracking. MCP server processes are short-lived, so this is sufficient for "max 1 per session" and avoids unnecessary DB writes.

**Rationale:** MCP server spawns per CLI invocation (typically seconds to minutes). Database writes for every hint shown add latency. Module-level counter is sufficient for the constraint ("max 1 proactive hint per session"). If Cairn scales to long-running daemons, revisit with persistent tracking.

**Decision:** No DB write; counter reset on process exit.

**Impact:** UX principle "max 1 proactive hint per session" is enforced cheaply. Faster response times. No database cleanup needed.

---

### 2026-04-07T05-43: Exported UX Helpers for Testing

**Author:** Roger Wilco (Platform Dev)  
**Type:** Design  
**Phase:** 7F — MCP Tools + UX  
**Status:** Active

Exported `confidenceToWords()` and `resetProactiveHintCounter()` from server.ts to enable unit testing of UX formatting without requiring MCP transport.

**Rationale:** Testing UX strings ("high confidence", "medium confidence", etc.) shouldn't require full MCP setup. Exported helpers decouple UX logic from transport. Matches pattern in other layers (DAL functions exported for testing, not just via HTTP).

**Decision:** Public exports for all UX helper functions.

**Impact:** Faster unit tests, better UX coverage, clearer public API for future extensions.

---

### 2026-04-07T06-43: Phase 7 Code Review — Prescriber Implementation Approved

**Author:** Graham Knight (Lead/Architect)  
**Type:** Code Review / Approval  
**Phase:** 7 — Code Review  
**Status:** Active

Prescriber implementation (Phase 7) code review completed. All 7 blocking/important issues identified have been fixed inline. Architecture assessed as sound.

**Issues Fixed:**

1. **Path traversal validation** (applier.ts): Added `isValidPrefix()` guard. Blocks escape attempts with `..` or separators.
2. **Double-formatted sidecar** (prescriber.ts + applier.ts): Removed redundant `buildSidecarContent()` from prescriber. Applier is now sole formatter.
3. **Project-scope discovery failure** (prescriber.ts): Fixed `getTopology()` to pass `process.cwd()` as projectRoot. Phase 2 artifacts now discovered.
4. **Missing-file drift bypass** (applier.ts): Enhanced drift detection. Fails if tracked sidecar exists in DB but file was manually deleted.
5. **Topology cache wiring** (prescriber.ts): Connected `getTopology()` → `cacheTopology()`. 5-minute TTL cache now functional.
6. **Timestamp parsing inconsistency** (topologyCache.ts): Standardized to `parseSqliteDateToMs()` with Date fallback. Aligns with codebase convention.
7. **N+1 query in deferral loop** (prescriber.ts): Hoisted `getInsights('active')` and topology fetch above loop. Single fetch for batch processing.

**Validation:**
- Build: Clean (tsc)
- Tests: 316/316 passing
- Lint: Clean (eslint)
- Regressions: 0

**Decision:** Phase 7 APPROVED. Ready for merge.

**Impact:** All critical issues resolved. Architecture sound, test coverage thorough. Prescriber implementation ready for production integration.

---

### 2026-04-07T05-43: Added getInsight(id) to Insights DAL

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical  
**Phase:** 7F — MCP Tools + UX  
**Status:** Active

The `get_prescription` tool needs insight context (title, description, origin pattern), but no single-insight lookup existed. Added `getInsight(id: number): Insight | undefined` to `src/db/insights.ts`.

**Rationale:** `get_prescription` returns prescription metadata + rich insight context (why this recommendation exists, what pattern triggered it). Without single-insight lookup, tool would need to query all insights and filter — O(n) cost. Single-insight DAL function is O(1).

**Decision:** Backward-compatible addition; no changes to existing insight functions.

**Impact:** `get_prescription` response is fast and rich. Audit trail clear (which insight drove which prescription).

---

### 2026-04-07T05-43: show_growth Resolved Patterns as Heuristic

**Author:** Roger Wilco (Platform Dev)  
**Type:** Design  
**Phase:** 7F — MCP Tools + UX  
**Status:** Active

"Applied prescription + insight is stale" is presented as a heuristic, not definitive proof of resolution. The insight status table lacks a "resolved because of prescription" signal, so this is the best available proxy.

**Rationale:** True resolution proof would require end-to-end tracking: insight → prescription → application → user verification → pattern disappears. That's complex. The heuristic ("we applied a fix, and the insight is no longer triggering new alerts") is good enough for growth tracking, with caveat that it's heuristic-based.

**Decision:** Present with confidence language: "This pattern appears resolved" rather than "This pattern is resolved." Let users verify.

**Impact:** `show_growth` tool is transparent about evidence quality. Users build trust in recommendations. Future phases can add deeper resolution proof if needed.

---

## Phase 7F Summary

- 4 new MCP tools registered (10 total: Cairn ecosystem complete)
- run_curate description updated to reflect new tools
- 22 new tests (316 total)
- All dogfood gates passed: build ✅, test ✅, lint ✅
- All 10 UX principles integrated
- Prescriber ready for production use

---

### 2026-04-07 Phase 7C: `incrementSessionCounter()` Unconditional on Slow Path

**Author:** Gabriel (Infrastructure)  
**Type:** Technical  
**Phase:** 7C — Infrastructure  
**Status:** Active

The spec says "On slow path (new session), increment." There is a theoretical edge case where multiple slow-path calls happen before postToolUse creates a session, which could double-increment.

**Decision:** Unconditional increment. In practice, edge case is rare: postToolUse fires immediately after preToolUse.

**Alternative Considered:** Add a one-shot guard. Rejected for complexity — the counter is used for deferral cooldown, which tolerates ±1 inaccuracy.

**Impact:** Session counter may be ±1 inaccurate in rare cases. Negligible effect on deferral cooldown behavior.

---
**Phase:** 7A — Data Foundation

When checking drift on a path that isn't tracked, `detectDrift()` returns `undefined` rather than throwing an error.

**Rationale:**
- Consistent with existing `getPrescription()` / `getManagedArtifact()` patterns in codebase.
- Callers can distinguish three cases:
  - `undefined` → path not tracked
  - `{ drifted: false }` → tracked, no drift detected
  - `{ drifted: true }` → tracked, content changed

**Impact:** Phase 7E (Apply Engine) should check for `undefined` before acting on drift results.
- Each sidecar file is wholly owned by Prescriber — safe to overwrite/delete
- Multiple prescriptions to same scope append sections to same sidecar file

Sidecar file format:
```markdown
<!-- Managed by Cairn Prescriber. Do not edit manually. -->
<!-- Prescription #{id} — Generated {date} -->

## {Prescription Title}

{Proposed change content}

---
```

#### Checksum Implementation

SHA-256 of file content, stored as hex string. Used for:
- Drift detection before apply (warn if file changed since last write)
- Drift detection on demand (has user manually edited the sidecar?)

#### Test Coverage

**File:** `src/__tests__/applier.test.ts`

- Apply creates sidecar file at correct path
- Apply creates user-scope sidecar in ~/.copilot/
- Apply creates project-scope sidecar in .github/
- Apply stores rollback content
- Apply computes and stores checksum
- Apply tracks in managed_artifacts
- Apply updates prescription status to 'applied'
- Apply fails if prescription not in 'accepted' status
- Rollback restores original content
- Rollback deletes file if no prior content
- Rollback removes managed_artifact entry
- Drift detection: clean (no drift)
- Drift detection: drifted (checksum mismatch)
- Multiple prescriptions append to same sidecar
- Sidecar prefix configurable via preference

### Dogfood Gate

```bash
npm run build && npm run test
# Accept a real prescription → sidecar file appears at correct location
# Content is valid markdown with Prescriber header
# Rollback removes the sidecar file cleanly
# Drift detected after manual edit of sidecar
# managed_artifacts table tracks all Prescriber-written files
```

---

## Phase 7F — MCP Tools + UX + Growth

**Goal:** Register all 4 new MCP tools, modify `run_curate`, and apply Valanice's full UX specification including growth tracking.

**Owner:** Roger (MCP wiring) + Valanice (UX formatting + growth design)  
**Dependencies:** Phase 7C (trigger wiring), Phase 7D (prescription engine), Phase 7E (apply engine)  
**Estimated new tests:** ~20

### Deliverables

#### Tool 1: `list_prescriptions` (read-only)

**File:** `src/mcp/server.ts` (add tool registration)

```typescript
// Zod input schema
{
  status: z.enum([
    'generated', 'accepted', 'rejected', 'deferred',
    'applied', 'failed', 'expired', 'suppressed'
  ]).optional()
    .describe('Filter by lifecycle status. Omit to see all.'),
  limit: z.number().int().min(1).max(50).default(10)
    .describe('Maximum results to return.')
}
```

Response shape:
```json
{
  "counts": { "generated": 3, "applied": 5, "rejected": 1 },
  "prescriptions": [
    {
      "id": 1,
      "title": "...",
      "status": "generated",
      "confidence_level": "high",
      "pattern": "recurring_error",
      "target": "~/.copilot/cairn-prescribed.instructions.md"
    }
  ],
  "proactive_hint": "You have 1 new suggestion ready for review."
}
```

UX notes (DP5):
- `confidence_level` uses words not numbers: "high" (≥0.7), "medium" (0.4–0.7), "emerging" (<0.4)
- `proactive_hint` only included if unviewed generated prescriptions exist
- Max 1 proactive suggestion per session (tracked via session-scoped counter)

Annotations: `{ readOnlyHint: true }`

#### Tool 2: `get_prescription` (read-only)

```typescript
// Zod input schema
{
  prescription_id: z.number().int().positive()
    .describe('The prescription ID to retrieve.')
}
```

Response shape:
```json
{
  "id": 1,
  "title": "Add typecheck guard for recurring type errors",
  "pattern": {
    "type": "recurring_error",
    "insight_title": "Recurring type: Cannot find name 'x'",
    "occurrences": 12,
    "first_seen": "2026-03-28",
    "last_seen": "2026-04-05"
  },
  "observation": "Cairn has noticed type errors recurring 12 times over 8 days.",
  "suggestion": "Add an instruction to always run typecheck before committing.",
  "where": "~/.copilot/cairn-prescribed.instructions.md",
  "confidence_level": "high",
  "diff_preview": "+ ## Typecheck Guard\n+ Always run `npm run typecheck` before committing changes.",
  "actions": ["accept", "reject", "defer"]
}
```

UX notes (DP5):
- `observation` uses observation framing, not judgment (#4)
- `confidence_level` in words, not numbers (#5)
- `diff_preview` shows what will change
- `actions` array reminds the agent what's possible

Annotations: `{ readOnlyHint: true }`

#### Tool 3: `resolve_prescription` (write)

```typescript
// Zod input schema
{
  prescription_id: z.number().int().positive()
    .describe('The prescription to act on.'),
  disposition: z.enum(['accept', 'reject', 'defer'])
    .describe('How to resolve this prescription.'),
  reason: z.string().optional()
    .describe('Optional reason for rejection or deferral.')
}
```

State transitions triggered:
- `accept` → status=accepted → call `applyPrescription()` → applied/failed
- `reject` → status=rejected, reason stored (terminal)
- `defer` → status=deferred, `defer_count++`, set `defer_until_session`
  - If `defer_count >= suppress_threshold`: auto-suppress, return notice

Response shape:
```json
{
  "prescription_id": 1,
  "disposition": "accept",
  "result": "applied",
  "message": "✅ Applied to ~/.copilot/cairn-prescribed.instructions.md",
  "rollback_available": true
}
```

UX notes (DP5):
- Rejection is the easiest action — just `disposition: "reject"` with no required fields (#1)
- Acceptance requires explicit confirmation via `disposition: "accept"` (#1)
- On 3rd deferral: "This is the 3rd time this has been deferred. Should I stop asking about this pattern?" (#8)

Annotations: `{ readOnlyHint: false }`

#### Tool 4: `show_growth` (read-only)

```typescript
// Zod input schema
{
  // No required inputs — shows overall growth summary
}
```

Response shape:
```json
{
  "summary": "Over 15 sessions, Cairn has helped resolve 3 recurring patterns.",
  "resolved_patterns": [
    "Recurring build errors — resolved after adding typecheck guard",
    "Skipped test step — resolved after adjusting timing"
  ],
  "active_patterns": [
    "Recurring lint errors — 1 suggestion pending"
  ],
  "stats": {
    "total_prescriptions": 8,
    "accepted": 5,
    "applied": 4,
    "rejected": 2,
    "deferred": 1,
    "acceptance_rate_display": "5 of 7 resolved"
  },
  "trend": "You're catching patterns faster — 2 resolved this week vs 1 last week."
}
```

UX notes (DP5):
- No streaks, lead with wins (#7)
- Growth framing: cumulative trends, resolved patterns first
- `acceptance_rate_display` uses natural language, not percentages
- `trend` is observational, not judgmental

Annotations: `{ readOnlyHint: true }`

#### `run_curate` Modification

Extend existing tool to return prescription info when insights change (already wired in Phase 7C). Add to tool description:

```
'Also generates new prescriptions when insights are created or reinforced. '
'Returns combined curation and prescription results.'
```

#### MCP Tool Description Standards (DP5)

All tool descriptions include:
- When to call the tool (timing guidance)
- "Present after first success, not at the door" (#3) encoded as: tools describe themselves as "for reviewing improvement suggestions" not "for fixing problems"

#### Test Coverage

**File:** `src/__tests__/mcp.test.ts` (add tests for new tools)

- list_prescriptions returns filtered results
- list_prescriptions with no filter returns all
- list_prescriptions includes confidence in words
- list_prescriptions includes proactive hint when prescriptions pending
- list_prescriptions omits proactive hint when already shown this session
- get_prescription returns full detail with insight context
- get_prescription includes diff preview
- get_prescription returns observation framing (not judgment)
- get_prescription returns error for nonexistent ID
- resolve_prescription accept → applies prescription
- resolve_prescription reject → records reason
- resolve_prescription defer → increments counter, sets cooldown
- resolve_prescription defer × 3 → auto-suppression notice
- resolve_prescription invalid disposition → error
- show_growth returns cumulative stats
- show_growth leads with resolved patterns
- show_growth uses natural language for rates
- run_curate chains prescribe when insights change
- run_curate does not chain prescribe when no changes
- All new tools have correct readOnlyHint annotations

### Dogfood Gate

```bash
npm run build && npm run test && npm run lint
# MCP server starts with 10 tools (6 existing + 4 new)
# list_prescriptions shows Aaron's pending prescriptions
# get_prescription shows observation-framed detail with diff preview
# resolve_prescription accept → sidecar file created
# resolve_prescription reject → terminal, reason stored
# resolve_prescription defer × 3 → suppression notice
# show_growth shows cumulative resolved patterns
# run_curate → curate + prescribe chained
# All 10 UX principles verifiable in tool output
```

---

## Consolidated File Manifest

### New Files (15)

| Phase | File | Description |
|-------|------|-------------|
| 7A | `src/db/migrations/005-prescriptions.ts` | prescriptions + prescriber_state + topology_cache tables |
| 7A | `src/db/migrations/006-managed-artifacts.ts` | managed_artifacts table |
| 7A | `src/db/prescriptions.ts` | Prescriptions DAL |
| 7A | `src/db/managedArtifacts.ts` | Managed artifacts DAL |
| 7A | `src/__tests__/prescriptions.test.ts` | Data layer tests |
| 7B | `src/agents/discovery.ts` | 4-phase artifact scanner |
| 7B | `src/db/topologyCache.ts` | Topology cache DAL |
| 7B | `src/__tests__/discovery.test.ts` | Scanner tests |
| 7C | *(no new files — modifications only)* | |
| 7D | `src/agents/prescriber.ts` | Core prescription engine |
| 7D | `src/__tests__/prescriber.test.ts` | Prescription engine tests |
| 7E | `src/agents/applier.ts` | Apply + rollback engine |
| 7E | `src/__tests__/applier.test.ts` | Applier tests |
| 7F | *(no new files — modifications only)* | |

### Modified Files (7)

| Phase | File | Change |
|-------|------|--------|
| 7A | `src/types/index.ts` | Add Prescriber types (8-state, topology, growth) |
| 7A | `src/db/schema.ts` | Register migrations 005 + 006 |
| 7C | `src/agents/curator.ts` | Add 3s time cap, return insightsChanged flag |
| 7C | `src/hooks/sessionStart.ts` | Chain prescribe() after curate, increment session counter |
| 7C | `src/mcp/server.ts` | Extend run_curate to chain prescribe() |
| 7F | `src/mcp/server.ts` | Register 4 new tools |
| 7F | `src/__tests__/mcp.test.ts` | Tests for new MCP tools |

---

## 2026-04-07: Decision — Copilot SDK Spike Scope

**Author:** Graham (Lead / Architect)  
**Date:** 2026-04-07  
**Status:** Approved (Aaron chose Option C — "Spike First")  
**Branch:** `squad/copilot-sdk-spike`

### Context

Aaron reviewed three architecture options from the brainstorm session:
- **Option A:** Cairn absorbs compiler responsibilities
- **Option B:** Build Forge immediately as a separate project
- **Option C:** Spike first — time-boxed investigation before committing

Aaron chose **Option C**. Roger's finding that the SDK already emits
`assistant.usage` events with model, tokens, latency, cache metrics, and
billing multiplier validates that the SDK has real observability surface area.

### Decision

Time-boxed 3-day spike to evaluate `@github/copilot-sdk` as Forge's runtime
foundation. Spike answers 8 technical questions covering session management,
tool interception, decision gates, event taxonomy, Cairn bridge, stability,
model/token control, and end-to-end integration.

### Key Commitments

1. **Cairn = APM (debugger). Forge = Runtime (compiler).** Neither absorbs the other.
2. **Monorepo with shared types** (`@cairn/types`, `@cairn/cairn`, `@cairn/forge`).
3. **Spike first, then sister squad.** No Forge chartering until spike concludes.
4. **Circuit breaker:** If Q1 (session management) = ❌ on Day 1, stop early.

### Trade-offs

| Choice | Upside | Downside |
|--------|--------|----------|
| Spike before committing | Low cost to learn; avoids premature architecture | Delays Forge start by ~3 days |
| SDK as foundation (if go) | Real runtime, maintained by GitHub, embeds agentic patterns | Technical Preview — API instability risk |
| Monorepo | Atomic type changes, shared CI | Repo complexity, tooling overhead |

### Artifacts

- Spike scope document: `docs/spikes/copilot-sdk-spike.md`
- Spike code (temporary): `src/spike/` (excluded from build)
- Spike report: updates to scope document with findings

### Go/No-Go Threshold

**Go** if Q1 + Q2 + Q4 + Q5 = ✅ (core loop works).  
Q3 and Q7 can be ⚠️.  
Only Q1 = ❌ is a hard no-go.

---

## 2026-04-07: SDK Spike Findings — Proceeding with Harness Development

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-04-07  
**Type:** Technical spike results  
**Urgency:** Normal — informational, no blocking decisions

### What I Found

The `@github/copilot-sdk` (v0.2.2) is published, installable, well-typed, and comprehensive. 86 event types, 6 bi-directional hooks, full session management, BYOK support, built-in OpenTelemetry.

### Key Discovery: `assistant.usage` Is Better Than Expected

The `assistant.usage` event gives us:
- **Token counts:** input, output, cache read/write
- **Actual billing cost:** `copilotUsage.totalNanoAiu` (nano AI Units — not estimates)
- **Latency metrics:** duration, TTFT, inter-token latency
- **Quota tracking:** entitlement snapshots with remaining percentage
- **Sub-agent attribution:** `parentToolCallId` and `initiator` fields

This is everything we'd need for cost tracking without any estimation or scraping.

### Integration Effort

| Component | LOC | Time |
|-----------|-----|------|
| Event bridge adapter | ~50 | Hours |
| Harness bootstrap | ~80 | Hours |
| New Cairn event types | ~30 | Hours |
| Cost summary in curator | ~100 | 1 day |
| Tests | ~150 | 1 day |
| **Total** | **~410** | **2-3 days** |

### What This Changes

1. **Token cost tracking is solvable now.** No need to wait for custom telemetry — the SDK emits exactly what we need.
2. **Hooks become richer.** SDK hooks can *modify* behavior (args, permissions, results), not just observe. Cairn's stdin hooks are observe-only.
3. **The harness IS the integration.** Instead of bolting Cairn onto the CLI, the harness embeds both the SDK and Cairn in one process. In-process event bridge, no IPC overhead.

### Risk

SDK is Technical Preview. 52 versions in ~3 months = frequent churn. Mitigations:
- Pin version, don't auto-upgrade
- Abstract behind our own event types (bridge adapter is the seam)
- Keep existing stdin hooks working for non-harness users

### Recommendation

Proceed with harness development. The SDK is ready enough to build on, and the event system maps cleanly to Cairn's architecture. Biggest open question: do we want the harness to *replace* the Copilot CLI, or wrap it? The SDK supports both patterns (spawn vs connect to existing).

Full spike document: `docs/spikes/copilot-sdk-exploration.md`

### Summary

- **15 new files** (7 source, 1 cache DAL, 2 migrations, 5 test files)
- **7 modified files**
- **~115 new tests** (→ ~250 total from 134 baseline)
- **4 new MCP tools** (→ 10 total from 6)
- **2 new migrations** (→ 6 total from 4)

---

## Final Data Model — CREATE TABLE Statements

All tables, incorporating all 6 decisions:

### prescriptions (Migration 005)

```sql
CREATE TABLE prescriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Source: which insight spawned this
  insight_id INTEGER NOT NULL REFERENCES insights(id),
  pattern_type TEXT NOT NULL,

  -- Content
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  proposed_change TEXT NOT NULL,
  target_path TEXT,
  artifact_type TEXT,
  artifact_scope TEXT CHECK (artifact_scope IN ('user', 'project', 'plugin')),

  -- DP2: 8-state lifecycle
  status TEXT NOT NULL DEFAULT 'generated'
    CHECK (status IN (
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    )),

  -- DP5 #9: Priority scoring
  confidence REAL NOT NULL DEFAULT 0.0
    CHECK (confidence >= 0.0 AND confidence <= 1.0),
  priority_score REAL NOT NULL DEFAULT 0.0,
  recency_weight REAL NOT NULL DEFAULT 1.0,
  availability_factor REAL NOT NULL DEFAULT 1.0,

  -- Disposition
  disposition_reason TEXT,
  defer_count INTEGER NOT NULL DEFAULT 0,
  defer_until_session INTEGER,

  -- Timestamps
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT,
  applied_at TEXT,
  expires_at TEXT
);

CREATE INDEX idx_prescriptions_status ON prescriptions(status);
CREATE INDEX idx_prescriptions_insight ON prescriptions(insight_id);
CREATE INDEX idx_prescriptions_priority ON prescriptions(status, priority_score DESC);
```

### prescriber_state (Migration 005)

```sql
CREATE TABLE prescriber_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_generated_at TEXT,
  pending_count INTEGER NOT NULL DEFAULT 0,
  sessions_since_install INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO prescriber_state (id) VALUES (1);
```

### topology_cache (Migration 005)

```sql
CREATE TABLE topology_cache (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  topology_json TEXT NOT NULL DEFAULT '{}',
  scanned_at TEXT NOT NULL DEFAULT (datetime('now')),
  scan_duration_ms INTEGER NOT NULL DEFAULT 0
);
```

### managed_artifacts (Migration 006)

```sql
CREATE TABLE managed_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  logical_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('user', 'project', 'plugin')),
  prescription_id INTEGER NOT NULL REFERENCES prescriptions(id),
  original_checksum TEXT,
  current_checksum TEXT,
  rollback_content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_managed_artifacts_path ON managed_artifacts(path);
CREATE INDEX idx_managed_artifacts_prescription ON managed_artifacts(prescription_id);
```

---

## Final Type Definitions

```typescript
// ---------------------------------------------------------------------------
// Prescriber types (Phase 7) — append to src/types/index.ts
// ---------------------------------------------------------------------------

/** DP2: 8-state prescription lifecycle */
export type PrescriptionStatus =
  | 'generated'
  | 'accepted'
  | 'rejected'
  | 'deferred'
  | 'applied'
  | 'failed'
  | 'expired'
  | 'suppressed';

/** DP3: Disposition actions for resolve_prescription */
export type PrescriptionDisposition = 'accept' | 'reject' | 'defer';

/** Artifact types discovered by the scanner */
export type ArtifactType =
  | 'instruction'
  | 'agent'
  | 'skill'
  | 'hook'
  | 'mcp_server'
  | 'plugin_manifest'
  | 'command';

/** Scope of an artifact in the CLI topology */
export type ArtifactScope = 'user' | 'project' | 'plugin';

/** Resolution strategy per artifact type */
export type ResolutionRule = 'additive' | 'first_found' | 'last_wins';

/** A prescription generated from a Curator insight */
export interface Prescription {
  id: number;
  insightId: number;
  patternType: PatternType;
  title: string;
  rationale: string;
  proposedChange: string;
  targetPath?: string;
  artifactType?: ArtifactType;
  artifactScope?: ArtifactScope;
  status: PrescriptionStatus;
  confidence: number;
  priorityScore: number;
  recencyWeight: number;
  availabilityFactor: number;
  dispositionReason?: string;
  deferCount: number;
  deferUntilSession?: number;
  generatedAt: string;
  resolvedAt?: string;
  appliedAt?: string;
  expiresAt?: string;
}

/** DP6: A file managed by the Prescriber */
export interface ManagedArtifact {
  id: number;
  path: string;
  artifactType: ArtifactType;
  logicalId?: string;
  scope: ArtifactScope;
  prescriptionId: number;
  originalChecksum?: string;
  currentChecksum?: string;
  rollbackContent?: string;
  createdAt: string;
  updatedAt: string;
}

/** DP4: A discovered artifact in the CLI topology */
export interface DiscoveredArtifact {
  path: string;
  artifactType: ArtifactType;
  scope: ArtifactScope;
  logicalId: string;
  ownerPlugin?: string;
  checksum: string;
  lastModified: number;
  resolutionRule: ResolutionRule;
}

/** Conflict between artifacts with the same logical identity */
export interface ArtifactConflict {
  logicalId: string;
  artifactType: ArtifactType;
  artifacts: DiscoveredArtifact[];
}

/** DP4: Complete snapshot of the CLI artifact topology */
export interface ArtifactTopology {
  artifacts: DiscoveredArtifact[];
  conflicts: ArtifactConflict[];
  scannedAt: string;
  scanDurationMs: number;
}

/** DP5: Growth tracking summary */
export interface GrowthSummary {
  totalPrescriptions: number;
  accepted: number;
  rejected: number;
  deferred: number;
  applied: number;
  failed: number;
  acceptanceRate: number;
  resolvedPatterns: string[];
  activePatterns: string[];
  trend: 'improving' | 'stable' | 'declining';
}
```

---

## Final MCP Tool Specifications

### 10 tools total (6 existing + 4 new)

#### Existing Tools (unchanged except run_curate)

1. `get_status` — Session + curator health
2. `list_insights` — Pattern-based insights
3. `get_session` — Session detail
4. `search_events` — Event search by type pattern
5. `check_event` — Boolean event occurrence check
6. `run_curate` — **MODIFIED** (chains prescribe per DP1)

#### New Tool: `list_prescriptions`

```typescript
server.registerTool('list_prescriptions', {
  title: 'List Prescriptions',
  description:
    'List improvement suggestions the Prescriber has generated from detected patterns. ' +
    'Filter by lifecycle status or see all. Each result includes confidence level in plain ' +
    'language and a hint about pending suggestions worth reviewing. ' +
    'Use this after completing a task to check for improvement opportunities.',
  inputSchema: {
    status: z.enum([
      'generated', 'accepted', 'rejected', 'deferred',
      'applied', 'failed', 'expired', 'suppressed'
    ]).optional()
      .describe('Filter by lifecycle status. Omit to return all statuses.'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results to return (default 10).'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `get_prescription`

```typescript
server.registerTool('get_prescription', {
  title: 'Get Prescription',
  description:
    'Get full detail about a specific improvement suggestion, including the pattern ' +
    'that triggered it, what Cairn observed, the suggested change, where it would be ' +
    'applied, and a diff preview. Use this to understand a suggestion before deciding.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription ID to retrieve.'),
  },
  annotations: { readOnlyHint: true },
}, handler);
```

#### New Tool: `resolve_prescription`

```typescript
server.registerTool('resolve_prescription', {
  title: 'Resolve Prescription',
  description:
    'Act on an improvement suggestion: accept (applies the change), reject (dismisses ' +
    'permanently), or defer (revisit later). Rejection is the simplest action — no reason ' +
    'required. Acceptance applies the change to a sidecar instruction file. ' +
    'Deferral sets a cooldown before the suggestion resurfaces.',
  inputSchema: {
    prescription_id: z.number().int().positive()
      .describe('The prescription to act on.'),
    disposition: z.enum(['accept', 'reject', 'defer'])
      .describe('How to resolve: accept (apply change), reject (dismiss), defer (revisit later).'),
    reason: z.string().optional()
      .describe('Optional reason for rejection or deferral. Helps Cairn learn preferences.'),
  },
  annotations: { readOnlyHint: false },
}, handler);
```

#### New Tool: `show_growth`

```typescript
server.registerTool('show_growth', {
  title: 'Show Growth',
  description:
    'See a summary of patterns Cairn has helped resolve and overall improvement trends. ' +
    'Leads with wins — shows resolved patterns first, then active ones. ' +
    'Uses natural language, not percentages. Use this to reflect on progress.',
  annotations: { readOnlyHint: true },
}, handler);
```

#### Modified Tool: `run_curate` (DP1)

Updated description:
```typescript
description:
  'Trigger the curator to process unprocessed events and discover patterns. ' +
  'The curator scans the event stream for recurring errors, error sequences, ' +
  'and skip frequency, then creates or reinforces insights with prescriptions. ' +
  'Also generates new improvement suggestions when insights are created or reinforced. ' +
  'Returns the number of events processed, insights discovered, and any new suggestions. ' +
  'Use this when you want fresh analysis of recent activity.',
```

---

## Dependency Graph

```
7A ─────────────────────────────────────────────────┐
│                                                    │
├──→ 7B (Artifact Discovery) ──┬──→ 7D (Prescription Engine) ──┐
│                               │                                │
├──→ 7C (Infrastructure) ──────┤──→ 7E (Apply Engine) ──────────┤
│                               │                                │
└───────────────────────────────┘               7F (MCP + UX) ◄─┘
```

- **7A** has no dependencies (foundation)
- **7B, 7C** depend only on 7A (can run in parallel)
- **7D, 7E** depend on 7A + 7B (can run in parallel after 7B)
- **7F** depends on 7C + 7D + 7E (final integration phase)

**Critical path:** 7A → 7B → 7D → 7F  
**Parallel opportunities:** 7B ∥ 7C, then 7D ∥ 7E

---

## Execution Schedule

| Phase | Owner | Depends On | Parallel With | Est. New Tests |
|-------|-------|------------|---------------|----------------|
| 7A | Roger | — | — | ~25 |
| 7B | Rosella | 7A | 7C | ~20 |
| 7C | Gabriel | 7A | 7B | ~10 |
| 7D | Roger | 7A, 7B | 7E | ~25 |
| 7E | Rosella | 7A, 7B | 7D | ~15 |
| 7F | Roger + Valanice | 7C, 7D, 7E | — | ~20 |
| **Total** | | | | **~115** |

**Final test count target:** ~250 (134 existing + ~115 new)

---

## Acceptance Criteria

The Prescriber is complete when:

1. ✅ `run_curate` chains `prescribe()` automatically when insights change
2. ✅ `preToolUse` chains `prescribe()` at session start when insights change
3. ✅ `curate()` respects 3-second time budget
4. ✅ 8-state lifecycle enforced in DB and code
5. ✅ 4 new MCP tools registered and functional
6. ✅ Full 4-phase artifact scanner with 5-minute SQLite cache
7. ✅ All 10 UX principles verifiable in tool output
8. ✅ Sidecar instruction files written (not user-owned files modified)
9. ✅ managed_artifacts tracks all Prescriber-written files
10. ✅ Rollback capability functional
11. ✅ Drift detection via checksum comparison
12. ✅ 7 preference keys configurable
13. ✅ Deferral cooldown (3 sessions default)
14. ✅ Auto-suppression after 3 deferrals
15. ✅ Growth tracking via `show_growth`
16. ✅ All existing 134 tests still pass
17. ✅ ~115 new tests pass
18. ✅ Clean build, clean lint
19. ✅ Dogfooded: Aaron has accepted ≥1 real prescription


---

## Phase 7D Decisions — Roger

### recencyWeight Capped at 1.0

The spec formula Math.max(0.5, 1.0 - (sessionsAgo - 5) * (0.5 / 15)) produces values >1.0 when sessionsAgo < 5. Added Math.min(1.0, ...) to match the spec description "1.0 within 5 sessions, decays to 0.5 by 20 sessions."

**Impact:** Priority scores are bounded [0, 1.0] as expected. No bonus for very recent insights.

### Event Logging is Fail-Soft

logEvent() requires a FK-valid session ID. The prescriber looks up the most recent active session from the DB. If none exists (e.g., during sessionStart before the new session is created), event logging is silently skipped.

**Rationale:** Prescriber runs in two contexts: (1) sessionStart (before new session exists) and (2) MCP run_curate (session may exist). Logging is informational, not critical. Fail-soft is consistent with the project's fail-open philosophy.

**Impact:** Phase 7F tools that read prescription events should be aware that some prescription_generated events may be missing for prescriptions generated during session startup.

### shouldResurface Compensates for Session Counter Timing

incrementSessionCounter() runs AFTER prescribe() in sessionStart.ts. The shouldResurface() function uses currentSession + 1 >= deferUntilSession to compensate, so deferral cooldowns are honored correctly.

**Impact:** Deferral cooldowns are accurate. Phase 7F should use the same shouldResurface() function if needed.

### Rejected Prescriptions Block Re-Prescription

'rejected' is added to the set of statuses that prevent generating a new prescription from the same insight. An insight with a rejected prescription won't be re-prescribed until the rejected prescription is manually expired or the insight itself changes.

**Rationale:** Rejected is terminal per the spec. Without this, rejected insights would get re-prescribed on every prescribe() run, spamming the user.

**Impact:** If a user rejects a prescription but later wants to reconsider, they'll need to explicitly re-enable (possibly via unsuppress or manual expiration in Phase 7F).

### checkAutoSuppress Exported for Phase 7F

The auto-suppression check (deferCount >= threshold → suppress) is exported as checkAutoSuppress(prescriptionId, deferCount). Phase 7F's resolve_prescription MCP tool should call this after each deferral.

**Impact:** Phase 7F must call checkAutoSuppress() after deferPrescription() in the defer flow.

---

## Phase 7E Decisions — Rosella

### LIFO Rollback for Multi-Prescription Sidecars

**Context:** managed_artifacts has UNIQUE(path). Multiple prescriptions can append to the same sidecar file, but only one row can exist per path.

**Decision:** When appending, remove the old managed_artifact row and re-track with the latest prescription's ID. Rollback only supports the latest writer (LIFO). Rolling back a middle prescription in a multi-append stack is not supported in this phase.

**Rationale:** The existing schema supports this cleanly. Full multi-level undo would require a separate history table — overkill for Phase 7E scope. If needed later, we add a managed_artifact_history table.

### File-Based Drift Detection

**Context:** The DAL's detectDrift() compares original_checksum vs current_checksum in the DB only — it doesn't read disk.

**Decision:** checkDrift() in applier.ts reads the actual file, computes SHA-256, and compares to stored current_checksum. This is the on-disk drift check. The DAL function is for DB-internal consistency.

**Rationale:** Users need to know if someone hand-edited the sidecar file. That requires a disk read, not a DB lookup.

### Apply Blocks on Drift

**Context:** Should pplyPrescription proceed if the sidecar has drifted since last write?

**Decision:** Block with error. The user must resolve drift before new content is applied.

**Rationale:** Silently overwriting user edits violates the "safe defaults" principle from DP6. The user should explicitly acknowledge changes before Cairn writes again.

---

## Phase 8D — Skill Test Harness

### 2026-04-15T23-17-39: Phase 8D Design Decisions — Skill Test Harness

**Author:** Aaron (via Copilot)  
**Type:** Architecture  
**Status:** Active

**Decisions:**

1. **YAML parser:** Use `yaml` npm package for scenario files (not custom parser)
2. **Thresholds:** Configurable with sensible defaults in YAML scenarios
3. **MCP tool:** Single `test_skill` tool with optional `scenario_path` parameter
4. **Dogfooding:** Yes — validate Cairn's own generated prescription sidecars as test fixtures
5. **Overall architecture:** Approved — 3-tier (deterministic → LLM-as-judge → simulation), separate `skillValidator.ts` module, YAML expectations + DB results hybrid

**Rationale:** Aaron approved Graham's design proposal. Build Tier 1 in Phase 8D, design interface for Tier 2/3 but defer implementation until Copilot SDK lands.

---

### 2026-04-07: Phase 8D Architectural Design — Graham Knight

**Author:** Graham Knight (Lead/Architect)  
**Type:** Architecture  
**Status:** Approved

**Executive Summary:**

The linter validates *structure*. The test harness validates *behavior* — the 5 C's (Clarity, Completeness, Concreteness, Consistency, Containment). The architectural challenge: skills are instruction documents, not programs. You can't "run" them. The harness must validate content quality through a tiered strategy that starts deterministic and grows into LLM-as-judge.

**Key Design Decisions:**

1. **Test Scenarios:** YAML format (Option B) with TypeScript execution engine
   - Scenarios are declarative data, executable by both Vitest and MCP tools
   - Clean separation: YAML = what to test, TS = how to test
   
2. **Tier 1 Implementation:** 12-15 deterministic rules across 5 C's vectors
   - CLARITY: no-hedge-words, no-vague-refs, imperative-voice, sentence-length
   - COMPLETENESS: tools-referenced, context-patterns-flow, section-depth, missing-examples
   - CONCRETENESS: actionable-verbs, has-specifics, no-abstractions
   - CONSISTENCY: domain-content-match, tool-section-agreement, name-heading-match, no-contradictions
   - CONTAINMENT: scope-bounded, tool-scope
   
3. **Data Persistence:** Hybrid approach (Option D)
   - **Expectations** in git-versioned YAML (reviewed in PRs)
   - **Results** in SQLite DB (historical, queryable, trend-capable)
   - New table: skill_test_results (migration 009)
   
4. **Validator Architecture:** Option B — Separate content analysis engine
   - New module `skillValidator.ts` with pure rule functions
   - Unified interface: `(skill: ParsedSkill) => ValidationResult[]`
   - Same pattern as linter — composable, extensible rules
   
5. **Tiered Roadmap:**
   - **Phase 8D:** Tier 1 deterministic rules, YAML scenarios, DB persistence, test_skill MCP tool
   - **Phase 8E (future):** Tier 2 LLM-as-judge rules (same interface, async evaluate)
   - **Phase 8F (future):** Tier 3 simulation (full agent loop with skill loaded)

**Why Deterministic First?**

- Deterministic checks are CI-safe — identical results, zero cost, repeatable
- LLM checks are advisory only — non-deterministic results can't gate CI
- Heuristics catch ~70% of quality issues
- Interface identical across all tiers — Tier 2/3 just extend rule registry

**Rationale:**

Three-tier architecture is architecturally correct even without LLM access. Separation of concerns between linter (structure) and validator (quality) enables both to evolve independently. YAML + DB hybrid enables portable, reviewable expectations plus rich, historical result analysis.

**Files Affected:**

- New: `src/agents/skillValidator.ts` (rule implementations)
- New: `src/db/migrations/009-skill-test-results.ts`
- New: `src/db/skillTestResults.ts` (CRUD module)
- New: `src/agents/skillTestHarness.ts` (scenario orchestrator)
- Modified: `src/mcp/server.ts` (add test_skill tool)
- Modified: `src/types/index.ts` (add QualityVector, ValidationResult types)
- Fixtures: 5+ skill test fixture directories with SKILL.md + YAML scenarios

---

### 2026-04-06: Skill Validator Heuristic Thresholds — Roger Wilco

**Author:** Roger Wilco (Platform Dev)  
**Type:** Implementation  
**Status:** Approved

**Context:**

Phase 8D Skill Validator implements 14 Tier 1 deterministic rules across the 5 C's. Two heuristic thresholds were calibrated during implementation.

**Decisions Made:**

**1. `context-patterns-flow` uses 0.25 threshold (not default 0.5)**

Context and Patterns serve different purposes — Context sets up "when/why", Patterns gives "how". Expecting 50% keyword overlap is unrealistic. A well-authored skill with 8 Context terms might only repeat 2-3 in Patterns. Stem matching (first 4 chars) + minimum word length of 6 + expanded stopwords get it to a reasonable signal-to-noise ratio.

**2. `scope-bounded` flags zero-domain-count as score 0.0**

When a skill declares domain "testing" but the body never mentions "testing" while "security" appears 6 times, domainCount=0 is worse than domainCount < otherCount. The original code required `domainCount > 0` to fire, silently passing when the declared domain was completely absent. Now: domainCount=0 yields score 0.0.

**Trade-offs:**

- Stem matching is crude (4-char prefix) — may produce false positives ("construct" matching "configure" both start with "con"). Acceptable for Tier 1 heuristics.
- The KNOWN_DOMAINS list in scope-bounded is static. New domains need manual addition.
- These thresholds work well on the test fixtures but haven't been validated against a large corpus of real SKILL.md files.

**Test Coverage:**

- `src/__tests__/skillValidator.test.ts` — 41 tests across 10 fixtures
- Validates all 14 rules with diverse skill examples

**Key Files:**

- `src/agents/skillValidator.ts` — Rule implementations and RULES registry
- `src/__tests__/skillValidator.test.ts` — 41 tests, 10 fixtures
- `src/types/index.ts` — QualityVector, ValidationResult, ValidatorRule types

**Impact:**

These calibrations ensure Tier 1 validators reliably detect actual quality issues without false negatives (missing real problems) or excessive false positives (flagging minor variations as failures).

---

## Proposed Decisions (Brainstorm Session 2026-04-23)

Session: `.squad/log/2026-04-23T06-10-00Z-brainstorm-session.md`

These are brainstorm outputs from parallel agent analysis of 9 ideas for Cairn future. Not binding decisions — open for team discussion and refinement.

### PROPOSED: Cairn as Runtime + Debugger in Compiler Metaphor

**Author:** Graham Knight (Lead / Architect)  
**Type:** Architecture  
**Status:** Proposed (Brainstorm 2026-04-23)  
**Source:** `.squad/decisions/inbox/graham-brainstorm-vision.md`

**Proposal:** Formalize Cairn's boundary as "runtime instrumentation + debugger" within the compiler metaphor:
- **Archivist** = trace/debug symbol emitter
- **Curator** = static analyzer / linter (post-hoc pattern detection)
- **Prescriber** = auto-fix / code action provider

Cairn is NOT the compiler (LLM + harness is). This framing clarifies ownership: we own observability, analysis, and correction — not execution or behavior direction.

**Rationale:** Clarifies architectural boundaries, guides future feature decisions, distinguishes what Cairn owns from what it doesn't.

**Next Step:** Formalize in architecture documentation if approved.

---

### PROPOSED: Decision Chain Data Model (Content-Addressable Audit Trail)

**Author:** Graham Knight (Lead / Architect)  
**Type:** Architecture  
**Status:** Proposed (Brainstorm 2026-04-23)  
**Source:** `.squad/decisions/inbox/graham-brainstorm-vision.md`

**Proposal:** Create formalized `decisions` table as first-class chain:

```
Decision {
  id: hash(parent_id + content + timestamp)  // content-addressable
  parent_id: Decision.id | null              // chain link
  session_id: Session.id
  decision_type: 'insight' | 'prescription' | 'disposition' | 'override'
  actor: 'curator' | 'prescriber' | 'human'
  content: string
  alternatives_considered: string[]
  confidence: number
  created_at: timestamp
}
```

Content-addressable IDs (like git SHA) create immutable audit trail. Parent-child linking enables decision chains. Actor field distinguishes human vs. automated decisions.

**Trade-off:** New table increases schema complexity. Worth it — decisions are highest-value signal.

**Recommendation:** Candidate for Phase 9. Discuss with team. If approved, Graham to design schema and migration strategy.

**Next Step:** Team discussion on priority and scope if approved.

---

### PROPOSED: Platform Feasibility Analysis — Sensory Pervasion & Signal Expansion

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical Analysis  
**Status:** Proposed (Brainstorm 2026-04-23)  
**Source:** `.squad/decisions/inbox/roger-brainstorm-platform.md`

**Proposal:** Platform is ready for signal expansion today:
- `event_log` table is schemaless append-only (event_type + JSON payload)
- New event types require zero schema migration
- Curator pattern detection already handles new event types via reflection

**Tier 1 Signals (Ready Now):**
- model_call events (tracks which model, tokens, latency)
- tool_selection events (decision path, confidence scores)
- error_recovery events (automated corrections, success rates)

**Tier 2 Signals (Data Pipeline Problem):**
- Token cost tracking (requires harness instrumentation not yet exposed)
- Quality scoring (Curator evolution, not new infrastructure)

**Recommendation:** Start Tier 1 signal expansion immediately. Coordinate token cost with platform team as separate initiative.

**Next Step:** Roger to scope Tier 1 event types for immediate implementation.

---

### PROPOSED: LX Design Principles — Nielsen-Parallel Heuristics for LLM Interfaces

**Author:** Valanice (UX / Human Factors)  
**Type:** Design Framework  
**Status:** Proposed (Brainstorm 2026-04-23)  
**Source:** `.squad/decisions/inbox/valanice-brainstorm-lx.md`

**Proposal:** Apply traditional UX design principles to LLM-facing harness. Structural parallels:
- **Context window** = working memory (Miller's Law)
- **Attention decay** = transformer attention score decay with token distance
- **Tool selection ambiguity** = Fitts's Law analog (more tools = worse selection)

**10 LX Heuristics (Parallel to Nielsen's 10):**
1. Visibility of System State (get_status pull-based, not push-based)
2. Match with Mental Model (verb_noun naming conventions)
3. Error Prevention (Zod schema validation)
4. Consistency (verb_noun enforced across tools)
5. Recognition over Recall (tool descriptions, not IDs)
6. Flexibility & Efficiency (multiple query methods)
7. Progressive Disclosure (tiered detail levels in responses)
8. Help & Documentation (parameter descriptions as form labels)
9. Undo/Redo (rollback capability for Prescriber)
10. Aesthetic & Minimalist Design (tool count ≤ 12 for LLM sanity)

**Cairn Compliance:** Already implements LX-1 (get_status), LX-2 (verb_noun), LX-3 (Zod), LX-5 (tool descriptions).

**Recommendation:** Adopt LX checklist as design evaluation framework for all future MCP tools. Non-blocking design gate.

**Decision Altitude Taxonomy (Bonus):** Policy (affects all agents) > Framework (affects multiple) > Local (single decision).

**Slop Reframe:** Quality issues are upstream failures, not downstream detection problems.

**Next Step:** Integrate LX checklist into feature design template if approved.

---

### PROPOSED: Extensibility Analysis — OOP Type Hierarchy for Agentic Primitives

**Author:** Rosella Chen (Plugin Dev)  
**Type:** Architecture  
**Status:** Proposed (Brainstorm 2026-04-23)  
**Source:** `.squad/decisions/inbox/rosella-brainstorm-extensibility.md`

**Proposal:** Unify Cairn's extensible components under `AgenticPrimitive` base class:

```
interface AgenticPrimitive {
  name: string
  type: PrimitiveType
  status: 'draft' | 'active' | 'deprecated' | 'retired'
  confidence: number          // 0.0–1.0
  createdBy: string           // agent name or 'human'
  createdFrom?: string        // parent primitive ID
  rationale?: string
  scope: ArtifactScope        // user | project | plugin
  resolutionRule: ResolutionRule  // additive | first_found | last_wins
}
```

Four Primitive Families:
1. **Agents** (Archivist, Curator, Prescriber, future agents)
2. **Skills** (ParsedSkill AST with type annotations)
3. **Validators** (ValidatorRule interface with execution contracts)
4. **Hooks** (Plugin lifecycle hooks with resolution rules)

**Agent Factory Pattern:** Enable agent-authored agents via factory, extending Prescriber model.

**Compiler-Informed Architecture:** Standard libraries, packages, linker semantics for composition.

**Current State:** ParsedSkill, ValidatorRule, Prescription, DiscoveredArtifact are already OOP patterns. Analysis formalizes and names them.

**Recommendation:** Formalize without rushing. Let emerge from observed needs. No immediate changes — informational for future architects.

**Next Step:** Integrate AgenticPrimitive framework into Phase 9+ architecture if approved.

---

### PROPOSED: Organizational Paradigm Mapping — Future Agent Roadmap

**Author:** Graham Knight (Lead / Architect)  
**Type:** Strategy  
**Status:** Proposed (Brainstorm 2026-04-23)  
**Source:** `.squad/decisions/inbox/graham-brainstorm-vision.md`

**Proposal:** Map Cairn agents to organizational roles. Current agents already map:
- **Archivist** → Scribe / Minutes-taker
- **Curator** → Quality Analyst / Pattern Detective
- **Prescriber** → Tech Lead / Code Reviewer

**Missing Roles (Future Candidates):**
- **Planner** → Project Manager (estimates, priorities, sequencing)
- **Auditor** → Compliance / Governance (enforces standards)
- **Cost Analyst** → FinOps (token budget tracking, ROI analysis)
- **Triage Agent** → Incident Commander (escalation, severity assessment)

**Recommendation:** Don't build all of these. Let them emerge from observed needs. Model: Curator emerged because pattern detection was needed → Prescriber emerged because insights need actions. Each new agent should follow same pattern: need → prototype → formalize.

**Next Step:** Use as roadmap guidance for Phase 9+ agent planning.

---

### Summary: Brainstorm Session Convergences

**Key Convergent Themes (All 4 Agents Aligned):**

1. **Decision Chain as Phase 9 Candidate** — Graham + Roger both recommend content-addressable decisions table for highest architectural priority.
2. **LX Heuristics Checklist** — Design gate for all future MCP tools. Non-blocking, high signal.
3. **Cairn = Debugger Boundary** — All four converged on "runtime instrumentation + debugger" framing. Clarifies ownership.

**Next Steps:**
1. Team discussion on brainstorm proposals
2. If Decision Chain approved: Graham designs schema + migration
3. If LX heuristics approved: Integrate into feature template
4. If Sensory Pervasion approved: Roger scopes Tier 1 signals

---

## Proposed Decisions (Brainstorm Round 2 — 2026-04-23)

### PROPOSED: Compiler + Debugger Architecture — Cairn and Forge

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-04-23  
**Type:** Architectural recommendation  
**Status:** PROPOSED — awaiting discussion  
**Source:** `.squad/decisions/inbox/graham-compiler-debugger.md`  
**Orchestration Log:** `.squad/orchestration-log/2026-04-23T06-30-00Z-graham-brainstorm-r2.md`

**Context:** Revised boundary statement addressing Aaron's challenge to the Cairn boundary test. The Decision Chain data model blurs the line between observability (debugger) and execution (compiler): instrumenting decision points and placing the human in the loop are execution-layer concerns.

**Recommendation: Two Projects, One Monorepo**

- **Cairn (APM — Application Performance Monitor):**
  - Observability, pattern detection, insight generation, prescription generation
  - Stays ~12 modules (Archivist, Curator, Prescriber, MCP tools)
  - Focus: "What happened? What pattern does it match? How do we improve?"
  - Release: Weekly iteration on analysis quality

- **Forge (Execution Harness — NEW):**
  - Runtime execution, orchestration, context management, human-in-loop UX
  - Copilot SDK wrapper, DecisionGate, ToolRouter, ContextManager
  - Focus: "What should happen next? When should we stop and ask? How fast?"
  - Release: Careful gated updates (hot path)

**Monorepo Structure:**
```
packages/
├── @cairn/types          ← Shared contract (events, decisions, sessions)
├── @cairn/cairn           ← Debugger / APM
└── @cairn/forge           ← Compiler / harness (NEW)
```

**Why Monorepo (not separate repos):**
- Shared type changes must be atomic (both consumers must stay in sync)
- Integration testing in one CI pipeline
- Prevents version drift at the integration seam where correctness matters most

**Why Not Absorb the Harness INTO Cairn:**
- Scope explosion (Cairn goes from 12 modules to 30+)
- Stability contracts differ (Cairn can iterate, harness must be rock-stable)
- Release cadence differs
- Merging observability + execution obscures what code is doing

**Team Structure: Spike First, Then Sister Squad**

Phase 1: **Copilot SDK Spike** (this squad, 1-2 sessions)
- Can we wrap CopilotClient and intercept tool calls?
- Can we inject decision gates into the execution flow?
- What events can we emit, and at what granularity?
- What are the SDK's limitations?

Phase 2: **Sister Squad (Forge)** (after spike)
- Different domain expertise than Cairn
- Cairn team: data pipelines, pattern detection, SQLite, MCP tools
- Forge team: agent orchestration, Copilot SDK, UX for decision gates, streaming, model routing

**Trade-offs Named:**
| Decision | Alternative | Why chosen |
|----------|------------|------------|
| Monorepo | Separate repos | Atomic shared type changes |
| Sister squad | Expand this team | Different domain expertise |
| Spike first | Squad immediately | Need SDK constraints before charter |
| Forge as sibling | Forge inside Cairn | Scope explosion + stability concerns |

**Next Steps:**
1. Copilot SDK spike — Time-boxed research
2. Draft `@cairn/types` — Extract shared types from current Cairn codebase
3. Forge squad charter — Written after spike, informed by SDK constraints
4. Monorepo migration — Move current Cairn into `packages/cairn/` structure

**Open Questions for Aaron:**
1. Does "Forge" resonate as the harness name? (Alternatives: Anvil, Loom, Mill)
2. Should the spike include a minimal decision gate prototype, or just research?
3. Timeline: Phase 9, or parallel track?

---

### PROPOSED: Copilot SDK Harness — Platform Feasibility Assessment

**Author:** Roger Wilco (Platform Dev)  
**Date:** 2026-04-23  
**Type:** Technical Feasibility / Platform Analysis  
**Status:** PROPOSED — open for discussion  
**Source:** `.squad/decisions/inbox/roger-copilot-sdk-harness.md`  
**Orchestration Log:** `.squad/orchestration-log/2026-04-23T06-30-00Z-roger-brainstorm-r2.md`

**Executive Summary:** Building an agentic harness on `@github/copilot-sdk` is feasible and high-leverage. The SDK already emits exactly the event stream Cairn needs but currently can't see. Owning the harness closes every observability gap and transforms Cairn from a passive observer (scraping hook JSON) into a first-class participant in the agentic loop.

**SDK Core Primitives:**
| Primitive | What It Gives Cairn |
|-----------|-------------------|
| `CopilotClient` | Session lifecycle owner |
| `createSession()` | Decision point visibility |
| `defineTool()` | Tool orchestration surface |
| `session.on(event)` | **THE OBSERVABILITY GOLDMINE** |
| `hooks.*` | Instrumentation injection points |
| `TelemetryConfig` | OTLP + W3C trace context |

**Events SDK Already Emits:**

**Token Cost (SOLVED):**
- `assistant.usage` — inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cost (billing multiplier), duration_ms, apiCallId

**Tool Observability (SOLVED):**
- `tool.execution_start` — toolCallId, toolName, arguments, mcpServerName
- `tool.execution_complete` — success, result, error, toolTelemetry
- `tool.execution_partial_result` — streaming tool output

**Context Management (SOLVED):**
- `session.usage_info` — tokenLimit, currentTokens, messagesLength
- `session.compaction_complete` — pre/post compaction tokens, messages removed, summary content

**Agent Reasoning (SOLVED):**
- `assistant.reasoning` / `assistant.reasoning_delta` — extended thinking
- `assistant.intent` — what the agent thinks it's doing
- `assistant.message` — complete response with reasoning text

**Session Lifecycle (SOLVED):**
- `assistant.turn_start` / `assistant.turn_end`
- `session.idle` — agent finished processing
- `session.error` — errorType, message, statusCode
- `session.context_changed` — cwd, gitRoot, repository, branch

**Hooks We'd Wire:**
| Hook | What We'd Do |
|------|------------|
| `onSessionStart` | Create Cairn session, inject context from insights |
| `onUserPromptSubmitted` | Log context assembly, measure prompt size |
| `onPreToolUse` | Log decision point, apply permission gates |
| `onPostToolUse` | Log tool result, detect churn/retry patterns |
| `onSessionEnd` | Finalize session, run curator, compute cost |
| `onErrorOccurred` | Log error with full context |

**Recommendation:** Build the harness. The SDK is stable, shipped, and closes every observability gap. ~50 line event bridge. High-leverage next step.

---

### PROPOSED: Shiproom Ceremony — Decision Record Schema and Ceremonial Process

**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-04-23  
**Type:** Ceremony Design / LX + UX Specification  
**Status:** DRAFT — for team discussion  
**Source:** `.squad/decisions/inbox/valanice-shiproom-ceremony.md`  
**Orchestration Log:** `.squad/orchestration-log/2026-04-23T06-30-00Z-valanice-brainstorm-r2.md`

**What Shiproom Is (And Isn't):**

- **NOT code review:** "Is the code correct?" — Instead: "Were the decisions sound?"
- **NOT a retrospective:** "What should we do differently next time?" — Instead: "Should we ship THIS right now?"
- **IS:** A ceremony where the human and agents collectively stress-test the decision chain before shipping

**The Real-World Analog:** In software organizations, Shiproom is the final gate before release. A team presents its payload (decision chain) to stakeholders who stress-test the decisions that produced the work.

**Decision Record Schema:**

Every decision worth defending is captured at decision time:

```
DecisionRecord {
  id:            string       // content-addressable (hash of inputs)
  timestamp:     ISO-8601
  agent:         string       // who decided
  altitude:      0|1|2|3      // Decision Altitude: Local → Policy
  question:      string       // what's being decided
  chosen:        string       // what was chosen
  alternatives:  string[]     // at least 1 (MANDATORY — anti-anchoring rule)
  evidence:      string       // what supported the choice
  confidence:    number       // agent's self-assessed confidence (0.0–1.0)
  parent_id:     string?      // dependency lineage
  tags:          string[]     // domain tags for routing challengers
}
```

**Why `alternatives` is mandatory with minimum 1:**
- Embedded anti-anchoring rule: if agent can't articulate alternative, it hasn't decided — it's followed inertia
- Prevents confabulation: alternatives recorded at decision time, not reconstructed later
- Enables challenge: "Here's your alternative and why it lost; here's why the choice was right"

**Decision Chain as Tamper-Evident DAG:**
- Content-addressable IDs: change decision A → hash changes → downstream lineage breaks
- Auditability by construction: not security theater, just trustworthy chain
- Pull-based event log: decision records live in DB, not in context (preserves token budget)

**Shiproom Process:**

1. **Candidate review:** Human reviews decision chain
2. **Challenge round:** Agents (by domain expertise) challenge specific decisions
3. **Disposition:** Accept decision, request revision, or escalate
4. **Payload assembly:** Approved chain + rejected decisions + override justifications
5. **Ship or iterate:** Decision made

**Next Steps:**
1. Formalize Decision Record schema in types
2. Build `prepare_payload` MCP tool
3. Design challenge orchestration (which agents challenge what)
4. Integrate into Forge harness lifecycle

---

### Round 2 Brainstorm Summary

Three complementary proposals from different angles:

1. **Graham (Architecture):** Cairn + Forge monorepo separation — APM + Runtime. Spike first, sister squad after.
2. **Roger (Platform):** SDK emits the events Cairn needs. ~50 line bridge closes all observability gaps.
3. **Valanice (UX):** Shiproom ceremony + Decision Record schema operationalizes "decisions must be defensible."

**Converging Insight:** Scope decision is emerging — Cairn stays observability-focused. Execution (Forge) becomes a sibling. Human-in-loop ceremony (Shiproom) is the governance layer.

**Session Log:** `.squad/log/2026-04-23T06-30-00Z-brainstorm-round2.md`

---

### 2026-04-23T20-13-00: Architectural Concept — Workflow Portability via Forge as Compiler

**Author:** Graham Knight (Lead/Architect) — from Day 1-2 spawn session  
**Type:** Architecture  
**Status:** Proposed

**What:** Position Forge as a **workflow compiler**, not just an artifact package tool. Compile certified workflows (SKILL.md + verified metadata → DBOM) into portable, deployable artifacts that can be exported to corporate/EMU environments. Trust model: Decision Bill of Materials (DBOM) — companion document to SKILL.md that lists all architectural decisions, dependencies, and assumptions. Export pipeline: Extract (audit trail) → Strip (remove env-specific bindings) → Attach (environment config layer) → Validate (Copilot SDK LLM-as-judge on 5 correctness vectors).

**Alternatives Considered:**
1. **Ad-hoc export scripts** — Low automation, high brittleness, decisions not portable
2. **Generic artifact bundler without DBOM** — Lose auditability, trust breaks in corporate environments
3. **Compiler-only (no export layer)** — Local validation, no corporate deployment path

**Selected:** Forge as compiler with DBOM export pipeline.

**Rationale:** Brings portability to the platform architecture (R5 dual-environments requirement). Corporate environments need auditability and explicit decision tracking. DBOM makes architectural assumptions explicit and portable. Compiler pattern is proven (language compilers, Docker, infrastructure-as-code). LLM-as-judge validates that exported artifact preserves intent across environment boundaries.

**Impact:**
- Extends R5 architecture (sidecar + dual environments) with portable export semantics
- Drives DBOM schema design and Decision Record enrichment
- Enables corporate/EMU deployment pipelines
- Informs Forge implementation phases (compiler before full bundler)

---

### 2026-04-23T20-13-00: Architectural Concept — PGO Telemetry Loop via Continuous Profile-Guided Optimization

**Author:** Graham Knight (Lead/Architect) — from Day 1-2 spawn session  
**Type:** Architecture  
**Status:** Proposed

**What:** Deployed artifacts (workflows, agents, skills) emit telemetry to Application Insights (aggregate signals only, no PII). Telemetry feeds back to Cairn as a continuous optimization input. Cairn's Prescriber learns from production patterns: which decisions work, which workflows get abandoned, which patterns emerge at scale. Creates a closed loop: Deploy → Emit → Ingest → Profile → Prescribe. Cairn becomes "profile-guided optimization" for workflows — same pattern as compiler PGO (profile → recompile → redeploy for speed gains). Here: profile → prescribe → rearchitect for correctness and user fit.

**Telemetry Signal Categories** (PII-free):
- Workflow abandonment points (which phase fails most often)
- Decision reversal rates (prescriptions accepted/rejected ratios per decision type)
- Artifact topology changes (when teams refactor their DBOM)
- Environment-specific success variance (same workflow, different performance in corporate vs. personal)

**Alternatives Considered:**
1. **Ad-hoc query layer to Application Insights** — One-off insights, no systematic feedback
2. **Cairn runs offline** — No production signal, prescriptions based on local patterns only
3. **Full telemetry sink in Cairn (centralized)** — Tight coupling to Application Insights, hard to swap backends

**Selected:** Pluggable telemetry sink + input adapter in Cairn, with Application Insights as reference implementation (V1).

**Rationale:** Completes the feedback loop for platform-scale learning. Addresses Gap 3 from R5 (SDK capability audit revealed no telemetry standard). Matches organizational thinking (profiling as optimization driver). Pluggable sink keeps Cairn decoupled from specific observability backends. PGO metaphor is intuitive for engineers (familiar from compiler/CPU optimization). Profile-guided optimization is proven in system design (Linux perf, Go runtime, MLIR).

**Impact:**
- Reshapes Cairn from single-session learner to multi-session/multi-environment learner
- Drives telemetry schema design (events → Application Insights → Cairn feedback)
- Requires Application Insights adapter (new component) and pluggable sink interface
- Informs Prescriber priority scoring (production signals weight decision recommendations)
- Enables corporate environments to run "dark telemetry" (insights for internal feedback, no external reporting)

---
### 2026-04-23T20-25-00Z: SDK Spike Day 2 Complete — Tool Hooks, Decision Gates, Model Selection All Viable

**Author:** Roger Wilco (Platform Dev)  
**Type:** Technical/Findings  
**Status:** Confirmed  
**Date:** 2026-04-23T20:25:00Z  
**Branch:** `squad/copilot-sdk-spike`

**Context:** Day 2 exploration of Copilot SDK @github/copilot-sdk (v0.2.2) for Forge instrumentation requirements. Three critical research questions: Q2 (tool hooks), Q3 (decision gates), Q7 (model selection). All confirmed viable. All 427 tests pass. Event bridge extended with provenance tagging.

**Q2: Tool Call Interception — ✅ Confirmed**

`registerHooks()` is first-class and composable. `onPreToolUse` hook receives tool name, arguments, timestamp. Handler can return:
- `permissionDecision: "allow" | "deny" | "ask"`
- `modifiedArgs: Record<string, unknown>` (modify tool inputs)

`onPostToolUse` observes results. Hooks emit `hook.start` and `hook.end` events for correlation. Key nuance: `registerHooks()` replaces (doesn't stack) — need `composeHooks()` combiner when multiple subsystems observe.

**Q3: Decision Gates — ✅ Confirmed (Three Native Mechanisms)**

1. **Hook blocking** — `permissionDecision: "deny"` for instant programmatic gates
2. **Hook → permission handler** — `permissionDecision: "ask"` defers to `onPermissionRequest`, which receives rich context: parsed shell commands, file diffs, MCP server attribution. **This is the primary gate.**
3. **Elicitation UI** — `session.ui.confirm()` for structured multi-option decisions

Permission handler context exceeds what we'd build ourselves (shell command parsing, diff computation, MCP attribution). Limitation: no native async approval (e.g., Slack thumbs-up); would require promise-wrapping. Not a blocker for Forge Day 1.

**Q7: Model Selection & Token Budgeting — ✅ Confirmed**

- `client.listModels()` → `ModelInfo[]` with capabilities, billing, policy
- `session.setModel(model, { reasoningEffort? })` fires `session.model_change` event
- `assistant.usage` → per-call tokens, cost in nano-AIU, cache metrics, quota snapshots
- `session.usage_info` → context window utilization snapshots
- **Runtime budget enforcement:** No native setter; must enforce at application level

**Provenance & DBOM**

Event bridge enhanced with `ProvenanceTier: "internal" | "certification" | "deployment"`. 10 SDK event types tagged certification-tier (auditable), 12 internal-tier. DBOM reconstruction pattern implemented: filter certification events, produce audit manifest. ~20 lines of code, zero runtime overhead.

**Surprises & Gotchas**

1. Hook types (`SessionHooks`, `PreToolUseHookInput`, etc.) defined in SDK but NOT re-exported from index. Workaround: `NonNullable<SessionConfig["hooks"]>` or local type mirrors.
2. Type naming divergence: `ElicitationRequest` in CLI bundle vs `ElicitationContext` in public SDK.
3. `PermissionRequestResult` is rich kind-based union (not simple boolean) — better for audit trails but requires pattern matching.
4. Two SDK type copies in node_modules (internal vs external). Always import from `@github/copilot-sdk`.

**Spike Verification**

- All spike files compile cleanly (`tsc --noEmit`)
- Main build passes
- 427/427 tests pass
- Zero infrastructure conflicts
- Code isolation: spike code in `src/spike/`, no main codebase entanglement

**Conclusion**

SDK provides complete feature set for Forge instrumentation layer. Non-invasive tool observation, native blocking/gating, rich model control, and token/cost telemetry all present and production-ready. No architectural blockers for integration. Proceeding to Day 3: Cairn bridge end-to-end, integration smoke test.

**Gates Satisfied:**

- ✅ Tool hooks first-class (Q2)
- ✅ Decision gates work through 3 native mechanisms (Q3)
- ✅ Model selection fully controllable (Q7)
- ✅ 7 of 8 spike questions answered, all green
- ✅ Test coverage maintained

---

### 2026-04-08: Copilot SDK Spike Assessment — GO

**Author:** Graham Knight (Lead/Architect)  
**Type:** Decision  
**Status:** Approved  
**Date:** 2026-04-08

**Decision:** GO — Proceed with building Forge on @github/copilot-sdk v0.2.2.

**Evidence:**
- 7 of 8 spike questions answered ✅
- 1 question answered ⚠️ (Stability — Technical Preview, manageable via abstraction layer)
- Integration surface thin (~75 LOC bridge adapter)
- Event data rich enough for full DBOM artifact provenance

**Architecture Confirmed:**
Monorepo with three packages:
- `@cairn/types` — shared event contract, DBOM schema, decision types
- `@cairn/cairn` — existing observability platform (unchanged)
- `@cairn/forge` — new execution runtime (SDK wrapper, event bridge, decision gates, export pipeline)

**Key Findings That Changed Assumptions:**

*Easier than expected:*
- Event bridge (~50 LOC)
- Decision gates (3 native mechanisms)
- Dependency compatibility (zero conflicts, shared zod)

*Harder than expected:*
- Hook type re-exports (not all exported from SDK index)
- No runtime token budget setter (must enforce at application level)
- Runtime verification gap (compiles clean but needs live CLI process)

*New risk discovered:*
- `registerHooks()` replaces all hooks — doesn't stack
- Hook composer pattern is mandatory, not optional

**Risk Mitigations:**
1. Pin to `0.2.2` (exact, not caret) — 52 versions in 3 months
2. Abstract behind `CairnEvent` — bridge adapter is the seam
3. Start with events only — don't depend on hooks for correctness
4. Keep stdin hooks — SDK harness is additive, not replacement

**Recommended Next Steps:**
1. Monorepo foundation (extract @cairn/types) — 1–2 days
2. Live runtime verification — 1–2 days
3. Core Forge loop — 3–5 days
4. Export pipeline (DBOM + SKILL.md compiler) — 2–3 days

**Trade-offs:**

| Choice | Upside | Downside |
|--------|--------|----------|
| Build on SDK v0.2.2 | Comprehensive API, 86 events, native decision gates | Technical Preview — API may change |
| Monorepo structure | Atomic type changes, shared CI | Repo complexity |
| Event bridge as isolation layer | SDK changes affect ~50 LOC | Extra indirection |
| Application-level token budgeting | Works today, no SDK dependency | More code than a runtime setter |

**Artifacts:**
- Spike scope: `docs/spikes/copilot-sdk-spike.md`
- Roger's exploration: `docs/spikes/copilot-sdk-exploration.md`
- Go/no-go assessment: `docs/spikes/copilot-sdk-assessment.md`
- PoC code: `src/spike/*.ts` (8 files, to be deleted after approval)

---

### 2026-04-09: Spike Complete — All 8 Questions Answered, E2E Integration Proven

**Author:** Roger Wilco (Platform Dev)  
**Type:** Decision  
**Status:** Confirmed  
**Date:** 2026-04-09

**Decision:** ✅ GO — Build on `@github/copilot-sdk` v0.2.2. The 3-day spike validated every load-bearing assumption.

**Final Scorecard:**

| # | Question | Answer | Key Finding |
|---|----------|--------|-------------|
| Q1 | Session Management | ✅ Yes | Full lifecycle API: create, resume, list, terminate |
| Q2 | Tool Call Interception | ✅ Yes | Bidirectional hooks with blocking capability |
| Q3 | Decision Gates | ✅ Yes | Three mechanisms: hook, permission handler, elicitation |
| Q4 | Event Taxonomy | ✅ Yes | 86 typed events from JSON schema, 22 Cairn-relevant |
| Q5 | Cairn Bridge | ✅ Yes | ~75 LOC adapter, real-time streaming, no migration |
| Q6 | Stability | ⚠️ Manageable | Technical Preview — pin version, abstract behind seam |
| Q7 | Model Selection | ✅ Yes | listModels, setModel, budget via assistant.usage |
| Q8 | E2E Integration | ✅ Yes | 20-event smoke test passes all 5 checks |

**Key Findings:**

*The Bridge Is Thin:*
- 75 LOC total (15 mapping + 50 extractors + 10 wiring)
- ONE callback (`onEvent`) handles the entire integration
- No schema migrations — new events are new `event_type` strings

*Cost Tracking Is Comprehensive:*
- `assistant.usage` provides: model, tokens (in/out/cache), nano-AIU billing, quota snapshots
- Sub-agent cost attribution via `initiator` and `parentToolCallId`
- Context window monitoring via `session.usage_info`

*DBOM Is Feasible:*
- Certification-tier events → SHA-256 hash chain → YAML frontmatter
- Integrates naturally with SKILL.md format
- Tamper-evident: modifying any decision invalidates downstream hashes
- Three decision source categories: human, automated_rule, ai_recommendation

*Decision Gates Are Better Than Expected:*
- Three complementary mechanisms, not just one
- Permission handler gets richer context than any custom wrapper
- `PermissionRequestResult` uses kind-based union (not boolean) for audit trail

**Risk Mitigations:**

1. **Pin to `0.2.2`** (exact, not caret) — 52 versions in 3 months
2. **Abstract behind `CairnEvent`** — the bridge adapter is the seam
3. **Start with events only** — don't depend on hooks for correctness
4. **Keep stdin hooks** — SDK harness is additive, not replacement

**Production Effort Estimate:**

| Component | LOC | Time |
|-----------|-----|------|
| Event bridge (production) | ~100 | 0.5 day |
| Harness bootstrap | ~80 | 0.5 day |
| DBOM generator (production) | ~200 | 1 day |
| Cost summary materialization | ~100 | 0.5 day |
| Tests | ~250 | 1 day |
| **Total** | **~730** | **3.5 days** |

**Spike Deliverables:**

| File | Purpose |
|------|---------|
| `src/spike/forge-poc.ts` | Q1 — session management PoC |
| `src/spike/event-bridge.ts` | Q5 — event bridge adapter |
| `src/spike/tool-hooks-poc.ts` | Q2 — tool call interception |
| `src/spike/decision-gate-poc.ts` | Q3 — decision gate mechanisms |
| `src/spike/model-selection-poc.ts` | Q7 — model selection + budgeting |
| `src/spike/e2e-smoke-test.ts` | Q8 — E2E integration smoke test |
| `src/spike/dbom-generator.ts` | DBOM — provenance artifact generator |
| `docs/spikes/copilot-sdk-exploration.md` | Full exploration report |
| `docs/spikes/copilot-sdk-spike.md` | Original spike scope |

**Next Steps (if GO is confirmed):**

1. Charter Forge implementation work (separate from spike branch)
2. Pin SDK version to exact `0.2.2` in production package.json
3. Move bridge adapter from spike to production source
4. Implement `cost_summary` materialization in curator
5. Add DBOM generation to skill compilation pipeline

---

## Phase 1 Decisions — Monorepo Foundation

### 2026-04-23: Monorepo Foundation — npm Workspaces with Three Packages

**Author:** Graham Knight (Lead / Architect)  
**Type:** Architecture  
**Status:** Implemented

**Context**

Cairn was a single package (`@akubly/cairn`) containing all source code. The upcoming Forge runtime needs to share contract types with Cairn but must remain a separate package with its own dependency tree (e.g., `@github/copilot-sdk` is a Forge production dependency, not Cairn's concern).

**Decision**

Restructured to an npm workspaces monorepo with three packages:

| Package | Name | Purpose |
|---------|------|---------|
| `packages/types` | `@cairn/types` | Shared contract types — pure type definitions, zero runtime |
| `packages/cairn` | `@akubly/cairn` | Current Cairn codebase (observability, learning, MCP tools) |
| `packages/forge` | `@cairn/forge` | Empty scaffold for the deterministic execution runtime |

**Type Split Design**

**Key distinction:** Cairn-internal types (DB row shapes like `CairnEvent` with `id: number`, agent types, prescription lifecycle) stay in `packages/cairn/src/types/index.ts`. Shared contract types (bridge event format, decision records, DBOM structures, session identity, telemetry sink) live in `@cairn/types`.

The cairn types file re-exports all shared types from `@cairn/types`, so existing internal imports are unaffected.

**Shared types defined:**
- `ProvenanceTier`, `CairnBridgeEvent` — bridge event format (distinct from DB row type)
- `DecisionSource`, `DecisionRecord` — structured decision auditing
- `DBOMDecisionEntry`, `DBOMStats`, `DBOMArtifact` — Decision Bill of Materials
- `SessionIdentity` — minimal cross-package session reference
- `TelemetrySink` — pluggable event output interface for Phase 5

**Build Strategy**

Root `tsconfig.json` uses project references (`tsc --build`) to enforce correct build order (types → cairn, types → forge). This is more reliable than `npm run build --workspaces` which doesn't guarantee topological ordering.

**Trade-offs**

1. **`tsc --build` vs per-package `tsc`:** Using `tsc --build` from root ensures correct build order and incremental builds via `.tsbuildinfo`. Trade-off: packages can't use independent TypeScript versions (acceptable — we want version consistency anyway).

2. **`.github/hooks/` and `.github/plugin/` in cairn's `files` field:** These repo-root directories were previously listed in the cairn package's npm `files` field. In a monorepo, the cairn package can't reference files outside its directory for npm publish. Dropped from `files` — these are distribution/plugin metadata that belong at repo root, not in the npm tarball.

3. **`"*"` for workspace dependencies:** npm workspaces uses `"*"` (not `"workspace:*"` which is pnpm/yarn syntax) to reference local packages.

**Verification**

- All 427 existing tests pass without modification
- Clean build across all three packages
- Zero business logic changes — purely structural

---

---

### 2026-04-30: Phase 3 Architecture — ForgeClient & SDK Abstraction (Graham)

**Author:** Graham Knight (Lead)  
**Type:** Architecture  
**Status:** Active

# Graham — Phase 3 Architecture Decisions

**Date:** 2026-04-30  
**Author:** Graham Knight (Lead / Architect)  
**Context:** Phase 3 architecture specification for `@akubly/forge` — live SDK integration

---

## ADR-P3-001: ForgeClient wraps CopilotClient 1:1

**Decision:** Each ForgeClient owns exactly one CopilotClient. No shared instances.

**Alternatives:**
1. Shared client singleton — lifecycle confusion, race conditions on concurrent session creation.
2. No wrapper / expose CopilotClient directly — breaks "SDK types don't leak" contract.
3. **1:1 wrapper (chosen)** — clear ownership, deterministic cleanup.

**Trade-off:** Slightly more memory if multiple ForgeClients exist. Clear lifecycle wins.

---

## ADR-P3-002: EventSource interface over direct CopilotSession coupling

**Decision:** `attachBridge()` and `createTokenTracker()` accept `EventSource { on(handler): () => void }` rather than `CopilotSession`.

**Alternatives:**
1. Accept CopilotSession directly — simpler types, but couples to SDK and complicates testing.
2. **EventSource interface (chosen)** — enables mock event sources, keeps Phase 2 bridge SDK-free.

**Trade-off:** One extra interface definition for massive test simplification.

---

## ADR-P3-003: ModelCatalog uses injection over ForgeClient reference

**Decision:** `createModelCatalog()` takes a `listFn: () => Promise<ModelSnapshot[]>` rather than a ForgeClient reference.

**Alternatives:**
1. Pass ForgeClient — simpler call site, untestable without live client.
2. **Injection (chosen)** — testable with static array, matches Phase 2 pattern.

**Trade-off:** Caller wires one line of glue for full testability.

---

## ADR-P3-004: No new shared types in @akubly/types

**Decision:** Phase 3 types (ForgeClientOptions, ForgeSessionConfig, TokenBudget, ModelCatalog) stay Forge-internal.

**Rationale:** Cairn consumes CairnBridgeEvent, not TokenBudget. Types graduate to shared only when two packages actually import them.

**Trade-off:** If Cairn needs TokenBudget later, one PR to migrate. Smaller shared surface now.

---

## ADR-P3-005: Dual event paths — onEvent for setup, attachBridge for runtime

**Decision:** Use SessionConfig.onEvent for events during createSession(), attachBridge() after session exists. No dedup needed.

**Rationale:** SDK guarantees non-overlapping windows. Matches spike pattern.

**Trade-off:** Relies on SDK behavior guarantee. Low risk.

---

## ADR-P3-006: Strategies as plain functions, not class hierarchy

**Decision:** ModelStrategy is a function type. Built-in strategies are a Record<string, ModelStrategy>.

**Alternatives:**
1. Strategy class hierarchy — overkill for 3 strategies, adds constructor ceremony.
2. **Function type (chosen)** — easy to test, compose, override.

**Trade-off:** No runtime type-checking of strategy names. Acceptable for developer-facing API.


---

### 2026-04-29: Phase 3 Test Strategy — Inline Contract Testing (Laura)

**Author:** Laura (Tester)  
**Type:** Testing  
**Status:** Active

# Laura — Phase 3 Test Strategy: Inline Contract Testing

**Author:** Laura (Tester)
**Type:** Test Strategy
**Status:** Proposed
**Date:** 2026-04-29

## Decision

Phase 3 test contracts use **inline implementations** of the expected API surface (ForgeClient, ForgeSession, ModelCatalog, ModelSwitcher, TokenBudgetTracker) rather than importing from non-existent modules. Each inline class defines the behavioral contract. When Alexander builds the production modules, tests switch imports — any divergence breaks tests immediately.

## Rationale

1. **TDD red-phase compatibility:** Tests must be runnable NOW, before production code exists. Importing from `../runtime/index.js` would produce compile errors.
2. **Contract precision:** Inline implementations encode expected behavior (e.g., "disconnect is idempotent", "bridge events are returned as copies") that pure type signatures cannot express.
3. **Proven pattern:** Phase 2 used the same approach (inline bridge/hooks) and the migration to production imports was smooth — documented in history.md.

## Migration Path

When production modules are built:
1. Delete inline class definitions from test files
2. Replace TODO import comments with real imports
3. Run tests — failures reveal behavioral divergence
4. Resolve divergence (fix production code or update contract if intentional)

## Mock SDK Extensions

Extended `helpers/mock-sdk.ts` for Phase 3 needs:
- **MockCopilotSession:** Added `setModel`, typed event handler map, unsubscribe returns
- **MockCopilotClient:** Added `resumeSession`, `listModels`, `listSessions`, `getAuthStatus`, `getStatus`
- **makeModelInfo:** Shared factory for constructing valid `ModelInfo` objects

These extensions are backward-compatible — existing Phase 2 tests continue to pass unchanged.

## Test Coverage Summary

| Module | Tests | Key Behaviors |
|--------|-------|---------------|
| runtime.test.ts | 35 | Session lifecycle, bridge wiring, hook composition, decision gates, disconnect semantics |
| models.test.ts | 52 | Model catalog CRUD, snapshot extraction, mid-session switching, token budget tracking, selection strategies |

## Risks

- Inline implementations may drift from what Alexander builds. Mitigation: clear TODO markers and documented migration path.
- Mock SDK extensions add maintenance surface. Mitigation: centralized in helpers/, barrel-exported.

