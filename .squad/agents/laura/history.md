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

---

📌 Team update (2026-06-02T06:00:00Z): **M7-B + M7-C + M7-D (PR #41) COMPLETE — Eureka M7 Shipped** — Edgar + Crispin delivered 5-cycle marathon. 22 unique Copilot findings (44 threads). Final: 74 tests green, tsc-clean, lint-clean, merged to main as ed6be2c. M7 COMPLETE: error narrowing (B) ✅ + atomicity contract (C) ✅ + session-scoped regression tests (D) ✅. New skill: `.squad/skills/refactor-grep-cleanup/SKILL.md` (grep repo for old interface names post-refactor, not across N cycles). — Scribe


---

## Archive Summary

Earlier entries (1410 lines) archived to history-archive.md on 2026-06-05.

---

