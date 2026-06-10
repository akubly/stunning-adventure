/**
 * Projector purity contract test — ApertureProjector.
 *
 * REFACTOR phase of §4.3 Walkthrough C (docs/crucible-tdd-strategy.md).
 *
 * Verifies that ApertureProjector is a pure projection:
 *   "same input → same materialized output (excluding time-based id and ts)"
 *
 * Two independent projector instances receive the same LedgerEvent sequence.
 * After projection, the normalized outputs (id and ts stripped) must be
 * structurally equal. This guards against any hidden mutable state or
 * non-deterministic side-effects in the projector.
 *
 * Purity invariants:
 *   PC-1: category, level, title, primitiveKind are deterministic from input
 *   PC-2: id and ts differ between instances (non-deterministic) — excluded
 *   PC-3: queryEvents({ level }) count is identical across instances
 *   PC-4: notifier push count equals materialized event count
 */

import { describe, it, expect, vi } from 'vitest';
import { ApertureProjector } from '../../projectors/aperture-projector.js';
import type { NotificationService, ApertureEvent } from '../../projectors/aperture-projector.js';
import type { LedgerEvent } from '../../ledger/ledger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip time-based fields before structural comparison. */
function normalize(e: ApertureEvent) {
  return {
    category: e.category,
    level: e.level,
    title: e.title,
    primitiveKind: e.primitiveKind,
  };
}

function makeNotifier(): NotificationService {
  return { push: vi.fn() };
}

// ─── Contract ─────────────────────────────────────────────────────────────────

describe('ApertureProjector — projection purity contract', () => {
  it('PC-1/PC-2: same quarantine input → same normalized output across two instances', () => {
    const p1 = new ApertureProjector(makeNotifier());
    const p2 = new ApertureProjector(makeNotifier());

    const input: LedgerEvent = {
      primitiveKind: 'observation',
      primitivePayload: { type: 'quarantine', pluginId: 'bad-plugin' },
      causalReadSet: [],
      metadata: { level: 'attention' },
      offset: 0,
    };

    p1.onCommit(0, input);
    p2.onCommit(0, input);

    const events1 = p1.queryEvents();
    const events2 = p2.queryEvents();

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);

    // PC-1: deterministic fields match
    expect(events1.map(normalize)).toEqual(events2.map(normalize));

    // PC-2: time-based fields differ or are at least independent (no shared state)
    // We don't assert equality on id/ts — they are intentionally excluded.
    expect(events1[0].id).toBeDefined();
    expect(events2[0].id).toBeDefined();
  });

  it('PC-3: queryEvents({ level }) count is identical across instances', () => {
    const p1 = new ApertureProjector(makeNotifier());
    const p2 = new ApertureProjector(makeNotifier());

    const attentionEvent: LedgerEvent = {
      primitiveKind: 'observation',
      primitivePayload: { type: 'quarantine' },
      causalReadSet: [],
      metadata: { level: 'attention' },
      offset: 0,
    };
    const urgentEvent: LedgerEvent = {
      primitiveKind: 'decision',
      primitivePayload: { outcome: 'reject' },
      causalReadSet: [],
      metadata: { level: 'urgent' },
      offset: 1,
    };
    const infoEvent: LedgerEvent = {
      primitiveKind: 'observation',
      primitivePayload: { content: 'log' },
      causalReadSet: [],
      metadata: { level: 'info' },
      offset: 2,
    };

    for (const proj of [p1, p2]) {
      proj.onCommit(0, attentionEvent);
      proj.onCommit(1, urgentEvent);
      proj.onCommit(2, infoEvent);
    }

    expect(p1.queryEvents({ level: 'attention' })).toHaveLength(1);
    expect(p2.queryEvents({ level: 'attention' })).toHaveLength(1);
    expect(p1.queryEvents({ level: 'urgent' })).toHaveLength(1);
    expect(p2.queryEvents({ level: 'urgent' })).toHaveLength(1);
    // info-tier not materialized
    expect(p1.queryEvents({ level: 'info' })).toHaveLength(0);
    expect(p2.queryEvents({ level: 'info' })).toHaveLength(0);
  });

  it('PC-4: notifier push count equals number of materialized events', () => {
    const notifier1 = makeNotifier();
    const notifier2 = makeNotifier();
    const p1 = new ApertureProjector(notifier1);
    const p2 = new ApertureProjector(notifier2);

    const events: LedgerEvent[] = [
      { primitiveKind: 'observation', primitivePayload: { type: 'quarantine' }, causalReadSet: [], metadata: { level: 'attention' }, offset: 0 },
      { primitiveKind: 'observation', primitivePayload: { content: 'log' },      causalReadSet: [], metadata: { level: 'info' },      offset: 1 },
      { primitiveKind: 'decision',    primitivePayload: { outcome: 'reject' },   causalReadSet: [], metadata: { level: 'urgent' },    offset: 2 },
    ];

    for (const evt of events) {
      p1.onCommit(evt.offset, evt);
      p2.onCommit(evt.offset, evt);
    }

    expect(p1.queryEvents()).toHaveLength(2); // attention + urgent (not info)
    expect(p2.queryEvents()).toHaveLength(2);
    expect(vi.mocked(notifier1.push)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(notifier2.push)).toHaveBeenCalledTimes(2);
  });
});
