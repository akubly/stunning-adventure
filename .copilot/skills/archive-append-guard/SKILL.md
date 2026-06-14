---
name: archive-append-guard
description: Verify archive line count strictly increases after an archive step (append-only assertion)
domain: infrastructure, documentation, squad-conventions
confidence: high
source: earned (decisions-archive.md overwrite incident, 2026-06-12, commit 5747329)
---

## Context

Append-only files (e.g., `.squad/decisions-archive.md`, agent `history.md` files) must never be overwritten.
The Scribe agent committed an overwrite of `decisions-archive.md` in commit 5747329, dropping ~4596 lines of prior archived history. The file went from 4782 lines to 186 lines — all prior content was silently lost.

The Append-Only History Rule is a team-wide invariant: decisions.md, decisions-archive.md, and agent history files are APPEND-ONLY. Any operation that shrinks or replaces them is a scope violation.

## Assertion Pattern

After any archive step, run the following gate:

```powershell
$before = (git show HEAD~1:.squad/decisions-archive.md | Measure-Object -Line).Lines
$after  = (git show HEAD:.squad/decisions-archive.md   | Measure-Object -Line).Lines
if ($after -le $before) {
    throw "Archive overwrite detected: $after lines (was $before). Archive must grow, not shrink."
}
Write-Host "Append-only check PASSED: $before → $after lines (+$($after - $before))"
```

Replace `.squad/decisions-archive.md` with any append-only file being checked.

## Recovery Procedure

If an overwrite is detected:

1. Capture both versions: `git show HEAD~1:<path> > $env:TEMP\old.md` and `git show HEAD:<path> > $env:TEMP\new.md`
2. Check `new.md` for a duplicate top-level header; strip if present.
3. Reconstruct: `[System.IO.File]::WriteAllLines("<path>", (Get-Content $env:TEMP\old.md) + @("") + (Get-Content $env:TEMP\new.md), [System.Text.UTF8Encoding]::new($false))`
4. Verify: line count > prior count, old markers present, new block present, single top-level header.
5. Commit as a new forward-only commit (never amend or force-push).

## What to Check

- **Line count strictly increases** — any same-or-lower count is definitive proof of overwrite.
- **Top-level header appears exactly once** — `Select-String -Pattern "^# Archived Decisions"` should return 1 match.
- **New block present exactly once at the END** — the newly archived content should not be duplicated; also check whether the old archive already contained a brief prior version of the same heading.
- **No BOM introduced** — use `[System.Text.UTF8Encoding]::new($false)` on Windows to avoid UTF-8 BOM.

## Anti-Patterns

- Using `Set-Content` or `>` redirection to write an archive file (overwrites by default).
- Using `git add .squad/` or broad globs when only one file should be staged.
- Amending or rebasing a Scribe commit to "fix" it — always add a new fix commit forward.
- Assuming `Get-Content | Set-Content` preserves line counts — verify after writing.
