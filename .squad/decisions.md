# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh




# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"




# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check




# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc



# forge_mcp_check should no longer exist as a function




# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.




# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---




# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---




# 2026-06-06: Aaron's Ruling — HookVerdict VETO Semantics (resolves graham-ledger-seam-OPEN)

**By:** Aaron Kubly (via Copilot)  
**Decision:** Option A — Adopt **VETO** as a first-class **pre-WAL Ledger-layer gate**.

- VETO fires at `Ledger.append` entry, BEFORE staging. Rejected input never enters the WAL → WAL stays purely append-only; §3's "all staged rows commit" invariant is intact.
- §4's `continue | observe | pause` (on the staged batch, inside the group-commit window) are untouched. VETO is a distinct, earlier policy boundary.
- Enforced by the type system: `Exclude<HookVerdict, 'VETO'>` at the WAL backend `commitRow` port so VETO can never cross the WAL boundary.
- §4.2 Walkthrough B RED test passes as written — no test rework.

**Required follow-on (documented amendments to FINAL specs):**

1. §4.1 verdict table — add VETO row ("no row created; Ledger throws `Append vetoed by hook: <id>`"), flagged as Ledger-layer (not commit-window).
2. §4.3 dispatch — add VETO case before the PAUSE check.
3. §11 replay contract — note: VETO inputs are not in the WAL; replay need not handle them (Ledger-layer policy, not a WAL concept).

**Why:** User ruling at Decision-Point Gate during WAL substrate + Walkthrough B build.

---




# Decision — Append-Only History Rule Reinterpreted (Supersedes Issue #71 Decision B)

**By:** Aaron Kubly (akubly)  
**Date:** 2026-06-16  
**Type:** Governance / Rules Clarification  
**Status:** ACCEPTED — establishes correct interpretation going forward

---

## What Was Corrected

The Append-Only History Rule, originally stated as a blanket prohibition on any modification to
`history.md` and `history-archive.md`, was overstated. The correct interpretation:

**Append-only refers to HOW new content is added to these files**, not a prohibition on
condensation:

- New entries are always **appended to the end of the file**, never interleaved or rewritten in
  place. This property is what makes these files safe to merge via the `.gitattributes
  merge=union` driver.
- **Condensation is sanctioned and lossless:** Scribe (and the `squad nap` tool) are intended to
  periodically condense old `history.md` entries by relocating them verbatim into
  `history-archive.md`, keeping the most recent N entries live in `history.md`.
- Archive files (`history-archive.md`, `decisions-archive.md`) are append-only targets — they
  only grow, never shrink or have existing content overwritten.

## Supersession

**Decision: Issue #71 Decision B, Option A** ("Drop size management, no deletions ever") is
**SUPERSEDED** by this reinterpretation.

The prior "Option C" (recency-based archival: move old entries to archive, delete from
history.md) is now the **sanctioned strategy**, provided:
1. Archived entries are preserved **verbatim** in `history-archive.md`
2. Archive files are **append-only** — they never lose pre-existing content
3. The `history.md` tail is truncated AFTER entries are appended to the archive (history is
   lossless overall)

## Rationale

Scribe's spawn template included a "HISTORY SUMMARIZATION" gate that was flagged as a violation
because it edited previously-committed history entries. This was correctly identified as a scope
violation — but the underlying policy was mischaracterized as "no size management ever." The
team intended size management all along; the error was HOW it was attempted (dropping data vs.
moving it).

The `squad nap` condensation output (appending old entries to history-archive.md verbatim,
then truncating history.md tail) is now **legal and correct** provided the archive grows and
nothing is lost.

## Action Items

- ✅ `squad nap` history-condensation diffs in the working tree (moving entries to
  history-archive.md, truncating history.md tail) are safe to commit and push.
- ✅ Future Scribe spawns and automated naps may condense history.md per the Option-C strategy.

---




# 1. Syntax check
bash -n .github/hooks/cairn/shell-init.sh
bash -n .github/hooks/cairn/install.sh
bash -n .github/hooks/cairn/uninstall.sh




# 2. Install (idempotent — run twice to confirm second run is no-op)
bash .github/hooks/cairn/install.sh
bash .github/hooks/cairn/install.sh   # should print "already installed"




# 3. Reload and smoke-check
source ~/.bashrc
forge_mcp_check




# 4. Uninstall
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc



# forge_mcp_check should no longer exist as a function




# 5. Re-install (confirm idempotency survived uninstall cycle)
bash .github/hooks/cairn/install.sh
source ~/.bashrc
forge_mcp_check
```

## Key design note

The marker block strategy (`# forge-mcp: shell init — start`) is the safe pattern
for managed rc-file entries. The install script will never double-append, and the
uninstall script removes the exact block. No manual editing required.




# PR #45 — Second Merge from origin/main (2026-06-05)

