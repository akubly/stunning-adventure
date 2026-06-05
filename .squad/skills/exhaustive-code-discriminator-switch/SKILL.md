# SKILL: Exhaustive Code-Discriminator Switch Testing

**Author:** Laura (Tester)
**Derived from:** M7-B — exhaustive error narrowing tests for Eureka typed error hierarchy (2026-05-31)
**Confidence:** HIGH — pattern fully exercised across 5 error classes, 14 tests GREEN
**Applicable to:** Any module with typed error classes carrying `code` discriminators (e.g. all Eureka activities after M7-A)

---

## When to Use

Use this skill when:
- A module has typed error classes with `readonly code = '...' as const` discriminators (see `typed-error-discriminator-codes` skill)
- You need to prove callers can safely narrow errors from `unknown` (e.g. catch site)
- You want to lock that no valid domain error falls through to an unhandled branch
- You want to demonstrate the canonical narrowing pattern callers should follow

---

## The Core Pattern

### 1. The `narrowError` helper function

Write a helper that accepts `unknown` and dispatches on `code`. This is the exact pattern production callers should use:

```typescript
type MyTag =
  | 'error_a'
  | 'error_b'
  | 'error_c'
  | 'unknown';

function narrowMyError(err: unknown): MyTag {
  // Step 1: guard the access — err must be a non-null object with a `code` property
  if (typeof err !== 'object' || err === null || !('code' in err)) return 'unknown';
  // Step 2: switch on code
  switch ((err as { code: string }).code) {
    case 'ERROR_A': return 'error_a';
    case 'ERROR_B': return 'error_b';
    case 'ERROR_C': return 'error_c';
    default:
      // Unreachable for valid domain errors — all codes are handled above.
      // In a narrower typed context (switch variable has domain union type),
      // use `const _unreachable: never = code` for compile-time exhaustiveness.
      return 'unknown';
  }
}
```

> **Why `typeof` + `in` guard before the switch?** `err` is `unknown` at catch sites. Accessing `.code` directly would throw if `err` is a string, number, or null. The two-step guard is idiomatic TypeScript for narrowing `unknown`.

### 2. Test: all codes route correctly, no valid error reaches default

```typescript
it('routes all error codes correctly — no valid domain error reaches default', async () => {
  // Drive each error class out of the SUT
  const errors = await Promise.all([
    callThatThrowsErrorA().catch(e => e),
    callThatThrowsErrorB().catch(e => e),
    callThatThrowsErrorC().catch(e => e),
  ]);

  // Assert each routes to the correct tag
  expect(narrowMyError(errors[0])).toBe('error_a');
  expect(narrowMyError(errors[1])).toBe('error_b');
  expect(narrowMyError(errors[2])).toBe('error_c');

  // Assert non-domain errors reach 'unknown' (proves default branch works)
  expect(narrowMyError(new Error('plain'))).toBe('unknown');
  expect(narrowMyError({ code: 'ALIEN_CODE' })).toBe('unknown');
  expect(narrowMyError(null)).toBe('unknown');
});
```

---

## Full Test Suite Structure

When testing an exhaustive narrowing contract, organize into 6 groups:

| Group | What to test | Notes |
|-------|-------------|-------|
| 1 | Code-based narrowing per class | One it per class: assert code, fields, message substring, name |
| 2 | Exhaustive switch helper | One it: all codes → correct tag, non-domain → unknown |
| 3 | instanceof (convenience) | One it per class extending non-Error base (RangeError, TypeError) |
| 4 | Field/property discriminators | One it per meaningful field (source, field, event, etc.) |
| 5 | Propagation paths | One it per distinct throw site for the same error class |
| 6 | Runtime-cast path | One it using `as unknown as DomainType` to bypass union |

### Group 1 — per-class code narrowing pattern

```typescript
it('<ClassName>: code, fields, message substring, and name are correct', async () => {
  let caught: unknown;
  try {
    await callThatThrows(/* inputs that trigger this class */);
  } catch (err) { caught = err; }

  expect((caught as MyError).code).toBe('MY_ERROR_CODE');   // primary discriminator
  expect((caught as MyError).someField).toBe(expectedValue); // domain field
  expect((caught as MyError).message).toContain('keyword'); // message preservation (F4)
  expect((caught as MyError).name).toBe('MyError');          // domain name, NOT base class
});
```

