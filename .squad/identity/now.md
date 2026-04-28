---
updated_at: 2026-04-28T20:00:00Z
focus_area: Phase 2 CONTINUING — Event Bridge, Hooks, Test Infra (persona review complete)
active_issues:
  - "Phase 1: Monorepo restructuring ✅ COMPLETE"
  - "Phase 2: Live runtime verification — IN PROGRESS (3/5 modules done; 111 tests passing; persona review ✅ COMPLETE)"
  - "Phase 2 persona review: 10 findings triaged (6 accepted+fixed, 2 rejected, 1 escalated, 1 deferred)"
  - "Phase 2 remaining: decisions/, dbom/, session/ modules"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

**Phase 1: Monorepo Foundation** — ✅ COMPLETE (SUCCESS)

Branch: `main`

Graham restructured Cairn into an npm workspaces monorepo with three packages:
- `@akubly/types` — shared contract types
- `@akubly/cairn` — observability + MCP tools + plugin infra
- `@akubly/forge` — empty scaffold ready for SDK integration

**Verification:**
- ✅ All 427 tests pass
- ✅ Clean build
- ✅ Zero business logic changes
- ✅ Shared types extracted and re-exported
- ✅ Build order enforced via `tsc --build` project references

---

**Phase 2: Live Runtime Verification** — IN PROGRESS (3/5 modules complete, ~111 tests passing)

**Progress Summary:**
- ✅ Event bridge adapter (`packages/forge/src/bridge/`) — 22 SDK events → CairnBridgeEvent, provenance classification, payload extractors
- ✅ Hook composer (`packages/forge/src/hooks/`) — HookComposer class with live observer set, error isolation (try/catch per observer)
- ✅ Test infrastructure — vitest config, mock SDK factory, event factory, type assertion helpers (25 infra tests)
- ✅ Runtime verification tests — 111 tests total (32 contracts, 22 bridge, 20 hooks, 25 infra) — ALL PASSING
- ⏳ Decisions module (pending)
- ⏳ DBOM module (pending)
- ⏳ Session module (pending)

**Build Status:** Clean via `tsc --build` — 427 Cairn + 111 Forge = 538 total tests passing

**Architecture Blueprint:** 5-module structure with Phase 2/3 boundary rule ("if it needs `CopilotClient()`, it's Phase 3").

**Key Decisions Made:**
1. HookComposer uses live observer set — dynamic registration without SDK re-registration
2. Hook composer isolates observer errors — buggy telemetry cannot kill decision gates
3. Test infrastructure uses SDK mocks, not live CLI — Phase 2 is offline verification only
4. Cross-package contracts via `@akubly/types` — Forge never imports from `@akubly/cairn`

---

**Architecture Confirmed:** Monorepo with `@akubly/types` (shared contract), `@akubly/cairn` (observability), `@akubly/forge` (execution runtime).

**Concepts validated during spike:**
- Portability: Export certified artifacts (SKILL.md + DBOM) for corp/EMU
- PGO Telemetry: Deployed artifacts → Application Insights → Cairn feedback
- ACP Horizon: Multi-agent transport is additive, not a rewrite

**Recommended next steps (prioritized):**
1. Phase 2 completion: decisions/, dbom/, session/ modules (1–2 days)
2. Phase 3: Core Forge loop — CopilotClient integration, session orchestration, model selection (3–5 days)
3. Phase 4: Export pipeline — DBOM generator, SKILL.md compiler (2–3 days)
4. Phase 5: PGO telemetry — pluggable sinks, feedback ingest (future)

**Decision point for Aaron:** Charter sister squad after Phase 2 or continue with this squad through Phase 3?

**Previous milestones (complete):**
- Phase 1: Monorepo foundation ✅
- Spike: Copilot SDK Assessment ✅
- Phase 7: Prescriber (316 tests, 10 MCP tools) ✅
- Phase 8: Skill Linter + Validator + Test Harness ✅

**Deferred:**
- Worktree support (Issue #11)
- awesome-copilot submission
- Performance optimizations

