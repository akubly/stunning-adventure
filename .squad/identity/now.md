---
updated_at: 2026-05-30T22:31:16Z
focus_area: Eureka v1 M5+M6 COMPLETE & REVIEW-CLEAN (40/40 tests, 11-commit branch, ready for ship); M7 roadmap next
active_issues:
  - "**Eureka M5+M6 COMPLETE & REVIEW-CLEAN** ✅ — Trust feedback mutation (applyFeedback + applyFeedbackById + FactReader seams); 40/40 tests GREEN; 3-cycle consensus (12→4→4 finding trajectory); tsc clean; ship-ready"
  - "Branch: eureka/m5-m6-trust-feedback (11 commits from 9892415 to 112c966)"
  - "Review cycle: 15 personas + 6 squad spawns; 20 findings total (1 blocking in C1, 0 in C2+C3); 100% ACCEPT'ed & implemented"
  - "Deliverables: Implementation + 40 tests + §30 §2.3 spec + JSDoc complete + Decisions merged + Skills documented"
  - "M7 ROADMAP NEXT: M7-A (error typing), M7-B (error narrowing), M7-C (atomicity contract), M7-D (regression locks) — Laura + Crispin ownership"
  - "Eureka v0.1 Technical Design — ✅ ASSEMBLED & LOCKED (§00–§70, 198KB, 3 ADRs; OQ-1 resolved via ADR-0002)"
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

**Eureka v1 M5+M6 COMPLETE & REVIEW-CLEAN — READY FOR AARON'S SHIP DECISION**

Branch: `eureka/m5-m6-trust-feedback` (11 commits, 40/40 tests GREEN, tsc clean, ship-ready)

**Current state:**
- ✅ **M5+M6 COMPLETE** — Trust feedback mutation. `applyFeedback` + `applyFeedbackById` + `FactReader` seams complete. 40/40 tests GREEN (18 baseline + 22 new). Build clean.
- ✅ **3-CYCLE REVIEW CONSENSUS** — Finding trajectory 12→4→4 (1 blocking in C1, 0 in C2+C3). All 20 findings ACCEPT'ed & implemented.
- ✅ **§30 §2.3 spec complete** — "Trust Dynamics Beyond the Static Floor" covers event-delta table, domain invariants, interface contracts, user-correction sign convention, measurable outcomes.
- ✅ **DECISION TRAIL LOCKED** — 20 findings merged from inbox to decisions.md under "Eureka M5+M6 Review Cycle" section. Auditable history.
- ✅ **ARCHITECTURE READY** — All seams finalized, error contracts defined, deferred decisions scoped (M7-A/B/C/D). London-school pattern consistent.
- 📋 **NEXT ACTION**: Await Aaron's ship gate decision. M7 roadmap ready (error typing, atomicity contract, Crispin's real FactReader).

**Deferred to M7:**
- M7-A: Typed error classes (FactNotFoundError, InvalidFeedbackOptionsError)
- M7-B: Error narrowing tests
- M7-C: **CRITICAL** — Atomicity contract (caller serialization v1 vs. backend CAS/mutate later)
- M7-D: Regression locks for `applyFeedbackById` user_correction path

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


