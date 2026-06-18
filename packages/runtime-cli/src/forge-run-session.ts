#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { closeDb, getKnowledgeDbPath } from '@akubly/cairn';
import {
  runForgeInstrumentedSession,
  type RunForgeInstrumentedSessionOptions,
  type RunForgeInstrumentedSessionResult,
} from '@akubly/skillsmith-runtime';

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_PROMPT_LENGTH = 100_000;
const VALID_REASONING_EFFORTS = new Set(['low', 'medium', 'high', 'xhigh']);

function printUsage(): void {
  console.log(`Usage: forge-run-session --skill <id> --prompt <text> [options]

Flags:
  --skill <id>        Required. Skill ID used for the execution profile.
  --prompt <text>     Required. Prompt to send to one real Copilot SDK session (max ${MAX_PROMPT_LENGTH} chars).
  --model <id>        Optional model override.
  --reasoning <level> Optional reasoning effort.
  --cwd <path>        Working directory for the session.
  --timeout-ms <n>    sendAndWait timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}).
  --db <path>         SQLite path (default: ${getKnowledgeDbPath()}).
  --no-curate         Persist signal_samples but skip profile build.
  --help, -h          Show this message.`);
}

function parseReasoningEffort(value: string | undefined): RunForgeInstrumentedSessionOptions['reasoningEffort'] {
  if (value === undefined) return undefined;
  if (!VALID_REASONING_EFFORTS.has(value)) {
    throw new Error(
      `--reasoning must be one of ${Array.from(VALID_REASONING_EFFORTS).join(', ')}; got ${JSON.stringify(value)}.`,
    );
  }
  return value as RunForgeInstrumentedSessionOptions['reasoningEffort'];
}

export interface ForgeRunSessionCliDeps {
  runner?: (options: RunForgeInstrumentedSessionOptions) => Promise<RunForgeInstrumentedSessionResult>;
}

function parsePositiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer; got ${JSON.stringify(value)}.`);
  }
  return parsed;
}

export async function runForgeRunSessionCli(
  argv: string[] = process.argv.slice(2),
  deps: ForgeRunSessionCliDeps = {},
): Promise<number> {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      skill: { type: 'string' },
      prompt: { type: 'string' },
      model: { type: 'string' },
      reasoning: { type: 'string' },
      cwd: { type: 'string' },
      'timeout-ms': { type: 'string' },
      db: { type: 'string' },
      'no-curate': { type: 'boolean' },
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
  if (!parsed.values.prompt) {
    console.error('Missing required --prompt <text> flag.');
    printUsage();
    return 2;
  }
  if (parsed.values.prompt.length > MAX_PROMPT_LENGTH) {
    console.error(`--prompt must be at most ${MAX_PROMPT_LENGTH} characters.`);
    return 2;
  }

  try {
    const timeoutMs = parsePositiveInteger(parsed.values['timeout-ms'], '--timeout-ms') ?? DEFAULT_TIMEOUT_MS;
    const reasoningEffort = parseReasoningEffort(parsed.values.reasoning);
    const runner = deps.runner ?? runForgeInstrumentedSession;
    const result = await runner({
      skillId: parsed.values.skill,
      prompt: parsed.values.prompt,
      dbPath: parsed.values.db,
      model: parsed.values.model,
      reasoningEffort,
      workingDirectory: parsed.values.cwd,
      timeoutMs,
      clientName: 'forge-run-session',
      buildProfile: !parsed.values['no-curate'],
      closeDbOnFinish: false,
    });

    console.log(JSON.stringify({
      sessionId: result.sessionId,
      signalSamplesWritten: result.signalSamplesWritten,
      profileFound: result.profileFound,
      profileSessionCount: result.profileSessionCount,
      bridgeEventCount: result.bridgeEventCount,
      telemetryTimings: result.telemetryTimings,
    }, null, 2));
    return result.signalSamplesWritten > 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`forge-run-session: ${message}`);
    return 2;
  } finally {
    closeDb();
  }
}

export const main = runForgeRunSessionCli;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Failed to run forge-run-session: ${message}`);
      process.exitCode = 2;
      closeDb();
    });
}
