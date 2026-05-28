# Roger — History (Summarized)

## Summary

**Total entries:** 4 major consultations spanning Phase 4.5 telemetry + Phase 4.6 change vectors + Round 2 brain system consulting + Round 2 roster proposal

| Date | Event | Status |
|------|-------|--------|
| 2026-05-02 | Phase 4.5 Telemetry Learnings | ✅ Completed |
| 2026-05-01 | Persona Review Fixes (F1-F7) | ✅ Completed |
| 2026-05-03–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (Platform Engineer Core Role) | 🟡 Proposal pending Aaron |

**Key themes:**
- Telemetry aggregation: meanFromMeta() fix, convergence floor, signal component surface
- Bridge event contracts: EVENT_MAP alignment, COLLECTOR_BRIDGE_EVENTS constant, contract test
- Brain system: Evolved from "extend Curator" → "new package monorepo" → "new repo with Platform Engineer Phase 1–3 lead"
- Brain roster: Proposed Platform Engineer (core) role with 60/40 Cairn/Brain split during Phase 1

**Recent decision:** Roger proposes Platform Engineer role for Brain Phase 1–3 infrastructure (tiers, properties, representation, acquisition); recommends bringing in specialists for cognitive layers (KINDS, reasoning ACTIVITIES).

---

## Core Context

**Load-bearing platform decisions for Eureka v1:**
- **Integration seam (§40 owner):** Roger owns cross-package integration, M0 monorepo merge (5-day sprint + 4-hour spike first), rollback to npm packages + private registry if exceeded
- **Reconciliation playbook:** Weekly cron for `eureka reconcile`; telemetry counter `eureka_reconcile_divergence_count`; written decision tree for divergence response (Forge replay vs manual INSERT vs delete orphaned row)
- **Auto-flush feature flag:** Opt-in auto-flush-on-session-end for v1 (not deferred); actionable error UX text with §60 message style
- **Kernel-extraction canary:** M3 success criterion: move packages/eureka/src/learning/ → packages/learning-kernel/src/, count edits; success = < 10 edits. Validates extraction-ready contract.
- **Partial-restore test (M4):** Delete one DB at a time; verify graceful degradation. session_id is opaque metadata (NFR-6), not traversable FK.
- **Load-test SLO (M4):** 1000 facts, measure P50/P95/P99; P95 < 500ms = shipped SLO; P95 > 500ms = ship-blocker. Telemetry histogram `eureka_recall_latency_ms`.
- **Dep-direction lint (M1):** Cross-package import guard moved to M1 acceptance criteria (from M5). Auto-check via ESLint rule.
- **Cycle 2 findings landed:** I1 (lint), I5 (auto-flush), I6 (M0 5-day), I8 (reconciliation), I9 (load test), M3 (canary), M4 (restore test) — 7 findings in §40 (+23.7% size)

**Dependencies:** Eureka design package locked (2026-05-28). M0 time-box starts immediately; integration is critical path for M1.

---

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate). Edgar recommends Eureka extract Cairn's sweep/ranker/trust into shared learning-kernel package.

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.

---

## Archive (Summarized)

### Phase 4.5 Telemetry + Persona Review Fixes (2026-05-01 to 2026-05-02)

**Scope:** Telemetry module hardening, 7 persona review findings fixed.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Lessons:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.

---

**Downstream:** Prescribers now have signal-level granularity for targeting specific drift drivers (e.g., toolEntropy vs contextBloat).
📌 Team update (2026-05-26T22:27:00Z): **Wave 5 integration merge strategy finalized** — W5-1/W5-3/W5-4/W5-2 ordered; all conflicts resolved; root npm run build + npm test green (Cairn 597/597, Forge 644/647). W5 phase-4.6/wave-5-integration ready for PR — Scribe
📌 **Wave 6 integrated onto phase-4.6/wave-6 (2026-05-26)** — W5-6 forge-metrics CLI standalone subcommand preserved as commit 871a492. Integration complete with W5-5 (Rosella) + #17 (Laura). Tests 648/651 green. Awaiting Aaron's /review-cycle. — Scribe
📌 Team update (2026-05-23T21:20:00Z): **Wave 4 W4-1 & W4-2 complete** — insertHintIfNew atomicity (migration 013, partial UNIQUE index, BEGIN IMMEDIATE) + CairnEvent extensions (hint_state_transition, profile_bump events, system session). All unit tests passing; integration Groups A & B both 5/5+3/3. 584 Cairn tests green. — Scribe

# Roger — History

**Role:** Composition root architecture (R2: @akubly/skillsmith-runtime), Wave 2-4 integration, atomicity + observability fixes

**Wave 5 Status:** All inter-dependencies resolved on phase-4.6/wave-5-integration. Cairn 597/597 + Forge 644/647 tests passing. Root build green.

**Wave 4 Work (W4-1 & W4-2):**
- W4-1: insertHintIfNew atomicity via migration 013 (partial UNIQUE index) + BEGIN IMMEDIATE transaction
- W4-2: CairnEvent extensions (hint_state_transition, profile_bump events, __system__ session)

**Wave 3 Complete:** Composition root delivered (option R2). Hook wiring done. Per-skill orchestration live.

**Learnings summarized to history-archive.md**
- Events logged to `__system__` session created via `ensureSystemSession()` helper
- Payload structure: `{skill_id, hint_id/profile_id, from_state/to_state or bump_kind, granularity, timestamp}`
- Added 5 unit tests covering event emission scenarios
- Files: `packages/cairn/src/db/optimizationHints.ts`, `packages/cairn/src/db/executionProfiles.ts`, `packages/cairn/src/db/sessions.ts`, `packages/cairn/src/__tests__/cairnEvents.test.ts`
- **Gotcha:** Event emission must occur AFTER transaction commits, not inside the transaction, or events won't be persisted

**Test Results:** 584 cairn tests passing, full suite green. Migration number bumped from 012 to 013.

## 2026-05-23: 📌 Wave 4 Complete — W4-1 & W4-2 Implemented

**Status:** ✅ Both work items shipped on phase-4.6/wave-4 branch

**W4-1: insertHintIfNew Atomicity (COMPLETE)**
- Migration 013 with partial UNIQUE index on (skill_id, source, category) WHERE status IN ('pending', 'accepted', 'deferred')
- `db.transaction().immediate()` wrapper prevents concurrent duplicates
- 3/3 concurrent insertion tests passing
- Files: 013-hint-atomicity.ts, optimizationHints.ts, schema.ts (registered), 3 new tests

