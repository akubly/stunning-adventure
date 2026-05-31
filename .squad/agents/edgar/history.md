# Edgar — History

**Role:** Learning Systems Specialist (Plasticity, trust, recency, recall algorithms)
**Status:** M5+M6 cycle 2 hardening complete. correctionDelta validation + FactReader contract + @concurrency accuracy landed. 37/37 tests green.
**Last update:** 2026-05-30

**Key milestones:**
- R5-R6: Power-law recency + event-driven trust design
- R7-R8: v5-final locked canonical (extraction-ready mechanisms verified)
- M2-M3: recall() + composite-ranker landed (§30 §1.2 FR-2 formula inline)
- Cycle 2 fixes: F6 minTrust interface, C5 Ranker JSDoc, C6 guard test
- M5 GREEN: applyFeedback (TrustUpdater seam) — corroboration/contradiction/user_correction
- M6 GREEN: applyFeedbackById (FactReader read-seam) + user_correction required-delta guard
- M5+M6 cycle 2: correctionDelta NaN/Infinity guard, @concurrency accuracy, FactReader strict-null contract
- Build: 609 Cairn, 644 Forge, 37 Eureka tests green

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

**Scribe note (2026-05-30T22:19:00Z):** M5+M6 review-cycle cycle 2 hardening complete. Three findings addressed: (1) correctionDelta non-finite guard added inside user_correction branch; (2) @concurrency JSDoc rewritten to accurately present caller-serialization vs. API-widening options with M7-C scope updated; (3) FactReader contract aligned to strict null across interface, impl (=== null), and §2.3 spec. 37/37 tests green.

## Learnings

**2026-05-30 — M5+M6 cycle 2 hardening (correctionDelta, @concurrency, FactReader contract)**

- **Validate ALL inputs in a math path, not just the first one:** Cycle 1 added a `currentTrust` guard but left `correctionDelta` unchecked. A NaN delta produces NaN trust, which propagates silently into TrustUpdater. The pattern: when a function takes multiple numeric inputs into a computation, each must be independently validated before the first side-effect-producing `await`.

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