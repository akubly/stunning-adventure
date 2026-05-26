📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-24T07:27:41Z): **Wave 4 W4-4 validation complete** — Laura fixed integration test infrastructure (module singleton fragmentation from mixed import paths). All 14 tests now passing. W4-1 & W4-2 implementations validated end-to-end. 644/647 repo tests green. — Scribe
📌 Team update (2026-05-23T21:20:00Z): **Wave 4 W4-1 & W4-2 complete** — insertHintIfNew atomicity (migration 013, partial UNIQUE index, BEGIN IMMEDIATE) + CairnEvent extensions (hint_state_transition, profile_bump events, system session). All unit tests passing; integration Groups A & B both 5/5+3/3. 584 Cairn tests green. Roger + Rosella + Laura parallel execution on phase-4.6/wave-4. — Scribe
📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe
📌 Team update (2026-05-22T20:35:00Z): **Wave 2 W2-5 complete** — ForgePrescriberOrchestrator shipped. Attenuation + autoApplyEligible propagation live. ATTENUATION_FLOOR=0.1 exported from @akubly/types. Fail-open on provider errors. Forge tests 609 passing (+10), root build green. — Scribe
📌 Team update (2026-05-22T20:03:56Z): Wave 2 v3.1 scope final — autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2 and ATTENUATION_FLOOR=0.1; CLI surface only — no MCP in Wave 2. — Graham Knight
# Roger — History

## 2026-05-21: Wave 2 v3 Scope Ready — Curator Wiring Deferred to Wave 3

Scribe orchestration complete: Graham's v3 scope finalized and merged to .squad/decisions.md. Key scope decisions:
- ChangeVectorProvider port with async return type for Phase 5 cloud readiness
- Wave 2/3 split: Manual invocation in Wave 2; Curator-driven automatic orchestration deferred to Wave 3
- Hint deduplication via (skillId, source, category) key with active-status filter
- Two-layer negative-impact attenuation: Confidence scaling + eligibility flag (autoApplyEligible)

Ready for Wave 2 implementation (computation + ranking only; runtime wiring follows in Wave 3).

## Learnings (2026-05-23 — W3-1 skillsmith-runtime scaffold)

- `packages/skillsmith-runtime/` follows the repo's standard library package shape: package.json + composite tsconfig + `src/index.ts` + `src/__tests__/` with tests excluded from TypeScript build output.
- Root workspace registration needed only a `tsconfig.json` project reference because the repo already uses the broad `packages/*` workspaces glob. `npm install` then linked the new package into `package-lock.json` automatically.
- This environment's npm rejected `workspace:*` dependency specifiers (`EUNSUPPORTEDPROTOCOL`), so the new package uses the repo's established `"*"` workspace dependency pattern instead.
- W3-1 intentionally leaves `createPrescriberOrchestrationConfig()` and `runForgePrescribe()` as throwing stubs. W3-5 will wire Cairn + Forge composition; W3-2 will make `runtime-cli` delegate into this package.

## Learnings (2026-05-23 — Wave 3 Decisions Accepted by Aaron)

- **W3-D1: Composition Root → R2 ACCEPTED** — New `@akubly/skillsmith-runtime` library package (composition layer importing both `@akubly/cairn` and `@akubly/forge`) + thin `@akubly/runtime-cli` wrapper. Unblocks all Wave 3 work items. Roger owns composition root and runtime-cli packaging.
- **W3-D3: MCP Tool → Dropped from Wave 3** — No MCP tool for manual prescriber invocation in Wave 3. Curator hook is autonomous surface; existing `forge-prescribe` CLI is manual surface. Re-open MCP tool only when concrete operator need materializes.
- **W3-D4: Curator Hook → Always-On** — Automatic invocation enabled; no opt-in flag in v1. Safety margins verified via Wave 2 E2E tests. Profile selection trigger-driven only; global fallback deferred to Wave 4.

## Learnings (2026-05-23 — Wave 3 Composition Root Audit)

- **Five composition root options evaluated** for Wave 3. Current architecture: Cairn and Forge have zero direct coupling (acyclic, port-based). Only `packages/runtime-cli/` bridges them (Wave 2 stepping stone). Audit document: `docs/wave3-composition-root-audit.md`.
- **Recommendation: Option B** (separate `@akubly/runtime` library + thin `runtime-cli` wrapper). Reasoning: Best test isolation, zero build risks, Phase 5-ready architecture. Library stays portable; CLI stays thin.
- **Do not use Option C** (inject Forge into Cairn hooks) — test coupling and build-order dependencies are unacceptable. Create a package instead.
- **Known unknowns deferred to Graham's ADR:** Profile selection strategy (all vs. only-with-vectors), hint persistence ownership, MCP tool shape for prescriber optimization, fail-open semantics on Forge failure during Curator.

## Learnings (2026-05-22 — Wave 2 W2-9 manual CLI surface)

