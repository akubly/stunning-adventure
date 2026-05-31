# ADR-0001: Composition Root for Cairn + Forge Runtime

**Status:** Accepted — 2026-05-23 by Aaron  
**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-23  
**CTD Anchor:** N/A — pre-Crucible Wave 3 composition-root decision
**Supersedes:** Wave 2 ad-hoc CLI composition (`packages/runtime-cli/`)

---

## Context

Wave 2 shipped `@akubly/runtime-cli` as a deliberate stepping stone: the only file that imports both `@akubly/cairn` and `@akubly/forge`. It works for manual CLI invocation (`npx forge-prescribe --skill <id>`), but Wave 3 requires three capabilities that demand a real composition root:

1. **Curator integration** — `curate()` needs an injected `PrescriberOrchestrationConfig` so prescribers run automatically after vector sweeps.
2. **Phase 5 portability** — Cloud Curator will need the same composition logic without CLI or local SQLite assumptions.
3. **MCP tool exposure** (deferred from Wave 3) — Future `run_prescriber_optimization` tool will need a composition root that can import both packages.

Today's composition roots (Cairn hooks, Cairn MCP server, Forge client) are single-package entry points. None imports both. The question: **where does the runtime that composes both packages live?**

---

## Option Label Reconciliation

Roger's audit and Alexander's analysis used overlapping but inconsistent option labels. This ADR uses a canonical set (R1–R5) with a mapping table.

| ADR Label | Roger's Label | Alexander's Label | Description |
|-----------|--------------|-------------------|-------------|
| **R1** | Option A | Option C | Promote `runtime-cli` → general `@akubly/runtime` (CLI + library in one package) |
| **R2** | Option B | Option A (≈) | New `@akubly/skillsmith-runtime` library package + keep `@akubly/runtime-cli` as thin CLI wrapper |
| **R3** | Option C | Option B | Inject Forge into Cairn hooks (no new package; Cairn gains Forge dependency) |
| **R4** | Option D | Option D (≈) | New specialist package (`@akubly/curator` or `@akubly/prescriber-optimizer`) |
| **R5** | Option E | — | Runtime module pattern (singleton auto-init). Not recommended by Roger. |

Note: Roger's Option B and Alexander's Option A both converge on "new library package" but differ in whether `runtime-cli` stays separate (Roger) or is absorbed (Alexander). R2 captures the consensus shape with explicit CLI separation. Aaron approved R2 with the domain-specific name `@akubly/skillsmith-runtime`.

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

### R2: New `@akubly/skillsmith-runtime` Library + Thin `@akubly/runtime-cli` (Accepted)

Create `packages/skillsmith-runtime/` as a composition library (no CLI, no bin entry). Keep `packages/runtime-cli/` as a thin CLI wrapper that delegates to `@akubly/skillsmith-runtime`.

**File paths:**
- `packages/skillsmith-runtime/src/index.ts` — composition exports (`runForgePrescribe`, `createPrescriberOrchestrationConfig`)
- `packages/skillsmith-runtime/src/orchestrator.ts` — `PrescriberOrchestrationConfig` factory
- `packages/runtime-cli/src/cli.ts` — thin CLI (imports `@akubly/skillsmith-runtime`)

**Dependency graph:**
```
@akubly/types
  ↑
  ├─ @akubly/forge
  ├─ @akubly/cairn
  └─ @akubly/skillsmith-runtime ← imports both Cairn + Forge
       ↑
       └─ @akubly/runtime-cli ← thin CLI wrapper
```

| Dimension | Assessment |
|-----------|-----------|
| Package clarity | ✅ Clear roles — library vs. CLI are separate concerns |
| Test isolation | ✅ Best — library tests independent of CLI tests |
| Build risk | ✅ Acyclic; no forced build order surprises |
| Phase 5 fit | ✅ Best — cloud code imports `@akubly/skillsmith-runtime` directly, no CLI bloat |
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

**Accepted: R2** — New `@akubly/skillsmith-runtime` library package + thin `@akubly/runtime-cli`.

Aaron approved R2 on 2026-05-23 with one modification: the package name `@akubly/skillsmith-runtime` instead of the proposed `@akubly/runtime`. Rationale: domain-specific name fits the cairn/forge construction metaphor, tells operators what the package operates on (skills), and avoids confusion with Phase 4.5's informal "runtime" usage.

Aaron also decided to **drop MCP tool exposure from Wave 3 scope entirely**. No `run_prescriber_optimization` MCP tool ships in this wave. The Curator hook handles the automatic path; the existing `forge-prescribe` CLI handles manual invocation. MCP can be re-opened in a later wave when a concrete operator need surfaces.

### Rationale

1. **Convergence.** Roger recommends R2 (his Option B). Alexander recommends something close (his Option A = new runtime package). Both agree the composition logic should live in a dedicated library, not inside Cairn or as CLI-coupled code. R2 captures this consensus.

