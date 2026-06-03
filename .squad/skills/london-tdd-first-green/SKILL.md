# Skill: London TDD — First GREEN Phase

**Skill ID:** `london-tdd-first-green`  
**Author:** Roger (Platform Dev)  
**Created:** 2026-06-01  
**Status:** v1 — derived from Crucible Sprint 0

---

## Purpose

Given a RED acceptance test (outermost ring, no mocks), implement the **simplest correct code** that makes it GREEN. Defer every abstraction to the REFACTOR step. Do not introduce Ledger classes, repository interfaces, or collaborator seams during GREEN — those are the next TDD cycle's RED test targets.

> **Sprint 0 variant — diverges from `docs/crucible-tdd-strategy.md` §4.1 GREEN.**
> The strategy doc's §4.1 GREEN phase descends outside-in through a mocked
> `Ledger` collaborator at each layer boundary. This SKILL instead uses real
> in-memory data structures (module-level Map/registry) with no mocks, deferring
> collaborator seams entirely to REFACTOR. The divergence is intentional: Sprint 0
> acceptance tests exercise the full stack end-to-end, so a mocked-Ledger GREEN
> adds indirection without value at this stage. Mocked-Ledger descent applies
> when the acceptance surface grows beyond single-module reach (Sprint 1+).

---

## When to Apply

- You have a failing acceptance test that directly calls public API functions (e.g. `createSession`, `fork`, `recall`).
- No collaborator mocks exist yet — the test is London-school outermost ring, real dependencies only.
- Your job is GREEN, not REFACTOR.

---

## Steps

### 1. Read the acceptance test contract carefully
- Identify every assertion.
- Note the exact shapes of returned objects.
- Note any range/convention decisions embedded in assertions (e.g., inclusive vs. exclusive bounds).

### 2. Map assertions to minimal types and functions
Only define types required to satisfy the test. No optional fields, no future-proofing.

### 3. Choose the simplest correct data structure
For session/store patterns:
- A module-level `Map<id, Entry[]>` is almost always sufficient for Sprint 0.
- Avoid classes with constructors when a plain object + factory function suffices.
- Avoid abstractions (Ledger, Repository, WAL) — they belong in REFACTOR.

### 4. Implement prefix-delegation for fork semantics (session fork pattern)
When a child session must "logically inherit" a prefix from a parent:
- **Do not copy.** Have the child's `query` delegate to the parent's registry entry for offsets ≤ forkPoint.
- **Assign child own-event offsets as:** `baseOffset + ownEvents.length` where `baseOffset = forkPoint + 1`.
- This keeps the parent unmodified (invariant) and requires zero copies.

```ts
// Inclusive-inclusive range query pattern
async query({ range: [a, b] }): Promise<Primitive[]> {
  if (forkPoint === null) {
    return ownEvents.filter(e => e.offset >= a && e.offset <= b);
  }
  const result: Primitive[] = [];
  if (a <= forkPoint) {
    result.push(...parentEvents.filter(e => e.offset >= a && e.offset <= Math.min(b, forkPoint)));
  }
  if (b > forkPoint) {
    const childStart = Math.max(a, forkPoint + 1);
    result.push(...ownEvents.filter(e => e.offset >= childStart && e.offset <= b));
  }
  return result;
}
```

### 5. Document convention choices inline
If you make a convention decision that could go either way (e.g., inclusive-inclusive vs. exclusive-end range), add a one-line comment in the implementation. The acceptance test is your proof.

### 6. Build dependencies before running tests
If the acceptance test resolves a package via workspace symlinks (e.g., `@akubly/crucible-core`), build that package first. Vitest transforms `.ts` in the test package but resolves workspace `main` for the dependency — the `dist/` must exist.

```
npm run build --workspace=@akubly/crucible-core
npm test --workspace=@akubly/crucible-cli
```

### 7. Verify GREEN before writing artifacts
Capture test output. All assertions must pass. If any RED remains, fix and iterate — do not write the decision file for a partial GREEN.

### 8. Write the decision inbox file
Capture: packages scaffolded, public types/functions with shapes, any convention choices, GREEN confirmation (test output), and explicit deferral of abstractions to REFACTOR.

---

## Anti-Patterns

| Anti-pattern | Why wrong |
|---|---|
| Introducing a `Ledger` or `Repository` interface during GREEN | That's the next RED target. GREEN's only job is "make the test pass." |
| Copying parent events into the child at fork time | Breaks "parent unmodified" invariant; wastes memory; not needed |
| Using exclusive-end range without verifying against test assertions | A `[0, 46] → length 47` assertion proves inclusive-inclusive. Read the test. |
| Jumping to REFACTOR before GREEN is confirmed | Always confirm GREEN output before proceeding |

---

## Outputs

- New package(s) with minimal implementation
- GREEN test output captured
- Decision inbox file at `.squad/decisions/inbox/<agent>-<feature>-first-green.md`
- History append in `.squad/agents/<agent>/history.md` under "## Learnings"
