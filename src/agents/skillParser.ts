/**
 * Skill Parser
 *
 * Parses a SKILL.md file into a structured AST that the linter and
 * future test harness can consume. Pure function — no side effects,
 * no database access, no filesystem reads.
 *
 * Handles:
 *   - YAML frontmatter extraction (between --- markers)
 *   - Lightweight frontmatter field parsing (no external YAML dep)
 *   - Markdown section splitting by heading level
 *   - Graceful degradation with parseErrors on malformed input
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillToolDeclaration {
  name: string;
  description?: string;
  when?: string;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  domain?: string;
  confidence?: string;
  source?: string;
  tools?: SkillToolDeclaration[];
  [key: string]: unknown;
}

export interface SkillSection {
  /** Heading text (e.g., "Context", "Patterns") */
  heading: string;
  /** Heading level (1 for #, 2 for ##, etc.) */
  level: number;
  /** Raw markdown content below the heading */
  content: string;
  /** 1-based line number where the heading appears */
  lineStart: number;
}

export interface ParseError {
  /** 1-based line number, or 0 if not line-specific */
  line: number;
  message: string;
}

export interface ParsedSkill {
  /** Top-level heading text (the skill name), if found */
  name: string | null;
  /** Parsed frontmatter fields, or null if no frontmatter block */
  frontmatter: SkillFrontmatter | null;
  /** Markdown sections split by headings */
  sections: SkillSection[];
  /** Raw input for reference */
  raw: string;
  /** Non-fatal parse issues */
  parseErrors: ParseError[];
}

// ---------------------------------------------------------------------------
// Frontmatter parser (lightweight, no external deps)
// ---------------------------------------------------------------------------

/**
 * Extract the YAML frontmatter block from the raw content.
 * Returns the inner YAML text and the line number where the closing
 * `---` appears (so we know where the body starts).
 */
function extractFrontmatterBlock(raw: string): {
  yaml: string;
  bodyStartLine: number;
} | null {
  const lines = raw.split('\n');

  // Frontmatter must start with an opening delimiter on line 1
  if (lines.length === 0 || lines[0].trimEnd() !== '---') return null;

  // Find closing ---
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === '---') {
      return {
        yaml: lines.slice(1, i).join('\n'),
        bodyStartLine: i + 1, // 0-based index of first body line
      };
    }
  }
  return null; // No closing ---
}

/** Strip surrounding quotes from a YAML string value. */
function unquote(val: string): string {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse simple YAML frontmatter into a SkillFrontmatter object.
 *
 * Handles:
 *   - `key: value` string pairs
 *   - `key:` followed by indented `- name: value` list items (tools array)
 *   - Quoted and unquoted values
 *
 * Does NOT handle: anchors, aliases, multi-line strings, nested objects
 * beyond the tools array. This is intentional — SKILL.md frontmatter is
 * a constrained format.
 */
function parseFrontmatter(
  yaml: string,
  errors: ParseError[],
): SkillFrontmatter {
  const result: SkillFrontmatter = {};
  const lines = yaml.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)/);
    if (!kvMatch) {
      // Non-indented, non-comment line that isn't key: value — malformed
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        errors.push({
          line: i + 2, // 1-based, offset by opening ---
          message: `Malformed frontmatter line: expected "key: value" but found "${trimmed}"`,
        });
      }
      i++;
      continue;
    }

    const key = kvMatch[1];
    const valueStr = kvMatch[2].trim();

    if (valueStr === '|' || valueStr === '>') {
      // Block scalars are not supported by this lightweight parser
      errors.push({
        line: i + 2, // 1-based, offset by opening ---
        message: `Block scalar "${valueStr}" on key "${key}" is not supported — use a single-line value`,
      });
      i = skipIndentedBlock(lines, i + 1);
      continue;
    }

    if (valueStr === '') {
      // Could be an array — check next lines for indented items
      const items = parseIndentedList(lines, i + 1);
      if (items.length > 0) {
        if (key === 'tools') {
          result.tools = items.map(parseToolItem);
        } else {
          result[key] = items;
        }
        // Advance past the indented block
        i = skipIndentedBlock(lines, i + 1);
        continue;
      }
      // Empty key with no indented block — treat as empty string
      result[key] = '';
      i++;
      continue;
    }

    // Simple string value
    result[key] = unquote(valueStr);
    i++;
  }

  return result;
}

