# Alexander — History

## Project Context

- **Project:** Cairn + Forge — an agentic software engineering platform
- **Tech Stack:** TypeScript, Node.js 20+, npm workspaces monorepo, Vitest, SQLite (better-sqlite3), MCP SDK, Copilot SDK
- **User:** Aaron Kubly
- **Joined:** 2026-04-28

## Onboarding Context

**Monorepo structure (as of Phase 1 completion):**
- `packages/types` (`@akubly/types`) — Shared contract types (CairnBridgeEvent, ProvenanceTier, DecisionRecord, DBOM, SessionIdentity, TelemetrySink)
- `packages/cairn` (`@akubly/cairn`) — Observability platform (Archivist, Curator, Prescriber, 10 MCP tools, 427 tests)
- `packages/forge` (`@akubly/forge`) — Execution runtime scaffold (empty, ready for Phase 3)

**SDK spike results (completed, GO verdict):**
- `@github/copilot-sdk@0.2.2` installed, zero conflicts
- Key spike files in `packages/cairn/src/spike/`:
  - `event-bridge.ts` — ~50 LOC adapter mapping 22 of 86 SDK events to Cairn signals
  - `tool-hooks-poc.ts` — Hook composition pattern (registerHooks replaces, doesn't stack)
  - `decision-gate-poc.ts` — Three gate mechanisms: hook blocking, permission handler, elicitation
  - `model-selection-poc.ts` — listModels(), setModel() mid-session, nano-AIU billing
  - `dbom-generator.ts` — DBOM artifact generation with content-addressable decision chains
- SDK hook types NOT re-exported from index — use `NonNullable<SessionConfig["hooks"]>` or mirror locally
- Two SDK packages exist: `@github/copilot-sdk` (correct) vs `@github/copilot/copilot-sdk` (bundled CLI internal, different exports)

**My primary responsibility:** Build the production SDK wrapper (`packages/forge/src/runtime/`) that promotes the spike PoC into a reliable, tested runtime. The abstraction layer must insulate Forge from SDK API churn — changes to the SDK should affect ~50 LOC, never leak into Forge's core.

## Learnings

### 2026-04-29: Phase 2 — Event Bridge + Hook Composer Production Promotion

**What was built:**
- `packages/forge/src/bridge/index.ts` — Production event bridge adapter (22 SDK events → Cairn events, provenance classification, modular payload extractors)
- `packages/forge/src/hooks/index.ts` — `HookComposer` class + `composeHooks()` static helper. Dynamic add/remove of observers, all 6 hook types composed independently.
- `packages/forge/src/types.ts` — SDK type mirrors with documented rationale (SDK hook types NOT re-exported from index)
- `packages/forge/src/index.ts` — Full public API re-export

**Key architecture decisions:**
1. **EVENT_MAP and PAYLOAD_EXTRACTORS are frozen exports** — downstream can inspect but never mutate. Spike had them as module-private `const`s.
2. **`EventSource` interface** instead of coupling to `CopilotSession` — the bridge only needs `on(handler)`, making it testable with simple mocks.
3. **`HookComposer` class with live reference** — unlike the spike's static `composeHooks()`, the class captures a live `Set<HookObserver>` so adding/removing observers after `compose()` takes effect on next invocation without re-registering with the SDK. Static `composeHooks()` kept as convenience.
4. **Explicit `as` casts in hook composer** — the SDK's hook type signatures use positional parameters that don't align perfectly with our named interfaces; casts are contained in the composer rather than leaking into consumer code.
5. **Types import from `@akubly/types`** — `CairnBridgeEvent` and `ProvenanceTier` imported from shared contract, never redefined locally (spike had local mirrors).

**File paths:**
- Bridge: `packages/forge/src/bridge/index.ts`
- Hooks: `packages/forge/src/hooks/index.ts`
- Types: `packages/forge/src/types.ts`
- Public API: `packages/forge/src/index.ts`

### 2026-04-29: Hook Error Isolation (Laura's decision)

Applied Laura's `laura-hook-error-isolation` decision: wrapped every observer call in `HookComposer.compose()` with try/catch. Errors are logged via `console.warn` with the hook name for diagnostics but never propagate. The static `composeHooks()` inherits the fix since it delegates to `HookComposer`. This guarantees a buggy telemetry observer can never kill a downstream decision gate observer.

### 2026-04-29: Phase 2 — Decision Gates + Session Types Production Promotion

**What was built:**
- `packages/forge/src/decisions/index.ts` — Three exports: `createDecisionGate()` (active gating via `permissionDecision: "ask"`), `createDecisionRecorder()` (passive pre/post tool observation), `makeDecisionRecord()` (well-formed DecisionRecord constructor with auto-generated IDs and timestamps).
- `packages/forge/src/session/index.ts` — Four exports: `ModelSnapshot` interface, `toModelSnapshot()` pure extractor from SDK `ModelInfo`, `ModelChangeRecord` interface for tracking model switches, `ReasoningEffort` type mirror.
- `packages/forge/src/index.ts` — Barrel updated with all new exports, doc comment updated.

**Key architecture decisions:**
1. **`makeDecisionRecord()` accepts optional id/timestamp overrides** — defaults generate unique IDs and ISO timestamps, but callers can supply their own for deterministic testing or replaying.
2. **`createDecisionRecorder` observes both pre and post tool hooks** — pre captures intent, post captures outcome. Together they form a complete decision audit trail without altering control flow.
3. **Error isolation via try/catch in both gate and recorder** — consistent with the hook composer's isolation contract. Decision recording failures log warnings but never propagate.
4. **`toModelSnapshot()` uses `as` casts for `ReasoningEffort` arrays** — the SDK's `supportedReasoningEfforts` and `defaultReasoningEffort` types may not exactly match our local mirror; casts are contained in the extractor function.
5. **Phase 2 boundary strictly maintained** — no CopilotClient, no CopilotSession, no SDK runtime dependencies beyond type imports.

**File paths:**
- Decisions: `packages/forge/src/decisions/index.ts`
- Session: `packages/forge/src/session/index.ts`
- Barrel: `packages/forge/src/index.ts`

**Phase 2 module status:** bridge/ ✅, hooks/ ✅, decisions/ ✅, session/ ✅, dbom/ ✅ — all 5 modules complete.

### 2026-04-28: Phase 3 — Runtime Module (ForgeClient + ForgeSession)

**What was built:**
- `packages/forge/src/runtime/client.ts` — `ForgeClient` class wrapping CopilotClient 1:1 (ADR-P3-001). Creates/resumes ForgeSession instances with auto-wired HookComposer. Tracks sessions by ID. `stop()` disconnects all sessions then stops the SDK client.
- `packages/forge/src/runtime/session.ts` — `ForgeSession` class. Constructor auto-wires bridge event subscription (SDK events → CairnBridgeEvent). Exposes `send()`, `sendAndWait()`, `disconnect()` (idempotent), `getBridgeEvents()`, `addObserver()`/`removeObserver()` for dynamic hook management.
- `packages/forge/src/runtime/index.ts` — Barrel exports for all runtime types.
- `packages/forge/src/index.ts` — Updated with runtime/ exports.
- `packages/forge/src/__tests__/runtime.test.ts` — Updated to import from the real runtime module instead of inline contract implementations.

**Key architecture decisions:**
1. **SDKClient/SDKSession interfaces** — Thin interface types define the subset of SDK surface ForgeClient/ForgeSession depend on. Mock sessions and clients satisfy these interfaces directly, keeping tests decoupled from the full SDK type.
2. **ForgeSession owns bridge subscription lifetime** — The `on()` subscription is set up in the constructor and torn down in `disconnect()`. The `_disconnected` flag ensures idempotent cleanup.
3. **HookComposer is injected, not created internally** — ForgeClient creates the HookComposer and passes it to ForgeSession, so the client can wire hooks into the SDK config while the session retains a reference for dynamic observer management.
4. **No SDK runtime dependency** — Like Phase 2, the runtime module only imports SDK types, never instantiates CopilotClient directly. The real SDK client is injected via `ForgeClientOptions.sdkClient`.

**Test results:** All 268 tests pass (35 runtime + 233 Phase 2). Zero regressions.

**File paths:**
- Client: `packages/forge/src/runtime/client.ts`
- Session: `packages/forge/src/runtime/session.ts`
- Barrel: `packages/forge/src/runtime/index.ts`
- Public API: `packages/forge/src/index.ts`

**Phase 3 module status:** runtime/ ✅ — ForgeClient + ForgeSession complete.

### 2026-04-29: Phase 3 Architecture Spec Delivered (Graham)

**Context:** Phase 3 architecture specification and test contracts delivered. Alexander's next task: implement runtime/ and models/ modules to satisfy test contracts and architecture decisions.

**Key deliverables:**
- **Graham (Architecture):** 6 ADRs covering ForgeClient ownership (1:1 wrapper), EventSource abstraction, ModelCatalog injection, type locality, dual event paths, strategy design as functions
- **Laura (Tests):** 87 test contracts (35 runtime, 52 models) with inline implementations enabling TDD before production code

**Impact on Alexander's work:**
- Test contracts define expected API surface and behavioral guarantees for runtime/ and models/ modules
- Architecture spec provides detailed rationale for design decisions (ADRs document trade-offs)
- Migration path: Tests will switch from inline to production imports when implementation complete
- Forge test count: 181 → 268 (87 new tests)

**Files to read:**
- `docs/forge-phase3-spec.md` — Full architecture specification (API contracts, state machines, integration points)
- `.squad/decisions.md` — ADR-P3-001 through ADR-P3-006 (merged from inbox)
- `packages/forge/src/__tests__/runtime.test.ts` — 35 test contracts for runtime/ (inline ForgeClient, ForgeSession, HookWiring)
- `packages/forge/src/__tests__/models.test.ts` — 52 test contracts for models/ (inline ModelCatalog, ModelSwitcher, TokenBudgetTracker)

### 2026-04-30: Persona Review — Runtime Hardening (7 findings triaged)

**Context:** 9 persona reviewers found 7 findings in runtime/. Triaged and fixed 6, rejected 1 subset.

**Dispositions:**

| # | Finding | Severity | Disposition | Rationale |
|---|---------|----------|-------------|-----------|
| F1 | stop() lacks error isolation | BLOCKING | **ACCEPT** | One failing disconnect leaked all remaining sessions. Wrapped each in try/catch, always reach clear() + stop(). |
| F2 | Spec surface gap | BLOCKING | **PARTIAL REJECT** | Rejected listModels, listSessions, getAuthStatus, getStatus — no test contracts, no consumers. Accepted onEvent bridge + model_change tracking (spec-required, correctness). |
| F3 | ADR-P3-005 incomplete | BLOCKING | **ACCEPT** | Added onEvent callback in createSession for pre-session events. Added model_change → ModelChangeRecord accumulation in bridge handler. |
| F4 | Bridge handler lacks guards | IMPORTANT | **ACCEPT** | Added `_disconnected` guard AND try/catch with console.warn in bridge event handler. |
| F5 | decisionGate config unused | IMPORTANT | **ACCEPT** | Removed misleading `decisionGate` field from ForgeSessionConfig. Gates are wired via observers. |
| F6 | Session map lifecycle issues | IMPORTANT | **ACCEPT** | Added duplicate-check-and-disconnect before map insertion. Added onDisconnect callback for auto-removal from map. |
| F7 | Test ModelChangeRecord field drift | IMPORTANT | **NO-OP** | Already fixed — test uses `newReasoningEffort` matching production type. |

**Changes made:**
- `runtime/client.ts`: Error-isolated stop(), onEvent bridge in createSession, duplicate session protection, onDisconnect wiring
- `runtime/session.ts`: _disconnected guard + try/catch on bridge handler, model_change tracking, onDisconnect callback, removed decisionGate from config

**Test results:** All 268 tests pass (35 runtime + 233 others). Zero regressions.

**Key learning:** Persona review found real correctness bugs (F1, F4) that would have manifested in production under failure conditions. The spec-gap findings (F2) were correctly scoped by triage guidance — spec is aspirational, tests are the contract.

### 2026-04-30: Event Dedup Guard (ADR-P3-005 hardening)

**Context:** Design reviewers flagged that the dual event path (onEvent callback during createSession + session.on() after construction) has a temporal overlap window. If the SDK fires events via onEvent after createSession resolves but before/during ForgeSession construction, the same event could be captured by both paths, corrupting TokenTracker accumulation and DBOM reconstruction.

**Fix:** Added a `bridgeAttached` boolean flag in `ForgeClient.createSession()`. The `onEvent` closure checks this flag and short-circuits if `true`. The flag is set immediately before `ForgeSession` construction (which wires `session.on()`). Total change: ~4 LOC in client.ts.

**Tests added:** 2 new tests in runtime.test.ts:
1. "onEvent callback is disabled once bridge is attached" — simulates overlap, asserts no duplicate bridge events
2. "onEvent captures events BEFORE bridge attachment" — confirms pre-session events still work

**Test results:** All 270 tests pass (37 runtime). Zero regressions.

**Key learning:** The simplest dedup mechanism (a boolean flag matching the temporal contract) is preferable to hash-based dedup (LRU + eventId). The flag directly encodes the design intent: onEvent is a pre-bridge stopgap, not a parallel path.

### 2026-04-30: Persona Review — disconnect() error isolation + resumeSession comment

**Context:** Persona review found 2 issues in runtime/. F1 was a real unrecoverable bug; F2 was a documentation gap.

**F1 — disconnect() unsub loop error isolation (session.ts):**
The `disconnect()` method called `unsub()` directly in a loop. If any unsubscribe function threw, remaining unsubs were skipped, `sdkSession.disconnect()` never ran, and `_onDisconnect` never fired. Since `_disconnected = true` was already set, retry was impossible — unrecoverable state. Fixed by wrapping each `unsub()` in try/catch with `console.warn`, matching the pattern already used in `ForgeClient.stop()`. Updated integration test from `rejects.toThrow` to `resolves.not.toThrow` + asserting `sdkSession.disconnect()` was still called.

**F2 — resumeSession() asymmetry comment (client.ts):**
Added comment explaining why `resumeSession()` has no `onEvent` capture: the SDK's `resumeSession` doesn't accept `onEvent`, and constructor `on()` wiring is synchronous within the JS event loop.

**Test results:** All 289 tests pass (10 test files). Zero regressions.

**Key learning:** Error isolation in cleanup paths must be consistent across the codebase. `stop()` had it, `disconnect()` didn't — same pattern, same risk, missed during initial implementation.

### 2026-05-01: Phase 4 — DBOM Persistence Layer (A1–A4)

**What was built:**
- `packages/cairn/src/db/migrations/010-dbom-artifacts.ts` — Migration creating `dbom_artifacts` and `dbom_decisions` tables with UNIQUE(session_id), ON DELETE CASCADE, and 4 indexes.
- `packages/cairn/src/db/dbomArtifacts.ts` — Full CRUD module: types (DBOMArtifactInsert, DBOMArtifactRow, DBOMDecisionRow), row mappers, and 6 functions (upsertDBOM, getDBOM, getDBOMDecisions, loadDBOMArtifact, deleteDBOM, listDBOMs).
- `packages/cairn/src/db/schema.ts` — Registered migration010 in the migrations array.
- `packages/cairn/src/index.ts` — Barrel exports for all DBOM CRUD functions and types.
- `packages/cairn/src/__tests__/dbomArtifacts.test.ts` — 11 tests covering round-trip, upsert replace, cascade delete, list ordering, limit, decision seq ordering, JSON details, getDBOM row, getDBOMDecisions by id.

**Key architecture decisions:**
1. **Upsert via DELETE + INSERT in transaction** — UNIQUE(session_id) means one DBOM per session. Re-export deletes old artifact (CASCADE cleans decisions) then inserts fresh. Simpler than UPDATE + diff decisions.
2. **No FK to sessions table** — session_id is a logical reference. Forge sessions don't exist in Cairn's DB. This was a spec constraint.
3. **`seq` column for decision ordering** — Decisions are inserted with array index as seq, retrieved ORDER BY seq. This preserves the decision chain's causal ordering independent of insert timing.
4. **decision_types and details stored as JSON text** — decision_types has dynamic keys, details is arbitrary. Both are JSON.parse'd in row mappers, matching the existing skillTestResults pattern (evidence field).

**Schema version bump impact:** Updated 5 existing tests in db.test.ts, discovery.test.ts, and prescriptions.test.ts that hardcoded `toBe(9)` → `toBe(10)`.

**Test results:** All 1090 tests pass (11 new DBOM tests). Zero regressions.

**File paths:**
- Migration: `packages/cairn/src/db/migrations/010-dbom-artifacts.ts`
- CRUD: `packages/cairn/src/db/dbomArtifacts.ts`
- Schema: `packages/cairn/src/db/schema.ts`
- Barrel: `packages/cairn/src/index.ts`
- Tests: `packages/cairn/src/__tests__/dbomArtifacts.test.ts`
