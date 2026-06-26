# Decision: Test type-check gate

**Author:** Gabriel (Infrastructure)
**Date:** 2026-06-25
**Branch:** eureka/integrate-slice
**Status:** Proposed (inbox)

## Problem

A test helper (`packages/eureka/src/activities/__tests__/integrate-contract.helper.ts`) shipped with broken type-only imports — names that don't exist on the imported module (`FactReader`, `RelationWriter`, `RelationEdge` from `../integrate.js`). **Nothing in CI caught it.**

Root cause: every package `tsconfig.json` excludes `src/**/__tests__` and `src/**/*.test.ts`, so:

- `tsc --build` never sees test files.
- vitest uses esbuild, which strips types without type-checking.
- eslint catches lint issues but not missing-export errors.

So the entire test tree had **zero type coverage** in CI.

## Decision

Add a dedicated **test-inclusive type-check gate** to eureka and wire it into CI, scoped narrowly for now:

1. **`packages/eureka/tsconfig.typecheck.json`** — extends the base tsconfig but:
   - Includes `src`, `src/**/__tests__/**/*`, and `src/**/*.test.ts` (no test exclusion).
   - `noEmit: true`, `composite: false`, `declaration: false`, `rootDir: "."` — so it never emits, never pollutes `dist/`, and never participates in project references (which would otherwise force composite/declaration on tests).
   - `references: []` — type-check is self-contained; we don't want project-reference build semantics here.
2. **`packages/eureka/package.json`** — `typecheck` script now points at the new config: `tsc --noEmit -p tsconfig.typecheck.json` (was bare `tsc --noEmit`, which silently used the base config that excludes tests).
3. **Root** — `typecheck` script already existed (`npm run typecheck --workspaces --if-present`), follows the existing `--workspaces --if-present` convention used by `lint`/`test`/`clean`. No shell globs, Windows-safe.
4. **`.github/workflows/ci.yml`** — added `npm run typecheck` step between `lint` and `build`.

## Proof the gate works

`npm run typecheck -w @akubly/eureka` now fails with exactly the target errors plus other previously-invisible test type bugs:

```
src/activities/__tests__/integrate-contract.helper.ts(83,8): error TS2305: Module '"../integrate.js"' has no exported member 'FactReader'.
src/activities/__tests__/integrate-contract.helper.ts(84,8): error TS2305: Module '"../integrate.js"' has no exported member 'RelationWriter'.
src/activities/__tests__/integrate-contract.helper.ts(85,8): error TS2459: Module '"../integrate.js"' declares 'RelationEdge' locally, but it is not exported.
src/activities/__tests__/integrate-sqlite.contract.test.ts(111,5): error TS2322: Type '() => BetterSqlite3.Database' is not assignable to type '() => void | Promise<void>'.
src/storage/__tests__/fact-reader-contract.helper.ts(228,23): error TS2345: Argument of type 'string' is not assignable to parameter of type 'FactId'.
...
```

The original three target errors (TS2305/TS2305/TS2459) are caught — that's the proof.

## Expected red

This branch will stay red on typecheck until:

- **Laura** fixes the broken test imports (`FactReader`, `RelationWriter`, `RelationEdge`).
- **Crispin**'s seam rename lands (the `cleanup: () => Database` vs `() => void | Promise<void>` mismatches surfaced by the gate are also pre-existing test type bugs the rename will resolve).

That's the intended behaviour. The gate's job is to make these failures **visible**, not to fix them. Not fixing test files here — out of my domain.

## Out of scope / follow-up

Six other packages share the same test-exclusion gap and have `typecheck` scripts that silently skip tests via the base config:

- `cairn`, `crucible-cli`, `crucible-core`, `forge` (no typecheck script), `runtime-cli` (no typecheck script), `skillsmith-runtime` (no typecheck script).

Generalising the gate to all packages is mechanical (same recipe: `tsconfig.typecheck.json` + `typecheck` script) but **deliberately deferred** — eureka is the package with a known concrete bug we want the gate to catch *today*. Rolling it out to the rest of the monorepo deserves its own decision, partly because some packages don't yet have a `typecheck` script and adding one will likely surface a backlog of pre-existing test type errors that need triage owners.

## Files changed

- `packages/eureka/tsconfig.typecheck.json` (new)
- `packages/eureka/package.json` (typecheck script updated)
- `.github/workflows/ci.yml` (added `npm run typecheck` step)

## Verification

- `npm run lint` — passes.
- `npm run typecheck -w @akubly/eureka` — **fails as designed**, catches the target imports.
- `npm run build`, `npm test` — pre-existing failures (`cborg` module missing in `packages/crucible-core/src/ledger/wal/cbor.ts`) unrelated to this change and present on `HEAD` without my edits. Verified by stashing my changes and re-running.