/** Parse indented list items starting at `startIdx`. */
function parseIndentedList(
  lines: string[],
  startIdx: number,
): Array<Record<string, string> | string> {
  const items: Array<Record<string, string> | string> = [];
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines within the indented block
    if (line.trim() === '') { i++; continue; }
    // Non-indented line ends the block
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      break;
    }

    const trimmed = line.trim();

    // List item: - key: value  or  - "value"
    if (trimmed.startsWith('- ')) {
      const itemContent = trimmed.slice(2).trim();
      const itemKv = itemContent.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)/);
      if (itemKv) {
        // Start of an object item — collect all sub-keys
        const obj: Record<string, string> = { [itemKv[1]]: unquote(itemKv[2]) };
        i++;
        // Collect continuation key: value lines at deeper indent
        while (i < lines.length) {
          const subLine = lines[i];
          if (subLine.trim() === '') { i++; continue; }
          if (!subLine.startsWith('  ') && !subLine.startsWith('\t\t')) break;
          const subTrimmed = subLine.trim();
          if (subTrimmed.startsWith('- ')) break; // next list item
          const subKv = subTrimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)/);
          if (subKv) {
            obj[subKv[1]] = unquote(subKv[2]);
          }
          i++;
        }
        items.push(obj);
      } else {
        items.push(unquote(itemContent));
        i++;
      }
    } else if (trimmed.startsWith('#')) {
      // Comment inside indented block
      i++;
    } else {
      break;
    }
  }

  return items;
}

/** Convert a parsed list item to a SkillToolDeclaration. */
function parseToolItem(item: Record<string, string> | string): SkillToolDeclaration {
  if (typeof item === 'string') {
    return { name: item };
  }
  return {
    name: item.name ?? '',
    description: item.description,
    when: item.when,
  };
}

/** Return the index after an indented block. */
function skipIndentedBlock(lines: string[], startIdx: number): number {
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('\t')) {
      break;
    }
    i++;
  }
  return i;
}

// ---------------------------------------------------------------------------
// Section parser
// ---------------------------------------------------------------------------

/**
 * Split the markdown body into sections by heading.
 * Each section captures: heading text, level, content, line number.
 * Headings inside fenced code blocks (``` or ~~~) are ignored.
 */
function parseSections(body: string, lineOffset: number): SkillSection[] {
  const sections: SkillSection[] = [];
  const lines = body.split('\n');

  let currentSection: SkillSection | null = null;
  const contentLines: string[] = [];
  let inCodeFence = false;
  let fenceChar: string | null = null;
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code blocks to avoid false heading detection.
    // Per CommonMark: fences may be indented 0-3 spaces; opening fences may
    // have trailing info strings; closing fences must have only whitespace after.
    const openFenceMatch = !inCodeFence ? line.match(/^ {0,3}(`{3,}|~{3,})/) : null;
    const closeFenceMatch = inCodeFence ? line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/) : null;

    if (openFenceMatch) {
      inCodeFence = true;
      fenceChar = openFenceMatch[1][0];
      fenceLen = openFenceMatch[1].length;
      if (currentSection) contentLines.push(line);
      continue;
    }

    if (closeFenceMatch) {
      const char = closeFenceMatch[1][0];
      const len = closeFenceMatch[1].length;
      if (char === fenceChar && len >= fenceLen) {
        inCodeFence = false;
        fenceChar = null;
        fenceLen = 0;
      }
      if (currentSection) contentLines.push(line);
      continue;
    }

    const headingMatch = !inCodeFence ? line.match(/^(#{1,6})\s+(.+)$/) : null;

    if (headingMatch) {
      // Flush previous section
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        sections.push(currentSection);
        contentLines.length = 0;
      }

      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: '',
        lineStart: lineOffset + i + 1, // 1-based
      };
    } else if (currentSection) {
      contentLines.push(line);
    }
    // Lines before the first heading are ignored (body preamble)
  }

  // Flush last section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a SKILL.md file into a structured AST.
 *
 * Pure function — no side effects. Returns partial results on malformed
 * input with issues captured in `parseErrors`.
 */
export function parseSkill(raw: string): ParsedSkill {
  const errors: ParseError[] = [];

  if (raw.trim() === '') {
    errors.push({ line: 0, message: 'Empty file' });
    return { name: null, frontmatter: null, sections: [], raw, parseErrors: errors };
  }

  // Extract frontmatter
  let frontmatter: SkillFrontmatter | null = null;
  let bodyStartLine = 0;

  const fmBlock = extractFrontmatterBlock(raw);
  if (fmBlock) {
    frontmatter = parseFrontmatter(fmBlock.yaml, errors);
    bodyStartLine = fmBlock.bodyStartLine;
  }

  // Parse body into sections
  const bodyLines = raw.split('\n').slice(bodyStartLine);
  const body = bodyLines.join('\n');
  const sections = parseSections(body, bodyStartLine);

  // Extract skill name from first level-1 heading
  const nameSection = sections.find((s) => s.level === 1);
  const name = nameSection?.heading ?? frontmatter?.name ?? null;

  return { name, frontmatter, sections, raw, parseErrors: errors };
}
