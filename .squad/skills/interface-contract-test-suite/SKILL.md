# SKILL: Interface Contract Test Suite

**Version:** 1.0
**Author:** Crispin (M7-C, 2026-05-31)
**Context:** Eureka `FactReader` contract test — applicable to any injected interface seam

---

## Purpose

When a TypeScript interface seam has multiple implementations (mocks today, real storage
tomorrow), write a **shared contract test helper** that any implementation can register
with. This prevents test duplication and proves substitutability (Liskov-level).

---

## Pattern

```typescript
// ── shared helper (in the relevant __tests__ file) ──────────────────────────

type SeedFn = (...) => Promise<void>;

interface Harness {
  impl: YourInterface;
  seed: SeedFn;
}

export function runYourInterfaceContract(
  implName: string,
  makeHarness: () => Harness,   // factory — called once per test via beforeEach
): void {
  describe(`YourInterface contract — ${implName}`, () => {
    let impl: YourInterface;
    let seed: SeedFn;

    beforeEach(() => {
      const h = makeHarness();
      impl = h.impl;
      seed = h.seed;
    });

    it('CL-1: [happy-path invariant]', async () => { ... });
    it('CL-2: [missing-item invariant]', async () => { ... });
    it('CL-3: [isolation invariant]', async () => { ... });
    it('CL-4: [passthrough / no-validation invariant]', async () => { ... });
    it('CL-5: [shape / type invariant]', async () => { ... });
  });
}

// ── wire each impl ───────────────────────────────────────────────────────────

runYourInterfaceContract('InMemoryImpl', () => {
  const impl = new InMemoryImpl();
  return { impl, seed: async (...) => impl.seed(...) };
});

// Future: runYourInterfaceContract('SqliteImpl', () => { ... });
```

---

## Invariant Categories to Cover

For any read-seam interface:

| Code | Invariant | Notes |
|------|-----------|-------|
| CL-1 | Happy path: seeded item is readable | Proves basic wiring works |
| CL-2 | Missing item returns null (not undefined) | Contract distinguishes null/undefined |
| CL-3 | Isolation: item from context-A invisible to context-B | E.g., session-scoping |
| CL-4 | Passthrough: corrupt value returned as-is | Read layer must NOT validate |
| CL-5 | Shape: result has expected fields and types | Documents minimum return shape |

---

## Rules

1. **`makeHarness` is a factory, not a shared instance.** Calling `beforeEach` with the
   factory ensures each test gets a fresh, isolated impl. Shared state between tests
   produces false positives and ordering dependencies.

2. **`seed` is always async.** Even if the in-memory impl is synchronous, the seed type
   must be `async` to accommodate future I/O-backed impls without changing the signature.

3. **Export `runXContract` from the test file.** Other test files can import and reuse it.
   The wire-up calls live in the same file for discoverability.

4. **CL-4 (passthrough) is load-bearing.** It documents explicitly that the read layer
   does not validate. Omitting this test creates ambiguity about whether future impls are
   allowed to clamp/filter — they are not. Validation is the caller's responsibility.

5. **One call per impl.** Do not inline impl-specific tests inside `runXContract`. Each
   invariant must hold for ALL implementations. Impl-specific behavior goes in a separate
   describe block.

---

## When to Use

- You have a TypeScript interface seam with multiple implementations (including mocks).
- The interface has a clear contract (return shape, null vs undefined, isolation semantics).
- You want to prove that a new "real" implementation is substitutable for the existing mock.
- You want test count to grow linearly with implementations, not quadratically.

## When NOT to Use

- The interface has only one implementation ever (over-engineering).
- The invariants are trivial (single boolean return, no state isolation).
- The implementations differ so much in behavior that the contract is too loose to be useful.

---

## Example: FactReader (Eureka M7-C)

```typescript
// packages/eureka/src/storage/__tests__/fact-reader.contract.test.ts
export function runFactReaderContract(
  implName: string,
  makeHarness: () => { reader: FactReader; seed: SeedFact },
): void {
  describe(`FactReader contract — ${implName}`, () => {
    // CL-1: read seeded fact
    // CL-2: read missing fact → null
    // CL-3: read wrong-session fact → null (session isolation)
    // CL-4: NaN trust passthrough → {trust: NaN} (no validation at read layer)
    // CL-5: result shape has numeric trust field
  });
}

runFactReaderContract('InMemoryFactReader', () => {
  const impl = new InMemoryFactReader();
  return { reader: impl, seed: async (factId, sessionId, trust) => impl.seed(factId, sessionId, trust) };
});
// → 5 contract tests per wiring call
```

Future SQLite wiring (M8):
```typescript
runFactReaderContract('SqliteFactReader', () => {
  const db = openTestDb();
  const impl = new SqliteFactReader(db);
  return { reader: impl, seed: async (factId, sessionId, trust) => insertFact(db, factId, sessionId, trust) };
});
// → 5 more contract tests, zero test duplication
```
