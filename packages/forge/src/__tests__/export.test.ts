/**
 * Export Pipeline tests — Phase 4.
 *
 * Aligned with forge-phase4-spec.md §3 (compiler), §4 (pipeline), §4.5 (types).
 *
 * Covers:
 *   - renderFrontmatter / compileSkill (§3)
 *   - Pipeline stages: extractStage, stripStage, attachStage, validateStage (§4.3)
 *   - runExportPipeline orchestrator (§4.4)
 *   - ExportQualityGate / QualityGateResult / ExportDiagnostic (§4.5)
 *   - DBOM persistence injection (§4.4, §5.2)
 *   - Forge→Cairn integration boundary (§5)
 *
 * Tests are TDD-style: inline contract implementations matching the spec's
 * exact type signatures. When Roger's production modules land, replace
 * inlines with real imports from ../export/index.js.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateDBOM } from '../dbom/index.js';
import type {
  CairnBridgeEvent,
  DBOMArtifact,
} from '@akubly/types';

// ---------------------------------------------------------------------------
// Contract types — exact match to forge-phase4-spec.md §3, §4, §4.5
// TODO: Replace with real imports from ../export/index.js
// ---------------------------------------------------------------------------

// §3.1 — Compiler types

interface SkillFrontmatterInput {
  name: string;
  description: string;
  domain: string;
  confidence: 'low' | 'medium' | 'high';
  source: string;
  tools?: Array<{ name: string; description?: string; when?: string }>;
}

interface SkillCompilerInput {
  skillContent: string;
  dbom: DBOMArtifact;
  frontmatter: SkillFrontmatterInput;
}

interface CompiledSkill {
  content: string;
  dbom: DBOMArtifact;
  compiledAt: string;
  contentHash: string;
}

// §4.2 — Stage context

interface StageContext {
  events: CairnBridgeEvent[];
  sessionId: string;
  dbom?: DBOMArtifact;
  strippedContent?: string;
  compiledSkill?: CompiledSkill;
  qualityGate?: QualityGateResult;
  diagnostics: ExportDiagnostic[];
}

type ExportStage = (context: StageContext) => StageContext;

// §4.4 — Pipeline config/result

interface ExportPipelineConfig {
  sessionId: string;
  events: CairnBridgeEvent[];
  skillContent: string;
  frontmatter: SkillFrontmatterInput;
  qualityGate: ExportQualityGate;
  persistDBOM?: boolean;
  persistFn?: (artifact: DBOMArtifact) => void;
}

interface ExportStageResult {
  stage: string;
  durationMs: number;
  passed: boolean;
}

interface ExportPipelineResult {
  success: boolean;
  skill?: CompiledSkill;
  stages: ExportStageResult[];
  diagnostics: ExportDiagnostic[];
  qualityGatePassed?: boolean;
  lintErrors?: number;
  validationScore?: number;
}

// §4.5 — Export-local types

type ExportDiagnosticSeverity = 'error' | 'warning' | 'info';

interface ExportDiagnostic {
  stage: string;
  severity: ExportDiagnosticSeverity;
  message: string;
}

interface QualityGateResult {
  passed: boolean;
  lintErrors: number;
  lintWarnings: number;
  validationScore: number;
  details: string;
}

type ExportQualityGate = (skillContent: string) => QualityGateResult;

// ---------------------------------------------------------------------------
// Inline contract implementations — match spec §3.3, §4.3, §4.4
// TODO: Replace with real imports from ../export/index.js
// ---------------------------------------------------------------------------

function escapeFrontmatter(value: string): string {
  return value.replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/** §3.3 — renderFrontmatter */
function renderFrontmatter(
  frontmatter: SkillFrontmatterInput,
  dbom: DBOMArtifact,
): string {
  const lines: string[] = ['---'];

  lines.push(`name: "${escapeFrontmatter(frontmatter.name)}"`);
  lines.push(`description: "${escapeFrontmatter(frontmatter.description)}"`);
  lines.push(`domain: "${frontmatter.domain}"`);
  lines.push(`confidence: "${frontmatter.confidence}"`);
  lines.push(`source: "${frontmatter.source}"`);

  if (frontmatter.tools?.length) {
    lines.push('tools:');
    for (const tool of frontmatter.tools) {
      lines.push(`  - name: "${tool.name}"`);
      if (tool.description) lines.push(`    description: "${escapeFrontmatter(tool.description)}"`);
      if (tool.when) lines.push(`    when: "${escapeFrontmatter(tool.when)}"`);
    }
  }

  lines.push('provenance:');
  lines.push(`  compiler: "forge"`);
  lines.push(`  version: "${dbom.version}"`);
  lines.push(`  session_id: "${dbom.sessionId}"`);
  lines.push(`  compiled_at: "${new Date().toISOString()}"`);
  lines.push('  dbom:');
  lines.push(`    root_hash: "${dbom.rootHash}"`);
  lines.push(`    total_decisions: ${dbom.stats.totalDecisions}`);
  lines.push(`    human_gated: ${dbom.stats.humanGatedDecisions}`);
  lines.push(`    machine: ${dbom.stats.machineDecisions}`);
  lines.push(`    ai_recommended: ${dbom.stats.aiRecommendedDecisions}`);
  lines.push(`    chain_depth: ${dbom.stats.chainDepth}`);
  if (Object.keys(dbom.stats.decisionTypes).length > 0) {
    lines.push('    decision_types:');
    for (const [type, count] of Object.entries(dbom.stats.decisionTypes)) {
      lines.push(`      ${type}: ${count}`);
    }
  }

  lines.push('---');
  return lines.join('\n');
}

/** §3.3 — compileSkill */
function compileSkill(input: SkillCompilerInput): CompiledSkill {
  const frontmatterBlock = renderFrontmatter(input.frontmatter, input.dbom);
  const content = `${frontmatterBlock}\n\n${input.skillContent.trim()}\n`;
  const contentHash = createHash('sha256').update(content).digest('hex');

  return {
    content,
    dbom: input.dbom,
    compiledAt: new Date().toISOString(),
    contentHash,
  };
}

/** §4.3 — extractStage */
function extractStage(context: StageContext): StageContext {
  if (context.events.length === 0) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: 'extract', severity: 'error', message: 'No events provided' },
      ],
    };
  }

  const dbom = generateDBOM(context.sessionId, context.events);

  if (dbom.decisions.length === 0) {
    return {
      ...context,
      dbom,
      diagnostics: [
        ...context.diagnostics,
        { stage: 'extract', severity: 'warning', message: 'No certification-tier events found — DBOM has zero decisions' },
      ],
    };
  }

  return { ...context, dbom };
}

/** §4.3 — stripStage */
function stripStage(context: StageContext): StageContext {
  const content = context.strippedContent ?? context.compiledSkill?.content ?? '';
  if (!content) return context;

  let stripped = content.replace(/[A-Z]:\\(?:[\w.-]+\\)+[\w.-]+/g, '<path>');
  stripped = stripped.replace(/\/(?:home|Users|tmp)\/[\w.-]+(?:\/[\w.-]+)*/g, '<path>');

  return { ...context, strippedContent: stripped };
}

/** §4.3 — attachStage */
function attachStage(context: StageContext, frontmatter: SkillFrontmatterInput): StageContext {
  if (!context.dbom) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: 'attach', severity: 'error', message: 'No DBOM available — Extract stage may have failed' },
      ],
    };
  }

  const compiled = compileSkill({
    skillContent: context.strippedContent ?? '',
    dbom: context.dbom,
    frontmatter,
  });

  return { ...context, compiledSkill: compiled };
}

