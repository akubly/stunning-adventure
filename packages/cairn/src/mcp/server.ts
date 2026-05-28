#!/usr/bin/env node

/**
 * Cairn MCP Server
 *
 * Exposes Cairn's knowledge base as MCP tools for Copilot conversations.
 * Uses stdio transport — designed to be launched as a subprocess by the
 * MCP host (e.g. Copilot CLI, VS Code).
 */

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import type Database from 'better-sqlite3';
import { getDb } from '../db/index.js';
import { getActiveSession, listActiveSessionsForRepo } from '../db/sessions.js';
import { getUserSessionForMcpFallback } from './sessionFallback.js';
import { getInsights, getInsight, getInsightsByIds, countInsightsByStatus } from '../db/insights.js';
import { logEvent } from '../db/events.js';
import { curate, getCuratorStatus } from '../agents/curator.js';
import { prescribe, checkAutoSuppress } from '../agents/prescriber.js';
import { applyPrescription } from '../agents/applier.js';
import {
  listPrescriptions,
  getPrescription,
  countPrescriptionsByStatus,
  deferPrescription,
  updatePrescriptionStatus,
  getSessionsSinceInstall,
} from '../db/prescriptions.js';
import {
  getSessionSummary,
  sessionExists,
  hasEventOccurred,
  findEvents,
} from '../agents/sessionState.js';
import { parseSkill } from '../agents/skillParser.js';
import { lintSkill, formatLintSummary } from '../agents/skillLinter.js';
import { validateSkill, formatValidationSummary } from '../agents/skillValidator.js';
import { loadTestScenario, runTestScenario, formatTestReport } from '../agents/skillTestHarness.js';
import { insertTestResults } from '../db/skillTestResults.js';

import type { GrowthSummary, InsightStatus, PrescriptionStatus, Session, ValidationResult } from '../types/index.js';
import type { SkillTestResultInsert } from '../db/skillTestResults.js';
import { PRESCRIPTION_STATUSES } from '../types/index.js';
import { checkIsScript } from '../utils/isScript.js';
import { getPreference } from '../db/preferences.js';
import { normalizeWorkdir } from '../utils/workdir.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const esmRequire = createRequire(import.meta.url);
const pkg = esmRequire('../../package.json') as { version: string };

let db!: Database.Database;

