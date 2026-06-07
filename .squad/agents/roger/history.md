
📌 2026-06-06: **WAL PID-liveness stale-lock reclaim GREEN (D-LOCK-2 resolved)** — 4 new RED→GREEN tests (stale dead PID reclaimed, live PID blocks with PID in message, corrupt content = stale, empty content = stale). `acquireWriteLock()` now writes `process.pid` on create; on EEXIST reads stored PID, calls `isPidAlive()` via `process.kill(pid,0)`. ESRCH→dead→reclaim; EPERM→alive→throw; unparseable/empty→stale→reclaim. Residual race: read-PID→overwrite not atomic; v1 best-effort is acceptable — WAL hash-chain detects any corruption. Issue #55 tracks OS advisory lock upgrade. `WriteLockHeldError` now includes holder PID in message. Full suite 44/44 green. Group-commit/§3.5 NOT touched. — Roger


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.
# SUMMARY (as of 2026-06-01)

File size: 103960 bytes. See history-archive.md for earlier entries.

---

## 2026-06-06: Crucible Walkthrough B GREEN — WAL Substrate + Ledger Seam Implementation

📌 **Roger:** Implemented Walkthrough B GREEN for WAL substrate + Ledger pre-stage hook gate. Seam-first parallelization: built sub-seam internals (hash-chain BLAKE3, CAS, codec v0.1) in parallel with Graham's seam lock. Once Aaron ruled VETO (Option A), integrated the four-step protocol at Ledger.append. Result: hash-chain 9 tests, wal-codec 12 tests, wal-cas 4 tests, ledger impl 1 acceptance test (hook-veto). Total: 28/28 green. Key: lazy-load better-sqlite3 native module, return snapshot copy from getOwnEvents.

**Prefer domain types over `unknown[]` in port interfaces.** `DB.queryEvents` was typed `Promise<unknown[]>`, erasing the `Primitive` type that the in-memory impl already returned correctly. Port interfaces are contracts — they should reflect the actual domain type, not a widening escape hatch. When the impl already returns the right type, the fix is purely additive and compile-safe.

**Trailing-slash gitignore patterns match directories only (recurring lesson).** `.squad/health-report-*/` silently fails to ignore health-report *files* — the trailing slash restricts matching to directories. The correct pattern is `.squad/health-report-*` (no slash). This is the same issue that bit us during the Sprint 0 recovery; it is now documented with a callout in the SKILL example so future agents don't repeat the mistake.

---


📌 **ADR-0019 CONTRIBUTION** (2026-05-30T194147Z): CLI design findings incorporated: TTY detection + exit codes (non-TTY exit code 2 + error requiring explicit flag protects automation), `--no-interactive` flag spec, dropped `--disambiguator` (redundant with timestamp-variant preimage), kept both `--resume` flag and `crucible session resume` verb (orthogonal workflows). TTY/exit-code spec became load-bearing for final design. Skill: Interactive prompt + CI integration requires explicit TTY contract upfront; exit code conventions (130 for cancel, 2 for "needs flag") are essential for automation safety.

📌 Team update (2026-05-30T073638Z): **Pass A Execution DONE** — Roger (§13.1 CLI verbs: `crucible perf [top]` + `defer` help alignment). Coordinate with Valanice on §9.9 disclosure. All Pass A agents complete. Options docs PA-B4/childSid awaiting Aaron ruling. — Scribe

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe

📌 Team update (2026-05-28T23:59:59Z): **Crucible CTD Phase 2 Close-out (2026-05-28)** — §10 + §15 shipped. All Phase 1 errata closed (2a/2b/12b/5). Cross-section R2-6 sync (Rosella ↔ Roger) CLOSED. PluginVersionLock format finalized. Phase 3 unblocked. — Scribe

## 2026-05-28: CTD Phase 4 — CALL/RET semantics + Scheduler-tier WAL readiness (§3 + §10 amendments)

**Context:** Aaron locked three Phase 4 UIS decisions per team weigh-in. My scope: locks #2 (CALL/RET) + #3 (Scheduler tier — substrate implications only; Gabriel owns §5 Router/Scheduler boundary).

