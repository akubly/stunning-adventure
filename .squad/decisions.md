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

---




# Forge Runner — Slice 2 Decision (A+D)

**Date:** 2026-06-22  
**By:** Graham (Lead), Aaron approved; implemented by Alexander (SDK/Runtime, 2A) and Roger (Platform, 2D)  
**Status:** APPROVED and SHIPPED

---

## Approved Scope: Slice 2 = **(A) DBOM in runner** + **(D) SQLITE_BUSY policy**

Graham's proposal recommended A+D as the next increment. Aaron approved on 2026-06-22.

---

## Slice 2A — DBOM Generation in Runner

**Implementer:** Alexander (SDK/Runtime)  
**Status:** ✅ Shipped (tests green)

### What Was Wired

**File:** `packages/skillsmith-runtime/src/forgeSessionRunner.ts`

After `buildProfiles(db)` and before `closeDb()`, the runner now executes:

```
dbomArtifact = generateDBOM(session.sessionId, [...session.getBridgeEvents()])
if (dbomArtifact.stats.totalDecisions > 0):
    upsertDBOM(db, dbomArtifact)
    dbomRootHash = dbomArtifact.rootHash
else:
    dbomRootHash = null
```

- `generateDBOM` imported from `@akubly/forge` (already in deps).
- `upsertDBOM` and `loadDBOMArtifact` imported from `@akubly/cairn`.
- `getBridgeEvents()` is the existing snapshot accessor on `ForgeSession`.

### Result Field

`dbomRootHash: string | null` added to `RunForgeInstrumentedSessionResult`:
- Non-null (64-char SHA-256 hex) when ≥1 certification-tier event captured.
- Null when session produced only internal-tier events or no DBOM written.

### Tests

`packages/skillsmith-runtime/src/__tests__/forgeSessionRunner.test.ts`:
1. **`persists a DBOM artifact and surfaces dbomRootHash when certification events exist`** — emits `permission.requested` + `permission.completed` SDK events, asserts `result.dbomRootHash` matches SHA-256 pattern and `loadDBOMArtifact(db, sessionId)` returns artifact.
2. **`dbomRootHash is null and run succeeds when no certification events exist`** — emits only internal-tier events, asserts `result.dbomRootHash === null` and normal signal samples written.

Result: 2 new tests passing; 68 skillsmith-runtime + 694 forge tests pass. TypeScript compiles cleanly.

---

## Slice 2D — SQLITE_BUSY Policy in Cairn

**Implementer:** Roger (Platform)  
**Status:** ✅ Shipped (5 new tests pass)

### What Was Changed

**File:** `packages/cairn/src/db/index.ts` — `getDb()` function

Added `db.pragma('busy_timeout = 5000')` after WAL, before `foreign_keys`:

```typescript
db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');   // ← Slice 2D addition
db.pragma('foreign_keys = ON');
```

WAL was already set. Not modified.

### Concurrent-Access Contract

Every connection opened through `getDb()` (sole Cairn DB-open path) inherits:

| Pragma | Value | Effect |
|--------|-------|--------|
| `journal_mode` | `WAL` | Multiple readers never block writers; only one writer holds WAL write lock at a time. |
| `busy_timeout` | `5000` (ms) | When a second writer contends for WAL write lock, SQLite retries internally for up to 5 seconds before throwing `SQLITE_BUSY`. |
| `foreign_keys` | `ON` | Referential integrity enforced. |

**Implication:** `forge-run-session` (writer) + interactive Copilot session (reader/occasional writer) sharing `knowledge.db` resolves write contention within 5 s safety margin. Sustained concurrent write load still possible to hit limit; typical CLI+runner usage is not expected to.

### Test Coverage

`packages/cairn/src/__tests__/busyTimeout.test.ts` (5 tests):
- `getDb(filePath)` sets `busy_timeout = 5000`
- `getDb(':memory:')` sets `busy_timeout = 5000`
- WAL mode set (no regression)
- Concurrent writer succeeds when locker releases within 300 ms (worker-thread integration)
- Concurrent writer with `busy_timeout = 0` fails immediately with `SQLITE_BUSY` (negative control)

