/**
 * Skill Test Harness — Tier 1 Orchestrator
 *
 * Loads YAML test scenarios, runs validator rules against skill files,
 * and produces structured test reports. This module is the I/O boundary —
 * validators and parsers are pure functions.
 *
 * Sync for Tier 1 (deterministic rules). Will become async when Tier 2
 * (LLM-as-judge) is added.
 */

import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parseSkill } from './skillParser.js';
import { validateSkill, DEFAULT_THRESHOLD } from './skillValidator.js';
import type { QualityVector, ValidationResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestAssertion {
  vector: QualityVector;
  rule: string;
  section?: string;
  threshold?: number;
  params?: Record<string, unknown>;
}

export interface Tier2Scenario {
  name: string;
  prompt: string;
  expect?: Record<string, unknown>;
  score_vectors?: QualityVector[];
}

export interface TestScenario {
  name: string;
  skillPath: string;
  assertions: TestAssertion[];
  tier2?: Tier2Scenario[];
}

export interface TestReport {
  scenario: string;
  skillPath: string;
  skillName: string | null;
  passed: boolean;
  results: ValidationResult[];
  scores: Record<QualityVector, number>;
  overallScore: number;
  runAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_VECTORS: QualityVector[] = [
  'clarity', 'completeness', 'concreteness', 'consistency', 'containment',
];

// DEFAULT_THRESHOLD imported from skillValidator

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a test scenario from a YAML file.
 *
 * The YAML schema is:
 * ```yaml
 * name: "scenario name"
 * skill_path: "./SKILL.md"  # relative to YAML file location
 * tier1:
 *   assertions:
 *     - vector: clarity
 *       rule: no-hedge-words
 *       section: Patterns  # optional
 *       threshold: 0.5     # optional
 * tier2:                    # optional
 *   scenarios: [...]
 * ```
 */
export function loadTestScenario(yamlPath: string): TestScenario {
  const absolutePath = resolve(yamlPath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const doc = parseYaml(raw) as Record<string, unknown>;

  const name = (doc.name as string) ?? 'Unnamed scenario';
  const skillPathRel = doc.skill_path as string;

  if (!skillPathRel) {
    throw new Error(`YAML scenario missing required field "skill_path" in ${absolutePath}`);
  }

  const skillPath = resolve(dirname(absolutePath), skillPathRel);

  // Extract tier1 assertions
  const tier1 = doc.tier1 as Record<string, unknown> | undefined;
  const rawAssertions = (tier1?.assertions as Array<Record<string, unknown>>) ?? [];

  const assertions: TestAssertion[] = rawAssertions.map((a) => ({
    vector: a.vector as QualityVector,
    rule: a.rule as string,
    section: a.section as string | undefined,
    threshold: a.threshold as number | undefined,
    params: a.params as Record<string, unknown> | undefined,
  }));

  // Extract tier2 scenarios (loaded but not executed)
  const tier2Raw = doc.tier2 as Record<string, unknown> | undefined;
  const tier2Scenarios = (tier2Raw?.scenarios as Tier2Scenario[]) ?? [];
  const tier2 = tier2Scenarios.length > 0 ? tier2Scenarios : undefined;

  if (assertions.length === 0) {
    throw new Error(
      `No assertions found in scenario "${name}" (${absolutePath}). ` +
      'Check that tier1.assertions is defined and correctly spelled.',
    );
  }

  return { name, skillPath, assertions, tier2 };
}

/**
 * Run a test scenario against its skill file.
 *
 * 1. Read the skill file
 * 2. Parse it with parseSkill()
 * 3. Run validateSkill() to get all validation results
 * 4. Match results to assertions, applying threshold overrides
 * 5. Compute per-vector scores and overall score
 * 6. Return TestReport
 */
export function runTestScenario(scenario: TestScenario): TestReport {
  const skillContent = readFileSync(scenario.skillPath, 'utf-8');
  const parsed = parseSkill(skillContent);
  const results = validateSkill(parsed);

  // Build a lookup from rule id → ValidationResult
  const resultByRule = new Map<string, ValidationResult>();
  for (const r of results) {
    resultByRule.set(r.rule, r);
  }

  // Check each assertion against the matching validation result.
  // NOTE: assertion.section and assertion.params are parsed but intentionally
  // unused in Tier 1. They are reserved for future Tier 2 scenario evaluation
  // where assertions can target specific sections or pass rule-specific params.
  // Currently all Tier 1 rules run against the full skill content.
  let allPassed = true;
  const reportResults: ValidationResult[] = [];
  for (const assertion of scenario.assertions) {
    const result = resultByRule.get(assertion.rule);
    if (!result) {
      // Rule not found in results — push synthetic failure so it appears in report
      allPassed = false;
      reportResults.push({
        rule: assertion.rule,
        vector: assertion.vector,
        score: 0,
        tier: 1,
        passed: false,
        message: `Assertion references rule "${assertion.rule}" but no validation result was produced`,
        evidence: [],
      });
      continue;
    }

    // Validate that assertion vector matches result vector
    if (result.vector !== assertion.vector) {
      allPassed = false;
      reportResults.push({
        ...result,
        passed: false,
        message: `Vector mismatch: assertion expects "${assertion.vector}" but rule produced "${result.vector}"`,
      });
      continue;
    }

    const threshold = assertion.threshold ?? DEFAULT_THRESHOLD;
    const passed = result.score >= threshold;
    if (!passed) {
      allPassed = false;
    }
    // Clone result with recomputed passed based on scenario threshold
    reportResults.push({ ...result, passed });
  }

  // Compute per-vector scores: average of unique results per vector
  const scores = {} as Record<QualityVector, number>;
  for (const vector of ALL_VECTORS) {
    const vectorResults = results.filter((r) => r.vector === vector);
    if (vectorResults.length > 0) {
      const sum = vectorResults.reduce((acc, r) => acc + r.score, 0);
      scores[vector] = sum / vectorResults.length;
    } else {
      scores[vector] = 1.0; // No rules for this vector — perfect by default
    }
  }

  // Overall score = average of per-vector scores
  const vectorScores = ALL_VECTORS.map((v) => scores[v]);
  const overallScore = vectorScores.reduce((a, b) => a + b, 0) / vectorScores.length;

  return {
    scenario: scenario.name,
    skillPath: scenario.skillPath,
    skillName: parsed.name,
    passed: allPassed,
    results: reportResults,
    scores,
    overallScore,
    runAt: new Date().toISOString(),
  };
}

/**
 * Format a test report as a human-readable summary.
 */
export function formatTestReport(report: TestReport): string {
  const status = report.passed ? '✅ PASSED' : '❌ FAILED';
  const lines: string[] = [];

  lines.push(`${status}: ${report.scenario}`);
  lines.push(`  Skill: ${report.skillPath}`);
  if (report.skillName) {
    lines.push(`  Name:  ${report.skillName}`);
  }
  lines.push(`  Overall Score: ${(report.overallScore * 100).toFixed(1)}%`);
  lines.push('');

  // Per-vector scores
  lines.push('  Vector Scores:');
  for (const vector of ALL_VECTORS) {
    const pct = (report.scores[vector] * 100).toFixed(1);
    const emoji = report.scores[vector] >= 0.5 ? '✅' : '❌';
    lines.push(`    ${emoji} ${vector}: ${pct}%`);
  }

  // Show failed results
  const failures = report.results.filter((r) => !r.passed);
  if (failures.length > 0) {
    lines.push('');
    lines.push('  Failed Rules:');
    for (const f of failures) {
      lines.push(`    ❌ [${f.vector}] ${f.rule}: ${f.message} (score: ${f.score.toFixed(2)})`);
    }
  }

  return lines.join('\n');
}
