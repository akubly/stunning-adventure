/**
 * Skill Validator — Quality Assessment (Tier 1)
 *
 * Deterministic validation rules that score a ParsedSkill across the 5 C's:
 * clarity, completeness, concreteness, consistency, containment.
 *
 * All rules are pure functions — no I/O, no DB, no filesystem.
 * Each returns a ValidationResult with a 0.0–1.0 score.
 */

import type { ParsedSkill } from './skillParser.js';
import type { ValidationResult, QualityVector, ValidatorRule } from '../types/index.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /** Only run rules for these vectors. Default: all 5. */
  vectors?: QualityVector[];
  /** Override default thresholds per rule. */
  thresholds?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLD = 0.5;

/** Get section content by heading name (case-insensitive). */
function getSectionContent(skill: ParsedSkill, heading: string): string | null {
  const section = skill.sections.find(
    (s) => s.heading.toLowerCase() === heading.toLowerCase(),
  );
  return section?.content ?? null;
}

/** Get the line number of a section heading. */
function getSectionLine(skill: ParsedSkill, heading: string): number | undefined {
  const section = skill.sections.find(
    (s) => s.heading.toLowerCase() === heading.toLowerCase(),
  );
  return section?.lineStart;
}

/** Get all body text (all section content concatenated). */
function getBodyText(skill: ParsedSkill): string {
  return skill.sections.map((s) => s.content).join('\n');
}

/** Split text into sentences (simple heuristic). */
function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]\s+|[.!?]$|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Count words in a string. */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

/** Clamp a number to [0, 1]. */
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// CLARITY rules
// ---------------------------------------------------------------------------

const HEDGE_WORDS = [
  'maybe', 'possibly', 'might', 'could', 'perhaps',
  'probably', 'sometimes', 'occasionally',
];

const noHedgeWords: ValidatorRule = {
  id: 'no-hedge-words',
  vector: 'clarity',
  tier: 1,
  description: 'Patterns section should not contain hedge words',
  evaluate(skill) {
    const patterns = getSectionContent(skill, 'patterns');
    if (!patterns) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No Patterns section — nothing to check',
        evidence: [],
      };
    }

    const words = patterns.toLowerCase().split(/\s+/);
    const totalWords = words.length;
    if (totalWords === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'Empty Patterns section',
        evidence: [],
      };
    }

    const found = HEDGE_WORDS.filter((hw) => words.includes(hw));
    const hedgeCount = words.filter((w) => HEDGE_WORDS.includes(w)).length;
    const score = clamp01(1.0 - hedgeCount / totalWords);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: found.length === 0
        ? 'No hedge words found in Patterns'
        : `Found hedge words in Patterns: ${found.join(', ')}`,
      evidence: found,
      line: getSectionLine(skill, 'patterns'),
    };
  },
};

const IMPERATIVE_VERBS = [
  'use', 'always', 'never', 'ensure', 'write', 'test',
  'run', 'check', 'add', 'remove', 'configure', 'set',
  'create', 'avoid', 'prefer', 'apply', 'include', 'exclude',
  'mock', 'verify', 'validate', 'build', 'deploy', 'install',
];

const imperativeVoice: ValidatorRule = {
  id: 'imperative-voice',
  vector: 'clarity',
  tier: 1,
  description: 'Patterns should use imperative verbs',
  evaluate(skill) {
    const patterns = getSectionContent(skill, 'patterns');
    if (!patterns) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No Patterns section — nothing to check',
        evidence: [],
      };
    }

    const sentences = splitSentences(patterns);
    if (sentences.length === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No sentences in Patterns',
        evidence: [],
      };
    }

    const imperativeStarts: string[] = [];
    const nonImperativeStarts: string[] = [];

    for (const sentence of sentences) {
      // Strip leading list markers (1. , - , * )
      const cleaned = sentence.replace(/^(?:\d+\.\s*|-\s*|\*\s*)/, '').trim();
      const firstWord = cleaned.split(/\s+/)[0]?.toLowerCase() ?? '';
      if (IMPERATIVE_VERBS.includes(firstWord)) {
        imperativeStarts.push(cleaned);
      } else {
        nonImperativeStarts.push(cleaned);
      }
    }

    const score = clamp01(imperativeStarts.length / sentences.length);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: score >= DEFAULT_THRESHOLD
        ? `${imperativeStarts.length}/${sentences.length} sentences start with imperative verbs`
        : `Only ${imperativeStarts.length}/${sentences.length} sentences start with imperative verbs`,
      evidence: nonImperativeStarts.slice(0, 3),
      line: getSectionLine(skill, 'patterns'),
    };
  },
};