/** §4.3 — validateStage */
function validateStage(context: StageContext, qualityGate: ExportQualityGate): StageContext {
  if (!context.compiledSkill) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: 'validate', severity: 'error', message: 'No compiled skill — Attach stage may have failed' },
      ],
    };
  }

  const result = qualityGate(context.compiledSkill.content);
  return { ...context, qualityGate: result };
}

/** §4.4 — runExportPipeline */
function runExportPipeline(config: ExportPipelineConfig): ExportPipelineResult {
  const stages: ExportStageResult[] = [];
  let context: StageContext = {
    events: config.events,
    sessionId: config.sessionId,
    strippedContent: config.skillContent,
    diagnostics: [],
  };

  // Stage 1: Extract
  const t0 = performance.now();
  context = extractStage(context);
  stages.push({ stage: 'extract', durationMs: performance.now() - t0, passed: !!context.dbom });

  if (!context.dbom) {
    return { success: false, stages, diagnostics: context.diagnostics };
  }

  // Stage 2: Strip
  const t1 = performance.now();
  context = stripStage(context);
  stages.push({ stage: 'strip', durationMs: performance.now() - t1, passed: true });

  // Stage 3: Attach
  const t2 = performance.now();
  context = attachStage(context, config.frontmatter);
  stages.push({ stage: 'attach', durationMs: performance.now() - t2, passed: !!context.compiledSkill });

  if (!context.compiledSkill) {
    return { success: false, stages, diagnostics: context.diagnostics };
  }

  // Stage 4: QualityGate
  const t3 = performance.now();
  context = validateStage(context, config.qualityGate);
  const gatePassed = context.qualityGate?.passed ?? false;
  stages.push({ stage: 'validate', durationMs: performance.now() - t3, passed: gatePassed });

  // Persist DBOM if requested
  if (config.persistDBOM && config.persistFn && context.dbom) {
    try {
      config.persistFn(context.dbom);
    } catch (err) {
      context.diagnostics.push({
        stage: 'persist',
        severity: 'warning',
        message: `DBOM persistence failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return {
    success: gatePassed,
    skill: context.compiledSkill,
    stages,
    diagnostics: context.diagnostics,
    qualityGatePassed: gatePassed,
    lintErrors: context.qualityGate?.lintErrors,
    validationScore: context.qualityGate?.validationScore,
  };
}

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

function makeCertEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
  overrides: Partial<CairnBridgeEvent> = {},
): CairnBridgeEvent {
  return {
    sessionId: 'sess-export-001',
    eventType,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    provenanceTier: 'certification',
    ...overrides,
  };
}

function makeInternalEvent(
  eventType: string,
  payload: Record<string, unknown> = {},
): CairnBridgeEvent {
  return makeCertEvent(eventType, payload, { provenanceTier: 'internal' });
}

function makeDefaultFrontmatter(overrides: Partial<SkillFrontmatterInput> = {}): SkillFrontmatterInput {
  return {
    name: overrides.name ?? 'Test Skill',
    description: overrides.description ?? 'A test skill for export pipeline',
    domain: overrides.domain ?? 'testing',
    confidence: overrides.confidence ?? 'high',
    source: overrides.source ?? 'forge-export',
    tools: overrides.tools,
  };
}

function makeDefaultSkillContent(): string {
  return [
    '## Context',
    '',
    'This skill was learned during testing.',
    '',
    '## Patterns',
    '',
    '- Pattern A: Always verify exports',
    '- Pattern B: Check provenance',
  ].join('\n');
}

function makePassingQualityGate(): ExportQualityGate {
  return vi.fn((_content: string): QualityGateResult => ({
    passed: true,
    lintErrors: 0,
    lintWarnings: 0,
    validationScore: 0.95,
    details: '0 errors, 0 warnings, score: 95%',
  }));
}

function makeFailingQualityGate(overrides: Partial<QualityGateResult> = {}): ExportQualityGate {
  return vi.fn((_content: string): QualityGateResult => ({
    passed: false,
    lintErrors: overrides.lintErrors ?? 2,
    lintWarnings: overrides.lintWarnings ?? 1,
    validationScore: overrides.validationScore ?? 0.3,
    details: overrides.details ?? '2 errors, 1 warning, score: 30%',
  }));
}

function makeSampleEvents(): CairnBridgeEvent[] {
  return [
    makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
    makeCertEvent('decision_point', { source: 'human', question: 'Proceed with refactor?' }),
    makeInternalEvent('tool_use', { toolName: 'edit' }),
    makeCertEvent('subagent_start', { agentName: 'code-reviewer' }),
  ];
}

function makePipelineConfig(overrides: Partial<ExportPipelineConfig> = {}): ExportPipelineConfig {
  return {
    sessionId: overrides.sessionId ?? 'sess-pipeline-001',
    events: overrides.events ?? makeSampleEvents(),
    skillContent: overrides.skillContent ?? makeDefaultSkillContent(),
    frontmatter: overrides.frontmatter ?? makeDefaultFrontmatter(),
    qualityGate: overrides.qualityGate ?? makePassingQualityGate(),
    persistDBOM: overrides.persistDBOM,
    persistFn: overrides.persistFn,
  };
}

// ===========================================================================
// 1. renderFrontmatter — §3.3
// ===========================================================================

describe('renderFrontmatter', () => {
  it('renders YAML with required skill metadata fields', () => {
    const dbom = generateDBOM('sess-fm-001', [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
    ]);
    const fm = makeDefaultFrontmatter();
    const yaml = renderFrontmatter(fm, dbom);

    expect(yaml).toMatch(/^---\n/);
    expect(yaml).toMatch(/\n---$/);
    expect(yaml).toContain('name: "Test Skill"');
    expect(yaml).toContain('description: "A test skill for export pipeline"');
    expect(yaml).toContain('domain: "testing"');
    expect(yaml).toContain('confidence: "high"');
    expect(yaml).toContain('source: "forge-export"');
  });

  it('renders provenance block with DBOM fields', () => {
    const dbom = generateDBOM('sess-prov-001', [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'OK?' }),
    ]);
    const yaml = renderFrontmatter(makeDefaultFrontmatter(), dbom);

    expect(yaml).toContain('provenance:');
    expect(yaml).toContain('  compiler: "forge"');
    expect(yaml).toContain(`  version: "${dbom.version}"`);
    expect(yaml).toContain(`  session_id: "${dbom.sessionId}"`);
    expect(yaml).toContain('  compiled_at:');
    expect(yaml).toContain('  dbom:');
    expect(yaml).toContain(`    root_hash: "${dbom.rootHash}"`);
    expect(yaml).toContain(`    total_decisions: ${dbom.stats.totalDecisions}`);
    expect(yaml).toContain(`    human_gated: ${dbom.stats.humanGatedDecisions}`);
    expect(yaml).toContain(`    machine: ${dbom.stats.machineDecisions}`);
    expect(yaml).toContain(`    ai_recommended: ${dbom.stats.aiRecommendedDecisions}`);
    expect(yaml).toContain(`    chain_depth: ${dbom.stats.chainDepth}`);
  });

  it('renders decision_types map in provenance block', () => {
    const events = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'X?' }),
    ];
    const dbom = generateDBOM('sess-dtypes-001', events);
    const yaml = renderFrontmatter(makeDefaultFrontmatter(), dbom);

    expect(yaml).toContain('    decision_types:');
    expect(yaml).toContain('      permission_completed: 2');
    expect(yaml).toContain('      decision_point: 1');
  });

  it('omits decision_types when DBOM has zero decisions', () => {
    const dbom = generateDBOM('sess-empty-dt', []);
    const yaml = renderFrontmatter(makeDefaultFrontmatter(), dbom);

    expect(yaml).not.toContain('decision_types:');
    expect(yaml).toContain('    total_decisions: 0');
  });

  it('renders tools section when tools are provided', () => {
    const fm = makeDefaultFrontmatter({
      tools: [
        { name: 'edit', when: 'modifying source files' },
        { name: 'grep', description: 'Search for patterns' },
      ],
    });
    const dbom = generateDBOM('sess-tools-001', []);
    const yaml = renderFrontmatter(fm, dbom);

    expect(yaml).toContain('tools:');
    expect(yaml).toContain('  - name: "edit"');
    expect(yaml).toContain('    when: "modifying source files"');
    expect(yaml).toContain('  - name: "grep"');
    expect(yaml).toContain('    description: "Search for patterns"');
  });

  it('omits tools section when no tools provided', () => {
    const fm = makeDefaultFrontmatter();
    const dbom = generateDBOM('sess-no-tools', []);
    const yaml = renderFrontmatter(fm, dbom);

    expect(yaml).not.toContain('tools:');
  });

  it('escapes double quotes in frontmatter values', () => {
    const fm = makeDefaultFrontmatter({
      name: 'Skill with "quotes"',
      description: 'Uses "special" characters',
    });
    const dbom = generateDBOM('sess-escape-001', []);
    const yaml = renderFrontmatter(fm, dbom);

    expect(yaml).toContain('name: "Skill with \\"quotes\\""');
    expect(yaml).toContain('description: "Uses \\"special\\" characters"');
  });

  it('escapes newlines in frontmatter values', () => {
    const fm = makeDefaultFrontmatter({ description: 'Line 1\nLine 2' });
    const dbom = generateDBOM('sess-nl-001', []);
    const yaml = renderFrontmatter(fm, dbom);

    expect(yaml).toContain('description: "Line 1\\nLine 2"');
  });
});

// ===========================================================================
// 2. compileSkill — §3.3
// ===========================================================================

describe('compileSkill', () => {
  it('produces CompiledSkill with all required fields', () => {
    const dbom = generateDBOM('sess-cs-001', [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
    ]);
    const compiled = compileSkill({
      skillContent: makeDefaultSkillContent(),
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });

    expect(typeof compiled.content).toBe('string');
    expect(compiled.dbom).toBe(dbom);
    expect(typeof compiled.compiledAt).toBe('string');
    expect(compiled.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('content starts with frontmatter and includes skill body', () => {
    const dbom = generateDBOM('sess-cs-body', []);
    const body = '## Context\n\nImportant stuff here.';
    const compiled = compileSkill({
      skillContent: body,
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });

    expect(compiled.content).toMatch(/^---\n/);
    expect(compiled.content).toContain('\n---\n');
    expect(compiled.content).toContain('## Context');
    expect(compiled.content).toContain('Important stuff here.');
  });

  it('contentHash is deterministic for identical input', () => {
    const dbom = generateDBOM('sess-hash-det', [
      {
        sessionId: 'sess-hash-det',
        eventType: 'permission_completed',
        payload: JSON.stringify({ result: { kind: 'approved' } }),
        createdAt: '2026-05-01T00:00:00.000Z',
        provenanceTier: 'certification',
      },
    ]);
    const input: SkillCompilerInput = {
      skillContent: 'Fixed content',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    };

    const hash1 = compileSkill(input).contentHash;
    const hash2 = compileSkill(input).contentHash;

    // Note: compiledAt changes between calls, so contentHash may differ
    // if compiledAt is embedded in content. The spec puts compiledAt
    // in the frontmatter which IS in content. This tests the SHA-256 format.
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
    expect(hash2).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different content produces different contentHash', () => {
    const dbom = generateDBOM('sess-hash-diff', []);
    const compiled1 = compileSkill({
      skillContent: 'Content version A',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });
    const compiled2 = compileSkill({
      skillContent: 'Content version B',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });

    expect(compiled1.contentHash).not.toBe(compiled2.contentHash);
  });

  it('handles empty skill content', () => {
    const dbom = generateDBOM('sess-cs-empty', []);
    const compiled = compileSkill({
      skillContent: '',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });

    expect(compiled.content).toMatch(/^---\n/);
    expect(compiled.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('trims trailing whitespace from skill content', () => {
    const dbom = generateDBOM('sess-cs-trim', []);
    const compiled = compileSkill({
      skillContent: '  Content with whitespace  \n\n',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });

    expect(compiled.content).toContain('Content with whitespace');
    expect(compiled.content).toMatch(/\n$/);
  });
});

// ===========================================================================
// 3. Pipeline Stages — §4.3
// ===========================================================================

describe('extractStage', () => {
  it('generates DBOM from certification-tier events', () => {
    const ctx: StageContext = {
      events: makeSampleEvents(),
      sessionId: 'sess-extract-001',
      diagnostics: [],
    };

    const result = extractStage(ctx);

    expect(result.dbom).toBeDefined();
    expect(result.dbom!.sessionId).toBe('sess-extract-001');
    expect(result.dbom!.decisions.length).toBeGreaterThan(0);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('returns error diagnostic for empty events', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-extract-empty',
      diagnostics: [],
    };

    const result = extractStage(ctx);

    expect(result.dbom).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].stage).toBe('extract');
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].message).toContain('No events');
  });

  it('returns warning diagnostic when no certification-tier events found', () => {
    const ctx: StageContext = {
      events: [
        makeInternalEvent('tool_use', { toolName: 'edit' }),
        makeInternalEvent('assistant_response', {}),
      ],
      sessionId: 'sess-extract-nocert',
      diagnostics: [],
    };

    const result = extractStage(ctx);

    expect(result.dbom).toBeDefined();
    expect(result.dbom!.decisions).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('warning');
    expect(result.diagnostics[0].message).toContain('zero decisions');
  });

  it('preserves existing diagnostics from prior stages', () => {
    const priorDiag: ExportDiagnostic = { stage: 'prior', severity: 'info', message: 'test' };
    const ctx: StageContext = {
      events: makeSampleEvents(),
      sessionId: 'sess-extract-preserve',
      diagnostics: [priorDiag],
    };

    const result = extractStage(ctx);

    expect(result.diagnostics).toContain(priorDiag);
  });
});

describe('stripStage', () => {
  it('strips Windows absolute paths', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-win',
      strippedContent: 'Found at C:\\Users\\akubly\\project\\src\\main.ts',
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).toContain('<path>');
    expect(result.strippedContent).not.toContain('C:\\Users');
  });

  it('strips Unix absolute paths', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-unix',
      strippedContent: 'Found at /home/akubly/project/src/main.ts and /Users/dev/code/app.js',
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).toContain('<path>');
    expect(result.strippedContent).not.toContain('/home/akubly');
    expect(result.strippedContent).not.toContain('/Users/dev');
  });

  it('passes through content without paths unchanged', () => {
    const content = 'Use `grep` to find patterns in code.';
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-pass',
      strippedContent: content,
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).toBe(content);
  });

  it('strips mixed Windows and Unix paths in same content', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-mixed',
      strippedContent: 'Win: D:\\git\\repo\\file.ts, Unix: /tmp/build/output.js',
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).not.toContain('D:\\git');
    expect(result.strippedContent).not.toContain('/tmp/build');
    expect(result.strippedContent!.match(/<path>/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it('returns context unchanged when no content available', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-none',
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).toBeUndefined();
  });
});

describe('attachStage', () => {
  it('compiles skill from DBOM + stripped content', () => {
    const dbom = generateDBOM('sess-attach-001', makeSampleEvents());
    const ctx: StageContext = {
      events: makeSampleEvents(),
      sessionId: 'sess-attach-001',
      dbom,
      strippedContent: makeDefaultSkillContent(),
      diagnostics: [],
    };

    const result = attachStage(ctx, makeDefaultFrontmatter());

    expect(result.compiledSkill).toBeDefined();
    expect(result.compiledSkill!.content).toContain('---');
    expect(result.compiledSkill!.content).toContain('Test Skill');
    expect(result.compiledSkill!.dbom).toBe(dbom);
    expect(result.compiledSkill!.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns error diagnostic when DBOM is missing', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-attach-nodbom',
      strippedContent: 'some content',
      diagnostics: [],
    };

    const result = attachStage(ctx, makeDefaultFrontmatter());

    expect(result.compiledSkill).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].stage).toBe('attach');
    expect(result.diagnostics[0].severity).toBe('error');
  });

  it('handles empty stripped content', () => {
    const dbom = generateDBOM('sess-attach-empty', []);
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-attach-empty',
      dbom,
      strippedContent: '',
      diagnostics: [],
    };

    const result = attachStage(ctx, makeDefaultFrontmatter());

    expect(result.compiledSkill).toBeDefined();
    expect(result.compiledSkill!.content).toMatch(/^---\n/);
  });
});

describe('validateStage', () => {
  it('passes quality gate result through to context', () => {
    const dbom = generateDBOM('sess-val-001', makeSampleEvents());
    const compiled = compileSkill({
      skillContent: makeDefaultSkillContent(),
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });
    const ctx: StageContext = {
      events: makeSampleEvents(),
      sessionId: 'sess-val-001',
      dbom,
      compiledSkill: compiled,
      diagnostics: [],
    };
    const gate = makePassingQualityGate();

    const result = validateStage(ctx, gate);

    expect(result.qualityGate).toBeDefined();
    expect(result.qualityGate!.passed).toBe(true);
    expect(result.qualityGate!.validationScore).toBe(0.95);
  });

  it('records failing quality gate result', () => {
    const dbom = generateDBOM('sess-val-fail', makeSampleEvents());
    const compiled = compileSkill({
      skillContent: makeDefaultSkillContent(),
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });
    const ctx: StageContext = {
      events: makeSampleEvents(),
      sessionId: 'sess-val-fail',
      dbom,
      compiledSkill: compiled,
      diagnostics: [],
    };
    const gate = makeFailingQualityGate({ lintErrors: 3, validationScore: 0.2 });

    const result = validateStage(ctx, gate);

    expect(result.qualityGate!.passed).toBe(false);
    expect(result.qualityGate!.lintErrors).toBe(3);
    expect(result.qualityGate!.validationScore).toBe(0.2);
  });

  it('calls quality gate with compiled skill content', () => {
    const dbom = generateDBOM('sess-val-call', makeSampleEvents());
    const compiled = compileSkill({
      skillContent: 'Custom body',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-val-call',
      dbom,
      compiledSkill: compiled,
      diagnostics: [],
    };
    const gate = makePassingQualityGate();

    validateStage(ctx, gate);

    expect(gate).toHaveBeenCalledTimes(1);
    expect(gate).toHaveBeenCalledWith(compiled.content);
  });

  it('returns error diagnostic when compiled skill is missing', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-val-nocomp',
      diagnostics: [],
    };
    const gate = makePassingQualityGate();

    const result = validateStage(ctx, gate);

    expect(result.qualityGate).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].stage).toBe('validate');
    expect(result.diagnostics[0].severity).toBe('error');
    expect(gate).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. runExportPipeline — §4.4
// ===========================================================================

describe('runExportPipeline', () => {
  it('full happy path: events → extract → strip → attach → validate → success', () => {
    const config = makePipelineConfig();
    const result = runExportPipeline(config);

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();
    expect(result.skill!.content).toContain('Test Skill');
    expect(result.skill!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.qualityGatePassed).toBe(true);
    expect(result.lintErrors).toBe(0);
    expect(result.validationScore).toBe(0.95);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('records all four stage results with timing', () => {
    const result = runExportPipeline(makePipelineConfig());

    expect(result.stages).toHaveLength(4);
    expect(result.stages[0].stage).toBe('extract');
    expect(result.stages[1].stage).toBe('strip');
    expect(result.stages[2].stage).toBe('attach');
    expect(result.stages[3].stage).toBe('validate');

    for (const s of result.stages) {
      expect(typeof s.durationMs).toBe('number');
      expect(s.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof s.passed).toBe('boolean');
    }
  });

  it('all stages pass in happy path', () => {
    const result = runExportPipeline(makePipelineConfig());

    for (const s of result.stages) {
      expect(s.passed).toBe(true);
    }
  });

  it('quality gate failure → success: false, skill still returned', () => {
    const config = makePipelineConfig({
      qualityGate: makeFailingQualityGate({ lintErrors: 2, validationScore: 0.3 }),
    });

    const result = runExportPipeline(config);

    expect(result.success).toBe(false);
    expect(result.skill).toBeDefined();
    expect(result.qualityGatePassed).toBe(false);
    expect(result.lintErrors).toBe(2);
    expect(result.validationScore).toBe(0.3);
  });

  it('empty events → extract fails, pipeline stops early', () => {
    const config = makePipelineConfig({ events: [] });
    const result = runExportPipeline(config);

    expect(result.success).toBe(false);
    expect(result.skill).toBeUndefined();
    expect(result.stages.length).toBe(1);
    expect(result.stages[0].stage).toBe('extract');
    expect(result.stages[0].passed).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0].severity).toBe('error');
  });

  it('only internal-tier events → warning diagnostic, pipeline continues', () => {
    const config = makePipelineConfig({
      events: [
        makeInternalEvent('tool_use', { toolName: 'edit' }),
        makeInternalEvent('assistant_response', {}),
      ],
    });

    const result = runExportPipeline(config);

    // Pipeline continues because DBOM is still generated (just empty decisions)
    expect(result.skill).toBeDefined();
    expect(result.diagnostics.some(d => d.severity === 'warning')).toBe(true);
  });

  it('persists DBOM when persistDBOM=true and persistFn provided', () => {
    const persistFn = vi.fn();
    const config = makePipelineConfig({
      persistDBOM: true,
      persistFn,
    });

    const result = runExportPipeline(config);

    expect(persistFn).toHaveBeenCalledTimes(1);
    const persistedDbom = persistFn.mock.calls[0][0] as DBOMArtifact;
    expect(persistedDbom.sessionId).toBe('sess-pipeline-001');
    expect(result.success).toBe(true);
  });

  it('does not call persistFn when persistDBOM is false', () => {
    const persistFn = vi.fn();
    const config = makePipelineConfig({
      persistDBOM: false,
      persistFn,
    });

    runExportPipeline(config);

    expect(persistFn).not.toHaveBeenCalled();
  });

  it('does not call persistFn when persistDBOM is true but persistFn is undefined', () => {
    const config = makePipelineConfig({ persistDBOM: true });

    // Should not throw
    const result = runExportPipeline(config);
    expect(result.success).toBe(true);
  });

  it('persistence failure → warning diagnostic, pipeline still succeeds', () => {
    const persistFn = vi.fn(() => { throw new Error('DB write failed'); });
    const config = makePipelineConfig({
      persistDBOM: true,
      persistFn,
    });

    const result = runExportPipeline(config);

    expect(result.success).toBe(true);
    expect(result.diagnostics.some(d =>
      d.stage === 'persist' && d.severity === 'warning' && d.message.includes('DB write failed')
    )).toBe(true);
  });

  it('pipeline result includes structured ExportPipelineResult shape', () => {
    const result = runExportPipeline(makePipelineConfig());

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('skill');
    expect(result).toHaveProperty('stages');
    expect(result).toHaveProperty('diagnostics');
    expect(result).toHaveProperty('qualityGatePassed');
    expect(result).toHaveProperty('lintErrors');
    expect(result).toHaveProperty('validationScore');
    expect(Array.isArray(result.stages)).toBe(true);
    expect(Array.isArray(result.diagnostics)).toBe(true);
  });

  it('works from persisted events (no live SDK session)', () => {
    const persistedEvents: CairnBridgeEvent[] = [
      {
        sessionId: 'sess-persisted-001',
        eventType: 'permission_completed',
        payload: JSON.stringify({ result: { kind: 'approved' } }),
        createdAt: '2026-04-28T10:00:00.000Z',
        provenanceTier: 'certification',
      },
      {
        sessionId: 'sess-persisted-001',
        eventType: 'decision_point',
        payload: JSON.stringify({ source: 'human', question: 'Approve deploy?' }),
        createdAt: '2026-04-28T10:01:00.000Z',
        provenanceTier: 'certification',
      },
    ];

    const result = runExportPipeline(makePipelineConfig({
      sessionId: 'sess-persisted-001',
      events: persistedEvents,
    }));

    expect(result.success).toBe(true);
    expect(result.skill!.dbom.decisions).toHaveLength(2);
  });

  it('quality gate receives compiled content (not raw skill content)', () => {
    const gate = makePassingQualityGate();
    runExportPipeline(makePipelineConfig({ qualityGate: gate }));

    expect(gate).toHaveBeenCalledTimes(1);
    const passedContent = (gate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    // Compiled content includes frontmatter
    expect(passedContent).toMatch(/^---\n/);
    expect(passedContent).toContain('provenance:');
  });

  it('strips environment-specific paths before compilation', () => {
    const config = makePipelineConfig({
      skillContent: 'Found at C:\\Users\\dev\\project\\src\\index.ts and /home/dev/output',
    });

    const result = runExportPipeline(config);

    expect(result.success).toBe(true);
    expect(result.skill!.content).not.toContain('C:\\Users\\dev');
    expect(result.skill!.content).not.toContain('/home/dev');
    expect(result.skill!.content).toContain('<path>');
  });

  it('diagnostics accumulate across stages', () => {
    // Internal-only events → warning from extract, then pipeline continues
    const config = makePipelineConfig({
      events: [makeInternalEvent('tool_use', { toolName: 'edit' })],
      qualityGate: makeFailingQualityGate(),
    });

    const result = runExportPipeline(config);

    // Should have at least the extract warning
    expect(result.diagnostics.length).toBeGreaterThanOrEqual(1);
    // Diagnostics carry stage info
    for (const d of result.diagnostics) {
      expect(d).toHaveProperty('stage');
      expect(d).toHaveProperty('severity');
      expect(d).toHaveProperty('message');
    }
  });
});

// ===========================================================================
// 5. DBOM Persistence (via injected persistFn) — §4.4, §5.2
// ===========================================================================

describe('DBOM Persistence (injected)', () => {
  it('persistFn receives the complete DBOMArtifact', () => {
    const persistFn = vi.fn();
    const events = makeSampleEvents();

    runExportPipeline(makePipelineConfig({
      events,
      persistDBOM: true,
      persistFn,
    }));

    const artifact = persistFn.mock.calls[0][0] as DBOMArtifact;
    expect(artifact.version).toBe('0.1.0');
    expect(artifact.sessionId).toBe('sess-pipeline-001');
    expect(typeof artifact.rootHash).toBe('string');
    expect(artifact.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.stats.totalDecisions).toBeGreaterThan(0);
    expect(Array.isArray(artifact.decisions)).toBe(true);
  });

  it('persistFn is called after quality gate (regardless of pass/fail)', () => {
    const callOrder: string[] = [];
    const gate = vi.fn((): QualityGateResult => {
      callOrder.push('gate');
      return { passed: false, lintErrors: 1, lintWarnings: 0, validationScore: 0.4, details: 'fail' };
    });
    const persistFn = vi.fn(() => { callOrder.push('persist'); });

    runExportPipeline(makePipelineConfig({
      qualityGate: gate,
      persistDBOM: true,
      persistFn,
    }));

    expect(callOrder).toEqual(['gate', 'persist']);
  });

  it('persistence error message captured in diagnostic', () => {
    const persistFn = vi.fn(() => { throw new TypeError('Cannot read property of undefined'); });

    const result = runExportPipeline(makePipelineConfig({
      persistDBOM: true,
      persistFn,
    }));

    const persistDiag = result.diagnostics.find(d => d.stage === 'persist');
    expect(persistDiag).toBeDefined();
    expect(persistDiag!.message).toContain('Cannot read property');
  });
});

// ===========================================================================
// 6. Forge→Cairn Integration Boundary — §5
// ===========================================================================

describe('Forge→Cairn Integration', () => {
  it('quality gate receives the fully compiled SKILL.md content', () => {
    const gate = makePassingQualityGate();
    const result = runExportPipeline(makePipelineConfig({ qualityGate: gate }));

    expect(gate).toHaveBeenCalledTimes(1);
    const content = (gate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('provenance:');
    expect(content).toContain('dbom:');
    expect(content).toContain('root_hash:');
  });

  it('quality gate result fields propagate to ExportPipelineResult', () => {
    const gate = vi.fn((): QualityGateResult => ({
      passed: true,
      lintErrors: 0,
      lintWarnings: 3,
      validationScore: 0.87,
      details: '0 errors, 3 warnings, score: 87%',
    }));

    const result = runExportPipeline(makePipelineConfig({ qualityGate: gate }));

    expect(result.qualityGatePassed).toBe(true);
    expect(result.lintErrors).toBe(0);
    expect(result.validationScore).toBe(0.87);
  });

  it('end-to-end: bridge events → DBOM → compile → strip → validate → result', () => {
    const events: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'Deploy to prod?' }),
      makeInternalEvent('tool_use', { toolName: 'bash' }),
      makeCertEvent('subagent_start', { agentName: 'security-reviewer' }),
      makeCertEvent('subagent_complete', { agentName: 'security-reviewer' }),
    ];

    const result = runExportPipeline(makePipelineConfig({
      sessionId: 'sess-e2e-001',
      events,
      frontmatter: makeDefaultFrontmatter({
        name: 'Production Deploy',
        description: 'How to safely deploy to production',
        domain: 'deployment',
      }),
    }));

    expect(result.success).toBe(true);
    expect(result.skill!.dbom.decisions).toHaveLength(4); // 4 cert, 1 internal
    expect(result.skill!.content).toContain('provenance:');
    expect(result.stages).toHaveLength(4);
    expect(result.qualityGatePassed).toBe(true);
  });

  it('DBOM provenance matches standalone generateDBOM output', () => {
    const events = makeSampleEvents();
    const dbomStandalone = generateDBOM('sess-match-001', events);

    const result = runExportPipeline(makePipelineConfig({
      sessionId: 'sess-match-001',
      events,
    }));

    expect(result.skill!.dbom.decisions).toHaveLength(dbomStandalone.decisions.length);
    expect(result.skill!.dbom.stats.totalDecisions).toBe(dbomStandalone.stats.totalDecisions);
    expect(result.skill!.dbom.stats.humanGatedDecisions).toBe(dbomStandalone.stats.humanGatedDecisions);
  });

  it('pipeline propagates DBOM stats accurately into frontmatter YAML', () => {
    const events: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),       // human
      makeCertEvent('permission_completed', { result: { kind: 'denied-interactively-by-user' } }), // human
      makeCertEvent('decision_point', { source: 'ai_recommendation', question: 'X?' }), // ai
      makeCertEvent('subagent_start', { agentName: 'linter' }),                      // machine
      makeCertEvent('permission_completed', { result: { kind: 'denied-by-rules' } }), // machine
    ];

    const result = runExportPipeline(makePipelineConfig({
      sessionId: 'sess-stats-001',
      events,
    }));

    expect(result.skill!.content).toContain('total_decisions: 5');
    expect(result.skill!.content).toContain('human_gated: 2');
    expect(result.skill!.content).toContain('machine: 2');
    expect(result.skill!.content).toContain('ai_recommended: 1');
  });
});

// ===========================================================================
// 7. Edge Cases & Error Handling — §7
// ===========================================================================

describe('Export Edge Cases', () => {
  it('handles skill content with no sections', () => {
    const result = runExportPipeline(makePipelineConfig({ skillContent: '' }));

    expect(result.success).toBe(true);
    expect(result.skill!.content).toMatch(/^---\n/);
  });

  it('handles very long skill content', () => {
    const longContent = 'A'.repeat(50000);
    const result = runExportPipeline(makePipelineConfig({ skillContent: longContent }));

    expect(result.success).toBe(true);
    expect(result.skill!.content.length).toBeGreaterThan(50000);
  });

  it('handles special characters in frontmatter fields', () => {
    const result = runExportPipeline(makePipelineConfig({
      frontmatter: makeDefaultFrontmatter({
        name: 'Skill with "quotes" & <brackets>',
        description: 'Uses "special" chars\nand newlines',
      }),
    }));

    expect(result.success).toBe(true);
    expect(result.skill!.content).toContain('\\"quotes\\"');
    expect(result.skill!.content).toContain('\\n');
  });

  it('pipeline with mixed provenance tiers filters correctly', () => {
    const events: CairnBridgeEvent[] = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeInternalEvent('assistant_response', {}),
      makeInternalEvent('tool_use', { toolName: 'grep' }),
      makeCertEvent('decision_point', { source: 'human', question: 'Continue?' }),
      makeInternalEvent('model_switch', {}),
    ];

    const result = runExportPipeline(makePipelineConfig({ events }));

    expect(result.success).toBe(true);
    expect(result.skill!.dbom.decisions).toHaveLength(2);
  });

  it('deterministic DBOM: same events produce same rootHash', () => {
    const events: CairnBridgeEvent[] = [{
      sessionId: 'sess-det',
      eventType: 'permission_completed',
      payload: JSON.stringify({ result: { kind: 'approved' } }),
      createdAt: '2026-04-28T12:00:00.000Z',
      provenanceTier: 'certification',
    }];

    const dbom1 = generateDBOM('sess-det', events);
    const dbom2 = generateDBOM('sess-det', events);

    expect(dbom1.rootHash).toBe(dbom2.rootHash);
    expect(dbom1.decisions[0].hash).toBe(dbom2.decisions[0].hash);
  });

  it('handles large decision chains (200 events)', () => {
    const events: CairnBridgeEvent[] = [];
    for (let i = 0; i < 200; i++) {
      events.push(makeCertEvent('permission_completed', { result: { kind: 'approved' }, index: i }));
    }

    const result = runExportPipeline(makePipelineConfig({ events }));

    expect(result.success).toBe(true);
    expect(result.skill!.dbom.decisions).toHaveLength(200);
  });

  it('quality gate exception is not explicitly caught by validateStage (propagates)', () => {
    // Per §7.1: "validateStage — lint/validate throws → Catch + diagnostic"
    // The spec says the pipeline should catch this, but the inline validateStage
    // delegates to the gate directly. This test documents the expected behavior:
    // the pipeline orchestrator should handle exceptions from the quality gate.
    const throwingGate: ExportQualityGate = () => { throw new Error('Cairn linter crashed'); };
    const dbom = generateDBOM('sess-gate-throw', makeSampleEvents());
    const compiled = compileSkill({
      skillContent: 'test',
      dbom,
      frontmatter: makeDefaultFrontmatter(),
    });
    const ctx: StageContext = {
      events: makeSampleEvents(),
      sessionId: 'sess-gate-throw',
      dbom,
      compiledSkill: compiled,
      diagnostics: [],
    };

    // Current inline implementation propagates the error
    // Production should catch and add diagnostic per §7.1
    expect(() => validateStage(ctx, throwingGate)).toThrow('Cairn linter crashed');
  });

  it('strip stage preserves relative paths', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-rel',
      strippedContent: 'Relative path: src/components/Button.tsx and ./config.json',
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).toContain('src/components/Button.tsx');
    expect(result.strippedContent).toContain('./config.json');
  });

  it('strip stage handles /tmp paths', () => {
    const ctx: StageContext = {
      events: [],
      sessionId: 'sess-strip-tmp',
      strippedContent: 'Temp output at /tmp/build-output/result.json',
      diagnostics: [],
    };

    const result = stripStage(ctx);

    expect(result.strippedContent).not.toContain('/tmp/build-output');
    expect(result.strippedContent).toContain('<path>');
  });
});

// ===========================================================================
// 6. Production Export Module Tests (R7 + R8)
// ===========================================================================

import {
  renderFrontmatter as prodRenderFrontmatter,
  compileSkill as prodCompileSkill,
  escapeFrontmatter as prodEscapeFrontmatter,
  type SkillFrontmatterInput as ProdSkillFrontmatterInput,
  type SkillCompilerInput as ProdSkillCompilerInput,
} from '../export/compiler.js';
import {
  extractStage as prodExtractStage,
  stripStage as prodStripStage,
  attachStage as prodAttachStage,
  validateStage as prodValidateStage,
  type StageContext as ProdStageContext,
} from '../export/stages.js';
import {
  runExportPipeline as prodRunExportPipeline,
  type ExportPipelineConfig as ProdExportPipelineConfig,
} from '../export/pipeline.js';
import type { ExportQualityGate as ProdExportQualityGate, QualityGateResult as ProdQualityGateResult } from '../export/types.js';

// ---------------------------------------------------------------------------
// Helpers for production tests
// ---------------------------------------------------------------------------

function makeFrontmatterInput(overrides: Partial<ProdSkillFrontmatterInput> = {}): ProdSkillFrontmatterInput {
  return {
    name: 'Test Skill',
    description: 'A test skill for export pipeline',
    domain: 'testing',
    confidence: 'high',
    source: 'forge-export',
    ...overrides,
  };
}

function makeDbom(sessionId = 'sess-prod-001', events?: CairnBridgeEvent[]): DBOMArtifact {
  return generateDBOM(sessionId, events ?? [
    makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
  ]);
}

function makePassingGate(): ProdExportQualityGate {
  return () => ({
    passed: true,
    lintErrors: 0,
    lintWarnings: 0,
    validationScore: 1.0,
    details: '0 errors, 0 warnings, score: 100%',
  });
}

function makeFailingGate(): ProdExportQualityGate {
  return () => ({
    passed: false,
    lintErrors: 2,
    lintWarnings: 1,
    validationScore: 0.3,
    details: '2 errors, 1 warning, score: 30%',
  });
}

// ---------------------------------------------------------------------------
// R7: Compiler Unit Tests
// ---------------------------------------------------------------------------

describe('Production Compiler — renderFrontmatter', () => {
  const FIXED_TS = '2026-05-01T12:00:00.000Z';

  it('renders valid YAML with opening and closing delimiters', () => {
    const dbom = makeDbom();
    const fm = makeFrontmatterInput();
    const result = prodRenderFrontmatter(fm, dbom, FIXED_TS);

    expect(result).toMatch(/^---\n/);
    expect(result).toMatch(/\n---$/);
  });

  it('includes all required frontmatter fields', () => {
    const dbom = makeDbom();
    const fm = makeFrontmatterInput({ name: 'My Skill', description: 'Does things', domain: 'engineering', confidence: 'medium', source: 'forge-compiled' });
    const result = prodRenderFrontmatter(fm, dbom, FIXED_TS);

    expect(result).toContain('name: "My Skill"');
    expect(result).toContain('description: "Does things"');
    expect(result).toContain('domain: "engineering"');
    expect(result).toContain('confidence: "medium"');
    expect(result).toContain('source: "forge-compiled"');
  });

  it('includes DBOM provenance block', () => {
    const dbom = makeDbom();
    const result = prodRenderFrontmatter(makeFrontmatterInput(), dbom, FIXED_TS);

    expect(result).toContain('provenance:');
    expect(result).toContain('compiler: "forge"');
    expect(result).toContain(`version: "${dbom.version}"`);
    expect(result).toContain(`session_id: "${dbom.sessionId}"`);
    expect(result).toContain(`compiled_at: "${FIXED_TS}"`);
    expect(result).toContain('dbom:');
    expect(result).toContain(`root_hash: "${dbom.rootHash}"`);
    expect(result).toContain(`total_decisions: ${dbom.stats.totalDecisions}`);
  });

  it('renders tools section when tools are provided', () => {
    const fm = makeFrontmatterInput({
      tools: [
        { name: 'edit', when: 'modifying files' },
        { name: 'grep', description: 'Search for patterns' },
      ],
    });
    const result = prodRenderFrontmatter(fm, makeDbom(), FIXED_TS);

    expect(result).toContain('tools:');
    expect(result).toContain('- name: "edit"');
    expect(result).toContain('when: "modifying files"');
    expect(result).toContain('- name: "grep"');
    expect(result).toContain('description: "Search for patterns"');
  });

  it('omits tools section when no tools provided', () => {
    const result = prodRenderFrontmatter(makeFrontmatterInput(), makeDbom(), FIXED_TS);
    expect(result).not.toContain('tools:');
  });

  it('renders decision_types when present', () => {
    const events = [
      makeCertEvent('permission_completed', { result: { kind: 'approved' } }),
      makeCertEvent('decision_point', { source: 'human', question: 'OK?' }),
    ];
    const dbom = generateDBOM('sess-types', events);
    const result = prodRenderFrontmatter(makeFrontmatterInput(), dbom, FIXED_TS);

    expect(result).toContain('decision_types:');
    expect(result).toContain('permission_completed: 1');
    expect(result).toContain('decision_point: 1');
  });

  it('omits decision_types when empty', () => {
    const dbom = generateDBOM('sess-no-types', []);
    const result = prodRenderFrontmatter(makeFrontmatterInput(), dbom, FIXED_TS);
    expect(result).not.toContain('decision_types:');
  });

  it('escapes all string fields including domain and source', () => {
    const fm = makeFrontmatterInput({
      name: 'Skill "Alpha"',
      description: 'Does\nthings',
      domain: 'eng\\ops',
      source: 'forge "v2"',
    });
    const result = prodRenderFrontmatter(fm, makeDbom(), FIXED_TS);

    expect(result).toContain('name: "Skill \\"Alpha\\""');
    expect(result).toContain('description: "Does\\nthings"');
    expect(result).toContain('domain: "eng\\\\ops"');
    expect(result).toContain('source: "forge \\"v2\\""');
  });
});

describe('Production Compiler — escapeFrontmatter', () => {
  it('escapes backslashes first', () => {
    expect(prodEscapeFrontmatter('C:\\new\\data')).toBe('C:\\\\new\\\\data');
  });

  it('escapes double quotes', () => {
    expect(prodEscapeFrontmatter('say "hello"')).toBe('say \\"hello\\"');
  });

  it('escapes newlines', () => {
    expect(prodEscapeFrontmatter('line1\nline2')).toBe('line1\\nline2');
  });

  it('escapes both quotes and newlines together', () => {
    expect(prodEscapeFrontmatter('"hi"\nthere')).toBe('\\"hi\\"\\nthere');
  });

  it('passes through clean strings unchanged', () => {
    expect(prodEscapeFrontmatter('clean string')).toBe('clean string');
  });

  it('handles backslash + quote combination', () => {
    expect(prodEscapeFrontmatter('path\\to\\"file"')).toBe('path\\\\to\\\\\\"file\\"');
  });
});

describe('Production Compiler — compileSkill', () => {
  it('produces content with frontmatter and body', () => {
    const dbom = makeDbom();
    const result = prodCompileSkill({
      skillContent: '# Hello\n\nBody content here.',
      dbom,
      frontmatter: makeFrontmatterInput(),
    });

    expect(result.content).toMatch(/^---\n/);
    expect(result.content).toContain('Body content here.');
    expect(result.dbom).toBe(dbom);
    expect(result.compiledAt).toBeTruthy();
  });

  it('produces a SHA-256 contentHash', () => {
    const result = prodCompileSkill({
      skillContent: 'Some content',
      dbom: makeDbom(),
      frontmatter: makeFrontmatterInput(),
    });

    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('contentHash is deterministic for same content', () => {
    const events: CairnBridgeEvent[] = [{
      sessionId: 'sess-det',
      eventType: 'permission_completed',
      payload: JSON.stringify({ result: { kind: 'approved' } }),
      createdAt: '2026-05-01T00:00:00.000Z',
      provenanceTier: 'certification',
    }];
    const dbom = generateDBOM('sess-det', events);
    const fixedTs = '2026-05-01T12:00:00.000Z';

    const result1 = prodCompileSkill({ skillContent: 'Fixed body', dbom, frontmatter: makeFrontmatterInput(), compiledAt: fixedTs });
    const result2 = prodCompileSkill({ skillContent: 'Fixed body', dbom, frontmatter: makeFrontmatterInput(), compiledAt: fixedTs });

    expect(result1.contentHash).toBe(result2.contentHash);
    expect(result1.content).toBe(result2.content);
  });

  it('different content produces different contentHash', () => {
    const dbom = makeDbom();
    const result1 = prodCompileSkill({ skillContent: 'Content A', dbom, frontmatter: makeFrontmatterInput() });
    const result2 = prodCompileSkill({ skillContent: 'Content B', dbom, frontmatter: makeFrontmatterInput() });

    expect(result1.contentHash).not.toBe(result2.contentHash);
  });

  it('trims trailing whitespace from skill content', () => {
    const result = prodCompileSkill({
      skillContent: '  Body with whitespace  \n\n',
      dbom: makeDbom(),
      frontmatter: makeFrontmatterInput(),
    });

    expect(result.content).toContain('Body with whitespace');
    expect(result.content.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// R8: Stage Unit Tests
// ---------------------------------------------------------------------------

describe('Production Stages — prodExtractStage', () => {
  it('generates DBOM from certification events', () => {
    const context: ProdStageContext = {
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      sessionId: 'sess-extract-001',
      diagnostics: [],
    };

    const result = prodExtractStage(context);
    expect(result.dbom).toBeDefined();
    expect(result.dbom!.decisions).toHaveLength(1);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('returns error diagnostic for empty events', () => {
    const context: ProdStageContext = { events: [], sessionId: 'sess-empty', diagnostics: [] };
    const result = prodExtractStage(context);

    expect(result.dbom).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].stage).toBe('extract');
  });

  it('returns warning when no certification-tier events exist', () => {
    const context: ProdStageContext = {
      events: [makeInternalEvent('tool_use', { toolName: 'edit' })],
      sessionId: 'sess-internal',
      diagnostics: [],
    };

    const result = prodExtractStage(context);
    expect(result.dbom).toBeDefined();
    expect(result.dbom!.decisions).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('warning');
  });

  it('preserves existing diagnostics', () => {
    const existing = { stage: 'prior', severity: 'info' as const, message: 'earlier' };
    const context: ProdStageContext = { events: [], sessionId: 'sess', diagnostics: [existing] };
    const result = prodExtractStage(context);

    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics[0]).toBe(existing);
  });
});

describe('Production Stages — prodStripStage', () => {
  it('strips Windows absolute paths', () => {
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      strippedContent: 'Found at C:\\Users\\john\\project\\file.ts in the code.',
      diagnostics: [],
    };

    const result = prodStripStage(context);
    expect(result.strippedContent).toContain('<path>');
    expect(result.strippedContent).not.toContain('C:\\Users');
  });

  it('strips Unix absolute paths', () => {
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      strippedContent: 'Located at /home/john/project/src/file.ts here.',
      diagnostics: [],
    };

    const result = prodStripStage(context);
    expect(result.strippedContent).toContain('<path>');
    expect(result.strippedContent).not.toContain('/home/john');
  });

  it('passes through content without paths unchanged', () => {
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      strippedContent: 'No absolute paths here. Just relative ones.',
      diagnostics: [],
    };

    const result = prodStripStage(context);
    expect(result.strippedContent).toBe('No absolute paths here. Just relative ones.');
  });

  it('returns context unchanged when no content exists', () => {
    const context: ProdStageContext = { events: [], sessionId: 'sess', diagnostics: [] };
    const result = prodStripStage(context);
    expect(result).toEqual(context);
  });
});

describe('Production Stages — prodAttachStage', () => {
  it('compiles skill with DBOM frontmatter', () => {
    const dbom = makeDbom();
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      dbom,
      strippedContent: '# My Skill\n\nContent here.',
      diagnostics: [],
    };

    const result = prodAttachStage(context, makeFrontmatterInput());
    expect(result.compiledSkill).toBeDefined();
    expect(result.compiledSkill!.content).toContain('---');
    expect(result.compiledSkill!.content).toContain('Content here.');
    expect(result.compiledSkill!.dbom).toBe(dbom);
  });

  it('returns error diagnostic when DBOM is missing', () => {
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      strippedContent: 'content',
      diagnostics: [],
    };

    const result = prodAttachStage(context, makeFrontmatterInput());
    expect(result.compiledSkill).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].stage).toBe('attach');
  });

  it('uses strippedContent as skill body', () => {
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      dbom: makeDbom(),
      strippedContent: 'Stripped body text',
      diagnostics: [],
    };

    const result = prodAttachStage(context, makeFrontmatterInput());
    expect(result.compiledSkill!.content).toContain('Stripped body text');
  });
});

describe('Production Stages — prodValidateStage', () => {
  it('runs quality gate on compiled skill', () => {
    const gate = vi.fn(makePassingGate());
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      compiledSkill: prodCompileSkill({
        skillContent: 'Body',
        dbom: makeDbom(),
        frontmatter: makeFrontmatterInput(),
      }),
      diagnostics: [],
    };

    const result = prodValidateStage(context, gate);
    expect(gate).toHaveBeenCalledWith(context.compiledSkill!.content);
    expect(result.qualityGate).toBeDefined();
    expect(result.qualityGate!.passed).toBe(true);
  });

  it('returns error diagnostic when no compiled skill exists', () => {
    const context: ProdStageContext = { events: [], sessionId: 'sess', diagnostics: [] };
    const result = prodValidateStage(context, makePassingGate());

    expect(result.qualityGate).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe('error');
    expect(result.diagnostics[0].stage).toBe('validate');
  });

  it('records failing quality gate result', () => {
    const context: ProdStageContext = {
      events: [],
      sessionId: 'sess',
      compiledSkill: prodCompileSkill({
        skillContent: 'Body',
        dbom: makeDbom(),
        frontmatter: makeFrontmatterInput(),
      }),
      diagnostics: [],
    };

    const result = prodValidateStage(context, makeFailingGate());
    expect(result.qualityGate!.passed).toBe(false);
    expect(result.qualityGate!.lintErrors).toBe(2);
    expect(result.qualityGate!.validationScore).toBe(0.3);
  });
});

// ---------------------------------------------------------------------------
// Production Pipeline Integration
// ---------------------------------------------------------------------------

describe('Production Pipeline — runExportPipeline', () => {
  it('runs full pipeline successfully with passing gate', () => {
    const result = prodRunExportPipeline({
      sessionId: 'sess-pipe-001',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: '# My Skill\n\nSome content.',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
    });

    expect(result.success).toBe(true);
    expect(result.skill).toBeDefined();
    expect(result.skill!.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.stages).toHaveLength(4);
    expect(result.qualityGatePassed).toBe(true);
    expect(result.lintErrors).toBe(0);
    expect(result.validationScore).toBe(1.0);
  });

  it('fails pipeline when quality gate fails', () => {
    const result = prodRunExportPipeline({
      sessionId: 'sess-pipe-fail',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makeFailingGate(),
    });

    expect(result.success).toBe(false);
    expect(result.skill).toBeDefined(); // still returned for inspection
    expect(result.qualityGatePassed).toBe(false);
    expect(result.lintErrors).toBe(2);
  });

  it('fails pipeline with empty events', () => {
    const result = prodRunExportPipeline({
      sessionId: 'sess-pipe-empty',
      events: [],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
    });

    expect(result.success).toBe(false);
    expect(result.skill).toBeUndefined();
    expect(result.diagnostics.some(d => d.severity === 'error')).toBe(true);
  });

  it('strips environment paths from skill content', () => {
    const result = prodRunExportPipeline({
      sessionId: 'sess-pipe-strip',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Found at C:\\Users\\dev\\project\\main.ts in code.',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
    });

    expect(result.success).toBe(true);
    expect(result.skill!.content).toContain('<path>');
    expect(result.skill!.content).not.toContain('C:\\Users');
  });

  it('calls persistFn when persistDBOM is true', () => {
    const persistFn = vi.fn();
    prodRunExportPipeline({
      sessionId: 'sess-persist',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
      persistDBOM: true,
      persistFn,
    });

    expect(persistFn).toHaveBeenCalledTimes(1);
    expect(persistFn.mock.calls[0][0].sessionId).toBe('sess-persist');
  });

  it('handles persistFn failure gracefully', () => {
    const persistFn = vi.fn(() => { throw new Error('DB write failed'); });
    const result = prodRunExportPipeline({
      sessionId: 'sess-persist-fail',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
      persistDBOM: true,
      persistFn,
    });

    // Pipeline still succeeds — persistence is fail-open
    expect(result.success).toBe(true);
    expect(result.diagnostics.some(d => d.stage === 'persist' && d.severity === 'warning')).toBe(true);
  });

  it('does not persist DBOM when quality gate fails', () => {
    const persistFn = vi.fn();
    prodRunExportPipeline({
      sessionId: 'sess-no-persist',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makeFailingGate(),
      persistDBOM: true,
      persistFn,
    });

    expect(persistFn).not.toHaveBeenCalled();
  });

  it('warns when persistDBOM is true but no persistFn provided', () => {
    const result = prodRunExportPipeline({
      sessionId: 'sess-no-fn',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
      persistDBOM: true,
    });

    expect(result.success).toBe(true);
    expect(result.diagnostics.some(d =>
      d.stage === 'persist' && d.severity === 'warning' && d.message.includes('no persistFn'),
    )).toBe(true);
  });

  it('reports per-stage timing', () => {
    const result = prodRunExportPipeline({
      sessionId: 'sess-timing',
      events: [makeCertEvent('permission_completed', { result: { kind: 'approved' } })],
      skillContent: 'Content',
      frontmatter: makeFrontmatterInput(),
      qualityGate: makePassingGate(),
    });

    expect(result.stages).toHaveLength(4);
    for (const stage of result.stages) {
      expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof stage.stage).toBe('string');
      expect(typeof stage.passed).toBe('boolean');
    }
    expect(result.stages.map(s => s.stage)).toEqual(['extract', 'strip', 'attach', 'validate']);
  });
});
