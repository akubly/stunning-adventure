/**
 * Archivist Agent
 *
 * Responsible for session recording, narrative logging, and natural-language queries
 * against the knowledge base.
 */

import { createSession, endSession, getActiveSession } from '../db/sessions.js';
import { logEvent } from '../db/events.js';
import { recordSkip } from '../db/skipBreadcrumbs.js';
import { slugifyRepoKey } from '../config/repo.js';
import { scrubSecrets } from './secretScrubber.js';

export const AGENT_NAME = 'archivist';
export const AGENT_DESCRIPTION = 'Session recording, narrative logging, NL queries';

/** Start or resume an Archivist session for the given repo. */
export function startSession(repoRemoteOrKey: string, branch?: string): string {
  const repoKey = repoRemoteOrKey.includes('/')
    ? slugifyRepoKey(repoRemoteOrKey)
    : repoRemoteOrKey;

  // Check for an existing active session
  const existing = getActiveSession(repoKey);
  if (existing) {
    // Log a session_resume event
    logEvent(existing.id, 'session_resume', { resumedAt: new Date().toISOString() });
    return existing.id;
  }

  // Create a new session
  const sessionId = createSession(repoKey, branch);
  logEvent(sessionId, 'session_start', {
    repoKey,
    branch: branch ?? null,
    startedAt: new Date().toISOString(),
  });
  return sessionId;
}

/** End an active session. */
export function stopSession(sessionId: string, status: string = 'completed'): void {
  logEvent(sessionId, 'session_end', {
    status,
    endedAt: new Date().toISOString(),
  });
  endSession(sessionId, status);
}

/** Record a tool use event. Scrubs secrets from payload before logging. */
export function recordToolUse(
  sessionId: string,
  toolName: string,
  args?: Record<string, unknown>,
  result?: Record<string, unknown>,
): number {
  const payload = scrubSecrets({
    tool: toolName,
    args: args ?? {},
    result: result ?? {},
    timestamp: new Date().toISOString(),
  });
  return logEvent(sessionId, 'tool_use', payload);
}

/** Record an error event. */
export function recordError(
  sessionId: string,
  category: string,
  message: string,
  context?: Record<string, unknown>,
): number {
  const scrubbedContext = context ? scrubSecrets(context) : {};
  return logEvent(sessionId, 'error', {
    category,
    message: scrubSecrets(message),
    context: scrubbedContext,
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
  recordSkip(sessionId, whatSkipped, reason, agent);
  return logEvent(sessionId, 'skip', {
    whatSkipped,
    reason: reason ?? null,
    agent: agent ?? null,
    timestamp: new Date().toISOString(),
  });
}

/** Session-start catch-up: check if the previous session ended cleanly. */
export function catchUpPreviousSession(repoKey: string): { recovered: boolean; sessionId?: string } {
  const existing = getActiveSession(repoKey);
  if (existing) {
    // Previous session is still "active" — it didn't end cleanly
    logEvent(existing.id, 'session_crash_detected', {
      originalStart: existing.startedAt,
      detectedAt: new Date().toISOString(),
    });
    endSession(existing.id, 'crashed');
    return { recovered: true, sessionId: existing.id };
  }
  return { recovered: false };
}
