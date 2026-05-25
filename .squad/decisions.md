# Squad Decisions

## Active Decisions

### Wave 4 Scope Approved (Graham, 2026-05-23)

**Status:** ✅ Ratified by Aaron

**Wave 4 Deliverables:**
1. **W4-1** — insertHintIfNew atomicity fix (partial UNIQUE index + BEGIN IMMEDIATE) — Roger ✅
2. **W4-2** — Curator observability gap (CairnEvent extensions for hint state transitions + profile bumps) — Roger ✅
3. **W4-3** — Force-overwrite knob (--force CLI flag for forceRegenerate) — Rosella ✅
4. **W4-4** — Integration tests (~14 tests, ~200 LOC) — Laura (9/14 passing; test infra gaps identified)

**Team Ownership:** All work items assigned and implemented on phase-4.6/wave-4 branch (commits 978d7a0..1808d8f).

### Design Decision D1: CairnEvent Observability (Roger, 2026-05-04)

**Status:** ✅ Resolved — Option 1 (additive CairnEvents) ratified by Aaron

**Resolution:** New event types appended to existing `event_log` table:
1. **hint_state_transition** — Emitted on hint insert and status updates with `{skill_id, hint_id, from_state, to_state, timestamp}`
2. **profile_bump** — Emitted on profile create/update with `{skill_id, profile_id, bump_kind, granularity, timestamp}`

**Events logged to:** `__system__` session via `ensureSystemSession()` helper

**Rationale:**
- Smallest delta, fully backward-compatible, preserves existing events, zero compatibility risk
- Solves observability gap blocking Wave 5 re-prescribe triggers (on rejection, on profile bump, on staleness)
- Richer alternatives (Option 2: dedicated channel; Option 3: unified refactor) deferred to Wave 5+

**Test Coverage:** ✅ 5/5 integration tests passing (Group B)
- Hint state transition on insert
- Hint state transition on status update
- Profile bump on create/update
- Forward-compat with unknown event types
- Transactional integrity

**Files Modified:**
- `packages/cairn/src/db/optimizationHints.ts`
- `packages/cairn/src/db/executionProfiles.ts`
- `packages/cairn/src/db/sessions.ts` (ensureSystemSession helper)
- `packages/cairn/src/__tests__/cairnEvents.test.ts` (5 new tests)

### Design Decision D2: forceRegenerate Surface (Rosella, 2026-05-23)

**Status:** ✅ Resolved — CLI only for Wave 4 per Aaron's D2 decision

**Resolution:** --force CLI flag for forge-prescribe to bypass hint deduplication and force re-emission.

**Implementation:**
- Flag name: `--force` (boolean, default: false)
- Semantics: UPDATE active hints to `status = 'expired'` before calling `insertHintIfNew()`
- MCP surface: **EXCLUDED** from Wave 4 per Aaron's D2 decision (deferred to Wave 5 with full Phase 5 scope clarity)
- Call path: CLI → `runForgePrescribe()` → `executePrescriberRun({ forceRegenerate })` → `expireActiveHints()` + `insertHintIfNew()`

**Rationale:**
- Closes critical operator workflow gap (recovery from hint rejection storms)
- CLI surface immediate relief for documented operator need
- MCP generalization (confirmation prompts, safety guards) defers to Wave 5

**Trade-off Accepted:**
- Gain: Operator escape hatch live immediately via CLI
- Trade-off: Operators stay in manual-override mode longer; MCP automation deferred to Wave 5

**Test Coverage:** ✅ Unit tests 8/8 passing; integration group C 1/4 (3 failures = test infra)
- forceRegenerate reduces skipped count when duplicates exist
- Only expires hints matching (skill_id, source, category)
- Does NOT expire terminal-status hints
- MCP surface correctly excluded

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts`
- `packages/runtime-cli/src/cli.ts`
- `packages/runtime-cli/src/__tests__/forgePrescribe.test.ts` (4 new tests)

### Design Decision W4-1: insertHintIfNew Atomicity (Roger, 2026-05-04)

**Status:** ✅ Implemented

**Context:** Wave 3 deferred insertHintIfNew atomicity race. Current check-then-insert allows concurrent callers to both insert duplicates for same (skill_id, source, category).

**Resolution:** Migration 013 with partial UNIQUE index + BEGIN IMMEDIATE transaction.

**Index Schema:**
```sql
CREATE UNIQUE INDEX idx_optimization_hints_active_dedup
  ON optimization_hints(skill_id, source, category)
  WHERE status IN ('pending', 'accepted', 'deferred');
