/**
 * Acceptance test (GREEN) — Session Fork from Arbitrary Ledger Position (A1).
 *
 * Acceptance Scenario : A1 — Session Fork from Arbitrary Ledger Position
 * PRD User Stories    : US-A-NEW-1 (Branching Sessions), US-E-2 (Counterfactual Replay)
 * TDD Strategy        : §4.1 Walkthrough A (docs/crucible-tdd-strategy.md)
 * Locked Decision     : Aaron decision 2a — L1-native branching (L1 Ledger owns fork lineage)
 * Naming convention   : §8.5 — "[Layer] [Component] [Scenario] [Expected Behavior]"
 *                       Acceptance-level prefix: "Acceptance: ..."
 *
 * No mocks are introduced here — this is the outermost, user-observable acceptance
 * ring. The implementation descends through the full outside-in stack described in
 * §4.1 and this test is now GREEN.
 *
 * Invariants exercised (A1):
 *   1. Child `parentSessionId` === parent session id
 *   2. Child `forkPointEventId` === 23 (the fork offset)
 *   3. Child ledger logical prefix [0..23] equals parent prefix [0..23]
 *   4. Parent ledger remains unmodified (still 47 primitives)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createSession, fork } from '../../index.js';
import { resetInMemoryDb } from '@akubly/crucible-core';

describe('Session Fork', () => {
  // Reset the module-level in-memory DB so each test starts from a clean slate.
  beforeEach(() => {
    resetInMemoryDb();
  });

  it(
    'Acceptance: Fork session creates child with inherited ledger prefix [parentId, forkOffset, childLineage]',
    async () => {
      // ── Arrange ──────────────────────────────────────────────────────────
      // Parent session with 47 committed primitives (event offsets 0–46).
      // Matches A1: "Given a Crucible session with 47 committed primitives".
      const parentSession = await createSession();

      for (let i = 0; i < 47; i++) {
        await parentSession.append({
          primitiveKind: 'observation',
          primitivePayload: { content: `event-${i}` },
          causalReadSet: [],
        });
      }

      // ── Act ───────────────────────────────────────────────────────────────
      // Fork at event offset 23 — the position of the previously-rejected
      // Forge prescription per A1: "fork --at 23 --accept-instead".
      const childSession = await fork(parentSession.id, { atOffset: 23 });

      // ── Assert: lineage metadata ──────────────────────────────────────────
      // A1: "a new child session is created with parent_session_id = original,
      //       fork_point_event_id = 23"
      expect(childSession.metadata.parentSessionId).toBe(parentSession.id);
      expect(childSession.metadata.forkPointEventId).toBe(23);

      // ── Assert: child logical prefix equals parent prefix [0..23] ─────────
      // A1: "the child session's ledger logically extends from the parent's
      //       prefix [0..23]"
      const childPrefix  = await childSession.query({ range: [0, 23] });
      const parentPrefix = await parentSession.query({ range: [0, 23] });
      expect(childPrefix).toEqual(parentPrefix);

      // ── Assert: parent unmodified ─────────────────────────────────────────
      // A1: "the parent session remains unmodified"
      const parentEventsAfter = await parentSession.query({ range: [0, 46] });
      expect(parentEventsAfter).toHaveLength(47);
    },
  );
});
