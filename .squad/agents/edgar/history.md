## Current & Recent

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

📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe

📌 **Crucible Sprint 0 — DB Collaborator Seam ESTABLISHED** (2026-06-02T06:43:01Z): Roger's REFACTOR cycle introduces explicit DB interface (getSession, insertSession, queryEvents) + in-memory adapter (createInMemoryDB). Seam ready for L1-substrate swap (real SQLite integration stub via Refactor 3, then OQ-2 Cairn event_log integration pre-sprint-2). Edgar/Genesta/Crispin: Coordinate on L1 substrate decisions + schema overlap when OQ-2 lands. — Scribe
