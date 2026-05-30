# Alexander — History (Summarized)
📌 Team update (2026-05-26T22:27:00Z): **Wave 5-5 post-review complete** — W5-5 MCP forge_prescribe build break fixed (root: McpToolResult missing [key:string]:unknown index sig). +4 fail-open/structural tests from Laura's plan (5065082 + 4a4df6f). Tests 44→48 passing, root npm run build green ✅ — Scribe

# Alexander — History (Recent)

## Issue #25 — Wave 6 R6 Type-Tightening Polish (2026-05-30, PR #32)

**Branch:** `squad/25-type-tightening-polish`
**PR:** https://github.com/akubly/stunning-adventure/pull/32
**Build:** green (`tsc --build` exit 0)
**Tests:** 24/24 runtime-cli tests passing

Four type-only changes, all carryover from PR #24 cloud-review:

**R6-T1 — Test stub completeness (`forgeMetrics.test.ts:381`):**
The I4 round-trip prescriber stub was returning a partial object missing `exitCode`, `skillId`, `dbPath`, `hints`, and `totalPersisted`. Tightened to the full `ForgePrescribeSuccessResult` contract.

**R6-T2 — `SkillMetricsProfileInfo.tier` (`metrics/types.ts:5`):**
Was `string`, now `LoadedProfileSource` (`'per-skill' | 'per-model' | 'per-user' | 'global'`).
Source of truth: `packages/skillsmith-runtime/src/runtime.ts:21`.

**R6-T3 — `SkillMetricsStaleness.reason` (`metrics/types.ts:25`):**
Was `string | null`, now `'count' | 'age' | 'count+age' | null`.
Source of truth: `ProfileStalenessReason` in `packages/types/src/index.ts:163`. The `annotateProfileStaleness` function in skillsmith-runtime produces exactly these 4 values.

**R6-T4 — `SkillMetricsPrescriberRun.profileSource` (`metrics/types.ts:43`):**
Was `string | null`, now `LoadedProfileSource | null`.
Required a co-change to `loadMetrics.ts`'s JSON-parse annotation (also `string | null`) to remain type-safe without a cast. The event payload is written by `handler.ts` which already typed this as `LoadedProfileSource | null`, so the tightening is semantically correct.

**Key lesson:** When tightening a type on a reader interface, always trace back to the JSON-parse cast in the reader and tighten the parse annotation simultaneously — otherwise TSC will reject the assignment.



### PR #24 Copilot Review Threads Addressed
All 6 accepted threads fixed in commit 10c2791 (new HEAD):

**T1 (unused code):** Deleted `resolveRepoKey` function in loadMetrics.ts:28-34 — zero callers found. Only `resolveActiveRepoKey` is used.

**T2 (semantic correctness — IMPORTANT LESSON):** Reverted cycle-2's `json_valid(payload)` guard from the sentinel query (loadMetrics.ts:77). **Lesson: presence-check semantics ≠ quality-check semantics.** The sentinel query answers "is the prescriber_run event type deployed in this database?" (feature-presence), NOT "are all rows parseable?" (data-quality). Adding `json_valid` to the sentinel made the function conflate the two: if all rows were malformed, the sentinel would return false (no rows found) and the function would signal "W5-5 not landed" (wrong!) instead of "W5-5 landed, skill has zero valid runs" (correct). Sentinel is now `WHERE event_type = 'prescriber_run'` only. The main query retains `json_valid()` to skip corrupt rows during json_extract. Test expectations unchanged — the I3 test already asserted the correct behavior (non-null on malformed-only dataset); updated test comment to clarify sentinel semantics.

**T3 (doc sync):** Updated docs/issue-17-async-io-sweep-findings.md:170-174 to reflect both W5-5 async-IO test gaps are now CLOSED: (1) fail-open guarding landed (handler.ts:100-127 try/catch around logEvent), (2) structural no-fs test landed (forgePrescribeMcp.test.ts I5).

**T4 (schema doc correction):** Updated .squad/decisions.md:1167-1181 to reflect the SHIPPED payload schema uses camelCase keys (`skillId`, `triggeredBy`, `sessionId`, `profileSource`, `totalHints`), not the originally documented snake_case. Added a correction addendum explaining the cycle-1 fix realigned to codebase convention. See handler.ts:102-118 for canonical payload construction.

