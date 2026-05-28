# Squad Decisions

## Active Decisions

### Wave 4 Scope Approved (Graham, 2026-05-23)

**Status:** Γ£à Ratified by Aaron

**Wave 4 Deliverables:**
1. **W4-1** ΓÇö insertHintIfNew atomicity fix (partial UNIQUE index + BEGIN IMMEDIATE) ΓÇö Roger Γ£à
2. **W4-2** ΓÇö Curator observability gap (CairnEvent extensions for hint state transitions + profile bumps) ΓÇö Roger Γ£à
3. **W4-3** ΓÇö Force-overwrite knob (--force CLI flag for forceRegenerate) ΓÇö Rosella Γ£à
4. **W4-4** ΓÇö Integration tests (~14 tests, ~200 LOC) ΓÇö Laura (9/14 passing; test infra gaps identified)

**Team Ownership:** All work items assigned and implemented on phase-4.6/wave-4 branch (commits 978d7a0..1808d8f).

### Design Decision D1: CairnEvent Observability (Roger, 2026-05-04)

**Status:** Γ£à Resolved ΓÇö Option 1 (additive CairnEvents) ratified by Aaron

**Resolution:** New event types appended to existing `event_log` table:
1. **hint_state_transition** ΓÇö Emitted on hint insert and status updates with `{skill_id, hint_id, from_state, to_state, timestamp}`
2. **profile_bump** ΓÇö Emitted on profile create/update with `{skill_id, profile_id, bump_kind, granularity, timestamp}`

**Events logged to:** `__system__` session via `ensureSystemSession()` helper

**Rationale:**
- Smallest delta, fully backward-compatible, preserves existing events, zero compatibility risk
- Solves observability gap blocking Wave 5 re-prescribe triggers (on rejection, on profile bump, on staleness)
- Richer alternatives (Option 2: dedicated channel; Option 3: unified refactor) deferred to Wave 5+

**Test Coverage:** Γ£à 5/5 integration tests passing (Group B)
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

**Status:** Γ£à Resolved ΓÇö CLI only for Wave 4 per Aaron's D2 decision

**Resolution:** --force CLI flag for forge-prescribe to bypass hint deduplication and force re-emission.

**Implementation:**
- Flag name: `--force` (boolean, default: false)
- Semantics: UPDATE active hints to `status = 'expired'` before calling `insertHintIfNew()`
- MCP surface: **EXCLUDED** from Wave 4 per Aaron's D2 decision (deferred to Wave 5 with full Phase 5 scope clarity)
- Call path: CLI ΓåÆ `runForgePrescribe()` ΓåÆ `executePrescriberRun({ forceRegenerate })` ΓåÆ `expireActiveHints()` + `insertHintIfNew()`

**Rationale:**
- Closes critical operator workflow gap (recovery from hint rejection storms)
- CLI surface immediate relief for documented operator need
- MCP generalization (confirmation prompts, safety guards) defers to Wave 5

**Trade-off Accepted:**
- Gain: Operator escape hatch live immediately via CLI
- Trade-off: Operators stay in manual-override mode longer; MCP automation deferred to Wave 5

