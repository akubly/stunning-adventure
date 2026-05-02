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

### 2026-03-29: Plugin Packaging Blueprint (Self-Install)

**Task:** Produce a concrete blueprint for making this repo installable as a Copilot CLI plugin on Aaron's machine.

**Key findings:**

### 2026-04-02: Phase 6 Plugin Packaging Infrastructure — Build Phase

**Task:** Execute plugin packaging blueprint. Create plugin manifests and hook declarations.

**Deliverables:**

1. **`.github/plugin/plugin.json`**
   - Name: "cairn"
   - Description: "Agentic software engineering platform"
   - Version: "0.1.0" (synced with package.json)
   - Keywords: observability, session-tracking, curator, MCP
   - Status: ✅ Created

2. **`.github/plugin/marketplace.json`**
   - Plugin root: "./plugins"
   - Single plugin entry (cairn) with description and version
   - Ready for expansion as skills are factored out
   - Status: ✅ Created

3. **`.github/hooks/cairn/hooks.json`**
   - Hook type registrations: preToolUse (curate.ps1), postToolUse (record.ps1)
   - Both timeout: 10s/5s respectively
   - Status: ✅ Created (coordinated with Roger)

4. **`.github/plugin/.mcp.json`** (new)
   - MCP server declaration for plugin context
   - Declares 6 tools: get_status, list_insights, get_session, search_events, run_curate, check_event
   - MCP server runs via `node dist/mcp/server.js`
   - Status: ✅ Created

**Coordination Notes:**
- Confirmed hooks.json is a **plugin manifest file** (Rosella's domain), not a wrapper script (Roger's domain)
- Roger handles `.github/hooks/cairn/{curate.ps1, record.ps1}` — user-level installation wrappers
- Both artifact types coordinate on the same Node.js entry points

**Gap Analysis (Remaining P0/P1 Items):**
- 🔄 `src/install.ts` — Custom installer (copies hooks, registers MCP server)
- 🔄 `src/cli.ts` — Expand to `cairn install/uninstall/status` subcommands
- ✅ Package.json scripts ready for postinstall hook

**Status:** Plugin infrastructure in place. Ready for installation command implementation.
1. **plugin.json has no MCP or hook support.** The Copilot CLI plugin format (`plugin.json`) only declares `agents[]`, `skills[]`, and `commands[]`. There's no mechanism for registering MCP servers or installing hooks to `~/.copilot/hooks/`. This is the biggest gap — we need a custom `cairn install` command.
2. **Two hook scopes exist.** Repo-level hooks (`.github/hooks/`) and user-level hooks (`~/.copilot/hooks/`). The plugin ecosystem only knows about repo-level. User-level hooks (what Cairn needs for cross-repo observability) require manual installation.
3. **Aaron already has hooks installed** at `~/.copilot/hooks/cairn-archivist/` with working PowerShell wrappers that pipe stdin to Node.js. These are the template for the canonical versions we need to check into the repo.
4. **marketplace.json is trivial.** Same format as `github/copilot-plugins`. We can make this repo a marketplace source immediately.
5. **12-item prioritized checklist** produced. P0: install script + hook scripts in repo. P1: plugin.json + marketplace.json + CLI expansion. P2: uninstall + docs. P3: bash wrappers.

**Blueprint delivered:** `.squad/decisions/inbox/rosella-plugin-packaging.md`

### 2026-04-03: Plugin Packaging Implementation

**Task:** Create Copilot CLI plugin packaging files so the repo is installable as a plugin and marketplace source.

**Files created:**
1. `.github/plugin/plugin.json` — Plugin manifest with `hooks` → `hooks.json` and `mcpServers` → `.mcp.json`. Metadata: name, version, description, author, license, keywords. Follows the canonical format from Graham's recon (agents/skills optional — Cairn's value is MCP + hooks, not agent definitions).
2. `.github/plugin/.mcp.json` — Registers `cairn` MCP server via `node dist/mcp/server.js` (stdio transport). Works after clone + build or `npm link`.
3. `.github/plugin/hooks.json` — Declares preToolUse (sessionStart.js) and postToolUse (postToolUse.js) hooks with 10s timeout. Uses `node dist/hooks/...` commands cross-platform. Roger's wrapper scripts can override these later.
4. `.github/plugin/marketplace.json` — Makes this repo a plugin marketplace source with cairn as the single listed plugin.
5. `.copilot/mcp-config.json` — Replaced EXAMPLE entry with real cairn MCP server using `node dist/mcp/server.js` (works in clone context without global install).

