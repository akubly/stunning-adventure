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
