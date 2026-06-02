# Edgar — History

**Role:** Learning Systems Specialist (Plasticity, trust, recency, recall algorithms)
**Status:** M7-A complete. Typed error hierarchy shipped on `eureka/m7-a-typed-errors`. 40/40 tests green.
**Last update:** 2026-06-01

**Key milestones:**
- R5-R6: Power-law recency + event-driven trust design
- R7-R8: v5-final locked canonical (extraction-ready mechanisms verified)
- M2-M3: recall() + composite-ranker landed (§30 §1.2 FR-2 formula inline)
- Cycle 2 fixes: F6 minTrust interface, C5 Ranker JSDoc, C6 guard test
- M7-A GREEN: typed error hierarchy (FactNotFoundError, InvalidFeedbackOptionsError, InvalidTrustValueError, FactReaderContractError, UnhandledFeedbackEventError)

## Current & Recent

**2026-06-01 — M7-C PR #41 Copilot Review Cycle 5 (comprehensive stale-ref grep pass)**

- **When refactoring a public interface, grep the entire repo for the old name BEFORE shipping — not after Copilot drips findings out one per cycle.** M7-C renamed `TrustUpdater.update → mutate`, removed `currentTrust` from `ApplyFeedbackOptions`, removed `factReader` from `ApplyFeedbackByIdDeps`, and re-keyed storage by `(sessionId, factId)`. Every one of those changes had stale references that Copilot found one cycle at a time over 5 review rounds. A single pre-merge grep pass (search terms: old method name, old parameter names, old count references) would have cleared all of them in one shot.

- **Hard-coded repo-wide test totals in code-adjacent files are drift bombs.** `fact-reader.contract.test.ts` had "Baseline (pre-M7-C): 62 tests; Post-M7-C: 67." That count was stale after cycle 1 and silently wrong for cycles 2-5. Per-suite counts (e.g. "each call adds 5 tests") are stable and useful; repo-wide totals in inline comments are always one refactor away from lying. Remove them.

- **Historical entries in history.md and decisions.md are intentionally accurate for their time — don't retroactively rewrite them.** The distinction: fix forward-facing docs (interfaces, guard contracts, SKILL.md, JSDoc) because engineers read those to understand current behavior. Leave historical records describing what was done and why — those tell the story of how we got here.

**2026-06-01 — M7-C PR #41 Copilot Review Cycle 4 (lint fix + doc consistency)**

- **Lint before push, always.** `npm run lint` at the root uses `eslint packages/*/src/` which matches no files on Windows (glob expansion difference). Use `npx eslint packages/eureka/src/` directly. The unused-import error was real: removing `FactReader` from the write path in M7-C left `FactNotFoundError` and `FactReaderContractError` imported in `recall.ts` but never referenced in production code. CI caught it; local lint would have too if run correctly.

- **A seam change cascades into docs.** Tightening the key from `factId` to `(sessionId, factId)` in cycle 3 left four stale references: the `@concurrency` JSDoc in `recall.ts`, the SKILL.md parallel-requirement claim, the SKILL.md test count, and the `decisions.md` atomicity entry. Contract changes are not done until every document that references the contract is updated.

- **The SKILL must not overclaim the contract.** `contract-test-shared-helper/SKILL.md` said "different keys MUST be parallel (no global lock)." That was already wrong after cycle 2 (Option B deliberately dropped the parallelism mandate). The SKILL is normative guidance for future agents; if it says MUST, future agents will write tests that rule out valid impls. Fixed to: MAY be parallel; non-interference required, not concurrency.

**2026-06-01 — M7-C PR #41 Copilot Review Cycle 3 (session-scoping + locks cleanup)**

- **Read/write contract symmetry is non-optional.** FactReader (CL-3) was already session-scoped: reading factX for sessionA with sessionB returns null. TrustUpdater used only factId as the storage key. That is a data model contradiction: reads see (sessionId, factId) tuples; writes ignore sessionId. The fix — re-keying by `(sessionId, factId)` — is not an optimization; it's required for semantic correctness. **Lesson:** when two seams share a data model, their contracts must share the same key invariants. Reviewing FactReader's contract should have prompted "is TrustUpdater consistent on this?"

- **Session-scoping and atomicity are orthogonal but both required.** Atomicity says "read-fn-write is indivisible for the same key." Session-scoping says "the key must include sessionId." You can have atomicity without session-scoping (we did), and you can have session-scoping without atomicity. The contract suite must cover both dimensions.

