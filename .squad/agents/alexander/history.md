# Alexander — History

## Summary

**Total entries:** 4 major consultations spanning Phase 4.5 SDK + Phase 4.6 change vectors + Q&A + Round 2 brain system consulting

| Date | Event | Status |
|------|-------|--------|
| 2026-05-05 | Initial Brain Sizing (Q&A) | ✅ Completed |
| 2026-05-06 | Phase 4.6 Spec Clarifications | ✅ Completed |
| 2026-05-01 | Change Vector Questions (F1-F2 analysis) | ✅ Completed |
| 2026-05-22 | Brain System Consulting (Round 2, Refined) | 🟡 Deliberation |

**Key themes:**
- SDK runtime: Forge execution model, decision gates, DBOM provenance
- Change vectors: Before/after metric snapshots, min sessions observed, net impact weighting
- Brain system: Flipped from "monorepo packages/brain/" to "NEW REPO" (Q3 backend service argument)

**Recent decision:** Alexander recommends new repo stunning-adventure-brain because org-tier federation wants Postgres + backend service = separate deployment boundary.

---
# Alexander — History

## 2026-05-01: Finding 8 — FeedbackSource.getProfile granularityKey

**Problem:** `FeedbackSource.getProfile(skillId, granularity?)` couldn't address per-user / per-model profiles. The DB key on `execution_profiles` is `(skill_id, granularity, granularity_key)`, so the contract was strictly less expressive than the storage.

**Fix:** Added optional `granularityKey?: string` third parameter to `FeedbackSource.getProfile` in `packages/types/src/index.ts`. Expanded JSDoc to document the composite key, the per-tier semantics (user id for per-user, model id for per-model, defaults to 'global' otherwise), and that the key is required to address non-global profiles.

**Companion functions reviewed, left alone (with rationale in JSDoc):**
- `getPendingHints`: `optimization_hints` table is keyed only on `id` with `skill_id` index — no granularity column. Adding granularity to the contract would have been speculative.
- `getStrategyParameters`: no DB backing exists yet; type is open-shaped. Granularity dimensions aren't modeled in the contract.

**CRUD module check:** `packages/cairn/src/db/executionProfiles.ts` `getExecutionProfile(skillId, granularity, granularityKey='global')` already satisfies the new interface — no change needed.

**Verification:** `npm run build` clean; `npm test` 512/512 passing across all packages. No call sites needed to change (the parameter is optional and additive).

**Lesson:** When a shared contract is strictly less expressive than its storage, treat it as a contract bug, not a feature gap — additive optional parameters carry near-zero risk and unblock real use cases.


## 2026-05-03: Phase 4.6 Wave 1 — Change Vector Foundation

**Work items completed:** A1 (migration 012), A2 (schema v12), A3 (changeVectors CRUD), A4 (Curator sweep).

**Migration patterns learned:**
- The 011 pattern is the definitive template: a single `migration.up(db)` that runs one `db.exec()` with all DDL inside. No conditionals, no idempotency logic (the migration framework handles that via `schema_version` table). Keep the `version` and `description` consistent with the file name.
- Tests hardcode `MAX(version)` and `COUNT(*)` against `schema_version` — every migration bump breaks them and requires updating. Pattern: grep for `toBe(11)` after bumping to 12.

**CRUD module patterns:**
- `optimizationHints.ts` uses internal `getDb()` calls. For changeVectors, the spec required explicit `db` parameter for Curator transactional control. Both patterns are valid; explicit `db` is cleaner for modules called inside transactions.
- The `JOIN optimization_hints` pattern in `getChangeVectorsByCategoryAndSkill` works cleanly because SQLite's query planner handles it efficiently with the `idx_change_vectors_hint` index.

## 2026-05-03: Phase 4.6 Wave 3 — Lockout-Compliant Fixes

**Role:** Executor (Wave 1 foundation), then lockout-constrained fixer (Wave 3)

**Wave 1 completion:**
- A1–A4 completed: migration 012, schema v12 registration, changeVectors CRUD module, Curator sweep integration
- Decision on weight constants: duplicate in Cairn with regression test guard (Laura L5) because cairn↔forge import would create circular dep
- First commit: 8a53253 (all foundation work)

