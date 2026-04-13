# 🪨 Cairn

> Built stone by stone. Showing the way.

An agentic software engineering platform that serves as a mirror — reflecting your engineering practice back to you with honest, actionable clarity.

## Philosophy

1. **Honest about human limitations** — fatigue, impatience, rubber-stamping. Not shameful. Just real.
2. **Self-reflection as a feature** — shows you your own patterns, not to judge, but to inform.
3. **Growth is the metric** — not velocity, not coverage, not throughput. *Are you getting better?*
4. **Agents as individuals** — natural language, persistent memory, evolving relationships.

## What's Built

Cairn stores all data in `~/.cairn/knowledge.db` (SQLite, WAL mode). Three agents, a hook system, and an MCP server operate on that shared knowledge base:

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

### Prescriber — *closes the feedback loop*

Transforms Curator insights into concrete, prioritized improvement suggestions. Closes the observe→analyze→act loop.

- **Prescription generation** — templates per pattern type (recurring error, error sequence, skip frequency)
- **Priority scoring** — currently confidence-based, so higher-confidence patterns are surfaced first
- **8-state lifecycle** — generated → accepted → applied (or rejected/deferred/expired/suppressed/failed)
- **Human-in-the-loop** — prescriptions require explicit acceptance before the Apply Engine writes anything
- **Apply Engine** — writes sidecar `.instructions.md` files with rollback support and drift detection
- **Auto-suppression** — prescriptions are suppressed automatically after repeated deferrals reach a configurable threshold; duplicates are prevented by idempotency checks
- **Session-aware deferral** — deferred prescriptions resurface after a configurable number of sessions until they are accepted, rejected, or auto-suppressed

### Hooks — *connects to Copilot CLI*

Copilot CLI hooks wire Cairn into every tool call, fail-open so they never break your workflow. Hooks are packaged as a Copilot CLI plugin (`.github/plugin/hooks.json`) and also available as PowerShell wrappers (`.github/hooks/cairn/*.ps1`).

- **`preToolUse`** — session catch-up and crash recovery. On first tool call, recovers any orphaned session, runs curation, and chains the Prescriber when insights change. On subsequent calls, exits immediately (fast path).
- **`postToolUse`** — event recording. Reads the hook payload from stdin, logs tool use or errors to the active session via the Archivist.

### MCP Server — *speaks to conversations*

Ten tools expose Cairn's knowledge base to Copilot conversations. Tool names follow a verb–noun convention (`get_status`, not `status_get`) so agents can infer behavior from the name alone.

| Tool | What it answers |
|------|----------------|
| `get_status` | What is Cairn tracking right now? (active session + curator health) |
| `list_insights` | What patterns has the curator found? (filterable by status) |
| `get_session` | What happened in a specific session? (events, errors, skips) |
| `search_events` | Find events by type pattern within a session |
| `run_curate` | Trigger the curator to process new events and discover patterns |
| `check_event` | Has a specific event type occurred? (boolean) |
| `list_prescriptions` | What improvement suggestions are available? (filterable by status) |
| `get_prescription` | Full detail on a specific suggestion — rationale, proposed change, diff preview |
| `resolve_prescription` | Accept, reject, or defer a suggestion |
| `show_growth` | How have patterns been resolved over time? (trends + stats) |

### Knowledge Store

| Table | Purpose |
|-------|---------|
| `sessions` | Session lifecycle tracking |
| `event_log` | Immutable event stream |
| `insights` | Pattern-based discoveries with evidence and prescriptions |
| `prescriptions` | Improvement suggestions with 8-state lifecycle |
| `managed_artifacts` | Files written by the Apply Engine (checksums + rollback) |
| `errors` | Error records for RCA |
| `preferences` | Cascading settings (session → user → system) |
| `skip_breadcrumbs` | Intentional guardrail skip tracking |
| `curator_state` | Processing cursor (singleton) |
| `topology_cache` | Artifact discovery scan results |

## Installation

```bash
npm install @akubly/cairn
```

Cairn is also packaged as a Copilot CLI plugin (`.github/plugin/`). The plugin configures hooks and MCP server automatically — no manual wiring required.

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

## Roadmap

| Phase | What | Status |
|-------|------|--------|
| 0–1a | Foundation + Schema | ✅ Done |
| 1b–2 | Archivist + Event Infrastructure | ✅ Done |
| 3 | Curator + Pattern Detection | ✅ Done |
| 4 | Session Hooks + Crash Recovery | ✅ Done |
| 5 | MCP Server | ✅ Done |
| 6 | Plugin Packaging | ✅ Done |
| 7 | Prescriber — Close the feedback loop | ✅ Done |

## License

MIT