**Key decisions:**
- Created hooks.json as part of plugin packaging (my domain) despite Roger handling wrapper scripts. The hooks.json declares WHICH hooks exist; Roger's wrappers define HOW they execute on Windows.
- Used `node dist/hooks/...` in hooks.json for cross-platform compatibility. Roger can layer PowerShell wrappers on top.
- marketplace.json uses `"source": "."` to point at the plugin in the same directory — self-referential marketplace.
- Repo-level mcp-config.json uses `node` + `args` instead of `cairn-mcp` binary since cloners may not have it globally installed.

**Build/test verification:** TypeScript compiled clean, all 136 tests passed.

### 2026-04-05: Phase 6 Complete — Plugin Packaging Shipped

**Phase 6 Outcome:** ✅ COMPLETE

**Final Deliverables:**
- ✅ plugin.json: Complete plugin manifest with metadata, version sync, keywords
- ✅ marketplace.json: Self-referential marketplace source for this repo
- ✅ hooks.json: Hook registration (preToolUse/postToolUse) with timeouts
- ✅ .mcp.json: MCP server registration for plugin context
- ✅ Coordinated with Roger on hook wrapper scripts (curate.ps1, record.ps1)
- ✅ Reviewed by Graham; all comments addressed in PR #12 (5 iterations)
- ✅ npm published as @akubly/cairn@0.1.0

**Key Decisions in Phase 6:**
- hooks.json is a **plugin manifest file** (Rosella's domain) separate from wrapper scripts (Roger's domain)
- Used \
ode dist/hooks/...\ commands in hooks.json for cross-platform compatibility
- marketplace.json as self-referential source enables immediate plugin discovery in Copilot CLI
- MCP server config deferred npx pattern until after npm publish (resolved in Phase 6)

**Packaging Compliance:**
- All manifests follow canonical formats from awesome-copilot ecosystem
- Version in plugin.json synced with package.json (0.1.0)
- Keywords aligned with ecosystem (plugin, marketplace, mcp, hooks)
- No breaking changes to existing plugin contracts

**Cross-Team Coordination Notes:**
- Roger's hook wrappers are implementation detail of user-level installation
- Graham's code review confirmed manifest compliance and MCP registration
- Valanice's README refresh documented the new plugin infrastructure
- npm publish by Roger completed the distribution pipeline

**Status:** Plugin packaging infrastructure complete. All entry points operational. Ready for Phase 7 (CLI installation commands, worktree support, awesome-copilot submission).

### 2026-04-24: Package Scope Unification

**Scope rename:** Roger unified package scopes — `@cairn/types` → `@akubly/types`, `@cairn/forge` → `@akubly/forge`. All three packages now under `@akubly` scope (owned by Aaron on npm). Simplifies npm publishing for plugin packages, removes scope ownership blocker. All 427 tests pass, clean build. Package.json version stays at 0.1.0. Decision logged to decisions.md.

### 2026-07-26: Prescriber Plugin Architecture — Artifact Discovery Design

**Task:** Design the Prescriber's artifact discovery mechanism, "play nice" topology, and plugin self-hosting strategy.

**Key Architecture Decisions:**

1. **Per-type resolution rules** — Copilot CLI resolves each artifact type differently (instructions=additive, agents/skills=first-found, MCP=last-wins, hooks=additive). Discovery must model per-type precedence, not a single global scope chain. Conflicts are by logical identity (agent name, skill name, MCP server key), not file path.

