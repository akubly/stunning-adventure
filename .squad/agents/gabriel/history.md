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
