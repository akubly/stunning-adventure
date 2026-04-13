/**
 * Skill Linter — Deterministic Rules (Tier 1)
 *
 * Structural validation rules for SKILL.md files. Each rule is a pure
 * function that inspects a ParsedSkill and returns a LintResult or null.
 *
 * Rules catch common authoring mistakes: missing frontmatter, required
 * fields, invalid values, missing sections, empty content.
 *
 * Tier 2 (LLM-as-judge quality scoring against the 5 C's) is a future
 * addition — this module is deterministic only.
 */

import type { ParsedSkill, SkillToolDeclaration } from './skillParser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintResult {
  /** Rule identifier (e.g., 'missing-frontmatter', 'empty-section') */
  rule: string;
  /** How severe the issue is */
  severity: LintSeverity;
  /** Human-readable description */
  message: string;
  /** 1-based source line, if applicable */
  line?: number;
  /** Suggested fix text */
  fix?: string;
}

export type LintRule = (skill: ParsedSkill) => LintResult[];

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

const REQUIRED_FRONTMATTER_FIELDS: Array<{
  field: string;
  severity: LintSeverity;
}> = [
  { field: 'name', severity: 'error' },
  { field: 'description', severity: 'error' },
  { field: 'domain', severity: 'warning' },
  { field: 'confidence', severity: 'warning' },
  { field: 'source', severity: 'warning' },
];

const VALID_CONFIDENCE = ['low', 'medium', 'high'];

const REQUIRED_SECTIONS = ['context', 'patterns'];

/** Rule: frontmatter block must exist. */
function missingFrontmatter(skill: ParsedSkill): LintResult[] {
  if (skill.frontmatter === null) {
    return [{
      rule: 'missing-frontmatter',
      severity: 'error',
      message: 'No YAML frontmatter block found — expected --- delimiters at start of file',
      line: 1,
      fix: 'Add YAML frontmatter between --- markers at the top of the file',
    }];
  }
  return [];
}

/** Rule: required and recommended frontmatter fields. */
function missingFields(skill: ParsedSkill): LintResult[] {
  if (!skill.frontmatter) return []; // covered by missingFrontmatter
  const results: LintResult[] = [];

  for (const { field, severity } of REQUIRED_FRONTMATTER_FIELDS) {
    const value = skill.frontmatter[field];
    if (value === undefined || value === null || value === '') {
      results.push({
        rule: `missing-field:${field}`,
        severity,
        message: `Frontmatter missing "${field}"`,
        fix: `Add "${field}: <value>" to the frontmatter block`,
      });
    }
  }

  return results;
}

/** Rule: confidence must be low, medium, or high. */
function invalidConfidence(skill: ParsedSkill): LintResult[] {
  if (!skill.frontmatter?.confidence) return [];
  const c = String(skill.frontmatter.confidence);
  if (!VALID_CONFIDENCE.includes(c)) {
    return [{
      rule: 'invalid-confidence',
      severity: 'error',
      message: `Invalid confidence "${c}" — expected one of: ${VALID_CONFIDENCE.join(', ')}`,
      fix: `Change confidence to one of: ${VALID_CONFIDENCE.join(', ')}`,
    }];
  }
  return [];
}

/** Rule: required sections must exist. */
function missingSections(skill: ParsedSkill): LintResult[] {
  const results: LintResult[] = [];
  const headings = new Set(
    skill.sections.map((s) => s.heading.toLowerCase()),
  );

  for (const required of REQUIRED_SECTIONS) {
    if (!headings.has(required)) {
      results.push({
        rule: `missing-section:${required}`,
        severity: 'error',
        message: `Missing required section "## ${required.charAt(0).toUpperCase() + required.slice(1)}"`,
        fix: `Add a "## ${required.charAt(0).toUpperCase() + required.slice(1)}" section`,
      });
    }
  }

  return results;
}

/** Rule: sections should not be empty (skips level-1 title headings). */
function emptySections(skill: ParsedSkill): LintResult[] {
  const results: LintResult[] = [];

  for (const section of skill.sections) {
    // Level-1 headings serve as the skill title — no body expected
    if (section.level === 1) continue;

    if (section.content.trim() === '') {
      results.push({
        rule: 'empty-section',
        severity: 'warning',
        message: `Section "${section.heading}" is empty`,
        line: section.lineStart,
      });
    }
  }

  return results;
}

/** Rule: file should have a top-level heading (skill name). */
function noHeading(skill: ParsedSkill): LintResult[] {
  const hasLevel1 = skill.sections.some((s) => s.level === 1);
  if (!hasLevel1 && !skill.frontmatter?.name) {
    return [{
      rule: 'no-heading',
      severity: 'warning',
      message: 'No top-level heading (# Skill Name) found — skill name cannot be determined',
      fix: 'Add a "# Skill Name" heading after the frontmatter',
    }];
  }
  return [];
}

/** Rule: tools field must be an array of objects with name. */
function toolsMalformed(skill: ParsedSkill): LintResult[] {
  if (!skill.frontmatter?.tools) return [];
  const tools = skill.frontmatter.tools;

  if (!Array.isArray(tools)) {
    return [{
      rule: 'tools-malformed',
      severity: 'error',
      message: 'Frontmatter "tools" must be an array',
    }];
  }

  const results: LintResult[] = [];
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i] as SkillToolDeclaration;
    if (!tool.name || tool.name.trim() === '') {
      results.push({
        rule: 'tool-missing-name',
        severity: 'error',
        message: `Tool at index ${i} is missing a "name" field`,
        fix: 'Add a "name" field to the tool declaration',
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

/** All Tier 1 lint rules, in execution order. */
const RULES: LintRule[] = [
  missingFrontmatter,
  missingFields,
  invalidConfidence,
  missingSections,
  emptySections,
  noHeading,
  toolsMalformed,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all Tier 1 lint rules against a parsed skill.
 *
 * Returns an array of lint results sorted by severity (errors first),
 * plus any parse errors from the parser itself.
 */
export function lintSkill(skill: ParsedSkill): LintResult[] {
  const results: LintResult[] = [];

  // Include parser-level errors as lint results
  for (const pe of skill.parseErrors) {
    results.push({
      rule: 'parse-error',
      severity: 'error',
      message: pe.message,
      line: pe.line,
    });
  }

  // Run each rule
  for (const rule of RULES) {
    results.push(...rule(skill));
  }

  // Sort: errors → warnings → info
  const severityOrder: Record<LintSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  results.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return results;
}

/**
 * Format lint results into a human-readable summary.
 */
export function formatLintSummary(results: LintResult[]): string {
  if (results.length === 0) return '✅ No issues found';

  const errors = results.filter((r) => r.severity === 'error').length;
  const warnings = results.filter((r) => r.severity === 'warning').length;
  const infos = results.filter((r) => r.severity === 'info').length;

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors > 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? 's' : ''}`);
  if (infos > 0) parts.push(`${infos} info`);

  const lines = results.map((r) => {
    const loc = r.line ? `:${r.line}` : '';
    const icon = r.severity === 'error' ? '❌' : r.severity === 'warning' ? '⚠️' : 'ℹ️';
    return `  ${icon} ${r.rule}${loc} — ${r.message}`;
  });

  return `${parts.join(', ')}:\n${lines.join('\n')}`;
}
