/**
 * Unit tests — ApertureProjector with mocked NotificationService collaborator.
 *
 * London-school style: the NotificationService collaborator is mocked; only the
 * ApertureProjector logic is exercised here (no real ledger, no WAL).
 *
 * TDD Strategy : §4.3 Walkthrough C GREEN phase (docs/crucible-tdd-strategy.md)
 *
 * Tests:
 *   AP-1: attention-tier quarantine → category='system', icon='🔒', unreadCount=1
 *   AP-2: urgent-tier decision → category='decision', icon='📋', push called
 *   AP-3: info-tier event → NOT materialized, notifier NOT called
 *   AP-4: no metadata → NOT materialized, notifier NOT called
 *   AP-5: multiple attention events → unreadCount increments correctly
 *   AP-6: queryEvents() without filter returns all materialized events
 *   AP-7: queryEvents({ level }) filters correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApertureProjector } from '../../projectors/aperture-projector.js';
import type { NotificationService } from '../../projectors/aperture-projector.js';
import type { LedgerEvent } from '../../ledger/ledger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    primitiveKind: 'observation',
    primitivePayload: { content: 'default' },
    causalReadSet: [],
    offset: 0,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ApertureProjector', () => {
  let notifier: NotificationService;

  beforeEach(() => {
    notifier = { push: vi.fn() };
  });

  it('AP-1: attention-tier quarantine → system category, 🔒 icon, unreadCount=1', () => {
    const projector = new ApertureProjector(notifier);

    projector.onCommit(
      0,
      makeEvent({
        primitivePayload: { type: 'quarantine', pluginId: 'bad-plugin' },
        metadata: { level: 'attention' },
      }),
    );

    const events = projector.queryEvents({ level: 'attention' });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('system');
    expect(events[0].level).toBe('attention');
    expect(notifier.push).toHaveBeenCalledWith({ unreadCount: 1, icon: '🔒' });
  });

  it('AP-2: urgent-tier decision → decision category, 📋 icon, push called once', () => {
    const projector = new ApertureProjector(notifier);

    projector.onCommit(
      0,
      makeEvent({
        primitiveKind: 'decision',
        primitivePayload: { outcome: 'reject' },
        metadata: { level: 'urgent' },
      }),
    );

    const events = projector.queryEvents({ level: 'urgent' });
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe('decision');
    // I-5: decision badge is 📋 (not ✓ — decisions can be rejections)
    expect(notifier.push).toHaveBeenCalledWith({ unreadCount: 1, icon: '📋' });
  });

  it('AP-3: info-tier event → NOT materialized, notifier NOT called', () => {
    const projector = new ApertureProjector(notifier);

    projector.onCommit(0, makeEvent({ metadata: { level: 'info' } }));

    expect(projector.queryEvents()).toHaveLength(0);
    expect(notifier.push).not.toHaveBeenCalled();
  });

  it('AP-4: event with no metadata → NOT materialized, notifier NOT called', () => {
    const projector = new ApertureProjector(notifier);

    projector.onCommit(0, makeEvent());

    expect(projector.queryEvents()).toHaveLength(0);
    expect(notifier.push).not.toHaveBeenCalled();
  });

  it('AP-5: three attention events → unreadCount increments to 3', () => {
    const projector = new ApertureProjector(notifier);
    const attentionEvent = makeEvent({
      primitivePayload: { type: 'quarantine' },
      metadata: { level: 'attention' },
    });

    projector.onCommit(0, attentionEvent);
    projector.onCommit(1, attentionEvent);
    projector.onCommit(2, attentionEvent);

    expect(projector.queryEvents()).toHaveLength(3);
    expect(vi.mocked(notifier.push).mock.calls[2][0]).toEqual({ unreadCount: 3, icon: '🔒' });
  });

  it('AP-6: queryEvents() without filter returns all materialized events', () => {
    const projector = new ApertureProjector(notifier);

    projector.onCommit(0, makeEvent({ metadata: { level: 'attention' } }));
    projector.onCommit(1, makeEvent({ metadata: { level: 'urgent' } }));

    expect(projector.queryEvents()).toHaveLength(2);
  });

  it('AP-7: queryEvents({ level }) filters by level', () => {
    const projector = new ApertureProjector(notifier);

    projector.onCommit(0, makeEvent({ metadata: { level: 'attention' } }));
    projector.onCommit(1, makeEvent({ metadata: { level: 'urgent' } }));

    expect(projector.queryEvents({ level: 'attention' })).toHaveLength(1);
    expect(projector.queryEvents({ level: 'urgent' })).toHaveLength(1);
    expect(projector.queryEvents({ level: 'notice' })).toHaveLength(0);
  });
});
