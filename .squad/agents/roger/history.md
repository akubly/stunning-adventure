📌 Team update (2026-05-26T22:27:00Z): **Wave 5 integration merge strategy finalized** — W5-1/W5-3/W5-4/W5-2 ordered; all conflicts resolved; root npm run build + npm test green (Cairn 597/597, Forge 644/647). W5 phase-4.6/wave-5-integration ready for PR — Scribe
📌 Team update (2026-05-23T21:20:00Z): **Wave 4 W4-1 & W4-2 complete** — insertHintIfNew atomicity (migration 013, partial UNIQUE index, BEGIN IMMEDIATE) + CairnEvent extensions (hint_state_transition, profile_bump events, system session). All unit tests passing; integration Groups A & B both 5/5+3/3. 584 Cairn tests green. — Scribe

# Roger — History

**Role:** Composition root architecture (R2: @akubly/skillsmith-runtime), Wave 2-4 integration, atomicity + observability fixes

**Wave 5 Status:** All inter-dependencies resolved on phase-4.6/wave-5-integration. Cairn 597/597 + Forge 644/647 tests passing. Root build green.

**Wave 4 Work (W4-1 & W4-2):**
- W4-1: insertHintIfNew atomicity via migration 013 (partial UNIQUE index) + BEGIN IMMEDIATE transaction
- W4-2: CairnEvent extensions (hint_state_transition, profile_bump events, __system__ session)

**Wave 3 Complete:** Composition root delivered (option R2). Hook wiring done. Per-skill orchestration live.

**Learnings summarized to history-archive.md**
- Events logged to `__system__` session created via `ensureSystemSession()` helper
- Payload structure: `{skill_id, hint_id/profile_id, from_state/to_state or bump_kind, granularity, timestamp}`
- Added 5 unit tests covering event emission scenarios
- Files: `packages/cairn/src/db/optimizationHints.ts`, `packages/cairn/src/db/executionProfiles.ts`, `packages/cairn/src/db/sessions.ts`, `packages/cairn/src/__tests__/cairnEvents.test.ts`
- **Gotcha:** Event emission must occur AFTER transaction commits, not inside the transaction, or events won't be persisted

**Test Results:** 584 cairn tests passing, full suite green. Migration number bumped from 012 to 013.

## 2026-05-23: 📌 Wave 4 Complete — W4-1 & W4-2 Implemented

**Status:** ✅ Both work items shipped on phase-4.6/wave-4 branch

**W4-1: insertHintIfNew Atomicity (COMPLETE)**
- Migration 013 with partial UNIQUE index on (skill_id, source, category) WHERE status IN ('pending', 'accepted', 'deferred')
- `db.transaction().immediate()` wrapper prevents concurrent duplicates
- 3/3 concurrent insertion tests passing
- Files: 013-hint-atomicity.ts, optimizationHints.ts, schema.ts (registered), 3 new tests

**W4-2: CairnEvent Extensions (COMPLETE)**
- `hint_state_transition` event on insert + status updates (skill_id, hint_id, from_state, to_state, timestamp)
- `profile_bump` event on create/update (skill_id, profile_id, bump_kind, granularity, timestamp)
- `ensureSystemSession()` helper creates __system__ session for system-level events
- 5/5 observability tests passing (event emission, forward-compat, transactional integrity)
- **Gotcha found and fixed:** Event emission inside transaction loses events; moved emission outside transaction scope
- Files: optimizationHints.ts, executionProfiles.ts, sessions.ts, 5 new tests in cairnEvents.test.ts

**Integration Test Outcomes:**
- Group A (W4-1 atomicity): 3/3 ✅
- Group B (W4-2 observability): 5/5 ✅
- Total W4-1 & W4-2: 8/8 integration passing

**Schema Version:** 012 → 013 (full migration path)