```

**Rationale:**
- Partial index only enforces uniqueness for active statuses (pending, accepted, deferred)
- Terminal statuses (applied, rejected, expired, suppressed, failed) excluded → historical hints coexist
- Matches existing ACTIVE_HINT_STATUSES constant

**Transaction Isolation:** `db.transaction().immediate()` acquires write lock upfront before reads, preventing concurrent duplicates.

**Behavior on Conflict:** UNIQUE constraint violation treated as duplicate; fetch existing hint ID via `findActiveHintId()`.

**Test Coverage:** ✅ 3/3 integration tests passing (Group A)
- Single insert succeeds normally
- Duplicate insert returns existing hint ID
- Concurrent inserts via immediate transactions → only one wins

**Files Modified:**
- `packages/cairn/src/db/migrations/013-hint-atomicity.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/optimizationHints.ts` (transaction wrapper)
- `packages/cairn/src/__tests__/optimizationHints.test.ts` (3 new tests)

### Integration Test Pattern: Monorepo Singletons (Laura, 2026-05-24)

**Status:** ✅ Resolved — Module import standardization + `:memory:` DB pattern

**Root Cause Identified:** TypeScript module singleton fragmentation from mixed import paths in integration tests.

**Problem:** Test setup imported from source paths (`../../../cairn/src/...`); implementation from package barrels (`@akubly/cairn`). These resolved to different module instances in TypeScript's dependency graph, each maintaining separate singleton state. Test beforeEach seeded DB in one instance; runForgePrescribe opened DB in the other.

**Decision:** Standardize integration test pattern to match wave2/wave3 conventions:

1. **Import from package barrels only** — No source path imports
   - `import { getDb, closeDb, ... } from '@akubly/cairn'` ✅
   - NOT `import { getDb } from '../../../cairn/src/db/index.js'` ❌

2. **Use `:memory:` DB singleton pattern**
   ```typescript
   beforeEach(() => {
     closeDb();
     getDb(':memory:');  // Creates singleton
   });
   
   afterEach(() => {
     closeDb();  // No file cleanup needed
   });
   ```

3. **Pass `dbPath: ':memory:'` to functions** — Reuses singleton from beforeEach

4. **Test helper functions** for setting up test data with seeded vectors

**Rationale:**
- Singleton behavior only guaranteed if all code imports from the same module path
- `:memory:` DBs auto-close; eliminates Windows EBUSY cleanup errors
- Matches established patterns in wave2-pipeline/wave3-pipeline/runtime-cli tests
- Faster test execution (in-memory vs file-backed)

**Implementation:** Commit 472e77d

**Test Results Before Fix:** 9/14 passing (5 infrastructure failures in Groups C & D)  
**Test Results After Fix:** 14/14 passing ✅  
**Repo-wide:** 644/647 tests passing

**Files Modified:**
- `packages/forge/src/__tests__/wave4-pipeline.test.ts` — Imports fixed, DB pattern standardized, all tests green

**Consequences:**
- ✅ Wave 4 integration tests now fully passing
- ✅ All three work items (W4-1, W4-2, W4-3) validated end-to-end
- ✅ Windows EBUSY cleanup issue eliminated
- ✅ Pattern documented for future test authors
- Trade-off: Cannot test file-based DB persistence in integration suite (acceptable; unit tests can cover if needed)

**Related Evidence:**
- wave2-pipeline.test.ts (established pattern)
- wave3-pipeline.test.ts (reference implementation)
- runtime-cli forgePrescribe.test.ts (unit test reference)

### Raw-SQL Constraint Test Pattern for DB Invariants (Laura, 2026-05-24)

**Status:** ✅ Implemented in PR #22 cloud review cycle

**Context:** PR #22 Copilot review (Thread 3) flagged that the "concurrent inserts" test in `optimizationHints.test.ts` ran both transactions sequentially and relied on `insertHintIfNew`'s internal dedupe logic, never proving the partial UNIQUE index fired independently.

**Decision:** For any DB constraint that is the subject of a test (not just a side effect), the test should bypass the business-logic wrapper and assert the constraint directly via raw SQL. This applies to:
- Partial UNIQUE indexes
- CHECK constraints
- Foreign key constraints

**Rationale:** Functional wrappers can mask constraint failures. If `insertHintIfNew` is refactored to check existence differently, the old "concurrent inserts" test would still pass even if the UNIQUE index was accidentally dropped.

**Implementation:** 
- Added `'partial UNIQUE index rejects a raw duplicate active-status insert'` test in `packages/cairn/src/__tests__/optimizationHints.test.ts`
- Uses raw `db.prepare().run()` to insert a second active-status row for the same `(skill_id, source, category)` tuple and asserts `UNIQUE constraint failed`
- Also verifies terminal-status rows bypass the partial index

**Commit:** 81fd6a8 (cycle 3)

### forceRegenerate Test Must Exercise Both Branches (Laura, 2026-05-24)

**Status:** ✅ Implemented in PR #22 cloud review cycle

**Context:** PR #22 Copilot review (Thread 1) flagged that the forceRegenerate test only exercised the `false` path. The `true` path (which calls `replaceActiveHintAtomically`) was unexercised.

**Decision:** Any feature with a boolean fork (`forceRegenerate: true/false`) should have assertions on both branches in the same test or closely related tests. For the `true` path specifically, assert behavioral consequences (state change) not just return values.

**Implementation:** 
- Extended the existing test to add a second call with `forceRegenerate: true`, capturing the previously-active hint ID
- Asserts `status === 'expired'` post-run, plus `skipped === 0` and `inserted > 0`

**Commit:** 81fd6a8 (cycle 3)

### Narrow UNIQUE Constraint Catches in Cairn DB Layer (Roger Wilco, 2026-01-31; merged 2026-05-25)

**Status:** ✅ Ratified and implemented in PR #22

**Decision:** For all UNIQUE constraint error handling in the cairn db layer, use a two-part check:

1. `(err as any).code === 'SQLITE_CONSTRAINT_UNIQUE'` — confirms the error is a UNIQUE constraint violation (not a foreign key, CHECK, or NOT NULL constraint)
2. Column-tuple check on the specific index columns — confirms it's the intended index, not the PK or another UNIQUE index

**Do NOT use** a bare `err.message.includes('UNIQUE constraint failed')` check. That string prefix matches ALL UNIQUE violations on the table, including PK collisions on `.id`, which are real bugs that should propagate.

**Context:** PR #22 review (Thread 1) identified that the original `insertHintIfNewWithinTransaction` catch block used:
```typescript
if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
```
This swallows PK collisions on `optimization_hints.id`, masking potential bugs.

**Correct Pattern (active-dedup index in optimizationHints.ts):**
```typescript
if (
  err instanceof Error &&
  (err as any).code === 'SQLITE_CONSTRAINT_UNIQUE' &&
  err.message.includes('optimization_hints.skill_id') &&
  err.message.includes('optimization_hints.source') &&
  err.message.includes('optimization_hints.category')
) {
  // Treat as concurrent duplicate — fetch existing hint id
} else {
  throw err;  // PK collision or unexpected constraint — propagate
}
```

The active-dedup partial index is `idx_optimization_hints_active_dedup` on `(skill_id, source, category) WHERE status IN ('pending', 'accepted', 'deferred')`. SQLite error message format: `UNIQUE constraint failed: optimization_hints.skill_id, optimization_hints.source, optimization_hints.category`.

**Rationale:**
- Avoids silently discarding PK collisions or violations from future UNIQUE indexes on other column tuples
- `SQLITE_CONSTRAINT_UNIQUE` code confirms constraint class before inspecting the message
- Column-tuple check is the precise discriminator between the active-dedup index and the PK
- Pattern is consistent and testable: PK collision test confirms the error propagates

**Commit:** dcdcd26 (cycle 4)


### Decision: Harness Vision Document Drafted (Graham, 2026-05-23)

**Status:** Awaiting Aaron's review

**Artifact:** docs/harness-vision.md (3,200+ words, 14 sections)

**Next Steps:** PRD authoring session (Wave 5 scope)

### Wave 5 Shape Approved (Graham, 2026-05-25)

**Status:** ✅ Ratified by Aaron — Shape B (Foundation + Safety)

**Wave 5 Scope:**
1. **W5-1** — Session-kind separation (MCP fallback correctness fix) — Roger ✅
2. **W5-3** — Global tier fallback for profile selection (expand from per-skill only) — Rosella (pending)
3. **W5-2** — DB convention standardization (explicit injection, testability) — Roger (pending)
4. **W5-4** — Profile staleness check + confidence attenuation — Rosella (pending)

**Wave 5 Deferred to Wave 6:**
- W5-5: MCP surface for forceRegenerate (needs W5-1 prerequisite + UX policy)
- W5-6: Metrics dashboard (product shape undefined; needs Aaron's surface decision)

**Wave 5 Timeline:** Four parallel/sequential items, ~3-4 work sessions. Phase 4.6 completes upon Wave A landing (W5-1, W5-3 concurrent; then W5-2, W5-4).

**Rationale:**
- **W5-1 (correctness):** CLI `--force` shipped in Wave 4. MCP fallback currently returns `__system__` session to user-facing tools — this is a bug blocking safe MCP expansion.
- **W5-3 (functionality):** `loadExecutionProfile()` only walks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. Wave 4's observability (profile_bump events) surfaces this gap when operators see bumps that never influence prescriptions.
- **W5-2 (maintainability):** 12+ Cairn functions use internal `getDb()` calls; new code uses explicit injection. Standardizing now prevents test infrastructure failures in future waves (proven by Wave 4 integration test debugging).
- **W5-4 (trust):** Profiles have `updatedAt` but nothing checks it. Stale profiles generate misleading prescriber confidence without a safety gate.

**Wave 6 Scope (backlog):**
- I10: Curator system-event handling (depends on W5-1; better addressed when Phase 5 architecture is concrete)
- W5-5: MCP forceRegenerate surface (confirmation UX + safety guards need Aaron's policy input)
- W5-6: Metrics dashboard (TBD: CLI report vs. MCP resource vs. new package)

### Design Decision W5-1: Session-Kind Separation (Roger, 2026-05-25)

**Status:** ✅ Implemented — Migration 014 landed; MCP fallback corrected

**Context:** Phase 4's `ensureSystemSession()` creates system sessions on every prescriber run. MCP endpoints (`resolve_prescription`, `lint_skill`, `test_skill`) currently fall back to `__system__` session when no repo key is available — a correctness bug that pollutes user-facing attribution.

**Resolution:** Migration 014 with `session_kind` column (enum: 'user' | 'system').

**Schema Changes:**
```sql
ALTER TABLE sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'user' 
  CHECK (session_kind IN ('user', 'system'));
