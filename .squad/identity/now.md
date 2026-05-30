---
updated_at: 2026-05-30T07:36:38Z
focus_area: Crucible CTD design review (Original Pass + Pass A) — 46 findings across 2 reviews, most addressed; Pass A COMPLETE, 2 options docs pending Aaron ruling
previous_focus: Phase 4.6 Wave 2 ✅ COMPLETE — Change Vector Learning + Runtime Wiring (1199 tests, 9 work items, forge-prescribe CLI, negative-impact attenuation, hint dedup)
active_issues:
  - "Phase 1: Monorepo restructuring ✅ COMPLETE"
  - "Phase 2: Live runtime verification ✅ COMPLETE (5/5 modules)"
  - "Phase 3: CopilotClient Integration ✅ COMPLETE (7 modules, 289 tests, 9-persona review)"
  - "Phase 4: Export Pipeline ✅ COMPLETE (export/, DBOM persistence, 826 tests)"
  - "Phase 4.5: Local Feedback Loop ✅ COMPLETE (990 tests, telemetry + DB + prescribers + applier + integration)"
  - "Phase 4.6: Change Vector Learning ✅ COMPLETE (1153 tests, migration 012, CRUD, Curator, prescriber ranking, 3 ADRs, 39 commits, primitives-only model, compliance approved)"
  - "Phase 4.6 Wave 2: Wire Curator change vectors to prescriber historicalVectors at runtime ✅ COMPLETE (1199 tests, ChangeVectorProvider, ForgePrescriberOrchestrator, autoApplyEligible gate, hint dedup, forge-prescribe CLI)"
  - "Phase 4.6 Wave 3: Curator-driven prescriber orchestration (deferred, requires composition root ADR)"
  - "DB Convention Standardization: explicit injection vs internal getDb() (deferred, repo-wide question)"
  - "Phase 5: Cloud PGO + Full Graph — ROADMAP (docs/forge-phase5-roadmap.md, Azure budget prerequisite)"
  - "#11 — Worktree-aware sessions (deferred)"
  - "awesome-copilot submission (deferred)"
---

# What We're Focused On

**Crucible CTD Design Review** — Original Pass + Pass A complete; some Pass A execution work pending for next session.