**Wave 3 (lockout):**
- Defect triage assigned me to fix Rosella's code (lockout rule: not the original author)
- Changes: `prescribers/types.ts`, `promptOptimizer.ts`, `tokenOptimizer.ts` (renamed confidence → confidenceBoost, updated references)
- Second commit: d592838 — renamed Rosella's files, confident the refactor surfaces the semantic fix Laura identified

**Lesson:** Lockout rule is a real safety mechanism. When I fixed my own changeVectors.ts zero-initialization bug in wave 1, Rosella's follow-up caught it. Cross-review under lockout prevents blind spots that single review misses.

**Curator sweep integration:**
- The Curator's `curate()` function processes events in batches (cursor-based). The change-vector sweep is fundamentally different — it's a scan of `optimization_hints` for `applied` status, not event-driven. Adding it as a post-event-loop call (after `updateLastRunTimestamp`) is clean: it runs once per `curate()` invocation, not per batch. This keeps per-batch transaction overhead low.
- The "NOT IN (SELECT DISTINCT hint_id FROM change_vectors)" anti-join is the right idiom for "compute only once per hint". SQLite optimizes this well with the `idx_change_vectors_hint` index.
- Soft-fail on missing profile or malformed snapshot (continue, don't throw) is the correct Curator pattern. Vectors will be computed on the next sweep when conditions are met.

**Circular dependency management:**
- Cairn cannot import Forge. When ADR-P4.6-003 says "same weights as drift score", the implementation answer is: mirror + regression test (L5). Document the mapping explicitly so if DRIFT_WEIGHTS ever changes, the L5 test fails loudly before anyone notices meanNetImpact diverged.
- Decision recorded in `.squad/decisions/inbox/alexander-phase4.6-weight-constants.md`.

**Sign convention decision:**
- Deltas stored as `after - before` (raw arithmetic). `computeNetImpact` negates lower-is-better metrics so positive net_impact = beneficial prescription. This convention is critical for Wave 2's negative penalty logic to work correctly — negative meanNetImpact means the prescription hurt, which is the signal for the penalty multiplier.

**Build/test status at completion:**
- `npm run build` clean in cairn
- cairn: 478 passing, 44 todos (Laura's L1/L2/L4 stubs)
- forge: 556+ passing, 2 todos
- Phase 4.5 baseline was 990; current total ≈ 1034+ (healthy growth)

## 2026-05-04: Phase 4.6 Cycle 3 — Advisory Fixes (Lockout Round)

**Items completed:** 3 advisory fixes in forge prescribers.

**Item 1 — safeMin guard in computeConfidenceBoost:**
- `minVectors=0` made the log-denominator `Math.log(1) = 0`, yielding Infinity for vc>0. Added `const safeMin = Math.max(1, minVectors)` before the division; denominator now minimum `Math.log(2)`.
- Mirrors the identical guard Rosella is placing in cairn's `summarizeChangeVectors`. Pattern: whenever a formula divides by `Math.log(1 + n)`, the `n` must be clamped to ≥1 before use.

**Item 2 — confidenceBoost JSDoc:**
- Stale comment claimed `<1.0 attenuates`. Wave 1 clamp (`Math.max(1.0, …)`) makes this impossible. Updated JSDoc names both enforcement sites (forge + cairn), defers attenuation explicitly to Wave 2.
- Lesson: JSDoc on a type field that depends on a runtime invariant should name the code location that enforces the invariant — not just describe the conceptual intent.

**Item 3 — applyHistoricalVectorOrdering DRY extraction:**
- Identical 8-line two-tier sort block existed in promptOptimizer and tokenOptimizer. tokenOptimizer even had a "Same logic as promptOptimizer" comment — a textbook "extract this" signal.
- Extracted to `utils.ts` as a pure, exported function. Both prescribers now delegate with one call each, removing 12 lines of duplication.
- Pattern: when a comment in code says "same as [other place]", treat it as a TODO:extract, not just documentation.

**Build:** forge package clean (`tsc --project packages/forge/tsconfig.json` exit 0). Full monorepo build has a pre-existing error in cairn's `curator.ts:631` (Rosella's work-in-progress, not touched here).

**Commits:** fc897a0, 8f16ad1, 04f02b0

## Learnings

- Always grep test files for hardcoded schema version numbers after adding a migration. The pattern `toBe(11)` appears in at least 3 test files; it's predictable churn.
- The `edit` tool's `old_str` must include enough context to be unique, and must match the closing braces exactly. Missing a `});` from the old_str pattern silently truncates the file. Always verify with a view after edits to test files.
- The Curator is event-loop-centric by design. Non-event sweeps (like change vectors) slot naturally after the event loop, not inside it. This keeps the batch transaction model clean.
- **Lockout-routing pattern (2026-05-03):** When a reviewer rejects an artifact and the Reviewer Rejection Lockout applies, the *author* of the buggy code cannot fix it. A second agent is assigned instead. This creates a symmetric cross-assignment: Alexander fixes Rosella's files, Rosella fixes Alexander's file. The coordinator must sequence commits so both sides land before the full build is clean — partial commits with clear notes are correct mid-flight behavior, not a problem.
- **Cost of misnamed types:** `confidence` and `confidenceBoost` occupy different mathematical spaces (level ∈ [0,1] vs multiplier ∈ ℝ⁺). A type that *looks* like a level but *behaves* like a multiplier becomes a latent trap — the next developer writes `if (summary.confidence === 0)` and silently zeroes every hint. Field names must encode semantic space, not just intent. When a function is already named `computeConfidenceBoost()`, the field it produces should be `confidenceBoost` — one name, one concept.
- **Confidence clamp pattern (2026-05-03 cycle 2):** A formula that can return sub-1.0 for under-threshold input contradicts a "positive boost only" policy. The fix is always `Math.max(1.0, formula)`, not a caller-side clamp — the invariant belongs at the source. Document it in JSDoc so Wave 2 penalty work doesn't inadvertently remove the clamp when it should instead add a penalty pathway.
- **Two-tier sort over null-coalescing sort (2026-05-03 cycle 2):** When a sort key can be absent vs present with a negative value, coalescing absent to 0 creates a ranking inversion: unmatched (0) outranks measured-bad (e.g., -0.1). Fix: explicit partition into matched/unmatched, sort each tier independently, concatenate. At small N (≤10 prescriber hints), the clarity of the partition form outweighs the marginal overhead of two filter passes. Decision: `.squad/decisions/inbox/alexander-phase4.6-cycle2-two-tier-sort.md`.
- **Barrel re-export completeness (2026-05-03 cycle 2):** Every type that appears in a public function signature must be re-exported from the package root. If `analyzePromptOptimizations(..., historicalVectors?: ChangeVectorSummary[])` is in the barrel, then `ChangeVectorSummary` must be too — otherwise callers must reach into internal paths to type their arguments. Check function signatures against root barrel on every new type addition.
- **Internal helper re-export hygiene (2026-05-03 cycle 2):** A function exported from a prescribers barrel but not importable by the only cross-package consumer (cairn) creates a phantom API surface. The signal: if the only legitimate call sites are package-internal tests and the function is already imported directly from its source file, remove it from the barrel. The barrel is for the public contract; internal utilities belong only in their module.
- **Commit granularity note:** When a constant (DEFAULT_MIN_SESSIONS) is introduced and immediately consumed in the same logical change, bundling constant + consumer into the same commit (or across two tightly-coupled commits) is cleaner than a separate constant-only commit. The mapping commit #1 (utils.ts) → commit #2 (promptOptimizer.ts) captures this correctly.




**Finding Fixed:** F8 (granularityKey in FeedbackSource.getProfile).

**Key Output:**
- FeedbackSource.getProfile(profileId, granularityKey) enables signal-level profile filtering
- Integrates with Roger's per-signal ExecutionProfile.signals and Rosella's prescriber signal targeting

**Integration:** Feedback loop can now query specific signal data, enabling closed-loop tuning per drift driver.

## 2026-05-04: Phase 4.6 Review Cycle Completion

**Role:** Executor (Wave 1) + Lockout Fixer (Waves 2–3)

**Final Outcome:**
- 1153 tests passing (baseline 990 + 163 new)
- Branch review-clean, compliance approved, correctness 7/7 passed
- All three cycles complete: personas → triage → advisory fixes

**Cycle 1–3 Summary:**
- Cycle 1: 15 findings consolidated, 12 accepted, 1 rejected, 2 deferred
- Cycle 1 fixes: alexander-2 (5 forge items), rosella-2 (7 cairn items), laura-3/4 (test expansion)
- Cycle 2: 10 advisory findings (0B / 3I / 7M)
- Cycle 3: alexander-3 (3 forge), rosella-3 (4 cairn), laura-5 (20 tests)

**Pattern Applied:** Lockout-compliant cross-assignment enabled safe parallel fixing. Each agent fixed the other's code per review findings, preventing author bias.

**Lesson (Cycle 3 application):** Advisory findings from focused re-review often surface edge cases (null checks, guard conditions) that the original implementation missed because it was optimizing for the happy path. Cycle 3's safeMin guard for minVectors=0 is exactly this — Alexander's initial code worked for typical N≥1 but failed silently at the mathematical boundary. The fix is to document the invariant in JSDoc so Wave 2 work doesn't inadvertently remove the guard.

## 2026-05-05: Forge Coupling Analysis for Brain/Memory/Thinking/Learning System

**Context:** Aaron considering agentic brain system with possible Forge coupling. Question: in this repo or new repo?

**Analysis scope:**
- Reviewed all Forge subsystems: telemetry, decisions, DBOM, prescribers, bridge, hooks, session, runtime, applier
- Identified natural coupling points (telemetry→memory, decisions→memory, memory→learning→prescribers, hooks→thinking)
- Evaluated dependency direction in monorepo vs. separate repo scenarios
- Assessed standalone usability requirement

**Key findings:**
1. **Coupling is data-oriented, not runtime-oriented** — all integration points use data interfaces (TelemetrySink, HookObserver, ChangeVectorSummary), not control flow
2. **Dependency direction is clean** — Brain → Forge types, never Forge → Brain (no circular deps)
3. **Cairn already implements "mini-brain" logic** — changeVectors.ts and executionProfiles.ts are learning/memory modules that naturally belong in Brain package
4. **Adapter pattern enables standalone use** — Brain core can be Forge-agnostic, with adapters/ subpackage for Forge-specific integration
5. **Monorepo velocity advantage** — refactoring, shared types, integration testing all 10x easier in monorepo

**Position taken:** **Build Brain in this monorepo as packages/brain/**

**Rationale:**
- All coupling points are data interfaces (TelemetrySink, callbacks, optional params)
- Natural evolution: migrate Cairn's changeVectors/executionProfiles to Brain package
- Single test suite catches Brain+Forge+Cairn interactions
- No version skew (workspace deps resolve to local code)
- Publishing flexibility: adapter pattern + selective npm publish enables standalone use later
- Refactoring is trivial (move types between packages in single PR)

**Alternative rejected:** Separate repo would require publishing Forge to npm, introduce version skew risk, duplicate Cairn's learning logic, and complicate integration testing with no architectural benefit.

**Lesson:** When evaluating monorepo vs. separate repo for a new subsystem, the critical factor is **coupling type, not coupling degree**. Data-oriented coupling (interfaces, types, callbacks) favors monorepo even when coupling is extensive. Runtime-oriented coupling (circular imports, control flow dependencies) favors separation. Forge→Brain coupling is 100% data-oriented — every integration point is a pure function, interface, or callback. This is the ideal monorepo candidate.

**Decision artifact:** `.squad/decisions/inbox/alexander-forge-coupling-analysis.md` (24KB, comprehensive with file paths and concrete integration examples).

## 2026-05-22: Brain Refined Analysis — Scope Expansion Forces Position Reversal

**Context:** Aaron's brain dump expanded scope 10x with 5 dimensions (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION). Re-evaluated whether `packages/brain/` still holds.

**New dimensions analyzed:**
- **TIERS:** agent/subagent, organizational, project, user (cross-repo, cwd-aware)
- **KINDS:** Practical, Semantic, Syntactic, Linguistic, Symbolic, Philosophical
- **PROPERTIES:** recency (gradient), trustworthiness, plasticity
- **ACTIVITIES:** recall, integrate, meditate, explore, ideate, dream, decide, pray, re-evaluate
- **REPRESENTATION:** graph, cross-ref, markdown; persistence/versioning
- **ACQUISITION:** codebase exploration, periodic discovery, journaling

**Three critical questions answered:**

1. **Runtime coupling?** Brain's "activities" are a runtime/agentic loop (meditate, dream, decide, etc.), not just data storage. Brain is a Forge **sibling** (peer runtime), not a layer on Forge. They compose via orchestrator (Cairn or user code).

2. **User-tier distribution?** User-memory tier is cross-repo and cwd-aware. CAN work from monorepo via npm publish, BUT separate repo enforces "no accidental Forge deps" boundary and avoids coupling confusion.

3. **Multi-tier federation?** Org tier wants Postgres + backend service (Azure Functions). SQLite-locality model breaks for multi-writer federation. Brain will need its own deployment unit.

**Position: REVERSED from monorepo to NEW REPO `stunning-adventure-brain`**

**Why I flipped:**

Original analysis (2026-05-05) was correct for original scope (data layer for Forge prescriptions). But expanded scope is:
- General-purpose cognitive infrastructure (not Cairn-specific)
- Runtime activities (not just storage)
- Backend service for org tier (separate deployment unit)
- Cross-repo user tier (must work without Forge)
- 60+ modules estimated (TIERS × KINDS × PROPERTIES × ACTIVITIES)

**The 5-dimension expansion is a system boundary shift.** Brain is no longer a Forge submodule, it's a cognitive platform that Forge/Cairn can consume.

**Concrete recommendation:**
- New repo: `stunning-adventure-brain` with 3 packages: `brain` (core), `brain-forge-adapter` (integration), `brain-backend` (Azure Functions)
- This repo publishes `@akubly/forge` and `@akubly/types` to npm
- Cairn installs `@stunning/brain` + adapter as regular deps
- Migration path: Phase 1 (core + user tier), Phase 2 (Forge adapter), Phase 3 (org tier backend), Phase 4 (migrate Cairn's changeVectors.ts to Brain)

**Key insight from Q3:** If Brain's org tier needs its own Postgres + backend deployment, it's a separate *system*, not just a separate *module*. Deployment boundaries should match repository boundaries.

**Lesson:** When a scope expands from "subsystem module" to "platform with its own backend service," the monorepo calculus inverts. Original coupling analysis was sound (data-oriented coupling favors monorepo), but backend deployment requirement is the tipping point. A system that deploys independently should live in its own repo.

**Comparison with Graham's position:** Graham recommended new repo based on bounded context + standalone usability. I initially argued monorepo based on data coupling + refactoring velocity. The backend service requirement (Q3) is the evidence that resolves the disagreement — it's not just about coupling or velocity, it's about deployment topology.

**Decision artifact:** `.squad/decisions/inbox/alexander-brain-refined.md` (comprehensive 3-question analysis + module breakdown + migration path).


## Consultation: Brain/Memory System Repo Placement (Round 2)

**Date:** 2026-05-22  
**Session:** Refined recommendation following Aaron's brain dump clarification  
**Artifact:** .squad/orchestration-log/2026-05-22T20-25-51-alexander-*.md  
**Merged into:** .squad/decisions.md as "Open Question: Brain/Memory/Learning System"

### Summary

Participated in Round 2 consulting on repo placement for new agentic brain/memory/learning system. Analyzed Aaron's five-dimension expansion (TIERS, KINDS, PROPERTIES, ACTIVITIES, REPRESENTATION, ACQUISITION) and refined position from Round 1.

**Outcome:** Recommendation documented in .squad/orchestration-log/2026-05-22T20-25-51-alexander-brain-refined.md. All deliberation merged to decisions.md for Aaron's consideration.


