📌 Team update (2026-05-26T22:27:00Z): **Wave 5-5 post-review complete** — W5-5 MCP forge_prescribe build break fixed (root: McpToolResult missing [key:string]:unknown index sig). +4 fail-open/structural tests from Laura's plan (5065082 + 4a4df6f). Tests 44→48 passing, root npm run build green ✅ — Scribe
📌 **Wave 6 integrated onto phase-4.6/wave-6 (2026-05-26)** — W5-5 MCP forge_prescribe tool + fail-open prescriber_run CairnEvent preserved as commits 9499cb0, 5065082, 4a4df6f. Integration complete with W5-6 (Roger) + #17 (Laura). Awaiting Aaron's /review-cycle. — Scribe
📌 Team update (2026-05-24T07:27:41Z): **Wave 4 W4-4 validation complete** — Laura fixed integration test infrastructure (module singleton fragmentation from mixed import paths). All 14 tests now passing. W4-3 forceRegenerate implementation validated end-to-end. 644/647 repo tests green. — Scribe
📌 Team update (2026-05-23T21:25:00Z): **Wave 4 W4-3 complete** — forceRegenerate --force CLI knob shipped. Expire-then-insert semantics (UPDATE active hints to expired, then insertHintIfNew). MCP excluded per Aaron's D2 decision. 8/8 unit tests passing. Rosella coordinates with Roger (W4-1 atomicity) + Laura (integration tests). — Scribe
📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
## W4-3: forceRegenerate CLI Knob (2026-05-23)

Shipped `--force` flag for `forge-prescribe` CLI to bypass dedup and re-emit hints.

**Call chain traced:**
- CLI (`packages/runtime-cli/src/cli.ts`) → `runForgePrescribe()` (`packages/skillsmith-runtime/src/index.ts`) → `executePrescriberRun()` → `expireActiveHints()` + `cairn.insertHintIfNew()`

**Implementation:**
- Added `forceRegenerate?: boolean` parameter to `RunForgePrescribeOptions` interface
- When `true`, `executePrescriberRun()` calls `expireActiveHints()` before each `insertHintIfNew()` call
- `expireActiveHints()` UPDATEs hints WHERE (skill_id, source, category) match AND status IN ('pending', 'accepted', 'deferred')
- CLI flag: `--force` (boolean, default: false)
- MCP surface: EXCLUDED per Aaron's D2 decision (Wave 4 scope: CLI only)

**Tests added:**
- 4 new tests in `packages/runtime-cli/src/__tests__/forgePrescribe.test.ts`:
  - forceRegenerate reduces skipped count when active duplicates exist
  - Only expires hints matching (skill_id, source, category)
  - Does not expire terminal-status hints (applied, rejected, expired, etc.)
  - Verification of dedup bypass behavior

**Files modified:**
- `packages/skillsmith-runtime/src/index.ts` — added `expireActiveHints()` helper + `forceRegenerate` parameter threading
- `packages/runtime-cli/src/cli.ts` — added `--force` flag + usage text
- `packages/runtime-cli/src/__tests__/forgePrescribe.test.ts` — added 4 tests

**Verification:** `npm test --workspace=@akubly/runtime-cli` ✅ 8 passing, `npm run build` ✅ green.

**Coordination note for Roger:** W4-3 assumes expire-then-insert semantics. When W4-1 atomicity lands, the UNIQUE constraint will prevent race conditions during the expire→insert window. W4-3 implementation is compatible with W4-1's partial UNIQUE index.

---

# Rosella — History

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

## Learnings — Wave 2 W2-3/W2-7 SqliteChangeVectorProvider (2026-05-22)

- getAllCategories(db, skillId) lives in packages/cairn/src/db/changeVectors.ts. Reads distinct values from optimization_hints.category column for a given skill_id.
- SqliteChangeVectorProvider now lives in packages/cairn/src/db/sqliteChangeVectorProvider.ts and is exported from Cairn's top-level src/index.ts barrel.
- Type reconciliation at DB boundary: getAllCategories() filters raw SQLite category strings through canonical OptimizationCategory union from @akubly/types.
- SqliteChangeVectorProvider.getSummaries() deliberately drops zero-vector summaries to keep downstream orchestration in Phase 4.5 fallback mode.
- Verification: npm run build, npm test --workspace=@akubly/cairn, and root npm test all passed. Cairn 564 passing tests; Forge 599 passing.
- Wave 2 W2-8 applier gate lives in packages/forge/src/applier/optimizer.ts inside applyOptimizations(), before the confidence threshold check. It skips with reason `negative-impact-vector-history` when autoApplyEligible resolves to false.
- The applier resolves autoApplyEligible from the hint's top-level field first, then falls back to hint.evidence.autoApplyEligible for persisted Cairn rows. Missing/undefined still means eligible for backward compatibility.
- Cairn hint dedup now lives in packages/cairn/src/db/optimizationHints.ts via `insertHintIfNew(db, hint): { inserted: boolean; existingHintId?: string }`, and insertOptimizationHint() now routes through that helper.
- Active dedup statuses for optimization hints are pending, accepted, and deferred; terminal states (applied, rejected, expired, suppressed, failed) do not block reinsertion of the same (skillId, source, category) tuple.

## Learnings

### W5-5 Post-Review Fixes (2026-05-26)