### Docs Updated

`docs/forge-dogfooding-guide.md` → "Known Limitations":
- Removed SQLITE_BUSY deferral note.
- Added policy description: WAL + 5 s busy_timeout, what it guarantees, caveat re: sustained load.

---

## Acceptance Criteria (Both Slices)

- ✅ `forge-run-session` run produces DBOM artifact retrievable via `loadDBOMArtifact(db, sessionId)`.
- ✅ `RunForgeInstrumentedSessionResult.dbomRootHash` non-null when certification-tier events exist.
- ✅ Concurrent `forge-run-session` + interactive session vs. same `knowledge.db` does not produce `SQLITE_BUSY` within 5 s busy_timeout.
- ✅ `npm test` passes (full suite).
- ✅ No Phase 4.6/5 cloud scope pulled in.

---

## Slice 2A Refinement — DBOM Result Contract: Best-Effort + Sentinel

**Date:** 2026-06-22  
**Author:** Alexander (SDK/Runtime)  
**Status:** FINAL — applied in `packages/skillsmith-runtime/src/forgeSessionRunner.ts`  
**Approval:** Persona panel (Correctness, Skeptic, Craft, Compliance, Architect); Aaron disposed findings; shipped PR #84

### Context

Slice 2A shipped DBOM wiring in the runner with `dbomRootHash: string | null`
where `null` meant "no certification events." A persona-review cycle identified
two gaps: (1) `null` conflated "no events" with "generation failed," and (2) a
thrown exception inside the DBOM block could break the slice-1 success/exit-code
contract. Aaron approved best-effort + sentinel semantics.

### `RunForgeInstrumentedSessionResult` DBOM Contract

#### `dbomRootHash: string | null`

| Value | Meaning |
|---|---|
| 64-char SHA-256 hex (non-null, non-sentinel) | At least one certification-tier event existed; artifact was persisted to the database via `upsertDBOM`. |
| `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (sentinel) | `generateDBOM` succeeded but found zero certification-tier events; no artifact persisted. This is the SHA-256 of the empty string, returned deterministically by `generateDBOM(sessionId, [])`. |
| `null` | DBOM generation or persistence threw (malformed event payload, storage error, etc.). See `dbomPersistError`. |

**Key distinction:** `null` now means "could not generate" — NOT "no events." The
empty-session case is now represented by the deterministic sentinel hash.

#### `dbomPersistError: string | null`

- **Non-null:** DBOM generation or persistence failed. Contains the error message
  (`e.message` if `Error`, otherwise `String(e)`). The run result is still valid —
  provenance is best-effort.
- **Null:** DBOM block completed without exception (covers both "sentinel" and
  "real hash" cases).

### Best-Effort Contract

The DBOM block (`generateDBOM` + conditional `upsertDBOM`) is wrapped in a
`try/catch`. A failure:

- Sets `dbomPersistError` to the error message.
- Logs `console.warn('[skillsmith-runtime] DBOM generation/persistence failed; run result unaffected', e)`.
- Does **not** throw out of `runForgeInstrumentedSession`.
- Does **not** affect `signalSamplesWritten`, `disconnect`, exit code, or any
  other field.

This mirrors the existing `disconnect` best-effort pattern: failures are
surfaced in the result type and logged, never propagated as unhandled exceptions.

### Implementation Notes

- `generateDBOM(sessionId, events)` — `@akubly/forge`. Filters to
  `provenanceTier === 'certification'`; `stats.totalDecisions` is 1:1 with
  certification-tier events. Returns well-formed artifact with sentinel rootHash
  for empty event lists.
- `upsertDBOM(db, artifact)` — `@akubly/cairn`. Idempotent (DELETE + INSERT in
  transaction). Called only when `hasCertificationEvents` is true.
- `bridgeEvents` captured once as `[...session.getBridgeEvents()]` (spread
  converts readonly to mutable as required by the generator signature).
- Ordering: after `buildProfiles(db)`, before `closeDb()` / `forgeClient.stop()`.

### Test Coverage

`packages/skillsmith-runtime/src/__tests__/forgeSessionRunner.test.ts`:

1. **Certification events → persist**: asserts `dbomRootHash` matches
   `/^[0-9a-f]{64}$/`, `loadDBOMArtifact` returns artifact, `artifact.rootHash ===
   result.dbomRootHash`, `totalDecisions === 2`.
2. **No certification events → sentinel**: asserts `dbomRootHash` equals
   `generateDBOM(sessionId, []).rootHash` (sentinel), `dbomPersistError === null`,
   no artifact persisted (`loadDBOMArtifact` returns null).
3. **Persistence failure → best-effort**: spies `cairn.upsertDBOM` to throw
   `'disk full'`; asserts run returns valid result, `dbomPersistError === 'disk
   full'`, no exception thrown.