## Session 2026-05-29 summary
Aaron requested a Design Panel review of the Crucible test strategy + technical design plan + architectural overview. Spawned a 5-persona panel (Architect/Skeptic/Pragmatist/Compliance/Performance — Opus/GPT-5.4/Sonnet/Haiku/Codex). Produced **21 findings**, team-triaged, 4 escalated to Aaron, all closed. Aaron then approved **Pass A** — a fresh panel on §5/§7/§8/§9/§10 (chapters the original pass didn't deeply review). Pass A produced **25 more findings** with strong cross-persona convergence — 7 blockers and several genuine correctness bugs the meta-pass missed.

## Key rulings Aaron made this session
- **L3.5 Scheduler tier:** KEEP in v1 (strong original rationale)
- **L3.5 Phase 0.5 FifoScheduler stub:** YES — staged stub OK (Aaron ruling 2026-05-30); Phase 0.5 uses FifoScheduler (satisfies A-Sched-1), Phase 1 upgrades to WeightedRoundRobinScheduler (A-Sched-2/A-Sched-3 graduation criteria)
- **L1 substrate (ADR-0002):** Accept custom WAL as-is — architectural coupling drives the decision, no SQLite benchmark needed
- **B3 hermetic replay:** Honest "boundary-faithful vs prompt-faithful" framing in §11.10.1 + §12.7
- **E3 secrets/PII:** v1 = honest §18 known-limits doc + `crucible session delete` + retention ceiling; NO redaction subsystem; redaction is v1.5+ OPEN
- **D1 tool capture scope:** Capture only LLM-visible `tool_result`, NOT raw `tool_output` (resolves §11/§12 ambiguity)
- **Tiered recording fidelity:** Future v1.5+ consideration (captured as directive)
- **E4 plugin artifacts:** Honesty caveat in §11.10/§15.5, NOT a retention subsystem

## What landed this session (filesystem evidence)
- 13 design chapters edited + 4 new ADR body files: `0002-l1-wal-substrate.md`, `0006-router-policy-chokepoint.md`, `0011-observation-commitment.md`, `0018-pareto-incomparable.md`
- Walking-skeleton (Phase 0.5) milestone added to plan
- v1 retention floor (500MiB soft / 2GiB hard / 90-day) added to §17
- CAS GC, WAL write-lock, hook-bus capacity model, branching cost model all specified
- Perf conformance suite (`ci:conformance:perf`) added to §16.1
- Scheduler row + A13 acceptance scenario added to §16.3 (Laura, pre-silent-success)

## ⚠️ Pass A execution gaps — CLOSED

All 6 agents executed cleanly:

- ✅ Valanice — §9 Aperture edits (4/4 DONE)
- ✅ Gabriel — Applier/infrastructure edits (3/3 DONE)
- ✅ Roger — CLI verb edits (2/2 DONE)
- ✅ Laura — Test strategy + ADR template (2/2 DONE)
- ✅ Rosella — Generators + branching (7/7 DONE) + 2 options docs PA-B4/childSid awaiting Aaron ruling
- ✅ Graham — L3.5 Phase 0.5 stub (Aaron ruling implemented)

**Blockers resolved:**
- PA-B6 fence-violation retry → concrete numbers, backoff formula, telemetry signals
- Staleness detection → offset threshold, catch-up budget, recovery semantics
- L3.5 Phase 0.5 → Aaron ruling implemented (FifoScheduler stub OK)

**Options docs awaiting Aaron ruling (non-inbox):**
- PA-B4 ancestry/replay divergence: `docs/crucible-technical-design/decisions/pa-b4-ancestry-replay-options.md`
- childSid collision: `docs/crucible-technical-design/decisions/childsid-collision-options.md`

**Next session:** When Aaron rules, merge options docs to decisions.md and implement chosen options.

## ⚠️ PREVIOUS Session Pass A execution gaps — to address next session
Pass A triage went out to 6 agents. **Graham executed end-to-end** (3 ADR bodies created, chapters edited). **Valanice triaged cleanly** (4 ACCEPT, no escalations) but did NOT execute her §9 edits — they're queued in her response, not in the filesystem. **Rosella, Gabriel, Roger, Laura went silent** on the Pass A triage (likely stale context after long-lived background agents).

**Next session: pick up these Pass A items.** Findings stored in DB table `persona_findings` review_id=2. The work owed:

### COMPLETED — Valanice (queued, not done) — §9 Aperture edits
- ✅ PA-B5 Defer paradox: remove `defer` from §9.4 apply-failed resolution list (or add `aperture_deferred` Observation sub-kind)
- ✅ Cache invalidation: rewrite §9.2 cache-validity rule to prefix-compatible model
- ✅ Defer volatility disclosure: add `--help` text + `@inbox` render hint per §9.9
- ✅ ApertureNotifier Phase 0.5 stub: add Phase 0.5 row to §9.11 + mirror in §8.1

### COMPLETED — Rosella (silent) — §7 Generators + §10 Branching cluster (7 items)
- ✅ **PA-B4 ancestry/replay divergence (BLOCKING)** — define ancestry-aware reads uniformly OR split APIs. **Aaron may want to rule on this.** OPTIONS DOC CREATED
- ✅ Trust-tier promotion persistence: add derived `plugin_trust_history` table keyed on `manifestSha256`
- ✅ **Deterministic childSid collision** — pick (a) counter/timestamp in preimage, (b) protocol-error semantics, or (c) "resume aborted session". **Aaron pick.** OPTIONS DOC CREATED
- ✅ Conformance suite C-8→C-9 drift in §7.A
- ✅ Pareto eval perf budget
- ✅ `alternatives[]` unbounded — top-K + CAS reference
- ✅ Invocation-stack O(N) reconstruction

### COMPLETED — Gabriel (silent) — Applier/infra cluster (3 items)
- ✅ **PA-B6 fence-violation retry counter (BLOCKING)** — explicit retriesRemaining + jittered backoff + telemetry
- ✅ Back-pressure projection staleness in §5.A.4
- ✅ Subsystem-specific threat-model stubs (coordinate with Graham's ADR bodies)

### COMPLETED — Roger (silent) — CLI (2 items)
- ✅ Add `crucible perf [top] [--json]` to §13.1 verb table (or replace §17 citation with `crucible query`)
- ✅ Defer `--help` UX text (coordinate with Valanice)

### COMPLETED — Laura (silent) — Test strategy (2 items)
- ✅ Thread C-9 (structural-proposal supersede) through §16 acceptance signals (coordinate with Rosella on §7.A)
- ✅ Propose "Acceptance Signals" subsection requirement for ADR body template (coordinate with Graham)

## Likely escalations for Aaron (next session)
1. **PA-B4 ancestry/replay divergence** (Rosella's blocker) — strategic fork: unify ancestry-aware reads vs. split APIs
2. **childSid collision** (Rosella) — three concrete options to pick from

## Open v1.5+ doors captured (do not address in v1)
- Tiered recording fidelity (call-only / call+result / call+full-output)
- PII/secret redaction beyond user-managed delete
- Plugin artifact retention subsystem (if honest caveat ever proves insufficient)

---

**Previous focus (Phase 4.5)** retained below for historical context.

---

**Phase 4.5: Local Feedback Loop** — SPECIFIED, ready for implementation

Branch: TBD (branch from `main` after Phase 4 merge)

Graham distilled the 2-round Phase 4.5 brainstorm (10 agents) into two spec documents:
- `docs/forge-phase4.5-spec.md` — Full implementation spec for the local PGO engine
- `docs/forge-phase5-roadmap.md` — Roadmap for Phase 4.6 (change vector learning), Phase 5 (cloud PGO), and wild cards

**Phase 4.5 delivers:**
- 3 new modules: `telemetry/` (5 files), `prescribers/` (4 files), `applier/` (3 files)
- DB migration 011: `signal_samples`, `execution_profiles`, `optimization_hints` tables
- Drift score computation (5 weighted signals, GREEN/YELLOW/RED classification)
- 2 new prescribers: prompt optimizer + token optimizer
- Optimization applier with SKILL.md v2 frontmatter extensions
- Self-tuning strategy parameters
- ~1200 LOC production, ~600-800 LOC tests, 61-80 estimated tests

**Key design decisions:**
- Determinism > Token Cost (Aaron's constraint — pervades all weights and priorities)
- Collectors as HookObservers (no separate event bus)
- Manual loop trigger in Forge, Curator-driven in Cairn
- TelemetrySink abstraction bridges Phase 4.5 (LocalDBOMSink) → Phase 5 (AppInsightsSink)
- FeedbackSource as new shared type in @akubly/types (first new shared type since Phase 2)
- Canary bootstrap for cold start (gradual ramp from 0 → 3 → 5 → 10 sessions)

**Work decomposition:** 4 streams. Alexander owns DB (6 items), Roger owns telemetry (7 items), Rosella owns prescribers + applier (8 items), Laura owns integration tests (5 items). 5 waves of parallelism.

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


