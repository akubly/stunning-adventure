# SKILL: better-sqlite3 Atomic Read-Modify-Write Transaction

**Version:** 1.0  
**Author:** Roger (M8 Slice B, 2026-06-05)  
**Context:** Eureka `SqliteTrustUpdater` — applicable to any better-sqlite3 atomic mutation

---

## Purpose

When you need to atomically read a row, transform it, and write it back — serializing
concurrent callers — use `db.transaction(fn).immediate(args)`. This skill documents the
correct idiom, the error propagation guarantee, and the common mistakes.

---

## The Pattern

```typescript
import type Database from 'better-sqlite3';

type Args = { id: string; fn: (current: number) => number };

class SqliteAtomicMutator {
  private readonly runTxn: (args: Args) => void;

  constructor(db: Database.Database) {
    const selectStmt = db.prepare<[string], { value: number | null }>(
      'SELECT value FROM items WHERE id = ?',
    );
    const updateStmt = db.prepare<[number, string]>(
      "UPDATE items SET value = ?, updated_at = datetime('now') WHERE id = ?",
    );

    // Compile the transaction once in the constructor. Reuse across calls.
    const rawTxn = db.transaction((args: Args) => {
      const row = selectStmt.get(args.id);
      if (!row) throw new NotFoundError(args.id);      // ← throws inside txn → auto-rollback

      const newValue = args.fn(row.value ?? NaN);      // ← fn throw → auto-rollback (C-2 pattern)

      if (!Number.isFinite(newValue) || newValue < 0 || newValue > 1) {
        throw new InvalidValueError(newValue, 'storage', `out of range: ${newValue}`);  // ← auto-rollback
      }

      updateStmt.run(newValue, args.id);               // ← only runs if fn returned valid value
    });

    // .immediate() wraps in BEGIN IMMEDIATE — acquires write lock up front.
    this.runTxn = (args: Args) => rawTxn.immediate(args);
  }

  async mutate(args: Args): Promise<void> {
    this.runTxn(args);   // better-sqlite3 is synchronous; async wrapper satisfies interface
  }
}
```

---

## Why BEGIN IMMEDIATE (not DEFERRED)

| Mode | When write lock acquired | Risk |
|------|--------------------------|------|
| `DEFERRED` (default) | At first write statement | SQLITE_BUSY_SNAPSHOT if a concurrent writer upgraded between your SELECT and UPDATE |
| `IMMEDIATE` | At transaction start | No race window — write lock held throughout |
| `EXCLUSIVE` | At transaction start | Blocks all readers too; overkill for WAL mode |

**Verdict:** Use IMMEDIATE for read-modify-write. WAL mode allows concurrent readers during
an IMMEDIATE writer. `busy_timeout=5000ms` (set in `openDatabase`) makes concurrent callers
retry rather than fail.

---

## Error Propagation Guarantee

better-sqlite3's transaction wrapper propagates any thrown error out of `.immediate()` (or
`.deferred()`/`.exclusive()`) **completely unchanged** — same object reference, same `code`,
no wrapping. Verified against:

- Custom domain errors (`FactNotFoundError`, `InvalidTrustValueError`) — propagate as-is
- Arbitrary caller errors (`new Error('boom')`) — propagate as-is; `rejects.toBe(boom)` passes
- The rollback is automatic on any throw; you do not need try/finally to rollback

**One caveat:** if the rollback itself fails (disk full, WAL corruption), better-sqlite3 may
wrap in its own error. This is not a normal operation concern.

---

## Calling `.immediate()`

```typescript
// Correct: wrap the immediate call in a closure (explicit binding)
this.runTxn = (args: Args) => rawTxn.immediate(args);

// Also correct: call directly at each use site
rawTxn.immediate(args);

// Risky: bare property reference without binding (works in bsl v9+ but implicit)
// this.runTxn = rawTxn.immediate;  // ← avoid; prefer the explicit closure above
```

---

## NaN / NULL Convention (Eureka-specific)

SQLite has no NaN literal. Eureka stores `NULL` for NaN in REAL columns.

On **read:** `row.trust === null ? NaN : row.trust`  
On **write before fn:** if stored is NULL, hydrate as NaN → pass to fn → fn likely produces
NaN-derived garbage → `InvalidTrustValueError` fires before UPDATE.  
On **write after fn:** if fn returns NaN → throw `InvalidTrustValueError` → rollback. NaN
never reaches the UPDATE.

---

## Contract Tests to Write

| Test | What to verify |
|------|----------------|
| C-1 Happy path | fn(current) result is written; SELECT after txn returns new value |
| C-2 fn throws | error propagates unchanged; SELECT still returns original value |
| C-3 fn returns NaN | InvalidValueError thrown; SELECT still returns original value |
| C-4 Row missing | NotFoundError thrown before fn called; fn never invoked |
| C-5 5 concurrent | Promise.all of N mutations; final value = start + N * delta |
| C-6 Different keys | Both reach correct final value; no cross-key interference |
| C-7 Cross-session | Mutation on sessionB does not affect sessionA's row |

Use `runTrustUpdaterContract` (or the analogous shared contract helper) to verify all 7.

---

## When NOT to Use This Pattern

- **Read-only queries** — no transaction needed; `stmt.get(...)` is already atomic.
- **Append-only writes** (INSERT, no prior read) — DEFERRED is fine; no read-then-write race.
- **Multi-table reads with no write** — DEFERRED read transaction or no transaction.
- **One-off migrations** — use `db.transaction(fn).immediate()` for serialization but the
  prepared-statement-in-constructor pattern is unnecessary (migrations run once).
