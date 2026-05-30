# SKILL: Scaffold a New Package in the Cairn Monorepo for London-School TDD

**Author:** Laura (Tester)  
**Derived from:** M1 — Eureka first red test (2026-05-28)  
**Applicable to:** Any new `packages/<name>/` added to this npm workspaces monorepo

---

## When to Use

Use this skill when adding a brand-new package to `packages/` that will be developed
with London-school TDD (outside-in, red/green/refactor). The goal is minimal scaffolding
that lets a failing test run for the **right reason** (missing implementation, not
missing config).

---

## Steps

### 1. Create the directory structure

```powershell
New-Item -ItemType Directory -Path "packages/<name>/src" -Force
# For activity-layer tests (per §55 §2.1):
New-Item -ItemType Directory -Path "packages/<name>/src/activities/__tests__" -Force
```

### 2. package.json

Follow `@akubly/cairn` naming convention (`@akubly/<name>`). Minimal:

```json
{
  "name": "@akubly/<name>",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@akubly/types": "*"
  },
  "devDependencies": {
    "@types/node": "^25.5.0",
    "vitest": "^3"
  }
}
```

### 3. tsconfig.json

Match `@akubly/cairn` exactly. Key points:
- `"composite": true` — required for `tsc --build` project references
- `"module": "Node16"` + `"moduleResolution": "Node16"` — ESM with `.js` extensions
- Exclude test dirs so they don't break `tsc --build`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "src/**/__tests__", "src/**/*.test.ts"],
  "references": [
    { "path": "../types" }
  ]
}
```

### 4. vitest.config.ts

Copy from `@akubly/cairn`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

### 5. Minimal src/index.ts (required for tsc --build)

`tsc --build` errors with "No inputs were found" if `src/` contains only test files.
Add an empty barrel:

```typescript
// No exports yet — TDD cascade will populate this.
export {};
```

**Important:** Do NOT create any other production files. London-school TDD drives
those into existence via failing tests.

### 6. Update root tsconfig.json

Add the new package to the `references` array:

```json
{ "path": "packages/<name>" }
```

### 7. Run npm install from repo root

```bash
npm install
```

The `"workspaces": ["packages/*"]` in root `package.json` auto-includes the new
package. Verify with `npm ls --workspaces`.

### 8. Write the first red test

Per §55 §1.3 and §2.1:
- Target the **highest-level observable activity** (outermost verb)
- Use `import { activityFn } from '../activity.js'` — `.js` extension required for Node16 ESM
- The test MUST fail because the module doesn't exist (not because of config errors)
- Mock all I/O collaborators inline (no need to import their interfaces at this stage)

### 9. Verify RED for the right reason

```bash
npm test --workspace=@akubly/<name>
```

Expected failure: `Error: Cannot find module '../<activity>.js'`  
NOT: config errors, missing devDependencies, TypeScript errors in unrelated files.

### 10. Verify baseline stays green

```bash
npm run build   # must pass (tsc --build across all packages)
npm test --workspace=@akubly/cairn   # must stay green
npm test --workspace=@akubly/forge   # must stay green
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| `tsc --build` fails: "No inputs found" | `src/` has only test files | Add `src/index.ts` with `export {}` |
| Test fails with config error, not missing module | `vitest.config.ts` misconfigured | Use `include: ['src/**/*.test.ts']` |
| `import type { SessionId }` fails at runtime | `@akubly/types` doesn't export `SessionId` | Add brand type to `packages/types/src/index.ts` before writing test |
| Import `from '../recall'` (no extension) fails in Node16 | Node16 ESM requires explicit `.js` | Always use `from '../recall.js'` in imports |
| npm install doesn't pick up new workspace | Old lock file | Run `npm install` from repo root again |

---

## Cross-References

- §55 §1 — Outside-in TDD spine (activity → mock seam → collaborator discovery)
- §55 §2.1 — Canonical first test location (`src/activities/__tests__/`)
- §20 §7.4 — FactStore as the canonical storage seam mock boundary
- `packages/cairn/tsconfig.json` — reference template
- `packages/cairn/vitest.config.ts` — reference template
