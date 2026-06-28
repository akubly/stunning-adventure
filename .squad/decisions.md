# Issue #83 — curator.test.ts: 3 Test Failures Root-Caused and Fixed

**Author:** Gabriel  
**Date:** 2026-06-27T22:38:17.318-07:00  
**Status:** RESOLVED

---

## Root Cause

**Stale test expectation (date rot) — NOT a regression in `curate()`.**

Three tests in `packages/cairn/src/__tests__/curator.test.ts` (group "profile build inside curate()") inserted `signal_samples` rows with hardcoded `collectedAt: '2026-06-11 00:00:00'` dates. By 2026-06-27 those dates were 16 days old — beyond the 7-day TTL (`SIGNAL_SAMPLE_TTL_MS`).

`curate()` runs `sweepSignalSamples()` **before** `buildProfiles()` (correct design: sweep the bounded set first, then build profiles from clean data). The sweep deleted all the 16-day-old rows, so `buildProfiles` found an empty table, returned `profilesBuilt: 0`, and nothing was written to `execution_profiles`. The implementation was correct throughout.

## Evidence Distinguishing Regression vs Stale Test

| Signal | Value |
|--------|-------|
| "BuildResult carries durationMs" test (also uses June 11 dates) | **Passes** — only asserts `durationMs >= 0` (true even when rows=0 produces durationMs=0) |
| "sweep/cap runs BEFORE buildProfiles" test (uses `new Date().toISOString()`) | **Passes** — proves sweep + build both work correctly with live dates |
| "should complete curate() and run sweepChangeVectors even if buildProfiles throws" | **Passes** — sweep/cap path is independent of build |

All three passing tests work correctly. The 3 failures share exactly one trait: hardcoded old dates.

## Resolution

**File changed:** `packages/cairn/src/__tests__/curator.test.ts`

Replaced the 3 hardcoded `'2026-06-11 ...'` date strings with dynamic expressions:

- `new Date(Date.now() - 120_000).toISOString()` (2 min ago)
- `new Date(Date.now() - 60_000).toISOString()` (1 min ago)
- `new Date(now - 180_000).toISOString()`, `new Date(now - 120_000).toISOString()`, `new Date(now - 60_000).toISOString()` (ordering test)

No changes to production code. `curate()`, `buildProfiles()`, `sweepSignalSamples()`, and `sweepChangeVectors()` are all unchanged.

## Test Results

- `npx vitest run src/__tests__/curator.test.ts`: **49/49 passed**
- `npm test` (full cairn suite): **752/752 passed**

## Pattern for Future Reference

Any test that inserts rows with fixed-date `collectedAt` values into a table with a TTL sweep will rot as calendar time advances. Use `new Date(Date.now() - N).toISOString()` for "recent" samples intended to survive TTL. Only use explicit far-past dates (e.g. `'2020-01-01T00:00:00.000Z'`) when the intent is for the sweep to remove them.


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

After `buildProfiles(db)` and before `closeDb()`, the runner now executes best-effort DBOM generation and persistence:

```
dbomArtifact = generateDBOM(session.sessionId, [...session.getBridgeEvents()])
dbomRootHash = dbomArtifact.rootHash  // Always set (sentinel for empty, or computed hash)
if (dbomArtifact.stats.totalDecisions > 0):
    upsertDBOM(db, dbomArtifact)  // May throw; caught below
else:
    // No certification events → sentinel hash is persisted result, artifact not upserted
try:
    // ... (upsertDBOM if needed)
catch e:
    dbomPersistError = e.message
    // run still succeeds; rootHash retained
```

- `generateDBOM` is wrapped in try/catch: it CAN throw on malformed event payload, in which case `dbomRootHash` stays null and `dbomPersistError` is set.
- On the normal path, `generateDBOM` succeeds and returns a well-formed artifact: sentinel empty-set hash (SHA-256 of empty string) when no certification events; sealed chain root hash otherwise. `dbomRootHash` is non-null in all success paths.
- Persistence failure sets `dbomPersistError` but does not throw—run completes successfully with best-effort provenance.
- `generateDBOM` imported from `@akubly/forge` (already in deps).
- `upsertDBOM` and `loadDBOMArtifact` imported from `@akubly/cairn`.
- `getBridgeEvents()` is the existing snapshot accessor on `ForgeSession`.

