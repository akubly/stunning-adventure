#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { closeDb, getKnowledgeDbPath } from '@akubly/cairn';
import { loadMetrics } from './metrics/loadMetrics.js';
import { formatJson, formatTable } from './metrics/formatters.js';

type OutputFormat = 'json' | 'table';

function printUsage(): void {
  console.log(`Usage: forge-metrics --skill <id> [--format json|table] [--repo-key <key>] [--db <path>]

Flags:
  --skill <id>       Required. Skill ID to report metrics for.
  --format <fmt>     Output format: json (default) or table.
  --repo-key <key>   Repo key for session fallback lookup.
                     Defaults to most-recent user session if omitted.
  --db <path>        SQLite path (default: ${getKnowledgeDbPath()})
  --help, -h         Show this message.`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      skill: { type: 'string' },
      format: { type: 'string' },
      'repo-key': { type: 'string' },
      db: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (parsed.values.help) {
    printUsage();
    return 0;
  }

  if (!parsed.values.skill) {
    console.error('Missing required --skill <id> flag.');
    printUsage();
    return 2;
  }

  const formatArg = parsed.values.format ?? 'json';
  if (formatArg !== 'json' && formatArg !== 'table') {
    console.error(`Unknown --format value: "${formatArg}". Must be "json" or "table".`);
    return 2;
  }
  const format: OutputFormat = formatArg;

  try {
    const metrics = loadMetrics({
      skillId: parsed.values.skill,
      repoKey: parsed.values['repo-key'],
      dbPath: parsed.values.db,
    });

    if (format === 'table') {
      process.stdout.write(formatTable(metrics));
    } else {
      console.log(formatJson(metrics));
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`forge-metrics: ${message}`);
    return 2;
  } finally {
    closeDb();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to run forge-metrics: ${message}`);
    process.exitCode = 2;
  });
