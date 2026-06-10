> Older entries archived to history-archive.md on 2026-06-09. This file holds recent context.

## Cairn Prescriber Infrastructure + Phase 7C Implementation

**Role:** Infrastructure (Prescriber, MCP, hooks)

**Recent Work (2026-04-07 — Phase 7C):**

**Curate Cap + Trigger Wiring:**
- 3-second soft time cap on `curate()` batch loop (TIME_BUDGET_MS=3000, checked between batches)
- Extended `CurateResult` with `capped` and `insightsChanged` flags
- Hybrid trigger wiring: preToolUse slow path + MCP `run_curate` both chain `prescribe()` when insights change
- Session counter increment on slow path for deferral cooldown
- Fail-open: prescribe() failures caught in both preToolUse + MCP paths
- 41 curator tests, 11 sessionStart tests, 23 MCP tests — all passing

**Key Architectural Insights:**
- Prescriber MUST NOT run in preToolUse hot path (10s budget already consumed by Node startup ~400ms + unbounded curation)
- MCP-only trigger for expensive Prescriber work (long-lived subprocess, no timeout)
- Prescriptions need own table separate from `insights.prescription` (Curator writes insights, Prescriber writes prescriptions)
- `decide_prescription` combines apply/reject/dismiss into one tool with action enum — every disposition becomes Curator event

**Learnings:**
- Time cap check goes AFTER `events.length < BATCH_SIZE` (partial final batch = "caught up", not "capped")
- MCP output shape `{ curate: result, prescriptions: prescribeResult }` with null prescriptions on Prescriber errors (partial success)
- Hooks share timeout across all plugins; plugins must self-budget
