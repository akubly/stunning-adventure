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

### 2026-04-28: Bridge Tests Upgraded to Production Imports

Replaced all inline mock types and reimplemented bridge logic with real imports from Alexander's production bridge module:
- `bridgeEvent`, `classifyProvenance`, `EVENT_MAP`, `PAYLOAD_EXTRACTORS` from `../bridge/index.js`
- `SessionEvent` type from `@github/copilot-sdk`

**Changes:**
- Deleted ~120 lines of inline type definitions, EVENT_MAP, CERTIFICATION_EVENT_TYPES, classifyProvenance, PayloadExtractor, defaultExtractor, PAYLOAD_EXTRACTORS, and bridgeEvent
- Removed stale `CairnBridgeEvent` and `ProvenanceTier` type imports (no longer needed — tests use production functions that handle typing internally)
- Updated `makeSdkEvent` helper to construct SDK-compatible `SessionEvent` objects (requires `id`, `parentId` fields; uses `as unknown as SessionEvent` cast since SDK type is a discriminated union)
- Updated explicit `SessionEvent` construction in "preserves timestamp" test to match SDK shape
- Cast `EVENT_MAP` access with string key via `as Record<string, string>` since production type is `Partial<Record<SessionEventType, string>>`

**Key finding confirmed:** The inline copy HAD DIVERGED from production — inline `defaultExtractor` had `?? {}` fallback but production did not. Alexander simultaneously fixed production to add `?? {}`. This validates the persona review's concern about inline copies drifting.

**Test count:** All 22 bridge tests pass against production code. Full forge suite: 111 tests passing.

### 2026-04-28: Phase 2 Remaining Module Tests (decisions, dbom, session)

**Files created:**
- `packages/forge/src/__tests__/decisions.test.ts` — 18 tests covering createDecisionGate (gating, pass-through, DecisionRecord shape, error isolation, session ID evidence, certification tier), createDecisionRecorder (passive recording, correct fields, multiple calls), makeDecisionRecord (unique IDs, timestamps, all fields, passthrough)
- `packages/forge/src/__tests__/dbom.test.ts` — 33 tests covering generateDBOM (certification filtering, valid artifact shape, empty events, hash chain linking, tamper detection, internal-only filtering), classifyDecisionSource (16 classification cases including permission_completed variants, decision_point sources, subagent events, conservative defaults), summarizeDecision (all event types, missing fields), computeDecisionHash (determinism, differentiation, chain integrity, SHA-256 format), computeStats (source counting, chain depth/roots, event type counts, empty input)
- `packages/forge/src/__tests__/session.test.ts` — 10 tests covering ModelSnapshot shape (required fields, optional fields present/absent), toModelSnapshot (correct extraction, missing optionals, internal field stripping, reasoning model, zero context), ReasoningEffort type (valid values, type-level check)

**Total: 61 new tests, all passing against production modules.** Full forge suite: 181 tests.

**Key approach:** All tests import from real production modules (`../decisions/index.js`, `../dbom/index.js`, `../session/index.js`). No inline mocks of production logic — lesson learned from bridge.test.ts.

**Fixes during test authoring:**
1. `makeDecisionRecord` requires all fields (alternatives, evidence, confidence, provenanceTier) — no defaults. Adjusted test from "uses sensible defaults" to "passes through all caller-provided fields."
2. `summarizeDecision('snapshot_rewind')` returns "Session state rewound to snapshot" — used `toContain('rewound')` not `toContain('rewind')`.

### 2026-04-28: Session Test TypeScript Fix — ModelPolicy.terms

Fixed `session.test.ts` build failures caused by SDK `ModelPolicy` type requiring a `terms` field and `state` being a `"enabled" | "disabled" | "unconfigured"` union (not free string).

**Changes:**
- Replaced untyped `makeModelInfo` helper with properly typed version using `ModelInfo` import from `@github/copilot-sdk`
- Fixed `policy.state` values: `'available'` → `'enabled'`, `'preview'` → `'disabled'`
- Added `terms: ''` to all policy objects
- Used `as unknown as ModelInfo` cast for "strips internal fields" test (to add extra properties)
- Fixed `makeDecisionRecord` calls missing required fields (`alternatives`, `evidence`, `confidence`, `provenanceTier`)

**Lesson:** When building mock objects for SDK types, always import and annotate with the real type. Free-form objects with inferred types silently allow invalid string literals until `tsc --build` catches them.

### 2026-04-29: Phase 3 Test Contracts — Runtime & Models

