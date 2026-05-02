/**
 * SKILL.md Compiler — renders DBOM provenance into YAML frontmatter
 * and produces a compiled skill artifact with a deterministic content hash.
 *
 * Pure functions — no I/O, no side effects.
 */

import { createHash } from "node:crypto";
import type { DBOMArtifact } from "@akubly/types";

// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

export interface SkillFrontmatterInput {
  name: string;
  description: string;
  domain: string;
  confidence: "low" | "medium" | "high";
  source: string;
  tools?: Array<{ name: string; description?: string; when?: string }>;
}

export interface SkillCompilerInput {
  /** The raw SKILL.md content (body sections). */
  skillContent: string;
  /** The DBOM artifact providing provenance metadata. */
  dbom: DBOMArtifact;
  /** Additional frontmatter fields from the workflow definition. */
  frontmatter: SkillFrontmatterInput;
  /** Optional: override the compilation timestamp (ISO-8601). If omitted, uses current time. */
  compiledAt?: string;
}

export interface CompiledSkill {
  /** The full SKILL.md content with DBOM frontmatter. */
  content: string;
  /** The DBOM artifact used for provenance (for downstream persistence). */
  dbom: DBOMArtifact;
  /** Metadata about the compilation. */
  compiledAt: string;
  /** SHA-256 hash of the emitted content. */
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Frontmatter Rendering
// ---------------------------------------------------------------------------

/** Escape characters that have special meaning in YAML double-quoted scalars. */
export function escapeFrontmatter(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Render the YAML frontmatter block from skill metadata + DBOM provenance.
 * Pure function — no I/O.
 */
export function renderFrontmatter(
  frontmatter: SkillFrontmatterInput,
  dbom: DBOMArtifact,
  compiledAt: string,
): string {
  const q = (v: string) => `"${escapeFrontmatter(v)}"`;
  const lines: string[] = ["---"];

  lines.push(`name: ${q(frontmatter.name)}`);
  lines.push(`description: ${q(frontmatter.description)}`);
  lines.push(`domain: ${q(frontmatter.domain)}`);
  lines.push(`confidence: ${q(frontmatter.confidence)}`);
  lines.push(`source: ${q(frontmatter.source)}`);

  if (frontmatter.tools?.length) {
    lines.push("tools:");
    for (const tool of frontmatter.tools) {
      lines.push(`  - name: ${q(tool.name)}`);
      if (tool.description) lines.push(`    description: ${q(tool.description)}`);
      if (tool.when) lines.push(`    when: ${q(tool.when)}`);
    }
  }

  // DBOM provenance block
  lines.push("provenance:");
  lines.push(`  compiler: "forge"`);
  lines.push(`  version: "${dbom.version}"`);
  lines.push(`  session_id: "${dbom.sessionId}"`);
  lines.push(`  compiled_at: "${compiledAt}"`);
  lines.push("  dbom:");
  lines.push(`    root_hash: "${dbom.rootHash}"`);
  lines.push(`    total_decisions: ${dbom.stats.totalDecisions}`);
  lines.push(`    human_gated: ${dbom.stats.humanGatedDecisions}`);
  lines.push(`    machine: ${dbom.stats.machineDecisions}`);
  lines.push(`    ai_recommended: ${dbom.stats.aiRecommendedDecisions}`);
  lines.push(`    chain_depth: ${dbom.stats.chainDepth}`);
  if (Object.keys(dbom.stats.decisionTypes).length > 0) {
    lines.push("    decision_types:");
    for (const [type, count] of Object.entries(dbom.stats.decisionTypes)) {
      lines.push(`      ${type}: ${count}`);
    }
  }

  lines.push("---");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Skill Compilation
// ---------------------------------------------------------------------------

/**
 * Compile a SKILL.md from workflow content + DBOM provenance.
 * Pure function — deterministic output from deterministic input.
 */
export function compileSkill(input: SkillCompilerInput): CompiledSkill {
  const compiledAt = input.compiledAt ?? new Date().toISOString();
  const frontmatterBlock = renderFrontmatter(input.frontmatter, input.dbom, compiledAt);
  const content = `${frontmatterBlock}\n\n${input.skillContent.trim()}\n`;
  const contentHash = createHash("sha256").update(content).digest("hex");

  return {
    content,
    dbom: input.dbom,
    compiledAt,
    contentHash,
  };
}
