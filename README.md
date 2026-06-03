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
| `prescriber_state` | Prescriber counters (`sessions_since_install`, `pending_count`) |
| `topology_cache` | Artifact discovery scan results |

## Installation

**As a library:**

> **Note:** `@akubly/cairn` is a workspace-internal package. The API follows
> pre-1.0 SemVer (minor bumps signal breaking changes). External use is not
> officially supported — pin to an exact version if you depend on it outside
> this monorepo.

```bash
npm install @akubly/cairn
```

**As a Copilot CLI plugin** (hooks + MCP server, no manual wiring):

Clone this repo and point your Copilot CLI at it. The manifests in `.github/plugin/` configure hooks and the MCP server automatically.

---

## forge-mcp: Bash Shell Init (M2)

Wire Cairn's session-start telemetry hook into your interactive bash sessions
so the prescriber runs automatically each time you open a terminal.

### Prerequisites

- **Node.js** ≥ 20 on your `PATH`
- Either: the repo cloned and built locally (`npm run build`), **or** the
  runtime package installed globally (`npm install -g @akubly/skillsmith-runtime`)

### Install (one-time, idempotent)

```bash
# From the repo root:
bash .github/hooks/cairn/install.sh
```

This appends a guarded `source` block to `~/.bashrc`. Re-running is safe — the
script checks for the marker before appending and exits with a message if
already installed.

### Reload and verify

```bash
source ~/.bashrc
forge_mcp_check
```

`forge_mcp_check` is a shell function loaded by `shell-init.sh`. It reports the
resolved script path, package version, and Node.js availability — your smoke test
after every install or update.

Expected output (success):

```
forge-mcp shell init: checking install...
  _FORGE_MCP_SHELL_INIT_LOADED = 1
  sessionStart script: /usr/local/lib/node_modules/@akubly/skillsmith-runtime/dist/hooks/sessionStart.js
  package version: 0.1.0
  node: v22.11.0

  ✓ forge-mcp shell init is correctly installed.
```

If `sessionStart script: NOT FOUND` is reported, build the local repo or install
the runtime globally:

```bash
npm run build
# Or: npm install -g @akubly/skillsmith-runtime
# Then re-run: forge_mcp_check
```

### How it works

`shell-init.sh` is sourced by `~/.bashrc` on every new interactive bash session.
It resolves the `sessionStart.js` entrypoint (see the table below for exact
priority order), then runs it detached in the background so it never blocks your
prompt. Non-interactive shells (scripts, CI) are skipped via
`[[ $- != *i* ]] && return`.

**Script resolution order:**

| Priority | Path | Notes |
|----------|------|-------|
| 1 | `~/.cairn/hook/sessionStart.mjs` (user override) | User-managed hook |
| 2 | `$(npm root -g)/@akubly/skillsmith-runtime/dist/hooks/sessionStart.js` | Preferred runtime |
| 3 | `$(npm root -g)/@akubly/cairn/dist/hooks/sessionStart.js` | Cairn fallback; Wave 2 behavior, no prescribers |
| 4 | `<repo>/packages/skillsmith-runtime/dist/hooks/sessionStart.js` | Preferred local checkout |
| 5 | `<repo>/packages/cairn/dist/hooks/sessionStart.js` | Cairn fallback; Wave 2 behavior, no prescribers |
| 6 | `<repo>/dist/hooks/sessionStart.js` | Legacy cairn fallback; Wave 2 behavior, no prescribers |

### Uninstall

```bash
bash .github/hooks/cairn/uninstall.sh
source ~/.bashrc
```

The uninstall script removes the entire marker block from `~/.bashrc` using a
pure-bash line-by-line filter (no sed dependency; identical behavior on Linux,
macOS, and Git Bash on Windows). Idempotent: no-op if not installed.

### Shell compatibility

`shell-init.sh` is supported for bash and Git Bash. Do not source it from zsh:
the hook uses bash-specific `${BASH_SOURCE[0]}` self-location for repo-checkout
fallbacks, so zsh sourcing can break local repo resolution. Automated zsh wiring
is deferred — file a GitHub issue if you need first-class zsh support.

### Git Bash on Windows

The bash hooks work in Git Bash on Windows. Ensure `node` is on the Git Bash
`PATH` (usually automatic if Node.js is installed system-wide). The hook fires
silently in the background — no `disown` issues on MSYS2-based shells.

---

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

Cairn supports two MCP setup paths:

1. **Plugin** (recommended) — the manifests in `.github/plugin/` (including `.mcp.json`) declare hooks, the MCP server, and metadata. The Copilot CLI wires everything automatically on install. No additional config needed.

2. **Manual MCP registration** — if not using the plugin flow, register Cairn's MCP server directly via `.copilot/mcp-config.json` (repo-scoped, checked in) or `~/.copilot/mcp-config.json` (user-scoped, personal overrides).

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