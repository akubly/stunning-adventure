/**
 * Drift score computation.
 *
 * Determinism > token cost (Aaron's design constraint): convergence,
 * tool-entropy and prompt-stability dominate the weight vector.
 */

export type DriftLevel = "GREEN" | "YELLOW" | "RED";

export interface DriftSignals {
  /** How quickly the session converged on a solution (0 = instant, 1 = never). */
  convergence: number;
  /** Token usage relative to budget (0 = none, 1 = exhausted). */
  tokenPressure: number;
  /** Entropy in tool selection (0 = deterministic, 1 = random). */
  toolEntropy: number;
  /** Context window utilization (0 = empty, 1 = full). */
  contextBloat: number;
  /** Prompt template stability (0 = identical, 1 = completely different). */
  promptStability: number;
}

export interface DriftScore {
  score: number;
  level: DriftLevel;
  signals: DriftSignals;
  weights: Record<keyof DriftSignals, number>;
}

/** Signal weights — determinism signals weighted higher per Aaron's constraint. */
export const DRIFT_WEIGHTS: Readonly<Record<keyof DriftSignals, number>> = Object.freeze({
  convergence: 0.30,
  tokenPressure: 0.15,
  toolEntropy: 0.25,
  contextBloat: 0.15,
  promptStability: 0.15,
});

/**
 * Compute a weighted drift score from raw signals.
 * All signals normalized to [0, 1]. Score is weighted sum.
 */
export function computeDriftScore(signals: DriftSignals): DriftScore {
  const clamp = (v: number): number => {
    if (Number.isNaN(v)) return 0;
    return Math.max(0, Math.min(1, v));
  };

  const weighted =
    clamp(signals.convergence) * DRIFT_WEIGHTS.convergence +
    clamp(signals.tokenPressure) * DRIFT_WEIGHTS.tokenPressure +
    clamp(signals.toolEntropy) * DRIFT_WEIGHTS.toolEntropy +
    clamp(signals.contextBloat) * DRIFT_WEIGHTS.contextBloat +
    clamp(signals.promptStability) * DRIFT_WEIGHTS.promptStability;

  return {
    score: Math.round(weighted * 1000) / 1000,
    level: classifyDriftLevel(weighted),
    signals,
    weights: { ...DRIFT_WEIGHTS },
  };
}

/**
 * Classify drift score into GREEN/YELLOW/RED.
 *
 * GREEN  < 0.1   — system is deterministic, on track
 * YELLOW 0.1–0.3 — drift detected, monitor closely
 * RED    ≥ 0.3   — significant drift, prescriptions needed
 */
export function classifyDriftLevel(score: number): DriftLevel {
  if (score < 0.1) return "GREEN";
  if (score < 0.3) return "YELLOW";
  return "RED";
}
