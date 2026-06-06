# Gabriel — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Infrastructure
- **Joined:** 2026-03-28T06:21:47.381Z

## Learnings

<!-- Append learnings below -->

### 2026-03-28 — Recon: Prior Infrastructure & Community Practices

**Prior Infrastructure (akubly/.copilot):**
- Aaron's existing Copilot infra is production-grade, built for Windows OS development over months of iteration.
- Architecture: instructions (layered) / agents / knowledge (concepts vs technologies) / skills (with shared template+schema+observability) / hooks (10 covering full session lifecycle).
- Most sophisticated artifacts: code-reviewer agent (multi-source parallel review with 20 rules from 2,670 real reviews), persona-review skill (parallel subagent panels), tool-guards hook (5 safety guards with approval tokens and fail-open design).
- Key reusable patterns: knowledge taxonomy, workflow gates (decision-point + persona review), anti-anchoring discipline, skill template, session DB contracts, observability pipeline, tool guards.
- Domain content (Windows/Razzle/C++/ADO) is not portable — structural patterns are.

**Community Best Practices (2025-2026):**
- Context engineering has superseded prompt engineering. Core insight: context is finite with diminishing returns; optimize for smallest high-signal token set.
- Anthropic recommends: compaction, structured note-taking, sub-agent architectures for long-horizon tasks.
- Four dominant multi-agent orchestration patterns: Supervisor, Pipeline, Swarm, Graph/Network.
- Squad (Brady Gaster, GitHub) demonstrates repo-native multi-agent with drop-box pattern (decisions.md), context replication, and explicit memory in repo files.
- AGENTS.md is emerging as vendor-neutral standard (Linux Foundation). Layer: org → repo → path → agent → personal.
- Kakao's 6 principles map well to Aaron's existing ai-assisted-engineering.md.
- Aaron's knowledge taxonomy (concepts/technologies/skills) and persona review panels are innovations ahead of community consensus.

### 2026-03-28: Cross-Team Recon Awareness

**Graham (Lead)** conducted deep research into Copilot extensibility and identified the seven-layer composition model (Instructions → Skills → Agents → Hooks → MCP → Plugins → ACP). Established plugin.json as canonical distribution unit and MCP as integration standard replacing deprecated GitHub App extensions.

**Roger (Platform Dev)** mapped the three SDK layers (CLI SDK for embedding @github/copilot-sdk, Extensions SDK for distribution @copilot-extensions/preview-sdk, Engine SDK for custom agents @github/copilot-engine-sdk). Confirmed MCP as universal tool protocol and clarified that Extensions serve Graham's identified distribution strategy.

**Rosella (Plugin Dev)** surveyed plugin marketplaces and found awesome-copilot as gravitational center (170+ agents, 240+ skills, 55+ plugins). Identified three canonical formats: `.agent.md`, `SKILL.md` (agentskills.io open standard), `plugin.json` (Claude Code spec). Recommends integrating with awesome-copilot rather than building custom marketplace.

**Outcome:** Gabriel's 7 directly reusable patterns from prior infrastructure now inform all three specialists. Knowledge taxonomy is an innovation to preserve and extend. Skill template pattern validates Rosella's SKILL.md standardization. Workflow gates and anti-anchoring discipline become foundational team practices. Context engineering and context replication from community best practices align with how Squad already works and how Aaron's infrastructure was designed.

### 2026-04-05 — Prescriber Infrastructure Analysis

**Key Architecture Decisions:**
- Prescriber MUST NOT generate prescriptions in the preToolUse hot path. The 10s budget is already consumed by Node startup (~400ms) + unbounded curation. MCP-only trigger is the right call.
- `curate()` has no time cap — it loops until caught up. This is a pre-existing risk that becomes critical with any additional preToolUse work. Recommended 3s hard cap with cursor persistence.
- Prescriptions need their own table separate from `insights.prescription` (static text hints). Clear ownership: Curator writes insights, Prescriber writes prescriptions.
- MCP surface: 4 new tools (list_prescriptions, get_prescription, decide_prescription, generate_prescriptions). `decide_prescription` combines apply/reject/dismiss into one tool with action enum — every disposition becomes a Curator event.
- No new hook wrappers or hooks.json changes needed. Prescriber lives entirely in MCP server process.
- Ships as part of @akubly/cairn, not separate package. Shared DB singleton, no extra deps.

**Key File Paths:**
- `src/hooks/sessionStart.ts` — preToolUse entry point, fast-path logic, stale session detection
- `src/agents/curator.ts` — unbounded curate() loop at line 129, batch size 1000
- `src/mcp/server.ts` — MCP tool registration, 6 existing tools
- `.github/hooks/cairn/curate.ps1` — PowerShell wrapper with 3-tier script resolution
- `.github/hooks/cairn/hooks.json` — hook declarations (10s preToolUse, 5s postToolUse)
- `.github/plugin/plugin.json` — plugin manifest, references hooks.json + .mcp.json

**Performance Insight:**
- preToolUse end-to-end fast path: ~410ms (PowerShell + Node + SQLite + git). Slow path adds crash recovery (~50ms) + curation (unbounded).
- Hooks share timeout across all plugins. No per-plugin allocation. Plugins must self-budget.
- MCP server has no timeout constraint — runs as long-lived subprocess. Ideal for expensive operations.

### 2026-04-07 — Phase 7C: Curate Cap + Trigger Wiring

