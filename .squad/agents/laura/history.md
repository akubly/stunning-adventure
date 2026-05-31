# Laura — History

**Role:** Tester (Contract-first patterns, integration testing, test architecture)
**Status:** M3 baseline preserved. Eureka M2 GREEN landed 2026-05-28. M7-A review-complete 2026-05-31. M7-B (narrowing tests) queued next.
**Last update:** 2026-05-31

**Key milestones:**
- Phase 2-4.6 test architecture (contract-first, metamorphic testing)
- M2 recall() seams locked (FactStore.search injection, SessionId brand)
- M3 composite-ranker baseline (FR-2 formula validation)
- Issue #17 async-sweep: 0 required fixes, 12 tests added
- Cycle 2 findings: 8 addressed in combo pass
- M5+M6 review wave: 8 new tests, 29→37 total

**See history-archive.md for detailed entries.**

## Current & Next

### 2026-05-31: M7-A Review Cycle — COMPLETE

**Summary:** M7-A (Typed Error Hierarchy, Edgar lead) completed 3-cycle review process (Cycles 1–2 panel + fix wave, Cycle 3 lightweight). All 40 tests green throughout. PR #38 review-complete, pending ship decision.

**Next up:** M7-B — exhaustive narrowing tests for typed error discriminators (`err.code === '...'` + `instanceof`). Will exercise M7-A's canonical narrowing policy with comprehensive error path testing.

---

## Learnings

### 2026-05-30: M5+M6 Cycle 3 — Polish: correctionDelta regression + comment cleanup

**P3 & P4 complete (2/2):** Updated stale M6-B import comment to reflect GREEN status. Added correctionDelta finite-guard regression tests (NaN, +Infinity) to lock cycle 2 carryover guard. Added optional FactReader undefined→TypeError test for Edgar's P2 (fails until his commit lands; both green at HEAD by EOW).

**All 40/40 tests pass.** Commit: `9d13389`.

### 2026-05-30: M5+M6 Cycle 2 — Purge unused clock deps from feedback tests

**Finding:** Cycle 2 review (Correctness C5 + Craft Cf8 + Compliance consensus) identified that `clock: fixedClock` was silently carried through all `applyFeedback`/`applyFeedbackById` call sites after Edgar removed `ClockProvider` from the feedback deps types in cycle 1. The `__tests__` dir is excluded from tsc, so excess property checking never fired.

**Changes made (recall-feedback.test.ts only):**
- Removed `clock: fixedClock` from 15 `applyFeedback(...)` call sites → deps shape is now `{ trustUpdater }`
- Removed `clock: fixedClock` from 4 `applyFeedbackById(...)` call sites → deps shape is now `{ factReader, trustUpdater }`
- Removed false "ClockProvider is REQUIRED in all activity deps" block comment; replaced with accurate scope note: clock is required for recall/recallWithScores, NOT for the feedback path
- Fixed inline signature sketch in the M6-B section: dropped `clock: ClockProvider` from the `applyFeedbackById` deps shape
- Removed `fixedClock` const and `FIXED_NOW_MS` — both fully unused after call-site cleanup (no ClockProvider import in this file either)

**Validation:** 37/37 tests pass. No Edgar inbox drop present (`.squad/decisions/inbox/edgar-m5m6-cycle2.md` does not exist); no new regression-lock test added.

**Pattern reinforced:** When an impl change removes a dep from a type, always grep the companion test file for the old field name — tsc exclusion of `__tests__` means excess-property checks won't catch stale injections.

### 2026-05-30: M5+M6 Review Wave — boundary, closeTo, regression locks

**8 tests added across 6 findings:**

**F8 — Idempotent boundary:** The overshoot clamp tests (0.95→1.0, 0.05→0.0) only covered "approaching" the boundary. Adding "already at boundary" tests (currentTrust=1.0 corroboration → 1.0; currentTrust=0.0 contradiction → 0.0) is a distinct regression lock — a future refactor could leave the clamp off and these exact cases would slip through the overshoot tests.

**F9 — closeTo precision choice:** Used `expect.closeTo(value, 5)` rather than the panel-suggested 10. Rule of thumb: pick precision where test failure = wrong business logic, not float jitter. For trust deltas (+0.10, -0.10, ±0.30), IEEE-754 jitter is at 1e-16 level; 1e-5 tolerance catches any real math error while leaving noise-immunity headroom. 10 digits is generous to the point of masking subtle precision bugs in hypothetical future implementations.

**F-NEW-EXHAUSTIVE:** Casting an invalid string `as FeedbackEvent` to test exhaustiveness guards is the correct pattern for "defensive guard for unsafe casts" — it exercises exactly the runtime scenario the guard is meant to protect against (TypeScript union bypass via untrusted source). Don't shy away from `as` casts in tests that explicitly target this path.

