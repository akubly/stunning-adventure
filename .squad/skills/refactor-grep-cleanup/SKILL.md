# refactor-grep-cleanup

**When to use:** Immediately after any refactor that renames a public interface,
removes a parameter, or changes a contract — BEFORE opening a PR or requesting review.

---

## The Problem

Interface renames and contract changes have a long tail of stale references:
comments, JSDoc, design docs, SKILL.md files, decisions.md, history entries,
and test fixture headers. If you don't grep for them before shipping, reviewers
(human or AI) find them one-per-cycle and you spend multiple review rounds on
purely textual fixes.

---

## Search Terms to Grep After Any Refactor

Generate this list from the change itself. For each refactored element, grep for:

| Change type | Search terms |
|---|---|
| Method rename (`a → b`) | Old method name `a(`, `\.a\b` |
| Parameter removed (`currentTrust`) | Old parameter name in comments/JSDoc |
| Signature change | Old signature shape (e.g., `update({factId, sessionId, trust})`) |
| Count change (+N tests) | Old test count, old range (e.g., `C-1..C-6`) |
| Key change (factId → (sessionId,factId)) | Old key description (`per factId`) |
| Claim weakened (MUST → MAY) | Old claim text (`MUST be parallel`, `no global lock`) |
| Seam removed (FactReader from write path) | Old seam name in removed-context (`FactReader.*applyFeedbackById`) |

---

## How to Run

```powershell
# From repo root — ripgrep, excluding build artifacts
rg -n "TrustUpdater\.update" --glob "**/*.{ts,md}" --glob "!**/node_modules/**" --glob "!**/dist/**"
rg -n "per factId" --glob "**/*.{ts,md}" ...
# etc. for each term
```

Pipe results through a review — for each hit, decide:
1. **Fix in place** — forward-facing docs, JSDoc, SKILL.md, interface types
2. **Leave** — historical records in history.md / decisions.md that accurately describe past behavior
3. **Remove** — hard-coded repo-wide test totals in code-adjacent comments (drift bombs)

---

## Rules

1. **Run BEFORE opening the PR, not after.** Once CI/review sees stale refs,
   you lose multiple cycles to one-at-a-time drip findings.

2. **Hard-coded repo-wide totals in code files are drift bombs.** Per-suite
   counts ("each runX call adds N tests") are stable. Repo totals aren't.
   Delete them.

3. **Don't rewrite historical records.** `history.md` and `decisions.md` entries
   describe what was done at a point in time. They're accurate for their era.
   Fix forward-facing docs; leave retrospective entries alone.

4. **Grep the whole repo, not just the changed files.** Stale refs spread
   wherever the old name was documented — skills, design docs, agent histories,
   decisions, test headers.

---

## Reference

Applied in: M7-C atomicity refactor (`eureka/m7-c-atomicity`, PR #41, cycle 5).
Five review cycles of stale-ref drip could have been one grep pass.
See `.squad/decisions.md` § "M7-C Complete — Edgar" and `.squad/agents/edgar/history.md`.