**Delivered:**
- 3-second soft time cap on `curate()` batch loop (TIME_BUDGET_MS=3000, checked between batches)
- Extended `CurateResult` with `capped` and `insightsChanged` flags
- Hybrid trigger wiring: preToolUse slow path and MCP `run_curate` both chain `prescribe()` when insights change
- Prescriber stub (`src/agents/prescriber.ts`) — returns `{ prescriptionsGenerated: 0 }`, ready for Roger's Phase 7D
- Session counter increment on slow path for deferral cooldown (DP5 #6)
- Fail-open: prescribe() failures are caught in both preToolUse and MCP paths
- 15 new tests (41 curator, 11 sessionStart, 23 MCP) — all passing

**Key Decisions:**
- Time cap check goes AFTER `events.length < BATCH_SIZE` — a partial final batch means "caught up", not "capped". This prevents false `capped: true` on the last batch.
- MCP `run_curate` output shape changed to `{ curate: result, prescriptions: prescribeResult }` — breaking change per spec. Prescriber errors return `null` prescriptions (partial success).
- `incrementSessionCounter()` is unconditional on slow path. In practice, double-increments are rare because postToolUse creates a session immediately after preToolUse, making subsequent calls fast-path.

**Files Modified:** curator.ts, sessionStart.ts, server.ts, curator.test.ts, sessionStart.test.ts, mcp.test.ts
**Files Created:** prescriber.ts

### 2026-04-08 — Fix sessionStart prescriber wiring test

**Problem:** Cloud reviewer flagged that `vi.spyOn({ prescribe }, 'prescribe')` in the "should call prescribe() when curate produces new insights" test was spying on a throwaway wrapper object, not the actual import used by `runSessionStart()`. The spy could never observe real calls — the test was passing vacuously.

**Fix:** Replaced the ineffective spy with direct DB side-effect assertions. After `runSessionStart()`, the test now verifies:
1. Prescriptions rows exist in the `prescriptions` table with status `'generated'`
2. `pending_count` in `prescriber_state` increased

**Learning:** When testing module-internal call chains in ESM (where you can't intercept the import binding), assert on observable side effects (DB state, file output) rather than trying to spy on re-exported functions through wrapper objects.

### 2026-04-09 — Phase 8D: DB Migration 009 + Results Module

**Delivered:**
- Migration 009: `skill_test_results` table with 5C vector constraint, 3-tier check, score range, boolean passed, JSON evidence, session FK, and 3 indexes (path, vector, run_at).
- CRUD module `src/db/skillTestResults.ts`: `insertTestResult`, `insertTestResults` (transactional batch), `getTestResults`, `getTestHistory`, `getLatestTestRun`. Evidence stored as JSON text, parsed to `string[]` on read. Snake→camel mapping in `mapRow()`.
- Registered migration009 in `src/db/schema.ts`.
- Updated schema version assertions from 8→9 in three test files: `db.test.ts`, `discovery.test.ts`, `prescriptions.test.ts`.

**Key Pattern:** Schema version assertions exist in multiple test files (db, discovery, prescriptions). All must be updated when adding a migration — grep for `toBe(N)` where N is the old version.

**Files Created:** `src/db/migrations/009-skill-test-results.ts`, `src/db/skillTestResults.ts`
**Files Modified:** `src/db/schema.ts`, `src/__tests__/db.test.ts`, `src/__tests__/discovery.test.ts`, `src/__tests__/prescriptions.test.ts`

### 2026-04-09 — Copilot SDK Spike: Infrastructure Verification

**Task:** Verify `@github/copilot-sdk@0.2.2` installation doesn't break existing infrastructure on `squad/copilot-sdk-spike` branch.

**Results — All Clear:**
- **Build:** `npm run build` passes clean. No TypeScript compilation errors.
- **Tests:** All 427 tests pass (15 test files, 838ms). No regressions.
- **Dependency compatibility:** SDK is ESM (`"type": "module"`), targets Node >=20.0.0, ships `.d.ts` declarations — fully aligned with our project settings (ES2022/Node16/ESM).
- **Zod shared:** SDK depends on `zod@^4.3.6`, same as our project — deduped cleanly, no version conflict.
- **No peer dependency issues:** `npm ls` shows no ERR/WARN/invalid entries.

**Spike Isolation Changes:**
- Added `"src/spike"` to `tsconfig.json` `exclude` array — spike code won't be compiled into `dist/` by `npm run build`.
- `package.json` `files` field already limits npm package to `dist/`, `.github/hooks/`, `.github/plugin/` — spike code can never ship.
- `vitest.config.ts` uses `include: ['src/**/*.test.ts']` — spike tests would only run if placed in `.test.ts` files, which is fine for PoC exploration.

**Security Notes:**
- `npm audit` shows 3 vulnerabilities (2 moderate, 1 high) in SDK transitive deps: `hono` (cookie/path traversal/IP matching issues) and `@hono/node-server` (middleware bypass). These are in the Hono web framework used internally by `@github/copilot` — not directly exploitable in our hook/MCP usage pattern but worth tracking for SDK updates.

**Files Modified:** `tsconfig.json` (added spike exclusion), `package.json` + `package-lock.json` (SDK dependency added)

### 2026-04-23: Phase 1 Monorepo Restructuring — Graham's Foundation

**Context:** Cairn monorepo foundational restructuring by Graham (Lead).

**Monorepo Architecture:**
- **`packages/types`** (`@cairn/types`) — Shared contract types (bridge events, decisions, DBOM, session identity)
- **`packages/cairn`** (`@akubly/cairn`) — Existing Cairn observability, MCP tools, plugin infrastructure
- **`packages/forge`** (`@cairn/forge`) — Forge runtime scaffold (SDK integration, deterministic execution)

**Type Governance:** Shared types in `@cairn/types`. Internal types (CairnEvent, agent types, prescription lifecycle) remain in cairn. Cairn re-exports shared types for backward compatibility.

**Build Discipline:** Root `tsconfig.json` with project references. `tsc --build` enforces correct order: types → cairn, types → forge. All 427 tests pass. Clean build, zero logic changes.

**Impact for Gabriel:** The monorepo structure enables infrastructure separation — hook infrastructure stays in cairn (close to MCP tools), but Forge runtime can have independent tooling chains. This pattern keeps infra concerns decoupled and scalable as phases progress.

**Next Phase:** Phase 2 (live runtime verification) validates type contracts during SDK harness integration.

---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).

---

📌 **2026-05-29: Eureka Cycle 1 Review — F7 (eslint guardrail) completed** — Code panel finding F7 (import encapsulation guardrail). Added eslint no-restricted-imports rule to packages/eureka/ to prevent accidental imports of internal functions and test utilities. Rule blocks non-exported compositeScore (pre-fix regression guard), private fixtures, and non-public ClockProvider implementations. All packages pass eslint. Commit 27ff2af. — Scribe

---

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
### 2026-03-28 — Recon: Prior Infrastructure & Community Practices

**Prior Infrastructure (akubly/.copilot):**
- Aaron's existing Copilot infra is production-grade, built for Windows OS development over months of iteration.
- Architecture: instructions (layered) / agents / knowledge (concepts vs technologies) / skills (with shared template+schema+observability) / hooks (10 covering full session lifecycle).
- Most sophisticated artifacts: code-reviewer agent (multi-source parallel review with 20 rules from 2,670 real reviews), persona-review skill (parallel subagent panels), tool-guards hook (5 safety guards with approval tokens and fail-open design).
- Key reusable patterns: knowledge taxonomy, workflow gates (decision-point + persona review), anti-anchoring discipline, skill template, session DB contracts, observability pipeline, tool guards.
- Domain content (Windows/Razzle/C++/ADO) is not portable — structural patterns are.

**Community Best Practices (2025-2026):**
- Context engineering has superseded prompt engineering. Core insight: context is finite with diminishing returns; optimize for smallest high-signal token set.
- Anthropic recommends: compaction, structured note-taking, sub-agent architectures for long-horizon tasks.
- Four dominant multi-agent orchestration patterns: Supervisor, Pipeline, Swarm, Graph/Network.
- Squad (Brady Gaster, GitHub) demonstrates repo-native multi-agent with drop-box pattern (decisions.md), context replication, and explicit memory in repo files.
- AGENTS.md is emerging as vendor-neutral standard (Linux Foundation). Layer: org → repo → path → agent → personal.
- Kakao's 6 principles map well to Aaron's existing ai-assisted-engineering.md.
- Aaron's knowledge taxonomy (concepts/technologies/skills) and persona review panels are innovations ahead of community consensus.

### 2026-03-28: Cross-Team Recon Awareness

**Graham (Lead)** conducted deep research into Copilot extensibility and identified the seven-layer composition model (Instructions → Skills → Agents → Hooks → MCP → Plugins → ACP). Established plugin.json as canonical distribution unit and MCP as integration standard replacing deprecated GitHub App extensions.

**Roger (Platform Dev)** mapped the three SDK layers (CLI SDK for embedding @github/copilot-sdk, Extensions SDK for distribution @copilot-extensions/preview-sdk, Engine SDK for custom agents @github/copilot-engine-sdk). Confirmed MCP as universal tool protocol and clarified that Extensions serve Graham's identified distribution strategy.

**Rosella (Plugin Dev)** surveyed plugin marketplaces and found awesome-copilot as gravitational center (170+ agents, 240+ skills, 55+ plugins). Identified three canonical formats: `.agent.md`, `SKILL.md` (agentskills.io open standard), `plugin.json` (Claude Code spec). Recommends integrating with awesome-copilot rather than building custom marketplace.

**Outcome:** Gabriel's 7 directly reusable patterns from prior infrastructure now inform all three specialists. Knowledge taxonomy is an innovation to preserve and extend. Skill template pattern validates Rosella's SKILL.md standardization. Workflow gates and anti-anchoring discipline become foundational team practices. Context engineering and context replication from community best practices align with how Squad already works and how Aaron's infrastructure was designed.

### 2026-04-05 — Prescriber Infrastructure Analysis

**Key Architecture Decisions:**
- Prescriber MUST NOT generate prescriptions in the preToolUse hot path. The 10s budget is already consumed by Node startup (~400ms) + unbounded curation. MCP-only trigger is the right call.
- `curate()` has no time cap — it loops until caught up. This is a pre-existing risk that becomes critical with any additional preToolUse work. Recommended 3s hard cap with cursor persistence.
- Prescriptions need their own table separate from `insights.prescription` (static text hints). Clear ownership: Curator writes insights, Prescriber writes prescriptions.
- MCP surface: 4 new tools (list_prescriptions, get_prescription, decide_prescription, generate_prescriptions). `decide_prescription` combines apply/reject/dismiss into one tool with action enum — every disposition becomes a Curator event.
- No new hook wrappers or hooks.json changes needed. Prescriber lives entirely in MCP server process.
- Ships as part of @akubly/cairn, not separate package. Shared DB singleton, no extra deps.

**Key File Paths:**
- `src/hooks/sessionStart.ts` — preToolUse entry point, fast-path logic, stale session detection
- `src/agents/curator.ts` — unbounded curate() loop at line 129, batch size 1000
- `src/mcp/server.ts` — MCP tool registration, 6 existing tools
- `.github/hooks/cairn/curate.ps1` — PowerShell wrapper with 3-tier script resolution
- `.github/hooks/cairn/hooks.json` — hook declarations (10s preToolUse, 5s postToolUse)
- `.github/plugin/plugin.json` — plugin manifest, references hooks.json + .mcp.json

**Performance Insight:**
- preToolUse end-to-end fast path: ~410ms (PowerShell + Node + SQLite + git). Slow path adds crash recovery (~50ms) + curation (unbounded).
- Hooks share timeout across all plugins. No per-plugin allocation. Plugins must self-budget.
- MCP server has no timeout constraint — runs as long-lived subprocess. Ideal for expensive operations.

### 2026-04-07 — Phase 7C: Curate Cap + Trigger Wiring

**Delivered:**
- 3-second soft time cap on `curate()` batch loop (TIME_BUDGET_MS=3000, checked between batches)
- Extended `CurateResult` with `capped` and `insightsChanged` flags
- Hybrid trigger wiring: preToolUse slow path and MCP `run_curate` both chain `prescribe()` when insights change
- Prescriber stub (`src/agents/prescriber.ts`) — returns `{ prescriptionsGenerated: 0 }`, ready for Roger's Phase 7D
- Session counter increment on slow path for deferral cooldown (DP5 #6)
- Fail-open: prescribe() failures are caught in both preToolUse and MCP paths
- 15 new tests (41 curator, 11 sessionStart, 23 MCP) — all passing

**Key Decisions:**
- Time cap check goes AFTER `events.length < BATCH_SIZE` — a partial final batch means "caught up", not "capped". This prevents false `capped: true` on the last batch.
- MCP `run_curate` output shape changed to `{ curate: result, prescriptions: prescribeResult }` — breaking change per spec. Prescriber errors return `null` prescriptions (partial success).
- `incrementSessionCounter()` is unconditional on slow path. In practice, double-increments are rare because postToolUse creates a session immediately after preToolUse, making subsequent calls fast-path.

**Files Modified:** curator.ts, sessionStart.ts, server.ts, curator.test.ts, sessionStart.test.ts, mcp.test.ts
**Files Created:** prescriber.ts

### 2026-04-08 — Fix sessionStart prescriber wiring test

**Problem:** Cloud reviewer flagged that `vi.spyOn({ prescribe }, 'prescribe')` in the "should call prescribe() when curate produces new insights" test was spying on a throwaway wrapper object, not the actual import used by `runSessionStart()`. The spy could never observe real calls — the test was passing vacuously.

**Fix:** Replaced the ineffective spy with direct DB side-effect assertions. After `runSessionStart()`, the test now verifies:
1. Prescriptions rows exist in the `prescriptions` table with status `'generated'`
2. `pending_count` in `prescriber_state` increased

**Learning:** When testing module-internal call chains in ESM (where you can't intercept the import binding), assert on observable side effects (DB state, file output) rather than trying to spy on re-exported functions through wrapper objects.

### 2026-04-09 — Phase 8D: DB Migration 009 + Results Module

**Delivered:**
- Migration 009: `skill_test_results` table with 5C vector constraint, 3-tier check, score range, boolean passed, JSON evidence, session FK, and 3 indexes (path, vector, run_at).
- CRUD module `src/db/skillTestResults.ts`: `insertTestResult`, `insertTestResults` (transactional batch), `getTestResults`, `getTestHistory`, `getLatestTestRun`. Evidence stored as JSON text, parsed to `string[]` on read. Snake→camel mapping in `mapRow()`.
- Registered migration009 in `src/db/schema.ts`.
- Updated schema version assertions from 8→9 in three test files: `db.test.ts`, `discovery.test.ts`, `prescriptions.test.ts`.

**Key Pattern:** Schema version assertions exist in multiple test files (db, discovery, prescriptions). All must be updated when adding a migration — grep for `toBe(N)` where N is the old version.

**Files Created:** `src/db/migrations/009-skill-test-results.ts`, `src/db/skillTestResults.ts`
**Files Modified:** `src/db/schema.ts`, `src/__tests__/db.test.ts`, `src/__tests__/discovery.test.ts`, `src/__tests__/prescriptions.test.ts`

### 2026-04-09 — Copilot SDK Spike: Infrastructure Verification

**Task:** Verify `@github/copilot-sdk@0.2.2` installation doesn't break existing infrastructure on `squad/copilot-sdk-spike` branch.

**Results — All Clear:**
- **Build:** `npm run build` passes clean. No TypeScript compilation errors.
- **Tests:** All 427 tests pass (15 test files, 838ms). No regressions.
- **Dependency compatibility:** SDK is ESM (`"type": "module"`), targets Node >=20.0.0, ships `.d.ts` declarations — fully aligned with our project settings (ES2022/Node16/ESM).
- **Zod shared:** SDK depends on `zod@^4.3.6`, same as our project — deduped cleanly, no version conflict.
- **No peer dependency issues:** `npm ls` shows no ERR/WARN/invalid entries.

**Spike Isolation Changes:**
- Added `"src/spike"` to `tsconfig.json` `exclude` array — spike code won't be compiled into `dist/` by `npm run build`.
- `package.json` `files` field already limits npm package to `dist/`, `.github/hooks/`, `.github/plugin/` — spike code can never ship.
- `vitest.config.ts` uses `include: ['src/**/*.test.ts']` — spike tests would only run if placed in `.test.ts` files, which is fine for PoC exploration.

**Security Notes:**
- `npm audit` shows 3 vulnerabilities (2 moderate, 1 high) in SDK transitive deps: `hono` (cookie/path traversal/IP matching issues) and `@hono/node-server` (middleware bypass). These are in the Hono web framework used internally by `@github/copilot` — not directly exploitable in our hook/MCP usage pattern but worth tracking for SDK updates.

**Files Modified:** `tsconfig.json` (added spike exclusion), `package.json` + `package-lock.json` (SDK dependency added)

### 2026-04-23: Phase 1 Monorepo Restructuring — Graham's Foundation

**Context:** Cairn monorepo foundational restructuring by Graham (Lead).

**Monorepo Architecture:**
- **`packages/types`** (`@cairn/types`) — Shared contract types (bridge events, decisions, DBOM, session identity)
- **`packages/cairn`** (`@akubly/cairn`) — Existing Cairn observability, MCP tools, plugin infrastructure
- **`packages/forge`** (`@cairn/forge`) — Forge runtime scaffold (SDK integration, deterministic execution)

**Type Governance:** Shared types in `@cairn/types`. Internal types (CairnEvent, agent types, prescription lifecycle) remain in cairn. Cairn re-exports shared types for backward compatibility.

**Build Discipline:** Root `tsconfig.json` with project references. `tsc --build` enforces correct order: types → cairn, types → forge. All 427 tests pass. Clean build, zero logic changes.

**Impact for Gabriel:** The monorepo structure enables infrastructure separation — hook infrastructure stays in cairn (close to MCP tools), but Forge runtime can have independent tooling chains. This pattern keeps infra concerns decoupled and scalable as phases progress.

**Next Phase:** Phase 2 (live runtime verification) validates type contracts during SDK harness integration.

---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).
## Session: 2026-05-28 Wave 6 Tail — WI-B Scope Locked (Deferred)

**Status:** Queued — awaiting WI-A merge

- Issue #11 scope split approved: WI-A (Cairn code), WI-B (coordinator dispatch policy change)
- WI-B assigned to Gabriel (Infrastructure/Coordinator)
- WI-B is intentionally deferred until WI-A merges (correctness dependency)
- WI-B scope: Coordinator uses \git worktree add\ per-issue instead of shared checkout

**Blocked on:** WI-A merge (Roger's implementation + Laura's tests)

**Next:** Start WI-B after WI-A is merged to main.

### 2026-05-29 — WI-B Implementation: Coordinator Worktree Dispatch

**Delivered:** Made the Pre-Spawn: Worktree Setup section in squad.agent.md (+ 2 template mirrors) enforced rather than aspirational.

**Was the Pre-Spawn section really aspirational?**
Yes — it used "should" language, omitted error handling entirely, and had no status marker. A coordinator following it literally would have done the right thing on the happy path but had no guidance for failure modes (lock files, permission errors, wrong-branch reuse, junction failures). The v0 state was documentation-only in practice.

**Key implementation decisions:**
- Activation: opt-in via `SQUAD_WORKTREES=1` (env-var only, v1). Config-based activation (`worktrees: true`) was removed from Pre-Spawn step 1 to match v1 scope, with a v2 note added to Worktree Lifecycle Management.
- Fallback on error: errors fall back to main repo rather than aborting. Skeptic persona raised "fail-closed" as an option; rejected because a broken worktree setup should not block legitimate work in v1. Documented trade-off in decision inbox.
- Parallel dispatch: warning-only with `list_agents` as the detection hint. Full state-tracking mechanism is v2.

**Surprises in template structure:**
- The two template mirrors (`.squad/templates/squad.agent.md.template` and `.squad/templates/squad.agent.md`) differ in 38 lines pre-existing (no `name:` field, no `CURRENT_DATETIME` in lightweight template in the plain version). The changed sections landed byte-identical as required.
- The only difference between primary and `.template` is 2 version-stamp lines — expected.

**Persona review findings (Code Panel, 4 personas):**
- 12 findings captured; 11 accepted, 1 rejected (fail-closed activation)
- Key fixes applied: {worktree}/{path} variable inconsistency, branch-mismatch dead end in step 2b, {branch} derivation in Cleanup, rmdir /s hazard warning, rm -f for Unix, activation section v1 note, YAML-style notation fix, {% if %} manual handling clarification, lightweight pre-render note substance

**Files modified:**
- `.github/agents/squad.agent.md`
- `.squad/templates/squad.agent.md.template`
- `.squad/templates/squad.agent.md`

**Pattern extracted:** Worktree-junction cleanup recipe (rmdir before git worktree remove) documented as `.squad/skills/worktree-junction-cleanup/SKILL.md`



---

# Gabriel — History Archive

Archived: 2026-06-01

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Gabriel (PA-B6 fence-violation retry counter + staleness detection + threat-model stubs). Concrete params: max 5 retries, jittered backoff 2^N, 100-event staleness threshold, 50ms catch-up budget. All Pass A agents complete. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

# Gabriel — History

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §9 + §13 shipped (Valanice). R2-3 sync (Gabriel ↔ Valanice) CLOSED — Aperture↔Router ack/resume handshake validated. Your Phase 3 work (§17 + §18) unblocked. Phase 2 synthesis GREEN. No blocking findings. — Scribe

📌 Team update (2026-05-28T10:30:00Z): **Crucible CTD Phase 1 Close-out (2026-05-28)** — §5 (Router Design) FINAL. 4 Aperture↔Router event shapes locked for Valanice §9 sync: `router.paused`, `router.decision`, `aperture.structural-ack-prompt`, `aperture.structural-ack`. Synthesis review: YELLOW, 1 finding routed (5: `dependentPaths` type mismatch with Rosella §7, Phase 2 §9/§10). Phase 2 coordination: Valanice (R2-3 queue mechanics sync pair). — Scribe

## 2026-05-29: Crucible CTD Phase 4 — L3.5 Scheduler Tier Promotion

**Task:** Author the L3.5 Scheduler tier promoted from `B-revisit-deferred` to
v1 (Aaron lock; Erasmus US-E-13 + rubber-duck convergence on the OoO-execution
/ dispatch-unit analog). Owner of §5 + §17; Roger owns §3 WAL acceptance of
the new `scheduler_*` sub-kinds; Graham owns §1 layer-stack diagram update.

**Deliverables:**
1. `docs/crucible-technical-design/05-router-design.md` — new §5.A subsection
   (~1.3pp, under the 1.5pp ceiling) covering responsibility, the four v1
   sub-kinds (`scheduler_dispatched` / `_deferred` / `_cancelled` /
   `_quanta_exhausted`), round-robin-with-quanta budget policy, back-pressure
   threshold protocol, Hook Bus L1Subscriber interaction, replay determinism
   (dispatch stream recorded, not recomputed), and three acceptance signals.
   §5.2 state machine amended with `dispatched_pending` precursor state and a
   paragraph documenting L3 → L3.5 → L4 flow.
2. `docs/crucible-technical-design/17-observability-telemetry.md` — four new
   catalog rows; `scheduler_dispatched` on builtin tier is silent (same
   posture as `router.decision` apply); read-path perf-counter table for
   quanta consumed, queue depth, dispatch latency, defer rate.
3. `.squad/decisions/inbox/gabriel-ctd-phase4-scheduler.md` — decision drop.

**Learning — boundary articulation as load-bearing.** The single sentence
"Scheduler decides WHICH and IN WHAT ORDER; Router decides WHETHER" did more
work than any other paragraph in the spec. Once that line existed, every
sub-decision (does the Scheduler re-evaluate on replay? does it interact with
hook verdicts? what sub-kinds does it emit?) collapsed to "if it's a
which/order question, it's mine; if it's a whether question, it's the
Router's." Boundary articulation pays for itself — the cost is one sentence,
the benefit is the rest of the section writing itself.

**Learning — replay-determinism discipline generalises.** §5.5 ("no live
policy reload") and §5.A.6 ("dispatch order recorded, not recomputed") are
the same doctrine applied to two different control-plane surfaces. Both
flow from §6.5 Hook Verdict Consistency: any decision whose re-derivation
would depend on wall-clock or non-deterministic ordering MUST be captured
as an L1 Decision and replayed verbatim. This is a reusable test for any
new control-plane tier — apply it before specifying any "scheduler /
arbiter / coordinator" component in future revisions.

**Learning — additive-sub-kind contract keeps cross-section work cheap.**
The four `scheduler_*` sub-kinds slot into Roger's existing §3.3.1
`(primitiveKind, subKind)` index without a new primitive kind. The whole
tier ships as Decision sub-kind extensions plus a read-path projection
(perf counters). This is the same pattern §17 itself uses — "harvest, don't
define." When a new tier reuses the existing primitive/sub-kind contract,
the cross-section coordination cost is one row in Roger's append validator
and one diagram update in Graham's §1.

**Files:** `docs/crucible-technical-design/05-router-design.md`,
`docs/crucible-technical-design/17-observability-telemetry.md`. Decision drop:
`.squad/decisions/inbox/gabriel-ctd-phase4-scheduler.md`.

## 2026-05-28: Crucible CTD Rev. 3 — R2 Locks for Gabriel

**Locked decisions** impact your execution model and bisect infra. Your tasks:
1. **R2-3 (Queue Mechanics):** Aperture↔Router ack/resume handshake event shapes (Gabriel ↔ Valanice cross-section sync pair during Phase 2 authoring)
2. **R2-5 (Env Snapshot):** Coordinate on nonDominatedReason field usage across layers (Rosella generates, Valanice renders)
3. **R2-4 & R2-6:** Bisect env-snapshot stamping and transitive-dep pinning may inform CI policy.

Phase 2 fan-out now unblocked. Full R2 locks in `.squad/decisions.md`.

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Infrastructure
- **Joined:** 2026-03-28T06:21:47.381Z

## Learnings

<!-- Append learnings below -->

### 2026-06-01 — M2: forge-mcp Bash Shell Init Hooks

**Task:** Deliver M2 of the forge-mcp dogfood plan — bash shell init integration
so a developer who clones the repo can wire Cairn's session-start telemetry into
their interactive bash sessions with a single command.

**Shipped (PR #44, branch squad/m2-forge-mcp-bash-hooks):**
- `.github/hooks/cairn/shell-init.sh` — sourceable bash hook
- `.github/hooks/cairn/install.sh` — idempotent `~/.bashrc` wiring
- `.github/hooks/cairn/uninstall.sh` — clean marker-block removal
- `README.md` — new forge-mcp Bash Shell Init (M2) section
- `.squad/skills/forge-mcp-shell-install/SKILL.md` — reusable pattern

**Design choices:**

1. **Hook location: `.github/hooks/cairn/`** — the natural home, parallel to
   `curate.ps1` / `record.ps1`. Users exploring the hooks directory find all
   variants together. The package (`skillsmith-runtime`) already owns its concern
   (MCP server, sessionStart.ts); shell integration is a repo/infra concern.

2. **Idempotency — two-layer guard:** install script uses marker-block grep before
   appending; shell-init.sh uses `_FORGE_MCP_SHELL_INIT_LOADED` env var so
   re-sourcing the rc file mid-session doesn't double-fire.

3. **Non-interactive safety: `[[ $- != *i* ]] && return`** — this one line makes
   the hook safe for CI, git hooks, and scripts that source rc files. It's not
   optional; without it the hook fires in every subshell.

4. **Script resolution mirrors curate.ps1 exactly:** user override →
   global npm (skillsmith-runtime preferred, cairn fallback) → repo checkout.
   Cross-platform behavioral parity is worth the duplication of the discovery
   logic. Future changes to discovery order should update both.

5. **Detached execution:** `node "$script" &>/dev/null & disown 2>/dev/null || true`
   — `disown` is bash-specific and may fail in other shells, so `|| true` is
   non-negotiable. The `&>/dev/null` silences both stdout and stderr so hook
   noise never reaches the user's prompt.

6. **Portable uninstall:** the sed-free bash state machine is the
   battle-tested pattern. It avoids GNU/BSD `sed -i` differences and sequencing
   footguns around blank-line removal plus marker-range deletion.

**Cross-platform reality:** The bash hooks work in Git Bash on Windows (tested
syntax via `bash -n`). The main risk is `node` not being on the Git Bash PATH —
documented in README. No deeper Windows work needed since the Copilot CLI
plugin already handles Windows via `curate.ps1`.

**Build/test:** tsc clean, 49/49 tests pass. No TypeScript changes — pure infra.

### Phase 3 — §17/§18 Cross-Section Harvesting Pattern

**Pattern: thin cross-cutting sections introduce no new vocabulary.** §17 and §18 are both ≤1pp sections whose job is to enumerate, not to specify. The right authoring shape for that role is:

1. **Harvest, don't define.** §17's event catalog table is built by walking every prior section's emission surfaces (§3 WAL events, §4 hook verdicts, §5 RouterDecision, §7 adapter lifecycle, §8 Applier transitions, §9 ApertureEvent kinds, §11 divergence kinds) and citing them by `(primitiveKind, subKind)` tuple. No new sub-kinds, no new types. The 18-row catalog reads as a cross-reference index, not a spec.

2. **Lock the meta-rule, not the data.** §17.1 footnote "no emitter chooses its own severity — §9.3 projector hard-codes the mapping" is the load-bearing line. It prevents the catalog from becoming a free-for-all where any subsequent section can add an `urgent` row. The catalog is descriptive; severity policy is prescriptive and owned upstream.

3. **Defer-by-shape, not defer-by-promise.** §18.4 Tension #6 deferral works because §18 explicitly maps three v1.5+ features (redaction generator, marketplace governance, key-rotation policy) onto existing extension points (L3 generator slot, tier promotion path, §11 oracle). Deferral is credible because the additive paths are concrete.

**Pattern: "X IS Y" as a v1 lock.** "Aperture IS observability" is the §17 v1 stance — zero outbound telemetry, no OTLP, no Prometheus, no log shipping. The L1 ledger is the source of truth; §9 is the rendering. This is a load-bearing simplifying assumption that depends on the single-user threat model in §18 ("the user is the operator, the developer, and the only principal"). If multi-user lands in v1.5, both sections need the operator/user persona split, but the v1 contract holds because neither section assumes external infra exists.

**Cross-section harvest discipline:** when authoring a cross-cutting section, the temptation is to "fix" inconsistencies you find while harvesting. Resist. Flag them in the decision drop as Phase 3 synthesis items for Graham to triage at the close-out gate. I surfaced four such items (CI gate sub-kind, §7 `confidence` field shape, `urgent` severity guard, v1 Tension #6 UX warning) rather than patching upstream sections — the harvester's job is to catalog, the synthesis gate's job is to reconcile.

**Files:** `docs/crucible-technical-design/17-observability-telemetry.md` (10066B), `docs/crucible-technical-design/18-security-permissions.md` (11954B). Decision drop: `.squad/decisions/inbox/gabriel-ctd-phase3.md`.

### 2026-03-28 — Recon: Prior Infrastructure & Community Practices

**Prior Infrastructure (akubly/.copilot):**
- Aaron's existing Copilot infra is production-grade, built for Windows OS development over months of iteration.
- Architecture: instructions (layered) / agents / knowledge (concepts vs technologies) / skills (with shared template+schema+observability) / hooks (10 covering full session lifecycle).
- Most sophisticated artifacts: code-reviewer agent (multi-source parallel review with 20 rules from 2,670 real reviews), persona-review skill (parallel subagent panels), tool-guards hook (5 safety guards with approval tokens and fail-open design).
- Key reusable patterns: knowledge taxonomy, workflow gates (decision-point + persona review), anti-anchoring discipline, skill template, session DB contracts, observability pipeline, tool guards.
- Domain content (Windows/Razzle/C++/ADO) is not portable — structural patterns are.

**Community Best Practices (2025-2026):**
- Context engineering has superseded prompt engineering. Core insight: context is finite with diminishing returns; optimize for smallest high-signal token set.
- Anthropic recommends: compaction, structured note-taking, sub-agent architectures for long-horizon tasks.
- Four dominant multi-agent orchestration patterns: Supervisor, Pipeline, Swarm, Graph/Network.
- Squad (Brady Gaster, GitHub) demonstrates repo-native multi-agent with drop-box pattern (decisions.md), context replication, and explicit memory in repo files.
- AGENTS.md is emerging as vendor-neutral standard (Linux Foundation). Layer: org → repo → path → agent → personal.
- Kakao's 6 principles map well to Aaron's existing ai-assisted-engineering.md.
- Aaron's knowledge taxonomy (concepts/technologies/skills) and persona review panels are innovations ahead of community consensus.

### 2026-03-28: Cross-Team Recon Awareness

**Graham (Lead)** conducted deep research into Copilot extensibility and identified the seven-layer composition model (Instructions → Skills → Agents → Hooks → MCP → Plugins → ACP). Established plugin.json as canonical distribution unit and MCP as integration standard replacing deprecated GitHub App extensions.

**Roger (Platform Dev)** mapped the three SDK layers (CLI SDK for embedding @github/copilot-sdk, Extensions SDK for distribution @copilot-extensions/preview-sdk, Engine SDK for custom agents @github/copilot-engine-sdk). Confirmed MCP as universal tool protocol and clarified that Extensions serve Graham's identified distribution strategy.

**Rosella (Plugin Dev)** surveyed plugin marketplaces and found awesome-copilot as gravitational center (170+ agents, 240+ skills, 55+ plugins). Identified three canonical formats: `.agent.md`, `SKILL.md` (agentskills.io open standard), `plugin.json` (Claude Code spec). Recommends integrating with awesome-copilot rather than building custom marketplace.

**Outcome:** Gabriel's 7 directly reusable patterns from prior infrastructure now inform all three specialists. Knowledge taxonomy is an innovation to preserve and extend. Skill template pattern validates Rosella's SKILL.md standardization. Workflow gates and anti-anchoring discipline become foundational team practices. Context engineering and context replication from community best practices align with how Squad already works and how Aaron's infrastructure was designed.

### 2026-04-05 — Prescriber Infrastructure Analysis

**Key Architecture Decisions:**
- Prescriber MUST NOT generate prescriptions in the preToolUse hot path. The 10s budget is already consumed by Node startup (~400ms) + unbounded curation. MCP-only trigger is the right call.
- `curate()` has no time cap — it loops until caught up. This is a pre-existing risk that becomes critical with any additional preToolUse work. Recommended 3s hard cap with cursor persistence.
- Prescriptions need their own table separate from `insights.prescription` (static text hints). Clear ownership: Curator writes insights, Prescriber writes prescriptions.
- MCP surface: 4 new tools (list_prescriptions, get_prescription, decide_prescription, generate_prescriptions). `decide_prescription` combines apply/reject/dismiss into one tool with action enum — every disposition becomes a Curator event.
- No new hook wrappers or hooks.json changes needed. Prescriber lives entirely in MCP server process.
- Ships as part of @akubly/cairn, not separate package. Shared DB singleton, no extra deps.

**Key File Paths:**
- `src/hooks/sessionStart.ts` — preToolUse entry point, fast-path logic, stale session detection
- `src/agents/curator.ts` — unbounded curate() loop at line 129, batch size 1000
- `src/mcp/server.ts` — MCP tool registration, 6 existing tools
- `.github/hooks/cairn/curate.ps1` — PowerShell wrapper with 3-tier script resolution
- `.github/hooks/cairn/hooks.json` — hook declarations (10s preToolUse, 5s postToolUse)
- `.github/plugin/plugin.json` — plugin manifest, references hooks.json + .mcp.json

**Performance Insight:**
- preToolUse end-to-end fast path: ~410ms (PowerShell + Node + SQLite + git). Slow path adds crash recovery (~50ms) + curation (unbounded).
- Hooks share timeout across all plugins. No per-plugin allocation. Plugins must self-budget.
- MCP server has no timeout constraint — runs as long-lived subprocess. Ideal for expensive operations.

### 2026-04-07 — Phase 7C: Curate Cap + Trigger Wiring

**Delivered:**
- 3-second soft time cap on `curate()` batch loop (TIME_BUDGET_MS=3000, checked between batches)
- Extended `CurateResult` with `capped` and `insightsChanged` flags
- Hybrid trigger wiring: preToolUse slow path and MCP `run_curate` both chain `prescribe()` when insights change
- Prescriber stub (`src/agents/prescriber.ts`) — returns `{ prescriptionsGenerated: 0 }`, ready for Roger's Phase 7D
- Session counter increment on slow path for deferral cooldown (DP5 #6)
- Fail-open: prescribe() failures are caught in both preToolUse and MCP paths
- 15 new tests (41 curator, 11 sessionStart, 23 MCP) — all passing

**Key Decisions:**
- Time cap check goes AFTER `events.length < BATCH_SIZE` — a partial final batch means "caught up", not "capped". This prevents false `capped: true` on the last batch.
- MCP `run_curate` output shape changed to `{ curate: result, prescriptions: prescribeResult }` — breaking change per spec. Prescriber errors return `null` prescriptions (partial success).
- `incrementSessionCounter()` is unconditional on slow path. In practice, double-increments are rare because postToolUse creates a session immediately after preToolUse, making subsequent calls fast-path.

**Files Modified:** curator.ts, sessionStart.ts, server.ts, curator.test.ts, sessionStart.test.ts, mcp.test.ts
**Files Created:** prescriber.ts

### 2026-04-08 — Fix sessionStart prescriber wiring test

**Problem:** Cloud reviewer flagged that `vi.spyOn({ prescribe }, 'prescribe')` in the "should call prescribe() when curate produces new insights" test was spying on a throwaway wrapper object, not the actual import used by `runSessionStart()`. The spy could never observe real calls — the test was passing vacuously.

**Fix:** Replaced the ineffective spy with direct DB side-effect assertions. After `runSessionStart()`, the test now verifies:
1. Prescriptions rows exist in the `prescriptions` table with status `'generated'`
2. `pending_count` in `prescriber_state` increased

**Learning:** When testing module-internal call chains in ESM (where you can't intercept the import binding), assert on observable side effects (DB state, file output) rather than trying to spy on re-exported functions through wrapper objects.

### 2026-04-09 — Phase 8D: DB Migration 009 + Results Module

**Delivered:**
- Migration 009: `skill_test_results` table with 5C vector constraint, 3-tier check, score range, boolean passed, JSON evidence, session FK, and 3 indexes (path, vector, run_at).
- CRUD module `src/db/skillTestResults.ts`: `insertTestResult`, `insertTestResults` (transactional batch), `getTestResults`, `getTestHistory`, `getLatestTestRun`. Evidence stored as JSON text, parsed to `string[]` on read. Snake→camel mapping in `mapRow()`.
- Registered migration009 in `src/db/schema.ts`.
- Updated schema version assertions from 8→9 in three test files: `db.test.ts`, `discovery.test.ts`, `prescriptions.test.ts`.

**Key Pattern:** Schema version assertions exist in multiple test files (db, discovery, prescriptions). All must be updated when adding a migration — grep for `toBe(N)` where N is the old version.

**Files Created:** `src/db/migrations/009-skill-test-results.ts`, `src/db/skillTestResults.ts`
**Files Modified:** `src/db/schema.ts`, `src/__tests__/db.test.ts`, `src/__tests__/discovery.test.ts`, `src/__tests__/prescriptions.test.ts`

### 2026-04-09 — Copilot SDK Spike: Infrastructure Verification

**Task:** Verify `@github/copilot-sdk@0.2.2` installation doesn't break existing infrastructure on `squad/copilot-sdk-spike` branch.

**Results — All Clear:**
- **Build:** `npm run build` passes clean. No TypeScript compilation errors.
- **Tests:** All 427 tests pass (15 test files, 838ms). No regressions.
- **Dependency compatibility:** SDK is ESM (`"type": "module"`), targets Node >=20.0.0, ships `.d.ts` declarations — fully aligned with our project settings (ES2022/Node16/ESM).
- **Zod shared:** SDK depends on `zod@^4.3.6`, same as our project — deduped cleanly, no version conflict.
- **No peer dependency issues:** `npm ls` shows no ERR/WARN/invalid entries.

**Spike Isolation Changes:**
- Added `"src/spike"` to `tsconfig.json` `exclude` array — spike code won't be compiled into `dist/` by `npm run build`.
- `package.json` `files` field already limits npm package to `dist/`, `.github/hooks/`, `.github/plugin/` — spike code can never ship.
- `vitest.config.ts` uses `include: ['src/**/*.test.ts']` — spike tests would only run if placed in `.test.ts` files, which is fine for PoC exploration.

**Security Notes:**
- `npm audit` shows 3 vulnerabilities (2 moderate, 1 high) in SDK transitive deps: `hono` (cookie/path traversal/IP matching issues) and `@hono/node-server` (middleware bypass). These are in the Hono web framework used internally by `@github/copilot` — not directly exploitable in our hook/MCP usage pattern but worth tracking for SDK updates.

**Files Modified:** `tsconfig.json` (added spike exclusion), `package.json` + `package-lock.json` (SDK dependency added)

### 2026-04-23: Phase 1 Monorepo Restructuring — Graham's Foundation

**Context:** Cairn monorepo foundational restructuring by Graham (Lead).

**Monorepo Architecture:**
- **`packages/types`** (`@cairn/types`) — Shared contract types (bridge events, decisions, DBOM, session identity)
- **`packages/cairn`** (`@akubly/cairn`) — Existing Cairn observability, MCP tools, plugin infrastructure
- **`packages/forge`** (`@cairn/forge`) — Forge runtime scaffold (SDK integration, deterministic execution)

**Type Governance:** Shared types in `@cairn/types`. Internal types (CairnEvent, agent types, prescription lifecycle) remain in cairn. Cairn re-exports shared types for backward compatibility.

**Build Discipline:** Root `tsconfig.json` with project references. `tsc --build` enforces correct order: types → cairn, types → forge. All 427 tests pass. Clean build, zero logic changes.

**Impact for Gabriel:** The monorepo structure enables infrastructure separation — hook infrastructure stays in cairn (close to MCP tools), but Forge runtime can have independent tooling chains. This pattern keeps infra concerns decoupled and scalable as phases progress.

**Next Phase:** Phase 2 (live runtime verification) validates type contracts during SDK harness integration.

### 2026-04-XX — Skillsmith Harness: Big-Think Ideation

**Mission:** Ops/DevOps-lens user story ideation for greenfield agentic coding harness v1. Target: Aaron on Windows/PowerShell. "Think big"—operability, observability, lifecycle, environment, trust-of-runtime stories.

**Delivered: 10 User Stories**

Coverage mandates met:
- **Background safety (US-1):** Alchemist experiments run isolated, silent, without context bleed into active Crucible work.
- **Failure recovery (US-2):** Sub-agent crash detection with state reconstruction from Cairn checkpoints + uncommitted artifact buffer.
- **Credentials/guardrails (US-3, US-9):** Policy-enforced secrets rotation with sub-agent attestation acks; passive credential leak detection with hard stop before Cairn commit.
- **Observability (US-4, US-10):** Live resource/model-spend dashboard + budget forecasts; pre-flight capability gap analysis before task assignment.
- **Reproducibility (US-5):** Session/variant replay from Cairn with branch-at-decision capability for counterfactual exploration and debugging.
- **Aspirational (US-6, US-7, US-8):** Autonomous rollback of expensive bad decisions (Curator anomaly detection); cross-harness collaborative Cairn ledger for squad work; hash-chained Cairn audit trail.

**Key Themes:**
- **Isolation:** Active work ≠ background experiments; separate process trees, token budgets, sandboxes.
- **Auditability:** Cairn-as-truth; hash linking; cheap but effective integrity checking.
- **Transparency:** Mirror pushes summaries; never gates flow. Observations and spend are queryable.
- **Recovery:** Write-Ahead-Log discipline at decision boundaries; state reconstruction after failure.
- **Policy Binding:** Secrets are versioned Cairn primitives, not env vars. Rotation + attestation protocol. Curator watches policy events.

**Runtime Implications (Architecture Anchors):**
- Crucible must support replay mode with branch-at-node semantics.
- Cairn checkpoints on Decision entry (not per-Primitive); supports efficient branching and log slicing.
- Sub-agents must implement attestation ack protocol for credential version checks.
- Alchemist queue persists across cold starts; experiment failures are isolated, never cascade.
- Mirror needs federation model for cross-harness aggregation (US-7).
- Curator runs both policy watches (credentials, anomalies) and leak detection; never approves—only proposes.
- Forge must support fast (<5s) pre-flight forecasting without simulation.

**Phasing Recommendation:** Start with US-2 (recovery) and US-4 (observability) — both unlock live feedback and confidence. US-3 (secrets) is non-negotiable for multi-secret scenarios. US-5 (replay) is debugging force multiplier. US-1 (isolation) is foundational for Alchemist safety. US-6/7/8 are longer-horizon innovations (Q2+).

**Stories saved to `.squad/agents/gabriel/stories.md` for reference.**


## Deliberation Round (2026-05-24)

**Round purpose:** Cross-pollinate against 6 internal lenses + Erasmus's outside
specialist take. React to Aaron's three new insights (branching sessions as
first-class, agentic-debugger vision seed, determinism load-bearing) and
position on Erasmus's 4-layer stack + 5 open tensions.

**Deliverable:** `.squad/decisions/inbox/gabriel-deliberation-position.md`
**Role:** Build / Infrastructure (ESLint rules, cross-package guardrails, lint gates)
**Status:** Cycle 2 C8 resolution: eslint no-restricted-imports stays strict (no test-dir exemption).
**Last update:** 2026-05-29

**Key contributions:**
- M1 acceptance criteria: Cross-package import guard (ESLint rule, auto-check)
- Cycle 2: Supported Genesta's strict layering stance; no exemptions added
- Infrastructure load-bearing: Dependency direction lint prevents kernel erosion

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
<!-- Append learnings below -->

**Headlines:**
- KEEP 5, REVISE 4, WITHDRAW 1, MERGE 1 of my 10 original ops stories.
- Added 6 NEW stories (US-Ga-NEW-11..16), all centered on the now-load-bearing
  determinism/observation-capture/hermetic-replay/Router-observability stack.
- ENDORSED Erasmus's 4-layer stack with a strong caveat: the Router is the
  single load-bearing safety choke-point and must be the most-observed,
  most-tested component — structured events, replay corpus, property tests,
  policy versioning, Mirror as view-only.
- **Tension #4 (mine — heavyweight ops vs solo user) resolved:** trim
  aggressively for v1 (drop attestation broadcast, federation, ML leak detection,
  standalone forecasting); keep WAL/checkpoint, hermetic replay, bisect, branch
  primitive, regex leak detection, spend dashboard, hash-linking, Router
  observability, determinism CI smoke test. Re-promotion of the heavyweight
  layer is additive, not breaking.

**Key cross-references found:**
- Erasmus US-E-1/E-2 + Aaron Insight #1 + my US-Ga-5 = same primitive (hermetic
  replay with branch-at-position) seen from four angles. Merged.
- Roger US-R-3 + Alexander US-A-3 + my US-Ga-5 = same replay story from data,
  SDK, infra lenses. Strong product signal.
- Valanice US-V-1/V-2 UX surfaces are *invalidated* without hermetic replay
  (NEW-11). Determinism is the contract her UX depends on.
- Rosella US-Ro-5 evolution loop *requires* my US-Ga-1 isolation infra.
- Graham Q-B already pre-resolves my US-Ga-8 scope (KEEP hash-link, DEFER
  witness/notary).

**Standing infra commitment:** If Aaron approves the v1 cut, my next-cycle
deliverables are (in dependency order): NEW-11 recording shim contract → NEW-13
branch metadata in Cairn schema → NEW-14 snapshot/compaction contract → NEW-15
Router event schema + property-test scaffold → NEW-16 CI determinism smoke test
→ NEW-12 bisect CLI.

## Team updates 2026-05-24

T5 resolved — Crucible built on Copilot SDK, replaces Copilot CLI as Aaron's daily driver. Sonny hired as debugger-lens specialist; see his US-S-1..US-S-9 stories and L5 (Investigation Surface) structural proposal in decisions.md.

## 2026-05-24 Round 3: Pre-commit hook bus — Router verdict

# Gabriel — Round 3: Pre-commit hook bus — Router verdict
**Date:** 2026-05-24T2300Z
**Re:** Alexander Round 3 reply to Sonny — `{continue, observe, pause}` pre-commit
hook bus shared by L3/L4/L5; only `pause` reaches L4 (Router).
**Verdict:** **ENDORSE WITH REFINEMENTS** (4 hard requirements, 1 dep on Roger).

This extends my Round 2 thesis ("Router is the single load-bearing safety
component") rather than re-litigating it. The bus split is a *concentration* of
Router load onto the verdicts that actually matter for safety, not a
fragmentation. But the bus inherits enough Router-grade requirements that I want
them named explicitly before it gets built.

---

## 1. Does the bus fragment the Router's role?

**No — it sharpens it, provided the four refinements below land.**

My Round 2 claim was that the Router is the single safety choke-point because
*every action that mutates the world goes through approval policy*. Alexander's
bus doesn't dilute that — it adds a *pre-filter* (predicate evaluation) whose
only safety-relevant output is `pause`, which still routes to the Router. The
Router remains the only component that can stop the world.

What changes: the Router is no longer the *only* component with structured
observation responsibilities. The bus is now a **second load-bearing component**,
but in a different axis:

| Component | Load-bearing for |
|---|---|
| Router (L4) | **Safety** — gating mutations, recording approval policy decisions |
| Hook bus (L1-adjacent) | **Routing correctness** — verdict dispatch, no lost `pause`, no leaked `observe`-→-`pause` confusion |

These are different failure modes. Router failure = unsafe action commits. Bus
failure = either (a) a `pause` is dropped → unsafe action commits anyway (same
failure as Router failure), or (b) `observe` floods the Router (DoS the safety
queue). Both are fatal. **So yes, the bus is now equally load-bearing — just in
a narrower correctness sense than the Router itself.**

Architectural framing I want adopted: *the bus is part of the safety perimeter,
not infrastructure beneath it*. It gets Router-grade treatment for observability,
fuzzing, and replay. See refinements R1–R4.

## 2. Property / fuzz target (extends US-Ga-NEW-15)

**R1 — The bus inherits US-Ga-NEW-15's fuzz/property obligations.** Non-negotiable.

Properties the bus must satisfy under property-based testing and the recorded-
input replay corpus:

- **P1 (no-leak):** No `observe` verdict ever produces a Router-side state
  change. Stated negatively for fuzzing: `forall trace, count(router.state_mutation where verdict=observe) == 0`.
- **P2 (exactly-once-pause):** Every `pause` verdict reaches the Router exactly
  once. `forall verdict=pause, count(router.received_for(verdict.id)) == 1`.
  This is the property that fails silently in most bus implementations and kills
  people; it must be the top fuzz target.
- **P3 (closed enum):** The verdict enum is `{continue, observe, pause}` and
  rejected at the bus boundary if extended at runtime. Extension goes through
  schema migration, not field overloading. (Lesson learned from US-S-9's
  "extensible verdict enum" — extensibility is a *schema-time* property, not a
  *runtime* property.)
- **P4 (ordering within primitive):** All verdicts for a given candidate write
  resolve before the write commits. `forall write w, all_verdicts(w) precedes commit(w)`.
  This is the property that makes the bus a *pre-commit* hook rather than a
  best-effort observer.
- **P5 (no continue-side-effect):** `continue` verdicts produce zero observable
  state change anywhere (no log line, no counter, no event). This is what makes
  it the "zero-cost default" Alexander promised; if it isn't actually zero-cost
  we'll discover it under fuzz at p99 budget violations, not in production.

The Router-side properties from US-Ga-NEW-15 (policy version in every decision,
deterministic verdict given identical input + policy version) carry forward
unchanged — they just now apply to a smaller, sharper input set.

## 3. Replay over recorded inputs

**R2 — The bus's verdict stream is part of the replay substrate. The bus *itself*
is stateless dispatch and does not.**

Distinction:
- **Bus runtime** (the dispatcher): stateless function `(candidate, predicates) → verdicts[]`.
  Replay derives from re-running predicates over recorded input. No record needed.
- **Predicate registry** (L5's registries per Alexander's diagram): stateful.
  Per-fork. Already covered by my NEW-13 (branch metadata in Cairn schema).
- **Verdict stream** (what the bus emitted): **must be recorded**. This is the
  attribution trail. Without it, a replay can't distinguish "the predicate
  registry was different" from "the bus dispatched incorrectly." Recording the
  emitted verdicts makes the bus *falsifiable* against replay.

**Record requirements for each non-`continue` verdict:**
- `verdict` (observe | pause)
- `predicate_id` and `predicate_version` (which predicate fired)
- `policy_version` (active Router policy at evaluation time — see §5)
- `candidate_primitive_hash` (content-addressed input)
- `read_set_hash` (Sonny's US-S-3 — the bus inherits this)
- `evaluation_timestamp` (monotonic, not wall)
- `fork_id` (Alexander's "predicates don't back-propagate" rule needs this in the record)

`continue` verdicts are not recorded individually (would violate P5). A periodic
counter is sufficient: "N continue verdicts since last non-continue, span
[t0, t1]." That gives replay enough to verify completeness without paying per-
verdict cost.

## 4. Volume / fan-out — the noisy-neighbor risk

This is the refinement I feel most strongly about. Alexander mentions predicate
cost on the hot path but frames it as a *per-evaluation* cost (the 1ms p99
budget). The bus has a second cost axis: **fan-out**.

**Scenario that worries me:** Aaron sets a logpoint on a hot primitive
("observe-only watch on every `Decision` write in the planner subtree"). During
a single-step session against a Forge run that does ~500 Decision writes/sec,
the bus emits ~500 `observe` verdicts/sec. Subscribers:

- L2 Salsa (writes Observation, invalidates queries) — designed for this load
- L4 Router — must **not** see these (P1) — fine
- L5 registries — updates predicate state (hit counter) — designed for this
- Mirror — pushes summary to UI — **not designed for 500 Hz fan-out**
- Curator — writes insight rows — **definitely not designed for 500 Hz**
- Alchemist — irrelevant for observe-only, should not subscribe

**R3 — Bus subscriber contract:**

1. **Explicit subscription per verdict type.** Mirror and Curator subscribe to
   `pause` only, never `observe`, unless they explicitly opt in *and* declare a
   sampling rate. Default is "no observe traffic" because most subscribers
   can't handle it.
2. **Bounded queues per subscriber, with documented drop policy.** If a
   subscriber's queue fills, the bus drops the *oldest* `observe` for that
   subscriber and increments a drop counter that Mirror surfaces. **Never
   silently drop.** `pause` queues are unbounded (back-pressure to the writer
   is correct here — if Router is wedged, blocking the writer is the safe
   failure mode).
3. **Sampling at the bus boundary, not at the subscriber.** "Pause every 100th"
   sampling predicates (Alexander's example) emit verdicts at the sampled rate,
   not at the raw rate. The bus must support `verdict_rate ∈ {full, sampled(N), threshold}` as a first-class
   registration parameter. Otherwise Aaron's 500 Hz logpoint becomes a 500 Hz
   bus dispatch even if only every 100th is "interesting" — wasted CPU.
4. **Subscriber budget reporting.** Each subscriber declares a max
   verdicts/sec it can handle. The bus refuses registrations that would
   exceed declared budgets at predicate-registration time, not at runtime.
   Surface in `cairn ops bus status`.

**Bottleneck verdict:** with R3 the bus is *not* a bottleneck. Without R3, a
naive fan-out implementation will be Aaron's first p99 outage during his first
serious debugging session, and we'll spend a week back-patching backpressure
into a system that should have shipped with it.

## 5. Policy-version-in-ledger

**R4 — Policy version tags every `pause` verdict (mandatory) and every `observe`
verdict (mandatory). Continue verdicts skip (per P5).**

Round 2 commitment: every Router decision records the active policy version.
That commitment now extends:

- **`pause` verdicts** carry the policy version that *will be* used by the
  Router to evaluate them. This is the version at *bus emission time*, not at
  *Router receipt time* — otherwise a policy hot-swap mid-flight produces a
  verdict that can't be reproduced under replay.
- **`observe` verdicts** carry policy version too, for a different reason: the
  observation is attribution evidence ("under policy vN, this primitive matched
  predicate P"). If Aaron later asks "why did we observe this?" the answer
  requires the policy version. Same record cost, much higher debug value.
- **`continue` verdicts** are uncounted/unrecorded (P5), so they trivially
  inherit "no version" — they're not evidence of anything.

This also resolves an ambiguity in Alexander's proposal: he says "L4 approval
policy" registers predicates on the bus. Those predicates are themselves
policy-versioned artifacts. So we have *predicate version* (L5 registration
identity) AND *policy version* (L4 active policy at evaluation time). Both must
ride every recorded verdict; they answer different questions ("which predicate
fired" vs "under what policy did it fire").

## 6. Verdict — ENDORSE WITH REFINEMENTS

I endorse Alexander's bus split. It strengthens the Router-as-safety-choke-point
thesis by *removing* observe-traffic from the safety surface, which was
something my Round 2 didn't think hard enough about. US-S-9's collapse holds
where it matters (pause = approval), and Alexander's refinement is correct
that logpoints/sampling should not wake L4.

### Router-side contract (what L4 commits to)

Given the bus delivers verdicts to L4:

1. **L4 receives `pause` only.** If L4 ever receives `observe` or `continue`,
   that is a bus bug and L4 logs a structured error + drops. (Defense in depth
   for P1.)
2. **L4 acknowledges receipt within 50ms** (bus → Router transit budget). A
   missing ack within budget is a bus alarm (P2 violation candidate).
3. **L4 records, per `pause` verdict received:**
   - All bus-side record fields (predicate id+version, policy version, primitive
     hash, read-set hash, fork id, evaluation timestamp)
   - Router-side fields (Router policy version at receipt, Router decision,
     decision timestamp, decision latency)
   - Approval outcome (approved | rejected | escalated | timeout)
4. **L4 emits a `RouterDecision` event onto the bus's *outbound* channel** (L2
   subscribes — replay derives Router behavior from this stream). This closes
   the loop: bus → Router → bus → L2.
5. **L4's state is replayable from the recorded `pause` verdict stream + policy
   versions alone.** No hidden state, no clock dependence beyond recorded
   timestamps. Fuzz target: replay-equivalence.

### What I'm *not* endorsing (yet)

- **No commitment yet on bus location in the dependency graph.** Alexander
  draws it as "L1's pre-commit hook bus." I'd accept that *if* the bus's
  verdict stream is in the WAL (see Roger dependency). If it's not in the WAL,
  the bus is logically L1.5 — between commit and ledger — and that's a
  layering smell we should debate explicitly in Round 4.
- **No commitment on Mirror/Curator/Alchemist as subscribers.** R3 mandates
  explicit per-verdict-type subscription; the default is "you don't get observe
  traffic." Mirror is welcome to subscribe to `pause` for UI; Curator and
  Alchemist should justify any subscription in writing.

## 7. Dependency on Roger (WAL/L1 verdict — HARD)

**Roger must confirm that the bus's verdict stream lands in the WAL before
subscriber dispatch.**

Specifically:
- Recorded verdicts (per §3) hit the WAL *before* the bus dispatches to any
  subscriber.
- Crash mid-dispatch: on restart, the bus re-reads the WAL tail and re-dispatches
  any verdicts whose subscriber-ack records are missing. This makes P2 (exactly-
  once-pause) survivable across crash; without WAL-first, P2 is best-effort and
  the safety property degrades to at-most-once, which is *unsafe*.
- The WAL record format for verdicts is a Roger contract, not mine. I need it
  to be queryable by `predicate_id`, `policy_version`, `fork_id`, and time
  range for replay/bisect (NEW-12) and fuzz harness inputs (NEW-15).

**If Roger's verdict is "WAL doesn't carry bus traffic" — I withdraw the
endorsement.** P2 (exactly-once-pause) is not achievable without durable
ordering ahead of dispatch, and exactly-once-pause is the property that prevents
unsafe commits during crash windows. Soft fallback (in-memory queue + periodic
checkpoint) is acceptable for `observe` traffic; *not* acceptable for `pause`.

The narrowest viable Roger commitment that keeps my endorsement intact: *"pause
verdicts are durable in the WAL before bus dispatch; observe verdicts may use
a lighter-weight ring buffer with bounded replay window."* That split mirrors
the safety/observability split nicely.

---

## Summary (for coordinator)

**ENDORSE WITH REFINEMENTS.** Alexander's `{continue, observe, pause}` bus split
*strengthens* the Router-as-single-safety-choke-point thesis by removing observe
traffic from L4 — the Router still owns every pause, and pause is the only verdict
that can mutate the world. Four refinements are mandatory (R1: bus inherits the
US-Ga-NEW-15 fuzz/property regime; R2: non-`continue` verdicts are recorded with
predicate+policy versions and read-set hash; R3: explicit per-verdict-type
subscription with bounded queues and bus-side sampling; R4: policy version tags
every pause and observe verdict). Router-side contract is in §6 (L4 receives
pause only, acks within 50ms, records full lineage, emits `RouterDecision` onto
outbound channel, is replayable from the recorded stream alone). **Hard dependency
on Roger:** pause verdicts must land in the WAL before bus dispatch, or
exactly-once-pause (P2) collapses to at-most-once and the safety property is
lost; observe verdicts can use a lighter ring buffer. If Roger says "WAL doesn't
carry bus traffic," I withdraw and we go to Round 4.


## 2026-05-24 Round 4: Phase B reconciliation against `stunning-adventure`

**Inbox:** `.squad/decisions/inbox/gabriel-reconciliation-2026-05-24T2330Z.md`

**Headlines:**
- ALREADY-EXISTS: 0. PARTIALLY-EXISTS: 4. NET-NEW: 6. CONTRADICTS-EXISTING: 1.
- The existing `packages/forge/src/decisions/` module is the closest analog to the Crucible Router: `createDecisionGate` is a hook observer that returns `permissionDecision: "ask"` to delegate to the SDK's native permission handler. Recording is fail-open. No verdict taxonomy, no policy version, no ack channel.
- **No property-based or fuzz tests exist anywhere in `packages/`** (`grep fast-check|fc\.` is zero). My NEW-15 + Phase-A R1 fuzz regime is net-new infrastructure, not an extension of an existing harness.
- The `LocalDBOMSink` (forge/telemetry/sink.ts) is the *exact* fail-open + observable-drop-counter pattern my R3 mandates — at the persistence layer, not the dispatch layer. Worth citing as the model, not reinventing.
- `CairnBridgeEvent` extractors already redact tool args and result content (forge/bridge/index.ts:130–146). Tension #6 (privacy) is **already pre-decided** in production code; hermetic-replay must reconcile or rebuild the redaction discipline.
- **Defer-to-owner (Graham + Alexander):** my Round-3 §6 commitment to ≤50ms ack between bus and Router is **unachievable on the existing primitives** — there is no Router process distinct from the hook observer, no monotonic clock, no ack channel. The 50ms budget stands as the *new* contract; I flag it as contradicting existing reality, not silently relax it.
- **Hard dep still standing on Roger:** Cairn's `journal_mode = WAL` is SQLite storage WAL, not a verdict-dispatch WAL. Phase-A §7 (pause-verdict-WAL-before-dispatch) is achievable via per-verdict SQLite transaction wrapping, but Roger has to confirm L1 supports fsync-before-callback on the `pause` path.

**Summary:** Reconciled my six Round-2 stories + four Round-3 refinements + Phase-A signoff content against the existing Cairn + Forge + skillsmith-runtime + runtime-cli + types packages. The good news: the *structural patterns* the Crucible Router needs (HookComposer fail-open isolation, DecisionRecord schema, ProvenanceTier {internal, certification} split, telemetry sink observable-drop discipline, fail-open + console.warn pattern at every boundary) already exist in production code and should be cited as the deployment baseline rather than reinvented. The bad news: nothing that's actually load-bearing for Router safety exists today — no verdict enum, no policy versioning, no read-set capture, no replay driver, no property/fuzz harness, no Router process distinct from the SDK permission handler, no WAL ordering on dispatch, and the entire `decisions` module is one fail-open recording call away from the spec I committed to in Round 3. Ten of eleven items I checked are net-new or substantially net-new; one contradicts existing reality (≤50ms ack, deferred to Graham + Alexander as L4 owners); zero are already-exists. The reconciliation does *not* invalidate any of my Round-2/3 stories — it confirms they are necessary new infrastructure, not redundant restatements.


## 2026-05-25 Round 5 SPIKE: Fork (c) parallel-ingest / forensic observer

**Scope:** Per Aaron's commission after Roger's Round-4 finding that Phase A's per-row pre-commit hook bus is structurally incompatible with `better-sqlite3` (no exposed pre-fsync row hook). Fork (c) asks: can Crucible run as a **read-only observer downstream of an unchanged Cairn**, tailing `event_log` as a change-feed via `getUnprocessedEvents(cursor)`? Investigated CDC surface in `D:\git\stunning-adventure`, re-designed L4 under post-hoc constraint, mapped Sonny's 9 stories against the constraint, enumerated safety properties Crucible CAN/CANNOT enforce, specified operational topology and crash semantics, evaluated (c)→(a) and (c)→(b) hybrid trajectories.

**Verdict: ENDORSE-WITH-CAVEATS.** (c) ships in weeks, requires zero Cairn schema changes, preserves replay-from-stream (the one Phase A commitment that actually matters for Aaron's workflow), and survives 5 of Sonny's 9 stories clean + 3 degraded + 1 lost (US-S-9 breakpoint=approval-request, which only works pre-commit). The Round-3 hookbus contract collapses meaningfully: P2 (exactly-once-pause) and P4 (pre-commit ordering) become meaningless under post-hoc; P1/P3/P5/policy-versioning/replay-equivalence all survive. **My Round-2 "Router is the single load-bearing safety choke-point" thesis does NOT survive (c) intact** — it splits into Cairn's existing tool-call-granularity hook (safety floor, unchanged) + Crucible's primitive-granularity forensic Router (investigation only). Verdict taxonomy reframes from {continue, observe, pause} to {observe, alert, quarantine-downstream, rollback-proposal, escalate-policy-change}. The post-hoc dial moves entirely on detection/attribution/repair — prevention reverts to whatever Cairn already does.

**Four caveats Aaron must price:** (C1) primitive-level pre-commit prevention is lost; (C2) Cairn must commit to `causal_read_set` in `event_log.payload` JSON or US-S-3 collapses; (C3) Cairn must make "all mutations emit shadow events" an invariant (today it's convention; 7 tables mutate in place); (C4) **incentive-collapse risk** — once forensic Crucible works, the organizational appetite for the (a)/(b) cutover may evaporate, leaving us shipping the Copilot-CLI-hook safety posture we explicitly set out to replace. Aaron must commit in advance to either a hard 6-month (a)/(b) deadline OR an explicit "forensic-only is our long-term posture" decision; floating between them is the failure mode.

**Anti-anchoring alternative I considered and rejected (but flagged):** (c) is "we built a really good debugger and called it a safety system." Under this reading, ship (a) or (b) at the cost of longer timeline because (c) caps Crucible at the safety ceiling Crucible was supposed to raise. I stay at ENDORSE-WITH-CAVEATS because (i) Aaron's actual incident distribution is "I didn't notice the agent went off the rails for 20 minutes," which post-hoc-with-1s-alert solves, not "irreversible commit in the 100ms pre-commit window"; (ii) (c) is reversible — the predicate/verdict/policy contracts are shared across all three forks, only enforcement mechanism differs.

**Tags on other forks.** Fork (a) port: killer issue is the **unsafe dual-write migration window** (6+ months where Crucible-L1 is unverified against Cairn truth — during which window Crucible's safety properties *are* (c)'s anyway). Fork (b) SQLite-hooks: killer issue is **better-sqlite3 doesn't expose `sqlite3_update_hook`/`sqlite3_preupdate_hook`** in its JS API — would require forking the binding, switching binding, or shipping a native SQLite extension; also preupdate hooks hold the writer lock so human-in-the-loop predicates would livelock concurrent sessions. (b) ends up being (c) + a microsecond-bounded fast-predicate window on top.

**Recommended trajectory if (c) wins:** ship v1 → measure 4-8 weeks of Aaron's daily use → use the actual incident corpus (what did Crucible flag post-hoc that *should* have been prevented?) to evidence-base which subset of predicates need promotion to pre-commit in v2. Sharply scopes (a)/(b)'s work and lets Aaron's real workflow drive the safety/performance tradeoff rather than our pre-build guesses.

**Output:** `.squad/decisions/inbox/gabriel-spike-fork-c-parallel-ingest-2026-05-25T0030Z.md` (full survey + survival matrix + safety matrix + operational topology + hybrid trajectory + verdict + tags).

## 2026-05-25 Round 7: Triage of Gabriel stories against v1 framework

**Inbox:** `.squad/decisions/inbox/gabriel-triage-2026-05-25T0200Z.md`

**v1 bar:** Aaron runs one-week productivity loop where every Crucible improvement is made by Crucible. Substrate is A.3 hybrid (custom pure-TS append-only WAL + better-sqlite3 for derived). Fork (c) rejected — pre-commit pause and unified Router restored.

**Triage headline counts:** 8 T1 (4 safety-critical sub-list + 4 productivity-loop), 4 T2, 3 T3, 1 T5, 1 v1.1-ops park, 2 DROPs (fork-(c) verdict taxonomy + observer-topology).

**T1 safety-critical sub-list (Router-grade, non-negotiable for v1):** R4 (policy_version on every recorded verdict) → R2 (verdict-stream recording in WAL's hook_verdict_witness BLAKE3 CAS) → R1∪NEW-15 (bus+Router property/fuzz regime P1–P5, with fast-check toehold on HookComposer sprint 1) → R3a (per-verdict-type subscription default + bounded observe queues + observable drop counter, modeled on LocalDBOMSink).

**T1 productivity-loop:** §6.1–§6.3+§6.5 Router-side contract (pause-only receipt, ≤50ms ack instrumented, lineage recording, replayability-from-stream — finally measurable on A.3 because Router can exist as a real component in the L1 writer process) → NEW-11a (replay driver over A.3 WAL + existing bridge stream; don't gold-plate) → NEW-13a (branch metadata columns merged with Roger's A.3 migrations) → NEW-16a (single CI smoke test: record → replay → byte-equal assertion).

**Key splits:** NEW-11 split 3-way (a=T1 replay driver, b=T2 deep content capture, c=T3/park external IO hermeticism). NEW-12 split (a=T2 linear bisect, b=T3 branched bisect). NEW-13 split (a=T1 schema, b=T3 fork CLI). NEW-16 split (a=T1 smoke, b=T2 full conformance matrix). R3 split (a=T1 bounded queues + pause-only default, b=T2 budget refusal + bus-side sampled(N) registration). §6 split (§6.1–.3+.5=T1, §6.4 RouterDecision outbound pending Cassima Q#2).

**Merges:** NEW-15 merges into R1 (one fuzz harness for bus+Router). Round-4 reco `policy_version` on DecisionRecord merges into R4. fast-check toehold is sub-task of NEW-15/R1.

**Drops:** Fork-(c) verdict taxonomy {observe, alert, quarantine-downstream, rollback-proposal, escalate-policy-change} DEAD (pre-commit pause restored). Fork-(c) "Crucible-as-observer-of-Cairn" topology DEAD (A.3 writes L1 WAL in-process). Fork-(c) incident-corpus predicate-promotion heuristic recast as v1.1 ops note (architecture motivating it died, empirical-prioritization habit survives).

**Re-cast against A.3:** NEW-11a (sources from L1 WAL via L1Subscriber per open#7, not event_log tail). NEW-12a (WAL ULID-sortable offset is the bisect coordinate). Two-routers framing dies (Router is unified). My Round-4 "≤50ms unrealizable" worry dissolved — on A.3 the Router runs in the same TS process as L1 group-commit, so ack-budget is measurable for the first time.

**Defer to T5:** NEW-14 (snapshot/compaction) — v1 volume insufficient; re-trigger when incident corpus shows pain.

**Five open Qs for Cassima:** (1) Router process placement — inline in L1 writer (recommend) vs co-process with IPC ack. (2) Mirror input contract — Mirror as projector over R2's recorded stream (strongly preferred; makes §6.4 a T1 sub-task of R2) vs Mirror as push subscriber on a separate outbound channel (then §6.4 is T2). (3) Policy hot-swap fence — recommend fence-at-group-commit-boundary (cheap one-time cost; silent mid-flight swap kills replay determinism). (4) Determinism conformance v1 scope — recommend NEW-16a smoke enforced + A1–A4 spec written but only A1+A3 enforced (A2/A4 covered by schema validation). (5) Archivist crash-detect replacement urgency — T1 or T2 depending on Cassima's p99 crash-during-Aaron's-one-week-window judgment; my instinct is T2.

**Strongest opinion:** if we ship items 1–4 of the safety-critical sub-list first, we have a credible Router-as-safety-chokepoint claim even if items 5–8 slip a sprint. Worst-case slip is "productivity loop is slower", not "safety property collapses". Sprint 1 must land: R4 + the fast-check toehold + the L1 WAL hook_verdict_witness population path. Without those three, every other T1 story is unfalsifiable.


### 2026-05-28 — CTD Phase 1 Lane 5: §5 Router Design authored

Authored `docs/crucible-technical-design/05-router-design.md` (≤3pp) under
the R2 locks. Three patterns worth carrying forward:

**1. Router state machine as a projection, not a process.** The
`paused-awaiting-structural-ack` sub-state (R2-3 LOCK) is not stored in a
Router-side queue or status table. It is materialised by the L2 projection
from a `router.paused` Decision row plus any subsequent
`aperture.structural-ack` Observation. The Router itself is stateless
across restart with respect to paused work — on boot it scans L1 for
unacked `router.paused` rows. This collapses three potential bugs at once:
queue-vs-ledger divergence on crash, double-pause on re-emission, and
"hidden control plane state" that would break §6.5 Hook Verdict
Consistency. The general lesson: if a piece of runtime state has a single
source of truth in the ledger AND the cost of re-derivation is bounded,
do not cache it — even if "performance" intuition says you should.

**2. Cross-section event-shape contract as the deliverable.** The
Gabriel↔Valanice sync pair on R2-3 was unblocked by writing the contract
*as a table in the decision drop* rather than as prose in §5. Four columns
(discriminator string, host primitive kind, payload fields, guarantees)
plus three numbered idempotency guarantees gave Valanice everything she
needs to build §9's `StructuralApprovalQueue` projection without a single
follow-up question. The contract table belongs in the decision drop (the
coordination artifact) more than in the spec section (the design
artifact); §5 references the shapes, the decision drop *commits* to them.
Pattern for future sync pairs: tabulate the events at the boundary with
explicit hosting-primitive + idempotency-cardinality, and ship that table
to the other author *before* their section is authored.

**3. Tier-as-attribution, never as inference.** Classification of
structural vs data is determined by the generator's declared interface
(`StructuralProposalGenerator` vs `DataProposalGenerator`), NOT by
re-inspecting the payload. Same discipline for `sourceTier`: the harness
stamps it at load (per the Round 5 #6 lock on `OptimizationHint.source`),
and the Router reads it as ground truth. Re-deriving either field at L4
would couple L4 to L3 internals AND break the Trust-Tier Monotonicity
proof obligation (§6.7) because the proof relies on the tier value being
carried unmodified through the row's causal lineage. The principle:
classification fields that participate in invariants must be *carried*,
never *inferred at consumption*.

📌 Team update (2026-05-28T20-00-00Z): **Crucible CTD Phase 4 UIS Framing Lock — 8/8 STRENGTHENS + Rubber-Duck Reframing ADOPTED** — All 8 team weigh-ins returned STRENGTHENS verdicts; rubber-duck delivered precision reframing ("minimal typed trace algebra" vs "universal ISA"); Aaron locked three coupled decisions: (1) adopt reframing (ADR-0019), (2) adopt BOTH missing concepts (CALL/RET + Scheduler tier), (3) Phase 4 NOW. All 4 amendments SHIPPED (yours §1/§6/§19 FINAL; Roger §3/§10 FINAL; Gabriel §5/§17 FINAL; Laura §11/§16 FINAL). CTD structurally complete; synthesis review in flight. Merged to decisions.md. — Scribe

## Pass A Review Closure (2026-05-29)

**Role:** Crucible CTD design panel + triage  
**Status:** See .squad/orchestration-log for detailed execution status  
**Disposition:** Graham fully executed, Valanice triaged (pending filesystem edits), Rosella/Gabriel/Roger/Laura silent (pending next session)

See .squad/identity/now.md and .squad/log/2026-05-30-072142Z-crucible-pass-a-review.md for full context.

## 2026-05-30: Pass A Execution — Three Applier/Infrastructure CTD Edits

**Task:** Execute three Pass A findings from the Crucible CTD design panel (Original Pass + Pass A) that were assigned to Gabriel but went silent during triage (likely stale background agent context).

**Deliverables:**
1. **PA-B6 fence-violation retry counter (BLOCKING)** — Added explicit etriesRemaining parameter, jittered exponential backoff, and telemetry to the Applier fence-violation flow in §8.3. Max retries = 5 (permits up to 5 concurrent hook emissions racing the append). Backoff jitter = `baseDelayMs * (1 + random() * 0.3)` where `baseDelayMs = 2^retryAttempt` (exponential: 2ms, 4ms, 8ms, 16ms, 32ms). Telemetry signals: `crucible.applier.fence_violation{retries, sessionId}` on every retry; `crucible.applier.fence_exhausted{sessionId}` on 5-retry failure. Added two new catalog rows to §17.1 (`fence_violation_retry` and `fence_exhausted`).

2. **Back-pressure projection staleness** — Defined staleness detection and recovery semantics in §5.A.4. Staleness threshold = `projectionLastSeenOffset < ledgerHead - 100` events (approximately 1 group-commit batch at p99 ≤1ms). On staleness detection, Scheduler emits `observation{subKind:'projection_stale'}` and triggers synchronous catch-up (blocks dispatch for at most 50ms), then defers all proposals with `reason:'projection_stale'` until projector confirms caught-up via `observation{subKind:'projection_recovered'}`. Added two new catalog rows to §17.1.

3. **Subsystem-specific threat-model stubs** — Coordinated with Graham's four landed ADR bodies (0002-l1-wal-substrate, 0006-router-policy-chokepoint, 0011-observation-commitment, 0018-pareto-incomparable). Added threat-model subsections to §3.15.1 (L1 WAL / ADR-0002), §5.9 (Router / ADR-0006), §11.10.2 (Hermetic Replay / ADR-0011), and §17.3.2 (Observability / ADR-0018). Each stub cites the authoritative ADR, highlights key security implications (local-disk exposure, tamper-evidence, policy-bypass mitigation, multi-candidate visibility), and cross-references §18.1 (single-user threat model) and §18.4.1 (PII/secret handling).

**Learning — spec precision as implementation contract.** The PA-B6 blocker required concrete numbers (max retries, backoff formula, telemetry signal names) precise enough that Roger could implement from the spec alone. "Bounded retries" is not enough — "max retries = 5" + exponential jitter formula + signal name is. The Pass A review flagged this gap; the fix demonstrates the discipline: specs that don't name their constants and signals aren't implementation-ready.

**Learning — staleness recovery needs active detection, not passive drift.** The original §5.A.4 described the back-pressure projection query but didn't specify what happens when the projector lags. PA finding: without staleness detection + recovery semantics, the Scheduler silently operates on stale data until divergence surfaces as a bug. The fix: offset comparison threshold (100 events), synchronous catch-up gate (50ms budget), fallback defer behavior (`projection_stale` reason), and recovery signal (`projection_recovered`). The spec now has testable assertions for Laura.

**Learning — threat-model stubs as ADR cross-reference anchors.** Rather than duplicating ADR security analysis in each subsection, the stubs cite the ADR as authoritative (`governed by ADR-NNNN`) and extract 3-5 key points (exposure, mitigation, boundary). This keeps subsection threat models lightweight (≤1pp) while preserving full traceability. The pattern: subsection = what, ADR = why + full analysis + alternatives rejected. Threat-model stubs are pointers, not duplicates.

**Files Modified:**
- `docs/crucible-technical-design/08-applier-decision-gate.md` (§8.3 fence retry semantics)
- `docs/crucible-technical-design/05-router-design.md` (§5.A.4 staleness recovery + §5.9 threat-model stub)
- `docs/crucible-technical-design/17-observability-telemetry.md` (§17.1 four new catalog rows + §17.3.2 threat-model stub)
- `docs/crucible-technical-design/03-l1-wal-substrate.md` (§3.15.1 threat-model stub)
- `docs/crucible-technical-design/11-hermetic-replay.md` (§11.10.2 threat-model stub)

**Decision drop:** `.squad/decisions/inbox/gabriel-pass-a-applier-infra.md`
**Next Phase:** Phase 2 (live runtime verification) validates type contracts during SDK harness integration.

---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).
## Session: 2026-05-28 Wave 6 Tail — WI-B Scope Locked (Deferred)

**Status:** Queued — awaiting WI-A merge

- Issue #11 scope split approved: WI-A (Cairn code), WI-B (coordinator dispatch policy change)
- WI-B assigned to Gabriel (Infrastructure/Coordinator)
- WI-B is intentionally deferred until WI-A merges (correctness dependency)
- WI-B scope: Coordinator uses \git worktree add\ per-issue instead of shared checkout

**Blocked on:** WI-A merge (Roger's implementation + Laura's tests)

**Next:** Start WI-B after WI-A is merged to main.

### 2026-05-29 — WI-B Implementation: Coordinator Worktree Dispatch

**Delivered:** Made the Pre-Spawn: Worktree Setup section in squad.agent.md (+ 2 template mirrors) enforced rather than aspirational.

**Was the Pre-Spawn section really aspirational?**
Yes — it used "should" language, omitted error handling entirely, and had no status marker. A coordinator following it literally would have done the right thing on the happy path but had no guidance for failure modes (lock files, permission errors, wrong-branch reuse, junction failures). The v0 state was documentation-only in practice.

**Key implementation decisions:**
- Activation: opt-in via `SQUAD_WORKTREES=1` (env-var only, v1). Config-based activation (`worktrees: true`) was removed from Pre-Spawn step 1 to match v1 scope, with a v2 note added to Worktree Lifecycle Management.
- Fallback on error: errors fall back to main repo rather than aborting. Skeptic persona raised "fail-closed" as an option; rejected because a broken worktree setup should not block legitimate work in v1. Documented trade-off in decision inbox.
- Parallel dispatch: warning-only with `list_agents` as the detection hint. Full state-tracking mechanism is v2.

**Surprises in template structure:**
- The two template mirrors (`.squad/templates/squad.agent.md.template` and `.squad/templates/squad.agent.md`) differ in 38 lines pre-existing (no `name:` field, no `CURRENT_DATETIME` in lightweight template in the plain version). The changed sections landed byte-identical as required.
- The only difference between primary and `.template` is 2 version-stamp lines — expected.

**Persona review findings (Code Panel, 4 personas):**
- 12 findings captured; 11 accepted, 1 rejected (fail-closed activation)
- Key fixes applied: {worktree}/{path} variable inconsistency, branch-mismatch dead end in step 2b, {branch} derivation in Cleanup, rmdir /s hazard warning, rm -f for Unix, activation section v1 note, YAML-style notation fix, {% if %} manual handling clarification, lightweight pre-render note substance

**Files modified:**
- `.github/agents/squad.agent.md`
- `.squad/templates/squad.agent.md.template`
- `.squad/templates/squad.agent.md`

**Pattern extracted:** Worktree-junction cleanup recipe (rmdir before git worktree remove) documented as `.squad/skills/worktree-junction-cleanup/SKILL.md`

### 2026-05-30 — v1.1 Polish: Worktree Fallback User-Visible Warning (Issue #31)

Filed GitHub issue #31 to capture Graham's PR #29 review follow-up: emit user-visible warning when worktree fallback engages. Silent degradation of isolation is a UX gap; warning should fire on both worktree add failure and junction link failure. Source: Aaron's handoff from post-WI-B session; estimated effort ~10 minutes.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe


