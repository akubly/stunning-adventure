/**
 * DBOM (Decision Bill of Materials) Generator
 *
 * Produces an auditable provenance artifact from certification-tier events.
 * Pure data processing — no SDK dependency, no side effects.
 *
 * Promoted from spike: packages/cairn/src/spike/dbom-generator.ts
 */

import { createHash } from "node:crypto";

import type {
  CairnBridgeEvent,
  DBOMArtifact,
  DBOMDecisionEntry,
  DBOMStats,
  DecisionSource,
} from "@akubly/types";

// ---------------------------------------------------------------------------
// Canonical JSON — deterministic serialisation with recursively sorted keys
// ---------------------------------------------------------------------------

function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalStringify(obj[k]))
      .join(",") +
    "}"
  );
}

// ---------------------------------------------------------------------------
// Hash Computation
// ---------------------------------------------------------------------------

/**
 * Computes SHA-256 hash of a decision's canonical content.
 *
 * The canonical form is deterministic JSON (recursively sorted keys) of
 * the decision-relevant fields plus the parent hash. This creates a
 * Merkle-like chain: each hash includes its parent, so tampering with
 * any entry invalidates all downstream hashes.
 */
export function computeDecisionHash(
  eventType: string,
  timestamp: string,
  details: Record<string, unknown>,
  parentHash: string | null,
): string {
  const canonical = canonicalStringify({
    eventType,
    timestamp,
    details,
    parentHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Computes the root hash from all decision hashes.
 * This single value seals the entire DBOM chain.
 */
export function computeRootHash(decisionHashes: string[]): string {
  const combined = decisionHashes.join(":");
  return createHash("sha256").update(combined).digest("hex");
}

// ---------------------------------------------------------------------------
// Decision Source Classification
// ---------------------------------------------------------------------------

/**
 * Classifies the source of a decision based on event type and payload.
 *
 * Rules:
 *   - permission_completed with "approved"/"denied-interactively-by-user" → human
 *   - permission_completed with "denied-by-rules"/"denied-by-content-exclusion-policy" → automated_rule
 *   - decision_point with source field → mapped directly
 *   - Subagent events, plan changes, skill invocations → automated_rule
 *   - Default: automated_rule (conservative)
 */
export function classifyDecisionSource(
  eventType: string,
  payload: Record<string, unknown>,
): DecisionSource {
  if (eventType === "permission_completed") {
    const result = payload.result as Record<string, unknown> | undefined;
    const kind = result?.kind as string | undefined;
    if (kind === "approved" || kind === "denied-interactively-by-user") {
      return "human";
    }
    if (
      kind === "denied-by-rules" ||
      kind === "denied-by-content-exclusion-policy"
    ) {
      return "automated_rule";
    }
  }

  if (eventType === "decision_point") {
    const source = payload.source as string | undefined;
    if (source === "human") return "human";
    if (source === "ai_recommendation") return "ai_recommendation";
    return "automated_rule";
  }

  if (
    eventType === "subagent_start" ||
    eventType === "subagent_complete" ||
    eventType === "subagent_failed" ||
    eventType === "plan_changed" ||
    eventType === "skill_invoked"
  ) {
    return "automated_rule";
  }

  if (eventType === "permission_requested") {
    return "automated_rule";
  }

  if (eventType === "error" || eventType === "snapshot_rewind") {
    return "automated_rule";
  }

  return "automated_rule";
}

// ---------------------------------------------------------------------------
// Decision Summarisation
// ---------------------------------------------------------------------------

/** Generate a human-readable summary for a decision event. */
export function summarizeDecision(
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
// Statistics
// ---------------------------------------------------------------------------

/** Compute aggregate statistics from decision entries. */
export function computeStats(decisions: DBOMDecisionEntry[]): DBOMStats {
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

  // Chain depth: longest chain from any root
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
// DBOM Generator
// ---------------------------------------------------------------------------

/**
 * Generates a DBOM artifact from certification-tier bridge events.
 *
 * Steps:
 *   1. Filter to certification-tier events
 *   2. Parse payloads, classify decision sources
 *   3. Build SHA-256 hash chain (each hash includes parent)
 *   4. Compute aggregate statistics
 *   5. Compute root hash sealing the chain
 *   6. Return the complete DBOMArtifact
 */
export function generateDBOM(
  sessionId: string,
  events: CairnBridgeEvent[],
): DBOMArtifact {
  // Step 1: Filter to certification tier
  const certEvents = events.filter(
    (e) => e.provenanceTier === "certification",
  );

  // Step 2-3: Build decision entries with hash chain
  const decisions: DBOMDecisionEntry[] = [];
  let previousHash: string | null = null;

  for (const event of certEvents) {
    const payload = JSON.parse(event.payload) as Record<string, unknown>;
    const source = classifyDecisionSource(event.eventType, payload);
    const hash = computeDecisionHash(
      event.eventType,
      event.createdAt,
      payload,
      previousHash,
    );

    decisions.push({
      hash,
      parentHash: previousHash,
      eventType: event.eventType,
      timestamp: event.createdAt,
      source,
      summary: summarizeDecision(event.eventType, payload),
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