const server = new McpServer(
  { name: 'cairn', version: pkg.version },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// UX helpers (DP5)
// ---------------------------------------------------------------------------

/**
 * Proactive hint counter — max 1 per session.
 * Tracks which session (by sessions_since_install) last showed a hint,
 * so the counter resets across session boundaries even if the MCP server
 * process is long-lived.
 */
let proactiveHintsShown = 0;
let proactiveHintSessionGeneration: number | undefined;

/** For testing: reset the proactive hint counter. */
export function resetProactiveHintCounter(): void {
  proactiveHintsShown = 0;
  proactiveHintSessionGeneration = undefined;
}

/** Convert numeric confidence to user-facing words (DP5 #5). */
export function confidenceToWords(confidence: number): string {
  if (confidence >= 0.7) return 'high';
  if (confidence >= 0.4) return 'medium';
  return 'emerging';
}

// ---------------------------------------------------------------------------
// Tool: get_status
// ---------------------------------------------------------------------------

server.registerTool(
  'get_status',
  {
    title: 'Get Status',
    description:
      'Show the current Cairn session state and curator health. ' +
      'Returns all active sessions for a repo (each with its workdir) and curator metrics ' +
      '(last run time, cursor position, insight counts by status). ' +
      'When workdir is provided, filters to the session for that specific worktree. ' +
      'Use this to understand what Cairn is tracking right now.',
    inputSchema: {
      repo_key: z
        .string()
        .optional()
        .describe('Repository key to look up active sessions. Omit to get curator status only.'),
      workdir: z
        .string()
        .optional()
        .describe(
          'Worktree root path to filter to a single worktree session. ' +
          'When omitted, returns all active sessions for the repo.',
        ),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ repo_key, workdir }) => {
    try {
      ensureDb();

      const curatorStatus = getCuratorStatus();

      let sessions: Session[] = [];
      if (repo_key) {
        if (workdir !== undefined) {
          // Filter to a specific worktree session; still returned as an array
          // for shape consistency with the multi-session list shape.
          const nwd = normalizeWorkdir(workdir);
          if (nwd !== undefined) {
            const session = getActiveSession(db, repo_key, nwd);
            sessions = session ? [session] : [];
          } else {
            sessions = listActiveSessionsForRepo(db, repo_key);
          }
        } else {
          sessions = listActiveSessionsForRepo(db, repo_key);
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ sessions, curator: curatorStatus }, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: list_insights
// ---------------------------------------------------------------------------

const VALID_INSIGHT_STATUSES = ['active', 'stale', 'pruned'] as const;

server.registerTool(
  'list_insights',
  {
    title: 'List Insights',
    description:
      'List pattern-based insights the curator has discovered. ' +
      'Each insight includes a title, description, confidence score, occurrence count, ' +
      'and an actionable prescription. Filter by status (active, stale, pruned) ' +
      'or omit to see all. Use this to surface recurring problems and recommendations.',
    inputSchema: {
      status: z
        .enum(VALID_INSIGHT_STATUSES)
        .optional()
        .describe('Filter insights by lifecycle status. Omit to return all statuses.'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status }) => {
    try {
      ensureDb();

      const insights = getInsights(db, status as InsightStatus | undefined);
      const counts = countInsightsByStatus(db);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ counts, insights }, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_session
// ---------------------------------------------------------------------------

server.registerTool(
  'get_session',
  {
    title: 'Get Session',
    description:
      'Get detailed information about a specific session. ' +
      'Look up by session UUID (session_id), or by repo_key + workdir to resolve the ' +
      'active session for a specific worktree without knowing the ID. ' +
      'Returns event counts (total, tool_use, errors), skip breadcrumbs, ' +
      'and the 10 most recent events.',
    inputSchema: {
      session_id: z.string().optional().describe('The session UUID to look up.'),
      repo_key: z
        .string()
        .optional()
        .describe('Repository key for workdir-based lookup (alternative to session_id).'),
      workdir: z
        .string()
        .optional()
        .describe('Worktree root path for workdir-based lookup. Required when using repo_key. Optional when using session_id.'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, repo_key, workdir }) => {
    try {
      ensureDb();

      // Resolve session ID: explicit ID wins; fall back to (repo_key, workdir) lookup.
      let resolvedSessionId = session_id;
      if (!resolvedSessionId) {
        if (!repo_key) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Provide either session_id or repo_key (with optional workdir).',
                }),
              },
            ],
            isError: true,
          };
        }
        if (workdir === undefined) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'Provide workdir with repo_key for worktree-scoped lookup, or use session_id for direct lookup.',
                }),
              },
            ],
            isError: true,
          };
        }
        const nwd = normalizeWorkdir(workdir);
        if (!nwd) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'workdir must be a non-empty path.',
                }),
              },
            ],
            isError: true,
          };
        }
        const resolved = getActiveSession(db, repo_key, nwd);
        if (!resolved) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `No active session found for repo_key '${repo_key}'${workdir ? ` and workdir '${workdir}'` : ''}.`,
                }),
              },
            ],
            isError: true,
          };
        }
        resolvedSessionId = resolved.id;
      }

      const summary = getSessionSummary(db, resolvedSessionId);

      if (!summary) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Session '${resolvedSessionId}' not found.` }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: search_events
// ---------------------------------------------------------------------------

server.registerTool(
  'search_events',
  {
    title: 'Search Events',
    description:
      'Search for events in a session by event type pattern using SQL LIKE matching. ' +
      'The pattern is wrapped in wildcards, so "error" matches any type containing "error" ' +
      'and "tool" matches "tool_use". You can also use SQL LIKE wildcards: ' +
      '"%" matches any sequence of characters and "_" matches any single character. ' +
      'Returns matching events in chronological order, up to the specified limit. ' +
      'Use this to find specific activity within a session.',
    inputSchema: {
      session_id: z.string().describe('The session UUID to search within.'),
      type_pattern: z
        .string()
        .trim()
        .min(1)
        .describe(
          'Pattern to match against event types. Supports SQL LIKE wildcards (% = any chars, _ = single char). Must be non-empty. Examples: "error", "tool", "skip", "session".',
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(100)
        .describe('Maximum number of events to return (1–500, default 100).'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, type_pattern, limit }) => {
    try {
      ensureDb();

      if (!sessionExists(db, session_id)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Session '${session_id}' not found.` }),
            },
          ],
          isError: true,
        };
      }

      const events = findEvents(db, session_id, type_pattern, limit);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: events.length, events }, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: run_curate