**T5, T6 (gitignore bypass cleanup):** Untracked two gitignored files that were force-added: `.squad/orchestration-log/2026-05-26-wave-6-integration.md` (gitignored by .gitignore:50) and `.squad/log/2026-05-26-wave-6-kickoff.md` (gitignored by .gitignore:51). **Lesson: force-adding gitignored files is an anti-pattern, especially for runtime state files.** These files should have stayed local-only; untracking them restores the .gitignore contract without deleting the local copies.

**Verification:** Build + tests passed cleanly:
- `npm run build` from root: exit 0
- `npm test --workspace=@akubly/runtime-cli`: 24/24 passing
- `npm test --workspace=@akubly/skillsmith-runtime`: 48/48 passing

**Key takeaway:** The T2 lesson is foundational: when adding defensive guards (like `json_valid`), distinguish between **presence checks** (sentinel queries for feature deployment) and **quality checks** (row-level filters for parseability). Don't conflate them — the semantics diverge when all data is corrupt.

---

## Learnings (2026-05-26 — Wave 6 Cycle-1 Fix Wave)

### Findings Addressed
All 8 accepted findings fixed in 4 commits:
- **B1 (BLOCKING)**: `prescriber_run` payload schema mismatch — handler wrote snake_case (`skill_id`, `profile_used`, `total_hints`); reader queried camelCase (`skillId`, `profileSource`, `totalHints`). SQL filter `json_extract(payload, '$.skillId')` never matched → `forge-metrics` CLI always returned empty prescriber runs in production.
- **I1**: `triggeredBy` field was never set by handler; reader defaults to 'unknown'. Added `triggeredBy: 'mcp:forge_prescribe'` to interface + payload.
- **I2**: Fail-open tests verified tool result was ok but never asserted stderr write happened. Added `vi.spyOn(process.stderr, 'write')` + assertions.
- **I3**: Monolithic try/catch in `queryPrescriberRuns` returned null on ANY error (including SQLite throwing on malformed JSON in json_extract WHERE clause). Added `json_valid(payload)` guard to SQL + per-row JS try/catch for defense-in-depth.
- **I4**: No handler→reader integration test — root cause of why B1 shipped. Added round-trip test calling real `forgePrescribeHandler` then `loadMetrics`.
- **M1**: Duplicate `closeDb()` removed from `.catch()` in forge-metrics.ts.
- **M2**: Vacuous force-flag assertions guarded by `if (inserted > 0)` restructured to unconditional relational contracts.
- **M3**: "serial proof" language in mcp-async-io.test.ts and issue-17 findings doc replaced with "sync IO bounded and guarded"; added clarifying sentence about concurrent-handler serialization.

### Root Cause
Schema contract drift between W5-5 writer (handler.ts, Rosella) and W5-6 reader (loadMetrics.ts, Roger). Each package's test suite was internally consistent but neither tested the cross-package round-trip. The handler tests only verified that a payload was written; the reader tests only verified that a correctly-shaped payload was read. Nobody checked that the shapes matched.

### The Lesson
**Cross-deliverable contracts need at least one round-trip test.** When a writer and reader live in different packages and are developed in separate waves, the integration surface is invisible to unit tests on either side. The I4 round-trip test (forgePrescribeHandler writes → loadMetrics reads) is the test that *would have caught B1 before it shipped*. Going forward: any new event/payload pair that crosses a package boundary must have a round-trip test in the consuming package that imports the writer directly.

### Collateral Discovery
SQLite 3.47.x (bundled by better-sqlite3) throws `malformed JSON` from `json_extract()` when the payload column contains invalid JSON — even in the WHERE clause evaluation. The documented behavior (return NULL for invalid JSON) does not match actual behavior at this version. Added `json_valid(payload)` guard upstream of `json_extract()` to prevent the throw and skip invalid rows gracefully.



## 2026-05-26: Wave 6 Kickoff Summary

