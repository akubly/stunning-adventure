/**
 * RED PHASE — Aperture Push Notification for Attention-Tier Events (A5)
 *
 * Acceptance Scenario : A5 — Aperture Push Notification
 * PRD User Stories    : Rosella Sprint 5 — Aperture push delivery path
 * TDD Strategy        : §4.3 Walkthrough C (docs/crucible-tdd-strategy.md)
 * Locked Decision     : OQ-2 FEDERATE — Crucible owns its own L1 WAL
 *                       (.squad/decisions.md)
 * Naming convention   : §8.5 — "[Layer] [Component] [Scenario] [Expected Behavior]"
 *                       Acceptance-level prefix: "Acceptance: ..."
 *
 * This test MUST FAIL with a missing-export error until:
 *   (a) ApertureProjector is created and exported from crucible-core index,
 *   (b) Ledger.subscribe() seam is wired in ledger-impl.ts, and
 *   (c) metadata.level flows from PrimitiveInput through LedgerEvent to the projector.
 *
 * Deviations from §4.3 illustrative snippet:
 *   - Acceptance test lives in crucible-core (not crucible-cli) — createLedger is a
 *     crucible-core export; no CLI layer needed for this test.
 *   - No `cli.setBadgeRenderer` — the NotificationService collaborator is mocked directly.
 *   - causalReadSet: [] is required by the real PrimitiveInput type.
 *
 * Invariants exercised (A5):
 *   1. ApertureProjector registers as a ledger subscriber via ledger.subscribe()
 *   2. An attention-tier event committed via ledger.append() is materialized by the projector
 *   3. projector.queryEvents({ level: 'attention' }) returns the materialized event
 *   4. The materialized event has category='system' for quarantine primitives
 *   5. The NotificationService is called with unreadCount=1 and icon='🔒'
 *   6. Non-attention-tier events do NOT trigger a badge push
 */

import { describe, it, expect, vi } from 'vitest';
import { createLedger, ApertureProjector } from '../../index.js';
import type { NotificationService } from '../../index.js';

describe('Aperture Push Notifications', () => {
  it(
    'Acceptance: attention-tier quarantine event materializes and pushes badge [attention, quarantine, badge-push]',
    async () => {
      // ── Arrange: ledger with aperture projector subscriber ────────────────
      const ledger = await createLedger();
      const mockNotifier: NotificationService = { push: vi.fn() };
      const projector = new ApertureProjector(mockNotifier);
      ledger.subscribe(projector);

      // ── Act: commit attention-tier quarantine event ───────────────────────
      await ledger.append({
        primitiveKind: 'observation',
        primitivePayload: { type: 'quarantine', pluginId: 'malicious-plugin', reason: 'Deny-list match' },
        causalReadSet: [],
        metadata: { level: 'attention' },
      });

      // ── Assert: projector materialized the event (A5 invariant 2–4) ──────
      const events = projector.queryEvents({ level: 'attention' });
      expect(events).toHaveLength(1);
      expect(events[0].category).toBe('system');
      expect(events[0].level).toBe('attention');

      // ── Assert: badge push fired (A5 invariant 5) ─────────────────────────
      expect(mockNotifier.push).toHaveBeenCalledWith({
        unreadCount: 1,
        icon: '🔒',
      });
    },
  );

  it(
    'Acceptance: info-tier event does NOT trigger badge push [info, no-push]',
    async () => {
      // ── Arrange ───────────────────────────────────────────────────────────
      const ledger = await createLedger();
      const mockNotifier: NotificationService = { push: vi.fn() };
      const projector = new ApertureProjector(mockNotifier);
      ledger.subscribe(projector);

      // ── Act: commit info-tier event ───────────────────────────────────────
      await ledger.append({
        primitiveKind: 'observation',
        primitivePayload: { content: 'routine log entry' },
        causalReadSet: [],
        metadata: { level: 'info' },
      });

      // ── Assert: nothing materialized, no push (A5 invariant 6) ──────────
      expect(projector.queryEvents()).toHaveLength(0);
      expect(mockNotifier.push).not.toHaveBeenCalled();
    },
  );
});
