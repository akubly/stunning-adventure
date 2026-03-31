/**
 * preToolUse hook entry point — session-start gate.
 *
 * Fires on every tool call via the preToolUse hook. Fast path: if an active
 * session already exists for this repo, exits immediately (~O(1) SELECT).
 *
 * On first tool call (no active session):
 *   1. Recover any crashed previous session (catchUpPreviousSession)
 *   2. Run the Curator pipeline (curate) — processes unprocessed events
 *   3. Exit — postToolUse will create the new session
 *
 * Fail-open: any error exits with code 0. Hooks must never break the user.
 */

import { getDb, closeDb } from '../db/index.js';
import { getActiveSession } from '../db/sessions.js';
import { catchUpPreviousSession } from '../agents/archivist.js';
import { curate } from '../agents/curator.js';
import { slugifyRepoKey } from '../config/repo.js';
import { execSync } from 'node:child_process';

interface HookInput {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  cwd?: string;
}

function getRepoKey(cwd?: string): string {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: cwd ?? process.cwd(),
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return slugifyRepoKey(remote);
  } catch {
    return 'unknown_repo';
  }
}

/**
 * Core session-start logic, separated from stdin plumbing for testability.
 *
 * Returns `{ fastPath: true }` when an active session already exists (no work done).
 * Returns `{ fastPath: false }` after running crash recovery + curator.
 */
export function runSessionStart(repoKey: string): { fastPath: boolean } {
  const existing = getActiveSession(repoKey);
  if (existing) {
    return { fastPath: true };
  }

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

  try {
    getDb();
    const repoKey = getRepoKey(hookData!.cwd);
    runSessionStart(repoKey);
    closeDb();
  } catch {
    // Fail open — hooks must never break the user's workflow
  }
  process.exit(0);
}

main();
