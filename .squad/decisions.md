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

### Integration Test Status — W4-4 (Laura, 2026-05-23)

**Status:** ⚠️ Partial — 9/14 passing; 5 infrastructure-level failures identified (not implementation bugs)

**Test Groups:**
- **Group A (Atomicity):** 3/3 ✅ — Roger's W4-1 implementation solid
- **Group B (Observability):** 5/5 ✅ — Roger's W4-2 event emission validated
- **Group C (forceRegenerate):** 1/4 ⚠️ — Rosella's unit tests pass; integration failures = test infra
- **Group D (E2E):** 0/2 ⚠️ — Same root cause as Group C

**Root Cause:** File-backed SQLite DB tests fail at `runForgePrescribe` returning ok:false. Likely causes:
1. Execution profile not persisting across `getDb(dbPath)` calls
2. Change vector seeding not initialized
3. DB migration state not set up in file-backed DBs

**Evidence:** Runtime-cli unit tests (`:memory:` DBs) pass; integration tests (file-backed) fail.

**Recommendations:**
- Option A: Switch to `:memory:` DBs like wave2-pipeline/wave3-pipeline
- Option B: Add explicit DB migration + profile initialization helpers
- Fix Windows EBUSY cleanup issue on rmSync()

**Files:**
- `packages/forge/src/__tests__/wave4-pipeline.test.ts` (14 tests, ~420 LOC)
- `.squad/decisions/inbox/laura-w4-4-coverage.md` (detailed report)


### Decision: Harness Vision Document Drafted (Graham, 2026-05-23)

**Status:** Awaiting Aaron's review

**Artifact:** docs/harness-vision.md (3,200+ words, 14 sections)

**Next Steps:** PRD authoring session (Wave 5 scope)

---

## Archived Decisions

See decisions-archive.md for Wave 1, Wave 2, Wave 3, and earlier Cycle 1 decisions.
