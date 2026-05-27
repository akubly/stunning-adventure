---
updated_at: 2026-05-25T23:42:47-07:00
focus_area: Phase 4.6 Wave 5 COMPLETE — Wave A (W5-1, W5-3) + Wave B (W5-2, W5-4) both landed locally on isolated branches. Aaron to review and merge all four Wave 5 PRs. Wave 6 backlog on hold pending PR merges.
active_issues:
  - "Phase 1: Monorepo restructuring ✅ COMPLETE"
  - "Phase 2: Live runtime verification ✅ COMPLETE (5/5 modules)"
  - "Phase 3: CopilotClient Integration ✅ COMPLETE (7 modules, 289 tests, 9-persona review)"
  - "Phase 4: Export Pipeline ✅ COMPLETE (export/, DBOM persistence, 826 tests)"
  - "Phase 4.5: Local Feedback Loop ✅ COMPLETE (990 tests, telemetry + DB + prescribers + applier + integration)"
  - "Phase 4.6: Change Vector Learning ✅ COMPLETE (1153 tests, migration 012, CRUD, Curator, prescriber ranking, 3 ADRs, 39 commits, primitives-only model, compliance approved)"
  - "Phase 4.6 Wave 2: Wire Curator change vectors to prescriber historicalVectors at runtime ✅ COMPLETE (1199 tests, ChangeVectorProvider, ForgePrescriberOrchestrator, autoApplyEligible gate, hint dedup, forge-prescribe CLI)"
  - "Phase 4.6 Wave 3: Curator-driven prescriber orchestration ✅ COMPLETE (PR #21 merged f27a537; composition root R2 @akubly/skillsmith-runtime; always-on hook wiring; 14 Copilot findings addressed; 1219 tests passing)"
  - "Phase 4.6 Wave 4: COMPLETE ✅ (2026-05-24). W4-1 insertHintIfNew atomicity + W4-2 CairnEvent observability + W4-3 forceRegenerate CLI knob + W4-4 integration test infrastructure — all SHIPPED and VALIDATED. Result: 14/14 integration tests passing, 644/647 repo tests green. Branch phase-4.6/wave-4 ready for PR. Aaron to open PR manually (open_pr=false)."
  - "Phase 4.6 Wave 5 COMPLETE ✅ (2026-05-25). Wave A: W5-1 session-kind separation (commit 8b0a69a, 100/100 tests) + W5-3 tier fallback (commit c74463f, 18/18 tests). Wave B: W5-2 explicit DB hard cut (commit 963a0aa, 50 files refactored) + W5-4 staleness attenuation (commit 96f7d6e, 16/16 tests). All four commits on isolated branches. Decisions consolidated (commit cea40ac on main)."
  - "Phase 5: Cloud PGO + Full Graph — ROADMAP (docs/forge-phase5-roadmap.md, Azure budget prerequisite)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

Phase 4.6 Wave 5 is COMPLETE. Aaron to review and merge PRs.

**Wave A (Complete as of 2026-05-25):**
- ✅ **W5-1 Session-Kind Separation:** Migration 014 (session_kind column), getMostRecentUserSession() API, four MCP call sites corrected. Commit 8b0a69a on phase-4.6/w5-1-session-kind. Fixes MCP fallback correctness bug (was returning `__system__` session to user-facing tools). 100/100 tests passing.
- ✅ **W5-3 Tier Fallback Chain:** Extends loadExecutionProfile() from per-skill→global to per-skill→per-model→per-user→global. Optional TierFallbackContext. First-match-wins; no staleness-triggered fallback (W5-4 handles). Commit c74463f on phase-4.6/w5-3-tier-fallback. 18/18 tests passing.

**Wave B (Complete as of 2026-05-25):**
- ✅ **W5-2 Explicit DB Hard Cut:** 50 files refactored; all Cairn DB helpers now accept explicit db parameter as first positional arg. Removed singleton fallback overloads. Enables test parallelization and worktree safety. Commit 963a0aa on phase-4.6/w5-2-db-hard-cut. All workspaces green.
- ✅ **W5-4 Profile Staleness Attenuation:** Configurable threshold (50 sessions OR 7 days). Stale profile confidence attenuated 0.5×. No fallback trigger (W5-3 handles fallback separately). Makes prescriber confidence trustworthy. Commit 96f7d6e on phase-4.6/w5-4-staleness-attenuation. 16/16 tests passing.

**PR Merge Sequence (Aaron to manage):**
1. PR: W5-1 base=main (commit 8b0a69a)
2. PR: W5-3 base=main (commit c74463f)
3. PR: W5-4 base=W5-3 (commit 96f7d6e) — depends on tier fallback selection logic
4. PR: W5-2 base=main (commit 963a0aa) — independent, no functional dependencies

**Wave 6 Backlog (on hold until Wave 5 PRs land):**
- W5-5: MCP surface for forceRegenerate (needs W5-1 prerequisite + Aaron's UX policy input on confirmation prompts/safety guards)
- W5-6: Metrics dashboard (product shape undefined; needs Aaron's decision: CLI report vs. MCP resource vs. new package)

**Phase 4.6 Completion Criterion Met:**
- Wave 5 Shape approved (2026-05-25)
- Wave A landed on isolated branches (W5-1, W5-3)
- Wave B landed on isolated branches (W5-2, W5-4)
- All four commits ready for Aaron review and merge
- Decisions consolidated in .squad/decisions.md (commit cea40ac)

**Test Health:** 644/647 repo-wide tests green; all Wave 5 work validates cleanly across all workspaces.


