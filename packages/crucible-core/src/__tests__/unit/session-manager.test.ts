/**
 * REFACTOR PHASE — Unit tests for SessionManager collaborator contract.
 *
 * TDD Strategy        : §4.1 REFACTOR Phase — Refactor 2 (docs/crucible-tdd-strategy.md)
 *                       "Add invariant test (fork point ≤ parent ledger size,
 *                        transitive-dep-graph captured)"
 * Naming convention   : §8.5 — "[Layer] [Component] [Method/Scenario] [Expected Behavior]"
 *                       Unit-layer prefix: "Unit: SessionManager ..."
 *                       Examples from §8.5: "L1 Ledger.append() rejects when hook returns VETO"
 *
 * These tests use a mocked DB collaborator per London-school interaction testing.
 * The mock captures the *contract* between SessionManager and its DB seam —
 * not the DB implementation details.
 *
 * Integration cycle with real SQLite is the next REFACTOR step (§4.1 Refactor 3):
 *   packages/crucible-cli/src/__tests__/integration/session-fork.integration.ts
 *
 * Mock Drift Defense (§7): shared-fixture mockDB builder will be extracted into
 *   packages/crucible-core/src/__tests__/fixtures/mock-db-builder.ts
 * in a follow-up. For this first unit-test file the mockDB is kept inline.
 *
 * These tests MUST BE RED until Roger's REFACTOR lands SessionManager.
 * If Roger's refactor lands first, some/all will go GREEN — also valid outcome.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// SessionManager does not exist yet — import failure is the intended RED signal.
// If Roger exports it from index.ts, this resolves; otherwise "SessionManager is
// not a constructor" is the correct RED failure mode.
import { SessionManager } from '../../index.js';

// ─── Shared mockDB shape ──────────────────────────────────────────────────────
// DB collaborator contract locked by this test file.
// Shape: { getSession, insertSession, queryEvents }
// All three methods are present on every mock instance so tests can assert
// "was NOT called" against queryEvents in validation-error scenarios.
//
// Inline per §7 Mock Drift Defense note above; extract to fixture builder later.

type MockDB = {
  getSession: ReturnType<typeof vi.fn>;
  insertSession: ReturnType<typeof vi.fn>;
  queryEvents: ReturnType<typeof vi.fn>;
};

function makeMockDB(): MockDB {
  return {
    getSession: vi.fn(),
    insertSession: vi.fn(),
    queryEvents: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SessionManager', () => {
  let mockDB: MockDB;

  beforeEach(() => {
    mockDB = makeMockDB();
    vi.resetAllMocks();
  });

  // ── §4.1 Refactor 2 — fork-point bounds invariant ──────────────────────────

  it(
    'Unit: SessionManager.forkSession() rejects fork beyond parent ledger size',
    async () => {
      // Arrange — parent ledger has 47 events (offsets 0–46); fork at 50 must fail.
      mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47 });

      const manager = new SessionManager(mockDB);

      // Act + Assert — permissive regex gives Roger wording freedom while
      // ensuring the error message references the offending values.
      await expect(
        manager.forkSession('parent-id', 50),
      ).rejects.toThrow(/exceeds parent ledger size 47/);
    },
  );

  it(
    'Unit: SessionManager.forkSession() rejects negative fork offset',
    async () => {
      // Proactive edge case from §4.1 ForkLineage invariant:
      // "Fork point must be non-negative."
      // Edge cases aren't optional — they're where the real bugs hide.
      mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47 });

      const manager = new SessionManager(mockDB);

      await expect(
        manager.forkSession('parent-id', -1),
      ).rejects.toThrow(/non-negative|negative/);
    },
  );

  // ── §4.1 Refactor 2 — transitive dependency graph inheritance ──────────────

  it(
    'Unit: SessionManager.forkSession() child session inherits transitive dependency graph from parent',
    async () => {
      // Arrange — exact parentPlugins shape from §4.1:
      //   skill-x → util-lib (transitive) → lodash (transitive)
      const parentPlugins = {
        '@akubly/skill-x': '1.2.3',
        '@akubly/util-lib': '2.0.1',   // Transitive dep of skill-x
        'lodash': '4.17.21',             // Transitive dep of util-lib
      };

      mockDB.getSession.mockResolvedValue({
        id: 'parent-id',
        ledgerSize: 47,
        pluginVersions: parentPlugins,
      });
      // insertSession must resolve so forkSession can return a child id.
      mockDB.insertSession.mockResolvedValue('child-id');

      const manager = new SessionManager(mockDB);

      // Act
      await manager.forkSession('parent-id', 23);

      // Assert — full transitive graph propagated; objectContaining keeps other
      // fields (e.g. id, createdAt) from making the assertion brittle.
      expect(mockDB.insertSession).toHaveBeenCalledWith(
        expect.objectContaining({
          pluginVersions: parentPlugins,
        }),
      );
    },
  );

  // ── Unit-layer lineage pin (acceptance covers end-to-end; unit pins contract)

  it(
    'Unit: SessionManager.forkSession() child fork lineage records parentSessionId and forkPointEventId',
    async () => {
      // Arrange
      mockDB.getSession.mockResolvedValue({ id: 'parent-id', ledgerSize: 47 });
      mockDB.insertSession.mockResolvedValue('child-id');

      const manager = new SessionManager(mockDB);

      // Act
      await manager.forkSession('parent-id', 23);

      // Assert — lineage metadata pinned at unit layer; keeps Roger honest about
      // what SessionManager writes into the DB row.
      expect(mockDB.insertSession).toHaveBeenCalledWith(
        expect.objectContaining({
          parentSessionId: 'parent-id',
          forkPointEventId: 23,
        }),
      );
    },
  );
});
