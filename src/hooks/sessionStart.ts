/**
 * preToolUse hook entry point — session-start gate.
 *
 * Fires on every tool call via the preToolUse hook. Fast path: if a
 * *recent* active session exists for this repo, exits immediately (~O(1)).
 *
 * When no recent session exists (first tool call, or orphan from a crash):
 *   1. Recover any crashed previous session (catchUpPreviousSession)
 *   2. Run the Curator pipeline (curate) — processes unprocessed events
 *   3. Exit — postToolUse will create the new session
 *
 * Fail-open: any error exits with code 0. Hooks must never break the user.
 */

import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { getDb, closeDb } from '../db/index.js';
import { getActiveSession } from '../db/sessions.js';
import { getLastEventTime } from '../db/events.js';
import { catchUpPreviousSession } from '../agents/archivist.js';
import { curate } from '../agents/curator.js';
import { getRepoKey } from './gitContext.js';
import { parseSqliteDateToMs } from '../utils/timestamps.js';

interface HookInput {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  cwd?: string;
}

/**
 * Threshold (ms) beyond which an active session with no recent events
 * is considered orphaned from a previous Copilot run.
 *
 * During normal use postToolUse fires every few seconds, keeping the
 * session's last event well within this window.
 */
const STALE_SESSION_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

function isStaleSession(session: { id: string; startedAt: string }): boolean {
  const lastEvent = getLastEventTime(session.id);
  const referenceTime = lastEvent ?? session.startedAt;
  const referenceMs = parseSqliteDateToMs(referenceTime);
  // Fail-safe toward recovery: if we can't parse the timestamp, treat the
  // session as stale so crash recovery runs. A false-positive (recovering a
  // live session) is correctable; a false-negative (ignoring an orphan with a
  // garbage timestamp) leaves the session permanently stuck on the fast path.
  if (referenceMs === null) return true;
  const ageMs = Date.now() - referenceMs;
  return ageMs > STALE_SESSION_THRESHOLD_MS;
}

/**
 * Core session-start logic, separated from stdin plumbing for testability.
 *
 * Returns `{ fastPath: true }` when a recent active session exists (no work).
 * Returns `{ fastPath: false }` after crash recovery + curator pipeline.
 */
export function runSessionStart(repoKey: string): { fastPath: boolean } {
  const existing = getActiveSession(repoKey);
  if (existing && !isStaleSession(existing)) {
    return { fastPath: true };
  }

  // Either no active session or the active session is stale (orphan).
  catchUpPreviousSession(repoKey);
  curate();
  return { fastPath: false };
}

async function main(): Promise<void> {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  if (!raw.trim()) process.exit(0);

  let hookData: HookInput;
  try {
    hookData = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  let dbOpened = false;
  try {
    getDb();
    dbOpened = true;
    // getRepoKey() shells out to `git remote get-url origin` (~10ms on
    // Windows). This runs before the fast-path DB check because
    // getActiveSession() requires a repo-scoped key. The cost is acceptable:
    // node startup + DB open (~400ms) dominate the hook budget, making the
    // 10ms git call negligible. Restructuring to avoid it (CWD-based keys,
    // repo-agnostic pre-checks) would add complexity for marginal gain.
    const repoKey = getRepoKey(hookData!.cwd);
    runSessionStart(repoKey);
  } catch {
    // Fail open — hooks must never break the user's workflow
  } finally {
    if (dbOpened) closeDb();
    process.exit(0);
  }
}

// Only run CLI entrypoint when executed as a script, not when imported.
const isScript =
  process.argv[1] &&
  import.meta.url === url.pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href;
if (isScript) {
  main();
}