// ---------------------------------------------------------------------------

server.registerTool(
  'run_curate',
  {
    title: 'Run Curator',
    description:
      'Trigger the curator to process unprocessed events and discover patterns. ' +
      'The curator scans the event stream for recurring errors, error sequences, ' +
      'and skip frequency, then creates or reinforces insights with prescriptions. ' +
      'Also generates new prescriptions when insights are created or reinforced. ' +
      'Returns combined curation and prescription results. ' +
      'Use this when you want fresh analysis of recent activity.',
    annotations: {
      readOnlyHint: false,
    },
  },
  async () => {
    try {
      ensureDb();

      const result = await curate();

      // Chain prescribe() when insights changed (DP1 hybrid trigger)
      let prescribeResult = null;
      if (result.insightsChanged) {
        try {
          prescribeResult = prescribe();
        } catch {
          // Partial success — curate succeeded, prescribe failed
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ curate: result, prescriptions: prescribeResult }, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: check_event
// ---------------------------------------------------------------------------

server.registerTool(
  'check_event',
  {
    title: 'Check Event',
    description:
      'Check whether a specific event type has occurred in a session. ' +
      'Returns a boolean result. Use this for quick yes/no queries like ' +
      '"has there been a build error?" or "did a review happen?".',
    inputSchema: {
      session_id: z.string().describe('The session UUID to check.'),
      event_type: z
        .string()
        .describe('The exact event type to look for (e.g. "error", "tool_use", "skip").'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id, event_type }) => {
    try {
      ensureDb();

      if (!sessionExists(db, session_id)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Session '${session_id}' not found.` }),
            },
          ],
          isError: true,
        };
      }

      const occurred = hasEventOccurred(db, session_id, event_type);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ event_type, occurred }),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: list_prescriptions
// ---------------------------------------------------------------------------

server.registerTool(
  'list_prescriptions',
  {
    title: 'List Prescriptions',
    description:
      'List improvement suggestions that Cairn has generated from observed patterns. ' +
      'For reviewing improvement suggestions based on recurring patterns. ' +
      'Filter by lifecycle status or omit to see all. ' +
      'Use this after curation has run to see what suggestions are available.',
    inputSchema: {
      status: z
        .enum(PRESCRIPTION_STATUSES)
        .optional()
        .describe('Filter by lifecycle status. Omit to see all.'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe('Maximum results to return.'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ status, limit }) => {
    try {
      ensureDb();

      const prescriptions = listPrescriptions(db, {
        status: status as PrescriptionStatus | undefined,
        limit,
      });
      const counts = countPrescriptionsByStatus(db);

      const summaries = prescriptions.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        confidence_level: confidenceToWords(p.confidence),
        pattern: p.patternType,
        target: p.targetPath,
      }));

      // Proactive hint: max 1 per session, only when unviewed generated prescriptions exist
      let proactive_hint: string | undefined;
      const generatedCount = counts['generated'] ?? 0;
      const currentSessionGen = getSessionsSinceInstall(db);
      if (proactiveHintSessionGeneration !== currentSessionGen) {
        proactiveHintsShown = 0;
        proactiveHintSessionGeneration = currentSessionGen;
      }
      if (generatedCount > 0 && proactiveHintsShown === 0) {
        proactive_hint =
          generatedCount === 1
            ? 'You have 1 new suggestion ready for review.'
            : `You have ${generatedCount} new suggestions ready for review.`;
        proactiveHintsShown++;
      }

      const response: Record<string, unknown> = {
        counts,
        prescriptions: summaries,
      };
      if (proactive_hint) {
        response.proactive_hint = proactive_hint;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: get_prescription
// ---------------------------------------------------------------------------

server.registerTool(
  'get_prescription',
  {
    title: 'Get Prescription',
    description:
      'Get full detail on a specific improvement suggestion. ' +
      'For reviewing the observation, rationale, and proposed change before deciding. ' +
      'Shows what Cairn has noticed and what it suggests, with a diff preview. ' +
      'Use this to understand a suggestion before accepting, rejecting, or deferring it.',
    inputSchema: {
      prescription_id: z
        .number()
        .int()
        .positive()
        .describe('The prescription ID to retrieve.'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ prescription_id }) => {
    try {
      ensureDb();

      const prescription = getPrescription(db, prescription_id);
      if (!prescription) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Prescription ${prescription_id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      // Fetch insight context
      const insight = getInsight(db, prescription.insightId);

      // Observation framing (DP5 #4): observation not judgment
      const occurrences = insight?.occurrenceCount ?? 0;
      const observation = insight
        ? `Cairn has noticed ${insight.patternType.replace('_', ' ')} patterns recurring ${occurrences} time${occurrences === 1 ? '' : 's'}.`
        : prescription.rationale;

      // Diff preview from proposed change
      const diffLines = prescription.proposedChange
        .split('\n')
        .filter((line) => !line.startsWith('<!--') && line.trim().length > 0)
        .map((line) => `+ ${line}`);
      const diff_preview = diffLines.join('\n');

      const response = {
        id: prescription.id,
        title: prescription.title,
        pattern: {
          type: prescription.patternType,
          insight_title: insight?.title ?? 'Unknown pattern',
          occurrences: insight?.occurrenceCount ?? 0,
          first_seen: insight?.firstSeenAt?.split(' ')[0] ?? 'unknown',
          last_seen: insight?.lastSeenAt?.split(' ')[0] ?? 'unknown',
        },
        observation,
        suggestion: prescription.rationale,
        where: prescription.targetPath,
        confidence_level: confidenceToWords(prescription.confidence),
        diff_preview,
        actions: ['accept', 'reject', 'defer'],
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: resolve_prescription
// ---------------------------------------------------------------------------

server.registerTool(
  'resolve_prescription',
  {
    title: 'Resolve Prescription',
    description:
      'Accept, reject, or defer an improvement suggestion. ' +
      'Rejection requires no additional fields — the simplest action. ' +
      'Acceptance applies the suggestion to a sidecar instruction file. ' +
      'Deferral postpones the suggestion with a session cooldown. ' +
      'Use this after reviewing a suggestion with get_prescription.',
    inputSchema: {
      prescription_id: z
        .number()
        .int()
        .positive()
        .describe('The prescription to act on.'),
      disposition: z
        .enum(['accept', 'reject', 'defer'])
        .describe('How to resolve this prescription.'),
      reason: z
        .string()
        .optional()
        .describe('Optional reason for rejection or deferral.'),
      repo_key: z
        .string()
        .optional()
        .describe('Repository key to scope session lookup. Uses repo-scoped session instead of global most-recent.'),
      workdir: z
        .string()
        .optional()
        .describe('Worktree root path to scope session lookup to a specific worktree. Use with repo_key.'),
    },
    annotations: { readOnlyHint: false },
  },
  async ({ prescription_id, disposition, reason, repo_key, workdir }) => {
    try {
      ensureDb();

      // Guard: prescription must exist and be in actionable state
      const prescription = getPrescription(db, prescription_id);
      if (!prescription) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: `Prescription ${prescription_id} not found.` }),
            },
          ],
          isError: true,
        };
      }

      // Allow 'accepted' through for crash-recovery retry (idempotent accept+apply)
      if (prescription.status !== 'generated' && !(disposition === 'accept' && prescription.status === 'accepted')) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Prescription ${prescription_id} is '${prescription.status}' — only 'generated' prescriptions can be resolved.`,
              }),
            },
          ],
          isError: true,
        };
      }

      if (disposition === 'accept') {
        // Accept → apply (wrap in try/catch so exceptions don't leave status stuck)
        if (prescription.status !== 'accepted') {
          updatePrescriptionStatus(db, prescription_id, 'accepted');
        }
        // Prefer repo+workdir-scoped user session; fall back to repo-scoped or global most-recent.
        const activeSession = getUserSessionForMcpFallback(db, repo_key, normalizeWorkdir(workdir));
        let applyResult: { success: boolean; error?: string; path?: string };
        try {
          applyResult = applyPrescription(prescription_id, {
            sessionId: activeSession?.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          updatePrescriptionStatus(db, prescription_id, 'failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  prescription_id,
                  disposition: 'accept',
                  result: 'failed',
                  message: `❌ Apply threw an exception: ${message}`,
                  rollback_available: false,
                }),
              },
            ],
            isError: true,
          };
        }

        if (!applyResult.success) {
          updatePrescriptionStatus(db, prescription_id, 'failed');
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  prescription_id,
                  disposition: 'accept',
                  result: 'failed',
                  message: `❌ Failed to apply: ${applyResult.error}`,
                  rollback_available: false,
                }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                prescription_id,
                disposition: 'accept',
                result: 'applied',
                message: `✅ Applied to ${applyResult.path}`,
                rollback_available: true,
              }),
            },
          ],
        };
      }

      if (disposition === 'reject') {
        updatePrescriptionStatus(db, prescription_id, 'rejected', {
          dispositionReason: reason,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                prescription_id,
                disposition: 'reject',
                result: 'rejected',
                message: '👍 Noted — this suggestion has been dismissed.',
              }),
            },
          ],
        };
      }

      // disposition === 'defer'
      const n = Number.parseInt(getPreference(db, 'prescriber.defer_sessions') ?? '3', 10);
      const deferSessions = Number.isFinite(n) && n >= 0 ? n : 3;
      deferPrescription(db, prescription_id, reason, deferSessions);

      // Re-read to get updated defer count
      const updated = getPrescription(db, prescription_id);
      const deferCount = updated?.deferCount ?? 1;

      // Check auto-suppress threshold
      const wasSuppressed = checkAutoSuppress(db, prescription_id, deferCount);

      if (wasSuppressed) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                prescription_id,
                disposition: 'defer',
                result: 'suppressed',
                message: `This is the ${ordinal(deferCount)} time this has been deferred. Cairn will stop suggesting this pattern.`,
                defer_count: deferCount,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              prescription_id,
              disposition: 'defer',
              result: 'deferred',
              message: `⏳ Deferred — will resurface after ${deferSessions} session${deferSessions === 1 ? '' : 's'}.`,
              defer_count: deferCount,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

