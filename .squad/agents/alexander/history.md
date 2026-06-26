
**Critical integration gap: sweep lifecycle coupling.** Crucible owns authoritative session lifecycle (Cairn sessions.ended_at). If Crucible ends session but no one calls ureka.session.end() + sweep(), Eureka never sweeps. Mitigation: wire Crucible's session-end hook to call Eureka synchronously. v1.5 event-stream subscription deferred (adds coupling, violates Path D).

**Hermetic replay extends to Eureka if library-integrated.** Eureka calls recorded as L1 primitives; replay re-invokes deterministically (BM25 is deterministic, no LLM in v1). Snapshot contract required: both Cairn knowledge.db and Eureka gent.db must be snapshotted for full replay fidelity.

**Copilot SDK limitation found: no attention metadata.** SDK does not expose provider attention scores. v1 ships commitmentMethod: 'fallback' exclusively. Forward-compat door locked for future attention-aware providers (v1.5+).

**Wave 2 scope final:** autoApplyEligible propagates through OptimizationHint; constants NEGATIVE_IMPACT_AUTO_APPLY_GATE=-0.2, ATTENUATION_FLOOR=0.1; CLI surface only (no MCP in Wave 2). Curator wiring deferred to Wave 3.

**R2 Decisions locked (6 total):** L0/L1 causalContextWindow contract (hybrid B-with-A-fallback), BootstrapPayload.literalContext extraction at session bootstrap, and others. Phase 2 fan-out now unblocked.

**Migration framework + circular dependency patterns:** Idempotent migration.up(db) with schema_version table; mirror pattern for Cairn↔Forge imports; lockout-routing for cross-assignment fixes.

---

**See history-archive.md for full session learnings, design ceremony notes, Wave 0/1/2/3 progression, Phase 4.6 work, and CTD review cycles.**

📌 Team update (2026-05-29T072142Z): **CTD CLOSE (2026-05-28)** — CTD v1 structurally complete; post-CTD authoring (ADR bodies, §13 CLI scaffolding, @akubly/crucible-* packages) unblocked. — Scribe
- 2026-06-06 📌 scribe: OQ-2 LOCKED (FEDERATE) + Refactor 3 complete (real SQLite adapter, 14/14 green)
- 2026-06-05 📌 M3: Forge prescriber wired to HintDispositionProvider seam for disposition consumption (dismissed→suppress, resolved→boost). See .squad/decisions/inbox/graham-forge-m3-disposition-consumer.md.
- 2026-06-06 📌 M3: HintDispositionProvider seam finalized on squad/42-forge-m3-disposition (3 commits, 1563 tests green, READY TO SHIP). Constants coupling: shared hintStateTransitionConstants.ts owns event format (type, source, payload keys, resolution values). Wave 2 autoApplyEligible propagation depends on disposition seam stability — this finalization unblocks downstream integration work.

---

**[2026-06-06T19:23:48Z — Scribe Cross-Agent Update]**

## Team Notifications

Two infrastructure changes approved in PRs #50 and #52:

1. **PR #50 — Root lint cross-platform fix (Issue #37, Gabriel):** Root package.json lint script now uses workspace delegation to enable cross-platform execution. Per-package lint scripts added to 7 packages. Windows developers will now see linting errors locally.

2. **PR #52 — Doc-hygiene back-reference sweep (Issue #46, Gabriel):** Gitignored-path back-references removed from committed prose across decisions.md, decisions-archive.md, and agent history files. Forward writer-targets (charters, templates, skills) preserved. Classification heuristic documented for future hygiene sweeps.

**Action for you:** No immediate action required. Lint workspace changes take effect after merge and 
pm install restart. Doc-hygiene scope established for future improvements.

## Learnings

- 2026-06-16T22:51:06-07:00 — Forge production-runner gap scoped: `ForgeClient`/`ForgeSession` already bridge SDK events to collectors and `skillsmith-runtime` binds samples to Cairn, but live Copilot CLI sessions still do not instantiate `ForgeClient`; profiles are currently mock-driven or seeded via `forge-seed-profile`.

- 2026-06-16T23:25:32-07:00 — Implemented Forge slice 1: permission seam defaults to SDK approveAll, reusable run-session composition root lives in skillsmith-runtime, runtime-cli is a thin opt-in operator, and telemetry flush now occurs after SDK disconnect to capture terminal events emitted during disconnect.

- 2026-06-18T06:44:55Z — Forge slice 1 implementation verified: graceful shutdown tested with SDK double, session telemetry flush sequenced after disconnect, Cairn DB lifecycle managed with getDb/closeDb patterns. Roger's platform/lifecycle guidance documented in decisions.md. All tests passing (Forge 689, skillsmith-runtime 60, runtime-cli 43). Ready for integration testing phase.

- 2026-06-16T23:41:33-07:00 — Roger confirmed Forge runner shutdown contract: keep SDK subscriptions live through disconnect, flush telemetry after sdkSession.disconnect(), then stop client, then close Cairn DB last; tests now assert sdk_disconnect_end precedes telemetry_flush_start.

