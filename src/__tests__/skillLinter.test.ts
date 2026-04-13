import { describe, it, expect } from 'vitest';
import { parseSkill } from '../agents/skillParser.js';
import { lintSkill, formatLintSummary } from '../agents/skillLinter.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_SKILL = `---
name: "test-skill"
description: "A test skill for validation"
domain: "testing"
confidence: "high"
source: "manual"
---

# Test Skill

## Context
This skill applies when testing.

## Patterns
Always write tests first.
`;

const NO_FRONTMATTER = `# Bare Skill

## Context
No frontmatter here.

## Patterns
Just do things.
`;

const MISSING_REQUIRED_FIELDS = `---
domain: "testing"
---

# Incomplete

## Context
Has context.

## Patterns
Has patterns.
`;

const MISSING_SECTIONS = `---
name: "no-sections"
description: "Missing required sections"
domain: "testing"
confidence: "low"
source: "manual"
---

# No Sections

## Examples
Only has examples.
`;

const EMPTY_SECTIONS = `---
name: "empty"
description: "Has empty sections"
domain: "testing"
confidence: "low"
source: "manual"
---

# Empty

## Context

## Patterns
Has content.
`;

const INVALID_CONFIDENCE = `---
name: "bad"
description: "Bad confidence"
confidence: "extreme"
---

# Bad

## Context
Testing.

## Patterns
Testing.
`;

const NO_HEADING = `---
description: "No heading, no frontmatter name"
---

## Context
Testing.

## Patterns
Testing.
`;

const FRONTMATTER_NAME_NO_HEADING = `---
name: "has-name"
description: "Has name in frontmatter"
---

## Context
Testing.

## Patterns
Testing.
`;

const MALFORMED_TOOLS = `---
name: "bad-tools"
description: "Tools with missing name"
tools:
  - description: "No name field"
    when: "Never"
  - name: "valid-tool"
---

# Bad Tools

## Context
Testing.

## Patterns
Testing.
`;

const PERFECT_SKILL = `---
name: "perfect"
description: "A perfectly authored skill"
domain: "testing"
confidence: "high"
source: "earned"
---

# Perfect Skill

## Context
This skill applies during test authoring to ensure comprehensive coverage.

## Patterns
1. Write the test before the implementation.
2. Name tests descriptively.
3. One assertion per test when possible.

## Examples
See the test suite for reference.

## Anti-Patterns
- Don't write tests after the fact.
- Don't test implementation details.
`;

// ---------------------------------------------------------------------------
// Linter tests
// ---------------------------------------------------------------------------

describe('Skill Linter', () => {
  describe('missing-frontmatter', () => {
    it('should error when no frontmatter exists', () => {
      const skill = parseSkill(NO_FRONTMATTER);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'missing-frontmatter')).toBe(true);
      expect(results.find((r) => r.rule === 'missing-frontmatter')!.severity).toBe('error');
    });

    it('should not error when frontmatter exists', () => {
      const skill = parseSkill(VALID_SKILL);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'missing-frontmatter')).toBe(false);
    });
  });

  describe('missing-field rules', () => {
    it('should error on missing name and description', () => {
      const skill = parseSkill(MISSING_REQUIRED_FIELDS);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'missing-field:name')).toBe(true);
      expect(results.find((r) => r.rule === 'missing-field:name')!.severity).toBe('error');
      expect(results.some((r) => r.rule === 'missing-field:description')).toBe(true);
      expect(results.find((r) => r.rule === 'missing-field:description')!.severity).toBe('error');
    });

    it('should warn on missing domain, confidence, source', () => {
      const skill = parseSkill(MISSING_REQUIRED_FIELDS);
      const results = lintSkill(skill);

      // domain is present in fixture, but confidence and source are missing
      expect(results.some((r) => r.rule === 'missing-field:confidence')).toBe(true);
      expect(results.find((r) => r.rule === 'missing-field:confidence')!.severity).toBe('warning');
      expect(results.some((r) => r.rule === 'missing-field:source')).toBe(true);
    });

    it('should not flag fields that are present', () => {
      const skill = parseSkill(VALID_SKILL);
      const results = lintSkill(skill);

      const fieldRules = results.filter((r) => r.rule.startsWith('missing-field:'));
      expect(fieldRules).toHaveLength(0);
    });
  });

  describe('invalid-confidence', () => {
    it('should error on invalid confidence value', () => {
      const skill = parseSkill(INVALID_CONFIDENCE);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'invalid-confidence')).toBe(true);
    });

    it('should not error on valid confidence', () => {
      const skill = parseSkill(VALID_SKILL);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'invalid-confidence')).toBe(false);
    });
  });

  describe('missing-section rules', () => {
    it('should error when required sections are missing', () => {
      const skill = parseSkill(MISSING_SECTIONS);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'missing-section:context')).toBe(true);
      expect(results.some((r) => r.rule === 'missing-section:patterns')).toBe(true);
    });

    it('should not error when required sections exist', () => {
      const skill = parseSkill(VALID_SKILL);
      const results = lintSkill(skill);

      const sectionRules = results.filter((r) => r.rule.startsWith('missing-section:'));
      expect(sectionRules).toHaveLength(0);
    });
  });

  describe('empty-section', () => {
    it('should warn on empty sections', () => {
      const skill = parseSkill(EMPTY_SECTIONS);
      const results = lintSkill(skill);

      const emptyRules = results.filter((r) => r.rule === 'empty-section');
      expect(emptyRules.length).toBeGreaterThanOrEqual(1);
      expect(emptyRules[0].severity).toBe('warning');
    });

    it('should not warn on sections with content', () => {
      const skill = parseSkill(VALID_SKILL);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'empty-section')).toBe(false);
    });
  });

  describe('no-heading', () => {
    it('should warn when no heading and no frontmatter name', () => {
      const skill = parseSkill(NO_HEADING);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'no-heading')).toBe(true);
    });

    it('should not warn when frontmatter has name but no heading', () => {
      const skill = parseSkill(FRONTMATTER_NAME_NO_HEADING);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'no-heading')).toBe(false);
    });

    it('should not warn when heading exists', () => {
      const skill = parseSkill(VALID_SKILL);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'no-heading')).toBe(false);
    });
  });

  describe('tools validation', () => {
    it('should error when tool is missing name', () => {
      const skill = parseSkill(MALFORMED_TOOLS);
      const results = lintSkill(skill);

      expect(results.some((r) => r.rule === 'tool-missing-name')).toBe(true);
    });
  });

  describe('perfect skill', () => {
    it('should produce zero lint results for a well-authored skill', () => {
      const skill = parseSkill(PERFECT_SKILL);
      const results = lintSkill(skill);

      expect(results).toHaveLength(0);
    });
  });

  describe('result ordering', () => {
    it('should sort errors before warnings', () => {
      const skill = parseSkill(NO_FRONTMATTER);
      const results = lintSkill(skill);

      // Errors should come before warnings
      let seenWarning = false;
      for (const r of results) {
        if (r.severity === 'warning') seenWarning = true;
        if (r.severity === 'error' && seenWarning) {
          throw new Error('Found error after warning — results not sorted');
        }
      }
    });
  });

  describe('formatLintSummary', () => {
    it('should return checkmark for no issues', () => {
      expect(formatLintSummary([])).toBe('✅ No issues found');
    });

    it('should summarize errors and warnings', () => {
      const skill = parseSkill(MISSING_REQUIRED_FIELDS);
      const results = lintSkill(skill);
      const summary = formatLintSummary(results);

      expect(summary).toContain('error');
      expect(summary).toContain('missing-field:name');
    });
  });
});
