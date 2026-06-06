## Current & Recent
# Edgar — History

**Role:** Learning Systems Specialist (Plasticity, trust, recency, recall algorithms)
**Status:** M7-C complete. PR #41 merged (5 Copilot cycles). M8 storage kickoff in progress.
**Last update:** 2026-06-02

**Key milestones:**
- R5-R6: Power-law recency + event-driven trust design
- R7-R8: v5-final locked canonical (extraction-ready mechanisms verified)
- M2-M3: recall() + composite-ranker landed (§30 §1.2 FR-2 formula inline)
- M7-A: Typed error hierarchy shipped (FactNotFoundError, InvalidTrustValueError, etc.)
- M7-C: Atomicity contract + session-scoping + PR #41 cloud review complete (5 cycles, 74 tests green)

## Archived learnings (summarized from 29780 bytes)

**Interface contracts & reference implementations must be consistent.** Weak contracts ("throw OR store NaN") create false confidence. Reference impls are the first consumers of the contract; if they don't enforce the contract, the suite is lying.

**When two seams share a data model, their contracts must share key invariants.** FactReader (session-scoped) + TrustUpdater (initially factId-only keying) was a semantic contradiction. Cycle 3 fix: re-key TrustUpdater by `(sessionId, factId)` for correctness.

**Major refactors require comprehensive artifact audits.** M7-C renamed `update → mutate`, removed parameters, re-keyed storage. Grep the entire repo for old names BEFORE shipping, not after Copilot drips findings per cycle. One pre-merge pass clears what would otherwise take 5 review cycles.

**Hard-coded repo-wide test totals in source code are drift bombs.** After refactoring a count statement, remove it entirely rather than leaving it to go stale in inline comments.

**Contract tests must lock requirements, not implementation strategies.** C-6 initially required "no global lock" but TrustUpdater only needs per-key atomicity, not per-key parallelism. Valid impls (e.g., single-connection SQLite) serialize all mutations and still satisfy the contract. Rescoped to: atomicity required, parallelism permitted.

**Unbounded Maps in reference impls are real bugs.** The `locks` Map grew without bound. Identity-check cleanup (`if (locks.get(key) === yourToken) locks.delete(key)`) is the safe pattern for shared Maps.

**Lint discipline on Windows differs from Unix.** `npm run lint` with glob expansion in package.json failed on Windows. Use `npx eslint packages/eureka/src/` directly. Always run lint locally before push.

**M7-C Atomicity Pattern Locked:** mutate callback (fn: (currentTrust) → newTrust) over caller-serialization + CAS token. Keeps activity pure; correctness is a storage-layer property.

---

**See history-archive.md for entries from M5, M6, design ceremony, R-series design rounds.**

**Scribe note (2026-06-02T06:14:32Z):** M8 storage milestone kicked off (Aaron, 2026-06-01). Slices A→D planned. Aaron locked Q1=scaffold-A-write-B, Q2=cursor pagination, Q3=own eureka.db. Roger (Slice A impl SPAWNED) and Laura (contract audit SPAWNED) on branch eureka/m8-slice-a-sqlite-factreader.


- **Seam separation — write vs. read:** `applyFeedback` owns delta computation and delegates the write to `TrustUpdater`. It intentionally does NOT read from storage — keeping the function pure with respect to reads. Mixing read + write into a single function blurs responsibility. The `applyFeedbackById` orchestrator is the correct place to own the read, using a distinct `FactReader` seam.

- **Regression-lock tests after implementation are a mild §55 deviation:** M6-A1–A4 (user_correction regression locks) arrived after the implementation was already correct. These are still valuable — they lock the contract for future regressions. The deviation is mild (implementation matches spec), documented in the test file, and acceptable. The true RED test was M6-A5 (missing correctionDelta guard).

**2026-05-30 — M6 GREEN (applyFeedbackById + FactReader read-seam)**

- **Read-seam null-guard is a trust-boundary concern:** When `FactReader.read()` returns `null`, throwing immediately prevents `TrustUpdater.update()` from being called for a non-existent fact. This is not just defensive coding — it's a correctness requirement. A silent return would let the caller believe feedback was recorded when it wasn't.

