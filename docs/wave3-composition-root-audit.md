# Wave 3 Composition Root Audit
**Prepared by:** Roger Wilco, Platform Dev  
**Date:** 2026-05-23  
**For:** ADR input to Graham Knight + Wave 3 scope planning

---

## Executive Summary

Wave 2 shipped `@akubly/runtime-cli` as a temporary CLI-only composition root. Wave 3 needs to formalize the architecture that imports both `@akubly/cairn` (knowledge base + Curator) and `@akubly/forge` (prescribers) so the Curator can orchestrate Forge prescribers autonomously.

Five options evaluated below. **Recommendation: Option B** (new dedicated `@akubly/runtime` package + keep CLI thin) with a secondary fallback to **Option C** (inject Forge into Cairn hooks if we want to minimize packages).

---

## 1. Current Composition Map

### Where Cairn Gets Bootstrapped Today

| Location | Entry Point | Imports | Exposes | Called From |
|----------|------------|---------|---------|------------|
| `packages/cairn/src/hooks/sessionStart.ts:60` | `runSessionStart()` | Cairn only (no Forge) | Session lifecycle + `curate()` + `prescribe()` | Copilot SDK `preToolUse` hook |
| `packages/cairn/src/mcp/server.ts:327` | `server.registerTool('run_curate', ...)` | Cairn only (no Forge) | MCP tool wrapper around `curate()` + `prescribe()` | MCP host (stdio) |
| `packages/cairn/bin/cli.js` | CLI entry | Cairn only | Session query + manual Curator trigger | Terminal via `npx cairn` |

**Key observation:** Both existing Cairn composition roots are Cairn-only. Neither receives Forge.

### Where Forge Gets Bootstrapped Today

| Location | Entry Point | Imports | Exposes | Called From |
|----------|------------|---------|---------|------------|
| `packages/forge/src/runtime/client.ts` | `ForgeClient` class | Forge only (no Cairn) | Instrumentation wrapper around SDK CopilotClient | Forge hook composition in SDK |

**Key observation:** Forge is never directly bootstrapped by developers—it's injected via SDK lifecycle hooks.

### Where Both Get Composed Today

| Location | Entry Point | Imports | Exposes | Called From |
|----------|------------|---------|---------|------------|
| `packages/runtime-cli/src/index.ts:116` | `runForgePrescribe()` | **Both Cairn + Forge** | Library export + orchestration result | CLI (`packages/runtime-cli/src/cli.ts`) |
| `packages/runtime-cli/src/cli.ts` | `main()` | Both (via index.ts) | Bin entry `forge-prescribe` | Terminal via `npx forge-prescribe --skill <id>` |
| Root `package.json` | (none) | @akubly/runtime-cli as dev dep | Bin link in workspace toolchain | Dev workflow |

**Key observation:** `@akubly/runtime-cli` is the **only place today** where both packages are imported. It's Wave 2's stepping stone for manual CLI invocation.

---

## 2. Dependency Edges & Boundaries

### Dependency Graph (Acyclic)

```
@akubly/types (no dependencies)
  ↑
  ├─ @akubly/forge
  │  └─ @github/copilot-sdk
  │
  ├─ @akubly/cairn
  │  ├─ @akubly/types
  │  ├─ @github/copilot-sdk
  │  ├─ @modelcontextprotocol/sdk
  │  └─ better-sqlite3
  │
  └─ @akubly/runtime-cli
     ├─ @akubly/cairn ← imports Cairn functions + types
     ├─ @akubly/forge ← imports Forge functions + types
     └─ @akubly/types

Root workspace
  └─ @akubly/runtime-cli (dev dep only)
```

### Boundaries Assessment

| Edge | Status | Notes |
|------|--------|-------|
| Cairn → Forge | ✅ **Clean** | Cairn has **zero** Forge dependency. `curate()` is unaware Forge exists. |
| Forge → Cairn | ✅ **Clean** | Forge has **zero** Cairn dependency. Prescribers are pure functions. |
| Both → types | ✅ **Clean** | Shared contract layer; no cycles. |
| runtime-cli → Both | ✅ **Legal** (for now) | Explicit composition root. Package boundaries preserved. |
| Hooks/MCP → runtime-cli | ❌ **Absent** | sessionStart.ts and mcp/server.ts **cannot** import runtime-cli (would create Cairn→runtime-cli→Forge cycle). |

