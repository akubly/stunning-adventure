# Decision: Worktree Warning Review Fixes (PR #53)

**Date:** 2026-06-06T12:01:26-07:00  
**Author:** Graham  
**Branch:** squad/31-worktree-fallback-warning  
**PR:** #53  

## Context

A persona-review panel on PR #53 produced four findings Aaron approved for addressing. All four were quality improvements on top of already-passing acceptance criteria.

## Findings and Resolutions

### Finding 1 — Completeness: dual-description gap (IMPORTANT)

The junction-link fallback was described in two places in `squad.agent.md`:
1. "Worktree Lifecycle Management → Dependency management" (line 676 region) — reference/overview section
2. Pre-Spawn step 2d error-handling block

Only the Pre-Spawn block emitted a user-visible warning. An agent following only the reference section would fail silently. **Resolution:** Added the warning inline to line 676's fallback clause.

### Finding 2 — Accuracy: "isolation degraded" was backwards (IMPORTANT)

The original warning said *"Dependency isolation is degraded for this spawn."* This is inaccurate: when `npm install` runs, the worktree gets its own `node_modules` — MORE isolated, not less. What actually degrades is **consistency** (versions may differ from main) and **efficiency** (slower, more disk).

**Resolution:** Changed all instances of the junction-link warning to:
> `⚠️ Worktree dependency linking failed — fell back to npm install. Dependencies may differ from the main checkout (slower, not shared).`

**Principle established:** Isolation ≠ consistency. Keep them distinct in user-facing copy.

### Finding 3 — Clarity: worktree-add warning ambiguities (IMPORTANT)

The old text *"falling back to main checkout"* was ambiguous ("main checkout" could mean "main branch"). It also did not make clear that the spawn continues. **Resolution:** Changed to:
> `⚠️ Worktree creation failed — continuing in the main repository checkout. Branch isolation is disabled for this spawn.`

Added `> Warning only — spawn continues in the main repository checkout.` after the error-handling block, mirroring the "Parallel dispatch warning" pattern.

### Finding 4 — Consistency: double space after ⚠️ (MINOR)

Both new warning strings had two spaces after ⚠️; the rest of the file uses one. **Resolution:** Normalized all touched warnings to single space.

## Files Changed

- `.github/agents/squad.agent.md` — four surgical edits, no structural changes
- `.squad/agents/graham/history.md` — Learnings appended
- `.squad/decisions/inbox/graham-worktree-warning-review-fixes.md` — this file
