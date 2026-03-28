# Recon: Prior Infrastructure Inventory & Agentic Best Practices

**Author:** Gabriel Knight (Infrastructure)
**Date:** 2026-03-28
**Status:** Complete

---

## Section 1 — Prior Infrastructure Inventory

### Repository: `akubly/.copilot` (GitHub)

Aaron's existing Copilot infrastructure is a mature, deeply engineered system originally built for Windows OS / Mobile Connectivity development. It represents hundreds of hours of iterative refinement.

### Complete File Tree

```
akubly/.copilot/
├── .github/
│   └── instructions/
│       ├── global.instructions.md                    (10.5 KB) — Razzle env, build system, search strategy
│       ├── global-cli.instructions.md                (5.3 KB)  — CLI-specific workflow (build cmds, Search-Code)
│       ├── global-vscode.instructions.md             (5.2 KB)  — VS Code-specific workflow
│       └── memory-mcp-agent-learning.instructions.md (14.3 KB) — Persistent learning across sessions
├── .gitignore                                        — Excludes personal/, config.json, session-state/, etc.
├── agents/
│   └── code-reviewer.agent.md                        (9.9 KB)  — Multi-source code review orchestrator
├── copilot-instructions.md                           (5.7 KB)  — Aaron's personal behavioral rules + workflow gates
├── dependencies.yaml                                 (1.9 KB)  — Full dependency manifest for the skill corpus
├── hooks/
│   ├── environment-preflight/                        — Session-start env check (PS1 + hooks.json)
│   ├── error-tracking/                               — Post-tool error logging to sidecar files
│   ├── governance-audit/                             — Session-end containment coverage check (stub)
│   ├── post-tool-tracking/                           — Tracks every tool call, modified files, stats
│   ├── prompt-audit/                                 — Logs full prompt text for analysis
│   ├── session-summary/                              — Session-end persistence to last-session.json + history
│   ├── skill-lifecycle/                              — Skill init/summary with SQL observability tables
│   ├── subagent-tracking/                            — Logs subagent spawn/complete events
│   ├── tool-guards/                                  — Pre-tool safety guardrails (git ops, VFS, secrets, kill safety, build pre-check)
│   └── turn-checkpoint/                              — Per-turn state snapshots for recovery
├── knowledge/
│   ├── concepts/
│   │   ├── ai-assisted-engineering.md                (6.2 KB)  — Trust spectrum, anti-patterns, workflow gates
│   │   └── code-review-patterns.md                   (17.6 KB) — 20 actionable rules from 2,670 real reviews
│   └── technologies/
│       ├── persona-review-panels.md                  (20.6 KB) — Panel definitions (Code, Design, Writing)
│       └── pr-review-voice.md                        (17.0 KB) — Aaron's writing voice for PR comments
├── QUICKSTART.md                                     (4.8 KB)  — Team onboarding guide
├── README.md                                         (1.2 KB)  — Placeholder
├── skills/
│   ├── _shared/
│   │   ├── mcp-setup.md                              (3.0 KB)  — MCP server installation guide
│   │   ├── observability.sql                         (2.0 KB)  — Shared SQL schema (skill_execution_log, session_config, error_breadcrumbs)
│   │   ├── schema.md                                 (4.2 KB)  — Cross-skill session DB data contracts
│   │   └── template.md                               (3.0 KB)  — Canonical skill template with required sections
│   └── persona-review/
│       └── SKILL.md                                  (13.7 KB) — Full persona review skill (parallel sub-agents, severity triage)
└── dependencies.yaml                                 (1.9 KB)  — Runtime deps (node, python, git, MCP servers, PS modules)
```

### Component Analysis

#### 1. Instruction Files (`.github/instructions/`)

**What they do:** Layered instruction system. `global.instructions.md` covers Razzle build env and code search. CLI and VSCode variants add tool-specific guidance. `memory-mcp-agent-learning.instructions.md` is a 14KB file teaching the agent persistent learning via Memory MCP.

**Maturity:** HIGH. These represent significant domain-specific tuning for Windows OS development. The layered approach (global → tool-specific) is well-designed.

**Reusable pattern:** The layered instruction architecture. Not the content (Windows/Razzle-specific).

#### 2. Agent: Code Reviewer (`agents/code-reviewer.agent.md`)

