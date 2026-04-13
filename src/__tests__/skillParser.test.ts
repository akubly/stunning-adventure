import { describe, it, expect } from 'vitest';
import { parseSkill } from '../agents/skillParser.js';

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

## Examples
See the test suite.

## Anti-Patterns
Don't skip tests.
`;

const SKILL_WITH_TOOLS = `---
name: "tool-skill"
description: "Skill with tools"
domain: "tooling"
confidence: "medium"
source: "earned"
tools:
  - name: "grep"
    description: "Search for patterns"
    when: "Looking for code references"
  - name: "view"
    description: "Read file contents"
---

# Tool Skill

## Context
When you need to search code.

## Patterns
Use grep before view.
`;

const NO_FRONTMATTER = `# Bare Skill

## Context
No frontmatter here.

## Patterns
Just do things.
`;

const EMPTY_FILE = '';

const MALFORMED_FRONTMATTER = `---
name: test
this is not yaml : : :
---

# Malformed

## Context
Has content.

## Patterns
Has patterns.
`;

const MISSING_SECTIONS = `---
name: "incomplete"
description: "Missing required sections"
---

# Incomplete Skill

## Examples
Only has examples, no Context or Patterns.
`;

const EMPTY_SECTIONS = `---
name: "empty-sections"
description: "Has sections but they are empty"
domain: "testing"
confidence: "low"
source: "manual"
---

# Empty Sections Skill

## Context

## Patterns
Has some content here.

## Examples

`;

const INVALID_CONFIDENCE = `---
name: "bad-confidence"
description: "Invalid confidence value"
confidence: "extreme"
---

# Bad Confidence

## Context
Testing.

## Patterns
Testing.
`;

const NO_HEADING = `---
name: "headless"
description: "No level-1 heading"
---

## Context
Testing.

## Patterns
Testing.
`;

const NAME_FROM_HEADING = `---
description: "Name from heading, not frontmatter"
domain: "testing"
---

# My Skill Name

## Context
Testing.

## Patterns
Testing.
`;

const QUOTED_VALUES = `---
name: 'single-quoted'
description: "double-quoted"
domain: unquoted
confidence: "high"
source: 'earned'
---

# Quoted

## Context
Testing quotes.

