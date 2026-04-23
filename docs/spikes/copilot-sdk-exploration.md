# Spike: `@github/copilot-sdk` Technical Exploration

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-04-07
**Branch:** `squad/copilot-sdk-spike`
**Status:** Day 1 spike complete — hands-on verification

---

## Executive Summary

The `@github/copilot-sdk` is **real, published, installable, and well-typed**. Version 0.2.2 is on npm with 52 published versions, MIT-licensed, 3 dependencies. Its event system is a near-perfect match for Cairn's `event_log` — the bridge is genuinely ~50 LOC. The SDK is Technical Preview, not production-hardened, but the type definitions are comprehensive (105KB of generated event types alone) and the API surface is stable enough to build on.

**Bottom line:** We can build a Cairn harness on this SDK today. The risk isn't "will it work" — it's "will the API change under us."

---

## 1. Package Status

| Field | Value |
|-------|-------|
| **Package** | `@github/copilot-sdk` |
| **Latest** | `0.2.2` (published ~1 week ago) |
| **Prerelease** | `0.3.0-preview.0` |
| **License** | MIT |
| **Dependencies** | 3: `@github/copilot` (^1.0.21), `vscode-jsonrpc` (^8.2.1), `zod` (^4.3.6) |
| **Unpacked size** | 483.6 KB |
| **Versions published** | 52 |
| **Status** | Technical Preview |
| **Repo** | https://github.com/github/copilot-sdk |
| **Installable?** | ✅ Yes — `npm install @github/copilot-sdk` works |

**Other SDKs in the ecosystem:**
- `@copilot-extensions/preview-sdk` v5.0.1 — for Copilot Extensions (GitHub App model, SSE streaming)
- `@github/copilot-engine-sdk` v0.0.1 — for building custom Copilot coding agent engines (very early)

---

## 2. API Surface

### Top-level Exports

```typescript
export { CopilotClient } from "./client.js";
export { CopilotSession } from "./session.js";
export { defineTool, approveAll, SYSTEM_PROMPT_SECTIONS } from "./types.js";
// + 60+ type exports
```

### CopilotClient

The main entry point. Spawns or connects to a Copilot CLI process via JSON-RPC.

**Key methods:**
| Method | Description |
|--------|-------------|
| `start()` | Start the CLI process |
| `stop()` / `forceStop()` | Shutdown |
| `createSession(config)` | Create a new agentic session |
| `resumeSession(config)` | Resume a previous session |
| `listModels()` | Available models |
| `getAuthStatus()` | Check auth state |
| `getStatus()` | CLI process status |
| `ping()` | Health check |
| `listSessions()` / `getSessionMetadata()` | Session management |
| `on(handler)` | Subscribe to client-level lifecycle events |

**Constructor options (`CopilotClientOptions`):**
```typescript
{
  cliPath?: string;          // Path to CLI executable (uses bundled by default)
  cliArgs?: string[];        // Extra CLI arguments
  cwd?: string;              // Working directory
  port?: number;             // TCP port (0 = random)
  useStdio?: boolean;        // stdio vs TCP transport (default: true)
  isChildProcess?: boolean;  // Running as child of CLI server
  cliUrl?: string;           // Connect to existing CLI server
  logLevel?: string;         // CLI log level
  telemetry?: TelemetryConfig; // OpenTelemetry config
  sessionFs?: SessionFsConfig; // Custom session filesystem
}
```

### CopilotSession

Represents a conversational session with the agentic engine.

**Key methods:**
| Method | Description |
|--------|-------------|
| `send(options)` | Send a prompt (fire-and-forget) |
| `sendAndWait(options)` | Send and wait for complete response |
| `on(eventType, handler)` | Subscribe to typed events (returns unsubscribe fn) |
| `on(handler)` | Subscribe to all events |
| `registerTools(tools)` | Add tools at runtime |
| `registerCommands(commands)` | Add slash commands |
| `registerHooks(hooks)` | Add lifecycle hooks |
| `setModel(model)` | Change model mid-session |
| `setCapabilities(caps)` | Update session capabilities |
| `getMessages()` | Get conversation history |
| `disconnect()` / `destroy()` / `abort()` | Cleanup |
| `log(level, message)` | Session-scoped logging |

