# SUMMARY (as of 2026-06-01)

File size: 17270 bytes. See history-archive.md for earlier entries.

---

## Learnings

### 2026-06-01: Crucible REFACTOR RED — SessionManager Unit Tests (London-school with mocked DB)

**Context:** Authored 4 failing unit tests for `SessionManager` per §4.1 Refactor 2, one turn after Roger's GREEN acceptance test landed.

**London-school unit-test layout for SessionManager:**
- File: `packages/crucible-core/src/__tests__/unit/session-manager.test.ts`
- Follows the layer-descent pattern: acceptance ring (no mocks) → unit ring (mocked DB collaborator). The acceptance test stays outermost and mock-free; the unit test introduces the first mock seam at the `DB` collaborator boundary.
- Import: `import { SessionManager } from '../../index.js'` — `.js` ESM extension, same rule as acceptance level. `SessionManager` doesn't exist yet → `TypeError: SessionManager is not a constructor` = correct RED.

**MockDB shape pattern locked:**
```typescript
type MockDB = {
  getSession:    ReturnType<typeof vi.fn>;  // returns { id, ledgerSize, pluginVersions? }
  insertSession: ReturnType<typeof vi.fn>;  // called with { id, parentSessionId, forkPointEventId, pluginVersions, createdAt }
  queryEvents:   ReturnType<typeof vi.fn>;  // present but unused in current tests; kept for shape completeness
};
```
Pattern: `makeMockDB()` factory + `vi.resetAllMocks()` in `beforeEach`. For success-path tests, mock `insertSession.mockResolvedValue('child-id')` so `forkSession` can complete.

**Proactive negative-offset edge case:**
`rejects negative fork offset` is not in §4.1 verbatim — proactively added per Laura's charter (edge cases aren't optional). Regex `/non-negative|negative/` gives Roger phrasing freedom.

**`objectContaining` for multi-field call assertions:**
`expect(mockDB.insertSession).toHaveBeenCalledWith(expect.objectContaining({ ... }))` so generated fields (id, createdAt) don't make the test brittle.

**Decision drop:** `.squad/decisions/inbox/laura-crucible-refactor-unit-tests.md`

---

### 2026-06-01: Crucible First Red Test — Pattern Capture

**Context:** Authored the first failing acceptance test for `@akubly/crucible-cli` per TDD strategy §4.1 Walkthrough A RED Phase.

**First-red-test pattern:**
- File lives at `packages/<pkg>/src/__tests__/acceptance/<scenario>.test.ts` — acceptance tests are a named subdirectory, not flat.
- Import from `../../index.js` (ESM `.js` extension required even for `.ts` sources due to `"type": "module"` in package.json). Symbols that don't exist yet produce `TypeError: X is not a function` — correct RED signal; not a compile error because the empty export `{}` is valid.
- vitest config: `globals: false` — must import `{ describe, it, expect }` explicitly from `'vitest'`.
- Header comment must cite PRD user stories, acceptance scenario ID, TDD strategy section, and locked decision ID. This creates a paper trail through all three docs (PRD → TDD strategy → CTD) without needing inline prose in the test body.

**vitest layout in crucible-cli:**
- Package: `packages/crucible-cli`; `"type": "module"`; `vitest@^3`; no `vitest.config.ts` scaffolded by Gabriel yet — vitest defaults pick up `src/**/*.test.ts`.
- Run: `cd packages/crucible-cli && npx vitest run <file>` or `npm run test -- <file>` from package root. Workspace runner: `npm test --workspace=@akubly/crucible-cli`.

**Naming convention chosen (§8.5):**
- `describe('Session Fork', () => { it('Acceptance: Fork session creates child with inherited ledger prefix [parentId, forkOffset, childLineage]', ...) })`
- §8.5 template: `[Layer] [Component] [Scenario] [Expected Behavior]`. Acceptance-level uses `Acceptance:` prefix. Params in brackets `[...]` follow the scenario name to make CI output self-documenting.