## Patterns
Testing.
`;

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('Skill Parser', () => {
  describe('frontmatter extraction', () => {
    it('should parse all frontmatter fields from a valid skill', () => {
      const result = parseSkill(VALID_SKILL);

      expect(result.frontmatter).not.toBeNull();
      expect(result.frontmatter!.name).toBe('test-skill');
      expect(result.frontmatter!.description).toBe('A test skill for validation');
      expect(result.frontmatter!.domain).toBe('testing');
      expect(result.frontmatter!.confidence).toBe('high');
      expect(result.frontmatter!.source).toBe('manual');
      expect(result.parseErrors).toHaveLength(0);
    });

    it('should handle quoted and unquoted values', () => {
      const result = parseSkill(QUOTED_VALUES);

      expect(result.frontmatter!.name).toBe('single-quoted');
      expect(result.frontmatter!.description).toBe('double-quoted');
      expect(result.frontmatter!.domain).toBe('unquoted');
      expect(result.frontmatter!.confidence).toBe('high');
      expect(result.frontmatter!.source).toBe('earned');
    });

    it('should parse tools array', () => {
      const result = parseSkill(SKILL_WITH_TOOLS);

      expect(result.frontmatter!.tools).toHaveLength(2);
      expect(result.frontmatter!.tools![0]).toEqual({
        name: 'grep',
        description: 'Search for patterns',
        when: 'Looking for code references',
      });
      expect(result.frontmatter!.tools![1]).toEqual({
        name: 'view',
        description: 'Read file contents',
        when: undefined,
      });
    });

    it('should return null frontmatter when no --- block exists', () => {
      const result = parseSkill(NO_FRONTMATTER);

      expect(result.frontmatter).toBeNull();
      expect(result.parseErrors).toHaveLength(0);
    });

    it('should handle empty file', () => {
      const result = parseSkill(EMPTY_FILE);

      expect(result.frontmatter).toBeNull();
      expect(result.name).toBeNull();
      expect(result.sections).toHaveLength(0);
      expect(result.parseErrors).toHaveLength(1);
      expect(result.parseErrors[0].message).toBe('Empty file');
    });

    it('should record parse error for invalid confidence', () => {
      const result = parseSkill(INVALID_CONFIDENCE);

      expect(result.frontmatter!.confidence).toBe('extreme');
      expect(result.parseErrors.some(
        (e) => e.message.includes('Invalid confidence'),
      )).toBe(true);
    });

    it('should handle malformed frontmatter gracefully', () => {
      const result = parseSkill(MALFORMED_FRONTMATTER);

      expect(result.frontmatter).not.toBeNull();
      expect(result.frontmatter!.name).toBe('test');
      // Malformed line is skipped, not fatal
      expect(result.sections.length).toBeGreaterThan(0);
    });
  });

  describe('section parsing', () => {
    it('should extract all sections from a valid skill', () => {
      const result = parseSkill(VALID_SKILL);

      expect(result.sections).toHaveLength(5); // #, ##×4
      expect(result.sections[0].heading).toBe('Test Skill');
      expect(result.sections[0].level).toBe(1);
      expect(result.sections[1].heading).toBe('Context');
      expect(result.sections[1].level).toBe(2);
      expect(result.sections[1].content).toBe('This skill applies when testing.');
    });

    it('should parse file with missing required sections', () => {
      const result = parseSkill(MISSING_SECTIONS);

      expect(result.name).toBe('Incomplete Skill');
      const headings = result.sections.map((s) => s.heading);
      expect(headings).toContain('Examples');
      expect(headings).not.toContain('Context');
      expect(headings).not.toContain('Patterns');
    });

    it('should extract sections from a file without frontmatter', () => {
      const result = parseSkill(NO_FRONTMATTER);

      expect(result.sections).toHaveLength(3);
      expect(result.sections[0].heading).toBe('Bare Skill');
      expect(result.sections[0].level).toBe(1);
    });

    it('should detect empty sections', () => {
      const result = parseSkill(EMPTY_SECTIONS);

      const contextSection = result.sections.find(
        (s) => s.heading === 'Context',
      );
      expect(contextSection).toBeDefined();
      expect(contextSection!.content).toBe('');

      const patternsSection = result.sections.find(
        (s) => s.heading === 'Patterns',
      );
      expect(patternsSection!.content).toBe('Has some content here.');
    });

    it('should include 1-based line numbers', () => {
      const result = parseSkill(VALID_SKILL);

      // All sections should have lineStart > 0
      for (const section of result.sections) {
        expect(section.lineStart).toBeGreaterThan(0);
      }
    });
  });

  describe('name extraction', () => {
    it('should extract name from level-1 heading', () => {
      const result = parseSkill(VALID_SKILL);
      expect(result.name).toBe('Test Skill');
    });

    it('should fall back to frontmatter name when no heading', () => {
      const result = parseSkill(NO_HEADING);
      expect(result.name).toBe('headless');
    });

    it('should prefer heading over frontmatter name', () => {
      const result = parseSkill(NAME_FROM_HEADING);
      expect(result.name).toBe('My Skill Name');
    });

    it('should return null when no name source exists', () => {
      const noName = `---
domain: "testing"
---

## Context
No name anywhere.

## Patterns
Still nothing.
`;
      const result = parseSkill(noName);
      expect(result.name).toBeNull();
    });
  });

  describe('raw preservation', () => {
    it('should preserve the raw input', () => {
      const result = parseSkill(VALID_SKILL);
      expect(result.raw).toBe(VALID_SKILL);
    });
  });
});
