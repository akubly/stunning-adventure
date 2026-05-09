# Graham — History (Summarized)

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Lead
- **Joined:** 2026-03-28T06:21:47.377Z

## Learnings

### Core Learning Archive (Pre-Phase 6)

**Key insights from Rounds 1–5 brainstorm:**
- Copilot extensibility has three SDK layers: CLI SDK (embedding), Extensions SDK (distribution), Engine SDK (custom agents). MCP is the universal tool protocol.
- Plugin architecture: seven-layer composition model with plugin.json as distribution unit.
- Marketplace standardization: awesome-copilot is dominant center (170+ agents, 240+ skills, 55+ plugins). SKILL.md is cross-platform standard.
- Prior infrastructure reuse: 7 directly portable patterns from Aaron's previous work (knowledge taxonomy, persona review, workflow gates, skill template, tool guards, observability schema, multi-source code review).
- Architecture foundation: four-layer data pipeline (primitives → assemblers → experiences → CLI), session-scoped context model, SQLite knowledge.db with migrations.

**Code patterns established:**
- isScript guard at module scope: prevent process.exit during import
- Timestamp parsing: SQLite datetime format must normalize to ISO-8601 before parsing
- DB cleanup: dbOpened + finally pattern ensures safe DB closure in hooks
- Test strategy: test backing functions, not transport protocols
- Tool naming: verb_noun convention (get, list, search, run, check) aids LLM selection
- Error handling: fail-open principle for observability (silent failures preferred over blocking)

### Phase 4.5 Architecture — Local Feedback Loop + Phase 5 Roadmap (2026-05-02)

**Key file paths:**
- Phase 4.5 spec: `docs/forge-phase4.5-spec.md`
- Phase 5 roadmap: `docs/forge-phase5-roadmap.md`
- Telemetry module: `packages/forge/src/telemetry/` (6 files)
- Prescribers module: `packages/forge/src/prescribers/` (4 files)
- Applier module: `packages/forge/src/applier/` (3 files)

**Architecture decisions:**
- Drift score: weighted sum of 5 signals. Determinism > Cost (70%/30% split).
- Collectors as HookObservers: O(1) per event, defer analysis to flush.
- Three-phase ancestry roadmap: Phase 4.5 (linear), Phase 4.6 (change vectors), Phase 5 (DAG).
- Canary bootstrap: 0 sessions → defaults, 3+ → prompt, 5+ → token, 10+ → auto-apply.

### Phase 4 Architecture — Export Pipeline (2026-05-01)

**Decision document:** Merged to `.squad/decisions.md`

**Architecture decisions:**
- Injection pattern: Forge never imports Cairn. ExportQualityGate is function type satisfied by Cairn.
- DBOM persistence: two new tables + upsert semantics (one DBOM per session).
- Pipeline as fixed stages: four pure functions (Extract → Strip → Attach → QualityGate).
- No new shared types: all Phase 4 types stay package-internal.

### Phase 4.6 Completion — Change Vector Learning (2026-05-03)

**Role:** Kickoff lead (Wave 0) + Triage (Wave 2)

**Wave 0 outcomes:**
- Branch `squad/phase4.6-change-vectors` created and spec finalized
- Six clarifications resolved
- Work decomposition: A1–A4 (Alexander), R1–R5 (Rosella), L1–L5 (Laura)
- Three ADRs established

**Wave 2 (defect triage):**
- Laura flagged inconsistency: `summarizeChangeVectors` confidence=0 vs `computeConfidenceBoost(0)` = 1.0
- Three options analyzed; Option B chosen (rename field to `confidenceBoost` for semantic clarity)
- Lockout-compliant fix routing assigned

**Lesson:** When two implementations are internally consistent but the contract is ambiguous (level vs boost semantics), the bug is the naming, not the logic. Renaming surfaces intent.

### Phase 4.6 Review Cycle — 3-Cycle Persona Review (2026-05-04)

**Role:** Cycle 1 Triage Lead (graham-2)

**Cycle 1 Personas (parallel):**
- 5 persona reviewers ran in parallel
- Consolidated: 15 findings (1B / 9I / 5M)
- Blocked issue: deltaCost cumulative bug (blocking on ranking correctness)

**Cycle 1 Triage:**
- Adopted squad-mode autonomous triage (Aaron selected)
- 12 findings accepted, 1 rejected (contradicts ADR-P4.6-002), 2 deferred (scope questions)
- Filed 3 new ADRs (P4.6-004/005/006) documenting scope/trade-offs
- Applied lockout rule: original author cannot fix their own findings → cross-package coordination

**Cycle 2 Re-Review (correctness-1, skeptic-1, craft-1):**
- 7/7 + 4 PASS/3 PARTIAL + 6/6 verification
- 10 advisory findings routed to cycle 3 for remediation

**Cycle 3 Fixes (alexander-3, rosella-3, laura-5):**
- 1153 tests passing (+163 since baseline 990)
- Branch review-clean, compliance approved for merge

**Key decision:** ADR-P4.6-006 — Ship primitives only, defer runtime wiring to Wave 2. Rationale: computation hard, wiring mechanical. Separates concerns and unblocks PR.

**Lesson:** Autonomous triage with lockout coordination works for cross-package findings. Each agent owns their scope; review prevents author bias.

## Key Pattern Inventory

**Installation architecture:** Three broken surfaces (hooks, MCP registration, binaries). Strategy: `npm link` + `cairn install` CLI command.

**CLI extensions insight:** Extensions are undocumented but fully implemented. Primary CLI surface (persistent state, unified hooks+tools). MCP as universal distribution path. Build both, test both.

**Caching 4-layer hierarchy:** L1 (in-memory, ~100ms), L2 (session store, ~5min), L3 (short-TTL, ~1hr), L4 (long-TTL, ~30d). Balances speed + reach.

**Brainstorm distillation:** 2 rounds × 10 agents = massive input. Spec writing is lossy compression. Aaron's explicit decisions are spec constraints, not suggestions.

**Spike methodology:** Time-box with clear circuit breaker. Pre-defined threshold (Q1+Q2+Q4+Q5 = ✅) means verdict is mechanical, not ambiguous. Reusable for future tech evals.
