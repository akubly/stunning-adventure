/**
 * ApertureProjector — L2 post-commit projection for attention-tier events.
 *
 * Implements LedgerSubscriber: registered via ledger.subscribe(projector),
 * receives each committed LedgerEvent, and:
 *   1. Evaluates the event level via NotificationPolicy.shouldPush()
 *   2. Materializes qualifying events into an in-memory ApertureEvent store
 *   3. Pushes a badge update (unreadCount + icon) via NotificationService
 *
 * §4.3 Walkthrough C (docs/crucible-tdd-strategy.md).
 * OQ-2 FEDERATE: zero Cairn imports.
 */

import { randomUUID } from 'node:crypto';
import type { LedgerEvent, LedgerSubscriber } from '../ledger/ledger.js';
import { NotificationPolicy, isQuarantine } from './notification-policy.js';

// ─── NotificationService port ─────────────────────────────────────────────────

/**
 * NotificationService — the push-notification collaborator.
 *
 * The real CLI implementation renders a badge (unreadCount + icon).
 * Tests mock this interface to assert the projector's notification output
 * without coupling to any UI or CLI framework.
 */
export interface NotificationService {
  push(update: { unreadCount: number; icon: string }): void;
}

// ─── ApertureEvent value type ─────────────────────────────────────────────────

/**
 * A materialized Aperture event — the projection output stored in the
 * in-memory event log. Excludes the WAL's hash-chain internals; carries
 * only the fields Aperture consumers need.
 */
export interface ApertureEvent {
  /** UUID assigned at materialization time — excluded from purity comparisons. */
  id: string;
  /** Aperture category: 'system' | 'decision' | 'observation'. */
  category: string;
  /** Event level: 'urgent' | 'attention' | etc. */
  level: string;
  /** Short title derived from the primitive payload. */
  title: string;
  /** Source primitive kind. */
  primitiveKind: string;
  /** Source primitive payload (pass-through). */
  primitivePayload: unknown;
  /** Unix epoch ms at materialization time — excluded from purity comparisons. */
  ts: number;
}

// ─── Query options ────────────────────────────────────────────────────────────

export interface ApertureQueryOpts {
  /** Filter by level (e.g. 'attention'). Omit to return all events. */
  level?: string;
}

// ─── ApertureProjector ────────────────────────────────────────────────────────

/**
 * ApertureProjector — registers as a LedgerSubscriber and materializes
 * attention/urgent-tier events into a queryable in-memory event log,
 * pushing badge updates via NotificationService after each materialization.
 *
 * Design: internal array store (not SQLite DDL) for test isolation and
 * simplicity. If persistence across process restarts is needed, a future
 * adapter can replace the array with a projected SQLite table — the
 * queryEvents() interface is stable.
 */
export class ApertureProjector implements LedgerSubscriber {
  private readonly events: ApertureEvent[] = [];

  constructor(
    private readonly notifier: NotificationService,
    private readonly policy: NotificationPolicy = new NotificationPolicy(),
  ) {}

  /**
   * Called by LedgerImpl after each successful commitRow().
   * Ignores events that don't qualify for a push (per NotificationPolicy).
   */
  onCommit(offset: number, event: LedgerEvent): void {
    const level = event.metadata?.level;
    if (!level || !this.policy.shouldPush(level)) return;

    const category = this.categorize(event);
    const materialized: ApertureEvent = {
      id: randomUUID(),
      category,
      level,
      title: this.extractTitle(event),
      primitiveKind: event.primitiveKind,
      primitivePayload: event.primitivePayload,
      ts: Date.now(),
    };
    this.events.push(materialized);

    this.notifier.push({
      unreadCount: this.events.length,
      icon: this.policy.getIcon(category, event.primitivePayload, level),
    });
  }

  /**
   * Query materialized Aperture events.
   * If opts.level is provided, filters to events with that level.
   * Returns a snapshot (modifications to the returned array are not persisted).
   */
  queryEvents(opts: ApertureQueryOpts = {}): ApertureEvent[] {
    if (opts.level !== undefined) {
      return this.events.filter(e => e.level === opts.level);
    }
    return this.events.slice();
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private categorize(event: LedgerEvent): string {
    if (isQuarantine(event.primitivePayload)) return 'system';
    if (event.primitiveKind === 'decision') return 'decision';
    return 'observation';
  }

  private extractTitle(event: LedgerEvent): string {
    const payload = event.primitivePayload;
    if (payload !== null && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (typeof p['type'] === 'string') return p['type'];
      if (typeof p['title'] === 'string') return p['title'];
    }
    return event.primitiveKind;
  }
}