- **Unbounded Map growth in a reference impl is a real bug, not a theoretical one.** The `locks` Map accumulated a finished-promise entry for every unique factId ever mutated. For long-running processes or test suites with many facts, this is a memory leak. The identity-check cleanup (`if (locks.get(key) === next) locks.delete(key)`) is the right pattern: it's safe because if a concurrent mutation has already replaced the entry, `locks.get(key)` will equal the newer promise, not this one, so we don't delete live state.

- **The identity-check guard is a general pattern for atomic cleanup in promise chains.** Whenever you own an entry in a shared Map keyed by a resource and you need to clean up after yourself, check `map.get(key) === yourToken` before deleting. If true, you were the last — clean up. If false, a successor has already replaced you — leave it.

**2026-06-01 — M7-C PR #41 Copilot Review Cycle 2 (stale comment + C-6 rescoping)**

- **Major refactors leave comment archaeology in test files.** Group 4 in `feedback-error-narrowing.test.ts` was written before M7-C and described `currentTrust` as a caller input and FactReader as the `source:'storage'` path. Both are gone. The fix is to audit ALL group headers after any seam-level refactor — not just the changed files, but the test files that describe the contracts those seams implement.

- **A contract test must not rule out valid implementations.** C-6 claimed "the impl must not use a single global lock." But the TrustUpdater contract requires per-factId atomicity, not per-factId parallelism. A single-connection SQLite impl that serializes ALL mutations still satisfies the contract. Writing a test that would fail a valid impl is a false contract. **Option B (rename/rescope) was correct:** C-6 now proves result independence, not parallelism. If we ever want to mandate parallelism, that needs to be an explicit contract decision, not an implicit claim in a test name.

- **The distinction: atomicity vs. parallelism.** Atomicity (no partial reads between read-fn-write for the same factId) is a requirement. Parallelism across factIds is an optimization a specific impl may provide. Contract tests must lock requirements, not implementation strategies.

**2026-06-01 — M7-C PR #41 Copilot Cloud Review Cycle (contract tightening)**

- **The contract test was weak — Copilot caught a real gap.** C-3 said "impl does not silently hide NaN — either it throws OR stores NaN." That's not a contract test, that's a helpless shrug. A contract test must assert the REQUIRED behavior, not the union of all behaviors. The fix: C-3 now requires `InvalidTrustValueError(source:'storage')` AND storage unchanged. The reference impl validates `!Number.isFinite(newTrust) || newTrust < 0 || newTrust > 1` before committing.

- **Reference impl must implement the contract it documents.** The InMemoryTrustUpdater in the contract test file was writing whatever `fn` returned — including NaN — despite the JSDoc on `TrustUpdater.mutate` saying storage MUST reject non-finite values. The impl is the first consumer of the contract; if it doesn't enforce the contract, the suite is lying about what it proves.

- **getTrust from a fresh instance is always undefined.** C-5 did `const { getTrust } = makeImpl();` at the end — a brand-new instance with an empty Map. The mutation results were invisible to it. Always destructure all side-channel helpers from the SAME `makeImpl()` call as `impl`.

- **A TODO in a contract test is a broken contract.** The C-5 TODO "We can't call getTrust on the same impl instance" was wrong AND left the serialization property unverified. Rule: a contract test that doesn't assert the contract property it's named for is worse than no test — it creates false confidence.

- **Gitignored inbox files can slip through on cross-branch merges.** Crispin's branch included `.squad/decisions/inbox/` files. When merged, they became committed files in the tree even though `.gitignore` excludes them from new staging. The guard is `git status` review before merge commits, not just trusting that gitignore prevents all accidents.

- **JSDoc must not reference gitignored paths.** `@concurrency` in recall.ts pointed at `edgar-m7-c-contract.md` (inbox path). Public-facing JSDoc must only cite paths that exist in the committed tree or use project-relative paths to versioned files (`.squad/decisions.md`).

**2026-05-31 — M7-A Cycle 1: Code Panel review fixes (11 ACCEPT, 2 REJECT)**

- **`err.code` is the canonical discriminator, not `instanceof`:** Declared explicitly in file header and decisions.md. `instanceof` works in a single realm but fails across ESM realms and after dual-pkg bundling. The `code` string literal is always realm-safe. This should be the stated policy in any typed error hierarchy — not just implied by the presence of a `code` field.

- **Symmetry is a design invariant for error classes:** `UnhandledFeedbackEventError` was missing its `readonly event: string` field while all other 4 classes stored their key payload as a readonly property. Asymmetry forces callers to parse `.message` strings — a fragile contract. Rule: every error class must carry all discriminating payload as typed readonly fields.

