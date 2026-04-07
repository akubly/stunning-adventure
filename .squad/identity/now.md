---
updated_at: 2026-04-07T05:18:00Z
focus_area: Phase 7 — Prescriber Implementation
active_issues:
  - "Phase 7: Prescriber implementation (6 sub-phases, 7A–7F)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "CLI extension prototype spike (deferred)"
---

# What We're Focused On

**Phase 7: Prescriber Implementation** — 🚧 IN PROGRESS

Building Cairn's third core agent: the Prescriber. Closes the feedback loop from pattern detection through actionable recommendations to user-approved changes.

**All 6 architectural decisions finalized by Aaron (2026-04-06):**
- DP1: Hybrid trigger (preToolUse + run_curate chain prescribe())
- DP2: 8-state lifecycle (generated→accepted→applied/failed, +rejected/deferred/expired/suppressed)
- DP3: 4 new MCP tools (10 total: list/get/resolve_prescriptions + show_growth)
- DP4: Full 4-phase artifact scanner with SQLite cache (5-min TTL)
- DP5: All 10 UX principles (observation framing, max 1 proactive, growth tracking)
- DP6: managed_artifacts table + sidecar instruction files + rollback

**Sub-phases:**
- ✅ **7A** — Data Foundation (Roger): schema, types, DAL, preferences
- ✅ **7B** — Artifact Discovery (Rosella): 4-phase scanner + cache
- ✅ **7C** — Infrastructure (Gabriel): curate() 3s cap + trigger wiring
- 🚧 **7D** — Prescription Engine (Roger): core agent, state machine, priority scoring
- 🚧 **7E** — Apply Engine (Rosella): sidecar writing, rollback, drift detection
- 🔲 **7F** — MCP Tools + UX (Roger + Valanice): 4 new tools + growth tracking

**Dependencies:** 7A first → 7B ∥ 7C → 7D ∥ 7E → 7F (final integration)

**Quality Baseline:**
- 232/232 tests passing (↑ 51 from 7A)
- Target: ~250 tests after Phase 7 (~18 remaining)
- Clean TypeScript build, zero lint violations

**Execution Plan:** `.squad/decisions/inbox/graham-prescriber-final-plan.md`

**Deferred to Phase 8:**
- CLI extension prototype spike
- Worktree support (Issue #11)
- Bash wrappers for macOS/Linux
- awesome-copilot submission

