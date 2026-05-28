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

import type Database from 'better-sqlite3';
import type { PrescriberOrchestrationConfig } from '@akubly/types';
import { getDb, closeDb } from '../db/index.js';
import { getActiveSession } from '../db/sessions.js';
import { getLastEventTime } from '../db/events.js';
import { catchUpPreviousSession } from '../agents/archivist.js';
import { curate, type CurateResult } from '../agents/curator.js';
import { prescribe } from '../agents/prescriber.js';
import { incrementSessionCounter } from '../db/prescriptions.js';
import { getRepoKey, getWorkdir } from './gitContext.js';
import { parseSqliteDateToMs } from '../utils/timestamps.js';
import { checkIsScript } from '../utils/isScript.js';

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

function isStaleSession(db: Database.Database, session: { id: string; startedAt: string }): boolean {
  const lastEvent = getLastEventTime(db, session.id);
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
export async function runSessionStart(
  repoKey: string,
  prescriberOrchestrationConfig?: PrescriberOrchestrationConfig,
  afterCurate?: (curateResult: CurateResult) => void,
  workdir?: string,
): Promise<{ fastPath: boolean }> {
  const db = getDb();
  const existing = getActiveSession(db, repoKey, workdir);
  if (existing && !isStaleSession(db, existing)) {
    return { fastPath: true };
  }

  // Either no active session or the active session is stale (orphan).
  catchUpPreviousSession(repoKey, workdir);
  const curateResult = await curate(undefined, prescriberOrchestrationConfig);
  try {
    afterCurate?.(curateResult);
  } catch (error) {
    console.warn(
      `sessionStart: afterCurate callback failed; continuing without post-curate hook: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Increment session counter BEFORE prescribe() so shouldResurface()
  // sees the correct session number without needing an off-by-one hack.
  incrementSessionCounter(db);

  // Chain prescribe() when insights changed (DP1 hybrid trigger)
  if (curateResult.insightsChanged) {
    try {
      prescribe();
    } catch {
      // Fail-open — prescriber errors must not break session start
    }
  }

  return { fastPath: false };
}

export type SessionStartOrchestrationFactory = (
  db: Database.Database,
) => PrescriberOrchestrationConfig | undefined;

export async function runSessionStartHook(
  createPrescriberOrchestrationConfig?: SessionStartOrchestrationFactory,
  afterCurate?: (curateResult: CurateResult) => void,
): Promise<void> {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  if (!raw.trim()) return;

  let hookData: HookInput;
  try {
    hookData = JSON.parse(raw);
  } catch {
    return;
  }

  let dbOpened = false;
  try {
    const db = getDb();
    dbOpened = true;
    // getRepoKey() shells out to `git remote get-url origin` (~10ms on
    // Windows). This runs before the fast-path DB check because
    // getActiveSession(db) requires a repo-scoped key. The cost is acceptable:
    // node startup + DB open (~400ms) dominate the hook budget, making the
    // 10ms git call negligible. Restructuring to avoid it (CWD-based keys,
    // repo-agnostic pre-checks) would add complexity for marginal gain.
    const repoKey = getRepoKey(hookData.cwd);
    const workdir = getWorkdir(hookData.cwd);
    let prescriberOrchestrationConfig: PrescriberOrchestrationConfig | undefined;
    try {
      prescriberOrchestrationConfig = createPrescriberOrchestrationConfig?.(db);
    } catch (error) {
      console.warn(
        `sessionStart: prescriber orchestration factory failed; continuing without orchestration: ${error instanceof Error ? error.message : String(error)}`,
      );
      prescriberOrchestrationConfig = undefined;
    }
    await runSessionStart(repoKey, prescriberOrchestrationConfig, afterCurate, workdir);
  } catch {
    // Fail open — hooks must never break the user's workflow
  } finally {
    if (dbOpened) closeDb();
  }
}

async function main(): Promise<void> {
  try {
    await runSessionStartHook();
  } finally {
    process.exit(0);
  }
}

// Only run CLI entrypoint when executed as a script, not when imported.
const isScript = checkIsScript(import.meta.url);
if (isScript) {
  main();
}