**Test Coverage:** Γ£à Unit tests 8/8 passing; integration group C 1/4 (3 failures = test infra)
- forceRegenerate reduces skipped count when duplicates exist
- Only expires hints matching (skill_id, source, category)
- Does NOT expire terminal-status hints
- MCP surface correctly excluded

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts`
- `packages/runtime-cli/src/cli.ts`
- `packages/runtime-cli/src/__tests__/forgePrescribe.test.ts` (4 new tests)

### Design Decision W4-1: insertHintIfNew Atomicity (Roger, 2026-05-04)

**Status:** Γ£à Implemented

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
- Terminal statuses (applied, rejected, expired, suppressed, failed) excluded ΓåÆ historical hints coexist
- Matches existing ACTIVE_HINT_STATUSES constant

**Transaction Isolation:** `db.transaction().immediate()` acquires write lock upfront before reads, preventing concurrent duplicates.

**Behavior on Conflict:** UNIQUE constraint violation treated as duplicate; fetch existing hint ID via `findActiveHintId()`.

**Test Coverage:** Γ£à 3/3 integration tests passing (Group A)
- Single insert succeeds normally
- Duplicate insert returns existing hint ID
- Concurrent inserts via immediate transactions ΓåÆ only one wins

**Files Modified:**
- `packages/cairn/src/db/migrations/013-hint-atomicity.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/optimizationHints.ts` (transaction wrapper)
- `packages/cairn/src/__tests__/optimizationHints.test.ts` (3 new tests)

### Integration Test Pattern: Monorepo Singletons (Laura, 2026-05-24)

**Status:** Γ£à Resolved ΓÇö Module import standardization + `:memory:` DB pattern

**Root Cause Identified:** TypeScript module singleton fragmentation from mixed import paths in integration tests.

**Problem:** Test setup imported from source paths (`../../../cairn/src/...`); implementation from package barrels (`@akubly/cairn`). These resolved to different module instances in TypeScript's dependency graph, each maintaining separate singleton state. Test beforeEach seeded DB in one instance; runForgePrescribe opened DB in the other.

**Decision:** Standardize integration test pattern to match wave2/wave3 conventions:

1. **Import from package barrels only** ΓÇö No source path imports
   - `import { getDb, closeDb, ... } from '@akubly/cairn'` Γ£à
   - NOT `import { getDb } from '../../../cairn/src/db/index.js'` Γ¥î

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

3. **Pass `dbPath: ':memory:'` to functions** ΓÇö Reuses singleton from beforeEach

4. **Test helper functions** for setting up test data with seeded vectors

**Rationale:**
- Singleton behavior only guaranteed if all code imports from the same module path
- `:memory:` DBs auto-close; eliminates Windows EBUSY cleanup errors
- Matches established patterns in wave2-pipeline/wave3-pipeline/runtime-cli tests
- Faster test execution (in-memory vs file-backed)

**Implementation:** Commit 472e77d

**Test Results Before Fix:** 9/14 passing (5 infrastructure failures in Groups C & D)  
**Test Results After Fix:** 14/14 passing Γ£à  
**Repo-wide:** 644/647 tests passing

**Files Modified:**
- `packages/forge/src/__tests__/wave4-pipeline.test.ts` ΓÇö Imports fixed, DB pattern standardized, all tests green

**Consequences:**
- Γ£à Wave 4 integration tests now fully passing
- Γ£à All three work items (W4-1, W4-2, W4-3) validated end-to-end
- Γ£à Windows EBUSY cleanup issue eliminated
- Γ£à Pattern documented for future test authors
- Trade-off: Cannot test file-based DB persistence in integration suite (acceptable; unit tests can cover if needed)

**Related Evidence:**
- wave2-pipeline.test.ts (established pattern)
- wave3-pipeline.test.ts (reference implementation)
- runtime-cli forgePrescribe.test.ts (unit test reference)

### Raw-SQL Constraint Test Pattern for DB Invariants (Laura, 2026-05-24)

**Status:** Γ£à Implemented in PR #22 cloud review cycle

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

**Status:** Γ£à Implemented in PR #22 cloud review cycle

**Context:** PR #22 Copilot review (Thread 1) flagged that the forceRegenerate test only exercised the `false` path. The `true` path (which calls `replaceActiveHintAtomically`) was unexercised.

**Decision:** Any feature with a boolean fork (`forceRegenerate: true/false`) should have assertions on both branches in the same test or closely related tests. For the `true` path specifically, assert behavioral consequences (state change) not just return values.

**Implementation:** 
- Extended the existing test to add a second call with `forceRegenerate: true`, capturing the previously-active hint ID
- Asserts `status === 'expired'` post-run, plus `skipped === 0` and `inserted > 0`

**Commit:** 81fd6a8 (cycle 3)

### Narrow UNIQUE Constraint Catches in Cairn DB Layer (Roger Wilco, 2026-01-31; merged 2026-05-25)

**Status:** Γ£à Ratified and implemented in PR #22

**Decision:** For all UNIQUE constraint error handling in the cairn db layer, use a two-part check:

1. `(err as any).code === 'SQLITE_CONSTRAINT_UNIQUE'` ΓÇö confirms the error is a UNIQUE constraint violation (not a foreign key, CHECK, or NOT NULL constraint)
2. Column-tuple check on the specific index columns ΓÇö confirms it's the intended index, not the PK or another UNIQUE index

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
  // Treat as concurrent duplicate ΓÇö fetch existing hint id
} else {
  throw err;  // PK collision or unexpected constraint ΓÇö propagate
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

**Status:** Γ£à Ratified by Aaron ΓÇö Shape B (Foundation + Safety)

**Wave 5 Scope:**
1. **W5-1** ΓÇö Session-kind separation (MCP fallback correctness fix) ΓÇö Roger Γ£à
2. **W5-3** ΓÇö Global tier fallback for profile selection (expand from per-skill only) ΓÇö Rosella (pending)
3. **W5-2** ΓÇö DB convention standardization (explicit injection, testability) ΓÇö Roger (pending)
4. **W5-4** ΓÇö Profile staleness check + confidence attenuation ΓÇö Rosella (pending)
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
- **W5-1 (correctness):** CLI `--force` shipped in Wave 4. MCP fallback currently returns `__system__` session to user-facing tools ΓÇö this is a bug blocking safe MCP expansion.
- **W5-3 (functionality):** `loadExecutionProfile()` only walks `per-skill` ΓåÆ `global`, skipping `per-model` and `per-user` tiers. Wave 4's observability (profile_bump events) surfaces this gap when operators see bumps that never influence prescriptions.
- **W5-1 (correctness):** CLI `--force` shipped in Wave 4. MCP fallback currently returns `__system__` session to user-facing tools — this is a bug blocking safe MCP expansion.
- **W5-3 (functionality):** `loadExecutionProfile()` only walks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. Wave 4's observability (profile_bump events) surfaces this gap when operators see bumps that never influence prescriptions.
- **W5-2 (maintainability):** 12+ Cairn functions use internal `getDb()` calls; new code uses explicit injection. Standardizing now prevents test infrastructure failures in future waves (proven by Wave 4 integration test debugging).
- **W5-4 (trust):** Profiles have `updatedAt` but nothing checks it. Stale profiles generate misleading prescriber confidence without a safety gate.

**Wave 6 Scope (backlog):**
- I10: Curator system-event handling (depends on W5-1; better addressed when Phase 5 architecture is concrete)
- W5-5: MCP forceRegenerate surface (confirmation UX + safety guards need Aaron's policy input)
- W5-6: Metrics dashboard (TBD: CLI report vs. MCP resource vs. new package)

### Design Decision W5-1: Session-Kind Separation (Roger, 2026-05-25)

**Status:** Γ£à Implemented ΓÇö Migration 014 landed; MCP fallback corrected

**Context:** Phase 4's `ensureSystemSession()` creates system sessions on every prescriber run. MCP endpoints (`resolve_prescription`, `lint_skill`, `test_skill`) currently fall back to `__system__` session when no repo key is available ΓÇö a correctness bug that pollutes user-facing attribution.
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
- Added `getMostRecentUserSession()` ΓÇö falls back only to user sessions
- Added `getActiveUserSession(repoKey)` ΓÇö user-scoped variant
- Kept `getMostRecentActiveSession()` and `getActiveSession(repoKey)` for internal/system-aware callers
- Created `getUserSessionForMcpFallback()` ΓÇö wrapper for all MCP call sites

**MCP Call Sites Updated:**
1. `resolve_prescription` ΓÇö accept/apply attribution
2. `lint_skill` ΓÇö telemetry event logging
3. `test_skill` ΓÇö scenario-path telemetry and result persistence
4. `test_skill` ΓÇö direct validation telemetry and result persistence

**Test Coverage:** Γ£à 100/100 passing (db.test.ts + mcp.test.ts)
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

**Deferred:** I10 (Curator system-event filtering) ΓÇö depends on W5-1 but is a cloud telemetry design decision (Phase 5).

### Design Decision W5-3: Global Tier Fallback Semantics (Graham, 2026-05-25)

**Status:** Γ£à Spec locked; implementation complete ΓÇö Rosella drop landed (2026-05-25)

**Context:** `loadExecutionProfile()` only checks `per-skill` ΓåÆ `global`, skipping `per-model` and `per-user` tiers. DB schema (migration 011) already supports all four granularities; the read path is incomplete.

**Resolution:** Extend fallback chain from `per-skill` ΓåÆ `global` to `per-skill` ΓåÆ `per-model` ΓåÆ `per-user` ΓåÆ `global`.

**Fallback Semantics (Five Decisions):**

1. **Trigger:** Profile absence only (no row exists). Staleness does NOT trigger fallback ΓÇö W5-4 handles staleness via confidence attenuation instead.

2. **Payload:** Complete `ExecutionProfile` from first non-null tier. No blending across tiers ΓÇö full replacement only. The `source` field on `LoadedExecutionProfile` tells downstream code which tier was actually used.

3. **Composition:** Strictly first-match-wins down the chain. No blending (would require empirical weight parameters we don't have). Blending can be added as a separate feature in Phase 5 without changing the chain.

4. **Identity Keys:** New optional `TierFallbackContext` with `modelId?`, `userId?`. Tiers with unknown keys are skipped (not queried with 'global'). No migration required ΓÇö `execution_profiles` schema already complete.
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
| undefined | undefined | `per-skill` ΓåÆ `global` (backward compatible) |
| 'gpt-5'   | undefined | `per-skill` ΓåÆ `per-model('gpt-5')` ΓåÆ `global` |
| undefined | 'alice'   | `per-skill` ΓåÆ `per-user('alice')` ΓåÆ `global` |
| 'gpt-5'   | 'alice'   | `per-skill` ΓåÆ `per-model('gpt-5')` ΓåÆ `per-user('alice')` ΓåÆ `global` |

**Backward Compatibility:** Existing call sites with no context fall back to today's `per-skill` ΓåÆ `global` chain.
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
- `packages/skillsmith-runtime/src/index.ts` ΓÇö `loadExecutionProfile()`, types, two call sites
- Tests ΓÇö tier chain unit tests with mock profiles at each level, integration test with per-model profile

**Files NOT Touched:** No Cairn changes. No Forge prescriber changes. No DB migration.

**Test Coverage:** Γ£à 18/18 passing in skillsmith-runtime (10 tier-fallback specific)
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

**Full Repo Test Status:** Skillsmith-runtime 18/18 Γ£à; Forge 644/647; runtime-cli 9/9; build clean.

**Commit:** c74463f (phase-4.6/w5-3-tier-fallback)

---

### Design Decision W5-2: Explicit DB Threading Hard Cut (Roger Wilco, 2026-05-25)

**Status:** ✅ Implemented — All 50+ files refactored; explicit db parameter threaded through Cairn/Forge/runtime

**Context:** Wave 5 test infrastructure revealed fragile coupling: 12+ Cairn public helpers relied on singleton `getDb()` fallback. Tests passed locally but failed in concurrent/worktree scenarios due to ambient global state. Standardizing to explicit db parameter enables deterministic test setups and future parallelization.

**Resolution:** Hard-cut public DB helpers to accept explicit `db: Database.Database` parameter as first positional argument. Removed all singleton fallback overloads.

**Signature Changes (Pattern):**
```typescript
// Before
export function getPreference(key: string, sessionId?: string): string | undefined {
  const db = getDb();
  // ...
}

