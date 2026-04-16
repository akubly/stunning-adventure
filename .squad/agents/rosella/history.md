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