**What it does:** A sophisticated multi-source code review orchestrator that:
- Runs its own 4-pass review (blocking → non-blocking → nits → meta-checks)
- Spawns the built-in `code-review` subagent independently
- Launches 4+ Code Panel personas in parallel
- Merges, deduplicates, and severity-maps all findings through Aaron's voice

**Maturity:** VERY HIGH. This is the most sophisticated single artifact — it encodes 20 rules derived from 2,670 real review comments with severity model, voice calibration, language-specific adjustments, and component-level review depth tuning.

**Reusable pattern:** Multi-source review orchestration with parallel subagents. The merge/deduplicate/severity-map pipeline is excellent.

#### 3. Core Instructions (`copilot-instructions.md`)

**What it does:** Aaron's personal behavioral configuration:
- Personal knowledge base structure (diary, TODO, aspirations, learning roadmap)
- Knowledge organization taxonomy: concepts (WHAT) vs technologies (HOW) vs skills (multi-step workflows)
- Writing voice calibration
- Two mandatory workflow gates:
  1. **Decision-Point Gate** — stop at forks and present options
  2. **Pre-Output Persona Review Gate** — review all deliverables before presentation
- "First Thought Might Be Wrong" discipline (anti-anchoring)

**Maturity:** VERY HIGH. This is Aaron's core operating philosophy for AI collaboration, battle-tested over months.

**Reusable patterns:**
- Knowledge taxonomy (concepts/technologies/skills) — **directly applicable**
- Decision-Point Gate — **directly applicable**
- Anti-anchoring discipline — **directly applicable**
- Proportionality clause (lightweight review for trivial changes) — **directly applicable**

#### 4. Knowledge Base (`knowledge/`)

**Concepts:**
- `ai-assisted-engineering.md` — Trust spectrum, per-phase guidelines, structural safeguards, anti-patterns. Foundational document.
- `code-review-patterns.md` — 20 rules organized by severity (7 blocking, 7 non-blocking, 6 nit) with trigger conditions and examples.

**Technologies:**
- `persona-review-panels.md` — Defines Code, Design, and Writing review panels with specific personas, focus areas, and key questions per persona.
- `pr-review-voice.md` — Aaron's review voice: comment formatting, severity labeling, scope labels, question-based concerns.

**Maturity:** HIGH. Well-organized with clear separation of concerns.

#### 5. Skills System (`skills/`)

**Shared infrastructure:**
- `template.md` — Canonical skill structure with required sections (frontmatter, triggers, goal, inputs, workflow, error recovery, session DB, constraints)
- `schema.md` — Cross-skill session DB data contracts defining pipeline tables (source→build, VM lifecycle, test execution, PR & release, investigation, feature validation)
- `observability.sql` — Shared SQL schema for skill execution tracking
- `mcp-setup.md` — MCP server installation guide

**Skills:**
- `persona-review/SKILL.md` — Full implementation: classify artifact → spawn parallel personas → collect/deduplicate → present with reasoning → track disposition → re-review cycle

**Maturity:** HIGH. The skill framework is well-designed with strong contracts. Only one skill (`persona-review`) is in this public repo; the QUICKSTART references 30+ skills in an internal ADO repo.

**Reusable patterns:**
- Skill template structure — **directly applicable**
- Session DB data contracts — **pattern applicable** (tables are domain-specific)
- Observability SQL schema — **directly applicable**

#### 6. Hooks System (`hooks/`)

10 hooks covering the full session lifecycle:

| Hook | Trigger | Purpose |
|------|---------|---------|
| `environment-preflight` | Session start | Validate env prerequisites |
| `error-tracking` | Post-tool | Log errors to sidecar files |
| `governance-audit` | Session end | Check containment coverage (stub) |
| `post-tool-tracking` | Post-tool | Track tool calls, modified files, stats |
| `prompt-audit` | Pre-inference | Log prompt text for analysis |
| `session-summary` | Session end | Persist session state for cross-session recall |
| `skill-lifecycle` | Skill start/end | Create observability tables, track execution |
| `subagent-tracking` | Task spawn | Log subagent lifecycle events |
| `tool-guards` | Pre-tool | **Safety guardrails** (git ops, VFS hydration, secret leak, process kill, build pre-check) |
| `turn-checkpoint` | Per-turn | State snapshots for recovery |

**Maturity:** HIGH. The `tool-guards` hook is particularly sophisticated with 5 guard types, approval token flow, VFS caching, and fail-open design. Performance-conscious (<5ms fast path).