---

## Slice 2D Refinement — busy_timeout Documentation & Inline Polish

**Date:** 2026-06-22  
**Author:** Roger (Platform)  
**Status:** Applied  
**Approval:** Persona panel; Aaron disposed findings; shipped PR #84

### F3 — Documentation Relocation (docs/forge-dogfooding-guide.md)

The concurrency bullet describing `busy_timeout = 5000` + WAL was incorrectly placed inside
the "Known Limitations / explicitly deferred" section. That section is reserved for future work;
placing delivered behavior there misleads operators into believing it is not yet functional.

**Fix applied:** Removed the bullet from the deferred list. Added a new `## Operational Notes`
section with a `### Concurrency & shared database` subsection, positioned between the
Troubleshooting and Known Limitations sections. Technical content of the bullet is preserved
verbatim, including the accurate caveat that 5 s reduces but does not eliminate contention under
sustained parallel write load.

The deferred list now contains only genuine future work (stock-session wiring, GP-tournament,
meta-optimization, Eureka FactStore, zsh support).

### F4 — Inline Comment on busy_timeout Pragma (packages/cairn/src/db/index.ts)

The module header already documented the concurrent-writer rationale for the 5 s timeout.
The pragma line itself lacked a comment explaining that it applies **globally** — to every
`getDb()` call including the migration runner.

**Fix applied:** Added a 4-line inline comment above the `db.pragma('busy_timeout = 5000')`
call explaining:
- Applies to ALL opens, including migrations.
- Acceptable because migrations are fast and idempotent.
- 5 s covers typical interleaved forge-run-session / interactive CLI usage.
- If startup hangs ~5 s, this global default is the first place to revisit.

No behavior change. No configurable value introduced (deferred — see below).

### Deferred Follow-up (for coordinator to file as GH issue if warranted)

**"Make busy_timeout configurable + log lock waits"**

Currently the 5 s value is a magic constant applied globally. Two improvements are deferred:

1. **Configurable timeout:** Accept a `busyTimeoutMs` option in `getDb()` (or via an env var
   `CAIRN_BUSY_TIMEOUT_MS`) so operators running multiple parallel `forge-run-session` instances
   or CI jobs with aggressive parallelism can tune the value without patching source.

2. **Lock-wait logging:** Emit a warning (stderr or a structured cairn event) when a connection
   hits the busy-timeout retry path. Currently there is no observability into whether the 5 s
   budget is ever being exercised in practice. A log line with timestamp, elapsed wait, and
   caller context would make contention incidents diagnosable without reaching for SQLite
   tracing.

**Why defer now:** The 5 s global default covers the current dogfood workload (one
`forge-run-session` + one interactive session). Making it configurable + observable is
a quality-of-life improvement, not a correctness fix. Revisit once dogfood signal shows
contention in practice.

### Test Validation

`npm test --workspace=@akubly/cairn` result:

- `busyTimeout.test.ts`: **5/5 pass** ✅
- Full suite: **749 pass, 3 fail**
- The 3 failures are pre-existing curator failures tracked as issue #83 — unrelated to this change.