Scribe orchestration complete: Graham's v3 scope finalized and merged to `.squad/decisions.md`. Key scope decisions:
- **ChangeVectorProvider** port with async return type for Phase 5 cloud readiness
- **Wave 2/3 split:** Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3 (requires composition-root decision)
- **Hint deduplication** via `(skillId, source, category)` key with active-status filter
- **Two-layer negative-impact attenuation:** Confidence scaling + eligibility flag (`autoApplyEligible`)

Decisions archived; all decisions.md > 20KB now. Ready for implementation on Wave 2 primitives (computation + ranking only; runtime wiring follows in Wave 3).

---

## Core Context


**Role:** SDK/Runtime Dev  
**Joined:** 2026-04-28  
**Specialization:** Monorepo migration patterns, circular dependency resolution, migration framework expertise, prescriber CRUD integration

**Key Patterns Mastered:**
- Migration framework: single `migration.up(db)` with all DDL, versioning tied to filename, idempotent re-runs via `schema_version` table
- Circular dependency management: Cairn↔Forge import constraint solved via mirror + regression test guard (Laura L5)
- CRUD patterns: explicit `db` parameter for transactional control vs internal getDb() calls; anti-join for compute-once guards
- Type field naming: encode semantic space (confidence level vs confidenceBoost multiplier) to prevent latent traps
- Two-tier sort partition (matched vs unmatched) for correct ranking when optional keys diverge negative
- Lockout-routing pattern: cross-assignment fixes prevent author bias; each agent fixes other's code per review

**Recent Work (Phase 4.6 W1–3):**
- Wave 1: A1–A4 completed (migration 012, schema v12, changeVectors CRUD, Curator sweep integration); weight constants decision: mirror in cairn + L5 guard
- Wave 3: Lockout-fixed Rosella's prescriber code (confidence → confidenceBoost); extracted duplicate sort to utils.ts; 3 advisory fixes (safeMin guard, JSDoc, DRY)
- Current: Wave 2 owner for @akubly/types — promote ChangeVectorSummary, define ChangeVectorProvider port, implement SqliteChangeVectorProvider in Cairn

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — @akubly/types Port + Cairn Adapter

Wave 2 scope amended: `docs/forge-phase4.6-wave2-scope.md` updated with PrescriberOrchestrator port + negative-impact attenuation. New ADR merged to `.squad/decisions.md`. Invocation point: `Curator.curate()` post-vector-sweep. Attenuation: when `meanNetImpact < 0`, `confidenceBoost` ≤ 1.0 (minimum 0.3), preventing auto-apply of harmful prescriptions.

---

## 2026-05-20: Phase 4.6 Wave 2 Scoping — @akubly/types Port + Cairn Adapter

---

## Summary

**Total entries:** 5 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting + Round 2 roster proposal

| Date | Event | Status |
|------|-------|--------|
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-05–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-22 | Brain Project Roster Proposal (Integration Engineer Core Role) | 🟡 Proposal pending Aaron |

**Key themes:**
- SDK runtime: Forge execution model, decision gates, DBOM provenance
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- Brain system: Evolved from "monorepo packages/brain/" → "NEW REPO" → "Integration Engineer Phase 1 on-call, data boundaries specialist"
- Brain roster: Proposed Integration Engineer (core) on-call role with Cairn-primary commitment

**Recent decision:** Alexander proposes Integration Engineer on-call role for Brain adapters + MCP tools; recommends new repo with Postgres backend + deployment boundary. Core strength is data-oriented boundaries; Brain needs agentic cognition specialists.

---

## Archive (Summarized)

### Phase 4.5-4.6 SDK + Change Vectors Work (2026-05-01 to 2026-05-04)

**Scope:** Finding 8 fixes, Phase 4.6 foundation (Wave 1 A1-A4), lockout-compliant fixes (Wave 3), advisory fixes (Cycle 3).

**Key deliverables:**

1. **FeedbackSource.getProfile enhancement:** Added optional `granularityKey` parameter to address per-user/per-model profiles. DB key is `(skill_id, granularity, granularity_key)` but contract was less expressive. Fixed with backward-compatible optional param.