- **`readonly code: 'X' = 'X'` is idiomatic over `readonly code = 'X' as const`:** The explicit annotation form (`readonly code: 'FACT_NOT_FOUND' = 'FACT_NOT_FOUND'`) is the canonical TypeScript pattern. `as const` on a readonly literal initializer is redundant — TypeScript already narrows the type. Apply consistently.

- **`.name` override is an intentional, observable behavior change that needs documentation:** Setting `this.name = 'InvalidTrustValueError'` diverges from the native base-class name (`'RangeError'`). This is the right thing — readable stack traces, domain-labelled logs — but it's a breaking change for any downstream code keying on `err.name`. Document it explicitly in the file header; don't let it slip through as a silent side-effect.

- **`Object.setPrototypeOf` comment matters as much as the call:** The comment "required for extending built-in Error in ES5 targets" was misleading at ES2022 target. The correct justification is defensive: guards against downstream bundlers that re-transpile to ES5. A misleading comment is worse than no comment because it causes future engineers to remove the call for the wrong reason.

- **@throws ordering should match runtime check order:** JSDoc @throws listed `FactNotFoundError` before `FactReaderContractError` but the runtime checks `undefined` before `null`. Reorder to match reality — JSDoc is documentation of behavior, not narrative summary.

- **REJECT-defer with rationale is a valid and disciplined outcome:** F3 (EurekaError base class) was rejected not because it's a bad idea but because it's M7-B scope. M7-A's mandate was minimal: typed errors with zero test changes. A base class introduction requires designing a new hierarchy contract that M7-B narrowing tests will anchor. Scope discipline > completeness.

- **Branch:** `eureka/m7-a-typed-errors` | **PR:** #38 — cycle 1 fixes committed post-review.

**2026-05-31 — M7-A Cycle 2: @throws order regression from a claimed fix**

- **A fix can land backwards.** Cycle-1 F10 was documented as "swap @throws to match runtime check order." The commit landed with `FactReaderContractError` listed first — the *opposite* of runtime order (code checks `null` → `FactNotFoundError` first, `undefined` → `FactReaderContractError` second). Three of four cycle-2 personas independently caught it. The lesson: after making a swap, re-read the resulting state against the ground truth (the actual runtime code), not just against the before state. "I swapped it" is not the same as "it is now correct." Diff review must verify the final ordering, not just the presence of a change.

- **Inheritance discipline for zero test changes:** Existing M5+M6 tests assert `instanceof RangeError` (3 tests) and `instanceof TypeError` (2 tests). By making `InvalidTrustValueError extends RangeError` and `FactReaderContractError`/`UnhandledFeedbackEventError extends TypeError`, all existing assertions pass without any test edits. This is the correct green-beat discipline — typed error introduction is a refactor, not a behavior change.

- **`correctionDelta` non-finite maps to `InvalidTrustValueError`:** The task spec scoped `InvalidTrustValueError` to "currentTrust or stored fact.trust", but the test asserts `RangeError` for non-finite `correctionDelta`. Using `InvalidTrustValueError(value, 'input', msg)` is the cleanest fit — it extends `RangeError`, preserves the assertion, and the `source: 'input'` is accurate. M7-B narrowing tests can document this mapping explicitly.

- **Test count delta: 0.** No new tests; no removed tests. Only assertion tightening in M7-B (follow-up PR). 40/40 → 40/40.

**2026-05-31 — M7-A PR #38 Copilot Cloud Review Cycle (docs-only, Cycle 3)**

- **Three pure-docs threads closed cleanly in one commit (f8f94c3):** All three Copilot findings were pre-aligned with Cycle 1 decisions — no new design work required. Thread A (gitignored inbox path) → replaced with `.squad/decisions.md` § "M7-A" citation per the `doc-references-respect-gitignore` skill. Threads B+C (`as const` examples) → replaced with `readonly code: 'X' = 'X'` explicit-annotation form, with "Do not use as const" callout pointing back to Cycle 1 (F7) and the reference implementation. Reply-before-resolve discipline applied: all 3 threads replied on before calling `resolveReviewThread`.

**2026-05-31 — M7-C Atomicity Direction (Aaron decision)**

- **Pattern locked: mutate callback** (option c, over caller-serialization and CAS token)
- **Rationale:** Pushing read-modify-write into FactReader/TrustUpdater seam keeps activity layer pure; correctness becomes a storage-layer property
- **Status:** Implementing on `eureka/m7-c-atomicity` with Crispin (FactReader callback interface)
- **Coordinator note:** Will spawn verification when both agents report completion

**See history-archive.md for detailed entries from M5, M6, earlier reviews, and design ceremony.**


