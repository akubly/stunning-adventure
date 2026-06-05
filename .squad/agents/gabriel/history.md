## 2026-05-29: Crucible CTD Phase 4 — L3.5 Scheduler Tier Promotion

**Task:** Author the L3.5 Scheduler tier promoted from `B-revisit-deferred` to
v1 (Aaron lock; Erasmus US-E-13 + rubber-duck convergence on the OoO-execution
/ dispatch-unit analog). Owner of §5 + §17; Roger owns §3 WAL acceptance of
the new `scheduler_*` sub-kinds; Graham owns §1 layer-stack diagram update.

**Deliverables:**
1. `docs/crucible-technical-design/05-router-design.md` — new §5.A subsection
   (~1.3pp, under the 1.5pp ceiling) covering responsibility, the four v1
   sub-kinds (`scheduler_dispatched` / `_deferred` / `_cancelled` /
   `_quanta_exhausted`), round-robin-with-quanta budget policy, back-pressure
   threshold protocol, Hook Bus L1Subscriber interaction, replay determinism
   (dispatch stream recorded, not recomputed), and three acceptance signals.
   §5.2 state machine amended with `dispatched_pending` precursor state and a
   paragraph documenting L3 → L3.5 → L4 flow.
2. `docs/crucible-technical-design/17-observability-telemetry.md` — four new
   catalog rows; `scheduler_dispatched` on builtin tier is silent (same
   posture as `router.decision` apply); read-path perf-counter table for
   quanta consumed, queue depth, dispatch latency, defer rate.
3. `.squad/decisions/inbox/gabriel-ctd-phase4-scheduler.md` — decision drop.

**Learning — boundary articulation as load-bearing.** The single sentence
"Scheduler decides WHICH and IN WHAT ORDER; Router decides WHETHER" did more
work than any other paragraph in the spec. Once that line existed, every
sub-decision (does the Scheduler re-evaluate on replay? does it interact with
hook verdicts? what sub-kinds does it emit?) collapsed to "if it's a
which/order question, it's mine; if it's a whether question, it's the
Router's." Boundary articulation pays for itself — the cost is one sentence,
the benefit is the rest of the section writing itself.