**Reusable patterns:**
- Tool-guards architecture (pre-tool safety with fail-open) — **directly applicable**
- Session-summary persistence pattern (sidecar files → JSON) — **directly applicable**
- Observability pipeline (post-tool tracking → error tracking → session summary) — **directly applicable**

#### 7. Dependencies (`dependencies.yaml`)

**What it does:** Declarative manifest of all runtime, environment, MCP server, PowerShell module, and plugin dependencies used by the skill corpus.

**Maturity:** MEDIUM. Good documentation, but mostly Windows/internal-tool specific.

**Reusable pattern:** The dependency manifest format — **applicable**

### Maturity Assessment

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Architecture | ★★★★★ | Clean separation: instructions / agents / knowledge / skills / hooks |
| Knowledge organization | ★★★★★ | Concepts vs technologies vs skills taxonomy is excellent |
| Quality gates | ★★★★★ | Decision-point + persona review gates are battle-tested |
| Hooks & observability | ★★★★☆ | Comprehensive coverage; some hooks are stubs |
| Skill framework | ★★★★☆ | Strong template + contracts; mostly internal skills |
| Documentation | ★★★★☆ | QUICKSTART is solid; README is placeholder |
| Portability | ★★☆☆☆ | Heavily coupled to Windows OS / Razzle / ADO ecosystem |

**Overall: This is a production-grade, deeply battle-tested system. The architectural patterns and quality gates are its biggest assets. The domain-specific content (Windows, Razzle, C++) is not portable, but the structural patterns absolutely are.**

### Key Reusable Assets

1. **Knowledge taxonomy** — `concepts/` (transferable WHAT) vs `technologies/` (tool-specific HOW) vs `skills/` (orchestrated workflows)
2. **Workflow gates** — Decision-Point Gate + Pre-Output Persona Review Gate
3. **Anti-anchoring discipline** — "First thought might be wrong" + alternative hypotheses
4. **Skill template** — Standardized structure with frontmatter, triggers, workflow, error recovery, DB persistence
5. **Session DB contracts** — Shared data pipeline between skills via SQLite
6. **Observability pipeline** — Tool tracking → error tracking → session summary → cross-session recall
7. **Tool guards architecture** — Pre-tool safety hooks with fail-open, approval tokens, caching
8. **Multi-source review** — Parallel independent reviewers → merge → deduplicate → severity-map
9. **Persona review skill** — Parallel persona subagents with structured finding format

---

## Section 2 — Agentic Best Practices (2025-2026)

### Key Articles and Posts Found

#### Tier 1 — Essential Reading

| Source | Title | URL | Key Insight |
|--------|-------|-----|-------------|
| Anthropic Engineering | Effective Context Engineering for AI Agents | https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents | Context as finite resource; compaction, structured note-taking, sub-agent architectures |
| GitHub Blog | How Squad Runs Coordinated AI Agents Inside Your Repository | https://github.blog/ai-and-ml/github-copilot/how-squad-runs-coordinated-ai-agents-inside-your-repository/ | Drop-box pattern, context replication, explicit memory in repo files |
| Kakao | Agentic Coding Principles & Practices | https://agentic-coding.github.io/ | 6 principles, 28 practices for moving beyond "vibe coding" |
| LangChain Blog | Context Engineering for Agents | https://blog.langchain.com/context-engineering-for-agents/ | Four pillars: Write, Select, Compress, Isolate |
| Tweag | Agentic Coding Handbook | https://tweag.github.io/agentic-coding-handbook/ | Templates, automation scripts, onboarding guides |

#### Tier 2 — Practical Guides

| Source | Title | URL |
|--------|-------|-----|
| GetBeam | Agentic Engineering in 2026: Complete Guide | https://getbeam.dev/blog/agentic-engineering-complete-guide-2026.html |
| StackViv | Agentic AI & Multi-Agent Systems: 2026 Guide | https://stackviv.ai/blog/agentic-ai-multi-agent-systems-guide |
| Fast.io | Multi-Agent Orchestration Patterns: Complete Guide 2026 | https://fast.io/resources/multi-agent-orchestration-patterns/ |
| ObviousWorks | Agentic Coding Rulebook | https://github.com/obviousworks/agentic-coding-rulebook |
| Microsoft | AI Guidelines - Vibe Coding Rules | https://github.com/microsoft/alguidelines/ |
| Vellum | Agentic Workflows: The Ultimate Guide | https://www.vellum.ai/blog/agentic-workflows-emerging-architectures-and-design-patterns |

