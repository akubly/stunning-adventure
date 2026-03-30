# 🪨 Cairn

> Built stone by stone. Showing the way.

An agentic software engineering platform that serves as a mirror — reflecting your engineering practice back to you with honest, actionable clarity.

## Philosophy

1. **Honest about human limitations** — fatigue, impatience, rubber-stamping. Not shameful. Just real.
2. **Self-reflection as a feature** — shows you your own patterns, not to judge, but to inform.
3. **Growth is the metric** — not velocity, not coverage, not throughput. *Are you getting better?*
4. **Agents as individuals** — natural language, persistent memory, evolving relationships.

## What's Built

Cairn stores all data in `~/.cairn/knowledge.db` (SQLite, WAL mode). Two agents operate on that shared knowledge base today:

### Archivist — *records what happened*

Session recording, event logging, and queryable session state.

- **Session lifecycle** — start, resume, stop, crash recovery
- **Event recording** — tool use, errors, guardrail skips — all secret-scrubbed (9 pattern categories)
- **Queryable state** — session summaries, event search, "has X occurred?" checks
- **Copilot CLI integration** — `postToolUse` hook records events automatically

### Curator — *finds what it means*

Processes the event stream to detect patterns and generate insights.

- **Cursor-based processing** — idempotent, crash-safe (transactional), processes only new events
- **Recurring error detection** — groups errors by category+message, surfaces patterns at threshold
- **Error sequence detection** — finds `event → error` temporal correlations within sessions
- **Skip frequency detection** — identifies habitually bypassed guardrails
- **Static prescriptions** — actionable advice by error category (build, test, type, lint, auth)
- **Insight lifecycle** — active → stale → pruned, with evidence tracking and reinforcement

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
npm test          # 106 tests (vitest)
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
```

## Roadmap

| Phase | Agent | Status |
|-------|-------|--------|
| 0–1a | Foundation + Schema | ✅ Done |
| 1b–2 | Archivist + Event Infrastructure | ✅ Done |
| 3 | Curator + Pattern Detection | ✅ Done |
| — | **Validation Gate** | ⬜ Next |
| 4 | Compiler (plugin validation + builder) | ⬜ Planned |
| 5+ | Distribution, CLI, Narrative UX | ⬜ Planned |

## License

MIT