**Key risk:** The boundary that **must** stay clean is Cairn→Forge direction. If Cairn ever needs Forge semantics (e.g., prescriber results), it must go through a port (like `ChangeVectorProvider`), not a direct import.

---

## 3. Candidate Composition Root Options

### Option A: Promote `@akubly/runtime-cli` to General `@akubly/runtime`

**Shape:** Rename `packages/runtime-cli` → `packages/runtime`. Expand exports to include both CLI surface and library composition hooks.

**Concrete example:**
```typescript
// packages/runtime/src/index.ts (library exports)
export async function runForgePrescribe(options) { /* existing */ }
export function createCuratorWithForge(config) {
  // Returns a Curator-like object that knows how to call Forge
  // Consumed by: sessionStart.ts hooks via injection
}

// packages/runtime/src/cli.ts (CLI stays thin)
export async function main() { /* existing */ }

// packages/runtime/src/mcp-presriber.ts (NEW - MCP exposure)
export function registerPrescriberTools(server: McpServer) {
  server.registerTool('run_prescriber_optimization', {/* ... */})
}

// package.json
{
  "name": "@akubly/runtime",
  "bin": { "forge-prescribe": "dist/cli.js" },
  "main": "dist/index.js"
}
```

**Invocation:**
```typescript
// In sessionStart.ts (modified to accept composition)
import { createCuratorWithForge } from '@akubly/runtime';
// Pass Forge composer into hook
const curatorWithForge = createCuratorWithForge({ dbPath });
curatorWithForge.curate(); // Now calls Forge prescribers if vectors exist
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| **Package clarity** | ⚠️ **Mixed signals.** Name "runtime" is generic. Unclear whether this is a runtime *library* or runtime *bootstrap*. Readers must check exports to understand scope. |
| **Deployment shape** | ✅ **Simple.** Single package handles both CLI and library composition. No coordination across packages. |
| **Test isolation** | ⚠️ **Coupled.** CLI tests live in same package as library tests. Risk: someone changes library export structure and breaks CLI without noticing. |
| **Cairn hook integration** | ⚠️ **Awkward.** sessionStart.ts must import from runtime (circular looking: Cairn → runtime → Cairn). Not technically a cycle (runtime is separate), but confusing. |
| **MCP tool registration** | ✅ **Possible.** MCP server can import runtime and call `registerPrescriberTools()`. |
| **Build/release** | ✅ **No new burden.** Single package to coordinate. |

**Risks:**
- Package name doesn't communicate intent (is it a library? a runtime? a bootstrap tool?).
- Temptation to add more "runtime" concerns (Phase 5 cloud wiring, profile loader, etc.) into this grab bag.
- CLI tests may be overlooked because they live with library tests.

---

### Option B: New Dedicated `@akubly/runtime` + Keep `runtime-cli` Thin

**Shape:** Create new `packages/runtime/` as the composition library. Keep `packages/runtime-cli/` as a thin CLI wrapper that imports `@akubly/runtime` and calls `runForgePrescribe()`.

**Concrete example:**
```typescript
// packages/runtime/src/index.ts (composition library, no CLI)
export async function runForgePrescribe(options) { /* pure composition */ }
export async function runCuratorWithForge(config) {
  // Integrates Curator + Forge prescriber orchestration
  // Used by: sessionStart.ts, MCP server, Curator
}
export function createPrescriberOrchestrator() {
  // Port implementation for Curator injection
}

// packages/runtime/package.json (library only)
{
  "name": "@akubly/runtime",
  "main": "dist/index.js",
  // NO bin entry
}

// packages/runtime-cli/src/index.ts (delegating thin wrapper)
import { runForgePrescribe } from '@akubly/runtime';
export { type ForgePrescribeResult } from '@akubly/runtime';
export async function runForgePrescribe(options) {
  return import('@akubly/runtime').then(m => m.runForgePrescribe(options));
}

