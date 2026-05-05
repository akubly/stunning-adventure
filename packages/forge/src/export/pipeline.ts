/**
 * Export Pipeline Orchestrator — runs the fixed stage sequence.
 *
 * Stages: Extract → Strip → Attach → QualityGate
 *
 * Each stage is a pure function that transforms a StageContext.
 * I/O (DBOM persistence, file writes) happens after all stages pass.
 */

import type { CairnBridgeEvent, DBOMArtifact } from "@akubly/types";
import type { ExportQualityGate, ExportDiagnostic } from "./types.js";
import type { CompiledSkill, SkillFrontmatterInput } from "./compiler.js";
import {
  extractStage,
  stripStage,
  attachStage,
  validateStage,
  type StageContext,
} from "./stages.js";

// ---------------------------------------------------------------------------
// Configuration & Result Types
// ---------------------------------------------------------------------------

export interface ExportPipelineConfig {
  /** Session ID for DBOM generation. */
  sessionId: string;
  /** Persisted bridge events from the session. */
  events: CairnBridgeEvent[];
  /** Raw SKILL.md body content (sections, not frontmatter). */
  skillContent: string;
  /** Frontmatter fields for the compiled skill. */
  frontmatter: SkillFrontmatterInput;
  /** Injected quality gate (lint + validate). */
  qualityGate: ExportQualityGate;
  /** Optional: persist DBOM to Cairn's DB. Default: false. */
  persistDBOM?: boolean;
  /** Injected DBOM persistence function (avoids direct Cairn import). */
  persistFn?: (artifact: DBOMArtifact) => void;
}

export interface ExportStageResult {
  stage: string;
  durationMs: number;
  passed: boolean;
}

export interface ExportPipelineResult {
  /** Whether the pipeline completed successfully. */
  success: boolean;
  /** The compiled skill, if pipeline succeeded. */
  skill?: CompiledSkill;
  /** Per-stage timing and pass/fail. */
  stages: ExportStageResult[];
  /** All diagnostics accumulated during the pipeline. */
  diagnostics: ExportDiagnostic[];
  /** Quality gate summary, if validate stage ran. */
  qualityGatePassed?: boolean;
  /** Lint error count (from quality gate). */
  lintErrors?: number;
  /** Validation score (0.0–1.0, from quality gate). */
  validationScore?: number;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full export pipeline.
 *
 * Quality gate failures are soft by default — the compiled skill is
 * still returned with diagnostics, but `success` is false and
 * `qualityGatePassed` is false.
 */
export function runExportPipeline(config: ExportPipelineConfig): ExportPipelineResult {
  const stages: ExportStageResult[] = [];
  let context: StageContext = {
    events: config.events,
    sessionId: config.sessionId,
    strippedContent: config.skillContent,
    diagnostics: [],
  };

  // Stage 1: Extract
  const t0 = Date.now();
  context = extractStage(context);
  stages.push({
    stage: "extract",
    durationMs: Date.now() - t0,
    passed: !!context.dbom,
  });

  if (!context.dbom) {
    return {
      success: false,
      stages,
      diagnostics: context.diagnostics,
    };
  }

  // Stage 2: Strip
  const t1 = Date.now();
  context = stripStage(context);
  stages.push({
    stage: "strip",
    durationMs: Date.now() - t1,
    passed: true,
  });

  // Stage 3: Attach
  const t2 = Date.now();
  context = attachStage(context, config.frontmatter);
  stages.push({
    stage: "attach",
    durationMs: Date.now() - t2,
    passed: !!context.compiledSkill,
  });

  if (!context.compiledSkill) {
    return {
      success: false,
      stages,
      diagnostics: context.diagnostics,
    };
  }

  // Stage 4: Validate
  const t3 = Date.now();
  context = validateStage(context, config.qualityGate);
  const gatePassed = context.qualityGate?.passed ?? false;
  stages.push({
    stage: "validate",
    durationMs: Date.now() - t3,
    passed: gatePassed,
  });

  // Persist DBOM if requested, quality gate passed, and persistFn provided
  let finalDiagnostics = context.diagnostics;
  if (config.persistDBOM && !config.persistFn) {
    finalDiagnostics = [
      ...finalDiagnostics,
      {
        stage: "persist",
        severity: "warning" as const,
        message: "persistDBOM is true but no persistFn was provided — DBOM not persisted",
      },
    ];
  }
  if (gatePassed && config.persistDBOM && config.persistFn && context.dbom) {
    try {
      config.persistFn(context.dbom);
    } catch (err) {
      finalDiagnostics = [
        ...finalDiagnostics,
        {
          stage: "persist",
          severity: "warning" as const,
          message: `DBOM persistence failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ];
    }
  }

  return {
    success: gatePassed,
    skill: context.compiledSkill,
    stages,
    diagnostics: finalDiagnostics,
    qualityGatePassed: gatePassed,
    lintErrors: context.qualityGate?.lintErrors,
    validationScore: context.qualityGate?.validationScore,
  };
}
