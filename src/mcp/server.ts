#!/usr/bin/env node

/**
 * Cairn MCP Server
 *
 * Exposes Cairn's knowledge base as MCP tools for Copilot conversations.
 * Uses stdio transport — designed to be launched as a subprocess by the
 * MCP host (e.g. Copilot CLI, VS Code).
 */

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getDb } from '../db/index.js';
import { getActiveSession, getMostRecentActiveSession } from '../db/sessions.js';
import { getInsights, getInsight, getInsightsByIds, countInsightsByStatus } from '../db/insights.js';
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

import type { GrowthSummary, InsightStatus, PrescriptionStatus } from '../types/index.js';
import { PRESCRIPTION_STATUSES } from '../types/index.js';
import { checkIsScript } from '../utils/isScript.js';
import { getPreference } from '../db/preferences.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const esmRequire = createRequire(import.meta.url);
const pkg = esmRequire('../../package.json') as { version: string };

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
      'Returns the active session (repo, branch, duration) and curator metrics ' +
      '(last run time, cursor position, insight counts by status). ' +
      'Use this to understand what Cairn is tracking right now.',
    inputSchema: {
      repo_key: z
        .string()
        .optional()
        .describe('Repository key to look up the active session. Omit to get curator status only.'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ repo_key }) => {
    try {
      ensureDb();

      const curatorStatus = getCuratorStatus();
      const session = repo_key ? getActiveSession(repo_key) : undefined;

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ session: session ?? null, curator: curatorStatus }, null, 2),
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

      const insights = getInsights(status as InsightStatus | undefined);
      const counts = countInsightsByStatus();

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
      'Get detailed information about a specific session by its ID. ' +
      'Returns event counts (total, tool_use, errors), skip breadcrumbs, ' +
      'and the 10 most recent events. Use this to inspect what happened ' +
      'during a particular session.',
    inputSchema: {
      session_id: z.string().describe('The session UUID to look up.'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ session_id }) => {
    try {
      ensureDb();

      const summary = getSessionSummary(session_id);

      if (!summary) {
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

      if (!sessionExists(session_id)) {
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

      const events = findEvents(session_id, type_pattern, limit);

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

      const result = curate();

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

      if (!sessionExists(session_id)) {
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

      const occurred = hasEventOccurred(session_id, event_type);

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

      const prescriptions = listPrescriptions({
        status: status as PrescriptionStatus | undefined,
        limit,
      });
      const counts = countPrescriptionsByStatus();

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
      const currentSessionGen = getSessionsSinceInstall();
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

      const prescription = getPrescription(prescription_id);
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
      const insight = getInsight(prescription.insightId);

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
    },
    annotations: { readOnlyHint: false },
  },
  async ({ prescription_id, disposition, reason, repo_key }) => {
    try {
      ensureDb();

      // Guard: prescription must exist and be in actionable state
      const prescription = getPrescription(prescription_id);
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

      if (prescription.status !== 'generated') {
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
        updatePrescriptionStatus(prescription_id, 'accepted');
        // Prefer repo-scoped session; fall back to global most-recent
        // when no repo context is available (may misattribute events).
        const activeSession = repo_key
          ? getActiveSession(repo_key)
          : getMostRecentActiveSession();
        let applyResult: { success: boolean; error?: string; path?: string };
        try {
          applyResult = applyPrescription(prescription_id, {
            sessionId: activeSession?.id,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          updatePrescriptionStatus(prescription_id, 'failed');
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
          updatePrescriptionStatus(prescription_id, 'failed');
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
        updatePrescriptionStatus(prescription_id, 'rejected', {
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
      const n = Number.parseInt(getPreference('prescriber.defer_sessions') ?? '3', 10);
      const deferSessions = Number.isFinite(n) && n >= 0 ? n : 3;
      deferPrescription(prescription_id, reason, deferSessions);

      // Re-read to get updated defer count
      const updated = getPrescription(prescription_id);
      const deferCount = updated?.deferCount ?? 1;

      // Check auto-suppress threshold
      const wasSuppressed = checkAutoSuppress(prescription_id, deferCount);

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

      const counts = countPrescriptionsByStatus();
      const totalSessions = getSessionsSinceInstall();

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
      const appliedPrescriptions = listPrescriptions({ status: 'applied', limit: 100 });
      const resolvedPatterns: string[] = [];
      const seenInsights = new Set<number>();
      const uniqueInsightIds = [...new Set(appliedPrescriptions.map((p) => p.insightId))];
      const insightMap = getInsightsByIds(uniqueInsightIds);
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
      const generatedPrescriptions = listPrescriptions({ status: 'generated', limit: 100 });
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
// DB bootstrap helper
// ---------------------------------------------------------------------------

/** Ensure the DB singleton is initialised before any tool handler runs. */
function ensureDb(): void {
  getDb();
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
