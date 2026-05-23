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

## Learnings

- Forge prescribers now consume the canonical `ChangeVectorSummary` from `@akubly/types` via a type re-export in `packages/forge/src/prescribers/types.ts`; existing imports in `promptOptimizer` and `tokenOptimizer` required no call-site changes because the shape remained identical.
- Keeping Forge's local `OptimizationCategory` union in place is safe for W2-2 because Roger canonized the shared union to match Forge's stricter category set; the barrel contract stays structurally compatible in both directions.
- Added `packages/forge/src/prescribers/types.contract.test.ts` with two guards: barrel-vs-canonical type assignability and a prompt-prescriber regression using a canonical summary carrying `autoApplyEligible`. Validation passed with `npm run build` from repo root and `npm test --workspace=@akubly/forge` (599 passed, 3 todo).
- `runForgePrescribers()` now lives in `packages/forge/src/prescribers/forgePrescriberOrchestrator.ts`, queries an optional `ChangeVectorProvider`, and returns the combined prompt/token hint list without dedup or persistence.
- Forge attenuation semantics are now: mature vectors with `meanNetImpact <= -0.2` attenuate confidence to `max(0.1, 1 + meanNetImpact)` and force `autoApplyEligible = false`; sparse negatives or mature negatives above `-0.2` stay neutral at `confidenceBoost = 1.0`.
- `autoApplyEligible` is stored on matched hints both as a top-level field and in `hint.evidence.autoApplyEligible`; unmatched hints omit the field so Phase 4.5 callers still read absence as eligible.
- Added `packages/forge/src/prescribers/forgePrescriberOrchestrator.test.ts` with ten cases (nine maturity-gradient scenarios plus provider-failure fallback); validation passed with `npm test --workspace=@akubly/forge` (609 passed, 3 todo), root `npm test`, and root `npm run build`.
- Negative-impact auto-apply gating is now inclusive at `<= NEGATIVE_IMPACT_AUTO_APPLY_GATE` (`-0.2`), keeping exact-boundary cases on the manual-review side because the safety asymmetry favors false positives over false negatives.
- Wave 3 integration is **injection-based**: Curator accepts an optional orchestrator config (not a direct Forge import). This preserves the acyclic dependency boundary and allows composition root to wire both packages independently. The orchestrator is a simple function pointer (`runForSkill`), not a class — keeps it lightweight and testable.