// packages/runtime-cli/package.json (thin CLI only)
{
  "name": "@akubly/runtime-cli",
  "main": "dist/index.js",
  "bin": { "forge-prescribe": "dist/cli.js" },
  "dependencies": {
    "@akubly/runtime": "*",
    "@akubly/types": "*"
  }
}
```

**Invocation:**
```typescript
// In sessionStart.ts (modified for composition)
import { runCuratorWithForge } from '@akubly/runtime';
// Compose the two packages at this hook
runCuratorWithForge({ db, skillId });

// In cli.ts (stays thin)
import { runForgePrescribe } from '@akubly/runtime';
const result = await runForgePrescribe({ skillId });
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| **Package clarity** | ✅ **Clear roles.** `@akubly/runtime` = library composition. `@akubly/runtime-cli` = CLI only. Intent is obvious. |
| **Deployment shape** | ⚠️ **Two packages.** CLI depends on runtime. Adds one layer. |
| **Test isolation** | ✅ **Clean separation.** Runtime library tests are separate from CLI tests. CLI tests can't accidentally break library. |
| **Cairn hook integration** | ✅ **Natural.** sessionStart.ts imports `@akubly/runtime` directly. No circular appearance. |
| **MCP tool registration** | ✅ **Straightforward.** MCP server imports `@akubly/runtime` and registers tools. |
| **Build/release** | ✅ **Coordinated.** Two packages to coordinate, but clear dependency (CLI → runtime). |
| **Future extensibility** | ✅ **Safe.** Phase 5 cloud wiring can extend `@akubly/runtime` without polluting CLI. |

**Risks:**
- Two packages to maintain (minor).
- Slight build complexity (CLI depends on runtime library).

---

### Option C: Inject Forge Into Cairn Hooks (No New Package)

**Shape:** Modify `sessionStart.ts` and `mcp/server.ts` to accept an optional `PrescriberOrchestrator` port (like `ChangeVectorProvider`). When provided, run prescribers after curator. No new package needed.

**Concrete example:**
```typescript
// packages/types/src/index.ts (add port)
export interface PrescriberOrchestrator {
  run(skillId: string, profile: ExecutionProfile): Promise<OptimizationHint[]>;
}

// packages/cairn/src/agents/curator.ts (modified)
export interface CurateConfig {
  changeVectorConfig?: ChangeVectorConfig;
  prescriberOrchestrator?: PrescriberOrchestrator;  // NEW
}

export function curate(config?: CurateConfig): CurateResult {
  // ... existing curator logic ...
  
  // NEW: If orchestrator provided and vectors changed, run prescribers
  if (config?.prescriberOrchestrator && result.insightsChanged) {
    for (const skill of result.skillsWithVectors) {
      const profile = getExecutionProfile(skill);
      if (profile) {
        const hints = await config.prescriberOrchestrator.run(skill, profile);
        for (const hint of hints) {
          insertHintIfNew(db, hint);
        }
      }
    }
  }
  
  return result;
}

// packages/cairn/src/hooks/sessionStart.ts (composition moved here!)
import { curate } from '../agents/curator.js';
import { 
  runForgePrescribers,
  type OptimizationHint,
  type ExecutionProfile
} from '@akubly/forge';

class ForgePrescriberOrchestrator implements PrescriberOrchestrator {
  async run(skillId: string, profile: ExecutionProfile): Promise<OptimizationHint[]> {
    const provider = new SqliteChangeVectorProvider(db);
    return runForgePrescribers(profile, skillId, { provider });
  }
}

export function runSessionStart(repoKey: string) {
  // ... existing logic ...
  
  // NEW: Create Forge orchestrator and pass to Curator
  const orchestrator = new ForgePrescriberOrchestrator();
  const curateResult = curate({ prescriberOrchestrator: orchestrator });
  
  // ... rest of existing logic ...
}

// packages/cairn/package.json (NOW imports Forge)
{
  "dependencies": {
    "@akubly/types": "*",
    "@akubly/forge": "*",  // NEW!
    "@akubly/cairn": "*",
    // ...
  }
}
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| **Package clarity** | ✅ **Minimal new surface.** One port interface in types. Cairn grows a single optional parameter. |
| **Deployment shape** | ✅ **Simplest.** No new packages. Existing Cairn package now imports Forge (runtime-cli can be archived). |
| **Test isolation** | ⚠️ **Risky.** Cairn now imports Forge. Cairn's unit tests must mock Forge. Any Forge breaking change breaks Cairn's build. |
| **Cairn hook integration** | ✅ **Elegant.** Composition happens exactly where it's needed (in the hook). No indirection. |
| **MCP tool registration** | ⚠️ **Awkward.** MCP server in `cairn/src/mcp/server.ts` must create Forge orchestrator and pass config to `curate()`. |
| **Build complexity** | ⚠️ **Increased.** Cairn now has a hard dependency on Forge. Must build Forge before Cairn. |
| **Reusability** | ❌ **Lost.** The Forge orchestrator logic is locked inside Cairn. Can't reuse it elsewhere (e.g., Phase 5 cloud Curator). |
| **Future Phase 5 cloud wiring** | ❌ **Problematic.** Cloud Curator will likely need its own orchestrator (async cloud prescriber calls). Creates two orchestrator implementations. |

**Risks:**
- **Build order dependency:** Forge must build before Cairn. If not enforced, build breaks silently.
- **Test coupling:** Cairn's test suite now depends on mocking Forge. Any Forge refactor requires Cairn test updates.
- **Not portable:** The orchestrator implementation is married to Cairn. Cloud Curator or other runtimes can't reuse it.
- **Circular reasoning:** We're importing Forge into Cairn to avoid a new package, but we're already changing Cairn's API to accept an orchestrator. Might as well have a package for it.

---

### Option D: New `@akubly/curator` Package

**Shape:** Extract Cairn's Curator agent into a new `@akubly/curator` package that imports both Cairn data layer and Forge prescribers. Cairn's hooks + MCP server import `@akubly/curator`.

**Concrete example:**
```typescript
// packages/curator/src/index.ts (pure composition)
import { curate as cairnCurate } from '@akubly/cairn';
import { runForgePrescribers } from '@akubly/forge';
import { SqliteChangeVectorProvider } from '@akubly/cairn';

