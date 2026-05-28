/**
 * Session fallback policy for MCP tool handlers.
 *
 * Separated from the MCP server transport so the policy can be tested
 * without spinning up the full MCP server.
 */

import type Database from 'better-sqlite3';
import { getActiveUserSession, getMostRecentUserSession } from '../db/sessions.js';

/**
 * Session lookup for MCP fallback paths. Explicit repo keys stay repo-scoped,
 * while missing repo context falls back only to user sessions so internal
 * __system__ observability sessions never receive user-facing tool events.
 */
export function getUserSessionForMcpFallback(db: Database.Database, repoKey?: string) {
  return repoKey ? getActiveUserSession(db, repoKey) : getMostRecentUserSession(db);
}