#### Tier 3 — MCP & Tool Patterns

| Source | Title | URL |
|--------|-------|-----|
| The New Stack | 15 Best Practices for Building MCP Servers | https://thenewstack.io/15-best-practices-for-building-mcp-servers-in-production/ |
| MCPcat | MCP Server Best Practices | https://mcpcat.io/blog/mcp-server-best-practices/ |
| Microsoft | MCP for Beginners - Best Practices | https://github.com/microsoft/mcp-for-beginners/ |
| MCP Specification | Official Spec (2025-03-26) | https://modelcontextprotocol.io/specification/2025-03-26 |

#### Tier 4 — Agent Config Files

| Source | Title | URL |
|--------|-------|-----|
| HackerNoon | Complete Guide to AI Agent Memory Files | https://hackernoon.com/the-complete-guide-to-ai-agent-memory-files-claudemd-agentsmd-and-beyond |
| Substratia | AGENTS.md vs CLAUDE.md | https://substratia.io/blog/agents-md-vs-claude-md/ |
| GitHub Docs | Creating Custom Agents for Copilot | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents |
| GitHub Changelog | Copilot Coding Agent Now Supports AGENTS.md | https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/ |

### Emerging Patterns and Conventions

#### 1. Context Engineering > Prompt Engineering

The field has shifted from "how to write good prompts" to "how to manage the entire context state across multi-turn, multi-session agent interactions."

**Key principles (Anthropic):**
- Context is a **finite resource with diminishing returns** — context rot is real
- Find the **smallest possible set of high-signal tokens** that maximize desired outcomes
- System prompts should hit the "right altitude" — not brittle if-else logic, not vague platitudes
- Use **compaction** (summarize + reinitiate), **structured note-taking** (persistent memory outside context), and **sub-agent architectures** (focused context windows)

**Four Pillars (LangChain):**
1. **Write** — maintain external memory structures
2. **Select** — dynamically retrieve only relevant context
3. **Compress** — summarize, deduplicate, trim
4. **Isolate** — compartmentalize context per task/subtask

**What Aaron already does well:** The knowledge taxonomy, session DB contracts, and persona review system all embody these principles. The hook pipeline (post-tool tracking → session summary) is a practical implementation of Write + Select.

#### 2. Multi-Agent Orchestration Patterns

Four dominant patterns have emerged:

| Pattern | Structure | When to Use |
|---------|-----------|-------------|
| **Supervisor** | Central orchestrator delegates to specialists | Complex workflows with audit needs |
| **Pipeline** | Sequential hand-offs between agents | Predictable linear flows |
| **Swarm** | Parallel independent agents | Creative/redundant tasks |
| **Graph/Network** | Dynamic routing based on expertise | Large, dynamic systems |

**Squad uses the Supervisor pattern** with three key architectural decisions:
1. **Drop-box pattern** — shared decisions in versioned markdown files (decisions.md)
2. **Context replication** — each specialist gets full context, not a split share
3. **Explicit memory** — agent identity in charter + history files, versioned in repo

**What Aaron already does well:** The code-reviewer agent already uses the Swarm pattern (parallel personas) with a merge step. The decision-point gate is a form of Supervisor pattern.

#### 3. Repository-Native Agent Configuration

The community is converging on a **layered config hierarchy**:

```
Organization level:  .github-private/ or org-level policies
Repository level:    .github/copilot-instructions.md  (broad)
                     .github/instructions/*.instructions.md  (path-scoped)
                     AGENTS.md / CLAUDE.md  (cross-tool)
Agent level:         .github/agents/*.agent.md  (role-specific)
Personal level:      ~/.copilot/copilot-instructions.md  (user-specific)
```

**AGENTS.md** is becoming the vendor-neutral standard (Linux Foundation stewardship). **Best practice:** shared knowledge in AGENTS.md, tool-specific extensions in CLAUDE.md/copilot-instructions.md.

**What Aaron already does:** Uses the full hierarchy (personal copilot-instructions.md + repo instructions + agent definitions). Ahead of the curve.

#### 4. Safety and Governance