- Wave 2's explicit composition root now lives in `packages/runtime-cli/` with bin name `forge-prescribe`; it's the one package allowed to import both `@akubly/cairn` and `@akubly/forge` without violating the package boundary.
- Local invocation pattern from the repo root is `npx forge-prescribe --skill <id> [--db <path>]`; the root workspace keeps `@akubly/runtime-cli` as a dev dependency so the bin is linked into the local toolchain after `npm install`.
- Profile loading is deterministic: try the canonical per-skill aggregate first (`granularity='per-skill', granularity_key='global'`), then fall back to a skill-scoped `global/global` profile before failing with a clean no-profile result.
- Exit semantics are simple: 0 on successful orchestration (including zero generated hints or dedup skips), 1 when no execution profile exists, and 2 for argument, database, or persistence failures.

## Learnings (2026-05-22 — Wave 2 W2-1 shared change-vector contract)

- Canonical Wave 2 change-vector contracts now live in packages/types/src/index.ts: ChangeVectorSummary, ChangeVectorProvider, NEGATIVE_IMPACT_AUTO_APPLY_GATE, and shared OptimizationCategory.
- Reconciled the two ChangeVectorSummary duplicates by taking Forge's stricter OptimizationCategory union instead of Cairn's plain string. Added autoApplyEligible?: boolean as the additive v3.1 field on the shared contract.
- Verification: root npm run build and root npm test passed before and after the change (1153-test baseline green).

## Learnings (2026-05-23 — W3-2 thin runtime-cli)

- Picked **Option A** for W3-2: `packages/skillsmith-runtime/src/index.ts` now owns the existing `runForgePrescribe()` composition flow (profile load, `SqliteChangeVectorProvider`, Forge prescribers, dedup + persistence) and `packages/runtime-cli/src/index.ts` is just a re-export facade.
- The thinnest stable CLI refactor here is **function re-export + unchanged CLI formatter**. That preserved operator-visible behavior and let the new delegation test assert identity (`runtime-cli` export === `@akubly/skillsmith-runtime` export) without introducing fragile ESM mocking around the bin entry.
- Alexander no longer needs to move manual CLI composition into `skillsmith-runtime` for W3-5; that surface is already live. W3-5 can stay focused on `createPrescriberOrchestrationConfig()` and Curator-facing factory wiring.
- After this refactor, remember to build before package tests that import `@akubly/skillsmith-runtime` by package name; those tests resolve the built workspace export (`dist/`), not the source file directly.

## Learnings (2026-05-23 — W3-6 hook injection bootstrap)

- Picked **R-Hook-A (injection)** for Curator session-start wiring: `packages/cairn/src/hooks/sessionStart.ts` now accepts an optional `PrescriberOrchestrationConfig` and forwards it to `curate()`; Cairn itself still does not import `@akubly/skillsmith-runtime`.
- The production always-on bootstrap now lives in `packages/skillsmith-runtime/src/hooks/sessionStart.ts`, and `.github/hooks/cairn/curate.ps1` resolves that compiled script first. Laura's W3-7 integration test should enter through that skillsmith-runtime hook path, not the bare Cairn hook, so the real orchestration config is present.
- Keeping the script-level composition in the runtime package preserves W3-D1's boundary: Cairn owns hook mechanics, skillsmith-runtime owns cross-package wiring, and the PowerShell wrapper chooses the composition entrypoint.

## 2026-05-23: 📌 Wave 3 Complete — Curator-Driven Prescriber Orchestration Shipped

**Status:** ✓ All 7 work items shipped  

**Final Test Counts:**
- Cairn: 576/576 passing
- Forge: 630/630 passing
- Runtime-CLI: 5/5 passing
- Skillsmith-Runtime: 6/6 passing

**W3-1 & W3-2 shipped:** Scaffolding + thin CLI done.  
**W3-6 shipped:** Hook wiring complete — always-on bootstrap via injected config. Composition boundary preserved (cairn ↔ skillsmith-runtime acyclic).  

Wave 3 implementation delivered autonomous Curator-driven orchestration. Composition root (R2: `@akubly/skillsmith-runtime`) is the only place importing both `@akubly/cairn` and `@akubly/forge`. Phase 5-ready architecture in place.

## Learnings

### Wave 3 Shipped (2026-05-23 ~21:08Z)

PR #21 merged as f27a537 on main. 1219 tests passing. 7 work items delivered end-to-end: composition root R2 (`@akubly/skillsmith-runtime`), Curator hook wiring, per-skill orchestration, E2E tests, Phase 5-ready acyclic boundaries. 14 Copilot findings addressed across 4 review cycles. 1 deferral approved: insertHintIfNew atomicity (partial UNIQUE + BEGIN IMMEDIATE) → Wave 4.

### Wave 4.1 & 4.2 Shipped (2026-05-04)

**W4-1: insertHintIfNew Atomicity**

- Created migration 013 with partial UNIQUE index on `(skill_id, source, category) WHERE status IN ('pending', 'accepted', 'deferred')`
- Wrapped `insertHintIfNew()` in `BEGIN IMMEDIATE` transaction with `.immediate()` call
- UNIQUE constraint violations treated as duplicates (fetch existing hint id)
- Added 3 unit tests: single insert, duplicate detection, concurrent insert simulation
- Files: `packages/cairn/src/db/migrations/013-hint-atomicity.ts`, `packages/cairn/src/db/optimizationHints.ts`, `packages/cairn/src/__tests__/optimizationHints.test.ts`

**W4-2: CairnEvent Extensions (D1 Option 1)**

- Added `hint_state_transition` event emitted on hint insert and status updates
- Added `profile_bump` event emitted on profile create/update
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