> **Why `name` matters:** Error classes that extend RangeError/TypeError override `this.name` to the domain class name (e.g. `'InvalidTrustValueError'`, not `'RangeError'`). Test this explicitly — a future refactor that drops the `this.name =` assignment would change observable behavior for callers who log errors.

### Group 3 — instanceof comment discipline

Always document that instanceof is convenience-only:

```typescript
it('MyError instanceof RangeError (preserves pre-M7-A assertion)', async () => {
  // ...drive throw path...
  // Convenience assertion only — code-based check is primary (see Group 1)
  expect(caught).toBeInstanceOf(RangeError);
  expect((caught as MyError).code).toBe('MY_ERROR_CODE');
});
```

### Group 6 — runtime-cast path

```typescript
it('unknown event string via runtime cast produces the right error', async () => {
  // Simulates JSON.parse or untyped API boundary bypassing the TS union
  const BAD_VALUE = 'unexpected_value';
  await expect(
    callThatUsesUnion({ value: BAD_VALUE as unknown as UnionType }),
  ).rejects.toThrow(/* typed error */);
});
```

---

## Regression Lock Pattern (never-called assertions)

For every error path that must NOT write to storage:

```typescript
it('some error condition → NoWriteError, TrustUpdater never called', async () => {
  const trustUpdater = { update: vi.fn().mockResolvedValue(undefined) };
  let caught: unknown;
  try {
    await callThatMightWrite({ /* bad input */ }, { trustUpdater });
  } catch (err) { caught = err; }

  expect((caught as SomeError).code).toBe('SOME_ERROR');
  // Regression lock — error path must not write
  expect(trustUpdater.update).not.toHaveBeenCalled();
});
```

> **Why explicit `not.toHaveBeenCalled`?** A refactor that reorders checks (e.g. moves validation after the write) would not change the thrown error — it would only change whether a partial write occurred. The `not.toHaveBeenCalled` assertion catches exactly this regression.

---

## Step-by-Step

1. **Inventory the error classes** — list every class in `errors.ts` with their code, base class, and unique fields.
2. **Map throw sites** — identify which SUT function / input produces each error.
3. **Write Group 1** (5–N tests): one per class, using try/catch not `.rejects.toThrow()` so you can access typed fields.
4. **Write the `narrowError` helper** and Group 2 (1 test): all codes → tags + default-branch guard.
5. **Write Group 3** (instanceof tests, one per non-Error base class, with realm-convenience comment).
6. **Write Groups 4–6** for each discriminator field / distinct path / runtime-cast scenario.
7. **Run tests** — all must be GREEN; no production code changes.
8. **Commit separately** from any production code changes.

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Using `.rejects.toThrow(SomeClass)` for field assertions | Can't access err.code, err.factId, etc. | Use try/catch and cast the caught value |
| Missing `typeof` + `'code' in err` guard | `narrowError` throws when passed a string or null | Add the non-null object + in-check before the switch |
| instanceof without the realm caveat comment | Future reader assumes instanceof is safe cross-realm | Add comment: "convenience assertion only — do not rely cross-realm" |
| Asserting `err.name === 'RangeError'` for a class that overrides `name` | Wrong — name is the domain class name | Assert `err.name === 'InvalidTrustValueError'` (or whatever the class sets) |
| Forgetting `not.toHaveBeenCalled()` on error paths | Silent write regression undetected | Always assert write seam was not called on error paths |

---

## Eureka M7-B Reference Implementation

- `packages/eureka/src/activities/__tests__/feedback-error-narrowing.test.ts` — canonical example with 5 classes, 6 groups, 14 tests
- `packages/eureka/src/activities/__tests__/feedback-by-id-regression.test.ts` — regression lock pattern with 8 tests
- `packages/eureka/src/activities/errors.ts` — the error classes being tested
- `.squad/decisions.md` § "Canonical narrowing policy (M7-A Cycle 1)" — policy this skill exercises
