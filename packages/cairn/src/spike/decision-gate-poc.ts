/**
 * SPIKE CODE — Experimental, not for production use.
 *
 * Proof-of-concept: Decision gates (human-in-the-loop checkpoints).
 * Answers Q3 (Decision Gates) from the spike scope.
 *
 * KEY FINDINGS:
 *   1. The SDK supports decision gates through THREE complementary mechanisms:
 *      a. `onPreToolUse` hook with `permissionDecision: "deny"` — synchronous blocking
 *      b. `onPreToolUse` hook with `permissionDecision: "ask"` — defer to permission handler
 *      c. `session.ui.confirm()` / `session.ui.elicitation()` — interactive prompts
 *
 *   2. The most powerful pattern is (b): return `permissionDecision: "ask"` from
 *      the pre-tool hook, which triggers the `onPermissionRequest` handler.
 *      This is the SDK's NATIVE decision gate mechanism.
 *
 *   3. For structured decision recording, use `elicitation.requested` events.
 *      These support form schemas, so we can present options/alternatives.
 *
 *   4. `permission.requested` / `permission.completed` events fire automatically
 *      and include rich context (tool name, args, diffs for writes, commands for shell).
 *
 *   5. Decision gates CAN inject approval flow without forking the SDK.
 *      The hook + permission handler pattern is exactly what we need.
 *
 * NOTE: This code compiles against SDK types but requires a running Copilot
 * CLI process to execute.
 */

import {
  CopilotClient,
  CopilotSession,
  approveAll,
  type SessionConfig,
  type SessionEvent,
  type PermissionHandler,
  type PermissionRequest,
  type PermissionRequestResult,
  type ElicitationHandler,
  type ElicitationContext,
  type ElicitationResult,
} from "@github/copilot-sdk";

// Mirror internal types not re-exported from SDK index
type SessionHooks = NonNullable<SessionConfig["hooks"]>;

interface PreToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
}

interface PreToolUseHookOutput {
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  modifiedArgs?: unknown;
  additionalContext?: string;
  suppressOutput?: boolean;
}

// ---------------------------------------------------------------------------
// Decision Record — The core data model for recording decisions
// ---------------------------------------------------------------------------

/**
 * A structured record of a decision made during an agentic session.
 * This is the Forge concept: every significant choice gets recorded
 * with its context, alternatives, and evidence.
 *
 * These records serve dual purposes:
 *   1. Audit trail — what happened and why
 *   2. PGO feedback — which decisions led to good/bad outcomes
 */
interface DecisionRecord {
  id: string;
  timestamp: string;
  question: string;
  chosenOption: string;
  alternatives: string[];
  evidence: string[];
  confidence: "high" | "medium" | "low";
  source: "human" | "automated_rule" | "ai_recommendation";
  toolName?: string;
  toolArgs?: unknown;
  provenanceTier: "internal" | "certification";
}

// ---------------------------------------------------------------------------
// Pattern 1: Hook-Based Gate (Synchronous Blocking)
// ---------------------------------------------------------------------------

/**
 * A decision gate implemented via the `onPreToolUse` hook.
 *
 * How it works:
 *   1. Hook fires before every tool call
 *   2. Gate evaluates whether this tool call needs approval
 *   3. If yes, returns `permissionDecision: "deny"` to block immediately,
 *      OR returns `permissionDecision: "ask"` to defer to the permission handler
 *   4. Decision is recorded regardless of outcome
 *
 * The "ask" path is more powerful because it lets the permission handler
 * present the tool call details to a human and collect their decision.
 */