- **Function decomposition over parameter growth:** Adding `currentTrust` to `applyFeedbackById`'s options signature was rejected. The higher-level function should own the read; callers shouldn't need to know current trust. `applyFeedback` (takes currentTrust) and `applyFeedbackById` (takes factId, reads internally) form a clean two-level API with explicit layering.

- **§30 §2.3 spec gap filled:** The docs section jumped §2.2 → §2.4. Writing §2.3 "Trust Dynamics Beyond the Static Floor" as part of M6 delivery closes the gap that Laura originally flagged in the RED decision drop. Spec gaps should be closed in the same milestone that implements the behavior — not deferred.

## Learnings

- **F7 reversal (2026-05-31, PR #38 Cycle 4):** The Cycle 1 F7 finding that switched discriminator declarations from `readonly code = 'X' as const` to the explicit-annotation form `readonly code: 'X' = 'X'` was reversed. Root cause: the repo's ESLint config enforces `@typescript-eslint/prefer-as-const` as an error — the explicit-annotation form violates it, breaking CI on both Node 20 and Node 22. The `as const` form was correct all along. Lesson: **the repo's enforced lint config is authoritative over Craft-persona stylistic opinions**. Local Windows lint failed to catch this because the root `npm run lint` glob doesn't match workspace files on Windows — use `npm run lint --workspace=@akubly/eureka` for the gate the CI actually runs.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe

📌 **Crucible Sprint 0 — DB Collaborator Seam ESTABLISHED** (2026-06-02T06:43:01Z): Roger's REFACTOR cycle introduces explicit DB interface (getSession, insertSession, queryEvents) + in-memory adapter (createInMemoryDB). Seam ready for L1-substrate swap (real SQLite integration stub via Refactor 3, then OQ-2 Cairn event_log integration pre-sprint-2). Edgar/Genesta/Crispin: Coordinate on L1 substrate decisions + schema overlap when OQ-2 lands. — Scribe
- **M7-C (2026-05-31): Variant B removes `currentTrust` from caller API entirely.** The key insight behind Variant B over Variant A: when atomicity is a storage guarantee, the caller *cannot* provide `currentTrust` — the storage impl reads it inside `mutate()`. Forcing callers to supply `currentTrust` would create a false interface that ignores the supplied value. Variant B is the only shape consistent with the contract.

- **Pre-flight vs. fn-time validation — two distinct seams:** Pre-flight validation (event type, correctionDelta presence/finiteness) fires BEFORE `mutate()` is called. Storage-trust validation fires INSIDE `fn` when storage calls `fn(currentTrust)`. This creates two observable test patterns: (1) pre-flight errors → mutate never called; (2) fn-time errors → mutate WAS called, fn threw, write aborted. Tests must differentiate these.

- **`FactReaderContractError` dead on the write path after M7-C.** The class survives in errors.ts for Crispin's READ seam (recall, display paths). Tests that used to drive it via `applyFeedbackById({ factReader: makeFactReader(undefined) })` must become direct constructor integrity tests. Document this transition explicitly in test comments so future readers understand the historical context.

- **`runTrustUpdaterContract` shared helper is immediately reusable by Crispin.** The helper accepts `makeImpl: () => { impl, setTrust, getTrust }` so any impl — in-memory, SQLite, Postgres — can be exercised against the same 7 contracts. The per-(sessionId,factId) promise chain in `InMemoryTrustUpdater` is the minimal reference impl for serialization semantics.

- **ESM `require()` fails; use static imports.** In an ESM-only package (no CJS build), `require('../errors.js')` inside a test function throws at runtime. All imports must be top-level `import` statements. This bit me in the M6-B3 class-integrity test migration.

- **Test count on `eureka/m7-c-atomicity` vs. prior branches:** 68 tests (not 73) because `fact-reader.contract.test.ts` (5 tests, Crispin's READ seam) lives only on the commits that include Scribe's interim artifacts. The 68 are the right count for Edgar's M7-C branch.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe

---

**2026-06-02 — M7-C PR #41 COMPLETE — Eureka M7 (B+C+D) Shipped on Main (ed6be2c)**

5-cycle Copilot review marathon complete. 22 unique findings (44 threads), all resolved. 74 final tests, tsc-clean, lint-clean, CI 3/3 passing.

**Cycle 5 (7ce81da) — Comprehensive Grep-Cleanup Pass (Aaron authorized diminishing-returns sweep):**

- **Lesson: Grep the entire repo for old interface names post-refactor, not across 5 cycles.** M7-C renamed `TrustUpdater.update → mutate`, removed `currentTrust`, removed `factReader`, re-keyed by `(sessionId, factId)`. Each change had residual references that Copilot surfaced one-at-a-time over cycles 1-5. A pre-merge grep sweep (9 terms, one pass) would have cleared all in one commit. New skill created: `.squad/skills/refactor-grep-cleanup/SKILL.md`.
- **Hard-coded repo-wide test totals are drift bombs.** Removed "Post-M7-C: 67 tests" from inline comments. Per-suite counts are stable; repo-wide numbers in comments are always stale after one refactor.
- **Aaron's diminishing-returns call:** Cycle 5 had 6 stale-doc nits; rather than iterate cycle 6+, authorized one comprehensive grep pass + merge. Proved effective.

**Cycle 4 (75c9f25) — Real CI Lint Failure + Doc Consistency:**

- **Windows npm run lint gotcha confirmed.** Root glob `eslint packages/*/src/` matches no files on Windows (PowerShell glob expansion differs from bash). Always use `npx eslint packages/eureka/src/` for local gate matching CI.
- **Seam changes cascade into every doc.** Key changed from `factId` to `(sessionId, factId)` in cycle 3; left 4 stale refs: @concurrency JSDoc, SKILL parallelism claim, SKILL test count, decisions.md atomicity note. All require updates.
- **SKILL.md is normative — must not overclaim the contract.** SKILL said "different keys MUST be parallel (no global lock)." That contradicts cycle-2 Option B (parallelism permitted, not required). Future agents read SKILL literally; if it says MUST, they write tests that reject valid impls. Fixed to MAY.

**Cycle 3 (1413826) — Session-Scoping Missing + Locks Cleanup:**

- **Read/write contract symmetry required.** FactReader already session-scoped; TrustUpdater used only factId. Data-model contradiction. Re-keyed by `${sessionId}\0${factId}` (null-byte separator prevents collisions). Added C-7 cross-session isolation test.
- **Atomicity and session-scoping are orthogonal.** Atomicity = read-fn-write indivisible for same key. Session-scoping = key must include sessionId. Both required; only one is atomic.
- **Identity-check cleanup in promise chains.** `if (locks.get(key) === next) locks.delete(key)` is the safe pattern for final cleanup: if no successor has replaced you, you clean up.

**Cycle 2 (5fb53b4) — Stale Comments + Atomicity vs. Parallelism:**

- **Contract tests must not rule out valid implementations.** C-6 claimed "no global lock" but only asserted correctness. A globally-serialized impl satisfies the contract. Option B (rescope to result-independence, not parallelism) was correct.
- **Atomicity ≠ parallelism.** These are distinct contract properties. Conflating them in test names misleads readers about the contract requirements.

**Cycle 1 (f128f78) — Contract Suite Gaps + Dangling Reference:**

- **"Throw OR store NaN" is not a contract, it's helplessness.** C-3 accepted both behaviors. A contract test must assert REQUIRED behavior. Fixed: MUST throw InvalidTrustValueError(source:'storage') AND storage unchanged.
- **Reference impl must implement the contract it documents.** InMemoryTrustUpdater was writing NaN despite JSDoc saying MUST reject. Impl is the first consumer; if it doesn't enforce, the suite lies.
- **getTrust from a fresh makeImpl() is always empty.** C-5 error: called makeImpl() again at end. Always destructure all helpers from the SAME instance.
- **Gitignored files can slip through cross-branch merges.** Crispin's inbox files became committed. Guard: `git status` review, not just trusting gitignore.

**Outcome:** Eureka M7 (B+C+D) complete. Shipped to main as ed6be2c (squash). All learnings documented in `.squad/decisions.md` PR #41 section. New skill: `.squad/skills/refactor-grep-cleanup/SKILL.md`. Branches cleaned. Ready for next sprint.

- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)
