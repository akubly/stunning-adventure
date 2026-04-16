import { describe, it, expect } from 'vitest';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadTestScenario,
  runTestScenario,
  formatTestReport,
} from '../agents/skillTestHarness.js';
import type { TestScenario, TestReport } from '../agents/skillTestHarness.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = join(__dirname, 'fixtures', 'skills');

function fixturePath(dir: string, file = 'skill-tests.yaml'): string {
  return resolve(fixturesDir, dir, file);
}

// ---------------------------------------------------------------------------
// loadTestScenario
// ---------------------------------------------------------------------------

describe('skillTestHarness', () => {
  describe('loadTestScenario', () => {
    it('loads a valid YAML scenario', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      expect(scenario.name).toBe("Good skill — passes all 5 C's quality vectors");
      expect(scenario.assertions.length).toBeGreaterThan(0);
      expect(scenario.skillPath).toContain('good-skill');
      expect(scenario.skillPath).toContain('SKILL.md');
    });

    it('resolves skill_path relative to YAML file', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const expectedPath = resolve(fixturesDir, 'good-skill', 'SKILL.md');
      expect(scenario.skillPath).toBe(expectedPath);
    });

    it('throws on missing YAML file', () => {
      expect(() => loadTestScenario('nonexistent.yaml')).toThrow();
    });

    it('handles scenario with tier2 section', () => {
      // All fixture YAMLs have tier2: scenarios: [] — tier2 is undefined (empty array)
      const scenario = loadTestScenario(fixturePath('good-skill'));
      expect(scenario.tier2).toBeUndefined();
    });

    it('parses assertion fields correctly', () => {
      const scenario = loadTestScenario(fixturePath('bad-clarity'));
      const hedgeAssertion = scenario.assertions.find(
        (a) => a.rule === 'no-hedge-words' && a.section === 'Patterns',
      );
      expect(hedgeAssertion).toBeDefined();
      expect(hedgeAssertion!.vector).toBe('clarity');
      expect(hedgeAssertion!.threshold).toBe(0.3);
    });

    it('parses params from assertions', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const sentLenAssertion = scenario.assertions.find(
        (a) => a.rule === 'sentence-length',
      );
      expect(sentLenAssertion).toBeDefined();
      expect(sentLenAssertion!.params).toEqual({ max_words: 40 });
    });
  });

  // ---------------------------------------------------------------------------
  // runTestScenario
  // ---------------------------------------------------------------------------

  describe('runTestScenario', () => {
    it('produces a structured report for good-skill', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);

      expect(report.scenario).toBe(scenario.name);
      expect(report.skillName).toBe('TypeScript Error Handling');
      expect(report.results.length).toBeGreaterThan(0);
      expect(report.skillPath).toBe(scenario.skillPath);
    });

    it('good skill has high clarity and concreteness scores', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);

      // The good-skill fixture has strong clarity (no hedge words, short sentences)
      // and strong concreteness (code blocks, file paths, identifiers)
      expect(report.scores.clarity).toBeGreaterThan(0.5);
      expect(report.scores.concreteness).toBeGreaterThan(0.5);
    });

    it('bad-clarity skill has lower clarity than good skill', () => {
      const badScenario = loadTestScenario(fixturePath('bad-clarity'));
      const badReport = runTestScenario(badScenario);

      const goodScenario = loadTestScenario(fixturePath('good-skill'));
      const goodReport = runTestScenario(goodScenario);

      expect(badReport.scores.clarity).toBeLessThan(goodReport.scores.clarity);
    });

    it('bad-completeness skill has low completeness scores', () => {
      const scenario = loadTestScenario(fixturePath('bad-completeness'));
      const report = runTestScenario(scenario);

      expect(report.scores.completeness).toBeLessThan(0.8);
    });

    it('bad-consistency skill has low consistency scores', () => {
      const scenario = loadTestScenario(fixturePath('bad-consistency'));
      const report = runTestScenario(scenario);

      // Mismatched name/heading, orphaned tools, domain drift
      expect(report.scores.consistency).toBeLessThan(0.7);
    });

    it('minimal-valid skill handles minimal content gracefully', () => {
      const scenario = loadTestScenario(fixturePath('minimal-valid'));
      const report = runTestScenario(scenario);

      expect(report.scenario).toBe(scenario.name);
      expect(report.results.length).toBeGreaterThan(0);
      expect(report.skillName).toBe('Minimal Skill');
    });

    it('computes per-vector scores correctly', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);

      const vectors = ['clarity', 'completeness', 'concreteness', 'consistency', 'containment'];
      for (const v of vectors) {
        expect(report.scores).toHaveProperty(v);
        expect(report.scores[v as keyof typeof report.scores]).toBeGreaterThanOrEqual(0);
        expect(report.scores[v as keyof typeof report.scores]).toBeLessThanOrEqual(1);
      }
    });

    it('respects threshold overrides from scenario', () => {
      // bad-clarity sets threshold: 0.3 for most clarity rules.
      // Compare: with the low threshold, more assertions pass than with default 0.5.
      const scenario = loadTestScenario(fixturePath('bad-clarity'));

      // Run with the scenario's thresholds (0.3 for clarity rules)
      const lenientReport = runTestScenario(scenario);

      // Run the same scenario but with all thresholds reset to 0.9 (strict)
      const strictScenario: TestScenario = {
        ...scenario,
        assertions: scenario.assertions.map((a) => ({
          ...a,
          threshold: 0.9,
        })),
      };
      const strictReport = runTestScenario(strictScenario);

      // Strict thresholds should cause more failures
      expect(strictReport.passed).toBe(false);
    });

    it('overall score is average of per-vector scores', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);

      const vectors = ['clarity', 'completeness', 'concreteness', 'consistency', 'containment'] as const;
      const expectedOverall = vectors.reduce((sum, v) => sum + report.scores[v], 0) / vectors.length;

      expect(report.overallScore).toBeCloseTo(expectedOverall, 10);
    });

    it('report has valid runAt timestamp', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);

      expect(() => new Date(report.runAt)).not.toThrow();
      expect(new Date(report.runAt).getTime()).not.toBeNaN();
    });
  });

  // ---------------------------------------------------------------------------
  // formatTestReport
  // ---------------------------------------------------------------------------

  describe('formatTestReport', () => {
    it('formats a report with correct structure', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);
      const output = formatTestReport(report);

      expect(output).toContain(report.scenario);
      expect(output).toContain('Overall Score:');
      expect(output).toContain('Vector Scores:');
      expect(output).toContain('clarity');
    });

    it('shows pass emoji for passing report', () => {
      // Construct a minimal passing report directly
      const passingReport: TestReport = {
        scenario: 'Test Pass',
        skillPath: '/test/path',
        skillName: 'Test Skill',
        passed: true,
        results: [],
        scores: {
          clarity: 0.9,
          completeness: 0.8,
          concreteness: 0.85,
          consistency: 0.95,
          containment: 1.0,
        },
        overallScore: 0.9,
        runAt: new Date().toISOString(),
      };
      const output = formatTestReport(passingReport);
      expect(output).toContain('✅ PASSED');
    });

    it('formats a failing report with details', () => {
      const scenario = loadTestScenario(fixturePath('bad-consistency'));
      const strictScenario: TestScenario = {
        ...scenario,
        assertions: scenario.assertions.map((a) => ({
          ...a,
          threshold: undefined,
        })),
      };
      const report = runTestScenario(strictScenario);

      // bad-consistency with default thresholds should fail
      expect(report.passed).toBe(false);
      const output = formatTestReport(report);
      expect(output).toContain('❌ FAILED');
      expect(output).toContain('Failed Rules:');
    });

    it('includes all vector scores in output', () => {
      const scenario = loadTestScenario(fixturePath('good-skill'));
      const report = runTestScenario(scenario);
      const output = formatTestReport(report);

      expect(output).toContain('completeness');
      expect(output).toContain('concreteness');
      expect(output).toContain('consistency');
      expect(output).toContain('containment');
    });
  });
});