// After
export function getPreference(
  db: Database.Database,
  key: string,
  sessionId?: string,
): string | undefined {
  // ...
}
```

**Helpers Killed:**
- `logEventWithDefaultDb()` — removed
- Deprecated `logEvent(sessionId, ...)` overload — removed
- `getExecutionProfileWithDb()` — collapsed into `getExecutionProfile(db, ...)`
- Deprecated fallback overload from `ensureSystemSession()` — removed

**Call Sites Updated:**
- Cairn agents: `curate()`, `prescriber()`, `archivist()`, `applier()`, `sessionState()` — all capture db once and pass through
- Hooks: `runSessionStart()` — passes db to stale-session checks and DB counters
- MCP server: Stores explicit db handle after `ensureDb()`
- Tests: All 50+ test files updated to pass db explicitly; removed ambient singleton reads
- Forge integration: `wave2-pipeline.test.ts`, `wave3-pipeline.test.ts`, `wave4-pipeline.test.ts` updated
- Runtime CLI: `forgePrescribe.test.ts`, `orchestrationConfig.test.ts` updated
- Skillsmith-runtime: `index.ts` updated for tier fallback integration

**Test Coverage:** ✅ All tests passing across all workspaces
- `@akubly/cairn`: All unit tests green
- `@akubly/forge`: 644/647 passing (no new failures from refactor)
- `@akubly/runtime-cli`: 9/9 passing
- `@akubly/skillsmith-runtime`: 24/24 passing (includes W5-3 tier fallback + W5-2 integration)

**Files Modified:** 50 files
- Cairn db layer: 15+ modules (preferences, events, profiles, hints, prescriptions, sessions, insights, etc.)
- Cairn agents: 5 files (curate, prescribe, archive, apply, sessionState)
- Cairn tests: 20+ test files (100+ test assertions tightened)
- Forge integration tests: 3 files
- Runtime CLI tests: 2 files
- Skillsmith-runtime: 1 file
- Skills/support: 1 skill doc update

**Rationale:**
- Eliminates ambient global state in tests → enables parallelization and worktree safety
- Explicit dependency injection simplifies reasoning about who owns the DB connection
- Catches refactoring bugs: if a helper forgot to thread db, TypeScript errors immediately
- Prepares for future architectural changes (e.g., connection pooling, transaction scoping)

**Deferred Follow-ups:**
- `getDb()` remains as connection factory for process entry points (CLI, server startup)
- Root `npm test` stalls under shared CLI TTY (npm + Vitest interaction); direct workspace tests pass; no product code fix needed unless CI reproduces
- Some test scenarios still use singleton factory to create db, then pass handle explicitly (acceptable pattern)

**Commit:** 963a0aa (phase-4.6/w5-2-db-hard-cut)

### Design Decision W5-4: Profile Staleness Confidence Attenuation (Rosella, 2026-05-25)

**Status:** ✅ Implemented — Runtime profiles now carry staleness annotation + confidence scaling

**Context:** Execution profiles carry `updatedAt` but nothing checks it. Prescriber confidence reflects profile quality, yet stale profiles (unchanged for 50+ sessions or 7+ days) still emit `confidence: 1`. Safety gate needed to prevent misleading trust in outdated data.

**Resolution:** `loadExecutionProfile()` returns profiles with staleness annotation and attenuates confidence.

**Staleness Shape:**
```typescript
staleness: {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
}
```

Fresh profiles (not stale): `confidence: 1` (unchanged).  
Stale profiles: `confidence * 0.5` (attenuated exactly once, even when both thresholds trip).

**Threshold Defaults:**
- **Count threshold:** Stale when `sessions_since_install - profile.sessionCount > 50`
- **Age threshold:** Stale when `now - profile.updatedAt > 7 days`
- Either threshold triggers staleness; both produce `reason: 'count+age'`
- Attenuation factor: `0.5` exactly once

**Composition with W5-3 (Tier Fallback):**
- W5-3 tier selection runs first: `per-skill` → optional `per-model` → optional `per-user` → `global`, first match wins
- W5-4 staleness check runs post-selection on the chosen profile
- Staleness does NOT trigger fallback; confidence attenuation only
- `LoadedExecutionProfile.source` preserved (tells downstream code which tier was used)

**Test Coverage:** ✅ 16/16 passing in `profileFallback.test.ts`
- Fresh profile → confidence: 1
- Stale (count only) → confidence: 0.5
- Stale (age only) → confidence: 0.5
- Stale (both count + age) → confidence: 0.5 (single attenuation)
- Custom attenuation option and clamping behavior
- No profile → no error
- W5-3 staleness does not trigger fallback behavior
- Full repo: Forge 644/647 tests passing (no new failures)

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts` — `loadExecutionProfile()` implementation, types, threshold constants
- `packages/skillsmith-runtime/src/__tests__/profileFallback.test.ts` — 16 tests covering staleness scenarios

