# 🪨 Cairn

> Built stone by stone. Showing the way.

An agentic software engineering platform that serves as a mirror — reflecting your engineering practice back to you with honest, actionable clarity.

## Philosophy

1. **Honest about human limitations** — fatigue, impatience, rubber-stamping. Not shameful. Just real.
2. **Self-reflection as a feature** — shows you your own patterns, not to judge, but to inform.
3. **Growth is the metric** — not velocity, not coverage, not throughput. *Are you getting better?*
4. **Agents as individuals** — natural language, persistent memory, evolving relationships.

## Architecture

Cairn is a composable toolkit distributed as standard GitHub Copilot CLI artifacts.

```
Layer 3: User-Facing Experiences (CLI, Narrative UX, NL queries)
Layer 2: Assemblers (Plugin Manager, Compiler)
Layer 1: Primitive Agents (Curator, Archivist)
Foundation: knowledge.db (SQLite, WAL mode)
```

### Core Agents

| Agent | Role |
|-------|------|
| **Curator** | Knowledge custodian, error processor, RCA pipeline |
| **Compiler** | BYO plugin validator + builder (build & audit modes) |
| **Archivist** | Session recording, narrative logging, NL queries |

## Getting Started

```bash
npm install -g @akubly/cairn
cairn --help
```

## Development

```bash
npm install
npm run build
npm test
```

## License

MIT