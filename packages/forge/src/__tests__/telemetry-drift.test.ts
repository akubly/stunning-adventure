/**
 * Drift score property + metamorphic tests.
 *
 * Properties exercised:
 *   - All-zero signals → score 0, GREEN
 *   - All-max signals → score 1, RED
 *   - Score is monotone non-decreasing in any single signal
 *   - Score is bounded in [0, 1]
 *   - Weight vector sums to 1
 *   - Determinism signals dominate cost signals (Aaron's constraint)
 *   - Out-of-range / NaN inputs are clamped, not propagated
 *   - classifyDriftLevel respects threshold boundaries
 */

import { describe, it, expect } from "vitest";
import {
  computeDriftScore,
  classifyDriftLevel,
  DRIFT_WEIGHTS,
  type DriftSignals,
} from "../telemetry/drift.js";

const ZERO: DriftSignals = {
  convergence: 0,
  tokenPressure: 0,
  toolEntropy: 0,
  contextBloat: 0,
  promptStability: 0,
};

const MAX: DriftSignals = {
  convergence: 1,
  tokenPressure: 1,
  toolEntropy: 1,
  contextBloat: 1,
  promptStability: 1,
};

function rand01(seed: number): number {
  // deterministic LCG for reproducible tests
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function randomSignals(seed: number): DriftSignals {
  return {
    convergence: rand01(seed),
    tokenPressure: rand01(seed + 1),
    toolEntropy: rand01(seed + 2),
    contextBloat: rand01(seed + 3),
    promptStability: rand01(seed + 4),
  };
}

describe("DRIFT_WEIGHTS", () => {
  it("sums to 1.0 (within float tolerance)", () => {
    const sum = Object.values(DRIFT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("weighs determinism signals (convergence + toolEntropy + promptStability) higher than cost (tokenPressure + contextBloat)", () => {
    const determinism =
      DRIFT_WEIGHTS.convergence + DRIFT_WEIGHTS.toolEntropy + DRIFT_WEIGHTS.promptStability;
    const cost = DRIFT_WEIGHTS.tokenPressure + DRIFT_WEIGHTS.contextBloat;
    expect(determinism).toBeGreaterThan(cost);
  });

  it("convergence has the single highest weight", () => {
    const max = Math.max(...Object.values(DRIFT_WEIGHTS));
    expect(DRIFT_WEIGHTS.convergence).toBe(max);
  });
});

describe("computeDriftScore — boundary behaviour", () => {
  it("returns 0 / GREEN for all-zero signals", () => {
    const r = computeDriftScore(ZERO);
    expect(r.score).toBe(0);
    expect(r.level).toBe("GREEN");
  });

  it("returns 1 / RED for all-max signals", () => {
    const r = computeDriftScore(MAX);
    expect(r.score).toBe(1);
    expect(r.level).toBe("RED");
  });

  it("includes the input signals and weights in the result", () => {
    const r = computeDriftScore(MAX);
    expect(r.signals).toEqual(MAX);
    expect(r.weights).toEqual(DRIFT_WEIGHTS);
  });

  it("clamps out-of-range inputs to [0, 1]", () => {
    const above = computeDriftScore({
      convergence: 5,
      tokenPressure: 5,
      toolEntropy: 5,
      contextBloat: 5,
      promptStability: 5,
    });
    expect(above.score).toBe(1);

    const below = computeDriftScore({
      convergence: -5,
      tokenPressure: -5,
      toolEntropy: -5,
      contextBloat: -5,
      promptStability: -5,
    });
    expect(below.score).toBe(0);
  });

  it("treats NaN inputs as 0 (does not propagate NaN)", () => {
    const r = computeDriftScore({
      convergence: NaN,
      tokenPressure: NaN,
      toolEntropy: NaN,
      contextBloat: NaN,
      promptStability: NaN,
    });
    expect(r.score).toBe(0);
    expect(Number.isNaN(r.score)).toBe(false);
  });
});

describe("computeDriftScore — property: bounded in [0, 1]", () => {
  it("for 200 random signal vectors", () => {
    for (let s = 0; s < 200; s++) {
      const r = computeDriftScore(randomSignals(s));
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeDriftScore — metamorphic: monotone in each signal", () => {
  const keys: (keyof DriftSignals)[] = [
    "convergence",
    "tokenPressure",
    "toolEntropy",
    "contextBloat",
    "promptStability",
  ];

  for (const k of keys) {
    it(`raising "${k}" never decreases the score`, () => {
      const base: DriftSignals = { ...ZERO, [k]: 0.2 };
      const higher: DriftSignals = { ...ZERO, [k]: 0.8 };
      expect(computeDriftScore(higher).score).toBeGreaterThanOrEqual(
        computeDriftScore(base).score,
      );
    });
  }
});

describe("classifyDriftLevel — threshold boundaries", () => {
  it("0 is GREEN", () => expect(classifyDriftLevel(0)).toBe("GREEN"));
  it("0.0999... is GREEN", () => expect(classifyDriftLevel(0.0999)).toBe("GREEN"));
  it("0.1 is YELLOW (boundary)", () => expect(classifyDriftLevel(0.1)).toBe("YELLOW"));
  it("0.2999... is YELLOW", () => expect(classifyDriftLevel(0.2999)).toBe("YELLOW"));
  it("0.3 is RED (boundary)", () => expect(classifyDriftLevel(0.3)).toBe("RED"));
  it("1.0 is RED", () => expect(classifyDriftLevel(1)).toBe("RED"));
});