**W4-2: CairnEvent Extensions (COMPLETE)**
- `hint_state_transition` event on insert + status updates (skill_id, hint_id, from_state, to_state, timestamp)
- `profile_bump` event on create/update (skill_id, profile_id, bump_kind, granularity, timestamp)
- `ensureSystemSession()` helper creates __system__ session for system-level events
- 5/5 observability tests passing (event emission, forward-compat, transactional integrity)
- **Gotcha found and fixed:** Event emission inside transaction loses events; moved emission outside transaction scope
- Files: optimizationHints.ts, executionProfiles.ts, sessions.ts, 5 new tests in cairnEvents.test.ts

**Integration Test Outcomes:**
- Group A (W4-1 atomicity): 3/3 ✅
- Group B (W4-2 observability): 5/5 ✅
- Total W4-1 & W4-2: 8/8 integration passing

**Schema Version:** 012 → 013 (full migration path)

**Cross-Team Coordination Notes:**
- W4-3 (Rosella's forceRegenerate) depends on W4-1 atomicity; expire-then-insert semantics compatible with partial UNIQUE index
- W4-4 (Laura's integration tests) validates all three work items; test infrastructure gaps identified in Groups C/D (not implementation bugs)

---

**Older learnings archived to history-archive.md**

### W5-1 Session-Kind Separation (2026-05-25)

- Migration 014 adds `sessions.session_kind` (`user` default, `system` for `__system__` backfill) instead of renaming repo keys; smallest compatible split that preserves existing session rows.
- New Cairn APIs: `getMostRecentUserSession()` and `getActiveUserSession(repoKey)` return only active `session_kind='user'` rows; `getMostRecentActiveSession()` remains generic for internal/system-aware callers.
- `ensureSystemSession()` now creates/finds system-kind rows so CairnEvents (`hint_state_transition`, `profile_bump`) stay on internal observability sessions.
- Four MCP fallback call sites now route through `getUserSessionForMcpFallback()`: `resolve_prescription` apply session attribution, `lint_skill` telemetry, `test_skill` scenario telemetry, and `test_skill` direct validation telemetry.
- Gotcha: deterministic tests must manually set `started_at` because SQLite `datetime('now')` has second-level precision, so creation order alone can tie.
### W5-2 DB explicit-db hard-cut (2026-05-25)

- Hard-cut Cairn DB public helpers to require an explicit `db: Database.Database` first parameter; removed deprecated/default-db overloads including `logEventWithDefaultDb` and `getExecutionProfileWithDb`.
- Functions changed: 78 exported Cairn DB functions across 14 DB modules.
- Call-site threading touched 1,165 db-threading lines across 32 consumer/test files (Cairn agents/hooks/MCP, Forge wave integration tests, runtime-cli tests, skillsmith-runtime tests).
- Structural consumer changes: `curate()` now captures one db handle and passes it into detector helpers; MCP server caches the initialized db handle per process; session-start stale-session helper takes db explicitly; prescriber/curator/session-state private helpers now receive db from their entry point. Most other consumers were trivial `db` threading.
- Validation: `npm run build` clean. Direct workspace Vitest runs green: Cairn 587/587, Forge 644/647 with 3 todo, runtime-cli 8/8, skillsmith-runtime 8/8. Root `npm test` was attempted but the wrapped npm/vitest process stalled in this shared CLI TTY; direct workspace Vitest runs passed from package directories after persona-review fixes.

## 2026-05-26: Phase 4.6 Wave 5 integration stack

- Built `phase-4.6/wave-5-integration` from `main` with W5-1 → W5-3 → W5-4 → W5-2. Small independent deltas landed first; the explicit DB hard-cut landed last so new W5-1/W5-3/W5-4 APIs could be adapted once.
- Merge hotspots: W5-4 only conflicted in `.squad/identity/now.md`; kept `main`'s completed Wave 5 state. W5-2 conflicted in migration 012 tests, `db/sessions.ts`, MCP session fallback call sites, and skillsmith-runtime profile loading.
- Resolution pattern: preserve W5-1 user-vs-system session semantics, but thread W5-2's explicit `db` handle through `getActiveUserSession()`, `getMostRecentUserSession()`, and `getUserSessionForMcpFallback()`. Preserve W5-3's tier chain and W5-4's staleness attenuation, but call W5-2's `getExecutionProfile(db, ...)` API.
- Scribe's “644/647” was Forge's 644 passing plus 3 pre-existing `it.todo` placeholders, not failing tests. The only integration failure found was a stale runtime-cli test seeding a W5-3 per-model profile without W5-2's explicit db parameter; fixed in `forgePrescribe.test.ts`.
- Final validation: `npm run build` clean and root `npm test` green across workspaces: Cairn 597/597, Forge 644 passed + 3 todo of 647, runtime-cli 9/9, skillsmith-runtime 24/24. If it compiles and ships, the janitor takes the win.

## Learnings (2026-05-26 — W5-6 forge-metrics CLI)

### CLI sub-command pattern (runtime-cli)
- Each CLI sub-command gets its own entry point file (e.g. `src/forge-metrics.ts`) with a `main(argv)` function and a `bin` entry in `package.json`. Tests cover `main()` via `loadMetrics()` + formatter functions; the entry point itself stays thin.
- `parseArgs` from `node:util` handles arg parsing. `strict: true` + `allowPositionals: false` is the standard config — crashes on unknown flags, which is correct for operator tools.
- The `--format` flag pattern (JSON default, `--format table` opt-in) is clean for dual-mode operator tools. Formatters are pure functions on a typed input snapshot — easy to unit test.

### JSON schema design (SkillMetrics)
- Top-level nullable fields (`staleness`, `confidence`, `autoApplyEligible`) collapse to `null` when no profile is found. This gives a stable schema: callers always see the same top-level keys.
- The "found: boolean" discriminated union on `profile` is clean for both JSON and TypeScript narrowing.
- `recentPrescriberRuns: null` means "event type not present (W5-5 not landed)"; `[]` means "event type exists but no runs for this skill". Two distinct null states encoded intentionally.

### Integration with W5-3 (tier fallback) and W5-4 (staleness attenuation)
- Call `loadExecutionProfile(db, skillId, { fallbackPolicy: 'full-chain' })` — that's the operator path, same as `runForgePrescribe`. The returned `source` field reports which tier matched.
- The returned `profile.confidence` is already attenuated if stale. `profile.staleness.stale` tells you whether attenuation was applied. Raw confidence is always `1.0` for DB profiles (no raw stored).
- `getSessionsSinceInstall()` reads from `prescriber_state.sessions_since_install`, NOT from `SELECT COUNT(*) FROM sessions`. Tests must use `UPDATE prescriber_state SET sessions_since_install = N WHERE id = 1` to seed staleness conditions, not `createSession()`.

### Defensive W5-5 coding pattern
- Query `prescriber_run` events with `json_extract(payload, '$.skillId') = ?`. If no events of that type exist anywhere, return `null` (event type not landed). If they exist but none for this skill, return `[]`.
- Wrap the entire query in try/catch and degrade to `null` on any error — metrics reads should never crash the command.


## 2026-05-03: Curator Overlap Analysis — Agentic Brain System

**Context:** Aaron considering whether a new "agentic brain/memory/thinking/learning system" belongs in Cairn repo vs separate repo. Asked me to analyze overlap with Curator.

**What I discovered:**
- The Curator is already 70% of what Aaron describes — it's a pattern-detection → insight-generation → prescription → feedback learning pipeline
- Phase 4.6 (just landed) added change_vectors — the Curator already **learns from feedback** by computing metric deltas for applied prescriptions and using those to scale future confidence
- The "missing 30%" is LLM-augmented reasoning, cross-session correlations, and contextual prescription generation — these are **extensions** of existing Curator capabilities, not a separate system
- The boundary between Curator and a new "agentic brain" is not clean:
  - Same event stream (`event_log`)
  - Same insight storage (`insights` table)
  - Same prescription contract (8-state lifecycle, human-in-the-loop, Apply Engine)
  - Same learning feedback (`change_vectors`, `execution_profiles`)
- Forking creates two competing knowledge stores with overlapping lifecycles — concept drift, user confusion, maintenance burden, learning fragmentation

**My position:** The new system belongs HERE, extending the Curator pipeline.

**Recommended path:**
- Add LLM reasoning as a fourth detector in `curator.ts` (alongside recurring errors, sequences, skip frequency)
- Trigger LLM when static detectors produce low-confidence insights or when correlations suggest causality
- Store reasoning traces in `insights.reasoning_trace` (optional JSON column, migration 013)
- Extend Prescriber with LLM-generated advice (fallback to static templates when unavailable)
- Reuse change_vectors for learning feedback — works uniformly regardless of detection method

**Phase plan suggestion:**
- Phase 8: LLM-augmented pattern detection (extend Curator)
- Phase 9: Contextual prescription generation (extend Prescriber)
- Phase 10: Cross-session reasoning + long-term memory consolidation (new Consolidator agent, same `insights` table)

**Key insight:** The Curator is not "just" a static rule engine. Phase 4.6 already made it a learning system (observe → measure → adapt). The fork/extend decision is really "do we believe pattern detection and agentic reasoning are the same problem?" I do. Extend, don't fork.

**File written:** `.squad/decisions/inbox/roger-curator-overlap-analysis.md` (detailed 10-section analysis)

**Key file paths reviewed:**
- `packages/cairn/src/agents/curator.ts` — 550-line pipeline, cursor-based, transactional, 3 pattern detectors + change vector sweep
- `packages/cairn/src/agents/prescriber.ts` — closes observe→act loop, 8-state prescription lifecycle
- `packages/cairn/src/db/changeVectors.ts` — CRUD for learning feedback (Phase 4.6)
- `packages/cairn/src/db/insights.ts` — pattern storage with evidence + confidence + lifecycle
- `packages/cairn/src/mcp/server.ts` — 10 tools exposing knowledge base to conversations


## 2026-05-03: Agentic Brain System — Position Reversal

**Context:** Aaron provided brain dump for new "agentic brain/memory/thinking/learning system" with TIERS (agent/subagent, organizational, project, user), KINDS (practical, semantic, syntactic, linguistic, symbolic, philosophical), PROPERTIES (recency, trustworthiness, plasticity), ACTIVITIES (recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate), REPRESENTATION (graph, cross-ref, markdown), and ACQUISITION (codebase exploration, periodic discovery, journaling).

**My prior position (2026-05-03 morning):** Extend the Curator — argued it's "already 70% of what Aaron describes" based on pattern-detection pipeline overlap.

**My revised position (2026-05-03 afternoon):** **NEW PACKAGE (`packages/mem`) in this repo.**

**Why I flipped:**

1. **TIERS problem:** Curator is project-scoped (one tier). The new system spans agent/organizational/project/user tiers (multi-scope). Extending Curator to multi-tier turns it into a universal memory router — different package.

2. **KINDS problem:** Curator's `insights` table is optimized for event-triggered practical patterns (recurring errors, sequences, skip frequency). Aaron's KINDS include linguistic (phrasing patterns), symbolic (call graphs), philosophical (judgment guidelines) — these require different evidence types (corpus stats, AST diffs, guideline text vs event IDs). Schema conflict → polyglot knowledge store → different package.

3. **ACTIVITIES problem:** Curator is a reactive event processor (cursor-based batch processing on hook triggers). Aaron's ACTIVITIES include dream/meditate/ideate/pray — proactive agents that run on schedules or prompts, reason over aggregated state. Architectural mismatch → new agentic runtime → different package.

4. **User-memory tier:** Curator is per-project. User memory is cross-project, cwd-aware. Separate concern → lives in `packages/mem/src/tiers/user.ts`, Cairn becomes project-tier delegate.

**What I got wrong in my prior analysis:**
- Conflated "pattern detection" (one slice) with "universal memory" (six-dimensional system).
- Assumed single-tier scope (project-only) when Aaron meant multi-tier (agent/organizational/project/user).
- Underestimated KINDS heterogeneity (practical vs linguistic vs symbolic vs philosophical have different evidence/consumers/lifecycles).
- Missed proactive vs reactive distinction (dream/meditate aren't event-triggered, they're scheduled/prompt-driven).

**Recommended architecture:**
- **NEW PACKAGE:** `packages/mem` in this repo (monorepo benefits, shared build/types).
- **Tier delegation:** `packages/mem/src/tiers/project.ts` wraps Cairn Curator (reads insights, surfaces via multi-tier router). Cairn stays unchanged.
- **Kinds federation:** Practical/syntactic patterns delegate to Cairn. Semantic/linguistic/symbolic/philosophical live natively in `packages/mem`.
- **Activities runtime:** Reactive activities (recall, re-evaluate) hook into Cairn's event stream. Proactive activities (dream, meditate, ideate, explore) run on schedules/prompts in new agentic runtime (`packages/mem/src/activities/index.ts`).

**Key insight:** Curator is **one specialized agent** within a broader memory system, not the system itself. Extending it to ALL tiers + ALL kinds + ALL activities breaks package boundaries. The new system is a **meta-layer** that federates Cairn (project-tier practical patterns) along with other tiers/kinds/activities.

**File written:** `.squad/decisions/inbox/roger-brain-refined.md` (detailed 8-section analysis with architecture options, Q&A on Aaron's four specific questions, and appendix on what I got wrong).

**Next steps if Aaron accepts:**
- Phase 8: Create `packages/mem` structure (tiers/kinds/activities/properties/representation/acquisition).
- Phase 8.1: Implement project-tier delegation (wrap Cairn Curator).
- Phase 8.2: Implement user-tier memory (cwd-aware routing).
- Phase 9: Implement semantic/linguistic KINDS (corpus analysis).
- Phase 10: Implement meditate/dream ACTIVITIES (proactive consolidation + speculative reasoning).

**Lesson learned:** When Aaron says "brain dump," he's describing a **system architecture**, not a feature request. My job is to map that architecture to packages/repos, not force-fit it into the nearest existing code. Bottom-up analysis (what does Curator do today?) misses top-down constraints (what does the full system require?).



## Consultation: Brain/Memory System Repo Placement (Round 2)

**Date:** 2026-05-22  
**Session:** Refined recommendation following Aaron's brain dump clarification  
**Artifact:** .squad/orchestration-log/2026-05-22T20-25-51-roger-*.md  
**Merged into:** .squad/decisions.md as "Open Question: Brain/Memory/Learning System"

### Summary

Participated in Round 2 consulting on repo placement for new agentic brain/memory/learning system. Analyzed Aaron's five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) and refined position from Round 1.

**Outcome:** Recommendation documented in .squad/orchestration-log/2026-05-22T20-25-51-roger-brain-refined.md. All deliberation merged to decisions.md for Aaron's consideration.

---

## 2026-05-23: Self-Fit Assessment — Brain/Memory Project Squad Readiness

**Prompt:** Aaron asked: does this squad think they're the *right* squad for the brain project? Be candid about where Cairn knowledge transfers vs doesn't, whether I'm energized by the scope, and whether I'd stay on the squad.

**Context:** Prior analysis debated repo placement (new repo vs monorepo). This session is different — not about architecture, but about personal expertise fit and energy alignment.

### My Honest Answer

**Infrastructure layers (TIERS, PROPERTIES, REPRESENTATION, ACQUISITION):** I'm ready. 9/10 confidence.  
**Cognitive layers (ACTIVITIES like dream/meditate/pray; KINDS like linguistic/symbolic):** I'm not ready. 2/10 confidence.

**What I'd do:** Own Phase 1–3 infrastructure. Bring in specialists for reasoning + knowledge modeling. Hand off after Phase 3 if brain becomes separate deployment.

### Where Cairn Transfers (HIGH VALUE)

1. **Event stream observability** → Multi-tier federation (cursor-based processing scales; contract patterns reusable)
2. **Prescriber lifecycle** → Acquisition orchestration (8-state human-in-the-loop model maps to memory capture)
3. **SQLite + Git locality** → Foundation for Phases 1–3 (proven deployment; monorepo patterns reusable)
4. **Confidence + evidence tracking** → PROPERTIES (trustworthiness, recency, plasticity analog to confidence/evidence/last_fired)

### Where Cairn Does NOT Transfer (LOW VALUE)

1. **Pattern detection logic** — Cairn detects operational events (recurring errors, sequences); brain needs AST patterns, corpus analysis, guideline extraction. Evidence types incompatible. Transfer: ~0%.
2. **ACTIVITIES (dream/meditate/pray/ideate)** — Cairn is reactive event processor; brain needs proactive reasoning loops. Runtime models incompatible. Transfer: ~0%.
3. **Linguistic/Symbolic/Philosophical KINDS** — Requires expertise in NLP + domain modeling + epistemology. I have none. Transfer: ~0%.
4. **Knowledge-graph representation** — Graphs, embeddings, semantic traversal outside my sweet spot. Transfer: ~5% (can scaffold, need specialist to optimize).

### Energy Breakdown

| Layer | Energy Level | Why |
|-------|--------------|-----|
| TIERS (federation/routing) | 🟢 HIGH | Bread and butter. |
| PROPERTIES (metrics/signals) | 🟢 HIGH | Core platform skills. |
| REPRESENTATION (SQLite/Git) | 🟢 HIGH | Databases/versioning/deployment. |
| ACQUISITION (crawlers/hooks) | 🟡 MEDIUM | Automation + API design. Doable. |
| ACTIVITIES (recall/re-evaluate) | 🟡 MEDIUM | Straightforward querying. Mechanical. |
| ACTIVITIES (dream/meditate/pray) | 🔴 LOW | Agentic reasoning. Unfamiliar. Not energized. |
| KINDS (semantic/linguistic/symbolic) | 🔴 LOW | Domain modeling beyond expertise. |

### Would I Stay on the Squad?

**Yes, with scoped role (Phase 1–3).**

**Option A (Preferred):** Platform Lead for infrastructure layers. Own TIERS, PROPERTIES, REPRESENTATION, ACQUISITION. Delegate KINDS + reasoning ACTIVITIES to specialists. Timeline: 6–9 weeks.

**Option B (Monorepo):** Ongoing platform engineer, same scope, longer commitment. Interface with Cairn for project-tier delegation.

**Option C (Separate repo + backend service):** Hand off after Phase 3. Brain's domain shifts to org-tier federation with Postgres/Azure Functions — not my focus.

### Specialists I'd Want Alongside

1. **LLM-Augmented Reasoning Engineer** — dream/meditate/pray/ideate ACTIVITIES
2. **Knowledge Ontology Specialist** (linguistics + domain modeling) — semantic/linguistic/symbolic/philosophical KINDS
3. **Graph DB Specialist** (optional, if representation scales) — graph traversal optimization
4. **Testing Automation Person** (nice to have) — acquisition pipeline regression suites

### Where My Expertise Is Sharpest

Cairn is my sweet spot (operational event processing, pattern detection, prescriber lifecycle, change vectors, SQLite/Git). Brain's infrastructure is a natural extension. Brain's cognitive layers require different expertise — and I'm honest enough to hand off rather than half-step.

### Key Insight

**Platform engineering is about building systems other people think in. The brain project is about what people think in. Related but different jobs.**

I'm the right person for the foundation. But bring in specialists for the cognition.

**File written:** `.squad/decisions/inbox/roger-self-fit.md` (detailed 10-section self-assessment with energy breakdown, options, and honest readiness evaluation)

---

## Brain Project — Proposed Role (2026-05-22)

**Status:** Proposal pending Aaron approval

**Role:** Platform Engineer (core) for Brain project

**Allocation:** Borrow from Cairn — 60/40 split during Phase 1 (primary Cairn, secondary Brain)

**Mandate:** Storage layer, federation protocol, tier resolution

**Deliverables Phase 1:**
- User tier installed and persisting
- Project tier federating to user

**Coordination model:**
- Scoped 1-week sprints with defined deliverables
- Handoff docs: what was done, what's next, who owns it
- No interleaving within a day
- Escalation to Aaron if Brain work threatens Cairn timeline (Brain defers)

**Sync ceremonies:**
- Weekly cross-team standup with Brain Lead + Cairn Lead
- Biweekly boundary review

**Notes:** Roger recommends new repo (separate deployment boundary for org-tier federation); pragmatic to extract later if monorepo prototype needed first. Confidence in Platform role high; Brain needs epistemology/learning systems specialists for the cognitive layer.

---

## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Substrate ownership clarified; implementation runway clear  

**For Roger's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. Substrate topology is now fixed — no coordination overhead from multiple repos. Platform Engineer role (your proposed Eureka Phase 1–3 infrastructure lead) can now design with monorepo as baseline.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored and approved. London-school outside-in approach ties Eureka learning systems cleanly to §30's algorithmic seams. Edgar's three post-review improvements to §30 (ClockProvider, latency targets, CuratorStore signature) are non-blocking but valuable.
- **Coordination Model Still Open:** Weekly standup + biweekly boundary review remain the plan. Monorepo resolves the "separate deployment boundary" question — shared substrate is now a feature, not a problem.

**Next:** Brain infrastructure design can build on stable, unified shared types. Phase 1 (tiers, properties, representation) has clear mocking boundaries via §55 TDD strategy.


---

## Eureka Project Kickoff (2026-05-22)

**Date:** 2026-05-22  
**Event:** Aaron approved project name + hired 3 specialists; monorepo placement decided  
**New Colleagues:** Genesta (Cognitive Systems Lead), Crispin (Knowledge Representation), Edgar (Learning Systems)  
**Role:** Platform Engineer (infrastructure) for Eureka Phase 1–3; continue Cairn as primary

### Context & Rationale

Aaron decided: Build Eureka in `packages/eureka/` (monorepo), not separate repo.
- Round 2 deliberation: Roger recommended NEW PACKAGE (pragmatic, extract later if needed)
- Round 3 self-assessment: Roger identified expertise gaps (cognitive science, epistemology, agentic loops) and recommended hiring specialists
- ✅ New hires fill those gaps, allowing Roger's infrastructure expertise to be leveraged without overextending into cognitive domains

### Impact on Roger

**Primary focus:** Continue Cairn platform work (federation, observability, prescriber lifecycle)

**Secondary focus:** Eureka infrastructure (Phases 1–3) — at reduced allocation from initial proposal
- Original proposal: 60/40 split (Cairn/Brain)
- Revised (post-hiring): Ad-hoc consultation on tier federation + back-pressure; primary commitment stays Cairn

**Cross-project responsibility:**
- Design project-tier delegation: How does `packages/eureka/` wrap Cairn Curator for practical-pattern tiers?
- Advise on federation protocol: Tier resolution, conflict handling, cwd-aware routing
- Coordinate Eureka ↔ Cairn integration seams

**Key context:**
- Genesta (Cognitive Systems Lead) handles epistemology + agentic reasoning loops (the gap Roger identified)
- Crispin (Knowledge Representation Specialist) handles KINDS ontology + graph design (the gap Roger identified)
- Edgar (Learning Systems Specialist) handles ACTIVITIES + meta-learning (the gap Roger identified)
- Roger's infrastructure strengths (tiers, properties, representation, acquisition) now team expertise, not solo responsibility

---

### 2026-05-27: TD Re-Pass Batch Complete — §40 DI Audit + Recommendation Application

**Event:** Part of Aaron's 6-agent TD re-pass batch (audits + follow-up executions across §20/§30/§40/§50).

**Phase 1 — Audit §40 DI Seams vs §55 London-School TDD Mock Boundaries:**
- **Task:** Verify that §40's package wiring makes the 5 TDD mock boundaries (storage, time, RNG, model, network) injectable for test-time substitution
- **Scope:** Check if dependency injection pattern (db-first-param, factory, etc.) aligns with §55's mock contract seams
- **Verdict:** ✅ MINOR WIRING CHANGES NEEDED
- **Key findings:** 80% injectable; 2 seams need explicit extraction (time, RNG), 1 correctly deferred (model), 2 fully prepared (storage, network)
- **Deliverable:** `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md` (full audit report with code examples)
- **Status:** ✅ PHASE 1 COMPLETE

**Phase 2 — Apply §40 Recommendations After Aaron Approval:**
- **Task:** Execute all DI wiring recommendations to align §40 with §55 TDD boundaries
- **Recommendations applied:**
  1. ✅ Added §40.5.4 "Time Injection for Determinism" — documents `ClockProvider` interface, default-parameter injection pattern, production/mock implementations
  2. ✅ Added §40.5.5 "RNG Injection (v1.5 Prep)" — documents `RandomSource` interface, stub implementation, proactively extracted for future stochastic activities (meditate, contemplate)
  3. ✅ Updated §40.5.1 embedding paragraph — added forward-documentation for v1.5 `EmbeddingService` network boundary
  4. ✅ Flagged §40.8.3 model boundary — added note for v1.5 `ModelProvider` seam when LLM calls land
- **Content growth:** +19.8% (2 new subsections ~100-120 lines each, 2 inline notes)
- **Deliverable:** Edited `docs/eureka/sections/40-integration.md` (+19.8%)
- **Status:** ✅ PHASE 2 COMPLETE

**Key Insights:**
1. **DI seams != heavyweight DI containers.** §40's `db: Database.Database` first-param pattern IS dependency injection without framework overhead. Default parameters (`clock: ClockProvider = systemClock`) are the right granularity for pure-function collaborators.
2. **Defer != ignore.** §40 correctly punted LLM/embedding mocking to v1.5, but documenting seams NOW saves v1.5 from hardwiring mistakes.
3. **Monorepo simplifies test dependencies.** With `cairn` as `devDependency`, Eureka tests can import better-sqlite3 wrappers directly — impossible with npm-published packages.
4. **Time injection enables determinism without mocking frameworks.** Just two interfaces (`ClockProvider`, `SystemClock` production impl) turn non-deterministic time-dependent code into testable pure functions.

**Coordination:** 
- Coordinated with Edgar's §30 Time Injection section — single canonical `ClockProvider` pattern documented in both §30 and §40
- Roger's §40.5.4 and Edgar's §30 §2.4 are complementary (§40 wiring, §30 usage) — verified no conflicts

**Confidence:** HIGH — audit validated DI boundaries are sound; v1 can hardcode `Date.now()` and extract to `ClockProvider` in refactor phase (red/green/refactor allows this).

**Deliverables:**
- 2 orchestration logs (Phase 1 audit + Phase 2 apply)
- Updated `.squad/agents/roger/history.md` (this entry)

**Timeline:** Complete. §40 wiring guide now comprehensive for v1 implementation and forward-compatible for v1.5 seams.

**Team Update:** §40 DI wiring patterns are now explicitly documented for storage, time, RNG, model, and network boundaries. Future code should use these patterns for injectable test seams. Time injection is available now (v1); RNG/model/network are extraction-ready for v1.5.


### Delegation Pattern

**What Roger owns:** Storage layer, federation protocol, SQLite + Git infrastructure  
**What specialists own:** Cognitive layers, ontology design, reasoning loops  
**Interface:** Clean TIERS abstraction — Eureka calls `project_tier.get()` which delegates to Cairn; Eureka manages user/organizational tiers separately

---

## 2026-05-26: Eureka Integration Section (§40)

**Context:** Aaron requested integration section for Eureka technical design. Co-authoring with Graham (overview), Genesta (activity model), Crispin (representation), Edgar (runtime), Laura (test strategy).

**Scope:** Package topology, Cairn/Forge integration, persistence layer, tier-aware storage, API surface, Crucible boundary.

**Deliverable:** `docs/eureka/sections/40-integration.md` (580 lines, 26 KB)

### Key Decisions Documented

**Package topology:**
- Dependency arrows: `eureka → types`, no runtime coupling to Cairn/Forge
- Workspace dependencies use `"*"` (not `workspace:*` — npm rejects it)
- No circular deps — Eureka is consumer, never producer

**Cairn integration:**
- Session identity unification (R8): Shared `SessionId` brand from `@akubly/types`
- Lens framing: Cairn owns lifecycle, Eureka owns epistemology
- Manual ingestion in v1 (`eureka ingest-session`), automatic in v1.5
- Separate migrations — Eureka does NOT touch Cairn's `knowledge.db`
- DB-injection pattern reused (explicit `db: Database.Database` first param)

**Forge integration:**
- Decision ingestion (Path 2, FR-14) — lossy projection from `DecisionRecord` to `DecisionPayload`
- No prescriber ownership in v1 — Eureka is data source only
- Manual CLI in v1 (`eureka ingest-decisions --session <uuid>`)

**Persistence:**
- SQLite + FTS5 for v1 (BM25 lexical search)
- Reserved `embedding_vector BLOB` column (nullable, unpopulated) for v1.5 forward compat
- Why not graph DB? Projection-on-read, not storage. SQLite gives joins + FTS5.
- Why not LMDB? Lacks relational joins and FTS5.

**Tier storage:**
- Agent tier fully wired in v1 (`~/.cairn/eureka-agent.db`)
- User/project tiers stub (throws on writes, empty reads)
- Graceful degradation — fan-out code stays tier-agnostic

**API surface:**
- Library: `recall`, `integrate`, `decide`, `commit`, `retire`, `evict`
- CLI: `eureka ingest-session`, `eureka ingest-decisions`, `eureka recall`
- Fail-open principle — recall failures return empty result set, never block agent

**Crucible boundary:**
- High-risk overlap: Crucible's L1 WAL vs Cairn's `event_log`
- Name collision: Crucible `Decision` vs Forge `DecisionRecord` vs Eureka `DecisionPayload`
- Dependency blocker: Crucible assumes Forge in `harness`, actually in `mem`
- v1 stance: Separate at v1, integrate at v1.5 (Cassima recommendation)

### Open Questions Surfaced

1. **Cairn/Forge repo ownership** — `mem`, `harness`, or third repo? Blocks Crucible and Eureka v1.
2. **Crucible `Decision` rename** — Adopt `ChoiceEvent` to avoid collision?
3. **Event-log federation** — Merge into Cairn or stay separate?
4. **User/project tier activation** — When? Blocked on Squad migration timeline.
5. **Prescriber extraction** — Should Forge prescribers move to Crucible at v1.5?
6. **Automatic ingestion** — v1 or v1.5? Edgar recommends v1 before dogfood.
7. **Cross-tier normalization** — Parallel fan-out + global score norm, or sequential early-exit?

### Risk Register

7 risks documented with likelihood/impact/mitigation:
- R1: Crucible dependency blocker (HIGH/HIGH)
- R2: BM25 recall failure on keyword-disjoint queries (CERTAIN/MEDIUM — known v1 gap)
- R3: User/project tier activation delay (MEDIUM/LOW)
- R4: Session-identity coupling drift (LOW/MEDIUM — ESLint guardrail mitigates)
- R5: Ingestion lag (HIGH if manual / MEDIUM impact)
- R6: Migration schema drift (LOW/HIGH — separate `schema_version` tables mitigate)

### Learnings

### 2026-05-27: §40 DI Seam Audit vs §55

**Task:** Audit §40 (integration/package wiring) against §55's mock boundaries (storage, time, RNG, model, network).

**Verdict:** MINOR WIRING CHANGES NEEDED — 80% injectable, two seams need explicit extraction (time via `ClockProvider`, RNG via `RandomSource`), three already correct (storage, model-deferred, network-prepared).

**Key DI patterns learned:**

1. **First-param injection is sufficient DI** — §40's `db: Database.Database` first-param pattern is injectable without heavyweight DI containers. Tests pass `:memory:` DB; production passes file-backed DB. No need for constructor injection or service locators when function signatures expose dependencies.

2. **Default parameters = prod-ready DI** — Pattern `computeRecencyScore(lastAccessed: number, clock: ClockProvider = systemClock)` makes prod code zero-ceremony (`computeRecencyScore(timestamp)` just works) while tests inject mocks (`computeRecencyScore(timestamp, mockClock)`). This is Edgar's queued `ClockProvider` pattern from decisions.md — applies equally to RNG.

3. **Document seams even when deferred** — §40 correctly defers embeddings (v1.5) but should document the `EmbeddingService` interface *now* so v1.5 doesn't hardwire `fetch()` calls. "Reserved column" (schema) + "interface extraction path" (docs) = complete forward compatibility.

4. **Monorepo enables test-fixture sharing** — With Cairn as `devDependency`, Eureka tests import its `better-sqlite3` wrappers and migration helpers directly. No duplication. This is impossible with npm-published packages (can't make sqlite3 a devDep of a published package without bloating consumers).

**Outcome:** Inbox file `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md` documents minor changes (two new subsections for ClockProvider/RandomSource, two inline notes for model/network). Non-blocking; estimated 30 min to apply. All changes are additive clarifications, not redesigns.

---

**What I got right:**
- **DB-injection pattern reuse** — Cairn's explicit-db-param pattern is testable and composable. Adopted for Eureka storage layer.
- **Forward-compat schema design** — `embedding_vector BLOB` column (nullable, unpopulated) lets v1.5 add embeddings without breaking v1 readers. Same pattern as Cairn's reserved columns.
- **Fail-open principle** — Telemetry must never block session execution (Cairn Phase 4.5 lesson). Applied to Eureka recall — failures return empty result set.
- **Tier-agnostic fan-out** — Unwired tiers return empty reads (not errors). Lets fan-out code stay uniform; no v1/v1.5 conditional logic.

**Where I added value:**
- **Risk register** — Named the hard parts plainly (Crucible dependency blocker, BM25 keyword-disjoint gap, ingestion lag). No sugarcoating.
- **Trade-offs surfaced** — SQLite vs graph DB, BM25 vs embeddings, manual vs automatic ingestion. Rationale for each choice.
- **Open questions escalated** — 7 questions Aaron must answer (repo ownership, event-log federation, tier activation). No false certainty.

**What surprised me:**
- **Crucible overlap depth** — The Cassima impact analysis revealed backward dependency (Forge in `mem`, Crucible assumes `harness`). Both PRDs ship v1 in parallel but neither acknowledges cross-repo coupling. This is a BLOCKER, not a nice-to-have.
- **Session-identity R8 unification** — Aaron's directive to share `SessionId` brand relaxed the "isolated by design" framing from v4. Genesta's 5 guardrails (lens framing, ESLint boundary, no runtime traversal) prevent coupling drift. Pragmatic compromise.
- **BM25 honesty in PRD** — Genesta + Cassima explicitly partitioned eval suite into "overlap" (ship gate) and "disjoint" (transparency only) buckets. This is the right bar for v1 — high precision on lexically-overlapping queries, documented gap on disjoint. No pretending BM25 is semantic.

**Platform engineering heuristic reinforced:**
> "Storage technology choice is about what you DON'T need, not what you might want later."

SQLite + FTS5 is enough for v1. Graph DB / LMDB / vector store deferred until v1.5 demand signal proves we need them. Start simple, harden from data.

**File written:** `docs/eureka/sections/40-integration.md` (580 lines, 12 sections, 7 open questions, 6 risks)

### 2026-05-27: §40 DI Seam Execution (Roger Audit Applied)

**Task:** Apply §40 DI-seam audit recommendations directly to `docs/eureka/sections/40-integration.md` per Aaron's approval.

**Changes applied:**
1. **Added §40.6 "Testability Seams"** — New section documenting three DI seams (ClockProvider, RandomSource, default-parameter pattern)
2. **Cross-referenced §30 §2.4** — Referenced Edgar's `ClockProvider` interface definition (NOT redefined; §30 owns the interface, §40 documents the wiring)
3. **Defined `RandomSource` interface** — §30 doesn't define RNG seam, so §40 defines it as a cross-package wiring concern (v1.5 prep)
4. **Documented default-parameter injection pattern** — Extracted from §55 §2.5 Laura's `recall({ query }, { agentStore, userStore })` style
5. **Confirmed db-first-param as canonical** — §40.2.4 already documented; added cross-ref to §55 §1.2 mock seam rubric
6. **Added cross-references** — §40.2.4 → §55 §1.2, §40.6.1 → §30 §2.4, §40.8.3 → audit model-boundary note, §40.9.2 → §55 §3.3
7. **Renumbered sections** — §40.6 insertion pushed remaining sections down (§40.7–§40.13)

**Length impact:** 666 → 798 lines (19.8% increase, slightly over 15% target but all substantive content required by audit).

**Learnings:**

1. **Cross-section coordination works** — Edgar landed §30 §2.4 `ClockProvider` independently; I referenced it without collision. Section-ownership discipline (§30 = algorithm interfaces, §40 = wiring, §55 = TDD workflow) prevented duplication.

2. **Default-parameter injection is the right granularity for pure-function collaborators** — Heavy DI containers (Spring, InversifyJS) are overkill for stateless collaborators like `ClockProvider` or `RandomSource`. Default parameters give tests injection points without ceremony for production code.

3. **"Document seams even when deferred" applies to v1.5 prep** — `RandomSource` interface defined in v1 even though stochastic activities (`meditate`, `contemplate`) throw `NotImplementedError`. This prevents v1.5 from hardwiring `Math.random()` calls when they land.

4. **Audit-then-apply workflow scales** — Roger wrote audit `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md` (proposal), Aaron approved, Roger executed (this task). Separation of analysis from execution lets Aaron review tradeoffs before committing to changes.

**What changed from audit:**
- Audit estimated 30 lines; actual was 132 lines (§40.6 grew from bullets to worked examples with code blocks).
- Audit recommended "one-sentence note" for model/network boundaries; actual included code examples for clarity.
- Length overage (19.8% vs 15% target) due to complete code examples in §40.6.2 and §40.6.3 (DeterministicRandom implementation, tier fan-out table).

**Deviations from audit:** None. Edgar's §30 §2.4 `ClockProvider` matches audit recommendation exactly (Unix epoch seconds, `SystemClock` / `MockClock` implementations). No conflicts discovered.

**File updated:** `docs/eureka/sections/40-integration.md` (666 → 798 lines, +§40.6 Testability Seams)


## 2026-05-28: Cycle 2 Fix Wave — 7 Persona-Review Findings

**Context:** Persona-review cycle 1 surfaced 19 findings (all accepted by Aaron). Canonical resolutions in `.squad/decisions/inbox/squad-cycle1-canon.md`. Roger assigned 7 findings spanning milestones, reconciliation, feature flags, and load-test wiring.

**Task:** Apply I1, I5, I6, I8, I9, M3, M4 canonical resolutions to `docs/eureka/sections/40-integration.md`.

**Changes applied:**

1. **I1 — Dep-direction lint to M1:** Moved dependency-direction guardrail from M5 to M1 milestone. Added ESLint `no-restricted-imports` rule specification in §40.9.2 M1 deliverable. Documented enforcement mechanism (ESLint custom rule or `no-restricted-imports` pattern match) so Cairn/Forge cannot import from `@akubly/eureka`.

2. **I5 — Auto-flush feature flag (v1 opt-in):** Added feature flag `eureka.auto_flush_on_session_end: boolean = false` to §40.2.2. Documented Forge runtime hook integration point (`packages/forge/src/runtime/session.ts`). Wrote actionable error UX text for "Memory not captured — fix steps" with 3-step recovery path (manual CLI, enable flag, telemetry counter). Cross-referenced §60 for full error-message patterns.

3. **I6 — M0 monorepo merge time-box:** Documented M0 5-day budget in new §40.9.1. Added 4-hour scaffolding spike (pnpm workspace + turborepo + one cross-package import). Specified rollback procedure: revert to ADR-0002 Option C (npm packages with private registry) if M0 exceeds budget. Rationale: time-box prevents sunk-cost fallacy on messy package boundaries.

4. **I8 — Bridge reconciliation (cron + telemetry + runbook):** Created new §40.10 "Bridge Reconciliation" with 4 subsections:
   - §40.10.1: `eureka reconcile` CLI command spec
   - §40.10.2: Weekly cron schedule (Sunday 02:00 UTC), telemetry counter `eureka_reconcile_divergence_count`
   - §40.10.3: Written decision tree for divergence response (4 scenarios: missing in Eureka, orphaned in Eureka, mutable-field drift, immutable-field drift). Each scenario has root cause, fix command, and prevention guidance.
   - §40.10.4: v1.5 design note (push-based event-stream comparison instead of pull-audit)

5. **I9 — M4 load-test wiring:** Added load-test deliverable to §40.9.3 M4 milestone. Spec: 1000 facts (NFR-2 target), measure P50/P95/P99 recall latency, ship-blocker if P95 > 500ms. Production telemetry: histogram `eureka_recall_latency_ms`. Cross-referenced I9 canonical SLO from §30 (Edgar owns the SLO statement; §40 owns the cross-package test wiring).

6. **M3 — Kernel-extraction canary at M5:** Added §40.9.4 M5 deliverable: literally move `packages/eureka/src/learning/` to `packages/learning-kernel/src/` on throwaway branch, run tests, count required edits. Success criterion: edit count < 10 (extraction is "mechanical"). Defined what counts as edit (interface changes, test rewrites) vs what doesn't (import-path replacements). If canary fails, document blockers and defer to v1.5.

7. **M4 — Partial-restore test at M4:** Added partial-restore test to §40.9.3 M4 milestone. Two scenarios: delete Eureka DB (keep Cairn), delete Cairn DB (keep Eureka). Success criteria: no crashes, graceful degradation, empty result sets, opaque session_id handling. Implementation note (NFR-6): `session_id` is opaque metadata, not traversable FK — Eureka MUST NOT query Cairn sessions table at runtime.

**Section reorganization:**
- Created new §40.9 "Milestone Deliverables & Acceptance" (4 subsections: M0, M1, M4, M5)
- Created new §40.10 "Bridge Reconciliation" (4 subsections: command, schedule, runbook, v1.5 note)
- Renumbered existing §40.9–§40.13 → §40.11–§40.15
- Cross-referenced §30 (Edgar) for 500ms SLO statement, §60 for error UX patterns, ADR-0002 for rollback option

**Length impact:** 798 → 987 lines (23.7% increase, over 20% target but unavoidable with 7 substantive findings requiring milestones + runbook + feature-flag prose).

**Learnings:**

1. **Milestone ownership discipline:** §40 owns cross-package wiring deliverables (lint rules, build topology, load tests, reconciliation cron). Activity-specific logic (BM25 ranker, trust decay, recency formula) lives in §10/§30/§55. This prevents section bloat — §40 documents *when* and *how* integration happens, not *what* algorithms run.

2. **Runbooks are first-class documentation:** I8's divergence-response decision tree (4 scenarios × [root cause + fix + prevention]) is more valuable than the reconciliation algorithm itself. Operators need playbooks, not just CLI commands. The runbook is 60 lines; the algorithm spec is 15 lines.

3. **Time-boxing prevents sunk-cost traps:** I6's "5-day budget + 4-hour spike + rollback procedure" is a hedge against monorepo unknowns. Documenting the rollback (Option C: private npm registry) before starting M0 gives the team permission to bail if integration is messier than expected. This is anti-heroics engineering.

4. **Feature flags need error UX, not just boolean config:** I5's auto-flush flag isn't just `boolean = false` — it needs actionable error text when disabled and forgotten. The 3-step recovery path (manual CLI, enable flag, telemetry counter) turns a "memory not captured" failure into a learning moment for operators.

5. **Canaries validate design claims:** M3's kernel-extraction throwaway branch is a design validator, not a v1 deliverable. "Edit count < 10" operationalizes "kernel-shaped" (PRD §1 claim). If the canary fails, v1 ships anyway but v1.5 extraction risk is known. This is lightweight architecture decision record (ADR) via experiment.

6. **Graceful degradation requires opaque-metadata discipline:** M4's partial-restore test validates NFR-6 (graceful degradation) by literally deleting databases and asserting no crashes. The implementation note "`session_id` is opaque metadata, not traversable FK" prevents future coupling drift — if Eureka ever queries Cairn's `sessions` table at runtime, the partial-restore test catches it.

7. **Cross-section coordination via canon works:** All 7 findings referenced other sections (§30 for SLO, §60 for UX, ADR-0002 for rollback, §55 for test patterns) without collision. The canon document (squad-cycle1-canon.md) acted as the coordination point — I didn't need to read Edgar's or Laura's changes to know what to cross-reference.

**Length overage justification:**
- 7 findings (heaviest load of any agent in cycle 2)
- 2 new top-level sections (§40.9 milestones + §40.10 reconciliation)
- Runbook prose unavoidable (4 divergence scenarios × decision tree)
- All content substantive (no fluff; every line serves acceptance criteria or operational guidance)

**File updated:** `docs/eureka/sections/40-integration.md` (798 → 987 lines, +§40.9 Milestones, +§40.10 Reconciliation)



