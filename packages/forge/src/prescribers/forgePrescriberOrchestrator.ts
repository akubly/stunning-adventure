import type { ChangeVectorProvider, ChangeVectorSummary, ExecutionProfile } from "@akubly/types";
import { analyzePromptOptimizations } from "./promptOptimizer.js";
import { analyzeTokenOptimizations } from "./tokenOptimizer.js";
import type { OptimizationHint, PrescriberConfig } from "./types.js";

export interface ForgePrescriberOrchestratorOptions {
  provider?: ChangeVectorProvider;
  config?: PrescriberConfig;
}

export async function runForgePrescribers(
  profile: ExecutionProfile,
  skillId: string,
  options: ForgePrescriberOrchestratorOptions = {},
): Promise<OptimizationHint[]> {
  let historicalVectors: ChangeVectorSummary[] | undefined;
  if (options.provider) {
    try {
      historicalVectors = await options.provider.getSummaries(skillId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[forge] ChangeVectorProvider.getSummaries failed for skill=${skillId}: ${message} (fail-open: proceeding without historical vectors)`,
      );
      historicalVectors = undefined;
    }
  }

  const promptHints = analyzePromptOptimizations(
    profile,
    options.config?.prompt,
    historicalVectors,
  );
  const tokenHints = analyzeTokenOptimizations(
    profile,
    options.config?.token,
    historicalVectors,
  );

  return [...promptHints.hints, ...tokenHints.hints];
}
