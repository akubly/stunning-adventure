# Laura — History (Summarized)

## Project Context

- **Project:** Cairn + Forge — an agentic software engineering platform
- **Tech Stack:** TypeScript, Node.js 20+, npm workspaces monorepo, Vitest, SQLite (better-sqlite3), MCP SDK, Copilot SDK
- **User:** Aaron Kubly
- **Joined:** 2026-04-28

## Test Architecture Patterns

**Existing test patterns (from @akubly/cairn):**
- Framework: Vitest with itest run
- Config: packages/cairn/vitest.config.ts
- Test location: packages/cairn/src/__tests__/
- DB tests: In-memory SQLite via getDb(':memory:')
- 427 tests across 15 domains

**Contract-first testing approach:**
- Inline contract implementations establish behavioral expectations
- When real modules built, tests switch from inline to real imports
- Any behavioral divergence immediately surfaces as test failures
- Phase 3 pattern: define expected API types, inline implementations, then swap imports

**Key testing decisions:**
- Mock SDK for unit tests, live CLI for integration tests
- Bridge event type discovery: always verify names against production EVENT_MAP
- Mock session unsubscribe semantics: fire-and-forget wiring ≠ testing unsubscribe
- ForgeClient.stop() wraps in try/catch (resilient), ForgeSession.disconnect() throws directly

## Phase-by-Phase Summary

### Phase 2 Runtime Verification (2026-04-28)

- 32 contract tests: CairnBridgeEvent shapes, ProvenanceTier, DecisionRecord, SessionIdentity, DBOMArtifact, TelemetrySink
- 22 bridge tests: EVENT_MAP (22 entries), provenance classification, unmapped event handling, edge cases

### Phase 3 Cross-Module Integration (2026-04-29)

- 87 new tests: ForgeClient session lifecycle, bridge wiring, hook composition, message sending, disconnect lifecycle, model switching, token budget tracking
- Full forge suite: 268 tests passing
- Key finding: mock session returns no-op unsubscribe stub (only fire-and-forget wiring)

### Phase 4.5 Feedback Loop (2026-05-02)

- Delivered: 36 integration/convergence/regression/efficiency tests in eedback-loop.test.ts
- Design: convergence asserted by monotone response curves (hint count ↓ as drift ↓), not terminal states
- Process-invariant testing: simulate operator effect at profile level
- L5 tests catch O(N) regressions
- **Total: 990 tests passing (512 forge, 478 cairn)**

### Phase 4 Export Pipeline (2026-05-01)

- Rewrote 62 contract tests to match spec API surface
- Test groups: renderFrontmatter (8), compileSkill (6), extractStage (4), stripStage (5), attachStage (3), validateStage (4), runExportPipeline (15), persistence (3), integration (5), edge cases (9)
- Key discovery: stripStage preserves relative paths, only strips absolute paths
- 37 production tests from Roger's modules also in file

### Phase 4.6 Change Vector Learning (2026-05-03)

**Wave 1:**
- L1–L5: Migration 012 tests, CRUD tests, prescriber integration, Curator e2e, weight consistency regression
- 93 new tests across 5 files; total: 1099 passing

**Wave 2:**
- Flagged inconsistency: summarizeChangeVectors returns confidence=0 vs computeConfidenceBoost(0) = 1.0
- Analysis: contract ambiguity (level vs boost semantics), not logic error
- Status: SATISFIED WITH CAVEAT

**Wave 3:**
- Upgraded all tests per defect verdict (renamed .confidence → .confidenceBoost)
- Replaced it.todo with passing test
- Added ChangeVectorSummary schema regression suite
- **Final: 1102 passing tests**

**Lesson:** Defect finding ≠ defect fixing. Tester identifies, architect decides, implementer executes under review. Divided labor prevents blind spots.

## Core Patterns Established

**Test organization:** Inline contract implementations before real modules exist. Switch from inline to real imports with zero test changes (only implementation changes).

**SDK testing constraint:** SDK requires running Copilot CLI process for full integration tests. Unit tests use mocks, integration tests require live CLI.

**Metamorphic testing:** Response curves, not terminal states. Operator effects simulated at profile level. Generic bounds catch regressions without hardcoding expected values.

**Regression guards:** L5 tests catch O(N) complexity regressions. Weight consistency tests (e.g., cairn/forge constant alignment) prevent silent divergence. Schema regression suites catch structural drift.

**Defect resolution pattern:** Lockout rule (author cannot fix own defect) prevents blind spots. Three-phase triage (find → decide → fix) divides ownership, improves quality.