**F-NEW-PROPAGATION (applyFeedbackById missing-delta):** When testing error propagation through an orchestrator, use `rejects.toThrow()` (untyped) at the orchestrator boundary rather than asserting the exact error class. The orchestrator's contract is "surfaces the error"; the exact type is an implementation detail of the delegate (`applyFeedback`). If the delegate's error type changes, the orchestrator contract test should not need to change.

**Clock dep coordination pattern:** When a cross-agent change (Edgar removing `clock` dep) affects your tests, document the delta explicitly in the decision drop with the exact call sites to update. Don't pre-drop the dep if the implementation hasn't landed yet — it would break the TypeScript type check at the test boundary. Wait for the impl commit, then make the coordinated update.

### 2026-05-30: M6 RED — user_correction contract lock + read-seam (FactReader)

**Two RED beats landed:**

**M6-A** — `user_correction` event contract (5 tests in `describe('applyFeedback', ...)`):
- M6-A1–A4: 4 arithmetic tests (positive/negative delta, ceiling/floor clamp). All 4 passed GREEN on first run — Edgar's M5 GREEN had already implemented the `user_correction` branch correctly. These are regression locks, not proper RED. Mild §55 contract-after-implementation deviation documented in test comments.
- M6-A5: Missing `correctionDelta` when `event='user_correction'` → should throw. This IS the true RED beat. Edgar's impl uses `correctionDelta ?? 0` (silent fallback), so the test fails correctly: "promise resolved undefined instead of rejecting."

**M6-B** — `applyFeedbackById` read-seam (2 tests in new `describe('applyFeedbackById (read-seam)', ...)`):
- Chose a NEW `applyFeedbackById` function (higher-level orchestrator) over mutating `applyFeedback`. Preserves M5 contract stability; separation of concerns.
- `FactReader` interface driven: `read(args: { factId, sessionId }): Promise<{ trust: number } | null>`.
- M6-B1: happy path — FactReader supplies trust, delta applied, TrustUpdater called with correct value. RED: `applyFeedbackById is not a function`.
- M6-B2: FactReader returns null → must throw; TrustUpdater not called. RED: same.

**Final counts:** 29 tests total. 26 pass (18 M1–M4 + 8 M6-A pass/regression-lock). 3 fail RED: M6-A5 + M6-B1 + M6-B2.

**New pattern learned:** Contract-after-implementation regression-lock. When implementation arrives before contract tests, the correct response is: write the tests anyway (they lock the contract), document the §55 deviation in comments, and ensure at least one test in the beat is genuinely RED (drives undefined behavior). Mechanical passing tests still have value as regression guards.

**Read-seam shape decision:** New function (`applyFeedbackById`) over extending existing (`applyFeedback`) because: (a) `applyFeedback` has a stable M5 contract, (b) orchestration (read + compute + write) is a different responsibility from pure compute + write, (c) keeps `applyFeedback` unit-testable without storage deps.

**Next owner:** Edgar — M6 GREEN. See `.squad/decisions.md` for the merged decision trail.

### 2026-05-30: PR #34 Review — RED-beat skill, scope clock dep to recency activities

**Three Copilot threads resolved (all same theme — stale `clock` references in SKILL.md):**

- **Activity signature example (~line 56):** Removed `clock: ClockProvider` from the deps block; replaced with a comment scoping it to recency activities only (`recall()` / `recallWithScores()`, per §55 §1.2 / §30 §2.3).
- **Design decision bullet (~line 62):** Rewrote "clock is always in deps" bullet to state the actual rule: `clock` belongs in deps only when the activity reads time; feedback mutation omits it; required-but-unused deps are an anti-pattern that pollute tests with phantom injections.
- **Checklist item (~line 135):** Updated to conditional — "only if the activity calls recall APIs" — aligns with shipped `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` (no clock).

**Validation:** 40/40 tests green. No code or test files touched — documentation only. Commit: `4d4378b`.

**Pattern reinforced:** Skill documentation is a contract. When the shipped implementation deviates from a required-but-unused dep pattern, update the skill immediately so future RED beats aren't taught the wrong interface shape.

### 2026-05-30: M5 RED — Trust Feedback Mutation Contract
📌 Team update (2026-05-31T07:24:22Z): **M7-A (PR #38) shipped** — Typed error classes for applyFeedback/applyFeedbackById. 5 error classes with code discriminators. All 40 existing tests GREEN (no changes required, inheritance preserved). Next: M7-B (Laura — exhaustive narrowing tests) and M7-C (Crispin/Edgar — FactReader contract + atomicity). — Scribe
