# ADR-0002: Shared Substrate Ownership

**Status:** Accepted — 2026-05-27 (Aaron)  
**Author:** Graham (Lead/Architect)  
**Date:** 2026-05-27  
**Deciders:** Aaron (required), Graham, Cassima  
**PRD Reference:** FR-13 (SessionId brand), FR-12 mechanism #8 (ESLint guardrail)  
**Tension Reference:** §70 T7; merged substrate analysis in `.squad/decisions.md` "Narrower Substrate Freeze Proposal" (2026-05-27)

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
- TypeScript monorepo tooling is mature (npm workspaces with `tsc --build` project references — already in use across `mem/`)
- `SessionId` brand enforcement is trivial

**Cons:**
- Requires repo restructuring (non-trivial migration)
- Two teams work in one repo; merge conflicts possible
- CI time increases (whole-repo builds)

**Trade-off named:** Upfront migration cost vs. ongoing coordination overhead.

### Option B: Git Submodule

Extract shared packages into a third repo (`@akubly/substrate`):

```
<substrate-repo>/
  packages/
    cairn/
    forge/
    types/

<mem-repo>/
  .gitmodules → substrate
  packages/eureka/

<harness-repo>/
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

**Accepted: Option A — Monorepo.** Merge `mem/` and `harness/` into a single `@akubly/` workspace with shared `packages/{cairn,forge,types}` and project-specific `packages/{eureka,crucible}`.

Monorepo wins for v1 because it provides a compile-time type-safety guarantee for the `SessionId` brand — any consumer that drifts is caught by `tsc`, not discovered in integration. Atomic schema changes across Cairn and Forge land in a single commit, eliminating the synchronisation discipline that Options B and C would require. FR-12 mechanism #8 (the ESLint guardrail banning cross-system session-type imports except `SessionId`) becomes trivially enforceable when all packages share one `node_modules` tree and one lint config.

**Named trade-off accepted:** We pay the upfront migration cost (repo merge, CI consolidation, workspace rewiring) once, rather than accepting the ongoing coordination overhead of keeping two repositories in sync for every shared-type change. For a two-person team in rapid v1 iteration, the one-time cost is categorically cheaper.

---

## Consequences

### If Option A (Monorepo) — ACCEPTED

**M0 prerequisites (sequenced):**

1. **Repo merge plan** (Graham + Roger) — Draft the file-move strategy, git-history preservation approach, and branch protection rules for the unified repo. Target: 1–2 days after this ADR lands.
2. **Monorepo scaffolding** (Roger + Gabriel) — npm workspace config (already present), unified `tsconfig` project references with `tsc --build`. Must complete before any package code moves.
3. **CI/CD consolidation** — Single GitHub Actions workflow replacing per-repo CI. Leverage `tsc --build` incremental compilation to mitigate whole-repo build time.
4. **ESLint guardrail wiring** (FR-12 #8) — Single lint config enforces the cross-system session-type import ban. Trivially enforceable once packages share one workspace.
5. **SessionId brand validation** — Confirm `@akubly/types` `SessionId` brand compiles and validates from both `packages/eureka/` and `packages/crucible/` import paths. Single source of truth by construction.
6. **CODEOWNERS** — Shared packages (`cairn`, `forge`, `types`) require both teams' approval. Project packages (`eureka`, `crucible`) are team-scoped.

*Note: Future migration to pnpm/turborepo could optimize build caching, but npm workspaces + `tsc --build` is sufficient for v1.*

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
| **2026-05-27** | ✅ Aaron chooses Option A (Monorepo) — decision accepted |
| **This week** | Graham updates technical-design.md, decision inbox, ADR status |
| **Next** | Repo merge plan drafted (Graham + Roger) |
| **M0 prerequisite** | Monorepo scaffolding: pnpm workspace, turborepo, unified tsconfig (Roger + Gabriel) |
| **M0 prerequisite** | CI/CD consolidation + ESLint guardrail wiring |
