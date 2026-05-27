# Stacking Sibling Feature Branches with a Cross-Cutting Refactor

## When to use

Use this when several sibling feature branches are green alone, but one branch changes shared API shape across packages and must integrate with APIs introduced by the others.

## Inputs

- Base branch and target integration branch name.
- Ordered list of sibling branches.
- Which branch is the cross-cutting refactor.
- Known append-only files and code hotspots.

## Steps

1. Start the integration branch from the exact intended base.
2. Merge small independent feature branches first with `--no-ff` to preserve reviewable wave history.
3. Merge dependent feature branches immediately after their base branch.
4. Merge the cross-cutting refactor last so every newly introduced API is adapted in one pass.
5. For append-only state/history conflicts, keep the newer aggregate state or union both sides.
6. For code conflicts, preserve the semantic feature behavior from earlier branches while adopting the cross-cutting convention from the final branch.
7. Build before testing. Then run the full suite and separate real failures from stale tests and pre-existing todos/skips.
8. Commit integration-only fixes separately from merge commits with a conventional message and a clear explanation of which branches interacted.

## Conflict resolution checklist

- Public helper added by an earlier branch: update its signature to the cross-cutting convention.
- Call sites added by an earlier branch: thread the new explicit context through them.
- Tests added by an earlier branch: update seed/setup helpers to follow the new API, not singleton fallbacks.
- Runtime composition code: preserve feature-chain behavior first, then swap in the new lower-level API calls.

## Validation pattern

- `npm run build`
- Targeted test for each fixed failure
- Root `npm test`
- Record exact pass/todo/skip counts and whether todos were pre-existing
