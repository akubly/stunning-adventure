import type { ChangeVectorProvider, ChangeVectorSummary, ExecutionProfile, HintDispositionProvider, DispositionSummary } from "@akubly/types";
import { analyzePromptOptimizations } from "./promptOptimizer.js";
import { analyzeTokenOptimizations } from "./tokenOptimizer.js";
import { applyDispositions } from "./utils.js";
import type { OptimizationHint, PrescriberConfig } from "./types.js";

export interface ForgePrescriberOrchestratorOptions {
  provider?: ChangeVectorProvider;
  dispositionProvider?: HintDispositionProvider;
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

  let dispositions: DispositionSummary[] | undefined;
  if (options.dispositionProvider) {
    try {
      dispositions = await options.dispositionProvider.getDispositions(skillId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[forge] HintDispositionProvider.getDispositions failed for skill=${skillId}: ${message} (fail-open: proceeding without disposition data)`,
      );
      dispositions = undefined;
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

  const allHints = [...promptHints.hints, ...tokenHints.hints];

  if (dispositions && dispositions.length > 0) {
    return applyDispositions(allHints, dispositions);
  }

  return allHints;
}
