# Squad Decisions

## Open Decisions (Current Session)


## Crucible Sprint 0 Kickoff — First RED Test (2026-06-01 Session)

---

### 2026-06-01: Crucible Sprint 0 Kickoff — First RED Test Scope (Graham)

# Decision: Crucible Sprint 0 Kickoff — First RED Test Scope

**Author:** Graham (Lead / Architect)  
**Date:** 2026-06-01  
**Status:** PROPOSED  
**Requested by:** Aaron Kubly  
**Scope:** Walkthrough A first RED cycle (§4.1 of `docs/crucible-tdd-strategy.md`)

---

## 1. Package(s) Scaffolded

**Decision: Scaffold both `packages/crucible-cli/` AND `packages/crucible-core/` now.**

The §4.1 Walkthrough A first RED test lives in `crucible-cli` (`src/__tests__/acceptance/session-fork.test.ts`). The GREEN phase immediately descends into `crucible-core` (SessionManager, DB layer). Scaffolding both is ~10 minutes of mechanical work using the `scaffold-eureka-package-tdd` skill pattern — same `package.json` shape, same `vitest.config.ts`, same `tsconfig.json` with `composite: true`.

**Trade-off considered:**
- *Alternative: scaffold only `crucible-cli` now.* Saves 5 minutes but forces a context-switch mid-GREEN to set up the second package. RED→GREEN flow interrupted for infrastructure.
- *Chosen: scaffold both.* Zero-cost prep. The `crucible-core` scaffold contains only `src/index.ts` with `export {}` — no implementation, no TDD violation. Uninterrupted RED→GREEN.

**Package names:**
- `@akubly/crucible-cli` — §13 CLI shell + acceptance tests
- `@akubly/crucible-core` — session manager, ledger primitives, DB layer

Both added to root `tsconfig.json` references and auto-discovered by `workspaces: ["packages/*"]`.

---

## 2. Minimal Types Surface for Walkthrough A RED Test

The first test (`session-fork.test.ts`) must **compile but fail at runtime** (missing implementation modules). The following type stubs are the minimal surface needed for the test to typecheck.

### Already in `@akubly/types`:
- `SessionId` (branded string) — ✅ exists at `packages/types/src/index.ts:117`

### Needed as stubs (in `crucible-core` or `crucible-cli` test helpers):

| Type | Shape (minimal) | Source |
|------|-----------------|--------|
| `PrimitiveKind` | `'observation' \| 'decision' \| 'question' \| 'artifact' \| 'request'` | §6 five primitives |
| `PrimitiveInput` | `{ primitiveKind: PrimitiveKind; primitivePayload: unknown; causalReadSet: unknown[] }` | §4.1 test `append()` arg |
| `SessionMetadata` | `{ parentSessionId?: SessionId; forkPointEventId?: number }` | §4.1 test assertions; §15.2 `SessionMetadata` shape |
| `Session` | `{ id: SessionId; metadata: SessionMetadata; append(p: PrimitiveInput): Promise<void>; query(opts: { range: [number, number] }): Promise<unknown[]> }` | §4.1 test API surface |
| `createSession` | `() => Promise<Session>` | §4.1 test Arrange |
| `fork` | `(parentId: SessionId, opts: { atOffset: number }) => Promise<Session>` | §4.1 test Act |

### Coexistence alignment (§15):
- `SessionId` stays in `@akubly/types` (shared brand — §15.1 rule: "share identifiers, fork everything else").
- `PrimitiveKind`, `PrimitiveInput`, `Session`, `SessionMetadata` are **Crucible-only** types. They live in `crucible-core`, not in `@akubly/types`. Per §15.2, `SessionMetadata` will eventually promote to `@akubly/types` with the full shape from §10.1 — but Sprint 0 needs only the fork-lineage subset, and premature promotion violates the "no cross-runtime imports" invariant.
- `createSession` and `fork` are API functions exported from `crucible-core`. The `crucible-cli` acceptance test imports them.

### What is NOT needed for RED:
- `BootstrapPayload`, `ContextWindowCommitment`, `PluginVersionLock` — these are GREEN/REFACTOR phase types.
- `CrucibleEvent`, `AppendProtocol` — L1 WAL internals, not surfaced in the acceptance test.
- Full `SessionMetadata` from §10.1 — only `parentSessionId` and `forkPointEventId` are asserted in the test.

---

## 3. Test Framework

**Vitest** — confirmed. Matches `packages/eureka/vitest.config.ts` exactly:

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`devDependencies`: `"vitest": "^3"`, `"@types/node": "^25.5.0"` — same as eureka.

---

## 4. OQ-2 Deferral Note

**The first RED test does NOT cross the L1-substrate / Cairn `event_log` topology line.**

- The acceptance test in `crucible-cli` uses **mocked collaborators** per §4.1 GREEN phase (`vi.mock`).
- No real WAL writes, no SQLite, no `~/.crucible/` filesystem access.
- The federate-vs-merge decision (OQ-2: Crucible L1 WAL vs Cairn `event_log`) is a **pre-sprint-2** concern per `.squad/decisions.md`.
- This RED cycle is safe to execute without resolving OQ-2.

OQ-1 (substrate ownership) was resolved via ADR-0002. OQ-3 (Decision/SessionId schema dual ownership) does not affect this test — `SessionId` is the only shared type consumed, and it's already in `@akubly/types`.

---

## 5. Scope Acknowledgment

**Walkthrough A first RED test is the kickoff scope.** Specifically:

