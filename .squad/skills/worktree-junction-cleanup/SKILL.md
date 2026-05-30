# Skill: Worktree Junction Cleanup (Windows-safe)

**Category:** Infrastructure / Git Worktrees
**Platform:** Windows (primary), Unix (secondary)
**Origin:** WI-B — Coordinator Worktree Dispatch (Issue #28)

---

## The Problem

When a git worktree has a `node_modules` junction (Windows) or symlink (Unix) linking back to the main repo's `node_modules`, running `git worktree remove` **before** unlinking it causes catastrophic data loss on Windows.

**Why:** Windows `git worktree remove` internally deletes the worktree directory, which recursively traverses junctions as real directories. This deletes the real `node_modules` from the main repo.

**`rmdir /s` is also fatal:** If you try `rmdir /s "{worktree}\node_modules"` to clean up first, that also recursively deletes the target. Only plain `rmdir` (no `/s`) removes the junction without touching its target.

---

## The Rule

Unlink the junction before removing the worktree, and never use the recursive flag on the junction.

---

## Step-by-Step Recipe

Remove the worktree in this exact order (ORDERING IS SAFETY-CRITICAL):

1. **Resolve the branch name** (while the worktree still exists):
   Run `git -C "{worktree}" rev-parse --abbrev-ref HEAD` and save the result as `{branch}`.
   If the branch is already known from setup, skip this step.

2. **Remove the `node_modules` junction/symlink** (before `git worktree remove`):
   - Windows: Use `cmd /c rmdir` on `{worktree}\node_modules` — no `/s` flag.
     Plain `rmdir` removes the junction pointer only, not the target.
   - Unix: `rm -f "{worktree}/node_modules"` — removes symlink only.
   - ⚠️ Do NOT use `rmdir /s` — that recursively deletes the real `node_modules`.
   - ⚠️ Do NOT skip this step — `git worktree remove` traverses junctions on Windows.

3. **Remove the worktree:**
   `git worktree remove "{worktree}"`

4. **Delete the branch:**
   `git branch -d {branch}`

---

## ⚠️ Hazards

| Action | Windows Result | Unix Result |
|--------|---------------|-------------|
| `rmdir "{worktree}\node_modules"` (no /s) | ✅ Removes junction only | N/A |
| `rmdir /s "{worktree}\node_modules"` | ❌ **Destroys real node_modules in main repo** | N/A |
| `rm -f "{worktree}/node_modules"` | N/A | ✅ Removes symlink only |
| `rm -rf "{worktree}/node_modules"` | N/A | ❌ **Destroys real `node_modules` if the symlink was already removed or never created — prefer `rm -f` which fails gracefully on real directories** |
| `git worktree remove "{worktree}"` (junction present) | ❌ **Destroys real node_modules in main repo** | ✅ Safe (git doesn't follow symlinks) |
| `git worktree remove "{worktree}"` (junction removed) | ✅ Safe | ✅ Safe |

---

## Context

This skill was extracted from the Worktree Lifecycle Management → Cleanup section added in WI-B. The hazard was identified by the Correctness reviewer during Code Panel review of the first-pass implementation, which had `rmdir /s` in the original draft.

The rule is simple: **unlink before remove, and never use the recursive flag on the junction**. On Unix, prefer `rm -f` over `rm -rf` — `rm -f` fails gracefully if the path is a real directory (prompting investigation), whereas `rm -rf` silently deletes a real directory if the symlink was already removed or never created.
