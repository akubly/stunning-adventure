# Skill: Ledger-Subscriber Projection Pattern

**Skill ID:** `ledger-subscriber-projection`  
**Author:** Roger (Platform Dev)  
**Created:** 2026-06-09  
**Status:** v1 — derived from Crucible §4.3 Walkthrough C  

---

## Purpose

Wire a **post-commit projection** onto the Crucible Ledger using the `LedgerSubscriber` seam.
A projection observes committed `LedgerEvent`s and materializes them into a queryable local store
(array, SQLite table, etc.) without polling and without coupling to WAL internals.

---

## When to Apply

- You need to materialize a projection from committed ledger events (e.g. Aperture events, audit log, read-model for a UI)
- You want to push a side-effect (badge, notification, metric) on each qualified commit
- You do NOT want to poll `ledger.queryEvents()` or couple to `WalBackend` internals

---

## Pattern Components

### 1. `LedgerSubscriber` interface (already in `ledger.ts`)

```typescript
export interface LedgerSubscriber {
  onCommit(offset: number, event: LedgerEvent): void;
}
```

### 2. Register via `ledger.subscribe()`

```typescript
const ledger = await createLedger();
const projector = new MyProjector(collaborator);
ledger.subscribe(projector); // called synchronously after each commitRow()
```

### 3. Projector class shape

```typescript
import type { LedgerEvent, LedgerSubscriber } from '../ledger/ledger.js';

export class MyProjector implements LedgerSubscriber {
  private readonly store: MaterializedRow[] = [];

  onCommit(offset: number, event: LedgerEvent): void {
    if (!this.qualifies(event)) return;
    this.store.push(this.materialize(event));
    this.collaborator.notify(...);
  }

  query(opts?: QueryOpts): MaterializedRow[] {
    // return filtered snapshot
  }
}
```

### 4. Extract a Policy value object for qualification + icon/priority rules

```typescript
export class MyPolicy {
  qualifies(level: string): boolean { ... }
  getIcon(category: string, payload: unknown): string { ... }
  getPriority(level: string): number { ... }
}
```

Pure (no I/O, no async) — unit-testable independently of the projector.

---

## Metadata flow

Add optional `metadata?: EventMetadata` to `PrimitiveInput` to carry tier/level from the
`ledger.append()` call through to the subscriber:

```typescript
await ledger.append({
  primitiveKind: 'observation',
  primitivePayload: { type: 'quarantine' },
  causalReadSet: [],
  metadata: { level: 'attention' },  // ← flows through to LedgerEvent
});
```

`EventMetadata` is `{ level?: string; [key: string]: unknown }`.

---

## TDD Sequence (London-school outside-in)

1. **RED acceptance:** Write `aperture-push.test.ts` importing `ApertureProjector` (doesn't exist yet). Run — fails with `ApertureProjector is not a constructor`.
2. **RED unit:** Write `aperture-projector.test.ts` with a mocked `NotificationService`. Run — fails with `Cannot find module`.
3. **GREEN:** Create `projectors/aperture-projector.ts` + `notification-policy.ts`. Add `subscribe()` to `Ledger` interface + impl. Export from `index.ts`. Run — all pass.
4. **REFACTOR:** Add dedicated `NotificationPolicy` unit tests + projector purity contract test (same input → same normalized output, excluding time-based `id`/`ts`).

---

## Purity Contract Test Pattern

```typescript
// Two independent instances, same input, normalized output must match
const p1 = new ApertureProjector(makeNotifier());
const p2 = new ApertureProjector(makeNotifier());

const input: LedgerEvent = { ... };
p1.onCommit(0, input);
p2.onCommit(0, input);

const normalize = (e: ApertureEvent) => ({ category: e.category, level: e.level, title: e.title });
expect(p1.queryEvents().map(normalize)).toEqual(p2.queryEvents().map(normalize));
```

Exclude `id` and `ts` from comparison (time-based, non-deterministic).

---

## Key Files (Walkthrough C reference implementation)

| File | Role |
|------|------|
| `src/ledger/ledger.ts` | `LedgerSubscriber` + `subscribe()` on `Ledger` interface |
| `src/ledger/ledger-impl.ts` | `subscribe()` impl + step (e) fire after `commitRow()` |
| `src/types.ts` | `EventMetadata` + `metadata?` on `PrimitiveInput` |
| `src/projectors/notification-policy.ts` | Pure policy value object |
| `src/projectors/aperture-projector.ts` | `ApertureProjector` + `NotificationService` interface |
| `src/__tests__/acceptance/aperture-push.test.ts` | Outside-in acceptance test |
| `src/__tests__/unit/aperture-projector.test.ts` | Unit test with mocked notifier |
| `src/__tests__/unit/aperture-projector-purity.test.ts` | Purity contract test |
| `src/__tests__/unit/notification-policy.test.ts` | Policy unit tests |

---

## Anti-patterns

- **Don't poll `ledger.queryEvents()`** — subscribers get events pushed synchronously; polling is redundant and racy.
- **Don't couple to `WalBackend` internals** — `LedgerSubscriber.onCommit` gives you the `LedgerEvent`; you don't need BLAKE3 hashes or segment records.
- **Don't put SQLite DDL in the projector constructor** — inject a `ProjectionStore` port if durable storage is needed; keep the projector pure over its store interface.
- **Don't skip the purity contract test** — projectors MUST be deterministic; the purity test catches hidden shared state across instances.