- **McpToolResult index signature**: Any named interface returned from an MCP SDK `registerTool` callback must carry `[key: string]: unknown`. Without it, `tsc --build` fails with TS2345 even though inline return objects work fine. Named interfaces need it explicitly; this is a `CallToolResult` SDK contract constraint.
- **Fail-open for observability writes**: CairnEvent log writes in MCP tool handlers must be wrapped in try/catch. A full disk or locked DB should never convert a successful prescriber run into an MCP error response. Pattern: `try { logEvent(...) } catch (err) { process.stderr.write(...) }`. The prescriber result is the primary value; the event is secondary telemetry.
- **Test pattern for fail-open**: Use `vi.spyOn(cairn, 'logEvent').mockImplementationOnce(() => { throw new Error('DB full') })` to inject failures in unit tests. The stub `RunForgePrescribeFn` pattern makes this trivial since the spy applies to the cairn module boundary.
- **Structural test for hot-path fs access**: Read the handler source via `fs.readFileSync(fileURLToPath(new URL('../mcp/handler.ts', import.meta.url)), 'utf8')` and assert no `fs.readFileSync|statSync|existsSync` in handler body. With vitest, `import.meta.url` points to the TypeScript source file so this works without build artifacts.



### W5-3 Tier Fallback (2026-05-25)

- Final API surface: `@akubly/skillsmith-runtime` exports `TierFallbackContext { modelId?: string; userId?: string }`, `LoadedProfileSource = 'per-skill' | 'per-model' | 'per-user' | 'global'`, `LoadedExecutionProfile`, and `loadExecutionProfile(db, skillId, fallbackContext?)`.
- Profile selection is first-match-wins: `per-skill('global')`, optional `per-model(modelId)`, optional `per-user(userId)`, then `global('global')`; missing identity keys skip their tiers instead of querying with `'global'`.
- W5-4 staleness plugs in after `loadExecutionProfile()` returns: inspect the selected `LoadedExecutionProfile.profile.updatedAt`, attenuate confidence if stale, and keep `source` unchanged; the Curator path now caches `LoadedExecutionProfile` internally so source remains available before returning the plain profile contract.
- Existing callers verified untouched at the consumer boundary: Forge prescribers still receive a plain full `ExecutionProfile`; `runForgePrescribe()` and `createPrescriberOrchestrationConfig()` accept no context and preserve per-skill/global behavior.

### W5-4 Profile Staleness Attenuation (2026-05-25)

- Final staleness field shape on runtime-returned profiles: `staleness: { stale: boolean; reason: 'count' | 'age' | 'count+age' | null }` plus annotated `confidence`.
- Default thresholds: count trips when `sessions_since_install - profile.sessionCount > 50`; age trips when `now - profile.updatedAt > 7 days`. If either trips, confidence is multiplied by `0.5` once.
- Composition with W5-3: tier selection remains first-match-wins and sets `LoadedExecutionProfile.source`; staleness runs only after that selected profile is found, preserves `source`, and annotates/scales the selected `profile`.
- Validation: `npm run build` clean; `npm test --workspace=@akubly/skillsmith-runtime` 24 passing; `npm test --workspace=@akubly/forge` 644 passing, 3 todo. No Cairn, migration, runtime-cli, or Forge prescriber changes.

### Wave 3 Shipped (2026-05-23 ~21:08Z)

PR #21 merged as f27a537 on main. 1219 tests passing. 7 work items delivered end-to-end: composition root R2 (`@akubly/skillsmith-runtime`), Curator hook wiring, per-skill orchestration, E2E tests, Phase 5-ready acyclic boundaries. 14 Copilot findings addressed across 4 review cycles. 1 deferral approved: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE) → Wave 4.

---

**Older phase 4.6 cycle work archived to history-archive.md

## 2026-05-23: 📌 Wave 4 Complete — W4-3 Implemented

**Status:** ✅ forceRegenerate CLI knob shipped on phase-4.6/wave-4 branch

**W4-3: forceRegenerate CLI Knob (COMPLETE)**

**Design Choices:**
- Flag name: `--force` (boolean, default: false)
- Semantics: Expire-then-insert (UPDATE active hints to 'expired', then insertHintIfNew())
- Active statuses expired: pending, accepted, deferred only
- Terminal statuses NOT expired: applied, rejected, expired, suppressed, failed
- MCP surface: EXCLUDED per Aaron's D2 decision (CLI-only for Wave 4; MCP deferred to Wave 5)

**Implementation:**
- Call path: CLI → `runForgePrescribe(options)` → `executePrescriberRun({ forceRegenerate })` → `expireActiveHints()` + `insertHintIfNew()`
- SQL: UPDATE optimization_hints SET status = 'expired' WHERE (skill_id, source, category) match AND status IN active_statuses
- Atomicity: Compatible with Roger's W4-1 partial UNIQUE index (no race conditions during expire→insert window)

**Test Results:** ✅ 8/8 unit tests passing
- forceRegenerate reduces skipped count when active duplicates exist
- Only expires hints matching (skill_id, source, category)
- Does NOT expire terminal-status hints
- MCP surface correctly excluded from schema

**Integration Test Status:**
- Group C (W4-3): 1/4 passing (MCP exclusion ✅; 3 failures = test infrastructure issues, not W4-3 bugs)
- Rosella's unit tests validate full W4-3 implementation; integration test failures are file-backed SQLite seeding issues

**Files Modified:**
- packages/skillsmith-runtime/src/index.ts — runtime implementation
- packages/runtime-cli/src/cli.ts — --force flag + usage text
- packages/runtime-cli/src/__tests__/forgePrescribe.test.ts — 4 new tests
- Runtime-CLI test suite: 8/8 passing

**Cross-Team Coordination:**
- **Roger (W4-1):** W4-3 depends on atomicity; expire-then-insert fully compatible with partial UNIQUE constraint
- **Laura (W4-4):** Integration test Group C validates dedup bypass; current failures are test infra, not implementation
- **Graham (Wave 4 scope):** D2 decision (CLI-only) fully honored; MCP deferred to Wave 5 with Phase 5 scope clarity

---

**Older phase 4.6 cycle work archived to history-archive.md**


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
