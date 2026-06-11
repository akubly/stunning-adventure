/**
 * Unit tests — NotificationPolicy value object.
 *
 * NotificationPolicy is a pure value object (no I/O, no async) extracted in the
 * REFACTOR phase of §4.3 Walkthrough C. These tests pin the policy rules so
 * ApertureProjector can evolve without silently changing push behaviour.
 *
 * TDD Strategy : §4.3 Walkthrough C REFACTOR (docs/crucible-tdd-strategy.md)
 *
 * Tests:
 *   NP-1: shouldPush — attention and urgent levels return true
 *   NP-2: shouldPush — notice, info, empty string return false
 *   NP-3: getIcon — quarantine payload → 🔒 (regardless of category)
 *   NP-4: getIcon — decision category → 📋 (issue #64 I-5: ✓ → 📋)
 *   NP-5: getIcon — tier-aware fallback: urgent→⚠️, attention→🔔, else→ℹ️ (issue #64 B-1)
 *   NP-6: getPriority — full tier ladder
 *   NP-7: getPriority — unknown level → 0
 */

import { describe, it, expect } from 'vitest';
import type { EventLevel } from '../../types.js';
import { NotificationPolicy } from '../../projectors/notification-policy.js';

describe('NotificationPolicy', () => {
  const policy = new NotificationPolicy();

  // ── NP-1 / NP-2: shouldPush ────────────────────────────────────────────────

  describe('shouldPush', () => {
    it('NP-1a: attention → true', () => expect(policy.shouldPush('attention')).toBe(true));
    it('NP-1b: urgent → true',    () => expect(policy.shouldPush('urgent')).toBe(true));
    it('NP-2a: notice → false',   () => expect(policy.shouldPush('notice')).toBe(false));
    it('NP-2b: info → false',     () => expect(policy.shouldPush('info')).toBe(false));
    // Intentionally out-of-band values — cast to exercise runtime fallback robustness
    it('NP-2c: empty → false',    () => expect(policy.shouldPush('' as EventLevel)).toBe(false));
    it('NP-2d: unknown → false',  () => expect(policy.shouldPush('debug' as EventLevel)).toBe(false));
  });

  // ── NP-3 / NP-4 / NP-5: getIcon ───────────────────────────────────────────

  describe('getIcon', () => {
    it('NP-3: quarantine payload → 🔒 (system category)', () =>
      expect(policy.getIcon('system', { type: 'quarantine' }, 'attention')).toBe('🔒'));

    it('NP-3b: quarantine payload → 🔒 even with observation category', () =>
      expect(policy.getIcon('observation', { type: 'quarantine' }, 'urgent')).toBe('🔒'));

    // I-5: ✓ replaced with 📋 — decisions can be rejections; neutral action glyph
    it('NP-4: decision category → 📋', () =>
      expect(policy.getIcon('decision', { outcome: 'reject' }, 'urgent')).toBe('📋'));

    // B-1: tier-aware fallback — ℹ️ for attention/urgent teaches users to skip badges
    it('NP-5a: urgent + non-quarantine, non-decision → ⚠️', () =>
      expect(policy.getIcon('observation', { content: 'log' }, 'urgent')).toBe('⚠️'));

    it('NP-5b: attention + non-quarantine, non-decision → 🔔', () =>
      expect(policy.getIcon('observation', { content: 'log' }, 'attention')).toBe('🔔'));

    it('NP-5c: info level → ℹ️ (non-push tier, fallback preserved)', () =>
      expect(policy.getIcon('observation', { content: 'log' }, 'info')).toBe('ℹ️'));

    it('NP-5d: no level → ℹ️ (undefined level falls through to generic fallback)', () =>
      expect(policy.getIcon('system', null, undefined)).toBe('ℹ️'));
  });

  // ── NP-6 / NP-7: getPriority ──────────────────────────────────────────────

  describe('getPriority', () => {
    it('NP-6a: urgent → 3',    () => expect(policy.getPriority('urgent')).toBe(3));
    it('NP-6b: attention → 2', () => expect(policy.getPriority('attention')).toBe(2));
    it('NP-6c: notice → 1',    () => expect(policy.getPriority('notice')).toBe(1));
    it('NP-6d: info → 0',      () => expect(policy.getPriority('info')).toBe(0));
    // Intentionally out-of-band — cast to exercise the Record exhaustive mapping
    it('NP-7: unknown → 0',    () => expect(policy.getPriority('trace' as EventLevel)).toBe(0));
  });
});