**Author:** Gabriel (Infrastructure)
**Branch:** squad/crucible-sprint-0-walkthrough-a
**Merge commit:** 9a26669

---

## What merged

Two PRs landed on main since the last merge:
- **#47** — M8 Slice B (eureka storage layer: `trust-updater-sqlite.ts`, contract test helpers, refactored `fact-reader-sqlite.ts`)
- **#44** — forge-mcp hooks (`.github/hooks/cairn/` install/uninstall/shell-init scripts; `forge-mcp-shell-install` skill)

Full diff summary: 35 files changed, 10641 insertions, 15048 deletions (large deletions from decisions-archive consolidation).

---

## Conflicts

**None.** The only overlapping files were `.squad/` append-only files (history.md, history-archive.md, decisions.md, decisions-archive.md), all covered by `merge=union` in `.gitattributes`. Git auto-resolved all of them via the union driver. No source files, no package-lock.json, no tsconfig conflicts.

---

## Build result

`npm install` — ✅ clean (no lockfile conflict; audit warnings pre-existing)
`npm run build` (all workspaces, `tsc --build`) — ✅ exit 0

---

## Test results

| Workspace | Tests | Result |
|---|---|---|
| `@akubly/crucible-core` | 6/6 | ✅ PASS |
| `@akubly/crucible-cli` | 1/1 | ✅ PASS |

---

## New HEAD

`9a26669` — Merge remote-tracking branch 'origin/main' into squad/crucible-sprint-0-walkthrough-a

---

## Status

Not pushed — Roger has follow-up fixes to land on top; coordinator will push after.


---




# 2026-06-06: Aaron's User Directive — Parallelization and TDD Discipline

**By:** Aaron Kubly (via Copilot)  
**Directive:** When parallelizing work, do NOT go parallel if it requires deviating from RED→GREEN TDD execution. TDD discipline (RED test fails first, then minimal GREEN, then REFACTOR) takes priority over parallelism. Parallel work is only permitted at TDD-safe boundaries (e.g., independent RED tests, interface/seam contracts) — never GREEN-before-RED, never shared-impl-before-seam.  
**Why:** User direction — captured for team memory during WAL substrate + Walkthrough B kickoff (Option A seam-first).

---





# Forge production runner integration (slice 1)

**Date:** 2026-06-22
**By:** Alexander (SDK/Runtime), with Roger (Platform) lifecycle guidance; shipped in PR #82 (squash 9f24aa8).
**Context:** The Forge feedback loop was built but underfed — no production runner drove real Copilot SDK sessions through `ForgeClient`, so dogfood profiles needed seeding via `forge-seed-profile`.

**Decisions:**
- **Composition root** lives in `packages/skillsmith-runtime/src/forgeSessionRunner.ts` (`runForgeInstrumentedSession`), owning the SDK → `ForgeClient` → Cairn telemetry-sink wiring. `runtime-cli` stays thin and takes NO direct `@akubly/forge` dependency.
- **Opt-in CLI** `forge-run-session` (runtime-cli) drives one real session. Exit codes: `0` samples written, `1` ran-but-no-samples, `2` bad input / auth / SDK-unavailable.
- **Permission seam:** `onPermissionRequest` on `ForgeSessionConfig`. `ForgeClient` defaults to a DENY handler (secure-by-default at the library); the runner composition root opts into SDK `approveAll` for dogfood.
- **Terminal-event drain is event-driven:** telemetry flush waits for the bridged `session_end` (observed as `session_end_observed`) with a timeout as a ceiling only — NOT a fixed wall-clock delay — so `outcome.succeeded` cannot become a false-negative when `session.shutdown` lands during/after `sdkSession.disconnect()`. The drain ceiling is an internal constant/test seam, not part of the public `ForgeSessionConfig`. Profile build uses `buildProfiles(db)` (not Cairn's `curate()`).
- **Disconnect observability:** `RunForgeInstrumentedSessionResult` carries `disconnect: { ok: true } | { ok: false; error: string }` so a persistent disconnect failure is visible, not swallowed.
- **Client ownership:** explicit `ownsSdkClient` (derived from `stopClientOnFinish ?? !injected`); injected SDK clients are not stopped unless requested.

**Shutdown ordering (Roger):** keep SDK subscriptions live during `sdkSession.disconnect()` → drain terminal events → flush telemetry → `ForgeClient.stop()` → `closeDb()` last.

**Deferred:** dogfood `SQLITE_BUSY` policy when a runner and an interactive session share `~/.cairn/knowledge.db` (Cairn sets no `busy_timeout`). Use an isolated `--db` for CI/dev.

**Review:** 3 local persona-review cycles (11 → 5 advisory → 0); Copilot cloud review clean (only flagged a decisions-ledger archive that was removed from the PR).

