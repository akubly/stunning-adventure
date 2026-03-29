# Recon: Copilot SDK & GitHub Platform Extensibility

**Author:** Roger Wilco (Platform Dev)
**Date:** 2026-03-28
**Status:** Research complete

---

## 1. Copilot SDKs — The Landscape

There are **three distinct SDK layers** for building on Copilot. Understanding which one to use is the first decision.

### 1.1 Copilot CLI SDK (`@github/copilot-sdk`)

**The big one.** Released Jan 2026, already 8K+ stars. This is the programmable interface to the same agentic engine behind the Copilot CLI.

| Language | Package | Install |
|----------|---------|---------|
| Node.js/TS | `@github/copilot-sdk` | `npm install @github/copilot-sdk` |
| Python | `github-copilot-sdk` | `pip install github-copilot-sdk` |
| Go | `github.com/github/copilot-sdk/go` | `go get` |
| .NET | `GitHub.Copilot.SDK` | `dotnet add package GitHub.Copilot.SDK` |
| Java | `com.github:copilot-sdk-java` | Maven/Gradle |
| Rust, C++, Clojure | Community SDKs | See repos |

**Architecture:**
```
Your Application
       ↓
  SDK Client (JSON-RPC)
       ↓
  Copilot CLI (server mode)
```

**Key capabilities:**
- Full agentic workflows: planning, tool invocation, file edits
- Custom agents, skills, and tools
- MCP server integration
- BYOK (Bring Your Own Key) — use your own LLM provider keys (OpenAI, Azure, Anthropic)
- Hook into agent lifecycle
- All tools enabled by default (`--allow-all` equivalent)

**Auth methods:**
- GitHub signed-in user (OAuth from `copilot` CLI login)
- OAuth GitHub App tokens
- Environment variables: `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`
- BYOK (no GitHub auth required)

**Status:** Technical Preview. Functional but not production-hardened yet.

**Repo:** https://github.com/github/copilot-sdk

### 1.2 Copilot Extensions Preview SDK (`@copilot-extensions/preview-sdk`)

The **original** extension SDK — for building Copilot Extensions that respond in Copilot Chat via the GitHub App model. Alpha stability, semver-safe.

**Install:** `npm install @copilot-extensions/preview-sdk`

**What it does:**
- Request verification (payload signature checking)
- Payload parsing with TypeScript types
- Response building (SSE event stream)
- Prompt execution against Copilot models

**Key exports:**
```typescript
// Verification
verifyRequestByKeyId(rawBody, signature, keyId, options)
verifyRequest(rawBody, signature, key)
fetchVerificationKeys(options)
verifyAndParseRequest(body, signature, keyID, options)

// Response events (all return strings for SSE stream)
createAckEvent()
createTextEvent(message)
createConfirmationEvent({ id, title, message, metadata })
createReferencesEvent(references[])
createErrorsEvent(errors[])
createDoneEvent()

// Parsing
parseRequestBody(body) → CopilotRequestPayload
transformPayloadForOpenAICompatibility(payload)
getUserMessage(payload)
getUserConfirmation(payload)

// Prompts
prompt(message, options) → { requestId, message }
prompt.stream(message, options) → { requestId, stream }
getFunctionCalls(result)
```

**Request payload shape (`CopilotRequestPayload`):**
```typescript
{
  copilot_thread_id: string;
  messages: CopilotMessage[];    // role: system|user|assistant
  stop: any;
  top_p: number;
  temperature: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
  copilot_skills: any[];
  agent: string;
}
```

**Response protocol:** Server-Sent Events (SSE)
```
event: copilot_ack
data: {}

event: copilot_text
data: {"body": "Hello!"}

event: copilot_done
data: {}
```

**Repo:** https://github.com/copilot-extensions/preview-sdk.js

### 1.3 Copilot Engine SDK (`@github/copilot-engine-sdk`)

For building **custom engines** that power the Copilot coding agent platform. This is the lowest level — you're building the engine that GitHub's platform orchestrates.

