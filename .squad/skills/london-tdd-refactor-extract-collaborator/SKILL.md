# Skill: London TDD — REFACTOR: Extract Collaborator

**Skill ID:** `london-tdd-refactor-extract-collaborator`  
**Author:** Roger (Platform Dev)  
**Created:** 2026-06-01  
**Status:** v1 — derived from Crucible Sprint 0 REFACTOR

---

## Purpose

Given a GREEN acceptance test backed by a flat in-memory module (no collaborator seams), execute the REFACTOR step that extracts:
1. A **value object** encapsulating domain invariants.
2. A **collaborator interface** (the DB/repository seam) that unit tests can mock.
3. A **service class** that accepts the interface via constructor injection.
4. An **in-memory adapter** that satisfies the interface for backward compatibility.

The public API (acceptance-level functions) must remain signature-identical. No behavior visible to the acceptance test changes. The unit tests mock the new collaborator interface.

---

## When to Apply

- You have a GREEN acceptance test calling flat module-level functions (e.g. `createSession`, `fork`).
- The next TDD cycle calls for unit tests on a new service class with mocked collaborators.
- You need to extract the service class without breaking the acceptance test.
- You want to enable future real-DB integration without touching the acceptance test.

---

## Steps

### 1. Identify the value object (domain invariant holder)

Find the concept that carries invariants (e.g. fork lineage, offset range, entity ID). Extract it as a class:
- Constructor validates all invariants; throws descriptive `Error` on violation.
- Static factory method for sentinel/default instances.
- `is*()` predicate methods.
- Pure — no I/O, no async, no dependencies.

```ts
// Minimal shape
export class ForkLineage {
  constructor(public readonly parentSessionId: string | null, public readonly forkPointEventId: number) {
    if (forkPointEventId < 0) throw new Error('Fork point must be non-negative');
  }
  static root() { return new ForkLineage(null, 0); }
  isRoot() { return this.parentSessionId === null; }
}
```

**Tip:** If the strategy doc types a field as `string` but a sentinel factory requires `null`, accept `string | null` and document the choice.

### 2. Define the collaborator interface (narrowest possible)

Only include methods the service class will actually call. This is the exact shape the unit test mocks will implement. Lock it before writing the service class.

```ts
export interface DB {
  getSession(id: string): Promise<{ id: string; ledgerSize: number; ... } | null>;
  insertSession(session: { ... }): Promise<void>;
  queryEvents(id: string, opts: { range: [number, number] }): Promise<unknown[]>;
}
```

**Rule:** If a test collaborator's `makeMockDB()` is already written, the interface must match it exactly — derive the interface from the test contract, not the other way around.

### 3. Implement the service class

Constructor accepts `DB`. All validation, orchestration, and DB interaction lives here. Use the value object for invariant enforcement.

```ts
export class SessionManager {
  constructor(private readonly db: DB) {}

  async forkSession(parentId: string, forkOffset: number): Promise<string> {
    const parent = await this.db.getSession(parentId);
    if (!parent) throw new Error(`Parent session ${parentId} not found`);
    if (forkOffset > parent.ledgerSize)
      throw new Error(`Fork point ${forkOffset} exceeds parent ledger size ${parent.ledgerSize}`);
    const lineage = new ForkLineage(parentId, forkOffset); // validates non-negative
    const childId = crypto.randomUUID();
    await this.db.insertSession({ id: childId, parentSessionId: lineage.parentSessionId, ... });
    return childId;
  }
}
```

### 4. Create the in-memory adapter (`createInMemoryDB`)

The adapter satisfies `DB`. But the composition layer (session.ts) needs more internal access than `DB` exposes. Pattern:

```ts
export interface InMemoryDB extends DB {
  insertRootSession(id: string, createdAt: number): void;
  pushEvent(sessionId: string, event: Primitive): void;
  getOwnEvents(sessionId: string): Primitive[];
  getMetadata(sessionId: string): { parentSessionId: string | null; forkPointEventId: number | null; createdAt: number } | null;
}

export function createInMemoryDB(): InMemoryDB { ... }
```

**Rule:** `DB` interface = mock contract (visible to service class and tests). `InMemoryDB` extended interface = internal helpers (visible only to session.ts). `SessionManager` imports only `DB`, never `InMemoryDB`.

**ledgerSize computation:**
- Root: `ownEvents.length`
- Child: `forkPointEventId + 1 + ownEvents.length`

### 5. Wire the composition layer

Update the public module-level functions to use a module-level singleton:

```ts
const db = createInMemoryDB();
const manager = new SessionManager(db);

export async function fork(parentId: string, opts: { atOffset: number }): Promise<Session> {
  const childId = await manager.forkSession(parentId, opts.atOffset);
  const meta = db.getMetadata(childId)!;
  return buildSession(childId, { parentSessionId: meta.parentSessionId, ... });
}
```

Root session creation that bypasses the service class (no invariants to check): call `db.insertRootSession()` directly.

### 6. Update the barrel (`index.ts`)

Export:
- Existing public surface (unchanged)
- Service class
- Interface (type-only)
- Value object
- Factory function

### 7. Verify both layers GREEN

```
npm run build --workspace=@akubly/crucible-core   # TypeScript clean
npm test --workspace=@akubly/crucible-core         # unit tests
npm test --workspace=@akubly/crucible-cli          # acceptance test (no regression)
npm run build                                       # full monorepo
```

---

## Anti-Patterns

| Anti-pattern | Why wrong |
|---|---|
| Changing the acceptance test public API | REFACTOR must not change observable behavior |
| Putting invariant checks in the value object AND the service class | Double-validation is fine but be explicit about which layer is canonical |
| `DB` interface exposing internal helpers | The mock contract leaks; unit tests become brittle |
| Service class importing `InMemoryDB` | Breaks the collaborator seam — service should only see `DB` |
| Forgetting to update `ledgerSize` on every append | Acceptance test will fail silently when fork-offset check runs against a stale count |

---

## Outputs

- Value object file in a domain subfolder (e.g. `src/ledger/`)
- Interface file (`src/db.ts`)
- Service class file (`src/session-manager.ts`)
- Adapter file (`src/in-memory-db.ts`)
- Updated barrel (`src/index.ts`)
- Updated composition module (`src/session.ts`)
- GREEN unit test output
- GREEN acceptance test output (no regression)
- Decision inbox file at `.squad/decisions/inbox/<agent>-<feature>-refactor.md`
- History append in `.squad/agents/<agent>/history.md` under "## Learnings"