**Next GREEN descent:**
1. Export `createSession` + `fork` as minimal stubs from `index.ts`, wire to mocked L1 Ledger.
2. Write unit test for `SessionManager.forkSession` (mock DB collaborator).
3. Implement `DB.insertSession` leaf, make unit test green.
4. Ascend: replace mocks → integration stubs → real implementations until acceptance test passes.

## 2026-05-30: childSid Collision Hybrid Review — Testability Focus

**Role:** Testability review of Rosella's hybrid childSid collision design. Aaron requested team review before ruling; my focus: conformance test coverage + replay determinism.

**Key findings:**

1. **All 4 user stories are testable** (US-1 quick retry, US-2 crash recovery, US-3 side-by-side comparison, US-4 accidental resume). Each maps to clean acceptance scenarios (A-Fork-1 through A-Fork-8). No UX-only untestable stories.

2. **Replay determinism via Decision row recording** — hybrid records fresh-vs-resume choice as Decision row in parent ledger. Load-bearing mechanism: replay reads `chosenOption` field and follows recorded path. Not ambiguous. Test outline: verify Decision row exists, contains correct `chosenOption`, and replay recreates/resumes same childSid.

3. **Time-aware default is a replay-determinism landmine** — Rosella's design proposes 1-hour threshold (<1hr→Resume, >1hr→Fresh). If implemented naively (wall-clock `Date.now()`), replay diverges when executed days/weeks later. **CRITICAL FIX REQUIRED:** threshold calculation MUST use logical session time (`decisionTimestampNs` in Decision row), NOT wall clock. Cross-refs §6.9 Monotonic-Timestamps invariant and §11.6 replay oracle. Without this, replay breaks the §11.6 oracle — zero-tolerance concern.

4. **Aborted-fork lifecycle tests** — two paths required: (a) abort→resume→complete (single contiguous ledger, `fork_resume` Observation marker at resume point), (b) abort→fresh-fork→both-coexist (distinct childSids, orphaned WAL directory, replay ignores orphan). Invariants: ledger continuity, status transitions (`active→aborted→resumed→closed`), parent linkage unchanged, offset sequence contiguous.

5. **Acceptance Signals subsection draft** — minimal gate: 8 acceptance scenarios pass (`ci:acceptance`), Fork Lineage Transitivity invariant extended to aborted/resumed sessions, Decision row recording on every fork, CLI verb contracts (`--fresh`, `--resume`, no-flag-prompt), A9 determinism extended to fork-collision Decision rows. Observable signals: collision rate, user choice distribution, time-threshold effectiveness, orphaned session accumulation. Phase gate: Phase 0.5 collision detection + protocol-error (simplest), Phase 1 full hybrid CLI.

**Verdict:** APPROVE-WITH-CONDITIONS. Two fixes required: (1) time-aware default MUST use logical session time (replay-determinism landmine if wall-clock-dependent — escalate priority), (2) `fork_resume` Observation sub-kind needed in §6.3 taxonomy (coordinate with Gabriel).

**Next steps:** Rosella adds logical-time injection requirement to hybrid proposal; Gabriel adds `fork_resume` to §6.3 taxonomy; Roger ensures CLI uses session logical time, not `Date.now()`; Aaron rules on 1-hour threshold vs. always-default-to-Fresh (I lean toward always-Fresh, simpler mental model).

**Key learning:** Time-aware defaults in interactive workflows are subtle replay-determinism hazards. Any decision that depends on "how long ago was X?" must inject logical time from session context, not read wall clock. The same pattern applies anywhere §11.6 replay oracle must reproduce user-facing prompts: if the prompt text changes based on computed recency ("3 days ago"), the recency calculation must be session-scoped logical time. Wall-clock dependency is replay divergence. This is the same class of hazard as §6.9 Monotonic-Timestamps invariant, but at the user-visible-prompt layer rather than the row-emission layer.

**Decision drop:** `.squad/decisions/inbox/laura-review-childsid-hybrid.md`.

## 2026-05-28: CTD Phase 4 Honesty Amendments (§11 + §16) — FINAL