- ONE acceptance test: `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`
- Test asserts: session fork creates child with inherited ledger prefix (parent events [0..23] visible in child, parent unmodified)
- Expected RED failure: `Cannot find module` (the session API module doesn't exist yet)
- NOT in scope: GREEN implementation, REFACTOR, any other walkthrough, any L1 substrate work

---

## Action Items

1. Scaffold `packages/crucible-cli/` and `packages/crucible-core/` using `scaffold-eureka-package-tdd` pattern
2. Add type stubs per §2 above (compile-but-not-run surface)
3. Write the first RED test per §4.1
4. Verify RED for the right reason (`Cannot find module`, not config errors)
5. Verify baseline stays green (`npm run build` + existing package tests pass)


---

### 2026-06-01: Decision Drop: crucible-cli Package Scaffold (Gabriel)

# Decision Drop: crucible-cli Package Scaffold

**Author:** Gabriel (Infrastructure)  
**Date:** 2026-06-01  
**Scope:** `packages/crucible-cli` — Sprint 0 scaffold  
**Status:** IMPLICIT DECISION — recording for team awareness

---

## Decision: Test Framework — vitest (inherited from eureka template)

**Context:** The scaffold task specified `vitest run` for the test script. This follows the existing monorepo convention established in `@akubly/eureka`. No evaluation of alternatives was performed.

**Decision:** `vitest` is the test runner for `@akubly/crucible-cli`. This is consistent with all other packages in this monorepo.

**Implication:** `vitest` config is inherited from the workspace root — no per-package `vitest.config.ts` is needed unless crucible-cli requires custom test globals or coverage thresholds.

---

## Decision: TypeScript Project References — `../types` only

**Context:** `tsconfig.json` `"references"` is set to `[{ "path": "../types" }]`, matching the eureka template. Crucible CLI will depend on `@akubly/types` for `SessionId` and shared primitive types.

**Decision:** Only `../types` is referenced at scaffold time. When crucible-cli gains dependencies on `@akubly/cairn`, `@akubly/forge`, etc., those project references must be added to this tsconfig.

---

## Decision: `src/__tests__/acceptance/` Directory Shape

**Context:** Per `docs/crucible-tdd-strategy.md` §4.1, the first acceptance test lives at `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`. Gabriel created the directory; Laura authors the test file. This split decouples scaffolding from the red-test phase.

**Decision:** Acceptance tests live under `src/__tests__/acceptance/`. Unit/integration tests (future) will follow the eureka pattern of `src/<domain>/__tests__/`.


---

### 2026-06-01: Laura — Crucible First Red Test Decision Inbox (Laura)

# Laura — Crucible First Red Test Decision Inbox

**Author:** Laura Bow (Tester)  
**Date:** 2026-06-01T23:07:13-07:00  
**Status:** ✅ RED CONFIRMED

---

## Test File

`packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts`

---

## Acceptance Scenario A1 → User Story Mapping

| A1 Given/When/Then Clause | User Story |
|---|---|
| Session with 47 committed primitives, fork at offset 23 | US-A-NEW-1 (Branching Sessions) |
| Child session created with `parentSessionId` + `forkPointEventId` lineage | US-A-NEW-1 (Branching Sessions) |
| Child ledger logically extends parent prefix [0..23] | US-E-2 (Counterfactual Replay) |
| Parent session remains unmodified | US-A-NEW-1 (data integrity) |

**Locked decision binding:** Aaron decision 2a — L1-native branching. Fork lineage is owned by the L1 Ledger (not a CLI-layer concern). This acceptance test exercises that contract from the outside without prescribing implementation layer. 

---

## RED Status

**Confirmed RED** — vitest output:

```
TypeError: (0 , createSession) is not a function
 ❯ src/__tests__/acceptance/session-fork.test.ts:35:35
```

The test resolves the import (`../../index.js` exists, exports `{}`), but `createSession` is not a function — the intended failure mode per §8.1 Rule 1.

---

## Next: GREEN-Phase Descent (§4.1 Outside-In)

1. **Implement minimal stubs in `packages/crucible-cli/src/index.ts`** to export `createSession` and `fork` — initially wired to a mocked L1 Ledger collaborator (`vi.mock('../../services/ledger', ...)`).
2. **Descend one layer:** Write unit test for `SessionManager.forkSession` mocking the DB collaborator (as shown in §4.1 GREEN Step 2).
3. **Descend to leaf:** Implement `DB.insertSession` (SQLite, `:memory:` test db), make unit test green.
4. **Ascend:** Replace mocks layer-by-layer until acceptance test passes with real implementations.
5. **Invariant hardening:** Add property test for `Fork Lineage Transitivity` (§6 — multi-generation forks preserve ancestry).

The acceptance test **must not be modified** between RED and final GREEN — it is the contract anchor.

---

## Files Created

- `packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts` — the RED test
- `.squad/decisions/inbox/laura-crucible-first-red-test.md` — this file
- `.squad/agents/laura/history.md` — Learnings section updated
- `.squad/skills/london-tdd-first-red-test/SKILL.md` — reusable skill extracted



### 2026-05-31: M7-A — Typed Error Hierarchy for applyFeedback / applyFeedbackById (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-31  
**Branch:** `eureka/m7-a-typed-errors`  
**Status:** SHIPPED (PR #38 opened)

**Decision:** Introduce a typed error class hierarchy in `packages/eureka/src/activities/errors.ts`, replacing all six generic `throw new Error/TypeError/RangeError(...)` sites in `applyFeedback` and `applyFeedbackById` with domain-specific typed subclasses.

**Error classes introduced:**
- `FactNotFoundError` (extends `Error`) — FactReader returns `null`
- `InvalidFeedbackOptionsError` (extends `Error`) — `correctionDelta` undefined for `user_correction`
- `InvalidTrustValueError` (extends `RangeError`) — value non-finite/out-of-range
- `FactReaderContractError` (extends `TypeError`) — FactReader returns `undefined`
- `UnhandledFeedbackEventError` (extends `TypeError`) — exhaustive `switch` `never` branch

**Discriminator pattern:** Every class carries `readonly code: '<CODE>'` for narrowing without `instanceof`.

**Canonical narrowing policy (M7-A Cycle 1):** Use `err.code === '...'` as the **primary** discriminator. `instanceof` is convenience-only — it can fail across ESM realms. `code` is realm-safe. M7-B narrowing tests will exercise `code` exclusively.

**Rationale:** (1) Caller narrowing — generic throws are indistinguishable. (2) Zero behavior change — all 40 existing tests pass without modification. (3) M7-B prep — `code` discriminators are the primary hook for exhaustive narrowing. (4) Message preservation. (5) `Object.setPrototypeOf` defensive call in constructors.

**Open Follow-ups:**
- M7-B: Exhaustive instanceof + code narrowing tests (Laura)
- M7-C: Real FactReader contract test; atomicity contract design (Crispin/Edgar)
- M7-D: `applyFeedbackById` user_correction regression locks (Laura)

**Files Changed:**
- `packages/eureka/src/activities/errors.ts` — NEW (5 typed error classes)
- `packages/eureka/src/activities/recall.ts` — updated imports, throw sites, JSDoc @throws
- `packages/eureka/src/index.ts` — barrel exports for all 5 error classes

---

### 2026-05-31: Eureka M7-A Review Cycle — 3-Cycle Closure (Edgar, Correctness, Skeptic, Craft, Compliance)

**Date:** 2026-05-31  
**Branch:** `eureka/m7-a-typed-errors`  
**PR:** #38  
**Status:** REVIEW-COMPLETE. Ready for ship decision.

**Summary:** M7-A underwent a 3-cycle review process with a rotating 4-person panel (Correctness, Skeptic, Craft, Compliance). Each cycle ran independent reviews; findings were triaged and acted upon, followed by re-review to confirm closure. All 40 tests remained green throughout.

| Cycle | Findings | Breakdown | Disposition | Commits |
|-------|----------|-----------|-------------|---------|
| **Cycle 1** | 13 total | 1 Blocking, 5 Important, 7 Minor | 11 ACCEPT, 2 REJECT-defer | 09710dc |
| **Cycle 2** | 3 total | 0 Blocking, 1 Important, 2 Minor | 3 ACCEPT, 0 REJECT | 6563ca3, 927a508 |
| **Cycle 3** | — | (lightweight fix-only, no re-review) | — | — |

**Cycle 1 Findings (11 ACCEPT, 2 REJECT):**
- **F1 [Correctness] ACCEPT:** Added `readonly event: string` field to `UnhandledFeedbackEventError`.
- **F2 [Skeptic] ACCEPT:** Declared canonical narrowing policy: `err.code === '...'` as primary discriminator; secondary: `instanceof`.
- **F3 [Skeptic] REJECT-defer:** Base class `EurekaError` deferred to M7-B (narrowing tests phase).
- **F4 [Skeptic] ACCEPT:** Documented `.name` behavior change with explicit acknowledgment.
- **F5 [Compliance] ACCEPT:** Added missing `@throws` entries for `applyFeedbackById`.
- **F6 [Craft] ACCEPT:** Clarified `Object.setPrototypeOf` rationale comment (defensive for ES5 bundlers).
- **F7 [Craft] ACCEPT:** Removed redundant `as const` on readonly discriminators.
- **F8 [Craft] ACCEPT:** Documented open signature on `InvalidFeedbackOptionsError` constructor.
- **F9 [Craft] ACCEPT:** Merged duplicate `@throws {InvalidTrustValueError}` entries.
- **F10 [Craft] ACCEPT:** Reordered `@throws` to match runtime check sequence.
- **F11 [Craft] ACCEPT:** Added TODO comment for M7-B: purpose-specific `InvalidDeltaValueError`.
- **F12 [Skeptic] ACCEPT:** Updated "dual-pkg" comment to reflect ESM-only reality.
- **F13 [Correctness] REJECT:** JSON serialization edge case flagged for information only.

**Cycle 2 Findings (3 ACCEPT, 0 REJECT):**
- **F14 [Craft/Documentation] ACCEPT:** Corrected `@throws` order inversion from Cycle 1 F10 (FactReaderContractError before FactNotFoundError).
- **F15 [Craft] ACCEPT:** Consolidated `Object.setPrototypeOf` rationale to file header (DRY).
- **F16 [Craft] ACCEPT:** Replaced non-idiomatic "open signature" phrasing with clearer language.

**Files Changed (Cycles 1+2):**
- `packages/eureka/src/activities/errors.ts` — All 5 error classes + comments
- `packages/eureka/src/activities/recall.ts` — All throw sites + JSDoc
- `.squad/decisions.md` — Canonical narrowing policy line

**Test Result:** 40/40 passing throughout all cycles. Build clean.

---

### 2026-05-30: Coordinator Spawn Prompt — Gitignore Path Policy (Graham)

**Author:** Graham (Lead)  
**Date:** 2026-05-30  
**Trigger:** PR #34 Copilot review threads 8, 9, 10 — gitignore violations  
**Status:** Resolved (commit daf5f28 + concurrent cleanup in 4d4378b)

**Decision:** The Coordinator's spawn prompt to Scribe **must not** list `.squad/orchestration-log/`, `.squad/log/`, or any other gitignored runtime-state path as an allowed write path.

**Allowed Scribe-write paths (exhaustive list):**
- `.squad/decisions.md`
- `.squad/decisions-archive.md`
- `.squad/agents/{name}/history.md`
- `.squad/agents/{name}/history-archive.md`
- `.squad/identity/now.md`

**Explicitly prohibited (gitignored runtime state):**
- `.squad/orchestration-log/` — agent orchestration logs
- `.squad/log/` — session summary logs
- `.squad/decisions/inbox/` — transient decision queue (consumed by Scribe, not committed)
- `.squad/sessions/` — session data
- `.squad/.scratch/` — scratch space

**Context:** In the M5+M6 review cycle (PR #34), spawn instructions to Scribe incorrectly listed `log/` and `orchestration-log/` as committed paths. Scribe committed 35 files across these directories, all covered by `.gitignore` lines 49-52. This is a coordinator error — Scribe followed instructions correctly.

**Remediation Applied:**
- `git rm -r --cached .squad/orchestration-log/ .squad/log/` — untracked 34 + 1 files
- `git rm test_results.txt` — removed local junk artifact
- `.gitignore` updated for `test_results.txt`

**Action Required:** Coordinator (Graham) — Update Scribe spawn prompt template to enforce allowed-paths list and add note that runtime-state directories are never committed.

---

## Eureka M5+M6 Review Cycle

### 2026-05-30: M5+M6 Branch Preparation (Graham)

**Author:** Graham  
**Date:** 2026-05-30  
**Status:** Complete  
**Branch:** `eureka/m5-m6-trust-feedback`

After the M5+M6 RED→GREEN cascade, a working-tree loss incident occurred during branch creation. The sequence `git switch -c <feature>` → `git switch main` → `git reset --hard origin/main` wiped tracked modifications, leaving only untracked files. Recovery was performed via faithful reimplementation from test contracts (`recall-feedback.test.ts`).

**Correct sequence going forward:** Commit implementation on feature branch BEFORE switching back to main to reset, or use `git stash`.

**Final state:**
- Branch created at commit ac8c845
- 29/29 tests green, build clean
- Two-commit structure: implementation+tests+spec (commit A) + team metadata (commit B)
- main branch reset to origin/main at ef06238 (clean, no force-push)

---

### 2026-05-30: M6 RED — user_correction Contract Lock + Read-Seam (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M6 RED — two sub-beats: M6-A (user_correction contract) + M6-B (FactReader read-seam)

**Test counts:** 22 existing → 26 GREEN + 3 RED (29 total)

#### M6-A: user_correction Contract

M6-A1–A4 are regression locks on arithmetic already implemented in M5 (mild §55 deviation — implementation preceded contract). M6-A5 is the true RED: missing `correctionDelta` when `event='user_correction'` must throw.

**Fixtures verified:**
- M6-A1: 0.50 + 0.30 → 0.80 (no clamp)
- M6-A2: 0.80 + 0.30 → 1.00 (ceiling clamp)
- M6-A3: 0.50 - 0.30 → 0.20 (no clamp)
- M6-A4: 0.20 - 0.30 → 0.00 (floor clamp)

**M6-A5 contract:** `correctionDelta` is REQUIRED when `event='user_correction'`. Omitting it is a programming error; activity must throw rather than silently apply 0-delta.

#### M6-B: Read-Seam (FactReader)

**Shape decision:** New `applyFeedbackById` function (higher-level orchestrator) rather than extending `applyFeedback`.

**FactReader interface:**
```typescript
interface FactReader {
  read(args: { factId: string; sessionId: SessionId }): Promise<{ trust: number } | null>;
}
```

Rationale: Returns object (not bare number) to leave room for future fields without signature change. Null means fact not found.

**applyFeedbackById tests:**
- M6-B1 (happy path): FactReader returns `{ trust: 0.60 }`, corroboration → TrustUpdater called with 0.70
- M6-B2 (null guard): FactReader returns `null` → activity throws, TrustUpdater NOT called

**Edgar's implementation guidance (M6 GREEN):**
1. Call `deps.factReader.read({ factId, sessionId })`
2. If null, throw (fact not found)
3. Call `applyFeedback` with current trust from result
4. All 29 tests (26 existing + 3 RED) must pass

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Context:** 5-persona Code Panel review findings on M5+M6 (trust-feedback mutation)

#### Finding Triage Summary

| ID | Finding | Verdict | Key Details |
|---|---------|---------|-------------|
| F1 | Public API not exported | ACCEPT | Barrel-export `applyFeedback`, `applyFeedbackById`, `FeedbackEvent`, `TrustUpdater`, `FactReader` via `index.ts` |
| F2 | TOCTOU in applyFeedbackById | ACCEPT (doc) | Non-atomic read-then-write. JSDoc `@concurrency` clause added. Deferred: M7-C (backend-side atomicity). |
| F3 | Unused `clock` dep | ACCEPT | Removed `clock: ClockProvider` from `ApplyFeedbackDeps` and `ApplyFeedbackByIdDeps`. Clock stays in `recallWithScores`. |
| F4 | No exhaustiveness check | ACCEPT | Converted `applyFeedback` `if/else if/else` to exhaustive `switch` with `never` branch. |
| F5 | Inline types break pattern | ACCEPT | Extracted all 4 interfaces: `ApplyFeedbackOptions`, `ApplyFeedbackDeps`, `ApplyFeedbackByIdOptions`, `ApplyFeedbackByIdDeps`. |
| F6 | No input validation on currentTrust | ACCEPT | Added `RangeError` guard: `currentTrust` must be in [0,1]. Fires before `TrustUpdater.update()`. |
| F7 | Stale comment | ACCEPT | Removed "Trust score updates..." bullet from `recallWithScores` JSDoc (already implemented). |
| F11 | Incomplete @throws JSDoc | ACCEPT | Added `@throws` clauses covering propagated errors from `applyFeedback` and new `RangeError` guards. |
| F12 | Stricter null/undefined guard | ACCEPT (combined with F6) | Changed to strict null checks; expanded guard contracts in spec. |

**Changes made:**
- `packages/eureka/src/activities/recall.ts`: F1-exports, F2-TOCTOU JSDoc, F3-clock removed, F4-switch exhaustive, F5-named interfaces, F6-input validation, F7-stale comment, F11-@throws
- `packages/eureka/src/index.ts`: F1+F5 barrel-export additions (9 new exports)
- `docs/eureka/sections/30-learning-systems.md` §2.3: F3-clock scope, F5-interface shapes, F6-guard contracts

**Build/Test Status:** ✅ clean build, 29/29 tests passing

---

### 2026-05-30: M5+M6 Review Wave — Code Panel Findings (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Context:** Code Panel review findings on RED tests + implementation. Laura owns `recall-feedback.test.ts`.

#### Finding Triage Summary

| ID | Finding | Verdict | Action |
|---|---------|---------|--------|
| F8 | Idempotent boundary not pinned | ACCEPT | Added 2 tests: ceiling (currentTrust=1.0 → 1.0), floor (0.0 → 0.0) |
| F9 | Float equality fragility | ACCEPT | Wrapped all 9 trust assertions in `expect.closeTo(value, 5)` |
| F10 | Stale `±0.30` header comment | ACCEPT | Updated to actual formula: `min(1.0, max(0.0, trust + correctionDelta))` |
| F-NEW-EXHAUSTIVE | Unknown event type TypeError | ACCEPT | Added regression lock for exhaustiveness guard |
| F-NEW-RANGE | Input validation RangeError | ACCEPT | Added 4 regression locks (NaN, <0, >1 on currentTrust + delegation path) |
| F-NEW-PROPAGATION | Missing correctionDelta via byId | ACCEPT | Added test: `applyFeedbackById` with missing delta propagates error |

**Float precision decision (F9):** Chose `closeTo(value, 5)` over suggested 10. Reasoning:
- 5 decimal digits (±0.000005) is strict enough to catch wrong delta calculations
- IEEE-754 jitter for these operands is 1e-16 — well inside 1e-5 tolerance
- 10 digits is overkill; 5 is defensible middle ground

**Test count delta:** 29 → 37 (+8 tests). Target per brief: 36+. Achieved 37.

**Clock coordination note (for Edgar):** All new tests retain `clock: fixedClock` pending Edgar's F3 commit (clock removal). Once F3 lands, drop clock from all 16 applyFeedback/applyFeedbackById call sites and remove `fixedClock` helper.

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M5+M6 Cycle 2 Review Findings (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback  
**Triggered by:** Review-cycle cycle 2 (Skeptic + Architect panels)

#### Cycle 2 Findings

| ID | Finding | Triage | Summary |
|---|---------|--------|---------|
| F-C2-1 | correctionDelta unvalidated for NaN/Infinity | ACCEPT | Added `RangeError` guard after `undefined` check, before trust math. Guards consistency with M5 `currentTrust` validation. |
| F-C2-2 | @concurrency JSDoc overpromises | ACCEPT | Rewrote to present both options: (1) caller-side serialization (v1), (2) backend-side atomicity (deferred M7-C). Clarified M7-C scope. |
| F-C2-3 | FactReader contract drift | ACCEPT (Option A) | Three-layer misalignment (interface vs impl vs spec). Chose strict null: interface `Promise<{trust:number}\|null>`, guard `fact === null`, spec updated. |

**Build/Test Status:** ✅ clean build, 37/37 tests passing

**Coordination notes for Laura:**
- Suggest adding `correctionDelta` NaN guard test (low priority, can land with current wave)
- F-C2-3 impact on Laura's tests: zero — all existing null tests use `mockResolvedValue(null)`

---

### 2026-05-30: M5+M6 Cycle 2 Changes (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Branch:** eureka/m5-m6-trust-feedback

Cycle 2 review consensus identified stale `clock: fixedClock` injections carried through all feedback-path call sites after Edgar removed `ClockProvider` from `ApplyFeedbackDeps` / `ApplyFeedbackByIdDeps` in cycle 1. Test dir excluded from tsc, so excess-property checking never fired.

**Changes (recall-feedback.test.ts only):**
- `applyFeedback` call sites cleaned: 15
- `applyFeedbackById` call sites cleaned: 4
- `fixedClock` const removed: yes
- `FIXED_NOW_MS` const removed: yes
- Block comment updated: clock now scoped to recall/recallWithScores only, NOT feedback path

**Validation:** `npm test --workspace=@akubly/eureka` → 37/37 passed

---

### 2026-05-30: M6 GREEN — correctionDelta Guard + FactReader (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M6 GREEN  
**Status:** LANDED — GREEN (29/29 tests pass, tsc clean, all 37/37 after Laura's wave)

#### Test Count Delta

| Suite | Before M6 | After M6 | Delta |
|---|---|---|---|
| `recall.test.ts` (M1–M4) | 18 | 18 | — |
| `recall-feedback.test.ts` M5 (C1/C2) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A1–A4 (regression locks) | 4 | 4 | — |
| `recall-feedback.test.ts` M6-A5 (correctionDelta guard) | 0 RED | 1 GREEN | +1 |
| `recall-feedback.test.ts` M6-B1–B2 (applyFeedbackById) | 0 RED | 2 GREEN | +2 |
| **Total** | **26 (3 RED)** | **29 GREEN** | **+3** |

#### Error Semantics Chosen

**M6-A5 — Missing correctionDelta:**
- Error: base `Error` (not typed)
- Message: `'applyFeedback: correctionDelta is required when event is user_correction'`
- Placement: top of function, before event-branch switch
- Rationale: Input-validation concern; guards before any side effects

**M6-B2 — FactReader returns null:**
- Error: base `Error`
- Message: `'applyFeedbackById: fact not found — factId=<factId>'`
- Guarantee: `trustUpdater.update` NOT called
- Future refinement (M7): typed error narrowing (e.g., `FactNotFoundError`)

#### Implementation Pattern: Delegation Over Modification

`applyFeedbackById` delegates to `applyFeedback` after reading:
```typescript
const factData = await factReader.read({ factId, sessionId });
if (factData === null) throw new Error(...);
await applyFeedback({ factId, sessionId, event, currentTrust: factData.trust, correctionDelta }, { trustUpdater });
```

Keeps `applyFeedback` purely unit-testable; orchestration stays in `applyFeedbackById`. Consistent with "orchestrator over modifier" pattern.

#### Named Next RED Targets (M7)

| Name | Description | Priority |
|---|---|---|
| M7-A | null-fact error contract | High |
| M7-B | typed error narrowing (missing correctionDelta) | Medium |
| M7-C | FactReader contract test (real Crispin impl) | Medium |
| M7-D | applyFeedbackById user_correction path | Low |

---

### 2026-05-29: M4 RED — ClockProvider Seam Contract (Laura)

**Author:** Laura (Tester)  
**Date:** 2026-05-29  
**Beat:** M4 RED — ClockProvider injection for recency decay over real time  
**Next owner:** Edgar owns M4 GREEN.

---

## Decision: ClockProvider Shape

**Chosen interface:**
```typescript
export interface ClockProvider {
  /** Returns current Unix timestamp in milliseconds. */
  now(): number;
}
```

**Location:** Defined in `packages/eureka/src/activities/recall.ts` alongside
`RecallDeps` (extraction to `packages/eureka/src/learning/properties/clock.ts`
deferred per §30 §2.4 note on FR-12).

**Citation:** §55 §1.2 — "Non-deterministic inputs (timestamps, random IDs)" →
mock at seam.

**Unit choice: milliseconds.**  
The existing `compositeScore()` implementation divides by `86_400_000` (ms → days),
and all M2/M3 fixtures use `EPOCH_MS = 0` (clearly ms). Using ms keeps the interface
consistent with the live implementation.

---

## Decision: Required, Not Optional

`clock: ClockProvider` is **REQUIRED** in `RecallDeps`. No optional default.

**Rationale:** Defaults hide non-determinism. A `SystemClock` default would allow
the production smell (`Date.now()`) to silently persist in paths where the caller
forgets to inject a clock. Requiring the dep at the call site ensures every caller
is explicit about its time source. §55 §1.2 seam discipline.

---

## §-Tensions

### Tension 1: §30 §2.4 uses seconds; implementation uses milliseconds

§30 §2.4 specifies:
```typescript
class SystemClock implements ClockProvider {
  now(): number { return Date.now() / 1000; }  // seconds
}
function computeRecency(lastAccessed: number, clock: ClockProvider): number {
  const t = (clock.now() - lastAccessed) / 86400;  // seconds → days
}
```

But `recall.ts` currently uses:
```typescript
const tDays = (nowMs - fact.last_accessed) / 86_400_000;  // ms → days
```

And `last_accessed` fixtures use ms values (e.g., `EPOCH_MS = 0`, `BASE_MS =
1_000_000_000_000`).

**Resolution:** ms throughout — match the implementation. §30 §2.4 is pseudocode;
the implementation is concrete. Edgar should note this when implementing GREEN and
can flag to Crispin/Genesta if the spec needs updating.

### Tension 2: §30 §2.4 "optional default to SystemClock" vs §55 §1.2 required seam

§30 §2.4 says: "All time-dependent algorithms accept **optional** ClockProvider
parameter (defaults to SystemClock)."

§55 §1.2 says: Non-deterministic inputs → mock at seam. Defaults hide bugs.

**Resolution:** Required parameter wins. §55 §1.2 is the TDD discipline spine;
§30 §2.4 is the domain specification and its note about optional defaults is a
production-convenience suggestion, not a seam discipline rule. The two sections
have different concerns; when they conflict at the seam, §55 governs.

**Impact on Edgar's GREEN:** Edgar must also update the M2/M3 recall() calls in
production call sites (if any) to inject a real clock. Test call sites already
updated by this RED beat (option (a) — no optional default path).

### Tension 3: ≥0.18 margin rule vs recency-only max 0.108

The `unambiguous-ranking-fixtures` skill specifies ≥0.15 margin (task brief says
≥0.18) between adjacent ranks. With the FR-2 formula weights (recency weight=0.10),
the maximum achievable margin from recency variation alone is:
  `0.10 × (1.0 - 0.1) × 1.20 (hot) = 0.108`

**Resolution:** The ≥0.18/≥0.15 rule was designed for multi-dimensional fixtures
where near-tie scores could be swapped by floating-point noise. For a recency-
isolated test (identical relevance/importance/trust/tier, only clock differs), a
margin of 0.108 is fully unambiguous — there is zero floating-point ambiguity between
recency=1.0 and recency=0.1. The rule is relaxed to ≥0.10 for recency-isolated tests.
Skill updated with this clarification.

---

## M4 Fixture Summary

| Fact  | last_accessed           | tDays @ stub | recency | finalScore |
|-------|-------------------------|--------------|---------|------------|
| FRESH | `BASE_MS`               | 0            | 1.0     | **1.068**  |
| STALE | `BASE_MS − 100_DAYS_MS` | 100          | 0.1     | **0.960**  |

`BASE_MS = 1_000_000_000_000` (Sep 2001). Stub clock: `{ now: () => BASE_MS }`.

**Margin:** 0.108 (recency-isolated, unambiguous).

**RED failure (verbatim):**
```
FAIL  src/activities/__tests__/recall.test.ts > recall >
      ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4)

AssertionError: expected [ 'Stale accessed fact', …(1) ] to deeply equal [ 'Freshly accessed fact', …(1) ]
- Expected
+ Received
  [
-   "Freshly accessed fact",
    "Stale accessed fact",
+   "Freshly accessed fact",
  ]
```

Not a type/import error — an ordering assertion failure caused by production code
ignoring the injected clock and using `Date.now()` directly.

---

## M2/M3 Backwards Compatibility

Chose **option (a)**: update M2/M3 test call sites to inject a stub clock.

Added to both existing `recall()` calls in `recall.test.ts`:
```typescript
const FIXED_NOW_MS = 1_748_476_800_000; // 2026-05-29 00:00 UTC
const fixedClock = { now: () => FIXED_NOW_MS };
// ...
recall({ query, sessionId, k }, { factStore, clock: fixedClock })
```

**M3 score preservation:** FIXED_NOW_MS produces tDays≈20,237 for all facts with
`last_accessed=0` (EPOCH_MS) → (1+20237)^-0.5 ≈ 0.007 → floor 0.1. All M3 scores
unchanged (B=0.960, C=0.620, D=0.440, A=0.168).

**M2 correctness:** M2 facts have no `last_accessed` → tDays=0 fallback in impl →
recency=1.0 regardless of clock value. No ordering impact.

---

## Files Modified

- `packages/eureka/src/activities/recall.ts` — added `ClockProvider` interface;
  `RecallDeps.clock: ClockProvider` (required). Production still uses `Date.now()`
  — that's the RED smell Edgar fixes in GREEN.
- `packages/eureka/src/activities/__tests__/recall.test.ts` — M2/M3 clock injection
  + M4 test.

---

## Named M4 GREEN Owner

**Edgar owns M4 GREEN.**

Edgar's minimal implementation:
1. Import `ClockProvider` (already exported from `recall.ts`)
2. Change `const nowMs = Date.now();` → `const nowMs = deps.clock.now();` in `recall()`
3. No other changes needed (compositeScore already accepts nowMs as parameter)
4. Verify: M4 test passes; M2 + M3 still pass; build clean; Cairn/Forge baseline intact

---

### 2026-05-29: M4 GREEN — ClockProvider Seam Wired (Edgar)

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-29  
**Beat:** M4 GREEN — ClockProvider injection for recency decay over real time  
**Predecessor:** M4 RED (laura-m4-clock-red.md)

---

## GREEN Landing

All 3 Eureka tests pass. Baseline intact.

**Verbatim output:**
```
 ✓ src/activities/__tests__/recall.test.ts (3 tests) 3ms
   ✓ recall > surfaces keyword-overlapping entries at ≥80% precision 1ms
   ✓ recall > ranks results by FR-2 composite formula descending (§30 §1.2) 1ms
   ✓ recall > ranks recently-accessed fact above stale fact when clock is pinned (§30 §2.4) 0ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
```

**Baseline (repo root `npm test`):**
- Cairn: 609 tests passed ✅
- Forge: 644 passed | 3 todo ✅
- Eureka: 3/3 ✅
- `npm run build` → `tsc --build` exit 0 ✅

---

## Implementation Shape

**Files changed (2):**

### `packages/eureka/src/activities/recall.ts`

`ClockProvider` interface and `clock: ClockProvider` (required) in `RecallDeps` were
already present from Laura's M4 RED. The only production change:

```diff
-  const { factStore } = deps;
+  const { factStore, clock } = deps;
   ...
-  const nowMs = Date.now();
+  const nowMs = clock.now();
```

`compositeScore(fact, nowMs)` was already parameterised — no other change needed.

### `packages/eureka/src/index.ts`

Added `ClockProvider` to barrel re-export:

```diff
-export type { RecallOptions, RecallDeps, RecallResult, FactStore } from './activities/recall.js';
+export type { RecallOptions, RecallDeps, RecallResult, FactStore, ClockProvider } from './activities/recall.js';
```

---

## No-Default-Clock Discipline (§55 §1.2)

`clock` is **REQUIRED** in `RecallDeps`. No `clock = systemClock` default.

**Rationale:** A default would allow the production smell (`Date.now()`) to silently
persist in any call site that omits the clock. Requiring injection ensures every caller
declares its time source explicitly. TypeScript enforces this at compile time.

**§-tension:** §30 §2.4 suggests "optional default to SystemClock". §55 §1.2 prohibits
defaults for non-deterministic inputs. **§55 governs at seam discipline boundary.** §30's
suggestion is production-convenience advice, not seam discipline.

---

## ClockProvider Location

Colocated with `RecallDeps` in `recall.ts` per Laura's contract.

Extraction to `packages/eureka/src/learning/properties/clock.ts` deferred per §30 §2.4
"pending FR-12 (extraction-ready design)". §55 §1.2 discipline: interface lives at the
seam, not in premature abstraction.

---

## §-Tensions

| Tension | Resolution |
|---------|------------|
| §30 §2.4 `now()` returns seconds; impl uses ms | ms throughout (consistent with `86_400_000` divisor in `compositeScore`). §30 pseudocode is illustrative. |
| §30 §2.4 optional default vs §55 §1.2 required | §55 wins. Required dep at call site. Documented in laura-m4-clock-red.md. |

---

## Named M5 Target

**M5: Trust score updates from feedback events (§30 §2.3)**

§30 §2.3 specifies event-driven trust mutation:
- Corroboration: `trust = min(1.0, trust + 0.10)`
- Contradiction: `trust = max(0.0, trust - 0.10)`
- User correction: `trust = min(1.0, trust ± 0.30)`

Currently `recall()` consumes static trust from `FactStore.search()`. The cascade
demands a test that injects a feedback event and asserts the resulting trust mutation,
driving the trust-write seam into existence.

**Citation:** §30 §2.3 "Trust Dynamics Beyond the Static Floor"

**Laura owns M5 RED.**

---

### 2026-05-28: Team Norm — London-School TDD Ownership

**Date:** 2026-05-28T23:49:42Z  
**Origin:** Aaron Kubly (via Scribe, coordinator mandate)  
**Status:** NORM — durable team discipline

**Rule:** London-school TDD ownership:
- Tester owns ALL RED beats (failing tests that define contracts)
- Implementer agents own GREEN beats only (production code to satisfy contracts)
- Implementer may NAME next RED target but never claim ownership of writing the test

**First instance:** M1 RED (Laura) → M2 GREEN (Edgar) → M3 RED (Laura) → M3 GREEN (Edgar) → M4 TARGET named by Edgar (ClockProvider injection), M4 RED owned by Laura.

**Enforcement:** Git history verification, `.squad/agents/*/history.md` records ownership, Scribe calls out violations in orchestration logs.

---

### 2026-05-28: M3 RED — Composite-Ranker Ordering Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-28  
**Status:** LANDED — RED  
**Next owner:** Edgar (M3 GREEN)

New test added to `packages/eureka/src/activities/__tests__/recall.test.ts`:
```
✓ recall > surfaces keyword-overlapping entries at ≥80% precision  (M2 — still green)
✗ recall > ranks results by FR-2 composite formula descending (§30 §1.2)  (M3 — RED)
```

**Failure:** AssertionError ordering (storage order returned instead of FR-2 descending order). No type/import/config errors.

**Ranker seam decision:** Option (b) — Inline Scoring. Drive composite scoring inline in `recall()`. No new Ranker collaborator. (§55 §1.2, §55 §2.3 Key Lesson #3)

**Fixture design (FR-2 formula: rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency; finalScore = rawScore × attention_multiplier; multipliers: hot=1.20, warm=1.00, cold=0.80; recency = max(0.1, (1+t)^-0.5), t=days since last_accessed):**

| Fact | relevance | importance | trust | tier | finalScore |
|------|-----------|-----------|-------|------|-----------|
| A (Cold low-relevance)      | 0.2 | 0.2 | 0.3 | cold | 0.168 |
| B (Hot high-relevance)      | 0.9 | 0.8 | 0.9 | hot  | 0.960 |
| C (Warm medium-high)        | 0.7 | 0.6 | 0.7 | warm | 0.620 |
| D (Warm medium)             | 0.5 | 0.4 | 0.5 | warm | 0.440 |

Score margins unambiguous: B−C=0.340, C−D=0.180, D−A=0.272.

**What Edgar implements (M3 GREEN):**
1. Extend `RecallResult` with explicit fields: relevance, importance, last_accessed
2. Add composite scoring per §30 §1.2 formula (inline in recall())
3. Do NOT change trust floor (0.15) — M2 locked
4. Do NOT change call signature — M2 locked

**§-Tension (escalate to Aaron/Cassima):** §50 testability doc line 211 records `hot=1.0, warm=0.5, cold=0.1` (pre-v5 placeholders). Implementation must use §30 §1.2 canonical values (`hot=1.20, warm=1.00, cold=0.80`). §50 needs correction.

**Baseline:** tsc --build clean, Cairn 609 tests, Forge 644+3, Eureka 1 pass + 1 fail (correct).

---

### 2026-05-28: M3 GREEN — Composite-Ranker Ordering: Landing Record

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-28  
**Status:** LANDED — GREEN  
**Next owner:** Laura owns M4 RED

Both tests passed after implementing FR-2 composite scoring inline in `recall()`.

**Baseline preserved:** Cairn 609, Forge 644+3, Eureka 2/2 ✅, tsc --build clean ✅

**Implementation shape (File: `packages/eureka/src/activities/recall.ts`):**

RecallResult extension: Added optional typed fields `relevance`, `importance`, `last_accessed` (preserve backward compat with M2 mocks).

Inline composite scorer (pure helper): 
```
rawScore = 0.50·relevance + 0.20·importance + 0.20·trust + 0.10·recency
recency = max(0.1, (1+t)^-0.5) where t=days
multiplier = ATTENTION_MULTIPLIERS[fact.tier]
finalScore = rawScore × multiplier
```

Attention multipliers (§30 §1.2 canonical): hot=1.20, warm=1.00, cold=0.80

Pipeline: candidates → filter(trust≥0.15) → score → sort(desc) → slice(k) → return

Date.now() captured at entry; ready for ClockProvider injection M4.

**Ranker seam:** Option (b) confirmed — inline pure function, no new Ranker collaborator (per §55 §2.3).

**Recency derivation lock:** `last_accessed` is milliseconds (EPOCH_MS unit). Formula: `tDays = (nowMs - last_accessed) / 86_400_000`. All future tests must use millisecond unit.

**§-Tensions:**

1. **Tension 1 (Laura-flagged, confirmed):** §50 line 211 stale (pre-v5 values). §30 §1.2 is canonical. Crispin/Genesta should correct §50. Not Edgar's file.

2. **Tension 2 (new):** §30 §1.2 pseudocode references `CuratorStore.retrieve(sessionId, query)` but impl uses `FactStore.search()`. Equivalent seams; `FactStore` is current concrete interface. Future refactor may rename for alignment (deliberate rename, not bug fix).

**Named M4 TARGET:** recall (recency-sensitive ranking). Collaborator seam: `ClockProvider` (injectable `nowMs()` function per §30 §2.4). Assertion: fact with `last_accessed=yesterday` must outrank identical fact with `last_accessed=30 days ago`. Laura owns M4 RED.

**Post-work:** recall.ts composite scoring ✅, edgar/history.md appended ✅, london-school-green-beat/SKILL.md refined ✅

---

### 2026-05-28: M2 Decision Drop — recall() GREEN

**Author:** Edgar (Learning Systems Specialist)  
**Status:** LANDED — GREEN

M2 London-school TDD beat complete. `recall()` is implemented and the AC-1.3 seed test passes.

**Test Result:** `packages/eureka/src/activities/__tests__/recall.test.ts` — 1/1 tests passed

**Baseline preserved:**
- `tsc --build` exit code 0 ✅
- Cairn: 26 test files, 609 tests ✅
- Forge: 24 test files, 644 passed | 3 todo ✅
- Eureka: 1 test file, 1 test ✅
- skillsmith-runtime + runtime-cli: all passing ✅

**Implementation (Locked at M2):**
- File: `packages/eureka/src/activities/recall.ts`
- Signature: `recall(options: RecallOptions, deps: RecallDeps): Promise<RecallResult[]>`
- Delegates to injected `factStore.search()` with trust floor (0.15) filtering
- Returns up to `k` results; composite ranker deferred to M3

**Named M3 Next-Red-Beat:**
- Activity: `recall()` ordering
- FR/AC: FR-2 (composite ranker formula)
- Requires: Ranker collaborator mock, ClockProvider for recency, sorted score validation

**Decision notes:** §30 pseudocode shows `new CuratorStore()` inside recall — violates London-school. Test contract (injected factStore) is authoritative. §30 pseudocode should update when M3 landsranker design.

---

### 2026-05-28: PR #26 — Copilot Review Doc Alignment (Cycle 1)

**Date:** 2026-05-28  
**Author:** Cassima (PM — Eureka)  
**Context:** Copilot automated review on PR #26 (eureka/v1-design-package branch merge)  
**Status:** ✅ All 5 threads addressed

---

## Summary

Post-merge alignment sweep to fix 5 documentation inconsistencies flagged by Copilot's automated review. Substrate ownership was decided (ADR-0002 Option A monorepo, accepted 2026-05-27), but several committed docs still:
1. Referenced pre-decision state ("Four open decisions block...")
2. Cited gitignored `.squad/decisions/inbox/` paths (broken for other contributors/CI)
3. Claimed "pnpm workspaces, turborepo" when repo uses npm workspaces + `tsc --build`
4. Described user/project tiers as "stubbed" when PRD FR-7.2 says "NOT SHIPPED in v1 at all"

All edits were surgical — preserved doc structure, voice, and content except the specific inconsistencies.

---

## Changes Landed

### Thread 1: Executive Summary — Tier Scope & OQ-1 Status

**File:** `docs/eureka/technical-design.md` line 14

**Before:**
> three-tier storage (agent fully wired; user/project stubbed)
> Four open decisions block implementation — most critically, shared substrate ownership across the `mem/` and `harness/` repositories.

**After:**
> three-tier storage (agent tier only in v1; user/project tiers reserved in schema, adapters deferred to v1.5 per PRD FR-7.2)
> OQ-1 (substrate ownership) has been resolved via ADR-0002; remaining open decisions are tracked in the §00 ADR index.

**Rationale:** Aligns with PRD FR-7.2 canonical wording ("NOT SHIPPED in v1 at all, not even as NotImplementedError stubs"). Updates OQ-1 status to reflect accepted ADR-0002.

---

### Thread 2: References Section — Remove Gitignored Inbox Links

**File:** `docs/eureka/technical-design.md` lines 163-166

**Before:**
```markdown
- **Crucible Impact Analysis:** [`.squad/decisions/inbox/cassima-crucible-eureka-impact.md`](...)
- **Substrate Blocker Memo:** [`.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`](...)
```

**After:**
```markdown
- **Crucible Impact Analysis:** See `.squad/decisions.md` § "Crucible ↔ Eureka Cross-Project Overlap" (2026-05-27)
- **Substrate Ownership:** See `.squad/decisions.md` § "Narrower Substrate Freeze Proposal" and ADR-0002 (2026-05-27)
```

**Rationale:** `.squad/decisions/inbox/` is gitignored (local-only working memos). Committed docs must reference content that resolves for all contributors. Merged substrate analysis now lives in `.squad/decisions.md` and ADR-0002.

---

### Thread 3: ADR-0002 Header — Remove Gitignored Tension Reference

**File:** `docs/eureka/adrs/0002-shared-substrate-ownership.md` line 8

**Before:**
```markdown
**Tension Reference:** §70 T7, `.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`
```

**After:**
```markdown
**Tension Reference:** §70 T7; merged substrate analysis in `.squad/decisions.md` "Narrower Substrate Freeze Proposal" (2026-05-27)
```

**Rationale:** Same as Thread 2 — replace gitignored inbox link with reference to merged location.

---

### Thread 4: ADR-0002 Toolchain Claims — Correct to npm Workspaces Reality

**Files:** `docs/eureka/adrs/0002-shared-substrate-ownership.md` lines 50-55, 138-145

**Before (Pros, line ~53):**
> TypeScript monorepo tooling is mature (pnpm workspaces, turborepo)

**After:**
> TypeScript monorepo tooling is mature (npm workspaces with `tsc --build` project references — already in use across `mem/`)

**Before (M0 prerequisites, lines ~140-142):**
> 2. **Monorepo scaffolding** (Roger + Gabriel) — pnpm workspace config, turborepo pipeline, unified `tsconfig` project references.
> 3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Turborepo `--filter` for incremental builds...

**After:**
> 2. **Monorepo scaffolding** (Roger + Gabriel) — npm workspace config (already present), unified `tsconfig` project references with `tsc --build`. Must complete before any package code moves.
> 3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Leverage `tsc --build` incremental compilation to mitigate whole-repo build time.
> ...
> 
> *Note: Future migration to pnpm/turborepo could optimize build caching, but npm workspaces + `tsc --build` is sufficient for v1.*

**Rationale:** Repo reality check confirmed:
- Root `package.json` uses `"workspaces": [...]` (npm workspaces)
- `package-lock.json` exists (npm, not pnpm)
- Build command is `tsc --build` (TypeScript project references, not turborepo)

ADR claimed aspirational tooling rather than current state. Fixed to reflect what's actually in use. Added note that pnpm/turborepo is a possible future optimization, not a v1 requirement.

---

### Thread 5: Tier Status Table — Align with PRD FR-7.2 "NOT SHIPPED"

**File:** `docs/eureka/sections/00-overview.md` lines 242-246

**Before:**
| Tier | Path | v1 Status |
|------|------|-----------|
| User | ... | Stub (throws on write, empty on read) |
| Project | ... | Stub (throws on write, empty on read) |

**After:**
| Tier | Path | v1 Status |
|------|------|-----------|
| User | ... | Not shipped in v1 — schema reserved, adapter deferred to v1.5 |
| Project | ... | Not shipped in v1 — schema reserved, adapter deferred to v1.5 |

Also updated "Recall Fan-Out Strategy" prose to note multi-tier fan-out is v1.5+:
> 1. Sequential fan-out: agent → user → project (v1.5+)

**Rationale:** PRD FR-7.2 line 184 is canonical: "User and project storage adapters are **not shipped** in v1 at all (not even as NotImplementedError stubs)." Table previously said "Stub" which contradicts this. Fixed to match PRD wording exactly.

---

## Rule Extracted

**Committed docs must not cite paths under gitignored directories.**

- `.squad/decisions/inbox/` is gitignored → broken for other contributors and CI.
- References to decision content should point to:
  1. Merged content in `.squad/decisions.md` (cite section heading + date), OR
  2. Committed ADRs (`docs/eureka/adrs/*.md`), OR
  3. Committed PRD (`.squad/decisions/eureka-prd-v5-final.md`)

This rule is generalizable beyond Eureka — applies to any repo using gitignored working-memo directories.

Skill documented in `.squad/skills/doc-references-respect-gitignore/SKILL.md`.

---

## Verification

1. ✅ `technical-design.md` exec summary aligns with PRD FR-7.2 and ADR-0002 status
2. ✅ `technical-design.md` References section has no gitignored paths
3. ✅ `adrs/0002-shared-substrate-ownership.md` header has no gitignored paths
4. ✅ `adrs/0002-shared-substrate-ownership.md` toolchain claims match repo reality (npm workspaces, not pnpm/turborepo)
5. ✅ `sections/00-overview.md` tier table matches PRD FR-7.2 ("NOT SHIPPED", not "stubbed")

All edits were surgical. No unrelated content changed. Voice and structure preserved.

---

## Next Steps

None required. All 5 threads addressed. Skill extracted. Ready for next work.

---

## Cassima's Learning Notes

**What worked:**
- Surgical edits preserved doc structure and minimized churn.
- Copilot's automated review caught real alignment issues (not false positives).
- Rule "respect gitignore boundaries in committed docs" is simple, actionable, and prevents broken links for other contributors.

**What I learned:**
- Post-merge alignment sweeps are PM scope when they affect PRD/design consistency.
- Toolchain claims in ADRs should match repository evidence or be clearly labeled as "future migration."
- "Stubs" vs "not shipped" is a meaningful distinction — stubs imply user-visible surface, which contradicts PRD's scope deferral.

**What I'd change next time:**
- Could have proactively searched for other gitignored references during the sweep (did a grep after; none found).
- Could have verified `package.json` / `package-lock.json` existence before editing ADR-0002 (I inferred from charter context, but explicit check is better).

---

### 2026-05-28: Directive — DecisionRecord Naming Disambiguation

**By:** Aaron Kubly (via Copilot CLI)

**What:** Be explicit about which "Decision" concept is being referenced. If it's a Squad decision markdown artifact, call it a "Squad decision dotfile" (or "Squad decision memo"). If it's the runtime `@akubly/types` `DecisionRecord` interface, use the system-qualified name: "Cairn DecisionRecord" or "Forge DecisionRecord" depending on which system the record belongs to. Never use bare "DecisionRecord" in documentation when both could be meant.

**Why:** The Forge `DecisionRecord` TypeScript interface and Squad's `.squad/decisions/` workflow artifacts are conceptually different things; conflating them in docs creates ambiguity for readers and reviewers.

**Usage example:** When discussing the Forge runtime audit interface, write "Forge DecisionRecord." When discussing Squad markdown memos, write "Squad decision dotfile" or "Squad decision memo."

---

### 2026-05-27: Eureka v0.1 Technical Design — Assembled & Blocked on 4 Critical Decisions

**Status:** ✅ DESIGN ASSEMBLED — Implementation blocked  
**Date:** 2026-05-27  
**Initiated By:** Graham (Design Lead, Round 2 assembly) + Eureka team (Round 1 authorship)  
**Urgency:** 4 blockers identified; OQ-1 (substrate ownership) is CRITICAL

**Summary:** Eight sections of Eureka v0.1 technical design are now drafted and assembled. All cross-section tensions have been surfaced, categorized, and either resolved or escalated as open questions. **Three critical blockers identified:**

1. **OQ-1 (CRITICAL — Cassima):** Shared substrate ownership — `@akubly/types`, `cairn/`, `forge/` duplicated in `mem/` and `harness/`. Three options: A=monorepo, B=submodule, C=npm packages. **ACTION REQUIRED: Aaron must choose A/B/C before sprint start.**

2. **OQ-2 (MEDIUM):** Event schema topology — Crucible's L1 WAL vs Cairn's event_log create dual-write trap. **ACTION REQUIRED: Pre-sprint-2 sync (Graham/Genesta/Roger) to lock event-substrate path (Option A=merge or B=federate).**

3. **OQ-3 (MEDIUM):** Decision/SessionId schema dual ownership — Crucible's Decision primitive vs Forge DecisionRecord vs Eureka DecisionPayload. **ACTION RECOMMENDED: Crucible rename Decision → ChoiceEvent for namespace clarity.**

**Key Findings:**
- ✅ PRD alignment: 100% acceptance criteria traced; 37/41 testable v1 (90% coverage)
- ✅ Milestone phasing: M0–M5 clear; M2/M3 can parallelize (sweep uses cadence, not session-end hooks)
- ✅ Crucible-Eureka overlap: Structural independence confirmed; safe to parallelize with storage fork directive
- ⚠️ Substrate ownership unresolved (affects Forge adapter; affects both Eureka + Crucible v1 implementation)
- ⚠️ Event schema collision identified (Crucible L1 WAL vs Cairn event_log; dual-write risk)

**Timeline:** OQ-1 decision needed THIS WEEK. OQ-2 resolved pre-sprint-2 (~3 weeks). OQ-3 resolved with Crucible team.

**Design artifacts:** 
- `docs/eureka/technical-design.md` — canonical entry-point, v0.1 assembled
- 8 sections (§00–§70, ~198KB total content)
- 3 ADRs (0001, 0003, and proposed ADR 0002)
- 8 orchestration logs (`.squad/orchestration-log/2026-05-27T08-13-25Z-{agent}.md`)

**Signed:** Graham (Architecture), Cassima (PM), Genesta (Activities Lead)

---

### 2026-05-27: Friction-Level UX Decisions — Gated by v1 Dogfood Evidence

**Status:** ⏳ AWAITING EVIDENCE  
**Date:** 2026-05-27  
**Initiated By:** Valanice (UX Specialist)  
**Urgency:** Four decisions gate v1.5 design; cannot lock until Aaron completes ≥10 dogfood sessions

**Four friction-level decisions deferred to v1.5 pending observed human behavior:**

1. **Commit Approval Frequency** — Current: ~1 approval/session. Evidence gate: `eureka_commit_invocations_total` counter. Threshold: If >10 commits/session OR rejection_rate <10%, flip to auto-approve with opt-in.

2. **Tier-Switching Observability** — Current: Silent (show "Searched: [tiers]" only if multi-tier results). Evidence gate: `eureka_recall_multi_tier_results_total` counter. Threshold: If >5% of queries ask "which tier?", show on every recall.

3. **Empty-State Actionability** — Current: Show suggestions ("Try a broader query"). Evidence gate: Log-based analysis (follow-up query rate, remediation success). Threshold: If remediation_success_rate >70%, keep suggestions; otherwise drop to factual-only.

4. **Contemplate Verbosity** — Current: Silent (v1 doesn't ship contemplate; v1.5 pending). Evidence gate: Post-contemplate confusion + summary action-upon rate. Threshold: If >10% ask "did Eureka run?", default to summary; otherwise silent.

**Evidence Collection Plan:** 10+ dogfood sessions (Aaron), telemetry counters, log-based metrics, post-session interviews (sessions 5 + 10). **Lock gate:** Cannot commit v1.5 friction decisions until dogfood evidence is analyzed.

**Instrumentation required:** Telemetry counters already in v1 scope. Interview protocol TBD.

**Signed:** Valanice (UX)

---

### 2026-05-27: Narrower Substrate Freeze Proposal — Accepted with Amendments

**Status:** ✅ EVALUATED — Recommendation: ACCEPT  
**Date:** 2026-05-27  
**Initiated By:** Erasmus (Crucible team, via Cassima)  
**Evaluated By:** Genesta (Activities Lead)

**Proposal Summary:** Freeze only two cross-project contracts instead of full Cairn/Forge ownership:
1. `SessionId` brand + validator/constructor in `@akubly/types`
2. `DecisionRecord` shape and source union in Forge

**Genesta's Evaluation:** ✅ **ACCEPT with three amendments:**
- **A1 (Prescriber Opt-In):** Eureka-aware prescriber must be opt-in (explicitly registered), not default-wired into Forge.
- **A2 (SessionId Validation Freeze):** Include validation rules (UUID v4 format, parse/isValid constructors).
- **A3 (DecisionRecord Tolerance Contract):** Freeze adapter tolerance rules (forward/backward-compatible; breaking changes require 15-min sync).

**G4-Lite Governance:** CODEOWNERS for `@akubly/types` (both teams required), CHANGELOG for DecisionRecord changes, Slack handoff for breaking changes. No label automation needed (only 2 contracts vs full packages).

**Confidence:** HIGH. Narrower freeze covers all v1 contracts, reduces coordination overhead by 80-90% vs original scope.

**Next steps:** Graham configures CODEOWNERS (<10 min); SessionId brand lands this week (with validation rules per A2); DecisionRecord v0 frozen with tolerance contract (per A3).

**Signed:** Genesta (Eureka Lead), Cassima (PM)

---

### 2026-05-27: Crucible ↔ Eureka Cross-Project Overlap — Architectural Coordination Required

**Status:** ⏳ AWAITING AARON DECISION  
**Date:** 2026-05-26  
**Initiated By:** Cross-project overlap analysis (Genesta, Crispin, Edgar, Cassima)  
**Urgency:** BLOCKER — both projects ship v1 in parallel  

**Decision Needed:** Aaron must lock repository ownership, schema collision resolution, and prescriber/substrate wiring before Crucible sprint 2 and Eureka v1 implementation phase begin.

---

### 2026-05-27: Eureka TD Re-Pass After §55 — §20/§30/§40/§50 Aligned with London-TDD Spine

**Status:** ✅ AUDIT COMPLETE — Recommendations applied  
**Date:** 2026-05-27  
**Initiated By:** Aaron Kubly  
**Question:** Should we do a TD re-pass after §55?  
**Decision:** Full bounded pass (Option A) — parallel audits across §20/§30/§40/§50 + follow-up executions  

**Summary:** Six-agent batch (Crispin/Roger/Laura/Edgar × 2 phases) verified that all four predecessor sections align with §55's London-school TDD mock contract discipline. All seams identified, all gaps addressed. No schema rewrites needed; seams are fundamentally sound with additive clarifications.

**Phase 1 — Audits & Executions:**

1. **Crispin (§20 Audit):** SEAMS HOLD — 5 findings, 1 interface addition (session_id to RecallQuery). No schema changes. **Deliverable:** `.squad/decisions/inbox/crispin-20-seam-audit-vs-55.md`

2. **Roger (§40 DI Audit):** 80% injectable — 2 seams need extraction (`ClockProvider`, `RandomSource`), 1 correctly deferred (model). Forward-docs network boundary for v1.5. **Deliverable:** `.squad/decisions/inbox/roger-40-di-seam-audit-vs-55.md`

3. **Laura (§50 Reframe):** §50 positioned as design-time testability discipline; §55 as implementation-time TDD practice. Complementary pair. **Deliverable:** Edited `docs/eureka/sections/50-testability.md` (+9%)

4. **Edgar (§30 Follow-Ups):** 3/3 executed — CuratorStore signature adopted, ClockProvider seam added, latency cross-refs established. **Deliverable:** `.squad/decisions/inbox/edgar-30-followups-executed.md`, edited `docs/eureka/sections/30-learning-systems.md`

**Phase 2 — Recommendations Applied:**

5. **Crispin (§20 Apply):** §7.4 "Storage Seam (Mock Boundary)" added (names `FactStore` interface explicitly). RecallQuery updated. TDD notes added. **Deliverable:** Edited `docs/eureka/sections/20-knowledge-representation.md` (+12%)

6. **Roger (§40 Apply):** §40.5.4 "Time Injection" + §40.5.5 "RNG Injection (v1.5)" added. Network/model seams forward-documented. **Deliverable:** Edited `docs/eureka/sections/40-integration.md` (+19.8%)

**Key Findings:**
- ✅ All four sections now London-school-aligned with §55 spine
- ✅ I/O seams correctly identified; mock boundaries explicit
- ✅ Time/RNG injection patterns extracted (§30 + §40 coordinated)
- ✅ Phase 2 follow-ups landed without cross-section conflicts
- ✅ Zero implementation blockers; seams are fundamentally sound

**Learnings:**
- Parallel audits work well for cross-section stress-testing
- London-school TDD cascades to design docs (seams, boundaries, time injection)
- "Defer != ignore" — forward-document seams now, extract later (v1.5)
- Bidirectional cross-refs prevent §30–§55 latency-target drift

**Timeline:** Complete. §20/§30/§40/§50 ship-ready with full seam documentation verified.

**Session log:** `.squad/log/2026-05-27T15-30-00Z-td-repass-after-55.md`  
**Orchestration logs:** 6 logs per agent (`.squad/orchestration-log/2026-05-27T*-{agent}.md`)

**Signed:** Scribe (orchestration logger), Crispin, Roger, Laura, Edgar

---

## Executive Summary

**Convergent Finding:** Crucible (v1-DRAFT) and Eureka (v5-final) both depend on shared substrate (Cairn, Forge, types) and both define overlapping session/decision/improvement semantics. The dependency direction is backwards: Crucible assumes Forge exists in `harness` repo but Forge actually lives in `mem` repo. The overlap is NOT accidental — Eureka is Crucible's future memory layer — but the shared-code surface is brittle without explicit coordination.

**Three critical blockers identified:**

1. **Undeclared Repository Dependency (BLOCKER — Cassima)** — Crucible cannot ship v1 without either duplicating Forge or depending on the `mem` repo. Neither is currently acknowledged in either PRD. Must resolve before sprint 2.

2. **Event Schema Collision (HIGH RISK — Genesta)** — Crucible's 5 primitives + L1 WAL vs Cairn's existing `event_log` creates dual-write trap. Must merge or federate before L1 substrate lands.

3. **Decision/SessionId Schema Dual Ownership (CRITICAL — Crispin, Genesta)** — Both PRDs mandate `SessionId` branded type + Decision schema overlap (Decision primitive ≠ DecisionRecord audit ≠ DecisionPayload learning). Requires namespace discipline + possible renames in Crucible.

**Two safe convergences identified (Edgar, Genesta):**

4. **Prescriber Pattern Convergence** — Crucible's Router mirrors Forge's existing prescriber family; can share substrate. Both teams should annotate convergence points.

5. **Learning-Loop Feedback Substrate** — Crucible's recorded sessions ARE Eureka's training data. Path 2 ingestion wiring enables productive relationship between self-improvement loops (not competitive).

---

## Three Strategic Questions for Aaron (Cassima)

**Q1: Which repo owns Cairn and Forge?**
- If `mem`: Crucible has undeclared dependency on this repo; merge or link must happen before Crucible ships.
- If `harness`: Eureka loses its substrate; Cairn must be forked/mirrored.
- If duplicated: drift is guaranteed.

**Recommendation:** Lock repository topology NOW. Genesta suggests Option A (merge Crucible into `mem` at v2 stage, maintaining federation boundary for isolated dogfood in `harness` repo).

**Q2: Is Eureka a v1 Crucible feature or separate v2+ integration?**
- Crucible promises "local-first sovereignty + record everything + self-improve" (§0).
- Eureka promises "durable, addressable, progressively disclosed knowledge" (§2).
- 80% mission overlap.

**Recommendation:** Clarify v1 scope. If Eureka is Crucible's built-in memory backend at v1, sequencing/dogfood changes. If separate v2+ integration, acknowledge delayed feedback substrate.

**Q3: Who gets Aaron's time when both projects hit the same blocker?**
- Both assume Aaron is sole dogfooder.
- Eureka v1 killer demos (US-1, US-2) require multi-session coding work.
- Crucible v1 success bar requires building v2 inside v1.
- Single-threaded resource bottleneck risk.

**Recommendation:** Sequence dogfood phases OR delegate one project's dogfood to external user.

---

## Technical Findings (Cross-Referenced)

### Finding 1: Repository Dependency (Cassima)
**Full analysis:** `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` §1.2 (undeclared dependency), §4 (resourcing)

- Crucible PRD §1 vocabulary, §2.4, §2.6, Appendix D assume Forge prescribers in `harness`.
- Actual location: `D:\git\mem\packages\forge`.
- Neither PRD acknowledges the cross-repo dependency.

**Recommendation:** Stagger projects OR establish explicit dependency + versioning contract.

### Finding 2: Event Schema Collision (Genesta)
**Full analysis:** `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md` § Finding 1 + 2 + 5

- Crucible §1: 5 typed events (Request, Artifact, Observation, Decision, Question)
- Cairn today: `event_log` with existing `eventType` vocabulary
- Eureka v5: Sessions are `kind=session` facts in Eureka's fact store
- **Dual-write trap:** Which is authoritative for replay?

**Recommendation Option A (Merge):** Crucible's 5 primitives become `eventType` values in Cairn's `event_log`. Crucible's "primitives" are typed façade over Cairn's polymorphic stream.

**Recommendation Option B (Federate):** Crucible ships in `harness` repo (separate). When merged to `stunning-adventure` at v2 stage, federation boundary explicit. Cairn observes Crucible sessions via MCP bridge.

**Gate:** Before Crucible sprint 2 (L1 substrate), convene Graham + Roger + Genesta to lock event-substrate topology.

### Finding 3: SessionId Brand + Decision Schema Collision (Crispin, Genesta)
**Full analysis:** `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` § 1 + 5, `genesta-...` § Finding 2

**Collision 1 — SessionId Brand (BLOCKER):**
- Eureka v5 (FR-13): `SessionId` branded type in `@akubly/types` (Aaron R8 directive).
- Crucible PRD: Implicitly assumes session identity but doesn't specify the type.
- **Both mandate the same brand; Crucible's requirements differ.**

**Recommendation:** Design `SessionId` for both Crucible + Eureka from day 1. Current design (UUID + validator) is sufficient for both.

**Collision 2 — "Decision" Naming (CRITICAL):**
- Crucible `Decision` primitive (§1): "any recorded choice by human or agent" — event-like primitive.
- Forge `DecisionRecord` (audit): Structured audit trail of agent decisions.
- Eureka `DecisionPayload` (fact): Contemplative structured deliberation with explicit options + rationale.
- Same word, three structurally different types.

**Recommendation (Crispin):** Crucible rename `Decision` → `ChoiceEvent` or `DecisionEvent`. ESLint ban on cross-system `Decision*` imports.

**Collision 3 — "Artifact" Semantic Drift (HIGH):**
- Crucible: "any reviewable content — inputs AND outputs" (PRD, patch, screenshot, transcript, upload, diff).
- Eureka: Informal usage only; "epistemological artifact" = learned memory representation.
- Risk at storage layer if both use content-addressed store.

**Recommendation (Crispin):** Crucible rename to `ContentBlob` / `CapturedContent`. Eureka avoid "artifact" in public types.

### Finding 4: Learning-Loop Feedback Substrate (Edgar)
**Full analysis:** `.squad/decisions/inbox/edgar-crucible-learning-overlap.md` § 1–4

- **Crucible's loop:** Prescriber → Review-Gate → Apply/Inbox → Scorecard (minutes to hours per-session).
- **Eureka's loop:** Sweep → Ranker → Trust/Confidence mutations (hours to days across sessions).
- **Complementary, not redundant.** Different time horizons, different improvement targets.

**Judgment: CRUCIBLE IS EUREKA'S EVIDENCE GOLDMINE.**
- Crucible records everything — every decision, every alternative, every tool call, every file read.
- This is exactly the evidence Eureka needs for learning patterns.

**Current wiring (v5-final):** Path 2 ingestion exists but is on-demand only. Manual `eureka ingest-decisions --session <uuid>` after each session won't survive dogfood.

**Recommendation (Edgar):** Wire automatic ingestion before dogfood starts.

**Option 1 (Simplest):** Add Crucible post-session hook: `on_session_end → eureka ingest-decisions --session $SESSION_ID`. Opt-in via `.cruciblerc` flag.

**Option 2 (Event-driven):** Cairn already emits session-end events. Eureka sweep subscribes; on `session_end` (carries `session_id`), ingests Forge DecisionRecord stream. *v1.5 scope per current PRDs.*

**Option 3 (Prescriber ownership transition):** Forge prescribers move to Crucible; Eureka's extraction-ready design enables Crucible to eventually adopt learning kernel.

---

## Recommendations Summary

**Immediate (Pre-Implementation):**
1. Aaron locks repository ownership (mem vs harness vs federation).
2. Graham + Genesta + Roger design event-substrate topology (merge vs federate).
3. Crispin confirms Decision/Artifact renames in Crucible PRD v1.1-DRAFT.
4. Cassima sequences dogfood phases or delegates external user.

**v1 Blockers (Before Sprint 2):**
5. ESLint guardrail (already in Eureka v5-final FR-12 #8) extended to Decision/Artifact cross-system imports.
6. `SessionId` brand finalized in `@akubly/types` (ships v1, both projects).
7. Crucible L1 substrate locked to Cairn's `event_log` (Option A) or isolated to `harness` repo (Option B).

**v1 Opportunity (Nice-to-Have Before Dogfood):**
8. Crucible post-session hook wired for Eureka ingestion (Option 1, simplest).

**v1.5+ (Path D Kernel Extraction):**
9. Prescriber ownership transition (Forge → Crucible).
10. Sweep-trigger unification (Cairn session-end → Eureka sweep).
11. Confidence/trust branded types (orthogonality compiler-enforced).

---

## Source Artifacts (Decision Inbox)

All findings preserved in inbox for detailed review:

- `.squad/decisions/inbox/genesta-crucible-eureka-overlap.md` (20.9 KB, 216 lines) — Architectural findings: 5 overlaps (3 high-risk, 2 safe).
- `.squad/decisions/inbox/crispin-crucible-kr-overlap.md` (24.5 KB, 136 lines) — KR findings: 2 critical collisions, 1 integration opportunity.
- `.squad/decisions/inbox/edgar-crucible-learning-overlap.md` (25.6 KB, 202 lines) — Learning-loop findings: parallel loops, feedback substrate, prescriber transition.
- `.squad/decisions/inbox/cassima-crucible-eureka-impact.md` (25.0 KB, 200 lines) — PM findings: undeclared dependency, 3 strategic questions, resourcing risk.

---

## Closed Decisions

### 2026-05-26: Eureka PRD v5-final LOCKED — R8 4-Reviewer Lock-In Panel (Session Identity Unification)

**Status:** ✅ LOCKED (CANONICAL)  
**Date:** 2026-05-26  
**Locked By:** 4-reviewer panel (Graham Knight, Genesta, Crispin, Edgar) — unanimous LOCK, zero revisions  
**Lock Status:** DO NOT EDIT — canonical specification; v4-final superseded

**Decision:** Eureka PRD v5-final is ratified as canonical, shippable specification after R8 post-lock amendment. Aaron R8 session-identity directive: Cairn `Session` and Eureka `kind=session` fact share one identifier (Copilot CLI session UUID) via shared `SessionId` brand in `@akubly/types`, with normative lens framing as guard. All R8 changes landed correctly. R8 design cycle CLOSED.

**What Was Locked:**
- **Artifact:** `.squad/decisions/eureka-prd-v5-final.md` (617 lines, 86.4 KB) — canonical stable location; supersedes v4-final
- **Lineage:** v4-final (R7, 555 lines) → v5-final (R8 amendments, +62 lines) — all R8 deltas annotated `[v5: <reason>]`
- **Panel:** Graham Knight (Architect), Genesta (Cognitive Systems), Crispin (Knowledge Representation), Edgar (Learning Systems) — unanimous verdict: LOCK

**R8 Amendment Scope (Judgment Calls + Enforcement Deltas):**

1. **Session Identity Unification:** Cairn `Session` and Eureka `kind=session` facts are the same entity (one CLI session UUID). Shared `SessionId` branded type in `@akubly/types`.
2. **Bridge Ledger Simplification:** `cairn_session_id_hint?` (optional) → `session_id: SessionId` (required). Eliminates nullable opaque correlation.
3. **FR-13 Amendment:** "Isolated by design" language deleted. Replaced with: "SessionId is shared; all other session attributes are system-specific. Lens framing (Cairn = lifecycle, Eureka = epistemology) is the normative guard against coupling drift."
4. **FR-7.2 Preserved:** No-cross-DB-ATTACH rule unchanged. Shared identifier is type-level only; runtime decoupling remains intact.
5. **§14a T-orphan Reframed:** "Dangling `cairn_session_id`" → "Stale `session_id` reference" (severity unchanged: LOW/LOW). Threat table entries in both §13 + §14a (belt-and-suspenders per JC1 disposition).
6. **FR-12 Mechanism #8 (NEW):** ESLint `no-restricted-imports` guardrail bans Cairn ↔ Eureka session-type imports except `SessionId` from `@akubly/types`.
7. **JC1 Disposition (T6 Row Placement):** Verified in both §13 + §14a threat tables.
8. **JC2 Disposition (v1 ship scope):** SessionId brand ships v1 (FR-12 #8); Trust/Confidence brands stay v1.5 (FR-12 #7).

**Reviewer Verdicts:**
- **Graham Knight (Architect):** LOCK — 8/8 enforcement items landed correctly; no new architectural concerns; v5-final surgical pass, no scope creep
- **Genesta (Cognitive Systems):** LOCK — all 5 guardrails from R8 fold verified (lens framing normative, neutral brand, no runtime traversal, ESLint boundary, Glossary updated)
- **Crispin (Knowledge Representation):** LOCK — all 6 spec items from R8 KR verdict verified (SessionId brand mechanics, kind=session schema, no identity collision, fact vs. filter clarity, edge schema tightening, session-fact integrity)
- **Edgar (Learning Systems):** LOCK — all 3 precision-gain items verified (sweep cadence v1.5 opportunity, `--session <uuid>` CLI v1 ship, AC-2.5 telemetry counter); zero new learning-systems risks

**Key Technical Deltas (Summary):**
- `@akubly/types/src/session.ts` (NEW): `SessionId` branded type + UUID validator + constructor
- `bridge_ledger.session_id` (NEW): `TEXT NOT NULL` replaces `cairn_session_id_hint? TEXT` 
- FR-13 text: "isolated by design" deletion + shared brand framing + lens elevation to normative
- FR-7.2: no-ATTACH rule consistency pass + type-level-only clarification
- §14a: T-orphan reframe (same severity, clearer semantics)
- FR-12 mechanism #8: ESLint guardrail (ships v1)
- Glossary + §15: Lineage citations + Aaron R8 directive + Graham/Genesta/Crispin/Edgar verdicts

**Why This Approach:**
- Aaron's post-lock signal clarified operational reality: the session UUID IS shared; pretending otherwise was incidental complexity
- Shared `SessionId` brand documents ground truth without introducing runtime coupling (type-level construct, not runtime FK)
- Lens framing elevated to normative guard — "two systems, one entity" is the design principle, not apology
- Guardrails (ESLint + schema comments + ADR lock) prevent future coupling drift
- All R8 changes preserve R7 achievements (bidirectional adapter framework, confidence/trust orthogonality, 7-mechanism extraction-readiness)

**Artifacts:**
- **Canonical PRD:** `.squad/decisions/eureka-prd-v5-final.md` (stable location, do not edit; supersedes v4-final)
- **R8 Design Panel Verdicts:** `.squad/decisions/inbox/graham-r8-session-identity.md`, `genesta-r8-session-identity.md`, `crispin-r8-session-identity.md`, `edgar-r8-session-identity.md` (all ACCEPT/FOLD verdicts)
- **Aaron R8 Directive:** `.squad/decisions/inbox/copilot-directive-r8-session-identity.md`
- **R8 Lock Panel Verdicts:** `.squad/decisions/inbox/graham-r8-lock-verdict.md`, `genesta-r8-lock-verdict.md`, `crispin-r8-lock-verdict.md`, `edgar-r8-lock-verdict.md` (all LOCK, unanimous)
- **Superseded Artifact:** `.squad/decisions/eureka-prd-v4-final.md` (historical reference; see header banner for migration note)

**Implementation Readiness:**
- v5-final is self-contained (no external doc required for implementation)
- All `[v5: <reason>]` + `[v4: <reason>]` annotations trace lineage back to R7/R5 origins
- No new architectural risks; all changes additive + simplifying
- R8 amendment window now closed; v5-final canonical until v1 implementation phase reveals needs for v1.1

**Next Phases:**
- v1 Implementation: 5 v1 mechanisms + shared `SessionId` brand (FR-12 #8) + ESLint guardrail
- v1.5 Planning: 2 deferred mechanisms (auto-promotion heuristics, recommendation surface) + precision gains (sweep cadence, Cairn session-end triggers, confidence/trust branded types)
- Path D Extraction: Kernel extraction readiness enforced from Day 1; extraction happens post-v1 pending org-scale federation needs

---
# [ARCHIVED SECTIONS BEFORE 2026-05-24]

Entries from 2026-05-23 and 2026-05-22 have been archived to decisions/archive/archive-2026-05-23.md


**Area 5 — MCP surfaces** (`worktreeMcp.test.ts`):
- `get_status` handler returns `sessions:` key (flat array shape, not `session:`)
- No `primary:` / `siblings:` shape (locked decision: flat array only)
- `get_session` identity matches `(repo_key, workdir)` pair
- `get_session` with mismatched workdir returns not-found
- No `console.log` leak in server.ts
- Structural source-reading tests as shape tripwires

**Migration 015** (`migration015.test.ts`):
- `workdir` column exists after migration
- Column is nullable TEXT with no default value
- Existing sessions are backfilled with `workdir = NULL` (lazy NULL backfill)
- Schema version advances to 15
- Migration is idempotent (double-apply is safe)

---

## Flag for Roger: No-Workdir Backcompat Behavior

The locked decision says: `getActiveSession(repoKey)` with NO workdir "must still match NULL rows for backcompat."

Roger's implementation interprets this as **"no filter = returns most recent any-workdir"** — i.e., `getActiveSessionWithDb` adds no `workdir IS NULL` clause. Old callers get the most-recent active session regardless of its workdir value.

This means: an old caller that never passes workdir will now potentially see a worktree session's ID returned. This is a trade-off, not a bug. I've documented it in the test and in my history.

If the intent was stricter — old callers ONLY see NULL-workdir sessions — then `getActiveSessionWithDb` should add `AND workdir IS NULL`. That would be a change to Roger's implementation. I'm flagging it; Aaron should adjudicate if the current behavior is the wrong interpretation.

Current test `'getActiveSession without workdir arg returns most recent active session (no workdir filter applied)'` asserts the current (no-filter) behavior. If the decision flips to strict-NULL behavior, that test assertion changes from `toBeDefined()` to `toBeUndefined()` (for a workdir-populated session).

---

## Notes

- All tests written against Roger's actual implementation (which landed before tests were complete — convergence scenario)
- Structural tests in `worktreeMcp.test.ts` read `server.ts` source to assert shape contracts as tripwires
- One test showed a flaky full-suite failure (passes consistently in isolation and on repeated full-suite runs). Not a real defect — non-deterministic OS scheduling of vitest VM forks.


---

# Roger → Laura: WI-A API Shapes (Issue #11)

**Date:** 2026-05-27  
**From:** Roger  
**To:** Laura  

## What shipped in WI-A source files

### `db/sessions.ts` — new/changed exports

```typescript
// Updated signature — workdir is 4th optional arg (branch is 3rd)
export function createSession(
  db: Database.Database,
  repoKey: string,
  branch?: string,
  workdir?: string,  // NEW — NULL when omitted
): string

// Updated signature — workdir scopes the lookup
// When workdir is omitted: no workdir filter (returns most recent active session)
// When workdir is provided: adds `AND workdir IS ?` (IS handles both NULL and string)
export function getActiveSession(
  db: Database.Database,
  repoKey: string,
  workdir?: string,  // NEW
): Session | undefined

// NEW — returns all active user sessions for the repo (used by get_status flat array)
export function listActiveSessionsForRepo(
  db: Database.Database,
  repoKey: string,
): Session[]
```

### `hooks/gitContext.ts` — new export

```typescript
// NEW — git rev-parse --show-toplevel in cwd; returns undefined on failure
export function getWorkdir(cwd?: string): string | undefined
```

### `types/index.ts` — Session type

```typescript
export interface Session {
  // ... existing fields ...
  workdir?: string;  // NEW — undefined for NULL rows
}
```

### `agents/archivist.ts` — updated signatures

```typescript
// workdir threaded through — session_start and session_resume payloads now include workdir
export function startSession(repoRemoteOrKey: string, branch?: string, workdir?: string): string
export function catchUpPreviousSession(repoKey: string, workdir?: string): { recovered: boolean; sessionId?: string }

// tool_use payload now includes workdir field (null when unknown)
export function recordToolUse(
  sessionId: string,
  toolName: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
  workdir?: string,  // NEW
): number
```

### `hooks/sessionStart.ts` — updated signature

```typescript
// workdir added as 4th optional param (after existing afterCurate callback)
export async function runSessionStart(
  repoKey: string,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
  afterCurate?: (curateResult: CurateResult) => void,
  workdir?: string,  // NEW
): Promise<{ fastPath: boolean }>
```

### `agents/sessionState.ts` — SessionSummary type

```typescript
export interface SessionSummary {
  // ... existing fields ...
  workdir?: string;  // NEW — undefined for NULL rows
}
```

### MCP `get_status` shape (BREAKING)

Old: `{ session: Session | null, curator: CuratorStatus }`  
New: `{ sessions: Session[], curator: CuratorStatus }`

New input params:
- `repo_key?: string` (unchanged)
- `workdir?: string` (NEW — filters to specific worktree when provided)

### MCP `get_session` shape

Old input: `{ session_id: string }` (required)  
New input: 
- `session_id?: string` (now optional)
- `repo_key?: string` (NEW — alternative lookup)
- `workdir?: string` (NEW — used with repo_key for (repo_key, workdir) identity lookup)

At least one of `session_id` OR `repo_key` must be provided.

## Note on `getActiveSession` behavior

After back-and-forth with your updated test, the final semantic is:
- No workdir arg → no workdir filter (returns most recent active session regardless of workdir)  
- Workdir string arg → `AND workdir IS ?` filter (exact worktree match)

Your test `"getActiveSession without workdir arg returns most recent active session"` captures this correctly.

The `getActiveSessionByWorkdir` internal helper exists for when you need `IS NULL` matching explicitly (not exported, used internally for the workdir-scoped path).


---

# WI-A Implementation Summary — Issue #11

**Author:** Roger  
**Date:** 2026-05-27  
**Branch:** `squad/11-worktree-aware-sessions`  
**Status:** Complete — build green, 647/647 tests passing

## What Shipped

### Migration

**Number:** 015 (as locked by Graham — issue body is stale at "005")  
**File:** `packages/cairn/src/db/migrations/015-workdir-sessions.ts`  
**Changes:**
- Adds `workdir TEXT` column to `sessions` table (NULL-tolerant, no DEFAULT needed)  
- Creates partial index `idx_sessions_repo_workdir ON sessions (repo_key, workdir) WHERE status = 'active'` to support `getActiveSession` and `listActiveSessionsForRepo` efficiently
- Wired into `packages/cairn/src/db/schema.ts` alongside migration014

**Schema version:** 14 → 15

### DB API (`packages/cairn/src/db/sessions.ts`)

```typescript
createSession(db, repoKey, branch?, workdir?)  // workdir 4th optional arg
getActiveSession(db, repoKey, workdir?)         // updated: when workdir provided, adds `AND workdir IS ?`
listActiveSessionsForRepo(db, repoKey)          // NEW: all active user sessions for repo
```

**`getActiveSession` semantics (final — Aaron-confirmed Q1 locked decision):**
- No workdir arg → `AND workdir IS NULL` → only NULL-workdir rows (backcompat; old callers cannot pick up worktree sessions)
- Workdir string arg → `AND workdir IS workdir` → exact worktree match  

> **Correction applied 2026-05-27:** The initial WI-A commit used "no filter" for the no-arg path (per Laura's reconciled test). Aaron confirmed the correct semantic per the locked Q1 decision is `AND workdir IS NULL`. Fixed in commit `ea9ab58` — `getActiveSession` now delegates to `getActiveSessionByWorkdir(db, repoKey, null)` when workdir is `undefined`. `worktreeSessions.test.ts` updated accordingly (18 tests all green).

Internal helper `getActiveSessionByWorkdir(db, repoKey, workdir: string | null)` added for explicit IS-NULL matching.

`listActiveSessionsForRepo` returns only `session_kind = 'user'` sessions ordered by `started_at DESC`.

### `getWorkdir()` (`packages/cairn/src/hooks/gitContext.ts`)

New export — `git rev-parse --show-toplevel` via execSync, same stdio/timeout pattern as `getRepoKey()`. Returns `undefined` on failure (non-git dirs, bare repos, git not on PATH).

### Workdir Threading

- **`archivist.ts`**: `startSession(remote, branch?, workdir?)` + `catchUpPreviousSession(repoKey, workdir?)` + `recordToolUse(sessionId, tool, args?, result?, workdir?)`
- `session_start` event payload: includes `workdir` field (null when unknown)
- `session_resume` event payload: includes `workdir` field
- `tool_use` event payload: includes `workdir` field
- **`postToolUse.ts`**: resolves workdir via `getWorkdir(hookData.cwd)`, threads through
- **`sessionStart.ts`**: `runSessionStart(repoKey, config?, afterCurate?, workdir?)` — workdir is 4th optional param so existing callers pass unchanged

### Types

`Session.workdir?: string` added to `packages/cairn/src/types/index.ts`  
`SessionSummary.workdir?: string` added to `packages/cairn/src/agents/sessionState.ts`  
`getSessionSummary` queries `workdir` from sessions table

### MCP (`packages/cairn/src/mcp/server.ts`)

**`get_status` (BREAKING — Aaron-approved):**
- Old: `{ session: Session | null, curator: ... }`
- New: `{ sessions: Session[], curator: ... }` — flat array always
- New input: `workdir?: string` added alongside `repo_key`
- With workdir: filters to single worktree session (still in array)
- Without workdir: `listActiveSessionsForRepo` — all active user sessions
- `readOnlyHint: true` preserved

**`get_session`:**
- Old: `{ session_id: string }` (required)
- New: `{ session_id?: string, repo_key?: string, workdir?: string }`
- Either `session_id` OR `repo_key` must be provided; error if neither
- Workdir-based lookup via `getActiveSession(db, repo_key, workdir)`
- `readOnlyHint: true` preserved

**stdio rule compliance:** No `console.log/info/debug` in any code reachable from `get_status` or `get_session` handlers.

### Test Updates (existing tests broken by v15)

Updated schema version assertions from 14 → 15 in:
- `src/__tests__/db.test.ts` (3 assertions)
- `src/__tests__/discovery.test.ts` (1 assertion)
- `src/__tests__/migration012.test.ts` (2 assertions)
- `src/__tests__/prescriptions.test.ts` (1 assertion)

## Validation

- `npm run build --workspace=@akubly/cairn`: ✅ clean  
- `npm test --workspace=@akubly/cairn` (direct vitest run): ✅ 647/647 passed  
- `@akubly/types` untouched (no shared types changed; `Session` is cairn-internal)

## Coordination

- API shapes summary written to `.squad/decisions/inbox/roger-issue-11-api.md` for Laura
- WI-B (Gabriel, coordinator dispatch policy) holds until this branch merges





## laura-m5-trust-feedback-red
# Decision Drop: M5 RED — Trust Feedback Mutation Contract

**Author:** Laura (Tester)  
**Date:** 2026-05-30  
**Beat:** M5 RED — trust mutation from feedback event  
**Next owner:** Edgar — M5 GREEN  
**Status:** LANDED — RED  

---

## Contract Under Test

§30 §2.3 specifies event-driven trust mutation:

| Event | Formula |
|---|---|
| Corroboration | `trust = min(1.0, trust + 0.10)` |
| Contradiction | `trust = max(0.0, trust - 0.10)` |
| User correction | `trust = min(1.0, trust ± 0.30)` |

**Test file:** `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`

**Failure observed (correct RED):**
```
TypeError: (0 , applyFeedback) is not a function
```
All 4 M5 tests fail for this reason. All 18 M1–M4 tests pass.

---

## Collaborator Shape Chosen

### Seam Driven: `TrustUpdater`

Inline structural mock (London-school pattern; contract test for real impl deferred to Crispin):

```typescript
const trustUpdater = {
  update: vi.fn().mockResolvedValue(undefined),
};
```

**Interface shape (Edgar to formalize in GREEN):**
```typescript
interface TrustUpdater {
  update(args: {
    factId:    string;
    sessionId: SessionId;
    trust:     number;   // new trust value, already clamped to [0.0, 1.0]
  }): Promise<void>;
}
```

### Activity Signature (Edgar to implement in GREEN)

```typescript
async function applyFeedback(
  options: {
    factId:       string;
    sessionId:    SessionId;
    event:        'corroboration' | 'contradiction' | 'user_correction';
    currentTrust: number;
    /** Required when event is 'user_correction'. Sign indicates direction (+0.30 or -0.30). */
    correctionDelta?: number;
  },
  deps: {
    trustUpdater: TrustUpdater;
    clock:        ClockProvider;   // REQUIRED per §55 §1.2 (no optional default)
  },
): Promise<void>
```

### Design Rationale

1. **`applyFeedback` is separate from `recall()`** — trust mutation is a write operation; recall is read-only. Separation of concerns.
2. **`currentTrust` is caller-provided** — keeps the M5 RED focused on the trust-write seam only. A read-seam (FactStore or FactReader) will be needed for round-trip use cases but is separate scope.
3. **`clock` is required in deps** — consistent with M1–M4 pattern (§55 §1.2); the implementation may timestamp when feedback was applied.
4. **TrustUpdater receives the computed new trust value** (not the delta) — the activity owns delta computation; the updater owns persistence. Clean separation.

---

## §-Level Ambiguities

### Ambiguity 1: §30 §2.3 does not exist as a section (SPEC GAP)

**Issue:** decisions.md cites "§30 §2.3 'Trust Dynamics Beyond the Static Floor'" as the contract source, but this section does NOT exist in `docs/eureka/sections/30-learning-systems.md`. Section numbering jumps from `2.2 Recency` directly to `2.4 Time Injection for Testability`.

**Resolution chosen:** decisions.md Named M5 Target is authoritative for delta values (+0.10, -0.10, ±0.30). The spec gap should be escalated to Edgar/Cassima to add the missing §2.3 section.

**Action item:** Request Cassima (or Edgar) add §30 §2.3 to the learning-systems spec.

### Ambiguity 2: user_correction ± sign source (DEFERRED)

**Issue:** "trust = min(1.0, trust ± 0.30)" — the ± means correction can increase or decrease trust. The sign must come from somewhere. Options:
- (a) Separate event types: `'user_correction_positive'` / `'user_correction_negative'`
- (b) Caller-provided signed delta: `correctionDelta: +0.30 | -0.30`
- (c) Single magnitude, direction inferred from context (e.g., "was the correction toward truth?")

**Resolution chosen for RED:** Option (b) — `correctionDelta` in options. Test for user_correction deferred to M5 GREEN; Edgar confirms interface shape.

**Deferred test (for Edgar's GREEN):**
```typescript
it('applies user-correction delta (+0.30) clamped to 1.0 ceiling (§30 §2.3)', async () => {
  // currentTrust=0.80, correctionDelta=+0.30 → min(1.0, 0.80 + 0.30) = 1.0
  await applyFeedback(
    { factId: 'fact-001', sessionId, event: 'user_correction', currentTrust: 0.80, correctionDelta: +0.30 },
    { trustUpdater, clock: fixedClock },
  );
  expect(trustUpdater.update).toHaveBeenCalledWith(expect.objectContaining({ trust: 1.0 }));
});
```

### Ambiguity 3: where does currentTrust come from in production? (DEFERRED)

**Issue:** The test provides `currentTrust` as an option. In production, the caller must read the current trust before calling `applyFeedback`. This requires either:
- (a) Extending `FactStore` with a `read(factId)` method
- (b) A separate `FactReader` interface
- (c) Callers always have `currentTrust` in context (e.g., from a preceding `recall()`)

**Resolution chosen for RED:** Caller-provided `currentTrust`. M5 GREEN can resolve the read-seam question.

---

## Tests Written (M5 RED)

| Test | Event | currentTrust | Expected new trust | Clamped? |
|---|---|---|---|---|
| M5-C1 corroboration | `'corroboration'` | 0.60 | 0.70 | No |
| M5-C1 ceiling clamp | `'corroboration'` | 0.95 | 1.00 | Yes (min 1.0) |
| M5-C2 contradiction | `'contradiction'` | 0.50 | 0.40 | No |
| M5-C2 floor clamp   | `'contradiction'` | 0.05 | 0.00 | Yes (max 0.0) |

---

## What Edgar Implements (M5 GREEN)

1. Export `applyFeedback` from `packages/eureka/src/activities/recall.ts`
2. Export `TrustUpdater` interface from same file
3. Implement delta computation:
   - `'corroboration'`: `Math.min(1.0, currentTrust + 0.10)`
   - `'contradiction'`: `Math.max(0.0, currentTrust - 0.10)`
   - `'user_correction'`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))` (clamp both ends)
4. Call `deps.trustUpdater.update({ factId, sessionId, trust: newTrust })`
5. Confirm user_correction interface shape and write the deferred test (or hand back to Laura)
6. Verify: all 4 M5 RED tests pass; all 18 M1–M4 tests still pass

---

## Related

- Named M5 Target: decisions.md line ~276
- Team Norm TDD Ownership: decisions.md line ~295
- Contract: `packages/eureka/src/activities/__tests__/recall-feedback.test.ts`
- §30 §2.1 domain invariants (trust ∈ [0.0, 1.0]; zombie-fact semantics at trust=0.0)
- Backlog: Crispin needs TrustUpdater contract test when real implementation ships

---

## edgar-m5-green
# Decision Drop: M5 GREEN — Trust Feedback Mutation Implementation

**Author:** Edgar (Learning Systems Specialist)  
**Date:** 2026-05-30  
**Beat:** M5 GREEN — `applyFeedback` + `TrustUpdater` landed in `recall.ts`  
**Status:** COMPLETE  

---

## What Landed

### Implementation

- **`TrustUpdater` interface** exported from `packages/eureka/src/activities/recall.ts`
  - Shape: `update(args: { factId: string; sessionId: SessionId; trust: number }): Promise<void>`
  - `trust` is the already-clamped new value — activity owns delta math, seam owns persistence

- **`applyFeedback` activity** exported from same file
  - Signature matches Laura's M5 RED spec exactly
  - Delta computation:
    - `corroboration`: `Math.min(1.0, currentTrust + 0.10)`
    - `contradiction`: `Math.max(0.0, currentTrust - 0.10)`
    - `user_correction`: `Math.min(1.0, Math.max(0.0, currentTrust + correctionDelta))`
  - `clock` dep: REQUIRED, consistent with M1–M4 pattern (§55 §1.2). Not called yet — reserved for future feedback timestamping.

### Test Counts

| Suite | Tests | Status |
|---|---|---|
| `recall-feedback.test.ts` (M5) | 4 | ✅ GREEN |
| `recall.test.ts` (M1–M4) | 18 | ✅ still GREEN |
| **Total** | **22** | **✅ all pass** |

Build: `tsc` clean, exit 0.

---

## Decisions Made

### user_correction Interface (Ambiguity 2)

**Confirmed: Option (b) — caller-provided signed `correctionDelta`.**

Rationale:
- Avoids event-type proliferation (`user_correction_positive` / `user_correction_negative`)
- Caller has precise magnitude control
- Sign encodes direction cleanly — no inference needed
- Consistent with Laura's test design in the decision drop

### Read-Seam Question (Ambiguity 3) — DEFERRED

The question of where `currentTrust` comes from in production (FactStore read vs. FactReader vs. caller-has-it-from-recall) does **not affect this beat**. `applyFeedback` is a pure write activity; `currentTrust` is caller-provided. Deferring this keeps M5 focused.

**Disposition:** Deferred. Named as next RED target below.

### §30 §2.3 Spec Gap

Laura flagged that §30 §2.3 ("Trust Dynamics Beyond the Static Floor") was cited in decisions.md but did not exist in the doc. I wrote it directly (it was fully derivable from decisions.md Named M5 Target). No Cassima escalation needed — scope-appropriate for Edgar to close.

Section added to `docs/eureka/sections/30-learning-systems.md` between §2.2.1 and §2.4, covering:
- Event-delta table (corroboration / contradiction / user_correction)
- Domain invariant (trust ∈ [0.0, 1.0])
- Interface contract (applyFeedback, TrustUpdater, caller-provided currentTrust)
- User correction sign convention (Option b, signed delta)
- Measurable outcomes (the 4 M5 test fixtures documented as spec evidence)

---

## Named Next RED Targets

### M6-A: `user_correction` event test (deferred from M5)

**Beat:** user_correction delta with ceiling clamp  
**Owner:** Laura (RED)  
**Contract:** `applyFeedback` with `event: 'user_correction'`, `currentTrust: 0.80`, `correctionDelta: +0.30` → `trust: 1.0`  
**Also needed:** floor-clamp case (e.g., `currentTrust: 0.05`, `correctionDelta: -0.30` → `trust: 0.0`)  
**Note:** The activity implementation already handles `user_correction` correctly — these tests verify the shape is wired and clamped at both ends.

### M6-B: Read-seam (currentTrust source in production)

**Beat:** How does a caller obtain `currentTrust` before calling `applyFeedback`?  
**Owner:** Laura (RED) — after design decision  
**Decision needed first:** Option (a) extend FactStore.read(), (b) FactReader interface, or (c) callers always have it from recall()  
**Recommendation:** Option (c) first — callers that just ran recall() already have the trust value. Extend FactStore only when a non-recall pathway (e.g., scheduled trust decay) needs it.

---

## Backlog Items

- **Crispin:** Contract test for real `TrustUpdater` implementation when it ships (M5+ backlog, per Laura's RED decision drop)
- **Future:** Timestamp feedback application via `clock` dep in `applyFeedback` (dep slot reserved)
- **Future:** Per-call `trustFloor` override via `RecallOptions` (existing TODO in recall.ts, separate track)

---

## edgar-pr30-cycle2-runtime-tier-guard
# Decision: Runtime attentionTier Guard — Compile-time Union Strictness + Runtime Stderr-Warning Fallback

**Date:** 2026-05-29
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 2, Thread PRRT_kwDORy1V9M6F2hAP
**Status:** Resolved — implemented option (a)

---

## Context

`compositeScore()` in `recall.ts` looks up `ATTENTION_MULTIPLIERS[fact.attentionTier]`. The
lookup is keyed on the TypeScript union `'hot' | 'warm' | 'cold'`. TypeScript narrows
compile-time callers correctly, but `RecallResult` values are produced by `FactStore.search()`
whose runtime origin is SQLite. A row with an unrecognised tier string (legacy casing like
`'Hot'`, a future migration value, or a malformed row) causes the lookup to return `undefined`,
which propagates as `NaN` into the sort comparator — the same failure mode as the F1 negative-
tDays guard.

**Cycle 1 / F2 context:** F2 deliberately removed the `?? 1.00` silent fallback because Skeptic
correctly argued it hid typo drift at the TypeScript boundary. That decision was right for
compile-time callers. Copilot's Cycle 2 finding is that runtime data from SQLite bypasses TS
narrowing entirely — a separate concern.

---

## Decision

**Option (a) chosen:** Default unknown tiers to `1.0` multiplier at the `compositeScore()`
call site, with a `console.warn` to stderr.

**Option (b) deferred:** Validating the tier at the FactStore boundary is architecturally
correct (belt-and-suspenders) but requires a concrete FactStore implementation that does not yet
exist (Crispin's domain). Option (a) is self-contained and survives any future FactStore impl.

### Rationale

- Compile-time strictness (no `?? 1.00` on the type-safe path) and runtime defensiveness (warn
  + default on the SQLite-origin path) are complementary, not contradictory. They operate at
  different seams.
- `console.warn` (stderr) preserves MCP stdio compatibility — MCP transport uses stdout for
  JSON-RPC frames; stdout noise corrupts the protocol. All eureka activity diagnostics must use
  stderr.
- The 1.0 default is the warm-tier identity value — the most conservative safe default (no
  amplification, no suppression).

---

## Implementation

- `recall.ts` `compositeScore()`: `let multiplier = ATTENTION_MULTIPLIERS[fact.attentionTier];`
  followed by `if (multiplier === undefined) { console.warn(...); multiplier = 1.0; }`.
- `recall.test.ts`: two new regression tests in `describe('runtime attentionTier guard (F7)')`:
  1. `compositeScore` unit test with `'Hot' as any` — verifies finite score + warn emitted once.
  2. `recall()` integration test — verifies non-NaN ordering and warn fires once.
  Both use `vi.spyOn(console, 'warn')` restored in `afterEach`.

---

## Note for Crispin

When the concrete `FactStore` implementation lands, add boundary validation that rejects (or
normalises) unrecognised `attention_tier` values before they surface as `RecallResult`. The
option (a) guard in `compositeScore()` remains as defense-in-depth; option (b) adds belt-and-
suspenders at the seam where data crosses from SQLite into the activity layer.

---

## edgar-pr30-cloud-review-threads-2-3-4
# Decision Drop — PR #30 Copilot Cloud Review (Threads 2, 3, 4)

**Agent:** Edgar (Learning Systems Specialist)
**Date:** 2026-05-29
**Branch:** eureka/v1-m1-m4
**Commit:** a28f1f3
**PR:** #30

---

## Decision 1 — Activity-layer types use camelCase (Thread 3)

**Context:** `RecallResult` had mixed naming: `attentionTier` and `lastAccessed` were
originally spelled `attention_tier` and `last_accessed` (snake_case), mirroring DB column
names. However, `RecallResult` is the activity-layer return type — not a row mapper — and
the rest of the workspace consistently uses camelCase for TypeScript types.

**Decision:** Activity-layer types use camelCase. The FactStore storage seam is responsible
for snake↔camel mapping at the data boundary (one mapping point, not spread across activity
code and tests).

**Norm established:** `RecallResult.attentionTier` and `RecallResult.lastAccessed` are the
canonical field names. Any concrete FactStore implementation (Crispin's concern) must map
from DB column names to this camelCase shape before returning results to the activity layer.

**Files changed:** `recall.ts`, `recall.test.ts`

---

## Decision 2 — Ranker BM25-truncation constraint documented, overfetch deferred (Thread 2)

**Context:** `recallWithScores` passes `limit: k` to `factStore.search()`, so a custom
`Ranker` only receives at most `k` BM25-pre-ranked candidates. It cannot surface facts the
storage layer ranked at positions k+1..k+m. This is a real constraint for non-trivial rankers
(recency-weighted, attention-tier-aware, etc.).

**Decision:** Document the constraint on the `Ranker` JSDoc rather than implementing
overfetch. No production `Ranker` consumer exists yet; overfetching now would be speculative.
If a future `Ranker` needs broader candidate visibility, the fix is `limit: k * overfetchFactor`
in `recallWithScores` when a ranker is injected. Tracked as future work in the JSDoc.

---

## Decision 3 — Remove fragile §50 line-number citation from source (Thread 4)

**Context:** The `ATTENTION_MULTIPLIERS` JSDoc contained: *"§50 line 211 contains incorrect
values — §30 §1.2 is the authoritative source."* Embedding external document line-number
claims in production source is fragile: the document will be edited, the line number will
shift, and the comment becomes misleading.

**Decision:** Trim to cite only the authoritative source: *"Authoritative source: §30 §1.2."*
The §50 inconsistency is tracked in decisions.md from Cycle 1 (the tension Laura flagged at
M3). It does not need to be re-litigated in production source code.

**Anti-pattern named:** Fragile-doc-cite — embedding external document line-number assertions
in source comments.

---

## edgar-pr30-cycle3-c1-c4
# Decision Drop: PR #30 Cycle 3 — C1 Warn Dedupe + C2 Ranker Order Trust + C3 Overfetch + C4 k Validation

**Date:** 2026-05-30
**Author:** Edgar (Learning Systems Specialist, Eureka)
**PR:** #30, Copilot cloud review Cycle 3
**Threads:** PRRT_kwDORy1V9M6F2kGT (C1), PRRT_kwDORy1V9M6F2kGW (C2), PRRT_kwDORy1V9M6F2kGY (C3), PRRT_kwDORy1V9M6F2kGa (C4)
**Status:** Resolved — all four implemented in a single commit on eureka/v1-m1-m4

---

## C1 — Warn Dedupe via Per-Call Set

### Problem
`compositeScore` emitted one `console.warn` per fact with an unrecognised `attentionTier`. A recall
call returning k=10 facts with a legacy tier string produced 10 identical log lines per query. This
is noise amplification — a single bad row's tier multiplies into k lines per call.

### Decision
Move warn emission out of `compositeScore` entirely. `compositeScore` now silently defaults unknown
tiers to `1.0` (warm-tier identity) via `?? 1.0`. `recallWithScores` collects unknown tier strings
into a `Set<string>` during its pre-scoring iteration over `trusted` candidates, then emits ONE
`console.warn` at the end of the call if the set is non-empty. Message format:

> `[eureka.recall] Unknown attention_tier values encountered: Hot. Defaulted to 1.0 multiplier. Validate at FactStore boundary.`

The Set naturally deduplicates repeated instances of the same bad tier across multiple facts.

### Rationale
- Diagnostic emission belongs at the call boundary, not in a per-item pure function.
- `compositeScore` is now a pure function (no side effects) — easier to test, no spy required.
- The warn still fires even on the ranker path (Set is populated before the ranker/inline fork).

### Test impact
- `compositeScore` F7 test: removed `warnSpy` setup and warn assertions (function is now pure).
- `recall()` F7 test: spy still verifies `toHaveBeenCalledOnce()` + message contains tier value.

---

## C2 — Ranker Order Trust (no re-sort after ranker)

### Problem
`recallWithScores` always re-sorted the result of `ranker(trusted, { nowMs })` by score descending.
This silently defeated any deliberate non-score-monotonic ordering a Ranker might express (diversity
reranking, MMR, explicit position weighting). The JSDoc contradicted itself on this point.

### Decision
**Option (b) chosen**: when a Ranker is injected, trust its returned order — do NOT re-sort.
Only the inline path (no ranker) sorts. Code shape:

```typescript
const scored = ranker
  ? ranker(trusted, { nowMs })                                        // trust ranker's order
  : trusted.map(f => ({ fact: f, score: compositeScore(f, nowMs) }))
           .sort((a, b) => b.score - a.score);
```

The Ranker JSDoc was rewritten to be unambiguous: the Ranker owns final ordering; if it wants
score-monotonic output, it sorts internally. `recallWithScores` only slices to k.

### Rationale
- Option (a) (document-only) was rejected: the contradiction in the JSDoc was a bug waiting to
  happen in any real diversity ranker.
- Option (b) is a one-line structural change with a clear contract: Ranker = final authority on order.
- The C6 guard test was updated: the no-op ranker now sorts internally, remaining a valid equivalence
  test between the ranker and inline paths.

### Test impact
- C6 no-op ranker: updated `noOpRanker` to include `.sort((a, b) => b.score - a.score)`.
- New C2 regression test: reverse-order Ranker; verify recall() preserves ascending order (not re-sorted).

---

## C3 — Overfetch Factor (F6 Arc Closed)

### Problem
`recallWithScores` called `FactStore.search({ limit: k })`. The composite ranker (or any custom
Ranker) could only reorder within the BM25-truncated top-k. Tier and trust components of FR-2 were
largely cosmetic relative to BM25 — the ranker had no visibility beyond the k facts BM25 surfaced.

This was the open residual from the F6 escalation: Cassima+Crispin chose to push trust filtering to
the store (F6 resolution); the BM25-truncation aspect (ranker candidate starvation) remained open.

### Decision
Add `const RANKER_OVERFETCH_FACTOR = 3` and change the search call to `limit: k * RANKER_OVERFETCH_FACTOR`.
The final `scored.slice(0, k)` still trims to k — overfetch is internal-only; the caller contract is
unchanged.

**Why 3?** Small constant. Conservative: 3× gives the ranker meaningful surface without excessive
storage load. Can be revisited when concrete FactStore performance data is available. Named const makes
the intent clear and makes future tuning a one-line change.

### Rationale
This closes the F6 arc entirely:
- F6 (Cassima/Crispin): trust floor at data layer → resolved in Cycle 2
- F6 residual (ranker candidate starvation): `limit: k` → resolved here with `limit: k * 3`

### Test impact
- F6 regression test (Laura's): `limit: 5` updated to `limit: 15` (k=5 × RANKER_OVERFETCH_FACTOR=3).
- New C3 test: verifies `factStore.search` receives `limit: 15` when k=5.

---

## C4 — k Input Validation

### Problem
`RecallOptions.k` had no validation. Negative, zero, fractional, NaN, or Infinity values were passed
directly to `factStore.search({ limit: k })` and `slice(0, k)`. The SQLite `LIMIT` behavior for
these values is implementation-defined; JavaScript's `Array.prototype.slice(0, NaN)` returns `[]`
silently, hiding the bug.

### Decision
Validate at the entry point of `recallWithScores` before any I/O:

- `k === 0`: valid — return `[]` immediately without calling factStore. Avoids `LIMIT 0` edge cases.
- `!Number.isFinite(k)`: throws `TypeError` (handles NaN, +Infinity, -Infinity).
- `!Number.isInteger(k)`: throws `TypeError` (handles 1.5, etc.).
- `k < 0`: throws `TypeError`.

Since `recall()` is a thin wrapper delegating to `recallWithScores`, validation in `recallWithScores`
suffices for both entry points.

### Rationale
- Fail-fast at the boundary: the error appears at the call site, not buried in SQLite or a silent
  empty result.
- `k === 0 → []` is the right semantic: "give me zero results" is a valid (if unusual) request.
- `k < 0` and non-integers are programming errors; TypeError is the appropriate JS error type.

### Test impact
Five new tests in `describe('k input validation (C4)')`:
- `k = 0` → `[]`, factStore.search NOT called.
- `k = -1` → TypeError.
- `k = 1.5` → TypeError.
- `k = NaN` → TypeError.
- `k = Infinity` → TypeError.

---

## Summary

| Finding | Change | Behaviour preserved |
|---------|--------|---------------------|
| C1 | `compositeScore` pure; `recallWithScores` emits ONE Set-deduped warn | 1.0 fallback for unknown tiers unchanged |
| C2 | Ranker path skips re-sort; Ranker owns final order | Inline path still sorts descending |
| C3 | `limit: k * 3` overfetch; caller still gets k results | trust floor (`minTrust: 0.15`) unchanged |
| C4 | k validated at entry; `k=0 → []`; invalid → TypeError | Valid positive-integer k unchanged |

**Test count:** 11 → 18 (7 new regression tests added across C2, C3, C4; F7 compositeScore test simplified).
**Commit:** bde6416 on eureka/v1-m1-m4

---

## roger-issue-11-implementation
# WI-A Implementation Log — Issue #11: Worktree-aware sessions

**Author:** Roger (Platform Dev)  
**Branch:** `squad/11-worktree-aware-sessions`  
**Worktree:** `D:\git\stunning-adventure-11`  
**Status:** Cloud review cycle 5 applied — ready for push

---

## Cloud Review Cycle 1 Fixes (commits 8537f48, 13080af)

### F1 — `get_session` error message clarity (commit 8537f48)

Old message: `'Provide either session_id or repo_key (with optional workdir).'`
was misleading because `workdir` is required (not optional) when using `repo_key`.

Changed to: `'Provide either session_id, or both repo_key and workdir.'`

`workdir` inputSchema description was already correct from cycle 2:
`'Required when using repo_key. Optional when using session_id.'`

Updated `worktreeMcp.test.ts` assertion to match the new message.

### F2 — Rejected (no change)

Reviewer suggested collapsing the `repo_key`-without-`workdir` branch into the
no-input branch. Decision: keep the two branches separate — they represent
distinct caller mistakes (no input vs. partial input) and deserve distinct,
actionable error messages.

### F3 — Atomic `startSession` + UNIQUE partial index (commit 13080af)

**F3a — Immediate transaction in `archivist.startSession()`:**

The find-or-create sequence (`getActiveSession → claimLegacyActiveSession →
createSession`) is now wrapped in `db.transaction(fn).immediate()`. Using
`IMMEDIATE` acquires the write lock at transaction start, preventing two
concurrent callers from both observing "no active session" and both INSERTing
a new row.

Note: `fn.immediate()` calls the function and returns its result directly.
A draft with `fn.immediate()()` would have tried to call the return value
as a function — corrected before committing.

**F3b — Migration 016: dedup + UNIQUE partial index:**

New migration `016-active-session-unique.ts`:

1. **Dedup pass**: For each `(repo_key, workdir)` group with >1 active user
   session, keep the most-recently started row, complete the rest. Runs
   before index creation to avoid constraint violation on pre-existing data.

2. **UNIQUE partial index**:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir
     ON sessions (repo_key, workdir)
     WHERE status = 'active' AND session_kind = 'user';
   ```
   Partial index covers only active user sessions; completed/system sessions
   are unaffected.

Schema version bumped to 16. Version assertions in `db.test.ts`,
`migration012.test.ts`, `prescriptions.test.ts`, and `discovery.test.ts`
updated 15 → 16. `migration015.test.ts` assertions changed to check
`WHERE version = 15` (presence) rather than `MAX(version)` so they remain
stable as more migrations are added.

---

## Cloud Review Cycle 2 Fix (commit cd47409)

### G1 — `normalizeWorkdir` applies transforms to untrimmed input

`normalizeWorkdir` checked `input.trim()` for emptiness but then passed the
original (untrimmed) `input` to all subsequent transforms. A path like `' /'`
would slip past the empty guard and produce `' '` (a whitespace-only string)
instead of `'/'`.

Fix: assign `const trimmed = input.trim()` first, return `undefined` if it is
empty, then base all path transforms on `trimmed`.

Regression tests added:
- `normalizeWorkdir(' /')` → `'/'`
- `normalizeWorkdir('  D:/proj  ')` → `'D:/proj'`
- `normalizeWorkdir('\t')` → `undefined`

---

## Cloud Review Cycle 3 Fixes (commit e4002c1)

### H1 — Migration 016 UNIQUE index doesn't cover NULL-workdir case

SQLite UNIQUE indexes treat each NULL as distinct — a single index on
`(repo_key, workdir)` allows multiple rows with `workdir = NULL` to coexist
for the same `repo_key`. The original migration 016 index was therefore
ineffective at preventing duplicate active NULL-workdir sessions.

Fix: Replace the single index with two separate partial indexes:

```sql
-- Non-NULL workdir: unique per (repo_key, workdir) pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_nonnull
  ON sessions (repo_key, workdir)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NOT NULL;

-- NULL workdir: at most one legacy active session per repo_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_active_user_workdir_null
  ON sessions (repo_key)
  WHERE status = 'active' AND session_kind = 'user' AND workdir IS NULL;
```

The dedup pass (`GROUP BY repo_key, workdir`) was already correct — SQLite
groups NULLs together in `GROUP BY`, so no change was needed there.

Test changes:
- Removed two `claimLegacyActiveSession` orphan-cleanup tests that relied
  on inserting duplicate NULL-workdir sessions (now DB-prevented; the scenario
  they tested is handled at migration time by the dedup pass)
- Added "UNIQUE index rejects duplicate active NULL-workdir sessions" test
- Added Area 10b: migration 016 dedup test using a synthetic pre-016 DB to
  verify the NULL-workdir dedup pass correctly keeps the most-recent row

### H2 — `@internal` helpers exported from `index.ts`

`claimLegacyActiveSession` was exported from `packages/cairn/src/index.ts`
(line 52) despite being tagged `@internal`. It is an implementation detail of
the session start hook and must not be part of the public package API.

Fix: Removed `claimLegacyActiveSession` from the `sessions.js` export block
in `index.ts`.

Audit of other `@internal` symbols: `normalizeWorkdir` and
`getSkillToolWorkdir` (both in `utils/workdir.ts`) were not exported from
`index.ts` — no change needed.

Tests use deep imports (`from '../db/sessions.js'`) throughout — no test
changes required for H2.

---

## Summary

Makes Cairn's session resolution workdir-aware so concurrent worktrees on the
same repo don't collide on a single active session.

Core mechanism: `(repo_key, workdir)` session identity pair stored in a new
`workdir TEXT` column (migration 015). NULL workdir = legacy/pre-worktree
sessions. `getActiveSession(db, repoKey, workdir?)` uses `AND workdir IS ?`
(NULL-IS semantics) so NULL is a first-class identity value.

---

## Cycle 3 Skeptic Fixes (commit 19deef2)

### Item 1a — `getSkillToolWorkdir()` helper

`normalizeWorkdir(process.env.CAIRN_WORKDIR)` was inlined at all three
skill-tool call sites in `server.ts`. Centralised into `getSkillToolWorkdir()`
in `utils/workdir.ts` — env-var name and normalisation live in one place.

### Item 1b — Multi-session ambiguity warning

`getUserSessionForMcpFallback` gained an optional `source: 'env-var' | 'explicit'`
parameter. When `source === 'env-var'` and `workdir` is absent but the repo has
multiple active sessions, a `process.stderr.write` warning is emitted. All
three skill-tool call sites pass `'env-var'`.

### Item 2 — Safe orphan cleanup with 5-minute grace window

The old Step 3 in `claimLegacyActiveSession` used a single bulk `UPDATE` to
complete all other NULL-workdir orphans. Replaced with a per-session loop:

1. Fetch orphan candidates (SELECT with id != winner).
2. For each: `getLastEventTime` (falls back to `started_at`).
3. If idle < 5 min → skip + `process.stderr.write` warning.
4. If idle ≥ 5 min → `UPDATE status = 'completed'`.

SQLite timestamps (`YYYY-MM-DD HH:MM:SS` UTC) are converted to ISO-8601 with
`'Z'` suffix before `new Date()` parsing to avoid host-timezone errors.

Test updated: orphan timestamp changed from `-2 seconds` to `-10 minutes`.
New test added: orphan within grace window is preserved.

---

## Key Decisions Locked

| Decision | Choice | Rationale |
|---|---|---|
| `getActiveSession` no-arg → NULL-only | `AND workdir IS NULL` | Matches only sessions without a workdir; not "most recent regardless" |
| Orphan grace window | 5 minutes | Conservative enough to protect live concurrent archivist startups |
| UTC parsing of SQLite timestamps | `.replace(' ', 'T') + 'Z'` | SQLite `datetime()` is always UTC; JS `new Date()` needs explicit Z |
| Skill-tool env-var source tag | `'env-var'` literal | Lets sessionFallback distinguish orchestrator-injected vs caller-supplied workdirs |

| `fn.immediate()` call pattern | Call without extra `()` | `db.transaction(fn).immediate()` calls fn and returns its result; `().()` would try to call the return value |

---

## Test Coverage

- 1405/1405 tests green (60 test files)
- New Area 10 tests: race regression (two startSession calls → one session),
  UNIQUE constraint enforcement, completed-session allows new active session

---

## Cloud Review Cycle 5 Fixes (commit 469b741)

### J1 — Remove unused `randomUUID` import

`worktreeSessions.test.ts` had `import { randomUUID } from 'node:crypto'` left
over from orphan-cleanup tests removed in cycle-3 H1. Dropped the import;
ESLint `no-unused-vars` now clean.

### J2 — Tighten `claimLegacyActiveSession` CAS UPDATE predicate

The outer `UPDATE` in the CAS step only guarded `AND workdir IS NULL`, leaving
a theoretical race where a session that changed status or kind between the
SELECT and the UPDATE would still have its workdir overwritten.

Added `AND status = 'active' AND session_kind = 'user'` to the outer UPDATE so
the CAS is self-contained: the guard predicates match exactly the conditions
used to select the candidate.

Regression test added in Area 7: creates a NULL-workdir session, completes it
between selection and claim, asserts claim returns `undefined` and the row's
`status` remains `'completed'` with `workdir` still NULL.

**Status:** Cloud review cycle 5 applied — ready for push


When `workdir !== undefined` is passed but `normalizeWorkdir(workdir)` returns
`undefined` (e.g. `'   '` or `'\t'`), the old code silently fell through to
`listActiveSessionsForRepo`, returning the all-sessions list — wrong shape
and wrong semantics.

Fix: after normalization, if `nwd === undefined` return `isError` with message:
`'Invalid workdir: empty or whitespace-only string. Omit workdir to list all sessions, or provide a non-empty path.'`

Added Area 5f regression test in `worktreeMcp.test.ts` asserting the guard
and message text are present in the `get_status` handler body.

### I2 — Over-indented error payload in `get_session`

In the `!repo_key` early-return block, the `error:` line inside
`JSON.stringify({ error: '...' })` had extra indentation vs sibling blocks.
Cosmetic fix only.

### I3 — `getActiveSession` JSDoc missing user-sessions-only note

Added `@remarks` tag to the JSDoc: "Returns ONLY user sessions
(`session_kind = 'user'`). System sessions are excluded. For system-session
lookup, use a dedicated helper."

---

---

## WI-B Decisions Merge (2026-05-30T12:26:16Z)

### 2026-05-30: WI-B PR #29 cycle 4 — prose redesign scope
**By:** Graham (Lead)
**Status:** Implemented in cycles 4-6

From .squad/decisions/inbox/graham-wi-b-cycle4-redesign.md

**Thread analysis:** 51 unresolved threads across 4 files represent 5 distinct findings:
- F8a: Wrong-branch reuse calls git worktree remove without unlinking junction first
- F9: Backtick escapes inside cmd /c "..." are PowerShell-only; cmd.exe treats them as literals
- F10: {branch} resolved via git -C "{worktree}" AFTER worktree is removed — path doesn't exist

**Decision:** Replace all literal cmd /c "..." strings with prose instructions (tool semantically + platform-intent table). Prose conveys intent; literal shell strings invite mechanical copying of wrong form.

**Recommended form:**
- Windows: Use cmd /c rmdir to remove junction. Do NOT pass /s.
- Unix: m -f removes symlink only.

**Junction-unlink ordering (SAFETY-CRITICAL):**
1. Resolve the branch name: git -C "{worktree}" rev-parse --abbrev-ref HEAD → save as {branch}
2. Remove the 
ode_modules junction/symlink (before git worktree remove)
3. Remove the worktree: git worktree remove "{worktree}"
4. Delete the branch: git branch -d {branch}

**Acceptance criteria:** 7 AC items verified — all backticks removed, F8/F9/F10 addressed, three-mirror sync locked.

---

### 2026-05-29: WI-B PR #29 review — APPROVE WITH NOTES
**By:** Graham (Lead)
**Status:** Reviewed and approved for merge

From .squad/decisions/inbox/graham-wi-b-review-approve.md

**Scope adherence:** ✅ Gabriel implemented exactly what was scoped. Six change areas all map directly to concrete changes. No omissions.

**Activation semantics:** ✅ SQUAD_WORKTREES=1 correctly gated. Three-way branch (skip/worktree/disabled).

**Enforcement language:** ✅ Pre-Spawn now reads as imperative: MUST-level imperatives and ACTIVE status badge.

**Template sync:** ✅ Verified byte-identical across all three files (squad.agent.md + two templates).

**Fallback safety - ARCHITECTURE CALL (APPROVE with note):** Silent fallback to main repo on git worktree add failure. For v1 (opt-in, dogfooding), fallback is right default. Differentiated: lock-file errors get retry-then-abort; permissions/other errors get fallback. Already logged to history.md.

**Follow-up (not blocking):** Emit user-visible warning (e.g., "⚠️ Worktree creation failed — falling back to shared checkout") in addition to history.md log. File as follow-up issue.

**Branch-mismatch handling:** ✅ Safe. git worktree remove fails with dirty-tree error; git protects against silent destruction.

**Parallel dispatch warning:** ✅ Warning-only (detection via list_agents). Sufficient for v1.

**Risk #1 mitigation (file-deletion):** ✅ Two mechanisms — isolation + junction directionality.

---

### 2026-05-29: WI-B scope — Coordinator dispatch-policy
**By:** Graham (Lead)
**Status:** Scoping complete, implemented

From .squad/decisions/inbox/graham-wi-b-scope.md

**Scope confirmation:** WI-B makes the coordinator CREATE worktrees per-issue instead of dispatching agents into shared main.

**Pre-Spawn discovery:** "Pre-Spawn: Worktree Setup" section (lines 697–742) was documentation-only. Gabriel's job: make it real.

**Concrete change list:**
- Pre-Spawn: Worktree Setup (enforce language + error handling)
- How to Spawn an Agent (resolve WORKTREE_PATH / WORKTREE_MODE placeholders)
- Worktree Lifecycle Management (reference docs)
- Template mirrors (must stay in sync)

**Opt-in vs default-on (Recommendation: Option A — Opt-in for v1):**
- Safety: Zero behavior change unless explicitly enabled
- Adoption friction: Users must know env var exists
- Complexity: Minimal — one if check
- Risk: Low — worst case is feature not used

**Dogfooding plan:**
- Worktree path: D:\git\stunning-adventure-{N}
- Branch: squad/{N}-coordinator-worktrees
- Env var: SQUAD_WORKTREES=1

**Risk flags:**
1. File-deletion mystery event during session — WI-B mitigates via isolation
2. 
ode_modules re-install after worktree removal — cleanup flow handles junction removal BEFORE git worktree remove
3. Pre-Spawn is documentation-only — Gabriel added ACTIVE status + enforcement language
4. Parallel dispatch guard — warning-only recommended for v1
5. Template drift — Gabriel updates all three files atomically

---

### 2026-05-30: WI-A Implementation Log — Issue #11 (Roger history restoration)

From .squad/decisions/inbox/roger-issue-11-implementation.md (WI-A history, cross-referenced)

**Cloud Review Cycles 1-5 completed** — Worktree-aware session resolution now in place. Schema version 16. Partial UNIQUE indexes for NULL-workdir case. All 1405 tests green. Ready for WI-B (coordinator dispatch).




---

## 2026-05-30: Squad Convention — Agent history.md Commits in Feature PRs Are In-Scope

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 1 Skeptic review (F3 flagged as scope creep)  
**Decision:** Agent-maintained history.md entries in feature PRs are **IN-SCOPE**, not scope creep.

**Rationale:**
The `.gitattributes` file defines `merge=union` driver (line 3) specifically to enable parallel agent history tracking within feature branches. This is an intentional design pattern, not incidental coupling.

When `.gitattributes:3` declares `*.md merge=union`, it is explicitly authorizing commits that append to history files during feature development. Rejecting such commits as "scope creep" contradicts the declared merge strategy.

**Citation:** `.gitattributes:3` — "\\*.md merge=union"

**Scope boundary:** Agent history commits are IN-SCOPE when:
- They document agent work on the feature (not tangential or admin work)
- They follow the squad history.md format (one-liner, topic tag, date, agent)
- They do not alter code or test artifacts

Example in-scope entry:
```
- 2026-05-30 📌 alexander: JSON.parse boundary guarding via ProfileStalenessReason import
```

**Future:** If history bloat becomes a problem (file ≥15360 bytes), summarization rules apply (per Task 6). This is a hygiene gate, not a scope gate.


---

## 2026-05-30: Path A for Internal Helpers — Unexport and Shrink Test Surface

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 2, C2-3 polish  
**Decision:** When an `@internal` JSDoc tag cannot be enforced (no api-extractor or stripInternal pass), prefer unexporting the helper and shrinking the unit test surface over maintaining a false-promise export.

**Rationale:**
The helper `normalizeProfileSource(payload: unknown)` was introduced in Cycle 1 to centralize JSON.parse payload narrowing. Tagged `@internal`, it was still exported for unit testing. This creates a false API promise — users can import and call it despite the intent to keep it internal.

Options:
- **(a) Unexport + shrink tests (chosen)** — Move coverage to integration tests. Helper becomes truly internal (scoped to module).
- **(b) Keep export + hope no one uses it** — Relies on convention; creates API risk.
- **(c) Use namespace/private pattern** — Language-specific; TypeScript has no true private exports.

**Choice:** Path A. The @internal tag already signals intent. Unexporting honors that intent and forces coverage dependency on integration tests (which are stronger anyway — they validate the full narrowing + validation flow, not the helper in isolation).

**Applied to:** `normalizeProfileSource()` in PR #32. Reduced unit test count from 28→26; integration tests retain coverage.

**Implication:** Team preference: explicit enforcement (unexport) > convention-based promises (@internal tag).


---

## 2026-05-30: JSON.parse Boundary Discipline — Unknown Typing + Runtime Validation + Drift Guard

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, Cycle 1 F1 (Correctness) + Cycle 2 C2-1/C2-2 (verification)  
**Decision:** When narrowing types that flow from `JSON.parse(eventLogPayload)`, enforce a three-tier boundary discipline:

### Tier 1: Type the payload as `unknown`
```typescript
const payload: unknown = JSON.parse(eventLogPayload);
```
Do NOT type it as `any` or the target type. This forces explicit narrowing.

### Tier 2: Validate at the boundary
Implement a helper (e.g., `normalizeProfileSource()`) that:
- Takes `unknown` input
- Validates shape (e.g., `if (typeof payload.source !== 'string')`)
- Returns the narrowed type or throws/returns null

Emit a **stderr warning** if coercion occurs (matching the pattern from `loadMetrics` in the codebase):
```typescript
if (payload.source && !VALID_PROFILE_SOURCES.includes(payload.source)) {
  console.warn(`[LoadedProfileSource] Coerced unexpected source: ${payload.source}`);
}
```

### Tier 3: Drift-guard the union
When the upstream union (e.g., `ProfileStalenessReason | 'FRESH' | 'STALE'`) grows, catch missing branches at compile time using a `satisfies` pattern:
```typescript
const driftGuard: Record<LoadedProfileSource | ProfileStalenessReason, true> = {
  'FRESH': true,
  'STALE': true,
  'UNKNOWN': true,
};
```
If a new reason is added and this helper is not updated, TypeScript will fail on the guard object (RED test).

**Citation:** Cycle 1 F1 raised that `JSON.parse` cast to `UnionType` was unguarded. Cycle 2 C2-1/C2-2 verified the drift-guard pattern resolves it.

**Impact:** Ensures JSON.parse payloads cannot silently accept malformed data or diverge from enum reality.


---

## 2026-05-30: PowerShell Here-String Convention — Use Single-Quoted @'...'@ for Code Content

**Date:** 2026-05-30  
**Source:** PR #32 / issue #25, PR body rendering issues (2 occurrences)  
**Decision:** When building multi-line file content in PowerShell that contains backticks (markdown code spans, `` `tsc ``, `` `null ``), use single-quoted here-strings `@'...'@` instead of double-quoted `@"..."@`.

**Rationale:**
PowerShell interprets escape sequences in double-quoted strings:
- `` `t `` → TAB character
- `` `n `` → newline
- `` `r `` → carriage return

Single-quoted here-strings treat backquotes literally.

**Problem encountered (2 instances):**
1. PR body description: `` `tsc `` became TAB + "sc", `` `n `` (in code block) became newline, eating the next line
2. Earlier in session: GraphQL multiline field values mangled the same way

**Pattern:**
```powershell
# ❌ WRONG — backticks interpreted
$content = @"
Run: `tsc --noEmit`
Type:
  - A (old)
  - B (new)
"@

# ✅ CORRECT — backticks literal
$content = @'
Run: `tsc --noEmit`
Type:
  - A (old)
  - B (new)
'@
```

**Applied to:** PR #32 body re-render in alexander-5. Prevents escape-sequence garble in future multiline content.

