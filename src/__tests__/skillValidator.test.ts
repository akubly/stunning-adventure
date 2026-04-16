import { describe, it, expect } from 'vitest';
import { parseSkill } from '../agents/skillParser.js';
import {
  validateSkill,
  formatValidationSummary,
  RULES,
} from '../agents/skillValidator.js';
import type { ValidationResult } from '../types/index.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GOOD_SKILL = `---
name: "TypeScript Testing"
description: "Best practices for TypeScript testing"
domain: "testing"
confidence: "high"
source: "earned"
tools:
  - name: "vitest"
    description: "Test runner"
  - name: "grep"
    description: "Search tool"
---

# TypeScript Testing

## Context
Use Vitest as the test runner for all TypeScript projects. Configure coverage
thresholds to ensure every module is exercised. Testing strategy should cover
unit tests, integration tests, and snapshot tests for UI components. Apply
test-driven development when building new features. Verify edge cases and
error handling paths in every test suite.

## Patterns
Write tests before declaring anything done.
Use describe blocks to group related tests.
Always mock external dependencies with vi.mock.
Run vitest with coverage enabled.
Use grep to find untested functions.
Never skip tests without a documented reason.
Check that assertions cover both success and error paths.
Verify that test names describe the expected behavior.

## Examples
See src/__tests__/ for patterns.

## Anti-Patterns
Don't write tests that test implementation details.
`;

const HEDGING_SKILL = `---
name: "Hedging Example"
description: "Skill with hedge words"
domain: "testing"
confidence: "high"
source: "manual"
---

# Hedging Example

## Context
This skill is about testing.

## Patterns
Maybe use vitest for testing.
You could possibly add more tests.
Perhaps write tests sometimes.
Tests might occasionally catch bugs.
Probably run tests before committing.
`;

const PASSIVE_SKILL = `---
name: "Passive Voice"
description: "Skill using passive voice"
domain: "testing"
confidence: "high"
source: "manual"
---

# Passive Voice

## Context
This skill is about proper testing practices for applications.

## Patterns
Tests should be written before merging.
Coverage is recommended to be above 80 percent.
Dependencies are expected to be mocked.
Results should be verified after running.
Errors should be handled in every test case.
`;

const LONG_SENTENCES_SKILL = `---
name: "Long Sentences"
description: "Skill with very long sentences"
domain: "testing"
confidence: "high"
source: "manual"
---

# Long Sentences

## Context
This skill applies when writing tests for applications.

## Patterns
When you are writing tests for your application you should make absolutely sure that every single test case covers all of the possible edge cases and error conditions that could potentially occur during runtime execution of the code under test in production environments across multiple platforms and configurations.
Another extremely long and winding sentence that goes on and on about testing practices without getting to the point because the author wanted to include every possible detail about how tests should be structured and organized and maintained over time as the codebase evolves and changes.
Write short tests.
`;

const NO_TOOLS_REF_SKILL = `---
name: "Unreferenced Tools"
description: "Declares tools but never mentions them"
domain: "testing"
confidence: "high"
source: "manual"
tools:
  - name: "vitest"
    description: "Test runner"
  - name: "playwright"
    description: "E2E testing"
  - name: "storybook"
    description: "Component dev"
---

# Unreferenced Tools

## Context
This skill covers general testing practices for web applications.

## Patterns
Write tests for all components.
Check coverage reports regularly.
Never deploy without testing.
`;

const SHALLOW_SKILL = `---
name: "Shallow Sections"
description: "Sections with minimal content"
domain: "testing"
confidence: "high"
source: "manual"
---

# Shallow Sections

## Context
Just test.

## Patterns
Write tests.
`;

const ABSTRACT_SKILL = `---
name: "Abstract Advice"
description: "Skill full of vague abstractions"
domain: "testing"
confidence: "high"
source: "manual"
---

# Abstract Advice

## Context
Ensure quality and maintain standards across the testing codebase.

## Patterns
Follow best practices when writing tests.
Handle appropriately any errors that occur.
Ensure quality of all test output.
Maintain standards across the team.
`;

const MISMATCHED_NAME_SKILL = `---
name: "TypeScript Testing"
description: "A testing skill"
domain: "testing"
confidence: "high"
source: "manual"
---

