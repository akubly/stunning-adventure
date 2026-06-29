# SUMMARY (as of 2026-06-06)

File size: 19482 bytes. See history-archive.md for earlier entries.

---

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

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

## Learnings

### `--if-present` silent-skip guard pattern (2026-06-06, PR #50 follow-up)

`npm run <script> --workspaces --if-present` silently skips any workspace package that lacks the named script. This is convenient for optional scripts (test, clean) but is a bug trap for mandatory scripts like `lint`: a new package added without a `lint` script causes `npm run lint` to stay green while that package's lint errors escape entirely.

**Pattern — explicit guard script:** Add a small Node ESM script (`scripts/check-workspace-lint.mjs`) that:
1. Reads root `package.json` `workspaces` globs.
2. Enumerates each resolved package directory.
3. For packages that have a `src/` directory (lintable), asserts `scripts.lint` exists.
4. Exits non-zero and lists offending packages if any are missing.

The `src/` exemption rule avoids false positives on meta-packages that have no source to lint.

**Wiring into CI:** Add an explicit CI step (`node scripts/check-workspace-lint.mjs`) *before* `npm run lint` in `.github/workflows/ci.yml`. This fires early (no TypeScript build needed), is visible in CI step names, and keeps the guard decoupled from the root lint script itself. A missing lint script fails CI loudly before any silent skip can occur.

**Verification:** Run guard with all packages present → PASS. Temporarily remove `scripts.lint` from one package → FAIL with clear per-package message. Restore → PASS.

### Archive overwrite incident + recovery (2026-06-12)

**Incident:** Scribe commit 5747329 was supposed to APPEND ~274 newly-archived lines to `.squad/decisions-archive.md`. Instead it OVERWROTE the file, replacing the full prior archive (4782 lines, including the `# Archived Decisions` header and all earlier dated entries) with only this session's freshly-archived block (186 lines starting `### 2026-05-30`).

**Detection:** Verified via `git show HEAD~1:.squad/decisions-archive.md | Measure-Object -Line` (4782 lines) vs `git show HEAD:.squad/decisions-archive.md | Measure-Object -Line` (186 lines). HEAD~1 started with the `# Archived Decisions` header; HEAD started directly at `### 2026-05-30` with no header — clear overwrite evidence.

**Recovery:** Captured HEAD~1 and HEAD versions to `$env:TEMP`. Checked HEAD (new block) for duplicate top-level headers — none present. Reconstructed archive as old content + blank separator + new block using `[System.IO.File]::WriteAllLines` with UTF-8 no-BOM. Verified restored file: 4968 lines (> 4782 ✓), old marker `Entries archived on 2026-06-05` present ✓, new block present ✓, single `# Archived Decisions` header ✓. Committed as a new forward-only commit (no amend, no force-push).

**Append-only guard:** After any Scribe archive step, assert `(new line count) > (old line count)`. The correct test is `git show HEAD:.squad/decisions-archive.md | Measure-Object -Line` strictly greater than `git show HEAD~1:.squad/decisions-archive.md | Measure-Object -Line`. A same-or-lower count is definitive proof of overwrite. This assertion should be wired into any automated Scribe pipeline as a post-commit gate.


## Learnings — 2026-06-12 Main Reconciliation (Gabriel)

