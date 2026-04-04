# 🪨 Cairn

> Built stone by stone. Showing the way.

An agentic software engineering platform that serves as a mirror — reflecting your engineering practice back to you with honest, actionable clarity.

## Philosophy

1. **Honest about human limitations** — fatigue, impatience, rubber-stamping. Not shameful. Just real.
2. **Self-reflection as a feature** — shows you your own patterns, not to judge, but to inform.
3. **Growth is the metric** — not velocity, not coverage, not throughput. *Are you getting better?*
4. **Agents as individuals** — natural language, persistent memory, evolving relationships.

## What's Built

Cairn stores all data in `~/.cairn/knowledge.db` (SQLite, WAL mode). Two agents, a hook system, and an MCP server operate on that shared knowledge base:

### Archivist — *records what happened*

Session recording, event logging, and queryable session state.

- **Session lifecycle** — start, resume, stop, crash recovery
- **Event recording** — tool use, errors, guardrail skips — all secret-scrubbed (9 pattern categories)
- **Queryable state** — session summaries, event search, "has X occurred?" checks

### Curator — *finds what it means*

Processes the event stream to detect patterns and generate insights.

- **Cursor-based processing** — idempotent, crash-safe (transactional), processes only new events
- **Recurring error detection** — groups errors by category+message, surfaces patterns at threshold
- **Error sequence detection** — finds `event → error` temporal correlations within sessions
- **Skip frequency detection** — identifies habitually bypassed guardrails
- **Static prescriptions** — actionable advice by error category (build, test, type, lint, auth)
- **Insight lifecycle** — active → stale → pruned, with evidence tracking and reinforcement

### Hooks — *connects to Copilot CLI*

Copilot CLI hooks wire Cairn into every tool call, fail-open so they never break your workflow.

- **`preToolUse`** — session catch-up and crash recovery. On first tool call, recovers any orphaned session and runs curation. On subsequent calls, exits immediately (fast path).
- **`postToolUse`** — event recording. Reads the hook payload from stdin, logs tool use or errors to the active session via the Archivist.

### MCP Server — *speaks to conversations*

Six tools expose Cairn's knowledge base to Copilot conversations. Tool names follow a verb–noun convention (`get_status`, not `status_get`) so agents can infer behavior from the name alone.

| Tool | What it answers |
|------|----------------|
| `get_status` | What is Cairn tracking right now? (active session + curator health) |
| `list_insights` | What patterns has the curator found? (filterable by status) |
| `get_session` | What happened in a specific session? (events, errors, skips) |
| `search_events` | Find events by type pattern within a session |
| `run_curate` | Trigger the curator to process new events and discover patterns |
| `check_event` | Has a specific event type occurred? (boolean) |

### Knowledge Store

| Table | Purpose |
|-------|---------|
| `sessions` | Session lifecycle tracking |
| `event_log` | Immutable event stream |
| `insights` | Pattern-based discoveries with evidence and prescriptions |
| `errors` | Error records for RCA |
| `preferences` | Cascading settings (session → user → system) |
| `skip_breadcrumbs` | Intentional guardrail skip tracking |
| `curator_state` | Processing cursor (singleton) |

## Installation

```bash
npm install @akubly/cairn
```

For development or pre-publish use:

```bash
git clone https://github.com/akubly/stunning-adventure.git
cd stunning-adventure
npm install && npm run build && npm link
```

Then register the MCP server — see [Plugin Packaging](#plugin-packaging) for config options.

## Usage

Cairn is a TypeScript library (`@akubly/cairn`). Import and use programmatically:

```typescript
import {
  startArchivistSession,
  recordToolUse,
  recordError,
  curate,
  getCuratorStatus,
  getInsights,
} from '@akubly/cairn';

// Record
const sessionId = startArchivistSession('org/repo', 'main');
recordToolUse(sessionId, 'grep', { pattern: 'TODO' });
recordError(sessionId, 'build', 'TS2345: Type mismatch');

// Analyze
const result = curate(); // → { eventsProcessed, insightsCreated, insightsReinforced }
const status = getCuratorStatus();
const insights = getInsights('active');
```

## Development

```bash
npm install
npm run build     # TypeScript → dist/
npm test          # 136 tests across 6 files (vitest)
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm run mcp       # Start the MCP server (requires build first)
```

## Plugin Packaging

Cairn ships as a Copilot CLI plugin. The manifests in `.github/plugin/` declare hooks, MCP tools, and metadata so the CLI can wire everything automatically on install.

**MCP config** can live in two places — repo-scoped (`.copilot/mcp-config.json`, checked into the project) or user-scoped (`~/.copilot/mcp-config.json`, personal overrides). Repo-scoped config is picked up automatically when working inside the repo; user-scoped config applies globally.

For local development, `npm link` + the repo-scoped config is enough. For global use, copy the server entry to your user-scoped config.

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| 0–1a | Foundation + Schema | ✅ Done |
| 1b–2 | Archivist + Event Infrastructure | ✅ Done |
| 3 | Curator + Pattern Detection | ✅ Done |
| 4 | Session Hooks + Crash Recovery | ✅ Done |
| 5 | MCP Server — 6 tools | ✅ Done |
| 6 | Plugin Packaging | ⬜ Current |

## License

MIT