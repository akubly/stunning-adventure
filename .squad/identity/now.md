---
updated_at: 2026-05-25T15:35:00-07:00
focus_area: Phase 4.6 Wave 5 ACTIVE — Wave A (W5-1 session-kind, W5-3 tier fallback) landed. W5-2, W5-4 in flight. Wave B (W5-2, W5-4) pending. Phase 4.6 completes on Wave A + Wave B landing.
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
  - "Phase 4.6 Wave 5 ACTIVE ✅ (2026-05-25). Shape B: W5-1 session-kind ✅ landed (commit 8b0a69a on phase-4.6/w5-1-session-kind) + W5-3 tier-fallback spec locked. W5-2 DB conventions + W5-4 staleness in flight. Wave 6 backlog: W5-5 MCP forceRegenerate + W5-6 metrics dashboard."
  - "Phase 5: Cloud PGO + Full Graph — ROADMAP (docs/forge-phase5-roadmap.md, Azure budget prerequisite)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

Phase 4.6 Wave 5 is ACTIVE. Shape B (Foundation + Safety) approved by Aaron on 2026-05-25.

**Wave A (Complete as of 2026-05-25):**
- ✅ **W5-1 Session-Kind Separation:** Migration 014 (session_kind column), getMostRecentUserSession() API, four MCP call sites corrected. Commit 8b0a69a on phase-4.6/w5-1-session-kind. Fixes MCP fallback correctness bug (was returning `__system__` session to user-facing tools).
- ✅ **W5-3 Tier Fallback Spec:** Extends loadExecutionProfile() chain from per-skill → global to per-skill → per-model → per-user → global. Optional TierFallbackContext with modelId/userId. First-match-wins semantics. No staleness-triggered fallback (W5-4 handles via confidence attenuation). Spec locked; pending Rosella fan-out.

**Wave B (In Flight):**
- ⏳ **W5-2 DB Convention Standardization:** Refactor 12+ Cairn functions to accept explicit db parameter. Roger owner. Prevents test infrastructure failures in future waves.
- ⏳ **W5-4 Profile Staleness Check:** Configurable threshold (50 sessions OR 7 days). Stale profile attenuates confidence 0.5×. Rosella owner. Makes prescriber confidence trustworthy.

**Wave 5 Deferred (Wave 6 backlog):**
- **W5-5 MCP Surface for forceRegenerate:** Needs W5-1 prerequisite + Aaron's UX policy input. Rosella owner (if promoted). Confirmation prompts, safety guards, rate limiting.
- **W5-6 Metrics Dashboard:** Product shape undefined (CLI report vs. MCP resource vs. package). Needs Aaron's decision. TBD owner.

**Phase 4.6 Completion Criterion:** Wave A landed + Wave B landed = phase-4.6/wave-5-complete branch ready for PR.

**Test Status:** 644/647 passing on phase-4.6/wave-4; W5-1 adds 100/100 new tests; W5 full target TBD.


