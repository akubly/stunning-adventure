---
updated_at: 2026-04-08T12:00:00Z
focus_area: Post-Spike — Monorepo Foundation & Forge Chartering
active_issues:
  - "Monorepo restructuring: @cairn/types, @cairn/cairn, @cairn/forge"
  - "Live runtime verification of Copilot SDK findings"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

**Copilot SDK Spike** — ✅ COMPLETE (GO)

Branch: `squad/copilot-sdk-spike`

The 3-day spike answered all 8 questions. Verdict: **GO.** The SDK is a sound
foundation for Forge. See `docs/spikes/copilot-sdk-assessment.md` for the
full go/no-go assessment with architecture sketch.

**Spike results (7 ✅, 1 ⚠️):**
- Q1 Session Management: ✅ — full lifecycle API
- Q2 Tool Interception: ✅ — first-class hooks, bidirectional
- Q3 Decision Gates: ✅ — three native mechanisms
- Q4 Event Taxonomy: ✅ — 86 typed events, 22 map to Cairn
- Q5 Cairn Bridge: ✅ — ~50 LOC adapter with provenance tiering
- Q6 Stability: ⚠️ — Technical Preview risks bounded by abstraction layer
- Q7 Model/Tokens: ✅ — nano-AIU billing, quota snapshots, mid-session switch
- Q8 End-to-End: ✅ — event bridge + DBOM reconstruction verified

**Architecture confirmed:** Monorepo with `@cairn/types` (shared contract),
`@cairn/cairn` (observability), `@cairn/forge` (execution runtime).

**Concepts validated during spike:**
- Portability: Export certified artifacts (SKILL.md + DBOM) for corp/EMU
- PGO Telemetry: Deployed artifacts → Application Insights → Cairn feedback
- ACP Horizon: Multi-agent transport is additive, not a rewrite

**Recommended next steps (prioritized):**
1. Phase 1: Monorepo foundation — extract `@cairn/types`, restructure (1–2 days)
2. Phase 2: Live runtime verification — close the type-vs-runtime gap (1–2 days)
3. Phase 3: Core Forge loop — SDK wrapper, event bridge, decision gates (3–5 days)
4. Phase 4: Export pipeline — DBOM generator, SKILL.md compiler (2–3 days)
5. Phase 5: PGO telemetry — pluggable sinks, feedback ingest (future)

**Decision point for Aaron:** Charter sister squad after Phase 2 or continue
with this squad through Phase 3?

**Previous milestones (complete):**
- Phase 7: Prescriber (316 tests, 10 MCP tools) ✅
- Phase 8: Skill Linter + Validator + Test Harness ✅

**Deferred:**
- Worktree support (Issue #11)
- awesome-copilot submission
- Performance optimizations

