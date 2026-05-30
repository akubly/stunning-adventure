# WI-B Implementation Decisions

**Author:** Gabriel (Infrastructure)
**Date:** 2026-05-29
**Issue:** #28 — Coordinator worktree dispatch
**Branch:** `squad/28-coordinator-worktrees`

---

## Decision 1: Opt-in vs Default-on

**Choice:** Opt-in via `SQUAD_WORKTREES=1` (env-var only for v1)

**Rationale:** Per Graham's §3 recommendation and task spec. Default-on would silently change behavior for all existing users — requiring a worktree to exist for every issue-based spawn, which breaks repos that haven't set up the naming convention. Opt-in lets users test before committing. Config-based activation (`worktrees: true` in squad.config.ts or package.json) is documented as planned for v2 but removed from v1 Pre-Spawn enforcement to avoid partial implementation.

**Trade-off acknowledged:** Users who want isolation MUST remember to set the env var each session. A smarter default (e.g., auto-detect based on whether `{repo}-{issue}` worktree exists) is v2 scope.

---

## Decision 2: Error handling → fall back, not fail closed

**Choice:** When `git worktree add` or junction linking fails, fall back to main repo (`WORKTREE_MODE: false`), not abort.

**Rationale:** In v1, worktrees are opt-in safety feature, not a hard requirement. If a worktree can't be created (permissions, OS restrictions, disk space), the coordinator should still be able to do work — just without isolation. Failing closed would block legitimate agent spawns for infrastructure reasons outside the coordinator's control.

**Trade-off acknowledged:** Skeptic persona raised that fallback "defeats the isolation contract" — if a user set `SQUAD_WORKTREES=1` expecting isolation, silent fallback to main repo is surprising. This is a real concern. Mitigation: the fallback is always logged to history.md so it's not fully silent. v2 could add an explicit warning to the user before falling back.

---

## Decision 3: Branch-mismatch → remove stale worktree and recreate

**Choice:** If a worktree exists at the expected path but has the wrong branch, log and remove it, then create fresh.

**Rationale:** A stale worktree on the wrong branch is more dangerous than no worktree — the coordinator would spawn agents thinking they're on `squad/42-fix-login` but actually committing to `main` or another branch. Better to detect and recreate than to silently proceed.

**Added during persona review:** Correctness and Craft reviewers both flagged the original step 2b had no else-clause for branch mismatch. Fixed before committing.

---

## Decision 4: Parallel dispatch — warning only, detection via list_agents

**Choice:** Warning-only (no block), with `list_agents` as the suggested detection mechanism.

**Rationale:** The task spec explicitly says "Warning-only, no block." The detection mechanism (does coordinator know another agent is in the same checkout?) is inherently session-state-dependent. Adding a hint (`check via list_agents for active spawns`) makes this actionable without requiring a new state-tracking subsystem. Full detection with a dispatch registry is v2.

---

## Deviations from Graham's Scope

None structural. Minor additions from persona review:
- Branch-mismatch handling in step 2b (not in original scope, clear safety improvement)
- `node_modules` existence check on worktree reuse (edge case, Correctness reviewer)
- `rmdir /s` hazard warning (Correctness reviewer — agents add flags helpfully)
- `{branch}` derivation instruction in Cleanup (Craft reviewer — undefined variable)
- v1-only note in Worktree Lifecycle Management activation section (consistency with Pre-Spawn)