```

**Backfill:** Existing rows with `repo_key = '__system__'` set to `session_kind = 'system'`. All others default to 'user'.

**API Changes:**
- Added `getMostRecentUserSession()` — falls back only to user sessions
- Added `getActiveUserSession(repoKey)` — user-scoped variant
- Kept `getMostRecentActiveSession()` and `getActiveSession(repoKey)` for internal/system-aware callers
- Created `getUserSessionForMcpFallback()` — wrapper for all MCP call sites

**MCP Call Sites Updated:**
1. `resolve_prescription` — accept/apply attribution
2. `lint_skill` — telemetry event logging
3. `test_skill` — scenario-path telemetry and result persistence
4. `test_skill` — direct validation telemetry and result persistence

**Test Coverage:** ✅ 100/100 passing (db.test.ts + mcp.test.ts)
- Migration schema validation
- `getMostRecentUserSession()` filtering excludes system sessions
- MCP fallback with `__system__` as most-recent returns user session instead
- All four MCP endpoints attribute correctly

**Files Modified:**
- `packages/cairn/src/db/migrations/014-session-kind.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/sessions.ts` (new API functions, ensureSystemSession update)
- `packages/cairn/src/mcp/server.ts` (four call sites using getUserSessionForMcpFallback)
- `packages/cairn/src/__tests__/db.test.ts` and `mcp.test.ts` (new tests)

**Commit:** 8b0a69a (phase-4.6/w5-1-session-kind)

**Deferred:** I10 (Curator system-event filtering) — depends on W5-1 but is a cloud telemetry design decision (Phase 5).

### Design Decision W5-3: Global Tier Fallback Semantics (Graham, 2026-05-25)

**Status:** ✅ Spec locked; implementation complete — Rosella drop landed (2026-05-25)

**Context:** `loadExecutionProfile()` only checks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. DB schema (migration 011) already supports all four granularities; the read path is incomplete.

**Resolution:** Extend fallback chain from `per-skill` → `global` to `per-skill` → `per-model` → `per-user` → `global`.

**Fallback Semantics (Five Decisions):**

1. **Trigger:** Profile absence only (no row exists). Staleness does NOT trigger fallback — W5-4 handles staleness via confidence attenuation instead.

2. **Payload:** Complete `ExecutionProfile` from first non-null tier. No blending across tiers — full replacement only. The `source` field on `LoadedExecutionProfile` tells downstream code which tier was actually used.

3. **Composition:** Strictly first-match-wins down the chain. No blending (would require empirical weight parameters we don't have). Blending can be added as a separate feature in Phase 5 without changing the chain.

4. **Identity Keys:** New optional `TierFallbackContext` with `modelId?`, `userId?`. Tiers with unknown keys are skipped (not queried with 'global'). No migration required — `execution_profiles` schema already complete.

   ```typescript
   interface TierFallbackContext {
     modelId?: string;      // Enables per-model tier lookup
     userId?: string;       // Enables per-user tier lookup
   }
   
   function loadExecutionProfile(
     db: RuntimeDb,
     skillId: string,
     options: { fallback?: TierFallbackContext }
   ): LoadedExecutionProfile | null;
   ```

5. **Staleness Interaction:** Staleness attenuates confidence on the selected profile post-fallback. Never triggers fallback. See W5-4 for details.

**Chain Behavior with Partial Context:**

| modelId   | userId  | Chain walked |
|-----------|---------|-------------|
| undefined | undefined | `per-skill` → `global` (backward compatible) |
| 'gpt-5'   | undefined | `per-skill` → `per-model('gpt-5')` → `global` |
| undefined | 'alice'   | `per-skill` → `per-user('alice')` → `global` |
| 'gpt-5'   | 'alice'   | `per-skill` → `per-model('gpt-5')` → `per-user('alice')` → `global` |

**Backward Compatibility:** Existing call sites with no context fall back to today's `per-skill` → `global` chain.

**Updated `LoadedProfileSource` type:**
```typescript
export type LoadedProfileSource =
  | 'per-skill'
  | 'per-model'
  | 'per-user'
  | 'global'
  | 'global fallback';  // deprecated, kept for compat
```

**Files Touched:**
- `packages/skillsmith-runtime/src/index.ts` — `loadExecutionProfile()`, types, two call sites
- Tests — tier chain unit tests with mock profiles at each level, integration test with per-model profile

**Files NOT Touched:** No Cairn changes. No Forge prescriber changes. No DB migration.

**Test Coverage:** ✅ 18/18 passing in skillsmith-runtime (10 tier-fallback specific)
- Per-skill tier selection
- Per-model tier fallback when per-skill missing
- Per-user tier fallback when per-model missing
- Global tier fallback as final chain
- Partial context (modelId only, userId only, both)
- Missing identity keys skip their tiers
- Staleness intentionally ignored by selection (W5-4 handles post-selection)

**Full Repo Test Status:** Skillsmith-runtime 18/18 ✅; Forge 644/647; runtime-cli 9/9; build clean.

**Commit:** c74463f (phase-4.6/w5-3-tier-fallback)

---

## Archived Decisions

See decisions-archive.md for Wave 1, Wave 2, Wave 3, and earlier Cycle 1 decisions.
