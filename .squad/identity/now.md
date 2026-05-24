---
updated_at: 2026-05-23T21:08:00Z
focus_area: Phase 4.6 Wave 3 ✅ COMPLETE — PR #21 merged (f27a537), 1219 tests on main. Wave 4 planning in progress.
active_issues:
  - "Phase 1: Monorepo restructuring ✅ COMPLETE"
  - "Phase 2: Live runtime verification ✅ COMPLETE (5/5 modules)"
  - "Phase 3: CopilotClient Integration ✅ COMPLETE (7 modules, 289 tests, 9-persona review)"
  - "Phase 4: Export Pipeline ✅ COMPLETE (export/, DBOM persistence, 826 tests)"
  - "Phase 4.5: Local Feedback Loop ✅ COMPLETE (990 tests, telemetry + DB + prescribers + applier + integration)"
  - "Phase 4.6: Change Vector Learning ✅ COMPLETE (1153 tests, migration 012, CRUD, Curator, prescriber ranking, 3 ADRs, 39 commits, primitives-only model, compliance approved)"
  - "Phase 4.6 Wave 2: Wire Curator change vectors to prescriber historicalVectors at runtime ✅ COMPLETE (1199 tests, ChangeVectorProvider, ForgePrescriberOrchestrator, autoApplyEligible gate, hint dedup, forge-prescribe CLI)"
  - "Phase 4.6 Wave 3: Curator-driven prescriber orchestration ✅ COMPLETE (PR #21 merged f27a537; composition root R2 @akubly/skillsmith-runtime; always-on hook wiring; 14 Copilot findings addressed; 1219 tests passing)"
  - "Phase 4.6 Wave 4: IN PROGRESS (approved 2026-05-23). D1 resolved: additive CairnEvents. D2 resolved: CLI-only forceRegenerate. W4-1 (atomicity) + W4-2 (observability) → Roger, W4-3 (force knob) → Rosella, W4-4 (integration tests) → Laura. Deferred: global tier fallback, staleness check, metrics dashboard, DB convention standardization."
  - "Phase 5: Cloud PGO + Full Graph — ROADMAP (docs/forge-phase5-roadmap.md, Azure budget prerequisite)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

Wave 3 just shipped. Wave 4 scope is being drafted by Graham — TBD pending Aaron's approval. See .squad/decisions.md for deferred items list and recent Wave 4 design notes.

**PR #21 merged as f27a537 on main @ 2026-05-23 ~21:05Z**
- Composition root R2 (`@akubly/skillsmith-runtime`) implemented
- Curator-driven prescriber orchestration wired end-to-end
- Always-on hook bootstrap via injected configuration
- 1219 tests passing on main
- 14 Copilot findings addressed across 4 review cycles
- 1 deferral approved: insertHintIfNew atomicity → Wave 4 (partial UNIQUE + BEGIN IMMEDIATE)

**Wave 4 Deferred Work:**
- insertHintIfNew atomicity guard (partial UNIQUE index on skill_id + source + category, BEGIN IMMEDIATE transaction)
- Global tier fallback for profile selection (expand from per-skill only)
- Staleness check on loaded profiles
- Curator observability gap (CairnEvent additional event types)
- force=true knob for manual prescriber override
- Metrics dashboard for prescriber diagnostics
- DB convention standardization (explicit injection vs internal getDb() calls)


