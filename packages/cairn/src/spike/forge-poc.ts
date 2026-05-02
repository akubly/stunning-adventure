/**
 * SPIKE CODE — Experimental, not for production use.
 *
 * Proof-of-concept: Can we manage Copilot sessions programmatically
 * using @github/copilot-sdk?
 *
 * This answers spike Q1 (Session Management) and Q4 (Event Taxonomy).
 *
 * NOTE: This code compiles against the SDK's types but requires a
 * running Copilot CLI process to actually execute. The value is in
 * proving the API surface matches documentation.
 */

import {
  CopilotClient,
  CopilotSession,
  approveAll,
  defineTool,
  type SessionEvent,
  type SessionEventType,
  type SessionConfig,
  type CopilotClientOptions,
  type MessageOptions,
} from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// Q1: Session Management — Can we create, configure, and control sessions?
// ---------------------------------------------------------------------------

/**
 * Demonstrates the full session lifecycle:
 *   1. Create client
 *   2. Create session with configuration
 *   3. Subscribe to events
 *   4. Send a prompt
 *   5. Collect events
 *   6. Clean up
 */
async function sessionLifecycleDemo(): Promise<void> {
  // --- Step 1: Create client ---
  const clientOptions: CopilotClientOptions = {
    // Uses bundled CLI by default; can override with cliPath
    logLevel: "info",
    useStdio: true,
  };
  const client = new CopilotClient(clientOptions);

  try {
    // --- Step 2: Create session with rich configuration ---
    const sessionConfig: SessionConfig = {
      // Model selection
      model: "gpt-4",
      reasoningEffort: "medium",

      // Working directory for tool operations
      workingDirectory: process.cwd(),

      // Permission handler — required
      onPermissionRequest: approveAll,

      // Early event handler — catches events during session creation
      onEvent: (event: SessionEvent) => {
        console.log(`[early] ${event.type}`, event.id);
      },

      // Client identification
      clientName: "cairn-spike",

      // Hooks — the instrumentation points Cairn would use
      hooks: {
        onSessionStart: async (ctx) => {
          console.log("[hook] session started, source:", ctx.source);
          return {};
        },
        onSessionEnd: async (ctx) => {
          console.log("[hook] session ended, reason:", ctx.reason);
          return {};
        },
        onPreToolUse: async (ctx) => {
          console.log("[hook] pre-tool:", ctx.toolName);
          // Can modify: permission decision, args, context
          return {};
        },
        onPostToolUse: async (ctx) => {
          console.log("[hook] post-tool:", ctx.toolName, "result:", ctx.toolResult);
          return {};
        },
        onUserPromptSubmitted: async (ctx) => {
          console.log("[hook] user prompt:", ctx.prompt);
          return {};
        },
        onErrorOccurred: async (ctx) => {
          console.error("[hook] error:", ctx.error, "recoverable:", ctx.recoverable);
          return {};
        },
      },
    };

    const session: CopilotSession = await client.createSession(sessionConfig);
    console.log("Session created:", session.sessionId);

    // --- Step 3: Subscribe to ALL events ---
    const collectedEvents: Array<{ type: string; timestamp: string; id: string }> = [];

    // Catch-all handler — logs every event
    const unsubAll = session.on((event: SessionEvent) => {
      collectedEvents.push({
        type: event.type,
        timestamp: event.timestamp,
        id: event.id,
      });
      console.log(`[event] ${event.type} (${event.id})`);
    });

    // Typed handler — demonstrates type-safe event subscription
    const unsubUsage = session.on("assistant.usage", (event) => {
      // TypeScript infers the payload shape:
      console.log("[usage] model:", event.data.model);
      console.log("[usage] input tokens:", event.data.inputTokens);
      console.log("[usage] output tokens:", event.data.outputTokens);
      console.log("[usage] cache read:", event.data.cacheReadTokens);
      console.log("[usage] cache write:", event.data.cacheWriteTokens);
      console.log("[usage] cost:", event.data.cost);
      console.log("[usage] duration:", event.data.duration);
      if (event.data.copilotUsage) {
        console.log("[usage] nano AIU:", event.data.copilotUsage.totalNanoAiu);
      }
    });

    const unsubToolComplete = session.on("tool.execution_complete", (event) => {
      console.log("[tool]", event.data.toolCallId, "success:", event.data.success);
      if (event.data.error) {
        console.error("[tool] error:", event.data.error.message);
      }
    });

    // --- Step 4: Send a simple prompt ---
    const messageOptions: MessageOptions = {
      prompt: "What is 2+2?",
    };

    // sendAndWait blocks until the session goes idle
    const response = await session.sendAndWait(messageOptions, 30_000);
    if (response) {
      console.log("Response:", response.data.content);
    }

    // --- Step 5: Display collected events ---
    console.log("\n--- Collected Events ---");
    console.log(`Total events: ${collectedEvents.length}`);
    const typeCounts = new Map<string, number>();
    for (const evt of collectedEvents) {
      typeCounts.set(evt.type, (typeCounts.get(evt.type) ?? 0) + 1);
    }
    for (const [type, count] of typeCounts.entries()) {
      console.log(`  ${type}: ${count}`);
    }

    // --- Step 6: Clean up ---
    unsubAll();
    unsubUsage();
    unsubToolComplete();
    await session.disconnect();
    await client.stop();
  } catch (err) {
    console.error("Session lifecycle failed:", err);
    await client.stop();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Q1 bonus: Session resume — can we resume a previous session?
// ---------------------------------------------------------------------------

async function sessionResumeDemo(): Promise<void> {
  const client = new CopilotClient();

  // Create a session, note its ID
  const session = await client.createSession({
    onPermissionRequest: approveAll,
    model: "gpt-4",
  });
  const savedId = session.sessionId;
  await session.disconnect();

  // Resume the same session
  const resumed = await client.resumeSession({
    sessionId: savedId,
    onPermissionRequest: approveAll,
  });
  console.log("Resumed session:", resumed.sessionId);
  console.log("Same ID?", resumed.sessionId === savedId);

  await resumed.disconnect();
  await client.stop();
}

// ---------------------------------------------------------------------------
// Q1 bonus: Session listing and metadata
// ---------------------------------------------------------------------------

async function sessionMetadataDemo(): Promise<void> {
  const client = new CopilotClient();

  // List existing sessions
  const sessions = await client.listSessions();
  console.log("Sessions:", sessions);

  // Get metadata for a specific session
  if (sessions && sessions.length > 0) {
    const meta = await client.getSessionMetadata(sessions[0].id);
    console.log("Metadata:", meta);
  }

  // Check auth and status
  const auth = await client.getAuthStatus();
  console.log("Auth status:", auth);

  const status = await client.getStatus();
  console.log("CLI status:", status);

  // List available models
  const models = await client.listModels();
  console.log("Models:", models.map((m) => m.id));

  await client.stop();
}

// ---------------------------------------------------------------------------
// Q4: Event taxonomy — demonstrate typed event subscription
// ---------------------------------------------------------------------------

/**
 * This function demonstrates subscribing to specific event categories.
 * The SessionEventType union defines all valid event type strings.
 * This proves the event taxonomy is typed and discoverable at compile time.
 */
function eventTaxonomyDemo(session: CopilotSession): Array<() => void> {
  const unsubs: Array<() => void> = [];

  // Session lifecycle events
  unsubs.push(session.on("session.start", (e) => console.log("start", e.data.sessionId)));
  unsubs.push(session.on("session.idle", (_e) => console.log("idle")));
  unsubs.push(session.on("session.error", (e) => console.log("error", e.data.message)));
  unsubs.push(session.on("session.usage_info", (e) => {
    console.log("usage_info", e.data.currentTokens, "/", e.data.tokenLimit);
  }));

  // Assistant events
  unsubs.push(session.on("assistant.message", (e) => console.log("msg", e.data.content)));
  unsubs.push(session.on("assistant.turn_start", (_e) => console.log("turn start")));
  unsubs.push(session.on("assistant.turn_end", (_e) => console.log("turn end")));
  unsubs.push(session.on("assistant.usage", (e) => console.log("usage", e.data.model)));

  // Tool events
  unsubs.push(session.on("tool.execution_start", (e) => {
    console.log("tool start", e.data.toolName, e.data.toolCallId);
  }));
  unsubs.push(session.on("tool.execution_complete", (e) => {
    console.log("tool complete", e.data.toolCallId, e.data.success);
  }));

  // User events
  unsubs.push(session.on("user.message", (e) => console.log("user msg", e.data.content)));

  // Sub-agent events
  unsubs.push(session.on("subagent.started", (e) => console.log("subagent", e.data)));
  unsubs.push(session.on("subagent.completed", (e) => console.log("subagent done", e.data)));

  return unsubs;
}

// ---------------------------------------------------------------------------
// Q6: defineTool — verify the tool definition API compiles
// ---------------------------------------------------------------------------

import { z } from "zod";

const exampleTool = defineTool({
  name: "cairn_check_event",
  description: "Check if an event type occurred in a session",
  parameters: z.object({
    sessionId: z.string().describe("The session UUID"),
    eventType: z.string().describe("Event type to check for"),
  }),
  handler: async ({ sessionId, eventType }) => {
    // In real usage this would query Cairn's DB
    return { found: true, sessionId, eventType };
  },
});

// Verify tool can be registered on a session
async function toolRegistrationDemo(session: CopilotSession): Promise<void> {
  session.registerTools([exampleTool]);
  console.log("Tool registered successfully");
}

// ---------------------------------------------------------------------------
// Exports for type-checking verification
// ---------------------------------------------------------------------------

export {
  sessionLifecycleDemo,
  sessionResumeDemo,
  sessionMetadataDemo,
  eventTaxonomyDemo,
  toolRegistrationDemo,
  exampleTool,
};
