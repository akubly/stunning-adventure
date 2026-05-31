#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { closeDb, getKnowledgeDbPath } from '@akubly/cairn';
import { runForgePrescribe } from './index.js';

function printUsage(): void {
  console.log(`Usage: forge-prescribe --skill <id> [--db <path>] [--force]

Flags:
  --skill <id>  Required skill ID to prescribe for
  --db <path>   Optional SQLite path (default: ${getKnowledgeDbPath()})
  --force       Force regeneration, expiring existing active hints before inserting new ones`);
}

function printSummary(result: {
  skillId: string;
  profileSource: string;
  totalHints: number;
  inserted: number;
  skipped: number;
  errored: number;
  totalPersisted: number;
}): void {
  console.log(`Skill: ${result.skillId}`);
  console.log(`Profile: ${result.profileSource}`);
  console.log(`Hints generated: ${result.totalHints}`);
  console.log(`  Inserted:  ${result.inserted}`);
  console.log(`  Skipped:   ${result.skipped} (existing active hints)`);
  console.log(`  Errored:   ${result.errored}`);
  console.log(`Total persisted: ${result.totalPersisted}`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      skill: { type: 'string' },
      db: { type: 'string' },
      force: { type: 'boolean' },
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

  const result = await runForgePrescribe({
    skillId: parsed.values.skill,
    dbPath: parsed.values.db,
    forceRegenerate: parsed.values.force ?? false,
  });

  if (result.profileSource) {
    printSummary({
      skillId: result.skillId,
      profileSource: result.profileSource,
      totalHints: result.totalHints ?? 0,
      inserted: result.inserted ?? 0,
      skipped: result.skipped ?? 0,
      errored: result.errored ?? 0,
      totalPersisted: result.totalPersisted ?? 0,
    });
  }

  if (!result.ok) {
    console.error(result.message);
  }

  closeDb();
  return result.exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to run forge-prescribe: ${message}`);
    process.exitCode = 2;
    closeDb();
  });
