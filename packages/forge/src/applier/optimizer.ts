/**
 * Optimization applier — turns hints into SKILL.md v2 frontmatter patches.
 *
 * Hints are sorted by impact score (highest first), filtered by confidence
 * threshold, and capped per cycle. Cache-optimization hints feed the
 * `cacheableTools` block; everything else becomes a structured optimization
 * hint embedded in the skill's frontmatter.
 *
 * Loop trigger: manual in Forge, Curator-driven in Cairn (Aaron's decision).
 */

import type { OptimizationHint } from "../prescribers/types.js";

export interface ApplierConfig {
  /** Minimum confidence to apply a hint automatically. Default: 0.7. */
  autoApplyThreshold?: number;
  /** Maximum hints to apply per cycle. Default: 5. */
  maxHintsPerCycle?: number;
  /** Override "now" for deterministic patch timestamps (testing). */
  now?: () => Date;
}

export interface AppliedOptimization {
  hintId: string;
  category: string;
  applied: boolean;
  change: string;
  impactScore: number;
}

export interface SkillFrontmatterPatch {
  /** Cacheable tool declarations for prefix stability. */
  cacheableTools?: string[];
  /** Optimization hints embedded in frontmatter. */
  optimizationHints?: Array<{
    category: string;
    recommendation: string;
    appliedAt: string;
  }>;
  /** Self-tuning parameter overrides. */
  tuningParameters?: Record<string, number>;
}

export interface OptimizationApplierResult {
  applied: AppliedOptimization[];
  skipped: Array<{ hintId: string; reason: string }>;
  frontmatterPatch: SkillFrontmatterPatch;
}

export function applyOptimizations(
  hints: OptimizationHint[],
  config?: ApplierConfig,
): OptimizationApplierResult {
  const threshold = config?.autoApplyThreshold ?? 0.7;
  const maxHints = config?.maxHintsPerCycle ?? 5;
  const now = config?.now ?? (() => new Date());

  // Stable sort by impact desc; tie-break by id to keep determinism.
  const sorted = [...hints].sort((a, b) => {
    if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
    return a.id.localeCompare(b.id);
  });

  const applied: AppliedOptimization[] = [];
  const skipped: Array<{ hintId: string; reason: string }> = [];
  const frontmatterPatch: SkillFrontmatterPatch = {};

  for (const hint of sorted) {
    if (applied.length >= maxHints) {
      skipped.push({ hintId: hint.id, reason: "max hints per cycle reached" });
      continue;
    }

    if (hint.confidence < threshold) {
      skipped.push({
        hintId: hint.id,
        reason: `confidence ${hint.confidence.toFixed(2)} below threshold ${threshold}`,
      });
      continue;
    }

    const appliedAt = now().toISOString();

    switch (hint.category) {
      case "cache-optimization": {
        frontmatterPatch.cacheableTools ??= [];
        for (const tool of extractCacheableTools(hint)) {
          if (!frontmatterPatch.cacheableTools.includes(tool)) {
            frontmatterPatch.cacheableTools.push(tool);
          }
        }
        applied.push({
          hintId: hint.id,
          category: hint.category,
          applied: true,
          change: hint.recommendation,
          impactScore: hint.impactScore,
        });
        break;
      }

      default: {
        frontmatterPatch.optimizationHints ??= [];
        frontmatterPatch.optimizationHints.push({
          category: hint.category,
          recommendation: hint.recommendation,
          appliedAt,
        });
        applied.push({
          hintId: hint.id,
          category: hint.category,
          applied: true,
          change: hint.recommendation,
          impactScore: hint.impactScore,
        });
        break;
      }
    }
  }

  return { applied, skipped, frontmatterPatch };
}

/**
 * Extract cacheable tool names from hint evidence, when supplied.
 *
 * Looks at `evidence.triggerMetrics` keys prefixed with `tool:` and at an
 * optional `cacheableTools` array on the evidence object. Returns an empty
 * list when no tool guidance is present.
 */
function extractCacheableTools(hint: OptimizationHint): string[] {
  const tools: string[] = [];
  const evidence = hint.evidence as unknown as {
    cacheableTools?: unknown;
    triggerMetrics?: Record<string, unknown>;
  };
  if (Array.isArray(evidence.cacheableTools)) {
    for (const t of evidence.cacheableTools) {
      if (typeof t === "string" && t.length > 0) tools.push(t);
    }
  }
  if (evidence.triggerMetrics) {
    for (const key of Object.keys(evidence.triggerMetrics)) {
      if (key.startsWith("tool:")) tools.push(key.slice(5));
    }
  }
  return tools;
}
