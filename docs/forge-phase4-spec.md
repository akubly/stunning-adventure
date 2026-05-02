# Forge Phase 4 Architecture Specification

**Author:** Graham Knight (Lead / Architect)  
**Date:** 2026-05-01  
**Status:** Proposal — awaiting team review  
**Phase boundary rule:** "If it produces a portable artifact, it's Phase 4."

---

## Overview

Phase 4 is the **Export Pipeline** — the third integration seam from the Forge build kickoff. It converts runtime session data (persisted `CairnBridgeEvent`s) into portable artifacts: **certified SKILL.md files** with **DBOM provenance** in YAML frontmatter.

The pipeline is the "linker" in the compiler metaphor. Source code (workflow definitions, decision rules) was compiled by Forge + Cairn through Phases 2–3. Phase 4 emits the object code — portable artifacts that run on vanilla Copilot, everywhere.

**Key constraint:** The export pipeline works offline from persisted events. No live SDK session required. This makes it testable, reproducible, and usable for batch re-export.

---

## 1. Module Design: `packages/forge/src/export/`

### 1.1 File Structure

```
packages/forge/src/export/
├── index.ts              # Barrel exports
├── pipeline.ts           # Export pipeline orchestrator
├── compiler.ts           # SKILL.md compiler (DBOM → frontmatter → markdown)
├── stages.ts             # Individual pipeline stages (extract, strip, attach, validate)
└── types.ts              # Export-local types (not shared)
```

### 1.2 Public API

```typescript
// export/index.ts — Barrel

export {
  runExportPipeline,
  type ExportPipelineConfig,
  type ExportPipelineResult,
  type ExportStageResult,
} from "./pipeline.js";

export {
  compileSkill,
  renderFrontmatter,
  type SkillCompilerInput,
  type CompiledSkill,
} from "./compiler.js";

export {
  extractStage,
  stripStage,
  attachStage,
  validateStage,
  type StageContext,
  type ExportStage,
} from "./stages.js";

export type {
  ExportQualityGate,
  ExportDiagnostic,
  ExportDiagnosticSeverity,
} from "./types.js";
```

### 1.3 Design Decisions

| Decision | Alternative | Rationale |
|----------|-------------|-----------|
| Flat module (4 files) | Nested subdirectories per stage | Only 4 stages with well-defined boundaries. Subdirectories add navigation cost for no composability gain. |
| Pipeline as function, not class | Class-based pipeline with `.addStage()` | Stages are fixed and ordered. Dynamic stage composition is YAGNI — if needed later, the function can wrap a stage list. |
| Stages as pure functions | Stage objects with lifecycle hooks | Each stage is `(context) → context`. No setup/teardown needed. I/O is pushed to the pipeline orchestrator. |
| Export-local types in `types.ts` | Shared types in `@akubly/types` | Only `ExportPipelineResult` crosses module boundaries. New shared types added only when two packages need them. |

---

## 2. DBOM Persistence Schema

### 2.1 New Migration: `010-dbom-artifacts.ts`

```typescript
// packages/cairn/src/db/migrations/010-dbom-artifacts.ts

import type { Migration } from '../schema.js';

export const migration010: Migration = {
  version: 10,
  description: 'DBOM artifact persistence for export pipeline',
  up(db) {
    db.exec(`
      CREATE TABLE dbom_artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '0.1.0',
        root_hash TEXT NOT NULL,
        total_decisions INTEGER NOT NULL,
        human_gated_decisions INTEGER NOT NULL,
        machine_decisions INTEGER NOT NULL,
        ai_recommended_decisions INTEGER NOT NULL,
        chain_depth INTEGER NOT NULL,
        chain_roots INTEGER NOT NULL,
        decision_types TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );

      CREATE TABLE dbom_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dbom_id INTEGER NOT NULL REFERENCES dbom_artifacts(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        hash TEXT NOT NULL,
        parent_hash TEXT,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('human', 'automated_rule', 'ai_recommendation')),
        summary TEXT NOT NULL,
        details TEXT NOT NULL
      );

      CREATE UNIQUE INDEX idx_dbom_session ON dbom_artifacts(session_id);
      CREATE INDEX idx_dbom_root_hash ON dbom_artifacts(root_hash);
      CREATE INDEX idx_dbom_decisions_dbom_id ON dbom_decisions(dbom_id);
      CREATE UNIQUE INDEX idx_dbom_decisions_seq ON dbom_decisions(dbom_id, seq);
    `);
  },
};
```

**Design notes:**

- `dbom_artifacts` stores the flattened `DBOMStats` fields directly (not as JSON blob) for queryability. Decision type counts stored as JSON in `decision_types` since the keys are dynamic.
- `dbom_decisions` stores individual entries with `seq` for ordering. `details` is JSON text.
- `UNIQUE(session_id)` — one DBOM per session. Re-export replaces (delete + re-insert in transaction).
- `ON DELETE CASCADE` on `dbom_decisions` — deleting a DBOM cleans up its decisions.
- No foreign key to `sessions` table — Forge sessions may not exist in Cairn's DB. The `session_id` is a logical reference, not a DB join.

### 2.2 CRUD Interface: `packages/cairn/src/db/dbomArtifacts.ts`