const sentenceLength: ValidatorRule = {
  id: 'sentence-length',
  vector: 'clarity',
  tier: 1,
  description: 'Sentences in Patterns should not exceed 40 words',
  evaluate(skill) {
    const patterns = getSectionContent(skill, 'patterns');
    if (!patterns) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No Patterns section — nothing to check',
        evidence: [],
      };
    }

    const sentences = splitSentences(patterns);
    if (sentences.length === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No sentences in Patterns',
        evidence: [],
      };
    }

    const longSentences = sentences.filter((s) => wordCount(s) > 40);
    const score = clamp01(1.0 - longSentences.length / sentences.length);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: longSentences.length === 0
        ? 'All sentences are 40 words or fewer'
        : `${longSentences.length}/${sentences.length} sentences exceed 40 words`,
      evidence: longSentences.slice(0, 3),
      line: getSectionLine(skill, 'patterns'),
    };
  },
};

const VAGUE_REFS = [
  'as appropriate', 'when needed', 'if applicable',
  'as necessary', 'when possible',
];

const noVagueRefs: ValidatorRule = {
  id: 'no-vague-refs',
  vector: 'clarity',
  tier: 1,
  description: 'Patterns should not contain vague conditional references',
  evaluate(skill) {
    const patterns = getSectionContent(skill, 'patterns');
    if (!patterns) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No Patterns section — nothing to check',
        evidence: [],
      };
    }

    const lower = patterns.toLowerCase();
    const sentences = splitSentences(patterns);
    const totalPhrases = Math.max(sentences.length, 1);
    const found = VAGUE_REFS.filter((vr) => lower.includes(vr));
    let vagueCount = 0;
    for (const vr of VAGUE_REFS) {
      const re = new RegExp(vr.replace(/\s+/g, '\\s+'), 'gi');
      const matches = lower.match(re);
      if (matches) vagueCount += matches.length;
    }

    const score = clamp01(1.0 - vagueCount / totalPhrases);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: found.length === 0
        ? 'No vague references found in Patterns'
        : `Found vague references: ${found.join(', ')}`,
      evidence: found,
      line: getSectionLine(skill, 'patterns'),
    };
  },
};

// ---------------------------------------------------------------------------
// COMPLETENESS rules
// ---------------------------------------------------------------------------

const toolsReferencedInBody: ValidatorRule = {
  id: 'tools-referenced-in-body',
  vector: 'completeness',
  tier: 1,
  description: 'Tools declared in frontmatter should be referenced in body',
  evaluate(skill) {
    const tools = skill.frontmatter?.tools;
    if (!tools || tools.length === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No tools declared — nothing to check',
        evidence: [],
      };
    }

    const body = getBodyText(skill).toLowerCase();
    const unreferenced: string[] = [];
    let referencedCount = 0;

    for (const tool of tools) {
      if (body.includes(tool.name.toLowerCase())) {
        referencedCount++;
      } else {
        unreferenced.push(tool.name);
      }
    }

    const score = clamp01(referencedCount / tools.length);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: unreferenced.length === 0
        ? 'All declared tools are referenced in body'
        : `Unreferenced tools: ${unreferenced.join(', ')}`,
      evidence: unreferenced,
    };
  },
};

