# Gabriel — History

## Core Context

- **Project:** A Copilot plugin marketplace for iterating on personal agentic engineering infrastructure
- **Role:** Infrastructure
- **Joined:** 2026-03-28T06:21:47.381Z

## Learnings

<!-- Append learnings below -->

### 2026-03-28 — Recon: Prior Infrastructure & Community Practices

**Prior Infrastructure (akubly/.copilot):**
- Aaron's existing Copilot infra is production-grade, built for Windows OS development over months of iteration.
- Architecture: instructions (layered) / agents / knowledge (concepts vs technologies) / skills (with shared template+schema+observability) / hooks (10 covering full session lifecycle).
- Most sophisticated artifacts: code-reviewer agent (multi-source parallel review with 20 rules from 2,670 real reviews), persona-review skill (parallel subagent panels), tool-guards hook (5 safety guards with approval tokens and fail-open design).
- Key reusable patterns: knowledge taxonomy, workflow gates (decision-point + persona review), anti-anchoring discipline, skill template, session DB contracts, observability pipeline, tool guards.
- Domain content (Windows/Razzle/C++/ADO) is not portable — structural patterns are.

**Community Best Practices (2025-2026):**
- Context engineering has superseded prompt engineering. Core insight: context is finite with diminishing returns; optimize for smallest high-signal token set.
- Anthropic recommends: compaction, structured note-taking, sub-agent architectures for long-horizon tasks.
- Four dominant multi-agent orchestration patterns: Supervisor, Pipeline, Swarm, Graph/Network.
- Squad (Brady Gaster, GitHub) demonstrates repo-native multi-agent with drop-box pattern (decisions.md), context replication, and explicit memory in repo files.
- AGENTS.md is emerging as vendor-neutral standard (Linux Foundation). Layer: org → repo → path → agent → personal.
- Kakao's 6 principles map well to Aaron's existing ai-assisted-engineering.md.
- Aaron's knowledge taxonomy (concepts/technologies/skills) and persona review panels are innovations ahead of community consensus.

### 2026-03-28: Cross-Team Recon Awareness

**Graham (Lead)** conducted deep research into Copilot extensibility and identified the seven-layer composition model (Instructions → Skills → Agents → Hooks → MCP → Plugins → ACP). Established plugin.json as canonical distribution unit and MCP as integration standard replacing deprecated GitHub App extensions.

**Roger (Platform Dev)** mapped the three SDK layers (CLI SDK for embedding @github/copilot-sdk, Extensions SDK for distribution @copilot-extensions/preview-sdk, Engine SDK for custom agents @github/copilot-engine-sdk). Confirmed MCP as universal tool protocol and clarified that Extensions serve Graham's identified distribution strategy.

**Rosella (Plugin Dev)** surveyed plugin marketplaces and found awesome-copilot as gravitational center (170+ agents, 240+ skills, 55+ plugins). Identified three canonical formats: `.agent.md`, `SKILL.md` (agentskills.io open standard), `plugin.json` (Claude Code spec). Recommends integrating with awesome-copilot rather than building custom marketplace.

**Outcome:** Gabriel's 7 directly reusable patterns from prior infrastructure now inform all three specialists. Knowledge taxonomy is an innovation to preserve and extend. Skill template pattern validates Rosella's SKILL.md standardization. Workflow gates and anti-anchoring discipline become foundational team practices. Context engineering and context replication from community best practices align with how Squad already works and how Aaron's infrastructure was designed.