**Capabilities:**
- Platform Client: structured events to platform API (assistant messages, tool executions, progress)
- Git Utilities: clone, commit, push with secure credential handling
- MCP Server: exposes `report_progress` and `reply_to_comment` tools
- MCP Proxy Discovery: connect to user-configured MCP servers
- Event Factories: typed event creation
- CLI: local testing harness simulating the platform

**Quick start:**
```typescript
import { PlatformClient, cloneRepo, finalizeChanges } from "@github/copilot-engine-sdk";

const platform = new PlatformClient({
  apiUrl: process.env.GITHUB_PLATFORM_API_URL!,
  jobId: process.env.GITHUB_JOB_ID!,
  token: process.env.GITHUB_PLATFORM_API_TOKEN!,
});

await platform.sendAssistantMessage({
  turn: 1, callId: "call-123",
  content: "I'll help you with that.", toolCalls: [],
});
```

**Environment variables provided by platform:**
| Variable | Description |
|----------|-------------|
| `GITHUB_JOB_ID` | Job identifier |
| `GITHUB_PLATFORM_API_TOKEN` | Platform API auth |
| `GITHUB_PLATFORM_API_URL` | Platform API URL |
| `GITHUB_INFERENCE_TOKEN` | LLM inference auth |
| `GITHUB_INFERENCE_URL` | Inference endpoint |
| `GITHUB_GIT_TOKEN` | Git operations auth |

**Status:** Early / pre-registry. Install from GitHub directly.
**Repo:** https://github.com/github/copilot-engine-sdk

---

## 2. Copilot Extensions Architecture

### 2.1 Extensions vs Agents vs Skills vs Skillsets

| Concept | What it is | Where defined | Invocation |
|---------|-----------|---------------|------------|
| **Extension** | External integration via GitHub App | GitHub App + endpoint | `@mention` in Copilot Chat |
| **Skillset** (within Extension) | Lightweight API integration (up to 5 endpoints) | JSON schema in GitHub App config | Copilot routes automatically |
| **Agent** (within Extension) | Full control extension with custom LLM orchestration | Server-side code + GitHub App | `@mention` in Copilot Chat |
| **Custom Agent** (local) | `.agent.md` config file defining persona + tools | `.github/agents/` or `~/.copilot/agents/` | Slash commands or auto-selection |
| **Skill** (local) | Reusable workflow module | `.github/skills/` or `~/.copilot/skills/` | Agents invoke or `/command` |

**Key distinction:** Skillsets let GitHub handle all AI logic — you just expose REST endpoints. Agent extensions give you full control of the conversation, model selection, and tool orchestration.

**An extension cannot be both a skillset and an agent.**

### 2.2 Authentication for Extensions

**Request verification headers (as of March 2025):**
- `X-GitHub-Public-Key-Identifier` — key ID for signature verification
- `X-GitHub-Public-Key-Signature` — signature of request body
- `X-GitHub-Token` — scoped API token (user permissions ∩ app permissions)

**Public key endpoint:** `https://api.github.com/meta/public_keys/copilot_api`

**Transition underway:** Moving from `X-GitHub-Token` to native OIDC for third-party auth. Reduces API roundtrips and improves security.

### 2.3 Response Protocol

Extensions respond via **Server-Sent Events (SSE)**:
- `Content-Type: text/event-stream`
- Events: `copilot_ack`, `copilot_text`, `copilot_confirmation`, `copilot_references`, `copilot_errors`, `copilot_done`
- Unidirectional stream: server → client
- Supports streaming partial results

### 2.4 Building a Copilot Extension (End-to-End)

1. Create a GitHub App (Developer Settings)
2. Set callback URL to your endpoint
3. Configure permissions (Copilot Chat read access minimum)
4. Implement endpoint:
   - Verify request signature
   - Parse payload
   - Process request (call LLMs, tools, APIs)
   - Stream SSE response
5. Install app on target org/repo
6. Invoke via `@your-extension` in Copilot Chat

**Example repos:**
- `copilot-extensions/blackbeard-extension` — Hello world (JS)
- `copilot-extensions/github-models-extension` — GitHub Models integration (TS)

---

## 3. GitHub Platform APIs for Copilot

