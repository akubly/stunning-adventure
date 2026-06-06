/**
 * REFACTOR 3 — Integration tests for SessionManager + real SQLite DB.
 *
 * TDD Strategy        : §4.1 REFACTOR Phase — Refactor 3 (docs/crucible-tdd-strategy.md)
 *                       "Replace mocks with integration stubs — real SQLite :memory:"
 * Locked Decision     : OQ-2 FEDERATE (2026-06-06) — Crucible owns its own SQLite schema,
 *                       independent of Cairn's event_log. NO Cairn imports here.
 * Naming convention   : §8.5 — "[Layer] [Component] [Scenario] [Expected Behavior]"
 *                       Integration-layer prefix: "Integration: ..."
 *
 * This file drives SessionManager.forkSession() + the raw DB interface against a
 * REAL better-sqlite3 :memory: database (via createTestDatabase()). It verifies the
 * same locked fork invariants as the unit tests (A1-1 … A1-4), but at the DB layer:
 * data is actually written to and read from SQLite rows, not a JS Map.
 *
 * Invariants exercised:
 *   A1-1  Child parentSessionId === parent session id
 *   A1-2  Child forkPointEventId === fork offset (23)
 *   A1-3  Parent prefix [0..23] contains exactly 24 events (inclusive-inclusive [a,b] range)
 *   A1-4  Parent ledger is unmodified after fork (ledgerSize still 47)
 *
 * Additional DB-layer invariants:
 *   B1    Bounds: fork at offset = ledgerSize is rejected (strict < bound)
 *   B2    Bounds: negative fork offset is rejected
 *   B3    Child ledgerSize = forkPointEventId + 1 immediately after fork (no own events)
 *
 * // GREEN — Refactor 3 complete, 2026-06-06. Roger's commit a57f95f:
 * //   better-sqlite3 promoted to dependencies, SCHEMA_V1_SQL single-sourced in
 * //   crucible-core/schema.ts, createSQLiteDB exported — all tests GREEN.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '@akubly/crucible-core';
import type { InMemoryDB } from '@akubly/crucible-core';
import { createTestDatabase } from '../fixtures/test-db.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Populates a real SQLite DB with a root session having 47 committed events
 * (offsets 0..46 inclusive). Returns the parent session id.
 *
 * Matches Acceptance Scenario A1: "Given a Crucible session with 47 committed primitives."
 */