const sectionDepth: ValidatorRule = {
  id: 'section-depth',
  vector: 'completeness',
  tier: 1,
  description: 'Required sections should have substantive content (>50 words)',
  evaluate(skill) {
    const requiredSections = ['context', 'patterns'];
    let sectionsWithDepth = 0;
    let totalFound = 0;
    const shallow: string[] = [];

    for (const name of requiredSections) {
      const content = getSectionContent(skill, name);
      if (content !== null) {
        totalFound++;
        if (wordCount(content) > 50) {
          sectionsWithDepth++;
        } else {
          shallow.push(`${name} (${wordCount(content)} words)`);
        }
      }
    }

    if (totalFound === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 0.0, passed: false,
        message: 'No required sections found',
        evidence: [],
      };
    }

    const score = clamp01(sectionsWithDepth / requiredSections.length);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: shallow.length === 0
        ? 'All required sections have substantive content'
        : `Shallow sections: ${shallow.join(', ')}`,
      evidence: shallow,
    };
  },
};

const contextPatternsFlow: ValidatorRule = {
  id: 'context-patterns-flow',
  vector: 'completeness',
  tier: 1,
  description: 'Key terms from Context should appear in Patterns',
  evaluate(skill) {
    const contextContent = getSectionContent(skill, 'context');
    const patternsContent = getSectionContent(skill, 'patterns');

    if (!contextContent || !patternsContent) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'Missing Context or Patterns — nothing to cross-reference',
        evidence: [],
      };
    }

    // Extract significant words from Context (>5 chars, not stopwords)
    // Higher char threshold filters out generic terms
    const stopwords = new Set([
      'this', 'that', 'with', 'from', 'have', 'been', 'will',
      'should', 'would', 'could', 'about', 'their', 'which',
      'there', 'these', 'those', 'other', 'than', 'then',
      'when', 'where', 'what', 'into', 'also', 'more',
      'every', 'ensure', 'apply', 'cover', 'using', 'across',
      'before', 'after', 'between', 'during', 'without',
      'always', 'never', 'while', 'because', 'through',
    ]);
    const contextWords = new Set(
      contextContent.toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 5 && !stopwords.has(w))
        .map((w) => w.replace(/[^a-z0-9]/g, ''))
        .filter((w) => w.length > 0),
    );

    if (contextWords.size === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No significant terms in Context to check',
        evidence: [],
      };
    }

    const patternsLower = patternsContent.toLowerCase();
    let matchCount = 0;
    const missing: string[] = [];

    // Use stem matching: truncate to first 4 chars for fuzzy overlap
    // (e.g., "testing" → "test" matches "tests" in patterns)
    for (const word of contextWords) {
      const stem = word.length > 4 ? word.slice(0, 4) : word;
      if (patternsLower.includes(stem)) {
        matchCount++;
      } else {
        missing.push(word);
      }
    }

    // Context sets up "when/why", Patterns gives "how" — 25% overlap is reasonable
    const FLOW_THRESHOLD = 0.25;
    const score = clamp01(matchCount / contextWords.size);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= FLOW_THRESHOLD,
      message: `${matchCount}/${contextWords.size} Context terms appear in Patterns`,
      evidence: missing.slice(0, 5),
    };
  },
};

// ---------------------------------------------------------------------------
// CONCRETENESS rules
// ---------------------------------------------------------------------------

const actionableVerbs: ValidatorRule = {
  id: 'actionable-verbs',
  vector: 'concreteness',
  tier: 1,
  description: 'Patterns should contain action verbs (minimum 3)',
  evaluate(skill) {
    const patterns = getSectionContent(skill, 'patterns');
    if (!patterns) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 0.0, passed: false,
        message: 'No Patterns section',
        evidence: [],
      };
    }

    const actionWords = [
      'use', 'write', 'run', 'test', 'check', 'add', 'remove',
      'create', 'configure', 'set', 'build', 'deploy', 'install',
      'mock', 'verify', 'validate', 'avoid', 'prefer', 'apply',
      'import', 'export', 'return', 'call', 'throw', 'catch',
      'log', 'parse', 'format', 'render', 'fetch', 'send',
    ];

    const words = patterns.toLowerCase().split(/\s+/);
    const found = new Set(actionWords.filter((v) => words.includes(v)));
    const threshold = 3;
    const score = clamp01(found.size / threshold);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: `Found ${found.size} action verbs (threshold: ${threshold})`,
      evidence: [...found],
      line: getSectionLine(skill, 'patterns'),
    };
  },
};