- 2026-06-16T22:51:06-07:00 — Persona Cycle 1 follow-up: ForgeClient no longer owns approveAll; runner composition root owns dogfood approveAll, ForgeSession drains late terminal events after disconnect before telemetry flush, and injected SDK clients are not stopped unless explicitly requested.
- 2026-06-21T22:25:59-07:00 — Forge disconnect drain hardened from a fixed post-disconnect sleep into an event-driven wait on bridged `session.shutdown` / `session_end`, with the timeout kept as an internal ceiling and test seam; runner results now surface disconnect cleanup status without changing success exit-code behavior.

- 2026-06-22T23:59:51-07:00 — Slice 2A: DBOM wiring in forgeSessionRunner. Real API signatures discovered:
  - **Generator**: `generateDBOM(sessionId: string, events: CairnBridgeEvent[]): DBOMArtifact` — `packages/forge/src/dbom/index.ts`. Filters to `provenanceTier === 'certification'` events, builds SHA-256 Merkle-like hash chain, returns full artifact with `rootHash`, `stats`, `decisions`.
  - **Persist**: `upsertDBOM(db: Database.Database, artifact: DBOMArtifactInsert): number` — `packages/cairn/src/db/dbomArtifacts.ts`. `DBOMArtifact` is structurally compatible with `DBOMArtifactInsert` (literal `'0.1.0'` assignable to `string`; `DBOMStats` matches inline stats type exactly). Transaction-based: deletes existing DBOM for session then re-inserts.
  - **Load**: `loadDBOMArtifact(db: Database.Database, sessionId: string): DBOMArtifact | null` — same file. Reconstructs full artifact from `dbom_artifacts` + `dbom_decisions` tables (migration 010).
  - **Bridge events**: `session.getBridgeEvents(): readonly CairnBridgeEvent[]` on `ForgeSession`. Certification-tier SDK events mapped by bridge: `permission.requested`, `permission.completed`, `subagent.started`, `subagent.completed`, `subagent.failed`, `session.plan_changed`, `skill.invoked`, `session.snapshot_rewind`, `session.error`.
  - **Result field**: `dbomRootHash: string | null` added to `RunForgeInstrumentedSessionResult`. Non-null (64-char SHA-256 hex) when `artifact.stats.totalDecisions > 0`; null otherwise. Empty-DBOM path skips `upsertDBOM` entirely — graceful, no DB write.
  - **Ordering**: DBOM generation/persist happens after `buildProfiles(db)`, before `closeDb()` — Cairn DB open throughout.

## Learnings

- 2026-06-22T23:34:41-07:00 — Forge slice 2A persona-review follow-on: sentinel hash + best-effort contract.
  - **Sentinel hash**: `generateDBOM` always returns a well-formed artifact; for zero certification-tier events the rootHash is the SHA-256 of the empty string (`e3b0c44...`). `dbomRootHash` should therefore always be non-null when generation succeeds, using the sentinel as a valid DBOM signature for empty-certification sessions. null is reserved exclusively for the pathological case where generation itself throws.
  - **dbomPersistError field**: added to `RunForgeInstrumentedSessionResult` (non-null when DBOM generation or persistence threw; null on success). The run result is always valid — provenance is best-effort, never a blocking gate. This mirrors the existing `disconnect` observability pattern: failures surface in the result, never propagate as thrown exceptions.
  - **Best-effort try/catch wraps both generation and upsertDBOM**: either can throw (malformed event payload, storage error); both are caught; `console.warn` used to match the existing disconnect-failure logging idiom in this file.
  - **F6 1:1 confirmation**: `stats.totalDecisions` is 1:1 with certification-tier events — exactly 2 for a `permission.requested` + `permission.completed` pair. Test tightened from `toBeGreaterThanOrEqual(2)` to `toBe(2)`.
  - **Shared helper move**: `permissionRequestedEvent()` and `permissionCompletedEvent()` with their `as SessionEventType` casts moved from inline in the test file to `packages/skillsmith-runtime/src/__tests__/helpers/mockSession.ts`, alongside the existing event factories. Cast isolated in one place.
  - **Test 3 (new)**: best-effort failure path — spies on `cairn.upsertDBOM` to throw `'disk full'` for a session with certification events; asserts run returns valid result (`signalSamplesWritten > 0`, `disconnect.ok === true`), `dbomPersistError === 'disk full'`, no exception propagated.

---

## 2026-06-23T06:34:41Z — Slice 2A Persona-Review Merge & Ship

Forge Slice 2A shipped in PR #84 (commit 58a072e). Persona panel review cycle completed:

- **Critical finding 1 (Correctness):** dbomRootHash null semantics clarified. Sentinel
  design (empty-string SHA-256 hash `e3b0c44...` for empty-event DBOM) replaces null
  for no-events case. Null reserved exclusively for generation/persistence errors.

- **Critical finding 2 (Correctness):** DBOM block wrapped in try/catch (best-effort).
  Failures set `dbomPersistError` field and log warning; never throw. Maintains
  slice-1 success/exit-code contract (mirrors existing disconnect pattern).

- **Result:** All tests passing (3 new + existing). 68 skillsmith-runtime + 694 forge
  tests green. Slice 2A fully integrated and production-ready. Decision merged to
  canonical `.squad/decisions.md`.

**Key contribution:** Discovered that best-effort patterns require consistent propagation.
The DBOM try/catch mirrors disconnect try/catch, establishing a precedent for all
session-runner error handling going forward.

