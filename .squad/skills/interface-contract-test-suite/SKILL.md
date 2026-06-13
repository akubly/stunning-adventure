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

## Adding RED Tests to an Existing Contract Suite (London TDD)

When a new feature adds error-throwing paths to an existing interface, add the RED tests
inside `runXContract` so they exercise ALL implementations simultaneously.

### Error type scaffold pattern

If the new error classes don't exist yet, create minimal stubs in `storage/errors.ts` (or
the appropriate `errors.ts` alongside the implementation). This is NOT stubbing the
implementation — the `throw` sites in the methods are the implementation. The error class
definitions are the test contract. Creating them allows:

1. Import statements to resolve (no module-not-found crash that breaks all 30+ existing tests)
2. RED failures to be assertion failures: `"promise resolved instead of rejecting"` — the
   right RED signal (wrong behavior) rather than `"module not found"` (unrelated crash)

```typescript
// storage/errors.ts — type scaffold, NOT the implementation
export class CursorScopeMismatchError extends Error {
  readonly code = 'CURSOR_SCOPE_MISMATCH' as const;
  constructor() {
    super('...');
    this.name = 'CursorScopeMismatchError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
```

### Backward-compat tests start GREEN intentionally

A test that validates EXISTING behavior (e.g. "v0 cursors still accepted") will start GREEN.
This is correct — it is a non-regression lock, not a feature test. Not every test in a RED
suite needs to be individually RED.

### RED anchor for format-change tests

If a feature changes OUTPUT FORMAT (e.g. cursor v0 → v1), round-trip tests like FS-5 would
start and stay GREEN (the opaque round-trip works either way). To anchor the test RED, add
an explicit assertion on the NEW format:

```typescript
const decoded = JSON.parse(Buffer.from(nextCursor, 'base64').toString('utf8'));
// RED: current impl emits v0 { offset }; Roger's GREEN must emit { v:1, offset, scope }
expect(decoded).toMatchObject({ v: 1, offset: expect.any(Number), scope: expect.any(String) });
```

### Scope-mismatch cursor acquisition

To test that a cursor from context A is rejected in context B:
1. Call `search(params_A)` → capture `nextCursor`
2. Call `search(params_B, cursor: nextCursor)` where params_B changes exactly ONE parameter
3. `expect(step2).rejects.toThrow(ScopeMismatchError)`

This avoids hard-coding the internal fingerprint and stays valid if the algorithm changes.

---

## Extending Seed to Exercise New Columns Across All Impls

When a storage schema gains new columns that must be observable via the seam's read interface,
promote coverage to the contract suite using the **optional trailing opts** pattern:

### Step-by-step

1. **Extend the `SeedFn` type** with an optional trailing opts argument — never positional,
   never a new parameter in the middle:

   ```typescript
   type SeedFn = (
     id: string,
     scope: ScopeId,
     content: string,
     trust: number,
     opts?: {                           // ← new optional trailing opts
       newColA?: string;
       newColB?: number | null;         // null = explicit SQL NULL → undefined in results
     },
   ) => Promise<void>;
   ```

   All existing call sites omit `opts` — no breaking change.

2. **Make the in-memory reference impl model the new columns.** Extend the stored-record
   interface and the search/return path. `null` opts values map to `undefined` in results
   (mirrors SQL NULL → absent semantics).

3. **Update all harness seeds** (both in-memory and I/O-backed) to accept and store `opts`.
   Use `opts?.newColA ?? defaultVal` so existing callers get identical behaviour.

4. **Add contract assertions** inside `runXContract` for:
   - Non-default values (set via opts) surface unchanged from the read method.
   - Default-seeded (no opts) returns the documented default for each field.

### Why this beats a separate impl-specific test

An impl-specific edge-case file cannot enforce that the reference (in-memory) impl also
models the new column. The optional-opts pattern forces the in-memory impl to catch up and
proves substitutability at the same time. The sqlite-edges file should be reserved for
genuinely SQLite-specific concerns (FTS5 BM25 math, CHECK constraints, NULL-type coercion)
that have no analogue in memory-backed impls.

---


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
