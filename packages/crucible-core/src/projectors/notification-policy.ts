/**
 * NotificationPolicy — value object encoding push-notification rules.
 *
 * Extracted in the REFACTOR phase of §4.3 Walkthrough C.
 * Pure: no I/O, no async, no dependencies. Trivially unit-testable.
 *
 * Responsibilities:
 *   shouldPush  — whether a given event level warrants a badge push
 *   getIcon     — icon character for a category/payload/level combination
 *   getPriority — numeric sort priority for a given level
 */

import type { EventLevel } from '../types.js';

/**
 * Returns true if the primitive payload represents a quarantine event.
 * Shared by NotificationPolicy.getIcon() and ApertureProjector.categorize()
 * to avoid duplicating the same structural check.
 */
export function isQuarantine(payload: unknown): boolean {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    (payload as Record<string, unknown>)['type'] === 'quarantine'
  );
}

export class NotificationPolicy {
  /**
   * Returns true for levels that warrant a badge push (attention or urgent).
   * notice/info events are informational only — no push.
   */
  shouldPush(level: EventLevel): boolean {
    return level === 'attention' || level === 'urgent';
  }

  /**
   * Returns the display icon for a materialized Aperture event.
   *
   * Priority order:
   *   1. Quarantine payload → 🔒 (regardless of category or level)
   *   2. Decision category  → 📋 (neutral: decisions can be rejections)
   *   3. Tier-aware fallback:
   *        urgent    → ⚠️  (must-act, high severity)
   *        attention → 🔔  (must-act, standard severity)
   *        otherwise → ℹ️  (non-push tiers; generic informational)
   *
   * @param category - Aperture category ('system' | 'decision' | 'observation')
   * @param payload  - Primitive payload object (checked for quarantine type)
   * @param level    - Event level from EventMetadata
   */
  getIcon(category: string, payload: unknown, level?: EventLevel): string {
    if (isQuarantine(payload)) {
      return '🔒';
    }
    if (category === 'decision') return '📋';
    if (level === 'urgent')    return '⚠️';
    if (level === 'attention') return '🔔';
    return 'ℹ️';
  }

  /**
   * Returns a numeric sort priority for a given level.
   * Higher number = higher priority (urgent=3, attention=2, notice=1, info=0).
   */
  getPriority(level: EventLevel): number {
    const priorities: Partial<Record<EventLevel, number>> = {
      urgent: 3,
      attention: 2,
      notice: 1,
      info: 0,
    };
    return priorities[level] ?? 0;
  }
}