- **JSDoc concurrency notes must describe the mechanism, not just the obligation:** "atomicity is a storage-backend responsibility" was misleading because `TrustUpdater.update` only accepts an absolute value — the backend has no CAS surface without an API change. Accurate JSDoc names both v1 (caller serialization) and the future path (API widening: CAS token or mutate callback) so M7-C has a concrete scope.

- **Interface is the source of truth for return type contracts:** When an interface says `Promise<T|null>` and impl logic uses `== null`, the loose equality is defending against a contract violation that the TypeScript type system already prevents. Align to `=== null` and update spec/JSDoc to match — three-layer disagreement silently erodes trust in the interface as authoritative.



- **Required-but-unused dep is inverse anti-pattern:** §55 §1.2 says "no optional default — defaults hide non-determinism." A *required-but-unused* dep is the mirror problem: it signals a dependency the activity doesn't actually need, polluting call sites and obscuring what the function truly depends on. Remove unused deps from both the type and the call sites simultaneously.

- **Exhaustive `switch` over `if/else` for union dispatch:** TypeScript's `never` branch in `default:` makes union extension a compile error. The `if/else if/else` chain silently routes any unrecognized event to the last branch. The `switch` + `_exhaustive: never` pattern is the correct idiom whenever branching on a discriminated union — apply it universally.

- **Input validation before side effects is a contract invariant:** Validating `currentTrust` before the `TrustUpdater.update()` call ensures no partial side-effects occur on bad input. The rule: all input validation must fire before the first `await` that touches external state.

- **Named types pay for themselves at the barrel boundary:** Inline anonymous types in function signatures force callers to inline the shape or `typeof` the function parameters. Extracting to named interfaces (`ApplyFeedbackOptions` etc.) costs one definition but enables type annotations, IDE autocomplete, and `export type` barrel re-export. M1–M4 precedent (`RecallOptions`, `RecallDeps`) makes this a team norm.

- **TOCTOU documentation is a legitimate deliverable:** When actual atomicity fix is deferred to a storage layer, the interim obligation is clear documentation: `@concurrency` JSDoc + a decision drop item. Undocumented TOCTOU is a future debugging trap; documented TOCTOU is a known deferred obligation.

**2026-05-29 — PR #30 Copilot cloud review (T2/T3/T4)**

- **camelCase-at-activity-layer norm:** Activity-layer types (`RecallResult`, `ScoredResult`) use camelCase (`attentionTier`, `lastAccessed`). The FactStore storage seam is responsible for snake↔camel mapping at the data boundary. Snake_case fields in TypeScript activity types were a smell — they belonged one layer down.

- **Ranker BM25-truncation constraint documented:** A custom `Ranker` injected into `recall.ts` only sees at most `k` candidates pre-filtered by BM25 in FactStore.search(). It cannot surface candidates at positions k+1..k+m. This is now documented on the `Ranker` JSDoc. If a future ranker needs broader visibility, overfetching (`limit: k * overfetchFactor`) is the remedy — tracked as future work.

- **Fragile-doc-cite anti-pattern:** Embedding external document line-number claims in production source (e.g., "§50 line 211 contains incorrect values") is fragile — the doc will be edited, the line will shift, the comment becomes misleading. The correct approach: cite only the authoritative source (§30 §1.2) and track the discrepancy in decisions.md, not in source code.

**2026-05-29 — PR #30 Copilot cloud review (Cycle 2, runtime attentionTier guard)**

- **Compile-time strictness + runtime defensiveness are complementary, not contradictory:** TypeScript union narrowing (no `?? 1.00` fallback) catches typos at compile time. A runtime guard (`multiplier === undefined → warn + default 1.0`) defends against SQLite rows that bypass TS narrowing. Both belong — they operate at different seams.

- **Stderr-warn discipline for MCP compatibility:** Any console diagnostic emitted inside recall.ts must go to `console.warn` (stderr), never `console.log` (stdout). The MCP transport uses stdout for protocol messages; any stdout noise corrupts the JSON-RPC frame. This is an invariant for all eureka activity code.

- **NaN-guard pattern (generalised):** The F1 guard (clamp negative tDays) and F7 guard (default undefined multiplier) follow the same structural pattern: identify the input path that produces `NaN`, add a narrowing check, emit a diagnostic on the unexpected branch, substitute a safe default. Apply this pattern to any numeric pipeline that crosses a runtime seam.

**2026-05-30 — M5 GREEN (applyFeedback + TrustUpdater seam)**

