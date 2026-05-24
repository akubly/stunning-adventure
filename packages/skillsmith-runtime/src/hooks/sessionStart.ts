import type { PrescriberRunResult } from '@akubly/types';
import { runSessionStartHook } from '@akubly/cairn';
import { createPrescriberOrchestrationConfig } from '../index.js';

function logAutoPrescriberSummary(curateResult: { prescribers?: PrescriberRunResult[] }): void {
  const total = (curateResult.prescribers ?? []).reduce(
    (sum, result) => ({
      processed: sum.processed + 1,
      inserted: sum.inserted + result.hintsInserted,
      duplicated: sum.duplicated + result.hintsDuplicated,
      errors: sum.errors + result.hintsError,
      skipped: sum.skipped + (result.skippedReason ? 1 : 0),
    }),
    { processed: 0, inserted: 0, duplicated: 0, errors: 0, skipped: 0 },
  );

  if (
    total.processed > 0
    && (total.inserted > 0 || total.duplicated > 0 || total.errors > 0 || total.skipped > 0)
  ) {
    console.warn(
      `skillsmith-runtime: prescribers (auto) processed=${total.processed} inserted=${total.inserted} duplicated=${total.duplicated} errors=${total.errors} skipped=${total.skipped}`,
    );
  }
}

async function main(): Promise<void> {
  try {
    await runSessionStartHook(
      (db) => createPrescriberOrchestrationConfig({ db }),
      logAutoPrescriberSummary,
    );
  } catch (error) {
    console.warn(
      `skillsmith-runtime bootstrap: hook execution failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    process.exit(0);
  }
}

void main();
