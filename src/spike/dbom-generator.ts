/**
 * SPIKE CODE — Experimental, not for production use.
 *
 * Decision Bill of Materials (DBOM) Generator: Produces an auditable
 * provenance artifact from certification-tier events captured during
 * an agentic session.
 *
 * A DBOM is the portable proof of what happened during a workflow run:
 *   - Which decisions were made (human-gated vs machine-automated)
 *   - What the decision chain looked like (linked via hashes)
 *   - What tools were approved/denied and by whom
 *   - A root hash that cryptographically seals the chain
 *
 * The DBOM is embedded as YAML frontmatter in compiled SKILL.md files,
 * making every deployed artifact traceable back to the session that
 * created it.
 *
 * This is the "proof of concept for the export pipeline" — demonstrating
 * that the event data is rich enough for artifact provenance.
 *
 * SIMULATED: Hashing uses a deterministic scheme for spike reproducibility.
 * In production, use SHA-256 over canonical JSON.
 */

import { createHash } from "node:crypto";

import type { CairnEvent, ProvenanceTier } from "./event-bridge.js";

// ---------------------------------------------------------------------------
// DBOM Core Types
// ---------------------------------------------------------------------------

/** Classification of a decision's source. */
type DecisionSource = "human" | "automated_rule" | "ai_recommendation";

/**
 * A single decision entry in the DBOM.
 * Each entry records one decision-relevant event with its hash
 * and link to its parent in the decision chain.
 */
interface DBOMDecisionEntry {
  /** SHA-256 hash of this decision's canonical content */
  hash: string;
  /** Hash of the parent decision (null for chain roots) */
  parentHash: string | null;
  /** Cairn event type */
  eventType: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Who/what made the decision */
  source: DecisionSource;
  /** Human-readable summary of what was decided */
  summary: string;
  /** Structured decision payload */
  details: Record<string, unknown>;
}

/**
 * Aggregate statistics for the DBOM.
 */
interface DBOMStats {
  totalDecisions: number;
  humanGatedDecisions: number;
  machineDecisions: number;
  aiRecommendedDecisions: number;
  decisionTypes: Record<string, number>;
  chainDepth: number;
  chainRoots: number;
}

/**
 * The complete DBOM artifact.
 */
interface DBOMArtifact {
  /** DBOM format version */
  version: "0.1.0";
  /** Session that produced this DBOM */
  sessionId: string;
  /** When the DBOM was generated */
  generatedAt: string;
  /** Root hash sealing the entire chain */
  rootHash: string;
  /** Aggregate statistics */
  stats: DBOMStats;
  /** Ordered decision entries */
  decisions: DBOMDecisionEntry[];
}

// ---------------------------------------------------------------------------
// Hash Computation
// ---------------------------------------------------------------------------

/**
 * REAL: Computes SHA-256 hash of a decision's canonical content.
 * The canonical form is deterministic JSON (sorted keys) of the
 * decision-relevant fields plus the parent hash.
 *
 * This creates a Merkle-like chain: each decision's hash includes
 * its parent hash, so tampering with any decision invalidates
 * all downstream hashes.
 */
