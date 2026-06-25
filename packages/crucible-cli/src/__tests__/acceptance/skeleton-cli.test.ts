/**
 * Acceptance test — Skeleton CLI verbs: `status` and `replay` (SK-4, SK-5).
 *
 * Acceptance Scenario : A-CLI-1 — Skeleton CLI Verbs
 * PRD User Stories    : SK-4 (status readback), SK-5 (hermetic replay A2)
 * TDD Strategy        : §4.1 Walkthrough A (docs/crucible-tdd-strategy.md)
 * Naming convention   : §8.5 — "[Layer] [Component] [Scenario] [Expected Behavior]"
 *                       Acceptance-level prefix: "Acceptance: ..."
 *
 * Test strategy: call the command handlers programmatically (no subprocess).
 * This is the programmatic-shell pattern: each handler accepts a SkeletonSession
 * and returns the raw result, so tests assert on values without parsing stdout.
 *
 * Session-reopen GAP (Phase 1):
 *   createSkeletonSession() always creates a FRESH session; there is no API to
 *   reopen an existing session by ID + rootDir. The tests therefore exercise
 *   create → run → status/replay within a single process instance. A Phase 1
 *   session-catalog open-by-id surface will unlock cross-process CLI invocations
 *   (true "crucible status <sid>" UX). Flagged in history.md for Roger/Graham.
 *
 * Bootstrap row count (AMBIG-3 pinned, from assembly.ts):
 *   StubSdkProvider + DefaultBootstrapMaterializer with 0 memory fragments →
 *   2 rows (system_prompt + tool_definitions). One turn adds 2 rows
 *   (observation + decision) → total 4 rows after one run().
 */

import { describe, it, expect } from 'vitest';
import {
  createSkeletonSession,
  StubSdkProvider,
  runStatusCommand,
  runReplayCommand,
  renderStatus,
  renderReplay,
} from '../../index.js';

describe('Skeleton CLI Verbs', () => {
  it(
    'Acceptance: status command returns correct row count and last offset after one run [SK-4]',
    async () => {
      // ── Arrange ──────────────────────────────────────────────────────────
      const session = createSkeletonSession({ provider: new StubSdkProvider() });

      // Run one full turn: bootstrap (2 rows) + turn (2 rows) = 4 rows total.
      await session.run('hello skeleton');

      // ── Act ───────────────────────────────────────────────────────────────
      const status = await runStatusCommand(session);

      // ── Assert: identity ──────────────────────────────────────────────────
      // Status reports the same session ID the session was created with.
      expect(status.sessionId).toBe(session.sessionId);

      // ── Assert: row count (AMBIG-3 pinned: 2 bootstrap + 2 turn = 4) ─────
      expect(status.rowCount).toBe(4);

      // ── Assert: last offset is 3 (0-indexed offsets 0,1,2,3) ─────────────
      expect(status.lastCommitOffset).toBe(3);
    },
  );

  it(
    'Acceptance: status command on a fresh session (no runs) reports zero rows [SK-4 edge]',
    async () => {
      // ── Arrange ──────────────────────────────────────────────────────────
      const session = createSkeletonSession({ provider: new StubSdkProvider() });

      // ── Act ───────────────────────────────────────────────────────────────
      const status = await runStatusCommand(session);

      // ── Assert ────────────────────────────────────────────────────────────
      expect(status.rowCount).toBe(0);
      expect(status.lastCommitOffset).toBe(-1);
    },
  );

  it(
    'Acceptance: replay command returns pass and rowsReplayed equals committed row count [SK-5]',
    async () => {
      // ── Arrange ──────────────────────────────────────────────────────────
      const session = createSkeletonSession({ provider: new StubSdkProvider() });
      await session.run('replay me');

      // ── Act ───────────────────────────────────────────────────────────────
      const report = await runReplayCommand(session);

      // ── Assert: A2 byte-equivalence ───────────────────────────────────────
      expect(report.status).toBe('pass');

      // SK-5: rowsReplayed must equal the source row count (4 after one run).
      expect(report.rowsReplayed).toBe(4);

      // On pass, divergence fields are null.
      expect(report.divergenceAtOffset).toBeNull();
      expect(report.divergenceKind).toBeNull();
    },
  );

  it(
    'Acceptance: renderStatus produces labeled, scannable output containing session ID and counts',
    () => {
      // ── Arrange ──────────────────────────────────────────────────────────
      const fakeStatus = {
        sessionId: 'test-session-abc',
        rowCount: 7,
        lastCommitOffset: 6,
      };

      // ── Act ───────────────────────────────────────────────────────────────
      const output = renderStatus(fakeStatus);

      // ── Assert: output contains all three labeled fields ──────────────────
      expect(output).toContain('Session ID');
      expect(output).toContain('test-session-abc');
      expect(output).toContain('Row count');
      expect(output).toContain('7');
      expect(output).toContain('Last offset');
      expect(output).toContain('6');
    },
  );

  it(
    'Acceptance: renderReplay pass output leads with the ✓ PASS verdict',
    () => {
      const report = {
        status: 'pass' as const,
        divergenceAtOffset: null,
        divergenceKind: null,
        rowsReplayed: 4,
        wallClockMs: 12,
      };
      const output = renderReplay(report);
      expect(output).toMatch(/^✓ REPLAY PASS/);
      expect(output).toContain('4');
    },
  );

  it(
    'Acceptance: renderReplay fail output leads with the ✗ FAIL verdict and includes divergence details',
    () => {
      const report = {
        status: 'fail' as const,
        divergenceAtOffset: 2,
        divergenceKind: 'oracle' as const,
        rowsReplayed: 1,
        wallClockMs: 5,
      };
      const output = renderReplay(report);
      expect(output).toMatch(/^✗ REPLAY FAIL/);
      expect(output).toContain('offset 2');
      expect(output).toContain('oracle');
    },
  );
});