function createDecisionGate(
  shouldGate: (toolName: string, args: unknown) => boolean,
  onDecision: (record: DecisionRecord) => void,
): SessionHooks {
  return {
    onPreToolUse: async (
      input: PreToolUseHookInput,
      invocation: { sessionId: string },
    ): Promise<PreToolUseHookOutput> => {
      if (!shouldGate(input.toolName, input.toolArgs)) {
        // No gate needed — pass through
        return {};
      }

      // Record the decision point — even if we defer to permission handler
      const record: DecisionRecord = {
        id: `gate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date(input.timestamp).toISOString(),
        question: `Should tool '${input.toolName}' be allowed to execute?`,
        chosenOption: "deferred_to_permission_handler",
        alternatives: ["allow", "deny", "ask"],
        evidence: [
          `Tool: ${input.toolName}`,
          `Args: ${JSON.stringify(input.toolArgs)}`,
          `Session: ${invocation.sessionId}`,
        ],
        confidence: "medium",
        source: "automated_rule",
        toolName: input.toolName,
        toolArgs: input.toolArgs,
        provenanceTier: "certification", // Human decisions are certification-worthy
      };

      onDecision(record);

      // Return "ask" to trigger the permission handler flow.
      // This is the key insight: we don't need to make the decision here.
      // We just need to FORCE the decision to happen.
      return {
        permissionDecision: "ask",
        permissionDecisionReason: `Decision gate triggered for ${input.toolName}`,
        additionalContext: `Gate ID: ${record.id}`,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Pattern 2: Permission Handler as Decision Gate
// ---------------------------------------------------------------------------

/**
 * A permission handler that implements the human-in-the-loop checkpoint.
 *
 * The SDK's `onPermissionRequest` callback is the native decision gate.
 * It fires when:
 *   1. A tool needs permission (shell commands, file writes, MCP tools)
 *   2. A hook returns `permissionDecision: "ask"`
 *
 * The PermissionRequest includes rich context:
 *   - kind: "shell" | "write" | "read" | "mcp"
 *   - For shell: fullCommandText, intention, parsed commands, affected paths
 *   - For write: fileName, diff, newFileContents
 *   - For mcp: serverName, toolName, arguments
 *
 * This is more detailed than what we could build ourselves.
 */
function createDecisionPermissionHandler(
  onDecision: (record: DecisionRecord) => void,
  approver: (request: PermissionRequest) => Promise<boolean>,
): PermissionHandler {
  return async (
    request: PermissionRequest,
    invocation: { sessionId: string },
  ): Promise<PermissionRequestResult> => {
    const decision = await approver(request);

    const record: DecisionRecord = {
      id: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      question: `Permission request: ${request.kind}`,
      chosenOption: decision ? "approved" : "denied",
      alternatives: ["approved", "denied"],
      evidence: [
        `Kind: ${request.kind}`,
        `Tool call ID: ${request.toolCallId ?? "n/a"}`,
        `Session: ${invocation.sessionId}`,
        // Type-narrow to extract kind-specific details
        ...extractPermissionEvidence(request),
      ],
      confidence: "high", // Human made the call
      source: "human",
      toolName: request.kind,
      provenanceTier: "certification",
    };

    onDecision(record);

    // PermissionRequestResult uses { kind: "approved" | "denied-..." } union
    return decision
      ? { kind: "approved" as const }
      : { kind: "denied-interactively-by-user" as const };
  };
}

/**
 * Extract kind-specific evidence from a permission request.
 */
function extractPermissionEvidence(request: PermissionRequest): string[] {
  const evidence: string[] = [];
  const r = request as Record<string, unknown>;

  if (request.kind === "shell") {
    evidence.push(`Command: ${r.fullCommandText}`);
    evidence.push(`Intention: ${r.intention}`);
  } else if (request.kind === "write") {
    evidence.push(`File: ${r.fileName}`);
    if (r.diff) evidence.push(`Has diff: yes`);
  } else if (request.kind === "read") {
    evidence.push(`Path: ${r.path}`);
  } else if (request.kind === "mcp") {
    evidence.push(`Server: ${r.serverName}`);
    evidence.push(`Tool: ${r.toolName}`);
  }

  return evidence;
}

// ---------------------------------------------------------------------------
// Pattern 3: Elicitation as Structured Decision Collection
// ---------------------------------------------------------------------------

/**
 * Uses the SDK's elicitation system to collect structured decision input.
 *
 * Elicitation is the most sophisticated gate mechanism because:
 *   1. It presents a FORM with typed fields (not just yes/no)
 *   2. The form schema is defined at runtime (dynamic)
 *   3. It fires `elicitation.requested` / `elicitation.completed` events
 *   4. The agent PAUSES until the user responds
 *
 * This could be used for:
 *   - "Which of these 3 approaches should I take?"
 *   - "What confidence level for this fix?"
 *   - "Should I apply to all files or just this one?"
 */
function createElicitationGateHandler(
  onDecision: (record: DecisionRecord) => void,
): ElicitationHandler {
  return async (
    context: ElicitationContext,
  ): Promise<ElicitationResult> => {
    // In a real implementation, this would present a UI.
    // For the spike, we simulate collecting structured input.
    console.log(`[elicitation] Gate question: ${context.message}`);
    console.log(`[elicitation] Schema:`, context.requestedSchema);

    // Simulate user response
    const record: DecisionRecord = {
      id: `elicit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      question: context.message,
      chosenOption: "accept", // simulated
      alternatives: ["accept", "decline", "cancel"],
      evidence: [
        `Source: ${context.elicitationSource ?? "agent"}`,
        `Mode: ${context.mode ?? "form"}`,
        `Session: ${context.sessionId}`,
      ],
      confidence: "high",
      source: "human",
      provenanceTier: "certification",
    };

    onDecision(record);

    // Return acceptance (simulated)
    return {
      action: "accept",
      content: { approved: true },
    };
  };
}

// ---------------------------------------------------------------------------
// Decision Event Bridge — Flow decisions into Cairn event stream
// ---------------------------------------------------------------------------

/**
 * Converts a DecisionRecord into a Cairn-compatible event payload.
 * This is the bridge between the decision gate subsystem and Cairn's event_log.
 *
 * The event type `decision_point` is a NEW Cairn event type that doesn't
 * exist today. It would be added to the event bridge mapping:
 *   DecisionRecord → { event_type: "decision_point", payload: JSON }
 */
function decisionToCairnEvent(
  cairnSessionId: string,
  record: DecisionRecord,
): {
  session_id: string;
  event_type: string;
  payload: string;
  created_at: string;
} {
  return {
    session_id: cairnSessionId,
    event_type: "decision_point",
    payload: JSON.stringify({
      decisionId: record.id,
      question: record.question,
      chosen: record.chosenOption,
      alternatives: record.alternatives,
      evidence: record.evidence,
      confidence: record.confidence,
      source: record.source,
      toolName: record.toolName,
      provenanceTier: record.provenanceTier,
    }),
    created_at: record.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Demo: Full decision gate flow
// ---------------------------------------------------------------------------

/**
 * End-to-end demonstration of the decision gate pattern:
 *   1. Hook detects a gated tool call
 *   2. Hook returns "ask" to trigger permission handler
 *   3. Permission handler collects human decision
 *   4. Decision is recorded and bridged to Cairn event stream
 *   5. `permission.requested` / `permission.completed` events fire in stream
 */
async function decisionGateDemo(): Promise<void> {
  const client = new CopilotClient({ logLevel: "info" });

  const decisions: DecisionRecord[] = [];
  const permissionEvents: Array<{ type: string; data: unknown }> = [];

  // Gate: require approval for shell commands and file writes
  const gateHooks = createDecisionGate(
    (toolName) => ["powershell", "bash", "edit", "create"].includes(toolName),
    (record) => {
      decisions.push(record);
      console.log(`[gate] Decision recorded: ${record.id}`);
    },
  );

  // Permission handler: simulate human approval
  const permHandler = createDecisionPermissionHandler(
    (record) => {
      decisions.push(record);
      console.log(`[permission] Decision recorded: ${record.id}`);
    },
    async (request) => {
      console.log(`[permission] Approval requested: ${request.kind}`);
      // In a real flow, this would prompt the human.
      // For the spike, auto-approve reads, deny writes.
      return request.kind === "read";
    },
  );

  const session = await client.createSession({
    model: "gpt-4",
    onPermissionRequest: permHandler,
    hooks: gateHooks,
  });

  // Subscribe to permission events to verify they fire
  session.on("permission.requested", (event: SessionEvent) => {
    permissionEvents.push({ type: "permission.requested", data: event.data });
    console.log(`[event] permission.requested: ${(event.data as Record<string, unknown>).requestId}`);
  });

  session.on("permission.completed", (event: SessionEvent) => {
    permissionEvents.push({ type: "permission.completed", data: event.data });
    const data = event.data as Record<string, unknown>;
    const result = data.result as Record<string, unknown>;
    console.log(`[event] permission.completed: ${result.kind}`);
  });

  // Send a prompt that will trigger gated tools
  await session.sendAndWait(
    { prompt: "Create a file called test.txt with the content 'hello'" },
    30_000,
  );

  // Report
  console.log("\n--- Decision Records ---");
  for (const d of decisions) {
    console.log(`  ${d.id}: ${d.question} → ${d.chosenOption} (${d.source})`);
  }
  console.log("\n--- Permission Events ---");
  for (const e of permissionEvents) {
    console.log(`  ${e.type}`);
  }

  // Show Cairn event bridge output
  console.log("\n--- Cairn Event Bridge Output ---");
  for (const d of decisions) {
    const cairnEvent = decisionToCairnEvent("spike-session", d);
    console.log(`  ${cairnEvent.event_type}: ${cairnEvent.payload.slice(0, 100)}...`);
  }

  await session.disconnect();
  await client.stop();
}

// ---------------------------------------------------------------------------
// Decision Gate Strategies — What rules determine when to gate?
// ---------------------------------------------------------------------------

/**
 * Example gate strategies that could be configured per-workflow.
 *
 * In Forge, these would be defined in workflow configuration and
 * compiled into the session's hook set.
 */
const GATE_STRATEGIES = {
  /** Gate all destructive operations */
  destructiveOps: (toolName: string) =>
    ["powershell", "bash", "edit", "create", "delete"].includes(toolName),

  /** Gate based on tool name patterns */
  byPattern: (pattern: RegExp) =>
    (toolName: string) => pattern.test(toolName),

  /** Gate specific MCP server tools */
  mcpServer: (serverName: string) =>
    (toolName: string) => toolName.startsWith(`${serverName}_`),

  /** Never gate (auto-approve everything) — for trusted workflows */
  trustAll: () => false,

  /** Always gate (require approval for everything) — for certification runs */
  certifyAll: () => true,
} as const;

// ---------------------------------------------------------------------------
// DBOM (Decision Bill of Materials) — Reconstructed from decisions
// ---------------------------------------------------------------------------

/**
 * A Decision Bill of Materials: the complete record of all human decisions
 * that shaped a workflow execution. This is the certification artifact.
 *
 * In the PGO concept, a DBOM from a successful run can be used to
 * auto-approve the same decisions in future runs (progressive trust).
 */
interface DBOM {
  workflowId: string;
  sessionId: string;
  timestamp: string;
  decisions: DecisionRecord[];
  summary: {
    total: number;
    humanApproved: number;
    humanDenied: number;
    automatedAllow: number;
    automatedDeny: number;
  };
}

function buildDBOM(
  workflowId: string,
  sessionId: string,
  decisions: DecisionRecord[],
): DBOM {
  return {
    workflowId,
    sessionId,
    timestamp: new Date().toISOString(),
    decisions,
    summary: {
      total: decisions.length,
      humanApproved: decisions.filter(
        (d) => d.source === "human" && d.chosenOption === "approved",
      ).length,
      humanDenied: decisions.filter(
        (d) => d.source === "human" && d.chosenOption === "denied",
      ).length,
      automatedAllow: decisions.filter(
        (d) => d.source === "automated_rule" && d.chosenOption !== "denied",
      ).length,
      automatedDeny: decisions.filter(
        (d) => d.source === "automated_rule" && d.chosenOption === "denied",
      ).length,
    },
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  createDecisionGate,
  createDecisionPermissionHandler,
  createElicitationGateHandler,
  decisionToCairnEvent,
  decisionGateDemo,
  buildDBOM,
  GATE_STRATEGIES,
  type DecisionRecord,
  type DBOM,
};