### Result Fields

`dbomRootHash: string | null` and `dbomPersistError: string | null` added to `RunForgeInstrumentedSessionResult`:
- `dbomRootHash`: Non-null (64-char SHA-256 hex) in all cases where DBOM generation succeeded. When no certification-tier events exist, this is the deterministic empty-set sentinel hash. When at least one certification event was captured, this is the real chain root hash and the artifact was persisted to the database. Null only when DBOM generation itself threw.
- `dbomPersistError`: Non-null when DBOM generation or persistence failed; the run result is still valid (best-effort provenance). Null when DBOM was generated successfully (whether or not any certification events existed).

### Tests

`packages/skillsmith-runtime/src/__tests__/forgeSessionRunner.test.ts`:
1. **`persists a DBOM artifact and surfaces dbomRootHash when certification events exist`** — emits `permission.requested` + `permission.completed` SDK events (certification tier), asserts `result.dbomRootHash` matches SHA-256 pattern and `loadDBOMArtifact(db, sessionId)` returns artifact.
2. **`dbomRootHash is the empty-set sentinel and run succeeds when no certification events exist`** — emits only internal-tier events, asserts `result.dbomRootHash` equals the sentinel hash `generateDBOM('', []).rootHash`, `result.dbomPersistError === null`, and normal signal samples written.
3. **`surfaces dbomPersistError and does not throw when DBOM persistence fails`** — mocks `upsertDBOM` to throw, asserts run completes successfully with `result.dbomPersistError` set to error message and `result.dbomRootHash` non-null (computed hash retained).

Result: 3 new DBOM tests passing; 68 skillsmith-runtime + 694 forge tests pass. TypeScript compiles cleanly.

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

`docs/forge-dogfooding-guide.md` → "Operational Notes / Concurrency & shared database":
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


---

## Graham: Crucible S3 — Next Slice Recommendation

**Date:** 2026-06-16  
**Author:** Graham (Lead / Architect)  
**Status:** PROPOSED (pending Aaron approval)  
**Prerequisite:** S1 (WAL correctness) ✅ shipped, S2 (doc/governance) ✅ shipped

---

### Recommendation: Phase 0.5 Walking Skeleton

**Pick:** Option A — the CTD-defined gate for Phase 1 fan-out.

**Why:** The walking skeleton is the longest-pole dependency. Every Phase 1 lane (Router, Generators, Replay, SDK/Applier) is blocked until the skeleton passes. Shipping Aperture features or isolated stubs first would be locally productive but wouldn't unblock the critical path. The substrate is now correct and hardened (S1/S2) — the skeleton can build on solid ground.