2. **Change Vector Foundation (Phase 4.6 Wave 1):** 
   - Migration 012 + schema v12 registration
   - changeVectors CRUD module (with explicit db param for transactions)
   - Curator sweep integration (post-event-loop, anti-join on hints without vectors)
   - Weight constants mirrored in Cairn (can't import Forge); regression test guards divergence

3. **Lockout-Compliant Fixes:** Fixed Rosella's confidence → confidenceBoost rename in prescribers, ensuring semantic clarity (level vs boost).

4. **Advisory Fixes:** safeMin guard for log-denominator (Math.max(1, minVectors)), JSDoc enhancements, DRY extraction for identical sort blocks.

**Architecture decisions:**
- Circular dependency prevention: duplicate weights + regression test (not imports)
- Sign convention: deltas stored as `after - before`; negate lower-is-better for net_impact
- Transactional CRUD: explicit db parameter better than internal getDb() for Curator contexts
- Query planning: SQLite handles JOIN + index-based filtering efficiently for change_vectors

**Test status:** 1034+ passing (cairn 478 + forge 556+, up from baseline 990).

**Lessons:**
- Shared type contracts less expressive than storage = contract bug, not feature gap. Additive optional params have near-zero risk.
- Migration framework handles idempotency; DDL template is single exec() per migration.
- Lockout rule is real safety: cross-review catches blind spots single review misses.
- JSDoc on type fields with runtime invariants should name the code location enforcing invariant, not just intent.

---
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.
**Problem:** `FeedbackSource.getProfile(skillId, granularity?)` couldn't address per-user / per-model profiles. DB key is `(skill_id, granularity, granularity_key)`.

**Fix:** Added optional `granularityKey?: string` third parameter. Updated JSDoc with per-tier semantics (user id for per-user, model id for per-model, 'global' default).

**Verification:** `npm run build` clean; `npm test` 512/512 passing. No call sites changed (optional, additive).

**Lesson:** Treat unexpressive shared contracts as bugs, not feature gaps — additive optional parameters carry low risk.

---

## 2026-05-03–04: Phase 4.6 Waves 1 & 3 Summary

**Wave 1 (Foundation):** A1–A4 completed. Decision: mirror weight constants in cairn + Laura L5 regression test to guard against drift. Curator sweep integration: post-event-loop call, not per-batch, keeps transaction model clean.

**Wave 3 (Lockout Fixes):** Fixed Rosella's prescriber code—renamed `confidence` → `confidenceBoost` (semantic distinction: level vs multiplier). Extracted 8-line duplicate sort block from both prescribers to `utils.ts` (12 lines removed, one call each).

**Key Lesson:** Advisory findings surface edge cases (null checks, boundary behavior) that happy-path code misses. Cycle 3's `safeMin` guard (`minVectors=0` → denominator `Math.log(1) = 0`) is exactly this.

**Build status:** 1153 tests passing (baseline 990 + 163 new). Branch review-clean, all cycles complete.

---

## 2026-05-22: Wave 3 Integration Analysis — Curator–MCP Wiring Mapped

Completed comprehensive integration surface analysis for Wave 3 Curator-driven orchestration. All five requested sections delivered:

**1. Curator surface today:**
- `curate(changeVectorConfig?)` exports from `packages/cairn/src/agents/curator.ts`; returns `CurateResult` with `changeVectorSweep` metadata
- Call sites: `sessionStart.ts:68` and `mcp/server.ts:327` (both read-only in Wave 2)
- Vector sweep identifies skills with newly computed categories; invocation hook for Wave 3 injector

**2. Profile selection strategy (three independent dimensions):**
- **Trigger set:** Trigger-driven (skills with new vectors) vs. global vs. hybrid batching. **Recommended:** Trigger-driven for v1.
- **Granularity tier:** Per-skill only vs. all tiers. **Recommended:** Per-skill only (matches vector computation scope).
- **Skip conditions:** No profile, immature sessionCount, stale profile. **Recommended:** v1 skips on no-profile or `sessionCount < minSessions`.
- Operators observe: skills processed, skipped, hint volume, dedup stats.

**3. MCP tool shape:** `run_prescriber_optimization(force?: boolean)` with output: success, skills processed, hints (generated/inserted/dedup'd), vector applicability, next steps.

**4. Curator config surface:** Backward-compatible signature addition: `curate(changeVectorConfig?, prescriberOrchestrationConfig?)`. Orchestrator is an injectable dependency (`runForSkill` function + optional profile loader). Composition root constructs and passes it.

**5. ADR blockers identified:**
- Composition root choice (A–D from Roger's track) gates implementation
- Hook vs. MCP tool vs. both (invocation model)
- Eager vs. lazy Forge import (startup cost, optional dependency handling)
- Profile expansion (explicit skill list, global tier fallback, staleness) deferred to Wave 4

Analysis is **mechanical once composition root is decided**. Hard parts (data plumbing, attenuation, dedup) already in Wave 2. Full report: `.squad/agents/alexander/wave3-integration-analysis.md`.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Clean separation, best test isolation, Phase 5-ready. Unblocks all Wave 3 work items.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool exposure in Wave 3. Curator hook is autonomous surface; `forge-prescribe` CLI is manual surface. `run_prescriber_optimization` MCP tool deferred to later wave when concrete operator need surfaces. Removes ~7 items, ~18 tests from Wave 3 scope.
- **W3-D4: Curator Hook → Always-On** — Automatic prescriber orchestration invocation enabled always. No opt-in flag in v1. Existing safety rails (negative-impact attenuation, hint dedup, fail-open semantics) sufficient. Profile selection trigger-driven only; global tier fallback deferred to Wave 4.

## Learnings (2026-05-22: Wave 3 Integration Analysis — Curator–MCP Wiring Mapped)
- Keeping Forge's local `OptimizationCategory` union in place is safe for W2-2 because Roger canonized the shared union to match Forge's stricter category set; the barrel contract stays structurally compatible in both directions.
- Added `packages/forge/src/prescribers/types.contract.test.ts` with two guards: barrel-vs-canonical type assignability and a prompt-prescriber regression using a canonical summary carrying `autoApplyEligible`. Validation passed with `npm run build` from repo root and `npm test --workspace=@akubly/forge` (599 passed, 3 todo).
- `runForgePrescribers()` now lives in `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts`, queries an optional `ChangeVectorProvider`, and returns the combined prompt/token hint list without dedup or persistence.
- Forge attenuation semantics are now: mature vectors with `meanNetImpact <= -0.2` attenuate confidence to `max(0.1, 1 + meanNetImpact)` and force `autoApplyEligible = false`; sparse negatives or mature negatives above `-0.2` stay neutral at `confidenceBoost = 1.0`.
- `autoApplyEligible` is stored on matched hints both as a top-level field and in `hint.evidence.autoApplyEligible`; unmatched hints omit the field so Phase 4.5 callers still read absence as eligible.
- Added `packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts` with ten cases (nine maturity-gradient scenarios plus provider-failure fallback); validation passed with `npm test --workspace=@akubly/forge` (609 passed, 3 todo), root `npm test`, and root `npm run build`.
- Negative-impact auto-apply gating is now inclusive at `<= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (`-0.2`), keeping exact-boundary cases on the manual-review side because the safety asymmetry favors false positives over false negatives.
- Wave 3 integration is **injection-based**: Curator accepts an optional orchestrator config (not a direct Forge import). This preserves the acyclic dependency boundary and allows composition root to wire both packages independently. The orchestrator is a simple function pointer (`runForSkill`), not a class — keeps it lightweight and testable.

## Learnings (2026-05-23 — W3-3 Prescriber orchestration types)
- `ExecutionProfile` was already canonized in `@akubly/types`, so W3-3 should extend that package in place instead of duplicating or structurally mirroring the shape from Cairn. That keeps the dependency boundary acyclic and avoids type drift between Curator, Forge, and the composition root.
- `loadProfile` stays **synchronous** for Wave 3 because today's loader shape (`FeedbackSource.getProfile()` and Cairn DB accessors) is synchronous. If Phase 5 cloud/profile fetching makes this async later, evolve the shared contract then rather than widening early without a caller.
- `packages/skillsmith-runtime/src/index.ts` now re-exports the canonical `PrescriberOrchestrationConfig` / `PrescriberRunResult` types from `@akubly/types`; W3-5 can wire real implementations against those exports without changing the scaffold API.
- W3-4 should consume `PrescriberOrchestrationConfig.loadProfile()` as an optional sync hook and treat null as a skip path; W3-5 should return `PrescriberRunResult` counts aligned with Forge's raw hint generation and Cairn dedup/persistence outcomes.

## Learnings (2026-05-23 — W3-5 Prescriber orchestration factory)
- Extracted a shared `executePrescriberRun()` helper in `packages/skillsmith-runtime/src/index.ts` so both `runForgePrescribe()` and `createPrescriberOrchestrationConfig().runForSkill()` reuse the same provider → Forge prescriber → dedup/persist pipeline. The CLI keeps its Wave 2 result contract and global fallback behavior, while the Curator-facing factory stays a thin adapter.
- Factory profile loading is **per-skill only** and `runForSkill()` calls the exact same `loadProfile` closure it exposes. Missing profile or `sessionCount < minSessions` returns a zero-count `PrescriberRunResult` as the skip semantic; W3-6 does not need an extra skip flag.
- `CreatePrescriberOrchestrationConfigOpts` now accepts either an owned SQLite handle (`db`) or `dbPath`; local row loading avoids Cairn singleton coupling when the caller already has a DB connection.

## Learnings (2026-05-23 — W3-4 curate() signature extension)
- `curate()` had to become `async` because `PrescriberOrchestrationConfig.runForSkill()` is async. That propagated to every live sync consumer: `packages/cairn/src/hooks/sessionStart.ts`, `packages/cairn/src/mcp/server.ts`, Cairn curate tests, and Forge's `wave2-pipeline` integration test now all `await` the Curator result.
- The smallest viable trigger signal is a distinct `computedSkillIds` array on `ChangeVectorSweepResult`, populated only when a new change vector row is inserted this sweep. That keeps W3-4 trigger-driven without re-querying history or inventing a second notion of eligibility.
- `minSessions` should come from the existing `ChangeVectorConfig.minSessionsObserved` fallback chain (`DEFAULT_MIN_SESSIONS`), and Curator should pass that same value into `runForSkill(skillId, minSessions)` so vector gating and prescriber gating stay aligned. Curator itself should not pre-filter via `loadProfile()`; skip semantics stay inside the orchestrator closure.
- The qualifying-skill list should be sorted before orchestration/tests consume it. SQLite's natural row order is not a contract, so sorting `computedSkillIds` prevents flaky call-order assertions and keeps operator output stable.
- Fail-open needs to be visible in two places: `console.warn` for operators and an inline `PrescriberRunResult` error row (`hintsGenerated/Inserted/Duplicated = 0`, `hintsError = 1`) so W3-5/W3-6 can surface partial-success counts without special-case plumbing.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**W3-3, W3-4, W3-5 shipped:**
- W3-3: `PrescriberOrchestrationConfig` + `PrescriberRunResult` types canonized in `@akubly/types`
- W3-4: `curate()` async, trigger-driven orchestration loop, fail-open semantics, 4 new + 32 updated tests
- W3-5: Shared `executePrescriberRun()` helper extracted; `createPrescriberOrchestrationConfig()` factory wired; Cairn `getExecutionProfileWithDb()` convenience added

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Skillsmith-Runtime: 6/6 passing

Wave 3 delivers fully-realized Curator-driven orchestration. Type contracts locked in `@akubly/types`. Per-skill execution pipeline centralized. Factory ready for W3-6 hook wiring.

## Learnings

## R6 Ceremony — Source-Reading Rule Lifted (2026-05-24)

**Milestone:** R6 opened — Eureka source-reading unlocked; trio (Genesta/Crispin/Edgar) reconciled v3 PRD against Cairn/Forge substrate.

**Key outcomes:**
- Genesta (B+ verdict): PRD v3 stands with v3.1 patch (4 targeted fixes)
- Crispin (Path A recommended): clean-slate Eureka over Cairn extension
- Edgar (Kernel extraction): ~70% mechanical infra exists; recommend shared learning-kernel package

**Your involvement:** Advisory roles on boundaries/UX (2-3 hrs/week contribution rate).

**Decision gates pending Aaron's direction:**
1. Vector search scope (in/out for v1)?
2. Architectural path (A clean-slate or B extension)?
3. Learning-kernel extraction (now or defer)?
4. v3 patch or v4 rewrite?

**Next:** Cassima on deck for v3.1 or v4 intake pending Aaron's architectural direction.
### Wave 3 Shipped (2026-05-23 ~21:08Z)

PR #21 merged as f27a537 on main. 1219 tests passing. 7 work items delivered end-to-end: composition root R2 (`@akubly/skillsmith-runtime`), Curator hook wiring, per-skill orchestration, E2E tests, Phase 5-ready acyclic boundaries. 14 Copilot findings addressed across 4 review cycles. 1 deferral approved: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE) → Wave 4.

## Learnings

**Commits:** fc897a0, 8f16ad1, 04f02b0

**Build:** forge package clean (`tsc --project packages/forge/tsconfig.json` exit 0). Full monorepo build has a pre-existing error in cairn's `curator.ts:631` (Rosella's work-in-progress, not touched here).

- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
---

- JSDoc on type fields with runtime invariants should name the code location enforcing invariant, not just intent.
- Lockout rule is real safety: cross-review catches blind spots single review misses.
- Migration framework handles idempotency; DDL template is single exec() per migration.
- Shared type contracts less expressive than storage = contract bug, not feature gap. Additive optional params have near-zero risk.

**Lessons:**

**Test status:** 1034+ passing (cairn 478 + forge 556+, up from baseline 990).

---

## 2026-05-27: London-School TDD Strategy Authored + OQ-1 Monorepo Resolution

**Event:** London-school TDD spine delivered and reviewed  
**Impact:** Shared substrate topology finalized; data boundaries stable for Brain integration  

**For Alexander's context:**
- **OQ-1 RESOLVED:** Aaron chose Option A (monorepo). `mem/` and `harness/` merging into `@akubly/` with shared `packages/{cairn,forge,types}`. SessionId brand is now a single source of truth in `@akubly/types`. Integration Engineer role (your proposed Eureka Phase 1 on-call, data-oriented boundaries specialist) can build adapters against a fixed substrate.
- **TDD Spine Live:** `docs/eureka/sections/55-tdd-strategy.md` authored and approved. London-school outside-in approach defines mock contract style for CuratorStore, ClockProvider, and session-scoped query boundaries. Your data-oriented strength is needed for adapter design (Brain ↔ Eureka ↔ Cairn + Forge).
- **MCP Tools + Adapters Ready:** Integration Engineer role aligns perfectly with Brain's data-boundary expertise. Monorepo enables cleaner cross-package imports (no longer npm-publish-to-sync); your adapter code can work with shared `@akubly/types` directly.

**Next:** Integration strategy can proceed with stable type contracts. Brain adapters can rely on SessionId brand and Eureka's emerging session-scoped signatures.
---

**Older learnings archived to history-archive.md**
### 2026-05-27 — PR #24 Cloud Review Round 2 (8662579)

- Query planning: SQLite handles JOIN + index-based filtering efficiently for change_vectors
- Transactional CRUD: explicit db parameter better than internal getDb() for Curator contexts
- Sign convention: deltas stored as `after - before`; negate lower-is-better for net_impact
- Circular dependency prevention: duplicate weights + regression test (not imports)
**Architecture decisions:**

4. **Advisory Fixes:** safeMin guard for log-denominator (Math.max(1, minVectors)), JSDoc enhancements, DRY extraction for identical sort blocks.

3. **Lockout-Compliant Fixes:** Fixed Rosella's confidence → confidenceBoost rename in prescribers, ensuring semantic clarity (level vs boost).

   - Weight constants mirrored in Cairn (can't import Forge); regression test guards divergence
   - Curator sweep integration (post-event-loop, anti-join on hints without vectors)
   - changeVectors CRUD module (with explicit db param for transactions)
   - Migration 012 + schema v12 registration
2. **Change Vector Foundation (Phase 4.6 Wave 1):** 

1. **FeedbackSource.getProfile enhancement:** Added optional `granularityKey` parameter to address per-user/per-model profiles. DB key is `(skill_id, granularity, granularity_key)` but contract was less expressive. Fixed with backward-compatible optional param.

**Key deliverables:**

**Scope:** Finding 8 fixes, Phase 4.6 foundation (Wave 1 A1-A4), lockout-compliant fixes (Wave 3), advisory fixes (Cycle 3).

### Phase 4.5-4.6 SDK + Change Vectors Work (2026-05-01 to 2026-05-04)

## Archive (Summarized)
**R2-T1: Constant deduplication** — ATTENUATION_FLOOR had a local duplicate in runtime-cli/src/metrics/loadMetrics.ts. Canonical source is @akubly/types/src/index.ts:246. Import from there; added @akubly/types to runtime-cli deps.

**R2-T2: Clock skew resilience** — daysBetween() can return negative when updatedAt is greater than now. Clamp to >= 0 at caller (line 150 in loadMetrics.ts): Math.max(0, daysBetween(...)). Mirrors sessionsSinceUpdate pattern. No test added (review accepted existing pattern).

**R2-T3: Circular import resolution** — mcp/handler.ts imported runForgePrescribe and loadExecutionProfile from ../index.js, while index.ts re-exported forgePrescribeHandler from handler. **Solution:** extracted core runtime logic to new runtime.ts module. Both handler.ts and index.ts now import from runtime.ts. index.ts maintains public API via re-exports. Pattern: when barrel (index.ts) and module create cycle, extract shared logic to third module.

**R2-T4: MCP tool annotations** — forge_prescribe mutates state (inserts hints). Added annotations: { readOnlyHint: false } per Cairn MCP convention (see cairn/src/mcp/server.ts:323 for write tools, vs :112 for read tools). This is part of the MCP tool contract — signals mutation to clients/runtime.

**Learnings:**
- Shared constants belong in @akubly/types, not duplicated per package
- Clamp time-delta computations to handle clock skew (NTP drift, VM suspend/resume)
- Circular imports between barrel and impl → extract to third module
- MCP readOnlyHint is a semantic contract, not optional metadata

---

**Recent decision:** Alexander proposes Integration Engineer on-call role for Brain adapters + MCP tools; recommends new repo with Postgres backend + deployment boundary. Core strength is data-oriented boundaries; Brain needs agentic cognition specialists.

- Brain roster: Proposed Integration Engineer (core) on-call role with Cairn-primary commitment
- Brain system: Evolved from "monorepo packages/brain/" → "NEW REPO" → "Integration Engineer Phase 1 on-call, data boundaries specialist"
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- SDK runtime: Forge execution model, decision gates, DBOM provenance
**Key themes:**

| 2026-05-22 | Brain Project Roster Proposal (Integration Engineer Core Role) | 🟡 Proposal pending Aaron |
| 2026-05-05–2026-05-22 | Brain System Consulting & Architecture Analysis (Round 1–2) | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
|------|-------|--------|
| Date | Event | Status |

**Total entries:** 5 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting + Round 2 roster proposal

## Summary

# Alexander — History (Summarized)


---

## Cross-Team Context: Eureka v1 Design Package Locked (2026-05-28)

**Status:** Eureka v1 design package completed 3-cycle persona review and is now **M1 implementation-ready**.

**What changed:** 19 cycle-1 findings (3 blocking, 11 important, 5 minor) all accepted and landed in cycle 2 fix wave. Cycle 3 cleanup addressed 4 advisories. Design contradictions resolved:
- B1: Scoring formula canonicalized to additive (0.50 relevance + 0.20 importance + 0.20 trust + 0.10 recency)
- B2: Trust/retire semantics: field-level immutability + explicit retirement flag + zombie-fact preservation
- B3: Decision ownership: Forge writes audit (immutable), Eureka writes learning fact (mutable), shared decision_id

**Key fact-correction:** ACT-R exponent corrected 0.7 → 0.5 (caught by Compliance reviewer during cycle 2).

**Deliverables:** PRD v5, TDD Strategy (§55), Technical Design (§00–§50). All documents locked for M1.

**M1 Go/No-Go:** Design ready. Eval set grounded in mem/ repo (M0 deliverable). M1–M5 milestones validated by Pragmatist reviewer.

**For you:** If your work depends on Eureka design decisions, those are now stable. Cross-refs and canonical values are in .squad/decisions.md (Cycle 1 + Cycle 3 sections).

**Commits:** f68873d (cycle 2 fix wave) + 37370f9 (cycle 3 cleanup).
