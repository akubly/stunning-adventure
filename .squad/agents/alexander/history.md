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
