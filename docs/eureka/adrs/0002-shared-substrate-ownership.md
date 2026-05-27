# ADR-0002: Shared Substrate Ownership

**Status:** Proposed — awaiting Aaron's decision  
**Author:** Graham (Lead/Architect)  
**Date:** 2026-05-27  
**Deciders:** Aaron (required), Graham, Cassima  
**PRD Reference:** FR-13 (SessionId brand), FR-12 mechanism #8 (ESLint guardrail)  
**Tension Reference:** §70 T7, `.squad/decisions/inbox/cassima-t7-shared-substrate-blocker.md`

---

## Context

Eureka v5 R8 introduces a shared `SessionId` brand in `@akubly/types`. This is load-bearing: Cairn sessions and Eureka session-facts must correlate via the same Copilot CLI session UUID, typed through the shared brand.

**Problem discovered:** Both `mem/` and `harness/` repositories contain:
- `packages/cairn/`
- `packages/forge/`
- `packages/types/`

The PRDs for both Eureka and Crucible assume these packages exist and are stable, but **neither PRD declares ownership**. This creates three risks:

1. **`@akubly/types` drift** — Eureka adds `SessionId` to `mem/packages/types/`; Crucible uses `harness/packages/types/` without it. Type safety breaks.
2. **Cairn/Forge divergence** — Schema changes land in one repo, not the other. v1.5 integration requires migration.
3. **ESLint guardrail failure** — FR-12 mechanism #8 assumes a single `@akubly/types` source. Duplication defeats the boundary.

## Decision Drivers

1. **Type safety** — `SessionId` brand must be singular across all consumers
2. **Atomic schema changes** — Cairn/Forge changes should propagate to both projects
3. **Implementation velocity** — v1 needs to ship without merge coordination overhead
4. **Team independence** — Eureka and Crucible teams should minimize blocking interactions

## Considered Options

### Option A: Monorepo (Recommended)

Merge `mem/` and `harness/` into a single `@akubly/` monorepo:

```
packages/
├── cairn/           (shared)
├── forge/           (shared)
├── types/           (shared)
├── eureka/          (Eureka-specific)
├── crucible/        (Crucible-specific)
└── learning-kernel/ (future extraction)
```

**Pros:**
- Single source of truth for all shared packages
- Atomic CI/CD — schema changes are validated across both projects
- TypeScript monorepo tooling is mature (pnpm workspaces, turborepo)
- `SessionId` brand enforcement is trivial

**Cons:**
- Requires repo restructuring (non-trivial migration)
- Two teams work in one repo; merge conflicts possible
- CI time increases (whole-repo builds)

**Trade-off named:** Upfront migration cost vs. ongoing coordination overhead.

### Option B: Git Submodule

Extract shared packages into a third repo (`@akubly/substrate`):

```
D:\git\akubly-substrate\
  packages/
    cairn/
    forge/
    types/

D:\git\mem\
  .gitmodules → substrate
  packages/eureka/

D:\git\harness\
  .gitmodules → substrate
  packages/crucible/
```

**Pros:**
- Teams keep separate repos
- Shared substrate is explicitly versioned
- Can pin submodule commit for stability

**Cons:**
- Submodule workflows are error-prone (detached HEAD, forgotten commits)
- CI complexity (recursive clone, submodule fetch)
- Schema changes are not atomic — one repo can drift until submodule updated

**Trade-off named:** Team independence vs. synchronization discipline.

### Option C: NPM Packages

Publish `@akubly/cairn`, `@akubly/forge`, `@akubly/types` to npm (private registry):

```json
// Both repos' package.json
{
  "dependencies": {
    "@akubly/types": "^1.0.0",
    "@akubly/cairn": "^1.0.0",
    "@akubly/forge": "^1.0.0"
  }
}
```

**Pros:**
- Clean semantic versioning
- Standard npm workflow
- Decouples source changes from dependency updates

**Cons:**
- CI overhead (publish step, dependency resolution)
- v1 packages are unstable — frequent version bumps
- Adds deployment ceremony before schema changes propagate

**Trade-off named:** Version control discipline vs. rapid iteration speed.

---

## Decision

**PENDING — awaiting Aaron's choice.**

Graham's recommendation: **Option A (monorepo)** for cleanest dependency graph and type safety guarantee. Option B acceptable if team independence is paramount.

---

## Consequences

### If Option A (Monorepo)
- Repo merge required before M0 scaffolding
- CI/CD reconfigured for monorepo
- ESLint guardrail (FR-12 #8) enforced trivially
- SessionId brand is singular by construction

### If Option B (Submodule)
- New `@akubly/substrate` repo created before M0
- Both repos update `.gitmodules`
- CI must fetch submodules recursively
- Team discipline required to keep submodule in sync

### If Option C (NPM Packages)
- Registry setup required (npm private or GitHub Packages)
- Publish workflow added to substrate repo CI
- Both repos pin to versions; coordination on updates
- Higher ceremony, lower velocity for v1

---

## Related Decisions

- **OQ-1** in technical design: This ADR is the detailed analysis
- **FR-12 mechanism #8:** ESLint cross-system session-type ban depends on single `@akubly/types`
- **FR-13 SessionId brand:** Assumes shared substrate is owned
- **Crucible Amendment A1:** Same problem from Crucible perspective

---

## Timeline

| When | Action |
|------|--------|
| **This week** | Aaron chooses A / B / C |
| **Following day** | Graham documents decision in both PRDs |
| **M0 start** | Repos restructured (A), submodule wired (B), or npm deps declared (C) |