**Learning — replay-determinism discipline generalises.** §5.5 ("no live
policy reload") and §5.A.6 ("dispatch order recorded, not recomputed") are
the same doctrine applied to two different control-plane surfaces. Both
flow from §6.5 Hook Verdict Consistency: any decision whose re-derivation
would depend on wall-clock or non-deterministic ordering MUST be captured
as an L1 Decision and replayed verbatim. This is a reusable test for any
new control-plane tier — apply it before specifying any "scheduler /
arbiter / coordinator" component in future revisions.

**Learning — additive-sub-kind contract keeps cross-section work cheap.**
The four `scheduler_*` sub-kinds slot into Roger's existing §3.3.1
`(primitiveKind, subKind)` index without a new primitive kind. The whole
tier ships as Decision sub-kind extensions plus a read-path projection
(perf counters). This is the same pattern §17 itself uses — "harvest, don't
define." When a new tier reuses the existing primitive/sub-kind contract,
the cross-section coordination cost is one row in Roger's append validator
and one diagram update in Graham's §1.

**Files:** `docs/crucible-technical-design/05-router-design.md`,
`docs/crucible-technical-design/17-observability-telemetry.md`. Decision drop:
`.squad/decisions/inbox/gabriel-ctd-phase4-scheduler.md`.

## 2026-05-28: Crucible CTD Rev. 3 — R2 Locks for Gabriel

**Locked decisions** impact your execution model and bisect infra. Your tasks:
1. **R2-3 (Queue Mechanics):** Aperture↔Router ack/resume handshake event shapes (Gabriel ↔ Valanice cross-section sync pair during Phase 2 authoring)
2. **R2-5 (Env Snapshot):** Coordinate on nonDominatedReason field usage across layers (Rosella generates, Valanice renders)
3. **R2-4 & R2-6:** Bisect env-snapshot stamping and transitive-dep pinning may inform CI policy.

Phase 2 fan-out now unblocked. Full R2 locks in `.squad/decisions.md`.

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Infrastructure
- **Joined:** 2026-03-28T06:21:47.381Z

## Learnings

<!-- Append learnings below -->

### 2026-06-01 — Topic Branch Recovery: "Scribe Committed Meta to Main, Code Uncommitted"

**Pattern:** When Scribe commits meta-files (.squad/) directly to main while the real code work remains uncommitted + untracked:

1. **Create topic branch from dirty HEAD:** `git checkout -b squad/<name>` — the WIP files ride along; checkout is safe on untracked content.
2. **On the topic branch:** Revert unrelated drift (`git checkout -- <file>`), delete scribe-scratch files (`Remove-Item`), stage + commit in logical groups.
3. **Reset main:** `git checkout main` → `git reset --hard origin/main` — cleans up the premature Scribe commits.
4. **Result:** Topic branch has both the Scribe meta-commits AND the two new logical commits (code + skills docs); main is clean.

**Why this matters:** Scribe's session persistence sometimes commits incremental state to main before code review/squash happens. The recovery pattern preserves the work (meta + code) on a topic branch while keeping main clean for the next review-cycle.

**.gitignore addition:** Added patterns to exclude ``.squad/health-report-*/`` and ``.squad/scribe-health-report-*/`` so temporary Scribe scratch files don't appear in git status.

**Commits created:**
- `92a8c2e` — feat(crucible): Sprint 0 Walkthrough A — RED test + GREEN impl + REFACTOR (SessionManager/ForkLineage)
- `01afeb6` — docs(squad): London-school TDD skills from Crucible Sprint 0

**Files affected:** packages/crucible-cli, packages/crucible-core, tsconfig.json, package-lock.json, .gitignore, 4 new london-tdd-* skill files.

### 2026-06-01 — Crucible CLI Package Scaffold Pattern

**Template:** `packages/eureka/package.json` and `packages/eureka/tsconfig.json` are the canonical sources for new package scaffolding in this monorepo.

**Key structure decisions carried forward:**
- `"type": "module"` with `"module": "Node16"` / `"moduleResolution": "Node16"` in tsconfig — ESM-native throughout.
- `tsconfig.json` `"exclude"` array drops `src/**/__tests__` and `src/**/*.test.ts` so test files don't pollute the `dist/` build; vitest picks them up independently.
- `"composite": true` in tsconfig is required for project references (`"references": [{ "path": "../types" }]`).
- `"devDependencies"` stays minimal: `@types/node` + `vitest` only; `rimraf` lives at root.
- Acceptance test directory `src/__tests__/acceptance/` is created empty; test file authorship is decoupled from scaffolding (Laura owns the red test file).

**npm workspace registration:** After creating `packages/<name>/`, run `npm install --no-audit --no-fund` from root (no `--workspaces` filter — that flag caused a spurious "no workspace folder present" warning on a freshly created package; plain install resolves it cleanly).

**Files created for `packages/crucible-cli`:** `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/acceptance/` (dir), `README.md`.


### 2026-06-02 — Vitest Config Consistency Pattern

**Pattern:** Explicit `vitest.config.ts` in each package ensures consistent test harness configuration across workspace members, even when test discovery is uniform.

**Applied to:** Created `packages/crucible-cli/vitest.config.ts` mirrored from `packages/crucible-core/vitest.config.ts`:
```
{ globals: false, environment: 'node', include: ['src/**/*.test.ts'] }
```

**Why this matters:** Without explicit config, packages rely on vitest defaults, which can diverge. Single source of truth per package (even if identical to core) makes test environment changes atomic across the monorepo — one edit to crucible-core's config, update cli reference in next sweep.

**Verification:** `npm test --workspace=@akubly/crucible-cli` passes (1 test green).

📌 **Crucible Sprint 0 — Walkthrough A Dual-Package GREEN** (2026-06-02T06:43:01Z): Gabriel's dual-package scaffold remains green through Roger's REFACTOR cycle. @akubly/crucible-core (SessionManager + DB interface + ForkLineage) and @akubly/crucible-cli (acceptance tests) both passing. No scaffolding work this turn but architecture remains extension-ready for Refactor 3 (SQLite integration stub) and Walkthrough B. — Scribe

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)