```typescript
// packages/cairn/src/db/dbomArtifacts.ts

import { getDb } from './index.js';
import type { DBOMArtifact, DBOMDecisionEntry } from '@akubly/types';

// ---------------------------------------------------------------------------
// Insert types
// ---------------------------------------------------------------------------

export interface DBOMArtifactInsert {
  sessionId: string;
  version: string;
  rootHash: string;
  stats: {
    totalDecisions: number;
    humanGatedDecisions: number;
    machineDecisions: number;
    aiRecommendedDecisions: number;
    decisionTypes: Record<string, number>;
    chainDepth: number;
    chainRoots: number;
  };
  generatedAt: string;
  decisions: DBOMDecisionEntry[];
}

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface DBOMArtifactRow {
  id: number;
  sessionId: string;
  version: string;
  rootHash: string;
  totalDecisions: number;
  humanGatedDecisions: number;
  machineDecisions: number;
  aiRecommendedDecisions: number;
  chainDepth: number;
  chainRoots: number;
  decisionTypes: Record<string, number>;
  generatedAt: string;
  createdAt: string;
}

export interface DBOMDecisionRow {
  id: number;
  dbomId: number;
  seq: number;
  hash: string;
  parentHash: string | null;
  eventType: string;
  timestamp: string;
  source: string;
  summary: string;
  details: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function mapArtifactRow(row: Record<string, unknown>): DBOMArtifactRow {
  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    version: row.version as string,
    rootHash: row.root_hash as string,
    totalDecisions: row.total_decisions as number,
    humanGatedDecisions: row.human_gated_decisions as number,
    machineDecisions: row.machine_decisions as number,
    aiRecommendedDecisions: row.ai_recommended_decisions as number,
    chainDepth: row.chain_depth as number,
    chainRoots: row.chain_roots as number,
    decisionTypes: JSON.parse(row.decision_types as string) as Record<string, number>,
    generatedAt: row.generated_at as string,
    createdAt: row.created_at as string,
  };
}

function mapDecisionRow(row: Record<string, unknown>): DBOMDecisionRow {
  return {
    id: row.id as number,
    dbomId: row.dbom_id as number,
    seq: row.seq as number,
    hash: row.hash as string,
    parentHash: (row.parent_hash as string | null) ?? null,
    eventType: row.event_type as string,
    timestamp: row.timestamp as string,
    source: row.source as string,
    summary: row.summary as string,
    details: JSON.parse(row.details as string) as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Persist a DBOM artifact. Replaces any existing DBOM for the session. */
export function upsertDBOM(artifact: DBOMArtifactInsert): number {
  const db = getDb();

  const upsertAll = db.transaction(() => {
    // Delete existing DBOM for this session (cascade deletes decisions)
    db.prepare('DELETE FROM dbom_artifacts WHERE session_id = ?')
      .run(artifact.sessionId);

    // Insert artifact
    const res = db.prepare(
      `INSERT INTO dbom_artifacts
         (session_id, version, root_hash, total_decisions, human_gated_decisions,
          machine_decisions, ai_recommended_decisions, chain_depth, chain_roots,
          decision_types, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      artifact.sessionId,
      artifact.version,
      artifact.rootHash,
      artifact.stats.totalDecisions,
      artifact.stats.humanGatedDecisions,
      artifact.stats.machineDecisions,
      artifact.stats.aiRecommendedDecisions,
      artifact.stats.chainDepth,
      artifact.stats.chainRoots,
      JSON.stringify(artifact.stats.decisionTypes),
      artifact.generatedAt,
    );

    const dbomId = Number(res.lastInsertRowid);

    // Insert decisions
    const decStmt = db.prepare(
      `INSERT INTO dbom_decisions
         (dbom_id, seq, hash, parent_hash, event_type, timestamp, source, summary, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (let i = 0; i < artifact.decisions.length; i++) {
      const d = artifact.decisions[i];
      decStmt.run(
        dbomId, i, d.hash, d.parentHash, d.eventType,
        d.timestamp, d.source, d.summary, JSON.stringify(d.details),
      );
    }

    return dbomId;
  });

  return upsertAll();
}

/** Get the DBOM artifact for a session. Returns null if none exists. */
export function getDBOM(sessionId: string): DBOMArtifactRow | null {
  const db = getDb();
  const row = db.prepare(
    'SELECT * FROM dbom_artifacts WHERE session_id = ?'
  ).get(sessionId) as Record<string, unknown> | undefined;
  return row ? mapArtifactRow(row) : null;
}

/** Get the decision entries for a DBOM, ordered by sequence. */
export function getDBOMDecisions(dbomId: number): DBOMDecisionRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM dbom_decisions WHERE dbom_id = ? ORDER BY seq'
  ).all(dbomId) as Array<Record<string, unknown>>;
  return rows.map(mapDecisionRow);
}

/** Reconstruct a full DBOMArtifact from DB rows. */
export function loadDBOMArtifact(sessionId: string): DBOMArtifact | null {
  const artifact = getDBOM(sessionId);
  if (!artifact) return null;

  const decisionRows = getDBOMDecisions(artifact.id);

  return {
    version: artifact.version as '0.1.0',
    sessionId: artifact.sessionId,
    generatedAt: artifact.generatedAt,
    rootHash: artifact.rootHash,
    stats: {
      totalDecisions: artifact.totalDecisions,
      humanGatedDecisions: artifact.humanGatedDecisions,
      machineDecisions: artifact.machineDecisions,
      aiRecommendedDecisions: artifact.aiRecommendedDecisions,
      decisionTypes: artifact.decisionTypes,
      chainDepth: artifact.chainDepth,
      chainRoots: artifact.chainRoots,
    },
    decisions: decisionRows.map((r) => ({
      hash: r.hash,
      parentHash: r.parentHash,
      eventType: r.eventType,
      timestamp: r.timestamp,
      source: r.source as 'human' | 'automated_rule' | 'ai_recommendation',
      summary: r.summary,
      details: r.details,
    })),
  };
}

/** Delete the DBOM for a session. Returns true if a row was deleted. */
export function deleteDBOM(sessionId: string): boolean {
  const db = getDb();
  const res = db.prepare(
    'DELETE FROM dbom_artifacts WHERE session_id = ?'
  ).run(sessionId);
  return res.changes > 0;
}

/** List all DBOM artifacts, most recent first. */
export function listDBOMs(limit?: number): DBOMArtifactRow[] {
  const db = getDb();
  const sql = limit
    ? 'SELECT * FROM dbom_artifacts ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM dbom_artifacts ORDER BY created_at DESC';
  const rows = (limit
    ? db.prepare(sql).all(limit)
    : db.prepare(sql).all()
  ) as Array<Record<string, unknown>>;
  return rows.map(mapArtifactRow);
}
```

### 2.3 Schema Integration

Register migration 010 in `packages/cairn/src/db/schema.ts`:

```typescript
import { migration010 } from './migrations/010-dbom-artifacts.js';

const migrations: Migration[] = [
  migration001, migration002, migration003, migration004,
  migration005, migration006, migration007, migration008,
  migration009, migration010,
];
```

---

## 3. SKILL.md Compiler Design

### 3.1 Input and Output Types

```typescript
// export/compiler.ts

import type { DBOMArtifact } from "@akubly/types";

export interface SkillCompilerInput {
  /** The raw SKILL.md content (body sections). */
  skillContent: string;
  /** The DBOM artifact providing provenance metadata. */
  dbom: DBOMArtifact;
  /** Additional frontmatter fields from the workflow definition. */
  frontmatter: SkillFrontmatterInput;
}

export interface SkillFrontmatterInput {
  name: string;
  description: string;
  domain: string;
  confidence: "low" | "medium" | "high";
  source: string;
  tools?: Array<{ name: string; description?: string; when?: string }>;
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
```

### 3.2 Frontmatter Schema

The compiled SKILL.md includes DBOM provenance in the YAML frontmatter block:

```yaml
---
name: "Skill Name"
description: "What this skill does"
domain: "engineering"
confidence: "high"
source: "forge-compiled"
tools:
  - name: "edit"
    when: "modifying source files"
provenance:
  compiler: "forge"
  version: "0.1.0"
  session_id: "abc-123"
  compiled_at: "2026-05-01T12:00:00.000Z"
  dbom:
    root_hash: "a1b2c3..."
    total_decisions: 12
    human_gated: 3
    machine: 7
    ai_recommended: 2
    chain_depth: 8
    decision_types:
      permission_completed: 5
      decision_point: 3
      plan_changed: 2
      skill_invoked: 2
---
```

### 3.3 Compiler Implementation Sketch

```typescript
// export/compiler.ts

import { createHash } from "node:crypto";
import type { DBOMArtifact } from "@akubly/types";

/**
 * Render the YAML frontmatter block from skill metadata + DBOM provenance.
 * Pure function — no I/O.
 */
export function renderFrontmatter(
  frontmatter: SkillFrontmatterInput,
  dbom: DBOMArtifact,
): string {
  const lines: string[] = ["---"];

  lines.push(`name: "${escapeFrontmatter(frontmatter.name)}"`);
  lines.push(`description: "${escapeFrontmatter(frontmatter.description)}"`);
  lines.push(`domain: "${frontmatter.domain}"`);
  lines.push(`confidence: "${frontmatter.confidence}"`);
  lines.push(`source: "${frontmatter.source}"`);

  if (frontmatter.tools?.length) {
    lines.push("tools:");
    for (const tool of frontmatter.tools) {
      lines.push(`  - name: "${tool.name}"`);
      if (tool.description) lines.push(`    description: "${escapeFrontmatter(tool.description)}"`);
      if (tool.when) lines.push(`    when: "${escapeFrontmatter(tool.when)}"`);
    }
  }

  // DBOM provenance block
  lines.push("provenance:");
  lines.push(`  compiler: "forge"`);
  lines.push(`  version: "${dbom.version}"`);
  lines.push(`  session_id: "${dbom.sessionId}"`);
  lines.push(`  compiled_at: "${new Date().toISOString()}"`);
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

/**
 * Compile a SKILL.md from workflow content + DBOM provenance.
 * Pure function — deterministic output from deterministic input.
 */
export function compileSkill(input: SkillCompilerInput): CompiledSkill {
  const frontmatterBlock = renderFrontmatter(input.frontmatter, input.dbom);
  const content = `${frontmatterBlock}\n\n${input.skillContent.trim()}\n`;
  const contentHash = createHash("sha256").update(content).digest("hex");

  return {
    content,
    dbom: input.dbom,
    compiledAt: new Date().toISOString(),
    contentHash,
  };
}

function escapeFrontmatter(value: string): string {
  return value.replace(/"/g, '\\"').replace(/\n/g, "\\n");
}
```

---

## 4. Export Pipeline Orchestration

### 4.1 Pipeline Stages

The export pipeline has four stages from the kickoff decisions, plus a quality gate:

```
Extract → Strip → Attach → QualityGate → Emit
```

| Stage | Input | Output | Side Effects |
|-------|-------|--------|--------------|
| **Extract** | `CairnBridgeEvent[]` | `DBOMArtifact` | None (pure) |
| **Strip** | `DBOMArtifact` + raw skill | `StrippedSkill` (env-specific bindings removed) | None (pure) |
| **Attach** | `StrippedSkill` + `DBOMArtifact` | `CompiledSkill` (frontmatter attached) | None (pure) |
| **QualityGate** | `CompiledSkill` | `QualityGateResult` (lint + validate) | None (pure, delegates to injected functions) |
| **Emit** | `CompiledSkill` + `QualityGateResult` | `ExportPipelineResult` | DBOM persisted to DB, SKILL.md written to disk |

### 4.2 Stage Context — Threading State Through the Pipeline

```typescript
// export/stages.ts

import type { CairnBridgeEvent, DBOMArtifact } from "@akubly/types";

export interface StageContext {
  /** Source events (input to the pipeline). */
  events: CairnBridgeEvent[];
  /** Session identifier. */
  sessionId: string;
  /** Generated DBOM (populated by Extract stage). */
  dbom?: DBOMArtifact;
  /** Skill content after environment stripping (populated by Strip stage). */
  strippedContent?: string;
  /** Compiled skill with frontmatter (populated by Attach stage). */
  compiledSkill?: CompiledSkill;
  /** Quality gate results (populated by QualityGate stage). */
  qualityGate?: QualityGateResult;
  /** Diagnostics accumulated across all stages. */
  diagnostics: ExportDiagnostic[];
}

export type ExportStage = (context: StageContext) => StageContext;
```

### 4.3 Stage Implementations

```typescript
// export/stages.ts

import { generateDBOM } from "../dbom/index.js";
import { compileSkill, renderFrontmatter } from "./compiler.js";
import type { ExportDiagnostic, ExportQualityGate } from "./types.js";

/**
 * Extract stage: Generate DBOM from certification-tier events.
 * Pure — delegates to the existing generateDBOM().
 */
export function extractStage(context: StageContext): StageContext {
  if (context.events.length === 0) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: "extract", severity: "error", message: "No events provided" },
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
        {
          stage: "extract",
          severity: "warning",
          message: "No certification-tier events found — DBOM has zero decisions",
        },
      ],
    };
  }

  return { ...context, dbom };
}

/**
 * Strip stage: Remove environment-specific bindings from skill content.
 *
 * Strips:
 *   - Absolute file paths → relative placeholders
 *   - Machine-specific usernames/hostnames
 *   - Session-specific IDs in body text (not frontmatter)
 *
 * Conservative: only strips patterns we can identify deterministically.
 */
export function stripStage(context: StageContext): StageContext {
  if (!context.compiledSkill && !context.strippedContent) {
    // No content to strip — pass the raw skill content through
    return context;
  }

  const content = context.strippedContent ?? context.compiledSkill?.content ?? "";

  // Strip absolute Windows/Unix paths
  let stripped = content.replace(
    /[A-Z]:\\(?:[\w.-]+\\)+[\w.-]+/g,
    "<path>"
  );
  stripped = stripped.replace(
    /\/(?:home|Users|tmp)\/[\w.-]+(?:\/[\w.-]+)*/g,
    "<path>"
  );

  return { ...context, strippedContent: stripped };
}

/**
 * Attach stage: Compile SKILL.md with DBOM frontmatter.
 * Requires dbom and strippedContent from prior stages.
 */
export function attachStage(
  context: StageContext,
  frontmatter: SkillFrontmatterInput,
): StageContext {
  if (!context.dbom) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: "attach", severity: "error", message: "No DBOM available — Extract stage may have failed" },
      ],
    };
  }

  const compiled = compileSkill({
    skillContent: context.strippedContent ?? "",
    dbom: context.dbom,
    frontmatter,
  });

  return { ...context, compiledSkill: compiled };
}

/**
 * Validate stage: Run quality gates on the compiled skill.
 * Accepts injected lint/validate functions to avoid importing @akubly/cairn.
 */
export function validateStage(
  context: StageContext,
  qualityGate: ExportQualityGate,
): StageContext {
  if (!context.compiledSkill) {
    return {
      ...context,
      diagnostics: [
        ...context.diagnostics,
        { stage: "validate", severity: "error", message: "No compiled skill — Attach stage may have failed" },
      ],
    };
  }

  const result = qualityGate(context.compiledSkill.content);
  return { ...context, qualityGate: result };
}
```

### 4.4 Pipeline Orchestrator

```typescript
// export/pipeline.ts

import type { CairnBridgeEvent } from "@akubly/types";
import type { ExportQualityGate, ExportDiagnostic } from "./types.js";
import type { CompiledSkill, SkillFrontmatterInput } from "./compiler.js";
import {
  extractStage,
  stripStage,
  attachStage,
  validateStage,
  type StageContext,
} from "./stages.js";

export interface ExportPipelineConfig {
  /** Session ID for DBOM generation. */
  sessionId: string;
  /** Persisted bridge events from the session. */
  events: CairnBridgeEvent[];
  /** Raw SKILL.md body content (sections, not frontmatter). */
  skillContent: string;
  /** Frontmatter fields for the compiled skill. */
  frontmatter: SkillFrontmatterInput;
  /** Injected quality gate (lint + validate). See §5 for integration pattern. */
  qualityGate: ExportQualityGate;
  /** Optional: persist DBOM to Cairn's DB. Default: false. */
  persistDBOM?: boolean;
  /** Injected DBOM persistence function (avoids direct Cairn import). */
  persistFn?: (artifact: import("@akubly/types").DBOMArtifact) => void;
}

export interface ExportStageResult {
  stage: string;
  durationMs: number;
  passed: boolean;
}

export interface ExportPipelineResult {
  /** Whether the pipeline completed successfully. */
  success: boolean;
  /** The compiled skill, if pipeline succeeded. */
  skill?: CompiledSkill;
  /** Per-stage timing and pass/fail. */
  stages: ExportStageResult[];
  /** All diagnostics accumulated during the pipeline. */
  diagnostics: ExportDiagnostic[];
  /** Quality gate summary, if validate stage ran. */
  qualityGatePassed?: boolean;
  /** Lint error count (from quality gate). */
  lintErrors?: number;
  /** Validation score (0.0–1.0, from quality gate). */
  validationScore?: number;
}

/**
 * Run the full export pipeline.
 *
 * Stages: Extract → Strip → Attach → QualityGate
 *
 * Each stage is a pure function that transforms a StageContext.
 * I/O (DBOM persistence, file writes) happens after all stages pass.
 *
 * Quality gate failures are soft by default — the compiled skill is
 * still returned with diagnostics, but `success` is false and
 * `qualityGatePassed` is false.
 */
export function runExportPipeline(config: ExportPipelineConfig): ExportPipelineResult {
  const stages: ExportStageResult[] = [];
  let context: StageContext = {
    events: config.events,
    sessionId: config.sessionId,
    strippedContent: config.skillContent,
    diagnostics: [],
  };

  // Stage 1: Extract
  const t0 = Date.now();
  context = extractStage(context);
  stages.push({
    stage: "extract",
    durationMs: Date.now() - t0,
    passed: !!context.dbom,
  });

  if (!context.dbom) {
    return {
      success: false,
      stages,
      diagnostics: context.diagnostics,
    };
  }

  // Stage 2: Strip
  const t1 = Date.now();
  context = stripStage(context);
  stages.push({
    stage: "strip",
    durationMs: Date.now() - t1,
    passed: true,
  });

  // Stage 3: Attach
  const t2 = Date.now();
  context = attachStage(context, config.frontmatter);
  stages.push({
    stage: "attach",
    durationMs: Date.now() - t2,
    passed: !!context.compiledSkill,
  });

  if (!context.compiledSkill) {
    return {
      success: false,
      stages,
      diagnostics: context.diagnostics,
    };
  }

  // Stage 4: QualityGate
  const t3 = Date.now();
  context = validateStage(context, config.qualityGate);
  const gatePassed = context.qualityGate?.passed ?? false;
  stages.push({
    stage: "validate",
    durationMs: Date.now() - t3,
    passed: gatePassed,
  });

  // Persist DBOM if requested and pipeline succeeded
  if (config.persistDBOM && config.persistFn && context.dbom) {
    try {
      config.persistFn(context.dbom);
    } catch (err) {
      context.diagnostics.push({
        stage: "persist",
        severity: "warning",
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
```

### 4.5 Export-Local Types

```typescript
// export/types.ts

export type ExportDiagnosticSeverity = "error" | "warning" | "info";

export interface ExportDiagnostic {
  stage: string;
  severity: ExportDiagnosticSeverity;
  message: string;
}

export interface QualityGateResult {
  passed: boolean;
  lintErrors: number;
  lintWarnings: number;
  validationScore: number;
  details: string;
}

/**
 * Quality gate function signature.
 * Takes compiled SKILL.md content, returns quality assessment.
 * Injected by the caller — Forge never imports @akubly/cairn.
 */
export type ExportQualityGate = (skillContent: string) => QualityGateResult;
```

---

## 5. Integration Seams — Forge ↔ Cairn

### 5.1 The Cross-Package Boundary Problem

Forge must never import from `@akubly/cairn` directly. But the export pipeline needs Cairn's linter and validator. Solution: **dependency injection at the call site**.

### 5.2 Quality Gate Factory Pattern

The consumer (likely a Cairn MCP tool or CLI command) wires Cairn's functions into Forge's pipeline:

```typescript
// Example: wiring in a Cairn MCP tool or CLI entry point

import { parseSkill, lintSkill, validateSkill } from "@akubly/cairn";
import { runExportPipeline } from "@akubly/forge";
import { upsertDBOM } from "@akubly/cairn/db/dbomArtifacts";
import type { ExportQualityGate, QualityGateResult } from "@akubly/forge";
import type { DBOMArtifact } from "@akubly/types";

// Build the quality gate from Cairn's functions
function createCairnQualityGate(): ExportQualityGate {
  return (skillContent: string): QualityGateResult => {
    const parsed = parseSkill(skillContent);
    const lintResults = lintSkill(parsed);
    const validationResults = validateSkill(parsed);

    const lintErrors = lintResults.filter((r) => r.severity === "error").length;
    const lintWarnings = lintResults.filter((r) => r.severity === "warning").length;

    const avgScore = validationResults.length > 0
      ? validationResults.reduce((s, r) => s + r.score, 0) / validationResults.length
      : 1.0;

    return {
      passed: lintErrors === 0 && avgScore >= 0.5,
      lintErrors,
      lintWarnings,
      validationScore: avgScore,
      details: `${lintErrors} errors, ${lintWarnings} warnings, score: ${Math.round(avgScore * 100)}%`,
    };
  };
}

// Build the DBOM persistence function
function createDBOMPersister(): (artifact: DBOMArtifact) => void {
  return (artifact: DBOMArtifact) => {
    upsertDBOM({
      sessionId: artifact.sessionId,
      version: artifact.version,
      rootHash: artifact.rootHash,
      stats: artifact.stats,
      generatedAt: artifact.generatedAt,
      decisions: artifact.decisions,
    });
  };
}

// Usage
const result = runExportPipeline({
  sessionId: "session-abc",
  events: persistedEvents,
  skillContent: rawSkillBody,
  frontmatter: {
    name: "My Workflow Skill",
    description: "Automates code review",
    domain: "engineering",
    confidence: "high",
    source: "forge-compiled",
  },
  qualityGate: createCairnQualityGate(),
  persistDBOM: true,
  persistFn: createDBOMPersister(),
});
```

### 5.3 Why Injection, Not a Shared Interface

| Approach | Pro | Con |
|----------|-----|-----|
| Shared `QualityGate` interface in `@akubly/types` | Formal contract | Adds coupling for one call site. Interface churn if lint/validate signatures change. |
| Function type in Forge (chosen) | Forge defines what it needs, Cairn satisfies it. No shared type needed. | Caller must know how to wire. |
| Direct import | Simplest code | Violates the "Forge never imports Cairn" constraint. Circular dependency risk. |

The injection pattern is consistent with Phase 3's approach (e.g., `createModelCatalog(listFn)`) and keeps the dependency graph acyclic: `types ← cairn`, `types ← forge`, never `forge ← cairn`.

---

## 6. New Types for `@akubly/types`

### 6.1 Assessment: What Needs Sharing?

| Type | Location | Shared? | Rationale |
|------|----------|---------|-----------|
| `ExportPipelineResult` | `forge/export/types.ts` | **No** | Only Forge produces it. Consumers get it via return value. |
| `ExportQualityGate` | `forge/export/types.ts` | **No** | Function type — Forge defines, caller satisfies. |
| `CompiledSkill` | `forge/export/compiler.ts` | **No** | Forge-internal artifact. Consumers use the `.content` string. |
| `ExportDiagnostic` | `forge/export/types.ts` | **No** | Internal pipeline telemetry. |
| `SkillFrontmatterInput` | `forge/export/compiler.ts` | **No** | Forge-internal input shape. |
| `DBOMArtifactInsert` | `cairn/db/dbomArtifacts.ts` | **No** | Cairn-internal DB type. |

**Decision: No new shared types.** All Phase 4 types stay package-internal. The cross-package contract remains `DBOMArtifact` + `CairnBridgeEvent` (both already in `@akubly/types`). The `ExportQualityGate` function type is defined in Forge — Cairn satisfies it without importing it.

This continues the Phase 3 precedent (ADR-P3-004): types only graduate to shared when two packages actually import them.

---

## 7. Error Handling Strategy

### 7.1 Error Handling Matrix

| Component | Error Type | Strategy | Rationale |
|-----------|-----------|----------|-----------|
| `extractStage` — no events | Expected | Diagnostic + early return | Empty session = nothing to export |
| `extractStage` — no cert events | Expected | Warning diagnostic, empty DBOM | Session may have only internal-tier events |
| `stripStage` — regex failure | Unexpected | Let propagate | Regex on valid UTF-8 shouldn't fail; if it does, it's a bug |
| `attachStage` — missing DBOM | Expected | Diagnostic + early return | Prior stage failed |
| `validateStage` — lint/validate throws | Possible | Catch + diagnostic | Injected function may throw; pipeline should degrade gracefully |
| `persistFn` — DB write fails | Possible | Catch + warning diagnostic | Persistence is optional; pipeline result still valid |
| `compileSkill` — hash computation | Unexpected | Let propagate | `createHash('sha256')` is built-in; failure indicates system issue |

### 7.2 Fail-Open vs Fail-Closed

| Concern | Behavior |
|---------|----------|
| **Quality gate fails** | **Fail-closed** — `success: false`. Compiled skill is still returned (for inspection), but the result signals failure. Caller decides whether to write to disk. |
| **DBOM persistence fails** | **Fail-open** — Warning diagnostic, pipeline continues. The compiled skill is valid regardless of persistence. |
| **Strip stage** | **Fail-open** — If stripping produces unexpected results, skill still compiles. Strip errors are warnings. |
| **Empty DBOM (zero decisions)** | **Fail-open** — Warning diagnostic, pipeline continues with empty provenance. A skill with no decisions is still a valid skill. |

### 7.3 Design Principle

The pipeline is split into **control-plane** (quality gate → fail-closed) and **data-plane** (DBOM persistence, telemetry → fail-open). This matches the established pattern from Phases 2–3: observability must not kill execution, but quality signals must be trustworthy.

---

## 8. Test Strategy

### 8.1 Unit Tests

| Test Area | Count (est.) | What's Tested |
|-----------|-------------|---------------|
| `compiler.ts` — `renderFrontmatter()` | 6–8 | Correct YAML output, escaping, empty fields, tools section, provenance block |
| `compiler.ts` — `compileSkill()` | 4–5 | Full compilation, content hash determinism, empty content edge case |
| `stages.ts` — `extractStage()` | 5–6 | Normal events, empty events, no cert-tier events, event ordering |
| `stages.ts` — `stripStage()` | 4–5 | Windows paths, Unix paths, no paths (passthrough), mixed content |
| `stages.ts` — `attachStage()` | 3–4 | Normal flow, missing DBOM, empty content |
| `stages.ts` — `validateStage()` | 4–5 | Passing gate, failing gate, throwing gate, missing compiled skill |

**Total unit tests: ~26–33**

### 8.2 Integration Tests

| Test Area | Count (est.) | What's Tested |
|-----------|-------------|---------------|
| `pipeline.ts` — full pipeline | 4–5 | Happy path, empty events, quality gate failure, persistence success/failure |
| Quality gate wiring | 2–3 | Cairn linter/validator injected correctly, error isolation |
| DBOM persistence round-trip | 3–4 | Insert → load → compare, upsert (replace), delete |
| SKILL.md round-trip | 2–3 | Compile → parse (with Cairn parser) → validate structure |

**Total integration tests: ~11–15**

### 8.3 Test Infrastructure Reuse

- **Event fixtures:** Reuse existing `createMockBridgeEvent()` helpers from Phase 2 tests.
- **DBOM fixtures:** The existing `generateDBOM()` is already tested (Phase 2). Export tests feed its output to the pipeline.
- **Quality gate mock:** Simple function returning `QualityGateResult` — no Cairn dependency in Forge tests.
- **DB tests:** Use `:memory:` SQLite (existing pattern from `skillTestResults` tests).

### 8.4 What We Do NOT Test in Phase 4

- Cairn linter/validator correctness — already tested in Cairn's test suite (35+ tests).
- DBOM generation correctness — already tested in Phase 2 (18 tests).
- SDK integration — Phase 3's responsibility. Export pipeline works from persisted events.

---

## 9. Work Decomposition

### Alexander (SDK/Runtime Dev) — owns DBOM persistence

| ID | Item | Description | Est. |
|----|------|-------------|------|
| A1 | `010-dbom-artifacts.ts` | Migration: `dbom_artifacts` + `dbom_decisions` tables | S |
| A2 | `db/dbomArtifacts.ts` | CRUD: upsert, get, load, delete, list | M |
| A3 | `db/schema.ts` update | Register migration010 | XS |
| A4 | Unit tests: DBOM CRUD | Insert, load round-trip, upsert replace, delete, list | M |

### Roger (Platform Dev) — owns export pipeline

| ID | Item | Description | Est. |
|----|------|-------------|------|
| R1 | `export/types.ts` | ExportDiagnostic, QualityGateResult, ExportQualityGate | XS |
| R2 | `export/compiler.ts` | renderFrontmatter, compileSkill, escapeFrontmatter | M |
| R3 | `export/stages.ts` | extractStage, stripStage, attachStage, validateStage | M |
| R4 | `export/pipeline.ts` | runExportPipeline orchestrator | M |
| R5 | `export/index.ts` | Barrel exports | XS |
| R6 | Update `src/index.ts` | Add export/ to Forge barrel | XS |
| R7 | Unit tests: compiler | Frontmatter rendering, compilation, escaping | M |
| R8 | Unit tests: stages | Each stage independently with mock contexts | M |

### Laura (Tester) — integration + cross-package validation

| ID | Item | Description | Est. |
|----|------|-------------|------|
| L1 | Integration test: full pipeline | End-to-end with mock quality gate | M |
| L2 | Integration test: quality gate wiring | Cairn linter/validator as injected gate | M |
| L3 | Integration test: DBOM round-trip | Generate → persist → load → compare equality | S |
| L4 | Integration test: SKILL.md round-trip | Compile → parse with Cairn → verify structure | S |
| L5 | Integration test: error paths | Empty events, gate failure, persistence failure | M |

---

## 10. Dependency Graph

```
                    ┌──────────────────┐
                    │  R1: Export Types │
                    └────────┬─────────┘
                             │ blocks
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       R2: Compiler    R3: Stages     A1: Migration
              │              │              │
              └──────┬───────┘              ▼
                     ▼              A2: DBOM CRUD
              R4: Pipeline                  │
                     │                      ▼
              R5+R6: Barrels         A3: Schema reg
                     │                      │
                     └──────────┬───────────┘
                                ▼
                        L1–L5: Integration
```

### Parallelism

| Wave | Items | Notes |
|------|-------|-------|
| **Wave 1** (parallel) | R1, A1 | Types and migration — zero dependencies |
| **Wave 2** (parallel, after Wave 1) | R2, R3, A2, A3 | Compiler + stages need types. CRUD needs migration. |
| **Wave 3** (parallel, after Wave 2) | R4, R7, R8, A4 | Pipeline needs compiler + stages. Unit tests need implementations. |
| **Wave 4** (after Wave 3) | R5, R6 | Barrels need all modules |
| **Wave 5** (after Wave 4) | L1–L5 | Integration tests need everything |

**Critical path:** R1 → R2/R3 → R4 → R5 → L1. The pipeline orchestrator is the integration point.

**Estimated total:** 2–3 days (matches kickoff estimate).

---

## 11. Architecture Decision Records

### ADR-P4-001: Pipeline stages as pure functions, not a plugin architecture

**Decision:** The four pipeline stages (extract, strip, attach, validate) are fixed pure functions composed by `runExportPipeline()`. No dynamic stage registration.

**Alternatives considered:**
1. **Plugin-based stage pipeline** — `pipeline.addStage(myStage)` with arbitrary stage insertion. Flexible, but the stages are fundamentally ordered (can't validate before attaching). Adds complexity for no current use case.
2. **Middleware pattern** (Express/Koa-style) — elegant for HTTP, but pipeline stages have different input/output shapes. Type safety would require generics gymnastics.
3. **Fixed function composition (chosen)** — four stages, always in order. Each is independently testable. Adding a stage means adding to `runExportPipeline()`.

**Trade-off:** If we need a 5th stage (e.g., "sign"), we modify `runExportPipeline()`. Cost: one function. Benefit: type-safe, obvious control flow, zero abstraction overhead.

---

### ADR-P4-002: Quality gate as injected function, not shared interface

**Decision:** `ExportQualityGate` is a function type `(content: string) => QualityGateResult` defined in Forge. Cairn satisfies it at the call site without importing from Forge.

**Alternatives considered:**
1. **Shared interface in `@akubly/types`** — formal contract, but only one call site exists. Interface churn if lint/validate evolve.
2. **Direct Cairn import** — simplest, but creates `forge → cairn` dependency edge. Violates "Forge never imports Cairn" constraint.
3. **Injected function (chosen)** — Forge defines what it needs. Caller wires Cairn's functions. Consistent with `createModelCatalog(listFn)` pattern from Phase 3.

**Trade-off:** Caller must assemble the gate. One factory function (`createCairnQualityGate()`) in the integration layer handles this.

---

### ADR-P4-003: DBOM persistence uses upsert (replace) semantics

**Decision:** `upsertDBOM()` deletes any existing DBOM for the session before inserting the new one. One DBOM per session, always.

**Alternatives considered:**
1. **Versioned DBOMs** — keep history of re-exports per session. Useful for audit, but adds query complexity and storage growth with no current consumer.
2. **Append-only** — never delete, use latest-by-timestamp queries. Simple writes, complex reads.
3. **Upsert/replace (chosen)** — one DBOM per session. Re-export replaces. Simplest queries, smallest storage.

**Trade-off:** Lose DBOM edit history. If needed later, add a `dbom_artifact_history` table. Cost: one migration. Current need: zero.

---

### ADR-P4-004: Quality gate failure is soft (fail-closed but non-blocking)

**Decision:** When the quality gate fails, `runExportPipeline()` returns `success: false` but still includes the compiled skill in the result. The caller decides whether to write to disk.

**Alternatives considered:**
1. **Hard failure** — return `skill: undefined` on gate failure. Prevents any downstream use, but caller loses the ability to inspect what failed.
2. **Soft failure (chosen)** — result includes the skill + diagnostics + `qualityGatePassed: false`. Caller can still write (with warnings) or abort.
3. **Configurable strictness** — `strict: true` = hard, `strict: false` = soft. Adds a knob nobody will use correctly.

**Trade-off:** Caller must check `success` before writing to disk. One `if` statement. Benefit: inspectable failures, no information loss.

---

### ADR-P4-005: No new shared types in `@akubly/types`

**Decision:** Phase 4 types stay package-internal. No additions to the shared type contract.

**Alternatives considered:**
1. **Share `ExportPipelineResult`** — Cairn might want to inspect export results. But Cairn interacts via function injection, not type import. Results flow through return values.
2. **Share `QualityGateResult`** — both Forge and Cairn touch it. But Forge defines it and Cairn satisfies it without importing the type (structural typing).
3. **Keep internal (chosen)** — consistent with ADR-P3-004. Types graduate when two packages actually import them.

**Trade-off:** Same as Phase 3 — if cross-package type sharing is needed later, cost is one PR.

---

## Appendix A: File Layout

```
packages/forge/src/
├── bridge/           # Phase 2 ✓
│   └── index.ts
├── hooks/            # Phase 2 ✓
│   └── index.ts
├── decisions/        # Phase 2 ✓
│   └── index.ts
├── dbom/             # Phase 2 ✓
│   └── index.ts
├── session/          # Phase 2 ✓
│   └── index.ts
├── runtime/          # Phase 3 ✓
│   ├── index.ts
│   ├── client.ts
│   └── session.ts
├── models/           # Phase 3 ✓
│   ├── index.ts
│   ├── catalog.ts
│   ├── token-tracker.ts
│   └── strategy.ts
├── export/           # Phase 4 — NEW
│   ├── index.ts      # Barrel
│   ├── types.ts      # ExportDiagnostic, QualityGateResult, ExportQualityGate
│   ├── compiler.ts   # renderFrontmatter, compileSkill
│   ├── stages.ts     # extractStage, stripStage, attachStage, validateStage
│   └── pipeline.ts   # runExportPipeline
├── __tests__/
│   ├── helpers/      # Phases 2–3 helpers
│   ├── export/       # Phase 4 unit tests (R7, R8)
│   └── integration/  # Phase 4 integration tests (L1–L5)
├── types.ts          # Phase 2 ✓ (SDK mirrors)
└── index.ts          # Barrel (updated)

packages/cairn/src/db/
├── migrations/
│   ├── 001-initial.ts         ... 009-skill-test-results.ts  ✓
│   └── 010-dbom-artifacts.ts  # Phase 4 — NEW
├── dbomArtifacts.ts           # Phase 4 — NEW (CRUD)
├── schema.ts                  # Updated: register migration010
└── ...existing CRUD modules
```

## Appendix B: Updated `packages/forge/src/index.ts` Barrel

```typescript
// Add to existing barrel:

// --- Export Pipeline (Phase 4) ---
export {
  runExportPipeline,
  compileSkill,
  renderFrontmatter,
  extractStage,
  stripStage,
  attachStage,
  validateStage,
  type ExportPipelineConfig,
  type ExportPipelineResult,
  type ExportStageResult,
  type SkillCompilerInput,
  type CompiledSkill,
  type SkillFrontmatterInput,
  type StageContext,
  type ExportStage,
  type ExportQualityGate,
  type ExportDiagnostic,
  type ExportDiagnosticSeverity,
  type QualityGateResult,
} from "./export/index.js";
```

## Appendix C: Pipeline Stage Contract Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                     runExportPipeline()                         │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────────┐ │
│  │ Extract  │──▶│  Strip   │──▶│  Attach  │──▶│ QualityGate │ │
│  │          │   │          │   │          │   │             │ │
│  │ events → │   │ content →│   │ DBOM +   │   │ compiled →  │ │
│  │ DBOM     │   │ stripped │   │ content →│   │ gate result │ │
│  │          │   │ content  │   │ compiled │   │             │ │
│  └──────────┘   └──────────┘   └──────────┘   └─────────────┘ │
│       ↑                             ↑               ↑          │
│       │                             │               │          │
│  generateDBOM()              compileSkill()   injected fn()    │
│  (forge/dbom)                (forge/export)   (cairn wiring)   │
│                                                                 │
│  Post-pipeline (I/O):                                          │
│    - persistFn(dbom) — optional, injected                      │
│    - Caller writes skill.content to disk                       │
└─────────────────────────────────────────────────────────────────┘
```