### 3.1 REST API Endpoints

**Administration:**
- `GET/PUT` Copilot coding agent permissions for org
- `GET` repos enabled for coding agent
- `POST` enable/disable repo for coding agent
- Content exclusion management
- Seat assignment management (list, add, remove users/teams)

**Metrics:**
- Usage metrics per org, team, enterprise, user
- Daily usage metrics

**Coding Agent Runs (Actions integration):**
- `GET /repos/{owner}/{repo}/actions/copilot/runs` — list runs
- `POST /repos/{owner}/{repo}/actions/copilot/runs` — trigger run
- `GET /repos/{owner}/{repo}/actions/copilot/runs/{run_id}` — run details

**Docs:** https://docs.github.com/en/rest/copilot

### 3.2 GraphQL API

**Assigning issues to Copilot coding agent:**
```graphql
mutation {
  addAssigneesToAssignable(input: {
    assignableId: "ISSUE_NODE_ID"
    assigneeIds: ["COPILOT_BOT_ID"]
  }) { ... }
}
```

**Required header:** `GraphQL-Features: issues_copilot_assignment_api_support`

Also available via REST: `POST /repos/{owner}/{repo}/issues/{number}/assignees`

### 3.3 Webhooks / Events

Copilot coding agent activity creates standard GitHub events:
- Pull request events (creation, updates)
- Check suite / check run events
- Issue assignment events
- Actions workflow events

No Copilot-specific webhook event types exist — it's all standard GitHub primitives.

---

## 4. MCP (Model Context Protocol) Integration

### 4.1 What MCP Is

Open standard for connecting AI models to external tools/services. Three primitives:
- **Tools** — functions the AI can call (e.g., `get_forecast`, `create_issue`)
- **Resources** — data endpoints (files, logs, schemas)
- **Prompts** — reusable instruction templates

### 4.2 Configuration Locations

| Location | Scope | Format |
|----------|-------|--------|
| `.vscode/mcp.json` | Workspace (VS Code) | `{ servers: { ... }, inputs: [...] }` |
| `~/.copilot/mcp-config.json` | User (CLI) | `{ mcpServers: { ... } }` |
| `.copilot/mcp.json` | Repository | Same as VS Code format |

**Server types:**
- `stdio` — local process (command + args)
- `http` — remote HTTP endpoint

**Example (VS Code workspace):**
```json
{
  "servers": {
    "my-server": {
      "type": "stdio",
      "command": "python",
      "args": ["weather.py"]
    },
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${input:github_mcp_pat}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "github_mcp_pat",
      "description": "GitHub PAT",
      "password": true
    }
  ]
}
```

### 4.3 Building an MCP Server

**Python (FastMCP):**
```python
from mcp.server.fastmcp import FastMCP
mcp = FastMCP("my-server")

@mcp.tool()
def get_forecast(location: str) -> str:
    return f"Sunny in {location}"

if __name__ == "__main__":
    mcp.run()
```

**.NET:**
```bash
dotnet add package ModelContextProtocol --prerelease
```

**TypeScript:** Use `@modelcontextprotocol/sdk`

**SDKs available:** Python (`mcp`), TypeScript, C#, Java, Kotlin

### 4.4 MCP in the Copilot Engine SDK

The engine SDK provides:
- Built-in MCP server with `report_progress` and `reply_to_comment` tools
- MCP Proxy Discovery to find user-configured MCP servers
- Full integration with platform event pipeline

---

## 5. Copilot Coding Agent

### 5.1 How It Works

The coding agent is an autonomous AI that runs in an isolated GitHub Actions container:

1. **Trigger:** Assign issue to `@copilot`, use chat command, or API
2. **Setup:** Executes `.github/workflows/copilot-setup-steps.yml`
3. **Analysis:** Reads issue, explores codebase
4. **Coding:** Makes changes iteratively, runs tests/linters
5. **PR:** Creates a pull request (never merges its own PRs)
6. **Review:** Human reviews, can request changes

### 5.2 `copilot-setup-steps.yml`

