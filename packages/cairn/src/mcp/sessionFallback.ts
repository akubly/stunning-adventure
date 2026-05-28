/**
 * Session fallback policy for MCP tool handlers.
 *
 * Separated from the MCP server transport so the policy can be tested
 * without spinning up the full MCP server.
 */

import type Database from 'better-sqlite3';
import { getActiveSession, getActiveUserSession, getMostRecentUserSession, listActiveSessionsForRepo } from '../db/sessions.js';

/**
 * Session lookup for MCP fallback paths. Explicit repo keys stay repo-scoped,
 * while missing repo context falls back only to user sessions so internal
 * __system__ observability sessions never receive user-facing tool events.
 * When workdir is provided, scopes to the exact (repo_key, workdir) identity.
 *
 * @param source - How the workdir was obtained. Pass `'env-var'` for skill
 *   tools that read `CAIRN_WORKDIR`; pass `'explicit'` for call sites that
 *   receive workdir from the MCP caller. When `'env-var'` and workdir is
 *   absent but the repo has multiple active sessions, a diagnostic warning is
 *   written to stderr so operators know attribution may be wrong.
 */
export function getUserSessionForMcpFallback(
  db: Database.Database,
  repoKey?: string,
  workdir?: string,
  source?: 'env-var' | 'explicit',
) {
  if (repoKey && workdir !== undefined) {
    return getActiveSession(db, repoKey, workdir);
  }

  if (source === 'env-var' && repoKey && workdir === undefined) {
    const sessions = listActiveSessionsForRepo(db, repoKey);
    if (sessions.length > 1) {
      process.stderr.write(
        `[cairn] CAIRN_WORKDIR is not set but ${sessions.length} active sessions exist for repo ` +
        `"${repoKey}". Skill-tool events will be attributed to an arbitrary session. ` +
        `Set CAIRN_WORKDIR in the orchestrator launcher to fix worktree isolation.\n`,
      );
    }
  }

  return repoKey ? getActiveUserSession(db, repoKey) : getMostRecentUserSession(db);
}