**Files created:**
- `packages/forge/src/__tests__/runtime.test.ts` — 35 tests covering ForgeClient session lifecycle (create, resume, stop, error propagation), ForgeSession bridge event wiring (auto-subscribe, bridge mapping, multi-event, usage capture, unmapped events), hook composition integration (multi-observer, dynamic add/remove via live HookComposer), message sending (send, sendAndWait delegation), disconnect lifecycle (idempotent, event unsubscription), edge cases (multi-session tracking, copy semantics), decision gate integration (blocking, pass-through, gate+telemetry composition).
- `packages/forge/src/__tests__/models.test.ts` — 52 tests covering ModelCatalog (refresh from client, list/get/filter, size, copy semantics, empty state, strategy integration), toModelSnapshot extraction (required fields, optional fields, missing optionals, maxOutputTokens), ModelSwitcher (setModel delegation, reasoning effort, change event tracking, history ordering, current model updates, copy semantics), TokenBudgetTracker (per-model accumulation, cache tokens, nano-AIU, duration, cross-model totals, unknown model default, context window tracking with peak/limit/updates, dispose lifecycle), model strategies (cheapest, smartest, budgetAware with threshold behavior, disabled model exclusion, empty lists, default billing).

**Files modified:**
- `packages/forge/src/__tests__/helpers/mock-sdk.ts` — Extended MockCopilotSession with `setModel` mock, typed event handler tracking (`_typedHandlers`), and unsubscribe return values from `on()`. Extended MockCopilotClient with `resumeSession`, `listSessions`, `listModels`, `getAuthStatus`, `getStatus` mocks. Added `makeModelInfo` factory helper.
- `packages/forge/src/__tests__/helpers/index.ts` — Added `makeModelInfo` to barrel export.

**Total: 87 new tests, all passing.** Full forge suite: 268 tests passing.

**Key approach — inline contract implementations:**
Phase 3 modules (runtime/, models/) don't exist yet. Rather than importing from non-existent modules, the test files define expected API types and inline implementations (ForgeClient, ForgeSession, ModelCatalog, ModelSwitcher, TokenBudgetTracker) that establish the behavioral contract. When Alexander builds the real modules, tests switch from inline to real imports — any behavioral divergence immediately surfaces as test failures.

**Mock SDK extension rationale:**
Phase 2 mocks only had createSession/stop on the client and basic on/send/sendAndWait/disconnect on the session. Phase 3 needs resumeSession, listModels, setModel, typed event subscriptions, and unsubscribe return values. Extended the shared helpers rather than creating test-local mocks to maintain the "single source of mock truth" pattern.

**Bridge event type discovery:**
Initial test assumed `tool.execution_start` maps to `tool_start` in CairnBridgeEvent. Actually maps to `tool_use` (and `tool.execution_complete` → `tool_result`). Fixed by checking the production EVENT_MAP. Lesson: always verify Cairn event type names against the production bridge module rather than guessing from SDK event names.

### 2026-04-29: Phase 3 Cross-Module Integration Tests (L2–L7)

**File created:**
- `packages/forge/src/__tests__/integration.test.ts` — 19 tests across 6 test groups

**Test groups:**
- **L2 (E2E Wiring):** 3 tests — full ForgeClient→ForgeSession→bridge→sink flow, hook observers through composed hooks, event sequence ordering
- **L3 (Error Isolation):** 4 tests — throwing observer isolation, bridge handler error resilience, disconnect cleanup with throwing unsubscribe, stop() resilience with failing session disconnect
- **L4 (Decision Gate Integration):** 3 tests — gate→HookComposer→ForgeSession blocking, gate+recorder composition, dynamic gate add/remove mid-session
- **L5 (Model Switching):** 3 tests — model_change event tracking, accumulation, bridge event emission
- **L6 (Token Tracker Integration):** 3 tests — per-model accumulation from assistant.usage, context window high-water mark from session.usage_info, unsubscribe stops tracking
- **L7 (Resume):** 3 tests — create→disconnect→resume with re-attached bridge, old session cleanup from tracking map, new observers on resumed session

**Full forge suite: 289 tests passing (19 new).**

**Key finding — mock session unsubscribe semantics:**
The mock session's `on()` returns a no-op unsubscribe stub. For testing real unsubscribe behavior (L6 token tracker), I needed to build a proper EventSource adapter with `Set<handler>`-based subscribe/unsubscribe. The mock session helpers are designed for fire-and-forget event wiring (ForgeSession's bridge subscription), not for testing unsubscribe semantics directly.

