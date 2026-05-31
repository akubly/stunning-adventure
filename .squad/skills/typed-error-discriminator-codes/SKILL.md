# SKILL: Typed Error Classes with Discriminator Codes

**Author:** Edgar (Learning Systems Specialist)
**Derived from:** M7-A — typed error hierarchy for applyFeedback / applyFeedbackById (2026-05-31)
**Confidence:** HIGH — pattern cleanly replaces all generic throws; zero test regressions
**Applicable to:** Any Eureka activity (or wider monorepo module) that currently throws generic Error/TypeError/RangeError

---

## When to Use

Use this skill when:
- An activity has existing `throw new Error(...)` / `throw new TypeError(...)` / `throw new RangeError(...)` sites
- Callers need to distinguish error types at catch sites (`instanceof` or code-based narrowing)
- The module will cross ESM realm boundaries or is published as a dual CJS/ESM package
- Follow-up narrowing tests (M7-B pattern) are planned that need stable error contracts

---

## Pattern Overview

### 1. Create `errors.ts` alongside the activity

```typescript
// packages/<pkg>/src/activities/errors.ts

export class MyDomainError extends Error {
  readonly code = 'MY_DOMAIN_ERROR' as const;
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'MyDomainError';
    this.field = field;
    // Restore prototype chain for ES5-compiled or unusual environments
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

> **Canonical form:** Use `readonly code = 'MY_DOMAIN_ERROR' as const`. The repo's ESLint config enforces `@typescript-eslint/prefer-as-const` as an **error**, which requires the `as const` assertion form. The explicit-annotation style (`readonly code: 'MY_DOMAIN_ERROR' = 'MY_DOMAIN_ERROR'`) was briefly recommended in Cycle 1 (M7-A) finding F7, but that finding was reversed — F7 missed the enforced lint rule. See inbox decision `edgar-m7-a-cycle4-f7-reversal.md`.

### 2. Inheritance strategy — preserve existing test assertions

When existing tests assert `instanceof RangeError` or `instanceof TypeError`, use the matching
base class to avoid breaking tests with zero modifications:

| Existing throw | New class extends |
|---|---|
| `throw new RangeError(...)` | `extends RangeError` |
| `throw new TypeError(...)` | `extends TypeError` |
| `throw new Error(...)` | `extends Error` |

### 3. Discriminator `code` property

Every typed error class MUST carry a `readonly code` with a string literal type, using the **`as const` form** (enforced by the repo's ESLint config):

```typescript
readonly code = 'FACT_NOT_FOUND' as const;
```

> **Do not use the explicit-annotation form:** `readonly code: 'FACT_NOT_FOUND' = 'FACT_NOT_FOUND'` triggers `@typescript-eslint/prefer-as-const` (error). That form was briefly recommended by Cycle 1 (M7-A) finding F7, but F7 was reversed — the repo's lint rule is the authoritative voice. See inbox decision `edgar-m7-a-cycle4-f7-reversal.md`.

This enables realm-safe narrowing that survives `vm.runInNewContext` and dual-package
esm/cjs builds where `instanceof` prototype chains may break:

```typescript
if ('code' in err && err.code === 'FACT_NOT_FOUND') { ... }
```

### 4. `Object.setPrototypeOf` in every constructor

```typescript
constructor(...) {
  super(message);
  this.name = 'MyDomainError';
  // ...fields...
  Object.setPrototypeOf(this, new.target.prototype);  // ALWAYS
}
```

Required even in ES2022 targets — costs nothing, prevents subtle `instanceof` failures
when the class is re-instantiated across module boundaries.

### 5. Preserve original message text

Do NOT rewrite error messages. Carry the original string forward:

```typescript
// Before
throw new RangeError(`applyFeedback: currentTrust must be in [0, 1]; received ${v}`);

// After
throw new InvalidTrustValueError(v, 'input', `applyFeedback: currentTrust must be in [0, 1]; received ${v}`);
```

Preserves existing diagnostic output for callers who match on message strings.

### 6. Update barrel exports

Add value exports (not just type exports) for all error classes:

```typescript
// src/index.ts
export {
  FactNotFoundError,
  InvalidFeedbackOptionsError,
  // ...
} from './activities/errors.js';
```

### 7. Update JSDoc @throws to reference typed class names

```typescript
/**
 * @throws {InvalidTrustValueError} if currentTrust is non-finite or outside [0, 1]
 * @throws {InvalidFeedbackOptionsError} if event='user_correction' and correctionDelta is omitted
 */
```

---

## Step-by-Step

1. **Audit existing throw sites** — list every `throw new Error/TypeError/RangeError` in the target file.
2. **Design the class map** — for each throw site, choose the class name + code + base class.
3. **Check existing test assertions** — `grep -n 'toThrow(' tests/` to confirm which base classes are asserted. Extend accordingly.
4. **Create `errors.ts`** — all five (or N) classes in one file.
5. **Thread through source** — `import` the classes, replace each throw.
6. **Update JSDoc** — change `@throws {Error}` to `@throws {SpecificClass}`.
7. **Update barrel** — value exports for all classes.
8. **Run targeted tests** — `npm test --workspace=@akubly/eureka` — MUST be GREEN with zero test file changes.
9. **Run full build** — `npm run build` — MUST exit 0.
10. **Commit in two chunks:** (a) `errors.ts` alone, (b) source + barrel together.

---

## Test Update Discipline

This is a **refactor beat** — no behavior change, no test count change:
- Tests asserting `toThrow(RangeError)` continue to pass (extends RangeError)
- Tests asserting `toThrow(TypeError)` continue to pass (extends TypeError)
- Tests asserting only `toThrow()` continue to pass (all errors extend Error)
- M7-B narrowing tests (asserting `toThrow(SpecificClass)` + `err.code === 'CODE'`) are a **follow-up beat** — do NOT add them here

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| `extends Error` for a site that was `RangeError` | `toThrow(RangeError)` assertion fails | Extend `RangeError` instead |
| Omitting `Object.setPrototypeOf` | `instanceof` fails in some environments | Add to every constructor |
| Rewriting error messages | Callers matching on message strings break | Preserve original message verbatim |
| `export type` instead of `export` for classes | Class is erased at runtime, `instanceof` fails | Use `export class` — not `export type` |
| Missing barrel value export | `import { FactNotFoundError } from '@akubly/eureka'` fails | Add to barrel as value export |
| Adding narrowing tests in same PR | Scope creep; complicates reviewability | Narrowing tests go in the M7-B follow-up |

---

## Eureka M7-A Reference Implementation

- `packages/eureka/src/activities/errors.ts` — canonical example with 5 classes
- `packages/eureka/src/activities/recall.ts` — how to import and use
- `packages/eureka/src/index.ts` — barrel pattern
- `.squad/decisions.md` § "M7-A — Typed Error Hierarchy for applyFeedback / applyFeedbackById (Edgar)" (2026-05-31, lines 5-36) — rationale and follow-up table
