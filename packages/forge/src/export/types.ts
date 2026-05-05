/**
 * Export-local types for the Forge export pipeline.
 *
 * These types stay package-internal — no new shared types in @akubly/types.
 * Cross-package contracts remain DBOMArtifact + CairnBridgeEvent.
 */

export type ExportDiagnosticSeverity = "error" | "warning" | "info";

export interface ExportDiagnostic {
  stage: string;
  severity: ExportDiagnosticSeverity;
  message: string;
}

export interface QualityGateResult {
  passed: boolean;
  lintErrors: number;
  lintWarnings: number;
  validationScore: number;
  details: string;
}

/**
 * Quality gate function signature.
 * Takes compiled SKILL.md content, returns quality assessment.
 * Injected by the caller — Forge never imports @akubly/cairn.
 */
export type ExportQualityGate = (skillContent: string) => QualityGateResult;
