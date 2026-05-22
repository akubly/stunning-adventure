import type { ChangeVectorProvider, ExecutionProfile } from "@akubly/types";
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
  let historicalVectors;
  if (options.provider) {
    try {
      historicalVectors = await options.provider.getSummaries(skillId);
    } catch {
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
