/**
 * `crucible replay` — runs hermetic replay and reports byte-equivalence.
 *
 * UX rationale (§13.5 attention-management + §13.2 no-animations):
 *   - Pass/fail verdict is the FIRST thing printed (top-left, hard to miss).
 *   - ✓ / ✗ glyphs give instant colour-independent signal for CI log scanning.
 *   - On failure the divergence offset and kind are promoted to the same block
 *     so a glancing scan never misses where it broke.
 *   - Duration is last (informational, not load-bearing for pass/fail decision).
 *   - Line-oriented: no animations, no spinners — output pipes cleanly into
 *     grep, tee, and CI log collectors (§13.2).
 *
 * The handler accepts a pre-constructed SkeletonSession (programmatic-shell
 * pattern, same as status.ts) — tests call the function, not a subprocess.
 */

import type { SkeletonSession, ReplayReport } from '@akubly/crucible-core/skeleton';

const DIVIDER = '─'.repeat(44);

/** Render a ReplayReport to a human-readable multi-line string. */
export function renderReplay(report: ReplayReport): string {
  const verdict = report.status === 'pass'
    ? '✓ REPLAY PASS'
    : '✗ REPLAY FAIL';

  const lines: string[] = [verdict, DIVIDER];

  if (report.status === 'fail') {
    lines.push(
      `  Divergence at  : offset ${report.divergenceAtOffset ?? '?'}`,
      `  Divergence kind: ${report.divergenceKind ?? 'unknown'}`,
    );
  }

  lines.push(
    `  Rows replayed  : ${report.rowsReplayed}`,
    `  Duration       : ${report.wallClockMs}ms`,
    DIVIDER,
  );

  return lines.join('\n');
}

/**
 * Execute `crucible replay` against an open SkeletonSession.
 *
 * Prints the replay report and returns the raw ReplayReport for callers
 * that need to assert on the values (e.g., acceptance tests).
 */
export async function runReplayCommand(session: SkeletonSession): Promise<ReplayReport> {
  const report = await session.replay();
  console.log(renderReplay(report));
  return report;
}
