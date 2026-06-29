---
updated_at: 2026-06-27T22:32:23-07:00
focus_area: Eureka `integrate` consolidation activity SHIPPED ✅ — PR #85 squash-merged to main (f7e1c29). Reframed integrate from write-wrapper to POST-imprint consolidation pass (Option B, Aaron-approved): imprint=lossless public write API; integrate({sessionId})→IntegrationReport writes idempotent duplicate_of edges (star-to-canonical) into new fact_relations table. 2-cycle persona review + 3-round Copilot cloud review all resolved; 350/350 tests; new CI test-typecheck gate (tsconfig.typecheck.json). Eureka v1 activity surface now COMPLETE: imprint + recall + integrate.
next_focus: "**Option A — Recall consumes duplicate_of edges**" (Aaron chose 2026-06-27). integrate currently writes a WRITE-ONLY fact_relations table (no runtime consumer — intentional incremental delivery). Next slice: recall-side consumer that reads duplicate_of edges to collapse/demote known duplicates in recall results, making consolidation user-visible. Same Eureka crew (Genesta/Crispin/Edgar/Laura). This is the honest completion of the integrate arc.
previous_focus: Crucible S1 SHIPPED (PR #73); S2 substrate hardening; Phase 0.5 walking skeleton (#80) shipped
parallel_track: Eureka M7 (B+C+D) SHIPPED on main; M1 runway clear; Phase 5 roadmap next
active_issues:
  - "**Eureka M7 (B+C+D) COMPLETE & SHIPPED** ✅ (2026-06-02) — PR #41 cloud-review-cycle marathon: 5 cycles, 22 unique findings (44 threads), 74 tests green, tsc-clean, lint-clean, merged to main as ed6be2c; M7-A (error typing) + M7-B (error narrowing) + M7-C (atomicity contract) + M7-D (regression locks) all delivered"
  - "M7 Review Learnings: (1) Contract tests must lock REQUIRED behavior; (2) Grep entire repo for old interface names post-refactor; (3) Seam changes cascade into JSDoc+SKILL.md+decisions.md; (4) Windows lint uses workspace scripts not root glob; (5) Read/write contract symmetry non-optional; (6) Identity-check cleanup pattern in promise chains"
  - "New Skill: `.squad/skills/refactor-grep-cleanup/SKILL.md` (Cycle 5 outcome — systematic grep patterns for post-refactor cleanup)"
  - "**Eureka M5+M6 COMPLETE & REVIEW-CLEAN** ✅ — Trust feedback mutation (applyFeedback + applyFeedbackById + FactReader seams); 40/40 tests GREEN; 3-cycle consensus (12→4→4 finding trajectory); tsc clean; shipped"
  - "Branch: eureka/m5-m6-trust-feedback (11 commits from 9892415 to 112c966)"
  - "Review cycle: 15 personas + 6 squad spawns; 20 findings total (1 blocking in C1, 0 in C2+C3); 100% ACCEPT'ed & implemented"
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

**🎯 Crucible CTD Design Review — COMPLETE (2026-05-30)**

Original Pass + Pass A + childSid Round 2 all closed. ADR-0019 capstone artifact landed. Ready for implementation phase.

## Session 2026-05-30 Summary

Design review closed across three phases:
- **Original Pass (2026-05-30 09:00 UTC):** 5-persona design panel yielded 21 findings
- **Pass A (2026-05-30 11:00 UTC):** Fresh panel on chapters 5/7/8/9/10 yielded 25 findings
- **childSid Round 2 (2026-05-30 19:41 UTC):** 4-persona review (Graham/Valanice/Laura/Roger) + Aaron synthesis → ADR-0019 landed + Rosella full execution

## Key Cross-Persona Convergence

**Wall-clock replay-determinism bug:** Graham (Architect) + Laura (Tester) independently caught the same blocker — time-aware heuristics must ground in logical time (offsets), not wall-clock. This finding elevated from "nice-to-have" to "non-negotiable drop." Protocol design principle captured for future: Hermetic replay requires deterministic basis; wall-clock time is informational metadata, not load-bearing.

## ADR-0019: childSid Collision Hybrid

**Status:** ✅ LANDED (comprehensive, 315 lines)

**Capstone decision:** Always-prompt UX without automatic heuristics. User chooses Fresh vs. Resume via TTY prompt; explicit flags for CI/automation. Decision row recorded in parent ledger for deterministic replay.

**10 design points incorporated (no deviations):**
1. ✅ Dropped wall-clock heuristic entirely
2. ✅ Always-prompt UX (no auto-timeout)
3. ✅ "New" naming (parallel with "Resume")
4. ✅ Non-TTY exit code 2 (protect automation)
5. ✅ Flags: --new, --resume, --no-interactive, --label
6. ✅ Decision row in parent ledger
7. ✅ Preimage rules (timestamp for new, reuse for resume)
8. ✅ `fork_resume` Observation sub-kind
9. ✅ Keep both flag + `crucible session resume` verb
10. ✅ Closed-session metadata append clarification

**7 CTD files edited:**
- ADR-0019 created (capstone)
- §10.4 (fork protocol rewritten)
- §10.1 (session state machine + metadata append)
- §6.3 (observation taxonomy + fork_resume)
- §13.1 (CLI verbs + flags)
- §16.9 (8 A-Fork-* acceptance scenarios)
- 2 options docs marked SUPERSEDED

## Also Landed This Session

**PA-B4: Ancestry-Aware Reads** — Option A (ReadSetBuilder.ancestry() API) landed in §7.3, §6.1, §11.4, §7.A. Replay protocol clarified; C-6b conformance property added; Eureka v1.5 forward reference documented.

## Reviewer Findings Synthesized

- **Graham:** Wall-clock bug (architectural), parent-ledger append pattern (idiomatic RFC+Decision), scheduler isolation
- **Valanice:** Naming ("Fresh" → "New"), relative-time disclosure (UX salience), cognitive boundaries (1-hour threshold)
- **Laura:** Wall-clock bug (replay determinism), 8 A-Fork-* acceptance scenarios, all user stories testable
- **Roger:** TTY detection + exit codes (automation safety), dropped --disambiguator (redundancy), orthogonal workflows (flag+verb)

All four reviewers: APPROVE-WITH-CONDITIONS. All conditions met in ADR-0019.

## Skill Captured

**cross-persona-review-yields-replay-bug-catch:** Multi-persona design review with distinct lenses (Architect, Tester, UX, CLI) independently surfaced replay-determinism correctness violation that single-reviewer design or unit tests alone would miss. Domain expertise + cross-lens convergence = high-confidence signal.

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

## Parallel track — Eureka v1 (active on main)

**Eureka v1 M5+M6 COMPLETE & REVIEW-CLEAN — READY FOR AARON'S SHIP DECISION**

Branch: `eureka/m5-m6-trust-feedback` (11 commits, 40/40 tests GREEN, tsc clean, ship-ready). M0/M1 runway clear; PR #30 (v1-design-package) merged earlier.

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