```yaml
name: "Copilot Setup Steps"
on:
  workflow_dispatch:
  push:
    paths: [.github/workflows/copilot-setup-steps.yml]
  pull_request:
    paths: [.github/workflows/copilot-setup-steps.yml]

jobs:
  copilot-setup-steps:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
```

**Rules:**
- Must contain exactly one job named `copilot-setup-steps`
- Runs before the agent starts coding
- Can install tools, SDKs, dependencies
- Can use self-hosted or non-default runners
- Keep permissions minimal

### 5.3 Capabilities & Limits

**Can do:**
- Autonomous PR generation from issues
- Run builds, tests, linters
- Custom environment setup
- Integrate with MCP servers
- Obey custom instructions and skills

**Cannot do:**
- Merge its own PRs
- Span multiple repos
- Create multiple PRs from one issue
- Self-approve PRs

**Requirements:**
- Copilot Pro/Business/Enterprise subscription
- Repo write access
- GitHub-hosted repo

---

## 6. Copilot Customization Ecosystem

### 6.1 File Structure

```
repo/
├── .github/
│   ├── copilot-instructions.md              # Repo-wide instructions
│   ├── instructions/
│   │   ├── frontend.instructions.md         # Path-scoped (applyTo globs)
│   │   └── backend.instructions.md
│   ├── prompts/
│   │   └── *.prompt.md                      # Reusable prompt templates
│   ├── agents/
│   │   └── *.agent.md                       # Custom agent definitions
│   ├── skills/
│   │   └── skill-name/
│   │       └── SKILL.md                     # Skill definition
│   └── workflows/
│       └── copilot-setup-steps.yml
```

### 6.2 Priority Order

Personal instructions > Repository instructions > Organization instructions

### 6.3 Limits

- First 4,000 characters of instruction files used for Code Review
- No limit for Chat and Coding Agent contexts

---

## 7. Practical Assessment for Our Project

### What's stable and ready:
- **Copilot Extensions** (GA as of Feb 2025) — both skillset and agent patterns
- **Preview SDK** (`@copilot-extensions/preview-sdk`) — alpha but production-usable
- **MCP integration** — well-supported across VS Code, CLI, JetBrains
- **Coding Agent** — available with Copilot Pro+
- **Custom instructions/agents/skills** — stable file-based system

### What's in preview / evolving:
- **Copilot CLI SDK** (`@github/copilot-sdk`) — Technical Preview, very active
- **Engine SDK** (`@github/copilot-engine-sdk`) — early, pre-registry
- **OIDC auth for extensions** — transitioning from token-based
- **Copilot Actions API** (runs endpoint) — newer surface

### What matters for a plugin marketplace:
1. The **Copilot CLI SDK** is the embed-Copilot-in-your-app story — highly relevant
2. **Extensions** (skillsets) are the lightweight distribution model for Copilot Chat plugins
3. **MCP** is the tool-integration protocol — standard across the ecosystem
4. Custom **agents/skills** are the local customization layer (`.agent.md`, `SKILL.md`)
5. The **Engine SDK** is for building alternative coding agent engines — advanced use case

---

## Key Links

| Resource | URL |
|----------|-----|
| Copilot SDK repo | https://github.com/github/copilot-sdk |
| Engine SDK repo | https://github.com/github/copilot-engine-sdk |
| Preview SDK repo | https://github.com/copilot-extensions/preview-sdk.js |
| Copilot SDK Java | https://github.com/github/copilot-sdk-java |
| Extensions examples | https://github.com/copilot-extensions |
| REST API docs | https://docs.github.com/en/rest/copilot |
| MCP setup docs | https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp |
| Coding agent docs | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent |
| Custom instructions | https://docs.github.com/en/copilot/tutorials/use-custom-instructions |
| Agent skills docs | https://docs.github.com/en/copilot/concepts/agents/about-agent-skills |
| MCP spec | https://modelcontextprotocol.org |
| Awesome Copilot | https://github.com/github/awesome-copilot |
| npm: preview-sdk | https://www.npmjs.com/package/@copilot-extensions/preview-sdk |
| npm: copilot-sdk | https://www.npmjs.com/package/@github/copilot-sdk |
