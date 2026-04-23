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