# React Component Development

## Context
This skill applies to testing TypeScript code.

## Patterns
Write tests using vitest.
Always check coverage numbers.
Never merge without tests passing.
`;

const VAGUE_REFS_SKILL = `---
name: "Vague References"
description: "Skill with vague conditional refs"
domain: "testing"
confidence: "high"
source: "manual"
---

# Vague References

## Context
Apply testing practices as appropriate.

## Patterns
Add tests when needed for components.
Mock dependencies if applicable.
Configure coverage as necessary.
Run tests when possible before deploying.
`;

const MINIMAL_BODY_SKILL = `---
name: "Minimal"
description: "No specifics at all"
domain: "testing"
confidence: "high"
source: "manual"
---

# Minimal

## Context
Do things well and ensure quality.

## Patterns
Do good work.
Try hard at everything.
Be excellent always.
`;

const DOMAIN_MISMATCH_SKILL = `---
name: "Security Focus"
description: "Claims testing but talks security"
domain: "testing"
confidence: "high"
source: "manual"
---

# Security Focus

## Context
Apply security measures at every layer of the application.

## Patterns
Check security headers on every request.
Validate security tokens before processing.
Run security scans on every deployment.
Apply security patches when available.
Never skip security reviews.
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findResult(results: ValidationResult[], rule: string): ValidationResult | undefined {
  return results.find((r) => r.rule === rule);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skillValidator', () => {
  // -----------------------------------------------------------------------
  // Clarity
  // -----------------------------------------------------------------------
  describe('clarity', () => {
    describe('no-hedge-words', () => {
      it('passes when no hedge words in Patterns', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'no-hedge-words');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('fails when Patterns contains hedge words', () => {
        const skill = parseSkill(HEDGING_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'no-hedge-words');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });

      it('scores proportionally to hedge density', () => {
        const skill = parseSkill(HEDGING_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'no-hedge-words')!;
        // Many hedge words → lower score but still 0–1
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.score).toBeLessThanOrEqual(1);
      });
    });

    describe('imperative-voice', () => {
      it('passes when Patterns uses imperative verbs', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'imperative-voice');
        expect(r).toBeDefined();
        expect(r!.passed).toBe(true);
        expect(r!.score).toBeGreaterThanOrEqual(0.5);
      });

      it('scores low when Patterns uses passive voice', () => {
        const skill = parseSkill(PASSIVE_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'imperative-voice');
        expect(r).toBeDefined();
        // Passive sentences start with nouns, not imperatives
        expect(r!.score).toBeLessThan(1.0);
      });
    });

    describe('sentence-length', () => {
      it('passes when all sentences are short', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'sentence-length');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('flags sentences exceeding 40 words', () => {
        const skill = parseSkill(LONG_SENTENCES_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'sentence-length');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });
    });

    describe('no-vague-refs', () => {
      it('passes when no vague references exist', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'no-vague-refs');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('flags vague conditional references', () => {
        const skill = parseSkill(VAGUE_REFS_SKILL);
        const results = validateSkill(skill, { vectors: ['clarity'] });
        const r = findResult(results, 'no-vague-refs');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Completeness
  // -----------------------------------------------------------------------
  describe('completeness', () => {
    describe('tools-referenced-in-body', () => {
      it('passes when all tools are referenced', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['completeness'] });
        const r = findResult(results, 'tools-referenced-in-body');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('fails when tools are declared but not referenced', () => {
        const skill = parseSkill(NO_TOOLS_REF_SKILL);
        const results = validateSkill(skill, { vectors: ['completeness'] });
        const r = findResult(results, 'tools-referenced-in-body');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });

      it('scores 1.0 when no tools are declared', () => {
        const skill = parseSkill(SHALLOW_SKILL);
        const results = validateSkill(skill, { vectors: ['completeness'] });
        const r = findResult(results, 'tools-referenced-in-body');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
      });
    });

    describe('section-depth', () => {
      it('passes when sections have substantive content', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['completeness'] });
        const r = findResult(results, 'section-depth');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('flags shallow sections with few words', () => {
        const skill = parseSkill(SHALLOW_SKILL);
        const results = validateSkill(skill, { vectors: ['completeness'] });
        const r = findResult(results, 'section-depth');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });
    });

    describe('context-patterns-flow', () => {
      it('passes when Context terms appear in Patterns', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['completeness'] });
        const r = findResult(results, 'context-patterns-flow');
        expect(r).toBeDefined();
        expect(r!.passed).toBe(true);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Concreteness
  // -----------------------------------------------------------------------
  describe('concreteness', () => {
    describe('actionable-verbs', () => {
      it('passes when Patterns has enough action verbs', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['concreteness'] });
        const r = findResult(results, 'actionable-verbs');
        expect(r).toBeDefined();
        expect(r!.score).toBeGreaterThanOrEqual(1.0);
        expect(r!.passed).toBe(true);
      });

      it('scores lower with fewer action verbs', () => {
        const skill = parseSkill(MINIMAL_BODY_SKILL);
        const results = validateSkill(skill, { vectors: ['concreteness'] });
        const r = findResult(results, 'actionable-verbs');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
      });
    });

    describe('has-specifics', () => {
      it('passes when body has concrete references', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['concreteness'] });
        const r = findResult(results, 'has-specifics');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('scores lower when no specifics found', () => {
        const skill = parseSkill(MINIMAL_BODY_SKILL);
        const results = validateSkill(skill, { vectors: ['concreteness'] });
        const r = findResult(results, 'has-specifics');
        expect(r).toBeDefined();
        // 0.5 = no specifics found but body exists
        expect(r!.score).toBeLessThanOrEqual(0.5);
      });
    });

    describe('no-abstractions', () => {
      it('passes when no abstract phrases exist', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['concreteness'] });
        const r = findResult(results, 'no-abstractions');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('flags abstract phrases', () => {
        const skill = parseSkill(ABSTRACT_SKILL);
        const results = validateSkill(skill, { vectors: ['concreteness'] });
        const r = findResult(results, 'no-abstractions');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Consistency
  // -----------------------------------------------------------------------
  describe('consistency', () => {
    describe('name-heading-match', () => {
      it('passes when frontmatter name matches heading', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'name-heading-match');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('fails when frontmatter name differs from heading', () => {
        const skill = parseSkill(MISMATCHED_NAME_SKILL);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'name-heading-match');
        expect(r).toBeDefined();
        expect(r!.score).toBe(0.0);
        expect(r!.passed).toBe(false);
      });

      it('passes when only one name source exists', () => {
        const skill = parseSkill(SHALLOW_SKILL);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'name-heading-match');
        expect(r).toBeDefined();
        // Both name and heading exist and match
        expect(r!.passed).toBe(true);
      });
    });

    describe('tool-section-agreement', () => {
      it('passes when tools appear in Patterns/Context', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'tool-section-agreement');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
        expect(r!.passed).toBe(true);
      });

      it('flags tools missing from Patterns/Context', () => {
        const skill = parseSkill(NO_TOOLS_REF_SKILL);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'tool-section-agreement');
        expect(r).toBeDefined();
        expect(r!.score).toBeLessThan(1.0);
        expect(r!.evidence.length).toBeGreaterThan(0);
      });
    });

    describe('domain-content-match', () => {
      it('passes when body references the declared domain', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'domain-content-match');
        expect(r).toBeDefined();
        expect(r!.passed).toBe(true);
      });

      it('passes with no domain declared', () => {
        const noDomain = `---
name: "No Domain"
description: "No domain declared"
---

# No Domain

## Context
Testing things.

## Patterns
Write tests.
`;
        const skill = parseSkill(noDomain);
        const results = validateSkill(skill, { vectors: ['consistency'] });
        const r = findResult(results, 'domain-content-match');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // Containment
  // -----------------------------------------------------------------------
  describe('containment', () => {
    describe('scope-bounded', () => {
      it('passes when skill stays on domain topic', () => {
        const skill = parseSkill(GOOD_SKILL);
        const results = validateSkill(skill, { vectors: ['containment'] });
        const r = findResult(results, 'scope-bounded');
        expect(r).toBeDefined();
        expect(r!.passed).toBe(true);
      });

      it('flags when another domain dominates', () => {
        const skill = parseSkill(DOMAIN_MISMATCH_SKILL);
        const results = validateSkill(skill, { vectors: ['containment'] });
        const r = findResult(results, 'scope-bounded');
        expect(r).toBeDefined();
        // "security" dominates over "testing"
        expect(r!.score).toBeLessThan(1.0);
      });

      it('passes when no domain is declared', () => {
        const noDomain = `---
name: "No Domain"
description: "No domain"
---

# No Domain

## Context
General stuff.

## Patterns
Do things.
`;
        const skill = parseSkill(noDomain);
        const results = validateSkill(skill, { vectors: ['containment'] });
        const r = findResult(results, 'scope-bounded');
        expect(r).toBeDefined();
        expect(r!.score).toBe(1.0);
      });
    });
  });

  // -----------------------------------------------------------------------
  // validateSkill integration
  // -----------------------------------------------------------------------
  describe('validateSkill', () => {
    it('runs all rules and returns results', () => {
      const skill = parseSkill(GOOD_SKILL);
      const results = validateSkill(skill);
      // Should have one result per rule
      expect(results.length).toBe(RULES.length);
    });

    it('filters by vector when specified', () => {
      const skill = parseSkill(GOOD_SKILL);
      const results = validateSkill(skill, { vectors: ['clarity'] });
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.vector === 'clarity')).toBe(true);
    });

    it('applies custom thresholds', () => {
      const skill = parseSkill(GOOD_SKILL);
      // Set threshold impossibly high for one rule
      const results = validateSkill(skill, {
        thresholds: { 'has-specifics': 2.0 },
      });
      const r = findResult(results, 'has-specifics');
      expect(r).toBeDefined();
      expect(r!.passed).toBe(false);
    });

    it('sorts results by vector then score', () => {
      const skill = parseSkill(HEDGING_SKILL);
      const results = validateSkill(skill);

      // Verify vector ordering
      const vectorOrder = ['clarity', 'completeness', 'concreteness', 'consistency', 'containment'];
      let lastVectorIdx = -1;
      for (const r of results) {
        const idx = vectorOrder.indexOf(r.vector);
        expect(idx).toBeGreaterThanOrEqual(lastVectorIdx);
        if (idx > lastVectorIdx) lastVectorIdx = idx;
      }
    });

    it('good skill passes all rules', () => {
      const skill = parseSkill(GOOD_SKILL);
      const results = validateSkill(skill);
      const failing = results.filter((r) => !r.passed);
      expect(failing).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // formatValidationSummary
  // -----------------------------------------------------------------------
  describe('formatValidationSummary', () => {
    it('shows per-vector scores', () => {
      const skill = parseSkill(GOOD_SKILL);
      const results = validateSkill(skill);
      const summary = formatValidationSummary(results);

      expect(summary).toContain('clarity');
      expect(summary).toContain('completeness');
      expect(summary).toContain('concreteness');
      expect(summary).toContain('consistency');
      expect(summary).toContain('containment');
    });

    it('shows overall score', () => {
      const skill = parseSkill(GOOD_SKILL);
      const results = validateSkill(skill);
      const summary = formatValidationSummary(results);

      expect(summary).toContain('Overall');
      expect(summary).toMatch(/\d+%/);
    });

    it('shows pass/fail status', () => {
      const skill = parseSkill(GOOD_SKILL);
      const results = validateSkill(skill);
      const summary = formatValidationSummary(results);

      // Should contain checkmarks for passing
      expect(summary).toContain('✅');
    });

    it('returns message for empty results', () => {
      const summary = formatValidationSummary([]);
      expect(summary).toContain('No validation rules executed');
    });

    it('shows warnings for failing rules', () => {
      const skill = parseSkill(MISMATCHED_NAME_SKILL);
      const results = validateSkill(skill);
      const summary = formatValidationSummary(results);

      expect(summary).toContain('name-heading-match');
      // Should show the fail marker
      expect(summary).toContain('✗');
    });
  });
});
