#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { closeDb, getDb, getKnowledgeDbPath, insertSignalSamples, buildProfiles, getExecutionProfile } from '@akubly/cairn';
import type { SignalSampleInsert } from '@akubly/cairn';

function printUsage(): void {
  console.log(`Usage: forge-seed-profile --skill <id> --session-count <n> [--db <path>]

Flags:
  --skill <id>           Required. Skill ID to seed a profile for.
  --session-count <n>    Required. Number of synthetic sessions to seed (must be >= 1).
  --db <path>            SQLite path (default: ${getKnowledgeDbPath()})
  --help, -h             Show this message.

Seeds synthetic signal_samples for the given skill and runs buildProfiles so
the prescriber pipeline has a usable execution_profile to work with before
live telemetry is wired up.`);
}

/**
 * Synthesise plausible signal_samples for a single session.
 *
 * Metadata shapes mirror what the real forge telemetry collectors emit on flush:
 *   drift   → { signals, level, turnCount, toolsUsed }
 *   token   → { totalInput, totalOutput, totalCacheRead, totalCacheWrite,
 *               cacheHitRate, callCount, costNanoAiu }
 *   outcome → { succeeded, turnCount, toolCalls, toolErrors, toolErrorRate }
 */
function synthSamples(skillId: string, sessionId: string, index: number): SignalSampleInsert[] {
  // Vary values slightly by index so the aggregator sees a realistic spread
  const jitter = (index % 5) * 0.02;
  const collectedAt = new Date(Date.UTC(2026, 4, 1) + index * 60_000).toISOString();

  const drift: SignalSampleInsert = {
    kind: 'drift',
    sessionId,
    skillId,
    value: 0.28 + jitter,
    metadata: {
      signals: {
        convergence: 0.3 + jitter,
        tokenPressure: 0.4,
        toolEntropy: 0.5,
        contextBloat: 0.35,
        promptStability: 0.1,
      },
      level: 'yellow',
      turnCount: 10 + index,
      toolsUsed: 4,
    },
    collectedAt,
  };

  const totalInput = 50_000;
  const totalOutput = 30_000;
  const totalCacheRead = 10_000;
  const cacheHitRate = totalCacheRead / (totalInput + totalOutput);
  const costNanoAiu = 5_000_000 + index * 100_000;

  const token: SignalSampleInsert = {
    kind: 'token',
    sessionId,
    skillId,
    value: costNanoAiu,
    metadata: {
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheWrite: 5_000,
      cacheHitRate,
      callCount: 5,
      costNanoAiu,
    },
    collectedAt,
  };

  const toolCalls = 15 + index;
  const toolErrors = 1;

  const outcome: SignalSampleInsert = {
    kind: 'outcome',
    sessionId,
    skillId,
    value: 1,
    metadata: {
      succeeded: true,
      turnCount: 10 + index,
      toolCalls,
      toolErrors,
      toolErrorRate: toolErrors / toolCalls,
    },
    collectedAt,
  };

  return [drift, token, outcome];
}

export interface SeedProfileOptions {
  skillId: string;
  sessionCount: number;
  /** SQLite path override; omit to use the current getDb() singleton. */
  dbPath?: string;
}

export interface SeedProfileResult {
  skillId: string;
  sessionCount: number;
  profilesBuilt: number;
  samplesInserted: number;
  tiers: string[];
}

/**
 * Core seeding logic — exposed for programmatic use and tests.
 * Does NOT close the DB connection; the caller is responsible for that.
 *
 * Implementation note: uses buildProfiles (the real Slice 2+3 path) rather
 * than a direct upsertExecutionProfile call so the seeded profile is
 * structurally identical to one produced by live telemetry.
 */
export function runForgeSeedProfile(options: SeedProfileOptions): SeedProfileResult {
  const db = getDb(options.dbPath);

  const samples: SignalSampleInsert[] = [];
  for (let i = 0; i < options.sessionCount; i++) {
    samples.push(...synthSamples(options.skillId, `seed-session-${i}`, i));
  }

  insertSignalSamples(db, samples);

  // buildProfiles reads ALL signal_samples and upserts per-skill + global profiles,
  // exercising the real aggregation path so the prescriber gets authentic-shaped data.
  const buildResult = buildProfiles(db);

  const profile = getExecutionProfile(db, options.skillId, 'per-skill', 'global');
  const finalSessionCount = profile?.sessionCount ?? options.sessionCount;

  return {
    skillId: options.skillId,
    sessionCount: finalSessionCount,
    profilesBuilt: buildResult.profilesBuilt,
    samplesInserted: samples.length,
    tiers: buildResult.skillIds.includes('global')
      ? ['per-skill/global', 'global/global']
      : ['per-skill/global'],
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      skill: { type: 'string' },
      'session-count': { type: 'string' },
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

  if (!parsed.values['session-count']) {
    console.error('Missing required --session-count <n> flag.');
    printUsage();
    return 2;
  }

  const sessionCount = parseInt(parsed.values['session-count'], 10);
  if (!Number.isInteger(sessionCount) || sessionCount < 1) {
    console.error(`--session-count must be a positive integer; got "${parsed.values['session-count']}".`);
    return 2;
  }

  try {
    const result = runForgeSeedProfile({
      skillId: parsed.values.skill,
      sessionCount,
      dbPath: parsed.values.db,
    });

    console.log(`Skill:            ${result.skillId}`);
    console.log(`Session count:    ${result.sessionCount}`);
    console.log(`Profiles built:   ${result.profilesBuilt}`);
    console.log(`Samples inserted: ${result.samplesInserted}`);
    console.log(`Tiers seeded:     ${result.tiers.join(', ')}`);

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`forge-seed-profile: ${message}`);
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
    console.error(`Failed to run forge-seed-profile: ${message}`);
    process.exitCode = 2;
    closeDb();
  });