**Trade-off named:** We defer visible UX features (#65/#66 Aperture ack/priority) in favor of invisible plumbing. Cost: no user-facing progress this slice. Benefit: unblocks 5 parallel lanes for Phase 1 — maximum downstream throughput.

---

### Slice Scope (6 skeleton checks per CTD §Phase 0.5)

1. **SdkProvider stub** (§12) — one LLM call boundary (mock/stub, not real SDK yet)
2. **L0 Bootstrap** — BootstrapPayload → offset-0 Observation rows in WAL
3. **WAL append** — LLM response committed as Observation + Decision with hash-chain
4. **`crucible status`** — CLI verb reading session ID, row count, last offset
5. **`crucible replay`** — A2 conformance: byte-equivalent replay from captured session
6. **FifoScheduler stub** — L3.5 tier boundary, immediate dispatch, satisfies A-Sched-1

**Gate rule:** All 6 checks green in CI on a single run before Phase 1 fan-out.

---

### Agent Ownership

| Component | Owner | Support |
|-----------|-------|---------|
| WAL bootstrap-batch + replay path | Roger | Laura (A2 conformance test) |
| SdkProvider interface + stub | Alexander | Graham (boundary shape) |
| FifoScheduler stub | Gabriel | Graham (tier contract) |
| `crucible status` + `crucible replay` verbs | Valanice | Laura (acceptance) |
| Orchestration / integration test | Graham | All |

**Rough size:** 3–4 days elapsed (parallel work across 4–5 agents once interfaces lock).

---

### Alternatives Considered

#### Option B: FifoScheduler + Router Stub Only

**Scope:** Implement §5.A scheduler tier boundary in isolation without the full vertical.  
**Owners:** Gabriel + Graham.  
**Size:** ~1 day.  
**Unblocks:** Router lane only.  
**Trade-off:** Fast and contained, but doesn't prove the L0→L1→replay vertical works end-to-end. We'd still need the skeleton before other lanes can start. Partial unblock only.

#### Option C: SDK Provider (§12) + Bootstrap Protocol

**Scope:** Alexander builds `SdkProvider` interface + bootstrap-batch WAL integration.  
**Owners:** Alexander + Roger.  
**Size:** ~2 days.  
**Unblocks:** §8 Applier (Alexander's serial dependency).  
**Trade-off:** Unblocks Alexander's downstream lane but leaves Gabriel, Laura, Valanice idle. Doesn't satisfy the skeleton gate — we'd still need to assemble the remaining pieces separately.

#### Option D: Aperture Feature Push (#65/#66)

**Scope:** unreadCount ack, getPriority surface, badge dismiss.  
**Owners:** Roger + Valanice.  
**Size:** ~2 days.  
**Unblocks:** Nothing on the critical path.  
**Trade-off:** Visible UX progress, satisfies user-facing demand. But it's Phase 2 work (§9 depends on §5 Router) being pulled forward — sequencing violation. Delays the gate that unblocks everything else.

---

### Decision Rationale (Trade-Off Terms)

| Factor | Skeleton (A) | Scheduler-only (B) | SDK+Boot (C) | Aperture (D) |
|--------|:---:|:---:|:---:|:---:|
| Unblocks Phase 1 fan-out | ✅ all 5 lanes | ❌ 1 lane | ❌ 1 lane | ❌ 0 lanes |
| Proves vertical correctness | ✅ L0→L1→replay | ❌ | 🟡 partial | ❌ |
| Team utilization | ✅ 4–5 agents | ❌ 2 agents | 🟡 2 agents | 🟡 2 agents |
| User-visible progress | ❌ none | ❌ none | ❌ none | ✅ badge UX |
| Risk if deferred | 🔴 blocks everything | 🟡 blocks 1 lane | 🟡 blocks 1 lane | 🟢 no urgency |

**Bottom line:** Option A is the only choice that unblocks the full team. The cost (no UX progress) is acceptable because the substrate is invisible infrastructure — users won't see anything until Phase 1 features land anyway.

---

## Graham: Skeleton Export Surface — Subpath Export Decision

**Date:** 2026-06-16  
**Author:** Graham (Lead / Architect)  
**Status:** APPLIED (committed to squad/crucible-s3-skeleton)  
**Scope:** API surface design for `@akubly/crucible-core` skeleton types/implementations

---

### Decision

Added a `package.json` `exports` map to `@akubly/crucible-core` with a `"./skeleton"` subpath:

```json
"exports": {
  ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
  "./skeleton": { "types": "./dist/skeleton/index.d.ts", "default": "./dist/skeleton/index.js" }
}
```

Consumers import via `@akubly/crucible-core/skeleton` — no `dist/` in the specifier.

### Alternative Considered

**Re-export from root `src/index.ts` barrel.** This is simpler (one fewer export map entry) but:
- Pollutes the permanent core API with Phase 0.5 scaffolding types (StubSdkProvider, FifoScheduler, etc.)
- Muddies the signal: consumers can't tell what's core vs. skeleton
- Makes it harder to remove/graduate the skeleton surface later without a breaking change

### Trade-Off

| Factor | Subpath (chosen) | Root barrel |
|--------|:---:|:---:|
| Clean API boundary | ✅ | ❌ mixed surface |
| Import ergonomics | ✅ `@akubly/crucible-core/skeleton` | ✅ `@akubly/crucible-core` |
| Removability when skeleton graduates | ✅ delete one export entry | ❌ breaking change |
| Configuration overhead | 🟡 2 extra lines in package.json | ✅ zero |
| Node16 moduleResolution compat | ✅ verified via --build --force | ✅ trivial |

### Rationale

The skeleton is explicitly Phase 0.5 plumbing — it's scaffolding that will either graduate into the core surface (renamed, refined) or be superseded by Phase 1 implementations. A subpath export makes this status explicit in the package contract: it's an intentional auxiliary surface, not the main API. The `exports` map also prevents deep-path `dist/` imports from forming — any consumer using `@akubly/crucible-core/dist/...` will get a resolution error once the `exports` field is present, enforcing the designed entry points.

### Files Changed

- `packages/crucible-core/package.json` — added `exports` map
- `packages/crucible-cli/src/index.ts` — repointed to `@akubly/crucible-core/skeleton`
- `packages/crucible-cli/src/commands/status.ts` — same repoint
- `packages/crucible-cli/src/commands/replay.ts` — same repoint

---

## Decision: StubSdkProvider deterministic contract (T4, Phase 0.5 skeleton)

**Author:** Alexander  
**Date:** 2026-06-16T22:37:56-07:00  
**Branch:** squad/crucible-s3-skeleton  
**Status:** PROPOSED — for team awareness

---

### Context

T4 (SK-1) required implementing `StubSdkProvider implements SdkProvider` in
`packages/crucible-core/src/skeleton/sdk-provider-stub.ts`. The stub must be:

- Deterministic (SK-5 byte-equivalent replay depends on it).
- Free of timestamps and randomness.
- Barrel-isolated (no edit to `skeleton/index.ts` — Graham owns it; T2/T3 run in parallel).

---

### Decision: djb2 hash of prompt as determinism mechanism

**Choice:** A non-cryptographic djb2 hash of the prompt string produces a stable 8-character
hex `promptHash`. Every field in both canned `PrimitiveInput` rows is derived from this hash
or from the literal prompt content — no clock reads, no `Math.random()`.

**Alternatives considered:**
- Plain prompt echoing (no hashing): content-stable but doesn't distinguish prompts whose
  payloads would diverge in a real provider. djb2 is better because it proves the stub is a
  pure function of the input.
- crypto.createHash('sha256'): overkill for a canned stub; adds an async dependency and
  node:crypto import for zero replay benefit.

**Why it matters downstream (Laura / Roger):**
`causalReadSet` on the Observation row is `[]` (nothing causally read before the observation).
`causalReadSet` on the Decision row is `[promptHash]` — the hash string is the logical causal
reference, not an EventId integer, because the stub operates before L1 assigns offsets.

---

### PrimitiveInput shapes (aligned contract for SK-3 committer)

```ts
// Observation row
{
  primitiveKind: 'observation',
  primitivePayload: { source: 'stub-sdk', content: `stub-response:${promptHash}`, promptHash },
  causalReadSet: [],
}

// Decision row
{
  primitiveKind: 'decision',
  primitivePayload: { source: 'stub-sdk', action: 'passthrough', rationale: `stub decision for prompt hash ${promptHash}` },
  causalReadSet: [promptHash],
}
```

Both rows omit the optional `metadata` field.

---

### File location

`packages/crucible-core/src/skeleton/sdk-provider-stub.ts`

Consumers import by direct path:
```ts
import { StubSdkProvider } from '../skeleton/sdk-provider-stub.js';
```

Do **not** import from `../skeleton/index.js` until Graham adds the export in the barrel.

---

## Gabriel — Skeleton Scheduler Decision (S3 T3)

**Date:** 2026-06-16T22:37:56-07:00
**Branch:** squad/crucible-s3-skeleton
**Author:** Gabriel (Infrastructure)
**Relevant skeleton check:** SK-6

---

### Decision: Export `FifoScheduler` by direct path only (not via `index.ts` barrel)

**Context:** T2 (Roger), T3 (Gabriel), T4 (Alexander), and T5 (Valanice) all work in parallel on `packages/crucible-core/src/skeleton/`. The barrel `index.ts` is Graham's integration surface; a 3-way merge conflict was explicitly flagged as a collision risk.

**Decision:** `FifoScheduler` is exported from its own file (`fifo-scheduler.ts`) only. It is NOT added to `index.ts`. Consumers import the class via the direct path `'../skeleton/fifo-scheduler.js'`. Type-only re-exports from `index.ts` (interfaces from `types.ts`) are unaffected.

**Tradeoffs:**
- ✅ Zero merge conflicts with T2/T4 barrel edits
- ✅ Follows the same pattern any future skeleton impl should use during parallel sprints
- ⚠️ Consumers must know the direct path — but the task brief explicitly calls this out, so it's an agreed contract, not a surprise

**Team note:** Graham should add the implementation export to `index.ts` as part of assembly (T1/orchestration) once all parallel tasks land, or leave direct-path imports in place if they prefer the explicitness.

---

## Roger — Skeleton WAL: Bootstrap Atomicity & Replay Engine Seam

**Author:** Roger (Platform Dev)
**Date:** 2026-06-16
**Branch:** `squad/crucible-s3-skeleton`
**Slice:** Crucible S3 Phase 0.5 Walking Skeleton — T2 (WAL/ledger lane)
**Status:** OPEN — needs T1 (Graham) review on GAP-1 and GAP-2 before Phase 1

---

### Context

T2 implements SK-2 (bootstrap-batch) and SK-5 (byte-equivalence replay) for the walking
skeleton.  Three files touched: `skeleton/bootstrap.ts` (new), `skeleton/replay-engine.ts`
(new), `ledger/ledger-impl.ts` (extended).  During implementation I hit two design gaps in
the locked interfaces that will need resolution before Phase 1.

---

### Decision 1 — Bootstrap rows committed sequentially, not atomically (Phase 0.5 scope)

**Situation:** §3.8 requires bootstrap-batch atomicity ("either every offset-0 Observation
durable or none are").  The current `WalBackend` interface only exposes single-row
`commitRow()`.  `flush()` is a concrete-class method on `FileSystemWalBackend`, not on the
interface.

**Decision:** For Phase 0.5, `LedgerImpl.bootstrap(rows)` commits rows sequentially via
the existing `commitRow()` path.  This is NOT atomic at the WAL level — a crash between
row N and row N+1 would leave a partially committed bootstrap batch.

**Rationale:** The skeleton's acceptance tests use an in-memory backend (no crash) or
a fresh FS session (no concurrent writer).  Partial bootstrap is unobservable in the
walking-skeleton scope.  Adding full atomicity now would require changing the locked
`WalBackend` interface — Graham's territory.

**Phase 1 resolution needed (GAP-2 in history.md):**
Option A — Expose `flush()` on the `WalBackend` interface; `bootstrap()` sets
`batchSize=N`, stages all N rows via `commitRow()`, then calls `flush()`.
Option B — Add `commitBootstrapBatch(rows)` to `WalBackend` as a purpose-built atomic
batch primitive.
Option A is lower friction (one interface method, reuses existing group-commit machinery).

---

### Decision 2 — `createLedger()` return type widened to `BootstrappableLedger`

**Situation:** Graham (T3) assembles the SkeletonSession and needs to call `.bootstrap(rows)`
on the ledger returned by `createLedger()`.  The `Ledger` interface (locked in `ledger.ts`)
does not have `bootstrap()`.

**Decision:** Exported `BootstrappableLedger extends Ledger` from `ledger-impl.ts` (NOT
from `ledger.ts`) and widened `createLedger()`'s return type to `Promise<BootstrappableLedger>`.

**Rationale:** Covariant return type — all existing code typed as `Ledger` continues to work
without changes.  `ledger.ts` is not touched.  Graham imports `BootstrappableLedger` and
`createLedger` by direct path from `../ledger/ledger-impl.js`.  The locked `CreateLedger`
type alias in `ledger.ts` is still satisfied because `BootstrappableLedger extends Ledger`.

**Watch:** if `CreateLedger` is used as a function type somewhere that the compiler checks,
the widened return type is fine (covariant in return position).

---

### Decision 3 — `flags.bootstrap` NOT set (GAP-1, Phase 1)

**Situation:** §3.8 specifies that every row in the bootstrap batch should have
`flags.bootstrap = true` in the WAL segment record header.  `PrimitiveInput` has no
`flags` field; `materializeRow()` always writes `flags.bootstrap = false`.

**Decision:** Bootstrap rows are committed with `flags.bootstrap = false` in Phase 0.5.
Aperture projection for the session-origin panel (which filters on this bit) is Phase 1.

**Phase 1 resolution needed (GAP-1 in history.md):**
Option A — Add `walFlags?: Partial<SegmentRecordFlags>` to `PrimitiveInput` (or to a new
`BootstrapPrimitiveInput` subtype).  `LedgerImpl.bootstrap()` passes `walFlags.bootstrap=true`
through to `commitRow()` which threads it into `materializeRow()`.
Option B — Add a separate `commitBootstrapRow(input, hookResult)` to `WalBackend` that
hardcodes `flags.bootstrap=true` internally.

T1 (Graham) should pick one before Phase 1 Aperture work lands.

---

### How this interacts with `seal-and-split`

Bootstrap rows use verdict=COMMIT (hookVerdict 0xFF), so they never trigger `sealAndSplit`.
The `seal-and-split` path (PAUSE verdict) is only entered by rows that go through the hook
bus, which bootstrap bypasses.  No interaction hazard.

---

### Signal to Valanice (T5 CLI) — replay factory signature

`ReplayEngine` interface (in `types.ts`) does not carry a `rootDir`.  The concrete factory
is:

```ts
import { createReplayEngine } from '../skeleton/replay-engine.js';
const engine = createReplayEngine(rootDir);   // rootDir = same root as your WAL backend
const report = await engine.replay(sessionId);
// SK-5: assert report.status === 'pass' && report.rowsReplayed === expectedCount
```

Do NOT construct a ReplayEngine via the interface directly — use `createReplayEngine`.
The `rootDir` must match the `rootDir` passed to `FileSystemWalBackend.create()`.

---

## Laura: Skeleton Tests — Testing Decisions

**Date:** 2026-06-16T23:00:15-07:00
**Author:** Laura (Tester)
**Slice:** Crucible S3 Phase 0.5 Walking Skeleton (T6-RED)
**Status:** PROPOSED — impl agents should review AMBIG-1 through AMBIG-4

---

### Decision 1: A2 oracle exported from acceptance test file

**Choice:** Export `stripWallClockDerived()`, `normalizeTimestamps()`, and `assertA2ByteEquivalent()` from `skeleton-vertical.test.ts` rather than creating a separate oracle helper module.

**Rationale:** The oracle helpers are small (< 30 lines), co-located with their spec derivation (§11.6/§11.8), and the conformance runner can import them directly. Adding a separate `oracle.ts` helper file would require updating the skeleton barrel (`index.ts`) and create a merge-contention surface with T2/T5. Co-location is simpler for Phase 0.5; if the oracle grows (full CBOR-canonical comparison per §3), promote it to a standalone file then.

**Affected parties:** ci:conformance replay runner (must import from test file path, not a package entrypoint). If the conformance runner cannot import from test files, this decision must be revisited.

---

### Decision 2: FifoScheduler unit tests are GREEN-from-day-one (not RED)

**Observation:** T3 (Gabriel) already landed `skeleton/fifo-scheduler.ts` on branch before Laura's T6-RED task ran. All 12 A-Sched-1 unit tests pass immediately.

**Decision:** Accept GREEN FifoScheduler tests. The RED requirement in T6 referred to "implementations T2–T5 don't exist yet"; T3 simply landed concurrently. The unit tests correctly document A-Sched-1 invariants and serve as the conformance gate for A-Sched-1.

---

### Decision 3: Assembly factory path is `skeleton/assembly.js`

**Choice:** The acceptance test imports `createSkeletonSession` from `../../skeleton/assembly.js`.

**Rationale:** The `skeleton/index.ts` barrel currently exports only types (`export type { ... }`). Adding a value export (`createSkeletonSession`) to `index.ts` would require the orchestration agent to modify that barrel, creating a merge-contention surface with T2/T3/T4 agents who may also need to add exports. An `assembly.ts` module is a clean, owner-isolated entrypoint.

**Constraint for T5 (orchestration):** Must create `packages/crucible-core/src/skeleton/assembly.ts` and export `createSkeletonSession` from it. Factory signature assumed:

```ts
export function createSkeletonSession(opts: {
  provider: SdkProvider;
  materializer?: BootstrapMaterializer;
  scheduler?: SchedulerPort;
  replayEngine?: ReplayEngine;
}): SkeletonSession
```

If T5 uses a different signature, update the call site in `skeleton-vertical.test.ts`.

---

### Open ambiguities (for impl agents to resolve)

| ID | Question | Owner |
|----|----------|-------|
| AMBIG-1 | `createSkeletonSession()` exact factory signature | T5 (orchestration) |
| AMBIG-2 | Does `SkeletonSession` need a `queryRows()` seam for SK-2/SK-3 row-kind assertions? | T2 (Roger) / T5 |
| AMBIG-3 | Exact bootstrap row count from StubSdkProvider (1 tool def + 0 memory = 2 rows?) | T2 (Roger) |
| AMBIG-4 | A2 wallClockMs ratio check: deferred until real session latency data exists | T2 (Roger) |

---

## CLI UX Decisions — Skeleton Verbs (S3 Phase 0.5)

**Author:** Valanice (UX / Human Factors)  
**Date:** 2026-06-16  
**Slice:** Crucible S3 Phase 0.5, CLI shell lane T5  
**Status:** DECISION — shipped in `squad/crucible-s3-skeleton`

---

### Decision A — `status` Output Format: Labeled Fields, Not Bare Values

**Context:** `crucible status` needs to surface session ID, row count, and last commit offset. Options were: (a) single-line condensed format (e.g., `sess_abc · 4 rows · offset 3`), (b) labeled multi-line block, (c) JSON.

**Decision:** Labeled multi-line block with a divider, human-text default.

```
Session Status
────────────────────────────────────────────
  Session ID  : fdd89e75-...
  Row count   : 4
  Last offset : 3
────────────────────────────────────────────
```

**Rationale:** The tired/distracted engineer persona (§13.5) scans top-to-bottom, not left-to-right. Labeled fields remove the need to count tokens. `Last offset` is the "freshness number" — the single value that tells you how far the session has progressed. The divider scopes the output block so it doesn't bleed into surrounding shell noise. Single-line condensed format fails accessibility for new users who don't yet know the field ordering; JSON is machine-first and adds overhead for the human use case.

---

### Decision B — `replay` Output Format: Verdict First, Details Below

**Context:** `crucible replay` can pass or fail. The human question is always "did it pass?" before "why did it fail?".

**Decision:** Verdict line is the first output, hardcoded top-left.

```
✓ REPLAY PASS          (pass case)
✗ REPLAY FAIL          (fail case — followed by divergence details)
```

**Rationale:** The ✓/✗ glyph is colour-independent (works in monochrome CI logs and terminals with no colour support), pipe-safe, and grep-able. Placing it first means a glancing scroll never misses the verdict. On failure, divergence offset and kind are promoted into the same block — not a separate `DETAILS:` section — because hiding them requires a second scan, which the tired human won't do.
Line-oriented output, no animations or spinners, per §13.2.

---

### Decision C — Programmatic-Shell Pattern for Command Handlers

**Context:** The command handlers could be (a) thin wrappers that only print to stdout, (b) functions that also return raw data, or (c) class-based.

**Decision:** Each handler (`runStatusCommand`, `runReplayCommand`) accepts a `SkeletonSession`, calls the relevant method, renders to stdout AND returns the raw result struct.

**Rationale:** Tests can call the function directly and assert on the returned value without parsing stdout. This avoids brittle string-matching in tests while preserving human-readable output as a side effect. The render functions (`renderStatus`, `renderReplay`) are separately exported for pure unit tests with no I/O.

---

### Gap Flag — Session-Reopen (Phase 1, Roger/Graham)

`createSkeletonSession()` creates only FRESH sessions. There is no Phase 0.5 API to open an existing session by ID for a separate process invocation. The CLI verbs currently require a live session object. Phase 1 must add `openSkeletonSession(sessionId, rootDir)` or equivalent catalog lookup to support the canonical `crucible status <sid>` usage pattern from a separate shell invocation.

### Gap Flag — `exports` Map in `crucible-core/package.json` (Phase 1, Graham)

`@akubly/crucible-core/skeleton` is not a valid subpath export (no `exports` field in package.json). The CLI works around this by importing from the compiled dist path (`@akubly/crucible-core/dist/skeleton/index.js`). This is brittle and couples the CLI to the build output layout. Phase 1 should add a proper `exports` map to `crucible-core/package.json` exposing `./skeleton` as a named subpath.
1. **Aaron decision pending:** Q1 & Q2 above (integrate landing, dedupKey in schema)
2. **Genesta & Crispin review:** Integration design memo — verify representation coverage
3. **Follow-up slice:** `integrate` cognitive orchestration (after `imprint` ships)