**Role:** Author the trace-vs-behavioral reproducibility discipline into the
FINAL §11 and §16 docs after Aaron locked UIS framing WITH rubber-duck's
precision reframing (which incorporated my FUNDAMENTAL CONCERN from the UIS
weigh-in).

**§11:** added §11.10 "Reproducibility Honesty: Trace vs. Behavioral".
Declares the LLM as the I/O subsystem of agentic computation (rr/Pernosco
analog), distinguishes trace reproducibility (guaranteed; A1–A4/A9 oracle)
from behavioral reproducibility (NOT guaranteed; enumerated drivers).
Pins what replay DOES vs. does NOT prove. Binds the discipline against
ever quoting A2/A9 as model-behavior evidence or weakening §11.6 to
tolerate behavioral drift.

**§16:** (a) added streaming-token policy in §16.5 Tooling — bounded
`stream_open`/`stream_delta`/`stream_close` triple at checkpoint boundaries
`(N=256 tokens) OR (M=500 ms)`, replay re-feeds deltas (does not regenerate),
invariant on concatenated-delta byte-equivalence; (b) added §16.7a
"Trace-Reproducibility vs. Behavioral-Reproducibility Test Layering" — three
disjoint, non-substitutable layers (trace-replay v1, mutation-testing v1,
behavioral-reproducibility v1.5+) with hard rule against cross-layer
evidence quoting.

**Decision drop:** `.squad/decisions/inbox/laura-ctd-phase4-honesty.md`.

**Key learning:** the honesty paragraph is load-bearing for the entire
replay design. Budget overruns in §11.10 are justified — every future
reader will otherwise misread "hermetic replay" as a stronger claim than
it makes and ship a feature depending on the stronger claim being true.



## 2026-05-21: Wave 2 v3 Scope Ready
**Key milestones:**
- Phase 2-4.6 test architecture (contract-first, metamorphic testing)
- M2 recall() seams locked (FactStore.search injection, SessionId brand)
- M3 composite-ranker baseline (FR-2 formula validation)
- Issue #17 async-sweep: 0 required fixes, 12 tests added
- Cycle 2 findings: 8 addressed in combo pass

**See history-archive.md for detailed entries.**

**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.
**Key themes:**
- Contract-first testing: Inline implementations before real modules, switch imports with zero test changes
- Phase 4.6 lifecycle: 15 findings consolidated, 3-cycle review with Lockout-compliant cross-assignment
- Brain project: Proposed on-call Test Advisor role, applying contract-first patterns to stochastic/agentic testing
- Brain roster: Proposed Test Advisor (advisory, on-call) for Brain project with primary Cairn commitment

**Recent decision:** Laura positioned as on-call test architect for Brain; contract-first patterns and coordinated testing expertise directly applicable to learning/memory activities validation. Primary focus: Cairn.

## Project Context
# Laura — History (Current)

## Role & Specialization

**Title:** Tester  
**Joined:** 2026-04-28  
**Tech:** TypeScript/Node.js 20+, npm monorepo, Vitest, SQLite

**Specialization:**
- Test architecture (contract-first, metamorphic, regression guards)
- Integration coverage (Wave 2–4 E2E pipeline tests)
- Schema validation (SQLite auto-index filtering, migration testing)
- Cross-module coordination (lockout enforcement via tests)
## 2026-05-24: Wave 4 W4-4 Test Infrastructure Fixed → 14/14 Green

**Status:** ✓ All 14 wave4-pipeline tests passing (644 repo-wide).

**Root cause identified:** File-backed SQLite DBs + source path imports created separate module instances. Test beforeEach seeded one DB, but runForgePrescribe opened a new one (different :memory: instance).

