/**
 * Export pipeline stages — pure functions that transform StageContext.
 *
 * Each stage: (context) → context
 * No setup, no teardown, no I/O. Side effects are pushed to the pipeline orchestrator.
 */

import type { CairnBridgeEvent, DBOMArtifact } from "@akubly/types";
import { generateDBOM } from "../dbom/index.js";
import { compileSkill, type CompiledSkill, type SkillFrontmatterInput } from "./compiler.js";
import type { ExportDiagnostic, ExportQualityGate, QualityGateResult } from "./types.js";

// ---------------------------------------------------------------------------
// Stage Context
// ---------------------------------------------------------------------------

export interface StageContext {
  /** Source events (input to the pipeline). */
  events: CairnBridgeEvent[];
  /** Session identifier. */
  sessionId: string;
  /** Generated DBOM (populated by Extract stage). */
  dbom?: DBOMArtifact;
  /** Skill content after environment stripping (populated by Strip stage). */
  strippedContent?: string;
  /** Compiled skill with frontmatter (populated by Attach stage). */
  compiledSkill?: CompiledSkill;
  /** Quality gate results (populated by QualityGate stage). */
  qualityGate?: QualityGateResult;
  /** Diagnostics accumulated across all stages. */
  diagnostics: ExportDiagnostic[];
}

export type ExportStage = (context: StageContext) => StageContext;

// ---------------------------------------------------------------------------
// Extract Stage
// ---------------------------------------------------------------------------

/**
 * Extract stage: Generate DBOM from certification-tier events.
 * Pure — delegates to the existing generateDBOM().
 */
export function extractStage(context: StageContext): StageContext {
  if (context.events.length === 0) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: "extract", severity: "error", message: "No events provided" },
      ],
    };
  }

  const dbom = generateDBOM(context.sessionId, context.events);

  if (dbom.decisions.length === 0) {
    return {
      ...context,
      dbom,
      diagnostics: [
        ...context.diagnostics,
        {
          stage: "extract",
          severity: "warning",
          message: "No certification-tier events found — DBOM has zero decisions",
        },
      ],
    };
  }

  return { ...context, dbom };
}

// ---------------------------------------------------------------------------
// Strip Stage
// ---------------------------------------------------------------------------

/**
 * Strip stage: Remove environment-specific bindings from skill content.
 *
 * Strips:
 *   - Absolute file paths → relative placeholders
 *   - Machine-specific usernames/hostnames
 *
 * Conservative: only strips patterns we can identify deterministically.
 */
export function stripStage(context: StageContext): StageContext {
  if (!context.strippedContent) {
    return context;
  }

  // Strip absolute Windows paths
  let stripped = context.strippedContent.replace(
    /[A-Z]:\\(?:[\w.-]+\\)+[\w.-]+/g,
    "<path>",
  );
  // Strip absolute Unix paths
  stripped = stripped.replace(
    /\/(?:home|Users|tmp)\/[\w.-]+(?:\/[\w.-]+)*/g,
    "<path>",
  );

  return { ...context, strippedContent: stripped };
}

// ---------------------------------------------------------------------------
// Attach Stage
// ---------------------------------------------------------------------------

/**
 * Attach stage: Compile SKILL.md with DBOM frontmatter.
 * Requires dbom and strippedContent from prior stages.
 */
export function attachStage(
  context: StageContext,
  frontmatter: SkillFrontmatterInput,
): StageContext {
  if (!context.dbom) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: "attach", severity: "error", message: "No DBOM available — Extract stage may have failed" },
      ],
    };
  }

  const compiled = compileSkill({
    skillContent: context.strippedContent ?? "",
    dbom: context.dbom,
    frontmatter,
  });

  return { ...context, compiledSkill: compiled };
}

// ---------------------------------------------------------------------------
// Validate Stage
// ---------------------------------------------------------------------------

/**
 * Validate stage: Run quality gates on the compiled skill.
 * Accepts injected lint/validate functions to avoid importing @akubly/cairn.
 */
export function validateStage(
  context: StageContext,
  qualityGate: ExportQualityGate,
): StageContext {
  if (!context.compiledSkill) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: "validate", severity: "error", message: "No compiled skill — Attach stage may have failed" },
      ],
    };
  }

  try {
    const result = qualityGate(context.compiledSkill.content);
    return { ...context, qualityGate: result };
  } catch (err) {
    return {
      ...context,
      qualityGate: {
        passed: false,
        lintErrors: 0,
        lintWarnings: 0,
        validationScore: 0,
        details: `Quality gate threw: ${err instanceof Error ? err.message : String(err)}`,
      },
      diagnostics: [
        ...context.diagnostics,
        {
          stage: "validate",
          severity: "error",
          message: `Quality gate exception: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }
}
