/**
 * `crucible status` — reads session state and prints a scannable one-glance report.
 *
 * UX rationale (§13.5 attention-management):
 *   - Labeled, left-aligned fields: a tired human scans top-to-bottom without
 *     counting columns or parsing raw JSON.
 *   - Divider line scopes the signal; nothing bleeds into surrounding shell output.
 *   - Last offset as the "freshness indicator" — the single number that tells you
 *     how much work happened.
 *
 * The handler accepts a pre-constructed SkeletonSession so tests can call it
 * directly without spawning a subprocess (programmatic-shell pattern).
 */

import type { SkeletonSession, SkeletonStatus } from '@akubly/crucible-core/skeleton';

const DIVIDER = '─'.repeat(44);

/** Render a SkeletonStatus to a human-readable multi-line string. */
export function renderStatus(s: SkeletonStatus): string {
  const lines: string[] = [
    'Session Status',
    DIVIDER,
    `  Session ID  : ${s.sessionId}`,
    `  Row count   : ${s.rowCount}`,
    `  Last offset : ${s.lastCommitOffset === -1 ? '(none — no rows committed)' : s.lastCommitOffset}`,
    DIVIDER,
  ];
  return lines.join('\n');
}

/**
 * Execute `crucible status` against an open SkeletonSession.
 *
 * Prints the status report and returns the raw SkeletonStatus for callers
 * that need to assert on the values (e.g., acceptance tests).
 */
export async function runStatusCommand(session: SkeletonSession): Promise<SkeletonStatus> {
  const status = await session.status();
  console.log(renderStatus(status));
  return status;
}
