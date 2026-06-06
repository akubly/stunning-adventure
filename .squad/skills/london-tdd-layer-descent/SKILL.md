# Skill: London TDD — Layer Descent (Acceptance → Unit with Mocked Collaborator)

**Skill ID:** `london-tdd-layer-descent`  
**Owner:** Laura Bow (Tester)  
**Version:** 1.0  
**Created:** 2026-06-01  
**First application:** Crucible §4.1 Refactor 2 — `SessionManager` unit tests

---

## Purpose

After a GREEN acceptance test passes (outermost ring, no mocks), descend one ring inward to write **unit tests for the next collaborator seam**. This skill encodes the layer-descent pattern: what changes between rings, what stays the same, and how to author the RED unit tests before the collaborator class exists.

---

## When to Apply

- You have a GREEN acceptance test (no mocks, full public API).
- The GREEN implementation is a single module-level file (module-scope Map, flat functions).
- The REFACTOR step is about to extract a class (`SessionManager`, `Ledger`, `Repository`) and inject a DB/storage collaborator.
- Your job: write failing unit tests for the new class **before** Roger's REFACTOR lands.

---

## Ring Comparison

| | Acceptance ring | Unit ring |
|---|---|---|
| **Mocks** | None — real implementations only | Mock all external collaborators (DB, network, time) |
| **Subject under test** | Public API functions (`createSession`, `fork`) | Class under construction (`SessionManager`) |
| **Test file location** | `src/__tests__/acceptance/<scenario>.test.ts` | `src/__tests__/unit/<class>.test.ts` |
| **Import** | `import { fn } from '../../index.js'` | `import { ClassName } from '../../index.js'` |
| **RED signal** | `TypeError: fn is not a function` | `TypeError: ClassName is not a constructor` |
| **What it pins** | User-observable behavior | Collaborator contract (DB seam shape + call arguments) |

---

## Steps

### 1. Identify the new collaborator seam

Read the REFACTOR phase snippet in the TDD strategy. Find the class being extracted (e.g. `SessionManager`) and the interface it depends on (e.g. `DB`). The interface is the mock boundary.

### 2. Lock the mock shape from the strategy snippet

```typescript
type MockDB = {
  getSession:    ReturnType<typeof vi.fn>;  // returns parent session record
  insertSession: ReturnType<typeof vi.fn>;  // saves new child session
  queryEvents:   ReturnType<typeof vi.fn>;  // reserved — present for shape completeness
};
```

Include every method even if unused in initial tests. This locks the shape contract; Roger's `DB` interface must match.

### 3. Write a `makeMockDB()` factory (inline for first file; extract later)

```typescript
function makeMockDB(): MockDB {
  return {
    getSession: vi.fn(),
    insertSession: vi.fn(),
    queryEvents: vi.fn(),
  };
}
```

Call `vi.resetAllMocks()` in `beforeEach` — never rely on mock state from a prior test.

### 4. Structure tests by invariant category

Group tests under one `describe('<ClassName>')` block. Categories:

- **Validation-error tests** — verify throws before any DB write. Set up `getSession` mock only; assert message regex permissively.
- **Happy-path tests** — mock `insertSession.mockResolvedValue(...)` so the class can complete. Assert `insertSession` called with `expect.objectContaining({ ... })`.

### 5. Proactively add edge cases

Strategy snippets often omit the negative-input edge case. Add it as a separate `it()`:
- `forkOffset < 0` → throw `/non-negative|negative/`
- Zero items, empty collections, null id, etc.

*Edge cases aren't optional — they're where the real bugs hide.*

### 6. Use permissive regexes for error message assertions

```typescript
await expect(manager.forkSession('parent-id', 50)).rejects.toThrow(/exceeds parent ledger size 47/);
await expect(manager.forkSession('parent-id', -1)).rejects.toThrow(/non-negative|negative/);
```

Permissive regex gives the implementor wording freedom; the test still pins the semantic.

### 7. Use `objectContaining` for DB call assertions

```typescript
expect(mockDB.insertSession).toHaveBeenCalledWith(
  expect.objectContaining({
    parentSessionId: 'parent-id',
    forkPointEventId: 23,
    pluginVersions: parentPlugins,
  }),
);
```

Keeps auto-generated fields (`id`, `createdAt`) from making assertions brittle.

### 8. Import from `index.js`, expect RED

```typescript
import { SessionManager } from '../../index.js';
```

`SessionManager` not yet exported → `TypeError: SessionManager is not a constructor`. That is the correct RED signal for the unit ring.

### 9. Verify RED, then write artifacts

```bash
npm test --workspace=@akubly/<pkg>
```

Expected: `TypeError: ClassName is not a constructor` for all tests.  
Write decision inbox file. Append to history.

---

## What the decision inbox captures for the next ring

1. MockDB shape (exact method names + input/output shapes)
2. Test count + invariant-per-test table
3. RED confirmation snippet
4. Next steps for Roger's REFACTOR
5. Note on Mock Drift Defense (§7): extract `makeMockDB()` to fixture builder after the formal `DB` interface is typed

---

## Anti-Patterns

| ❌ Don't | ✅ Do instead |
|---|---|
| Mock at the acceptance layer | Acceptance tests are always mock-free |
| Write unit tests that pass immediately | If GREEN, either the class already exists or the import is wrong |
| Hard-code error message strings in assertions | Use permissive regex — gives implementor wording freedom |
| Omit `queryEvents` from mock shape because it's unused | Include all methods; shape contract is the point |
| `vi.clearAllMocks()` in `beforeEach` instead of `vi.resetAllMocks()` | `resetAllMocks` clears return values too — prevents cross-test contamination |

---

## Relationship to Other Skills

| Skill | Role |
|---|---|
| `london-tdd-first-red-test` | Authors the outermost acceptance ring |
| `london-tdd-first-green` | Makes acceptance test pass with simplest correct code |
| **`london-tdd-layer-descent`** | Descends to unit ring with mocked collaborator |
| *(future)* `london-tdd-integration` | §4.1 Refactor 3 — replaces mocks with real SQLite |

---

## References

- `docs/crucible-tdd-strategy.md §4.1` — REFACTOR Phase (Refactor 2 = invariant tests)
- `docs/crucible-tdd-strategy.md §7` — Mock Drift Defense
- `docs/crucible-tdd-strategy.md §8.5` — Test Naming Conventions
- `packages/crucible-core/src/__tests__/unit/session-manager.test.ts` — first application
- `.squad/decisions/inbox/laura-crucible-refactor-unit-tests.md` — first application decision
