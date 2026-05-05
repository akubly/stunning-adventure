---
updated_at: 2026-05-02T06:21:30Z
focus_area: Phase 4.5 ✅ COMPLETE — Local Feedback Loop (1012 tests, review-hardened)
active_issues:
  - "Phase 1: Monorepo restructuring ✅ COMPLETE"
  - "Phase 2: Live runtime verification ✅ COMPLETE (5/5 modules)"
  - "Phase 3: CopilotClient Integration ✅ COMPLETE (7 modules, 289 tests, 9-persona review)"
  - "Phase 4: Export Pipeline ✅ COMPLETE (export/, DBOM persistence, 826 tests)"
  - "Phase 4.5: Local Feedback Loop ✅ COMPLETE (990 tests, telemetry + DB + prescribers + applier + integration)"
  - "Phase 4.6: Change Vector Learning — ROADMAP (docs/forge-phase4.5-spec.md)"
  - "Phase 5: Cloud PGO + Full Graph — ROADMAP (docs/forge-phase5-roadmap.md, Azure budget prerequisite)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

**Phase 4.5: Local Feedback Loop** — SPECIFIED, ready for implementation

Branch: TBD (branch from `main` after Phase 4 merge)

Graham distilled the 2-round Phase 4.5 brainstorm (10 agents) into two spec documents:
- `docs/forge-phase4.5-spec.md` — Full implementation spec for the local PGO engine
- `docs/forge-phase5-roadmap.md` — Roadmap for Phase 4.6 (change vector learning), Phase 5 (cloud PGO), and wild cards

**Phase 4.5 delivers:**
- 3 new modules: `telemetry/` (5 files), `prescribers/` (4 files), `applier/` (3 files)
- DB migration 011: `signal_samples`, `execution_profiles`, `optimization_hints` tables
- Drift score computation (5 weighted signals, GREEN/YELLOW/RED classification)
- 2 new prescribers: prompt optimizer + token optimizer
- Optimization applier with SKILL.md v2 frontmatter extensions
- Self-tuning strategy parameters
- ~1200 LOC production, ~600-800 LOC tests, 61-80 estimated tests

**Key design decisions:**
- Determinism > Token Cost (Aaron's constraint — pervades all weights and priorities)
- Collectors as HookObservers (no separate event bus)
- Manual loop trigger in Forge, Curator-driven in Cairn
- TelemetrySink abstraction bridges Phase 4.5 (LocalDBOMSink) → Phase 5 (AppInsightsSink)
- FeedbackSource as new shared type in @akubly/types (first new shared type since Phase 2)
- Canary bootstrap for cold start (gradual ramp from 0 → 3 → 5 → 10 sessions)

**Work decomposition:** 4 streams. Alexander owns DB (6 items), Roger owns telemetry (7 items), Rosella owns prescribers + applier (8 items), Laura owns integration tests (5 items). 5 waves of parallelism.

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

**Phase 2: Live Runtime Verification** — ✅ COMPLETE (5/5 modules, 608 tests)

**Delivered Modules:**
- ✅ Event bridge adapter (`packages/forge/src/bridge/`) — 22 SDK events → CairnBridgeEvent, provenance classification, payload extractors (22 tests)
- ✅ Hook composer (`packages/forge/src/hooks/`) — HookComposer class with live observer set, error isolation (try/catch per observer) (20 tests)
- ✅ Test infrastructure — vitest config, mock SDK factory, event factory, type assertion helpers (25 infra tests)
- ✅ Decisions module (`packages/forge/src/decisions/`) — createDecisionGate, createDecisionRecorder, makeDecisionRecord (18 tests)
- ✅ DBOM module (`packages/forge/src/dbom/`) — generateDBOM, computeDecisionHash, classifyDecisionSource, summarizeDecision, rootHash (33 tests)
- ✅ Session module (`packages/forge/src/session/`) — ModelSnapshot, toModelSnapshot, ModelChangeRecord, ReasoningEffort (10 tests)

**Build Status:** Clean via `tsc --build` — 427 Cairn + 181 Forge = 608 total tests passing

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


