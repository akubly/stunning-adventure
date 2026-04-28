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