**Decision: disconnect error propagation (L3):**
ForgeSession.disconnect() does NOT wrap individual unsubscribe calls in try/catch — if the bridge unsubscribe throws, disconnect throws. However, ForgeClient.stop() DOES wrap each session disconnect in try/catch and collects errors. This is correct: stop() must be resilient (best-effort cleanup), while disconnect() is a direct API where callers can handle the error. The L3 tests verify both behaviors.

### 2026-04-30: Phase 4 Test Contracts — Export Pipeline (initial)

Initial 37 tests written before spec existed. Superseded by spec-aligned rewrite below.

### 2026-05-01: Phase 4 Test Contracts — Spec-Aligned Rewrite

**File updated:** `packages/forge/src/__tests__/export.test.ts`

Rewrote all contract tests to match `docs/forge-phase4-spec.md` exact API surface:
- Types: `SkillFrontmatterInput`, `SkillCompilerInput`, `CompiledSkill` (with `content`, `contentHash`, `compiledAt`), `StageContext`, `ExportStage`, `ExportPipelineConfig`, `ExportPipelineResult`, `ExportStageResult`, `ExportDiagnostic`, `QualityGateResult`, `ExportQualityGate`
- Functions: `renderFrontmatter(fm, dbom)`, `compileSkill(input)`, `extractStage(ctx)`, `stripStage(ctx)`, `attachStage(ctx, fm)`, `validateStage(ctx, gate)`, `runExportPipeline(config)`

**My contract tests (62 tests) across 10 groups:**
- **renderFrontmatter (8):** YAML structure, provenance block, decision_types map, tools section, empty fields, escaping (quotes, newlines)
- **compileSkill (6):** CompiledSkill shape, content structure, contentHash (SHA-256, determinism, differentiation), empty content, whitespace trimming
- **extractStage (4):** DBOM generation, empty events → error diagnostic, no cert events → warning diagnostic, diagnostic preservation
- **stripStage (5):** Windows paths, Unix paths, /tmp paths, mixed paths, passthrough, no-content edge
- **attachStage (3):** normal flow, missing DBOM → error diagnostic, empty content
- **validateStage (4):** passing gate, failing gate, content passed to gate, missing compiled skill → error diagnostic
- **runExportPipeline (15):** happy path, 4 stage timing, all stages pass, quality gate failure (skill still returned), empty events (early stop), internal-only events (warning), persistDBOM injection (called/not called/missing), persistence failure → warning, structured result, persisted events, compiled content to gate, path stripping, diagnostic accumulation
- **DBOM Persistence (3):** persistFn receives complete artifact, call order (after gate), error message in diagnostic
- **Forge→Cairn Integration (5):** gate receives compiled content, gate fields propagate, end-to-end flow, provenance matches standalone DBOM, stats in frontmatter YAML
- **Export Edge Cases (9):** no sections, long content, special chars, mixed tiers, deterministic hash, large chains (200), gate exception propagation, relative path preservation, /tmp path stripping

**Roger's production tests (37 tests) also in file — imported from real `../export/` modules.**

**Full forge suite: 388 tests passing (99 in export.test.ts).**

**Key changes from initial version:**
1. `CompiledSkill.markdown` → `CompiledSkill.content` (spec §3.1)
2. `CompiledSkill.frontmatter` → embedded in YAML string, not separate object
3. Added `CompiledSkill.contentHash` (SHA-256) and `CompiledSkill.compiledAt`
4. `ExportResult` → `ExportPipelineResult` with `stages[]`, `diagnostics[]`, `qualityGatePassed`, `lintErrors`, `validationScore`
5. Quality gate is now `ExportQualityGate = (string) → QualityGateResult`, not the old `CairnToolkit` interface
6. Pipeline stages as pure `(StageContext) → StageContext` functions
7. DBOM persistence via injected `persistFn`, not a separate `DBOMStore` interface
8. Added `renderFrontmatter` tests (YAML structure, provenance block, tools, escaping)
9. Added `stripStage` tests (Windows/Unix/tmp paths, relative path preservation)
10. Added stage timing assertions (`durationMs >= 0`)
11. Added diagnostic accumulation tests

**New edge cases discovered:**
- `stripStage` preserves relative paths (src/..., ./...) — only strips absolute paths
- `stripStage` handles /tmp paths (Unix temp directories)
- `validateStage` does NOT catch quality gate exceptions — they propagate. Spec §7.1 says pipeline should catch, so production implementation must add try/catch.
- `compiledAt` in frontmatter means `renderFrontmatter` is NOT deterministic (calls `new Date()`) — contentHash changes between calls even with identical logical input. Tests verify SHA-256 format rather than exact hash equality across calls.
