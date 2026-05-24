📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:16:40Z): **Wave 0 complete** — canonical types in @akubly/types, getAllCategories helper in Cairn. category field reconciled to OptimizationCategory union. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Alexander — History

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

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

## 2026-05-01: Finding 8 — FeedbackSource.getProfile granularityKey

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

---

## Learnings (2026-05-23 — Harness Vision Runtime Analysis)
- Vision defines six chambers (Harness, Cairn, Forge, Geneticist, Curator, Narrator) but doesn't specify runtime execution model for the Harness chamber itself. Turn structure, tool invocation loop, model routing, and sub-agent spawning are orthogonal to chamber responsibilities — these are runtime execution concerns.
- Prior art (ReAct, OpenHands, LangGraph, AutoGen, Aider, Claude Computer Use SDK) converges on common patterns: (1) ReAct-style thought→action→observation loops with history-based reasoning, (2) explicit state persistence across turns, (3) structured turn management with message passing, (4) conditional sub-agent spawning based on state, (5) approval gates embedded in execution loop before risky actions, (6) model routing policies (rule-based or context-driven).
- Core unresolved execution tensions: (a) Single persistent loop vs. ephemeral sub-agent spawns, (b) Tool selection authority (LLM decides vs. orchestrator routes), (c) Primitive recording timing (pre-execution vs. post-execution vs. both), (d) Decision ledger write-ahead vs. write-behind semantics, (e) Sub-agent context inheritance (isolated vs. full parent state), (f) Approval gate blocking semantics (user prompt vs. queue-and-continue), (g) Model routing trigger conditions (per-turn vs. per-skill vs. capability-based).
- Key questions emerge around turn atomicity (what's the unit of replay?), state shape (what gets serialized between turns?), tool execution ownership (inline vs. delegated to sub-agents), and primitive recording hooks (orchestrator vs. model middleware).

---

**Older learnings archived to history-archive.md**