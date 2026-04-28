# Laura — History

## Project Context

- **Project:** Cairn + Forge — an agentic software engineering platform
- **Tech Stack:** TypeScript, Node.js 20+, npm workspaces monorepo, Vitest, SQLite (better-sqlite3), MCP SDK, Copilot SDK
- **User:** Aaron Kubly
- **Joined:** 2026-04-28

## Onboarding Context

**Monorepo structure (as of Phase 1 completion):**
- `packages/types` (`@akubly/types`) — Shared contract types
- `packages/cairn` (`@akubly/cairn`) — Observability platform (427 tests across 15 test files, Vitest)
- `packages/forge` (`@akubly/forge`) — Execution runtime scaffold (no tests yet)

**Existing test patterns (from @akubly/cairn):**
- Framework: Vitest with `vitest run`
- Config: `packages/cairn/vitest.config.ts`
- Test location: `packages/cairn/src/__tests__/`
- DB tests: In-memory SQLite via `getDb(':memory:')`
- 427 tests across: archivist, applier, curator, db, discovery, isScript, mcp, paths, prescriber, prescriptions, sessionStart, skillLinter, skillParser, skillTestHarness, skillValidator

**Key risk for Forge testing:** The spike proved TYPE compatibility with the Copilot SDK but NOT runtime behavior. Phase 2 must close this gap. Tests need to verify:
1. SDK session lifecycle actually works at runtime
2. Event bridge produces correct CairnBridgeEvents from real SDK events
3. Hook composition doesn't silently drop hooks
4. Decision gates actually block/defer tool execution
5. Model selection API behaves as documented

**SDK testing challenge:** The SDK requires a running Copilot CLI process for full integration tests. Strategy TBD: mock SDK for unit tests, live CLI for integration tests, or hybrid approach.

## Learnings

### 2026-04-28: Phase 2 Runtime Verification Tests

**Files created:**
- `packages/forge/src/__tests__/contracts.test.ts` — 32 tests verifying runtime shapes of CairnBridgeEvent, ProvenanceTier, DecisionRecord, SessionIdentity, DBOMArtifact, TelemetrySink
- `packages/forge/src/__tests__/bridge.test.ts` — 22 tests covering EVENT_MAP (22 entries), provenance classification, payload extractors, unmapped event handling, edge cases (null/undefined/empty data)
- `packages/forge/src/__tests__/hooks.test.ts` — 20 tests covering multi-observer composition, independent hook types, partial observers, error isolation, invocation context, decision gate pattern

**Total: 74 tests, all passing** (plus 25 from Roger's test-infra = 99 total in forge)

**Key patterns used:**
- Inline mock implementations of bridge and hook composer (from spike reference) since Alexander's production modules don't exist yet. Marked with `// TODO: Replace with real import once module exists`.
- Type guard function pattern for runtime ProvenanceTier validation.
- Factory helper functions (`makeBridgeEvent`, `makeDecision`, `makeSession`, `makeSdkEvent`) for clean test construction.

**Edge cases discovered:**
- `null` and `undefined` data payloads in SDK events — default extractor must handle gracefully via `?? {}`.
- Missing `copilotUsage` in `assistant.usage` events — extractor must use optional chaining.
- Empty hooks set and no-hooks-at-all — `composeHooks()` with zero args must still produce valid handler returning `{}`.
- Error isolation gap in spike: spike `composeHooks` propagates errors (one bad observer kills all). Documented desired behavior (isolation) vs current behavior (propagation) in separate tests.

**Architecture insight — error isolation:**
The spike's `composeHooks` does NOT isolate errors — a throwing observer kills subsequent observers. Production implementation MUST add try/catch isolation. This is documented in `hooks.test.ts` with both the desired behavior test and a "documenting current behavior" test.

**Vitest config:** Roger created `packages/forge/vitest.config.ts` — matches cairn's pattern. Run with `cd packages/forge && npx vitest run`.

### 2026-04-28: Hooks Tests Upgraded to Production Imports

Replaced all inline mock types and the inline `composeHooks` function with real imports from Alexander's production modules:
- `composeHooks`, `HookComposer`, `HookObserver` from `../hooks/index.js`
- `PreToolUseInput`, `PreToolUseOutput`, `PostToolUseInput`, `PostToolUseOutput`, `HookInvocation` from `../types.js`
- `ToolResultObject` from `@github/copilot-sdk`

**Changes:**
- Deleted ~120 lines of inline type definitions and mock `composeHooks`
- Updated all observer annotations from `SessionHooks` to `HookObserver` (the partial type consumers actually provide)
- Replaced `{ success: true }` toolResult with proper `ToolResultObject` shape
- Removed obsolete "spike propagates errors" test — production now isolates errors
- Replaced inline `composeHooksWithIsolation` with direct use of production `composeHooks`
- Added 4 error isolation tests against real production code (pre, post, lifecycle, warning logging)
- Added 10 `HookComposer` class tests: `add()`, `remove()`, `size`, `compose()` live-reference, dispose pattern, dynamic changes, duplicate-add idempotency

**Key finding confirmed:** Alexander's production `HookComposer` correctly isolates errors with try/catch and logs via `console.warn("[HookComposer]...")`. The decision I filed (`laura-hook-error-isolation.md`) was implemented.

**Test count:** hooks.test.ts went from 20 tests (inline mocks) to 32 tests (production imports + HookComposer coverage). Full forge suite: 111 tests passing.

**Cross-agent coordination:** Alexander read the error isolation decision and implemented it in HookComposer. His implementation uses try/catch per observer and logs warnings. The test suite confirms this works as designed.
