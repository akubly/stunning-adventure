# Spike: Copilot SDK Exploration

**⚠️ EXPERIMENTAL — Do not use in production.**

This directory contains throwaway proof-of-concept code for the
`@github/copilot-sdk` spike (branch `squad/copilot-sdk-spike`).

Everything here is exploration code. It will be deleted or archived
when the spike concludes. Do not import from this directory in
production Cairn source.

## Files

| File | Purpose |
|------|---------|
| `forge-poc.ts` | Q1 circuit breaker — session management PoC |
| `event-bridge.ts` | Q5 sketch — SDK events → Cairn event_log adapter |

## Running

These files are designed to **compile** (`npm run build`) but not
necessarily **run** — the SDK requires a live Copilot CLI process.
The value is in proving the types and API surface work as documented.
