/**
 * postToolUse hook entry point.
 *
 * Reads Copilot CLI hook JSON from stdin and logs the tool event
 * to knowledge.db via the Archivist.
 *
 * Designed to be called from a PowerShell wrapper:
 *   $hookData | node dist/hooks/postToolUse.js
 */

import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';
import { getDb, closeDb } from '../db/index.js';
import { startSession, recordToolUse, recordError } from '../agents/archivist.js';
import { getRepoKey, getBranch } from './gitContext.js';

interface HookInput {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: {
    resultType?: string;
    textResultForLlm?: string;
  };
  cwd?: string;
}

async function main(): Promise<void> {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
  }

  if (!raw.trim()) {
    process.exit(0);
  }

  let hookData: HookInput;
  try {
    hookData = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  let dbOpened = false;
  try {
    getDb();
    dbOpened = true;

    const repoKey = getRepoKey(hookData.cwd);
    const branch = getBranch(hookData.cwd);
    const sessionId = startSession(repoKey, branch);

    if (hookData.toolResult?.resultType === 'failure') {
      recordError(sessionId, 'tool_failure', `${hookData.toolName} failed`, {
        tool: hookData.toolName,
        args: hookData.toolArgs ?? {},
        result: hookData.toolResult?.textResultForLlm ?? '',
      });
    } else {
      recordToolUse(sessionId, hookData.toolName, hookData.toolArgs ?? {}, {
        resultType: hookData.toolResult?.resultType ?? 'unknown',
      });
    }
  } catch {
    // Fail open — hooks must never break the user's workflow
  } finally {
    if (dbOpened) closeDb();
    process.exit(0);
  }
}

// Only run CLI entrypoint when executed as a script, not when imported.
const isScript =
  process.argv[1] &&
  import.meta.url === url.pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href;
if (isScript) {
  main();
}