### defineTool Helper

```typescript
const weatherTool = defineTool({
  name: "get_weather",
  description: "Get weather for a city",
  parameters: z.object({ city: z.string() }),
  handler: async ({ city }) => ({ temperature: 72 })
});
```

---

## 3. Event System

### Architecture

Events flow from the CLI process → SDK → your code via `session.on()`. Every event has:
```typescript
{
  id: string;           // UUID v4
  timestamp: string;    // ISO 8601
  parentId: string | null; // Linked chain
  ephemeral?: boolean;  // Transient (not persisted)
  type: string;         // Discriminated union tag
  data: { ... };        // Type-specific payload
}
```

### All Event Types (86 total)

**Session lifecycle:**
- `session.start`, `session.resume`, `session.idle`, `session.shutdown`
- `session.error`, `session.warning`, `session.info`
- `session.mode_changed`, `session.model_change`, `session.title_changed`
- `session.usage_info`, `session.compaction_start`, `session.compaction_complete`
- `session.context_changed`, `session.truncation`, `session.snapshot_rewind`
- `session.mcp_servers_loaded`, `session.mcp_server_status_changed`
- `session.tools_updated`, `session.skills_loaded`, `session.extensions_loaded`
- `session.custom_agents_updated`, `session.plan_changed`
- `session.background_tasks_changed`, `session.task_complete`
- `session.workspace_file_changed`, `session.remote_steerable_changed`
- `session.handoff`

**Assistant output:**
- `assistant.message`, `assistant.message_delta`
- `assistant.reasoning`, `assistant.reasoning_delta`
- `assistant.streaming_delta`
- `assistant.intent`, `assistant.turn_start`, `assistant.turn_end`
- `assistant.usage` ← **THE KEY EVENT FOR COST TRACKING**

**Tool execution:**
- `tool.execution_start`, `tool.execution_complete`
- `tool.execution_progress`, `tool.execution_partial_result`
- `tool.user_requested`

**User interaction:**
- `user.message`
- `user_input.requested`, `user_input.completed`
- `elicitation.requested`, `elicitation.completed`

**Agent orchestration:**
- `subagent.started`, `subagent.selected`, `subagent.deselected`
- `subagent.completed`, `subagent.failed`
- `agent_idle`, `agent_completed`
- `skill.invoked`

**Other:**
- `command.queued`, `command.execute`, `command.completed`
- `permission.requested`, `permission.completed`
- `hook.start`, `hook.end`
- `external_tool.requested`, `external_tool.completed`
- `sampling.requested`, `sampling.completed`
- `mcp.oauth_required`, `mcp.oauth_completed`
- `capabilities.changed`, `commands.changed`
- `exit_plan_mode.requested`, `exit_plan_mode.completed`
- `pending_messages.modified`
- `system.message`, `system.notification`
- Content types: `text`, `file`, `directory`, `image`, `audio`, `blob`, `object`, `terminal`, `selection`, `resource`, `resource_link`, `github_reference`, `shell_completed`, `shell_detached_completed`, `abort`

### Subscribing to Events

```typescript
// Typed — only get assistant.usage events, with full type inference
const unsub = session.on("assistant.usage", (event) => {
  console.log(event.data.model);       // string
  console.log(event.data.inputTokens); // number | undefined
});

// Catch-all — get everything
session.on((event) => {
  switch (event.type) {
    case "assistant.usage": /* ... */ break;
    case "tool.execution_complete": /* ... */ break;
  }
});

// Early registration via config (catches events during session creation)
const session = await client.createSession({
  onPermissionRequest: approveAll,
  onEvent: (event) => { /* catches session.start etc. */ }
});
```

---

## 4. Key Event Payloads (Cairn-Relevant)

### `assistant.usage` — Token Cost Tracking

