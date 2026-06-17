/**
 * Crucible CLI — library entry point + minimal argv dispatcher.
 *
 * Re-exports the core session API for library consumers and exposes the
 * skeleton command handlers (status, replay) for programmatic use.
 *
 * CLI entry-point guard: the argv dispatcher only runs when this file is
 * executed directly (not imported as a module), so the package stays safely
 * importable from tests and library consumers.
 */

// ─── Library re-exports ───────────────────────────────────────────────────────
export { createSession, fork } from '@akubly/crucible-core';
export { createSkeletonSession, StubSdkProvider } from '@akubly/crucible-core/skeleton';
export type { SkeletonSession, SkeletonStatus, ReplayReport } from '@akubly/crucible-core/skeleton';

// ─── Command handlers (programmatic shell) ────────────────────────────────────
export { runStatusCommand, renderStatus } from './commands/status.js';
export { runReplayCommand, renderReplay } from './commands/replay.js';

// ─── CLI entry-point (guarded — only runs when executed directly) ─────────────
import { fileURLToPath } from 'node:url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { createSkeletonSession: _css, StubSdkProvider: _ssp } = await import(
    '@akubly/crucible-core/skeleton'
  );
  const { runStatusCommand: _rsc } = await import('./commands/status.js');
  const { runReplayCommand: _rrc } = await import('./commands/replay.js');

  const verb = process.argv[2];

  if (verb === 'status' || verb === 'replay') {
    const session = _css({ provider: new _ssp() });
    // A fresh session with no runs has row count 0 — useful for smoke-testing
    // the command path. A real implementation would open an existing session
    // by ID (Phase 1 concern: session-reopen gap; see history.md).
    if (verb === 'status') {
      await _rsc(session);
    } else {
      await _rrc(session);
    }
  } else {
    console.error(
      [
        'Crucible CLI',
        '',
        'Usage: crucible <verb>',
        '',
        '  status   Read session state (session ID, row count, last offset)',
        '  replay   Run hermetic replay and report byte-equivalence',
        '',
        'Phase 1: session open-by-id and full verb vocabulary coming.',
      ].join('\n'),
    );
    process.exit(1);
  }
}