/** Ordinal suffix helper (handles 11-13 and 1/2/3 endings). */
function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const mod10 = n % 10;
  if (mod10 === 1) return `${n}st`;
  if (mod10 === 2) return `${n}nd`;
  if (mod10 === 3) return `${n}rd`;
  return `${n}th`;
}

// ---------------------------------------------------------------------------
// Tool: show_growth
// ---------------------------------------------------------------------------

server.registerTool(
  'show_growth',
  {
    title: 'Show Growth',
    description:
      'Show how patterns have been resolved over time. ' +
      'For reviewing improvement trends — leads with wins, not problems. ' +
      'Displays resolved patterns, active suggestions, and cumulative stats. ' +
      'Use this to see how Cairn has helped improve your workflow.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => {
    try {
      ensureDb();

      const counts = countPrescriptionsByStatus(db);
      const totalSessions = getSessionsSinceInstall(db);

      // Compute stats
      const applied = counts['applied'] ?? 0;
      const accepted = counts['accepted'] ?? 0;
      const rejected = counts['rejected'] ?? 0;
      const deferred = counts['deferred'] ?? 0;
      const failed = counts['failed'] ?? 0;
      const total =
        (counts['generated'] ?? 0) + accepted + rejected + deferred +
        applied + failed + (counts['expired'] ?? 0) + (counts['suppressed'] ?? 0);

      const resolved = accepted + rejected + applied + failed;

      // Resolved patterns: prescriptions that were applied, whose insight is now stale
      // Batch-fetch all referenced insights in one query to avoid N+1
      const appliedPrescriptions = listPrescriptions(db, { status: 'applied', limit: 100 });
      const resolvedPatterns: string[] = [];
      const seenInsights = new Set<number>();
      const uniqueInsightIds = [...new Set(appliedPrescriptions.map((p) => p.insightId))];
      const insightMap = getInsightsByIds(db, uniqueInsightIds);
      for (const p of appliedPrescriptions) {
        if (seenInsights.has(p.insightId)) continue;
        seenInsights.add(p.insightId);
        const insight = insightMap.get(p.insightId);
        if (insight && insight.status === 'stale') {
          resolvedPatterns.push(`${insight.title} — resolved after applying prescription`);
        } else if (insight) {
          resolvedPatterns.push(`${insight.title} — prescription applied`);
        }
      }

      // Active patterns: prescriptions in 'generated' status
      const generatedPrescriptions = listPrescriptions(db, { status: 'generated', limit: 100 });
      const activePatterns: string[] = [];
      const seenActive = new Set<number>();
      for (const p of generatedPrescriptions) {
        if (seenActive.has(p.insightId)) continue;
        seenActive.add(p.insightId);
        activePatterns.push(`${p.title} — 1 suggestion pending`);
      }

      // Acceptance rate in natural language
      const acceptanceRateDisplay =
        resolved > 0
          ? `${accepted + applied} of ${resolved} resolved`
          : 'No prescriptions resolved yet';

      // Trend: direction enum + observational message
      let trendDirection: 'improving' | 'stable' | 'declining';
      let trendMessage: string;
      if (total === 0) {
        trendDirection = 'stable';
        trendMessage = 'No prescriptions yet — Cairn is still learning your patterns.';
      } else if (applied > 0 && resolvedPatterns.length > 0) {
        trendDirection = 'improving';
        trendMessage = `You're building good habits — ${resolvedPatterns.length} pattern${resolvedPatterns.length === 1 ? '' : 's'} resolved so far.`;
      } else if (applied > 0) {
        trendDirection = 'improving';
        trendMessage = 'Prescriptions are being applied — patterns should start resolving soon.';
      } else {
        trendDirection = 'stable';
        trendMessage = 'Cairn is observing your workflow and generating suggestions.';
      }

      // Summary paragraph
      const summary =
        totalSessions > 0
          ? `Over ${totalSessions} session${totalSessions === 1 ? '' : 's'}, Cairn has helped resolve ${resolvedPatterns.length} recurring pattern${resolvedPatterns.length === 1 ? '' : 's'}.`
          : `Cairn has generated ${total} prescription${total === 1 ? '' : 's'} so far.`;

      const growth: GrowthSummary = {
        summary,
        resolvedPatterns: resolvedPatterns.slice(0, 10),
        activePatterns: activePatterns.slice(0, 10),
        stats: {
          totalPrescriptions: total,
          accepted,
          applied,
          rejected,
          deferred,
          acceptanceRateDisplay,
        },
        trendDirection,
        trendMessage,
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                summary: growth.summary,
                resolved_patterns: growth.resolvedPatterns,
                active_patterns: growth.activePatterns,
                stats: {
                  total_prescriptions: growth.stats.totalPrescriptions,
                  accepted: growth.stats.accepted,
                  applied: growth.stats.applied,
                  rejected: growth.stats.rejected,
                  deferred: growth.stats.deferred,
                  acceptance_rate_display: growth.stats.acceptanceRateDisplay,
                },
                trend_direction: growth.trendDirection,
                trend_message: growth.trendMessage,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Shared skill file resolution helper (used by lint_skill and test_skill)
// ---------------------------------------------------------------------------

interface SkillFileResult {
  filePath: string;
  content: string;
}

interface SkillFileError {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
}

/**
 * Resolve a skill_path to an absolute SKILL.md path, apply name and size
 * guards, and read the file content. Returns the resolved path and content,
 * or an MCP error response if any guard fails.
 *
 * Exported for testing of the guard behaviors (name check, size check,
 * read-error path). Not part of the public MCP contract.
 */
export function resolveAndReadSkill(skillPath: string): SkillFileResult | SkillFileError {
  let filePath = skillPath;

  // Resolve relative paths
  if (!path.isAbsolute(filePath)) {
    filePath = path.resolve(filePath);
  }

  // If path is a directory, look for SKILL.md inside it
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'SKILL.md');
    }
  } catch {
    // stat failed — let the readFile below produce the error
  }

  // Restrict to SKILL.md files to avoid probing arbitrary paths
  const basename = path.basename(filePath);
  if (basename !== 'SKILL.md') {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ error: `Expected a SKILL.md file, got "${basename}"` }),
      }],
      isError: true,
    };
  }

  // Guard against oversized files (1 MB limit)
  try {
    const fileSize = fs.statSync(filePath).size;
    if (fileSize > 1_000_000) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ error: `File too large: ${filePath} (${fileSize} bytes)` }),
        }],
        isError: true,
      };
    }
  } catch {
    // stat failed — let readFile produce the error
  }

  // Read the file
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ error: `Cannot read file: ${filePath}` }),
      }],
      isError: true,
    };
  }

  return { filePath, content };
}