**Community consensus:**
- Pre-tool guardrails are essential (not optional)
- Git operations must be gated (commit, push, merge require approval)
- Secret leak prevention is table stakes
- Audit trails for all agent actions
- Fail-open design for guardrails (don't block legitimate work)

**What Aaron already does:** `tool-guards` hook implements all of these with sophistication (approval tokens, VFS safety, fail-open). **This is ahead of community best practice.**

#### 5. Agent Memory and Persistence

**Emerging consensus:**
- Memory files (markdown in repo) beat database-backed memory for legibility, versioning, and auditability
- Keep memory files concise (<300 lines recommended)
- Hierarchical loading (org → repo → dir → user)
- Auto-memory systems are emerging but files remain ground truth
- Cross-session recall via structured JSON persistence

**What Aaron already does:** `session-summary` hook writes `last-session.json` + `session-history.jsonl`. Memory MCP instructions are 14KB. The personal knowledge base (diary, TODO, aspirations, roadmap) is sophisticated.

#### 6. Agentic Coding Principles (Kakao's 6 Principles)

1. **Developer Accountability** — AI assists; humans own
2. **Understand and Verify** — No blind acceptance
3. **Prioritize Security** — No sensitive data to external agents
4. **Maintain Quality Standards** — Agent output must meet team conventions
5. **Human-Led Design** — Core design decisions are human-driven
6. **Recognize AI Limitations** — Know the boundaries, adapt continuously

**Aaron's alignment:** Principles 1-6 are all encoded in `ai-assisted-engineering.md` and the workflow gates. The trust spectrum (higher autonomy → lower autonomy → critical verification) maps directly to Principles 1, 2, and 6.

### Community Consensus vs. Experimental

| Topic | Consensus | Experimental |
|-------|-----------|-------------|
| Context as finite resource | ✅ Strong consensus | — |
| Human-in-the-loop for decisions | ✅ Strong consensus | — |
| Parallel subagent review | ✅ Growing consensus | Optimal team composition varies |
| Memory in repo files (markdown) | ✅ Strong consensus | Auto-memory systems (evolving) |
| Pre-tool safety guardrails | ✅ Strong consensus | — |
| AGENTS.md as standard | ✅ Growing consensus | Still competing with CLAUDE.md, .cursorrules |
| Knowledge taxonomy (concepts/tech/skills) | 🧪 Aaron's innovation | Not widely adopted yet |
| Persona review panels | 🧪 Aaron's innovation | Emerging in community (Code Panel patterns) |
| Session DB cross-skill contracts | 🧪 Aaron's innovation | Most teams use flat files |
| Compaction strategies | ✅ Growing consensus | Optimal approaches still debated |
| Multi-agent team-in-a-repo (Squad) | 🧪 Experimental | Very new (March 2026) |

### Actionable Insights for Our Project

#### Immediate Wins (adopt now)

1. **Knowledge taxonomy** — Use Aaron's `concepts/` vs `technologies/` vs `skills/` organization. It's proven and well-structured.

2. **Workflow gates** — Decision-Point Gate and Persona Review Gate should be core to our agent configurations. They're battle-tested.

3. **Skill template** — Adopt the standardized skill structure (frontmatter, triggers, inputs, workflow, error recovery, session DB, constraints).

4. **Observability SQL** — Use the shared `skill_execution_log`, `session_config`, `error_breadcrumbs` schema for tracking.

5. **Tool guards** — Port the pre-tool safety architecture (git ops gating, secret leak prevention, fail-open design).

#### Medium-Term (build on foundations)

6. **Session persistence pipeline** — Build the post-tool tracking → session summary → cross-session recall pipeline.

7. **Multi-source review** — Implement the parallel-persona-with-merge pattern from the code-reviewer agent.

8. **AGENTS.md compatibility** — Ensure our configs work as both `.copilot/copilot-instructions.md` and `AGENTS.md` for cross-tool compatibility.

9. **Compaction strategy** — Design explicit context compaction for long sessions per Anthropic's guidance.

#### Strategic (inform architecture decisions)

10. **Context replication over splitting** — Each specialist agent should get full relevant context, not a shared/split window.

11. **Drop-box pattern** — We're already using `decisions.md` (Squad pattern). Lean into structured decision recording.

12. **Progressive disclosure** — Let agents discover context via lightweight references (file paths, queries) rather than pre-loading everything.

13. **Hybrid retrieval** — Pre-load critical context (instructions, knowledge base) + just-in-time retrieval (file reads, searches) per Anthropic's recommendation.