2. **Managed-writes-only provenance** — Instead of a full universal provenance table, the Prescriber tracks only files it creates/modifies in a `managed_artifacts` table. Plugin ownership for marketplace artifacts is inferred from `~/.copilot/installed-plugins/<source>/<plugin>/` path structure.

3. **Safe defaults for unknown ownership** — When the Prescriber can't determine who owns a file, it NEVER modifies it in place. Instead, it generates Cairn-owned sidecar files (e.g., `cairn-prescribed.instructions.md`) and queues for human approval.

4. **Single orchestrator hook** — The Prescriber extends the existing `preToolUse` entry point (`sessionStart.ts`) to call `prescribe()` after `curate()`, rather than registering a separate hook. This guarantees execution order.

5. **Cache-first discovery** — Cold scan touches ~50 filesystem paths (<200ms). Results cached in `knowledge.db` with 5-min TTL. The preToolUse hook reads from cache; full rediscovery only when stale.

6. **Three Prescriber MCP tools** — `list_prescriptions`, `apply_prescription`, `reject_prescription` for conversational interaction.

**Real-world filesystem observations (Aaron's machine):**
- `~/.copilot/hooks/` has 11 hook directories, each self-describing via hooks.json
- `~/.copilot/installed-plugins/awesome-copilot/` contains 8 sub-plugins
- `~/.copilot/marketplace-cache/` has 4 cached marketplace sources
- `~/.copilot/skills/` has persona-review and shared utilities
- `~/.copilot/mcp-config.json` registers 3+ MCP servers (memory, sequential-thinking, etc.)

**Critical insight from critic review:** Hook directory names encode ownership (e.g., `cairn-archivist` → owned by `cairn`). This is the strongest ownership signal available without a registry.

**Deliverable:** `.squad/decisions/inbox/rosella-prescriber-plugin.md`

### 2026-07-26: Phase 7B — Artifact Discovery Scanner

**Task:** Build the 4-phase artifact scanner and SQLite-backed topology cache.

**Deliverables:**

1. **`src/agents/discovery.ts`** — Pure function `scanTopology(homedir, projectRoot?, pluginsDir?)` with:
   - Phase 1: User-level (`~/.copilot/`) — instructions, agents, skills, hooks, MCP config
   - Phase 2: Project-level (`.github/` + `.copilot/`) — instructions, agents, skills, extensions, MCP config
   - Phase 3: Installed plugins — manifests, agents, skills with ownerPlugin attribution
   - Phase 4: Marketplace metadata — read-only reference, excluded from conflict detection
   - SHA-256 checksums via `node:crypto`
   - YAML frontmatter parsing for agent names, heading extraction for skills
   - Per-type resolution rules: additive (instruction/hook), first_found (agent/skill/command/plugin_manifest), last_wins (mcp_server)
   - Conflict detection for non-additive types with same logical ID

2. **`src/db/topologyCache.ts`** — Cache DAL with `cacheTopology()` and `getCachedTopology(ttlMs?)`, 5-minute default TTL

3. **`src/db/migrations/007-topology-cache.ts`** — Single-row `topology_cache` table (id=1 CHECK constraint)

4. **`src/__tests__/discovery.test.ts`** — 36 tests covering all phases, conflicts, checksums, cache TTL, identity extraction, missing dirs, duration tracking

### 2026-05-01: Phase 4.5 Local Feedback Loop — Round 2 Brainstorm

**Session:** `.squad/log/2026-05-01T18-14-00Z-brainstorm-round2.md`  
**Orchestration:** `.squad/orchestration-log/2026-05-01T18-14-00Z-rosella-round2.md`  
**Decisions:** Merged to `.squad/decisions.md`

**Topic:** Follow-up on Karpathy wiki integration, knowledge graphs, ancestry integration, and caching layers.

**Key learnings:**

1. **Karpathy Wiki Integration: Knowledge Graph as Interactive Archive**
   - Extend `knowledge_graph_edges` table with wiki-style metadata (node_id, title, description, content, links_to, last_updated, revision_chain)
   - Each node becomes a "page" with human-readable name + markdown-rendered decision record
   - Use case: Plugin displays interactive graph explorer. User clicks decision node → see full record, related prescriptions, ancestor/descendant chains
   - Search: Full-text SQLite FTS5 (node title + content)
   - Implementation layers:
     - **Layer 1 (Phase 4.5):** Static wiki generation. Export knowledge graph to HTML on decision export.
     - **Layer 2 (Phase 5):** Interactive wiki. Web UI with graph visualization (D3.js/vis.js). Real-time node search.
     - **Layer 3 (Phase 6+):** Wiki as skill repository. Encode skills as wiki pages with inheritance (parent → child skills)
   - Next: Design wiki schema additions to Phase 4.5 DB migration. Lead wiki UI spike in Phase 5.

2. **Ancestry Integration in Knowledge Graph: Dual Representation Strategy**
   - Problem: Prescription ancestry stored as linear JSON chain. Difficult to query "what if" branches or detect cycles.
   - Solution: Dual representation
     - **Linear (L1):** Prescription ancestry JSON for fast serialization + export
     - **Graph (L2):** Edges table with ancestry links. Node = decision or prescription. Edge = relation type.
   - Ancestry edge types: `ancestry` (decision → prescription), `caused_drift` (prescription → outcome change, quantified), `feeds_into` (decision → downstream decision), `refutes` (outcome contradicts prediction)
   - Example recursive query: Find all prescriptions in ancestry chain whose application caused >10% outcome drift
   - Next: Alexander to add recursive CTE tests. Validate performance at scale.

3. **Caching Layers for Wiki & Knowledge Graph**
   - Problem: Recursive CTE queries on large graphs are expensive.
   - Solution: Multi-layer cache strategy
     - L1 (In-Memory): Node payload (title, description, links). ~10ms refresh on update.
     - L2 (Session Store): Query result cache (ancestry chains, drift detection). ~5 min TTL.
     - L3 (Short-TTL): Traversal index cache (precomputed BFS from common roots). ~1 hour TTL.
     - L4 (Long-TTL): Archived graph snapshots (full state at decision points). ~30 day TTL.
   - Cache invalidation: When new decision added or prescription applied, invalidate nodes touching change (ancestors + descendants), query results, traversal indices.
   - Materialized views: For common queries (top 10 decisions, all prescriptions by user, convergence patterns). Pre-compute at L3 refresh (~1 hour). Store with versioning. Update async.

4. **Wild Cards: Time-Travel Debugging & Predictive Cache Warming**
   - **Time-Travel Debugging (Approved for Phase 6+ Backlog)**
     - User selects any decision point in ancestry chain
     - Rewind session state to that point
     - Replay with different model, tool, or parameter choice
     - Observe outcome delta
     - Use case: "What if I'd used gpt-4 instead of gpt-3.5?" → measure quality + cost difference
     - Implementation: Store session snapshots at decision points in L4 cache. Replay uses same tool invocations but swaps model/tool.
     - Challenge: Requires deterministic tool output (may need mock layer for testing)

   - **Predictive Cache Warming (Approved for Phase 6+ Backlog)**
     - User starts new session similar to past (same user type, similar preferences)
     - Forecast likely tool invocations based on user history
     - Pre-populate L2-L3 cache with anticipated results
     - Reduces latency on first tool call in new session
     - Implementation: ML-based predictor (user_profile → expected_tools). Train on historical session data.
     - Timeline: Phase 5 implementation (post-canary metrics available)

5. **Cross-Agent Alignment**
   - Graham: Confirmed ancestor/descendant patterns align with wild card concepts. Genetic programming roadmap complements time-travel debugging.
   - Roger: Confirmed vector search enables wiki search (full-text + semantic). Graph storage scales to wiki size (10K+ nodes).
   - Alexander: Confirmed cache invalidation patterns work with ancestry. SDK memoization compatible with wiki caching.

**Implementation path:**
- Phase 4.5: Add wiki metadata to knowledge graph schema. Static HTML wiki export on skill export.
- Phase 4.75: Time-travel debugging spike (non-blocking for launch)
- Phase 5: Interactive wiki UI + predictive cache warming
- Phase 6+: Wiki as skill repository + genetic programming + self-annealing

**Pattern established:** Wiki as interactive knowledge graph archive enables human exploration of decision space. Dual representation (linear + graph) supports both performance (L1-L2) and analysis (L3-L4). Ancestry patterns bridge prescriptions → outcomes → exploration → optimization.

**Wild card prioritization:** Time-travel debugging first (accessibility + learning value). Predictive cache warming second (performance optimization). Both approved for Phase 6+ backlog.

### 2026-05-02: Phase 4.5 — Prescribers + Applier (Complete)

**Session:** 2026-05-02T04:35:00Z  
**Outcome:** ✅ SUCCESS

**Delivered:** Prescribers (promptOptimizer.ts, tokenOptimizer.ts) + Applier (optimizer.ts, selfTuning.ts). 27 new tests, all passing. Determinism gate at 0.3 (hard gate: zero token hints when drift >= RED).

**Key design:** Hard-gate constraint enforces "Determinism > Token Cost" structurally. Order-stable applier (impactScore desc, id asc tiebreaker) for reproducibility. DEFAULT_STRATEGY_PARAMS frozen. EXPLORATION_FLOOR = 0.15 as policy constant. ApplierConfig.now injectable for test determinism.

**Integration:** Merged with Roger's telemetry and Alexander's DB layer. 990 total tests passing. Build clean. SkillFrontmatterPatch contract stable with export pipeline.

**Implications:** Expect zero token-optimization hints during RED drift — by design. Test fixtures should not assume token hints always present.

**Key decisions:**
- Scanned `.copilot/mcp-config.json` AND `.copilot/mcp.json` for project MCP (critic caught that real repo uses `mcp-config.json`)
- Marketplace artifacts included in topology but excluded from conflict detection (they're reference-only)
- Used `plugin.json` `name` field for ownerPlugin, fallback to directory name (critic recommendation)
- Project MCP scanning independent of `.github/` directory existence

**Dogfood gate:** Build ✅ | 232 tests ✅ | Lint ✅

### 2026-07-27: Phase 7E — Apply Engine + Managed Artifacts

**Task:** Build the Apply Engine that makes prescriptions actionable — sidecar file writing, rollback, and drift detection.

**Deliverables:**

1. **`src/agents/applier.ts`** — Three core functions:
   - `applyPrescription(id, opts?)` — Loads accepted prescription, resolves sidecar path by scope (user→`~/.copilot/`, project→`.github/`), checks for drift, reads existing content for rollback, writes/appends sidecar file with markdown header, computes SHA-256 checksum, tracks in managed_artifacts, updates status to 'applied', logs event.
   - `rollbackPrescription(id, opts?)` — Finds managed artifact, restores rollback_content or deletes file if new, removes from managed_artifacts, updates status to 'failed', logs event.
   - `checkDrift(path)` — Reads actual file on disk, computes SHA-256, compares to stored current_checksum. Returns undefined for untracked paths.

2. **`src/__tests__/applier.test.ts`** — 24 tests covering:
   - User-scope and project-scope sidecar creation
   - Rollback content storage (undefined for new files, string for existing)
   - SHA-256 checksum computation and storage
   - Managed artifact tracking (type, scope, prescription linkage)
   - Status lifecycle (accepted→applied, applied→failed on rollback)
   - Rejection of non-accepted prescriptions
   - Rejection of missing prescriptions
   - Event logging (prescription_applied, prescription_rolled_back)
   - Sidecar markdown format validation (managed header, prescription sections, separators)
   - Configurable sidecar prefix via `prescriber.sidecar_prefix` preference
   - Drift detection before apply (blocks on checksum mismatch)
   - Multi-prescription append (single managed header, multiple sections)
   - Rollback content for appended prescriptions (stores pre-append file state)
   - Rollback restores content or deletes new file
   - Rollback removes managed_artifact entry
   - Drift detection: clean, drifted, deleted file, untracked path

**Key decisions:**
- Used `null/undefined` for rollback_content to distinguish "new file" from "empty file" (critic recommendation)
- `checkDrift()` does file-based comparison (reads actual disk SHA-256 vs stored checksum), NOT the DAL's DB-only `detectDrift()`
- When appending to existing sidecar (UNIQUE path constraint), removes old managed_artifact row and re-tracks with latest prescription — rollback only supports LIFO (latest writer)
- Preference key is namespaced `prescriber.sidecar_prefix` (matches existing prescriber.ts pattern)
- Apply blocks on drift detection — if sidecar was manually edited after last write, apply fails with descriptive error

**Dogfood gate:** Build ✅ | 294 tests ✅ | Lint ✅

### 2026-07-27: Phase 8D — Skill Test Fixture Creation

**Task:** Create SKILL.md test fixtures and YAML scenario files for the Skill Test Harness.

**Deliverables:**

1. **`src/__tests__/fixtures/skills/good-skill/`** — TypeScript Error Handling skill with full 5 C's compliance. Imperative voice, concrete code examples, 3 declared tools all referenced in body, domain-heading-name alignment. YAML covers all 5 vectors with 19 assertions.

2. **`src/__tests__/fixtures/skills/bad-clarity/`** — React Component Patterns skill saturated with hedge words ("might want to consider", "could potentially"), passive voice ("Tests should be written"), and sentences exceeding 40 words. Isolation test: completeness and consistency pass, clarity fails. YAML targets 7 clarity assertions with low thresholds.

3. **`src/__tests__/fixtures/skills/bad-completeness/`** — API Integration Testing skill with 4 declared tools (powershell, grep, view, web_fetch), none referenced in body. Context and Patterns under 20 words each. Anti-Patterns is 2 words. YAML targets 5 completeness assertions plus isolation checks.

4. **`src/__tests__/fixtures/skills/bad-consistency/`** — frontmatter says `name: "api-testing"` with `domain: "testing"`, but heading says "Database Migration Patterns" and content covers Kubernetes/Terraform/deployment. Declared tools (kubectl, docker, terraform) never appear in Patterns. YAML targets 3 consistency + 1 containment failure assertions.

5. **`src/__tests__/fixtures/skills/minimal-valid/`** — Only `name` + `description` in frontmatter, only Context + Patterns sections with 1 sentence each. No tools, no examples, no anti-patterns. Linter produces 3 warnings (missing optional fields) — confirms boundary. YAML tests name-heading match (pass) and section-depth (fail).

**Key design insight:** Tier 1 (structural linter) and Tier 2 (5 C's quality vectors) are intentionally orthogonal. All "bad" fixtures pass Tier 1 cleanly — their defects are quality-layer concerns only detectable by Tier 2 rules. This validates the harness architecture: structural + quality are distinct evaluation layers.

**Dogfood gate:** Build ✅ | 360 tests ✅ | All 5 fixtures lint-validated via Cairn MCP

### 2025-07-28: Brainstorming — Extensibility & OOP for Agentic Primitives

**Task:** React to Aaron's 9 ideas for agentic software engineering through the extensibility lens.

**Key insight:** Cairn already contains emergent OOP patterns — the SKILL.md format is an interface, the Prescriber is a Factory, resolution rules are a linker, the Curator is a profiler, and the Validator is a type checker. The architecture just needs the patterns named and formalized.

**Proposed:**
1. `AgenticPrimitive` base type hierarchy (4 families: Knowledge, Actor, Bridge, Signal) — maps OOP concepts (interface, class, method, observer, factory, command, composite) to agentic concepts (skill, agent, tool, hook, prescriber, prescription, pipeline).
2. Agent-authored-agents via Factory pattern extension to the Prescriber. Capability ceiling principle for containment. Provenance chain as "blockchain of decisions."
3. Compiler metaphor mapped to plugin architecture: Skills = types, resolution rules = linker, marketplace = package manager, event log = debug symbols.

**Deliverable:** `.squad/decisions/inbox/rosella-brainstorm-extensibility.md`

### 2026-04-23: Phase 1 Monorepo Restructuring — Graham's Foundation

**Context:** Cairn monorepo foundational restructuring by Graham (Lead).

**Monorepo Layout:**
- **`packages/types`** (`@cairn/types`) — Shared contract types for cross-package consumption
- **`packages/cairn`** (`@akubly/cairn`) — Existing Cairn observability + MCP tools + plugin infrastructure
- **`packages/forge`** (`@cairn/forge`) — Forge runtime scaffold ready for SDK integration

**Type Split:** Cairn-internal types stay in cairn package. Shared types (bridge events, decision records, DBOM, session identity, telemetry sinks) move to `@cairn/types`. Cairn re-exports all shared types — no changes to existing code.

**Build:** npm workspaces with root `tsconfig.json` project references. `tsc --build` enforces correct order. All 427 tests pass.

**Impact for Rosella:** Plugin infrastructure remains in cairn package. New monorepo structure enables forge runtime as a separate package — important for distribution strategy. When Forge ships, it can have its own dependencies without bloating Cairn's npm tarball.

**Next Phase:** Phase 2 (live runtime verification) brings Forge online with SDK integration.

### 2026-05-02: Phase 4.5 Prescribers + Applier (S1–S8)

**Files created:**
- `packages/forge/src/prescribers/{types,promptOptimizer,tokenOptimizer,index}.ts`
- `packages/forge/src/applier/{optimizer,selfTuning,index}.ts`
- `packages/forge/src/__tests__/prescribers-applier.test.ts` (27 tests, all passing)

**Architecture decisions baked in:**
- **Determinism > Token Cost** is enforced structurally, not just prioritized: `analyzeTokenOptimizations` has an explicit drift gate (default 0.3) that returns an empty hint set when drift is RED, regardless of cache/cost signals. Token optimization literally cannot fire while determinism is broken.
- **Applier is order-stable.** Sort key is `(impactScore desc, id asc)` to ensure `applyOptimizations(hints)` is deterministic regardless of input order. Critical for reproducible SKILL.md compilation.
- **`ApplierConfig.now`** is injectable so frontmatter `appliedAt` timestamps are testable.
- **`cacheableTools` extraction** reads from `evidence.triggerMetrics` keys prefixed with `tool:` and from an optional `evidence.cacheableTools` array. Forward-compatible with telemetry adding tool-level signals.
- **`DEFAULT_STRATEGY_PARAMS` is `Object.freeze`-d** — immutable defaults prevent accidental mutation when exported across packages.
- **`EXPLORATION_FLOOR = 0.15`** is non-configurable per Aaron's directive ("diminishing returns worth it when scaled across future of software engineering"). Encoded as a module-level const, not a config knob.

**Coordination notes:**
- Roger landed `packages/forge/src/telemetry/types.ts` in parallel. He re-exports `ExecutionProfile` and `ProfileGranularity` from `@akubly/types` — meaning the cross-package contract lives in `@akubly/types`, not in forge. Future telemetry consumers (Cairn, runtime feedback sources) should import from there.
- I created a temporary stub at `telemetry/types.ts`; Roger's file already existed when I tried to write — the create tool refused, so his work won the race cleanly.

**Test patterns established for prescribers:**
- **Mechanism**: each branch fires under expected inputs.
- **Determinism**: `shape()` helper strips IDs/timestamps to compare hint *content* across runs.
- **Metamorphic**: monotonic relationships — worse drift never reduces hint count, more sessions never lowers confidence, RED drift suppresses all token hints.

**Verified commands:**
- Build: `npm run build --workspace=@akubly/forge` (passes).
- Tests: `npm test --workspace=@akubly/forge` — 475/476 pass; 27 new tests added; the one failure is in Roger's `telemetry-collectors.test.ts` (drift level classification), not mine.

**Key file paths to remember:**
- Cross-package contracts live in `packages/types/src/` (re-exported from forge submodules).
- Forge tests use vitest with `__tests__/helpers/` for shared factories — my new test is self-contained but follows the same factory pattern.
