#!/usr/bin/env node

/**
 * Cairn MCP Server
 *
 * Exposes Cairn's knowledge base as MCP tools for Copilot conversations.
 * Uses stdio transport — designed to be launched as a subprocess by the
 * MCP host (e.g. Copilot CLI, VS Code).
 */

import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { getDb } from '../db/index.js';
import { getActiveSession } from '../db/sessions.js';
import { getInsights, countInsightsByStatus } from '../db/insights.js';
import { curate, getCuratorStatus } from '../agents/curator.js';
import {
  getSessionSummary,
  sessionExists,
  hasEventOccurred,
  findEvents,
} from '../agents/sessionState.js';

import type { InsightStatus } from '../types/index.js';

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
      'Returns the number of events processed and insights created or reinforced. ' +
      'Use this when you want fresh analysis of recent activity.',
    annotations: {
      readOnlyHint: false,
    },
  },
  async () => {
    try {
      ensureDb();

      const result = curate();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
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
let resolvedArgv: string | undefined;
const argv1 = process.argv[1];
if (argv1) {
  const resolvedPath = path.resolve(argv1);
  try {
    resolvedArgv = url.pathToFileURL(fs.realpathSync(resolvedPath)).href;
  } catch {
    resolvedArgv = url.pathToFileURL(resolvedPath).href;
  }
}
const isScript = resolvedArgv !== undefined && import.meta.url === resolvedArgv;
if (isScript) {
  main().catch((err: unknown) => {
    process.stderr.write(`Cairn MCP server failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
