# Decision: Workspace Lint Guard for `--if-present` Silent-Skip

**Date:** 2026-06-06  
**Author:** Gabriel (Infrastructure)  
**Status:** Implemented — PR #50 corrective commit  
**Issue:** #37 (Windows lint silent-skip), PR #50

---

## Context

PR #50 fixed the root `lint` script by switching to `npm run lint --workspaces --if-present`. A Code Panel persona-review (Correctness, Skeptic, Craft) identified that `--if-present` re-introduces the same silent-skip bug class at the per-package level: any future workspace package added without a `lint` script is silently skipped, `npm run lint` exits 0, and lint errors escape undetected.

---

## Decision

**Add an explicit guard script** (`scripts/check-workspace-lint.mjs`) that asserts every lintable workspace package declares `scripts.lint`, and **wire it as an explicit CI step** before `npm run lint`.

### Alternatives Considered

1. **Remove `--if-present`** — Breaks packages that legitimately lack lint (e.g., future meta-packages). Rejected.
2. **Couple guard into root `lint` script** (e.g., `"lint": "node scripts/check-workspace-lint.mjs && npm run lint --workspaces --if-present"`) — Works but couples two concerns; CI step names are less visible. Rejected in favour of explicit CI step.
3. **Explicit CI step (chosen)** — Separate, named CI step fires early, is visible in CI logs, keeps root scripts clean. Accepted.

### Rule Encoded in Guard

A package **must** declare `scripts.lint` **if and only if** it has a `src/` directory. Packages without `src/` are exempt as non-lintable meta-packages.

---

## Outcome

- `scripts/check-workspace-lint.mjs` created — ESM, no external dependencies.
- `.github/workflows/ci.yml` updated: `node scripts/check-workspace-lint.mjs` step added before `npm run lint`.
- Verified: PASS with all 8 packages present; FAIL with clear per-package message when one is missing.
- Windows lint evidence posted to PR #50 as a comment confirming per-package eslint invocation.
