/**
 * Archivist Agent
 *
 * Responsible for session recording, narrative logging, and natural-language queries
 * against the knowledge base.
 */

import { getDb } from '../db/index.js';
import { createSession, endSession, getActiveSession, claimLegacyActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { recordSkip } from '../db/skipBreadcrumbs.js';
import { slugifyRepoKey } from '../config/repo.js';
import { scrubSecrets } from './secretScrubber.js';

export const AGENT_NAME = 'archivist';
export const AGENT_DESCRIPTION = 'Session recording, narrative logging, NL queries';

/** Start or resume an Archivist session for the given repo. */
export function startSession(repoRemoteOrKey: string, branch?: string, workdir?: string): string {
  const db = getDb();
  const repoKey = repoRemoteOrKey.includes('/')
    ? slugifyRepoKey(repoRemoteOrKey)
    : repoRemoteOrKey;

  // Wrap the entire find-or-create sequence in an IMMEDIATE transaction so that
  // two concurrent startSession calls for the same (repo_key, workdir) cannot
  // both observe "no active session" and both insert a new row.
  return db.transaction((): string => {
    // Check for an existing active session scoped to (repo_key, workdir)
    const existing = getActiveSession(db, repoKey, workdir);
    if (existing) {
      // Log a session_resume event
      logEvent(db, existing.id, 'session_resume', {
        resumedAt: new Date().toISOString(),
        workdir: workdir ?? null,
      });
      return existing.id;
    }

    // No (repo_key, workdir) session found — try to claim a legacy NULL-workdir
    // session rather than creating a duplicate row.
    if (workdir) {
      const claimed = claimLegacyActiveSession(db, repoKey, workdir);
      if (claimed) {
        logEvent(db, claimed.id, 'session_resume', {
          resumedAt: new Date().toISOString(),
          workdir,
          claimedLegacy: true,
        });
        return claimed.id;
      }
    }

    // Create a new session
    const sessionId = createSession(db, repoKey, branch, workdir);
    logEvent(db, sessionId, 'session_start', {
      repoKey,
      branch: branch ?? null,
      workdir: workdir ?? null,
      startedAt: new Date().toISOString(),
    });
    return sessionId;
  }).immediate();
}

/** End an active session. */
export function stopSession(sessionId: string, status: string = 'completed'): void {
  const db = getDb();
  logEvent(db, sessionId, 'session_end', {
    status,
    endedAt: new Date().toISOString(),
  });
  endSession(db, sessionId, status);
}

/**
 * Record a tool use event. Scrubs secrets from payload before logging.
 * workdir is included in the payload when known, for per-worktree event tracing.
 */
export function recordToolUse(
  sessionId: string,
  toolName: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
  workdir?: string,
): number {
  const db = getDb();
  const payload = scrubSecrets({
    tool: toolName,
    args: args ?? {},
    result: result ?? {},
    workdir: workdir ?? null,
    timestamp: new Date().toISOString(),
  });
  return logEvent(db, sessionId, 'tool_use', payload);
}

/** Record an error event. */
export function recordError(
  sessionId: string,
  category: string,
  message: string,
  context?: Record<string, unknown>,
  workdir?: string,
): number {
  const db = getDb();
  const scrubbedContext = context ? scrubSecrets(context) : {};
  return logEvent(db, sessionId, 'error', {
    category,
    message: scrubSecrets(message),
    context: scrubbedContext,
    workdir: workdir ?? null,
    timestamp: new Date().toISOString(),
  });
}

/** Record a skip event (user intentionally skipped a guardrail). */
export function recordSkipEvent(
  sessionId: string,
  whatSkipped: string,
  reason?: string,
  agent?: string,
): number {
  const db = getDb();
  recordSkip(db, sessionId, whatSkipped, reason, agent);
  return logEvent(db, sessionId, 'skip', {
    whatSkipped,
    reason: reason ?? null,
    agent: agent ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Session-start catch-up: check if the previous session ended cleanly.
 * Scoped to (repo_key, workdir) so worktree crash recovery is isolated.
 */
export function catchUpPreviousSession(
  repoKey: string,
  workdir?: string,
): { recovered: boolean; sessionId?: string } {
  const db = getDb();
  const existing = getActiveSession(db, repoKey, workdir);
  if (existing) {
    // Previous session is still "active" — it didn't end cleanly
    logEvent(db, existing.id, 'session_crash_detected', {
      originalStart: existing.startedAt,
      detectedAt: new Date().toISOString(),
    });
    endSession(db, existing.id, 'crashed');
    return { recovered: true, sessionId: existing.id };
  }
  return { recovered: false };
}
