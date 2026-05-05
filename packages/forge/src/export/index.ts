/**
 * Export pipeline — public API barrel.
 *
 * Converts runtime session data (persisted CairnBridgeEvents) into portable
 * artifacts: certified SKILL.md files with DBOM provenance in YAML frontmatter.
 */

export {
  runExportPipeline,
  type ExportPipelineConfig,
  type ExportPipelineResult,
  type ExportStageResult,
} from "./pipeline.js";

export {
  compileSkill,
  renderFrontmatter,
  escapeFrontmatter,
  type SkillCompilerInput,
  type SkillFrontmatterInput,
  type CompiledSkill,
} from "./compiler.js";

export {
  extractStage,
  stripStage,
  attachStage,
  validateStage,
  type StageContext,
  type ExportStage,
} from "./stages.js";

export type {
  ExportQualityGate,
  ExportDiagnostic,
  ExportDiagnosticSeverity,
  QualityGateResult,
} from "./types.js";