/** @internal Exported for testing. */
export function isSkillFileError(result: SkillFileResult | SkillFileError): result is SkillFileError {
  return 'isError' in result;
}

// ---------------------------------------------------------------------------
// Tool: lint_skill
// ---------------------------------------------------------------------------

server.registerTool(
  'lint_skill',
  {
    title: 'Lint Skill',
    description:
      'Validate a SKILL.md file for structural correctness. ' +
      'Checks for required frontmatter fields (name, description) and recommended frontmatter fields ' +
      '(domain, confidence, source), required sections (Context, Patterns), empty sections, ' +
      'valid confidence values, and well-formed tool declarations. ' +
      'Returns structured lint results with severity, rule ID, and suggested fixes. ' +
      'Use this when authoring or reviewing skill files.',
    inputSchema: {
      skill_path: z
        .string()
        .describe(
          'Path to the SKILL.md file, or a directory containing one. ' +
          'Absolute or relative to the current working directory.',
        ),
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async ({ skill_path }: { skill_path: string }) => {
    try {
      const resolved = resolveAndReadSkill(skill_path);
      if (isSkillFileError(resolved)) return resolved;
      const { filePath, content } = resolved;

      // Parse and lint
      const parsed = parseSkill(content);
      const results = lintSkill(parsed);
      const summary = formatLintSummary(results);

      // Log a skill_lint event if a session is active
      try {
        ensureDb();
        const repoKey = process.env.CAIRN_REPO_KEY;
        const session = getUserSessionForMcpFallback(db, repoKey, normalizeWorkdir(process.env.CAIRN_WORKDIR));
        if (session) {
          logEvent(db, session.id, 'skill_lint', {
            path: filePath,
            skillName: parsed.name,
            errors: results.filter((r) => r.severity === 'error').length,
            warnings: results.filter((r) => r.severity === 'warning').length,
          });
        }
      } catch {
        // Fail-open — event logging must not break the tool
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: filePath,
            skill_name: parsed.name,
            results: results.map((r) => ({
              rule: r.rule,
              severity: r.severity,
              message: r.message,
              line: r.line ?? null,
              fix: r.fix ?? null,
            })),
            summary,
          }, null, 2),
        }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: test_skill
// ---------------------------------------------------------------------------

server.registerTool(
  'test_skill',
  {
    title: 'Test Skill',
    description:
      'Run quality validation on a SKILL.md file. Evaluates content quality across the 5 C\'s: ' +
      'Clarity, Completeness, Concreteness, Consistency, Containment. ' +
      'Returns scored results (0.0-1.0) per quality vector.',
    inputSchema: {
      skill_path: z
        .string()
        .optional()
        .describe(
          'Path to a SKILL.md file or directory containing one. ' +
          'Optional when scenario_path is provided (scenario defines its own skill_path).',
        ),
      scenario_path: z
        .string()
        .optional()
        .describe(
          'Optional path to a skill-tests.yaml scenario file. ' +
          'If omitted, runs all Tier 1 rules with default thresholds.',
        ),
    },
    annotations: {
      readOnlyHint: false,
    },
  },
  async ({ skill_path, scenario_path }: { skill_path?: string; scenario_path?: string }) => {
    try {
      // If scenario_path is provided, use the test harness
      if (scenario_path) {
        let scenarioFile = scenario_path;
        if (!path.isAbsolute(scenarioFile)) {
          scenarioFile = path.resolve(scenarioFile);
        }

        const scenario = loadTestScenario(scenarioFile);

        // Apply the same guards to the scenario's resolved skill path
        const scenarioSkillResolved = resolveAndReadSkill(scenario.skillPath);
        if (isSkillFileError(scenarioSkillResolved)) return scenarioSkillResolved;

        // Use the resolved path so runTestScenario doesn't re-resolve differently
        const report = runTestScenario({ ...scenario, skillPath: scenarioSkillResolved.filePath });
        const text = formatTestReport(report);

        // Persist results to DB if session exists
        try {
          ensureDb();
          const repoKey = process.env.CAIRN_REPO_KEY;
          const session = getUserSessionForMcpFallback(db, repoKey, normalizeWorkdir(process.env.CAIRN_WORKDIR));
          if (session) {
            const inserts: SkillTestResultInsert[] = report.results.map((r: ValidationResult) => ({
              skillPath: report.skillPath,
              skillName: report.skillName ?? undefined,
              scenarioName: report.scenario,
              vector: r.vector,
              tier: r.tier,
              rule: r.rule,
              score: r.score,
              passed: r.passed,
              message: r.message,
              evidence: r.evidence,
              sessionId: session.id,
            }));
            insertTestResults(db, inserts);

            logEvent(db, session.id, 'skill_test', {
              path: report.skillPath,
              skillName: report.skillName,
              scenario: report.scenario,
              passed: report.passed,
              overallScore: report.overallScore,
            });
          }
        } catch {
          // Fail-open — event logging must not break the tool
        }

        return {
          content: [{ type: 'text' as const, text }],
        };
      }

      // No scenario — skill_path is required
      if (!skill_path) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ error: 'skill_path is required when scenario_path is not provided' }),
          }],
          isError: true,
        };
      }

      const resolved = resolveAndReadSkill(skill_path);
      if (isSkillFileError(resolved)) return resolved;
      const { filePath, content } = resolved;

      const parsed = parseSkill(content);
      const results = validateSkill(parsed);
      const summary = formatValidationSummary(results);

      // Compute numeric overall score for consistent telemetry
      const vectors = new Set(results.map((r) => r.vector));
      let totalVectorScore = 0;
      for (const v of vectors) {
        const vResults = results.filter((r) => r.vector === v);
        totalVectorScore += vResults.reduce((s, r) => s + r.score, 0) / vResults.length;
      }
      const numericOverallScore = vectors.size > 0 ? totalVectorScore / vectors.size : 0;

      // Persist results to DB if session exists
      try {
        ensureDb();
        const repoKey = process.env.CAIRN_REPO_KEY;
        const session = getUserSessionForMcpFallback(db, repoKey, normalizeWorkdir(process.env.CAIRN_WORKDIR));
        if (session) {
          const inserts: SkillTestResultInsert[] = results.map((r) => ({
            skillPath: filePath,
            skillName: parsed.name ?? undefined,
            vector: r.vector,
            tier: r.tier,
            rule: r.rule,
            score: r.score,
            passed: r.passed,
            message: r.message,
            evidence: r.evidence,
            sessionId: session.id,
          }));
          insertTestResults(db, inserts);

          logEvent(db, session.id, 'skill_test', {
            path: filePath,
            skillName: parsed.name,
            overallScore: numericOverallScore,
          });
        }
      } catch {
        // Fail-open — event logging must not break the tool
      }

      return {
        content: [{ type: 'text' as const, text: summary }],
      };
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// DB bootstrap helper
// ---------------------------------------------------------------------------

/**
 * Ensure the DB singleton is initialised before any tool handler runs.
 * Refreshes the module-scoped `db` handle from Cairn's `getDb()` on every
 * call, so callers always see the live connection even if `closeDb()`
 * resets and reopens it between requests.
 */
function ensureDb(): Database.Database {
  db = getDb();
  return db;
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when executed as a script, not when imported.
const isScript = checkIsScript(import.meta.url);
if (isScript) {
  main().catch((err: unknown) => {
    process.stderr.write(`Cairn MCP server failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