const hasSpecifics: ValidatorRule = {
  id: 'has-specifics',
  vector: 'concreteness',
  tier: 1,
  description: 'Body should contain concrete references (paths, code blocks, identifiers)',
  evaluate(skill) {
    const body = getBodyText(skill);
    if (!body) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 0.0, passed: false,
        message: 'No body content',
        evidence: [],
      };
    }

    const specifics: string[] = [];

    // File paths (containing / or \)
    if (/\b[\w.-]+[/\\][\w./-]+/.test(body)) {
      specifics.push('file paths');
    }

    // Code blocks
    if (/```/.test(body)) {
      specifics.push('code blocks');
    }

    // Identifiers with dots or camelCase
    if (/\b[a-z]+[A-Z][a-zA-Z]*\b/.test(body) || /\b\w+\.\w+\(\)/.test(body)) {
      specifics.push('identifiers');
    }

    // Tool references (if tools declared)
    if (skill.frontmatter?.tools?.some((t) => body.includes(t.name))) {
      specifics.push('tool references');
    }

    const score = specifics.length > 0 ? 1.0 : 0.5;

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: specifics.length > 0
        ? `Found concrete references: ${specifics.join(', ')}`
        : 'No concrete references found (file paths, code blocks, identifiers)',
      evidence: specifics,
    };
  },
};

const ABSTRACT_PHRASES = [
  'ensure quality', 'maintain standards', 'follow best practices',
  'handle appropriately', 'as needed', 'when appropriate',
  'properly handle', 'correctly implement', 'adequate testing',
  'sufficient coverage',
];

const noAbstractions: ValidatorRule = {
  id: 'no-abstractions',
  vector: 'concreteness',
  tier: 1,
  description: 'Body should avoid vague abstract phrases without specifics',
  evaluate(skill) {
    const body = getBodyText(skill);
    if (!body) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No body content — nothing to check',
        evidence: [],
      };
    }

    const lower = body.toLowerCase();
    const sentences = splitSentences(body);
    const totalPhrases = Math.max(sentences.length, 1);
    const found = ABSTRACT_PHRASES.filter((ap) => lower.includes(ap));
    let abstractionCount = 0;
    for (const ap of ABSTRACT_PHRASES) {
      const re = new RegExp(ap.replace(/\s+/g, '\\s+'), 'gi');
      const matches = lower.match(re);
      if (matches) abstractionCount += matches.length;
    }

    const score = clamp01(1.0 - abstractionCount / totalPhrases);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: found.length === 0
        ? 'No abstract phrases found'
        : `Found abstract phrases: ${found.join(', ')}`,
      evidence: found,
    };
  },
};

// ---------------------------------------------------------------------------
// CONSISTENCY rules
// ---------------------------------------------------------------------------

const nameHeadingMatch: ValidatorRule = {
  id: 'name-heading-match',
  vector: 'consistency',
  tier: 1,
  description: 'Frontmatter name and # heading should match',
  evaluate(skill) {
    const fmName = skill.frontmatter?.name;
    const headingSection = skill.sections.find((s) => s.level === 1);
    const headingName = headingSection?.heading;

    if (!fmName || !headingName) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'Only one name source — no mismatch possible',
        evidence: [],
      };
    }

    // Normalize for comparison: lowercase, collapse whitespace, strip quotes/dashes
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

    const match = normalize(fmName) === normalize(headingName);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score: match ? 1.0 : 0.0,
      passed: match,
      message: match
        ? 'Frontmatter name matches heading'
        : `Frontmatter name "${fmName}" ≠ heading "${headingName}"`,
      evidence: match ? [] : [fmName, headingName],
    };
  },
};

const toolSectionAgreement: ValidatorRule = {
  id: 'tool-section-agreement',
  vector: 'consistency',
  tier: 1,
  description: 'Tools declared in frontmatter should be mentioned in Patterns or Context',
  evaluate(skill) {
    const tools = skill.frontmatter?.tools;
    if (!tools || tools.length === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No tools declared — nothing to check',
        evidence: [],
      };
    }

    const patterns = (getSectionContent(skill, 'patterns') ?? '').toLowerCase();
    const context = (getSectionContent(skill, 'context') ?? '').toLowerCase();
    const combined = patterns + ' ' + context;

    const unmentioned: string[] = [];
    let mentionedCount = 0;

    for (const tool of tools) {
      if (combined.includes(tool.name.toLowerCase())) {
        mentionedCount++;
      } else {
        unmentioned.push(tool.name);
      }
    }

    const score = clamp01(mentionedCount / tools.length);

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: unmentioned.length === 0
        ? 'All tools mentioned in Context/Patterns'
        : `Tools not in Context/Patterns: ${unmentioned.join(', ')}`,
      evidence: unmentioned,
    };
  },
};

const domainContentMatch: ValidatorRule = {
  id: 'domain-content-match',
  vector: 'consistency',
  tier: 1,
  description: 'Body content should relate to the declared domain',
  evaluate(skill) {
    const domain = skill.frontmatter?.domain;
    if (!domain) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No domain declared — nothing to check',
        evidence: [],
      };
    }

    const body = getBodyText(skill).toLowerCase();
    const words = body.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 0.0, passed: false,
        message: 'No body content',
        evidence: [],
      };
    }

    // Domain keyword and its common variants
    const domainLower = domain.toLowerCase();
    const domainTerms = [domainLower];
    // Add simple plural/gerund forms
    if (!domainLower.endsWith('s')) domainTerms.push(domainLower + 's');
    if (!domainLower.endsWith('ing')) domainTerms.push(domainLower.replace(/e$/, '') + 'ing');

    const domainCount = words.filter((w) =>
      domainTerms.some((dt) => w.includes(dt)),
    ).length;

    // Heuristic: domain terms should appear at least twice
    const score = domainCount >= 2 ? 1.0 : domainCount >= 1 ? 0.7 : 0.0;

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score,
      passed: score >= DEFAULT_THRESHOLD,
      message: domainCount > 0
        ? `Domain "${domain}" referenced ${domainCount} times in body`
        : `Domain "${domain}" not found in body content`,
      evidence: domainCount === 0 ? [domain] : [],
    };
  },
};

// ---------------------------------------------------------------------------
// CONTAINMENT rules
// ---------------------------------------------------------------------------

const KNOWN_DOMAINS = [
  'testing', 'security', 'performance', 'accessibility',
  'logging', 'authentication', 'deployment', 'documentation',
  'monitoring', 'debugging', 'styling', 'database', 'networking',
  'caching', 'validation', 'configuration', 'migration',
];

const scopeBounded: ValidatorRule = {
  id: 'scope-bounded',
  vector: 'containment',
  tier: 1,
  description: 'Skill should stay focused on its declared domain',
  evaluate(skill) {
    const domain = skill.frontmatter?.domain;
    if (!domain) {
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score: 1.0, passed: true,
        message: 'No domain declared — scope check skipped',
        evidence: [],
      };
    }

    const body = getBodyText(skill).toLowerCase();
    const words = body.split(/\s+/);
    const domainLower = domain.toLowerCase();

    // Count declared domain occurrences
    const domainCount = words.filter((w) => w.includes(domainLower)).length;

    // Count other domain occurrences
    const otherDomains = KNOWN_DOMAINS.filter((d) => d !== domainLower);
    const domainCounts: Array<{ domain: string; count: number }> = [];

    for (const other of otherDomains) {
      const count = words.filter((w) => w.includes(other)).length;
      if (count > 0) {
        domainCounts.push({ domain: other, count });
      }
    }

    // Sort by count descending
    domainCounts.sort((a, b) => b.count - a.count);

    // If another domain appears more than the declared one, flag it
    const topOther = domainCounts[0];
    if (topOther && topOther.count > domainCount) {
      const score = domainCount === 0
        ? 0.0
        : clamp01(domainCount / (domainCount + topOther.count));
      return {
        rule: this.id, vector: this.vector, tier: this.tier,
        score,
        passed: score >= DEFAULT_THRESHOLD,
        message: `"${topOther.domain}" (${topOther.count}x) appears more than declared domain "${domain}" (${domainCount}x)`,
        evidence: [topOther.domain],
      };
    }

    return {
      rule: this.id, vector: this.vector, tier: this.tier,
      score: 1.0, passed: true,
      message: `Skill stays focused on domain "${domain}"`,
      evidence: [],
    };
  },
};

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

/** All Tier 1 validation rules, exported for testing and extensibility. */
export const RULES: ValidatorRule[] = [
  // Clarity
  noHedgeWords,
  imperativeVoice,
  sentenceLength,
  noVagueRefs,
  // Completeness
  toolsReferencedInBody,
  sectionDepth,
  contextPatternsFlow,
  // Concreteness
  actionableVerbs,
  hasSpecifics,
  noAbstractions,
  // Consistency
  nameHeadingMatch,
  toolSectionAgreement,
  domainContentMatch,
  // Containment
  scopeBounded,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Run all Tier 1 validators against a parsed skill. */
export function validateSkill(
  skill: ParsedSkill,
  options?: ValidateOptions,
): ValidationResult[] {
  const { vectors, thresholds } = options ?? {};

  const activeRules = vectors
    ? RULES.filter((r) => vectors.includes(r.vector))
    : RULES;

  const results: ValidationResult[] = [];

  for (const rule of activeRules) {
    const result = rule.evaluate(skill) as ValidationResult;

    // Apply custom threshold if provided
    if (thresholds?.[rule.id] !== undefined) {
      result.passed = result.score >= thresholds[rule.id];
    }

    results.push(result);
  }

  // Sort by vector, then by score ascending (worst first)
  const vectorOrder: Record<QualityVector, number> = {
    clarity: 0,
    completeness: 1,
    concreteness: 2,
    consistency: 3,
    containment: 4,
  };
  results.sort((a, b) => {
    const vo = vectorOrder[a.vector] - vectorOrder[b.vector];
    if (vo !== 0) return vo;
    return a.score - b.score;
  });

  return results;
}

/** Format validation results as a human-readable summary with scores. */
export function formatValidationSummary(results: ValidationResult[]): string {
  if (results.length === 0) return '✅ No validation rules executed';

  const vectors: QualityVector[] = [
    'clarity', 'completeness', 'concreteness', 'consistency', 'containment',
  ];

  const lines: string[] = [];
  let totalScore = 0;
  let totalCount = 0;

  for (const vector of vectors) {
    const vectorResults = results.filter((r) => r.vector === vector);
    if (vectorResults.length === 0) continue;

    const avgScore = vectorResults.reduce((s, r) => s + r.score, 0) / vectorResults.length;
    totalScore += avgScore;
    totalCount++;

    const passed = vectorResults.filter((r) => r.passed).length;
    const icon = passed === vectorResults.length ? '✅' : '⚠️';
    const pct = Math.round(avgScore * 100);
    lines.push(`${icon} ${vector}: ${pct}% (${passed}/${vectorResults.length} rules passed)`);

    for (const r of vectorResults) {
      const rIcon = r.passed ? '  ✓' : '  ✗';
      lines.push(`${rIcon} ${r.rule}: ${Math.round(r.score * 100)}% — ${r.message}`);
    }
  }

  const overall = totalCount > 0 ? Math.round((totalScore / totalCount) * 100) : 0;
  const overallIcon = overall >= 80 ? '✅' : overall >= 50 ? '⚠️' : '❌';

  return `${overallIcon} Overall: ${overall}%\n\n${lines.join('\n')}`;
}
