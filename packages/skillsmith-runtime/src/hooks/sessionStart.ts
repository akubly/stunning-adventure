import { runSessionStartHook } from '@akubly/cairn';
import { createPrescriberOrchestrationConfig } from '../index.js';

async function main(): Promise<void> {
  try {
    await runSessionStartHook((db) => createPrescriberOrchestrationConfig({ db }));
  } finally {
    process.exit(0);
  }
}

void main();
