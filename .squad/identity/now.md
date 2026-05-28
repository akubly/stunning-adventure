---
updated_at: 2026-05-27T23:59:00Z
focus_area: Eureka v1 implementation runway clear; M1 first red test next; OQ-1 monorepo accepted; §55 London-TDD spine canonical
active_issues:
  - "Eureka v0.1 Technical Design — ✅ ASSEMBLED & LOCKED (§00–§70, 198KB, 3 ADRs; OQ-1 resolved via ADR-0002)"
  - "§55 TDD Re-Pass — ✅ COMPLETE (§20/§30/§40/§50 all aligned with London-school mock contracts; zero blockers)"
  - "Phase 1: Monorepo restructuring ✅ COMPLETE"
  - "Phase 2: Live runtime verification ✅ COMPLETE (5/5 modules)"
  - "Phase 3: CopilotClient Integration ✅ COMPLETE (7 modules, 289 tests, 9-persona review)"
  - "Phase 4: Export Pipeline ✅ COMPLETE (export/, DBOM persistence, 826 tests)"
  - "Phase 4.5: Local Feedback Loop ✅ COMPLETE (990 tests, telemetry + DB + prescribers + applier + integration)"
  - "Phase 4.6: Change Vector Learning ✅ COMPLETE (1153 tests, migration 012, CRUD, Curator, prescriber ranking, 3 ADRs, 39 commits, primitives-only model, compliance approved)"
  - "Phase 4.6 Wave 2: Wire Curator change vectors to prescriber historicalVectors at runtime (deferred, tracked follow-up)"
  - "DB Convention Standardization: explicit injection vs internal getDb() (deferred, repo-wide question)"
  - "Phase 5: Cloud PGO + Full Graph — ROADMAP (docs/forge-phase5-roadmap.md, Azure budget prerequisite)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

**Eureka v1 implementation runway — M1 first red test next.**

Branch: `eureka/v1-design-package` (this PR), then back to `main` for M0/M1 work.

**Current state:**
- ✅ Eureka v0.1 technical design **ASSEMBLED & LOCKED** — `docs/eureka/technical-design.md` (§00–§70, ~198KB, 3 ADRs, 100% PRD acceptance criteria traced, 37/41 ACs testable in v1).
- ✅ **OQ-1 RESOLVED** — Aaron accepted Option A (Monorepo). See `docs/eureka/adrs/0002-shared-substrate-ownership.md` and merged entries in `.squad/decisions.md`. M0 scaffolding unblocked.
- ✅ §55 London-TDD spine canonical — §20/§30/§40/§50 aligned with London-school mock contracts; zero blockers.
- ⏳ Remaining open decisions: OQ-2 (event schema topology), OQ-3 (Decision/SessionId schema), OQ-4 (dogfood sequencing) — tracked in §00 ADR index.

**Next action:** M1 first red test (Laura — London-school outside-in TDD per §55).

---

## Previous focus (archived for context)

**Phase 4.5: Local Feedback Loop** — SPECIFIED, ready for implementation

Two spec documents from the 10-agent brainstorm:
- `docs/forge-phase4.5-spec.md` — Full implementation spec for the local PGO engine
- `docs/forge-phase5-roadmap.md` — Roadmap for Phase 4.6 (change vector learning), Phase 5 (cloud PGO), and wild cards

**Phase 4.5 delivers:** 3 new modules (telemetry/, prescribers/, applier/), DB migration 011, drift score computation, 2 new prescribers, optimization applier, self-tuning strategy parameters.

**Work decomposition:** Alexander owns DB, Roger owns telemetry, Rosella owns prescribers+applier, Laura owns integration tests.

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


