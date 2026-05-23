# ADR-0001: Composition Root for Cairn + Forge Runtime

**Status:** Proposed (awaiting Aaron's approval)  
**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-23  
**Supersedes:** Wave 2 ad-hoc CLI composition (`packages/runtime-cli/`)

---

## Context

Wave 2 shipped `@akubly/runtime-cli` as a deliberate stepping stone: the only file that imports both `@akubly/cairn` and `@akubly/forge`. It works for manual CLI invocation (`npx forge-prescribe --skill <id>`), but Wave 3 requires three capabilities that demand a real composition root:

1. **Curator integration** — `curate()` needs an injected `PrescriberOrchestrationConfig` so prescribers run automatically after vector sweeps.
2. **MCP tool exposure** — `run_prescriber_optimization` must register in an MCP server that can import both packages.
3. **Phase 5 portability** — Cloud Curator will need the same composition logic without CLI or local SQLite assumptions.

Today's composition roots (Cairn hooks, Cairn MCP server, Forge client) are single-package entry points. None imports both. The question: **where does the runtime that composes both packages live?**

---

## Option Label Reconciliation

Roger's audit and Alexander's analysis used overlapping but inconsistent option labels. This ADR uses a canonical set (R1–R5) with a mapping table.

| ADR Label | Roger's Label | Alexander's Label | Description |
|-----------|--------------|-------------------|-------------|
| **R1** | Option A | Option C | Promote `runtime-cli` → general `@akubly/runtime` (CLI + library in one package) |
| **R2** | Option B | Option A (≈) | New `@akubly/runtime` library package + keep `@akubly/runtime-cli` as thin CLI wrapper |
| **R3** | Option C | Option B | Inject Forge into Cairn hooks (no new package; Cairn gains Forge dependency) |
| **R4** | Option D | Option D (≈) | New specialist package (`@akubly/curator` or `@akubly/prescriber-optimizer`) |
| **R5** | Option E | — | Runtime module pattern (singleton auto-init). Not recommended by Roger. |

Note: Roger's Option B and Alexander's Option A both converge on "new `@akubly/runtime` library package" but differ in whether `runtime-cli` stays separate (Roger) or is absorbed (Alexander). R2 captures the consensus shape with explicit CLI separation.

---

## Options Considered

### R1: Promote `runtime-cli` → `@akubly/runtime` (Monolith)

Rename `packages/runtime-cli` → `packages/runtime`. Single package hosts CLI entry, library composition, and MCP tool registration.

**File paths:** `packages/runtime/src/index.ts` (library), `packages/runtime/src/cli.ts` (CLI), `packages/runtime/src/mcp-prescriber.ts` (MCP tools).

| Dimension | Assessment |
|-----------|-----------|
| Package clarity | ⚠️ Mixed — "runtime" is generic; CLI + library + MCP in one bag |
| Test isolation | ⚠️ CLI and library tests coupled in same suite |
| Build risk | ✅ No new deps; acyclic graph preserved |
| Phase 5 fit | ⚠️ Cloud code imports `@akubly/runtime` but gets CLI baggage |
| Deployment | ✅ Single package |

### R2: New `@akubly/runtime` Library + Thin `@akubly/runtime-cli` (Recommended)

Create `packages/runtime/` as a composition library (no CLI, no bin entry). Keep `packages/runtime-cli/` as a thin CLI wrapper that delegates to `@akubly/runtime`.

**File paths:**
- `packages/runtime/src/index.ts` — composition exports (`runForgePrescribe`, `createPrescriberOrchestrationConfig`, `registerPrescriberTools`)
- `packages/runtime/src/orchestrator.ts` — `PrescriberOrchestrationConfig` factory
- `packages/runtime/src/mcp-prescriber.ts` — MCP tool registration helper
- `packages/runtime-cli/src/cli.ts` — thin CLI (imports `@akubly/runtime`)

**Dependency graph:**
```
@akubly/types
  ↑
  ├─ @akubly/forge
  ├─ @akubly/cairn
  └─ @akubly/runtime ← imports both Cairn + Forge
       ↑
       └─ @akubly/runtime-cli ← thin CLI wrapper
```

| Dimension | Assessment |
|-----------|-----------|
| Package clarity | ✅ Clear roles — library vs. CLI are separate concerns |
| Test isolation | ✅ Best — library tests independent of CLI tests |
| Build risk | ✅ Acyclic; no forced build order surprises |
| Phase 5 fit | ✅ Best — cloud code imports `@akubly/runtime` directly, no CLI bloat |
| Deployment | ⚠️ Two packages, but monorepo workspace versioning handles coordination |

### R3: Inject Forge into Cairn Hooks (No New Package)

Modify `cairn/src/hooks/sessionStart.ts` and `cairn/src/mcp/server.ts` to accept `PrescriberOrchestrator` port. Cairn gains `@akubly/forge` as a dependency.

**File paths:** `packages/cairn/package.json` adds `@akubly/forge` dep. `packages/cairn/src/hooks/sessionStart.ts` constructs Forge orchestrator.

| Dimension | Assessment |
|-----------|-----------|
| Package clarity | ✅ Minimal surface change |
| Test isolation | ❌ **Critical** — Cairn tests now depend on Forge being available |
| Build risk | ❌ **Critical** — Cairn→Forge dependency creates forced build order; slippery slope toward cycle |
| Phase 5 fit | ❌ **Critical** — Cloud Curator needs different orchestrator; logic locked in Cairn |
| Deployment | ✅ No new packages |

**Both Roger and I agree: do not use R3.** Test coupling and build-order risks are unacceptable.

### R4: New Specialist `@akubly/curator` Package

Extract Curator orchestration into a dedicated package that imports both Cairn data layer and Forge prescribers.

**File paths:** `packages/curator/src/index.ts` (composition), `packages/curator/package.json`.

| Dimension | Assessment |
|-----------|-----------|
| Package clarity | ✅ Crystal clear semantics — "Curator" is the orchestrator |
| Test isolation | ✅ Best — Curator tests isolated from both Cairn and Forge |
| Build risk | ✅ Acyclic leaf node |
| Phase 5 fit | ✅ Excellent — cloud variant can extend or replace |
| Deployment | ⚠️ Three packages to coordinate |
| Scope clarity | ⚠️ Risk of scope creep — what else belongs in `@akubly/curator`? |

### R5: Runtime Module Pattern (Singleton)

Self-initializing singleton on first import. **Not recommended.** Hidden initialization makes testing and composition opaque.

---

## Decision

**Recommended: R2** — New `@akubly/runtime` library package + thin `@akubly/runtime-cli`.

### Rationale

1. **Convergence.** Roger recommends R2 (his Option B). Alexander recommends something close (his Option A = new runtime package). Both agree the composition logic should live in a dedicated library, not inside Cairn or as CLI-coupled code. R2 captures this consensus.

2. **Phase 5 alignment.** Cloud Curator needs to import composition logic without CLI assumptions. R2 gives `@akubly/runtime` as a clean, portable library target. R4 (`@akubly/curator`) would also achieve this, but introduces a naming decision (is "Curator" a package or a pattern?) and scope-boundary questions that R2 avoids.

3. **Minimal disruption.** `packages/runtime-cli/` already exists and works. R2 extracts its library core into `packages/runtime/` and leaves the CLI as a thin wrapper. No rename, no rewriting — surgical extraction.

4. **Test isolation.** R2 scores best: library tests and CLI tests live in separate packages. R1 (monolith) couples them. R3 (inject into Cairn) is worst.

5. **Why not R4?** R4 is architecturally sound but premature. It makes a strong claim ("Curator is a first-class package") that may not survive Phase 5 redesign. R2 makes a weaker, more durable claim ("there's a composition library"). If R4 proves right later, `@akubly/runtime` can be renamed or split — the cost of R2→R4 migration is low.

### What Changes

- **New package:** `packages/runtime/` — library composition root.
  - Exports: `createPrescriberOrchestrationConfig()`, `runForgePrescribe()`, `registerPrescriberTools()`
  - Deps: `@akubly/cairn`, `@akubly/forge`, `@akubly/types`
  - No CLI, no bin entry
- **Modified package:** `packages/runtime-cli/` — becomes thin wrapper.
  - Deps: adds `@akubly/runtime`
  - `src/index.ts` delegates to `@akubly/runtime` exports
  - CLI surface unchanged (`npx forge-prescribe --skill <id>`)
- **Modified:** `packages/cairn/src/agents/curator.ts` — `curate()` gains optional `PrescriberOrchestrationConfig` parameter
- **Modified:** `packages/cairn/src/mcp/server.ts` — imports `registerPrescriberTools` from `@akubly/runtime` (or Cairn server delegates to runtime)
- **Modified:** `packages/cairn/src/hooks/sessionStart.ts` — optionally receives orchestration config from runtime
- **Build pipeline:** No forced build-order changes. `runtime` depends on both Cairn and Forge (leaf node).

---

## Consequences

### Positive
- Clean package roles survive team turnover — library vs. CLI intent is obvious
- Phase 5 cloud wiring has a clear import target (`@akubly/runtime`)
- Existing Wave 2 CLI continues working with no user-facing changes
- MCP tool registration has a natural home (`runtime/src/mcp-prescriber.ts`)

### Negative
- One additional package to maintain (minor — monorepo workspace handles versioning)
- Cairn's MCP server or hooks must import from `@akubly/runtime` for prescriber tool registration — this creates a Cairn→runtime→Forge indirect path (not a cycle, but new dependency edge)

### Neutral
- `runtime-cli` test suite shrinks (delegates to runtime library)
- No schema migrations required

---

## Open Questions for Aaron

1. **Package naming:** `@akubly/runtime` is the working name. Is "runtime" too generic? Alternatives: `@akubly/compose`, `@akubly/orchestrator`. Roger flagged "runtime" as potentially confusing with Phase 4.5's informal use of the word. Recommendation: keep `runtime` — it's accurate (this IS where both runtimes compose) and short.

2. **MCP server topology:** Should `run_prescriber_optimization` register in Cairn's existing MCP server (via import from `@akubly/runtime`), or should `@akubly/runtime` host its own MCP server? Recommendation: register in Cairn's server — operators already connect to one MCP server, and adding a second creates discovery/UX burden.

3. **Migration timing:** Should we extract runtime library immediately (before other Wave 3 work), or scaffold incrementally as work items land? Recommendation: extract first (W3-1) — it unblocks all downstream work.
