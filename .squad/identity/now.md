---
updated_at: 2026-04-07T08:00:00Z
focus_area: Copilot SDK Spike — Forge Runtime Investigation
active_issues:
  - "Copilot SDK spike: Can @github/copilot-sdk serve as Forge runtime foundation?"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

**Copilot SDK Spike** — 🔬 IN PROGRESS

Branch: `squad/copilot-sdk-spike`

Investigating whether `@github/copilot-sdk` (Technical Preview) can serve as
the runtime foundation for Forge — the agentic execution harness that
complements Cairn's observability platform.

**Architecture decision (2026-04-07):** Aaron chose Option C ("Spike First")
from the brainstorm session. Key commitments:
- Cairn = APM (debugger). Forge = Runtime (compiler). Neither absorbs the other.
- Monorepo with shared types (`@cairn/types`, `@cairn/cairn`, `@cairn/forge`)
- Spike first within this squad, then charter a sister squad for Forge.

**Spike scope:** 3-day time box, 8 questions to answer. See
`docs/spikes/copilot-sdk-spike.md` for full scope document.

**Key questions:**
1. Can we manage sessions programmatically via `CopilotClient`?
2. Can we intercept/observe tool calls before and after execution?
3. Can we inject decision gates (human-in-the-loop)?
4. What events does the SDK emit, and at what granularity?
5. Can we bridge SDK events into Cairn's event_log?
6. SDK stability and limitations?
7. Model selection and token budgeting?
8. End-to-end: minimal Forge session → events → Cairn?

**Prior finding (Roger):** SDK already emits `assistant.usage` events with
model, tokens, latency, cache metrics, and billing multiplier.

**Previous milestones (complete):**
- Phase 7: Prescriber (316 tests, 10 MCP tools) ✅
- Phase 8: Skill Linter + Validator + Test Harness ✅

**Deferred:**
- Worktree support (Issue #11)
- awesome-copilot submission
- Performance optimizations