**§3 amendments (L1 WAL Substrate):**
- **New §3.3.4 — CALL/RET sub-kind fields on `TaskStart`/`TaskEnd`.** Additive body fields under §6.5 evolution rule: `invocationId` (session-unique CALL/RET pair id), `parentInvocationId` (lexical-stack parent, NULL at top level), `returnTo: EventId` on `task_end` (zero-walk RET link to matching `task_start`), optional `callDepth` (derivable, kept for §13 `bt` UX single-row read). Recommended derivation `BLAKE3(sessionId || taskId || commitOffset)` — LOCKING deferred to Graham/Aaron (open question). Mis-nesting is a durable `monotonic_violation`-class projection alert; row still commits. `parentInvocationId` is distinct from `envelope.causalParentId` (lexical-stack vs causal-spawn edges coexist).
- **New §3.3.5 — Scheduler-emitted Decisions.** Pure substrate-readiness declaration: scheduler Decisions traverse `AppendProtocol.append` indistinguishably from model Decisions. No new column; `scheduler_*` discriminator is an additive optional body field. Did NOT enumerate sub-kinds (Gabriel's §5/§17 scope).
- **§3.17 ripple bullets** extended for §5 (Scheduler is first-class L1 producer) and §10 (invocation-stack projection).

**§10 amendments (Session + Branching):**
- **§10.6 rewrite** — sub-task model updated with CALL/RET body shape; L2 bracket-discipline validator pinned; `fork_origin.body.openTaskStack` superseded by richer `openInvocationStack: Array<{ taskId, invocationId, parentInvocationId, callDepth }>` (legacy shape preserved as compat-tolerated).
- **New §10.6.1 — Stack-frame reconstruction (derived view).** Pseudocode `ReconstructInvocationStack(sessionId, N)`: linear scan, seeded from `fork_origin` for forks. Closes Laura Q2 CALL/RET well-bracketed-nesting gap — property is now a single-scan PBT over the WAL trace. Sonny's §13 `bt` UX feeds off this. Replay equality of reconstructed stack is part of §11.6 oracle.
- **New §10.6.2 — Sub-task vs sub-session distinction.** Authoritative 10-row comparison table (identity, storage, lineage edge, concurrency, plugin snapshot, bootstrap, hash chain, backtrace, use case, replay containment). Rule of thumb: blocking + same epistemic line → sub-task; alternative trajectory + independently inspectable → fork. The two compose.
- **§10.9 acceptance signals** + cross-refs extended (§5 Router/Scheduler, §13 CLI `bt`).

### Learnings

**Sub-kind body fields > new WAL columns for primitive evolution.** Phase 4 added invocation-frame structure (`invocationId`, `parentInvocationId`, `returnTo`, `callDepth`) without changing one byte of the WAL row schema. The §6.5 additive-evolution rule plus per-payload CBOR body means the substrate absorbs new structural fields by letting them ride inside `primitive.primitivePayload` (reachable via `payloadHash` like any other field). When the field genuinely needs row-prefix locality (cheap predicate scans without body fetch), promote to a `flags` bit (e.g. `taskBoundary`); otherwise leave it in the body. The CALL/RET fields are body-field candidates because they're consumed by stack reconstruction (already a body-walking projection), not by hot-path predicate scans.

**Two-edge discipline pays off again.** `envelope.causalParentId` (causal-spawn) and `body.parentInvocationId` (lexical-stack) are distinct edges that answer distinct queries — exactly mirroring §6.4's `parentId` (structural production) vs `causalParentId` (sub-task spawn) split. The discipline is: never collapse semantically-distinct edges into one field even if they "usually align." Replay debuggers and PBT generators want to traverse each independently. Future temptation will be to drop `parentInvocationId` because "you can recompute it from `causalParentId` plus stack reconstruction" — resist it; the redundancy is a structural witness, not duplication.

**Substrate-readiness declarations are a first-class artifact.** §3.3.5 doesn't spec the Scheduler — it declares L1 ready for it. This is the right pattern when (a) another section owns the actual spec and (b) you need to publish "the substrate will not need to change" as an architectural guarantee. The shape of such a declaration: name the path through existing surfaces (`AppendProtocol.append`), name the discriminator location (body field, not row column), name the published guarantee ("regardless of who emitted it"), and explicitly disclaim what is NOT in scope. Gabriel can now design §5 without round-tripping with me on storage shape; if his design requires substrate change, that becomes a NEW Phase 4 finding rather than a surprise.

**Mis-nesting as durable signal, not exception.** Append-only discipline says: a `task_end` that doesn't match the top-of-stack `invocationId` still commits. The violation surfaces as an Aperture attention-tier event, not a thrown exception. This is the same pattern as §3.10 `monotonic_violation` — the WAL never refuses a row for structural-validator reasons; it records the discrepancy as another row and lets investigation (L5) decide what it means. Phase 4 added the third instance of this pattern; it's now a substrate idiom worth naming in §17.

📌 Team update (2026-05-22T14:07:59Z): **Phase 4.6 Wave 2 complete** — ChangeVectorProvider + ForgePrescriberOrchestrator + autoApplyEligible safety gate + hint dedup + forge-prescribe CLI all shipped. 1199 tests passing, 9 work items landed, 4 decisions merged. Wave 3 (Curator-driven orchestration + composition root) deferred behind ADR. — Scribe

## 2026-05-30: CLI Review — childSid Collision Hybrid Design (Round 2)

**Context:** Aaron requested user-story framing for childSid collision design. Rosella delivered hybrid option (user chooses fresh/resume at fork time, interactive prompt on collision). Roger reviewed for CLI consistency.

**Verdict: APPROVE-WITH-CONDITIONS.** Verb/flag shape is consistent with §13.1 taxonomy. Help text mirrors `defer` conventions. `--disambiguator` flag from Option B is **redundant** (timestamp-variant preimage in `--fresh` handles collision prevention). Interactive prompt mechanics need tightening: TTY detection, `--no-interactive` flag, exit codes (0, 1, 2, 130).

**Deliverables:**
- Review document: `.squad/decisions/inbox/roger-review-childsid-hybrid.md` (16.4 KB, comprehensive analysis)
- Draft help text for `crucible fork --help` (mirrors §13 conventions + L1 semantics)
- Condition #1: Keep both flag-based `--resume` and verb-based `crucible session resume <childSid>` (orthogonal use cases)
- Condition #2: Spec TTY detection + exit codes (Table: 0=success, 1=generic error, 2=non-TTY needs flag, 130=user cancel)

**Key design points:**
- `crucible fork --at <offset>` (interactive on collision, TTY-aware)
- `crucible fork --at <offset> --fresh` (deterministic timestamp preimage, orphan aborted)
- `crucible fork --at <offset> --resume` (error if none exists; requires --no-interactive in CI)
- `crucible session resume <childSid>` (direct resume by session ID; separate from flag)
- `--no-interactive` flag suppresses prompt even if TTY detected (CI/script safe)
- Decision row in parent ledger records choice (fresh/resume + rationale) → deterministic replay

**Learnings:**
- **Interactive CLI + CI integration:** Always spec TTY detection upfront, not as afterthought. Non-TTY context requires explicit flag-driven paths; exit code 2 ("needs flag") is load-bearing for automation.
- **Redundancy detection:** Multiple mechanisms for same goal (timestamp preimage vs user-provided disambiguator) create cognitive load + implementation risk. Favor one well-chosen mechanism (timestamp) unless escape hatch solves qualitatively different problem.
- **Verb vs flag distinction:** Separate verbs (`crucible session resume`) and flags (`--resume` on `fork`) serve different UX flows. Document relationship clearly when both exist.
- **Decision-recording for determinism:** When user input affects session structure, record choice as Decision row (not silent WAL write). Evidence.rationale documents *why* (flag/prompt/default) → audit trail + unambiguous replay.

---


# Archived (2026-06-05, 2026-06-02, 2026-05-30, 2026-05-29, 2026-05-28 ... older)

*Collapsed for brevity. See history-archive.md for details.*

---

- 2026-06-06 📌 M3: HintDispositionProvider seam finalized on squad/42-forge-m3-disposition (3 commits, 1563 tests green, READY TO SHIP). Disposition vocabulary shared via hintStateTransitionConstants.ts; constants flow: emit → payload → SQL. Seam interface locked, no breaking changes pending.

---

## Archive Summary

Earlier entries (966 lines) archived to history-archive.md on 2026-06-05.

---

### Shared serializer pattern (N3)

For tool families with a list (summary) + get (full) shape, extract a private `buildXxxSummary()` helper in server.ts. The get builder spreads summary and adds full-detail fields. Location: private (non-exported) function above the exported builder pair in server.ts. This prevents list/get field drift. Document intentional omissions (e.g., raw confidence float) with a one-line JSDoc on the summary helper.

## Learnings (2026-05-31 — M1 Cycle-1 Findings: Issue #39)

### Schema co-evolution: two migrations in one PR (017 + 018)

Adding migration 018 to the same PR as 017 was fine — the runner is purely sequential, both migrations are guarded against missing tables, and each is idempotent. The only cost was updating the "MAX(version)" assertions in 4 test files a second time. If the two columns had been logically coupled from the start I'd prefer one migration, but when review feedback drives the change, a second migration is the right call — it keeps the migration history honest (017 = what shipped, 018 = what review demanded) and makes rollback surgical.

### Handler-layer testability pattern (extracted pure functions)

The cleanest approach: extract each handler body into an exported pure function that takes `db: Database.Database` + params and returns the raw JSON payload object. The MCP handler wraps the result in `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tests import the pure function directly from `server.ts` (safe because the `if (isScript)` guard prevents the MCP server from starting on import). Benefits:
- Tests operate on plain objects, not MCP content wrappers
- No MCP harness needed
- Functions are also useful in non-MCP contexts (e.g., CLI tools, tests in other packages)
Pattern: `buildListHintsResult(db, params)`, `buildResolveHintResult(db, params)`, `buildGetHintResult(db, params)`.

### Persona finding initially disagreed with, then came around

**F6 (active_count misleading when status filter present):** My first reaction was "the consumer knows what status they asked for, active_count is just extra info." But after implementing it I understood the Craft persona's point: if you ask for `status=rejected` and get `active_count: 0`, an LLM consumer might interpret that as "nothing is active" when really active hints exist — they just weren't in scope. Omitting the field when it can only be misleading is the cleaner contract. The comment in the code documents this intent for the next engineer.

**F11 (event payload missing resolution intent):** Also came around on this. The initial emit recorded `from_state → rejected` which is sufficient for lifecycle tracking. But Aaron's stated dogfood loop requires forge to distinguish user-dismissed hints from system-expired ones. Without `source: 'mcp'` + `resolution_disposition` in the event, forge can't learn from Copilot's disposition signal. The fix was low-cost; the signal is high-value.

## Learnings (2026-05-31 — Issue #39 M1: Hint Consumption MCP Tools)

### Partial-schema test DB gotcha with ALTER TABLE migrations
- Tests like `migration015.test.ts` and `worktreeSessions.test.ts` create a bare SQLite DB with `schema_version` seeded at a specific version (e.g., 14 or 15) then call `applyMigrations()`. They only include the tables they need (e.g., `sessions`). If your new migration uses `ALTER TABLE <table>` and that table was created by an earlier migration (that was skipped), it will fail with "no such table: X".
- Fix pattern: guard the migration with a `SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='my_table'` check. Return early if table doesn't exist. Also add an idempotency guard with `PRAGMA table_info(my_table)` to check if the column already exists before `ALTER TABLE`.

### cairn MCP tool registration pattern
- All cairn tools live in `packages/cairn/src/mcp/server.ts` via `server.registerTool(name, schema, handler)`.
- Follow the exact pattern: `{ title, description, inputSchema: { ... zod fields }, annotations: { readOnlyHint } }`.
- Handlers always call `ensureDb()` first, wrap everything in try/catch, return `{ content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }`.
- Error path: `return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }], isError: true }`.
- `confidenceToWords()` is already exported from server.ts for high/medium/emerging labels.
- For read-only tools: `annotations: { readOnlyHint: true }`. For mutating tools: `annotations: { readOnlyHint: false }`.

### Never use `git add .` after manual file work
Never use `git add .` after manual file work — explicit per-file staging avoids sweeping untracked artifacts into commits.

### Idempotent resolution with status machine
- `optimization_hints` has a strict state machine (STATUS_TRANSITIONS). User-facing "resolve" actions should use `force: true` semantics or bypass the machine directly via SQL UPDATE.
- Terminal statuses: `applied, rejected, expired, suppressed, failed`. Check these before transitioning so the resolve tool can be idempotent.
- Both "resolved" and "dismissed" user dispositions map to `rejected` status — the distinction is preserved in `resolution_note` and the returned `resolution` field.

## Learnings (2026-05-27 — Issue #11 WI-A: workdir-aware sessions)

### Migration wire-up pattern
- Import the new migration in `schema.ts` alongside previous ones; append to the `migrations` array. The runner applies them in order using `MAX(version)`. No other file needs touching.
- Any pre-existing test that asserts `MAX(version) = N` or `COUNT(*) from schema_version = N` will break when a new migration lands — update those assertions (they're "track the latest version" tests, not migration-specific tests).
- Partial index on an active-status predicate (`WHERE status = 'active'`) is the right pattern for session lookup indexes — keeps the index small and covers the hot query path.

### NULL-IS query semantics for workdir
- SQLite's `IS` operator handles NULL comparison correctly: `col IS NULL` matches NULLs; `col IS 'value'` matches the literal. Use `IS` (not `=`) in WHERE clauses that need to match NULL as a distinct identity value.
- In better-sqlite3, `stmt.get(repoKey, null)` passes SQL NULL correctly — no need for IS NULL string injection.
- Keep two separate inner helpers: one without a workdir filter (for MCP fallback that needs any session) and one that always applies `workdir IS ?` (for worktree-scoped lookups). Don't try to collapse them into one with a conditional clause when the semantics diverge.

### `getActiveSession` backcompat semantic (reconciled with Laura)
- When `workdir` is omitted: NO workdir filter — returns most recent active session regardless of workdir. This is the correct backcompat path because old callers expect to find the session they created (which may have had a workdir set by new code).
- When `workdir` is provided: `AND workdir IS ?` — exact worktree match. String value matches that workdir; `null` passed explicitly matches NULL rows.
- The spec said "fall back to `WHERE repo_key = ?`" — that means truly no filter, not "filter for NULL." The "preserve backcompat" language refers to old callers still working, not to NULL-only matching.

### Concurrent test authorship — live file changes
- Laura's test file (`worktreeSessions.test.ts`) was written concurrently in the same worktree. I read one version, implemented to its expectations, then the file changed before I re-ran tests. The failing test name changed between runs — that's a signal the file was updated, not that my implementation broke.
- When a test file changes mid-flight, re-read it before diagnosing a "new" failure. Don't chase the old test contract.

### New API threading pattern for optional context params
- When adding an optional context param (like `workdir`) to a function with multiple optional callback params after it (like `afterCurate`), add the new param as the LAST optional so existing callers don't break by positional shift. Exception: if the new param is semantically earlier, introduce an options object instead.
- In archivist.ts, `getDb()` at the agent level is fine — the DB injection rule applies to `packages/cairn/src/db/*.ts` helpers, not to agent-level orchestration code.


## Session: 2026-05-28 Wave 6 Tail — WI-A Implementation Complete

**Status:** Complete

- Implemented migration 015 (workdir column + partial index)
- Updated DB API: createSession, getActiveSession, listActiveSessionsForRepo
- New export: getWorkdir() for git integration
- Threaded workdir through archivist, sessionStart, postToolUse, types
- MCP breaking change: get_status flat array, get_session identity lookup
- Semantic correction applied (turn 2): getActiveSession no-arg → \AND workdir IS NULL\
- Validation: Build clean, 647/647 tests passing

**Commits:** 2613c78 + ea9ab58

**Decision files:** roger-issue-11-implementation.md + roger-issue-11-api.md → merged to decisions.md

**Next:** Branch ready for merge. WI-B (Gabriel) queued.


### 2026-05-02: Phase 4.5 Telemetry Learnings & Persona Review Fixes

**Event:** Telemetry module hardening post-persona review.

**Key fixes:**
- F1: Weighted mean aggregation (prevent overwrite of prior history)
- F2: Convergence floor (fire on first success signal, not end-of-session)
- F4: Event contract alignment (COLLECTOR_BRIDGE_EVENTS constant + contract test)
- F5: Streaming percentile sketch (100-bucket histogram for [0,1] drift range)
- F6a: Per-signal component means on ExecutionProfile.signals
- F7: Silent error logging in sink
- F11: typeof guards on payloads (toolName string, numeric guards)

**Architecture patterns learned:**
- Shared symbol enums for cross-module contracts (bridge ↔ collectors)
- Streaming quantile sketches for bounded metrics
- weightedMean() helper prevents deflation-toward-zero failure mode
- Fail-open principle: telemetry must never block session execution

**Files touched:** 7 core files + 3 test files. Tests: +24 new. Build: 1012 passing (cairn 478 + forge 534).

**Key lesson:** When collector contract spans modules, enumerate shared symbols + enforce via contract test. Type-level coupling insufficient for JSON boundaries.


📌 Team update (2026-05-30T12:26:16Z): **WI-B (PR #29) shipped** — Coordinator worktree dispatch now real; use SQUAD_WORKTREES=1 to activate. Cycles: 8→5→8→51→19→9→0 threads. Recovery: cycle-3 incident (direct push ae62558 reverted 3086c68) taught worktree armor pattern; Graham's prose redesign (cycle 4) resolved F8/F9/F10; final state: zero unresolved threads, clean main. Follow-ups: fallback warning (issue filed), #25 polish. — Scribe
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

## Session: 2026-06-01 — Crucible Sprint 0 First GREEN

**Status:** Complete

### What was done
- Scaffolded `packages/crucible-core/` (package.json, tsconfig.json, README.md, vitest.config.ts)
- Implemented 6-stub public surface: `PrimitiveKind`, `PrimitiveInput`, `Primitive`, `SessionMetadata`, `Session`, `createSession`, `fork`
- Wired `packages/crucible-cli/src/index.ts` to re-export `createSession`/`fork` from `@akubly/crucible-core`
- Updated crucible-cli package.json, tsconfig.json, and root tsconfig.json references
- All 4 A1 invariants GREEN in Laura's acceptance test

### Learnings

#### GREEN-phase pattern: simplest real impl behind the acceptance API
When an acceptance test directly calls `createSession`/`fork` (no injected collaborators), the GREEN step is a real in-memory implementation — not a mock. London-school descent (introduce Ledger mock) happens in the next RED cycle. Don't jump to abstractions in GREEN.

#### query() range convention: inclusive-inclusive [a, b]
`query({ range: [a, b] })` returns b − a + 1 primitives when all offsets are present. Derived from the test: `query({ range: [0, 46] }) → length 47`. Document this as a comment in the implementation; it's easy to misread as exclusive-end.

#### In-memory parent-registry approach for fork
Module-level `Map<sessionId, Primitive[]>` holds each session's **own events only**. Child sessions store zero events at fork time; their `query` for offsets ≤ `forkPointEventId` delegates to the parent's registry entry. No physical copy is made. Parent remains unmodified. This satisfies the A1 "parent unmodified" invariant with minimal code.

Child offset assignment:
```ts
const baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1;
const offset = baseOffset + ownEvents.length;
```
This works for both root sessions (null → base 0) and child sessions (fork at N → base N+1).

#### Deferred: Ledger abstraction
No Ledger class, WAL interface, or Cairn integration introduced. That is the REFACTOR step of the next TDD cycle. Keeping GREEN minimal is discipline, not laziness.


## Session: 2026-06-01 — Crucible Sprint 0 REFACTOR Phase

**Status:** Complete

### What was done
- Extracted ForkLineage value object at packages/crucible-core/src/ledger/fork-lineage.ts
- Introduced DB interface (db.ts) and SessionManager class (session-manager.ts)
- Created createInMemoryDB() adapter (in-memory-db.ts) wrapping the old registry
- Refactored session.ts to compose against singleton InMemoryDB + SessionManager
- Updated barrel index.ts to export all new public surface
- Decision inbox: roger-crucible-refactor-session-manager.md
- Skill: london-tdd-refactor-extract-collaborator/SKILL.md written

### Test results
- crucible-core unit (4/4 GREEN): rejects fork-beyond-size, rejects negative offset, inherits transitive dep graph, records lineage
- crucible-cli acceptance (1/1 GREEN): no regression
- Full monorepo build: exit 0

## Learnings

### REFACTOR pattern: extract value object + collaborator interface + adapter

When the GREEN step has a flat module with module-level state, REFACTOR follows this sequence:
1. **Value object**: extract the invariant holder as a class (ForkLineage). Pure data + validation, no I/O.
2. **Collaborator interface**: define the narrowest possible DB interface — exactly the methods the new class needs. This is the seam the unit tests mock.
3. **Service class**: create the collaborator-using class (SessionManager) that accepts DB in its constructor. All invariant checks live here.
4. **Adapter**: implement the interface against existing in-memory state (createInMemoryDB). Internal helpers (not in the DB interface) are exposed via an extended InMemoryDB interface used only by the composition layer.
5. **Wire**: update the public-facing module-level functions to compose new pieces without changing signatures.

### DB interface contract (locked for unit test compatibility)

```ts
export interface DB {
  getSession(id: string): Promise<{ id: string; ledgerSize: number; pluginVersions?: Record<string, string> } | null>;
  insertSession(session: { id: string; parentSessionId: string | null; forkPointEventId: number | null; pluginVersions?: Record<string, string>; createdAt: number }): Promise<void>;
  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```
This shape is locked because Laura's unit test mocks mirror it exactly. Any shape change here requires updating session-manager.test.ts in tandem.

### In-memory adapter: extend DB for internal helpers

The DB interface is the minimal mock contract. The real adapter needs extra methods (insertRootSession, pushEvent, getOwnEvents, getMetadata) that the service class should not see. Pattern: define InMemoryDB extends DB in in-memory-db.ts, return it from createInMemoryDB(). Import InMemoryDB in session.ts for the singleton; import only DB in SessionManager. Clean separation.

### ledgerSize computation for in-memory adapter

- Root session: ownEvents.length
- Child session: forkPointEventId + 1 + ownEvents.length

This mirrors the offset assignment in buildSession: baseOffset = forkPointEventId === null ? 0 : forkPointEventId + 1.

### ForkLineage.parentSessionId: string | null (not just string)

The strategy doc snippet declared parentSessionId: string, but root() needs to pass null. Accept string | null. Document with a comment in the file. This is a common pattern: the strategy snippet covers the happy-path shape; the sentinel case reveals the fuller type.

## Learnings (2026-06-02 — Crucible Sprint 0 Cycle 1 fixes)

**M3 decision — keep range:[a,b] tuple (Option B):**
Chose Option B (JSDoc reinforcement) over Option A (rename to named-field API). The rename would cascade to the acceptance test and session.ts query internals with no Sprint 0 correctness benefit. The tuple is already documented as inclusive-inclusive; adding explicit startOffset/endOffset position labelling in the JSDoc and a deferred-to-future-sprint note is enough signal for consumers. Key rule: don't burn API-churn budget in Cycle 1 on ergonomics when the semantics are already correct and documented.

**I1 reset hook pattern — clear() on the InMemoryDB interface:**
Test isolation for a module-level singleton requires a seam that test code can reach without constructing a private DB. The right pattern: add clear() to the interface (not a backdoor cast), implement as store.clear() on the factory closure, and export a thin resetInMemoryDb() wrapper from the module that calls db.clear(). The function name is fixed by the Laura contract — name it exactly right the first time. This pattern scales: any future DB adapter (SQLite) will implement clear() as a DELETE FROM ... sweep, keeping the test seam consistent.

**I3 silent-drop fix rationale:**
The optional-chain pattern store.get(id)?.ownEvents.push(event) is a silent data-loss footgun: a missing session produces no error and no diagnostic. The rule is: **throw at the storage boundary, not at the consumer**. The caller (session.ts append) can only make forward progress if the push succeeded; letting it silently no-op would corrupt the offset sequence without any observable signal until a later query returned wrong data. Explicit guard + throw surfaces the bug at the earliest possible point.

- 2026-06-05 ✅ persona-review-cycle 2 complete: Crucible Sprint 0 Walkthrough A ready to ship (Cycle 1: 11 findings, 10 fixed; Cycle 2: 3 advisory, 2 fixed, 1 deferred)
**Scribe note (2026-05-29T23:24:24Z):** Review cycle 2 complete. All findings processed. M5 unblocked. See decisions.md for Cycle 2 resolutions.

---

## 2026-06-02: M8 Slice A — Cycle-2 Fixes (PR #43)

**Context:** Five persona findings from the Slice A SQLite FactReader review (Correctness, Craft, Skeptic, Architect). Aaron's dispositions accepted I1, I4, I5, I6; deferred I2; rejected I3; minors M1–M5 accepted, M6/M7 skipped.

**Commits shipped:**
- `67c2a87` I1: `busy_timeout = 5000` — prevent SQLITE_BUSY on concurrent writers
- `cb1e332` I4: capture WAL pragma result, warn to stderr if mode ≠ 'wal'; never stdout (MCP stdio rule)
- `0163343` I5: `BEGIN IMMEDIATE` wraps version-read + migration loop in `applyMigrations`; `IF NOT EXISTS` on all DDL in migration 001 (defense-in-depth for crash recovery); slice-section comments added
- `4235f8c` I6: `./sqlite` subpath export; `SqliteFactReader` removed from core surface; `better-sqlite3` → `optionalDependencies`; `createRequire` runtime guard in `openDatabase.ts`; contract test import updated to `../../sqlite/index.js`
- `b490438` Minors: M1 (trust_after SQL comment), M2 (JSDoc rationale), M3 (INSERT OR REPLACE seed), M4 (cleanup/afterEach), M5 (content omission comment), I2 (NOTE deferral comment)

**Test count:** 84/84 green throughout. No regressions in cairn/forge/runtime-cli.

### Learnings

**`createRequire` is the correct ESM pattern for optional CJS native addons.** With `type: "module"` in package.json, static `import` of an optional module fails at load time with no opportunity to provide a better error message. `createRequire(import.meta.url)` + try/catch inside the consuming function gives clean degraded-mode semantics: the module loads fine without the addon; only `openDatabase()` callers pay for the dependency. `import type` keeps full TypeScript typing without the runtime binding.

**Subpath exports + optionalDependencies is the right isolation boundary for native addons.** Moving `better-sqlite3` to `optionalDependencies` and gating it behind `./sqlite` subpath means in-memory consumers see zero native-module cost. The core `@akubly/eureka` surface stays portable. This pattern will recur anywhere native addons are "heavy but optional" (e.g., a hypothetical `./leveldb` subpath for production key-value tier in Slice D).

**BEGIN IMMEDIATE is the migration race fix, not IF NOT EXISTS alone.** `IF NOT EXISTS` is defense-in-depth for crash recovery (partially-applied DDL); it does not serialize two simultaneous first-opens. IMMEDIATE lock ensures only one process applies migrations; the other reads `schema_version = 1` and skips cleanly. The two mechanisms solve different failure modes and should both be present.

**Harness cleanup belongs in the contract helper, not implementation-specific blocks.** Making `cleanup?: () => void` optional on `FactReaderHarness` keeps the InMemoryFactReader harness backward-compatible (no native handles to close) while ensuring all native-backed implementations can register teardown. The `afterEach(() => harness?.cleanup?.())` pattern in `runFactReaderContract` guarantees cleanup fires even if a test throws. Pattern applies to any future harness that wraps a native resource (file, socket, worker thread).

## 2026-06-05: PR #45 Copilot Review — Comment Accuracy + Docs Fixes

**Context:** Copilot's cloud review on PR #45 flagged doc/comment accuracy issues in crucible-core and crucible-cli. All five fixes are comment/doc-only — no logic changes.

### Learnings

**RED-phase scaffolding comments are review debt that must be cleared when impl lands.** When TDD RED-phase tests go GREEN, header comments saying "MUST FAIL" / "does not exist yet" become false documentation. Pattern: update test-file headers at the same commit that ships the implementation, or log a doc-cleanup follow-up. Leaving RED-phase framing in a GREEN test misleads reviewers and tools.

**Package READMEs are two levels below the repo root.** Packages live at packages/<name>/, so packages/<name>/README.md is two directory levels deep. A relative path to docs/ at the repo root must use ../../docs/, not ../docs/ (which resolves to the non-existent packages/docs/). Rule: when writing relative links from a package README, the root is always ../../.

## 2026-06-05: PR #45 Copilot Review Cycle 2 — Control-Char Full-File Sweep + README Accuracy

**Context:** Cycle 2 review flagged a bare-CR artifact in the line-726 region of history.md plus an inaccurate crucible-cli README. Fixed four control-char artifacts total (bare CR on lines 726 and 1071, ESC on line 1068, BEL on line 1074) and rewrote crucible-cli/README.md to describe the package as the Sprint 0 acceptance-test facade.

### Learnings

**When cleaning control-character artifacts, sweep the WHOLE file, not just the flagged region.** Reviewers sample; a spot fix that only patches the cited lines leaves other artifacts alive. After any control-char remediation, run a full-file scan (e.g., byte-level check for bytes <0x20 excluding tab/LF/CRLF) before committing, so the issue does not resurface in the next review cycle.
**BEGIN IMMEDIATE serializes within a single connection; JS event-loop serializes across async calls from the same connection.** For a synchronous library like better-sqlite3, Promise.all() in the same process doesn't create true concurrency — each mutate() call runs to completion before the JS engine yields. The transaction wrapper enforces that READ + fn + WRITE happen atomically within one mutate() call; it plays no role in ordering ACROSS calls from the same JS thread. BEGIN IMMEDIATE matters only when two separate Database handles (different connections, possibly different processes) compete for the write lock. Getting this distinction wrong in comments misleads future readers about WHERE the safety boundary is.

## Learnings (2026-06-05 — M8 Slice C: SqliteFactStore + FTS5 BM25)

**Branch:** `eureka/m8-slice-c-factstore`

**BM25 sign convention is the primary footgun.** `bm25(facts_fts)` returns NEGATIVE values where more-negative = better match. Using it directly in ASC ORDER BY sorts best matches LAST. The fix is `ORDER BY (-bm25(facts_fts)) * trust DESC`. The FS-4 contract test (higher-frequency term fact ranks first) is the regression lock. Every SQLite FTS5 implementation must own this pattern or it will silently break ordering on first write.

**Per-page min-max normalization is the right call for v1.** Normalizing `relevance` to [0,1] via min-max across the result page is simple and correct for single-page recall (RANKER_OVERFETCH_FACTOR × k). Cross-page normalization (where page-1 and page-2 relevances are comparable) requires two queries or a separate max-score fetch — deferred until cross-session pagination needs it. Document the choice so the next person doesn't re-derive it.

**Interface reconciliation (wrapped return) is a mechanical but real change to merged code.** The `recall.ts` change from `Promise<RecallResult[]>` to `Promise<{ results: RecallResult[]; nextCursor? }>` required updating 10 mock sites in `recall.test.ts`. Each was `mockResolvedValue([...])` → `mockResolvedValue({ results: [...] })`. The pattern is mechanical but if you miss one the test will FAIL — destructuring `{ results }` from a bare array returns `undefined`, and the first downstream use of `results` (like `results.filter(...)`) throws a noisy TypeError rather than a clean assertion failure. That TypeError will be confusing to diagnose because it points at the consumer, not the stale mock. Grep for `mockResolvedValue` in the test file before declaring done — it catches all stale mocks in one pass.

**Offset cursors are pragmatic for v1 FTS5 pagination.** Rowid+rank keyset cursors require stable rank values — BM25 floats are session-stable but not write-stable. For v1 single-page recall, offset is deterministic. Encode as base64 JSON `{ offset }` so the format can be extended (add `sessionId`, `queryHash`, etc.) without a breaking cursor change. Document the choice; the next person will want to understand why you didn't use a keyset cursor.

**Schema gaps (attentionTier, importance, lastAccessed) default gracefully.** None of these fields are in the `facts` table yet. `attentionTier='warm'` (identity multiplier 1.0), `importance` omitted (FR-2 uses 0), `lastAccessed` omitted (recency floor 0.1). The composite scorer still runs — results are just conservative. A future migration `002-fact-fields.ts` can add the columns without breaking Slice C's implementation (it SELECTs only content, trust, bm25_score).

**The `*.contract.helper.ts` naming + non-`.test.ts` rule extends naturally to FS.** `fact-store-contract.helper.ts` follows the exact same pattern as `fact-reader-contract.helper.ts` and `trust-updater-contract.helper.ts`. The wiring test in `fact-store.contract.test.ts` imports from the helper. Vitest ignores the helper file (not `.test.ts`). The pattern is now consistent across all three storage seams.

## Learnings (2026-06-05 — M8 Slice C follow-ups FSE-1 + FSE-4)

**Branch:** `eureka/m8-slice-c-factstore` (follow-up commits on same branch, PR #48)

**FTS5 error messages don't always contain "fts5".** The intuitive narrowing check `/fts5/i.test(err.message)` fails for `"unterminated string"` (unclosed quote) and other tokenizer-level errors. SQLite's FTS5 query parser errors all carry `code === 'SQLITE_ERROR'` (numeric 1). Non-parse errors use distinct codes: SQLITE_CORRUPT=11, SQLITE_IOERR=10, SQLITE_BUSY=5. Narrowing on code alone is the correct approach for this call site because we're inside a method that ONLY runs FTS5 queries — a false SQLITE_ERROR from a non-FTS cause would require schema corruption or an impossible misuse of the prepared statement. Don't over-narrow on message text for FTS5 errors; narrow on the error code instead.

**[Correction 2026-06-05]:** The shipped FSE-1 catch narrows on `code === 'SQLITE_ERROR'` AND a message regex `/fts5|unterminated|syntax error|malformed MATCH/i`, rethrowing non-FTS SQLITE_ERROR (missing-table/schema). Code-only narrowing would over-swallow missing-table errors (e.g., `"no such table: facts_fts"`) which are also `SQLITE_ERROR`. The message pattern distinguishes FTS5 parse errors from missing-table errors, preventing silent corruption of the schema-error signal.

**Laura's edge test locking the broken behavior (FS-SE-11) is the right pattern.** She wrote the test asserting the rejected Promise BEFORE the fix, which made the finding machine-verifiable. Updating the test to the new contract (resolves to `{ results: [] }`) makes the fix machine-verifiable too. This is the correct audit → fix → relock cycle. The `[FINDING FSE-1]` annotation in the old test title is a useful trail even after the fix; the new title says `(FSE-1 fix)` so the arc is traceable.

**Per-page relevance normalization needs documentation at two levels.** The JSDoc on `RecallResult.relevance` (the field) AND on `FactStore.search` (the return type) should both call out that relevance is per-page only. Documenting it only at one level leaves the other as a trap for future consumers who read the type definition but miss the field comment (or vice versa). Both are load-bearing: consumers of the interface read the return type; consumers of results read the field.

## Learnings (2026-06-05 — M8 Slice C code-panel F1–F7 findings)

**Branch:** `eureka/m8-slice-c-factstore` (F1–F7 fixes on same branch, PR #48)

**F1: relevance ≠ sort order is a design, not a defect.** The `compositeScore` consumer weights relevance, trust, importance, and recency as four independent orthogonal signals (each with its own coefficient). Baking trust into `relevance` via composite normalization (`-bm25 × trust`) would double-count trust — it already has a 0.20 weight in the scorer. So: `relevance` = pure `-bm25` normalized; ORDER = composite. When trust varies, a high-trust/low-BM25 fact can sort first while carrying lower relevance. FS-SE-1b is the regression lock for this design. The FS-4 equal-trust lock is still valuable because it verifies the BM25 footgun (negation) under controlled conditions.

**Narrow FTS5 catch with message pattern in addition to error code.** After consulting actual SQLite error messages for missing tables vs FTS5 parse errors: a dropped `facts_fts` table produces a `SQLITE_ERROR` with message `"no such table: facts_fts"` — it does NOT match the FTS5 parse pattern. This is good news for the narrowing: `code === 'SQLITE_ERROR' && /fts5|unterminated|syntax error|malformed MATCH/i` correctly lets the missing-table error propagate. The earlier code-only check (no message filter) was too broad — it would have swallowed the missing-table error. Always verify the message against real SQLite output before deciding on pattern breadth.

**F3 tie-breaker: `f.id ASC` is cheap and correct.** `f.id` is autoincrement INTEGER PRIMARY KEY — guaranteed unique and monotonically increasing (insertion order within a session). Adding `f.id ASC` as secondary sort on the `ORDER BY` clause costs nothing at query time (BTree INTEGER PK) and makes OFFSET pagination deterministic across tied composite scores. The InMemory reference impl should mirror this with `a.factId.localeCompare(b.factId)` since factIds are insertion-order strings in the harness.

**[Correction 2026-06-05]:** The shipped InMemory implementation uses an explicit `insertionOrder` counter (incremented on each `seed()` call) to tie-break results, which correctly mirrors SQLite's AUTOINCREMENT id semantics. `localeCompare` on factId would produce different insertion-order ties when factIds are inserted in non-alphabetical order, so it was not used in the final implementation. See FS-7 test design: seeded `tie-c`, `tie-a`, `tie-b` in non-lexicographic order to distinguish the two approaches.

**F4 limit validation prevents infinite pagination loops.** `limit=0` produces OFFSET 0, LIMIT 0, returns 0 results, `nextCursor` defined, next call produces the same state — infinite loop for any consumer that auto-paginates. `limit=-1` makes SQLite treat it as unlimited (implementation quirk). Both are bugs, not edge cases. `TypeError` is the right signal because `limit` is a misuse of the API contract, not a data error. Apply at both SqliteFactStore AND the InMemory reference impl so the contract test catches both.

**F5 cursor versioning is Slice D work.** The v1 offset cursor is NOT bound to query params, session, minTrust, or limit. Cross-parameter reuse is undefined behavior (silently returns wrong page). The right fix (scope fingerprint: hash of query+sessionId+minTrust+limit) is deferred to Slice D when we add cursor validation. Document with code comments NOW so the next author doesn't have to rediscover the gap.

## Learnings (2026-06-06 — M8 Slice C cycle-2 C2-A/B/C/D/E)

**Branch:** `eureka/m8-slice-c-factstore` (final fix pass, PR #48)

**Insertion-order tie-break must be explicit, not coincidental.** `localeCompare` on factId produces a different order than `f.id ASC` (autoincrement) whenever factIds are inserted in non-alphabetical order. The two impls were only "equivalent" because the test data happened to align. The fix: add an explicit `insertionOrder` counter to `StoredFact`, increment on each `seed()` call, sort ties by `a.insertionOrder - b.insertionOrder`. Then seed FS-7 in non-lexicographic order (`tie-c`, `tie-a`, `tie-b`) so the test would fail under `localeCompare` semantics. Cross-impl contract tests must use data that DISTINGUISHES the implementations they're testing — otherwise they miss the divergence they exist to prevent.

**Duplicates need distinguishable content.** A tie-breaking test that seeds identical content and only asserts `length === 3` would pass even if the impl returned the same row twice (three identical items would still have length 3 and Set.size 1 vs expected 3 — but only if you check the Set). FS-7's fix: seed content `'tiebreak pagination fact-c/a/b'` and assert `new Set(all.map(r => r.content)).size === 3`. A no-dup assertion requires uniquely-identifiable results.

**FTS5 error-message regex is a v1 tradeoff.** The `/fts5|unterminated|syntax error|malformed MATCH/i` pattern was verified against real SQLite errors on 2026-06-05. The conservative failure mode (miss → real error propagates, not swallowed) is acceptable for v1. Slice D should version-anchor the test or look for a more structured FTS5 error signal from better-sqlite3. Noted in decision drop §C2-E.
---

## Learnings (PR #45 Cycle 3 -- 2026-06-05)

**Keep mock return values matching the interface contract even when the value is ignored.** insertSession is typed Promise<void>, so mocks should resolve undefined, not a stray string like 'child-id'. Resolving a wrong type can mask future misuse where code incorrectly reads the return value -- the interface contract is the source of truth, not what production code happens to ignore today.

**Keep minimal-interface comments honest about used-vs-retained members.** If a port interface intentionally includes members not currently called by the primary consumer (e.g., queryEvents on DB), say so explicitly -- state which methods are used now vs retained for future needs. A comment that says 'only the operations X actually needs' becomes misleading the moment the interface contains anything beyond that scope.

---

## Learnings (Refactor 3 Review Cycle 1 — 2026-06-06)

**Production deps vs devDeps: if a module is exported from the production barrel, its native dependency belongs in `dependencies`, not `devDependencies`.** `createSQLiteDB` is exported from `crucible-core/src/index.ts`, so `better-sqlite3` must be a production dependency of that package. Leaving it in devDeps means any consumer that installs the published package without devDeps would get a runtime crash.

**Single-source schema DDL; never restate it in fixtures or tests.** Creating a canonical `SCHEMA_V1_SQL` export in core and having the fixture call `createSQLiteDB` directly eliminates the drift risk. A fixture that independently restates CREATE TABLE statements will silently diverge from production schema as the schema evolves.

**Error message parity between adapters is a contract, not a courtesy.** When the in-memory oracle throws a specific, diagnosable message (`pushEvent: session '<id>' not found`), the SQLite adapter must throw the exact same message — not a foreign-key constraint error. Tests that assert on error messages will fail at the FK layer with a confusing message; more importantly, callers that pattern-match on errors get inconsistent behavior depending on which adapter is in use.

**Interface JSDoc must describe the cross-impl contract, not the implementation detail of one adapter.** The "mutable reference" wording on `getOwnEvents` was truthful for in-memory but false for SQLite. When an interface has two implementations, the JSDoc on the interface must state what ALL implementors commit to — in this case, a snapshot, not a live reference.

**Header comments on transitional code should name its transitional nature.** Calling the SQLite adapter a "real SQLite adapter" biases future readers toward treating it as canonical. A one-clause note that names the Sprint-0 / compatibility-substrate framing prevents architectural drift.

---

## Learnings (Cycle 2 Remediation — 2026-06-06)

**Verify direct imports before removing a devDependency.** The safe pattern is: grep src/ for `import.*from 'pkg'`; if the only hits are in comments or JSDoc, the dependency is genuinely unused. Trusting that it "should" be gone without grepping first risks removing a still-needed dep (or, conversely, leaving a truly redundant one and failing review). In this case, `better-sqlite3` and `@types/better-sqlite3` appeared only in comments — test-db.ts had already been refactored to import solely from `@akubly/crucible-core`. Safe to drop.

**Transitive dependency satisfaction is enough for test code.** Once `better-sqlite3` lives in `crucible-core`'s `dependencies`, any workspace package that declares `@akubly/crucible-core` as a dependency gets the native module transitively. A devDependency on the same package in the consumer is pure noise and a source of version-skew risk.

---

## Learnings (PR #51 Review — 2026-06-06)

**Return a copy from snapshot methods, not the live internal collection.** `getOwnEvents()` was documented as returning a snapshot where modifications are not persisted, but returned the raw `ownEvents` array. The spread `[...array]` (or `.slice()`) is the minimal correct fix. Notably, the SQLite adapter already honored this contract (`.map()` creates a new array) — the in-memory adapter was the outlier. Whenever two adapters implement the same interface, verify BOTH sides match the JSDoc contract, not just one.

**Lazy-load native modules that are not needed by all consumers.** Placing `import Database from 'better-sqlite3'` at module top level causes the native `.node` binary to be loaded the moment the barrel is `import`-ed — even by callers that only use the in-memory adapter. The fix: `import type Database from 'better-sqlite3'` (type-only, erased at compile time) at top level, and `createRequire(import.meta.url)('better-sqlite3') as typeof Database` inside the factory function. The import graph then only reaches the native module when `createSQLiteDB` is actually called. This matches the pattern in `packages/eureka/src/db/openDatabase.ts`.

**`typeof ImportedType` is the correct cast for a `createRequire` call that returns a constructor.** `typeof import('better-sqlite3').default` fails when the package uses `export =` style declarations (TypeScript reports "Namespace has no exported member 'default'"). Use the locally imported type name directly: `as typeof Database`, where `Database` is bound via `import type Database from 'better-sqlite3'`.


---

## Learnings (WAL Substrate Sub-Seam Build — 2026-06-06)

**WAL substrate internals are now GREEN (21/21 tests).** Three sub-seam cycles completed via strict London-school RED→GREEN TDD:

### What's GREEN

| Module | File | Tests |
|---|---|---|
| Segment record codec | packages/crucible-core/src/ledger/wal/codec.ts | 7/7 |
| BLAKE3 hash chain | packages/crucible-core/src/ledger/wal/hash-chain.ts | 7/7 |
| In-memory CAS | packages/crucible-core/src/ledger/wal/cas.ts | 7/7 |

Supporting files: 	ypes.ts (shared types), hash.ts (blake3 seam via @noble/hashes).

Test files: src/__tests__/unit/wal-codec.test.ts, wal-hash-chain.test.ts, wal-cas.test.ts.

### Key decisions (full detail in .squad/decisions/inbox/roger-wal-substrate.md)

- **D-WAL-1: BLAKE3 library = @noble/hashes v2.x** (@noble/hashes/blake3.js) — pure TS/WASM, no native compilation, Node16 ESM-compatible. Hash is behind a hashBytes() seam in hash.ts for easy swap.
- **D-WAL-2: selfRoot canonical content** — byte concatenation of all fields except selfRoot (sub-seam approximation; CBOR canonicalization deferred until §6 locks).
- **D-WAL-3: crc32c deferred** — 4 zero bytes placeholder in codec; RED test for bad-crc32c rejection deferred.
- **D-WAL-4: Conditional fields deferred** — hookVerdictWitness, contextWindowCommitment, commitmentMethod deferred until §6 primitive enum is locked.
- **D-WAL-5: Public Ledger.append() seam intentionally NOT built** — waiting on Graham's seam lock (graham-ledger-seam.md).

### What remains RED / deferred

- hook-veto.test.ts acceptance test (Walkthrough B) — pre-existing RED, owned by the shared seam. NOT touched.
- Public Ledger.append() orchestration — blocked on Graham's seam.
- File-system CAS (FileSystemCas) — above seam, deferred.
- crc32c validation — deferred (see D-WAL-3).
- Conditional codec fields — deferred (see D-WAL-4).
- CBOR canonicalization for selfRoot — deferred (see D-WAL-2).

### Patterns learned

- @noble/hashes subpath import requires .js extension even for TypeScript sources: import { blake3 } from '@noble/hashes/blake3.js'
- SegmentRecordInput / SegmentRecord split keeps chain-building clean: inputs don't carry prevRoot/selfRoot (those are outputs of uildChain()).
- erifyChain() recomputes selfRoot inline rather than trusting the stored value — tamper detection works even if a caller mutates a field post-build.
- ncodeRecord() writes magic as big-endian (writeUInt32BE) so the first 4 bytes read "WAL1" in ASCII. All other multi-byte integers are little-endian per spec.


---

## Learnings (Walkthrough B GREEN — 2026-06-06)

**hook-veto.test.ts acceptance test is now GREEN. Full suite: 28/28 passing.**

### What was built

Three new files wired the seam:

| File | Role |
|---|---|
| src/ledger/hook-bus-impl.ts | PreCommitHookBus — FIFO fire order, VETO short-circuits |
| src/ledger/wal-backend-in-memory.ts | InMemoryWalBackend — wraps sub-seam hash-chain + CAS |
| src/ledger/ledger-impl.ts | LedgerImpl + createLedger factory |

index.ts wired xport { createLedger } from './ledger/ledger-impl.js'.

### VETO protocol (Aaron's Option A ruling)

`
(a) Build HookContext — no I/O
(b) hookBus.fire(ctx)                ← BEFORE any WAL byte
(c) verdict === 'VETO' → throw Error('Append vetoed by hook: <hookId>')
    ← return; walBackend.commitRow NEVER called
(d) non-VETO → walBackend.commitRow(input, result) → commitOffset
`

Exclude<HookVerdict,'VETO'> on commitRow enforces the invariant at the type level.

### No test edits required

Laura's RED test signatures matched the locked seam exactly. The SEAM-ALIGNMENT NOTE in the test is now resolved.

### InMemoryWalBackend wires sub-seam internals

commitRow calls uildChain([rowInput], this.prevRoot) (real BLAKE3 hash-chain) and InMemoryCas.put (content-addressing). The in-memory backend is structurally identical to the future file-system backend — no seam divergence when we add disk I/O.

### Deferred (no RED test yet)

- File-system WalBackend (segment writes, fdatasync, index.idx)
- Full §4 PreCommitHookBus (kind-indexed dispatch, CAS witness)
- predicate_registered / predicate_unregistered Observation WAL rows
- §3.5 seal-and-split on PAUSE
- Real crc32c computation


---

## Learnings (WAL File Backend — 2026-06-06)

**File-backed WalBackend is now GREEN. Full suite: 35/35 passing.**

### What was built

Two new files:

| File | Role |
|---|---|
| src/ledger/wal/cas-fs.ts | FileSystemCas — CAS backed by <casDir>/<shard>/<hash>.cbor files |
| src/ledger/wal-backend-fs.ts | FileSystemWalBackend + createFileSystemWalBackend factory |

### 7 new RED→GREEN tests (wal-backend-file.test.ts)

| Test | Invariant |
|---|---|
| rows survive reopen | Durability: events reconstructed from disk |
| manifest.json content | schemaVersion=1, sessionId, lastCommitOffset |
| verifyChain after reopen | Hash-chain survives process restart |
| tamper detection | Corrupted payloadHash byte → verifyChain=false |
| CAS .cbor files on disk | Payload bytes written before WAL record |
| index.idx NDJSON entries | One entry per committed row, byteOffset=0 for first |
| append after reopen continues chain | Full 3-row chain valid after reopen + 1 more append |

### Key design decisions

- **rootDir is caller-supplied**: no hard-coded ~/.crucible; tests use os.tmpdir() subdir with afterEach cleanup — no repo or ~/.crucible leakage.
- **envelopeCbor stores primitiveKind as UTF-8**: minimal solution until §6 CBOR canonicalization locks. Deferred via TODO(§6) comment.
- **Sequential segment scan on reopen**: index.idx is written (spec requirement) but reopen uses full segment scan for simplicity. Fast index-based random access deferred.
- **CAS-before-WAL ordering**: cas.put() calls precede ppendFileSync() on the segment, matching §3.2 fsync strategy.
- **FileSystemWalBackend.readSegmentRecords()**: extra method (not on WalBackend interface) for test-level chain verification access. Tests import the concrete class.

### Scope fences confirmed NOT touched

- Single-writer advisory file lock (§3.4.1) — deferred
- Group-commit batching + seal-and-split on PAUSE (§3.5) — deferred
- 64 MiB segment roll-over — deferred
- fdatasync per group-commit — deferred


---

## Learnings (WAL Write Lock §3.4.1 — 2026-06-06)

**Single-writer advisory write lock is now GREEN. Full suite: 40/40 passing.**

### What was built

Modified src/ledger/wal-backend-fs.ts:
- Added WriteLockHeldError (exported) — thrown when lock file already exists
- Added close(): Promise<void> — unlinks write.lock; no-op on read-only
- Added cquireWriteLock() — s.openSync(lockPath, 'wx'), fd immediately closed
- Added eadOnly option — bypasses lock acquisition entirely
- Added opts?: { readOnly? } to FileSystemWalBackend.create() + createFileSystemWalBackend()

### 5 new RED→GREEN tests (wal-backend-file-lock.test.ts)

| Test | Invariant |
|---|---|
| second write-open throws WriteLockHeldError | Exclusive write enforcement |
| close() releases lock; fresh open succeeds | Lock lifecycle |
| write.lock file exists while open, absent after close | On-disk signal |
| readOnly open succeeds while write lock is held | Read path not gated |
| error message contains write.lock path | User-actionable error |

### Existing wal-backend-file.test.ts updated

4 tests needed wait backendN.close() calls inserted before reopens — the lock now correctly blocks the second open without close. This is a semantic fix: a real "process restart" requires the first writer to close first.

### Lock mechanism: exclusive-create (no new npm dep)

s.openSync(lockPath, 'wx') = O_CREAT|O_EXCL. Cross-platform, stdlib only, no open fd held (fd closed immediately). Presence of file is the lock; unlink on close() releases it.

### Stale-lock decision FLAGGED for Aaron

Logged to .squad/decisions/inbox/roger-wal-write-lock.md D-LOCK-2. Recommendation: Option (a) manual clear (v1). PID+liveness check (Option b) deferred until a RED test drives it.

### Scope fences confirmed NOT touched

- Group-commit + seal-and-split (§3.5): deferred
- 64 MiB segment roll-over: deferred
- ppendFenced / optimistic head-offset: deferred

- 2026-06-06 📌 roger: WAL single-writer lock + PID-liveness stale-lock landed; issue #55 tracks OS-lock reconsideration