function computeDecisionHash(
  eventType: string,
  timestamp: string,
  details: Record<string, unknown>,
  parentHash: string | null,
): string {
  const canonical = JSON.stringify(
    { eventType, timestamp, details, parentHash },
    Object.keys({ eventType, timestamp, details, parentHash }).sort(),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Computes the root hash from all decision hashes.
 * This is the single value that seals the entire DBOM.
 */
function computeRootHash(decisionHashes: string[]): string {
  const combined = decisionHashes.join(":");
  return createHash("sha256").update(combined).digest("hex");
}

// ---------------------------------------------------------------------------
// Decision Source Classification
// ---------------------------------------------------------------------------

/**
 * REAL: Classifies the source of a decision based on the event type
 * and payload content.
 *
 * Rules:
 *   - permission_completed with "approved"/"denied-interactively-by-user" → human
 *   - permission_completed with "denied-by-rules" → automated_rule
 *   - decision_point with source: "human" → human
 *   - decision_point with source: "automated_rule" → automated_rule
 *   - Everything else certification-tier → automated_rule (conservative default)
 */
function classifyDecisionSource(
  eventType: string,
  payload: Record<string, unknown>,
): DecisionSource {
  if (eventType === "permission_completed") {
    const result = payload.result as Record<string, unknown> | undefined;
    const kind = result?.kind as string | undefined;
    if (kind === "approved" || kind === "denied-interactively-by-user") {
      return "human";
    }
    if (kind === "denied-by-rules" || kind === "denied-by-content-exclusion-policy") {
      return "automated_rule";
    }
  }

  if (eventType === "decision_point") {
    const source = payload.source as string | undefined;
    if (source === "human") return "human";
    if (source === "ai_recommendation") return "ai_recommendation";
    return "automated_rule";
  }

  // Subagent delegation and plan changes are machine decisions
  if (
    eventType === "subagent_start" ||
    eventType === "subagent_complete" ||
    eventType === "subagent_failed" ||
    eventType === "plan_changed" ||
    eventType === "skill_invoked"
  ) {
    return "automated_rule";
  }

  // Permission requests are observations, not decisions
  if (eventType === "permission_requested") {
    return "automated_rule";
  }

  // Errors and rewinds — system-initiated
  if (eventType === "error" || eventType === "snapshot_rewind") {
    return "automated_rule";
  }

  return "automated_rule";
}

/**
 * Generate a human-readable summary for a decision event.
 */
function summarizeDecision(
  eventType: string,
  payload: Record<string, unknown>,
): string {
  switch (eventType) {
    case "permission_requested": {
      const kind = payload.kind as string | undefined;
      const tool = payload.toolName as string | undefined;
      return `Permission requested: ${kind ?? "unknown"}${tool ? ` (${tool})` : ""}`;
    }
    case "permission_completed": {
      const result = payload.result as Record<string, unknown> | undefined;
      return `Permission ${result?.kind ?? "resolved"}`;
    }
    case "decision_point": {
      const question = payload.question as string | undefined;
      const chosen = payload.chosen as string | undefined;
      return `Decision: ${question ?? "unknown"} → ${chosen ?? "unresolved"}`;
    }
    case "plan_changed":
      return "Workflow plan modified";
    case "subagent_start": {
      const name = payload.agentName as string | undefined;
      return `Subagent delegated: ${name ?? "unknown"}`;
    }
    case "subagent_complete": {
      const name = payload.agentName as string | undefined;
      return `Subagent completed: ${name ?? "unknown"}`;
    }
    case "subagent_failed": {
      const name = payload.agentName as string | undefined;
      return `Subagent failed: ${name ?? "unknown"}`;
    }
    case "skill_invoked": {
      const skill = payload.skillName as string | undefined;
      return `Skill invoked: ${skill ?? "unknown"}`;
    }
    case "error": {
      const msg = payload.message as string | undefined;
      return `Error: ${msg?.slice(0, 80) ?? "unknown"}`;
    }
    case "snapshot_rewind":
      return "Session state rewound to snapshot";
    default:
      return `${eventType} event`;
  }
}

// ---------------------------------------------------------------------------
// DBOM Generator
// ---------------------------------------------------------------------------

/**
 * REAL: Generates a DBOM artifact from a collection of CairnEvents.
 *
 * Steps:
 *   1. Filter to certification-tier events only
 *   2. Parse payloads and classify decision sources
 *   3. Build the hash chain (each hash includes parent hash)
 *   4. Compute aggregate statistics
 *   5. Compute root hash sealing the chain
 *   6. Return the complete DBOM artifact
 */
function generateDBOM(
  sessionId: string,
  events: CairnEvent[],
): DBOMArtifact {
  // Step 1: Filter to certification tier
  const certEvents = events.filter((e) => e.provenanceTier === "certification");

  // Step 2-3: Build decision entries with hash chain
  const decisions: DBOMDecisionEntry[] = [];
  let previousHash: string | null = null;

  for (const event of certEvents) {
    const payload = JSON.parse(event.payload) as Record<string, unknown>;
    const source = classifyDecisionSource(event.event_type, payload);
    const hash = computeDecisionHash(
      event.event_type,
      event.created_at,
      payload,
      previousHash,
    );

    decisions.push({
      hash,
      parentHash: previousHash,
      eventType: event.event_type,
      timestamp: event.created_at,
      source,
      summary: summarizeDecision(event.event_type, payload),
      details: payload,
    });

    previousHash = hash;
  }

  // Step 4: Compute statistics
  const stats = computeStats(decisions);

  // Step 5: Root hash
  const rootHash = computeRootHash(decisions.map((d) => d.hash));

  return {
    version: "0.1.0",
    sessionId,
    generatedAt: new Date().toISOString(),
    rootHash,
    stats,
    decisions,
  };
}

function computeStats(decisions: DBOMDecisionEntry[]): DBOMStats {
  const typeCounts: Record<string, number> = {};
  let humanGated = 0;
  let machine = 0;
  let aiRecommended = 0;
  let chainRoots = 0;
  let maxDepth = 0;

  for (const d of decisions) {
    typeCounts[d.eventType] = (typeCounts[d.eventType] ?? 0) + 1;

    switch (d.source) {
      case "human":
        humanGated++;
        break;
      case "ai_recommendation":
        aiRecommended++;
        break;
      case "automated_rule":
        machine++;
        break;
    }

    if (!d.parentHash) {
      chainRoots++;
    }
  }

  // Compute chain depth (longest chain from any root)
  let currentDepth = 0;
  for (const d of decisions) {
    if (!d.parentHash) {
      currentDepth = 1;
    } else {
      currentDepth++;
    }
    if (currentDepth > maxDepth) {
      maxDepth = currentDepth;
    }
  }

  return {
    totalDecisions: decisions.length,
    humanGatedDecisions: humanGated,
    machineDecisions: machine,
    aiRecommendedDecisions: aiRecommended,
    decisionTypes: typeCounts,
    chainDepth: maxDepth,
    chainRoots,
  };
}

// ---------------------------------------------------------------------------
// YAML Frontmatter Generator
// ---------------------------------------------------------------------------

/**
 * REAL: Generates the DBOM YAML frontmatter block that would be embedded
 * in a compiled SKILL.md artifact.
 *
 * This is the portable provenance record:
 *   - Skill consumers can verify the root hash
 *   - Auditors can trace every decision back to its session
 *   - PGO systems can correlate deployed performance with decision patterns
 *
 * Format follows YAML frontmatter convention (---delimited block at file top).
 */
function generateDBOMFrontmatter(dbom: DBOMArtifact): string {
  const lines: string[] = [
    "---",
    "# Decision Bill of Materials (DBOM)",
    "# Auto-generated — do not edit manually",
    `dbom_version: "${dbom.version}"`,
    `session_id: "${dbom.sessionId}"`,
    `generated_at: "${dbom.generatedAt}"`,
    `root_hash: "${dbom.rootHash}"`,
    "",
    "# Decision Statistics",
    `total_decisions: ${dbom.stats.totalDecisions}`,
    `human_gated: ${dbom.stats.humanGatedDecisions}`,
    `machine_automated: ${dbom.stats.machineDecisions}`,
    `ai_recommended: ${dbom.stats.aiRecommendedDecisions}`,
    `chain_depth: ${dbom.stats.chainDepth}`,
    `chain_roots: ${dbom.stats.chainRoots}`,
    "",
    "# Decision Type Breakdown",
    "decision_types:",
  ];

  for (const [type, count] of Object.entries(dbom.stats.decisionTypes)) {
    lines.push(`  ${type}: ${count}`);
  }

  lines.push(
    "",
    "# Provenance Chain (hash → parent_hash)",
    "provenance_chain:",
  );

  for (const decision of dbom.decisions) {
    lines.push(`  - hash: "${decision.hash.slice(0, 16)}..."  # truncated for readability`);
    lines.push(`    parent: ${decision.parentHash ? `"${decision.parentHash.slice(0, 16)}..."` : "null  # chain root"}`);
    lines.push(`    type: "${decision.eventType}"`);
    lines.push(`    source: "${decision.source}"`);
    lines.push(`    summary: "${decision.summary}"`);
    lines.push(`    timestamp: "${decision.timestamp}"`);
  }

  lines.push("---");

  return lines.join("\n");
}

/**
 * Generates a complete compiled SKILL.md with DBOM frontmatter.
 * This is the final artifact shape for the Forge export pipeline.
 */
function generateCompiledSkill(
  skillName: string,
  skillContent: string,
  dbom: DBOMArtifact,
): string {
  const frontmatter = generateDBOMFrontmatter(dbom);
  return `${frontmatter}\n\n${skillContent}`;
}

// ---------------------------------------------------------------------------
// Demo: Generate a DBOM from the smoke test events
// ---------------------------------------------------------------------------

/**
 * Demonstrates DBOM generation using simulated events.
 * Shows the full pipeline: events → DBOM → YAML frontmatter → compiled skill.
 */
function dbomDemo(): DBOMDemoResult {
  // Import smoke test events (simulated)
  // In production, these come from Cairn's event_log query
  const { createSimulatedEventStream, SimulatedCairnStore } = require("./e2e-smoke-test.js") as {
    createSimulatedEventStream: () => Array<{ id: string; type: string; timestamp: string; parentId: string | null; data: Record<string, unknown> }>;
    SimulatedCairnStore: new () => { logEvent: (e: CairnEvent) => void; getAll: () => CairnEvent[] };
  };
  const { bridgeEvent: bridge } = require("./event-bridge.js") as {
    bridgeEvent: (sessionId: string, event: unknown) => CairnEvent | null;
  };

  const sessionId = "dbom-demo-session";
  const events = createSimulatedEventStream();
  const store = new SimulatedCairnStore();

  // Bridge events through to Cairn format
  for (const event of events) {
    const cairnEvent = bridge(sessionId, event);
    if (cairnEvent) {
      store.logEvent(cairnEvent);
    }
  }

  // Generate DBOM from stored events
  const dbom = generateDBOM(sessionId, store.getAll());
  const frontmatter = generateDBOMFrontmatter(dbom);

  // Generate a sample compiled skill
  const sampleSkillContent = [
    "# Code Review Checklist",
    "",
    "## Context",
    "This skill was generated during a supervised agentic session.",
    "All decisions in this skill's creation are recorded in the DBOM above.",
    "",
    "## Patterns",
    "- Check for null safety violations",
    "- Verify error handling completeness",
    "- Ensure test coverage for new code paths",
  ].join("\n");

  const compiledSkill = generateCompiledSkill(
    "code-review-checklist",
    sampleSkillContent,
    dbom,
  );

  return {
    dbom,
    frontmatter,
    compiledSkill,
    validation: {
      hasRootHash: dbom.rootHash.length === 64,
      hasDecisions: dbom.decisions.length > 0,
      hashChainIntact: validateHashChain(dbom),
      allDecisionsClassified: dbom.decisions.every(
        (d) => ["human", "automated_rule", "ai_recommendation"].includes(d.source),
      ),
      frontmatterValid: frontmatter.startsWith("---") && frontmatter.endsWith("---"),
    },
  };
}

interface DBOMDemoResult {
  dbom: DBOMArtifact;
  frontmatter: string;
  compiledSkill: string;
  validation: {
    hasRootHash: boolean;
    hasDecisions: boolean;
    hashChainIntact: boolean;
    allDecisionsClassified: boolean;
    frontmatterValid: boolean;
  };
}

// ---------------------------------------------------------------------------
// Hash Chain Validation
// ---------------------------------------------------------------------------

/**
 * REAL: Validates that the hash chain is intact — each decision's hash
 * correctly includes its parent hash, and recomputing produces the same value.
 */
function validateHashChain(dbom: DBOMArtifact): boolean {
  for (const decision of dbom.decisions) {
    const recomputed = computeDecisionHash(
      decision.eventType,
      decision.timestamp,
      decision.details,
      decision.parentHash,
    );
    if (recomputed !== decision.hash) {
      return false;
    }
  }

  // Verify root hash
  const recomputedRoot = computeRootHash(dbom.decisions.map((d) => d.hash));
  return recomputedRoot === dbom.rootHash;
}

// ---------------------------------------------------------------------------
// Human-readable report
// ---------------------------------------------------------------------------

function formatDBOMReport(result: DBOMDemoResult): string {
  const { dbom, validation } = result;
  const lines: string[] = [
    "═══════════════════════════════════════════════════════════",
    "  DBOM GENERATOR — Decision Bill of Materials",
    "═══════════════════════════════════════════════════════════",
    "",
    `  Session:        ${dbom.sessionId}`,
    `  Generated:      ${dbom.generatedAt}`,
    `  Root Hash:      ${dbom.rootHash.slice(0, 32)}...`,
    `  DBOM Version:   ${dbom.version}`,
    "",
    "  STATISTICS",
    `  Total decisions:       ${dbom.stats.totalDecisions}`,
    `  Human-gated:           ${dbom.stats.humanGatedDecisions}`,
    `  Machine-automated:     ${dbom.stats.machineDecisions}`,
    `  AI-recommended:        ${dbom.stats.aiRecommendedDecisions}`,
    `  Chain depth:           ${dbom.stats.chainDepth}`,
    `  Chain roots:           ${dbom.stats.chainRoots}`,
    "",
    "  DECISION CHAIN",
  ];

  for (const d of dbom.decisions) {
    const hashShort = d.hash.slice(0, 12);
    const parentShort = d.parentHash ? d.parentHash.slice(0, 12) : "ROOT";
    lines.push(`    ${hashShort}... ← ${parentShort}  [${d.source}] ${d.summary}`);
  }

  lines.push(
    "",
    "  VALIDATION",
    `    Root hash present:       ${validation.hasRootHash ? "✅" : "❌"}`,
    `    Decisions present:       ${validation.hasDecisions ? "✅" : "❌"}`,
    `    Hash chain intact:       ${validation.hashChainIntact ? "✅" : "❌"}`,
    `    All decisions classified: ${validation.allDecisionsClassified ? "✅" : "❌"}`,
    `    Frontmatter valid:       ${validation.frontmatterValid ? "✅" : "❌"}`,
    "",
    "═══════════════════════════════════════════════════════════",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  generateDBOM,
  generateDBOMFrontmatter,
  generateCompiledSkill,
  validateHashChain,
  computeDecisionHash,
  computeRootHash,
  classifyDecisionSource,
  summarizeDecision,
  dbomDemo,
  formatDBOMReport,
  type DBOMArtifact,
  type DBOMDecisionEntry,
  type DBOMStats,
  type DecisionSource,
  type DBOMDemoResult,
};