export async function curateWithForge(repoKey: string) {
  const curateResult = cairnCurate();
  
  if (curateResult.insightsChanged) {
    // For each skill with vectors, run Forge prescribers
    for (const skillId of curateResult.skillsWithVectors) {
      const profile = getExecutionProfile(skillId);
      if (profile) {
        const provider = new SqliteChangeVectorProvider(db);
        const hints = await runForgePrescribers(profile, skillId, { provider });
        // Persist hints (dedup)
        for (const hint of hints) {
          insertHintIfNew(db, hint);
        }
      }
    }
  }
  
  return curateResult;
}

// packages/curator/package.json
{
  "name": "@akubly/curator",
  "dependencies": {
    "@akubly/cairn": "*",
    "@akubly/forge": "*",
    "@akubly/types": "*"
  }
}

// packages/cairn/src/hooks/sessionStart.ts (imports Curator)
import { curateWithForge } from '@akubly/curator';
const result = await curateWithForge(repoKey);
```

**Trade-offs:**

| Aspect | Impact |
|--------|--------|
| **Package clarity** | ✅ **Crystal clear.** `@akubly/curator` owns the integration. No ambiguity about what the package does. |
| **Deployment shape** | ⚠️ **Three packages.** Adds new package specifically for Curator. Cairn becomes lighter. |
| **Test isolation** | ✅ **Best.** Curator tests are isolated. Cairn tests don't know about Forge. |
| **Cairn hook integration** | ✅ **Clean.** sessionStart.ts imports Curator (natural relationship). |
| **MCP tool registration** | ✅ **Straightforward.** MCP server can call curator functions directly. |
| **Reusability** | ✅ **Excellent.** Curator logic is portable. Cloud Curator can extend it. |
| **Build/release** | ⚠️ **Coordination burden.** Three packages to coordinate: Cairn, Forge, Curator. Curator depends on both. |
| **Architectural intent** | ✅ **Explicit.** Separating "orchestrator" (Curator) from "knowledge base" (Cairn) and "prescriber engine" (Forge) is a statement about architecture. |

**Risks:**
- Potential scope creep: What else belongs in `@akubly/curator`? (profiling? hint persistence? profile loading?)
- Build coordination: Curator must build after both Cairn and Forge. Three-package sync required.
- Future unclear: Is Curator a package or a pattern? Are there other "curator" packages for different domains?

---

### Option E: Runtime Module Pattern (MCP-Style)

**Shape:** Create `@akubly/runtime` as a "service module" that registers itself as a bootable singleton. On first import, it self-initializes with both Cairn and Forge. Consumers import and call methods; initialization is implicit.

**Not recommended.** (Hidden initialization makes testing and composition hard to reason about. Singleton global state is a risk.)

---

## 4. Risk Analysis Per Option

### Option A: Promote runtime-cli → @akubly/runtime

**Build Risks:**
- ⚠️ **Name collision:** "runtime" is already used informally (Phase 4.5 calls things "runtime behavior"). Potential confusion.
- ✅ No build order dependencies; packages remain acyclic.

**Test Isolation Risks:**
- ⚠️ CLI tests mixed with library tests. May cause test suite slow-down.
- ⚠️ Risk of tests passing locally but failing in CI due to environment differences.

**Phase 5 Cloud Wiring Risks:**
- ⚠️ Package becomes a dumping ground. Cloud Curator, profile loader, batch orchestrator all pile into "runtime". Hard to untangle later.
- ✅ Cloud code can import `@akubly/runtime` and extend.

**Deployment Risks:**
- ✅ Single package deployed. Simple artifact management.

---

### Option B: Separate @akubly/runtime (lib) + @akubly/runtime-cli (CLI)

**Build Risks:**
- ✅ Clean acyclic graph. CLI → runtime → {Cairn, Forge}.
- ✅ No build order surprises.

**Test Isolation Risks:**
- ✅ **Best.** Library tests isolated from CLI tests. Clear separation.

**Phase 5 Cloud Wiring Risks:**
- ✅ **Best.** Cloud code imports `@akubly/runtime` directly. No CLI baggage.
- ✅ Clear path for extending runtime library.

**Deployment Risks:**
- ⚠️ Two packages to release. Risk: version mismatch if CLI and runtime ship separately.
- ✅ Mitigation: Both kept in monorepo; shared versioning via workspace.

---

### Option C: Inject Forge Into Cairn Hooks (No New Package)

**Build Risks:**
- ❌ **CRITICAL:** Cairn now imports Forge. Build order: Forge → Cairn. If not enforced, silent build failure.
- ❌ Potential for circular dependency if anyone tries to import Cairn types in Forge (slippery slope).

**Test Isolation Risks:**
- ❌ **CRITICAL:** Cairn's test suite now depends on Forge being available. Forge refactor breaks Cairn tests.
- ❌ Hard to test Cairn in isolation.

**Phase 5 Cloud Wiring Risks:**
- ❌ **CRITICAL:** Cloud Curator will need a different orchestrator (async cloud prescriber calls). Creates two incompatible implementations. Code duplication + maintenance nightmare.
- ❌ Orchestrator logic locked in Cairn; can't be reused.

**Semantic Risks:**
- ⚠️ What if Cairn ever needs to reference Forge types in its DB schema or configuration? Forces Forge to be a mandatory, not optional, feature.

---

### Option D: New @akubly/curator Package

**Build Risks:**
- ✅ Acyclic: Forge, Cairn → Curator. Curator is a leaf.
- ⚠️ Three-package build order: Cairn and Forge must build first.

**Test Isolation Risks:**
- ✅ **Best.** Curator tests are independent. Cairn and Forge tests are isolated.

**Phase 5 Cloud Wiring Risks:**
- ✅ **Excellent.** Cloud Curator can extend `@akubly/curator` or replace it with `@akubly/curator-cloud`. Clear extension points.
- ✅ Orchestrator logic is portable and reusable.

**Scope Clarity Risks:**
- ⚠️ What belongs in Curator? Hint persistence? Profile loading? Session batch logic? Risk of scope creep.
- ✅ Mitigation: Clear package charter from the start. Write SCOPE.md.

**Deployment Risks:**
- ✅ Three packages = three deployment units. But monorepo + workspace versioning handles it.

---

## 5. Recommended Approach

**Primary:** **Option B** — Separate `@akubly/runtime` library package + thin `@akubly/runtime-cli` wrapper.

**Rationale:**
1. **Clean package roles:** `@akubly/runtime` = composition library (no CLI concerns). `@akubly/runtime-cli` = CLI only (no library logic).
2. **Best test isolation:** Library and CLI tests live separately.
3. **Phase 5 ready:** Cloud code imports `@akubly/runtime` directly. No CLI bloat.
4. **Zero build risks:** Acyclic dependency graph. No forced build orders.
5. **Extension-friendly:** New consumers (Curator, MCP server, cloud wiring) can import `@akubly/runtime` and use composition helpers.
6. **Reuses Wave 2 CLI:** runtime-cli already works; just becomes a thin wrapper.

**Implementation roadmap:**
1. Create `packages/runtime/src/` with core composition functions (extracted from runtime-cli).
2. Modify `packages/runtime-cli/` to import `@akubly/runtime` and delegate.
3. Update `packages/cairn/src/hooks/sessionStart.ts` to optionally receive `PrescriberOrchestrator` config (or import from runtime for Forge integration).
4. Wave 3: MCP server registers prescriber tools via `@akubly/runtime` exports.

**Secondary fallback:** **Option D** (new `@akubly/curator` package) if team wants to be very explicit about Curator as a separate service layer. Added complexity, but excellent semantic clarity and Phase 5 extensibility.

**Do NOT use:** Option C (inject into Cairn hooks). Test coupling and build-order risks outweigh the "no new package" benefit.

---

## 6. Concrete Import Paths After Wave 3 ADR

If Option B is chosen, Wave 3 enables this:

```typescript
// In packages/cairn/src/hooks/sessionStart.ts
import { runCuratorWithForge } from '@akubly/runtime';

