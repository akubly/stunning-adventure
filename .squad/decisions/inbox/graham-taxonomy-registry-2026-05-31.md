# §6 / §17 Taxonomy Registry Decision — PR #33 Cycle 2

**Status:** Graham architectural call, applied in PR #33 review fixes  
**Date:** 2026-05-31  
**Owner:** Graham

## Decision

§6.3 remains the authoritative primitive taxonomy registry. §17 may catalog concrete observability events, but every L1 `Observation.subKind` used by §17 must be registered in §6.3. Decision rows still have no `subKind`; concrete Decision event names are represented by `DecisionPayload.eventType` values registered in §6.3.

## Rationale

The §17 event catalog reflects real implementation and operator needs: predicate timeouts, fence retries, replay divergence, CI failures, projection staleness, subscriber drops, and retention warnings need stable names. Hiding those behind generic existing sub-kinds would make telemetry less testable and less useful.

The boundary is that §17 does not invent unregistered vocabulary. Observation event names graduate into §6.3, while scheduler/router/applier Decision events stay payload-level because §6.3 intentionally has no Decision sub-kind axis.

## Alternatives Considered

1. **Collapse §17 events into existing §6 sub-kinds and move variation into body fields.** Rejected: it preserves a smaller taxonomy but loses clear conformance hooks and makes operator-visible alerts depend on ad hoc payload interpretation.
2. **Add Decision sub-kinds.** Rejected: it contradicts the locked §6.3 primitive taxonomy and duplicates the existing Decision payload fields.

## Applied Consequences

- Added missing §17 Observation sub-kinds to `ObservationPayload.subKind` and the §6.3 registry table.
- Added `DecisionPayload.eventType` as the registered home for router/applier/scheduler event names.
- Updated §17 to describe scheduler rows as Decision `eventType` values, not Decision sub-kinds.
- Replaced the misleading "no new vocabulary" claim with the registry rule above.