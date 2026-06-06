## Learnings

**Union-only merges auto-resolve cleanly.** When the only overlapping files between branches are `.squad/` append-only files covered by `merge=union` in `.gitattributes`, `git merge` completes without stopping and leaves no conflict markers. Always verify with a full build + test pass that newly merged code compiles and all workspace tests remain green — even when no source files conflicted.

---

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
📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Gabriel (PA-B6 fence-violation retry counter + staleness detection + threat-model stubs). Concrete params: max 5 retries, jittered backoff 2^N, 100-event staleness threshold, 50ms catch-up budget. All Pass A agents complete. — Scribe

# Gabriel — History

📌 **Role:** Infrastructure  
📌 **Joined:** 2026-03-28T06:21:47.381Z  

## Recent Summary (Last 30 Days)

**Crucible CTD Phase 4 (2026-05-29):** L3.5 Scheduler Tier promotion, §5+§17+§18 authoring, Aperture↔Router ack/resume handshake event shapes locked.

**Crucible CTD Rev. 3 (2026-05-28):** R2 locks finalized (Queue Mechanics, Env Snapshot coordination). Phase 2 fan-out unblocked.

**Pass A Execution (2026-05-30):** Fence-violation retry counter + staleness detection + threat-model stubs (PA-B6). All Pass A agents complete.

**M2: forge-mcp Bash Shell Init Hooks (2026-06-01):** Shipped PR #44 — .github/hooks/cairn/ scripts (init/install/uninstall), README M2 section, skill extraction. Design: idempotent marker-block strategy, co-location with PowerShell hooks. All tests passing (49/49). Ready for review.

**M2 Cycle-1 Fixes (2026-06-01):** Addressed 3 review findings on PR #44 (commit e7ef8f3): (1) BLOCKING — replaced broken two-pass sed in uninstall.sh with a bash state-machine loop; byte-identical roundtrip verified on Git Bash. (2) IMPORTANT — moved npm resolution into background subshell so nothing blocks shell startup. (3) MEDIUM — fixed pkg_json dirname depth (2→3) so forge_mcp_check prints correct version 0.1.0. Build clean, 49/49 tests passing.

**M2 Cycle-3 Fixes (2026-06-02):** Addressed 8 active Copilot threads on PR #44. Bucket A `b16a485`: bash resolver now matches `curate.ps1` fallbacks and Git Bash smoke reports package version. Bucket B `c831e64`: README now documents Node >=20, exact resolver order, and bash/Git Bash support boundary. Bucket C `19f35e9`: removed Graham history ESC artifact. Bucket D `a5f1e17`: consolidated date-stamped squad archives into canonical archive files. Persona-review follow-up `3245fc1`: refreshed shell-install skill parity, README troubleshooting/fallback notes, smoke-check fallback warning, and archive cleanup details. Verification: `npm run build`, `npm test`, and Git Bash `forge_mcp_check` all clean.

**M2 Cycle-4 Fix (2026-06-02):** Addressed blocking process-leak thread `PRRT_kwDORy1V9M6GqI4o` in commit `ac524c3`. Root cause: interactive bash launched `node "$script"` with stdin inherited from the terminal, so `runSessionStartHook()` waited forever for EOF. Fix: pipe finite `{"toolName":"shellInit","cwd":"..."}` JSON into Node, with Git Bash cwd converted through `cygpath -w`, so stdin reaches EOF and repo/workdir attribution remains deterministic. Verification: `npm run build`, `npm test`, Git Bash `forge_mcp_check`, and process-leak smoke clean; transient Node PID exited before the 5-second recheck.

**M2 Cycle-5 Fixes (2026-06-02):** Addressed 4 Copilot threads. Shell commit `94a66fb`: `shell-init.sh` now fails clearly when executed instead of sourced, and `uninstall.sh` uses adjacent `mktemp` plus cleanup trap. Doc hygiene commit `05bc54e`: removed tracked `.squad` markdown references to gitignored decision inbox paths. Review follow-ups `591843a`/`7c9433e`/`e5d929a`: hardened trap scope and removed remaining broken/ambiguous inbox wording. Verification: `npm run build`, `npm test`, direct-exec source-only error, source smoke with `forge_mcp_check`, install/uninstall byte-identical roundtrip with no `.forge-mcp-bak*` leftovers, and tracked grep clean.

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

### 2026-06-05 — Merge-Conflict Resolution: main Advancing While Feature Branch Is In Review

**Pattern:** When `origin/main` advances (via merged PRs) while a feature branch is open in review and reported CONFLICTING:

1. **Never rebase — always `git merge origin/main`.** Rebase rewrites history and breaks the union merge-driver semantics configured in `.gitattributes` for `.squad/` append-only files. `git merge` preserves the union driver, which auto-resolves `.squad/decisions.md`, `.squad/agents/*/history.md`, etc. without human intervention.

