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

## Learnings

### 2026-06-06: SQLite-C1 constraint assertion tightened (review-cycle cycle 2 remediation)

**Task:** Two cycle-2 review findings in `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts`.

**Fix 1 — [IMPORTANT] Constraint-specific assertion for SQLite-C1:**
- Old: `.toThrow()` — too weak; passes on any throw including the session-exists guard.
- New: `.toThrow(/UNIQUE constraint failed|SQLITE_CONSTRAINT/i)` — proves the SQLite PK constraint fired.
- Confirmed schema uses `PRIMARY KEY (session_id, "offset")` in schema.ts. better-sqlite3 surfaces PK violations with message "UNIQUE constraint failed: events.session_id, events.offset".
- Test setup already correct: `insertRootSession` is called first, so the `pushEvent` session-exists guard (`if (!exists) throw`) passes on both calls. The only possible throw on the second push is the constraint — no pre-emption risk.
- A generic non-constraint throw (e.g. "session not found") would NOT match `/UNIQUE constraint failed|SQLITE_CONSTRAINT/i`, proving the matcher is discriminating.
- Added inline comment explaining why the session-guard does not pre-empt and what error shape better-sqlite3 surfaces.

**Fix 2 — [LOW] Dropped fragile commit-hash from beforeEach comment:**
- Removed "Roger's a57f95f" from the beforeEach comment. The file-header GREEN note already captures the milestone context.

**Verification:** crucible-core 6/6 green, crucible-cli 9/9 green (8 integration + 1 acceptance). tsc --build --force clean. No lint script in packages. Commit: `d4ca4ce`.

**Rule reinforced:** Integration test error assertions must be *constraint-specific* — a pattern that only the intended failure path can satisfy. `.toThrow()` without a matcher proves nothing about discriminating power.

### 2026-06-06: Refactor 3 RED → GREEN cleanup (review-cycle cycle 1 remediation)

**Task:** Two persona-review findings in `packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts`. Roger's `a57f95f` had already landed (createSQLiteDB exported, SCHEMA_V1_SQL single-sourced, pushEvent throws on unknown session). My job: integration test file only.

**Fix 1 — Stale RED prose:**
- Removed the `🔴 RED PHASE: These tests FAIL because…` block and its `Expected RED failure` section. These were accurate TDD scaffolding at authoring time but became false after Roger's GREEN commit.
- Replaced with a brief `// GREEN — Refactor 3 complete, 2026-06-06` note referencing the commit SHA.
- Also removed the `// 🔴 RED:` comment in `beforeEach`.
- **Rule reinforced:** RED-phase narrative is scaffolding, not documentation. It must be removed (not just commented out) when the phase ends, otherwise it misleads future readers about system state.

**Fix 2 — SQLite-specific assertion (SQLite-C1):**
- The existing tests only asserted API outcomes (ledgerSize, range counts, fork metadata) — all satisfiable by a map-backed fake.
- Added `[SQLite-C1]`: insert a session, push event at offset=0, then push again at offset=0. The events table has `PRIMARY KEY (session_id, "offset")` (confirmed in `schema.ts`). better-sqlite3 throws synchronously on the duplicate INSERT. A fake would silently overwrite.
- Chose option (a) (duplicate-offset rejection) over option (b) (second connection re-read) because: (1) `:memory:` databases are per-connection — option (b) would require a temp file and cleanup logic; (2) the PK constraint test is simpler, faster, and equally definitive.
- **Rule reinforced:** Integration tests must include at least one assertion that is *impossible* for the mock/fake to satisfy. Otherwise the integration layer adds no discriminating power over unit tests.

**Verification:** crucible-core 6/6 green, crucible-cli 9/9 green (8 integration + 1 acceptance). tsc --build --force clean. eslint clean. Commit: `324c287`.


