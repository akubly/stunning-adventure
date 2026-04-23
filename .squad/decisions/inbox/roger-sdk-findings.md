# SDK Spike Findings — Decision Required

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-04-07
**Type:** Technical spike results
**Urgency:** Normal — informational, no blocking decisions

---

## What I Found

The `@github/copilot-sdk` (v0.2.2) is published, installable, well-typed, and comprehensive. 86 event types, 6 bi-directional hooks, full session management, BYOK support, built-in OpenTelemetry.

## Key Discovery: `assistant.usage` Is Better Than Expected

The `assistant.usage` event gives us:
- **Token counts:** input, output, cache read/write
- **Actual billing cost:** `copilotUsage.totalNanoAiu` (nano AI Units — not estimates)
- **Latency metrics:** duration, TTFT, inter-token latency
- **Quota tracking:** entitlement snapshots with remaining percentage
- **Sub-agent attribution:** `parentToolCallId` and `initiator` fields

This is everything we'd need for cost tracking without any estimation or scraping.

## Integration Effort

| Component | LOC | Time |
|-----------|-----|------|
| Event bridge adapter | ~50 | Hours |
| Harness bootstrap | ~80 | Hours |
| New Cairn event types | ~30 | Hours |
| Cost summary in curator | ~100 | 1 day |
| Tests | ~150 | 1 day |
| **Total** | **~410** | **2-3 days** |

## What This Changes

1. **Token cost tracking is solvable now.** No need to wait for custom telemetry — the SDK emits exactly what we need.
2. **Hooks become richer.** SDK hooks can *modify* behavior (args, permissions, results), not just observe. Cairn's stdin hooks are observe-only.
3. **The harness IS the integration.** Instead of bolting Cairn onto the CLI, the harness embeds both the SDK and Cairn in one process. In-process event bridge, no IPC overhead.

## Risk

SDK is Technical Preview. 52 versions in ~3 months = frequent churn. Mitigations:
- Pin version, don't auto-upgrade
- Abstract behind our own event types (bridge adapter is the seam)
- Keep existing stdin hooks working for non-harness users

## Recommendation

Proceed with harness development. The SDK is ready enough to build on, and the event system maps cleanly to Cairn's architecture. Biggest open question: do we want the harness to *replace* the Copilot CLI, or wrap it? The SDK supports both patterns (spawn vs connect to existing).

Full spike document: `docs/spikes/copilot-sdk-exploration.md`
