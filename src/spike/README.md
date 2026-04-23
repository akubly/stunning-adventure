# Spike: Copilot SDK Exploration

**⚠️ EXPERIMENTAL — Do not use in production.**

This directory contains throwaway proof-of-concept code for the
`@github/copilot-sdk` spike (branch `squad/copilot-sdk-spike`).

Everything here is exploration code. It will be deleted or archived
when the spike concludes. Do not import from this directory in
production Cairn source.

## Files

| File | Purpose | Day |
|------|---------|-----|
| `forge-poc.ts` | Q1 circuit breaker — session management PoC | 1 |
| `event-bridge.ts` | Q5 sketch — SDK events → Cairn event_log adapter | 1-2 |
| `tool-hooks-poc.ts` | Q2 — tool call interception via hooks | 2 |
| `decision-gate-poc.ts` | Q3 — decision gates (3 mechanisms) | 2 |
| `model-selection-poc.ts` | Q7 — model selection + token budgeting | 2 |
| `e2e-smoke-test.ts` | Q8 — full E2E integration smoke test | 3 |
| `dbom-generator.ts` | DBOM — Decision Bill of Materials generator | 3 |

## Running

These files are designed to **compile** (`npm run build`) but not
necessarily **run** — the SDK requires a live Copilot CLI process.
The value is in proving the types and API surface work as documented.

The spike directory is excluded from the main `tsconfig.json` build
to avoid polluting production output.