```typescript
{
  type: "assistant.usage",
  data: {
    model: string;                // e.g. "gpt-5", "claude-sonnet-4"
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cost?: number;                // Billing multiplier
    duration?: number;            // API call duration (ms)
    ttftMs?: number;              // Time to first token (ms)
    interTokenLatencyMs?: number; // Avg inter-token latency (ms)
    initiator?: string;           // "sub-agent", "mcp-sampling", etc.
    apiCallId?: string;           // Provider completion ID
    providerCallId?: string;      // x-github-request-id
    parentToolCallId?: string;    // For sub-agent calls
    reasoningEffort?: string;     // "low" | "medium" | "high" | "xhigh"
    quotaSnapshots?: {            // Per-quota resource usage
      [quotaId: string]: {
        isUnlimitedEntitlement: boolean;
        entitlementRequests: number;
        usedRequests: number;
        remainingPercentage: number; // 0.0 to 1.0
        resetDate?: string;
      }
    };
    copilotUsage?: {              // CAPI billing breakdown
      tokenDetails: Array<{
        batchSize: number;
        costPerBatch: number;
        tokenCount: number;
        tokenType: string;        // "input" | "output"
      }>;
      totalNanoAiu: number;       // Total cost in nano AI Units
    };
  }
}
```

**This is richer than expected.** We get not just tokens but quota snapshots, billing details in nano-AIU, latency metrics, and sub-agent attribution. The `copilotUsage.totalNanoAiu` field gives us actual cost, not just token counts.

### `session.usage_info` — Context Window Monitoring

```typescript
{
  type: "session.usage_info",
  data: {
    tokenLimit: number;           // Model's context window size
    currentTokens: number;        // Current tokens in window
    messagesLength: number;       // Message count
    systemTokens?: number;        // System message tokens
    conversationTokens?: number;  // Non-system message tokens
    toolDefinitionsTokens?: number; // Tool schema tokens
    isInitial?: boolean;          // First event in session
  }
}
```

### `tool.execution_start` / `tool.execution_complete`

```typescript
// Start
{
  type: "tool.execution_start",
  data: {
    toolCallId: string;
    toolName: string;
    arguments?: Record<string, unknown>;
    mcpServerName?: string;       // MCP server hosting the tool
  }
}

// Complete
{
  type: "tool.execution_complete",
  data: {
    toolCallId: string;
    success: boolean;
    model?: string;               // Model that initiated the call
    interactionId?: string;       // CAPI correlation ID
    isUserRequested?: boolean;
    result?: {
      content: string;            // Truncated for LLM
      detailedContent?: string;   // Full content for UI
      contents?: Array<TextBlock | TerminalBlock | ImageBlock | ...>;
    };
    error?: {
      message: string;
      code?: string;
      details?: string;
    };
  }
}
```

---

## 5. Hook Points

The SDK provides 6 hooks via `SessionConfig.hooks`:

| Hook | Input | Can Modify | Use Case |
|------|-------|------------|----------|
| `onPreToolUse` | `toolName`, `toolArgs` | Args, permission decision, context | Gate/instrument tool calls |
| `onPostToolUse` | `toolName`, `toolArgs`, `toolResult` | Result, context | Log outcomes, transform results |
| `onUserPromptSubmitted` | `prompt` | Prompt text, context | Enrich prompts, log user input |
| `onSessionStart` | `source` (startup/resume/new), `initialPrompt` | Config, context | Initialize instrumentation |
| `onSessionEnd` | `reason` (complete/error/abort/timeout/user_exit) | Cleanup actions, summary | Finalize, flush data |
| `onErrorOccurred` | `error`, `errorContext`, `recoverable` | Error handling strategy | Retry/skip/abort |

**Key detail:** Hooks are bi-directional. They receive input and can return output that modifies behavior. The `onPreToolUse` hook can even change the permission decision (`allow`/`deny`/`ask`) and modify tool arguments. This is more powerful than Cairn's current stdin-based hooks which are observe-only.

---

## 6. Session Management

