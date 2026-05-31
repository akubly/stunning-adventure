#!/usr/bin/env node

/**
 * Forge MCP Server (W5-5)
 *
 * Exposes forge_prescribe as an MCP tool so Copilot can trigger skill
 * optimisation hint generation directly from a conversation.
 *
 * Uses stdio transport — designed to be launched as a subprocess by the
 * MCP host (e.g. Copilot CLI, VS Code).  Runs alongside (not instead of)
 * the Cairn MCP server; the two servers are registered separately in
 * .mcp.json because cairn ← skillsmith-runtime creates a circular dep if
 * this tool lived in @akubly/cairn.
 */

import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import * as cairn from '@akubly/cairn';
import { forgePrescribeHandler } from './handler.js';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const esmRequire = createRequire(import.meta.url);
const pkg = esmRequire('../../package.json') as { version: string };

const server = new McpServer(
  { name: 'forge', version: pkg.version },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// DB bootstrap
// ---------------------------------------------------------------------------

/**
 * Returns the Cairn singleton DB handle.
 * Mirrors the `ensureDb()` pattern in @akubly/cairn MCP server.
 */
function ensureDb(): ReturnType<typeof cairn.getDb> {
  return cairn.getDb();
}

// ---------------------------------------------------------------------------
// Tool: forge_prescribe
// ---------------------------------------------------------------------------

server.registerTool(
  'forge_prescribe',
  {
    title: 'Forge Prescribe',
    description:
      'Run the Forge prescriber for a skill to generate optimisation hints. ' +
      'Returns inserted/skipped/errored counts and the profile tier used. ' +
      'When force=true, existing active hints for the same (skill, source, category) ' +
      'tuples are replaced with the new run\'s output; unrelated active hints are not affected. ' +
      'Use as an operator escape hatch when hints are stuck in a bad state.',
    annotations: {
      readOnlyHint: false,
    },
    inputSchema: {
      skill_id: z.string().describe('Skill ID to run prescribers for.'),
      force: z
        .boolean()
        .optional()
        .describe(
          'If true, expire active hints before generating (forceRegenerate). Default: false.',
        ),
      repo_key: z
        .string()
        .optional()
        .describe(
          'Repository key used to resolve the active user session for event attribution. ' +
          'Omit to fall back to the most-recent user session across all repos.',
        ),
    },
  },
  async ({ skill_id, force, repo_key }) => {
    try {
      const db = ensureDb();
      return await forgePrescribeHandler(db, { skill_id, force, repo_key });
    } catch (err: unknown) {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }],
        isError: true,
      };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only run when executed as a script, not when imported (e.g. in tests).
function checkIsScript(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const resolvedPath = path.resolve(argv1);
  let resolvedArgv: string;
  try {
    resolvedArgv = url.pathToFileURL(fs.realpathSync(resolvedPath)).href;
  } catch {
    resolvedArgv = url.pathToFileURL(resolvedPath).href;
  }
  return importMetaUrl === resolvedArgv;
}

if (checkIsScript(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`Forge MCP server failed to start: ${String(err)}\n`);
    process.exit(1);
  });
}