2. **Phase 5 alignment.** Cloud Curator needs to import composition logic without CLI assumptions. R2 gives `@akubly/skillsmith-runtime` as a clean, portable library target. R4 (`@akubly/curator`) would also achieve this, but introduces a naming decision (is "Curator" a package or a pattern?) and scope-boundary questions that R2 avoids.

3. **Minimal disruption.** `packages/runtime-cli/` already exists and works. R2 extracts its library core into `packages/skillsmith-runtime/` and leaves the CLI as a thin wrapper. No rename, no rewriting — surgical extraction.

4. **Test isolation.** R2 scores best: library tests and CLI tests live in separate packages. R1 (monolith) couples them. R3 (inject into Cairn) is worst.

5. **Why not R4?** R4 is architecturally sound but premature. It makes a strong claim ("Curator is a first-class package") that may not survive Phase 5 redesign. R2 makes a weaker, more durable claim ("there's a composition library"). If R4 proves right later, `@akubly/skillsmith-runtime` can be renamed or split — the cost of R2→R4 migration is low.

### What Changes

- **New package:** `packages/skillsmith-runtime/` — library composition root.
  - Exports: `createPrescriberOrchestrationConfig()`, `runForgePrescribe()`
  - Deps: `@akubly/cairn`, `@akubly/forge`, `@akubly/types`
  - No CLI, no bin entry, no MCP server (MCP deferred from Wave 3)
- **Modified package:** `packages/runtime-cli/` — becomes thin wrapper.
  - Deps: adds `@akubly/skillsmith-runtime`
  - `src/index.ts` delegates to `@akubly/skillsmith-runtime` exports
  - CLI surface unchanged (`npx forge-prescribe --skill <id>`)
- **Modified:** `packages/cairn/src/agents/curator.ts` — `curate()` gains optional `PrescriberOrchestrationConfig` parameter
- **Modified:** `packages/cairn/src/mcp/server.ts` — No changes in Wave 3 (MCP tool exposure deferred)
- **Modified:** `packages/cairn/src/hooks/sessionStart.ts` — receives orchestration config from `@akubly/skillsmith-runtime` (always-on)
- **Build pipeline:** No forced build-order changes. `skillsmith-runtime` depends on both Cairn and Forge (leaf node).

---

## Consequences

### Positive
- Clean package roles survive team turnover — library vs. CLI intent is obvious
- Domain-specific name (`skillsmith-runtime`) communicates intent better than generic `runtime`
- Phase 5 cloud wiring has a clear import target (`@akubly/skillsmith-runtime`)
- Existing Wave 2 CLI continues working with no user-facing changes

### Negative
- One additional package to maintain (minor — monorepo workspace handles versioning)
- Cairn's hooks must import from `@akubly/skillsmith-runtime` for orchestration config — this creates a Cairn→skillsmith-runtime→Forge indirect path (not a cycle, but new dependency edge)

### Neutral
- `runtime-cli` test suite shrinks (delegates to skillsmith-runtime library)
- No schema migrations required
- MCP tool exposure deferred — no `run_prescriber_optimization` in Wave 3; re-evaluate in later wave

---

## Acceptance Signals

- `@akubly/skillsmith-runtime` exposes the composition API used by both automatic Curator orchestration and the thin runtime CLI wrapper.
- Cairn and Forge remain independently buildable packages; neither package imports the other directly.
- The existing `forge-prescribe` CLI surface continues to work while delegating orchestration to `@akubly/skillsmith-runtime`.
- Curator integration tests can inject a `PrescriberOrchestrationConfig` and observe Forge prescribers run after vector sweeps.
- Dependency graph checks show `@akubly/skillsmith-runtime` is a leaf composition package and does not introduce a Cairn↔Forge cycle.

---

## Security Implications

- The composition root does not add new privilege by itself; it centralizes calls into Cairn and Forge behind an explicit package boundary.
- Keeping MCP exposure out of Wave 3 avoids adding a new remote tool surface before an operator need and permission model are defined.
- The main security risk is accidental expansion of the runtime package into a privileged grab bag; keeping CLI, library composition, and future MCP exposure separated preserves auditable boundaries.

---

## Resolved Questions

All open questions resolved by Aaron on 2026-05-23:

1. **Package naming:** Aaron chose `@akubly/skillsmith-runtime` — domain-specific name that fits the cairn/forge construction metaphor and tells operators what the package operates on (skills). Generic `@akubly/runtime` rejected.

2. **MCP server topology:** Aaron dropped MCP tool exposure from Wave 3 entirely. No net-new MCP capability vs. existing `forge-prescribe` CLI. Curator hook handles the auto path. MCP re-opens in a later wave when a concrete operator need surfaces.

3. **Migration timing:** Extract runtime library first (W3-1) — it unblocks all downstream work. Accepted as proposed.
