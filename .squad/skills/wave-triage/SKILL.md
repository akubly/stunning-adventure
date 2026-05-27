# SKILL: Wave Triage from PR Status

**Owner:** Graham Knight  
**Version:** 1.0  
**Date:** 2026-05-26

---

## Purpose

At the start of each new wave, verify which items from the prior wave are truly merged (vs. still in progress), identify stale state in `now.md`, and produce a clean Wave N plan with accurate dependencies.

---

## Inputs

- `now.md` — squad state from prior wave
- `gh pr list --state all --limit 30 --json number,title,headRefName,state,mergedAt`
- `gh issue list --state open --limit 50 --json number,title,labels,assignees`
- The list of commits / branch names documented in `now.md`'s PR merge sequence

---

## Steps

### 1. Reconcile branch names to PRs

Prior-wave `now.md` often documents isolated branch names (e.g., `phase-4.6/w5-1-session-kind`). These may or may not correspond to open PRs. Use `gh pr list` to find:
- Is there an open PR for this branch?
- Was it merged as a consolidated PR (multiple commits → one PR)?
- Is it unfiled (branch exists but no PR)?

**Pattern to watch for:** Isolated working branches are frequently consolidated into a single integration branch before PR. `now.md`'s "PR merge sequence" may describe the intended filing order, but Aaron often merges as a single squash-and-merge PR. Always check `mergedAt` field — if non-null, the content is on main regardless of branch count.

### 2. Check remote branch existence

```powershell
git --no-pager branch -r
```

If the branch names from `now.md` don't appear in remote listing, they were either:
- Merged and deleted (most common), or
- Never pushed (work is local only)

Cross-reference with `git --no-pager log --oneline -10 main` to confirm commits landed.

### 3. Identify stale now.md claims

Look for phrases like:
- "Aaron to review and merge PRs" — stale if PRs are now merged
- "on hold pending PR merges" — stale if PRs landed

Flag these explicitly in the Wave N plan. Scribe updates `now.md` as the first act of every new wave.

### 4. Backlog inventory tiers

Categorize open issues into three buckets:
1. **Wave N candidates** — work items with clear owners, no unresolved blockers
2. **Deferred** — items with named prerequisites or explicit deferral decisions
3. **Aging / unlabeled** — issues with no wave assignment, no assignee, accumulating

For aging issues: either schedule (assign to a wave) or flag for Aaron to close. Don't let them silently accumulate as planning noise.

### 5. Dependency check for new items

For each Wave N candidate, verify prerequisite merges:
- Is the blocking commit on `main`? (`git log --oneline -20 main | findstr <hash>`)
- Is the blocking API surface exported from its package barrel?

Document the dependency check outcome explicitly in the plan ("W5-1 prerequisite: ✅ merged in PR #23").

---

## Output

- **PR status table** — each prior-wave item mapped to PR number, state, mergedAt
- **Backlog inventory** — tiered (Wave N / Deferred / Aging)
- **Wave N spawn plan table** — Owner | Dependencies | Parallel With | Notes
- **Updated now.md** (via Scribe) — wave focus, active_issues, links to new PRs

---

## Common Pitfalls

| Pitfall | Mitigation |
|---------|-----------|
| `now.md` says PRs are "open" but they merged while squad was idle | Always run `gh pr list` at wave start; don't trust cached state |
| Isolated branch names ≠ one PR each | Branches are often consolidated; check `headRefName` in `gh pr list` |
| Backlog items accumulate without wave assignment | Triage every open issue; assign or explicitly defer at wave boundary |
| Prerequisite assumed merged because it was "done" locally | Verify with `git log main` — done locally ≠ done on main |
