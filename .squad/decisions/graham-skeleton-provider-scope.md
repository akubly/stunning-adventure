# Decision: Skeleton SdkProvider Scope (F3 persona-review finding)

**Date:** 2026-06-18  
**Author:** Graham (Lead / Architect)  
**Status:** DECIDED — option (a), skeleton-internal scope isolation

---

## Context

The walking-skeleton (`packages/crucible-core/src/skeleton/`) defines a
`SdkProvider` interface in `skeleton/types.ts`. The persona-review panel flagged
that this interface exposes `completeTurn(prompt)` rather than the authoritative
§12.2 contract (`eventStream` / `submitOutboundPrompt` / `signal` / `capabilities`).
The concern: leaving the interface named `SdkProvider` without explicit scoping
risks a breaking-API perception when Phase 1 introduces the real §12.2 contract.

## Options evaluated

### Option (a) — Scope-isolation (CHOSEN)
Add a prominent `⚠️ SKELETON-INTERNAL CONTRACT` banner to the interface in
`skeleton/types.ts` making it crystal-clear this is NOT the §12.2 `SdkProvider`.
Record the decision here. Phase 1 introduces the authoritative interface from
`@akubly/crucible-boundary` without any "breaking change" because:
- The skeleton interface is already behind the `skeleton/` subpath export
- The `skeleton/` directory is explicitly a removable Phase 0.5 artefact
- No production code outside `skeleton/` depends on this interface

**Why chosen:** Pulling in Phase 1 boundary types (`CrucibleEvent`,
`CrucibleEventStream`, `OutboundPrompt`, `ControlSignal`) now would require
standing up `@akubly/crucible-boundary` ahead of its lane, destabilising the
skeleton scope and adding substantial unplanned work. The isolation boundary
already exists; labelling it clearly is proportionate.

### Option (b) — Align to §12.2 now
Replace `completeTurn` with the full §12.2 method surface. Rejected: requires
`@akubly/crucible-boundary` types that don't exist yet, forces scope creep into
Phase 1 boundary design work, and risks breaking the replay engine and acceptance
tests that depend on the current skeleton contract.

## Resolution

The `SdkProvider` interface in `skeleton/types.ts` is annotated with a
`⚠️ SKELETON-INTERNAL CONTRACT` banner. Phase 1 introduces the authoritative
`SdkProvider` from `@akubly/crucible-boundary` (§12.2). At that point the
skeleton interface is retired with the rest of `skeleton/`.

**No Aaron escalation needed** — this is within architect scope and the finding
explicitly offered option (a) as likely proportionate.