**Rationale:**
- Closes trust gap: Prescriber confidence now reflects profile recency, not just structure
- Configurable thresholds (50 sessions, 7 days) balance staleness detection with profile lifecycle
- Confidence attenuation (0.5×) is conservative — allows fallback via W5-3 if available, or lets consumer decide to refresh
- No Cairn schema changes — uses existing `updatedAt` and session counter relationship
- No auto-refresh or notification surface added; those remain future product decisions

**Deferred Follow-ups:**
- Explicit profile last-update session counter would strengthen count-threshold semantics; deferred to future Cairn schema work
- Auto-refresh, notification surface, or Forge prescriber behavior changes deferred to Phase 5 Curator work
- Confidence attenuation factor (0.5) is hardcoded; making it configurable deferred to product input

**Commit:** 96f7d6e (phase-4.6/w5-4-staleness-attenuation)

### Phase 4.6 Wave 5 Wave B Complete (2026-05-25)

**Status:** ✅ Wave A (W5-1, W5-3) landed + Wave B (W5-2, W5-4) landed locally on isolated branches

**Wave A Completion:**
- ✅ **W5-1 (commit 8b0a69a):** Session-kind separation → MCP fallback correctness fixed; 100/100 tests passing
- ✅ **W5-3 (commit c74463f):** Tier fallback chain extended (per-skill → per-model → per-user → global); 18/18 tests passing; W5-3 does NOT trigger on staleness (W5-4 handles)

**Wave B Completion:**
- ✅ **W5-2 (commit 963a0aa):** Explicit DB threading hard cut (50 files, 1496 LOC refactored); all workspaces green; removes ambient global state
- ✅ **W5-4 (commit 96f7d6e):** Staleness confidence attenuation (16 tests covering count/age/both scenarios); confidence scaled 0.5× when stale

**Phase 4.6 Completion Criterion Met:**
- Wave 5 Shape approved (2026-05-25)
- Wave A landed on isolated branches (W5-1, W5-3)
- Wave B landed on isolated branches (W5-2, W5-4)
- All four commits ready for Aaron to review and merge (PR creation deferred per wave-4 pattern)

**Next Step:** Aaron to review and open PRs:
1. W5-1 base=main
2. W5-3 base=main
3. W5-4 base=W5-3 (depends on tier fallback selection logic)
4. W5-2 base=main (can merge independently; no functional dependencies)