- **Silent-fallback `?? 0` considered harmful for required inputs:** My initial M5 GREEN used `correctionDelta ?? 0` as the user_correction fallback. This is a silent no-op — the activity calls TrustUpdater with an unchanged trust value, confusing the caller into thinking the mutation succeeded. M6-A5 (Laura's RED test) drove the fix: throw explicitly when `correctionDelta` is undefined and event is `user_correction`. Required inputs must fail loudly at the activity boundary, not silently degrade.

- **Seam separation — write vs. read:** `applyFeedback` owns delta computation and delegates the write to `TrustUpdater`. It intentionally does NOT read from storage — keeping the function pure with respect to reads. Mixing read + write into a single function blurs responsibility. The `applyFeedbackById` orchestrator is the correct place to own the read, using a distinct `FactReader` seam.

- **Regression-lock tests after implementation are a mild §55 deviation:** M6-A1–A4 (user_correction regression locks) arrived after the implementation was already correct. These are still valuable — they lock the contract for future regressions. The deviation is mild (implementation matches spec), documented in the test file, and acceptable. The true RED test was M6-A5 (missing correctionDelta guard).

**2026-05-30 — M6 GREEN (applyFeedbackById + FactReader read-seam)**

- **Read-seam null-guard is a trust-boundary concern:** When `FactReader.read()` returns `null`, throwing immediately prevents `TrustUpdater.update()` from being called for a non-existent fact. This is not just defensive coding — it's a correctness requirement. A silent return would let the caller believe feedback was recorded when it wasn't.

- **Function decomposition over parameter growth:** Adding `currentTrust` to `applyFeedbackById`'s options signature was rejected. The higher-level function should own the read; callers shouldn't need to know current trust. `applyFeedback` (takes currentTrust) and `applyFeedbackById` (takes factId, reads internally) form a clean two-level API with explicit layering.

- **§30 §2.3 spec gap filled:** The docs section jumped §2.2 → §2.4. Writing §2.3 "Trust Dynamics Beyond the Static Floor" as part of M6 delivery closes the gap that Laura originally flagged in the RED decision drop. Spec gaps should be closed in the same milestone that implements the behavior — not deferred.

## Learnings

- **F7 reversal (2026-05-31, PR #38 Cycle 4):** The Cycle 1 F7 finding that switched discriminator declarations from `readonly code = 'X' as const` to the explicit-annotation form `readonly code: 'X' = 'X'` was reversed. Root cause: the repo's ESLint config enforces `@typescript-eslint/prefer-as-const` as an error — the explicit-annotation form violates it, breaking CI on both Node 20 and Node 22. The `as const` form was correct all along. Lesson: **the repo's enforced lint config is authoritative over Craft-persona stylistic opinions**. Local Windows lint failed to catch this because the root `npm run lint` glob doesn't match workspace files on Windows — use `npm run lint --workspace=@akubly/eureka` for the gate the CI actually runs.

- **M7-C (2026-05-31): Variant B removes `currentTrust` from caller API entirely.** The key insight behind Variant B over Variant A: when atomicity is a storage guarantee, the caller *cannot* provide `currentTrust` — the storage impl reads it inside `mutate()`. Forcing callers to supply `currentTrust` would create a false interface that ignores the supplied value. Variant B is the only shape consistent with the contract.

- **Pre-flight vs. fn-time validation — two distinct seams:** Pre-flight validation (event type, correctionDelta presence/finiteness) fires BEFORE `mutate()` is called. Storage-trust validation fires INSIDE `fn` when storage calls `fn(currentTrust)`. This creates two observable test patterns: (1) pre-flight errors → mutate never called; (2) fn-time errors → mutate WAS called, fn threw, write aborted. Tests must differentiate these.

- **`FactReaderContractError` dead on the write path after M7-C.** The class survives in errors.ts for Crispin's READ seam (recall, display paths). Tests that used to drive it via `applyFeedbackById({ factReader: makeFactReader(undefined) })` must become direct constructor integrity tests. Document this transition explicitly in test comments so future readers understand the historical context.

- **`runTrustUpdaterContract` shared helper is immediately reusable by Crispin.** The helper accepts `makeImpl: () => { impl, setTrust, getTrust }` so any impl — in-memory, SQLite, Postgres — can be exercised against the same 7 contracts. The per-(sessionId,factId) promise chain in `InMemoryTrustUpdater` is the minimal reference impl for serialization semantics.

- **ESM `require()` fails; use static imports.** In an ESM-only package (no CJS build), `require('../errors.js')` inside a test function throws at runtime. All imports must be top-level `import` statements. This bit me in the M6-B3 class-integrity test migration.

- **Test count on `eureka/m7-c-atomicity` vs. prior branches:** 68 tests (not 73) because `fact-reader.contract.test.ts` (5 tests, Crispin's READ seam) lives only on the commits that include Scribe's interim artifacts. The 68 are the right count for Edgar's M7-C branch.

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe