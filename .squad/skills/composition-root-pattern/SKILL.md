# Composition Root Pattern

**Pattern Name:** Composition Root (Explicit Boundary Crossing)
**Context:** Multi-package system where two packages must collaborate but must remain decoupled for clarity and testability.
**Problem:** How to import two packages in the same runtime without creating direct coupling, build-order issues, or test isolation problems.
**Solution:** Create an explicit composition root package (or module) whose only job is to import both and wire them together.

---

## Core Insight

In an acyclic, layered architecture, dependencies flow in one direction:
```
Cairn (knowledge base) ← Runtime (composition) → Forge (prescribers)
```

The **composition root is the only place allowed to import both packages.** This preserves the acyclic boundary:
- Cairn has zero Forge dependency.
- Forge has zero Cairn dependency.
- Composition lives in a third location.

When a consumer (e.g., Curator hook, MCP server) needs both packages, it imports the **composition root**, not Cairn+Forge directly.

---

## Trade-off Matrix: Where to Put the Composition Root

| Option | Location | Test Isolation | Phase 5 Extensibility | Build Risk | Complexity |
|--------|----------|-----------------|----------------------|------------|-----------|
| **Promote CLI** | CLI package expands to library | ⚠️ Mixed | ⚠️ Baggage | ✅ None | ✅ Low |
| **Separate runtime pkg** | New `@akubly/runtime` | ✅ Best | ✅ Clean | ✅ None | ⚠️ Two packages |
| **Inject into hook** | Consumer (e.g., Cairn) | ❌ Coupled | ❌ Not portable | ❌ Build order | ⚠️ Hidden |
| **New curator pkg** | Dedicated `@akubly/curator` | ✅ Best | ✅ Excellent | ⚠️ Three-pkg sync | ⚠️ Medium |

**Recommended:** Separate `@akubly/runtime` package. Cleanest role, best test isolation, zero build risks.

---

## Wave 3 Concrete Variant: Function Injection via Port Interface

When one package accepts external functionality, use **port injection** without the other package importing. This allows composition root to wire implementations.

**Pattern (Curator + Prescriber case):**

```typescript
// cairn/src/agents/curator.ts
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) => Promise<PrescriberRunResult>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}

export function curate(
  changeVectorConfig?: ChangeVectorConfig,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,  // Port injection
): CurateResult {
  // Curator does NOT import Forge
  // It calls the injected function when orchestrator is provided
}

// composition-root/src/curator-orchestrator.ts (location TBD by ADR)
import { curate } from '@akubly/cairn';
import { runForgePrescribers } from '@akubly/forge';

const orchestrator: PrescriberOrchestrationConfig = {
  runForSkill: async (skillId, minSessions) => {
    // Composition root wires both packages
    const profile = getExecutionProfile(skillId, 'per-skill', 'global');
    const provider = new SqliteChangeVectorProvider(getDb());
    const hints = await runForgePrescribers(profile, skillId, { provider });
    // ... dedup and persist ...
    return { skillId, hintsGenerated: hints.length, ... };
  },
};

// Curator calls port (doesn't know about Forge)
curate({ minSessionsObserved: 3 }, orchestrator);
```

**Why this pattern:**
- ✅ Cairn imports zero Forge code
- ✅ Forge has zero Cairn dependency
- ✅ Composition root is the only place importing both
- ✅ Orchestrator is a plain function, not a class (lightweight, testable)
- ✅ Curator can be tested with a mock orchestrator (no Forge needed)

**Anti-pattern: Direct coupling**

❌ **Wrong:** Modify Cairn to import Forge directly.
```typescript
import { runForgePrescribers } from '@akubly/forge';  // ❌ Cairn now depends on Forge

export function curate(config?: CurateConfig) {
  // ❌ Build-order risk, test coupling, can't reuse logic
  const hints = await runForgePrescribers(...);
}
```

✅ **Right:** Use port injection (above example).

---

## Implementation Checklist

- [ ] **Define package role clearly:** "This package composes Cairn + Forge for orchestration."
- [ ] **Acyclic dependency diagram:** Verify the graph is acyclic before implementing.
- [ ] **Boundary test:** Write a test that verifies Cairn builds without Forge (mock check).
- [ ] **Build order verification:** Document which packages must build first (if any).
- [ ] **Reusability:** Can the composition logic be imported by a third consumer (Cloud Curator, MCP server, etc.)? If not, rethink the boundary.

### Monorepo Scaffold Recipe (learned in W3-1)