function buildParentWith47Events(db: InMemoryDB): string {
  const parentId = 'parent-session-id';
  db.insertRootSession(parentId, 1_000_000);
  for (let i = 0; i < 47; i++) {
    db.pushEvent(parentId, {
      primitiveKind: 'observation',
      primitivePayload: { content: `event-${i}` },
      causalReadSet: [],
      offset: i,
    });
  }
  return parentId;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Session Fork — Integration (real SQLite :memory:)', () => {
  let db: InMemoryDB;
  let manager: SessionManager;

  beforeEach(() => {
    // GREEN: createSQLiteDB is exported and functional.
    db = createTestDatabase();
    manager = new SessionManager(db);
  });

  // ── A1-1: Fork lineage — parentSessionId persists to DB ───────────────────

  it(
    'Integration: SessionManager.forkSession() stores parentSessionId in real SQLite rows [A1-1]',
    async () => {
      // Arrange — parent session with 47 events (offsets 0..46)
      const parentId = buildParentWith47Events(db);

      // Act — fork at offset 23 (well within the 47-event ledger)
      const childId = await manager.forkSession(parentId, 23);

      // Assert — lineage metadata was written to the DB row, not just kept in memory
      const meta = db.getMetadata(childId);
      expect(meta).not.toBeNull();
      expect(meta!.parentSessionId).toBe(parentId);
    },
  );

  // ── A1-2: Fork lineage — forkPointEventId persists to DB ─────────────────

  it(
    'Integration: SessionManager.forkSession() stores forkPointEventId=23 in real SQLite rows [A1-2]',
    async () => {
      const parentId = buildParentWith47Events(db);
      const childId = await manager.forkSession(parentId, 23);

      const meta = db.getMetadata(childId);
      expect(meta!.forkPointEventId).toBe(23);
    },
  );

  // ── A1-3: Inclusive-inclusive [a, b] range — parent prefix [0..23] ────────
  //
  // Verifies that the 24 parent events at offsets 0..23 are correctly stored and
  // queryable via the inclusive-inclusive range convention. This locks the SQLite
  // adapter's queryEvents implementation to the same [a, b] semantics as the
  // in-memory DB. (Child prefix delegation via session.ts is NOT tested here;
  // that is the acceptance-test layer's responsibility.)

  it(
    'Integration: parent prefix [0..23] contains exactly 24 events after fork (inclusive-inclusive [a,b]) [A1-3]',
    async () => {
      const parentId = buildParentWith47Events(db);
      await manager.forkSession(parentId, 23);

      // Inclusive-inclusive: [0, 23] = offsets 0, 1, ..., 23 = 24 events
      const prefix = await db.queryEvents(parentId, { range: [0, 23] });
      expect(prefix).toHaveLength(24);
      expect(prefix[0].offset).toBe(0);
      expect(prefix[23].offset).toBe(23);
    },
  );

  // ── A1-4: Parent unmodified — ledgerSize persists unchanged ───────────────

  it(
    'Integration: parent ledgerSize remains 47 after fork — parent is unmodified [A1-4]',
    async () => {
      const parentId = buildParentWith47Events(db);
      await manager.forkSession(parentId, 23);

      const parent = await db.getSession(parentId);
      expect(parent).not.toBeNull();
      // Root session: ledgerSize = count(own events) = 47
      expect(parent!.ledgerSize).toBe(47);
    },
  );

  // ── B1: Fork offset >= ledgerSize rejects (strict < bound) ───────────────
  //
  // Validates that the real DB's getSession returns the correct ledgerSize and
  // that SessionManager's strict-less-than guard fires correctly with that value.

  it(
    'Integration: rejects fork at offset equal to ledger size (bound check with real DB) [B1]',
    async () => {
      const parentId = buildParentWith47Events(db);

      // forkOffset=47 is OUT OF BOUNDS: valid offsets are 0..46 (ledgerSize=47,
      // strict < bound means offsets must be < 47, i.e. 0..46 inclusive).
      await expect(manager.forkSession(parentId, 47)).rejects.toThrow(
        /must be < parent ledger size|exceeds parent ledger size/i,
      );
    },
  );

  // ── B2: Negative fork offset rejects ─────────────────────────────────────

  it(
    'Integration: rejects negative fork offset (ForkLineage invariant, real DB) [B2]',
    async () => {
      const parentId = buildParentWith47Events(db);

      await expect(manager.forkSession(parentId, -1)).rejects.toThrow(/non-negative|negative/i);
    },
  );

  // ── B3: Freshly forked child has correct initial ledgerSize ───────────────
  //
  // Child has zero own events immediately after fork.
  // ledgerSize formula: forkPointEventId + 1 + ownEvents.length = 23 + 1 + 0 = 24.
  // Verifies the SQLite adapter's ledgerSize computation against the in-memory formula.

  it(
    'Integration: freshly forked child has ledgerSize = forkPointEventId + 1 (no own events yet) [B3]',
    async () => {
      const parentId = buildParentWith47Events(db);
      const childId = await manager.forkSession(parentId, 23);

      const child = await db.getSession(childId);
      expect(child).not.toBeNull();
      // forkPointEventId=23, ownEvents=0 → ledgerSize = 24
      expect(child!.ledgerSize).toBe(24);
    },
  );

  // ── SQLite-C1: Duplicate (session_id, offset) violates PK constraint ──────
  //
  // The events table has PRIMARY KEY (session_id, "offset"). A map-backed fake
  // could silently overwrite a duplicate offset; only a real SQLite engine
  // enforces the constraint and surfaces an error. This assertion proves the
  // adapter is backed by a genuine DB, not a fake.

  it(
    'Integration: duplicate (session_id, offset) insertion throws SQLite PK constraint error [SQLite-C1]',
    () => {
      db.insertRootSession('constraint-test', 1_000_000);
      db.pushEvent('constraint-test', {
        primitiveKind: 'observation',
        primitivePayload: { content: 'first' },
        causalReadSet: [],
        offset: 0,
      });

      // A second pushEvent at offset=0 MUST throw — SQLite enforces the
      // composite PK (session_id, "offset"). A map-backed fake would silently
      // overwrite and this expect would never trigger.
      //
      // The session already exists (insertRootSession above), so the pushEvent
      // session-exists guard does NOT fire — only the SQLite PK constraint can
      // throw here. better-sqlite3 surfaces PK violations as a SqliteError with
      // message "UNIQUE constraint failed: ..." (SQLite uses UNIQUE indexes for
      // PKs) and code SQLITE_CONSTRAINT_PRIMARYKEY.
      expect(() =>
        db.pushEvent('constraint-test', {
          primitiveKind: 'observation',
          primitivePayload: { content: 'duplicate' },
          causalReadSet: [],
          offset: 0,
        }),
      ).toThrow(/UNIQUE constraint failed|SQLITE_CONSTRAINT/i);
    },
  );
});