// In packages/cairn/src/mcp/server.ts
import { registerPrescriberTools } from '@akubly/runtime';
server.registerTool('run_prescriber_optimization', ...);

// In packages/curator/ (future Phase 4.7 or 5)
import { runCuratorWithForge } from '@akubly/runtime';
// Extend or wrap as needed

// In Wave 2 CLI (already working)
import { runForgePrescribe } from '@akubly/runtime';
```

All consume a single, portable composition library.

---

## 7. Known Unknowns for Graham's ADR

1. **Profile selection strategy:** Which profiles should Curator run prescribers against? All? Only skills with new vectors? Only per-skill granularity? → Deferred to Wave 3 scope; should be part of the same ADR.

2. **Hint persistence ownership:** Should the composition root handle dedup + persistence, or should that be delegated? Currently runtime-cli does it; should be standardized in the ADR.

3. **MCP tool shape:** Once Curator runs prescribers, what does the MCP tool `run_prescriber_optimization` look like? One-off Forge run, or does it trigger the full Curator pipeline? → Deferred to Wave 3 scope.

4. **Error handling / fail-open policy:** If Forge prescribers fail mid-Curator, should Curator continue (partial success) or abort? Current runtime-cli style is fail-open on individual hint persistence. → Should be codified in ADR.

---

## Appendix: File Paths Reference

**Current composition:**
- CLI: `packages/runtime-cli/src/cli.ts` (bin entry)
- Library: `packages/runtime-cli/src/index.ts`
- Tests: `packages/runtime-cli/src/__tests__/forgePrescribe.test.ts`

**Cairn entry points:**
- Hook: `packages/cairn/src/hooks/sessionStart.ts:60`
- MCP: `packages/cairn/src/mcp/server.ts:327`
- Curator: `packages/cairn/src/agents/curator.ts:68`
- Prescriber: `packages/cairn/src/agents/prescriber.ts:341`

**Forge entry points:**
- Prescriber orchestrator: `packages/forge/src/prescribers/index.ts` (exports `runForgePrescribers`)
- Client wrapper: `packages/forge/src/runtime/client.ts`

**Shared contracts:**
- `packages/types/src/index.ts` (ChangeVectorProvider, OptimizationHint, ExecutionProfile, etc.)

---

*End of audit. Graham: Use this as input for the Wave 3 Composition Root ADR decision. The team is ready to implement once your ADR settles on an option.*
