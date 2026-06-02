# SKILL: Recover Dirty Main via Topic Branch (Scribe Meta-Commit Recovery)

**Author:** Gabriel (Infrastructure)  
**Context:** Scribe commits incremental meta-files to main before code review, leaving main ahead of origin/main with uncommitted code in the working tree.  
**Applicable to:** Any recovery where WIP code is uncommitted but Scribe meta-commits are already on main.

---

## Problem

Scribe's session consolidation sometimes produces:
- **Meta-commits on main:** .squad/ decision archives, session logs, inbox merges pushed to main
- **Uncommitted code:** Real work (new packages, skills, config changes) still in the working tree
- **Result:** main is several commits ahead of origin/main; code is unreviewed; main is "dirty" from a review-cycle perspective

## Solution: Topic Branch Recovery

### Prerequisites

- Current branch is `main`
- HEAD is N commits ahead of origin/main (all Scribe meta-commits)
- Working tree has uncommitted + untracked code (the real work)

### Procedure

#### Step 1: Classify Working Tree Changes

Identify three categories:

1. **`belongs-on-topic-branch`** — Real work product (packages/, new skills, workspace config)
2. **`unrelated-drift`** — Modified files from other contexts (revert these)
3. **`scribe-scratch`** — Temporary Scribe health reports, logs (delete these)

#### Step 2: Update .gitignore (if needed)

Add patterns for any scribe-scratch files so they don't reappear:

```
.squad/health-report-*/
.squad/scribe-health-report-*/
```

#### Step 3: Create Topic Branch from Dirty HEAD

```powershell
git checkout -b squad/<work-name>
```

**Why:** Checkout is safe on untracked files; they ride along to the new branch. Scribe meta-commits are preserved at the new branch's HEAD.

#### Step 4: Clean Up Unrelated Drift and Scratch

On the topic branch:

```powershell
# Revert unrelated drift
git checkout -- <file-path>

# Delete scribe-scratch files
Remove-Item <file-path>, <file-path>
```

#### Step 5: Commit Work in Logical Groups

Stage and commit `belongs-on-topic-branch` files in 1–2 logical commits. Use `git add -- <path>` (explicit paths, never `git add .`).

```powershell
# Commit 1: Code + config
git add -- packages/new-pkg tsconfig.json package-lock.json
git commit -m "feat(new-pkg): ..."

# Commit 2: Documentation + tooling
git add -- .squad/skills/new-skill .gitignore
git commit -m "docs(squad): ..."
```

**Include trailer:**
```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

Verify working tree is clean: `git status --porcelain` should be empty.

#### Step 6: Reset Main Back to Origin

```powershell
git checkout main
git reset --hard origin/main
```

Verify: `git log origin/main..HEAD --oneline` shows no commits.

#### Step 7: Switch Back to Topic Branch

```powershell
git checkout squad/<work-name>
```

Verify:
- `git log origin/main..HEAD --oneline` shows (Scribe meta-commits + your new commits)
- `git status --porcelain` is empty
- Tests pass

### Example: Crucible Sprint 0 Recovery (2026-06-01)

**Initial state:**
- 3 Scribe meta-commits on main (b19b683, 193a441, 7cfe8ad)
- packages/crucible-cli, packages/crucible-core uncommitted
- 4 london-tdd-* skills uncommitted

**Execution:**
1. Classify: packages/crucible-{cli,core} = belongs-on-topic-branch; tsconfig.json, package-lock.json = plumbing; health-report files = scribe-scratch; scaffold-eureka/SKILL.md = unrelated-drift
2. Update .gitignore with health-report patterns
3. Create `squad/crucible-sprint-0-walkthrough-a`
4. Revert scaffold-eureka, delete health-reports
5. Commit 1 (92a8c2e): feat(crucible) — packages + workspace config
6. Commit 2 (01afeb6): docs(squad) — london-tdd skills + .gitignore
7. Reset main to origin/main (c8d7bc7)
8. Verify: 5 commits on topic branch, tests pass, main clean

---

## Gotchas

- **Checkout safety:** Untracked files are NOT deleted by `git checkout -b`; they're preserved. Scribe-scratch files must be explicitly deleted with `Remove-Item`.
- **Index confusion:** `git reset` without `--hard` can leave the index in a confusing state. Always use `--hard` when resetting main to origin.
- **.gitignore timing:** Update .gitignore on the topic branch (it's part of the work product), not on main.
- **Commit granularity:** Logical grouping (code + config vs. docs + tooling) makes PR review easier than one giant commit.

---

## Reusable Checklist

- [ ] Classify all working tree changes into three buckets
- [ ] Update .gitignore if any scribe-scratch patterns are missing
- [ ] Create topic branch: `git checkout -b squad/<name>`
- [ ] Revert unrelated drift: `git checkout -- <files>`
- [ ] Delete scribe-scratch: `Remove-Item <files>`
- [ ] Stage Commit 1 (code): `git add -- <paths>`
- [ ] Commit with trailer: `git commit -F <msg-file>`
- [ ] Stage Commit 2 (docs/tooling): `git add -- <paths>`
- [ ] Commit with trailer: `git commit -F <msg-file>`
- [ ] Verify clean: `git status --porcelain` (empty)
- [ ] Switch to main: `git checkout main`
- [ ] Reset hard: `git reset --hard origin/main`
- [ ] Verify clean: `git log origin/main..HEAD --oneline` (empty)
- [ ] Switch back: `git checkout squad/<name>`
- [ ] Final verify: log, status, tests