1. Create a leaf workspace package with `package.json`, composite `tsconfig.json`, `src/index.ts`, and `src/__tests__/`.
2. Match repo build conventions: `build: tsc`, `test: vitest run`, `include: ["src"]`, `exclude: ["node_modules", "dist", "src/__tests__"]`, and project references to upstream packages.
3. Add the new package to the root TypeScript project references. If the repo already uses a broad workspace glob like `packages/*`, a separate root workspaces edit is unnecessary.
4. Add a smoke test that imports the package by its published name (not a relative path) so package wiring is verified early.
5. Run `npm install` after scaffolding so the workspace is linked into `package-lock.json` before root build/test verification.
6. If local npm rejects `workspace:*`, fall back to the repo's established `"*"` internal dependency specifier pattern and document the reason.

### Thin Wrapper Follow-through (learned in W3-2)

7. Once the composition function exists in the new runtime package, make the old CLI surface a **pure facade**: keep arg parsing / console formatting in the bin layer, and turn the package-level orchestration export into a direct re-export from the composition library.
8. Preserve operator behavior by reusing the old result contract verbatim in the library first, then swapping the CLI package to import/re-export it. This avoids accidental exit-code or output drift during boundary moves.
9. Add one explicit delegation test at the thin package boundary (identity or spy-based) so future contributors can't quietly re-inline composition logic into the CLI.
10. In this repo, package-name imports inside tests resolve via the built workspace `dist/` export. Rebuild before test runs whenever the delegated library implementation changes.
11. When a second consumer (for example Curator after a CLI-first rollout) needs the same composition flow, extract a shared per-skill helper that owns provider creation, Forge invocation, and dedup/persistence. Keep consumer-specific profile selection and result-shaping in thin adapters so the composition body does not drift across entry points.
12. **Never re-import the composition root into a leaf package.** If Cairn needs behavior that only `@akubly/skillsmith-runtime` can assemble, inject a port (or a tiny factory) into the Cairn hook and move the always-on bootstrap script to the runtime package. Reaching back from Cairn into the runtime package recreates the cycle the composition root was meant to remove.

---

## Related Patterns

- **Port-Based Injection:** When one package needs to accept external implementations, use a port interface (e.g., `ChangeVectorProvider`). Package doesn't import the other package; consumer injects implementation.
- **Facade Pattern:** Composition root often acts as a facade: it hides both Cairn and Forge behind a simpler API.

---

## References

- **ADR:** `decision inbox drop alexander-wave3-composition-adr-input.md` (Wave 3 Composition Root ADR input from Alexander)
- **Integration Analysis:** `.squad/agents/alexander/wave3-integration-analysis.md` (Curator + MCP wiring surface)
- **Precedent:** `@akubly/runtime-cli` (Wave 2 stepping stone). Demonstrates the pattern at CLI scale.

---

## Wave 3 Updates (2026-05-22)

Alexander's Wave 3 integration analysis identified **four concrete options** for composition root location:

| Option | Location | MCP Hosting | Packaging | Use Case |
|--------|----------|-----------|-----------|----------|
| **A** | New `@akubly/runtime` package | Runtime hosts MCP server | Three packages: cairn, forge, runtime | Recommended: cleanest boundary, room for Phase 5 cloud runtime |
| **B** | Optional Forge import in Cairn MCP | Cairn's MCP server (conditional) | Two packages: cairn (w/ optional forge), forge | Simpler but couples Cairn to Forge build cost |
| **C** | Extend `@akubly/runtime-cli` to dual-mode | CLI package becomes MCP server | Three packages: cairn, forge, runtime-cli (expanded) | Unified server; runtime-cli less specialized |
| **D** | New specialist `@akubly/prescriber-optimizer` | Thin package exports helpers | Four packages: cairn, forge, runtime-cli, prescriber-optimizer | Allows Cairn/Forge independence; optional wiring |

**Function injection pattern (Wave 3 concrete variant):** Curator accepts `PrescriberOrchestrationConfig` (function port). Composition root constructs and passes it. Preserves acyclic boundary.

---

## Lessons from this Project

1. **Acyclic architecture is a feature, not an accident.** Preserve it intentionally.
2. **Test isolation is worth the extra package.** Two small, focused packages beat one tangled package.
3. **Composition roots can grow.** Separate composition from consumers so new consumers can reuse the root.
4. **Build order matters.** If not enforced, silent failures follow.

---

*Skill created 2026-05-23 by Roger (Platform Dev) during Wave 3 composition root audit.*