```typescript
const session = await client.createSession({
  sessionId: "custom-id",        // Optional, auto-generated if omitted
  clientName: "cairn-harness",   // Appears in User-Agent
  model: "gpt-5",               // Default model
  reasoningEffort: "high",       // For models that support it
  workingDirectory: "/path",     // Tool operations relative to this
  enableConfigDiscovery: true,   // Auto-discover .mcp.json, skills, etc.

  // Tools and commands
  tools: [weatherTool],
  commands: [{ name: "status", handler: ... }],
  availableTools: ["edit", "view", "grep"],  // Allowlist
  excludedTools: ["powershell"],             // Denylist

  // MCP servers
  mcpServers: { cairn: { command: "node", args: ["dist/mcp-server.js"] } },

  // Custom agents and skills
  customAgents: [{ name: "reviewer", ... }],
  skillDirectories: [".github/skills"],

  // Hooks
  hooks: { onPreToolUse: ..., onPostToolUse: ... },

  // Handlers
  onPermissionRequest: approveAll,  // Required
  onUserInputRequest: (prompt) => "user response",
  onEvent: (event) => { /* early event handler */ },

  // Infinite sessions
  infiniteSessions: { enabled: true },

  // System prompt
  systemMessage: { mode: "append", text: "Additional context..." },

  // BYOK
  provider: { baseUrl: "https://api.openai.com/v1", apiKey: "sk-..." },
});

// Resume previous session
const resumed = await client.resumeSession({ sessionId: "previous-id", ... });
```

---

## 7. Model Selection

```typescript
// At session creation
const session = await client.createSession({ model: "gpt-5" });

// Change mid-session
session.setModel("claude-sonnet-4");

// List available models
const models = await client.listModels();
// Returns: ModelInfo[] with capabilities, billing, policies
```

`ModelInfo` includes:
- `id`, `version`, `name`
- `capabilities`: `contextWindow`, `maxOutputTokens`, `supports` (vision, reasoning, etc.)
- `billing`: `premiumModel`, `multiplier`
- `policy`: restrictions, availability

---

## 8. Authentication

```typescript
// Check auth status
const auth = await client.getAuthStatus();

// Auth methods (in order of precedence):
// 1. Bundled CLI uses existing `copilot` CLI login (OAuth)
// 2. Environment variables: COPILOT_GITHUB_TOKEN, GH_TOKEN, GITHUB_TOKEN
// 3. BYOK via provider config (no GitHub auth needed)
const byokSession = await client.createSession({
  provider: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
  },
  onPermissionRequest: approveAll,
});
```

---

## 9. OpenTelemetry Integration

Built-in OTel support:

```typescript
const client = new CopilotClient({
  telemetry: {
    otlpEndpoint: "http://localhost:4318",  // OTLP HTTP endpoint
    filePath: "./traces.jsonl",             // File exporter
    exporterType: "otlp-http",             // or "file"
    sourceName: "cairn-harness",           // Instrumentation scope
    captureContent: true,                  // Include prompt/response content
  }
});
```

W3C Trace Context propagation via `TraceContextProvider`:
```typescript
const client = new CopilotClient({
  traceContextProvider: () => ({
    traceparent: "00-trace-id-span-id-01",
    tracestate: "key=value"
  })
});
```

---

## 10. Limitations & Risks

### What's Missing
1. **No TypeScript source maps** — `.d.ts` files exist but no source `.ts` in the package
2. **No offline mode** — requires Copilot CLI process (which needs network for auth)
3. **No event replay** — events are fire-and-forget, no built-in persistence
4. **Session filesystem** — `SessionFsConfig` exists but docs are sparse

### What's Unstable
1. **Technical Preview** — breaking changes expected between minor versions
2. **`0.3.0-preview.0` already exists** — API is actively evolving
3. **52 versions in ~3 months** — rapid iteration, frequent churn
4. **Engine SDK at v0.0.1** — lowest-level integration point is embryonic

