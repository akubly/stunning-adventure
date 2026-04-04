---
updated_at: 2026-04-04T06:24:00Z
focus_area: Phase 6 PR #12 open. Phase 7 Backlog evaluation
active_issues:
  - "PR #12 — Phase 6 Plugin Packaging (open, awaiting merge)"
  - "#11 — Worktree-aware sessions (deferred to Phase 7)"
  - "CLI extension prototype evaluation (pending Aaron decision)"
---

# What We're Focused On

**Phase 6: Plugin Packaging Infrastructure** — COMPLETE

Cairn's plugin infrastructure complete. isScript symlink fix applied. PR #12 open for merge.

**Completed:**
- ✅ Plugin manifests (plugin.json, marketplace.json)
- ✅ Hook declarations (hooks.json)
- ✅ PowerShell wrapper scripts (curate.ps1, record.ps1)
- ✅ Architecture assessment (installation surfaces, strategies)
- ✅ README refresh (test counts, phase labels, MCP/hooks docs)
- ✅ Install script (src/install.ts) — copies hooks, registers MCP server
- ✅ CLI commands (src/cli.ts) — cairn install/uninstall/status
- ✅ isScript symlink fix
- ✅ Code review & validation (build, tests, lint all passing)
- ✅ Graham investigation: CLI extensions DO exist (undocumented), architecturally compelling

**Current:**
- 🔄 PR #12 — Phase 6 Plugin Packaging — APPROVED (awaiting merge)

**Backlog for Phase 7:**
- 🔄 **CLI extension prototype spike** (DECISION POINT) — Evaluate as MCP alternative. Addresses startup overhead + hook fragility + unified tools+hooks. Decision: Spike (Option A), Skip (Option B), or Extension-only (Option C, not recommended). [More: decisions.md § 2026-04-04]
- 🔄 npm publish to @akubly/cairn (critical for plugin distribution)
- 🔄 Worktree support (Issue #11) — session isolation by workdir
- 🔄 Bash wrappers for macOS/Linux
- 🔄 awesome-copilot submission
