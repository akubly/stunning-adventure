- `.squad/orchestration-log/20260602-064301-laura.md` (gitignore:50)
- `.squad/orchestration-log/20260602-064301-roger.md` (gitignore:50)
- `.squad/log/20260602-064301-crucible-walkthrough-a-refactor.md` (gitignore:51)

All three files existed on origin/main-relative tracking only because the Scribe meta-commit staged them before the gitignore cleanup was applied.

**Commit:** `f2606f3` — topic-branch SKILL typo fix (stray space in `.squad/ decision archives` → `.squad/decision archives`).
## Current Workload

- Crucible CTD Phase 3: §17 (observability/telemetry) + §18 (diagnostics/recovery) unblocked
- M2 PR #44: Cycle-5 fixes shipped; awaiting coordinator thread resolution/merge
- Dogfood scope: M2 complete; M3+ planning pending

---

**For detailed history, see history-archive.md**


- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)

## Learnings

### `--if-present` silent-skip guard pattern (2026-06-06, PR #50 follow-up)

`npm run <script> --workspaces --if-present` silently skips any workspace package that lacks the named script. This is convenient for optional scripts (test, clean) but is a bug trap for mandatory scripts like `lint`: a new package added without a `lint` script causes `npm run lint` to stay green while that package's lint errors escape entirely.

**Pattern — explicit guard script:** Add a small Node ESM script (`scripts/check-workspace-lint.mjs`) that:
1. Reads root `package.json` `workspaces` globs.
2. Enumerates each resolved package directory.
3. For packages that have a `src/` directory (lintable), asserts `scripts.lint` exists.
4. Exits non-zero and lists offending packages if any are missing.

The `src/` exemption rule avoids false positives on meta-packages that have no source to lint.

**Wiring into CI:** Add an explicit CI step (`node scripts/check-workspace-lint.mjs`) *before* `npm run lint` in `.github/workflows/ci.yml`. This fires early (no TypeScript build needed), is visible in CI step names, and keeps the guard decoupled from the root lint script itself. A missing lint script fails CI loudly before any silent skip can occur.

**Verification:** Run guard with all packages present → PASS. Temporarily remove `scripts.lint` from one package → FAIL with clear per-package message. Restore → PASS.