**Context:** main and origin/main had diverged (3 squad-bookkeeping commits on local main vs 3 origin commits including the eureka squash #74, now.md update, and Crucible S1 #73). Needed to bring both sets together without data loss and without re-introducing eureka code into history.

**Approach — union merge + targeted cherry-pick:**
git merge origin/main on main let git's merge=union driver auto-resolve .squad/decisions.md and .squad/decisions-archive.md by keeping content from both sides (append-only semantics preserved automatically). No manual conflict resolution was needed. The eureka squash b2a421e is the single canonical source of packages/eureka changes — cherry-picking only the squad bookkeeping commit (1f79813) from the scratch branch ensured no duplicate eureka code entered main history.

**Append-only line-count guard:** Before merging, captured origin/main's decisions-archive.md line count (5038). After merge it rose to 5268 — proving origin's entries were preserved and nothing was dropped. Always verify the merged file is >= the upstream baseline, never just assume the union driver worked.

**Why nap compaction was deferred:** stash@{0} contained a squad nap compaction of histories/decisions alongside 2 unrelated pre-existing edits. Applying the compaction via stash pop would have entangled the unrelated edits and potentially silently overwritten verbose append-only content with condensed summaries. The correct sequencing is: push clean bookkeeping to main first, then run squad nap cleanly on top of main so the compaction is an explicit, reviewable, standalone commit.

### 2026-06-16 — FifoScheduler Determinism Contract (Crucible S3 Skeleton, T3)

**Implementation:** packages/crucible-core/src/skeleton/fifo-scheduler.ts — FifoScheduler implements SchedulerPort (§5.A).

**A-Sched-1 mapping:** A-Sched-1 requires dispatch ordering to be preserved across replay: re-running the same proposal sequence must produce an identical scheduler_dispatched stream. FifoScheduler achieves this trivially — it has no internal state, no queue, no timers, and no randomness. Each submit(proposal) call returns a SchedulerDispatched event derived solely from the proposal's own fields (proposalId, generatorId, priority) plus the fixed constants quantaConsumed=1 and queueDepthAtDispatch=0. Because the output is a pure function of the input, the replay invariant is structurally guaranteed: same proposals in, same events out, every time.

**Why no buffering matters for replay:** If the scheduler buffered proposals and drained them on a timer or depth threshold, the drain order could differ between original run and replay (different wall-clock timing, different OS scheduling). By dispatching synchronously on arrival with no side-effects, FifoScheduler makes the scheduler tier a no-op for replay correctness purposes — the WAL's scheduler_dispatched rows are already the complete dispatch log (§5.A.6).

**Export discipline:** Exported only from fifo-scheduler.ts directly, not injected into index.ts (Graham owns the barrel; T2/T4 run in parallel). Consumers import via '../skeleton/fifo-scheduler.js'.

### 2026-06-28 — ADR-0024 Authoring: Explicit L3.5 Scheduler Tier

**Gate 1.5 Completion:** Final unwritten gated ADR for Phase 0.5. Tier rationale locked before Router + Scheduler phase-1 implementation begins.

**Key insight — Dispatch vs. Policy separation:** The Scheduler tier isolates dispatch ordering (L3.5 responsibility) from approval policy (L4 Router responsibility). This separation is load-bearing:
- **Determinism:** FifoScheduler (stateless, immediate dispatch) ensures replay output is byte-identical (same proposals in → same scheduler_dispatched stream out).
- **Fairness:** WeightedRoundRobinScheduler (Phase 1, A-Sched-2/3 gates) adds back-pressure + fair queuing without coupling to Router policy logic.
- **Instruction-trace visibility:** Dispatch events become first-class WAL rows, making RAW/WAR/WAW hazards detectable (generator A's output → generator B's input becomes visible in dispatch order).

**Hardware analogy grounding:** Out-of-order-execution dispatch units in CPUs inspired the tier concept (Erasmus US-E-13 + rubber-duck convergence under 3+ agent missing-concept threshold). Generators are execution pipes; Scheduler is the dispatch unit; Router is the pipeline; Applier is memory-system commit.

**Graduation criteria clarity:** ADR documents all three A-Sched gates so Phase 1 knows the target before refactoring Router:
- A-Sched-1 (v0.5): Replay determinism ✅ FifoScheduler
- A-Sched-2 (Phase 1): Back-pressure via quanta budgeting → scheduler_deferred event
- A-Sched-3 (Phase 1): Fair dispatch (no starvation) via weighted-fair queuing

**Files created:** `docs/adr/0024-explicit-l3-5-scheduler-tier.md` (14 KB, 400+ lines)

**Learnings for future ADRs:**
1. Hardware analogies clarify why a tier exists (dispatch units ↔ Scheduler), but ground them in the actual agentic problem first (determinism, fairness, trace visibility)
2. Graduation criteria in the ADR prevent Phase 1 authors from making different assumptions about the tier's evolution
3. Rejected Option 1 (direct L3→L4) must explain *why* it breaks determinism and fairness, not just why it's less elegant — consequences ground the decision
4. "Accepted Questions" section for previously open questions (ADR-0024 resolves why Scheduler exists and why it's v1, not v1.5) is a reviewability win; readers don't have to chase decisions.md