### What Could Break
1. Event type names could be renamed/reorganized
2. `copilotUsage.totalNanoAiu` billing structure could change
3. Hook return types could gain required fields
4. JSON-RPC protocol version could bump (there's a `verifyProtocolVersion()`)

---

## 11. Integration Assessment: SDK → Cairn Event Bridge

### Mapping Table

| SDK Event | Cairn event_type | Payload Extraction |
|-----------|------------------|--------------------|
| `assistant.usage` | `model_call` | `{ model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, cost, duration, totalNanoAiu }` |
| `tool.execution_start` | `tool_use` | `{ toolName, toolCallId, arguments, mcpServerName }` |
| `tool.execution_complete` | `tool_result` | `{ toolCallId, success, error }` |
| `session.start` | `session_start` | `{ source }` |
| `session.idle` | `session_idle` | `{}` |
| `session.error` | `error` | `{ message, severity }` |
| `session.usage_info` | `context_window` | `{ tokenLimit, currentTokens, messagesLength }` |
| `session.compaction_complete` | `compaction` | compaction metrics |
| `user.message` | `user_message` | `{ content }` |

### Bridge Implementation (Pseudocode)

```typescript
import { logEvent } from 'cairn';
import type { SessionEvent } from '@github/copilot-sdk';

const EVENT_MAP: Record<string, string> = {
  'assistant.usage': 'model_call',
  'tool.execution_start': 'tool_use',
  'tool.execution_complete': 'tool_result',
  'session.start': 'session_start',
  'session.error': 'error',
  'session.usage_info': 'context_window',
  'user.message': 'user_message',
};

function bridgeEvent(sessionId: string, event: SessionEvent): void {
  const cairnType = EVENT_MAP[event.type];
  if (!cairnType) return; // Skip unmapped events

  logEvent(sessionId, cairnType, JSON.stringify(event.data));
}

// Usage:
session.on((event) => bridgeEvent(cairnSessionId, event));
```

**That's ~20 lines.** The full bridge with error handling, session ID mapping, and selective payload extraction would be ~50 lines, exactly as estimated.

### Effort Estimate

| Component | LOC | Difficulty |
|-----------|-----|------------|
| Event bridge adapter | ~50 | Low |
| Harness bootstrap (CopilotClient + session setup) | ~80 | Low |
| New Cairn event types (model_call, context_window, etc.) | ~30 | Low (no migration needed — JSON payload) |
| Cost summary materialization in curator | ~100 | Medium |
| Tests | ~150 | Medium |
| **Total** | **~410** | **2-3 days** |

---

## 12. Alternatives if SDK Isn't Used

### Option A: `gh copilot` CLI interception
- Parse stdin/stdout of existing `gh copilot` process
- Fragile, no structured events, no token data
- **Verdict:** Not viable for cost tracking

### Option B: MCP-level interception
- Cairn already runs as MCP server — could log its own tool calls
- But Cairn can't see OTHER tool calls or model usage
- **Verdict:** Partial — only sees Cairn's own tools

### Option C: OpenTelemetry file export
- SDK supports `filePath` export of traces
- Could tail the JSONL file and import into Cairn
- **Verdict:** Viable but indirect — adds file I/O latency and complexity

**Recommendation:** Use the SDK directly. It's the cleanest path.

---

## 13. Recommendation

**Build on the SDK.** The API is comprehensive, well-typed, and maps directly to what Cairn needs. The Technical Preview risk is real but manageable:

1. **Pin the version** (`0.2.2`) and don't auto-upgrade
2. **Abstract behind our own types** — the bridge adapter is the seam
3. **Start with events only** — don't depend on hooks for correctness, use them for enrichment
4. **Keep existing hooks working** — SDK harness is additive, not replacement

The `assistant.usage` event alone justifies the integration — it gives us model, tokens, cache metrics, billing cost in nano-AIU, latency, and quota tracking. That's everything we'd need for Phase 8's cost tracking feature with zero scraping or estimation.

---

## 14. Day 1 Spike Findings (Hands-On Verification)

**Date:** 2026-04-08  
**Code:** `src/spike/forge-poc.ts`, `src/spike/event-bridge.ts`

### Q1 Answer: Session Management — ✅ Yes

The SDK's session management API is **real, typed, and compiles cleanly**. We verified:

- `CopilotClient` constructor accepts `CopilotClientOptions` (cliPath, logLevel, useStdio, telemetry, etc.)
- `client.createSession(config)` returns `CopilotSession` with rich `SessionConfig`:
  - Model selection (`model`, `reasoningEffort`)
  - Tool registration (`tools`, `availableTools`, `excludedTools`)
  - MCP server config (`mcpServers`)
  - 6 lifecycle hooks (`onSessionStart`, `onSessionEnd`, `onPreToolUse`, `onPostToolUse`, `onUserPromptSubmitted`, `onErrorOccurred`)
  - Permission handler (`onPermissionRequest: approveAll`)
  - Early event handler (`onEvent`)
  - Client identification (`clientName`)
  - Infinite sessions support (`infiniteSessions`)
  - BYOK provider config (`provider`)
- `client.resumeSession({ sessionId })` for session resume
- `client.listSessions()` and `client.getSessionMetadata()` for session management
- `session.send()` and `session.sendAndWait()` for prompting
- `session.disconnect()`, `session.destroy()`, `session.abort()` for cleanup
- `client.getAuthStatus()`, `client.getStatus()`, `client.ping()` for health
- `client.listModels()` returns `ModelInfo[]` with capabilities, billing, policy

**Circuit breaker: PASSED.** The session management API exists exactly as documented.

### Q4 Answer: Event Taxonomy — ✅ Comprehensive (86 typed events)

The SDK emits **86 event types** from a generated schema (`session-events.schema.json`). Every event has:
- `id` (UUID v4), `timestamp` (ISO 8601), `parentId` (linked chain), `ephemeral?` (transient flag)
- `type` (discriminated union tag), `data` (type-specific payload)

Event subscription is fully typed:
- `session.on("assistant.usage", (event) => ...)` — TypeScript infers the exact payload shape
- `session.on((event) => ...)` — catch-all, discriminated union on `event.type`
- Both return an unsubscribe function

**Key finding beyond pre-spike research:** The event types are auto-generated from a JSON schema, not hand-written. This means they're likely stable across SDK versions (schema-driven, not ad-hoc). The `session-events.d.ts` file is ~105KB of generated types.

**Cairn mapping coverage:** 22 of 86 events map to Cairn-relevant signals (see `event-bridge.ts` for full analysis). The remaining 64 are display-layer or infrastructure events.

### Q6 Answer: Stability & Limitations — ⚠️ Manageable Risks

**Install:**
- SDK v0.2.2 installs cleanly alongside existing deps
- No dependency conflicts: SDK uses `zod ^4.3.6` (same as Cairn), `vscode-jsonrpc ^8.2.1`, and `@github/copilot ^1.0.21`
- Build (`tsc`) passes with spike code — no type conflicts
- All 427 existing tests pass — zero regressions
- 3 pre-existing npm audit vulnerabilities (2 moderate, 1 high) — not introduced by SDK

**Type system:**
- All documented exports are real: `CopilotClient`, `CopilotSession`, `defineTool`, `approveAll`, `SYSTEM_PROMPT_SECTIONS`, plus 60+ type exports
- Type inference works correctly for typed event handlers
- `defineTool` accepts Zod schemas as documented
- No `@ts-ignore` or type casting needed in PoC code

**Limitations discovered:**
1. **`package.json` exports restriction** — SDK uses Node.js `exports` field; `require('@github/copilot-sdk/package.json')` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. Must access version via `node_modules` path inspection.
2. **Runtime requirement** — SDK compiles fine but requires a live Copilot CLI process to actually execute. This is expected and documented, but means the PoC can only be type-verified, not runtime-verified, in the spike.
3. **No source maps** — `.d.ts` files exist but no TypeScript source in the package. Debugging requires reading compiled JS.
4. **Rapid version churn** — 52 versions in ~3 months. The `0.3.0-preview.0` prerelease already exists. Pin to `0.2.2`.

**Verdict:** Technical Preview risks are real but well-bounded. The type system is comprehensive enough to build against. The version pinning strategy (`^0.2.2` in package.json) should be tightened to exact (`0.2.2`) for production use.

### Surprises

1. **Better than expected:** `defineTool` uses the same Zod pattern as Cairn's MCP tools. Zero learning curve for tool definition.
2. **Better than expected:** SDK shares our `zod` dependency — no version conflict, no duplicate installs.
3. **Better than expected:** Hook model is bi-directional (can modify behavior), not just observe-only like Cairn's stdin hooks.
4. **As expected:** The 86 event types match the pre-spike research catalog exactly. No hidden events, no missing events.
5. **Minor friction:** The `ERR_PACKAGE_PATH_NOT_EXPORTED` on `package.json` import is a minor annoyance but doesn't affect anything functional.
