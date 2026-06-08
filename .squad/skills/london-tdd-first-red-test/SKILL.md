# Skill: London-TDD First Red Test

**Owner:** Laura Bow (Tester)  
**Version:** 1.0  
**Last updated:** 2026-06-01  
**Applies to:** Greenfield packages in this monorepo using London-school (outside-in) TDD

---

## Purpose

Author the **first failing acceptance test** for a new feature or package. This skill encodes the exact pattern — file placement, import strategy, naming, header comment structure, RED verification — so any team member can replicate it consistently.

---

## Inputs

| Input | Description |
|---|---|
| Acceptance scenario ID | e.g. `A1` from `docs/crucible-tdd-strategy.md §2` |
| TDD strategy walkthrough | e.g. `§4.1` — contains the RED-phase snippet |
| Locked decisions | Decision IDs that must be cited in the header |
| PRD user stories | `US-*` IDs that the scenario maps to |
| Package name | e.g. `@akubly/crucible-cli` at `packages/crucible-cli` |
| Public surface symbols | Names of not-yet-existing exports (e.g. `createSession`, `fork`) |

---

## Steps

### 1. Locate the scenario and snippet

Read the TDD strategy section for the walkthrough (e.g. §4.1). Find the RED phase snippet — it defines the `describe`/`it` structure, the arrange/act/assert flow, and the acceptance invariants.

### 2. Create the test file

**Path pattern:** `packages/<pkg>/src/__tests__/acceptance/<scenario-slug>.test.ts`

```
packages/crucible-cli/src/__tests__/acceptance/session-fork.test.ts
```

### 3. Write the header comment block

Every acceptance RED test must open with a comment block citing:

```typescript
/**
 * RED PHASE — <short description>
 *
 * Acceptance Scenario : <ID> — <name>
 * PRD User Stories    : <US-A-NEW-1>, <US-E-2>  (use comma list)
 * TDD Strategy        : §<N.M> <section title> (docs/crucible-tdd-strategy.md)
 * Locked Decision     : Aaron decision <ID> — <short description>
 *
 * This test MUST FAIL with a missing-module or "not a function" error until...
 * [one sentence on what the GREEN phase will wire]
 *
 * Invariants exercised (<scenario ID>):
 *   1. <first invariant>
 *   2. ...
 */
```

### 4. Import from the (not-yet-existing) public surface

```typescript
import { describe, it, expect } from 'vitest'; // globals: false per vitest config

// These symbols do not exist yet — import failure is the intended RED signal.
import { createSession, fork } from '../../index.js'; // .js extension required (ESM)
```

Key notes:
- Import `describe`, `it`, `expect` explicitly — `globals: false` in vitest config.
- Use `.js` extension on local imports even for `.ts` sources (`"type": "module"` packages).
- The empty `export {}` in `index.ts` makes the module resolvable but the named exports undefined → produces `TypeError: X is not a function` at runtime, not a compile error.

### 5. Implement the test body

Follow the RED-phase snippet from the TDD strategy walkthrough exactly. Include:
- **Arrange:** Set up the parent/initial state with specific numbers from the spec.
- **Act:** Call the not-yet-implemented function.
- **Assert:** All invariants from the acceptance scenario (lineage metadata, prefix equality, parent unmodified, etc.).

Annotate each `// Assert` block with the exact A-scenario sentence it validates.

### 6. Apply §8.5 naming convention

```
describe('<Feature Group>', () => {
  it('Acceptance: <Feature verb phrase> <params in brackets>', async () => { ... })
})
```

Examples:
- `it('Acceptance: Fork session creates child with inherited ledger prefix [parentId, forkOffset, childLineage]', ...)`
- `it('Acceptance: Pre-commit hook veto prevents primitive append [hookId, verdict, ledgerSize]', ...)`

### 7. Verify RED

```bash
cd packages/<pkg>
npx vitest run src/__tests__/acceptance/<scenario-slug>.test.ts
```

Expected output pattern:
```
TypeError: (0 , <symbol>) is not a function
```
or
```
Error: Cannot find module '../../index'
```

Both are valid RED signals. Capture the failure output.

### 8. Write the decision inbox file

`.squad/decisions/inbox/<author>-<feature>-first-red-test.md`

Include:
- Test file path
- Scenario → user story mapping table
- RED status (confirmed or pending scaffold)
- Next GREEN-phase steps (outside-in descent)

### 9. Update agent history

Append to `.squad/agents/<agent>/history.md` under `## Learnings`:
- First-red-test pattern specifics for this package
- vitest layout (config location, run commands)
- Naming convention chosen

---

## Variant: Acceptance Tests With a Controlled Spy (Hook/Callback Scenarios)

Some acceptance tests DO use `vi.fn()` — not as a mock of an internal collaborator,
but as a **user-supplied plug-in** (hook predicate, callback, observer). This is valid
at the acceptance level because the hook IS part of the public API contract:
the user registers it, the system invokes it, and the test asserts the invocation.

```typescript
// ✅ vi.fn() as a user-supplied hook — fine at acceptance level
const vetoHook = vi.fn().mockResolvedValue({ verdict: 'VETO', reason: '...' });
await ledger.registerHook('policy-gate', vetoHook, { budget: 50_000 });
expect(vetoHook).toHaveBeenCalledWith({ ... });
```

Distinguish from:
```typescript
// ❌ vi.fn() as a mock of an internal collaborator (DB, filesystem) — not at acceptance level
const mockDB = { insertSession: vi.fn() };
```

The rule is: if the `vi.fn()` is *passed in by the user* through the public API, it
belongs at acceptance level. If it replaces an *internal dependency*, it belongs in
unit/integration tests.

**Applied in:** A3 hook-veto acceptance test (§4.2 Walkthrough B).

---

## Anti-Patterns

| ❌ Don't | ✅ Do instead |
|---|---|
| Mock internal collaborators at acceptance level | Keep internal collaborators real; use `vi.fn()` only for user-supplied hooks/callbacks |
| Use `vi.fn()` for an internal collaborator at acceptance level | Move to unit/integration ring, pass real instances to the acceptance test |
| Create implementation files in the same PR | RED commit = test file only. Implementation is a separate commit/turn |
| Use `.ts` extension on imports | Use `.js` for ESM interop even in TypeScript sources |
| Omit the header comment block | Always cite PRD, scenario, strategy, and locked decisions |
| Write a test that passes on first run | If the test passes, the RED phase is incomplete — re-read the strategy |

---

## RED Failure Modes

| Error | Meaning |
|---|---|
| `TypeError: X is not a function` | Symbol exported as `undefined` from `export {}` — correct RED |
| `Error: Cannot find module` | Module doesn't exist at all — also correct RED |
| Test passes immediately | Symbols accidentally implemented, or wrong import path — investigate |
| `SyntaxError` in test file | Fix the test syntax — not a valid RED signal |

---

## References

- `docs/crucible-tdd-strategy.md §4.1` — Walkthrough A RED Phase (canonical example)
- `docs/crucible-tdd-strategy.md §8.1` — Red-First Workflow Rules
- `docs/crucible-tdd-strategy.md §8.5` — Test Naming Conventions
- `packages/eureka/src/activities/__tests__/recall.test.ts` — canonical example of vitest layout, header comment style, mock discipline
- `.squad/decisions/inbox/laura-crucible-first-red-test.md` — first application of this skill