**Cross-Team Coordination Notes:**
- W4-3 (Rosella's forceRegenerate) depends on W4-1 atomicity; expire-then-insert semantics compatible with partial UNIQUE index
- W4-4 (Laura's integration tests) validates all three work items; test infrastructure gaps identified in Groups C/D (not implementation bugs)

---

**Older learnings archived to history-archive.md**

### W5-1 Session-Kind Separation (2026-05-25)

- Migration 014 adds `sessions.session_kind` (`user` default, `system` for `__system__` backfill) instead of renaming repo keys; smallest compatible split that preserves existing session rows.
- New Cairn APIs: `getMostRecentUserSession()` and `getActiveUserSession(repoKey)` return only active `session_kind='user'` rows; `getMostRecentActiveSession()` remains generic for internal/system-aware callers.
- `ensureSystemSession()` now creates/finds system-kind rows so CairnEvents (`hint_state_transition`, `profile_bump`) stay on internal observability sessions.
- Four MCP fallback call sites now route through `getUserSessionForMcpFallback()`: `resolve_prescription` apply session attribution, `lint_skill` telemetry, `test_skill` scenario telemetry, and `test_skill` direct validation telemetry.
- Gotcha: deterministic tests must manually set `started_at` because SQLite `datetime('now')` has second-level precision, so creation order alone can tie.
### W5-2 DB explicit-db hard-cut (2026-05-25)

- Hard-cut Cairn DB public helpers to require an explicit `db: Database.Database` first parameter; removed deprecated/default-db overloads including `logEventWithDefaultDb` and `getExecutionProfileWithDb`.
- Functions changed: 78 exported Cairn DB functions across 14 DB modules.
- Call-site threading touched 1,165 db-threading lines across 32 consumer/test files (Cairn agents/hooks/MCP, Forge wave integration tests, runtime-cli tests, skillsmith-runtime tests).
- Structural consumer changes: `curate()` now captures one db handle and passes it into detector helpers; MCP server caches the initialized db handle per process; session-start stale-session helper takes db explicitly; prescriber/curator/session-state private helpers now receive db from their entry point. Most other consumers were trivial `db` threading.
- Validation: `npm run build` clean. Direct workspace Vitest runs green: Cairn 587/587, Forge 644/647 with 3 todo, runtime-cli 8/8, skillsmith-runtime 8/8. Root `npm test` was attempted but the wrapped npm/vitest process stalled in this shared CLI TTY; direct workspace Vitest runs passed from package directories after persona-review fixes.

## 2026-05-26: Phase 4.6 Wave 5 integration stack

- Built `phase-4.6/wave-5-integration` from `main` with W5-1 → W5-3 → W5-4 → W5-2. Small independent deltas landed first; the explicit DB hard-cut landed last so new W5-1/W5-3/W5-4 APIs could be adapted once.
- Merge hotspots: W5-4 only conflicted in `.squad/identity/now.md`; kept `main`'s completed Wave 5 state. W5-2 conflicted in migration 012 tests, `db/sessions.ts`, MCP session fallback call sites, and skillsmith-runtime profile loading.
- Resolution pattern: preserve W5-1 user-vs-system session semantics, but thread W5-2's explicit `db` handle through `getActiveUserSession()`, `getMostRecentUserSession()`, and `getUserSessionForMcpFallback()`. Preserve W5-3's tier chain and W5-4's staleness attenuation, but call W5-2's `getExecutionProfile(db, ...)` API.
- Scribe's “644/647” was Forge's 644 passing plus 3 pre-existing `it.todo` placeholders, not failing tests. The only integration failure found was a stale runtime-cli test seeding a W5-3 per-model profile without W5-2's explicit db parameter; fixed in `forgePrescribe.test.ts`.
- Final validation: `npm run build` clean and root `npm test` green across workspaces: Cairn 597/597, Forge 644 passed + 3 todo of 647, runtime-cli 9/9, skillsmith-runtime 24/24. If it compiles and ships, the janitor takes the win.

## Learnings (2026-05-26 — W5-6 forge-metrics CLI)

### CLI sub-command pattern (runtime-cli)
- Each CLI sub-command gets its own entry point file (e.g. `src/forge-metrics.ts`) with a `main(argv)` function and a `bin` entry in `package.json`. Tests cover `main()` via `loadMetrics()` + formatter functions; the entry point itself stays thin.
- `parseArgs` from `node:util` handles arg parsing. `strict: true` + `allowPositionals: false` is the standard config — crashes on unknown flags, which is correct for operator tools.
- The `--format` flag pattern (JSON default, `--format table` opt-in) is clean for dual-mode operator tools. Formatters are pure functions on a typed input snapshot — easy to unit test.

### JSON schema design (SkillMetrics)
- Top-level nullable fields (`staleness`, `confidence`, `autoApplyEligible`) collapse to `null` when no profile is found. This gives a stable schema: callers always see the same top-level keys.
- The "found: boolean" discriminated union on `profile` is clean for both JSON and TypeScript narrowing.
- `recentPrescriberRuns: null` means "event type not present (W5-5 not landed)"; `[]` means "event type exists but no runs for this skill". Two distinct null states encoded intentionally.

### Integration with W5-3 (tier fallback) and W5-4 (staleness attenuation)
- Call `loadExecutionProfile(db, skillId, { fallbackPolicy: 'full-chain' })` — that's the operator path, same as `runForgePrescribe`. The returned `source` field reports which tier matched.
- The returned `profile.confidence` is already attenuated if stale. `profile.staleness.stale` tells you whether attenuation was applied. Raw confidence is always `1.0` for DB profiles (no raw stored).
- `getSessionsSinceInstall()` reads from `prescriber_state.sessions_since_install`, NOT from `SELECT COUNT(*) FROM sessions`. Tests must use `UPDATE prescriber_state SET sessions_since_install = N WHERE id = 1` to seed staleness conditions, not `createSession()`.

### Defensive W5-5 coding pattern
- Query `prescriber_run` events with `json_extract(payload, '$.skillId') = ?`. If no events of that type exist anywhere, return `null` (event type not landed). If they exist but none for this skill, return `[]`.
- Wrap the entire query in try/catch and degrade to `null` on any error — metrics reads should never crash the command.


