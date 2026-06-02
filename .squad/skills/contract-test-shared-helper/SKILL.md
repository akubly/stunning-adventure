# contract-test-shared-helper

**Pattern:** Write a `runXxxContract(makeImpl)` helper that exercises any
implementation of an interface against a shared test suite.

---

## When to use

- You have an interface (e.g. `TrustUpdater`, `FactReader`) that will have
  multiple concrete implementations over time (in-memory mock today; real
  storage tomorrow).
- You want all implementations to pass the same behavioral contract.
- The contract includes both happy-path and error-path cases, and possibly
  concurrency/ordering guarantees.

---

## Pattern structure

```ts
// 1. Define a test-impl shape that exposes side-channel setup/inspection
interface FooTestImpl {
  impl: FooInterface;
  setFoo(key: string, value: T): void;   // setup
  getFoo(key: string): T | undefined;    // inspection
}

// 2. Write the shared suite function
function runFooContract(makeImpl: () => FooTestImpl): void {
  it('C-1: happy path', async () => {
    const { impl, setFoo, getFoo } = makeImpl();
    setFoo('key', initial);
    await impl.someMethod({ key, fn: ... });
    expect(getFoo('key')).toEqual(expected);
  });

  it('C-2: error path — fn throws aborts write', async () => {
    const { impl, setFoo, getFoo } = makeImpl();
    setFoo('key', initial);
    await expect(impl.someMethod({ key, fn: () => { throw boom; } }))
      .rejects.toBe(boom);
    expect(getFoo('key')).toEqual(initial); // unchanged
  });

  // ...more tests
}

// 3. Register the suite for each impl
describe('FooInterface contract — InMemoryFoo', () => {
  runFooContract(makeInMemoryFoo);
});

// 4. (Future) Crispin / real storage:
// describe('FooInterface contract — SQLiteFoo', () => {
//   runFooContract(makeSQLiteFoo);
// });
```

---

## Key design rules

1. **`makeImpl` is called fresh per test** — no shared state between tests.
   Each `it` gets its own isolated instance.

2. **Side-channel methods (`setFoo`, `getFoo`) are test-only** — the real
   `FooInterface` doesn't expose them. They're on the wrapper returned by
   `makeImpl`.

3. **Test the contract, not the implementation** — avoid asserting internal
   implementation details (locks, maps, etc.). Assert only observable behavior.

4. **Cover the full contract surface:**
   - Happy-path (value written correctly)
   - fn-throws → write aborted, state unchanged, error propagates
   - Missing-key → typed error (e.g. `FactNotFoundError`)
   - Concurrent calls on same key → serialized
   - Concurrent calls on different keys → MAY be processed in parallel; implementations
     are not required to do so. The contract requires non-interference (each key reaches
     the correct final value), not concurrency. A globally-serialized impl (e.g.,
     single-connection SQLite) is valid.
   - Cross-session isolation → mutate on sessionA MUST NOT affect sessionB's state

5. **Concurrency test via in-memory scheduler** — use promise chains (not
   real timers/delays) to verify serialization. Real storage atomicity is
   tested in integration tests; this suite tests the behavioral contract.

---

## Reference implementation

`packages/eureka/src/activities/__tests__/trust-updater-contract.test.ts`

- `InMemoryTrustUpdater` — per-key promise chain for serialization
- `runTrustUpdaterContract(makeImpl)` — 7 contract tests (C-1 through C-7)
  - C-7: cross-session isolation — mutate on sessionB MUST NOT affect sessionA
- Used to validate `TrustUpdater.mutate()` (M7-C atomicity seam)

---

## Applicability checklist

✅ Interface will have multiple impls (now or planned)
✅ Contract includes error paths (abort semantics)
✅ Concurrency/ordering guarantees are part of the contract
✅ Team wants a single place to add a new impl test with one line
❌ Single-impl throwaway — skip the helper, write tests directly
