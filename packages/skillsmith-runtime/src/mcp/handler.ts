/**
 * forge_prescribe MCP tool handler (W5-5).
 *
 * Extracted from the server bootstrap so it can be unit-tested without
 * spinning up the MCP transport layer.
 */

import type Database from 'better-sqlite3';
import * as cairn from '@akubly/cairn';
import { runForgePrescribe as defaultRunForgePrescribe, loadExecutionProfile } from '../index.js';
import type { LoadedProfileSource, ForgePrescribeResult } from '../index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ForgePrescribeArgs {
  skill_id: string;
  force?: boolean;
  repo_key?: string;
}

/** Shape of the `prescriber_run` CairnEvent payload (W5-5). */
interface PrescriberRunEventPayload {
  skill_id: string;
  force: boolean;
  /** Resolved user session id, or null when no user session was found. */
  session_id: string | null;
  /** Profile tier used for this run, or null when no profile exists. */
  profile_used: LoadedProfileSource | null;
  /** Attenuated confidence from the loaded profile, or null when no profile. */
  confidence: number | null;
  /** ISO timestamp of when the MCP tool was invoked. */
  ts: string;
  result: {
    inserted: number;
    skipped: number;
    errored: number;
    total_hints: number;
  };
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

/** Injectable signature for the prescriber run function (for testing). */
export type RunForgePrescribeFn = (
  opts: Parameters<typeof defaultRunForgePrescribe>[0],
) => Promise<ForgePrescribeResult>;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Core handler for the `forge_prescribe` MCP tool.
 *
 * Accepts an explicit `db` so the session-lookup and event-log operations
 * use the same connection already held by the caller (W5-2 explicit-DB
 * convention). `runForgePrescribe` uses the Cairn singleton internally
 * (which is the same connection in practice).
 *
 * @param db                   - Explicit DB connection for session/event operations.
 * @param args                 - Tool arguments validated by the server's Zod schema.
 * @param runForgePrescribe_   - Optional override for the prescriber run function (testing).
 */
export async function forgePrescribeHandler(
  db: Database.Database,
  args: ForgePrescribeArgs,
  runForgePrescribe_: RunForgePrescribeFn = defaultRunForgePrescribe,
): Promise<McpToolResult> {
  const { skill_id, force = false, repo_key } = args;

  // 1. Resolve the user session for event attribution (W5-1 session-kind
  //    separation ensures __system__ sessions are never returned here).
  const session = repo_key
    ? cairn.getActiveUserSession(db, repo_key)
    : cairn.getMostRecentUserSession(db);

  // 2. Snapshot the profile confidence before running so we can include it
  //    in the observability event even if the run fails.
  const preRunProfile = loadExecutionProfile(db, skill_id, { fallbackPolicy: 'full-chain' });
  const confidence = preRunProfile?.profile.confidence ?? null;

  // 3. Execute the prescriber.
  const result = await runForgePrescribe_({
    skillId: skill_id,
    forceRegenerate: force,
    fallbackContext: { fallbackPolicy: 'full-chain' },
  });

  // 4. Emit a `prescriber_run` CairnEvent.  Falls back to the system session
  //    when no user session is available so the event is never silently lost.
  //    Wrapped in try/catch so a DB write failure (full disk, lock contention)
  //    never surfaces as an MCP tool error — observability is fail-open.
  try {
    const logSessionId = session?.id ?? cairn.ensureSystemSession(db);
    const payload: PrescriberRunEventPayload = {
      skill_id,
      force,
      session_id: session?.id ?? null,
      profile_used: result.ok
        ? result.profileSource
        : (preRunProfile?.source ?? null),
      confidence,
      ts: new Date().toISOString(),
      result: {
        inserted: result.inserted ?? 0,
        skipped: result.skipped ?? 0,
        errored: result.errored ?? 0,
        total_hints: result.totalHints ?? 0,
      },
    };
    cairn.logEvent(db, logSessionId, 'prescriber_run', payload);
  } catch (eventErr) {
    // Fail-open: log to stderr but do not propagate — prescriber result
    // is still valid and should reach the caller.
    const msg = eventErr instanceof Error ? eventErr.message : String(eventErr);
    process.stderr.write(
      `[skillsmith-runtime] prescriber_run event write failed (skill=${skill_id}): ${msg}\n`,
    );
  }

  // 5. Return the full prescriber result as JSON content.
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
    isError: !result.ok,
  };
}