**Wave 6 Backlog (on hold until Wave 5 PRs land):**
- W5-5: MCP surface for forceRegenerate (needs W5-1 prerequisite + Aaron's UX policy input on confirmation prompts)
- W5-6: Metrics dashboard (product shape undefined; needs Aaron's surface decision: CLI report vs. MCP resource vs. new package)

**Test Status Summary:**
- `@akubly/cairn`: All unit tests ✅
- `@akubly/forge`: 644/647 (no new failures from W5 work)
- `@akubly/runtime-cli`: 9/9 ✅
- `@akubly/skillsmith-runtime`: 24/24 ✅ (includes W5-1, W5-3, W5-4 integration)
- **Repo-wide:** All targeted tests green; Windows worktree safety validated

**Full Repo Test Status:** Skillsmith-runtime 18/18 ✅; Forge 644/647; runtime-cli 9/9; build clean.

**Commit:** c74463f (phase-4.6/w5-3-tier-fallback)

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

**Test Coverage:** ✅ 100/100 passing
- Migration schema validation
- `getMostRecentUserSession()` filtering excludes system sessions
- MCP fallback with `__system__` as most-recent returns user session instead
- All four MCP endpoints attribute correctly
- Full Cairn: 597/597 passing
- Skillsmith runtime: 8/8 passing
- Wave 4 integration: 14/14 passing

**Files Modified:**
- `packages/cairn/src/db/migrations/014-session-kind.ts` (new)
- `packages/cairn/src/db/schema.ts` (registered migration)
- `packages/cairn/src/db/sessions.ts` (new API functions, ensureSystemSession update)
- `packages/cairn/src/mcp/server.ts` (four call sites using getUserSessionForMcpFallback)
- `packages/cairn/src/__tests__/db.test.ts` and `mcp.test.ts` (new tests)

**Deferred:** I10 (Curator system-event filtering) — depends on W5-1 but is a cloud telemetry design decision (Phase 5).

### Design Decision W5-2: Explicit DB Threading Hard Cut (Roger, 2026-05-25)

**Status:** ✅ Implemented — All 50+ files refactored; explicit db parameter threaded through Cairn/Forge/runtime

**Context:** Wave 5 test infrastructure revealed fragile coupling: 12+ Cairn public helpers relied on singleton `getDb()` fallback. Tests passed locally but failed in concurrent/worktree scenarios due to ambient global state. Standardizing to explicit db parameter enables deterministic test setups and future parallelization.

**Resolution:** Hard-cut public DB helpers to accept explicit `db: Database.Database` parameter as first positional argument. Removed all singleton fallback overloads.

**Signature Pattern:**
```typescript
// Before
export function getPreference(key: string, sessionId?: string): string | undefined {
  const db = getDb();
  // ...
}

// After
export function getPreference(
  db: Database.Database,
  key: string,
  sessionId?: string,
): string | undefined {
  // ...
}
```

**Helpers Killed:**
- `logEventWithDefaultDb()` — removed
- Deprecated `logEvent(sessionId, ...)` overload — removed
- `getExecutionProfileWithDb()` — collapsed into `getExecutionProfile(db, ...)`
- Deprecated fallback overload from `ensureSystemSession()` — removed

**Structural Changes:**
- `curate()` captures one db handle and passes it into detector helpers
- `runSessionStart()` passes db into stale-session checks and DB counters
- MCP server initialization stores explicit db handle after `ensureDb()`
- Tests keep explicit per-test db handles instead of relying on ambient singleton reads

**Files Modified:** 50+ files across Cairn, Forge, runtime-cli, skillsmith-runtime

**Test Coverage:** All workspaces green
- Cairn: 597/597 passing
- Forge: 644/647 (3 pre-existing todos)
- Runtime-CLI: 9/9 passing
- Skillsmith-runtime: 24/24 passing

**Deferred Follow-ups:**
- `getDb()` remains as connection factory for process entry points and test setup
- Some tests still use singleton factory to create db, then pass handle explicitly
- Root `npm test` stalls under shared CLI TTY when npm wraps Vitest; direct workspace tests pass

### Design Decision W5-3: Global Tier Fallback Semantics (Rosella, 2026-05-25)

**Status:** ✅ Implemented — Tier fallback chain extended; all tests passing

**Context:** `loadExecutionProfile()` only checks `per-skill` → `global`, skipping `per-model` and `per-user` tiers. DB schema (migration 011) already supports all four granularities; the read path is incomplete.

**Resolution:** Extend fallback chain from `per-skill` → `global` to `per-skill` → `per-model` → `per-user` → `global`.

**Final API Surface:**
```typescript
export interface TierFallbackContext {
  modelId?: string;
  userId?: string;
}

function loadExecutionProfile(
  db: RuntimeDb,
  skillId: string,
  fallbackContext?: TierFallbackContext
): LoadedExecutionProfile | null;

export type LoadedProfileSource = 
  | 'per-skill'
  | 'per-model'
  | 'per-user'
  | 'global';
```

**Chain-Walking Algorithm:**
1. Always query `per-skill` first
2. If `modelId` present, query `per-model` 
3. If `userId` present, query `per-user`
4. Always query `global` last
5. Return first non-null row as complete profile; do not blend tiers
6. Missing identity keys skip their tiers
7. Staleness intentionally ignored by selection (W5-4 handles post-selection)

**Test Coverage:** ✅ 18 passing tests
- Per-skill tier selection
- Per-model tier fallback when per-skill missing
- Per-user tier fallback when per-model missing
- Global tier fallback as final chain
- Partial context (modelId only, userId only, both)
- Missing identity keys skip their tiers
- Staleness intentionally ignored by selection

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts` — loadExecutionProfile() and types
- Tests — tier fallback unit tests

**Scope Notes:** No Cairn schema, migration, or Forge prescriber changes required.

### Design Decision W5-4: Profile Staleness Confidence Attenuation (Rosella, 2026-05-25)

**Status:** ✅ Implemented — Runtime profiles now carry staleness annotation + confidence scaling

**Context:** Execution profiles carry `updatedAt` but nothing checks it. Prescriber confidence reflects profile quality, yet stale profiles (unchanged for 50+ sessions or 7+ days) still emit `confidence: 1`. Safety gate needed to prevent misleading trust in outdated data.

**Resolution:** `loadExecutionProfile()` returns profiles with staleness annotation and attenuates confidence.

**Staleness Shape:**
```typescript
staleness: {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
}
```

Fresh profiles: `confidence: 1` (unchanged).  
Stale profiles: `confidence * 0.5` (attenuated exactly once, even when both thresholds trip).

**Threshold Defaults:**
- **Count threshold:** Stale when `sessions_since_install - profile.sessionCount > 50`
- **Age threshold:** Stale when `now - profile.updatedAt > 7 days`
- Either threshold triggers staleness; both produce `reason: 'count+age'`
- Attenuation factor: `0.5` exactly once

**Composition with W5-3:**
- W5-3 tier selection runs first (per-skill → per-model → per-user → global)
- W5-4 staleness check runs post-selection on chosen profile
- Staleness does NOT trigger fallback; confidence attenuation only
- `LoadedExecutionProfile.source` preserved

**Test Coverage:** ✅ 24 passing tests in skillsmith-runtime
- Fresh profile → confidence: 1
- Stale (count only) → confidence: 0.5
- Stale (age only) → confidence: 0.5
- Stale (both count + age) → confidence: 0.5 (single attenuation)
- Custom attenuation option and clamping
- No profile → no error
- W5-3 staleness does not trigger fallback behavior

**Files Modified:**
- `packages/skillsmith-runtime/src/index.ts` — loadExecutionProfile() staleness logic, types, thresholds
- `packages/skillsmith-runtime/src/__tests__/profileFallback.test.ts` — 16 staleness tests

**Deferred Follow-ups:**
- Explicit profile last-update session counter would strengthen count-threshold semantics (future Cairn work)
- Auto-refresh, notification surface, or Forge prescriber behavior changes deferred to Phase 5

### Wave 5 Integration & Merge Strategy (Roger, 2026-05-26)

**Status:** ✅ Integration branch resolves all inter-dependencies

**Integration Branch:** `phase-4.6/wave-5-integration`

**Recommended Merge Order:**
1. **W5-1 session-kind** (clean merge)
2. **W5-3 tier fallback** (clean merge)
3. **W5-4 staleness attenuation** (depends on W5-3 tier fallback logic; stacks cleanly)
4. **W5-2 explicit DB hard-cut** (cross-cutting; apply last to thread new APIs once)

**Conflict Resolution Summary:**
- **W5-1:** Clean merge
- **W5-3:** Clean merge
- **W5-4:** Conflict in `.squad/identity/now.md` — kept main's completed Wave 5 status (newer, reflected all four isolated branches)
- **W5-2:** Code conflicts in:
  - migration 012 tests
  - `packages/cairn/src/db/sessions.ts`
  - `packages/cairn/src/mcp/server.ts`
  - `packages/skillsmith-runtime/src/index.ts`
  - Root cause: stale W5-3 test under W5-2's public API hard-cut; fixed by passing explicit `db` parameter

**Test Validation (Post-Integration):**
- `npm run build`: clean ✅
- `npm test`: green across all workspaces ✅
- Cairn: 597/597 passing
- Forge: 644 passed + 3 pre-existing todo = 647 total
- Runtime-CLI: 9/9 passing
- Skillsmith-runtime: 24/24 passing

**Note on Forge "644/647":** Not failures. Three are pre-existing `it.todo` placeholders:
- `prescribers-vectors.test.ts`: prompt-optimizer negative meanNetImpact confidence penalty (todo)
- `prescribers-vectors.test.ts`: token-optimizer negative meanNetImpact confidence penalty (todo)
- `weight-consistency.test.ts`: cross-package weight consistency (todo)

**PR Strategy Recommendation:**
Prefer one integration PR from `phase-4.6/wave-5-integration`. The isolated branches were green, but value is in resolved interaction between W5-1's session APIs, W5-3/W5-4 runtime profile behavior, and W5-2's explicit DB hard-cut. If separate review units desired, use four PRs in same order and include runtime-cli test fix on W5-2 PR.

---

## Archived Decisions

See decisions-archive.md for Wave 1, Wave 2, Wave 3, and earlier Cycle 1 decisions.


---

# Issue #17 — Async IO Sweep Summary

**Date:** 2026-05-26  
**Author:** Laura (Tester)  
**Branch:** `issue-17/async-io-sweep`

---

## Scope Swept

5 focus areas per spec, in priority order:

1. Cairn DB layer (db/index.ts)
2. skillsmith-runtime composition root (src/index.ts + hooks/sessionStart.ts)
3. runtime-cli commands (cli.ts)
4. Forge prescribers (prescribers/)
5. MCP server handlers (mcp/server.ts) + hook entry points

---

## Findings Count by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| **HIGH** (blocking, must fix) | 0 | — |
| **MEDIUM** (addressable, improves correctness) | 0 | — |
| **LOW** (informational, guard verified) | 2 | resolveAndReadSkill sync IO; gitContext execSync |
| **ACCEPTABLE** (expected, leave as-is) | 3 | DB init; applier file writes; discovery scan |
| **CLEAN** (no IO) | 3 | Forge prescribers; skillsmith-runtime; runtime-cli |

**Total: 0 required fixes. 8 areas swept. 12 tests added.**

---

## Key Recommendations

1. **No async conversion needed.** The MCP stdio transport is serial — sync IO cannot starve other requests. Converting would add `async` complexity with no practical benefit.

2. **Guards are the invariants, not sync-vs-async.** The important properties are: size limit (1 MB), timeout (2000ms on execSync), and error-handling (all guards produce correct error responses). All three verified.

3. **`resolveAndReadSkill` is the correct pattern** for MCP file IO: extract to a helper, apply name/size/read guards, test the helper directly. Other handlers should follow this pattern if they ever need file IO.

4. **W5-5 (`forge_prescribe` MCP handler)** is not yet landed. Test plan written at `.squad/decisions/inbox/laura-w5-5-async-test-plan.md`. Rosella should integrate these 5 tests when W5-5 ships.

---

## Tests Added

File: `packages/cairn/src/__tests__/mcp-async-io.test.ts` (12 tests, all passing)

- 8 tests: `resolveAndReadSkill` guard behaviors (name check, size limit, read error, success path, relative path, directory append)
- 2 tests: `gitContext.ts` structural — timeout guards and stdio pipe flags present
- 2 tests: MCP server structural — sync IO isolated to `resolveAndReadSkill` only, helper call sites counted

Code change: exported `resolveAndReadSkill` and `isSkillFileError` from `mcp/server.ts` to enable direct testing. No behavior change.

---

## W5-5 Coverage

Branch `phase-4.6/w5-5-mcp-forge-prescribe` does **not** exist at sweep time.

Test plan written: `.squad/decisions/inbox/laura-w5-5-async-test-plan.md`  
Covers: Promise return check, CairnEvent fail-open, sequential re-use safety, forceRegenerate semantics, structural no-inline-fs assertion.


---

# W5-5 Async-Correctness Test Plan

**Date:** 2026-05-26  
**Author:** Laura (Tester)  
**Target branch:** `phase-4.6/w5-5-mcp-forge-prescribe` (not yet landed)  
**Status:** PLAN — for Rosella to integrate when W5-5 ships

---

## Context

W5-5 adds a `forge_prescribe` MCP tool handler to the Cairn MCP server. Based on the W5-5 intent (surfacing forge-prescribe via MCP) and the async-IO sweep findings on the existing server, these tests should be written before the handler goes to review.

---

## Test File

When W5-5 lands, add these tests to a new or existing file:  
`packages/cairn/src/__tests__/mcp-forge-prescribe.test.ts`

Or append to `mcp-async-io.test.ts` if scope is limited.

---

## Required Tests

### A. Handler does not block on sync IO

```typescript
describe('forge_prescribe MCP tool — async correctness', () => {
  it('handler returns a Promise (not a sync value)', () => {
    // Call the handler directly (import the backing function, not through
    // McpServer transport). Assert the return value is a Promise.
    // This catches the case where someone accidentally calls runForgePrescribe
    // without await or returns a sync result.
    const result = forgePrescriberHandler({ skill_id: 'test-skill', ...defaultArgs });
    expect(result).toBeInstanceOf(Promise);
  });
```

### B. CairnEvent write does not block tool response

The W5-5 handler is expected to write a `CairnEvent` (hint_state_transition or similar) after prescribing. This event log write should:

```typescript
  it('CairnEvent write failure does not block the tool response', async () => {
    // Stub logEvent to throw
    vi.spyOn(cairnDb, 'logEvent').mockImplementationOnce(() => {
      throw new Error('DB full');
    });

    // Handler should still return a successful response (fail-open)
    const result = await forgePrescriberHandler({ skill_id: 'test-skill', ...defaultArgs });
    expect(result.isError).toBeUndefined(); // or isError: false
    expect(result.content[0].text).not.toContain('DB full');
  });
```

### C. Multiple sequential invocations do not serialize on shared state

better-sqlite3 is synchronous — "concurrent" here means sequential calls on the same DB handle. Two invocations back-to-back must each complete cleanly:

```typescript
  it('two sequential invocations complete without shared-state corruption', async () => {
    // Note: better-sqlite3 is synchronous — no actual parallelism.
    // This test validates DB singleton re-use is safe across calls.
    const result1 = await forgePrescriberHandler({ skill_id: 'skill-a', ...defaultArgs });
    const result2 = await forgePrescriberHandler({ skill_id: 'skill-b', ...defaultArgs });

    // Each result should be independent
    const parsed1 = JSON.parse(result1.content[0].text);
    const parsed2 = JSON.parse(result2.content[0].text);
    expect(parsed1.skill_id).toBe('skill-a');
    expect(parsed2.skill_id).toBe('skill-b');
  });
```

### D. Handler respects forceRegenerate flag

```typescript
  it('forceRegenerate: true expires active hints before inserting new ones', async () => {
    // Seed an active hint for skill-a
    const db = getDb(':memory:');
    insertOptimizationHint(db, { ...seedHint, skillId: 'skill-a', status: 'active' });

    await forgePrescriberHandler({ skill_id: 'skill-a', force: true, ...defaultArgs });

    const active = db.prepare(
      "SELECT * FROM optimization_hints WHERE skill_id = ? AND status = 'active'"
    ).all('skill-a');
    // After force, old hint should be expired
    expect(active).toHaveLength(0); // or 1 if new hint was inserted
  });
```

### E. Handler does not perform sync readFileSync / statSync inside tool body

```typescript
  it('forge_prescribe handler body contains no inline fs.readFileSync or statSync calls (structural)', () => {
    const serverPath = fileURLToPath(new URL('../mcp/server.ts', import.meta.url));
    const source = fs.readFileSync(serverPath, 'utf8');

    // Find the forge_prescribe registration block
    const handlerStart = source.indexOf("'forge_prescribe'");
    const handlerEnd = source.indexOf('\n);\n', handlerStart);
    const handlerBody = source.slice(handlerStart, handlerEnd);

    // Handler should call runForgePrescribe (async), not inline fs calls
    expect(handlerBody).not.toMatch(/fs\.(readFileSync|statSync|existsSync)\b/);
    expect(handlerBody).toContain('runForgePrescribe');
    expect(handlerBody).toContain('await');
  });
```

---

## Integration with Existing Pattern

The W5-5 handler should follow the same pattern as `run_curate`:
- Wrap in try/catch with error response
- Use `ensureDb()` first  
- CairnEvent logging in a nested try/catch (fail-open)
- Return structured JSON content

All existing MCP tool handlers follow this pattern. `forge_prescribe` should too.

---

## Notes for Rosella

1. better-sqlite3 is synchronous — there is no actual concurrency risk. "Concurrent invocation" tests verify sequential re-use safety, not parallel execution.
2. The CairnEvent write test is the most important of these five. An unguarded DB write in the success path would leave the handler stuck if the DB is full or locked.
3. Use `:memory:` DBs in all tests (see history.md for the singleton import pattern).
4. Run `npm test --workspace=@akubly/cairn` before declaring done.


---

# W5-5 Post-Review Fixes

**Date:** 2026-05-26
**Author:** Rosella
**Branch:** `phase-4.6/w5-5-rosella-mcp-forge-prescribe`
**Commit:** 5065082

---

## Build Break Root Cause

**Error:** TypeScript `TS2345` — `McpToolResult` was not assignable to the MCP SDK's `CallToolResult` type because it lacked the required index signature.

**Root cause:** The `@modelcontextprotocol/sdk` `registerTool` callback expects a return type of `{ [x: string]: unknown; content: ...; isError?: ... }`. A custom interface without `[key: string]: unknown` fails the assignability check under strict project-references build (`tsc --build`).

**Fix already present:** The index signature was added in the original commit (`9499cb0`) before the push. Root `npm run build` confirmed clean on the branch. Roger's report was based on a pre-fix snapshot.

**Pattern to remember:** Any custom type returned from an MCP SDK `registerTool` callback must carry `[key: string]: unknown` — it's part of `CallToolResult`'s contract. Inline return objects satisfy this automatically; named interfaces need the explicit index signature.

---

## CairnEvent Fail-Open Fix

**Problem (identified by Laura):** The original `cairn.logEvent()` call in the handler was unguarded. A DB write failure (full disk, lock contention, broken connection) would propagate as an unhandled exception and turn a successful prescriber run into an MCP tool error response.

**Fix:** Wrapped the entire event-log block (`ensureSystemSession` + `logEvent`) in a `try/catch`. Failures are written to `process.stderr` with context (`skill=X`) but do not surface to the caller.

```typescript
// Before (line 114 original):
cairn.logEvent(db, logSessionId, 'prescriber_run', payload);

// After:
try {
  const logSessionId = session?.id ?? cairn.ensureSystemSession(db);
  // ... build payload ...
  cairn.logEvent(db, logSessionId, 'prescriber_run', payload);
} catch (eventErr) {
  process.stderr.write(`[skillsmith-runtime] prescriber_run event write failed ...`);
}
```

**Why fail-open:** The prescriber result (inserted/skipped/errored counts) is the primary value the MCP caller needs. Observability is secondary. If the event DB is unavailable, operators still get their hints — the missing event is a logging gap, not a functional failure.

---

## New Tests Added (+4, total 48)

| Test | Suite | What it covers |
|------|-------|---------------|
| `logEvent throws → tool returns ok:true` | `fail-open` | Core fail-open guard |
| `ensureSystemSession throws → tool still succeeds` | `fail-open` | Full event-log block is guarded |
| `handler.ts contains no inline fs.readFileSync/statSync` | `structural` | Hot-path filesystem access guard |
| `forgePrescribeHandler returns a Promise` | `structural` | Async-correctness baseline |

Tests C (sequential invocations) and D (forceRegenerate flag) from Laura's plan are already covered by the existing integration and edge-case suites.


---

# Decision: W5-5 forge_prescribe MCP Tool

**Date:** 2026-05-26
**Author:** Rosella (Plugin Dev)
**Status:** Implemented — branch `phase-4.6/w5-5-rosella-mcp-forge-prescribe`, commit 9499cb0

---

## Tool Signature

```typescript
server.registerTool(
  'forge_prescribe',
  {
    inputSchema: {
      skill_id:  z.string(),              // required — skill to prescribe for
      force:     z.boolean().optional(),  // default: false — expire active hints before run
      repo_key:  z.string().optional(),   // optional — repo scope for session lookup
    },
  },
  async ({ skill_id, force, repo_key }) => { ... }
)
```

**Returns:** Full `ForgePrescribeResult` JSON (ok, skillId, profileSource, inserted/skipped/errored/totalHints).

**Error handling:** Structured `{ ok: false, message: '...' }` on no-profile or run failure; never throws unhandled. `isError: true` set on the content result so MCP hosts render it appropriately.

---

## CairnEvent Shape

Event type: `prescriber_run`

```typescript
interface PrescriberRunEventPayload {
  skill_id:     string;
  force:        boolean;
  session_id:   string | null;        // resolved user session id; null = no user session found
  profile_used: LoadedProfileSource | null;  // 'per-skill' | 'per-model' | 'per-user' | 'global'
  confidence:   number | null;        // attenuated confidence from loaded profile pre-run
  ts:           string;               // ISO timestamp of MCP invocation
  result: {
    inserted:   number;
    skipped:    number;
    errored:    number;
    total_hints: number;
  };
}
```

**Omissions vs Aaron's spec:**
- `autoApplyEligible` omitted — it's a per-hint field, not meaningfully aggregated at run level. Including a boolean aggregate would be semantically ambiguous (any vs all eligible). Deferred for future consideration if a use case emerges.

**No migration needed.** `event_log.event_type` is a free-text string; payload is a schemaless JSON blob. The TypeScript interface above is documentation only.

---

**CORRECTION (cycle-1 fix):** The shipped payload uses **camelCase** keys, not snake_case. The actual schema is:

```typescript
interface PrescriberRunEventPayload {
  skillId:       string;
  triggeredBy:   string;               // 'mcp:forge_prescribe'
  force:         boolean;
  sessionId:     string | null;        // resolved user session id; null = no user session found
  profileSource: LoadedProfileSource | null;  // 'per-skill' | 'per-model' | 'per-user' | 'global'
  confidence:    number | null;        // attenuated confidence from loaded profile pre-run
  ts:            string;               // ISO timestamp of MCP invocation
  result: {
    inserted:   number;
    skipped:    number;
    errored:    number;
    totalHints: number;                // camelCase, not total_hints
  };
}
```

The cycle-1 fix realigned the payload keys to match codebase convention (camelCase for JSON payloads). See handler.ts:102-118 for the canonical payload construction.

---

## Session Fallback Semantics

1. `repo_key` provided → `cairn.getActiveUserSession(db, repo_key)` — most-recent active user session for that repo.
2. `repo_key` absent → `cairn.getMostRecentUserSession(db)` — most-recent active user session across all repos (W5-1 session-kind separation ensures `__system__` sessions are excluded).
3. No user session found → `cairn.ensureSystemSession(db)` used as event log target. `session_id: null` recorded in payload so consumers know attribution was unavailable.

**Rationale:** Mirrors the `getUserSessionForMcpFallback(db, repoKey?)` pattern from `@akubly/cairn/src/mcp/sessionFallback.ts` without pulling in cairn's internal mcp module. Avoids circular dep; the session APIs (`getActiveUserSession`, `getMostRecentUserSession`) are exported from cairn's barrel.

---

## Architecture Note: Two-Server Design

The `forge_prescribe` tool lives in `@akubly/skillsmith-runtime`, not `@akubly/cairn`. This is required by the dependency graph:

```
cairn ← skillsmith-runtime
```

Placing the tool in cairn would create a circular dependency. The forge MCP server (`dist/mcp/server.js`) is registered separately in `.mcp.json` alongside cairn's server. This is intentional; Graham's W5-5 skeleton documents the forced aggregator question for Wave 7.

**Server entry point:** `bin: { "forge-mcp": "dist/mcp/server.js" }` in `packages/skillsmith-runtime/package.json`.

---

## Deviations from Task Spec

| Spec | Implemented | Reason |
|------|-------------|--------|
| `autoApplyEligible` in event | Omitted | Per-hint field; run-level aggregate undefined |
| Branch `phase-4.6/w5-5-mcp-forge-prescribe` | `phase-4.6/w5-5-rosella-mcp-forge-prescribe` | Concurrent agent activity caused branch name collision |
| `db_path` arg (Graham's skeleton) | Not included | Aaron's approved spec uses `repo_key`; `db_path` is a server-startup concern |

---

# Decision: W5-6 forge-metrics CLI Implementation

**Date:** 2026-05-26  
**Author:** Roger (Platform Dev)  
**Status:** Implemented — commit `871a492` on `phase-4.6/wave-6`

---

## Command Signature

```
forge-metrics --skill <skill_id> [--format json|table] [--repo-key <key>] [--db <path>]
```

| Flag | Required | Default | Notes |
|------|----------|---------|-------|
| `--skill` | ✅ | — | Skill ID to report |
| `--format` | No | `json` | `json` or `table` |
| `--repo-key` | No | most-recent user session | Fallback via `getMostRecentUserSession()` |
| `--db` | No | `getKnowledgeDbPath()` | Override SQLite path |

---

## JSON Schema (SkillMetrics — stable contract)

```typescript
interface SkillMetrics {
  skillId: string;
  repoKey: string | null;
  queriedAt: string;                // ISO-8601
  profile: SkillMetricsProfile;     // discriminated union: {found:true,...} | {found:false}
  staleness: SkillMetricsStaleness | null;
  confidence: SkillMetricsConfidence | null;
  autoApplyEligible: boolean | null;
  recentPrescriberRuns: SkillMetricsPrescriberRun[] | null;
}

type SkillMetricsProfile =
  | { found: true; tier: string; sessionCount: number; updatedAt: string; daysSinceUpdate: number }
  | { found: false };

interface SkillMetricsStaleness {
  stale: boolean;
  reason: 'count' | 'age' | 'count+age' | null;
  sessionsSinceUpdate: number;
}

interface SkillMetricsConfidence {
  raw: number;        // Always 1.0 for DB profiles
  attenuated: number; // raw * 0.5 when stale, else raw
  isAttenuated: boolean;
}
```

**Schema stability contract:** fields are additive; removals require a major version bump.

---

## Table Format

Sections: Identity → Profile → Staleness → Confidence → Auto-Apply → Recent Prescriber Runs.  
One key-value row per metric. Width: 32-char label column + value column.

---

## W5-5 Graceful Degradation

`recentPrescriberRuns` has three states:
- `null` — `prescriber_run` event type not present (W5-5 not landed)
- `[]` — event type exists but no runs recorded for this skill
- `[{...}]` — parsed run events, most-recent first, capped at 10 (default)

Implemented as a defensive `try/catch` around `json_extract(payload, '$.skillId')` query.

---

## W5-3 / W5-4 Integration Points

| Feature | How consumed |
|---------|-------------|
| W5-3 tier fallback | `loadExecutionProfile(db, skillId, { fallbackPolicy: 'full-chain' })` |
| W5-3 tier reporting | `loaded.source` field ('per-skill' \| 'per-model' \| 'per-user' \| 'global') |
| W5-4 staleness attenuation | `profile.staleness` (stale flag + reason) on returned profile |
| W5-4 attenuated confidence | `profile.confidence` on returned profile (0.5× if stale) |
| W5-2 explicit db | All DB calls thread explicit `db` handle |
| W5-1 session-kind | `getMostRecentUserSession()` for `--repo-key` fallback |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (even if no profile found — JSON output describes the state) |
| 2 | Argument error or runtime failure |

---

## Files

- `packages/runtime-cli/src/metrics/types.ts`
- `packages/runtime-cli/src/metrics/loadMetrics.ts`
- `packages/runtime-cli/src/metrics/formatters.ts`
- `packages/runtime-cli/src/forge-metrics.ts`
- `packages/runtime-cli/src/__tests__/forgeMetrics.test.ts` (13 tests)
- `packages/runtime-cli/package.json` (added `forge-metrics` bin entry)

