# Team Decisions — Cairn Plugin Marketplace

## Index

- [Unified Package Scope → @akubly](#unified-package-scope--akubly)

---

## Unified Package Scope → @akubly

**Date:** 2026-04-24  
**Author:** Roger (Platform Dev)  
**Status:** Adopted  
**Log:** [2026-04-24T23-18-roger.md](../orchestration-log/2026-04-24T23-18-roger.md)

### Context

The monorepo used a mix of `@cairn/*` and `@akubly/*` scopes:
- `@cairn/types`, `@cairn/forge` — used the `@cairn` scope
- `@akubly/cairn` — already used the `@akubly` scope (published to npm)

This inconsistency would block npm publishing for `types` and `forge` since Aaron owns the `@akubly` scope on npm, not `@cairn`.

### Decision

Rename all packages to the `@akubly` scope:
- `@cairn/types` → `@akubly/types`
- `@cairn/forge` → `@akubly/forge`
- `@akubly/cairn` — unchanged (already correct)

### Consequences

- All three packages share one scope, simplifying npm publishing
- Import paths in source and docs updated to match
- Historical docs (decisions.md, agent histories, spikes) intentionally left unchanged to preserve the context in which they were written
