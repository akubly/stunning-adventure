# Cross-Package Type Promotion

**Pattern Name:** Cross-Package Type Promotion  
**Context:** Multiple packages need the same semantic contract, but one implementation package currently appears to "own" the shape.  
**Problem:** Reusing the shape by importing from the implementation package creates boundary inversion and drift pressure.  
**Solution:** Promote the shared contract into `@akubly/types` (or reuse it there if already canonical), then have implementation packages adapt or re-export as needed.

---

## Core Insight

A data shape that crosses package boundaries is a **contract**, not an implementation detail. The contract should live in the neutral shared-types package, while DB row types and write-model helpers stay local to implementation packages.

```text
Implementation row/input types stay local
            ↓ adapt
Canonical shared contract lives in @akubly/types
            ↑ import
Consumers depend on the canonical contract, not on each other
```

---

## Decision Rule

Before adding a new shared type, ask:

1. **Is the shape already canonical in `@akubly/types`?** Reuse it there; do not duplicate it.
2. **Is the current source package an implementation package (`cairn`, `forge`, etc.)?** If yes, avoid importing that type into another package unless it is explicitly a local adapter type.
3. **Do consumers need the exact same semantics?** If yes, promote the contract; if not, keep local adapter types and map at the boundary.
4. **Does the loader/caller behavior already constrain sync vs async?** Match today's real integration surface unless there is a concrete need to widen it now.

---

## Worked Example (Wave 3 W3-3)

`PrescriberOrchestrationConfig.loadProfile` needed to return an `ExecutionProfile`.

- Bad options:
  - Import a profile row type from Cairn into `@akubly/types` ❌ boundary inversion
  - Re-declare a structural clone in `@akubly/types` ❌ drift risk
  - Introduce a generic without real variability ❌ unnecessary abstraction
- Correct option:
  - Reuse the existing canonical `ExecutionProfile` already defined in `packages/types/src/index.ts` ✅

Result:

```ts
export interface PrescriberOrchestrationConfig {
  runForSkill: (skillId: string, minSessions: number) => Promise<PrescriberRunResult>;
  loadProfile?: (skillId: string) => ExecutionProfile | null;
}
```

---

## Checklist

- [ ] Search `@akubly/types` first before inventing a new shared contract.
- [ ] Distinguish canonical contracts from DB row/upsert/input helper types.
- [ ] Preserve acyclic package boundaries.
- [ ] Prefer reuse over structural duplication.
- [ ] Match sync/async to the real current loader surface.
- [ ] Re-export from implementation packages only when backward compatibility requires it.

---

## References

- `packages/types/src/index.ts`
- `packages/cairn/src/db/executionProfiles.ts`
- `.squad/decisions/inbox/alexander-w3-3-executionprofile-contract-placement.md`

---

*Skill created 2026-05-23 by Alexander during Wave 3 W3-3.*
