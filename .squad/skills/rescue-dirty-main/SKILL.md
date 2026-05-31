# Skill: rescue-dirty-main

**Author:** Graham  
**Date:** 2026-05-30  
**Status:** Crystallized from M5+M6 branch prep incident

## Purpose

Rescue a situation where feature work was done directly on `main` (uncommitted changes + possibly ahead commits) and needs to be restructured onto a clean feature branch with `main` matching `origin/main`.

## Input

- Current branch: `main`
- Working tree: uncommitted tracked changes and/or untracked files
- `main` may be N commits ahead of `origin/main`

## Output

- Feature branch carrying all commits + working-tree changes committed
- `main` reset to `origin/main` (local only — no force-push)

## ⚠️ Critical Ordering Rule

**COMMIT THE WORKING TREE FIRST — before switching back to main.**

`git switch` carries uncommitted tracked changes across branches when there is no conflict. `git reset --hard` on the source branch WIPES those changes from disk. Only untracked files survive.

**Wrong order (loses tracked changes):**
```
git switch -c feature   # creates branch, carries working tree
git switch main         # switches back, still carrying working tree
git reset --hard origin/main  # DESTROYS tracked working-tree changes
```

**Correct order:**
```
git switch -c feature   # creates branch, carries working tree
git add -A && git commit -m "..."  # COMMIT before going back
git switch main
git reset --hard origin/main  # now safe — changes are committed on feature branch
git switch feature
```

## Full Procedure

```bash
# 1. Create feature branch from current HEAD
git switch -c <feature-branch-name>

# 2. Commit all working-tree changes on the feature branch
#    Use structured commits if desired (see below)
git add <implementation files>
git commit -m "feat(...): ..."
git add <metadata files>
git commit -m "chore(...): ..."

# 3. Reset main locally (no force-push)
git switch main
git reset --hard origin/main

# 4. Return to feature branch
git switch <feature-branch-name>

# 5. Verify
git status --porcelain        # → empty
git log origin/main..HEAD --oneline  # → your commits
git diff origin/main...HEAD --stat   # → the review artifact
```

## Commit Structure Guidance

When structuring commits on the rescued branch:

| Commit | Contents | Rationale |
|---|---|---|
| A (implementation) | Source code + tests + spec changes | Single logical deliverable; review surface is clean |
| B (metadata) | Agent history, skills, decisions | Separate from A to avoid burying behavioral changes |

**Trade-off:** More commits vs. cleaner per-commit review surface. Prefer separation when metadata would add >20% noise to the implementation diff.

**Monolith** (A+B merged): acceptable when metadata is minimal (≤5 lines) or when a single atomic commit is required by the team's merge strategy.

## Recovery When Tracked Changes Are Already Lost

If `reset --hard` was already run before committing:

1. Check `git stash list` — did anyone stash before the reset?
2. Check `git fsck --lost-found` — any dangling blobs?
3. Check `git reflog` — was there a prior commit?
4. If none of the above: reconstruct from surviving untracked files (test files, specs) and team context
5. The test file alone is sufficient to reconstruct an implementation if it specifies the full contract (London-school seam-driven tests)

## Notes

- Never `git push --force` on `main` — local reset only
- The Scribe metadata commit can stay on the feature branch as-is; it's inert to code review
- `git update-ref refs/heads/main origin/main` is an alternative to the switch+reset sequence (no working-tree interaction at all — cleaner when you're already on the feature branch)
