# Alexander — Event-driven Forge disconnect drain

**Date:** 2026-06-21T22:25:59-07:00
**Scope:** Forge production runner slice 1 Cycle 3 hardening

## Decision

ForgeSession disconnect now treats bridged `session.shutdown` / `session_end` observation as the primary terminal-event drain signal. The bounded timeout remains only as a ceiling and test seam; it is no longer a public `ForgeSessionConfig` knob.

`runForgeInstrumentedSession()` now returns `disconnect: { ok: boolean; error?: string }` so disconnect failures remain observable without changing the successful sample-written exit-code contract.

## Rationale

The SDK can emit terminal lifecycle events on a later tick after `sdkSession.disconnect()` resolves. Waiting on the actual bridged terminal event removes the fixed wall-clock heuristic while preserving bounded latency if the SDK never emits shutdown. The disconnect result preserves the current best-effort cleanup behavior while giving callers enough signal to warn, retry, or report degraded cleanup.