2. **`package-lock.json` conflicts: regenerate, never hand-merge.** JSON lockfiles are not human-mergeable. Strategy:
   - `git checkout origin/main -- package-lock.json` (take main's lockfile as the deterministic base)
   - `npm install` from repo root — npm picks up all workspaces in `package.json → workspaces: ["packages/*"]` and adds any new packages from the feature branch automatically.
   - `git add -- package-lock.json`

3. **Modify/delete conflicts in `.squad/` files:** If main deleted a file that our branch modified (e.g., `crispin/history.md`), union semantics = keep HEAD. Resolve with `git add -- <file>` (no edits needed).

4. **`.gitignore` pattern precision:** Trailing-slash glob patterns (`.squad/health-report-*/`) only match directories. Scribe health reports are FILES. Pattern must omit the trailing slash: `.squad/health-report-*`. Fix before the merge to avoid the conflict "staged change blocks merge" error, then commit separately.

5. **Commit `.gitignore` before merging** if you staged it — `git merge` will refuse to proceed if the working tree/index has changes to a file that the merge would also touch.

**Verification gates after merge:**
- `git status --porcelain | Where-Object { $_ -match '^(UU|AA|DD|AU|UA|DU|UD)' }` — must be empty before committing.
- `Get-Content tsconfig.json` — verify feature-branch project references (e.g., crucible packages) survived.
- `npm run build` — must succeed for ALL workspaces.
- `npm test --workspace=@akubly/crucible-core` and `npm test --workspace=@akubly/crucible-cli` — feature branch tests must stay green.

**PR state after push:** `gh pr view <n> --json mergeable,mergeStateStatus,state` should return `mergeable: MERGEABLE`. `UNSTABLE` for mergeStateStatus is acceptable while Copilot review re-runs.

### 2026-06-05 — CI Clean-Build Type Resolution: `node:crypto` TS2591 (Case C)

**Root cause (Case C):** CI's clean `tsc --build` (after `npm ci`) reported TS2591 on `node:crypto` imports in crucible-core, but local repro via `npm ci` + `tsc --build --force` did NOT reproduce the error. The most likely explanation: CI runners have no incremental tsc cache, and on some CI environments TS auto-type-inclusion of `@types/node` is non-deterministic without an explicit `types` field — especially in monorepos with project references where each package is compiled in isolation.

**Fix:** Added `"types": ["node"]` to `packages/crucible-core/tsconfig.json` compilerOptions. This makes `@types/node` inclusion explicit and unconditional regardless of TS auto-discovery heuristics.

**Why crucible-core only:** crucible-cli has no `node:` protocol imports in its non-test src; no change needed there.

**Key lesson:** Incremental `tsc --build` (with cached `.tsbuildinfo`) masks clean-build type-resolution failures. Always reproduce CI failures with `npm ci` + `tsc --build --force` — this wipes the build cache and simulates the exact CI environment. If local still passes (Case C), apply the explicit belt-and-suspenders fix (`"types": ["node"]`) and push; don't require a local repro before fixing.

**Verification:** `npx tsc --build --force` ✅ · `npm run build` ✅ · crucible-core 6/6 ✅ · crucible-cli 1/1 ✅

**Commit:** `e5c1dde` — HEAD at push.

### 2026-06-05 — Gitignore Cleanup: Tracked Files Bypass Ignore Matching

**Gotcha:** `git check-ignore -v <path>` returns "not ignored" for tracked files even when the path matches a `.gitignore` rule. This is not evidence the file _should_ be tracked — it's the expected behavior: once a file is tracked, ignore rules don't evict it. The bug is that the file was committed in the first place.

**Fix pattern — `git rm --cached`:**
1. Identify which files the branch introduced under gitignored paths:
   `git log --diff-filter=A --name-only origin/main..HEAD -- <dir>/`
   (Also cross-check: `git ls-files <dir>/` to see all currently tracked files.)
2. For each file this branch added (origin/main..HEAD scope only — leave pre-existing tracked files alone):
   `git rm --cached -- <path>` — untracks the file without deleting it from disk.
3. Verify the ignore rule now fires: `git check-ignore -v <path>` — should report `.gitignore:<line>`.
4. Commit the staged removals.

**Why `--cached` matters:** Plain `git rm` deletes the local file. `--cached` unregisters it from the index only; the file stays on disk as local-only runtime state, which is exactly what the `.gitignore` intent requires.

**Scoping discipline:** Only remove files introduced by this branch (`origin/main..HEAD`). Files that already exist on origin/main are out of scope — removing them would touch things committed before this branch, which isn't our job.

**PR #45 — Files removed:**
- `.squad/orchestration-log/20260602-064301-laura.md` (gitignore:50)
- `.squad/orchestration-log/20260602-064301-roger.md` (gitignore:50)
- `.squad/log/20260602-064301-crucible-walkthrough-a-refactor.md` (gitignore:51)

All three files existed on origin/main-relative tracking only because the Scribe meta-commit staged them before the gitignore cleanup was applied.

**Commit:** `f2606f3` — topic-branch SKILL typo fix (stray space in `.squad/ decision archives` → `.squad/decision archives`).
## Current Workload

- Crucible CTD Phase 3: §17 (observability/telemetry) + §18 (diagnostics/recovery) unblocked
- M2 PR #44: Cycle-5 fixes shipped; awaiting coordinator thread resolution/merge
- Dogfood scope: M2 complete; M3+ planning pending

---

**For detailed history, see history-archive.md**


- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)