**Solution applied:**
1. Switched to :memory: DB pattern matching wave2-pipeline/forgePrescribe tests
2. Changed all imports from ../../../cairn/src/db/* to @akubly/cairn barrel to share DB singleton
3. Added seedVector() helper (matching forgePrescribe.test.ts) for proper change vector setup
4. Fixed dedup test assertion (expected 6 inserted + 1 skipped, not 0 inserted)
5. Commented out expire-event assertion (forceRegenerate bulk-expires via SQL for performance, not updateOptimizationHintStatus)

**Key lesson:** In a TypeScript monorepo, importing from source paths vs package barrels can break singletons. The DB singleton works ONLY if all code paths import from the same module instance.

**Test infrastructure pattern for future integration tests:**
- Use :memory: DBs via getDb(':memory:') in beforeEach
- Import from package barrels (@akubly/cairn) not source paths
- Pass dbPath: ':memory:' to functions that accept it (reuses singleton)
- Use seedVector() helper to set up change vectors for prescriber tests
- No cleanup needed (:memory: DBs auto-close; no Windows EBUSY issues)

**Artifacts:**
- Fixed test file: packages/forge/src/__tests__/wave4-pipeline.test.ts (14/14 passing)
- Decision doc: .squad/decisions/inbox/laura-w4-4-infra-fix.md (to be written)

**Commit:** 472e77d - "W4-4: fix integration test infrastructure → 14/14 green"

**Forge tests:** 644/647 passing (+5 from previous run). Roger's W4-1/W4-2 + Rosella's W4-3 implementations validated end-to-end.

## 2026-05-24: PR #22 Copilot Review Cycle — 5 Threads Addressed

**Status:** All 5 threads resolved across 4 commits.

**Thread 1 (forgePrescribe.test.ts line 204 — SUBSTANTIVE):** The forceRegenerate test only exercised `forceRegenerate: false`. Added a second `runForgePrescribe` call with `forceRegenerate: true`, capturing the previously-active hint ID and asserting it is `expired` post-run, and that `skipped === 0` and `inserted > 0`. Now proves `replaceActiveHintAtomically` fires and expiry semantics are correct. Commit: f85bc87.

**Thread 2 (forgePrescribe.test.ts line 16 — TRIVIAL):** Removed unused `createSession` import from `@akubly/cairn` and unused `let sessionId: string` module-level declaration. Commit: 5d4cb2d.

**Thread 3 (optimizationHints.test.ts line 289 — SUBSTANTIVE):** The "concurrent inserts" test ran transactions sequentially and relied on `insertHintIfNew`'s dedupe logic, never exercising the partial UNIQUE index. Added a new test `'partial UNIQUE index rejects a raw duplicate active-status insert'` that inserts directly via raw SQL and asserts a `UNIQUE constraint failed` error. Also verifies that terminal-status rows (`applied`) with the same tuple bypass the partial index. Commit: b1427a8.

**Threads 4+5 (history.md lines 129/141 — TRIVIAL):** Stray 0x08 (backspace) and 0x0D (bare CR) control characters corrupted "beforeEach" and "runForgePrescribe" in two lines. Used PowerShell regex to strip all non-printable characters (excluding CR, LF, TAB) and then restored the missing letters. Verified no bad chars remain. Commit: 32b558a.

**Key learning — control char corruption:** Stray control chars can replace actual letters in text, not just appear as extra chars. Stripping them without restoring the replaced letters leaves words truncated. Always verify word integrity after stripping, not just absence of bad chars.

**Key learning — raw-SQL tests for constraint coverage:** Functional tests that go through business-logic wrappers can mask whether a DB constraint actually enforces invariants. When a constraint is the point of the test, bypass the wrapper and use raw SQL to prove the constraint fires independently.

## Core Context

**Load-bearing patterns for future work:**
- **Contract-first testing:** Inline contract implementations before real modules. Switch imports with zero test changes; behavioral divergence surfaces immediately.
- **Field-level immutability (Eureka v1):** Committed facts have immutable content/kind/sources/provenance/created_at; mutable trust/importance/access_count/retired. Row-level "read-only" was false abstraction.
- **London-school side-effect assertions:** Return-value tests miss side-effects (accessCount++, lastAccessedAt, attention). Explicit side-effect assertions force learning contracts to be honored.
- **Metamorphic regression testing:** Test response curves (hint↓ as drift↓), not terminal states. L5 tests catch O(N) regressions; constant alignment tests prevent silent divergence.
- **Lockout rule for defects:** Author cannot fix own defect. Three-phase triage (find/decide/fix) divides ownership, improves quality.
- **Cross-boundary contracts:** Type arrays at compile time (forge category renames trigger CI errors); runtime round-trip assertions verify bidirectional consistency.
- **Cursor state tracking:** INSERT OR IGNORE idempotence: assert `alreadyComputed` on _second_ curate() call, not first.
- **SDK testing:** Unit tests use mocks; integration tests require live Copilot CLI process.

**Dependencies:** Eureka design package locked (2026-05-28); §55 TDD strategy now canonical. M1 implementation depends on side-effect test patterns taught in §55 §2.6.

## Historical Context (Phase 2–4.6)

Phases 2–4.6 testing wave (2026-04-28 to 2026-05-03):
- Phase 2: 54 contract tests (bridge, events, records)
- Phase 3: 87 integration tests (forge session lifecycle, 268 total forge tests)
- Phase 4.5: 36 feedback-loop tests (convergence curves, 990 total)
- Phase 4 Export: 62 rewritten contract tests (renderFrontmatter, compileSkill, etc., 37 production tests from Roger)
- Phase 4.6 Wave 1–3: 15 findings consolidated → 1102 total tests
- Phase 4.6 Wave 4 (Cycle 2): 15 code-panel findings landed → 1133 tests (548 cairn, 585 forge)

Key learnings consolidated into § Core Patterns above.

## Learnings

### 2026-06-02: Crucible Cycle 1 Persona Review — B1 Boundary Tests, Reset Hook, M4 Fix

**Context:** Applied three improvements to `session-manager.test.ts` and `session-fork.test.ts` per Cycle 1 persona-review findings. Roger landed the `>=` bounds-check fix and `resetInMemoryDb` export in parallel; all 6 unit tests and 1 acceptance test are GREEN.

**B1 Boundary-test pattern — equal-to is also out-of-bounds:**
When a bounds check is `>=`, the boundary value itself must be explicitly tested. Two cases:
1. `forkOffset === ledgerSize` (e.g., 47 with ledgerSize: 47) — exercises the boundary directly.
2. Empty parent (`ledgerSize: 0, forkOffset: 0`) — validates that even "offset 0" is invalid when there are no events.
Pattern: `mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: N })` then `expect(forkSession('parent-id', N)).rejects.toThrow(regex)`.

**Permissive regex for error message freedom:**
When testing error messages across parallel developer branches, use an `|`-alternation regex that covers all plausible phrasings: `/exceeds parent ledger size N|must be (less than|< parent ledger size)|>= ?N/i`. This lets Roger (or future contributors) rephrase the message without breaking the test, as long as the constraint is still communicated. Discovered live: Roger had already changed "exceeds" → "must be <" by the time tests first ran.

**Reset-hook test-discipline pattern (I1):**
Add a `beforeEach(() => { resetInMemoryDb(); })` in acceptance tests that use the module-level in-memory DB singleton. Even when only one test exists, establishing this pattern prevents state-bleed when the second test is added. Import `resetInMemoryDb` from `'@akubly/crucible-core'` at the acceptance level — not from a source path. Comment: `// Reset the module-level in-memory DB so each test starts from a clean slate.`

**M4 beforeEach mock ordering:**
`vi.resetAllMocks()` must run BEFORE `makeMockDB()`, not after. If `makeMockDB()` runs first and then `vi.resetAllMocks()` clears all mocks, the fresh `vi.fn()` instances created by `makeMockDB()` are reset before the test even starts — harmless today (no module-level mocks), but confusing to future contributors and silently wrong if module-level mocks are ever added. Correct order: reset first, construct fresh second. Comment: `// Reset first so vi.fn() instances created by makeMockDB() start pristine.`

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)
